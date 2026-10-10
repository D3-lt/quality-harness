// BACKLOG section 375, stage A. Scripted sessions through the real lifecycle hook, compared with stored
// transcripts (tests/goldens/*.json). They exist so that lifecycle.mjs can be taken apart without anybody having to
// believe a refactor changed nothing: a transcript that differs is a finding. Recorded on POSIX; Windows paths and
// shells say different words for the same state, and its coverage is the rest of the suite until a Windows run of
// these is asked for. QH_GOLDEN_UPDATE=1 rewrites them; read the diff before committing it.
import assert from 'node:assert/strict'
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { expectGolden, fixtureRepo, ledgers, normaliser, runHook, runQhCheck, sandbox } from './hook-golden.mjs'

const skip = process.platform === 'win32' && 'transcripts are recorded on POSIX (BACKLOG section 375)'
const CONFIG = '{"check":"sh check.sh","fastCheck":"sh check.sh"}\n'
const BASE = { '.quality-harness.json': CONFIG, 'check.sh': 'exit 0\n', 'src/a.js': 'export const a = 1\n' }

// Run a list of [name, payload] and keep what each said. A payload with no session uses the scenario's.
function play(box, repo, session, steps, env = {}) {
  return steps.map(([name, payload]) => ({ name, ...runHook(box, repo, session, payload, env) }))
}
const bash = command => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } })
const wrote = (file, content = 'x\n') => ({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: file, content }, tool_response: { filePath: file, success: true } })
const checks = repo => (ledgers(repo)['checks.jsonl'] ?? []).map(row => ({ command: row.command, origin: row.origin, exit: row.exit, verdict: row.verdict }))
const finish = (box, repos, parts) => normaliser(box, repos)(parts)

test('orientation: startup, resume, compact and clear say their standing paragraphs as designed', { skip }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'orient', { ...BASE, 'docs/adr/ADR-001-sample.md': '# ADR-001: Sample\n\n**Status:** Proposed\n\n## Decision\n\nNone yet.\n' })
  const session = 'orient-1'
  const steps = play(box, repo, session, [
    ['startup', { hook_event_name: 'SessionStart', source: 'startup' }],
    ['startup again', { hook_event_name: 'SessionStart', source: 'startup' }],
    ['resume', { hook_event_name: 'SessionStart', source: 'resume' }],
    ['compact', { hook_event_name: 'SessionStart', source: 'compact' }],
    ['clear', { hook_event_name: 'SessionStart', source: 'clear' }],
    ['session end', { hook_event_name: 'SessionEnd', reason: 'other' }],
  ])
  expectGolden(assert, 'orientation', finish(box, [repo], { steps, ledgers: ledgers(repo) }))
})

test('publish: every form of a publish command gets the answer it got when the transcript was recorded', { skip }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'publish', BASE)
  const session = 'publish-1'
  runHook(box, repo, session, { hook_event_name: 'SessionStart', source: 'startup' })
  writeFileSync(path.join(repo, 'src', 'b.js'), 'export const b = 2\n')
  const commands = [
    'git commit -m x', 'git commit -am x', 'git commit --amend --no-edit', "git commit -F - <<'EOF'\nmessage\nEOF",
    'git add -A && git commit -m x', 'git push', 'git push origin main', 'git push --force-with-lease',
    'git -C . commit -m x', 'git -c user.name=a commit -m x', '/usr/bin/git commit -m x', 'command git push', 'env GIT_DIR=.git git commit -m x',
    "bash -c 'git commit -m x'", 'sh -lc "git push"', '(cd src && git commit -m x)', 'cd /tmp && git commit -m x',
    'x=$(git commit -m y)', "git 'commit' -m x", 'git commit-tree HEAD^{tree} -m x',
    'echo "git commit"', 'echo git push', "cat <<'EOF' > note.txt\ngit push\nEOF", 'grep -r "git commit" docs',
    'git status', 'git log --oneline', 'git diff', 'git show HEAD', 'git stash list', 'git fetch',
    'R=$(mktemp -d) && cd "$R" && git init -q && git add -A && git commit -m x',
    'gh pr create --fill', 'npm run build', 'ls -la',
  ]
  const steps = commands.map(command => ({ name: command, ...runHook(box, repo, session, bash(command)) }))
  expectGolden(assert, 'publish-classifier', finish(box, [repo], { steps, ledgers: ledgers(repo) }))
})

