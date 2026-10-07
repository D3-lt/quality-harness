# Task ADR-092-T4: every numbered candidate is counted or named, and a failed read is PARTIAL

**Depends-on:** T3
**Covers:** none — no spec
**Estimated scope:** M (work-next.mjs, tests, campaign entries)
**Owner:** unassigned
**Produces:** work-next `notRead` over the candidate set of ADR-092 Decision 9; `partialBecause` reasons for a failed read and for content past the 512 KiB budget
**Consumes:** `adrCorpus` selection and `notRecognised` (T3); `tests/fixtures/record-recognition.json` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the candidate rule`, `the failed-read reason`, `the budget reason`, `the regular-file guard`, `the any-width number in a record directory`, `the unsupported format`, `the attachment exception`, `the probe's unread format`

## Goal

Every numbered candidate (ADR-092 Decision 9) is counted by a reader, held undecided, or named in `notRead` (finding 8); a candidate whose read failed is named in `partialBecause` and makes the look PARTIAL (finding 9); a candidate's content is read whole up to 512 KiB, so a Status past ADR-087's 64 KiB head is read and only content past 512 KiB is could-not-look (finding 10).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/work-next.mjs` | edit | `notReadFiles` takes the candidate rule over eligible paths: a record directory or a letter prefix decides by path, otherwise any Status form decides by content; `headOf` becomes a regular-file read of up to 512 KiB (the corpus reader's budget, lifecycle.mjs:2735) that says when it stopped short; its failures are returned, not dropped (work-next.mjs:222); `observe` folds them into `look` and `partialBecause` (work-next.mjs:657-662) with one reason per kind; the comment at work-next.mjs:180-187 and the 64 KiB reason at :662 change with it |
| `tests/record-naming.test.mjs` | add | this task's eight tests |
| `plugin/scripts/corpus-probe.mjs` | edit | a file work-next names for its format is listed in the probe's `adrLint` as unread, with its reason, so an attestation counts it in `notCompared` (the owner, 2026-10-07; added before this task's red run) |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write this task's six tests and record the red run (TDD red): today `Final/RFC0001-x.md` holding `# A note`, a numbered `Status: Final` file with no frontmatter and a headingless `docs/adr/01-x.md` are neither counted nor named; a missing or non-regular candidate is dropped; `---` and 65,536 spaces end with nothing said; a Status after 70 KiB is not read.
2. [S2] Measure on this repository, dated, in this task's prose: how many paths the rule makes candidates, and that `notRead` and `partialBecause` stay empty and `look` ok (51 numbered non-records on 2026-10-07, none a candidate, none over 512 KiB). [proof: human: the executor records the counts and the empty lists in this task's prose]
3. [S3] Apply the candidate rule; return failed reads and over-budget reads and name them.
4. [S4] Record one killed mutant per Rests-on name and add them to the catalogue. [proof: mutation]

## Acceptance

```bash
win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac
out=$(node --test --test-reporter=tap tests/record-naming.test.mjs 2>&1) \
  && for t in 'every row of the recognition table reads its approved answer in work-next' 'a numbered file that is no candidate is neither counted nor named' 'a numbered candidate that cannot be read makes the look PARTIAL and is named' 'a candidate past the read budget is PARTIAL and named' 'a numbered file in a format no reader parses is named, and an attachment of a counted record is not' 'a numbered file in a record directory is named at any width'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$")" != 1 ]; then exit 1; fi; done \
  && for t in 'a FIFO candidate is named and never opened' 'the link rows read their approved answers in work-next'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$win$")" != 1 ]; then exit 1; fi; done
```

