# Task ADR-050-T1: Writer records first-red hashes

**Depends-on:** none
**Covers:** F-1, F-2, UC2-S1
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** first-red hasher / suffix
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the first-red lock suffix`

## Goal

`adr-verify` writes a tool-written SHA-256 of each extractable Tests-table File body, and of declared `check` or its absence, onto the first TDD-red Verification Log row. A named body it cannot extract is UNPROVEN, not a skip. A later red does not replace the suffix.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | hasher, encode/decode, `first_red_lock_suffix` |
| `plugin/bin/adr-verify` | edit | `record_run` appends the suffix on first `exit != 0`; `ENTRY_RE` accepts it |
| `plugin/bin/adr-lint` | edit | `VLOG_RE` / `VLOG_DIGEST_RE` / `VLOG_TIMED_RE` accept the suffix so the writer is not refused |
| `plugin/bin/adr-next` | edit | `VLOG_DIGEST_RE` accepts the suffix |
| `tests/test-lock.test.mjs` | add | UC2-S1 through `python3 plugin/bin/adr-verify` |
| `tests/gate-regressions.py` | edit | three regexes accept a lock-bearing red row |
| `tests/mutations.json` | edit | drop the suffix write |

## Ordered Steps

1. [S1] Confirm the failing test for `Covers:` IDs exists and is red. [proof: acceptance]
2. [S2] Put the hasher in `plugin/lib/record.py`. `record_run` appends `first_red_lock_suffix` on the first TDD-red only. Do not call `code_only`. Keep string literals. [proof: acceptance]
3. [S3] Widen `ENTRY_RE` and the three lint/next readers together so the writer is not refused by its own grammar. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'first TDD-red row carries a tool-written hash for each named test' tests/test-lock.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `first TDD-red row carries a tool-written hash for each named test` | `tests/test-lock.test.mjs` | `adr-verify` writes `test-lock-sha256` / `test-lock-b64` on first TDD-red | F-1, F-2, UC2-S1 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | UC2-S1 |
| 2 — something selects it | `record_run` calls `first_red_lock_suffix` when `code != 0` |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | `python3 plugin/bin/adr-verify <task.md>` is the served path |

## Mutation Log
- 2026-09-12 · 239980b* · mutant killed · exit 1 · `plugin/bin/adr-verify` · dropping the suffix write leaves first-red without test-lock-sha256 · acceptance-sha256:05c7996aa59242989e577c1734dbe4218d3ba9f32b5b4fa64d57c0f4128fe73b · covers:the first-red lock suffix

## Invariants

- Lock only the first TDD-red. Later reds do not replace it.
- Named extract miss is UNPROVEN, not omitted.
- Do not hash with `code_only`.
- Do not put the lock on green / `CLAIM_RE` rows.

## Risks

- Updating lint regexes after the writer, so first-red writes die in `refuse_unreadable`.
- A later red replacing the contract.

## Stop Condition

First-red row has no `test-lock-sha256`, or a later red overwrites it.

## Out of Scope

- `check_test_lock` at done (T2)
- `is_done` (T3)

## Verification Log
- 2026-09-12 · 239980b* · exit 1 · `node --test --test-name-pattern 'first TDD-red row carries a tool-written hash for each named test' tests/test-lock.test.mjs` · acceptance-sha256:05c7996aa59242989e577c1734dbe4218d3ba9f32b5b4fa64d57c0f4128fe73b · ms:249
  ```
  --- last 10 line(s) of stdout (of 30 after folding 31 raw)
        at Test.run (node:internal/test_runner/test:1106:25)
        at Test.start (node:internal/test_runner/test:1003:17)
        at startSubtestAfterBootstrap (node:internal/test_runner/harness:358:17) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: 0,
      expected: 0,
      operator: 'notStrictEqual',
      diff: 'simple'
    }
  ```
- 2026-09-12 · 239980b* · exit 1 · `node --test --test-name-pattern 'first TDD-red row carries a tool-written hash for each named test' tests/test-lock.test.mjs` · acceptance-sha256:05c7996aa59242989e577c1734dbe4218d3ba9f32b5b4fa64d57c0f4128fe73b · ms:419
  ```
  --- last 10 line(s) of stdout (of 86 after folding 87 raw)
        at Test.run (node:internal/test_runner/test:1106:25)
        at Test.start (node:internal/test_runner/test:1003:17)
        at startSubtestAfterBootstrap (node:internal/test_runner/harness:358:17) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: "# Task ADR-050-T1: lock probe\n\n## Goal\n\nTDD-red lock.\n\n## Affected Files\n\n| File | Change | Why |\n|------|--------|-----|\n| `prod.mjs` | add | product |\n\n## Ordered Steps\n\n1. [S1] Confirm the failing test.\n\n## Acceptance\n\n```bash\nnode --test tests/lock-subject.test.mjs\n```\n\n## Tests\n\n| Test name | File | Verifies | Covers |\n|-----------|------|----------|--------|\n| `locked dirty` | `tests/lock-subject.test.mjs` | lock | F-1 |\n\n## Invariants\n\n- lock\n\n## Risks\n\n- none\n\n## Stop Condition\n\nStop.\n\n## Out of Scope\n\n- none\n\n## Verification Log\n- 2026-09-12 · no-git · exit 1 · `node --test tests/lock-subject.test.mjs` · acceptance-sha256:39d40709445b993827c6689c480fbfccde7f10e807343c0238b7a1e5f912767f · ms:106\n  ```\n  --- last 10 line(s) of stdout (of 30 after folding 30 raw)\n        at Test.run (node:internal/test_runner/test:1106:25)\n        at Test.start (node:internal/test_runner/test:1003:17)\n        at startSubtestAfterBootstrap (node:internal/test_runner/harness:358:17) {\n      generatedMessage: true,\n      code: 'ERR_ASSERTION',\n      actual: 0,\n      expected: 2,\n      operator: 'strictEqual',\n      diff: 'simple'\n    }\n  ```\n\n",
      expected: /test-lock-sha256:[0-9a-f]{64}/,
      operator: 'match',
      diff: 'simple'
    }
  ```
- 2026-09-12 · 239980b* · exit 0 · `node --test --test-name-pattern 'first TDD-red row carries a tool-written hash for each named test' tests/test-lock.test.mjs` · acceptance-sha256:05c7996aa59242989e577c1734dbe4218d3ba9f32b5b4fa64d57c0f4128fe73b · ms:297
- 2026-09-12 · 239980b* · exit 0 · `node --test --test-name-pattern 'first TDD-red row carries a tool-written hash for each named test' tests/test-lock.test.mjs` · acceptance-sha256:05c7996aa59242989e577c1734dbe4218d3ba9f32b5b4fa64d57c0f4128fe73b · ms:211 · steps:S3
- 2026-09-12 · 239980b* · exit 0 · `node --test --test-name-pattern 'first TDD-red row carries a tool-written hash for each named test' tests/test-lock.test.mjs` · acceptance-sha256:05c7996aa59242989e577c1734dbe4218d3ba9f32b5b4fa64d57c0f4128fe73b · ms:1724 · steps:S1,S2
