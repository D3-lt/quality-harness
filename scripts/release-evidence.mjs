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
//   node scripts/release-evidence.mjs --local <sha>   # only what this clone can answer before CI: the outside run, the review
//
// Exit codes are distinct on purpose, so a caller can tell the three apart:
//   0  every job concluded success — safe to release this sha
//   1  a job did not conclude success (failed, cancelled, timed out, skipped)
//   2  could not look (no gh, no run for this sha, unreadable answer, the run
//      was not a full campaign — see `cached` below — or the readers changed since
//      the last tag and nobody outside has run them, see `outsideRun`, or a plugin
//      commit since the last tag no recorded review covers, see `reviewEvidence`)
//   3  the run is not finished yet
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { verifyFile } from './attest-import.mjs'
import { stateDir } from '../plugin/scripts/event-log.mjs'
import { REVIEW_COVERING, REVIEWS_FILE } from '../plugin/scripts/host-review.mjs'
import { isMainModule } from '../plugin/scripts/main-module.mjs'
import { READER_DIRECTORIES } from '../plugin/scripts/reader-paths.mjs'
import { NATIVE_READER_ROOTS, isReaderPath } from './native-source.mjs'

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
// `landingIsFull`: whether the workflow at the run's sha runs a push to land/** as the full campaign (`landingIsFullAt`).
// Absent, it is false, so a landing run is cached unless its own workflow says otherwise (the Codex review of
// v3.8.52..2ad118d0: a landing from before ADR-126 reused the cache).
export function evaluateRun(run, { landingIsFull = false } = {}) {
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
  // ⚠ A GREEN RUN IS NOT AUTOMATICALLY A RELEASE-GRADE ONE (BACKLOG §142). Only a full
  // campaign may carry a tag (ADR-023 rule 1): a `workflow_dispatch` run, or since
  // ADR-126 T1 the landing's own push to `land/<its sha>`, which the workflow runs
  // full. Any other push or a pull request may reuse a cached RED verdict, which is
  // right for iteration and not what a tag may rest on. The event and the branch are
  // what distinguish them from outside, so they are asked here rather than assumed.
  if (run.event === undefined || run.event === null) {
    return {
      verdict: 'unreadable',
      reason: 'the run does not say what raised it, so whether its campaign was full cannot be told '
        + 'from here. That is "could not look", not "cleared" (ADR-005).',
      jobs,
    }
  }
  const landing = landingIsFull && run.event === 'push' && typeof run.headSha === 'string' && run.headBranch === `land/${run.headSha}`
  if (run.event !== 'workflow_dispatch' && !landing) {
    return {
      verdict: 'cached',
      reason: `the newest run for this sha was raised by \`${run.event}\`${run.headBranch ? ` on ${run.headBranch}` : ''}, so its `
        + 'mutation campaign may have reused cached verdicts. A release must rest on a full campaign: land the sha '
        + 'through `node scripts/land.mjs` (its land/<sha> run is full), or run `gh workflow run selftest.yml --ref main` '
        + 'at it, wait for every job, and ask again.',
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
      'run', 'view', String(id), '--json', 'status,conclusion,headSha,headBranch,jobs,event',
    ], { encoding: 'utf8', timeout: 60_000 }))
  } catch {
    return null
  }
}

/**
 * ADR-117 T3: whether `main`'s rules require status checks. A push with --no-verify from a script skips every local hook,
 * so it closes at the forge or not at all; this says which. It reads and judges nothing: the verdict is unchanged by it.
 * `unknown` where gh is absent, offline or answers anything but a list of rules, said as COULD NOT LOOK (ADR-005).
 */