On Windows only, the FIFO test may report `# SKIP` (the third test proves the same rule there with a directory), and the link test may when `symlinkSync` is refused.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every row of the recognition table reads its approved answer in work-next` | `tests/record-naming.test.mjs` | rows R2-R36 laid out as one tracked repository: the map row id → work-next's answer (counted, undecided, `notRead`, `partialBecause`, or in no list) deepStrictEquals the table's work-next column, the three finding-8 inputs included | — | S1, S3 |
| `the link rows read their approved answers in work-next` | `tests/record-naming.test.mjs` | row R1 and layouts L1-L4, L7 and L8 give the table's work-next cells exactly; skipped on Windows only if a link cannot be made | — | S1, S3 |
| `a numbered file that is no candidate is neither counted nor named` | `tests/record-naming.test.mjs` | a numbered `notes/01-rule.md` and a dated `docs/specs/2026-10-07-x.md`, neither carrying a Status, and a 67 KiB numbered spec without one, are in no list and `look` is ok, as this repository's 51 are | — | S1, S2, S3 |
| `a numbered candidate that cannot be read makes the look PARTIAL and is named` | `tests/record-naming.test.mjs` | layouts L5 (a directory), L6 and L9 give the table's work-next answers: `Final/RFC0007-x.md` (absent), the directory and the NUL-bearing record are in `partialBecause` with their reasons, `notes/07-gone.md` is in no list, `look` is PARTIAL; runs on every platform | — | S1, S3 |
| `a candidate past the read budget is PARTIAL and named` | `tests/record-naming.test.mjs` | rows R15 and R16 are in `partialBecause` with a reason naming 512 KiB; row R14 (Status after 70 KiB) and row R13 are in `notRead` | — | S1, S3 |
| `a FIFO candidate is named and never opened` | `tests/record-naming.test.mjs` | `Final/RFC0008-x.md` replaced on disk by a FIFO is in `partialBecause` and work-next finishes within the test's bound; skipped on Windows | — | S1, S3 |
| `a numbered file in a format no reader parses is named, and an attachment of a counted record is not` | `tests/record-naming.test.mjs` | numbered `.rst` and `.adoc` files in `decisions/` directories are in `partialBecause` with a reason naming the format and the look is PARTIAL; `docs/adr/ADR-003-attachment.txt` beside a counted ADR-003 and a numbered `.rst` outside every record directory are in no list; corpus-probe lists the two named files as unread with that reason, and `verdictMoves` counts them in `notCompared` | — | S1, S3 |
| `a numbered file in a record directory is named at any width` | `tests/record-naming.test.mjs` | the shape of tests/record-budget.test.mjs's short-number corpus: `ADR-7-a.md`, `ADR-12-b.md` and `adr_3-c.md` are counted and a headingless `1-intro.md` with `**Status:** Accepted` is in `notRead` (a coordinator's note, 2026-10-07: under the retired C-2 mutant it was named, which row R12's rule approves) | — | S1, S3 |

The first test's range is R2-R49; layout L10 is in the link test. The last two tests and the four Rests-on names after `the regular-file guard` were added on 2026-10-07, before this task's red run, from ADR-092 Decision 9's amendment.

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the six tests |
| 2 — something selects it | `observe` builds `notRead` and `partialBecause` from `notReadFiles`; mutants dropping the rule or a reason are caught |
| 3 — the caller can discover it | work-next's text line and JSON; corpus-probe carries both |
| 4 — it is used | an outside corpus run after release; nothing measures this yet |

## Mutation Log
- 2026-10-07 · 805cf4bf* · mutant killed · exit 1 · `plugin/scripts/work-next.mjs` · a letter-prefixed numbered file with no Status is named nowhere · acceptance-sha256:ed7575bc3f657186891d1bb86e9954c846ced0a586955fec6548bea629baaadf · covers:the candidate rule
- 2026-10-07 · 805cf4bf* · mutant killed · exit 1 · `plugin/scripts/work-next.mjs` · a path-decided candidate whose read failed is dropped · acceptance-sha256:ed7575bc3f657186891d1bb86e9954c846ced0a586955fec6548bea629baaadf · covers:the failed-read reason
- 2026-10-07 · 805cf4bf* · mutant killed · exit 1 · `plugin/scripts/work-next.mjs` · content past the read budget is read as if whole · acceptance-sha256:ed7575bc3f657186891d1bb86e9954c846ced0a586955fec6548bea629baaadf · covers:the budget reason
- 2026-10-07 · 805cf4bf* · mutant survived · exit 0 · `plugin/scripts/work-next.mjs` · a candidate that is not a regular file is treated as one · acceptance-sha256:ed7575bc3f657186891d1bb86e9954c846ced0a586955fec6548bea629baaadf · covers:the regular-file guard
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-10-07 · 805cf4bf* · mutant killed · exit 1 · `plugin/scripts/work-next.mjs` · a short-numbered file in a record directory is named nowhere · acceptance-sha256:ed7575bc3f657186891d1bb86e9954c846ced0a586955fec6548bea629baaadf · covers:the any-width number in a record directory
- 2026-10-07 · 805cf4bf* · mutant killed · exit 1 · `plugin/scripts/work-next.mjs` · a numbered .rst record in a decisions directory is named nowhere · acceptance-sha256:ed7575bc3f657186891d1bb86e9954c846ced0a586955fec6548bea629baaadf · covers:the unsupported format
- 2026-10-07 · 805cf4bf* · mutant killed · exit 1 · `plugin/scripts/work-next.mjs` · an attachment of a counted record is named as an unparsed format · acceptance-sha256:ed7575bc3f657186891d1bb86e9954c846ced0a586955fec6548bea629baaadf · covers:the attachment exception
- 2026-10-07 · 805cf4bf* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · the probe drops an unparsed-format file, so no attestation counts it · acceptance-sha256:ed7575bc3f657186891d1bb86e9954c846ced0a586955fec6548bea629baaadf · covers:the probe's unread format
- 2026-10-07 · 805cf4bf* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a FIFO candidate is opened by the first reader to meet it and work-next hangs · acceptance-sha256:ed7575bc3f657186891d1bb86e9954c846ced0a586955fec6548bea629baaadf · covers:the regular-file guard

## Invariants

- No file is both counted and named, or both in `notRead` and in `partialBecause`.
- This repository's `notRead` and `partialBecause` stay empty and `look` stays ok (bf3aa732 baseline in ADR-092's Context).
- A path whose candidacy needed content and that is absent from the working tree is in no list: absence is an observation of no Status (ADR-092 Decision 9).

## Risks

- A wider candidate rule names files in an adopter's tree that are not records; the rule asks for a Status, a record directory or a letter-prefixed number, and S2 measures it here.
- S2, measured 2026-10-07 on this repository: `work-next --json` reads 92 records with `look` ok, `notRead` [] and `partialBecause` []. No numbered file here is a candidate: `git ls-files` lists none in a record directory outside `tasks/` but the counted `ADR-<n>` records, no numbered `.rst`, `.adoc` or `.txt` in one, and of the 51 numbered files outside every record directory (ADR-092's Context) none has a letter prefix or a Status.
- The owner answered (2026-10-07) that this task may change the two ADR-087 tests in tests/corpus-shapes.test.mjs whose assertions ADR-092's Invalidates line retires, and relock ADR-087 T1-T4. They now assert the approved answers: a numbered non-record inside a record directory is named, and the 512 KiB budget is shown on a two-digit note no reader lists by name (`notes/45-huge.md`; the first edit used `0045-`, which the corpus reader lists by name and calls over 512 KiB itself, so the catalogue entry on this budget stayed GREEN until the name changed). The unlocked test on the old 64 KiB cut asserts the whole read. ADR-087 T1-T4 carry `--relock --replace-hashes` rows, which adr-lint rightly rates weaker than a first red.
- The catalogue entries `ADR-087 T4: notRead names a file inside a record directory` and `ADR-087 delta review F4: a cut head keeps its partial last line` were removed: ADR-092 inverted the first (such a file is named) and removed the 64 KiB cut the second guarded; `ADR-092 T4: a numbered file in a record directory is a candidate by its path` replaces the first. Four other ADR-087 entries followed their code and are RED. work-next's own regular-file guard is unreachable while the content screen runs first: the corpus reader already names a non-regular file, so its mutant survived (it is in the Mutation Log), and the guard is proved where work-next meets it, in the screen; the guard stays for a path past the screen's budget. The owner also accepted that a numbered `.txt` attachment of a counted record is not named.

## Stop Condition

Stop and ask if this repository's `notRead` or `partialBecause` is not empty after S3, or if any row's work-next answer differs from ADR-092 Decision 6.

## Out of Scope

- Reading a named file as a record (permanent: boundary: ADR-087 Out of Scope)

## Verification Log
- 2026-10-07 · 850a7a86* · exit 1 · `win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac …` · acceptance-sha256:ed7575bc3f657186891d1bb86e9954c846ced0a586955fec6548bea629baaadf · ms:682 · test-lock-sha256:3c6e1c4f935fcad102a23732710aadfa4879f963603976bf8619469b3dc677d1 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcmVjb3JkLW5hbWluZy50ZXN0Lm1qcwlhIEZJRk8gY2FuZGlkYXRlIGlzIG5hbWVkIGFuZCBuZXZlciBvcGVuZWQJODViZDQ3ODAwYTc4YzQyYmMyZTcyOGM0NjBiZTY4ODM3ZjQ0ZGI5N2Q0OTg0MWMzNWI5OTkxYmRmZmM1ZThjNApib2R5CXRlc3RzL3JlY29yZC1uYW1pbmcudGVzdC5tanMJYSBjYW5kaWRhdGUgcGFzdCB0aGUgcmVhZCBidWRnZXQgaXMgUEFSVElBTCBhbmQgbmFtZWQJMThhNDhiNDQxNzQ4NTkyYTdmMjcwZTJlMzQyMmU5MmNjMGJkZTZjYTZjM2VmMzI5Y2YzOWJkMzg4ZTlhMmZkZQpib2R5CXRlc3RzL3JlY29yZC1uYW1pbmcudGVzdC5tanMJYSBudW1iZXJlZCBjYW5kaWRhdGUgdGhhdCBjYW5ub3QgYmUgcmVhZCBtYWtlcyB0aGUgbG9vayBQQVJUSUFMIGFuZCBpcyBuYW1lZAlmNmQ3MWM4ODYzMjI0NTM2MGViYWNkMjU0ZmU0ZDQ3ZDJmMDNkMTNkZjg0ZmIyZGYyZDVhZDU2ZGY3ZGQ2YjgwCmJvZHkJdGVzdHMvcmVjb3JkLW5hbWluZy50ZXN0Lm1qcwlhIG51bWJlcmVkIGZpbGUgaW4gYSBmb3JtYXQgbm8gcmVhZGVyIHBhcnNlcyBpcyBuYW1lZCwgYW5kIGFuIGF0dGFjaG1lbnQgb2YgYSBjb3VudGVkIHJlY29yZCBpcyBub3QJNzFiY2VkNDRlMjc5NTYzMDBmZWIyYjQyZDQ4NTFmYmE3NDlhM2JhODYzOWQyZmJkZWVjNGM2OTg0NWNiZjkyYQpib2R5CXRlc3RzL3JlY29yZC1uYW1pbmcudGVzdC5tanMJYSBudW1iZXJlZCBmaWxlIGluIGEgcmVjb3JkIGRpcmVjdG9yeSBpcyBuYW1lZCBhdCBhbnkgd2lkdGgJYTVkNWUxZTc4NDhhMDJkOGY1Njg4NTdjMjJiM2E5Mzg4NzE1ZDI2YWE4MGIxMTkyNmEwN2Q0Yjk4YjlhZmRkMQpib2R5CXRlc3RzL3JlY29yZC1uYW1pbmcudGVzdC5tanMJYSBudW1iZXJlZCBmaWxlIHRoYXQgaXMgbm8gY2FuZGlkYXRlIGlzIG5laXRoZXIgY291bnRlZCBub3IgbmFtZWQJOTI5NjFmMTQ1OWFkNzNkMTY4MjI1ZGFhYjM2ODM5YWZkNmYyZDM4NzhmYTJhYTE1ZmI2Mzk5NDI0NzM1YTI0YQpib2R5CXRlc3RzL3JlY29yZC1uYW1pbmcudGVzdC5tanMJZXZlcnkgcm93IG9mIHRoZSByZWNvZ25pdGlvbiB0YWJsZSByZWFkcyBpdHMgYXBwcm92ZWQgYW5zd2VyIGluIHdvcmstbmV4dAk2MmE0YTgwN2I5ZjM2N2NkODAzZTEyMDBiZWM3OTIyZTkwZWJiYWEwMGYwYTRmNDZiNjAzOTI0YmExZWE1M2YyCmJvZHkJdGVzdHMvcmVjb3JkLW5hbWluZy50ZXN0Lm1qcwl0aGUgbGluayByb3dzIHJlYWQgdGhlaXIgYXBwcm92ZWQgYW5zd2VycyBpbiB3b3JrLW5leHQJYmM5NGRiMDYwMmM2YzAyYTRlNTM1ZWNmMTNlNTQ1Mzk5Yjc0MTUwMzdlYjgxYTlhMTAzZWI0ZWQxYzczYzNlZQ
  ```
  ```
- 2026-10-07 · 805cf4bf* · exit 0 · `win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac …` · acceptance-sha256:ed7575bc3f657186891d1bb86e9954c846ced0a586955fec6548bea629baaadf · ms:2112
- 2026-10-07 · 805cf4bf* · exit 0 · `win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac …` · acceptance-sha256:ed7575bc3f657186891d1bb86e9954c846ced0a586955fec6548bea629baaadf · ms:1751
- 2026-10-07 · 805cf4bf* · exit 0 · `win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac …` · acceptance-sha256:ed7575bc3f657186891d1bb86e9954c846ced0a586955fec6548bea629baaadf · ms:1548
- 2026-10-07 · 805cf4bf* · exit 0 · `win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac …` · acceptance-sha256:ed7575bc3f657186891d1bb86e9954c846ced0a586955fec6548bea629baaadf · ms:1565
- 2026-10-07 · 805cf4bf* · exit 0 · `win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac …` · acceptance-sha256:ed7575bc3f657186891d1bb86e9954c846ced0a586955fec6548bea629baaadf · ms:1602
- 2026-10-07 · 805cf4bf* · exit 0 · `win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac …` · acceptance-sha256:ed7575bc3f657186891d1bb86e9954c846ced0a586955fec6548bea629baaadf · ms:1650
- 2026-10-07 · 805cf4bf* · exit 0 · `win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac …` · acceptance-sha256:ed7575bc3f657186891d1bb86e9954c846ced0a586955fec6548bea629baaadf · ms:1544
- 2026-10-07 · 805cf4bf* · exit 0 · `win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac …` · acceptance-sha256:ed7575bc3f657186891d1bb86e9954c846ced0a586955fec6548bea629baaadf · ms:1552
- 2026-10-07 · 805cf4bf* · exit 0 · `win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac …` · acceptance-sha256:ed7575bc3f657186891d1bb86e9954c846ced0a586955fec6548bea629baaadf · ms:1512
- 2026-10-07 · human-observed · observed by the executor (Claude, 2026-10-07): S2's counts on this repository are recorded in this task's Risks; look ok, both lists empty
