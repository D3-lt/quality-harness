#!/usr/bin/env node
// release-evidence.mjs — does the CI run for this sha actually clear it for release?
//
// BACKLOG §104, and the entry exists because this check was missing when it was
// needed. On 2026-09-02 a release run was cancelled mid-campaign by the author's
// own push (`.github/workflows/selftest.yml` sets `cancel-in-progress: true`),
// six of nine jobs were green, the three that died were the mutation shards —
// and `gh run watch --exit-status` exited **0**. A tag cut there would have
// carried no mutation evidence at all while looking fully verified.
//
// The rule this encodes is CLAUDE.md §3's: a run that could not finish is "I
// could not look", never "nothing was wrong". `cancelled` is not `failure` and
// it is certainly not `success`, so the release question has to be asked as
// *did every job conclude success*, which is what `evaluateRun` below asks.
//
// Usage:
//   node scripts/release-evidence.mjs [<sha>]     # defaults to HEAD
//
// Exit codes are distinct on purpose, so a caller can tell the three apart:
//   0  every job concluded success — safe to release this sha
//   1  a job did not conclude success (failed, cancelled, timed out, skipped)
//   2  could not look (no gh, no run for this sha, unreadable answer, the run
//      was not a full campaign — see `cached` below — or the readers changed since
//      the last tag and nobody outside has run them, see `outsideRun`)
//   3  the run is not finished yet
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isMainModule } from '../plugin/scripts/main-module.mjs'
import { READER_PATHS } from '../plugin/scripts/reader-paths.mjs'

/**
 * Judge a run's release-worthiness from the `gh run view --json` object.
 *
 * Pure and total: every argument shape returns a verdict rather than throwing,
 * because the caller has to distinguish "could not look" from "looked and found
 * a problem" and an exception collapses the two.
 *
 * The four verdicts map onto the exit codes above. `unreadable` covers a null,
 * a non-object, and a run carrying no jobs array — the last is the one that
 * matters, since an empty job list would otherwise satisfy "every job
 * succeeded" vacuously, which is this repository's signature defect.
 */
export function evaluateRun(run) {
  if (!run || typeof run !== 'object' || !Array.isArray(run.jobs)) {
    return { verdict: 'unreadable', reason: 'no run object, or it carries no jobs array', jobs: [] }
  }
  // A run with zero jobs is not a clean run. Said explicitly because
  // `[].every(...)` is `true`, and that is exactly how a gate reports clean
  // over a universe it never looked at (CLAUDE.md §3, ADR-005).
  //
  // The two empty cases are NOT the same, and separating them was paid for by
  // running this against a real push: GitHub reports a freshly queued run with
  // an empty jobs array for a few seconds before the jobs materialize. That is
  // "not started yet" — retry and it resolves. A run claiming `completed` with
  // no jobs is something else entirely, and no amount of waiting fixes it.
  if (run.jobs.length === 0) {
    return run.status === 'completed'
      ? { verdict: 'unreadable', reason: 'the run says completed and reports zero jobs', jobs: [] }
      : { verdict: 'incomplete', reason: `the run is ${run.status} and has not listed its jobs yet`, jobs: [] }
  }
  const jobs = run.jobs.map(j => ({
    name: String(j?.name ?? '<unnamed>'),
    status: String(j?.status ?? 'unknown'),
    conclusion: j?.conclusion ? String(j.conclusion) : null,
  }))
  const unfinished = jobs.filter(j => j.status !== 'completed')
  if (run.status !== 'completed' || unfinished.length) {
    return { verdict: 'incomplete', reason: `${unfinished.length} job(s) still running`, jobs }
  }
  // STRICTLY success. `cancelled`, `skipped`, `timed_out`, `neutral` and
  // `action_required` are each a reason a human should look before tagging, and
  // naming the conclusion is more useful than folding them all into "failed".
  const bad = jobs.filter(j => j.conclusion !== 'success')
  if (bad.length) {
    return {
      verdict: 'failed',
      reason: bad.map(j => `${j.name}: ${j.conclusion ?? 'no conclusion'}`).join(', '),
      jobs,
    }
  }
  // ⚠ A GREEN RUN IS NOT AUTOMATICALLY A RELEASE-GRADE ONE (BACKLOG §142). Since
  // 2026-09-05 only a `workflow_dispatch` run measures the whole catalogue; a
  // push to `main` may reuse a cached RED verdict, which is right for iteration
  // and not what a tag may rest on (ADR-023 rule 1). The event is the only thing
  // that distinguishes them from outside, so it is asked here rather than
  // assumed — a sha whose newest run was a push is "could not look at a full
  // campaign", never "cleared".
  if (run.event === undefined || run.event === null) {
    return {
      verdict: 'unreadable',
      reason: 'the run does not say what raised it, so whether its campaign was full cannot be told '
        + 'from here. That is "could not look", not "cleared" (ADR-005).',
      jobs,
    }
  }
  if (run.event !== 'workflow_dispatch') {
    return {
      verdict: 'cached',
      reason: `the newest run for this sha was raised by \`${run.event}\`, so its mutation campaign `
        + 'may have reused cached verdicts. A release must rest on a full campaign: run '
        + '`gh workflow run selftest.yml --ref main` at this sha, wait for it, and ask again.',
      jobs,
    }
  }
  return { verdict: 'success', reason: `${jobs.length} job(s) concluded success`, jobs }
}

