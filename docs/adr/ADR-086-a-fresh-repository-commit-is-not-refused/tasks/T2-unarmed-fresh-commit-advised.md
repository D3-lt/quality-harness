# Task ADR-086-T2: an unarmed fresh-repository commit is advised

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one predicate and one branch in one file, its tests and campaign entries)
**Owner:** unassigned
**Produces:** `freshRepositoryCommit(command)` and its advisory, keyed `<key>:fresh`
**Consumes:** `freshDirectoryVariables` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the fresh-repository grammar accepts only an and-chain from mktemp to commit`, `an unarmed fresh-repository commit is advised, not refused`, `the fresh-repository advice carries its own key`

## Goal

In a session git's hook has not armed, rule P advises, rather than refuses, a Bash `git commit` whose text
proves, by ADR-086 Decision 2's grammar, that it lands in a repository the same command created in a
`mktemp -d` directory. Every form outside that grammar, the measured `;` spelling included, is still
refused.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `freshRepositoryCommit(command)` (new, beside `commitOnlyCommand` at `:814`), and one Bash-only branch in `publishUnchecked` beside the armed downgrade (`:5125-5128`) — that branch is what selects it |
| `tests/publish-command.test.mjs` | edit | four new tests beside the locked ones; `armedSession` (`:325`) gains a way to return the hook's text as well as its decision, a helper change no locked test body sees |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write the four tests in this task's Tests table and record the red run (TDD red). Every path in
   a row is assembled at runtime (CLAUDE.md §6). The executing test runs each row under `bash -c`. Its
   environment drops every `GIT_CONFIG_*` and `CLAUDE_*` name, sets `HOME` to its own temporary
   directory, and sets a git identity. Each repository it commits in is one it created (CLAUDE.md §9).
   Red today: each data row is `deny`. Re-run `python3 scripts/test-locks.py tests/publish-command.test.mjs`
   before editing the helper.
2. [S2] Add `freshRepositoryCommit(command)`, true only when every condition of ADR-086 Decision 2 holds.
   It reads T1's `freshDirectoryVariables`, `:4999`'s environment names and `HOOK_UNSAFE_FIRST`
   (`:4870`), and restates none of them.
3. [S3] In `publishUnchecked`, for the Bash tool only, when the verdict denies and
   `freshRepositoryCommit` holds, replace it with advice. The advice names the fresh repository, cites
   ADR-086, and says `qh-check` is still needed if the commit was meant for this checkout. Its key is
   `${verdict.key}:fresh`.
4. [S4] Record one killed mutant per Rests-on name, and add each to `tests/mutations.json`:
   - one that accepts a `;` joiner (the twin test goes red);
   - one that drops the branch (the data test goes red);
   - one that reuses the verdict's own key (the data test's mention assertion goes red).

   [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/publish-command.test.mjs 2>&1) \
  && for t in 'an unarmed commit into a repository the command creates is advised, not refused' 'an unarmed chain the text cannot place in a fresh repository is still refused' 'the fresh-repository rows commit where the classifier says they do' 'PowerShell, an offered-only session and the reviewer guard are unchanged'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an unarmed commit into a repository the command creates is advised, not refused` | `tests/publish-command.test.mjs` | unarmed and unchecked, each is not `deny`, and its text names ADR-086. The rows are `R=$(mktemp -d <tmp>/x.XXXX) && cd "$R" && git init -q && git add -A && git commit -q --allow-empty -m f`; the same with `cd $R`; one whose template lies inside the session repository; and one ending `git -c user.name=q -c user.email=q@e.invalid commit -q --allow-empty -m f`. The directory is empty when `git add` runs, so without `--allow-empty` the commit would fail (ADR-086 Consequences). After the first, `grep -n commit a.md` on the same tree still gets its own advisory | none | S1, S2, S3 |
