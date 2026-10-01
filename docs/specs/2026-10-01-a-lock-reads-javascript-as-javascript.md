# Spec: A lock reads JavaScript as JavaScript

> **Date:** 2026-10-01 · **Status:** Ready-for-ADR
> **Owner:** Zy · **Becomes:** ADR-078 (`docs/adr/ADR-078-a-lock-reads-javascript-as-javascript.md`)
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** docs/BACKLOG.md §324 item 1; ADR-050 (the test lock); ADR-052 (`--relock`); BACKLOG §212 (regex masking), §305 (options as an argument)

## Problem

The test lock names and hashes the tests of a JavaScript file with readings that disagree with
JavaScript. Name discovery (`_iter_bdd_calls`) consults nothing but a line comment, so a `test(` inside a
string is a test of the file: `tests/unasserted-isolation.test.mjs` yields `a negative value is a finding`,
which exists only inside the constant `SUITE`, and its "body" is the helper after it (ADR-076 T3 had to be
relocked). The body masker (`_mask_lock_noncode(js=True)`) knows some regex literals but not all, and not a
template's interpolation: measured 2026-10-01 over this repository's tests, gating discovery on it would drop
14 real tests — 13 in `tests/mutate-propose.test.mjs` after `c => /^[`/.]/` (a `/` after `=>` is read as a
division, so the backtick opens a template) and 1 in `tests/evidence-chain.test.mjs` after nested templates.
The regex-blind `_js_like_code_positions` made 12 active records fail when tried as the gate (BACKLOG §324).
The latent twin is real, through a template rather than a regex: for a test holding
`` `${ cond ? `x ${y} }` : '' }` `` hasher 1 hashes the body up to the `}` inside the nested template — a
prefix, not a refusal (measured 2026-10-01). A quote-holding regex inside a test did NOT reproduce it,
because the body path masks first. And the digest's own comment stripper (`body_digest`) reads `//one`
inside a nested template as a comment, so an assertion changed after it does not move the lock (Codex
review, 2026-10-01).

## Goal

Every lock taken from now on names exactly the tests JavaScript would run and hashes each one's own body,
while every lock already recorded keeps the meaning it had when it was taken.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| Session executing a task | human role | take a lock at first red that names the tests the file really declares |
| `adr-lint` / `adr-next` | system | compare a recorded lock with the tree under the reading that took it |
| An older install of the plugin | system | never pass a lock it cannot read the way it was taken |
| Maintainer of an older record | human role | move a record's lock to the new reading without losing its evidence |

## Use Cases

### UC-1: A session takes a lock on a JavaScript test file

- **Trigger:** `adr-verify <task.md>` records a first red (or a recovery lock) · **Preconditions:** the task's Tests table names a JavaScript-family file
- **Main flow:**
  1. The lock reads the file with hasher 2.
  2. It names each `test(`/`it(` whose call is code, and hashes that test's own body with hasher 2's digest.
  3. The lock records that hasher 2 took it.
- **Failure paths:** a. a literal or comment never ends → every test named after that point, or whose body reaches it, is UNPROVEN. b. a test named in the Tests table is declared only inside a string → it is not a test of the file, so it is UNPROVEN. c. a `/` whose role cannot be established → the same as a.
- **Postconditions:** the lock's payload says which hasher took it.

### UC-2: A gate reads a lock taken before hasher 2

- **Trigger:** `adr-lint` or `adr-next` reads a Verification Log lock · **Preconditions:** the lock carries no hasher record
- **Main flow:**
  1. The gate reads it as hasher 1 and compares it with hasher 1's reading of the tree.
  2. Where hasher 2 would read that file differently, `adr-lint` advises, naming `adr-verify --relock`.
- **Failure paths:** a. a body moved under hasher 1 → done is refused, as today. b. the lock names a hasher this reader does not know → UNPROVEN, never compared under another hasher. c. an older install reads a hasher-2 lock → it cannot read it, and refuses done as it refuses any lock it cannot read.
- **Postconditions:** no recorded lock changes meaning because the reader changed.

### UC-3: A maintainer moves a record to hasher 2

- **Trigger:** `adr-verify <task.md> --relock` · **Preconditions:** the task's last lock was taken by hasher 1
- **Main flow:**
  1. The relock compares the recorded bodies with hasher 1's reading.
  2. Nothing moved, so it appends a lock taken by hasher 2.
- **Failure paths:** a. a body moved under hasher 1 → refused, as today, unless `--replace-hashes`.
- **Postconditions:** the newest lock is a hasher-2 lock; the earlier rows are untouched.

## Scenarios

### UC1-S1 [happy] A lock names only the tests whose call is code [@spec] → `tests/test-lock.test.mjs::hasher 2 counts a test only where its call is code`

