// ADR-120 T6: a Stop continues a turn to run the check only when the project declared it. R1 (an unchecked tree) tells the agent
// to run the check; on a check the plugin inferred from a manifest the agent may have no way to act, so it is said to the user
// alone, once. Every other rule keeps ADR-096's delivery. R2 is retired (ADR-128 T1): no turn end names a commit below HEAD.
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fixtureRepo, git, ledgers, runHook, sandbox } from './hook-golden.mjs'

const skip = process.platform === 'win32' && 'the fixtures are the goldens\' and are recorded on POSIX (BACKLOG section 375)'
const DECLARED = { '.quality-harness.json': '{"check":"sh check.sh","fastCheck":"sh check.sh"}\n', 'check.sh': 'exit 0\n', 'src/a.js': 'export const a = 1\n' }
// No .quality-harness.json: the check is inferred from the manifest's test script.
const INFERRED = { 'package.json': '{"scripts":{"test":"true"}}\n', 'src/a.js': 'export const a = 1\n' }
const NONE = { 'src/a.js': 'export const a = 1\n' }
const wrote = file => ({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: file, content: 'x\n' }, tool_response: { filePath: file, success: true } })
const stop = (extra = {}) => ({ hook_event_name: 'Stop', last_assistant_message: 'Done.', ...extra })
const context = said => said.stdout?.hookSpecificOutput?.additionalContext ?? ''
const message = said => said.stdout?.systemMessage ?? ''

// A session with one unchecked write, and (with `commit`) a commit of it followed by a second, uncommitted write.
function session(t, name, files, { commit = false } = {}) {
  const box = sandbox(t)
  const repo = fixtureRepo(box, name, files)
  const id = `${name}-1`
  const hook = payload => runHook(box, repo, id, payload)
  hook({ hook_event_name: 'SessionStart', source: 'startup' })
  const write = file => {
    writeFileSync(path.join(repo, file), `export const x = ${file.length}\n`)
    hook(wrote(path.join(repo, file)))
  }
  write('src/b.js')
  if (commit) {
    git(repo, box, 'add', '-A')
    git(repo, box, 'commit', '-q', '-m', 'work', '--no-gpg-sign')
    write('src/c.js')
  }
  return { repo, hook, write }
}

test('a declared check with unchecked work continues the turn', { skip }, t => {
  const { hook } = session(t, 'declared', DECLARED, { commit: true })
  const said = hook(stop())
  assert.doesNotMatch(context(said), /newly reachable commit/, 'no commit below HEAD is named (ADR-128 T1)')
  assert.match(context(said), /work no `qh-check` has passed on/, 'R1 reaches the agent')
  assert.match(message(said), /qh-check/, 'and the user is shown it')
  assert.equal(context(hook(stop())), '', 'not handed over again on the same tree')
})

test('an inferred check with unchecked work is said to the user once and does not continue the turn', { skip }, t => {
  const { hook, write } = session(t, 'inferred', INFERRED, { commit: true })
  const said = hook(stop())
  assert.equal(said.stdout?.hookSpecificOutput, undefined, `nothing continues the turn: ${JSON.stringify(said.stdout)}`)
  assert.doesNotMatch(message(said), /newly reachable commit/, 'no commit below HEAD is named (ADR-128 T1)')
  assert.match(message(said), /work no `qh-check` has passed on/, 'and R1')
  assert.match(message(said), /\.quality-harness\.json/, 'with how to declare the check')
  const again = hook(stop())
  assert.equal(context(again), '', 'a second Stop does not hand it to the agent')
  assert.equal(message(again), '', 'nor repeat it to the user')
  write('src/d.js')
  const changed = hook(stop())
  assert.equal(context(changed), '', 'a changed tree is still not handed to the agent')
  assert.match(message(changed), /work no `qh-check` has passed on/, 'but is said to the user again')
})

test('an inferred check keeps turnEnd notify user-only, as before', { skip }, t => {
  const { hook } = session(t, 'inferred-notify', { ...INFERRED, '.quality-harness.json': '{"turnEnd":"notify"}\n' })
  const said = hook(stop())
  assert.equal(context(said), '')
  assert.match(message(said), /work no `qh-check` has passed on/)
  assert.equal(message(hook(stop())), '', 'and once')
})

test('the artifact and no-check findings still reach the agent', { skip }, t => {
  // A: an artifact finding with only an inferred check beside it.
  const a = session(t, 'artifact-inferred', INFERRED)
  const bad = path.join(a.repo, 'docs', 'adr', 'ADR-001-bad.md')
  mkdirSync(path.dirname(bad), { recursive: true })
  writeFileSync(bad, '# ADR-001: bad\n\nno status here\n')
  a.hook(wrote(bad))
  const artifact = a.hook(stop())
  assert.match(context(artifact), /Artifact validation failed[\s\S]*ADR-001-bad/, 'A reaches the agent on an inferred check')
  assert.doesNotMatch(context(artifact), /work no `qh-check` has passed on/, 'while the inferred check\'s finding does not')
  // R5: no check at all.
  const none = session(t, 'no-check', NONE)
  const said = none.hook(stop())
  assert.match(context(said), /no check is known here/, 'R5 reaches the agent')
  assert.match(message(said), /no check is known here/)
})
// The dedupe reads the audience a row records: a user-only delivery recorded as reaching the agent would hide the finding from an
// agent that is later asked for it.
test('an inferred finding is recorded as delivered to the user alone, a declared one to both', { skip }, t => {
  const rows = repo => Object.values(ledgers(repo)).flat().filter(row => row.event === 'action.emitted' && (row.rule === 'R1' || row.rule === 'R2'))
  const inferred = session(t, 'rows-inferred', INFERRED, { commit: true })
  inferred.hook(stop())
  const said = rows(inferred.repo)
  assert.deepEqual(said.map(row => row.rule).sort(), ['R1'])
  assert.deepEqual(said.map(row => row.channel), ['user'])
  const declared = session(t, 'rows-declared', DECLARED, { commit: true })
  declared.hook(stop())
  assert.deepEqual(rows(declared.repo).map(row => row.channel), ['both'])
})

