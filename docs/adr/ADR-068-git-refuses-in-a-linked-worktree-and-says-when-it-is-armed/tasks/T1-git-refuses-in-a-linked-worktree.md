# Task ADR-068-T1: Git's hook judges a linked worktree of the session's repository

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one module and its tests)
**Owner:** unassigned
**Produces:** the common-directory lookup in `runPublishHook`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a worktree of the session's repository is judged`, `a scratch repository still passes`

## Goal

`runPublishHook` judges a linked worktree when the worktree holds no session log but its common git directory's repository does (ADR-068 Decision 1). A repository whose common directory holds no log still passes.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/publish-hook.mjs` | edit | the no-log gate asks the common directory |
| `tests/publish-hook.test.mjs` | edit | the worktree tests |
| `tests/mutations.json` | edit | mutants |

## Ordered Steps

1. [S1] Write the tests below and see each fail on an assertion (TDD red): the unchecked worktree commit exits 0 today.
2. [S2] In `runPublishHook`, when `readEvents(cwd, session)` is empty, resolve `git rev-parse --git-common-dir` against `cwd`; if its repository's state holds the session's log, go on to judge; otherwise return 0 as today.
3. [S3] Record mutants with `adr-verify --mutant`: skip the common-directory lookup; judge every repository with no log. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/publish-hook.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (an unchecked commit in a linked worktree of the session.s repository is refused|a checked linked worktree commits, and a scratch repository still passes)' | grep -qx 2
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an unchecked commit in a linked worktree of the session's repository is refused` | `tests/publish-hook.test.mjs` | with the session log in the main checkout, a real `git commit` in a linked worktree placed outside the main checkout's directory, with an unchecked change, exits non-zero and names the refusal; the same commit in the main checkout is refused too (the parity twin) | none | S1, S2 |
| `a checked linked worktree commits, and a scratch repository still passes` | `tests/publish-hook.test.mjs` | after `qh-check` runs in the worktree its commit exits 0; a separate repository with no log anywhere commits unchecked with exit 0 (the ADR-066 case) | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the lookup in `runPublishHook` |
| 2 — something selects it | git runs the hook in the worktree through the session's config exports |
| 3 — the caller can discover it | the refusal text, as in the main checkout |
| 4 — it is used | every commit and push in a worktree of an armed session |

## Mutation Log
- 2026-09-27 · 9b49efa* · mutant killed · exit 1 · `plugin/scripts/publish-hook.mjs` · the hook skips the common-directory lookup, so a linked worktree passes unchecked · acceptance-sha256:a81426389bff1c3ca2a9a5d9b3a31c8f017667365c739cc40729dc9bad86ca19 · covers:a worktree of the session's repository is judged
- 2026-09-27 · 9b49efa* · mutant killed · exit 1 · `plugin/scripts/publish-hook.mjs` · the hook judges every repository, a scratch one with no log included · acceptance-sha256:a81426389bff1c3ca2a9a5d9b3a31c8f017667365c739cc40729dc9bad86ca19 · covers:a scratch repository still passes

## Invariants

- A repository with no session log in it or in its common directory is never judged.
- A worktree's checks stay its own.

## Risks

- The tests spawn real git in temporary directories only (CLAUDE.md §9), with no inherited `GIT_CONFIG_*`.

## Stop Condition

Stop and ask if a worktree test needs a shared state directory to pass.

## Out of Scope

- Submodules (deferred: docs/BACKLOG.md §306)

