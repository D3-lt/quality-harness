# Task ADR-020-T1: Record the output digest in the entry, and prove honest re-runs agree

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** L (cross-boundary)
**Owner:** unassigned
**Produces:** `output_digest()` (T1), the extended Verification Log grammar (T1)
**Consumes:** none
**Data dependency:** needs this repository's own ADR corpus and its acceptance fences, because the stability measurement in S2 is taken against real fences rather than fixtures
**Proof map:** v1

## Goal

Append `output-sha256:<64 hex>` to the entry `adr-verify` writes, required from a
dated cutover, accepted by all three readers — and measure first whether honest
re-runs of this repository's own fences produce identical output at all.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-verify` | edit | writes the entry; `output_digest()` lives beside `acceptance_digest()` |
| `plugin/bin/adr-lint` | edit | `VLOG_RE`, `VLOG_DIGEST_RE`, `VLOG_LEGACY_RE` and the new `OUTPUT_REQUIRED_FROM` — this is what SELECTS the field as required |
| `plugin/bin/adr-next` | edit | `is_done()` reads the same grammar; a third reader drifting makes it call verified tasks unverified |
| `tests/gate-regressions.py` | edit | already asserts three-way digest agreement; extended to the new field |
| `tests/mutations.json` | edit | registers the label ADR-020's `Enforced-by` names |

## Ordered Steps

1. [S1] Write the failing tests first (TDD red): an entry dated on/after the cutover with no `output-sha256` is rejected, one dated before it is accepted, and all three readers parse a new-shape entry. They must fail before any grammar changes.
2. [S2] **Measure before building.** Run each acceptance fence in this repository's corpus twice on a clean tree and record how many produce byte-identical merged output. Write the count, the date and what it was taken against into the record's Context. If any fence is unstable, name it — the ADR's Stop Condition turns on this. [proof: human: a reader confirms the count names the fences tested and the date, and that an unstable fence is named rather than summarised away]
3. [S3] `output_digest(text)` — SHA-256 of the merged stdout/stderr `adr-verify` already captures, taken AFTER the existing home-directory redaction, so the digest is of what was written rather than of what was captured.
4. [S4] Append the field to the entry in `adr-verify`, and add `OUTPUT_REQUIRED_FROM` plus the three grammar changes in `adr-lint` and the one in `adr-next`. The field goes at the END of the line so an older reader's pattern is unaffected. [proof: acceptance]
5. [S5] Assert the DOWNGRADE path: the entry patterns as released in 2.45.0 still match a 2.46-shaped entry. A corpus verified under the new gate and read by the old one must not read as malformed. [proof: acceptance]
6. [S6] Register the mutation making the field optional after the cutover, and confirm it is RED — that mutation is exactly the defect GitHub issue #4 reported, aimed at the new field. [proof: mutation]

## Acceptance

```bash
set -o pipefail
python3 tests/gate-regressions.py plugin/bin plugin/skills/postmortem/SKILL.md . 2>&1 | tee /tmp/adr020-t1.out \
  && ! grep -qiE "traceback|assertionerror" /tmp/adr020-t1.out \
  && grep -q "an acceptance entry carries the digest of what the run printed" tests/mutations.json
```

<Red before the work: the harness's new arm asserts a cutover-dated entry without
the field is rejected, and today every reader accepts it. The catalogue grep is
chained with `&&` so a passing harness alone cannot carry the verdict — the
mutation label is half of what this task produces.>

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an entry dated from the cutover must carry the output digest` | `tests/gate-regressions.py` | the field is required, not optional-by-omission | — | S1, S4 |
| `an entry dated before the cutover needs no output digest` | `tests/gate-regressions.py` | the corpus's existing rows stay valid forever | — | S4 |
| `all three readers accept one new-shape entry` | `tests/gate-regressions.py` | adr-verify, adr-lint and adr-next do not drift apart | — | S4 |
| `the released 2.45.0 patterns still match a new-shape entry` | `tests/gate-regressions.py` | the downgrade path: a new corpus read by an old gate is not malformed | — | S5 |
| `the digest is taken after redaction, not before` | `tests/gate-regressions.py` | a home path never reaches the digest, and the value matches what was written | — | S3 |

<Every name and file backticked: an unbackticked row is dropped by the Tests
reader, and its step is then reported as unproven.>

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the five tests above |
| 2 — something selects it | `OUTPUT_REQUIRED_FROM` in `adr-lint` is what makes the field load-bearing rather than decorative; the S6 mutation fails if it stops being required |
| 3 — the caller can discover it | the entry grammar is documented in `adr-verify`'s module docstring, which the S4 change updates — a reader who hand-inspects a log needs it |
| 4 — it is used | the ADR's Follow-up counts how often the cross-check fires once T3 ships |

## Mutation Log

## Invariants

- The field is appended at the END of the entry; no existing field moves.
- `normalize_acceptance()` and `acceptance_digest()` are unchanged in all three gates.
- Entries written before the cutover remain valid with no field, forever.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A fence's output is not stable, so the digest is noise | Med | High | S2 measures it BEFORE the field is written; an unstable fence is named in the record and the ADR's Stop Condition applies |
| An older gate rejects a new entry | Med | High | S5 asserts the released patterns against a new-shape entry |
| The digest captures a machine-specific path | Med | Med | S3 takes it after the existing redaction, and a test asserts a home path never reaches it |

## Stop Condition

Stop and return to the ADR if S2 finds any fence whose repeated runs differ. That
is the record's stated falsifier, and continuing past it would ship a check that
fires on honest work.

## Out of Scope

- The ledger, which is T2's (deferred: this record's T2)
- The cross-check, which is T3's (deferred: this record's T3)
- Any binding on the Mutation Log (deferred: docs/BACKLOG.md §98)

## Verification Log
