#!/usr/bin/env node
// corpus-probe — every reader this plugin ships, run over one repository, as one JSON.
//
// The defects that reached adopters this month were all in what a reader SAYS
// about a corpus shaped unlike this one — fixtures counted as records, retired
// records offered for retirement, a CLI silent through a symlink — and every one
// was found by a peer session running the readers by hand over their own tree,
// never by this repository's suite (BACKLOG §263, §264; the 2026-09-06 memory).
// This is the command those peers were improvising: it spawns each reader as a
// process, the way an adopter's session does, and prints what each said, side by
// side, with the disagreements between them computed rather than left to the
// reader's eye. `tests/corpus-matrix.test.mjs` runs it over consumer-shaped
// corpora on every CI platform; an adopter runs it over theirs and pastes the
// JSON back (BACKLOG §255 asks that such a report carry the probe's own digest,
// so `probe.sha256` is in the output).
//
// ⚠ EVERY PATH THAT LEAVES THIS FILE IS RELATIVE TO THE ROOT OR A PLACEHOLDER
// (`publicPath`, CLAUDE.md §6): the output is designed to be posted in public.
//
//   node corpus-probe.mjs [<repo-root>] [--json] [--sweep] [--timeout <seconds>] [--sweep-budget <seconds>]
//
// `--sweep` re-runs every recorded claim through `adr-verify --sweep`, which
// EXECUTES the corpus's acceptance fences; it is opt-in for that reason, and it
// has its own budget: `--timeout` bounds one reader, `--sweep-budget` (default 30
// minutes) bounds the sweep, whose cost is every fence in the corpus. A 209-task
// corpus on Windows was killed at the 120s reader budget and reported as "did not
// start" (peer-run, 2026-09-23); a killed reader now says it was killed, and by what.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { adrCorpus, spawnGate, trackedPaths } from './lifecycle.mjs'
import { publicPath, pluginVersion } from './corpus-report.mjs'
import { isMainModule } from './main-module.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const bin = path.join(here, '..', 'bin')
const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_SWEEP_BUDGET_MS = 1_800_000

/** The digest of this file, so a pasted report says which probe produced it. */
export function probeDigest(read = readFileSync) {
  return createHash('sha256').update(read(fileURLToPath(import.meta.url))).digest('hex')
}

function parseJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

/**
 * Run one reader and either return its parsed JSON or record why it could not
 * be read. A reader that did not start, died, or printed no JSON is a
 * could-not-run entry (ADR-005), never a silent gap in the report.
 */
function reader(name, run, note, budgetMs = null) {
  let result
  try { result = run() } catch (error) { result = { error } }
  if (result.error) {
    // ETIMEDOUT is spawnSync's word for a child IT killed at the deadline — the
    // reader ran and was stopped, which is the opposite of "did not start".
    const why = result.error.code === 'ETIMEDOUT'
      ? `killed at the probe's ${budgetMs ? `${Math.round(budgetMs / 1000)}s ` : ''}budget before it finished (ETIMEDOUT); raise the budget`
      : `did not start: ${result.error.code ?? result.error.message}`
    note(name, why)
    return null
  }
  if (result.status !== 0 && result.signal) {
    note(name, `ended by ${result.signal}`)
    return null
  }
  const parsed = parseJson(result.stdout ?? '')
  if (parsed === null) {
    note(name, `exit ${result.status}, no JSON: ${String(result.stderr ?? result.stdout ?? '').trim().split('\n')[0] ?? ''}`)
    return null
  }
  return parsed
}

/**
 * Every reader over `root`. Pure in the sense that matters: it writes nothing
 * under `root`; the SessionStart hook's own state goes to a scratch directory
 * that is removed before returning.
 */
