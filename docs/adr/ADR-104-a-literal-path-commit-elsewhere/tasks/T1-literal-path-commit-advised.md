# Task ADR-104-T1: a literal-path commit into another repository is advised

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (one text reader, one probe, one branch, one test file)
**Owner:** unassigned
**Produces:** `foreignCommitPath(command, env)` in `plugin/scripts/publish-command.mjs`; the `:foreign` branch in `publishUnchecked`
**Consumes:** none
**Proof map:** v1

## Goal

`publishUnchecked` advises instead of refusing a Bash command its text proves commits into the absolute literal path `L`, when
git's common directory for `L` differs from the session's (ADR-104, Decisions 1 and 2).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/publish-command.mjs` | edit | `foreignCommitPath(command, env, platform)`, reusing `shellWords`, `INHERITED_REDIRECTS`, `plainGitArguments`; absolute per platform, not `ABSOLUTE` |
| `plugin/scripts/publish-verdict.mjs` | edit | `commonDirectory(dir, run)` (spawn with `timeout` and `windowsHide`), and the `:foreign` branch after ADR-086's |
| `tests/foreign-commit.test.mjs` | create | the tests below |
| `.quality-harness.json` | edit | `tests/foreign-commit.test.mjs` in `fastCheck`, so a commit's fast pass runs it |
| `tests/mutations/plugin/scripts/publish-command.mjs.json` | edit | entries on the grammar |
| `tests/mutations/plugin/scripts/publish-verdict.mjs.json` | edit | entries on the comparison and the failed probe |

## Ordered Steps

1. [S1] Add the tests below and record the red run (TDD red: the foreign row is refused today).
2. [S2] Write `foreignCommitPath` to Decision 1, a grammar of what is plain.
3. [S3] Write `commonDirectory` and the branch to Decision 2; a probe that fails, times out or prints nothing returns `null`
   and changes nothing.
4. [S4] Record killed mutants: the common-directory comparison, the failed-probe arm, the one-git-command rule, the data-only
   tail, and the POSIX absolute rule. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/foreign-commit.test.mjs 2>&1) && ! printf '%s\n' "$out" | grep -q '# SKIP' \
  && for n in "a literal -C commit into another repository is advised, armed or not, unchecked or fast-pass" \
      "a -C path that reaches this repository's git directory is never foreign" \
      "what runs beside the commit, or redirects it, keeps the refusal" \
      "a probe that fails proves nothing, and the probe is bounded and hidden" \
      "tests/foreign-commit.test.mjs is in the declared fast check"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a literal -C commit into another repository is advised, armed or not, unchecked or fast-pass` | `tests/foreign-commit.test.mjs` | the observed spelling (`-c user.*`, then `; echo "commit exit $?"`), the foreign repository by its `/private/tmp` and `/tmp` spellings and case-folded, and an untracked nested repository are advised with the `:foreign` text, once per tree | — | S1, S2, S3 |
| `a -C path that reaches this repository's git directory is never foreign` | `tests/foreign-commit.test.mjs` | twins, each unarmed-unchecked refused and in no state given `:foreign`: `.`, the toplevel, a subdirectory, a symlink to it, a linked worktree, a gitfile pointing at it, a path that does not exist, a relative path, an absolute path with `..`, and on POSIX `\B` and `C:/B` | — | S1, S2, S3 |
| `what runs beside the commit, or redirects it, keeps the refusal` | `tests/foreign-commit.test.mjs` | twins: a program before the commit, `git init L` first, `git -C L add . && git -C L commit`, `--git-dir`, `--work-tree`, a `GIT_DIR=` assignment, an inherited `GIT_DIR`, `-C "$X"`, `-C ~/x`, `… && git push` after, `…; g=git; $g push` after, `…; printf -v x y` after | — | S1, S2 |
| `a probe that fails proves nothing, and the probe is bounded and hidden` | `tests/foreign-commit.test.mjs` | an injected `run` that errors, times out or prints nothing keeps the refusal; the spawn options carry `timeout` and `windowsHide: true` | — | S1, S3 |
| `tests/foreign-commit.test.mjs is in the declared fast check` | `tests/foreign-commit.test.mjs` | `.quality-harness.json`'s `fastCheck` names this file | — | S1 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `foreignCommitPath`, `commonDirectory` |
| 2 — something selects it | `publishUnchecked`, called from `on-pre-tool-use.mjs` |
| 3 — the caller can discover it | the advice text names ADR-104 |
| 4 — it is used | the tests drive the real PreToolUse hook |

