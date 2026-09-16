# Spec: A quoted separator is not a joiner

> **Date:** 2026-09-16 · **Status:** Ready-for-ADR
> **Owner:** zy · **Becomes:** ADR-056
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** plugin/scripts/lifecycle.mjs (`PUBLISH_SUFFIX`, `publishPrecededByValidation`, `shellSegments`), docs/adr/ADR-053-a-false-advisory-is-not-a-finding.md, docs/adr/ADR-054-a-go-raw-string-is-not-an-escape.md, docs/BACKLOG.md §209, tests/leftovers-after-adr053.test.mjs, tests/adr053-stress.mjs

## Problem

`PUBLISH_SUFFIX` is quote-blind (`[^|;\n]*`), so `git commit -m "x;y"` stops at `;` and `pnpm check && git commit -m "x;y"` stays loud PreToolUse advice (fail closed). `isGitPublishCommand` already uses `shellSegments`, which does not split on quoted `;`. The hole is only the stripper. Unquoted `||` / `;` / `|` must stay loud (ADR-054 F-3).

## Goal

A trailing publish whose git operands hold quoted `|` / `;` / `||` / `&&` still strips after a recognised check joined by unquoted `&&` or a newline. Unquoted loud joiners still advise.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| adopting engineer | human role | `pnpm check && git commit -m "x;y"` is silent, not extra advice |
| PreToolUse (`publishPrecededByValidation`) | system | peel a trailing publish with quote/escape state; keep unquoted `\|\|` / `;` / `\|` loud |
| leftover stress | system | generate a quoted-`;` member; kill a HAND_MUTANT that restores `[^|;\n]*` |

## Use Cases

### UC-1: Quoted separators in a git operand still strip

- **Trigger:** PreToolUse on Bash `git commit` / `git push` after a recognised check · **Preconditions:** ADR-053 T1; prefix joined by unquoted `&&` or newline
- **Main flow:**
  1. Peel a trailing publish with the same quote/escape state machine `shellSegments` already has.
  2. The last **unquoted** `&&` or newline is the only silent joiner.
  3. Wrapper words and `[^\s|;]+` operands stay as they are (`sudo -n`, `env FOO=bar`, `command --`, `time -p`).
  4. Quoted `|` / `;` / `||` / `&&` inside `-m` (or another git operand) do not stop the peel. Do not print "Nothing has verified the work".
- **Failure paths:**
  - a. at step 1, `[^|;\n]*` stops at the first `;` (live defect) → extra advice.
  - b. at step 1, the peel is `shellSegments` last piece → operators are dropped, so `&&` vs `||` vs `;` become indistinguishable (ADR-054 fail-open just closed).
- **Postconditions:** `env FOO=bar git push` still strips. The whole compound is not `validation`.

### UC-2: Unquoted loud joiners still advise

- **Trigger:** the same peel · **Preconditions:** ADR-054 F-3 / Codex P1 attached `||`
- **Main flow:**
  1. Unquoted `||` / `;` / `|` between a check and git still advise.
  2. Attached unquoted `FOO=bar||` / `-u ci||` still advise (operand class `[^\s|;]+`, not `\S+`).
- **Failure paths:**
  - a. at step 1, quoted-operand awareness also swallows unquoted `;` / `||` → a check that did not gate the publish is trusted.
- **Postconditions:** `command -v`, `nice`, `nohup`, `stdbuf` stay non-invoking.

## Scenarios

### UC1-S1 [happy] quoted semicolon and pipe in a git operand still strip [@implemented] → `tests/leftovers-after-adr053.test.mjs::quoted semicolon and pipe in a git operand still strip` cmd:`node --test --test-name-pattern 'quoted semicolon and pipe in a git operand still strip' tests/leftovers-after-adr053.test.mjs`

```gherkin
Given a recognised check joined by unquoted `&&`
And `git commit -m "x;y"` / `'x|y'` / `"fix && more"`
When publishPrecededByValidation runs
Then it returns true
And `env FOO=bar git push` still returns true
```

### UC1-S2 [failure] quote-blind `[^|;\n]*` leaves quoted-operand publish loud [@implemented] → `tests/leftovers-after-adr053.test.mjs::quoted semicolon and pipe in a git operand still strip` cmd:`node --test --test-name-pattern 'quoted semicolon and pipe in a git operand still strip' tests/leftovers-after-adr053.test.mjs`

```gherkin
Given PUBLISH_SUFFIX still uses `[^|;\n]*`
When `pnpm check && git commit -m "x;y"` is classified
Then publishPrecededByValidation is false
And the leftover HAND_MUTANT that restores `[^|;\n]*` goes red only after the peel ships
```

