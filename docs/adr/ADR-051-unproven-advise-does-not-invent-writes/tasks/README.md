# ADR-051 Tasks

Implementation tasks for ADR-051: Unproven Advise does not invent writes. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated. `adr-lint` fails when the README lists a task with no file or omits
an existing task file.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Advise names only proven paths | done | F-1, F-2, F-4, F-5, UC1-S1, UC1-S2 | `node --test --test-name-pattern 'Stop does not invent writes from probes, markers, or paths outside the repo' tests/lifecycle.test.mjs` |
| T2 | Statusline count is proven paths | done | F-3 | `node --test --test-name-pattern 'a marker-only transcript is unverified, not a numbered write' tests/statusline.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `provenMutationPaths` | T2 | T1 before T2 so statusline keys the same filter Stop uses |

## Notes

- Code landed in `3ebc868`. Execution is `adr-verify` (clean fence + `--mutant`), not a reimplementation.
- T1's dirty cases: drop the `<` / outside-cwd skip (marker listed as a path); restore `The transcript contains file mutations.`; unwrap `docsOnly` to raw `mutationPaths`.
- T2's dirty cases: `count: edited.length` so `node --version` renders `QH ✗ 1 unverified`; `markerOnly = false` so it renders nothing-edited.
