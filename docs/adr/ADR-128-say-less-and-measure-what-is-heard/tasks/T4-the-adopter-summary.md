# Task ADR-128-T4: `qh nudges --summary`, carried by an outside run

**Depends-on:** ADR-121-T1
**Awaiting-decision:** this task executes here only if ADR-121 T1 does; the owner's direction of 2026-10-23 (quality-harness is bug-fix only; new development goes to qh-core) moves ADR-121 to qh-core's to-be, and this task would move with it. Decide: execute here with ADR-121 T1, or retire here and carry to qh-core.
**Covers:** none — no spec
**Estimated scope:** M (the reporter and corpus-probe)
**Owner:** unassigned
**Produces:** `qh nudges --summary` output
**Consumes:** `qh nudges` outcome rows (ADR-121-T1)
**Data dependency:** needs session logs holding nudge.outcome rows (ADR-121-T1)
**Proof map:** v1

## Goal

Print, per rule, emissions, outcome counts and characters said, scrubbed like a corpus probe, and carry it in an outside
run so effectiveness is measured on corpora this repository does not own.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| the `qh nudges` reporter (ADR-121-T1) | edit | `--summary` |
| `plugin/scripts/corpus-probe.mjs` | edit | carry the summary when present |
| `tests/nudge-summary.test.mjs` | add | the shape, the scrub, the absent case |

## Ordered Steps

1. [S1] Write the test over a fixture log: counts per rule and outcome; a path in a finding is scrubbed; a log with no
   outcome rows says so (could-not-look, not zero) (red today).
2. [S2] Implement `--summary`; carry it in `corpus-probe --json`. It never gates a release.
3. [S3] Ask the next outside-run peer for it, verbatim. [proof: human: the peer's reply is filed with the attestation]

## Acceptance

```bash
node --test --test-reporter=tap tests/nudge-summary.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the summary counts each rule's outcomes and scrubs its text` | `tests/nudge-summary.test.mjs` | shape and scrub | — | S1, S2 |
| `a log with no outcome rows is could-not-look, never zero` | `tests/nudge-summary.test.mjs` | ADR-005 | — | S2 |

## Mutation Log

## Invariants

- Nothing about a corpus is committed beyond the attestation's existing keys (CLAUDE.md §6).

## Risks

- A summary from one adopter is one corpus; it informs, it does not retire a rule (ADR-121-T3 does that).

## Stop Condition

ADR-121-T1 has not shipped: this task waits.

## Out of Scope

- Retiring a rule on the numbers (permanent: boundary: ADR-121-T3 owns it).

## Verification Log
