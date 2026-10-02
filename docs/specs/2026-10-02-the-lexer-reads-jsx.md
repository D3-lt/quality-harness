# Spec: The lexer reads JSX

> **Date:** 2026-10-02 · **Status:** Ready-for-ADR
> **Owner:** Zy · **Becomes:** ADR-083 (`docs/adr/ADR-083-the-lexer-reads-jsx.md`)
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** BACKLOG §337; ADR-078 (the lexer, hasher 2); ADR-079 (every gate reads JavaScript one way)

## Problem

ADR-078's `_js_lex` has no JSX mode. A closing or self-closing tag stops it, so in a React corpus every test after the first tag is unreadable. Two outside runs measured this against 3.7.0 (BACKLOG §337): 61 of 65 `.tsx` test files stop, while 0 of 50 `.ts` files do. 3.7.2 answers with a stop-gap: a stop at a tag is advice, with a raw fallback deciding "missing". That fallback is weaker than the lexer (§337 residuals), and the test lock still cannot bound a `.tsx` test past a tag.

## Goal

A JavaScript-family file that may hold JSX is read through its JSX, by the gates and by the lock. The 3.7.2 stop-gap is deleted, and no lock already recorded changes meaning.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| `_js_lex` | system | read a file as JavaScript reads it, JSX included |
| test lock (`snapshot_lock`, hasher 2/3) | system | bound and hash a locked test's body |
| `spec-verify`, `adr-lint` | system | decide whether a named JavaScript test exists and can fail |
| React corpus | external corpus | have its real tests found and its stale rows caught |

## Use Cases

### UC-1: The lexer reads a JSX file

- **Trigger:** a file with suffix `.js .mjs .cjs .jsx .tsx` · **Preconditions:** none
- **Main flow:**
  1. A `<` in an operand position followed by a name or `>` opens an element.
  2. Tags, attributes and text are literal; `{…}` is code.
  3. The element closes and code resumes.
- **Failure paths:** a. an element the lexer cannot read (an unterminated tag or attribute string, a `<` inside a tag, the file ending inside JSX) → a stop, UNPROVEN after it. b. a `.ts .mts .cts` file → no JSX reading, as before.
- **Postconditions:** code positions after JSX are code.

### UC-2: A lock and the gates read through JSX

- **Trigger:** a lock snapshot, `spec-verify`, or `adr-lint` over a JSX file · **Preconditions:** the file is JSX-capable
- **Main flow:**
  1. A lock whose JavaScript files read differently with JSX is taken by hasher 3, and any other by hasher 2.
  2. The gates read with JSX.
- **Failure paths:** a. a lock taken before by hasher 2 → read without JSX, exactly as it was taken, and never moved by this change.
- **Postconditions:** a test past a tag is found, bounded, and hashed. A never-written one is missing.

## Scenarios

### UC1-S1 [happy] The lexer reads JSX through to the code after it [@implemented] → `tests/test-lock.test.mjs::the lexer reads JSX: elements, fragments, attributes, expressions and text`

```gherkin
Given a file with vi.mock factories, render(<B>x</B>), fragments, attributes with arrow functions, {xs.map(x => <li key={x}>{x}</li>)}, {/* c */}, and text holding an apostrophe
When it is lexed with JSX
Then nothing stops, and a test() after it is at a code position
```

### UC1-S2 [failure] An element the lexer cannot read is a stop [@implemented] → `tests/test-lock.test.mjs::an element the lexer cannot read is a stop, never a guess`

```gherkin
Given an unterminated tag, an unterminated attribute string, a < inside a tag, or a file that ends inside JSX
When it is lexed with JSX
Then the lexer stops there, and nothing after it is code
```

### UC1-S3 [failure] Plain TypeScript and tsx generics are not JSX [@implemented] → `tests/test-lock.test.mjs::only a JSX-capable suffix reads JSX, and a tsx generic arrow is not an element`

```gherkin
Given <B>x</B> in a .ts file, and <T,>(x: T) => x or <T extends U>(x: T) => x in a .tsx file
When each is lexed for its suffix
Then the .ts file reads as hasher 2 did, and neither generic opens an element
```

### UC2-S1 [happy] A lock over a JSX file is hasher 3 and bounds the test [@implemented] → `tests/test-lock.test.mjs::a lock over a JSX file is taken by hasher 3, and every other lock by hasher 2`

```gherkin
Given a .tsx test file whose tests follow JSX, and a .mjs one with no JSX
When a lock is taken over each
Then the first says check@3 and hashes the test past the tag, and the second says check@2
```

### UC2-S2 [failure] A hasher-2 lock does not move [@implemented] → `tests/test-lock.test.mjs::hasher 2 reads a JSX file exactly as it did`

