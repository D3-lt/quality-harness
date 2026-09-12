# Task ADR-050-T2: done refuses a moved lock

**Depends-on:** T1
**Covers:** F-1, F-2, F-3, F-4, F-5, F-6, F-7, F-9, UC1-S1, UC1-S2, UC2-S2, UC3-S1, UC3-S2, UC4-S1, UC4-S2, UC5-S1, UC5-S2, UC6-S1, UC6-S2, UC8-S1, UC8-S2
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** none
**Consumes:** first-red hasher / suffix
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the first-red lock at done`

## Goal

`adr-lint` refuses `done` when a locked body or sibling hash moved or vanished, when a named Tests-table body was UNPROVEN at first-red, when `check` moved, vanished, or appeared after absence, or when post-cutover evidence has no first-red hashes. Pre-cutover missing hashes are advised. Comment/whitespace-only edits and new names do not refuse. Unknown `.quality-harness.json` keys are ignored.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | `lock_findings` is the one reader |
| `plugin/bin/adr-lint` | edit | `check_test_lock` inside `protected()`; import `TEST_HASH_REQUIRED_FROM` / `lock_findings` |
| `tests/test-lock.test.mjs` | edit | done / cutover / check / sibling / format cases |
| `tests/mutations.json` | edit | drop `check_test_lock` |

## Ordered Steps

1. [S1] Confirm the failing tests for `Covers:` IDs exist and are red. [proof: acceptance]
2. [S2] Call `lock_findings` from `check_test_lock` on `done_task_ids` only. Skip human-observed. `errors.append(..., evidence=True)` for blocks; advise pre-cutover. [proof: acceptance]
3. [S3] Catalogue a mutant that skips `check_test_lock`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'rewriting a locked assertion refuses done|missing or unreadable named test refuses done as UNPROVEN|post-cutover done without first-red hashes is refused|rewriting a sibling not listed in the Tests table refuses done|rewriting or deleting check refuses done|introducing check after first-red refuses done' tests/test-lock.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `first-red hashes still match at done` | `tests/test-lock.test.mjs` | unchanged bodies permit done | F-1, UC1-S1 | S1, S2 |
| `rewriting a locked assertion refuses done` | `tests/test-lock.test.mjs` | named body hash moved refuses and names the test | F-1, UC1-S2, UC6-S2 | S1, S2 |
| `missing or unreadable named test refuses done as UNPROVEN` | `tests/test-lock.test.mjs` | extract miss is UNPROVEN | F-2, UC2-S2 | S1, S2 |
| `pre-cutover done without hashes is advised` | `tests/test-lock.test.mjs` | date before cutover advises | F-3, UC3-S1 | S1, S2 |
| `post-cutover done without first-red hashes is refused` | `tests/test-lock.test.mjs` | date on/after cutover refuses | F-3, UC3-S2 | S1, S2 |
| `a new test name in the same file does not refuse done` | `tests/test-lock.test.mjs` | new names allowed | F-4, UC4-S1 | S1, S2 |
| `rewriting a sibling not listed in the Tests table refuses done` | `tests/test-lock.test.mjs` | File lock, not only named rows | F-4, UC4-S2 | S1, S2 |
| `a declared check string unchanged at done is allowed` | `tests/test-lock.test.mjs` | declared check stable | F-6, UC5-S1 | S1, S2 |
| `rewriting or deleting check refuses done` | `tests/test-lock.test.mjs` | weaker or deleted check refuses | F-6, UC5-S2 | S1, S2 |
| `a comment-only or whitespace-only edit does not refuse done` | `tests/test-lock.test.mjs` | format is not the lock | F-7, UC6-S1 | S1, S2 |
| `an assertion edit still refuses done` | `tests/test-lock.test.mjs` | string/assertion still hashed | F-7, UC6-S2 | S1, S2 |
| `still-absent check at done is allowed` | `tests/test-lock.test.mjs` | absence stays absence | F-9, UC8-S1 | S1, S2 |
| `introducing check after first-red refuses done` | `tests/test-lock.test.mjs` | later `check` is a new task | F-9, UC8-S2 | S1, S2 |
| `unknown keys in quality-harness json are not a lock` | `tests/test-lock.test.mjs` | `hooks` is ignored | F-5 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | rewrite / unproven / cutover tests |
| 2 — something selects it | `check_test_lock` inside `protected()` next to `check_verification` |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | `python3 plugin/bin/adr-lint` on a `done` task |

## Mutation Log
- 2026-09-12 · 239980b* · mutant survived · exit 0 · `plugin/bin/adr-lint` · skipping check_test_lock lets done through when a locked assertion moved · acceptance-sha256:069f70a40525edbc8dfd4799a56ad86fc05ac5197d99ba364575ccbf292191c6 · covers:the first-red lock at done
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-09-12 · 239980b* · mutant killed · exit 1 · `plugin/bin/adr-lint` · skipping check_test_lock lets done through when a locked assertion moved · acceptance-sha256:069f70a40525edbc8dfd4799a56ad86fc05ac5197d99ba364575ccbf292191c6 · covers:the first-red lock at done

## Invariants

- Import `lock_findings`; do not copy it.
- Pre-cutover missing lock advises; post-cutover refuses.
- Unknown JSON keys are not a lock.
- Human-observed skips the lock.

## Risks

- Demoting the refuse through `strictFrom`.
- Locking only Tests-table rows so a sibling rewrite passes.

## Stop Condition

A rewritten locked assertion still reaches `done`, or pre-cutover corpus rows refuse for missing hashes.

## Out of Scope

- Writer suffix (T1)
- `is_done` (T3)

## Verification Log
- 2026-09-12 · 239980b* · exit 1 · `node --test --test-name-pattern 'rewriting a locked assertion refuses done|missing or unreadable named test refuses done as UNPROVEN|post-cutover done without first-red hashes is refused|rewriting a sibling not listed in the Tests table refuses done|rewriting or deleting check refuses done|introducing check after first-red refuses done' tests/test-lock.test.mjs` · acceptance-sha256:069f70a40525edbc8dfd4799a56ad86fc05ac5197d99ba364575ccbf292191c6 · ms:659
  ```
  --- last 10 line(s) of stdout (of 62 after folding 63 raw)
        at node:internal/process/task_queues:149:7
        at AsyncResource.runInAsyncScope (node:async_hooks:214:14)
        at AsyncResource.runMicrotask (node:internal/process/task_queues:146:8) {
      generatedMessage: true,
      code: 'ERR_ASSERTION',
      actual: false,
      expected: true,
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-09-12 · 239980b* · exit 0 · `node --test --test-name-pattern 'rewriting a locked assertion refuses done|missing or unreadable named test refuses done as UNPROVEN|post-cutover done without first-red hashes is refused|rewriting a sibling not listed in the Tests table refuses done|rewriting or deleting check refuses done|introducing check after first-red refuses done' tests/test-lock.test.mjs` · acceptance-sha256:069f70a40525edbc8dfd4799a56ad86fc05ac5197d99ba364575ccbf292191c6 · ms:536
- 2026-09-12 · 239980b* · exit 0 · `node --test --test-name-pattern 'rewriting a locked assertion refuses done|missing or unreadable named test refuses done as UNPROVEN|post-cutover done without first-red hashes is refused|rewriting a sibling not listed in the Tests table refuses done|rewriting or deleting check refuses done|introducing check after first-red refuses done' tests/test-lock.test.mjs` · acceptance-sha256:069f70a40525edbc8dfd4799a56ad86fc05ac5197d99ba364575ccbf292191c6 · ms:441 · steps:S3
- 2026-09-12 · 239980b* · exit 0 · `node --test --test-name-pattern 'rewriting a locked assertion refuses done|missing or unreadable named test refuses done as UNPROVEN|post-cutover done without first-red hashes is refused|rewriting a sibling not listed in the Tests table refuses done|rewriting or deleting check refuses done|introducing check after first-red refuses done' tests/test-lock.test.mjs` · acceptance-sha256:069f70a40525edbc8dfd4799a56ad86fc05ac5197d99ba364575ccbf292191c6 · ms:1055
- 2026-09-12 · 239980b* · exit 0 · `node --test --test-name-pattern 'rewriting a locked assertion refuses done|missing or unreadable named test refuses done as UNPROVEN|post-cutover done without first-red hashes is refused|rewriting a sibling not listed in the Tests table refuses done|rewriting or deleting check refuses done|introducing check after first-red refuses done' tests/test-lock.test.mjs` · acceptance-sha256:069f70a40525edbc8dfd4799a56ad86fc05ac5197d99ba364575ccbf292191c6 · ms:660 · steps:S3
- 2026-09-12 · 239980b* · exit 0 · `node --test --test-name-pattern 'rewriting a locked assertion refuses done|missing or unreadable named test refuses done as UNPROVEN|post-cutover done without first-red hashes is refused|rewriting a sibling not listed in the Tests table refuses done|rewriting or deleting check refuses done|introducing check after first-red refuses done' tests/test-lock.test.mjs` · acceptance-sha256:069f70a40525edbc8dfd4799a56ad86fc05ac5197d99ba364575ccbf292191c6 · ms:2482 · steps:S1,S2
