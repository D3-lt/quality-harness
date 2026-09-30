// Spec 2026-09-29, "a campaign never touches the checkout" (ADR-075 T2, T3): F-8, F-9, F-11 to
// F-16, and ADR-075's own tests. They were committed as `todo` while the spec waited for its
// ADR; each task's first step removed `todo` from its own before it recorded the red run.
//
// Every campaign runs over a fixture repository in the OS temp directory, never over
// this checkout (tests/campaign-fixture.mjs).
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  campaign, campaignEnv, campaignFixture, FIXTURE_FILES, fixtureGit, mutateScript, sidecar, sidecarLines, snapshot, verdicts, worktrees,
} from './campaign-fixture.mjs'
import { readReport } from '../scripts/mutation-cache-merge.mjs'


// The index, the staged diff and the stash list: what an isolated campaign may never write
// (spec F-8). Compared as git reports them, not as the index's bytes, which a status refresh rewrites.
const gitState = dir => ['ls-files -s', 'diff --cached', 'stash list'].map(args => fixtureGit(dir, args.split(' '))).join('\n---\n')

// Until the campaign's processes have ended, a second campaign on its root is refused as in
// flight (spec F-16). Poll a run until it is not, bounded.
async function afterTheOrphan(dir) {
  const until = Date.now() + 60_000
  for (;;) {
    const next = campaign(dir, ['--no-cache'])
    if (next.status !== 2 || !/another run is in flight/.test(next.stderr) || Date.now() > until) return next
    await new Promise(resolve => setTimeout(resolve, 500))
  }
}

test('a campaign leaves the working tree byte-identical and its mutants never appear there', () => {
  const dir = campaignFixture()
  writeFileSync(path.join(dir, 'notes.md'), '# Notes\n\nAn uncommitted edit to a file no entry mutates.\n')
  const side = sidecar()
  const before = snapshot(dir)
  const state = gitState(dir)
  // --no-cache: the verdict cache comes back to the checkout by design (F-12), so it is
  // left out of the byte comparison by not writing one.
  const run = campaign(dir, ['--no-cache'], { FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: dir })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.deepEqual(verdicts(run.stdout), { answer: 'RED', other: 'RED', third: 'RED' })
  const seen = sidecarLines(side)
  assert.ok(seen.length > 0, 'the fixture suite never ran, so nothing was observed')
  // The whole point: a peer reading the checkout mid-run never meets a mutant. Today it
  // does — the mutant is written into the checkout and restored from a journal.
  assert.ok(seen.every(entry => !entry.checkout.includes('() => 43') && !entry.checkout.includes("() => 'y'")),
    'a mutant was in the checkout while the campaign ran')
  assert.deepEqual(snapshot(dir), before)
  assert.equal(gitState(dir), state, 'the campaign wrote the index or the stash list')
})

test('a campaign that cannot isolate stops and names --in-place, writing nothing', () => {
  const dir = campaignFixture({ commit: false })
  const before = snapshot(dir)
  const run = campaign(dir, ['--no-cache'])
  assert.equal(run.status, 2, run.stdout + run.stderr)
  assert.match(run.stderr, /could not isolate/)
  assert.match(run.stderr, /--in-place/)
  assert.deepEqual(snapshot(dir), before, 'a campaign that could not isolate wrote into the checkout')
})

