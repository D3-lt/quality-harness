# Task ADR-009-T2: report it where an agent is about to edit the file

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** zy
**Produces:** none
**Consumes:** the parsed and resolved `Enforced-by:` value in `bin/adr-lint` (T1)
**Data dependency:** hermetic

## Goal

Make `adr-context` report the enforcing check beside each governing record, so an agent editing a
governed file learns what will catch it at the moment that matters.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/adr-context.mjs` | edit | it already answers "which decisions govern this path"; the enforcing check is the other half of the same answer |
| `scripts/lifecycle.mjs` | edit | the edit-boundary hook calls the same resolver in-process, and the two must not drift |
| `tests/lifecycle.test.mjs` | edit | where `adr-context`'s resolver is asserted in-process |
| `tests/mutations.json` | edit | one mutation for the reporting |

## Ordered Steps

1. Confirm the failing test first: a two-record fixture where one governs a path and carries `Enforced-by:`, and `adr-context` over that path reports the check beside the record. Red today — the field is not read.
2. Read the resolved value through T1's parser rather than re-parsing, so the lint and the reporter cannot disagree about what a pointer means.
3. Report it on the `GOVERNS` line, and say nothing extra where a record has no header — silence is the correct output for a decision that is not mechanically enforced, and padding every line with `None` is noise at the moment an agent is trying to act.
4. Assert the hook path and the CLI path produce the same answer, because they are two callers of one resolver and that is exactly where this project has had drift before.

## Acceptance

```bash
node --test tests/lifecycle.test.mjs 2>&1 | tee /tmp/adr009-t2.out; ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr009-t2.out
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `adr-context reports what enforces a governing decision` | `tests/lifecycle.test.mjs` | the check appears beside the record for a path it governs | — |
| `a record with no Enforced-by adds nothing to the line` | `tests/lifecycle.test.mjs` | silence rather than `None`, so the output stays readable at the moment of an edit | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the tests above |
| 2 — something selects it | `scripts/selftest.sh` and CI; the mutation removes the reporting and the suite goes red |
| 3 — the caller can discover it | it arrives unprompted on the first edit to a governed file — the delivery mode BACKLOG §36 measured as the one that works, rather than at session load, which §35 measured as inert |
| 4 — it is used | to be recorded at execution: `adr-context` run over a path this repository's own records govern |

## Class Sweep

**Class:** every consumer of the corpus that reports what governs a path.

```bash
grep -rln "decisionsGoverning\|adrCorpus" scripts/ hooks/ | head
```

Run 2026-08-28. FOUR consumers, not three: `adr-context.mjs`, `lifecycle.mjs`'s edit-boundary hook,
`adr-state.mjs`, and **`work-next.mjs`**, which the authoring list missed.

Two now report the enforcing check — the CLI and the hook — and they render it from one resolver,
because two callers of one answer is where ADR-001 and ADR-004 both found drift. The equality is
asserted rather than assumed.

`adr-state.mjs` and `work-next.mjs` are deliberately left alone: both report corpus SHAPE — what
governs what, which stage is waiting — rather than answering "I am about to edit this file". Adding
the check there would be noise in a report nobody reads while editing, which is the delivery-mode
distinction BACKLOG §35 and §36 measured. Recorded here so the omission is a decision rather than an
oversight, since the sweep is the only place anyone would notice the difference.

## Mutation Log

<!-- tool-written by adr-verify --mutant; empty at authoring -->
- 2026-08-28 · 8d0fc8a · mutant killed · exit 1 · `scripts/adr-context.mjs` · the enforcing check stops reaching the edit boundary, which is the only moment it is actionable · acceptance-sha256:5b01f04ad28c429e88c82b06deb3255c6a7f78b5cde4b16908a3b1c9b7c91563

## Invariants

- The hook and the CLI answer from one resolver; neither re-parses the header.
- A record without the header changes no output.
- `adr-context` still exits 0 whatever it finds — it answers, it never refuses.

## Risks

- Two callers, one resolver, and this project has had that drift before (ADR-001, ADR-004). Mitigated by the equality assertion in step 4.
- More text at the moment of an edit could bury the finding. Mitigated by reporting nothing where there is no header.

## Stop Condition

Stop if reporting the check requires `adr-context` to read anything outside the corpus — it is
read-only over records by design, and resolving a test file would make it a different tool.

## Out of Scope

- Backfilling the header. (deferred: docs/BACKLOG.md §44)
- Any change to `adr-state.mjs`. (permanent: it reports corpus shape, not per-path governance.)

## Verification Log
<!-- tool-written by adr-verify; empty at authoring -->
- 2026-08-28 · 6793242 · exit 0 · `node --test tests/lifecycle.test.mjs 2>&1 | tee /tmp/adr009-t2.out; ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr009-t2.out` · acceptance-sha256:5b01f04ad28c429e88c82b06deb3255c6a7f78b5cde4b16908a3b1c9b7c91563
