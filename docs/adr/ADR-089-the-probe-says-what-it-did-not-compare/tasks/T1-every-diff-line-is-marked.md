# Task ADR-089-T1: every diff line is marked, and the skipped fields are compared

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (one shipped script, one new test file, two unlocked assertions, fixture expectations, campaign entries)
**Owner:** unassigned
**Produces:** `verdictMoves` returning `{ compared, notCompared, moves }` over a PARTIAL pair; the probe report's `workNext.uncoveredReadySpecs`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `one element per line`, `the mark after the field`, `the skipped fields compared`, `a partial pair compared over the records both runs read`

## Goal

`corpus-probe --diff` prints one marked line per element that came or went, compares the fields it
skipped, and compares a PARTIAL pair's adr-lint verdicts over the records both runs gave a verdict
(ADR-089 Decision 1 and 2).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/corpus-probe.mjs` | edit | `setChange` (`:545`) and the PARTIAL arm's `named` (`:506`) emit one line per element; `adrLint` new/removed (`:588`, `:598`) and SessionStart (`:604-605`) use the same grammar; `comparable` (`:473`) admits PARTIAL; `verdictMoves` (`:483`) skips a record with no verdict on either side and returns `notCompared`; the report's `workNext` (`:427-441`) carries `uncoveredReadySpecs`; `diffReports` (`:498`) compares the fields ADR-089 Context lists. `diffMain` (`:748`) is what selects `diffReports` and is unchanged |
| `tests/probe-diff-marks.test.mjs` | add | the four tests below |
| `tests/corpus-probe.test.mjs` | edit | line 588 only, in an unlocked test: `undecided: + c.md, - b.md` becomes two lines |
| `tests/named-not-dropped.test.mjs` | edit | lines 100-101 and 106 (0 locks on 2026-10-06): one line per element, and the PARTIAL first line |
| `tests/fixtures/corpora/go-module/expected.json` | edit | `workNext.uncoveredReadySpecs`, measured, so the matrix fails if the report drops the field (CLAUDE.md §18) |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Run `python3 scripts/test-locks.py` on `tests/corpus-probe.test.mjs`, `tests/named-not-dropped.test.mjs` and `tests/chaos-315-probe.test.mjs`, and confirm the three assertions this task edits are in tests no lock names. Write the four tests in `tests/probe-diff-marks.test.mjs` and record the red run (TDD red). Red today: the file's first test sees `undecided: + c.md, - b.md` on one line. Its PARTIAL test is the scratch reproduction of ADR-089 Context, built in a temporary directory: ADR-001 PASS → FAIL beside a NUL-byte ADR-002. Today it prints only `look: PARTIAL → PARTIAL: not compared`.
2. [S2] Change `setChange` and the PARTIAL arm's `named` to push one `<field>: + <element>` or `<field>: - <element>` line per element, additions first, each side in its list's order. Change `adrLint <file>: new, <v>` to `adrLint: + <file> (<v>)`, `adrLint <file>: removed` to `adrLint: - <file> (was <v>)`, and `SessionStart + <line>` to `SessionStart: + <line>`.
3. [S3] Carry `uncoveredReadySpecs` in the report's `workNext`, normalised like `unprovenSpecs`. Compare, with the same helpers:
   - `workNext.specs` and `workNext.next.id` as scalars;
   - `unprovenSpecs`, `uncoveredReadySpecs`, `retirable` and `underUndecided` as sets;
   - `adrState.governingNothing` by file as a set, and `adrState.contested` and `danglingSupersession` as scalars;
   - each `adrNext` entry's ready task ids as `adrNext <tasksDir> ready`, where a directory present on one side only is `adrNext: + <dir>` or `adrNext: - <dir>`.
4. [S4] PARTIAL:
   - `comparable` is true unless either look is UNPROVEN or the corpora differ.
   - `verdictMoves` skips a record whose verdict is `unread` or null on BOTH sides. It counts as `notCompared` every file listed in either report that it did not compare.
   - In `diffReports`, a PARTIAL side prints `look: <b> → <a>: counts not compared; adr-lint verdicts compared over the records both runs read`, then the named lists, then the `adrLint` lines.
   - An UNPROVEN side keeps the single line it prints today.
5. [S5] Edit the three unlocked assertions to the new lines. Run the probe over `tests/fixtures/corpora/go-module` and write the measured `uncoveredReadySpecs` into its `expected.json` under `workNext`. Run `node --test tests/corpus-matrix.test.mjs` once with that field deleted from the report and once with it present, so the expectation is seen to bind.
6. [S6] Record one killed mutant per Rests-on name, and add each to `tests/mutations.json`:
   - join two elements again with `, `;
   - drop the mark;
   - drop the `specs` comparison;
   - make `comparable` require `ok` again.
   [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/probe-diff-marks.test.mjs 2>&1) \
  && for t in 'every element that came or went is its own marked line' 'diff compares the fields it used to skip' 'a partial pair compares the verdicts both runs read' 'an unproven side is still one not compared line'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done \
  && node --test tests/corpus-probe.test.mjs tests/named-not-dropped.test.mjs tests/chaos-315-probe.test.mjs tests/corpus-matrix.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every element that came or went is its own marked line` | `tests/probe-diff-marks.test.mjs` | through the CLI on saved reports. Two advice lines added and one removed under a held PASS, one carrying `, ` and ` - `, print three lines, each matching `^adrLint \S+ advice: [+-] `. A record that came and one that went print `adrLint: + <file> (FAIL)` and `adrLint: - <file> (was PASS)`, and a SessionStart line `SessionStart: - <line>`. CLEAN twin: identical reports print `nothing changed`; a one-element change prints exactly today's line, `workNext.unbacked: + <path>` | none | S1, S2 |
