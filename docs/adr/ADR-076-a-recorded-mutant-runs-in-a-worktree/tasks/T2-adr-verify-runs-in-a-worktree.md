# Task ADR-076-T2: adr-verify --mutant runs in a worktree

**Depends-on:** T1
**Covers:** F-2, F-3, F-4, F-5, F-6, F-7, F-8, F-11, F-12, UC1-S1, UC1-S2, UC1-S3, UC1-S4, UC1-S5, UC1-S6
**Estimated scope:** L (the gate's mutant path, the fence runner's ownership, nine tests)
**Owner:** unassigned
**Produces:** `adr-verify --in-place` and its first line
**Consumes:** `build`, `remove`, `sweep`, `addOwned` and the `owner.json` contract in `plugin/scripts/worktree.mjs` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the mutant is applied in the worktree`, `outside git the run is in place and says so`, `a fence naming the checkout runs in place`, `a shared prefix is not the checkout`, `the fences run in the worktree`, `the clean build is reset before the mutant fence`, `evidence is read from the checkout`, `--in-place is today`, `a stopped run removes its tree`

## Goal

`adr-verify --mutant` runs its clean and mutant fences in a worktree of the checkout's working-tree content by default, resets the target and declared outputs inside it between the fences, reads its evidence from the checkout and writes its rows there before disposing of the tree, and says on its first line where it ran (ADR-076 Decision, "`adr-verify --mutant`, isolated by default").

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-verify` | edit | the mode decision; the build through T1's CLI; execution paths (fence cwd, target, journal, secondary members) in the tree; evidence paths (task file, entry sha, test-body locks) in the checkout; rows before disposal; `--in-place` in the parser and `--help` |
| `plugin/lib/fence.py` | edit | `run_bounded` publishes the fence's process group, or job, through T1's `add-owned` before the fence runs, and reports whether it ended |
| `tests/adr-verify-isolation.test.mjs` | edit | remove `todo`; add the nested `--cwd`, absolute-target and evidence-lock cases |
| `tests/mutations.json` | edit | this task's entries |

## Ordered Steps

