# Task ADR-029-T2: Make the spawn say which role it was asked to be

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one hook path plus its tests)
**Owner:** unassigned
**Produces:** the declared role and capability, stated in the `SubagentStart` context (T2)
**Consumes:** every shipped `agent()` call carries `model` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a spawn whose role declares a capability says so in its own context`, `a spawn with nothing declared says nothing rather than guessing`

## Goal

A spawned agent is told which role it is and what capability that role asked for, through the
`SubagentStart` hook this plugin already runs — so the record of what ran is in the run itself
rather than only in the source that launched it.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | the existing `SubagentStart` path, which already speaks via `hookSpecificOutput` |
| `tests/lifecycle.test.mjs` | edit | both directions, driven through the hook's own seam |
| `tests/mutations.json` | edit | one catalogue entry |

## Ordered Steps

1. [S1] Write the failing tests first: a payload carrying a declared role and model states both in the returned `additionalContext`; a payload carrying neither states NEITHER, rather than inventing a default. Confirm red. (TDD red.) [proof: acceptance]
2. [S2] Read the declaration from the payload the host already sends, through the existing `SubagentStart` branch. Do not add a second hook or a second envelope — the branch and the `hookSpecificOutput` shape are already there. [proof: acceptance]
3. [S3] Say it plainly and briefly in the context the agent receives, beside the leaf-role contract that is already reinforced there. One line: what role, what capability was asked for. [proof: acceptance]
4. [S4] Confirm silence is the default: with nothing declared, the hook's output is byte-identical to today's. Absence must not become a guess (ADR-005). [proof: acceptance]
5. [S5] Add the catalogue mutation and confirm RED. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test tests/lifecycle.test.mjs 2>&1 | tee /tmp/adr029-t2.out \
  && ! grep -qE "no tests to run|^not ok|^# fail [1-9]" /tmp/adr029-t2.out
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a spawn is told which role it was asked to be` | `tests/lifecycle.test.mjs` | the declaration reaches the run, not just the source | — | S1, S2, S3 |
| `a spawn with nothing declared is told nothing` | `tests/lifecycle.test.mjs` | absence stays absence — no invented default (ADR-005) | — | S1, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the branch is in `plugin/scripts/lifecycle.mjs` and the fence drives it |
| 2 — something selects it | `plugin/hooks/hooks.json` already registers `SubagentStart`; this rides the registration that exists |
| 3 — the caller can discover it | the agent reads it in its own context at spawn, which is the only place it could act on it |
| 4 — it is used | not observable from here — whether an agent acts on the line is not measurable in this repository, and a proxy would read like evidence |

## Mutation Log

- 2026-09-03 · d0fae72 · mutant inconclusive · exit 1 · `plugin/scripts/lifecycle.mjs` · the declared role must actually reach the spawn, or the channel carries nothing · acceptance-sha256:bebc1911e389198b970671dd0a7f9daf3c45f10a1f8f4507e7264a27f2388b76 · covers:a spawn whose role declares a capability says so in its own context
  ```
  the fence failed on a build/parse error, not an assertion
  ```
- 2026-09-03 · d0fae72* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · absence must stay absence; a default invented here puts a capability in the context nobody asked for · acceptance-sha256:bebc1911e389198b970671dd0a7f9daf3c45f10a1f8f4507e7264a27f2388b76 · covers:a spawn with nothing declared says nothing rather than guessing
- 2026-09-03 · d0fae72* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the declared capability must actually reach the spawn; an empty summary leaves the sentence saying nothing · acceptance-sha256:bebc1911e389198b970671dd0a7f9daf3c45f10a1f8f4507e7264a27f2388b76 · covers:a spawn whose role declares a capability says so in its own context

## Verification Log

- 2026-09-03 · d0fae72 · exit 0 · `set -o pipefail …` · acceptance-sha256:bebc1911e389198b970671dd0a7f9daf3c45f10a1f8f4507e7264a27f2388b76 · ms:13182
- 2026-09-03 · d0fae72* · exit 0 · `set -o pipefail …` · acceptance-sha256:bebc1911e389198b970671dd0a7f9daf3c45f10a1f8f4507e7264a27f2388b76 · ms:14266
- 2026-09-03 · d0fae72* · exit 0 · `set -o pipefail …` · acceptance-sha256:bebc1911e389198b970671dd0a7f9daf3c45f10a1f8f4507e7264a27f2388b76 · ms:13041

## Invariants

- With nothing declared, the hook's output is unchanged from today.
- The line states what was ASKED FOR, never what is running — the hook cannot observe the latter.
- No second hook, no second envelope: the existing `SubagentStart` branch carries it.

## Risks

- The line reads as a claim about what model is executing, which the hook cannot know. S3's wording must say "asked for"; the distinction is the same one CLAUDE.md §3 makes between what a gate observed and what it concluded.

## Stop Condition

Stop if the host does not put the declaration in the `SubagentStart` payload. Then the fact is not
available at spawn time and this task is measuring its own fixture rather than the system — say so
and leave T1 standing on its own, which it does.

## Out of Scope

- Verifying that the requested capability is what actually ran (permanent: fact: the hook receives what the caller declared, and this repository has no channel that observes the executing model; citation: file `plugin/scripts/lifecycle.mjs:3002`)
- Any routing decision based on the declared role (deferred: docs/BACKLOG.md §115)
