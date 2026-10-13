// ADR-100 T2: `qh-check --commit` runs the check on a tree equal to the index and commits it only on a pass, through the
// CLI, the boundary an agent calls. Every repository here is one this test made (CLAUDE.md §9).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { commitArgsProblem } from '../plugin/scripts/qh-check.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const qhCheck = join(repoRoot, 'plugin', 'scripts', 'qh-check.mjs')
// The session's own git configuration (its publish hook) must not reach a scratch repository (BACKLOG §371).
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_CONFIG|^CLAUDE_CODE_SESSION_ID$|^QUALITY_HARNESS_STATE_DIR$/.test(key)))

const git = (cwd, ...args) => {
  const run = spawnSync('git', args, { cwd, env, encoding: 'utf8', windowsHide: true, timeout: 30_000 })
  assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`)
  return run.stdout.trim()
}

// A repository whose fastCheck exits with the number in `exit.txt` (absent: 0), with one commit.
function project({ hooks = null } = {}) {
  const dir = mkdtempSync(join(os.tmpdir(), 'qh-commit-'))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 't@example.invalid')
  git(dir, 'config', 'user.name', 't')
  git(dir, 'config', 'commit.gpgsign', 'false')
  if (hooks) git(dir, 'config', 'core.hooksPath', hooks)
  writeFileSync(join(dir, 'check.mjs'), "import fs from 'node:fs'\nprocess.exit(fs.existsSync('exit.txt') ? Number(fs.readFileSync('exit.txt', 'utf8')) : 0)\n")
  writeFileSync(join(dir, '.quality-harness.json'), JSON.stringify({ check: 'node check.mjs', fastCheck: 'node check.mjs' }))
  writeFileSync(join(dir, '.gitignore'), '*.log\n')
  writeFileSync(join(dir, 'a.txt'), 'one\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'start')
  return dir
}

const commit = (dir, args, input = '') => spawnSync(process.execPath, [qhCheck, '--commit', ...args], { cwd: dir, env, input, encoding: 'utf8', windowsHide: true, timeout: 120_000 })
const fastRows = dir => {
  const file = join(dir, '.git', 'quality-harness', 'fast-checks.jsonl')
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).length : 0
}
const head = dir => git(dir, 'rev-parse', 'HEAD')

test('qh-check --commit commits the staged tree only after its check passes', () => {
  const dir = project()
  try {
    writeFileSync(join(dir, 'a.txt'), 'two\n')
    git(dir, 'add', 'a.txt')
    const before = head(dir)
    const run = commit(dir, ['-m', 'two'])
    assert.equal(run.status, 0, run.stdout + run.stderr)
    assert.notEqual(head(dir), before)
    assert.equal(git(dir, 'log', '-1', '--format=%s'), 'two')
    assert.equal(fastRows(dir), 1, 'the check is recorded where qh-check --fast records it')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("a red check never reaches git commit and its exit code is the check's", () => {
  const dir = project()
  try {
    writeFileSync(join(dir, 'exit.txt'), '3')
    git(dir, 'add', 'exit.txt')
    const before = head(dir)
    const run = commit(dir, ['-m', 'red'])
    assert.equal(run.status, 3, run.stdout + run.stderr)
    assert.equal(head(dir), before)
    assert.equal(fastRows(dir), 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('qh-check --commit refuses a working tree that differs from the index before running anything', () => {
  const dir = project()
  try {
    writeFileSync(join(dir, 'a.txt'), 'unstaged\n')
    const unstaged = commit(dir, ['-m', 'x'])
    assert.equal(unstaged.status, 2, unstaged.stdout + unstaged.stderr)
    assert.match(unstaged.stderr, /a\.txt/)
    git(dir, 'add', 'a.txt')
    writeFileSync(join(dir, 'new.txt'), 'untracked\n')
    const untracked = commit(dir, ['-m', 'x'])
    assert.equal(untracked.status, 2, untracked.stdout + untracked.stderr)
    assert.match(untracked.stderr, /new\.txt/)
    assert.equal(fastRows(dir), 0, 'a refusal runs no check')
    // An ignored file is not in the tree the check observes, and does not refuse.
    rmSync(join(dir, 'new.txt'))
    writeFileSync(join(dir, 'debug.log'), 'ignored\n')
    const ignored = commit(dir, ['-m', 'ignored beside'])
    assert.equal(ignored.status, 0, ignored.stdout + ignored.stderr)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('qh-check --commit passes its git arguments and stdin through', () => {
  const dir = project()
  try {
    writeFileSync(join(dir, 'a.txt'), 'three\n')
    git(dir, 'add', 'a.txt')
    const run = commit(dir, ['-F', '-'], 'a message on stdin\n\nwith a body\n')
    assert.equal(run.status, 0, run.stdout + run.stderr)
    assert.equal(git(dir, 'log', '-1', '--format=%s'), 'a message on stdin')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('qh-check --commit refuses a pathspec and says when the commit records a tree the check did not see', () => {
  const hooks = mkdtempSync(join(os.tmpdir(), 'qh-commit-hooks-'))
  const dir = project({ hooks })
  try {
    writeFileSync(join(dir, 'a.txt'), 'four\n')
    git(dir, 'add', 'a.txt')
    for (const args of [['-m', 'x', '--', 'a.txt'], ['-m', 'x', 'a.txt'], ['-p', '-m', 'x'], ['--only', '-m', 'x'], ['-i', '-m', 'x']]) {
      const refused = commit(dir, args)
      assert.equal(refused.status, 2, `${args.join(' ')}: ${refused.stdout}${refused.stderr}`)
    }
    assert.equal(fastRows(dir), 0, 'a refused argument runs no check')
    // A pre-commit hook that stages a file the check never saw: the commit is made, and said as unchecked.
    const hook = join(hooks, 'pre-commit')
    writeFileSync(hook, '#!/bin/sh\necho added-by-hook > c.txt\ngit add c.txt\n')
    chmodSync(hook, 0o755)
    const rewritten = commit(dir, ['-m', 'hooked'])
    assert.equal(rewritten.status, 1, rewritten.stdout + rewritten.stderr)
    assert.match(rewritten.stderr, /not the tree the check ran on/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(hooks, { recursive: true, force: true })
  }
})

// The advisor's review of e6a00957: a check that stages a file while it runs ends on a tree it did not start on, and the
// ledger grades that run unproven; its exit 0 is not a pass of the tree being committed.
test('a check that stages a file while it runs is not committed', () => {
  const dir = project()
  try {
    writeFileSync(join(dir, 'check.mjs'), "import fs from 'node:fs'\nimport { execFileSync } from 'node:child_process'\nif (fs.existsSync('stage.txt')) { fs.writeFileSync('c.txt', 'staged mid-run\\n'); execFileSync('git', ['add', 'c.txt']) }\n")
    writeFileSync(join(dir, 'stage.txt'), 'go\n')
    git(dir, 'add', '-A')
    const before = head(dir)
    const run = commit(dir, ['-m', 'mid-run'])
    assert.equal(run.status, 1, run.stdout + run.stderr)
    assert.equal(head(dir), before, 'nothing is committed')
    assert.match(run.stderr, /did not certify/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// `-S[<keyid>]` takes its key attached, never the next word: read as taking one, `-S -m x` refused `x` as a pathspec.
test('a signing flag takes no next word, and a pathspec is still refused', () => {
  for (const args of [['-S', '-m', 'x'], ['-Sabc', '-m', 'x'], ['--gpg-sign', '-m', 'x'], ['--gpg-sign=abc', '-F', '-'], ['-am', 'x'], ['--amend', '--no-edit']]) {
    assert.equal(commitArgsProblem(args), null, args.join(' '))
  }
  for (const args of [['-S', '-m', 'x', 'a.txt'], ['-m', 'x', '--', 'a.txt'], ['-pm', 'x']]) {
    assert.notEqual(commitArgsProblem(args), null, args.join(' '))
  }
})

// The Codex review of ce54814c: git accepts an unambiguous prefix of a long option, so `--on` is `--only` and `--amend --on`
// amends with a tree no check saw. Only whole names this command knows commit the index; anything else is refused.
test('an abbreviated or unknown long option is refused', () => {
  for (const args of [['--amend', '--on', '--no-edit'], ['--inc', '-m', 'x'], ['--amen'], ['--pathspec-file-nul', '-m', 'x'], ['--frobnicate']]) {
    assert.notEqual(commitArgsProblem(args), null, args.join(' '))
  }
  for (const args of [['--amend', '--no-edit'], ['--message=x'], ['--file', '-'], ['--signoff', '-m', 'x'], ['--no-verify', '-F', '-']]) {
    assert.equal(commitArgsProblem(args), null, args.join(' '))
  }
})
