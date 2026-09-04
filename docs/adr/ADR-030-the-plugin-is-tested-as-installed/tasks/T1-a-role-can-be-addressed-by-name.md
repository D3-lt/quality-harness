# Task ADR-030-T1: Let a skill address a role by name instead of describing it

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (a shipped directory plus the gate that governs what ships)
**Owner:** unassigned
**Produces:** `plugin/agents/` named role definitions (T1)
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `every shipped agent definition names a capability CLASS, never a version-pinned id`, `agents/ is in the shipped set rather than leaking past the gate that guards it`, `a definition's name matches its file, so subagent_type resolves`

## Goal

A skill can delegate with `subagent_type: <name>` and get the role this plugin means, instead of
describing the role in prose and hoping the model reconstructs it.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/agents/*.md` | create | the named roles |
| `tests/package.test.mjs` | edit | `agents` joins the shipped set ADR-008's test enforces, in the same commit |
| `plugin/scripts/standalone-link.mjs` | edit | a new shipped directory joins `SHADOW_SCOPE` or `NEVER_MIRRORED`; the existing gate refused the commit until it did |
| `tests/mutations.json` | edit | three catalogue entries, one per declared mechanism (ADR-003, ADR-022) |

## Ordered Steps

1. [S1] Write the failing checks first: every shipped agent definition declares a capability class and no version-pinned id, and each definition's `name` matches its filename. Confirm red before any definition exists. (TDD red.) [proof: acceptance]
2. [S2] Extend `tests/package.test.mjs`'s shipped set with `agents`, in this commit — ADR-008's gate must accept the directory deliberately rather than be worked around later. [proof: acceptance]
3. [S3] Write the definitions for roles this plugin already spawns, each carrying only what the host lets a definition carry, and each namespaced so it cannot shadow a host or user agent. [proof: acceptance]
4. [S4] Confirm the existing shipped-set assertions still hold in BOTH directions — nothing leaks in, nothing expected goes missing. [proof: acceptance]
5. [S5] Add two catalogue mutations and confirm both come back RED. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test tests/package.test.mjs tests/skill-metadata.test.mjs 2>&1 | tee /tmp/adr030-t1.out \
  && ! grep -qE "no tests to run|^not ok|^# fail [1-9]" /tmp/adr030-t1.out \
  && test -d plugin/agents
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every shipped agent definition names a capability class` | `tests/package.test.mjs` | ADR-029's alias rule holds in its second home | — | S1, S3 |
| `an agent definition's name matches its file` | `tests/package.test.mjs` | `subagent_type` resolves to the thing the file describes | — | S1, S3 |
| `what ships is the plugin and nothing else` | `tests/package.test.mjs` | the new directory is admitted deliberately, and nothing else leaked in with it | — | S2, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the definitions are tracked and the fence asserts the directory |
| 2 — something selects it | the host loads `agents/` from a plugin; `/reload-plugins` reports the count |
| 3 — the caller can discover it | a skill names one by `subagent_type`, which is the addressing this task exists to create |
| 4 — it is used | not observable from here: this repository cannot see a host spawning one, and a proxy would read like evidence |

## Mutation Log

## Verification Log

## Invariants

- No shipped definition names a version-pinned model id.
- Each definition's declared name equals its filename stem.
- `agents` is in the shipped set, and the shipped-set test still fails in both directions.

## Risks

- A definition and an `agent()` call site could request different capabilities for the same role. Accepted and stated in ADR-030's Consequences: they are different callers, not two answers to one question, and both obey the alias rule.
- A name could shadow a host or user agent. S3 namespaces every definition.

## Stop Condition

Stop if the host does not read `agents/` from a plugin directory. Then a definition is a file nothing
loads, and this task would be shipping a surface with no reader — which is the reachability failure
this corpus reports on other people's code.

## Out of Scope

- Changing any `agent()` call site (permanent: boundary: ADR-029 owns the call sites and this record explicitly does not touch one)
- `permissionMode`, `maxTurns`, `memory`, `isolation` beyond what a first definition needs (deferred: docs/BACKLOG.md §115)
