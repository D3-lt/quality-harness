# ADR-131: Native reader identity and measured cost

**Status:** Accepted
**Date:** 2026-10-28
**Accepted:** 2026-10-28 by the owner: "good, dleiver this plan."
**Owner:** Zy
**Spec:** None — the owner approved the three-workstream plan in this session
**Cross-references:** docs/adr/ADR-064-corpus-chaos-is-the-release-loop.md, docs/adr/ADR-070-a-peer-attestation-is-imported-and-checked-against-its-commit.md, docs/adr/ADR-116-qh-ships-as-release-assets-fetched-and-verified.md, docs/adr/ADR-122-said-once-per-context.md, docs/adr/ADR-130-checks-are-optional-tools.md, docs/BACKLOG.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — native identity and observer regressions are implemented by the tasks below
**Invalidates:** ADR-064's plugin-only reader fingerprint and ADR-082's plugin-only path inventory; historical verdict-comparison and attestation evidence remains intact
**Served-path change:** a Go-only reader change requires fresh outside evidence; installed hooks retain optional checks and must deliver less repeated context without losing required findings

## Context

At released v3.8.60, reader-paths defines only installed plugin directories. Release coverage and attestation import derive paths from that list, while the Go sources live outside the installed plugin. A native-only change can therefore be reported as requiring no outside run.

The optional baseline test patches Node child_process.spawn after the lifecycle moved to Go. The cost collector has the same visibility limit. Neither an absent Node marker nor a zero Node child count establishes that Go launched nothing. Footprint item rows can overlap when one attachment carries several markers.

The earlier measurements are component timings, not whole-session CPU or token savings. Historical ledgers omit refusal decisions and manual quiet waits; those rates cannot be reconstructed from their counts.

## Existing Primitives Audit

Reuse the counts-only attestation/import/release chain, the native asset checksum manifest, the installed launcher, existing event and performance trace mechanisms, hook-footprint, ledger-report and the queued-check launch counter. Extend their boundaries rather than creating another always-on engine or telemetry service.

## Decision

1. Keep the historical plugin-reader digest. Conservatively include every regular file under core except explicit core/bin outputs and Go test sources, plus the native build/provenance scripts, target module, plugin version metadata and selftest workflow, so embedded data, assembly and build-definition changes cannot bypass coverage. Bind the source revision and source digest to the target and actual executed binary digest through the landing CI manifest. Source-check and installed paths both report the binary they used. Missing, changed or unreadable native identity is unknown coverage.
2. Old attestations retain their original verification semantics. They cannot cover later native-only reader changes. Source trees, binary checksums and CI identity are separate checks; a version string alone is insufficient.
3. Replace Node-only baseline observation with an effective native execution boundary and actual harmless check marker. A native baseline-launch mutant must fail that same test. Keep explicit checks, queued reuse, reviewer protection and evidence-write protection.
4. Correct observer coverage before measuring. Count each delivered context attachment once in a total; item attribution may overlap and is labelled accordingly. Native child/CPU observations must include the complete registered hook chain and report unavailable coverage rather than zero.
5. Freeze before-optional Node, optional Node and released optional Go controls on the same disposable corpus and event trace. Compare policy and delivered cutover separately. Use balanced paired trials, quiet serial batches and separate cold provisioning. Confirm with actual adopter sessions, including Windows, without publishing their content.
6. Required outcomes: zero unsolicited project-check launches and retired nags; queued duplicate launches reduce from two to one with invalidation controls intact; unchanged context items are not repeated within a generation; necessary governance and guard findings remain. The preregistered ordinary governed-session trace targets at least 20% less QH model-directed hook context. Report absolute counts and paired CPU/wall/wait observations; overlapping variability or incomplete observations do not establish savings.

## Alternatives Considered

- Plugin-only identity: leaves native changes uncovered.
- Treat version as binary identity: cannot detect the wrong executable from another build.
- Count Node children as all children: hides Go execution.
- Benchmark full project suites repeatedly: expensive and confounds wrapper overhead with project work.
- Claim savings from ledger wall-time totals: the data does not establish causality or CPU usage.

## Component / Boundary Impact

The repository build/release tooling owns source and CI binding. The shipped probe owns observed binary identity. Native hooks retain their lifecycle contracts. Measurement remains opt-in repository tooling; no extra per-prompt report or network scan is introduced.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumers |
|---------|--------|----------|-----------|
| Native checksum manifest | versioned source revision, source digest and landing run identity beside asset checksums | build-core | fetch, probe, importer, release-assets |
| Probe and attestation | additive native target and executed-binary identity | corpus-probe | attest-import, release-evidence |
| Cost and footprint report | explicit coverage and exclusive delivery totals | observers | paired cost report |

## Inter-task Contracts

| Contract | Producing task | Consuming task | Breaking? |
|----------|----------------|----------------|-----------|
| Versioned native source/asset identity | T1 | T3 | Additive; legacy evidence is retained |
| Trustworthy native execution and context observation | T2 | T3 | Reports gain coverage, never silently reinterpret zero |

## Implementation

See [tasks/README.md](ADR-131-native-reader-identity-and-measured-cost/tasks/README.md) and the frozen [measurement protocol](ADR-131-native-reader-identity-and-measured-cost/protocol.md). Tasks remain pending until their tool-written acceptance and mutation evidence exists.

## Consequences

The release can establish which native reader was run. The measured report can distinguish avoided work, lower overhead and missing data. Tooling gains explicit provenance and observation contracts; normal sessions gain no compulsory checks.

## Out of Scope

- Removing retained Node CLI tools (permanent: boundary: the owner selected Go lifecycle hooks while retaining these tools).
- Attributing other plugins or host memory dumps to quality-harness (permanent: boundary: report them separately).
- Reconstructing unrecorded historical refusal decisions or quiet waits (permanent: boundary: missing observations cannot be invented).

## Risks

Wrong source scope, stale executable selection, detached children and overlapping context attribution can all create false proof. Positive controls, native mutants, exact binary checksums, historical fixtures, current transcript shapes and independent review address those boundaries.

## Rollback

Revert the implementation as a unit while retaining historical attestations and measured reports. Do not restore compulsory checks as an incidental rollback.

## Follow-ups

- [x] Complete T1 native identity and its negative controls; the task records acceptance and a killed native-scope mutant.
- [x] Complete T2 native observation and mutation proof; the current fence kills a real automatic native launch.
- [ ] Complete T3 adopter confirmation and outside-corpus release evidence. Frozen paired measurements and the measured launcher improvement are reported in [the counts-only report](../research/2026-10-29-check-cost.md).
