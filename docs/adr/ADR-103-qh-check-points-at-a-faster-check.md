# ADR-103: qh-check points at a faster check, and says when a run was slow for its history

**Status:** Accepted
**Date:** 2026-10-15
**Owner:** zy
**Spec:** None — no spec stage; stage 4 of the check-speed plan the owner approved on 2026-10-14, evidence in Context
**Cross-references:** ADR-005, ADR-077, ADR-081, ADR-094, docs/BACKLOG.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — two advisories; each task's tests and killed mutants hold them, and neither can block a run
**Invalidates:** none — checked: ADR-081's fast pass keeps its meaning (one proven commit, never a push), and ADR-094's prose hint keeps its words
**Served-path change:** after a passing full `qh-check` that took a minute or more in a project that declares no `fastCheck`, `qh-check` names, once per repository, the fast check its own test runner already offers; and after any full run that took half again its own median, it says so with the load and the checks that ran beside it.

## Context

Every project that installs this plugin runs its declared check through `qh-check`, and the check is the cost an adopter feels.
Stages 0-2 of the plan the owner approved (2026-10-14) made this repository's own check about 19% faster (ordered runs:
194.5/192.2/244.7 s against 239.5/234.8/309.7 s in glob order, three alternated pairs) and its per-commit fast check about 51%
faster (51.6 s against a 104.5 s median), all measured on this machine and recorded in BACKLOG §378's entries of 2026-10-14/15.
None of that reaches an adopter: those were changes to this repository's own `scripts/`.

A read-only survey of peers' own `qh-check` ledgers (2026-10-15, `scripts/check-timing.mjs --summary`) answered from three
repositories we do not own: a monorepo's `just check` (lint, typecheck, vitest, PHPUnit), 73 runs, pass median 131.2 s, p90
300.2 s; a Laravel repository's `make test` (PHPUnit in Docker), ~160 s over two passes; a Python repository's `make test`
(pytest in Docker), one pass at 2,173 s with heavy checks of other repositories beside every run. Three more answered from their
own files without running anything: two vitest repositories and one of bash scripts. **No surveyed repository declares a
`fastCheck`, and none uses its runner's own changed-files mode, though three use vitest, which has one.** The 2,173 s run was
read by its own session as "1 contended": `contended` is load past the core count at a run's two ends, and the checks named
beside every run were the larger part of the story.

Two levers follow from what an adopter already has. ADR-081 gave every project a `fastCheck` that lets one proven commit through
on a fast pass while a push still needs the full one; nobody surveyed has declared one, and the cheapest correct one is usually
the runner's own selection mode. And a run that took far longer than its own history has a reason the ledger already holds — the
load and the checks beside it (ADR-077) — that nobody is told.

## Existing Primitives Audit

- **`plugin/scripts/prose-hint.mjs`** (ADR-094 T3): a hint after a passing full run that took `proseHintMs` (60 s,
  `QUALITY_HARNESS_PROSE_HINT_MS`) or more, said once per repository through `firstMentionHere` (`session-notes.mjs`). Reused:
  the threshold, the once-per-repository gate and the place it is said (`qh-check.mjs`, after the run is recorded).
- **`fastCheckCommand`** (`check-command.mjs`, ADR-081): whether a `fastCheck` is declared. Reused as the condition.
- **The check ledger** (`checks.jsonl`, `check-ledger.mjs`): every run's window, exit, load and the checks beside it (ADR-077).
  Reused as the history a slow run is measured against; nothing new is stored.
- **`scripts/check-timing.mjs`** (repository-only): the survey reader. Not shipped and not reused by the plugin; its `summarize`
  is the shape T2's median follows.

## Decision

1. **A fast check is named where the runner offers one that can pass (T1).** After a passing full run that took `proseHintMs`
   or more, in a project whose `.quality-harness.json` declares no `fastCheck`, `qh-check` says, once per repository within
   `firstMentionHere`'s three-day window, which fast check its own test runner offers, read from the root's manifests:
   `vitest` in `package.json` `dependencies` or `devDependencies` → an `npx vitest` changed-files run; else `jest` → an `npx jest`
   changed-files run; `pytest-testmon` in `pyproject.toml` or a `requirements*.txt` → `pytest --testmon`, with its data file named
   as one to ignore in git (a file the run writes changes the tree it checks). **A command is named only if, run through
   `qh-check --fast` on a fixture of that runner, it yields `check.passed` both on a change its tests cover and on one they do
   not** (CLAUDE.md §16): `qh-check` grades an exit 0 that says "no tests found" as no-work, which is not a pass, so a mode that
   prints it on an untouched suite would refuse every commit that touches no test. A mode that fails that measurement is not
   named, and its runner draws the plain lever (declare a `fastCheck`, ADR-081) with no command. The text is one constant,
   worded on ADR-081 and ADR-100: `qh-check --commit` runs the declared fast check and commits on its pass; a push still needs
   the full check. It carries no duration, since `firstMentionHere` keys on the text. It writes nothing; the declaration is the
   owner's. **What would make it wrong:** a named command that does not yield a pass through `qh-check`, a hint said twice in the
   window, said under the duration, said in a project that declares a `fastCheck`, or burned by a run that was not said it. Each
   is a test in T1.
