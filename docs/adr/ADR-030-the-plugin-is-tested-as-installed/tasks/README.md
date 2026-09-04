# ADR-030 Tasks

Implementation tasks for ADR-030: Give the delegation machinery a socket, and test the plugin as
installed. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` headers. This README is
a derived index — when it disagrees with a task file, the task file wins.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | [a role can be addressed by name](T1-a-role-can-be-addressed-by-name.md) | pending | — | `node --test tests/package.test.mjs …` |
| T2 | [the plugin is exercised as installed](T2-the-plugin-is-exercised-as-installed.md) | pending | — | `node --test tests/installed.test.mjs …` |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `plugin/agents/` exists and ships | T2 | T1 before T2 — T2 asserts every shipped surface is reachable and covers one more directory once T1 lands |

## Notes

- T2 SKIPS loudly where no plugin is installed, which includes CI. That is deliberate: a check that
  installed the plugin itself would test an install this test performed rather than the one a user
  has, which is the "measures the wrong tree" defect ADR-008 named.