## Verification Log
- 2026-09-27 · 9b49efa* · exit 1 · `set -o pipefail …` · acceptance-sha256:a81426389bff1c3ca2a9a5d9b3a31c8f017667365c739cc40729dc9bad86ca19 · ms:8109 · test-lock-sha256:fbf6ff8ac8866267b8c166f03c0f08fe1105c7d2e8f1416b2f458a8b2677f894 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3B1Ymxpc2gtaG9vay50ZXN0Lm1qcwlhIGNoZWNrZWQgY29tbWl0LCBhIHBlcnNvbidzIGNvbW1pdCBhbmQgYSBtZXJnZSBwYXNzIHRoZSBob29rCThlMDQ5ODYxODNjYjE5NzQ1NGQ3ODhiOTMwNjE0NGQzMWM2NGRjOWY3OGNkYzNhNzJiNDUxYzE1OTVlNGU3NTAKYm9keQl0ZXN0cy9wdWJsaXNoLWhvb2sudGVzdC5tanMJYSBjaGVja2VkIGxpbmtlZCB3b3JrdHJlZSBjb21taXRzLCBhbmQgYSBzY3JhdGNoIHJlcG9zaXRvcnkgc3RpbGwgcGFzc2VzCTJmZTg4NjM1OWI1NjkzYjM5OTBlNzEzMWEzMTVlZGI4Mjg4MGU4YmYxZDY2YjgyMmFiZjBjYTRjZDdhNmNkODIKYm9keQl0ZXN0cy9wdWJsaXNoLWhvb2sudGVzdC5tanMJYSBjaGVycnktcGljayBpbiBwcm9ncmVzcyBpcyBjb25jbHVkZWQgd2l0aG91dCB0aGUgaG9vayByZWZ1c2luZyBpdAk2OGQ3YmM5OGMzMTNjMjY4NTg2ZDg5NTE1NDU0OWNkNzI2YWI1NzNmMTFhNDdiNWQxN2M2MTk0MWVkMjRmZjQ2CmJvZHkJdGVzdHMvcHVibGlzaC1ob29rLnRlc3QubWpzCWFuIGV4aXN0aW5nIEdJVF9DT05GSUdfQ09VTlQga2VlcHMgaXRzIGVudHJpZXMJZWFmZTEzZGU4ZDY4NjNhMGNhZWJjMTUxZmI0ZDQxNTNjNDFlM2EyODJmZmU5NWE2YWViYTdiMDFlNTM1MThhNQpib2R5CXRlc3RzL3B1Ymxpc2gtaG9vay50ZXN0Lm1qcwlhbiBpbnN0YWxsYXRpb24gcGF0aCB3aXRoIHNoZWxsIGNoYXJhY3RlcnMgc3Vydml2ZXMgdGhlIGV4cG9ydHMJYzc2YmRlNDNjMGZjZjZlMzE5ZWIwZjcwYTY5MmY3OTBjYWI3YjA0NWY5ZTJkN2Q2Yzk5ZjE1OGQ3MTUwOTkxZgpib2R5CXRlc3RzL3B1Ymxpc2gtaG9vay50ZXN0Lm1qcwlhbiB1bmNoZWNrZWQgY29tbWl0IGluIGEgbGlua2VkIHdvcmt0cmVlIG9mIHRoZSBzZXNzaW9uJ3MgcmVwb3NpdG9yeSBpcyByZWZ1c2VkCTUxZTY0ODFiMDRjMzRlYjY2NDljNzI0OTI5Mzk1ZWJkMzI4ZjVmYjVkNTIyZTkwMTRhMzI5ODQ2ZTUwZGU4M2UKYm9keQl0ZXN0cy9wdWJsaXNoLWhvb2sudGVzdC5tanMJYW4gdW5jaGVja2VkIGNvbW1pdCBpcyByZWZ1c2VkIGJ5IGdpdCBpbiB0aGUgcmVwb3NpdG9yeSBpdCBydW5zIGluCTM4ZTU2NWNiMjdjN2FlNDc1NWJlZDBiNTgxMDY4ZTA1OGMyYjdmZDAxNGI4Y2EwMjZiMWRmYzEyMjkwOTBmZjUKYm9keQl0ZXN0cy9wdWJsaXNoLWhvb2sudGVzdC5tanMJc2Vzc2lvbnN0YXJ0IG9mZmVycyB0aGUgaG9vayBvbmx5IHdoZXJlIGdpdCBydW5zIGNvbmZpZyBob29rcwliYmQ0Yjk4NDNjMTRkNmRmYjBiOGViZTg5Y2U2MmVkNTI1ZDk2ZDYyOWRhMDRhMzFiYWZhYWU4MDVhZjRlYzg4CmJvZHkJdGVzdHMvcHVibGlzaC1ob29rLnRlc3QubWpzCXRoZSBzb3VyY2VkIGVudiBmaWxlIG1ha2VzIGdpdCBydW4gdGhlIGhvb2sgb3ZlciBhIHJlcG8tbG9jYWwgZGlzYWJsZQk2YjhmZjlhYzVjMWJjNjRmOWIxYzQwMmQ0MTFiZWQ2OTI5Mjc0ODlmNTNhZGE1YmNjZWQ4YWZjN2JlMjVhYTRj
  ```
  --- last 10 line(s) of stderr (of 82 after folding 82 raw)
    ...
  1..9
  # tests 9
  # suites 0
  # pass 8
  # fail 1
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 7949.556583
  ```
