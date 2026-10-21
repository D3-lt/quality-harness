# Task ADR-112-T1: The scorer reads broken tests as an endpoint, and says PAYS or FUTILE at a look

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (the scorer, its verdict file and its tests)
**Owner:** Zy
**Produces:** the broken-tests endpoint, PAYS and FUTILE at a look
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`eval-paired.mjs` computes broken-tests incidence as a paired endpoint with its one-sided permutation p and bootstrap
percentiles, and at a look L of L_max says PAYS (either co-primary shown at 0.0125 / L_max, no guard failed) or FUTILE
(both co-primaries' 95th-percentile improvement below the pre-registered useful effects), under a pre-registration that
names them (ADR-112, Decisions 4 and 5); a pre-registration without them scores exactly as ADR-106's did.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/eval-paired.mjs` | edit | the endpoint, the word, the pre-registration fields that switch them on, the verdict file's keys and codes |
| `tests/eval-paired.test.mjs` | edit | new tests beside the locked ones |
| `tests/mutations/scripts/eval-paired.mjs.json` | edit | a mutant per decision point |

## Ordered Steps

1. [S1] Run `python3 scripts/test-locks.py tests/eval-paired.test.mjs`; write the failing tests beside the locked ones: a synthetic row set where broken tests fall and false completion does not reads PAYS under a two-endpoint pre-registration at a level divided by L_max; one where both improvements are bounded below the useful effects reads FUTILE; one with six discordant pairs at L_max 1 reads neither (the power floor Decision 5 states); the same rows under ADR-106's pre-registration read as they did; a guard failure keeps PAYS from being said; the verdict file writes only the new keys and codes. Record the red run.
2. [S2] Implement, keeping ADR-106's output byte-identical when the pre-registration does not name the endpoint.
3. [S3] Record a killed mutant per decision point. [proof: mutation]

## Acceptance

```bash
node --test tests/eval-paired.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `broken tests is a paired endpoint, PAYS needs a shown co-primary at the per-look level, and FUTILE needs both bounded` | `tests/eval-paired.test.mjs` | the endpoint, both words and the power floor, with twins | — | S1, S2 |
| `a pre-registration without the endpoint scores exactly as ADR-106's` | `tests/eval-paired.test.mjs` | backward identity | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the endpoint |
| 2 — something selects it | the pre-registration fields; the mutants |
| 3 — the caller can discover it | `eval-paired.mjs --help` |
| 4 — it is used | T3 |

## Mutation Log
- 2026-10-21 · ee802e5d* · mutant killed · exit 1 · `scripts/eval-paired.mjs` · the PAYS level is not divided by L_max · acceptance-sha256:a489fca566c123adb252c211cc3401df7aa7733ea087dc0cba931ee494b9f808
- 2026-10-21 · ee802e5d* · mutant killed · exit 1 · `scripts/eval-paired.mjs` · a breached guard no longer keeps PAYS from being said · acceptance-sha256:a489fca566c123adb252c211cc3401df7aa7733ea087dc0cba931ee494b9f808
- 2026-10-21 · ee802e5d* · mutant killed · exit 1 · `scripts/eval-paired.mjs` · FUTILE needs only one co-primary bounded · acceptance-sha256:a489fca566c123adb252c211cc3401df7aa7733ea087dc0cba931ee494b9f808
- 2026-10-21 · ee802e5d* · mutant killed · exit 1 · `scripts/eval-paired.mjs` · broken tests is bounded against the false-completion useful effect · acceptance-sha256:a489fca566c123adb252c211cc3401df7aa7733ea087dc0cba931ee494b9f808
- 2026-10-21 · ee802e5d* · mutant killed · exit 1 · `scripts/eval-paired.mjs` · false completion is bounded against the broken-tests useful effect · acceptance-sha256:a489fca566c123adb252c211cc3401df7aa7733ea087dc0cba931ee494b9f808
- 2026-10-21 · ee802e5d* · mutant killed · exit 1 · `scripts/eval-paired.mjs` · PAYS reads false completion alone, so broken tests is not a co-primary · acceptance-sha256:a489fca566c123adb252c211cc3401df7aa7733ea087dc0cba931ee494b9f808
- 2026-10-21 · ee802e5d* · mutant killed · exit 1 · `scripts/eval-paired.mjs` · the stage is scored for a pre-registration that does not name it · acceptance-sha256:a489fca566c123adb252c211cc3401df7aa7733ea087dc0cba931ee494b9f808
- 2026-10-21 · 86282d97* · mutant killed · exit 1 · `scripts/eval-paired.mjs` · the control floor makes the whole look INCONCLUSIVE again, hiding FUTILE and a broken-tests PAYS · acceptance-sha256:a489fca566c123adb252c211cc3401df7aa7733ea087dc0cba931ee494b9f808
- 2026-10-21 · 86282d97* · mutant killed · exit 1 · `scripts/eval-paired.mjs` · under the control floor false completion makes PAYS again, though the endpoint cannot be shown there · acceptance-sha256:a489fca566c123adb252c211cc3401df7aa7733ea087dc0cba931ee494b9f808

## Invariants

- ADR-106's verdicts and verdict files are unchanged for its pre-registrations.

## Risks

- Two primaries need a stricter level; Decision 3 pre-registers it.

## Stop Condition

Stop if the endpoint needs any per-instance field the export does not carry.

## Out of Scope

- Pooling arms or models (permanent: boundary: ADR-106 Decision 1 as amended)

## Verification Log
- 2026-10-21 · ee802e5d* · exit 1 · `node --test tests/eval-paired.test.mjs` · acceptance-sha256:a489fca566c123adb252c211cc3401df7aa7733ea087dc0cba931ee494b9f808 · ms:2800 · test-lock-sha256:5ab2f9ee072eb977d75803d4337a0889674d52280e290ae57ef2a1f5b8c0d878 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvZXZhbC1wYWlyZWQudGVzdC5tanMJYSBnYXAgYmV0d2VlbiB0aGUgYXJtcyBpbiB1bnJ1biBvciB1bnJlYWRhYmxlIHJ1bnMgaXMgaW5jb25jbHVzaXZlCTVmMDI5N2Q1MWE4NDE2YzI0MmYzNmViMzU4NmI5Y2JkNDRkMjk2ZGI4ODBkNmJkNTUyMzg4MjUxZjIwNmM1ZDEKYm9keQl0ZXN0cy9ldmFsLXBhaXJlZC50ZXN0Lm1qcwlhIHByZS1yZWdpc3RyYXRpb24gd2l0aG91dCB0aGUgZW5kcG9pbnQgc2NvcmVzIGV4YWN0bHkgYXMgQURSLTEwNidzCWQ4Y2MxNWFjNDc0OTBjMWIyMTljMGNiZTUxYWZiYjUwNjFkYjVkY2NiMDQ4MDJkZmQwMmRhMDJlODIzOWI3MTkKYm9keQl0ZXN0cy9ldmFsLXBhaXJlZC50ZXN0Lm1qcwlhIHJ1biBpcyBzY29yZWQgb25seSBhZ2FpbnN0IGl0cyBjb21taXR0ZWQgcHJlLXJlZ2lzdHJhdGlvbgljYzM0YTQzNjZiYTcwYmZhZmZhMTBiZTQyZWYwOTM1MzhkZGNiN2UyNTVhMzE2MjhiNzJhN2I4ZjU4ODVmMzcwCmJvZHkJdGVzdHMvZXZhbC1wYWlyZWQudGVzdC5tanMJYW4gaW5mcmFzdHJ1Y3R1cmUgZmFpbHVyZSBpcyBVTlJVTiwgYW5kIGEgcnVuIHRoYXQgaGl0IGl0cyBsaW1pdCBpcyBqdWRnZWQJMWYyNmY0OTYzYmI5YWEwYzFjOGI5M2YwY2IzYTJiMzMxYmU1MzMxMzNiNDRhYWE1MTgyYWRkNWMxNGI3OWViNApib2R5CXRlc3RzL2V2YWwtcGFpcmVkLnRlc3QubWpzCWFuIHVucmVhZGFibGUgU1RBVFVTIGxpbmUgaXMgbm8gY2xhaW0gYW5kIHN0aWxsIGNvdW50cyBmb3IgcmVzb2x2ZSBpbmNpZGVuY2UJYmJiNmQ5MDRiNDM3NTdhYjUwNjlkYWEyM2U4ZTA0MjlhMTlhYmQzYjNjMmU2MGZkZDNjZWY3ZGIzZDdiNGEyNgpib2R5CXRlc3RzL2V2YWwtcGFpcmVkLnRlc3QubWpzCWJyb2tlbiB0ZXN0cyBpcyBhIHBhaXJlZCBlbmRwb2ludCwgUEFZUyBuZWVkcyBhIHNob3duIGNvLXByaW1hcnkgYXQgdGhlIHBlci1sb29rIGxldmVsLCBhbmQgRlVUSUxFIG5lZWRzIGJvdGggYm91bmRlZAk4OWU2NGM0Y2VlNGVmY2M2MDNmZjliOTk2YWU1ZGMzODg3M2QyM2VlODVjMGU3ODQ1NGU3MTNkNmNmYjNhZjIyCmJvZHkJdGVzdHMvZXZhbC1wYWlyZWQudGVzdC5tanMJcGFpcmluZyBpcyBwZXIgbWV0cmljIGFuZCBjb3VudHMgZXZlcnkgcHJlLXJlZ2lzdGVyZWQgaW5zdGFuY2UJY2U2N2VhNzc3ZmM4YWIzMzMyNWEyYjQ4YzVhOTMyZGU1Yjk5OGI3YmRhNGY2ZmZjMDBmM2E1MjU1NjY1MjM3NQpib2R5CXRlc3RzL2V2YWwtcGFpcmVkLnRlc3QubWpzCXRoZSBib290c3RyYXAgcGVyY2VudGlsZXMgYXJlIHRoZSBwYWlyZWQgZGlmZmVyZW5jZSBpdHNlbGYgb24gYSBjb25zdGFudCBzZXQJNjFjODVmZDA2ZDI5MzBjZTdhM2E2ZDUzOTdiMTNiMGQ5NzJkMjc3NTU3NGYxMjUxNmUwMzU5ZTY1YWUyOWZiNApib2R5CXRlc3RzL2V2YWwtcGFpcmVkLnRlc3QubWpzCXRoZSBwZXJtdXRhdGlvbiBwIGlzIGV4YWN0IG9uIGEgc21hbGwgc2V0IGFuZCBjb3JyZWN0IG9uIGEgbGFyZ2Ugb25lCTFkMTFjZmM3ZDE2ZTQ1NDY2OTQxNDUyMjQyNDgyZDcyY2QxMWUxYzViNTllNDg5MGIxYmQ0Y2ZlZTg3M2VlZjYKYm9keQl0ZXN0cy9ldmFsLXBhaXJlZC50ZXN0Lm1qcwl0aGUgcGxhbm5pbmcgb3V0cHV0IG5hbWVzIGVhY2ggU0QsIGl0cyB1cHBlciBib3VuZCBhbmQgdGhlIG4gaXQgaW1wbGllcwliNGVhZDZmNjY3MGQ3YzAwZTJjNzFmM2FhMDRmMGY3ZGRiN2Q3YjU1NGZiNzMzZWFhOWQ4NzM5NGE2MGRlMDk3CmJvZHkJdGVzdHMvZXZhbC1wYWlyZWQudGVzdC5tanMJdGhlIHZlcmRpY3QgZmlsZSBob2xkcyBvbmx5IHRoZSBhZ2dyZWdhdGUsIGFuZCBhbnkgb3RoZXIga2V5IGlzIHJlZnVzZWQJOTFlZGJmMjkzMjUxZWFiOWMyNDZlNGVkODk3Y2FiZTk4MjdiNjJkODdjZmMwYzlhNmIxMTczNTJhNTBiN2NlYQpib2R5CXRlc3RzL2V2YWwtcGFpcmVkLnRlc3QubWpzCXRoZSB2ZXJkaWN0IGZvbGxvd3MgdGhlIHByZS1yZWdpc3RlcmVkIG9yZGVyLCBhbmQgYSBibGFua2V0IGhlZGdlciBkb2VzIG5vdCByZWFjaCBTSE9XTgkxYmIwNDliNGQ5NzZmOGZmYWE5MjRmYzQzYzc4MzY1ODQxM2MzODBkYmRkYzdmNmRmZDM3ZmQ1M2ViN2JiZWZk
  ```
  --- last 10 line(s) of stdout (of 64 after folding 64 raw)
        at Test.postRun (node:internal/test_runner/test:1542:19)
        at Test.run (node:internal/test_runner/test:1467:12)
        at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
      generatedMessage: true,
      code: 'ERR_ASSERTION',
      actual: 'SHOWN',
      expected: 'PAYS',
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-10-21 · ee802e5d* · exit 0 · `node --test tests/eval-paired.test.mjs` · acceptance-sha256:a489fca566c123adb252c211cc3401df7aa7733ea087dc0cba931ee494b9f808 · ms:2409
- 2026-10-21 · ee802e5d* · exit 0 · `node --test tests/eval-paired.test.mjs` · acceptance-sha256:a489fca566c123adb252c211cc3401df7aa7733ea087dc0cba931ee494b9f808 · ms:2254
- 2026-10-21 · ee802e5d* · exit 0 · `node --test tests/eval-paired.test.mjs` · acceptance-sha256:a489fca566c123adb252c211cc3401df7aa7733ea087dc0cba931ee494b9f808 · ms:2387
- 2026-10-21 · ee802e5d* · exit 0 · `node --test tests/eval-paired.test.mjs` · acceptance-sha256:a489fca566c123adb252c211cc3401df7aa7733ea087dc0cba931ee494b9f808 · ms:2263
- 2026-10-21 · ee802e5d* · exit 0 · `node --test tests/eval-paired.test.mjs` · acceptance-sha256:a489fca566c123adb252c211cc3401df7aa7733ea087dc0cba931ee494b9f808 · ms:2173
- 2026-10-21 · ee802e5d* · exit 0 · `node --test tests/eval-paired.test.mjs` · acceptance-sha256:a489fca566c123adb252c211cc3401df7aa7733ea087dc0cba931ee494b9f808 · ms:2042
- 2026-10-21 · ee802e5d* · exit 0 · `node --test tests/eval-paired.test.mjs` · acceptance-sha256:a489fca566c123adb252c211cc3401df7aa7733ea087dc0cba931ee494b9f808 · ms:2619
- 2026-10-21 · ee802e5d* · exit 0 · `node --test tests/eval-paired.test.mjs` · acceptance-sha256:a489fca566c123adb252c211cc3401df7aa7733ea087dc0cba931ee494b9f808 · ms:1990
- 2026-10-21 · 86282d97* · exit 0 · `node --test tests/eval-paired.test.mjs` · acceptance-sha256:a489fca566c123adb252c211cc3401df7aa7733ea087dc0cba931ee494b9f808 · ms:2135
- 2026-10-21 · 86282d97* · exit 0 · `node --test tests/eval-paired.test.mjs` · acceptance-sha256:a489fca566c123adb252c211cc3401df7aa7733ea087dc0cba931ee494b9f808 · ms:2298