```gherkin
Given a lock hasher 2 took over a file holding JSX
When it is checked after this change
Then it is read without JSX and compares equal
```

### UC2-S3 [happy] The gates find a test past a tag, and miss a never-written one [@implemented] → `tests/js-reading.test.mjs::a test past a JSX tag is found by both gates, and a never-written one is missing`

```gherkin
Given a .tsx file whose real test follows render(<B>x</B>)
When spec-verify and adr-lint look for it, and for a name nobody wrote
Then the real one is found with no JSX advice, and the other is missing
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | `_js_lex(text, ts, jsx=True)` treats a `<` at an operand position, followed by a name or `>`, as an element. Names, attributes, attribute strings and text are literal. `{…}` in a tag or in children is code; its braces are literal, as a template's `${…}` are. Elements nest, fragments `<>…</>` are read, and `</name>` and `/>` close. | `tests/test-lock.test.mjs::the lexer reads JSX: elements, fragments, attributes, expressions and text` | @implemented | |
| F-2 | `_js_lex(text, ts)` with `jsx` left False reads every file byte for byte as before, so hasher 2's reading does not change. | `tests/test-lock.test.mjs::hasher 2 reads a JSX file exactly as it did` | @implemented | |
| F-3 | JSX is read for `.js .mjs .cjs .jsx .tsx`, and never for `.ts .mts .cts`. In `.tsx`, `<T,>` and `<T extends U>` before an arrow are type parameters, not elements. | `tests/test-lock.test.mjs::only a JSX-capable suffix reads JSX, and a tsx generic arrow is not an element` | @implemented | |
| F-4 | `snapshot_lock` takes hasher 3 when a locked JavaScript-family file reads differently with JSX than without, and hasher 2 otherwise. `LOCK_HASHERS` is `(1, 2, 3)`, and a hasher-3 map says `check@3`. | `tests/test-lock.test.mjs::a lock over a JSX file is taken by hasher 3, and every other lock by hasher 2` | @implemented | |
| F-5 | A lock records the hasher that took it, and it is read the way it was taken: hasher 2 without JSX and hasher 3 with it. No lock recorded before this change moves. | `tests/test-lock.test.mjs::hasher 2 reads a JSX file exactly as it did` | @implemented | |
| F-6 | `spec-verify` and `adr-lint` read a JSX-capable file with JSX. A test past a tag is found and bounded, a never-written one is missing, and there is no JSX advice and no raw fallback. | `tests/js-reading.test.mjs::a test past a JSX tag is found by both gates, and a never-written one is missing` | @implemented | |
| F-7 | An element the lexer cannot read is a stop, and everything after it is unknown (UNPROVEN). That covers an unterminated tag or attribute string, a `<` inside a tag, a closing tag with no element open, and the end of the file inside JSX. It is never a guess. | `tests/test-lock.test.mjs::an element the lexer cannot read is a stop, never a guess` | @implemented | |
| F-8 | The §337 residuals read correctly with JSX: an apostrophe in JSX text, `</a>` with a later `/` on its line, `/>` after a string attribute, and `{/* c */}`. | `tests/test-lock.test.mjs::the lexer reads JSX: elements, fragments, attributes, expressions and text` | @implemented | |

## Domain

An element is a tag, its attributes, and its children. Children are text, expressions and elements. Code in an expression is lexed as code, and its JSX nests. A lock's hasher names the reading that took it.

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| lock map (`check@3`) | add hasher 3 | `adr-lint`'s lock check, `adr-verify --relock`, `adr-next` |
| `spec-verify`, `adr-lint` verdicts on JSX files | a test past a tag found; the JSX advice removed | adopters with React corpora |

## Non-Goals

- Parsing TypeScript type syntax beyond telling a `.tsx` generic arrow from an element.
- Relocking existing hasher-2 locks: they keep their reading; a relock takes the hasher the file needs.
- JSX namespace and member names beyond `a:b` and `a.b` reading as a name.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A JSX construct the scanner misreads changes code positions after it | Med | Med | It stops instead of guessing (F-7); the two React corpora run it before the tag. |
| A `.js` file without JSX reads differently with JSX on | Low | Med | F-4 takes hasher 3 only when the readings differ, and `verdict-diff` on this corpus must be empty. |

## Open Questions

## Verify

```bash
spec-verify --spec docs/specs/2026-10-02-the-lexer-reads-jsx.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | Does the lock move to a JSX-aware hasher in the same record? | F-4 | Yes, hasher 3 (owner, 2026-10-02) |
| 2 | Hasher 3 for every new lock, or only where JSX changes the reading? | F-4 | Only where it changes it: a lock over JSX-free files reads the same, and locked tests pin check@2 |
| 3 | Which suffixes read JSX? | F-3 | `.js .mjs .cjs .jsx .tsx`; never plain TypeScript |
