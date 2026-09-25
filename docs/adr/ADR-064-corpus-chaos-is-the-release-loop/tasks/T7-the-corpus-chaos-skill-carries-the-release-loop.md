# Task ADR-064-T7: The corpus-chaos skill carries the release loop

**Depends-on:** T2, T3
**Covers:** none — no spec
**Estimated scope:** S (one skill)
**Owner:** unassigned
**Produces:** the release-loop protocol in `plugin/skills/corpus-chaos/SKILL.md`
**Consumes:** `--diff` (T2), `--attest` (T3)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the runner steps probe once and read the saved report twice`, `an attestation needs a checkout at the candidate sha`, `the triage classes are named`

## Goal

`plugin/skills/corpus-chaos/SKILL.md` carries the loop.
- **The roster, by shape:** Rust, Go, a PHP/Laravel repository, a PHP/React product, a JS SPA, a static site, and at least two Windows sessions.
- **One request template.**
- **The runner's steps** in its `## Runner` section: one probe, `corpus-probe <root> --json > new.json`; then `corpus-probe --diff old.json new.json` when an earlier report exists; then `corpus-probe --attest <label> new.json`.
- **Where to probe from:** a plugin checkout at the release-candidate sha. An installed plugin cache has no git, so its attestation carries `at: null` and does not count.
- **When:** once per batch.
- **The four triage classes:** a false refusal or fail-open is fixed in the batch; wording goes to the next batch; the corpus's own problem is told to its owner; behaviour that is by design is recorded.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/skills/corpus-chaos/SKILL.md` | edit | the protocol |
| `tests/corpus-chaos-protocol.test.mjs` | add | the test below |
| `tests/mutations.json` | edit | mutants |

## Ordered Steps

1. [S1] Write the test(s) below and see each fail on an assertion (TDD red).
2. [S2] Write the protocol into the runner and asker halves, keeping the existing rules (verbatim output, never route around a peer's classifier).
3. [S3] Run the fence green, and record mutants with `adr-verify --mutant`: remove the `--diff` step from the runner half; remove the checkout requirement. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/corpus-chaos-protocol.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (the corpus-chaos skill carries the release-loop protocol)' | grep -qx 1
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the corpus-chaos skill carries the release-loop protocol` | `tests/corpus-chaos-protocol.test.mjs` | within the `## Runner` section alone, the three commands appear in order with one probe run, and the checkout-at-the-candidate-sha requirement is stated; the four triage classes are named in the asker half | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the protocol text |
| 2 — something selects it | the skill's description routes probe requests to it |
| 3 — the caller can discover it | `/quality-harness:corpus-chaos` |
| 4 — it is used | the batch's chaos round follows it |

## Mutation Log

## Invariants

- The runner half still says: report, never judge; never edit the probed repository; never work around a classifier.

## Risks

- A roster names shapes, not people or machines (CLAUDE.md §6).

## Stop Condition

Stop and ask if the protocol would ask a runner to send anything the probe does not scrub.

## Out of Scope

- Naming specific peer sessions in the skill (permanent: boundary: the skill ships to adopters; sessions are this machine's)

## Verification Log