2. **A slow run is said against its own history (T2).** After a full run (`checks.jsonl`, never a `--fast` run), when the ledger
   holds at least five earlier passes of the same command, not counting this run, and not counting a row reused from another run
   (`reusedFrom`, ADR-094), and this run took at least 1.5 times the median of the last 20 of them, `qh-check` says so in one
   line: the run's time, the ratio, the median and how many passes it came from. A run's time is its window (`after.at` less
   `before.at`); the median of an even count is the lower middle. The load and the checks beside the run are already said on every
   run (ADR-075, ADR-077) and are not repeated. Said for a completed run whatever its verdict, and never on an ordinary one. **What
   would make it wrong:** a line on a run within its history, from fewer than five passes, over reused rows, failed runs, another
   command's passes or passes older than the last 20, or on a fast run. Each is a test in T2.

Neither line changes a verdict, an exit code, a ledger record or what any reader of a pass accepts (ADR-005, ADR-081).

## Alternatives Considered

- **Write the fast check into `.quality-harness.json`.** Rejected: which tests may stand in for the suite at commit time is the
  project owner's call, as ADR-094 left `prose` to them.
- **Select the tests inside `qh-check`.** Rejected for now: a selection that skips a test is a claim about what the skipped test
  would say (ADR-005), and this repository's own stage 3 waits for 30 runs of per-file history before deciding even its own.
- **Read per-file times from TAP or JUnit output.** Rejected: no surveyed repository's declared check emits either, and `qh-check`
  keeps a 64 KiB tail of output, not a report (BACKLOG §378 lead).
- **Say the slow line on every run.** Rejected: always-on text is paid by every adopter on every run (CLAUDE.md §19).

## Component / Boundary Impact

`plugin/scripts/qh-check.mjs` says two more lines after recording a run; a new `plugin/scripts/fast-check-hint.mjs` reads the
project's manifests, as `prose-hint.mjs` reads git and the ledger. Both stay inside the check component; neither is read by any
other.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `qh-check` stderr | two advisory lines, each conditional | `qh-check.mjs` | the agent and the user |

No config key, ledger field, exit code or hook output changes.

## Inter-task Contracts

None — T1 and T2 touch different conditions and share only the place they are said.

## Implementation

See `ADR-103-qh-check-points-at-a-faster-check/tasks/README.md`: T1 (the fast-check hint), T2 (the slow-run line).

## Consequences

- **Positive:** an adopter whose check takes minutes hears, once, the fast check their runner already has; a run that took far
  longer than usual says why, from what the ledger already holds.
- **Negative:** two more lines `qh-check` can say; both are conditional and one is said once per repository.
- **Neutral:** the hint names a command; whether it is right for the project is still the owner's to judge.

## Out of Scope

- Selecting tests inside `qh-check` (deferred: docs/BACKLOG.md, stage 3 of the check-speed plan, after 30 runs of per-file history)
- Per-file timings from an adopter's runner (permanent: boundary: no surveyed declared check emits TAP or JUnit, and the decision is to say what the ledger holds)
- Runners without a selection mode named here: PHPUnit, Go's test cache, cargo (permanent: boundary: PHPUnit has none natively; Go and cargo already cache; the plain lever is said for them)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A named command is wrong for a project (a monorepo whose runner is not at the root) | Med | Low | the hint names where it read the runner, says the owner decides, and writes nothing |
| The slow line fires on a busy shared machine every run | Med | Low | it says the load and the checks beside the run, which is the explanation; T2's threshold is 1.5x the run's own median |

## Rollback

None — no persistent state, contract or external integration: revert the two tasks' commits.

## Follow-ups

- [ ] Outside runs (CLAUDE.md §18) over the surveyed repositories before the release that ships these lines.
