# Task ADR-113-T3: The side doors are enumerated by a gate

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** see ADR-113's Inter-task Contracts
**Consumes:** mrw's MCP write as a write (T2)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Every writer of a check ledger or task log, every spawn of git commit or push, and every writing tool against the hook matchers is allow-listed with its reason, and the fast pass binds its command (ADR-113, Decision 3).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/side-door-sweep.test.mjs` | add | the task's tests, each with a planted twin that must fail |
| `scripts/side-door-sweep.mjs`, `scripts/side-doors.json`, `scripts/selftest.sh` | add, edit | the sweep, its list of sites and doors, and every gate running it |
| `plugin/scripts/check-ledger.mjs`, `core/hooks/ledger.go`, `core/hooks/checkcmd.go` | edit | `latestFastPass` counts a row only for the fastCheck declared now; Go gains `fastCheckCommand` |
| `.github/workflows/selftest.yml` | edit | the core job runs this task's test against Go on every platform |
| `tests/side-door-sweep.test.mjs`, `tests/mutations/scripts/side-door-sweep.mjs.json`, `tests/mutations/plugin/scripts/check-ledger.mjs.json` | edit, add | found executing: two mutants would have survived the test as first locked (a verb after the git call, and the gate's exit), and its anchoring case could not fail; the test gained a twin, a dirty run of the gate and a `MultiEdit` case, and is relocked |

## Ordered Steps

1. [S1] Write the failing tests: the sweep fails on a planted unlisted writer and passes on the tree; a fast pass recorded for another command does not let a commit through. Record the red run.
2. [S2] Implement on the Node path and in the Go core where the rule is a hook's, keeping them in parity.
3. [S3] Record a killed mutant per decision point, and add catalogue entries for Node sources. [proof: mutation]

## Acceptance

```bash
node --test tests/side-door-sweep.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/side-door-sweep.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every side door is allow-listed with its reason, and a new one fails` | `tests/side-door-sweep.test.mjs` | the sweep over plugin/ and core/, its planted twin, and the fast pass bound to its command | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the change |
| 2 — something selects it | the hook, gate or reader that calls it, and the mutant that deletes the call |
| 3 — the caller can discover it | the finding's text, or the gate's output |
| 4 — it is used | every session and every gate run |

## Mutation Log
- 2026-10-19 · 6d9a9e9b* · mutant killed · exit 1 · `scripts/side-door-sweep.mjs` · no writer is ever found · acceptance-sha256:bc7fb39302ad5eecde2c0bb05524a63a26041c10193322cbc5636b51d8e94d66
- 2026-10-19 · 6d9a9e9b* · mutant killed · exit 1 · `scripts/side-door-sweep.mjs` · a ledger named in a comment counts as code · acceptance-sha256:bc7fb39302ad5eecde2c0bb05524a63a26041c10193322cbc5636b51d8e94d66
- 2026-10-19 · 6d9a9e9b* · mutant killed · exit 1 · `scripts/side-door-sweep.mjs` · a verb after the git call counts as its argument · acceptance-sha256:bc7fb39302ad5eecde2c0bb05524a63a26041c10193322cbc5636b51d8e94d66
- 2026-10-19 · 6d9a9e9b* · mutant killed · exit 1 · `scripts/side-door-sweep.mjs` · a matcher credits a tool whose name only ends with it · acceptance-sha256:bc7fb39302ad5eecde2c0bb05524a63a26041c10193322cbc5636b51d8e94d66
- 2026-10-19 · 6d9a9e9b* · mutant killed · exit 1 · `scripts/side-door-sweep.mjs` · a stale entry is never named · acceptance-sha256:bc7fb39302ad5eecde2c0bb05524a63a26041c10193322cbc5636b51d8e94d66
- 2026-10-19 · 6d9a9e9b* · mutant killed · exit 1 · `scripts/side-door-sweep.mjs` · the gate exits 0 over an unlisted site · acceptance-sha256:bc7fb39302ad5eecde2c0bb05524a63a26041c10193322cbc5636b51d8e94d66
- 2026-10-19 · 6d9a9e9b* · mutant killed · exit 1 · `plugin/scripts/check-ledger.mjs` · a fast pass of another command lets a commit through · acceptance-sha256:bc7fb39302ad5eecde2c0bb05524a63a26041c10193322cbc5636b51d8e94d66
- 2026-10-19 · 6d9a9e9b* · mutant killed · exit 1 · `core/hooks/ledger.go` · the Go core lets a fast pass of another command through · acceptance-sha256:bc7fb39302ad5eecde2c0bb05524a63a26041c10193322cbc5636b51d8e94d66
- 2026-10-19 · 4db47214* · mutant killed · exit 1 · `scripts/side-door-sweep.mjs` · an unreadable listed file is swept clean · acceptance-sha256:bc7fb39302ad5eecde2c0bb05524a63a26041c10193322cbc5636b51d8e94d66

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
- 2026-10-19 · 6d9a9e9b* · exit 1 · `node --test tests/side-door-sweep.test.mjs` · acceptance-sha256:1ab43ef3070dfd026fa3d96e8ebcf9989d3191e2866124cd8ed4cd6db7d5ab59 · ms:178 · test-lock-sha256:f54becafa98cacd41655cd5b94cb685e76b74ea1d8b3da7b8f461c05e2e2d8e2 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvc2lkZS1kb29yLXN3ZWVwLnRlc3QubWpzCWV2ZXJ5IHNpZGUgZG9vciBpcyBhbGxvdy1saXN0ZWQgd2l0aCBpdHMgcmVhc29uLCBhbmQgYSBuZXcgb25lIGZhaWxzCTBiM2YwOWNjYWM0ZmEyMzU3OTk1YTcxNjc0YThjNzk3ZmE1NDM0YjdmMzRjMDk2ZmNmMzM3ZGFjNTRlYmMyNTE
  ```
  --- last 10 line(s) of stdout (of 35 after folding 35 raw)
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 75.405

  ✖ failing tests:

  test at tests/side-door-sweep.test.mjs:1:1
  ✖ tests/side-door-sweep.test.mjs (72.465208ms)
    'test failed'
  ```
- 2026-10-19 · 6d9a9e9b* · exit 0 · `node --test tests/side-door-sweep.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/side-door-sweep.test.mjs` · acceptance-sha256:bc7fb39302ad5eecde2c0bb05524a63a26041c10193322cbc5636b51d8e94d66 · ms:3741
- 2026-10-19 · 6d9a9e9b* · exit 0 · `node --test tests/side-door-sweep.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/side-door-sweep.test.mjs` · acceptance-sha256:bc7fb39302ad5eecde2c0bb05524a63a26041c10193322cbc5636b51d8e94d66 · ms:3347
- 2026-10-19 · 6d9a9e9b* · exit 0 · `node --test tests/side-door-sweep.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/side-door-sweep.test.mjs` · acceptance-sha256:bc7fb39302ad5eecde2c0bb05524a63a26041c10193322cbc5636b51d8e94d66 · ms:3736
- 2026-10-19 · 6d9a9e9b* · exit 0 · `node --test tests/side-door-sweep.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/side-door-sweep.test.mjs` · acceptance-sha256:bc7fb39302ad5eecde2c0bb05524a63a26041c10193322cbc5636b51d8e94d66 · ms:3287
- 2026-10-19 · 6d9a9e9b* · exit 0 · `node --test tests/side-door-sweep.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/side-door-sweep.test.mjs` · acceptance-sha256:bc7fb39302ad5eecde2c0bb05524a63a26041c10193322cbc5636b51d8e94d66 · ms:3301
- 2026-10-19 · 6d9a9e9b* · exit 0 · `node --test tests/side-door-sweep.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/side-door-sweep.test.mjs` · acceptance-sha256:bc7fb39302ad5eecde2c0bb05524a63a26041c10193322cbc5636b51d8e94d66 · ms:3319
- 2026-10-19 · 6d9a9e9b* · exit 0 · `node --test tests/side-door-sweep.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/side-door-sweep.test.mjs` · acceptance-sha256:bc7fb39302ad5eecde2c0bb05524a63a26041c10193322cbc5636b51d8e94d66 · ms:3529
- 2026-10-19 · 6d9a9e9b* · exit 0 · `node --test tests/side-door-sweep.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/side-door-sweep.test.mjs` · acceptance-sha256:bc7fb39302ad5eecde2c0bb05524a63a26041c10193322cbc5636b51d8e94d66 · ms:3373
- 2026-10-19 · 6d9a9e9b* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:bc7fb39302ad5eecde2c0bb05524a63a26041c10193322cbc5636b51d8e94d66 · ms:0 · test-lock-sha256:ce89d2029ee846a2b49f30ae4d9c89af53336fe9de7ec42b423ac1b6e4fc22a1 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvc2lkZS1kb29yLXN3ZWVwLnRlc3QubWpzCWV2ZXJ5IHNpZGUgZG9vciBpcyBhbGxvdy1saXN0ZWQgd2l0aCBpdHMgcmVhc29uLCBhbmQgYSBuZXcgb25lIGZhaWxzCTMxODA5NmU2NmExMmExNjBkMGE1ZGU5YjdhNWYyMWMyMDUwNjZjNmZkZmZjYjFkOGEzZDRlZGYxNzM3NmY5NGY · test-lock-kind:replace
- 2026-10-19 · 4db47214* · exit 0 · `node --test tests/side-door-sweep.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/side-door-sweep.test.mjs` · acceptance-sha256:bc7fb39302ad5eecde2c0bb05524a63a26041c10193322cbc5636b51d8e94d66 · ms:4129
