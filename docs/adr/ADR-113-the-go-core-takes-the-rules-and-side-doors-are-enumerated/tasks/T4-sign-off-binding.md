# Task ADR-113-T4: A sign-off is bound to what was signed

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** see ADR-113's Inter-task Contracts
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A --human sign-off carries the acceptance digest and reads as stale after the fence changes; strictFrom takes an ADR id or a number only (ADR-113, Decision 4).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/sign-off-binding.test.mjs` | add | the task's tests, each with a planted twin that must fail |
| `plugin/lib/record.py` | edit | `signoff_digest` (the fence's digest, or the whole section's for a human-observed Acceptance) and `signoff_binding` (bound, stale or legacy) |
| `plugin/bin/adr-verify` | edit | `--human` appends ` · acceptance-sha256:<digest>` |
| `plugin/bin/adr-next`, `plugin/bin/adr-lint` | edit | a stale sign-off counts for nothing; a new digest-less one is refused, a committed one is legacy; a stop quotes the note without the digest; `strictFrom` is `ADR-<n>` or `<n>` only |
| `tests/sign-off-binding.test.mjs`, `tests/mutations/plugin/bin/*.json`, `tests/mutations/plugin/lib/record.py.json` | add, edit | found executing: the test gained a stop-quoting case after its red run, and is relocked |

## Ordered Steps

1. [S1] Write the failing tests: a sign-off taken on one fence no longer counts after the fence changes; strictFrom of after 2026 is said and ignored. Record the red run.
2. [S2] Implement on the Node path and in the Go core where the rule is a hook's, keeping them in parity.
3. [S3] Record a killed mutant per decision point, and add catalogue entries for Node sources. [proof: mutation]

## Acceptance

```bash
node --test tests/sign-off-binding.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a sign-off is bound to the fence it was taken on` | `tests/sign-off-binding.test.mjs` | the digest on a sign-off, staleness after a fence change, and strictFrom's value check | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the change |
| 2 — something selects it | the hook, gate or reader that calls it, and the mutant that deletes the call |
| 3 — the caller can discover it | the finding's text, or the gate's output |
| 4 — it is used | every session and every gate run |

## Mutation Log
- 2026-10-19 · bb44fd2f* · mutant killed · exit 1 · `plugin/bin/adr-verify` · the sign-off names nothing it signed · acceptance-sha256:cf2c0c3f9c224057aef3fe7068527ac4f6dd59ea687a5e5f90e66f938404ae41
- 2026-10-19 · bb44fd2f* · mutant killed · exit 1 · `plugin/lib/record.py` · a sign-off on another Acceptance counts · acceptance-sha256:cf2c0c3f9c224057aef3fe7068527ac4f6dd59ea687a5e5f90e66f938404ae41
- 2026-10-19 · bb44fd2f* · mutant killed · exit 1 · `plugin/bin/adr-next` · adr-next counts a stale sign-off · acceptance-sha256:cf2c0c3f9c224057aef3fe7068527ac4f6dd59ea687a5e5f90e66f938404ae41
- 2026-10-19 · bb44fd2f* · mutant killed · exit 1 · `plugin/bin/adr-lint` · a new digest-less sign-off passes as legacy · acceptance-sha256:cf2c0c3f9c224057aef3fe7068527ac4f6dd59ea687a5e5f90e66f938404ae41
- 2026-10-19 · bb44fd2f* · mutant killed · exit 1 · `plugin/bin/adr-lint` · adr-lint says nothing of a stale sign-off · acceptance-sha256:cf2c0c3f9c224057aef3fe7068527ac4f6dd59ea687a5e5f90e66f938404ae41
- 2026-10-19 · bb44fd2f* · mutant killed · exit 1 · `plugin/bin/adr-lint` · any digits in strictFrom are a cutoff again · acceptance-sha256:cf2c0c3f9c224057aef3fe7068527ac4f6dd59ea687a5e5f90e66f938404ae41
- 2026-10-19 · bb44fd2f* · mutant killed · exit 1 · `plugin/bin/adr-next` · a stop quotes the digest as the note · acceptance-sha256:cf2c0c3f9c224057aef3fe7068527ac4f6dd59ea687a5e5f90e66f938404ae41

## Invariants

- Gates advise and two refusals are sanctioned (CLAUDE.md §3); nothing here adds a refusal outside them.
- The Node path and the Go core say the same thing at each commit.

## Risks

- A planted twin that does not fail proves nothing; each is shown failing in the same test.

## Stop Condition

Stop if a change would add a refusal outside the two sanctioned ones, or if parity cannot be kept without a design decision.

## Out of Scope

- ADR-110 T3's cutover (deferred: docs/adr/ADR-110-a-static-core-owns-the-hooks.md)

## Verification Log
- 2026-10-19 · bb44fd2f* · exit 1 · `node --test tests/sign-off-binding.test.mjs` · acceptance-sha256:cf2c0c3f9c224057aef3fe7068527ac4f6dd59ea687a5e5f90e66f938404ae41 · ms:233 · test-lock-sha256:22c999d4ec469edda9f78966b4412190a9d147372d287082c05de10fbcf3247e · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvc2lnbi1vZmYtYmluZGluZy50ZXN0Lm1qcwlhIHNpZ24tb2ZmIGlzIGJvdW5kIHRvIHRoZSBmZW5jZSBpdCB3YXMgdGFrZW4gb24JNWJlMDdiMTQ4NTc5MjQ3ZjY0OGYwZDFhYjdjZDNkYTk4YTY4MDUwMTRhNzZkMTc0YTNhNjg1NTQ4NWQzN2Q3Ng
  ```
  --- last 10 line(s) of stdout (of 27 after folding 27 raw)
        at Test.run (node:internal/test_runner/test:1402:25)
        at Test.start (node:internal/test_runner/test:1262:17)
        at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: '- 2026-10-19 · human-observed · observed: it runs',
      expected: / · acceptance-sha256:[0-9a-f]{64}$/,
      operator: 'match',
      diff: 'simple'
    }
  ```
- 2026-10-19 · bb44fd2f* · exit 0 · `node --test tests/sign-off-binding.test.mjs` · acceptance-sha256:cf2c0c3f9c224057aef3fe7068527ac4f6dd59ea687a5e5f90e66f938404ae41 · ms:1431
- 2026-10-19 · bb44fd2f* · exit 0 · `node --test tests/sign-off-binding.test.mjs` · acceptance-sha256:cf2c0c3f9c224057aef3fe7068527ac4f6dd59ea687a5e5f90e66f938404ae41 · ms:1456
- 2026-10-19 · bb44fd2f* · exit 0 · `node --test tests/sign-off-binding.test.mjs` · acceptance-sha256:cf2c0c3f9c224057aef3fe7068527ac4f6dd59ea687a5e5f90e66f938404ae41 · ms:1424
- 2026-10-19 · bb44fd2f* · exit 0 · `node --test tests/sign-off-binding.test.mjs` · acceptance-sha256:cf2c0c3f9c224057aef3fe7068527ac4f6dd59ea687a5e5f90e66f938404ae41 · ms:1426
- 2026-10-19 · bb44fd2f* · exit 0 · `node --test tests/sign-off-binding.test.mjs` · acceptance-sha256:cf2c0c3f9c224057aef3fe7068527ac4f6dd59ea687a5e5f90e66f938404ae41 · ms:1454
- 2026-10-19 · bb44fd2f* · exit 0 · `node --test tests/sign-off-binding.test.mjs` · acceptance-sha256:cf2c0c3f9c224057aef3fe7068527ac4f6dd59ea687a5e5f90e66f938404ae41 · ms:1431
- 2026-10-19 · bb44fd2f* · exit 0 · `node --test tests/sign-off-binding.test.mjs` · acceptance-sha256:cf2c0c3f9c224057aef3fe7068527ac4f6dd59ea687a5e5f90e66f938404ae41 · ms:1426
- 2026-10-19 · bb44fd2f* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:cf2c0c3f9c224057aef3fe7068527ac4f6dd59ea687a5e5f90e66f938404ae41 · ms:0 · test-lock-sha256:0a524b4364667105ce1a035354dccd57609557ad831192bb871261ef7b2ce6f9 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvc2lnbi1vZmYtYmluZGluZy50ZXN0Lm1qcwlhIHNpZ24tb2ZmIGlzIGJvdW5kIHRvIHRoZSBmZW5jZSBpdCB3YXMgdGFrZW4gb24JNjZmZjgxZThiMzY2NjBkYWY3M2UzYTZmMDMxOTI2NzI5NjkxZjRjZTE4NjAxY2Y5YjAyZjRhZDM1NTQwOTc3YQ · test-lock-kind:replace
