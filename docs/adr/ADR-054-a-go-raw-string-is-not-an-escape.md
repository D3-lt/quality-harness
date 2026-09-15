# ADR-054: A Go raw string is not an escape

**Status:** Accepted
**Date:** 2026-09-15
**Owner:** zy
**Spec:** `docs/specs/2026-09-15-a-go-raw-string-is-not-an-escape.md`
**Cross-references:** ADR-050, ADR-052, ADR-053, `docs/BACKLOG.md` §208, inbox `c69249d9df8ba9d196fde7346277156668d87b8c5dc4194078c6445f42c76078`
**Governs:** `plugin/lib/record.py`, `plugin/bin/adr-lint`, `plugin/scripts/lifecycle.mjs`, `tests/leftovers-after-adr053.test.mjs`, `tests/adr053-stress.mjs`

Class: every hasher quote rule that C-escapes `\` inside a Go backtick string; every `#expect` / `#require` keep that is not keyed on Swift; every T1 wrapper that drops flags or assignments before `git commit` / `git push`; and the leftover stress driver whose pools cannot generate those members. Enumerated 2026-09-15 with `rg -n "_mask_lock_noncode|extract_test_body" plugin/lib/record.py`, `rg -n 'for name in \\("expect", "require"\\)|hash_comments=True' plugin/bin/adr-lint`, `rg -n "PUBLISH_SUFFIX" plugin/scripts/lifecycle.mjs`, and `git ls-files -- plugin/lib/record.py plugin/bin/adr-lint plugin/scripts/lifecycle.mjs tests/swift-expect.test.mjs tests/test-lock.test.mjs` plus `git ls-files --others --exclude-standard -- tests/leftovers-after-adr053.test.mjs tests/adr053-stress.mjs docs/specs/2026-09-15-a-go-raw-string-is-not-an-escape.md`. Named members:

```
plugin/lib/record.py                 _mask_lock_noncode quote loop; extract_test_body(..., go=True)
plugin/bin/adr-lint                  scan_code_only keep; code_only; check_tests_can_fail
plugin/scripts/lifecycle.mjs         PUBLISH_SUFFIX; publishPrecededByValidation
tests/leftovers-after-adr053.test.mjs bind (untracked at authoring)
tests/adr053-stress.mjs              untracked draft; T4 rewrites, does not commit as-is
```

