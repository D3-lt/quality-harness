# ADR-131 measurement protocol v1

Frozen before performance trials, 2026-10-28. Changes to this protocol require a new version and a fresh experiment, retaining all prior results.

## Controls and attribution

- A: before optional checks, Node, commit 55bf5fcf076bdf0f49541d70113306b0e093f6b8.
- B: optional checks, Node, commit 2933b680c74961667f63357030f2d498711e0e8c.
- C: released optional Go, commit a276b4d684f1f7d09f64aa8a142374bd2ae92903.
- D: candidate working tree, identified by source and binary digests. Rebuild after production changes.

A/B isolates the delivered optional-runner change bundle. B/C includes the intervening Go cutover changes; it does not isolate language alone. C/D measures the candidate optimization. Disclose every compared input and executable. Fetch/build/provision each control once, outside steady-state timing. Report that preparation separately.

## Corpus

Generate two public, disposable Git repositories with no remote, dependencies or network:
an empty project and a small governed project. Both declare check "node check.mjs".
The governed project has one Accepted ADR governing src/**, one pending task, and
src/value.cjs initially exporting integer 1. The check requires that integer and
writes start/end receipts outside the repository. It performs no project suite.
Preflight the check on valid and deliberately invalid input. The ADR and task
must pass their readers before measurements. Do not alter their content after
seeing timing or context results.

Use a fresh repository, transcript, plugin-data directory, lease directory and
OS-temp directory for each control/trial. Keep Git metadata and payload paths
structurally identical. Native controls use the installed verified shell
launcher and its checksum sidecar. Fetching is disabled during trials.

## Event trace

Execute every matching registration in each control's own hooks.json, preserving
the registered launcher, arguments and matchers. The generated transcript records
the actual returned payload in the existing request-chain format; this tests
routing, not actual model ingestion.

1. SessionStart startup; await any real automatic baseline's terminal ledger and check completion.
2. UserPromptSubmit.
3. PreToolUse Skill naming quality-harness:work-next.
4. PreToolUse Write src/value.cjs; require the governing ADR on the governed corpus.
5. Actually write invalid CJS, PostToolUse Write; require a real syntax-error finding.
6. Repeat PreToolUse Edit; repair to integer 2, PostToolUse Edit.
7. Stop before any publish attempt; distinguish the retired check nag from retained findings.
8. PreToolUse Bash git commit -F -, PowerShell git push, and Bash printf mentioning git commit. These are hook payloads only.
9. Four unchanged UserPromptSubmit events.
10. SubagentStart reviewer, reviewer PreToolUse Write, SubagentStop; require refusal of the write.
11. PreToolUse Write to the check ledger; require refusal without performing the write.
12. Actual harmless mrw-shaped edit and its PostToolUse registration.
13. TaskCompleted.
14. PreCompact and SessionStart compact, resetting the synthetic request chain.
15. SessionStart resume, preserving the new context.
16. SessionEnd; await its terminal durable session row and all observed owned descendants.

The empty corpus omits governance-specific assertions and uses the same event
sequence. A failed positive control invalidates that trial; do not change the
trace to improve its result. Count explicit queued-check reuse separately using
the actual execution-marker test and all existing invalidation controls.

## Sampling and bounds

Five serial blocks, in orders ABCD, BCDA, CDAB, DCBA, BACD, for each corpus.
Each invocation has a deadline; each block has a ten-minute maximum. Begin only
below the machine's core-count load with adequate free memory and no peer build.
Record start/end load, wall time, waited-root CPU and process-scope limitations.
Reject contended timing samples. Keep context/count observations apart from
timing validity. Record real observer-on and observer-off controls; do not
subtract a guessed observer overhead or any cold-start time.

## Outcomes

- B/C/D: no unsolicited project-check starts, retired refusal or check-demanding nag.
- Queued identical checks: two callers, one actual execution; changed, forced,
  fast, failed, torn-ledger and unseen-write controls still execute.
- First governance and syntax findings are delivered; reviewer/evidence guards remain.
- Unchanged items do not repeat in a retained context; changed relevant content
  and a new context still receive their findings.
- Target: at least 20% less QH model-directed hook context in the governed
  workload. Report a miss honestly; no changing the denominator or event trace.

Count each context delivery once before marker/item expansion. Separate
observed-model, user-only, diagnostic-only, unknown and ambiguous text. Show
UTF-16 characters and UTF-8 bytes, never call them tokens. Repeated delivery on
a distinct call counts twice. JSON envelopes and paired Stop summaries do not.
Capped or unsupported host output remains uncertain.

Root waited-subtree CPU is not whole-tree CPU when detached work escapes.
Do not sum parent waited-subtree and nested child CPU. Shell-internal child
coverage and missing Windows resources remain partial/unknown. Report actual
check execution counts and completion separately from observed process starts.
Overlapping variability or missing coverage is not evidence of CPU savings.

Keep raw transcripts, process traces, paths and adopter details private. Publish
only generated-fixture protocol/code and aggregate counts/digests. Confirm routing
and counts on actual adopter sessions including Windows; name that coverage apart
from the synthetic replay. QH text is separate from memoryd, host and other plugins.