```gherkin
Given a test file declaring tests in code, a string holding a declaration with the same name as a real one, and test( heads inside a comment, a regex and template text
When hasher 2 reads it
Then it names the tests in code and one inside a template's interpolation, and each body is the real declaration's
```

### UC1-S2 [happy] A slash reads as JavaScript reads it where its context decides [@spec] → `tests/test-lock.test.mjs::hasher 2 reads a regex literal as a regex and a division as a division`

```gherkin
Given tests holding /^[`/.]/ after =>, /(["'])(.*?)\1/, a division chain, obj.in / 2, and a regex after break outer
When hasher 2 reads them
Then every test is named, and each body ends at its own closing brace
```

### UC1-S3 [happy] Braces in a template's interpolation are code [@spec] → `tests/test-lock.test.mjs::hasher 2 reads a template's interpolation as code`

```gherkin
Given a test whose body holds nested templates and an object literal inside ${…}
When hasher 2 bounds its body
Then the body is exactly the test's own, and the next test is named
```

### UC1-S4 [failure] An unterminated literal leaves the tests it reaches unproven [@spec] → `tests/test-lock.test.mjs::an unterminated literal leaves the tests after it unproven under hasher 2`

```gherkin
Given a file whose template literal opens inside a test's body and never closes, with a test before and a test after
When the lock is taken
Then the test before is hashed, and the open test and the one after are UNPROVEN — never a prefix hash
```

### UC1-S5 [failure] A test declared only inside a string is unproven, not hashed [@spec] → `tests/test-lock.test.mjs::a lock taken before the lexer is read as it was taken`

```gherkin
Given a Tests table naming a test that exists only inside a string constant
When hasher 2 takes the lock
Then that name is UNPROVEN, and the lock records hasher 2
```

### UC1-S6 [failure] A slash hasher 2 cannot place is not guessed [@spec] → `tests/test-lock.test.mjs::a slash hasher 2 cannot place leaves the tests it reaches unproven`

```gherkin
Given a `/` after `}`, and a `/` after a lone `>` in a TypeScript file
When the lock is taken
Then the tests before each are hashed, and every test the slash reaches is UNPROVEN
```

### UC1-S7 [happy] A change after a nested template moves the lock [@spec] → `tests/test-lock.test.mjs::under hasher 2 a change after a nested template moves the lock`

```gherkin
Given a hasher-2 lock over a test holding `${true ? `//one` : ''}` and nested template text `a  b`
When the assertion after it changes, or the nested text becomes `a b`
Then the lock's hash has moved
```

### UC2-S1 [happy] A lock with no hasher record is compared as hasher 1 read it [@spec] → `tests/test-lock.test.mjs::a lock taken before the lexer is read as it was taken`

```gherkin
Given the lock hasher 1 took on 2026-10-01, frozen byte for byte, over a file hasher 2 reads differently
When the gate compares it with the unchanged tree
Then no body has moved, and done is not refused
```

### UC2-S2 [happy] A hasher-1 lock that hasher 2 reads differently is advised [@spec] → `tests/test-lock.test.mjs::a hasher-1 lock that hasher 2 reads differently is advised, naming the relock`

```gherkin
Given a hasher-1 lock over a file hasher 2 reads differently, and another over a file both read alike
When adr-lint reads them
Then the first is advised, naming adr-verify --relock; the second is not; neither blocks
```

### UC2-S3 [failure] A moved body under a frozen hasher-1 lock still refuses done [@spec] → `tests/test-lock.test.mjs::a moved body under a frozen hasher-1 lock refuses done`

```gherkin
Given the frozen hasher-1 lock and its locked assertion rewritten
When adr-lint and adr-next read it
Then done is refused by both
```

### UC2-S4 [failure] A lock naming an unknown hasher is unproven [@spec] → `tests/test-lock.test.mjs::a lock naming a hasher this reader does not know is unproven`

```gherkin
Given a lock whose payload names hasher 9
When the gate reads it
Then it is UNPROVEN, and no body is compared
```

### UC2-S5 [failure] An older reader cannot read a hasher-2 lock [@spec] → `tests/test-lock.test.mjs::a lock taken by hasher 2 cannot be read by the 3.3.0 reader`

```gherkin
Given a lock taken by hasher 2
When the decode_lock shipped in 3.3.0 reads it
Then it returns nothing, which every 3.3.0 gate reports as a lock it could not read — UNPROVEN
```

### UC3-S1 [happy] A relock moves a hasher-1 lock to hasher 2 [@spec] → `tests/test-lock.test.mjs::relock moves a hasher-1 lock to hasher 2 when nothing moved under hasher 1`

```gherkin
Given a task whose last lock is the frozen hasher-1 lock, and an unchanged tree
When adr-verify --relock runs
Then it appends a lock that records hasher 2, without --replace-hashes
```

### UC3-S2 [failure] A relock refuses a moved body [@spec] → `tests/test-lock.test.mjs::a relock of a frozen hasher-1 lock refuses a moved body`

```gherkin
Given the frozen hasher-1 lock and a locked body that has moved
When adr-verify --relock runs without --replace-hashes
Then it is refused, and the log is not edited
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | A lock records the hasher that took it. A lock with no hasher record was taken by hasher 1 — today's reading, its legacy readings included, encoding exactly the bytes it encodes today — and is compared with hasher 1's reading; every new lock is taken by hasher 2 and says so. | `tests/test-lock.test.mjs::a lock taken before the lexer is read as it was taken` | @spec | |
| F-2 | Where hasher 2 would read a hasher-1 lock's JavaScript file differently, `adr-lint` advises, naming `adr-verify --relock`, and blocks nothing; where both read it alike, it says nothing. | `tests/test-lock.test.mjs::a hasher-1 lock that hasher 2 reads differently is advised, naming the relock` | @spec | |
| F-3 | Hasher 2 differs from hasher 1 only on JavaScript-family files (`.js .mjs .cjs .jsx .ts .tsx .mts .cts`); every other language, PHP's Pest `test()` included, is named and hashed exactly as hasher 1 does. | `tests/test-lock.test.mjs::hasher 2 reads a non-JavaScript test file exactly as hasher 1 does` | @spec | |
| F-4 | Under hasher 2, a `test(`/`it(` that begins inside a string literal, template text, a regex literal or a comment is not a test of the file; one in code, including inside a template's `${…}`, is. | `tests/test-lock.test.mjs::hasher 2 counts a test only where its call is code` | @spec | |
| F-5 | Under hasher 2, a `/` divides after a value — an identifier (an operator keyword spelled after `.` is an identifier), a number, a closed string, template or regex, a postfix `++`/`--`, `]`, or a `)` that does not close an `if`/`while`/`for`/`with` header — and opens a regex after an operator (`=>` included), an opening bracket, `,`, `;`, an operator keyword, the label after `break`/`continue`, or a `)` closing such a header. Anywhere else its role is not established (F-7). | `tests/test-lock.test.mjs::hasher 2 reads a regex literal as a regex and a division as a division` | @spec | |
| F-6 | Under hasher 2, a template's `${…}` is code: braces in it nest, and strings and templates in it are literals of their own. | `tests/test-lock.test.mjs::hasher 2 reads a template's interpolation as code` | @spec | |
| F-7 | Where hasher 2 cannot establish the end of a literal or comment, or the role of a `/` (after `}`, or after a `>` that is not part of `=>` in a TypeScript-family file), every test whose head follows that point or whose body reaches it is UNPROVEN — never a prefix hash, never a guess. | `tests/test-lock.test.mjs::an unterminated literal leaves the tests after it unproven under hasher 2` | @spec | |
| F-8 | `adr-verify --relock` over a hasher-1 lock compares its bodies under hasher 1 and, when none moved, appends a lock taken by hasher 2 — no `--replace-hashes` needed. | `tests/test-lock.test.mjs::relock moves a hasher-1 lock to hasher 2 when nothing moved under hasher 1` | @spec | |
| F-9 | A lock naming a hasher this reader does not know is UNPROVEN and is never compared under another hasher (ADR-005; evidence: `plugin/lib/record.py:2405`, an unreadable lock is not an empty one). | `tests/test-lock.test.mjs::a lock naming a hasher this reader does not know is unproven` | @spec | |
| F-10 | Under hasher 2, a JavaScript-family body's digest strips comments and collapses whitespace with the lexer's reading, so a change after a nested template, or inside nested template text, moves the lock; hasher 1's digest is unchanged. | `tests/test-lock.test.mjs::under hasher 2 a change after a nested template moves the lock` | @spec | |
| F-11 | A lock taken by hasher 2 cannot be read by a reader that predates it: the 3.3.0 `decode_lock` returns nothing for it, which every 3.3.0 gate refuses as a lock it could not read — UNPROVEN — rather than comparing it under hasher 1. | `tests/test-lock.test.mjs::a lock taken by hasher 2 cannot be read by the 3.3.0 reader` | @spec | |

