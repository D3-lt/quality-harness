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
- 2026-09-22 · 4980936* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:e01f5e79e6846e2aebeeec1daecafb0ea2b6fe8d05adf9fd04d94582fd1f001e · ms:0 · test-lock-sha256:7d6acc710d3a7560bc14576c19c468f3586ba8ea0055955efe6a0e5b2f7f2953 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIGNoZWNrIGV2ZW50IGlzIHdyaXR0ZW4gYnkgcWgtY2hlY2sJZjgwMzk5YmMxY2EyZTlkMDI5MTRjYWM2NDlkNzYwNWEzMzljZTU4YTY0MTFkNDZiOGU0MWRkOWZiNGI1ZTc4Ywpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIGNoZWNrIHRoYXQgZmluaXNoZXMgaW4gYSBsYXRlciB0dXJuIGNsZWFycyB0aGUgZmluZGluZyB0aGVuCWI3ZTdmYzllOTlkODBhMTg4Y2RkNTk4MWVkMDFlZGU0NWRiNDE3MGMxMjcwY2M4N2U5ZTU4OWIyZmMxOWEzODEKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSBjaGVjayB0aGF0IHBhc3NlZCBvbiBhIERJRkZFUkVOVCB0cmVlIGNlcnRpZmllcyBub3RoaW5nIGhlcmUJNzkzNThjMTNjYmY3OTIzYzM1OWUzNGQ5N2MzNzM4OTRiOGFjZDY1ZjY5NDk5ZTk0OTI5NmM0NTllMWFmOTlmYgpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIGNvbW1hbmQgbmFtaW5nIGNvbW1pdCBvciBwdXNoIGlzIHdhcm5lZCBiZWZvcmUgaXQgcnVucwk2OWI3ZTc0ZmI5ZjI5NjBjMDc3M2I0ZDhhYTg2NzlmZDI0MTJlYTU0NGMxYjczNWRmNmYxZDgwNDBmOTBkOTQ3CmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgY29tbWl0dGVkIGFydGlmYWN0IGlzIHN0aWxsIHZhbGlkYXRlZAk0OTgyZWRkZTZlZDM0MDYwNDJhODZlMmZlMjUyYWQxNjRkYzZhNDQ1OGY1MjUzYmZkZDA1MDQyNWUyNDQ1OTg4CmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgY29tcGFjdGlvbiBub3RlIHNlZXMgdGhlIGxhdGVzdCBlZGl0CTJiNTZiMDQxYTc3ZDExODE0YjBmMWFjOWQ0NzM1NzViNzAyOGI1NzNlMTdhNzJkZGI3MDA3N2M0MGMzYThjYTMKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSBmaWxlIGVkaXRlZCB3aGlsZSBpdHMgZ2F0ZSByYW4gaXMgbm90IHJlY29yZGVkIGFzIGFuc3dlcmVkCWUzY2Q5NjU3N2EwZTRkNzAzNWM0NzQyN2JkMDk4YjQ3YTAzODk1OGI1MzIzNzRkZjZiMmFmYTFjMmJlOTAyZDEKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSBmaWxlIGVkaXRlZCB3aGlsZSB0aGUgQkFUQ0ggZ2F0ZWQgaXQgaXMgbm90IHJlY29yZGVkIGFzIGFuc3dlcmVkIGVpdGhlcgk5YjkxYTMzMTcwODc0ZGI1YjM0ZTVhNjY2NWJhZGUzOGI4MDRiNTA5NzhlNjYyMjRmNDI3NDBhNTE1OWM1MWE0CmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgZ2l0IHF1ZXJ5IHRoYXQgRkFJTEVEIGlzIG5vdCBhIGdpdCBxdWVyeSB0aGF0IGZvdW5kIG5vdGhpbmcJZWViNTRhNDNhN2I0YzgxMjczOWIyNDYzMTAxYWU5NWVlZmFkZDFmYmJmNTM5MGNmODhiYTdjZjZjMTQ3NmVkNgpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIGxvZyB0aGF0IGNvdWxkIG5vdCBiZSByZWFkIHdob2xlIGNhbm5vdCBzdXBwbHkgYSBwYXNzaW5nIHZlcmRpY3QJZmYwZTk5YTFlYjllMWYxOTg0ODZhNDU2ZGY4OTdjZGJmYjc2MmVkYmE0YWI2MzJkNDQ4Mzk0ZDM1MzQ0MDQ3Mwpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIHJlYWQtb25seSByb2xlIGNhbm5vdCBjb21taXQgb3IgcHVzaCBhbmQgaXRzIG90aGVyIGNoYW5nZXMgYXJlIHJlcG9ydGVkCTllYjY2ZmU5ZmI2YTVmYmI0OWIxODA1ODgxM2E3ZjQ0Y2FhNDg4NmQyZjFiMjY0YWRkNWIzMjIxMjZmNDQxNWEKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSByZXBvc2l0b3J5IHdpdGhvdXQgYSBjaGVjayBoZWFycyBubyBjb21wbGV0aW9uIGFkdmlzb3J5CTZiYWMxNTE1ODUyYzkzMDY3MGQ2ZDM3YzdlZmM4OTg3MGI2MDczODRkNDMwNTM4NTJmNzZiMGQ3YzM2ODUxNzYKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSBzZXNzaW9uIG5vdGUgbmV2ZXIgaW52ZW50cyBhIGNoZWNrLCBhbmQgbmV2ZXIgcmVwb3J0cyBzaWxlbmNlIGFzIHN0aWxsbmVzcwk3OGMzMjMxYjViODkzMmEwZmMwM2U0NjVkYzY2MGY4NzY0NWE1OGY5MTM5NmEwMjM4NWNhNDk2M2FhMGFmNDBjCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgc2Vzc2lvbiB0aGF0IGJlZ2FuIGJlZm9yZSB0aGUgZmlyc3QgY29tbWl0IHN0aWxsIHNlZXMgdGhlIGNvbW1pdHMgaXQgZ2FpbmVkCThiZTgzOWFhNjYyNTkxZWQyM2EyN2I1MmE2OTM4MjkyODk4MjMwOGQ2NzVmMzAwYWE2NDczMWZiOWYzNmFhOTQKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSB0b3JuIGNoZWNrcy5qc29ubCBjYW5ub3QgbGVhdmUgYW4gb2xkZXIgcGFzcyBzdGFuZGluZyBhcyB0aGUgdmVyZGljdAlkZTE2NDdkODlmNGE5MjMzODNjYTdjOTczYTgwM2UyYjhkNDg4NjI0MDg3Y2E4Y2M1ZWMwY2QxOGNlOTM5YWE2CmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgdHJlZSB0aGUgcHVibGlzaCB3YXJuaW5nIG5hbWVkIHN0aWxsIHJlY29yZHMgdW52ZXJpZmllZAk5NWJhMDhkNmNlODE1ZTQ0ZTA2YTYxNGE3ZjlkMWFjZTVjYzQ3YWY2YjFmYmJmZjY5YWM2ZWI5OThkOTdjOGVkCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgdHVybiBlbmQgb2JzZXJ2ZXMgdGhlIHRyZWUgd2l0aG91dCByZWFkaW5nIGFueSBjb21tYW5kCWQ3OGQ0MmNjMGY4YmFjN2FmZGI4MWJhNzdjNTM5ZDJmNGFmYzhlYWQxZDk1NzA2Y2JmMmM0M2NiMTdlODNmZmEKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSB0dXJuIHRoYXQgZW5kZWQgaW4gYSBjb21taXQgbmFtZXMgdGhlIGNvbW1pdCwgbm90IGEgY2hhbmdlIHRoYXQgaXMgbm90IHRoZXJlCTk4NmY5ODhhYTdkNmIzMDA2ODY3OTI4Y2EyYTFmMzIxZWJiNjUyZmEwOGZmMzVjMzFiODc1YmIzODVjNGEwYjgKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYW4gdW5jaGVja2VkIGNvbW1pdCBpcyBuYW1lZCBldmVuIHdoZW4gaXRzIHRyZWUgZXF1YWxzIHRoZSBzZXNzaW9uIHN0YXJ0CWYzNjc2MzhhYjFmNzg4NDRkMWZmZGU3YTMzZjNkOTUwZWY1NGJiOGZiOGMwNTZjMjI5NTJjZWU3ZGFmMGNmMzYKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYW4gdW5rbm93biBjb250ZW50IGlkZW50aXR5IG1hdGNoZXMgbm90aGluZywgaW5jbHVkaW5nIGFub3RoZXIgdW5rbm93bgk0Y2YyYmM2YWM4OTJlNjdhNGYxYTAxNDdhNDU4MThiMmZmZDI0NjRiNzdkMjkxMWUxMjEyZDJjYzdhZDc1NWI1CmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWFuIHVudHJhY2tlZCBkaXJlY3RvcnkgaXMgZ2F0ZWQgYnkgdGhlIGZpbGVzIGluIGl0LCBuZXZlciBhcyBhIGRpcmVjdG9yeQkzNjhkYzk2MmUwMGFjOWRiOGNkNGM0NjRjMTQ2NWViNmQzZTAwYzcxODE0YWViZmMzNTU2ZDlkNjEwMjgyYWFiCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCW1hbnkgdW5jaGVja2VkIGNvbW1pdHMgYXJlIG9uZSBmaW5kaW5nCWI0NDA4N2FkYWZhZGIxNDQ1OWQ4MGY4YjM1ZWRlYWIxYjI5NzlhNjQ1MDJhYzgwOTZjYmQxNTJiM2Y4ZGYyZjEKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJb2JzZXJ2aW5nIHdyaXRlcyBub3RoaW5nIGludG8gdGhlIHJlcG9zaXRvcnkJZDY1ZTJmNDY3NDM3MjQ4M2ZmZjAzOGQ0ZmViYWVhMmQ4MmFhNzM0MDRhMmQ1YWY5YTIxMGVkOGIwMzEyZjZiYQpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlvbmUgaG9vayBkZWxpdmVycyBldmVyeSBhY3Rpb24gaXQgcmVjb3JkcwkyNWZiN2Q3Y2UzYzAzOWQ0YmZmMjA2Nzk1YzRiYTc2ZDkxYTMwYTc5NjE5YWFjNTQxYTlhZjEzYWZmODkxMzNiCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCXRoZSBjb21tYW5kIGNsYXNzaWZpZXJzIGFyZSBnb25lCTAyMDczNTVjYTM0NTUxMTk3YjY4NTdhYjMxOTM3ZDA3MzZhMGNhYjRjZDEzMmQ5OTc5MjQyYTU5OTgyYzhhMTIKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJdGhlIGhhcm5lc3MgZG9lcyBub3Qgb2JzZXJ2ZSBpdHMgb3duIGxlZGdlcgkzNzA5Y2RlNWNkMTg1ZDg4M2JiZWVkOWE1NzBkMTEzOWM0NThhNzg1NGRiODg4ZjUxNmQ2NDQzNGMxNTMyYmVkCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCXRoZSBrZXkgYSBwZXItZWRpdCBnYXRlIHBlcnNpc3RzIGlzIHRoZSBvbmUgcnVsZSBBIGxvb2tzIHVwLCBvbiBlaXRoZXIgcGxhdGZvcm0JYzYwNjVhOTVkYzM4NGY0OWY2NTljZjUxZGUzZTE3OTdjZmI5OGQ4MWJlYzRiZjViN2RhYTI4NTlkOWU1NTUwYgpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwl0aGUgc2NyaXB0ZWQgc2Vzc2lvbiBhZHZpc2VzIGFzIGl0cyBzdGVwIHRhYmxlIGxpc3RzCTI2ZmM4Yjk3ODk5YmIyMzJiNzMyNzIwOWM4MGFkMzNhYzk4ZWIzZWVmOTQ0MjIyMzhiMmMxN2IxZDdiZjFhNjYKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJdGhlIHNlc3Npb24gbm90ZSBkb2VzIG5vdCBjcmVkaXQgYSBzdGFsZSByZS1pbXBvcnRlZCBwYXNzCWE4YmY3OTNmMmY3Mzk5YzAxMTU3MjBkNDI0ZDQyNmE3NDU0MGQyNzliZDA5MjNjYmU0ODU5MzYzZDgzNjE0ZDYKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJdGhlIHN0YXR1cyBsaW5lIGRvZXMgbm90IHJlYWQgY2hlY2tlZCBmcm9tIGEgc3RhbGUgcmUtaW1wb3J0ZWQgcGFzcwkxYmE3NjQwZjlkNmM0NTAwZTkzZTU5NzM5NmEyOTEyMzg2Yjc3OWIwM2ZiZTUyOGM4MzJmYzEyNWQ3MzQyZDUzCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCXdoaWNoIGNoZWNrIGlzIGxhdGVzdCBpcyBkZWNpZGVkIGJ5IHdoZW4gaXQgUkFOLCBub3QgYnkgd2hlcmUgaXQgbGFuZGVkIGluIHRoZSBsb2cJOTE3MzEyZjI1ZjY4OGZkODYyNDI2NmRiNGVlZGZkZWU2ODUwMGQ1ZmRhY2UwMTY4Y2YwOThhZjk3YTMzNGM0MApib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwl3cml0ZXMgdGhlIHRyZWUgY2Fubm90IHNlZSByZS1vcGVuIHRoZSBmaW5kaW5nCTQzYTgxMGRmZWM4OTAwZGVjZWY0MTEzM2M2M2EzNzA3OTc5N2JjMDcyZjEyZWJmNDNjMGMzZTVkNTM3MmU5ZTE · test-lock-kind:replace
