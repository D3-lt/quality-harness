# Task ADR-084-T1: a Skill call is recorded and prints nothing

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one hook registration, one branch)
**Owner:** unassigned
**Produces:** `skill.invoked` event in the session log
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the Skill branch records the event`, `a foreign skill is not recorded`, `the hook is registered`

## Goal

A PreToolUse `Skill` call whose name starts `quality-harness:` appends `{ event: 'skill.invoked', skill }`
to the session log through `appendEvent`, prints nothing on stdout, and returns before `importPassVerdicts`
(ADR-084 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/hooks/hooks.json` | edit | a PreToolUse registration with matcher `Skill` routed to `lifecycle.mjs` — what selects the branch |
| `plugin/scripts/lifecycle.mjs` | edit | the Skill branch, before `importPassVerdicts` |
| `tests/skill-usage.test.mjs` | create | the two tests below |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write the two tests in this task's Tests table and record the red run (TDD red). [proof: acceptance]
2. [S2] Add the `Skill` registration to `plugin/hooks/hooks.json`.
3. [S3] In `lifecycle.mjs`, for PreToolUse with `tool_name === 'Skill'`: when `tool_input.skill` starts with `quality-harness:`, `appendEvent(cwd, session_id, { event: 'skill.invoked', skill })`; on a failed write, one line on stderr; return before `importPassVerdicts` with no stdout.
4. [S4] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
T=$(mktemp)
node --test --test-reporter=tap tests/skill-usage.test.mjs > "$T" 2>&1 \
  && for t in 'a Skill call is recorded in the session log and prints nothing' 'the Skill hook is registered and records only this plugin'"'"'s skills'; do test "$(grep -cxE "ok [0-9]+ - $t" "$T")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a Skill call is recorded in the session log and prints nothing` | `tests/skill-usage.test.mjs` | the event lands; stdout empty; no pass import | none | S3 |
| `the Skill hook is registered and records only this plugin's skills` | `tests/skill-usage.test.mjs` | `hooks.json` routes `Skill`; a foreign skill writes nothing | none | S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | the `Skill` matcher in `hooks.json` |
| 3 — the caller can discover it | Claude Code runs every registered PreToolUse hook |
| 4 — it is used | T2 reads the event |

## Mutation Log
- 2026-10-05 · f8d1eaf* · mutant killed · exit 1 · `plugin/hooks/hooks.json` · no hook is registered for Skill · acceptance-sha256:f05bb4427cc84ebc0bc99846a9c1a2fe547e3e687a3e470ac072d5578b6d0ae3 · covers:the hook is registered
- 2026-10-05 · f8d1eaf* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · every plugin's skills are recorded · acceptance-sha256:f05bb4427cc84ebc0bc99846a9c1a2fe547e3e687a3e470ac072d5578b6d0ae3 · covers:a foreign skill is not recorded
- 2026-10-05 · f8d1eaf* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the Skill branch writes no event · acceptance-sha256:f05bb4427cc84ebc0bc99846a9c1a2fe547e3e687a3e470ac072d5578b6d0ae3 · covers:the Skill branch records the event

## Invariants

- No stdout on any Skill call.
- A Skill call never imports or waits on the artifact pass (ADR-080).

## Risks

- The per-call cost (70–80 ms measured) grows if the branch is placed after module work that a Skill call does not need.

## Stop Condition

Stop and ask if the branch cannot return before `importPassVerdicts` without moving other PreToolUse work.

## Out of Scope

- The reader — T2.

## Verification Log
- 2026-10-05 · f8d1eaf* · exit 1 · `T=$(mktemp) …` · acceptance-sha256:f05bb4427cc84ebc0bc99846a9c1a2fe547e3e687a3e470ac072d5578b6d0ae3 · ms:275 · test-lock-sha256:620d264ba9d048ba3d4e8ca6c7ec107e1d2ccc74ce5775876132ee5f68b0ed16 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvc2tpbGwtdXNhZ2UudGVzdC5tanMJYSBTa2lsbCBjYWxsIGlzIHJlY29yZGVkIGluIHRoZSBzZXNzaW9uIGxvZyBhbmQgcHJpbnRzIG5vdGhpbmcJZjJlNWVmYTY5MWJmY2IzOGIwYjQ3MmVlYTA5NzUyZWFhNmQyZjAzMzMxMjc5NTM5Y2NmODY1NDVjMGNkOTBhNgpib2R5CXRlc3RzL3NraWxsLXVzYWdlLnRlc3QubWpzCXRoZSBTa2lsbCBob29rIGlzIHJlZ2lzdGVyZWQgYW5kIHJlY29yZHMgb25seSB0aGlzIHBsdWdpbidzIHNraWxscwkyNjdjM2Q4YThhNTNjZmZjZmRmZTllNjNkODkyZDkxMTk1NjMwNzljNDNkOTMzOTlhYjc4MjRlMjQwOWIyMmFl
  ```
  ```
- 2026-10-05 · f8d1eaf* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:f05bb4427cc84ebc0bc99846a9c1a2fe547e3e687a3e470ac072d5578b6d0ae3 · ms:420
- 2026-10-05 · f8d1eaf* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:f05bb4427cc84ebc0bc99846a9c1a2fe547e3e687a3e470ac072d5578b6d0ae3 · ms:418
- 2026-10-05 · f8d1eaf* · exit 0 · `T=$(mktemp) …` · acceptance-sha256:f05bb4427cc84ebc0bc99846a9c1a2fe547e3e687a3e470ac072d5578b6d0ae3 · ms:414