export function mainProtection(exec = execFileSync) {
  const unknown = why => ({ state: 'unknown', text: `forge: COULD NOT LOOK at main's rules (${why}), so whether a push --no-verify from a script reaches main with nothing run is not known (ADR-117)` })
  let pages
  try {
    // Every page, as one list of pages: a check on a later page is a check (the Codex review of aae06d72..90b9ceaf).
    pages = JSON.parse(exec('gh', ['api', 'repos/{owner}/{repo}/rules/branches/main', '--paginate', '--slurp'], { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] }))
  } catch (error) {
    return unknown(String(error?.message ?? error).split('\n', 1)[0])
  }
  const rules = Array.isArray(pages) ? pages.flat() : pages
  if (!Array.isArray(rules)) return unknown('the answer is not a list of rules')
  // A rule it cannot read is not a rule it read, so an answer it cannot tell from "no check" is could-not-look, not unprotected.
  if (rules.some(rule => !rule || typeof rule !== 'object' || typeof rule.type !== 'string'
    || (rule.type === 'required_status_checks' && !Array.isArray(rule.parameters?.required_status_checks)))) return unknown('a rule in the answer is not one it can read')
  const entries = rules.filter(rule => rule.type === 'required_status_checks').flatMap(rule => rule.parameters.required_status_checks)
  // A required check it cannot read is one it did not read: it is could-not-look, never dropped (the verification of a855f7f7).
  if (entries.some(check => !check || typeof check !== 'object' || typeof check.context !== 'string' || !check.context)) return unknown('a required check in the answer is not one it can read')
  const checks = entries.map(check => check.context)
  // ADR-118: each context with the app the rule binds it to, which a landing waits for (scripts/land.mjs).
  const required = entries.map(check => ({ context: check.context, integration: check.integration_id ?? null }))
  if (checks.length) return { state: 'protected', required, text: `forge: main requires ${checks.length} status check(s) before a push lands: ${checks.join(', ')} (ADR-117)` }
  return { state: 'unprotected', required: [], text: "forge: main's rules require no status check, so a push --no-verify from a script reaches main with nothing run; a ruleset requiring the selftest checks closes it (ADR-117)" }
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
// ADR-082: from 3.8.0 an attestation counts the adr-lint verdicts its run moved (`verdictChanges`).
function saysWhatChanged(plugin) {
  const version = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(plugin ?? ''))
  return Boolean(version) && (Number(version[1]) > 3 || (Number(version[1]) === 3 && Number(version[2]) >= 8))
}
// A regression is one whatever version an attestation names: a run at a sha whose plugin.json
// still says the last release carries the field too (the stand-in review of ADR-082).
const regressedBy = report => (report.verdictChanges?.passToFail ?? 0) > 0
// An attestation from before the field, or one whose run compared records and moved none out of PASS.
const countsAsRun = report => !saysWhatChanged(report.plugin)
  || (report.verdictChanges !== null && typeof report.verdictChanges === 'object'
    && report.verdictChanges.passToFail === 0 && report.verdictChanges.compared > 0)

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
  const checked = (reports ?? []).filter(r => typeof r?.at === 'string').map(r => ({ r, c: covers(r.at, r) }))
  const covering = checked.filter(v => v.c === true).map(v => v.r)
  // A regression one corpus reports is not outvoted by a corpus that did not see it (ADR-082 F-5).
  const regressed = covering.filter(regressedBy)
  if (regressed.length) {
    return {
      verdict: 'unproven', kind: 'regressed',
      reason: `an outside run reports adr-lint verdicts that left PASS: ${regressed.map(r => `${r.file} (passToFail ${r.verdictChanges.passToFail})`).join(', ')} `
        + '— read its --diff, fix the reader or confirm each row is stale, and attest a run that moved none (ADR-082)',
    }
  }
  // ADR-089: an UNPROVEN run attests nothing, whatever it counts. Each is excluded on its own, so an
  // ok run beside it does not carry it into the attested list (a review of ADR-089).
  const blind = covering.filter(report => report.look === 'UNPROVEN')
  const attested = covering.filter(report => countsAsRun(report) && report.look !== 'UNPROVEN')
  const blindNote = blind.length ? `${blind.map(r => r.file).join(', ')} could not look at its corpus (look UNPROVEN) and attests nothing; ` : ''
  // ADR-089 Alternative (d), the owner's decision on Accepting it: a PARTIAL run corroborates a release
  // and can refuse one (`regressed`, above), but attests it only beside a run whose look is ok. An
  // attestation from before `look` is judged as before.
  const sawAll = report => !('look' in report) || report.look === 'ok'
  if (attested.length && !attested.some(sawAll)) {
    return {
      verdict: 'unproven', kind: 'partial-only',
      reason: `${blindNote}${attested.map(r => `${r.file} (look ${r.look})`).join(', ')} read only part of the corpus: a PARTIAL run attests a `
        + 'release only beside an attestation whose look is ok (ADR-089)',
    }
  }
  if (attested.length === 0) {
    if (covering.length) {
      const unverified = checked.filter(v => v.c === null).map(v => v.r.file)
      return {
        verdict: 'unproven', kind: 'uncompared',
        reason: `${blindNote}${covering.map(r => r.file).join(', ')} compared nothing: from 3.8.0 an outside run attests only with the `
          + 'verdictChanges that `corpus-probe --attest … --since <earlier report>` counts (ADR-082)'
          + (unverified.length ? `; ${unverified.join(', ')} could not be checked against this sha (fetch the revision)` : ''),
      }
    }
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
  // What a run did not see rides in the reason: a PARTIAL look, and records it did not compare (ADR-089).
  const unseen = r => {
    const parts = [...('look' in r && r.look !== 'ok' ? [`look ${r.look}`] : []), ...(r.notCompared > 0 ? [`${r.notCompared} not compared`] : [])]
    return parts.length ? ` (${parts.join(', ')})` : ''
  }
  return {
    verdict: 'attested',
    reason: `outside run attested by ${attested.map(r => `${r.file} at ${String(r.at).slice(0, 7)}${r.verdictChanges?.failToPass ? ` (failToPass ${r.verdictChanges.failToPass})` : ''}${unseen(r)}`).join(', ')}`,
  }
}

