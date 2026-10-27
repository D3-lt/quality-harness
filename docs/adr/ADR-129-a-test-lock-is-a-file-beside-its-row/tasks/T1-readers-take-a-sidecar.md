# Task ADR-129-T1: The readers take a sidecar lock

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (record.py's one lock reading)
**Owner:** unassigned
**Produces:** sidecar lock reading
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A row whose lock field is `test-lock-file:<path>` is read from that file, verified against the row's `test-lock-sha256:`, by
every gate that reads a lock; anything that cannot be shown is UNPROVEN; a `test-lock-b64:` row reads as before.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | `TEST_LOCK_FIELD` and its anonymous twin take `test-lock-file:`; `_recorded_lock` reads the file |
| `tests/lock-sidecar.test.mjs` | add | the invariant and its twins |
| `tests/mutations/plugin/lib/record.py.json` | edit | the mechanisms' mutants |

## Ordered Steps

1. [S1] Write `tests/lock-sidecar.test.mjs` in a repository the test creates: a task whose first red carries
   `test-lock-file:` and a tracked file with the payload reads the same lock map as the `test-lock-b64:` form, and adr-lint
   names a moved test (red today).
2. [S2] Add the twins: a missing file, an ignored one, one outside the repository, one whose bytes hash to another sha (a
   CRLF rewrite of the payload among them), and an unreadable one are each UNPROVEN with `done` withheld; an untracked one is
   read and advised; a relock after a sidecar first red keeps the first red's check (`first_check`); a `test-lock-b64:` row
   is unchanged.
3. [S3] Implement in record.py through one resolver used by every decode; list the path against `git ls-files` (CLAUDE.md §8), never `existsSync`.
4. [S4] Run adr-lint over this repository's corpus: no finding changes.

## Acceptance

```bash
node --test --test-reporter=tap tests/lock-sidecar.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a sidecar lock reads as its inline twin, and names a moved test` | `tests/lock-sidecar.test.mjs` | the reading | — | S1, S3 |
| `a sidecar that is missing, ignored, outside, altered or unreadable is UNPROVEN, and an untracked one is read` | `tests/lock-sidecar.test.mjs` | nothing reads as a pass | — | S2, S3 |
| `a relock after a sidecar first red keeps its check` | `tests/lock-sidecar.test.mjs` | the historical decode | — | S2, S3 |
| `every record this repository tracks passes its own adr-lint` | `tests/corpus-lint.test.mjs` | no corpus finding changes | — | S4 |

## Mutation Log
- 2026-10-27 · bc5618cd* · mutant killed · exit 1 · `plugin/lib/record.py` · a sidecar whose bytes do not hash to the row's sha is read as the lock · acceptance-sha256:306f5a6c7845a73843152209e57cf7b924e346143cbd17d1a5cc9122670d3d0d

## Invariants

- A `test-lock-b64:` row is read byte for byte as before; no existing finding changes.

## Risks

- A path that climbs out of the repository: refused as a lock that could not be read.

## Stop Condition

A reader outside record.py parses the lock field itself: stop and route it through record.py first.

## Out of Scope

- Writing sidecar rows (deferred: T2).

## Verification Log
- 2026-10-27 · bc5618cd* · exit 1 · `node --test --test-reporter=tap tests/lock-sidecar.test.mjs` · acceptance-sha256:306f5a6c7845a73843152209e57cf7b924e346143cbd17d1a5cc9122670d3d0d · ms:393 · test-lock-sha256:eac6586fa07f4715df18dab07d75b40b125e8a260b8d1e887799d72226dcd351 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvY29ycHVzLWxpbnQudGVzdC5tanMJZXZlcnkgcmVjb3JkIHRoaXMgcmVwb3NpdG9yeSB0cmFja3MgcGFzc2VzIGl0cyBvd24gYWRyLWxpbnQJNWU0NDVlNWFiNmRmOTU1ZDAyZGU1MDRhZDM2ZjNmNmJlNTRhOGI0YTVlNTc2Mjc3NzdmMmM3YWExOGE4NTRhNgpib2R5CXRlc3RzL2NvcnB1cy1saW50LnRlc3QubWpzCXRoZSBhcmNoaXZlLCB3aGVyZSB0aGVyZSBpcyBvbmUsIHBhc3NlcyBhZHItcmV0aXJlLWNoZWNrCWU3Njc1ZjBlZGJhMjI5MTczYmZjMzFlZmJlZGM2OTc3NmQwODUzZWVhYThkNDliMGFjNWRkMjg2MGQ2YTIxNDkKYm9keQl0ZXN0cy9jb3JwdXMtbGludC50ZXN0Lm1qcwl0aGlzIHJlcG9zaXRvcnkncyBvd24gZGVmZXJyYWwgcG9pbnRlcnMgYWxsIHJlc29sdmUgdW5kZXIgYWRyLWRlYnQJZmI0YTU2NGZhOWNjMzczZDUzN2YxNzE2NWI4NzcwZDRhNmEyZjA4YWE0NmEzMmQ5YzhhZjE2NTYxYzAzNzNjNApib2R5CXRlc3RzL2xvY2stc2lkZWNhci50ZXN0Lm1qcwlhIHJlbG9jayBhZnRlciBhIHNpZGVjYXIgZmlyc3QgcmVkIGtlZXBzIGl0cyBjaGVjawk0NGI3OWMzOTJlNjg0Mjc4NDYzZWU5MDM0OWZjMDM0ZWY0NjRmM2UwYzMxYzBiYzFmMzZkYWU1MWY1YTk4NTE1CmJvZHkJdGVzdHMvbG9jay1zaWRlY2FyLnRlc3QubWpzCWEgc2lkZWNhciBsb2NrIHJlYWRzIGFzIGl0cyBpbmxpbmUgdHdpbiwgYW5kIG5hbWVzIGEgbW92ZWQgdGVzdAliY2MwODY5MWVjYWJiY2E0ZTAwOTYzOGIwYjE5ZWMzYjc3ZmI0ZDQ1ODE5ZjEwOGU1ZTY5N2I1MDYzMDA0YmNjCmJvZHkJdGVzdHMvbG9jay1zaWRlY2FyLnRlc3QubWpzCWEgc2lkZWNhciB0aGF0IGlzIG1pc3NpbmcsIGlnbm9yZWQsIG91dHNpZGUsIGFsdGVyZWQgb3IgdW5yZWFkYWJsZSBpcyBVTlBST1ZFTiwgYW5kIGFuIHVudHJhY2tlZCBvbmUgaXMgcmVhZAljYTMyZmUwMTIxMGFkNDU0NmE2OWFjZTdjY2E0ZDcwMmRjNjc4ZmM3YmZjMTMxZmI4M2ZmODM0NjUyZDJiNzRh
  ```
  --- last 10 line(s) of stdout (of 101 after folding 104 raw)
    ...
  1..3
  # tests 3
  # suites 0
  # pass 0
  # fail 3
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 281.491
  ```
- 2026-10-27 · bc5618cd* · exit 0 · `node --test --test-reporter=tap tests/lock-sidecar.test.mjs` · acceptance-sha256:306f5a6c7845a73843152209e57cf7b924e346143cbd17d1a5cc9122670d3d0d · ms:657
- 2026-10-27 · bc5618cd* · exit 0 · `node --test --test-reporter=tap tests/lock-sidecar.test.mjs` · acceptance-sha256:306f5a6c7845a73843152209e57cf7b924e346143cbd17d1a5cc9122670d3d0d · ms:783
- 2026-10-27 · c0c7eaeb* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:306f5a6c7845a73843152209e57cf7b924e346143cbd17d1a5cc9122670d3d0d · ms:0 · test-lock-sha256:6b55dd0c819c62a03936fd5fbe433fb7b0a61e1f88b3766e80e074d9adb065d6 · test-lock-file:docs/adr/locks/6b55dd0c819c62a03936fd5fbe433fb7b0a61e1f88b3766e80e074d9adb065d6.lock · test-lock-kind:replace
- 2026-10-27 · c0c7eaeb* · exit 0 · `node --test --test-reporter=tap tests/lock-sidecar.test.mjs` · acceptance-sha256:306f5a6c7845a73843152209e57cf7b924e346143cbd17d1a5cc9122670d3d0d · ms:720
- 2026-10-27 · f95be254* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:306f5a6c7845a73843152209e57cf7b924e346143cbd17d1a5cc9122670d3d0d · ms:0 · test-lock-sha256:0253ae510a1bd8735b94347795df55266006ed295a4c136c4b6db594f4cc7f59 · test-lock-file:docs/adr/locks/0253ae510a1bd8735b94347795df55266006ed295a4c136c4b6db594f4cc7f59.lock · test-lock-kind:replace
- 2026-10-27 · f95be254* · exit 0 · `node --test --test-reporter=tap tests/lock-sidecar.test.mjs` · acceptance-sha256:306f5a6c7845a73843152209e57cf7b924e346143cbd17d1a5cc9122670d3d0d · ms:1310
