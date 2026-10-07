# Task ADR-087-T4: numbered files outside a record directory are named as not read

**Depends-on:** T1
**Covers:** F-9, UC2-S1, UC2-S2
**Estimated scope:** M (work-next.mjs and corpus-probe.mjs, their tests and campaign entries)
**Owner:** unassigned
**Produces:** work-next JSON `notRead` (`[{ file }]`) and one text line; corpus-probe `workNext.notRead`, and a `notRead` field in `--diff`
**Consumes:** `frontmatterBlock` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the numbered-name filter`, `the record-directory exclusion`

## Goal

work-next and corpus-probe name each tracked `.md` file that sits outside every record directory, has a numbered basename and has a frontmatter `status:` key. `look` does not change.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/work-next.mjs` | edit | `notRead` beside `undecidedNamed` (`:595`), from the tracked listing work-next already reads; one text line after the record counts, naming the count and the first three, with `--json for all` past three |
| `plugin/scripts/corpus-probe.mjs` | edit | carry `workNext.notRead` beside `partialBecause` (`:439`), and name it in `--diff` (`:511`) |
| `tests/corpus-shapes.test.mjs` | edit | this task's two tests |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write this task's two tests and record the red run (TDD red). Today work-next prints "no QH corpus is in use" over the data corpus and names nothing.
2. [S2] Read how `tests/corpus-matrix.test.mjs` compares `workNext`. If it compares only the keys an `expected.json` lists, no other corpus changes. If it compares the whole object, stop (Stop Condition). [proof: human: the executor reads the matrix's comparison of `workNext` and writes which form it is into this task's prose]
   Read 2026-10-07: `tests/corpus-matrix.test.mjs:99-110` compares eight fixed `workNext` keys, plus only the other keys an `expected.json` names, so no other corpus changes. `yaml-frontmatter` (T5) names `notRead`.
