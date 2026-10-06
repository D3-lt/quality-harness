# Task ADR-086-T1: an armed session leaves a mktemp-directory commit to git

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one predicate in one file, its tests and campaign entries)
**Owner:** unassigned
**Produces:** `freshDirectoryVariables` — the fresh-directory variable reading of ADR-086's Decision
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `an armed session admits a fresh-directory variable as a directory operand`, `a dollar outside a directory operand keeps the refusal`

## Goal

In an armed Bash session, rule P gives ADR-066's advice, not a refusal, to a commit whose only `$` words
are a fresh-directory variable (ADR-086 Decision) used as the operand of `cd`, `git -C` or `git init`,
so git's own hook judges the repository the commit lands in. Every other `$` still keeps the refusal.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `freshDirectoryVariables(commands)` (new, beside `leavesHookInPlace`); `leavesHookInPlace`'s `$` rule (`:4990`); `segmentVerdict`'s assignment rule (`:4913`), which returns -1 for any `NAME=` segment and so would refuse the assignment itself. `publishUnchecked`'s armed branch (`:5125`) is what selects it and is unchanged |
| `tests/publish-command.test.mjs` | edit | four new tests beside the locked ones, through `armedSession` (`:325`) |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write the four tests in this task's Tests table and record the red run (TDD red). Every path in
   a row is assembled at runtime from the test's own temporary directory (CLAUDE.md §6). Red today: an
   armed session refuses each data row. Run `python3 scripts/test-locks.py tests/publish-command.test.mjs`
   first; on 2026-10-06 it reported 50 locks on that file, so the new tests go beside the locked ones and
   no locked test changes.
2. [S2] Add `freshDirectoryVariables(commands)`. It takes `shellWords` commands and returns the names
   that ADR-086 defines as fresh-directory variables: a bare assignment command whose whole value is one
   `$(mktemp -d <literal words>)`, with no other assignment, `export`, `local` or `read` of that name in
   the text, and a name outside `:4999`'s environment names.
3. [S3] In `leavesHookInPlace`, admit a fresh-directory variable's `$V` or `"$V"` where it is the sole
   operand of `cd`, the value of `git -C`, or the operand of `git init`, and that variable's own
   assignment substitution. Admit only when every publish invocation in the text is a commit. Every
   other `$` or backtick returns false as today, and the remaining rules (`:4993-4999`) still run over
   the whole text.
4. [S4] In `segmentVerdict`, a fresh-directory assignment segment returns 0, not -1. Every other `NAME=`
   segment still returns -1.
5. [S5] Record one killed mutant per Rests-on name: one that admits a `$` in any position (the twin goes
   red), and one that drops the admission (the data test goes red). Add both to `tests/mutations.json`.
   The fence's third test is the existing, locked ADR-066 test and rests on no new mechanism. The
   config measurement is not in the fence: it is git's behaviour, which no mutant here can reach, and its
   skip on a git without config hooks would fail the fence's `grep -x`. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/publish-command.test.mjs 2>&1) \
  && for t in 'an armed session leaves a commit into a mktemp directory to git' 'an armed session still refuses a dollar it cannot place as a directory' 'an armed session leaves a plain invocation to git'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an armed session leaves a commit into a mktemp directory to git` | `tests/publish-command.test.mjs` | armed and unchecked, none of these is `deny`: `R=$(mktemp -d <tmp>/x.XXXX); cd $R && git init -q && git add . && git commit -qm f`, the same joined by `&&` with `cd "$R"`, and `R=$(mktemp -d <tmp>/x.XXXX) && git init -q "$R" && git -C "$R" add -A && git -C "$R" commit -qm f`. DIRTY twin: unarmed, the first and third are `deny` | none | S1, S2, S3, S4 |