- 2026-09-27 · 9b49efa* · exit 0 · `set -o pipefail …` · acceptance-sha256:a81426389bff1c3ca2a9a5d9b3a31c8f017667365c739cc40729dc9bad86ca19 · ms:13888
- 2026-09-27 · 9b49efa* · exit 0 · `set -o pipefail …` · acceptance-sha256:a81426389bff1c3ca2a9a5d9b3a31c8f017667365c739cc40729dc9bad86ca19 · ms:7328
- 2026-10-10 · 78406f71* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:a81426389bff1c3ca2a9a5d9b3a31c8f017667365c739cc40729dc9bad86ca19 · ms:0 · test-lock-sha256:16e2d58950f318587291c15593a67d73b2940b4bf41a543f9697c557481c1997 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcHVibGlzaC1ob29rLnRlc3QubWpzCWEgY2hlY2tlZCBjb21taXQsIGEgcGVyc29uJ3MgY29tbWl0IGFuZCBhIG1lcmdlIHBhc3MgdGhlIGhvb2sJOGUwNDk4NjE4M2NiMTk3NDU0ZDc4OGI5MzA2MTQ0ZDMxYzY0ZGM5Zjc4Y2RjM2E3MmI0NTFjMTU5NWU0ZTc1MApib2R5CXRlc3RzL3B1Ymxpc2gtaG9vay50ZXN0Lm1qcwlhIGNoZWNrZWQgbGlua2VkIHdvcmt0cmVlIGNvbW1pdHMsIGFuZCBhIHNjcmF0Y2ggcmVwb3NpdG9yeSBzdGlsbCBwYXNzZXMJMmZlODg2MzU5YjU2OTNiMzk5MGU3MTMxYTMxNWVkYjgyODgwZThiZjFkNjZiODIyYWJmMGNhNGNkN2E2Y2Q4Mgpib2R5CXRlc3RzL3B1Ymxpc2gtaG9vay50ZXN0Lm1qcwlhIGNoZXJyeS1waWNrIGluIHByb2dyZXNzIGlzIGNvbmNsdWRlZCB3aXRob3V0IHRoZSBob29rIHJlZnVzaW5nIGl0CTY4ZDdiYzk4YzMxM2MyNjg1ODZkODk1MTU0NTQ5Y2Q3MjZhYjU3M2YxMWE0N2I1ZDE3YzYxOTQxZWQyNGZmNDYKYm9keQl0ZXN0cy9wdWJsaXNoLWhvb2sudGVzdC5tanMJYSBob29rIHdob3NlIG5vZGUgbW92ZWQgc3RpbGwgcnVucywgYW5kIG9uZSB3aG9zZSBzY3JpcHQgaXMgZ29uZSByZWZ1c2VzIG5vdGhpbmcJZmQ1NTc3YzVjNGIwN2YyMmY4ZTU1NjBkMWFiOWNkZWZkZWQyZTA0MGM3MDAxMjJmOTk2N2MzZDU5YmM2YmViYgpib2R5CXRlc3RzL3B1Ymxpc2gtaG9vay50ZXN0Lm1qcwlhIHRvcm4gbG9nIHRhaWwgZG9lcyBub3Qgc3dhbGxvdyB0aGUgaG9vaydzIG93biByZWNvcmQJYWY1YjE0YTBlYWY1YWU5NGQwNThlYzZkZTI0NDc5NjIxYzliYzU1YTA5YmRhNWVhY2U3NjgwZWMwMWExN2NkNApib2R5CXRlc3RzL3B1Ymxpc2gtaG9vay50ZXN0Lm1qcwlhIHdvcmt0cmVlIG9mIGEgYmFyZSByZXBvc2l0b3J5IGlzIGp1ZGdlZCwgYW5kIGEgc3VibW9kdWxlIGlzIGl0cyBvd24gcmVwb3NpdG9yeQllYzM1MjhiMDVmZGIwM2NmNWE3Y2VkMWViYmYwMWJiMWI2Yjg1YzExZTNlMWRjYTIwODE4MDI0MjY1ZGNmYTU1CmJvZHkJdGVzdHMvcHVibGlzaC1ob29rLnRlc3QubWpzCWFuIGV4aXN0aW5nIEdJVF9DT05GSUdfQ09VTlQga2VlcHMgaXRzIGVudHJpZXMJYmE0NjhiMTI2MTgxYWM1MzBkOTFmOTM4YTgwNzAyYTVhNWZlZTk2YzI4NDliYjVhMDMwM2QxMTVjMDExYzA0Zgpib2R5CXRlc3RzL3B1Ymxpc2gtaG9vay50ZXN0Lm1qcwlhbiBpbnN0YWxsYXRpb24gcGF0aCB3aXRoIHNoZWxsIGNoYXJhY3RlcnMgc3Vydml2ZXMgdGhlIGV4cG9ydHMJNjQ3MjE4ZjcwNDNlZjAwMTA4YzYyMTFhZWUwOWQwMTJhNDBiZjU3ZWU0NTMxY2FmY2FjYjg5MDgwYzEwYjcxZQpib2R5CXRlc3RzL3B1Ymxpc2gtaG9vay50ZXN0Lm1qcwlhbiB1bmNoZWNrZWQgY29tbWl0IGluIGEgbGlua2VkIHdvcmt0cmVlIG9mIHRoZSBzZXNzaW9uJ3MgcmVwb3NpdG9yeSBpcyByZWZ1c2VkCTUxZTY0ODFiMDRjMzRlYjY2NDljNzI0OTI5Mzk1ZWJkMzI4ZjVmYjVkNTIyZTkwMTRhMzI5ODQ2ZTUwZGU4M2UKYm9keQl0ZXN0cy9wdWJsaXNoLWhvb2sudGVzdC5tanMJYW4gdW5jaGVja2VkIGNvbW1pdCBpcyByZWZ1c2VkIGJ5IGdpdCBpbiB0aGUgcmVwb3NpdG9yeSBpdCBydW5zIGluCTM4ZTU2NWNiMjdjN2FlNDc1NWJlZDBiNTgxMDY4ZTA1OGMyYjdmZDAxNGI4Y2EwMjZiMWRmYzEyMjkwOTBmZjUKYm9keQl0ZXN0cy9wdWJsaXNoLWhvb2sudGVzdC5tanMJZ2l0J3MgaG9vayBpbiBhIGxpbmtlZCB3b3JrdHJlZSByZWNvcmRzIHRoYXQgaXQgcmFuIGluIHRoZSBzZXNzaW9uJ3Mgb3duIGxvZwk3MmQ5NzE4OWQzOWI5N2E0MjQxYmM1MmEzMmEyZWJlNWFhYmJjZDIyOGU3OTM5NDQzMWI5NTQ2MDc0ZWJiNzU3CmJvZHkJdGVzdHMvcHVibGlzaC1ob29rLnRlc3QubWpzCXNlc3Npb25zdGFydCBvZmZlcnMgdGhlIGhvb2sgb25seSB3aGVyZSBnaXQgcnVucyBjb25maWcgaG9va3MJNjRlNTkzNDBkNDUzMDJjMzA1YThlZTZlNzE3MGIxNDJjOGJhODAyMTBmNTE1OTQ2MDBiMzNiMjc4YTc0YjAwYQpib2R5CXRlc3RzL3B1Ymxpc2gtaG9vay50ZXN0Lm1qcwl0aGUgc291cmNlZCBlbnYgZmlsZSBtYWtlcyBnaXQgcnVuIHRoZSBob29rIG92ZXIgYSByZXBvLWxvY2FsIGRpc2FibGUJMDM5ODc1ZDM5Zjg2Yjc5ODIxYjIzZDE5NjQzODRhNjM2YThlM2Q1ZmEwMzI1ODI3ZDAwNmI3ZTRhYzQ1MGJlMw · test-lock-kind:replace
