# Spec: A locked test body is not rewritten

> **Date:** 2026-09-12 · **Status:** Ready-for-ADR
> **Owner:** zy · **Becomes:** ADR-050
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** plugin/lib/record.py (`acceptance_digest`, CRLF→LF, `TEST_HASH_REQUIRED_FROM`), plugin/bin/adr-lint (`test_body`, `code_only`, `check_tests_can_fail`, `check_mutation_evidence`, `MUTATION_REQUIRED_FROM`, `DURATION_REQUIRED_FROM`), plugin/bin/adr-verify (Verification Log writer, `fenceTimeout`), plugin/scripts/lifecycle.mjs (`declaredCheckCommand`, `check`, `strictFrom`), docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-016-a-mutant-earns-its-verdict.md, docs/adr/ADR-020-a-run-leaves-a-trace-outside-the-file.md (external ledger does not ship), docs/adr/ADR-022-a-fence-names-what-its-claim-rests-on.md (hand-filled proof tables refused), CLAUDE.md §4 §16, plugin/skills/adr-execute/SKILL.md (TDD red), docs/TUTORIALS.md (mutant survived on a vacuous test), tests/test-lock.test.mjs, tests/gates.test.mjs (`a CRLF checkout is not tampering`)



## Problem

An executing agent rewrites an existing test's assertions so a new product shape goes green. `acceptance-sha256` hashes the Acceptance **command**, not the test body (`plugin/lib/record.py`). Invert `expectExit(2)` to `1`, keep the same `node --test --test-name-pattern` line, and `done` still matches. Mutation `survived` catches a test that cannot fail; it does not catch a test rewritten to the new shape.

## Goal

The first TDD-red Verification Log row records a tool-written SHA-256 of every test body `test_body` can extract from each Tests-table File, and of a declared `.quality-harness.json` `check` string or its absence. `done` is refused when any of those hashes moved or vanished, when a named Tests-table body cannot be extracted or read, when a later red presents a different hash, or when a `check` key appears after recorded absence. New test names in those files are allowed.


## Actors

| Actor | Kind | Goal |
|-------|--------|------|
| executing agent | human role | close a task; must not satisfy it by rewriting the locked test |
| adr-verify | system | write per-test body hashes on the first TDD-red Verification Log row |
| adr-lint | system | refuse `done` when a locked body no longer matches that red row |
| adr-next | system | `is_done` uses the same first-red hashes as adr-lint |
| Tests table | system | name which tests are in the lock (file + name); not a place to type hashes |
| `.quality-harness.json` | system | declare `check` / `strictFrom` / `fenceTimeout`; a declared `check` is locked at first-red |

## Use Cases

### UC-1: A task cannot go `done` after its locked tests were rewritten

- **Trigger:** `adr-verify` records a non-zero (TDD-red) Verification Log row, then production code is written, then `adr-lint` is asked to accept `done` · **Preconditions:** the task names tests in `## Tests`; the red run happened
- **Main flow:**
  1. `adr-verify` extracts each Tests-table body (`test_body` of File + name) and writes a tool-written hash for each onto the first TDD-red row.
  2. Production code is changed. The test bodies are not.
  3. A later exit-0 Verification Log row is recorded. `adr-lint` recomputes the hashes from disk and allows `done` only if they match the first-red row.
- **Failure paths:**
  - a. between 1 and 3, an assertion in a named test is rewritten (expected exit, match pattern, or the dirty control dropped) → `adr-lint` refuses `done`; a later red whose hashes match the rewritten bodies does not unlock it.
  - b. at step 1, hashes are omitted or hand-typed into the Tests table → that is not the lock; `done` is refused (no tool-written first-red hashes), not treated as "nothing to check".
- **Postconditions:** the first-red bodies are the contract. Changing them is a new task or a named Invalidates.

### UC-2: A named test that cannot be hashed is UNPROVEN, not a skip

- **Trigger:** `adr-verify` at first-red or `adr-lint` at `done` cannot extract a Tests-table body (`test_body` returns none) or cannot read the File · **Preconditions:** F-1
- **Main flow:**
  1. The gate names the Tests-table row and the reason it could not look (missing function, unreadable file, parse miss).
  2. `adr-verify` writes no matching hash for that row.
  3. `adr-lint` refuses `done`. The lock is not skipped.
