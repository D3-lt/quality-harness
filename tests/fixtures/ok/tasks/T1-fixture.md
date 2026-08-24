# Task ADR-001-T1-fixture: Prove adr-lint accepts a conforming task file

**Depends-on:** none
**Covers:** F-1, F-2, UC1-S1, UC1-S2
**Estimated scope:** S (single file)
**Owner:** toolkit selftest
**Produces:** none
**Consumes:** none

## Goal

Give `selftest.sh` a task file that `adr-lint` must accept with exit 0.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `fixtures/ok/tasks/T1-fixture.md` | add | the positive control itself |

## Ordered Steps

1. Write the failing test: run `adr-lint` on this ADR before the task file conforms and observe a non-zero exit.
2. Fill every required section until the gate exits 0.

## Acceptance

```bash
set -e
adr-lint ADR-001-selftest.md tasks
python3 -c 'print("acceptance fence complete")'
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| adr-lint-positive | selftest.sh | conforming ADR + task pass the gate | — |

## Invariants

- The fixture stays conforming; a failing selftest means the gate or the fixture drifted.

## Risks

- none

## Stop Condition

Gate output names a section this fixture cannot legally satisfy.

## Out of Scope

- Exercising the spec, arch, and postmortem gates — separate fixtures own those.

## Verification Log
