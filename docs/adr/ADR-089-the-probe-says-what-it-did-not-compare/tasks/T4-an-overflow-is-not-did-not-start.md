# Task ADR-089-T4: an overflowed reader is not "did not start"

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one shipped script, one new test file, campaign entries)
**Owner:** unassigned
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the ENOBUFS wording`, `the output limit on every reader spawn`, `an overflow reaches couldNotRun`, `the existing failedToRun arms`

## Goal

Every reader the probe spawns may print up to `READER_OUTPUT_LIMIT` (64 MiB), and one that prints more
is said to have run and overflowed, never "did not start" (ADR-089 Decision 5).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/corpus-probe.mjs` | edit | `READER_OUTPUT_LIMIT` beside `DEFAULT_TIMEOUT_MS` (`:53`); `failedToRun` (`:129`) gains the ENOBUFS arm, taking the limit; `probe` (`:219`) takes an `outputLimit` option, default the constant, and passes it as `maxBuffer` to `node` (`:231`), `gate` (`:233`) and the adr-lint spawn (`:283`), and to each `failedToRun` call |
| `tests/probe-enobufs.test.mjs` | add | the two tests below |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Run `python3 scripts/test-locks.py tests/corpus-probe.test.mjs` and confirm that the locked `failedToRun` test asserts only the ETIMEDOUT and plain-error arms. Write the two tests and record the red run (TDD red). Red today: ENOBUFS is worded `did not start: ENOBUFS`.
2. [S2] Add the ENOBUFS arm: `ran, and its output passed the probe's <n> MiB buffer (ENOBUFS), so what it said was not read`.
3. [S3] Add `outputLimit` and pass it to every reader spawn. The fingerprint's and the Python version probe's spawns are not readers and keep their own bounds.
4. [S4] Record one killed mutant per Rests-on name, and add each to `tests/mutations.json`:
   - drop the ENOBUFS arm;
   - drop `maxBuffer` from the `gate` helper;
   - in `reader()`, return the partial stdout of an ENOBUFS result instead of noting it, so an overflow parses or vanishes rather than reaching `couldNotRun`;
   - word ETIMEDOUT `did not start` again, which the locked `failedToRun` test in the fence's second command must kill.
   [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/probe-enobufs.test.mjs 2>&1) \
  && for t in 'an overflowed reader is said to have run and overflowed' 'every reader spawn in the probe carries the output limit'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done \
  && node --test tests/corpus-probe.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an overflowed reader is said to have run and overflowed` | `tests/probe-enobufs.test.mjs` | a real `spawnSync` of a child printing past a small `maxBuffer` gives ENOBUFS, and `failedToRun` words it `ran, and its output passed …` with no `did not start`. CLEAN twins: an `ENOENT` error still says `did not start: ENOENT`, and ETIMEDOUT still says killed | none | S1, S2 |
| `every reader spawn in the probe carries the output limit` | `tests/probe-enobufs.test.mjs` | `probe` over a temporary go-module copy with `outputLimit: 1` puts work-next, adr-state, every adr-lint, every adr-next, SessionStart and corpus-report in `couldNotRun`, each with the ENOBUFS wording. CLEAN twin: the default limit gives `couldNotRun: []` | none | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `probe` passes the limit to each spawn helper; the second test fails for any helper that drops it |
| 3 — the caller can discover it | `couldNotRun[].why` in the report |
| 4 — it is used | a corpus past 1 MiB of reader output, such as the 4,002-task one of §295; nothing measures this yet |

## Mutation Log
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · ENOBUFS reads did not start again · acceptance-sha256:340158a0fba3ad62535fc600e737bda662db7a7c1ce6921e2dcf70b4d39585d8 · covers:the ENOBUFS wording
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · the gate helper drops maxBuffer, so adr-next keeps the 1 MiB default · acceptance-sha256:340158a0fba3ad62535fc600e737bda662db7a7c1ce6921e2dcf70b4d39585d8 · covers:the output limit on every reader spawn
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · reader() reads the cut-off stdout instead of noting the overflow · acceptance-sha256:340158a0fba3ad62535fc600e737bda662db7a7c1ce6921e2dcf70b4d39585d8 · covers:an overflow reaches couldNotRun
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · a killed reader is worded did not start again · acceptance-sha256:340158a0fba3ad62535fc600e737bda662db7a7c1ce6921e2dcf70b4d39585d8 · covers:the existing failedToRun arms

## Invariants

- A spawn that did not start still says `did not start`.
- A killed spawn still says killed, with the budget.

## Risks

- A reader holding up to 64 MiB in the probe's memory; one constant to lower if a runner reports pressure.

## Stop Condition

Stop and ask if a locked test pins `did not start` for an ENOBUFS error.

## Out of Scope

- `plugin/scripts/lifecycle.mjs:6000`'s "the process did not start" — ADR-089 Out of Scope.

## Verification Log
- 2026-10-07 · 49bd0c3* · exit 1 · `out=$(node --test --test-reporter=tap tests/probe-enobufs.test.mjs 2>&1) \ …` · acceptance-sha256:340158a0fba3ad62535fc600e737bda662db7a7c1ce6921e2dcf70b4d39585d8 · ms:1256 · test-lock-sha256:000ce4613aa4e7802365d63c8f658197ad0a67b36b6d0af708478ead02f4cffd · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcHJvYmUtZW5vYnVmcy50ZXN0Lm1qcwlhbiBvdmVyZmxvd2VkIHJlYWRlciBpcyBzYWlkIHRvIGhhdmUgcnVuIGFuZCBvdmVyZmxvd2VkCWYzZmJiMGJjYzNkN2FkNGQxYTJlYjAzNWNlZjUwMzlmZmU4N2NlZmRjYjJkMTVhOTQ5MjcxZDQ4NDY5ZjczYWEKYm9keQl0ZXN0cy9wcm9iZS1lbm9idWZzLnRlc3QubWpzCWV2ZXJ5IHJlYWRlciBzcGF3biBpbiB0aGUgcHJvYmUgY2FycmllcyB0aGUgb3V0cHV0IGxpbWl0CTY3OTU5N2Y4ODU0MWJjNDM0MDVjOWQ4NGRkNjFkYWIxMjliZDRhYmM5NTFlYmM5ZWI5YzNjMWJkOTBhMmFkNmQ
  ```
  ```
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/probe-enobufs.test.mjs 2>&1) \ …` · acceptance-sha256:340158a0fba3ad62535fc600e737bda662db7a7c1ce6921e2dcf70b4d39585d8 · ms:9796
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/probe-enobufs.test.mjs 2>&1) \ …` · acceptance-sha256:340158a0fba3ad62535fc600e737bda662db7a7c1ce6921e2dcf70b4d39585d8 · ms:10316
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/probe-enobufs.test.mjs 2>&1) \ …` · acceptance-sha256:340158a0fba3ad62535fc600e737bda662db7a7c1ce6921e2dcf70b4d39585d8 · ms:10716
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/probe-enobufs.test.mjs 2>&1) \ …` · acceptance-sha256:340158a0fba3ad62535fc600e737bda662db7a7c1ce6921e2dcf70b4d39585d8 · ms:10279
