# Spec: Prove the packaged gates accept conforming artifacts

> **Date:** 2026-07-30 · **Status:** Ready-for-ADR
> **Owner:** toolkit selftest · **Becomes:** ADR-001 (`ADR-001-selftest.md`)
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** none

## Problem

A copied toolkit can look installed and still be broken: wrong Python, lost +x bit,
truncated script. Nothing in the copy proves the gates still run.

## Goal

`selftest.sh` exits 0 on a fresh machine only when every gate runs and agrees with a
known-good artifact.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| operator | human role | know the transfer worked before authoring a real ADR |
| selftest | scheduled job | exercise each gate's pass and fail path |

## Use Cases

### UC-1: Operator verifies a fresh install

- **Trigger:** `install.sh` finished · **Preconditions:** payload copied into `the plugin directory`
- **Main flow:**
  1. Operator runs `selftest.sh`.
  2. Each gate runs against its fixture.
  3. Exit code reports the verdict.
- **Failure paths:** a. at step 2, a gate is missing or non-executable → named failure, non-zero exit
- **Postconditions:** exit 0 means every gate parsed a conforming artifact.

## Scenarios

### UC1-S1 [happy] Conforming fixtures pass every gate [@spec] → `test_selftest_fixture.py::test_gates_run`

```gherkin
Given the toolkit is installed under the plugin directory
When the operator runs selftest.sh
Then every gate exits with its expected code and the script exits 0
```

### UC1-S2 [failure] A malformed artifact is rejected, not silently accepted [@spec] → `test_selftest_fixture.py::test_gates_reject_malformed`

```gherkin
Given a placeholder-filled template
When a gate runs against it
Then the gate exits non-zero and names the offending section
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | A conforming ADR + task pair makes adr-lint exit 0 | `test_selftest_fixture.py::test_gates_run` | @spec | |
| F-2 | A placeholder-filled artifact never exits 0 | `test_selftest_fixture.py::test_gates_reject_malformed` | @spec | |

## Domain

Artifacts (spec, ADR, task, architecture doc, postmortem) each own one gate; a gate is a
script whose exit code is the verdict.

## Contracts Touched

None — implementation-internal only

## Non-Goals

- Testing skill prose behavior — only exit codes are executable.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Gate grammar drifts, fixture goes stale | Med | Low | selftest names the failing gate |

## Open Questions

## Verify

```bash
spec-verify --spec spec-selftest.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | Do we assert exit 0 everywhere? | F-2 | No — placeholder templates must fail; assert measured codes |
| 2 | Where do fixtures live? | non-behavioral | `fixtures/ok/` next to the installer |
