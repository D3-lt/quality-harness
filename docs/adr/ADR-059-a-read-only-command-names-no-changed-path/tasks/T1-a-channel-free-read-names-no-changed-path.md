# Task ADR-059-T1: A channel-free read names no changed path

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** `READ_ARGUMENT_FAMILIES` table and `readsOnlyItsArguments`; `tests/read-only-arguments.test.mjs` (file exists)
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the family table in readsOnlyItsArguments`, `a redirect beside a read still counting`, `each named test actually running`, `the regression suites that pin path extraction`

## Goal

`bashMarkdownMutationPaths` takes nothing but a `>`/`>>` redirect target from a segment whose command is one of the channel-free families in ADR-059's Decision, through one family table that also carries ADR-058 T5's `wc`, `grep`, `git ls-files` and `mrw read`.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/read-only-arguments.test.mjs` | create | the two tests below |
| `plugin/scripts/lifecycle.mjs` | edit | `readsOnlyItsArguments` reads a `READ_ARGUMENT_FAMILIES` table; `printsOnly` in `bashMarkdownMutationPaths` is what selects it |

## Ordered Steps

1. [S1] Create the test file with the two tests below and see the first fail on an assertion (TDD red). The second pins the redirect and wrapper directions and passes before the change; S3's mutant that skips the redirect target shows it can fail.
2. [S2] Replace T5's family branches with a table `READ_ARGUMENT_FAMILIES` (family → write-channel test, `() => false` for channel-free families). Keep `grep`'s ugrep option test, `git`'s `ls-files` subcommand, `mrw read` through `isRecognisedReadInvocation`, and ADR-058 T6's wrapper check exactly.
3. [S3] Run the fence green and record mutants: drop one family from the table; skip the redirect target too; make `wc` answer false (T5's family survives the refactor). [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(a channel-free read names no changed path|a redirect beside a channel-free read is still a changed path)$' tests/read-only-arguments.test.mjs 2>&1) \
  && for name in 'a channel-free read names no changed path' 'a redirect beside a channel-free read is still a changed path'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a channel-free read names no changed path` | `tests/read-only-arguments.test.mjs` | for each channel-free family, `touch b.log && <family> docs/a.md` classifies `mutation` and yields no path | — | S1, S2 |
| `a redirect beside a channel-free read is still a changed path` | `tests/read-only-arguments.test.mjs` | `cat docs/a.md > docs/new.md`, `head -2 notes.md >> README.md`, `/usr/bin/time -o docs/timing.md cat docs/a.md` and `cp notes.md docs/new.md` beside a `cat` still yield the written file | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `printsOnly` in `bashMarkdownMutationPaths` asks `readsOnlyItsArguments`; `analyzeTranscript` calls the extractor for every `mutation`, which each test asserts; S3's mutants remove a family |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | ADR-059's Follow-up replay |

## Mutation Log
- 2026-09-17 · 279018c* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · cat leaves the table, so its argument is a changed path again · acceptance-sha256:ec320417e697c0d7b5a873592c78c7395f5718d56b746e2618132d9974967af3 · covers:the family table in readsOnlyItsArguments
- 2026-09-17 · 279018c* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · wc leaves the table in the refactor, so ADR-058 T5 regresses · acceptance-sha256:ec320417e697c0d7b5a873592c78c7395f5718d56b746e2618132d9974967af3 · covers:the family table in readsOnlyItsArguments
- 2026-09-17 · 279018c* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the table is never consulted, so every family but mrw read names its arguments again · acceptance-sha256:ec320417e697c0d7b5a873592c78c7395f5718d56b746e2618132d9974967af3 · covers:the family table in readsOnlyItsArguments
- 2026-09-17 · 279018c* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the redirect target of a read segment is skipped too · acceptance-sha256:ec320417e697c0d7b5a873592c78c7395f5718d56b746e2618132d9974967af3 · covers:a redirect beside a read still counting
- 2026-09-17 · 279018c* · mutant killed · exit 1 · `tests/read-only-arguments.test.mjs` · a renamed test selects nothing and the per-name ok grep must refuse it · acceptance-sha256:ec320417e697c0d7b5a873592c78c7395f5718d56b746e2618132d9974967af3 · covers:each named test actually running
- 2026-09-17 · 279018c* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a git revision such as origin/main:docs/x.md resolves as a changed path; tests/lifecycle.test.mjs kills it · acceptance-sha256:ec320417e697c0d7b5a873592c78c7395f5718d56b746e2618132d9974967af3 · covers:the regression suites that pin path extraction

## Invariants

- ADR-058 T3, T5 and T6 behave exactly as before; `tests/advice-accuracy.test.mjs` is in the fence.
- `isRecognisedReadInvocation` stays `mrw read`-only; it is also the classifier's hook.
- A redirect target, a wrapper's Markdown operand, and every token of a segment whose family is not in the table, are still candidates.

## Risks

- A shell alias or function named like a family that writes. Advice only; named in ADR-059's Consequences.

## Stop Condition

Stop and ask if a `tests/lifecycle.test.mjs` test about Markdown-only changes (BACKLOG §174) goes red.

## Out of Scope

- Families with a write channel (deferred: docs/adr/ADR-059-a-read-only-command-names-no-changed-path/tasks/T2-a-family-that-can-write-names-no-changed-path-until-it-uses-that-channel.md)

## Verification Log
- 2026-09-17 · 279018c* · exit 1 · `set -o pipefail …` · acceptance-sha256:ec320417e697c0d7b5a873592c78c7395f5718d56b746e2618132d9974967af3 · ms:299 · test-lock-sha256:4899758ea3626c17b880a34460d3b4bd92975d0c2275dcd7b86c1a7e6c1383f7 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBjaGFubmVsLWZyZWUgcmVhZCBuYW1lcyBubyBjaGFuZ2VkIHBhdGgJZjI0YzIwYmYyMzcwYWJhOGUwZjNmZGI3NWUyMDNlMjM4NmZmNWMzZmNkMDhjOTAyODI0YzA1N2QwMWM4MmI4OApib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSByZWRpcmVjdCBiZXNpZGUgYSBjaGFubmVsLWZyZWUgcmVhZCBpcyBzdGlsbCBhIGNoYW5nZWQgcGF0aAkxNzNiMjRkYTZiMWZmMmI4OTk0YmQ1OWRmNjdiNTNlN2Q3NzIzZGM5YTc2MDgzYTQ5ZWEzYWNjMWYwN2I1MmU3
  ```
  ```
- 2026-09-17 · 279018c* · exit 0 · `set -o pipefail …` · acceptance-sha256:ec320417e697c0d7b5a873592c78c7395f5718d56b746e2618132d9974967af3 · ms:25578
- 2026-09-17 · 279018c* · exit 0 · `set -o pipefail …` · acceptance-sha256:ec320417e697c0d7b5a873592c78c7395f5718d56b746e2618132d9974967af3 · ms:24301
- 2026-09-17 · 279018c* · exit 0 · `set -o pipefail …` · acceptance-sha256:ec320417e697c0d7b5a873592c78c7395f5718d56b746e2618132d9974967af3 · ms:25655
- 2026-09-17 · 279018c* · exit 0 · `set -o pipefail …` · acceptance-sha256:ec320417e697c0d7b5a873592c78c7395f5718d56b746e2618132d9974967af3 · ms:25113
- 2026-09-17 · 279018c* · exit 0 · `set -o pipefail …` · acceptance-sha256:ec320417e697c0d7b5a873592c78c7395f5718d56b746e2618132d9974967af3 · ms:24928
- 2026-09-17 · 279018c* · exit 0 · `set -o pipefail …` · acceptance-sha256:ec320417e697c0d7b5a873592c78c7395f5718d56b746e2618132d9974967af3 · ms:24858
- 2026-09-17 · 332a707* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:ec320417e697c0d7b5a873592c78c7395f5718d56b746e2618132d9974967af3 · ms:0 · test-lock-sha256:7e10e878c7afd635027c4c7215eb48f452454fe86e19167f7c8d90ff345fa233 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBjaGFubmVsLWZyZWUgcmVhZCBuYW1lcyBubyBjaGFuZ2VkIHBhdGgJZjI0YzIwYmYyMzcwYWJhOGUwZjNmZGI3NWUyMDNlMjM4NmZmNWMzZmNkMDhjOTAyODI0YzA1N2QwMWM4MmI4OApib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBjb250aW51ZWQgcmVkaXJlY3QgdGFyZ2V0IGtlZXBzIGl0cyBwYXRoCTY4NWQ4NjAzNTczY2Y1MTViODM3ZTUwNjJiZDFiZWEwMWJkYTM5MTViZTUxOTdkNjAyNzQ3ZmM1ZDM1MTdiMDEKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgZmFpbGVkIGNvbW1hbmQgdGhhdCBhbHNvIHdyaXRlcyBpcyBzdGlsbCBhIHdyaXRlCWI4NzNkMmJhMjgzY2ZkYzAxZWU4NDAxODYyM2NkY2U4YWNjMGYzNjBlZWMwODhjOTJhYjFhYjZlYmI1NzkyMWEKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgZmFpbGVkIGNvbW1hbmQgd2l0aCBubyB3cml0ZSBpcyBzdGlsbCBubyB3cml0ZQk5ZmFhYTlkZjI5YjU3ZWExYzExOGYzZGQwZGQ1NWM1OWFmYWZkZDM0ZmVhNzBmNTJjMDk3N2UzNTU0YWM1OTk0CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIGZhbWlseSB0aGF0IGNhbiB3cml0ZSBuYW1lcyBubyBjaGFuZ2VkIHBhdGggdW50aWwgaXQgdXNlcyB0aGF0IGNoYW5uZWwJOGQ2NmQwNzA5OTk5MDFkNTBhZmE4NzlmOGMwMTlhMGY2ZmQ4Yzk0ZDg2NDk3YjY0NjNhMmJmOTg0ZmIxNTAyYwpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSByZWFkIHdpdGhvdXQgaXRzIGNoYW5uZWwgaXMgc3RpbGwgbm90IGEgd3JpdGUJYjlhNTI4MGYwYjc1YjY3NmJmNmRiNDU1ZTY0MTEyYzI5ZjI3NGRmNTA1YTI0YTQwNTQ2MmQyMTQxOGJlMDVlYwpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSByZWRpcmVjdCBiZXNpZGUgYSBjaGFubmVsLWZyZWUgcmVhZCBpcyBzdGlsbCBhIGNoYW5nZWQgcGF0aAkxNzNiMjRkYTZiMWZmMmI4OTk0YmQ1OWRmNjdiNTNlN2Q3NzIzZGM5YTc2MDgzYTQ5ZWEzYWNjMWYwN2I1MmU3CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIHVzZWQgd3JpdGUgY2hhbm5lbCBpcyBhIHdyaXRlIHRvIHRoZSBjbGFzc2lmaWVyIGFuZCB0aGUgZ3VhcmQJNTE4NDJlZDZiNmI0YWE1M2Y0OTE2MDcyNGMyYTIxNjgxNWEzM2EwNzM5ODY2YzVmZWM3YWFlZWMwMjJmMWQyZgpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSB1c2VkIHdyaXRlIGNoYW5uZWwga2VlcHMgZXZlcnkgY2FuZGlkYXRlCTRjZTRhOGVjMjBmNTdmOTM4MGY2NDQ4ZjljN2U0NDdmNDQ1MjU5OTIxZTBjOWE1NTY5ZWQxNWUwOTYwYzJiMDIKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgdmFyaWFibGUgaW4gYSByZWFkIG9wZXJhbmQgaXMgc3RpbGwgbm90IGEgY2hhbmdlZCBwYXRoCTEzZGQ4NTdiZDY2MWMzMDNkYmZkZTY3NWQ1YmViN2VjYzY0ODMwZWIzNTg5YzEzODc4ZmQ3MTdlMjNjNzZlMzEKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgdmFyaWFibGUgaW5zaWRlIGEgcmVkaXJlY3QgdGFyZ2V0IGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCWU2N2Q0Y2I1MmY2ZjEzODdkMjgzNDdkMzM5NjNkM2NmMTRiNmQ4MDQ1NWYxNjViOWZjOTY3ODA5ZGMyMTVmMWIKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWFuIGFzc2lnbmVkIHBhdGggdXNlZCBvbmx5IGJ5IHJlYWRzIGlzIG5vdCBhIGNoYW5nZWQgcGF0aAlhOGZmYTY1MzJmNWZhZjgzN2FhZjc3Y2IwOGU2Y2NhZDkxOTA0NmQxMTAzN2Y0MDU4MGM4YmU0ZGZiNGM0MWI2CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhbiBhc3NpZ25lZCBwYXRoIHdyaXR0ZW4sIGhpZGRlbiwgZXhwb3J0ZWQgb3IgbmV2ZXIgcmVmZXJlbmNlZCBpcyBzdGlsbCBhIGNoYW5nZWQgcGF0aAkzZDlmM2ZiZmUwYTQzOWFjNjdhYTU4YTE0NDVjODFlOWMxZmQzZjQzMjQ1MmVmNTVhZTEzOGJhNzA0ZTdlNmU5CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhbiBlc2NhcGVkIHF1b3RlIGRvZXMgbm90IGhpZGUgYSByZWRpcmVjdCB0YXJnZXQJNTM1NGFiMjJlNDQxYmZlODU3NDAzMjRhYWQxOWVkNmM4MjJjMGU0N2I0NWY1Nzc3OWM0ZTIzNDg4Zjg5ODM5Nwpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYW4gZXNjYXBlZCBxdW90ZSBpbiBhIHJlYWQgb3BlcmFuZCBpcyBzdGlsbCBhIHJlYWQJMjdhOTMzYzVhNDZiZWEzYTNjYTU2MzE3Y2Y2MmZhNWQ4NWQ3Y2VkZGEyMWEyNWYwODlmNzkwZGVlOTFhZTZlYwpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJdGhlIHJlbGVhc2VkIHF1b3RlIHN0cmlwIHN0aWxsIHNlZXMgdGhlc2Ugd3JpdGVzCTYxZTRkOWMyYWYwMDkyYzJmYmVjNmVlNWY4MTNmMTdjZmQwNzllZTlmZWMzY2E5YzkzYzZjNjQ5MWY0NWYyZTA · test-lock-kind:replace
- 2026-09-17 · 332a707* · exit 0 · `set -o pipefail …` · acceptance-sha256:ec320417e697c0d7b5a873592c78c7395f5718d56b746e2618132d9974967af3 · ms:21775