test('publish: a full pass, a fast pass and a change after each say what they said when recorded', { skip }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'passes', BASE)
  const session = 'passes-1'
  const out = []
  const attempt = name => { out.push({ name, ...runHook(box, repo, session, bash('git commit -m x')) }) }
  const check = (name, args) => { const run = runQhCheck(box, repo, args); out.push({ name, exit: run.exit }) }
  out.push({ name: 'start', ...runHook(box, repo, session, { hook_event_name: 'SessionStart', source: 'startup' }) })
  writeFileSync(path.join(repo, 'src', 'b.js'), 'export const b = 2\n')
  attempt('commit before any check')
  check('fast check', ['--fast'])
  attempt('commit after a fast pass')
  out.push({ name: 'push after a fast pass', ...runHook(box, repo, session, bash('git push')) })
  check('full check', [])
  attempt('commit after a full pass')
  out.push({ name: 'push after a full pass', ...runHook(box, repo, session, bash('git push')) })
  writeFileSync(path.join(repo, 'src', 'c.js'), 'export const c = 3\n')
  attempt('commit after a further change')
  check('full check again', [])
  check('full check, nothing changed', [])
  expectGolden(assert, 'publish-passes', finish(box, [repo], { steps: out, checks: checks(repo), ledgers: ledgers(repo) }))
})

test('writes and turn ends: what was written, where, and what the turn says about it', { skip }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'writes', { ...BASE, '.gitignore': 'ignored.txt\n' })
  const session = 'writes-1'
  const elsewhere = path.join(box.tmp, 'scratch.txt')
  writeFileSync(elsewhere, 'x\n')
  const linkTarget = path.join(box.tmp, 'linked')
  mkdirSync(linkTarget)
  writeFileSync(path.join(repo, 'src', 'b.js'), 'export const b = 2\n')
  writeFileSync(path.join(repo, 'ignored.txt'), 'x\n')
  const steps = play(box, repo, session, [
    ['start', { hook_event_name: 'SessionStart', source: 'startup' }],
    ['write inside the tree', wrote(path.join(repo, 'src', 'b.js'))],
    ['write an ignored file', wrote(path.join(repo, 'ignored.txt'))],
    ['write outside the tree', wrote(elsewhere)],
    ['turn end, no claim', { hook_event_name: 'Stop', last_assistant_message: 'Edited the file.' }],
    ['turn end, tests claimed', { hook_event_name: 'Stop', last_assistant_message: 'All tests pass and the build is green.' }],
    ['turn end, question', { hook_event_name: 'Stop', last_assistant_message: 'Which file should I change?' }],
  ])
  // The link is made last: an untracked link in the tree is its own finding and would drown the turn ends above.
  symlinkSync(linkTarget, path.join(repo, 'out'))
  steps.push(...play(box, repo, session, [
    ['write through a directory link', wrote(path.join(repo, 'out', 'f.txt'))],
    ['turn end after the link', { hook_event_name: 'Stop', last_assistant_message: 'Done.' }],
  ]))
  expectGolden(assert, 'writes-and-stops', finish(box, [repo], { steps, ledgers: ledgers(repo) }))
})

test('other events: subagents, tasks, compaction, a skill call and an edit to a record', { skip }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'events', { ...BASE, 'docs/adr/ADR-001-sample.md': '# ADR-001: Sample\n\n**Status:** Proposed\n' })
  const session = 'events-1'
  const steps = play(box, repo, session, [
    ['start', { hook_event_name: 'SessionStart', source: 'startup' }],
    ['subagent start', { hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'qh-correctness-reviewer' }],
    ['subagent stop', { hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'qh-correctness-reviewer', last_assistant_message: 'No findings.' }],
    ['task completed', { hook_event_name: 'TaskCompleted', task_id: 't1', task_subject: 'a task' }],
    ['skill call', { hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { skill: 'quality-harness:review' } }],
    ['edit a record', { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(repo, 'docs', 'adr', 'ADR-001-sample.md'), old_string: 'Proposed', new_string: 'Accepted' } }],
    ['pre-compact', { hook_event_name: 'PreCompact', trigger: 'manual' }],
    ['session end', { hook_event_name: 'SessionEnd', reason: 'other' }],
  ])
  expectGolden(assert, 'other-events', finish(box, [repo], { steps, ledgers: ledgers(repo) }))
})
