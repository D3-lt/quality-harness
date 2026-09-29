# ADR-073: A narrowed entry runs every test it names

**Status:** Accepted
**Date:** 2026-09-28
**Owner:** Zy
**Spec:** None — no spec stage; BACKLOG §318, the check ADR-072's narrowing needs that does not read source text
**Cross-references:** docs/adr/ADR-072-a-mutant-runs-only-the-tests-that-kill-it.md, docs/adr/ADR-006-a-verdict-that-names-its-own-reliability.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/BACKLOG.md
**Governs:** scripts/mutate.mjs
**Enforced-by:** `tests/mutate-runner.test.mjs::a narrowed entry whose baseline runs fewer tests than it names is STALE, and one that runs them all is measured`
**Invalidates:** none — checked (ADR-006's baseline states and ADR-072's `--stale` literal check are unchanged; this adds one state beside them, read only for a narrowed pattern)
**Served-path change:** None — repository tooling only (`scripts/mutate.mjs`); nothing in `plugin/` changes.

## Context

ADR-072 narrows a catalogue entry to the tests that killed its mutant: `only` becomes `^(?:<killer>|…)$`. Its T3 narrows 812 entries (the shard caches of push run 36467374356, read 2026-09-28).

A narrowing is right on the day it is written, because its killers are the tests that ran and failed at that key. It goes wrong later, when a killer is renamed, deleted or skipped: the pattern stops selecting it. Two things can notice, and neither does today:
- `mutate --stale` checks each name against the file's string literals (ADR-072 Decision 5). Two different-lineage reviews (2026-09-28) showed that reader can be fooled, and BACKLOG §318 records the inputs it still misreads. More basically, a gone killer whose name survives as any other literal, such as an assertion message, passes it by construction.
- The campaign runs the entry's baseline under its pattern every time, and `leafTestsRun` counts the tests that ran. Nothing compares that count with the names. So an entry whose three killers became two stays RED on the two, and runs fewer tests than it claims, silently. An entry whose only killer is gone is UNPROVEN, which does not fail a campaign (ADR-006).

The class is every catalogue entry whose `only` has the narrowed shape `^(?:…)$`. Enumerated by reading `tests/mutations.json` for entries whose `only` starts `^(?:` and ends `)$`: 0 at 4060fce, about 812 once ADR-072 T3 lands. The 731 hand-written patterns are not in it (Out of Scope).

## Existing Primitives Audit

- `leafTestsRun(stdout, files)` counts the leaf tests a spec-reporter run executed, discounting the file wrapper. **Reused** as the only source of the count.
- `baselineOf(run, files)` (ADR-006) grades a baseline `pass`, `fail` or `unrun`. **Extended** with an optional count of names, and one more state for a narrowed pattern that ran fewer tests than it names.
- `classify` grades STALE when the entry no longer describes the code. **Reused**: a short narrowed baseline is STALE too, with its own detail.
- ADR-072's `namesOf(only)` reads a narrowed pattern back into its names. **Reused** for the count.

## Decision

1. **A narrowed entry's baseline must run at least as many tests as its pattern names.** When a set's `only` has the narrowed shape, its baseline is graded against the number of names `namesOf` reads from it. A baseline that passes but ran fewer tests than that is `short`, and it records both numbers.
2. **An entry whose baseline is `short` is STALE**, with the detail `its pattern names <n> tests and <m> ran`, and its mutant is not applied. STALE already fails a campaign and already means "the catalogue entry no longer describes the code; repair it". The campaign's closing sentence for an all-STALE failure names a pattern as well as a `from`.
3. `--stale`'s literal check stays as the fast local pre-check. This decision does not depend on it.

**What makes it fail.** The tests show each of these:
- a narrowed entry with a gone killer is STALE and fails the campaign, although its remaining killers would have killed it;
- an entry whose pattern runs every name is measured as before;
- a hand-written pattern that runs any number of tests is untouched;
- a skipped killer counts as gone.

## Alternatives Considered

- **Make the literal reader a parser.** Rejected: both reviews pointed at it, and it would still pass a gone killer whose name survives as another literal. The runner's own count is what actually ran.
- **Grade a short baseline UNPROVEN.** Rejected: UNPROVEN does not fail a campaign (ADR-006), so the entry would stay short in silence, which is the defect.
- **Measure the mutant anyway and warn.** Rejected: the entry would keep claiming tests it no longer runs, and a warning nobody gates on is the silence this replaces.
- **List every test a file registers (`--test-skip-pattern`) and compare names.** Rejected for now: it runs each test file's top-level code in `--stale`, and it costs a spawn per file on a check the selftest runs. The baseline already runs.

## Component / Boundary Impact

None — internal to `scripts/mutate.mjs`; repository tooling that never ships.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `baselineOf(run, files, named)` | an optional count of names, and a `short` state | T1 | the campaign's baseline loop |
| campaign verdict for a `short` baseline | STALE with the shortfall | T1 | the campaign's exit status |

## Inter-task Contracts

None — one task.

## Implementation

See `tasks/README.md`: T1 (the count, the state, the verdict, and the closing sentence).

## Consequences

- **Positive:** a narrowed entry that no longer runs every test it names fails the next campaign, with the numbers, whatever the source text says.
- **Negative:** a legitimately renamed killer now fails a campaign until the entry is re-narrowed or widened, which costs a person a step.
- **Neutral:** an entry with a hand-written pattern behaves exactly as before.

## Out of Scope

- Counting for hand-written `only` patterns (permanent: boundary: a substring pattern selects every test whose name contains it, so it implies no count)
- The literal reader's remaining misreadings (deferred: docs/BACKLOG.md §318)
- Re-narrowing an entry automatically when it goes short (permanent: boundary: which killer replaced a renamed one is a judgement the count cannot make)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A test with the same name in two named files makes the count larger than the names | Med | None | only fewer-than is graded; more-than is ordinary |
| A killer that is skipped only on one platform makes that platform's campaign fail | Low | Med | the detail names the shortfall; the entry is re-narrowed where it runs |

## Rollback

`git revert` of T1's commit; nothing persistent changes.

## Follow-ups

- [ ] After ADR-072 T3's catalogue lands, run one campaign and record how many narrowed entries are short.
