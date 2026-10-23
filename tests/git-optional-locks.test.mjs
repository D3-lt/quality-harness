// A read must not take the repository's index lock. A plain `git status` rewrites .git/index when a
// tracked file's stat data changed, and holds .git/index.lock while it does; the plugin's hooks and the
// detached branch-state refresher run such reads while the agent's own `git add` or `git commit` runs, and
// a benchmark saw `git add -A` fail on an existing index.lock within a second of a plugin-loaded session
// ending. `GIT_OPTIONAL_LOCKS=0` (the environment form of `--no-optional-locks`) stops it.
//
// Two halves: the mechanism, through the readers that run `git status` (the index bytes must not move),
// and the class, a static sweep so a new read-only git spawn cannot arrive without the setting.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { remove } from './helpers/remove.mjs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { collect, shell } from '../plugin/scripts/branch-state.mjs'
import { runPython } from '../scripts/python-interpreter.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ---- the mechanism ------------------------------------------------------------------------------

const git = (cwd, ...args) => {
  const run = spawnSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@localhost', '-c', 'commit.gpgsign=false', ...args],
    { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`)
  return run.stdout
}
const indexDigest = dir => createHash('sha256').update(readFileSync(path.join(dir, '.git', 'index'))).digest('hex')

// A repository whose one tracked file has a stat the index no longer matches: the state in which a plain
// `git status` rewrites the index.
function staleStatRepository(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-optlocks-'))
  t.after(() => remove(dir))
  git(dir, 'init', '-q')
  writeFileSync(path.join(dir, 'a.txt'), 'one\n')
  git(dir, 'add', 'a.txt')
  git(dir, 'commit', '-q', '-m', 'one')
  const touch = seconds => utimesSync(path.join(dir, 'a.txt'), seconds, seconds)
  let next = 1_000_000_000
  return { dir, restale: () => touch(next += 100_000) }
}

test('the control: a plain git status rewrites the index when a tracked file\'s stat changed', t => {
  const { dir, restale } = staleStatRepository(t)
  restale()
  const before = indexDigest(dir)
  git(dir, 'status', '--short')
  assert.notEqual(indexDigest(dir), before, 'the fixture does not provoke an index refresh, so the tests below prove nothing')
})

test('branch-state\'s reader leaves the index alone when a tracked file\'s stat changed', t => {
  const { dir, restale } = staleStatRepository(t)
  restale()
  const before = indexDigest(dir)
  const state = collect(argv => shell(argv, { cwd: dir }))
  assert.equal(state.looked, true, JSON.stringify(state))
  assert.equal(indexDigest(dir), before, 'branch-state\'s git status rewrote .git/index, which takes index.lock')
})

test('the shell seam sets it for git and does not hand it to anything else', t => {
  const printed = argv => shell(argv, { cwd: os.tmpdir() }).out
  assert.equal(printed([process.execPath, '-e', 'process.stdout.write(String(process.env.GIT_OPTIONAL_LOCKS))']), 'undefined')
})

// ---- the class ----------------------------------------------------------------------------------

const MARK = /GIT_OPTIONAL_LOCKS|git_read_env/

// Writers by design, each with the reason it is not a read. A new entry needs a reason a reader can check.
const WRITERS = [
  { file: 'plugin/scripts/worktree.mjs', reason: 'creates, stashes into and removes campaign worktrees; a writer by design' },
  { file: 'plugin/scripts/qh-check.mjs', marker: "'commit'", reason: 'the commit qh-check --commit makes after its check passes' },
]

// The text of the balanced call that opens at `open` (an index of its "(").
function callFrom(source, open) {
  let depth = 0
  let quote = null
  for (let i = open; i < source.length; i += 1) {
    const c = source[i]
    if (quote) {
      if (c === '\\') i += 1
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') quote = c
    else if (c === '(') depth += 1
    else if (c === ')' && --depth === 0) return source.slice(open, i + 1)
  }
  return source.slice(open)
}

// The "(" of the innermost call that encloses `at`, or -1.
function enclosingOpen(source, at) {
  let depth = 0
  for (let i = at - 1; i >= 0; i -= 1) {
    const c = source[i]
    if (c === ')') depth += 1
    else if (c === '(') { if (depth === 0) return i; depth -= 1 }
  }
  return -1
}

/**
 * The calls in `source` that start git and name no GIT_OPTIONAL_LOCKS in their text. JavaScript: a call whose
 * first argument is the literal git, or `argv[0]` (branch-state's one seam, which also starts `gh`). Python: the
 * call that holds a list beginning with the literal git. A call is read whole, so a multi-line options
 * object counts.
 */
export function unlockedGitSpawns(whole, language, file = 'fixture') {
  // Whole-line comments are prose about a spawn, not a spawn; blanked in place, so line numbers hold.
  const source = whole.split('\n').map(text => (/^\s*(\/\/|\/\*|\*|#)/.test(text) ? '' : text)).join('\n')
  const found = []
  const patterns = language === 'js'
    ? [/\(\s*(['"])git\1\s*,/g, /\b(?:execFileSync|spawnSync|spawn)\(\s*argv\[0\]\s*,/g]
    : [/\[\s*"git"\s*,/g]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const open = language === 'js' ? source.indexOf('(', match.index) : enclosingOpen(source, match.index)
      if (open < 0) continue
      // Python: the call that holds the list. `runner(...)` is an injected seam, covered by its own default below.
      if (language === 'py' && !/(?:\bsubprocess\.\w+|\brun_bounded)$/.test(source.slice(0, open))) continue
      const call = callFrom(source, open)
      const line = source.slice(0, match.index).split('\n').length
      const writer = WRITERS.find(w => w.file === file && (!w.marker || call.includes(w.marker)))
      if (!MARK.test(call) && !writer) found.push({ file, line, call: call.slice(0, 90).replace(/\s+/g, ' ') })
    }
  }
  return found
}

const shipped = dir => readdirSync(path.join(repoRoot, dir)).flatMap(name => {
  const full = path.join(dir, name)
  if (statSync(path.join(repoRoot, full)).isDirectory()) return name === 'node_modules' ? [] : shipped(full)
  return [full.split(path.sep).join('/')]
})

test('every read-only git spawn in plugin/ sets GIT_OPTIONAL_LOCKS', () => {
  const sources = ['plugin/scripts', 'plugin/bin', 'plugin/lib', 'plugin/hooks'].flatMap(shipped)
    .filter(file => /\.(mjs|cjs|js|py)$/.test(file) || file.startsWith('plugin/bin/'))
  const missing = []
  let spawns = 0
  for (const file of sources) {
    const source = readFileSync(path.join(repoRoot, file), 'utf8').replace(/\r\n/g, '\n')
    const language = /\.(mjs|cjs|js)$/.test(file) ? 'js' : 'py'
    if (language === 'py' && !/\bsubprocess\b|run_bounded/.test(source)) continue
    // Counted with the mark removed, so the number is every site and not only the missing ones.
    spawns += unlockedGitSpawns(source.replaceAll('GIT_OPTIONAL_LOCKS', 'X').replaceAll('git_read_env', 'X'), language, `${file}#all`).length
    missing.push(...unlockedGitSpawns(source, language, file))
  }
  assert.ok(spawns >= 30, `only ${spawns} git spawns were found in plugin/, so the sweep is looking at the wrong thing`)
  assert.deepEqual(missing, [], `these git spawns read without GIT_OPTIONAL_LOCKS=0:\n${missing.map(m => `${m.file}:${m.line} ${m.call}`).join('\n')}`)
})

