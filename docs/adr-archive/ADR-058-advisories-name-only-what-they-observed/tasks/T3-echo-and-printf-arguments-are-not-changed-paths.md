# Task ADR-058-T3: Echo and printf arguments are not changed paths

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** none
**Consumes:** `tests/advice-accuracy.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the echo and printf argument skip in bashMarkdownMutationPaths`, `the redirect target still counting`, `each named test actually running`, `the regression suites that pin path extraction`

## Goal

`bashMarkdownMutationPaths` takes nothing from the arguments of an `echo` or `printf` segment except its `>`/`>>` redirect target.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/advice-accuracy.test.mjs` | edit | the two tests below |
| `plugin/scripts/lifecycle.mjs` | edit | the candidate loop in `bashMarkdownMutationPaths` (line 1642) skips echo/printf arguments that are not a redirect target |

## Ordered Steps

1. [S1] Add the two tests with real assertions, including the measured command verbatim. The first fails on an assertion (TDD red); the second pins the redirect direction, passes before the change by construction, and S3's mutant that skips the redirect target too is what shows it can fail.
2. [S2] In the segment loop, when the segment's command word is `echo` or `printf`, keep only the token after `>` or `>>`.
3. [S3] Run the fence green and record mutants: drop the skip; skip the redirect target too. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(echo and printf arguments are not changed paths|an echo redirect target is still a changed path)$' tests/advice-accuracy.test.mjs 2>&1) \
  && for name in 'echo and printf arguments are not changed paths' 'an echo redirect target is still a changed path'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/lifecycle.test.mjs
```

The fence first named `tests/unread-advice.test.mjs` and `tests/unread-advice-followon.test.mjs` as the regression suites. Measured 2026-09-16 after the red run: neither fails when the git-revision skip, the assignment skip, the in-project filter or the `.md` early return is deleted from `bashMarkdownMutationPaths`, while `tests/lifecycle.test.mjs`, which calls it directly, fails on the first. The fence was changed to that suite, so the red entry in the Verification Log carries the old digest.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `echo and printf arguments are not changed paths` | `tests/advice-accuracy.test.mjs` | the measured `cp … && rm -rf -- "$RUN" && echo "run dir removed, review kept at scratchpad/codex-review-f37f57a.md"` and `printf '%s\n' notes.md` yield no path under the project | — | S1, S2 |
| `an echo redirect target is still a changed path` | `tests/advice-accuracy.test.mjs` | `echo x > docs/new.md` and `printf y >> README.md`, in a temp project containing those files, still yield the target | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `analyzeTranscript` records these paths for the Stop message and the artifact gate; S3's mutants delete the skip |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | ADR-058's Follow-up replay |

## Mutation Log
- 2026-09-16 · b5c7586* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the skip is gone, so echo text ending in .md is a changed path again · acceptance-sha256:cadb91bc5b96a4be4bfec7c2ada9e3d29d66f32cc389f1ccb20cc2e17d6b8ac4 · covers:the echo and printf argument skip in bashMarkdownMutationPaths
- 2026-09-16 · b5c7586* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · printf is no longer a print-only family · acceptance-sha256:cadb91bc5b96a4be4bfec7c2ada9e3d29d66f32cc389f1ccb20cc2e17d6b8ac4 · covers:the echo and printf argument skip in bashMarkdownMutationPaths
- 2026-09-16 · b5c7586* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the redirect target of echo and printf is skipped too · acceptance-sha256:cadb91bc5b96a4be4bfec7c2ada9e3d29d66f32cc389f1ccb20cc2e17d6b8ac4 · covers:the redirect target still counting
- 2026-09-16 · b5c7586* · mutant killed · exit 1 · `tests/advice-accuracy.test.mjs` · a renamed test selects nothing and the per-name ok grep must refuse it · acceptance-sha256:cadb91bc5b96a4be4bfec7c2ada9e3d29d66f32cc389f1ccb20cc2e17d6b8ac4 · covers:each named test actually running
- 2026-09-16 · b5c7586* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a git revision such as origin/main:docs/x.md resolves as a changed path; tests/lifecycle.test.mjs kills it · acceptance-sha256:cadb91bc5b96a4be4bfec7c2ada9e3d29d66f32cc389f1ccb20cc2e17d6b8ac4 · covers:the regression suites that pin path extraction

## Invariants

- A real Markdown write through `tee`, `cp`, `mv`, `sed -i` or a redirect is still reported.

## Risks

- `echo` with an unusual redirect spelling (`1>file.md`); the test names the two forms the session used.