/**
 * Choose which of a sha's runs the release question is about.
 *
 * ⚠ NEWEST IS NOT ENOUGH, AND THE TIE IS THE ORDINARY CASE (BACKLOG §154). The
 * release sequence CLAUDE.md §13 documents is push, then
 * `gh workflow run selftest.yml`, and issuing both from one shell lands two runs
 * at the same sha with a byte-identical `createdAt` — measured 2026-09-06 cutting
 * v2.83.0, both at `2026-09-06T19:11:25Z`. Ordering on time alone then resolves
 * the tie arbitrarily; it resolved to the push run, the gate answered `CACHED`,
 * and the full campaign it was being asked about had already passed. A whole CI
 * cycle, spent on an ambiguity the documented procedure walks into.
 *
 * So the tie is broken on the EVENT, which is the field the verdict already
 * depends on: among the runs sharing the newest instant, a `workflow_dispatch`
 * wins. ONLY among them — a dispatch that is genuinely older than a later push
 * must never be resurrected, because the push is the newer question and its
 * campaign may have reused cached verdicts. That is the hole §142 closed.
 *
 * ⚠ EVERY CANDIDATE MUST BE ORDERABLE, or this refuses. An earlier version fell
 * back to gh's own order when a `createdAt` would not parse, on the reasoning
 * that it was the behaviour before the tie-break existed. That is a flattering
 * answer waiting to happen: gh's first entry could be an OLDER successful
 * dispatch while a newer push exists, and the caller would read SUCCESS where the
 * honest answer is CACHED. Ordering that cannot be established is "could not
 * look" (ADR-005), and the caller already has an exit code for that.
 *
 * Pure and exported so every arm is reachable from a test with no network.
 */
export function selectRun(runs) {
  if (!Array.isArray(runs)) return null
  const candidates = runs.filter(r => r && typeof r === 'object' && r.databaseId)
  if (candidates.length === 0) return null
  const at = r => {
    const t = Date.parse(String(r.createdAt ?? ''))
    return Number.isNaN(t) ? null : t
  }
  // Ordering nothing could establish is not ordering. Refusing here costs the
  // caller exit 2, which is the answer it should get.
  if (candidates.some(r => at(r) === null)) return null
  const newest = Math.max(...candidates.map(at))
  const tied = candidates.filter(r => at(r) === newest)
  return tied.find(r => r.event === 'workflow_dispatch') ?? tied[0]
}

/**
 * The `gh run list` arguments for a sha — exported so the filter has a test.
 *
 * ⚠ THE WORKFLOW FILTER IS THE WHOLE POINT AND IT WAS UNTESTED. `--commit` alone
 * returns every workflow that ran at this sha, and `selectRun` prefers ANY
 * `workflow_dispatch` on a tie — so an unrelated dispatched workflow could beat
 * the selftest push and clear a sha whose campaign was cached. `--limit 1` had
 * the identical exposure before §154 and nobody had named it.
 *
 * It lives here rather than inline because a fix reported from outside gets its
 * regression at a callable boundary (CLAUDE.md §4), and `fetchRun` shells out on
 * the line that uses this — there is no seam inside it. Named by a
 * different-lineage review that observed the filter could be deleted with the
 * focused suite unchanged.
 *
 * `--limit 20` because more than one run per sha is the norm and `--limit 1`
 * would hand the tie straight back to gh's ordering; `event` and `createdAt`
 * because `selectRun` decides on both.
 */
