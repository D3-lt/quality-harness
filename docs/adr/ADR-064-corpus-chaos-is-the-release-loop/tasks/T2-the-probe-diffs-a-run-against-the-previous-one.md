# Task ADR-064-T2: The probe diffs two saved reports

**Depends-on:** T1, T4
**Covers:** none — no spec
**Estimated scope:** M (one pure function, one mode)
**Owner:** unassigned
**Produces:** `corpus-probe --diff <before.json> <after.json>`
**Consumes:** `probe.readers` (T1), `timings[]` (T4)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a changed verdict is named`, `an unchanged report says nothing changed`, `no absolute path leaves the runner`, `an unreadable run is never compared`

## Goal

`corpus-probe --diff <before.json> <after.json>` runs nothing. It reads two saved reports and prints only what changed:
- `probe.readers`;
- the counts;
- the adrLint verdict and reason, by file;
- the `ready`, `unbacked` and `readinessUnproven` sets;
- `couldNotRun` and `disagreements`;
- SessionStart lines added and removed;
- any timing that at least doubled AND grew by at least 1000 ms, so load noise on a fast reader is not a line.

Every value from either file goes through the probe's scrubber again before it is printed, because an older probe's scrubber leaked Windows paths.

Two identical reports print one line saying nothing changed. A field present in only one report is named as missing from the other, never compared as empty. Two reports whose `corpora` differ print that, and are not compared. So do two where either `look` is not `ok`.

Exit 0 when both files parse, whatever changed. Exit 2 with the reason when either does not parse.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/corpus-probe.mjs` | edit | `diffReports(before, after)`, pure; a `--diff` arm in the argument parser taking two values; the header comment's usage (:20) and `usage()` (:331) |
| `tests/corpus-probe.test.mjs` | edit | the tests below |
| `tests/mutations.json` | edit | mutants |

## Ordered Steps

1. [S1] Write the test(s) below and see each fail on an assertion (TDD red).
2. [S2] Add `diffReports` over two parsed reports, emitting scrubbed lines only. Wire `--diff <before> <after>` into `main` before any probe run, and add it to both usage sites.
3. [S3] Run the fence green, and record mutants with `adr-verify --mutant`: drop the adrLint verdict comparison; report every field as changed; skip the re-scrub. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/corpus-probe.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (corpus-probe --diff names what changed between two runs of one corpus|corpus-probe --diff over two identical reports says nothing changed|corpus-probe --diff re-scrubs its inputs and never compares an unreadable run)' | grep -qx 3
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `corpus-probe --diff names what changed between two runs of one corpus` | `tests/corpus-probe.test.mjs` | two reports differing in the readers, one adrLint verdict, one `unbacked` member and one timing past its floor produce exactly those four lines; a timing that doubled by under 1000 ms produces none; run through `main` as a process, so the mode is reachable | none | S1, S2 |
| `corpus-probe --diff over two identical reports says nothing changed` | `tests/corpus-probe.test.mjs` | the same report twice prints the no-change line and nothing else; a report missing `unbacked` is named as lacking it | none | S1, S2 |
| `corpus-probe --diff re-scrubs its inputs and never compares an unreadable run` | `tests/corpus-probe.test.mjs` | a report carrying `C:\Users\…` and a POSIX home path prints neither; different `corpora` and a `look: UNPROVEN` report each print the reason and no comparison | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `diffReports` |
| 2 — something selects it | the `--diff` arm in `main` |
| 3 — the caller can discover it | both usage sites and the corpus-chaos skill (T7) |
| 4 — it is used | every runner in the batch's chaos round |

## Mutation Log
- 2026-09-25 · 286cbb1* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · a changed adrLint verdict is not printed · acceptance-sha256:74e524044b0585d31cf77c3d1982b9cebef03e475a82f85414da85d719741613 · covers:a changed verdict is named
- 2026-09-25 · 286cbb1* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · two identical reports print nothing instead of saying so · acceptance-sha256:74e524044b0585d31cf77c3d1982b9cebef03e475a82f85414da85d719741613 · covers:an unchanged report says nothing changed
- 2026-09-25 · 286cbb1* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · values from the reports are printed unscrubbed · acceptance-sha256:74e524044b0585d31cf77c3d1982b9cebef03e475a82f85414da85d719741613 · covers:no absolute path leaves the runner
- 2026-09-25 · 286cbb1* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · a run that could not look is compared as if it had · acceptance-sha256:74e524044b0585d31cf77c3d1982b9cebef03e475a82f85414da85d719741613 · covers:an unreadable run is never compared

