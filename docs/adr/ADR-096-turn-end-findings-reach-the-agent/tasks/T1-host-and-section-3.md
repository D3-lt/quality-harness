# Task ADR-096-T1: the host continues a turn on Stop context, and §3 names it

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one live probe, one paragraph, one test)
**Owner:** unassigned
**Produces:** a live observation that Stop `additionalContext` reaches the main agent and continues its turn; the CLAUDE.md §3 sentence
**Consumes:** none
**Data dependency:** live session (a Claude Code session on this machine; the probe hook lives in a scratch project, never in the plugin)
**Proof map:** v1
**Rests-on:** `the rulebook says what the hook does`

## Goal

Before any behaviour changes, confirm on the installed host that a Stop hook's `additionalContext` reaches the main agent and continues
the turn once, and write into CLAUDE.md §3 that a hook may continue a turn to hand the agent a finding, as an act and not a refusal.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `CLAUDE.md` | edit | §3: one sentence naming a continued turn as an allowed act; still exactly two refusals |
| `.claude/rules/03-gates-advise.md` | edit | the evidence: ADR-096's counts and the host probe |
| `tests/turn-end-delivery.test.mjs` | add | the test below |

## Ordered Steps

1. [S1] Write the test and record the red run (TDD red).
2. [S2] In a scratch project (outside this repository), register a Stop hook that prints `{"hookSpecificOutput":{"hookEventName":"Stop","additionalContext":"<a unique marker>"}}` unless `stop_hook_active` is true; run one turn and record whether the agent quotes the marker and whether the turn continued exactly once; record the Claude Code version. [proof: human: the agent quoted the marker after one continuation, on the recorded version]
3. [S3] Edit §3 and its rule file.

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/turn-end-delivery.test.mjs 2>&1) \
  && for t in 'CLAUDE.md section 3 names a turn that continues as an act, not a refusal'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `CLAUDE.md section 3 names a turn that continues as an act, not a refusal` | `tests/turn-end-delivery.test.mjs` | CLAUDE.md §3 contains the sentence naming a continued turn and still names exactly two refusals | none | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test and the sentence |
| 2 — something selects it | CLAUDE.md is loaded into every session in this repository |
| 3 — the caller can discover it | §3 is where a reader looks for what a gate may do |
| 4 — it is used | S2's live probe |

## Mutation Log
- 2026-10-12 · e08ab124* · mutant killed · exit 1 · `CLAUDE.md` · section 3 no longer says a hook may continue a turn · acceptance-sha256:83ca899e146db76124fcd330d7f99a8cc11ac2b15cec45a7be893a3d1acafcff · covers:the rulebook says what the hook does

## Invariants

- §3 still names exactly two refusals.
- Nothing in `plugin/` changes in this task.

## Risks

- The host behaves differently from the reference: then T2 does not start (Stop Condition).

## Stop Condition

Stop and ask if the probe shows the marker did not reach the agent, or the turn continued more than once.

## Out of Scope

- Rewriting ADR-035 (permanent: boundary: records are history; ADR-096's Invalidates header carries the correction)

## Verification Log
- 2026-10-12 · e08ab124* · exit 1 · `out=$(node --test --test-reporter=tap tests/turn-end-delivery.test.mjs 2>&1) \ …` · acceptance-sha256:83ca899e146db76124fcd330d7f99a8cc11ac2b15cec45a7be893a3d1acafcff · ms:202 · test-lock-sha256:ab2f9d699b6731d5b4eba39c093821d5d072ec47cdecb63d6370f2037c315a01 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvdHVybi1lbmQtZGVsaXZlcnkudGVzdC5tanMJQ0xBVURFLm1kIHNlY3Rpb24gMyBuYW1lcyBhIHR1cm4gdGhhdCBjb250aW51ZXMgYXMgYW4gYWN0LCBub3QgYSByZWZ1c2FsCTk4MjkxOGI0NTFlOThhMWFiMmM2Njg0MTYxOWViZDlkN2RmZWJjN2ZjN2E0MWExOGM1YTZhZDY2OGEwNGQ1MGI
  ```
  ```
- 2026-10-12 · e08ab124* · exit 0 · `out=$(node --test --test-reporter=tap tests/turn-end-delivery.test.mjs 2>&1) \ …` · acceptance-sha256:83ca899e146db76124fcd330d7f99a8cc11ac2b15cec45a7be893a3d1acafcff · ms:243
- 2026-10-12 · human-observed · observed: S2 on Claude Code 2.1.296 a Stop hook in a scratch project returned a marker as additionalContext and the headless agent replied OK followed by the marker; the hook ran twice, the second time with stop_hook_active true, so the turn continued exactly once
- 2026-10-12 · human-observed · observed: S2 on Claude Code 2.1.296 a turn-end hook in a scratch project returned a marker as additionalContext and the headless agent replied OK followed by the marker; the hook ran twice, the second time with stop_hook_active true, so the turn continued exactly once
- 2026-10-12 · human-observed · observed: S2 on Claude Code 2.1.296 a turn-end hook in a scratch project returned a marker as additionalContext and the headless agent replied OK followed by the marker; the hook ran twice, the second time with the host's continuation flag set, so the turn continued exactly once
