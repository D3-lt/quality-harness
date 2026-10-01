// ADR-080 (docs/specs/2026-10-01-no-hook-waits-on-the-artifact-pass.md): no lifecycle
// hook waits on the artifact gates. Bound red, `todo` until its tasks turn them green.
//
// The contract these tests read. The pass writes ONE file, its own ledger,
// `.git/quality-harness/passes/<session>.jsonl`, and nothing else: hooks import from it, so the
// session log keeps the writers it has. A pass holds `<session>.lock` beside its ledger, a JSON
// `{ token, pid, deadline }` created exclusively; a lock past its deadline is reclaimed whatever its
// pid says. The runner is replaceable through QUALITY_HARNESS_ARTIFACT_PASS_RUNNER: it is started
// as `node <runner> --artifact-pass <request.json>`, and the request names the session, the
// ledger, the lock, the token and the targets ({ path, blob }). FAKE_RUNNER is that contract,
// driven by FAKE_PASS_MODE, so a test controls when a pass gates, stops and ends.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const plugin = join(repoRoot, 'plugin')
const lifecycle = join(plugin, 'scripts', 'lifecycle.mjs')
const qhCheck = join(plugin, 'scripts', 'qh-check.mjs')
const { NODE_TEST_CONTEXT: _nested, ...baseEnv } = process.env
const todo = 'ADR-080'

const FAKE_RUNNER = `import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
const request = JSON.parse(readFileSync(process.argv[process.argv.indexOf('--artifact-pass') + 1], 'utf8'))
const mode = process.env.FAKE_PASS_MODE ?? 'block'
const dir = process.env.FAKE_PASS_DIR
const write = entry => appendFileSync(request.ledger, JSON.stringify({ at: new Date().toISOString(), pass: request.token, ...entry }) + '\\n')
appendFileSync(dir + '/fake-starts.log', JSON.stringify({ session: request.session, targets: request.targets.map(t => t.path) }) + '\\n')
write({ event: 'pass.started', pid: process.pid, targets: request.targets.map(t => t.path) })
if (mode.startsWith('stop-after:')) {
  for (const t of request.targets.slice(0, Number(mode.split(':')[1]))) write({ event: 'pass.gated', path: t.path, blob: t.blob, complete: true, findings: null })
  process.exit(0) // as if killed: no end, and the lock stays
}
if (mode === 'finding') {
  const t = request.targets[0]
  write({ event: 'pass.gated', path: t.path, blob: t.blob, complete: true, findings: 'FAKE-FINDING about ' + t.path })
}
const end = Date.now() + 60000
while (!existsSync(dir + '/release') && Date.now() < end) await new Promise(r => setTimeout(r, 100))
write({ event: 'pass.ended', reason: 'done' })
rmSync(request.lock, { force: true })
`

function repository(records = 0, config = '{"check": "true"}') {
  const dir = realpathSync(mkdtempSync(join(os.tmpdir(), 'qh-pass-behind-')))
  const git = args => spawnSync('git', args, { cwd: dir, timeout: 10_000, windowsHide: true })
  git(['init', '-q'])
  writeFileSync(join(dir, '.quality-harness.json'), `${config}\n`)
  writeFileSync(join(dir, '.gitignore'), 'fake-*\nrelease\n')
  writeFileSync(join(dir, 'fake-runner.mjs'), FAKE_RUNNER)
  git(['add', '.quality-harness.json', '.gitignore'])
  git(['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'fixture'])
  const paths = []
  for (let n = 1; n <= records; n += 1) {
    const id = String(n).padStart(3, '0')
    mkdirSync(join(dir, 'docs', 'adr'), { recursive: true })
    const file = join(dir, 'docs', 'adr', `ADR-${id}-pass-fixture.md`)
    writeFileSync(file, `# ADR-${id}: Pass fixture\n\n**Status:** Proposed\n\n## Context\n\nFixture.\n`)
    paths.push(file)
  }
  return { dir, paths }
}

const hookOptions = (dir, payload, env, timeout) => ({
  cwd: dir, input: JSON.stringify({ cwd: dir, ...payload }), encoding: 'utf8', timeout, windowsHide: true,
  env: { ...baseEnv, CLAUDE_PLUGIN_ROOT: plugin, ...env },
})
// A hook that waited on a blocked pass would reach this timeout and come back with no status.
function hook(dir, payload, env = {}, timeout = 30_000) {
  const started = Date.now()
  const run = spawnSync(process.execPath, [lifecycle], hookOptions(dir, payload, env, timeout))
  return { ...run, ms: Date.now() - started }
}
function hookAsync(dir, payload, env = {}) {
  return new Promise(done => {
    const { input, ...options } = hookOptions(dir, payload, env, 30_000)
    const child = spawn(process.execPath, [lifecycle], options)
    child.on('close', status => done(status))
    child.stdin.end(input)
  })
}

const fake = (dir, mode) => ({ QUALITY_HARNESS_ARTIFACT_PASS_RUNNER: join(dir, 'fake-runner.mjs'), FAKE_PASS_DIR: dir, FAKE_PASS_MODE: mode })
const state = dir => join(dir, '.git', 'quality-harness')
const lockFile = (dir, session) => join(state(dir), 'passes', `${session}.lock`)
const sessionLog = (dir, session) => join(state(dir), 'sessions', `${session}.jsonl`)
function jsonl(file) {
  try { return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) } catch { return [] }
}
const ledger = (dir, session) => jsonl(join(state(dir), 'passes', `${session}.jsonl`))
const starts = dir => jsonl(join(dir, 'fake-starts.log'))
const gatedInSessionLog = (dir, session) => jsonl(sessionLog(dir, session)).filter(entry => entry.event === 'artifact.gated')
const size = file => { try { return statSync(file).size } catch { return 0 } }
const rel = file => String(file).split(/[\\/]/).slice(-3).join('/')
const release = dir => writeFileSync(join(dir, 'release'), '')
const settle = ms => new Promise(done => setTimeout(done, ms))

async function until(predicate, ms = 60_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (predicate()) return true
    await settle(100)
  }
  return false
}
async function cleanup(dir, session) {
  release(dir)
  await until(() => !existsSync(lockFile(dir, session)), 10_000)
  rmSync(dir, { recursive: true, force: true })
}

