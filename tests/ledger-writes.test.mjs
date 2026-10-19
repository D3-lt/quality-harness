// ADR-117 T1: an agent's hook-visible write into the session repository's own state directory, where qh-check and adr-verify
// keep the evidence, is refused at PreToolUse; reads, the tools' own runs and writes anywhere else pass (CLAUDE.md §16: each
// row that refuses beside the row that must not). `"ledgers": "warn"` in .quality-harness.json advises instead. Through the
// hook, so QUALITY_HARNESS_HOOK_IMPL=go holds the Go core to the same answers.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fixtureRepo, runHook, sandbox } from './hook-golden.mjs'

const skip = process.platform === 'win32' && 'the fixtures run sh checks, as the goldens do (BACKLOG section 375)'
const said = run => run.stdout?.hookSpecificOutput ?? {}

test('a write into the state directory is refused, and a read of it, the tools\' own runs and a write elsewhere are not', { skip }, t => {
  const box = sandbox(t)
  const project = (name, config = '{"check":"sh check.sh"}\n') => {
    const repo = fixtureRepo(box, name, { '.quality-harness.json': config, 'check.sh': 'exit 0\n', 'src/a.js': 'x\n' })
    runHook(box, repo, name, { hook_event_name: 'SessionStart', source: 'startup' })
    mkdirSync(path.join(repo, '.git', 'quality-harness'), { recursive: true })
    writeFileSync(path.join(repo, '.git', 'quality-harness', 'checks.jsonl'), '')
    return repo
  }
  const repo = project('guard')
  const ledger = path.join(repo, '.git', 'quality-harness', 'checks.jsonl')
  const pre = (tool_name, tool_input, target = repo) => said(runHook(box, target, 'guard', { hook_event_name: 'PreToolUse', tool_name, tool_input }))
  const refused = [
    ['Write', { file_path: ledger, content: '{}\n' }],
    ['Edit', { file_path: ledger, old_string: '', new_string: '{}' }],
    ['MultiEdit', { file_path: '.git/quality-harness/checks.jsonl', edits: [] }],
    ['mcp__mrw__mrw_write', { plan: '@@ .git/quality-harness/checks.jsonl 0 create\n{}\n' }],
    ['Bash', { command: `echo '{}' >> ${ledger}` }],
    ['Bash', { command: 'echo x > .git/quality-harness/fast-checks.jsonl' }],
    ['Bash', { command: 'printf x | tee -a .git/quality-harness/baseline.jsonl' }],
    ['Bash', { command: "sh -c 'echo x >> .git/quality-harness/checks.jsonl'" }],
    ['Bash', { command: 'cd src && echo x >| ../.git/quality-harness/checks.jsonl' }],
  ]
  for (const [tool, input] of refused) {
    const answer = pre(tool, input)
    assert.equal(answer.permissionDecision, 'deny', `${tool} ${JSON.stringify(input)} is refused`)
    assert.match(answer.permissionDecisionReason, /ledger guard.*written only by (its|their) tools/, JSON.stringify(answer))
  }
  const passed = [
    ['Bash', { command: `cat ${ledger}` }],
    ['Bash', { command: 'tail -1 .git/quality-harness/checks.jsonl > /dev/null' }],
    ['Bash', { command: 'mrw read .git/quality-harness/checks.jsonl:$' }],
    ['Bash', { command: 'node plugin/scripts/qh-check.mjs 2>&1 | tail -3' }],
    ['Bash', { command: 'python3 plugin/bin/adr-verify docs/x.md > /tmp/out.log' }],
    ['Bash', { command: "cat <<'EOF'\necho x >> .git/quality-harness/checks.jsonl\nEOF" }],
    ['Write', { file_path: path.join(repo, 'src', 'b.js'), content: 'y\n' }],
    ['Write', { file_path: path.join(box.tmp, 'checks.jsonl'), content: '{}\n' }],
  ]
  for (const [tool, input] of passed) assert.notEqual(pre(tool, input).permissionDecision, 'deny', `${tool} ${JSON.stringify(input)} passes`)
  // A target the hook cannot read, built from a variable, is a boundary: not refused, and said.
  const dynamic = pre('Bash', { command: 'echo x >> "$STATE/checks.jsonl"' })
  assert.notEqual(dynamic.permissionDecision, 'deny')
  // Another repository's state directory is not this session's.
  const other = project('other')
  assert.notEqual(pre('Write', { file_path: path.join(other, '.git', 'quality-harness', 'checks.jsonl'), content: '{}\n' }).permissionDecision, 'deny')
  // The opt-out: "ledgers": "warn" advises instead of refusing.
  const warned = project('warned', '{"check":"sh check.sh","ledgers":"warn"}\n')
  const advice = said(runHook(box, warned, 'warned', { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: path.join(warned, '.git', 'quality-harness', 'checks.jsonl'), content: '{}\n' } }))
  assert.notEqual(advice.permissionDecision, 'deny', 'the opt-out does not refuse')
  assert.match(advice.additionalContext ?? '', /ledger guard.*"ledgers": "warn"/, JSON.stringify(advice))
})