- **Failure paths:**
  - a. at step 3, skip the lock when `test_body` is none → rename or empty the test, `done` passes (the cheat F-2 closes).
  - b. at step 3, report the miss as an ordinary finding about the test → could-not-look spoken as a verdict (ADR-005).
- **Postconditions:** could-not-look is refuse-`done`. A later extract of a different body does not fill in for the miss.

### UC-3: Legacy done without hashes is advised until the cutover, refused after

- **Trigger:** `adr-lint` reads a `done` task whose Verification Log has no test-sha256 · **Preconditions:** F-1
- **Main flow:**
  1. If the log row's date is before `TEST_HASH_REQUIRED_FROM`, `adr-lint` advises and does not refuse `done` for this reason.
  2. If the date is on or after that constant, missing first-red hashes refuse `done` (F-1 / F-2).
- **Failure paths:**
  - a. at step 1, refuse legacy rows → the existing corpus goes red on day one.
  - b. at step 2, advise after the cutover → the lock is opt-out by omitting the field (ADR-020 issue #4).
- **Postconditions:** one shared date constant. The calendar day is set when the executing change lands.

### UC-4: A sibling test in a Tests-table File is locked even if the table omitted it

- **Trigger:** a Tests-table File contains tests other than the named rows · **Preconditions:** F-1; `test_body` can extract those names at first-red
- **Main flow:**
  1. At first-red, `adr-verify` snapshots every name it can extract in each Tests-table File.
  2. At `done`, a name present in that snapshot whose body hash moved or vanished refuses `done`.
  3. A name that did not exist at first-red is allowed (new test).
- **Failure paths:**
  - a. at step 2, only named rows are locked → invert a sibling and omit it from the table.
  - b. at step 3, any added name refuses `done` → TDD cannot add the dirty control in the same file.
- **Postconditions:** the cheat is not "leave it off the table". Tests-table rows still F-2 if they cannot be extracted.

### UC-5: A declared project check is not rewritten to a weaker command

- **Trigger:** `.quality-harness.json` has a non-empty `check` string at first-red · **Preconditions:** F-5 (closed keys); F-1
- **Main flow:**
  1. `adr-verify` records that `check` string on the first TDD-red row.
  2. At `done`, `adr-lint` re-reads the file. The string must be the same.
- **Failure paths:**
  - a. at step 2, rewrite `check` to a command that no longer runs the locked tests (`true`, `echo ok`, a narrower suite) → `done` refused.
  - b. at step 2, delete `check` so inferred rungs win → `done` refused.
- **Postconditions:** `strictFrom` and `fenceTimeout` are not this lock. Absence at first-red is UC-8 / F-9, not a skip of this lock.


### UC-8: An absent check stays absent until a new task

- **Trigger:** `.quality-harness.json` has no `check` (or an empty/ignored value) at first-red · **Preconditions:** F-5; F-9
- **Main flow:**
  1. `adr-verify` records that `check` was absent.
  2. At `done`, it is still absent. `done` is not refused for this reason.
- **Failure paths:**
  - a. at step 2, add any `check` string (`true`, a narrower suite, even a stronger command) → `done` refused. Introducing a command is a new task.
- **Postconditions:** absence is a lock value, not "nothing to check".


### UC-6: Format-only edits are not inversion; assertion edits are

- **Trigger:** a locked test file is saved after first-red · **Preconditions:** F-1; F-7
- **Main flow:**
  1. The hash is SHA-256 of `code_only(test_body)` after CRLF→LF (`adr-lint` already owns both helpers; `acceptance_digest` already normalizes line endings).
  2. A comment-only or whitespace-only change leaves the hash stable. `done` is not refused for that reason.
  3. An assertion change moves the hash. `done` is refused.
- **Failure paths:**
  - a. at step 2, hash the raw body → a format-only save refuses `done`.
  - b. at step 3, `code_only` strips string literals that are the assertion → a real inversion is invisible.
- **Postconditions:** a CRLF checkout is not inversion. `check` string lock (F-6) is still exact string match after the existing trim.

### UC-7: Writer, done, and is_done share one reading of the lock

- **Trigger:** a task has a first-red Verification Log row · **Preconditions:** F-1; F-8
- **Main flow:**
  1. `adr-verify` writes hashes through the shared function in `plugin/lib/record.py`.
  2. `adr-lint` `done` and `adr-next` `is_done` parse and recompute through that same function.
- **Failure paths:**
  - a. at step 2, `adr-next` keeps a local `is_done` that ignores test hashes → `work-next` offers a task `adr-lint` refuses.
  - b. at step 1, `adr-lint` reimplements `code_only`/`test_body` hashing → writer and verifier disagree (ADR-045).
- **Postconditions:** one grammar, one hash, three call sites.




## Scenarios

### UC1-S1 [happy] first-red hashes still match at done [@implemented] → `tests/test-lock.test.mjs::first-red hashes still match at done` cmd:`node --test --test-name-pattern 'first-red hashes still match at done' tests/test-lock.test.mjs`


```gherkin
Given a task whose Tests table names a test and whose first Verification Log row is TDD-red with tool-written body hashes
When the product is changed and the named test bodies are byte-stable
Then adr-lint permits done if the other done obligations also hold
```

### UC1-S2 [failure] rewriting a locked assertion refuses done [@implemented] → `tests/test-lock.test.mjs::rewriting a locked assertion refuses done` cmd:`node --test --test-name-pattern 'rewriting a locked assertion refuses done' tests/test-lock.test.mjs`


```gherkin
Given a first TDD-red row that hashed a test asserting expectExit 2 (or an equivalent dirty control)
When that assertion is rewritten so the new product goes green (expectExit 1, dropped match, or a later red of the rewritten body)
Then adr-lint refuses done and names the locked test whose hash moved
```

### UC2-S1 [happy] every named body extracts and is hashed [@implemented] → `tests/test-lock.test.mjs::first TDD-red row carries a tool-written hash for each named test` cmd:`node --test --test-name-pattern 'first TDD-red row carries a tool-written hash' tests/test-lock.test.mjs`


```gherkin
Given a task whose Tests table names tests that `test_body` can extract
When adr-verify records the first TDD-red row
Then that row carries a tool-written hash for each named test
```

### UC2-S2 [failure] missing or unreadable named test refuses done [@implemented] → `tests/test-lock.test.mjs::missing or unreadable named test refuses done as UNPROVEN` cmd:`node --test --test-name-pattern 'missing or unreadable named test refuses done as UNPROVEN' tests/test-lock.test.mjs`


```gherkin
Given a Tests-table row whose File cannot be read, or whose name `test_body` cannot extract
When adr-verify is asked for first-red or adr-lint is asked for done
Then done is refused as UNPROVEN; the lock is not skipped
```

### UC3-S1 [happy] pre-cutover done without hashes is advised [@implemented] → `tests/test-lock.test.mjs::pre-cutover done without hashes is advised` cmd:`node --test --test-name-pattern 'pre-cutover done without hashes is advised' tests/test-lock.test.mjs`


```gherkin
Given a done task whose Verification Log date is before TEST_HASH_REQUIRED_FROM and whose rows carry no test-sha256
When adr-lint runs
Then it exits 0 and advises; done is not refused for the missing hashes
```

### UC3-S2 [failure] post-cutover done without first-red hashes is refused [@implemented] → `tests/test-lock.test.mjs::post-cutover done without first-red hashes is refused` cmd:`node --test --test-name-pattern 'post-cutover done without first-red hashes is refused' tests/test-lock.test.mjs`


```gherkin
Given a done task whose Verification Log date is on or after TEST_HASH_REQUIRED_FROM and whose rows carry no first-red test-sha256
When adr-lint runs
Then it refuses done; advising instead would make the lock optional by omission
```

### UC4-S1 [happy] a new test name in the same file does not refuse done [@implemented] → `tests/test-lock.test.mjs::a new test name in the same file does not refuse done` cmd:`node --test --test-name-pattern 'a new test name in the same file does not refuse done' tests/test-lock.test.mjs`


```gherkin
Given first-red hashed every extractable name in a Tests-table File
When a new test name is added and the previously hashed names are unchanged
Then adr-lint permits done if the other done obligations also hold
```

### UC4-S2 [failure] rewriting a sibling not listed in the Tests table refuses done [@implemented] → `tests/test-lock.test.mjs::rewriting a sibling not listed in the Tests table refuses done` cmd:`node --test --test-name-pattern 'rewriting a sibling not listed in the Tests table refuses done' tests/test-lock.test.mjs`


```gherkin
Given a test name that existed in a Tests-table File at first-red but was not a Tests-table row
When that sibling's assertion is rewritten so the new product goes green
Then adr-lint refuses done and names the sibling whose hash moved or vanished
```

### UC5-S1 [happy] a declared check string unchanged at done [@implemented] → `tests/test-lock.test.mjs::a declared check string unchanged at done is allowed` cmd:`node --test --test-name-pattern 'a declared check string unchanged at done is allowed' tests/test-lock.test.mjs`


```gherkin
Given `.quality-harness.json` declared check at first-red and that string was recorded
When the product and tests change but the check string is unchanged
Then adr-lint permits done if the other done obligations also hold
```

### UC5-S2 [failure] rewriting or deleting check refuses done [@implemented] → `tests/test-lock.test.mjs::rewriting or deleting check refuses done` cmd:`node --test --test-name-pattern 'rewriting or deleting check refuses done' tests/test-lock.test.mjs`


```gherkin
Given a declared check string hashed at first-red
When that string is rewritten to a weaker command, or the key is deleted so an inferred command wins
Then adr-lint refuses done
```

### UC6-S1 [happy] a comment-only or whitespace-only edit does not refuse done [@implemented] → `tests/test-lock.test.mjs::a comment-only or whitespace-only edit does not refuse done` cmd:`node --test --test-name-pattern 'a comment-only or whitespace-only edit does not refuse done' tests/test-lock.test.mjs`


```gherkin
Given first-red hashed code_only of a locked test after CRLF to LF
When only comments or whitespace in that body change
Then adr-lint permits done if the other done obligations also hold
```

### UC6-S2 [failure] an assertion edit still refuses done [@implemented] → `tests/test-lock.test.mjs::an assertion edit still refuses done` cmd:`node --test --test-name-pattern 'an assertion edit still refuses done' tests/test-lock.test.mjs`


```gherkin
Given the same first-red hashes
When an assertion in a locked body changes (expected exit, match pattern, or dirty control dropped)
Then adr-lint refuses done
```

### UC7-S1 [happy] writer, done, and is_done agree on the same hashes [@implemented] → `tests/test-lock.test.mjs::writer, done, and is_done agree on the same hashes` cmd:`node --test --test-name-pattern 'writer, done, and is_done agree on the same hashes' tests/test-lock.test.mjs`


```gherkin
Given a first-red row with tool-written hashes written by adr-verify
When adr-lint judges done and adr-next computes is_done against the same task file
Then both read the same first-red hashes as the writer produced
```

### UC7-S2 [failure] a local copy that skips the lock is not done [@implemented] → `tests/test-lock.test.mjs::is_done refuses when a locked hash moved` cmd:`node --test --test-name-pattern 'is_done refuses when a locked hash moved' tests/test-lock.test.mjs`


```gherkin
Given adr-lint refuses done because a locked hash moved
When adr-next is_done used a second parser that ignored those hashes
Then that split is the defect: is_done must refuse too
```

### UC8-S1 [happy] still-absent check at done is allowed [@implemented] → `tests/test-lock.test.mjs::still-absent check at done is allowed` cmd:`node --test --test-name-pattern 'still-absent check at done is allowed' tests/test-lock.test.mjs`


```gherkin
Given no check was declared at first-red and that absence was recorded
When done is requested and check is still absent
Then adr-lint does not refuse done for this reason
```

### UC8-S2 [failure] introducing check after first-red refuses done [@implemented] → `tests/test-lock.test.mjs::introducing check after first-red refuses done` cmd:`node --test --test-name-pattern 'introducing check after first-red refuses done' tests/test-lock.test.mjs`


```gherkin
Given no check was declared at first-red
When a check string is added before done (including check: true)
Then adr-lint refuses done
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | The first TDD-red Verification Log row records a tool-written SHA-256 of each Tests-table test body. `done` is refused when any of those bodies now hashes differently. A later red with a different hash does not replace the contract. Changing a locked test is a new task (or a named Invalidates), not a rewrite. Hashes are not a hand-filled Tests-table column and not a second ledger file. | `tests/test-lock.test.mjs::rewriting a locked assertion refuses done` | @implemented | `node --test --test-name-pattern 'rewriting a locked assertion refuses done' tests/test-lock.test.mjs` |
| F-2 | If a Tests-table body cannot be extracted, or its file cannot be read, at first-red or at `done`, that is could-not-look: `adr-verify` writes no matching hash, `adr-lint` refuses `done`. It does not skip the lock. The report is UNPROVEN, not a finding about the test. | `tests/test-lock.test.mjs::missing or unreadable named test refuses done as UNPROVEN` | @implemented | `node --test --test-name-pattern 'missing or unreadable named test refuses done as UNPROVEN' tests/test-lock.test.mjs` |
| F-3 | Legacy `done` tasks whose Verification Log predates a named cutover constant (`TEST_HASH_REQUIRED_FROM`) are not refused for missing test-sha256; `adr-lint` advises. From that date, `done` without first-red hashes is refused. One constant, shared by `adr-lint` / `adr-verify` / `adr-next`, same shape as `MUTATION_REQUIRED_FROM`. The calendar day is set when the executing change lands. | `tests/test-lock.test.mjs::post-cutover done without first-red hashes is refused` | @implemented | `node --test --test-name-pattern 'post-cutover done without first-red hashes is refused' tests/test-lock.test.mjs` |
| F-4 | The lock is every test name that already existed in a Tests-table File at first-red, not only the named rows. New names in that file are allowed. Rewriting or deleting an existing name refuses `done`. | `tests/test-lock.test.mjs::rewriting a sibling not listed in the Tests table refuses done` | @implemented | `node --test --test-name-pattern 'rewriting a sibling not listed in the Tests table refuses done' tests/test-lock.test.mjs` |
| F-5 | This spec does not add a hooks / rules / depends-on / blocks / learn-on-the-go DSL. `.quality-harness.json` stays a closed JSON of keys the gates already read (`check`, `strictFrom`, `fenceTimeout`). Unknown keys remain ignored, not executed as learned instructions. | `tests/test-lock.test.mjs::unknown keys in quality-harness json are not a lock` | @implemented | `node --test --test-name-pattern 'unknown keys in quality-harness json are not a lock' tests/test-lock.test.mjs` |
| F-6 | If the project declares `check` in `.quality-harness.json`, that string is locked at first-red. Rewriting it to a weaker command, or deleting it so inference wins, refuses `done`. | `tests/test-lock.test.mjs::rewriting or deleting check refuses done` | @implemented | `node --test --test-name-pattern 'rewriting or deleting check refuses done' tests/test-lock.test.mjs` |
| F-7 | The body hash is SHA-256 of `code_only(test_body)` after CRLF→LF. Comment-only or whitespace-only edits do not refuse `done`. Assertion edits still do. | `tests/test-lock.test.mjs::a comment-only or whitespace-only edit does not refuse done` | @implemented | `node --test --test-name-pattern 'a comment-only or whitespace-only edit does not refuse done' tests/test-lock.test.mjs` |
| F-8 | `adr-verify` (writer), `adr-lint` (`done`), and `adr-next` (`is_done`) share one function for first-red hashes. A third copy that disagrees is the defect ADR-045 already paid for. The function lives in `plugin/lib/record.py` beside `acceptance_digest`. | `tests/test-lock.test.mjs::writer, done, and is_done agree on the same hashes` | @implemented | `node --test --test-name-pattern 'writer, done, and is_done agree on the same hashes' tests/test-lock.test.mjs` |
| F-9 | If no `check` was declared at first-red, introducing one before `done` is refused. First-red records absence; a later `check` string is the same cheat as deleting a declared command. | `tests/test-lock.test.mjs::introducing check after first-red refuses done` | @implemented | `node --test --test-name-pattern 'introducing check after first-red refuses done' tests/test-lock.test.mjs` |









## Domain

**First-red lock** — the first non-zero Verification Log row that `adr-verify` wrote for the task. **test-sha256** — SHA-256 of `code_only(test_body)` after CRLF→LF. **File lock** — every test name `test_body` extracted from a Tests-table File at first-red, not only the named rows. **check lock** — the `.quality-harness.json` `check` string when one was declared at first-red, or recorded absence when none was (F-9). **`TEST_HASH_REQUIRED_FROM`** — one date constant shared by adr-lint / adr-verify / adr-next; the calendar day is set when the executing change lands. **One reader** — `plugin/lib/record.py` is the only implementation of hash and first-red parse (F-8). **Verification Log** is the ledger that ships (ADR-020: an external run ledger does not). Invariants live in Facts.







## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| Verification Log row grammar | add tool-written per-test body hashes on the first TDD-red row | adr-verify (writer), adr-lint (`done`), adr-next (`is_done`) |
| `adr-lint` `done` | refuse when a locked body hash moved, when a named body cannot be hashed, or when first-red hashes are absent on or after `TEST_HASH_REQUIRED_FROM`; advise when they are absent before that date | executing agents, CI |
| `plugin/lib/record.py` | owns hashing and first-red parse for all three gates (F-8), beside `acceptance_digest` | adr-verify, adr-lint, adr-next |


| Tests table | still names File+name for Covers / existence; the lock hashes `code_only(test_body)` after CRLF to LF | adr-lint `test_body`, `code_only` |

| `.quality-harness.json` | no new keys; declared `check` locked (F-6); absence at first-red is locked (F-9) | lifecycle `declaredCheckCommand`, adr-lint `done`, adr-verify first-red |





## Non-Goals

- A new external ledger file, output digest, or run cross-check — ADR-020 refused those; this extends the Verification Log that already ships.
- Hashing the Acceptance fence command — `acceptance-sha256` already does that; it is not this defect.
- Mutation `survived` as the inversion detector — it already catches a vacuous test; this is a rewritten assertion that still fails when the product is broken a different way.
- Hand-filled hashes in `## Tests` or a revived `## Mutants` table — ADR-022: self-declared proof.
- A hooks / rules / depends-on / blocks / learn-on-the-go DSL in `.quality-harness.json` — F-5: the file stays the closed JSON the gates already read.
- Compiling the shipped gates into static binaries so an agent cannot edit quality-harness files to pass tests — later spec; the rationale is this same inversion class applied to the checker, not the tests.


## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `test_body` cannot extract a named test | Med | High (lock fail-open) | F-2: refuse `done` as UNPROVEN |
| Existing `done` tasks have no test-sha256 | High | High (corpus goes red) | F-3: advise before `TEST_HASH_REQUIRED_FROM`; refuse from that date |

| Agent inverts a test not listed in the Tests table | Med | High | F-4: lock every name that existed in a Tests-table File at first-red |


## Open Questions

<!-- Empty. User said enough 2026-09-12. F-1–F-9 bound in tests/test-lock.test.mjs. Cutover is 2026-09-13. Leftovers stay Non-Goals. -->








## Verify

```bash
python3 plugin/bin/spec-verify --implemented docs/specs/2026-09-12-a-locked-test-body-is-not-rewritten.md

```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | An existing test's assertion is not rewritten to match a new implementation; the first TDD-red row hashes each Tests-table body and later red does not replace that contract. | F-1 | accept — hashes live on the Verification Log, not a second file; not a hand-filled Tests column |
| 2 | If a named body cannot be extracted or read, is that refuse-done / UNPROVEN or a skip? | F-2 | accept — skip is the rename-the-test cheat; UNPROVEN not a verdict |
| 3 | Legacy done without hashes: advise or refuse? | F-3 | accept — advise before a named cutover constant; refuse from that date; calendar day set when the code lands |
| 4 | Does the lock cover every pre-existing test in a Tests-table File, or only the named rows? | F-4 | accept — every name that existed in those files at first-red; new names allowed; rewrite or delete of an existing name refuses done |
| 5 | Does `.quality-harness.json` grow a hooks/rules/depends-on/blocks/learn-on-the-go DSL? | F-5 | accept — closed keys only (`check`, `strictFrom`, `fenceTimeout`); unknown keys stay ignored. Static binaries of the shipped gates are a later spec (agents must not edit quality-harness files to pass tests). |
| 6 | After first-red, is rewriting `.quality-harness.json` `check` to a weaker command refused done? | F-6 | accept — declared `check` string is locked; rewrite or delete (so inference wins) refuses done |
| 7 | Is the body hash of code_only(test_body) after CRLF to LF, or of the raw body? | F-7 | accept — code_only after CRLF to LF; comment/whitespace-only edits do not refuse done; assertion edits still do |
| 8 | Do adr-verify, adr-lint, and adr-next share one reading of the first-red hashes? | F-8 | accept — one function in plugin/lib/record.py beside acceptance_digest; a third copy is the ADR-045 defect |
| 9 | If no check was declared at first-red, is introducing one before done refused? | F-9 | accept — first-red records absence; a later check string is the same cheat as deleting a declared command |








