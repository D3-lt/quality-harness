# Spec: Every gate reads JavaScript one way

> **Date:** 2026-10-01 · **Status:** Ready-for-ADR
> **Owner:** Zy · **Becomes:** ADR-079 (`docs/adr/ADR-079-every-gate-reads-javascript-one-way.md`)
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** ADR-078 (the lexer, `_js_lex`); docs/BACKLOG.md §324 item 1, §328's correction, §329 (two reviews of the first draft)

## Problem

ADR-078 gave the test lock a JavaScript lexer and left two other gates reading JavaScript their own way (BACKLOG
§324). Two reviews of the first draft of this record, and a scout of the code (§329), found the readers disagree
about the same source. The cases below are confirmed against source:

- **A `test(` inside a string.** It is a test to `adr-lint`'s title search (`plugin/bin/adr-lint:4576`) and to its
  body search (`:4892`). It is not a test to the lock.
- **A file the lexer cannot read to its end.** Past an unplaceable `/`, the lock says UNPROVEN, while
  `spec-verify` and `adr-lint` still decide "found" or "missing" from raw text.
- **`.mts` and `.cts`.** They are missing from `spec-verify`'s suffix list (`:356`) and from `adr-lint`'s
  enforcement arm (`:3771`), so `spec-verify` reports such a test as missing (`:417`).
- **Can-fail reads the body with `code_only`** (`:5402`). That blanks an assertion inside `${…}` and reads a
  `/assert/` regex literal as an assertion.
- **Escaped titles.** `adr-lint`'s body search compares a title verbatim, so `a\'b` is never found.
- **No way to say "could not check".** `spec-verify` has no path from a could-not-check answer to its exit-4
  class; any answer that is not `"unrun"` becomes missing, exit 2 (`:818-821`).

## Goal

For a JavaScript-family file, `spec-verify` and `adr-lint` decide whether a test exists, where its body ends,
and whether it can fail on the lock's reading. Where that reading stops, both say UNPROVEN, and `adr-lint`
withholds `done`; neither says missing nor stays silent. The readers' vocabularies (`describe`, `test.skip`,
receivers) stay as they are, and are named as residuals rather than claimed to agree.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| Session binding a spec to a test | human role | `spec-verify` finds the test that runs, and only that |
| Session marking a task done | human role | `adr-lint` judges the body the lock hashes, and never certifies one it could not read |

## Use Cases

### UC-1: spec-verify checks that a bound JavaScript test exists

- **Trigger:** `spec-verify --spec` · **Preconditions:** a binding names a test in a JavaScript-family file
- **Main flow:**
  1. The file is read with the lock's lexer.
  2. A registration counts only where its call is code.
- **Failure paths:**
  - a. The name occurs only inside a string → missing.
  - b. The name is not found and the lexer stopped before the end → could-not-check, exit 4.
- **Postconditions:** the binding's verdict matches the lock's reading.

### UC-2: adr-lint reads a named JavaScript test

- **Trigger:** `adr-lint` on a record whose Tests table names a JavaScript-family test
- **Main flow:**
  1. The name is found only where its call is code; the title is compared decoded.
  2. Its body is bounded on the lexer's view of the whole file.
  3. Can-fail searches that body's code view.
- **Failure paths:**
  - a. The name is only inside a string → not found.
  - b. The name is not found and the lexer stopped before the end → UNPROVEN, and `done` is withheld.
- **Postconditions:** the body judged is the body the lock hashes.

## Scenarios

### UC1-S1 [happy] A registered test in code is found, in every family suffix [@spec] → `tests/js-reading.test.mjs::spec-verify finds a JavaScript test only where its registration is code, in every family suffix` cmd:`node --test tests/js-reading.test.mjs`

```gherkin
Given a .mjs, an .mts and a .cts file each registering a test in code, and another name only inside a string
When spec-verify checks the bindings
Then the registered names exist and the string-held name does not
```

### UC1-S2 [failure] A test past the stop is could-not-check, exit 4 [@spec] → `tests/js-reading.test.mjs::spec-verify says could-not-check, exit 4, for a JavaScript test it could not read to` cmd:`node --test tests/js-reading.test.mjs`

```gherkin
Given a spec binding a test registered after a / the lexer cannot place, and one registered before it
When spec-verify --spec runs
Then it exits 4, names the later test as could-not-check, and finds the earlier one
```

### UC1-S3 [happy] A decoded title, and a substring, are judged on the registration [@spec] → `tests/js-reading.test.mjs::spec-verify matches a decoded title, and never a substring` cmd:`node --test tests/js-reading.test.mjs`

```gherkin
Given a test titled with an escaped quote, and a test named ghostly
When spec-verify checks the escaped title and the name ghost
Then the escaped title exists and ghost does not
```

### UC2-S1 [happy] adr-lint judges the body the lock hashes [@spec] → `tests/js-reading.test.mjs::adr-lint reads a JavaScript test where its call is code, bounded as the lock bounds it` cmd:`node --test tests/js-reading.test.mjs`