## Domain

A **lock** is a payload of `check`, `body` and `unproven` records and its sha256; a hasher-2 lock writes its
check record under a name that carries the hasher. A **hasher** is a versioned reading of a test file into
names, bodies and digests: hasher 1 is the reading every lock recorded before this spec was taken with;
hasher 2 reads JavaScript-family files with a lexer. A **relock** is a new lock row appended beside the
old, never a rewrite of it.

## Contracts Touched

Enumerated 2026-10-01 with `git grep -l -E 'encode_lock|decode_lock|test-lock-b64|snapshot_lock' -- plugin scripts tests` (11 files).

| Surface | Change | Consumers |
|---------|--------|-----------|
| Lock payload (`test-lock-b64`) | a hasher-2 lock names its hasher in its check record, so a reader that predates it cannot read it; a lock with a plain `check` record is hasher 1 | `plugin/lib/record.py` (`lock_findings`, `lock_blocks_done`, read by `adr-lint` and `adr-next`), `plugin/bin/adr-verify`, `scripts/test-locks.py`, `tests/relock-stress.py`, `tests/test-lock-stress.py`, `tests/gate-regressions.py`, and every installed plugin older than this change |
| `extract_test_names` / `extract_test_body` / `body_digest` | gain a hasher choice; hasher 1 stays byte-identical | `snapshot_lock`, `_legacy_digest`, `plugin/bin/spec-verify` |
| `adr-lint` advice | a new advisory line per hasher-1 lock hasher 2 reads differently | sessions reading the gate |

