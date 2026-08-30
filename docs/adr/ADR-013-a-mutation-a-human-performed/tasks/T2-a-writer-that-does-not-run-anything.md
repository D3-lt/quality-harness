# Task ADR-013-T2: Write the row with a tool, and refuse it where a fence could have run

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** `adr-verify --human-mutant`
**Consumes:** `MLOG_HUMAN_RE` (T1)
**Data dependency:** hermetic

## Goal

`adr-verify --human-mutant` records a human-performed mutation into a task's Mutation Log, and
`adr-lint` advises when a task whose Acceptance is a runnable bash fence uses that lane.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-verify` | edit | the flag, its refusal rules, and the row it writes |
| `plugin/bin/adr-lint` | edit | the advisory that this lane is for a fence that cannot run |
| `tests/evidence-chain.test.mjs` | edit | drives the gate end to end, which is where the previous six GREEN mutations came from |
| `tests/mutations.json` | edit | one entry per behaviour, each naming the test that drives the gate |

## Ordered Steps

1. Write the failing test first: `adr-verify --human-mutant` on a task with a human-observed Acceptance writes a row that `adr-lint` accepts, and the same invocation on a task with a runnable bash fence produces the advisory. Confirm both red.
2. Add the flag. It runs NOTHING: it records what a person reports, redacts the home path as the other writers do, and refuses a malformed row rather than writing a partial one.
3. Refuse `--human-mutant` in combination with `--mutant` and with `--sweep`, the way the existing mode flags refuse each other.
4. Add the `adr-lint` advisory and both catalogue entries.

## Acceptance

```bash
set -o pipefail
node --test tests/evidence-chain.test.mjs 2>&1 | tee /tmp/acc-t2.out && ! grep -qE "no tests to run|^not ok" /tmp/acc-t2.out
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `a human-performed mutation is recorded and reads back` | `tests/evidence-chain.test.mjs` | the writer produces a row the reader accepts | — |
| `the human lane is advised against where a fence could have run` | `tests/evidence-chain.test.mjs` | the advisory fires on a runnable bash fence and stays silent on a human-observed one | — |
| `--human-mutant refuses to combine with --mutant or --sweep` | `tests/evidence-chain.test.mjs` | the mode flags stay mutually exclusive | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the writer test |
| 2 — something selects it | the flag parser accepting `--human-mutant`, proved by the refusal test |
| 3 — the caller can discover it | `adr-verify`'s usage text names the flag and its required arguments |
| 4 — it is used | nothing measures this yet |

## Mutation Log

- 2026-08-30 · 04ace39* · mutant killed · exit 1 · `plugin/bin/adr-verify` · a from-text matching many places identifies none of them, and such a row parses while being unreproducible · acceptance-sha256:9b0aa1080ba1a2ac269bfa8994d55f72547296b0f214b7d213bb0c61244457b1

## Invariants

- The writer never executes anything. A tool that ran the fence would be `--mutant`, and this exists because that cannot run.
- A malformed row is refused rather than written partially: half a claim in an append-only log is worse than none.

## Risks

- The advisory could fire on a task whose fence is runnable in CI and not locally, which is a real shape. It is ADVICE for exactly that reason, and the record says so.

## Stop Condition

Stop if the advisory cannot distinguish a runnable fence from a human-observed one without reading
the fence's text for intent. Guessing which clause is blocked is the heuristic this project refused
in docs/BACKLOG.md §67, and it would be worse here.

## Out of Scope

- Any check that the reported diff was actually applied. (permanent: nothing observed it; that is what this lane trades away, and the record says so.)

## Verification Log
- 2026-08-30 · 04ace39 · exit 0 · `set -o pipefail …` · acceptance-sha256:9b0aa1080ba1a2ac269bfa8994d55f72547296b0f214b7d213bb0c61244457b1
