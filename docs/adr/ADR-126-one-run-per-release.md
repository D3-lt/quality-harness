# ADR-126: A release is one landing and one CI run, and a test sets every budget it depends on

**Status:** Accepted
**Date:** 2026-10-22
**Owner:** Zy
**Spec:** None — no spec stage; the owner's instruction of 2026-10-22, "review this whole CI from the grounds up", then "GO, and redesign CI as proposed"
**Cross-references:** docs/adr/ADR-023-a-measured-verdict-may-be-reused.md, docs/adr/ADR-100-a-repeated-procedure-is-one-command.md, docs/adr/ADR-118-main-lands-only-a-sha-ci-passed.md, docs/BACKLOG.md §405, §406, §407
**Governs:** `.github/workflows/selftest.yml`, `.github/rulesets/main.json`, `scripts/release.mjs`, `scripts/land.mjs`, `scripts/release-evidence.mjs`, `scripts/coverage.sh`, `scripts/selftest.sh`
**Enforced-by:** None — declared by its tasks; each adds a test and a campaign mutation.
**Invalidates:** ADR-118, narrowly: its push trigger on `main` (`.github/workflows/selftest.yml:9`) is dropped, since main only ever takes a sha that already passed on `land/<sha>`. ADR-100, narrowly: step 3's dispatched campaign becomes the landing's own run, and the outside-run question moves after the landing. ADR-023 rule 1 stands (a release rests on a full campaign); a `land/**` push is now one.
**Served-path change:** `node scripts/release.mjs` lands a bumped candidate once, waits for every job of that landing's run, then asks for the outside runs and tags; it dispatches nothing.

## Context

Measured 2026-10-22 over the workflow's runs since 2026-10-15 (16 failed runs, 29 failed jobs, every log read):

- **Three full runs per released sha.** The `land/<sha>` push run, main's own push run at the same sha once it fast-forwards,
  and the dispatched full campaign. A bump or an attestation filed after the landing added a second landing. 3.8.52 and
  3.8.53 each landed twice.
- **Main's push run found nothing.** Every failure that appeared only on main's push run was non-deterministic (a38360be,
  e1df967f, 7805be9f twice); every real defect reproduced on every run of its sha. The run added flake exposure and a red
  main.
- **The coverage floor sets the landing time.** On run 39814891254: coverage floor 53 min (the whole suite serially for
  JavaScript coverage, 26 min, then again for Python coverage, 27 min), windows 29, macOS 14, ubuntu 11, the slowest of 48
  mutation shards 6.
- **Failures by cause:** CHANGE 11 (five Windows-only, two only under coverage instrumentation), TEST-GAP 9, TIMING 6 (the
  observe budget of 5 s three times, corpus-lint's 120 s per record under instrumentation, a 25 ms poll, a partial
  branch-state checkpoint), LEAK 1 (BACKLOG §407), UNKNOWN 2 (`tests/observe-racy.test.mjs` on Windows), INFRA 0.
- **Outside runs were asked too early and voided.** Four attestations at a588177f were voided by a reader change the
  coverage floor forced afterwards. `release.mjs`'s one deadline covered the landing and the campaign together, so a resumable
  wait exited 3 (3.8.52).

## Existing Primitives Audit

- `land.mjs` already pushes `land/<sha>`, waits for main's required contexts and fast-forwards main (ADR-118). **Kept.**
- `release-evidence`'s `evaluateRun` refuses a run whose `event` is not `workflow_dispatch` as `cached`
  (`scripts/release-evidence.mjs:101-109`). **Extended:** a `push` whose `headBranch` is `land/<its sha>` is a full campaign too.
- The workflow's full-campaign switch is `QUALITY_HARNESS_FULL_CAMPAIGN` (`.github/workflows/selftest.yml:295-302`).
  **Extended:** true for a push to `land/**` as well as for a dispatch.
- `scripts/selftest.sh` already exports the environment the suite runs in (`:29-51`). **Extended:** the budgets tests depend on.
- `release-evidence --local` (BACKLOG §406) asks the outside-run and review questions before the landing. **Narrowed:** before
  the landing only the review question stops a release.

## Decision

1. **One run per release.** The workflow runs on a push to `land/**`, a pull request and a dispatch; no longer on a push to
   `main`, which only fast-forwards to a sha `land/<sha>` has checked. Every `land/**` push runs the full campaign.
   `release-evidence` accepts that run. *This fails if* a sha released from a cached campaign is cleared, or a landing's
   full run is refused as cached.
