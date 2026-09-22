# Task ADR-060-T4: A command naming commit or push is warned before it runs

**Depends-on:** T3
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** rule P
**Consumes:** `observe(cwd)`, the state directory, the session event log and delivery (T1); `checks.jsonl` written by `qh-check` (T2); the word rule, the reviewer deny and R3 (T3); `tests/observed-events.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `rule P warning before the command runs`, `the word rule selecting publish.requested`, `the rule-and-evidence key for P`, `the check opt-in`, `the kept pre-publish artifact pass`, `each named test actually running`, `the regression suites that pinned the old commit advisory`

## Goal

Outside a read-only role, a PreToolUse Bash command the word rule matches raises `publish.requested`. P advises when the tree or index is not checked and differs from `session.started`, once per `(tree, index, revision)`. The old PreToolUse commit advisory and its unresolved-deletion advisory go, while its artifact pass stays until T6.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/observed-events.test.mjs` | edit | the test below |
| `plugin/scripts/lifecycle.mjs` | edit | `publish.requested` and P; the old PreToolUse commit branch loses its advisory and deletion advisory and keeps its `runArtifactGates` call |
| `tests/mutations.json` | edit | entries whose `from` lives in the removed commit and deletion advisories are retired |
| `tests/lifecycle.test.mjs`, `tests/advice-accuracy.test.mjs`, `tests/unread-advice.test.mjs`, `tests/unread-advice-followon.test.mjs`, `tests/leftovers-after-adr053.test.mjs`, `tests/read-only-arguments.test.mjs` | edit | 32 tests pinned the removed advisory. Those that were only about it go; those that used it as a vehicle (the one-line headline, the slow-hook line, the no-block wording, the named check, the gitignored write) now pin rule P. ADR-053's check-then-commit chain tests and `tests/adr053-stress.mjs` go with the clause ADR-060 invalidates |
| `tests/mutations.json` | edit | 13 entries whose `from` lived in the removed advisory, the deletion advisory or the publish-suffix peel are retired |
| `docs/adr/ADR-054…md`, `ADR-055…md`, `ADR-056…md` | edit | their `Governs:` named `tests/adr053-stress.mjs`, which this task deletes (CLAUDE.md §1) |
| ADR-058 T1/T4/T7, ADR-059 T4–T7 and T10 | edit | their locked tests moved or went with the advisory: each task was re-locked with `adr-verify --relock --replace-hashes` and its fence re-run. ADR-058 T1, T4 and T7 are marked `superseded` in its task index, because their acceptance names tests ADR-060 removes |
| `tests/lifecycle.test.mjs` (pre-publish artifact pass) | edit | a survived mutant showed nothing pinned the kept artifact pass; a test now does (CLAUDE.md §4) |

## Ordered Steps