1. [S1] Remove `todo` from the nine tests in `tests/adr-verify-isolation.test.mjs` and record the red run with `adr-verify` (TDD red). [proof: acceptance]
2. [S2] Parse `--in-place`, and name it in `--help`.
3. [S3] After the preflight, decide the mode. Each of these is in place, with a first line saying why: `--in-place`; the fence names the checkout's absolute path in a spelling F-4 defines, at a path boundary (with a platform seam, so the Windows spellings are tested on every host); the target lies outside the checkout; the T1 build fails. Otherwise the first line is "isolated in <id>".
4. [S4] Isolated execution: the fence cwd, the target, the journal and the `--also-restore` members are the worktree's; the reset between the fences (`restore_live_transaction`) runs there.
5. [S5] Evidence stays the checkout's: the task file, the entry sha for both rows (taken once, before the run), and `record_run`'s test-body locks. Write both rows before the tree is disposed of.
6. [S6] `run_bounded` records the fence's group or job with T1's `add-owned` before it runs, and says whether it ended. In the `finally`, end a fence still running, and remove the tree only on a confirmed end; otherwise leave it for the sweep.
7. [S7] Record one killed mutant per Rests-on name. This task's own mutants run with `--in-place`, because the gate under test is the one being edited. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/adr-verify-isolation.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE 'ok [0-9]+ - (a mutant run leaves the checkout unchanged but for the task file.s logs|outside git the mutant runs in place and says why|a fence naming the checkout runs in place and names the path|a fence.s generated output stays in the worktree|an isolated and an in-place run record the same verdict|--in-place applies the mutant in the checkout and restores it|a generated output left by the clean fence is reset before the mutant fence|a sibling path sharing the checkout.s prefix does not force the run in place)' "$T")" -eq 8 && test "$(grep -cxE 'ok [0-9]+ - a stopped mutant run removes its worktree( # SKIP Windows ends the tree at once; the next run sweeps it)?' "$T")" -eq 1
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a mutant run leaves the checkout unchanged but for the task file's logs` | `tests/adr-verify-isolation.test.mjs` | "isolated in"; no exposure; every other byte, the index, the staged diff, the stash list and the task file outside its logs unchanged | F-2, UC1-S1 | S3, S4, S5 |
| `outside git the mutant runs in place and says why` | `tests/adr-verify-isolation.test.mjs` | the first line; the mutant still recorded | F-3, UC1-S2 | S3 |
| `a fence naming the checkout runs in place and names the path` | `tests/adr-verify-isolation.test.mjs` | the first line names the path | F-4, UC1-S3 | S3 |
| `a sibling path sharing the checkout's prefix does not force the run in place` | `tests/adr-verify-isolation.test.mjs` | the boundary | F-12, UC1-S6 | S3 |
| `a fence's generated output stays in the worktree` | `tests/adr-verify-isolation.test.mjs` | no generated file in the checkout | F-5 | S4 |
| `a generated output left by the clean fence is reset before the mutant fence` | `tests/adr-verify-isolation.test.mjs` | the reset between fences, in the tree | F-5, F-11, UC1-S5 | S4 |
| `an isolated and an in-place run record the same verdict` | `tests/adr-verify-isolation.test.mjs` | equal verdicts; both rows name HEAD, clean and then dirty (`*`) | F-6 | S5 |
| `--in-place applies the mutant in the checkout and restores it` | `tests/adr-verify-isolation.test.mjs` | exposure seen, file restored | F-7 | S2, S3 |
| `a stopped mutant run removes its worktree` | `tests/adr-verify-isolation.test.mjs` | SIGTERM ends the fence and removes the tree (POSIX) | F-8, UC1-S4 | S6 |
| `the checkout's path is found in its Windows spellings on any host` | `tests/adr-verify-isolation.test.mjs` | F-4's Windows spellings and POSIX case through the platform seam | F-4 | S3 |
| `a fence's leftover in the worktree does not mark the checkout's rows dirty` | `tests/adr-verify-isolation.test.mjs` | both rows name the checkout's clean HEAD while the tree is dirty | F-6 | S5 |
| `a SIGTERM during the worktree build still removes the worktree` | `tests/adr-verify-isolation.test.mjs` | a signal held across the build is acted on once the tree's id is known (POSIX) | F-8 | S6 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the mode decision and its tests |
| 2 — something selects it | every `adr-verify --mutant` without `--in-place` |
| 3 — the caller can discover it | the first line, and `--help` |
| 4 — it is used | `adr-execute`'s mutation step |

## Mutation Log
- 2026-09-30 · 3e1b214* · mutant killed · exit 1 · `plugin/bin/adr-verify` · the mutant lands in the checkout instead of the worktree · acceptance-sha256:73a65ffe02c9da0e449ab7db333773107693a0ffc38107c9322d12afc6bb0a99 · covers:the mutant is applied in the worktree
- 2026-09-30 · 3e1b214* · mutant killed · exit 1 · `plugin/bin/adr-verify` · the in-place line no longer says the run is outside git · acceptance-sha256:73a65ffe02c9da0e449ab7db333773107693a0ffc38107c9322d12afc6bb0a99 · covers:outside git the run is in place and says so
- 2026-09-30 · 3e1b214* · mutant killed · exit 1 · `plugin/bin/adr-verify` · a fence reading the checkout by its absolute path is isolated and judges the unmutated checkout · acceptance-sha256:73a65ffe02c9da0e449ab7db333773107693a0ffc38107c9322d12afc6bb0a99 · covers:a fence naming the checkout runs in place
- 2026-09-30 · 3e1b214* · mutant killed · exit 1 · `plugin/bin/adr-verify` · any path sharing the checkout prefix forces the run in place · acceptance-sha256:73a65ffe02c9da0e449ab7db333773107693a0ffc38107c9322d12afc6bb0a99 · covers:a shared prefix is not the checkout
- 2026-09-30 · 3e1b214* · mutant killed · exit 1 · `plugin/bin/adr-verify` · the clean fence runs in the checkout, so its outputs land there · acceptance-sha256:73a65ffe02c9da0e449ab7db333773107693a0ffc38107c9322d12afc6bb0a99 · covers:the fences run in the worktree
- 2026-09-30 · 3e1b214* · mutant killed · exit 1 · `plugin/bin/adr-verify` · the between-fence reset targets the checkout, so the tree keeps the clean build · acceptance-sha256:73a65ffe02c9da0e449ab7db333773107693a0ffc38107c9322d12afc6bb0a99 · covers:the clean build is reset before the mutant fence
- 2026-09-30 · 3e1b214* · mutant killed · exit 1 · `plugin/bin/adr-verify` · the Mutation Log sha is read from the worktree, which a fence left dirty · acceptance-sha256:73a65ffe02c9da0e449ab7db333773107693a0ffc38107c9322d12afc6bb0a99 · covers:evidence is read from the checkout
- 2026-09-30 · 3e1b214* · mutant killed · exit 1 · `plugin/bin/adr-verify` · --in-place is parsed and ignored, so the run isolates · acceptance-sha256:73a65ffe02c9da0e449ab7db333773107693a0ffc38107c9322d12afc6bb0a99 · covers:--in-place is today
- 2026-09-30 · 3e1b214* · mutant killed · exit 1 · `plugin/lib/fence.py` · an interrupted fence is never reported ended, so its tree outlives the stopped run · acceptance-sha256:73a65ffe02c9da0e449ab7db333773107693a0ffc38107c9322d12afc6bb0a99 · covers:a stopped run removes its tree
- 2026-09-30 · 3e1b214* · mutant killed · exit 1 · `plugin/bin/adr-verify` · a SIGTERM during the worktree build ends the process before it knows the tree, so the tree outlives the run · acceptance-sha256:73a65ffe02c9da0e449ab7db333773107693a0ffc38107c9322d12afc6bb0a99 · covers:a stopped run removes its tree

## Invariants

- The Verification and Mutation Log grammars are unchanged; `adr-lint` reads an isolated run's entries as it reads today's.
- ADR-002's journal and ADR-016's `--also-restore` still govern the reset between the fences, and all of `--in-place`.
- Nothing is refused that ran before: every arm that cannot isolate runs in place (spec F-3, F-4).

## Risks

- A fence that reads an ignored file fails its clean run in the worktree. It fails before any mutant, and says so.

## Stop Condition

Stop and ask if the verdict grading has to change to run in another directory.

## Out of Scope

- Isolating `adr-verify` without `--mutant` (permanent: boundary: spec Non-Goals)

## Verification Log
- 2026-09-30 · 3e1b214* · exit 1 · `set -o pipefail …` · acceptance-sha256:73a65ffe02c9da0e449ab7db333773107693a0ffc38107c9322d12afc6bb0a99 · ms:61717 · test-lock-sha256:f0486a8570280c80b411bb1c2e06289cb49f9ac6f816034eaa6921e5d7b5f4b8 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2Fkci12ZXJpZnktaXNvbGF0aW9uLnRlc3QubWpzCS0taW4tcGxhY2UgYXBwbGllcyB0aGUgbXV0YW50IGluIHRoZSBjaGVja291dCBhbmQgcmVzdG9yZXMgaXQJNWRiMTQxYWI1MzBjZWIxNDU3NDdlNWY5NzkyMDM0YWIzZGQ5YTRmZjVmNDNkODU1ODNlM2U3YTdlMWM0ZDk5Mwpib2R5CXRlc3RzL2Fkci12ZXJpZnktaXNvbGF0aW9uLnRlc3QubWpzCWEgZmVuY2UgbmFtaW5nIHRoZSBjaGVja291dCBydW5zIGluIHBsYWNlIGFuZCBuYW1lcyB0aGUgcGF0aAllMjVlZDQ0MGVlNzJkZTA1ZTM2OTgyZjZiODJmODExMGJmZWRiMWUyMzI1ODYyNjNlOGNkNWI0OWM1NmJkOWJiCmJvZHkJdGVzdHMvYWRyLXZlcmlmeS1pc29sYXRpb24udGVzdC5tanMJYSBmZW5jZSdzIGdlbmVyYXRlZCBvdXRwdXQgc3RheXMgaW4gdGhlIHdvcmt0cmVlCTIyMjkwM2ZhNTk1ODdkZTBiZDBhYTlkMTczZTYxYmY1OGEzMWViYmVhZWJkNGQzYWU0NWY2YzE3YjE3OGZlZTgKYm9keQl0ZXN0cy9hZHItdmVyaWZ5LWlzb2xhdGlvbi50ZXN0Lm1qcwlhIGdlbmVyYXRlZCBvdXRwdXQgbGVmdCBieSB0aGUgY2xlYW4gZmVuY2UgaXMgcmVzZXQgYmVmb3JlIHRoZSBtdXRhbnQgZmVuY2UJZTQ2YzlmZDA0YmU2ZTIzMDM4YmYzMmJhODY2OWQ5MWZmNGVmNjVlNGZkYzU2NzMyOGZiYmEwYTY4ZjBkMWU4ZApib2R5CXRlc3RzL2Fkci12ZXJpZnktaXNvbGF0aW9uLnRlc3QubWpzCWEgbXV0YW50IHJ1biBsZWF2ZXMgdGhlIGNoZWNrb3V0IHVuY2hhbmdlZCBidXQgZm9yIHRoZSB0YXNrIGZpbGUncyBsb2dzCTdhOGFhNjJjNTVlYzdjZGNmMjBiZmU5Y2JiYjY0OTkzYjQ0NTM5OWY5ZTExYmE5NTE5ZTRkNDBhM2JlMTM2NGQKYm9keQl0ZXN0cy9hZHItdmVyaWZ5LWlzb2xhdGlvbi50ZXN0Lm1qcwlhIHNpYmxpbmcgcGF0aCBzaGFyaW5nIHRoZSBjaGVja291dCdzIHByZWZpeCBkb2VzIG5vdCBmb3JjZSB0aGUgcnVuIGluIHBsYWNlCWY5NTFhOTg4NThjNDA4YjZiZTE1MDIxMzMzYmQ1MWY5YzdmOTk1NWY0NTE5Njk2MDVmY2M2ZmMzODY4NGYzNDYKYm9keQl0ZXN0cy9hZHItdmVyaWZ5LWlzb2xhdGlvbi50ZXN0Lm1qcwlhIHN0b3BwZWQgbXV0YW50IHJ1biByZW1vdmVzIGl0cyB3b3JrdHJlZQllYWJlOGFkY2ViMmViZTRhZjVlNzNlMGUwMmFmZmZhYzVkYjA1NDIwYjgwY2M5YTBhMzM5NGI1NDJkZDliZWY4CmJvZHkJdGVzdHMvYWRyLXZlcmlmeS1pc29sYXRpb24udGVzdC5tanMJYW4gaXNvbGF0ZWQgYW5kIGFuIGluLXBsYWNlIHJ1biByZWNvcmQgdGhlIHNhbWUgdmVyZGljdAllYTE0YWQ0MTQ2MDg1NGRiNzY0NjgzZTkzZTQ2N2NlYjY2ZDQwNzA1YzU3MTUwYjIxZDk3MGNkZjlhOTM1MjJlCmJvZHkJdGVzdHMvYWRyLXZlcmlmeS1pc29sYXRpb24udGVzdC5tanMJb3V0c2lkZSBnaXQgdGhlIG11dGFudCBydW5zIGluIHBsYWNlIGFuZCBzYXlzIHdoeQllYTlhOGQyZjdkZWFlYmVkZGVhYzkzMWQzMzY4Y2I1Njk1YzE0YWExMThhMDcxZWUyYzQ3YTRmMmYwODg1OWQ3CmJvZHkJdGVzdHMvYWRyLXZlcmlmeS1pc29sYXRpb24udGVzdC5tanMJdGhlIGNoZWNrb3V0J3MgcGF0aCBpcyBmb3VuZCBpbiBpdHMgV2luZG93cyBzcGVsbGluZ3Mgb24gYW55IGhvc3QJOGNhNDY4MGFlYjNhZDFmZjU4ZWI1ZGM5MzBlNDdiZTBhOTE5Y2RiNWQ2OGY2NWFhMGIxNDU5MTI0YTRmN2U2NA
  ```
  --- last 10 line(s) of stdout (of 279 after folding 282 raw)
    ...
  1..10
  # tests 10
  # suites 0
  # pass 0
  # fail 10
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 61612.118625
  ```
- 2026-09-30 · 3e1b214* · exit 0 · `set -o pipefail …` · acceptance-sha256:73a65ffe02c9da0e449ab7db333773107693a0ffc38107c9322d12afc6bb0a99 · ms:7265
- 2026-09-30 · 3e1b214* · exit 0 · `set -o pipefail …` · acceptance-sha256:73a65ffe02c9da0e449ab7db333773107693a0ffc38107c9322d12afc6bb0a99 · ms:7196
- 2026-09-30 · 3e1b214* · exit 0 · `set -o pipefail …` · acceptance-sha256:73a65ffe02c9da0e449ab7db333773107693a0ffc38107c9322d12afc6bb0a99 · ms:7223
- 2026-09-30 · 3e1b214* · exit 0 · `set -o pipefail …` · acceptance-sha256:73a65ffe02c9da0e449ab7db333773107693a0ffc38107c9322d12afc6bb0a99 · ms:7223
- 2026-09-30 · 3e1b214* · exit 0 · `set -o pipefail …` · acceptance-sha256:73a65ffe02c9da0e449ab7db333773107693a0ffc38107c9322d12afc6bb0a99 · ms:7246
- 2026-09-30 · 3e1b214* · exit 0 · `set -o pipefail …` · acceptance-sha256:73a65ffe02c9da0e449ab7db333773107693a0ffc38107c9322d12afc6bb0a99 · ms:7608
- 2026-09-30 · 3e1b214* · exit 0 · `set -o pipefail …` · acceptance-sha256:73a65ffe02c9da0e449ab7db333773107693a0ffc38107c9322d12afc6bb0a99 · ms:6358
- 2026-09-30 · 3e1b214* · exit 0 · `set -o pipefail …` · acceptance-sha256:73a65ffe02c9da0e449ab7db333773107693a0ffc38107c9322d12afc6bb0a99 · ms:6478
- 2026-09-30 · 3e1b214* · exit 0 · `set -o pipefail …` · acceptance-sha256:73a65ffe02c9da0e449ab7db333773107693a0ffc38107c9322d12afc6bb0a99 · ms:6380
- 2026-09-30 · 3e1b214* · exit 0 · `set -o pipefail …` · acceptance-sha256:73a65ffe02c9da0e449ab7db333773107693a0ffc38107c9322d12afc6bb0a99 · ms:6672
- 2026-10-21 · b76ac9e0* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:73a65ffe02c9da0e449ab7db333773107693a0ffc38107c9322d12afc6bb0a99 · ms:0 · test-lock-sha256:705cfdb3ac9d887248c42332ff6e0e929de01c1f5ef4986e838f59ed280a2e41 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYWRyLXZlcmlmeS1pc29sYXRpb24udGVzdC5tanMJLS1pbi1wbGFjZSBhcHBsaWVzIHRoZSBtdXRhbnQgaW4gdGhlIGNoZWNrb3V0IGFuZCByZXN0b3JlcyBpdAk1ZGIxNDFhYjUzMGNlYjE0NTc0N2U1Zjk3OTIwMzRhYjNkZDlhNGZmNWY0M2Q4NTU4M2UzZTdhN2UxYzRkOTkzCmJvZHkJdGVzdHMvYWRyLXZlcmlmeS1pc29sYXRpb24udGVzdC5tanMJYSBDdHJsLUMgdG8gdGhlIHdob2xlIGdyb3VwIGR1cmluZyB0aGUgd29ya3RyZWUgYnVpbGQgc3RpbGwgcmVtb3ZlcyB0aGUgd29ya3RyZWUJNTRmYmQzOGRkNjQwM2UyMDg2YmFkOGU3ZjliODg1NTY3ZmFiNWI5OGU4OTIzOGVlNmQxZTU0MzJmOGQxNDIzMApib2R5CXRlc3RzL2Fkci12ZXJpZnktaXNvbGF0aW9uLnRlc3QubWpzCWEgU0lHVEVSTSBkdXJpbmcgdGhlIHdvcmt0cmVlIGJ1aWxkIHN0aWxsIHJlbW92ZXMgdGhlIHdvcmt0cmVlCTZhYjQwN2QyMTI2ZDYyZmNhOWU5YjY1YjQwZjJhYTdmODg1MTJmNzM5NmZlZTA3ZDcyNzg5NmEyMWVlMTM2MmUKYm9keQl0ZXN0cy9hZHItdmVyaWZ5LWlzb2xhdGlvbi50ZXN0Lm1qcwlhIFdpbmRvd3MgZmVuY2Ugd2hvc2Ugam9iIGNvdWxkIG5vdCBiZSBjbG9zZWQgaXMgbm90IGNhbGxlZCBlbmRlZAlmMTliMTFhNjUwY2JiYWIyYTg5MTg1MTkwNTY4YWRiZWI3Yjc4OGViOWNkN2JmYzg1NGRjZWUzMDM2YWNkYmEwCmJvZHkJdGVzdHMvYWRyLXZlcmlmeS1pc29sYXRpb24udGVzdC5tanMJYSBjbGVhbiBmZW5jZSB0aGF0IGZhaWxzIGluIHRoZSB3b3JrdHJlZSBzYXlzIHRoZSB3b3JrdHJlZSBob2xkcyBubyBpZ25vcmVkIGZpbGUsIGFuZCBuYW1lcyAtLWluLXBsYWNlCTFkNDAxOWZkNWUzYTBlOWZjMTgyYjg2NmY3M2U5ZWUwNzBkMDAzYTBmNTM0ZGNkMzJlZGE2ZGM1NThjY2E1MzcKYm9keQl0ZXN0cy9hZHItdmVyaWZ5LWlzb2xhdGlvbi50ZXN0Lm1qcwlhIGZhaWxlZCBydW4ncyBxdW90ZWQgb3V0cHV0IGxlYXZlcyBubyB0cmFpbGluZyB3aGl0ZXNwYWNlIGZvciBnaXQgZGlmZiAtLWNoZWNrCWVkZjgwOGQ2NjJiZTU0N2IyOWVkMThlNjg4ODkzNTYzMjNjNzY4YTA2NjNiYTUzODcxYmM2MzM4YjY2OTcxYTkKYm9keQl0ZXN0cy9hZHItdmVyaWZ5LWlzb2xhdGlvbi50ZXN0Lm1qcwlhIGZlbmNlIGlzIHJlY29yZGVkIGluIGl0cyB3b3JrdHJlZSBiZWZvcmUgaXQgcnVucwlmOWRkZDk3YmQ4MjcwYzFiMjg5YzUwYzQ5NTdjYzgyNzVjOTc4OWMxOWY2YTI0MGE2M2NhZWZmNzI3MzNmNjAwCmJvZHkJdGVzdHMvYWRyLXZlcmlmeS1pc29sYXRpb24udGVzdC5tanMJYSBmZW5jZSBuYW1pbmcgdGhlIGNoZWNrb3V0IHJ1bnMgaW4gcGxhY2UgYW5kIG5hbWVzIHRoZSBwYXRoCWUyNWVkNDQwZWU3MmRlMDVlMzY5ODJmNmI4MmY4MTEwYmZlZGIxZTIzMjU4NjI2M2U4Y2Q1YjQ5YzU2YmQ5YmIKYm9keQl0ZXN0cy9hZHItdmVyaWZ5LWlzb2xhdGlvbi50ZXN0Lm1qcwlhIGZlbmNlJ3MgZ2VuZXJhdGVkIG91dHB1dCBzdGF5cyBpbiB0aGUgd29ya3RyZWUJMjIyOTAzZmE1OTU4N2RlMGJkMGFhOWQxNzNlNjFiZjU4YTMxZWJiZWFlYmQ0ZDNhZTQ1ZjZjMTdiMTc4ZmVlOApib2R5CXRlc3RzL2Fkci12ZXJpZnktaXNvbGF0aW9uLnRlc3QubWpzCWEgZmVuY2UncyBsZWZ0b3ZlciBpbiB0aGUgd29ya3RyZWUgZG9lcyBub3QgbWFyayB0aGUgY2hlY2tvdXQncyByb3dzIGRpcnR5CWM3NWI2N2MyNGQ1MzBjZmE2MzM3MTE4MzNhOTNiNGZmN2I5NTM1ZTY4MDBjODgwYzI3OWYxODU2MDRkMmFkMzIKYm9keQl0ZXN0cy9hZHItdmVyaWZ5LWlzb2xhdGlvbi50ZXN0Lm1qcwlhIGdlbmVyYXRlZCBvdXRwdXQgbGVmdCBieSB0aGUgY2xlYW4gZmVuY2UgaXMgcmVzZXQgYmVmb3JlIHRoZSBtdXRhbnQgZmVuY2UJZTQ2YzlmZDA0YmU2ZTIzMDM4YmYzMmJhODY2OWQ5MWZmNGVmNjVlNGZkYzU2NzMyOGZiYmEwYTY4ZjBkMWU4ZApib2R5CXRlc3RzL2Fkci12ZXJpZnktaXNvbGF0aW9uLnRlc3QubWpzCWEgbXV0YW50IHBsYW4gb3ZlciB0d28gZmlsZXMgcnVucyBpbiB0aGUgd29ya3RyZWUgYW5kIGxlYXZlcyBib3RoIGZpbGVzIGluIHRoZSBjaGVja291dCBhbG9uZQk1ZmNhYjk5ZDNlNWU5NTk2MzdiNDZmMmU1OGU4ZmRiMjE1YWQxOTcyMGI1MDdkYWU4NzBiYTllYzhkN2IzZTRiCmJvZHkJdGVzdHMvYWRyLXZlcmlmeS1pc29sYXRpb24udGVzdC5tanMJYSBtdXRhbnQgcnVuIGxlYXZlcyB0aGUgY2hlY2tvdXQgdW5jaGFuZ2VkIGJ1dCBmb3IgdGhlIHRhc2sgZmlsZSdzIGxvZ3MJN2E4YWE2MmM1NWVjN2NkY2YyMGJmZTljYmJiNjQ5OTNiNDQ1Mzk5ZjllMTFiYTk1MTllNGQ0MGEzYmUxMzY0ZApib2R5CXRlc3RzL2Fkci12ZXJpZnktaXNvbGF0aW9uLnRlc3QubWpzCWEgbXV0YW50IHJ1biBzdG9wcGVkIHdoaWxlIGl0cyBmZW5jZSBydW5zIHJlbW92ZXMgaXRzIHdvcmt0cmVlCTE5OTgwYzBhOWQyZTEwNDliNzJkNTQyMTg4OGM5NGM2ZjYxZWNjZjJjM2IyYzVlOGU0M2YyMDVjYjEzNjRlYjQKYm9keQl0ZXN0cy9hZHItdmVyaWZ5LWlzb2xhdGlvbi50ZXN0Lm1qcwlhIHByb2Nlc3MgYSBmZW5jZSBsZWF2ZXMgcnVubmluZyBpcyBlbmRlZCBiZWZvcmUgaXRzIHdvcmt0cmVlIGdvZXMJYzg4MzNhMzY1ODcxZGM1MzA5NjAwZTRmMzk1YzRlMzdjN2VmN2YxNzQ3OGI0ZWQ1YmZkOTg5ZDcyOTJhNjU0Ngpib2R5CXRlc3RzL2Fkci12ZXJpZnktaXNvbGF0aW9uLnRlc3QubWpzCWEgc2libGluZyBwYXRoIHNoYXJpbmcgdGhlIGNoZWNrb3V0J3MgcHJlZml4IGRvZXMgbm90IGZvcmNlIHRoZSBydW4gaW4gcGxhY2UJZjk1MWE5ODg1OGM0MDhiNmJlMTUwMjEzMzNiZDUxZjljN2Y5OTU1ZjQ1MTk2OTYwNWZjYzZmYzM4Njg0ZjM0Ngpib2R5CXRlc3RzL2Fkci12ZXJpZnktaXNvbGF0aW9uLnRlc3QubWpzCWEgc3RvcHBlZCBtdXRhbnQgcnVuIHJlbW92ZXMgaXRzIHdvcmt0cmVlCWVhYmU4YWRjZWIyZWJlNGFmNWU3M2UwZTAyYWZmZmFjNWRiMDU0MjBiODBjYzlhMGEzMzk0YjU0MmRkOWJlZjgKYm9keQl0ZXN0cy9hZHItdmVyaWZ5LWlzb2xhdGlvbi50ZXN0Lm1qcwlhbiBpc29sYXRlZCBhbmQgYW4gaW4tcGxhY2UgcnVuIHJlY29yZCB0aGUgc2FtZSB2ZXJkaWN0CWVhMTRhZDQxNDYwODU0ZGI3NjQ2ODNlOTNlNDY3Y2ViNjZkNDA3MDVjNTcxNTBiMjFkOTcwY2RmOWE5MzUyMmUKYm9keQl0ZXN0cy9hZHItdmVyaWZ5LWlzb2xhdGlvbi50ZXN0Lm1qcwlvdXRzaWRlIGdpdCB0aGUgbXV0YW50IHJ1bnMgaW4gcGxhY2UgYW5kIHNheXMgd2h5CWVhOWE4ZDJmN2RlYWViZWRkZWFjOTMxZDMzNjhjYjU2OTVjMTRhYTExOGEwNzFlZTJjNDdhNGYyZjA4ODU5ZDcKYm9keQl0ZXN0cy9hZHItdmVyaWZ5LWlzb2xhdGlvbi50ZXN0Lm1qcwl0aGUgY2hlY2tvdXQncyBwYXRoIGlzIGZvdW5kIGF0IGEgc2hlbGwgYm91bmRhcnksIGFuZCBub3QgaW5zaWRlIGFub3RoZXIgcGF0aAlkZjIwYjBjNDk4ZjNkZGZhZjExOTNlMDU1NWE1YTA1YmM1MTM2MjEwMjkxYTlhMzdhM2ZjNTU1ZWE2MzU1NDQ3CmJvZHkJdGVzdHMvYWRyLXZlcmlmeS1pc29sYXRpb24udGVzdC5tanMJdGhlIGNoZWNrb3V0J3MgcGF0aCBpcyBmb3VuZCBpbiBpdHMgV2luZG93cyBzcGVsbGluZ3Mgb24gYW55IGhvc3QJOGNhNDY4MGFlYjNhZDFmZjU4ZWI1ZGM5MzBlNDdiZTBhOTE5Y2RiNWQ2OGY2NWFhMGIxNDU5MTI0YTRmN2U2NApib2R5CXRlc3RzL2Fkci12ZXJpZnktaXNvbGF0aW9uLnRlc3QubWpzCXRoZSB3b3JrdHJlZSBidWlsZGVyIHJ1bnMgb3V0c2lkZSB0aGUgcHJvY2VzcyBncm91cCBvZiB0aGUgZ2F0ZSB0aGF0IHN0YXJ0ZWQgaXQJMjlkNmRhODU0Mzk0MjIwYzdkMWZjYWU3MTdhYjU4NzdjZWYzOWY5NjdhMjE1ZmY2MGU4Mzk3ZjEyNWIxNDkxMQ · test-lock-kind:replace
