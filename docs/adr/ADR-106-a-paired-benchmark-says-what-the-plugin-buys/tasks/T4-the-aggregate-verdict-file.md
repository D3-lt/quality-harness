# Task ADR-106-T4: The aggregate verdict file

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one flag, one writer and its test)
**Owner:** unassigned
**Produces:** `--verdict-out` and the verdict file's keys (`scripts/eval-paired.mjs`)
**Consumes:** the paired-rows format, the pre-registration's fields and the verdict words (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

The scorer writes one aggregate verdict file per scored model, holding only the keys Decision 8's exception allows (amended
2026-10-17), and a writer handed any other key refuses and writes nothing.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/eval-paired.mjs` | edit | `--verdict-out <file>` in scoring mode; the allow-listed writer |
| `tests/eval-paired.test.mjs` | edit | the test below, over synthetic rows only (CLAUDE.md §6) |
| `tests/mutations/scripts/eval-paired.mjs.json` | edit | a catalogue mutant that widens the allow list |

## Ordered Steps

1. [S1] Write the test and record the red run (TDD red: the flag does not exist).
2. [S2] Build the verdict object from a fixed allow list of keys: the instance counts, each arm's cells and rates, the paired
   counts, the permutation p, the bootstrap percentiles, the verdict word and its reasons, the pre-registration's sha-256 and
   the scorer's blob sha. No per-instance row, difference or instance list is reachable from it.
3. [S3] Before writing, walk the object; any key outside the allow list refuses the write: nothing is written, the
   refusal names the key on stderr, exit 2. `--verdict-out` is refused with `--plan`, since a pilot has no verdict.
4. [S4] Add the catalogue mutant and record a killed mutant. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/eval-paired.test.mjs 2>&1) || exit 1
name='the verdict file holds only the aggregate, and any other key is refused'
test "$(printf '%s\n' "$out" | sed -E 's/^ok [0-9]+ - //' | grep -cxF "$name")" = 1 || exit 1
! printf '%s\n' "$out" | grep -qE '^not ok|# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the verdict file holds only the aggregate, and any other key is refused` | `tests/eval-paired.test.mjs` | `--verdict-out` writes a file whose keys are exactly the allow list and whose verdict and sha-256s match the printed ones; DIRTY twin: the writer handed an object carrying a `rows` key, or an instance list, writes nothing and exits 2 naming the key; `--verdict-out` with `--plan` is refused | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the writer, tested directly |
| 2 — something selects it | `main()` reads `--verdict-out`; the test drives `main()` |
| 3 — the caller can discover it | `--help` names `--verdict-out` and the keys |
| 4 — it is used | T3 writes one file per model |

## Mutation Log
- 2026-10-17 · d157f072* · mutant killed · exit 1 · `scripts/eval-paired.mjs` · verdict allow list: a rows key holding an instance list is allowed into the verdict file · acceptance-sha256:e004e2c704bf927e47ed1690fb70f6b027fdc01db8dbd0126eea20aaf6d06495

## Invariants

- The scorer still writes nothing unless `--verdict-out` is given, and exits 0 whatever verdict it finds.
- No per-instance row, transcript or model output can reach the file (Decision 8 as amended).

## Risks

- A later change adds a key to the verdict object and to the allow list together; the allow list is one constant, so the
  diff shows it.

## Stop Condition

Stop and ask if a cell the sign-off needs cannot be expressed without per-instance data.

## Out of Scope

- Writing `docs/BENCHMARKS.md` from the file (permanent: boundary: T3 quotes it by hand, with its configuration and date)