// The Codex review of aae06d72..90b9ceaf: forms both hooks let through, each beside the twin that must still pass (§16). The
// repository's own state directory is guarded under a state root as well, since adr-lint reads receipts from it there too.
test('the forms the review found are refused, and their data twins are not', { skip }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'forms', { '.quality-harness.json': '{"check":"sh check.sh"}\n', 'check.sh': 'exit 0\n', 'src/a.js': 'x\n' })
  runHook(box, repo, 'forms', { hook_event_name: 'SessionStart', source: 'startup' })
  const state = path.join(repo, '.git', 'quality-harness')
  mkdirSync(state, { recursive: true })
  writeFileSync(path.join(state, 'receipts.jsonl'), '')
  const pre = (tool_name, tool_input, env = {}) => said(runHook(box, repo, 'forms', { hook_event_name: 'PreToolUse', tool_name, tool_input }, env))
  const q = text => `'${text.replaceAll("'", "'\\''")}'`
  const nested = [1, 2, 3, 4].reduce(inner => `sh -c ${q(inner)}`, 'echo x >> .git/quality-harness/checks.jsonl')
  const link = path.join(box.tmp, 'innocent.txt')
  symlinkSync(path.join(state, 'receipts.jsonl'), link)
  const harmless = path.join(box.tmp, 'harmless.txt')
  writeFileSync(path.join(box.tmp, 'elsewhere.txt'), '')
  symlinkSync(path.join(box.tmp, 'elsewhere.txt'), harmless)
  const refused = [
    ['Bash', { command: 'cd . > .git/quality-harness/receipts.jsonl' }],
    ['Bash', { command: 'echo "$(printf x >> .git/quality-harness/receipts.jsonl)"' }],
    ['Bash', { command: 'echo `printf x >> .git/quality-harness/receipts.jsonl`' }],
    ['Bash', { command: nested }],
    ['Bash', { command: '(cd src); printf x >> .git/quality-harness/receipts.jsonl' }],
    ['Bash', { command: 'cd src | true; printf x >> .git/quality-harness/receipts.jsonl' }],
    ['Bash', { command: `printf x >> ${link}` }],
    ['PowerShell', { command: 'Write-Output x > .git\\quality-harness\\receipts.jsonl' }],
    ['PowerShell', { command: 'Set-Content -Path .git\\quality-harness\\checks.jsonl -Value x' }],
    ['PowerShell', { command: "'x' | Out-File .git/quality-harness/checks.jsonl" }],
    ['PowerShell', { command: 'Set-Location src; Add-Content ..\\.git\\quality-harness\\checks.jsonl x' }],
    ['mcp__mrw__mrw_write', { format: 'search_replace', plan: '.git/quality-harness/receipts.jsonl\n<<<<<<< SEARCH\n=======\n{}\n>>>>>>> REPLACE\n' }],
    ['mcp__mrw__mrw_write', { format: 'search_replace', plan: '<<<<<<< SEARCH .git/quality-harness/receipts.jsonl\n=======\n{}\n>>>>>>> REPLACE\n' }],
    ['mcp__mrw__mrw_write', { grep: '^', sub: '{}', paths: ['.git/quality-harness/receipts.jsonl'] }],
  ]
  // A case-insensitive volume reads another spelling of the directory as the same one; a case-sensitive one has no such file.
  if (existsSync(path.join(repo, '.git', 'QUALITY-HARNESS'))) refused.push(['Bash', { command: 'echo x >> .git/QUALITY-HARNESS/checks.jsonl' }])
  for (const [tool, input] of refused) {
    const answer = pre(tool, input)
    assert.equal(answer.permissionDecision, 'deny', `${tool} ${JSON.stringify(input)} is refused`)
  }
  const root = path.join(box.top, 'state-root')
  const rooted = pre('Write', { file_path: path.join(state, 'receipts.jsonl'), content: '{}\n' }, { QUALITY_HARNESS_STATE_DIR: root })
  assert.equal(rooted.permissionDecision, 'deny', 'under a state root the repository\'s own receipts are guarded too')
  const passed = [
    ['Bash', { command: "echo '$(printf x >> .git/quality-harness/receipts.jsonl)'" }],
    ['Bash', { command: '(cd src); printf x > out.txt' }],
    ['Bash', { command: 'cd src && echo x > notes.txt' }],
    ['Bash', { command: `printf x >> ${harmless}` }],
    ['PowerShell', { command: 'Set-Content -Path notes.txt -Value x' }],
    ['PowerShell', { command: 'Get-Content .git\\quality-harness\\checks.jsonl' }],
    ['mcp__mrw__mrw_write', { format: 'search_replace', plan: 'src/a.js\n<<<<<<< SEARCH\nx\n=======\ny\n>>>>>>> REPLACE\n' }],
    ['mcp__mrw__mrw_write', { grep: '^x$', sub: 'y', paths: ['src'] }],
  ]
  for (const [tool, input] of passed) assert.notEqual(pre(tool, input).permissionDecision, 'deny', `${tool} ${JSON.stringify(input)} passes`)
})

