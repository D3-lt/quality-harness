# Task ADR-072-T2: `--narrow` proposes `only` from recorded killers, and writes only what it measured

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (one script, its test)
**Owner:** unassigned
**Produces:** `narrowEntry(entry, record, sources)` and the `--narrow` flag of `scripts/mutate.mjs`
**Consumes:** cache `entries[key].killers: string[]` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a narrowing names exactly its killers`, `a metacharacter matches only itself`, `an unproven narrowing is refused`, `a narrowing that is not RED is undone`, `a renamed killer is named by --stale`

## Goal

`--narrow` proposes an anchored, escaped `only` for each entry ADR-072 Decision 3 admits and refuses the rest by name. `--narrow --write` writes them, measures each, and undoes any that are not RED. `--stale` names a narrowed entry whose pattern names a test no named file defines (Decision 2).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/mutate.mjs` | edit | `narrowEntry`; `--narrow` in the flag set, the usage line, and `main` |
| `tests/mutate-runner.test.mjs` | edit | the pure function, and the flag over a scratch repository |
| `tests/mutations.json` | edit | the mutants below |

## Ordered Steps

1. [S1] Write the tests below and see them fail on an assertion (TDD red).
2. [S2] `narrowEntry`: an entry with killers `a` and `b.c(x)` gets `^(?:a|b\.c\(x\))$`. It refuses, naming why:
   - a killer that is not a verbatim string literal in a named file, including a name built with `${…}`;
   - no recorded killers;
   - an existing `only`;
   - a verdict other than RED at the current key.
3. [S3] `--narrow [--cache <file>]` prints each proposal and each refusal and writes nothing. `--narrow --write` follows ADR-069's order (claim the lock, read, write the `only` fields, measure). An entry that is not RED under its pattern gets its `only` removed and is named, and the command exits 1. It refuses uncommitted subjects like any campaign. [proof: acceptance]
4. [S4] Extend `staleEntries`' caller so `--stale` also reports a narrowed entry whose pattern names a test no named file defines. In a scratch repository, rename a narrowed entry's killer: `--stale` names it and exits non-zero.
5. [S5] Record mutants with `adr-verify --mutant`, one per Rests-on name. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/mutate-runner.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (narrowEntry proposes exactly the recorded killers, escaped and anchored, and refuses what it cannot prove|mutate --narrow proposes, writes only with --write, and undoes a narrowing that is not RED|mutate --stale names a narrowed entry whose killer is no longer defined)' | grep -qx 3
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `narrowEntry proposes exactly the recorded killers, escaped and anchored, and refuses what it cannot prove` | `tests/mutate-runner.test.mjs` | the pattern; the escaping; each refusal by name, a computed name included | — | S1, S2 |
| `mutate --narrow proposes, writes only with --write, and undoes a narrowing that is not RED` | `tests/mutate-runner.test.mjs` | in a scratch repository: read-only by default; the write and its measurement; the undo | — | S1, S3 |
| `mutate --stale names a narrowed entry whose killer is no longer defined` | `tests/mutate-runner.test.mjs` | a renamed killer is reported, and a defined one is not | — | S1, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `narrowEntry` and its tests |
| 2 — something selects it | `--narrow` in `main`'s flag handling; the mutant removing it |
| 3 — the caller can discover it | the usage line |
| 4 — it is used | T3 |

## Mutation Log
- 2026-09-28 · 38357ff* · mutant killed · exit 1 · `scripts/mutate.mjs` · the pattern is no longer anchored at either end · acceptance-sha256:c20ebf67aba3af40c463bfac2cc2908c65ddb6ec58ca1c0bc16d69fa0fc98620 · covers:a narrowing names exactly its killers
- 2026-09-28 · 38357ff* · mutant killed · exit 1 · `scripts/mutate.mjs` · a killer's metacharacters are left unescaped · acceptance-sha256:c20ebf67aba3af40c463bfac2cc2908c65ddb6ec58ca1c0bc16d69fa0fc98620 · covers:a metacharacter matches only itself
- 2026-09-28 · 38357ff* · mutant killed · exit 1 · `scripts/mutate.mjs` · a killer no named file defines as a literal is narrowed · acceptance-sha256:c20ebf67aba3af40c463bfac2cc2908c65ddb6ec58ca1c0bc16d69fa0fc98620 · covers:an unproven narrowing is refused
- 2026-09-28 · 38357ff* · mutant killed · exit 1 · `scripts/mutate.mjs` · an entry that is not RED under its pattern keeps the pattern · acceptance-sha256:c20ebf67aba3af40c463bfac2cc2908c65ddb6ec58ca1c0bc16d69fa0fc98620 · covers:a narrowing that is not RED is undone
- 2026-09-28 · 38357ff* · mutant killed · exit 1 · `scripts/mutate.mjs` · --stale exits 0 over a narrowed entry whose killer is gone · acceptance-sha256:c20ebf67aba3af40c463bfac2cc2908c65ddb6ec58ca1c0bc16d69fa0fc98620 · covers:a renamed killer is named by --stale
- 2026-09-28 · 38357ff* · mutant killed · exit 1 · `scripts/mutate.mjs` · --narrow is no longer an accepted option · acceptance-sha256:c20ebf67aba3af40c463bfac2cc2908c65ddb6ec58ca1c0bc16d69fa0fc98620

