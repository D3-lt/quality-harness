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
//   node corpus-probe.mjs --diff <before.json> <after.json>
//   node corpus-probe.mjs --attest <label> <report.json>
//
// `--attest` reads one saved report and prints the counts-only attestation
// docs/corpus-reports/README.md defines (ADR-064 T3), so no count is transcribed.
//
// `--diff` reads two saved reports of ONE corpus and prints only what changed. It
// runs nothing, so a runner probes once and compares against its own last report
// (ADR-064 T2).
//
// `--sweep` re-runs every recorded claim through `adr-verify --sweep`, which
// EXECUTES the corpus's acceptance fences; it is opt-in for that reason, and it
// has its own budget: `--timeout` bounds one reader, `--sweep-budget` (default 30
// minutes) bounds the sweep, whose cost is every fence in the corpus. A 209-task
// corpus on Windows was killed at the 120s reader budget and reported as "did not
// start" (peer-run, 2026-09-23); a killed reader now says it was killed, and by what.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { adrCorpus, resolvePython, spawnGate, trackedPaths } from './lifecycle.mjs'
import { publicPath, pluginVersion } from './corpus-report.mjs'
import { isMainModule } from './main-module.mjs'
import { READER_DIRECTORIES } from './reader-paths.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const bin = path.join(here, '..', 'bin')
const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_SWEEP_BUDGET_MS = 1_800_000

/**
 * The digest of THIS FILE ALONE, so a pasted report says which probe produced it.
 * It says nothing about the readers the probe ran: attestations at four different
 * shas carried one value while the readers changed. `readerFingerprint` does that.
 */
export function probeDigest(read = readFileSync) {
  return createHash('sha256').update(read(fileURLToPath(import.meta.url))).digest('hex')
}

/**
 * Which readers answered (ADR-064 T1): `sha256` over every file under the reader
 * directories as the disk holds them — an untracked reader that runs is hashed
 * too — skipping `__pycache__`, `.pyc` and dotfiles, which Python and the OS write
 * on their own and which would make two runs of the same readers disagree. Text is
 * LF-normalised, so a CRLF checkout hashes as its LF twin.
 *
 * `git` is the commit only when the plugin root's PARENT is the top of a work tree:
 * a plugin vendored inside another repository is not that repository's checkout.
 * It is a separate field, never hashed in, so the fingerprint moves only when a
 * reader does. `dirty` says whether any reader file differs from that commit, which
 * is what lets an attestation refuse to claim readers the runner did not commit.
 * Two git spawns at most. `run` is the seam.
 */
export function readerFingerprint(pluginRoot, { run = args => spawnSync('git', ['-C', pluginRoot, ...args], { encoding: 'utf8', timeout: 30_000 }) } = {}) {
  const files = []
  const walk = relative => {
    for (const entry of readdirSync(path.join(pluginRoot, relative), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === '__pycache__' || entry.name.endsWith('.pyc')) continue
      const child = path.posix.join(relative, entry.name)
      if (entry.isDirectory()) walk(child)
      else if (entry.isFile()) files.push(child)
    }
  }
  let sha256 = null
  let reason = null
  try {
    for (const directory of READER_DIRECTORIES) walk(directory)
    const hash = createHash('sha256')
    for (const file of files.sort()) {
      hash.update(`${file}\0`)
      hash.update(readFileSync(path.join(pluginRoot, file), 'utf8').replaceAll('\r\n', '\n'))
      hash.update('\0')
    }
    sha256 = hash.digest('hex')
  } catch (error) {
    // Never a hash of the files it could read: that would name readers nobody ran.
    reason = `a reader file could not be read (${error.code ?? error.message})`
  }
  let git = null
  let dirty = null
  const head = run(['rev-parse', '--show-toplevel', 'HEAD'])
  const [top, commit] = !head.error && head.status === 0 ? String(head.stdout).trim().split('\n') : []
  let checkout = false
  try { checkout = Boolean(top && commit) && realpathSync(top) === realpathSync(path.dirname(pluginRoot)) } catch { checkout = false }
  if (checkout) {
    git = commit
    const status = run(['status', '--porcelain', '--untracked-files=all', '--', ...READER_DIRECTORIES])
    dirty = !status.error && status.status === 0 ? String(status.stdout).trim() !== '' : null
  }
  return { sha256, git, dirty, ...(reason ? { reason } : {}) }
}

function parseJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

/**
 * Why a spawn result carries `error`. spawnSync's ETIMEDOUT is a child it KILLED
 * at the deadline — the reader ran and was stopped, the opposite of "did not
 * start". One classifier for every reader branch: the first fix reached only
 * `reader()` and left adr-lint and SessionStart saying "did not start" for a
 * killed child (Codex review of bdeba73, P3).
 */
export function failedToRun(error, budgetMs = null) {
  return error.code === 'ETIMEDOUT'
    ? `killed at the probe's ${budgetMs ? `${Math.round(budgetMs / 1000)}s ` : ''}budget before it finished (ETIMEDOUT); raise the budget`
    : `did not start: ${error.code ?? error.message}`
}

/**
 * The redaction every emitted string passes through (CLAUDE.md §6). The
 * repository root becomes `.`; the plugin's own directory, the OS temp directory
 * and the home directory become placeholders, in either separator spelling; any
 * other absolute path — a POSIX root, a drive letter, a UNC share — becomes
 * `<path>`. Anchored on a token boundary so a repository-relative path is never
 * touched: the first version knew five root names, let `D:\Projects\…` out whole
 * and ate `docs/var/cache/tasks/T1.md` down to `docs<path>` (Codex review of
 * bdeba73, P1 and P2).
 */
