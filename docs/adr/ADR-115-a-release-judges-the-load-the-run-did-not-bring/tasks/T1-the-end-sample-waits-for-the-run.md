# Task ADR-115-T1: The release check's end sample waits for the run's own load to leave

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** the settled end sample in `scripts/release.mjs`
**Consumes:** none
**Data dependency:** hermetic; the load is a seam the test drives
**Proof map:** v1

## Goal

`release.mjs` judges a full check's pass by its start sample and by a sample taken once the run's own load has decayed, for at most 4 minutes (ADR-115, Decision 1).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/release.test.mjs` | edit | a new test beside the locked ones; the unlocked contended-pass test is rewritten to the new rule |
| `scripts/release.mjs` | edit | the settle wait after the check |
| `CLAUDE.md`, `.claude/rules/13-releasing.md` | edit | §13 step 1 says what not contended means now |
| `tests/mutations/scripts/release.mjs.json` | edit | catalogue entries for the mutants |

## Ordered Steps

1. [S1] Write the failing test: a load of 7 at the start and 17 at exit that falls to 9 within the bound releases; one that stays at 12 past the bound stops with nothing pushed; a start of 12 is taken again once quiet. Record the red run.
2. [S2] Add the settle wait to `release.mjs`, bounded by its own clock seam, and update §13's wording.
3. [S3] Record a killed mutant per decision point (the wait removed, the bound lengthened, the start sample ignored), with catalogue entries. A bound removed outright makes the loop synchronous and endless, which no test in the same process can observe, so the bound is shown by its length. [proof: mutation]

## Acceptance

```bash
node --test tests/release.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a pass whose load falls to the core count after the run is not contended, and one that stays above it is` | `tests/release.test.mjs` | the settled end sample, its bound, and the start sample | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the change |
| 2 — something selects it | `release()`'s check step, and the mutant that removes the wait |
| 3 — the caller can discover it | the release's own lines |
| 4 — it is used | every release |

## Mutation Log
- 2026-10-19 · 47a6febe* · mutant killed · exit 1 · `scripts/release.mjs` · the end sample is taken at exit, with the run own load in it · acceptance-sha256:4247e34de3a0acb6ddfa1120024e97e7175056c19102b763ae030b61016ea172
- 2026-10-19 · 47a6febe* · mutant killed · exit 1 · `scripts/release.mjs` · a machine saturated before the run is not contention · acceptance-sha256:4247e34de3a0acb6ddfa1120024e97e7175056c19102b763ae030b61016ea172
- 2026-10-19 · 47a6febe* · mutant killed · exit 1 · `scripts/release.mjs` · the settle wait outlasts the 4-minute bound, so other work that ends late reads as quiet · acceptance-sha256:4247e34de3a0acb6ddfa1120024e97e7175056c19102b763ae030b61016ea172
- 2026-10-19 · a16c5356* · mutant killed · exit 1 · `scripts/release.mjs` · a quiet sample read after the bound counts · acceptance-sha256:4247e34de3a0acb6ddfa1120024e97e7175056c19102b763ae030b61016ea172
- 2026-10-19 · a16c5356* · mutant killed · exit 1 · `scripts/release.mjs` · an unread start is judged by its settle samples alone · acceptance-sha256:4247e34de3a0acb6ddfa1120024e97e7175056c19102b763ae030b61016ea172

## Invariants

- A contended pass never leads to a push; a wait always has a bound.
- `plugin/` is unchanged.

## Risks

- A bound too short reads the run's own load as contention; the test drives the decay through the seam.

## Stop Condition

Stop if the change would touch `plugin/scripts/load.mjs` or `qh-check`.

## Out of Scope

- A slowdown-based measure (deferred: docs/BACKLOG.md §384)

## Verification Log
- 2026-10-19 · 47a6febe* · exit 1 · `node --test tests/release.test.mjs` · acceptance-sha256:4247e34de3a0acb6ddfa1120024e97e7175056c19102b763ae030b61016ea172 · ms:196 · test-lock-sha256:57bbe6040e5132d3b631f14969f4b6972320a6143f4bc66a8361d0ae83753b59 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcmVsZWFzZS50ZXN0Lm1qcwlhIGZhaWxlZCB0YWcgZmV0Y2ggb3IgdGFnIGxpc3Qgc3RvcHMgdGhlIHJlbGVhc2UJZWQyNTE3MTczNGVhYzBkMmQ1ZjU4YTA3MTA4NDBhYTllZmFhODhiODE5YjE1NzQ4ZjIzMjA0YjJkYmY4Zjg1NQpib2R5CXRlc3RzL3JlbGVhc2UudGVzdC5tanMJYSBmb3JnZSB0aGF0IGNhbm5vdCBiZSBhc2tlZCBpcyBub3QgcmVhZCBhcyBhIHJlbGVhc2UgdGhhdCBpcyBtaXNzaW5nCWUyZGNhYWQ2YTE0NTJiMDAzOTc5YTlkN2IyNDQzZGQzYTgxMzRhZGFkYWE1Y2U5NjhiMTc1Mzc0ZDM3NGIyODAKYm9keQl0ZXN0cy9yZWxlYXNlLnRlc3QubWpzCWEgZnVsbCBjaGVjayB0aGF0IHBhc3NlZCBvbiBhIGNvbnRlbmRlZCBtYWNoaW5lIGlzIHRha2VuIGFnYWluIHdoZW4gaXQgaXMgcXVpZXQsIGFuZCB0d2ljZSBjb250ZW5kZWQgc3RvcHMgdGhlIHJlbGVhc2UJZGFjMzAzOWJkMWIyYzE3OGM5YzQwNDM5MTgxOGMyMThiYjk5OTE0ZDM2ODQ3NmQ4MjBjODkwZTVjMmMzMmMyZgpib2R5CXRlc3RzL3JlbGVhc2UudGVzdC5tanMJYSBwYXNzIHdob3NlIGxvYWQgZmFsbHMgdG8gdGhlIGNvcmUgY291bnQgYWZ0ZXIgdGhlIHJ1biBpcyBub3QgY29udGVuZGVkLCBhbmQgb25lIHRoYXQgc3RheXMgYWJvdmUgaXQgaXMJY2YzYjk1NGU4NTRiYWZlOGNkZDcxMjYwMWM5MzNjM2YyZWRhODUxMzM3ZjQwNzVhZTQ3NjU5YWI1N2Y1ZGVjNQpib2R5CXRlc3RzL3JlbGVhc2UudGVzdC5tanMJYSByZWQgY2hlY2sgb3IgYSBkZWFkLWNvZGUgZmluZGluZyBzdG9wcyB0aGUgcmVsZWFzZSBiZWZvcmUgYW55IHB1c2gJZjZlYjE0MjkxMzVmMmJjNDYxMWZiNjNmMWJkYWM5MzcxZjBmYmFmMWY1OTI2YjhiZmQyMDUyMmJjOTEwN2M0Ngpib2R5CXRlc3RzL3JlbGVhc2UudGVzdC5tanMJYSByZWxlYXNlIG1hZGUgb24gdGhlIGZvcmdlIGJ1dCBub3QgZmV0Y2hlZCBoZXJlIGlzIHNhaWQgYXMgcmVsZWFzZWQJNDMwYTU4MGNmMDAyMjRiNjk3ZDJhYzUxOWJmNDFiMTkxNTAyN2FiZmI5NDRiODZkY2I4MWExMGQ3YjU4MmI0Nwpib2R5CXRlc3RzL3JlbGVhc2UudGVzdC5tanMJYSB3YWl0IHBhc3QgaXRzIGRlYWRsaW5lIGV4aXRzIDMgYW5kIG5hbWVzIHdoYXQgaXQgd2FpdGVkIGZvcgk0ZDgxYjYyZWViNGIzMWEzMjQyY2QxMjhkYTYyZGU0ZGNjNjExN2MyNDI0YTkyNjE5ZmY1YmUyNjY3OTAwOGZkCmJvZHkJdGVzdHMvcmVsZWFzZS50ZXN0Lm1qcwlyZWxlYXNlIGRpc3BhdGNoZXMgdGhlIGNhbXBhaWduIG9ubHkgYWZ0ZXIgdGhlIHB1c2ggcnVuIGV4aXN0cwk5YTE5OTIyNDllMDRhOGIyYzlhYmM4YzI3M2FmNzVjNGE1MDZhYTE2ZDk0ZDE0ZGUxYmY1ZTQ5OTJkOGUxOTFkCmJvZHkJdGVzdHMvcmVsZWFzZS50ZXN0Lm1qcwlyZWxlYXNlIHJlc3VtZXMgZnJvbSB3aGF0IGl0IG9ic2VydmVzIGFuZCByZXBlYXRzIG5vIHN0ZXAgd2hvc2UgcmVzdWx0IGlzIGFscmVhZHkgdGhlcmUJNzNlZmU2MGM1ZDZlY2QzNDJiMGViYTZjOTYzZWE1MzhiYmE3NThmZjVjOGY1MzI0ODNjNjgzN2Y2NmRlZTU5NApib2R5CXRlc3RzL3JlbGVhc2UudGVzdC5tanMJcmVsZWFzZSBzdG9wcyBhbmQgc2F5cyBidW1wIHdoZW4gcGx1Z2luLmpzb24gbmFtZXMgdGhlIG5ld2VzdCB0YWcncyB2ZXJzaW9uCWJkODI3ODNjODA4MmZlZjZkZmRlYjZhMjhmYmY5OTA2MTA1NDg3YjEzZjc0ZjFiMzY3ZjQ0NDQwN2MxY2MyZjAKYm9keQl0ZXN0cy9yZWxlYXNlLnRlc3QubWpzCXJlbGVhc2UgdGFncyBvbmx5IGEgc2hhIHJlbGVhc2UtZXZpZGVuY2UgY2xlYXJzLCB3aXRoIGl0cyBmdWxsIHNoYSBhbmQgLS1sYXRlc3QJZTU0ODAxYmZiNDU2MWUzMWM1MDkzZTM1ZDI4MzFlNjU5ZDljMzA2MWMzZDM5ZjM4YzkwMDI0N2FiNjQxNzU0OQ
  ```
  --- last 10 line(s) of stdout (of 42 after folding 42 raw)
        at Test.postRun (node:internal/test_runner/test:1542:19)
        at Test.run (node:internal/test_runner/test:1467:12)
        at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: 2,
      expected: 1,
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-10-19 · 47a6febe* · exit 0 · `node --test tests/release.test.mjs` · acceptance-sha256:4247e34de3a0acb6ddfa1120024e97e7175056c19102b763ae030b61016ea172 · ms:245
- 2026-10-19 · 47a6febe* · exit 0 · `node --test tests/release.test.mjs` · acceptance-sha256:4247e34de3a0acb6ddfa1120024e97e7175056c19102b763ae030b61016ea172 · ms:247
- 2026-10-19 · 47a6febe* · exit 0 · `node --test tests/release.test.mjs` · acceptance-sha256:4247e34de3a0acb6ddfa1120024e97e7175056c19102b763ae030b61016ea172 · ms:242
- 2026-10-19 · a16c5356* · exit 0 · `node --test tests/release.test.mjs` · acceptance-sha256:4247e34de3a0acb6ddfa1120024e97e7175056c19102b763ae030b61016ea172 · ms:244
- 2026-10-19 · a16c5356* · exit 0 · `node --test tests/release.test.mjs` · acceptance-sha256:4247e34de3a0acb6ddfa1120024e97e7175056c19102b763ae030b61016ea172 · ms:243
- 2026-10-22 · 733d4c29* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:4247e34de3a0acb6ddfa1120024e97e7175056c19102b763ae030b61016ea172 · ms:0 · test-lock-sha256:e33429c6c85b6719bc48ab3d052f632c501923d026c6af520d91b6c6d89466ee · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcmVsZWFzZS50ZXN0Lm1qcwlhIGZhaWxlZCB0YWcgZmV0Y2ggb3IgdGFnIGxpc3Qgc3RvcHMgdGhlIHJlbGVhc2UJZWQyNTE3MTczNGVhYzBkMmQ1ZjU4YTA3MTA4NDBhYTllZmFhODhiODE5YjE1NzQ4ZjIzMjA0YjJkYmY4Zjg1NQpib2R5CXRlc3RzL3JlbGVhc2UudGVzdC5tanMJYSBmb3JnZSB0aGF0IGNhbm5vdCBiZSBhc2tlZCBpcyBub3QgcmVhZCBhcyBhIHJlbGVhc2UgdGhhdCBpcyBtaXNzaW5nCWUyZGNhYWQ2YTE0NTJiMDAzOTc5YTlkN2IyNDQzZGQzYTgxMzRhZGFkYWE1Y2U5NjhiMTc1Mzc0ZDM3NGIyODAKYm9keQl0ZXN0cy9yZWxlYXNlLnRlc3QubWpzCWEgZnVsbCBjaGVjayB0aGF0IHBhc3NlZCBvbiBhIGNvbnRlbmRlZCBtYWNoaW5lIGlzIHRha2VuIGFnYWluIHdoZW4gaXQgaXMgcXVpZXQsIGFuZCB0d2ljZSBjb250ZW5kZWQgc3RvcHMgdGhlIHJlbGVhc2UJZGFjMzAzOWJkMWIyYzE3OGM5YzQwNDM5MTgxOGMyMThiYjk5OTE0ZDM2ODQ3NmQ4MjBjODkwZTVjMmMzMmMyZgpib2R5CXRlc3RzL3JlbGVhc2UudGVzdC5tanMJYSBwYXNzIHdob3NlIGxvYWQgZmFsbHMgdG8gdGhlIGNvcmUgY291bnQgYWZ0ZXIgdGhlIHJ1biBpcyBub3QgY29udGVuZGVkLCBhbmQgb25lIHRoYXQgc3RheXMgYWJvdmUgaXQgaXMJY2YzYjk1NGU4NTRiYWZlOGNkZDcxMjYwMWM5MzNjM2YyZWRhODUxMzM3ZjQwNzVhZTQ3NjU5YWI1N2Y1ZGVjNQpib2R5CXRlc3RzL3JlbGVhc2UudGVzdC5tanMJYSByZWQgY2hlY2sgb3IgYSBkZWFkLWNvZGUgZmluZGluZyBzdG9wcyB0aGUgcmVsZWFzZSBiZWZvcmUgYW55IHB1c2gJZjZlYjE0MjkxMzVmMmJjNDYxMWZiNjNmMWJkYWM5MzcxZjBmYmFmMWY1OTI2YjhiZmQyMDUyMmJjOTEwN2M0Ngpib2R5CXRlc3RzL3JlbGVhc2UudGVzdC5tanMJYSByZWxlYXNlIG1hZGUgb24gdGhlIGZvcmdlIGJ1dCBub3QgZmV0Y2hlZCBoZXJlIGlzIHNhaWQgYXMgcmVsZWFzZWQJNDMwYTU4MGNmMDAyMjRiNjk3ZDJhYzUxOWJmNDFiMTkxNTAyN2FiZmI5NDRiODZkY2I4MWExMGQ3YjU4MmI0Nwpib2R5CXRlc3RzL3JlbGVhc2UudGVzdC5tanMJYSBzYW1wbGUgYWZ0ZXIgdGhlIHNldHRsZSBib3VuZCBkb2VzIG5vdCBjb3VudCwgYW5kIGEgcGFzcyB3aG9zZSBzdGFydCB3YXMgbm90IHJlYWQgaXMgbm90IGp1ZGdlZAkzOWNmYjgzZmY2M2NkMzQ1YTE4N2NiZWE2YTEyZGZmYjMzMmYyZmQwNmE0Y2M1YjI1MzcyZTNkMzJjYWMwNTIyCmJvZHkJdGVzdHMvcmVsZWFzZS50ZXN0Lm1qcwlhIHdhaXQgcGFzdCBpdHMgZGVhZGxpbmUgZXhpdHMgMyBhbmQgbmFtZXMgd2hhdCBpdCB3YWl0ZWQgZm9yCThlYWI0OTQwYTBhZjYwYTYwZjZmOTgzNzlkNGZmZjY3MmJlMjA0Yjg3MzEzN2FlYTY4YzUzZjcwM2QyYTdiYjcKYm9keQl0ZXN0cy9yZWxlYXNlLnRlc3QubWpzCWV2aWRlbmNlIHRoaXMgY2xvbmUgY2FuIHJlYWQgaXMgYXNrZWQgZm9yIGJlZm9yZSBhbnl0aGluZyBsYW5kcywgYW5kIGFuIHVuY29tbWl0dGVkIGF0dGVzdGF0aW9uIGlzIG5hbWVkCTVmMjJhZjA2MjNkZjdhNmUyYTkxMTNlMGU3N2VhMmI4NDE5YjliN2MyYTgzY2RmNmY3OTUwNDI0OTZkMTAwNTYKYm9keQl0ZXN0cy9yZWxlYXNlLnRlc3QubWpzCXJlbGVhc2UgZGlzcGF0Y2hlcyB0aGUgY2FtcGFpZ24gb25seSBhZnRlciB0aGUgcHVzaCBydW4gZXhpc3RzCTAxZWJhYTRiODZlYzRmODFjMmEwMDA5MDVlODBhNjdlNDk4NzlkNWE1MjVkNzljMjUwYjQ5MDM2OGMzMmUzZWYKYm9keQl0ZXN0cy9yZWxlYXNlLnRlc3QubWpzCXJlbGVhc2UgbGFuZHMgdGhlIHNoYSBhbmQgZGlzcGF0Y2hlcyBvbmx5IGFmdGVyIHRoZSBwdXNoIHJ1biBvbiBtYWluIGV4aXN0cwlhZWJkNGIyOTdhYTQyMjA1NjA4ZDJkZDQ5NDNlYjMzNjI5OTU4M2JkMzA3YjlhNjY1NzM5OTk4MjAxMDViODhiCmJvZHkJdGVzdHMvcmVsZWFzZS50ZXN0Lm1qcwlyZWxlYXNlIHJlc3VtZXMgZnJvbSB3aGF0IGl0IG9ic2VydmVzIGFuZCByZXBlYXRzIG5vIHN0ZXAgd2hvc2UgcmVzdWx0IGlzIGFscmVhZHkgdGhlcmUJNzNlZmU2MGM1ZDZlY2QzNDJiMGViYTZjOTYzZWE1MzhiYmE3NThmZjVjOGY1MzI0ODNjNjgzN2Y2NmRlZTU5NApib2R5CXRlc3RzL3JlbGVhc2UudGVzdC5tanMJcmVsZWFzZSBzdG9wcyBhbmQgc2F5cyBidW1wIHdoZW4gcGx1Z2luLmpzb24gbmFtZXMgdGhlIG5ld2VzdCB0YWcncyB2ZXJzaW9uCWJkODI3ODNjODA4MmZlZjZkZmRlYjZhMjhmYmY5OTA2MTA1NDg3YjEzZjc0ZjFiMzY3ZjQ0NDQwN2MxY2MyZjAKYm9keQl0ZXN0cy9yZWxlYXNlLnRlc3QubWpzCXJlbGVhc2UgdGFncyBvbmx5IGEgc2hhIHJlbGVhc2UtZXZpZGVuY2UgY2xlYXJzLCB3aXRoIGl0cyBmdWxsIHNoYSBhbmQgLS1sYXRlc3QJZTU0ODAxYmZiNDU2MWUzMWM1MDkzZTM1ZDI4MzFlNjU5ZDljMzA2MWMzZDM5ZjM4YzkwMDI0N2FiNjQxNzU0OQ · test-lock-kind:replace
