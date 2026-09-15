# Spec: A Go raw string is not C-escaped

> **Date:** 2026-09-15 · **Status:** Ready-for-ADR
> **Owner:** zy · **Becomes:** ADR-054
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** plugin/lib/record.py (`_mask_lock_noncode`, `extract_test_body`, `snapshot_lock`), plugin/bin/adr-lint (`scan_code_only`, `code_only`, `FAIL_CALLS`, `check_tests_can_fail`), plugin/scripts/lifecycle.mjs (`PUBLISH_SUFFIX`, `publishPrecededByValidation`), docs/adr/ADR-050-a-locked-test-body-is-not-rewritten.md, docs/adr/ADR-052-an-explicit-relock-is-not-a-later-red.md, docs/adr/ADR-053-a-false-advisory-is-not-a-finding.md, docs/BACKLOG.md §208, tests/swift-expect.test.mjs, tests/test-lock.test.mjs, tests/leftovers-after-adr053.test.mjs, tests/adr053-stress.mjs (untracked draft; not the suite)

## Problem

Four leftovers after ADR-053 still fail open on 2.99.4. The hasher treats `\` inside Go backticks as a C escape, so a raw string ending in `\` never closes and later `func Test*` bodies are UNPROVEN (inbox `c69249d9…`; measured: names found, bodies `None`; lint `scan_code_only` already keeps those funcs). `code_only` keeps `#expect` / `#require` for every `hash_comments` language; PHP `#expect a result here` is a fail word (`FAIL_CALLS` true). T1 wrappers are bare words: `pnpm check && sudo -n git commit` advises. `tests/adr053-stress.mjs` is untracked; its oracle copies bare wrappers and a mutant `--from` still names `[\s\S]*$`.

## Goal

A `.go` lock hashes bodies through a raw backtick; `#expect` / `#require` stay code only for Swift; a recognised check joined to `git commit`/`git push` still strips when T1 wrappers carry flags or assignments that invoke git; a shipped stress driver whose pools can generate those members proves the class.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| adopting engineer | human role | a Go Tests row, a Swift `#expect` body, and `sudo -n git commit` after a check are not false findings |
| hasher (`snapshot_lock`) | system | extract Go test bodies when a raw string contains `\` |
| `code_only` / `check_tests_can_fail` | system | Swift Testing macros are failure calls; other languages' `#expect` comments are not |
| PreToolUse (`publishPrecededByValidation`) | system | strip a trailing publish that is wrapped, including wrapper args that still invoke git |
| stress driver | system | generate the class from source-enumerated pools; kill hand mutants; stay green unmutated |
| `adr-verify --relock` | system | fill hasher-visible UNPROVEN without rewriting first-red |

## Use Cases

### UC-1: Hasher extracts a Go body whose raw string ends in a backslash

