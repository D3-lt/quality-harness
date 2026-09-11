# Task ADR-045-T6: adr-verify's remaining section readers are the shared grammar

**Depends-on:** T1
**Covers:** F-7, UC7-S1, UC7-S2, UC7-S3
**Estimated scope:** S (one function in the lib; three readers in adr-verify; three regressions; docstrings)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

The three `(?=^## |\Z)` readers ADR-045 left in adr-verify — `append_entry` (the entry writer), `declared_steps`, `claims_in` — read through the shared grammar. `record.section_span(text, heading)` gives the writer `(start, body_start, end)` offsets from the same walk `sections_of` uses, so what it rewrites is what every reader reads; the two readers go through `sections_of`. A fenced `## ` line in the Verification Log no longer swallows the next entry or the claims after it; one in Ordered Steps no longer hides a declared step. `rg -n '\(\?=\^## \|\\Z\)' plugin/bin` finds nothing, and the one-module test refuses the shape. The docstrings that said "command content is otherwise preserved" now say what `splitlines()` does to line separators.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | `_sections` walk with offsets; `section_span`; docstrings on line separators |
| `plugin/bin/adr-verify` | edit | `append_entry` splices by `section_span` (blank lines after the heading kept byte for byte); `declared_steps` and `claims_in` through `sections_of`; `--help` digest paragraph rewritten truthfully |
| `tests/evidence-chain.test.mjs` | edit | `--human` appends after a fenced `## `; `--steps S2` declared after one |
| `tests/sweep.test.mjs` | edit | a claim after a fenced `## ` is counted; without it, zero |
| `tests/gates.test.mjs` | edit | no gate carries `(?=^## \|\Z)`; `section_span` on its own |
| `tests/mutations.json` | edit | each of the three readers returned to its regex; `section_span` first-wins; the append entry's `from` follows the splice |
| `docs/BACKLOG.md` | edit | §197 closed by a dated correction entry, not by rewriting §197 |

## Ordered Steps

1. [S1] Bind the failing tests: an entry appended inside a fenced excerpt; `--steps S2` refused after a fenced line; a claim after one lost from the sweep. [proof: acceptance]
2. [S2] Add `_sections` / `section_span`; move the three readers; rewrite the docstrings. [proof: acceptance]
3. [S3] Add the catalogue entries; run each with `node scripts/mutate.mjs --case`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'appended after a fenced ## line|sees a step declared after a fenced' tests/evidence-chain.test.mjs && node --test --test-name-pattern 'fenced ## line in the Verification Log is still a claim' tests/sweep.test.mjs && node --test --test-name-pattern 'record.py: the opener is bash|the record grammar is one module' tests/gates.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an entry is appended after a fenced ## line in the Verification Log, not inside the fence` | `tests/evidence-chain.test.mjs` | the new row is the section's last line, the excerpt intact and first; no section → the add-a-heading refusal | F-7, UC7-S1 | S1, S2 |
| `--steps sees a step declared after a fenced ## line in Ordered Steps` | `tests/evidence-chain.test.mjs` | S2 accepted and recorded; S9 refused naming S1, S2 | F-7, UC7-S2 | S1, S2 |
| `a claim written after a fenced ## line in the Verification Log is still a claim` | `tests/sweep.test.mjs` | claims 1 / held 1; the same log without the row → 0 | F-7, UC7-S3 | S1, S2 |
| `record.py: the opener is bash, sh or shell; a repeated heading is named; a span is where the reader reads` | `tests/gates.test.mjs` | the span's head is the last heading line, its body the reader's body, CRLF intact; no heading → None | F-7 | S2 |
| `the record grammar is one module: every gate loads plugin/lib/record.py and none keeps a copy` | `tests/gates.test.mjs` | no gate source carries `(?=^## \|\Z)`; the scan matches the shape when present | F-7 | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `section_span` is in `record.__all__` |
| 2 — something selects it | `append_entry` — every entry adr-verify writes goes through it |
| 3 — the caller can discover it | the one-module test fails on a private `(?=^## \|\Z)` |
| 4 — it is used | `--human`, `--steps` and `--sweep` behave through the CLI on the fenced fixtures |

