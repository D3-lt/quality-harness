# The nervous-system plan

**Date:** 2026-09-30. **Status:** plan. It decides nothing: each stage becomes work only through its own spec and an Accepted ADR (CLAUDE.md §10). It turns the research note `docs/research/2026-09-26-model-out-of-the-loop.md` and the roadmap in `docs/BACKLOG.md` §301 into stages someone can execute and something can falsify. It was written because a Codex review of the plan (gpt-6-astra at xhigh, 2026-09-30) found the roadmap a sound research agenda with no contracts. Every stage named a mechanism; none named who reads its signal, what they may do with it, or what would show it failed.

## What the owner calls the nervous system

The harness senses its own conditions and acts on them without the model having to remember to:

- **interoception** — every result says the conditions it was measured under;
- **homeostasis** — the shared machine and the shared checkout stay healthy;
- **the model out of the loop** — wherever a deterministic mechanism can carry a discipline that prose asks the model to keep.

A signal nobody reads is not part of a nervous system. So each stage below names its reader before its producer is built.

## The contract every stage carries

| Field | What it says |
|-------|--------------|
| Producer | what emits the signal, and where it is recorded |
| Scope and freshness | what the signal is about, and when it stops being true |
| Reader | what reads it, and at which moment |
| Permitted action | advice, unless an Accepted record grants more (CLAUDE.md §3: two refusals are sanctioned, and no others) |
| Unknown arm | what is said when the signal could not be taken — never silence, never "fine" (ADR-005) |
| Owner | who carries the stage |
| Dataset | the data its criterion is measured on, and whether it exists today |
| Acceptance / rollback | the number that shows it worked, and the one that shows it must come out |

## The stages, in order

| Stage | Producer → reader → action | Unknown arm | Dataset | Acceptance | Rollback | Owner |
|-------|----------------------------|-------------|---------|------------|----------|-------|
| **N1 — sense the machine, stop exposing the checkout** (ADR-075) | `plugin/scripts/load.mjs` in `qh-check` and every campaign → the record and the printed summary → none automatic; a person reads it. Isolation: `scripts/mutate.mjs` runs campaigns in a worktree in the git directory | "the load could not be read"; "could not isolate", naming `--in-place` | ADR-075 T4's paired uncached runs over the real catalogue; `checks.jsonl` | T4: zero selection or verdict mismatches over 122 lifecycle entries and one shard, every worktree under 2000 ms; every record carries both samples | `git revert`; `--in-place` | Zy |
| **N2 — read contention** | N1's `contended` → the completion and commit advisories that already read `checks.jsonl` → advice: "the last passing check ran above the core count; its pass is unattributable" | `contended: null` is said as could-not-read, not as quiet | a week of this machine's `checks.jsonl` once N1 ships (none today) | on a replay of that week, the advice appears on every contended pass and on no uncontended one | remove the advisory line | unassigned |
| **N3 — a machine lease** (split from Stage 7) | `qh-check` and campaigns take a lease file in a machine-wide state directory → the next heavy job → advice that it is running beside another, and an opt-in wait | lease unreadable: say so and run | N1's samples plus the lease log, three days of ordinary use | overlapping heavy runs among participating jobs: 0; no lease outlives its owner, and any stale lease is swept by pid | an environment opt-out; the lease file deleted | unassigned |
| **N4 — close the exposure class** | `plugin/bin/adr-verify --mutant` and `scripts/unasserted.mjs`, the siblings ADR-075 names, reuse `isolate()` → their own runs | "could not isolate", naming their in-place form | a fixture like ADR-075's, plus three real records' mutants | no mutant in the checkout mid-run; paired verdicts equal | revert; the in-place form | unassigned |
| **N5 — the research stages** (§301 Stages 1, 2, 5 and 6) | each stays research until it fills this contract | — | — | see the falsification rows below | — | unassigned |

**Sequencing.**
- N2 reads the field N1 writes.
- N3's dataset is N1's samples.
- N4 reuses N1's `isolate()` and can run beside N2.
- N5's stages wait for their own specs.

N3 is split from Stage 7's research, scheduling and prediction. A machine lease is homeostasis and does not need to wait for the optimisation stages to report.

## What would show a research stage failed (Codex, 2026-09-30)

| §301 stage | Failure | What exists, and what is missing |
|------------|---------|----------------------------------|
| 1 — measurement | misattribution, omitted unknowns, or observer overhead swamping the benefit measured | one transcript baseline; repeatable workloads and an overhead limit are missing |
| 2 — shared facts, rendering | lost facts, stale state, missed delta transitions, or worse decisions by the model | parity and an A/B are proposed; the evaluation set, decision labels and acceptance margin are missing |
| 5 — finding to fixture | the fixture does not reproduce the finding, flags its clean twin, or loses provenance | importer audit data exists; a labelled replay set and a retained human confirmation are missing |
| 6 — latency, cache | stale answers, or no material gain under comparable conditions | branch-state measurements exist, some taken under load; invalidation tests, latency percentiles and a rollback threshold are missing |

## What would show the whole plan failed

After N1 to N3, either of these ends the plan:

- a release decision still rests on a gate pass that ran contended and said nothing;
- a peer session still meets a mutant from a campaign run here (BACKLOG §272's kind).

Both are counted from records, not recalled.

## Deferred here by ADR-077

- `adr-verify` fences, `unasserted.mjs` and `campaign-parity.mjs` as lease participants: wait for N2's data on how often heavy runs collide.
- The plan's three-day collision criterion: measured as a follow-up of ADR-077, once those participants are decided.
