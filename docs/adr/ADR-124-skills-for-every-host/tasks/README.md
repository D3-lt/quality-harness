# ADR-124 Tasks

Implementation tasks for ADR-124: the skills reach other agent hosts through one shared link the plugin keeps fresh. See the
parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Task Index

| ID | Title | Status | Depends-on | Covers | Acceptance |
|----|-------|--------|------------|--------|------------|
| [T1](T1-measure-the-hosts.md) | Measure which hosts load a linked skill, and that Claude Code does not read the shared directory | pending | none | none — no spec | human-observed |
| [T2](T2-a-pointer-that-follows.md) | SessionStart keeps one pointer at the running plugin and names a dangling agent link | pending | none | none — no spec | `node --test tests/agents-pointer.test.mjs`, named tests |
| [T3](T3-link-the-skills.md) | `--link --agents` links every skill under the shared directory through the pointer | pending | T1, T2 | none — no spec | `node --test tests/agents-link.test.mjs`, named tests |
| [T4](T4-outside-run.md) | Peers on other platforms load a linked skill | pending | T3 | none — no spec | human-observed |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | the measured host list and the Claude Code verdict | T3, T4 | T1 before T3 |
| T2 | the `current` pointer | T3 | T2 before T3 |
| T3 | `--link --agents` | T4 | T3 before T4 |
