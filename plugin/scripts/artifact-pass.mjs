// The artifact gates and the pass that runs them behind a boundary (ADR-080): which paths a session touched, which have
// been answered for their content, the lock one pass holds, and the ledger a pass writes. Moved out of lifecycle.mjs
// unchanged (BACKLOG section 375, stage B3). A timeout, an UNRUN or an UNPROVEN is not an answer, so the next boundary asks again.
import { spawn, spawnSync } from 'node:child_process'
import { GIT_LISTING_BUFFER } from './decision-corpus.mjs'
import path from 'node:path'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { ARTIFACT_OUTPUT_LIMIT } from './run-shell-hook.mjs'
import { appendEvent, contentId, nearestExistingDirectory, readEvents, stateDir } from './event-log.mjs'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import * as leaseModule from './lease.mjs'
import { PLUGIN_ROOT } from './plugin-root.mjs'
import { gitLines, gitRepositoryRoot, sessionBaseline, statusPaths, underTempRoot } from './tree-facts.mjs'
import { queueAction } from './hook-queue.mjs'

// Rule A `artifact-invalid` (ADR-060): the artifact gates over everything this
// session changed — committed since its first HEAD, uncommitted, and written by
// a tool — minus every path a gate has already answered for THIS content. It has
// no check gate: a malformed record is malformed whether or not the project
// named a test command. Since ADR-080 it runs behind the boundary, in one pass
// per session that writes its own ledger; see `startArtifactPass`.

const UNRESOLVED_DELETION_MUTATION = '<Unresolved Bash deletion>'

// Per artifact, at the commit and completion boundaries. The per-edit boundary
// gets the runner's own budget from hooks.json; this one used to be a flat 10s
// that no setting could change, because the value was written into the child's
// environment AFTER process.env was spread. Reported 2026-08-25: a clean 25-ADR
// corpus timed out, every commit blocked, and QUALITY_HARNESS_SHELL_TIMEOUT_MS
// did nothing — the gate's cost grows with the corpus it reads, so the budget has
// to be raisable by whoever owns the corpus.
const ARTIFACT_GATE_TIMEOUT_MS = 30_000

export const ARTIFACT_GATE_KILL_MARGIN_MS = 5_000

// An unresolved deletion records that something was removed, not what. The
// repository already knows: ask Git which tracked paths are now missing instead
// of holding an unanswerable question against every later commit in the session.
// Returns null when Git cannot answer, which keeps the gate closed.
function deletedTrackedPaths(cwd) {
  const root = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
  if (root.status !== 0) return null
  const deleted = spawnSync('git', ['-C', cwd, '-c', 'core.quotePath=false', 'diff', '--no-renames', '--name-only', '--diff-filter=D', 'HEAD'],
    { encoding: 'utf8', timeout: 10_000, maxBuffer: GIT_LISTING_BUFFER, windowsHide: true })
  if (deleted.status !== 0) return null
  const top = root.stdout.trim()
  return deleted.stdout.split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(relative => path.join(top, relative))
}

// Reads the operator's budget under the runner's own range. Above the 110s
// ceiling it CLAMPS to the ceiling — an operator who asked for more wanted more,
// not the default back; garbage or a sub-100ms value falls back to the default.
export function artifactGateTimeoutMs(env = process.env) {
  const configured = Number(env.QUALITY_HARNESS_SHELL_TIMEOUT_MS)
  if (!Number.isSafeInteger(configured) || configured < 100) return ARTIFACT_GATE_TIMEOUT_MS
  return Math.min(configured, 110_000)
}

// windowMs bounds the WHOLE pass, not one artifact. The hook this runs inside
// has its own deadline (hooks.json: 60s at PreToolUse, 120s at completion), and
// a hook that dies on that deadline blocks nothing — so letting per-artifact
// budgets add up past the window would turn the gate fail-open exactly when the
// corpus is big enough to matter. Running out of window is itself a blocking
// failure.
// True when the artifact gate ran out of its budget rather than reaching a verdict.
//
// The same budget runs out two ways. Normally run-shell-hook.mjs outlives its
// child and reports `timed out after Nms` itself; but the spawn in
// runArtifactGates carries a kill margin, and on a slow host that margin expires
// first, leaving only the outer ETIMEDOUT. Measured 2026-08-25 on windows-latest,
// where the finding read `spawnSync … node.exe ETIMEDOUT` and named neither the
// budget nor the setting that raises it — a wall with no way over it.
//
// Separated from runArtifactGates so both arms are testable anywhere: the outer
// arm is unreachable on a host fast enough to let the runner win the race.
export function budgetExhausted(detail, error) {
  return /timed out after \d+ms/.test(detail) || error?.code === 'ETIMEDOUT'
}

