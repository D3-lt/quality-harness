# Task ADR-045-T11: Only CR, LF and CRLF break a line

**Depends-on:** T1
**Covers:** F-12, UC12-S1, UC12-S2
**Estimated scope:** XS (one splitter in the lib, two readers on it; docstrings and `--help`; one probe; one catalogue entry)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

The section walk split with `str.splitlines()`, which also breaks on VT, FF, FS, GS, RS, NEL, LS and PS. A heading holding one of them read as two lines — the second of which could be a heading, manufacturing the repeated-heading block T5 added out of one line — and a command holding one was hashed with that byte turned into `\n`, which is not "otherwise preserved" whatever the docstring said. T6 documented this as a non-goal; the owner has since said no edges, and this is one. `record.split_lines(text)` yields `(line, start, end)` on `\r\n`, `\r` and `\n` and nothing else; the walk and `acceptance_fence` read through it. The eight are bytes of a heading's name or of a command. adr-verify's `--help` and every docstring that described the old behaviour describe this one; the spec's Non-Goal carries the dated reversal and the earlier line stands.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | `_LINE_BREAK`, `split_lines`; `_scan` and `_as_lines` on it; docstrings |
| `plugin/bin/adr-verify` | edit | `--help` digest paragraph |
| `tests/gates.test.mjs` | edit | eight separators leave a heading whole and manufacture no repeat; three breaks do; a NEL reaches the digest |
| `tests/mutations.json` | edit | the eight put back into the splitter |
| `docs/specs/2026-09-11-one-record-grammar.md` | edit | Non-Goal reversal as a dated line; UC-12, F-12 |

## Ordered Steps

1. [S1] Bind the failing test: a heading holding each of the eight separators read as two headings under `splitlines()`; then recompute digests over every tracked record with `splitlines()` and with `split_lines` — 0 differences (the corpus holds none of the eight). [proof: acceptance]
2. [S2] The splitter; the readers on it; the docstrings and `--help`; the probe. [proof: acceptance]
3. [S3] The catalogue entry; run it with `node scripts/mutate.mjs --case`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'only CR, LF and CRLF break a line' tests/gates.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `record.py: only CR, LF and CRLF break a line — a heading holding a form feed is one heading and a NEL reaches the digest` | `tests/gates.test.mjs` | each of the eight: one heading with the byte in its name, no repeat; each of the three: two lines, repeat reported; `split_lines` on all eleven; the NEL in the normalized text and the digest over exactly those bytes | F-12, UC12-S1, UC12-S2 | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `split_lines` is in `record.__all__` |
| 2 — something selects it | `_scan` and `_as_lines` iterate it; `rg -n 'splitlines' plugin/lib/record.py` finds only docstrings |
| 3 — the caller can discover it | every gate reads sections through `sections_of` |
| 4 — it is used | the probe's eleven separators through the module |

## Mutation Log
- 2026-09-11 · eb0fe36* · mutant killed · exit 1 · `plugin/lib/record.py` · with the eight separators back in the splitter a heading holding a form feed is two headings and the probe sees the manufactured repeat · acceptance-sha256:ebf1ed6ebc84addfa79b6ff99cb02252d24067af71f7fb42f32957d8932651e1

## Invariants

- Digests of every tracked record are unchanged (0 differences).
- `normalize_acceptance` still folds CR and CRLF to LF and nothing else; its bytes for CR/LF input are unchanged.

## Risks

- `_HEADING`'s `\s*$` still trims a TRAILING NEL or FF from a heading's name, as it trims trailing spaces; a heading holding one mid-name keeps it. Documented, not an edge of the splitter.
- Gates that read record text outside `sections_of` (header lines, `Rests-on`) still use Python's `splitlines()` on those lines; none decides a digest or a heading.

## Stop Condition

A green run while `sections_of("## A\x0cB\n")` yields two headings.

## Out of Scope

- Replacing `splitlines()` in the gates' header readers (deferred: `docs/BACKLOG.md` — none decides a heading or a digest; the class is named there)
- Changing `normalize_acceptance`'s CR/CRLF folding (permanent: boundary: the bytes adr-lint has hashed since the digest existed)

## Notes

Found by the second Codex review of ADR-045 (M1), which reproduced all eight manufacturing a repeated Acceptance heading. The first review's reading — "keep as non-goal" — was a session's, not the owner's; the spec's Non-Goal keeps the earlier line and adds the dated reversal.

## Verification Log
- 2026-09-11 · eb0fe36* · exit 0 · `node --test --test-name-pattern 'only CR, LF and CRLF break a line' tests/gates.test.mjs` · acceptance-sha256:ebf1ed6ebc84addfa79b6ff99cb02252d24067af71f7fb42f32957d8932651e1 · ms:95
- 2026-09-11 · eb0fe36* · exit 0 · `node --test --test-name-pattern 'only CR, LF and CRLF break a line' tests/gates.test.mjs` · acceptance-sha256:ebf1ed6ebc84addfa79b6ff99cb02252d24067af71f7fb42f32957d8932651e1 · ms:79
