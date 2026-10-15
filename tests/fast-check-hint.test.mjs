// ADR-103 T1: after a passing full run that took a while, in a project with no `fastCheck`, qh-check names once the fast check
// the project's own runner offers, and only a command measured to pass through qh-check (2026-10-15, recorded in the task):
// vitest 5.0.4 `vitest run --changed` passed on a change no test covers; pytest-testmon 2.2.0 passed with its data file ignored;
// jest 30.5.2 `--onlyChanged` printed "No tests found related to files changed" and graded as no-work, so jest is not named.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { fastCheckHint } from '../plugin/scripts/fast-check-hint.mjs'

const qhCheckScript = fileURLToPath(new URL('../plugin/scripts/qh-check.mjs', import.meta.url))
const sandbox = () => realpathSync.native(mkdtempSync(path.join(process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-fast-hint-')))
const project = (top, name, files) => {
  const dir = path.join(top, name)
  mkdirSync(dir, { recursive: true })
  for (const [file, text] of Object.entries(files)) writeFileSync(path.join(dir, file), text)
  return dir
}
const COMMAND_IN_HINT = /`(?:npx vitest run --changed|pytest --testmon)`/

test("a runner's own fast check is named from its manifest", () => {
  const top = sandbox()
  try {
    const hint = files => fastCheckHint(project(top, `p${Math.random().toString(36).slice(2)}`, files))
    const vitest = hint({ 'package.json': JSON.stringify({ devDependencies: { vitest: '^5' } }) })
    assert.match(vitest, /`npx vitest run --changed`/)
    assert.match(vitest, /package\.json/)
    assert.match(hint({ 'package.json': JSON.stringify({ dependencies: { vitest: '^5', jest: '^30' } }) }), /`npx vitest run --changed`/, 'vitest before jest')
    const testmon = hint({ 'requirements-dev.txt': 'pytest\npytest-testmon==2.2.0\n' })
    assert.match(testmon, /`pytest --testmon`/)
    assert.match(testmon, /requirements-dev\.txt/)
    assert.match(testmon, /\.testmondata/, 'the data file the run writes is named, to be ignored')
    assert.match(hint({ 'pyproject.toml': '[project]\ndependencies = ["pytest-testmon"]\n' }), /`pytest --testmon`.*pyproject\.toml/s)
    // DIRTY twins: a runner measured not to pass through qh-check, a name outside the dependency fields, and no runner at all
    // draw the plain lever, with no command.
    for (const files of [
      { 'package.json': JSON.stringify({ devDependencies: { jest: '^30' } }) },
      { 'package.json': JSON.stringify({ scripts: { test: 'vitest' } }) },
      { 'README.md': 'nothing here\n' },
    ]) {
      const plain = hint(files)
      assert.match(plain, /fastCheck/)
      assert.doesNotMatch(plain, COMMAND_IN_HINT, JSON.stringify(files))
    }
  } finally { rmSync(top, { recursive: true, force: true }) }
})

const repoWith = (top, name, config) => {
  const repo = project(top, name, {
    'check.mjs': 'process.exit(process.env.QH_FAIL ? 1 : 0)\n',
    '.quality-harness.json': JSON.stringify(config),
    'package.json': JSON.stringify({ devDependencies: { vitest: '^5' } }),
  })
  const git = (...args) => spawnSync('git', ['-C', repo, '-c', 'user.name=qh', '-c', 'user.email=qh@example.invalid', ...args], { encoding: 'utf8', timeout: 60_000 })
  git('init', '-q')
  git('add', '-A')
  git('commit', '-q', '-m', 'one', '--no-gpg-sign')
  return repo
}
const qhCheck = (top, repo, env = {}) => spawnSync(process.execPath, [qhCheckScript], { cwd: repo, encoding: 'utf8', timeout: 120_000, windowsHide: true,
  env: { ...process.env, TMPDIR: top, TMP: top, TEMP: top, QUALITY_HARNESS_CHECK_AGAIN: '1', QUALITY_HARNESS_OBSERVE_BUDGET_MS: '60000', QUALITY_HARNESS_PROSE_HINT_MS: '0', ...env } })
const HINTED = /^qh-check: .*fastCheck.*`npx vitest run --changed`/m

test('a slow pass with no fastCheck hears it once, and nothing else hears it', () => {
  const top = sandbox()
  try {
    const repo = repoWith(top, 'plain', { check: 'node check.mjs' })
    const failed = qhCheck(top, repo, { QH_FAIL: '1' })
    assert.notEqual(failed.status, 0)
    assert.doesNotMatch(failed.stderr, HINTED, 'a failing run is not said the hint, and does not use it up')
    const first = qhCheck(top, repo)
    assert.equal(first.status, 0, first.stderr)
    assert.match(first.stderr, HINTED, first.stderr)
    assert.doesNotMatch(qhCheck(top, repo).stderr, HINTED, 'said once')
    // A pass under the duration says nothing.
    const quick = repoWith(top, 'quick', { check: 'node check.mjs' })
    assert.doesNotMatch(qhCheck(top, quick, { QUALITY_HARNESS_PROSE_HINT_MS: '600000' }).stderr, HINTED)
    // A project that declares a fastCheck already has the lever.
    const declared = repoWith(top, 'declared', { check: 'node check.mjs', fastCheck: 'node check.mjs' })
    assert.doesNotMatch(qhCheck(top, declared).stderr, /fastCheck/)
  } finally { rmSync(top, { recursive: true, force: true }) }
})

test('the hint says what a fast pass is, and writes nothing', () => {
  const top = sandbox()
  try {
    const repo = repoWith(top, 'words', { check: 'node check.mjs' })
    const config = readFileSync(path.join(repo, '.quality-harness.json'))
    const run = qhCheck(top, repo)
    assert.equal(run.status, 0, run.stderr)
    const line = run.stderr.split('\n').find(text => HINTED.test(text)) ?? ''
    assert.match(line, /`qh-check --commit` runs it and commits on its pass/, line)
    assert.match(line, /a push still needs the full check/, line)
    assert.deepEqual(readFileSync(path.join(repo, '.quality-harness.json')), config, 'the declaration is the owner\'s: nothing is written')
  } finally { rmSync(top, { recursive: true, force: true }) }
})

// ADR-103 T3, from the Codex review of T1 (2026-10-15): a mention of pytest-testmon anywhere in pyproject.toml was named as if
// declared, and the hint claimed "a minute or more" under a threshold set to 0.
test('a dependency is a declaration of that name, not a mention', () => {
  const top = sandbox()
  try {
    const hint = files => fastCheckHint(project(top, `p${Math.random().toString(36).slice(2)}`, files))
    for (const toml of [
      '[project]\ndependencies = [\n  # "pytest-testmon",\n  "pytest",\n]\n',
      '[project]\ndescription = "pytest-testmon based helpers"\n',
      '[project]\ndependencies = ["pytest-testmon-helper"]\n',
    ]) assert.doesNotMatch(hint({ 'pyproject.toml': toml }), COMMAND_IN_HINT, toml)
    assert.doesNotMatch(hint({ 'requirements.txt': '# pytest-testmon\npytest-testmon-helper==1\n' }), COMMAND_IN_HINT)
    // CLEAN twins: a real declaration in each form is named.
    for (const toml of ['[project]\ndependencies = ["pytest-testmon>=2"]\n', '[tool.poetry.group.dev.dependencies]\npytest-testmon = "*"\n']) {
      assert.match(hint({ 'pyproject.toml': toml }), /`pytest --testmon`/, toml)
    }
    assert.match(hint({ 'requirements.txt': 'pytest-testmon==2.2.0  # pinned\n' }), /`pytest --testmon`/)
    assert.doesNotMatch(hint({ 'README.md': 'x\n' }), /minute|second|took/, 'the hint claims no duration')
  } finally { rmSync(top, { recursive: true, force: true }) }
})

// ADR-103 T4, from the verification review of T3 (Codex, 2026-10-15): exact-name text outside a dependency position still read as
// a declaration.
test('only a dependency position declares a dependency', () => {
  const top = sandbox()
  try {
    const hint = toml => fastCheckHint(project(top, `p${Math.random().toString(36).slice(2)}`, { 'pyproject.toml': toml }))
    for (const toml of [
      '[project]\nname = "fx"\ndescription = "pytest-testmon"\n',
      '[tool.custom]\npytest-testmon = false\n',
      '[project]\ndependencies = ["pytest"]\n[tool.notes]\nlist = ["pytest-testmon"]\n',
    ]) assert.doesNotMatch(hint(toml), COMMAND_IN_HINT, toml)
    // CLEAN twins: each dependency position names it.
    for (const toml of [
      '[project]\nname = "fx"\ndependencies = [\n  "pytest",\n  "pytest-testmon>=2",\n]\n',
      '[project.optional-dependencies]\ndev = ["pytest-testmon"]\n',
      '[dependency-groups]\ntest = [\n  "pytest-testmon",\n]\n',
      '[tool.poetry.group.dev.dependencies]\npytest-testmon = "^2"\n',
    ]) assert.match(hint(toml), /`pytest --testmon`/, toml)
  } finally { rmSync(top, { recursive: true, force: true }) }
})

// From a peer's probe of 6e056260 on a pnpm monorepo (2026-10-15): where a fastCheck runs from decides its form there.
test('the hint says what a fastCheck is: one shell command from the repository root', () => {
  const top = sandbox()
  try {
    assert.match(fastCheckHint(project(top, 'plain', { 'README.md': 'x\n' })), /one shell command, run from the repository root/)
  } finally { rmSync(top, { recursive: true, force: true }) }
})