export function runArtifactGates(paths, cwd = process.cwd(), windowMs = 100_000, { bases = [], gated = null, saidBy = null, stoppedBy = null, ledgerDirectory: sharedLedger = null } = {}) {
  const hook = path.join(PLUGIN_ROOT, 'scripts', 'facts-gate-dispatch.sh')
  if (!existsSync(hook)) return null
  const runner = path.join(PLUGIN_ROOT, 'scripts', 'run-shell-hook.mjs')
  if (!existsSync(runner)) return 'Artifact validation failed:\nThe cross-platform shell-hook runner is missing.'

  const deadline = Date.now() + windowMs
  const failures = []
  const targets = []
  for (const filePath of [...new Set(paths)]) {
    if (filePath === UNRESOLVED_DELETION_MUTATION) {
      const deleted = deletedTrackedPaths(cwd)
      if (deleted === null) {
        failures.push('A Bash deletion used an unresolved path and Git cannot say what is missing here; the facts-first gate cannot determine whether an ADR archive was removed. Use an explicit path.')
        continue
      }
      targets.push(...deleted)
      continue
    }
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) continue
    // A project's records are never under the OS temp root. Scratch corpora —
    // a fixture built to try something, a copy pulled out of history to read —
    // were pulling the full record gates, so building a throwaway ADR to test
    // against reported "expected exactly one owning ADR, found 0" about a file
    // nobody was shipping. Observed 2026-08-26 while building this release, on
    // its own scratch fixture. mutatesOnlyTempPaths already exempts scratch
    // writes it can PROVE; this catches the ones it could not, one layer later,
    // where the path is resolved and the question is only where it lives.
    if (underTempRoot(filePath) && !underTempRoot(cwd)) continue
    targets.push(filePath)
  }
  const uniqueTargets = [...new Set(targets)]
  // The dispatcher owns ADR resolution. Share only completed, identical ADR
  // commands within this pass; the next pass always starts with no ledger. A
  // pass that gates in chunks (ADR-080) shares its own, and removes it itself.
  let ledgerDirectory = sharedLedger
  if (!ledgerDirectory && uniqueTargets.length > 1) {
    try { ledgerDirectory = mkdtempSync(path.join(os.tmpdir(), 'quality-harness-gates-')) } catch {}
  }
  const ledger = ledgerDirectory ? path.join(ledgerDirectory, 'adr').split(path.sep).join('/') : ''
  try {
    if (uniqueTargets.length > 0) {
      const remaining = deadline - Date.now()
      if (remaining < 1_000) {
        failures.push(`The boundary's ${Math.round(windowMs / 1000)}s window was exhausted before ${uniqueTargets[0]} was gated. `
          + 'This is a budget, not a finding: gate fewer artifacts per boundary, or commit in smaller sets.\n'
          + 'UNRUN — all remaining artifacts were not checked:\n' + uniqueTargets.join('\n'))
      } else {
        const timeoutMs = artifactGateTimeoutMs()
        const run = spawnSync(process.execPath, [runner, 'facts-gate-dispatch.sh', '--batch'], {
          // `cwd` travels in the batch, so a pass running from the temp directory still
          // judges each path where the session runs (run-shell-hook's `hookCwd`).
          input: JSON.stringify({ paths: uniqueTargets, deadline, windowMs, timeoutMs, cwd, ...(saidBy ? { said: true } : {}) }),
          encoding: 'utf8', windowsHide: true,
          // Each shell is capped separately; leave room for its diagnostic framing too.
          maxBuffer: uniqueTargets.length * ARTIFACT_OUTPUT_LIMIT * 2,
          env: { ...process.env, QUALITY_HARNESS_ADR_LEDGER: ledger,
            // The revisions a deleted path is looked up in, nearest first
            // (ADR-060 T6). Unset means HEAD, in both lookups.
            ...(bases.length ? { QUALITY_HARNESS_HISTORY_BASES: bases.join(' ') } : {}) },
          timeout: remaining + ARTIFACT_GATE_KILL_MARGIN_MS,
        })
        // Which paths the pass actually answered for. The findings are on
        // stderr; this is the per-path record rule A keeps.
        if (gated) {
          for (const line of (run.stdout || '').split('\n')) {
            if (!line.trim()) continue
            let result
            try { result = JSON.parse(line) } catch { continue }
            if (typeof result?.gated === 'string') gated.set(result.gated, result.complete === true)
            if (saidBy && typeof result?.gated === 'string' && typeof result.said === 'string' && result.said.trim()) saidBy.set(result.gated, result.said)
            if (stoppedBy && typeof result?.stopped === 'string') stoppedBy.stopped = result.stopped
          }
        }
        // Advisory findings arrive on stderr with exit zero; status alone loses them.
        const said = (run.stderr || '').trim()
        if (run.status !== 0 || said) {
          let detail = said || run.error?.message || `artifact gate exited ${run.status}`
          if (run.status !== 0) {
            detail += '\nThe runner did not complete; these artifacts may be unchecked:\n'
              + uniqueTargets.join('\n')
          }
          failures.push(run.status !== 0 && budgetExhausted(detail, run.error)
            ? `${detail}\nThe runner exhausted its time budget. This is a budget, not a finding `
              + `about the listed artifacts; the whole pass is capped at ${Math.round(windowMs / 1000)}s.`
            : detail)
        }
      }
    }
  } finally {
    if (ledgerDirectory && ledgerDirectory !== sharedLedger) {
      try { rmSync(ledgerDirectory, { recursive: true, force: true, maxRetries: 3 }) }
      catch (error) { console.error(`Could not remove the temporary artifact-gate ledger: ${error?.code ?? error}`) }
    }
  }
  return failures.length ? `Artifact validation failed:\n${failures.join('\n')}` : null
}