const stop = session => ({ hook_event_name: 'Stop', session_id: session, last_assistant_message: 'done' })
const prompt = session => ({ hook_event_name: 'UserPromptSubmit', session_id: session, prompt: 'next' })
const commit = (session, command = 'git commit -m x') =>
  ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, session_id: session })
const BOUNDARIES = [
  ['a publish request', session => commit(session)],
  ['Stop', stop],
  ['SubagentStop', session => ({ hook_event_name: 'SubagentStop', session_id: session, agent_id: 'a1', agent_type: 'general-purpose', last_assistant_message: 'done' })],
  ['TaskCompleted', session => ({ hook_event_name: 'TaskCompleted', session_id: session, task_id: 't1', task_subject: 'fixture' })],
  ['PreCompact', session => ({ hook_event_name: 'PreCompact', session_id: session, trigger: 'auto' })],
]

test('no boundary waits for the artifact pass', { todo }, async () => {
  for (const [name, payload] of BOUNDARIES) {
    const { dir } = repository(3)
    const session = `behind-${name.replace(/\W/g, '')}`
    try {
      const run = hook(dir, payload(session), fake(dir, 'block'))
      assert.notEqual(run.status, null, `${name}: the hook waited on a pass that was blocked (${run.ms} ms)`)
      assert.ok(await until(() => starts(dir).some(entry => entry.session === session), 10_000), `${name}: a pass was started`)
      assert.equal(gatedInSessionLog(dir, session).length, 0, `${name}: nothing was gated in line`)
    } finally { await cleanup(dir, session) }
  }
})

test('one artifact pass runs per session at a time', { todo }, async () => {
  const { dir } = repository(3)
  const session = 'behind-one'
  try {
    const env = fake(dir, 'block')
    await Promise.all([hookAsync(dir, stop(session), env), hookAsync(dir, stop(session), env)])
    assert.ok(await until(() => starts(dir).length >= 1, 10_000), 'a pass was started')
    await settle(1_000)
    assert.equal(starts(dir).length, 1, 'two boundaries at once start one pass')
    release(dir)
    assert.ok(await until(() => !existsSync(lockFile(dir, session)), 10_000), 'the pass released its lock')
    rmSync(join(dir, 'release'))
    // A lock past its deadline is reclaimed whatever its pid says, and this pid is alive.
    writeFileSync(lockFile(dir, session), JSON.stringify({ token: 'stale', pid: process.pid, deadline: Date.now() - 1_000 }))
    hook(dir, stop(session), env)
    assert.ok(await until(() => starts(dir).length === 2, 10_000), 'a lock past its deadline is reclaimed')
  } finally { await cleanup(dir, session) }
})

test('a stopped pass resumes with exactly the paths it did not reach', { todo }, async () => {
  const { dir, paths } = repository(8)
  const session = 'behind-resume'
  try {
    hook(dir, stop(session), { ...fake(dir, 'stop-after:3'), QUALITY_HARNESS_ARTIFACT_PASS_BUDGET_MS: '500' })
    assert.ok(await until(() => ledger(dir, session).filter(entry => entry.event === 'pass.gated').length === 3, 10_000), 'the first pass gated three and stopped')
    assert.ok(existsSync(lockFile(dir, session)), 'a stopped pass leaves its lock')
    await settle(1_500)
    const reached = new Set(ledger(dir, session).filter(entry => entry.event === 'pass.gated').map(entry => rel(entry.path)))
    hook(dir, stop(session), fake(dir, 'block'))
    assert.ok(await until(() => starts(dir).length === 2, 10_000), 'the next boundary reclaimed the lock and started a pass')
    assert.deepEqual(starts(dir)[1].targets.map(rel).sort(), paths.map(rel).filter(file => !reached.has(file)).sort(),
      'it takes exactly the paths without a verdict')
  } finally { await cleanup(dir, session) }
})

