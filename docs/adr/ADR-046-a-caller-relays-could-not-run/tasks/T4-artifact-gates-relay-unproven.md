# Task ADR-046-T4: runArtifactGates relays UNPROVEN from stderr

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** XS (one stream split in the dispatcher; one `runArtifactGates` probe; one catalogue entry)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`facts-gate-dispatch.sh` printed `UNPROVEN: … could not run` and `UNPROVEN: could not classify` on stdout and exited 0. `run-shell-hook.mjs` relays stdout→stdout (only PostToolUse wraps as `additionalContext`). `runArtifactGates` reads only stderr. Measured 2026-09-12: a plugin copied without `lib/` made `runArtifactGates` return `null` — the same as all-passed (ADR-005). On the path `runArtifactGates` consumes, every `UNPROVEN:` print is stderr (`say_unproven`). PostToolUse `additionalContext` stays on stdout.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/facts-gate-dispatch.sh` | edit | `say_unproven`: PostToolUse stdout, else stderr; all three `UNPROVEN:` prints |
| `tests/lifecycle.test.mjs` | edit | `runArtifactGates` on a no-lib plugin, a missing file, an unreadable file; healthy plugin is `null` |
| `tests/gates.test.mjs` | edit | completion-boundary dispatcher assertion reads stderr |
| `tests/mutations.json` | edit | the else-branch `>&2` dropped |

## Ordered Steps

1. [S1] Reproduce: `runArtifactGates` on a no-lib plugin returns `null`. Bind the failing test at that consumer. [proof: acceptance]
2. [S2] `say_unproven`; every `UNPROVEN:` print. [proof: acceptance]
3. [S3] The catalogue entry; `node scripts/mutate.mjs --case`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'runArtifactGates returns UNPROVEN' tests/lifecycle.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `runArtifactGates returns UNPROVEN when a dispatched gate could not run or could not classify` | `tests/lifecycle.test.mjs` | nolib plugin → a string containing `UNPROVEN`, not `null`; healthy plugin → `null`; missing file and unreadable existing file → `UNPROVEN: could not classify` | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `say_unproven` |
| 2 — something selects it | classify-missing, classify-unreadable, gate could-not-run |
| 3 — the caller can discover it | `runArtifactGates` reads stderr |
| 4 — it is used | a child import of `lifecycle.mjs` with `CLAUDE_PLUGIN_ROOT` at a copy without `lib/` |

## Mutation Log

## Invariants

- PostToolUse still wraps UNPROVEN as `additionalContext` from stdout.
- A gate that ran and found something is still on stderr at commit/completion.

## Risks

- Dual-printing to both streams would make PostToolUse show the line twice; `say_unproven` picks one stream.

## Stop Condition

A green run while a no-lib plugin makes `runArtifactGates` return `null`.

## Out of Scope

- Teaching `runArtifactGates` to read stdout (permanent: boundary: findings already arrive on stderr; the dispatcher matches that stream)

## Notes

Found by the third Codex review (HIGH). The outermost consumer is `runArtifactGates`, not only the hook adapter. Every `UNPROVEN:` print was audited with `rg -n 'UNPROVEN:' plugin/scripts/facts-gate-dispatch.sh`.

## Verification Log