/**
 * Whether a COMPLETE verdict already covers this file's current content.
 *
 * ⚠ AN UNKNOWN IDENTITY MATCHES NOTHING, INCLUDING ANOTHER UNKNOWN. `contentId`
 * documents exactly this — "Null means unreadable, which a reader must treat as
 * unknown and not as 'the same as last time'" — and the reader contradicted its
 * own contract with `answered.get(file) === contentId(file)`, where `null ===
 * null` is true. A path whose bytes could not be read when it was gated and
 * cannot be read now was therefore suppressed for ever, on the strength of two
 * non-answers agreeing. Found by a different-lineage review of this branch,
 * 2026-09-18.
 *
 * Re-gating is the safe direction: it costs a repeated check, while suppressing
 * costs a file nobody ever looks at again (ADR-005).
 */
export function alreadyAnswered(answered, file, identity) {
  if (!answered.has(file)) return false
  const recorded = answered.get(file)
  if (identity === null || identity === undefined) return false
  // A set holds every blob this path was gated COMPLETE on: content that returns to one
  // of them is that answer again. A string is the last one only (the older shape).
  if (recorded instanceof Set) return recorded.has(identity)
  if (recorded === null || recorded === undefined) return false
  return recorded === identity
}

/**
 * Every blob each path was gated COMPLETE on, from the session log. An incomplete
 * verdict is not an answer, so it is never in here (ADR-005). A set rather than the
 * last blob: content that returns to one already gated (A, then B, then A again) is
 * that answer again, and re-gating it was 24 of 1,444 gates in a week.
 */
export function answeredBlobs(log) {
  const answered = new Map()
  for (const entry of log) {
    if (entry.event === 'artifact.gated' && typeof entry.path === 'string' && entry.complete === true) {
      const blobs = answered.get(entry.path) ?? new Set()
      blobs.add(entry.blob ?? null)
      answered.set(entry.path, blobs)
    }
  }
  return answered
}

