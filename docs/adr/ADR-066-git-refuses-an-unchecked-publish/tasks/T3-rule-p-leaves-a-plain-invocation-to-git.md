# Task ADR-066-T3: Rule P leaves only a plain invocation to an armed session's git

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** S (one module, its tests and two documents)
**Owner:** unassigned
**Produces:** rule P's armed behaviour; `leavesHookInPlace()`
**Consumes:** `publishVerdict()`, `publish-hook.mjs`, `publish.hook-ran` (T1); the exports and `publish.offered` (T2)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `armed means the hook ran`, `only a plain invocation is advised`, `PowerShell and unarmed are unchanged`, `the reviewer guard is unchanged`

## Goal

Rule P advises instead of denying only when all three hold:
- the session log holds `publish.hook-ran`;
- the tool is Bash;
- `leavesHookInPlace(command)` proves the matched invocation keeps the hook: no `-c hook.*`, no `-c core.hooksPath`, no `GIT_CONFIG*`, `env` or `unset` in the command, no `--no-v…` on a push, and no `n` in a bundled short-option cluster of a commit.

Everything else keeps ADR-061's deny, row for row. CLAUDE.md §3 and the plugin README name the git event. (The operating skill was named here at first; it does not describe the refusal, and the README is where adopters read it.)

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `leavesHookInPlace`; rule P reads `publish.hook-ran` and `tool_name` |
| `tests/publish-command.test.mjs` | edit | armed tables over the existing rows and the escape rows |
| `tests/mutations.json` | edit | mutants |
| `CLAUDE.md` | edit | §3's sanctioned refusal includes the git event (ADR-066 Invalidates) |
| `plugin/README.md` | edit | the refusal's description names where it is decided when armed |

## Ordered Steps

