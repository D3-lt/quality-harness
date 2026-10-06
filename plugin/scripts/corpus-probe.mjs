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
//   node corpus-probe.mjs --attest <label> <report.json> [--since <earlier.json>]
//
// `--attest` reads one saved report and prints the counts-only attestation
// docs/corpus-reports/README.md defines (ADR-064 T3), so no count is transcribed.
// With `--since`, the attestation also counts the adr-lint verdicts that moved since the
// runner's earlier report of the same corpus (ADR-082), from the comparison `--diff` prints.
//
// `--diff` reads two saved reports of ONE corpus and prints what changed in the fields
// it compares, and names a reader or a field it could not compare. It
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
import { adrCorpus, resolvePython, scrubber, spawnGate, trackedPaths, undecidedReason } from './lifecycle.mjs'
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
export function readerFingerprint(pluginRoot, { run = args => spawnSync('git', ['-C', pluginRoot, ...args], { encoding: 'utf8', timeout: 30_000, windowsHide: true }) } = {}) {
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

// The redaction lives in lifecycle.mjs, shared with SessionStart; this module's callers import it here.
export { scrubber }

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
// A scratch directory under the temp directory. The probe keeps adr-lint's advice note and the
// SessionStart hook's state there, so that it writes nothing into the corpus it reads. Where the temp
// directory cannot be used (TEMP naming a path that does not exist), it died in mkdtemp with a stack
// trace and no JSON (BACKLOG §350 C1); it now throws a ScratchError, which `main` says in one line,
// exiting 3, could not run. The need is the probe's own: adr-lint run alone uses no temp directory,
// and the first wording, "nowhere to put adr-lint's state", read as adr-lint's (item 6).
class ScratchError extends Error {}
function scratchDirectory(prefix) {
  // The directory is not named: every path that leaves this file is relative or a placeholder (the
  // header), and a Windows TEMP carries the user's name. Nor is the error's message, which repeats it.
  try { return mkdtempSync(path.join(os.tmpdir(), prefix)) } catch (error) {
    throw new ScratchError(`the temp directory (TMPDIR, or TEMP on Windows) could not be used (${error.code ?? 'no error code'}). `
      + 'the probe keeps adr-lint\'s advice note and the SessionStart hook\'s state in its own scratch directory there, so that it '
      + 'writes nothing into the corpus; without one it does not run. Point TMPDIR (TEMP on Windows) at a writable directory.')
  }
}

// `listing` is the seam a test sets, as work-next's is: git on macOS and Linux does not list through a
// symlinked directory, so a link copy is reachable from a test only by naming the listing.
export function probe(root, { sweep = false, timeoutMs = DEFAULT_TIMEOUT_MS, sweepTimeoutSeconds = 60, sweepBudgetMs = DEFAULT_SWEEP_BUDGET_MS, listing: given } = {}) {
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
    { cwd: resolved, encoding: 'utf8', timeout: timeoutMs, windowsHide: true, ...options })
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

  const listing = given === undefined ? trackedPaths(resolved) : given
  const corpus = adrCorpus(resolved, { tracked: listing })
  const look = listing == null ? 'UNPROVEN' : (corpus.look ?? 'ok')
  const records = corpus.map(record => ({
    // A Status line is corpus text, scrubbed like every emitted string: one reading "recorded in
    // ~/<other repository>/…" printed whole in the full report (an outside run of the 3.8.7 RC).
    id: record.id ?? null, file: rel(record.file), status: record.status == null ? null : scrub(record.status), kind: record.kind ?? null,
    frozen: Boolean(record.frozen),
  }))
  // Files that look like records and carry no status the readers act on, or could
  // not be opened. They were counted nowhere here: a record whose `**Status:**` had a
  // fullwidth colon, or that was saved as UTF-16, made `records` 0 with `look` ok and
  // was never linted (a Windows chaos round of 626934a, F-1 and F-2).
  // A link copy of a record is named among adr-lint's `unread` entries, never as an undecided record.
  const undecided = (corpus.unreadable ?? []).filter(entry => !entry.alias).map(entry => ({
    file: rel(entry.file), status: entry.status == null ? null : scrub(entry.status), reason: entry.reason ?? undecidedReason(entry),
  }))
  const corpusDirs = [...new Set(corpus.map(record => path.dirname(record.file)))]
  const taskDirs = [...new Set(corpus.flatMap(record => (record.taskFiles ?? []).map(file => path.dirname(file))))]

  // adr-lint per record: the gate's own verdict on each file the readers counted.
  // ADR-038 makes a MADR or Nygard record `not-recognised` while the corpus
  // readers still count it, and that split is a thing to see side by side.
  // A frozen record is still linted, and its entry says so: a verdict on an archive
  // read beside the live records as if it were one (BACKLOG §279 item 4).
  const frozen = record => (record.frozen ? { frozen: true } : {})
  // adr-lint writes its advice-survival note into the repository's git directory
  // (ADR-037 T1), and this probe promises to write nothing under root (a Windows
  // chaos round of 626934a, F-5a): the note goes to a scratch state directory.
  const lintState = scratchDirectory('qh-corpus-probe-lint-')
  const adrLint = [...corpus, ...(corpus.unreadable ?? [])].map(record => {
    // A file the corpus reader never opened (not on disk in a sparse checkout, over the
    // size bound, past the record budget) has no verdict to take: spawning adr-lint for
    // each of 164 such paths cost 48 s against 4 s (a corpus-chaos run of 916b515). It is
    // named, with the reason nothing read it.
    if (record.reason) return { file: rel(record.file), exit: null, verdict: 'unread', reason: scrub(record.reason), ...frozen(record), undecided: true }
    const tasksDir = (record.taskFiles ?? []).length ? path.dirname(record.taskFiles[0]) : null
    const run = timed('adr-lint', rel(record.file), () => spawnGate(path.join(bin, 'adr-lint'), tasksDir ? [record.file, tasksDir] : [record.file],
      { cwd: resolved, encoding: 'utf8', timeout: timeoutMs, env: { ...process.env, QUALITY_HARNESS_STATE_DIR: lintState } }))
    if (run.error) {
      note(`adr-lint ${rel(record.file)}`, failedToRun(run.error, timeoutMs))
      return { file: rel(record.file), exit: null, verdict: null, ...frozen(record) }
    }
    // adr-lint answered could-not-run (exit 2, a file it could not read): counted where every other
    // reader that could not run is, by record. The attestation's `couldNotRun` read 1 while 57-76
    // records could not be linted (BACKLOG §350 C3).
    // Not a not-recognised file: adr-lint exits 2 there too, but that is a verdict about a file that
    // never claimed to be a record, and two such notes were counted as could-not-run (an outside run
    // of the 3.8.7 RC, laravel-cms). Any other exit 2 is counted.
    if (run.status === 2 && !/not-recognised|NOT A DECISION RECORD/.test(`${run.stdout ?? ''}${run.stderr ?? ''}`)) {
      note(`adr-lint ${rel(record.file)}`, `${run.stderr ?? ''}`.split('\n').find(line => line.trim()) ?? 'exit 2')
    }
    // The verdict line by name, never "the first line opening with `[`": on a record older than
    // the corpus's strictFrom, adr-lint prints `[strictFrom] …` ABOVE its verdict, and a PASS read
    // `exit 0` with nothing behind it. adr-lint's other bracketed line, `[adr-lint] could not run`,
    // is stderr and exit 2, which the `exit N` arm below already names.
    // [UNPROVEN] is the third verdict, exit 3: nothing blocks and something could not be read
    // (BACKLOG §350 C8); a regex that knew two verdicts read it as `exit 3`.
    const first = `${run.stdout ?? ''}${run.stderr ?? ''}`.split('\n').find(line => /^\[(?:PASS|FAIL|UNPROVEN)\] |not-recognised|NOT A DECISION RECORD/.test(line)) ?? ''
    const verdict = /^\[PASS\]/.test(first) ? 'PASS' : /^\[FAIL\]/.test(first) ? 'FAIL' : /^\[UNPROVEN\]/.test(first) ? 'UNPROVEN' : /not-recognised/.test(first) ? 'not-recognised' : /NOT A DECISION RECORD/i.test(first) ? 'not-a-record' : `exit ${run.status}`
    // A FAIL carries its first finding. A runner who saw only the verdict had to
    // find and run adr-lint by hand, and one could not, and reported the FAIL
    // without its cause (BACKLOG §279 item 9). Scrubbed like every emitted string.
    // A verdict that is only an exit code carries what the gate said on stderr, or it
    // reads as a failure with nothing behind it (a Windows chaos round of 916b515, C-5).
    // An UNPROVEN carries what could not be decided, as a FAIL carries its finding: a move to
    // UNPROVEN said no reason (a stand-in review of f8d1eaf).
    const finding = verdict === 'FAIL'
      ? `${run.stdout ?? ''}`.split('\n').find(line => /^ {2}\S/.test(line) && !/^ {2}advice:/.test(line))
      : verdict === 'UNPROVEN' ? `${run.stdout ?? ''}`.split('\n').find(line => /^ {2}unproven: /.test(line))
      : /^exit /.test(verdict) ? `${run.stderr ?? ''}`.split('\n').find(line => line.trim())
      // A not-recognised file carries what IT lacks, the clause adr-lint ends its sentence with: 32
      // records of a public corpus all read "not-recognised" and nothing else (an outside run, 2026-10-06).
      : verdict === 'not-recognised' ? (first.match(/This file: .*$/) ?? [])[0] : undefined
    // Advice leaves with the verdict. Only the verdict did, so a PASS the gate had advised on
    // read as a bare PASS and the advice a runner meant to report was invisible (a corpus-chaos
    // run of cd7e6ab, BACKLOG §319's addendum). Every advice line the gate printed, a withheld
    // count included, scrubbed like the reason. Only under a verdict the gate reached: it prints
    // advice below its [PASS] or [FAIL] line and nowhere else, so a not-recognised record, a
    // could-not-run and an unread one carry no list — an empty one would say the gate had
    // nothing to add about a record it never checked (ADR-005).
    const advice = `${run.stdout ?? ''}`.split('\n').filter(line => /^ {2}advice(?: withheld)?: /.test(line)).map(line => scrub(line.trim()))
    // What the gate could not decide rides too, under whatever verdict it reached: a FAIL outranks
    // UNPROVEN, and a record with no Status that FAILed on another rule lost its only Status signal
    // in the report (an outside run of the 3.8.7 RC, rust-adr-corpus). Present only when the gate printed one.
    const unproven = `${run.stdout ?? ''}`.split('\n').filter(line => /^ {2}unproven: /.test(line)).map(line => scrub(line.trim()))
    return { file: rel(record.file), exit: run.status, verdict, ...(finding ? { reason: scrub(finding.trim()) } : {}),
      ...(verdict === 'PASS' || verdict === 'FAIL' ? { advice } : {}), ...(unproven.length ? { unproven } : {}), ...frozen(record),
      ...(corpus.includes(record) ? {} : { undecided: true }) }
  })
  try { rmSync(lintState, { recursive: true, force: true }) } catch { /* scratch outlives us */ }

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
      // Tasks adr-next could not read, named: a directory holding one is not evidenced.
      unreadable: answer ? (answer.stopped ?? []).filter(task => task.unreadable).map(task => rel(path.resolve(resolved, task.path))) : null,
    }
  })

  // The real hook, with a payload shaped as the host sends it and ALL its state
  // pointed at scratch: plugin data, temp, and the per-repository state directory
  // that otherwise lives in the corpus's own `.git` (QUALITY_HARNESS_STATE_DIR).
  const scratch = scratchDirectory('qh-corpus-probe-')
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
    undecided,
    workNext: workNext && {
      look: workNext.look, records: workNext.records, accepted: workNext.accepted, tasks: workNext.tasks,
      ready: workNextReadyList, unbacked: workNextPaths('unbackedDoneClaims'),
      underUndecided: workNextPaths('tasksUnderAnUndecidedRecord'), retirable: workNextPaths('retirableInActiveCorpus'),
      readinessUnproven: workNextUnproven,
      unmarkedArchives: workNextPaths('unmarkedArchives'),
      readyButClaimedDone: workNextPaths('readyButClaimedDone'),
      // The spec count and the specs whose Status could not be read: work-next's text
      // said "77 spec file(s) have an UNPROVEN Status" and this summary dropped it, so
      // a pasted probe said less than the reader (inbox, ts-generator 2026-09-24).
      specs: workNext.specs ?? null,
      unprovenSpecs: workNextPaths('unprovenSpecs'),
      partialBecause: (workNext.partialBecause ?? []).map(entry => ({ file: normal(entry.file), reason: entry.reason == null ? null : scrub(entry.reason) })),
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
/** Whether two reports describe one corpus that both looked at, so their fields compare. */
function comparable(before, after) {
  const corpora = report => (report.corpora ?? []).join(', ')
  return before.look === 'ok' && after.look === 'ok' && corpora(before) === corpora(after)
}

/**
 * verdictMoves is every adr-lint record present in both reports whose verdict moved, as
 * `{ file, from, to, reason }`, and how many records were compared. It is the one comparison
 * `--diff` prints from and an attestation counts (ADR-082), so the two cannot disagree.
 */
export function verdictMoves(before, after) {
  // By file, the last entry winning, as `diffReports` reads them: a record listed twice is one record.
  const was = new Map((before.adrLint ?? []).map(entry => [entry.file, entry]))
  const now = new Map((after.adrLint ?? []).map(entry => [entry.file, entry]))
  const moves = []
  let compared = 0
  for (const entry of now.values()) {
    const old = was.get(entry.file)
    if (!old) continue
    compared += 1
    if (old.verdict !== entry.verdict) moves.push({ file: entry.file, from: old.verdict, to: entry.verdict, reason: entry.reason })
  }
  return { compared, moves }
}

export function diffReports(before, after, scrub = text => String(text)) {
  const lines = []
  const say = text => lines.push(scrub(text))
  if (before.look !== 'ok' || after.look !== 'ok') {
    // The counts are not compared, but what made a side PARTIAL, what it held back and which
    // reader did not answer are: `--diff` said only "not compared", never what dropped out
    // (BACKLOG §350 C5).
    say(`look: ${before.look} → ${after.look}: not compared`)
    const named = (field, b, a) => {
      const [was, now] = [new Set(b), new Set(a)]
      const changes = [...[...now].filter(x => !was.has(x)).map(x => `+ ${x}`), ...[...was].filter(x => !now.has(x)).map(x => `- ${x}`)]
      if (changes.length) say(`${field}: ${changes.join(', ')}`)
    }
    named('partialBecause', ...[before, after].map(report => (report.workNext?.partialBecause ?? []).map(entry => `${entry.file} (${entry.reason})`)))
    named('undecided', ...[before, after].map(report => (report.undecided ?? []).map(entry => entry.file)))
    named('couldNotRun', ...[before, after].map(report => (report.couldNotRun ?? []).map(entry => entry.reader)))
    return lines
  }
  const corpora = report => (report.corpora ?? []).join(', ')
  if (!comparable(before, after)) return [scrub(`corpora differ (${corpora(before)} → ${corpora(after)}): not compared`)]
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
  // The run's environment: a verdict that moved with the interpreter carried no hint of why
  // (BACKLOG §346, a 3.8.4 run whose Python moved 3.14.7 → 3.14.8 between two reports).
  for (const key of ['platform', 'node', 'python']) {
    const [b, a] = [before.probe?.[key], after.probe?.[key]]
    if (b !== undefined && a !== undefined && b !== a) say(`environment: ${key} ${b} → ${a}`)
  }
  // Records the readers found and do not act on, compared by file, and a reason that moved (§346).
  if (!lacks('undecided', before.undecided, after.undecided)) {
    setChange('undecided', before.undecided.map(entry => entry.file), after.undecided.map(entry => entry.file))
    const was = new Map(before.undecided.map(entry => [entry.file, entry.reason ?? null]))
    for (const entry of after.undecided) {
      if (was.has(entry.file) && was.get(entry.file) !== (entry.reason ?? null)) say(`undecided ${entry.file}: reason changed — ${entry.reason ?? '(none)'}`)
    }
  }
  // The records themselves, by file: which are new or gone, and a Status that changed. A record's Status
  // moved and --diff said nothing (an outside run of the 3.8.7 RC, php-react-app; §346's class).
  if (!lacks('records', before.records, after.records)) {
    setChange('records', before.records.map(record => record.file), after.records.map(record => record.file))
    const was = new Map(before.records.map(record => [record.file, record.status ?? null]))
    for (const record of after.records) {
      // Compared as printed, after scrubbing both sides: a report from before the Status scrub holds the
      // raw text, and a change that was only redaction printed "X → X" (an outside run of ca3d61d, php-react-app).
      if (was.has(record.file) && scrub(String(was.get(record.file))) !== scrub(String(record.status ?? null))) {
        say(`records ${record.file} status: ${was.get(record.file) ?? '(none)'} → ${record.status ?? '(none)'}`)
      }
    }
  }
  for (const key of absent.has('workNext') ? [] : ['ready', 'unbacked', 'readinessUnproven', 'unmarkedArchives', 'readyButClaimedDone']) {
    setChange(`workNext.${key}`, before.workNext?.[key], after.workNext?.[key])
  }
  if (!lacks('adrLint', before.adrLint, after.adrLint)) {
    const was = new Map(before.adrLint.map(entry => [entry.file, entry]))
    const now = new Map(after.adrLint.map(entry => [entry.file, entry]))
    const moved = new Map(verdictMoves(before, after).moves.map(move => [move.file, move]))
    for (const [file, entry] of now) {
      const old = was.get(file)
      const move = moved.get(file)
      if (!old) say(`adrLint ${file}: new, ${entry.verdict}`)
      else if (move) say(`adrLint ${file}: ${move.from} → ${move.to}${move.reason ? ` — ${move.reason}` : ''}`)
      // A FAIL that stays a FAIL for another reason — one defect fixed, another
      // exposed — is a change too (Codex review of 833ea52).
      else if ((old.reason ?? null) !== (entry.reason ?? null)) say(`adrLint ${file}: ${entry.verdict}, reason changed — ${entry.reason ?? '(none)'}`)
      // Advice that came or went under a verdict that held is a change too: a PASS that gained
      // advice compared as "nothing changed". A verdict that moved is its own line already.
      if (old && old.verdict === entry.verdict) setChange(`adrLint ${file} advice`, old.advice, entry.advice)
      if (old && old.verdict === entry.verdict && (old.unproven || entry.unproven)) setChange(`adrLint ${file} unproven`, old.unproven ?? [], entry.unproven ?? [])
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
  const run = spawnSync(command[0], [...command.slice(1), '--version'], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
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

/**
 * The adr-lint verdicts that moved since `before`, counted, or null when there is nothing to
 * compare: no earlier report, reports `diffReports` would not compare, or one without adr-lint.
 * Null, never zeros: a run that compared nothing must not read as a run where nothing moved.
 */
function verdictChanges(before, after) {
  if (!before || !comparable(before, after) || !Array.isArray(before.adrLint) || !Array.isArray(after.adrLint)) return null
  // Reports taken by the same readers say nothing about a change in them (the stand-in review of ADR-082).
  const readers = report => report.probe?.readers?.sha256
  if (readers(before) && readers(before) === readers(after)) return null
  const { compared, moves } = verdictMoves(before, after)
  return {
    compared,
    passToFail: moves.filter(move => move.from === 'PASS').length,
    failToPass: moves.filter(move => move.to === 'PASS').length,
  }
}

export function attestation(report, label, { since } = {}) {
  const readers = report.probe?.readers ?? {}
  const committed = typeof readers.git === 'string' && readers.dirty === false && !readers.moved
  // A probe that could not list the corpus ran its readers over nothing, and its zero
  // counts read as a clean run (a Windows chaos round of 916b515, an NTFS junction loop).
  // PARTIAL still ran every reader over what it listed, and is a run.
  const looked = report.look !== 'UNPROVEN' && report.workNext?.look !== 'UNPROVEN'
  const vouched = committed && looked
  const count = list => (Array.isArray(list) ? list.length : null)
  return {
    date: report.probe?.date ?? null,
    at: vouched ? readers.git : null,
    ...(vouched ? {} : { atReason: !looked ? 'the probe could not look at the corpus (look UNPROVEN), so its readers ran over nothing'
      : !readers.git ? 'the plugin is not a git checkout'
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
    verdictChanges: verdictChanges(since, report),
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

/** `--attest`: read a saved report (and `--since` an earlier one) and print its attestation. Exit 2 when one is not a report. */
function attestMain(label, file, sinceFile) {
  const { report, why } = readReport(file)
  if (!report) return notAReport(file, why)
  let since
  if (sinceFile !== undefined) {
    const earlier = readReport(sinceFile)
    if (!earlier.report) return notAReport(sinceFile, earlier.why)
    since = earlier.report
  }
  process.stdout.write(`${JSON.stringify(attestation(report, label, { since }), null, 2)}\n`)
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
    + '       corpus-probe.mjs --attest <label> <report.json> [--since <earlier.json>]\n')
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
    if (arg === '--attest') {
      if (!argv[i + 1] || !argv[i + 2]) return usage()
      if (argv[i + 3] === undefined) return attestMain(argv[i + 1], argv[i + 2])
      return argv[i + 3] === '--since' && argv[i + 4] && argv.length === i + 5 ? attestMain(argv[i + 1], argv[i + 2], argv[i + 4]) : usage()
    }
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
  let report
  try { report = probe(root, { sweep, timeoutMs, sweepBudgetMs }) } catch (error) {
    if (!(error instanceof ScratchError)) throw error
    process.stderr.write(`corpus-probe: could not run: ${error.message}\n`)
    return 3
  }
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
    ...report.adrLint.map(entry => `adr-lint ${entry.file}: ${entry.verdict ?? 'could not run'}${entry.advice?.length ? ` · ${entry.advice.length} advice line(s)` : ''}`),
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