### UC2-S1 [happy] sudo -n after a check still strips [@implemented] → `tests/leftovers-after-adr053.test.mjs::sudo -n after a check still strips` cmd:`node --test --test-name-pattern 'sudo -n after a check still strips' tests/leftovers-after-adr053.test.mjs`

```gherkin
Given wrapper flags/assignments that still invoke git
When a recognised check is joined by `&&` or a newline
Then the trailing publish still strips
```

### UC2-S2 [failure] unquoted loud joiners and attached || still advise [@implemented] → `tests/leftovers-after-adr053.test.mjs::command -v is not a publish; loud joiners still advise` cmd:`node --test --test-name-pattern 'command -v is not a publish; loud joiners still advise' tests/leftovers-after-adr053.test.mjs`

```gherkin
Given unquoted `||` / `;` / `|` or attached `FOO=bar||`
When publishPrecededByValidation runs
Then it returns false
And the quoted-operand peel must not make those true
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | After a recognised check joined by unquoted `&&` or a newline, a trailing `git commit`/`git push` whose operands contain quoted `\|` / `;` / `\|\|` / `&&` still strips. Wrapper words and `[^\s\|;]+` operands stay. `env FOO=bar git push` still strips. Do not peel by taking `shellSegments`' last piece (operators would vanish). | `tests/leftovers-after-adr053.test.mjs::quoted semicolon and pipe in a git operand still strip` | @implemented | `node --test --test-name-pattern 'quoted semicolon and pipe in a git operand still strip' tests/leftovers-after-adr053.test.mjs` |
| F-2 | Unquoted `\|\|` / `;` / `\|` still advise. Attached unquoted `FOO=bar\|\|` / `-u ci\|\|` still advise. `command -v` / `nice` / `nohup` / `stdbuf` stay non-invoking. The whole compound is not `validation`. | `tests/leftovers-after-adr053.test.mjs::command -v is not a publish; loud joiners still advise` | @implemented | `node --test --test-name-pattern 'command -v is not a publish; loud joiners still advise' tests/leftovers-after-adr053.test.mjs` |
| F-3 | Hasher-visible unproven and `TEST_HASH_REQUIRED_FROM` are not this class. Recovery of hasher names stays `--relock` (Spec A). This spec does not bump the cutover date. | `tests/test-lock.test.mjs::adr-verify --replace-hashes without --relock is refused` | @implemented | `node --test --test-name-pattern 'adr-verify --replace-hashes without --relock is refused' tests/test-lock.test.mjs` |

## Domain

A silent joiner is an **unquoted** `&&` or newline. Quoted bytes of `|` `;` `&` are operand content. `shellSegments` drops operators; the stripper must not.

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `publishPrecededByValidation` / publish suffix peel | quote-aware trailing publish | PreToolUse commit advice |
| leftover stress pool / HAND_MUTANT | quoted-`;` member; restore `[^|;\n]*` | repository gate |

## Non-Goals

- Full POSIX; `$(…)`; backticks as command substitution; `nice` / `nohup` / `stdbuf`.
- Teaching `isValidationCommand` the whole `check && git commit` compound.
- Taking `shellSegments` last piece as the suffix.
- Bump `TEST_HASH_REQUIRED_FROM`; `--replace-hashes` on ADR-054 T1–T4.
- Edit `tests/test-lock.test.mjs` or `tests/swift-expect.test.mjs`.
- Escaped same-quote BDD names (Spec A / ADR-055).
- BACKLOG §206 never-hashable Tests rows.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Peel via `shellSegments` fail-opens `\|\|` / `;` | High | High | F-1: keep the last unquoted `&&`/newline; F-2 dirty attached `\|\|` |
| Quote awareness swallows unquoted `;` | Med | High | F-2 existing loud-joiner tests stay green |
| Wrapper `[^\s\|;]+` regresses to `\S+` | Med | High | F-2 `FOO=bar\|\|`; existing HAND_MUTANT |

## Open Questions

## Verify

```bash
python3 plugin/bin/spec-verify --spec docs/specs/2026-09-16-a-quoted-separator-is-not-a-joiner.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | Must `git commit -m "x;y"` / `'x\|y'` / `"fix && more"` strip after a check? | F-1 | Plan-accepted 2026-09-16. Quoted `&&`/`\|`/`;` in `-m` strip. |
| 2 | Are newlines vs `&&` both silent joiners? | F-1 | Plan-accepted. Last unquoted `&&` or newline only. |
| 3 | Must unquoted `\|\|` / `;` / `\|` and attached `FOO=bar\|\|` stay loud? | F-2 | Plan-accepted. ADR-054 F-3. |
| 4 | May the peel call `shellSegments` and take the last piece? | F-1 | Plan-accepted: no. Operators would vanish. |
| 5 | `TEST_HASH_REQUIRED_FROM` / first-red rewrite? | F-3 | Plan-accepted Non-Goal. Stays 2026-09-13. |
