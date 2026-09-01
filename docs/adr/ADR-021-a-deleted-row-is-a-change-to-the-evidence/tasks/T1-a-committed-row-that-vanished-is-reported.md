# Task ADR-021-T1: Advise when a committed Verification Log row is gone from the file

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one function, one gate)
**Owner:** unassigned
**Produces:** the missing-row advisory in `check_verification` (T1)
**Consumes:** `committed_lines()`, `VLOG_RE`
**Proof map:** v1

## Goal

`adr-lint` advises when a line HEAD holds, which parses as a Verification Log
entry, is absent from the working file — and stays silent when git could not
answer, and when only prose changed.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | `check_verification` already holds `known`; this reads the difference it is already carrying |
| `tests/gate-regressions.py` | edit | the regression, through the CLI on a git fixture — the boundary the finding was measured at |
| `tests/mutations.json` | edit | registers the call-site mutant this record's `Enforced-by` names |

## Ordered Steps

1. [S1] Write the failing regression first (TDD red), through the shipped CLI on a git fixture: three rows committed, the RED `exit 1` row removed after the commit, and the gate must name it. It must fail before any code changes — measured 2026-09-01 that it produces output identical to the baseline. [proof: acceptance]
2. [S2] Advise on committed entry lines absent from the file, guarded on `known is not None` and filtered through `VLOG_RE` on BOTH sides. [proof: acceptance]
3. [S3] Assert SILENCE in the two directions that would make this a gate reporting an observation it did not make: when `committed()` returns `None`, and when the file's PROSE changed while its log did not. Both on the same fixture as S1, or the advisory is not shown capable of staying quiet. [proof: acceptance]
4. [S4] Assert the advisory never enters the blocking channel (CLAUDE.md §3), on the same findings object. [proof: acceptance]
5. [S5] Register the CALL-SITE mutant — delete the call, not the comparison — and confirm RED. A mutant inside the comparison would be killed by S1 whether or not `check_verification` invokes it, which is the defect ADR-020 T4 was written for. [proof: mutation]

## Acceptance

```bash
set -o pipefail
python3 tests/gate-regressions.py plugin/bin plugin/skills/postmortem/SKILL.md . 2>&1 | tee /tmp/adr021-t1.out \
  && ! grep -qiE "traceback|assertionerror" /tmp/adr021-t1.out \
  && grep -q "a committed evidence row that has gone missing is reported" tests/mutations.json
```

<The catalogue grep is chained with `&&` because the mutation label is half of
what this task produces, and CI gates on the campaign's answer rather than on
this fence's — the lesson ADR-020 T1 paid for twice.>

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a committed evidence row that has gone missing is reported` | `tests/gate-regressions.py` | the RED row removed after the commit is named | — | S1, S2 |
| `a log nobody touched draws nothing` | `tests/gate-regressions.py` | capable of clean on the same fixture | — | S1 |
| `a corpus git cannot answer for is silent` | `tests/gate-regressions.py` | `known is None` reports "could not look", never absence | — | S3 |
| `prose can change without the log being accused` | `tests/gate-regressions.py` | both sides filtered through `VLOG_RE` | — | S3 |
| `the missing-row advisory never blocks` | `tests/gate-regressions.py` | advisory channel only | — | S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the five tests above |
| 2 — something selects it | `check_verification` calls it on every task it reads, on the `known` it already computes for the digest-less notice. The mutation `lint: a committed evidence row that has gone missing is reported` deletes THAT CALL and the S1 assertion goes red. Deleting the comparison instead would redden the same test, which is why the registered mutant is the call and not the body |
| 3 — the caller can discover it | the advisory names the row and says to re-run `adr-verify` on a clean tree |
| 4 — it is used | the Follow-up counts how often it fires on honest work in the first month |

## Invariants

- Silent when `committed()` returns `None`, forever. A gate that cannot look says so.
- Only lines matching `VLOG_RE` are compared, on both sides.
- Advisory. It never enters the blocking channel.
- `adr-verify` writes nothing new; the entry grammar does not change.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Fires on every task in a corpus with no `.git` | Med | High | S3's first arm, asserted rather than assumed |
| Fires on a prose edit | Med | Med | S3's second arm, on a fixture whose prose moved and whose log did not |

## Stop Condition

Stop and return to the record if closing this requires a new field in the entry
or a change to what `adr-verify` writes. The whole argument for this decision
over a hash chain is that it needs neither; if it turns out to need one, the
alternative was not actually rejected and the record is wrong.

## Out of Scope

- Hash-chained entries (permanent: boundary: git answers this from data `check_verification` already holds, and a chain earns its cost only where git cannot answer at all)
- Reordering, as distinct from deletion (deferred: docs/BACKLOG.md §101)

## Verification Log

## Mutation Log
