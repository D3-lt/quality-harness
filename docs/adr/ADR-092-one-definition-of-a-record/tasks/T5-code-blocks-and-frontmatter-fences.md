# Task ADR-092-T5: no code-block line is a Status, and a frontmatter fence hides nothing

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (record.py and lifecycle.mjs fence walk and status readers, tests, campaign entries)
**Owner:** unassigned
**Produces:** `status_section` / `statusSection` reading a section's first non-empty line outside any fence and never an indented line; `unfenced_numbered(lines, document=False)` and a fence walk that delimits a whole document's frontmatter first
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the section code-block rule`, `the section fence rule`, `the frontmatter-first fence walk`, `the document-only frontmatter`, `the column indentation rule`, `the empty-versus-absent Status`

## Goal

No line indented as a code block (four spaces or a tab), and no line inside or forming a fence within a `## Status` section, is a Status in any form (finding 2; second review 6), and a fence marker inside a whole document's frontmatter does not open a fence over the text below it, while a section's lines are never read as a document (finding 7; second review 7), in record.py and lifecycle alike (ADR-092 Decision 8). This task lands first, so the parity table T1 writes holds rows R2, R9, R35 and R36 at their approved answers and no task's acceptance depends on a wrong one.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | `status_section` takes the first non-empty line of the section that is outside every fence inside the section (fence markers included) and not indented; `unfenced_numbered(lines, document=False)` delimits a leading frontmatter block before scanning fences only when `document` is true; `record_status` and `_scan` pass a whole document; `unfenced_lines` (section lines, record.py:161-171) keeps `document=False`; indentation is counted in columns, a tab advancing to the next multiple of four (ADR-092 Decision 8); a section with no readable line keeps reading `""` and a text with no Status keeps reading `None` |
| `plugin/scripts/lifecycle.mjs` | edit | `statusSection` (lifecycle.mjs:2156-2169) and `fencedLines` the same; `fencedLines` is only ever given a whole document |
| `tests/status-code-blocks.test.mjs` | add | this task's six tests |
| `tests/mutations.json` | edit | one entry per Rests-on name (or the per-source file under `tests/mutations/` once ADR-091 T3 has landed) |

## Ordered Steps

1. [S1] Write this task's six tests and record the red run (TDD red): today `## Status\n\n    Accepted` reads Accepted in both languages; a YAML literal holding an unmatched fence marker hides a later top-level `status:` (record.py's `record_status` returns None for ADR-092's row R9); and the two section-fence twins and the log twin are written so a change that only drops indented lines, or that delimits frontmatter in every call, turns them red.
2. [S2] Enumerate the fence walk's callers with the second command in ADR-092's Context, mark which pass a whole document and which a section's lines, count this repository's tracked `.md` files whose frontmatter holds a fence marker, and run `scripts/test-locks.py` on every test file that reads a section; record all four in this task's prose. [proof: human: the executor records the caller list, the file count and the locked tests found]
3. [S3] Change `status_section` / `statusSection` and the fence walk in both languages.
4. [S4] Record one killed mutant per Rests-on name and add them to the catalogue; run every catalogue entry in each function this task edits, one at a time. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/status-code-blocks.test.mjs 2>&1) \
  && for t in 'no indented code-block line is a Status, section form included' 'a fenced line in a Status section is no Status, indented fence or not' 'a fence opened inside the frontmatter hides nothing below it' 'a section that opens with a rule is not read as frontmatter' 'indentation is measured in columns at four-column tab stops' 'an empty Status section reads an empty string and no Status reads null'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$")" != 1 ]; then exit 1; fi; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `no indented code-block line is a Status, section form included` | `tests/status-code-blocks.test.mjs` | `## Status` followed by a four-space or tab-indented `Accepted` reads no Status in record.py and lifecycle; its twin with an unindented `Accepted` reads Accepted | — | S1, S3 |
