// Phase 1 of the redesign (owner's yes, 2026-10-14): every shipped file and every hook declares what consumes it, an
// advisory hook says why its text is worth its cost, and every path-scoped rule's glob still governs a tracked file. The
// checks are pure over a tracked list (CLAUDE.md §8: `git ls-files`, never the disk), and each is shown failing (§4).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkComponents, hookKeys } from '../scripts/component-manifest.mjs'
import { globToRegExp, parseRulePaths } from '../scripts/rules-inject.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const listed = spawnSync('git', ['-C', repoRoot, 'ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', timeout: 60_000 })
assert.equal(listed.status, 0, listed.stderr)
const tracked = listed.stdout.split('\n').filter(Boolean)
const texts = new Map()
const read = file => {
  if (!texts.has(file)) { try { texts.set(file, readFileSync(path.join(repoRoot, file), 'utf8')) } catch { texts.set(file, null) } }
  return texts.get(file)
}
const json = file => JSON.parse(read(file))

test('every shipped file and hook declares what consumes it', () => {
  assert.deepEqual(checkComponents({ tracked, read, hooks: json('plugin/hooks/hooks.json'), manifest: json('scripts/components.json') }), [])
})

test('the manifest check names an undeclared, a stale, an unreached and an unreasoned component', () => {
  const files = {
    'plugin/hooks/hooks.json': '', 'plugin/a.mjs': "import x from './b.mjs'\n", 'plugin/b.mjs': '', 'plugin/c.mjs': '// c.mjs names only itself\n',
    'plugin/new.mjs': '', 'plugin/t.mjs': '', 'plugin/reader.mjs': "if (entry.event === 'x.seen') {}\n",
  }
  const hooks = { hooks: {
    Stop: [{ hooks: [{ command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/lifecycle.mjs'] }] }],
    PostToolUse: [{ matcher: 'Edit', hooks: [{ command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs', 'x.sh'] }] }],
  } }
  assert.deepEqual(hookKeys(hooks), ['Stop · * · node ${CLAUDE_PLUGIN_ROOT}/scripts/lifecycle.mjs', 'PostToolUse · Edit · node ${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs x.sh'])
  // A hook that runs something else under the same file name is a different hook: another interpreter, another directory.
  for (const changed of [{ command: 'echo', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/lifecycle.mjs'] }, { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/old/lifecycle.mjs'] }]) {
    assert.notDeepEqual(hookKeys({ hooks: { Stop: [{ hooks: [changed] }] } }), [hookKeys(hooks)[0]], JSON.stringify(changed))
  }
  const manifest = {
    files: [
      { path: 'plugin/hooks/hooks.json', consumer: 'host' },
      { path: 'plugin/b.mjs', consumer: 'reached' },
      { path: 'plugin/c.mjs', consumer: 'reached' },
      { path: 'plugin/gone.mjs', consumer: 'reached' },
      { path: 'plugin/t.mjs', consumer: 'tombstone' },
      { path: 'plugin/a.mjs', consumer: 'command' },
      { path: 'plugin/reader.mjs', consumer: 'command' },
    ],
    hooks: {
      'Stop · * · node ${CLAUDE_PLUGIN_ROOT}/scripts/lifecycle.mjs': { consumers: [{ kind: 'agent-context', by: 'plugin/a.mjs', token: 'import' }] },
      'Ghost · * · y.mjs': { consumers: [{ kind: 'tool', by: 'plugin/reader.mjs', token: "'x.seen'" }] },
    },
  }
  const findings = checkComponents({ tracked: Object.keys(files), read: file => files[file] ?? null, hooks, manifest })
  assert.deepEqual(findings, [
    'plugin/new.mjs ships and no entry in the manifest declares what consumes it',
    'plugin/c.mjs is declared reached, and no other shipped file names it',
    'plugin/gone.mjs declares no shipped file: every file it matches is gone or declared above it',
    'plugin/t.mjs is kept with no consumer and gives no reason',
    'hook PostToolUse · Edit · node ${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs x.sh runs and the manifest does not declare what consumes it',
    'hook Stop · * · node ${CLAUDE_PLUGIN_ROOT}/scripts/lifecycle.mjs only puts text in front of a reader, and gives no reason for that cost',
    'hook Ghost · * · y.mjs is declared and hooks.json runs no such entry',
  ])
  // A consumer that does not hold its token, or names an untracked file, or a kind nobody defined.
  const wrong = checkComponents({ tracked: Object.keys(files), read: file => files[file] ?? null, hooks, manifest: {
    files: [{ path: 'plugin/**', consumer: 'command' }],
    hooks: {
      'Stop · * · node ${CLAUDE_PLUGIN_ROOT}/scripts/lifecycle.mjs': { consumers: [{ kind: 'tool', by: 'plugin/reader.mjs', token: "'y.seen'" }, { kind: 'tool', by: 'plugin/gone.mjs', token: 'x' }] },
      'PostToolUse · Edit · node ${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs x.sh': { consumers: [{ kind: 'vibes', by: 'plugin/a.mjs', token: 'import' }] },
    },
  } })
  assert.deepEqual(wrong, [
    'hook Stop · * · node ${CLAUDE_PLUGIN_ROOT}/scripts/lifecycle.mjs: plugin/reader.mjs does not hold "\'y.seen\'", so it is not shown to consume this hook',
    'hook Stop · * · node ${CLAUDE_PLUGIN_ROOT}/scripts/lifecycle.mjs: plugin/gone.mjs is not a tracked file',
    'hook PostToolUse · Edit · node ${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs x.sh: "vibes" is not a hook consumer (refusal, tool, agent-context, user-message)',
  ])
  // CLEAN twin: the same tree, every component declared, reached, reasoned and read.
  const clean = checkComponents({ tracked: Object.keys(files), read: file => files[file] ?? null, hooks, manifest: {
    files: [
      { path: 'plugin/hooks/hooks.json', consumer: 'host' },
      { path: 'plugin/b.mjs', consumer: 'reached' },
      { path: 'plugin/t.mjs', consumer: 'tombstone', reason: 'a Governs: header names it' },
      { path: 'plugin/*.mjs', consumer: 'command' },
    ],
    hooks: {
      'Stop · * · node ${CLAUDE_PLUGIN_ROOT}/scripts/lifecycle.mjs': { consumers: [{ kind: 'agent-context', by: 'plugin/a.mjs', token: 'import' }], reason: 'measured' },
      'PostToolUse · Edit · node ${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs x.sh': { consumers: [{ kind: 'tool', by: 'plugin/reader.mjs', token: "'x.seen'" }] },
    },
  } })
  assert.deepEqual(clean, [])
})

// The rulebook test the redesign asked for: a `.claude/rules` file whose `paths:` glob matches nothing is never delivered,
// and nothing says so (rules-inject.mjs, the hook these globs feed, uses the same matcher).
function unmatchedRuleGlobs(trackedPaths, readText) {
  const unmatched = []
  for (const file of trackedPaths.filter(name => /^\.claude\/rules\/[^/]+\.md$/.test(name))) {
    for (const glob of parseRulePaths(readText(file))) {
      const pattern = globToRegExp(glob)
      if (!trackedPaths.some(name => pattern.test(name))) unmatched.push(`${file}: ${glob}`)
    }
  }
  return unmatched
}

test('every path-scoped rule governs at least one tracked file', () => {
  assert.deepEqual(unmatchedRuleGlobs(tracked, read), [])
  // DIRTY twin: a glob that matches nothing is named, and one that matches is not.
  const rule = '---\npaths:\n  - "plugin/scripts/gone.mjs"\n  - "plugin/**"\n---\n'
  assert.deepEqual(unmatchedRuleGlobs(['.claude/rules/x.md', 'plugin/a.mjs'], () => rule), ['.claude/rules/x.md: plugin/scripts/gone.mjs'])
})
