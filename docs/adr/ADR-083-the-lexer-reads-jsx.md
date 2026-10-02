# ADR-083: The lexer reads JSX

**Status:** Accepted
**Date:** 2026-10-02
**Owner:** Zy
**Spec:** docs/specs/2026-10-02-the-lexer-reads-jsx.md
**Cross-references:** docs/adr/ADR-078-a-lock-reads-javascript-as-javascript.md, docs/adr/ADR-079-every-gate-reads-javascript-one-way.md
**Governs:** plugin/lib/record.py, plugin/bin/adr-lint, plugin/bin/spec-verify
**Enforced-by:** `tests/js-reading.test.mjs::a test past a JSX tag is found by both gates, and a never-written one is missing`
**Invalidates:** none — checked. ADR-078's hasher 2 stays as it reads (F-2, F-5); this record adds hasher 3 beside it. It retires 3.7.2's JSX stop-gap (BACKLOG §337), which no record decided.
**Served-path change:** `spec-verify` and `adr-lint` (shipped) read JSX in `.js .mjs .cjs .jsx .tsx` files, and the test lock (shipped) takes hasher 3 over a file whose reading JSX changes.

## Context

The spec's Problem and Goal are inherited (docs/specs/2026-10-02-the-lexer-reads-jsx.md). Decision-relevant deltas:

- **The stop-gap this retires.** 3.7.1/3.7.2 said a lexer stop at a JSX tag as advice, and fell back to a comment-aware raw reading (`js_raw_titles`) to tell missing from present. Two outside runs and a stand-in review shaped it (BACKLOG §337). The owner chose the lexer as the real fix, with the lock moving in the same record (2026-10-02).
- **The class.** Every site that decides from `_js_lex` or works around its JSX stop.
  - Enumerated 2026-10-02 with `git grep -n -E 'js_stop_at_jsx|js_raw_titles|_JS_RAW_TITLE|jsx_stopped|"advise"' -- plugin`, plus the hasher-2 sites from `git grep -n "hasher == 2" -- plugin/lib/record.py`.
  - The stop-gap: `js_stop_at_jsx`, `_JS_RAW_TITLE` and `js_raw_titles` (`record.py:1862-1925`); `jsx_stopped` and `unproven_test`'s JSX branch (`adr-lint:4653-4685`); spec-verify's JSX branch (`:327-334`) and its `"advise"` arm (`:802`).
  - The hasher-2 readings: `body_digest`, `extract_test_names`, `extract_test_body`, and `_file_lock_digests` via `snapshot_lock`. Also `_h2_in_code`, `_h2_js_digest_text`, and `js_reading` for the gates.
- **Locked tests pin hasher 2.** 842 locks sit on tests/test-lock.test.mjs, and three locked tests assert that a new lock says `check@2`. Hasher 3 for every new lock would move them. On a file with no JSX the two readings are identical, so hasher 3 is taken only where JSX changes the reading (F-4).

## Existing Primitives Audit

- **`_js_lex`** (`plugin/lib/record.py:1622`): extended with `jsx`. Its template-interpolation stack, which tracks brace depth inside `${…}`, becomes one context stack that also holds JSX elements. With `jsx` False, only template frames are ever pushed, so the reading is unchanged (F-2).
- **`_h2_slash_opens_regex`** (`record.py:1588`): already answers "is this an operand position", which is where an element may open.
- **`snapshot_lock` / `encode_lock` / `decode_lock` / `lock_hasher`** (`record.py:2820-2967`): already carry a hasher per lock (`check@N`, `LOCK_HASHERS`), so hasher 3 is one more value, not a new mechanism.
- **`js_reading`** (`record.py:1819`): the gates' one entry; it passes `jsx` from the suffix.

## Decision

- **The lexer.** `_js_lex(text, ts=False, jsx=False)`. With `jsx`, a `<` at an operand position followed by a name or `>` opens an element, read by a scanner that marks tags, attributes and text literal and `{…}` code (F-1, F-8). Elements nest and fragments are read. Anything it cannot read is a stop (F-7). `.tsx` generic arrows are not elements (F-3).
- **Suffixes.** `JSX_SUFFIXES = (".js", ".mjs", ".cjs", ".jsx", ".tsx")`, a subset of `JS_FAMILY_SUFFIXES`. `.ts .mts .cts` never read JSX (F-3).
- **The lock.**
  - `LOCK_HASHERS = (1, 2, 3)`.
  - Hasher 3 is hasher 2's reading with `jsx` for a JSX-capable file.
  - `snapshot_lock` with no hasher given takes 3 when some locked JavaScript-family file reads differently with JSX, and 2 otherwise (F-4).
  - A lock is read by the hasher that took it (F-5).
- **The gates.** `js_reading` reads with `jsx` from the suffix, so spec-verify and adr-lint read JSX (F-6). The 3.7.2 stop-gap is deleted: `js_stop_at_jsx`, `js_raw_titles`, `_JS_RAW_TITLE`, `jsx_stopped`, `unproven_test`'s JSX branch and its extra parameters, and spec-verify's JSX branch, `"advise"` arm and import. So are their tests and catalogue entries.

This fails if a test past `render(<B>x</B>)` in a `.tsx` file is not found: the bound test asserts it is, and that the lock bounds it.

## Alternatives Considered

- **Keep the stop-gap.** Rejected by the owner: the raw reading is weaker than the lexer (§337 residuals), and the lock still cannot bound a `.tsx` test.
- **Hasher 3 for every new lock.** Rejected: it would move locks that locked tests pin, for files whose reading does not change.
- **Gates only, the lock later.** Rejected by the owner (2026-10-02): the gates and the lock would disagree inside JSX files.

## Component / Boundary Impact

None — internal to `plugin/lib/record.py` and the two gates that load it (ADR-045).

## Wiring & Contract Changes

Inherited from docs/specs/2026-10-02-the-lexer-reads-jsx.md §Contracts Touched; delta: `JSX_SUFFIXES` in `plugin/lib/record.py`, and `unproven_test` back to its ADR-079 signature.

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `_js_lex(…, jsx=)` and `JSX_SUFFIXES` in `plugin/lib/record.py` | T1 | T2, T3 | No — new |
| hasher 3 (`check@3`) | T2 | T4 | No — new |

## Implementation

See `docs/adr/ADR-083-the-lexer-reads-jsx/tasks/README.md`.

## Consequences

- **Positive:** a React corpus's tests past JSX are found, bounded, hashed and judged, and a stale row there is caught by the lexer, not a raw fallback.
- **Negative:** a JSX construct the scanner cannot read stops it, where a raw reading might have guessed.
- **Neutral:** locks over JSX-free files are taken by hasher 2 as before.

## Out of Scope

Inherited from docs/specs/2026-10-02-the-lexer-reads-jsx.md §Non-Goals; delta: none.

## Risks

Inherited from docs/specs/2026-10-02-the-lexer-reads-jsx.md §Risks; delta: none.

## Rollback

Revert the commits. A hasher-3 lock recorded meanwhile then names a hasher the reverted reader does not know, which it reports as UNPROVEN (ADR-078 F-9), never as moved. Its task is relocked after the revert.

## Follow-ups

- [ ] Ask the react-spa and laravel-react-monorepo runners for a run with `--since` their 3.7.2 report: every "lexer stopped at a JSX tag" advice line gone, and no PASS → FAIL but rows they confirm are stale.
