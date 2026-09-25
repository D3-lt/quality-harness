// What every reader SAYS about a corpus shaped unlike this one — spawned, through
// a symlink, compared with a reviewed expectation.
//
// Every product defect that reached an adopter this month was in a reader's
// answer over a consumer-shaped corpus, and every one was found by a peer running
// the readers by hand: fixtures counted as records, retired records offered for
// retirement, a CLI silent through a symlink, a check that could not start under
// cmd.exe (BACKLOG §261, §263, §264). The one foreign fixture had not grown since
// 2026-08-30, its test imported `observe()` instead of spawning, and at one point
// it explicitly ALLOWED the answer that became v2.83.0's defect. So this file
// drives `plugin/scripts/corpus-probe.mjs` — the same command an adopter pastes —
// over every corpus under `tests/fixtures/corpora/` and the foreign one, on every
// CI platform, and holds each answer to
// `expected.json`, which was read and judged, not snapshotted (§112 rejected
// golden text; these are structured values with a reason beside each corpus).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { linkDirectory } from './symlink-support.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const corporaDir = path.join(repoRoot, 'tests', 'fixtures', 'corpora')
// `os.tmpdir()` unresolved on purpose: on macOS that is the symlinked spelling
// (`/var` → `/private/var`), which is one of the two conditions §264 needs.
const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-matrix-'))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))

const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.invalid',
  GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.invalid' }

/** Copy a corpus into its own repository, then reach both it and the plugin through a symlink. */
function stage(name, source) {
  const real = path.join(scratch, `${name}-real`)
  cpSync(source, real, { recursive: true })
  for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['commit', '-qm', 'fixture']]) {
    const r = spawnSync('git', args, { cwd: real, env: GIT_ENV, encoding: 'utf8', timeout: 60_000 })
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  }
  const corpus = path.join(scratch, `${name}-link`)
  linkDirectory(real, corpus)
  const plugin = path.join(scratch, `${name}-plugin`)
  linkDirectory(path.join(repoRoot, 'plugin'), plugin)
  assert.notEqual(realpathSync(corpus), corpus, 'the corpus really is reached through a link, or §264 is not under test')
  return { corpus, plugin }
}

function probe(name, source) {
  const { corpus, plugin } = stage(name, source)
  const run = spawnSync(process.execPath, [path.join(plugin, 'scripts', 'corpus-probe.mjs'), '--json', '--sweep', '--timeout', '120'],
    { cwd: corpus, encoding: 'utf8', timeout: 300_000 })
  assert.equal(run.status, 0, `${name}: corpus-probe exit ${run.status}\n${run.stderr}\n${run.stdout.slice(0, 2000)}`)
  let report
  try { report = JSON.parse(run.stdout) } catch { assert.fail(`${name}: corpus-probe printed no JSON:\n${run.stdout.slice(0, 2000)}`) }
  return report
}

// The values a reviewer judged, per corpus. Anything the probe reports that is
// not in here is not asserted; anything in here the probe does not report fails.
function expectations(dir) {
  return JSON.parse(readFileSync(path.join(dir, 'expected.json'), 'utf8'))
}

const corpora = [
  ...readdirSync(corporaDir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => [entry.name, path.join(corporaDir, entry.name)]),
  ['foreign', path.join(repoRoot, 'tests', 'fixtures', 'foreign')],
]

// ADR-064 T6's three corpora are selected by the directory discovery above, and a
// test the lock can hash says so: the per-corpus tests below are named by a
// template, which no test lock can extract.
test('the matrix discovers the three ADR-064 corpora', () => {
  const names = corpora.map(([name]) => name)
  for (const name of ['rust-crate', 'php-multi-root', 'js-vitest-spa']) assert.ok(names.includes(name), `${name} is discovered: ${names}`)
})

