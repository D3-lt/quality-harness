// BACKLOG §135, ADR-060 — a read-only reviewer cannot edit, commit or push.
//
// Dirty before clean: the guard refuses an editing tool and any Bash command that
// names commit or push as a word, wrapped or not, with exit 2 and a reason; it
// passes every other command, writes included, because those are reported when
// the reviewer finishes; it passes a payload it cannot read. And every agent whose
// description says "never edits" declares the guard in its own frontmatter.
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

test('the guard refuses a command that names commit or push, wrapped or not', () => {
  for (const command of ['git commit -m x', 'git push origin main', "bash -c 'git commit -m x'",
    'echo "$(git push)"', "pwsh -Command 'git push'", 'python3 -c \'import subprocess; subprocess.run(["git","push"])\'']) {
    const out = run(JSON.stringify(bash(command)))
    assert.equal(out.status, 2, `${command}: must be refused\n${out.stderr}`)
    assert.match(out.stderr, /read-only/, command)
    assert.equal(out.stdout, '')
  }
})

test('the guard refuses an editing tool, and says why', () => {
  const edit = run(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Edit', cwd: repoRoot, tool_input: { file_path: 'x' } }))
  assert.equal(edit.status, 2)
  assert.match(edit.stderr, /Edit is not available/)
})

test('the guard passes every command that names neither word, writes included', () => {
  for (const command of ['git diff HEAD', 'grep -rn TODO plugin/', 'node --test tests/reviewer-guard.test.mjs', 'git log --oneline -5',
    'ls -la', 'echo hi', 'bash scripts/selftest.sh', "sed -i 's/a/b/' README.md", 'rm -rf build', 'vim README.md',
    'grep -n pre-commit README.md', 'git commit-tree HEAD^{tree}']) {
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
