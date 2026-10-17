# Task ADR-106-T2: The pilot checks the plumbing, and the pre-registrations are committed

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (two pre-registration files and a plumbing check; amended 2026-10-17)
**Owner:** Zy
**Produces:** `prereg-main-claude-sonnet-5-5.json`, `prereg-main-claude-opus-5-5.json`
**Consumes:** the paired-rows format, the pre-registration's fields and the verdict words (T1)
**Data dependency:** tool-multipathreadwrite ADR-162 T4's pilot rows (`bench export-paired` over its `docs/bench/stage-5-pilot/`), and its Stage 5 configuration
**Proof map:** v1

## Goal

Amended 2026-10-17 (ADR-106, "Amendment, 2026-10-17"). The pilot no longer plans n, because tool-multipathreadwrite
ADR-162's Stage 5 fixes the sample. Instead it checks that the rows that project's `bench export-paired` writes are the
rows T1's scorer reads. Then one pre-registration per model is committed before Stage 5's first counted attempt.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/adr/ADR-106-a-paired-benchmark-says-what-the-plugin-buys/prereg-main-claude-sonnet-5-5.json` | add | Decision 2's fields as amended, for Sonnet 5.5 |
| `docs/adr/ADR-106-a-paired-benchmark-says-what-the-plugin-buys/prereg-main-claude-opus-5-5.json` | add | the same, for Opus 5.5 |

## Ordered Steps

1. [S1] Score ADR-162 T4's pilot rows, one model at a time, with `node scripts/eval-paired.mjs --plan`: the scorer reads every
   row and every config field `bench export-paired` wrote, and prints no verdict. [proof: human: the scorer's planning output for each model]
2. [S2] Confirm from the harness's own source, not from a summary, that resolved means every FAIL_TO_PASS passing and every
   PASS_TO_PASS still passing, and record where that was read. [proof: human: the source file and line the rule was read from]
3. [S3] Record ADR-162 T4's canary for A and P on each model: P lists this plugin's skills and fires its session hooks, A
   neither. [proof: human: the canary output for each arm]
4. [S4] Write the two pre-registrations. Each holds every Decision 2 field as amended, valued from Stage 5's configuration:
   - the pool's digest and rule;
   - the CLI, the plugin's tag and commit, the scaffold, the prompt's digest and the limits;
   - T1's scorer blob sha at its merge commit;
   - `alpha` 0.01, `arms`, and `block_size` 40.

   Commit them before Stage 5's first counted attempt. [proof: human: the commit sha, and Stage 5's first counted attempt's start time]

## Acceptance

Acceptance is human-observed: the owner signs off with `adr-verify <this file> --human "..."`. The line records the
pre-registrations' commit and digests, the canary's result, the scorer's blob sha and where the planning output is kept
outside the repository. That output is never committed and the line quotes no figure from it, since Decision 8's exception
is not granted (CLAUDE.md §6).

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| — | — | no new test here: T1's tests cover the scorer, and the rows' writer is tested in tool-multipathreadwrite (`TestExportPairedWritesADR106Rows`) | — | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two pre-registration files |
| 2 — something selects it | T3 scores each model against its file |
| 3 — the caller can discover it | the files beside these tasks, and the amendment that names them |
| 4 — it is used | T3 |

## Mutation Log

## Invariants

- Nothing read out of an instance's repository is committed, and neither is an instance list (Decision 8); the pool's digest is.
- The pilot's output plans nothing and is never quoted as a result.

## Risks

- A pre-registration value copied by hand can differ from what the stage records; T1's scorer refuses any field that
  differs, so the risk is an INCONCLUSIVE, not a wrong verdict.

## Stop Condition

Stop and ask the owner if the scorer cannot read the pilot's rows, or if a pre-registration cannot be committed before
Stage 5's first counted attempt.

## Out of Scope

- The main run (T3).
- An adapter in this repository (permanent: boundary: the rows come from tool-multipathreadwrite's `bench export-paired`, amended 2026-10-17)

## Verification Log
- 2026-10-17 · human-observed · observed by the Claude session mac-quality-harness-main-dev on 2026-10-17, executing on the owner's instruction 'do 106' (agents execute; the owner may append a line of their own). S1: eval-paired.mjs --plan --with P --without A read every row and config field of tool-multipathreadwrite's pilot-export rows (bench export-paired, each model with its own canary), exit 0 for claude-sonnet-5-5 and claude-opus-5-5, and printed planning output only; that output is kept outside the repository in the owner's local data directory under qh-adr106/t2-plan. The pilot's finding, recorded as the peer reported it: the agents' checkouts carry no test dependencies, so the claim line under-claims while the oracle resolves; the owner chose 'proceed as designed'. S2: swebench 5.0.2, harness/grading.py:309-326 (FULL only when fail-to-pass and pass-to-pass are both 1, an empty list counting as 1) and :387-388 (resolved is set only on FULL). S3: tool-multipathreadwrite 6de290ac docs/bench/stage-5-pilot/canary.json and canary-opus-5-5.json both pass true with problems {}, judged by internal/bench/canary.go:170-229 CheckProfileCanary; spot check of the canary transcripts: P lists 21 quality-harness skills and fires SessionStart, UserPromptSubmit and Stop on both models, A lists none and fires none. S4: prereg-main-claude-sonnet-5-5.json sha256 1692e40e7fd99e8622956541a77ef94158602562f362ea93083f76d1c620899a and prereg-main-claude-opus-5-5.json sha256 ea2c3d57da77a6c8f142472e1113010bdb0d92815d5940ad938f3f4b741e9f91, committed in ac0b291e at 2026-10-17T13:19:47Z, pin scorer blob 558548fa190e07ac2375331c02ae8860e3f49067 (scripts/eval-paired.mjs at ac0b291e); Stage 5's first counted attempt started 2026-10-17T13:21:22Z per its receipt, so the pre-registrations came first. Their rule, dataset, split, revision and instance-list digest equal bench/swe-bench/selection-adr-162.json (191 ids, sha256 371a9dfd); the CLI, plugin, prompt digest, turns and budget equal the pilot's stage5 profile; the pilot's own pool, salt and stage name differ by design. Signed off.
- 2026-10-17 · human-observed · observed by the Claude session mac-quality-harness-main-dev on 2026-10-17, executing on the owner's instruction 'do 106'; the line above holds the same evidence, restated here because adr-next reads its hook name as a verdict. S1: eval-paired.mjs --plan --with P --without A read every row and config field of the pilot-export rows, exit 0 for claude-sonnet-5-5 and claude-opus-5-5, planning output only, kept outside the repository under qh-adr106/t2-plan in the owner's local data directory; the pilot's finding as the peer reported it: the agents' checkouts carry no test dependencies, so the claim line under-claims while the oracle resolves, and the owner chose 'proceed as designed'. S2: swebench 5.0.2 harness/grading.py:309-326 (FULL only when fail-to-pass and pass-to-pass are both 1, an empty list counting as 1) and :387-388 (resolved only on FULL). S3: tool-multipathreadwrite 6de290ac docs/bench/stage-5-pilot/canary.json and canary-opus-5-5.json pass true with problems {}, judged by internal/bench/canary.go:170-229; in the canary transcripts P lists 21 quality-harness skills and fires the session-start, prompt-submit and turn-end hooks on both models, A lists none and fires none. S4: prereg-main-claude-sonnet-5-5.json sha256 1692e40e7fd99e8622956541a77ef94158602562f362ea93083f76d1c620899a and prereg-main-claude-opus-5-5.json sha256 ea2c3d57da77a6c8f142472e1113010bdb0d92815d5940ad938f3f4b741e9f91, committed in ac0b291e at 2026-10-17T13:19:47Z, pin scorer blob 558548fa190e07ac2375331c02ae8860e3f49067; Stage 5's first counted attempt started 2026-10-17T13:21:22Z, after them. Their rule, dataset, split, revision and instance-list digest equal bench/swe-bench/selection-adr-162.json (191 ids, sha256 371a9dfd); the pilot's own pool, salt and stage name differ by design. Signed off.
