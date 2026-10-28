// ADR-111 T3. A check taken on the tree the session began with, in its own ledger (baseline.jsonl, the owner's choice), so
// the turn end can tell "this change broke it" from "it was already red here" — the two cases Stage 5's attempts confused,
// where a red check meant this machine as often as the change. Nothing that reads checks.jsonl may see a baseline.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fixtureRepo, runHook, runQhCheck, sandbox } from './hook-golden.mjs'
import { observe } from '../plugin/scripts/tree-facts.mjs'
import { completionJudgement } from './helpers/node-hooks/completion-rules.mjs'

const skip = process.platform === 'win32' && 'the fixtures run sh checks, as the goldens do (BACKLOG section 375)'
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const ledger = (repo, name) => {
  const file = path.join(repo, '.git', 'quality-harness', name)
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
}
// A check that can fail: `exit 0` declared bare is refused as a constant success, so the command runs a script.
const project = (box, name, script = 'exit 0') => fixtureRepo(box, name, { '.quality-harness.json': '{"check":"sh check.sh"}\n', 'check.sh': `${script}\n`, 'src/a.js': 'export const a = 1\n' })

test('qh-check --baseline records against the starting tree and holds no git lock', { skip }, t => {
  const box = sandbox(t)
  const repo = project(box, 'mode')
  const start = observe(repo).tree
  assert.equal(runQhCheck(box, repo, ['--baseline', start]).exit, 0)
  const [row] = ledger(repo, 'baseline.jsonl')
  assert.equal(row.baseline.tree, start)
  assert.equal(row.baseline.bound, true, 'the tree before and after the run is the starting tree')
  assert.equal(row.verdict, 'passed')
  assert.deepEqual(ledger(repo, 'checks.jsonl'), [], 'a baseline never writes the ledger a pass is read from')
  assert.equal(existsSync(path.join(repo, '.git', 'index.lock')), false)
  // Run again on the same tree: the baseline is taken once.
  runQhCheck(box, repo, ['--baseline', start])
  assert.equal(ledger(repo, 'baseline.jsonl').length, 1, 'one baseline per tree and command')
  // A run whose tree is not the one it was asked about is kept unbound, and says nothing.
  runQhCheck(box, repo, ['--baseline', 'f'.repeat(40)])
  const moved = ledger(repo, 'baseline.jsonl').at(-1)
  assert.equal(moved.baseline.bound, false)
  // An unbound row is not a kept baseline: the same tree asked again runs again.
  runQhCheck(box, repo, ['--baseline', 'f'.repeat(40)])
  assert.equal(ledger(repo, 'baseline.jsonl').length, 3, 'an unbound run does not stand for a baseline')
})

test('only a startup SessionStart starts the baseline, and it waits for nothing', { skip: 'ADR-130: compulsory check policy retired' }, t => {
  const box = sandbox(t)
  const marker = path.join(box.tmp, 'started.json')
  const runner = path.join(box.tmp, 'fake-baseline.mjs')
  // A stand-in for qh-check that records what it was asked and then takes longer than any hook may.
  writeFileSync(runner, `import { appendFileSync } from 'node:fs'\nappendFileSync(${JSON.stringify(marker)}, JSON.stringify(process.argv.slice(2)) + '\\n')\nAtomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000)\n`)
  const env = { QUALITY_HARNESS_BASELINE_RUNNER: runner }
  const repo = project(box, 'start')
  const startTree = observe(repo).tree
  const began = Date.now()
  assert.equal(runHook(box, repo, 's1', { hook_event_name: 'SessionStart', source: 'startup' }, env).exit, 0)
  assert.ok(Date.now() - began < 4500, 'the hook returned before the baseline could have finished')
  for (let i = 0; i < 100 && !existsSync(marker); i++) pause(50)
  assert.deepEqual(readFileSync(marker, 'utf8').trim().split('\n').map(line => JSON.parse(line)), [['--baseline', startTree]])
  for (const source of ['resume', 'compact', 'clear']) runHook(box, repo, 's1', { hook_event_name: 'SessionStart', source }, env)
  const bare = fixtureRepo(box, 'bare', { 'src/a.js': 'export const a = 1\n' })
  runHook(box, bare, 's2', { hook_event_name: 'SessionStart', source: 'startup' }, env)
  pause(500)
  assert.equal(readFileSync(marker, 'utf8').trim().split('\n').length, 1, 'only a startup with a known check starts one')
})

function turnEnd(baselineVerdict, checks = [{ event: 'check.failed', command: 'sh check.sh', before: { tree: 'now' }, after: { tree: 'now' }, seq: 1 }]) {
  const start = { event: 'session.started', observation: { ok: true, tree: 'start', index: 'start', head: 'h0' } }
  const facts = {
    log: Object.assign([start, ...checks], { complete: true }), observation: { ok: true, tree: 'now', index: 'now', head: 'h1' },
    check: 'sh check.sh', root: '/repo', baseline: start.observation, writes: [], status: ['a.js'], commits: [], baselineVerdict,
    sentence: () => 'RUN-SENTENCE', locationKey: () => '/repo', nudge: () => null,
  }
  return completionJudgement(facts, { hook_event_name: 'Stop', cwd: '/repo', last_assistant_message: 'Fixed it.\nSTATUS: done' })
    .actions.find(action => action.rule === 'R1')?.text ?? ''
}

