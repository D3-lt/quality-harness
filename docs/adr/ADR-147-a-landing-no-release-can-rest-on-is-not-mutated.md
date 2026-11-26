# ADR-147: A landing no release can rest on does not run the mutation campaign

**Status:** Accepted
**Date:** 2026-11-25
**Owner:** Zy
**Spec:** None — no spec stage; the inputs are the owner's decisions of 2026-11-25 ("if we do not touch files - then we do not re-test"; verdict reuse first, the pin cut after the next release) and the measurements in Context
**Cross-references:** docs/adr/ADR-023-a-measured-verdict-may-be-reused.md, docs/adr/ADR-118-main-lands-only-a-sha-ci-passed.md, docs/adr/ADR-126-one-run-per-release.md, docs/adr/ADR-146-a-pin-landing-is-not-re-mutated.md, .github/workflows/selftest.yml, scripts/landing-class.mjs, scripts/release.mjs, scripts/release-evidence.mjs, docs/BACKLOG.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks; T1 and T2 each add catalogue mutants that remove one mechanism the decision rests on
**Invalidates:** ADR-126 — Decision 1, the sentence "Every `land/**` push runs the full campaign": only a landing of a version not yet released does. ADR-146 — its second follow-up (verdict reuse across landings) is answered here: not built, on the measurement in Context; its Decision stands. CLAUDE.md §13 step 3 and §18 are reworded by T1
**Served-path change:** None — this ADR changes only CI and repository tooling; nothing under `plugin/` or `core/` changes, so nothing an adopter's session runs changes

## Context

Since ADR-126 every landing runs the whole mutation catalogue uncached. ADR-146 took the catalogue pin out. The shards
of run 45577953537 (2026-11-25, 340710727) took 22,021 seconds over forty-eight jobs, 367 runner-minutes, of which
20,919 seconds were the campaign step itself.

**Who reads the campaign.** Nobody on a landing: main's ruleset requires nine checks and no shard, so main takes a sha
whose shards failed (c0c7eaeb2 landed on 2026-10-27 with two failed shards and every other job green). The one reader is
`release-evidence`, at the sha a release is cut from: it requires every job of that sha's landing run to have concluded
`success` and every declared job to be listed, so a skipped or absent shard already refuses the release (ADR-146 T2's
test `a run whose shards were skipped or are absent is not a release run`).

