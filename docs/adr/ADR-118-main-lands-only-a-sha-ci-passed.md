# ADR-118: Main lands only a sha CI has already passed

**Status:** Accepted
**Date:** 2026-10-20
**Owner:** Zy
**Spec:** None — no spec stage; the owner, 2026-10-20, choosing "No bypass, change release" for the ruleset on `main`
**Cross-references:** docs/adr/ADR-061-an-unchecked-publish-is-refused.md, docs/adr/ADR-066-git-refuses-an-unchecked-publish.md, docs/adr/ADR-100-a-repeated-procedure-is-one-command.md, docs/adr/ADR-115-a-release-judges-the-load-the-run-did-not-bring.md, docs/adr/ADR-117-the-evidence-is-written-only-by-its-tools.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks
**Invalidates:** ADR-100 — T3's release command pushes `main` directly; under this record it lands the sha through `land/<sha>` first. T3's locked test bodies are unchanged: only their helpers (`world()`, `push()`) answer the new commands.
**Served-path change:** None — this ADR changes only this repository's own landing and release path (`scripts/`, `.github/`); nothing in `plugin/` changes

## Context

ADR-117 left one door at the forge: `--no-verify` skips git's pre-push hook, and the text refusal reads only the command
it is shown, so a scripted `git push --no-verify` reaches `main` with nothing run (`scripts/side-doors.json`,
`push-no-verify-from-a-script`, status `boundary`). `release-evidence` reads `main`'s rules live and said on 2026-10-20:
"main's rules require no status check". `gh api repos/D3-lt/quality-harness/rulesets` answered `[]` the same day.

A ruleset that requires status checks closes it, and changes how anything lands. GitHub documents that once required
checks pass, "any commits must either be pushed to another branch and then merged or pushed directly to the protected
branch" (the protected-branches page). So a sha with no passing checks is refused at `main`, whoever pushes it. Every
push to `main` must first run CI on another ref. That includes `scripts/release.mjs:137`, the only place in this
repository that spawns a push. The class, enumerated 2026-10-20 with
`mrw read --grep "\['push'|'push', 'origin'|git push origin" scripts/ plugin/scripts/ plugin/bin/ plugin/lib/ core/ CLAUDE.md .claude/rules/`:
one spawn (`scripts/release.mjs:137`) and two mentions inside classifier comments, which push nothing.

The owner chose "No bypass, change release" on 2026-10-20. The rejected option was an admin bypass: agent sessions
push with the owner's credentials, so the door would stay open for every session here.

What it costs, measured 2026-10-19 on the push run 39294734276 at 81571b37: `coverage floor` ran 47 min
(17:30:45 to 18:18:03), `windows` 28 min, `selftest (macos-latest)` 18 min, `selftest (ubuntu-latest)` 10 min, and each
`go core` and `plugin validate` job under 2 min. The slowest required job sets how long a landing waits.

What a required check proves has a limit. GitHub counts `success`, `skipped` and `neutral` as passing, and "the job
reports Success" when a conditional skips it (the troubleshooting page for required status checks). The forge also
runs the workflow the pushed sha carries. So a sha that edits `.github/workflows/selftest.yml` to skip a required job
satisfies the ruleset without any test having run. The ruleset closes the scripted `--no-verify` push of an unchanged
workflow. A workflow edited to skip is a reviewed change (CLAUDE.md §12), not something the forge can refuse.

## Existing Primitives Audit

- `mainProtection` (`scripts/release-evidence.mjs:234`) already reads `main`'s rules with pagination, and says
  could-not-look for an answer it cannot read. Reused: it gains the list of required contexts it already computes.
- `declaredJobs` (`scripts/release-evidence.mjs:480`) expands the workflow's job names over their matrix. Reused, to
  refuse a required context that no declared job produces.
- `release()` (`scripts/release.mjs:39`) has seams for exec and the clock, plus a bounded `waitFor` with exit 3.
  `land()` follows the same shape, and `release()` calls it in place of its bare push.
- ADR-066's pre-push hook still runs on every push `land` makes, so the full check is still asked for before anything
  leaves the machine.

## Decision