// The verification review of a855f7f7: a command of redirections alone empties a session log, and an empty log loses the veto
// a write after the pass carries, so it is refused like any write. PowerShell's destination is the parameter that names it,
// with a colon or without, or the first positional, never the content. A walk that starts above a guarded directory reaches
// it unless a `.git` stands between, and a link whose target does not exist yet is followed to where it will create it.
test('the verification review\'s forms are refused, and ordinary content writes are not', { skip }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'second', { '.quality-harness.json': '{"check":"sh check.sh"}\n', 'check.sh': 'exit 0\n', 'src/a.js': 'x\n' })
  runHook(box, repo, 'second', { hook_event_name: 'SessionStart', source: 'startup' })
  const state = path.join(repo, '.git', 'quality-harness')
  mkdirSync(state, { recursive: true })
  const pre = (tool_name, tool_input, env = {}) => said(runHook(box, repo, 'second', { hook_event_name: 'PreToolUse', tool_name, tool_input }, env))
  const dangling = path.join(box.tmp, 'later.txt')
  symlinkSync(path.join(state, 'receipts.jsonl.new'), dangling)
  const root = { QUALITY_HARNESS_STATE_DIR: path.join(repo, 'state-root') }
  const refused = [
    ['Bash', { command: '> .git/quality-harness/sessions/previous.jsonl' }, {}],
    ['Bash', { command: 'true; >> .git/quality-harness/checks.jsonl' }, {}],
    ['Bash', { command: `printf x >> ${dangling}` }, {}],
    ['PowerShell', { command: 'Set-Content -Path:.git/quality-harness/checks.jsonl -Value x' }, {}],
    ['PowerShell', { command: 'Out-File -FilePath .git\\quality-harness\\checks.jsonl -InputObject x' }, {}],
    ['PowerShell', { command: 'Set-Content .git/quality-harness/checks.jsonl x' }, {}],
    ['PowerShell', { command: 'Add-Content -Force -LiteralPath .git/quality-harness/checks.jsonl -Value x' }, {}],
    ['PowerShell', { command: 'Out-File -Append .git/quality-harness/checks.jsonl' }, {}],
    ['mcp__mrw__mrw_write', { grep: '^', sub: '{}', paths: ['state-root'] }, root],
    ['mcp__mrw__mrw_write', { grep: '^', sub: '{}' }, root],
  ]
  for (const [tool, input, env] of refused) {
    assert.equal(pre(tool, input, env).permissionDecision, 'deny', `${tool} ${JSON.stringify(input)} ${JSON.stringify(env)} is refused`)
  }
  const passed = [
    ['Bash', { command: '> notes.txt' }, {}],
    ['PowerShell', { command: 'Set-Content -Path notes.txt -Value ".git/quality-harness/checks.jsonl"' }, {}],
    ['PowerShell', { command: 'Out-File -FilePath notes.txt -Encoding utf8 -InputObject .git/quality-harness/checks.jsonl' }, {}],
    ['mcp__mrw__mrw_write', { grep: '^', sub: '{}', paths: ['src'] }, root],
    ['mcp__mrw__mrw_write', { grep: '^x$', sub: 'y' }, {}],
  ]
  for (const [tool, input, env] of passed) {
    assert.notEqual(pre(tool, input, env).permissionDecision, 'deny', `${tool} ${JSON.stringify(input)} ${JSON.stringify(env)} passes`)
  }
})

