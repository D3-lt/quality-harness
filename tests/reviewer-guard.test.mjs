// BACKLOG §135 — a read-only reviewer cannot write through Bash.
//
// Dirty before clean: the guard refuses a write, a commit, and an Edit call
// with exit 2 and a reason; it passes reads, diffs, checks and scratch writes;
// it passes a payload it cannot read. And every agent whose description says
// "never edits" declares the guard in its own frontmatter, on the tools that
// can write — otherwise the contract is a sentence.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { verdict } from '../plugin/scripts/reviewer-guard.mjs'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')
const root = join(repoRoot, 'plugin')
const guard = join(root, 'scripts', 'reviewer-guard.mjs')
const run = input => spawnSync(process.execPath, [guard], { input, encoding: 'utf8', timeout: 30_000 })
const bash = command => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: repoRoot, tool_input: { command } })

test('the guard reads through a shell payload, a command substitution, and an editor (review bypasses)', () => {
  for (const command of ["bash -c 'printf x > outside.txt'", 'echo "$(printf x > outside.txt)"', 'cat `printf x > outside.txt`',
    'vim plugin/README.md', 'nano README.md', 'code plugin/README.md', "sh -c \"sed -i 's/a/b/' README.md\""]) {
    const out = run(JSON.stringify(bash(command)))
    assert.equal(out.status, 2, `${command}: must be refused\n${out.stderr}`)
  }
  // The same shapes with no write inside still pass.
  for (const command of ["bash -c 'git diff HEAD'", 'echo "$(git rev-parse HEAD)"', 'ls `git rev-parse --show-toplevel`']) {
    assert.equal(run(JSON.stringify(bash(command))).status, 0, `${command}: must pass`)
  }
})

test('the guard refuses a write, a publish, and an editing tool, and says why', () => {
  for (const command of ["sed -i 's/a/b/' plugin/scripts/lifecycle.mjs", 'cat > README.md <<EOF\nx\nEOF', 'rm -rf plugin/skills', 'git commit -m x', 'git push origin main']) {
    const out = run(JSON.stringify(bash(command)))
    assert.equal(out.status, 2, `${command}: must be refused\n${out.stderr}`)
    assert.match(out.stderr, /read-only/, command)
    assert.equal(out.stdout, '')
  }
  const edit = run(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Edit', cwd: repoRoot, tool_input: { file_path: 'x' } }))
  assert.equal(edit.status, 2)
  assert.match(edit.stderr, /Edit is not available/)
})

test('the guard passes reads, diffs, checks, and scratch writes under the temp roots', () => {
  const scratch = join(tmpdir(), 'qh-reviewer-scratch')
  for (const command of ['git diff HEAD', 'grep -rn TODO plugin/', 'node --test tests/reviewer-guard.test.mjs', 'git log --oneline -5', `printf x > "${scratch}/notes.txt"`, 'ls -la']) {
    const out = run(JSON.stringify(bash(command)))
    assert.equal(out.status, 0, `${command}: must pass\n${out.stderr}`)
    assert.equal(out.stderr, '', command)
  }
  // Tools other than the writing ones are not this guard's business.
  assert.equal(run(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'x' } })).status, 0)
})

test('a payload the guard cannot read passes: a guard broken on its own bug must not stop a reviewer reading', () => {
  assert.equal(run('not json').status, 0)
  assert.equal(run('').status, 0)
  assert.equal(run(JSON.stringify({ tool_name: 'Bash', tool_input: {} })).status, 0)
  assert.equal(verdict(null), null)
})

test('the plugin-level role list is the agents that say read-only, no more and no fewer', async () => {
  const { READ_ONLY_ROLES, readOnlyRole } = await import('../plugin/scripts/lifecycle.mjs')
  const agents = readdirSync(join(root, 'agents')).filter(name => name.endsWith('.md'))
  const readOnly = agents.filter(name => /never edits|Read-only|read-only/i.test(readFileSync(join(root, 'agents', name), 'utf8').split('\n---')[0]))
    .map(name => name.replace(/\.md$/, '')).sort()
  assert.deepEqual([...READ_ONLY_ROLES].sort(), readOnly)
  assert.equal(readOnlyRole('quality-harness:qh-synthesis'), 'qh-synthesis')
  assert.equal(readOnlyRole('qh-narrow-fixer'), null)
  assert.equal(readOnlyRole(undefined), null)
})

test('every agent that says it never edits declares the guard on every tool that can write', () => {
  const agents = readdirSync(join(root, 'agents')).filter(name => name.endsWith('.md'))
  assert.ok(agents.length >= 3)
  let guarded = 0
  for (const name of agents) {
    const text = readFileSync(join(root, 'agents', name), 'utf8')
    const front = text.split('\n---')[0]
    const readOnly = /never edits|Read-only|read-only/i.test(front)
    const declares = /hooks:\s*\n\s+PreToolUse:/.test(front) && /reviewer-guard\.mjs/.test(front)
    if (readOnly) {
      assert.ok(declares, `${name} says it is read-only and declares no guard`)
      assert.match(front, /matcher:\s*"?Bash\|Edit\|Write\|MultiEdit\|NotebookEdit"?/, `${name}: the guard must cover every tool that writes`)
      assert.doesNotMatch(front, /tools:.*\b(Edit|Write|MultiEdit|NotebookEdit)\b/, `${name}: a read-only role does not list an editing tool`)
      guarded += 1
    } else {
      assert.ok(!declares, `${name} is not read-only and must not carry the guard`)
    }
  }
  assert.ok(guarded >= 3, `the reviewers and the synthesis role are read-only: ${guarded} guarded`)
})