```gherkin
Given a string holding test('x', () => { /* nothing */ }) before the real test('x', () => { assert.equal(1, 1) })
When adr-lint reads x's body
Then the body is the real one, with its assertion
```

### UC2-S2 [failure] A name only inside a string is not found [@spec] → `tests/js-reading.test.mjs::adr-lint does not find a JavaScript test that exists only inside a string` cmd:`node --test tests/js-reading.test.mjs`

```gherkin
Given a test that appears only inside a string constant
When adr-lint looks for it
Then it is not found
```

### UC2-S3 [failure] A test past the stop is UNPROVEN and withholds done [@spec] → `tests/js-reading.test.mjs::adr-lint says UNPROVEN, and withholds done, for a JavaScript test it could not read to` cmd:`node --test tests/js-reading.test.mjs`

```gherkin
Given a task naming a test registered after a / the lexer cannot place, another name the stopped file never registers, and a missing name in a file read to its end
When adr-lint checks the record, with the task done and then pending
Then the first two are UNPROVEN and never "not found", blocking when done and advice when pending, and the third is not found
```

### UC2-S4 [happy] Can-fail reads the code view, helpers included [@spec] → `tests/js-reading.test.mjs::adr-lint judges a JavaScript body and its helpers on the code view` cmd:`node --test tests/js-reading.test.mjs`

```gherkin
Given a test whose only assertion is inside ${…}, one whose only "assert" is a regex literal, and one that calls a same-file helper that asserts
When adr-lint judges whether each can fail, directly and through the CLI
Then the first and third can, and the second asserts nothing
```

### UC2-S5 [failure] The other languages read as they did [@spec] → `tests/js-reading.test.mjs::the other languages read as they did` cmd:`node --test tests/js-reading.test.mjs`

```gherkin
Given a Python, a Go and a PHP test
When spec-verify and adr-lint read them
Then each is found and bounded as before, and no non-JavaScript caller is handed an UNPROVEN answer
```

### UC2-S6 [failure] A found test whose body cannot be bounded is UNPROVEN [@spec] → `tests/js-reading.test.mjs::adr-lint says UNPROVEN for a JavaScript test whose body it cannot bound` cmd:`node --test tests/js-reading.test.mjs`

```gherkin
Given a test whose expression body leaves a / unplaced, and one whose body holds the stop
When adr-lint bounds each body
Then each is UNPROVEN, while a complete body before a later stop is found
```

### UC2-S7 [failure] History keeps the moved lock's exceptions [@spec] → `tests/js-reading.test.mjs::UNPROVEN on a frozen record, or below strictFrom, is advice as a moved lock is` cmd:`node --test tests/js-reading.test.mjs`

```gherkin
Given a done task naming a test past the stop, in a frozen archived record and then in a record below strictFrom
When adr-lint checks it
Then it says UNPROVEN as advice, not as a block
```

### UC2-S8 [happy] An enforcement pointer is resolved on the lexer [@spec] → `tests/js-reading.test.mjs::an enforcement pointer to a JavaScript test is resolved on the lexer` cmd:`node --test tests/js-reading.test.mjs`

