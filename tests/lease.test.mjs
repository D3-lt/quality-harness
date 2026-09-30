// Spec 2026-09-30, "a heavy run knows what else heavy is running" (N3): F-1 to F-12. Each was
// committed as `todo`, red for its fact's reason; ADR-077 T1 and T2 turn their own tests on.
//
// Every run uses a scratch lease directory through `QUALITY_HARNESS_LEASE_DIR`, so no lease is read
// from or left in the machine's. A neighbour is always a SEPARATE holder process that publishes its
// own lease and confirms it is ready: this test process runs `runCheck` itself, and its own lease
// must never be mistaken for a neighbour's (Codex's cold review of ADR-077).
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { stateDir } from '../plugin/scripts/lifecycle.mjs'
import { runCheck } from '../plugin/scripts/qh-check.mjs'
import { campaignEnv, campaignFixture, mutateScript, sidecar, sidecarLines } from './campaign-fixture.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const qhCheck = path.join(repoRoot, 'plugin', 'scripts', 'qh-check.mjs')
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-lease-')))
const holders = []
after(() => {
  for (const holder of holders) holder.kill('SIGKILL')
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
})

let made = 0
/** A project whose declared check is `check`, and a fresh lease directory beside it. */
function project(check = "console.log('ran')") {
  made += 1
  const dir = path.join(scratch, `project-${made}`)
  mkdirSync(dir, { recursive: true })
  spawnSync('git', ['init', '-q', dir], { timeout: 10_000, windowsHide: true })
  writeFileSync(path.join(dir, 'check.mjs'), `${check}\n`)
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'node check.mjs' }))
  const leases = path.join(scratch, `leases-${made}`)
  mkdirSync(leases)
  return { dir, leases }
}
function sink() {
  const chunks = []
  return { write: chunk => { chunks.push(String(chunk)); return true }, text: () => chunks.join('') }
}
const lastRecord = dir => JSON.parse(readFileSync(path.join(stateDir(dir), 'checks.jsonl'), 'utf8').trim().split('\n').pop())
const env = (leases, extra = {}) => {
  const { QUALITY_HARNESS_WAIT: _wait, ...rest } = process.env
  return { ...rest, QUALITY_HARNESS_LEASE_DIR: leases, ...extra }
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(ready, what, ms = 20_000) {
  const deadline = Date.now() + ms
  while (!ready()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await sleep(50)
  }
}

/**
 * A neighbour: a separate process that publishes a running lease under its own pid, then, when
 * `release` appears, writes the release time to `released`, removes its lease and exits.
 */
async function holder(leases, { command = 'node scripts/mutate.mjs --case x', root = '/elsewhere' } = {}) {
  const tag = `${made}-${holders.length}`
  const release = path.join(scratch, `release-${tag}`)
  const released = path.join(scratch, `released-${tag}`)
  const script = `
    const fs = require('node:fs'), path = require('node:path')
    const file = path.join(${JSON.stringify(leases)}, process.pid + '-holder.json')
    fs.writeFileSync(file + '.tmp', JSON.stringify({ pid: process.pid, command: ${JSON.stringify(command)}, root: ${JSON.stringify(root)}, start: new Date().toISOString(), state: 'running' }))
    fs.renameSync(file + '.tmp', file)
    const poll = setInterval(() => {
      if (!fs.existsSync(${JSON.stringify(release)})) return
      fs.writeFileSync(${JSON.stringify(released)}, String(Date.now()))
      fs.rmSync(file, { force: true })
      clearInterval(poll)
      process.exit(0)
    }, 20)`
  const child = spawn(process.execPath, ['-e', script], { stdio: 'ignore', timeout: 120_000, windowsHide: true })
  holders.push(child)
  await until(() => existsSync(path.join(leases, `${child.pid}-holder.json`)), 'the holder\'s lease')
  return { pid: child.pid, release: () => writeFileSync(release, ''), released: () => (existsSync(released) ? Number(readFileSync(released, 'utf8')) : null), child }
}
const leaseFiles = leases => readdirSync(leases).filter(name => name.endsWith('.json'))

test('a run holds a lease while it runs and releases it at its end', async () => {
  const { dir, leases } = project("import { readdirSync, readFileSync } from 'node:fs'; import path from 'node:path'; const d = process.env.QUALITY_HARNESS_LEASE_DIR; console.log('LEASES' + JSON.stringify(readdirSync(d).filter(n => n.endsWith('.json')).map(n => JSON.parse(readFileSync(path.join(d, n), 'utf8')))))")
  const out = sink()
  assert.equal(await runCheck({ cwd: dir, stdout: out, stderr: sink(), env: env(leases) }), 0)
  const held = JSON.parse(out.text().split('LEASES')[1])
  assert.equal(held.length, 1, 'not exactly one lease while the check ran')
  assert.equal(held[0].pid, process.pid)
  assert.equal(held[0].root, dir)
  assert.equal(held[0].state, 'running')
  assert.ok(Number.isFinite(Date.parse(held[0].start)), 'the lease carries no start')
  assert.match(String(held[0].command), /node check\.mjs|qh-check/)
  assert.deepEqual(readdirSync(leases), [], 'the lease, or its temporary file, outlived the run')
})

test('a run beside others names and records them, and its exit and verdict are its own', async () => {
  const { dir, leases } = project('process.exit(3)')
  const first = await holder(leases)
  const second = await holder(leases, { command: 'node plugin/scripts/qh-check.mjs', root: '/other' })
  const err = sink()
  assert.equal(await runCheck({ cwd: dir, stdout: sink(), stderr: err, env: env(leases) }), 3)
  assert.match(err.text(), new RegExp(`running beside node scripts/mutate\\.mjs --case x \\(pid ${first.pid}, since [^)]*, in /elsewhere\\)`))
  assert.match(err.text(), new RegExp(`running beside node plugin/scripts/qh-check\\.mjs \\(pid ${second.pid}, since [^)]*, in /other\\)`))
  const record = lastRecord(dir)
  assert.deepEqual(record.beside.map(entry => entry.pid).sort(), [first.pid, second.pid].sort())
  assert.deepEqual(record.besideAtEnd.map(entry => entry.pid).sort(), [first.pid, second.pid].sort())
  assert.equal(record.verdict, 'failed')
})

test('a dead lease is removed, and an unreadable one is named as unknown and kept', async () => {
  const { dir, leases } = project()
  const gone = spawnSync(process.execPath, ['-e', ''], { timeout: 20_000, windowsHide: true }).pid
  writeFileSync(path.join(leases, `${gone}-gone.json`), JSON.stringify({ pid: gone, command: 'gone', root: '/x', start: new Date().toISOString(), state: 'running' }))
  writeFileSync(path.join(leases, 'broken.json'), '{ not json')
  const err = sink()
  assert.equal(await runCheck({ cwd: dir, stdout: sink(), stderr: err, env: env(leases) }), 0)
  assert.doesNotMatch(err.text(), /running beside gone/)
  assert.equal(existsSync(path.join(leases, `${gone}-gone.json`)), false, 'a dead run\'s lease was kept')
  assert.match(err.text(), /unknown.*broken\.json|broken\.json.*unknown/)
  assert.equal(existsSync(path.join(leases, 'broken.json')), true, 'an unreadable lease was removed')
})

test('a waiting run starts its check only after the running lease is released, and says how long it waited', async () => {
  const { dir, leases } = project("import { writeFileSync } from 'node:fs'; writeFileSync(process.env.FIXTURE_STARTED, String(Date.now()))")
  const started = path.join(scratch, `started-${made}`)
  const neighbour = await holder(leases)
  setTimeout(() => neighbour.release(), 1000)
  const err = sink()
  assert.equal(await runCheck({ cwd: dir, stdout: sink(), stderr: err, env: env(leases, { QUALITY_HARNESS_WAIT: '1', FIXTURE_STARTED: started }) }), 0)
  assert.ok(neighbour.released(), 'the holder never released')
  assert.ok(Number(readFileSync(started, 'utf8')) >= neighbour.released(), 'the check started before the release')
  assert.match(err.text(), /waited \d/)
})

test('a wait past its bound says so and runs, within the bound', async () => {
  const { dir, leases } = project()
  await holder(leases)
  const err = sink()
  const began = Date.now()
  assert.equal(await runCheck({ cwd: dir, stdout: sink(), stderr: err, env: env(leases, { QUALITY_HARNESS_WAIT: '1', QUALITY_HARNESS_WAIT_MAX_S: '1' }) }), 0)
  assert.ok(Date.now() - began < 8_000, `the bound was not kept: ${Date.now() - began} ms`)
  assert.match(err.text(), /stopped waiting/)
  assert.match(err.text(), /running beside/)
})

test('a lease directory that cannot be used is said, and the run proceeds', async () => {
  const { dir } = project('process.exit(3)')
  const file = path.join(scratch, `not-a-directory-${made}`)
  writeFileSync(file, '')
  const err = sink()
  assert.equal(await runCheck({ cwd: dir, stdout: sink(), stderr: err, env: env(file) }), 3, 'the check\'s own exit was not returned')
  assert.match(err.text(), /could not use the lease/)
})

test('the lease directory is the environment\'s, else one under the temp directory', async () => {
  const { leaseDir } = await import('../plugin/scripts/lease.mjs')
  assert.equal(leaseDir({ QUALITY_HARNESS_LEASE_DIR: '/x/y' }), '/x/y')
  assert.equal(leaseDir({}), path.join(os.tmpdir(), 'quality-harness-leases'))
})

test('a signal while waiting releases the lease and runs nothing', { skip: process.platform === 'win32' && 'Windows has no catchable SIGTERM' }, async () => {
  const { dir, leases } = project("import { writeFileSync } from 'node:fs'; writeFileSync(process.env.FIXTURE_STARTED, 'x')")
  const started = path.join(scratch, `started-${made}`)
  const neighbour = await holder(leases)
  const waiter = spawn(process.execPath, [qhCheck], { cwd: dir, env: env(leases, { QUALITY_HARNESS_WAIT: '1', FIXTURE_STARTED: started }), stdio: 'ignore', timeout: 60_000, windowsHide: true })
  const exited = new Promise(resolve => waiter.once('exit', code => resolve(code)))
  await until(() => leaseFiles(leases).length === 2, 'the waiter\'s lease')
  waiter.kill('SIGTERM')
  assert.equal(await exited, 143)
  assert.deepEqual(leaseFiles(leases), [`${neighbour.pid}-holder.json`], 'the waiter\'s lease outlived it')
  assert.equal(existsSync(started), false, 'the check started while waiting')
})

test('two waiters are admitted in ticket order, one at a time', async () => {
  const { dir, leases } = project("import { appendFileSync } from 'node:fs'; appendFileSync(process.env.FIXTURE_LOG, process.env.WHO + ' start ' + Date.now() + '\\n'); await new Promise(r => setTimeout(r, 500)); appendFileSync(process.env.FIXTURE_LOG, process.env.WHO + ' end ' + Date.now() + '\\n')")
  const log = path.join(scratch, `order-${made}`)
  const neighbour = await holder(leases)
  const run = who => new Promise(resolve => spawn(process.execPath, [qhCheck], { cwd: dir, env: env(leases, { QUALITY_HARNESS_WAIT: '1', FIXTURE_LOG: log, WHO: who }), stdio: 'ignore', timeout: 60_000, windowsHide: true }).once('exit', resolve))
  const early = run('early')
  await until(() => leaseFiles(leases).length === 2, 'the first waiter\'s lease')
  await sleep(50)
  const late = run('late')
  await until(() => leaseFiles(leases).length === 3, 'the second waiter\'s lease')
  neighbour.release()
  await Promise.all([early, late])
  const events = readFileSync(log, 'utf8').trim().split('\n').map(line => line.split(' '))
  assert.deepEqual(events.map(([who, what]) => `${who} ${what}`), ['early start', 'early end', 'late start', 'late end'])
})

// ADR-077 T1 S6 found the test above blind to the ticket: its two waiters poll 50 ms apart, so the
// first is admitted and marks itself running before the second looks, and a rule that ignored
// tickets still passed. This one asks `admit` directly, with an earlier waiter's lease present.
test('a waiter never starts ahead of an earlier waiter\'s ticket', async () => {
  const { admit, release, take } = await import('../plugin/scripts/lease.mjs')
  const { leases } = project()
  const earlier = path.join(leases, 'earlier.json')
  writeFileSync(earlier, JSON.stringify({ pid: process.pid, command: 'an earlier waiter', root: '/x', start: new Date(Date.now() - 60_000).toISOString(), state: 'waiting' }))
  const held = take(leases, { command: 'a later waiter', root: '/y', state: 'waiting' })
  assert.equal(held.error, undefined, held.error)
  try {
    const blocked = await admit(leases, held, { maxMs: 1_200 })
    assert.equal(blocked.admitted, false, 'a later ticket started ahead of an earlier waiter')
    rmSync(earlier)
    const turn = await admit(leases, held, { maxMs: 1_200 })
    assert.equal(turn.admitted, true, 'the later waiter was not admitted once the earlier one had gone')
  } finally {
    release(held)
  }
})

test('a campaign holds a lease that records its isolated child, and releases it at its end', async () => {
  const fixture = campaignFixture()
  const side = sidecar()
  const leases = path.join(scratch, `campaign-leases-${made += 1}`)
  mkdirSync(leases)
  const parent = spawn(process.execPath, [mutateScript, '--root', fixture, '--no-cache'], { cwd: fixture, env: campaignEnv({ QUALITY_HARNESS_LEASE_DIR: leases, FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: fixture, FIXTURE_SLOW_MS: '1500' }), stdio: 'ignore', timeout: 120_000, windowsHide: true })
  const exited = new Promise(resolve => parent.once('exit', resolve))
  await until(() => sidecarLines(side).length > 0, 'the campaign\'s suite', 60_000)
  const held = leaseFiles(leases).map(name => JSON.parse(readFileSync(path.join(leases, name), 'utf8')))
  assert.equal(held.length, 1, 'the campaign holds not exactly one lease')
  assert.equal(held[0].pid, parent.pid)
  assert.ok(Number.isInteger(held[0].child), 'the lease does not record the isolated child')
  await exited
  assert.deepEqual(leaseFiles(leases), [], 'the campaign\'s lease outlived it')
})

test('a killed campaign parent\'s lease stays live while its child works', { skip: process.platform === 'win32' && 'Windows ends the child with its parent (ADR-075)' }, async () => {
  const fixture = campaignFixture()
  const side = sidecar()
  const leases = path.join(scratch, `campaign-leases-${made += 1}`)
  mkdirSync(leases)
  const parent = spawn(process.execPath, [mutateScript, '--root', fixture, '--no-cache'], { cwd: fixture, env: campaignEnv({ QUALITY_HARNESS_LEASE_DIR: leases, FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: fixture, FIXTURE_SLOW_MS: '3000' }), stdio: 'ignore', timeout: 120_000, windowsHide: true })
  await until(() => sidecarLines(side).length > 0, 'the campaign\'s suite', 60_000)
  parent.kill('SIGKILL')
  await new Promise(resolve => parent.once('exit', resolve))
  const { dir } = project()
  const err = sink()
  assert.equal(await runCheck({ cwd: dir, stdout: sink(), stderr: err, env: env(leases) }), 0)
  assert.match(err.text(), new RegExp(`running beside [^\\n]*\\(pid ${parent.pid}`), 'the lease of a campaign whose child still works was not named')
  // Bounded: the child's remaining entries finish within the fixture's slow tests.
  const deadline = Date.now() + 90_000
  let named = true
  while (named && Date.now() < deadline) {
    await sleep(500)
    const again = sink()
    await runCheck({ cwd: dir, stdout: sink(), stderr: again, env: env(leases) })
    named = again.text().includes(`pid ${parent.pid}`)
  }
  assert.equal(named, false, 'the lease was still named after the child ended')
  assert.deepEqual(leaseFiles(leases), [], 'the lease outlived the child')
})

test("a campaign's tests and the selftest use a private lease directory", async () => {
  const { childEnv } = await import('../scripts/mutate.mjs')
  const child = childEnv({ QUALITY_HARNESS_LEASE_DIR: '/machine-leases' }, path.join(scratch, 'child-scratch'))
  assert.ok(child.QUALITY_HARNESS_LEASE_DIR && child.QUALITY_HARNESS_LEASE_DIR !== '/machine-leases', 'a campaign\'s tests read the machine\'s leases')
  assert.ok(child.QUALITY_HARNESS_LEASE_DIR.startsWith(path.join(scratch, 'child-scratch')))
  assert.match(readFileSync(path.join(repoRoot, 'scripts', 'selftest.sh'), 'utf8'), /QUALITY_HARNESS_LEASE_DIR=/)
})

test('a campaign asked to wait starts its suite only after the running lease is released', async () => {
  const fixture = campaignFixture()
  const side = sidecar()
  const leases = path.join(scratch, `campaign-leases-${made += 1}`)
  mkdirSync(leases)
  const neighbour = await holder(leases)
  const parent = spawn(process.execPath, [mutateScript, '--root', fixture, '--no-cache', '--wait'], { cwd: fixture, env: campaignEnv({ QUALITY_HARNESS_LEASE_DIR: leases, FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: fixture }), stdio: 'ignore', timeout: 120_000, windowsHide: true })
  const exited = new Promise(resolve => parent.once('exit', resolve))
  await sleep(1500)
  assert.equal(sidecarLines(side).length, 0, 'the campaign ran its suite while another lease was running')
  neighbour.release()
  assert.equal(await exited, 0)
  assert.ok(sidecarLines(side).length > 0, 'the campaign never ran its suite')
})

// The Codex review of the 3.3.0 candidate (4231a77). Each test below is one finding, red before
// its fix. Finding 5 — the child authorised before its lease named it — is an ordering between two
// adjacent statements that no test can land between; its fix is the order.
const leaseModule = () => import('../plugin/scripts/lease.mjs')
const posixOnly = { skip: process.platform === 'win32' && 'POSIX modes, symlinks and signals' }

// Finding 1: another user can pre-create the shared default as a symlink, and a run must not
// publish, or delete, through it.
test('a lease directory that is a symlink is not used, and nothing is written through it', posixOnly, async () => {
  const { dir } = project('process.exit(3)')
  const target = path.join(scratch, `elsewhere-${made}`)
  mkdirSync(target)
  const link = path.join(scratch, `linked-leases-${made}`)
  symlinkSync(target, link)
  const err = sink()
  assert.equal(await runCheck({ cwd: dir, stdout: sink(), stderr: err, env: env(link) }), 3)
  assert.match(err.text(), /could not use the lease/)
  assert.deepEqual(readdirSync(target), [], 'a lease was written through the symlink')
})

// Finding 2: deciding to start and saying so are one step, so a waiter that publishes an earlier
// ticket while another decides cannot be admitted beside it.
test('two waiters cannot both be admitted when one publishes while the other decides', async () => {
  const { release, take, tryAdmit } = await leaseModule()
  const { leases } = project()
  const late = take(leases, { command: 'a later waiter', root: '/y', state: 'waiting' })
  const early = { file: path.join(leases, 'early.json'), lease: { pid: process.pid, command: 'an earlier waiter', root: '/x', start: new Date(Date.now() - 60_000).toISOString(), state: 'waiting' } }
  let earlyAdmitted = null
  const lateAdmitted = tryAdmit(leases, late, { beforeMark: () => {
    writeFileSync(early.file, JSON.stringify(early.lease))
    earlyAdmitted = tryAdmit(leases, early)
  } })
  try {
    assert.equal(lateAdmitted, true, 'the later waiter, alone when it decided, was not admitted')
    assert.equal(earlyAdmitted, false, 'both waiters were admitted: deciding and saying so were not one step')
  } finally {
    release(late)
    rmSync(early.file, { force: true })
  }
})

// Finding 3: a campaign in place installed its signal handlers before its synchronous wait, so a
// SIGTERM during the wait was handled only after the campaign's work had started.
test('a campaign signalled while waiting its turn runs nothing', posixOnly, async () => {
  const fixture = campaignFixture()
  const side = sidecar()
  const leases = path.join(scratch, `campaign-leases-${made += 1}`)
  mkdirSync(leases)
  const neighbour = await holder(leases)
  const parent = spawn(process.execPath, [mutateScript, '--root', fixture, '--no-cache', '--in-place', '--wait'], { cwd: fixture, env: campaignEnv({ QUALITY_HARNESS_LEASE_DIR: leases, FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: fixture }), stdio: 'ignore', timeout: 120_000, windowsHide: true })
  const exited = new Promise(resolve => parent.once('exit', (code, signal) => resolve({ code, signal })))
  await until(() => leaseFiles(leases).length === 2, 'the campaign\'s waiting lease')
  parent.kill('SIGTERM')
  await sleep(300)
  neighbour.release()
  const { code, signal } = await exited
  assert.ok(signal === 'SIGTERM' || code === 143, `the campaign did not end on the signal: ${code} ${signal}`)
  assert.equal(sidecarLines(side).length, 0, 'the campaign ran its suite after it was signalled')
})

// Finding 4: a lease operation that fails is a diagnostic; the check's exit and record stand.
test('a lease that cannot be released leaves the check\'s own exit and record', async () => {
  const real = await leaseModule()
  const { dir, leases } = project('process.exit(3)')
  const err = sink()
  const lease = { ...real, release: () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }) } }
  assert.equal(await runCheck({ cwd: dir, stdout: sink(), stderr: err, env: env(leases), lease }), 3)
  assert.equal(lastRecord(dir).exit, 3, 'the record was not written')
  assert.match(err.text(), /could not release the lease/)
})

