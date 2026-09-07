# Task ADR-037-T1: An advisory's survival across runs is measured, and nowhere to look is not zero

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** an advisory-survival note `adr-lint` writes on every run, a `--advice-survival` report, and this corpus's day-one population
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `advice_identity`, `record_advice_survival`

## Goal

`adr-lint` can tell a REPEAT advisory from a new one, so ADR-037 T2 acts on a number rather than on
a taste complaint. Nothing about what the gate emits changes: the rule is *acted on or removed,
never emitted less often*, and a T1 that starts suppressing is T2 helping itself to the conclusion.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | `advice_identity`, `advice_survival_path`, `record_advice_survival`, and a `--advice-survival` report | the measurement ADR-037 requires before any rule ships |
| `tests/gate-regressions.py` | the counter asserted in both directions through a read/write seam | a counter that can only go up is a check that cannot fail |
| `tests/mutations.json` | two mutants: identity ignoring the message, and no-store answering 1 | the two ways this measurement could lie flatteringly |

## Ordered Steps

1. [S1] Write the failing assertions FIRST: a repeat increments, a CHANGED message resets to 1, an
   acted-on finding disappears, two records do not share history, and no store answers None rather
   than a count. RED while nothing implements them.
   `[proof: test: tests/gate-regressions.py]`
2. [S2] Implement the identity and the note. The whole message is the identity, counts included —
   `chains 4 segments` and `chains 5 segments` are different findings about a changed fence.
   `[proof: test: tests/gate-regressions.py]`
3. [S3] Report behind `--advice-survival` only, and record on every run; default output unchanged.
   `[proof: test: tests/gate-regressions.py]`

## Acceptance

```bash
set -o pipefail
out=$(mktemp)
node --test --test-name-pattern 'focused false-green regressions remain closed' tests/gates.test.mjs 2>&1 | tee "$out" && grep -qE '^ℹ pass [1-9]' "$out" && grep -qE '^ℹ fail 0$' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `advice survival counts only what came back unchanged` | `tests/gate-regressions.py` | increment, reset on change, disappearance, per-record isolation, and UNKNOWN with no store | — | S1, S2, S3 |

## Reachability

`record_advice_survival` is called from `main` on every run, and the report arm from
`--advice-survival`. The test drives the function through its `read`/`write` seam, so every arm is
reachable with no repository and no `.git` (`CLAUDE.md` §7, §9).

## Stop Condition

If measuring requires changing which advisories are emitted, stop: that is T2, and doing it here
would mean acting before the number exists — the one thing ADR-037's Decision forbids.

## Out of Scope

Deleting or rewording any advisory. Suppression, summarisation, and the "not useful" affordance are
all T2 or later.

## Mutation Log

## Verification Log

## Invariants

- Default `adr-lint` output is byte-identical to before this task.
- No store, or an unreadable one, reports UNKNOWN — never a first sighting.

## Risks

**A survival count is a proxy.** A finding may survive because it is hard to act on rather than
because it is useless. The measurement names candidates; a human decides, which is T2.

## Notes — the day-one population, measured 2026-09-07

One run of `adr-lint` over every record in this corpus that has a `tasks/` directory, with the note
cleared first, then read back:

```
records with advice: 22 of 37
advisory findings live in this corpus: 78

  34  Proof map: v1 was not checked because this legacy task has no **Proof map:** header
   7  fence-segments-vs-Rests-on
   2  uncovered declared mechanism
  35  one-off findings (permanent-basis citations, mostly distinct)
```

⚠ **THE ADVISORY §152 IS ABOUT IS NOT THE PROBLEM. 34 of 78 findings — 44% — are ONE advisory**, on
17 of 37 records, and it is the proof-map legacy notice, not the fence-segments one. §152 was
reported from a six-task record where fence-segments was what the reader saw; across a whole corpus
it is 7 of 78. **The measurement found a bigger candidate than the report that motivated it**, which
is the argument for measuring before rationing, made by the measurement itself.

Survival counts start accruing from this run: everything here is 1, which is the correct day-one
answer and not a finding.
