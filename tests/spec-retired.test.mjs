// ADR-120 T3: `@retired` tags a spec fact or scenario whose behaviour was reversed and whose test was deleted. Each reader
// is driven through its CLI over a corpus built here, and every "nothing owed" case has the live twin beside it that is owed.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const specVerify = path.join(repoRoot, 'plugin', 'bin', 'spec-verify')
const adrLint = path.join(repoRoot, 'plugin', 'bin', 'adr-lint')
const workNext = path.join(repoRoot, 'plugin', 'scripts', 'work-next.mjs')
const okFixture = path.join(repoRoot, 'tests', 'fixtures', 'ok')
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-retired-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))

const run = (command, args, cwd) => {
  const done = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 120_000, windowsHide: true })
  assert.equal(done.error, undefined, String(done.error))
  return done
}
const said = done => `${done.stdout}${done.stderr}`
const python = (args, cwd) => run('python3', ['-I', ...args], cwd)

// The shipped spec fixture with its two scenarios and two facts rewritten: a live pair bound to a test that exists and
// passes, and a pair bound to `gone`, a test that does not exist. A `Cmd` of `exit 1` on that pair means that any reader
// that ran it would fail it.
function specRepo (name, { goneTag, goneTest = 'tests/gone.test.mjs::gone', factTag = goneTag }) {
  const dir = mkdtempSync(path.join(scratch, `${name}-`))
  mkdirSync(path.join(dir, 'tests'))
  writeFileSync(path.join(dir, 'package.json'), '{}\n')
  writeFileSync(path.join(dir, 'tests', 'ok.test.mjs'), "import test from 'node:test'\ntest('ok', () => {})\n")
  const text = readFileSync(path.join(okFixture, 'spec-selftest.md'), 'utf8')
    .replace(/^### UC1-S1 .*$/m, '### UC1-S1 [happy] Conforming fixtures pass every gate [@implemented] → `tests/ok.test.mjs::ok` cmd:`node --test tests/ok.test.mjs`')
    .replace(/^### UC1-S2 .*$/m, `### UC1-S2 [failure] A malformed artifact is rejected, not silently accepted [@${goneTag}] → \`${goneTest}\` cmd:\`exit 1\``)
    .replace(/^\| F-1 .*$/m, '| F-1 | A conforming pair makes adr-lint exit 0 | `tests/ok.test.mjs::ok` | @implemented | `node --test tests/ok.test.mjs` |')
    .replace(/^\| F-2 .*$/m, `| F-2 | A placeholder-filled artifact never exits 0 | \`${goneTest}\` | @${factTag} | \`exit 1\` |`)
  writeFileSync(path.join(dir, 'spec.md'), text)
  return dir
}
const verify = (dir, mode) => python([specVerify, mode, '--repo', dir, path.join(dir, 'spec.md')], dir)

test('a retired fact or scenario is neither required nor run', () => {
  const retired = specRepo('retired', { goneTag: 'retired' })
  for (const mode of ['--spec', '--implemented']) {
    const done = verify(retired, mode)
    assert.equal(done.status, 0, `${mode}\n${said(done)}`)
    assert.doesNotMatch(said(done), /NOTEST|\[FAIL\]|RED|advice/, `${mode} says nothing about a retired row with no test\n${said(done)}`)
  }
  // The live twins: the same absent test under @implemented is a missing test, and a present one that fails is a failing test.
  const missing = verify(specRepo('live-fact', { goneTag: 'retired', factTag: 'implemented' }), '--spec')
  assert.notEqual(missing.status, 0, said(missing))
  assert.match(said(missing), /F-2: bound test not found/, said(missing))
  const scenario = verify(specRepo('live-scenario', { goneTag: 'implemented', factTag: 'retired' }), '--spec')
  assert.match(said(scenario), /UC1-S2: bound test not found/, said(scenario))
  const ran = verify(specRepo('ran', { goneTag: 'retired', factTag: 'implemented', goneTest: 'tests/ok.test.mjs::ok' }), '--implemented')
  assert.match(said(ran), /F-2: test failing/, 'a live fact bound to `exit 1` fails when it runs')

  // adr-lint asks a record to cover only the @spec and @implemented ids, so a retired one is owed no task.
  const read = dir => python(['-c',
    'import sys, importlib.util as U; from importlib.machinery import SourceFileLoader as L; '
    + 's = U.spec_from_loader("adr_lint", L("adr_lint", sys.argv[1])); m = U.module_from_spec(s); s.loader.exec_module(m); '
    + 'print(" ".join(sorted(m.spec_ids(sys.argv[2]))))', adrLint, path.join(dir, 'spec.md')], dir)
  const owed = read(retired)
  assert.equal(owed.status, 0, said(owed))
  assert.equal(owed.stdout.trim(), 'F-1 UC1-S1', 'F-2 and UC1-S2 are retired')
  const live = read(specRepo('lint-live', { goneTag: 'spec' }))
  assert.equal(live.stdout.trim(), 'F-1 F-2 UC1-S1 UC1-S2', 'the same rows tagged @spec are owed')
})

test('a retired row that still binds a present test is advised', () => {
  const present = specRepo('present', { goneTag: 'retired', goneTest: 'tests/ok.test.mjs::ok' })
  for (const mode of ['--spec', '--implemented']) {
    const done = verify(present, mode)
    assert.equal(done.status, 0, `${mode}: advice, not a refusal\n${said(done)}`)
    assert.match(said(done), /F-2: @retired, but its bound test still exists/, `${mode}\n${said(done)}`)
    assert.match(said(done), /UC1-S2: @retired, but its bound test still exists/, `${mode}\n${said(done)}`)
  }
  // The twin: a retired row whose test is gone is not advised.
  assert.doesNotMatch(said(verify(specRepo('absent', { goneTag: 'retired' }), '--spec')), /still exists/)
})

test('a tag that is not one of the four is still refused', () => {
  const fact = verify(specRepo('bad-fact', { goneTag: 'retired', factTag: 'retire' }), '--spec')
  assert.equal(fact.status, 1, said(fact))
  assert.match(said(fact), /F-2: bad tag '@retire'/, said(fact))
  const scenario = verify(specRepo('bad-scenario', { goneTag: 'retire' }), '--spec')
  assert.match(said(scenario), /scenario heading does not match grammar/, said(scenario))
  // ...and a draft is still refused at --spec, beside the retired row that is not.
  const draft = verify(specRepo('draft', { goneTag: 'retired', factTag: 'draft', goneTest: '— to bind' }), '--spec')
  assert.match(said(draft), /F-2: still @draft/, said(draft))
})

// A Ready-for-ADR spec in a corpus whose one record covers F-1 only; `rows` follow F-1 in the Facts table.
function workNextRepo (name, rows, scenarios = '') {
  const root = mkdtempSync(path.join(scratch, `${name}-`))
  mkdirSync(path.join(root, 'docs', 'specs'), { recursive: true })
  const dir = path.join(root, 'docs', 'adr', 'ADR-001-selftest')
  mkdirSync(path.join(dir, 'tasks'), { recursive: true })
  writeFileSync(path.join(root, 'docs', 'specs', '2026-09-09-a.md'), [
    '# Spec: a', '', '> **Date:** 2026-09-09 · **Status:** Ready-for-ADR', '', '## Scenarios', '', scenarios, '## Facts', '',
    '| ID | Assertion | Test | Tag |', '|----|-----------|------|-----|', '| F-1 | one | `tests/x.test.mjs::x` | @spec |',
    rows, '',
  ].join('\n'))
  writeFileSync(path.join(root, 'docs', 'adr', 'ADR-001-selftest.md'),
    readFileSync(path.join(okFixture, 'ADR-001-selftest.md'), 'utf8').replace(/^\*\*Spec:\*\* .*$/m, '**Spec:** docs/specs/2026-09-09-a.md'))
  cpSync(path.join(okFixture, 'tasks', 'T1-fixture.md'), path.join(dir, 'tasks', 'T1-fixture.md'))
  assert.equal(run('git', ['init', '-q', '-b', 'main'], root).status, 0)
  return root
}
const owes = root => {
  const done = run(process.execPath, [workNext, '--json'], root)
  assert.equal(done.status, 0, done.stderr)
  return JSON.parse(done.stdout).uncoveredReadySpecs.map(file => path.posix.basename(file.replaceAll('\\', '/')))
}
const SPEC = ['2026-09-09-a.md']

test('work-next owes nothing for a retired id', () => {
  const row = (id, tag) => `| ${id} | gone | \`tests/x.test.mjs::y\` | ${tag} |`
  const scenario = tag => `### UC1-S9 [happy] gone [@${tag}] → \`tests/x.test.mjs::z\`\n`
  // Partly retired: F-1 is covered, and the other ids are retired.
  assert.deepEqual(owes(workNextRepo('partly', `${row('F-9', '@retired')}\n${row('F-8', '@retired')}`, scenario('retired'))), [])
  // ...and the live twins of each retired id are owed.
  assert.deepEqual(owes(workNextRepo('live-fact', row('F-9', '@spec'), scenario('retired'))), SPEC)
  assert.deepEqual(owes(workNextRepo('live-scenario', row('F-9', '@retired'), scenario('spec'))), SPEC)
  // A row written without its leading pipe is retired the same way.
  assert.deepEqual(owes(workNextRepo('bare', 'F-9 | gone | `tests/x.test.mjs::y` | @retired')), [])
  // Wholly retired: no live id, so nothing is owed, though no record covers any of them.
  const wholly = workNextRepo('wholly', '')
  const specFile = path.join(wholly, 'docs', 'specs', '2026-09-09-a.md')
  writeFileSync(specFile, [
    '# Spec: a', '', '> **Date:** 2026-09-09 · **Status:** Ready-for-ADR', '', '## Scenarios', '', scenario('retired'),
    '## Facts', '', '| ID | Assertion | Test | Tag |', '|----|-----------|------|-----|', row('F-9', '@retired'), '',
  ].join('\n'))
  assert.deepEqual(owes(wholly), [])
  // A spec with no recognised id keeps today's route: it is uncovered.
  writeFileSync(specFile, '# Spec: a\n\n> **Date:** 2026-09-09 · **Status:** Ready-for-ADR\n\nNo facts here.\n')
  assert.deepEqual(owes(wholly), SPEC)
})

// The Codex review of ee802e5d..8d021b2a (2026-10-21): `@retired` in another cell of a fact's row retired it.
test('only the Tag column retires a fact, wherever the table puts it', () => {
  // The word in the Assertion cell, the Tag live: owed. Its twin, the word in the Tag cell: not owed.
  assert.deepEqual(owes(workNextRepo('word-elsewhere', '| F-9 | @retired | `tests/x.test.mjs::x` | @spec |')), SPEC)
  assert.deepEqual(owes(workNextRepo('word-in-tag', '| F-9 | @retired | `tests/x.test.mjs::x` | @retired |')), [])
  // A table that puts Tag second: the header names the column, so the Tag cell retires and the last cell does not.
  const reordered = (name, tag, last) => {
    const root = workNextRepo(name, '')
    writeFileSync(path.join(root, 'docs', 'specs', '2026-09-09-a.md'), [
      '# Spec: a', '', '> **Date:** 2026-09-09 · **Status:** Ready-for-ADR', '', '## Facts', '',
      '| ID | Tag | Assertion | Test |', '|----|-----|-----------|------|', `| F-9 | ${tag} | gone | ${last} |`, '',
    ].join('\n'))
    return root
  }
  assert.deepEqual(owes(reordered('tag-second', '@retired', '@spec')), [])
  assert.deepEqual(owes(reordered('tag-second-live', '@spec', '@retired')), SPEC)
  // A row with more cells than its header cannot say which is its Tag, and a row outside any table has no Tag column: both stay live.
  assert.deepEqual(owes(workNextRepo('extra-cell', '| F-9 | gone | `tests/x.test.mjs::y` | @retired | extra |')), SPEC)
  const bare = workNextRepo('no-table', '')
  writeFileSync(path.join(bare, 'docs', 'specs', '2026-09-09-a.md'), [
    '# Spec: a', '', '> **Date:** 2026-09-09 · **Status:** Ready-for-ADR', '', '## Facts', '',
    '| ID | Assertion | Test | Tag |', '|----|-----------|------|-----|', '| F-1 | one | `tests/x.test.mjs::x` | @spec |', '',
    'F-9 | gone | `tests/x.test.mjs::y` | @retired', '',
  ].join('\n'))
  assert.deepEqual(owes(bare), SPEC)
})