| `an armed session still refuses a dollar it cannot place as a directory` | `tests/publish-command.test.mjs` | armed and unchecked, each is `deny`: `cd "$R" && git init -q && git commit -qm f` (no assignment in the text); `git -C $R commit -qm f`; `R=$(git rev-parse --show-toplevel) && cd "$R" && git commit -qm f`; `R=$(mktemp -d "$T") && cd "$R" && git init -q && git commit -qm f`; `R=$(mktemp -d) && R=$(pwd) && cd "$R" && git commit -qm f`; `export R=$(mktemp -d) && cd "$R" && git commit -qm f`; `R=$(mktemp -d) && git -c core.hooksPath="$R" commit -qm f`; `R=$(mktemp -d) && cd "$R/.." && git commit -qm f`; `R=$(mktemp -d) && cd "${R}" && git commit -qm f`; `R=$(mktemp -d) && git commit -qm "$R"`; `GIT_DIR=$(mktemp -d) && git commit -qm f`; `R=$(mktemp -d; git config hook.qh-publish-commit.enabled false) && cd "$R" && git commit -qm f`; `R=$(mktemp -d) && cd "$R" && git init -q && git remote add o <session repo> && git push o HEAD:x`. CLEAN twin: after `qh-check`, none is `deny` | none | S1, S3, S4 |
| `a target repository config does not switch off the injected hook` | `tests/publish-command.test.mjs` | re-measures ADR-086 Context on every suite run, outside the fence: a probe hook injected through `GIT_CONFIG_COUNT` still runs under `git hook run prepare-commit-msg` after the target repository sets a local `command`, an empty `event`, `enabled=false` and `core.hooksPath`; skipped, with that reason, where git does not run config hooks (the probe `tests/publish-hook.test.mjs:44` uses) | none | S1 |
| `an armed session leaves a plain invocation to git` | `tests/publish-command.test.mjs` | the existing ADR-066 test, unchanged and locked: nothing T1 does narrows what was already left to git | none | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the four tests |
| 2 — something selects it | `publishUnchecked`'s armed branch (`lifecycle.mjs:5125`) calls `leavesHookInPlace`; the data test drives the real PreToolUse hook, so dropping the admission turns it red |
| 3 — the caller can discover it | n/a: no declared interface — the effect is the PreToolUse decision |
| 4 — it is used | a live armed session staging a scratch repository; nothing measures this yet |

## Mutation Log
- 2026-10-06 · 3c740be* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · drops the fresh-directory admission, so an armed mktemp-directory commit is refused again · acceptance-sha256:c38b9c9a5841100fd633f86eefb9d45d5a44390ff33e0eefe888b1c0853b791e · covers:an armed session admits a fresh-directory variable as a directory operand
- 2026-10-06 · 3c740be* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · admits a fresh variable wherever it stands, so a dollar outside a directory operand is no longer refused · acceptance-sha256:c38b9c9a5841100fd633f86eefb9d45d5a44390ff33e0eefe888b1c0853b791e · covers:a dollar outside a directory operand keeps the refusal

## Invariants

- No `$` outside a fresh-directory variable used as a directory operand is ever admitted.
- A text whose publish invocations include a push gains nothing from this task.
- PowerShell, an unarmed session and the reviewer guard are unchanged.

## Risks

- The admission turns a refusal into advice that rests on git's hook. Where git's hook cannot start, it prints that it did not judge the event, and a failed `mktemp` in the `;` spelling commits into this checkout unrefused. ADR-086 Consequences names this.

## Stop Condition

Stop and ask if any twin row is not `deny` after S4, if `segmentVerdict`'s change admits any assignment
other than a fresh-directory one, or if a test the steps edit has become locked.

## Out of Scope

- The unarmed arm — T2. A literal `cd` or `-C` path outside this checkout — ADR-086 defers it.

