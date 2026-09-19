# Task ADR-060-T6: Artifacts and notes read observed changes

**Depends-on:** T5
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** rule A, the deletion bases and the observing notes
**Consumes:** `observe(cwd)`, the state directory, the session event log and delivery (T1); rule P (T4); rules R1, R2 and R4, the ledger and the statusline (T5); `tests/observed-events.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `rule A over committed and uncommitted paths`, `a complete per-path gate result`, `an incomplete pass retried`, `the deletion bases in both lookup paths`, `the per-hook artifact budget`, `A independent of the check opt-in`, `PreCompact and SessionEnd observing first`, `each named test actually running`

## Goal

Rule A replaces the old artifact calls. It runs the artifact gates over the paths changed since `session.started` (committed, uncommitted and observable Edit/Write), leaving out a path only when its current blob has a complete `artifact.gated` result. The per-edit gate and A both append those results; a timeout, `UNRUN` or `UNPROVEN` is not complete, so the next boundary retries that path. Deleted paths are looked up in the first HEAD, then HEAD, through both the batch and the single-file lookup, within each hook's budget. PreCompact and SessionEnd observe before they write, and the notes read the log.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/observed-events.test.mjs` | edit | the two tests below |
| `plugin/scripts/lifecycle.mjs` | edit | rule A and its `artifact.gated` events; the old pre-publish and completion artifact calls go; `runArtifactGates` sets `QUALITY_HARNESS_HISTORY_BASES`; PreCompact, SessionEnd, `sessionStateNote` and `previousSessionNotice` read the log |
| `tests/mutations.json` | edit | entries whose `from` lives in the removed artifact calls or the old note inputs are retired |
| `plugin/scripts/run-shell-hook.mjs` | edit | `archiveHistory` looks up each base in order instead of `HEAD`; after the per-edit gate it appends `artifact.gated` for the edited path and blob, `complete` only when the gate returned a verdict |
| `plugin/scripts/facts-gate-dispatch.sh` | edit | the archive lookup reads the bases in order instead of `HEAD` |
| `plugin/scripts/event-log.mjs` | create | found while implementing: the per-edit gate must append `artifact.gated`, and `run-shell-hook.mjs` importing `lifecycle.mjs` — which imports it — would be a module cycle. The state directory, the log and `contentId` move to a leaf both import; `lifecycle.mjs` re-exports them |
| `tests/hook-work.test.mjs`, `tests/staged-product.test.mjs` | edit | found by the selftest: their staged partial plugins copy the runner, so they now copy `event-log.mjs` and `git-directory.mjs` too; the batch's stdout carries the per-path results, so the probe's own report is its last line |
| `tests/performance-trace.test.mjs` | edit | found by the selftest: the budget message names its paths `UNRUN` |

## Ordered Steps