| `a fenced line in a Status section is no Status, indented fence or not` | `tests/status-code-blocks.test.mjs` | rows R35 (four-space fence markers around `Accepted`) and R36 (unindented markers) read no Status in both languages; a twin with `Accepted` after the closing marker reads Accepted | — | S1, S3 |
| `a fence opened inside the frontmatter hides nothing below it` | `tests/status-code-blocks.test.mjs` | a frontmatter whose YAML literal holds an unmatched fence marker, with `status: accepted` as a later top-level key, reads accepted in both languages, and a `## Status` section below the block is still found; its twin, a fence opened in the body, still hides what it encloses | — | S1, S3 |
| `a section that opens with a rule is not read as frontmatter` | `tests/status-code-blocks.test.mjs` | a task's Verification Log section holding `---`, a fenced block quoting `- 2026-01-01 · abc · exit 1`, then `---`: `unfenced_lines` over it keeps the quoted row hidden and adr-lint reports no log entry from it, as today | — | S1, S3 |
| `indentation is measured in columns at four-column tab stops` | `tests/status-code-blocks.test.mjs` | under `## Status`, `    Accepted`, a tab, ` \tAccepted`, `  \tAccepted` and `   \tAccepted` (each four columns) read no Status in either language, and `   Accepted` (three) reads Accepted; today ` \tAccepted` reads Accepted | — | S1, S3 |
| `an empty Status section reads an empty string and no Status reads null` | `tests/status-code-blocks.test.mjs` | rows R2, R35 and R36 give `record_status` and `recordStatus` exactly `""` (strict equality, so a null fails), and a text with no label and no `## Status` section gives exactly `None` / `null` | — | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the four tests |
| 2 — something selects it | `record_status` and `inlineStatus` read through the walk; adr-lint's log readers through `unfenced_lines`; mutants dropping any rule, or passing `document=True` from a section, are caught |
| 3 — the caller can discover it | `n/a: no declared interface` |
| 4 — it is used | every status read; nothing measures this yet |

## Mutation Log
- 2026-10-07 · 13136e6f* · mutant killed · exit 1 · `plugin/lib/record.py` · a Status section reads its fence marker lines and fenced lines again · acceptance-sha256:7452e090b51fbc4f4c932ea6847faeca9e7667b45902ad8221e746553285e3de · covers:the section fence rule
- 2026-10-07 · 13136e6f* · mutant killed · exit 1 · `plugin/lib/record.py` · an indented code-block line is read as the Status section value · acceptance-sha256:7452e090b51fbc4f4c932ea6847faeca9e7667b45902ad8221e746553285e3de · covers:the section code-block rule
- 2026-10-07 · 13136e6f* · mutant killed · exit 1 · `plugin/lib/record.py` · a fence marker inside a YAML value hides the frontmatter status below it · acceptance-sha256:7452e090b51fbc4f4c932ea6847faeca9e7667b45902ad8221e746553285e3de · covers:the frontmatter-first fence walk
- 2026-10-07 · 13136e6f* · mutant killed · exit 1 · `plugin/lib/record.py` · a log section opening with a rule is read as frontmatter and its fenced row exposed · acceptance-sha256:7452e090b51fbc4f4c932ea6847faeca9e7667b45902ad8221e746553285e3de · covers:the document-only frontmatter
- 2026-10-07 · 13136e6f* · mutant killed · exit 1 · `plugin/lib/record.py` · a tab counts fixed columns instead of advancing to the next four-column stop · acceptance-sha256:7452e090b51fbc4f4c932ea6847faeca9e7667b45902ad8221e746553285e3de · covers:the column indentation rule
- 2026-10-07 · 13136e6f* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a text with no Status reads an empty Status in lifecycle · acceptance-sha256:7452e090b51fbc4f4c932ea6847faeca9e7667b45902ad8221e746553285e3de · covers:the empty-versus-absent Status

## Invariants

- A fence opened in the body still hides what it encloses, in every section reader.
- A record without frontmatter and without an indented or fenced Status line reads exactly as today.
- No section-local caller delimits frontmatter.

