// ADR-117 T1: an agent's hook-visible write into the session repository's own state directory, where qh-check and adr-verify
// keep the evidence, is refused at PreToolUse; reads, the tools' own runs and writes anywhere else pass (CLAUDE.md §16: each
// row that refuses beside the row that must not). `"ledgers": "warn"` in .quality-harness.json advises instead. Through the
// hook, so QUALITY_HARNESS_HOOK_IMPL=go holds the Go core to the same answers.
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
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
