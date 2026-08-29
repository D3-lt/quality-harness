# Task ADR-011-T2: make adr-state say a Governs path resolves to nothing

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** zy
**Produces:** none
**Consumes:** the pointer-resolution truth table in `tests/gate-regressions.py` (T1)
**Data dependency:** hermetic

## Goal

Make the reader that answers *what governs what* report a declared `Governs:` path that matches
nothing git tracks, instead of silently governing nothing.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `declaredGoverns` parses the header and `adrCorpus` already carries an `unresolved` slot; this fills it for a second reason, from an injected tracked listing |
| `plugin/scripts/adr-state.mjs` | edit | it is the tool that answers "what governs what" and it printed nothing about a declaration that matches nothing |
| `tests/lifecycle.test.mjs` | edit | where the corpus reader's behaviour is asserted, and where T1's truth table is mirrored |
| `tests/mutations.json` | edit | ADR-003 requires the mechanism to carry a mutation |

**Corrected during execution, 2026-08-29.** This task was authored claiming `adr-state.mjs` already
printed the `unresolved` slot and was deliberately not edited. It does not. The
`Recorded but not resolved by this tool:` line lives in `lifecycle.mjs::decisionContext`, which is
the EDIT-BOUNDARY HOOK's renderer, not `adr-state`'s — `adr-state` reads `record.declares` and never
touches `unresolved`. So the authoring claim named the wrong caller, and shipping on it would have
left the tool that answers "what governs what" silent about a declaration that governs nothing:
exactly the failure this record is about, one tool over. `adr-state.mjs` gains the report and a test
that spawns it against a real git fixture.

## Ordered Steps

1. Confirm the failing test first, red today: a corpus whose record declares `Governs:` on a path no
   tracked file matches is read with an empty `unresolved`, and `adr-state` prints nothing about it.
2. Give `adrCorpus` the tracked listing — `git ls-files` plus `--others --exclude-standard`
   through `spawnSync`, taken once per corpus read, `null` when git cannot answer.
3. When the listing is available, a declared path that no tracked file matches under
   `pathMatchesDeclaration` is pushed to `unresolved` as `governs:<the declaration>`, which is the
   shape the slot already carries for typed matchers.
4. When the listing is `null`, push nothing: the reader could not look, and a corpus read outside a
   git tree must not report every declaration as rot.
5. Mirror T1's truth table cases — the `**`-crosses-separators and `*`-does-not case, and the
   directory-prefix case — so the two implementations cannot disagree unnoticed.
6. Add the mutation: make the unresolved push unconditional-false so a broken declaration reads as
   resolved, and confirm the suite goes red.

## Acceptance

```bash
set -o pipefail
node --test tests/lifecycle.test.mjs 2>&1 | tee /tmp/adr011-t2.out && ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr011-t2.out
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `a declared Governs path matching nothing tracked is reported unresolved` | `tests/lifecycle.test.mjs` | the dirty answer | — |
| `adr-state prints a declaration that matches nothing, and goes quiet when it is repaired` | `tests/lifecycle.test.mjs` | the renderer, spawned against a real git fixture, in both directions | — |
| `a declared Governs glob matching one tracked file is not reported` | `tests/lifecycle.test.mjs` | the clean answer, in the same test as the dirty one | — |
| `a corpus read with no tracked listing reports nothing unresolved` | `tests/lifecycle.test.mjs` | could-not-look is not a verdict | — |
| `the JS and Python matchers agree on the mirrored truth table` | `tests/lifecycle.test.mjs` | the two implementations cannot drift | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the tests above |
| 2 — something selects it | `adr-state.mjs` filters the slot for `governs:` entries and prints them; the spawned-CLI assertion covers that line, and the mutation makes the push unconditional-false so `node --test tests/lifecycle.test.mjs` goes red |
| 3 — the caller can discover it | the printed paragraph says what a listed declaration means and what it costs; the `governs:` prefix keeps it distinguishable from the typed-matcher entries the slot already carried, and `decisionContext` (the edit-boundary hook) renders the same slot at the moment an agent edits a governed file |
| 4 — it is used | to be recorded at execution: `node plugin/scripts/adr-state.mjs` over this repository, confirming the line stays absent while every declaration resolves |

## Mutation Log

<!-- tool-written by adr-verify --mutant; empty at authoring -->

## Invariants

- `adr-state` exits 0 whatever it finds; this adds a report, never a verdict.
- A corpus read outside a git tree reports nothing unresolved for this reason.
- The two implementations answer the mirrored truth table identically.
- `adrCorpus` stays hermetic when handed a listing: `tracked` is an injectable parameter, and every existing caller reading a corpus outside a git tree is unchanged.

## Risks

- The tracked listing makes `corpusRecords` spawn git where it previously only read files. Mitigated by taking it once per read and tolerating failure as `null`.
- `governs:` and the typed-matcher entries share one line and could confuse a reader. Mitigated by the prefix, asserted in the test.

## Stop Condition

Stop if reporting through the existing `unresolved` slot would change what an existing consumer of
that slot means by it — a second meaning in one field is the ambiguity ADR-006 is about, and a new
field should be taken as a decision rather than assumed here.

## Out of Scope

- The `adr-lint` half of the resolution. (that is T1's job)
- Any change to what `adr-context` prints for a queried path. (permanent: it answers "which records govern this path", and a declaration matching nothing produces no row there to annotate; the hook's `decisionContext` renderer already reads the same slot.)

## Verification Log

<!-- tool-written by adr-verify; empty at authoring -->