// Finding 7: a campaign observes its neighbours at its end as well as at its start.
test('a campaign names at its end a run that began beside it after it started', posixOnly, async () => {
  const fixture = campaignFixture()
  const side = sidecar()
  const leases = path.join(scratch, `campaign-leases-${made += 1}`)
  mkdirSync(leases)
  const parent = spawn(process.execPath, [mutateScript, '--root', fixture, '--no-cache'], { cwd: fixture, env: campaignEnv({ QUALITY_HARNESS_LEASE_DIR: leases, FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: fixture, FIXTURE_SLOW_MS: '1500' }), stdio: ['ignore', 'ignore', 'pipe'], timeout: 120_000, windowsHide: true })
  let said = ''
  parent.stderr.on('data', chunk => { said += chunk })
  const exited = new Promise(resolve => parent.once('exit', resolve))
  await until(() => sidecarLines(side).length > 0, 'the campaign\'s suite', 60_000)
  const late = await holder(leases, { command: 'a later neighbour' })
  await exited
  assert.match(said, new RegExp(`at its end, running beside a later neighbour \\(pid ${late.pid}`))
})

// Finding 8: a bound too large to be a number of milliseconds is no bound at all.
test('a wait bound too large to be a number of milliseconds is the default', async () => {
  const { waitMaxMs } = await leaseModule()
  assert.equal(waitMaxMs({ QUALITY_HARNESS_WAIT_MAX_S: '1e308' }), 1_800_000)
  assert.equal(waitMaxMs({ QUALITY_HARNESS_WAIT_MAX_S: '2' }), 2_000)
})