| `an unarmed chain the text cannot place in a fresh repository is still refused` | `tests/publish-command.test.mjs` | unarmed and unchecked, each is `deny`. The rows: `R=$(mktemp -d <tmp>/x.XXXX); cd "$R" && git init -q && git commit -qm f` (the measured fail-open) and the owner's `R=$(mktemp -d <tmp>/x.XXXX); cd $R && git init -q && git add . && git commit -qm f`. `cd <session repo> && git commit -qm f`; `git -C . commit -qm f`; `cd "$R"; cd -; git commit -qm f`; `git init -q x && git commit -qm f`. And each of these after `R=$(mktemp -d) && …`: `(cd "$R" && git init -q) && git commit -qm f`; `cd "$R" && git init -q && cd - && git commit -qm f`; `cd "$R" && git commit -qm f` (no init); `cd "$R" && git init -q && git commit -qm f && git push`; `cd "$R" && git init -q \|\| git commit -qm f`; `cd "$R" && git init -q \| cat && git commit -qm f`; `cd "$R" && git init -q && GIT_DIR=<session repo>/.git git commit -qm f`; `cd "$R" && git init -q --separate-git-dir=<session repo>/.git && git commit -qm f`; `cd "$R" && printf 'gitdir: <session repo>/.git\n' > .git && git init -q && git commit -qm f`; `cd "$R" && git init -q && git -C <session repo> commit -qm f`; `cd "$R" && git init -q && git --git-dir=<session repo>/.git commit -qm f`; `git init -q "$R" && git -C "$R" commit -qm f`. Two more: `R=$(mktemp -d) && R=. && cd "$R" && git init -q && git commit -qm f` and `R=$(mktemp -d; echo .) && cd "$R" && git init -q && git commit -qm f`. CLEAN twin: after `qh-check`, none is `deny` | none | S1, S2, S3 |
| `the fresh-repository rows commit where the classifier says they do` | `tests/publish-command.test.mjs` | each data row, run under `bash -c` in the session repository, leaves that repository's `HEAD` unchanged and creates a commit in the directory `mktemp` made. The replay row `R=$(mktemp -d <missing dir>/x.XXXX); cd "$R" && git init -q && git add -A && git commit -qm f`, run where `a.md` is modified, moves the session repository's `HEAD` — the measured fail-open, replayed | none | S1 |
| `PowerShell, an offered-only session and the reviewer guard are unchanged` | `tests/publish-command.test.mjs` | the existing test, unchanged and locked | none | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the four tests |
| 2 — something selects it | `publishUnchecked` calls `freshRepositoryCommit` on a denying Bash verdict; the data test drives the real PreToolUse hook, so dropping the branch turns it red |
| 3 — the caller can discover it | the advisory text names ADR-086 |
| 4 — it is used | an unarmed session (PowerShell excluded, git below 2.54, or before the env file is sourced) staging a scratch repository; nothing measures this yet |

## Mutation Log
- 2026-10-06 · 3c740be* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · accepts a ; joiner, so the measured fail-open spelling is advised · acceptance-sha256:e06fac3493443b8e07ceaa6eb4ffb74e6ec17d6f8f9ba7df6336eb2a95dbf91c · covers:the fresh-repository grammar accepts only an and-chain from mktemp to commit
- 2026-10-06 · 3c740be* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · drops the fresh-repository branch, so the commit is refused again · acceptance-sha256:e06fac3493443b8e07ceaa6eb4ffb74e6ec17d6f8f9ba7df6336eb2a95dbf91c · covers:an unarmed fresh-repository commit is advised, not refused
- 2026-10-06 · 3c740be* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · reuses the verdict key, so a later mention on the tree is deduped into silence · acceptance-sha256:e06fac3493443b8e07ceaa6eb4ffb74e6ec17d6f8f9ba7df6336eb2a95dbf91c · covers:the fresh-repository advice carries its own key

## Invariants

- A `;`, newline, `||`, `|` or `&` anywhere in the chain keeps the refusal.
- No program other than `git init`, `git add` and `git commit` runs between `cd "$V"` and the commit.
- A text naming a push is never advised by this branch.
- The verdict's own key is never reused, so a later mention on the same tree is still advised.

## Risks

- Some `cd` might treat an empty operand differently than measured. The `&&` rule makes that moot,
  because the chain never reaches `cd` with an empty `V`. The executing test replays the `;` fail-open
  so the measurement stays live.

## Stop Condition

