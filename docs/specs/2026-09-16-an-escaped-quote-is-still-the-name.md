# Spec: An escaped quote is still the name

> **Date:** 2026-09-16 · **Status:** Ready-for-ADR
> **Owner:** zy · **Becomes:** ADR-055
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** plugin/lib/record.py (`_BDD_NAME`, `_iter_bdd_names`, `extract_test_body`, `snapshot_lock`), docs/adr/ADR-050-a-locked-test-body-is-not-rewritten.md, docs/adr/ADR-052-an-explicit-relock-is-not-a-later-red.md, docs/adr/ADR-054-a-go-raw-string-is-not-an-escape.md, docs/BACKLOG.md §209, tests/leftovers-after-adr053.test.mjs, tests/adr053-stress.mjs

## Problem

`_BDD_NAME` is quote-kind classes that stop at the first same quote, so `test('today\'s')` is never discovered and a Tests row for `today's` stays UNPROVEN. `extract_test_body` then searches `re.escape(decoded)` between matching quotes, which matches opposite-quote `test("today's")` and misses the escaped same-quote span. Measured on 2.99.5: leftover bind uses the opposite-quote name as a control, not this hole.

## Goal

Every `it(` / `test(` name whose delimiter appears inside the name, escaped, is discovered as the decoded name and extracted from that same span so `snapshot_lock` can hash it. Interpolated template names stay UNPROVEN.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| adopting engineer | human role | a Tests row named `today's` written as `test('today\'s')` is not UNPROVEN |
| hasher (`extract_test_names` / `extract_test_body` / `snapshot_lock`) | system | walk JS/Pest string literals; yield decoded names; extract from that span |
| `adr-verify --relock` | system | fill hasher-visible UNPROVEN without rewriting first-red |

## Use Cases

### UC-1: Hasher discovers and extracts an escaped same-quote BDD name

- **Trigger:** `extract_test_names` / `extract_test_body` / `snapshot_lock` on a JS or Pest Tests file · **Preconditions:** the file is hashed as JS BDD or PHP Pest (`php=True` still walks `it(` / `test(`)
- **Main flow:**
  1. After `\b(?:it|test)\s*\(`, parse the name as a JS/Pest string literal (not a Go raw backtick; not a PHP `php=` regex span).
  2. Yield the decoded name (`today's`, `say "hi"`, a plain backtick name).
  3. Find the callback body from that same span, not by matching `re.escape(decoded)` against source bytes.
- **Failure paths:**
  - a. at step 1, quote-kind `[^'\n]+` stops at the first same quote (live defect) → name absent → UNPROVEN.
  - b. at step 3, discovery is fixed but extraction still searches decoded text between matching quotes → body `None` → UNPROVEN.
- **Postconditions:** opposite-quote `test("today's")` still hashes (control). `describe(` is not a member. Locked `test-lock` / `swift-expect` bodies are not retargeted.

### UC-2: An interpolated template name stays UNPROVEN

- **Trigger:** the same walk · **Preconditions:** ADR-005 (could-not-look is not a verdict)
- **Main flow:**
  1. A JS template with unescaped `${` is not yielded.
  2. A PHP double-quoted Pest name with unescaped `$` is not yielded (`php=True`).
  3. `extract_test_body` for that name returns `None`.
- **Failure paths:**
  - a. at step 1, the walk decodes interpolated text and hashes a guessed name → a claim the hasher did not observe.
- **Postconditions:** a non-interpolated backtick name is still in UC-1.

### UC-3: A hasher that can now see the name does not rewrite first-red

- **Trigger:** `adr-verify` on a log that recorded UNPROVEN names the hasher can now extract · **Preconditions:** ADR-050 F-1; ADR-052 `--relock`
- **Main flow:**
  1. Ordinary `adr-verify` does not rewrite the committed first-red map.
  2. `python3 plugin/bin/adr-verify --relock` fills unproven the hasher can now see.
- **Failure paths:**
  - a. at step 1, `--replace-hashes` without `--relock` is accepted, or `TEST_HASH_REQUIRED_FROM` is bumped → a hasher upgrade silently rewrites the contract.
- **Postconditions:** `--replace-hashes` remains a different, weaker path (ADR-052 F-5). Do not retake ADR-054 T1–T4 first-red.

