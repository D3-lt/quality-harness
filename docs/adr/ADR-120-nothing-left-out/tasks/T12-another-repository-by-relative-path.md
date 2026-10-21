# Task ADR-120-T12: A commit into another repository by a relative path is judged there

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** `foreignCommitPath` accepting `git -C <relative> commit`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`git -C ../b commit` is advised as foreign, as its absolute form already is, when git, asked with the operand as written from the payload `cwd`, places it in another repository. `cd <relative> && git commit` stays unproven, because `cd` resolves logically and git physically; `;` after a `cd` stays unproven too. A push is unchanged.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/foreign-relative.test.mjs` | create | the rows below (0 locks: new) |
| `plugin/scripts/publish-command.mjs` | edit | `foreignCommitPath` (:172-204) accepts a relative operand: a leading run of `../` then plain names, with no `.` or `..` after them and no `$`, glob or `~`; `;` after `cd` stays unproven (:181-185, held by `tests/foreign-commit.test.mjs:306-338`) |
| `plugin/scripts/publish-verdict.mjs` | edit | the foreign probe (:403-417) asks `git -C <payload cwd>/<operand as written> rev-parse --git-common-dir`, so git's own path semantics decide; a `cd` operand not starting with `.` while `CDPATH` is set is unproven |
| `core/hooks/publishcmd.go`, `core/hooks/publish.go` | edit | the same (:267, :323-325; :322) |
| `tests/mutations/plugin/scripts/publish-command.mjs.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run, with real repositories a and b in a temporary directory and the session in a: `git -C ../b commit` is foreign advice; refusal twins that stay unproven or judged as a: `cd ../b && git commit` (the logical/physical twin, with a symlinked cwd fixture where `cd ../b` reaches a), `cd ../b; git commit`, `git -C ../b/link/.. commit` (where `b/link` points into a), `git -C ../a commit` (resolves home), `git -C ../$X commit`, `git -C ~/b commit`, and `git -C ../b push` (a push is unchanged). Class: `mrw read --grep 'foreignCommitPath|ForeignCommitPath|commonDirectory' plugin/scripts/ core/hooks/` names every recogniser and probe; each is changed or named retained in the task's log.
2. [S2] Accept the relative operand and probe it with git as written, in Node and Go.
3. [S3] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/foreign-relative.test.mjs 2>&1) \
  && for n in "a commit into another repository by a relative path is judged there" \
      "a path that resolves home, or is not a literal, is not proven foreign"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done \
  && (cd core && go test ./hooks/)
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a commit into another repository by a relative path is judged there` | `tests/foreign-relative.test.mjs` | the relative forms | — | S1, S2 |
| `a path that resolves home, or is not a literal, is not proven foreign` | `tests/foreign-relative.test.mjs` | the twins | — | S1, S2 |
| `an operand with no name after the dots is not proven foreign` | `tests/foreign-relative.test.mjs` | `..`, `../..`, `../` stay unproven | — | S1, S2 |
| `a quoted operand holding an expansion, a glob or a tilde is not proven foreign` | `tests/foreign-relative.test.mjs` | single-quoted `$`, glob and `~` operands stay unproven | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | the hook or gate that calls it; the mutants on that call |
| 3 — the caller can discover it | the advice or output text, and the skill where one is named |
| 4 — it is used | every session or run of the gate in question |

## Mutation Log
- 2026-10-21 · 7a9107e8* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a dot after a name is accepted · acceptance-sha256:3fbf6aa1af8bbdbbe179c8f60e5ce60900586ba57d4fda0e89b14650b4b0027d
- 2026-10-21 · 7a9107e8* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a cd operand is read as a relative -C · acceptance-sha256:3fbf6aa1af8bbdbbe179c8f60e5ce60900586ba57d4fda0e89b14650b4b0027d
- 2026-10-21 · 7a9107e8* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a dollar is admitted in a name · acceptance-sha256:3fbf6aa1af8bbdbbe179c8f60e5ce60900586ba57d4fda0e89b14650b4b0027d
- 2026-10-21 · 7a9107e8* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a name may begin with a dash · acceptance-sha256:3fbf6aa1af8bbdbbe179c8f60e5ce60900586ba57d4fda0e89b14650b4b0027d
- 2026-10-21 · 7a9107e8* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · dots alone are accepted · acceptance-sha256:3fbf6aa1af8bbdbbe179c8f60e5ce60900586ba57d4fda0e89b14650b4b0027d
- 2026-10-21 · 7a9107e8* · mutant killed · exit 1 · `plugin/scripts/publish-verdict.mjs` · the probe runs from the hook process cwd · acceptance-sha256:3fbf6aa1af8bbdbbe179c8f60e5ce60900586ba57d4fda0e89b14650b4b0027d
- 2026-10-21 · 7a9107e8* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a backslash separates on POSIX · acceptance-sha256:3fbf6aa1af8bbdbbe179c8f60e5ce60900586ba57d4fda0e89b14650b4b0027d

## Invariants

- Every locked test keeps its body; new tests go beside locked ones.
- Node and Go agree wherever both implement the rule.

## Risks

- A relative path resolved against the wrong cwd: the hook's payload `cwd` is the base, and a preceding `cd` in the same command is a twin that stays not proven.

## Stop Condition

Stop if the host's payload `cwd` can differ from the shell's cwd at the command (a `cd` earlier in the session): measure before encoding.

## Out of Scope

- Judging a commit into b by b's own ledger at PreToolUse (permanent: boundary: git's hook judges b at the event, ADR-066; PreToolUse advises)

## Verification Log
- 2026-10-21 · 7a9107e8* · exit 1 · `out=$(node --test --test-reporter=tap tests/foreign-relative.test.mjs 2>&1) \ …` · acceptance-sha256:3fbf6aa1af8bbdbbe179c8f60e5ce60900586ba57d4fda0e89b14650b4b0027d · ms:1151 · test-lock-sha256:cad5b5b7409688e41740be371300b554c9ccf9c19d7c4f446ad1ff3cbc3ea6e3 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvZm9yZWlnbi1yZWxhdGl2ZS50ZXN0Lm1qcwlhIGNvbW1pdCBpbnRvIGFub3RoZXIgcmVwb3NpdG9yeSBieSBhIHJlbGF0aXZlIHBhdGggaXMganVkZ2VkIHRoZXJlCTBlMWJjMTBlNWFjMzBmYTBiMzYwYzM0OTlhZTQ0MGQ0M2IyYzYwZDZiNTliMTMwYjE0NDU2MDBjMjYzMWU3ZWUKYm9keQl0ZXN0cy9mb3JlaWduLXJlbGF0aXZlLnRlc3QubWpzCWEgcGF0aCB0aGF0IHJlc29sdmVzIGhvbWUsIG9yIGlzIG5vdCBhIGxpdGVyYWwsIGlzIG5vdCBwcm92ZW4gZm9yZWlnbgk2OTI1MjVlMjk2N2ExNmMwNDJhNzcwMGM3NWQ4NjMzNWU0MDgxNDMyMGQ5YWExNTRjZDU3NGNlZmNhYTg3NjJl
  ```
  ```
- 2026-10-21 · 7a9107e8* · exit 0 · `out=$(node --test --test-reporter=tap tests/foreign-relative.test.mjs 2>&1) \ …` · acceptance-sha256:3fbf6aa1af8bbdbbe179c8f60e5ce60900586ba57d4fda0e89b14650b4b0027d · ms:22889
- 2026-10-21 · 7a9107e8* · exit 0 · `out=$(node --test --test-reporter=tap tests/foreign-relative.test.mjs 2>&1) \ …` · acceptance-sha256:3fbf6aa1af8bbdbbe179c8f60e5ce60900586ba57d4fda0e89b14650b4b0027d · ms:12936
- 2026-10-21 · 7a9107e8* · exit 0 · `out=$(node --test --test-reporter=tap tests/foreign-relative.test.mjs 2>&1) \ …` · acceptance-sha256:3fbf6aa1af8bbdbbe179c8f60e5ce60900586ba57d4fda0e89b14650b4b0027d · ms:13889
- 2026-10-21 · 7a9107e8* · exit 0 · `out=$(node --test --test-reporter=tap tests/foreign-relative.test.mjs 2>&1) \ …` · acceptance-sha256:3fbf6aa1af8bbdbbe179c8f60e5ce60900586ba57d4fda0e89b14650b4b0027d · ms:38824
- 2026-10-21 · 7a9107e8* · exit 0 · `out=$(node --test --test-reporter=tap tests/foreign-relative.test.mjs 2>&1) \ …` · acceptance-sha256:3fbf6aa1af8bbdbbe179c8f60e5ce60900586ba57d4fda0e89b14650b4b0027d · ms:16378
- 2026-10-21 · 7a9107e8* · exit 0 · `out=$(node --test --test-reporter=tap tests/foreign-relative.test.mjs 2>&1) \ …` · acceptance-sha256:3fbf6aa1af8bbdbbe179c8f60e5ce60900586ba57d4fda0e89b14650b4b0027d · ms:15733
- 2026-10-21 · 7a9107e8* · exit 0 · `out=$(node --test --test-reporter=tap tests/foreign-relative.test.mjs 2>&1) \ …` · acceptance-sha256:3fbf6aa1af8bbdbbe179c8f60e5ce60900586ba57d4fda0e89b14650b4b0027d · ms:12706
- 2026-10-21 · 7a9107e8* · exit 0 · `out=$(node --test --test-reporter=tap tests/foreign-relative.test.mjs 2>&1) \ …` · acceptance-sha256:3fbf6aa1af8bbdbbe179c8f60e5ce60900586ba57d4fda0e89b14650b4b0027d · ms:14684
- 2026-10-21 · 2ea212a7* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:3fbf6aa1af8bbdbbe179c8f60e5ce60900586ba57d4fda0e89b14650b4b0027d · ms:0 · test-lock-sha256:e6cdfac9fefc679d370f25904c9686d222537ab6fe333372995439636f4c24db · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvZm9yZWlnbi1yZWxhdGl2ZS50ZXN0Lm1qcwlhIGNvbW1pdCBpbnRvIGFub3RoZXIgcmVwb3NpdG9yeSBieSBhIHJlbGF0aXZlIHBhdGggaXMganVkZ2VkIHRoZXJlCTBlMWJjMTBlNWFjMzBmYTBiMzYwYzM0OTlhZTQ0MGQ0M2IyYzYwZDZiNTliMTMwYjE0NDU2MDBjMjYzMWU3ZWUKYm9keQl0ZXN0cy9mb3JlaWduLXJlbGF0aXZlLnRlc3QubWpzCWEgcGF0aCB0aGF0IHJlc29sdmVzIGhvbWUsIG9yIGlzIG5vdCBhIGxpdGVyYWwsIGlzIG5vdCBwcm92ZW4gZm9yZWlnbgk2OTI1MjVlMjk2N2ExNmMwNDJhNzcwMGM3NWQ4NjMzNWU0MDgxNDMyMGQ5YWExNTRjZDU3NGNlZmNhYTg3NjJlCmJvZHkJdGVzdHMvZm9yZWlnbi1yZWxhdGl2ZS50ZXN0Lm1qcwlhIHF1b3RlZCBvcGVyYW5kIGhvbGRpbmcgYW4gZXhwYW5zaW9uLCBhIGdsb2Igb3IgYSB0aWxkZSBpcyBub3QgcHJvdmVuIGZvcmVpZ24JNDlkNDI5ZWFmYWE4ZmI2MDE2Njc5YzZhNGJiMThkMjY0NDQyNDA4ZDU2NGYzZDNhMjJiMjE5OGRmZmI2MWFmMgpib2R5CXRlc3RzL2ZvcmVpZ24tcmVsYXRpdmUudGVzdC5tanMJYW4gb3BlcmFuZCB3aXRoIG5vIG5hbWUgYWZ0ZXIgdGhlIGRvdHMgaXMgbm90IHByb3ZlbiBmb3JlaWduCWMzOWEyZGQ0NzgxNDlmYzBjMzc5ZmE5MmQ4MGIzMDA3NmRmM2Q4MjBiNzg3ZDFlNTJmYmZhNWYzOWRlM2UxZTE · test-lock-kind:replace