## Mutation Log
- 2026-10-15 · f1297c97* · mutant killed · exit 1 · `plugin/scripts/publish-verdict.mjs` · a commit into this checkout by a symlink, worktree or gitfile path would be advised as foreign · acceptance-sha256:93f957dbe6c166109ee9a9a1efcc3f336c870392b30fcbd6cacd0cb44e46e9f3

## Invariants

- A refusal is lifted only by a successful probe that names a different directory (CLAUDE.md §16).
- A same-repository row never carries `:foreign`; in an armed session it keeps what ADR-066 says of it.
- ADR-086's branch, the armed downgrade and the reviewer guard are unchanged.

## Risks

- A concurrent writer between probe and commit (ADR-104 Risks).

## Stop Condition

Stop and ask if any measured twin row is advised, or if the Windows CI job resolves a row differently from macOS.

## Out of Scope

- `cd <literal> && git commit` (deferred: docs/BACKLOG.md §367)

## Verification Log
- 2026-10-15 · f1297c97* · exit 1 · `out=$(node --test --test-reporter=tap tests/foreign-commit.test.mjs 2>&1) && ! printf '%s\n' "$out" | grep -q '# SKIP' \ …` · acceptance-sha256:93f957dbe6c166109ee9a9a1efcc3f336c870392b30fcbd6cacd0cb44e46e9f3 · ms:233 · test-lock-sha256:9103a02c0f0e755ce1f6dce38dae0097551e0401026d5b354b4d1fbec99c61e3 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvZm9yZWlnbi1jb21taXQudGVzdC5tanMJYSAtQyBwYXRoIHRoYXQgcmVhY2hlcyB0aGlzIHJlcG9zaXRvcnkncyBnaXQgZGlyZWN0b3J5IGlzIG5ldmVyIGZvcmVpZ24JMzZhOGI1ZDczZjJlNWUwYWQxM2VlYWJjNWMxNDY3MGJjYzZlNGNkNjhmZjhjMjhiNTFjZGZlNWFjNDI3YzMyMApib2R5CXRlc3RzL2ZvcmVpZ24tY29tbWl0LnRlc3QubWpzCWEgbGl0ZXJhbCAtQyBjb21taXQgaW50byBhbm90aGVyIHJlcG9zaXRvcnkgaXMgYWR2aXNlZCwgYXJtZWQgb3Igbm90LCB1bmNoZWNrZWQgb3IgZmFzdC1wYXNzCTRiOTRkM2EwM2VhYjIyZTkwY2IyN2VjMjAwZmViYmUzZDEwZTNkNzkyNDYyYjBhMTE1MTUwOTM3MDY4YmE2MGYKYm9keQl0ZXN0cy9mb3JlaWduLWNvbW1pdC50ZXN0Lm1qcwlhIHByb2JlIHRoYXQgZmFpbHMgcHJvdmVzIG5vdGhpbmcsIGFuZCB0aGUgcHJvYmUgaXMgYm91bmRlZCBhbmQgaGlkZGVuCWM5NzY5YWQzYTc2NmU4NDQ2ZmUxZjdmOGJlOGRkNmE0ZjZjZGJiNzZmMWJkM2UzZmMwYTUxNjU3ZDdhYzRkYmEKYm9keQl0ZXN0cy9mb3JlaWduLWNvbW1pdC50ZXN0Lm1qcwl0ZXN0cy9mb3JlaWduLWNvbW1pdC50ZXN0Lm1qcyBpcyBpbiB0aGUgZGVjbGFyZWQgZmFzdCBjaGVjawk0NTVhNDUxNTQ0YjczNTQ4NzhmNTEwODcwYmFlMjMzM2ExZTM3MGVmMGE5NWY5MjI0NTZmYTYyZmQ4ZTdjZDQwCmJvZHkJdGVzdHMvZm9yZWlnbi1jb21taXQudGVzdC5tanMJd2hhdCBydW5zIGJlc2lkZSB0aGUgY29tbWl0LCBvciByZWRpcmVjdHMgaXQsIGtlZXBzIHRoZSByZWZ1c2FsCWJjY2UwNWMyMzQyMWY4YWFiYTBiZmU4NzY3NGVlY2M1N2FlY2M1YWZiMzlhMDExZThiMThkMzgyZjM4NDNjYmM
  ```
  ```