1. [S1] Write the two tests and see them fail on an assertion (TDD red).
2. [S2] Implement rule A at turn, task and subagent end, `context.compacting` and `publish.requested`, as in ADR-060's Decision: its paths, the complete-result skip, per-path `artifact.gated` events, the 45/20/90-second budgets with `UNRUN` for what the budget left, and the key `(A, tree, gate output hash)`. Make the per-edit hook append its `artifact.gated` result. Remove the old artifact calls.
3. [S3] Pass the first HEAD and HEAD through `QUALITY_HARNESS_HISTORY_BASES`, and read them in order in `archiveHistory` and in `facts-gate-dispatch.sh`, defaulting to `HEAD` when unset.
4. [S4] Observe at PreCompact and SessionEnd before their notes and ledger rows, and point the note functions at the log.
5. [S5] Run the fence green and record mutants:
   - use only uncommitted paths;
   - gate A on the check;
   - read `HEAD` in `archiveHistory`;
   - read `HEAD` in `facts-gate-dispatch.sh`;
   - skip a path whose `artifact.gated` result is incomplete;
   - record a budget-cut path as complete;
   - read the note from the last Stop observation.

   [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(a committed artifact is still validated|a compaction note sees the latest edit|an untracked directory is gated by the files in it, never as a directory|the harness does not observe its own ledger)$' tests/observed-events.test.mjs 2>&1) \
  || { printf '%s\n' "$out"; exit 1; }
for name in 'a committed artifact is still validated' 'a compaction note sees the latest edit' 'an untracked directory is gated by the files in it, never as a directory' 'the harness does not observe its own ledger'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { printf '%s\n' "$out"; echo "did not run: $name"; exit 1; }; done \
  && node --test tests/lifecycle.test.mjs tests/staged-product.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a committed artifact is still validated` | `tests/observed-events.test.mjs` | Temp repository without a check.<br>• A malformed record under `docs/adr/` written by Bash and committed before Stop gets A's message; uncommitted, it does too.<br>• A frozen archive whose records AND catalog are retired in this session: with the session's first HEAD the gate reaches `adr-retire-check`, and at HEAD alone the same paths are `UNPROVEN: could not classify` and not complete. The single-path case drives the dispatcher's own lookup, since two paths take the batch history read. ⚠ **Corrected during execution.** This cell said the deletions produce NO finding through the batch lookup; measured, a catalog still at HEAD makes both lookups agree and report nothing, so the base decides nothing there, and once the catalog is gone the answer is a verdict rather than silence.<br>• A malformed record written with Edit is reported by the per-edit gate and not again at Stop. When that gate times out instead, Stop gates the record.<br>• A second Stop with every path complete runs no gates.<br>• With a PreCompact budget of zero, the message names the unchecked paths as `UNRUN`, and the next Stop gates them. | — | S1, S2, S3 |
| `a compaction note sees the latest edit` | `tests/observed-events.test.mjs` | SessionStart, an edit, then PreCompact with no Stop between: the note names the edit and not a clean state; the same for SessionEnd's ledger row | — | S1, S4 |

## Reachability
| `an untracked directory is gated by the files in it, never as a directory` | `tests/observed-events.test.mjs` | found by a peer session's test of this branch, 2026-09-18: `git status --porcelain` collapses an untracked directory to `name/`, the dispatcher cannot classify a directory, and its UNPROVEN is not a verdict — so the path was retried, and the message repeated, at every boundary. `-uall` lists the files instead | — | S1, S2 |
| `the harness does not observe its own ledger` | `tests/observed-events.test.mjs` | the same test run: with `CLAUDE_PLUGIN_DATA` inside the repository, the claims ledger appeared as a changed path AND moved the tree, so the same finding was made again with a new key. The observation and the status list exclude it. (Named without an apostrophe: the fence quotes each test name in a shell string, and `'` inside one ends it — the first spelling made `node --test` refuse the pattern) | — | S1, S2 |

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | the hooks route to rule A and the note writers, and `runArtifactGates` hands the bases to both lookups; the tests drive them as processes; S5's mutants break each |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | every artifact change and every compaction |

## Mutation Log
- 2026-09-18 · 36a7d7d* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · rule A uses only uncommitted paths, so a record committed during the session is never gated · acceptance-sha256:b8255ef1e3dad7644c030b0d3500d592b795195e74e3c33b849d699cd39fe0a2
- 2026-09-18 · 36a7d7d* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · rule A is gated on the check opt-in, so a project that named no check has its records ungated · acceptance-sha256:b8255ef1e3dad7644c030b0d3500d592b795195e74e3c33b849d699cd39fe0a2
- 2026-09-18 · 36a7d7d* · mutant killed · exit 1 · `plugin/scripts/run-shell-hook.mjs` · the batch archive lookup reads HEAD, so a catalog retired this session cannot be found · acceptance-sha256:b8255ef1e3dad7644c030b0d3500d592b795195e74e3c33b849d699cd39fe0a2
- 2026-09-18 · 36a7d7d* · mutant survived · exit 0 · `plugin/scripts/facts-gate-dispatch.sh` · the dispatcher's own lookup reads HEAD, so a single deleted record cannot be classified · acceptance-sha256:b8255ef1e3dad7644c030b0d3500d592b795195e74e3c33b849d699cd39fe0a2
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-09-18 · 36a7d7d* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · an incomplete gate result skips the path, so a timed-out per-edit gate leaves a record ungated · acceptance-sha256:b8255ef1e3dad7644c030b0d3500d592b795195e74e3c33b849d699cd39fe0a2
- 2026-09-18 · 36a7d7d* · mutant killed · exit 1 · `plugin/scripts/facts-gate-dispatch.sh` · the dispatcher's own lookup reads HEAD, so a single deleted record cannot be classified · acceptance-sha256:b8255ef1e3dad7644c030b0d3500d592b795195e74e3c33b849d699cd39fe0a2
- 2026-09-18 · 36a7d7d* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a path the budget cut is recorded as gated, so the next boundary never retries it · acceptance-sha256:b8255ef1e3dad7644c030b0d3500d592b795195e74e3c33b849d699cd39fe0a2
- 2026-09-18 · 36a7d7d* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the note reads the last Stop's observation instead of this hook's, so a compaction mid-turn reports stale state · acceptance-sha256:b8255ef1e3dad7644c030b0d3500d592b795195e74e3c33b849d699cd39fe0a2
- 2026-09-18 · 870fbaa* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · status collapses an untracked directory again, so a directory reaches the artifact gates · acceptance-sha256:d8ec8ca8858d2c3c608bb8b9cab60226fa5be5b856af797a54f8f789daa0de51
- 2026-09-18 · 870fbaa* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the observation takes in the harness's own ledger, so its own write moves the tree it is watching · acceptance-sha256:d8ec8ca8858d2c3c608bb8b9cab60226fa5be5b856af797a54f8f789daa0de51

## Invariants

- `facts-gate-dispatch.sh`'s exit-code contract is unchanged, and it reads `HEAD` when no bases are given.
- A has no check gate.
- Every `tests/mutations.json` entry matches exactly once after this task.
- Stop now runs the artifact gates, which it did not before this task: rule A's boundaries include the turn end (ADR-060's Decision), so `Stop stays Node-only while strict completion boundaries run artifact gates` is deleted rather than kept.
- The artifact batch's stdout carries one `{"gated": path, "complete": bool}` line per path; its findings stay on stderr.

## Risks

- Artifact gates at hook boundaries add work; the complete-result skip and the budgets bound it.

## Stop Condition

Stop and ask if the dispatcher cannot take deletion bases without changing its contract.

## Out of Scope

- New artifact gate kinds (permanent: boundary: this task changes their inputs, not the gates)

