# Task ADR-107-T3: A session with mrw on PATH is told it is there

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one conditional line, one test)
**Owner:** unassigned
**Produces:** the SessionStart line said when `mrw` resolves on PATH
**Consumes:** the section `## Read and edit in batches` (T1)
**Proof map:** v1

## Goal

At SessionStart, a session where `mrw` resolves on PATH is told, in one line, to read every site in one `mrw read` and
apply every edit in one `mrw write` plan; a session without it sees nothing new (ADR-107, Decision 3).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/session-orientation.mjs` | edit | the line, said only when `mrw` resolves and answers `--version` in its own shape |
| `tests/mrw-way.test.mjs` | edit | the test below |
| `tests/mutations/plugin/scripts/session-orientation.mjs.json` | edit | the catalogue mutants |

## Ordered Steps

1. [S1] Add the test below and record the red run (TDD red: no line with `mrw` on PATH).
2. [S2] Resolve `mrw` on PATH without a shell and with a timeout, check its `--version` answer, and say the line once per
   session; resolve nothing on Windows by name alone (`mrw.exe` too).
3. [S3] Add the catalogue mutants (the line always said; the line never said) and record a killed mutant. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/mrw-way.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - a session with mrw on PATH is told it is there, and a session without it is told nothing")" = 1 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a session with mrw on PATH is told it is there, and a session without it is told nothing` | `tests/mrw-way.test.mjs` | through the real SessionStart hook: a stub `mrw` on PATH answering its version shape gives the line once; an empty PATH gives no line; a stub answering another shape gives no line | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the line in `session-orientation.mjs` |
| 2 — something selects it | `mrw` resolving on PATH |
| 3 — the caller can discover it | the SessionStart output |
| 4 — it is used | the test drives the real hook |

## Mutation Log

## Invariants

- A session without `mrw` gets byte-identical SessionStart output.
- The probe is bounded and hidden (CLAUDE.md §7: `windowsHide`, a timeout).

## Risks

- None beyond ADR-107's.

## Stop Condition

Stop and ask if resolving `mrw` adds more than 50 ms to SessionStart on this machine, measured unloaded.

## Out of Scope

- Saying it on every prompt (permanent: boundary: a standing fact is said once, ADR-094)

## Verification Log
