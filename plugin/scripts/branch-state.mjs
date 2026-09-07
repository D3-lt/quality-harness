#!/usr/bin/env node
// branch-state.mjs — what is true of this branch and its CI, stated once, unprompted.
//
// CLAUDE.md §15. It exists because of a measured miss, not a worry. On 2026-09-04
// the CI coverage job went red on `main` at 17:20 and stayed red. Four hours
// later a session ran `bash scripts/selftest.sh`, read exit 0, and reported that
// ten unreleased plugin commits made a release "warranted". Nothing lied: that is
// a different gate answering a different question. Nobody looked at the one that
// was red, because nothing said it out loud and a local green feels like an
// answer (BACKLOG §126).
//
// This is the agentsmemory wake-up pattern pointed at the repository instead of
// at memory: a SessionStart hook that says the few facts a session would
// otherwise assume. It READS. It never blocks a session, never fails one, and
// exits 0 whatever it finds (CLAUDE.md §3). Could-not-look says so in those
// words and is never rendered as a clean bill (ADR-005) — an absent `gh`, no
// network and a genuinely green branch must not look alike.
//
// `run` is the seam (CLAUDE.md §7): every process this takes comes through it,
// so the whole reader is exercised on any host without a network or a remote.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
/**
 * Where `.git` is, so the cache lands somewhere never tracked and never shipped.
 *
 * ⚠ RETURNS null WHEN GIT CANNOT ANSWER, and that is the whole point. An earlier
 * version fell back to `"."`, which put `qh-branch-state.json` in the process's
 * working directory — a TRACKED directory, where it could overwrite a real file
 * and where a repository-controlled file could then be read back as this tool's
 * own answer. There is no safe default for "I do not know where .git is": the
 * honest response is to use no cache at all.
 */
export function gitDir(run = shell) {
  const answer = run(['git', 'rev-parse', '--git-dir'])
  return answer.ok && answer.out ? answer.out : null
}

/**
 * A runner with ONE deadline for the whole collection, not one per subprocess.
 *
 * The hook host kills this at 20s. `shell` gives every command 15s of its own,
 * and a failing CI answer runs `gh run list` then `gh run view` — two of those
 * alone outlive the budget, and a hook killed by its host is a hook that blocked
 * a prompt. Past the deadline every further command answers "not ok" with the
 * reason, which renders as COULD NOT LOOK rather than as anything green.
 */
// Total wall-clock a hook may spend collecting, on any path. Below the 20s the
// host allows a hook, and short enough that a cold gh reads as COULD NOT LOOK
// instead of a session that will not start.
const BUDGET_MS = 8_000

export function budgeted(totalMs, run = shell, now = Date.now) {
  const deadline = now() + totalMs
  return argv => {
    const left = deadline - now()
    // `budget: true` marks a command PREVENTED rather than one that answered no.
    // Without it the two are one `ok: false` and the release line renders silence
    // for both — a spent budget reading exactly like "nothing to release", which
    // is ADR-005 broken by the thing that exists to honour it.
    if (left <= 0) {
      return { ok: false, out: '', budget: true, note: `budget of ${totalMs}ms spent before \`${argv.join(' ')}\`` }
    }
    return run(argv, { timeout: Math.min(left, 15_000) })
  }
}
/** Run a command and report what happened, never throwing. */
export function shell(argv, { cwd = process.cwd(), timeout = 15_000 } = {}) {
  try {
    return { ok: true, out: execFileSync(argv[0], argv.slice(1), { cwd, timeout, encoding: 'utf8' }).trim() }
  } catch (error) {
    return { ok: false, out: '', note: (error.stderr || error.message || 'failed').toString().split('\n')[0] }
  }
}

/**
 * Everything the renderer needs, gathered through `run`.
 *
 * Each half is independent: git can answer while `gh` is missing, and the render
 * must be able to say so for one without claiming anything about the other.
 */
