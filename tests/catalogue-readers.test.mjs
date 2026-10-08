// ADR-091 T2: every reader that finds the mutation catalogue by its path reads
// tests/mutations/<source>.json too, so the catalogue can move there without a reader going quiet.
// Each scratch repository here holds ONLY the per-source files — the state ADR-091 T3 creates, and
// the one in which the readers used to see nothing. Every repository is one this file made
// (CLAUDE.md §9), and each check has its twin beside it.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { proposals } from '../plugin/scripts/mutate-propose.mjs'
import { campaignEnv, campaignFixture, fixtureGit } from './campaign-fixture.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })
const serialize = mutations => `${JSON.stringify({ mutations }, null, 2)}\n`

function scratch(files) {
  const dir = mkdtempSync(join(tmpdir(), 'qh-catalogue-readers-'))
  temps.push(dir)
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true })
    writeFileSync(join(dir, file), text)
  }
  return dir
}
const git = (dir, ...args) => spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', ...args], { cwd: dir, encoding: 'utf8', timeout: 30_000, windowsHide: true })

const RECORD = pointer => ['# ADR-001: Probe', '', '**Status:** Accepted', '**Spec:** None — no spec stage',
  `**Enforced-by:** \`${pointer}\``, '**Served-path change:** None — this decision changes no served path.', '',
  '## Existing Primitives Audit', '', 'Nothing existing covers it.', '', '## Decision', '', 'Do the thing.', '',
  '## Alternatives Considered', '', '- Doing nothing — rejected, the bug persists.', '',
  '## Consequences', '', 'The thing is done.', '', '## Wiring & Contract Changes', '', 'None.', '',
  '## Out of Scope', '', '- The other thing (deferred: ADR-002)', ''].join('\n')
// adr-lint over a record naming `pointer` in a scratch git repository holding `files`, and its
// Enforced-by advice. 60s: a Windows runner's first Python spawn can take 30.
function enforcement(files, pointer) {
  const dir = scratch({ ...files, 'ADR-001-probe.md': RECORD(pointer) })
  git(dir, 'init', '-q')
  const run = spawnSync('python3', [join(repoRoot, 'plugin', 'bin', 'adr-lint'), join(dir, 'ADR-001-probe.md')], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  return { run, advice: run.stdout.split('\n').filter(line => line.includes('Enforced-by names')).join('\n') }
}
const entry = (label, file) => ({ label, file, tests: ['tests/x.test.mjs'], from: 'a', to: 'b' })

test('adr-lint resolves an Enforced-by label from a per-source catalogue file', () => {
  const files = { 'tests/mutations/x.mjs.json': serialize([entry('held in a per-source file', 'x.mjs')]) }
  const held = enforcement(files, 'held in a per-source file')
  assert.equal(held.run.status, 0, `${held.run.stdout}\n${held.run.stderr}`)
  assert.equal(held.advice, '', held.run.stdout)
  // The twin: a label held nowhere is still a pointer to nothing.
  const nowhere = enforcement(files, 'held nowhere')
  assert.equal(nowhere.run.status, 0, `${nowhere.run.stdout}\n${nowhere.run.stderr}`)
  assert.match(nowhere.advice, /Enforced-by names `held nowhere`, which is not a mutation label.*pointer to nothing/, nowhere.run.stdout)
})

test('adr-lint says UNPROVEN and names the per-source file that is not a catalogue', () => {
  const { run, advice } = enforcement({
    'tests/mutations/x.mjs.json': 'not json\n',
    'tests/mutations/y.mjs.json': serialize([entry('y', 'y.mjs')]),
  }, 'x')
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
  assert.ok(!run.stderr.includes('Traceback'), run.stderr)
  assert.match(advice, /Enforced-by names `x`.*UNPROVEN.*tests\/mutations\/x\.mjs\.json/, run.stdout)
  assert.ok(!advice.includes('which is not a mutation label'), advice)
})

test('mutate-propose counts a per-source catalogue file as catalogue and not as a test', () => {
  const root = scratch({
    'bin/demo-gate': '#!/bin/sh\n',
    'skills/demo/SKILL.md': '---\nname: demo\ndescription: Use when the user asks to mark it done, tick off a task, or to audit a run\n---\n\n# Demo\n\nBody.\n',
    'tests/demo.test.mjs': "assert.match(description, /to audit a run/)\n",
    'tests/mutations/skills/demo/SKILL.md.json': JSON.stringify({ mutations: [{ label: 'l', file: 'skills/demo/SKILL.md', tests: ['tests/demo.test.mjs'], from: 'tick off a task', to: 'x' }] }),
  })
  const byString = Object.fromEntries(proposals(root).map(found => [found.from, found]))
  assert.equal(byString['tick off a task']?.coverage, 'catalogued', JSON.stringify(byString['tick off a task']))
  // The twin: a string a real test names is asserted.
  assert.equal(byString['to audit a run']?.coverage, 'asserted')
})

// The guard is driven through the real pre-commit hook, which resolves the guard beside itself, in a
// scratch repository staging a new shipped file (CLAUDE.md §9).
const PROBE = 'plugin/scripts/catalogue-readers-probe.mjs'
function stagedProbe({ stageCatalogue }) {
  const dir = scratch({
    [PROBE]: 'export const x = 1\n',
    [`tests/mutations/${PROBE}.json`]: serialize([{ label: 'probe', file: PROBE, tests: ['tests/x.test.mjs'], from: 'x = 1', to: 'x = 2' }]),
  })
  git(dir, 'init', '-q', '-b', 'main', '.')
  git(dir, 'add', PROBE)
  if (stageCatalogue) git(dir, 'add', `tests/mutations/${PROBE}.json`)
  return spawnSync('bash', [join(repoRoot, '.githooks', 'pre-commit')], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
}

test('the staged guard passes an added source whose per-source file is staged', () => {
  const run = stagedProbe({ stageCatalogue: true })
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
})

test('the staged guard refuses an added source with no staged catalogue entry', () => {
  const run = stagedProbe({ stageCatalogue: false })
  assert.equal(run.status, 1, `${run.stdout}\n${run.stderr}`)
  assert.match(run.stderr, /REFUSED/)
  assert.ok(run.stderr.includes(PROBE), run.stderr)
})

// campaign-parity filters the clone's catalogue by `--tests`. Over per-source files, each is filtered,
// and one left empty is removed, since the campaign refuses an empty per-source file. The fixture's
// three entries move into tests/mutations/<source>.json first; it is the spec's fixture repository.
test('campaign-parity keeps only the entries whose tests include --tests, across per-source files', () => {
  const dir = campaignFixture()
  const { mutations } = JSON.parse(fixtureGit(dir, ['show', 'HEAD:tests/mutations.json']))
  fixtureGit(dir, ['rm', '-q', 'tests/mutations.json'])
  mkdirSync(join(dir, 'tests', 'mutations'))
  for (const source of ['lib.mjs', 'lib2.mjs']) {
    writeFileSync(join(dir, 'tests', 'mutations', `${source}.json`), serialize(mutations.filter(found => found.file === source)))
  }
  fixtureGit(dir, ['add', 'tests/mutations'])
  fixtureGit(dir, ['commit', '-qm', 'per-source'])
  const run = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'campaign-parity.mjs'), '--root', dir, '--tests', 'tests/lib2.test.mjs'],
    { cwd: dir, env: campaignEnv(), encoding: 'utf8', timeout: 240_000, windowsHide: true })
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
  assert.match(run.stdout, /^parity: 1 entries, 0 mismatches; worktree built in \d+ ms$/m)
})
