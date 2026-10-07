# Task ADR-092-T6: an archive is named by what the definition admits, and never by a template

**Depends-on:** T3
**Covers:** none — no spec
**Estimated scope:** S (lifecycle.mjs `unmarkedArchives` and `RECORD_SHAPED`, tests, campaign entries)
**Owner:** unassigned
**Produces:** `unmarkedArchives(root, listing, recognised)`: with a recognised set, named by it and task files only; without one, by a name test widened to the name arms; never for a path under `templates/`
**Consumes:** `adrCorpus` selection (T3)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the recognised set`, `the widened name test`, `the templates exclusion here`, `the frozen marker`

## Goal

ADR-092 Decision 11: through `adrCorpus`, an archive-named directory with no Lifecycle marker is named exactly when it holds a record `adrCorpus` counted or held undecided, or a task file; at SessionStart, which opens no record content (CLAUDE.md §19) but reads an archive's README for its marker as today (lifecycle.mjs:1305-1310), by a name test widened to the name arms; neither names a directory for a template, and both respect a listed marker (second review 8).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `RECORD_SHAPED` (lifecycle.mjs:1340) admits `ADR-<n>` at any width and `spec[-_]?` followed by a decimal digit, beside its numbered and dated shapes; `unmarkedArchives` (:1341-1362) skips every path with a `templates` component, and, given a set of recognised absolute paths, uses that set instead of `RECORD_SHAPED` (task files still count); `adrCorpus` sets its `unmarkedArchives` property (:2705) after its read loop, with its counted and undecided records; the callers at :1814 and :3744 keep two arguments, with a comment saying they read no record content and why |
| `tests/unmarked-archives.test.mjs` | add | this task's three tests, in a file of their own so T4 and T7 (same wave) never edit it |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write this task's three tests and record the red run (TDD red): today `archive/spec-01-x.md` and `archive/decision.md` (`**Status:** Accepted`, `## Decision`) under an unmarked `archive/` name nothing, while `archive/001-note.md` holding no record and `archive/templates/ADR-001-x.md` name it (`archive/ADR-12345-x.md` already names it: `RECORD_SHAPED`'s `adr[-_]?\d+` takes any width).
2. [S2] Widen `RECORD_SHAPED`, skip `templates`, add the recognised set, and pass it from `adrCorpus`.
3. [S3] Record one killed mutant per Rests-on name and add them to the catalogue. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/unmarked-archives.test.mjs 2>&1) \
  && for t in 'the corpus reader names an archive by the records it holds and by nothing else' 'the SessionStart archive test reads no record content and takes the name arms' 'a listed Lifecycle marker freezes the archive in both paths'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$")" != 1 ]; then exit 1; fi; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the corpus reader names an archive by the records it holds and by nothing else` | `tests/unmarked-archives.test.mjs` | `adrCorpus(...).unmarkedArchives` and work-next's JSON name `archive` for each of `spec-01-x.md`, `ADR-12345-x.md` (undecided) and `decision.md`, and for `archive/x/tasks/T1-a.md`; they name nothing for `archive/001-note.md` holding no record, for `archive/notes.md`, and for `archive/templates/ADR-001-x.md` | — | S1, S2 |
| `the SessionStart archive test reads no record content and takes the name arms` | `tests/unmarked-archives.test.mjs` | `unmarkedArchives(root, listing)` with a reader that throws on any path but a README names `archive` for `spec-01-x.md`, `ADR-12345-x.md` and `001-note.md` (the stated limit of a name test), not for `decision.md`, and not for `archive/templates/ADR-001-x.md` | — | S1, S2 |
| `a listed Lifecycle marker freezes the archive in both paths` | `tests/unmarked-archives.test.mjs` | the same trees with a listed `archive/README.md` carrying the Lifecycle marker name nothing in either path; with the README listed but unreadable, the directory is not named and the look is PARTIAL, as `archiveDecisionEffect`'s unproven effect makes it (lifecycle.mjs:2306, :2767), as today | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests |
| 2 — something selects it | `adrCorpus` passes its recognised set; a mutant passing none, keeping `RECORD_SHAPED` beside the set, or dropping the `templates` skip is caught |
| 3 — the caller can discover it | work-next's `unmarkedArchives` line and JSON, SessionStart's archive advice |
| 4 — it is used | every SessionStart and work-next run; nothing measures this yet |

## Mutation Log
- 2026-10-07 · 850a7a86* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the corpus reader names an archive by a name test instead of what it counted · acceptance-sha256:88c65242c0a99439452cf4db1172db93d007178210a64b245658c95dd2368738 · covers:the recognised set
- 2026-10-07 · 850a7a86* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a spec-<n> record does not name its unmarked archive at SessionStart · acceptance-sha256:88c65242c0a99439452cf4db1172db93d007178210a64b245658c95dd2368738 · covers:the widened name test
- 2026-10-07 · 850a7a86* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a template names its directory as an unmarked archive · acceptance-sha256:88c65242c0a99439452cf4db1172db93d007178210a64b245658c95dd2368738 · covers:the templates exclusion here
- 2026-10-07 · 850a7a86* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a directory with a listed Lifecycle marker is named as unmarked · acceptance-sha256:88c65242c0a99439452cf4db1172db93d007178210a64b245658c95dd2368738 · covers:the frozen marker

## Invariants

- The SessionStart callers read no record content; they read a README for its marker, as today.
- Through `adrCorpus`, an archive-named directory holding no record and no task file is not named.
- No path under `templates/` names a directory in either path.
- This repository's `unmarkedArchives` stays empty.

## Risks

- A content-only record under an unmarked archive is named by work-next and not by SessionStart, and a record-shaped non-record is named by SessionStart and not by work-next; the SessionStart advice is a hint about a directory read without content, and the record count is `adrCorpus`'s either way.

## Stop Condition

Stop and ask if this repository's `unmarkedArchives` is not empty after S2.

## Out of Scope

- Reading record content at SessionStart to find content-only records (permanent: boundary: CLAUDE.md §19, ADR-092 Decision 11)

## Verification Log
- 2026-10-07 · 850a7a86* · exit 1 · `out=$(node --test --test-reporter=tap tests/unmarked-archives.test.mjs 2>&1) \ …` · acceptance-sha256:88c65242c0a99439452cf4db1172db93d007178210a64b245658c95dd2368738 · ms:296 · test-lock-sha256:876d9e0589048bf9d963d968fdb74023c66316bf556491fc566984e40f458daa · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvdW5tYXJrZWQtYXJjaGl2ZXMudGVzdC5tanMJYSBsaXN0ZWQgTGlmZWN5Y2xlIG1hcmtlciBmcmVlemVzIHRoZSBhcmNoaXZlIGluIGJvdGggcGF0aHMJMjUzMTdhNzhmNzk4MDUxNzAzZDVjZTlmNWEzMGI2NDNlYTE4OTg1YWMxOGMwYmE3YjE4N2U5ZjM4NGQzYjhjNApib2R5CXRlc3RzL3VubWFya2VkLWFyY2hpdmVzLnRlc3QubWpzCXRoZSBTZXNzaW9uU3RhcnQgYXJjaGl2ZSB0ZXN0IHJlYWRzIG5vIHJlY29yZCBjb250ZW50IGFuZCB0YWtlcyB0aGUgbmFtZSBhcm1zCTU2MWI0MzE0NjhhM2I4NzRkNWRjZjRkNjI3NWMwODNhNTNjMGQ4YWM2NWRiNjg2ZTIyNDFjMjM0MGRiZDRiZWQKYm9keQl0ZXN0cy91bm1hcmtlZC1hcmNoaXZlcy50ZXN0Lm1qcwl0aGUgY29ycHVzIHJlYWRlciBuYW1lcyBhbiBhcmNoaXZlIGJ5IHRoZSByZWNvcmRzIGl0IGhvbGRzIGFuZCBieSBub3RoaW5nIGVsc2UJN2EwMDE5Y2E1YjI5MzJmOTI0NWMwZWI0MTAxMzAyNGFiZDNmNWYzMDkyMmQ1NzM0ZGU5M2I5NzhiYmZjMTNjYg
  ```
  ```
- 2026-10-07 · 850a7a86* · exit 0 · `out=$(node --test --test-reporter=tap tests/unmarked-archives.test.mjs 2>&1) \ …` · acceptance-sha256:88c65242c0a99439452cf4db1172db93d007178210a64b245658c95dd2368738 · ms:430
- 2026-10-07 · 850a7a86* · exit 0 · `out=$(node --test --test-reporter=tap tests/unmarked-archives.test.mjs 2>&1) \ …` · acceptance-sha256:88c65242c0a99439452cf4db1172db93d007178210a64b245658c95dd2368738 · ms:430
- 2026-10-07 · 850a7a86* · exit 0 · `out=$(node --test --test-reporter=tap tests/unmarked-archives.test.mjs 2>&1) \ …` · acceptance-sha256:88c65242c0a99439452cf4db1172db93d007178210a64b245658c95dd2368738 · ms:419
- 2026-10-07 · 850a7a86* · exit 0 · `out=$(node --test --test-reporter=tap tests/unmarked-archives.test.mjs 2>&1) \ …` · acceptance-sha256:88c65242c0a99439452cf4db1172db93d007178210a64b245658c95dd2368738 · ms:436