## Risks

- The fence-walk change reaches every section reader; S2 enumerates them and S4 runs their catalogue entries.
- S2, measured 2026-10-07 at 13136e6f. The fence walk's lines (ADR-092 Context's second pattern, counted with its awk step): 103 in 9 files, record.py 44, adr-lint 20, adr-verify 12, adr-next 7, adr-retire-check 6, lifecycle.mjs 5, spec-verify 3, arch-lint 3, adr-debt 3. Whole-document callers: record.py `_scan` (so `_sections`, `sections_of`, `section_span`, `repeated_headings` and `unterminated_fence`), `record_status` through `unfenced_numbered(..., document=True)`, and lifecycle's `fencedLines` (read by `inlineStatus` and `statusSection`). Section-lines callers, `document=False`: `unfenced_lines` (adr-lint's Verification and Mutation Log readers, adr-lint:1867 and :1886) and `status_section`'s own walk over its section's lines. Tracked `.md` files whose frontmatter block holds a fence marker: 0. Test locks on the test files that read a section: tests/status-reading.test.mjs 3, tests/status-section.test.mjs 1, tests/corpus-shapes.test.mjs 68, tests/not-recognised-reason.test.mjs 1, tests/record-identity.test.mjs 38, tests/gates.test.mjs 0; each of those files passes unchanged after S3.
- S4 found a GREEN: the campaign entry "ADR-074 T2: lifecycle reads a ## Status inside a code fence" stopped being killed once a section's fenced lines stopped being its value, because tests/status-section.test.mjs's fenced example now reads `''` under the mutant, which that row also calls ungoverning. The locked test stays byte-identical; `a Status heading inside a code fence opens no section` was added beside this task's six, and the entry now runs both files and is RED.

## Stop Condition

Stop and ask if a locked test's answer changes, or if any answer of ADR-092's rows R2, R3, R9, R35 or R36 is not the approved one after S3.

## Out of Scope

- Reading YAML beyond top-level keys (permanent: boundary: ADR-092 Out of Scope)
- The parity table (T1), which is written after this task so its rows hold the answers this task produces

