# ADR-011: A record's pointers resolve, or the gate says they do not

**Status:** Accepted
**Date:** 2026-08-29
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-009-a-decision-names-what-enforces-it.md, docs/adr/ADR-008-the-plugin-is-not-the-repository.md, docs/BACKLOG.md §44, §45
**Governs:** `plugin/bin/adr-lint`, `plugin/scripts/lifecycle.mjs`
**Enforced-by:** `lint: a Governs path that matches nothing tracked is reported`
**Invalidates:** none — checked. ADR-009 added `Enforced-by:` and resolved it; this resolves the three headers ADR-009 deliberately left, using the machinery ADR-009 built. ADR-007 owns `Depends-on:` resolution and is untouched. ADR-003 requires a gate to assert behaviour, and this record's own gate is asserted behaviourally in both directions.
**Served-path change:** `adr-lint` and `adr-state` tell an author that a record cites an ADR, invalidates a record, or governs a path that does not exist — so a corpus whose paths were re-anchored by a move learns it has been un-governed instead of passing in silence.

## Context

A record header that points somewhere is checked for SHAPE and never against the thing it names.
Five headers point outside the record; measured 2026-08-29 over the ten records in `docs/adr/`, all
ten carry `Spec:`, `Cross-references:`, `Governs:` and `Invalidates:`, and three carry `Enforced-by:`.
Of those, `Spec:` resolves against the tree (blocking) and `Enforced-by:` resolves against the tree
and the mutation catalogue (advisory, ADR-009). **`Governs:`, `Cross-references:` and `Invalidates:`
resolve against nothing.**

The consequence is not documentary. On 2026-08-28, ADR-008 moved the plugin under `plugin/` and
re-anchored every path in the repository. Seven of the nine records then carried a `Governs:` line
naming `bin/adr-lint`, `templates/task-template.md` and siblings — paths that no longer existed. So
`adr-context plugin/bin/adr-lint` answered *none governs*, every accepted decision about the gates
stopped reaching the session that edits them, and `adr-lint` passed throughout. Nothing was wrong
with any record; nothing said the pointers had rotted. That is docs/BACKLOG.md §45, and §44 carries
the other two headers, which have the same hole with milder consequences: a record may cite an ADR
that does not exist, or claim to invalidate one, and no gate notices.

This is the same rot `Enforced-by:` was built to avoid, already present in headers every record here
uses. The argument for closing it now rather than then is ADR-009 T1's own: the resolution machinery
exists, and a change whose regression can be attributed is worth taking while the reason is still
legible.

## Existing Primitives Audit

- `adr-lint::resolve_enforcement` / `enforcement_pointers` (ADR-009) already parse a backticked,
  comma-separated header value and resolve each item, word-bounding `none\b`. **Reused for
  `Governs:` and `Cross-references:`.** Not reused verbatim for `Invalidates:`, whose value is a
  leading record id followed by prose (`ADR-001 — the clause of its Decision reading "…"`);
  comma-splitting that value tears the prose into pointers. The parse is stated per header below.
- `adr-lint::resolve_qualified_dep` (ADR-007) already resolves `ADR-003-T4` against the corpus by
  globbing `ADR-*.md` and comparing numbers. **Reused** as the record-id resolver `Invalidates:` and
  the ADR half of `Cross-references:` need.
- `adr-lint::git_root` already asks git where the tree is. **Reused** as the place the tracked-file
  listing hangs off.
- `lifecycle.mjs::declaredGoverns` + `pathMatchesDeclaration` + `globToRegExp` already parse
  `Governs:` (plain and adrkit typed form) and match a candidate path against a declaration, with
  `**` crossing separators and `*` not. **Reused** — T2 adds no matcher.
- `lifecycle.mjs` records already carry an `unresolved` slot, and `adr-state` already prints
  *"Recorded but not resolved by this tool: …"* for typed matchers that are not `type: path`.
  **Reused as the reporting channel** for a declared path that matches nothing tracked.