## Verification Log
- 2026-09-18 · 36a7d7d* · exit 1 · `set -o pipefail …` · acceptance-sha256:b8255ef1e3dad7644c030b0d3500d592b795195e74e3c33b849d699cd39fe0a2 · ms:735 · test-lock-sha256:9c0fe2fc6a6f283422fb01d50554bde1eefcea46fddc2bfe45303e13a1b0eabe · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIGNoZWNrIGV2ZW50IGlzIHdyaXR0ZW4gYnkgcWgtY2hlY2sJZjgwMzk5YmMxY2EyZTlkMDI5MTRjYWM2NDlkNzYwNWEzMzljZTU4YTY0MTFkNDZiOGU0MWRkOWZiNGI1ZTc4Ywpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIGNvbW1hbmQgbmFtaW5nIGNvbW1pdCBvciBwdXNoIGlzIHdhcm5lZCBiZWZvcmUgaXQgcnVucwk5MDE3ZmIxMzdiZGYzMTRkNmM4MGI0N2ExOGExN2RhZGNiOWQ1OTBiYTRmNzg2MTNjNzBlY2I2MDRhNGNmNmU1CmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgY29tbWl0dGVkIGFydGlmYWN0IGlzIHN0aWxsIHZhbGlkYXRlZAk2Y2NlZGU2MDI0MmJjZDY4MzA0MzM5NjNiZjA2OTlmNjRiZGM0OTA3NWM4MWE0MjI2MmFiN2YxNTFjOGJkMjNhCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgY29tcGFjdGlvbiBub3RlIHNlZXMgdGhlIGxhdGVzdCBlZGl0CTJiNTZiMDQxYTc3ZDExODE0YjBmMWFjOWQ0NzM1NzViNzAyOGI1NzNlMTdhNzJkZGI3MDA3N2M0MGMzYThjYTMKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSByZWFkLW9ubHkgcm9sZSBjYW5ub3QgY29tbWl0IG9yIHB1c2ggYW5kIGl0cyBvdGhlciBjaGFuZ2VzIGFyZSByZXBvcnRlZAk5ZWI2NmZlOWZiNmE1ZmJiNDliMTgwNTg4MTNhN2Y0NGNhYTQ4ODZkMmYxYjI2NGFkZDViMzIyMTI2ZjQ0MTVhCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgcmVwb3NpdG9yeSB3aXRob3V0IGEgY2hlY2sgaGVhcnMgbm8gY29tcGxldGlvbiBhZHZpc29yeQk2YmFjMTUxNTg1MmM5MzA2NzBkNmQzN2M3ZWZjODk4NzBiNjA3Mzg0ZDQzMDUzODUyZjc2YjBkN2MzNjg1MTc2CmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgdHJlZSB0aGUgcHVibGlzaCB3YXJuaW5nIG5hbWVkIHN0aWxsIHJlY29yZHMgdW52ZXJpZmllZAk5NWJhMDhkNmNlODE1ZTQ0ZTA2YTYxNGE3ZjlkMWFjZTVjYzQ3YWY2YjFmYmJmZjY5YWM2ZWI5OThkOTdjOGVkCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgdHVybiBlbmQgb2JzZXJ2ZXMgdGhlIHRyZWUgd2l0aG91dCByZWFkaW5nIGFueSBjb21tYW5kCWQ3OGQ0MmNjMGY4YmFjN2FmZGI4MWJhNzdjNTM5ZDJmNGFmYzhlYWQxZDk1NzA2Y2JmMmM0M2NiMTdlODNmZmEKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYW4gdW5jaGVja2VkIGNvbW1pdCBpcyBuYW1lZCBldmVuIHdoZW4gaXRzIHRyZWUgZXF1YWxzIHRoZSBzZXNzaW9uIHN0YXJ0CWYzNjc2MzhhYjFmNzg4NDRkMWZmZGU3YTMzZjNkOTUwZWY1NGJiOGZiOGMwNTZjMjI5NTJjZWU3ZGFmMGNmMzYKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJbWFueSB1bmNoZWNrZWQgY29tbWl0cyBhcmUgb25lIGZpbmRpbmcJYjQ0MDg3YWRhZmFkYjE0NDU5ZDgwZjhiMzVlZGVhYjFiMjk3OWE2NDUwMmFjODA5NmNiZDE1MmIzZjhkZjJmMQpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlvYnNlcnZpbmcgd3JpdGVzIG5vdGhpbmcgaW50byB0aGUgcmVwb3NpdG9yeQlkNjVlMmY0Njc0MzcyNDgzZmZmMDM4ZDRmZWJhZWEyZDgyYWE3MzQwNGEyZDVhZjlhMjEwZWQ4YjAzMTJmNmJhCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCW9uZSBob29rIGRlbGl2ZXJzIGV2ZXJ5IGFjdGlvbiBpdCByZWNvcmRzCTc4ZWZhNTY4ZjMxZThhOTE0YzdkZDRkMGYyNmFmNDgzODFlNDhjMWUzZmFlMmFjNGM1NTZmNDI4MzRmZjQ0MmQKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJdGhlIHNjcmlwdGVkIHNlc3Npb24gYWR2aXNlcyBhcyBpdHMgc3RlcCB0YWJsZSBsaXN0cwljYzVmMmM3ZTRlNDc2NjBjMjcwMWM1MmNiNTM3ZTBhMzMwYzVjMTE5MDcyYWVkODU4ZmZjOGM3ODU4ZDE1MTgzCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCXdyaXRlcyB0aGUgdHJlZSBjYW5ub3Qgc2VlIHJlLW9wZW4gdGhlIGZpbmRpbmcJZjEzZmZiNDE2NWZhZDc0NWQyNDlmNzI3NzI4MmVkNGYyMmUwMjViYzE0YjlmY2M5YjcxZjMxNmJmMGIyM2ZkYg
  ```
  --- last 10 line(s) of stdout (of 54 after folding 54 raw)
    ...
  1..2
  # tests 2
  # suites 0
  # pass 0
  # fail 2
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 669.096666
  ```
- 2026-09-18 · 36a7d7d* · exit 0 · `set -o pipefail …` · acceptance-sha256:b8255ef1e3dad7644c030b0d3500d592b795195e74e3c33b849d699cd39fe0a2 · ms:27655
- 2026-09-18 · 36a7d7d* · exit 0 · `set -o pipefail …` · acceptance-sha256:b8255ef1e3dad7644c030b0d3500d592b795195e74e3c33b849d699cd39fe0a2 · ms:27922
- 2026-09-18 · 36a7d7d* · exit 0 · `set -o pipefail …` · acceptance-sha256:b8255ef1e3dad7644c030b0d3500d592b795195e74e3c33b849d699cd39fe0a2 · ms:27523
- 2026-09-18 · 36a7d7d* · exit 0 · `set -o pipefail …` · acceptance-sha256:b8255ef1e3dad7644c030b0d3500d592b795195e74e3c33b849d699cd39fe0a2 · ms:28199
- 2026-09-18 · 36a7d7d* · exit 0 · `set -o pipefail …` · acceptance-sha256:b8255ef1e3dad7644c030b0d3500d592b795195e74e3c33b849d699cd39fe0a2 · ms:27701
- 2026-09-18 · 36a7d7d* · exit 0 · `set -o pipefail …` · acceptance-sha256:b8255ef1e3dad7644c030b0d3500d592b795195e74e3c33b849d699cd39fe0a2 · ms:28303
- 2026-09-18 · 36a7d7d* · exit 0 · `set -o pipefail …` · acceptance-sha256:b8255ef1e3dad7644c030b0d3500d592b795195e74e3c33b849d699cd39fe0a2 · ms:27774
- 2026-09-18 · 36a7d7d* · exit 0 · `set -o pipefail …` · acceptance-sha256:b8255ef1e3dad7644c030b0d3500d592b795195e74e3c33b849d699cd39fe0a2 · ms:27976
- 2026-09-18 · 36a7d7d* · exit 0 · `set -o pipefail …` · acceptance-sha256:b8255ef1e3dad7644c030b0d3500d592b795195e74e3c33b849d699cd39fe0a2 · ms:27421
- 2026-09-18 · 870fbaa* · exit 1 · `set -o pipefail …` · acceptance-sha256:061c7a0da5b3acf1cec85a2babb9fe66f17625bcee5b8b4b2ab8fff4d87b4ec0 · ms:36
  ```
  --- last 10 line(s) of stdout (of 15 after folding 15 raw)
      at convertStringToRegExp (node:internal/test_runner/utils:121:11)
      at node:internal/test_runner/utils:449:48
      at Array.map (<anonymous>)
      at mapPatternFlagToRegExArray (node:internal/test_runner/utils:449:12)
      at parseCommandLine (node:internal/test_runner/utils:273:26)
      at node:internal/main/test_runner:19:17 {
    code: 'ERR_INVALID_ARG_VALUE'
  }
  
  Node.js v26.8.2
  ```