test('a green baseline and a red current run name the regression; a red baseline names the inherited red', () => {
  assert.match(turnEnd('passed'), /passed on the tree this session began with and fails now: this change broke it/)
  assert.match(turnEnd('failed'), /already red on the tree this session began with, so this red says nothing about the change/)
  for (const none of [null, 'unstarted']) {
    assert.doesNotMatch(turnEnd(none), /this change broke it|already red on the tree/, `a baseline of ${none} says neither`)
  }
  // A green current run is not a regression, whatever the baseline said.
  assert.doesNotMatch(turnEnd('passed', [{ event: 'check.passed', after: { tree: 'now' }, seq: 1 }]), /this change broke it/)
  // Codex review of v3.8.44..3c42f633: the red run must be the same command, on a tree that held still through it.
  const red = extra => [{ event: 'check.failed', command: 'sh check.sh', before: { tree: 'now' }, after: { tree: 'now' }, seq: 1, ...extra }]
  assert.doesNotMatch(turnEnd('passed', red({ command: 'sh other.sh' })), /this change broke it/, 'another command proves nothing about this one')
  assert.doesNotMatch(turnEnd('passed', red({ before: { tree: 'elsewhere' } })), /this change broke it/, 'a run the tree moved under is not this tree')
})

// The publish verdict says nothing of a tree unchanged since the session began (ADR-060), so it cannot show the difference;
// the same-tree skip can: a baseline read as a pass would skip the agent's own run on that tree.
test('a baseline pass leaves the same-tree skip as it was', { skip }, t => {
  const box = sandbox(t)
  const repo = project(box, 'readers')
  runHook(box, repo, 'r1', { hook_event_name: 'SessionStart', source: 'startup' })
  runQhCheck(box, repo, ['--baseline', observe(repo).tree])
  assert.equal(ledger(repo, 'baseline.jsonl').at(-1).verdict, 'passed')
  const full = runQhCheck(box, repo)
  assert.match(full.stderr, /qh-check: ran /, 'the same-tree skip does not read the baseline')
})

// The whole path, with qh-check itself as the runner: SessionStart takes the baseline, an edit turns the check red, and the
// turn end names the regression.
test('a session whose check was green at its start and is red after an edit is told the change broke it', { skip: 'ADR-130: compulsory check policy retired' }, t => {
  const box = sandbox(t)
  const repo = project(box, 'e2e', 'test ! -f src/broken')
  const live = { QUALITY_HARNESS_BASELINE_RUNNER: '' }
  runHook(box, repo, 'e1', { hook_event_name: 'SessionStart', source: 'startup' }, live)
  for (let i = 0; i < 200 && !ledger(repo, 'baseline.jsonl').length; i++) pause(50)
  assert.equal(ledger(repo, 'baseline.jsonl').at(-1)?.verdict, 'passed', 'the detached qh-check --baseline ran and passed')
  const broken = path.join(repo, 'src', 'broken')
  writeFileSync(broken, 'x\n')
  runHook(box, repo, 'e1', { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: broken, content: 'x\n' }, tool_response: { filePath: broken, success: true } }, live)
  assert.notEqual(runQhCheck(box, repo).exit, 0)
  const end = runHook(box, repo, 'e1', { hook_event_name: 'Stop', last_assistant_message: 'Fixed it.\nSTATUS: done' }, live)
  assert.match(JSON.stringify(end.stdout), /passed on the tree this session began with and fails now: this change broke it/)
})

// ADR-113 T1's surviving mutant: a row whose tree moved during its run is unbound, and is never read as the baseline, on either
// path. The rows are written here so the bound flag is the only difference between the two sessions.
test('an unbound baseline row names nothing, and the same row bound does', { skip: 'ADR-130: compulsory check policy retired' }, t => {
  const box = sandbox(t)
  const said = bound => {
    const repo = project(box, `bound-${bound}`, 'test ! -f src/broken')
    runHook(box, repo, 'u1', { hook_event_name: 'SessionStart', source: 'startup' })
    const row = { command: 'sh check.sh', verdict: 'passed', baseline: { tree: observe(repo).tree, bound } }
    writeFileSync(path.join(repo, '.git', 'quality-harness', 'baseline.jsonl'), `${JSON.stringify(row)}\n`)
    const broken = path.join(repo, 'src', 'broken')
    writeFileSync(broken, 'x\n')
    runHook(box, repo, 'u1', { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: broken, content: 'x\n' }, tool_response: { filePath: broken, success: true } })
    assert.notEqual(runQhCheck(box, repo).exit, 0)
    return JSON.stringify(runHook(box, repo, 'u1', { hook_event_name: 'Stop', last_assistant_message: 'Fixed it.\nSTATUS: done' }).stdout)
  }
  const regression = /passed on the tree this session began with and fails now: this change broke it/
  assert.doesNotMatch(said(false), regression, 'an unbound row is not a baseline')
  assert.match(said(true), regression, 'the same row bound is')
})

// Codex review of v3.8.44..3c42f633: QUALITY_HARNESS_WAIT=1 made a detached baseline wait up to half an hour for its turn.
test('a baseline never waits for its turn, whatever the environment asks', { skip }, async t => {
  const box = sandbox(t)
  const repo = project(box, 'nowait')
  const states = []
  const lease = {
    leaseDir: () => box.tmp, take: (_dir, held) => { states.push(held.state); return { file: path.join(box.tmp, 'held') } },
    observe: () => null, release: () => {}, besideLines: () => [],
    admit: () => { states.push('admitted after waiting'); return { ok: true } },
  }
  const { runBaseline } = await import('../plugin/scripts/qh-check.mjs')
  const sink = { write: () => true }
  await runBaseline({ tree: observe(repo).tree, cwd: repo, env: { ...process.env, QUALITY_HARNESS_WAIT: '1' }, lease, stdout: sink, stderr: sink })
  assert.deepEqual(states, ['running'])
})