- `tests/gate-regressions.py` and its mirror in the JS suite are how ADR-009 kept one rule's two
  implementations from drifting. **Reused as the model**, and it is why this record ships two
  implementations rather than a shared module.

## Decision

`adr-lint` resolves all three remaining record pointers and **advises** when one names nothing:

- **`Governs:`** — each declared path must match at least one file git tracks. A glob resolves when
  it matches at least one; `plugin/bin/**` is the corpus's own case and must stay silent.
- **`Cross-references:`** — each item that looks like a repository path must be tracked, and each
  item that looks like a record id must resolve to a record in the corpus. A `§NN` fragment is not
  resolved (see Out of Scope). *Closed 2026-08-29 outside this record — `section_fragments` and
  `has_section` now resolve it; see docs/BACKLOG.md §44.*
- **`Invalidates:`** — the LEADING token only. `none\b` yields nothing to resolve; anything else is
  taken as a record id and resolved against the corpus, and the prose after it is ignored rather
  than split.

`adr-state` reports a `Governs:` declaration that matches nothing tracked through the `unresolved`
slot it already carries, because it is the tool that answers *what governs what* and the one that
answered "none governs" for a whole corpus without saying it could not find the paths.

Two constraints are part of the decision rather than of its implementation:

**Resolution is against `git ls-files` (plus `--others --exclude-standard`), never `existsSync`.**
A path check over the filesystem answers "is this on THIS machine", which makes the gate's verdict
depend on who is asking — the class ADR-008 named and the one this repository shipped on 2026-08-28
when a check passed locally and failed four CI jobs on the same commit.

**When git cannot answer, the gate says so and resolves nothing.** No tracked listing means "I could
not look", not "the path names nothing". That is ADR-005's rule, and this is exactly the shape that
breaks it: an empty listing makes every pointer in the corpus a finding at once.

It is **advice, never blocking**, for ADR-009's reason and one of its own: a corpus adopting this on
a tree it did not write will light up, and a gate that fails on day one is a gate people switch off.
Measured 2026-08-29 on this corpus, the check is silent — 0 of 10 records carry a pointer that fails
to resolve — and the same sweep reports a finding when one header is broken, so day-one silence here
is a property of the corpus and not of a check that cannot fire.

## Alternatives Considered

- **One shared grammar module imported by both `adr-lint` and `lifecycle.mjs`.** Rejected here, and
  the reasoning is worth recording because it is nearly the opposite of §47's. The gates are
  standalone scripts with no import path, and `plugin/scripts/standalone-link.mjs` generates a
  forwarder for every entry it finds in `plugin/bin/`, so a shared file placed there acquires one.
  More importantly the failure class differs: §47 is a WRITER and a READER of one evidence grammar,
  where a divergence silently drops claims from a denominator; here both tools are readers of a
  header a human wrote, which is the case ADR-009 already settled with two implementations and one
  mirrored truth table.
- **Resolve `Governs:` in the JS reader and the other two in `adr-lint`, splitting by where the
  parser already lives.** Rejected: it puts one decision in two places by accident of implementation
  and gives an author two tools to consult about one property. `adr-lint` is the authoring gate the
  skill runs and CI runs over the corpus; it answers all three.
- **Block rather than advise.** Rejected on the same evidence as ADR-009, plus this record's own: a
  blocking version of this check would have failed the entire corpus for the two days after ADR-008
  moved the tree, during which nothing was actually wrong with any record.
- **Do nothing; the paths were re-anchored and the corpus governs again.** The honest counter. It
  fixes the instance and not the class: nothing stops the next move, and the next move is invisible
  by construction — every gate stayed green through the last one.

## Component / Boundary Impact