- 2026-09-18 · 870fbaa* · exit 1 · `set -o pipefail …` · acceptance-sha256:061c7a0da5b3acf1cec85a2babb9fe66f17625bcee5b8b4b2ab8fff4d87b4ec0 · ms:37
  ```
  --- last 10 line(s) of stdout (of 15 after folding 15 raw)
      at convertStringToRegExp (node:internal/test_runner/utils:121:11)
      at node:internal/test_runner/utils:449:48
      at Array.map (<anonymous>)
      at mapPatternFlagToRegExArray (node:internal/test_runner/utils:449:12)
      at parseCommandLine (node:internal/test_runner/utils:273:26)
      at node:internal/main/test_runner:19:17 {
    code: 'ERR_INVALID_ARG_VALUE'
  }
  
  Node.js v26.8.2
  ```
- 2026-09-18 · 870fbaa* · exit 1 · `set -o pipefail …` · acceptance-sha256:061c7a0da5b3acf1cec85a2babb9fe66f17625bcee5b8b4b2ab8fff4d87b4ec0 · ms:40
  ```
  --- last 10 line(s) of stdout (of 15 after folding 15 raw)
      at convertStringToRegExp (node:internal/test_runner/utils:121:11)
      at node:internal/test_runner/utils:449:48
      at Array.map (<anonymous>)
      at mapPatternFlagToRegExArray (node:internal/test_runner/utils:449:12)
      at parseCommandLine (node:internal/test_runner/utils:273:26)
      at node:internal/main/test_runner:19:17 {
    code: 'ERR_INVALID_ARG_VALUE'
  }
  
  Node.js v26.8.2
  ```
- 2026-09-18 · 870fbaa* · exit 1 · `set -o pipefail …` · acceptance-sha256:061c7a0da5b3acf1cec85a2babb9fe66f17625bcee5b8b4b2ab8fff4d87b4ec0 · ms:39
  ```
  --- last 10 line(s) of stdout (of 15 after folding 15 raw)
      at convertStringToRegExp (node:internal/test_runner/utils:121:11)
      at node:internal/test_runner/utils:449:48
      at Array.map (<anonymous>)
      at mapPatternFlagToRegExArray (node:internal/test_runner/utils:449:12)
      at parseCommandLine (node:internal/test_runner/utils:273:26)
      at node:internal/main/test_runner:19:17 {
    code: 'ERR_INVALID_ARG_VALUE'
  }
  
  Node.js v26.8.2
  ```