2. **The coverage floor is two parallel jobs**, `coverage floor` (JavaScript) and `coverage floor (python)`, each one pass of
   the suite. Both are required on main.
3. **A test sets the budgets it depends on.** The suite's runners (`selftest.sh`, `coverage.sh`, the workflow, a mutation
   campaign's children) export `QUALITY_HARNESS_OBSERVE_BUDGET_MS=60000`; corpus-lint's per-record bound scales under coverage;
   `observe-racy` says why an observation failed. A test of a budget's own default sets its own environment.
4. **Evidence may arrive after the landing.** Before the landing `release.mjs` stops only on the review question. Once the
   sha is on main, an untracked attestation in `docs/corpus-reports/` is the release's evidence, not an unclean tree; nothing is
   pushed after the landing, so git's pre-push hook never sees it.
5. **The order, and a deadline per wait.** Bump, review, full check, dead-code scan, land, wait for every job of the landing's
   run, ask the outside runners, `release-evidence`, tag. Each wait has its own deadline. After the landing `release.mjs` prints
   the outside-run request.
6. **A Windows check before CI finishes.** Once `land/<sha>` is pushed, `land.mjs` prints the command a Windows peer runs at
   that sha. CLAUDE.md §13 asks for it on every landing that changes a test or a reader.

## Alternatives Considered

- **Keep the dispatched campaign and drop only main's push run:** rejected. A second run per release stays, and so does
  BACKLOG §159's ordering race between push and dispatch.
- **Hold attestations outside the working tree (in git's directory):** rejected for now. Once nothing is pushed after the
  landing the working tree is enough, and the attestation stays where `attest-import` and §6 already put it.
- **Raise each failing test's budget:** rejected. The class is "a test inherited the product's budget", and one export in
  the suite's runners ends it.
- **Run coverage locally before every landing:** rejected. 53 minutes per landing locally; two parallel jobs on CI cost no
  one's machine.

## Component / Boundary Impact

Repository tooling only: the workflow, the ruleset file, and `scripts/`. The plugin is unchanged.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| workflow triggers | push to `land/**` only; full campaign on it | T1 | `land.mjs`, `release-evidence` |
| `release-evidence` run verdict | a `land/<sha>` push run is full | T1 | `release.mjs` |
| required checks on main | `coverage floor (python)` added | T2 | the ruleset, `land.mjs` |
| suite environment | `QUALITY_HARNESS_OBSERVE_BUDGET_MS` | T3 | every hook-spawning test |
| `release-evidence --review` | the review question alone | T4 | `release.mjs` |
| `release.mjs` order and waits | per-wait deadlines, the outside-run request | T5 | the person releasing |
| `land.mjs` output | the Windows check line | T6 | a Windows peer |

## Inter-task Contracts

- T5 consumes T1's verdict (a landing's run is the release run) and T4's `--review`.
- T2 changes the required contexts; the ruleset is PUT once the landing carrying T2 is on main, never by a script (ADR-118).

## Implementation

See `tasks/README.md`.

## Consequences

- **Positive:** one landing and one run per release (about 2.5 h of CI wall clock to about 30 min, plus the outside runs);
  main stops turning red on flakes; the timing class ends at its source.
- **Negative:** every landing pays a full campaign (48 shards, under 25 min each, in parallel with the selftests).
- **Neutral:** a pull request's run still reuses the mutation cache.

## Out of Scope

- Moving attestations out of the working tree (permanent: boundary: unnecessary once nothing is pushed after the landing)
- BACKLOG §407's 580 bare recursive removes (deferred: docs/BACKLOG.md §407)
- Investigating `observe-racy` on Windows beyond printing the reason (deferred: a Windows peer runs it with T3's output)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A push to main by another route runs no CI | Low | Med | the ruleset refuses a sha without the required checks (ADR-118) |
| The ruleset is not PUT after T2 lands | Med | Med | `land.mjs` refuses a required context no job declares, and `--dry-run` names a ruleset that differs |
| A full campaign on every landing hits the 25-minute shard bound | Low | Med | shards measured at 6 min cached; the bound makes growth legible (the workflow's own note) |

## Rollback

Revert the tasks' commits; re-add `main` to the push trigger and the dispatch step in `release.mjs`; PUT the previous ruleset.

## Follow-ups

- [ ] PUT `.github/rulesets/main.json` once T2's landing is on main.
- [ ] Release 3.8.53 through the new order.
