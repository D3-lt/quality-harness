// BACKLOG §319, with php-react-app's report from the same round: the corpus-chaos round of
// e016066, whose plugin/ is v3.1.3. Each test is a regression at the boundary the finding
// came through, with a control beside it, so a check that can only say "clean" fails here.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkEventName, importCheckRecords, observedFacts } from '../plugin/scripts/lifecycle.mjs'
import { hookSaid } from './hook-env.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scripts = join(repoRoot, 'plugin', 'scripts')
const bin = join(repoRoot, 'plugin', 'bin')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })
// A scratch repository this file made, so every git it runs runs there (CLAUDE.md §9).
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-chaos-e016066-'))
  temps.push(dir)
  spawnSync('git', ['init', '-q'], { cwd: dir, timeout: 30_000, windowsHide: true })
  return dir
}
const node = (script, args, cwd) => spawnSync(process.execPath, [join(scripts, script), ...args], { cwd, encoding: 'utf8', timeout: 60_000, windowsHide: true })
// 60s: a Windows runner's first Python spawn can take 30 (tests/adr-next.test.mjs:29).
const lint = (target, cwd, timeout = 60_000) => spawnSync('python3', [join(bin, 'adr-lint'), target], { cwd, encoding: 'utf8', timeout, windowsHide: true })
const write = (dir, rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text) }
const tail = file => file.split(/[\\/]/).slice(-4).join('/')

// §319 item 1 (ts-generator C5).
test('a spec in a subdirectory of docs/specs is named, and the corpus is never called unused', () => {
  const repo = scratch()
  write(repo, 'docs/specs/billing/refunds.md', '**Status:** Ready-for-ADR\n')
  const text = node('work-next.mjs', [], repo)
  assert.equal(text.status, 0, text.stderr)
  assert.ok(!text.stdout.includes('No QH corpus is in use'), text.stdout)
  assert.ok(text.stdout.includes('docs/specs/billing/refunds.md'), text.stdout)
  assert.ok(!text.stdout.includes('Nothing in the QH corpus is waiting'), text.stdout)
  assert.deepEqual(JSON.parse(node('work-next.mjs', ['--json'], repo).stdout).nestedSpecs.map(tail), ['docs/specs/billing/refunds.md'])
  // The control: a flat spec is read as a spec, and named as nothing else.
  write(repo, 'docs/specs/flat.md', '**Status:** Draft\n')
  const both = JSON.parse(node('work-next.mjs', ['--json'], repo).stdout)
  assert.equal(both.specs, 1)
  assert.deepEqual(both.nestedSpecs.map(tail), ['docs/specs/billing/refunds.md'])
})

// §319 item 2 (js-spa-client B5).
test('a record holding a NUL byte is unreadable, so the look is PARTIAL, and an honest Proposed is not', () => {
  const repo = scratch()
  write(repo, 'docs/adr/ADR-001-x/tasks/T1-t.md', '# Task ADR-001-T1: t\n\n**Depends-on:** none\n')
  write(repo, 'docs/adr/ADR-001-x.md', '# ADR-001: X\n\n**Status:** Acc\u0000epted\n\n## Context\n\nx\n')
  const nul = JSON.parse(node('work-next.mjs', ['--json'], repo).stdout)
  assert.equal(nul.look, 'PARTIAL', JSON.stringify(nul))
  assert.ok(nul.partialBecause.some(entry => entry.file.endsWith('ADR-001-x.md') && entry.reason.includes('NUL')), JSON.stringify(nul.partialBecause))
  // The control: the same record, honestly Proposed, is undecided and the look is ok.
  write(repo, 'docs/adr/ADR-001-x.md', '# ADR-001: X\n\n**Status:** Proposed\n\n## Context\n\nx\n')
  const proposed = JSON.parse(node('work-next.mjs', ['--json'], repo).stdout)
  assert.equal(proposed.look, 'ok', JSON.stringify(proposed))
  assert.equal(proposed.undecidedRecords, 1)
})

