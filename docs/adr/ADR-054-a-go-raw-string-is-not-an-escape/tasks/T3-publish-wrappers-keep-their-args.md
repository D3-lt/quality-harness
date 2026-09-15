# Task ADR-054-T3: T1 wrappers keep arguments that still invoke git

**Depends-on:** T2
**Covers:** F-3, UC3-S1, UC3-S2
**Estimated scope:** S
**Owner:** zy
**Produces:** wrapper-arg `PUBLISH_SUFFIX`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the wrapper-arg publish suffix`, `the command -v non-invocation`

## Goal

After a recognised check, `&&` / newline plus T1 wrapper words `command|env|sudo|exec|time` and those words' flags/assignments that still invoke `git commit` / `git push` strip. `command -v git commit` still advises. `nice` / `nohup` / `stdbuf` stay out. `||` `;` `|` still advise. The whole compound is not `validation`.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `PUBLISH_SUFFIX` consumes wrapper flags/assignments that still invoke git; `command -v` is not an invocation |
| `tests/leftovers-after-adr053.test.mjs` | edit | already bound |

## Ordered Steps

1. [S1] Confirm `sudo -n after a check still strips` is red and `command -v is not a publish; loud joiners still advise` is green. [proof: acceptance]
2. [S2] After each T1 wrapper word, accept the measured leftover flags/assignments that still leave an invocation of `git commit` / `git push` (`sudo -n`, `sudo -n -u ci`, `env FOO=bar`, `env -u HOME FOO=bar`, `command --`, `time -p`). This is not a POSIX wrapper parser. Do not treat `command -v` as an invocation. Do not add `nice` / `nohup` / `stdbuf`. Keep `[^|;\n]*$`. Do not flip `isValidationCommand` for the whole compound. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'sudo -n after a check still strips' tests/leftovers-after-adr053.test.mjs && node --test --test-name-pattern 'command -v is not a publish; loud joiners still advise' tests/leftovers-after-adr053.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `sudo -n after a check still strips` | `tests/leftovers-after-adr053.test.mjs` | wrapper-with-args after `pnpm check` strips | F-3, UC3-S1 | S1, S2 |
| `command -v is not a publish; loud joiners still advise` | `tests/leftovers-after-adr053.test.mjs` | path lookup, `nice`, and `\|\|` stay false | F-3, UC3-S2 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `PUBLISH_SUFFIX` |
| 2 — something selects it | `publishPrecededByValidation` → PreToolUse commit arm |
| 3 — the caller can discover it | PreToolUse stderr on `git commit` |
| 4 — it is used | leftovers wrapper tests |

## Mutation Log

## Invariants

- `isValidationCommand('pnpm check && git commit -m x')` stays false.
- `pnpm check && sudo git commit -m x` still strips.
- `git add -A && git commit` still advises when unpublished work exists.
- Quote-blind suffix (`git commit -m "x;y"` stopping at `;`) stays named leftover.

## Risks

- `command -v git commit` treated as wrapped publish. Mitigation: UC3-S2.

## Stop Condition

`sudo -n` still advises after `pnpm check`, or `command -v` / `||` go silent.

## Out of Scope

- Teaching `isValidationCommand('mrw write --check')` as a T1 prefix
- Quote-aware `PUBLISH_SUFFIX`

## Verification Log
