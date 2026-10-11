// ADR-095 T1: a tool that counts what a hook event does, so every claim about repeated work is a command and not a belief.
// The fixtures are tiny hook programs that start known children; the tool is asked about them through its command line.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tool = path.join(repoRoot, 'scripts', 'hook-cost.mjs')
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'hook-cost-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))

const repo = path.join(scratch, 'repo')
mkdirSync(repo)
assert.equal(spawnSync('git', ['init', '-q', repo], { encoding: 'utf8', timeout: 10_000, windowsHide: true }).status, 0)
const program = (name, body) => { const file = path.join(scratch, name); writeFileSync(file, `import { spawnSync, execFileSync } from 'node:child_process'\nconst cwd = process.cwd()\n${body}\n`); return file }
const run = (file, extra = []) => {
  const r = spawnSync(process.execPath, [tool, 'Stop', repo, '--in-place', '--program', file, '--json', ...extra], { encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  return JSON.parse(r.stdout)
}

test('hook-cost lists every child a hook starts, with its arguments and the time inside it', () => {
  const file = program('three.mjs', "spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd })\nexecFileSync('git', ['status', '--short'], { cwd })\nspawnSync('git', ['--version'], { cwd })")
  const out = run(file)
  assert.equal(out.exit, 0)
  assert.equal(out.children.length, 3)
  assert.deepEqual(out.children.map(child => child.cmd), ['git rev-parse --show-toplevel', 'git status --short', 'git --version'])
  for (const child of out.children) assert.ok(Number.isFinite(child.ms) && child.ms >= 0, `a time for ${child.cmd}`)
  assert.ok(out.reads.count > 0 && out.wallMs > 0)
})

test('hook-cost flags the same program with the same arguments in the same directory as a repeat, and two different argument lists as none', () => {
  const twice = run(program('twice.mjs', "spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd })\nexecFileSync('git', ['rev-parse', '--show-toplevel'], { cwd })\nspawnSync('git', ['status', '--short'], { cwd })"))
  assert.equal(twice.repeats.length, 1)
  assert.deepEqual([twice.repeats[0].cmd, twice.repeats[0].count], ['git rev-parse --show-toplevel', 2])
  const distinct = run(program('distinct.mjs', "spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd })\nspawnSync('git', ['status', '--short'], { cwd })"))
  assert.deepEqual(distinct.repeats, [])
  // The same arguments asked in two directories are two questions, not a repeat.
  const other = path.join(scratch, 'other')
  mkdirSync(other)
  const apart = run(program('apart.mjs', `spawnSync('git', ['--version'], { cwd })\nspawnSync('git', ['--version'], { cwd: ${JSON.stringify(other)} })`))
  assert.deepEqual(apart.repeats, [])
})

test('a hook that fails to run is reported as such, never as zero children', () => {
  const failed = run(program('exit3.mjs', "spawnSync('git', ['--version'], { cwd })\nprocess.exit(3)"))
  assert.equal(failed.exit, 3)
  assert.equal(failed.children.length, 1, 'the child it started before it failed is kept')
  const hung = run(program('hang.mjs', "spawnSync('git', ['--version'], { cwd })\nsetTimeout(() => {}, 60_000)"), ['--timeout', '2'])
  assert.equal(hung.timedOut, true)
  assert.equal(hung.children.length, 1)
  // A program that cannot be started at all has no child count: null, not an empty list.
  const missing = run(path.join(scratch, 'does-not-exist.mjs'))
  assert.equal(missing.children, null)
  assert.match(missing.error, /could not|not found|exit/i)
})