export function probe(root, { sweep = false, timeoutMs = DEFAULT_TIMEOUT_MS, sweepTimeoutSeconds = 60, sweepBudgetMs = DEFAULT_SWEEP_BUDGET_MS } = {}) {
  const resolved = realpathSync(root)
  const rel = target => publicPath(target, resolved)
  // Every reader's free text goes through here before it is emitted. The
  // repository root becomes `.`, and any other absolute path — the plugin's own,
  // the OS temp directory, a home directory in a diagnostic — becomes a
  // placeholder, both separator spellings. A first version replaced the root
  // only, and a reader's error message carried the plugin path out (Codex review
  // of c1f546a, P1).
  const pluginRoot = path.resolve(here, '..')
  const scrub = text => String(text)
    .split(resolved).join('.')
    .split(pluginRoot).join('<plugin>')
    .split(os.tmpdir()).join('<tmp>')
    .split(os.homedir()).join('<home>')
    .replace(/(?:[A-Za-z]:)?[\\/](?:Users|home|private|tmp|var)[\\/][^\s'"`)]*/g, '<path>')
  const couldNotRun = []
  const note = (readerName, why) => couldNotRun.push({ reader: scrub(readerName), why: scrub(why) })
  const node = (script, args, options = {}) => spawnSync(process.execPath, [path.join(here, script), ...args],
    { cwd: resolved, encoding: 'utf8', timeout: timeoutMs, ...options })
  const gate = (tool, args, timeout = timeoutMs) => spawnGate(path.join(bin, tool), args, { cwd: resolved, encoding: 'utf8', timeout })

  const listing = trackedPaths(resolved)
  const corpus = adrCorpus(resolved, { tracked: listing })
  const look = listing == null ? 'UNPROVEN' : (corpus.look ?? 'ok')
  const records = corpus.map(record => ({
    id: record.id ?? null, file: rel(record.file), status: record.status ?? null, kind: record.kind ?? null,
    frozen: Boolean(record.frozen),
  }))
  const corpusDirs = [...new Set(corpus.map(record => path.dirname(record.file)))]
  const taskDirs = [...new Set(corpus.flatMap(record => (record.taskFiles ?? []).map(file => path.dirname(file))))]

  // adr-lint per record: the gate's own verdict on each file the readers counted.
  // ADR-038 makes a MADR or Nygard record `not-recognised` while the corpus
  // readers still count it, and that split is a thing to see side by side.
  const adrLint = corpus.map(record => {
    const tasksDir = (record.taskFiles ?? []).length ? path.dirname(record.taskFiles[0]) : null
    const run = gate('adr-lint', tasksDir ? [record.file, tasksDir] : [record.file])
    if (run.error) {
      note(`adr-lint ${rel(record.file)}`, `did not start: ${run.error.code ?? run.error.message}`)
      return { file: rel(record.file), exit: null, verdict: null }
    }
    const first = `${run.stdout ?? ''}${run.stderr ?? ''}`.split('\n').find(line => /^\[|not-recognised|NOT A DECISION RECORD/.test(line)) ?? ''
    const verdict = /^\[PASS\]/.test(first) ? 'PASS' : /^\[FAIL\]/.test(first) ? 'FAIL' : /not-recognised/.test(first) ? 'not-recognised' : /NOT A DECISION RECORD/i.test(first) ? 'not-a-record' : `exit ${run.status}`
    return { file: rel(record.file), exit: run.status, verdict }
  })

  const workNext = reader('work-next', () => node('work-next.mjs', ['--json']), note)
  const adrState = reader('adr-state', () => node('adr-state.mjs', ['--json']), note)

  // adr-next per task directory of a governing, unfrozen record — the same set
  // SessionStart and work-next ask about. A frozen archive's tasks are history;
  // asking adr-next about them produced three "ready" answers on this
  // repository's own archive that no reader should act on.
  const frozenTaskDirs = [...new Set(corpus.filter(record => record.frozen)
    .flatMap(record => (record.taskFiles ?? []).map(file => path.dirname(file))))].map(rel)
  const liveTaskDirs = [...new Set(corpus.filter(record => !record.frozen)
    .flatMap(record => (record.taskFiles ?? []).map(file => path.dirname(file))))]
  const adrNext = liveTaskDirs.map(dir => {
    const answer = reader(`adr-next ${rel(dir)}`, () => gate('adr-next', [dir, '--json']), note)
    return {
      tasksDir: rel(dir),
      ready: answer?.ready?.map(task => ({ id: task.id, path: rel(path.resolve(resolved, task.path)), unproven: task.unproven ? scrub(task.unproven) : null })) ?? null,
    }
  })

  // The real hook, with a payload shaped as the host sends it and its state
  // pointed at scratch so nothing is written beside the corpus.
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-corpus-probe-'))
  let sessionStart = null
  try {
    const hook = node('lifecycle.mjs', [], {
      input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', session_id: `corpus-probe-${process.pid}`, cwd: resolved }),
      env: { ...process.env, CLAUDE_PLUGIN_DATA: path.join(scratch, 'data'), TMPDIR: scratch, TMP: scratch, TEMP: scratch },
    })
    // A hook that crashed, was signalled, or printed something other than the
    // JSON the host expects made no observation; it is could-not-run, not an
    // empty orientation (Codex review of c1f546a, P2). An empty stdout with exit
    // 0 IS an observation: a corpus with nothing to say.
    if (hook.error) note('SessionStart', `did not start: ${hook.error.code ?? hook.error.message}`)
    else if (hook.status !== 0 || hook.signal) note('SessionStart', `exit ${hook.status}${hook.signal ? ` (${hook.signal})` : ''}: ${String(hook.stderr ?? '').trim().split('\n')[0] ?? ''}`)
    else {
      const said = (hook.stdout ?? '').trim() === '' ? {} : parseJson(hook.stdout)
      if (said === null) note('SessionStart', `printed no JSON: ${String(hook.stdout).trim().split('\n')[0] ?? ''}`)
      else {
        const text = said?.hookSpecificOutput?.additionalContext ?? ''
        sessionStart = { exit: hook.status, lines: text.split('\n').filter(Boolean).map(scrub) }
      }
    }
  } finally {
    try { rmSync(scratch, { recursive: true, force: true }) } catch { /* scratch outlives us */ }
  }

  const corpusReport = corpusDirs.map(dir => {
    const report = reader(`corpus-report ${rel(dir)}`, () => node('corpus-report.mjs', [dir, '--json']), note)
    return { root: rel(dir), totals: report?.totals ?? null, records: report?.records ?? null }
  })

  const sweeps = sweep
    ? corpusDirs.map(dir => {
      const answer = reader(`adr-verify --sweep ${rel(dir)}`,
        () => gate('adr-verify', ['--sweep', dir, '--json', '--timeout', String(sweepTimeoutSeconds)], sweepBudgetMs), note, sweepBudgetMs)
      return answer ? { root: rel(dir), claims: answer.claims, held: answer.held, false: answer.false, superseded: answer.superseded, unrunnable: answer.unrunnable } : { root: rel(dir), buckets: null }
    })
    : null

  // Where two readers disagree about the same task. Each reader is right by its
  // own rule; a user sees both and cannot tell which to believe, which is the
  // defect. Computed here so it is a line in a report, not a thing to notice.
  // Every path a reader hands back is normalised to the repository-relative
  // POSIX form before it is compared or emitted: work-next prints native
  // separators, adr-next's came through publicPath, and on Windows the same task
  // produced two contradictory entries (Codex review of c1f546a, P1).
  const normal = value => rel(path.resolve(resolved, String(value)))
  const workNextPaths = key => workNext ? (workNext[key] ?? []).map(normal) : null
  const workNextReadyList = workNextPaths('tasksWithoutEvidence')
  // Compared only where both readers answered: a reader that did not run has
  // made no observation, and "not offered" by a reader that crashed is not a
  // disagreement (ADR-005).
  const disagreements = []
  if (workNextReadyList !== null) {
    const workNextReady = new Set(workNextReadyList)
    const answered = adrNext.filter(entry => entry.ready !== null)
    for (const entry of answered) {
      for (const task of entry.ready) {
        if (!workNextReady.has(task.path)) {
          disagreements.push({ task: task.path, adrNext: 'ready', workNext: 'not offered', adrNextSays: task.unproven })
        }
      }
    }
    const answeredDirs = new Set(answered.map(entry => entry.tasksDir))
    const adrNextReady = new Set(answered.flatMap(entry => entry.ready.map(task => task.path)))
    for (const task of workNextReady) {
      if (!answeredDirs.has(rel(path.dirname(path.resolve(resolved, task))))) continue
      if (!adrNextReady.has(task)) disagreements.push({ task, adrNext: 'not ready', workNext: 'ready' })
    }
  }

  return {
    probe: { version: pluginVersion(), sha256: probeDigest() },
    root: '.',
    look,
    corpora: corpusDirs.map(rel),
    records,
    workNext: workNext && {
      look: workNext.look, records: workNext.records, accepted: workNext.accepted, tasks: workNext.tasks,
      ready: workNextReadyList, unbacked: workNextPaths('unbackedDoneClaims'),
      underUndecided: workNextPaths('tasksUnderAnUndecidedRecord'), retirable: workNextPaths('retirableInActiveCorpus'),
      readinessUnproven: workNextPaths('readinessUnproven'),
      next: workNext.next,
    },
    frozenTaskDirs,
    adrState: adrState && {
      look: adrState.look, read: adrState.read, governing: adrState.governing,
      governingNothing: adrState.governingNothing, contested: adrState.contested?.length ?? null,
      danglingSupersession: adrState.danglingSupersession,
    },
    adrNext,
    adrLint,
    sessionStart,
    corpusReport,
    sweep: sweeps,
    disagreements,
    couldNotRun,
  }
}

function usage() {
  process.stderr.write('usage: corpus-probe.mjs [<repo-root>] [--json] [--sweep] [--timeout <seconds>] [--sweep-budget <seconds>]\n')
  return 2
}

export function main(argv = process.argv.slice(2)) {
  let root = process.cwd()
  let json = false
  let sweep = false
  let timeoutMs = DEFAULT_TIMEOUT_MS
  let sweepBudgetMs = DEFAULT_SWEEP_BUDGET_MS
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--json') json = true
    else if (arg === '--sweep') sweep = true
    else if (arg === '--timeout' || arg === '--sweep-budget') {
      const seconds = Number(argv[i + 1])
      if (!Number.isFinite(seconds) || seconds <= 0) return usage()
      if (arg === '--timeout') timeoutMs = seconds * 1000
      else sweepBudgetMs = seconds * 1000
      i += 1
    } else if (arg.startsWith('--')) return usage()
    else root = arg
  }
  const report = probe(root, { sweep, timeoutMs, sweepBudgetMs })
  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return 0
  }
  const lines = [
    `corpus-probe ${report.probe.version} (sha256 ${report.probe.sha256.slice(0, 12)}…) — look: ${report.look}`,
    `corpora: ${report.corpora.length ? report.corpora.join(', ') : '(none)'}`,
    report.workNext ? `work-next: ${report.workNext.records} record(s), ${report.workNext.accepted} accepted, ${report.workNext.tasks} task file(s); ready ${report.workNext.ready.length}, retirable ${report.workNext.retirable.length}` : 'work-next: could not run',
    report.adrState ? `adr-state: ${report.adrState.read} read, ${report.adrState.governing} governing` : 'adr-state: could not run',
    ...report.adrNext.map(entry => `adr-next ${entry.tasksDir}: ready ${entry.ready ? entry.ready.map(task => task.id).join(', ') || '(none)' : 'could not run'}`),
    ...report.adrLint.map(entry => `adr-lint ${entry.file}: ${entry.verdict ?? 'could not run'}`),
    `SessionStart: ${report.sessionStart ? `${report.sessionStart.lines.length} line(s)` : 'could not run'}`,
    ...(report.sweep ?? []).map(entry => `sweep ${entry.root}: ${entry.claims ?? '?'} claim(s) — held ${entry.held ?? '?'}, false ${entry.false ?? '?'}, superseded ${entry.superseded ?? '?'}, unrunnable ${entry.unrunnable ?? '?'}`),
    ...(report.disagreements.length
      ? ['DISAGREEMENTS between readers:', ...report.disagreements.map(d => `  ${d.task}: adr-next ${d.adrNext}, work-next ${d.workNext}${d.adrNextSays ? ` — ${d.adrNextSays}` : ''}`)]
      : ['no disagreements between readers']),
    ...(report.couldNotRun.length ? ['COULD NOT RUN:', ...report.couldNotRun.map(c => `  ${c.reader}: ${c.why}`)] : []),
  ]
  process.stdout.write(`${lines.join('\n')}\n`)
  return 0
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main()
}
