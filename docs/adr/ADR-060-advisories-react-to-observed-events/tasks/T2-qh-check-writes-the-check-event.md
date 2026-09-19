# Task ADR-060-T2: qh-check writes the check event

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** `checks.jsonl` written by `qh-check`
**Consumes:** `observe(cwd)`, the state directory, the session event log and delivery (T1); `tests/observed-events.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `qh-check recording the observation before and after`, `the import order`, `a zero-test reading independent of the command's spelling`, `unstarted and timeout kept from the verdict`, `the kept output tail`, `the loop importing unseen records`, `the shipped-gate conventions`, `each named test actually running`

## Goal

`qh-check` runs the project's check at the repository root. It appends `{before, after, exit, signal, command, origin, verdict, at}` to `checks.jsonl` in the state directory and exits with the check's code. The loop turns each unseen record into exactly one event, in the order ADR-060's Decision gives: `check.unstarted`, `check.timeout`, `check.failed`, `check.unproven`, `check.no-work`, `check.passed`.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/observed-events.test.mjs` | edit | the test below |
| `plugin/scripts/qh-check.mjs` | add | resolve root and check, observe, run, record |
| `plugin/bin/qh-check` | add | Python bin that answers `--version` and execs `node plugin/scripts/qh-check.mjs` |
| `plugin/bin/qh-check.cmd` | add | the Windows shim, as the other bins have |
| `plugin/scripts/lifecycle.mjs` | edit | `validationVerdict` can read zero-test output without the spelling test; the loop imports unseen check records |
| `tests/mutations.json` | edit | the catalogue entry every shipped bin needs |
| `README.md` | edit | names the new gate, as every shipped gate is named |
| `plugin/scripts/standalone-link.mjs` | edit | only if its gate forwarder list is not derived from `plugin/bin` |
| `tests/gate-rules.test.mjs` | edit | the unknown-flag table has a case for every bundled gate, so `qh-check` gets one. Found by the selftest, a gap in this task's original file list |
| `plugin/scripts/lifecycle.mjs` (`main`) | edit | output leaves through `deliver`, which T1's step S4 required and T1 did not do; the orphan sweep reports a shipped function nothing calls |
| `docs/adr/ADR-060-advisories-react-to-observed-events.md` | edit | `Governs:` gains `plugin/bin/qh-check`, `plugin/bin/qh-check.cmd` and `plugin/scripts/qh-check.mjs` in the commit that creates them; the corpus test refuses a `Governs:` path that does not exist |

## Ordered Steps

1. [S1] Write the test and see it fail on an assertion (TDD red).
2. [S2] Add `qh-check.mjs`:
   - resolve the root (the canonical `cwd` outside git) and `projectCheckCommand` with `checkCommandOrigin`; with no command, say so and exit 2;
   - observe, run the command at the root with streamed output, keep the last 64 KiB, forward SIGINT and SIGTERM, and observe again;
   - record `validationVerdict`'s reading of the kept output and exit status, with the zero-test reading independent of the command's spelling;
   - append the record and exit with the command's code (1 with the signal recorded when killed).

   Add the Python bin with `--version` and the `.cmd` shim.
3. [S3] Import unseen records as exactly one event each, the first that applies:
   - verdict `unstarted` is `check.unstarted`;
   - verdict `timeout`, or a recorded signal, is `check.timeout`;
   - a non-zero exit is `check.failed`;
   - inside a git repository, differing `before` and `after` trees, or a not-ok observation, is `check.unproven`; outside one this step does not apply;
   - verdict `no-work` is `check.no-work`;
   - anything else is `check.passed`.
