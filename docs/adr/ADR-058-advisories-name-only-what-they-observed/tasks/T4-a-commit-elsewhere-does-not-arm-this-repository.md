# Task ADR-058-T4: A commit elsewhere does not arm this repository's advisory

**Depends-on:** T3
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** none
**Consumes:** `tests/advice-accuracy.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the foreign-repository early return in the commit branch`, `an unresolved target still advising`, `each named test actually running`, `the regression suites that pin the commit gate`

## Goal

The PreToolUse commit branch returns before advising when every commit or push segment resolves to a repository other than this one; a segment whose repository cannot be resolved still advises.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/advice-accuracy.test.mjs` | edit | the two tests below |
| `plugin/scripts/lifecycle.mjs` | edit | the commit branch after `if (!isGitPublishCommand(command)) return` (line 4453), using the segment walk of `gitPublishTargetsThisProject` (line 878) with a three-way answer: this repository, another resolved repository, unresolved |

## Ordered Steps

1. [S1] Add the two tests with real assertions — temp git repositories created by the test (CLAUDE.md §9), an Edit and no check in the first. The first fails on an assertion (TDD red); the second pins the unresolved direction, passes before the change by construction, and S3's mutant that treats unresolved as foreign is what shows it can fail.
2. [S2] Return early only when at least one publish segment resolved and none resolved to this repository or stayed unresolved.
3. [S3] Run the fence green and record mutants: treat unresolved as foreign; drop the early return. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern "^(a commit in another repository does not arm this repository's commit advisory|a commit whose repository cannot be resolved still advises)$" tests/advice-accuracy.test.mjs 2>&1) \
  && for name in "a commit in another repository does not arm this repository's commit advisory" 'a commit whose repository cannot be resolved still advises'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/unread-advice.test.mjs tests/leftovers-after-adr053.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a commit in another repository does not arm this repository's commit advisory` | `tests/advice-accuracy.test.mjs` | with unverified edits in project A, PreToolUse `git -C <B> commit --allow-empty -m probe` is silent, and a `git commit` in A still advises | — | S1, S2 |
| `a commit whose repository cannot be resolved still advises` | `tests/advice-accuracy.test.mjs` | `git -C "$X" commit -m x` and `git -C <missing dir> commit -m x` still advise | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `handleHook`'s PreToolUse branch, driven by the tests; S3's mutants |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | ADR-058's Follow-up replay |

## Mutation Log
- 2026-09-16 · 4d26cd3* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the early return is gone, so a commit in another repository advises about this one again · acceptance-sha256:71b6e173d06a92facab9e408cdd51ade32fe183b263fb63a95db55586f125767 · covers:the foreign-repository early return in the commit branch
- 2026-09-16 · 4d26cd3* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a commit in this repository counts as another one, so the own commit goes silent · acceptance-sha256:71b6e173d06a92facab9e408cdd51ade32fe183b263fb63a95db55586f125767 · covers:the foreign-repository early return in the commit branch
- 2026-09-16 · 4d26cd3* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a -C that does not exist or is not a repository is read as another repository · acceptance-sha256:71b6e173d06a92facab9e408cdd51ade32fe183b263fb63a95db55586f125767 · covers:an unresolved target still advising
- 2026-09-16 · 4d26cd3* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a segment after cd "$R" is skipped, so an unfollowable directory reads as foreign · acceptance-sha256:71b6e173d06a92facab9e408cdd51ade32fe183b263fb63a95db55586f125767 · covers:an unresolved target still advising
- 2026-09-16 · 4d26cd3* · mutant killed · exit 1 · `tests/advice-accuracy.test.mjs` · a renamed test selects nothing and the per-name ok grep must refuse it · acceptance-sha256:71b6e173d06a92facab9e408cdd51ade32fe183b263fb63a95db55586f125767 · covers:each named test actually running
- 2026-09-16 · 4d26cd3* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a check chained before git commit no longer counts; tests/unread-advice.test.mjs kills it · acceptance-sha256:71b6e173d06a92facab9e408cdd51ade32fe183b263fb63a95db55586f125767 · covers:the regression suites that pin the commit gate

## Invariants

- Unresolved is never read as foreign (CLAUDE.md §16).
- The `rm -rf "$X" && git commit` early advisory above the transcript read is unchanged.

## Risks

- A symlinked path to this repository resolving as another; `gitRepositoryRoot` compares real roots, and the test names that shape only if it reproduces.

## Stop Condition

Stop and ask if `tests/lifecycle.test.mjs::PreToolUse commit advice still Advises after a foreign git -C commit` goes red — that test is about a LATER own commit and must keep passing. It is not in the fence; `bash scripts/selftest.sh` runs it.

## Out of Scope

- `git push` to a remote of another repository beyond the segment walk that already exists

