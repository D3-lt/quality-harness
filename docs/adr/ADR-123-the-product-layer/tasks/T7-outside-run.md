# Task ADR-123-T7: A peer maps and runs a model of its own

**Depends-on:** T4, T6
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** the outside evidence for the release
**Consumes:** `--merge` (T4); the map mode (T6)
**Data dependency:** needs an eligible peer with a repository of its own; the Acceptance is a person's reading
**Proof map:** v1

## Goal

A peer maps its repository, runs spec-verify `--implemented` over the model, merges one spec's delta, runs spec-verify over the
merged model and arch-lint over its architecture document, and reports everything printed; its corpus-probe attestation is
imported.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/corpus-reports/` | create | the imported attestation, counts only |

## Ordered Steps

1. [S1] Ask one eligible peer (CLAUDE.md §18) to map its repository, run spec-verify `--spec` and `--implemented` over the model,
   merge one spec's delta, run spec-verify `--spec` and `--implemented` over the merged model, run arch-lint over its
   architecture document, and run `corpus-probe.mjs --json` at the implementation commit after its mutation jobs are green; ask
   for everything printed, including which rules ran. [proof: human: the person reads the peer's verbatim output and records the corpus shape and the rule counts, never the content]
2. [S2] Import the peer's corpus-probe attestation with `node scripts/attest-import.mjs`. [proof: acceptance]

## Acceptance

Acceptance is human-observed: a person reads the peer's output, confirms every rule it bound was reported as run, the merge
wrote a model that passed both modes, and arch-lint ran over the architecture document, and signs off with the corpus shape
and counts; the attestation is filed under `docs/corpus-reports/`.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| — | — | — | — | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the sign-off and the attestation |
| 2 — something selects it | the release (CLAUDE.md §18) |
| 3 — the caller can discover it | the record |
| 4 — it is used | release-evidence reads the attestation |

## Mutation Log

## Invariants

- Nothing from the peer's corpus is committed (CLAUDE.md §6).

## Risks

- A peer's permission check blocks foreign code: its user approves there, never worked around.

## Stop Condition

Stop the release if the peer's model passes with a rule reported as not run.

## Out of Scope

- Other hosts (ADR-124).

## Verification Log