4. [S4] Add the catalogue entry and the README line; `tests/gates.test.mjs` and `tests/package.test.mjs` pass. [proof: acceptance]
5. [S5] Run the fence green and record mutants:
   - record the after-observation as `before`;
   - import a tree-changing pass as passed;
   - import a pass outside git as `check.unproven`;
   - read zero-test output only for recognised test commands;
   - import exit 127 as `check.failed`;
   - keep the first 64 KiB instead of the last;
   - never import.

   [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(a check event is written by qh-check)$' tests/observed-events.test.mjs 2>&1) \
  || { printf '%s\n' "$out"; exit 1; }
for name in 'a check event is written by qh-check'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { printf '%s\n' "$out"; echo "did not run: $name"; exit 1; }; done \
  && node --test tests/gates.test.mjs tests/package.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a check event is written by qh-check` | `tests/observed-events.test.mjs` | Temp repository, `qh-check` run from a subdirectory with a declared `check` of `sh check.sh`.<br>• Exit 0 imports `check.passed`; exit 1 imports `check.failed` and `qh-check` exits 1; creating a file imports `check.unproven`.<br>• A zero-test summary with exit 0 imports `check.no-work`, including after 100 KiB of earlier output.<br>• A missing command inside the script (exit 127) imports `check.unstarted`; `exit 124` imports `check.timeout`; SIGTERM to `qh-check` imports `check.timeout` with the signal.<br>• No check exits 2 and records nothing.<br>• Outside git the record lands in the temporary state directory, and exit 0 imports `check.passed`, not `check.unproven`.<br>• Records carry `origin`. | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | the test runs `plugin/bin/qh-check` as a process and imports through a hook; S5's mutants break each |
| 3 — the caller can discover it | `tests/gates.test.mjs` requires `--version` from every bin; T5 names it in guidance and messages |
| 4 — it is used | T4's and T5's rules read check events |

## Mutation Log
- 2026-09-17 · 639b8ed* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · the after-observation is recorded as before, so a check that writes a file is never unproven · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · covers:qh-check recording the observation before and after
- 2026-09-17 · 639b8ed* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a tree-changing pass imports as passed · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · covers:the import order
- 2026-09-17 · 639b8ed* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a pass outside git imports as unproven, so a non-git check can never clear anything · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · covers:the import order
- 2026-09-17 · 639b8ed* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · the zero-test reading needs a recognised test command again, so sh check.sh printing tests 0 is passed · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · covers:a zero-test reading independent of the command's spelling
- 2026-09-17 · 639b8ed* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a missing command inside the check (exit 127) imports as failed · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · covers:unstarted and timeout kept from the verdict
- 2026-09-17 · 639b8ed* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · the first 64 KiB are kept, so a summary printed after 100 KiB of output is lost · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · covers:the kept output tail
- 2026-09-17 · 639b8ed* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · no record is ever imported, so the log holds no check event · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · covers:the loop importing unseen records
- 2026-09-17 · 639b8ed* · mutant killed · exit 1 · `plugin/bin/qh-check` · --version runs the check instead of answering, so the shipped-gate --version test fails · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · covers:the shipped-gate conventions
- 2026-09-17 · 639b8ed* · mutant killed · exit 1 · `tests/observed-events.test.mjs` · a renamed test selects nothing and the per-name ok grep must refuse it · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · covers:each named test actually running
- 2026-09-17 · 639b8ed* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a tree-changing pass imports as passed (re-recorded on the sameObservation form) · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · covers:the import order
- 2026-09-17 · 639b8ed* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a pass outside git imports as unproven (re-recorded on the sameObservation form) · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · covers:the import order

## Invariants

- `qh-check`'s exit code is the check's exit code.
- `qh-check` writes only to the state directory.

## Risks

- A check that writes build output into the tree never passes; `check.unproven` makes that visible, so the project can gitignore the output.

## Stop Condition

Stop and ask if a bin cannot exec `node` on the Windows CI runner.

## Out of Scope

- Sharding or caching a check's result (permanent: boundary: `qh-check` records what one run observed)

## Verification Log
- 2026-09-17 · 639b8ed* · exit 1 · `set -o pipefail …` · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · ms:104 · test-lock-sha256:73ce2fe09017fa1383c3821d7571dd5b406d41b340e75c2c84c295014282267d · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIGNoZWNrIGV2ZW50IGlzIHdyaXR0ZW4gYnkgcWgtY2hlY2sJZjgwMzk5YmMxY2EyZTlkMDI5MTRjYWM2NDlkNzYwNWEzMzljZTU4YTY0MTFkNDZiOGU0MWRkOWZiNGI1ZTc4Ywpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIHR1cm4gZW5kIG9ic2VydmVzIHRoZSB0cmVlIHdpdGhvdXQgcmVhZGluZyBhbnkgY29tbWFuZAlkNzhkNDJjYzBmOGJhYzdhZmRiODFiYTc3YzUzOWQyZjRhZmM4ZWFkMWQ5NTcwNmNiZjJjNDNjYjE3ZTgzZmZhCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCW9ic2VydmluZyB3cml0ZXMgbm90aGluZyBpbnRvIHRoZSByZXBvc2l0b3J5CWQ2NWUyZjQ2NzQzNzI0ODNmZmYwMzhkNGZlYmFlYTJkODJhYTczNDA0YTJkNWFmOWEyMTBlZDhiMDMxMmY2YmEKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJb25lIGhvb2sgZGVsaXZlcnMgZXZlcnkgYWN0aW9uIGl0IHJlY29yZHMJNzhlZmE1NjhmMzFlOGE5MTRjN2RkNGQwZjI2YWY0ODM4MWU0OGMxZTNmYWUyYWM0YzU1NmY0MjgzNGZmNDQyZA
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
  # duration_ms 44.811458
  ```
- 2026-09-17 · 639b8ed* · exit 0 · `set -o pipefail …` · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · ms:34880
- 2026-09-17 · 639b8ed* · exit 0 · `set -o pipefail …` · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · ms:37309
- 2026-09-17 · 639b8ed* · exit 0 · `set -o pipefail …` · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · ms:38529
- 2026-09-17 · 639b8ed* · exit 0 · `set -o pipefail …` · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · ms:35047
- 2026-09-17 · 639b8ed* · exit 0 · `set -o pipefail …` · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · ms:33532
- 2026-09-17 · 639b8ed* · exit 0 · `set -o pipefail …` · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · ms:34051
- 2026-09-17 · 639b8ed* · exit 0 · `set -o pipefail …` · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · ms:34225
- 2026-09-17 · 639b8ed* · exit 0 · `set -o pipefail …` · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · ms:34590
- 2026-09-17 · 639b8ed* · exit 0 · `set -o pipefail …` · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · ms:34179
- 2026-09-17 · 639b8ed* · exit 0 · `set -o pipefail …` · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · ms:34284
- 2026-09-17 · 639b8ed* · exit 0 · `set -o pipefail …` · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · ms:35131