1. [S1] Write the tests below and see each fail on an assertion (TDD red).
2. [S2] Add `leavesHookInPlace`. In rule P, compute `deny` as today, then clear it only when the session is armed, the tool is Bash, and the predicate holds. The advice says git decides at the event.
3. [S3] Amend CLAUDE.md §3 and the plugin README. [proof: human: §3 and the README's refusal paragraph read against the armed and unarmed behaviour]
4. [S4] Run the fence green, and record mutants with `adr-verify --mutant`:
   - arm on `publish.offered`;
   - drop the Bash check;
   - let `-c hook.` through the predicate;
   - let a bundled `n` through.
   [proof: mutation]
5. [S5] In one live Claude Code session, confirm by hand:
   - an unchecked `git commit` is refused by git, and `publish.hook-ran` is logged;
   - a `!`-mode `git commit` meets the same verdict.

   Record both in the sign-off. [proof: human: a live armed session's refusal from git, and what a `!`-mode commit met]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/publish-command.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (an armed session leaves a plain invocation to git|an armed session still refuses every form that can disable the hook|PowerShell, an offered-only session and the reviewer guard are unchanged)' | grep -qx 3
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an armed session leaves a plain invocation to git` | `tests/publish-command.test.mjs` | with `publish.hook-ran` and the Bash tool, the plain invocations and the five KNOWN_FALSE_REFUSALS rows that start their segment with `git` (quoted data, a heredoc) yield advice; the same commands in an unarmed session are denied (the dirty twin). The two quoted `bash -c` / `sh -c` rows keep the refusal | none | S1, S2 |
| `an armed session still refuses every form that can disable the hook` | `tests/publish-command.test.mjs` | these are denied on an unchecked tree when armed, and allowed on a checked one (the clean twin): `-c hook.qh-publish-commit.enabled=false`, `.command=true`, `-c core.hooksPath=…`, `env GIT_CONFIG_COUNT=0`, `GIT_CONFIG_COUNT=0 git …`, `unset CLAUDE_CODE_SESSION_ID;`, `--no-verif` on a push, `commit -anm m`, `sudo` | none | S1, S2 |
| `PowerShell, an offered-only session and the reviewer guard are unchanged` | `tests/publish-command.test.mjs` | the existing verdicts are unchanged under the PowerShell tool when armed, with `publish.offered` but no `publish.hook-ran`, and for a read-only role | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `leavesHookInPlace`, the armed branch of rule P |
| 2 — something selects it | `publish.hook-ran` from T1; the "arm on `publish.offered`" mutant |
| 3 — the caller can discover it | CLAUDE.md §3, the plugin README, the advice text |
| 4 — it is used | S5's live confirmation, and the `publish.hook-ran` counts |

## Mutation Log
- 2026-09-26 · 7b6cbdd* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · an offer alone arms the session · acceptance-sha256:c3562c5c9ea72fdca0a35f2b70bac191169d68e9033c86c2cfdb105559b48f62 · covers:armed means the hook ran
- 2026-09-26 · 7b6cbdd* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a PowerShell call is advised although it never sources the env file · acceptance-sha256:c3562c5c9ea72fdca0a35f2b70bac191169d68e9033c86c2cfdb105559b48f62 · covers:PowerShell and unarmed are unchanged
- 2026-09-26 · 7b6cbdd* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a -c that switches the hook off is advised · acceptance-sha256:c3562c5c9ea72fdca0a35f2b70bac191169d68e9033c86c2cfdb105559b48f62 · covers:only a plain invocation is advised
- 2026-09-26 · 7b6cbdd* · mutant survived · exit 0 · `plugin/scripts/lifecycle.mjs` · a read-only role reaches rule P and is advised when armed · acceptance-sha256:c3562c5c9ea72fdca0a35f2b70bac191169d68e9033c86c2cfdb105559b48f62 · covers:the reviewer guard is unchanged
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-09-26 · 7b6cbdd* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the reviewer guard stops denying a publish, so an armed read-only role is only advised · acceptance-sha256:c3562c5c9ea72fdca0a35f2b70bac191169d68e9033c86c2cfdb105559b48f62 · covers:the reviewer guard is unchanged

## Invariants

- Unarmed, PowerShell and reviewer-guard behaviour is ADR-060's and ADR-061's, row for row.
- An armed session is advised only on a form that cannot have disabled the hook.

## Risks

- `leavesHookInPlace` is itself a classifier over text. Its errors fail CLOSED: an unrecognised form keeps the deny (CLAUDE.md §16).
- A first mutant of the reviewer guard (`guardAlone = false`) SURVIVED: the guard still denies on its own path, so that mutant broke nothing. The mechanism is bound instead to a mutant of the guard's denial, which was killed.
- The catalogue found two checks of `leavesHookInPlace` that no row decided alone (a wrapped git, a reassigned hook variable); a fourth test gives each a row only it catches. Reassigning `GIT_CONFIG_COUNT` in the same shell before a commit is a real escape: it changes an exported variable git inherits.
- S5, the live check in an armed session, can run only once the release is installed; it is ADR-066's post-release sign-off and is not claimed here.

## Stop Condition

Stop and ask if S5 shows a live Bash call where the hook did not run.

## Out of Scope

- Removing the text refusal (deferred: docs/BACKLOG.md §301, the remaining text refusal)

## Verification Log
- 2026-09-26 · 7b6cbdd* · exit 1 · `set -o pipefail …` · acceptance-sha256:c3562c5c9ea72fdca0a35f2b70bac191169d68e9033c86c2cfdb105559b48f62 · ms:12192 · test-lock-sha256:1002b22d72b90c069c0d1ab6b8616b12efcf2369ceebfe59a76b8eacd53c8e85 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlQb3dlclNoZWxsLCBhbiBvZmZlcmVkLW9ubHkgc2Vzc2lvbiBhbmQgdGhlIHJldmlld2VyIGd1YXJkIGFyZSB1bmNoYW5nZWQJODFmNDZhMmM1NTQwZDE2YzRhYzM0MGRhYjAzMDk3ZThkYmNiMjAzNzE4MTZiYjA3YjcyZjZlNzNlZTIwMzdlNgpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlXaW5kb3dzIHNwZWxsaW5ncyBvZiBhIHB1Ymxpc2ggYXJlIHJlY29nbmlzZWQsIGFuZCBsb29rLWFsaWtlcyBhcmUgbm90CTljMzQxYjdhY2U2ZWM3ZTMwNGE2OGVhYzNlOTBiNzc0MTA3OWQ2M2FhMzg0ZThhMmQ2Y2M3NDQ0ZGY0YzBiMmEKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJYW4gYXJtZWQgc2Vzc2lvbiBsZWF2ZXMgYSBwbGFpbiBpbnZvY2F0aW9uIHRvIGdpdAkxNDg0NjQ1MDcyZjAxZDIwNWY0YmFlYWZmY2Q1Nzk3ZDEyNzM0YjQ1ZmY4MjM5ZDRlNjJkMmFkZjAzMDcxNmMwCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCWFuIGFybWVkIHNlc3Npb24gc3RpbGwgcmVmdXNlcyBldmVyeSBmb3JtIHRoYXQgY2FuIGRpc2FibGUgdGhlIGhvb2sJYjA3M2RlYmEwNjhiODMzYWU1NDVhYjA0MjRmNjljNzI1NzYwMmYzMDNlMzFlZWQ5OTYyMGNjYmM1MDJhYzE3Mwpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlkeW5hbWljIGludm9jYXRpb25zIGFyZSBub3QgcmVmdXNlZCwgYW5kIHRoaXMgdGVzdCBwaW5zIHRoYXQgdGhleSBhcmUgYSBtZW50aW9uIGF0IG1vc3QJYmU4NjQ3YjM1NzMzNDc5ODM2ZTk5NDg4ODk1ZWI3OWIwOWMyM2M3YWY0YjU5NmJkZTA5NDA5MmQ5ZTkyN2ZkMApib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlldmFsIHJ1bnMgaXRzIHN0cmluZywgc28gYSBwdWJsaXNoIGluIGl0IGlzIGludm9rZWQJYmZhZmI4Zjg2MmFmMDE5MWQ2NmI4M2M1NzJiN2VhNzMzYTA2MDJjMzA5MWM4N2Y4YmE1MTQwNjY0ODUyODJhOQpib2R5CXRlc3RzL3B1Ymxpc2gtY29tbWFuZC50ZXN0Lm1qcwlldmVyeSBwdWJsaXNoIGZvcm0gaXMgcmVjb2duaXNlZCwgd2l0aCB0aGUgaW52b2NhdGlvbiBuYW1lZAlmM2U4ZWRmYjA3Y2Q1YjUxMzk5YjMzNjVlNDE3YmQ0ZjQxZWVhNTU1MjM0ODM2MTRkOTdkOTY1NWZjN2ZkODFiCmJvZHkJdGVzdHMvcHVibGlzaC1jb21tYW5kLnRlc3QubWpzCW5vdGhpbmcgdGhhdCBvbmx5IG1lbnRpb25zIGEgcHVibGlzaCBpcyByZWZ1c2VkCTdhZjhlNjlhOGJkZDZmZTg5ZWJhNDhkZjBmNTE0Mjc4OTRlZmRlNWIwNTJkOGMxZjEyNTI0ZDUzNmFlYTIyOTcKYm9keQl0ZXN0cy9wdWJsaXNoLWNvbW1hbmQudGVzdC5tanMJdGhlIGFkdmlzb3J5IGFybSBzZWVzIHRoZSB3b3JkcyBhcyB3b3JkcyDigJQgd2FybmVkIGFib3V0LCBuZXZlciByZWZ1c2VkCWEyMmYzMzFhOWU3YTlkYWVkNzIwZWEyYzJmY2NmMjQ1NmVmOTQ0YTQwYWNmZWZjYTFkZTExMTA3MjcyNjczOTY
  ```
  --- last 10 line(s) of stderr (of 80 after folding 80 raw)
    ...
  1..9
  # tests 9
  # suites 0
  # pass 8
  # fail 1
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 12043.685667
  ```
- 2026-09-26 · 7b6cbdd* · exit 0 · `set -o pipefail …` · acceptance-sha256:c3562c5c9ea72fdca0a35f2b70bac191169d68e9033c86c2cfdb105559b48f62 · ms:27336
- 2026-09-26 · 7b6cbdd* · exit 0 · `set -o pipefail …` · acceptance-sha256:c3562c5c9ea72fdca0a35f2b70bac191169d68e9033c86c2cfdb105559b48f62 · ms:21260
- 2026-09-26 · 7b6cbdd* · exit 0 · `set -o pipefail …` · acceptance-sha256:c3562c5c9ea72fdca0a35f2b70bac191169d68e9033c86c2cfdb105559b48f62 · ms:15396
- 2026-09-26 · 7b6cbdd* · exit 0 · `set -o pipefail …` · acceptance-sha256:c3562c5c9ea72fdca0a35f2b70bac191169d68e9033c86c2cfdb105559b48f62 · ms:16064
- 2026-09-26 · 7b6cbdd* · exit 0 · `set -o pipefail …` · acceptance-sha256:c3562c5c9ea72fdca0a35f2b70bac191169d68e9033c86c2cfdb105559b48f62 · ms:15148
