# Task ADR-122-T3: Every emitter is said once per context, and the event log knows the generation

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** L
**Owner:** Zy
**Produces:** generation-aware `emittedFor`; every emitter in the survey routed through `saidInContext`
**Consumes:** `saidInContext` and the marker (T2)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Every hook emitter the survey named is said once per context, a finding lost at compaction is said again, and the mention
advisory is said once per context in a shorter form.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/said-per-context-routing.test.mjs` | create | one row per emitter, with its twin (0 locks: new) |
| `plugin/scripts/check-ledger.mjs` | edit | `action.emitted` rows carry `generation`; `emittedFor` and `namedByReview` compare it (:599-610) |
| `core/hooks/ledger.go` | edit | the same |
| `plugin/scripts/publish-verdict.mjs` | edit | the mention key per context, not `<treeKey>:mention` (:447-448); the shorter text (:388); refusals untouched (:443-446) |
| `core/hooks/publish.go` | edit | the same (:195, :236, :297) |
| `plugin/scripts/branch-state.mjs` | edit | the brief and the SessionStart report through the helper; a standing red state keeps its one line (:908-940) |
| `plugin/scripts/session-orientation.mjs` | edit | SessionStart paragraphs carry markers; ADR-094's `firstMentionHere` stays the outer gate |
| `plugin/scripts/on-session-start.mjs` | edit | the same for its sections |
| `core/hooks/orientation.go` | edit | the same |
| `plugin/scripts/lifecycle.mjs` | edit | the queued PreToolUse and Stop actions, late-baseline (R4) and slow-hook lines through the helper |
| `core/hooks/lifecycle.go` | edit | the same |
| `plugin/scripts/artifact-pass.mjs` | edit | artifact-validation and budget notices (:130, :168) carry items |
| `core/hooks/artifact.go` | edit | the same (:140, :191) |
| `plugin/scripts/run-shell-hook.mjs` | edit | the facts-gate timeout notice (:429, :642) |
| `tests/mutations/plugin/scripts/publish-verdict.mjs.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: for each emitter (SessionStart paragraphs, the SessionStart branch-state
   report, the brief, the PreToolUse advisories including the mention, the Stop and SubagentStop findings, the artifact-pass
   notices, the late baseline, the slow hook), a second firing in the same context is skipped or one line, and a firing after
   a compaction is said in full; after a resume nothing is said again; a finding said before a compaction is said again after
   it, through the event log; a row with no `generation` counts for every generation; the mention on a second tree in one
   context is skipped; a proven commit after a mention still gets its advice; a refusal is answered on every attempt; a changed
   CI state and a changed could-not-look line are said.
2. [S2] Read every locked assertion over the mention text (`mrw read --grep 'only mentions commit or push'` over the six files
   the record names, and `python3 scripts/test-locks.py` on each), and choose the shorter text keeping each asserted
   substring; a lock that cannot hold is relocked under this record with its reason.
3. [S3] Add `generation` to `action.emitted` rows and to `emittedFor`, Node and Go.
4. [S4] Route each emitter through `saidInContext`, Node and Go; the brief becomes per context.
5. [S5] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/said-per-context-routing.test.mjs 2>&1) \
  && for n in "every emitter is said once per context and again after a compaction" \
      "a finding said before a compaction is said again after it, and not after a resume" \
      "the mention is said once per context and a proven commit still gets its advice" \
      "a refusal is answered on every attempt" \
      "a changed state is said whatever was said before"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done \
  && node --test tests/hook-goldens.test.mjs tests/publish-command.test.mjs tests/turn-end-delivery.test.mjs >/dev/null 2>&1 \
  && (cd core && go test ./hooks/)
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every emitter is said once per context and again after a compaction` | `tests/said-per-context-routing.test.mjs` | each surveyed emitter is routed | — | S1, S4 |
| `a finding said before a compaction is said again after it, and not after a resume` | `tests/said-per-context-routing.test.mjs` | generation-aware `emittedFor`; old rows | — | S1, S3 |
| `the mention is said once per context and a proven commit still gets its advice` | `tests/said-per-context-routing.test.mjs` | Decision 5 and its twin | — | S1, S2, S4 |
| `a refusal is answered on every attempt` | `tests/said-per-context-routing.test.mjs` | refusals never deduplicated | — | S1, S4 |
| `a changed state is said whatever was said before` | `tests/said-per-context-routing.test.mjs` | Decision 6 at every emitter | — | S1, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | each hook's call of `saidInContext`; one mutant per call site removed |
| 3 — the caller can discover it | the marker in each output |
| 4 — it is used | every hook firing; T5 counts it |

## Mutation Log

## Invariants

- Every locked test keeps its body; new tests go beside locked ones.
- No refusal is added, removed or skipped (CLAUDE.md §3).
- Node and Go agree wherever both implement the rule.

## Risks

- An emitter missed by the survey keeps repeating: the class table's commands are re-run at S4 and the counts compared.
- What the test doubles do not model: the transcripts are synthetic; a real host's ordering of hook output and tool results
  is met in T5.

## Stop Condition

Stop if a locked assertion pins the full mention text so no shorter text can keep it: the owner decides between a relock and
the current text.

## Out of Scope

- The channel per recipient (T4).
- ADR-094 Decision 2's three-day gate (the owner's decision, the record's Follow-ups).

## Verification Log