export function collect(run = shell) {
  const branch = run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
  if (!branch.ok) return { looked: false, note: branch.note }
  const head = run(['git', 'rev-parse', '--short', 'HEAD'])
  const dirty = run(['git', 'status', '--short'])
  const counts = run(['git', 'rev-list', '--left-right', '--count', `origin/${branch.out}...HEAD`])
  const [behind, ahead] = counts.ok ? counts.out.split(/\s+/).map(Number) : [null, null]

  const runs = run(['gh', 'run', 'list', '--branch', branch.out, '--limit', '1',
    '--json', 'headSha,status,conclusion,databaseId'])
  let ci = { looked: false, note: runs.ok ? 'no run recorded for this branch' : runs.note }
  if (runs.ok) {
    let rows = []
    try { rows = JSON.parse(runs.out) } catch { rows = [] }
    const newest = rows[0]
    if (newest) {
      ci = {
        looked: true, sha: String(newest.headSha).slice(0, 7),
        status: newest.status, conclusion: newest.conclusion, failed: [],
      }
      if (newest.conclusion && newest.conclusion !== 'success') {
        const jobs = run(['gh', 'run', 'view', String(newest.databaseId), '--json', 'jobs'])
        if (jobs.ok) {
          try {
            ci.failed = JSON.parse(jobs.out).jobs
              .filter(job => job.conclusion && job.conclusion !== 'success')
              .map(job => `${job.name}: ${job.conclusion}`)
          } catch { ci.failed = [] }
        }
      }
    }
  }

  // WHICH TAG THE RELEASE QUESTION IS ANCHORED TO, and it is not simply the newest
  // one `git describe` can see. `git describe` reads LOCAL refs; a release cut with
  // `gh release create` puts its tag on the FORGE. So the very machine that does the
  // releasing is the one whose anchor goes stale, and this line then reports as
  // unreleased work that shipped several versions ago. Observed here 2026-09-07:
  // HEAD was tagged v2.85.0 on the remote and this said "plugin/ changed in 8
  // file(s) since v2.81.0 — a green shipped change is released, not parked" on every
  // prompt. The COUNT was true and the CONCLUSION was false (BACKLOG §157).
  //
  // ⚠ THE FORGE IS ASKED UNCONDITIONALLY, AND THAT IS THE SECOND VERSION OF THIS.
  // The first asked only when the LOCAL anchor already claimed something pending,
  // to save a subprocess — and a different-lineage review named two shapes that
  // hides, both under-reporting in the flattering direction. A local tag NEWER
  // than the forge release and pointing at HEAD makes the local diff empty, so
  // nothing was asked and nothing was said, while everything between the release
  // and that tag was genuinely unreleased. A clone with NO local tag never asked
  // either. Saving a process by deciding in advance that the answer will not
  // change is the same mistake as not looking.
  //
  // The forge wins whenever it answers. The local tag is the fallback, and the
  // render says so, because "the newest tag this clone knows" and "the newest
  // release" are different observations (ADR-005).
  const forge = releaseAnchor(run)
  const tag = run(['git', 'describe', '--tags', '--abbrev=0'])
  // ⚠ A TAG THE FORGE REJECTED MUST NOT WALK BACK IN AS THE FALLBACK. A
  // prerelease sitting at HEAD is the case: refuse it as the release anchor, fall
  // back to `git describe`, and `git describe` hands back THE SAME TAG — empty
  // diff, silence, and the refusal defeated by the line after it.
  const rejected = forge.kind !== 'release' && forge.name ? forge.name : null
  const local = tag.ok && tag.out && tag.out !== rejected
    ? { ref: tag.out, name: tag.out, kind: 'local' }
    : null
  // The order IS the fix. Written as two named values rather than folded into one
  // expression so a mutant can swap them and a test can notice.
  const anchor = forge.kind === 'release' ? forge : local
  const shipped = anchor ? run(['git', 'diff', '--name-only', `${anchor.ref}..HEAD`, '--', 'plugin/']) : null
  // ⚠ COULD-NOT-LOOK IS NOT "NOTHING TO RELEASE", AND THIS RENDERED THEM ALIKE.
  // `shippedSinceTag` was null for a diff that never ran and 0 for one that ran
  // and found nothing, and the render printed nothing for both. An 8s budget spent
  // on the CI calls therefore produced a clean, green, entirely silent report on a
  // branch with unreleased work. Named by a different-lineage review that probed
  // the seam with a slow `gh` rather than reasoning about it.
  // ⚠ A BLOCKED FORGE STAYS BLOCKED EVEN WHEN A LOCAL TAG ANSWERS. The previous
  // version only reported `forge.blocked` when there was NO anchor at all, so a
  // rejected release plus any local tag under a DIFFERENT name — a `candidate`
  // alias on the same commit — anchored locally, diffed to zero, and fell silent.
  // The name-comparison guard above stops the identical tag walking back in and
  // does nothing about an alias, which is why the state has to survive the
  // fallback rather than the tag being filtered out of it.
  //
  // A count that DID come back is not silenced by this: the hedge on a local
  // anchor already tells the reader where the number came from, and the advice
  // fires. Silence is the only failure mode this is about.
  const blocked = anchor && !(shipped && shipped.ok)
    ? `the diff from ${anchor.name} could not be read`
    : forge.blocked
      ? forge.note
      : (!anchor && tag.budget ? tag.note : null)
  return {
    looked: true,
    branch: branch.out,
    head: head.ok ? head.out : '(unknown)',
    dirty: dirty.ok ? dirty.out.split('\n').filter(Boolean).length : null,
    ahead, behind, ci,
    tag: anchor ? anchor.name : null,
    tagKind: anchor ? anchor.kind : null,
    shippedSinceTag: shipped && shipped.ok ? shipped.out.split('\n').filter(Boolean).length : null,
    releaseBlocked: blocked,
  }
}

