# Task ADR-104-T3: a literal `cd` into another repository, then one commit, is advised

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one grammar arm, one test)
**Owner:** unassigned
**Produces:** the `cd L &&` arm of `foreignCommitPath` in `plugin/scripts/publish-command.mjs`
**Consumes:** `foreignCommitPath(command, env)` (T1)
**Proof map:** v1

## Goal

Alternative (d) of ADR-104, deferred there and taken by the owner on 2026-10-15 (BACKLOG §381, item 4b):
`cd L && git commit …` is read as T1 reads `git -C L commit …`, and the same common-directory probe decides.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/publish-command.mjs` | edit | the `cd` arm before T1's grammar: `cd` with exactly one absolute literal argument, joined by `&&` only |
| `tests/foreign-commit.test.mjs` | edit | the test below, beside T1's locked tests |
| `tests/mutations/plugin/scripts/publish-command.mjs.json` | edit | entries on the `&&` rule, the one-argument rule and the no-`-C` rule |

## Ordered Steps

1. [S1] Add the test below and record the red run (TDD red: the foreign `cd` row is refused today).
2. [S2] Read a leading `cd` with one absolute literal path, joined by `&&`, as the commit's location; the commit after it has
   no `-C`; the tail stays T1's data-only tail.
3. [S3] Record killed mutants for the `&&` rule, the one-argument rule and the no-`-C` rule. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/foreign-commit.test.mjs 2>&1) && ! printf '%s\n' "$out" | grep -q '# SKIP' \
  && test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "a literal cd into another repository, then one commit, is advised, and every other cd keeps the refusal")" = 1
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a literal cd into another repository, then one commit, is advised, and every other cd keeps the refusal` | `tests/foreign-commit.test.mjs` | `cd L && git commit -m x` and `cd L && git -c user.name=q commit …; echo` are advised with ADR-104's text; twins refused: `cd L; git commit`, `cd L \|\| git commit`, `cd L` then a newline, a relative `cd`, `cd ~/x`, `cd "$X"`, `cd -P L`, `cd L M` (zsh's substitution form), `cd L && cd M && git commit`, `cd L && git -C M commit`, `cd L && git commit && git push`, `cd` to this checkout or a subdirectory of it, and an unquoted here-document on the `cd` step | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the `cd` arm in `foreignCommitPath` |
| 2 — something selects it | `publishUnchecked`, through T1's branch |
| 3 — the caller can discover it | the advice names ADR-104 |
| 4 — it is used | the test drives the real PreToolUse hook |

## Mutation Log
- 2026-10-15 · 035be390* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a cd joined by ; or || or a newline, where a failed cd leaves the commit in this checkout, would be advised · acceptance-sha256:73cec165eea4b25beb23f3038db3481af906e74c776d7b1cd697af07dc5a2989
- 2026-10-15 · 035be390* · mutant survived · exit 0 · `plugin/scripts/publish-command.mjs` · a cd with an option, such as cd -P L, would be read as the commit's location · acceptance-sha256:73cec165eea4b25beb23f3038db3481af906e74c776d7b1cd697af07dc5a2989
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-10-15 · 035be390* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · an unquoted here-document on the cd step, whose $(…) runs, would be advised · acceptance-sha256:73cec165eea4b25beb23f3038db3481af906e74c776d7b1cd697af07dc5a2989
- 2026-10-15 · 035be390* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a cd with two paths, which zsh reads as a substitution in $PWD, would be read as the commit's location · acceptance-sha256:73cec165eea4b25beb23f3038db3481af906e74c776d7b1cd697af07dc5a2989

## Invariants

- After `;`, `||` or a newline, a `cd` that fails leaves the commit in this checkout: only `&&` is read.
- T1's rows and twins are unchanged; a `cd` row is advised only through the same successful probe.

## Risks

- `cd` honours `CDPATH` only for a relative path, and an absolute one is required here.

## Stop Condition

Stop and ask if any twin row is advised.

