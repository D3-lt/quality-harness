# Architecture: <project>

**Status:** Living — every ADR that changes structure updates this doc in the same commit.
**Repo:** <path or URL>
**Tier:** library | service | system (multi-repo)
**Gate command:** `<one command that runs every Check below (usually the test-suite subset)>`
**Last full audit:** YYYY-MM-DD via `/quality-harness:arch-write grill-only`

<This doc is the current-state integral; ADRs are deltas against it. Every behavioral rule row
binds to an executable check in THIS repo's toolchain (see arch-write's gate-catalog for
per-ecosystem mechanisms). A check that doesn't exist yet is tagged `(deferred: <task/ADR
pointer>)` — `adr-debt` sweeps those. "Keep them in sync" is not a check; `arch-lint` rejects it.>

## Module Map

One row per module. One reason to change per module — two reasons = two modules, split the row.

| Module | Layer | One reason to change | Owner |
|--------|-------|----------------------|-------|
| `<path>` | <domain/adapter/api/infra/ui> | <the single reason> | <ADR-NNN / task / team> |

## Dependency Contracts

Direction rules the code must obey. If single-module library: `None — <reason>`.

| # | Rule | Check |
|---|------|-------|
| D1 | <X must not import/depend on Y> | `<command or test path>` |

## Concept Ownership (DRY)

One source per concept; each row names how divergence is caught mechanically
(parity test, grep gate, schema assertion). If no shared concepts: `None — <reason>`.

| Concept | Single source | Consumers | Divergence check |
|---------|---------------|-----------|------------------|
| <concept> | `<path/symbol>` | <paths> | `<command or test path>` |

## Composition Root

Where adapters/effects/config are constructed; nothing else may construct them.
If not applicable: `None — <reason>`.

| Root | Constructs | Check |
|------|------------|-------|
| `<path>` | <adapters/clients/config> | `<command or test path>` |

## Test Doubles

The substitutability contract each fake must honour. If none: `None — <reason>`.

| Fake | Stands in for | Contract (what must hold) | Check |
|------|---------------|---------------------------|-------|
| `<path>` | `<real adapter>` | <behavioral subset the fake guarantees> | `<parity test path>` |

## Trust & Data Boundaries

Security/data lens: trust boundaries, secret paths, source-of-truth stores.
If single-trust-domain library: `None — <reason>`.

| Boundary | Crossing rule | Check |
|----------|---------------|-------|
| <boundary> | <what may cross, how> | `<command or test path>` |

## Superseded

Rules removed by later ADRs stay here tagged with the superseding ADR — silent deletion
loses the trail. If none: `None yet`.

- <rule> — superseded by ADR-NNN (<why>)
