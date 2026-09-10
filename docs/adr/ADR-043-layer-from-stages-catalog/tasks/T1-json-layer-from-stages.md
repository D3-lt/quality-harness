# Task ADR-043-T1: Name `--json` layer from the STAGES table

**Depends-on:** none
**Covers:** F-1, UC1-S1, UC1-S2, UC1-S3, UC1-S4
**Estimated scope:** S (one product file plus tests)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`work-next --json` adds top-level `layer` as `core` or `corpus` from a closed table over `STAGES` ids. UNPROVEN look omits the key. `render()` still has no layer token.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/work-next.mjs` | edit | export `STAGES` and `productLayer`; dump `layer` on `--json` |
| `tests/staged-product.test.mjs` | add | `--json` layer fixtures; catalog table including ids `nextStage` never returns |
| `tests/statusline.test.mjs` | add | `render()` still has no layer token; `hooks.json` has no `statusLine` |

## Ordered Steps

1. [S1] Bind the failing tests for the Covers IDs. [proof: acceptance]
2. [S2] Table `productLayer(look, nextId)`: UNPROVEN → undefined; `nextId` null → corpus; `core` → core; every other catalog id → corpus. [proof: acceptance]
3. [S3] `--json` dump includes `layer` when defined and omits it when not. [proof: acceptance]

## Acceptance

```bash
node --test --test-name-pattern 'layer from STAGES:' tests/staged-product.test.mjs && node --test --test-name-pattern 'the wired statusline segment does not grow a layer token' tests/statusline.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `layer from STAGES: empty tree --json is core` | `tests/staged-product.test.mjs` | empty tree `--json` is look ok, next.id core, layer core, not session/spec-write | F-1, UC1-S1 | S1, S2, S3 |
| `layer from STAGES: catalog ids are corpus never session` | `tests/staged-product.test.mjs` | every STAGES id except core is corpus; session is not a catalog id; adr-write-no-tasks `--json` is corpus | F-1, UC1-S2 | S1, S2, S3 |
| `layer from STAGES: UNPROVEN look has no layer key` | `tests/staged-product.test.mjs` | look UNPROVEN `--json` has next null and no layer key | F-1, UC1-S3 | S1, S2, S3 |
| `layer from STAGES: leftover next null is corpus` | `tests/staged-product.test.mjs` | leftover next null with look ok is layer corpus | F-1, UC1-S2 | S1, S2, S3 |
| `the wired statusline segment does not grow a layer token` | `tests/statusline.test.mjs` | `render()` kinds have no layer; hooks.json has no statusLine | F-1, UC1-S4 | S1 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | F-1 `--json` tests |
| 2 — something selects it | `main --json` writes `layer` from `productLayer` |
| 3 — the caller can discover it | `--json` object; `--help` unused |
| 4 — it is used | `/quality-harness:work` and humans reading `--json` |

## Mutation Log

- 2026-09-10 · fe80715* · mutant killed · exit 1 · `plugin/scripts/work-next.mjs` · dropping the --json layer assignment leaves empty-tree and leftover dumps without layer · acceptance-sha256:5656ce0e6d20600148287b2cbff3c162984f84794a4ad8b7e9da23c8fe1f60fd

## Invariants

- Empty tree still Core, not spec-write.
- `layer` is never `session`.
- UNPROVEN look has no `layer` key.
- `render()` has no layer token. `hooks.json` has no `statusLine`.
- Does not reverse ADR-038–042.

## Risks

- Emitting `layer: null` instead of omitting the key — omit, do not null.
- Mapping unknown ids to `session`.

## Stop Condition

A green catalog test while `--json` still has no `layer`, or an UNPROVEN dump that names core.

## Out of Scope

- Statusline Core/Corpus token (permanent: boundary: leftover grill)
- QH setting `statusLine` (permanent: boundary: Non-Goal)
- Peel-cat, ledger, hook opt-in, MCP verify (permanent: boundary: Non-Goal)

## Notes

Class: `--json` layer from STAGES. Sweep: `git ls-files -- plugin/scripts/work-next.mjs tests/staged-product.test.mjs plugin/scripts/statusline.mjs plugin/hooks/hooks.json`. Sibling leftover: layer on the bar.

## Verification Log
- 2026-09-10 · fe80715* · exit 1 · `node --test --test-name-pattern 'layer from STAGES:' tests/staged-product.test.mjs && node --test --test-name-pattern 'the wired statusline segment does not grow a layer token' tests/statusline.test.mjs` · acceptance-sha256:5656ce0e6d20600148287b2cbff3c162984f84794a4ad8b7e9da23c8fe1f60fd · ms:289
  ```
  --- last 10 line(s) of stdout (of 75 after folding 75 raw)
        at Test.postRun (node:internal/test_runner/test:1235:19)
        at Test.run (node:internal/test_runner/test:1163:12)
        at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
      generatedMessage: true,
      code: 'ERR_ASSERTION',
      actual: undefined,
      expected: 'corpus',
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-09-10 · fe80715* · exit 0 · `node --test --test-name-pattern 'layer from STAGES:' tests/staged-product.test.mjs && node --test --test-name-pattern 'the wired statusline segment does not grow a layer token' tests/statusline.test.mjs` · acceptance-sha256:5656ce0e6d20600148287b2cbff3c162984f84794a4ad8b7e9da23c8fe1f60fd · ms:319