/** Every attestation in `dir`, each carrying its file name; an unparsable one attests nothing. */
export function readAttestations(dir, { readdir = readdirSync, read = readFileSync } = {}) {
  let names
  try { names = readdir(dir).filter(name => name.endsWith('.json')).sort() } catch { return [] }
  const out = []
  for (const name of names) {
    // The name is the file's own, after the parsed fields: a JSON carrying `file` named another attestation, and that one was
    // verified in its place (the Codex review of v3.8.53..42a903a8).
    try { out.push({ ...JSON.parse(read(join(dir, name), 'utf8')), file: name }) } catch { /* attests nothing */ }
  }
  return out
}

// What a "reader" is for the release question: the plugin's own list (ADR-064 T1),
// as repository paths.
export const READER_PATHS = [...READER_DIRECTORIES.map(directory => `plugin/${directory}`), ...NATIVE_READER_ROOTS]

/**
 * The outside-run question for `sha`, asked of git. The anchor is the newest tag
 * reachable from the sha's PARENT: the sha being released is usually the bump
 * commit, and once it is tagged `describe` on the sha itself would answer with
 * that tag and hide every change it ships. `exec` is the seam. `verify`, given a
 * report's file name, answers as attest-import's `verifyFile` does; a report that
 * covers the sha counts only once it verifies (BACKLOG §408).
 */
export function outsideRunEvidence(sha, exec = execFileSync, reportsDir = 'docs/corpus-reports', { verify = null } = {}) {
  const git = args => exec('git', args, { encoding: 'utf8', timeout: 30_000 }).trim()
  let tag
  try { tag = git(['describe', '--tags', '--abbrev=0', `${sha}~1`]) } catch { return { ...outsideRun(null, [], () => false), tag: null } }
  let changed
  try {
    changed = git(['diff', '--name-only', `${tag}..${sha}`, '-z', '--', ...READER_PATHS]).split('\0').filter(isReaderPath)
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
    try { return !git(['diff', '--name-only', `${at}..${sha}`, '-z', '--', ...READER_PATHS]).split('\0').some(isReaderPath) } catch { return null }

  }
  // Only a covering report is verified: verifying is several git calls, and a report at an older revision attests nothing
  // either way. One that does not verify is named; one git could not check it against is coverage unknown (ADR-005).
  const refused = []
  const verified = (at, report) => {
    const c = covers(at)
    if (c !== true || !verify) return c
    const answer = verify(report.file)
    if (answer.couldNotLook) return null
    if (answer.verified) return true
    refused.push(`${report.file} does not verify as an attestation (${answer.refused?.[0] ?? 'no reason given'}) and attests nothing`)
    return false
  }
  const answer = outsideRun(changed, readAttestations(reportsDir), verified)
  return { ...answer, ...(refused.length ? { reason: `${answer.reason}; ${refused.join('; ')}` } : {}), tag }
}