## Mutation Log

- 2026-09-11 · 9942edb* · mutant killed · exit 1 · `plugin/bin/adr-verify` · with declared_steps reading nothing, --steps S2 is refused as against a task declaring no identities, so the fenced-line fixture cannot record the step it declares · acceptance-sha256:058be607b3587ee6e46a5bac5bce405460f736b195cc71282ebf8fecae9fd41f

## Invariants

- Every task file adr-verify has written is byte-identical under the new writer: the blank lines after `## Verification Log` are kept as the regex's `\s*\n` kept them (measured over the corpus's 209 tracked records: `sections_of` old and new agree on every file).
- No `(?=^## |\Z)` under `plugin/bin`.
- `normalize_acceptance` bytes are unchanged.

## Risks

- A Verification Log whose heading is followed by whitespace with no line break (heading at EOF plus spaces) — the regex and the span agree (both leave it as body); covered by the append test's shape only indirectly.

## Stop Condition

A green run while an entry can land inside a fenced excerpt, or while `rg -n '\(\?=\^## \|\\Z\)' plugin/bin` matches.

## Out of Scope

- Making `sections_of` source-preserving for VT, FF, FS, GS, RS, NEL, LS, PS (deferred: `docs/specs/2026-09-11-one-record-grammar.md` §Non-Goals — owner's decision: document, do not change hashed bytes)
- Rewriting BACKLOG §197 (permanent: boundary: the backlog is history, CLAUDE.md §10; a dated correction is appended instead)

## Notes

Class: `rg -n '\(\?=\^## \|\\Z\)' plugin/bin` — three on `01cb598` (adr-verify:667, :1673, :1984), zero after. All three are the same class as T1's two: a reader that stops at a fenced `## `. None was "not Acceptance grammar" — the section grammar is the grammar, whatever the heading — so all three move. BACKLOG §197 also said adr-verify and adr-lint read ```sh / ```shell; adr-lint's digest path did not (T3), and the correction entry says so.

*2026-09-11, after the second Codex review (left as written above, CLAUDE.md §10): this task's fixture — an unindented fence holding an unindented `## FAIL` — is a hand-written shape, not one tool-written output produces. adr-verify indents every excerpt line by two spaces and `_HEADING` is line-start, so an indented `## ` inside an excerpt was never a heading and the entry writer was not, in fact, reachable through a recorded failure this way. The class (a reader ending at any `^## ` line) is real and closed here; the reachable tool-written member was an excerpt line that is itself ``` — T8, and BACKLOG §199.*

## Verification Log
- 2026-09-11 · 9942edb* · exit 0 · `node --test --test-name-pattern 'appended after a fenced ## line|sees a step declared after a fenced' tests/evidence-chain.test.mjs && node --test --test-name-pattern 'fenced ## line in the Verification Log is still a claim' tests/sweep.test.mjs && node --test --test-name-pattern 'record.py: the opener is bash|the record grammar is one module' tests/gates.test.mjs` · acceptance-sha256:058be607b3587ee6e46a5bac5bce405460f736b195cc71282ebf8fecae9fd41f · ms:822
- 2026-09-11 · 9942edb* · exit 0 · `node --test --test-name-pattern 'appended after a fenced ## line|sees a step declared after a fenced' tests/evidence-chain.test.mjs && node --test --test-name-pattern 'fenced ## line in the Verification Log is still a claim' tests/sweep.test.mjs && node --test --test-name-pattern 'record.py: the opener is bash|the record grammar is one module' tests/gates.test.mjs` · acceptance-sha256:058be607b3587ee6e46a5bac5bce405460f736b195cc71282ebf8fecae9fd41f · ms:676