| `diff compares the fields it used to skip` | `tests/probe-diff-marks.test.mjs` | each of `workNext.specs`, `unprovenSpecs`, `uncoveredReadySpecs`, `retirable`, `underUndecided`, `next.id`, `adrState.governingNothing`, `contested`, `danglingSupersession` and one `adrNext` ready set, changed alone, prints a line naming that field. A report without `uncoveredReadySpecs` gives `before lacks workNext.uncoveredReadySpecs` | none | S1, S3 |
| `a partial pair compares the verdicts both runs read` | `tests/probe-diff-marks.test.mjs` | the ADR-089 Context reproduction, built in a temporary corpus and run through the real probe twice. `--diff` prints the PARTIAL first line and `adrLint docs/adr/ADR-001-…: PASS → FAIL — …`. `verdictMoves` gives `compared: 1, notCompared: 1` (ADR-002, unread on both sides), and PASS → `unread` counts as a move | none | S1, S4 |
| `an unproven side is still one not compared line` | `tests/probe-diff-marks.test.mjs` | supplementary to ADR-064's locked test: `look: PARTIAL → UNPROVEN` and `UNPROVEN → PARTIAL` each print one line and nothing else | none | S4 |
| `corpus go-module: every reader answers as reviewed, through a symlink` | `tests/corpus-matrix.test.mjs` | the existing templated matrix test, now reading `workNext.uncoveredReadySpecs` from `expected.json` | none | S3, S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the four tests |
| 2 — something selects it | `diffMain` calls `diffReports`; the first three tests run the CLI, so a mutant in `setChange` or `comparable` turns them red |
| 3 — the caller can discover it | the line grammar is stated in `corpus-probe.mjs`'s header comment, and `docs/corpus-reports/README.md` is T3's |
| 4 — it is used | the next outside run's `--diff`; nothing measures this yet |

## Mutation Log
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · comparable requires ok again, so a PARTIAL pair compares no verdict · acceptance-sha256:b6379819f8dd5d5422435829e80745ac39a6743ff5e5821ec42a8e0667e3b77b · covers:a partial pair compared over the records both runs read
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · two elements joined on one line with a comma again · acceptance-sha256:b6379819f8dd5d5422435829e80745ac39a6743ff5e5821ec42a8e0667e3b77b · covers:one element per line
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · a removed element prints with no mark after its field · acceptance-sha256:b6379819f8dd5d5422435829e80745ac39a6743ff5e5821ec42a8e0667e3b77b · covers:the mark after the field
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · workNext.specs is not compared again · acceptance-sha256:b6379819f8dd5d5422435829e80745ac39a6743ff5e5821ec42a8e0667e3b77b · covers:the skipped fields compared
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · a control character in a diff value prints raw again, so one value can forge a second line · acceptance-sha256:b6379819f8dd5d5422435829e80745ac39a6743ff5e5821ec42a8e0667e3b77b · covers:one element per line

## Invariants

- Every locked assertion in `tests/corpus-probe.test.mjs` and `tests/chaos-315-probe.test.mjs` stays byte-identical.
- An UNPROVEN side or different corpora compare nothing.
- No line `--diff` prints carries an absolute path (ADR-064 Decision 2).

## Risks