- 2026-09-18 · 870fbaa* · exit 0 · `set -o pipefail …` · acceptance-sha256:d8ec8ca8858d2c3c608bb8b9cab60226fa5be5b856af797a54f8f789daa0de51 · ms:27152
- 2026-09-18 · 870fbaa* · exit 0 · `set -o pipefail …` · acceptance-sha256:d8ec8ca8858d2c3c608bb8b9cab60226fa5be5b856af797a54f8f789daa0de51 · ms:27039
- 2026-09-18 · 870fbaa* · exit 0 · `set -o pipefail …` · acceptance-sha256:d8ec8ca8858d2c3c608bb8b9cab60226fa5be5b856af797a54f8f789daa0de51 · ms:27063
- 2026-09-18 · 22fa2fe* · exit 0 · `set -o pipefail …` · acceptance-sha256:d8ec8ca8858d2c3c608bb8b9cab60226fa5be5b856af797a54f8f789daa0de51 · ms:45960
- 2026-09-18 · 22fa2fe* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:d8ec8ca8858d2c3c608bb8b9cab60226fa5be5b856af797a54f8f789daa0de51 · ms:0 · test-lock-sha256:76cde48eac54c3857e11290d654cf1509fa5c839ed63701a28b713e2b779f028 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIGNoZWNrIGV2ZW50IGlzIHdyaXR0ZW4gYnkgcWgtY2hlY2sJZjgwMzk5YmMxY2EyZTlkMDI5MTRjYWM2NDlkNzYwNWEzMzljZTU4YTY0MTFkNDZiOGU0MWRkOWZiNGI1ZTc4Ywpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIGNoZWNrIHRoYXQgZmluaXNoZXMgaW4gYSBsYXRlciB0dXJuIGNsZWFycyB0aGUgZmluZGluZyB0aGVuCWI3MzNmN2E1NGY4NzZjNTRkZGIwZjc3ZTRhMGRkOTY4ODg2NjYxMmY0Y2M3ODVjMjA2NWQ1MWJiZDIxNDI2NzMKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSBjaGVjayB0aGF0IHBhc3NlZCBvbiBhIERJRkZFUkVOVCB0cmVlIGNlcnRpZmllcyBub3RoaW5nIGhlcmUJNzkzNThjMTNjYmY3OTIzYzM1OWUzNGQ5N2MzNzM4OTRiOGFjZDY1ZjY5NDk5ZTk0OTI5NmM0NTllMWFmOTlmYgpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIGNvbW1hbmQgbmFtaW5nIGNvbW1pdCBvciBwdXNoIGlzIHdhcm5lZCBiZWZvcmUgaXQgcnVucwk5MDE3ZmIxMzdiZGYzMTRkNmM4MGI0N2ExOGExN2RhZGNiOWQ1OTBiYTRmNzg2MTNjNzBlY2I2MDRhNGNmNmU1CmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgY29tbWl0dGVkIGFydGlmYWN0IGlzIHN0aWxsIHZhbGlkYXRlZAk4OTYyNTdhMDRmOGVlZmNmNTc2YWIwYzY3NWI3NDkzYWEzMWU3NWFlZTA5NTY1OTc4NTYwNmUwNjgzYWZhMTlhCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgY29tcGFjdGlvbiBub3RlIHNlZXMgdGhlIGxhdGVzdCBlZGl0CTJiNTZiMDQxYTc3ZDExODE0YjBmMWFjOWQ0NzM1NzViNzAyOGI1NzNlMTdhNzJkZGI3MDA3N2M0MGMzYThjYTMKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSBmaWxlIGVkaXRlZCB3aGlsZSBpdHMgZ2F0ZSByYW4gaXMgbm90IHJlY29yZGVkIGFzIGFuc3dlcmVkCWUzY2Q5NjU3N2EwZTRkNzAzNWM0NzQyN2JkMDk4YjQ3YTAzODk1OGI1MzIzNzRkZjZiMmFmYTFjMmJlOTAyZDEKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSBmaWxlIGVkaXRlZCB3aGlsZSB0aGUgQkFUQ0ggZ2F0ZWQgaXQgaXMgbm90IHJlY29yZGVkIGFzIGFuc3dlcmVkIGVpdGhlcgk5YjkxYTMzMTcwODc0ZGI1YjM0ZTVhNjY2NWJhZGUzOGI4MDRiNTA5NzhlNjYyMjRmNDI3NDBhNTE1OWM1MWE0CmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgZ2l0IHF1ZXJ5IHRoYXQgRkFJTEVEIGlzIG5vdCBhIGdpdCBxdWVyeSB0aGF0IGZvdW5kIG5vdGhpbmcJNTdiYmU2ZDU5YTVkNDI4MGY3N2E3NjA4Mzg4ODNlN2QwMWY0NDVlZmNhMDk2ZGQyYTMxNmZhNzE2ZjE0MDRhYQpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIGxvZyB0aGF0IGNvdWxkIG5vdCBiZSByZWFkIHdob2xlIGNhbm5vdCBzdXBwbHkgYSBwYXNzaW5nIHZlcmRpY3QJZmYwZTk5YTFlYjllMWYxOTg0ODZhNDU2ZGY4OTdjZGJmYjc2MmVkYmE0YWI2MzJkNDQ4Mzk0ZDM1MzQ0MDQ3Mwpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIHJlYWQtb25seSByb2xlIGNhbm5vdCBjb21taXQgb3IgcHVzaCBhbmQgaXRzIG90aGVyIGNoYW5nZXMgYXJlIHJlcG9ydGVkCTllYjY2ZmU5ZmI2YTVmYmI0OWIxODA1ODgxM2E3ZjQ0Y2FhNDg4NmQyZjFiMjY0YWRkNWIzMjIxMjZmNDQxNWEKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSByZXBvc2l0b3J5IHdpdGhvdXQgYSBjaGVjayBoZWFycyBubyBjb21wbGV0aW9uIGFkdmlzb3J5CTZiYWMxNTE1ODUyYzkzMDY3MGQ2ZDM3YzdlZmM4OTg3MGI2MDczODRkNDMwNTM4NTJmNzZiMGQ3YzM2ODUxNzYKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSBzZXNzaW9uIG5vdGUgbmV2ZXIgaW52ZW50cyBhIGNoZWNrLCBhbmQgbmV2ZXIgcmVwb3J0cyBzaWxlbmNlIGFzIHN0aWxsbmVzcwk3OGMzMjMxYjViODkzMmEwZmMwM2U0NjVkYzY2MGY4NzY0NWE1OGY5MTM5NmEwMjM4NWNhNDk2M2FhMGFmNDBjCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgc2Vzc2lvbiB0aGF0IGJlZ2FuIGJlZm9yZSB0aGUgZmlyc3QgY29tbWl0IHN0aWxsIHNlZXMgdGhlIGNvbW1pdHMgaXQgZ2FpbmVkCThiZTgzOWFhNjYyNTkxZWQyM2EyN2I1MmE2OTM4MjkyODk4MjMwOGQ2NzVmMzAwYWE2NDczMWZiOWYzNmFhOTQKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSB0b3JuIGNoZWNrcy5qc29ubCBjYW5ub3QgbGVhdmUgYW4gb2xkZXIgcGFzcyBzdGFuZGluZyBhcyB0aGUgdmVyZGljdAllOGU1N2YzYzY1NzFiOTNlMjlmZjY2ZDQwZTM5NTljZTM1M2E2YjZiMjY4MTIzZmQyYTEwYmM2NjM1MTBlMGMzCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgdHJlZSB0aGUgcHVibGlzaCB3YXJuaW5nIG5hbWVkIHN0aWxsIHJlY29yZHMgdW52ZXJpZmllZAk5NWJhMDhkNmNlODE1ZTQ0ZTA2YTYxNGE3ZjlkMWFjZTVjYzQ3YWY2YjFmYmJmZjY5YWM2ZWI5OThkOTdjOGVkCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgdHVybiBlbmQgb2JzZXJ2ZXMgdGhlIHRyZWUgd2l0aG91dCByZWFkaW5nIGFueSBjb21tYW5kCWQ3OGQ0MmNjMGY4YmFjN2FmZGI4MWJhNzdjNTM5ZDJmNGFmYzhlYWQxZDk1NzA2Y2JmMmM0M2NiMTdlODNmZmEKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSB0dXJuIHRoYXQgZW5kZWQgaW4gYSBjb21taXQgbmFtZXMgdGhlIGNvbW1pdCwgbm90IGEgY2hhbmdlIHRoYXQgaXMgbm90IHRoZXJlCTk4NmY5ODhhYTdkNmIzMDA2ODY3OTI4Y2EyYTFmMzIxZWJiNjUyZmEwOGZmMzVjMzFiODc1YmIzODVjNGEwYjgKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYW4gdW5jaGVja2VkIGNvbW1pdCBpcyBuYW1lZCBldmVuIHdoZW4gaXRzIHRyZWUgZXF1YWxzIHRoZSBzZXNzaW9uIHN0YXJ0CWYzNjc2MzhhYjFmNzg4NDRkMWZmZGU3YTMzZjNkOTUwZWY1NGJiOGZiOGMwNTZjMjI5NTJjZWU3ZGFmMGNmMzYKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYW4gdW5rbm93biBjb250ZW50IGlkZW50aXR5IG1hdGNoZXMgbm90aGluZywgaW5jbHVkaW5nIGFub3RoZXIgdW5rbm93bgk0Y2YyYmM2YWM4OTJlNjdhNGYxYTAxNDdhNDU4MThiMmZmZDI0NjRiNzdkMjkxMWUxMjEyZDJjYzdhZDc1NWI1CmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWFuIHVudHJhY2tlZCBkaXJlY3RvcnkgaXMgZ2F0ZWQgYnkgdGhlIGZpbGVzIGluIGl0LCBuZXZlciBhcyBhIGRpcmVjdG9yeQkzNjhkYzk2MmUwMGFjOWRiOGNkNGM0NjRjMTQ2NWViNmQzZTAwYzcxODE0YWViZmMzNTU2ZDlkNjEwMjgyYWFiCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCW1hbnkgdW5jaGVja2VkIGNvbW1pdHMgYXJlIG9uZSBmaW5kaW5nCWI0NDA4N2FkYWZhZGIxNDQ1OWQ4MGY4YjM1ZWRlYWIxYjI5NzlhNjQ1MDJhYzgwOTZjYmQxNTJiM2Y4ZGYyZjEKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJb2JzZXJ2aW5nIHdyaXRlcyBub3RoaW5nIGludG8gdGhlIHJlcG9zaXRvcnkJZDY1ZTJmNDY3NDM3MjQ4M2ZmZjAzOGQ0ZmViYWVhMmQ4MmFhNzM0MDRhMmQ1YWY5YTIxMGVkOGIwMzEyZjZiYQpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlvbmUgaG9vayBkZWxpdmVycyBldmVyeSBhY3Rpb24gaXQgcmVjb3Jkcwk3OGVmYTU2OGYzMWU4YTkxNGM3ZGQ0ZDBmMjZhZjQ4MzgxZTQ4YzFlM2ZhZTJhYzRjNTU2ZjQyODM0ZmY0NDJkCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCXRoZSBjb21tYW5kIGNsYXNzaWZpZXJzIGFyZSBnb25lCTAyMDczNTVjYTM0NTUxMTk3YjY4NTdhYjMxOTM3ZDA3MzZhMGNhYjRjZDEzMmQ5OTc5MjQyYTU5OTgyYzhhMTIKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJdGhlIGhhcm5lc3MgZG9lcyBub3Qgb2JzZXJ2ZSBpdHMgb3duIGxlZGdlcgk2MmZjZjk0NjM1YWI1NWM1M2NkN2M2ZTBhNTgxNThhNGNkODJjNGE0MjU3MjIwMjJiNjAwODgwZmQ2ZjRlN2IzCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCXRoZSBrZXkgYSBwZXItZWRpdCBnYXRlIHBlcnNpc3RzIGlzIHRoZSBvbmUgcnVsZSBBIGxvb2tzIHVwLCBvbiBlaXRoZXIgcGxhdGZvcm0JYzYwNjVhOTVkYzM4NGY0OWY2NTljZjUxZGUzZTE3OTdjZmI5OGQ4MWJlYzRiZjViN2RhYTI4NTlkOWU1NTUwYgpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwl0aGUgc2NyaXB0ZWQgc2Vzc2lvbiBhZHZpc2VzIGFzIGl0cyBzdGVwIHRhYmxlIGxpc3RzCWNjNWYyYzdlNGU0NzY2MGMyNzAxYzUyY2I1MzdlMGEzMzBjNWMxMTkwNzJhZWQ4NThmZmM4Yzc4NThkMTUxODMKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJdGhlIHNlc3Npb24gbm90ZSBkb2VzIG5vdCBjcmVkaXQgYSBzdGFsZSByZS1pbXBvcnRlZCBwYXNzCWE4YmY3OTNmMmY3Mzk5YzAxMTU3MjBkNDI0ZDQyNmE3NDU0MGQyNzliZDA5MjNjYmU0ODU5MzYzZDgzNjE0ZDYKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJdGhlIHN0YXR1cyBsaW5lIGRvZXMgbm90IHJlYWQgY2hlY2tlZCBmcm9tIGEgc3RhbGUgcmUtaW1wb3J0ZWQgcGFzcwkxYmE3NjQwZjlkNmM0NTAwZTkzZTU5NzM5NmEyOTEyMzg2Yjc3OWIwM2ZiZTUyOGM4MzJmYzEyNWQ3MzQyZDUzCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCXdoaWNoIGNoZWNrIGlzIGxhdGVzdCBpcyBkZWNpZGVkIGJ5IHdoZW4gaXQgUkFOLCBub3QgYnkgd2hlcmUgaXQgbGFuZGVkIGluIHRoZSBsb2cJNDE1ZWZhOGU5MGRlMTI4YTBmMWYyNWVkYTBhMTVmMDdmMDdlZmJlYmE4ZDYwZjc3ODI2ZGY0NzljYWQ1ZDgyOApib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwl3cml0ZXMgdGhlIHRyZWUgY2Fubm90IHNlZSByZS1vcGVuIHRoZSBmaW5kaW5nCWYxM2ZmYjQxNjVmYWQ3NDVkMjQ5ZjcyNzcyODJlZDRmMjJlMDI1YmMxNGI5ZmNjOWI3MWYzMTZiZjBiMjNmZGI · test-lock-kind:replace
- 2026-09-19 · b0bb452* · exit 0 · `set -o pipefail …` · acceptance-sha256:d8ec8ca8858d2c3c608bb8b9cab60226fa5be5b856af797a54f8f789daa0de51 · ms:27312
- 2026-09-19 · b0bb452* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:d8ec8ca8858d2c3c608bb8b9cab60226fa5be5b856af797a54f8f789daa0de51 · ms:0 · test-lock-sha256:3c705db1bac53c43a15d45d6eb5eb91f63726d46bf090ff340a29e8516c16451 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIGNoZWNrIGV2ZW50IGlzIHdyaXR0ZW4gYnkgcWgtY2hlY2sJZjgwMzk5YmMxY2EyZTlkMDI5MTRjYWM2NDlkNzYwNWEzMzljZTU4YTY0MTFkNDZiOGU0MWRkOWZiNGI1ZTc4Ywpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIGNoZWNrIHRoYXQgZmluaXNoZXMgaW4gYSBsYXRlciB0dXJuIGNsZWFycyB0aGUgZmluZGluZyB0aGVuCWI3MzNmN2E1NGY4NzZjNTRkZGIwZjc3ZTRhMGRkOTY4ODg2NjYxMmY0Y2M3ODVjMjA2NWQ1MWJiZDIxNDI2NzMKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSBjaGVjayB0aGF0IHBhc3NlZCBvbiBhIERJRkZFUkVOVCB0cmVlIGNlcnRpZmllcyBub3RoaW5nIGhlcmUJNzkzNThjMTNjYmY3OTIzYzM1OWUzNGQ5N2MzNzM4OTRiOGFjZDY1ZjY5NDk5ZTk0OTI5NmM0NTllMWFmOTlmYgpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIGNvbW1hbmQgbmFtaW5nIGNvbW1pdCBvciBwdXNoIGlzIHdhcm5lZCBiZWZvcmUgaXQgcnVucwk5MDE3ZmIxMzdiZGYzMTRkNmM4MGI0N2ExOGExN2RhZGNiOWQ1OTBiYTRmNzg2MTNjNzBlY2I2MDRhNGNmNmU1CmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgY29tbWl0dGVkIGFydGlmYWN0IGlzIHN0aWxsIHZhbGlkYXRlZAliYWEyOWMzZTZkN2JlNDYwOWU0ZmYwNDA2NjZjMmNjYTViOTRkMDQ1YzcwOWVlY2E3ODk3MzlkMjRmZmZiNDI0CmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgY29tcGFjdGlvbiBub3RlIHNlZXMgdGhlIGxhdGVzdCBlZGl0CTJiNTZiMDQxYTc3ZDExODE0YjBmMWFjOWQ0NzM1NzViNzAyOGI1NzNlMTdhNzJkZGI3MDA3N2M0MGMzYThjYTMKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSBmaWxlIGVkaXRlZCB3aGlsZSBpdHMgZ2F0ZSByYW4gaXMgbm90IHJlY29yZGVkIGFzIGFuc3dlcmVkCWUzY2Q5NjU3N2EwZTRkNzAzNWM0NzQyN2JkMDk4YjQ3YTAzODk1OGI1MzIzNzRkZjZiMmFmYTFjMmJlOTAyZDEKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSBmaWxlIGVkaXRlZCB3aGlsZSB0aGUgQkFUQ0ggZ2F0ZWQgaXQgaXMgbm90IHJlY29yZGVkIGFzIGFuc3dlcmVkIGVpdGhlcgk5YjkxYTMzMTcwODc0ZGI1YjM0ZTVhNjY2NWJhZGUzOGI4MDRiNTA5NzhlNjYyMjRmNDI3NDBhNTE1OWM1MWE0CmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgZ2l0IHF1ZXJ5IHRoYXQgRkFJTEVEIGlzIG5vdCBhIGdpdCBxdWVyeSB0aGF0IGZvdW5kIG5vdGhpbmcJNTdiYmU2ZDU5YTVkNDI4MGY3N2E3NjA4Mzg4ODNlN2QwMWY0NDVlZmNhMDk2ZGQyYTMxNmZhNzE2ZjE0MDRhYQpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIGxvZyB0aGF0IGNvdWxkIG5vdCBiZSByZWFkIHdob2xlIGNhbm5vdCBzdXBwbHkgYSBwYXNzaW5nIHZlcmRpY3QJZmYwZTk5YTFlYjllMWYxOTg0ODZhNDU2ZGY4OTdjZGJmYjc2MmVkYmE0YWI2MzJkNDQ4Mzk0ZDM1MzQ0MDQ3Mwpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIHJlYWQtb25seSByb2xlIGNhbm5vdCBjb21taXQgb3IgcHVzaCBhbmQgaXRzIG90aGVyIGNoYW5nZXMgYXJlIHJlcG9ydGVkCTllYjY2ZmU5ZmI2YTVmYmI0OWIxODA1ODgxM2E3ZjQ0Y2FhNDg4NmQyZjFiMjY0YWRkNWIzMjIxMjZmNDQxNWEKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSByZXBvc2l0b3J5IHdpdGhvdXQgYSBjaGVjayBoZWFycyBubyBjb21wbGV0aW9uIGFkdmlzb3J5CTZiYWMxNTE1ODUyYzkzMDY3MGQ2ZDM3YzdlZmM4OTg3MGI2MDczODRkNDMwNTM4NTJmNzZiMGQ3YzM2ODUxNzYKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSBzZXNzaW9uIG5vdGUgbmV2ZXIgaW52ZW50cyBhIGNoZWNrLCBhbmQgbmV2ZXIgcmVwb3J0cyBzaWxlbmNlIGFzIHN0aWxsbmVzcwk3OGMzMjMxYjViODkzMmEwZmMwM2U0NjVkYzY2MGY4NzY0NWE1OGY5MTM5NmEwMjM4NWNhNDk2M2FhMGFmNDBjCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgc2Vzc2lvbiB0aGF0IGJlZ2FuIGJlZm9yZSB0aGUgZmlyc3QgY29tbWl0IHN0aWxsIHNlZXMgdGhlIGNvbW1pdHMgaXQgZ2FpbmVkCThiZTgzOWFhNjYyNTkxZWQyM2EyN2I1MmE2OTM4MjkyODk4MjMwOGQ2NzVmMzAwYWE2NDczMWZiOWYzNmFhOTQKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSB0b3JuIGNoZWNrcy5qc29ubCBjYW5ub3QgbGVhdmUgYW4gb2xkZXIgcGFzcyBzdGFuZGluZyBhcyB0aGUgdmVyZGljdAllOGU1N2YzYzY1NzFiOTNlMjlmZjY2ZDQwZTM5NTljZTM1M2E2YjZiMjY4MTIzZmQyYTEwYmM2NjM1MTBlMGMzCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgdHJlZSB0aGUgcHVibGlzaCB3YXJuaW5nIG5hbWVkIHN0aWxsIHJlY29yZHMgdW52ZXJpZmllZAk5NWJhMDhkNmNlODE1ZTQ0ZTA2YTYxNGE3ZjlkMWFjZTVjYzQ3YWY2YjFmYmJmZjY5YWM2ZWI5OThkOTdjOGVkCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgdHVybiBlbmQgb2JzZXJ2ZXMgdGhlIHRyZWUgd2l0aG91dCByZWFkaW5nIGFueSBjb21tYW5kCWQ3OGQ0MmNjMGY4YmFjN2FmZGI4MWJhNzdjNTM5ZDJmNGFmYzhlYWQxZDk1NzA2Y2JmMmM0M2NiMTdlODNmZmEKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSB0dXJuIHRoYXQgZW5kZWQgaW4gYSBjb21taXQgbmFtZXMgdGhlIGNvbW1pdCwgbm90IGEgY2hhbmdlIHRoYXQgaXMgbm90IHRoZXJlCTk4NmY5ODhhYTdkNmIzMDA2ODY3OTI4Y2EyYTFmMzIxZWJiNjUyZmEwOGZmMzVjMzFiODc1YmIzODVjNGEwYjgKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYW4gdW5jaGVja2VkIGNvbW1pdCBpcyBuYW1lZCBldmVuIHdoZW4gaXRzIHRyZWUgZXF1YWxzIHRoZSBzZXNzaW9uIHN0YXJ0CWYzNjc2MzhhYjFmNzg4NDRkMWZmZGU3YTMzZjNkOTUwZWY1NGJiOGZiOGMwNTZjMjI5NTJjZWU3ZGFmMGNmMzYKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYW4gdW5rbm93biBjb250ZW50IGlkZW50aXR5IG1hdGNoZXMgbm90aGluZywgaW5jbHVkaW5nIGFub3RoZXIgdW5rbm93bgk0Y2YyYmM2YWM4OTJlNjdhNGYxYTAxNDdhNDU4MThiMmZmZDI0NjRiNzdkMjkxMWUxMjEyZDJjYzdhZDc1NWI1CmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWFuIHVudHJhY2tlZCBkaXJlY3RvcnkgaXMgZ2F0ZWQgYnkgdGhlIGZpbGVzIGluIGl0LCBuZXZlciBhcyBhIGRpcmVjdG9yeQkzNjhkYzk2MmUwMGFjOWRiOGNkNGM0NjRjMTQ2NWViNmQzZTAwYzcxODE0YWViZmMzNTU2ZDlkNjEwMjgyYWFiCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCW1hbnkgdW5jaGVja2VkIGNvbW1pdHMgYXJlIG9uZSBmaW5kaW5nCWI0NDA4N2FkYWZhZGIxNDQ1OWQ4MGY4YjM1ZWRlYWIxYjI5NzlhNjQ1MDJhYzgwOTZjYmQxNTJiM2Y4ZGYyZjEKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJb2JzZXJ2aW5nIHdyaXRlcyBub3RoaW5nIGludG8gdGhlIHJlcG9zaXRvcnkJZDY1ZTJmNDY3NDM3MjQ4M2ZmZjAzOGQ0ZmViYWVhMmQ4MmFhNzM0MDRhMmQ1YWY5YTIxMGVkOGIwMzEyZjZiYQpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlvbmUgaG9vayBkZWxpdmVycyBldmVyeSBhY3Rpb24gaXQgcmVjb3Jkcwk3OGVmYTU2OGYzMWU4YTkxNGM3ZGQ0ZDBmMjZhZjQ4MzgxZTQ4YzFlM2ZhZTJhYzRjNTU2ZjQyODM0ZmY0NDJkCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCXRoZSBjb21tYW5kIGNsYXNzaWZpZXJzIGFyZSBnb25lCTAyMDczNTVjYTM0NTUxMTk3YjY4NTdhYjMxOTM3ZDA3MzZhMGNhYjRjZDEzMmQ5OTc5MjQyYTU5OTgyYzhhMTIKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJdGhlIGhhcm5lc3MgZG9lcyBub3Qgb2JzZXJ2ZSBpdHMgb3duIGxlZGdlcgk2MmZjZjk0NjM1YWI1NWM1M2NkN2M2ZTBhNTgxNThhNGNkODJjNGE0MjU3MjIwMjJiNjAwODgwZmQ2ZjRlN2IzCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCXRoZSBrZXkgYSBwZXItZWRpdCBnYXRlIHBlcnNpc3RzIGlzIHRoZSBvbmUgcnVsZSBBIGxvb2tzIHVwLCBvbiBlaXRoZXIgcGxhdGZvcm0JYzYwNjVhOTVkYzM4NGY0OWY2NTljZjUxZGUzZTE3OTdjZmI5OGQ4MWJlYzRiZjViN2RhYTI4NTlkOWU1NTUwYgpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwl0aGUgc2NyaXB0ZWQgc2Vzc2lvbiBhZHZpc2VzIGFzIGl0cyBzdGVwIHRhYmxlIGxpc3RzCWNjNWYyYzdlNGU0NzY2MGMyNzAxYzUyY2I1MzdlMGEzMzBjNWMxMTkwNzJhZWQ4NThmZmM4Yzc4NThkMTUxODMKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJdGhlIHNlc3Npb24gbm90ZSBkb2VzIG5vdCBjcmVkaXQgYSBzdGFsZSByZS1pbXBvcnRlZCBwYXNzCWE4YmY3OTNmMmY3Mzk5YzAxMTU3MjBkNDI0ZDQyNmE3NDU0MGQyNzliZDA5MjNjYmU0ODU5MzYzZDgzNjE0ZDYKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJdGhlIHN0YXR1cyBsaW5lIGRvZXMgbm90IHJlYWQgY2hlY2tlZCBmcm9tIGEgc3RhbGUgcmUtaW1wb3J0ZWQgcGFzcwkxYmE3NjQwZjlkNmM0NTAwZTkzZTU5NzM5NmEyOTEyMzg2Yjc3OWIwM2ZiZTUyOGM4MzJmYzEyNWQ3MzQyZDUzCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCXdoaWNoIGNoZWNrIGlzIGxhdGVzdCBpcyBkZWNpZGVkIGJ5IHdoZW4gaXQgUkFOLCBub3QgYnkgd2hlcmUgaXQgbGFuZGVkIGluIHRoZSBsb2cJNDE1ZWZhOGU5MGRlMTI4YTBmMWYyNWVkYTBhMTVmMDdmMDdlZmJlYmE4ZDYwZjc3ODI2ZGY0NzljYWQ1ZDgyOApib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwl3cml0ZXMgdGhlIHRyZWUgY2Fubm90IHNlZSByZS1vcGVuIHRoZSBmaW5kaW5nCWYxM2ZmYjQxNjVmYWQ3NDVkMjQ5ZjcyNzcyODJlZDRmMjJlMDI1YmMxNGI5ZmNjOWI3MWYzMTZiZjBiMjNmZGI · test-lock-kind:replace