export function runListArgv(fullSha) {
  return [
    'run', 'list', '--commit', fullSha, '--workflow', 'selftest.yml', '--limit', '20',
    '--json', 'databaseId,event,createdAt',
  ]
}

/**
 * The newest run for `sha`, or null when nothing can be read.
 *
 * ⚠ `gh run list --commit` needs the FULL 40-character sha. Given an
 * abbreviated one it returns `[]` — not an error, just an empty list that reads
 * exactly like "this commit has no runs". Measured 2026-09-02 with gh 2.98.0:
 * `--commit 57a1e76` returned `[]` while `--commit <full>` returned the run. So
 * the sha is expanded here rather than trusted, and a caller passing a short sha
 * gets an answer instead of a silent nothing.
 *
 * ⚠ `exec` IS A SEAM, AND THE SHA EXPANSION IS WHY. The `--commit` argument must
 * be the FULL 40 characters or `gh` returns `[]` — not an error, an empty list
 * that reads exactly like "this commit has no runs". That expansion had no test:
 * `runListArgv` was handed an already-full sha, so deleting the `rev-parse` would
 * have left the suite green while short shas silently returned nothing. Named by
 * a different-lineage review, which is also where the outermost-callable-boundary
 * rule points (CLAUDE.md §4).
 */
export function fetchRun(sha, exec = execFileSync) {
  let full = sha
  try {
    full = exec('git', ['rev-parse', sha], { encoding: 'utf8', timeout: 30_000 }).trim()
  } catch {
    return null // Not a sha this checkout knows — "could not look".
  }
  let list
  try {
    list = exec('gh', runListArgv(full), { encoding: 'utf8', timeout: 60_000 })
  } catch {
    return null // gh absent, unauthenticated, or offline — "could not look".
  }
  let id
  try {
    id = selectRun(JSON.parse(list))?.databaseId
  } catch {
    return null
  }
  if (!id) return null
  try {
    return JSON.parse(exec('gh', [
      'run', 'view', String(id), '--json', 'status,conclusion,headSha,jobs,event',
    ], { encoding: 'utf8', timeout: 60_000 }))
  } catch {
    return null
  }
}

/**
 * Has anybody outside this repository run the readers being released? CLAUDE.md
 * §18: every defect that reached an adopter was in what a reader SAID about a
 * corpus we do not own, and the suite cannot read the whole output over a shape
 * it has never seen. The evidence is an attestation in `docs/corpus-reports/`
 * naming the revision the run was at (`at`); it counts only when that revision
 * is after the last tag, reachable from the sha, AND carries every reader change
 * the sha carries — a run at the tag ran the old readers, and a run followed by
 * another reader edit did not run that edit (Codex review of 013149e, P1).
 *
 * Pure: `changed` is the reader files changed since the tag (null when git could
 * not answer), `reports` the parsed attestations, `covers(at)` the ancestry and
 * content question. A diff that could not be taken is could-not-look, never "not
 * required" and never "nobody ran it" (ADR-005) — `kind` tells the two apart.
 */
