# ADR-079: Every gate reads JavaScript one way

**Status:** Proposed
**Date:** 2026-10-01
**Owner:** Zy
**Spec:** docs/specs/2026-10-01-every-gate-reads-javascript-one-way.md
**Cross-references:** docs/adr/ADR-078-a-lock-reads-javascript-as-javascript.md
**Governs:** plugin/bin/spec-verify, plugin/bin/adr-lint
**Enforced-by:** `tests/js-reading.test.mjs::adr-lint reads a JavaScript test where its call is code, bounded as the lock bounds it`
**Invalidates:** none — checked. ADR-078 deferred exactly these two readers to BACKLOG §324. This record takes them, and changes no lock, no hasher and no recorded evidence.
**Served-path change:** `spec-verify` (shipped) and `adr-lint` (shipped) read a JavaScript-family test file with ADR-078's `_js_lex`, so a `test(` inside a string is no longer a test to either, a body ends where the lock's does, and a test past where the lexer stops is UNPROVEN rather than missing or silently skipped.

## Context

The spec's Problem and Goal are inherited (docs/specs/2026-10-01-every-gate-reads-javascript-one-way.md). Decision-relevant deltas:

- The Codex architecture review of 2026-10-01 ranked this second of its next three: existence, ability to fail, and lock identity can disagree about the same source.
- The class, enumerated 2026-10-01 with `git grep -n -E 'mask_noncode\(|registered_test_names\(|def test_body|test_body\(' -- plugin/bin`. That covers `spec-verify`'s `test_definition_exists` (its JavaScript branch, `plugin/bin/spec-verify:348-361`) and `adr-lint`'s `test_body`, whose callers are the existence check (`plugin/bin/adr-lint:4699`), the can-fail check (`:5396`, `:5408`) and a non-JavaScript path (`:3772`). `spec-verify:622-636` reads Swift and is out of the class; BACKLOG §328 records the correction to ADR-078.
- The owner set the bar (spec Grill Log row 3): no verdict on this corpus changes apart from the listed fixes, and any other change stops the work.
- **⚠ Parked, 2026-10-01: a cold Codex review of this draft asked for changes, with eight findings, so this record is not ready to accept as written.** They are in BACKLOG §329: the raw-occurrence UNPROVEN rule misfires both ways; `js_title_exists` is a second existence path; the can-fail scan reads the body with `code_only`; the registration vocabularies still disagree; further readers exist (`commented_out`, the Ruby and declaration fallbacks, `resolve_enforcement`, `.mts`/`.cts` at `:3772`); the stubs pass a wrong implementation; the fences count matches; the corpus bar is undefined. The owner moved commit-time cost ahead of it the same day.

## Existing Primitives Audit

- **`_js_lex` and `_h2_in_code`** (`plugin/lib/record.py`, ADR-078): reused as they are. The masked view keeps code and newlines, masks a literal as NUL, and stops where a `/` or a literal cannot be placed.
- **`registered_test_names`** (`plugin/bin/spec-verify:295`): kept. Its registration rules (bare calls, `.skip` and other modifiers, no receiver calls) are spec-verify's own; only the masked text it reads changes.
- **`bdd_callback_body(…, masked=)`** (`plugin/lib/record.py`, ADR-078 T1): reused, for the body bound.
- **`test_body`'s BDD pattern** (`plugin/bin/adr-lint:4892`): kept, `describe`/`context`/`specify`/`scenario`/`t.Run` included; a match now counts only where the lexer says code.

## Decision

For a JavaScript-family file (`.js .mjs .cjs .jsx .ts .tsx .mts .cts`), `spec-verify`'s `test_definition_exists` masks with `_js_lex` instead of its own `mask_noncode`. It answers `None` — could-not-check, which it reports in its exit-4 class — when the name is not found among the registrations and occurs in the raw text past the lexer's stop (F-2). `adr-lint`'s `test_body` takes a `suffix`. For a JavaScript-family suffix, its BDD branch skips a match the lexer does not mark as code and bounds the body with `bdd_callback_body` over the lexer's masked view. When no match is in code but the name occurs past the lexer's stop, it returns `UNPROVEN_BODY`. The existence check turns that into advice naming the test UNPROVEN, rather than "not found". The can-fail check turns it into advice, rather than its silent `continue` (F-4). Every other suffix, and Go, reads exactly as before (F-6). This fails if any `adr-lint` verdict over `docs/adr` or any `spec-verify --spec` verdict over `docs/specs` changes other than as the spec lists; each task measures that before and after, and stops on a difference.

## Alternatives Considered

- **Leave the readers as they are.** Rejected: the lock and these gates disagree on the same file, which is the Codex review's finding 2.
- **Fall back to the old masker where the lexer stops.** Rejected by the owner (spec Grill Log row 2): two readings again, and a guess where the lexer refused one.
- **One new shared "find a JavaScript test" function for all three gates.** Rejected for now: the three ask different questions (registration, any BDD call, a lock's names) with different vocabularies, and the spec keeps each vocabulary. What they share is the lexical reading, which `_js_lex` already is.

## Component / Boundary Impact

None — internal to `plugin/bin/spec-verify` and `plugin/bin/adr-lint`, which already load `plugin/lib/record.py` (ADR-045).

## Wiring & Contract Changes

Inherited from docs/specs/2026-10-01-every-gate-reads-javascript-one-way.md §Contracts Touched; delta: none.

## Inter-task Contracts

None — T1 and T2 change different gates and share only ADR-078's existing `_js_lex`.

## Implementation

See `docs/adr/ADR-079-every-gate-reads-javascript-one-way/tasks/README.md`.

## Consequences

- **Positive:** for a JavaScript-family file, the lock, `spec-verify` and `adr-lint` agree on which tests exist and where each body ends.
- **Negative:** a test past a `/` the lexer cannot place is now UNPROVEN in these gates too, where it was found (sometimes wrongly) before.
- **Neutral:** `.mts` and `.cts` files are read by `spec-verify` for the first time.

## Out of Scope

Inherited from docs/specs/2026-10-01-every-gate-reads-javascript-one-way.md §Non-Goals; delta: none.

## Risks

Inherited from docs/specs/2026-10-01-every-gate-reads-javascript-one-way.md §Risks; delta: none.

## Rollback

Revert the commits. These gates keep no evidence of their own reading, so nothing recorded changes meaning.

## Follow-ups

- [ ] None — the Codex review's finding 2 is this record.
