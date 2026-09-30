# Task ADR-076-T4: Paired verdicts over three real task files

**Depends-on:** T2
**Covers:** F-6
**Estimated scope:** S (three pinned replays, both ways; one sign-off)
**Owner:** unassigned
**Produces:** none
**Consumes:** `adr-verify --in-place` and its first line (T2)
**Data dependency:** three task files of this corpus, each with a mutation whose `--from`, `--to` and `--why` are written down here before the runs, replayed in a scratch clone at the commit under test
**Proof map:** v1

## Goal

Before isolation is the default in a release, an isolated and an in-place `adr-verify --mutant` of the same pinned mutation give the same verdict over three real task files of this corpus, and the isolated arm is shown to have been isolated (ADR-076 Decision, "Parity").

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/BACKLOG.md` | edit | the pinned replays, the first lines and the verdicts |

## Ordered Steps

1. [S1] TDD red: none written here. F-6's failing test is T2's `an isolated and an in-place run record the same verdict`, red until T2; this task adds the real-record evidence. Pin three replays: for each, the task file, an explicit `--from`, `--to` and `--why` (a Mutation Log row holds neither `--from` nor `--to`; take them from the task's catalogue entry or write them), and the commit. One from ADR-075, one gate task from ADR-074, one from ADR-072. [proof: human: the choice of records is a judgement]
2. [S2] In a fresh scratch clone at that commit, on a clean tree, run each replay isolated, then `--in-place` in a second fresh clone. Keep both first lines and both rows. [proof: human: read from the two runs]
3. [S3] Accept only when every isolated arm's first line says "isolated in", every run completed, and both arms record `mutant killed`. Record all of it in BACKLOG. [proof: human: an entry in the backlog]

## Acceptance

Acceptance is human-observed: the owner signs off the three pinned replays, with both first lines, both rows, and zero mismatches, named in BACKLOG.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| — | — | the sign-off | F-6 | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three pinned replays |
| 2 — something selects it | the default mode of `adr-verify --mutant` |
| 3 — the caller can discover it | the first line of each run |
| 4 — it is used | this sign-off |

## Mutation Log

## Invariants

- Scratch clones, never this checkout, are where the mutants run.

## Risks

- Three records are a sample, not the corpus; the release's outside run (§18) is the evidence from beyond it.

## Stop Condition

Stop and ask if any pair disagrees, or if an isolated arm ran in place.

## Out of Scope

- Pairing the whole corpus's Mutation Logs (deferred: docs/BACKLOG.md ADR-076 entry)

## Verification Log
- 2026-09-30 · human-observed · Zy signed off 2026-09-30: three pinned replays at 4300b93 in fresh clones (ADR-075 T1 load.mjs, ADR-074 T1 adr-retire-check, ADR-072 T1 mutate.mjs; --from/--to from their catalogue entries), each isolated and --in-place: 6/6 completed, all mutant killed, every isolated first line 'isolated in', 0 mismatches, no target left dirty, no worktree left; the same held at 176d7b0 before the Codex round
