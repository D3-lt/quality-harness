# Task ADR-035-T3: The rate is read with its denominator and its exclusions

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** `node plugin/scripts/claims-rate.mjs [--json] [--ledger <path>]`
**Consumes:** `claims.jsonl` row schema (T2)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the bucket partition`, `the zero-row refusal`, `the malformed-row accounting`

<The fence's own `grep` guards are not listed, for the reason T1 gives: `Rests-on`
names mechanisms in the SOURCE that a mutation can break, and no edit to
`claims-rate.mjs` can break a guard living in this file's fence.>

## Goal

A reader prints the false-success rate over the ledger with its denominator and the rows it
excluded, in the four-bucket discipline `adr-verify --sweep` already uses, and prints no rate at
all over zero observations.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/claims-rate.mjs` | add | the reader; `--json` for tools, `--ledger` to read a file other than the default |
| `tests/claims-rate.test.mjs` | add | drives the script on fixture ledgers |
| `tests/mutations.json` | register `claims: could-not-look is in neither half of the rate` | the exclusion is the mechanism ADR-010 is about |
| `docs/ONBOARDING.md` | one line under "Where the honest numbers are" | rung 3: a reader can discover it |
| `plugin/scripts/qh-doctor.mjs` | one line: rows in the ledger, or "no ledger" | the operating surface already reports what is measured at call time |

## Ordered Steps

1. [S1] Write the failing tests: a fixture ledger with two `asserted`×`unverified`, three
   `asserted`×`verified`, one `none`×`unverified`, one `could-not-look`, one `no-check`, one
   `unavailable` → false 2, denominator 6, excluded 3, and the buckets sum to the row count; an
   empty ledger → "no observations" and no number; a malformed line → counted as excluded with its
   line number, never dropped in silence. Red.
2. [S2] Implement the script: parse, bucket, print; `--json` emits the same buckets; exit 0
   whatever it finds (it reads and judges nothing — CLAUDE.md §3).
3. [S3] Register the mutant: move `could-not-look` into the denominator — the rate changes and the
   first test goes red. `[proof: mutation]`
4. [S4] Add the ONBOARDING line and the `qh-doctor` line. `[proof: acceptance]`

## Acceptance

```bash
set -o pipefail
out=$(mktemp)
node --test tests/claims-rate.test.mjs 2>&1 | tee "$out" && grep -qE '^ℹ pass [1-9]' "$out" && grep -qE '^ℹ fail 0$' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the four buckets are disjoint, total, and the excluded ones are in neither half` | `tests/claims-rate.test.mjs` | the partition | — | S1, S2 |
| `zero observations prints no rate` | `tests/claims-rate.test.mjs` | ADR-005: could-not-look is not a number | — | S1, S2 |
| `a malformed row is counted and named, never dropped` | `tests/claims-rate.test.mjs` | a parse failure is visible | — | S1, S2 |
| `--json carries the same buckets` | `tests/claims-rate.test.mjs` | the two outputs agree | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the tests spawn the script |
| 2 — something selects it | `qh-doctor` names the ledger and the reader; the registered mutant |
| 3 — the caller can discover it | `docs/ONBOARDING.md` "Where the honest numbers are"; `--help` |
| 4 — it is used | nothing measures this yet |

## Mutation Log

## Invariants

- Buckets sum to the number of lines read; no line is uncounted.
- A rate is printed only with its denominator on the same line.
- The script writes nothing.

## Risks

- A reader quotes the rate without the denominator. The text form prints them together and the
  JSON form has no bare `rate` key without `denominator`.

## Stop Condition

None — the reader depends on nothing outside the ledger's row schema.

## Out of Scope

- Any per-repository or per-session breakdown beyond the totals (deferred: docs/BACKLOG.md §121)

## Verification Log
