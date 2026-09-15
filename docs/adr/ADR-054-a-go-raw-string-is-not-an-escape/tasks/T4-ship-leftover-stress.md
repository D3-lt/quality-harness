# Task ADR-054-T4: Ship leftover stress with spec-oracle pools

**Depends-on:** T3
**Covers:** F-4, UC4-S1, UC4-S2
**Estimated scope:** M
**Owner:** zy
**Produces:** none
**Consumes:** `go=True` raw backticks (T1), Swift-only `#expect` keep (T2), wrapper-arg `PUBLISH_SUFFIX` (T3)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the leftover stress oracle`, `the retired mutant FROM`

## Goal

A shipped stress driver (oracle from this spec and ADR-053 T1, not from current code) has source-enumerated pools that can generate F-1, F-2, and F-3 members. Unmutated it is green; hand mutants against those members go red; a non-parsing mutant is INCONCLUSIVE. The 2026-09-14 untracked `tests/adr053-stress.mjs` is not the suite.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/adr053-stress.mjs` | add | rewrite or replace the untracked draft; leftover-class pools and mutants only; header names the rg/commands that enumerated pools |
| `tests/leftovers-after-adr053.test.mjs` | edit | pool-audit plus spawn of unmutated run and leftover-class mutants |

## Ordered Steps

1. [S1] Confirm the leftover pool-audit and spawn tests are red against the 2026-09-14 draft. [proof: acceptance]
2. [S2] Rewrite the driver. Oracle from this spec and ADR-053 T1 Decision, not from `PUBLISH_SUFFIX` or the quote loop. Header names the commands that enumerated wrappers, keep names, and the Go raw-`\` member. Pools can generate wrapper-with-args (`sudo -n`), `command -v` as non-invocation, Go raw `\`, and PHP vs Swift `#expect`. Do not ship ADR-053 T2–T4 campaign mutants as this suite. [proof: mutation]
3. [S3] Leftover tests spawn the driver: unmutated run exits 0 at a cheap iteration count; leftover-class hand mutants (re-enable hasher `\`-escape inside Go backticks, drop wrapper-arg stripping, keep `#expect` on PHP) are killed; a mutant that does not parse is INCONCLUSIVE. Mutant `--from` must not still name `[\s\S]*$`. [proof: acceptance]

## Acceptance

```bash
node --test --test-name-pattern 'unmutated leftover stress is green and leftover pools are generable' tests/leftovers-after-adr053.test.mjs && node --test --test-name-pattern "a mutant that restores today's holes survives only if the suite is blind" tests/leftovers-after-adr053.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `unmutated leftover stress is green and leftover pools are generable` | `tests/leftovers-after-adr053.test.mjs` | pools include leftover members; unmutated spawn exits 0 | F-4, UC4-S1 | S1, S2, S3 |
| `a mutant that restores today's holes survives only if the suite is blind` | `tests/leftovers-after-adr053.test.mjs` | leftover-class HAND_MUTANTS; retired FROM absent; mutant spawn killed | F-4, UC4-S2 | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `tests/adr053-stress.mjs` after rewrite |
| 2 — something selects it | leftovers tests spawn the driver |
| 3 — the caller can discover it | header replay env (`QH_ADR053_STRESS_*` or replacement names) |
| 4 — it is used | unmutated green then mutants |

## Mutation Log

## Invariants

- Oracle is not a transcription of current `PUBLISH_SUFFIX` / the quote loop.
- Default iterations stay cheap for CI; a deeper run is env-documented.
- The 2026-09-14 draft is not committed unchanged.
- Leftover-class mutants only. Do not ship ADR-053 T2–T4 campaign arms as this suite.
- Tests do not spawn `git` in the real repository.

## Risks

- Example in the suite is today's gap and goes red when the gap is fixed (stress-testing v6). Mitigation: pools generate the class; mutant FROM is the retired suffix, not the live product.

## Stop Condition

Pools still omit `sudo -n` / Go raw `\` / PHP `#expect`, or a hand mutant survives, or unmutated is non-zero with no baseline.

## Out of Scope

- Implementing F-1 / F-2 / F-3 (those are T1–T3; this task consumes them)

## Verification Log