## Verification Log
- 2026-09-16 · 4d26cd3* · exit 1 · `set -o pipefail …` · acceptance-sha256:71b6e173d06a92facab9e408cdd51ade32fe183b263fb63a95db55586f125767 · ms:741 · test-lock-sha256:fa9b5343927d4c05e4444917b703505b87463a75159fa3c8039e5d33cfd88591 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIGNvbW1pdCBpbiBhbm90aGVyIHJlcG9zaXRvcnkgZG9lcyBub3QgYXJtIHRoaXMgcmVwb3NpdG9yeSdzIGNvbW1pdCBhZHZpc29yeQlmYjEwMTkyMjNiNDQ1YmJkNWQyY2FjNTk1Y2RhNGU3MmExNzk1ZDAwZTYxMzgyZDRlYzg5MWJjOTJkOThhMTViCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCWEgY29tbWl0IHdob3NlIHJlcG9zaXRvcnkgY2Fubm90IGJlIHJlc29sdmVkIHN0aWxsIGFkdmlzZXMJZDk2MjUxOWI4OWUwOTNlZTA1OGJhZGI0Zjc2NDEwNDFmMjM1YzE5ZDI4MGUxZDU5MTViMTRlZWUxODc5YTRjNQpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIHRpbWVvdXQgd3JhcHBlciBkb2VzIG5vdCBsYXVuZGVyIGEgbXV0YXRpb24JOTdjM2NlOTJhMDYyMTFlNWNmMDcyNzE3ZTQ5YzI5MDA5MTcwZWJmMDI4MzI5ZDIxNjgzYjliYjg2YTE0NGMxMgpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIHRpbWVvdXQtd3JhcHBlZCBjaGVjayBpcyBhIGNoZWNrCTBjMWM2MzZlMTBmZDYzNGIwMTUwODcxZjUzYjdjMjY2YmE3YjQzZjI1NjNjN2ZiZjUwZDE4NDI5MWY4ZTViN2QKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJYW4gZWNobyByZWRpcmVjdCB0YXJnZXQgaXMgc3RpbGwgYSBjaGFuZ2VkIHBhdGgJNGI2MjhkNjA4ZDYwZTlhNWY3MWUyNWIzYmRmNGM2NDZjNmQ1NzY3ZGIyYTQ0NWI3NjU0MDJjNTk3ODdjYWYzZQpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwllY2hvIGFuZCBwcmludGYgYXJndW1lbnRzIGFyZSBub3QgY2hhbmdlZCBwYXRocwlkNTU2Y2M3MjIwNDZmODdiMjBjNGU5OTdjYzMwMDc1NmMyMDBjYzBhYzVjYTM1OWI1ODNjYmFmYjM3OTEyYzZlCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCW1ydyByZWFkIGlzIGEgcmVhZCwgbm90IGFuIHVucHJvdmVuIHdyaXRlCWI5YzI2MmI0ZTYzN2IzYmU1MDU3YzVjNTg4YWZlMWIzYjFhMDAxY2YxZjBjN2Y1ZWMyYzUzNTM5ZDVhMjgwNzIKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJbXJ3IHdyaXRlIGlzIHN0aWxsIGp1ZGdlZCBhcyBhIHdyaXRlCTgxOWM1NmRjODdhNzNkMjQzOWQwNjkyOWE1MDJmNWQwZDgzNzA1ZDY4YTYzOTgyZTI0YWI4M2ZkNzQxYWZjNDMKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJdGhlIGNvbW1pdCBnYXRlIGlzIHNpbGVudCBhZnRlciBhIHBhc3NpbmcgdGltZW91dC13cmFwcGVkIGNoZWNrCTY3MGEwODYxZDA2YTYzM2FiYWIwMzUzNmZkN2JhYmU2MjMzMjFjOWMwODE3ZDRkOGQxM2RiMTMwZmQwNWY4M2U
  ```
  ```
- 2026-09-16 · 4d26cd3* · exit 0 · `set -o pipefail …` · acceptance-sha256:71b6e173d06a92facab9e408cdd51ade32fe183b263fb63a95db55586f125767 · ms:4466
- 2026-09-16 · 4d26cd3* · exit 0 · `set -o pipefail …` · acceptance-sha256:71b6e173d06a92facab9e408cdd51ade32fe183b263fb63a95db55586f125767 · ms:4639
- 2026-09-16 · 4d26cd3* · exit 0 · `set -o pipefail …` · acceptance-sha256:71b6e173d06a92facab9e408cdd51ade32fe183b263fb63a95db55586f125767 · ms:4914
- 2026-09-16 · 4d26cd3* · exit 0 · `set -o pipefail …` · acceptance-sha256:71b6e173d06a92facab9e408cdd51ade32fe183b263fb63a95db55586f125767 · ms:4665
- 2026-09-16 · 4d26cd3* · exit 0 · `set -o pipefail …` · acceptance-sha256:71b6e173d06a92facab9e408cdd51ade32fe183b263fb63a95db55586f125767 · ms:4676
- 2026-09-16 · 4d26cd3* · exit 0 · `set -o pipefail …` · acceptance-sha256:71b6e173d06a92facab9e408cdd51ade32fe183b263fb63a95db55586f125767 · ms:5369
