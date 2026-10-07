# Task ADR-092-T5: no code-block line is a Status, and a frontmatter fence hides nothing

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (record.py and lifecycle.mjs fence walk and status readers, tests, campaign entries)
**Owner:** unassigned
**Produces:** `status_section` / `statusSection` skipping indented code-block lines; a fence walk that starts after the frontmatter block
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the section code-block rule`, `the frontmatter-first fence walk`

## Goal

No line indented as a code block (four spaces or a tab) is a Status in any form, section included (finding 2), and a fence marker inside the frontmatter does not open a fence over the text below it (finding 7), in record.py and lifecycle alike. This task lands first, so the parity table T1 writes holds rows R2 and R9 at their approved answers (ADR-092 Decision 6) and no task's acceptance depends on a wrong one.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | `status_section` skips indented code-block lines; `_scan` and `unfenced_numbered` treat the frontmatter block's lines as no fence |
| `plugin/scripts/lifecycle.mjs` | edit | `statusSection` and `fencedLines` the same |
| `tests/status-code-blocks.test.mjs` | add | this task's two tests |
| `tests/mutations.json` | edit | one entry per Rests-on name (or the per-source file under `tests/mutations/` once ADR-091 T3 has landed) |

## Ordered Steps

1. [S1] Write this task's two tests and record the red run (TDD red): today `## Status\n\n    Accepted` reads Accepted in both languages, and a YAML literal holding an unmatched fence marker hides a later top-level `status:` (measured 2026-10-07: record.py's `record_status` returns None for ADR-092's row R9).
2. [S2] Enumerate the fence walk's callers with the second command in ADR-092's Context, count this repository's tracked `.md` files whose frontmatter holds a fence marker, and run `scripts/test-locks.py` on every test file that reads a section; record all three in this task's prose. [proof: human: the executor records the caller count, the file count and the locked tests found]
3. [S3] Change `status_section` / `statusSection` and the fence walk in both languages.
4. [S4] Record one killed mutant per Rests-on name and add them to the catalogue; run every catalogue entry in each function this task edits, one at a time. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/status-code-blocks.test.mjs 2>&1) \
  && for t in 'no indented code-block line is a Status, section form included' 'a fence opened inside the frontmatter hides nothing below it'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$")" != 1 ]; then exit 1; fi; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `no indented code-block line is a Status, section form included` | `tests/status-code-blocks.test.mjs` | `## Status` followed by a four-space or tab-indented `Accepted` reads no Status in record.py and lifecycle; its twin with an unindented `Accepted` reads Accepted | — | S1, S3 |
| `a fence opened inside the frontmatter hides nothing below it` | `tests/status-code-blocks.test.mjs` | a frontmatter whose YAML literal holds an unmatched fence marker, with `status: accepted` as a later top-level key, reads accepted in both languages, and a `## Status` section below the block is still found; its twin, a fence opened in the body, still hides what it encloses | — | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `record_status` and `inlineStatus` read through the walk; mutants dropping either rule are caught |
| 3 — the caller can discover it | `n/a: no declared interface` |
| 4 — it is used | every status read; nothing measures this yet |

## Mutation Log

## Invariants

- A fence opened in the body still hides what it encloses, in every section reader.
- A record without frontmatter and without an indented Status line reads exactly as today.

## Risks

- The fence-walk change reaches every section reader; S2 enumerates them and S4 runs their catalogue entries.

## Stop Condition

Stop and ask if a locked test's answer changes, or if any answer of ADR-092's rows R2, R3 or R9 is not the approved one after S3.

## Out of Scope

- Reading YAML beyond top-level keys (permanent: boundary: ADR-092 Out of Scope)
- The parity table (T1), which is written after this task so its rows R2 and R9 hold the answers this task produces

## Verification Log