// ADR-120 T11: a declared check whose program cannot be found here is no more one the agent can run than an inferred one is. It is
// said to the user alone, once, naming the program; `"turnEnd": "continue"` keeps the continuation for it and for an inferred check.
const declaring = (check, extra = {}) => ({
  '.quality-harness.json': `${JSON.stringify({ check, fastCheck: check, ...extra })}\n`,
  'check.sh': 'exit 0\n', 'src/a.js': 'export const a = 1\n',
})
const UNSTARTABLE = [['bash scripts/missing.sh', /missing\.sh/], ['nosuchtool test', /nosuchtool/]]
const delivered = repo => Object.values(ledgers(repo)).flat().filter(row => row.event === 'action.emitted' && (row.rule === 'R1' || row.rule === 'R2')).map(row => row.channel)

test('a declared check that cannot start continues no turn and is said to the user once', { skip }, t => {
  for (const [check, program] of UNSTARTABLE) {
    const { repo, hook, write } = session(t, `unstartable-${UNSTARTABLE.findIndex(entry => entry[0] === check)}`, declaring(check), { commit: true })
    const said = hook(stop())
    assert.equal(said.stdout?.hookSpecificOutput, undefined, `${check}: nothing continues the turn: ${JSON.stringify(said.stdout)}`)
    assert.doesNotMatch(message(said), /newly reachable commit/, `${check}: no commit below HEAD is named (ADR-128 T1)`)
    assert.match(message(said), /work no `qh-check` has passed on/, `${check}: and R1`)
    assert.match(message(said), program, `${check}: naming the program`)
    const again = hook(stop())
    assert.equal(context(again), '', `${check}: a second Stop does not hand it to the agent`)
    assert.equal(message(again), '', `${check}: nor repeat it to the user`)
    write('src/d.js')
    const changed = hook(stop())
    assert.equal(context(changed), '', `${check}: a changed tree is still not handed to the agent`)
    assert.match(message(changed), /work no `qh-check` has passed on/, `${check}: but is said to the user again`)
    assert.deepEqual(delivered(repo).filter(channel => channel !== 'user'), [], `${check}: recorded as delivered to the user alone`)
  }
})

test('a declared check that can start continues as before', { skip }, t => {
  for (const check of ['node --test', 'npm test', 'sh check.sh', 'bash check.sh']) {
    const { repo, hook } = session(t, `startable-${check.replace(/\W+/g, '-')}`, declaring(check), { commit: true })
    const said = hook(stop())
    assert.doesNotMatch(context(said), /newly reachable commit/, `${check}: no commit below HEAD is named (ADR-128 T1)`)
    assert.match(context(said), /work no `qh-check` has passed on/, `${check}: R1 reaches the agent`)
    assert.equal(context(hook(stop())), '', `${check}: not handed over again on the same tree`)
    assert.deepEqual(delivered(repo), ['both'], `${check}: recorded as delivered to both`)
  }
})

test('turnEnd continue restores the continuation on an inferred and on an unstartable check', { skip }, t => {
  const cases = [
    ['inferred', { ...INFERRED, '.quality-harness.json': '{"turnEnd":"continue"}\n' }],
    ['missing-script', declaring('bash scripts/missing.sh', { turnEnd: 'continue' })],
    ['missing-tool', declaring('nosuchtool test', { turnEnd: 'continue' })],
  ]
  for (const [name, files] of cases) {
    const { repo, hook } = session(t, `continue-${name}`, files, { commit: true })
    const said = hook(stop())
    assert.doesNotMatch(context(said), /newly reachable commit/, `${name}: no commit below HEAD is named (ADR-128 T1)`)
    assert.match(context(said), /work no `qh-check` has passed on/, `${name}: R1 reaches the agent`)
    assert.equal(context(hook(stop())), '', `${name}: not handed over again on the same tree`)
    assert.deepEqual(delivered(repo), ['both'], `${name}: recorded as delivered to both`)
  }
})

test('turnEnd notify keeps an unstartable check user-only, and continue changes nothing for a declared one that starts', { skip }, t => {
  const notify = session(t, 'unstartable-notify', declaring('nosuchtool test', { turnEnd: 'notify' }), { commit: true })
  const said = notify.hook(stop())
  assert.equal(context(said), '')
  assert.match(message(said), /work no `qh-check` has passed on/)
  assert.equal(message(notify.hook(stop())), '', 'and once')
  const startable = session(t, 'startable-continue', declaring('sh check.sh', { turnEnd: 'continue' }), { commit: true })
  assert.match(context(startable.hook(stop())), /work no `qh-check` has passed on/)
  assert.deepEqual(delivered(startable.repo), ['both'])
})