## Non-Goals

- Rewriting any recorded lock: records and logs are history (CLAUDE.md §10, §4); a record moves to hasher 2 only by an appended `--relock`.
- Changing how Python, Go, PHP, Rust, shell or Swift tests are read (F-3).
- A full JavaScript parser: the lexer decides strings, templates, regex literals and comments, and nothing about statements; JSX text and TypeScript generics are read as code, and a `/` whose role needs a parser is UNPROVEN (F-7).
- Changing `_js_like_code_positions` for Go, which shares its state machine.
- `adr-next` reporting the migration advice: it reports what blocks done, and advice is `adr-lint`'s to say (Grill Log row 13).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| An older install meets a hasher-2 lock | Med | Med | F-11: it cannot read it, so it refuses done as could-not-be-read until upgraded — a false refusal, never a false pass; named in the release notes |
| Classify-or-UNPROVEN leaves a real test unproven where a `/` follows `}` or a TypeScript `>` | Low | Low | F-7 names it; the session sees UNPROVEN at first red and can restructure, as BACKLOG §212's lesson already advises |
| The 12 records the regex-blind attempt broke lose names on relock | Med | Low | F-1 keeps them green unrelocked; F-2 says which; a relock is the maintainer's choice |

## Open Questions

## Verify

```bash
spec-verify --spec docs/specs/2026-10-01-a-lock-reads-javascript-as-javascript.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | How does an existing lock keep its meaning once the reading changes? | F-1 | Version + advise: a lock records its hasher; no record means hasher 1 |
| 2 | Does the gate say anything about a hasher-1 lock hasher 2 reads differently? | F-2 | Version + advise: it advises, naming the relock |
| 3 | Which languages does hasher 2 change? | F-3 | Accepted: JavaScript-family only |
| 4 | What does a reader do with a hasher it does not know? | F-9 | Scouted from ADR-005 and `record.py:2405`, not asked |
| 5 | Is a template's `${…}` code? | F-6 | Scouted from the owner's 2026-10-01 decision ("a lexer that knows … template interpolation"), not asked |
| 6 | Is a `test(` inside a template's `${…}` a test of the file? | F-4 | Yes: `${…}` is code (owner, 2026-10-01) |
| 7 | Which rule decides regex versus division? | F-5 | Accepted as first written (owner, 2026-10-01); amended in row 12 |
| 8 | What does an unterminated literal do to the tests? | F-7 | Later tests UNPROVEN, earlier ones stay hashed (owner, 2026-10-01) |
| 9 | How does a record move to hasher 2? | F-8 | `--relock` verifies under hasher 1 and writes hasher 2, no `--replace-hashes` (owner, 2026-10-01) |
| 10 | Codex review: an older install read a hasher-2 lock as hasher 1 and passed a vanished test. How do hasher-2 locks look to old readers? | F-11 | Unreadable to them, so they refuse done as could-not-be-read (owner, 2026-10-01) |
| 11 | Codex review: `body_digest` strips comments with hasher 1's scanner. Does hasher 2 own the digest too? | F-10 | Yes (owner, 2026-10-01) |
| 12 | Codex review: F-5's token rule misreads `{} / …`, `obj.in / …`, `break outer` then a regex, and TypeScript `f<number> / 3`. Amend how? | F-5 | Classify where context decides, UNPROVEN elsewhere (owner, 2026-10-01); F-7 widened to an unplaceable `/` |
| 13 | Codex review: UC-2 promised advice from `adr-next` too, which discards advice. Which gates advise? | F-2 | `adr-lint` only (owner, 2026-10-01) |
