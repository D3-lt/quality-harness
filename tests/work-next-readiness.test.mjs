// work-next's readiness is adr-next's answer (BACKLOG §265), and this file drives
// the seam that makes it so — `readinessFrom(corpus, directory, spawn, allowed)` —
// through the cases a different-lineage review of bdeba73 found it wrong on: exit
// 3 ("nothing ready", a valid answer) read as unproven; a relative repository
// argument handing adr-next a relative directory under the wrong cwd; a task
// adr-next read from disk but git does not list reaching `ready`; and, at the
// CLI, unread directories rendered as "Nothing in the QH corpus is waiting".
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { readinessFrom } from '../plugin/scripts/work-next.mjs'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '..')
const temps = []
test.after(() => { for (const t of temps) rmSync(t, { recursive: true, force: true }) })

// What adr-next --json prints, as spawnSync hands it back. Nothing on disk is
// read by these: `spawn` is the seam.
const answer = (status, ready) => ({
  status, error: null, signal: null, stderr: '',
  stdout: JSON.stringify({ ready, done: [], blocked: [], stopped: [] }),
})

test('readinessFrom: exit 3 is adr-next saying nothing is ready, not a directory it could not read', () => {
  const root = path.join(os.tmpdir(), 'qh-readiness-root')
  const dir = path.join(root, 'docs', 'adr', 'A', 'tasks')
  const corpus = [{ kind: 'governing', frozen: false, taskFiles: [path.join(dir, 'T1.md')] }]
  assert.deepEqual(readinessFrom(corpus, root, () => answer(3, [])), { ready: [], unproven: [] },
    'exit 3 with valid JSON is an answer')
  // DIRTY: exit 2 is the gate not running (a lib missing beside bin/), and that IS unproven.
  const missing = readinessFrom(corpus, root, () => ({ status: 2, error: null, signal: null, stdout: '', stderr: '[adr-next] could not run' }))
  assert.deepEqual(missing, { ready: [], unproven: [dir] })
  const ready = readinessFrom(corpus, root, () => answer(0, [{ id: 'T1', path: path.join(dir, 'T1.md') }]))
  assert.deepEqual(ready.ready, [path.join(dir, 'T1.md')])
})

test('readinessFrom: a relative repository argument still hands adr-next an absolute directory under an absolute cwd', () => {
  const calls = []
  const relRoot = path.join('tests', 'fixtures', 'foreign') // relative on purpose
  const corpus = [{ kind: 'governing', frozen: false, taskFiles: [path.join(relRoot, 'adr', 'ADR-001-cross-repo', 'tasks', 'T1.md')] }]
  readinessFrom(corpus, relRoot, (tool, args, options) => { calls.push({ args, options }); return answer(3, []) })
  assert.equal(calls.length, 1)
  assert.ok(path.isAbsolute(calls[0].args[0]), `adr-next is given an absolute task directory: ${calls[0].args[0]}`)
  assert.equal(calls[0].options.cwd, path.resolve(relRoot), 'and runs under the resolved repository')
})

test('readinessFrom: a task adr-next read from disk but this reader does not list is not offered', () => {
  const root = path.join(os.tmpdir(), 'qh-readiness-allow')
  const dir = path.join(root, 'docs', 'adr', 'A', 'tasks')
  const listed = path.join(dir, 'T1.md')
  const unlisted = path.join(dir, 'T2.md')
  const corpus = [{ kind: 'governing', frozen: false, taskFiles: [listed] }]
  const spawn = () => answer(0, [{ id: 'T1', path: listed }, { id: 'T2', path: unlisted }])
  assert.deepEqual(readinessFrom(corpus, root, spawn, new Set([listed])).ready, [listed],
    'the unlisted sibling adr-next saw on disk is filtered')
  // CLEAN: with no allowlist, both are adr-next's answer.
  assert.deepEqual(readinessFrom(corpus, root, spawn).ready, [listed, unlisted])
})

test('readinessFrom: only governing, unfrozen records are asked about — a Proposed record has no ready work', () => {
  // The Accepted-only rule used to be a second filter over adr-next's answer; that
  // filter was dead once this function chose the directories, and its mutant went
  // GREEN on CI (bdeba73, shard 4/48). The rule lives here now, and this is where
  // it is asserted.
  const root = path.join(os.tmpdir(), 'qh-readiness-kind')
  const accepted = path.join(root, 'docs', 'adr', 'A', 'tasks')
  const proposed = path.join(root, 'docs', 'adr', 'P', 'tasks')
  const frozen = path.join(root, 'docs', 'adr', 'F', 'tasks')
  const corpus = [
    { kind: 'governing', frozen: false, taskFiles: [path.join(accepted, 'T1.md')] },
    { kind: 'undecided', frozen: false, taskFiles: [path.join(proposed, 'T1.md')] },
    { kind: 'governing', frozen: true, taskFiles: [path.join(frozen, 'T1.md')] },
  ]
  const asked = []
  const spawn = (tool, args) => { asked.push(args[0]); return answer(0, [{ id: 'T1', path: path.join(args[0], 'T1.md') }]) }
  const result = readinessFrom(corpus, root, spawn)
  assert.deepEqual(asked, [accepted], 'adr-next is asked about the governing, unfrozen record only')
  assert.deepEqual(result.ready, [path.join(accepted, 'T1.md')])
  assert.deepEqual(result.unproven, [], 'a directory never asked about is not "unproven" — it is not in flight')
})

test('work-next text mode says UNPROVEN for a directory adr-next could not read, never an all-clear', () => {
  // A plugin copy whose adr-next cannot answer: bin/ holds one stub that exits 5.
  const temp = mkdtempSync(path.join(os.tmpdir(), 'qh-readiness-cli-')); temps.push(temp)
  const plugin = path.join(temp, 'plugin')
  cpSync(path.join(repoRoot, 'plugin', 'scripts'), path.join(plugin, 'scripts'), { recursive: true })
  mkdirSync(path.join(plugin, 'bin'))
  writeFileSync(path.join(plugin, 'bin', 'adr-next'),
    '#!/usr/bin/env python3\nimport sys\nsys.stderr.write("[adr-next] stub: cannot answer\\n")\nsys.exit(5)\n', { mode: 0o755 })
  const corpus = path.join(temp, 'corpus')
  cpSync(path.join(testDir, 'fixtures', 'foreign'), corpus, { recursive: true })
  const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.invalid',
    GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.invalid' }
  for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['commit', '-qm', 'fixture']]) {
    const r = spawnSync('git', args, { cwd: corpus, env, encoding: 'utf8', timeout: 60_000 })
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  }
  const script = path.join(plugin, 'scripts', 'work-next.mjs')
  const text = spawnSync(process.execPath, [script, corpus], { encoding: 'utf8', timeout: 120_000 })
  assert.equal(text.status, 0, text.stderr)
  assert.match(text.stdout, /readiness there is UNPROVEN/, text.stdout)
  assert.doesNotMatch(text.stdout, /Nothing in the QH corpus is waiting/, `unread directories are not an all-clear: ${text.stdout}`)
  const json = JSON.parse(spawnSync(process.execPath, [script, '--json', corpus], { encoding: 'utf8', timeout: 120_000 }).stdout)
  assert.ok(json.readinessUnproven.length >= 1, JSON.stringify(json.readinessUnproven))
})
