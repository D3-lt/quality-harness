# Task ADR-116-T2: SessionStart fetches this machine's `qh` and keeps it only when it verifies

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** the verified binary under `CLAUDE_PLUGIN_DATA/qh/<version>/`
**Consumes:** the assets (T1)
**Data dependency:** hermetic for the tests; the first real release is where the assets are first observed
**Proof map:** v1

## Goal

SessionStart starts a detached fetch of this platform's asset for the installed version, keeps it only when its SHA-256 matches `SHA256SUMS.txt` of the same release, and says a failure once (ADR-116, Decision 2).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/qh-fetch.test.mjs` | add | the task's test, with a planted twin that must fail |
| `plugin/scripts/qh-fetch.mjs` | add | the fetch and the verification |
| `plugin/scripts/on-session-start.mjs` | edit | starts it detached, as ADR-080 starts the artifact pass |

## Ordered Steps

1. [S1] Write the failing test. Record the red run.
2. [S2] Write the fetch with an injectable transport, verify, write atomically, and start it from SessionStart.
3. [S3] Record a killed mutant per decision point, with catalogue entries for Node sources. [proof: mutation]

## Acceptance

```bash
node --test tests/qh-fetch.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a fetched qh is kept only when its checksum matches, and a failure is said once` | `tests/qh-fetch.test.mjs` | a matching asset kept; a mismatching, missing or unreachable one leaving nothing; `QUALITY_HARNESS_QH_FETCH=off`; no hook waiting | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the change |
| 2 — something selects it | the caller named in Produces, and the mutant that removes the call |
| 3 — the caller can discover it | the line it says |
| 4 — it is used | every release, or every session once ADR-110 T3 switches |

## Mutation Log

## Invariants

- No hook waits on the fetch (ADR-080).
- Nothing unverified is ever written where the launcher looks.

## Risks

- A fetch inside a hook is a network call in the session; it is detached and bounded, and `off` turns it off.

## Stop Condition

Stop if verification cannot use the same release's checksum list.

## Out of Scope

- Switching `hooks.json` (deferred: docs/adr/ADR-110-a-static-core-owns-the-hooks.md)

## Verification Log