## Invariants

- An entry with an `only` is never touched.
- Without `--write`, nothing is written.

## Risks

- Test names that repeat across files: the "no named file defines it" refusal is what keeps a harvest collision from narrowing onto the wrong test.

## Stop Condition

Stop and ask if a narrowed entry that is RED whole-file is not RED under its pattern in the scratch repository.

## Out of Scope

- Applying it to the catalogue (T3's job).

## Verification Log
- 2026-09-28 · 38357ff* · exit 1 · `set -o pipefail …` · acceptance-sha256:c20ebf67aba3af40c463bfac2cc2908c65ddb6ec58ca1c0bc16d69fa0fc98620 · ms:7074 · test-lock-sha256:5673c52971605b1f1d3ec9bb309a9d40fcdc35172ee325d53767f7fffe47c4f9 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJLS1jaGFuZ2VkIHJlYWRzIGl0cyBkaWZmIGluIG9uZSBzaGFwZSB3aGF0ZXZlciB0aGUgdXNlciBjb25maWd1cmVkCTY5NmQ3ZDk2NTExYTQ2ZDAwNTQxYWE3YmRhZWIyNDQ5NTBlZjEyNjIwODU3NzU5Mjk0Y2NiNDcxOTU2ZTI4YmUKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCS0tY2hhbmdlZCBzZWxlY3RzIGEgc2hvcnQgbXV0YW50IGJ5IHdoZXJlIHRoZSBjaGFuZ2UgYWRkZWQgaXQJMTI4YjFkMWRhZmIwZmYyN2JjZWRiMzcxOTk5ZWEzOTNkZjI2OWQ0NTEzM2UxYjhiOGZmMjFkNTE0ZjBkYzAyZgpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJR1JFRU4gYW5kIFNUQUxFIGJvdGggY291bnQgYXMgbWlzc2VkIGFuZCBleGl0IDEJMDZmNmMwZmMyMGYwZTM3NGEyYTU4YjE2MTc0OGM1MjY3ZTQyZDdiNDk1MTYzOWQ3MzY1OThlMDlkYjQwOTQxNwpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJVU5QUk9WRU4gZW50cmllcyBhcmUgaW4gbmVpdGhlciBoYWxmIG9mIHRoZSBub3RpY2VkIHJhdGlvCWM1MTMxYWYyMTdlMDg2NjAyNjEwMzgxMDMwYWM1NjE1NjBhOTVlNjk1MGE0M2E4NDhlMWU4NjgwZmY1ZWViNTgKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWBvbmx5YCBiZWNvbWVzIGEgLS10ZXN0LW5hbWUtcGF0dGVybiBmb3IgdGhlIG11dGFudCBhbmQgaXRzIGJhc2VsaW5lIGFsaWtlLCBhbmQgbm90aGluZyB3aXRob3V0IGl0CTQyY2E2NzAzNGQwYmZhMGY2NmQ5MzU1ODIxYzlhN2U3MGQ0MDU3ZWU2MDAwY2NiNGIzNDMwNTJiY2EzNjcxM2IKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWEJODAyZjQwMDdiNWUxYjc1NmIzZjYzOThkNGQ1MWIyNTY0ZDliMjQ4OTQ4NzgyMWUzZjE0M2ZkNDI0N2ZjYWJjNgpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBiYXNlbGluZSBpcyB0YWtlbiBvbmNlIHBlciBkaXN0aW5jdCB0ZXN0LXNldCwgbm90IG9uY2UgcGVyIG11dGF0aW9uCWMxNTNiMzdiNDc3NDBiN2RkYTE4MjlkODE0NGFmNmQ1NThmOTU4Y2M2MzVlMWUzZTQ3NGM1ZmE1YWJjNzZjMjMKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWEgYmFzZWxpbmUgdGFrZW4gdW5kZXIgb25lIHBhdHRlcm4gbGljZW5zZXMgbm90aGluZyBhYm91dCBhbm90aGVyCWRkOWRhZGU4ZGExOTg5NDQzMTBmOTJiMmI2MWM2YmE5YTc0OTliZTMwNDBhNWU5YmUwYWNlN2E2YzFiMzQ1MDcKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWEgYmFzZWxpbmUgdGhhdCBuZXZlciByYW4gaXMgbm90IHJlcG9ydGVkIGFzIGFuIGFscmVhZHktZmFpbGluZyBzdWl0ZQk3N2M4MmQ2ZmRkYWQ1NTVhYjE3YzQ0MDUzYjE2ODhhZmQ5NTA1YTg2YzY2NWY0MTljMGI0ZDU3MmQ0NzUzYmY5CmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlhIGNhbXBhaWduIGxlYXZlcyBub3RoaW5nIGluIHRoZSB0ZW1wIGRpcmVjdG9yeSwgd2hhdGV2ZXIgaXRzIHRlc3RzIGZvcmdldAk3ZDc3NDk3MDUyNzZhMTIzNWEwYjc5MGJmMjk4NTkyYzU2Y2RiZjMwODk4NzdlYTc0NDYxYTg5OGE4NjgzOTYwCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlhIGNoYW5nZWQgc3ViamVjdCwgdGVzdCBvciBlZGl0IGlzIGEgZGlmZmVyZW50IG11dGFudAk5MTJlY2JiNjQyMGJiYjQ1ZDYxZDQzZDk1Y2RiMDgyMWY4ZGUyNjUwMjAyMWZhN2E0MzllODVjOTUxY2EwYTBhCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlhIGNoZWNrb3V0IHBhdGggd2l0aCBhIHNwYWNlIGlzIHN0aWxsIGFuIHVucnVuIGJhc2VsaW5lIHdoZW4gbm90aGluZyBtYXRjaGVkCTg1OWM0NmMxNGIxMTVlMzg0OGM1ZDBhZWRkNjNmZjc0M2Y1MzY4ZDZjYWE0YzQzYzkzOWQ4MjdhZTlkY2Q2OGYKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWEgZm9yY2VkIHJ1biByZXVzZXMgbm90aGluZwk4ODUwNTgxNzIwNmE5Y2I4YWZkMzE5NGVkMDNmOWExMTM0MTZhNWU4OGE1ODQxNDYxY2EyNDZkYjQ3OTUyMWE1CmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlhIGtpbGwgbmFtZXMgd2hpY2ggdGVzdHMgZmFpbGVkLCBzbyB0aGUgd3Jvbmcga2lsbGVyIGlzIHZpc2libGUJY2ViMjQyNzMzMGI2NDliZmE5ZjYzN2E4NjhmZGU2ZDFkZTA5MGJkYWViM2M3MjlmYmMzMTMxYTUxZDgxMTA4MQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBwYXJ0aXRpb24gc3RheXMgYSBwYXJ0aXRpb24gaG93ZXZlciB0aGUgY29zdHMgZmFsbAk3YTY2Yjg1Nzc2YmEzMjk3NzI4ZTFmOTVhYTdhNmUxMzBjNDc5MzcxMWE2ODhkYWMyMjZiZmQwNTRmMzhjMWFkCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlhIHBhc3NpbmcgYmFzZWxpbmUgbGVhdmVzIGV2ZXJ5IGV4aXN0aW5nIHZlcmRpY3QgZXhhY3RseSBhcyBpdCB3YXMJOTdiMjg1ZmE1NTg5YTRlOWJmZTEzYTM1ZDViOTM5NDA0OThkMjZiMTkxYjI5ODBiYTk2NzM1ZDdjNjY0OTAxYQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBydW4gaW4gd2hpY2ggbm8gdGVzdCBleGVjdXRlZCBpcyBhbiB1bnJ1biBiYXNlbGluZSwgbmV2ZXIgYSBwYXNzaW5nIG9uZQk3Zjg4MWJkZDhjN2Y3NzRmOTViY2EyYmNkZDM4ZjVmMmVjZGJkY2E2Y2FlNTRkZTE5MDQ3ZTBjMTg5Y2NkMTlhCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlhIHJ1biBraWxsZWQgYnkgc2lnbmFsIGlzIEhVTkcgcmF0aGVyIHRoYW4gR1JFRU4JYzFhNmJkOTIxMjk3MjBjMjUwOGM4YmE2ZWM4Zjc5M2E4MGE1MzY0YjA3MjM4ZTBjZGJiMjI5YmQ4NmJiYTY0OQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSBzdGFsZSBlbnRyeSBpcyBkZWNpZGVkIGJlZm9yZSBhbnkgYmFzZWxpbmUsIGJlY2F1c2Ugbm90aGluZyB3YXMgYXBwbGllZAllOWExZTE0NmRlNWFjNWJkN2EzNDBhZTM4MWJkM2IxNjljZTFiNmMwOWU0NDBjZmUyN2NiNmZiNjIzNjFmNGE5CmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlhIHN0YWxlIG11dGF0aW9uIGlzIHJlcG9ydGVkIGFzIHN0YWxlLCBub3QgYXMgYSB0ZXN0IHRoYXQgZmFpbGVkIHRvIG5vdGljZQk1ZGU5YWU3MWUwYmE2ZGZjMDBhYWVlODBkMjAyYjVhY2QxNmE0N2Y1Yzc3NmMxYTUwZDI2YzY0OWI2Y2EyNjI5CmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlhIHN0YWxlIG11dGF0aW9uIHJlbmRlcnMgYSBsaW5lIHJhdGhlciB0aGFuIGEgYmxhbmsJOWM5MzVlNDVlOTIyZjdiMzA1NmM0ZTdkZDUzMjlhM2QwMTMwYzJkNTQ0Mzg4MTYxZWZmM2FiYTViMTE0NjcxZQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYSB0ZXN0IG5hbWUgdGhhdCBtZW50aW9ucyBhIGRpcmVjdG9yeSBpcyBhIG5hbWUsIG5vdCBhIGZpbGUgcGF0aAliYmIwZWUwZTNjYTU2ZTFkMGFlYzFiNDIyZTM0MjhkNzNkZDBlMjJmMGU0OGYzMGQ5N2Y4YTczMjRlOGQ0ZjczCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlhIHZlcmRpY3QgdGFrZW4gYWdhaW5zdCBhIGZhaWxpbmcgYmFzZWxpbmUgaXMgVU5QUk9WRU4sIG5vdCBSRUQJZDcxNDBiZWNjZGRlMmNmNGI1ZjVmMGQ0ZTUyMzAzZmY5Y2I1OTI1MmIzZWUwMmI3YjA5MGM1OGFiYjIxMzk5Zgpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYW4gVU5QUk9WRU4gZW50cnkgbmFtZXMgaXRzIHRlc3Qtc2V0IGFuZCB0aGUgbmV4dCBhY3Rpb24JZmM2YzkzYzQ0YzFlMzM1YTA0Yjc2ZmNhM2IyZjgyYTc5NDM1ZjljNTc4NTQ3MDU4NTgwN2I4OGJkM2JhZDQzMApib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYW4gVU5QUk9WRU4gZW50cnkgc3RpbGwgcmVwb3J0cyB0aGUgdmVyZGljdCB0aGUgdGVzdHMgcHJvZHVjZWQJNGVjN2NjZWFiNmVmNzM4YzBmYjMxMjQyZDM3OTBlZDhkNTQ4YmUzNTUyOWVkMGMwZTViMjUyNWNmYzlhNTYxMApib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYW4gYWJzZW50IG9yIHVucmVhZGFibGUgY2FjaGUgbWVhc3VyZXMgZXZlcnl0aGluZwk3OTY2NDQwYmJiZDI3ZWY3MWMwMDg0MTUwMzAwODUwOGZlMGIxZDEzODFlNDQ1MDJlYzYzYjcyMWM3OWJkZWVhCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwlhbiBleGFjdCBjb250ZW50IG1hdGNoIHJldXNlcyBhIFJFRCB2ZXJkaWN0CTA2ZDFmMGY2N2FhNzU0MDUyNmJkYWY5YjczNmU4YWYyMWNhZjFmMjljODlhNTc1NDU1ZmI0YmZmYWJlZWE2NDAKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWFuIGluaGVyaXRlZCBGT1JDRV9DT0xPUiBpcyBkcm9wcGVkLCBzbyBhIHJlYWwgcnVuIHN0aWxsIGNvdW50cyBpdHMgdGVzdHMJYjg2NGY0ZTRjMGIyZTk0ZjcwMTUxMDhiNzdiMWJiNTQxOTM4NDZhNGUyMWFiZDBlZjBjNjJkNzJhNzkwYjQyZApib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJYW4gdW5yZWFkYWJsZSBpbnB1dCBoYXMgbm8ga2V5LCBzbyBpdCBpcyBtZWFzdXJlZAlkYWJmZTI5NzBhYjJkNzM3ZTdiMmEzYzBkNjllYmMxN2FiOTg2OTgxZjBhOTk3MzYxNzI5ZGY2NjM3ZDgyMzU0CmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwljYW1wYWlnblBhdGhzIGtlZXBzIGV2ZXJ5IGNhbXBhaWduIGZpbGUgaW5zaWRlIHRoZSByb290IGl0IGlzIGdpdmVuCTk0NjJhZTNjZmRjNmIxMzljOGZmNTVlNTU1NjA1NmYxZTI2YmQ3M2FhMmVkZWExNjAzMGU3NjY4OTcxOWYxZGMKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWVuZCB0byBlbmQ6IGEgbm9uc2Vuc2UgcGF0dGVybiB1bmRlciBhbiBpbmhlcml0ZWQgZG90IHJlcG9ydGVyIGlzIHVucnVuLCBhbmQgYSBtYXRjaGluZyBvbmUgcGFzc2VzCWQ5ZDcwMDJhZjk2ODdlNjdkOTg3N2Q3ZWFhM2NmZDljZGM4Mzg0NTU5ZWRjZmVjYjgwMzdkNzhkZDFkNThjMmIKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCWYgYW5kIGcJMDVlOWM4ZjY0NmVlYjgzMWNjZDY4ZDFhMDBkODFmZDBkOTYwYTM5ZWNlMTlkOWQwZTJjNzZkYzRjMGU2MmY0OQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJa2lsbGVycyBhcmUgcmVuZGVyZWQgb25lIHBlciBsaW5lLCBiZWNhdXNlIG5hbWVzIGNvbnRhaW4gY29tbWFzCWZlOTc0MTc0YzA4N2YxYmM0NWYzNDA3NGQyMWRlNGEyZjIzZDM3MmIwMTYyZTRhZmIwMDhlYTk4MmM5YjM1NTIKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCW11dGF0ZSAtLW5hcnJvdyBwcm9wb3Nlcywgd3JpdGVzIG9ubHkgd2l0aCAtLXdyaXRlLCBhbmQgdW5kb2VzIGEgbmFycm93aW5nIHRoYXQgaXMgbm90IFJFRAk1ZjVmYjA0Y2JmNjBhZmE4OTUyMzdhMGU1NjM4ZmZmZGJiY2MzOTEwNjU4MmMyZmVlMWFhNDU0NmUwZGE5NDc3CmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwltdXRhdGUgLS1yZXBvaW50IC0tcmVhbmNob3IgcHJvcG9zZXMgd2hhdCByZXBvaW50RW50cnkgcmVmdXNlZCwgYW5kIC0tcmVwb2ludCBhbG9uZSBpcyB1bmNoYW5nZWQJYmM2ZTY2NTRlYjBjMTg1NDhiODY2MTZiY2ZiYjA5YWI2MGZmMTM2MDE0ZDJiNzU1ZjQyYzIwYWQ3MWNkZThkMwpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJbXV0YXRlIC0tcmVwb2ludCAtLXdyaXRlIHJld3JpdGVzIG9ubHkgd2hhdCBpdCBwcm9wb3NlZCwgbWVhc3VyZXMgaXQsIGFuZCBuYW1lcyB3aGF0IHN0YXllZCByZWZ1c2VkCTAyNmZjZjg5NGEyNmZmMTNlNjdhZmQzOGU4ZGY0ZDFlM2ZjODk5NTdjNmVkMjQ2YmM4ZDFjZTFjOTBjNDUyNzkKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCW11dGF0ZSAtLXJlcG9pbnQgcmVhZHMgYSBzY3JhdGNoIHJlcG9zaXRvcnksIHdyaXRlcyBub3RoaW5nLCBhbmQgZXhpdHMgMSB3aGlsZSBhbiBlbnRyeSBpcyBzdGFsZQlhZTc1YWYyNmQzNjkxMjQ1NmUyODNmYTg0Y2MyZjQ2OWRmMWY0NWEwZjQ1YmZlZDliZDQ3MTZiZGY1NjhiY2QwCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwltdXRhdGUgLS1zdGFsZSBuYW1lcyBhIG5hcnJvd2VkIGVudHJ5IHdob3NlIGtpbGxlciBpcyBubyBsb25nZXIgZGVmaW5lZAk4MTJmMDViNzJmODNlYWJkNGNiODdkZTU5NGQ4Mjc3MzMyM2U0Mjg2ZDBkYTk0MDE3ZjQ2ZTQyMmFjYzQ4NmNhCmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwltdXRhdGUgLS1zdGFsZSBvdmVyIHRoZSByZWFsIGNhdGFsb2d1ZSBleGl0cyAwIGFuZCBzYXlzIGV2ZXJ5IGVudHJ5IG1hdGNoZXMJODFhYWFhNmZmOWI5MTNiZjVmNzA3MTM3NWFhMWM4MWYwMmJjZDY1YjBiZDZmNmVlNDJlYzU1NTQyY2IxOWM2MApib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJbmFycm93RW50cnkgcHJvcG9zZXMgZXhhY3RseSB0aGUgcmVjb3JkZWQga2lsbGVycywgZXNjYXBlZCBhbmQgYW5jaG9yZWQsIGFuZCByZWZ1c2VzIHdoYXQgaXQgY2Fubm90IHByb3ZlCTE4MzdmMjhjZmI3MDRmYTJhMWM0ZmYzZWY5NGExZGU5ZjYwMjgwNWJlNzBiNWNhOWNiNGIzMDA2YTNkZjg0ODQKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCW9ubHkgUkVEIGlzIHJldXNhYmxlCWFmNzg3NGZhZTA2MzAyNDI1ZjBlZTBiNWY5ZWZkMmEyMWM5MDk4Njc4NjdhN2U2YjYxNzY4YmJmNzQ4NTc5ZjkKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCXJlYW5jaG9yRW50cnkgcmVwcm9kdWNlcyB0aGUgaGFuZCByZXBvaW50cyByZXBvaW50RW50cnkgcmVmdXNlZCwgYW5kIHByb3Bvc2VzIG5vIGxpbmUgdGhlIGhhbmQgZGlkIG5vdCBjaG9vc2UJZTM2ZjQ5MWIyNTcyODNiNjY2MDUyODBlZmUzMDE4OWY2YjlhMWQyMTdmY2E4MDNmNWFjNWMyMjlmMDMxYWQ3YQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJcmVwb2ludEVudHJ5IHJlcHJvZHVjZXMgdGhlIG1lY2hhbmljYWwgcmVwb2ludHMgb2YgdGhlIDMuMS4wIGJhdGNoIGFuZCByZWZ1c2VzIHRoZSByZXN0CWY1YWU1YjE2ZTVmNzRkN2E4Y2Q5NzFlMjUwNzFhMzFhYzllNzFkZDA5MjQyYjA2ZDE2MmFjMDBlY2E2NzVhMmEKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCXNoYXJkcyBhcmUgYmFsYW5jZWQgYnkgbWVhc3VyZWQgY29zdCB3aGVuIHRpbWluZ3MgZXhpc3QJYTUwMmI0OTAzYmYxYjAyZTM1OTE3ZTA4NzcwMTM1NzMzM2E1NGMwNTdkMjA3ZjRlNGNkNTA1MWY5MGM4OWFkMQpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJc3RhbGVFbnRyaWVzIG5hbWVzIGVhY2ggZW50cnkgdGhhdCBubyBsb25nZXIgbWF0Y2hlcyBvbmNlLCB3aXRoIHdoZXJlIGl0cyBsaW5lIHdlbnQJMjc5YWNjN2E2ZmU5MmI2N2ZjOTk1MjI3ZjQ5YjkxNWY5MjEzZDc3ZmQ5YjYxZjExZjc0OTM5OTdjZDNiNTM1Ygpib2R5CXRlc3RzL211dGF0ZS1ydW5uZXIudGVzdC5tanMJdGhlIGNhbXBhaWduIGNhY2hlIHJlY29yZHMgdGhlIHRlc3RzIHRoYXQga2lsbGVkIGVhY2ggUkVEIGVudHJ5CWRhYmM5ZWZhZDU3MTk1YWI4YWM1YTM5ODEwZDk4NDUzYzg3NWQxY2RhMGViYzczNTQyZGMxYmJlMWFjOGFjMTEKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCXRoZSByZXBvcnQgbmFtZXMgdGhlIGtpbGxlciBiZXNpZGUgYSBSRUQgdmVyZGljdAlkNDQ5YzA3OWMyOTExYzg5MGNmNTYxMzYzZjhjODFlM2MwMDRhZjljMTVkZGNkN2JmN2Q5ZTU1ODJkZTAwMjQ0CmJvZHkJdGVzdHMvbXV0YXRlLXJ1bm5lci50ZXN0Lm1qcwl0aGUgc3VtbWFyeSBkaXN0aW5ndWlzaGVzIG1lYXN1cmVkIGZyb20gcmV1c2VkCWZiMzNlNmVlMTMzMzA3NGViMGE4M2ZjNTZkMWM3YTUzY2E4ZDZhMGZkYjY5NDE5YjQ1OTE5ZGM1N2I2ODM5ZDYKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCXRvdWNoZWRCeSBrZWVwcyBhbiBlbnRyeSB3aG9zZSBtdXRhdGVkIGxpbmUgd2FzIGFkZGVkIGJ5IHRoZSBjaGFuZ2UsIGFuZCBvbmx5IHRob3NlCTBkMzY4ZjMxZDYzZTgyYjY4ZDZmY2M0ODY0ZDIxNmUyM2Y1N2ZmZjMzZTNiYzFiZDVlYmMwNGMyMjllMzZkOTUKYm9keQl0ZXN0cy9tdXRhdGUtcnVubmVyLnRlc3QubWpzCXdpdGggbm8gdGltaW5ncyBhdCBhbGwgaXQgc3RpbGwgcGFydGl0aW9ucywgYW5kIHNheXMgbm90aGluZyBhYm91dCBiYWxhbmNlCTUyY2E4OWQ3NDJjMjRhNzEzMGU1YjBjY2Q4OGJjMmQ0NTkzYWNjOTlmZTc2M2ZiZjY1ZDU3YzMxZGNjMGNiODc
  ```
  --- last 10 line(s) of stderr (of 362 after folding 365 raw)
    ...
  1..48
  # tests 48
  # suites 0
  # pass 45
  # fail 3
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 6968.060542
  ```
- 2026-09-28 · 38357ff* · exit 0 · `set -o pipefail …` · acceptance-sha256:c20ebf67aba3af40c463bfac2cc2908c65ddb6ec58ca1c0bc16d69fa0fc98620 · ms:8830
- 2026-09-28 · 38357ff* · exit 0 · `set -o pipefail …` · acceptance-sha256:c20ebf67aba3af40c463bfac2cc2908c65ddb6ec58ca1c0bc16d69fa0fc98620 · ms:11151
- 2026-09-28 · 38357ff* · exit 0 · `set -o pipefail …` · acceptance-sha256:c20ebf67aba3af40c463bfac2cc2908c65ddb6ec58ca1c0bc16d69fa0fc98620 · ms:14320
- 2026-09-28 · 38357ff* · exit 0 · `set -o pipefail …` · acceptance-sha256:c20ebf67aba3af40c463bfac2cc2908c65ddb6ec58ca1c0bc16d69fa0fc98620 · ms:13723
- 2026-09-28 · 38357ff* · exit 0 · `set -o pipefail …` · acceptance-sha256:c20ebf67aba3af40c463bfac2cc2908c65ddb6ec58ca1c0bc16d69fa0fc98620 · ms:12968
- 2026-09-28 · 38357ff* · exit 0 · `set -o pipefail …` · acceptance-sha256:c20ebf67aba3af40c463bfac2cc2908c65ddb6ec58ca1c0bc16d69fa0fc98620 · ms:11619