/** The outside-run question as a release asks it: `root`'s git and its docs/corpus-reports, each covering file verified. */
export function releaseOutsideRun(sha, root = process.cwd()) {
  const reports = join(root, 'docs', 'corpus-reports')
  const exec = (bin, args, options) => execFileSync(bin, args, { ...options, cwd: root })
  return outsideRunEvidence(sha, exec, reports, { verify: file => verifyFile(join(reports, file), root) })
}

// ADR-100 T1. What counts as a review: one that ran and said something. `unavailable` did not finish; `unparsed` said nothing
// this could read. `evidence-limited` ran over its scope without runnable evidence, which the skill calls its strongest verdict
// then (`plugin/skills/codex-review/SKILL.md:181`); the owner may narrow it.
const COVERING = REVIEW_COVERING
const MANIFEST = 'plugin/.claude-plugin/plugin.json'

/**
 * The review question for `sha`, asked of git and of the review ledger `host-review.mjs` writes (ADR-100 T1): every commit
 * since the last tag that touches `plugin/`, other than a version bump, must lie in the range of a recorded review that ran.
 * A bump is a first-parent diff naming only the manifest and changing only its `"version"` line. A row whose range is null,
 * or whose shas this clone cannot resolve, covers nothing; only git failing on the release's own commits is could-not-look,
 * so one stale row can never turn every release UNPROVEN (the cold review of ADR-100). A review's own status is said, never
 * judged: which blocking findings were fixed is not a fact the ledger holds.
 */