## Verification Log
- 2026-10-17 · d157f072* · exit 1 · `out=$(node --test --test-reporter=tap tests/eval-paired.test.mjs 2>&1) || exit 1 …` · acceptance-sha256:e004e2c704bf927e47ed1690fb70f6b027fdc01db8dbd0126eea20aaf6d06495 · ms:1687 · test-lock-sha256:9b7304a71d7815b832de2b2f3ae84747db29f54dbbf3b98c4a4313e2f7704347 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvZXZhbC1wYWlyZWQudGVzdC5tanMJYSBnYXAgYmV0d2VlbiB0aGUgYXJtcyBpbiB1bnJ1biBvciB1bnJlYWRhYmxlIHJ1bnMgaXMgaW5jb25jbHVzaXZlCTVmMDI5N2Q1MWE4NDE2YzI0MmYzNmViMzU4NmI5Y2JkNDRkMjk2ZGI4ODBkNmJkNTUyMzg4MjUxZjIwNmM1ZDEKYm9keQl0ZXN0cy9ldmFsLXBhaXJlZC50ZXN0Lm1qcwlhIHJ1biBpcyBzY29yZWQgb25seSBhZ2FpbnN0IGl0cyBjb21taXR0ZWQgcHJlLXJlZ2lzdHJhdGlvbgljYzM0YTQzNjZiYTcwYmZhZmZhMTBiZTQyZWYwOTM1MzhkZGNiN2UyNTVhMzE2MjhiNzJhN2I4ZjU4ODVmMzcwCmJvZHkJdGVzdHMvZXZhbC1wYWlyZWQudGVzdC5tanMJYW4gaW5mcmFzdHJ1Y3R1cmUgZmFpbHVyZSBpcyBVTlJVTiwgYW5kIGEgcnVuIHRoYXQgaGl0IGl0cyBsaW1pdCBpcyBqdWRnZWQJMWYyNmY0OTYzYmI5YWEwYzFjOGI5M2YwY2IzYTJiMzMxYmU1MzMxMzNiNDRhYWE1MTgyYWRkNWMxNGI3OWViNApib2R5CXRlc3RzL2V2YWwtcGFpcmVkLnRlc3QubWpzCWFuIHVucmVhZGFibGUgU1RBVFVTIGxpbmUgaXMgbm8gY2xhaW0gYW5kIHN0aWxsIGNvdW50cyBmb3IgcmVzb2x2ZSBpbmNpZGVuY2UJYmJiNmQ5MDRiNDM3NTdhYjUwNjlkYWEyM2U4ZTA0MjlhMTlhYmQzYjNjMmU2MGZkZDNjZWY3ZGIzZDdiNGEyNgpib2R5CXRlc3RzL2V2YWwtcGFpcmVkLnRlc3QubWpzCXBhaXJpbmcgaXMgcGVyIG1ldHJpYyBhbmQgY291bnRzIGV2ZXJ5IHByZS1yZWdpc3RlcmVkIGluc3RhbmNlCWNlNjdlYTc3N2ZjOGFiMzMzMjVhMmI0OGM1YTkzMmRlNWI5OThiN2JkYTRmNmZmYzAwZjNhNTI1NTY2NTIzNzUKYm9keQl0ZXN0cy9ldmFsLXBhaXJlZC50ZXN0Lm1qcwl0aGUgYm9vdHN0cmFwIHBlcmNlbnRpbGVzIGFyZSB0aGUgcGFpcmVkIGRpZmZlcmVuY2UgaXRzZWxmIG9uIGEgY29uc3RhbnQgc2V0CTYxYzg1ZmQwNmQyOTMwY2U3YTNhNmQ1Mzk3YjEzYjBkOTcyZDI3NzU1NzRmMTI1MTZlMDM1OWU2NWFlMjlmYjQKYm9keQl0ZXN0cy9ldmFsLXBhaXJlZC50ZXN0Lm1qcwl0aGUgcGVybXV0YXRpb24gcCBpcyBleGFjdCBvbiBhIHNtYWxsIHNldCBhbmQgY29ycmVjdCBvbiBhIGxhcmdlIG9uZQkxZDExY2ZjN2QxNmU0NTQ2Njk0MTQ1MjI0MjQ4MmQ3MmNkMTFlMWM1YjU5ZTQ4OTBiMWJkNGNmZWU4NzNlZWY2CmJvZHkJdGVzdHMvZXZhbC1wYWlyZWQudGVzdC5tanMJdGhlIHBsYW5uaW5nIG91dHB1dCBuYW1lcyBlYWNoIFNELCBpdHMgdXBwZXIgYm91bmQgYW5kIHRoZSBuIGl0IGltcGxpZXMJYjRlYWQ2ZjY2NzBkN2MwMGUyYzcxZjNhYTA0ZjBmN2RkYjdkN2I1NTRmYjczM2VhYTlkODczOTRhNjBkZTA5Nwpib2R5CXRlc3RzL2V2YWwtcGFpcmVkLnRlc3QubWpzCXRoZSB2ZXJkaWN0IGZvbGxvd3MgdGhlIHByZS1yZWdpc3RlcmVkIG9yZGVyLCBhbmQgYSBibGFua2V0IGhlZGdlciBkb2VzIG5vdCByZWFjaCBTSE9XTgkxYmIwNDliNGQ5NzZmOGZmYWE5MjRmYzQzYzc4MzY1ODQxM2MzODBkYmRkYzdmNmRmZDM3ZmQ1M2ViN2JiZWZkCnVucHJvdmVuCXRlc3RzL2V2YWwtcGFpcmVkLnRlc3QubWpzCXRoZSB2ZXJkaWN0IGZpbGUgaG9sZHMgb25seSB0aGUgYWdncmVnYXRlLCBhbmQgYW55IG90aGVyIGtleSBpcyByZWZ1c2Vk
  ```
  ```