export async function artifactRule(input, recorded) {
  if (typeof input.session_id !== 'string' || !input.session_id) return
  const cwd = input.cwd ?? process.cwd()
  // What a pass has answered since the last hook is in its ledger; the session
  // log learns it here, before the targets are read from it.
  importPassVerdicts(cwd, input.session_id)
  const log = readEvents(cwd, input.session_id)
  const baseline = sessionBaseline(log)?.observation
  const first = baseline?.head
  const directory = nearestExistingDirectory(path.resolve(cwd))
  const root = directory ? gitRepositoryRoot(directory) : null
  const paths = new Set()
  if (root && typeof first === 'string') {
    for (const relative of gitLines(root, ['diff', '--name-only', '-z', first], { nul: true })) paths.add(path.join(root, relative))
  } else if (root && baseline?.ok === true && first === null) {
    // The session began with an unborn HEAD, so every tracked path at HEAD arrived
    // during it and every one of them is a candidate. `diff` has no base to take.
    for (const relative of gitLines(root, ['ls-tree', '-r', '--name-only', '-z', 'HEAD'], { nul: true })) {
      paths.add(path.join(root, relative))
    }
  }
  if (root) for (const relative of statusPaths(root)) paths.add(path.join(root, relative))
  for (const entry of log) {
    if (entry.event === 'file.written' && entry.observable === true && typeof entry.path === 'string') {
      paths.add(entry.path)
    }
  }
  // A COMPLETE result about the same content is the only reason to leave a path
  // out: a timeout, an UNRUN or an UNPROVEN is not an answer, so the next
  // boundary asks again (ADR-005).
  const answered = answeredBlobs(log)
  // ⚠ IDENTITIES BEFORE THE GATES RUN, for the same reason the per-edit gate takes
  // its identity first: a file edited WHILE the batch is gating it would otherwise
  // be filed under the NEW content carrying the OLD content's verdict, and rule A
  // would suppress the one edit nothing had looked at. Taken here, before the pass
  // starts, and carried to it in the request, so the filter and the record cannot
  // disagree about what was gated. Found by a re-review, 2026-09-18 — the per-edit
  // fix had left this sibling untouched (CLAUDE.md §5).
  const identities = new Map([...paths].map(file => [file, contentId(file)]))
  // A path the gates never answer for — not absolute, or a scratch file outside a
  // scratch session (`runArtifactGates`) — would start a pass at every boundary.
  const targets = [...paths].filter(file => path.isAbsolute(file) && !(underTempRoot(file) && !underTempRoot(cwd))
    && !alreadyAnswered(answered, file, identities.get(file) ?? null))
  if (!targets.length) return
  // Nearest first: the session's own starting point, then HEAD. A record deleted
  // and committed during the session is in neither the working tree nor HEAD.
  const head = recorded?.observation?.ok === true ? recorded.observation.head : null
  const bases = [...new Set([first, head, 'HEAD'].filter(base => typeof base === 'string' && base))]
  await startArtifactPass({ ...input, cwd }, targets, identities, bases)
}

// ---- ADR-080: the artifact pass runs behind the boundary that asked for it.
// The pass writes ONE file, its own ledger, and never the session log: a torn
// line there stops the publish refusal (`publishVerdict`, ADR-061), so a second
// writer that a kill could tear is not added. Hooks import from the ledger.
const PASS_BUDGET_MS = 300_000

// A lock lives until its pass's budget ends, plus the margin its last batch may
// overrun by (`runArtifactGates`'s kill margin), plus a second.
const PASS_GRACE_MS = ARTIFACT_GATE_KILL_MARGIN_MS + 1_000

// Paths per synchronous batch: a pass stopped part way loses at most this many
// verdicts, and its ADR ledger is shared across batches.
const PASS_CHUNK = 8

function passBudgetMs(env = process.env) {
  const configured = Number(env.QUALITY_HARNESS_ARTIFACT_PASS_BUDGET_MS)
  if (Number.isFinite(configured) && configured > 0) return configured
  // The older setting still names a budget, and 0 still means "none": the pass
  // then says what it did not gate. Anything else is ignored, never honoured.
  const legacy = Number(env.QUALITY_HARNESS_ARTIFACT_BUDGET_MS)
  return Number.isFinite(legacy) && legacy >= 0 ? legacy : PASS_BUDGET_MS
}

function passFiles(cwd, session) {
  const directory = path.join(stateDir(cwd), 'passes')
  const name = String(session).replace(/[^A-Za-z0-9._-]/g, '_')
  return { directory, ledger: path.join(directory, `${name}.jsonl`), lock: path.join(directory, `${name}.lock`) }
}

