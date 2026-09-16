# Task ADR-057-T1: One risk table, with Codex as a condition

**Depends-on:** T4
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** `quality-policy` risk table (single copy)
**Consumes:** `tests/routing.test.mjs` (file exists) (T4)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the single risk table in quality-policy`, `the coordinator's load of quality-policy`, `the Codex condition on each Codex route`, `the Moderate tier's subagent_type name`, `the pinned routing text and skill-name checks`

## Goal

`quality-policy` holds the only risk table; `work` loads it, `review` defers to it, its High and Open decision rows pick a Codex skill only when Codex is installed and name what runs otherwise, and its Moderate row names `qh-correctness-reviewer`.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/routing.test.mjs` | edit | the four tests below |
| `plugin/skills/quality-policy/SKILL.md` | edit | the single table: Moderate names `subagent_type: quality-harness:qh-correctness-reviewer`; High is `/quality-harness:codex-review` when Codex is installed, else `/quality-harness:quality-cycle`; Open decision is `/quality-harness:codex-advise` then `/quality-harness:consensus` with `codex: false` when Codex is installed, else `/quality-harness:consensus` |
| `plugin/skills/work/SKILL.md` | edit | §2's table is replaced by "Load `quality-harness:quality-policy` and route by its risk table"; class F runs `/quality-harness:review`, adding `/quality-harness:codex-review` only when Codex is installed and the change is substantive or an external pass is asked for |
| `plugin/skills/review/SKILL.md` | edit | "Route by Risk" loses its tier bullets: the coordinator routes review depth by `quality-harness:quality-policy`'s table, and a delegated reviewer does not re-route or load it |
| `README.md` | edit | the `quality-cycle` bullet says it is the high-risk review when Codex is not installed |

The router files are the selecting lines: the coordinator reads `quality-policy` and picks by row.

## Ordered Steps

1. [S1] Add the four tests to `tests/routing.test.mjs` with real assertions and see each fail on an assertion against the current skill text (TDD red). Take the first `adr-verify` red on these bodies, not on stubs.
2. [S2] Rewrite `quality-policy`'s table rows as the Goal says. Keep the Evidence contract, Blocking review findings and Delegation boundary sections unchanged.
3. [S3] Replace `work` §2's table with the load imperative; keep the parallelize and one-writer sentences. Change class F's route to the Codex-conditional form.
4. [S4] Replace `review`'s tier bullets with the coordinator sentence; keep the parallel-reviewers and read-only-leaf sentences.
5. [S5] Update `README.md`'s `quality-cycle` bullet. [proof: acceptance]
6. [S6] Run the fence green, then record mutants through `adr-verify --mutant`: delete the load sentence from `work` §2; delete "when Codex is installed" from the High row; delete `quality-harness:qh-correctness-reviewer` from the Moderate row; add a "Moderate … fresh-context reviewer" bullet back to `review`. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(the risk table has one home|the coordinator loads quality-policy and a delegated reviewer does not|a Codex route says what runs when Codex is not installed|the Moderate tier spawns the correctness reviewer by name)$' tests/routing.test.mjs 2>&1) \
  && for name in 'the risk table has one home' 'the coordinator loads quality-policy and a delegated reviewer does not' 'a Codex route says what runs when Codex is not installed' 'the Moderate tier spawns the correctness reviewer by name'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/skill-metadata.test.mjs tests/skill-contract.test.mjs tests/package.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the risk table has one home` | `tests/routing.test.mjs` | after collapsing whitespace, only `quality-policy`'s body has a table row or sentence naming a tier (`Moderate`, `High`, `Open decision`) together with a review route (`fresh-context reviewer`, `qh-correctness-reviewer`, `quality-cycle`, `codex-review`, `codex-advise`, `consensus`); a synthetic `review` body carrying a tier bullet is reported | — | S1, S2, S3, S4 |
| `the coordinator loads quality-policy and a delegated reviewer does not` | `tests/routing.test.mjs` | `work` §2 contains a load imperative naming `quality-harness:quality-policy`; `review`'s "Route by Risk" names it as the coordinator's table and contains no load imperative | — | S1, S3, S4 |
| `a Codex route says what runs when Codex is not installed` | `tests/routing.test.mjs` | after collapsing whitespace, every table row or sentence in the three router bodies naming `codex-review` or `codex-advise` says "Codex is installed" and names a no-Codex route; the Open decision row passes `codex: false` to `consensus`; a synthetic unconditioned sentence is reported | — | S1, S2, S3 |
| `the Moderate tier spawns the correctness reviewer by name` | `tests/routing.test.mjs` | the Moderate row names `quality-harness:qh-correctness-reviewer` without a leading slash, and `plugin/agents/qh-correctness-reviewer.md` is tracked | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the four tests above |
| 2 — something selects it | `work` §2's load imperative; S6's mutants show each assertion reads the line it names |
| 3 — the caller can discover it | the skill text a session reads; `tests/skill-contract.test.mjs` keeps every `/quality-harness:` name resolvable |
| 4 — it is used | nothing measures this yet; ADR-057's Follow-up re-counts invocations on or after 2026-10-16 |

## Mutation Log

## Invariants

- `work/SKILL.md` keeps every phrase `tests/skill-metadata.test.mjs` pins.
- No router sentence offers a Codex skill without saying what runs when Codex is not installed.
- `quality-policy` keeps `user-invocable: false` and its own "do not preload into child agents" rule; `review` does not load it.
- `README.md` keeps every skill name `tests/package.test.mjs` requires.
- `quality-policy` or `review` keeps at least one `/quality-harness:work` mention in its body: T4 has no exemption for the router, and those mentions are its route.

## Risks

- A coordinator reading `work` without loading `quality-policy` has no risk table. Mitigated by the imperative and its test.
- The "installed" wording drifts from what `codex-review` actually probes. Both say `command -v codex`.

## Stop Condition

Stop and ask if removing the table from `work` breaks a test outside `tests/routing.test.mjs`, or if a pinned phrase must change to fit the new §2.

## Out of Scope

- Class D, class A, §0 and §3 wording (T2's job)
- Workflow `agentType` (T3's job)

## Verification Log