1. [S1] Write the test and see it fail on an assertion (TDD red).
2. [S2] Raise `publish.requested` from the word rule and implement P as in ADR-060's Decision. Remove the old commit advisory and the unresolved-deletion advisory, keeping the pre-publish artifact pass.
3. [S3] Remove the tests of the removed advisories. [proof: acceptance]
4. [S4] Run the fence green and record mutants:
   - fire P on a checked tree;
   - drop the revision from P's key;
   - let P's message say the command publishes this repository;
   - select `publish.requested` with `isGitPublishCommand` instead of the word rule.

   [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(a command naming commit or push is warned before it runs)$' tests/observed-events.test.mjs 2>&1) \
  || { printf '%s\n' "$out"; exit 1; }
for name in 'a command naming commit or push is warned before it runs'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { printf '%s\n' "$out"; echo "did not run: $name"; exit 1; }; done \
  && node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs tests/hook-work.test.mjs tests/gate-rules.test.mjs tests/staged-product.test.mjs tests/unread-advice.test.mjs tests/unread-advice-followon.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a command naming commit or push is warned before it runs` | `tests/observed-events.test.mjs` | Temp repositories with a declared check, coordinator hooks driven as processes.<br>• With an unchecked edit, `git commit -m x` gets P; `git push` in the same state gets nothing, because P speaks once per state, not because a push is exempt.<br>• After another edit, `pwsh -Command 'git push'` gets P; after another, `git -C <other> commit` gets P.<br>• After `qh-check` passes, `git commit -m x` gets nothing; after `qh-check` then fails on the same tree, it gets P again.<br>• A repository without a check gets nothing.<br>• The message names `qh-check` and does not say the command publishes this repository. | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | PreToolUse Bash routes through the loop; the test drives it as a process; S4's mutants break each |
| 3 — the caller can discover it | the message names `qh-check` |
| 4 — it is used | every commit and push a session runs through Bash |

## Mutation Log
- 2026-09-17 · 332a707* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · P speaks on a checked tree, so a passing qh-check no longer silences it · acceptance-sha256:aef6db0f5871b09c8fc901a31b8fdc1752ca9314c1fed3d007df3c15083c93e0 · covers:rule P warning before the command runs
- 2026-09-17 · 332a707* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the key drops the evidence revision, so a failing check after a warned state stays silent · acceptance-sha256:aef6db0f5871b09c8fc901a31b8fdc1752ca9314c1fed3d007df3c15083c93e0 · covers:the rule-and-evidence key for P
- 2026-09-17 · 332a707* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the message claims the command publishes this repository · acceptance-sha256:aef6db0f5871b09c8fc901a31b8fdc1752ca9314c1fed3d007df3c15083c93e0 · covers:rule P warning before the command runs
- 2026-09-17 · 332a707* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · publish.requested is selected by the old structural recogniser, so a wrapped pwsh push raises no event · acceptance-sha256:aef6db0f5871b09c8fc901a31b8fdc1752ca9314c1fed3d007df3c15083c93e0 · covers:the word rule selecting publish.requested
- 2026-09-17 · 332a707* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · P speaks in a repository that declares no check · acceptance-sha256:aef6db0f5871b09c8fc901a31b8fdc1752ca9314c1fed3d007df3c15083c93e0 · covers:the check opt-in
- 2026-09-17 · 332a707* · mutant survived · exit 0 · `plugin/scripts/lifecycle.mjs` · the pre-publish artifact pass is gone before T6 replaces it · acceptance-sha256:aef6db0f5871b09c8fc901a31b8fdc1752ca9314c1fed3d007df3c15083c93e0 · covers:the kept pre-publish artifact pass
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-09-17 · 332a707* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the person loses the one-line headline at a tool boundary, which only the converted suites pin · acceptance-sha256:aef6db0f5871b09c8fc901a31b8fdc1752ca9314c1fed3d007df3c15083c93e0 · covers:the regression suites that pinned the old commit advisory
- 2026-09-17 · 332a707* · mutant killed · exit 1 · `tests/observed-events.test.mjs` · a renamed test selects nothing and the per-name ok grep must refuse it · acceptance-sha256:aef6db0f5871b09c8fc901a31b8fdc1752ca9314c1fed3d007df3c15083c93e0 · covers:each named test actually running
- 2026-09-17 · 332a707* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the pre-publish artifact pass is gone before T6 replaces it; the new pinning test in tests/lifecycle.test.mjs catches it · acceptance-sha256:aef6db0f5871b09c8fc901a31b8fdc1752ca9314c1fed3d007df3c15083c93e0 · covers:the kept pre-publish artifact pass

## Invariants

- The pre-publish artifact pass runs as before until T6.
- Every `tests/mutations.json` entry matches exactly once after this task.
- No command text is read except by the word rule.

## Risks

- P also warns on a command that only mentions a word; it does so once per state, named in ADR-060's Consequences.

## Stop Condition

Stop and ask if a PreToolUse Bash payload lacks `tool_input.command`.

## Out of Scope

- Warning about the state of a repository other than the hook's `cwd` (permanent: boundary: the observation is of the hook's `cwd`)

## Verification Log
- 2026-09-17 · 332a707* · exit 1 · `set -o pipefail …` · acceptance-sha256:aef6db0f5871b09c8fc901a31b8fdc1752ca9314c1fed3d007df3c15083c93e0 · ms:610 · test-lock-sha256:769c36b8d4adfdd823f053c9f200be582e8357224fc68a8e7bbde787a8aefc92 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIGNoZWNrIGV2ZW50IGlzIHdyaXR0ZW4gYnkgcWgtY2hlY2sJZjgwMzk5YmMxY2EyZTlkMDI5MTRjYWM2NDlkNzYwNWEzMzljZTU4YTY0MTFkNDZiOGU0MWRkOWZiNGI1ZTc4Ywpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIGNvbW1hbmQgbmFtaW5nIGNvbW1pdCBvciBwdXNoIGlzIHdhcm5lZCBiZWZvcmUgaXQgcnVucwk5MDE3ZmIxMzdiZGYzMTRkNmM4MGI0N2ExOGExN2RhZGNiOWQ1OTBiYTRmNzg2MTNjNzBlY2I2MDRhNGNmNmU1CmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgcmVhZC1vbmx5IHJvbGUgY2Fubm90IGNvbW1pdCBvciBwdXNoIGFuZCBpdHMgb3RoZXIgY2hhbmdlcyBhcmUgcmVwb3J0ZWQJOWViNjZmZTlmYjZhNWZiYjQ5YjE4MDU4ODEzYTdmNDRjYWE0ODg2ZDJmMWIyNjRhZGQ1YjMyMjEyNmY0NDE1YQpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIHR1cm4gZW5kIG9ic2VydmVzIHRoZSB0cmVlIHdpdGhvdXQgcmVhZGluZyBhbnkgY29tbWFuZAlkNzhkNDJjYzBmOGJhYzdhZmRiODFiYTc3YzUzOWQyZjRhZmM4ZWFkMWQ5NTcwNmNiZjJjNDNjYjE3ZTgzZmZhCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCW9ic2VydmluZyB3cml0ZXMgbm90aGluZyBpbnRvIHRoZSByZXBvc2l0b3J5CWQ2NWUyZjQ2NzQzNzI0ODNmZmYwMzhkNGZlYmFlYTJkODJhYTczNDA0YTJkNWFmOWEyMTBlZDhiMDMxMmY2YmEKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJb25lIGhvb2sgZGVsaXZlcnMgZXZlcnkgYWN0aW9uIGl0IHJlY29yZHMJNzhlZmE1NjhmMzFlOGE5MTRjN2RkNGQwZjI2YWY0ODM4MWU0OGMxZTNmYWUyYWM0YzU1NmY0MjgzNGZmNDQyZA
  ```
  --- last 10 line(s) of stdout (of 30 after folding 30 raw)
    ...
  1..1
  # tests 1
  # suites 0
  # pass 0
  # fail 1
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 513.799667
  ```
- 2026-09-17 · 332a707* · exit 0 · `set -o pipefail …` · acceptance-sha256:aef6db0f5871b09c8fc901a31b8fdc1752ca9314c1fed3d007df3c15083c93e0 · ms:24822
- 2026-09-17 · 332a707* · exit 0 · `set -o pipefail …` · acceptance-sha256:aef6db0f5871b09c8fc901a31b8fdc1752ca9314c1fed3d007df3c15083c93e0 · ms:23381
- 2026-09-17 · 332a707* · exit 0 · `set -o pipefail …` · acceptance-sha256:aef6db0f5871b09c8fc901a31b8fdc1752ca9314c1fed3d007df3c15083c93e0 · ms:23407
- 2026-09-17 · 332a707* · exit 0 · `set -o pipefail …` · acceptance-sha256:aef6db0f5871b09c8fc901a31b8fdc1752ca9314c1fed3d007df3c15083c93e0 · ms:23382
- 2026-09-17 · 332a707* · exit 0 · `set -o pipefail …` · acceptance-sha256:aef6db0f5871b09c8fc901a31b8fdc1752ca9314c1fed3d007df3c15083c93e0 · ms:23485
- 2026-09-17 · 332a707* · exit 0 · `set -o pipefail …` · acceptance-sha256:aef6db0f5871b09c8fc901a31b8fdc1752ca9314c1fed3d007df3c15083c93e0 · ms:23359
- 2026-09-17 · 332a707* · exit 0 · `set -o pipefail …` · acceptance-sha256:aef6db0f5871b09c8fc901a31b8fdc1752ca9314c1fed3d007df3c15083c93e0 · ms:23394
- 2026-09-17 · 332a707* · exit 0 · `set -o pipefail …` · acceptance-sha256:aef6db0f5871b09c8fc901a31b8fdc1752ca9314c1fed3d007df3c15083c93e0 · ms:23323
- 2026-09-17 · 332a707* · exit 0 · `set -o pipefail …` · acceptance-sha256:aef6db0f5871b09c8fc901a31b8fdc1752ca9314c1fed3d007df3c15083c93e0 · ms:23880