## Stop Condition

Stop and ask if an existing test of Markdown-only change handling (BACKLOG §174) goes red.

## Out of Scope

- The unreproduced `spec-write/SKILL.md` path (BACKLOG §213)

## Verification Log
- 2026-09-16 · b5c7586* · exit 1 · `set -o pipefail …` · acceptance-sha256:226cc8c2c572be4dac97caa15bc9d9221b5c7a69a0d33d2d0e4073a528f95c02 · ms:207 · test-lock-sha256:c8a0e95b531d43a30b26d19a377f4db454e57fcd0ecf159384fb85ef6467cfb3 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIHRpbWVvdXQgd3JhcHBlciBkb2VzIG5vdCBsYXVuZGVyIGEgbXV0YXRpb24JOTdjM2NlOTJhMDYyMTFlNWNmMDcyNzE3ZTQ5YzI5MDA5MTcwZWJmMDI4MzI5ZDIxNjgzYjliYjg2YTE0NGMxMgpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIHRpbWVvdXQtd3JhcHBlZCBjaGVjayBpcyBhIGNoZWNrCTBjMWM2MzZlMTBmZDYzNGIwMTUwODcxZjUzYjdjMjY2YmE3YjQzZjI1NjNjN2ZiZjUwZDE4NDI5MWY4ZTViN2QKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJYW4gZWNobyByZWRpcmVjdCB0YXJnZXQgaXMgc3RpbGwgYSBjaGFuZ2VkIHBhdGgJNGI2MjhkNjA4ZDYwZTlhNWY3MWUyNWIzYmRmNGM2NDZjNmQ1NzY3ZGIyYTQ0NWI3NjU0MDJjNTk3ODdjYWYzZQpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwllY2hvIGFuZCBwcmludGYgYXJndW1lbnRzIGFyZSBub3QgY2hhbmdlZCBwYXRocwlkNTU2Y2M3MjIwNDZmODdiMjBjNGU5OTdjYzMwMDc1NmMyMDBjYzBhYzVjYTM1OWI1ODNjYmFmYjM3OTEyYzZlCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCW1ydyByZWFkIGlzIGEgcmVhZCwgbm90IGFuIHVucHJvdmVuIHdyaXRlCWI5YzI2MmI0ZTYzN2IzYmU1MDU3YzVjNTg4YWZlMWIzYjFhMDAxY2YxZjBjN2Y1ZWMyYzUzNTM5ZDVhMjgwNzIKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJbXJ3IHdyaXRlIGlzIHN0aWxsIGp1ZGdlZCBhcyBhIHdyaXRlCTgxOWM1NmRjODdhNzNkMjQzOWQwNjkyOWE1MDJmNWQwZDgzNzA1ZDY4YTYzOTgyZTI0YWI4M2ZkNzQxYWZjNDMKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJdGhlIGNvbW1pdCBnYXRlIGlzIHNpbGVudCBhZnRlciBhIHBhc3NpbmcgdGltZW91dC13cmFwcGVkIGNoZWNrCTY3MGEwODYxZDA2YTYzM2FiYWIwMzUzNmZkN2JhYmU2MjMzMjFjOWMwODE3ZDRkOGQxM2RiMTMwZmQwNWY4M2U
  ```
  ```