Members left out: `tests/swift-expect.test.mjs` body (first-red locked; T2 keys keep on `.swift` inside `check_tests_can_fail`); `tests/test-lock.test.mjs` (F-5 already implemented; do not edit); `plugin/bin/arch-lint` `scan_code_only` (no `#expect` keep; spec Non-Goal); `nice` / `nohup` / `stdbuf` (not in T1's measured five).

**Enforced-by:** `tests/leftovers-after-adr053.test.mjs::a Go raw string ending in backslash still hashes later tests`, `tests/leftovers-after-adr053.test.mjs::a PHP #expect comment is not a fail word`, `tests/leftovers-after-adr053.test.mjs::sudo -n after a check still strips`, `tests/leftovers-after-adr053.test.mjs::unmutated leftover stress is green and leftover pools are generable`, `tests/test-lock.test.mjs::adr-verify --replace-hashes without --relock is refused`
**Invalidates:** none — checked. Extends ADR-053 T1 (wrapper *arguments*) and T5 (Swift-only keep). Does not reverse ADR-050 F-1 or ADR-052 `--relock`. Does not flip whole-compound `isValidationCommand`.
**Served-path change:** a `.go` Tests lock hashes through a raw backtick ending in `\`; a PHP `#expect` comment is not a fail word; `sudo -n git commit` after a recognised check is silent; a shipped leftover stress driver proves the class.

## Context

Inherited from the spec §Problem / §Goal. Four leftovers after ADR-053 still fail open on 2.99.4 (measured this tree, 2026-09-15): Go raw `\` never closes (`extract_test_body` bodies `None`); `code_only` keeps `#expect` for every `hash_comments` language; T1 wrappers are bare words; `tests/adr053-stress.mjs` is an untracked draft whose mutant `--from` still names `[\s\S]*$`.

Debt at authoring (`python3 plugin/bin/adr-debt docs/adr`): BACKLOG §208 is this record and is pulled in. ADR-053's deferred §206 (never-hashable Tests rows) is a different class and stays. Other open follow-ups are a different class and stay.

## Existing Primitives Audit

- `_mask_lock_noncode(..., rust_raw=True, swift=True)` — **reuse the flag pattern.** Thread `go=True` so backticks are raw. Do not change the default quote loop; JS templates without `go=True` still C-escape.
- `extract_test_body(..., go=True)` — **reshape.** It already selects Go discovery but still calls `_mask_lock_noncode(text)` with no flag (`record.py:1515`).
- `scan_code_only` `#expect` / `#require` keep — **reshape.** Keep only when `check_tests_can_fail` is stripping a `.swift` body. Do not edit `tests/swift-expect.test.mjs`.
- `PUBLISH_SUFFIX` — **reshape.** Wrapper words stay `command|env|sudo|exec|time`. Consume flags/assignments that still invoke `git commit` / `git push`. `command -v` is not an invocation. `[^|;\n]*$` stays (Codex P1).
- ADR-052 `--relock` — **leave.** F-5 is already implemented; T1 must not `--replace-hashes` a committed map.

## Decision

**Go backticks are raw when hashing `.go`. `#expect` / `#require` stay code only for Swift. T1 wrappers keep arguments that still invoke git. A shipped stress driver proves that class. A hasher upgrade does not rewrite first-red.**

1. **T1.** `_mask_lock_noncode` under `extract_test_body(..., go=True)` treats a backtick string as raw: `\` is content; the next backtick closes. A later comment backtick is not a closer. Interpreted Go quotes still C-escape. Recovery of a previously UNPROVEN Go body is `python3 plugin/bin/adr-verify --relock`, not a rewritten first-red row. T1 Covers F-5 so the spec union is closed; those tests stay green and are not this task's first-red.
2. **T2.** For a `.swift` Tests file, `#expect` / `#require` survive `code_only` on every strip `test_body` uses, not only the second `code_only` in `check_tests_can_fail`. On other `hash_comments` languages they are comments. An empty Swift body still blocks. `#[` still does not start a hash comment.
3. **T3.** After a recognised check, `&&` / newline plus T1 wrapper words and those words' flags/assignments that still invoke `git commit` / `git push` strip. `command -v git commit` advises. `nice` / `nohup` / `stdbuf` stay out. `||` `;` `|` still advise. The whole compound is not `validation`.
4. **T4.** Ship a leftover-class stress driver whose oracle is this spec and ADR-053 T1, not current code. Pools are source-enumerated and can generate F-1, F-2, and F-3 members. Leftover tests spawn the driver: unmutated green; leftover-class hand mutants red; non-parse INCONCLUSIVE. Do not commit the 2026-09-14 draft as-is. Do not ship ADR-053 T2–T4 campaign mutants as this suite.

## Alternatives Considered

- **Change the shared quote loop so no language C-escapes backticks.** Rejected: JS `` `dir\`` `` would stop being an escape (UC1-S2).
- **Keep `#expect` globally and teach FAIL_CALLS a PHP exception.** Rejected: the stripper would still leave the token; T5 Decision is "For Swift".
- **Widen the wrapper word list.** Rejected: T1 measured five words; `nice` / `nohup` / `stdbuf` have no task.
- **Commit the untracked stress file unchanged.** Rejected: oracle copies bare wrappers; mutant `--from` is the retired suffix (stress-testing v6).
- **Rewrite consumer first-red hashes as a product workaround.** Rejected: ADR-050 F-1 / ADR-052; inbox `c69249d9…` workaround is not this plugin.
- **Give F-5 its own TDD-red task.** Rejected: `--relock` is already implemented (ADR-052). T1 Covers F-5 so the spec union is closed; the fence does not run those tests and must not re-take their first-red.

## Component / Boundary Impact

| Component | Ownership after change | Why it changes |
|-----------|------------------------|----------------|
| `record.py` hasher | Core lock | T1 Go raw backticks |
| `adr-lint` `code_only` | Core | T2 Swift-only keep |
| `lifecycle.mjs` PreToolUse | Session advise | T3 wrapper args |
| leftover stress under `tests/` | repository gate | T4 |

None — no Module Map file in this repository; no architecture doc to update.

## Wiring & Contract Changes

Inherited from `docs/specs/2026-09-15-a-go-raw-string-is-not-an-escape.md` §Contracts Touched; delta: none.

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `go=True` raw backticks | T1 | T4 | No — hasher flag |
| Swift-only `#expect` keep | T2 | T4 | No — suffix-keyed |
| wrapper-arg `PUBLISH_SUFFIX` | T3 | T4 | No — PreToolUse only |

## Implementation

See `docs/adr/ADR-054-a-go-raw-string-is-not-an-escape/tasks/README.md`.

## Consequences

- **Positive:** Go Tests rows, PHP comment bodies, and wrapped `git commit` after a check stop being false findings; the leftover class has a driver.
- **Negative:** a hasher upgrade still needs `--relock` on consumer maps that recorded UNPROVEN.
- **Neutral:** JS templates, Swift `#expect`-only, and bare `sudo git commit` stay as they are.

## Out of Scope

Inherited from the spec §Non-Goals; delta: none.

- Flip `isValidationCommand` for the whole `check && git commit` compound (permanent: boundary: ADR-053 T1)
- Add `nice` / `nohup` / `stdbuf` to the wrapper list (permanent: boundary: not in T1's measured five)
- Teach `isValidationCommand('mrw write --check')` as a T1 prefix (permanent: boundary: ADR-053 T2)
- Bump `TEST_HASH_REQUIRED_FROM` or re-hash first-red without `--relock` (permanent: boundary: ADR-050 F-1 / ADR-052)
- Enable JS `_js_regex_span_end` on `php=True` (permanent: boundary: ADR-052)
- Quote-aware `PUBLISH_SUFFIX` (permanent: boundary: named leftover, not this class)
- `arch-lint`'s `scan_code_only` (permanent: boundary: different gate)
- Committing the 2026-09-14 untracked stress file unchanged (permanent: boundary: T4 rewrites it)
- Skipping never-hashable Tests rows (deferred: docs/BACKLOG.md §206)

## Risks

Inherited from the spec §Risks; delta: none.

## Rollback

Revert the `go=True` raw-backtick flag, the Swift-only keep, the wrapper-arg suffix, and the shipped stress driver. Existing Verification Logs and first-red maps are unchanged.

## Follow-ups
