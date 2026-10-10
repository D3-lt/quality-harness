// BACKLOG §319's addendum: two findings from go-cli-adr-corpus's corpus-chaos run of cd7e6ab
// (reproduced at e016066 and still open at ffd4892), both about what a pasted probe says.
// - The probe kept adr-lint's verdict and dropped its advice, so a PASS with advice was reported
//   as a bare PASS, in the JSON and in the text.
// - corpus-report's `showsFailing` read as "230 of 230 failing". It counts tasks SHOWN ABLE TO
//   FAIL — a red entry, a red-first row included, or a killed mutant — which is the count the
//   tool means. The key was the defect, not the count.
// - The review of that fix: advice rode as an empty list on entries the gate never checked
//   (not-recognised, could not run), and --diff compared a verdict but never its advice. And
//   adr-lint's `[strictFrom]` line, printed ABOVE the verdict, was read as the verdict line.
// Each test goes through the probe, the boundary both findings came through, with a control beside
// every assertion, so a check that can only say "clean" fails here (CLAUDE.md §4).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { scrubber } from '../plugin/scripts/corpus-probe.mjs'
import { spawnGate } from '../plugin/scripts/ready-lines.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pluginRoot = join(repoRoot, 'plugin')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })
// Resolved, because the probe reads its root through realpath and adr-lint prints what it was given.
const temp = () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'qh-chaos-315-probe-')))
  temps.push(dir)
  return dir
}
const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.invalid',
  GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.invalid' }