/**
 * claimPassLock creates a session's pass lock exclusively. It answers
 * `{ token, deadline }` when this call holds it, `null` when a pass holds it, and
 * `{ error }` when it cannot be made. A lock past its deadline is reclaimed
 * whatever its pid says: a pid can be reused, and a pass's gates can outlive it
 * (Codex review of ADR-080). Only ONE claimant may succeed a given stale lock: the
 * successor is a file named for the stale lock's token and created exclusively,
 * and it replaces the lock only while the lock is still that stale one. The one
 * window left is an owner releasing at the very instant of its deadline, which
 * `releasePassLock` refuses to do once the deadline has passed.
 * `afterStaleRead` is the seam a test uses to run a second claimant in between.
 */
export function claimPassLock(lock, budgetMs, now = Date.now(), { afterStaleRead = null } = {}) {
  const token = randomUUID()
  const deadline = now + budgetMs + PASS_GRACE_MS
  const body = JSON.stringify({ token, pid: process.pid, deadline })
  try {
    writeFileSync(lock, body, { flag: 'wx' })
    return { token, deadline }
  } catch (error) {
    if (error?.code !== 'EEXIST') return { error: error?.code ?? String(error) }
  }
  let held = null
  try { held = JSON.parse(readFileSync(lock, 'utf8')) } catch { /* torn or gone: judged by its age */ }
  let heldDeadline = Number(held?.deadline)
  if (!Number.isFinite(heldDeadline)) {
    try { heldDeadline = statSync(lock).mtimeMs + budgetMs + PASS_GRACE_MS } catch { return null }
  }
  if (now <= heldDeadline) return null
  afterStaleRead?.()
  const name = typeof held?.token === 'string' ? held.token.replace(/[^A-Za-z0-9-]/g, '') : `torn-${Math.round(heldDeadline)}`
  const successor = `${lock}.next-${name}`
  try {
    writeFileSync(successor, body, { flag: 'wx' })
  } catch {
    // A successor whose claimant died before its rename would block every later
    // one, so an old one is cleared; this call still takes nothing.
    try { if (Date.now() - statSync(successor).mtimeMs > PASS_GRACE_MS) rmSync(successor, { force: true }) } catch { /* gone */ }
    return null
  }
  let current = null
  try { current = JSON.parse(readFileSync(lock, 'utf8')) } catch { /* torn or gone */ }
  // Another claimant already succeeded this stale lock: its successor was renamed
  // into place, so ours could be created, and the lock is no longer the stale one.
  if (held ? current?.token !== held.token : current !== null) {
    rmSync(successor, { force: true })
    return null
  }
  try {
    renameSync(successor, lock)
  } catch {
    rmSync(successor, { force: true })
    return null
  }
  return { token, deadline }
}

/**
 * releasePassLock deletes the lock only while it is this pass's and its deadline
 * has not passed: past it, the lock may already be another pass's to reclaim.
 */
export function releasePassLock(lock, token, now = Date.now()) {
  try {
    const held = JSON.parse(readFileSync(lock, 'utf8'))
    if (held.token === token && now <= Number(held.deadline)) rmSync(lock, { force: true })
  } catch { /* gone, or another pass's */ }
}

/**
 * passKey names what a ledger line says, for saying it once: the path and the
 * content it judged, whether the verdict was complete, and the words. An
 * incomplete run's notice (a timeout) therefore never takes the key a later,
 * complete verdict's finding about the same bytes needs (Codex review of ADR-080).
 */
function passKey(entry, words) {
  const said = createHash('sha256').update(words).digest('hex').slice(0, 16)
  return entry.event === 'pass.gated'
    ? `${entry.path}:${entry.blob ?? `unknown-${entry.pass}`}:${entry.complete === true ? 'complete' : 'incomplete'}:${said}`
    : `pass:${said}`
}

/**
 * importPassVerdicts copies the pass ledger's new verdicts into the session log
 * as `artifact.gated`, naming the pass, and queues each finding as rule A once per
 * path and content. A ledger line that cannot be read is not imported, so its
 * path has no verdict and is gated again (ADR-005). Two hooks at once may both
 * say a finding; that is every advisory's limit, and this one is advice.
 */