/**
 * What the forge says its newest release is — as a STRUCTURED answer, never null.
 *
 * ⚠ EVERY REFUSAL USED TO COLLAPSE TO `null`, and the caller then could not tell
 * "there are no releases" from "there is one and I will not use it" from "I could
 * not ask". Two of those are could-not-look and one is not, and ADR-005 is the
 * whole of this file. `kind` says which:
 *
 *   release   — usable: `ref` is a commit HEAD descends from, `name` its tag
 *   absent    — no `gh`, not a GitHub remote, or no release cut. Not blocked:
 *               most adopters live here and it must stay quiet.
 *   rejected  — a release exists and is a draft or a prerelease
 *   unrelated — a release exists and HEAD does not descend from it
 *   unknown   — the question could not be put at all (budget, unparseable answer)
 *
 * `blocked` is true for everything the reader should SAY it could not settle, and
 * `name` is carried on a refusal so the caller can keep the rejected tag out of
 * its own fallback.
 *
 * ⚠ `targetCommitish` IS NOT ALWAYS A SHA. It is whatever the release was cut
 * against, and for one created from a branch it is the branch NAME. Handing that
 * to `git diff` would anchor on the branch tip — which is HEAD — and report
 * nothing unreleased for ever, silently, in the flattering direction.
 *
 * ⚠ AND EXISTING IS NOT ANCESTRY. `cat-file -e` proved only that this clone holds
 * the commit, which a fetched release branch also satisfies. `merge-base
 * --is-ancestor` is the same one process and is what the diff needs. It cannot
 * tell "not an ancestor" from "git could not answer", so the note says both.
 *
 * ⚠ A DRAFT OR PRERELEASE IS NOT WHAT SHIPPED — it would count work as released
 * that no adopter can install.
 */
/**
 * The `gh` diagnostics that positively mean "there is no release to compare
 * against here", as opposed to "I could not tell you". The distinction is the
 * whole of `absent` vs `unknown`: one may be silent and the other may not, so
 * membership is by EXACT diagnostic and never by HTTP status.
 *
 * ⚠ `HTTP 404` WAS IN HERE AND IS NOT EVIDENCE OF ANYTHING. A missing repository,
 * a wrong remote and a private repository the token cannot see all return 404,
 * and each of those was being read as "no release cut" — silence over a state
 * nobody had established. `gh` says `release not found` when the repository is
 * readable and holds none, which is the actual observation.
 *
 * `none of the git remotes` is the not-applicable case and belongs here rather
 * than in `unknown`: a repository that is not on GitHub has no forge release to
 * be uncertain about, and telling its owner so on every prompt is BACKLOG §152
 * exactly.
 */
const NO_RELEASE = /release not found|no releases found|none of the git remotes/i

