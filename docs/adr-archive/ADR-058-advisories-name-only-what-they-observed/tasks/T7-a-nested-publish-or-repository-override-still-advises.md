# Task ADR-058-T7: A nested publish or a repository override still arms the commit advisory

**Depends-on:** T6
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** none
**Consumes:** `tests/advice-accuracy.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the nested-publish refusal in the foreign shortcut`, `the repository-override refusal in the foreign shortcut`, `a plain commit elsewhere staying silent`, `each named test actually running`, `the regression suites that pin the commit gate`

Added 2026-09-17 from a Codex review (`gpt-6-astra`, xhigh) of `e813f0a...ecd7852`. T4's shortcut walks only the top-level segments, so it has two holes. Reproduced through the PreToolUse hook with an Edit and no check, in scratch repositories:
- **A nested publish:** `git -C <other> commit -m other; bash -c 'git commit -m local'` was silent. `isGitPublishCommand` sees the nested commit; the shortcut does not.
- **A repository override:** `GIT_DIR=<this>/.git git -C <other> commit -m local` and `git --git-dir=<this>/.git --work-tree=<other> commit -m local` were silent. `git rev-parse --absolute-git-dir` printed this repository's `.git` for both, so they publish here.

## Goal

The foreign-repository shortcut returns false — the commit advisory still speaks — when any commit or push sits where the top-level walk cannot resolve it (inside `bash -c`, `$(…)` or a heredoc body), or when a publish segment chooses its repository with `--git-dir`, `--work-tree` or a `GIT_…=` prefix.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/advice-accuracy.test.mjs` | edit | the test below |
| `plugin/scripts/lifecycle.mjs` | edit | `gitPublishTargetsOnlyOtherRepositories` counts publish segments with `isGitPublishCommand`'s traversal, checks heredoc bodies, and refuses repository overrides |

## Ordered Steps

1. [S1] Add the test with real assertions and see it fail on an assertion (TDD red).
2. [S2] In `gitPublishTargetsOnlyOtherRepositories`:
   - return false when the publish segments across `shellCommandRegions × shellSegments` outnumber those the top-level walk saw;
   - return false when `heredocBodies(command)` contains a publish;
   - for each publish segment, return false on a `--git-dir`/`--work-tree` global option or a `GIT_…=` word before the command.
3. [S3] Run the fence green and record mutants: drop the nested count; drop the heredoc check; drop the global-option check; drop the prefix check. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(a nested publish or a repository override still arms the commit advisory)$' tests/advice-accuracy.test.mjs 2>&1) \
  && for name in 'a nested publish or a repository override still arms the commit advisory'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/advice-accuracy.test.mjs tests/unread-advice.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a nested publish or a repository override still arms the commit advisory` | `tests/advice-accuracy.test.mjs` | with unverified edits in a temp repository, `git -C <other> commit` stays silent, while these advise: `…; bash -c 'git commit …'`, `… && echo "$(git commit …)"`, `…; bash <<EOF` + `git commit …` + `EOF`, `GIT_DIR=<this>/.git git -C <other> commit`, `git --git-dir=<this>/.git --work-tree=<other> commit` | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | `handleHook`'s PreToolUse commit branch calls the shortcut; the test drives the hook as a process; S3's mutants remove each refusal |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | commit advisories in sessions that commit elsewhere |

## Mutation Log
- 2026-09-17 · ecd7852* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a commit inside bash -c or $(…) no longer refuses the shortcut · acceptance-sha256:9009f8207b565d1683699696b951b33c410dfbf1f24ae0aca2dd37bb9b6ed15a · covers:the nested-publish refusal in the foreign shortcut
- 2026-09-17 · ecd7852* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a commit in a heredoc body no longer refuses the shortcut · acceptance-sha256:9009f8207b565d1683699696b951b33c410dfbf1f24ae0aca2dd37bb9b6ed15a · covers:the nested-publish refusal in the foreign shortcut
- 2026-09-17 · ecd7852* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · git --git-dir=<this>/.git --work-tree=<other> commit is read as a commit elsewhere again · acceptance-sha256:9009f8207b565d1683699696b951b33c410dfbf1f24ae0aca2dd37bb9b6ed15a · covers:the repository-override refusal in the foreign shortcut
- 2026-09-17 · ecd7852* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · GIT_DIR=<this>/.git git -C <other> commit is read as a commit elsewhere again · acceptance-sha256:9009f8207b565d1683699696b951b33c410dfbf1f24ae0aca2dd37bb9b6ed15a · covers:the repository-override refusal in the foreign shortcut
- 2026-09-17 · ecd7852* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the shortcut never fires, so a plain commit in another repository advises again · acceptance-sha256:9009f8207b565d1683699696b951b33c410dfbf1f24ae0aca2dd37bb9b6ed15a · covers:a plain commit elsewhere staying silent
- 2026-09-17 · ecd7852* · mutant killed · exit 1 · `tests/advice-accuracy.test.mjs` · a renamed test selects nothing and the per-name ok grep must refuse it · acceptance-sha256:9009f8207b565d1683699696b951b33c410dfbf1f24ae0aca2dd37bb9b6ed15a · covers:each named test actually running
- 2026-09-17 · ecd7852* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a check chained before git commit no longer counts; tests/unread-advice.test.mjs kills it · acceptance-sha256:9009f8207b565d1683699696b951b33c410dfbf1f24ae0aca2dd37bb9b6ed15a · covers:the regression suites that pin the commit gate

