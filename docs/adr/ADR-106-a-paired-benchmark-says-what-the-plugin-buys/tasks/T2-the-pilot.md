# Task ADR-106-T2: The pilot plans n

**Depends-on:** T1
**Awaiting-decision:** where the arms run (a plugin arm added to the other local project's runner, which is that project's change; a runner in this repository; or a cloud harness), which dataset and split (a SWE-rebench post-cutoff split, SWE-bench Pro public, or Verified despite its contamination and near-saturation), which model, the owner's budget cap in dollars and machine hours, and ADR-106 Decision 8's question of whether aggregate results may be committed
**Covers:** none — no spec
**Estimated scope:** L (a harness adapter, an external run, a pre-registration)
**Owner:** Zy
**Produces:** `prereg-main.json`
**Consumes:** the paired-rows format, the pre-registration's fields and the verdict words (T1)
**Data dependency:** needs a SWE-bench-style dataset with hidden tests, its instance images, Docker, a model, a `claude` install able to run headless with and without the plugin, and budget
**Proof map:** v1

## Goal

Run about 30 instances × `k` = 3 × 2 arms, confirm the measurement can see a difference on the chosen dataset, and commit the
pre-registration the main run is scored against.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/eval-paired-rows.mjs` | add | the adapter: the chosen harness's per-run output plus the final message's `STATUS` line become T1's rows |
| `tests/eval-paired-rows.test.mjs` | add | the adapter over a synthetic report shaped like the harness's (CLAUDE.md §6: never a real instance's) |
| `docs/adr/ADR-106-a-paired-benchmark-says-what-the-plugin-buys/prereg-main.json` | add | ADR-106 Decision 2's fields, committed before T3 runs |

## Ordered Steps

1. [S1] Write the adapter's test and record its red run (TDD red: the adapter does not exist).
2. [S2] Confirm from the harness's own source, not from a summary, that resolved means every FAIL_TO_PASS passing and every
   PASS_TO_PASS still passing, and record where that was read.
   [proof: human: the source file and line the rule was read from]
3. [S3] Build both arms as adopter sessions: fresh config, no user instructions, no other plugins or MCP servers; the `with`
   arm installs the plugin at a pinned sha. The canary records, per arm, the skill listing, the hooks that fired, the skills
   invoked and the absence of user instructions; the `with` arm must list the plugin's skills and fire its hooks, and the
   `without` arm neither. [proof: human: the canary output for each arm]
4. [S4] Run one instance in both arms alone and record its wall time and cost, before the rest are started.
   [proof: human: the first instance's time and cost]
5. [S5] Run the pilot under costly-runs (bounded, one image at a time, never beside a gate), adapt its output to rows, and run
   `node scripts/eval-paired.mjs --plan`, which needs no pre-registration and prints no verdict.
   [proof: human: the scorer's printed cells and planning output]
6. [S6] Apply ADR-106 Decision 7's stop: if the `without` arm's false-completion incidence is below 10%, or the planned
   attempts at the measured cost and time exceed the budget cap, stop and ask the owner.
   [proof: human: the numbers the decision used]
7. [S7] Otherwise write `prereg-main.json` with every Decision 2 field, n included, and commit it before T3's first run.
   [proof: human: the commit sha]

## Acceptance

Acceptance is human-observed: the owner signs off with `adr-verify <this file> --human "..."`. The line records the
configuration's digest, the canary's result, the first instance's time and cost, the planned n and the `prereg-main.json`
commit, or the reason the pilot stopped. Where Decision 8's exception is not granted, it says where the pilot's results are
held instead of quoting them.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a harness report and a final message become one row each, and a missing report is UNRUN` | `tests/eval-paired-rows.test.mjs` | `resolved`, `brokeTests`, `limit` and `status` read from a synthetic report and message; DIRTY twins: a missing report gives `unrun: true`, a message with two `STATUS` lines gives an unreadable status | — | S1 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the adapter's test |
| 2 — something selects it | the pilot runs it over its own output |
| 3 — the caller can discover it | `--help` names the input it expects |
| 4 — it is used | the sign-off line records its output |

## Mutation Log

## Invariants

- Nothing read out of an instance's repository is committed, and neither is an instance list (ADR-106 Decision 8).
- The pilot's verdict is never quoted as the result; it plans n only.

## Risks

- Grading time is unmeasured; S4 measures it before the rest of the pilot starts.

## Stop Condition

Stop and ask the owner when the Awaiting-decision is unanswered, when the canary fails, or when Decision 7's stop holds.

## Out of Scope

- The main run (T3).

## Verification Log
