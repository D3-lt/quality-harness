# ADR-079: Every gate reads JavaScript one way

**Status:** Accepted
**Date:** 2026-10-01
**Owner:** Zy
**Spec:** docs/specs/2026-10-01-every-gate-reads-javascript-one-way.md
**Cross-references:** docs/adr/ADR-078-a-lock-reads-javascript-as-javascript.md
**Governs:** plugin/bin/spec-verify, plugin/bin/adr-lint, plugin/lib/record.py
**Enforced-by:** `tests/js-reading.test.mjs::adr-lint reads a JavaScript test where its call is code, bounded as the lock bounds it`
**Invalidates:** none — checked. ADR-078 deferred these readers to BACKLOG §324. This record takes them, and changes no lock, no hasher and no recorded evidence.
**Served-path change:** `spec-verify` (shipped) and `adr-lint` (shipped) decide a JavaScript-family test's existence, body and ability to fail on ADR-078's `_js_lex`, and say UNPROVEN where it stops. `spec-verify` exits 4 there; `adr-lint` withholds `done`.

## Context

The spec's Problem and Goal are inherited (docs/specs/2026-10-01-every-gate-reads-javascript-one-way.md). Decision-relevant deltas:

- **The rework was reviewed again** (a cold Codex round, 2026-10-01): REQUEST CHANGES, with seven findings. The owner chose to fold all seven in and accept without a fourth review of the record; the implementation gets its own Codex round and outside corpus runs. The seven, each answered below:
  - an unbounded body had no defined answer;
  - a stub twin demanded "missing" in a stopped file;
  - a fourth `test_body` caller, the file-name shortcut and enforcement's consumer were unaccounted for;
  - blocking `done` ignored the moved lock's exceptions;
  - helper tests could pass without the shipped routing;
  - the fences discarded the runner's exit;
  - T4's control could not fail.
- **The first draft was parked on two reviews that agree** (BACKLOG §329): a cold Codex round and a second review the owner pasted. A read-only scout then mapped every JavaScript-reading site, and this record is rewritten from that map.
- **The class.** These are every site in `plugin/bin` and `plugin/lib` that decides whether a JavaScript test exists, where its body ends, or whether it can fail.
  - Enumerated 2026-10-01 with `git grep -n -E 'test_definition_exists|registered_test_names|js_title_exists|def test_body|test_body\(|JS_TITLE_CALL|code_only\(body' -- plugin/bin plugin/lib`, and the scout's reading of each match.
  - spec-verify: `test_definition_exists` (`spec-verify:334`) and its could-not-check plumbing (`:417`, `:442`, `:818-821`).
  - adr-lint: `js_title_exists` (`adr-lint:4576`) and the file-name shortcut in `check_tests_exist` (`:4688-4692`). Then `test_body` (`:4781`) and all four of its callers: enforcement (`:3772`), existence (`:4699`), the named test's can-fail body (`:5396`), and the same-file helper body (`:5408`). Then `resolve_enforcement`'s JavaScript arm (`:3771`, `:3801`) and its consumer `check_enforcement` (`:3840`), and the can-fail re-scan (`:5402`).
  - Left out, and why:
    - `arch-lint` reads identifier symbols only, so it never sees a test title.
    - `--collect`'s `vitest list` asks the runner itself, a different reader.
    - The `_legacy_digest` suffix tuple is ADR-078's, and it is frozen.
- **Measured, 2026-10-01:** none of this repository's 129 JavaScript-family test files stops before its end. So the UNPROVEN rule changes no verdict here, and this corpus does not exercise it either. The outside runs' `--diff` is the measure of how often it fires on a corpus we do not own (§18).
- **The baseline is frozen before any edit.** `plugin/` at `cd8f95f` gave 99 verdicts on 2026-10-01. T4's comparator rebuilds that copy from git, so the bar is reproducible rather than a scratch file. It first shows it can fail, with an asymmetric control, then compares the frozen copy and the candidate over one corpus.

## Existing Primitives Audit

- **`_js_lex`** (`plugin/lib/record.py:1622`) returns `(masked, kinds, stop, templates)`; it is reused unchanged. One new reader in `record.py` wraps it for these gates.
- **`bdd_callback_body(…, masked=)`** (`record.py:2565`) bounds a body on a given masked view; it is reused with the whole file's `masked`.
- **`_parse_bdd_string`** (`record.py:2045`) decodes a title as the lock does; it is reused, so the gates and the lock compare the same decoded title.
- **`registered_test_names`** (`spec-verify:295`) keeps its own vocabulary and now reads the lexer's masked view.

## Decision

`record.py` gains one JavaScript reader for the gates. It is used only for a file whose suffix is in `JS_FAMILY_SUFFIXES` (`.js .mjs .cjs .jsx .ts .tsx .mts .cts`), and that one set replaces each suffix list a JavaScript arm keeps. For a file and a title it answers:
- `found` with the call's offset, when a call head at a code offset carries that decoded title;
- `missing`, when none does and the lexer read the whole file;
- `unproven`, when none does and the lexer stopped before the end.