3. [S3] Compute `notRead` from the tracked `.md` listing. Keep a file when no path component matches lifecycle's `RECORD_DIRECTORY`, its basename matches `^[A-Za-z]*-?\d{2,}[-_]`, and `frontmatterBlock` holds a line matching `^status\s*:` in any case. Read at most the first 64 lines of each candidate, and only the ones whose name already matched.
4. [S4] Print the line and carry the field through corpus-probe and `--diff`.
5. [S5] Record one killed mutant per Rests-on name. One drops the name filter, so the unnumbered twin is named. The other drops the record-directory exclusion, so a record under `docs/decisions` is named twice. Add both to `tests/mutations.json`. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/corpus-shapes.test.mjs 2>&1) \
  && for t in 'a numbered file with a frontmatter status outside a record directory is named as not read' 'an unnumbered note or a record inside a record directory is not named as not read'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$")" != 1 ]; then exit 1; fi; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a numbered file with a frontmatter status outside a record directory is named as not read` | `tests/corpus-shapes.test.mjs` | `Final/RFC0001-x.md` and `Archive/Rejected/RFC0002-y.md`, each with frontmatter `Status:`, appear in work-next `notRead` and in corpus-probe `workNext.notRead`; work-next text names `Final/RFC0001-x.md`; `look` is `ok` in both | F-9, UC2-S1 | S1, S3, S4 |
| `an unnumbered note or a record inside a record directory is not named as not read` | `tests/corpus-shapes.test.mjs` | `vault/note.md` with frontmatter `status: draft`, `docs/decisions/001-x.md` with frontmatter `status: active`, and `notes/0001-x.md` with no frontmatter are absent from `notRead` | F-9, UC2-S2 | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | work-next's JSON and text builder; corpus-probe reads work-next's JSON as a process, and the test reads both |
| 3 — the caller can discover it | the work-next text line, and the probe field an outside runner pastes |
| 4 — it is used | an outside run over public/dir-status-rfc after release; nothing measures this yet |

## Mutation Log
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/work-next.mjs` · the numbered-name filter: without it an unnumbered note with a frontmatter status is named as not read · acceptance-sha256:82cb93907ebaf10c076e28e88bb9784948fac68deeb8f2c6314237fe779cabd1
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/work-next.mjs` · the record-directory exclusion: without it a numbered file under docs/decisions is named as not read · acceptance-sha256:82cb93907ebaf10c076e28e88bb9784948fac68deeb8f2c6314237fe779cabd1
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/work-next.mjs` · without the filter an unnumbered note with a frontmatter status is named as not read · acceptance-sha256:82cb93907ebaf10c076e28e88bb9784948fac68deeb8f2c6314237fe779cabd1 · covers:the numbered-name filter
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/work-next.mjs` · without the exclusion a numbered file under docs/decisions is named as not read · acceptance-sha256:82cb93907ebaf10c076e28e88bb9784948fac68deeb8f2c6314237fe779cabd1 · covers:the record-directory exclusion

## Invariants

- `look`, `next` and every existing work-next field are unchanged.
- No file is both in `undecidedNamed` and in `notRead`.

## Risks

- Cost on a large tree. Only names that already match are opened, at most 64 lines each. S3 records how many files that opens on this repository and on the T5 corpus, dated, in this task's prose. Measured 2026-10-07: on this repository 173 tracked `.md` names match, 51 sit outside every record directory and fixture tree, and those 51 are opened (`docs/specs` 28, `.claude/rules` 19, `docs/research` 3, `docs/audits` 1); none has a frontmatter `status:`, so none is named. On the T5 corpus one file is opened, `Final/RFC0001-example.md`.

## Stop Condition

Stop and ask if S2 finds the matrix compares whole objects, or if this repository's own work-next JSON gains a non-empty `notRead`.

## Out of Scope

- Reading those files as records — ADR-087 Out of Scope.

## Verification Log
- 2026-10-07 · 49bd0c3* · exit 1 · `out=$(node --test --test-reporter=tap tests/corpus-shapes.test.mjs 2>&1) \ …` · acceptance-sha256:82cb93907ebaf10c076e28e88bb9784948fac68deeb8f2c6314237fe779cabd1 · ms:2887 · test-lock-sha256:42fd87b1488e31c7a084a88d13e93487f70abf26e8e157e6c228a8abffb3d3e6 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvY29ycHVzLXNoYXBlcy50ZXN0Lm1qcwlhIE1BRFIgMiBidWxsZXQgc3RhdHVzIGlzIHJlYWQgYWJvdmUgdGhlIGZpcnN0IHNlY3Rpb24JZDRlZGIyODFkMDU0NTlkMzA3ZDIxNTIyNmM1YTdmZTY5MDY5MTI2Yjc2MzJjNGExYmEyY2IwMmI0Y2QxYmIyZQpib2R5CXRlc3RzL2NvcnB1cy1zaGFwZXMudGVzdC5tanMJYSBkaXJlY3RvcnkgbmFtZSBpcyBuZXZlciBhIHN0YXR1cwk5MmY4ZTkzNjg2YTZmYzEyMzlkNDM3MTEyODk5MmY3OGFiNGQzMDJkNTNiYzkzNmM4ZjQ5YWI5OTc4YjliZGM2CmJvZHkJdGVzdHMvY29ycHVzLXNoYXBlcy50ZXN0Lm1qcwlhIGZyb250bWF0dGVyIHN0YXR1cyBpcyByZWFkIGFzIGl0cyBjb3Jwb3JhIHdyaXRlIGl0CTRlNmJjYzVkY2VjNTQxNmM0MDJlYzBlZDU3Nzc3ZGZhNDAxZGM3MTM2MTZiYjNiZGI5MzMyYWFjZmM2ZTY2NjIKYm9keQl0ZXN0cy9jb3JwdXMtc2hhcGVzLnRlc3QubWpzCWEgZnJvbnRtYXR0ZXIgc3VwZXJzZWRlZF9ieSBuYW1lcyB0aGUgcmVwbGFjZW1lbnQgaW4gdGhlIHRocmVlIG1lYXN1cmVkIHNwZWxsaW5ncwljM2ZmODZlMTJjZDMxNDhjODJjNjkxMjdjNzg2NGQ0YTAwYTRmNmU5MWM4YzkwYjJjM2Y0ZTI1NDY1MGU5NGE4CmJvZHkJdGVzdHMvY29ycHVzLXNoYXBlcy50ZXN0Lm1qcwlhIG51bWJlcmVkIGZpbGUgd2l0aCBhIGZyb250bWF0dGVyIHN0YXR1cyBvdXRzaWRlIGEgcmVjb3JkIGRpcmVjdG9yeSBpcyBuYW1lZCBhcyBub3QgcmVhZAlmNWFhMWE2MmRlZGJlN2NiYTI5YjFlZGQ0NmJmM2ExNzA5ZWIwYWMzOWI4YTY2MTE5OGFjZDgxNjMzNTJmNzMwCmJvZHkJdGVzdHMvY29ycHVzLXNoYXBlcy50ZXN0Lm1qcwlhIHBsYWNlaG9sZGVyIG9yIGFuIHVubWFwcGVkIHN0YXR1cyBzdGF5cyB1bmRlY2lkZWQgYW5kIGlzIG5hbWVkCWRmMmQ2MWRiOTYxODllODhjZmJmNjUyNDRmNTEwZGYwNzJkOWUyZTE4YWE1MzY3YzkwNjNlNzlmZGUzYjJkOTcKYm9keQl0ZXN0cy9jb3JwdXMtc2hhcGVzLnRlc3QubWpzCWEgc3RhdHVzIGJ1bGxldCBpbnNpZGUgYSBzZWN0aW9uIGlzIG5vdCB0aGUgcmVjb3JkIHN0YXR1cwkxNzZkMWIzM2Q4MjI2OTc3YWI2NzBjMzY4YzdkMzg3ZTViNDQxOGIzMTFmNDUxODAzMThiY2U4ZmFhYzBjZDMxCmJvZHkJdGVzdHMvY29ycHVzLXNoYXBlcy50ZXN0Lm1qcwlhbiB1bm51bWJlcmVkIG5vdGUgb3IgYSByZWNvcmQgaW5zaWRlIGEgcmVjb3JkIGRpcmVjdG9yeSBpcyBub3QgbmFtZWQgYXMgbm90IHJlYWQJNmRkODliMjBkYjdhZGViOTYxM2JkNzhmNDZlZWNmYjM0MTRkZTMzOGM3NmZjOGNkZGI3OGMzOTI1MGE2ZDFhMQpib2R5CXRlc3RzL2NvcnB1cy1zaGFwZXMudGVzdC5tanMJc3VwZXJzZWRlcyBpcyBuZXZlciByZWFkIGFuZCBzdXBlcnNlZGVkX2J5IG5ldmVyIG1vdmVzIGEgZ292ZXJuaW5nIHJlY29yZAk3ZmM1NDQ2OWU4YTEyYzdiNjc2YTAxN2JlMjk5OWM3MDEwNzZjMDNlNGI1MThhMDE2N2Q0YTBmYTEwZmM5MmQ0
  ```
  ```
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/corpus-shapes.test.mjs 2>&1) \ …` · acceptance-sha256:82cb93907ebaf10c076e28e88bb9784948fac68deeb8f2c6314237fe779cabd1 · ms:3609
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/corpus-shapes.test.mjs 2>&1) \ …` · acceptance-sha256:82cb93907ebaf10c076e28e88bb9784948fac68deeb8f2c6314237fe779cabd1 · ms:4186
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/corpus-shapes.test.mjs 2>&1) \ …` · acceptance-sha256:82cb93907ebaf10c076e28e88bb9784948fac68deeb8f2c6314237fe779cabd1 · ms:4129
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/corpus-shapes.test.mjs 2>&1) \ …` · acceptance-sha256:82cb93907ebaf10c076e28e88bb9784948fac68deeb8f2c6314237fe779cabd1 · ms:5757
- 2026-10-07 · human-observed · observed by the executor (Claude, 2026-10-07): tests/corpus-matrix.test.mjs:105-114 compares a fixed workNext key set plus only the extra keys an expected.json lists, so notRead changes no other corpus; S2 holds
- 2026-10-07 · df605f89* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:82cb93907ebaf10c076e28e88bb9784948fac68deeb8f2c6314237fe779cabd1 · ms:0 · test-lock-sha256:64f62a0bf53fdc7c3ffb9f78f6b94e534738a73af5302bbe9b988dbe96941a15 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvY29ycHVzLXNoYXBlcy50ZXN0Lm1qcwlhIEZJRk8gaW4gcGxhY2Ugb2YgYSBudW1iZXJlZCBmaWxlIGlzIG5vdCBvcGVuZWQgYnkgdGhlIG5vdC1yZWFkIGxvb2sJMjBiYjliYTU1NmMxNzQzOWFhOGE5NDI5YjE3YWI3Y2VkYmQzM2MzYTkxOWI1MGE2NTZhZThlNTE0NTViMDg2Ygpib2R5CXRlc3RzL2NvcnB1cy1zaGFwZXMudGVzdC5tanMJYSBNQURSIDIgYnVsbGV0IHN0YXR1cyBpcyByZWFkIGFib3ZlIHRoZSBmaXJzdCBzZWN0aW9uCWQ0ZWRiMjgxZDA1NDU5ZDMwN2QyMTUyMjZjNWE3ZmU2OTA2OTEyNmI3NjMyYzRhMWJhMmNiMDJiNGNkMWJiMmUKYm9keQl0ZXN0cy9jb3JwdXMtc2hhcGVzLnRlc3QubWpzCWEgZGlyZWN0b3J5IG5hbWUgaXMgbmV2ZXIgYSBzdGF0dXMJZjA3ZWI1NjlkMThlNGU1MzM2YTMwNjYxNGViY2M0NTBjYzE0NDYxZjQ1ZDI0MGY3MjJlOWQ0ODAzZTM5YjhhZApib2R5CXRlc3RzL2NvcnB1cy1zaGFwZXMudGVzdC5tanMJYSBmaWxlIGFkci1saW50IGRvZXMgbm90IHJlY29nbmlzZSBpcyBjb3VudGVkIGJ5IG5vIHJlYWRlciBhbmQgbmFtZWQgYXMgbm90IHJlYWQJMGJiODU1OTBjYzIzYTU4YThlMWI4YTk0NWNkYjgyZGY3ZTMzZmMwZjU3YmFkNjNkYWJmNDEzZmJjNzJhYzc2ZApib2R5CXRlc3RzL2NvcnB1cy1zaGFwZXMudGVzdC5tanMJYSBmcm9udG1hdHRlciBzdGF0dXMgaXMgcmVhZCBhcyBpdHMgY29ycG9yYSB3cml0ZSBpdAk0ZTZiY2M1ZGNlYzU0MTZjNDAyZWMwZWQ1Nzc3N2RmYTQwMWRjNzEzNjE2YmIzYmRiOTMzMmFhY2ZjNmU2NjYyCmJvZHkJdGVzdHMvY29ycHVzLXNoYXBlcy50ZXN0Lm1qcwlhIGZyb250bWF0dGVyIHN1cGVyc2VkZWRfYnkgbmFtZXMgdGhlIHJlcGxhY2VtZW50IGluIHRoZSB0aHJlZSBtZWFzdXJlZCBzcGVsbGluZ3MJYzNmZjg2ZTEyY2QzMTQ4YzgyYzY5MTI3Yzc4NjRkNGEwMGE0ZjZlOTFjOGM5MGIyYzNmNGUyNTQ2NTBlOTRhOApib2R5CXRlc3RzL2NvcnB1cy1zaGFwZXMudGVzdC5tanMJYSBub3QtcmVjb2duaXNlZCBmaWxlIHRoYXQgY2Fubm90IGJlIHJlYWQgaXMgc3RpbGwgbmFtZWQgYXMgdW5yZWFkLCBuZXZlciBkcm9wcGVkCTZmODFlMjU1NTZjMzc3ZmUxN2IyNjQxMDI4YzVmOTQ5YTAxZGQ1NDVlZTY2ZDMxZmVhMTVlZTk0NmM1NTc5NzgKYm9keQl0ZXN0cy9jb3JwdXMtc2hhcGVzLnRlc3QubWpzCWEgbnVtYmVyZWQgZmlsZSB3aG9zZSBmcm9udG1hdHRlciBydW5zIHBhc3QgNjQgbGluZXMgaXMgbmFtZWQsIGFuZCBwYXN0IHRoZSBidWRnZXQgaXMgUEFSVElBTAk4NmFjOWE2MGM5MmRiMmUyZDJhNDY1ZjY3MDUwNzg4MTA3Y2ZmNDU0OTMzMzlmY2U2ZDVhNWY5OWE2N2RlNWM3CmJvZHkJdGVzdHMvY29ycHVzLXNoYXBlcy50ZXN0Lm1qcwlhIG51bWJlcmVkIGZpbGUgd2l0aCBhIGZyb250bWF0dGVyIHN0YXR1cyBvdXRzaWRlIGEgcmVjb3JkIGRpcmVjdG9yeSBpcyBuYW1lZCBhcyBub3QgcmVhZAlmNWFhMWE2MmRlZGJlN2NiYTI5YjFlZGQ0NmJmM2ExNzA5ZWIwYWMzOWI4YTY2MTE5OGFjZDgxNjMzNTJmNzMwCmJvZHkJdGVzdHMvY29ycHVzLXNoYXBlcy50ZXN0Lm1qcwlhIHBsYWNlaG9sZGVyIG9yIGFuIHVubWFwcGVkIHN0YXR1cyBzdGF5cyB1bmRlY2lkZWQgYW5kIGlzIG5hbWVkCWRmMmQ2MWRiOTYxODllODhjZmJmNjUyNDRmNTEwZGYwNzJkOWUyZTE4YWE1MzY3YzkwNjNlNzlmZGUzYjJkOTcKYm9keQl0ZXN0cy9jb3JwdXMtc2hhcGVzLnRlc3QubWpzCWEgc3RhdHVzIGJ1bGxldCBpbiBhbiBpbmRlbnRlZCBjb2RlIGJsb2NrIGlzIG5vdCB0aGUgcmVjb3JkIHN0YXR1cwk4MGRkOTkwMTkwYzUxNzQ3MTZkZjgyYzlkMDhiMjRlZDJmYTg4MWM3MzY5OGE3N2Q3OGEyYjgwZDJiYTQxMmJmCmJvZHkJdGVzdHMvY29ycHVzLXNoYXBlcy50ZXN0Lm1qcwlhIHN0YXR1cyBidWxsZXQgaW5zaWRlIGEgc2VjdGlvbiBpcyBub3QgdGhlIHJlY29yZCBzdGF0dXMJY2E3ODU2Y2ZhNzM0YTRlMDhjZWQwZmQ1NjJhYjFiOWZiNTM5NGVlODUzNDJjY2E2NmY4YzdjZDYzMzhlMTIyNwpib2R5CXRlc3RzL2NvcnB1cy1zaGFwZXMudGVzdC5tanMJYSBzdGF0dXMgaW5zaWRlIGEgZnJvbnRtYXR0ZXIgbGl0ZXJhbCBibG9jayBpcyBub3QgdGhlIHJlY29yZCBzdGF0dXMJZWFkODg4Mjg2YWIxNzU2MDE2NzFkN2UyMTZkMjc5ODMwMmVmYmFlZDYxMWE4NTY5OTdkNmU5ZmQzYzM4MjU3ZQpib2R5CXRlc3RzL2NvcnB1cy1zaGFwZXMudGVzdC5tanMJYSBzdXBlcnNlZGVkIHN0YXR1cyB0aGF0IG5hbWVzIG5vIHJlY29yZCB0YWtlcyBpdHMgdGFyZ2V0IGZyb20gc3VwZXJzZWRlZF9ieQk0YjQ0NWQ2ZDBlODUzYjQyNzU3MWY0MmYyNDk3ZWE4ZmQxYmVkOWYzMGI3NTU4M2M1MjgzZmNmNGQ1NGJlZTUyCmJvZHkJdGVzdHMvY29ycHVzLXNoYXBlcy50ZXN0Lm1qcwlhbiB1bm51bWJlcmVkIG5vdGUgb3IgYSByZWNvcmQgaW5zaWRlIGEgcmVjb3JkIGRpcmVjdG9yeSBpcyBub3QgbmFtZWQgYXMgbm90IHJlYWQJNDYxMzlkMmNhOWFkMWE2ZjIyOTE4ODkwMWE4N2Y5YjA1ZTFmZjlkNGIyZDViMzNmMTJkYzYyN2Y3MDgyOWU3OApib2R5CXRlc3RzL2NvcnB1cy1zaGFwZXMudGVzdC5tanMJY29ycHVzLXByb2JlIC0tZGlmZiBuYW1lcyBhIGZpbGUgdGhhdCBjYW1lIGludG8gb3IgbGVmdCBub3RSZWFkCWU2NTYxZTY1YTJjODdhNDIxYTJjYmJhMTQzYjE4NjZlMmFlZWQ3YmI0ZjY0MWJhMDY3MGY1NTJkY2RhYzBhNjcKYm9keQl0ZXN0cy9jb3JwdXMtc2hhcGVzLnRlc3QubWpzCXN1cGVyc2VkZXMgaXMgbmV2ZXIgcmVhZCBhbmQgc3VwZXJzZWRlZF9ieSBuZXZlciBtb3ZlcyBhIGdvdmVybmluZyByZWNvcmQJN2ZjNTQ0NjllOGExMmM3YjY3NmEwMTdiZTI5OTljNzAxMDc2YzAzZTRiNTE4YTAxNjdkNGEwZmExMGZjOTJkNA · test-lock-kind:replace