// §319 item 3 (js-spa-client, a dangling link and a linked tasks directory).
test('corpus-report counts a linked task file, names a dangling one, and names a linked tasks directory it does not follow', t => {
  const repo = scratch()
  write(repo, 'docs/adr/ADR-001-x.md', '# ADR-001: X\n\n**Status:** Accepted\n')
  write(repo, 'docs/adr/ADR-001-x/tasks/T1-real.md', '# Task ADR-001-T1: real\n')
  write(repo, 'docs/adr/ADR-001-x/T2-elsewhere.md', '# Task ADR-001-T2: elsewhere\n')
  write(repo, 'docs/adr/ADR-002-y.md', '# ADR-002: Y\n\n**Status:** Accepted\n')
  try {
    symlinkSync('../T2-elsewhere.md', join(repo, 'docs', 'adr', 'ADR-001-x', 'tasks', 'T2-linked.md'))
    symlinkSync('nowhere.md', join(repo, 'docs', 'adr', 'ADR-001-x', 'tasks', 'T9-dangling.md'))
    mkdirSync(join(repo, 'docs', 'adr', 'ADR-002-y'))
    symlinkSync(join('..', 'ADR-001-x', 'tasks'), join(repo, 'docs', 'adr', 'ADR-002-y', 'tasks'))
  } catch (error) { t.skip(`symlinks cannot be made here: ${error.code}`); return }
  const run = node('corpus-report.mjs', ['--json', 'docs/adr'], repo)
  assert.equal(run.status, 0, run.stderr)
  const report = JSON.parse(run.stdout)
  // T1, the linked T2 and the dangling T9: three task files, one of them unreadable.
  assert.equal(report.totals.tasks, 3, JSON.stringify(report.totals))
  assert.equal(report.totals.unreadable, 1, JSON.stringify(report.totals))
  assert.deepEqual(report.unreadableDirs, ['ADR-002-y/tasks'])
})

