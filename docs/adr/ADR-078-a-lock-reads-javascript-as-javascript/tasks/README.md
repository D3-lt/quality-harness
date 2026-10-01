# ADR-078 Tasks

Implementation tasks for ADR-078: A lock reads JavaScript as JavaScript, and says which reading took it. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T2 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Hasher 2 reads, bounds and digests a JavaScript test with a lexer | pending | F-3, F-4, F-5, F-6, UC1-S1, UC1-S2, UC1-S3 | `node --test tests/test-lock.test.mjs` (four named tests pass, the runner exits 0) |
| T2 | A lock records its hasher, is read by it, and is unreadable to older readers | pending | F-1, F-2, F-7, F-9, F-10, F-11, UC1-S4, UC1-S5, UC1-S6, UC1-S7, UC2-S1, UC2-S2, UC2-S3, UC2-S4, UC2-S5 | `node --test tests/test-lock.test.mjs tests/corpus-lint.test.mjs` (eight named tests pass, the runners exit 0) |
| T3 | A relock compares under the recorded hasher and writes hasher 2 | pending | F-8, UC3-S1, UC3-S2 | `node --test tests/test-lock.test.mjs` (two named tests pass, the runner exits 0) |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `extract_test_names(…, hasher=)`, `extract_test_body(…, hasher=)`, `body_digest(…, hasher=)` | T2 | T1 first |
| T2 | `snapshot_lock(…, hasher=)`, the `check@2` record, `decode_lock(…)["hasher"]` | T3 | T2 first |

## Notes

- Every test these tasks turn green was committed as node:test `todo` on `spec/js-lock-lexer`. Each task's first step removes `todo` from its own tests before recording the red run.
- Two of T2's and T3's tests (`a moved body under a frozen hasher-1 lock refuses done`, `a relock of a frozen hasher-1 lock refuses a moved body`) pass before the work: they hold behaviour that must not change, and their red is not the task's red.
- `tests/test-lock.test.mjs` holds tests other records lock: run `python3 scripts/test-locks.py tests/test-lock.test.mjs` before editing anything in it but the ADR-078 block, and keep a locked test byte-identical.
