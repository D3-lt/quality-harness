# ADR-056: A quoted separator is not a joiner

**Status:** Accepted
**Date:** 2026-09-16
**Owner:** zy
**Spec:** `docs/specs/2026-09-16-a-quoted-separator-is-not-a-joiner.md`
**Cross-references:** ADR-053, ADR-054, `docs/BACKLOG.md` §209
**Governs:** `plugin/scripts/lifecycle.mjs`, `tests/leftovers-after-adr053.test.mjs`

Class: every trailing `git commit` / `git push` whose operands hold quoted `|` / `;` / `||` / `&&`, after a recognised check joined by unquoted `&&` or a newline. Enumerated 2026-09-16 with `rg -n 'PUBLISH_SUFFIX|publishPrecededByValidation' plugin/scripts/lifecycle.mjs` and `git ls-files -- plugin/scripts/lifecycle.mjs tests/leftovers-after-adr053.test.mjs tests/adr053-stress.mjs`. Named members:

```
plugin/scripts/lifecycle.mjs         PUBLISH_SUFFIX / publish peel; publishPrecededByValidation
tests/leftovers-after-adr053.test.mjs bind (appended; do not retarget locked bodies)
tests/adr053-stress.mjs              quoted-`;` pool member; HAND_MUTANT restores [^|;\n]*
```

Members left out: taking `shellSegments` last piece (operators would vanish); flipping `isValidationCommand` for the whole compound; `nice` / `nohup` / `stdbuf`; `$(…)` / backticks as command substitution; escaped same-quote BDD names (ADR-055); `TEST_HASH_REQUIRED_FROM`.

**Enforced-by:** `tests/leftovers-after-adr053.test.mjs::quoted semicolon and pipe in a git operand still strip`, `tests/leftovers-after-adr053.test.mjs::command -v is not a publish; loud joiners still advise`, `tests/leftovers-after-adr053.test.mjs::sudo -n after a check still strips`
**Invalidates:** none — checked. Extends ADR-054 T3 (quoted operands). Does not reverse F-3 loud joiners or wrapper `[^\s|;]+`.
**Served-path change:** `pnpm check && git commit -m "x;y"` is silent PreToolUse, not extra advice.

## Context

Inherited from the spec §Problem / §Goal. On 2.99.5, `PUBLISH_SUFFIX` is quote-blind (`[^|;\n]*`), so `git commit -m "x;y"` stops at `;` and a recognised check joined to that publish stays loud (fail closed). `isGitPublishCommand` already uses `shellSegments`, which does not split on quoted `;`. The hole is only the stripper.

Debt at authoring: BACKLOG §209 is accepted weaker lock recovery and is pulled in. ADR-054 named quote-aware suffix as a leftover; this record is that leftover.

## Existing Primitives Audit

- `publishPrecededByValidation` / `PUBLISH_SUFFIX` — **reshape the peel.** Keep wrapper words and `[^\s|;]+` operands. Last unquoted `&&` or newline is the only silent joiner.
- `shellSegments` — **do not take the last piece.** It drops the operator, so `&&` vs `||` vs `;` become indistinguishable (ADR-054 fail-open just closed). Reuse its quote/escape state machine.
- ADR-054 F-3 loud joiners / attached `FOO=bar||` — **leave.** Unquoted `||` / `;` / `|` still advise.

## Decision

**A silent joiner is an unquoted `&&` or newline. Quoted bytes of `|` `;` `&` are operand content. Unquoted loud joiners still advise.**

1. **T1.** Peel a trailing publish with quote/escape state. Wrapper words and `[^\s|;]+` stay. Quoted `|` / `;` / `||` / `&&` in a git operand do not stop the peel. Unquoted `||` / `;` / `|` and attached `FOO=bar||` stay false. `env FOO=bar git push` still strips. Do not flip the whole compound to `validation`. T1 Covers F-3 so the spec union is closed; do not take first-red on `tests/test-lock.test.mjs`.

## Alternatives Considered

- **Take `shellSegments` last piece as the suffix.** Rejected: operators vanish; `||` would strip like `&&`.
- **Keep `[^|;\n]*` and tell users not to put `;` in `-m`.** Rejected: fail closed on a quoted operand is extra advice the engineer did not earn.
- **Teach `isValidationCommand` the whole `check && git commit` compound.** Rejected: ADR-053 T1.

## Component / Boundary Impact

| Component | Ownership after change | Why it changes |
|-----------|------------------------|----------------|
| `lifecycle.mjs` PreToolUse | Session advise | quote-aware trailing publish peel |
| leftover tests / stress | repository gate | quoted-`;` member; HAND_MUTANT restores `[^|;\n]*` |

None — no Module Map file in this repository; no architecture doc to update.

## Wiring & Contract Changes

Inherited from `docs/specs/2026-09-16-a-quoted-separator-is-not-a-joiner.md` §Contracts Touched; delta: none.

## Inter-task Contracts

None.

## Implementation

See `docs/adr/ADR-056-a-quoted-separator-is-not-a-joiner/tasks/README.md`.

## Consequences

- **Positive:** quoted separators in `-m` no longer keep a recognised check+commit loud.
- **Negative:** the peel is no longer a single regex; wrapper HAND_MUTANTS target `PUBLISH_WRAPPER`.
- **Neutral:** unquoted `||` / `;` / `|` stay loud; wrapper args stay.

## Out of Scope

Inherited from the spec §Non-Goals; delta: none.

- Full POSIX; `$(…)`; backticks as command substitution; `nice` / `nohup` / `stdbuf` (permanent: boundary: not this class)
- Teaching `isValidationCommand` the whole `check && git commit` compound (permanent: boundary: ADR-053 T1)
- Taking `shellSegments` last piece as the suffix (permanent: boundary: operators would vanish)
- Bump `TEST_HASH_REQUIRED_FROM`; `--replace-hashes` on ADR-054 T1–T4 (permanent: boundary: BACKLOG §209)
- Edit `tests/test-lock.test.mjs` or `tests/swift-expect.test.mjs` (permanent: boundary: first-red locked)
- Escaped same-quote BDD names (permanent: boundary: ADR-055)
- Skipping never-hashable Tests rows (permanent: boundary: BACKLOG §206 is a different class)

## Risks

Inherited from the spec §Risks; delta: none.

## Rollback

Revert the quote-aware peel to quote-blind `[^|;\n]*`. Existing Verification Logs and first-red maps are unchanged.

## Follow-ups
