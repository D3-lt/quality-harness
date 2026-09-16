# Task ADR-057-T4: Every shipped element is named by a route

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** `tests/routing.test.mjs` (file exists)
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the class enumeration from git ls-files`, `the named-route predicate and its name boundary`, `the regression suites that share the router files`

## Goal

A test enumerates every shipped skill, agent and workflow and fails for any member that no router body or workflow names.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/routing.test.mjs` | add | the class test below |

## Ordered Steps

1. [S1] Write the class test with its real assertions, with every helper T1 and T2 will also need (frontmatter stripper, router list, `git ls-files` enumeration, name predicate) at MODULE scope rather than inside the test body. Take its first `adr-verify` on today's tree, before T1–T3: it is red on an assertion naming `arch-write`, `mutation-audit`, `operating`, `postmortem` and the four `qh-*` agents. Decode the lock row and confirm the test name hashed.
2. [S2] Members: `git -C <repository root> ls-files --cached --others --exclude-standard 'plugin/skills/*/SKILL.md' 'plugin/agents/*.md' 'plugin/workflows/*.js'` (CLAUDE.md §8), name from the path.
3. [S3] Named: in the BODY (frontmatter removed) of `plugin/skills/work/SKILL.md`, `plugin/skills/quality-policy/SKILL.md` or `plugin/skills/review/SKILL.md`, as `` `name` `` or `quality-harness:name` / `/quality-harness:name` followed by a non-name character (`(?![\w-])`, the boundary `lifecycle.mjs` already uses for the same hazard); or in any `plugin/workflows/*.js` as `/quality-harness:name` or `agentType: 'quality-harness:name'` with the same boundary — excluding the member's own file. No exemptions.
4. [S4] Dirty cases inside the same test, each asserting the predicate reports the member: `work`'s body with `/quality-harness:review` removed while `review-ring.js` still names `/quality-harness:review-ring` → `review`; `quality-cycle.js` with the `qh-synthesis` `agentType` removed → `qh-synthesis`.
5. [S5] After T1, T2 and T3 land, run the fence green and record mutants: drop the `(?![\w-])` boundary from the predicate (the `review` dirty case must then fail to report); delete `/quality-harness:operating` from `work`. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^every shipped skill, agent and workflow is named by a route$' tests/routing.test.mjs 2>&1) \
  && printf '%s\n' "$out" | grep -qxE 'ok [0-9]+ - every shipped skill, agent and workflow is named by a route' \
  && node --test tests/routing.test.mjs tests/workflows.test.mjs tests/skill-metadata.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every shipped skill, agent and workflow is named by a route` | `tests/routing.test.mjs` | no member is unnamed; the two dirty cases are reported; the member list comes from `git ls-files` | — | S1, S2, S3, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the class test |
| 2 — something selects it | `scripts/selftest.sh` runs `tests/*.test.mjs`; S5's mutants show the predicate reads the boundary and the route |
| 3 — the caller can discover it | ADR-057's `Enforced-by:` names the test |
| 4 — it is used | a failing CI job on the next unrouted element; nothing measures session behaviour |

## Mutation Log

## Invariants

- The member list comes from `git ls-files`, never `readdirSync`.
- The class test's body is locked at S1 (ADR-050). Helpers shared with T1 and T2 live at module scope; T1 and T2 add tests beside it and never edit its body.
- The test carries no exemption list. A member that cannot be named by a route is a decision for a new record, not a line in this test.
- Frontmatter never counts as a route.

## Risks

- A body sentence of the form "do not use X" would count as naming X. Accepted: the three router bodies carry none today (measured 2026-09-16); frontmatter, where such clauses live, is excluded.
- A new element reached some legitimate other way fails the test; its failure message says to give it a route or decide otherwise in a record.

## Stop Condition

Stop and ask if S1's first red is not the eight members ADR-057 names — the predicate or the tree differs from what the record measured.

## Out of Scope

- Checking that a session follows a route (ADR-057 Follow-up)

## Verification Log