// The second verification review of 671827fa: a switch list consumed a destination as a switch's value (`-vb`), a one-letter
// parameter went unread, a named destination's positional content was refused, and a relative link was resolved against
// its logical parent rather than its real one. Every parameter value is now a candidate unless the parameter carries content.
test('a PowerShell destination is never taken for a switch\'s value, and a relative link resolves from its real parent', { skip }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'third', { '.quality-harness.json': '{"check":"sh check.sh"}\n', 'check.sh': 'exit 0\n', 'src/a.js': 'x\n' })
  runHook(box, repo, 'third', { hook_event_name: 'SessionStart', source: 'startup' })
  mkdirSync(path.join(repo, '.git', 'quality-harness'), { recursive: true })
  mkdirSync(path.join(repo, '.git', 'nested'), { recursive: true })
  symlinkSync(path.join(repo, '.git', 'nested'), path.join(box.tmp, 'dirlink'))
  symlinkSync('../quality-harness/checks.jsonl', path.join(repo, '.git', 'nested', 'jump'))
  const pre = (tool_name, tool_input) => said(runHook(box, repo, 'third', { hook_event_name: 'PreToolUse', tool_name, tool_input }))
  const refused = [
    ['PowerShell', { command: 'Set-Content -vb .git/quality-harness/checks.jsonl -Value x' }],
    ['PowerShell', { command: 'Set-Content -l .git/quality-harness/checks.jsonl -Value x' }],
    ['PowerShell', { command: 'Out-File -Encoding utf8 .git/quality-harness/checks.jsonl' }],
    ['Bash', { command: `printf x >> ${path.join(box.tmp, 'dirlink', 'jump')}` }],
  ]
  for (const [tool, input] of refused) assert.equal(pre(tool, input).permissionDecision, 'deny', `${tool} ${JSON.stringify(input)} is refused`)
  const passed = [
    ['PowerShell', { command: 'Set-Content -Path notes.txt .git/quality-harness/checks.jsonl' }],
    ['PowerShell', { command: 'Set-Content -Va .git/quality-harness/checks.jsonl -Path notes.txt' }],
  ]
  for (const [tool, input] of passed) assert.notEqual(pre(tool, input).permissionDecision, 'deny', `${tool} ${JSON.stringify(input)} passes`)
})

// The third verification review of f7dc229c: a prefix that names -Filter was taken for -FilePath and the real destination
// after it for content, and a quoted "-Value" was taken for a parameter. Only an unquoted content parameter and a destination
// named in full exclude anything now. `Set-Content notes.txt <ledger path>` is refused as the price (BACKLOG §387).
test('a PowerShell prefix or a quoted word cannot turn a destination into content', { skip }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'fourth', { '.quality-harness.json': '{"check":"sh check.sh"}\n', 'check.sh': 'exit 0\n', 'src/a.js': 'x\n' })
  runHook(box, repo, 'fourth', { hook_event_name: 'SessionStart', source: 'startup' })
  mkdirSync(path.join(repo, '.git', 'quality-harness'), { recursive: true })
  const pre = command => said(runHook(box, repo, 'fourth', { hook_event_name: 'PreToolUse', tool_name: 'PowerShell', tool_input: { command } }))
  for (const command of [
    'Set-Content -Fi checks.jsonl .git/quality-harness/checks.jsonl -Value x',
    'Add-Content -Fil x .git/quality-harness/checks.jsonl -Value y',
    'Set-Content -Value "-Value" .git/quality-harness/checks.jsonl',
    'Out-File -InputObject "-InputObject" .git/quality-harness/checks.jsonl',
    'Set-Content -Path:".git/quality-harness/checks.jsonl" -Value x',
    'Set-Content notes.txt .git/quality-harness/checks.jsonl',
  ]) assert.equal(pre(command).permissionDecision, 'deny', `${command} is refused`)
  for (const command of [
    'Set-Content -Path notes.txt -Value .git/quality-harness/checks.jsonl',
    'Set-Content -LiteralPath notes.txt .git/quality-harness/checks.jsonl',
    'Out-File -FilePath notes.txt -InputObject .git/quality-harness/checks.jsonl',
  ]) assert.notEqual(pre(command).permissionDecision, 'deny', `${command} passes`)
})