## Out of Scope

- `pushd`, `cd -P`/`-L` and other options (permanent: boundary: one plain spelling is what was asked for; anything else keeps the refusal)

## Verification Log
- 2026-10-15 · 035be390* · exit 1 · `out=$(node --test --test-reporter=tap tests/foreign-commit.test.mjs 2>&1) && ! printf '%s\n' "$out" | grep -q '# SKIP' \ …` · acceptance-sha256:73cec165eea4b25beb23f3038db3481af906e74c776d7b1cd697af07dc5a2989 · ms:13820 · test-lock-sha256:99b0bb852eace226cd1a8629729d387eb0b889c2ac4dea1c2b251fbddec9048e · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvZm9yZWlnbi1jb21taXQudGVzdC5tanMJYSAtQyBwYXRoIHRoYXQgcmVhY2hlcyB0aGlzIHJlcG9zaXRvcnkncyBnaXQgZGlyZWN0b3J5IGlzIG5ldmVyIGZvcmVpZ24JMjk2MGZiZTRjYzE5NjNjOTQxNDg0MzFjNTk5NWFmYTk4MTkzOWUxZGUzOGU1ZDdmNTgzOGIxMTM3NWZjYTc0MQpib2R5CXRlc3RzL2ZvcmVpZ24tY29tbWl0LnRlc3QubWpzCWEgbGl0ZXJhbCAtQyBjb21taXQgaW50byBhbm90aGVyIHJlcG9zaXRvcnkgaXMgYWR2aXNlZCwgYXJtZWQgb3Igbm90LCB1bmNoZWNrZWQgb3IgZmFzdC1wYXNzCWE2NDVlNDkyNzliNWM1ZDBiZDUyY2JkZDNmZjZhOThhYTliOTcwNGZkNTcwYzc2Yzc2MmU5YTRiNjQ2ODYyNDYKYm9keQl0ZXN0cy9mb3JlaWduLWNvbW1pdC50ZXN0Lm1qcwlhIGxpdGVyYWwgY2QgaW50byBhbm90aGVyIHJlcG9zaXRvcnksIHRoZW4gb25lIGNvbW1pdCwgaXMgYWR2aXNlZCwgYW5kIGV2ZXJ5IG90aGVyIGNkIGtlZXBzIHRoZSByZWZ1c2FsCWU2NDI1YzBiMjUzNTFkNTllNTBkYjY2YzY2MWZlN2IyYmUzZjQwNDM5NWUzNTI4YjI0OTI2NzFjODYzODU2MGYKYm9keQl0ZXN0cy9mb3JlaWduLWNvbW1pdC50ZXN0Lm1qcwlhIHByb2JlIHRoYXQgZmFpbHMgcHJvdmVzIG5vdGhpbmcsIGFuZCB0aGUgcHJvYmUgaXMgYm91bmRlZCBhbmQgaGlkZGVuCWM5NzY5YWQzYTc2NmU4NDQ2ZmUxZjdmOGJlOGRkNmE0ZjZjZGJiNzZmMWJkM2UzZmMwYTUxNjU3ZDdhYzRkYmEKYm9keQl0ZXN0cy9mb3JlaWduLWNvbW1pdC50ZXN0Lm1qcwlhcml0aG1ldGljLCBhIGhlcmUtc3RyaW5nIGFuZCBhIGNvbW1hbmQgYmVmb3JlIHRoZSBjb21taXQga2VlcCB0aGUgcmVmdXNhbAllZjM1OWYyYmVjZTMxYWVhMmFhNjc5YTAzMjhhMzRkZjM4Nzg1N2RmZWVjNWQ4MWVlMzIxYTQ2MjM2ZGRlNmIyCmJvZHkJdGVzdHMvZm9yZWlnbi1jb21taXQudGVzdC5tanMJbGl0ZXJhbCBkYXRhIGlzIG5vdCBhcml0aG1ldGljLCBhbmQgYW4gZXhwYW5zaW9uIG9mIGl0IHN0aWxsIGlzCWIzN2ZhMDgxMDQxZTI1MWRmOWZmZTJhMmQwYWNkYTA0YTNhMDk1NmU1Y2JjOWYzMWM4NzhkMWIxZDgzNjExOGIKYm9keQl0ZXN0cy9mb3JlaWduLWNvbW1pdC50ZXN0Lm1qcwl0ZXN0cy9mb3JlaWduLWNvbW1pdC50ZXN0Lm1qcyBpcyBpbiB0aGUgZGVjbGFyZWQgZmFzdCBjaGVjawk0NTVhNDUxNTQ0YjczNTQ4NzhmNTEwODcwYmFlMjMzM2ExZTM3MGVmMGE5NWY5MjI0NTZmYTYyZmQ4ZTdjZDQwCmJvZHkJdGVzdHMvZm9yZWlnbi1jb21taXQudGVzdC5tanMJd2hhdCBydW5zIGJlc2lkZSB0aGUgY29tbWl0LCBvciByZWRpcmVjdHMgaXQsIGtlZXBzIHRoZSByZWZ1c2FsCTI5ZDdlZDgyM2RhZDJhZWZkMzc5MzUyMzEyMzcyYzNhNDEwMDJmYjgwMjI4ZWMxNTFjMzFlNGJmNzQxMjYxZTE
  ```
  ```
