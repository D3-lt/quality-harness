# Task ADR-118-T1: Everything lands through land/<sha> once the forge's required checks pass

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `land.mjs` and its `--dry-run`; `.github/rulesets/main.json`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`node scripts/land.mjs` lands HEAD on `main` only after the forge's required checks passed at that sha on `land/<sha>`,
and `release.mjs` lands rather than pushes (ADR-118, Decisions 2–4).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/land.test.mjs` | add | the task's tests, each with the twin that must fail |
| `scripts/land.mjs` | add | `land()` with exec and clock seams, plus the CLI and `--dry-run` |
| `scripts/release-evidence.mjs` | edit | `mainProtection` returns `checks`, the required contexts it already reads |
| `scripts/release.mjs` | edit | step 2 calls `land`; the dispatch comes after a push run on `main`, and an older or off-`main` dispatch is not reused |
| `scripts/side-doors.json` | edit | the `workflow-edited-to-skip` door, a `boundary` that closes at review (§12) |
| `tests/release.test.mjs` | edit | the `world()` and `push()` helpers answer the new commands; one new test beside the locked ones, whose bodies stay byte-identical |
| `.github/workflows/selftest.yml` | edit | `on.push.branches` adds `land/**` (this is what selects the landing run) |
| `.github/rulesets/main.json` | add | the reviewed ruleset T2 applies |
| `tests/mutations/scripts/land.mjs.json`, `tests/mutations/scripts/release.mjs.json` | add, edit | catalogue entries; the push-run entry repointed at its new line |
| `CLAUDE.md`, `.claude/rules/13-releasing.md` | edit | §2 names `land.mjs`; §13 steps 2–3 say land, with their numbers kept |

## Ordered Steps

1. [S1] Write the failing tests in `tests/land.test.mjs`, and the new release test, against a fake git and gh. Record the red run.
2. [S2] Add `land()`, following ADR-118 Decision 2 point by point. It refuses to start off `main` or with local `main` unlike HEAD (exit 2). An unreadable forge pushes nothing (could-not-look, exit 1), and an undeclared required context is refused before any push. Check-runs are read with `filter=all` over every page and kept by name and integration id; the newest by `started_at` and then id decides (incomplete: wait; `success`: pass; anything else, `skipped` and `neutral` included: exit 1). Local `main` is compared with the sha again before `git push origin main`, and the forge's `main` after it; then `land/<sha>` is deleted. An empty rule list pushes straight to `main` and says so. The deadline exits 3, and a re-run resumes.
3. [S3] `release.mjs` calls `land` in place of its bare push. It creates the dispatch after a push run whose `headBranch` is `main` exists, and reuses a dispatch only when it ran on `main` and is newer than that push run. The workflow trigger adds `land/**`. Commit `.github/rulesets/main.json`, with a test that each required context in it is a declared job, and add the boundary door to `scripts/side-doors.json`.
4. [S4] Edit CLAUDE.md §2 and §13 steps 2–3, and the rules file. [proof: human: the owner reads the §13 text against `land.mjs`]
5. [S5] Record a killed mutant per decision point: forge unreadable, undeclared context, failed check, the wait, the order of the main push after the checks, and the `headBranch` filter. Add a catalogue entry for each. [proof: mutation]

## Acceptance

```bash
node --test tests/land.test.mjs tests/release.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `land pushes main only after every required check passed at the sha on land/<sha>` | `tests/land.test.mjs` | order of pushes, the wait, the branch deleted; a failed check stops before main | — | S1, S2 |
| `land pushes nothing when the forge cannot be read or requires a check no job declares` | `tests/land.test.mjs` | could-not-look and the undeclared context, each exit 1 with no push | — | S1, S2 |
| `land picks the newest check-run of the required app for each context, over every page` | `tests/land.test.mjs` | cancelled then re-run passes; a partial re-run; a newer failure after an older success stops; a foreign app's run of the same name is ignored; a required run on a later page is found; `skipped` and `neutral` stop | — | S1, S2 |
| `land refuses off main or when main moved, and requires the forge's main to be the sha after the push` | `tests/land.test.mjs` | a branch other than `main`, local `main` moved during the wait, and a no-op push that leaves the forge elsewhere | — | S1, S2 |
| `land says an unprotected main and pushes it directly, and a wait past its deadline exits 3` | `tests/land.test.mjs` | the empty rule list, the deadline, and the resume | — | S1, S2 |
| `the committed ruleset requires only jobs the workflow declares` | `tests/land.test.mjs` | `.github/rulesets/main.json` against `declaredJobs` of the workflow, with a planted undeclared name failing | — | S3 |
| `release lands the sha and dispatches only after the push run on main exists` | `tests/release.test.mjs` | release goes through land; a `land/<sha>` push run alone does not release the dispatch; a dispatch older than main's push run, or not on `main`, is not reused | — | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `tests/land.test.mjs` |
| 2 — something selects it | `release.mjs` calls `land`, and the mutant that restores the bare push |
| 3 — the caller can discover it | CLAUDE.md §2 and §13, and `land.mjs --help` |
| 4 — it is used | every landing on `main` once T2 applies the ruleset |

## Mutation Log

## Invariants

- The final push stays the literal `git push origin main`, run only while local `main` is the captured sha; the forge's `main` is read back as that sha (no rewrite).
- Nothing leaves the machine before ADR-066's pre-push hook has seen a passed full check.
- Gates advise and the sanctioned refusals are unchanged (CLAUDE.md §3): `land` is a command, not a hook.

## Risks

- The forge read and the check-run read are network; both are bounded, and could-not-look is said.

## Stop Condition

Stop if a check-run at a sha cannot be told apart by name and app, since the wait would then rest on a guess.

## Out of Scope

- Applying the ruleset (deferred: docs/adr/ADR-118-main-lands-only-a-sha-ci-passed/tasks/T2-ruleset-applied.md)

## Verification Log
