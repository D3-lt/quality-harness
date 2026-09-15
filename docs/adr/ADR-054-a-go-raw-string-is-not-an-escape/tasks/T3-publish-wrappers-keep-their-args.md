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
- 2026-09-15 · 140d87f* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · dropping wrapper-arg consumption leaves sudo -n advising after a check · acceptance-sha256:c1c0dac0d8b782e3f895fa8c6c971e71f4b7bdec4be8ba849ab094b8f2466a47 · covers:the wrapper-arg publish suffix
- 2026-09-15 · 140d87f* · mutant survived · exit 0 · `plugin/scripts/lifecycle.mjs` · treating command -v as wrapped publish silences the non-invocation case · acceptance-sha256:c1c0dac0d8b782e3f895fa8c6c971e71f4b7bdec4be8ba849ab094b8f2466a47 · covers:the command -v non-invocation
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-09-15 · 140d87f* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · treating command -v as wrapped publish silences a check joined to git push · acceptance-sha256:c1c0dac0d8b782e3f895fa8c6c971e71f4b7bdec4be8ba849ab094b8f2466a47 · covers:the command -v non-invocation

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
- 2026-09-15 · 140d87f* · exit 1 · `node --test --test-name-pattern 'sudo -n after a check still strips' tests/leftovers-after-adr053.test.mjs && node --test --test-name-pattern 'command -v is not a publish; loud joiners still advise' tests/leftovers-after-adr053.test.mjs` · acceptance-sha256:c1c0dac0d8b782e3f895fa8c6c971e71f4b7bdec4be8ba849ab094b8f2466a47 · ms:87 · test-lock-sha256:b0cb59f886b8ff78fad76b3eeea8e37bb15ffe5617455d2279ac9595c85ee70d · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2xlZnRvdmVycy1hZnRlci1hZHIwNTMudGVzdC5tanMJQy1lc2NhcGluZyBHbyBiYWNrdGlja3MgbGVhdmVzIGxhdGVyIHRlc3RzIFVOUFJPVkVOOyBKUyB0ZW1wbGF0ZXMgc3RpbGwgZXNjYXBlCWFjYTU1OTMxYTMzNDAxMWFlNWI0MzZiZDE2YWFkYjgyZTJiYTgxNmI1MTcyMWY5NGZiNzc2YTQ3ZGIxMmI0MzEKYm9keQl0ZXN0cy9sZWZ0b3ZlcnMtYWZ0ZXItYWRyMDUzLnRlc3QubWpzCWEgR28gcmF3IHN0cmluZyBlbmRpbmcgaW4gYmFja3NsYXNoIHN0aWxsIGhhc2hlcyBsYXRlciB0ZXN0cwk0YWJjZmJjMGNlYTAwNTgxOGE0MTNkMTk2ZDNlMzY4NTFkMzZhNDcxNWQ3YzhkOTlhNWZkZThmYWRlNGRhODZmCmJvZHkJdGVzdHMvbGVmdG92ZXJzLWFmdGVyLWFkcjA1My50ZXN0Lm1qcwlhIFBIUCAjZXhwZWN0IGNvbW1lbnQgaXMgbm90IGEgZmFpbCB3b3JkCTViNzQ4MGI3MzlkOWYyMWNiYzkyMTliNmUwZDI0NWZiZTFmNGQxMTZmZGZmNmNjODczZWU5ODc4YThlMDdiYTAKYm9keQl0ZXN0cy9sZWZ0b3ZlcnMtYWZ0ZXItYWRyMDUzLnRlc3QubWpzCWNvbW1hbmQgLXYgaXMgbm90IGEgcHVibGlzaDsgbG91ZCBqb2luZXJzIHN0aWxsIGFkdmlzZQkzNDBjZjIwOTc1NDM4M2Q2NGFjMjZjNWYwZGRkNTJkODkyNDZlYWU0NGE0NjNiMWYyNzVhNGJmMmZhODBhZTJiCmJvZHkJdGVzdHMvbGVmdG92ZXJzLWFmdGVyLWFkcjA1My50ZXN0Lm1qcwlzdWRvIC1uIGFmdGVyIGEgY2hlY2sgc3RpbGwgc3RyaXBzCTMwZTZiNTM2YjIyM2UwMmVjMDkzMDY3YmNhOTc4NDU3ZjE4N2EzZGE4ODYyNDVmYjcyYTlhYjUyMTg3MWQ5ZjY
  ```
  --- last 10 line(s) of stdout (of 30 after folding 30 raw)
        at Test.run (node:internal/test_runner/test:1106:25)
        at Test.start (node:internal/test_runner/test:1003:17)
        at startSubtestAfterBootstrap (node:internal/test_runner/harness:358:17) {
      generatedMessage: true,
      code: 'ERR_ASSERTION',
      actual: false,
      expected: true,
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-09-15 · 140d87f* · exit 0 · `node --test --test-name-pattern 'sudo -n after a check still strips' tests/leftovers-after-adr053.test.mjs && node --test --test-name-pattern 'command -v is not a publish; loud joiners still advise' tests/leftovers-after-adr053.test.mjs` · acceptance-sha256:c1c0dac0d8b782e3f895fa8c6c971e71f4b7bdec4be8ba849ab094b8f2466a47 · ms:201
- 2026-09-15 · 140d87f* · exit 0 · `node --test --test-name-pattern 'sudo -n after a check still strips' tests/leftovers-after-adr053.test.mjs && node --test --test-name-pattern 'command -v is not a publish; loud joiners still advise' tests/leftovers-after-adr053.test.mjs` · acceptance-sha256:c1c0dac0d8b782e3f895fa8c6c971e71f4b7bdec4be8ba849ab094b8f2466a47 · ms:133
- 2026-09-15 · 140d87f* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:c1c0dac0d8b782e3f895fa8c6c971e71f4b7bdec4be8ba849ab094b8f2466a47 · ms:0 · test-lock-sha256:72a98bc5a55461ebbf5aaba18c34cb92703cafe007c6a3bf4fc01086d0a530a9 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2xlZnRvdmVycy1hZnRlci1hZHIwNTMudGVzdC5tanMJQy1lc2NhcGluZyBHbyBiYWNrdGlja3MgbGVhdmVzIGxhdGVyIHRlc3RzIFVOUFJPVkVOOyBKUyB0ZW1wbGF0ZXMgc3RpbGwgZXNjYXBlCWFjYTU1OTMxYTMzNDAxMWFlNWI0MzZiZDE2YWFkYjgyZTJiYTgxNmI1MTcyMWY5NGZiNzc2YTQ3ZGIxMmI0MzEKYm9keQl0ZXN0cy9sZWZ0b3ZlcnMtYWZ0ZXItYWRyMDUzLnRlc3QubWpzCWEgR28gcmF3IHN0cmluZyBlbmRpbmcgaW4gYmFja3NsYXNoIHN0aWxsIGhhc2hlcyBsYXRlciB0ZXN0cwk0YWJjZmJjMGNlYTAwNTgxOGE0MTNkMTk2ZDNlMzY4NTFkMzZhNDcxNWQ3YzhkOTlhNWZkZThmYWRlNGRhODZmCmJvZHkJdGVzdHMvbGVmdG92ZXJzLWFmdGVyLWFkcjA1My50ZXN0Lm1qcwlhIFBIUCAjZXhwZWN0IGNvbW1lbnQgaXMgbm90IGEgZmFpbCB3b3JkCTViNzQ4MGI3MzlkOWYyMWNiYzkyMTliNmUwZDI0NWZiZTFmNGQxMTZmZGZmNmNjODczZWU5ODc4YThlMDdiYTAKYm9keQl0ZXN0cy9sZWZ0b3ZlcnMtYWZ0ZXItYWRyMDUzLnRlc3QubWpzCWNvbW1hbmQgLXYgaXMgbm90IGEgcHVibGlzaDsgbG91ZCBqb2luZXJzIHN0aWxsIGFkdmlzZQk2OTkxOWY4YWY4ZWUzYmUyNWEzODI0ZDU5OWUyNTBkOGUzODBjOTRhN2UzMjkwMTc0NjYyNGM4ZGI0MTVjYzc1CmJvZHkJdGVzdHMvbGVmdG92ZXJzLWFmdGVyLWFkcjA1My50ZXN0Lm1qcwlzdWRvIC1uIGFmdGVyIGEgY2hlY2sgc3RpbGwgc3RyaXBzCTMwZTZiNTM2YjIyM2UwMmVjMDkzMDY3YmNhOTc4NDU3ZjE4N2EzZGE4ODYyNDVmYjcyYTlhYjUyMTg3MWQ5ZjY · test-lock-kind:replace
- 2026-09-15 · 140d87f* · exit 0 · `node --test --test-name-pattern 'sudo -n after a check still strips' tests/leftovers-after-adr053.test.mjs && node --test --test-name-pattern 'command -v is not a publish; loud joiners still advise' tests/leftovers-after-adr053.test.mjs` · acceptance-sha256:c1c0dac0d8b782e3f895fa8c6c971e71f4b7bdec4be8ba849ab094b8f2466a47 · ms:384
