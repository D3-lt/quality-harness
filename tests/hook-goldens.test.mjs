// BACKLOG section 375, stage A. Scripted sessions through the real lifecycle hook, compared with stored
// transcripts (tests/goldens/*.json). They exist so that lifecycle.mjs can be taken apart without anybody having to
// believe a refactor changed nothing: a transcript that differs is a finding. Recorded on POSIX; Windows paths and
// shells say different words for the same state, and its coverage is the rest of the suite until a Windows run of
// these is asked for. QH_GOLDEN_UPDATE=1 rewrites them; read the diff before committing it.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { GO_GOLDENS, GO_LACKS, exercised, expectGolden, fixtureRepo, goSkip, goSkipFor, goldenFile, ledgers, normaliser, pluginDir, runHook, runQhCheck, sandbox, staleGoGoldens, staleLacks } from './hook-golden.mjs'

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

// What the machine said about itself is not the hook's: load, contention and the processes standing beside a check.
const quiet = text => text.split('\n').filter(line => !/load|beside|contend|unattributable/.test(line)).join('\n')

test('checks: a red check, a same-tree skip, a reuse for prose and an unreadable config say what they said when recorded', { skip }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'checks', { ...BASE, '.quality-harness.json': '{"check":"sh check.sh","fastCheck":"sh check.sh","prose":["README.md"]}\n', 'README.md': 'one\n', 'check.sh': 'exit 1\n' })
  const session = 'checks-1'
  const out = []
  const check = (name, args) => { const run = runQhCheck(box, repo, args); out.push({ name, exit: run.exit, stdout: quiet(run.stdout), stderr: quiet(run.stderr) }) }
  out.push({ name: 'start', ...runHook(box, repo, session, { hook_event_name: 'SessionStart', source: 'startup' }) })
  writeFileSync(path.join(repo, 'src', 'b.js'), 'export const b = 2\n')
  check('a red full check', [])
  out.push({ name: 'commit after a red check', ...runHook(box, repo, session, bash('git commit -m x')) })
  check('a red fast check', ['--fast'])
  writeFileSync(path.join(repo, 'check.sh'), 'exit 0\n')
  check('a green full check', [])
  check('the same tree again', [])
  writeFileSync(path.join(repo, 'README.md'), 'two\n')
  check('after a change to a prose file alone', [])
  out.push({ name: 'commit after the prose reuse', ...runHook(box, repo, session, bash('git commit -m x')) })
  writeFileSync(path.join(repo, '.quality-harness.json'), '{"check": \n')
  check('an unreadable config', [])
  out.push({ name: 'turn end', ...runHook(box, repo, session, { hook_event_name: 'Stop', last_assistant_message: 'All tests pass.' }) })
  expectGolden(assert, 'checks', finish(box, [repo], { steps: out, checks: checks(repo), ledgers: ledgers(repo) }))
})

