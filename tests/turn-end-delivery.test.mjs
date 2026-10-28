// ADR-096: turn-end findings reach the agent. A synchronous hook's systemMessage is shown to the user only, so the turn-end rules
// had never reached the agent; at Stop they now go into the agent's context and the turn continues once. These tests pin where each
// finding goes, and that the rulebook says what the hook does.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { fixtureRepo, runHook, runQhCheck, sandbox } from './hook-golden.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// The text of one numbered section of CLAUDE.md, from its heading to the next.
function section(number) {
  const text = readFileSync(path.join(repoRoot, 'CLAUDE.md'), 'utf8')
  const start = text.search(new RegExp(`^## ${number}\\. `, 'm'))
  assert.ok(start >= 0, `CLAUDE.md has a section ${number}`)
  const next = text.slice(start + 1).search(/^## \d+\. /m)
  return next < 0 ? text.slice(start) : text.slice(start, start + 1 + next)
}

test('CLAUDE.md section 3 names a turn that continues as an act, not a refusal', { skip: 'ADR-130: compulsory check policy retired' }, () => {
  const rules = section(3)
  assert.match(rules, /continue[s]? (?:a|the) turn/i, 'section 3 says a hook may continue a turn')
  assert.match(rules, /ADR-096/, 'and names the record that decided it')
  // The list, not a count (the owner, 2026-10-20: a count in CLAUDE.md went stale twice): each sanctioned refusal by its record.
  assert.match(rules, /The sanctioned refusals are the ones listed here, and no others/, 'and lists the sanctioned refusals with no count')
  for (const record of ['ADR-061', 'ADR-060', 'ADR-117']) assert.match(rules, new RegExp(record), `and names ${record}'s refusal`)
})

// The hook program on a fixture, the way a session drives it. Recorded on POSIX like the goldens it sits beside.
const skip = process.platform === 'win32' && 'the fixtures are the goldens\' and are recorded on POSIX (BACKLOG section 375)'
const BASE = { '.quality-harness.json': '{"check":"sh check.sh","fastCheck":"sh check.sh"}\n', 'check.sh': 'exit 0\n', 'src/a.js': 'export const a = 1\n' }
const wrote = file => ({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: file, content: 'x\n' }, tool_response: { filePath: file, success: true } })
const stop = (extra = {}) => ({ hook_event_name: 'Stop', last_assistant_message: 'Done.', ...extra })
const context = said => said.stdout?.hookSpecificOutput?.additionalContext ?? ''
// A session with one unchecked write: started, a file written outside any check.
function unchecked(t, name, files = {}) {
  const box = sandbox(t)
  const repo = fixtureRepo(box, name, { ...BASE, ...files })
  const session = `${name}-1`
  runHook(box, repo, session, { hook_event_name: 'SessionStart', source: 'startup' })
  const file = path.join(repo, 'src', 'b.js')
  writeFileSync(file, 'export const b = 2\n')
  runHook(box, repo, session, wrote(file))
  return { box, repo, session, hook: payload => runHook(box, repo, session, payload) }
}

test('a Stop with unchecked work gives the agent the finding and the user a headline', { skip: 'ADR-130: compulsory check policy retired' }, t => {
  const { hook } = unchecked(t, 'to-agent')
  const said = hook(stop())
  assert.equal(said.stdout?.hookSpecificOutput?.hookEventName, 'Stop', JSON.stringify(said.stdout))
  assert.match(context(said), /qh-check/, 'the finding is in the agent\'s context')
  assert.match(said.stdout?.systemMessage ?? '', /qh-check/, 'the user is shown the same finding, as before')
})

test('a second Stop in the same turn adds nothing', { skip }, t => {
  const { hook } = unchecked(t, 'once-per-turn')
  const said = hook(stop({ stop_hook_active: true }))
  assert.equal(context(said), '', 'a turn that has already continued once ends')
})