// A hook may import twice — at its start, and again at a boundary or after an
// in-process pass — before `deliver` records anything, so the keys this process
// has already queued are remembered here.
const passFindingsQueued = new Set()

export function importPassVerdicts(cwd, session) {
  const { ledger, lock } = passFiles(cwd, session)
  let text = ''
  try { text = readFileSync(ledger, 'utf8') } catch { /* no pass has written yet */ }
  const log = readEvents(cwd, session)
  const started = log.filter(entry => entry.event === 'artifact.pass' && typeof entry.token === 'string')
  if (!text && !started.length) return
  const imported = new Set(log.filter(entry => entry.event === 'artifact.gated' && typeof entry.pass === 'string')
    .map(entry => `${entry.pass}\0${entry.path}`))
  const said = new Set(log.filter(entry => entry.event === 'action.emitted' && entry.rule === 'A').map(entry => entry.key))
  const findings = []
  const ended = new Set()
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let entry
    try { entry = JSON.parse(line) } catch { continue }
    if (typeof entry?.pass !== 'string') continue
    if (entry.event === 'pass.ended') ended.add(entry.pass)
    const words = typeof entry.findings === 'string' ? entry.findings.trim() : ''
    if (entry.event === 'pass.gated' && typeof entry.path === 'string') {
      const id = `${entry.pass}\0${entry.path}`
      if (!imported.has(id)) {
        imported.add(id)
        appendEvent(cwd, session, {
          event: 'artifact.gated', path: entry.path, blob: entry.blob ?? null, complete: entry.complete === true, pass: entry.pass,
        })
      }
      if (words) findings.push({ key: passKey(entry, words), text: words })
    } else if (entry.event === 'pass.finding' && words) {
      findings.push({ key: passKey(entry, words), text: words })
    }
  }
  // A pass this session started that left no end — killed, or unable to write its
  // ledger — is said, never silence (ADR-005, Codex review of ADR-080). A pass still
  // holding its lock before its deadline is running, and says nothing yet.
  let holder = null
  try { holder = JSON.parse(readFileSync(lock, 'utf8')) } catch { /* none */ }
  for (const pass of started) {
    if (ended.has(pass.token)) continue
    if (holder?.token === pass.token && Date.now() <= Number(holder.deadline)) continue
    findings.push({
      key: `pass-lost:${pass.token}`,
      text: `UNRUN — the artifact pass started at ${pass.at} left no end in its ledger: it was stopped, or could not write there. What it did not gate is gated again at the next boundary.`,
    })
  }
  let first = true
  for (const { key, text: words } of findings) {
    if (said.has(key) || passFindingsQueued.has(key)) continue
    said.add(key)
    passFindingsQueued.add(key)
    queueAction({ rule: 'A', key, text: first ? `Artifact validation failed:\n${words}` : words })
    first = false
  }
}

/**
 * startArtifactPass claims the session's lock and starts the pass detached, then
 * returns: no boundary waits on the gates (ADR-080). A held lock starts nothing.
 * A pass that cannot be started releases the lock and is said, UNRUN — never
 * silence (ADR-005). `QUALITY_HARNESS_ARTIFACT_PASS_RUNNER` names another runner,
 * and `inline` runs the same pass in this process and waits for it: the seam the
 * tests that read a verdict right after a boundary select.
 */