Stop and ask if any twin row is not `deny` after S3, if any data row commits outside its own directory
in the executing test, or if a locked test body would have to change.

## Out of Scope

- The `git -C "$V"` form, a program between `cd "$V"` and the commit, and a push — ADR-086 Out of Scope.

## Verification Log
- 2026-10-06 · 3c740be* · exit 1 · `out=$(node --test --test-reporter=tap tests/publish-command.test.mjs 2>&1) \ …` · acceptance-sha256:e06fac3493443b8e07ceaa6eb4ffb74e6ec17d6f8f9ba7df6336eb2a95dbf91c · ms:52684 · test-lock-sha256:66c68fcc9283db18e6ad29aa6e7c33995b7ec7305852168bc6d414edd225932e · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCVBvd2VyU2hlbGwsIGFuIG9mZmVyZWQtb25seSBzZXNzaW9uIGFuZCB0aGUgcmV2aWV3ZXIgZ3VhcmQgYXJlIHVuY2hhbmdlZAk4MWY0NmEyYzU1NDBkMTZjNGFjMzQwZGFiMDMwOTdlOGRiY2IyMDM3MTgxNmJiMDdiNzJmNmU3M2VlMjAzN2U2CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCVdpbmRvd3Mgc3BlbGxpbmdzIG9mIGEgcHVibGlzaCBhcmUgcmVjb2duaXNlZCwgYW5kIGxvb2stYWxpa2VzIGFyZSBub3QJOWMzNDFiN2FjZTZlYzdlMzA0YTY4ZWFjM2U5MGI3NzQxMDc5ZDYzYWEzODRlOGEyZDZjYzc0NDRkZjRjMGIyYQpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhIGJyYWNlLWJ1aWx0IHB1Ymxpc2ggaXMgcmVmdXNlZAkwYThlNGQ5ZDAzZjg4MGM3NmI3OGNhNzc1OTRlOWNhNDQwNmY0NjBiMDdkYzY3ZjAxYmM2ZDk4OTI5MGNlYWU3CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWEgcHVibGlzaCBpcyBmb3VuZCBieSBhcmd2LCBhcyB0aGUgc2hlbGwgcnVucyBpdAlkN2E2YmFjNGMzZmFjNDJjNTg0ZDIwMWUyZjliNGQzNmNmZWY1ZTllZDg0M2IyYjU3YzRjNjI0ZGI5ZDNmYjkzCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWEgc3RyaW5nIGhhbmRlZCB0byBhIHNoZWxsIGJ5IG9zLnN5c3RlbSBvciBvcy5wb3BlbiBpcyByZWFkIGFzIHRoYXQgc2hlbGwgcmVhZHMgaXQJZTcxZGNmMTRiODk5ZmRkNzUyYWY3NmJkMDc3NWEwZWJjYWRlMmMwNWE3YTVjYTc3MTJhOGVjZmIwYzY3MTAwNwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhIHRhcmdldCByZXBvc2l0b3J5IGNvbmZpZyBkb2VzIG5vdCBzd2l0Y2ggb2ZmIHRoZSBpbmplY3RlZCBob29rCTg1ZmI2YTk5MjA1OWQ1Zjc3ODk4MDM5MDQ0YjZjMDhkZDc0NjM5NDM5ZDQ0YjgzZDEwNjMwM2YyNGZkNzM3NGYKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gYWxpYXMgaXMgcmVhZCBhcyBnaXQgZXhwYW5kcyBpdCwgYW5kIGEgY2FsbCBpbnNpZGUgYSBzdHJpbmcgaXMgZGF0YQkxMmJhMjYwZjhjNDI5OWE0OTA4NmNjODIwOWEyM2M5NjMyMDRkNWE4M2M3YTRmZGQ5Y2ZiZjZkMjIwNmIwNTAzCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGFyZ3YgbGlzdCBpbiBub2RlIG9yIHBlcmwsIGFuZCBhbiBhbGlhcyBzZXQgd2l0aCAtYywgYXJlIHJlYWQgYXMgdGhlIHB1Ymxpc2ggdGhleSBydW4JOWRiNmYzYjI5OTMyMmRmMzVlODc4YTIwYjE0MTViYjEyNjY0MDM4MGUyYWIxZDM4NDg3MjkwM2E2ODg1MWI1Mgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiBhcm1lZCBzZXNzaW9uIGxlYXZlcyBhIGNvbW1pdCBpbnRvIGEgbWt0ZW1wIGRpcmVjdG9yeSB0byBnaXQJNDVhYjYzMjE5ZGI3ZTFjMjZkNDA4OWU2YTU0ZjZhMDZmNzkwNmI1ZDUxZWNkZTg0ZjNjYmVmMWQ3MmE1NWQ0ZApib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiBhcm1lZCBzZXNzaW9uIGxlYXZlcyBhIHBsYWluIGludm9jYXRpb24gdG8gZ2l0CTE0ODQ2NDUwNzJmMDFkMjA1ZjRiYWVhZmZjZDU3OTdkMTI3MzRiNDVmZjgyMzlkNGU2MmQyYWRmMDMwNzE2YzAKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gYXJtZWQgc2Vzc2lvbiByZWZ1c2VzIGEgcXVvdGVkLCBlc2NhcGVkIG9yIHN1YnN0aXR1dGVkIGhvb2sgYnlwYXNzCWNkYzgwMGMxNDFjYzcxYmM1ZDc1YTU3MzIxZTM4ODY3ZWVhMDAyYjY5M2JmOWFhMWM0YTM4NjE4ODE2NmQ5MTIKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gYXJtZWQgc2Vzc2lvbiByZWZ1c2VzIGEgcmVkaXJlY3Rpb24gb3IgYW4gYXR0YWNoZWQgdmFsdWUgdGhhdCBoaWRlcyBhIGJ5cGFzcwk2ODYyODgxZGZmODc3NDViODU0NzA3MmJhYzM5NjRjOTJlOGI2YjEyM2M5ZTlhMzdlMTM3OGE5MmM3YmNlZmMzCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGFybWVkIHNlc3Npb24gcmVmdXNlcyBhIHdyYXBwZWQgZ2l0IGFuZCBhIHJlYXNzaWduZWQgaG9vayB2YXJpYWJsZQkxZTM2YmFkMDQyMDlhNmZiZWQ5MTE2MDMwNzhhMjFhMGIxNGQ3ZjlkMTllYTE5MzFjOGViMzI4OTg5OGM2OGNjCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGFybWVkIHNlc3Npb24gcmVmdXNlcyB3aGF0IHRoZSBzaGVsbCBleHBhbmRzIGJlZm9yZSBnaXQgc2VlcyBpdAkyODU3MjIyZjMyYzZmYjA2NDhlYTMwZjhhYzhkOGQ4NDdjM2QwZDY3YWRiMDRiOWVjNmEwNTdjYWJlNTQ4NThlCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGFybWVkIHNlc3Npb24gc3RpbGwgcmVmdXNlcyBhIGRvbGxhciBpdCBjYW5ub3QgcGxhY2UgYXMgYSBkaXJlY3RvcnkJOTQxMGYzYzhjNTdmNGZjYmIxYWNhNGIzZmNlMWZiN2Y0YjczMWRkM2VkMmU5Y2QzM2Q3ZDI4Mjg3YzY5NTUwMgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiBhcm1lZCBzZXNzaW9uIHN0aWxsIHJlZnVzZXMgZXZlcnkgZm9ybSB0aGF0IGNhbiBkaXNhYmxlIHRoZSBob29rCWIwNzNkZWJhMDY4YjgzM2FlNTQ1YWIwNDI0ZjY5YzcyNTc2MDJmMzAzZTMxZWVkOTk2MjBjY2JjNTAyYWMxNzMKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gb3ZlcnNpemVkIGNvbW1hbmQgaXMgc3RpbGwgcmVhZDogdGhlIHB1Ymxpc2ggYXQgaXRzIGVuZCBpcyByZWZ1c2VkLCBub3QgY3Jhc2hlZCBwYXN0CTVhOGZjY2IyYzMxNTZlNDQxYWYwZmMyNDFlYjFmNzYwYjEwZWQ5Y2NjOWJkYzhmYjVjNDMzYTk4ZmRiZTQ2N2QKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gdW5hcm1lZCBjaGFpbiB0aGUgdGV4dCBjYW5ub3QgcGxhY2UgaW4gYSBmcmVzaCByZXBvc2l0b3J5IGlzIHN0aWxsIHJlZnVzZWQJMTc1ZGJjYmExZTk3ZmRlMDBkOThjZDc1MzFlN2MyZWI3ZTliYmZmZTZiMjU3MzkwNDA1YjUwYTc2MDlmMTdjMApib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiB1bmFybWVkIGNvbW1pdCBpbnRvIGEgcmVwb3NpdG9yeSB0aGUgY29tbWFuZCBjcmVhdGVzIGlzIGFkdmlzZWQsIG5vdCByZWZ1c2VkCTdiMzQ2YWIxNjAxM2MxZmJiYzMwOWUyNzdkNDM2ODNlNGVlZTMxZmVjYjEyMzZkYjhhMjNjYmZmZjNkNmFhMTIKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJZGF0YSB0aGF0IG5hbWVzIGEgcHVibGlzaCBpcyBub3QgcmVmdXNlZCwgYW5kIHRoZSBrbm93biBmYWxzZSByZWZ1c2FscyBhcmUgZ29uZQljYTRjNmMwY2M2ODdiM2ZjZGUxYjJlMTY0MGJhNTdhNTVkZjYyMjRjYmY4NjAxZDQxMTU5MTZkMDdlNTkxZmEyCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWR5bmFtaWMgaW52b2NhdGlvbnMgYXJlIG5vdCByZWZ1c2VkLCBhbmQgdGhpcyB0ZXN0IHBpbnMgdGhhdCB0aGV5IGFyZSBhIG1lbnRpb24gYXQgbW9zdAliZTg2NDdiMzU3MzM0Nzk4MzZlOTk0ODg4OTVlYjc5YjA5YzIzYzdhZjRiNTk2YmRlMDk0MDkyZDllOTI3ZmQwCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWV2YWwgcnVucyBpdHMgc3RyaW5nLCBzbyBhIHB1Ymxpc2ggaW4gaXQgaXMgaW52b2tlZAliZmFmYjhmODYyYWYwMTkxZDY2YjgzYzU3MmI3ZWE3MzNhMDYwMmMzMDkxYzg3ZjhiYTUxNDA2NjQ4NTI4MmE5CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWV2ZXJ5IHB1Ymxpc2ggZm9ybSBpcyByZWNvZ25pc2VkLCB3aXRoIHRoZSBpbnZvY2F0aW9uIG5hbWVkCWYzZThlZGZiMDdjZDViNTEzOTliMzM2NWU0MTdiZDRmNDFlZWE1NTUyMzQ4MzYxNGQ5N2Q5NjU1ZmM3ZmQ4MWIKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJZ2l0IGlzIHJlY29nbmlzZWQgaW4gYW55IGNhc2UgYW5kIHRocm91Z2ggYSAuY21kIHNoaW0JZjMzY2ZlZDJkMWRiOGRlODBmOTVkNTkxMDI3ZDk3YTQ3ZTkwZDA4YTZiMGRlMzlhOTJiODZiN2YyOTczNmUyZApib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlub3RoaW5nIHRoYXQgb25seSBtZW50aW9ucyBhIHB1Ymxpc2ggaXMgcmVmdXNlZAk3YWY4ZTY5YThiZGQ2ZmU4OWViYTQ4ZGYwZjUxNDI3ODk0ZWZkZTViMDUyZDhjMWYxMjUyNGQ1MzZhZWEyMjk3CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCW9uZSBsZXhlciByZWFkcyBzaGVsbCB0ZXh0IGZvciBydWxlIFAJZTAxZTAwMjY2MTY5MDI5NWYzNTRhZjYyMzM3NWQ5NzZlMzc1OTc4ZjMxNDVhMTY1NTY3YmMzYTQzOTI2M2ZlYgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwl0ZXh0IHBpcGVkIGludG8gYSBzaGVsbCBpcyByZWFkIGFzIHRoZSBzaGVsbCByZWFkcyBpdAlhMTIzYjVmNzkzMmJmMGFjYzhjZDVjMGNjMTFjNWIxODRiODVmZDA5MzgzYjg0YTQ5ZTczODhkM2U4OTk1MGJhCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCXRoZSBhZHZpc29yeSBhcm0gc2VlcyB0aGUgd29yZHMgYXMgd29yZHMg4oCUIHdhcm5lZCBhYm91dCwgbmV2ZXIgcmVmdXNlZAlhMjJmMzMxYTllN2E5ZGFlZDcyMGVhMmMyZmNjZjI0NTZlZjk0NGE0MGFjZmVmY2ExZGUxMTEwNzI3MjY3Mzk2CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCXRoZSBhcm1lZCBjaGVjayBpcyBhIGdyYW1tYXIgb2YgcGxhaW4gZm9ybXMsIG5vdCBhIGxpc3Qgb2YgZGFuZ2Vyb3VzIG9uZXMJZjBhNDNjMjVhOGNhMjI3NDc3NGM3NzUyODk3YjhjY2NmMzUwNmNkZjVhMjg3NzVmZmU3MTVmZGU2ZTlhYzAzOQpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwl0aGUgYXJtZWQgZ3JhbW1hciByZWFkcyB3b3JkcywgcXVvdGVkIGNvZGUgYW5kIGhlcmVkb2NzIGFzIHRoZSBzaGVsbCBkb2VzCWUzNWY0NTZmY2MwNGM5M2YzZGZjYjUxNDc0MzhiMGViOTQ4ZGU4NmNjZjYyMDdlZmFlZmFkMTgxYzI2MDc2YmMKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJdGhlIGNoYW9zIHJvdW5kIG9mIDYyNjkzNGE6IHdoYXQgdGhlIHNoZWxsIHJhbiBpcyB3aGF0IHRoZSBjbGFzc2lmaWVyIHJlYWRzCTQ3OTQ1MjI1ZTQxNWY0NGI5MzU4NTJjNGVmMjdkYTdlZDkzZDZjZTkyYTJlYjQ5MDU4ZjUxMjUzOGJlMWM4NzIKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJdGhlIGNsYXNzaWZpZXIgc3RheXMgbGluZWFyIG9uIGEgbG9uZyBpbnRlcnByZXRlciBzY3JpcHQJNDEwNjAzNTJjNmNkMzhiZjBiMDE4MTFiZTgxODZjYTJhZmM5Yjk4NWI4MDFmZDVlMDQzYTdmZjhjNTRhNDY4NApib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwl0aGUgY2xhc3NpZmllciBzdGF5cyB1bmRlciBpdHMgY29zdCBib3VuZAliMGRlZjAwOTRlNmM4NjVjNzFhZGI3YjYwN2U1NzhhZjc5ODMzZWE4YTJjMGFjMTMzNmU1MTZjNmY1Mjc0MGY5CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCXRoZSBmcmVzaC1yZXBvc2l0b3J5IHJvd3MgY29tbWl0IHdoZXJlIHRoZSBjbGFzc2lmaWVyIHNheXMgdGhleSBkbwlmNzE4NzliNjE5YzMyODIxMjlkMzIzOTEzNzU3OGViYmY3NDI5MDM0NTRjMjEwODNhNDY0YzY4ZDRmYmVmNmQ4
  ```
  ```
- 2026-10-06 · 3c740be* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-command.test.mjs 2>&1) \ …` · acceptance-sha256:e06fac3493443b8e07ceaa6eb4ffb74e6ec17d6f8f9ba7df6336eb2a95dbf91c · ms:49992
- 2026-10-06 · 3c740be* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-command.test.mjs 2>&1) \ …` · acceptance-sha256:e06fac3493443b8e07ceaa6eb4ffb74e6ec17d6f8f9ba7df6336eb2a95dbf91c · ms:51259
- 2026-10-06 · 3c740be* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-command.test.mjs 2>&1) \ …` · acceptance-sha256:e06fac3493443b8e07ceaa6eb4ffb74e6ec17d6f8f9ba7df6336eb2a95dbf91c · ms:45540