export function outsideRun(changed, reports, covers) {
  if (!Array.isArray(changed)) {
    return {
      verdict: 'unproven', kind: 'unlisted',
      reason: 'whether a reader changed since the last tag could not be established — git could not name the tag or take the diff',
    }
  }
  if (changed.length === 0) return { verdict: 'not-required', reason: 'no reader changed since the last tag' }
  // `covers` answers true, false, or null — null is "could not check" (a revision
  // this checkout does not have, a git that timed out), and it is not absence: an
  // attestation whose coverage could not be checked must not be reported as
  // nobody having run anything (Codex review of 829b3a9, P2).
  const checked = (reports ?? []).filter(r => typeof r?.at === 'string').map(r => ({ r, c: covers(r.at) }))
  const attested = checked.filter(v => v.c === true).map(v => v.r)
  if (attested.length === 0) {
    const unchecked = checked.filter(v => v.c === null).map(v => v.r)
    if (unchecked.length) {
      return {
        verdict: 'unproven', kind: 'unverified',
        reason: `${changed.length} reader file(s) changed since the last tag; ${unchecked.length} attestation(s) could not be `
          + `checked against this sha (${unchecked.map(r => r.file).join(', ')}: git could not resolve or diff the revision) `
          + '— coverage unknown, not absent',
      }
    }
    return {
      verdict: 'unproven', kind: 'missing',
      reason: `${changed.length} reader file(s) changed since the last tag and docs/corpus-reports/ holds no `
        + 'attestation at a revision that carries every one of those changes — a reader is not shipped until '
        + 'somebody else has run it (CLAUDE.md §18)',
    }
  }
  return {
    verdict: 'attested',
    reason: `outside run attested by ${attested.map(r => `${r.file} at ${String(r.at).slice(0, 7)}`).join(', ')}`,
  }
}

/** Every attestation in `dir`, each carrying its file name; an unparsable one attests nothing. */
export function readAttestations(dir, { readdir = readdirSync, read = readFileSync } = {}) {
  let names
  try { names = readdir(dir).filter(name => name.endsWith('.json')).sort() } catch { return [] }
  const out = []
  for (const name of names) {
    try { out.push({ file: name, ...JSON.parse(read(join(dir, name), 'utf8')) }) } catch { /* attests nothing */ }
  }
  return out
}

// What a "reader" is for the release question, defined in the plugin so the shipped
// probe fingerprints the same list (ADR-064 T1). Re-exported for this file's callers.
export { READER_PATHS }

/**
 * The outside-run question for `sha`, asked of git. The anchor is the newest tag
 * reachable from the sha's PARENT: the sha being released is usually the bump
 * commit, and once it is tagged `describe` on the sha itself would answer with
 * that tag and hide every change it ships. `exec` is the seam.
 */
export function outsideRunEvidence(sha, exec = execFileSync, reportsDir = 'docs/corpus-reports') {
  const git = args => exec('git', args, { encoding: 'utf8', timeout: 30_000 }).trim()
  let tag
  try { tag = git(['describe', '--tags', '--abbrev=0', `${sha}~1`]) } catch { return { ...outsideRun(null, [], () => false), tag: null } }
  let changed
  try {
    changed = git(['diff', '--name-only', `${tag}..${sha}`, '--', ...READER_PATHS]).split('\n').filter(Boolean)
  } catch { return { ...outsideRun(null, [], () => false), tag } }
  const covers = at => {
    // `merge-base --is-ancestor` exits 1 for a definite "no" and otherwise for a
    // revision it cannot resolve; only the first is a false. A diff that fails is
    // a coverage nobody could check, never a mismatch.
    const ancestry = args => {
      try { git(['merge-base', '--is-ancestor', ...args]); return true } catch (error) { return error?.status === 1 ? false : null }
    }
    // A run AT the tag needs no identity check: the content diff below is the
    // whole reader diff in that case, and non-empty whenever a run is required.
    // An identity guard sat here until its mutant went GREEN for exactly that
    // reason (2026-09-23) — the diff had made it unobservable.
    const afterTag = ancestry([tag, at])
    if (afterTag !== true) return afterTag
    const beforeSha = ancestry([at, sha])
    if (beforeSha !== true) return beforeSha
    // And the run must have seen the readers being released: a reader edited
    // after the run is a reader nobody outside has run.
    try { return git(['diff', '--name-only', `${at}..${sha}`, '--', ...READER_PATHS]) === '' } catch { return null }
  }
  return { ...outsideRun(changed, readAttestations(reportsDir), covers), tag }
}

// `cached` shares exit 2 with `unreadable` on purpose: both mean "I could not
// look at a full campaign for this sha", which is the one thing a release needs.
const EXIT = { success: 0, failed: 1, unreadable: 2, incomplete: 3, cached: 2, unproven: 2 }