test('readiness: an accepted record with a ready task, an evidenced one and a proposed record are said as they were', { skip }, t => {
  const box = sandbox(t)
  const record = (n, status) => `# ADR-${n}: decision ${n}\n\n**Status:** ${status}\n\n## Context\n\nx\n`
  const task = id => `# Task ADR-${id}\n\n**Depends-on:** none\n\n## Acceptance\n\n\`\`\`bash\ntrue\n\`\`\`\n\n## Verification Log\n\n`
  const evidenced = '# Task ADR-001-T9\n\n## Acceptance\n\n```bash\ntrue\n```\n\n## Verification Log\n\n- 2026-08-29 · abc1234 · exit 0 · `true` · acceptance-sha256:b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b\n'
  const repo = fixtureRepo(box, 'ready', {
    ...BASE,
    'docs/adr/ADR-001-accepted.md': record('001', 'Accepted'), 'docs/adr/ADR-002-proposed.md': record('002', 'Proposed'),
    'docs/adr/ADR-001-accepted/tasks/T1.md': task('001-T1'), 'docs/adr/ADR-001-accepted/tasks/T9.md': evidenced,
    'docs/adr/ADR-002-proposed/tasks/T1.md': task('002-T1'),
  })
  const session = 'ready-1'
  const steps = play(box, repo, session, [
    ['startup', { hook_event_name: 'SessionStart', source: 'startup' }],
    ['startup again', { hook_event_name: 'SessionStart', source: 'startup' }],
    ['compact', { hook_event_name: 'SessionStart', source: 'compact' }],
    ['a prompt', { hook_event_name: 'UserPromptSubmit', prompt: 'continue' }],
    ['edit a task of the accepted record', { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(repo, 'docs', 'adr', 'ADR-001-accepted', 'tasks', 'T1.md'), old_string: 'true', new_string: 'false' } }],
  ])
  writeFileSync(path.join(repo, 'docs', 'adr', 'ADR-001-accepted', 'tasks', 'T1.md'), task('001-T1').replace('true', 'false'))
  steps.push(...play(box, repo, session, [
    ['wrote the task', wrote(path.join(repo, 'docs', 'adr', 'ADR-001-accepted', 'tasks', 'T1.md'))],
    ['turn end after a task edit', { hook_event_name: 'Stop', last_assistant_message: 'Updated the task.' }],
  ]))
  expectGolden(assert, 'readiness', finish(box, [repo], { steps, ledgers: ledgers(repo) }))
})

test('artifacts: a record written badly and a record written well are gated at the write and at the turn end', { skip }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'artifacts', BASE)
  const session = 'artifacts-1'
  const bad = path.join(repo, 'docs', 'adr', 'ADR-001-bad.md')
  const good = path.join(repo, 'docs', 'adr', 'ADR-002-good.md')
  mkdirSync(path.dirname(bad), { recursive: true })
  const steps = play(box, repo, session, [['start', { hook_event_name: 'SessionStart', source: 'startup' }]])
  writeFileSync(bad, '# ADR-001: bad\n\nno status here\n')
  steps.push(...play(box, repo, session, [['write a malformed record', wrote(bad)], ['turn end, one bad record', { hook_event_name: 'Stop', last_assistant_message: 'Wrote the record.' }]]))
  writeFileSync(good, '# ADR-002: good\n\n**Status:** Proposed\n\n## Context\n\nx\n')
  steps.push(...play(box, repo, session, [['write a fuller record', wrote(good)], ['turn end, two records', { hook_event_name: 'Stop', last_assistant_message: 'Wrote another.' }], ['a prompt', { hook_event_name: 'UserPromptSubmit', prompt: 'next' }]]))
  expectGolden(assert, 'artifacts', finish(box, [repo], { steps, ledgers: ledgers(repo) }))
})

// ADR-110 T1: the tools the matchers name and no scenario above sent. Each is its own path through the hook: a notebook is named by
// `notebook_path`, not `file_path`, and PowerShell goes through the publish lexer as Bash does.
test('edits by every tool the matchers name: before and after Write, Edit, MultiEdit, NotebookEdit and a PowerShell command', { skip }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'tools', { ...BASE, 'nb.ipynb': '{"cells":[]}\n' })
  const session = 'tools-1'
  const file = path.join(repo, 'src', 'a.js')
  const notebook = path.join(repo, 'nb.ipynb')
  const fresh = path.join(repo, 'src', 'new.js')
  const pre = (tool, input) => ({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input })
  const post = (tool, input) => ({ hook_event_name: 'PostToolUse', tool_name: tool, tool_input: input, tool_response: { success: true } })
  const steps = play(box, repo, session, [
    ['start', { hook_event_name: 'SessionStart', source: 'startup' }],
    ['before a Write', pre('Write', { file_path: fresh, content: 'export const n = 1\n' })],
  ])
  writeFileSync(fresh, 'export const n = 1\n')
  steps.push(...play(box, repo, session, [['before an Edit', pre('Edit', { file_path: file, old_string: '1', new_string: '2' })]]))
  writeFileSync(file, 'export const a = 2\n')
  steps.push(...play(box, repo, session, [
    ['after an Edit', post('Edit', { file_path: file, old_string: '1', new_string: '2' })],
    ['before a MultiEdit', pre('MultiEdit', { file_path: file, edits: [{ old_string: '2', new_string: '3' }] })],
  ]))
  writeFileSync(file, 'export const a = 3\n')
  steps.push(...play(box, repo, session, [
    ['after a MultiEdit', post('MultiEdit', { file_path: file, edits: [{ old_string: '2', new_string: '3' }] })],
    ['before a NotebookEdit', pre('NotebookEdit', { notebook_path: notebook, new_source: 'x' })],
  ]))
  writeFileSync(notebook, '{"cells":[{"source":"x"}]}\n')
  steps.push(...play(box, repo, session, [
    ['after a NotebookEdit', post('NotebookEdit', { notebook_path: notebook, new_source: 'x' })],
    ['a PowerShell listing', pre('PowerShell', { command: 'Get-ChildItem' })],
    ['a PowerShell commit', pre('PowerShell', { command: 'git commit -m x' })],
    ['turn end', { hook_event_name: 'Stop', last_assistant_message: 'Edited the files.' }],
  ]))
  expectGolden(assert, 'tools', finish(box, [repo], { steps, ledgers: ledgers(repo) }))
})