test('the sweep fails on a spawn without the setting, and passes the same spawn with it', () => {
  const bare = "spawnSync('git', ['-C', root, 'status'], {\n  encoding: 'utf8', timeout: 5_000,\n})"
  const set = "spawnSync('git', ['-C', root, 'status'], {\n  encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },\n})"
  assert.equal(unlockedGitSpawns(bare, 'js').length, 1)
  assert.equal(unlockedGitSpawns(set, 'js').length, 0)
  const seam = 'execFileSync(argv[0], argv.slice(1), { cwd, env, timeout })'
  assert.equal(unlockedGitSpawns(seam, 'js').length, 1)
  assert.equal(unlockedGitSpawns(seam.replace('env,', 'env: { GIT_OPTIONAL_LOCKS: 0 },'), 'js').length, 0)
  const python = 'r = subprocess.run(["git", "-C", str(root), "status"],\n                   capture_output=True, timeout=30)'
  assert.equal(unlockedGitSpawns(python, 'py').length, 1)
  assert.equal(unlockedGitSpawns(python.replace('timeout=30', 'timeout=30, env=git_read_env()'), 'py').length, 0)
  // A writer is excused by name and reason, and only that file.
  assert.equal(unlockedGitSpawns("spawnSync('git', ['-C', r, 'commit'], { timeout: 1 })", 'js', 'plugin/scripts/qh-check.mjs').length, 0)
  assert.equal(unlockedGitSpawns("spawnSync('git', ['-C', r, 'status'], { timeout: 1 })", 'js', 'plugin/scripts/qh-check.mjs').length, 1)
  assert.equal(unlockedGitSpawns("spawnSync('git', ['-C', r, 'commit'], { timeout: 1 })", 'js', 'plugin/scripts/other.mjs').length, 1)
})

// adr-lint's top-level check asks git through an injectable `runner`, so no literal list sits inside its default spawn;
// the default is read here instead.
test('the default runner behind adr-lint\'s repository check sets it', () => {
  const source = readFileSync(path.join(repoRoot, 'plugin/bin/adr-lint'), 'utf8').replace(/\r\n/g, '\n')
  const at = source.indexOf('runner = run or (lambda')
  assert.ok(at > 0, 'the default runner moved; update this test')
  assert.match(callFrom(source, source.indexOf('subprocess.run(', at) + 'subprocess.run'.length), /git_read_env\(\)/)
})

// The Python gates take their setting from one helper; the sweep above only sees that a call names it.
test('the Python helper carries the setting for a git child and leaves this process\'s environment alone', () => {
  const lib = path.join(repoRoot, 'plugin', 'lib')
  const run = runPython(['-I', '-c', 'import os, sys; sys.path.insert(0, sys.argv[1]); import record; '
    + 'print(record.git_read_env().get("GIT_OPTIONAL_LOCKS"), "GIT_OPTIONAL_LOCKS" in os.environ)', lib],
  { encoding: 'utf8', timeout: 30_000, env: { ...process.env, GIT_OPTIONAL_LOCKS: undefined } })
  assert.equal(run.status, 0, run.stderr)
  assert.equal(run.stdout.trim(), '0 False')
})
