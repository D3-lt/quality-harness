# ADR-139 Tasks

Implementation tasks for ADR-139: the landing run shortens its three longest required jobs, proven beside the jobs they replace.

**Source of truth:** task-file Depends-on, Produces, Consumes and Covers headers.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | A deterministic slice of the test files, each file in exactly one slice | withdrawn | none — no spec | `node --test tests/test-slice.test.mjs` |
| T2 | The Python floor runs in shards, and its fan-in passes only on every shard's own success | withdrawn | none — no spec | `node --test tests/coverage-shards.test.mjs` |
| T3 | The JavaScript floor runs at default concurrency only once five landings show it deterministic | withdrawn | none — no spec | `node --test tests/js-floor-probe.test.mjs` |
| T4 | The Windows selftest runs in shards, accounted over one merged row | withdrawn | none — no spec | `node --test tests/selftest-shards.test.mjs` |
| T5 | The new layout's landing time is measured, and kept or reverted | withdrawn | none — no spec | human-observed |

Order: T1, T2, T3, T4, T5.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `sliceFiles(files, i, n)` | T2, T4 | The slice before any shard uses it |
| T2 | `fanIn(jobs, artifacts, prefix, count)` | T4 | Written and mutated once, then reused |
| T2, T3, T4 | the switched layouts | T5 | Measured only once all three have switched or been decided |
