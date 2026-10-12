# Task ADR-096-T3: a project can keep turn-end findings user-only, and the skill says how

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** S (one config key, its reader, one line of documentation, two tests)
**Owner:** unassigned
**Produces:** `.quality-harness.json` key `turnEnd` (`"agent"` default, `"notify"`)
**Consumes:** `deliver` emitting `hookSpecificOutput.additionalContext` on Stop (T2)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the opt-out is honoured`, `an unreadable configuration means the default`

## Goal

A project that does not want its agent's turns continued can say so, the operating skill tells adopters how, and an unreadable
configuration is said as such and means the default.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/project-config.mjs` | edit | read `turnEnd`; a value other than `"notify"`, or none, is `"agent"` |
| `plugin/scripts/lifecycle.mjs` | edit | `deliver` reads it before choosing the channel |
| `plugin/skills/operating/SKILL.md` | edit | one line in its configuration list naming `turnEnd` |
| `tests/turn-end-delivery.test.mjs` | edit | the two tests below |
| `tests/mutations/plugin/scripts/project-config.mjs.json` | edit | one entry per `Rests-on` name |

## Ordered Steps

1. [S1] Write the two tests and record the red run (TDD red).
2. [S2] Read the key and branch on it in `deliver`.
3. [S3] Add the line to the operating skill. [proof: acceptance]
4. [S4] Record one killed mutant per `Rests-on` name. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/turn-end-delivery.test.mjs 2>&1) \
  && for t in 'turnEnd notify keeps a finding user-only, and any other value means agent' 'an unreadable project configuration means the default, said as such'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `turnEnd notify keeps a finding user-only, and any other value means agent` | `tests/turn-end-delivery.test.mjs` | `turnEnd: notify`: only `systemMessage`; `turnEnd: shout` or none: `additionalContext` | none | S1, S2 |
| `an unreadable project configuration means the default, said as such` | `tests/turn-end-delivery.test.mjs` | a `.quality-harness.json` that does not parse: delivery as `agent`, and the problem said once | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `deliver` reads the key; removing the read turns the first test red |
| 3 — the caller can discover it | the operating skill's configuration list |
| 4 — it is used | an adopter's `.quality-harness.json` |

## Mutation Log

## Invariants

- An unreadable configuration never silently means `"notify"`.

## Risks

- None beyond T2's.

## Stop Condition

Stop and ask if another key already controls advisory delivery.

## Out of Scope

- A per-rule opt-out (permanent: boundary: one switch is enough until someone asks for finer control)

## Verification Log