- **Trigger:** `snapshot_lock` / `extract_test_body(..., go=True)` on a `.go` Tests file · **Preconditions:** the file is hashed as Go
- **Main flow:**
  1. A backtick string is raw: `\` is content; the next backtick closes it.
  2. A later comment backtick is not a closer. `dir/*.go` in a comment is not code; `/*` in that comment does not swallow later `func Test*`.
  3. Named tests in that file have extractable bodies (not UNPROVEN for this reason).
- **Failure paths:**
  - a. at step 1, the default quote loop C-escapes backticks (live defect at `record.py:1085–1087`) → the string never closes; later tests UNPROVEN; F-1 freezes the map.
  - b. at step 1, the same loop is changed for every language → a JS template `` `dir\`` `` no longer treats `\` as escape.
- **Postconditions:** Go raw backticks match lint `scan_code_only`'s raw-string state. JS templates hashed without `go=True` still C-escape. Reuse the existing language flags on `_mask_lock_noncode` (`rust_raw`, `swift`); do not invent a second scanner.

### UC-2: `#expect` / `#require` stay code only for Swift

- **Trigger:** `check_tests_can_fail` strips a Tests-table body · **Preconditions:** ADR-053 T5
- **Main flow:**
  1. For a `.swift` file, `#expect(...)` / `#require(...)` survive `code_only` and `FAIL_CALLS` sees them. An `#expect`-only `@Test` is not "calls nothing and asserts nothing".
  2. For other `hash_comments` languages, `#expect` / `#require` after `#` are comments.
  3. An empty Swift body still blocks.
- **Failure paths:**
  - a. at step 2, keep is global (live defect: `code_only` always `hash_comments=True` for non-Python) → PHP `#expect a result here` is a fail word.
  - b. at step 1, keep is removed → Swift `#expect`-only BLOCKS again (ADR-053 T5 regress).
- **Postconditions:** `tests/swift-expect.test.mjs` stays first-red locked; a suffix-keyed keep must not rewrite that test body. `#[` (Rust attribute) still does not start a hash comment.

### UC-3: T1 wrappers keep their arguments when they still invoke git

- **Trigger:** PreToolUse on Bash `git commit` / `git push` · **Preconditions:** ADR-053 T1; prefix is a recognised check joined by `&&` or a newline
- **Main flow:**
  1. Strip trailing publish when it is `git commit`/`git push`, optionally preceded by T1 wrapper words `command|env|sudo|exec|time` and those words' flags/assignments that still **invoke** git (`sudo -n`, `sudo -n -u ci`, `env FOO=bar`, `env -u HOME FOO=bar`, `command --`, `time -p`).
  2. Do not print "Nothing has verified the work".
  3. Do not classify the whole compound as `validation`.
- **Failure paths:**
  - a. at step 1, wrappers are bare words only (live defect) → `sudo -n git commit` advises after `pnpm check`.
  - b. at step 1, `command -v git commit` strips → a path lookup is treated as publish.
  - c. at step 1, `nice` / `nohup` / `stdbuf` join the word list without a task → T1's measured set is widened past Decision.
  - d. at step 3, `||` / `;` / `|` strip → a check that did not gate the publish is trusted (ADR-053 T1).
- **Postconditions:** bare `sudo git commit` still strips. `git add -A && git commit` still advises when unpublished work exists.

### UC-4: A shipped stress driver proves the class

- **Trigger:** the repository gate runs the stress driver · **Preconditions:** F-1, F-2, F-3 decided
- **Main flow:**
  1. Oracle is this spec and ADR-053 T1 Decision, not the current code.
  2. Pools are enumerated from source (command in the file header). They can generate F-1 (Go raw `\` then a later comment backtick), F-2 (Swift keep vs PHP comment), F-3 (wrapper-with-args; `command -v` as non-invocation; silent `&&`/newline vs loud `||`;`;`|`).
  3. Unmutated run is green. Hand mutants (re-enable hasher `\`-escape inside Go backticks; drop wrapper-arg stripping; keep `#expect` on PHP) go red. A mutant that does not parse is INCONCLUSIVE.
- **Failure paths:**
  - a. at step 2, pools are the 2026-09-14 untracked draft (bare wrappers; no Go raw `\` member; mutant `--from` still `[\s\S]*$`) → a green run has not proven this spec.
  - b. at step 3, no unmutated baseline → non-zero is read as a kill (stress-testing v3).
  - c. at step 1, the oracle transcribes `PUBLISH_SUFFIX` / the quote loop → it reproduces the bugs.
- **Postconditions:** the untracked draft is rewritten or replaced; it is not committed as-is. Default iterations stay cheap for CI; a deeper run is env-documented.

### UC-5: A hasher that can now see a Go body does not rewrite first-red

- **Trigger:** `adr-verify` on a log that recorded UNPROVEN names the hasher can now extract · **Preconditions:** ADR-050 F-1; ADR-052 `--relock`
- **Main flow:**
  1. Ordinary `adr-verify` does not rewrite the committed first-red map.
  2. `python3 plugin/bin/adr-verify --relock` fills unproven the hasher can now see.
- **Failure paths:**
  - a. at step 1, `--replace-hashes` without `--relock` is accepted → a hasher upgrade silently rewrites the contract.
- **Postconditions:** `--replace-hashes` remains a different path (ADR-050 F-1, ADR-052). Inbox workaround of rewriting hashes is not the product.

## Scenarios

### UC1-S1 [happy] a Go raw string ending in backslash still hashes later tests [@implemented] → `tests/leftovers-after-adr053.test.mjs::a Go raw string ending in backslash still hashes later tests` cmd:`node --test --test-name-pattern 'a Go raw string ending in backslash still hashes later tests' tests/leftovers-after-adr053.test.mjs`

```gherkin
Given a .go Tests file whose first test contains a raw string whose last content byte is `\`
And a later line comment contains a backtick and `dir/*.go`
And a later `func TestB` body calls `t.Fatal`
When snapshot_lock extracts TestA and TestB
Then both bodies are extractable
And TestB is not UNPROVEN for this reason
```

### UC1-S2 [failure] C-escaping Go backticks leaves later tests UNPROVEN; JS templates still escape [@implemented] → `tests/leftovers-after-adr053.test.mjs::C-escaping Go backticks leaves later tests UNPROVEN; JS templates still escape` cmd:`node --test --test-name-pattern 'C-escaping Go backticks leaves later tests UNPROVEN; JS templates still escape' tests/leftovers-after-adr053.test.mjs`

```gherkin
Given the shared quote loop C-escapes `\` inside JS templates
When `_mask_lock_noncode` is asked about `` `dir\`` `` without go=True
Then the template still closes on the escaped backtick
And a Go-only raw flag must not turn that loop into "backticks never C-escape"
```

### UC2-S1 [happy] a Swift #expect-only test is not dead [@implemented] → `tests/swift-expect.test.mjs::Swift #expect is a failure call so an expect-only test is not dead` cmd:`node --test --test-name-pattern 'Swift #expect is a failure call so an expect-only test is not dead' tests/swift-expect.test.mjs`

```gherkin
Given a .swift Tests file whose @Test body is only `#expect(2 == 2)`
When check_tests_can_fail runs
Then it does not block "calls nothing and asserts nothing"
And an empty @Test body still blocks
```

### UC2-S2 [failure] a PHP #expect comment is not a fail word [@implemented] → `tests/leftovers-after-adr053.test.mjs::a PHP #expect comment is not a fail word` cmd:`node --test --test-name-pattern 'a PHP #expect comment is not a fail word' tests/leftovers-after-adr053.test.mjs`

```gherkin
Given a .php Tests file whose body is `#expect a result here` and no other fail call
When check_tests_can_fail runs
Then FAIL_CALLS does not treat that comment as a failure call
And the body is "calls nothing and asserts nothing" (or equivalent block)
```

### UC3-S1 [happy] sudo -n after a check still strips [@implemented] → `tests/leftovers-after-adr053.test.mjs::sudo -n after a check still strips` cmd:`node --test --test-name-pattern 'sudo -n after a check still strips' tests/leftovers-after-adr053.test.mjs`

```gherkin
Given `isValidationCommand('pnpm check')` is true
When publishPrecededByValidation is asked about `pnpm check && sudo -n git commit -m x`
And about `pnpm check && env FOO=bar git push`
And about `pnpm check && command -- git commit -m x`
And about `pnpm check && time -p git commit -m x`
Then each is true
And `pnpm check && sudo git commit -m x` stays true
```

### UC3-S2 [failure] command -v is not a publish; loud joiners still advise [@implemented] → `tests/leftovers-after-adr053.test.mjs::command -v is not a publish; loud joiners still advise` cmd:`node --test --test-name-pattern 'command -v is not a publish; loud joiners still advise' tests/leftovers-after-adr053.test.mjs`

```gherkin
Given `isValidationCommand('pnpm check')` is true
When publishPrecededByValidation is asked about `pnpm check && command -v git commit -m x`
And about `pnpm check && nice git commit -m x`
And about `pnpm check || git commit -m x`
Then each is false
```

### UC4-S1 [happy] unmutated leftover stress is green and leftover pools are generable [@implemented] → `tests/leftovers-after-adr053.test.mjs::unmutated leftover stress is green and leftover pools are generable` cmd:`node --test --test-name-pattern 'unmutated leftover stress is green and leftover pools are generable' tests/leftovers-after-adr053.test.mjs`

```gherkin
Given the shipped stress driver
And its header names the rg/commands that enumerated wrappers, keep names, and the Go raw-`\` member
When it runs unmutated at the default iteration count
Then it exits 0
And the pools include T1 wrapper-with-args, command -v as non-invocation, Go raw `\`, and PHP vs Swift #expect
```

### UC4-S2 [failure] a mutant that restores today's holes survives only if the suite is blind [@implemented] → `tests/leftovers-after-adr053.test.mjs::a mutant that restores today's holes survives only if the suite is blind` cmd:`node --test --test-name-pattern "a mutant that restores today's holes survives only if the suite is blind" tests/leftovers-after-adr053.test.mjs`

```gherkin
Given the unmutated driver is green
When a hand mutant re-enables hasher `\`-escape inside Go backticks
Or drops wrapper-arg stripping
Or keeps `#expect` on PHP
Then that mutant is killed (FAIL line, not a parse error)
And committing the 2026-09-14 untracked file unchanged is not this scenario passing
```

### UC5-S1 [happy] adr-verify --relock fills unproven the hasher can now see [@implemented] → `tests/test-lock.test.mjs::adr-verify --relock fills unproven the hasher can now see` cmd:`node --test --test-name-pattern 'adr-verify --relock fills unproven the hasher can now see' tests/test-lock.test.mjs`

```gherkin
Given a Verification Log whose first-red lock recorded UNPROVEN names the hasher can now extract
When python3 plugin/bin/adr-verify --relock runs
Then those names become bodies on a new kind:relock row
And the first-red row is not edited
```

### UC5-S2 [failure] adr-verify --replace-hashes without --relock is refused [@implemented] → `tests/test-lock.test.mjs::adr-verify --replace-hashes without --relock is refused` cmd:`node --test --test-name-pattern 'adr-verify --replace-hashes without --relock is refused' tests/test-lock.test.mjs`

```gherkin
Given adr-verify is invoked with --replace-hashes and without --relock
When the flag parser runs
Then the invocation is refused by name
And it is not treated as an unknown option that becomes the task path
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | When hashing a `.go` Tests file, a backtick string is raw: `\` is content and the next backtick closes. A later comment backtick is not a closer. Later `func Test*` bodies stay extractable. JS templates hashed without `go=True` still C-escape. | `tests/leftovers-after-adr053.test.mjs::a Go raw string ending in backslash still hashes later tests` | @implemented | `node --test --test-name-pattern 'a Go raw string ending in backslash still hashes later tests' tests/leftovers-after-adr053.test.mjs` |
| F-2 | `#expect` / `#require` stay code only for Swift. On other `hash_comments` languages they are comments. PHP `#expect a result here` is not a fail word. An empty Swift body still blocks. | `tests/leftovers-after-adr053.test.mjs::a PHP #expect comment is not a fail word` | @implemented | `node --test --test-name-pattern 'a PHP #expect comment is not a fail word' tests/leftovers-after-adr053.test.mjs` |
| F-3 | After a recognised check, `&&` / newline plus T1 wrapper words `command\|env\|sudo\|exec\|time` and those words' flags/assignments that still invoke `git commit`/`git push` strip. `command -v git commit` still advises. `nice`/`nohup`/`stdbuf` stay out of the word list. `\|\|` `;` `\|` still advise. The whole compound is not `validation`. | `tests/leftovers-after-adr053.test.mjs::sudo -n after a check still strips` | @implemented | `node --test --test-name-pattern 'sudo -n after a check still strips' tests/leftovers-after-adr053.test.mjs` |
| F-4 | A shipped stress driver (oracle from this spec and ADR-053 T1, not from current code) has source-enumerated pools that can generate F-1, F-2, and F-3 members. Unmutated it is green; hand mutants against those members go red; a non-parsing mutant is INCONCLUSIVE. The 2026-09-14 untracked `tests/adr053-stress.mjs` is not the suite. | `tests/leftovers-after-adr053.test.mjs::unmutated leftover stress is green and leftover pools are generable` | @implemented | `node --test --test-name-pattern 'unmutated leftover stress is green and leftover pools are generable' tests/leftovers-after-adr053.test.mjs` |
| F-5 | A hasher that can now extract a previously UNPROVEN Go body does not rewrite a committed first-red map. Recovery is `python3 plugin/bin/adr-verify --relock`. `--replace-hashes` is a different path (ADR-050 F-1, ADR-052). | `tests/test-lock.test.mjs::adr-verify --relock fills unproven the hasher can now see` | @implemented | `node --test --test-name-pattern 'adr-verify --relock fills unproven the hasher can now see' tests/test-lock.test.mjs` |

## Domain

Hasher language flags (`go`, `swift`, `rust_raw`, `hash_comments`) select quote rules; they are not one global C-escape loop. T1 wrapper words are a closed measured set; wrapper *arguments* are whatever POSIX those words accept before an invocation of `git commit`/`git push`. Stress pools are a class: a member the generator cannot draw is untested.

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `_mask_lock_noncode` / `extract_test_body(..., go=True)` | Go backticks are raw | `snapshot_lock`, first-red lock, `adr-verify --relock` |
| `code_only` / `scan_code_only` keep | Swift-only `#expect`/`#require` | `check_tests_can_fail`, `tests/swift-expect.test.mjs` |
| `PUBLISH_SUFFIX` / `publishPrecededByValidation` | wrapper flags/assignments that still invoke git | PreToolUse commit advice |
| shipped stress driver under `tests/` | oracle + pools for F-1–F-3 | repository gate / selftest |

## Non-Goals

- Flip `isValidationCommand` for the whole `check && git commit` compound (ADR-053 T1).
- Add `nice` / `nohup` / `stdbuf` (or any word not in T1's measured five) to the wrapper list.
- Teach `isValidationCommand('mrw write --check')` as a T1 prefix (ADR-053 T2 Out of Scope).
- Bump `TEST_HASH_REQUIRED_FROM`. Re-hash committed first-red maps without `--relock`.
- Enable JS `_js_regex_span_end` on `php=True`.
- Quote-aware `PUBLISH_SUFFIX` (`git commit -m "x;y"` stopping at `;` stays named leftover, not this spec).
- `arch-lint`'s `scan_code_only` (no `#expect` keep today) — different gate, sibling if Swift architecture tests hit it.
- Committing the 2026-09-14 untracked stress file unchanged.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Global backtick change breaks JS template hashes | High | High | F-1 failure: language flag, not the shared quote loop. Dirty test is a JS `` `dir\`` ``. |
| Threading Swift-only keep rewrites `tests/swift-expect.test.mjs` | Med | High | Key keep on `.swift` inside `check_tests_can_fail`; do not edit the locked test body. PHP dirty case is a new test. |
| `command -v git commit` treated as wrapped publish | Med | High | F-3 failure: not an invocation. |
| Stress oracle copies `PUBLISH_SUFFIX` | High | High | F-4: oracle from Decision/this spec; pool audit in the file header. |
| Hasher fix silently `--replace-hashes` a consumer UNPROVEN map | Med | High | F-5. Inbox workaround of rewriting hashes is not the product. |
| Stress default too heavy for CI | Med | Med | Tens of iterations by default; deep run env-documented (stress-testing v2). |

## Open Questions

<!-- Grill closed 2026-09-15 (user: continue). Facts bound @spec. User accepted 2026-09-15: Ready-for-ADR + ADR-054 Accepted. -->

## Verify

```bash
python3 plugin/bin/spec-verify --spec docs/specs/2026-09-15-a-go-raw-string-is-not-an-escape.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | One spec for the four leftovers vs four specs? | non-behavioral | One spec, four UCs. User: "a spec for these 4". |
| 2 | When hashing `.go`, is a backtick string raw (`\` content) or C-escaped? | F-1 | Scouted, not vetoed. Measured 2.99.4: TestA/TestB bodies None; lint scan_code_only already raw. JS templates on the default masker still escape. |
| 3 | Is `#expect`/`#require` keep Swift-only (ADR-053 T5) or every hash_comments language? | F-2 | Scouted from ADR-053 Decision T5, not vetoed. Measured: PHP `#expect a result here` FAIL_CALLS true. |
| 4 | Do T1 wrappers include flags/assignments that still invoke git commit/push (`sudo -n`, `env FOO=bar`, `command --`, `time -p`)? | F-3 | Accept 2026-09-15. `command -v` still advises. `nice`/`nohup`/`stdbuf` stay out. |
| 5 | Ship a stress driver for these leftovers, or delete/leave the untracked draft? | F-4 | Accept 2026-09-15. Oracle from this spec/ADR-053; pools from source; baseline green then mutants. Do not commit the draft as-is. |
| 6 | Does a hasher that can now see a Go body rewrite a committed first-red UNPROVEN map? | F-5 | Scouted from ADR-050 F-1 / ADR-052. `--relock` only. Not a product workaround of rewriting hashes. |
| 7 | Enough to close grill and bind? | non-behavioral | User continue 2026-09-15 after --draft PASS. Status Draft; facts @spec. Ready-for-ADR is the user's mark. |
| 8 | Ready-for-ADR and Accept ADR-054? | non-behavioral | User accepted 2026-09-15. |