test('a finding delivered to the agent for this tree is not delivered again, and a changed tree is said again', { skip: 'ADR-130: compulsory check policy retired' }, t => {
  const { repo, hook } = unchecked(t, 'once-per-tree')
  assert.match(context(hook(stop())), /qh-check/, 'said the first time')
  assert.equal(context(hook(stop())), '', 'not again on the same tree')
  const file = path.join(repo, 'src', 'c.js')
  writeFileSync(file, 'export const c = 3\n')
  hook(wrote(file))
  assert.match(context(hook(stop())), /qh-check/, 'a changed tree is said again')
})

test('an artifact finding imported on an event that cannot reach the agent stays pending for the next Stop', { skip }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'pending', BASE)
  const session = 'pending-1'
  const hook = payload => runHook(box, repo, session, payload)
  hook({ hook_event_name: 'SessionStart', source: 'startup' })
  const bad = path.join(repo, 'docs', 'adr', 'ADR-001-bad.md')
  mkdirSync(path.dirname(bad), { recursive: true })
  writeFileSync(bad, '# ADR-001: bad\n\nno status here\n')
  // A subagent's turn end gates the record and says the finding where only the user sees it; the main agent's Stop must still
  // hand it to the agent, once.
  hook(wrote(bad))
  const atSubagent = hook({ hook_event_name: 'SubagentStop', agent_type: 'general-purpose', last_assistant_message: 'Wrote it.' })
  assert.match(atSubagent.stdout?.systemMessage ?? '', /Artifact validation failed[\s\S]*ADR-001-bad/, 'the finding was first said to the user')
  assert.equal(context(atSubagent), '', 'and not to an agent')
  assert.match(context(hook(stop())), /Artifact validation failed[\s\S]*ADR-001-bad/, 'the finding said only to the user is handed to the agent at Stop')
})

test('the task-evidence nudge has an identity and is said once per tree', { skip }, t => {
  const box = sandbox(t)
  const taskFile = 'docs/adr/ADR-001-x/tasks/T1.md'
  const repo = fixtureRepo(box, 'nudge', { ...BASE, 'docs/adr/ADR-001-x.md': '# ADR-001: x\n\n**Status:** Accepted\n', [taskFile]: '# Task ADR-001-T1\n' })
  const session = 'nudge-1'
  const hook = payload => runHook(box, repo, session, payload)
  hook({ hook_event_name: 'SessionStart', source: 'startup' })
  writeFileSync(path.join(repo, taskFile), '# Task ADR-001-T1\n\nedited\n')
  hook(wrote(path.join(repo, taskFile)))
  assert.equal(runQhCheck(box, repo).exit, 0, 'the check passed on this tree')
  assert.match(context(hook(stop())), /adr-verify/, 'the nudge reaches the agent once')
  assert.equal(context(hook(stop())), '', 'and is not repeated on the same tree')
})

test('SubagentStop output is unchanged', { skip: 'ADR-130: compulsory check policy retired' }, t => {
  const { hook } = unchecked(t, 'subagent')
  const said = hook({ hook_event_name: 'SubagentStop', agent_type: 'general-purpose', last_assistant_message: 'Done.' })
  assert.equal(said.stdout?.hookSpecificOutput, undefined, 'nothing is added to a subagent\'s context')
  assert.match(said.stdout?.systemMessage ?? '', /qh-check/, 'the user is told, as before')
})

test('turnEnd notify keeps a finding user-only, and any other value means agent', { skip: 'ADR-130: compulsory check policy retired' }, t => {
  for (const [value, expected] of [['notify', false], ['shout', true], [undefined, true]]) {
    const config = { check: 'sh check.sh', fastCheck: 'sh check.sh', ...(value === undefined ? {} : { turnEnd: value }) }
    const { hook } = unchecked(t, `turn-end-${value ?? 'none'}`, { '.quality-harness.json': `${JSON.stringify(config)}\n` })
    const said = hook(stop())
    assert.equal(context(said) !== '', expected, `turnEnd ${value ?? '(none)'}: ${JSON.stringify(said.stdout)}`)
    assert.match(said.stdout?.systemMessage ?? '', /qh-check/, 'the user is told either way')
    if (!expected) assert.equal(context(hook(stop())), '', 'and a user-only finding is not repeated as if the agent had never heard it')
  }
})