- A PARTIAL record readable on one side and unread on the other reads as a move. That is the fail-closed direction, and ADR-089 Risks names it.

## Stop Condition

Stop and ask if an assertion this task edits turns out to be locked, if a locked test goes red, or if the go-module measurement of `uncoveredReadySpecs` is not `[]` and the reason is not obvious from its spec.

## Out of Scope

- The attestation fields — T2. `corpusReport`, `sweep`, `frozenTaskDirs`, `slowest` — ADR-089 Out of Scope.

## Verification Log
- 2026-10-07 · 49bd0c3* · exit 1 · `out=$(node --test --test-reporter=tap tests/probe-diff-marks.test.mjs 2>&1) \ …` · acceptance-sha256:b6379819f8dd5d5422435829e80745ac39a6743ff5e5821ec42a8e0667e3b77b · ms:2648 · test-lock-sha256:b6a31c99d778a4799a9fa391488b83f19164733bf91b8bc25a06e03a38b0d33e · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvY29ycHVzLW1hdHJpeC50ZXN0Lm1qcwl0aGUgVVRGLTE2IGZpeHR1cmUgdGFzayBpcyBub3QgdGV4dCB0byBnaXQJZjJlOTdiNWQ3NTdkOGM4MmU4ODM3MDhjOWEwZGIxOTRkZDA1ODk3YjgyNjFmMjBjZjljMzgxZDMxZjQ3YTlmZgpib2R5CXRlc3RzL2NvcnB1cy1tYXRyaXgudGVzdC5tanMJdGhlIG1hdHJpeCBkaXNjb3ZlcnMgdGhlIHRocmVlIEFEUi0wNjQgY29ycG9yYQk1ZDFkMjY0NzgzOGFkMTFjYTk0MDkyZTM3MDkxODYzN2JmNTQ4ZjQ5OWQwNmI4ZGM1NzJlODUyNzE1NzFkYzZmCmJvZHkJdGVzdHMvcHJvYmUtZGlmZi1tYXJrcy50ZXN0Lm1qcwlhIHBhcnRpYWwgcGFpciBjb21wYXJlcyB0aGUgdmVyZGljdHMgYm90aCBydW5zIHJlYWQJZWExYTUyZmY1NTkyNzcxYTIwMmM0ODAwNDVlOGE3MWExNWRmZDE4N2MzMTYwMDcyNzFhN2VkMGI1ZGMyMjFhMgpib2R5CXRlc3RzL3Byb2JlLWRpZmYtbWFya3MudGVzdC5tanMJYW4gdW5wcm92ZW4gc2lkZSBpcyBzdGlsbCBvbmUgbm90IGNvbXBhcmVkIGxpbmUJYjcyY2NhNDA1MDU3M2NlY2U0MjA0M2Q2YTllMTgzNTVmYTE5NTRjNGFlMjU3ZWNjOWMyMDQ1YTYwNGJjN2U0Ywpib2R5CXRlc3RzL3Byb2JlLWRpZmYtbWFya3MudGVzdC5tanMJZGlmZiBjb21wYXJlcyB0aGUgZmllbGRzIGl0IHVzZWQgdG8gc2tpcAk5MjVkNjIyNjgwYzNhMmVhOTU2ZWQ4NGJlMzZiMTA5Mzk3YTY2YWY5ZjY0OGI1MGFmMTViOTBhMTU1ZmM4NDNkCmJvZHkJdGVzdHMvcHJvYmUtZGlmZi1tYXJrcy50ZXN0Lm1qcwlldmVyeSBlbGVtZW50IHRoYXQgY2FtZSBvciB3ZW50IGlzIGl0cyBvd24gbWFya2VkIGxpbmUJNDcxMDExNDRlMTFjZmQwMjNjYjNlMGQ1Y2ZmYmQ2YmY0YTA2NjhlMjg0YTVmMzc3YjZlOWNmMTljYjg1ZDU2ZQp1bnByb3Zlbgl0ZXN0cy9jb3JwdXMtbWF0cml4LnRlc3QubWpzCWNvcnB1cyBnby1tb2R1bGU6IGV2ZXJ5IHJlYWRlciBhbnN3ZXJzIGFzIHJldmlld2VkLCB0aHJvdWdoIGEgc3ltbGluaw
  ```
  ```
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/probe-diff-marks.test.mjs 2>&1) \ …` · acceptance-sha256:b6379819f8dd5d5422435829e80745ac39a6743ff5e5821ec42a8e0667e3b77b · ms:17874
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/probe-diff-marks.test.mjs 2>&1) \ …` · acceptance-sha256:b6379819f8dd5d5422435829e80745ac39a6743ff5e5821ec42a8e0667e3b77b · ms:17648
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/probe-diff-marks.test.mjs 2>&1) \ …` · acceptance-sha256:b6379819f8dd5d5422435829e80745ac39a6743ff5e5821ec42a8e0667e3b77b · ms:19322
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/probe-diff-marks.test.mjs 2>&1) \ …` · acceptance-sha256:b6379819f8dd5d5422435829e80745ac39a6743ff5e5821ec42a8e0667e3b77b · ms:19161
- 2026-10-07 · 49bd0c3* · exit 0 · `adr-verify --relock` · acceptance-sha256:b6379819f8dd5d5422435829e80745ac39a6743ff5e5821ec42a8e0667e3b77b · ms:0 · test-lock-sha256:b6a31c99d778a4799a9fa391488b83f19164733bf91b8bc25a06e03a38b0d33e · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvY29ycHVzLW1hdHJpeC50ZXN0Lm1qcwl0aGUgVVRGLTE2IGZpeHR1cmUgdGFzayBpcyBub3QgdGV4dCB0byBnaXQJZjJlOTdiNWQ3NTdkOGM4MmU4ODM3MDhjOWEwZGIxOTRkZDA1ODk3YjgyNjFmMjBjZjljMzgxZDMxZjQ3YTlmZgpib2R5CXRlc3RzL2NvcnB1cy1tYXRyaXgudGVzdC5tanMJdGhlIG1hdHJpeCBkaXNjb3ZlcnMgdGhlIHRocmVlIEFEUi0wNjQgY29ycG9yYQk1ZDFkMjY0NzgzOGFkMTFjYTk0MDkyZTM3MDkxODYzN2JmNTQ4ZjQ5OWQwNmI4ZGM1NzJlODUyNzE1NzFkYzZmCmJvZHkJdGVzdHMvcHJvYmUtZGlmZi1tYXJrcy50ZXN0Lm1qcwlhIHBhcnRpYWwgcGFpciBjb21wYXJlcyB0aGUgdmVyZGljdHMgYm90aCBydW5zIHJlYWQJZWExYTUyZmY1NTkyNzcxYTIwMmM0ODAwNDVlOGE3MWExNWRmZDE4N2MzMTYwMDcyNzFhN2VkMGI1ZGMyMjFhMgpib2R5CXRlc3RzL3Byb2JlLWRpZmYtbWFya3MudGVzdC5tanMJYW4gdW5wcm92ZW4gc2lkZSBpcyBzdGlsbCBvbmUgbm90IGNvbXBhcmVkIGxpbmUJYjcyY2NhNDA1MDU3M2NlY2U0MjA0M2Q2YTllMTgzNTVmYTE5NTRjNGFlMjU3ZWNjOWMyMDQ1YTYwNGJjN2U0Ywpib2R5CXRlc3RzL3Byb2JlLWRpZmYtbWFya3MudGVzdC5tanMJZGlmZiBjb21wYXJlcyB0aGUgZmllbGRzIGl0IHVzZWQgdG8gc2tpcAk5MjVkNjIyNjgwYzNhMmVhOTU2ZWQ4NGJlMzZiMTA5Mzk3YTY2YWY5ZjY0OGI1MGFmMTViOTBhMTU1ZmM4NDNkCmJvZHkJdGVzdHMvcHJvYmUtZGlmZi1tYXJrcy50ZXN0Lm1qcwlldmVyeSBlbGVtZW50IHRoYXQgY2FtZSBvciB3ZW50IGlzIGl0cyBvd24gbWFya2VkIGxpbmUJNDcxMDExNDRlMTFjZmQwMjNjYjNlMGQ1Y2ZmYmQ2YmY0YTA2NjhlMjg0YTVmMzc3YjZlOWNmMTljYjg1ZDU2ZQp1bnByb3Zlbgl0ZXN0cy9jb3JwdXMtbWF0cml4LnRlc3QubWpzCWNvcnB1cyBnby1tb2R1bGU6IGV2ZXJ5IHJlYWRlciBhbnN3ZXJzIGFzIHJldmlld2VkLCB0aHJvdWdoIGEgc3ltbGluaw · test-lock-kind:relock
- 2026-10-07 · 49bd0c3* · exit 0 · `adr-verify --relock` · acceptance-sha256:b6379819f8dd5d5422435829e80745ac39a6743ff5e5821ec42a8e0667e3b77b · ms:0 · test-lock-sha256:aa93c8a86d569e69dbe5e14a9802d4b3cddf9283b814131f8fe26473b5350d1c · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvY29ycHVzLW1hdHJpeC50ZXN0Lm1qcwljb3JwdXMgZ28tbW9kdWxlOiBldmVyeSByZWFkZXIgYW5zd2VycyBhcyByZXZpZXdlZCwgdGhyb3VnaCBhIHN5bWxpbmsJYzUxYTlhMDQ0ZmIxZGNjNzdjMTM2NWZlZmFlOTUxN2UwNjZkNWIzNzdhMTNmNWEyM2NkZjAzOWJhOGU4M2I1MQpib2R5CXRlc3RzL2NvcnB1cy1tYXRyaXgudGVzdC5tanMJdGhlIFVURi0xNiBmaXh0dXJlIHRhc2sgaXMgbm90IHRleHQgdG8gZ2l0CWYyZTk3YjVkNzU3ZDhjODJlODgzNzA4YzlhMGRiMTk0ZGQwNTg5N2I4MjYxZjIwY2Y5YzM4MWQzMWY0N2E5ZmYKYm9keQl0ZXN0cy9jb3JwdXMtbWF0cml4LnRlc3QubWpzCXRoZSBtYXRyaXggZGlzY292ZXJzIHRoZSB0aHJlZSBBRFItMDY0IGNvcnBvcmEJNWQxZDI2NDc4MzhhZDExY2E5NDA5MmUzNzA5MTg2MzdiZjU0OGY0OTlkMDZiOGRjNTcyZTg1MjcxNTcxZGM2Zgpib2R5CXRlc3RzL3Byb2JlLWRpZmYtbWFya3MudGVzdC5tanMJYSBwYXJ0aWFsIHBhaXIgY29tcGFyZXMgdGhlIHZlcmRpY3RzIGJvdGggcnVucyByZWFkCWVhMWE1MmZmNTU5Mjc3MWEyMDJjNDgwMDQ1ZThhNzFhMTVkZmQxODdjMzE2MDA3MjcxYTdlZDBiNWRjMjIxYTIKYm9keQl0ZXN0cy9wcm9iZS1kaWZmLW1hcmtzLnRlc3QubWpzCWFuIHVucHJvdmVuIHNpZGUgaXMgc3RpbGwgb25lIG5vdCBjb21wYXJlZCBsaW5lCWI3MmNjYTQwNTA1NzNjZWNlNDIwNDNkNmE5ZTE4MzU1ZmExOTU0YzRhZTI1N2VjYzljMjA0NWE2MDRiYzdlNGMKYm9keQl0ZXN0cy9wcm9iZS1kaWZmLW1hcmtzLnRlc3QubWpzCWRpZmYgY29tcGFyZXMgdGhlIGZpZWxkcyBpdCB1c2VkIHRvIHNraXAJOTI1ZDYyMjY4MGMzYTJlYTk1NmVkODRiZTM2YjEwOTM5N2E2NmFmOWY2NDhiNTBhZjE1YjkwYTE1NWZjODQzZApib2R5CXRlc3RzL3Byb2JlLWRpZmYtbWFya3MudGVzdC5tanMJZXZlcnkgZWxlbWVudCB0aGF0IGNhbWUgb3Igd2VudCBpcyBpdHMgb3duIG1hcmtlZCBsaW5lCTQ3MTAxMTQ0ZTExY2ZkMDIzY2IzZTBkNWNmZmJkNmJmNGEwNjY4ZTI4NGE1ZjM3N2I2ZTljZjE5Y2I4NWQ1NmU · test-lock-kind:relock
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/probe-diff-marks.test.mjs 2>&1) \ …` · acceptance-sha256:b6379819f8dd5d5422435829e80745ac39a6743ff5e5821ec42a8e0667e3b77b · ms:17592
- 2026-10-07 · 49bd0c3* · exit 1 · `out=$(node --test --test-reporter=tap tests/probe-diff-marks.test.mjs 2>&1) \ …` · acceptance-sha256:b6379819f8dd5d5422435829e80745ac39a6743ff5e5821ec42a8e0667e3b77b · ms:3627
  ```
  ```
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/probe-diff-marks.test.mjs 2>&1) \ …` · acceptance-sha256:b6379819f8dd5d5422435829e80745ac39a6743ff5e5821ec42a8e0667e3b77b · ms:17885
