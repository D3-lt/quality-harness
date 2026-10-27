# Task ADR-120-T9: A pass stands across a prose-only change, for every reader

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** the prose-aware pass in `checkStanding` and its Go twin; the prose advisory
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A pass on tree X stands for a later tree Y whenever the only paths that differ are the project's declared `prose`, for the publish verdict, the turn end, git's hook and the Go core alike, so a markdown-only commit after a passing check costs nothing; on a prose-only unchecked diff with no `prose` declared, the advisory names the setting once.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/prose-pass.test.mjs` | create | the rows below (0 locks: new) |
| `tests/carry-and-probe-fixes.test.mjs` | create | the review's P1 (a write another session logged after the carried pass) and the T11 probe's P2, Node and Go (0 locks: new); `core/hooks/carry_review_test.go` is its Go half |
| `plugin/scripts/check-ledger.mjs` | edit | `checkEventsFor` (:422-425) and `checkStanding` (:512-522) accept a pass whose `codeTree` equals the `codeTree` of the specific tree asked about (the working tree, the staged index, a historical commit), never the current observation's; a newer non-pass on that code tree still wins; the prose list is carried and authenticated through import and ledger binding (:272-276, :320-323) |
| `plugin/scripts/tree-facts.mjs` | edit | the session's observation computes `codeTree` (the `without` option, :115-118, :157-160) when `prose` is declared |
| `core/hooks/ledger.go` | edit | the prose branch `passedAlready` lacks (:174-186), and the same standing rule |
| `plugin/scripts/publish-verdict.mjs` | edit | the advisory sentence naming `prose` for a prose-only unchecked diff, once per tree |
| `plugin/scripts/completion-rules.mjs`, `plugin/scripts/statusline.mjs`, `plugin/scripts/session-notes.mjs`, `core/hooks/turnend.go`, `core/hooks/sessionend.go`, `core/hooks/notes.go` | edit or retained | every other reader of a pass (`completion-rules.mjs:420,607,735,755`, `statusline.mjs:117`, `session-notes.mjs:183`, and the Go session-end and notes readers): each uses the same standing rule or is named retained, from `mrw read --grep 'checkStanding|checkEventsFor|CheckStanding' plugin/scripts/ core/hooks/` |
| `tests/mutations/plugin/scripts/check-ledger.mjs.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: with `"prose": ["docs/**", "**/*.md"]`, a pass on X then an edit to `docs/a.md` leaves the publish verdict allowing a commit and R1 silent, in Node and Go; an edit to `src/a.mjs` refuses and speaks; a prose list that changed since the pass does not carry it; with no `prose` declared, a markdown-only diff is refused as today and the advisory names `prose` once; an unobservable write after the pass still vetoes it; a pass on X, then committing unchecked code Y, then restoring X's code plus a prose edit: R2 still names commit Y, because Y's own code tree has no pass; a staged index whose code differs from the passing tree is still refused.
2. [S2] Carry the declared prose list and `codeTree` in the session observation, and let `checkStanding` read a pass on the same `codeTree` under the same list.
3. [S3] Port the standing rule and `passedAlready`'s prose branch to Go.
4. [S4] Add the advisory sentence and its once-per-tree key.
5. [S5] Record a killed mutant per mechanism, with catalogue entries, and run `node scripts/mutate.mjs --case 'ADR-120 T9' --no-cache`. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/prose-pass.test.mjs 2>&1) \
  && for n in "a pass stands across a prose-only change for every reader" \
      "a code change, a changed prose list or an unseen write ends the carry-over" \
      "a prose-only unchecked diff with no prose declared names the setting once"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done \
  && out=$(node --test --test-reporter=tap tests/carry-and-probe-fixes.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "a write another session made after the pass ends the carry-over, and one made before it does not")" = 1 \
  && (cd core && go test ./hooks/)
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a pass stands across a prose-only change for every reader` | `tests/prose-pass.test.mjs` | the publish verdict and the turn end, Node and Go | — | S1, S2, S3 |
| `a code change, a changed prose list or an unseen write ends the carry-over` | `tests/prose-pass.test.mjs` | the twins | — | S1, S2 |
| `a prose-only unchecked diff with no prose declared names the setting once` | `tests/prose-pass.test.mjs` | the advisory | — | S1, S4 |
| `a write another session made after the pass ends the carry-over, and one made before it does not` | `tests/carry-and-probe-fixes.test.mjs` | the repository-wide veto on a carried pass, through `carryFor` and the turn end (review of 7a9107e8..dcc4693a, P1); its Go twin is `TestCarryForRefusesAForeignWrite` | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | the hook or gate that calls it; the mutants on that call |
| 3 — the caller can discover it | the advice or output text, and the skill where one is named |
| 4 — it is used | every session or run of the gate in question |

## Mutation Log
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/check-ledger.mjs` · a pass carried to a tree under another declared list than the one it was taken under · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/check-ledger.mjs` · a write git cannot see no longer ends the carry-over · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/check-ledger.mjs` · the import drops the list a pass was taken under · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/check-ledger.mjs` · an event may name a code tree the ledger record does not hold · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/publish-verdict.mjs` · the staged index is asked with the working tree's code tree · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · a commit is asked with the working tree's code tree instead of its own · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/publish-verdict.mjs` · the prose setting is named again on a tree it was already named for · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/statusline.mjs` · the status line asks the tree without its code tree · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/session-notes.mjs` · the previous-session notice does not know the project's declared prose · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `core/hooks/ledger.go` · the Go core carries a pass to a tree under another declared list · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `core/hooks/publish.go` · the Go publish verdict asks the staged index with the working tree's code tree · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `core/hooks/turnend.go` · the Go turn end asks a commit with the working tree's code tree instead of its own · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `core/hooks/publish.go` · the Go refusal names the prose setting again on a tree it was already named for · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `core/hooks/notes.go` · the Go previous-session notice does not know the project's declared prose · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775
- 2026-10-21 · a5ac6999* · mutant killed · exit 1 · `plugin/scripts/check-ledger.mjs` · the carry stands against a write another session logged after the pass (review of 7a9107e8..dcc4693a, finding 1) · acceptance-sha256:49a5ef78184cdaf70fd16db9fc4f2459e1d20c3e05453392417136abdc0ddba0

## Invariants

- Every locked test keeps its body; new tests go beside locked ones.
- Node and Go agree wherever both implement the rule.

## Risks

- A path listed as prose that a test reads (this repository's own docs) carries a pass it should not: `prose` stays opt-in, and the advisory says it is the project's claim that nothing the check reads lives there.

## Stop Condition

Stop if a reader outside these four judges a tree by its pass: it joins the class first.

## Out of Scope

- Inferring inputs from a language's dependency graph (permanent: boundary: the owner chose the declared form on 2026-10-21; an inferred input set is a classifier that needs its own record)

## Verification Log
- 2026-10-21 · aa26c0bd* · exit 1 · `out=$(node --test --test-reporter=tap tests/prose-pass.test.mjs 2>&1) \ …` · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775 · ms:1841 · test-lock-sha256:0a4b0b63e584716c27f5bb24858a26886ac4af377121c6f66e8dbdc6d63174d2 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcHJvc2UtcGFzcy50ZXN0Lm1qcwlhIGNvZGUgY2hhbmdlLCBhIGNoYW5nZWQgcHJvc2UgbGlzdCBvciBhbiB1bnNlZW4gd3JpdGUgZW5kcyB0aGUgY2Fycnktb3Zlcgk4OWZiZjE1MDM5YzBkZDQ5N2I0ZmU2NmZlM2UwNjNlY2JjM2NjYjVlZTZhYTA4N2U3YjJlNTFjMjgwZjU3ZWQ5CmJvZHkJdGVzdHMvcHJvc2UtcGFzcy50ZXN0Lm1qcwlhIHBhc3Mgc3RhbmRzIGFjcm9zcyBhIHByb3NlLW9ubHkgY2hhbmdlIGZvciBldmVyeSByZWFkZXIJZWU0YmIwNGNjNDI1YWQ3MjU1OTkzYTdiZmJjZGU4MTZjOTlmYjc1MTMxNjBhZDQ3MjIxNTU5MzNhYTU2YzAwZQpib2R5CXRlc3RzL3Byb3NlLXBhc3MudGVzdC5tanMJYSBwcm9zZS1vbmx5IHVuY2hlY2tlZCBkaWZmIHdpdGggbm8gcHJvc2UgZGVjbGFyZWQgbmFtZXMgdGhlIHNldHRpbmcgb25jZQliZTNkNmU0ZDU1YWRmZWRjZWNkMWYwZGFiNjU0YjIyMzg1ZGI5OWUxMTRiMzc2MzFmMTEzYTkzYTJiZjlmM2Rl
  ```
  ```
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/prose-pass.test.mjs 2>&1) \ …` · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775 · ms:33556
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/prose-pass.test.mjs 2>&1) \ …` · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775 · ms:30220
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/prose-pass.test.mjs 2>&1) \ …` · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775 · ms:36097
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/prose-pass.test.mjs 2>&1) \ …` · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775 · ms:42067
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/prose-pass.test.mjs 2>&1) \ …` · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775 · ms:44157
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/prose-pass.test.mjs 2>&1) \ …` · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775 · ms:27706
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/prose-pass.test.mjs 2>&1) \ …` · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775 · ms:49990
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/prose-pass.test.mjs 2>&1) \ …` · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775 · ms:109582
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/prose-pass.test.mjs 2>&1) \ …` · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775 · ms:75443
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/prose-pass.test.mjs 2>&1) \ …` · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775 · ms:59181
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/prose-pass.test.mjs 2>&1) \ …` · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775 · ms:56232
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/prose-pass.test.mjs 2>&1) \ …` · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775 · ms:42687
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/prose-pass.test.mjs 2>&1) \ …` · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775 · ms:86419
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/prose-pass.test.mjs 2>&1) \ …` · acceptance-sha256:c914889c2ea0b956b73f0cef75c820b4764da8300e05739be818f60fe1360775 · ms:71912
- 2026-10-21 · a5ac6999* · exit 0 · `out=$(node --test --test-reporter=tap tests/prose-pass.test.mjs 2>&1) \ …` · acceptance-sha256:49a5ef78184cdaf70fd16db9fc4f2459e1d20c3e05453392417136abdc0ddba0 · ms:39037
- 2026-10-27 · 34e79f7d* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:49a5ef78184cdaf70fd16db9fc4f2459e1d20c3e05453392417136abdc0ddba0 · ms:0 · test-lock-sha256:a79473665c941f5c887eddd99e9cba16d5f2e3ddba973be34b713a8970bf3e15 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvY2FycnktYW5kLXByb2JlLWZpeGVzLnRlc3QubWpzCWEgZGVjbGFyZWQgY2hlY2sgd2l0aCBhIGNvbW1hbmQtbG9jYWwgYXNzaWdubWVudCBjYW4gc3RhcnQsIGFuZCBhIHBsYWluIG1pc3NpbmcgcHJvZ3JhbSBjYW5ub3QJM2E5MWVlYzYwNGVjYjdjNzAxZmViNmI5MzYyYTNjMzcyODg5ZTljYTIwZDViN2JlZTNmNjFlZjZhZjFiMzU3Nwpib2R5CXRlc3RzL2NhcnJ5LWFuZC1wcm9iZS1maXhlcy50ZXN0Lm1qcwlhIHdyaXRlIGFub3RoZXIgc2Vzc2lvbiBtYWRlIGFmdGVyIHRoZSBwYXNzIGVuZHMgdGhlIGNhcnJ5LW92ZXIsIGFuZCBvbmUgbWFkZSBiZWZvcmUgaXQgZG9lcyBub3QJMDY3ODU1MjFiNTExMzdkYmRkYjc1MTM0ZmRmMzRlZTIyMDUzNzJlMzMyYTkyYjMwZGIzYTc2YTE0Y2RkNjVjMwpib2R5CXRlc3RzL2NhcnJ5LWFuZC1wcm9iZS1maXhlcy50ZXN0Lm1qcwl0aGUgR28gY29yZSdzIGZvcmVpZ24td3JpdGUgdmV0byBhbmQgYXNzaWdubWVudCBwcm9iZSBob2xkCTk3ZjliODg0M2Q5M2FjYWVhNjZmMjhjYjhkNGY5NTM1MzQ0Y2ExYTAwMWQ3Y2Q1OGY4YzJlMDI3ZjBlYWE2MGEKYm9keQl0ZXN0cy9wcm9zZS1wYXNzLnRlc3QubWpzCWEgY2hlY2sgZXZlbnQgbmFtZXMgaXRzIGNvZGUgdHJlZSBhbmQgbGlzdCBvbmx5IGFzIHRoZSBsZWRnZXIgcmVjb3JkIGhvbGRzIHRoZW0JNDExOTJiMDZjMWVjZmQxZDYzMzNjNTYxNjkyOWE5ZGJlYmM4ZThmYTNhOTRiMzg3OWU3ZDUwMDNjM2Y5NjBkZgpib2R5CXRlc3RzL3Byb3NlLXBhc3MudGVzdC5tanMJYSBjb2RlIGNoYW5nZSwgYSBjaGFuZ2VkIHByb3NlIGxpc3Qgb3IgYW4gdW5zZWVuIHdyaXRlIGVuZHMgdGhlIGNhcnJ5LW92ZXIJZDc5MWVkZDQ5Mjc0Zjc3MGYwNjkwYzczMjIxOGJhMzRlNGQ2MzA0MDE5MWQzZGUwOGRmYmViODg1M2U1ZGM2NApib2R5CXRlc3RzL3Byb3NlLXBhc3MudGVzdC5tanMJYSBwYXNzIHN0YW5kcyBhY3Jvc3MgYSBwcm9zZS1vbmx5IGNoYW5nZSBmb3IgZXZlcnkgcmVhZGVyCWVlNGJiMDRjYzQyNWFkNzI1NTk5M2E3YmZiY2RlODE2Yzk5ZmI3NTEzMTYwYWQ0NzIyMTU1OTMzYWE1NmMwMGUKYm9keQl0ZXN0cy9wcm9zZS1wYXNzLnRlc3QubWpzCWEgcHJvc2Utb25seSB1bmNoZWNrZWQgZGlmZiB3aXRoIG5vIHByb3NlIGRlY2xhcmVkIG5hbWVzIHRoZSBzZXR0aW5nIG9uY2UJYmUzZDZlNGQ1NWFkZmVkY2VjZDFmMGRhYjY1NGIyMjM4NWRiOTllMTE0YjM3NjMxZjExM2E5M2EyYmY5ZjNkZQpib2R5CXRlc3RzL3Byb3NlLXBhc3MudGVzdC5tanMJdGhlIEdvIGNvcmUncyBjYXJyeSBydWxlcyBob2xkIGZvciBhIGxpc3QsIGEgY29kZSB0cmVlLCBhIG5ld2VyIGZhaWx1cmUsIGEgd3JpdGUgYW5kIHRoZSBncmFtbWFyCTYwODIyNjk1OTdkMjJhNjFkZGRiOGZhNjQ1NTFhYWYzYzFiOTBiZmEzMWQ0ZjIyNjA0ZDFjMzVkY2U0MjJiYzMKYm9keQl0ZXN0cy9wcm9zZS1wYXNzLnRlc3QubWpzCXRoZSBjb21wYWN0aW9uIG5vdGUgc2F5cyBhIHBhc3MgdGhhdCBzdGFuZHMgZm9yIHRoZSB0cmVlIHBhc3NlZCBvbiB0aGUgY2hhbmdlZCBwYXRocywgaW4gTm9kZSBhbmQgR28JYTRiNTU0MzE2YzUzZDAxMTc1MThiOGRmYzhmNDgxNjY3N2Q4Y2YzZmQ0NDA3MDk5NTU5YTI0MWVhMWU1ZDVkNgpib2R5CXRlc3RzL3Byb3NlLXBhc3MudGVzdC5tanMJdGhlIHByZXZpb3VzIHNlc3Npb24ncyBub3RpY2UgaXMgc2lsZW50IG9uIGEgdHJlZSBhIHBhc3Mgc3RhbmRzIGZvciwgYW5kIHNwZWFrcyBvbiBvbmUgaXQgZG9lcyBub3QJYTg2N2FkZmVhNTBjNGE5Y2ZkMDE0YTNiNzJkYjBiZGQ3N2NjODJlNWRkZmIxM2M0NjBjNGMzOTVkOGRlNWZkZQpib2R5CXRlc3RzL3Byb3NlLXBhc3MudGVzdC5tanMJdGhlIHN0YXR1cyBsaW5lIHJlYWRzIGEgcGFzcyBjYXJyaWVkIHRvIGEgcHJvc2Utb25seSB0cmVlLCBhbmQgbm90IHRvIG9uZSB3aXRoIG90aGVyIGNvZGUJYzJmOGFiOWVmMWIyZDA2MGRkODM0NzNkYzlhYWY4ZTMyMmMzMTUwOWVlODE1ZDRhNTBhYmRmNzUzZmIzMjkyZA · test-lock-kind:replace
