# Task ADR-020-T3: Report only a ledger that disagrees, and nothing otherwise

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** none
**Consumes:** `run_ledger()` (T2), `output_digest()` (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Have `adr-lint` advise when the local ledger holds a DIFFERENT output digest for a
row — and produce nothing at all when the ledger is absent, unreadable, or silent
about that row.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | the cross-check sits with the other Verification Log checks; the advisory line is what SELECTS this whole record's mechanism |
| `tests/gate-regressions.py` | edit | asserts the one reporting case and the three silent ones |
| `tests/mutations.json` | edit | registers `lint: an absent ledger is silence, never a finding` |

## Ordered Steps

1. [S1] Write the failing tests first (TDD red): a ledger holding a different digest for the row produces advice; an absent one, an unreadable one, and one with no line for this row each produce nothing. All four fail before the check exists.
2. [S2] Read the ledger through an injectable seam, so all four states are reachable from a test without creating and destroying real files. [proof: acceptance]
3. [S3] Advise — never block — when a ledger line for this task and acceptance digest carries a different output digest. Name what disagrees and say plainly that the ledger is local state and the entry may simply have been recorded on another machine. [proof: acceptance]
4. [S4] Produce NOTHING in the other three states. An absent ledger is the normal case on any machine that did not run the fence, and "I could not look" must never borrow the vocabulary of a verdict (CLAUDE.md §3, ADR-005). [proof: acceptance]
5. [S5] Register the mutation turning an absent ledger into a finding, and confirm it is RED. That mutation is the failure this task exists to prevent. [proof: mutation]

## Acceptance

```bash
set -o pipefail
python3 tests/gate-regressions.py plugin/bin plugin/skills/postmortem/SKILL.md . 2>&1 | tee /tmp/adr020-t3.out \
  && ! grep -qiE "traceback|assertionerror" /tmp/adr020-t3.out \
  && grep -q "an absent ledger is silence, never a finding" tests/mutations.json
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a ledger that disagrees about a row is reported` | `tests/gate-regressions.py` | the one case that produces output, so the check is shown able to speak | — | S1, S3 |
| `an absent ledger produces nothing` | `tests/gate-regressions.py` | the normal case on a fresh checkout is silence | — | S4 |
| `an unreadable ledger produces nothing` | `tests/gate-regressions.py` | a machine problem is not a finding about the corpus | — | S4 |
| `a ledger with no line for this row produces nothing` | `tests/gate-regressions.py` | silence about a row is not disagreement about it | — | S4 |
| `the disagreement is advice and never changes the exit code` | `tests/gate-regressions.py` | gates instruct and never block (CLAUDE.md §3) | — | S3 |

<The first row and the three silent rows are asserted on the SAME fixture, varying
only the ledger. A check whose speaking case and silent cases use different
fixtures can pass while responding to the fixture rather than to the ledger.>

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the five tests above |
| 2 — something selects it | `check_verification` calls it on every `done` row; the S5 mutation fails if absence starts producing a finding |
| 3 — the caller can discover it | the advisory text itself is the interface, and the test on its wording is the check on that rung |
| 4 — it is used | the ADR's Follow-up counts how often it fires on real corpora, and how often on honest work — if the second is not zero, this task comes out |

## Mutation Log

## Invariants

- The cross-check never changes the exit code.
- Three of the four ledger states produce no output whatsoever.
- No ledger state is ever described with the vocabulary of a verdict.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The advisory fires on honest work | Med | High | T1's stability measurement gates whether this task ships at all; the ADR's Follow-up re-measures after a month |
| A reader takes a disagreement as proof of forgery | Med | High | The wording says the ledger is local and the entry may have been recorded elsewhere; the test asserts that clause specifically |

## Stop Condition

Stop if T1's measurement found any unstable fence. Shipping this check on a corpus
whose fences do not reproduce is shipping an advisory that fires on correct work,
which the ADR names as the thing that would make the decision wrong.

## Out of Scope

- Blocking on a disagreement (permanent: boundary: CLAUDE.md §3 — a gate here instructs and never acts)
- Treating an absent ledger as anything at all (permanent: boundary: the ADR's Decision)

## Verification Log
