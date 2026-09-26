# Task ADR-066-T2: SessionStart offers the hook through the environment file

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one module and its tests)
**Owner:** unassigned
**Produces:** `GIT_CONFIG_*` exports in `CLAUDE_ENV_FILE`; `publish.offered` / `publish.unarmed`
**Consumes:** `publishVerdict()`, `publish-hook.mjs`, `publish.hook-ran` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the probe decides the offer`, `the index is taken when the file is sourced`, `enabled beats a repo-local disable`

## Goal

At SessionStart, when `CLAUDE_ENV_FILE` is set, git run in the session's repository is probed for config-based hooks. If it names the probe hook, append exports that add `hook.qh-publish-commit` and `hook.qh-publish-push`:
- each with its `command` (which names its event), its event (`prepare-commit-msg`, `pre-push`), and `enabled=true`;
- indexed by a shell expansion over the `GIT_CONFIG_COUNT` in force when the file is sourced;
- not appended when the file already carries them.

Record `publish.offered`, or `publish.unarmed` with the probe's answer.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `offerPublishHook({ env, run, file })`, called from SessionStart; the two log events |
| `plugin/hooks/hooks.json` | read | SessionStart already runs `lifecycle.mjs`, which selects this; no new registration |
| `tests/publish-hook.test.mjs` | edit | the tests below |
| `tests/mutations.json` | edit | mutants |

## Ordered Steps

1. [S1] Write the tests below and see each fail on an assertion (TDD red).
2. [S2] Add `offerPublishHook`:
   - probe with `git -c hook.qhprobe.command=true -c hook.qhprobe.event=pre-commit hook list pre-commit`, run in the session's repository;
   - on a named `qhprobe`, append POSIX exports that read the current `GIT_CONFIG_COUNT` (default 0), add four entries after it, and raise the count;
   - skip when the file already names `hook.qh-publish-`.
3. [S3] Call it from SessionStart. Record `publish.offered`, or `publish.unarmed` with the reason: no env file, no repository, or the probe's answer.
4. [S4] Run the fence green, and record mutants with `adr-verify --mutant`:
   - start indices at 0;
   - offer without the probe;
   - drop `enabled=true`;
   - append twice.
   [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/publish-hook.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (sessionstart offers the hook only where git runs config hooks|an existing GIT_CONFIG_COUNT keeps its entries|the sourced env file makes git run the hook over a repo-local disable)' | grep -qx 3
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `sessionstart offers the hook only where git runs config hooks` | `tests/publish-hook.test.mjs` | a `run` seam whose probe names `qhprobe` appends the exports and logs `publish.offered`; one that does not (the clean twin) appends nothing and logs `publish.unarmed` with the reason; no `CLAUDE_ENV_FILE` is unarmed | none | S1, S2, S3 |
| `an existing GIT_CONFIG_COUNT keeps its entries` | `tests/publish-hook.test.mjs` | sourcing the file under `GIT_CONFIG_COUNT=1` leaves key 0 intact and makes ours keys 1-4; a second SessionStart appends nothing | none | S1, S2 |
| `the sourced env file makes git run the hook over a repo-local disable` | `tests/publish-hook.test.mjs` | in `sh`, sourcing the file makes `git hook list prepare-commit-msg` name `qh-publish` in a temporary repository whose local config sets `hook.qh-publish.enabled false` | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `offerPublishHook` |
| 2 — something selects it | SessionStart; the "offer without the probe" mutant |
| 3 — the caller can discover it | `publish.offered` / `publish.unarmed` in the session log |
| 4 — it is used | `publish.hook-ran` from T1, per session |

## Mutation Log
- 2026-09-26 · 7b6cbdd* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a git that does not run config hooks is offered the exports anyway · acceptance-sha256:35752c668e7ec8d85c1f7e930ea94fb3fe70e628642a95c74cafb7980ecf59cf · covers:the probe decides the offer
- 2026-09-26 · 7b6cbdd* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the exports overwrite a GIT_CONFIG_* entry already in force · acceptance-sha256:35752c668e7ec8d85c1f7e930ea94fb3fe70e628642a95c74cafb7980ecf59cf · covers:the index is taken when the file is sourced
- 2026-09-26 · 7b6cbdd* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a repository's own enabled=false switches the hook off · acceptance-sha256:35752c668e7ec8d85c1f7e930ea94fb3fe70e628642a95c74cafb7980ecf59cf · covers:enabled beats a repo-local disable
- 2026-09-26 · 7b6cbdd* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a resumed session appends a second copy of the exports · acceptance-sha256:35752c668e7ec8d85c1f7e930ea94fb3fe70e628642a95c74cafb7980ecf59cf
- 2026-09-26 · 7b6cbdd* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · SessionStart never offers the hook · acceptance-sha256:35752c668e7ec8d85c1f7e930ea94fb3fe70e628642a95c74cafb7980ecf59cf

## Invariants

- Nothing is written into any repository.
- An offer is not arming; T3 reads only `publish.hook-ran`.

## Risks

- A probe run outside a repository reads as unsupported; it runs in the session's repository, and `publish.unarmed` names which reason applied.

## Stop Condition

Stop and ask if a live Claude Code Bash call does not see the exports after SessionStart (checked in T3 S5).

## Out of Scope

- PowerShell sessions (deferred: docs/BACKLOG.md §301, the remaining text refusal)

## Verification Log
- 2026-09-26 · 7b6cbdd* · exit 1 · `set -o pipefail …` · acceptance-sha256:35752c668e7ec8d85c1f7e930ea94fb3fe70e628642a95c74cafb7980ecf59cf · ms:4714 · test-lock-sha256:33867eea2e5fe1aa3dc6d10dc1a3542e4e13bd3b5367205ac0d16f121c310fe2 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3B1Ymxpc2gtaG9vay50ZXN0Lm1qcwlhIGNoZWNrZWQgY29tbWl0LCBhIHBlcnNvbidzIGNvbW1pdCBhbmQgYSBtZXJnZSBwYXNzIHRoZSBob29rCThlMDQ5ODYxODNjYjE5NzQ1NGQ3ODhiOTMwNjE0NGQzMWM2NGRjOWY3OGNkYzNhNzJiNDUxYzE1OTVlNGU3NTAKYm9keQl0ZXN0cy9wdWJsaXNoLWhvb2sudGVzdC5tanMJYSBjaGVycnktcGljayBpbiBwcm9ncmVzcyBpcyBjb25jbHVkZWQgd2l0aG91dCB0aGUgaG9vayByZWZ1c2luZyBpdAk2OGQ3YmM5OGMzMTNjMjY4NTg2ZDg5NTE1NDU0OWNkNzI2YWI1NzNmMTFhNDdiNWQxN2M2MTk0MWVkMjRmZjQ2CmJvZHkJdGVzdHMvcHVibGlzaC1ob29rLnRlc3QubWpzCWFuIGV4aXN0aW5nIEdJVF9DT05GSUdfQ09VTlQga2VlcHMgaXRzIGVudHJpZXMJZWFmZTEzZGU4ZDY4NjNhMGNhZWJjMTUxZmI0ZDQxNTNjNDFlM2EyODJmZmU5NWE2YWViYTdiMDFlNTM1MThhNQpib2R5CXRlc3RzL3B1Ymxpc2gtaG9vay50ZXN0Lm1qcwlhbiB1bmNoZWNrZWQgY29tbWl0IGlzIHJlZnVzZWQgYnkgZ2l0IGluIHRoZSByZXBvc2l0b3J5IGl0IHJ1bnMgaW4JMzhlNTY1Y2IyN2M3YWU0NzU1YmVkMGI1ODEwNjhlMDU4YzJiN2ZkMDE0YjhjYTAyNmIxZGZjMTIyOTA5MGZmNQpib2R5CXRlc3RzL3B1Ymxpc2gtaG9vay50ZXN0Lm1qcwlzZXNzaW9uc3RhcnQgb2ZmZXJzIHRoZSBob29rIG9ubHkgd2hlcmUgZ2l0IHJ1bnMgY29uZmlnIGhvb2tzCWQ3OWExNzQzNjQxNTBhMWY2ZTc5M2ZhNGY1YTEyN2NhYzVhZTk0MzRjNWQ5NjFmZjkxZjYyYTdkZDg3ZDU4ZTgKYm9keQl0ZXN0cy9wdWJsaXNoLWhvb2sudGVzdC5tanMJdGhlIHNvdXJjZWQgZW52IGZpbGUgbWFrZXMgZ2l0IHJ1biB0aGUgaG9vayBvdmVyIGEgcmVwby1sb2NhbCBkaXNhYmxlCTRhZWYzMTMxZGU3NWJjZGU5YTFmMTFkZDAwNjQ0ZTEwMTg4YmEzMDNiM2UzNDI0NjcwZGI1MTA4MDhkODA0MjU
  ```
  --- last 10 line(s) of stderr (of 73 after folding 73 raw)
    ...
  1..6
  # tests 6
  # suites 0
  # pass 3
  # fail 3
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 4602.981625
  ```
- 2026-09-26 · 7b6cbdd* · exit 0 · `set -o pipefail …` · acceptance-sha256:35752c668e7ec8d85c1f7e930ea94fb3fe70e628642a95c74cafb7980ecf59cf · ms:4634
- 2026-09-26 · 7b6cbdd* · exit 0 · `set -o pipefail …` · acceptance-sha256:35752c668e7ec8d85c1f7e930ea94fb3fe70e628642a95c74cafb7980ecf59cf · ms:4443
- 2026-09-26 · 7b6cbdd* · exit 0 · `set -o pipefail …` · acceptance-sha256:35752c668e7ec8d85c1f7e930ea94fb3fe70e628642a95c74cafb7980ecf59cf · ms:12448
- 2026-09-26 · 7b6cbdd* · exit 0 · `set -o pipefail …` · acceptance-sha256:35752c668e7ec8d85c1f7e930ea94fb3fe70e628642a95c74cafb7980ecf59cf · ms:8563
- 2026-09-26 · 7b6cbdd* · exit 0 · `set -o pipefail …` · acceptance-sha256:35752c668e7ec8d85c1f7e930ea94fb3fe70e628642a95c74cafb7980ecf59cf · ms:16678
- 2026-09-26 · 7b6cbdd* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:35752c668e7ec8d85c1f7e930ea94fb3fe70e628642a95c74cafb7980ecf59cf · ms:0 · test-lock-sha256:a08d4a578ed430e910a427a477689711aa411e8e12b793a521339e9926592f95 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3B1Ymxpc2gtaG9vay50ZXN0Lm1qcwlhIGNoZWNrZWQgY29tbWl0LCBhIHBlcnNvbidzIGNvbW1pdCBhbmQgYSBtZXJnZSBwYXNzIHRoZSBob29rCThlMDQ5ODYxODNjYjE5NzQ1NGQ3ODhiOTMwNjE0NGQzMWM2NGRjOWY3OGNkYzNhNzJiNDUxYzE1OTVlNGU3NTAKYm9keQl0ZXN0cy9wdWJsaXNoLWhvb2sudGVzdC5tanMJYSBjaGVycnktcGljayBpbiBwcm9ncmVzcyBpcyBjb25jbHVkZWQgd2l0aG91dCB0aGUgaG9vayByZWZ1c2luZyBpdAk2OGQ3YmM5OGMzMTNjMjY4NTg2ZDg5NTE1NDU0OWNkNzI2YWI1NzNmMTFhNDdiNWQxN2M2MTk0MWVkMjRmZjQ2CmJvZHkJdGVzdHMvcHVibGlzaC1ob29rLnRlc3QubWpzCWFuIGV4aXN0aW5nIEdJVF9DT05GSUdfQ09VTlQga2VlcHMgaXRzIGVudHJpZXMJZWFmZTEzZGU4ZDY4NjNhMGNhZWJjMTUxZmI0ZDQxNTNjNDFlM2EyODJmZmU5NWE2YWViYTdiMDFlNTM1MThhNQpib2R5CXRlc3RzL3B1Ymxpc2gtaG9vay50ZXN0Lm1qcwlhbiB1bmNoZWNrZWQgY29tbWl0IGlzIHJlZnVzZWQgYnkgZ2l0IGluIHRoZSByZXBvc2l0b3J5IGl0IHJ1bnMgaW4JMzhlNTY1Y2IyN2M3YWU0NzU1YmVkMGI1ODEwNjhlMDU4YzJiN2ZkMDE0YjhjYTAyNmIxZGZjMTIyOTA5MGZmNQpib2R5CXRlc3RzL3B1Ymxpc2gtaG9vay50ZXN0Lm1qcwlzZXNzaW9uc3RhcnQgb2ZmZXJzIHRoZSBob29rIG9ubHkgd2hlcmUgZ2l0IHJ1bnMgY29uZmlnIGhvb2tzCWJiZDRiOTg0M2MxNGQ2ZGZiMGI4ZWJlODljZTYyZWQ1MjVkOTZkNjI5ZGEwNGEzMWJhZmFhZTgwNWFmNGVjODgKYm9keQl0ZXN0cy9wdWJsaXNoLWhvb2sudGVzdC5tanMJdGhlIHNvdXJjZWQgZW52IGZpbGUgbWFrZXMgZ2l0IHJ1biB0aGUgaG9vayBvdmVyIGEgcmVwby1sb2NhbCBkaXNhYmxlCTZiOGZmOWFjNWMxYmM2NGY5YjFjNDAyZDQxMWJlZDY5MjkyNzQ4OWY1M2FkYTViY2NlZDhhZmM3YmUyNWFhNGM · test-lock-kind:replace
