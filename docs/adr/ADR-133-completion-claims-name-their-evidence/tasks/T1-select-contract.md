# Task ADR-133-T1: Select the shared completion contract

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** completion-proof-v1
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Make each existing main-session completion producer select the same concise evidence contract.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/skills/work/references/completion-proof.md` | add | Canonical claim definitions and compact examples |
| `plugin/skills/work/SKILL.md` | edit | Select the reference from Completion report |
| `plugin/skills/execution/SKILL.md` | edit | Select the reference from Return |
| `plugin/skills/adr-execute/SKILL.md` | edit | Select the reference from Completion Report |
| `tests/completion-report-contract.test.mjs` | add | Missing or broken actual consumer selection fails |
| `tests/mutations/plugin/skills/work/SKILL.md.json` | add or edit | Deleting reference selection is noticed |
| `tests/mutations/plugin/skills/execution/SKILL.md.json` | edit | Removing this consumer's selector is noticed |
| `tests/mutations/plugin/skills/adr-execute/SKILL.md.json` | edit | Removing this consumer's selector is noticed |

## Ordered Steps

1. [S1] Write a failing wiring check over the real completion sections, including removal and wrong relative-target controls; confirm it fails while the shared reference is absent.
2. [S2] Write the shared reference from ADR-133's Decision and select it in the existing producers. Preserve their verification, remaining-risk and publication-authorization instructions.
3. [S3] Confirm each consumer can resolve its reference from its own directory and the package admits it. Remove each selection in a disposable fixture and require a failure. [proof: acceptance]
4. [S4] Record a bound mutation that removes a real selector; preserve all existing hook registrations and runtime sources. [proof: mutation]

## Acceptance

```bash
node --test tests/completion-report-contract.test.mjs
```

The file must exist and collect real tests; a missing file or selector is failure. This proves wiring, not model compliance.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `completion producers select the shared reference through their real completion sections` | `tests/completion-report-contract.test.mjs` | Real selection, including broken-link negative controls | — | S1, S2, S3 |
| `the release packager admits the selected shared completion reference` | `tests/completion-report-contract.test.mjs` | Actual nested reference bytes ship; its removal is rejected | — | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | Shared reference is packaged with the skills |
| 2 — selected | Existing completion sections resolve it; deleting a selector fails |
| 3 — discoverable | Loading each producer exposes its explicit reference |
| 4 — used | T2 observes actual agent reports; not established here |

## Mutation Log
- 2026-10-30 · 237f304a* · mutant killed · exit 1 · `plugin/skills/work/SKILL.md` · Removing work's actual completion selector makes the scoped wiring assertion fail. · acceptance-sha256:1d84a40fea62038c1f712c76024d92f2fbed8efc42a488d8368d8b92db80d168
- 2026-10-30 · 237f304a* · mutant killed · exit 1 · `plugin/skills/execution/SKILL.md` · Removing execution's actual completion selector makes the scoped wiring assertion fail. · acceptance-sha256:1d84a40fea62038c1f712c76024d92f2fbed8efc42a488d8368d8b92db80d168
- 2026-10-30 · 237f304a* · mutant killed · exit 1 · `plugin/skills/adr-execute/SKILL.md` · Removing adr-execute's actual completion selector makes the scoped wiring assertion fail. · acceptance-sha256:1d84a40fea62038c1f712c76024d92f2fbed8efc42a488d8368d8b92db80d168

## Invariants

Checks stay optional; source, installed artifact and platform evidence remain scoped. Existing report obligations remain.

## Risks

A link check cannot prove an agent obeyed the reference; T2 owns that observation. Fixtures model broken links, not model behavior.

## Out of Scope

- Outcome trials are T2/T3.

## Stop Condition

Stop if the shared reference requires a new hook, evidence ledger or automatic check to be useful.

## Verification Log
- 2026-10-30 · 237f304a* · exit 1 · `node --test tests/completion-report-contract.test.mjs` · acceptance-sha256:1d84a40fea62038c1f712c76024d92f2fbed8efc42a488d8368d8b92db80d168 · ms:226 · test-lock-sha256:054759756a0f890e7aff80166ef59a33362f6849b7a170463f4c53dd7e72c463 · test-lock-file:docs/adr/locks/054759756a0f890e7aff80166ef59a33362f6849b7a170463f4c53dd7e72c463.lock
  ```
  --- last 10 line(s) of stdout (of 56 after folding 56 raw)
        at Test.postRun (node:internal/test_runner/test:1542:19)
        at Test.run (node:internal/test_runner/test:1467:12)
        at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: undefined,
      expected: true,
      operator: '==',
      diff: 'simple'
    }
  ```
- 2026-10-30 · 237f304a* · exit 0 · `node --test tests/completion-report-contract.test.mjs` · acceptance-sha256:1d84a40fea62038c1f712c76024d92f2fbed8efc42a488d8368d8b92db80d168 · ms:226
- 2026-10-30 · 237f304a* · exit 0 · `node --test tests/completion-report-contract.test.mjs` · acceptance-sha256:1d84a40fea62038c1f712c76024d92f2fbed8efc42a488d8368d8b92db80d168 · ms:271
- 2026-10-30 · 237f304a* · exit 0 · `node --test tests/completion-report-contract.test.mjs` · acceptance-sha256:1d84a40fea62038c1f712c76024d92f2fbed8efc42a488d8368d8b92db80d168 · ms:275
- 2026-10-30 · 237f304a* · exit 0 · `node --test tests/completion-report-contract.test.mjs` · acceptance-sha256:1d84a40fea62038c1f712c76024d92f2fbed8efc42a488d8368d8b92db80d168 · ms:286
