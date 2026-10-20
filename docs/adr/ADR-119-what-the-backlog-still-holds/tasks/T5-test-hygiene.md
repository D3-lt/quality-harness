# Task ADR-119-T5: Test hygiene

**Depends-on:** T1, T2, T3, T4
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `tests/helpers/remove.mjs`
**Consumes:** the test files T1, T2, T3 and T4 edit (T1, T2, T3, T4)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Tests remove their directories through one retrying helper, spawn bash through `testBash`, and `decision-corpus.mjs` stops
holding helpers that belong to its importers (BACKLOG §381 items 17, 19, 23).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/test-hygiene.test.mjs` | add | the sweeps, each with a planted dirty twin, and closed lists of the locked sites that only shrink |
| `tests/helpers/remove.mjs` | add | wraps `rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })` (`tests/unused-names.test.mjs:15`) |
| the unlocked test files of §380's class | edit | their removes go through the helper; S1 enumerates them |
| the test files with bare `bash` spawns | edit | `testBash` (`tests/helpers/bash.mjs`), unlocked files first; S1 enumerates them |
| `plugin/scripts/event-log.mjs` | edit | gains `walk`, `outsideRoot` (with its own local predicate) and `GIT_LISTING_BUFFER` |
| `plugin/scripts/decision-corpus.mjs` | edit | the three leave, and `GIT_LISTING_BUFFER` is imported back from `event-log.mjs` for its own use (:1494); the exported `inside` (:1153) stays, used at five sites there |
| `plugin/scripts/completion-rules.mjs`, `plugin/scripts/check-ledger.mjs`, `plugin/scripts/artifact-pass.mjs`, `plugin/scripts/tree-facts.mjs` | edit | import from `event-log.mjs` |
| `plugin/scripts/publish-command.mjs` | edit | S6: `maskedMessages` (:1227-1266) masks one occurrence at a time; a comment at the fresh-directory assignment (:1296) says why its once-only rule keeps no refusal for data |
| `core/hooks/publishcmd.go` | edit | S6: the same in `maskedMessages` (:1950-2020, ADR-110 parity), and the same comment at :2177 |
| `tests/foreign-commit.test.mjs` | edit | S6: two new tests after the last one (the second, beside the first, from the skip-slot mutant after the red run); the import of `freshRepositoryCommit` and `leavesHookInPlace` (:18), outside every locked body |
| `tests/mutations/plugin/scripts/publish-command.mjs.json` | edit | S6: the once-only entry (:1197-1205), whose line leaves, gives way to the per-occurrence mutants |
| `tests/mutations/plugin/scripts/decision-corpus.mjs.json`, `tests/mutations/plugin/scripts/event-log.mjs.json` | edit | S4: the `GIT_LISTING_BUFFER` entry (:933-942) and the three `outsideRoot` entries (§343, ADR-094 T4 ×2) move with the code (CLAUDE.md §1) |

## Ordered Steps

1. [S1] Write `tests/test-hygiene.test.mjs` and record the red run. Enumerate §380's class (tests that start a session and remove their directory with no retry) and the bare `bash` spawns with a command, and record each count and the locked sites (`scripts/test-locks.py`) in the test's closed lists. Measured 2026-10-20 at 14bc3430: 34 bare-spawn lines in 9 files; the plan counted 33, and a bare `rmSync(` regex finds 709 lines in 216 files, which is not the class.
2. [S2] Add `tests/helpers/remove.mjs` and convert the unlocked files first. Measure how many bare removes sit inside locked bodies before relocking any; a remove in `after()` or in a module helper needs no relock.
3. [S3] Move the bare `bash` spawns onto `testBash`, unlocked files first.
4. [S4] Run `node scripts/orphan-sweep.mjs` for the exported `inside` first. Then move `walk`, `outsideRoot` and `GIT_LISTING_BUFFER` to `event-log.mjs`, the one module all four importers and `decision-corpus.mjs` already import, and point the importers at it. `outsideRoot` calls its own local predicate (`decision-corpus.mjs:32-35`), not the exported `inside` (:1153, which returns a relative path or null), so the local predicate moves with it. The exported `inside` moves only if the orphan check shows a caller outside `decision-corpus.mjs`; on 2026-10-20 `mrw read --grep` found no file importing it from there. If the sweep reports the export as an orphan, the `export` is removed (dead code is deleted or wired, CLAUDE.md §13).
5. [S6] Added by the owner (Zy) on 2026-10-20, before the first red run. T3's sweep, `mrw read --grep 'split\((spelling|written)\)\.length|strings\.Count\(' plugin/scripts/ core/hooks/`, found the once-only rule T3 took out of `withoutData`'s `take` at two more places: `maskedMessages` (`plugin/scripts/publish-command.mjs:1257`, `core/hooks/publishcmd.go:2007`) and Go's fresh-directory assignment (`core/hooks/publishcmd.go:2177`); the Node twin of that assignment (`publish-command.mjs:1296`) is spelled `plain.split(assignment)`, which the pattern misses. In `maskedMessages`, Node and Go, mask one occurrence at a time and keep it only when the text read again has `msg` in that occurrence's word, as `take` does: a message repeated as data (`-m 'let x=1' -m 'let x=1'`, two commits with one message) keeps no refusal, and a copy that is code (`-m '.git/hooks' -m '.git/hooks' && cp x '.git/hooks'`, a message repeated as an arithmetic command) still refuses (CLAUDE.md §16). The fresh-directory assignment was measured before the red run and holds no refusal for data: every other copy of `R=$(mktemp -d)` keeps its `$(` (a copy inside a quoted message is masked before it), and `leavesHookInPlace` refuses any text holding a `$` (`publish-command.mjs:1349`) whichever copy is made plain, so a per-occurrence rule there moves no verdict and its mutant could not be killed. Both of its sites get a comment saying so and no change of logic; that is the owner's to overrule. After the red run a mutant that skips the slot check survived the S6 test, so a second test sits beside it, outside the Tests table and run by the same fence: `the occurrence masked is the message, not the same spelling run as code before it`. [proof: mutation]
6. [S5] Record a killed mutant for each sweep (a planted bare call is found) and for the move (an importer left on `decision-corpus.mjs`). [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/test-hygiene.test.mjs tests/foreign-commit.test.mjs tests/qh-core-parity.test.mjs 2>&1) \
  && for n in "no test outside the locked list removes its directory without the retrying helper" \
      "no test outside the locked list spawns a bare bash" \
      "decision-corpus.mjs no longer holds walk, outsideRoot or GIT_LISTING_BUFFER" \
      "a commit message repeated as data is masked in each of its words, and a copy that is code still refuses" \
      "the Go classifier answers every literal of the classifier's own tests as the Node one does"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done \
  && go build -C core -o bin/qh ./cmd/qh \
  && gout=$(QUALITY_HARNESS_HOOK_IMPL=go node --test --test-reporter=tap tests/foreign-commit.test.mjs 2>&1) \
  && n="a commit message repeated as data is masked in each of its words, and a copy that is code still refuses" \
  && test "$(printf '%s\n' "$gout" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 \
  && node scripts/orphan-sweep.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `no test outside the locked list removes its directory without the retrying helper` | `tests/test-hygiene.test.mjs` | the sweep over the git listing, with a planted bare remove found and a locked site that left the tree removed from the list | — | S1, S2 |
| `no test outside the locked list spawns a bare bash` | `tests/test-hygiene.test.mjs` | the same for `spawnSync('bash'`, `execFileSync('bash'`, `spawn('bash'` | — | S1, S3 |
| `decision-corpus.mjs no longer holds walk, outsideRoot or GIT_LISTING_BUFFER` | `tests/test-hygiene.test.mjs` | the three are exported by `event-log.mjs` and imported from it by every importer; `outsideRoot` answers as before for a path inside, outside and case-folded | — | S1, S4 |
| `a commit message repeated as data is masked in each of its words, and a copy that is code still refuses` | `tests/foreign-commit.test.mjs` | two `-m` values with one spelling and two commits with one message are masked (foreign, armed and fresh rules); a copy as an arithmetic command or a `cp` target still refuses; through the hook the seam names | — | S6 |
| `the Go classifier answers every literal of the classifier's own tests as the Node one does` | `tests/qh-core-parity.test.mjs` | S6's rows through the Go core, 0 disagreements | — | S6 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `tests/test-hygiene.test.mjs` |
| 2 — something selects it | `scripts/selftest.sh` runs every `tests/*.test.mjs` |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | every selftest, on every platform CI runs |

## Mutation Log
- 2026-10-20 · 95bb1ef9* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · every occurrence of a message spelling is masked with no slot check: a hooks-directory cp target spelled as the message twice is hidden · acceptance-sha256:f7a3fe8b24378f24e7b3c83d51cd905412900389386edb21c4ee6815b9ad3c89
- 2026-10-20 · 95bb1ef9* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · the once-only rule is back: a message spelled twice as two -m values keeps the foreign commit refused · acceptance-sha256:f7a3fe8b24378f24e7b3c83d51cd905412900389386edb21c4ee6815b9ad3c89
- 2026-10-20 · 95bb1ef9* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · the slot check is skipped: the first occurrence is masked, and sh -c run before the message loses its publish · acceptance-sha256:f7a3fe8b24378f24e7b3c83d51cd905412900389386edb21c4ee6815b9ad3c89
- 2026-10-20 · 95bb1ef9* · mutant killed · exit 1 · `core/hooks/publishcmd.go` · Go masks every occurrence at once: a cp target spelled as the message is hidden, and the parity test disagrees · acceptance-sha256:f7a3fe8b24378f24e7b3c83d51cd905412900389386edb21c4ee6815b9ad3c89
- 2026-10-20 · 95bb1ef9* · mutant killed · exit 1 · `core/hooks/publishcmd.go` · Go has the once-only rule back: a message spelled twice keeps the refusal, in parity and through the Go hook · acceptance-sha256:f7a3fe8b24378f24e7b3c83d51cd905412900389386edb21c4ee6815b9ad3c89
- 2026-10-20 · 95bb1ef9* · mutant killed · exit 1 · `core/hooks/publishcmd.go` · Go skips the slot check: the first occurrence is masked even when it is sh -c code before the message · acceptance-sha256:f7a3fe8b24378f24e7b3c83d51cd905412900389386edb21c4ee6815b9ad3c89
- 2026-10-20 · 95bb1ef9* · mutant killed · exit 1 · `tests/artifact-key.test.mjs` · a planted bare recursive remove in a session test is found by the sweep · acceptance-sha256:f7a3fe8b24378f24e7b3c83d51cd905412900389386edb21c4ee6815b9ad3c89
- 2026-10-20 · 95bb1ef9* · mutant killed · exit 1 · `tests/owner-search-root.test.mjs` · a planted bare bash spawn is found by the sweep · acceptance-sha256:f7a3fe8b24378f24e7b3c83d51cd905412900389386edb21c4ee6815b9ad3c89
- 2026-10-20 · 95bb1ef9* · mutant killed · exit 1 · `plugin/scripts/decision-corpus.mjs, plugin/scripts/completion-rules.mjs` · an importer left on decision-corpus.mjs, which re-exports walk again, is found · acceptance-sha256:f7a3fe8b24378f24e7b3c83d51cd905412900389386edb21c4ee6815b9ad3c89

## Invariants

- Locked test bodies stay byte-identical unless relocked with the reason (CLAUDE.md §2).
- The closed lists only shrink.

## Risks

- A spawn converted to `testBash` on a POSIX host changes nothing there; the change is for a Windows host, which CI runs and this machine cannot.

## Stop Condition

Stop if moving the helpers to `event-log.mjs` would add an import cycle: the destination is then the owner's decision.

## Out of Scope

- The Windows hook goldens, item 23's second half (deferred: docs/BACKLOG.md §381)

## Verification Log
- 2026-10-20 · 95bb1ef9* · exit 1 · `out=$(node --test --test-reporter=tap tests/test-hygiene.test.mjs tests/foreign-commit.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:f7a3fe8b24378f24e7b3c83d51cd905412900389386edb21c4ee6815b9ad3c89 · ms:77117 · test-lock-sha256:fc8c5115aa5952b4f86f1d27fb46b98dd4a2d161429b658689e8eca2cd2751ca · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvZm9yZWlnbi1jb21taXQudGVzdC5tanMJYSAtQyBwYXRoIHRoYXQgcmVhY2hlcyB0aGlzIHJlcG9zaXRvcnkncyBnaXQgZGlyZWN0b3J5IGlzIG5ldmVyIGZvcmVpZ24JMjk2MGZiZTRjYzE5NjNjOTQxNDg0MzFjNTk5NWFmYTk4MTkzOWUxZGUzOGU1ZDdmNTgzOGIxMTM3NWZjYTc0MQpib2R5CXRlc3RzL2ZvcmVpZ24tY29tbWl0LnRlc3QubWpzCWEgY29tbWl0IG1lc3NhZ2UgcmVwZWF0ZWQgYXMgZGF0YSBpcyBtYXNrZWQgaW4gZWFjaCBvZiBpdHMgd29yZHMsIGFuZCBhIGNvcHkgdGhhdCBpcyBjb2RlIHN0aWxsIHJlZnVzZXMJMTFiZGFmZWMyZDVkMDBiODQ0MGYxOWNlNDk3NGNjMDY5YmU4YzBkODdlYjhiMzllY2Q0OGM0NWM0Y2I1YzA0Mwpib2R5CXRlc3RzL2ZvcmVpZ24tY29tbWl0LnRlc3QubWpzCWEgbGl0ZXJhbCAtQyBjb21taXQgaW50byBhbm90aGVyIHJlcG9zaXRvcnkgaXMgYWR2aXNlZCwgYXJtZWQgb3Igbm90LCB1bmNoZWNrZWQgb3IgZmFzdC1wYXNzCWE2NDVlNDkyNzliNWM1ZDBiZDUyY2JkZDNmZjZhOThhYTliOTcwNGZkNTcwYzc2Yzc2MmU5YTRiNjQ2ODYyNDYKYm9keQl0ZXN0cy9mb3JlaWduLWNvbW1pdC50ZXN0Lm1qcwlhIGxpdGVyYWwgY2QgaW50byBhbm90aGVyIHJlcG9zaXRvcnksIHRoZW4gb25lIGNvbW1pdCwgaXMgYWR2aXNlZCwgYW5kIGV2ZXJ5IG90aGVyIGNkIGtlZXBzIHRoZSByZWZ1c2FsCTM5OWZhZDJiZmZmOGJlOGRkODA0MmE0YzU2YTM5YmNmODEwY2UwMmJkZGE3ZTkzN2U3NTA2ZDBmNWZmYWE4ODAKYm9keQl0ZXN0cy9mb3JlaWduLWNvbW1pdC50ZXN0Lm1qcwlhIGxpdGVyYWwgcmVwZWF0ZWQgYXMgZGF0YSBrZWVwcyBubyByZWZ1c2FsLCBhbmQgdGhlIHRocmVlIGNvZGUtYWdhaW4gc3BlbGxpbmdzIHN0aWxsIHJlZnVzZQkwYTcxMjcwYjM4NzBlNjY3NWM2ODlmZWJlMDFkZWU0M2QxODQ2MmU0NzBjNWFiNTNmZjVlYWEyOTFjZDBiNzhhCmJvZHkJdGVzdHMvZm9yZWlnbi1jb21taXQudGVzdC5tanMJYSBwcm9iZSB0aGF0IGZhaWxzIHByb3ZlcyBub3RoaW5nLCBhbmQgdGhlIHByb2JlIGlzIGJvdW5kZWQgYW5kIGhpZGRlbgljOTc2OWFkM2E3NjZlODQ0NmZlMWY3ZjhiZThkZDZhNGY2Y2RiYjc2ZjFiZDNlM2ZjMGE1MTY1N2Q3YWM0ZGJhCmJvZHkJdGVzdHMvZm9yZWlnbi1jb21taXQudGVzdC5tanMJYXJpdGhtZXRpYywgYSBoZXJlLXN0cmluZyBhbmQgYSBjb21tYW5kIGJlZm9yZSB0aGUgY29tbWl0IGtlZXAgdGhlIHJlZnVzYWwJZWYzNTlmMmJlY2UzMWFlYTJhYTY3OWEwMzI4YTM0ZGYzODc4NTdkZmVlYzVkODFlZTMyMWE0NjIzNmRkZTZiMgpib2R5CXRlc3RzL2ZvcmVpZ24tY29tbWl0LnRlc3QubWpzCWxpdGVyYWwgZGF0YSBpcyBub3QgYXJpdGhtZXRpYywgYW5kIGFuIGV4cGFuc2lvbiBvZiBpdCBzdGlsbCBpcwliMzdmYTA4MTA0MWUyNTFkZjlmZmUyYTJkMGFjZGEwNGEzYTA5NTZlNWNiYzlmMzFjODc4ZDFiMWQ4MzYxMThiCmJvZHkJdGVzdHMvZm9yZWlnbi1jb21taXQudGVzdC5tanMJdGVzdHMvZm9yZWlnbi1jb21taXQudGVzdC5tanMgaXMgaW4gdGhlIGRlY2xhcmVkIGZhc3QgY2hlY2sJNDU1YTQ1MTU0NGI3MzU0ODc4ZjUxMDg3MGJhZTIzMzNhMWUzNzBlZjBhOTVmOTIyNDU2ZmE2MmZkOGU3Y2Q0MApib2R5CXRlc3RzL2ZvcmVpZ24tY29tbWl0LnRlc3QubWpzCXRoZSBwZXJzb24gdG9sZCBvZiBhIGNvbW1pdCBpbnRvIGFub3RoZXIgcmVwb3NpdG9yeSBpcyB0b2xkIHdoeSBpdCB3YXMgYWxsb3dlZAkzZjQ1YWUyOGVjYjhjNmZjMjJmMDViYTRlMjhmMjk0MzQ0NjkzOWMwOTk2NTc5OGMzMzUxZjBlYzlkYWJjYTBjCmJvZHkJdGVzdHMvZm9yZWlnbi1jb21taXQudGVzdC5tanMJdGhlIHNlc3Npb24gaGVscGVyIHJ1bnMgdGhlIGhvb2sgdGhlIGltcGxlbWVudGF0aW9uIHNlYW0gbmFtZXMJZDFmM2Q1NDk1NTNmODIyNzk4ZjNkMjdjZWIxZjIwMTY0M2M0ZjcyN2JkOGY1OTQzNDAzMGI2ZWVkMDk2NjNkMQpib2R5CXRlc3RzL2ZvcmVpZ24tY29tbWl0LnRlc3QubWpzCXdoYXQgcnVucyBiZXNpZGUgdGhlIGNvbW1pdCwgb3IgcmVkaXJlY3RzIGl0LCBrZWVwcyB0aGUgcmVmdXNhbAkyOWQ3ZWQ4MjNkYWQyYWVmZDM3OTM1MjMxMjM3MmMzYTQxMDAyZmI4MDIyOGVjMTUxYzMxZTRiZjc0MTI2MWUxCmJvZHkJdGVzdHMvcWgtY29yZS1wYXJpdHkudGVzdC5tanMJdGhlIEdvIGNsYXNzaWZpZXIgYW5zd2VycyBldmVyeSBsaXRlcmFsIG9mIHRoZSBjbGFzc2lmaWVyJ3Mgb3duIHRlc3RzIGFzIHRoZSBOb2RlIG9uZSBkb2VzCTUzN2VlNzRiYmViMzY5NmRjMDRjYjg3NzUzZGMwOWM1NTliZDAyYWUyNmQxMmIyYzZjMGE3ZDAzODhjZjhkM2QKYm9keQl0ZXN0cy9xaC1jb3JlLXBhcml0eS50ZXN0Lm1qcwl0aGUgYXJ0aWZhY3QgcGFzcyBydW5zIGJlaGluZCB0aGUgYm91bmRhcnkgdGhhdCBzdGFydHMgaXQsIGFuZCB0aGUgbmV4dCBob29rIHNheXMgd2hhdCBpdCBmb3VuZCwgZnJvbSBlaXRoZXIgaW1wbGVtZW50YXRpb24JMGExZWIzODEwOThiODE4MjM4NTEwMjk3OGIzNjM3MzFjZTdjYTIwZWQzMzlkNTY3NGI5ZTMzMWUyOGEyOGUyZgpib2R5CXRlc3RzL3FoLWNvcmUtcGFyaXR5LnRlc3QubWpzCXdoYXQgYSBzZXNzaW9uIGxlYXZlcyBvdXRzaWRlIHRoZSBsZWRnZXJzLCBhbmQgd2hhdCB0aGUgbmV4dCBvbmUgcmVhZHMgYmFjaywgaXMgdGhlIHNhbWUgZnJvbSBlaXRoZXIgaW1wbGVtZW50YXRpb24JYWQxZTdmNzdlMmI0ZGUxMTFlZTAyMTQ4NmMyNGU3OWU5NjM0ZTQ5MDgyNzc1OTI2MzJjYzFkY2FlYmU4ZDRmMgpib2R5CXRlc3RzL3Rlc3QtaHlnaWVuZS50ZXN0Lm1qcwlkZWNpc2lvbi1jb3JwdXMubWpzIG5vIGxvbmdlciBob2xkcyB3YWxrLCBvdXRzaWRlUm9vdCBvciBHSVRfTElTVElOR19CVUZGRVIJM2E5NGUwYmRiMzI5ODJkMThhZDFiY2Y2MzZjNzk3NGIxYzg5M2RlNDZkZTllZDA4YThiNjI3Y2RiNDJhY2I2Mwpib2R5CXRlc3RzL3Rlc3QtaHlnaWVuZS50ZXN0Lm1qcwlubyB0ZXN0IG91dHNpZGUgdGhlIGxvY2tlZCBsaXN0IHJlbW92ZXMgaXRzIGRpcmVjdG9yeSB3aXRob3V0IHRoZSByZXRyeWluZyBoZWxwZXIJZGRiNTk4MTU0MDJjZWI3ODQ1MGNmNGRiYjY5MGQ3M2E3NmNlNDI4NzI0NDdjZGMwOGJkOTUwYjc2ZTM3ZjMyMgpib2R5CXRlc3RzL3Rlc3QtaHlnaWVuZS50ZXN0Lm1qcwlubyB0ZXN0IG91dHNpZGUgdGhlIGxvY2tlZCBsaXN0IHNwYXducyBhIGJhcmUgYmFzaAk4NDQ5ZWJjNGMwNmQzZDMxNjVmMDg1NThlMzA0NjFjYTc2ODk4MWFlZmQ4NWIxZmI4ZDg1NDc0ZWVjZDM0ZWNl
  ```
  ```
- 2026-10-20 · 95bb1ef9* · exit 0 · `out=$(node --test --test-reporter=tap tests/test-hygiene.test.mjs tests/foreign-commit.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:f7a3fe8b24378f24e7b3c83d51cd905412900389386edb21c4ee6815b9ad3c89 · ms:42203
- 2026-10-20 · 95bb1ef9* · exit 0 · `out=$(node --test --test-reporter=tap tests/test-hygiene.test.mjs tests/foreign-commit.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:f7a3fe8b24378f24e7b3c83d51cd905412900389386edb21c4ee6815b9ad3c89 · ms:41974
- 2026-10-20 · 95bb1ef9* · exit 0 · `out=$(node --test --test-reporter=tap tests/test-hygiene.test.mjs tests/foreign-commit.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:f7a3fe8b24378f24e7b3c83d51cd905412900389386edb21c4ee6815b9ad3c89 · ms:55135
- 2026-10-20 · 95bb1ef9* · exit 0 · `out=$(node --test --test-reporter=tap tests/test-hygiene.test.mjs tests/foreign-commit.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:f7a3fe8b24378f24e7b3c83d51cd905412900389386edb21c4ee6815b9ad3c89 · ms:38417
- 2026-10-20 · 95bb1ef9* · exit 0 · `out=$(node --test --test-reporter=tap tests/test-hygiene.test.mjs tests/foreign-commit.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:f7a3fe8b24378f24e7b3c83d51cd905412900389386edb21c4ee6815b9ad3c89 · ms:36226
- 2026-10-20 · 95bb1ef9* · exit 0 · `out=$(node --test --test-reporter=tap tests/test-hygiene.test.mjs tests/foreign-commit.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:f7a3fe8b24378f24e7b3c83d51cd905412900389386edb21c4ee6815b9ad3c89 · ms:37375
- 2026-10-20 · 95bb1ef9* · exit 0 · `out=$(node --test --test-reporter=tap tests/test-hygiene.test.mjs tests/foreign-commit.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:f7a3fe8b24378f24e7b3c83d51cd905412900389386edb21c4ee6815b9ad3c89 · ms:47475
- 2026-10-20 · 95bb1ef9* · exit 0 · `out=$(node --test --test-reporter=tap tests/test-hygiene.test.mjs tests/foreign-commit.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:f7a3fe8b24378f24e7b3c83d51cd905412900389386edb21c4ee6815b9ad3c89 · ms:37185
- 2026-10-20 · 95bb1ef9* · exit 0 · `out=$(node --test --test-reporter=tap tests/test-hygiene.test.mjs tests/foreign-commit.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:f7a3fe8b24378f24e7b3c83d51cd905412900389386edb21c4ee6815b9ad3c89 · ms:38738