test('an unreadable project configuration means the default, said as such', { skip }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'turn-end-broken', { ...BASE, '.quality-harness.json': '{"turnEnd": "notify",}\n' })
  const session = 'turn-end-broken-1'
  const hook = payload => runHook(box, repo, session, payload)
  hook({ hook_event_name: 'SessionStart', source: 'startup' })
  // qh-check is the reader that says the file cannot be read; the hook reads it as declaring nothing.
  assert.match(runQhCheck(box, repo).stderr + runQhCheck(box, repo).stdout, /not valid JSON/, 'the file is said to be unreadable')
  const bad = path.join(repo, 'docs', 'adr', 'ADR-001-bad.md')
  mkdirSync(path.dirname(bad), { recursive: true })
  writeFileSync(bad, '# ADR-001: bad\n\nno status here\n')
  hook(wrote(bad))
  assert.match(context(hook(stop())), /Artifact validation failed[\s\S]*ADR-001-bad/, 'an unreadable file declares nothing: the finding still reaches the agent')
})

// Found by the different-lineage review of the T2/T3 code (2026-10-12).
function badRecordGated(t, name) {
  const box = sandbox(t)
  const repo = fixtureRepo(box, name, BASE)
  const session = `${name}-1`
  const hook = payload => runHook(box, repo, session, payload)
  hook({ hook_event_name: 'SessionStart', source: 'startup' })
  const bad = path.join(repo, 'docs', 'adr', 'ADR-001-bad.md')
  mkdirSync(path.dirname(bad), { recursive: true })
  writeFileSync(bad, '# ADR-001: bad\n\nno status here\n')
  hook(wrote(bad))
  // A subagent's turn end runs the pass; its finding is said where only the user sees it.
  assert.match(hook({ hook_event_name: 'SubagentStop', agent_type: 'general-purpose', last_assistant_message: 'Wrote it.' }).stdout?.systemMessage ?? '', /Artifact validation failed[\s\S]*ADR-001-bad/)
  return hook
}

test('a Stop that has already continued its turn adds nothing, even for a finding that arrived since', { skip }, t => {
  const hook = badRecordGated(t, 'continued-once')
  assert.equal(context(hook(stop({ stop_hook_active: true }))), '', 'a turn continued once is not continued again')
  assert.match(context(hook(stop())), /Artifact validation failed[\s\S]*ADR-001-bad/, 'the finding waits for the next turn end')
})

test('a finding handed to a subagent is still the main agent\'s to hear', { skip }, t => {
  const hook = badRecordGated(t, 'subagent-heard')
  const subagent = hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' }, agent_id: 'sub-1', agent_type: 'general-purpose' })
  assert.match(context(subagent), /Artifact validation failed[\s\S]*ADR-001-bad/, 'the subagent was handed it')
  assert.match(context(hook(stop())), /Artifact validation failed[\s\S]*ADR-001-bad/, 'and the main agent still hears it at its Stop')
})

test('turnEnd notify holds when the working directory has been deleted', { skip }, t => {
  const config = '{"check":"sh check.sh","fastCheck":"sh check.sh","turnEnd":"notify"}\n'
  const { box, repo, session } = unchecked(t, 'notify-deleted-cwd', { '.quality-harness.json': config })
  const gone = path.join(repo, 'src', 'gone')
  const said = runHook(box, repo, session, { ...stop(), cwd: gone })
  assert.equal(context(said), '', 'a deleted subdirectory still reads the repository root\'s turnEnd')
})