- 2026-10-15 · 035be390* · exit 0 · `out=$(node --test --test-reporter=tap tests/foreign-commit.test.mjs 2>&1) && ! printf '%s\n' "$out" | grep -q '# SKIP' \ …` · acceptance-sha256:73cec165eea4b25beb23f3038db3481af906e74c776d7b1cd697af07dc5a2989 · ms:22936
- 2026-10-15 · 035be390* · exit 0 · `out=$(node --test --test-reporter=tap tests/foreign-commit.test.mjs 2>&1) && ! printf '%s\n' "$out" | grep -q '# SKIP' \ …` · acceptance-sha256:73cec165eea4b25beb23f3038db3481af906e74c776d7b1cd697af07dc5a2989 · ms:15711
- 2026-10-15 · 035be390* · exit 0 · `out=$(node --test --test-reporter=tap tests/foreign-commit.test.mjs 2>&1) && ! printf '%s\n' "$out" | grep -q '# SKIP' \ …` · acceptance-sha256:73cec165eea4b25beb23f3038db3481af906e74c776d7b1cd697af07dc5a2989 · ms:15446
- 2026-10-15 · 035be390* · exit 0 · `out=$(node --test --test-reporter=tap tests/foreign-commit.test.mjs 2>&1) && ! printf '%s\n' "$out" | grep -q '# SKIP' \ …` · acceptance-sha256:73cec165eea4b25beb23f3038db3481af906e74c776d7b1cd697af07dc5a2989 · ms:16824
- 2026-10-15 · 035be390* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:73cec165eea4b25beb23f3038db3481af906e74c776d7b1cd697af07dc5a2989 · ms:0 · test-lock-sha256:9395b2bbebbf928ee3073fe944052d25a03e8e63c42c319be1d8e20028c733cc · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvZm9yZWlnbi1jb21taXQudGVzdC5tanMJYSAtQyBwYXRoIHRoYXQgcmVhY2hlcyB0aGlzIHJlcG9zaXRvcnkncyBnaXQgZGlyZWN0b3J5IGlzIG5ldmVyIGZvcmVpZ24JMjk2MGZiZTRjYzE5NjNjOTQxNDg0MzFjNTk5NWFmYTk4MTkzOWUxZGUzOGU1ZDdmNTgzOGIxMTM3NWZjYTc0MQpib2R5CXRlc3RzL2ZvcmVpZ24tY29tbWl0LnRlc3QubWpzCWEgbGl0ZXJhbCAtQyBjb21taXQgaW50byBhbm90aGVyIHJlcG9zaXRvcnkgaXMgYWR2aXNlZCwgYXJtZWQgb3Igbm90LCB1bmNoZWNrZWQgb3IgZmFzdC1wYXNzCWE2NDVlNDkyNzliNWM1ZDBiZDUyY2JkZDNmZjZhOThhYTliOTcwNGZkNTcwYzc2Yzc2MmU5YTRiNjQ2ODYyNDYKYm9keQl0ZXN0cy9mb3JlaWduLWNvbW1pdC50ZXN0Lm1qcwlhIGxpdGVyYWwgY2QgaW50byBhbm90aGVyIHJlcG9zaXRvcnksIHRoZW4gb25lIGNvbW1pdCwgaXMgYWR2aXNlZCwgYW5kIGV2ZXJ5IG90aGVyIGNkIGtlZXBzIHRoZSByZWZ1c2FsCTM5OWZhZDJiZmZmOGJlOGRkODA0MmE0YzU2YTM5YmNmODEwY2UwMmJkZGE3ZTkzN2U3NTA2ZDBmNWZmYWE4ODAKYm9keQl0ZXN0cy9mb3JlaWduLWNvbW1pdC50ZXN0Lm1qcwlhIHByb2JlIHRoYXQgZmFpbHMgcHJvdmVzIG5vdGhpbmcsIGFuZCB0aGUgcHJvYmUgaXMgYm91bmRlZCBhbmQgaGlkZGVuCWM5NzY5YWQzYTc2NmU4NDQ2ZmUxZjdmOGJlOGRkNmE0ZjZjZGJiNzZmMWJkM2UzZmMwYTUxNjU3ZDdhYzRkYmEKYm9keQl0ZXN0cy9mb3JlaWduLWNvbW1pdC50ZXN0Lm1qcwlhcml0aG1ldGljLCBhIGhlcmUtc3RyaW5nIGFuZCBhIGNvbW1hbmQgYmVmb3JlIHRoZSBjb21taXQga2VlcCB0aGUgcmVmdXNhbAllZjM1OWYyYmVjZTMxYWVhMmFhNjc5YTAzMjhhMzRkZjM4Nzg1N2RmZWVjNWQ4MWVlMzIxYTQ2MjM2ZGRlNmIyCmJvZHkJdGVzdHMvZm9yZWlnbi1jb21taXQudGVzdC5tanMJbGl0ZXJhbCBkYXRhIGlzIG5vdCBhcml0aG1ldGljLCBhbmQgYW4gZXhwYW5zaW9uIG9mIGl0IHN0aWxsIGlzCWIzN2ZhMDgxMDQxZTI1MWRmOWZmZTJhMmQwYWNkYTA0YTNhMDk1NmU1Y2JjOWYzMWM4NzhkMWIxZDgzNjExOGIKYm9keQl0ZXN0cy9mb3JlaWduLWNvbW1pdC50ZXN0Lm1qcwl0ZXN0cy9mb3JlaWduLWNvbW1pdC50ZXN0Lm1qcyBpcyBpbiB0aGUgZGVjbGFyZWQgZmFzdCBjaGVjawk0NTVhNDUxNTQ0YjczNTQ4NzhmNTEwODcwYmFlMjMzM2ExZTM3MGVmMGE5NWY5MjI0NTZmYTYyZmQ4ZTdjZDQwCmJvZHkJdGVzdHMvZm9yZWlnbi1jb21taXQudGVzdC5tanMJd2hhdCBydW5zIGJlc2lkZSB0aGUgY29tbWl0LCBvciByZWRpcmVjdHMgaXQsIGtlZXBzIHRoZSByZWZ1c2FsCTI5ZDdlZDgyM2RhZDJhZWZkMzc5MzUyMzEyMzcyYzNhNDEwMDJmYjgwMjI4ZWMxNTFjMzFlNGJmNzQxMjYxZTE · test-lock-kind:replace