- 2026-10-15 · f1297c97* · exit 0 · `out=$(node --test --test-reporter=tap tests/foreign-commit.test.mjs 2>&1) && ! printf '%s\n' "$out" | grep -q '# SKIP' \ …` · acceptance-sha256:93f957dbe6c166109ee9a9a1efcc3f336c870392b30fcbd6cacd0cb44e46e9f3 · ms:11382
- 2026-10-15 · f1297c97* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:93f957dbe6c166109ee9a9a1efcc3f336c870392b30fcbd6cacd0cb44e46e9f3 · ms:0 · test-lock-sha256:97ea4fba6e1a111c0aff10f7e17c82216bbff3ea280205dee9d10fd9da08de31 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvZm9yZWlnbi1jb21taXQudGVzdC5tanMJYSAtQyBwYXRoIHRoYXQgcmVhY2hlcyB0aGlzIHJlcG9zaXRvcnkncyBnaXQgZGlyZWN0b3J5IGlzIG5ldmVyIGZvcmVpZ24JMjk2MGZiZTRjYzE5NjNjOTQxNDg0MzFjNTk5NWFmYTk4MTkzOWUxZGUzOGU1ZDdmNTgzOGIxMTM3NWZjYTc0MQpib2R5CXRlc3RzL2ZvcmVpZ24tY29tbWl0LnRlc3QubWpzCWEgbGl0ZXJhbCAtQyBjb21taXQgaW50byBhbm90aGVyIHJlcG9zaXRvcnkgaXMgYWR2aXNlZCwgYXJtZWQgb3Igbm90LCB1bmNoZWNrZWQgb3IgZmFzdC1wYXNzCWE2NDVlNDkyNzliNWM1ZDBiZDUyY2JkZDNmZjZhOThhYTliOTcwNGZkNTcwYzc2Yzc2MmU5YTRiNjQ2ODYyNDYKYm9keQl0ZXN0cy9mb3JlaWduLWNvbW1pdC50ZXN0Lm1qcwlhIHByb2JlIHRoYXQgZmFpbHMgcHJvdmVzIG5vdGhpbmcsIGFuZCB0aGUgcHJvYmUgaXMgYm91bmRlZCBhbmQgaGlkZGVuCWM5NzY5YWQzYTc2NmU4NDQ2ZmUxZjdmOGJlOGRkNmE0ZjZjZGJiNzZmMWJkM2UzZmMwYTUxNjU3ZDdhYzRkYmEKYm9keQl0ZXN0cy9mb3JlaWduLWNvbW1pdC50ZXN0Lm1qcwl0ZXN0cy9mb3JlaWduLWNvbW1pdC50ZXN0Lm1qcyBpcyBpbiB0aGUgZGVjbGFyZWQgZmFzdCBjaGVjawk0NTVhNDUxNTQ0YjczNTQ4NzhmNTEwODcwYmFlMjMzM2ExZTM3MGVmMGE5NWY5MjI0NTZmYTYyZmQ4ZTdjZDQwCmJvZHkJdGVzdHMvZm9yZWlnbi1jb21taXQudGVzdC5tanMJd2hhdCBydW5zIGJlc2lkZSB0aGUgY29tbWl0LCBvciByZWRpcmVjdHMgaXQsIGtlZXBzIHRoZSByZWZ1c2FsCWJjY2UwNWMyMzQyMWY4YWFiYTBiZmU4NzY3NGVlY2M1N2FlY2M1YWZiMzlhMDExZThiMThkMzgyZjM4NDNjYmM · test-lock-kind:replace
- 2026-10-15 · 2a4f5cfd* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:93f957dbe6c166109ee9a9a1efcc3f336c870392b30fcbd6cacd0cb44e46e9f3 · ms:0 · test-lock-sha256:741e19d92117289bf82994dfc77f6b058a54c3487bbd90b9b9f0629fe2bdaa40 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvZm9yZWlnbi1jb21taXQudGVzdC5tanMJYSAtQyBwYXRoIHRoYXQgcmVhY2hlcyB0aGlzIHJlcG9zaXRvcnkncyBnaXQgZGlyZWN0b3J5IGlzIG5ldmVyIGZvcmVpZ24JMjk2MGZiZTRjYzE5NjNjOTQxNDg0MzFjNTk5NWFmYTk4MTkzOWUxZGUzOGU1ZDdmNTgzOGIxMTM3NWZjYTc0MQpib2R5CXRlc3RzL2ZvcmVpZ24tY29tbWl0LnRlc3QubWpzCWEgbGl0ZXJhbCAtQyBjb21taXQgaW50byBhbm90aGVyIHJlcG9zaXRvcnkgaXMgYWR2aXNlZCwgYXJtZWQgb3Igbm90LCB1bmNoZWNrZWQgb3IgZmFzdC1wYXNzCWE2NDVlNDkyNzliNWM1ZDBiZDUyY2JkZDNmZjZhOThhYTliOTcwNGZkNTcwYzc2Yzc2MmU5YTRiNjQ2ODYyNDYKYm9keQl0ZXN0cy9mb3JlaWduLWNvbW1pdC50ZXN0Lm1qcwlhIHByb2JlIHRoYXQgZmFpbHMgcHJvdmVzIG5vdGhpbmcsIGFuZCB0aGUgcHJvYmUgaXMgYm91bmRlZCBhbmQgaGlkZGVuCWM5NzY5YWQzYTc2NmU4NDQ2ZmUxZjdmOGJlOGRkNmE0ZjZjZGJiNzZmMWJkM2UzZmMwYTUxNjU3ZDdhYzRkYmEKYm9keQl0ZXN0cy9mb3JlaWduLWNvbW1pdC50ZXN0Lm1qcwlhcml0aG1ldGljLCBhIGhlcmUtc3RyaW5nIGFuZCBhIGNvbW1hbmQgYmVmb3JlIHRoZSBjb21taXQga2VlcCB0aGUgcmVmdXNhbAllZjM1OWYyYmVjZTMxYWVhMmFhNjc5YTAzMjhhMzRkZjM4Nzg1N2RmZWVjNWQ4MWVlMzIxYTQ2MjM2ZGRlNmIyCmJvZHkJdGVzdHMvZm9yZWlnbi1jb21taXQudGVzdC5tanMJdGVzdHMvZm9yZWlnbi1jb21taXQudGVzdC5tanMgaXMgaW4gdGhlIGRlY2xhcmVkIGZhc3QgY2hlY2sJNDU1YTQ1MTU0NGI3MzU0ODc4ZjUxMDg3MGJhZTIzMzNhMWUzNzBlZjBhOTVmOTIyNDU2ZmE2MmZkOGU3Y2Q0MApib2R5CXRlc3RzL2ZvcmVpZ24tY29tbWl0LnRlc3QubWpzCXdoYXQgcnVucyBiZXNpZGUgdGhlIGNvbW1pdCwgb3IgcmVkaXJlY3RzIGl0LCBrZWVwcyB0aGUgcmVmdXNhbAkyOWQ3ZWQ4MjNkYWQyYWVmZDM3OTM1MjMxMjM3MmMzYTQxMDAyZmI4MDIyOGVjMTUxYzMxZTRiZjc0MTI2MWUx · test-lock-kind:replace