## Verification Log
- 2026-10-06 · 3c740be* · exit 1 · `out=$(node --test --test-reporter=tap tests/publish-command.test.mjs 2>&1) \ …` · acceptance-sha256:c38b9c9a5841100fd633f86eefb9d45d5a44390ff33e0eefe888b1c0853b791e · ms:39196 · test-lock-sha256:26d72ce79a9713c1fb923e53efce6cef67505fc837435d288942d26d905f9b87 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCVBvd2VyU2hlbGwsIGFuIG9mZmVyZWQtb25seSBzZXNzaW9uIGFuZCB0aGUgcmV2aWV3ZXIgZ3VhcmQgYXJlIHVuY2hhbmdlZAk4MWY0NmEyYzU1NDBkMTZjNGFjMzQwZGFiMDMwOTdlOGRiY2IyMDM3MTgxNmJiMDdiNzJmNmU3M2VlMjAzN2U2CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCVdpbmRvd3Mgc3BlbGxpbmdzIG9mIGEgcHVibGlzaCBhcmUgcmVjb2duaXNlZCwgYW5kIGxvb2stYWxpa2VzIGFyZSBub3QJOWMzNDFiN2FjZTZlYzdlMzA0YTY4ZWFjM2U5MGI3NzQxMDc5ZDYzYWEzODRlOGEyZDZjYzc0NDRkZjRjMGIyYQpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhIGJyYWNlLWJ1aWx0IHB1Ymxpc2ggaXMgcmVmdXNlZAkwYThlNGQ5ZDAzZjg4MGM3NmI3OGNhNzc1OTRlOWNhNDQwNmY0NjBiMDdkYzY3ZjAxYmM2ZDk4OTI5MGNlYWU3CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWEgcHVibGlzaCBpcyBmb3VuZCBieSBhcmd2LCBhcyB0aGUgc2hlbGwgcnVucyBpdAlkN2E2YmFjNGMzZmFjNDJjNTg0ZDIwMWUyZjliNGQzNmNmZWY1ZTllZDg0M2IyYjU3YzRjNjI0ZGI5ZDNmYjkzCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWEgc3RyaW5nIGhhbmRlZCB0byBhIHNoZWxsIGJ5IG9zLnN5c3RlbSBvciBvcy5wb3BlbiBpcyByZWFkIGFzIHRoYXQgc2hlbGwgcmVhZHMgaXQJZTcxZGNmMTRiODk5ZmRkNzUyYWY3NmJkMDc3NWEwZWJjYWRlMmMwNWE3YTVjYTc3MTJhOGVjZmIwYzY3MTAwNwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhIHRhcmdldCByZXBvc2l0b3J5IGNvbmZpZyBkb2VzIG5vdCBzd2l0Y2ggb2ZmIHRoZSBpbmplY3RlZCBob29rCTg1ZmI2YTk5MjA1OWQ1Zjc3ODk4MDM5MDQ0YjZjMDhkZDc0NjM5NDM5ZDQ0YjgzZDEwNjMwM2YyNGZkNzM3NGYKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gYWxpYXMgaXMgcmVhZCBhcyBnaXQgZXhwYW5kcyBpdCwgYW5kIGEgY2FsbCBpbnNpZGUgYSBzdHJpbmcgaXMgZGF0YQkxMmJhMjYwZjhjNDI5OWE0OTA4NmNjODIwOWEyM2M5NjMyMDRkNWE4M2M3YTRmZGQ5Y2ZiZjZkMjIwNmIwNTAzCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGFyZ3YgbGlzdCBpbiBub2RlIG9yIHBlcmwsIGFuZCBhbiBhbGlhcyBzZXQgd2l0aCAtYywgYXJlIHJlYWQgYXMgdGhlIHB1Ymxpc2ggdGhleSBydW4JOWRiNmYzYjI5OTMyMmRmMzVlODc4YTIwYjE0MTViYjEyNjY0MDM4MGUyYWIxZDM4NDg3MjkwM2E2ODg1MWI1Mgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiBhcm1lZCBzZXNzaW9uIGxlYXZlcyBhIGNvbW1pdCBpbnRvIGEgbWt0ZW1wIGRpcmVjdG9yeSB0byBnaXQJNDVhYjYzMjE5ZGI3ZTFjMjZkNDA4OWU2YTU0ZjZhMDZmNzkwNmI1ZDUxZWNkZTg0ZjNjYmVmMWQ3MmE1NWQ0ZApib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiBhcm1lZCBzZXNzaW9uIGxlYXZlcyBhIHBsYWluIGludm9jYXRpb24gdG8gZ2l0CTE0ODQ2NDUwNzJmMDFkMjA1ZjRiYWVhZmZjZDU3OTdkMTI3MzRiNDVmZjgyMzlkNGU2MmQyYWRmMDMwNzE2YzAKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gYXJtZWQgc2Vzc2lvbiByZWZ1c2VzIGEgcXVvdGVkLCBlc2NhcGVkIG9yIHN1YnN0aXR1dGVkIGhvb2sgYnlwYXNzCWNkYzgwMGMxNDFjYzcxYmM1ZDc1YTU3MzIxZTM4ODY3ZWVhMDAyYjY5M2JmOWFhMWM0YTM4NjE4ODE2NmQ5MTIKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gYXJtZWQgc2Vzc2lvbiByZWZ1c2VzIGEgcmVkaXJlY3Rpb24gb3IgYW4gYXR0YWNoZWQgdmFsdWUgdGhhdCBoaWRlcyBhIGJ5cGFzcwk2ODYyODgxZGZmODc3NDViODU0NzA3MmJhYzM5NjRjOTJlOGI2YjEyM2M5ZTlhMzdlMTM3OGE5MmM3YmNlZmMzCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGFybWVkIHNlc3Npb24gcmVmdXNlcyBhIHdyYXBwZWQgZ2l0IGFuZCBhIHJlYXNzaWduZWQgaG9vayB2YXJpYWJsZQkxZTM2YmFkMDQyMDlhNmZiZWQ5MTE2MDMwNzhhMjFhMGIxNGQ3ZjlkMTllYTE5MzFjOGViMzI4OTg5OGM2OGNjCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGFybWVkIHNlc3Npb24gcmVmdXNlcyB3aGF0IHRoZSBzaGVsbCBleHBhbmRzIGJlZm9yZSBnaXQgc2VlcyBpdAkyODU3MjIyZjMyYzZmYjA2NDhlYTMwZjhhYzhkOGQ4NDdjM2QwZDY3YWRiMDRiOWVjNmEwNTdjYWJlNTQ4NThlCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGFybWVkIHNlc3Npb24gc3RpbGwgcmVmdXNlcyBhIGRvbGxhciBpdCBjYW5ub3QgcGxhY2UgYXMgYSBkaXJlY3RvcnkJOTQxMGYzYzhjNTdmNGZjYmIxYWNhNGIzZmNlMWZiN2Y0YjczMWRkM2VkMmU5Y2QzM2Q3ZDI4Mjg3YzY5NTUwMgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlhbiBhcm1lZCBzZXNzaW9uIHN0aWxsIHJlZnVzZXMgZXZlcnkgZm9ybSB0aGF0IGNhbiBkaXNhYmxlIHRoZSBob29rCWIwNzNkZWJhMDY4YjgzM2FlNTQ1YWIwNDI0ZjY5YzcyNTc2MDJmMzAzZTMxZWVkOTk2MjBjY2JjNTAyYWMxNzMKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gb3ZlcnNpemVkIGNvbW1hbmQgaXMgc3RpbGwgcmVhZDogdGhlIHB1Ymxpc2ggYXQgaXRzIGVuZCBpcyByZWZ1c2VkLCBub3QgY3Jhc2hlZCBwYXN0CTVhOGZjY2IyYzMxNTZlNDQxYWYwZmMyNDFlYjFmNzYwYjEwZWQ5Y2NjOWJkYzhmYjVjNDMzYTk4ZmRiZTQ2N2QKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJZGF0YSB0aGF0IG5hbWVzIGEgcHVibGlzaCBpcyBub3QgcmVmdXNlZCwgYW5kIHRoZSBrbm93biBmYWxzZSByZWZ1c2FscyBhcmUgZ29uZQljYTRjNmMwY2M2ODdiM2ZjZGUxYjJlMTY0MGJhNTdhNTVkZjYyMjRjYmY4NjAxZDQxMTU5MTZkMDdlNTkxZmEyCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWR5bmFtaWMgaW52b2NhdGlvbnMgYXJlIG5vdCByZWZ1c2VkLCBhbmQgdGhpcyB0ZXN0IHBpbnMgdGhhdCB0aGV5IGFyZSBhIG1lbnRpb24gYXQgbW9zdAliZTg2NDdiMzU3MzM0Nzk4MzZlOTk0ODg4OTVlYjc5YjA5YzIzYzdhZjRiNTk2YmRlMDk0MDkyZDllOTI3ZmQwCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWV2YWwgcnVucyBpdHMgc3RyaW5nLCBzbyBhIHB1Ymxpc2ggaW4gaXQgaXMgaW52b2tlZAliZmFmYjhmODYyYWYwMTkxZDY2YjgzYzU3MmI3ZWE3MzNhMDYwMmMzMDkxYzg3ZjhiYTUxNDA2NjQ4NTI4MmE5CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWV2ZXJ5IHB1Ymxpc2ggZm9ybSBpcyByZWNvZ25pc2VkLCB3aXRoIHRoZSBpbnZvY2F0aW9uIG5hbWVkCWYzZThlZGZiMDdjZDViNTEzOTliMzM2NWU0MTdiZDRmNDFlZWE1NTUyMzQ4MzYxNGQ5N2Q5NjU1ZmM3ZmQ4MWIKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJZ2l0IGlzIHJlY29nbmlzZWQgaW4gYW55IGNhc2UgYW5kIHRocm91Z2ggYSAuY21kIHNoaW0JZjMzY2ZlZDJkMWRiOGRlODBmOTVkNTkxMDI3ZDk3YTQ3ZTkwZDA4YTZiMGRlMzlhOTJiODZiN2YyOTczNmUyZApib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlub3RoaW5nIHRoYXQgb25seSBtZW50aW9ucyBhIHB1Ymxpc2ggaXMgcmVmdXNlZAk3YWY4ZTY5YThiZGQ2ZmU4OWViYTQ4ZGYwZjUxNDI3ODk0ZWZkZTViMDUyZDhjMWYxMjUyNGQ1MzZhZWEyMjk3CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCW9uZSBsZXhlciByZWFkcyBzaGVsbCB0ZXh0IGZvciBydWxlIFAJZTAxZTAwMjY2MTY5MDI5NWYzNTRhZjYyMzM3NWQ5NzZlMzc1OTc4ZjMxNDVhMTY1NTY3YmMzYTQzOTI2M2ZlYgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwl0ZXh0IHBpcGVkIGludG8gYSBzaGVsbCBpcyByZWFkIGFzIHRoZSBzaGVsbCByZWFkcyBpdAlhMTIzYjVmNzkzMmJmMGFjYzhjZDVjMGNjMTFjNWIxODRiODVmZDA5MzgzYjg0YTQ5ZTczODhkM2U4OTk1MGJhCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCXRoZSBhZHZpc29yeSBhcm0gc2VlcyB0aGUgd29yZHMgYXMgd29yZHMg4oCUIHdhcm5lZCBhYm91dCwgbmV2ZXIgcmVmdXNlZAlhMjJmMzMxYTllN2E5ZGFlZDcyMGVhMmMyZmNjZjI0NTZlZjk0NGE0MGFjZmVmY2ExZGUxMTEwNzI3MjY3Mzk2CmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCXRoZSBhcm1lZCBjaGVjayBpcyBhIGdyYW1tYXIgb2YgcGxhaW4gZm9ybXMsIG5vdCBhIGxpc3Qgb2YgZGFuZ2Vyb3VzIG9uZXMJZjBhNDNjMjVhOGNhMjI3NDc3NGM3NzUyODk3YjhjY2NmMzUwNmNkZjVhMjg3NzVmZmU3MTVmZGU2ZTlhYzAzOQpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwl0aGUgYXJtZWQgZ3JhbW1hciByZWFkcyB3b3JkcywgcXVvdGVkIGNvZGUgYW5kIGhlcmVkb2NzIGFzIHRoZSBzaGVsbCBkb2VzCWUzNWY0NTZmY2MwNGM5M2YzZGZjYjUxNDc0MzhiMGViOTQ4ZGU4NmNjZjYyMDdlZmFlZmFkMTgxYzI2MDc2YmMKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJdGhlIGNoYW9zIHJvdW5kIG9mIDYyNjkzNGE6IHdoYXQgdGhlIHNoZWxsIHJhbiBpcyB3aGF0IHRoZSBjbGFzc2lmaWVyIHJlYWRzCTQ3OTQ1MjI1ZTQxNWY0NGI5MzU4NTJjNGVmMjdkYTdlZDkzZDZjZTkyYTJlYjQ5MDU4ZjUxMjUzOGJlMWM4NzIKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJdGhlIGNsYXNzaWZpZXIgc3RheXMgbGluZWFyIG9uIGEgbG9uZyBpbnRlcnByZXRlciBzY3JpcHQJNDEwNjAzNTJjNmNkMzhiZjBiMDE4MTFiZTgxODZjYTJhZmM5Yjk4NWI4MDFmZDVlMDQzYTdmZjhjNTRhNDY4NApib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwl0aGUgY2xhc3NpZmllciBzdGF5cyB1bmRlciBpdHMgY29zdCBib3VuZAliMGRlZjAwOTRlNmM4NjVjNzFhZGI3YjYwN2U1NzhhZjc5ODMzZWE4YTJjMGFjMTMzNmU1MTZjNmY1Mjc0MGY5
  ```
  ```
- 2026-10-06 · 3c740be* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-command.test.mjs 2>&1) \ …` · acceptance-sha256:c38b9c9a5841100fd633f86eefb9d45d5a44390ff33e0eefe888b1c0853b791e · ms:37986
- 2026-10-06 · 3c740be* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-command.test.mjs 2>&1) \ …` · acceptance-sha256:c38b9c9a5841100fd633f86eefb9d45d5a44390ff33e0eefe888b1c0853b791e · ms:53338
