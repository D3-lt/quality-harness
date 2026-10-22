# ADR-123 Tasks

Implementation tasks for ADR-123: a living product model whose rules run, specs that change it, and the product concerns every
spec states. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Waves

| Wave | Tasks | Notes |
|------|-------|-------|
| 1 | T1, T2, T3 | independent |
| 2 | T4, T5, T8 | T4 needs T2 and T3; T5 needs T3; T8 needs T1 |
| 3 | T6 | needs T1, T3, T5 and T8 |
| 4 | T7 | needs T4 and T6 |

## Task Index

| ID | Title | Status | Depends-on | Covers | Acceptance |
|----|-------|--------|------------|--------|------------|
| [T1](T1-grill-in-rounds.md) | spec-write grills in frontier rounds over the whole checklist | pending | none | none — no spec | `node --test tests/spec-write-rounds.test.mjs`, named tests |
| [T2](T2-every-spec-states-it.md) | Outcome, the four risks and the twelve concerns in every spec | pending | none | none — no spec | `node --test tests/spec-product-sections.test.mjs`, named tests |
| [T3](T3-a-living-model.md) | A living product model, judged by spec-verify and reported by work-next | pending | none | none — no spec | `node --test tests/product-model.test.mjs`, named tests |
| [T4](T4-a-spec-changes-the-model.md) | A spec is a delta, merged and validated | pending | T2, T3 | none — no spec | `node --test tests/model-merge.test.mjs`, named tests |
| [T5](T5-quality-in-the-architecture.md) | Quality scenarios and a context map in the architecture | pending | T3 | none — no spec | `node --test tests/arch-quality.test.mjs`, named tests |
| [T6](T6-map-a-repository.md) | spec-write maps an existing repository into a living model | pending | T1, T3, T5, T8 | none — no spec | human-observed |
| [T7](T7-outside-run.md) | A peer maps and runs a model of its own | pending | T4, T6 | none — no spec | human-observed |
| [T8](T8-the-grill-observed.md) | A model session grills in rounds as the skill says | pending | T1 | none — no spec | human-observed |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | the grill's round shape and checklist | T8 | T1 before T8 |
| T8 | the observed grill | T6 | T8 before T6 |
| T2 | the spec template's new sections | T4 | T2 before T4 |
| T3 | the Living model and its judgement | T4, T5, T6, T7 | T3 before T4 and T5 |
| T4 | `--merge` | T7 | T4 before T7 |
| T5 | quality scenarios and the context map | T6 | T5 before T6 |
| T6 | the map mode | T7 | T6 before T7 |