## Scenarios

### UC1-S1 [happy] escaped same-quote BDD names are discovered and extracted [@implemented] → `tests/leftovers-after-adr053.test.mjs::escaped same-quote BDD names are discovered and extracted` cmd:`node --test --test-name-pattern 'escaped same-quote BDD names are discovered and extracted' tests/leftovers-after-adr053.test.mjs`

```gherkin
Given a JS fixture `test('today\'s', () => { expect(1) })`
And a JS fixture `test("say \"hi\"", () => { expect(1) })`
And a JS fixture with a non-interpolated backtick name
And a PHP Pest fixture `it('today\'s', function () { expect(true); })`
When extract_test_names and extract_test_body run
Then the decoded names are discovered
And each has an extractable body
And opposite-quote `test("today's")` still hashes
And `describe('x')` is not discovered as a test name
```

### UC1-S2 [failure] quote-kind classes leave escaped same-quote names UNPROVEN [@implemented] → `tests/leftovers-after-adr053.test.mjs::escaped same-quote BDD names are discovered and extracted` cmd:`node --test --test-name-pattern 'escaped same-quote BDD names are discovered and extracted' tests/leftovers-after-adr053.test.mjs`

```gherkin
Given `_BDD_NAME` / extraction still stop at the first same quote
When the escaped same-quote fixtures are hashed
Then names are absent or bodies are None
And the leftover HAND_MUTANT that restores `[^'\n]+` goes red only after the walk ships
```

### UC2-S1 [happy] a non-interpolated backtick name still hashes [@implemented] → `tests/leftovers-after-adr053.test.mjs::escaped same-quote BDD names are discovered and extracted` cmd:`node --test --test-name-pattern 'escaped same-quote BDD names are discovered and extracted' tests/leftovers-after-adr053.test.mjs`

```gherkin
Given `test(\`plain\`, () => { expect(1) })`
When extract_test_names runs
Then `plain` is discovered and extractable
```

### UC2-S2 [failure] interpolated BDD names stay undiscoverable [@implemented] → `tests/leftovers-after-adr053.test.mjs::interpolated BDD names stay undiscoverable` cmd:`node --test --test-name-pattern 'interpolated BDD names stay undiscoverable' tests/leftovers-after-adr053.test.mjs`

```gherkin
Given `test(\`x${y}\`, () => { expect(1) })`
And a PHP Pest `it("hello $name", function () { expect(true); })` with php=True
When extract_test_names and extract_test_body run
Then those names are not yielded
And extract_test_body returns None
```

### UC3-S1 [happy] adr-verify --relock fills unproven the hasher can now see [@implemented] → `tests/test-lock.test.mjs::adr-verify --relock fills unproven the hasher can now see` cmd:`node --test --test-name-pattern 'adr-verify --relock fills unproven the hasher can now see' tests/test-lock.test.mjs`

```gherkin
Given a committed map holding hasher-visible UNPROVEN
When adr-verify --relock runs on the working-tree copy
Then those names fill
And ordinary adr-verify does not rewrite the map
```

### UC3-S2 [failure] adr-verify --replace-hashes without --relock is refused [@implemented] → `tests/test-lock.test.mjs::adr-verify --replace-hashes without --relock is refused` cmd:`node --test --test-name-pattern 'adr-verify --replace-hashes without --relock is refused' tests/test-lock.test.mjs`

```gherkin
Given adr-verify is invoked with --replace-hashes and without --relock
When the flag parser runs
Then the invocation is refused
And TEST_HASH_REQUIRED_FROM stays 2026-09-13
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | After `\b(?:it\|test)\s*\(`, a JS/Pest string whose delimiter appears inside the name, escaped, is discovered as the **decoded** name (`today's`, `say "hi"`, a non-interpolated backtick name). Opposite-quote names remain the control. `describe(` is not a member. Pest `it(` on `.php` is in the class. | `tests/leftovers-after-adr053.test.mjs::escaped same-quote BDD names are discovered and extracted` | @implemented | `node --test --test-name-pattern 'escaped same-quote BDD names are discovered and extracted' tests/leftovers-after-adr053.test.mjs` |
| F-2 | `extract_test_body` finds the callback from that same span, not `re.escape(decoded)` against source bytes. A name that is discovered is extractable (hashable). Restoring quote-kind `[^'\n]+` leaves the name undiscoverable. | `tests/leftovers-after-adr053.test.mjs::escaped same-quote BDD names are discovered and extracted` | @implemented | `node --test --test-name-pattern 'escaped same-quote BDD names are discovered and extracted' tests/leftovers-after-adr053.test.mjs` |
| F-3 | An interpolated JS template (`${`) or PHP double-quoted Pest name (unescaped `$` when `php=True`) is not yielded and is not extractable — UNPROVEN, not a guessed hash (ADR-005). | `tests/leftovers-after-adr053.test.mjs::interpolated BDD names stay undiscoverable` | @implemented | `node --test --test-name-pattern 'interpolated BDD names stay undiscoverable' tests/leftovers-after-adr053.test.mjs` |
| F-4 | Hasher-visible unproven after this walk is `python3 plugin/bin/adr-verify --relock` only. `--replace-hashes` without `--relock` stays refused. `TEST_HASH_REQUIRED_FROM` stays `2026-09-13`. Do not retake ADR-054 T1–T4 first-red. | `tests/test-lock.test.mjs::adr-verify --relock fills unproven the hasher can now see` | @implemented | `node --test --test-name-pattern 'adr-verify --relock fills unproven the hasher can now see' tests/test-lock.test.mjs` |

## Domain

A BDD name is the decoded JS/Pest string literal after `it(` / `test(`. Discovery and extraction share one walk. Interpolation is could-not-look. Go raw backticks and PHP regex spans are a different hasher class (ADR-054).

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `_iter_bdd_names` / `extract_test_body` BDD arm | escaped same-quote walk; decoded names; span-based extract | `snapshot_lock`, first-red lock, `adr-verify --relock` |
| leftover tests / stress HAND_MUTANT | bind the class; restore `[^'\n]+` | repository gate |

## Non-Goals

- Bump `TEST_HASH_REQUIRED_FROM`.
- `--replace-hashes` on T1–T4 / rewrite committed first-red maps (accepted F-5; BACKLOG §209).
- Edit `tests/test-lock.test.mjs` or `tests/swift-expect.test.mjs`.
- Rewrite ADR-054 Decision text.
- Teach `describe(` as a hashed test name.
- Go raw backticks; PHP `php=` regex spans; full JS `\x` / `\u` name decoding beyond `\` + next-char and PHP single-quote `\\` / `\'`.
- Quote-aware `PUBLISH_SUFFIX` (Spec B / ADR-056).
- BACKLOG §206 never-hashable Tests rows.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Fixing `_BDD_NAME` leaves extraction blind | High | High | F-2: same-span extract; dirty fixture is escaped same-quote, not opposite-quote |
| Interpolated templates get a guessed hash | Med | High | F-3: refuse `${` / PHP `"$`; UNPROVEN |
| New names `--replace-hashes` consumer maps | Med | High | F-4; leftover recovery is `--relock` |
| Editing leftover bind bodies moves ADR-054 first-red | High | High | Append tests; do not retarget locked bodies |

## Open Questions

## Verify

```bash
python3 plugin/bin/spec-verify --spec docs/specs/2026-09-16-an-escaped-quote-is-still-the-name.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | Escaped `'` in single quotes, escaped `"` in double quotes, and non-interpolated backticks are one class? | F-1 | Plan-accepted 2026-09-16. Opposite-quote is the control. |
| 2 | Must extraction walk the same span, not `re.escape(decoded)`? | F-2 | Plan-accepted. Fixing discovery alone leaves UNPROVEN. |
| 3 | Interpolated templates (`${`, PHP `"$`) stay UNPROVEN? | F-3 | Plan-accepted. ADR-005. |
| 4 | Is Pest `it(` on `.php` in the class? | F-1 | Plan-accepted. Same walk; `php=True` still calls `_iter_bdd_names`. |
| 5 | Is `describe(` in the class? | F-1 | Plan-accepted: no. |
| 6 | Hasher-visible unproven: `--relock` only, no cutover bump? | F-4 | Plan-accepted. TEST_HASH_REQUIRED_FROM stays 2026-09-13. |