// ADR-110 T1: a quoted here-document a reader only copies is data, an unquoted one is not, and one piped into a shell runs.
// Each command is the first a session says anything about, so rule P's dedupe cannot hide what the lexer made of it (the
// heredoc-arm mutant on core/hooks/shellwords.go survived the scenarios above for exactly that reason).
test('heredocs: a quoted body only cat or mrw reads is data, an unquoted one and one piped into sh are not', { skip }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'heredocs', BASE)
  const commands = [
    "cat <<'EOF' > note.txt\ngit push\nEOF",
    'cat <<EOF > note.txt\ngit push\nEOF',
    "mrw write - <<'EOF'\ngit commit\nEOF",
    "cat <<'EOF' | sh\ngit push\nEOF",
  ]
  // Each session starts on the tree as it is and then changes it, so the tree a command meets is unchecked.
  const steps = commands.flatMap((command, n) => {
    const started = play(box, repo, `heredocs-${n}`, [['start', { hook_event_name: 'SessionStart', source: 'startup' }]])
    writeFileSync(path.join(repo, 'src', 'b.js'), `export const b = ${n}\n`)
    return [...started, ...play(box, repo, `heredocs-${n}`, [[command, bash(command)]])]
  })
  expectGolden(assert, 'heredocs', finish(box, [repo], { steps, ledgers: ledgers(repo) }))
})

// Which registered hook (event, and each tool its matcher names) no payload in `sent` reaches.
function uncoveredHooks(hooksJson, sent) {
  const missing = []
  for (const [event, groups] of Object.entries(hooksJson.hooks ?? {})) {
    for (const group of groups) {
      const tools = typeof group.matcher === 'string' && group.matcher ? group.matcher.split('|') : [null]
      for (const tool of tools) {
        const name = tool === null ? event : `${event}:${tool}`
        if (!sent.has(name)) missing.push(name)
      }
    }
  }
  return missing
}

