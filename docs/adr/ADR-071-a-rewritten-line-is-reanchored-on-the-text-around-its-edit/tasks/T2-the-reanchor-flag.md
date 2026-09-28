# Task ADR-071-T2: `--repoint --reanchor` proposes, and writes only when asked

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one script, its test)
**Owner:** unassigned
**Produces:** the `--reanchor` flag of `scripts/mutate.mjs`
**Consumes:** `reanchorEntry(entry, text, added)` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the flag is reachable`, `without the flag nothing changes`, `a reanchored proposal is written and measured`

## Goal

`--repoint --reanchor` prints `reanchored` proposals beside ADR-069's `repointed` ones. With `--write`, it writes them through ADR-069 T2's write and measurement. Without `--reanchor`, `--repoint` is byte-identical to today.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/mutate.mjs` | edit | `--reanchor` in the flag set and the usage line; `--repoint` calls `reanchorEntry` when it is given |
| `tests/mutate-runner.test.mjs` | edit | a new test over a scratch repository; ADR-069's locked tests unchanged |
| `tests/mutations.json` | edit | the mutants below |

## Ordered Steps

1. [S1] Write the test below and see it fail on an assertion (TDD red): `--reanchor` is refused as an unknown option.
2. [S2] Work in a scratch git repository holding one entry only `reanchorEntry` repoints, and one rewrite:
   - `--repoint` alone prints and exits exactly as today, refusing both.
   - `--repoint --reanchor` prints the re-anchored proposal the same way ADR-069 prints a proposal, with the verdict `reanchored` in place of `repointed`. It refuses the rewrite, naming its rule, and the summary line counts re-anchored proposals separately from repointed ones.
   - With `--write`, only the first entry's `from`/`to` change, and the run measures them.
3. [S3] Add `--reanchor` to the flag set and the usage line. `--reanchor` without `--repoint` is a usage error, exit 2. The same test asserts both: the usage text, printed for an unknown option, names `--reanchor`; and `--reanchor` alone exits 2.
4. [S4] Record mutants with `adr-verify --mutant`: `--reanchor` dropped from the flag set; `--repoint` calling `reanchorEntry` without the flag; `--reanchor` accepted without `--repoint`. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/mutate-runner.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (mutate --repoint --reanchor proposes what repointEntry refused, and --repoint alone is unchanged)' | grep -qx 1
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `mutate --repoint --reanchor proposes what repointEntry refused, and --repoint alone is unchanged` | `tests/mutate-runner.test.mjs` | in a scratch repository: the output without the flag equals today's; with it, the `reanchored` proposal, the refusal and the separate count are printed; `--write` changes only the proposed entry; the usage text names `--reanchor`; `--reanchor` alone exits 2 | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the flag and its test |
| 2 — something selects it | `--reanchor` in `main`'s flag handling; the mutant removing it |
| 3 — the caller can discover it | the usage line, printed for an unknown option |
| 4 — it is used | nothing measures this yet; ADR-071's follow-up counts it |

## Mutation Log

## Invariants

- Without `--reanchor`, `--repoint`'s output and exit code are exactly ADR-069's.
- `--reanchor` writes nothing without `--write`, and takes no lock.

## Risks

- The write path is ADR-069 T2's; a re-anchored entry must pass the same measurement before the command succeeds.

## Stop Condition

Stop and ask if `--repoint`'s output changes without the flag in any test.

## Out of Scope

- Changing ADR-069's verdicts or tests (permanent: boundary: ADR-071 adds a flag beside them)

## Verification Log
