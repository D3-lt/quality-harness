// A throwaway repository a mutation campaign can run over (spec 2026-09-29, "a campaign
// never touches the checkout"). A test here must never run a campaign over THIS
// checkout: peers load its code, and a mutant applied here is live for them (§9).
//
// The fixture's own test appends what it saw to $FIXTURE_SIDECAR on every run: its
// working directory, and the bytes of lib.mjs in the checkout named by
// $FIXTURE_CHECKOUT. That is how a test sees WHERE a campaign ran its suite and whether
// a mutant ever reached the checkout while it did.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verdictsOf } from '../scripts/campaign-parity.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Every directory this module makes, removed when the test process exits: a fixture is
// made per test and the suite runs on every gate, so what it left grew the gate's
// temp-directory advice by ten entries a run.
const made = []
process.once('exit', () => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
})

/** The campaign runner under test. */
export const mutateScript = path.join(repoRoot, 'scripts', 'mutate.mjs')

// Three entries over two sources, so a `--changed` or `--shard` selection has something to tell
// apart (ADR-075, the Codex review of the plan: the child's selection must equal the parent's).
export const FIXTURE_FILES = {
  'lib.mjs': "export const answer = () => 42\nexport const other = () => 'x'\n",
  'notes.md': '# Notes\n',
  'lib2.mjs': 'export const third = () => 3\n',
  'tests/lib2.test.mjs': "import assert from 'node:assert/strict'\nimport test from 'node:test'\nimport { third } from '../lib2.mjs'\ntest('third is 3', () => { assert.equal(third(), 3) })\n",
  'tests/lib.test.mjs': [
    "import assert from 'node:assert/strict'",
    "import { appendFileSync, readFileSync } from 'node:fs'",
    "import path from 'node:path'",
    "import test from 'node:test'",
    "import { answer, other } from '../lib.mjs'",
    'const seen = () => {',
    '  if (!process.env.FIXTURE_SIDECAR) return',
    '  const checkout = readFileSync(path.join(process.env.FIXTURE_CHECKOUT, \'lib.mjs\'), \'utf8\')',
    '  appendFileSync(process.env.FIXTURE_SIDECAR, JSON.stringify({ cwd: process.cwd(), checkout }) + \'\\n\')',
    '}',
    "test('answer is 42', async () => {",
    '  seen()',
    '  if (process.env.FIXTURE_SLOW_MS) await new Promise(resolve => setTimeout(resolve, Number(process.env.FIXTURE_SLOW_MS)))',
    '  assert.equal(answer(), 42)',
    '})',
    "test('other is x', () => { assert.equal(other(), 'x') })",
    '',
  ].join('\n'),
  'tests/mutations.json': `${JSON.stringify({
    mutations: [
      { label: 'answer', file: 'lib.mjs', tests: ['tests/lib.test.mjs'], from: '() => 42', to: '() => 43' },
      { label: 'other', file: 'lib.mjs', tests: ['tests/lib.test.mjs'], from: "() => 'x'", to: "() => 'y'" },
      { label: 'third', file: 'lib2.mjs', tests: ['tests/lib2.test.mjs'], from: '() => 3', to: '() => 4' },
    ],
  }, null, 2)}\n`,
  '.gitignore': '.mutate-lock\n.mutate-inflight.json\n.mutation-cache.json\n',
}

/** git in a fixture repository, as the fixture's author. */
export function fixtureGit(dir, args) {
  const run = spawnSync('git', ['-C', dir, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args],
    { encoding: 'utf8', timeout: 20_000, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  return run.stdout
}

/** A fresh fixture repository in the OS temp directory; `commit: false` leaves HEAD unborn. */
export function campaignFixture({ commit = true } = {}) {
  const dir = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-campaign-fixture-')))
  made.push(dir)
  fixtureGit(dir, ['init', '-q'])
  for (const [rel, body] of Object.entries(FIXTURE_FILES)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    writeFileSync(path.join(dir, rel), body)
  }
  if (commit) {
    fixtureGit(dir, ['add', '-A'])
    fixtureGit(dir, ['commit', '-qm', 'fixture'])
  }
  return dir
}

/** The environment a campaign child gets: this one, minus what would steer it elsewhere. */
export function campaignEnv(extra = {}) {
  const { QUALITY_HARNESS_MUTATE_LOCK: _lock, NODE_TEST_CONTEXT: _context, ...rest } = process.env
  return { ...rest, ...extra }
}

/** Run a campaign over `dir`, and only `dir`. */
export function campaign(dir, args = [], env = {}) {
  return spawnSync(process.execPath, [mutateScript, '--root', dir, ...args],
    { cwd: dir, env: campaignEnv(env), encoding: 'utf8', timeout: 120_000, windowsHide: true })
}

/** Every file under `dir` but `.git`, by its SHA-256. */
export function snapshot(dir) {
  const found = {}
  const walk = rel => {
    for (const entry of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name
      if (child === '.git') continue
      if (entry.isDirectory()) walk(child)
      else found[child] = createHash('sha256').update(readFileSync(path.join(dir, child))).digest('hex')
    }
  }
  walk('')
  return found
}

/**
 * `{ label: verdict }` from a campaign's report lines (`RED      answer  <- killed by: …`): the parity
 * script's reader, so a RED that names no killer is read here too (Codex review of ADR-075).
 */
export const verdicts = verdictsOf

/** What the fixture's test wrote to a sidecar, one object per run. */
export function sidecarLines(file) {
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
}

/** A sidecar path outside every repository. */
export function sidecar() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-campaign-sidecar-'))
  made.push(dir)
  return path.join(dir, 'seen.jsonl')
}

/** The worktrees git knows for `dir`, by real path where the directory still exists. */
export function worktrees(dir) {
  const real = file => { try { return realpathSync.native(file) } catch { return file } }
  return fixtureGit(dir, ['worktree', 'list', '--porcelain']).split('\n')
    .filter(line => line.startsWith('worktree ')).map(line => real(line.slice('worktree '.length)))
}