export function reviewEvidence(sha, { cwd = process.cwd(), exec = execFileSync, ledger = null } = {}) {
  const git = args => exec('git', args, { cwd, encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const unlisted = (tag, what) => ({ verdict: 'unproven', kind: 'unlisted', tag, uncovered: [], reason: `whether a plugin commit since ${tag ?? 'the last tag'} needs a review could not be established — git could not ${what}` })
  let tag
  try { tag = git(['describe', '--tags', '--abbrev=0', `${sha}~1`]) } catch { return unlisted(null, 'name the tag') }
  let commits
  try { commits = git(['rev-list', '--reverse', `${tag}..${sha}`, '--', 'plugin/']).split('\n').filter(Boolean) } catch { return unlisted(tag, 'list the commits') }
  const needed = []
  for (const commit of commits) {
    try {
      const names = git(['diff', '--no-renames', '--name-only', `${commit}^1`, commit, '--', 'plugin/']).split('\n').filter(Boolean)
      const changed = names.length === 1 && names[0] === MANIFEST
        ? git(['diff', '--no-renames', '-U0', `${commit}^1`, commit, '--', MANIFEST]).split('\n')
          .filter(line => /^[+-]/.test(line) && !/^(\+\+\+|---)( |$)/.test(line))
        : null
      const bump = Array.isArray(changed) && changed.length > 0 && changed.every(line => /^[+-]\s*"version"\s*:/.test(line))
      if (!bump) needed.push(commit)
    } catch { return unlisted(tag, `diff ${commit.slice(0, 7)}`) }
  }
  if (needed.length === 0) return { verdict: 'not-required', tag, uncovered: [], reason: `no plugin commit since ${tag} needs a review (a version bump needs none)` }
  let text = ''
  try { text = readFileSync(ledger ?? join(stateDir(cwd), REVIEWS_FILE), 'utf8') } catch { /* no ledger is no review */ }
  const rows = text.split('\n').filter(line => line.trim()).flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
  const usable = rows.filter(row => row && COVERING.has(row.status) && typeof row.head === 'string')
  // Three answers: `true`, `false` only for git's definite "no" (exit 1), and `null` for a revision this clone cannot
  // resolve. A row covers a commit only on a definite answer at both ends: a base that does not resolve is not "outside the
  // base" (the Codex review of ce54814c: such a row covered every commit since the tag).
  const ancestor = (a, b) => { try { git(['merge-base', '--is-ancestor', a, b]); return true } catch (error) { return error?.status === 1 ? false : null } }
  const holds = (row, commit) => row.exact === true
    ? row.head === commit
    : typeof row.base === 'string' && ancestor(commit, row.head) === true && ancestor(commit, row.base) === false
  // ADR-125: the NEWEST row covering a commit decides, and the ledger is appended when a review ends, so the newest is the
  // last. A review that requested changes covers nothing until a later one covering the same commit says otherwise: the
  // fix round's verification review (CLAUDE.md §12).
  const covers = new Map(needed.map(commit => [commit, usable.findLast(row => holds(row, commit)) ?? null]))
  const uncovered = needed.filter(commit => !covers.get(commit))
  if (uncovered.length) {
    return {
      verdict: 'unproven', kind: 'unreviewed', tag, uncovered,
      reason: `${uncovered.length} plugin commit(s) since ${tag} no recorded review covers: ${uncovered.map(c => c.slice(0, 8)).join(', ')}`,
    }
  }
  const blocked = needed.filter(commit => covers.get(commit).status === 'blocking')
  if (blocked.length) {
    return {
      verdict: 'unproven', kind: 'blocked', tag, uncovered: blocked,
      reason: `${blocked.length} plugin commit(s) since ${tag} whose newest recorded review requested changes: ${blocked.map(c => c.slice(0, 8)).join(', ')}`,
    }
  }
  const said = new Map()
  for (const row of covers.values()) said.set(row.status, (said.get(row.status) ?? 0) + 1)
  return {
    verdict: 'reviewed', tag, uncovered: [],
    reason: `${needed.length} plugin commit(s) since ${tag} covered by a recorded review (${[...said].map(([status, n]) => `${status} ${n}`).join(', ')})`,
  }
}

// `cached` shares exit 2 with `unreadable` on purpose: both mean "I could not
// look at a full campaign for this sha", which is the one thing a release needs.
/**
 * ADR-113 T5: the job names the workflow declares, matrices expanded: a run lacking one was a run nobody missed, since
 * `evaluateRun` reads only the jobs the run reports. Read from the workflow at the sha (`declaredJobsAt`), never from the
 * working tree. A name whose matrix axis is not a one-line list is kept as written, which no run reports, so it reads as
 * missing: the direction that holds a release (ADR-005). Null for a text with no `jobs:` block.
 */
export function declaredJobs(text) {
  const lines = String(text ?? '').split(/\r?\n/)
  const start = lines.findIndex(line => /^jobs:\s*$/.test(line))
  if (start < 0) return null
  const unquote = value => value.trim().replace(/^(['"])(.*)\1$/, '$2')
  const jobs = []
  for (const line of lines.slice(start + 1)) {
    // A comment or a blank line at any indent is neither the end of the mapping nor a job (the Codex review of
    // 6641c951..4db47214: an unindented comment hid every job after it). A job written inline is not read here, and a
    // jobs block this cannot read whole is null, never a shorter list.
    if (/^\s*(?:#|$)/.test(line)) continue
    if (/^\S/.test(line)) break
    if (/^ {2}[A-Za-z0-9_-]+:\s*[^\s#]/.test(line)) return null
    const key = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line)
    if (key) { jobs.push({ name: key[1], matrix: {} }); continue }
    const job = jobs.at(-1)
    if (!job) continue
    const name = /^ {4}name:\s*(.+?)\s*$/.exec(line)
    if (name) job.name = unquote(name[1])
    const axis = /^ {8}([A-Za-z0-9_-]+):\s*\[(.*)\]\s*$/.exec(line)
    if (axis) job.matrix[axis[1]] = axis[2].split(',').map(unquote).filter(Boolean)
  }
  if (!jobs.length) return null
  const expand = (name, matrix) => {
    const ref = /\$\{\{\s*matrix\.([A-Za-z0-9_-]+)\s*\}\}/.exec(name)
    if (!ref || !matrix[ref[1]]) return [name]
    return matrix[ref[1]].flatMap(value => expand(name.replace(ref[0], value), matrix))
  }
  return jobs.flatMap(job => expand(job.name, job.matrix))
}

/** The declared job names no job of the run carries. */
export function missingJobs(declared, jobs) {
  const reported = new Set((jobs ?? []).map(job => job.name))
  return declared.filter(name => !reported.has(name))
}

/** `declaredJobs` of the workflow as committed at `sha`, or null when git cannot show it. */
function declaredJobsAt(sha, exec = execFileSync) {
  try {
    return declaredJobs(exec('git', ['show', `${sha}:.github/workflows/selftest.yml`], { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] }))
  } catch {
    return null
  }
}

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
  '     changed since the last tag with no outside run attested in docs/corpus-reports/ — §18,',
  '     or with an outside run that regressed, compared nothing, or read only part of its corpus',
  '     (partial-only) — ADR-082, ADR-089 — or with a plugin commit since the last tag that no review',
  '     recorded by host-review.mjs covers, ADR-100)',
  '  3  the run is not finished yet',
].join('\n')

/** What to do about an UNPROVEN outside-run verdict, said by its `kind`; anything else is could-not-look. */
export function tagAdvice(kind) {
  const advice = {
    missing: 'Do NOT tag this sha. CI is green and nobody outside has run the readers it ships — get one run '
      + '(`/quality-harness:corpus-chaos`) at a revision that carries every reader change, file its attestation '
      + 'in docs/corpus-reports/, and ask again.',
    unverified: 'Do NOT tag this sha yet. An attestation exists but git here could not check it against this sha — fetch '
      + 'the attested revision (and the tags), then ask again. Coverage unknown is not coverage absent (ADR-005).',
    regressed: 'Do NOT tag this sha. An outside run reports adr-lint verdicts that left PASS against its own earlier report '
      + '(a FAIL, or a record that could no longer be read) — read its --diff with the runner, fix the reader or confirm '
      + 'each row is stale, and file a run that moved none (ADR-082).',
    uncompared: 'Do NOT tag this sha. The outside run compared nothing — ask for `corpus-probe --attest <label> <report> '
      + '--since <earlier report>`, file that attestation, and ask again (ADR-082).',
    'partial-only': 'Do NOT tag this sha. Every outside run that attests it read only part of its corpus — a PARTIAL run '
      + 'attests a release only beside one whose look is ok: get a run over a corpus the readers read whole, file it, and ask again (ADR-089).',
    blocked: 'Do NOT tag this sha. The newest recorded review of a plugin commit since the last tag requested changes — fix what '
      + 'it found, then run the scoped verification review of that fix round (CLAUDE.md §12) through the launcher, with a range '
      + 'that holds the commits it names, and ask again (ADR-125).',
    unreviewed: 'Do NOT tag this sha. A plugin commit since the last tag has no recorded review — run one scoped review through '
      + 'the launcher (the codex-review skill, `host-review.mjs --prompt-file … --range <tag>..<sha>`) over what it names, and ask again (ADR-100).',
    'review-unlisted': 'Do NOT tag this sha. Whether its plugin commits since the last tag were reviewed could not be established '
      + 'from git here — that is could-not-look, not cleared (ADR-005). Fetch the tags, then ask again.',
  }
  return advice[kind] ?? ('Do NOT tag this sha. Whether its readers changed since the last tag could not be established from git '
    + 'here — that is could-not-look, not cleared (ADR-005). Fetch the tags, then ask again.')
}

// The CLI, exported with its readers as seams so the review question is shown asked from this path (ADR-100 T1).
// A caller that hands in its own run hands in its own forge: the forge is asked by default only of the gh the run came from.
/**
 * ADR-126 T1: whether the workflow at `sha` runs a push to `land/**` as the full campaign, read from its own
 * `QUALITY_HARNESS_FULL_CAMPAIGN` line. A landing before ADR-126 ran cached; a workflow that cannot be read is not full.
 */
const LANDING_FULL = "QUALITY_HARNESS_FULL_CAMPAIGN: ${{ github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && startsWith(github.ref, 'refs/heads/land/')) }}"

export function landingIsFullAt(sha, exec = execFileSync) {
  try {
    const workflow = exec('git', ['show', `${sha}:.github/workflows/selftest.yml`], { encoding: 'utf8', timeout: 30_000 })
    // The exact expression, on a line of its own and not a comment: any other form is not recognised, and not full
    // (the Codex verification of 3940f0d4: `dispatch && (push && startsWith(...))` holds for no push and matched a looser test).
    return workflow.split('\n').some(line => line.trim() === LANDING_FULL)
  } catch {
    return false
  }
}

export function main(argv, { fetch = fetchRun, outside: outsideOf = releaseOutsideRun, review: reviewOf = reviewEvidence, declared: declaredOf = declaredJobsAt, full: fullOf = landingIsFullAt, forge = fetch === fetchRun ? mainProtection : null, log = console.log } = {}) {
  // `--local`: the two questions git and the review ledger answer, asked before anything lands, so evidence gathered late
  // is a refusal before the landing rather than a file the landed sha does not hold (BACKLOG §406). No run is fetched.
  if (argv[0] === '--local' || argv[0] === '--review') {
    // ADR-126 T4: `--review` asks the review question alone. The outside run is asked for once the landing's run is green,
    // so before the landing its absence is expected and stops nothing.
    const reviewOnly = argv[0] === '--review'
    const target = classifyArgument(argv[1])
    if (target.kind !== 'sha' || !target.value) {
      console.error(`release-evidence: ${argv[0]} needs a sha\n\n${USAGE}`)
      return EXIT.unreadable
    }
    const outside = reviewOnly ? null : outsideOf(target.value)
    const review = reviewOf(target.value)
    const unproven = outside?.verdict === 'unproven' || review.verdict === 'unproven'
    log(`${unproven ? 'UNPROVEN' : 'READY'} (${target.value.slice(0, 7)}) — ${outside ? `since ${outside.tag ?? 'the last tag'}: ${outside.reason}; ` : ''}${review.reason}`)
    if (outside?.verdict === 'unproven') log(tagAdvice(outside.kind))
    if (review.verdict === 'unproven') log(tagAdvice(review.kind === 'unreviewed' || review.kind === 'blocked' ? review.kind : 'review-unlisted'))
    return unproven ? EXIT.unproven : EXIT.success
  }
  const argument = classifyArgument(argv[0])
  if (argument.kind === 'help') {
    log(USAGE)
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
  const run = fetch(sha)
  const result = evaluateRun(run, { landingIsFull: run?.event === 'push' && fullOf(sha) })
  for (const j of result.jobs) {
    log(`  ${j.name}: ${j.status} ${j.conclusion ?? '-'}`)
  }
  // ADR-117 T3: said whatever the verdict, since a push the forge does not check is open at every release.
  if (forge) log(forge().text)
  const head = run?.headSha ? ` (${String(run.headSha).slice(0, 7)})` : ''
  // A green campaign is necessary, not sufficient: the readers it ships must have
  // been run by somebody else since the last tag (CLAUDE.md §18), and every plugin
  // commit since it reviewed (ADR-100). Asked only once CI has cleared the sha, so a
  // red run is reported as red and nothing else.
  let { verdict, reason } = result
  let outside = null
  let review = null
  // ADR-113 T5: every job the workflow declares at this sha, not only every job the run reports.
  if (verdict === 'success') {
    const declared = declaredOf(sha)
    const missing = Array.isArray(declared) ? missingJobs(declared, result.jobs) : null
    if (missing === null) {
      verdict = 'unreadable'
      reason = 'the workflow at this sha could not be read, so whether the run holds every job it declares cannot be told (ADR-005)'
    } else if (missing.length) {
      verdict = 'failed'
      reason = `the run lacks ${missing.length} job(s) the workflow declares: ${missing.join(', ')}`
    }
  }
  if (verdict === 'success') {
    outside = outsideOf(sha)
    review = reviewOf(sha)
    reason = `${reason}; since ${outside.tag ?? 'the last tag'}: ${outside.reason}; ${review.reason}`
    if (outside.verdict === 'unproven' || review.verdict === 'unproven') verdict = 'unproven'
  }
  log(`${verdict.toUpperCase()}${head} — ${reason}`)
  if (verdict === 'unproven') {
    // Each could-not-look said apart: nobody ran the readers, git could not check a run, a run
    // regressed or compared nothing, git could not say whether they changed (Codex review of 013149e,
    // P2), or a plugin commit has no recorded review (ADR-100).
    if (outside?.verdict === 'unproven') log(tagAdvice(outside.kind))
    if (review?.verdict === 'unproven') log(tagAdvice(review.kind === 'unreviewed' || review.kind === 'blocked' ? review.kind : 'review-unlisted'))
  } else if (verdict !== 'success') {
    log('Do NOT tag this sha. A run that did not finish is "I could not look", '
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
