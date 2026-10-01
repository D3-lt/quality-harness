# ADR-078: A lock reads JavaScript as JavaScript, and says which reading took it

**Status:** Accepted
**Date:** 2026-10-01
**Owner:** Zy
**Spec:** docs/specs/2026-10-01-a-lock-reads-javascript-as-javascript.md
**Cross-references:** docs/adr/ADR-050-a-locked-test-body-is-not-rewritten.md, docs/adr/ADR-052-an-explicit-relock-is-not-a-later-red.md, docs/adr/ADR-055-an-escaped-quote-is-still-the-name.md
**Governs:** plugin/lib/record.py, plugin/bin/adr-verify, plugin/bin/adr-lint, plugin/bin/adr-next
**Enforced-by:** `tests/test-lock.test.mjs::a lock taken before the lexer is read as it was taken`
**Invalidates:** none — checked. `adr-context` over `plugin/lib/record.py`, `plugin/bin/adr-verify` and `plugin/bin/adr-lint` (2026-10-01) names ADR-050, ADR-052, ADR-054 and ADR-055 for the lock and no superseded or withdrawn record about it. This record keeps every recorded lock's meaning (F-1), so none of their tasks changes; ADR-055's "interpolated BDD names stay undiscoverable" is about a NAME, and is untouched.
**Served-path change:** `adr-verify` (shipped) takes every new test lock with hasher 2, which names a JavaScript-family test only where its call is code and bounds and digests its body with a lexer that knows regex literals and template interpolation; `adr-lint` and `adr-next` compare each recorded lock under the hasher that took it, and an older install refuses a hasher-2 lock as unreadable.

## Context

The spec's Problem and Goal are inherited (docs/specs/2026-10-01-a-lock-reads-javascript-as-javascript.md). Decision-relevant deltas:

- BACKLOG §324 item 1 filed the defect on 2026-10-01; the owner chose "Spec + ADR, then execute", and the shape of the fix (a lexer, and a lock that records its hasher) the same day.
- Measured 2026-10-01 against this repository's `tests/`: hasher 1's name discovery consults only line comments, its body masker drops 14 real tests after `c => /^[`/.]/` and a nested template, and it hashes a PREFIX for a test holding `` `${ cond ? `x ${y} }` : '' }` `` — the wrong span, not a refusal, which ADR-005 forbids (spec Problem).
- **A cold Codex review of the first draft (2026-10-01, gpt-6-astra at xhigh) asked for changes, with seven findings, each checked against source.** The digest's own comment stripper (`body_digest`, `plugin/lib/record.py:987`) was outside hasher 2, so two bodies differing after `${true ? `//one` : ''}` hashed alike (F-10). F-5's token rule misread `{} / …`, `obj.in / …`, a regex after `break outer`, and TypeScript `f<number> / 3`, and contradicted T1 (F-5 and F-7 amended). An older install read a hasher-2 lock as hasher 1 and passed a vanished test, so the spec's "fails closed" was false (F-11). T2 and T3 overlapped on the relock's comparison. The migration stubs generated their "old" lock with the code under test, and the lexer stubs left wrong implementations unchallenged (a frozen fixture and stronger stubs now). `adr-next` discards advice, so the advice is `adr-lint`'s alone (F-2). The owner decided the four that changed facts (spec Grill Log rows 10-13).
- The class — every reader of a JavaScript test file's names, bodies or digests under `plugin/` — enumerated 2026-10-01 with `git grep -n -E '_iter_bdd_calls\(|_iter_bdd_names\(|js=(True|js)|_matching_js_brace\(|_js_like_in_code\(|bdd_callback_body\(|body_digest\(' -- plugin`. The lock (`snapshot_lock` and what it calls in `plugin/lib/record.py`) is this record's. Two other readers have the same defect and are deferred (Out of Scope): `plugin/bin/spec-verify:636` (does a bound test exist) and `plugin/bin/adr-lint:4900` (can a test fail). The Go readers (`_js_like_in_code`) share the state machine and are left alone.
- Two earlier changes to the JavaScript reading (BACKLOG §212, §305) kept old locks green with `_legacy_digest`, a second reading tried when the first disagrees. That repairs a lock after the fact and cannot say which reading took it; this record writes it down instead (spec Grill Log rows 1-2).

## Existing Primitives Audit

- **`_mask_lock_noncode(js=True)`, `starts_regex`, `js_regex_end`** (`plugin/lib/record.py:1434-1618`): the operand tables are the base of F-5; the masker itself stays as hasher 1 reads it.
- **`_iter_bdd_calls`, `bdd_callback_body`, `body_digest`, `_strip_comments_keep_strings`** (`plugin/lib/record.py:1777`, `:2213`, `:987`, `:1012`): kept byte-identical for hasher 1; hasher 2 filters heads through the lexer's code positions, bounds bodies on its masked view, and strips comments and collapses whitespace from its spans.
- **`encode_lock` / `decode_lock`** (`plugin/lib/record.py:2367-2408`): reshaped — a hasher-2 lock writes its check record as `check@2`. `decode_lock` in 3.3.0 returns nothing for a payload with no `check` record, and every 3.3.0 gate already refuses that as a lock it could not read (`tests/test-lock.test.mjs::a lock map with no check record is unreadable, not an empty lock`), which is what makes F-11 true without touching an installed reader.
- **`_legacy_digest`** (`plugin/lib/record.py:2294`): kept, and it belongs to hasher 1; a hasher-2 lock never consults it.
- **`record_relock` and `moved_lock_bodies`** (`plugin/bin/adr-verify:2654`, `plugin/lib/record.py:2435`): reshaped by T3 — the comparison snapshot is taken under the recorded hasher, the appended lock under hasher 2.

## Decision

`plugin/lib/record.py` gains a JavaScript lexer: one memoised scan of a text that marks each position as code, string, template text, template interpolation, regex literal or comment, decides each `/` by F-5's rule, and reports the first position it cannot establish — a literal or comment that never ends, or a `/` after `}` or after a lone `>` in a TypeScript-family file (F-7). Hasher 2 is hasher 1 with that lexer in three places, for JavaScript-family files only (F-3: `.js .mjs .cjs .jsx .ts .tsx .mts .cts`): a `test(`/`it(` head counts only where the lexer says code (F-4); a body is bounded on the lexer's masked view, where every literal is blanked and an interpolation is code (F-6); and a body's digest strips comments and collapses whitespace from the lexer's spans (F-10). A test whose head follows the first unestablished position, or whose body reaches it, is UNPROVEN (F-7). `extract_test_names`, `extract_test_body` and `body_digest` take `hasher=1` by default, so every existing caller reads exactly as before; `snapshot_lock` takes `hasher=2` by default. `encode_lock` writes a hasher-1 lock byte for byte as today and a hasher-2 lock with its check record named `check@2`, which a 3.3.0 reader cannot read and so refuses (F-11). `decode_lock` reads either, and a hasher it does not know makes the lock UNPROVEN (F-9). `lock_findings` and `lock_blocks_done` compare under the recorded hasher (F-1), and for a hasher-1 lock whose JavaScript files hasher 2 reads differently, `lock_findings` adds one advice line naming `adr-verify --relock`, which `adr-lint` prints (F-2). `--relock` compares under the recorded hasher and appends a hasher-2 lock (F-8). This fails if any recorded lock in this corpus changes verdict: `tests/corpus-lint.test.mjs` runs `adr-lint` over every active record and is in T2's fence, and the hasher-1 encoding is pinned to bytes frozen on 2026-10-01.

## Alternatives Considered

- **Fix the reading in place, no version (the attempt of 2026-10-01).** Rejected: 12 active records failed their own lint, because their locks named tests the new reading did not see (BACKLOG §324).
- **Another `_legacy_digest` reading.** Rejected: it repairs a mismatch by guessing which reading took the lock, and a third legacy reading multiplies the guesses; the owner chose to record the hasher (spec Grill Log row 1).
- **A separate `hasher` line beside an unchanged `check` record.** Rejected after the Codex review: a 3.3.0 reader ignores the line and compares under hasher 1, which passed a test that had vanished (spec Grill Log row 10).
- **Relock every record as part of this change.** Rejected: records are history (CLAUDE.md §10); a relock is a maintainer's appended choice, and F-2 names which records it would change.
- **A full JavaScript parser.** Rejected: a parser is a dependency or a large component, and the lock needs only where literals begin and end; what needs a parser is UNPROVEN (spec Non-Goals).

## Component / Boundary Impact

None — internal to `plugin/lib/record.py`, the one record grammar every gate loads (ADR-045), plus `record_relock` in `plugin/bin/adr-verify`.

## Wiring & Contract Changes

Inherited from docs/specs/2026-10-01-a-lock-reads-javascript-as-javascript.md §Contracts Touched; delta: none.

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `extract_test_names(…, hasher=)`, `extract_test_body(…, hasher=)`, `body_digest(…, hasher=)` | T1 | T2 | No — default 1 is today's reading |
| `snapshot_lock(…, hasher=)`, the `check@2` record, `decode_lock(…)["hasher"]` | T2 | T3 | Yes for installs older than T2, by design: they cannot read a hasher-2 lock (F-11) |

## Implementation

See `docs/adr/ADR-078-a-lock-reads-javascript-as-javascript/tasks/README.md`.

## Consequences

- **Positive:** a new lock names the tests JavaScript runs, hashes each one's own body, and moves when a change hasher 1 could not see is made.
- **Positive:** every recorded lock keeps its verdict; the change is visible as advice, never as a block.
- **Negative:** an install older than this change refuses done on any task whose lock hasher 2 took, until it is upgraded.
- **Negative:** `adr-lint` reads a hasher-1 lock's JavaScript files twice to decide the advice; the lexer is memoised per text like the masker.
- **Neutral:** after T2, `adr-lint` over this corpus advises on the records whose locks hasher 2 reads differently, until each is relocked.

## Out of Scope

Inherited from docs/specs/2026-10-01-a-lock-reads-javascript-as-javascript.md §Non-Goals; delta:

- `spec-verify`'s check that a bound JavaScript test exists (`plugin/bin/spec-verify:636`) reads with hasher 1's masker (deferred: docs/BACKLOG.md §324)
- `adr-lint`'s can-fail check on a JavaScript test body (`plugin/bin/adr-lint:4900`) reads with hasher 1's masker (deferred: docs/BACKLOG.md §324)
- Relocking this corpus's records whose locks hasher 2 reads differently (deferred: docs/BACKLOG.md §324)

## Risks

Inherited from docs/specs/2026-10-01-a-lock-reads-javascript-as-javascript.md §Risks; delta:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The double reading makes `adr-lint` over a large corpus slow enough to be killed (it was, at 17 s, in 1827ac0) | Med | Med | The lexer is memoised per text; T2's Stop Condition measures the corpus lint before and after |
| An existing test pins a lock payload byte for byte and moves when a hasher-2 lock is taken by default | Med | Low | `scripts/test-locks.py` before each edit; a locked test stays byte-identical and a new test goes beside it |
| Between T2 and T3 a relock compares a hasher-1 lock with a hasher-2 reading and refuses | High | Low | T3 lands on the same branch before any release; T3's red run records it |

## Rollback

Revert the commits. A reverted reader cannot read a lock hasher 2 took in the meantime (F-11), so each such task refuses done as could-not-be-read until a new lock is taken for it under the reverted reading — a false refusal on those tasks, never a false pass.

## Follow-ups

- [ ] Relock the records `adr-lint` advises on once T2 lands, each as its maintainer's choice.
