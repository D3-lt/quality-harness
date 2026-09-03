# Task ADR-029-T1: Make every spawned role declare the capability it needs

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (three workflows plus a gate)
**Owner:** unassigned
**Produces:** every shipped `agent()` call carries `model` (T1)
**Consumes:** none
**Data dependency:** hermetic — the check reads the workflow sources, never a live spawn
**Proof map:** v1
**Rests-on:** `every agent() call in a shipped workflow declares a model`, `a version-pinned model id is refused where an alias is required`, `the check is derived from the sources rather than from a list kept beside them`, `each shipped workflow still parses after the edit`, `the roles' prompts and schemas are unchanged by adding an option key`

## Goal

Every role this plugin spawns says what capability it needs, at the call site, using a host alias
rather than a version-pinned id — and a gate fails when one does not.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/workflows/quality-cycle.js` | edit | four roles: two reviewers, an optional Codex critique, a synthesiser |
| `plugin/workflows/review-ring.js` | edit | two roles: a reviewer and a narrow fixer |
| `plugin/workflows/consensus.js` | edit | drafters and critics |
| `tests/workflows.test.mjs` | edit | the gate, derived from the sources |
| `tests/mutations.json` | edit | two catalogue entries (ADR-003) |

## Ordered Steps

1. [S1] Write the failing test first: enumerate every `agent(` call in every shipped workflow FROM THE SOURCES, and assert each carries a `model`. Confirm red — it must report ten today. (TDD red.) [proof: acceptance]
2. [S2] Assert the second half in the same test: a version-pinned id (anything matching `claude-[a-z]+-\d`) is REFUSED where an alias is required. A pinned id is a stored fact about a catalogue this project does not own. [proof: acceptance]
3. [S3] Set `model` on each call, following the role taxonomy in ADR-029's Decision — arbitrating and drafting roles are planner-shaped, the narrow fixer is executor-shaped. Set `effort` only where the role's own text asks for depth. [proof: acceptance]
4. [S4] Confirm every workflow still parses and its schema-bearing calls are unchanged: `node --check` on each, and the existing workflow tests green. [proof: acceptance]
5. [S5] Add two catalogue mutations and confirm both come back RED. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test tests/workflows.test.mjs 2>&1 | tee /tmp/adr029-t1.out \
  && ! grep -qE "no tests to run|^not ok|^# fail [1-9]" /tmp/adr029-t1.out \
  && node --check plugin/workflows/quality-cycle.js \
  && node --check plugin/workflows/review-ring.js \
  && node --check plugin/workflows/consensus.js
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every spawned role declares the capability it needs` | `tests/workflows.test.mjs` | no role silently inherits whatever ran | — | S1, S3 |
| `a role names a capability class, never a pinned model id` | `tests/workflows.test.mjs` | the stored-fact defect this record refuses | — | S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the `model` keys are in the tracked workflow sources and the fence reads them |
| 2 — something selects it | the host's Workflow runtime reads the options object these calls already pass |
| 3 — the caller can discover it | the key sits beside `label` and `phase` on the same call, which is where an author is already looking |
| 4 — it is used | not observable from here: this repository cannot see a host honouring the key, and a proxy would read like evidence |

## Mutation Log

## Verification Log

## Invariants

- Every `agent(` call in a shipped workflow carries a `model`.
- No shipped workflow names a version-pinned model id.
- The enumeration comes from the sources, never from a list maintained beside them.
- The workflows' prompts, schemas, labels and phases are unchanged by this task.

## Risks

- The test asserts PRESENCE, not that the choice is sensible — stated in ADR-029's Decision and Risks, and left to review and §114 rather than pretended away here.
- An alias could later be retired by the host. Lower risk than a pinned id, which is why the record refuses ids; S2 is the guard that keeps it that way.

## Stop Condition

Stop if the roles turn out not to be differentiable — if every call honestly wants the same
capability, then declaring it is ceremony and ADR-029's pre-registered failure has fired on its
first execution rather than later. Report that; do not fill the keys in to satisfy the gate.

## Out of Scope

- Judging whether a cheaper alias is adequate for any role (deferred: docs/BACKLOG.md §114)
- The other subagent knobs, and named `plugin/agents/` definitions (deferred: docs/BACKLOG.md §115)
- Naming the assignment in prose anywhere (permanent: boundary: ADR-029 decides the call sites are the source of truth, because a prose assignment drifts from what it describes)
