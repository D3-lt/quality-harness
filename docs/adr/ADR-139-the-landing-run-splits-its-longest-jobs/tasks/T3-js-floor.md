# Task ADR-139-T3: The JavaScript floor runs at default concurrency only once five landings show it deterministic

**Status:** withdrawn — the probe disagreed and hung (S3), so the floor stays serial; removed with ADR-139's rollback (its Outcome)
**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** `QUALITY_HARNESS_JS_CONCURRENCY`
**Consumes:** none
**Data dependency:** needs five landing runs carrying the probe job
**Proof map:** v1

## Goal

`QUALITY_HARNESS_JS_CONCURRENCY=default bash scripts/coverage.sh --js --report` measures the JavaScript surface at node's default
concurrency and prints the three figures; a non-required `coverage floor (parallel probe)` job runs it in every landing run beside
`coverage floor`. After five landings, `coverage floor` switches to default concurrency if every probe's lines, branches and
functions were within 0.02 of the serial figures of its own run; otherwise the probe is removed and the floor stays serial.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/coverage.sh` | edit | `QUALITY_HARNESS_JS_CONCURRENCY` (unset: serial, as today) |
| `.github/workflows/selftest.yml` | edit | The probe job; later, the switch or the probe's removal |
| `tests/js-floor-probe.test.mjs` | add | Unset runs serially; `default` drops `--test-concurrency=1`; anything else refused |
| `docs/BACKLOG.md` | edit | The five runs' figures and the decision, in §459 |

## Ordered Steps

1. [S1] Write the failing test: with the variable unset, the JS command coverage.sh builds carries `--test-concurrency=1`; with
   `default` it does not; with `4` or `x` coverage.sh exits 2 naming the value.
2. [S2] Implement the variable and add the probe job.
3. [S3] After five landings, record each run's serial and probe figures and decide.
   [proof: human: the five run ids, their six figures each, and the decision are in docs/BACKLOG.md §459]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/js-floor-probe.test.mjs tests/coverage-split.test.mjs 2>&1 | tee "$out" && grep -q '✔ the JavaScript floor is serial unless told default, and refuses anything else' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the JavaScript floor is serial unless told default, and refuses anything else` | `tests/js-floor-probe.test.mjs` | The serial default, the opt-in, refusals | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the variable |
| 2 — selected | the probe job |
| 3 — discoverable | coverage.sh's header comment |
| 4 — used | the decision in §459 |

## Mutation Log
- 2026-11-04 · b0565b7b7* · mutant killed · exit 1 · `scripts/coverage.sh` · the floor runs in parallel without being asked · acceptance-sha256:ee3e3cfc919fbc0b818ca8512a7e5cc86a33abf47a1504146eebf02abaa25949

## Invariants

`bash scripts/coverage.sh --js` runs serially with node's thresholds until S3 decides otherwise. The floors are defined once.

## Risks

Five agreeing runs can still hide a rare outlier like 2026-08-27's one in ten: the probe stays in the landing run for five more
landings after a switch, and any disagreement reverts it.

## Stop Condition

Stop if a probe run fails a test the serial run passed: that is the nondeterminism, not a flake.

## Out of Scope

- Sharding the JavaScript floor (deferred: docs/BACKLOG.md §459)

## Verification Log
- 2026-11-04 · b0565b7b7* · exit 1 · `set -o pipefail …` · acceptance-sha256:ee3e3cfc919fbc0b818ca8512a7e5cc86a33abf47a1504146eebf02abaa25949 · ms:501 · test-lock-sha256:941b2335ac8cec2f977d19b2581043283678cde2c3729546fc97aea9f5e547d8 · test-lock-file:docs/adr/locks/941b2335ac8cec2f977d19b2581043283678cde2c3729546fc97aea9f5e547d8.lock
  ```
  --- last 10 line(s) of stdout (of 29 after folding 29 raw)
        at Test.run (node:internal/test_runner/test:1402:25)
        at Test.start (node:internal/test_runner/test:1262:17)
        at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: '== JavaScript hooks ==\n\nPASS — coverage holds its floor on the js surface(s) measured.\n',
      expected: /^js command: node --test --test-concurrency=1 --experimental-test-coverage /m,
      operator: 'match',
      diff: 'simple'
    }
  ```
- 2026-11-04 · b0565b7b7* · exit 0 · `set -o pipefail …` · acceptance-sha256:ee3e3cfc919fbc0b818ca8512a7e5cc86a33abf47a1504146eebf02abaa25949 · ms:274
