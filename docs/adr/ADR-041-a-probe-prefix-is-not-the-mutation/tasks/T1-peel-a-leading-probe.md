# Task ADR-041-T1: describeCommand peels a leading read-only probe

**Depends-on:** none
**Covers:** F-1, UC1-S1, UC1-S2
**Estimated scope:** S (single file plus tests)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Stop's Bash mutation marker names the mutating remainder (or a resolved path), not a leading `echo` / `ls` / `adr-lint --version` probe. Probe-only Bash is not Session authorship.

## Affected Files

| File | Change | Why |
|------|--------|------|
| `plugin/scripts/lifecycle.mjs` | edit | `describeCommand` peels known probe / validation prefixes |
| `tests/lifecycle.test.mjs` | add | Stop marker and probe-only authorship fixtures |

## Ordered Steps

1. [S1] Bind the failing tests for the Covers IDs. [proof: acceptance]
2. [S2] Peel leading `echo` / `ls` (when the segment is not a mutation) and leading validation from `describeCommand`. [proof: acceptance]

## Acceptance

```bash
node --test --test-name-pattern 'Stop names the mutating remainder after a probe prefix|probe-only Bash is not Session authorship' tests/lifecycle.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `Stop names the mutating remainder after a probe prefix` | `tests/lifecycle.test.mjs` | marker is `rm -rf build` / not the echo/ls prefix; version probe is not the marker | F-1, UC1-S1 | S1, S2 |
| `probe-only Bash is not Session authorship` | `tests/lifecycle.test.mjs` | echo/ls and `adr-lint --version` do not demand the check; a later `rm` still does | F-1, UC1-S2 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | F-1 tests |
| 2 — something selects it | `analyzeTranscript` records `<Bash mutation: ${describeCommand(...)}>` |
| 3 — the caller can discover it | Stop `Changed paths include:` |
| 4 — it is used | Stop after a Bash tool_use |

## Mutation Log

- 2026-09-10 · 8c789ba* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · echo prefix must be peeled; dropping echo from the peel leaves the live Stop marker as echo "== cache versions" · acceptance-sha256:e48a96bfe0a09803b3403fcf5701e446b8eb0b0545d7379c0bb0ce5088de15fb

## Invariants

- `echo x > out.txt` remains a mutation and is not peeled.
- Unknown `neither` verbs are not peeled.
- Probe-only Bash is not authorship.
- Fail-closed interpreter remainders stay mutations.

## Risks

- Matching `echo` / `ls` as substrings of other words — use `executableName` of the segment.
- Using `READ_ONLY_CHILD` as a shell peel list.

## Stop Condition

A green test while the marker still starts with `echo "== cache versions"`, or a peel of `mystery-tool`.

## Out of Scope

- Statusline (permanent: boundary: Non-Goal)
- Inferred foreign-repo check (permanent: boundary: Non-Goal)

## Notes

Class: `describeCommand` peels only `cd`/`pushd`/`popd`. Sweep: `rg -n 'function describeCommand|NAVIGATION_PREFIX' plugin/scripts/lifecycle.mjs`. Siblings: other `neither` verbs (left; CLAUDE.md §16).

## Verification Log
- 2026-09-10 · 8c789ba* · exit 0 · `node --test --test-name-pattern 'Stop names the mutating remainder after a probe prefix|probe-only Bash is not Session authorship' tests/lifecycle.test.mjs` · acceptance-sha256:e48a96bfe0a09803b3403fcf5701e446b8eb0b0545d7379c0bb0ce5088de15fb · ms:234
- 2026-09-10 · 8c789ba* · exit 0 · `node --test --test-name-pattern 'Stop names the mutating remainder after a probe prefix|probe-only Bash is not Session authorship' tests/lifecycle.test.mjs` · acceptance-sha256:e48a96bfe0a09803b3403fcf5701e446b8eb0b0545d7379c0bb0ce5088de15fb · ms:210