None — one advisory check added to an existing gate, and one existing report line in `adr-state`
gaining a second source. No component moves and no ownership changes.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `adr-lint` findings | advises when `Governs:`, `Cross-references:` or `Invalidates:` names nothing that exists | `check_pointers` | authors, CI, `/quality-harness:adr-write` |
| `adr-lint` tracked-file listing | new: `git ls-files` + `--others --exclude-standard`, with an explicit "could not look" state | `tracked_paths()` | `check_pointers` |
| `adr-state` "Recorded but not resolved by this tool" line | second source: a declared `Governs:` path matching nothing tracked | `lifecycle.mjs::corpusRecords` | `adr-state`, `work-next` |
| `tests/gate-regressions.py` truth table | new: the per-header parse and its resolution, mirrored in the JS suite | T1 | T2 |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| the pointer-resolution truth table in `tests/gate-regressions.py` | T1 | T2 | No — T2 mirrors the table it is handed; a record with no pointer headers is unchanged in both |

## Implementation

Two tasks, in `tasks/`. See `tasks/README.md`.

## Consequences

- **Positive:** a move that re-anchors the tree stops being invisible. The corpus's own worst case —
  seven records un-governed for two days with every gate green — becomes a finding at the next lint.
- **Positive:** `adr-state` stops being able to say "none governs" without saying why.
- **Negative:** a new `git` invocation in `adr-lint`, on a gate that until now touched only files.
  Mitigated by the explicit "could not look" state, which is the only correct answer when git is
  absent and is asserted in the same test as the resolving cases.
- **Negative:** one rule, two implementations — the drift ADR-001 and ADR-004 are both about.
  Mitigated exactly as ADR-009 mitigated it: one truth table, mirrored, so the two cannot disagree
  unnoticed.
- **Neutral:** every record in this corpus resolves today, so nothing here changes verdict. That is
  a fact about the corpus, and the mutation is what shows the check can still fire.

## Out of Scope

- Backfilling `Enforced-by:` into the seven records that lack it. (deferred: docs/BACKLOG.md §44)
- The `adr-lint` / `adr-verify` evidence-grammar divergences, sha range and record-number resolution. (deferred: docs/BACKLOG.md §47)
- Resolving a `§NN` fragment in `Cross-references:` to a heading in the file it names. (deferred: docs/BACKLOG.md §44 — CLOSED there 2026-08-29; the deferral is kept as written because it was this record's scope at the time)
- Making `Governs:` blocking, here or later. (permanent: a corpus adopting this on a tree it did not write lights up on day one, and this repository's own two-day un-governed window is what a blocking version would have failed for no fault of any record.)
- Proving that a resolved pointer was HONOURED rather than merely resolvable. (permanent: that is a different question with a different mechanism — `adr-debt`'s `UNRECEIPTED` answers it for deferrals — and folding it in would make one check mean two things.)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The tracked listing comes back empty and every pointer becomes a finding at once | Med | High | "could not look" is a distinct state that resolves nothing and says so; asserted in the same test as the resolving cases |
| The two implementations disagree about what a `Governs:` declaration means | Med | Med | one truth table in `tests/gate-regressions.py`, mirrored in the JS suite — ADR-009's mechanism, reused |
| A glob semantic differs between the Python resolver and `globToRegExp` | Med | Med | the truth table carries `plugin/bin/**` and a `*`-does-not-cross-separator case on both sides |
| The check is silent on this corpus and nobody notices it never fires | Low | High | the catalogue mutation removes the resolution and the suite must go red; the class sweep in T1 records both a clean run and a deliberately dirtied one |
| `Invalidates:` prose is parsed as pointers | Med | Low | leading token only, asserted against the seven real `none — checked. ADR-003 governs …` values in this corpus |
| This record's own `Enforced-by:` names a label that does not exist yet | High | Low | open and deliberate while this record is Proposed — `adr-lint` advises on it today, T1 creates it, and the mutation's `label` in `tests/mutations.json` must be that string VERBATIM or the pointer this record is about will not resolve |

## Rollback

Revert the commit. The checks are advisory and write nothing; no record depends on them and no
persistent state is involved.

## Follow-ups

None — both deferrals point at backlog entries that already carry the work.
