# Task ADR-122-T1: Measure what reaches the context, and count a session's hook text

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** the hook-output record shapes and the channel measurement; `scripts/hook-footprint.mjs`
**Consumes:** none
**Data dependency:** needs a recorded session on this machine (a transcript with quality-harness hook output, at least one compaction) for S3 and S4; the fence is hermetic
**Proof map:** v1

## Goal

A repository tool counts this plugin's hook text in a transcript by item, event and channel, and the record knows, by
measurement, which transcript record shapes carry hook output and whether a PreToolUse `systemMessage` reaches the model.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/hook-footprint.test.mjs` | create | synthetic transcripts built in the test (0 locks: new) |
| `scripts/hook-footprint.mjs` | create | the counting method: parse each JSONL record, keep this plugin's hook outputs, group by item, event and channel, print counts and characters |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: a synthetic transcript with two PreToolUse outputs (one
   `additionalContext`, one `systemMessage`), a UserPromptSubmit output, a tool result that quotes hook text and a
   `compact_boundary` is counted per item and channel; the quoted tool result is not counted; an unparseable line is counted as
   unreadable, never dropped silently.
2. [S2] Write `scripts/hook-footprint.mjs`: a parse per line (never a grep), the record shapes it treats as hook output named
   in one table at the top of the file, and every unrecognised shape counted under `unrecognised`.
3. [S3] Run it over a recorded session's transcript on this machine and list the record shapes that carried quality-harness
   hook output, with how a `systemMessage` and an `additionalContext` appear; put the list in the script's table. [proof: human: the person compares the script's shape table with the shapes printed for one recorded transcript, and the sign-off records the session's prompt count, tool-call count and compaction count, never its content]
4. [S4] Measure whether a PreToolUse `systemMessage` reaches the model's context: in a scratch session with the plugin
   installed, a hook emits a `systemMessage` holding a nonce and no `additionalContext`, and the next prompt asks the model to
   repeat any nonce it was given. Repeat with the nonce in `additionalContext` only, as the control. Record both answers and
   the Claude Code version. Whether the host clears hook output from context while the transcript keeps it is asked in the
   same session after a long tool run, and recorded the same way, or recorded as could-not-measure. [proof: human: the person reads both model answers and the host version in the sign-off, and the control must show the additionalContext nonce]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/hook-footprint.test.mjs 2>&1) \
  && for n in "hook-footprint counts this plugin's hook text by item and channel" \
      "a tool result quoting hook text is not hook output" \
      "an unparseable transcript line is counted as unreadable"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `hook-footprint counts this plugin's hook text by item and channel` | `tests/hook-footprint.test.mjs` | the counts per item, event and channel | — | S1, S2 |
| `a tool result quoting hook text is not hook output` | `tests/hook-footprint.test.mjs` | the shape table, not a grep, decides | — | S1, S2 |
| `an unparseable transcript line is counted as unreadable` | `tests/hook-footprint.test.mjs` | a parse failure is said | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | T5 runs it; the mutants on its shape table |
| 3 — the caller can discover it | its `--help` and this record |
| 4 — it is used | T5's before-and-after run |

## Mutation Log

## Invariants

- No transcript, count from another repository, or home path is committed (CLAUDE.md §6); the fixtures are built by the tests.
- The script reads; it writes nothing but its stdout.

## Risks

- The transcript format is internal and may differ between host versions: the sign-off names the version.
- What the test doubles do not model: a synthetic transcript has the shapes the author wrote; S3 meets a real one.

## Stop Condition

Stop if no recorded session with a compaction is available on this machine, or if S4's control (the `additionalContext`
nonce) is not repeated by the model: the method then measures nothing, and T4's branch cannot be chosen.

## Out of Scope

- Changing any hook (T2 to T4).

## Verification Log