## Verification Log
- 2026-10-07 · 13136e6f* · exit 1 · `out=$(node --test --test-reporter=tap tests/status-code-blocks.test.mjs 2>&1) \ …` · acceptance-sha256:7452e090b51fbc4f4c932ea6847faeca9e7667b45902ad8221e746553285e3de · ms:569 · test-lock-sha256:ee12f27f0b642f32e05e843cf007b0fb01a5eb195ac9ebad2695cddddc3c1206 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvc3RhdHVzLWNvZGUtYmxvY2tzLnRlc3QubWpzCWEgZmVuY2Ugb3BlbmVkIGluc2lkZSB0aGUgZnJvbnRtYXR0ZXIgaGlkZXMgbm90aGluZyBiZWxvdyBpdAk5MmJkNWU0ODFhNjA4YmIxZWM3ZTE5MTkwNmY2YWZmM2E5NDU1MmQ4OWRkYTY3MmMxMDA1YmEwOGM4ZjM4NDgyCmJvZHkJdGVzdHMvc3RhdHVzLWNvZGUtYmxvY2tzLnRlc3QubWpzCWEgZmVuY2VkIGxpbmUgaW4gYSBTdGF0dXMgc2VjdGlvbiBpcyBubyBTdGF0dXMsIGluZGVudGVkIGZlbmNlIG9yIG5vdAllNWUyNDY5Y2Y5YWZlODZhNjEzMjUxYTBlOTJhMmQwZTkxNDU4NTlkY2Y3NGI3ODZkMTc0YjA3YjE4MTc1MmVkCmJvZHkJdGVzdHMvc3RhdHVzLWNvZGUtYmxvY2tzLnRlc3QubWpzCWEgc2VjdGlvbiB0aGF0IG9wZW5zIHdpdGggYSBydWxlIGlzIG5vdCByZWFkIGFzIGZyb250bWF0dGVyCWM3ZTQ1YmNiMzgyMzE2NDhiMjkwYWVkMzM2N2YxZGVhMGU3NWU2NWMwMTFmMTE0YTRjNzMzNWY1MTI3OWNmOTYKYm9keQl0ZXN0cy9zdGF0dXMtY29kZS1ibG9ja3MudGVzdC5tanMJYW4gZW1wdHkgU3RhdHVzIHNlY3Rpb24gcmVhZHMgYW4gZW1wdHkgc3RyaW5nIGFuZCBubyBTdGF0dXMgcmVhZHMgbnVsbAk5NzM0OWI4OThhYWIyMDE1MjY2ZGE5Mzk3ZWNkMWNkMjZlMDM0NDc5YzBmNzU0NDZmZTZlMTFkYzRmMmE1ZDM0CmJvZHkJdGVzdHMvc3RhdHVzLWNvZGUtYmxvY2tzLnRlc3QubWpzCWluZGVudGF0aW9uIGlzIG1lYXN1cmVkIGluIGNvbHVtbnMgYXQgZm91ci1jb2x1bW4gdGFiIHN0b3BzCTQzOGE5ODkzZDExYTA3YTE4NmEzNTY5YjIyNmM3NTJhYTc2MmYyZmUyZWM2M2M3Njc0MDMzNDdmNDgyZTE2MDcKYm9keQl0ZXN0cy9zdGF0dXMtY29kZS1ibG9ja3MudGVzdC5tanMJbm8gaW5kZW50ZWQgY29kZS1ibG9jayBsaW5lIGlzIGEgU3RhdHVzLCBzZWN0aW9uIGZvcm0gaW5jbHVkZWQJZDE5YzQ2ODlmYjMwZDMyOWJmOGUwNzBhYmFlMWYyMjRiZDUwOTY5ZjRmMGRmOTg3OWY0ZjUwYmQ3MDBlZWJmYg
  ```
  ```
- 2026-10-07 · 13136e6f* · exit 0 · `out=$(node --test --test-reporter=tap tests/status-code-blocks.test.mjs 2>&1) \ …` · acceptance-sha256:7452e090b51fbc4f4c932ea6847faeca9e7667b45902ad8221e746553285e3de · ms:686
- 2026-10-07 · 13136e6f* · exit 0 · `out=$(node --test --test-reporter=tap tests/status-code-blocks.test.mjs 2>&1) \ …` · acceptance-sha256:7452e090b51fbc4f4c932ea6847faeca9e7667b45902ad8221e746553285e3de · ms:652
- 2026-10-07 · 13136e6f* · exit 0 · `out=$(node --test --test-reporter=tap tests/status-code-blocks.test.mjs 2>&1) \ …` · acceptance-sha256:7452e090b51fbc4f4c932ea6847faeca9e7667b45902ad8221e746553285e3de · ms:686
- 2026-10-07 · 13136e6f* · exit 0 · `out=$(node --test --test-reporter=tap tests/status-code-blocks.test.mjs 2>&1) \ …` · acceptance-sha256:7452e090b51fbc4f4c932ea6847faeca9e7667b45902ad8221e746553285e3de · ms:673
- 2026-10-07 · 13136e6f* · exit 0 · `out=$(node --test --test-reporter=tap tests/status-code-blocks.test.mjs 2>&1) \ …` · acceptance-sha256:7452e090b51fbc4f4c932ea6847faeca9e7667b45902ad8221e746553285e3de · ms:663
- 2026-10-07 · 13136e6f* · exit 0 · `out=$(node --test --test-reporter=tap tests/status-code-blocks.test.mjs 2>&1) \ …` · acceptance-sha256:7452e090b51fbc4f4c932ea6847faeca9e7667b45902ad8221e746553285e3de · ms:662
- 2026-10-07 · human-observed · observed by the executor (Claude, 2026-10-07): S2's caller list, the zero count of frontmatter fence markers and the test locks found are recorded in this task's Risks