**Which landings a release can rest on.** `release.mjs` tags `v<version>` of plugin/.claude-plugin/plugin.json at the
landed sha, and refuses a version whose tag already exists (scripts/release.mjs:134-143: released already, or "bump
past it"). So a landing whose plugin version is already tagged on the forge cannot be the sha of a release the command
cuts.

**How many landings that is.** Measured 2026-11-25 over the hundred `land/<sha>` runs from 2026-10-22 to 2026-11-25
(`gh run list --workflow selftest.yml --event push`, each sha's plugin version from `git show`, each tag's time from
`gh release list`): fifty-two were of a version not yet released, forty-eight of a version already released. Of those
forty-eight, nine changed only `.claude-plugin/marketplace.json`, the pin ADR-146 now skips, and their shards ran 3,343
runner-minutes; the other thirty-nine (records, attestations, and repository tooling such as ADR-146's own landing)
ran 14,200, summed from each shard's `started_at` and `completed_at`, failed and cancelled runs at what they ran.
Main required none of it, and no release was cut from those runs.

The split takes each release's publication time as the time its tag appeared, and the minutes are what those shards
ran, not a saving anyone has observed yet.

**What those forty-eight campaigns found.** Two of them had a failed shard (91afb9268 and c0c7eaeb2, 2026-10-27): the
mutants `ADR-120 T9: a commit has no code tree` and `qh-check: a green go test with one testless package is work, not
zero work (§273)` were not noticed. The next landing of an unreleased version, 333e657a1, reported both again. Every
other failed shard in the period was on a landing of an unreleased version (333e657a1, 539b4076a, 2ca24f018, bb2476929,
69374807a, 5c22b9bb8; logs read with `gh run view --job <id> --log`). 580787047, earlier on 2026-10-22, ran cached
before ADR-126 and is not among the hundred.

**Why not reuse verdicts instead.** That was the plan (ADR-146, Alternatives and Follow-ups): keep ADR-023's content key
(the edit, the mutated file, its test files) and re-measure only entries whose key changed. Two measurements stopped it.

- The key misses an input. Each non-RED verdict of those failed shards, and of 580787047's, was compared with main's tip at the time, by
  recomputing every entry's key at both commits from `git ls-tree -r` blob ids. Of ninety-two, seventy-nine were at
  bb2476929; eleven of those (two GREEN, nine UNPROVEN) had the very key they had at main's tip 2a0d6c10e, whose full
  campaign was green. A run holding a cached RED under that key, with its killing test still listed, would have printed
  them RED. Why is not traced. One of them, `ADR-117 T1: an output
  redirection keeps its target`, mutates plugin/scripts/shell-words.mjs and is killed by tests/ledger-writes.test.mjs;
  neither file changed in that range, which includes b504ac077, "run lifecycle hooks through the verified Go core".
  This is a counterfactual: no reused run printed those lines, so ADR-023's registered count stays unmeasured
  (docs/BACKLOG.md §476).
- Nothing stores a verdict a landing could read. A land run passes `--no-cache`, which also writes none
  (scripts/mutate.mjs:1793, :1882); a cache saved on one `land/<sha>` ref is not offered to another, and nothing runs on
  main. `gh cache list --key mutation-cache` on 2026-11-25 listed one cache, on a pull-request ref.

Where a key change was all that mattered, the same history says how little a landing of a released version changes:
over the forty-nine successful landings from 179c0d561 to 340710727, the fourteen that were neither a bump nor a pin
changed between 0 and 139 of about 3,500 keys, six of them none.

## Existing Primitives Audit

| Primitive | Where | Fit |
|-----------|-------|-----|
| The seed job's `skip` output, read by `mutations` and `mutation cache` | .github/workflows/selftest.yml:194-246, :395 | Reused unchanged: one more positive answer writes the same `skip=1` |
| `landingClass` and its CLI | scripts/landing-class.mjs:102-148 | Extended: a second way to answer "skip", checked after the event, the ref and the head |
| `evaluateRun`'s strict success and the declared-job check | scripts/release-evidence.mjs:81-91, :851-861 | Reused unchanged: they are what keeps a release off a run without a campaign |
| `release.mjs`'s refusal of a version whose tag exists | scripts/release.mjs:134-143 | Reused unchanged: it is why a tagged version marks a landing no release rests on |
| ADR-023's verdict cache | scripts/mutate.mjs:819-848 | Not used: its key misses an input (Context) |

## Decision

1. **A landing whose plugin version is already tagged on the forge runs no mutation campaign.** After the checks ADR-146
   already makes of the event (`push`), the ref (`refs/heads/land/<sha>`) and the commit checked out (that sha),
   `node scripts/landing-class.mjs` answers "skip" when both of these hold:
   - `git cat-file blob HEAD:plugin/.claude-plugin/plugin.json` is strict UTF-8 JSON whose `version` is a string of
     three dot-separated runs of digits;
   - `git ls-remote origin refs/tags/v<that version>` exits 0 and one of the lines it prints is a full object id, a
     tab, and exactly `refs/tags/v<that version>`. Tried on 2026-11-25 with git 2.56.1 against a scratch remote: the
     command also prints a branch whose name ends in that text, prints one line for an annotated tag and none for a
     longer version, and prints nothing with exit 0 when the tag is absent. So other lines are ignored, and only the
     tag's own name counts.
   Otherwise it goes on to ADR-146's pin check, unchanged, and answers what that answers. A command that failed or timed
   out, output that ended early, a version of another shape, a ref that only ends alike, and any state not named here
   are not this answer. *This fails if* any input not described here yields "skip" by this rule.
2. **Safety does not rest on that rule.** It rests on `release-evidence` refusing the run it selects when a shard of it
   was skipped or is absent, which is unchanged and tested, and on the release being published at the sha that run
   cleared (Decision 6). The guarantee is per run, not per sha: a later run at the same sha that measured every mutant
   (a re-run after the tag is gone, a dispatch) clears it, as it would today. The rule only decides which landings pay
   for a campaign. If it answers "skip" for a sha someone then tries to release, and that skipped run is the one
   `release-evidence` selects, the release is refused, and the remedy
   is the one `release.mjs` names: bump the version. The row that must still run: a version with no tag on the forge
   when the seed job asks, which is the ordinary release candidate from the commit that bumps it to the commit tagged.
3. **The workflow's conditions do not change.** The seed job's last step runs the same command and the same `skip`
   output gates the same two jobs; only comments are reworded. Every required job runs on every landing as it does today.
4. **Verdicts are not reused across landings.** ADR-023's cache stays what it is today, a pull-request and local
   convenience; no landing reuses a cached verdict or writes one. A shard still reads cached timings to plan its slice.
5. **What is given up is early notice, and it is counted.** A mutant that stops being noticed in a landing of a released
   version is measured again by the next landing of an unreleased version, before any tag, where it costs a second landing.
   Two of forty-eight such landings in five weeks had one, and the next candidate reported both. T3 reads the first skipped landing and the first
   release after it; the follow-up counts the releases delayed this way.
6. **A release's tag is made by the release command, at the sha its evidence cleared.** Found by the cold review of this
   record: `release.mjs` checks the tag at its start and ends with `gh release create <tag> --target <sha>`
   (scripts/release.mjs:126-143, :272), and the forge ignores that target when the tag already exists. A tag made at
   another commit at any time in between, which is the whole landing and its run, would be published as the release,
   and this record raises the number of commits on main whose own landing measured no mutant. T2: once the evidence
   answered SUCCESS and the assets verified, the command pushes the tag itself at that sha, with a push that creates
   the ref or is refused and never moves one, and then creates the release with `--verify-tag`. It keeps
   `--target <sha>`: the forge ignores it for a tag that exists and makes a tag deleted in between at that sha, not at
   main's tip, and the test ADR-100 T3 locked reads it. A tag without a release resumes only when the forge shows it at
   that same sha, and the message for any other no longer offers releasing it by hand.
   **What stays open** (found by the verification review): the seconds from that push to the creation. A tag
   force-moved, or deleted and made again elsewhere, in that window is published where it then points. Nothing a client
   does closes it; a forge rule that refuses updates and deletions of `v*` tags does, and that is the owner's to add
   (Follow-ups). *This fails if* the command creates a release in a run in which its own push of the tag at the cleared
   sha did not exit 0.

**What this does not claim.** It does not claim that a landing of a released version cannot change a verdict; records,
tests and tooling land that way and can. It claims nobody reads those verdicts until a release, and the release's own
landing measures every mutant.

## Alternatives Considered

- **Reuse ADR-023's verdicts across landings** (the plan the owner chose on 2026-11-25, before this measurement).
  Rejected: the key misses an input, measured at bb2476929 (Context), so a reused RED is not a measurement. Making it
  sound needs every file a test can reach in the key, which nobody has enumerated. It also needs three new mechanisms
  (verdicts written by a `--no-cache` run, an artifact published by the merge, a fetch across runs bound to main's tip)
  and a refusal in `release-evidence` for a partly reused run, whose jobs would all conclude `success`. The fixed cost
  of forty-eight shards that measure nothing would remain: 1,102 seconds of the 22,021 are not the campaign step, and
  the forge bills each job by the started minute.
- **On a landing of a released version, measure the entries whose own lines or keys changed, in one job.** It keeps the
  early notice this record gives up. Not taken now: two of forty-eight landings would have used it, it adds a selection
  mode and a job, and the key's blind spot applies to it as well. It is the follow-up if the count in Decision 5 says so.
- **Skip the campaign only when a landing changes no file a mutant or its tests can read.** Rejected: the campaign reads
  the live backlog through two `backlog-record-sweep` mutants and which tests read `docs/adr/` is not enumerated
  (docs/BACKLOG.md §475 item 4), so no path list is known to be safe, and a list over paths is a classifier over an
  open input (CLAUDE.md §16).
- **Let `land.mjs` or `release.mjs` say which landing is a release**, with another branch name or a marker commit.
  Rejected: the shipped branch-state reader matches `land/<sha>` exactly (ADR-146, Alternatives), and a marker somebody
  forgets fails toward a release without a campaign unless `release-evidence` refuses it anyway, which is the mechanism
  this record already rests on.
- **Leave every landing of a version not yet released cached too.** Rejected: ADR-023 rule 1 and ADR-126 stand, a
  release rests on a campaign that measured every mutant at its own sha.

## Component / Boundary Impact

None — one repository script gains a second answer; the plugin, the core and their boundaries are unchanged.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `scripts/landing-class.mjs` (`landingClass(facts)` reads two more facts, `version` and `tags`; new `readRelease(cwd)`; the CLI passes both) | extended; its `skip=<0 or 1>` line is unchanged | T1 | the seed job; tests |
| .github/workflows/selftest.yml | comments at :197-198, :244-245, :354-356 and :383 reworded; no key, condition or step changes | T1 | a reader |
| `scripts/release-evidence.mjs` | behaviour unchanged; the comment at :94-96 reworded | T1 | a reader |
| `scripts/release.mjs` | the tag is pushed at the cleared sha before `gh release create --verify-tag`; a tag without a release resumes only at that sha; the message at :142 changes; the comment at :217 reworded | T2 | every release |
| CLAUDE.md §13 step 3, step 7 and §18; .claude/rules/13-releasing.md; docs/architecture.md's release step 7 | reworded: a land push runs the full campaign when its plugin version is not yet released; the command makes the tag | T1, T2 | sessions |
| tests/mutations/scripts/landing-class.mjs.json, tests/mutations/scripts/release.mjs.json | new entries | T1, T2 | `scripts/mutate.mjs` |
| docs/BACKLOG.md §475 item 4 | closed by T3 with the measured figure | T3 | a reader |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `the released-version answer` of `scripts/landing-class.mjs` | T1 | T3 | No — the output line is unchanged |
| `the tag made at the cleared sha` by `scripts/release.mjs` | T2 | T3 | No — the release's tag and assets are what they were |

## Implementation

See docs/adr/ADR-147-a-landing-no-release-can-rest-on-is-not-mutated/tasks/README.md.

## Consequences

- A landing of records, tests or repository tooling after a release runs every job but the campaign's. On run
  45577953537 those jobs took 95 of its 462 runner-minutes (462 less the shards' 367). Over the five weeks measured, such landings other than pins
  ran 14,200 runner-minutes of shards; T3 reads what a skipped landing really costs.
- The saving depends on when the version is bumped: every landing from the bump to the tag runs the campaign, and
  fifty-two of the hundred landings measured were such landings.
- A release candidate's landing is unchanged: every shard, every mutant, uncached.
- The landing that carries T1 is itself of a released version, so it is the first to skip and its new mutants are first
  measured on the forge by the next release's landing. Each is run here before it lands (`adr-verify --mutant`).
- Main can hold commits whose own landing measured no mutant, until the next release's landing measures all of them.
- A mutant that stops being noticed between releases is found at the release's landing, not at its own.
- ADR-146's pin check no longer decides any real landing, since a pin follows its tag; it stays because the planned cut
  of a pin landing's required jobs needs an exact pin check (Out of Scope). A pin's seed job now prints the
  tagged-version reason, so ADR-146 T3 records which rule answered when it reads its pin landing.
- The release command pushes a tag itself; a forge that refuses that push stops the release before anything is published.

## Out of Scope

- Skipping or shortening a required job on a pin landing (deferred: docs/BACKLOG.md §475).
- Measuring changed entries on a landing of a released version (deferred: docs/BACKLOG.md §476).
- Whether ADR-023's cache should still serve pull requests, given its key (deferred: docs/BACKLOG.md §476).
- The dispatch path's two defects (deferred: docs/BACKLOG.md §475).
- Pull-request and dispatched runs (permanent: boundary: on those events the script answers "run", and their campaign rule is ADR-023's and ADR-126's).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The forge evaluates the job condition otherwise than its documentation says; no real skip has been observed yet | Med | Med | T3 reads the first skipped landing, which is T1's own; a release refuses a skipped or absent shard whatever skipped it, and `land.mjs` stops on a required check that did not succeed |
| A tag is pushed before its candidate lands, so the candidate's landing skips and the release is refused | Low | Low | The remedy is a bump and one more landing; `release.mjs` creates the tag only after the evidence |
| The tag push of T2 is refused or behaves otherwise on the forge, and the next release stops at its last step | Low | Med | Nothing is published; T3 reads the next release, and T2's revert restores the old publication |
| A tag is moved on the forge between the command's push and its creation of the release | Low | High | Named in Decision 6: the window is seconds and needs a forced push by someone who may write; a forge rule on `v*` tags closes it (Follow-ups) |
| A mutant weakened between releases delays the release by one landing | Med | Med | Counted (Decision 5, Follow-ups); the changed-entries job is the remedy if the count says so |
| `git ls-remote` prints a tag otherwise than Decision 1 describes | Low | Low | The answer is then "run": the cost returns, nothing is skipped wrongly; T1 reads a lightweight and an annotated tag from a real remote |

## Rollback

Revert T1's commit: the script loses the second answer and every landing but a pin runs the campaign again. The revert's
own landing runs the campaign. Revert T2's commit separately: the release is published as before. Nothing persistent
was written by T1. A tag T2's push left on the forge without a release outlives a revert: the command run again at that
sha resumes it, or the owner deletes it.

## Follow-ups

- [ ] After the next ten releases, count those whose landing failed on a mutant that a skipped landing since the previous release changed. If more than two, build the changed-entries job (Alternatives).
- [x] Decide what ADR-023's cache is for now that its key is measured unsound (docs/BACKLOG.md §476). Decided 2026-11-26 by the owner: it stays for pull-request and local runs, and its summary line says what the key holds and that no release rests on a reused verdict.
- [x] Decide whether the forge refuses updates and deletions of `v*` tags, with a ruleset beside main's: it is what closes the window Decision 6 leaves open. Decided 2026-11-26 by the owner: yes. Ruleset 28186453, committed as `.github/rulesets/tags.json`, after the same two rules on a throwaway tag pattern let a tag be created and pushed again at the same commit, and refused a forced move and a deletion. A mistaken release tag is now removed only by disabling that ruleset.
  `node scripts/land.mjs --dry-run` compares the committed tag and main rulesets with the forge. A difference in the release tag pattern, bypass actors or rules fails this check.