export function releaseAnchor(run) {
  const answer = run(['gh', 'release', 'view', '--json',
    'tagName,targetCommitish,isDraft,isPrerelease'])
  if (!answer.ok) {
    if (answer.budget) {
      return { kind: 'unknown', blocked: true, note: `the forge was not asked (${answer.note})` }
    }
    // ⚠ ONLY A POSITIVELY IDENTIFIED "THERE IS NO RELEASE" MAY BE QUIET. Every
    // other failure — 401, a network drop, a permission error, a timeout, `gh`
    // missing — used to land in `absent` and say nothing, and a local tag sitting
    // at HEAD then diffed to zero and the reader looked release-clean. A
    // different-lineage review injected `HTTP 401: Bad credentials` and read the
    // brief line: green, silent, wrong. The structured-result fix had closed the
    // budget path and moved the same hole into every other forge failure.
    //
    // This costs an adopter with no `gh` a second could-not-look line — and they
    // already get the CI one for the same reason, so it is consistent rather than
    // new noise. A repository that simply has no release cut stays quiet, which
    // is the case §152 is about.
    return NO_RELEASE.test(answer.note ?? '')
      ? { kind: 'absent', blocked: false, note: 'the forge holds no release to compare against' }
      : {
        kind: 'unknown', blocked: true,
        note: `the forge could not be read (${answer.note ?? 'no reason given'})`,
      }
  }
  let json
  try { json = JSON.parse(answer.out) } catch {
    return { kind: 'unknown', blocked: true, note: 'the forge answer did not parse as JSON' }
  }
  const name = String(json?.tagName ?? '')
  if (json?.isDraft || json?.isPrerelease) {
    return {
      kind: 'rejected', name, blocked: true,
      note: `the newest release ${name || '(unnamed)'} is a ${json.isDraft ? 'draft' : 'prerelease'}, `
        + 'so it is not what an adopter can install',
    }
  }
  const sha = String(json?.targetCommitish ?? '')
  if (!/^[0-9a-f]{40}$/.test(sha) || !name) {
    return {
      kind: 'unknown', name, blocked: true,
      note: 'the forge named no tag, or a target that is not a commit sha',
    }
  }
  const ancestor = run(['git', 'merge-base', '--is-ancestor', sha, 'HEAD'])
  if (!ancestor.ok) {
    return {
      kind: 'unrelated', name, blocked: true,
      note: `HEAD does not descend from ${name}, or git could not tell`,
    }
  }
  return { kind: 'release', ref: sha, name, blocked: false }
}

/**
 * The state as lines. PURE, and the whole reason the collector takes a seam:
 * every arm below — including the ones that need a red CI or a missing `gh` —
 * is reachable from a test on any host.
 *
 * `brief` is the per-message form. It is ONE line, because this fires on every
 * prompt and a paragraph that appears every prompt is one nobody reads by the
 * third — but it never goes silent when something is wrong: a red CI keeps its
 * ⚠ and its job names in brief too, since the whole point is to be seen.
 */
export function render(state, { brief = false } = {}) {
  if (!state.looked) return `branch-state: COULD NOT LOOK — ${state.note}. This says nothing about the branch.`
  const head = `branch-state: ${state.branch} @ ${state.head}`
    + `${state.dirty === null ? ', cleanliness COULD NOT LOOK'
      : state.dirty ? `, ${state.dirty} uncommitted path(s)` : ', clean'}`
    + `${state.ahead ? `, ${state.ahead} ahead of origin` : ''}`

  let ci
  let alarm = false
  if (!state.ci.looked) {
    ci = `COULD NOT LOOK — ${state.ci.note}. NOT a green branch; an unknown one.`
    alarm = true
  } else if (state.ci.status !== 'completed') {
    ci = `${state.ci.sha}: still running. Not finished is not green (§13).`
  } else if (state.ci.conclusion === 'success') {
    ci = `${state.ci.sha}: every job concluded success.`
  } else {
    ci = `${state.ci.sha}: ${String(state.ci.conclusion).toUpperCase()}`
      + `${state.ci.failed.length ? ` — ${state.ci.failed.join(', ')}` : ''}`
    alarm = true
  }

  // ⚠ A COUNT AND A BLOCKED FORGE ARE BOTH TRUE AT ONCE, and this used to choose.
  // The reasoning was that a non-empty count is not silence and the local hedge
  // already says where the number came from — which a fourth review round
  // overturned, correctly: the local tag can be NEWER than the published release,
  // so the count UNDERSTATES the unreleased work while omitting the reason it
  // might. Understating is the flattering direction, and the hedge says the anchor
  // is local, not that the forge was unreadable. Both clauses now.
  const counted = state.shippedSinceTag
    ? `plugin/ changed in ${state.shippedSinceTag} file(s) since ${state.tag}`
      + `${state.tagKind === 'release' ? ''
        : ', the newest tag THIS CLONE knows — a release tagged on the forge would not be here'}`
      + ' — §13: a green shipped change is released, not parked.'
    : null
  // A question that could not be put is not an answer of nothing. Silence here
  // reads as "nothing to release", which is the one thing this must never say
  // without having looked (ADR-005). Self-labelling, because the BRIEF form has no
  // `release` column and a bare "COULD NOT LOOK" one dot after the CI verdict
  // reads as a CI failure — and that line fires on every prompt.
  const unknown = state.releaseBlocked
    ? `COULD NOT LOOK at the release state — ${state.releaseBlocked}. `
      + 'That is not "nothing to release".'
    : null
  const release = [counted, unknown].filter(Boolean).join(' · ') || null

  if (brief) {
    return [`${head} · ${alarm ? '⚠ CI ' : 'CI '}${ci}${release ? ` · ${release}` : ''}`,
      ...(alarm ? ['  A LOCAL GREEN GATE DOES NOT ANSWER THIS — `selftest.sh` and the CI jobs are '
        + 'different checks.'] : [])].join('\n')
  }

  const lines = [head, `  ${alarm ? '⚠ CI    ' : 'CI      '} ${ci}`]
  if (alarm && state.ci.looked) {
    lines.push('           A LOCAL GREEN GATE DOES NOT ANSWER THIS. `scripts/selftest.sh` and the CI '
      + 'jobs are different checks; read this one before planning anything on this branch.')
  }
  if (release) lines.push(`  release  ${release}`)
  lines.push('  This READS. It blocks nothing and judges nothing about your work.')
  return lines.join('\n')
}
/**
 * A cached answer, so the per-message hook does not spawn `gh` on every prompt.
 *
 * The cache lives inside `.git/`, which is never tracked and never shipped, and
 * it carries the time it was taken — a stale answer that SAYS it is stale is
 * usable, one that pretends to be fresh is the thing this whole section is
 * about.
 *
 * ⚠ WHAT IS ON DISK IS NOT EVIDENCE UNTIL IT IS CHECKED. A cache file is an
 * input like any other: a FUTURE timestamp would keep a forged answer fresh for
 * ever, and a malformed `state` threw out of `render` and took the hook's exit
 * code with it — a reader that cannot block a session, blocking a session. Both
 * are now simply refreshed. A cache is a speed-up and is never allowed to be the
 * reason a session is told something wrong.
 */
