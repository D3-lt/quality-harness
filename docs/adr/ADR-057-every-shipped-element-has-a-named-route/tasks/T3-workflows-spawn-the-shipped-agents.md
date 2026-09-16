# Task ADR-057-T3: Workflows spawn the shipped agents

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** workflow `agentType` call sites
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `quality-cycle's agentType options`, `review-ring's fixer agentType`, `the agentType-to-definition check`, `ADR-029's declared capabilities and the reviewer guard`

## Goal

`quality-cycle` spawns its correctness, scope and synthesis roles as `qh-correctness-reviewer`, `qh-scope-reviewer` and `qh-synthesis`, and `review-ring` spawns its fixer as `qh-narrow-fixer`, while the two roles that invoke skills stay inline.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/workflows.test.mjs` | edit | the three tests below |
| `plugin/workflows/quality-cycle.js` | edit | `agentType` on the `correctness`, `scope-simplicity` and `synthesis` calls; `model` stays (ADR-029); `codex-external` stays inline |
| `plugin/workflows/review-ring.js` | edit | `agentType: 'quality-harness:qh-narrow-fixer'` on `fix:once`; `review:fresh` stays inline |
| `tests/mutations.json` | edit | the two entries pinned to `fix:once`'s options line (`role: a spawned role that declares no capability is reported`, `role: a pinned model id is refused where an alias is required`) get `from`/`to` that match the new line, or `scripts/mutate.mjs` reports them STALE |
| `plugin/README.md` | edit | "The roles you can address by name" says a workflow addresses a role with `agentType`, with one example, without listing the directory |

The `agentType` option on each `agent()` call is the selecting line; deleting it returns the role to the default workflow subagent, which the tests catch.

## Ordered Steps

1. [S1] Add the three tests to `tests/workflows.test.mjs` using `runWorkflow` with a recording `agent` stub, and see each fail on an assertion (TDD red).
2. [S2] Add `agentType` to the three `quality-cycle.js` calls named above.
3. [S3] Add `agentType` to `review-ring.js`'s `fix:once` call, and update both pinned `tests/mutations.json` entries so each `from` matches the new line exactly once and each `to` still removes or pins `model` as before.
4. [S4] Update `plugin/README.md`'s roles paragraph. [proof: human: read the paragraph and confirm it describes workflow addressing without restating the agent list]
5. [S5] Run the fence green and record mutants: remove `agentType` from `quality-cycle`'s `synthesis` call; remove it from `review-ring`'s `fix:once`; rename one `agentType` to a definition that does not exist. [proof: mutation]
6. [S6] After committing, run `node scripts/mutate.mjs --case 'role: a'` and confirm both updated `fix:once` entries grade RED, not STALE. [proof: human: read the campaign's verdict line for the two role entries]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(quality-cycle runs its reviewers and synthesis as the shipped agents|review-ring runs its fixer as the shipped agent and keeps its reviewer inline|every agentType a workflow names is a shipped agent definition)$' tests/workflows.test.mjs 2>&1) \
  && for name in 'quality-cycle runs its reviewers and synthesis as the shipped agents' 'review-ring runs its fixer as the shipped agent and keeps its reviewer inline' 'every agentType a workflow names is a shipped agent definition'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/workflows.test.mjs tests/reviewer-guard.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `quality-cycle runs its reviewers and synthesis as the shipped agents` | `tests/workflows.test.mjs` | with `codex: true`, the recorded options for labels `correctness`, `scope-simplicity`, `synthesis` carry the three `quality-harness:qh-*` agent types and keep `model`; `codex-external` carries no `agentType` | — | S1, S2 |
| `review-ring runs its fixer as the shipped agent and keeps its reviewer inline` | `tests/workflows.test.mjs` | a blocking verdict drives the `fix:once` call with `agentType: 'quality-harness:qh-narrow-fixer'`; `review:fresh` carries no `agentType` | — | S1, S3 |
| `every agentType a workflow names is a shipped agent definition` | `tests/workflows.test.mjs` | every `agentType` literal in `plugin/workflows/*.js` is `quality-harness:<stem>` for a tracked `plugin/agents/<stem>.md`; a synthetic unknown name is reported | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests above |
| 2 — something selects it | the `agentType` option at each call site; S5's mutants delete it |
| 3 — the caller can discover it | the definitions' frontmatter `name`, which ADR-030 T1 keeps equal to the file stem |
| 4 — it is used | not observable from `tests/`: whether the host sets `agent_type` for a workflow-spawned agent, which the reviewer guard keys on (`lifecycle.mjs:4416`), is unverified; ADR-057's Follow-up re-counts agent invocations |

## Mutation Log

## Invariants

- Every `agent()` call keeps its `model` (ADR-029, `tests/workflows.test.mjs::every spawned role declares the capability it needs`).
- Roles whose prompt invokes a skill carry no `agentType`.
- `READ_ONLY_ROLES` in `plugin/scripts/lifecycle.mjs` is unchanged.
- Every `tests/mutations.json` entry naming `plugin/workflows/review-ring.js` still matches exactly once.

## Risks

- The host may not set `agent_type` for a workflow-spawned agent, so the reviewer guard may not apply; the prompts keep their read-only wording.
- The guard refuses some read-only commands a reviewer uses to gather evidence (BACKLOG §211); a `quality-cycle` reviewer that cannot look returns `unavailable`, and the workflow fails closed.

## Stop Condition

Stop and ask if `tests/reviewer-guard.test.mjs` or ADR-029's workflow test goes red, if a `quality-cycle` role turns out to invoke a skill, or if a live `quality-cycle` run returns `reviewer-unavailable` because the guard refused the evidence commands of a reviewer it spawned.

## Out of Scope

- `consensus.js` roles (permanent: boundary: its synthesis adjudicates design proposals, not reviews)
- Giving any definition the Skill tool (permanent: boundary: it widens a read-only role; ADR-057 Alternatives)
- Loosening the reviewer guard (deferred: docs/BACKLOG.md §211)

## Verification Log
