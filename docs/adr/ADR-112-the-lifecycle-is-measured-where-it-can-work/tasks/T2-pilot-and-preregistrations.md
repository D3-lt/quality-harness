# Task ADR-112-T2: The pilot verifies green baselines, and the pre-registrations are committed

**Depends-on:** T1
**Blocked-on:** tool-multipathreadwrite's ADR for the stage (container shims, the pre-agent file, configuration W) accepted and its pilot run; checked by: the bench peer
**Covers:** none — no spec
**Estimated scope:** M (an external pilot and four pre-registration files)
**Owner:** Zy
**Produces:** `prereg-<pair>-<model>.json`
**Consumes:** the broken-tests endpoint and PAYS (T1)
**Data dependency:** needs tool-multipathreadwrite's pilot rows and green-baseline counts
**Proof map:** v1

## Goal

The pilot shows which candidate instances have a check green on the unmodified tree and what an attempt costs per arm;
then one pre-registration per pair and model is committed before the stage's first counted attempt (ADR-112, Decisions 1
to 3).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/adr/ADR-112-the-lifecycle-is-measured-where-it-can-work/prereg-P-claude-sonnet-5-5.json` | add | P against A, Sonnet |
| `docs/adr/ADR-112-the-lifecycle-is-measured-where-it-can-work/prereg-W-claude-sonnet-5-5.json` | add | W against A, Sonnet |
| `docs/adr/ADR-112-the-lifecycle-is-measured-where-it-can-work/prereg-P-claude-opus-5-5.json` | add | P against A, Opus |
| `docs/adr/ADR-112-the-lifecycle-is-measured-where-it-can-work/prereg-W-claude-opus-5-5.json` | add | W against A, Opus |

## Ordered Steps

1. [S1] Score the pilot's rows with `eval-paired.mjs --plan` per pair and model, as a plumbing check, never a verdict. [proof: human: the planning output's location, outside the repository]
2. [S2] Record the green-baseline count, the rule that dropped the rest, and the per-attempt time and cost per arm, and ask the owner for the price. [proof: human: the counts, the timings and the owner's word]
3. [S3] Commit the four pre-registrations, each naming both endpoints, alpha 0.0125, the arms and the scored list's digest, before the first counted attempt. [proof: human: the commit sha and the first attempt's start time]

## Acceptance

Acceptance is human-observed: the owner signs off with `adr-verify <this file> --human "..."`, naming the pilot's counts,
the price approved, and the pre-registrations' commit.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| — | — | no new test: T1's tests cover the scorer this task runs | — | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the pre-registrations |
| 2 — something selects it | T3's scorer runs |
| 3 — the caller can discover it | the sign-off line |
| 4 — it is used | T3 |

## Mutation Log

## Invariants

- Nothing in a pre-registration is chosen after a counted row exists.
- No instance id is committed.

## Risks

- The pool that survives the green-baseline rule is smaller than 40 per model; the stage then waits for the owner.

## Stop Condition

Stop if the owner does not approve the price, or the surviving pool is below 40 per model.

## Out of Scope

- The bench's own ADR (external: tool-multipathreadwrite: its stage ADR)

## Verification Log