// Stage 5, 2026-10-18: an Opus attempt edited a tracked file, ran `git stash push …; git stash pop`, and ended `STATUS: done`.
// PreToolUse advised that command as a mention of push, and the turn end counted that advice as having said the tree was
// unchecked, so it said nothing. Asserted on what each implementation prints rather than a stored transcript, so a regression
// cannot be recorded as the expected answer.
test('a mention of push before the turn end does not silence it, and a real publish advice still does', { skip }, t => {
  const box = sandbox(t)
  const turn = (name, command) => {
    const repo = fixtureRepo(box, name, BASE)
    const file = path.join(repo, 'src', 'a.js')
    runHook(box, repo, name, { hook_event_name: 'SessionStart', source: 'startup' })
    writeFileSync(file, 'export const a = 2\n')
    runHook(box, repo, name, { hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: file, old_string: '1', new_string: '2' }, tool_response: { filePath: file, success: true } })
    const before = runHook(box, repo, name, bash(command))
    const end = runHook(box, repo, name, { hook_event_name: 'Stop', last_assistant_message: 'Fixed it.\nSTATUS: done' })
    const said = run => run.stdout?.hookSpecificOutput?.additionalContext ?? run.stdout?.hookSpecificOutput?.permissionDecisionReason ?? ''
    return { before: said(before), end: said(end) }
  }
  const mention = turn('mention', "echo 'push later'")
  assert.match(mention.before, /only mentions commit or push/, 'the command is advised as a mention')
  assert.match(mention.end, /Changed paths: src\/a\.js/, 'the turn end still names the unchecked work')
  const publish = turn('commit', 'git commit -am x')
  assert.match(publish.before, /names commit or push/, 'a real commit is advised on this tree')
  assert.equal(publish.end, '', 'the turn end does not repeat what the publish advice said (ADR-060)')
  // A commit into a repository the command creates, and one into another repository, are advised with the same condition.
  const fresh = turn('fresh', 'R=$(mktemp -d) && cd "$R" && git init -q && git add -A && git commit -m x')
  assert.match(fresh.before, /repository the same command creates/, 'the fresh-repository advice is given')
  assert.match(fresh.end, /Changed paths: src\/a\.js/, 'a fresh-repository advice does not silence the turn end')
  const other = fixtureRepo(box, 'other', BASE)
  const foreign = turn('foreign', `git -C ${other} commit -am x`)
  assert.match(foreign.before, /another repository is advised/, 'the other-repository advice is given')
  assert.match(foreign.end, /Changed paths: src\/a\.js/, 'an other-repository advice does not silence the turn end')
})

// ADR-111 T2, through the hook: a red check is said as failed at the turn end, and a changed tree in a project with no
// declared or inferred check is said once instead of not at all.
test('a red check then done, and a changed tree with no check then done, are said at the turn end', { skip: skip || goSkip('a red check then done, and a changed tree with no check then done, are said at the turn end') }, t => {
  const box = sandbox(t)
  const end = (repo, name) => {
    const file = path.join(repo, 'src', 'a.js')
    runHook(box, repo, name, { hook_event_name: 'SessionStart', source: 'startup' })
    writeFileSync(file, 'export const a = 2\n')
    runHook(box, repo, name, { hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: file, old_string: '1', new_string: '2' }, tool_response: { filePath: file, success: true } })
    return repo
  }
  const stop = (repo, name) => runHook(box, repo, name, { hook_event_name: 'Stop', last_assistant_message: 'Fixed it.\nSTATUS: done' }).stdout?.hookSpecificOutput?.additionalContext ?? ''
  const red = end(fixtureRepo(box, 'red', { ...BASE, 'check.sh': 'exit 1\n' }), 'red')
  assert.notEqual(runQhCheck(box, red).exit, 0, 'the check is red')
  assert.match(stop(red, 'red'), /the last `qh-check` on this turn's work failed/)
  const bare = end(fixtureRepo(box, 'bare', { 'src/a.js': 'export const a = 1\n' }), 'bare')
  assert.match(stop(bare, 'bare'), /the tree changed since this session began, and no check is known here/)
})

// ADR-111 T2: where the Go core answers a recorded scenario another way, its transcript is kept beside the shared one and named
// with the rule it lacks, so the rest of that scenario still runs against Go; a Go golden that went stale is red. The list is
// empty since ADR-113 T1, so a planted one shows the mechanism.
test('a Go golden is kept only where the frozen core answers differently, and names the rule it lacks', () => {
  const planted = new Map([['checks', 'ADR-000']])
  assert.match(goldenFile('go', 'checks', planted), /goldens[\\/]go[\\/]checks\.json$/)
  assert.doesNotMatch(goldenFile('node', 'checks', planted), /[\\/]go[\\/]/, 'the Node path reads the shared golden')
  assert.doesNotMatch(goldenFile('go', 'orientation', planted), /[\\/]go[\\/]/, 'a golden Go answers the same way is shared')
  assert.deepEqual(staleGoGoldens(new Map([['orientation', 'ADR-000']])), ['orientation'], 'a named Go golden with no file is stale')
  assert.deepEqual(staleGoGoldens(), [], 'every Go golden exists and differs from the shared one')
  for (const [name, why] of GO_GOLDENS) assert.match(why, /ADR-\d+/, `${name} names the record whose rule Go lacks`)
})

