# Task ADR-038-T3: Core without a session variable

**Depends-on:** T2
**Covers:** F-1, F-8, F-9, F-10, F-11, F-16, F-17, F-21, F-22, F-24, F-33, UC3-S1, UC3-S2, UC2-S5, UC5-S1, UC5-S2
**Estimated scope:** S (single file)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

The shipped README's first command works without `CLAUDE_PLUGIN_ROOT`. Unknown non-Bash writes are UNPROVEN authorship. Hooks stay always-on. No CORE.md. No plugin registry.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/README.md` | edit | first command uses `qh-root` |
| `plugin/scripts/lifecycle.mjs` | edit | `analyzeTranscript` authorship UNPROVEN |
| `plugin/hooks/hooks.json` | none | always-on (F-21) |
| `plugin/scripts/post-edit-check.sh` | none | still runs (F-33) |
| `plugin/bin/qh-mcp` | none | still excludes verify (ADR-012) |

## Ordered Steps

1. [S1] Bind the README, authorship, hooks, and non-goal tests. [proof: acceptance]
2. [S2] Change only the README command and `analyzeTranscript` authorship. [proof: acceptance]

## Acceptance

```bash
node --test --test-name-pattern 'first shipped README command|MCP write is UNPROVEN|native Edit or Write|hooks stay always-on|plugin ships no CORE.md|no in-process plugin registry|post-edit-check still runs|qh-mcp still excludes' tests/staged-product.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `first shipped README command does not require CLAUDE_PLUGIN_ROOT` | `tests/staged-product.test.mjs` | README first command | F-16, UC3-S1, UC3-S2 | S1, S2 |
| `an MCP write is UNPROVEN authorship, not no mutation` | `tests/staged-product.test.mjs` | analyzeTranscript | F-24, UC5-S1 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `tests/staged-product.test.mjs` |
| 2 — something selects it | README first fence; `analyzeTranscript` return |
| 3 — the caller can discover it | shipped README; Stop / completion |
| 4 — it is used | marketplace install without CLAUDE_PLUGIN_ROOT |

## Mutation Log

- 2026-09-10 · 8718ffe · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · an MCP write must be UNPROVEN authorship, not treated as no mutation · acceptance-sha256:64d3930a9af9f0cf83247ed5a65a0c0a8a125abcc98fb02f94963cfdb5c89381

## Invariants

- `hooks.json` has no opt-in switch.
- `plugin/CORE.md` is not added.

## Risks

- Setting `hasMutations` true for UNPROVEN authorship may advise more often on MCP-only sessions — that is the point of F-24.

## Stop Condition

A README first command that still interpolates `CLAUDE_PLUGIN_ROOT`, or an MCP write treated as no edits.

## Out of Scope

- A Cursor / OpenCode adapter (F-17)

## Notes

Class: an unknown write was treated as no edits, and the first shipped command interpolated `CLAUDE_PLUGIN_ROOT`. Sweep: `rg -n "authorship = 'UNPROVEN'|CLAUDE_PLUGIN_ROOT" plugin/scripts/lifecycle.mjs plugin/README.md` — one UNPROVEN assignment in `analyzeTranscript`; first README command uses `qh-root`. Later README lines still interpolate `CLAUDE_PLUGIN_ROOT` (F-16 is the first command only). No in-process registry, no CORE.md. Path extractors for every MCP name stay UNPROVEN (F-24).

## Verification Log
- 2026-09-10 · 8718ffe · exit 0 · `node --test --test-name-pattern 'first shipped README command|MCP write is UNPROVEN|native Edit or Write|hooks stay always-on|plugin ships no CORE.md|no in-process plugin registry|post-edit-check still runs|qh-mcp still excludes' tests/staged-product.test.mjs` · acceptance-sha256:64d3930a9af9f0cf83247ed5a65a0c0a8a125abcc98fb02f94963cfdb5c89381 · ms:221
