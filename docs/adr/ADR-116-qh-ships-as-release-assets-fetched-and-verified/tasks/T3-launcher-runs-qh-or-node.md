# Task ADR-116-T3: A launcher runs `qh` where one is verified, and the Node hooks otherwise

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `plugin/bin/qh-hook`
**Consumes:** the verified binary path (T2)
**Data dependency:** hermetic for the tests; the first real release is where the assets are first observed
**Proof map:** v1

## Goal

A POSIX sh launcher runs the verified `qh` for this platform and version, and `node lifecycle.mjs` whenever there is none or it does not answer (ADR-116, Decision 3).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/qh-launcher.test.mjs` | add | the task's test, with a planted twin that must fail |
| `plugin/bin/qh-hook` | add | the launcher |

## Ordered Steps

1. [S1] Write the failing test. Record the red run.
2. [S2] Write the launcher; it is not wired into `hooks.json` here.
3. [S3] Record a killed mutant per decision point, with catalogue entries for Node sources. [proof: mutation]

## Acceptance

```bash
node --test tests/qh-launcher.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the launcher runs qh where a verified one is present, and Node otherwise` | `tests/qh-launcher.test.mjs` | the same hook output from both branches over a golden scenario; an absent, unverified or unanswering binary taking the Node branch | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the change |
| 2 — something selects it | the caller named in Produces, and the mutant that removes the call |
| 3 — the caller can discover it | the line it says |
| 4 — it is used | every release, or every session once ADR-110 T3 switches |

## Mutation Log

## Invariants

- A machine without a binary runs exactly what it runs today.

## Risks

- Git Bash on Windows is assumed for hook commands; the Windows CI job is where that is observed.

## Stop Condition

Stop if ADR-110 T2's numbers argue against the switch; the launcher then waits unwired.

## Out of Scope

- Switching `hooks.json` (deferred: docs/adr/ADR-110-a-static-core-owns-the-hooks.md)

## Verification Log