async function startArtifactPass(input, targets, identities, bases) {
  const unrun = why => {
    const key = `unrun:${why}`
    if (readEvents(input.cwd, input.session_id).some(entry => entry.event === 'action.emitted' && entry.rule === 'A' && entry.key === key)) return
    queueAction({
      rule: 'A', key,
      text: `Artifact validation UNRUN: the pass over ${targets.length} changed artifact(s) could not be started (${why}). Nothing was checked; the next boundary tries again.`,
    })
  }
  const { directory, ledger, lock } = passFiles(input.cwd, input.session_id)
  try { mkdirSync(directory, { recursive: true }) } catch (error) { return unrun(`its directory could not be made: ${error?.code ?? error}`) }
  const budgetMs = passBudgetMs()
  const claim = claimPassLock(lock, budgetMs)
  if (claim === null) return
  if (claim.error) return unrun(`its lock could not be made: ${claim.error}`)
  const request = path.join(directory, `${path.basename(lock, '.lock')}.${claim.token}.request.json`)
  const release = () => {
    releasePassLock(lock, claim.token)
    rmSync(request, { force: true })
  }
  // A request left by a pass that died before reading it would stay for ever.
  try {
    for (const name of readdirSync(directory)) {
      if (!name.endsWith('.request.json')) continue
      const file = path.join(directory, name)
      if (Date.now() - statSync(file).mtimeMs > PASS_BUDGET_MS * 2) rmSync(file, { force: true })
    }
  } catch { /* advisory housekeeping */ }
  try {
    writeFileSync(request, JSON.stringify({
      session: input.session_id, cwd: input.cwd, ledger, lock, token: claim.token, budgetMs, bases,
      // The pass stops by the lock's deadline less its grace, so the lock cannot
      // lapse while the pass is still gating.
      deadline: claim.deadline - PASS_GRACE_MS,
      targets: targets.map(file => ({ path: file, blob: identities.get(file) ?? null })),
    }))
  } catch (error) {
    release()
    return unrun(`its request could not be written: ${error?.code ?? error}`)
  }
  const setting = process.env.QUALITY_HARNESS_ARTIFACT_PASS_RUNNER
  // Written by the hook, which already writes this log, so a pass that leaves no
  // end in its own ledger is still known to have been started.
  const record = () => appendEvent(input.cwd, input.session_id, { event: 'artifact.pass', token: claim.token, targets: targets.length })
  if (setting === 'inline') {
    record()
    await runArtifactPass(request)
    importPassVerdicts(input.cwd, input.session_id)
    return
  }
  const runner = setting || fileURLToPath(new URL('./lifecycle.mjs', import.meta.url))
  if (!existsSync(runner)) {
    release()
    return unrun(`its runner ${path.basename(runner)} does not exist`)
  }
  let child
  try {
    // Detached, with no stdio of the hook's, so the host's wait on this hook
    // ends when the hook does; windowsHide because a detached child has no
    // console, and every child it starts would open one (CLAUDE.md §7).
    // untimed-spawn: detached on purpose — the pass stops itself at its budget, and its lock lapses at the deadline
    child = spawn(process.execPath, [runner, '--artifact-pass', request], {
      // The temp directory, not the session's: on Windows a live process's working
      // directory cannot be deleted, so a pass must not pin the user's checkout.
      cwd: os.tmpdir(), detached: true, stdio: 'ignore', windowsHide: true,
    })
    // Before any return: a spawn that fails emits `error` later, and unheard it
    // is an uncaught exception in the hook (Codex review of ADR-080).
    child.on('error', () => {})
  } catch (error) {
    release()
    return unrun(error?.message ?? String(error))
  }
  if (!child.pid) {
    release()
    return unrun('the process did not start')
  }
  record()
  child.unref()
}

/**
 * runArtifactPass is the pass itself (`lifecycle.mjs --artifact-pass <request>`).
 * It gates the request's targets a chunk at a time and appends each verdict, with
 * what its gate said, to the ledger as ONE line, so no kill parts a verdict from
 * its finding (Codex review of ADR-080). Paths its budget did not reach are said
 * UNRUN and get no verdict, so the next pass takes them. It releases its own lock
 * and no other.
 */