test('a pass that cannot start is said, not silent', { todo }, () => {
  const { dir } = repository(3)
  const session = 'behind-unrun'
  try {
    const run = hook(dir, stop(session), { QUALITY_HARNESS_ARTIFACT_PASS_RUNNER: join(dir, 'no-such-runner.mjs') })
    assert.match(`${run.stdout}${run.stderr}`, /UNRUN/)
    assert.equal(existsSync(lockFile(dir, session)), false, 'and it holds no lock')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("a pass's findings reach the next hook once, while the pass still runs", { todo }, async () => {
  const { dir } = repository(1)
  const session = 'behind-finding'
  try {
    hook(dir, stop(session), fake(dir, 'finding'))
    assert.ok(await until(() => ledger(dir, session).some(entry => entry.event === 'pass.gated'), 10_000), 'the finding is in the ledger')
    assert.ok(existsSync(lockFile(dir, session)), 'the pass is still running')
    const first = hook(dir, prompt(session))
    const second = hook(dir, prompt(session))
    assert.match(first.stdout, /FAKE-FINDING/, 'the next hook says it')
    assert.doesNotMatch(second.stdout, /FAKE-FINDING/, 'and the one after does not')
  } finally { await cleanup(dir, session) }
})

test('a read-only reviewer neither imports nor delivers a pass finding', { todo }, async () => {
  const { dir } = repository(1)
  const session = 'behind-reviewer'
  try {
    hook(dir, stop(session), fake(dir, 'finding'))
    assert.ok(await until(() => ledger(dir, session).some(entry => entry.event === 'pass.gated'), 10_000), 'the finding is in the ledger')
    const before = size(sessionLog(dir, session))
    const reviewer = { ...commit(session, 'ls'), agent_type: 'quality-harness:qh-correctness-reviewer', agent_id: 'r1' }
    assert.doesNotMatch(hook(dir, reviewer).stdout, /FAKE-FINDING/, 'the reviewer is not told the parent\'s finding')
    assert.equal(size(sessionLog(dir, session)), before, 'and writes nothing to the parent\'s log')
    assert.match(hook(dir, prompt(session)).stdout, /FAKE-FINDING/, 'the parent hears it at its next hook')
  } finally { await cleanup(dir, session) }
})

test('the pass writes only its own ledger', { todo }, async () => {
  const { dir, paths } = repository(5)
  const session = 'behind-ledger'
  try {
    hook(dir, stop(session))
    const written = size(sessionLog(dir, session))
    assert.ok(await until(() => ledger(dir, session).some(entry => entry.event === 'pass.ended')), 'the shipped pass ended')
    assert.equal(size(sessionLog(dir, session)), written, 'nothing but a hook wrote the session log')
    const gated = ledger(dir, session).filter(entry => entry.event === 'pass.gated')
    assert.deepEqual(gated.map(entry => rel(entry.path)).sort(), paths.map(rel).sort(), 'each path is gated exactly once')
    assert.ok(gated.every(entry => entry.complete === true), 'and each verdict is complete')
  } finally { await cleanup(dir, session) }
})

test('the unchecked advisory is said once per tree and check state', { todo }, () => {
  const { dir } = repository(0, '{"check": "exit 1"}')
  writeFileSync(join(dir, 'notes.txt'), 'the session changed something\n')
  try {
    const mention = commit('behind-advice', 'grep -n commit notes.txt')
    assert.match(hook(dir, mention).stdout, /qh-check/)
    assert.doesNotMatch(hook(dir, mention).stdout, /qh-check/, 'an unchanged advisory is said once')
    spawnSync(process.execPath, [qhCheck], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true, env: { ...baseEnv, CLAUDE_PLUGIN_ROOT: plugin } })
    assert.match(hook(dir, mention).stdout, /qh-check/, 'a new check state is said again')
    writeFileSync(join(dir, 'notes.txt'), 'changed\n')
    assert.match(hook(dir, mention).stdout, /qh-check/, 'a changed tree is said again')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a refused publish is denied every time', { todo }, () => {
  const { dir } = repository(0)
  writeFileSync(join(dir, 'notes.txt'), 'the session changed something\n')
  try {
    for (const attempt of [1, 2]) {
      const run = hook(dir, commit('behind-refusal'))
      assert.equal(JSON.parse(run.stdout).hookSpecificOutput?.permissionDecision, 'deny', `attempt ${attempt} is refused`)
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