1. **A ruleset on `main`, with no bypass actors** (`.github/rulesets/main.json`, committed and reviewed like code).
   It blocks deletion and non-fast-forward, and requires these checks from GitHub Actions (integration 15368):
   `selftest (ubuntu-latest)`, `selftest (macos-latest)`, `windows`, `coverage floor`, `plugin validate`, and
   `go core` on ubuntu, macos and windows. The mutation shards are not required: they reuse a cache, and the release
   still rests on its dispatched campaign (CLAUDE.md §13). Including `coverage floor` puts the wait at about 47 min
   per landing, against 28 min without it (measured above). Accepting this record accepts that wait. If the owner
   would rather have the shorter one, `coverage floor` is struck from the list before T2 applies it.
2. **Everything lands through `node scripts/land.mjs`.** It captures HEAD's full sha once, and refuses to start unless
   the current branch is `main` and local `main` is that sha.
   - **What is required:** read from the forge, never from a second list, with each context's integration id kept.
     It refuses a context that is not a job declared by the workflow at the sha, since that check could never arrive.
   - **The landing:** it pushes the sha to `land/<sha>`. When every required context has passed, it checks again
     that local `main` is still the captured sha and runs `git push origin main`. It then reads `refs/heads/main` on
     the forge back and requires the captured sha, and deletes `land/<sha>`.
   - **Selecting a check-run:** every check-run at the sha is read (`filter=all`, every page). Only those whose name
     is the context and whose app id is the required integration count. The newest of them, by `started_at` and then
     id, decides: not completed is a wait, `success` is a pass, and anything else stops the landing (exit 1, named).
     `land` is stricter than the forge on purpose: a `skipped` or `neutral` required job stops it.
   - **When the forge cannot answer:** a forge it cannot read pushes nothing and says could-not-look. Only a rule list
     that reads empty is pushed straight to `main`, and that is said. The deadline exits 3, and a re-run resumes from
     what the forge shows.
3. **`release.mjs` lands rather than pushes.** Step 2's push is `land`. The dispatch is created after a push run on
   `main` exists (BACKLOG §159). An existing dispatch is reused only when it ran on `main` and is newer than that push
   run. A dispatch from before the landing is never reused, because release-evidence would read the newer push and
   answer CACHED.
4. **The workflow runs on `land/**` pushes as well as `main`.** The concurrency group already keys on the ref
   (`.github/workflows/selftest.yml:19-21`), so each landing has its own group.
5. **Order: the path first, then the rule.** T1 lands by plain push while no ruleset exists. T2 applies the ruleset
   and reads back the applied ruleset whole: enforcement, target, conditions, rules with their integration ids, and
   an empty bypass list. It then observes a scripted `--no-verify` push of an empty child of `main` being refused for
   a missing required check, with `main` unmoved. Last, T2 lands its own evidence commit through `land`.
6. **The trusted-workflow boundary is named, not claimed closed.** A sha whose workflow skips a required job passes
   the forge (Context). `scripts/side-doors.json` records it as a `boundary` that closes at review (CLAUDE.md §12).

What would make this fail: a refused probe push that lands anyway, or a landing whose checks passed and still cannot
fast-forward `main`. T2 observes both on the live forge. The premise is valid for this repository on GitHub with this
workflow, and for no other configuration.

## Alternatives Considered

- **Admin bypass:** release stays as it is. Rejected by the owner, 2026-10-20: sessions push as an admin, so the door
  stays open for exactly the actor it exists for, while `release-evidence` would say "protected".
- **Pull request plus auto-merge, or a merge queue:** both put a different sha on `main`, which breaks every record,
  verification row and attestation that cites a sha (ADR-070, ADR-100). Rejected.
- **`land/**` as the only push trigger:** it avoids running CI twice per landing. Rejected: `branch-state` lists
  `main`'s runs by branch (`plugin/scripts/branch-state.mjs:244`), so `main`'s CI brief would go blank between
  releases.
- **A second required-check list in `land.mjs`:** it drifts from the forge. Rejected: the forge is read.

## Component / Boundary Impact