Applied to each gate:
- **`spec-verify`.** `test_definition_exists` masks a JavaScript-family file with `_js_lex`. It answers `None` for `unproven`, and `check_spec` gives `None` the exit-4 class, which it now names "could not check" beside "unrun".
- **adr-lint, the existence paths.** `js_test_body(text, name, suffix)` answers `found` with the body, `missing`, or `unproven`.
  - It bounds the body with `bdd_callback_body(…, masked=)` on the whole file's view.
  - A call found but whose body cannot be bounded is `unproven`, whether or not the lexer read the rest of the file. A complete body before a later stop is `found`.
  - It never falls back to the declaration, Ruby or last-resort branches for these files.
  - `js_title_exists`, the file-name shortcut and `resolve_enforcement`'s arm use the same lookup.
  - `check_enforcement` reports `unproven` distinctly from a pointer to nothing.
- **adr-lint, the callers of `test_body`.** Every caller that reads a JavaScript-family file branches to the JavaScript reader first; that includes the same-file helper lookup. `test_body` keeps its old contract, so no other language's caller can be handed `unproven`.
- **adr-lint, the can-fail check.** `js_body_can_fail` searches the whole file's masked view for `FAIL_CALLS`, over the body's span and the span of each same-file helper the body calls. So `${…}` is code and a regex literal is masked. It is one reading, not a second lex of a fragment.
- **What UNPROVEN does.** An `unproven` answer in either check is never "not found" and never silence.
  - It is a blocking finding on a `done` task and advice on a task not yet done.
  - It keeps a moved lock's exceptions: on a frozen archived record, and on a record below `strictFrom`, it is advice.

This fails if any JavaScript existence path still reads raw text: the second test binds a name that occurs only inside a string and asserts it is not found.

**Residuals, named rather than claimed.** The vocabularies stay different, a spec non-goal:
- `describe` is a test only to `adr-lint`;
- `test.skip` is not a test to the lock;
- a receiver such as `helper.test` is accepted only by the lock and by `adr-lint`;
- an interpolated title is refused by the lock;
- `test/* */(` is a test only to `spec-verify`.

So this record does not claim the three gates agree on which tests exist. It claims they agree on what is code, on a title's decoded value, on a body's bounds, and on where they cannot see.

## Alternatives Considered

- **Leave the readers as they are.** Rejected: the lock and these gates disagree on the same file, which was the Codex architecture review's finding 2.
- **UNPROVEN when the name occurs in the raw text past the stop.** This was the first draft, rejected on review. It misses an escaped title, matches a substring (`ghost` in `ghostly`), and misreads a head before the stop whose body runs past it. "Not found in a file not read to its end" needs no raw match.
- **Re-lex the extracted body for can-fail.** Rejected: that is a second reading, which can disagree with the first at the fragment's start.
- **A sentinel returned by `test_body`.** Rejected: each of its three callers tests its return value differently (`is None`, `is not None`, truthiness), and a non-JavaScript caller could be handed it.

## Component / Boundary Impact

None — internal to `plugin/bin/spec-verify`, `plugin/bin/adr-lint` and `plugin/lib/record.py`, which both gates already load (ADR-045).

## Wiring & Contract Changes

Inherited from docs/specs/2026-10-01-every-gate-reads-javascript-one-way.md §Contracts Touched; delta: `JS_FAMILY_SUFFIXES` and the new reader in `plugin/lib/record.py`.

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `js_test_lookup` and `JS_FAMILY_SUFFIXES` in `plugin/lib/record.py` | T1 | T2, T3 | No — new |
| `js_test_body` in `plugin/bin/adr-lint` | T2 | T3 | No — new |

## Implementation

See `docs/adr/ADR-079-every-gate-reads-javascript-one-way/tasks/README.md`.

## Consequences

- **Positive:** for a JavaScript-family file, the lock, `spec-verify` and `adr-lint` agree on what is code, on a title's decoded value, on where a body ends, and on where they cannot see.
- **Negative:** a test past a `/` the lexer cannot place is UNPROVEN in these gates too, and withholds `done`, where before it was found, sometimes wrongly.
- **Neutral:** `.mts` and `.cts` files are read by `spec-verify` and by `adr-lint`'s enforcement arm for the first time.

## Out of Scope

Inherited from docs/specs/2026-10-01-every-gate-reads-javascript-one-way.md §Non-Goals; delta:

- Unifying the vocabularies listed under Residuals (permanent: boundary: a different decision, which the spec's non-goals freeze)

## Risks

Inherited from docs/specs/2026-10-01-every-gate-reads-javascript-one-way.md §Risks; delta: none.

## Rollback

Revert the commits. These gates keep no evidence of their own reading, so nothing recorded changes meaning.

## Follow-ups

- [ ] Read the outside runs' `--diff` at the release candidate for any test that becomes UNPROVEN, and name each one in the release notes.
