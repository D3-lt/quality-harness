# Task ADR-080-T1: The artifact pass runs behind the boundary, writes its own ledger, and resumes

**Depends-on:** none
**Covers:** F-1, F-2, F-3, F-4, F-7, F-8, UC1-S1, UC1-S2, UC1-S3, UC1-S4, UC3-S1, UC3-S2
**Estimated scope:** L (the hook, the pass, the lock, seven tests, four test helpers)
**Owner:** unassigned
**Produces:** the `pass.gated` ledger line
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a boundary starts a pass and returns`, `the lock is claimed exclusively and reclaimed by deadline`, `a verdict and its findings are one ledger line`, `a pass that cannot start is said`

## Goal

At every boundary, `artifactRule` starts one detached pass per session instead of gating in line. The pass writes only its own ledger, a verdict and its findings on one line, and a stopped pass is resumed after its deadline (ADR-080 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `artifactRule` claims the lock and starts the pass; `--artifact-pass` runs it; the request; the `inline` seam; the boundary-time import of `pass.gated` so the targets exclude what the ledger answered; UNRUN when it cannot start |
| `plugin/scripts/run-shell-hook.mjs` | edit | the batch reports each path as it finishes, so the pass writes each line as it lands |
| `tests/artifact-pass-behind.test.mjs` | edit | remove `todo` from this task's seven tests |
| `tests/artifact-key.test.mjs`, `tests/evidence-flip.test.mjs`, `tests/late-baseline.test.mjs`, `tests/observed-events.test.mjs` | edit | their hook environment helpers select `QUALITY_HARNESS_ARTIFACT_PASS_RUNNER=inline`; no locked test body changes |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Remove `todo` from the seven tests in this task's Tests table and record the red run (TDD red). [proof: acceptance]
2. [S2] Split `artifactRule`: the targets stay in the hook, minus paths the ledger answered completely; when any remain, claim the lock (exclusive create; rename aside a lock past its deadline, then create) and spawn the runner detached with `stdio: 'ignore'`, `windowsHide` and `unref`.
3. [S3] `--artifact-pass <request>`: write `pass.started`, take the machine lease, run the batch with the remaining budget, append one `pass.gated` line per path with its findings as it lands, then `pass.ended`; delete the lock only while it holds this token.
4. [S4] The `inline` value of the runner seam awaits the same pass in-process; set it in the four test files' hook environment helpers, and confirm with `python3 scripts/test-locks.py` that no locked body moved. [proof: human: test-locks reports every lock on the four files unmoved, and the selftest passes]
5. [S5] A runner that does not exist, or a spawn that fails, releases the lock and queues an UNRUN line.
6. [S6] Replay the adopter session (a local clone with its 422 KB log) and record the commit's PreToolUse time before and after in the commit message. [proof: human: the session reads the two timings]
7. [S7] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/artifact-pass-behind.test.mjs 2>&1 | tee "$T" && for t in 'no boundary waits for the artifact pass' 'one artifact pass runs per session at a time' 'a stopped pass resumes with exactly the paths it did not reach' 'a pass that cannot start is said, not silent' 'the pass writes only its own ledger' 'the unchecked advisory is said once per tree and check state' 'a refused publish is denied every time'; do test "$(grep -cxE "ok [0-9]+ - $t" "$T")" -eq 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `no boundary waits for the artifact pass` | `tests/artifact-pass-behind.test.mjs` | each of five boundaries returns while the runner is blocked; no verdict in the session log | F-1, UC1-S1 | S2 |
| `one artifact pass runs per session at a time` | `tests/artifact-pass-behind.test.mjs` | two concurrent boundaries start one pass; a lock past its deadline with a live pid is reclaimed | F-2, UC1-S2 | S2 |
| `a stopped pass resumes with exactly the paths it did not reach` | `tests/artifact-pass-behind.test.mjs` | the next pass's targets equal the unanswered set exactly | F-4, UC1-S3 | S2, S3 |
| `a pass that cannot start is said, not silent` | `tests/artifact-pass-behind.test.mjs` | UNRUN, and no lock left | F-7, UC1-S4 | S5 |
| `the pass writes only its own ledger` | `tests/artifact-pass-behind.test.mjs` | the shipped pass gates each path once; the session log is untouched while it runs | F-3 | S3 |
| `the unchecked advisory is said once per tree and check state` | `tests/artifact-pass-behind.test.mjs` | held: once per key, again after a failed check and after a change | F-8, UC3-S1 | S2 |
| `a refused publish is denied every time` | `tests/artifact-pass-behind.test.mjs` | held: `permissionDecision` is `deny` on both attempts | F-8, UC3-S2 | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the seven tests |
| 2 — something selects it | the three `artifactRule` callers in the lifecycle hook |
| 3 — the caller can discover it | the ledger and lock under `.git/quality-harness/passes/` |
| 4 — it is used | every adopter commit, turn end and compaction |

## Mutation Log
- 2026-10-01 · 9ed651c* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a boundary starts a pass and returns: every pass forced in-process, so the boundary waits on it · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1
- 2026-10-01 · 9ed651c* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the lock is claimed exclusively and reclaimed by deadline: a held lock is reclaimed before its deadline · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1
- 2026-10-01 · 9ed651c* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a verdict and its findings are one ledger line: the verdict line drops its findings · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1
- 2026-10-01 · 9ed651c* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a pass that cannot start is said: a missing runner is released in silence · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1
- 2026-10-01 · 9ed651c* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a boundary starts a pass and returns: every pass forced in-process, so the boundary waits on it · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1 · covers:a boundary starts a pass and returns
- 2026-10-01 · 9ed651c* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the lock is claimed exclusively and reclaimed by deadline: a held lock is reclaimed before its deadline · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1 · covers:the lock is claimed exclusively and reclaimed by deadline
- 2026-10-01 · 9ed651c* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a verdict and its findings are one ledger line: the verdict line drops its findings · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1 · covers:a verdict and its findings are one ledger line
- 2026-10-01 · 9ed651c* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a pass that cannot start is said: a missing runner is released in silence · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1 · covers:a pass that cannot start is said
- 2026-10-01 · 9ed651c* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the lock is claimed exclusively and reclaimed by deadline: a held lock is reclaimed before its deadline (after the code review) · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1 · covers:the lock is claimed exclusively and reclaimed by deadline
- 2026-10-01 · 9ed651c* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a verdict and its findings are one ledger line: the verdict line drops its findings (after the code review) · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1 · covers:a verdict and its findings are one ledger line

## Invariants

- What is gated, and each finding's severity, are unchanged (ADR-060).
- The publish refusal (ADR-061) is unchanged, and the pass never writes the session log.
- No locked test body changes.

## Risks

- A test that waits on a detached pass is timing-dependent; each wait has a deadline and asserts an end state, never a duration.

## Stop Condition

Stop and ask if the pass cannot be detached on a platform CI runs, if a locked test needs its body changed, or if the publish refusal's verdict changes in any test.

## Out of Scope

- Importing and saying findings at every hook — T2.

## Verification Log
- 2026-10-01 · 9ed651c* · exit 1 · `set -o pipefail …` · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1 · ms:119878 · test-lock-sha256:6373f67f2ee58087440d8d760daabc46ffbf5e722780960c51ae08186d5b1a2a · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYXJ0aWZhY3QtcGFzcy1iZWhpbmQudGVzdC5tanMJYSBwYXNzIHRoYXQgY2Fubm90IHN0YXJ0IGlzIHNhaWQsIG5vdCBzaWxlbnQJNzI4MmI2MTQ5MGRhMGU5M2Y4NjAzYWFiNjllODczYWQzNzg4Mjg1MWI3NjA2ZWIyNTI2ZjI5YjQzMjZjZTBjMgpib2R5CXRlc3RzL2FydGlmYWN0LXBhc3MtYmVoaW5kLnRlc3QubWpzCWEgcGFzcydzIGZpbmRpbmdzIHJlYWNoIHRoZSBuZXh0IGhvb2sgb25jZSwgd2hpbGUgdGhlIHBhc3Mgc3RpbGwgcnVucwk4ZDIzNDVjODFmNTY4YmM3ZmNmOTEyNTliYjVhZGViNDhmNGEyMGE1YjA0ZTQ3NmVhN2ExNDU3MDcxYjdkYmZkCmJvZHkJdGVzdHMvYXJ0aWZhY3QtcGFzcy1iZWhpbmQudGVzdC5tanMJYSByZWFkLW9ubHkgcmV2aWV3ZXIgbmVpdGhlciBpbXBvcnRzIG5vciBkZWxpdmVycyBhIHBhc3MgZmluZGluZwk1YmViYzQxYzhlNzUzNzkxNDY1MDNjM2U2MDkwYzE1ZmRjOGY2MzE4YmQ4YTEyOTE5YTM3YzZlZTU2OTEwMWQyCmJvZHkJdGVzdHMvYXJ0aWZhY3QtcGFzcy1iZWhpbmQudGVzdC5tanMJYSByZWZ1c2VkIHB1Ymxpc2ggaXMgZGVuaWVkIGV2ZXJ5IHRpbWUJMzc3N2Y5NDU0NTAyMGJiYTE3MjMzYjk2ODA3YTJlYWU3MDdlMzcxZTIxMjBmMjExNjQzZWRlY2E0ZGJlYjRlNwpib2R5CXRlc3RzL2FydGlmYWN0LXBhc3MtYmVoaW5kLnRlc3QubWpzCWEgc3RvcHBlZCBwYXNzIHJlc3VtZXMgd2l0aCBleGFjdGx5IHRoZSBwYXRocyBpdCBkaWQgbm90IHJlYWNoCTIzNmQ4Y2Y5OGI0NzhhMGJiMThlNGFjZTU2ZDQwYTE4NTA5OTVmMDU3M2U4MWMzYmNjNTI4NzIwMDkwNjEzYmYKYm9keQl0ZXN0cy9hcnRpZmFjdC1wYXNzLWJlaGluZC50ZXN0Lm1qcwlubyBib3VuZGFyeSB3YWl0cyBmb3IgdGhlIGFydGlmYWN0IHBhc3MJNzgzMjQ1ODQ1MzBiYTQ1ZThkNDRmNzg3NzM2YTUzNGQyNzcyOGI2YWViNDJlYWI0MzM5OTgwYzcwMmZlYzc4Mwpib2R5CXRlc3RzL2FydGlmYWN0LXBhc3MtYmVoaW5kLnRlc3QubWpzCW9uZSBhcnRpZmFjdCBwYXNzIHJ1bnMgcGVyIHNlc3Npb24gYXQgYSB0aW1lCTkzYWRjNjFhMDRiMjA1OTgyOTJjMTJlMzc1YzQ0YmYyZTIwYTYzMjdiNWQ4MWQ3N2Q2MDNlYzlmYWIwMzgzYmEKYm9keQl0ZXN0cy9hcnRpZmFjdC1wYXNzLWJlaGluZC50ZXN0Lm1qcwl0aGUgcGFzcyB3cml0ZXMgb25seSBpdHMgb3duIGxlZGdlcgk1ZmU0NmUxZDI4YWNmOGQxZmI2NWI0Mzc4NTEwZDdhMGJiNTA5MTMwNGIyM2ZkNGY3ZDE2ZDgwZjVmYzc1NmY0CmJvZHkJdGVzdHMvYXJ0aWZhY3QtcGFzcy1iZWhpbmQudGVzdC5tanMJdGhlIHVuY2hlY2tlZCBhZHZpc29yeSBpcyBzYWlkIG9uY2UgcGVyIHRyZWUgYW5kIGNoZWNrIHN0YXRlCTJhMmVjODBjNmZiNGIyNTA0M2VkZGI4Mjc1NWQzZWRhMTBlYTBmYzc1OGQyZmRmMzZiYzA2NTZhNTNjYjBlMTY
  ```
  --- last 10 line(s) of stdout (of 222 after folding 222 raw)
    ...
  1..9
  # tests 9
  # suites 0
  # pass 2
  # fail 5
  # cancelled 0
  # skipped 0
  # todo 2
  # duration_ms 119769.532916
  ```
- 2026-10-01 · 9ed651c* · exit 0 · `set -o pipefail …` · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1 · ms:16677
- 2026-10-01 · 9ed651c* · exit 0 · `set -o pipefail …` · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1 · ms:17890
- 2026-10-01 · 9ed651c* · exit 0 · `set -o pipefail …` · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1 · ms:18061
- 2026-10-01 · 9ed651c* · exit 0 · `set -o pipefail …` · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1 · ms:16857
- 2026-10-01 · 9ed651c* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1 · ms:0 · test-lock-sha256:27b607ac4b10ebe97db2504e203b5a6e9ab2e770ac5f6cb44f7b5247df348064 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYXJ0aWZhY3QtcGFzcy1iZWhpbmQudGVzdC5tanMJYSBwYXNzIHRoYXQgY2Fubm90IHN0YXJ0IGlzIHNhaWQsIG5vdCBzaWxlbnQJNzI4MmI2MTQ5MGRhMGU5M2Y4NjAzYWFiNjllODczYWQzNzg4Mjg1MWI3NjA2ZWIyNTI2ZjI5YjQzMjZjZTBjMgpib2R5CXRlc3RzL2FydGlmYWN0LXBhc3MtYmVoaW5kLnRlc3QubWpzCWEgcGFzcydzIGZpbmRpbmdzIHJlYWNoIHRoZSBuZXh0IGhvb2sgb25jZSwgd2hpbGUgdGhlIHBhc3Mgc3RpbGwgcnVucwk4ZDIzNDVjODFmNTY4YmM3ZmNmOTEyNTliYjVhZGViNDhmNGEyMGE1YjA0ZTQ3NmVhN2ExNDU3MDcxYjdkYmZkCmJvZHkJdGVzdHMvYXJ0aWZhY3QtcGFzcy1iZWhpbmQudGVzdC5tanMJYSByZWFkLW9ubHkgcmV2aWV3ZXIgbmVpdGhlciBpbXBvcnRzIG5vciBkZWxpdmVycyBhIHBhc3MgZmluZGluZwk1YmViYzQxYzhlNzUzNzkxNDY1MDNjM2U2MDkwYzE1ZmRjOGY2MzE4YmQ4YTEyOTE5YTM3YzZlZTU2OTEwMWQyCmJvZHkJdGVzdHMvYXJ0aWZhY3QtcGFzcy1iZWhpbmQudGVzdC5tanMJYSByZWZ1c2VkIHB1Ymxpc2ggaXMgZGVuaWVkIGV2ZXJ5IHRpbWUJMzc3N2Y5NDU0NTAyMGJiYTE3MjMzYjk2ODA3YTJlYWU3MDdlMzcxZTIxMjBmMjExNjQzZWRlY2E0ZGJlYjRlNwpib2R5CXRlc3RzL2FydGlmYWN0LXBhc3MtYmVoaW5kLnRlc3QubWpzCWEgc3RvcHBlZCBwYXNzIHJlc3VtZXMgd2l0aCBleGFjdGx5IHRoZSBwYXRocyBpdCBkaWQgbm90IHJlYWNoCThkMzUyNTBlYjRiZjdjNGVhYzExZjZkN2E2OWIwODgyZGUxMjdjNWU0Y2M5NDYxNGJjNjA2ZGJhZDI4ZmVlMjUKYm9keQl0ZXN0cy9hcnRpZmFjdC1wYXNzLWJlaGluZC50ZXN0Lm1qcwlubyBib3VuZGFyeSB3YWl0cyBmb3IgdGhlIGFydGlmYWN0IHBhc3MJNzgzMjQ1ODQ1MzBiYTQ1ZThkNDRmNzg3NzM2YTUzNGQyNzcyOGI2YWViNDJlYWI0MzM5OTgwYzcwMmZlYzc4Mwpib2R5CXRlc3RzL2FydGlmYWN0LXBhc3MtYmVoaW5kLnRlc3QubWpzCW9uZSBhcnRpZmFjdCBwYXNzIHJ1bnMgcGVyIHNlc3Npb24gYXQgYSB0aW1lCTkzYWRjNjFhMDRiMjA1OTgyOTJjMTJlMzc1YzQ0YmYyZTIwYTYzMjdiNWQ4MWQ3N2Q2MDNlYzlmYWIwMzgzYmEKYm9keQl0ZXN0cy9hcnRpZmFjdC1wYXNzLWJlaGluZC50ZXN0Lm1qcwl0aGUgcGFzcyB3cml0ZXMgb25seSBpdHMgb3duIGxlZGdlcgk1ZWZmNzk3OWFmYTMwZGIxNGMyMGNlZDI2MGM2ODBiNzk0Y2NhZmExZTk2YTJkYWI5ZTJjYjMwM2EyODk0ZDg0CmJvZHkJdGVzdHMvYXJ0aWZhY3QtcGFzcy1iZWhpbmQudGVzdC5tanMJdGhlIHVuY2hlY2tlZCBhZHZpc29yeSBpcyBzYWlkIG9uY2UgcGVyIHRyZWUgYW5kIGNoZWNrIHN0YXRlCTJhMmVjODBjNmZiNGIyNTA0M2VkZGI4Mjc1NWQzZWRhMTBlYTBmYzc1OGQyZmRmMzZiYzA2NTZhNTNjYjBlMTY · test-lock-kind:replace
- 2026-10-01 · 9ed651c* · exit 0 · `set -o pipefail …` · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1 · ms:18698
- 2026-10-01 · 9ed651c* · exit 0 · `set -o pipefail …` · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1 · ms:18076
- 2026-10-01 · 9ed651c* · exit 0 · `set -o pipefail …` · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1 · ms:18935
- 2026-10-01 · 9ed651c* · exit 0 · `set -o pipefail …` · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1 · ms:16734
- 2026-10-01 · human-observed · observed and signed off. S4: no locked test body was edited; the four files select the inline runner through their helper environments only, and the selftest, which lints every record and its test locks, passed under qh-check on 2026-10-01. S6: a commit's PreToolUse replayed over an adopter's real 422 KB session log on a local clone took 44287 ms at 9ed651c (in line) and 164 ms with the pass behind; that detached pass then gated all 217 targets in 93 s, in one pass.
- 2026-10-01 · 9ed651c* · exit 0 · `set -o pipefail …` · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1 · ms:17120
- 2026-10-01 · 9ed651c* · exit 0 · `set -o pipefail …` · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1 · ms:17448
- 2026-10-01 · 7f0fd0f* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:c0911885613e6c903b9e5e82905085d64a23c5d4a079c1318789c9ea4b0298a1 · ms:0 · test-lock-sha256:2e3904fee2419db2b4bbeba2f9ea0d0eff25a30b058542781cf9eeb6ac8af5cc · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYXJ0aWZhY3QtcGFzcy1iZWhpbmQudGVzdC5tanMJYSBiYXRjaCB0aGF0IHN0b3BwZWQgb24gdW5jb25maXJtZWQgY2xlYW51cCBzdG9wcyB0aGUgd2hvbGUgcGFzcwk3ODM5YjY0YWEyY2ExN2IyOGNiYTdiMTgwZmY5ZjZkZjBiZTA1MTdjOTdhOGVmNDIwMWY0MjI0MmRkYmRlOTZjCmJvZHkJdGVzdHMvYXJ0aWZhY3QtcGFzcy1iZWhpbmQudGVzdC5tanMJYSBwYXNzIHJlbGVhc2VzIGl0cyBsb2NrIGJlZm9yZSBpdHMgZGVhZGxpbmUsIGFuZCBuZXZlciBhZnRlcglhNDA5NGNmYmVmMzhlZDJlYzEwMGI4MzhjZjVmY2Y0MzY5OTM5OGRmYjVmNWY0YjNiZTg0MDNkODgwYWZjN2M0CmJvZHkJdGVzdHMvYXJ0aWZhY3QtcGFzcy1iZWhpbmQudGVzdC5tanMJYSBwYXNzIHRoYXQgY2Fubm90IHN0YXJ0IGlzIHNhaWQsIG5vdCBzaWxlbnQJNzI4MmI2MTQ5MGRhMGU5M2Y4NjAzYWFiNjllODczYWQzNzg4Mjg1MWI3NjA2ZWIyNTI2ZjI5YjQzMjZjZTBjMgpib2R5CXRlc3RzL2FydGlmYWN0LXBhc3MtYmVoaW5kLnRlc3QubWpzCWEgcGFzcyB0aGF0IGxlYXZlcyBubyBlbmQgaW4gaXRzIGxlZGdlciBpcyBzYWlkIFVOUlVOCTRlZTM0YjEwYzZmYjJmNWM1M2Q0MzNkMTc5Yjc3MTE3MmVmY2QyNmE2MmFmYzlmMThkMWIwNzZlMTY3MWFiODgKYm9keQl0ZXN0cy9hcnRpZmFjdC1wYXNzLWJlaGluZC50ZXN0Lm1qcwlhIHBhc3MncyBmaW5kaW5ncyByZWFjaCB0aGUgbmV4dCBob29rIG9uY2UsIHdoaWxlIHRoZSBwYXNzIHN0aWxsIHJ1bnMJOGQyMzQ1YzgxZjU2OGJjN2ZjZjkxMjU5YmI1YWRlYjQ4ZjRhMjBhNWIwNGU0NzZlYTdhMTQ1NzA3MWI3ZGJmZApib2R5CXRlc3RzL2FydGlmYWN0LXBhc3MtYmVoaW5kLnRlc3QubWpzCWEgcmVhZC1vbmx5IHJldmlld2VyIG5laXRoZXIgaW1wb3J0cyBub3IgZGVsaXZlcnMgYSBwYXNzIGZpbmRpbmcJNWJlYmM0MWM4ZTc1Mzc5MTQ2NTAzYzNlNjA5MGMxNWZkYzhmNjMxOGJkOGExMjkxOWEzN2M2ZWU1NjkxMDFkMgpib2R5CXRlc3RzL2FydGlmYWN0LXBhc3MtYmVoaW5kLnRlc3QubWpzCWEgcmVmdXNlZCBwdWJsaXNoIGlzIGRlbmllZCBldmVyeSB0aW1lCTcwYTlhZGRmZTNkYmE3Yzk4MWFjYmYzZjExNzRkZTliOTY3YzYyODA4NWYwNGRmODVmZjQwYzFhYzg1YTY5ZjQKYm9keQl0ZXN0cy9hcnRpZmFjdC1wYXNzLWJlaGluZC50ZXN0Lm1qcwlhIHN0b3BwZWQgcGFzcyByZXN1bWVzIHdpdGggZXhhY3RseSB0aGUgcGF0aHMgaXQgZGlkIG5vdCByZWFjaAk4ZDM1MjUwZWI0YmY3YzRlYWMxMWY2ZDdhNjliMDg4MmRlMTI3YzVlNGNjOTQ2MTRiYzYwNmRiYWQyOGZlZTI1CmJvZHkJdGVzdHMvYXJ0aWZhY3QtcGFzcy1iZWhpbmQudGVzdC5tanMJYSB0aW1lb3V0IHNhaWQgZmlyc3QgZG9lcyBub3Qgc2lsZW5jZSBhIGxhdGVyIGZpbmRpbmcgYWJvdXQgdGhlIHNhbWUgYnl0ZXMJNDZjYjc4NzBkNzRhNTE1ZGY4NjZjZGNhZDk4ZThlMzY1ODBkYTE3ZGRkMmM1M2VlMjc4OWVhNTllY2ZjYTJlMQpib2R5CXRlc3RzL2FydGlmYWN0LXBhc3MtYmVoaW5kLnRlc3QubWpzCW5vIGJvdW5kYXJ5IHdhaXRzIGZvciB0aGUgYXJ0aWZhY3QgcGFzcwk3ODMyNDU4NDUzMGJhNDVlOGQ0NGY3ODc3MzZhNTM0ZDI3NzI4YjZhZWI0MmVhYjQzMzk5ODBjNzAyZmVjNzgzCmJvZHkJdGVzdHMvYXJ0aWZhY3QtcGFzcy1iZWhpbmQudGVzdC5tanMJb25lIGFydGlmYWN0IHBhc3MgcnVucyBwZXIgc2Vzc2lvbiBhdCBhIHRpbWUJOTNhZGM2MWEwNGIyMDU5ODI5MmMxMmUzNzVjNDRiZjJlMjBhNjMyN2I1ZDgxZDc3ZDYwM2VjOWZhYjAzODNiYQpib2R5CXRlc3RzL2FydGlmYWN0LXBhc3MtYmVoaW5kLnRlc3QubWpzCXRoZSBwYXNzIHdyaXRlcyBvbmx5IGl0cyBvd24gbGVkZ2VyCTVlZmY3OTc5YWZhMzBkYjE0YzIwY2VkMjYwYzY4MGI3OTRjY2FmYTFlOTZhMmRhYjllMmNiMzAzYTI4OTRkODQKYm9keQl0ZXN0cy9hcnRpZmFjdC1wYXNzLWJlaGluZC50ZXN0Lm1qcwl0aGUgdW5jaGVja2VkIGFkdmlzb3J5IGlzIHNhaWQgb25jZSBwZXIgdHJlZSBhbmQgY2hlY2sgc3RhdGUJMmEyZWM4MGM2ZmI0YjI1MDQzZWRkYjgyNzU1ZDNlZGExMGVhMGZjNzU4ZDJmZGYzNmJjMDY1NmE1M2NiMGUxNgpib2R5CXRlc3RzL2FydGlmYWN0LXBhc3MtYmVoaW5kLnRlc3QubWpzCXR3byBjbGFpbWFudHMgb2Ygb25lIHN0YWxlIGxvY2s6IGV4YWN0bHkgb25lIGhvbGRzIGl0CWNmNTVhZTU0MjA0M2JiMmIyMDc2ODQzOGY4YzViNDNmYTE0NDg4NTZmZGIxZmE1MWEwMzhhYTk3MzljYTUxYWQ · test-lock-kind:replace