export function usableCache(previous, now) {
  if (!previous || typeof previous !== 'object') return false
  if (!Number.isFinite(previous.at) || previous.at > now) return false
  const state = previous.state
  if (!state || typeof state !== 'object' || typeof state.looked !== 'boolean') return false
  // Boolean(), not the bare expression: `undefined && …` is undefined, and a
  // predicate that answers undefined is one a caller can read as either.
  return Boolean(state.looked === false || (state.ci && typeof state.ci === 'object'))
}

export function cached(maxAgeSeconds, { read, write, now = Date.now, gather = collect }) {
  const at = now()
  const previous = read()
  if (usableCache(previous, at) && (at - previous.at) / 1000 < maxAgeSeconds) {
    // Floored at 1: a sub-second age rounded to 0 hid the suffix entirely, so an
    // answer that came from cache was indistinguishable from one just taken.
    return { state: previous.state, ageSeconds: Math.max(1, Math.round((at - previous.at) / 1000)), fromCache: true }
  }
  const state = gather()
  write({ at, state })
  return { state, ageSeconds: 0, fromCache: false }
}

function main(argv = process.argv.slice(2)) {
  const brief = argv.includes('--brief')
  const at = argv.indexOf('--cached')
  // ONE budget for the whole collection, on every path. The first SessionStart
  // ran this uncached with two 15s gh calls in series, and a cold start hung the
  // session for as long as gh took — the reporter noticed on macOS. A slow gh is
  // COULD NOT LOOK, which is honest; a hang before the first prompt is not.
  if (at < 0) {
    process.stdout.write(`${render(collect(budgeted(BUDGET_MS)), { brief })}\n`)
    return 0
  }
  const home = gitDir()
  // No `.git`, no cache. Never a fallback directory — see `gitDir`.
  const store = home ? join(home, 'qh-branch-state.json') : null
  const { state, fromCache, ageSeconds } = cached(Number(argv[at + 1]) || 120, {
    read: () => { if (!store) return null; try { return JSON.parse(readFileSync(store, 'utf8')) } catch { return null } },
    write: payload => { if (!store) return; try { writeFileSync(store, JSON.stringify(payload)) } catch { /* a cache that cannot be written is not a failure */ } },
    gather: () => collect(budgeted(BUDGET_MS)),
  })
  process.stdout.write(`${render(state, { brief })}${fromCache ? ` (read ${ageSeconds}s ago)` : ''}\n`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main())
}