// Every git this file runs runs in a directory it made (CLAUDE.md §9).
const git = (dir, ...args) => {
  const run = spawnSync('git', args, { cwd: dir, env: GIT_ENV, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`)
}
const write = (dir, rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text) }
// 300s: the probe spawns every reader, and a Windows runner's first Python spawn can take 30
// (tests/adr-next.test.mjs:29).
const probe = (repo, args = []) => spawnSync(process.execPath, [join(pluginRoot, 'scripts', 'corpus-probe.mjs'), ...args],
  { cwd: repo, encoding: 'utf8', timeout: 300_000, windowsHide: true })
const probeJson = repo => {
  const run = probe(repo, ['--json'])
  assert.equal(run.status, 0, run.stderr)
  return JSON.parse(run.stdout)
}
const node = (script, args, cwd) => spawnSync(process.execPath, [join(pluginRoot, 'scripts', script), ...args],
  { cwd, encoding: 'utf8', timeout: 60_000, windowsHide: true })
// adr-lint run the way the probe runs it — the absolute record and its tasks directory, from the
// root, its advice-survival note in scratch.
const gate = (repo, record, tasksDir) => {
  const run = spawnGate(join(pluginRoot, 'bin', 'adr-lint'), [join(repo, record), ...(tasksDir ? [join(repo, tasksDir)] : [])],
    { cwd: repo, encoding: 'utf8', timeout: 60_000, env: { ...process.env, QUALITY_HARNESS_STATE_DIR: temp() } })
  assert.ok(!run.error, String(run.error))
  return run
}
// Every advice-class line the gate printed, verbatim.
const adviceFromTheGate = (repo, record, tasksDir) => `${gate(repo, record, tasksDir).stdout}`.split('\n').filter(line => /^ {2}advice/.test(line))
// A record adr-lint checks, passes, and has nothing to advise about — measured, not assumed: the
// test below asserts the gate's own output for it is empty before using it as the control.
const CONTROL = '# ADR-902: control\n\n**Status:** Accepted\n**Date:** 2026-09-07\n'
  + '**Spec:** None — no spec stage\n**Served-path change:** None — this ADR changes only measurement or tooling\n\n'
  + '## Context\n\nS.\n\n## Decision\n\nDo it.\n\n## Alternatives Considered\n\n- Not doing it: rejected, it leaves the cost.\n\n'
  + '## Consequences\n\nA cost.\n\n## Wiring & Contract Changes\n\nNone — implementation-internal only\n'

test('the probe carries what adr-lint advised, scrubbed, and a record the gate never checked carries no advice at all', () => {
  const repo = temp()
  git(repo, 'init', '-q')
  write(repo, 'docs/adr/ADR-900-probe.md', '# ADR-900: probe\n\n**Status:** Accepted\n**Date:** 2026-09-07\n\n'
    + '## Context\n\nS.\n\n## Decision\n\nDo it.\n\n## Consequences\n\nA cost.\n')
  // A withdrawn task, so the gate prints an `advice withheld:` line as well as `advice:` lines.
  write(repo, 'docs/adr/ADR-900-probe/tasks/T2.md', '# Task ADR-900-T2: probe\n\n**Status:** Withdrawn 2026-08-22. '
    + 'It will not be built\n\n## Acceptance\n\n```bash\ntrue\n```\n\n## Verification Log\n')
  // A record no reader can open: the probe names it `unread` and never runs adr-lint on it.
  write(repo, 'docs/adr/ADR-901-x.md', '# ADR-901: X\n\n**Status:** Acc\u0000epted\n\n## Context\n\nx\n')
  // A record the gate checks, passes, and does not advise on.
  write(repo, 'docs/adr/ADR-902-control.md', CONTROL)
  // A file the corpus reader lists by its number and the gate never checks: not-recognised, exit
  // 2, "nothing here was checked". Since ADR-074 a MADR record with a Status and a `## Context` is
  // linted, so the file that stands for this arm is one with no record content at all.
  write(repo, 'docs/adr/0005-notes.md', '# Notes\n\nNothing is decided here.\n')
  const report = probeJson(repo)
  const entry = file => report.adrLint.find(each => each.file === file)
  const scrub = scrubber({ root: repo, pluginRoot })

  const said = adviceFromTheGate(repo, 'docs/adr/ADR-900-probe.md', 'docs/adr/ADR-900-probe/tasks')
  // What the gate said, which the probe must carry: advice, a withheld count, and one line naming
  // an absolute path, so the scrub is under test too.
  assert.ok(said.some(line => line.startsWith('  advice: ')), said.join('\n'))
  assert.ok(said.some(line => line.startsWith('  advice withheld: ')), said.join('\n'))
  assert.ok(said.some(line => line.includes(repo)), `the gate names the absolute path here:\n${said.join('\n')}`)
  assert.deepEqual(entry('docs/adr/ADR-900-probe.md').advice, said.map(line => scrub(line.trim())), JSON.stringify(entry('docs/adr/ADR-900-probe.md'), null, 2))
  assert.ok(!JSON.stringify(report).includes(repo), 'the report names no absolute path (CLAUDE.md §6)')

  // The control: a record the gate checked and did not advise on carries an empty list, which is
  // an answer — and the pair that makes the absences below mean something.
  assert.equal(entry('docs/adr/ADR-902-control.md').verdict, 'PASS', JSON.stringify(report.adrLint))
  assert.deepEqual(adviceFromTheGate(repo, 'docs/adr/ADR-902-control.md', null), [])
  assert.deepEqual(entry('docs/adr/ADR-902-control.md').advice, [])
  // A record the gate never checked carries no advice key: "no advice" there would be an
  // observation nobody made (ADR-005). Not-recognised exits 2 before any check runs; an unread
  // record never reached the gate at all.
  const unchecked = entry('docs/adr/0005-notes.md')
  assert.equal(unchecked.verdict, 'not-recognised', JSON.stringify(report.adrLint))
  assert.ok(!('advice' in unchecked), JSON.stringify(unchecked))
  const unread = entry('docs/adr/ADR-901-x.md')
  assert.equal(unread.verdict, 'unread', JSON.stringify(report.adrLint))
  assert.ok(!('advice' in unread), JSON.stringify(unread))

  // The text says it too: the verdict with the advice count, and the verdict alone where there is none.
  const text = probe(repo)
  assert.equal(text.status, 0, text.stderr)
  const lines = text.stdout.split('\n')
  assert.ok(lines.includes(`adr-lint docs/adr/ADR-900-probe.md: FAIL · ${said.length} advice line(s)`), text.stdout)
  assert.ok(lines.includes('adr-lint docs/adr/ADR-902-control.md: PASS'), text.stdout)
  assert.ok(lines.includes('adr-lint docs/adr/0005-notes.md: not-recognised'), text.stdout)
  assert.ok(lines.includes('adr-lint docs/adr/ADR-901-x.md: unread'), text.stdout)
})

test('a PASS that carries advice is not reported as a bare PASS', () => {
  const repo = temp()
  cpSync(join(repoRoot, 'tests', 'fixtures', 'corpora', 'php-multi-root'), repo, { recursive: true })
  for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['commit', '-qm', 'fixture']]) git(repo, ...args)
  const record = 'docs/adr/ADR-001-notes-can-be-pinned.md'
  const report = probeJson(repo)
  const entry = report.adrLint.find(each => each.file === record)
  assert.equal(entry.verdict, 'PASS', JSON.stringify(entry))
  const said = adviceFromTheGate(repo, record, 'docs/adr/ADR-001-notes-can-be-pinned/tasks')
  assert.ok(said.length > 0, 'the gate advises on this PASS, or nothing below is under test')
  assert.deepEqual(entry.advice, said.map(line => scrubber({ root: repo, pluginRoot })(line.trim())), JSON.stringify(entry, null, 2))
  const text = probe(repo)
  assert.equal(text.status, 0, text.stderr)
  const lines = text.stdout.split('\n')
  assert.ok(lines.includes(`adr-lint ${record}: PASS · ${said.length} advice line(s)`), text.stdout)
  assert.ok(!lines.includes(`adr-lint ${record}: PASS`), text.stdout)
})

