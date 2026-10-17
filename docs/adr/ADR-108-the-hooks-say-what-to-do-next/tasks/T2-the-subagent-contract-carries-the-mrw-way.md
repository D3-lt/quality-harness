# Task ADR-108-T2: The subagent contract carries the mrw way

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one sentence, one test)
**Owner:** unassigned
**Produces:** the batching sentence in `subagentContract`
**Consumes:** none
**Proof map:** v1

## Goal

Every spawned role whose delegation allows edits is told, in the contract the SubagentStart hook hands it, to read every
site before the first edit, make the edits as one batch, and check that each edit landed (ADR-108, Decision 2).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/completion-rules.mjs` | edit | `subagentContract` gains one sentence after `roleLine`, only for a role that is not read-only |
| `tests/adr-108.test.mjs` | edit | the test below |
| `tests/mutations/plugin/scripts/completion-rules.mjs.json` | edit | the catalogue mutant |

## Ordered Steps

1. [S1] Add the test below and record the red run.
2. [S2] Add the sentence: `Read every site you will touch before the first edit, make the edits as one batch, and check that each landed: an edit that matched nothing is a failure (the execution skill's "Read and edit in batches").` A read-only role does not get it.
3. [S3] Add the catalogue mutant (the sentence dropped) and record a killed mutant. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/adr-108.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - a spawned implementer is told to read every site, edit in one batch, and check each edit landed")" = 1 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a spawned implementer is told to read every site, edit in one batch, and check each edit landed` | `tests/adr-108.test.mjs` | through the real SubagentStart hook: an implementer's contract carries the sentence; a reviewer's (read-only) does not; the sentence names the `execution` skill's section heading, which exists (`tests/mrw-way.test.mjs` holds the heading) | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the sentence in `subagentContract` |
| 2 — something selects it | a non-read-only `agent_type` |
| 3 — the caller can discover it | the SubagentStart hook's output |
| 4 — it is used | the test drives the real hook |

## Mutation Log

## Invariants

- `tests/review-contract.test.mjs` (ADR-098 T2, locked) stays green: the blocking definitions are untouched.

## Risks

- None beyond ADR-108's.

## Stop Condition

Stop and ask if the sentence cannot be added without changing a line a locked test hashes.

## Out of Scope

- The read-only roles' contract (permanent: boundary: they do not edit)

## Verification Log