export function scrubber({ root, pluginRoot, tmp = os.tmpdir(), home = os.homedir() }) {
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const spellings = prefix => [...new Set([prefix, prefix.replaceAll('\\', '/'), prefix.replaceAll('/', '\\')])]
  // A known prefix is replaced only where it starts a path token and ends at a
  // separator or the end of the token: `.split('/tmp')` turned `docs/tmp/x` into
  // `docs<tmp>/x` on any Linux host (Codex review of 1032720, P2).
  const known = [[root, '.'], [pluginRoot, '<plugin>'], [tmp, '<tmp>'], [home, '<home>']]
    .filter(([prefix]) => prefix)
    .map(([prefix, placeholder]) => [
      new RegExp(`(?<![\\w.\\\\/-])(?:${spellings(prefix).map(escape).join('|')})(?=[\\\\/\\s'"\`)]|$)`, 'g'), placeholder])
  // A quoted path is consumed to ITS closing delimiter, whatever other quote
  // characters it holds: `"D:\Projects\Example Person\x"` used to leave
  // ` Person\x"` behind, and `"/opt/Example's secret/x"` stopped at the
  // apostrophe (Codex, 1032720 P1 and abd5a13 P1).
  const QUOTED = /(["'`])((?:file:\/\/\/?|[A-Za-z]:[\\/]|\\\\|\/(?!\/))(?:(?!\1)[^\n])*)\1/g
  // The tail of an unquoted path: to the next space, quote or paren — and on
  // past a space when the word after it is followed by a separator, so
  // `Example Person\x` is one path and `task.md failed` is not.
  const TAIL = /[^\s'"`)]*(?:[ \t]+[^\s'"`)\\/]+(?=[\\/])[^\s'"`)]*)*/.source
  // Any other absolute path — a drive letter, a UNC share in either spelling, a
  // file: URL, or a POSIX root — becomes `<path>`. Not preceded by a path
  // character or by one of this function's own placeholders, so `docs/var/x`,
  // `./tmp/x` and `<tmp>/qh-1` are untouched; a colon or `->` may precede it; a
  // URL's `//` may not, and a bare `/` between words is not a path.
  //
  // ⚠ THE SAFE DIRECTION IS OVER-SCRUBBING, BY DECISION. This is a classifier
  // over free text (CLAUDE.md §16) and it cannot be made exact: a regex literal
  // in a diagnostic (`/foo\/bar/i`) and a URL's query path (`?q=/api/v1`) are
  // redacted too, and three review rounds found a leak each time the boundary
  // was made cleverer. A report that lost a reproduction hint costs one
  // question; a report that shipped a home directory cannot be recalled (§6).
  const HEAD = /(?<![\w.\\/-])(?<!<(?:tmp|home|plugin|path)>)(?:file:\/\/\/?|[A-Za-z]:[\\/]|\\\\[^\s'"`)\\]+\\|(?<!:)\/\/[^\s'"`)\/]+\/|\/(?!\/))/.source
  const ABSOLUTE = new RegExp(`${HEAD}[^\\s'"\`)\\\\/]${TAIL}`, 'g')
  return text => {
    let out = String(text)
    for (const [pattern, placeholder] of known) out = out.replace(pattern, placeholder)
    return out.replace(QUOTED, '$1<path>$1').replace(ABSOLUTE, '<path>')
  }
}

/**
 * Where two readers disagree about one task. Compared only where BOTH answered: a
 * reader that crashed made no observation, and a directory work-next reports as
 * `readinessUnproven` is one it did not read — "not offered" there is not a
 * disagreement, it is the absence of one (Codex review of bdeba73, P2). Every path
 * here is already the repository-relative POSIX form.
 */
export function compareReaders(adrNext, workNext) {
  if (!workNext || !Array.isArray(workNext.ready)) return []
  const unread = new Set(workNext.readinessUnproven ?? [])
  // A record that is not Accepted is a plan, not a work order (CLAUDE.md §10):
  // adr-next still answers for it and says so, and work-next never offers it, so
  // its tasks are not a disagreement between the two (BACKLOG §270).
  const answered = adrNext.filter(entry => entry.ready !== null && !unread.has(entry.tasksDir) && entry.undecided !== true)
  const workNextReady = new Set(workNext.ready)
  const disagreements = []
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
    if (!answeredDirs.has(path.posix.dirname(task))) continue
    if (!adrNextReady.has(task)) disagreements.push({ task, adrNext: 'not ready', workNext: 'ready' })
  }
  return disagreements
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
    const why = failedToRun(result.error, budgetMs)
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
  // Every reader's free text goes through here before it is emitted (see `scrubber`).
  const pluginRoot = path.resolve(here, '..')
  const scrub = scrubber({ root: resolved, pluginRoot })
  // Fingerprinted before the first reader runs as well as after the last: a run
  // whose readers moved under it — a commit mid-run, a mutation campaign restoring
  // files — must not report the commit it ended at (cold review of 833ea52).
  const readersAtStart = readerFingerprint(pluginRoot)
  const couldNotRun = []
  const note = (readerName, why) => couldNotRun.push({ reader: scrub(readerName), why: scrub(why) })
  const node = (script, args, options = {}) => spawnSync(process.execPath, [path.join(here, script), ...args],
    { cwd: resolved, encoding: 'utf8', timeout: timeoutMs, ...options })
  const gate = (tool, args, timeout = timeoutMs) => spawnGate(path.join(bin, tool), args, { cwd: resolved, encoding: 'utf8', timeout })
  // ADR-064 T4: every spawn is timed, including one that failed, so a reader that
  // is `null` below still has its time here. A disk walk that took minutes per
  // record and an adr-next past work-next's 60 s budget were found only because a
  // peer noticed. `ms` is wall time; the report never calls a reader slow.
  const timings = []
  const timed = (readerName, target, run) => {
    const start = performance.now()
    try { return run() } finally {
      timings.push({ reader: readerName, target: target == null ? null : scrub(target), ms: Math.round(performance.now() - start) })
    }
  }

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
  // A frozen record is still linted, and its entry says so: a verdict on an archive
  // read beside the live records as if it were one (BACKLOG §279 item 4).
  const frozen = record => (record.frozen ? { frozen: true } : {})
  const adrLint = corpus.map(record => {
    const tasksDir = (record.taskFiles ?? []).length ? path.dirname(record.taskFiles[0]) : null
    const run = timed('adr-lint', rel(record.file), () => gate('adr-lint', tasksDir ? [record.file, tasksDir] : [record.file]))
    if (run.error) {
      note(`adr-lint ${rel(record.file)}`, failedToRun(run.error, timeoutMs))
      return { file: rel(record.file), exit: null, verdict: null, ...frozen(record) }
    }
    const first = `${run.stdout ?? ''}${run.stderr ?? ''}`.split('\n').find(line => /^\[|not-recognised|NOT A DECISION RECORD/.test(line)) ?? ''
    const verdict = /^\[PASS\]/.test(first) ? 'PASS' : /^\[FAIL\]/.test(first) ? 'FAIL' : /not-recognised/.test(first) ? 'not-recognised' : /NOT A DECISION RECORD/i.test(first) ? 'not-a-record' : `exit ${run.status}`
    // A FAIL carries its first finding. A runner who saw only the verdict had to
    // find and run adr-lint by hand, and one could not, and reported the FAIL
    // without its cause (BACKLOG §279 item 9). Scrubbed like every emitted string.
    const finding = verdict === 'FAIL'
      ? `${run.stdout ?? ''}`.split('\n').find(line => /^ {2}\S/.test(line) && !/^ {2}advice:/.test(line))
      : undefined
    return { file: rel(record.file), exit: run.status, verdict, ...(finding ? { reason: scrub(finding.trim()) } : {}), ...frozen(record) }
  })

  const workNext = reader('work-next', () => timed('work-next', null, () => node('work-next.mjs', ['--json'])), note)
  const adrState = reader('adr-state', () => timed('adr-state', null, () => node('adr-state.mjs', ['--json'])), note)

  // adr-next per task directory of a governing, unfrozen record — the same set
  // SessionStart and work-next ask about. A frozen archive's tasks are history;
  // asking adr-next about them produced three "ready" answers on this
  // repository's own archive that no reader should act on.
  const frozenTaskDirs = [...new Set(corpus.filter(record => record.frozen)
    .flatMap(record => (record.taskFiles ?? []).map(file => path.dirname(file))))].map(rel)
  const liveTaskDirs = [...new Set(corpus.filter(record => !record.frozen)
    .flatMap(record => (record.taskFiles ?? []).map(file => path.dirname(file))))]
  const adrNext = liveTaskDirs.map(dir => {
    const answer = reader(`adr-next ${rel(dir)}`, () => timed('adr-next', rel(dir), () => gate('adr-next', [dir, '--json'])), note)
    return {
      tasksDir: rel(dir),
      ready: answer?.ready?.map(task => ({ id: task.id, path: rel(path.resolve(resolved, task.path)), unproven: task.unproven ? scrub(task.unproven) : null })) ?? null,
      undecided: answer?.undecided ?? null,
    }
  })

  // The real hook, with a payload shaped as the host sends it and ALL its state
  // pointed at scratch: plugin data, temp, and the per-repository state directory
  // that otherwise lives in the corpus's own `.git` (QUALITY_HARNESS_STATE_DIR).
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-corpus-probe-'))
  let sessionStart = null
  try {
    const hook = timed('SessionStart', null, () => node('lifecycle.mjs', [], {
      input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', session_id: `corpus-probe-${process.pid}`, cwd: resolved }),
      env: { ...process.env, CLAUDE_PLUGIN_DATA: path.join(scratch, 'data'), TMPDIR: scratch, TMP: scratch, TEMP: scratch, QUALITY_HARNESS_STATE_DIR: path.join(scratch, 'state') },
    }))
    // A hook that crashed, was signalled, or printed something other than the
    // JSON the host expects made no observation; it is could-not-run, not an
    // empty orientation (Codex review of c1f546a, P2). An empty stdout with exit
    // 0 IS an observation: a corpus with nothing to say.
    if (hook.error) note('SessionStart', failedToRun(hook.error, timeoutMs))
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
    const report = reader(`corpus-report ${rel(dir)}`, () => timed('corpus-report', rel(dir), () => node('corpus-report.mjs', [dir, '--json'])), note)
    return { root: rel(dir), totals: report?.totals ?? null, records: report?.records ?? null }
  })

  const sweeps = sweep
    ? corpusDirs.map(dir => {
      const answer = reader(`adr-verify --sweep ${rel(dir)}`,
        () => timed('adr-verify --sweep', rel(dir), () => gate('adr-verify', ['--sweep', dir, '--json', '--timeout', String(sweepTimeoutSeconds)], sweepBudgetMs)), note, sweepBudgetMs)
      return answer ? { root: rel(dir), claims: answer.claims, held: answer.held, false: answer.false, superseded: answer.superseded, unrunnable: answer.unrunnable } : { root: rel(dir), buckets: null }
    })
    : null

  // Where two readers disagree about the same task. Each reader is right by its
  // own rule; a user sees both and cannot tell which to believe, which is the
  // defect. Computed here so it is a line in a report, not a thing to notice.
  // Every path a reader hands back is normalised to the repository-relative
  // POSIX form before it is compared or emitted: work-next prints native
  // separators, adr-next's came through publicPath, and on Windows the same task
  // produced two contradictory entries (Codex review of c1f546a, P1). The
  // comparison itself is `compareReaders`, above.
  const normal = value => rel(path.resolve(resolved, String(value)))
  const workNextPaths = key => workNext ? (workNext[key] ?? []).map(normal) : null
  const workNextReadyList = workNextPaths('tasksWithoutEvidence')
  const workNextUnproven = workNextPaths('readinessUnproven')
  const disagreements = compareReaders(adrNext, workNext && { ready: workNextReadyList, readinessUnproven: workNextUnproven })

  return {
    probe: {
      version: pluginVersion(), sha256: probeDigest(), readers: readersOfRun(readersAtStart, readerFingerprint(pluginRoot)),
      // What an attestation carries about the run (ADR-064 T3), recorded here so
      // `--attest` can be pure over the saved report.
      date: new Date().toISOString().slice(0, 10), platform: `${os.type()} ${os.release()}`, node: process.versions.node, python: pythonVersion(),
    },
    root: '.',
    look,
    corpora: corpusDirs.map(rel),
    records,
    workNext: workNext && {
      look: workNext.look, records: workNext.records, accepted: workNext.accepted, tasks: workNext.tasks,
      ready: workNextReadyList, unbacked: workNextPaths('unbackedDoneClaims'),
      underUndecided: workNextPaths('tasksUnderAnUndecidedRecord'), retirable: workNextPaths('retirableInActiveCorpus'),
      readinessUnproven: workNextUnproven,
      unmarkedArchives: workNextPaths('unmarkedArchives'),
      readyButClaimedDone: workNextPaths('readyButClaimedDone'),
      // The spec count and the specs whose Status could not be read: work-next's text
      // said "77 spec file(s) have an UNPROVEN Status" and this summary dropped it, so
      // a pasted probe said less than the reader (inbox, quality-blueprints 2026-09-24).
      specs: workNext.specs ?? null,
      unprovenSpecs: workNextPaths('unprovenSpecs'),
      partialBecause: (workNext.partialBecause ?? []).map(entry => ({ file: normal(entry.file), reason: entry.reason })),
      next: workNext.next,
    },
    frozenTaskDirs,
    adrState: adrState && {
      look: adrState.look, read: adrState.read, governing: adrState.governing,
      // Normalised like every other path here: adr-state prints native separators,
      // so on Windows this was the one field in backslashes and a consumer joining
      // on file matched nothing (BACKLOG §279 item 5, reported from Windows 11).
      governingNothing: adrState.governingNothing?.map(entry => ({ ...entry, file: normal(entry.file) })) ?? null, contested: adrState.contested?.length ?? null,
      danglingSupersession: adrState.danglingSupersession,
    },
    adrNext,
    adrLint,
    sessionStart,
    corpusReport,
    sweep: sweeps,
    disagreements,
    couldNotRun,
    timings,
    slowest: [...timings].sort((a, b) => b.ms - a.ms).slice(0, 5),
  }
}

/**
 * What changed between two saved reports of one corpus (ADR-064 T2), as lines.
 * Pure. Every line goes through `scrub` again: an older probe's scrubber let
 * Windows paths out, and copying its values verbatim would re-emit them. A run
 * that could not look, or two reports of different corpora, are said and not
 * compared. A field only one report carries is named as missing, never read as
 * empty. A timing is a line only when it at least doubled AND grew by a second, so
 * load noise on a fast reader stays quiet.
 */
export function diffReports(before, after, scrub = text => String(text)) {
  const lines = []
  const say = text => lines.push(scrub(text))
  if (before.look !== 'ok' || after.look !== 'ok') return [scrub(`look: ${before.look} → ${after.look}: not compared`)]
  const corpora = report => (report.corpora ?? []).join(', ')
  if (corpora(before) !== corpora(after)) return [scrub(`corpora differ (${corpora(before)} → ${corpora(after)}): not compared`)]
  const lacks = (field, b, a) => {
    if (b === undefined && a !== undefined) { say(`before lacks ${field}`); return true }
    if (a === undefined && b !== undefined) { say(`after lacks ${field}`); return true }
    return b === undefined
  }
  // A reader that did not answer on one side is ONE line, naming it; its fields
  // were then listed one by one as "after lacks workNext.records" and so on
  // before `couldNotRun` said why (BACKLOG §289 item 6).
  const absent = new Set()
  for (const group of ['workNext', 'adrState']) {
    const [b, a] = [before[group], after[group]]
    if ((b == null) !== (a == null)) {
      absent.add(group)
      say(`${group}: ${b == null ? 'before' : 'after'} has no answer from this reader (see couldNotRun), so its fields are not compared`)
    }
  }
  const readers = [before.probe?.readers, after.probe?.readers]
  if (!lacks('probe.readers', ...readers) && readers[0].sha256 !== readers[1].sha256) {
    say(`readers: ${String(readers[0].sha256).slice(0, 12)}… → ${String(readers[1].sha256).slice(0, 12)}…`)
  }
  for (const [group, keys] of [['workNext', ['records', 'accepted', 'tasks']], ['adrState', ['read', 'governing']]]) {
    if (absent.has(group)) continue
    for (const key of keys) {
      const [b, a] = [before[group]?.[key], after[group]?.[key]]
      if (!lacks(`${group}.${key}`, b, a) && b !== a) say(`${group}.${key}: ${b} → ${a}`)
    }
  }
  const setChange = (field, b, a) => {
    if (lacks(field, b, a)) return
    const [was, now] = [new Set(b ?? []), new Set(a ?? [])]
    const changes = [...[...now].filter(x => !was.has(x)).map(x => `+ ${x}`), ...[...was].filter(x => !now.has(x)).map(x => `- ${x}`)]
    if (changes.length) say(`${field}: ${changes.join(', ')}`)
  }
  for (const key of absent.has('workNext') ? [] : ['ready', 'unbacked', 'readinessUnproven', 'unmarkedArchives', 'readyButClaimedDone']) {
    setChange(`workNext.${key}`, before.workNext?.[key], after.workNext?.[key])
  }
  if (!lacks('adrLint', before.adrLint, after.adrLint)) {
    const was = new Map(before.adrLint.map(entry => [entry.file, entry]))
    const now = new Map(after.adrLint.map(entry => [entry.file, entry]))
    for (const [file, entry] of now) {
      const old = was.get(file)
      if (!old) say(`adrLint ${file}: new, ${entry.verdict}`)
      else if (old.verdict !== entry.verdict) say(`adrLint ${file}: ${old.verdict} → ${entry.verdict}${entry.reason ? ` — ${entry.reason}` : ''}`)
      // A FAIL that stays a FAIL for another reason — one defect fixed, another
      // exposed — is a change too (Codex review of 833ea52).
      else if ((old.reason ?? null) !== (entry.reason ?? null)) say(`adrLint ${file}: ${entry.verdict}, reason changed — ${entry.reason ?? '(none)'}`)
    }
    for (const file of was.keys()) if (!now.has(file)) say(`adrLint ${file}: removed`)
  }
  setChange('couldNotRun', before.couldNotRun?.map(entry => entry.reader), after.couldNotRun?.map(entry => entry.reader))
  setChange('disagreements', before.disagreements?.map(entry => entry.task), after.disagreements?.map(entry => entry.task))
  if (!lacks('sessionStart', before.sessionStart, after.sessionStart) && before.sessionStart && after.sessionStart) {
    const [was, now] = [new Set(before.sessionStart.lines), new Set(after.sessionStart.lines)]
    for (const line of now) if (!was.has(line)) say(`SessionStart + ${line}`)
    for (const line of was) if (!now.has(line)) say(`SessionStart - ${line}`)
  }
  if (!lacks('timings', before.timings, after.timings)) {
    const key = entry => `${entry.reader}${entry.target ? ` ${entry.target}` : ''}`
    const was = new Map(before.timings.map(entry => [key(entry), entry.ms]))
    for (const entry of after.timings) {
      const old = was.get(key(entry))
      if (old !== undefined && entry.ms >= 2 * old && entry.ms - old >= 1000) say(`slower: ${key(entry)} ${old} → ${entry.ms} ms`)
    }
  }
  return lines.length ? lines : ['nothing changed']
}

/** The version of the interpreter the gates run under, or null when none answered. */
function pythonVersion() {
  const command = process.platform === 'win32' ? resolvePython() : ['python3']
  if (!command) return null
  const run = spawnSync(command[0], [...command.slice(1), '--version'], { encoding: 'utf8', timeout: 10_000 })
  return /Python (\S+)/.exec(`${run.stdout ?? ''}${run.stderr ?? ''}`)?.[1] ?? null
}

/**
 * The readers a run can vouch for: the end fingerprint, marked `moved` when it
 * differs from the start's in content or commit — then no single commit describes
 * what ran, and an attestation must not name one.
 */
export function readersOfRun(start, end) {
  return start.sha256 === end.sha256 && start.git === end.git ? end : { ...end, moved: true }
}

/**
 * The counts-only attestation docs/corpus-reports/README.md defines, from a saved
 * report (ADR-064 T3). Pure. `at` is the readers' commit only when no reader file
 * differs from it and the readers did not move during the run: release-evidence
 * compares commits and cannot see a working tree, so a commit here over edited or
 * moving readers would attest readers nobody ran. A count whose reader did not
 * answer is null, never 0. `found` is left empty for the session that reads the
 * diff: this tool never says what a run found.
 */
function corpusCounts(report) {
  const taskDirectories = Array.isArray(report.adrNext) ? report.adrNext.length + (report.frozenTaskDirs?.length ?? 0) : null
  if (report.workNext?.records != null) return { records: report.workNext.records, tasks: report.workNext.tasks ?? null, taskDirectories }
  // corpus-report's `records` is a COUNT (recordCount), not a list (Codex review of 991f400).
  const answered = (report.corpusReport ?? []).filter(entry => entry.totals && Number.isFinite(entry.records))
  if (!answered.length) return { records: null, tasks: null, taskDirectories }
  return {
    records: answered.reduce((sum, entry) => sum + entry.records, 0),
    tasks: answered.reduce((sum, entry) => sum + (entry.totals.tasks ?? 0), 0),
    taskDirectories,
    countsFrom: 'corpusReport',
  }
}

export function attestation(report, label) {
  const readers = report.probe?.readers ?? {}
  const committed = typeof readers.git === 'string' && readers.dirty === false && !readers.moved
  const count = list => (Array.isArray(list) ? list.length : null)
  return {
    date: report.probe?.date ?? null,
    at: committed ? readers.git : null,
    ...(committed ? {} : { atReason: !readers.git ? 'the plugin is not a git checkout'
      : readers.moved ? 'the readers changed while the probe ran'
        : readers.dirty === true ? 'reader files modified at HEAD'
          : 'whether the reader files match HEAD could not be checked' }),
    plugin: report.probe?.version ?? null,
    kind: 'probe',
    probeSha256: report.probe?.sha256 ?? null,
    readers: readers.sha256 ?? null,
    platform: report.probe?.platform ?? null,
    node: report.probe?.node ?? null,
    python: report.probe?.python ?? null,
    // Falls back to corpus-report when work-next did not answer, and says so: null
    // is right when nothing counted, and a report holding both numbers is not
    // nothing (BACKLOG §289 item 5, a Go corpus whose work-next ran out of budget).
    corpus: corpusCounts(report),
    couldNotRun: count(report.couldNotRun),
    disagreements: count(report.disagreements),
    readinessUnproven: count(report.workNext?.readinessUnproven),
    runner: label,
    found: '',
  }
}

/**
 * A saved report, or why a file is not one. The reason never quotes the file: a
 * JSON parse message excerpts the input, and a file that parses to `null` or an
 * array used to reach property access and crash with a stack of absolute paths
 * (Codex review of 833ea52).
 */
function readReport(file) {
  let text
  try { text = readFileSync(file, 'utf8') } catch (error) { return { why: error.code ?? 'unreadable' } }
  let parsed
  try { parsed = JSON.parse(text) } catch { return { why: 'not valid JSON' } }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { why: 'not a JSON object' }
  return { report: parsed }
}

function notAReport(file, why) {
  process.stderr.write(`corpus-probe: ${publicPath(file, process.cwd())} is not a report (${why})\n`)
  return 2
}

/** `--attest`: read a saved report and print its attestation. Exit 2 when it is not one. */
function attestMain(label, file) {
  const { report, why } = readReport(file)
  if (!report) return notAReport(file, why)
  process.stdout.write(`${JSON.stringify(attestation(report, label), null, 2)}\n`)
  return 0
}

/** `--diff`: read two saved reports and print what changed. Exit 2 when one is not a report. */
function diffMain(beforeFile, afterFile) {
  const reports = []
  for (const file of [beforeFile, afterFile]) {
    const { report, why } = readReport(file)
    if (!report) return notAReport(file, why)
    reports.push(report)
  }
  const scrub = scrubber({ root: null, pluginRoot: path.resolve(here, '..') })
  process.stdout.write(`${diffReports(reports[0], reports[1], scrub).join('\n')}\n`)
  return 0
}

function usage() {
  process.stderr.write('usage: corpus-probe.mjs [<repo-root>] [--json] [--sweep] [--timeout <seconds>] [--sweep-budget <seconds>]\n'
    + '       corpus-probe.mjs --diff <before.json> <after.json>\n'
    + '       corpus-probe.mjs --attest <label> <report.json>\n')
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
    if (arg === '--diff') return argv[i + 1] && argv[i + 2] ? diffMain(argv[i + 1], argv[i + 2]) : usage()
    if (arg === '--attest') return argv[i + 1] && argv[i + 2] ? attestMain(argv[i + 1], argv[i + 2]) : usage()
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