test("a killed campaign's worktree is removed by the next run, and said", async () => {
  const dir = campaignFixture()
  const side = sidecar()
  // Its temp directory is the sidecar's, which the fixture module removes: SIGKILL runs no
  // cleanup, so what the killed campaign made there would otherwise outlive the suite.
  const scratch = path.dirname(side)
  const child = spawn(process.execPath, [mutateScript, '--root', dir, '--no-cache'], {
    cwd: dir,
    env: campaignEnv({ FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: dir, FIXTURE_SLOW_MS: '2000', TMPDIR: scratch, TMP: scratch, TEMP: scratch }),
    stdio: 'ignore', timeout: 60_000, windowsHide: true,
  })
  const exited = new Promise(resolve => child.once('exit', resolve))
  // Wait until the fixture suite is running: an isolated campaign has its worktree by
  // then. Bounded, and it stops at once if the campaign ends first.
  const until = Date.now() + 30_000
  while (sidecarLines(side).length === 0 && child.exitCode === null && child.signalCode === null && Date.now() < until) {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  const leftover = worktrees(dir).find(tree => tree !== dir) ?? null
  child.kill('SIGKILL')
  await exited
  assert.ok(leftover, 'the campaign ran its suite with no worktree, so there was nothing to leave behind')
  assert.ok(existsSync(leftover), 'SIGKILL left the worktree on disk')
  // The parent is gone and its detached child may still be finishing: nothing may remove the
  // worktree from under it, so the next run that is not refused is the one that sweeps.
  const next = await afterTheOrphan(dir)
  assert.equal(next.status, 0, next.stdout + next.stderr)
  assert.match(next.stderr, /removed .*worktree.* left by an earlier run/i)
  assert.ok(!existsSync(leftover), 'the leftover worktree is still on disk')
  assert.deepEqual(worktrees(dir), [dir], 'git still lists the leftover worktree')
})

test("an isolated campaign reuses and returns the checkout's verdict cache", () => {
  const dir = campaignFixture()
  const side = sidecar()
  const env = { FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: dir }
  const first = campaign(dir, ['--case', 'answer'], env)
  assert.equal(first.status, 0, first.stdout + first.stderr)
  const seen = sidecarLines(side)
  assert.ok(seen.length > 0, 'the fixture suite never ran, so nothing was observed')
  assert.ok(seen.every(entry => entry.cwd !== dir), 'the campaign ran its suite in the checkout, not in a worktree')
  assert.ok(existsSync(path.join(dir, '.mutation-cache.json')), 'the verdict did not come back to the checkout')
  const second = campaign(dir, ['--case', 'answer'], env)
  assert.equal(second.status, 0, second.stdout + second.stderr)
  assert.match(second.stdout, /\b0 measured this run; 1 reused\b/)
})

// On Windows no orphan survives to wait on: libuv puts every child it does not detach in a job
// object that ends it with its parent, so killing the parent ends the child at once. Measured on
// CI (run 36707652332, 2026-09-30): the next run found both owners gone and swept at once.
test('a second campaign waits while an orphaned child of the first still runs', { skip: process.platform === 'win32' && 'Windows ends the child with its parent (a libuv job object), so no orphan survives' }, async () => {
  const dir = campaignFixture()
  const side = sidecar()
  const scratch = path.dirname(side)
  const parent = spawn(process.execPath, [mutateScript, '--root', dir, '--no-cache'], {
    cwd: dir,
    env: campaignEnv({ FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: dir, FIXTURE_SLOW_MS: '1500', TMPDIR: scratch, TMP: scratch, TEMP: scratch }),
    stdio: 'ignore', timeout: 60_000, windowsHide: true,
  })
  const exited = new Promise(resolve => parent.once('exit', resolve))
  const until = Date.now() + 30_000
  while (sidecarLines(side).length === 0 && parent.exitCode === null && parent.signalCode === null && Date.now() < until) {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  const tree = worktrees(dir).find(entry => entry !== dir) ?? null
  parent.kill('SIGKILL')
  await exited
  assert.ok(tree, 'the campaign ran its suite with no worktree')
  const second = campaign(dir, ['--no-cache'])
  assert.equal(second.status, 2, `a second campaign ran beside the first one's child:\n${second.stdout}${second.stderr}`)
  assert.match(second.stderr, /another run is in flight/)
  const next = await afterTheOrphan(dir)
  assert.equal(next.status, 0, next.stdout + next.stderr)
  assert.ok(!existsSync(tree), 'the worktree outlived the campaign that owned it')
  assert.deepEqual(worktrees(dir), [dir])
})

test('an isolated campaign runs exactly the entries an in-place one selects', () => {
  const dir = campaignFixture()
  // Timings for --shard: a first run writes them into the checkout's cache.
  const timed = campaign(dir, ['--in-place'])
  assert.equal(timed.status, 0, timed.stdout + timed.stderr)
  const shardInPlace = verdicts(campaign(dir, ['--shard', '1/2', '--no-cache', '--in-place']).stdout)
  const shardIsolated = verdicts(campaign(dir, ['--shard', '1/2', '--no-cache']).stdout)
  assert.ok(Object.keys(shardInPlace).length > 0, 'the in-place shard selected nothing')
  assert.deepEqual(Object.keys(shardIsolated).sort(), Object.keys(shardInPlace).sort(), '--shard 1/2 --no-cache selected differently')
  // An uncommitted edit to both lines of one source: `--changed HEAD` selects the entries whose
  // mutated line was added since HEAD, and not the other source's.
  // --force: the in-place run otherwise refuses the dirty target, as F-2 says.
  writeFileSync(path.join(dir, 'lib.mjs'), FIXTURE_FILES['lib.mjs'].replace(/\n/g, ' // edited\n'))
  const changedInPlace = verdicts(campaign(dir, ['--changed', 'HEAD', '--no-cache', '--in-place', '--force']).stdout)
  const changedIsolated = verdicts(campaign(dir, ['--changed', 'HEAD', '--no-cache']).stdout)
  assert.deepEqual(Object.keys(changedInPlace).sort(), ['answer', 'other'], `--changed HEAD in place selected ${Object.keys(changedInPlace)}`)
  assert.deepEqual(Object.keys(changedIsolated).sort(), ['answer', 'other'], '--changed HEAD selected differently in isolation')
})

test('an uncommitted test edit and an untracked test are graded as an in-place run grades them', () => {
  const dir = campaignFixture()
  const full = FIXTURE_FILES['tests/lib.test.mjs']
  // HEAD's test does not kill `other`; the uncommitted one does. A worktree of HEAD would grade it GREEN.
  writeFileSync(path.join(dir, 'tests', 'lib.test.mjs'), full.replace("test('other is x', () => { assert.equal(other(), 'x') })\n", ''))
  fixtureGit(dir, ['commit', '-qam', 'a weaker test'])
  writeFileSync(path.join(dir, 'tests', 'lib.test.mjs'), full)
  // An untracked test, named by an uncommitted catalogue entry.
  writeFileSync(path.join(dir, 'tests', 'extra.test.mjs'),
    "import assert from 'node:assert/strict'\nimport test from 'node:test'\nimport { answer } from '../lib.mjs'\ntest('extra', () => { assert.equal(answer(), 42) })\n")
  const catalogue = JSON.parse(readFileSync(path.join(dir, 'tests', 'mutations.json'), 'utf8'))
  catalogue.mutations.push({ label: 'extra', file: 'lib.mjs', tests: ['tests/extra.test.mjs'], from: '() => 42', to: '() => 41' })
  writeFileSync(path.join(dir, 'tests', 'mutations.json'), `${JSON.stringify(catalogue, null, 2)}\n`)
  const inPlace = campaign(dir, ['--no-cache', '--in-place'])
  assert.equal(inPlace.status, 0, inPlace.stdout + inPlace.stderr)
  const expected = verdicts(inPlace.stdout)
  assert.equal(expected.other, 'RED', 'the in-place control did not run the uncommitted test')
  assert.equal(expected.extra, 'RED', 'the in-place control did not run the untracked test')
  const isolated = campaign(dir, ['--no-cache'])
  assert.equal(isolated.status, 0, isolated.stdout + isolated.stderr)
  assert.deepEqual(verdicts(isolated.stdout), expected)
})

test('a verdict cache that cannot be written back is left as it was, and said', async () => {
  const mutate = await import('../scripts/mutate.mjs')
  assert.equal(typeof mutate.writeBackCache, 'function', 'scripts/mutate.mjs exports no writeBackCache')
  const dir = path.dirname(sidecar())
  const to = path.join(dir, '.mutation-cache.json')
  writeFileSync(to, '{"entries":{},"measured":[]}\n')
  const from = path.join(dir, 'child-cache.json')
  writeFileSync(from, '{"entries":{"k":{"verdict":"RED"}},"measured":["k"]}\n')
  const said = []
  const failing = { renameSync: () => { throw new Error('EACCES: the rename was refused') } }
  mutate.writeBackCache(from, to, { say: line => said.push(line), fs: failing })
  assert.equal(readFileSync(to, 'utf8'), '{"entries":{},"measured":[]}\n', 'a failed write-back changed the cache')
  assert.match(said.join('\n'), /the verdict cache was not updated: .*EACCES/)
})

// ADR-075: the cache written back is the shape CI's merge job reads. That job exits 0 when it
// refuses a report, so a wrong shape would be silent everywhere else. An in-place run passes this
// today; it guards that isolation keeps the shape.
test("an isolated campaign's written-back cache is one CI's merge job can read", () => {
  const dir = campaignFixture()
  const run = campaign(dir, ['--case', 'answer'])
  assert.equal(run.status, 0, run.stdout + run.stderr)
  const report = readReport(path.join(dir, '.mutation-cache.json'))
  assert.equal(report.error, undefined, `the merge job refuses it: ${report.error}`)
  assert.ok(Object.keys(report.entries).length > 0, 'no verdict came back')
})

// ADR-075 (F-9's signal clause): a campaign stopped by SIGTERM removes its own worktree. Windows
// has no catchable SIGTERM — `kill` there ends the process at once — so on win32 the leftover is
// the next run's to sweep, which is what this asserts there.
test('a campaign stopped with SIGTERM removes its worktree', async () => {
  const dir = campaignFixture()
  const side = sidecar()
  const scratch = path.dirname(side)
  const child = spawn(process.execPath, [mutateScript, '--root', dir, '--no-cache'], {
    cwd: dir,
    env: campaignEnv({ FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: dir, FIXTURE_SLOW_MS: '2000', TMPDIR: scratch, TMP: scratch, TEMP: scratch }),
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, windowsHide: true,
  })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
  const until = Date.now() + 30_000
  while (sidecarLines(side).length === 0 && child.exitCode === null && child.signalCode === null && Date.now() < until) {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  const tree = worktrees(dir).find(entry => entry !== dir) ?? null
  assert.ok(tree, 'the campaign ran its suite with no worktree')
  child.kill('SIGTERM')
  const { code } = await exited
  // An interrupted campaign still says the load it ran under, its end sample taken at the signal (F-10).
  if (process.platform !== 'win32') assert.match(output, /load: .* at start, .* at end/, 'an interrupted campaign said no load')
  if (process.platform === 'win32') {
    const next = await afterTheOrphan(dir)
    assert.equal(next.status, 0, next.stdout + next.stderr)
  } else {
    assert.equal(code, 143, 'a campaign stopped by SIGTERM exits 143')
  }
  assert.ok(!existsSync(tree), 'the worktree outlived its campaign')
  assert.deepEqual(worktrees(dir), [dir])
})

test('an isolated run and an in-place run of the same entries give the same verdicts', () => {
  const dir = campaignFixture()
  const inPlace = campaign(dir, ['--no-cache', '--in-place'])
  assert.equal(inPlace.status, 0, inPlace.stdout + inPlace.stderr)
  const isolated = campaign(dir, ['--no-cache'])
  assert.equal(isolated.status, 0, isolated.stdout + isolated.stderr)
  const expected = verdicts(inPlace.stdout)
  assert.deepEqual(Object.keys(expected).sort(), ['answer', 'other', 'third'])
  assert.deepEqual(verdicts(isolated.stdout), expected)
})

// `QUALITY_HARNESS_PROCESS_LIST` is the seam the ADR adds for "the process list cannot
// be read"; today nothing reads it. Windows lists processes differently, and the ADR
// says which arm it takes there.
test('an in-place campaign names the processes running this checkout, and says when it could not look', async () => {
  if (process.platform === 'win32') {
    // No `ps` on Windows (ADR-075 Out of Scope): the run says it could not look, and runs.
    const dir = campaignFixture()
    const blind = campaign(dir, ['--no-cache', '--in-place'])
    assert.equal(blind.status, 0, blind.stdout + blind.stderr)
    assert.match(blind.stderr, /could not look/)
    return
  }
  const dir = campaignFixture()
  const quiet = campaign(dir, ['--no-cache', '--in-place'])
  assert.equal(quiet.status, 0, quiet.stdout + quiet.stderr)
  assert.doesNotMatch(quiet.stderr, /live for/, 'an exposure line with nobody exposed')
  const sleepers = [1, 2].map(() => spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)', path.join(dir, 'lib.mjs')],
    { stdio: 'ignore', timeout: 60_000, windowsHide: true }))
  try {
    const exposed = campaign(dir, ['--no-cache', '--in-place'])
    assert.equal(exposed.status, 0, exposed.stdout + exposed.stderr)
    assert.match(exposed.stderr, /live for/)
    for (const sleeper of sleepers) assert.match(exposed.stderr, new RegExp(`\\b${sleeper.pid}\\b`))
  } finally {
    for (const sleeper of sleepers) sleeper.kill('SIGKILL')
  }
  const blind = campaign(dir, ['--no-cache', '--in-place'], { QUALITY_HARNESS_PROCESS_LIST: path.join(dir, 'no-such-lister') })
  assert.equal(blind.status, 0, blind.stdout + blind.stderr)
  assert.match(blind.stderr, /could not look/)
})

// ADR-075: the load line is said once whichever way the campaign runs — the isolated child leaves
// it to its parent — and an in-place run says it too (spec F-10).
test('a campaign says its load line once, in place and isolated', () => {
  const dir = campaignFixture()
  for (const mode of [['--in-place'], []]) {
    const run = campaign(dir, ['--no-cache', '--case', 'answer', ...mode])
    assert.equal(run.status, 0, run.stdout + run.stderr)
    const said = `${run.stdout}${run.stderr}`.split('\n').filter(line => line.startsWith('load: '))
    assert.equal(said.length, 1, `${mode.join(' ') || 'an isolated run'} said the load ${said.length} times`)
  }
})

// Codex review of ADR-075: the child's marker exempts it from the in-place checks, so a test the
// child runs — this file's own campaigns among them — must not inherit it.
test('a campaign child does not hand its marker to the tests it runs', async () => {
  const { childEnv } = await import('../scripts/mutate.mjs')
  const env = childEnv({ QUALITY_HARNESS_CAMPAIGN_CHILD: '1', QUALITY_HARNESS_CAMPAIGN_OWNER: 'owner.json', KEPT: 'yes' }, path.dirname(sidecar()))
  assert.equal(env.QUALITY_HARNESS_CAMPAIGN_CHILD, undefined, 'the marker reached the child\'s tests')
  assert.equal(env.QUALITY_HARNESS_CAMPAIGN_OWNER, undefined, 'the owner file reached the child\'s tests')
  assert.equal(env.KEPT, 'yes', 'childEnv dropped what it had no reason to')
})

// Codex review of ADR-075: a parent killed between spawning its child and recording it leaves
// nothing that names the child, so the child waits to be recorded and gives up when it never is.
test('an isolated child whose parent ended before recording it does not start', () => {
  const dir = campaignFixture()
  const side = sidecar()
  const home = path.dirname(side)
  const gone = spawnSync(process.execPath, ['-e', ''], { timeout: 20_000, windowsHide: true }).pid
  const owner = path.join(home, 'owner.json')
  writeFileSync(owner, JSON.stringify({ parent: gone }))
  const selected = path.join(home, 'selected.json')
  writeFileSync(selected, JSON.stringify(['answer']))
  const began = Date.now()
  const run = spawnSync(process.execPath, [mutateScript, '--in-place', '--root', dir, '--selected', selected, '--no-cache'], {
    cwd: dir, encoding: 'utf8', timeout: 90_000, windowsHide: true,
    env: campaignEnv({ QUALITY_HARNESS_CAMPAIGN_CHILD: '1', QUALITY_HARNESS_CAMPAIGN_OWNER: owner, FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: dir }),
  })
  assert.equal(run.status, 2, run.stdout + run.stderr)
  assert.ok(Date.now() - began < 20_000, 'the child waited out its deadline instead of seeing its parent had ended')
  assert.match(run.stderr, /parent ended before it recorded this run/)
  assert.deepEqual(sidecarLines(side), [], 'the unrecorded child ran the suite')
})

// Codex review of ADR-075: the child's loop is synchronous, so a SIGTERM ends only the test run in
// flight and the next starts. The parent ends the rest itself, from the signal. On Windows
// `taskkill /T /F` ends the tree at once, so there is no grace to measure.
test('a campaign stopped with SIGTERM ends within its grace, not after its remaining entries', { skip: process.platform === 'win32' && 'taskkill /T /F ends the whole tree at once on Windows' }, async () => {
  const dir = campaignFixture()
  const side = sidecar()
  const scratch = path.dirname(side)
  const child = spawn(process.execPath, [mutateScript, '--root', dir, '--no-cache'], {
    cwd: dir,
    env: campaignEnv({ FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: dir, FIXTURE_SLOW_MS: '9000', TMPDIR: scratch, TMP: scratch, TEMP: scratch }),
    stdio: 'ignore', timeout: 120_000, windowsHide: true,
  })
  const exited = new Promise(resolve => child.once('exit', resolve))
  // The slow test's first run is its baseline and its second the first mutant's, with the
  // second mutant's still to come: the signal lands during the first mutant.
  const until = Date.now() + 60_000
  while (sidecarLines(side).length < 2 && child.exitCode === null && child.signalCode === null && Date.now() < until) {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  assert.equal(sidecarLines(side).length, 2, 'the first mutant never reached its test')
  const signalled = Date.now()
  child.kill('SIGTERM')
  await exited
  const took = Date.now() - signalled
  // The next mutant's run alone takes 9 s; the grace is 2 s.
  assert.ok(took < 6_500, `the campaign ran on for ${took} ms after SIGTERM`)
  assert.deepEqual(worktrees(dir), [dir])
})

// Codex review of ADR-075: git stores a text file's normalised bytes, so a file the checkout holds
// with CRLF under `eol=lf` checks out as LF. The worktree holds the checkout's bytes (spec F-8).
test('an isolated campaign runs over the bytes in the checkout, not the ones git normalises', () => {
  const dir = campaignFixture()
  writeFileSync(path.join(dir, '.gitattributes'), '*.mjs text eol=lf\n')
  fixtureGit(dir, ['add', '.gitattributes'])
  fixtureGit(dir, ['commit', '-qm', 'attributes'])
  writeFileSync(path.join(dir, 'lib.mjs'), FIXTURE_FILES['lib.mjs'].replace(/\n/g, '\r\n'))
  const side = sidecar()
  // A relative FIXTURE_CHECKOUT is read from the directory the suite ran in: the worktree.
  const run = campaign(dir, ['--no-cache', '--case', 'answer'], { FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: '.' })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  const seen = sidecarLines(side)
  assert.ok(seen.length > 0, 'the fixture suite never ran')
  assert.ok(seen.every(entry => entry.cwd !== dir), 'the suite ran in the checkout')
  assert.ok(seen.every(entry => entry.checkout.includes('\r\n')), 'the worktree held the normalised bytes')
})

// Codex review of ADR-075: every setup step after `worktree add` removes the worktree when it
// fails, and a cache that cannot be read in is not written back over the checkout's.
test('a verdict cache that cannot be read into the worktree is neither reused nor returned, and the worktree goes', () => {
  const dir = campaignFixture()
  // A directory where the cache file belongs: it exists, and it cannot be copied.
  mkdirSync(path.join(dir, '.mutation-cache.json'))
  const run = campaign(dir, ['--case', 'answer'])
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stderr, /the verdict cache could not be read into the worktree/)
  assert.ok(statSync(path.join(dir, '.mutation-cache.json')).isDirectory(), 'the checkout\'s cache was replaced')
  assert.deepEqual(worktrees(dir), [dir])
})

// The overlay copies every tracked file's bytes, so what `git stash create` alone still carries
// into the worktree is a tracked file deleted in the checkout (Codex review of ADR-075, #5).
test('a tracked file deleted in the checkout is absent from the worktree too', () => {
  const dir = campaignFixture()
  rmSync(path.join(dir, 'notes.md'))
  writeFileSync(path.join(dir, 'tests', 'gone.test.mjs'),
    "import assert from 'node:assert/strict'\nimport { existsSync } from 'node:fs'\nimport test from 'node:test'\nimport { answer } from '../lib.mjs'\n"
    + "test('notes are gone', () => { assert.equal(existsSync('notes.md'), false); assert.equal(answer(), 42) })\n")
  const catalogue = JSON.parse(readFileSync(path.join(dir, 'tests', 'mutations.json'), 'utf8'))
  catalogue.mutations = [{ label: 'gone', file: 'lib.mjs', tests: ['tests/gone.test.mjs'], from: '() => 42', to: '() => 41' }]
  writeFileSync(path.join(dir, 'tests', 'mutations.json'), `${JSON.stringify(catalogue, null, 2)}\n`)
  const inPlace = campaign(dir, ['--no-cache', '--in-place', '--force'])
  assert.deepEqual(verdicts(inPlace.stdout), { gone: 'RED' }, `the in-place control:\n${inPlace.stdout}${inPlace.stderr}`)
  const isolated = campaign(dir, ['--no-cache'])
  assert.deepEqual(verdicts(isolated.stdout), { gone: 'RED' }, `the deleted file was back in the worktree:\n${isolated.stdout}${isolated.stderr}`)
})