- 2026-09-16 · b5c7586* · exit 0 · `set -o pipefail …` · acceptance-sha256:cadb91bc5b96a4be4bfec7c2ada9e3d29d66f32cc389f1ccb20cc2e17d6b8ac4 · ms:34654
- 2026-09-16 · b5c7586* · exit 0 · `set -o pipefail …` · acceptance-sha256:cadb91bc5b96a4be4bfec7c2ada9e3d29d66f32cc389f1ccb20cc2e17d6b8ac4 · ms:36809
- 2026-09-16 · b5c7586* · exit 0 · `set -o pipefail …` · acceptance-sha256:cadb91bc5b96a4be4bfec7c2ada9e3d29d66f32cc389f1ccb20cc2e17d6b8ac4 · ms:36245
- 2026-09-16 · b5c7586* · exit 0 · `set -o pipefail …` · acceptance-sha256:cadb91bc5b96a4be4bfec7c2ada9e3d29d66f32cc389f1ccb20cc2e17d6b8ac4 · ms:35929
- 2026-09-16 · b5c7586* · exit 0 · `set -o pipefail …` · acceptance-sha256:cadb91bc5b96a4be4bfec7c2ada9e3d29d66f32cc389f1ccb20cc2e17d6b8ac4 · ms:28020
- 2026-09-17 · 332a707* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:cadb91bc5b96a4be4bfec7c2ada9e3d29d66f32cc389f1ccb20cc2e17d6b8ac4 · ms:0 · test-lock-sha256:b6bfb3474d21c25105e483a2d150a432aa814ddec0813860f7132d0946d3282a · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIHJldmlzaW9uIHBhdGggdW5kZXIgYSB1c2VkIGdpdCBjaGFubmVsIGlzIG5vdCBhIGNoYW5nZWQgcGF0aAk0MzY1NmU4ODJkMmM0NTNlODI0NzQyYWQ2MmJjZDNlMjc2YzA0YjJkZjVhM2MxM2NhZmU5MzIxYWI2NTUyNWJlCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCWEgdGltZW91dCB3cmFwcGVyIGRvZXMgbm90IGxhdW5kZXIgYSBtdXRhdGlvbgk5N2MzY2U5MmEwNjIxMWU1Y2YwNzI3MTdlNDljMjkwMDkxNzBlYmYwMjgzMjlkMjE2ODNiOWJiODZhMTQ0YzEyCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCWEgdGltZW91dC13cmFwcGVkIGNoZWNrIGlzIGEgY2hlY2sJMGMxYzYzNmUxMGZkNjM0YjAxNTA4NzFmNTNiN2MyNjZiYTdiNDNmMjU2M2M3ZmJmNTBkMTg0MjkxZjhlNWI3ZApib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIHdyYXBwZXIgZmlsZSBvcGVyYW5kIGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCWIwYmE2NjY5N2RjZmNhZjRlYTRiYzQ5NDkzOWY3ZTY1YjEzNThlYjdiYjJlMmZlNWZlZTdjMzYwMDM1YmE3NDQKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJYSB3cml0ZSBiZXNpZGUgYSByZWFkIGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCTQyMTQyYTg2MDZmZDYxYjM1NjA5NjI4MWE2YWJkYWJjOWZhZDlmZTU2NzFjMWM5MmNkYzczY2I3MjdiODg1NjMKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJYW4gZWNobyByZWRpcmVjdCB0YXJnZXQgaXMgc3RpbGwgYSBjaGFuZ2VkIHBhdGgJNGI2MjhkNjA4ZDYwZTlhNWY3MWUyNWIzYmRmNGM2NDZjNmQ1NzY3ZGIyYTQ0NWI3NjU0MDJjNTk3ODdjYWYzZQpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhbiBleHBvcnRlZCBuYW1lIGtlZXBzIGl0cyBhc3NpZ25lZCBwYXRoIGFmdGVyIGEgcmVhZAk5MTFmYWQ1YWU0YmYwYWMwNTczYmMwNTAxZWIxOWNkODZhOTJjZWQwZTEzMTJhOWM3ZTFhOTcwMzljYjM3M2NkCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCWVjaG8gYW5kIHByaW50ZiBhcmd1bWVudHMgYXJlIG5vdCBjaGFuZ2VkIHBhdGhzCWQ1NTZjYzcyMjA0NmY4N2IyMGM0ZTk5N2NjMzAwNzU2YzIwMGNjMGFjNWNhMzU5YjU4M2NiYWZiMzc5MTJjNmUKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJbXJ3IHJlYWQgaXMgYSByZWFkLCBub3QgYW4gdW5wcm92ZW4gd3JpdGUJYjljMjYyYjRlNjM3YjNiZTUwNTdjNWM1ODhhZmUxYjNiMWEwMDFjZjFmMGM3ZjVlYzJjNTM1MzlkNWEyODA3Mgpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwltcncgd3JpdGUgaXMgc3RpbGwganVkZ2VkIGFzIGEgd3JpdGUJODE5YzU2ZGM4N2E3M2QyNDM5ZDA2OTI5YTUwMmY1ZDBkODM3MDVkNjhhNjM5ODJlMjRhYjgzZmQ3NDFhZmM0Mwpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlyZWFkLW9ubHkgYXJndW1lbnRzIGFyZSBub3QgY2hhbmdlZCBwYXRocwkxMTE1MGE2N2VlMzkwYmRjNjNlMzEwNmFhMTg3MDZlZjQxMjljNTYzOTM0M2M3NjRlNzQ1YTNjMWZlNmYwMDRj · test-lock-kind:replace
- 2026-09-17 · 332a707* · exit 0 · `set -o pipefail …` · acceptance-sha256:cadb91bc5b96a4be4bfec7c2ada9e3d29d66f32cc389f1ccb20cc2e17d6b8ac4 · ms:24660