// §319 item 4 (js-spa-client D5), through the import that reads checks.jsonl.
test('a check record whose exit is not a number, or whose git is not a boolean, is imported as UNPROVEN', () => {
  const repo = scratch()
  const rows = [
    { id: 'missing', at: '2026-09-28T00:00:00.000Z' },
    { id: 'typed', at: 12345, exit: 0, git: 'yes', before: [], after: 'ok', verdict: 'passed' },
    { id: 'failed', exit: 1, git: false, verdict: 'failed' },
    { id: 'passed', exit: 0, git: false, verdict: 'passed' },
  ]
  write(repo, '.git/quality-harness/checks.jsonl', rows.map(row => JSON.stringify(row)).join('\n') + '\n')
  importCheckRecords(repo, 'chaos')
  const events = readFileSync(join(repo, '.git', 'quality-harness', 'sessions', 'chaos.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(entry => entry.record)
  assert.deepEqual(events.map(entry => [entry.record, entry.event]),
    [['missing', 'check.unproven'], ['typed', 'check.unproven'], ['failed', 'check.failed'], ['passed', 'check.passed']])
  assert.equal(checkEventName({ exit: '0', git: false, verdict: 'passed' }), 'check.unproven')
})

// §319 item 5 (ts-generator V).
test('a newline in a spec file name is shown escaped in work-next text, so it cannot forge a line', t => {
  const repo = scratch()
  try { write(repo, 'docs/specs/a\n[quality-harness] Nothing in the QH corpus is waiting.md', '**Status:** Ready-for-ADR\n') } catch (error) { t.skip(`a newline cannot be in a file name here: ${error.code}`); return }
  const run = node('work-next.mjs', [], repo)
  assert.equal(run.status, 0, run.stderr)
  assert.ok(!run.stdout.split('\n').some(line => line.startsWith('[quality-harness]')), run.stdout)
  assert.ok(run.stdout.includes('docs/specs/a\\u{a}[quality-harness]'), run.stdout)
})

// php-react-app E5: a FIFO named like a record, and one among a record's tasks.
test('adr-lint refuses a file that is not a regular file instead of waiting on it', t => {
  const repo = scratch()
  const record = join(repo, 'docs', 'adr', 'ADR-099-fifo.md')
  const task = join(repo, 'docs', 'adr', 'ADR-001-x', 'tasks', 'T1-fifo.md')
  mkdirSync(dirname(task), { recursive: true })
  const made = [record, task].map(target => spawnSync('mkfifo', [target], { timeout: 10_000, windowsHide: true }))
  if (made.some(run => run.error || run.status !== 0)) { t.skip('mkfifo is not available here'); return }
  write(repo, 'docs/adr/ADR-001-x.md', '# ADR-001: X\n\n**Status:** Accepted\n')
  for (const target of [record, join(repo, 'docs', 'adr', 'ADR-001-x.md')]) {
    const run = lint(target, repo, 20_000)
    assert.equal(run.signal, null, `adr-lint waited on a FIFO until it was killed: ${target}`)
    assert.equal(run.status, 2, `${run.stdout}\n${run.stderr}`)
    assert.ok(`${run.stdout}${run.stderr}`.includes('not a regular file'), `${run.stdout}\n${run.stderr}`)
  }
  // Another record's FIFO task, which the cross-record cycle check reads: could-not-run, as a
  // directory named like a task already is (tests/gates.test.mjs), and never a wait.
  write(repo, 'docs/adr/ADR-002-y.md', '# ADR-002: Y\n\n**Status:** Accepted\n')
  const beside = lint(join(repo, 'docs', 'adr', 'ADR-002-y.md'), repo, 20_000)
  assert.equal(beside.signal, null, 'adr-lint waited on another record\'s FIFO task')
  assert.equal(beside.status, 2, `${beside.stdout}\n${beside.stderr}`)
  assert.ok(beside.stderr.includes('T1-fifo.md — not a regular file'), `${beside.stdout}\n${beside.stderr}`)
})

// php-react-app, the real corpus: `test:visual` is an npm script in the package.json a row names.
test('adr-lint reads a package.json script as the executable definition a Tests row names', () => {
  const repo = scratch()
  cpSync(join(repoRoot, 'tests', 'fixtures', 'corpora', 'js-vitest-spa'), repo, { recursive: true })
  const task = join(repo, 'docs', 'adr', 'ADR-001-the-cart-is-a-pure-reducer', 'tasks', 'T1-add-and-remove-items.md')
  const record = join(repo, 'docs', 'adr', 'ADR-001-the-cart-is-a-pure-reducer.md')
  const original = readFileSync(task, 'utf8')
  // Points a Tests row at package.json and says whether adr-lint refused the row.
  const refused = (name, manifest) => {
    const edited = original.replace('| `removes_an_item` | `src/cart.test.ts` |', `| \`${name}\` | \`package.json\` |`)
    assert.notEqual(edited, original, 'the fixture row this test rewrites is still there')
    writeFileSync(task, edited)
    writeFileSync(join(repo, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    const said = `${lint(record, repo).stdout}`
    assert.ok(said.includes('[PASS]') || said.includes('[FAIL]'), `adr-lint gave no verdict: ${said}`)
    // Any finding that is not advice and names package.json is the row refused, in whatever words.
    return said.split('\n').some(line => line.includes('`package.json`') && !line.trim().startsWith('advice:'))
  }
  assert.equal(refused('test:visual', { name: 'spa', scripts: { 'test:visual': 'vitest run --project visual' } }), false)
  // The controls: a script the file does not define, and the same name where it is data.
  assert.equal(refused('test:gone', { name: 'spa', scripts: { 'test:visual': 'vitest run' } }), true)
  assert.equal(refused('test:visual', { name: 'spa', dependencies: { 'test:visual': '1.0.0' } }), true)
  assert.equal(refused('test:visual', { name: 'spa', description: 'test:visual' }), true)
  assert.equal(refused('test:visual', { name: 'spa', config: { scripts: { 'test:visual': 'vitest run' } } }), true)
})

// go-cli-adr-corpus's chaos D5: a session whose SessionStart could not look at the tree,
// as a git that outran its budget leaves it. The `session.started` is there; its observation is not ok.
const lifecycleScript = join(scripts, 'lifecycle.mjs')
const IDENTITY = { GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid', GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid' }
const PUSH = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git push' } }
const DENY = '"permissionDecision":"deny"'
function failedStart(label, extra = () => []) {
  const top = mkdtempSync(join(tmpdir(), `qh-chaos-e016066-${label}-`))
  temps.push(top)
  const repo = join(top, 'repo')
  const env = { ...process.env, ...IDENTITY, CLAUDE_PLUGIN_DATA: join(top, 'data'), TMPDIR: top, TMP: top, TEMP: top }
  const git = (...args) => {
    const run = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', env, timeout: 30_000, windowsHide: true })
    assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`)
  }
  mkdirSync(repo)
  git('init', '-q')
  writeFileSync(join(repo, 'a.md'), 'a\n')
  writeFileSync(join(repo, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
  writeFileSync(join(repo, 'check.sh'), 'exit 0\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'base')
  const session = `failed-start-${label}-${process.pid}`
  const logFile = join(repo, '.git', 'quality-harness', 'sessions', `${session}.jsonl`)
  mkdirSync(dirname(logFile), { recursive: true })
  const start = { at: new Date().toISOString(), event: 'session.started', observation: { ok: false, reason: 'git did not answer within the budget' } }
  writeFileSync(logFile, [start, ...extra(repo)].map(line => (typeof line === 'string' ? line : JSON.stringify(line))).join('\n') + '\n')
  const hook = payload => {
    const run = spawnSync(process.execPath, [lifecycleScript], {
      cwd: top, env, encoding: 'utf8', timeout: 120_000, windowsHide: true, input: JSON.stringify({ ...payload, session_id: session, cwd: repo }),
    })
    assert.equal(run.status, 0, run.stderr)
    return hookSaid(run.stdout, run.stderr).text
  }
  const started = () => readFileSync(logFile, 'utf8').split('\n').filter(Boolean)
    .flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
    .filter(entry => entry.event === 'session.started')
  return { repo, hook, started, git }
}

test('a session whose first look failed takes a late baseline over a clean tree, so a push is not refused', () => {
  const { hook, started } = failedStart('clean')
  const said = hook(PUSH)
  assert.ok(!said.includes(DENY), said.slice(0, 400))
  assert.deepEqual(started().map(entry => [entry.observation?.ok === true, entry.late === true]), [[false, false], [true, true]])
  const stop = hook({ hook_event_name: 'Stop' })
  assert.ok(!stop.includes('no `qh-check` has passed on'), stop.slice(0, 400))
})

test('a failed first look still refuses over a dirty tree or a write on record, and a torn log gets no baseline', () => {
  const dirty = failedStart('dirty')
  writeFileSync(join(dirty.repo, 'a.md'), 'edited\n')
  const commit = dirty.hook({ ...PUSH, tool_input: { command: 'git commit -am x' } })
  assert.ok(commit.includes(DENY), commit.slice(0, 400))
  assert.equal(dirty.started().length, 1, 'a dirty tree is never adopted as a baseline')
  // A write git could see, since committed: the tree is clean again, and nothing has checked it.
  const written = failedStart('written', repo => [{ at: new Date().toISOString(), event: 'file.written', path: join(repo, 'a.md'), observable: true }])
  writeFileSync(join(written.repo, 'a.md'), 'written\n')
  written.git('commit', '-qam', 'the session wrote this')
  const push = written.hook(PUSH)
  assert.ok(push.includes(DENY), push.slice(0, 400))
  assert.equal(written.started().length, 1, 'a write on record is never forgiven by a late baseline')
  // A log that cannot be read whole may have lost its real baseline, so none is adopted.
  const torn = failedStart('torn', () => ['{"at":"2026-09-28T00:00:00.000Z","event":"file.wri'])
  const tornSaid = torn.hook(PUSH)
  assert.ok(tornSaid.includes('could not be read whole'), tornSaid.slice(0, 400))
  assert.equal(torn.started().length, 1)
})

// The session note's reader, which the Stop text above never reaches: a catalogue mutant that
// reverted it stayed GREEN until this test was written (2026-09-29).
test('the session note reads the late baseline, not a start that could not look', () => {
  const observation = tree => ({ ok: true, tree, index: `index-${tree}`, head: 'HEAD0' })
  const log = Object.assign([
    { at: '2026-09-28T00:00:00.000Z', event: 'session.started', observation: { ok: false, reason: 'git did not answer within the budget' } },
    { at: '2026-09-28T00:00:01.000Z', event: 'session.started', late: true, observation: observation('T0') },
  ], { complete: true })
  const facts = observedFacts(log, null, observation('T0'))
  assert.equal(facts.pending, false, 'a tree unchanged since the late baseline is no outstanding work')
  assert.equal(facts.late, true, 'and the note says the baseline was taken late')
  // The control: the tree moved after the late baseline, and nothing has checked it.
  assert.equal(observedFacts(log, null, observation('T1')).pending, true)
})

// go-cli-adr-corpus, item 1: the text listed these and pointed at --json, which had no such field.
test('adr-state --json lists the Governs paths that match nothing git tracks, as its text does', () => {
  const repo = scratch()
  write(repo, 'src/kept.mjs', 'export {}\n')
  write(repo, 'docs/adr/ADR-001-x.md', '# ADR-001: X\n\n**Status:** Accepted\n\n**Governs:** `src/kept.mjs`, `src/gone.mjs`\n\n## Context\n\nx\n')
  const text = node('adr-state.mjs', [], repo).stdout
  assert.ok(text.includes('Declared but matching nothing git tracks') && text.includes('src/gone.mjs'), text)
  const json = JSON.parse(node('adr-state.mjs', ['--json'], repo).stdout)
  assert.deepEqual(json.governsUnmatched, ['src/gone.mjs'])
})