```gherkin
Given Enforced-by naming a real test, a string-held test, and a test past the stop
When adr-lint resolves each
Then the first resolves, the second points to nothing, and the third is UNPROVEN
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | One JavaScript-family suffix set (`.js .mjs .cjs .jsx .ts .tsx .mts .cts`), defined once, decides which reader every JavaScript arm of `spec-verify` and `adr-lint` uses. | `tests/js-reading.test.mjs::spec-verify finds a JavaScript test only where its registration is code, in every family suffix` | @spec | `node --test tests/js-reading.test.mjs` |
| F-2 | `spec-verify` counts a JavaScript registration only where `_js_lex` says its call is code; its own vocabulary (modifiers, no receivers) is unchanged. | `tests/js-reading.test.mjs::spec-verify finds a JavaScript test only where its registration is code, in every family suffix` | @spec | `node --test tests/js-reading.test.mjs` |
| F-3 | A bound JavaScript test that is not found, in a file `_js_lex` did not read to its end, is could-not-check in `spec-verify` (exit 4), never missing (exit 2); one found before the stop is found. | `tests/js-reading.test.mjs::spec-verify says could-not-check, exit 4, for a JavaScript test it could not read to` | @spec | `node --test tests/js-reading.test.mjs` |
| F-4 | Both gates compare a JavaScript title decoded, as the literal reads, and only against a whole registered title. | `tests/js-reading.test.mjs::spec-verify matches a decoded title, and never a substring` | @spec | `node --test tests/js-reading.test.mjs` |
| F-5 | `adr-lint` finds a JavaScript test only where its call is code, through every existence path: the title search, the body search, the file-name shortcut, and the enforcement pointer, whose consumer reports UNPROVEN distinctly from a pointer to nothing. It bounds the body on the whole file's lexer view. | `tests/js-reading.test.mjs::adr-lint reads a JavaScript test where its call is code, bounded as the lock bounds it` | @spec | `node --test tests/js-reading.test.mjs` |
| F-6 | A JavaScript test that occurs only inside a string, a template's text, a regex or a comment is not found by `adr-lint`. | `tests/js-reading.test.mjs::adr-lint does not find a JavaScript test that exists only inside a string` | @spec | `node --test tests/js-reading.test.mjs` |
| F-7 | A named JavaScript test that is not found, in a file `_js_lex` did not read to its end, is UNPROVEN in `adr-lint`'s existence and can-fail checks, never "not found". On a `done` task it blocks; on a pending task it is advice. | `tests/js-reading.test.mjs::adr-lint says UNPROVEN, and withholds done, for a JavaScript test it could not read to` | @spec | `node --test tests/js-reading.test.mjs` |
| F-8 | `adr-lint` judges whether a JavaScript test can fail on the code view of the whole file: the body's span, and the span of any same-file helper the body calls. An assertion inside `${…}` counts, and a regex literal never does. | `tests/js-reading.test.mjs::adr-lint judges a JavaScript body and its helpers on the code view` | @spec | `node --test tests/js-reading.test.mjs` |
| F-10 | A JavaScript test whose call is found but whose body cannot be bounded (a stop inside it, or a `/` left in an expression body) is UNPROVEN, whether or not the lexer read the rest of the file. A complete body before a later stop is found. | `tests/js-reading.test.mjs::adr-lint says UNPROVEN for a JavaScript test whose body it cannot bound` | @spec | `node --test tests/js-reading.test.mjs` |
| F-11 | UNPROVEN keeps a moved lock's exceptions: on a frozen archived record, and on a record below `strictFrom`, it is advice. | `tests/js-reading.test.mjs::UNPROVEN on a frozen record, or below strictFrom, is advice as a moved lock is` | @spec | `node --test tests/js-reading.test.mjs` |
| F-12 | An `Enforced-by` pointer to a JavaScript test resolves only where its call is code; one past the stop is said UNPROVEN, not "pointer to nothing" and not silence. | `tests/js-reading.test.mjs::an enforcement pointer to a JavaScript test is resolved on the lexer` | @spec | `node --test tests/js-reading.test.mjs` |
| F-9 | Python, Go, PHP, Rust, Swift, Ruby and shell are read exactly as before, and no non-JavaScript caller of `test_body` can receive an UNPROVEN answer. | `tests/js-reading.test.mjs::the other languages read as they did` | @spec | `node --test tests/js-reading.test.mjs` |

## Domain

A **JavaScript-family file** has a suffix in F-1's set. **The lexer** is ADR-078's `_js_lex`. Its **stop** is the
first offset it could not read past. **UNPROVEN** is a reading this gate could not establish (ADR-005).

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `spec-verify` verdict for a JavaScript binding | string-held → missing; past the stop → could-not-check (exit 4); `.mts`/`.cts` read | sessions running `spec-verify` |
| `adr-lint` existence, enforcement and can-fail findings for a JavaScript test | read on the lexer's view; past the stop → UNPROVEN, `done` withheld | sessions running `adr-lint`; `adr-next` |

## Non-Goals

- Changing any test lock or hasher: ADR-078 owns them.
- Unifying the readers' vocabularies. These stay as they are and are named in the ADR as residuals: `describe`,
  `test.skip`, receivers such as `helper.test`, interpolated titles, `test/* */(`, and `spec-verify --collect`'s
  `vitest list`.
- Go's reader (`_js_like_in_code`), Ruby `do … end` blocks, and the other languages' readers.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A verdict on a corpus changes | Med | Med | The bar: every record and spec is checked with the plugin frozen at cd8f95f and with the candidate, both diffed against the same corpus, with an empty exception list. Measured 2026-10-01: none of this repository's 129 JavaScript-family test files stops before its end |
| A real test past an unplaceable `/` becomes UNPROVEN and blocks done | Low | Med | It is said by name, with the remedy; the corpus count above, and the outside runs' `--diff`, show how often |

## Open Questions

## Verify

```bash
spec-verify --spec docs/specs/2026-10-01-every-gate-reads-javascript-one-way.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | Which gates move onto the lexer? | F-2 | Both spec-verify and adr-lint (owner, 2026-10-01) |
| 2 | What do they say past where the lexer stops? | F-3 | UNPROVEN, never missing (owner, 2026-10-01) |
| 3 | What bar must the change meet on this corpus? | non-behavioral | No verdict changes apart from documented fixes; anything else stops the work (owner, 2026-10-01). The comparison is the frozen plugin against the candidate on one corpus, with an empty exception list (second review, §329) |
| 4 | Does UNPROVEN block done? | F-7 | Scouted from the advisor's review of the rework: yes, as a moved lock does, or a missing test in a stopped file would stop blocking done |
| 5 | Do the vocabularies converge? | non-behavioral | Scouted from both reviews: no; they are named as residuals rather than claimed to agree |