// ADR-111 T4: the Go core is frozen at its parity while the Node path gains rules. A test of a rule Go lacks is skipped by
// name under the Go runner, with its reason, and every other test runs against Go as before; a name nothing tests is red.
test('a rule the Go core lacks is skipped by name with its reason, and a stale name is red', () => {
  const lacks = new Map([['a listed rule', 'ADR-111 T2']])
  assert.match(String(goSkipFor('go', lacks, 'a listed rule')), /Go core lacks .*ADR-111 T2/)
  assert.equal(goSkipFor('go', lacks, 'an unlisted rule'), false, 'an unlisted test still runs against Go')
  assert.equal(goSkipFor('node', lacks, 'a listed rule'), false, 'the Node path is never skipped')
  const sources = ['tests/hook-goldens.test.mjs', 'tests/qh-core-parity.test.mjs'].map(file => readFileSync(path.join(pluginDir, '..', file), 'utf8'))
  assert.deepEqual(staleLacks(new Map([['no test has this title', 'r']]), sources), ['no test has this title'])
  assert.deepEqual(staleLacks(GO_LACKS, sources), [], 'every name the list skips is a test that exists')
})

// ADR-113 T2: mrw's MCP write is a write. A read-only reviewer is refused it, the main agent is not, and PostToolUse records
// the path its plan names.
test('mrw writes: the read-only guard and the write record see an mrw MCP write', { skip }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'mrw', BASE)
  const session = 'mrw-1'
  const write = { tool_name: 'mcp__mrw__mrw_write', tool_input: { plan: '@@ src/a.js 1 replace\nexport const a = 2\n' } }
  const steps = play(box, repo, session, [
    ['start', { hook_event_name: 'SessionStart', source: 'startup' }],
    ['a reviewer writes through mrw', { hook_event_name: 'PreToolUse', agent_type: 'quality-harness:qh-correctness-reviewer', ...write }],
    ['the main agent writes through mrw', { hook_event_name: 'PreToolUse', ...write }],
  ])
  writeFileSync(path.join(repo, 'src', 'a.js'), 'export const a = 2\n')
  steps.push(...play(box, repo, session, [
    ['the write is recorded', { hook_event_name: 'PostToolUse', ...write, tool_response: { ok: true } }],
    ['turn end', { hook_event_name: 'Stop', last_assistant_message: 'Edited it.' }],
  ]))
  expectGolden(assert, 'mrw-writes', finish(box, [repo], { steps, ledgers: ledgers(repo) }))
})

// Declared last on purpose: node:test runs one file's tests in order, so this reads what every scenario above sent. Run alone
// (a name filter), it sees nothing sent and is red, which is the honest answer to "did the goldens reach every hook".
test('every registered hook event has a golden', { skip }, () => {
  const hooks = JSON.parse(readFileSync(path.join(pluginDir, 'hooks', 'hooks.json'), 'utf8'))
  assert.deepEqual(uncoveredHooks(hooks, exercised), [], 'a registered hook that no golden scenario sends')
  // The dirty twin: an event no scenario sends, in a copy of the registry, is named.
  const extra = structuredClone(hooks)
  extra.hooks.NoScenarioSendsThis = [{ hooks: [{ type: 'command', command: 'node' }] }]
  extra.hooks.PostToolUse = [...extra.hooks.PostToolUse, { matcher: 'NoSuchTool', hooks: [] }]
  assert.deepEqual(uncoveredHooks(extra, exercised), ['PostToolUse:NoSuchTool', 'NoScenarioSendsThis'])
})
