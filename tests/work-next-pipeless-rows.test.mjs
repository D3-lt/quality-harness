// BACKLOG §381 at work-next: adr-lint's `done_task_ids` reads a README row or a spec fact row with no leading pipe (GFM
// does), so a pipe-less `done` row is a claim the gate checks against the Verification Log. work-next read only lines
// starting with `|`: it routed past a claim the gate refuses, and a pipe-less @spec fact row was not in the spec's ids,
// so an uncovered Ready-for-ADR spec looked covered. Every case goes through work-next's CLI, over a corpus built here.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workNext = path.join(repoRoot, 'plugin', 'scripts', 'work-next.mjs')
const adrLint = path.join(repoRoot, 'plugin', 'bin', 'adr-lint')
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-pipeless-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))

const run = (command, args, cwd) => {
  const done = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(done.error, undefined, String(done.error))
  return done
}
const git = cwd => assert.equal(run('git', ['init', '-q', '-b', 'main'], cwd).status, 0)
const json = root => {
  const done = run(process.execPath, [workNext, '--json'], root)
  assert.equal(done.status, 0, done.stderr)
  return JSON.parse(done.stdout)
}
const names = list => list.map(file => path.posix.basename(file.replaceAll('\\', '/'))).sort()

// A task with an Acceptance fence and no Verification Log: a `done` claim on it has nothing behind it.
const TASK = id => `# Task ADR-001-${id}\n\n**Depends-on:** none\n\n## Acceptance\n\n\`\`\`bash\ntrue\n\`\`\`\n`
function tasksCorpus(name, readmeRows) {
  const root = mkdtempSync(path.join(scratch, `${name}-`))
  const tasks = path.join(root, 'docs', 'adr', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(path.join(root, 'docs', 'adr', 'ADR-001-thing.md'), '# ADR-001: A thing\n\n**Status:** Accepted\n')
  for (const id of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']) writeFileSync(path.join(tasks, `${id}-a.md`), TASK(id))
  // One task with evidence, so the corpus uses the Verification Log at all (work-next routes on unbacked claims only then).
  writeFileSync(path.join(tasks, 'T7-a.md'), `${TASK('T7')}\n## Verification Log\n\n- 2026-08-26 · abc1234 · exit 0 · \`true\` · acceptance-sha256:b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b\n`)
  writeFileSync(path.join(tasks, 'README.md'), `# Tasks\n\n${readmeRows}\n`)
  git(root)
  return { root, tasks }
}
const HEADER = '| Order | Task | Scope | Depends-on | Status |\n|-------|------|-------|------------|--------|\n'

test('a README done row with no leading pipe is an unbacked claim, routed to adr-verify like its piped twin', () => {
  const piped = json(tasksCorpus('piped', `${HEADER}| 1 | [T1](T1-a.md) | S | none | done |`).root)
  assert.deepEqual(names(piped.unbackedDoneClaims), ['T1-a.md'], JSON.stringify(piped))
  assert.equal(piped.next.id, 'adr-verify')
  const bare = json(tasksCorpus('bare', `${HEADER}1 | [T1](T1-a.md) | S | none | done`).root)
  assert.deepEqual(names(bare.unbackedDoneClaims), ['T1-a.md'], JSON.stringify(bare))
  assert.equal(bare.next.id, 'adr-verify')
  // Neither edge pipe, the id first.
  const edgeless = json(tasksCorpus('edgeless', 'Task | Status\n--- | ---\nT2 | done').root)
  assert.deepEqual(names(edgeless.unbackedDoneClaims), ['T2-a.md'], JSON.stringify(edgeless))
})

test('a README pending row with no leading pipe claims nothing', () => {
  const pending = json(tasksCorpus('pending', `${HEADER}1 | [T1](T1-a.md) | S | none | pending\n2 | [T2](T2-a.md) | S | none | done`).root)
  assert.deepEqual(names(pending.unbackedDoneClaims), ['T2-a.md'], 'the done row is a claim and the pending row beside it is not')
  // A Depends-on cell naming a done task is not that task's claim (leftmost id is the row's own).
  const depends = json(tasksCorpus('depends', `${HEADER}1 | [T3](T3-a.md) | S | T4 | pending`).root)
  assert.deepEqual(depends.unbackedDoneClaims, [], JSON.stringify(depends))
})

test('work-next reads the same README done claims as adr-lint, pipe-less rows included', () => {
  const rows = [
    HEADER.trimEnd(),
    '1 | [T1](T1-a.md) | S | none | done',
    '2 | [T2](T2-a.md) | S | none | pending',
    '| 3 | [T3](T3-a.md) | S | none | done |',
    'T4 | done',
    '',
    'Second table, no edge pipes:',
    '',
    'Task | Status',
    '--- | ---',
    'T5 | done',
    '',
    'A pipe line outside any table is still read:',
    '',
    'T6 | done',
  ].join('\n')
  const { root, tasks } = tasksCorpus('crosscheck', rows)
  const claims = names(json(root).unbackedDoneClaims).map(file => file.slice(0, 2))
  const read = run('python3', ['-I', '-c',
    'import sys, importlib.util as U; from importlib.machinery import SourceFileLoader as L; '
    + 's = U.spec_from_loader("adr_lint", L("adr_lint", sys.argv[1])); m = U.module_from_spec(s); s.loader.exec_module(m); '
    + 'print(" ".join(sorted(m.done_task_ids(open(sys.argv[2], encoding="utf-8").read()))))',
    adrLint, path.join(tasks, 'README.md')], root)
  assert.equal(read.status, 0, read.stderr)
  const lint = read.stdout.trim().split(' ').filter(Boolean)
  assert.deepEqual(claims, lint, `work-next ${claims} vs adr-lint ${lint}`)
  assert.deepEqual(lint, ['T1', 'T3', 'T4', 'T5', 'T6'], 'the fixture itself must hold both piped and pipe-less claims')
})

// A Ready-for-ADR spec whose F-1 a record covers, plus one more @spec fact row written as GFM allows.
function specCorpus(name, factRows) {
  const root = mkdtempSync(path.join(scratch, `${name}-`))
  mkdirSync(path.join(root, 'docs', 'specs'), { recursive: true })
  const dir = path.join(root, 'docs', 'adr', 'ADR-001-selftest')
  mkdirSync(path.join(dir, 'tasks'), { recursive: true })
  writeFileSync(path.join(root, 'docs', 'specs', '2026-09-09-a.md'), [
    '# Spec: a', '', '> **Date:** 2026-09-09 · **Status:** Ready-for-ADR', '', '## Facts', '',
    '| ID | Assertion | Test | Tag |', '|----|-----------|------|-----|', '| F-1 | one | `tests/x.test.mjs::x` | @spec |',
    factRows, '',
  ].join('\n'))
  writeFileSync(path.join(root, 'docs', 'adr', 'ADR-001-selftest.md'),
    readFileSync(path.join(repoRoot, 'tests', 'fixtures', 'ok', 'ADR-001-selftest.md'), 'utf8')
      .replace(/^\*\*Spec:\*\* .*$/m, '**Spec:** docs/specs/2026-09-09-a.md'))
  cpSync(path.join(repoRoot, 'tests', 'fixtures', 'ok', 'tasks', 'T1-fixture.md'), path.join(dir, 'tasks', 'T1-fixture.md'))
  git(root)
  return root
}

test('a spec fact row with no leading pipe is bound: an uncovered one routes the spec to adr-write, as its piped twin does', () => {
  // The control: F-1 alone is covered, so nothing is owed.
  const covered = json(specCorpus('covered', ''))
  assert.deepEqual(covered.uncoveredReadySpecs, [], JSON.stringify(covered))
  for (const row of ['| F-99 | uncovered | `tests/x.test.mjs::y` | @spec |', 'F-99 | uncovered | `tests/x.test.mjs::y` | @spec']) {
    const state = json(specCorpus('uncovered', row))
    assert.deepEqual(names(state.uncoveredReadySpecs), ['2026-09-09-a.md'], row)
    assert.equal(state.next.id, 'adr-write', row)
  }
})
