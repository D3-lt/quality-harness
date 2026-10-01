# Task ADR-078-T1: Hasher 2 reads, bounds and digests a JavaScript test with a lexer

**Depends-on:** none
**Covers:** F-3, F-4, F-5, F-6, UC1-S1, UC1-S2, UC1-S3
**Estimated scope:** M (one module, one test block, the catalogue)
**Owner:** unassigned
**Produces:** `extract_test_names(…, hasher=)`, `extract_test_body(…, hasher=)` and `body_digest(…, hasher=)` in `plugin/lib/record.py`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a head counts only in code`, `the regex operand rule`, `an interpolation is code`, `hasher 2 is JavaScript-only`

## Goal

`extract_test_names`, `extract_test_body` and `body_digest` take `hasher=2`, which reads a JavaScript-family text with a lexer that knows strings, templates and their interpolation, regex literals and comments, and reports the first position it cannot establish; every other file reads exactly as under hasher 1 (ADR-078 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | the memoised lexer; `hasher=` on the three functions, default 1; F-5's rule; the first unestablished position |
| `tests/test-lock.test.mjs` | edit | remove `todo` from this task's four tests |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Remove `todo` from the four tests in Covers and record the red run (TDD red). [proof: acceptance]
2. [S2] Write the lexer: one memoised scan returning, per position, whether it is code, and the first position whose literal, comment or `/` it cannot establish.
3. [S3] Decide each `/` by F-5: divide after a value (an identifier — an operator keyword after `.` included — a number, a closed string, template or regex, a postfix `++`/`--`, `]`, a `)` not closing an `if`/`while`/`for`/`with` header); open a regex after an operator (`=>` included), an opening bracket, `,`, `;`, an operator keyword, the label after `break`/`continue`, or a `)` closing such a header. After `}`, and after a lone `>` when the caller says the text is TypeScript, stop: that is the first unestablished position (F-7).
4. [S4] Read a template's `${…}` as code with its own brace depth, so strings, templates and braces inside it nest (F-6).
5. [S5] `hasher=2` on a JavaScript-family read: a head counts only where the lexer says code; a body is bounded on the lexer's masked view; a head after, or a body reaching, the first unestablished position yields no name or no body; `body_digest` strips comments and collapses whitespace from the lexer's spans. Every other flag combination reads as hasher 1.
6. [S6] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/test-lock.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE 'ok [0-9]+ - (hasher 2 counts a test only where its call is code|hasher 2 reads a regex literal as a regex and a division as a division|hasher 2 reads a template.s interpolation as code|hasher 2 reads a non-JavaScript test file exactly as hasher 1 does)' "$T")" -eq 4
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `hasher 2 counts a test only where its call is code` | `tests/test-lock.test.mjs` | string, comment, regex and template text are data; a same-named string does not stand in for the real declaration; an interpolation's exact body | F-4, UC1-S1 | S2, S5 |
| `hasher 2 reads a regex literal as a regex and a division as a division` | `tests/test-lock.test.mjs` | `=> /^[`/.]/`, a quote-holding regex, a division chain, `obj.in /`, a regex after `break outer`, each body exact to its brace | F-5, UC1-S2 | S3, S5 |
| `hasher 2 reads a template's interpolation as code` | `tests/test-lock.test.mjs` | nested templates and braces in `${…}`, the exact body; the fixture hasher 1 hashes as a prefix | F-6, UC1-S3 | S4, S5 |
| `hasher 2 reads a non-JavaScript test file exactly as hasher 1 does` | `tests/test-lock.test.mjs` | Python, Go, PHP (Pest), Rust, shell and Swift read identically | F-3 | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the lexer and the four tests |
| 2 — something selects it | `hasher=2`; nothing in the served path passes it until T2 makes it `snapshot_lock`'s default |
| 3 — the caller can discover it | n/a: an internal keyword argument |
| 4 — it is used | T2 |

## Mutation Log

## Invariants

- `extract_test_names`, `extract_test_body` and `body_digest` with no `hasher` argument return exactly what they return today, for every input.
- `_mask_lock_noncode`, `_legacy_digest` and the Go readers are unchanged.

## Risks

- F-5 is a classifier over an open input space (CLAUDE.md §16): every branch of it gets an executed case, and what it cannot place is UNPROVEN rather than guessed.

## Stop Condition

Stop and ask if a test in this repository that hasher 1 hashes correctly gets no name or no body under hasher 2: run both hashers over `tests/*.mjs` and compare before recording the mutants.

## Out of Scope

- The lock format and its readers — T2.

## Verification Log
