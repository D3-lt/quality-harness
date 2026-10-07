# Task ADR-089-T2: a PARTIAL run counts what it read, and the attestation says its look

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one shipped script, one new test file, campaign entries)
**Owner:** unassigned
**Produces:** attestation keys `look` and `notCompared`; `probe.readers.gitReason`
**Consumes:** `verdictMoves` returning `{ compared, notCompared, moves }` over a PARTIAL pair (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `verdictChanges over a partial pair`, `the look field`, `the notCompared count`, `the git failure reason`

## Goal

`corpus-probe --attest --since` counts verdict moves over a PARTIAL pair, carries `look` and
`notCompared`, and says when git could not run rather than that the plugin is not a checkout
(ADR-089 Decision 3).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/corpus-probe.mjs` | edit | `verdictChanges` (`:663`) uses T1's `comparable`; `attestation` (`:676`) adds `look` and `notCompared` after `readinessUnproven` and before `verdictChanges`, and the git arm of `atReason` (`:689`); `readerFingerprint` (`:79`, `:106`) records `gitReason` when the `rev-parse` spawn has an `error`. `attestMain` (`:734`) is what selects `attestation` and is unchanged |
| `tests/probe-attest-partial.test.mjs` | add | the three tests below |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Run `python3 scripts/test-locks.py tests/corpus-probe.test.mjs` and confirm no locked assertion pins the attestation's key list or its key order. If one does, stop (Stop Condition). Write the three tests in `tests/probe-attest-partial.test.mjs` and record the red run (TDD red). Red today: `verdictChanges` is null over the PARTIAL pair, and `look` is absent.
2. [S2] `attestation` adds:
   - `look`: the worse of `report.look` and `report.workNext?.look`, in the order ok < PARTIAL < UNPROVEN, or null when neither is a string;
   - `notCompared`: `verdictMoves`' count when `verdictChanges` is an object, else null.
   `verdictChanges` keeps exactly its three keys.
3. [S3] `readerFingerprint`: when the `rev-parse` result carries `error`, return `gitReason: 'git could not be run (<code>)'`, and leave `git` and `dirty` null. When git answered that this is not a checkout, add no field.
   `atReason`'s `!readers.git` arm then reads `` `${readers.gitReason}, so the readers' commit is unknown` `` when `gitReason` is set, and "the plugin is not a git checkout" otherwise. `readersOfRun` passes the field through.
4. [S4] Record one killed mutant per Rests-on name, and add each to `tests/mutations.json`:
   - make `verdictChanges` null under PARTIAL again;
   - drop `look`;
   - set `notCompared` to 0;
   - drop the `gitReason` arm.
   [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/probe-attest-partial.test.mjs 2>&1) \
  && for t in 'a partial attestation counts the verdicts both runs read and names the rest' 'an attestation carries the look of its run' 'git that could not run is not called a missing checkout'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done \
  && node --test tests/corpus-probe.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a partial attestation counts the verdicts both runs read and names the rest` | `tests/probe-attest-partial.test.mjs` | through `--attest --since` on saved reports, the earlier one with a different readers digest. ADR-089 Context's PARTIAL pair gives `verdictChanges: { compared: 1, passToFail: 1, failToPass: 0 }` and `notCompared: 1`. DIRTY twins: an UNPROVEN `since` gives `verdictChanges` and `notCompared` both null; the same readers give null (ADR-082's rule, unchanged) | none | S1, S2 |
| `an attestation carries the look of its run` | `tests/probe-attest-partial.test.mjs` | `look` is `ok`, `PARTIAL` or `UNPROVEN` as the report says. A report whose top `look` is ok and whose `workNext.look` is PARTIAL gives `PARTIAL`. A report with neither gives null | none | S1, S2 |
| `git that could not run is not called a missing checkout` | `tests/probe-attest-partial.test.mjs` | `readerFingerprint` with a `run` failing `ENOENT` gives `gitReason`. The attestation over a look-ok report carrying it says `git could not be run (ENOENT)…`. CLEAN twin: a `run` that answers status 128 (not a work tree) still says `the plugin is not a git checkout` | none | S1, S3 |
| `an attestation that compared nothing says null, never zero` | `tests/corpus-probe.test.mjs` | the existing ADR-082 test, locked and unchanged: an UNPROVEN `since` is still null | none | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests |
| 2 — something selects it | `attestMain` calls `attestation`; the first test drives the CLI |
| 3 — the caller can discover it | `docs/corpus-reports/README.md`'s schema, which T3 updates |
| 4 — it is used | the next filed attestation carrying `look`; nothing measures this yet |

## Mutation Log
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · the attestation carries no look · acceptance-sha256:317cf53aa2c3e078ea263cdd0968482dfe140b8dfc5eaca6ab6eb57e36197445 · covers:the look field
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · verdictChanges is null under a PARTIAL look again · acceptance-sha256:317cf53aa2c3e078ea263cdd0968482dfe140b8dfc5eaca6ab6eb57e36197445 · covers:verdictChanges over a partial pair
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · notCompared reads 0 whatever was not compared · acceptance-sha256:317cf53aa2c3e078ea263cdd0968482dfe140b8dfc5eaca6ab6eb57e36197445 · covers:the notCompared count
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · git that could not run is called a missing checkout again · acceptance-sha256:317cf53aa2c3e078ea263cdd0968482dfe140b8dfc5eaca6ab6eb57e36197445 · covers:the git failure reason

## Invariants

- `verdictChanges` never carries a fourth key.
- An UNPROVEN run, different corpora or the same readers give `verdictChanges: null` and `notCompared: null`.
- `at` is unchanged in every case it was set before.

## Risks

- attest-import refuses the new keys until T3 lands, so T2 and T3 ship in one release.

## Stop Condition

Stop and ask if a locked test pins the attestation's key list or order, or if the PARTIAL reproduction gives anything but `passToFail: 1`.

## Out of Scope

- Filing and release rules — T3.

## Verification Log
- 2026-10-07 · 49bd0c3* · exit 1 · `out=$(node --test --test-reporter=tap tests/probe-attest-partial.test.mjs 2>&1) \ …` · acceptance-sha256:317cf53aa2c3e078ea263cdd0968482dfe140b8dfc5eaca6ab6eb57e36197445 · ms:280 · test-lock-sha256:261f6775ba0726ce8fc4f9a0e34767706429fbd7a38c1dd018773056a15e97bc · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCS0tZGlmZiBuYW1lcyB1bmRlY2lkZWQgcmVjb3JkcyB0aGF0IGNhbWUsIHdlbnQgb3IgY2hhbmdlZCByZWFzb24sIGFuZCBhbiBlbnZpcm9ubWVudCBjaGFuZ2UJMTdkMjU5YzA5MWY0YTg5MzE4OGZjYjNhMzg5MzY3ODJjOTIyZWY5ZWQzNWFkMzFkMTdmN2JkODU0MTAyODE2Nwpib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwlhIHJlY29yZCB0aGUgY29ycHVzIHJlYWRlciBuZXZlciBvcGVuZWQgaXMgbmFtZWQgdW5yZWFkLCBub3QgbGludGVkCWE5YTNkMzJiN2QxYzQ2MzBiZjI3YzJmNDQ1NGNjNzM2N2I2NTY2MWVhOTRlNzg4OWIzYTQxMjljNjgyMDQ5MjgKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJYW4gYWRyLWxpbnQgdmVyZGljdCB0aGF0IGlzIG9ubHkgYW4gZXhpdCBjb2RlIGNhcnJpZXMgd2hhdCB0aGUgZ2F0ZSBzYWlkCTQ1NzAwZDg0YWFlNjdkYjQ4NmFjOTgwYmExMGE3YWI1ZDhmODkwZTQzMTAwOGNhMjk0YjMzOWFlMDJiODQwMDEKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJYW4gYXR0ZXN0YXRpb24gY29tcGFyZXMgb25seSBhbiBlYXJsaWVyIHJlYWRpbmcsIGFuZCBjb3VudHMgZWFjaCByZWNvcmQgb25jZQk4MWRmNDEwODU5NmU2NmNhZTliYjUyMDdiNjdjOGNiZjA1ZDA1MWYwNjBkNDZkNGI2NzIwNDIxN2FhNGY2N2NkCmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCWFuIGF0dGVzdGF0aW9uIGNvdW50cyB0aGUgYWRyLWxpbnQgdmVyZGljdHMgdGhhdCBtb3ZlZCBzaW5jZSBhbiBlYXJsaWVyIHJlcG9ydAk2NGM3N2ZlNTQzMzRiNzI0NWI5NTU0ZmRjMmE5NTA3Y2Y1YTY1MmY3MzZmNTkyYTRkNWZkYzlkZmM2MGJhZTIyCmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCWFuIGF0dGVzdGF0aW9uIGZhbGxzIGJhY2sgdG8gY29ycHVzLXJlcG9ydCBjb3VudHMgd2hlbiB3b3JrLW5leHQgZGlkIG5vdCBhbnN3ZXIJYjc0Zjg0Y2IzMmMxMDUyYTZjZDcwNzQwZWQ1NTUzNTdlNjYxMGNlNDg1NWJkNDJkMGQ0NGI2NDhiM2JmZmIwNApib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwlhbiBhdHRlc3RhdGlvbiBoYXMgbm8gY29tbWl0IHdoZW4gdGhlIHJlYWRlcnMgbW92ZWQgZHVyaW5nIHRoZSBydW4sIGFuZCBzYXlzIHdoeSBpdCBoYXMgbm9uZQlhNzNlZDkxNjRkNDdhN2RlMjM3MDIyNmU3Yjc3Yzc3MTk3YjhlMGE3MjlhM2Y3Nzc4NGI0Njk1M2U3NzhmMGM0CmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCWFuIGF0dGVzdGF0aW9uIHRoYXQgY29tcGFyZWQgbm90aGluZyBzYXlzIG51bGwsIG5ldmVyIHplcm8JNmViMjQ1MDA3ZjkxMDI5MGNmYmMwOWVmNTViYWQ4ZDNiY2UzNzAyN2ViNzNlNDdmZmI4Y2Y5NzhjY2FhODIyNQpib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwljb21wYXJlUmVhZGVyczogYSBkaXJlY3Rvcnkgd29yay1uZXh0IGNvdWxkIG5vdCByZWFkIGlzIG5vdCBhIGRpc2FncmVlbWVudCwgYW5kIGEgY3Jhc2hlZCByZWFkZXIgY29tcGFyZXMgbm90aGluZwk1MTQ1ZjJlZjI4NTRkOWZjZGIxZGUwZDNlOWVlZDQxNzUzNjEyMjAxMTNhMDQ1Y2U5ZWVmYTgyMDBmYWJhNjQzCmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCWNvbXBhcmVSZWFkZXJzOiBhIHRhc2sgb2YgYSByZWNvcmQgdGhhdCBpcyBub3QgQWNjZXB0ZWQgaXMgbm90IGEgZGlzYWdyZWVtZW50CTNlYmZjNDY1ODIxN2Y5YzA0MTdiYjBiMDZmOTQ0MmY5N2RkOGNjOWVkYWJmYWM0ZjM3MTI5MWFjNWRlNjM1MzUKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJY29ycHVzLXByb2JlIC0tYXR0ZXN0IC0tc2luY2UgcHJpbnRzIHRoZSB2ZXJkaWN0IGNoYW5nZXMJN2M0ZTM2MDhiYmZiMzZlYzdkMjczODA5MTRlNDdiMWNhZTI4NzBkYjc3ZjE4ZGNhM2MzOThhM2ZiMDMwY2I4Ygpib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwljb3JwdXMtcHJvYmUgLS1hdHRlc3QgbGVhdmVzIGF0IG51bGwgb3ZlciBhIHByb2JlIHRoYXQgY291bGQgbm90IGxvb2sJMWQ5MjA3YTQyMTU0Zjk4MTNjMjAwMjJkNTQzYWJhZGM2NWIxOTg1YjFjNWQwZWEyYjE4OWJkODZjMmQ1Zjk0MApib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwljb3JwdXMtcHJvYmUgLS1hdHRlc3QgbGVhdmVzIGF0IG51bGwgb3ZlciB1bmNvbW1pdHRlZCByZWFkZXJzCWJiYWJhZTE2OWM3M2ZkNWY5ZjY2Nzc0Nzk5NzE1MmE5MDIyOWI0YTIwZWUyNWMxNDIyM2NjZjZkNTRiZmExZDUKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJY29ycHVzLXByb2JlIC0tYXR0ZXN0IHdyaXRlcyBhbiBhdHRlc3RhdGlvbiByZWxlYXNlLWV2aWRlbmNlIGFjY2VwdHMJZTVkYzFhNDlhNjI4YjdmOTI0MzAxODhlZjVlMTVkODAzN2M5ZDdiMDI3NGY1YWMxYTg1YWI0ZDQ2ODc5OWYzYQpib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwljb3JwdXMtcHJvYmUgLS1kaWZmIG5hbWVzIGEgY2hhbmdlZCBGQUlMIHJlYXNvbiwgYW5kIGEgZmlsZSB0aGF0IGlzIG5vdCBhIHJlcG9ydCBpcyByZWZ1c2VkIGNsZWFubHkJNzEzMjcxMTk4NTk0Zjg5NDNkMWZlM2ExZmViYTljZGMyODA0ZDk0ZmQ4NTlmZjM4OWZhM2U2ZTkyMzgxMzU0YQpib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwljb3JwdXMtcHJvYmUgLS1kaWZmIG5hbWVzIGEgcmVhZGVyIGFic2VudCBvbiBvbmUgc2lkZSBvbmNlCTJhYmM3Yzc5MTY2NzAxYWFjNjNmMmQzZDdiMzFkYTA5OTczYTA5YjIzYjU5OWY0MjkwN2Q1M2RiYmJiYzc2ZDAKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJY29ycHVzLXByb2JlIC0tZGlmZiBuYW1lcyB3aGF0IGNoYW5nZWQgYmV0d2VlbiB0d28gcnVucyBvZiBvbmUgY29ycHVzCWQ3MTEwNWViMzBmYjNjYWQwODc1ODE2MmU1ODI5ZWM5MjM2YzFiYzZmZjBlNDBmNTA4ZDY3NjFmYTMwN2ZkNzUKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJY29ycHVzLXByb2JlIC0tZGlmZiBvdmVyIHR3byBpZGVudGljYWwgcmVwb3J0cyBzYXlzIG5vdGhpbmcgY2hhbmdlZAkyMzg3MTE4YjM0MWU1Zjk2NzY0NDE2ZDIzMjYzODZhMGYyODMyMWFmOGMxOWM0N2U4MDIyNThiY2EyY2VhNmI3CmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCWNvcnB1cy1wcm9iZSAtLWRpZmYgcmUtc2NydWJzIGl0cyBpbnB1dHMgYW5kIG5ldmVyIGNvbXBhcmVzIGFuIHVucmVhZGFibGUgcnVuCTZjMzE1MzM3YTc0YTA4NzllNDlhOWJkM2FmY2UyYmYyYzE1MGQ1MzQ4ZmYzZTQzNWU4NTNkMDJjNmQ5OTA2YTEKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJZXZlcnkgcmVhZGVyIHNwYXduIGluIHRoZSBwcm9iZSByZXBvcnQgaXMgdGltZWQJZWEwNDBmYjM4YzE4OTc1MDIxMjczZDVhYWRhYmNmNTVmOWFiMDJiYmVhZjlhZGRjMTk1MmQ4MGEyZjVlMjNiOApib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwlmYWlsZWRUb1J1bjogYSBjaGlsZCBraWxsZWQgYXQgdGhlIGRlYWRsaW5lIGlzIHNhaWQgdG8gaGF2ZSBiZWVuIGtpbGxlZCwgd2l0aCB0aGUgYnVkZ2V0CWM5MWY3OTc0MjgwMmU0N2ZlOWI2NzlkZDUzZWI0NmI4YTEwNWEwNTRhY2RjMDlmZTczYWQ5NTFlNTQzNTk1NGEKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJcHJvYmU6IGEgY29ycHVzIHdpdGggcmVjb3JkcyBpcyBsaW50ZWQgd2l0aG91dCB3cml0aW5nLCBhbmQgYSByZWNvcmQgaXQgY2Fubm90IHVzZSBpcyBuYW1lZAkxM2RlOTFjMzlmNDQ0MDI0OTY1Y2RjNjVhYTYzMTFiMmEzZDhjYWQ5M2VjZWI0ZGFiODEyNmI1ZWFlY2JjZGQyCmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCXByb2JlOiBhIHJlY29yZCBoZWxkIGJhY2sgc2F5cyB3aHkg4oCUIGEgcGxhbiwgYW4gdW5rbm93biBzdGF0dXMsIG9yIG5vbmUgcmVhZAk2MmZmM2QwNWEzNjA4YmU1NzZhMGM5NDQyOGVkODVmNzc2ODIwNjMwNDBlZDdjOTZlMWQzNjkxZjQxZWY4YWNjCmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCXByb2JlOiBhIHJ1biBsZWF2ZXMgbm90aGluZyBpbiB0aGUgcHJvYmVkIHJlcG9zaXRvcnksIGl0cyBnaXQgZGlyIGluY2x1ZGVkCWNkOTZjY2I1NjVlMWYyMzQ2NjNhMGVmZDUxNjEyNmJhZWNlOTI2ZjBiMzM3ZDI0MjZjMzZiMjc1NjhkNmI5MjAKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJcHJvYmU6IGEgdGVtcCBkaXJlY3RvcnkgdGhhdCBkb2VzIG5vdCBleGlzdCBpcyBzYWlkLCBub3QgYSBzdGFjayB0cmFjZQk3NzM1OWQ5ZjFjZWEzODgwY2ZiYjM5ZTQ5MDg2NWRkM2VkOWM1NWI0YTQ0OWNjNGM5MzJkNzU5NTMzMWQwMzlmCmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCXNjcnViYmVyOiBldmVyeSBhYnNvbHV0ZSBwYXRoIGlzIGEgcGxhY2Vob2xkZXIsIGFuZCBhIHJlcG9zaXRvcnktcmVsYXRpdmUgb25lIGlzIHVudG91Y2hlZAlhNTM2OGNmMmQwNjE3ODI1ZDM4ZGNkMGZkOWY5NjNiNTYzNDIyYmNkNzZhNDI4MTE0MzhjZDExOTVlNDhjYzFkCmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCXN0YXRlRGlyOiBhbiBvdmVycmlkZSBrZWVwcyBlYWNoIHJlcG9zaXRvcnkgYXBhcnQJNGQ4NGEyMDI5NTE4Njk4MTI5ZmQ0M2M1NGQwOTRiMmQ3ODQxN2ZkNjNlOWQyMWYyNzllMDYwMjAwMTdlNzE1ZApib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwl0aGUgcHJvYmUgZmluZ2VycHJpbnRzIHRoZSByZWFkZXJzIGl0IHJhbgkyZDY4NTJhMzIyN2I0NjYzMzk1MWJiNmVhZTFkODcxOGNkNTkzNzVhMDFiNzQ1MDEwZTY1ZmEzYTM2ZTg0MDU0CmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCXRoZSByZWFkZXIgZmluZ2VycHJpbnQgY292ZXJzIGxpYiBhbmQgaG9va3MJNTYzNDQyNDZiYWQxNTdhNmVjNWFkMTFjZWRkNWFjOTZiNzVjMGU2ZGZjNmJhYzRjOGZlNDNjODYxOGIxYmE2MApib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwl1bmNvbW1pdHRlZCByZWFkZXIgZWRpdHMgbWFyayB0aGUgZmluZ2VycHJpbnQgZGlydHkJZjAwNmVhNTQ5ODEzMGFhYWUwZTI2N2I5MzgwNWE5OWI5OTUxMTdlMzcwNThjMmY5ZjA5ZGViNmQ3ODNlNzhkMQpib2R5CXRlc3RzL3Byb2JlLWF0dGVzdC1wYXJ0aWFsLnRlc3QubWpzCWEgcGFydGlhbCBhdHRlc3RhdGlvbiBjb3VudHMgdGhlIHZlcmRpY3RzIGJvdGggcnVucyByZWFkIGFuZCBuYW1lcyB0aGUgcmVzdAk4MTg0ZGI2Njg1ZmZjY2ZkM2M4Nzk4ZTM3M2Q5OGQ2Y2RlODgxOTMzMzk3YTkzMmIzMzE0MWZiMTRlOGI5YTE1CmJvZHkJdGVzdHMvcHJvYmUtYXR0ZXN0LXBhcnRpYWwudGVzdC5tanMJYW4gYXR0ZXN0YXRpb24gY2FycmllcyB0aGUgbG9vayBvZiBpdHMgcnVuCTg4YTBhN2MwMmMxZDE1NjNmODAxNjY2ZjVjMGRhYzcwZjI2MDhhYjA2OWViNGYyOTA3ZmFhZjllZjA2MDc2YTUKYm9keQl0ZXN0cy9wcm9iZS1hdHRlc3QtcGFydGlhbC50ZXN0Lm1qcwlnaXQgdGhhdCBjb3VsZCBub3QgcnVuIGlzIG5vdCBjYWxsZWQgYSBtaXNzaW5nIGNoZWNrb3V0CTQyYTFlZDA4YmU2ZWNjNjZkMTgxNDRhM2Q1OGM5MDc0ZTYxNGI4NWVkMDBiYzc2NDc0ODNjNDA5ZTJjZDgwODg
  ```
  ```
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/probe-attest-partial.test.mjs 2>&1) \ …` · acceptance-sha256:317cf53aa2c3e078ea263cdd0968482dfe140b8dfc5eaca6ab6eb57e36197445 · ms:7151
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/probe-attest-partial.test.mjs 2>&1) \ …` · acceptance-sha256:317cf53aa2c3e078ea263cdd0968482dfe140b8dfc5eaca6ab6eb57e36197445 · ms:7199
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/probe-attest-partial.test.mjs 2>&1) \ …` · acceptance-sha256:317cf53aa2c3e078ea263cdd0968482dfe140b8dfc5eaca6ab6eb57e36197445 · ms:7089
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/probe-attest-partial.test.mjs 2>&1) \ …` · acceptance-sha256:317cf53aa2c3e078ea263cdd0968482dfe140b8dfc5eaca6ab6eb57e36197445 · ms:7280