test('the count a pasted report publishes is named for what it counts: shown able to fail, a red-first row included', () => {
  const repo = temp()
  git(repo, 'init', '-q')
  write(repo, 'docs/adr/ADR-001-x.md', '# ADR-001: X\n\n**Status:** Accepted\n')
  const redFirst = '- 2026-09-28 · abc1234 · exit 1 · `pytest -q` · acceptance-sha256:aa · ms:5 · test-lock-sha256:bb'
  const green = '- 2026-09-28 · abc1234 · exit 0 · `pytest -q` · acceptance-sha256:aa · ms:5'
  write(repo, 'docs/adr/ADR-001-x/tasks/T1-red-first.md', `# Task ADR-001-T1: a\n\n## Verification Log\n${redFirst}\n${green}\n`)
  write(repo, 'docs/adr/ADR-001-x/tasks/T2-outcome-only.md', `# Task ADR-001-T2: b\n\n## Verification Log\n${green}\n`)

  const totals = probeJson(repo).corpusReport.find(each => each.root === 'docs/adr')?.totals
  assert.ok(totals, 'corpus-report answered for docs/adr')
  // A red-first row is the TDD red every task is meant to carry: it shows the check able to fail,
  // and it is counted as that — under a key that cannot be read as "failing".
  assert.equal(totals.shownAbleToFail, 1, JSON.stringify(totals))
  assert.ok(!('showsFailing' in totals), JSON.stringify(totals))
  // The control: the outcome-only task is counted apart, so the count is not the evidenced total.
  assert.equal(totals.evidenced, 2)
  assert.equal(totals.outcomeOnly, 1)
  assert.equal(totals.rate, 0.5)

  // Both renders read the renamed count, so neither prints `undefined` where the number was.
  const report = node('corpus-report.mjs', ['docs/adr'], repo)
  assert.equal(report.status, 0, report.stderr)
  assert.match(report.stdout, /\.\.\. shown able to fail 1 \(50%\)/, report.stdout)
  const metrics = node('trajectory-metrics.mjs', ['docs/adr'], repo)
  assert.equal(metrics.status, 0, metrics.stderr)
  assert.match(metrics.stdout, /^trajectory-metrics: 1 \/ 2 evidenced task\(s\) show their check COULD have failed here \(50%\)/, metrics.stdout)
})

