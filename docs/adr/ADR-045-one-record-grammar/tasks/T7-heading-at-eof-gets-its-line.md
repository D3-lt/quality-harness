# Task ADR-045-T7: An entry under a heading that ends the file gets its own line

**Depends-on:** T6
**Covers:** F-8, UC8-S1, UC8-S2
**Estimated scope:** XS (four lines in the writer; one CLI regression; one catalogue entry)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`append_entry` splices by `section_span` (T6). A `## Verification Log` that is the file's LAST LINE with no line break has a span whose head ends at the heading text, and the entry was written onto it: `## Verification Log- 2026-…` — one line, no section, exit 0. The regex T6 replaced required `\n` after the heading and refused the file, so T6 traded a refusal for a corruption. Reproduced 2026-09-11 under a temp copy of the fixture (`tail -c` showed `L o g - 2 0 2 6`). The writer now supplies the break in `\n` form (read_text folds CRLF; `write_source` spells the file's own ending back) and the regression reads the result back through `sections_of` — the entry must be IN the section, not merely present in the bytes.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-verify` | edit | `append_entry`: `head` gains a `\n` when the heading has none |
| `tests/evidence-chain.test.mjs` | edit | heading at EOF, LF and CRLF, read back through `record.sections_of`; a glued line shown not to be a heading |
| `tests/mutations.json` | edit | the break not added |

## Ordered Steps

1. [S1] Reproduce under `/tmp`: `--human` on a task ending in `## Verification Log` with no terminator glues the entry to the heading. Bind the failing test through the CLI, reading back with `sections_of`. [proof: acceptance]
2. [S2] Add the break in `append_entry`. [proof: acceptance]
3. [S3] Add the catalogue entry; run it with `node scripts/mutate.mjs --case`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'ends the file without a line break' tests/evidence-chain.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an entry appended under a heading that ends the file without a line break lands in the section, on its own line` | `tests/evidence-chain.test.mjs` | LF and CRLF: exit 0, heading keeps the file's ending, `sections_of` reads the entry inside `Verification Log`; a glued heading is not a heading to `sections_of` | F-8, UC8-S1, UC8-S2 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the `head.endswith("\n")` guard in `append_entry` |
| 2 — something selects it | every recording path goes through `append_entry` |
| 3 — the caller can discover it | the CLI writes the entry on its own line |
| 4 — it is used | `--human` on the truncated fixture, read back by the shared grammar |

## Mutation Log
- 2026-09-11 · eb0fe36* · mutant killed · exit 1 · `plugin/bin/adr-verify` · without the break the entry is glued onto a heading that ends the file, and the read-back through sections_of finds no Verification Log section · acceptance-sha256:09e2899d49ca072ebc421023b2c8faa28a6621df8766ca245801c5c26547f02f

## Invariants

- A file that already ends its heading with a break is byte-identical under the new writer (the guard fires only when `head` lacks `\n`).
- The line ending written is the file's own (`write_source`, `file_newline`).

## Risks

- A heading followed by trailing spaces and no break (`## Verification Log  ` at EOF): `_HEADING` trims the spaces into the name, the head still lacks `\n`, and the guard fires — the same path.

## Stop Condition

A green run while `--human` on a heading-at-EOF task leaves a line beginning `## Verification Log-`.

## Out of Scope

- Making the writer create a missing `## Verification Log` section (permanent: boundary: a task file's shape is the author's — `append_entry` refuses with the add-a-heading sentence, BACKLOG §70)

## Notes

Class: every splice by `section_span` — `append_entry` is the only one (`rg -n 'section_span\(' plugin/bin` → one call). The Mutation Log writer shares it, so the fix covers `--mutant` and `--human-mutant` rows too. Found by the second Codex review of ADR-045 (M2), which also produced the old/new byte matrix: CRLF same, trailing blanks same, fenced `## ` different by design, heading-at-EOF regressive.

## Verification Log
- 2026-09-11 · eb0fe36 · exit 0 · `node --test --test-name-pattern 'ends the file without a line break' tests/evidence-chain.test.mjs` · acceptance-sha256:09e2899d49ca072ebc421023b2c8faa28a6621df8766ca245801c5c26547f02f · ms:286
- 2026-09-11 · eb0fe36* · exit 0 · `node --test --test-name-pattern 'ends the file without a line break' tests/evidence-chain.test.mjs` · acceptance-sha256:09e2899d49ca072ebc421023b2c8faa28a6621df8766ca245801c5c26547f02f · ms:203