for (const [name, dir] of corpora) {
  test(`corpus ${name}: every reader answers as reviewed, through a symlink`, () => {
    const expected = expectations(dir)
    const report = probe(name, dir)
    // Nothing a reader could not do is allowed to pass as silence.
    assert.deepEqual(report.couldNotRun, expected.couldNotRun ?? [], `${name}: readers that could not run:\n${JSON.stringify(report.couldNotRun, null, 2)}`)
    assert.equal(report.look, expected.look, `${name}: look`)
    assert.deepEqual(report.corpora, expected.corpora, `${name}: corpus directories`)
    assert.deepEqual(report.records.map(r => [r.file, r.kind, r.frozen]), expected.records, `${name}: records read, with kind and frozen:\n${JSON.stringify(report.records, null, 2)}`)
    // `readinessUnproven` is asserted: a valid exit-3 answer was read as unproven
    // for a whole review round because nothing here looked (Codex, bdeba73).
    const fixedWorkNext = ['records', 'accepted', 'tasks', 'ready', 'unbacked', 'retirable', 'readinessUnproven', 'next']
    assert.deepEqual({ records: report.workNext.records, accepted: report.workNext.accepted, tasks: report.workNext.tasks,
      ready: report.workNext.ready, unbacked: report.workNext.unbacked, retirable: report.workNext.retirable,
      readinessUnproven: report.workNext.readinessUnproven, next: report.workNext.next?.id ?? null },
    Object.fromEntries(Object.entries(expected.workNext).filter(([key]) => fixedWorkNext.includes(key))),
    `${name}: work-next:\n${JSON.stringify(report.workNext, null, 2)}`)
    // Any other work-next key is compared only where an expectation names it —
    // `unmarkedArchives` (§281 item 3), `readyButClaimedDone` (§280 item 4) — so a
    // corpus that names none answers exactly as before (ADR-064 T6).
    for (const [key, value] of Object.entries(expected.workNext).filter(([key]) => !fixedWorkNext.includes(key))) {
      assert.deepEqual(report.workNext[key], value, `${name}: work-next ${key}:\n${JSON.stringify(report.workNext, null, 2)}`)
    }
    assert.deepEqual({ read: report.adrState.read, governing: report.adrState.governing }, expected.adrState, `${name}: adr-state`)
    assert.deepEqual(report.adrNext.map(entry => ({ tasksDir: entry.tasksDir, ready: entry.ready?.map(task => task.id) ?? null })), expected.adrNext, `${name}: adr-next:\n${JSON.stringify(report.adrNext, null, 2)}`)
    // The gate's own verdict per record — where ADR-038's `not-recognised` shows
    // beside readers that counted the same file. Declared in every expectation
    // and, until a review noticed, asserted by none (Codex, c1f546a).
    assert.deepEqual(report.adrLint.map(entry => ({ file: entry.file, verdict: entry.verdict })),
      expected.adrLint.map(({ reasonMatches, ...entry }) => entry), `${name}: adr-lint:\n${JSON.stringify(report.adrLint, null, 2)}`)
    // A verdict can be right for the wrong reason. Where an expectation names the
    // reason, the report's must match it: a stale Tests row's FAIL names the row's
    // `file:line` (§280 item 2), and a different FAIL on the same record is not it.
    for (const { file, reasonMatches } of expected.adrLint.filter(entry => entry.reasonMatches !== undefined)) {
      const reason = report.adrLint.find(entry => entry.file === file)?.reason
      assert.ok(typeof reason === 'string' && new RegExp(reasonMatches).test(reason), `${name}: ${file} reason must match /${reasonMatches}/, got ${JSON.stringify(reason)}`)
    }
    // A frozen record is still linted, and its entry says it is frozen, so a reader
    // can set an archive's verdicts aside. Reported from a Laravel corpus whose
    // archive read FAIL beside the live records (BACKLOG §279 item 4).
    const frozenFiles = new Set(report.records.filter(r => r.frozen).map(r => r.file))
    assert.deepEqual(report.adrLint.filter(entry => entry.frozen === true).map(entry => entry.file).sort(),
      report.adrLint.map(entry => entry.file).filter(file => frozenFiles.has(file)).sort(),
      `${name}: every frozen record's lint entry, and only those, carries frozen: true`)
    // Every file field joins with records[] exactly. adr-state prints native
    // separators; on Windows its governingNothing entries alone came back in
    // backslashes (BACKLOG §279 item 5). This bites on the Windows CI job.
    const recordFiles = new Set(report.records.map(r => r.file))
    for (const entry of report.adrState?.governingNothing ?? []) {
      assert.ok(recordFiles.has(entry.file), `${name}: governingNothing names ${entry.file}, which no record has`)
    }
    // A FAIL says why, so a runner can report the cause and not only the verdict
    // (BACKLOG §279 item 9).
    for (const entry of report.adrLint.filter(e => e.verdict === 'FAIL')) {
      assert.ok(typeof entry.reason === 'string' && entry.reason.length > 0, `${name}: ${entry.file} FAILs with no reason`)
    }
    assert.ok(report.adrLint.filter(e => e.verdict !== 'FAIL').every(e => !('reason' in e)), `${name}: only a FAIL carries a reason`)
    assert.deepEqual(report.sweep.map(entry => ({ root: entry.root, claims: entry.claims, held: entry.held, false: entry.false, superseded: entry.superseded, unrunnable: entry.unrunnable })), expected.sweep, `${name}: sweep buckets:\n${JSON.stringify(report.sweep, null, 2)}`)
    assert.deepEqual(report.disagreements.map(d => ({ task: d.task, adrNext: d.adrNext, workNext: d.workNext })), expected.disagreements, `${name}: readers disagree:\n${JSON.stringify(report.disagreements, null, 2)}`)
    for (const line of expected.sessionStart.mustMatch ?? []) {
      assert.ok(report.sessionStart.lines.some(text => new RegExp(line).test(text)), `${name}: SessionStart must say /${line}/:\n${report.sessionStart.lines.join('\n')}`)
    }
    for (const line of expected.sessionStart.mustNotMatch ?? []) {
      assert.ok(!report.sessionStart.lines.some(text => new RegExp(line).test(text)), `${name}: SessionStart must not say /${line}/:\n${report.sessionStart.lines.join('\n')}`)
    }
    // Rules every corpus obeys, whatever its shape.
    const everything = JSON.stringify(report)
    for (const forbidden of expected.neverNamed ?? []) {
      assert.ok(!everything.includes(forbidden), `${name}: "${forbidden}" must not appear anywhere in the report`)
    }
    assert.ok(!/ADR-00\?/.test(everything), `${name}: no reader prints ADR-00? as a record id`)
    assert.ok(!everything.includes(scratch), `${name}: the report names no absolute path (§6)`)
  })
}