export async function runArtifactPass(requestFile) {
  let request
  try { request = JSON.parse(readFileSync(requestFile, 'utf8')) } catch { return 2 }
  rmSync(requestFile, { force: true })
  const { ledger, lock, token, cwd } = request ?? {}
  if (typeof ledger !== 'string' || typeof lock !== 'string' || typeof token !== 'string' || typeof cwd !== 'string') return 2
  const write = entry => {
    try { appendFileSync(ledger, `${JSON.stringify({ at: new Date().toISOString(), pass: token, ...entry })}\n`) } catch { /* unwritten is ungated, and a pass with no end is said by the next hook */ }
  }
  const targets = (Array.isArray(request.targets) ? request.targets : []).filter(target => typeof target?.path === 'string')
  const blobs = new Map(targets.map(target => [target.path, target.blob ?? null]))
  const budgetMs = Number.isFinite(Number(request.budgetMs)) && Number(request.budgetMs) >= 0 ? Number(request.budgetMs) : PASS_BUDGET_MS
  const deadline = Number.isFinite(Number(request.deadline)) ? Number(request.deadline) : Date.now() + budgetMs
  write({ event: 'pass.started', pid: process.pid, targets: targets.map(target => target.path) })
  // ADR-077: a pass is a heavy run, so it holds the machine lease while it gates.
  // A lease that cannot be taken changes nothing about the pass.
  let held = null
  try {
    const taken = leaseModule.take(leaseModule.leaseDir(process.env), { command: 'quality-harness artifact pass', root: cwd, state: 'running' })
    held = taken.error ? null : taken
  } catch { /* advice about the machine, never a condition of the pass */ }
  let ledgerDirectory = null
  try { ledgerDirectory = mkdtempSync(path.join(os.tmpdir(), 'quality-harness-gates-')) } catch { /* each batch makes its own */ }
  let reason
  try {
    reason = passTargets({
      paths: targets.map(target => target.path), deadline, budgetMs, write,
      gate: (chunk, remaining, gated, said, stopped) => runArtifactGates(chunk, cwd, remaining,
        { bases: Array.isArray(request.bases) ? request.bases : [], gated, saidBy: said, stoppedBy: stopped, ledgerDirectory }),
      verdict: file => {
        const before = blobs.get(file) ?? null
        return { blob: before, steady: before !== null && before === contentId(file) }
      },
    })
  } catch (error) {
    reason = `failed: ${error?.message ?? error}`
    write({ event: 'pass.finding', findings: `UNRUN — the artifact pass failed (${error?.message ?? error}); what it did not gate is gated again at the next boundary.` })
  } finally {
    if (ledgerDirectory) {
      try { rmSync(ledgerDirectory, { recursive: true, force: true, maxRetries: 3 }) } catch { /* temp */ }
    }
    if (held) {
      try { leaseModule.release(held) } catch { /* temp */ }
    }
  }
  write({ event: 'pass.ended', reason })
  releasePassLock(lock, token)
  return 0
}

/**
 * passTargets gates `paths` a chunk at a time through `gate` and writes each
 * verdict with its findings as one ledger line. It stops at the deadline, and when
 * a batch says it stopped on cleanup nobody confirmed — the next chunk would start
 * gates beside children that may still run (Codex review of ADR-080). Either way
 * the paths it did not reach are said UNRUN and get no verdict. Returns why it
 * ended. `gate` is `runArtifactGates` in the pass and a stand-in in a test.
 */
export function passTargets({ paths, deadline, budgetMs, write, gate, verdict }) {
  for (let index = 0; index < paths.length; index += PASS_CHUNK) {
    const remaining = deadline - Date.now()
    if (remaining < 1_000) {
      write({
        event: 'pass.finding',
        findings: `UNRUN — the pass's ${Math.round(budgetMs / 1000)}s budget ended before these artifacts were gated; the next boundary takes them:\n${paths.slice(index).join('\n')}`,
      })
      return 'budget'
    }
    const chunk = paths.slice(index, index + PASS_CHUNK)
    const gated = new Map()
    const said = new Map()
    const stopped = {}
    const failure = gate(chunk, remaining, gated, said, stopped)
    for (const file of chunk) {
      if (!gated.has(file)) continue
      const { blob, steady } = verdict(file)
      // Bytes that moved under the gate were not what it judged (ADR-005).
      write({ event: 'pass.gated', path: file, blob, complete: gated.get(file) === true && steady, findings: said.get(file) ?? null })
    }
    // What the batch said about no one path — a window that ran out, a runner
    // that did not complete — is still said, once.
    let rest = failure ? failure.replace(/^Artifact validation failed:\n/, '') : ''
    for (const words of said.values()) rest = rest.split(words.trim()).join('')
    if (rest.trim()) write({ event: 'pass.finding', findings: rest.trim() })
    if (stopped.stopped) {
      const left = paths.slice(index + PASS_CHUNK)
      if (left.length) {
        write({
          event: 'pass.finding',
          findings: `UNRUN — the pass stopped (${stopped.stopped}) before these artifacts were gated; the next boundary takes them:\n${left.join('\n')}`,
        })
      }
      return `stopped: ${stopped.stopped}`
    }
  }
  return 'done'
}
