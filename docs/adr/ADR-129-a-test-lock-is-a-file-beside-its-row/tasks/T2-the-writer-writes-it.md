# Task ADR-129-T2: adr-verify writes the lock to a sidecar

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (the two suffix writers, the file write, .gitattributes)
**Owner:** unassigned
**Produces:** sidecar lock rows
**Consumes:** sidecar lock reading (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`adr-verify` writes a lock's payload to `<corpus>/locks/<sha256>.lock`, before the row, and the row carries
`test-lock-file:` and no payload, for a first red, a recovery lock, `--relock` and `--replace-hashes`.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | `first_red_lock_suffix`, `lock_snapshot_suffix` return the sidecar form and the bytes to write |
| `plugin/bin/adr-verify` | edit | writes the file before appending the row; a file it cannot write is a run it refuses to record |
| `<corpus>/locks/.gitattributes` | written by the writer | `* text eol=lf`, so the bytes stay LF in any corpus |
| `tests/lock-sidecar-write.test.mjs` | add | the writer through the real `adr-verify` |
| `tests/path-length.test.mjs` | none | a sidecar path is 84 characters under `docs/adr/`, inside its 128 bound |
| `tests/mutations/plugin/lib/record.py.json`, `tests/mutations/plugin/bin/adr-verify.json` | edit | the mechanisms' mutants |

## Ordered Steps

1. [S1] Write `tests/lock-sidecar-write.test.mjs`: in a repository the test creates, `adr-verify` on a red task writes
   `docs/adr/locks/<sha>.lock` and a row with `test-lock-file:` and no `test-lock-b64:`; adr-lint reads it back (red today).
2. [S2] Add the twins: a recovery lock, `--relock` and `--replace-hashes` write the same form; a payload two tasks share is
   one file; a locks directory that cannot be written leaves no row; before its commit the sidecar is untracked and read
   with advice, after it adr-lint passes.
3. [S3] Implement; the file is written before the row.
4. [S4] Write `locks/.gitattributes` when absent and assert it with `git check-attr`.

## Acceptance

```bash
node --test --test-reporter=tap tests/lock-sidecar-write.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `adr-verify writes a first red's lock to a sidecar, and adr-lint reads it` | `tests/lock-sidecar-write.test.mjs` | the writer | — | S1, S3 |
| `a recovery lock and a relock write the same form, a shared payload is one file, and an unwritable directory leaves no row` | `tests/lock-sidecar-write.test.mjs` | the other writers and the order | — | S2, S3 |
| `the locks directory is held at LF in any corpus` | `tests/lock-sidecar-write.test.mjs` | `locks/.gitattributes` | — | S4 |

## Mutation Log
- 2026-10-27 · bc5618cd* · mutant killed · exit 1 · `plugin/lib/record.py` · the locks directory gets no LF attribute, so a Windows checkout could rewrite the bytes the sha is over · acceptance-sha256:e0a26571bc68fb46f410ca938f249dd422fc83ffdac19cca2aebcd90d36c2cb1

## Invariants

- A row never names a file that was not written; a row already written is never rewritten.

## Risks

- A commit that carries the row without the file: T1 makes it UNPROVEN, said by every gate.

## Stop Condition

The corpus root cannot be told from the record's path: stop and ask.

## Out of Scope

- Migrating existing rows (permanent: boundary: a Verification Log is never edited, CLAUDE.md §4).

## Verification Log
- 2026-10-27 · bc5618cd* · exit 1 · `node --test --test-reporter=tap tests/lock-sidecar-write.test.mjs` · acceptance-sha256:e0a26571bc68fb46f410ca938f249dd422fc83ffdac19cca2aebcd90d36c2cb1 · ms:941 · test-lock-sha256:627ed74e59c5ef1712c5d068a7aeee845dee3e7e5280b5d7f91921e0627dad33 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvbG9jay1zaWRlY2FyLXdyaXRlLnRlc3QubWpzCWEgcmVjb3ZlcnkgbG9jayBhbmQgYSByZWxvY2sgd3JpdGUgdGhlIHNhbWUgZm9ybSwgYSBzaGFyZWQgcGF5bG9hZCBpcyBvbmUgZmlsZSwgYW5kIGFuIHVud3JpdGFibGUgZGlyZWN0b3J5IGxlYXZlcyBubyByb3cJOTFhMTg2YzI0ZTU5MzU3ZDRhYTgyMWU5MTQyMTY4ZTI5MjVkYzRkOTNjMTQzYjI5N2YwNTk4NDgyMDY1ZGIxYQpib2R5CXRlc3RzL2xvY2stc2lkZWNhci13cml0ZS50ZXN0Lm1qcwlhZHItdmVyaWZ5IHdyaXRlcyBhIGZpcnN0IHJlZCdzIGxvY2sgdG8gYSBzaWRlY2FyLCBhbmQgYWRyLWxpbnQgcmVhZHMgaXQJMzkzYTZmODExZWExMWY0ZWQxZmQ0NjM0NjQzNTE5ZWIwYTU1YWNmZGEwODA1NGFkNzBiMDJlMTRjMjk3NDQzNApib2R5CXRlc3RzL2xvY2stc2lkZWNhci13cml0ZS50ZXN0Lm1qcwl0aGUgbG9ja3MgZGlyZWN0b3J5IGlzIGhlbGQgYXQgTEYgaW4gYW55IGNvcnB1cwkxNzdiZDhkYTQwMmM2OTYxMjdjNWEyNTI1MjlhM2IyNWZlYmQyMDE0ZGE3MmRkNmQ2YjI5ZWQ5Y2ZjNGVjODEw
  ```
  --- last 10 line(s) of stdout (of 78 after folding 78 raw)
    ...
  1..3
  # tests 3
  # suites 0
  # pass 0
  # fail 3
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 835.493542
  ```
- 2026-10-27 · bc5618cd* · exit 0 · `node --test --test-reporter=tap tests/lock-sidecar-write.test.mjs` · acceptance-sha256:e0a26571bc68fb46f410ca938f249dd422fc83ffdac19cca2aebcd90d36c2cb1 · ms:1333
- 2026-10-27 · bc5618cd* · exit 0 · `node --test --test-reporter=tap tests/lock-sidecar-write.test.mjs` · acceptance-sha256:e0a26571bc68fb46f410ca938f249dd422fc83ffdac19cca2aebcd90d36c2cb1 · ms:1508
