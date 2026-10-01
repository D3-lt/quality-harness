# Task ADR-078-T2: A lock records its hasher, is read by it, and is unreadable to older readers

**Depends-on:** T1
**Covers:** F-1, F-2, F-7, F-9, F-10, F-11, UC1-S4, UC1-S5, UC1-S6, UC1-S7, UC2-S1, UC2-S2, UC2-S3, UC2-S4, UC2-S5
**Estimated scope:** M (one module, one test block, the catalogue)
**Owner:** unassigned
**Produces:** `snapshot_lock(…, hasher=)`, the `check@2` record, `decode_lock(…)["hasher"]`
**Consumes:** `extract_test_names(…, hasher=)`, `extract_test_body(…, hasher=)` and `body_digest(…, hasher=)` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a new lock is taken by hasher 2`, `a lock is compared under its own hasher`, `an unknown hasher is unproven`, `a differing hasher-1 lock is advised`, `a hasher-2 lock is unreadable to 3.3.0`, `the TypeScript flag reaches the lexer`

## Goal

`snapshot_lock` takes hasher 2 by default and `encode_lock` records it as `check@2`, which a 3.3.0 reader cannot read; `decode_lock` reads either form; `lock_findings` and `lock_blocks_done` compare under the recorded hasher, refuse a hasher they do not know as UNPROVEN, and advise on a hasher-1 lock hasher 2 reads differently (ADR-078 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | `snapshot_lock(…, hasher=2)`: hasher 2 for JavaScript-family suffixes, TypeScript ones flagged, hasher 1 for every other file; `encode_lock` writes a hasher-1 lock byte for byte as today and a hasher-2 lock with `check@2`; `decode_lock` reads either; `lock_findings` and `lock_blocks_done` compare under it; the advice line |
| `tests/test-lock.test.mjs` | edit | remove `todo` from this task's eight tests |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Remove `todo` from the eight tests in the Tests table and record the red run (TDD red). [proof: acceptance]
2. [S2] `snapshot_lock(root, tests, hasher=2)`: read a JavaScript-family file with the given hasher, telling the lexer when the suffix is TypeScript, and every other file with hasher 1; the snapshot carries `hasher`.
3. [S3] `encode_lock`: a hasher-1 snapshot encodes exactly as today (the frozen 2026-10-01 bytes); any other writes its check as `check@<n>`. `decode_lock` returns `hasher` (plain `check` → 1).
4. [S4] `lock_findings` and `lock_blocks_done` take the current snapshot under the recorded hasher; a hasher other than 1 or 2 is a block naming it, UNPROVEN, with no body compared.
5. [S5] For a hasher-1 lock, compare its snapshot with a hasher-2 snapshot of the same rows; where any JavaScript-family name or body differs, add one advice line naming the task, "hasher 2" and `adr-verify --relock`. `adr-lint` prints it; `adr-next` keeps discarding advice.
6. [S6] Measure `adr-lint` over `docs/adr` before and after this task, and record both times in the commit message. [proof: human: the session compares the two wall-clock times against the Stop Condition]
7. [S7] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/test-lock.test.mjs tests/corpus-lint.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE 'ok [0-9]+ - (a lock taken before the lexer is read as it was taken|a hasher-1 lock that hasher 2 reads differently is advised, naming the relock|a moved body under a frozen hasher-1 lock refuses done|a lock taken by hasher 2 cannot be read by the 3.3.0 reader|under hasher 2 a change after a nested template moves the lock|an unterminated literal leaves the tests after it unproven under hasher 2|a slash hasher 2 cannot place leaves the tests it reaches unproven|a lock naming a hasher this reader does not know is unproven)' "$T")" -eq 8
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a lock taken before the lexer is read as it was taken` | `tests/test-lock.test.mjs` | hasher 1 encodes the frozen bytes; the frozen lock stays green in `lock_findings` and `lock_blocks_done`; a new lock is `check@2` and leaves a string-held name unproven | F-1, UC1-S5, UC2-S1 | S2, S3, S4 |
| `a hasher-1 lock that hasher 2 reads differently is advised, naming the relock` | `tests/test-lock.test.mjs` | advice, never a block; none where both readings agree | F-2, UC2-S2 | S5 |
| `a moved body under a frozen hasher-1 lock refuses done` | `tests/test-lock.test.mjs` | held: `lock_findings` and `lock_blocks_done` refuse a moved hasher-1 body (passes before the work) | UC2-S3 | S4 |
| `a lock taken by hasher 2 cannot be read by the 3.3.0 reader` | `tests/test-lock.test.mjs` | the 3.3.0 `decode_lock`, copied verbatim, returns nothing | F-11, UC2-S5 | S3 |
| `under hasher 2 a change after a nested template moves the lock` | `tests/test-lock.test.mjs` | the Codex pair hashes alike under hasher 1 and moves the lock under hasher 2 | F-10, UC1-S7 | S2 |
| `an unterminated literal leaves the tests after it unproven under hasher 2` | `tests/test-lock.test.mjs` | the test before is hashed; the open one and the one after are UNPROVEN | F-7, UC1-S4 | S2 |
| `a slash hasher 2 cannot place leaves the tests it reaches unproven` | `tests/test-lock.test.mjs` | after `}`, and after `>` in a `.ts` file | UC1-S6 | S2 |
| `a lock naming a hasher this reader does not know is unproven` | `tests/test-lock.test.mjs` | UNPROVEN, no body compared | F-9, UC2-S4 | S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the tests above |
| 2 — something selects it | `first_red_lock_suffix` and `lock_suffix_for_run` call `snapshot_lock` with its default, so every `adr-verify` first red takes hasher 2; a mutant reverting the default is killed by F-1's test |
| 3 — the caller can discover it | the `check@2` record in the decoded payload, and the advice line |
| 4 — it is used | `tests/corpus-lint.test.mjs` runs `adr-lint` over every active record |

## Mutation Log

## Invariants

- Every active record in `docs/adr` keeps its `adr-lint` verdict.
- A lock taken under hasher 1 encodes to exactly the bytes it encoded to before (the frozen fixture).

## Risks

- A locked test that pins a payload byte for byte: check `scripts/test-locks.py` first; add a test beside it rather than editing it.
- `--relock` (`record_relock`, `moved_lock_bodies`) is T3's: until T3 lands it compares a hasher-1 lock with a hasher-2 reading.

## Stop Condition

Stop and ask if `adr-lint` over `docs/adr` takes more than 25% longer after this task than before, or if any active record's verdict changes.

## Out of Scope

- `--relock` — T3.

## Verification Log
