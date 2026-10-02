# Task ADR-082-T1: corpus-probe counts the verdicts that moved

**Depends-on:** none
**Covers:** F-1, F-2, F-3, F-4, UC1-S1, UC1-S2, UC1-S3
**Estimated scope:** S (one comparison extracted, one field, one flag)
**Owner:** unassigned
**Produces:** `verdictChanges` in the attestation JSON, `verdictMoves` in `plugin/scripts/corpus-probe.mjs`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `one comparison counts and prints`, `nothing compared is null`, `the flag reaches the attestation`

## Goal

`corpus-probe --attest <label> <report> --since <earlier>` prints an attestation whose `verdictChanges` counts the adr-lint verdicts that moved, from the same comparison `--diff` prints (ADR-082 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/corpus-probe.mjs` | edit | export `verdictMoves(before, after)`; `diffReports` prints its verdict lines from it; `attestation(report, label, { since })` counts it; `--attest … --since` parses and passes it; the header comment and usage line name the flag |
| `docs/corpus-reports/README.md` | edit | the schema shows `verdictChanges`, and the command shows `--since` |
| `plugin/skills/corpus-chaos/SKILL.md` | edit | the runner's commands pass `--since` with the earlier report |
| `tests/corpus-probe.test.mjs` | edit | remove `todo` from this task's three tests |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Remove `todo` from the three tests in this task's Tests table and record the red run (TDD red). [proof: acceptance]
2. [S2] Export `verdictMoves(before, after)`: for each adr-lint file in both reports whose verdict differs, `{ file, from, to, reason }`. `diffReports` prints its verdict lines from it, so its output is unchanged.
3. [S3] `attestation(report, label, { since })` counts `verdictMoves`: `compared` is the number of files in both, `passToFail` the moves out of PASS, `failToPass` the moves into PASS. It is null with no `since`, or when `diffReports` would not compare the two (a `look` other than ok, or different corpora).
4. [S4] `--attest <label> <report> --since <earlier>` reads the earlier report with `readReport` (unreadable → exit 2) and passes it; the usage line and the header comment name the flag. README and the corpus-chaos skill teach it.
5. [S5] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
T=$(mktemp)
node --test --test-reporter=tap tests/corpus-probe.test.mjs > "$T" 2>&1 \
  && for t in 'an attestation counts the adr-lint verdicts that moved since an earlier report' 'an attestation that compared nothing says null, never zero' 'corpus-probe --attest --since prints the verdict changes'; do test "$(grep -cxE "ok [0-9]+ - $t" "$T")" -eq 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an attestation counts the adr-lint verdicts that moved since an earlier report` | `tests/corpus-probe.test.mjs` | counts; PASS → could not run counted; one comparison with `--diff` | F-1, F-3, UC1-S1 | S2, S3 |
| `an attestation that compared nothing says null, never zero` | `tests/corpus-probe.test.mjs` | no `since`; other corpora; a report that did not look | F-2, UC1-S2 | S3 |
| `corpus-probe --attest --since prints the verdict changes` | `tests/corpus-probe.test.mjs` | the CLI prints it; an unreadable `--since` exits 2 | F-4, UC1-S3 | S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests |
| 2 — something selects it | `attestMain` passes `--since` |
| 3 — the caller can discover it | the usage line, the README and the corpus-chaos skill |
| 4 — it is used | every outside run filed from 3.8.0 |

## Mutation Log
- 2026-10-02 · 5d4559d* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · no verdict move is found, so neither the diff line nor the count appears · acceptance-sha256:ca65314934c69c2a51b312f15d5f7e4334bf151f46e0bf987857819656b74aad · covers:one comparison counts and prints
- 2026-10-02 · 5d4559d* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · two reports of different corpora are counted as if comparable · acceptance-sha256:ca65314934c69c2a51b312f15d5f7e4334bf151f46e0bf987857819656b74aad · covers:nothing compared is null
- 2026-10-02 · 5d4559d* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · the --since report never reaches the attestation · acceptance-sha256:ca65314934c69c2a51b312f15d5f7e4334bf151f46e0bf987857819656b74aad · covers:the flag reaches the attestation

## Invariants

- `--diff` prints exactly what it printed before.
- An attestation without `--since` is unchanged apart from `verdictChanges: null`.

## Risks

- A report from before `adrLint` existed has no field to compare: `verdictMoves` then compares nothing and the field is null.

## Stop Condition

Stop and ask if `diffReports`' existing tests change output.

## Out of Scope

- attest-import and release-evidence — T2 and T3.

## Verification Log
- 2026-10-02 · 5d4559d* · exit 1 · `T=$(mktemp) …` · acceptance-sha256:ca65314934c69c2a51b312f15d5f7e4334bf151f46e0bf987857819656b74aad · ms:6272 · test-lock-sha256:8396e443d1adc5496ba9d4355cf6487c95184cade484788157f159a4dca18c79 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCWEgcmVjb3JkIHRoZSBjb3JwdXMgcmVhZGVyIG5ldmVyIG9wZW5lZCBpcyBuYW1lZCB1bnJlYWQsIG5vdCBsaW50ZWQJYTlhM2QzMmI3ZDFjNDYzMGJmMjdjMmY0NDU0Y2M3MzY3YjY1NjYxZWE5NGU3ODg5YjNhNDEyOWM2ODIwNDkyOApib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwlhbiBhZHItbGludCB2ZXJkaWN0IHRoYXQgaXMgb25seSBhbiBleGl0IGNvZGUgY2FycmllcyB3aGF0IHRoZSBnYXRlIHNhaWQJNDU3MDBkODRhYWU2N2RiNDg2YWM5ODBiYTEwYTdhYjVkOGY4OTBlNDMxMDA4Y2EyOTRiMzM5YWUwMmI4NDAwMQpib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwlhbiBhdHRlc3RhdGlvbiBjb3VudHMgdGhlIGFkci1saW50IHZlcmRpY3RzIHRoYXQgbW92ZWQgc2luY2UgYW4gZWFybGllciByZXBvcnQJNjRjNzdmZTU0MzM0YjcyNDViOTU1NGZkYzJhOTUwN2NmNWE2NTJmNzM2ZjU5MmE0ZDVmZGM5ZGZjNjBiYWUyMgpib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwlhbiBhdHRlc3RhdGlvbiBmYWxscyBiYWNrIHRvIGNvcnB1cy1yZXBvcnQgY291bnRzIHdoZW4gd29yay1uZXh0IGRpZCBub3QgYW5zd2VyCWI3NGY4NGNiMzJjMTA1MmE2Y2Q3MDc0MGVkNTU1MzU3ZTY2MTBjZTQ4NTViZDQyZDBkNDRiNjQ4YjNiZmZiMDQKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJYW4gYXR0ZXN0YXRpb24gaGFzIG5vIGNvbW1pdCB3aGVuIHRoZSByZWFkZXJzIG1vdmVkIGR1cmluZyB0aGUgcnVuLCBhbmQgc2F5cyB3aHkgaXQgaGFzIG5vbmUJYTczZWQ5MTY0ZDQ3YTdkZTIzNzAyMjZlN2I3N2M3NzE5N2I4ZTBhNzI5YTNmNzc3ODRiNDY5NTNlNzc4ZjBjNApib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwlhbiBhdHRlc3RhdGlvbiB0aGF0IGNvbXBhcmVkIG5vdGhpbmcgc2F5cyBudWxsLCBuZXZlciB6ZXJvCTZlYjI0NTAwN2Y5MTAyOTBjZmJjMDllZjU1YmFkOGQzYmNlMzcwMjdlYjczZTQ3ZmZiOGNmOTc4Y2NhYTgyMjUKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJY29tcGFyZVJlYWRlcnM6IGEgZGlyZWN0b3J5IHdvcmstbmV4dCBjb3VsZCBub3QgcmVhZCBpcyBub3QgYSBkaXNhZ3JlZW1lbnQsIGFuZCBhIGNyYXNoZWQgcmVhZGVyIGNvbXBhcmVzIG5vdGhpbmcJNTE0NWYyZWYyODU0ZDlmY2RiMWRlMGQzZTllZWQ0MTc1MzYxMjIwMTEzYTA0NWNlOWVlZmE4MjAwZmFiYTY0Mwpib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwljb21wYXJlUmVhZGVyczogYSB0YXNrIG9mIGEgcmVjb3JkIHRoYXQgaXMgbm90IEFjY2VwdGVkIGlzIG5vdCBhIGRpc2FncmVlbWVudAkzZWJmYzQ2NTgyMTdmOWMwNDE3YmIwYjA2Zjk0NDJmOTdkZDhjYzllZGFiZmFjNGYzNzEyOTFhYzVkZTYzNTM1CmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCWNvcnB1cy1wcm9iZSAtLWF0dGVzdCAtLXNpbmNlIHByaW50cyB0aGUgdmVyZGljdCBjaGFuZ2VzCTdjNGUzNjA4YmJmYjM2ZWM3ZDI3MzgwOTE0ZTQ3YjFjYWUyODcwZGI3N2YxOGRjYTNjMzk4YTNmYjAzMGNiOGIKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJY29ycHVzLXByb2JlIC0tYXR0ZXN0IGxlYXZlcyBhdCBudWxsIG92ZXIgYSBwcm9iZSB0aGF0IGNvdWxkIG5vdCBsb29rCTFkOTIwN2E0MjE1NGY5ODEzYzIwMDIyZDU0M2FiYWRjNjViMTk4NWIxYzVkMGVhMmIxODliZDg2YzJkNWY5NDAKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJY29ycHVzLXByb2JlIC0tYXR0ZXN0IGxlYXZlcyBhdCBudWxsIG92ZXIgdW5jb21taXR0ZWQgcmVhZGVycwliYmFiYWUxNjljNzNmZDVmOWY2Njc3NDc5OTcxNTJhOTAyMjliNGEyMGVlMjVjMTQyMjNjY2Y2ZDU0YmZhMWQ1CmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCWNvcnB1cy1wcm9iZSAtLWF0dGVzdCB3cml0ZXMgYW4gYXR0ZXN0YXRpb24gcmVsZWFzZS1ldmlkZW5jZSBhY2NlcHRzCWU1ZGMxYTQ5YTYyOGI3ZjkyNDMwMTg4ZWY1ZTE1ZDgwMzdjOWQ3YjAyNzRmNWFjMWE4NWFiNGQ0Njg3OTlmM2EKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJY29ycHVzLXByb2JlIC0tZGlmZiBuYW1lcyBhIGNoYW5nZWQgRkFJTCByZWFzb24sIGFuZCBhIGZpbGUgdGhhdCBpcyBub3QgYSByZXBvcnQgaXMgcmVmdXNlZCBjbGVhbmx5CTcxMzI3MTE5ODU5NGY4OTQzZDFmZTNhMWZlYmE5Y2RjMjgwNGQ5NGZkODU5ZmYzODlmYTNlNmU5MjM4MTM1NGEKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJY29ycHVzLXByb2JlIC0tZGlmZiBuYW1lcyBhIHJlYWRlciBhYnNlbnQgb24gb25lIHNpZGUgb25jZQkyYWJjN2M3OTE2NjcwMWFhYzYzZjJkM2Q3YjMxZGEwOTk3M2EwOWIyM2I1OTlmNDI5MDdkNTNkYmJiYmM3NmQwCmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCWNvcnB1cy1wcm9iZSAtLWRpZmYgbmFtZXMgd2hhdCBjaGFuZ2VkIGJldHdlZW4gdHdvIHJ1bnMgb2Ygb25lIGNvcnB1cwlkNzExMDVlYjMwZmIzY2FkMDg3NTgxNjJlNTgyOWVjOTIzNmMxYmM2ZmYwZTQwZjUwOGQ2NzYxZmEzMDdmZDc1CmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCWNvcnB1cy1wcm9iZSAtLWRpZmYgb3ZlciB0d28gaWRlbnRpY2FsIHJlcG9ydHMgc2F5cyBub3RoaW5nIGNoYW5nZWQJMjM4NzExOGIzNDFlNWY5Njc2NDQxNmQyMzI2Mzg2YTBmMjgzMjFhZjhjMTljNDdlODAyMjU4YmNhMmNlYTZiNwpib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwljb3JwdXMtcHJvYmUgLS1kaWZmIHJlLXNjcnVicyBpdHMgaW5wdXRzIGFuZCBuZXZlciBjb21wYXJlcyBhbiB1bnJlYWRhYmxlIHJ1bgk2YzMxNTMzN2E3NGEwODc5ZTQ5YTliZDNhZmNlMmJmMmMxNTBkNTM0OGZmM2U0MzVlODUzZDAyYzZkOTkwNmExCmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCWV2ZXJ5IHJlYWRlciBzcGF3biBpbiB0aGUgcHJvYmUgcmVwb3J0IGlzIHRpbWVkCWVhMDQwZmIzOGMxODk3NTAyMTI3M2Q1YWFkYWJjZjU1ZjlhYjAyYmJlYWY5YWRkYzE5NTJkODBhMmY1ZTIzYjgKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJZmFpbGVkVG9SdW46IGEgY2hpbGQga2lsbGVkIGF0IHRoZSBkZWFkbGluZSBpcyBzYWlkIHRvIGhhdmUgYmVlbiBraWxsZWQsIHdpdGggdGhlIGJ1ZGdldAljOTFmNzk3NDI4MDJlNDdmZTliNjc5ZGQ1M2ViNDZiOGExMDVhMDU0YWNkYzA5ZmU3M2FkOTUxZTU0MzU5NTRhCmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCXByb2JlOiBhIGNvcnB1cyB3aXRoIHJlY29yZHMgaXMgbGludGVkIHdpdGhvdXQgd3JpdGluZywgYW5kIGEgcmVjb3JkIGl0IGNhbm5vdCB1c2UgaXMgbmFtZWQJMTNkZTkxYzM5ZjQ0NDAyNDk2NWNkYzY1YWE2MzExYjJhM2Q4Y2FkOTNlY2ViNGRhYjgxMjZiNWVhZWNiY2RkMgpib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwlwcm9iZTogYSBydW4gbGVhdmVzIG5vdGhpbmcgaW4gdGhlIHByb2JlZCByZXBvc2l0b3J5LCBpdHMgZ2l0IGRpciBpbmNsdWRlZAljZDk2Y2NiNTY1ZTFmMjM0NjYzYTBlZmQ1MTYxMjZiYWVjZTkyNmYwYjMzN2QyNDI2YzM2YjI3NTY4ZDZiOTIwCmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCXNjcnViYmVyOiBldmVyeSBhYnNvbHV0ZSBwYXRoIGlzIGEgcGxhY2Vob2xkZXIsIGFuZCBhIHJlcG9zaXRvcnktcmVsYXRpdmUgb25lIGlzIHVudG91Y2hlZAlhNTM2OGNmMmQwNjE3ODI1ZDM4ZGNkMGZkOWY5NjNiNTYzNDIyYmNkNzZhNDI4MTE0MzhjZDExOTVlNDhjYzFkCmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCXN0YXRlRGlyOiBhbiBvdmVycmlkZSBrZWVwcyBlYWNoIHJlcG9zaXRvcnkgYXBhcnQJNGQ4NGEyMDI5NTE4Njk4MTI5ZmQ0M2M1NGQwOTRiMmQ3ODQxN2ZkNjNlOWQyMWYyNzllMDYwMjAwMTdlNzE1ZApib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwl0aGUgcHJvYmUgZmluZ2VycHJpbnRzIHRoZSByZWFkZXJzIGl0IHJhbgkyZDY4NTJhMzIyN2I0NjYzMzk1MWJiNmVhZTFkODcxOGNkNTkzNzVhMDFiNzQ1MDEwZTY1ZmEzYTM2ZTg0MDU0CmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCXRoZSByZWFkZXIgZmluZ2VycHJpbnQgY292ZXJzIGxpYiBhbmQgaG9va3MJNTYzNDQyNDZiYWQxNTdhNmVjNWFkMTFjZWRkNWFjOTZiNzVjMGU2ZGZjNmJhYzRjOGZlNDNjODYxOGIxYmE2MApib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwl1bmNvbW1pdHRlZCByZWFkZXIgZWRpdHMgbWFyayB0aGUgZmluZ2VycHJpbnQgZGlydHkJZjAwNmVhNTQ5ODEzMGFhYWUwZTI2N2I5MzgwNWE5OWI5OTUxMTdlMzcwNThjMmY5ZjA5ZGViNmQ3ODNlNzhkMQ
  ```
  ```
- 2026-10-02 · 5d4559d* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:ca65314934c69c2a51b312f15d5f7e4334bf151f46e0bf987857819656b74aad · ms:6375
- 2026-10-02 · 5d4559d* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:ca65314934c69c2a51b312f15d5f7e4334bf151f46e0bf987857819656b74aad · ms:6195
- 2026-10-02 · 5d4559d* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:ca65314934c69c2a51b312f15d5f7e4334bf151f46e0bf987857819656b74aad · ms:6446
