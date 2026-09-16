# ADR-055: An escaped quote is still the name

**Status:** Accepted
**Date:** 2026-09-16
**Owner:** zy
**Spec:** `docs/specs/2026-09-16-an-escaped-quote-is-still-the-name.md`
**Cross-references:** ADR-005, ADR-050, ADR-052, ADR-054, `docs/BACKLOG.md` §209
**Governs:** `plugin/lib/record.py`, `tests/leftovers-after-adr053.test.mjs`, `tests/adr053-stress.mjs`

Class: every `it(` / `test(` name whose delimiter appears inside the name, escaped. Enumerated 2026-09-16 with `rg -n '_BDD_NAME|_iter_bdd_names|extract_test_body' plugin/lib/record.py` and `git ls-files -- plugin/lib/record.py tests/leftovers-after-adr053.test.mjs tests/adr053-stress.mjs`. Named members:

```
plugin/lib/record.py                 _BDD_NAME; _iter_bdd_names; extract_test_body BDD arm
tests/leftovers-after-adr053.test.mjs bind (appended; do not retarget locked bodies)
tests/adr053-stress.mjs              HAND_MUTANT restores [^'\n]+
```

Members left out: `describe(` (not a hashed test name); Go raw backticks and PHP `php=` regex spans (ADR-054); `tests/test-lock.test.mjs` / `tests/swift-expect.test.mjs` (do not edit); `TEST_HASH_REQUIRED_FROM` (stays 2026-09-13); quote-aware `PUBLISH_SUFFIX` (ADR-056).

**Enforced-by:** `tests/leftovers-after-adr053.test.mjs::escaped same-quote BDD names are discovered and extracted`, `tests/leftovers-after-adr053.test.mjs::interpolated BDD names stay undiscoverable`, `tests/test-lock.test.mjs::adr-verify --relock fills unproven the hasher can now see`, `tests/test-lock.test.mjs::adr-verify --replace-hashes without --relock is refused`
**Invalidates:** none — checked. Extends the hasher; does not reverse ADR-054 Go raw backticks or ADR-050 F-1.
**Served-path change:** `test('today\'s')` and Pest `it('today\'s')` become hasher-visible decoded names; interpolated `` `x${y}` `` / PHP `"$name"` stay UNPROVEN.

## Context

Inherited from the spec §Problem / §Goal. On 2.99.5, `_BDD_NAME` is quote-kind classes that stop at the first same quote, so `test('today\'s')` is never discovered and a Tests row for `today's` stays UNPROVEN. `extract_test_body` then searches `re.escape(decoded)` between matching quotes, which matches opposite-quote `test("today's")` (the control) and misses the escaped same-quote span.

Debt at authoring (`python3 plugin/bin/adr-debt docs/adr`): BACKLOG §209 is the accepted weaker T1–T4 `--replace-hashes` recovery and is pulled in. §206 (never-hashable Tests rows) is a different class and stays.

## Existing Primitives Audit

- `_iter_bdd_names` / `_BDD_NAME` — **replace the quote-kind walk.** Keep the retired regex so a leftover HAND_MUTANT can restore `[^'\n]+`. Live discovery is `_iter_bdd_calls`.
- `extract_test_body` BDD arm — **reshape.** Find the callback from the same span, not `re.escape(decoded)` against source bytes.
- `bdd_callback_body` — **reuse.** Still the body extractor after the name comma.
- ADR-052 `--relock` — **leave.** Hasher-visible unproven after this walk is `--relock` only. Do not `--replace-hashes` ADR-054 T1–T4.

## Decision

**A BDD name is the decoded JS/Pest string literal after `it(` / `test(`. Discovery and extraction share one walk. Interpolation is could-not-look. A hasher upgrade does not rewrite first-red.**

1. **T1.** Walk after `\b(?:it|test)\s*\(` with JS/Pest string-literal rules (PHP single-quote only `\\` / `\'`; not Go raw backticks; not PHP `php=` regex spans). Yield the decoded name. Extract the callback from that span. Interpolated JS `` `${` `` and PHP double-quoted unescaped `$` are not yielded. Opposite-quote `test("today's")` remains the control. `describe(` is not a member. Recovery of hasher-visible UNPROVEN is `python3 plugin/bin/adr-verify --relock`. T1 Covers F-4 so the spec union is closed; do not take first-red on `tests/test-lock.test.mjs`.

## Alternatives Considered

- **Fix `_BDD_NAME` only.** Rejected: extraction still searches decoded text between matching quotes (UC1 failure path b).
- **Bump `TEST_HASH_REQUIRED_FROM` so new names lock without `--relock`.** Rejected: ADR-050 F-1 / ADR-052; BACKLOG §209.
- **Teach `describe(` as a hashed test name.** Rejected: not in the class.
- **Hash interpolated templates by decoding a guessed name.** Rejected: ADR-005.

## Component / Boundary Impact

| Component | Ownership after change | Why it changes |
|-----------|------------------------|----------------|
| `record.py` hasher | Core lock | escaped same-quote walk + same-span extract |
| leftover tests / stress | repository gate | bind; HAND_MUTANT restores `[^'\n]+` |

None — no Module Map file in this repository; no architecture doc to update.

## Wiring & Contract Changes

Inherited from `docs/specs/2026-09-16-an-escaped-quote-is-still-the-name.md` §Contracts Touched; delta: none.

## Inter-task Contracts

None.

## Implementation

See `docs/adr/ADR-055-an-escaped-quote-is-still-the-name/tasks/README.md`.

## Consequences

- **Positive:** escaped same-quote BDD names become hashable instead of UNPROVEN.
- **Negative:** consumer maps that recorded UNPROVEN for those names still need `--relock`.
- **Neutral:** interpolated names stay undiscoverable; opposite-quote names still hash.

## Out of Scope

Inherited from the spec §Non-Goals; delta: none.

- Bump `TEST_HASH_REQUIRED_FROM` (permanent: boundary: ADR-050 F-1 / ADR-052)
- `--replace-hashes` on ADR-054 T1–T4 / rewrite committed first-red (permanent: boundary: BACKLOG §209)
- Edit `tests/test-lock.test.mjs` or `tests/swift-expect.test.mjs` (permanent: boundary: first-red locked)
- Rewrite ADR-054 Decision text (permanent: boundary: records are history)
- Teach `describe(` as a hashed test name (permanent: boundary: not in the class)
- Go raw backticks; PHP `php=` regex spans; full `\x` / `\u` name decoding (permanent: boundary: different hasher class / Non-Goal)
- Quote-aware `PUBLISH_SUFFIX` (permanent: boundary: ADR-056)
- Skipping never-hashable Tests rows (permanent: boundary: BACKLOG §206 is a different class)

## Risks

Inherited from the spec §Risks; delta: none.

## Rollback

Revert the `_iter_bdd_calls` walk and same-span extract. Existing Verification Logs and first-red maps are unchanged.

## Follow-ups