// An option is not a sha, and until 2026-09-03 nothing here said so: `argv[0]`
// went straight into `git rev-parse`, where `--help` SUCCEEDS and returns the git
// manual. That 55KB of roff was then URL-encoded into a `head_sha=` query and the
// API answered `HTTP 414: Request-URL too long`, which reads as a network problem
// rather than as "you asked for help". A reader looking for usage got a wall of
// another tool's documentation and a transport error.
//
// Exported so a test can drive it without the network, which is the only way the
// dash cases are reachable — `fetchRun` shells out on the line after.
export function classifyArgument(argument) {
  if (argument === undefined) return { kind: 'sha', value: undefined }
  if (argument === '--help' || argument === '-h') return { kind: 'help' }
  // Anything else dash-led is an option this script does not have. It is NOT
  // silently treated as a sha: a mistyped flag that resolves to "could not look"
  // is the same wrong answer as one that resolves to a manual page.
  if (argument.startsWith('-')) return { kind: 'unknown', value: argument }
  return { kind: 'sha', value: argument }
}

const USAGE = [
  'Usage: node scripts/release-evidence.mjs [<sha>]   # defaults to HEAD',
  '',
  'Exit codes:',
  '  0  every job concluded success — safe to release this sha',
  '  1  a job did not conclude success (failed, cancelled, timed out, skipped)',
  '  2  could not look (no gh, no run for this sha, unreadable answer, bad usage, or readers',
  '     changed since the last tag with no outside run attested in docs/corpus-reports/ — §18)',
  '  3  the run is not finished yet',
].join('\n')

function main(argv) {
  const argument = classifyArgument(argv[0])
  if (argument.kind === 'help') {
    console.log(USAGE)
    return EXIT.success
  }
  if (argument.kind === 'unknown') {
    console.error(`release-evidence: unknown option ${argument.value}\n\n${USAGE}`)
    return EXIT.unreadable
  }
  let sha = argument.value
  if (!sha) {
    try {
      sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 30_000 }).trim()
    } catch {
      console.error('release-evidence: could not resolve HEAD — pass a sha explicitly')
      return EXIT.unreadable
    }
  }
  const run = fetchRun(sha)
  const result = evaluateRun(run)
  for (const j of result.jobs) {
    console.log(`  ${j.name}: ${j.status} ${j.conclusion ?? '-'}`)
  }
  const head = run?.headSha ? ` (${String(run.headSha).slice(0, 7)})` : ''
  // A green campaign is necessary, not sufficient: the readers it ships must have
  // been run by somebody else since the last tag (CLAUDE.md §18). Asked only once
  // CI has cleared the sha, so a red run is reported as red and nothing else.
  let { verdict, reason } = result
  let outside = null
  if (verdict === 'success') {
    outside = outsideRunEvidence(sha)
    reason = `${reason}; since ${outside.tag ?? 'the last tag'}: ${outside.reason}`
    if (outside.verdict === 'unproven') verdict = 'unproven'
  }
  console.log(`${verdict.toUpperCase()}${head} — ${reason}`)
  if (verdict === 'unproven') {
    // Two different could-not-looks, said apart: nobody ran the readers, or git
    // here could not say whether they changed (Codex review of 013149e, P2).
    console.log(outside?.kind === 'missing'
      ? 'Do NOT tag this sha. CI is green and nobody outside has run the readers it ships — get one run '
        + '(`/quality-harness:corpus-chaos`) at a revision that carries every reader change, file its attestation '
        + 'in docs/corpus-reports/, and ask again.'
      : outside?.kind === 'unverified'
        ? 'Do NOT tag this sha yet. An attestation exists but git here could not check it against this sha — fetch '
          + 'the attested revision (and the tags), then ask again. Coverage unknown is not coverage absent (ADR-005).'
        : 'Do NOT tag this sha. Whether its readers changed since the last tag could not be established from git '
          + 'here — that is could-not-look, not cleared (ADR-005). Fetch the tags, then ask again.')
  } else if (verdict !== 'success') {
    console.log('Do NOT tag this sha. A run that did not finish is "I could not look", '
      + 'not "nothing was wrong" — see BACKLOG §104 and CLAUDE.md §13.')
  }
  return EXIT[verdict]
}

// Importable without side effects, so the test can drive `evaluateRun` on
// fixtures rather than on the network. `tests/package.test.mjs::importing a
// script runs its CLI on nobody` asserts this property across every script here.
if (isMainModule(import.meta.url)) {
  process.exit(main(process.argv.slice(2)))
}
