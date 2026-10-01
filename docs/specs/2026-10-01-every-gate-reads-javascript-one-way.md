# Spec: Every gate reads JavaScript one way

> **Date:** 2026-10-01 · **Status:** Ready-for-ADR
> **Owner:** Zy · **Becomes:** ADR-079 (`docs/adr/ADR-079-every-gate-reads-javascript-one-way.md`)
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** ADR-078 (the lexer, `_js_lex`); docs/BACKLOG.md §324 item 1, §328's correction; the Codex architecture review of 2026-10-01, finding 2

## Problem

ADR-078 gave the test lock a JavaScript lexer and left two other gates reading JavaScript their own way
(BACKLOG §324; ADR-078's Out of Scope, whose `spec-verify:636` pointer was Swift, not JavaScript).

- `spec-verify` decides whether a bound test exists with its own masker
  (`test_definition_exists`, `plugin/bin/spec-verify:334-361`). Its JavaScript suffix list also lacks
  `.mts` and `.cts`.
- `adr-lint` decides whether a named test exists and whether it can fail through `test_body`
  (`plugin/bin/adr-lint:4781`). Its BDD branch finds the name by a regex over the raw text, so a
  `test('x', …)` inside a string answers for `x`. It then bounds the body with the old masker. And
  when no body is found, the can-fail check says nothing (`continue`, `plugin/bin/adr-lint:5398`).

The Codex architecture review (2026-10-01) named the consequence: existence, ability to fail, and lock
identity can disagree about the same source.

## Goal

For a JavaScript-family file, the lock, `spec-verify` and `adr-lint` agree on which tests exist and where
each one's body ends. Where the lexer cannot tell, all three say UNPROVEN, and no gate's verdict on this
corpus changes except the listed fixes.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| Session binding a spec to a test | human role | `spec-verify` finds the test that runs, and only that |
| Session marking a task done | human role | `adr-lint` judges the body the lock hashes |

## Use Cases

### UC-1: spec-verify checks that a bound JavaScript test exists

- **Trigger:** `spec-verify --spec` · **Preconditions:** a binding names a test in a JavaScript-family file
- **Main flow:**
  1. The file is read with the lock's lexer.
  2. A registration call counts only where the lexer says code.
- **Failure paths:** a. the name is registered only inside a string → not a definition. b. the lexer stops before the name → could not check, never missing.
- **Postconditions:** the binding's verdict matches what the lock would name.

### UC-2: adr-lint reads a named JavaScript test

- **Trigger:** `adr-lint` on a record whose Tests table names a JavaScript-family test
- **Main flow:**
  1. The name is found only where the lexer says code.
  2. Its body is bounded on the lexer's view, and the can-fail check reads that body.
- **Failure paths:** a. the name appears only inside a string → not found. b. the lexer stops before the name → UNPROVEN advice: neither "not found" nor "cannot fail", and never silence.
- **Postconditions:** the body judged is the body the lock hashes.

## Scenarios

### UC1-S1 [happy] A registered test in code is found, in every JavaScript-family suffix [@spec] → `tests/js-reading.test.mjs::spec-verify finds a JavaScript test only where its registration is code` cmd:`node --test tests/js-reading.test.mjs`

```gherkin
Given a .mjs and a .mts file each registering a test in code, and another name only inside a string
When spec-verify checks the bindings
Then the registered names exist and the string-held name does not
```

### UC1-S2 [failure] A name past where the lexer stops is could-not-check [@spec] → `tests/js-reading.test.mjs::spec-verify cannot check a JavaScript test past where the lexer stops` cmd:`node --test tests/js-reading.test.mjs`

```gherkin
Given a test registered after a `/` the lexer cannot place
When spec-verify checks its binding
Then the answer is could-not-check, not missing
```

### UC2-S1 [happy] adr-lint judges the body the lock hashes [@spec] → `tests/js-reading.test.mjs::adr-lint reads a JavaScript test where its call is code, bounded as the lock bounds it` cmd:`node --test tests/js-reading.test.mjs`

```gherkin
Given a string holding `test('x', () => { /* nothing */ })` before the real `test('x', () => { assert.equal(1, 1) })`
When adr-lint reads x's body
Then the body is the real one, with its assertion
```

### UC2-S2 [failure] A name past where the lexer stops is UNPROVEN, said [@spec] → `tests/js-reading.test.mjs::adr-lint says UNPROVEN for a JavaScript test past where the lexer stops` cmd:`node --test tests/js-reading.test.mjs`

```gherkin
Given a Tests table naming a test registered after a `/` the lexer cannot place
When adr-lint checks that it exists and can fail
Then it advises UNPROVEN for it, and says neither "not found" nor nothing
```

### UC2-S3 [failure] A name only inside a string is not found [@spec] → `tests/js-reading.test.mjs::adr-lint does not find a JavaScript test that exists only inside a string` cmd:`node --test tests/js-reading.test.mjs`

```gherkin
Given a Tests table naming a test that appears only inside a string constant
When adr-lint checks that it exists
Then the test is reported not found
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | `spec-verify` reads a JavaScript-family file (`.js .mjs .cjs .jsx .ts .tsx .mts .cts`) with `_js_lex`: a registration call counts only where the lexer says code; its own registration rules (modifiers such as `test.skip`, no receiver calls) are unchanged. | `tests/js-reading.test.mjs::spec-verify finds a JavaScript test only where its registration is code` | @spec | `node --test tests/js-reading.test.mjs` |
| F-2 | Where `_js_lex` stops before a bound name occurs, `spec-verify` answers could-not-check (its exit-4 class), never missing. | `tests/js-reading.test.mjs::spec-verify cannot check a JavaScript test past where the lexer stops` | @spec | `node --test tests/js-reading.test.mjs` |
| F-3 | `adr-lint`'s `test_body`, for a JavaScript-family file, takes a BDD match only where `_js_lex` says code and bounds its body on the lexer's view — the body the lock hashes. | `tests/js-reading.test.mjs::adr-lint reads a JavaScript test where its call is code, bounded as the lock bounds it` | @spec | `node --test tests/js-reading.test.mjs` |
| F-4 | Where `_js_lex` stops before a named test occurs, `adr-lint` advises UNPROVEN for it in both the existence and the can-fail checks; it reports neither "not found" nor nothing. | `tests/js-reading.test.mjs::adr-lint says UNPROVEN for a JavaScript test past where the lexer stops` | @spec | `node --test tests/js-reading.test.mjs` |
| F-5 | A JavaScript test name that occurs only inside a string, template text, regex or comment is not found by `adr-lint`'s existence check. | `tests/js-reading.test.mjs::adr-lint does not find a JavaScript test that exists only inside a string` | @spec | `node --test tests/js-reading.test.mjs` |
| F-6 | Every other language, and Go's `_js_like_in_code`, reads exactly as before. | `tests/js-reading.test.mjs::the other languages read as they did` | @spec | `node --test tests/js-reading.test.mjs` |

## Domain

A **JavaScript-family file** is one with a suffix in F-1's list. **The lexer** is ADR-078's `_js_lex`, the
reading hasher 2 locks with. **UNPROVEN** is a reading this gate could not establish (ADR-005).

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `spec-verify` verdict for a JavaScript binding | a string-held name is missing; an unreadable position is could-not-check; `.mts`/`.cts` are read | sessions running `spec-verify` |
| `adr-lint` existence and can-fail findings for a JavaScript test | read on the lexer's view; UNPROVEN where it stops | sessions running `adr-lint`; `adr-next` reads neither |

## Non-Goals

- Changing any test lock or hasher: ADR-078 owns them.
- Go's reader (`_js_like_in_code`), Ruby `do … end` blocks, and the Python, PHP, Rust, Swift and shell readers.
- Changing `spec-verify`'s or `adr-lint`'s registration vocabulary (`describe`, `t.Run`, modifiers).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A verdict on this corpus changes | Med | Med | The owner's bar (Grill Log row 3): adr-lint over every record and spec-verify over every spec are compared before and after, and any change not listed here stops the work |
| A real test past an unplaceable `/` becomes UNPROVEN where it was found | Low | Low | F-2/F-4 say it rather than guess; the corpus comparison counts how many |

## Open Questions

## Verify

```bash
spec-verify --spec docs/specs/2026-10-01-every-gate-reads-javascript-one-way.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | Which gates move onto the lexer? | F-1 | Both spec-verify and adr-lint (owner, 2026-10-01) |
| 2 | What do they say past where the lexer stops? | F-2 | UNPROVEN, never missing (owner, 2026-10-01) |
| 3 | What bar must the change meet on this corpus? | non-behavioral | No verdict changes apart from documented fixes; anything else stops the work (owner, 2026-10-01) |
| 4 | Do the other readers change? | F-6 | Scouted from ADR-078's F-3 and the Codex review's finding 2, not asked: Go keeps Go semantics |