## Invariants

- The diff prints no absolute path.
- `--diff` spawns nothing and writes nothing.

## Risks

- A report from an older probe lacks new fields; the diff names them instead of reading them as empty.

## Stop Condition

Stop and ask if a useful diff needs a value the scrubber cannot make path-free.

## Out of Scope

- Diffing two reports of different corpora (permanent: boundary: the runner diffs its own corpus; a mismatch in `corpora` is reported, not compared)

## Verification Log
- 2026-09-25 · 286cbb1* · exit 1 · `set -o pipefail …` · acceptance-sha256:74e524044b0585d31cf77c3d1982b9cebef03e475a82f85414da85d719741613 · ms:1076 · test-lock-sha256:51b6a164f585701befd57af0dc6082ed46adcfcfc8b715381dcea312fab3d7ad · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwljb21wYXJlUmVhZGVyczogYSBkaXJlY3Rvcnkgd29yay1uZXh0IGNvdWxkIG5vdCByZWFkIGlzIG5vdCBhIGRpc2FncmVlbWVudCwgYW5kIGEgY3Jhc2hlZCByZWFkZXIgY29tcGFyZXMgbm90aGluZwk1MTQ1ZjJlZjI4NTRkOWZjZGIxZGUwZDNlOWVlZDQxNzUzNjEyMjAxMTNhMDQ1Y2U5ZWVmYTgyMDBmYWJhNjQzCmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCWNvbXBhcmVSZWFkZXJzOiBhIHRhc2sgb2YgYSByZWNvcmQgdGhhdCBpcyBub3QgQWNjZXB0ZWQgaXMgbm90IGEgZGlzYWdyZWVtZW50CTNlYmZjNDY1ODIxN2Y5YzA0MTdiYjBiMDZmOTQ0MmY5N2RkOGNjOWVkYWJmYWM0ZjM3MTI5MWFjNWRlNjM1MzUKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJY29ycHVzLXByb2JlIC0tZGlmZiBuYW1lcyB3aGF0IGNoYW5nZWQgYmV0d2VlbiB0d28gcnVucyBvZiBvbmUgY29ycHVzCWQ3MTEwNWViMzBmYjNjYWQwODc1ODE2MmU1ODI5ZWM5MjM2YzFiYzZmZjBlNDBmNTA4ZDY3NjFmYTMwN2ZkNzUKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJY29ycHVzLXByb2JlIC0tZGlmZiBvdmVyIHR3byBpZGVudGljYWwgcmVwb3J0cyBzYXlzIG5vdGhpbmcgY2hhbmdlZAkyMzg3MTE4YjM0MWU1Zjk2NzY0NDE2ZDIzMjYzODZhMGYyODMyMWFmOGMxOWM0N2U4MDIyNThiY2EyY2VhNmI3CmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCWNvcnB1cy1wcm9iZSAtLWRpZmYgcmUtc2NydWJzIGl0cyBpbnB1dHMgYW5kIG5ldmVyIGNvbXBhcmVzIGFuIHVucmVhZGFibGUgcnVuCTZjMzE1MzM3YTc0YTA4NzllNDlhOWJkM2FmY2UyYmYyYzE1MGQ1MzQ4ZmYzZTQzNWU4NTNkMDJjNmQ5OTA2YTEKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJZXZlcnkgcmVhZGVyIHNwYXduIGluIHRoZSBwcm9iZSByZXBvcnQgaXMgdGltZWQJZWEwNDBmYjM4YzE4OTc1MDIxMjczZDVhYWRhYmNmNTVmOWFiMDJiYmVhZjlhZGRjMTk1MmQ4MGEyZjVlMjNiOApib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwlmYWlsZWRUb1J1bjogYSBjaGlsZCBraWxsZWQgYXQgdGhlIGRlYWRsaW5lIGlzIHNhaWQgdG8gaGF2ZSBiZWVuIGtpbGxlZCwgd2l0aCB0aGUgYnVkZ2V0CWM5MWY3OTc0MjgwMmU0N2ZlOWI2NzlkZDUzZWI0NmI4YTEwNWEwNTRhY2RjMDlmZTczYWQ5NTFlNTQzNTk1NGEKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJcHJvYmU6IGEgcnVuIGxlYXZlcyBub3RoaW5nIGluIHRoZSBwcm9iZWQgcmVwb3NpdG9yeSwgaXRzIGdpdCBkaXIgaW5jbHVkZWQJY2Q5NmNjYjU2NWUxZjIzNDY2M2EwZWZkNTE2MTI2YmFlY2U5MjZmMGIzMzdkMjQyNmMzNmIyNzU2OGQ2YjkyMApib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwlzY3J1YmJlcjogZXZlcnkgYWJzb2x1dGUgcGF0aCBpcyBhIHBsYWNlaG9sZGVyLCBhbmQgYSByZXBvc2l0b3J5LXJlbGF0aXZlIG9uZSBpcyB1bnRvdWNoZWQJYTUzNjhjZjJkMDYxNzgyNWQzOGRjZDBmZDlmOTYzYjU2MzQyMmJjZDc2YTQyODExNDM4Y2QxMTk1ZTQ4Y2MxZApib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwlzdGF0ZURpcjogYW4gb3ZlcnJpZGUga2VlcHMgZWFjaCByZXBvc2l0b3J5IGFwYXJ0CTRkODRhMjAyOTUxODY5ODEyOWZkNDNjNTRkMDk0YjJkNzg0MTdmZDYzZTlkMjFmMjc5ZTA2MDIwMDE3ZTcxNWQKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJdGhlIHByb2JlIGZpbmdlcnByaW50cyB0aGUgcmVhZGVycyBpdCByYW4JMmQ2ODUyYTMyMjdiNDY2MzM5NTFiYjZlYWUxZDg3MThjZDU5Mzc1YTAxYjc0NTAxMGU2NWZhM2EzNmU4NDA1NApib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwl0aGUgcmVhZGVyIGZpbmdlcnByaW50IGNvdmVycyBsaWIgYW5kIGhvb2tzCTU2MzQ0MjQ2YmFkMTU3YTZlYzVhZDExY2VkZDVhYzk2Yjc1YzBlNmRmYzZiYWM0YzhmZTQzYzg2MThiMWJhNjAKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJdW5jb21taXR0ZWQgcmVhZGVyIGVkaXRzIG1hcmsgdGhlIGZpbmdlcnByaW50IGRpcnR5CWYwMDZlYTU0OTgxMzBhYWFlMGUyNjdiOTM4MDVhOTliOTk1MTE3ZTM3MDU4YzJmOWYwOWRlYjZkNzgzZTc4ZDE
  ```
  --- last 10 line(s) of stderr (of 153 after folding 154 raw)
    ...
  1..13
  # tests 13
  # suites 0
  # pass 10
  # fail 3
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 1023.526542
  ```
- 2026-09-25 · 286cbb1* · exit 0 · `set -o pipefail …` · acceptance-sha256:74e524044b0585d31cf77c3d1982b9cebef03e475a82f85414da85d719741613 · ms:1355
- 2026-09-25 · 286cbb1* · exit 0 · `set -o pipefail …` · acceptance-sha256:74e524044b0585d31cf77c3d1982b9cebef03e475a82f85414da85d719741613 · ms:1269
- 2026-09-25 · 286cbb1* · exit 0 · `set -o pipefail …` · acceptance-sha256:74e524044b0585d31cf77c3d1982b9cebef03e475a82f85414da85d719741613 · ms:1340
- 2026-09-25 · 286cbb1* · exit 0 · `set -o pipefail …` · acceptance-sha256:74e524044b0585d31cf77c3d1982b9cebef03e475a82f85414da85d719741613 · ms:1279