`scripts/land.mjs` is new and owns one question: has this sha passed the forge's required checks, and is it on `main`
yet. `scripts/release.mjs` delegates its push to it. `.github/rulesets/main.json` is the reviewed source of the forge
rule. Nothing in `plugin/` or `core/` changes.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `node scripts/land.mjs [--wait-max <min>] [--dry-run]` | new command; exits 0 landed, 1 failed, 2 needs an action, 3 deadline | T1 | agents, `release.mjs`, T2's fence |
| `mainProtection()` result | gains `checks`, each required context with its integration id | T1 | `land.mjs` |
| `.github/workflows/selftest.yml` `on.push.branches` | adds `land/**` | T1 | GitHub Actions |
| `.github/rulesets/main.json` | new, applied to the forge | T1 (file), T2 (applied) | GitHub |
| CLAUDE.md §2, §13 steps 2–3 | land, not push | T1 | every session |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `land.mjs` and its `--dry-run` | T1 | T2 | No — new |
| `.github/rulesets/main.json` | T1 | T2 | No — new |

## Implementation

See `tasks/README.md`: T1 (the landing path), then T2 (the ruleset applied and observed).

## Consequences

- **Positive:** no sha reaches `main` until each required check has reported a passing conclusion at it, whoever
  pushes and however. ADR-117's scripted `--no-verify` door closes at the forge, for a workflow left unchanged.
- **Negative:** every landing waits for the slowest required job, about 47 min (measured 2026-10-19), and CI runs twice
  per landing (`land/<sha>`, then `main`). Runner minutes are free for a public repository; wall-clock is not. An agent
  that pushes `main` directly is now refused by the forge rather than by a hook.
- **Neutral:** `release-evidence` will say "protected" with the contexts it reads.

## Out of Scope

- Rulesets for other branches or for tags (permanent: boundary: only `main` is released from, and tags are made by `gh release create` after release-evidence)
- Requiring the mutation shards (permanent: boundary: the release rests on its dispatched campaign, CLAUDE.md §13)
- A merge queue (permanent: boundary: it rewrites the sha, see Alternatives)
- A sha whose own workflow edit skips a required job (permanent: fact: GitHub counts `success`, `skipped` and `neutral` as passing a required check; citation: url https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Ruleset semantics differ from the documented branch-protection behaviour | Low | High: `main` refuses every landing | T2 observes a landing and a refusal live; Rollback is one call |
| A job is renamed and its required context never arrives | Med | High: nothing lands | `land` refuses a required context the workflow does not declare, before pushing |
| A required job is skipped by a workflow edit and the forge accepts it | Low | High: a sha lands untested | `land` stops on anything but `success`; the edit is a reviewed change (§12); named as a boundary door |
| Local `main` moves during a landing's wait | Med | High: another commit pushed | `land` compares local `main` with the captured sha before the push, and the forge's `main` after it |
| A landing waits past the agent's tool timeout | High | Low | bounded wait, exit 3, re-run resumes from the sha's check-runs |
| `land/<sha>` branches pile up | Low | Low | `land` deletes its branch once `main` moves, and says a failed delete |

## Rollback

Delete the ruleset: `gh api -X DELETE repos/{owner}/{repo}/rulesets/<id>`. An admin can always change settings, since
`bypass_actors` governs pushes, not administration. `land.mjs` keeps working without a ruleset: an empty rule list pushes
straight to `main` and says so. Reverting T1 restores the bare push.

## Follow-ups

- [x] After T2: move `push-no-verify-from-a-script` in `scripts/side-doors.json` to name the live ruleset by id (done 2026-10-20: ruleset 25462988)
- [x] 2026-10-20: T2 applied the ruleset as id 25462988 (`gh api -X POST repos/{owner}/{repo}/rulesets --input .github/rulesets/main.json`); `land --dry-run` read it back equal; an unchecked child of main was rejected with GH013, "8 of 8 required status checks are expected", and main did not move
- [x] 2026-10-20: the cold Codex review of this draft (REQUEST CHANGES, six findings) was taken into Decisions 2, 3, 5 and 6 and into the tasks before acceptance
- [x] 2026-10-20: the Codex review of 81571b37..7782862e (REQUEST CHANGES, two findings): `land` pushes `<sha>:refs/heads/main`, not `git push origin main`, which resolves the local branch when it runs (Decision 2's "runs `git push origin main`" is superseded by this line); and a dispatch tied with main's push run is reused, as release-evidence reads a tie