// adr-lint prints `[strictFrom] …` ABOVE the verdict on a record older than the corpus's cutoff,
// and the probe took the first line opening with `[` for the verdict line: that PASS read
// `exit 0`, with nothing behind it. Found while carrying advice only under a verdict, because the
// record's advice — its demoted findings among it — would have gone with the verdict.
test('a record strictFrom demotes is read by its verdict line, not the demotion line above it', () => {
  const repo = temp()
  git(repo, 'init', '-q')
  write(repo, '.quality-harness.json', '{"strictFrom": "ADR-0040"}\n')
  const record = n => `# ADR-${n}: probe\n\n**Status:** Accepted\n**Date:** 2026-09-07\n\n`
    + '## Context\n\nS.\n\n## Decision\n\nDo it.\n\n## Consequences\n\nA cost.\n'
  write(repo, 'docs/adr/ADR-001-old.md', record('001'))
  // The control: the same record past the cutoff is checked in full, and FAILs.
  write(repo, 'docs/adr/ADR-050-new.md', record('050'))
  const said = `${gate(repo, 'docs/adr/ADR-001-old.md', null).stdout}`.split('\n')
  assert.match(said[0], /^\[strictFrom\] ADR-0001 predates strictFrom ADR-0040/, `the demotion line comes first, or nothing below is under test:\n${said.join('\n')}`)
  assert.match(said[1], /^\[PASS\] /, said.join('\n'))

  const report = probeJson(repo)
  const entry = file => report.adrLint.find(each => each.file === file)
  assert.equal(entry('docs/adr/ADR-001-old.md').verdict, 'PASS', JSON.stringify(report.adrLint))
  assert.equal(entry('docs/adr/ADR-050-new.md').verdict, 'FAIL', JSON.stringify(report.adrLint))
  // And the advice the gate printed under that verdict travels with it, the demoted findings among it.
  const scrub = scrubber({ root: repo, pluginRoot })
  const advice = said.filter(line => /^ {2}advice/.test(line)).map(line => scrub(line.trim()))
  assert.ok(advice.some(line => line.includes('[advisory: ADR-0001 predates strictFrom ADR-0040')), advice.join('\n'))
  assert.deepEqual(entry('docs/adr/ADR-001-old.md').advice, advice, JSON.stringify(entry('docs/adr/ADR-001-old.md'), null, 2))

  const text = probe(repo)
  assert.equal(text.status, 0, text.stderr)
  assert.ok(text.stdout.split('\n').includes(`adr-lint docs/adr/ADR-001-old.md: PASS · ${advice.length} advice line(s)`), text.stdout)
})

// --diff compared a record's verdict and its reason and never its advice, so a PASS that gained or
// lost advice between two runs printed "nothing changed" (the review of this lead's first pass).
test('corpus-probe --diff names advice that came or went on a verdict that held', () => {
  const saved = (verdict, advice) => ({
    probe: { version: '3.1.5', sha256: 'p'.repeat(64), readers: { sha256: 'a'.repeat(64), git: null, dirty: null } },
    root: '.', look: 'ok', corpora: ['docs/adr'],
    adrLint: [{ file: 'docs/adr/ADR-001-a.md', exit: verdict === 'PASS' ? 0 : 2, verdict, ...(advice === undefined ? {} : { advice }) },
      { file: 'docs/adr/0001-b.md', exit: 2, verdict: 'not-recognised' }],
    couldNotRun: [], disagreements: [],
  })
  const diff = (before, after) => {
    const dir = temp()
    writeFileSync(join(dir, 'before.json'), JSON.stringify(before))
    writeFileSync(join(dir, 'after.json'), JSON.stringify(after))
    const run = probe(dir, ['--diff', join(dir, 'before.json'), join(dir, 'after.json')])
    assert.equal(run.status, 0, run.stderr)
    return run.stdout.split('\n').filter(Boolean)
  }
  const spec = 'advice: ADR-001-a.md: no **Spec:** header'
  // The control: the same advice on both sides, and a record carrying none on either, is no change.
  assert.deepEqual(diff(saved('PASS', [spec]), saved('PASS', [spec])), ['nothing changed'])
  assert.deepEqual(diff(saved('PASS', []), saved('PASS', [spec])), [`adrLint docs/adr/ADR-001-a.md advice: + ${spec}`])
  assert.deepEqual(diff(saved('PASS', [spec]), saved('PASS', [])), [`adrLint docs/adr/ADR-001-a.md advice: - ${spec}`])
  // A report from before the field is named as lacking it, never read as advising nothing.
  assert.deepEqual(diff(saved('PASS', undefined), saved('PASS', [])), ['before lacks adrLint docs/adr/ADR-001-a.md advice'])
  // A verdict that moved is the line already: a record the gate stopped checking lost its advice
  // because nothing was checked, and "after lacks" beside that would say something else.
  assert.deepEqual(diff(saved('PASS', [spec]), saved('not-recognised', undefined)), ['adrLint docs/adr/ADR-001-a.md: PASS → not-recognised'])
})
