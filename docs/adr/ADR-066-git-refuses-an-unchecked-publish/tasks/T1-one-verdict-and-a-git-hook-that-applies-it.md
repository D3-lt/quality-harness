# Task ADR-066-T1: One publish verdict, and a git hook that applies it where git runs

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (two modules and their tests)
**Owner:** unassigned
**Produces:** `publishVerdict()`; `plugin/scripts/publish-hook.mjs`; `publish.hook-ran`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the hook applies the verdict`, `the verdict is taken in the repository git runs in`, `a check run just before is seen`, `merges and sequencers pass`

## Goal

Extract rule P's decision into `publishVerdict({ cwd, sessionId, observation })`. It imports `checks.jsonl` and is called by PreToolUse unchanged.

Add `publish-hook.mjs <prepare-commit-msg|pre-push> [git's args]`:
- it records `publish.hook-ran` in the session log;
- it passes with no `CLAUDE_CODE_SESSION_ID`, with no session log in the repository, and while git shows a merge or sequencer in progress;
- otherwise it applies the verdict in the repository git runs it in, exiting 1 with the text on a refusal.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | extract and export `publishVerdict`, which calls `importCheckRecords`; rule P calls it |
| `plugin/scripts/publish-hook.mjs` | add | the git hook entry point |
| `tests/package.test.mjs` | read | confirms the shipped-set test sees the new script (edit only if it lists scripts explicitly) |
| `tests/publish-hook.test.mjs` | add | the tests below |
| `tests/mutations.json` | edit | mutants, including the one `Enforced-by` names |

## Ordered Steps

1. [S1] Write the tests below and see each fail on an assertion (TDD red).
2. [S2] Extract `publishVerdict` from `publishUnchecked` and have it import `checks.jsonl`. Rule P's decisions stay unchanged, and `tests/publish-command.test.mjs` and `tests/fail-open.test.mjs` stay green unmodified.
3. [S3] Add `publish-hook.mjs`:
   - read the session id from the environment, and record `publish.hook-ran`;
   - on `prepare-commit-msg`, pass when `MERGE_HEAD`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `rebase-merge` or `rebase-apply` exists in the git directory;
   - observe the repository at `process.cwd()` and call `publishVerdict`;
   - on a refusal, print to stderr and exit 1.
4. [S4] Run the fences green, and record mutants with `adr-verify --mutant`:
   - the hook ignores the verdict;
   - the hook refuses without a session id;
   - the hook judges a different directory than its cwd;
   - the verdict skips the check import;
   - the sequencer pass is dropped.
   [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/publish-hook.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (an unchecked commit is refused by git in the repository it runs in|a checked commit, a person.s commit and a merge pass the hook)' | grep -qx 2 && node --test tests/publish-command.test.mjs tests/fail-open.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an unchecked commit is refused by git in the repository it runs in` | `tests/publish-hook.test.mjs` | in a temporary repository with a session log and an edited tree, with the hook injected through `GIT_CONFIG_*`, these each exit non-zero with the refusal text: `git commit`, the same from a script file, `git -C`, and `git commit --no-verify`; `publish.hook-ran` is logged | none | S1, S3 |
| `a checked commit, a person's commit and a merge pass the hook` | `tests/publish-hook.test.mjs` | these pass: a real `qh-check` then `git commit` in one script (the clean twin); `CLAUDE_CODE_SESSION_ID` unset; a repository with no log for the session; `git merge` and `git cherry-pick` | none | S1, S2, S3 |
| `a constant success is not a check and an unchecked publish is refused` | `tests/fail-open.test.mjs` | rule P still refuses through the extracted verdict; the Acceptance also runs every existing row of `tests/publish-command.test.mjs` unmodified | none | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `publishVerdict`, `publish-hook.mjs` |
| 2 — something selects it | git, through the injected config (T2); the "ignores the verdict" mutant |
| 3 — the caller can discover it | `git hook list prepare-commit-msg` names `qh-publish-commit` in an offered session |
| 4 — it is used | `publish.hook-ran` in session logs |

## Mutation Log
- 2026-09-26 · 70cdd4f* · mutant killed · exit 1 · `plugin/scripts/publish-hook.mjs` · the hook ignores the verdict, so git never refuses · acceptance-sha256:e0e7b9604813fbc62fc7a4963d6f6983556a55bd764c2b33638bc51cca42b43f
- 2026-09-26 · 70cdd4f* · mutant killed · exit 1 · `plugin/scripts/publish-hook.mjs` · the verdict is taken outside the repository git runs the hook in · acceptance-sha256:e0e7b9604813fbc62fc7a4963d6f6983556a55bd764c2b33638bc51cca42b43f
- 2026-09-26 · 70cdd4f* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the verdict does not import a qh-check that ran just before, so a checked tree is refused · acceptance-sha256:e0e7b9604813fbc62fc7a4963d6f6983556a55bd764c2b33638bc51cca42b43f
- 2026-09-26 · 70cdd4f* · mutant killed · exit 1 · `plugin/scripts/publish-hook.mjs` · a merge is judged as a commit and refused · acceptance-sha256:e0e7b9604813fbc62fc7a4963d6f6983556a55bd764c2b33638bc51cca42b43f
- 2026-09-26 · 70cdd4f* · mutant survived · exit 0 · `plugin/scripts/publish-hook.mjs` · a commit with no session id is judged at all · acceptance-sha256:e0e7b9604813fbc62fc7a4963d6f6983556a55bd764c2b33638bc51cca42b43f
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-09-26 · 70cdd4f* · mutant killed · exit 1 · `plugin/scripts/publish-hook.mjs` · the hook ignores the verdict, so git never refuses · acceptance-sha256:e0e7b9604813fbc62fc7a4963d6f6983556a55bd764c2b33638bc51cca42b43f · covers:the hook applies the verdict
- 2026-09-26 · 70cdd4f* · mutant killed · exit 1 · `plugin/scripts/publish-hook.mjs` · the verdict is taken outside the repository git runs the hook in · acceptance-sha256:e0e7b9604813fbc62fc7a4963d6f6983556a55bd764c2b33638bc51cca42b43f · covers:the verdict is taken in the repository git runs in
- 2026-09-26 · 70cdd4f* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a qh-check run just before the commit is not imported, so the checked tree is refused · acceptance-sha256:e0e7b9604813fbc62fc7a4963d6f6983556a55bd764c2b33638bc51cca42b43f · covers:a check run just before is seen
- 2026-09-26 · 70cdd4f* · mutant killed · exit 1 · `plugin/scripts/publish-hook.mjs` · a merge or a concluded cherry-pick is judged as a plain commit and refused · acceptance-sha256:e0e7b9604813fbc62fc7a4963d6f6983556a55bd764c2b33638bc51cca42b43f · covers:merges and sequencers pass

## Invariants

- What rule P refuses is unchanged by this task.
- The hook never refuses without a session id, outside a repository holding that session's log, or during a merge or sequencer.

## Risks

- A hook runs with git's environment, where `GIT_INDEX_FILE` may name the lock being committed; `observe()` copies whatever index git names, which the reviewer measured correct under `commit -a`.
- The mutant that drops the no-session-id guard SURVIVED (Mutation Log): with no id there is no session log, so the no-log guard passes the commit as well. The guard stays as the explicit statement of Decision 2; only a log filed under an empty id could tell the two apart.
- The first cut also passed a `merge` source; the catalogue showed git's own state (`MERGE_HEAD`, `CHERRY_PICK_HEAD`) covers every case it did, so it was removed rather than kept untestable.

## Stop Condition

Stop and ask if extracting the verdict changes any row of the existing publish tables.

## Out of Scope

- Offering the hook (T2's job)
- Changing what rule P refuses (T3's job)

## Verification Log
- 2026-09-26 · 70cdd4f* · exit 1 · `set -o pipefail …` · acceptance-sha256:e0e7b9604813fbc62fc7a4963d6f6983556a55bd764c2b33638bc51cca42b43f · ms:1519 · test-lock-sha256:ac9a64d4e0305460eca10a930168ec38e2f642392c19e92cae9efa2b2ea425c4 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2ZhaWwtb3Blbi50ZXN0Lm1qcwlSMiBvdmVyIHNldmVyYWwgY29tbWl0cyBzYXlzIGF0IGxlYXN0IG9uZSBjb3VsZCBub3QgYmUgZXN0YWJsaXNoZWQJNGYwY2VlNTM5YWM1NmRmYzg2NmU4NDgxMGNiMjM4Y2RmODk3OWM1MWM3MTg1MjY2MTUzMzk5YmY1NGMzYmVmNQpib2R5CXRlc3RzL2ZhaWwtb3Blbi50ZXN0Lm1qcwlhIGNoZWNrIHRoYXQgY291bGQgbm90IGxvb2sgYWZ0ZXIgYSBwYXNzIHdhcm5zIGFuZCBkb2VzIG5vdCByZWZ1c2UJZGFiNWY3NGVkYjZmZmVlOGZhOTkzZjUwOGFmMDAxZTBjNjU5MzZlZTExNTRiODJlZTNkNDkwNTJiMTNiMTY3OQpib2R5CXRlc3RzL2ZhaWwtb3Blbi50ZXN0Lm1qcwlhIGNoZWNrIHRoYXQgY291bGQgbm90IGxvb2sgaXMgbm90IHJlcG9ydGVkIGFzIG5vIGNoZWNrIHBhc3NpbmcJOWVjYTI5ZGM2NGU0ZGQ0NjI5ZmI4MGU1YzdiMjc3MzQ3MzNmYjVjYmYxZmYyMTQyODU0Mzk0YzIyMGFjNWFkMApib2R5CXRlc3RzL2ZhaWwtb3Blbi50ZXN0Lm1qcwlhIGNvbnN0YW50IHN1Y2Nlc3MgaXMgbm90IGEgY2hlY2sgYW5kIGFuIHVuY2hlY2tlZCBwdWJsaXNoIGlzIHJlZnVzZWQJNjZhZTljOTU2ZWNiNWU3ZmY1NTYyN2RiNzE2N2M1NGViYTQxZmE0NGFjNjY3NWE4ZGRkZTIwNWVmODkzYzY0Ywpib2R5CXRlc3RzL2ZhaWwtb3Blbi50ZXN0Lm1qcwlhIHBhc3MgcmVjb3JkZWQgYmVmb3JlIGFuIHVub2JzZXJ2YWJsZSB3cml0ZSBkb2VzIG5vdCBjb3ZlciBpdAkyMjg2YTQwMzgyZTNiNTU2MzNhZDgzOGVmNjM2MWU0NTE4YWRiNDU0ZTFiMzc1YTk3ZDA1MzE3NTQwYTFmNzhjCmJvZHkJdGVzdHMvZmFpbC1vcGVuLnRlc3QubWpzCWEgcGFzc2luZyBjaGVjayBvbiB0aGUgdHJlZSBpcyBub3QgcmVmdXNlZCBiZWNhdXNlIHRoZSBpbmRleCBkaWZmZXJzIGZyb20gaXQJZTIyNTY1MDdmMGVjMDJhMTIwZjhiNjRiNWU5MmZkZjM2MzAzMDFiMjYzMGUzZjQ3MmY1Nzg4OGEzMzI1MDJhOApib2R5CXRlc3RzL2ZhaWwtb3Blbi50ZXN0Lm1qcwlhIHByb2plY3QgY2FuIHR1cm4gdGhlIHB1Ymxpc2ggcmVmdXNhbCBiYWNrIGludG8gYSB3YXJuaW5nLCBhbmQgb25seSBvbiBwdXJwb3NlCTNmZjY5YTdkZjY5ODBlYTdlNzQ1MzMyYTgwMjZhMDhiZTg0ZDJmNzVjMmVjZDFmMjE4YmY1YmE2YjQ3ZDgxY2YKYm9keQl0ZXN0cy9mYWlsLW9wZW4udGVzdC5tanMJYSBwdWJsaXNoIHRocm91Z2ggdGhlIFBvd2VyU2hlbGwgdG9vbCBpcyByZWZ1c2VkLCBhbmQgZGVuaWVkIHRvIGEgcmVhZC1vbmx5IHJvbGUJNjFlY2VmZTJiOGY5NDlmYzI0ZDM5NzUxODkzMzM1ZWM4ZWYzZjU3NzJiYjAyZTk0OTExNmM1MzE4NmEwZDdlNgpib2R5CXRlc3RzL2ZhaWwtb3Blbi50ZXN0Lm1qcwlhIHJvb3QgcXVlcnkgdGhhdCBkaWQgbm90IGFuc3dlciBpcyBub3QgYSBwYXNzCTg2Nzg1YTI1ODdlODFmYzY2OTY2YWU4MTM2ZDc2MTdkMTNmODk1Y2I3ZTg3M2ZmYjQ0MDgxMDAwODVlZTMwMWEKYm9keQl0ZXN0cy9mYWlsLW9wZW4udGVzdC5tanMJYSB3cml0ZSBzdGF5cyBvdXRzdGFuZGluZyBieSBsb2cgb3JkZXIsIG5vdCBieSBpdHMgdGltZXN0YW1wCTgzNzQ2MTdlN2Q3MzA0MzM3ZDBhNGE5YjMzNmNmMTM4YzMwNDI0M2QzN2JiZDJiYmI4YTQ3YmI1ZTY1YzVlNDcKYm9keQl0ZXN0cy9mYWlsLW9wZW4udGVzdC5tanMJYSB3cml0ZSB3aG9zZSBjaGVjayBjb3VudCBmYWlsZWQgc3RheXMgb3V0c3RhbmRpbmcJMmI4MGQ3NGY0ZTBlZGNmMzRmMjBiZTEzNWRhOTJlMWNhMGM1NWVkMmZkZjIyMDg1Mjc0NTM2MTE0M2JhYjdhYQpib2R5CXRlc3RzL2ZhaWwtb3Blbi50ZXN0Lm1qcwlhbiBpbmRleCB0aGF0IGNvdWxkIG5vdCBiZSBjaGVja2VkIGRvZXMgbm90IHJlc2N1ZSBhIGZhaWxlZCB3b3JraW5nIHRyZWUJNDE5MTExMTc2YzhiNGVjOWU3ZTczYzkxOTAxZWEyMjJjMmViNjU4YjkzMmQ3NTYwYmU4MWJmMDA3NTNhN2Q2YQpib2R5CXRlc3RzL2ZhaWwtb3Blbi50ZXN0Lm1qcwlhbiBpbmRleCB0aGF0IGNvdWxkIG5vdCBiZSBjaGVja2VkIHNheXMgdW5rbm93biBldmVuIHdoZW4gdGhlIHRyZWUgcGFzc2VkCTcwMDQ3MDBlZGQ3OWRlNTA2NmRkYjM1ZDY0NDFjNDU0N2U3YjRkMTcwZTZlNjdhNmRjM2I1NzkwMDcwMDI3MWQKYm9keQl0ZXN0cy9mYWlsLW9wZW4udGVzdC5tanMJYW4gdW5jaGVja2VkIGluZGV4IHdhcm5pbmcgZG9lcyBub3QgaW52ZW50IGEgcGFzc2luZyBjaGVjawk2NmNhMzRjNzUwMzc0ZDhmMGE1NjRjMjNjOGZjYjIyMjA1MDgzMTE1OTc2Mjk4NzVlYjM3OWYwZGIyOTdkOTQzCmJvZHkJdGVzdHMvZmFpbC1vcGVuLnRlc3QubWpzCWFuIHVucmVzb2x2ZWQgY2hlY2sgb3JkZXIgaXMgbm90IHdvcmRlZCBhcyB1bmNoZWNrZWQJZjRiOTA1ZWZkOWJmYmNjZjdjNzgzMzE0M2U5NzcxNTRhMDk1Y2ViNmNhYmEzOGFhMTgyNDExNGU3YzMwNDUxNwpib2R5CXRlc3RzL2ZhaWwtb3Blbi50ZXN0Lm1qcwl0aGUgcHVibGlzaCBvcHQtb3V0IGlzIHJlYWQgZnJvbSB0aGUgcm9vdCB0aGUgZGVjaXNpb24gdXNlZCwgb3IgaXMgdW5rbm93bgk0YTE5NjY4ODI2MWQyZTRlNTY0ZDhjYWI2NzUxZWMzY2ZiYzAzMjMzYWZiMGE4ZDE5MmIyNGRmNWFmM2ExMGMzCmJvZHkJdGVzdHMvZmFpbC1vcGVuLnRlc3QubWpzCXRoZSBzZWNvbmQgY2xhaW1hbnQgb2YgYSBjb21wYWN0aW9uIG5vdGUgZG9lcyBub3Qgc2VydmUgaXQJZDM0MThhNmRmZDBlODI5ZWMyNTYzMzhiYWVlYTZkZjZiZjI5MGVmOGZiZDI0NTVkZDdkYjgyYjMxZGViODU2Ygpib2R5CXRlc3RzL3B1Ymxpc2gtaG9vay50ZXN0Lm1qcwlhIGNoZWNrZWQgY29tbWl0LCBhIHBlcnNvbidzIGNvbW1pdCBhbmQgYSBtZXJnZSBwYXNzIHRoZSBob29rCThlMDQ5ODYxODNjYjE5NzQ1NGQ3ODhiOTMwNjE0NGQzMWM2NGRjOWY3OGNkYzNhNzJiNDUxYzE1OTVlNGU3NTAKYm9keQl0ZXN0cy9wdWJsaXNoLWhvb2sudGVzdC5tanMJYW4gdW5jaGVja2VkIGNvbW1pdCBpcyByZWZ1c2VkIGJ5IGdpdCBpbiB0aGUgcmVwb3NpdG9yeSBpdCBydW5zIGluCTM4ZTU2NWNiMjdjN2FlNDc1NWJlZDBiNTgxMDY4ZTA1OGMyYjdmZDAxNGI4Y2EwMjZiMWRmYzEyMjkwOTBmZjU
  ```
  --- last 10 line(s) of stderr (of 128 after folding 129 raw)
    ...
  1..2
  # tests 2
  # suites 0
  # pass 0
  # fail 2
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 1378.646875
  ```
- 2026-09-26 · 70cdd4f* · exit 0 · `set -o pipefail …` · acceptance-sha256:e0e7b9604813fbc62fc7a4963d6f6983556a55bd764c2b33638bc51cca42b43f · ms:27463
- 2026-09-26 · 70cdd4f* · exit 0 · `set -o pipefail …` · acceptance-sha256:e0e7b9604813fbc62fc7a4963d6f6983556a55bd764c2b33638bc51cca42b43f · ms:42324
- 2026-09-26 · 70cdd4f* · exit 0 · `set -o pipefail …` · acceptance-sha256:e0e7b9604813fbc62fc7a4963d6f6983556a55bd764c2b33638bc51cca42b43f · ms:19625
- 2026-09-26 · 70cdd4f* · exit 0 · `set -o pipefail …` · acceptance-sha256:e0e7b9604813fbc62fc7a4963d6f6983556a55bd764c2b33638bc51cca42b43f · ms:20219
- 2026-09-26 · 70cdd4f* · exit 0 · `set -o pipefail …` · acceptance-sha256:e0e7b9604813fbc62fc7a4963d6f6983556a55bd764c2b33638bc51cca42b43f · ms:19156
- 2026-09-26 · 70cdd4f* · exit 0 · `set -o pipefail …` · acceptance-sha256:e0e7b9604813fbc62fc7a4963d6f6983556a55bd764c2b33638bc51cca42b43f · ms:26723
- 2026-09-26 · 70cdd4f* · exit 0 · `set -o pipefail …` · acceptance-sha256:e0e7b9604813fbc62fc7a4963d6f6983556a55bd764c2b33638bc51cca42b43f · ms:28777
- 2026-09-26 · 70cdd4f* · exit 0 · `set -o pipefail …` · acceptance-sha256:e0e7b9604813fbc62fc7a4963d6f6983556a55bd764c2b33638bc51cca42b43f · ms:28315
- 2026-09-26 · 70cdd4f* · exit 0 · `set -o pipefail …` · acceptance-sha256:e0e7b9604813fbc62fc7a4963d6f6983556a55bd764c2b33638bc51cca42b43f · ms:28482
- 2026-09-26 · 70cdd4f* · exit 0 · `set -o pipefail …` · acceptance-sha256:e0e7b9604813fbc62fc7a4963d6f6983556a55bd764c2b33638bc51cca42b43f · ms:37566
- 2026-09-26 · 2c0f7b2* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:e0e7b9604813fbc62fc7a4963d6f6983556a55bd764c2b33638bc51cca42b43f · ms:0 · test-lock-sha256:b68761f10a2fe00af252da0140bd5807f2b61cae78eea383bc4e3d28a5a1eea5 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2ZhaWwtb3Blbi50ZXN0Lm1qcwlSMiBvdmVyIHNldmVyYWwgY29tbWl0cyBzYXlzIGF0IGxlYXN0IG9uZSBjb3VsZCBub3QgYmUgZXN0YWJsaXNoZWQJNGYwY2VlNTM5YWM1NmRmYzg2NmU4NDgxMGNiMjM4Y2RmODk3OWM1MWM3MTg1MjY2MTUzMzk5YmY1NGMzYmVmNQpib2R5CXRlc3RzL2ZhaWwtb3Blbi50ZXN0Lm1qcwlhIGNoZWNrIHRoYXQgY291bGQgbm90IGxvb2sgYWZ0ZXIgYSBwYXNzIHdhcm5zIGFuZCBkb2VzIG5vdCByZWZ1c2UJZGFiNWY3NGVkYjZmZmVlOGZhOTkzZjUwOGFmMDAxZTBjNjU5MzZlZTExNTRiODJlZTNkNDkwNTJiMTNiMTY3OQpib2R5CXRlc3RzL2ZhaWwtb3Blbi50ZXN0Lm1qcwlhIGNoZWNrIHRoYXQgY291bGQgbm90IGxvb2sgaXMgbm90IHJlcG9ydGVkIGFzIG5vIGNoZWNrIHBhc3NpbmcJOWVjYTI5ZGM2NGU0ZGQ0NjI5ZmI4MGU1YzdiMjc3MzQ3MzNmYjVjYmYxZmYyMTQyODU0Mzk0YzIyMGFjNWFkMApib2R5CXRlc3RzL2ZhaWwtb3Blbi50ZXN0Lm1qcwlhIGNvbnN0YW50IHN1Y2Nlc3MgaXMgbm90IGEgY2hlY2sgYW5kIGFuIHVuY2hlY2tlZCBwdWJsaXNoIGlzIHJlZnVzZWQJNjZhZTljOTU2ZWNiNWU3ZmY1NTYyN2RiNzE2N2M1NGViYTQxZmE0NGFjNjY3NWE4ZGRkZTIwNWVmODkzYzY0Ywpib2R5CXRlc3RzL2ZhaWwtb3Blbi50ZXN0Lm1qcwlhIHBhc3MgcmVjb3JkZWQgYmVmb3JlIGFuIHVub2JzZXJ2YWJsZSB3cml0ZSBkb2VzIG5vdCBjb3ZlciBpdAkyMjg2YTQwMzgyZTNiNTU2MzNhZDgzOGVmNjM2MWU0NTE4YWRiNDU0ZTFiMzc1YTk3ZDA1MzE3NTQwYTFmNzhjCmJvZHkJdGVzdHMvZmFpbC1vcGVuLnRlc3QubWpzCWEgcGFzc2luZyBjaGVjayBvbiB0aGUgdHJlZSBpcyBub3QgcmVmdXNlZCBiZWNhdXNlIHRoZSBpbmRleCBkaWZmZXJzIGZyb20gaXQJZTIyNTY1MDdmMGVjMDJhMTIwZjhiNjRiNWU5MmZkZjM2MzAzMDFiMjYzMGUzZjQ3MmY1Nzg4OGEzMzI1MDJhOApib2R5CXRlc3RzL2ZhaWwtb3Blbi50ZXN0Lm1qcwlhIHByb2plY3QgY2FuIHR1cm4gdGhlIHB1Ymxpc2ggcmVmdXNhbCBiYWNrIGludG8gYSB3YXJuaW5nLCBhbmQgb25seSBvbiBwdXJwb3NlCTNmZjY5YTdkZjY5ODBlYTdlNzQ1MzMyYTgwMjZhMDhiZTg0ZDJmNzVjMmVjZDFmMjE4YmY1YmE2YjQ3ZDgxY2YKYm9keQl0ZXN0cy9mYWlsLW9wZW4udGVzdC5tanMJYSBwdWJsaXNoIHRocm91Z2ggdGhlIFBvd2VyU2hlbGwgdG9vbCBpcyByZWZ1c2VkLCBhbmQgZGVuaWVkIHRvIGEgcmVhZC1vbmx5IHJvbGUJNjFlY2VmZTJiOGY5NDlmYzI0ZDM5NzUxODkzMzM1ZWM4ZWYzZjU3NzJiYjAyZTk0OTExNmM1MzE4NmEwZDdlNgpib2R5CXRlc3RzL2ZhaWwtb3Blbi50ZXN0Lm1qcwlhIHJvb3QgcXVlcnkgdGhhdCBkaWQgbm90IGFuc3dlciBpcyBub3QgYSBwYXNzCTg2Nzg1YTI1ODdlODFmYzY2OTY2YWU4MTM2ZDc2MTdkMTNmODk1Y2I3ZTg3M2ZmYjQ0MDgxMDAwODVlZTMwMWEKYm9keQl0ZXN0cy9mYWlsLW9wZW4udGVzdC5tanMJYSB3cml0ZSBzdGF5cyBvdXRzdGFuZGluZyBieSBsb2cgb3JkZXIsIG5vdCBieSBpdHMgdGltZXN0YW1wCTgzNzQ2MTdlN2Q3MzA0MzM3ZDBhNGE5YjMzNmNmMTM4YzMwNDI0M2QzN2JiZDJiYmI4YTQ3YmI1ZTY1YzVlNDcKYm9keQl0ZXN0cy9mYWlsLW9wZW4udGVzdC5tanMJYSB3cml0ZSB3aG9zZSBjaGVjayBjb3VudCBmYWlsZWQgc3RheXMgb3V0c3RhbmRpbmcJMmI4MGQ3NGY0ZTBlZGNmMzRmMjBiZTEzNWRhOTJlMWNhMGM1NWVkMmZkZjIyMDg1Mjc0NTM2MTE0M2JhYjdhYQpib2R5CXRlc3RzL2ZhaWwtb3Blbi50ZXN0Lm1qcwlhbiBpbmRleCB0aGF0IGNvdWxkIG5vdCBiZSBjaGVja2VkIGRvZXMgbm90IHJlc2N1ZSBhIGZhaWxlZCB3b3JraW5nIHRyZWUJNDE5MTExMTc2YzhiNGVjOWU3ZTczYzkxOTAxZWEyMjJjMmViNjU4YjkzMmQ3NTYwYmU4MWJmMDA3NTNhN2Q2YQpib2R5CXRlc3RzL2ZhaWwtb3Blbi50ZXN0Lm1qcwlhbiBpbmRleCB0aGF0IGNvdWxkIG5vdCBiZSBjaGVja2VkIHNheXMgdW5rbm93biBldmVuIHdoZW4gdGhlIHRyZWUgcGFzc2VkCTcwMDQ3MDBlZGQ3OWRlNTA2NmRkYjM1ZDY0NDFjNDU0N2U3YjRkMTcwZTZlNjdhNmRjM2I1NzkwMDcwMDI3MWQKYm9keQl0ZXN0cy9mYWlsLW9wZW4udGVzdC5tanMJYW4gdW5jaGVja2VkIGluZGV4IHdhcm5pbmcgZG9lcyBub3QgaW52ZW50IGEgcGFzc2luZyBjaGVjawk2NmNhMzRjNzUwMzc0ZDhmMGE1NjRjMjNjOGZjYjIyMjA1MDgzMTE1OTc2Mjk4NzVlYjM3OWYwZGIyOTdkOTQzCmJvZHkJdGVzdHMvZmFpbC1vcGVuLnRlc3QubWpzCWFuIHVucmVzb2x2ZWQgY2hlY2sgb3JkZXIgaXMgbm90IHdvcmRlZCBhcyB1bmNoZWNrZWQJZjRiOTA1ZWZkOWJmYmNjZjdjNzgzMzE0M2U5NzcxNTRhMDk1Y2ViNmNhYmEzOGFhMTgyNDExNGU3YzMwNDUxNwpib2R5CXRlc3RzL2ZhaWwtb3Blbi50ZXN0Lm1qcwl0aGUgcHVibGlzaCBvcHQtb3V0IGlzIHJlYWQgZnJvbSB0aGUgcm9vdCB0aGUgZGVjaXNpb24gdXNlZCwgb3IgaXMgdW5rbm93bgk0YTE5NjY4ODI2MWQyZTRlNTY0ZDhjYWI2NzUxZWMzY2ZiYzAzMjMzYWZiMGE4ZDE5MmIyNGRmNWFmM2ExMGMzCmJvZHkJdGVzdHMvZmFpbC1vcGVuLnRlc3QubWpzCXRoZSBzZWNvbmQgY2xhaW1hbnQgb2YgYSBjb21wYWN0aW9uIG5vdGUgZG9lcyBub3Qgc2VydmUgaXQJZDM0MThhNmRmZDBlODI5ZWMyNTYzMzhiYWVlYTZkZjZiZjI5MGVmOGZiZDI0NTVkZDdkYjgyYjMxZGViODU2Ygpib2R5CXRlc3RzL3B1Ymxpc2gtaG9vay50ZXN0Lm1qcwlhIGNoZWNrZWQgY29tbWl0LCBhIHBlcnNvbidzIGNvbW1pdCBhbmQgYSBtZXJnZSBwYXNzIHRoZSBob29rCWQxNmMyZDIyYWFmOTU5MzliMWVkY2RjNzM5M2YwMmQwNDg3ODcyMTczNTUyMjk5NTlkYjk2OWVmMmE2OTI3MDkKYm9keQl0ZXN0cy9wdWJsaXNoLWhvb2sudGVzdC5tanMJYSBjaGVycnktcGljayBpbiBwcm9ncmVzcyBpcyBjb25jbHVkZWQgd2l0aG91dCB0aGUgaG9vayByZWZ1c2luZyBpdAlkMTZjMmQyMmFhZjk1OTM5YjFlZGNkYzczOTNmMDJkMDQ4Nzg3MjE3MzU1MjI5OTU5ZGI5NjllZjJhNjkyNzA5CmJvZHkJdGVzdHMvcHVibGlzaC1ob29rLnRlc3QubWpzCWFuIGV4aXN0aW5nIEdJVF9DT05GSUdfQ09VTlQga2VlcHMgaXRzIGVudHJpZXMJZDE2YzJkMjJhYWY5NTkzOWIxZWRjZGM3MzkzZjAyZDA0ODc4NzIxNzM1NTIyOTk1OWRiOTY5ZWYyYTY5MjcwOQpib2R5CXRlc3RzL3B1Ymxpc2gtaG9vay50ZXN0Lm1qcwlhbiB1bmNoZWNrZWQgY29tbWl0IGlzIHJlZnVzZWQgYnkgZ2l0IGluIHRoZSByZXBvc2l0b3J5IGl0IHJ1bnMgaW4JZDE2YzJkMjJhYWY5NTkzOWIxZWRjZGM3MzkzZjAyZDA0ODc4NzIxNzM1NTIyOTk1OWRiOTY5ZWYyYTY5MjcwOQpib2R5CXRlc3RzL3B1Ymxpc2gtaG9vay50ZXN0Lm1qcwlzZXNzaW9uc3RhcnQgb2ZmZXJzIHRoZSBob29rIG9ubHkgd2hlcmUgZ2l0IHJ1bnMgY29uZmlnIGhvb2tzCWQxNmMyZDIyYWFmOTU5MzliMWVkY2RjNzM5M2YwMmQwNDg3ODcyMTczNTUyMjk5NTlkYjk2OWVmMmE2OTI3MDkKYm9keQl0ZXN0cy9wdWJsaXNoLWhvb2sudGVzdC5tanMJdGhlIHNvdXJjZWQgZW52IGZpbGUgbWFrZXMgZ2l0IHJ1biB0aGUgaG9vayBvdmVyIGEgcmVwby1sb2NhbCBkaXNhYmxlCWQxNmMyZDIyYWFmOTU5MzliMWVkY2RjNzM5M2YwMmQwNDg3ODcyMTczNTUyMjk5NTlkYjk2OWVmMmE2OTI3MDk · test-lock-kind:replace
