# Task ADR-045-T13: adr-lint's Exit header names the exits it produces

**Depends-on:** T4
**Covers:** F-14, UC14-S1, UC14-S2
**Estimated scope:** XS (one docstring clause; the clause reader already exists; one catalogue entry)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

adr-lint's Exit header claimed exit 2 for "unknown flag, no record named". Measured 2026-09-12: `--bogus` is 1, no args is 1, a missing file is 1; only lib-missing (and a file that never claimed to be a record) is 2. The header is the authority a caller reads. Code 1's own clause now names those three usage misses; code 2 stays could-not-run and names `plugin/lib/record.py`. Measured exits do not change — ADR-046 keys 2 for lib-missing.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | Exit block: usage misses are 1; 2 remains could-not-run |
| `tests/gates.test.mjs` | edit | `exitBlock` / `exitClauses` bound to the corrected sentences; the three measured 1s |
| `tests/mutations.json` | edit | the header put back on 2 |
| `docs/specs/2026-09-11-one-record-grammar.md` | edit | F-14, UC-14, UC14-S1, UC14-S2 |

## Ordered Steps

1. [S1] Measure the three usage exits. Bind the test to the corrected clauses. [proof: acceptance]
2. [S2] The header. [proof: acceptance]
3. [S3] The catalogue entry; `node scripts/mutate.mjs --case`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern "adr-lint's Exit block names the exits it actually produces" tests/gates.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `adr-lint's Exit block names the exits it actually produces` | `tests/gates.test.mjs` | code 1 names unknown flag / no record named / missing file and is not could-not-run; code 2 is could-not-run and names the lib; `--bogus`, no args, missing file exit 1 | F-14, UC14-S1, UC14-S2 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the Exit block in the module docstring |
| 2 — something selects it | `exitBlock` / `exitClauses` / `LIB_ABSENT` |
| 3 — the caller can discover it | `--help` prints the docstring; ADR-046 keys the code |
| 4 — it is used | the three measured invocations |

## Mutation Log

## Invariants

- Lib-missing stays 2.
- A file that never claimed to be a record stays 2 (not-recognised).

## Risks

- A caller that keyed on the old sentence rather than the code would have been wrong either way; ADR-046 keys the code.

## Stop Condition

A green run while the header puts unknown flag on 2.

## Out of Scope

- Changing any measured exit (permanent: boundary: ADR-046 keys 2 for lib-missing; the three usage misses are already 1)

## Notes

Found by the third Codex review (LOW). The header is the contract; the test executes the names before writing them (CLAUDE.md §16).

## Verification Log
