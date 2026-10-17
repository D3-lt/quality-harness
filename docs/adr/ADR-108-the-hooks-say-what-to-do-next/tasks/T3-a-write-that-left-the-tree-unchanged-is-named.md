# Task ADR-108-T3: A write that left the tree unchanged is named

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (one turn-end rule, its facts, one test with twins)
**Owner:** unassigned
**Produces:** rule W in `completionJudgement`, and its facts in `completionFacts`
**Consumes:** none
**Proof map:** v1

## Goal

At turn end, when this turn recorded writes under the repository for proven paths and the observed tree equals the
observation before the first of them, the agent is told which paths were written to a tree that did not change, once per
tree (ADR-108, Decision 3).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/completion-rules.mjs` | edit | `completionFacts` gathers `unchangedWrites` (the paths, and the two observations); `completionJudgement` adds rule W with the once-per-tree key |
| `plugin/scripts/check-ledger.mjs` | read | `unobservableWrites`, the complementary reader, for the write-event shape |
| `plugin/scripts/tree-facts.mjs` | read | `observe` and `sessionBaseline`, for where an observation before the writes is recorded |
| `tests/adr-108.test.mjs` | edit | the test below |
| `tests/mutations/plugin/scripts/completion-rules.mjs.json` | edit | the catalogue mutants |

## Ordered Steps

1. [S1] Add the test below and record the red run.
2. [S2] In `completionFacts`, find the observation recorded at or before this turn's first `file.written` event (the session log already records observations at boundaries; read which event carries one and use it, never a new git spawn) and the observation at this Stop; when both are `ok` and their `tree` is equal, collect the turn's `file.written` paths under the repository that are proven (ADR-051) and observable.
3. [S3] In `completionJudgement`, rule W: when `unchangedWrites` is non-empty, queue the finding `quality-harness: this turn wrote <paths> and the tree it wrote to did not change — an edit that matched nothing reports success everywhere but in the tree; read the file and apply the edit again, or say the write was a revert.` Key `W:<tree>`; delivered to the agent and the user as R1 is (ADR-096); advisory.
4. [S4] Add the catalogue mutants (the equality inverted; the proven-path filter dropped; the rule never queued) and record a killed mutant. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/adr-108.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - a turn whose writes left the tree unchanged is told so once, and a turn whose writes changed it is not")" = 1 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a turn whose writes left the tree unchanged is told so once, and a turn whose writes changed it is not` | `tests/adr-108.test.mjs` | through the real hooks in a temp repository: a PostToolUse Edit whose file is byte-identical afterwards, then Stop, gives W naming the path; a second Stop on the same tree is silent; dirty twins: an Edit that changed the file gives no W; a write outside the repository gives no W; a write whose tree could not be observed (`ok: false`) gives no W | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | rule W |
| 2 — something selects it | `unchangedWrites` non-empty in the facts |
| 3 — the caller can discover it | the Stop hook's `additionalContext` |
| 4 — it is used | the test drives the real hooks |

## Mutation Log
- 2026-10-17 · e5d4769e* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · rule W never queued: the acceptance test goes red · acceptance-sha256:c347a71e9e31ae5e2ad40e63420dcf5b945ee7c2450473f84aa9113159203a60

## Invariants

- `completionJudgement` reaches no file (`tests/pure-judges.test.mjs`).
- No new git spawn on the Stop path: W reads observations the boundaries already record.
- An unobservable write (`observable: false`) is never named by W (ADR-051).

## Risks

- A turn that writes and then reverts is told its writes did nothing; the finding's wording allows the agent to say so.

## Stop Condition

Stop and ask if the session log holds no observation at or before the turn's first write, so that W would need a new
observation at PostToolUse (a cost on the hottest path; ADR-080's rule that no hook waits).

## Out of Scope

- Comparing file bytes at PostToolUse (permanent: boundary: ADR-108 alternative (b))

## Verification Log
- 2026-10-17 · e5d4769e* · exit 1 · `out=$(node --test --test-reporter=tap tests/adr-108.test.mjs 2>&1) \ …` · acceptance-sha256:c347a71e9e31ae5e2ad40e63420dcf5b945ee7c2450473f84aa9113159203a60 · ms:755 · test-lock-sha256:31fddaf1a79cfd3a2bbb2f6ef3b63099f55317cbef7a2091eba2f2d6ed4ecab1 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYWRyLTEwOC50ZXN0Lm1qcwlhIHR1cm4gd2hvc2Ugd3JpdGVzIGxlZnQgdGhlIHRyZWUgdW5jaGFuZ2VkIGlzIHRvbGQgc28gb25jZSwgYW5kIGEgdHVybiB3aG9zZSB3cml0ZXMgY2hhbmdlZCBpdCBpcyBub3QJZWZiYjBjZmRmOTQ4ZWI5MjZmMzczMGZlYmM0YTgzNDEzZmUyMmE5MDA2Yzg2N2I0NTQzNjhmMDRiNTY5N2U4ZQ
  ```
  ```
- 2026-10-17 · e5d4769e* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-108.test.mjs 2>&1) \ …` · acceptance-sha256:c347a71e9e31ae5e2ad40e63420dcf5b945ee7c2450473f84aa9113159203a60 · ms:2903
- 2026-10-17 · e5d4769e* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-108.test.mjs 2>&1) \ …` · acceptance-sha256:c347a71e9e31ae5e2ad40e63420dcf5b945ee7c2450473f84aa9113159203a60 · ms:2856
- 2026-10-17 · e5d4769e* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:c347a71e9e31ae5e2ad40e63420dcf5b945ee7c2450473f84aa9113159203a60 · ms:0 · test-lock-sha256:aae3bb266d07738e4f80353020b1cf7c81df048fd9f751dd366114491c33bb52 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYWRyLTEwOC50ZXN0Lm1qcwlhIHR1cm4gd2hvc2Ugd3JpdGVzIGxlZnQgdGhlIHRyZWUgdW5jaGFuZ2VkIGlzIHRvbGQgc28gb25jZSwgYW5kIGEgdHVybiB3aG9zZSB3cml0ZXMgY2hhbmdlZCBpdCBpcyBub3QJZTQxOGViZjBiNmI4ZGQ3YTIzYjI5NWU2MzhiNGFkYzVmNDYzNTQ0ZTNlODc3MGQzNTYzOGIwOGQ0MTUyMjkxMg · test-lock-kind:replace