## Invariants

- A plain commit in another existing repository stays silent (T4).
- An unresolved target still advises (T4).

## Risks

- `GIT_DIR` exported earlier in the session environment rather than on the command line is invisible to the hook. Named here; the hook reads only the command.

## Stop Condition

Stop and ask if `tests/lifecycle.test.mjs::PreToolUse commit advice still Advises after a foreign git -C commit` goes red.

## Out of Scope

- A repository chosen through a `GIT_DIR` exported before the command (permanent: boundary: the hook sees the command, not the shell's environment)

## Verification Log
- 2026-09-17 · ecd7852* · exit 1 · `set -o pipefail …` · acceptance-sha256:9009f8207b565d1683699696b951b33c410dfbf1f24ae0aca2dd37bb9b6ed15a · ms:429 · test-lock-sha256:feefe9867e005915b8daddc4559b2c9ae11fca601a3cd804deab6b11419cf805 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIGNvbW1pdCBpbiBhbm90aGVyIHJlcG9zaXRvcnkgZG9lcyBub3QgYXJtIHRoaXMgcmVwb3NpdG9yeSdzIGNvbW1pdCBhZHZpc29yeQlmYjEwMTkyMjNiNDQ1YmJkNWQyY2FjNTk1Y2RhNGU3MmExNzk1ZDAwZTYxMzgyZDRlYzg5MWJjOTJkOThhMTViCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCWEgY29tbWl0IHdob3NlIHJlcG9zaXRvcnkgY2Fubm90IGJlIHJlc29sdmVkIHN0aWxsIGFkdmlzZXMJZDk2MjUxOWI4OWUwOTNlZTA1OGJhZGI0Zjc2NDEwNDFmMjM1YzE5ZDI4MGUxZDU5MTViMTRlZWUxODc5YTRjNQpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIG5lc3RlZCBwdWJsaXNoIG9yIGEgcmVwb3NpdG9yeSBvdmVycmlkZSBzdGlsbCBhcm1zIHRoZSBjb21taXQgYWR2aXNvcnkJOWFhOTQ5Y2YyNDg4YWFkZmI1ZTFmYWZiNzllZDM1YzIxMmI0ZDdmMDg4NzU3NTNiYTgzYTc0ZmQ0YzZmMzg2OApib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIHJldmlzaW9uIHBhdGggdW5kZXIgYSB1c2VkIGdpdCBjaGFubmVsIGlzIG5vdCBhIGNoYW5nZWQgcGF0aAk0MzY1NmU4ODJkMmM0NTNlODI0NzQyYWQ2MmJjZDNlMjc2YzA0YjJkZjVhM2MxM2NhZmU5MzIxYWI2NTUyNWJlCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCWEgdGltZW91dCB3cmFwcGVyIGRvZXMgbm90IGxhdW5kZXIgYSBtdXRhdGlvbgk5N2MzY2U5MmEwNjIxMWU1Y2YwNzI3MTdlNDljMjkwMDkxNzBlYmYwMjgzMjlkMjE2ODNiOWJiODZhMTQ0YzEyCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCWEgdGltZW91dC13cmFwcGVkIGNoZWNrIGlzIGEgY2hlY2sJMGMxYzYzNmUxMGZkNjM0YjAxNTA4NzFmNTNiN2MyNjZiYTdiNDNmMjU2M2M3ZmJmNTBkMTg0MjkxZjhlNWI3ZApib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIHdyYXBwZXIgZmlsZSBvcGVyYW5kIGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCWIwYmE2NjY5N2RjZmNhZjRlYTRiYzQ5NDkzOWY3ZTY1YjEzNThlYjdiYjJlMmZlNWZlZTdjMzYwMDM1YmE3NDQKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJYSB3cml0ZSBiZXNpZGUgYSByZWFkIGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCTQyMTQyYTg2MDZmZDYxYjM1NjA5NjI4MWE2YWJkYWJjOWZhZDlmZTU2NzFjMWM5MmNkYzczY2I3MjdiODg1NjMKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJYW4gZWNobyByZWRpcmVjdCB0YXJnZXQgaXMgc3RpbGwgYSBjaGFuZ2VkIHBhdGgJNGI2MjhkNjA4ZDYwZTlhNWY3MWUyNWIzYmRmNGM2NDZjNmQ1NzY3ZGIyYTQ0NWI3NjU0MDJjNTk3ODdjYWYzZQpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhbiBleHBvcnRlZCBuYW1lIGtlZXBzIGl0cyBhc3NpZ25lZCBwYXRoIGFmdGVyIGEgcmVhZAk5MTFmYWQ1YWU0YmYwYWMwNTczYmMwNTAxZWIxOWNkODZhOTJjZWQwZTEzMTJhOWM3ZTFhOTcwMzljYjM3M2NkCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCWVjaG8gYW5kIHByaW50ZiBhcmd1bWVudHMgYXJlIG5vdCBjaGFuZ2VkIHBhdGhzCWQ1NTZjYzcyMjA0NmY4N2IyMGM0ZTk5N2NjMzAwNzU2YzIwMGNjMGFjNWNhMzU5YjU4M2NiYWZiMzc5MTJjNmUKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJbXJ3IHJlYWQgaXMgYSByZWFkLCBub3QgYW4gdW5wcm92ZW4gd3JpdGUJYjljMjYyYjRlNjM3YjNiZTUwNTdjNWM1ODhhZmUxYjNiMWEwMDFjZjFmMGM3ZjVlYzJjNTM1MzlkNWEyODA3Mgpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwltcncgd3JpdGUgaXMgc3RpbGwganVkZ2VkIGFzIGEgd3JpdGUJODE5YzU2ZGM4N2E3M2QyNDM5ZDA2OTI5YTUwMmY1ZDBkODM3MDVkNjhhNjM5ODJlMjRhYjgzZmQ3NDFhZmM0Mwpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlyZWFkLW9ubHkgYXJndW1lbnRzIGFyZSBub3QgY2hhbmdlZCBwYXRocwkxMTE1MGE2N2VlMzkwYmRjNjNlMzEwNmFhMTg3MDZlZjQxMjljNTYzOTM0M2M3NjRlNzQ1YTNjMWZlNmYwMDRjCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCXRoZSBjb21taXQgZ2F0ZSBpcyBzaWxlbnQgYWZ0ZXIgYSBwYXNzaW5nIHRpbWVvdXQtd3JhcHBlZCBjaGVjawk2NzBhMDg2MWQwNmE2MzNhYmFiMDM1MzZmZDdiYWJlNjIzMzIxYzljMDgxN2Q0ZDhkMTNkYjEzMGZkMDVmODNl
  ```
  ```
- 2026-09-17 · ecd7852* · exit 0 · `set -o pipefail …` · acceptance-sha256:9009f8207b565d1683699696b951b33c410dfbf1f24ae0aca2dd37bb9b6ed15a · ms:4225
- 2026-09-17 · ecd7852* · exit 0 · `set -o pipefail …` · acceptance-sha256:9009f8207b565d1683699696b951b33c410dfbf1f24ae0aca2dd37bb9b6ed15a · ms:3576
- 2026-09-17 · ecd7852* · exit 0 · `set -o pipefail …` · acceptance-sha256:9009f8207b565d1683699696b951b33c410dfbf1f24ae0aca2dd37bb9b6ed15a · ms:3488
- 2026-09-17 · ecd7852* · exit 0 · `set -o pipefail …` · acceptance-sha256:9009f8207b565d1683699696b951b33c410dfbf1f24ae0aca2dd37bb9b6ed15a · ms:3655
- 2026-09-17 · ecd7852* · exit 0 · `set -o pipefail …` · acceptance-sha256:9009f8207b565d1683699696b951b33c410dfbf1f24ae0aca2dd37bb9b6ed15a · ms:6055
- 2026-09-17 · ecd7852* · exit 0 · `set -o pipefail …` · acceptance-sha256:9009f8207b565d1683699696b951b33c410dfbf1f24ae0aca2dd37bb9b6ed15a · ms:3915
- 2026-09-17 · ecd7852* · exit 0 · `set -o pipefail …` · acceptance-sha256:9009f8207b565d1683699696b951b33c410dfbf1f24ae0aca2dd37bb9b6ed15a · ms:3228
- 2026-09-17 · 332a707* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:9009f8207b565d1683699696b951b33c410dfbf1f24ae0aca2dd37bb9b6ed15a · ms:0 · test-lock-sha256:1540740e56b32ff1e1c6ce3023ec289272bb941485cac3ba3c8bb9b5b4f5ae23 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIHJldmlzaW9uIHBhdGggdW5kZXIgYSB1c2VkIGdpdCBjaGFubmVsIGlzIG5vdCBhIGNoYW5nZWQgcGF0aAk0MzY1NmU4ODJkMmM0NTNlODI0NzQyYWQ2MmJjZDNlMjc2YzA0YjJkZjVhM2MxM2NhZmU5MzIxYWI2NTUyNWJlCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCWEgdGltZW91dCB3cmFwcGVyIGRvZXMgbm90IGxhdW5kZXIgYSBtdXRhdGlvbgk5N2MzY2U5MmEwNjIxMWU1Y2YwNzI3MTdlNDljMjkwMDkxNzBlYmYwMjgzMjlkMjE2ODNiOWJiODZhMTQ0YzEyCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCWEgdGltZW91dC13cmFwcGVkIGNoZWNrIGlzIGEgY2hlY2sJMGMxYzYzNmUxMGZkNjM0YjAxNTA4NzFmNTNiN2MyNjZiYTdiNDNmMjU2M2M3ZmJmNTBkMTg0MjkxZjhlNWI3ZApib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIHdyYXBwZXIgZmlsZSBvcGVyYW5kIGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCWIwYmE2NjY5N2RjZmNhZjRlYTRiYzQ5NDkzOWY3ZTY1YjEzNThlYjdiYjJlMmZlNWZlZTdjMzYwMDM1YmE3NDQKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJYSB3cml0ZSBiZXNpZGUgYSByZWFkIGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCTQyMTQyYTg2MDZmZDYxYjM1NjA5NjI4MWE2YWJkYWJjOWZhZDlmZTU2NzFjMWM5MmNkYzczY2I3MjdiODg1NjMKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJYW4gZWNobyByZWRpcmVjdCB0YXJnZXQgaXMgc3RpbGwgYSBjaGFuZ2VkIHBhdGgJNGI2MjhkNjA4ZDYwZTlhNWY3MWUyNWIzYmRmNGM2NDZjNmQ1NzY3ZGIyYTQ0NWI3NjU0MDJjNTk3ODdjYWYzZQpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhbiBleHBvcnRlZCBuYW1lIGtlZXBzIGl0cyBhc3NpZ25lZCBwYXRoIGFmdGVyIGEgcmVhZAk5MTFmYWQ1YWU0YmYwYWMwNTczYmMwNTAxZWIxOWNkODZhOTJjZWQwZTEzMTJhOWM3ZTFhOTcwMzljYjM3M2NkCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCWVjaG8gYW5kIHByaW50ZiBhcmd1bWVudHMgYXJlIG5vdCBjaGFuZ2VkIHBhdGhzCWQ1NTZjYzcyMjA0NmY4N2IyMGM0ZTk5N2NjMzAwNzU2YzIwMGNjMGFjNWNhMzU5YjU4M2NiYWZiMzc5MTJjNmUKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJbXJ3IHJlYWQgaXMgYSByZWFkLCBub3QgYW4gdW5wcm92ZW4gd3JpdGUJYjljMjYyYjRlNjM3YjNiZTUwNTdjNWM1ODhhZmUxYjNiMWEwMDFjZjFmMGM3ZjVlYzJjNTM1MzlkNWEyODA3Mgpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwltcncgd3JpdGUgaXMgc3RpbGwganVkZ2VkIGFzIGEgd3JpdGUJODE5YzU2ZGM4N2E3M2QyNDM5ZDA2OTI5YTUwMmY1ZDBkODM3MDVkNjhhNjM5ODJlMjRhYjgzZmQ3NDFhZmM0Mwpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlyZWFkLW9ubHkgYXJndW1lbnRzIGFyZSBub3QgY2hhbmdlZCBwYXRocwkxMTE1MGE2N2VlMzkwYmRjNjNlMzEwNmFhMTg3MDZlZjQxMjljNTYzOTM0M2M3NjRlNzQ1YTNjMWZlNmYwMDRjCnVucHJvdmVuCXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIG5lc3RlZCBwdWJsaXNoIG9yIGEgcmVwb3NpdG9yeSBvdmVycmlkZSBzdGlsbCBhcm1zIHRoZSBjb21taXQgYWR2aXNvcnk · test-lock-kind:replace
- 2026-09-17 · 332a707* · exit 1 · `set -o pipefail …` · acceptance-sha256:9009f8207b565d1683699696b951b33c410dfbf1f24ae0aca2dd37bb9b6ed15a · ms:100
  ```
  --- last 1 line(s) of stdout
  did not run: a nested publish or a repository override still arms the commit advisory
  ```