- 2026-10-17 · d157f072* · exit 0 · `out=$(node --test --test-reporter=tap tests/eval-paired.test.mjs 2>&1) || exit 1 …` · acceptance-sha256:e004e2c704bf927e47ed1690fb70f6b027fdc01db8dbd0126eea20aaf6d06495 · ms:1523
- 2026-10-17 · d157f072* · exit 0 · `out=$(node --test --test-reporter=tap tests/eval-paired.test.mjs 2>&1) || exit 1 …` · acceptance-sha256:e004e2c704bf927e47ed1690fb70f6b027fdc01db8dbd0126eea20aaf6d06495 · ms:1534
- 2026-10-17 · human-observed · New test reviewed and approved by the coordinator, 2026-10-17: 'the verdict file holds only the aggregate, and any other key is refused' drives main() for the written keys, sha-256s and absent instance ids, and the writer directly for six dirty shapes (rows, an instance list, diffs, an object reason), each writing nothing with exit 2.
- 2026-10-17 · d157f072* · exit 0 · `adr-verify --relock` · acceptance-sha256:e004e2c704bf927e47ed1690fb70f6b027fdc01db8dbd0126eea20aaf6d06495 · ms:0 · test-lock-sha256:10ce2df9390e7ab7d65746eef884caa378fda69917b69a6f02becab5665a3082 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvZXZhbC1wYWlyZWQudGVzdC5tanMJYSBnYXAgYmV0d2VlbiB0aGUgYXJtcyBpbiB1bnJ1biBvciB1bnJlYWRhYmxlIHJ1bnMgaXMgaW5jb25jbHVzaXZlCTVmMDI5N2Q1MWE4NDE2YzI0MmYzNmViMzU4NmI5Y2JkNDRkMjk2ZGI4ODBkNmJkNTUyMzg4MjUxZjIwNmM1ZDEKYm9keQl0ZXN0cy9ldmFsLXBhaXJlZC50ZXN0Lm1qcwlhIHJ1biBpcyBzY29yZWQgb25seSBhZ2FpbnN0IGl0cyBjb21taXR0ZWQgcHJlLXJlZ2lzdHJhdGlvbgljYzM0YTQzNjZiYTcwYmZhZmZhMTBiZTQyZWYwOTM1MzhkZGNiN2UyNTVhMzE2MjhiNzJhN2I4ZjU4ODVmMzcwCmJvZHkJdGVzdHMvZXZhbC1wYWlyZWQudGVzdC5tanMJYW4gaW5mcmFzdHJ1Y3R1cmUgZmFpbHVyZSBpcyBVTlJVTiwgYW5kIGEgcnVuIHRoYXQgaGl0IGl0cyBsaW1pdCBpcyBqdWRnZWQJMWYyNmY0OTYzYmI5YWEwYzFjOGI5M2YwY2IzYTJiMzMxYmU1MzMxMzNiNDRhYWE1MTgyYWRkNWMxNGI3OWViNApib2R5CXRlc3RzL2V2YWwtcGFpcmVkLnRlc3QubWpzCWFuIHVucmVhZGFibGUgU1RBVFVTIGxpbmUgaXMgbm8gY2xhaW0gYW5kIHN0aWxsIGNvdW50cyBmb3IgcmVzb2x2ZSBpbmNpZGVuY2UJYmJiNmQ5MDRiNDM3NTdhYjUwNjlkYWEyM2U4ZTA0MjlhMTlhYmQzYjNjMmU2MGZkZDNjZWY3ZGIzZDdiNGEyNgpib2R5CXRlc3RzL2V2YWwtcGFpcmVkLnRlc3QubWpzCXBhaXJpbmcgaXMgcGVyIG1ldHJpYyBhbmQgY291bnRzIGV2ZXJ5IHByZS1yZWdpc3RlcmVkIGluc3RhbmNlCWNlNjdlYTc3N2ZjOGFiMzMzMjVhMmI0OGM1YTkzMmRlNWI5OThiN2JkYTRmNmZmYzAwZjNhNTI1NTY2NTIzNzUKYm9keQl0ZXN0cy9ldmFsLXBhaXJlZC50ZXN0Lm1qcwl0aGUgYm9vdHN0cmFwIHBlcmNlbnRpbGVzIGFyZSB0aGUgcGFpcmVkIGRpZmZlcmVuY2UgaXRzZWxmIG9uIGEgY29uc3RhbnQgc2V0CTYxYzg1ZmQwNmQyOTMwY2U3YTNhNmQ1Mzk3YjEzYjBkOTcyZDI3NzU1NzRmMTI1MTZlMDM1OWU2NWFlMjlmYjQKYm9keQl0ZXN0cy9ldmFsLXBhaXJlZC50ZXN0Lm1qcwl0aGUgcGVybXV0YXRpb24gcCBpcyBleGFjdCBvbiBhIHNtYWxsIHNldCBhbmQgY29ycmVjdCBvbiBhIGxhcmdlIG9uZQkxZDExY2ZjN2QxNmU0NTQ2Njk0MTQ1MjI0MjQ4MmQ3MmNkMTFlMWM1YjU5ZTQ4OTBiMWJkNGNmZWU4NzNlZWY2CmJvZHkJdGVzdHMvZXZhbC1wYWlyZWQudGVzdC5tanMJdGhlIHBsYW5uaW5nIG91dHB1dCBuYW1lcyBlYWNoIFNELCBpdHMgdXBwZXIgYm91bmQgYW5kIHRoZSBuIGl0IGltcGxpZXMJYjRlYWQ2ZjY2NzBkN2MwMGUyYzcxZjNhYTA0ZjBmN2RkYjdkN2I1NTRmYjczM2VhYTlkODczOTRhNjBkZTA5Nwpib2R5CXRlc3RzL2V2YWwtcGFpcmVkLnRlc3QubWpzCXRoZSB2ZXJkaWN0IGZpbGUgaG9sZHMgb25seSB0aGUgYWdncmVnYXRlLCBhbmQgYW55IG90aGVyIGtleSBpcyByZWZ1c2VkCWEyMGU0MzRkMzExNTQyNWYyMDJkNjNjYjExMTI3NjU3ZmQ1MDBiNzhiYTBlYzg5YjUzOWYxZjBlZGE4MjM3YjIKYm9keQl0ZXN0cy9ldmFsLXBhaXJlZC50ZXN0Lm1qcwl0aGUgdmVyZGljdCBmb2xsb3dzIHRoZSBwcmUtcmVnaXN0ZXJlZCBvcmRlciwgYW5kIGEgYmxhbmtldCBoZWRnZXIgZG9lcyBub3QgcmVhY2ggU0hPV04JMWJiMDQ5YjRkOTc2ZjhmZmFhOTI0ZmM0M2M3ODM2NTg0MTNjMzgwZGJkZGM3ZjZkZmQzN2ZkNTNlYjdiYmVmZA · test-lock-kind:relock
- 2026-10-17 · human-observed · T4 approved by the coordinator, 2026-10-17: the note above quotes the test's name, and its last word is part of that name, not a verdict. The verdict-file test is reviewed and signed off.
