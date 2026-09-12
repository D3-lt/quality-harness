# Task ADR-050-T3: is_done reads the same hashes

**Depends-on:** T1
**Covers:** F-8, UC7-S1, UC7-S2
**Estimated scope:** S (single file)
**Owner:** zy
**Produces:** none
**Consumes:** first-red hasher / suffix
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `is_done reads the first-red lock`

## Goal

`adr-next is_done` uses `lock_blocks_done` against the same first-red hashes adr-lint reads. A local copy that matches the digest but skips the lock is not done. Pre-cutover digest rows without a suffix stay done. Human-observed stays a sign-off.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-next` | edit | `is_done` calls `lock_blocks_done`; `load` / `foreign_state` pass `git_root` |
| `tests/test-lock.test.mjs` | edit | identity + moved-hash is_done |
| `tests/gate-regressions.py` | edit | `lint.lock_findings is record.lock_findings`; pre-cutover `is_done` still True |
| `tests/mutations.json` | edit | drop the `lock_blocks_done` call |

## Ordered Steps

1. [S1] Confirm the failing tests for `Covers:` IDs exist and are red. [proof: acceptance]
2. [S2] After a matching digest+exit-0, `is_done` returns False when `lock_blocks_done` is true. Pass `root`. Human-observed still returns before the lock. [proof: acceptance]
3. [S3] Catalogue a mutant that returns True after the digest match without consulting the lock. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'writer, done, and is_done agree on the same hashes|is_done refuses when a locked hash moved' tests/test-lock.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `writer, done, and is_done agree on the same hashes` | `tests/test-lock.test.mjs` | one `lock_findings`; shared `TEST_HASH_REQUIRED_FROM` | F-8, UC7-S1 | S1, S2 |
| `is_done refuses when a locked hash moved` | `tests/test-lock.test.mjs` | digest match is not done when the lock moved | F-8, UC7-S2 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | UC7 tests |
| 2 — something selects it | `load` passes `root` into `is_done` |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | SessionStart / `adr-next` ready list |

## Mutation Log
- 2026-09-12 · 239980b* · mutant killed · exit 1 · `plugin/bin/adr-next` · is_done treating a matching digest as done when the locked hash moved · acceptance-sha256:6e67ae825b6d231efd24ef64f0cd751a85ea4af528a44c82514adc0d1b267040 · covers:is_done reads the first-red lock

## Invariants

- Existing `is_done` tests that pass no root and no suffix stay True.
- Lock suffix present and `root is None` is fail-closed.
- Human-observed does not consult the lock.

## Risks

- Passing no `root` from `load`, so every locked task fails closed.
- Breaking pre-cutover `is_done` on 2026-08-22 digest rows.

## Stop Condition

Moved lock still `is_done` True, or pre-cutover digest rows become not-done.

## Out of Scope

- Writer (T1)
- `check_test_lock` (T2)

## Verification Log
- 2026-09-12 · 239980b* · exit 1 · `node --test --test-name-pattern 'writer, done, and is_done agree on the same hashes|is_done refuses when a locked hash moved' tests/test-lock.test.mjs` · acceptance-sha256:6e67ae825b6d231efd24ef64f0cd751a85ea4af528a44c82514adc0d1b267040 · ms:377
  ```
  --- last 10 line(s) of stdout (of 39 after folding 40 raw)
        at Test.postRun (node:internal/test_runner/test:1235:19)
        at Test.run (node:internal/test_runner/test:1163:12)
        at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: 1,
      expected: 0,
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-09-12 · 239980b* · exit 0 · `node --test --test-name-pattern 'writer, done, and is_done agree on the same hashes|is_done refuses when a locked hash moved' tests/test-lock.test.mjs` · acceptance-sha256:6e67ae825b6d231efd24ef64f0cd751a85ea4af528a44c82514adc0d1b267040 · ms:278
- 2026-09-12 · 239980b* · exit 0 · `node --test --test-name-pattern 'writer, done, and is_done agree on the same hashes|is_done refuses when a locked hash moved' tests/test-lock.test.mjs` · acceptance-sha256:6e67ae825b6d231efd24ef64f0cd751a85ea4af528a44c82514adc0d1b267040 · ms:586 · steps:S3
- 2026-09-12 · 239980b* · exit 0 · `node --test --test-name-pattern 'writer, done, and is_done agree on the same hashes|is_done refuses when a locked hash moved' tests/test-lock.test.mjs` · acceptance-sha256:6e67ae825b6d231efd24ef64f0cd751a85ea4af528a44c82514adc0d1b267040 · ms:368 · steps:S1,S2
