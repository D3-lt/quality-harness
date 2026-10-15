# Task ADR-102-T2: a syntax finding at the edit reaches the agent

**Depends-on:** T1, T3
**Covers:** none — no spec
**Estimated scope:** S (one condition in `run-shell-hook.mjs`, one test, one manifest entry)
**Owner:** unassigned
**Produces:** `post-edit-check.sh`'s finding as PostToolUse `additionalContext`
**Consumes:** stdout is empty for a clean file (T1); a finding is a syntax error from the file's own parser (T3)
**Data dependency:** hermetic for the test; S3 needs one live Claude Code session
**Proof map:** v1

## Goal

After a native edit of a broken file, the diagnostic `post-edit-check.sh` prints is handed to the agent as PostToolUse
`additionalContext`; a clean file hands it nothing.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/run-shell-hook.mjs` | edit | the `additionalContext` branch (`:388-396`) takes `post-edit-check.sh` as well as the facts gate |
| `tests/post-edit-check.test.mjs` | edit | add the test below, through the hook boundary (`node run-shell-hook.mjs post-edit-check.sh` with a PostToolUse payload) |
| `tests/mutations/plugin/scripts/run-shell-hook.mjs.json` | edit | the catalogue entry below |
| `scripts/components.json` | edit | the hook's consumer becomes `agent-context`, with its reason |

## Ordered Steps

1. [S1] Add the test below and record the red run (TDD red: the broken file's diagnostic arrives as plain stdout).
2. [S2] Widen the branch to the two script names; update the manifest entry; record one killed mutant that narrows it back. [proof: mutation]
3. [S3] In one live session, edit a scratch `.mjs` file into a syntax error and read the agent's next turn for the diagnostic. [proof: human: whether the host puts a PostToolUse hook's `additionalContext` in front of the model for this hook is not observable from a test]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - a syntax finding at the edit reaches the agent, and a clean edit hands it nothing")" = 1
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a syntax finding at the edit reaches the agent, and a clean edit hands it nothing` | `tests/post-edit-check.test.mjs` | through `run-shell-hook.mjs post-edit-check.sh` with a PostToolUse payload: a broken `.mjs` yields one JSON object whose `hookSpecificOutput.additionalContext` carries the diagnostic and nothing on plain stdout; a clean `.mjs`, a clean `.php` and a `.py` with lint debt in a ruff project each yield empty stdout, which is the T1 and T3 contract at this boundary (the cold review's finding 3) | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | `plugin/hooks/hooks.json`'s second PostToolUse entry, unchanged |
| 3 — the caller can discover it | the agent reads it in its context; S3 |
| 4 — it is used | ADR-102's Follow-up |

## Mutation Log
- 2026-10-14 · 1ff433af* · mutant killed · exit 1 · `plugin/scripts/run-shell-hook.mjs` · the post-edit check's syntax finding goes back to the transcript only, where the agent never reads it · acceptance-sha256:7ba57134069426103ffd7a1e7f569bc0127cc6460c2140514206c1deaff5cd5e

## Invariants

- The facts gate's wrapping is unchanged (its tests in `tests/gates.test.mjs` stay green).
- The hook exits 0; nothing is refused.

## Risks

- A finding the host does not show the model: S3 reads the agent's next turn for it.

## Stop Condition

Stop and ask if S3 shows the agent does not receive the diagnostic.

## Out of Scope

- What the checkers print (T1)

## Verification Log
- 2026-10-14 · 1ff433af* · exit 1 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:7ba57134069426103ffd7a1e7f569bc0127cc6460c2140514206c1deaff5cd5e · ms:4882 · test-lock-sha256:573d98201c5e584a59c0c9daad78baea348554f0376c520a144adda2a6ec8894 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgLmpzIGZpbGUgZHJhd3Mgbm90aGluZywgd2hldGhlciBpdCBpcyBhIFdvcmtmbG93IHNjcmlwdCwgYSBtb2R1bGUgb3IgYnJva2VuCTBmOWJkNjRiNjZiMzU2N2RhMWI0YjE2OTQ3Yjc2YTRkYTdlY2EzNDUwMzg0YTUxN2E4ZGQ1MGUzN2VmMzdkZDMKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjaGVja2VyIHRoYXQgY291bGQgbm90IHJ1biBpcyBVTlJVTiwgbmV2ZXIgYSBmaW5kaW5nIGFib3V0IHRoZSBmaWxlCWJiNzBhYjdhYmU1YzFiNmM0MTMyMDQ2ZmE0ZTI2Nzg4MGZlMzM4NjMzMDAwNWMxMzA3ZmNhNDgxNjdmYTg4ZWYKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJYSBjbGVhbiBmaWxlIHNheXMgbm90aGluZywgYW5kIGEgYnJva2VuIG9uZSBpcyBzdGlsbCBuYW1lZAlkMzZiZDQzYThlNDUzY2M1MTUyMmZmNTUwNmZjYjllOGMyN2FjNTdjNmZiMWMyN2M4ZGU2ZDkzNjdjN2VjNWU3CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgZHlpbmcgY2hlY2tlciBjYW5ub3QgcGFzcyBpdHNlbGYgb2ZmIGFzIGNvbXBsZXRlIGJ5IHByaW50aW5nIHRoZSBtYXJrZXIJODhlMWNlM2NiNGQxYzQwYWU5ZDJkNWUwNTFlYjgwOWVlMWFjYjVjNGVjNTE5OWM3YjRmMjY3ZjViMTFkYjVmMQpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGZpbGUgdHlwZSB0aGUgaG9vayBkb2VzIG5vdCBoYW5kbGUgaXMgc2lsZW50LCBub3QgYW4gZXJyb3IJMWRiMDkyOTJlYjU5NWI5MzgxYmIxMWViNjRjODU1ODdhNWE3OGQyNzJkMDliZmU5ZTcwZjU5ZTgwMWQzYTRlZgpib2R5CXRlc3RzL3Bvc3QtZWRpdC1jaGVjay50ZXN0Lm1qcwlhIGZpbmRpbmcgY29tZXMgb25seSBmcm9tIHRoZSBmaWxlJ3Mgb3duIHBhcnNlcgk5Y2M0NTRlNmE0YWNlYjUxNTNmY2ZjZjYzNzUyNjFkZjNjN2ViMzJiZjA2OTMyZmI3MTVhZjk0NjM1NTkxZjE0CmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCWEgc3ludGF4IGZpbmRpbmcgYXQgdGhlIGVkaXQgcmVhY2hlcyB0aGUgYWdlbnQsIGFuZCBhIGNsZWFuIGVkaXQgaGFuZHMgaXQgbm90aGluZwk4MTUzY2U4M2MyM2E4NTk2ZTc4NGIwMWI4NWZiNGY4MTYzODJjMWRkY2JmMjcxMmQ0ZTk1OTFkZDU1Y2Q4MGFhCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIG9ubHkgYWN0cyBvbiB0aGUgdG9vbHMgaXQgaXMgZm9yLCBhbmQgb24gZmlsZXMgdGhhdCBleGlzdAkwM2YyNmRhZDRmNDg1ZTA2YzQwZDRiNDQyNmE3MDEwM2QwYjgwNmY5NmUwZTkxYjVmOTUxODY5ZmI5MzAwZWViCmJvZHkJdGVzdHMvcG9zdC1lZGl0LWNoZWNrLnRlc3QubWpzCXRoZSBob29rIHBpY2tzIHRoZSBwYXJzZSBnb2FsIGZyb20gdGhlIGV4dGVuc2lvbiwgYW5kIGRpYWdub3N0aWNzIGNhbm5vdCBmb3JnZSB0aGUgbWFya2VyCTQwYmNmNmZmNDkyYzQyZmU3ZWY4ODA2ZmIzYWI4NjNkNTM1OTFlZTkzNjc5NTFiOWY5ZGE2MjVkNTViNzdmZTUKYm9keQl0ZXN0cy9wb3N0LWVkaXQtY2hlY2sudGVzdC5tanMJdGhlIGhvb2sgcmVwb3J0cyBhIHN5bnRheCBlcnJvciB3aXRob3V0IGZhaWxpbmcgdGhlIGVkaXQJYTFhNTlhYWJkMWI3ZmZjMWNmMTBhNzZkMWMxMWJhOWVkZDdmOWYxODA0NjA5MGEzMTBiYWVmOTZjYzczOGU3ZA
  ```
  ```
- 2026-10-14 · 1ff433af* · exit 0 · `out=$(node --test --test-reporter=tap tests/post-edit-check.test.mjs 2>&1) \ …` · acceptance-sha256:7ba57134069426103ffd7a1e7f569bc0127cc6460c2140514206c1deaff5cd5e · ms:6839
- 2026-10-15 · human-observed · S3: observed live on 2026-10-15 in a Claude Code 2.1.300 session with the plugin loaded from this checkout: a Write of a scratch .mjs with an unclosed parameter list put the PostToolUse hook's finding in front of the agent as additionalContext, naming the file, line 3 and 'does not parse as an ES module'; the owner signed off the same day
