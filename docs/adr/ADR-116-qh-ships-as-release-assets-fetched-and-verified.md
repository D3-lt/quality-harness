# ADR-116: `qh` ships as release assets, fetched and verified, with Node as the fallback

**Status:** Accepted
**Date:** 2026-10-19
**Owner:** Zy
**Spec:** None — no spec stage; the owner, 2026-10-19: "so how the adopters will install this? go will be pre-compiled as an artifact with the plugin?", then "so we have a build from MRW tool - it builds binaries for windows, linux and mac", then "draft the next stages, signedoff"
**Cross-references:** docs/adr/ADR-080-no-hook-waits-on-the-artifact-pass.md, docs/adr/ADR-110-a-static-core-owns-the-hooks.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks
**Amends:** ADR-110 T3 — its Affected Files named `plugin/bin/qh` and `plugin/bin/qh.exe`, which cannot serve both macOS and Linux, nor arm64 and amd64, and put binaries in the tree
**Served-path change:** none until ADR-110 T2's numbers are in and its T3 switches `hooks.json`; T1 and T2 here build and fetch, and T3 is the launcher that switch would use

## Context

ADR-110 T3 switches the hooks to the Go core and says the release workflow produces `plugin/bin/qh` and `plugin/bin/qh.exe`. A plugin is installed from the repository's tree at its tag, so a binary there is a binary in git history, and one name per operating system serves neither both macOS architectures nor Linux and macOS at once.

Measured 2026-10-19: `CGO_ENABLED=0 go build -trimpath -ldflags '-s -w' ./cmd/qh` gives 3,387,026 B (darwin/arm64), 3,594,176 B (darwin/amd64), 3,608,736 B (linux/amd64), 3,473,568 B (linux/arm64) and 3,752,960 B (windows/amd64), 17.8 MB together; and `gh release list` counts 28 releases in the 7 days before. Committed with each release, the binaries would add about 500 MB a week to the repository every adopter installs from.

The sibling tool `mrw` (tool-multipathreadwrite, `.github/workflows/ci.yml:237-352`, read 2026-10-19) already ships this way: one ubuntu runner cross-compiles the same five targets with `CGO_ENABLED=0`, publishes `mrw-<goos>-<goarch>[.exe]` as release assets with a `SHA256SUMS.txt`, and commits no binary. It signs nothing; whether macOS quarantine or Windows SmartScreen stops a binary fetched by a script is not measured by either repository.

## Existing Primitives Audit

- **`mrw`'s release job**: the shape reused (matrix, flags, raw assets, `SHA256SUMS.txt`, `fail_on_unmatched_files`).
- **ADR-080's detached runner**: how SessionStart starts work no hook waits on; the fetch runs that way.
- **`CLAUDE_PLUGIN_DATA`**: where the plugin already keeps machine-local state; the fetched binary goes there, never into a tree.
- **`plugin/scripts/lifecycle.mjs`**: the Node hooks, kept as the fallback.

## Decision

1. **The release builds `qh` for five targets and publishes them as release assets (T1):** linux/amd64, linux/arm64, darwin/amd64, darwin/arm64 and windows/amd64, cross-compiled on one runner with `CGO_ENABLED=0 -trimpath -s -w`, named `qh-<goos>-<goarch>[.exe]`, beside a `SHA256SUMS.txt`. No binary is committed.
2. **SessionStart fetches the one this machine needs, detached, and verifies it (T2):** the asset for this release's version and this platform, into `CLAUDE_PLUGIN_DATA/qh/<version>/`, kept only when its SHA-256 is the one `SHA256SUMS.txt` of the same release names; a fetch that fails or does not verify is said once and leaves nothing behind. No hook waits on it (ADR-080), and nothing is fetched where `QUALITY_HARNESS_QH_FETCH=off`.
3. **A launcher runs `qh` where a verified one is present, and the Node hooks otherwise (T3):** `plugin/bin/qh-hook`, a POSIX sh script the hook commands would call, because Claude Code runs hook commands through a shell on every platform, Git Bash on Windows. An unsupported platform, an offline first session or a missing binary runs Node, as today. `hooks.json` points at it only when ADR-110 T3 does, after T2's numbers.

**This fails if** a binary is committed to the repository; a binary runs without matching its release's `SHA256SUMS.txt`; a hook waits on the fetch; or a machine without a binary stops working instead of running Node.

## Alternatives Considered

- **All five binaries in the plugin, with the launcher.** No network at all, but 17.8 MB per release in git history, about 500 MB a week at the measured cadence. Rejected on that number.
- **One binary per OS in `plugin/bin` (ADR-110 T3 as written).** Rejected: it cannot serve two architectures of one OS.
- **`go install` by the adopter.** Rejected: an adopter is not assumed to have Go.

## Component / Boundary Impact

`.github/workflows/` gains the build and the assets; `plugin/scripts/` gains the fetch, started at SessionStart; `plugin/bin/` gains the launcher. This repository has no architecture document.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| GitHub release assets | `qh-<goos>-<goarch>[.exe]` ×5 and `SHA256SUMS.txt` | T1 | T2 |
| `CLAUDE_PLUGIN_DATA/qh/<version>/` | the verified binary | T2 | T3 |
| `QUALITY_HARNESS_QH_FETCH` | `off` turns the fetch off | T2 | an adopter |
| `plugin/bin/qh-hook` | runs `qh` or the Node hooks | T3 | ADR-110 T3's `hooks.json` |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| the asset names and `SHA256SUMS.txt` | T1 | T2 | No — new |
| the verified binary's path | T2 | T3 | No — new |

## Implementation

See `tasks/README.md`.

## Consequences

- **Positive:** the repository stays the size it is; each machine fetches 3.4 to 3.8 MB once per release; any failure falls back to the hooks adopters run today.
- **Negative:** a network fetch at SessionStart, once per release, and a binary that is unsigned.
- **Neutral:** nothing changes for an adopter until ADR-110 T3 switches `hooks.json`.

## Out of Scope

- Signing and notarisation (deferred: docs/BACKLOG.md §386)
- windows/arm64 (permanent: boundary: mrw ships no such target and nothing here measured one; it runs the Node hooks)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| macOS quarantine or SmartScreen stops a fetched binary | Med | Low | the launcher runs Node when the binary does not answer `--version`; measured before ADR-110 T3 switches |
| A release published without every asset | Low | Med | `fail_on_unmatched_files`, and `release.mjs` counts the assets |
| A forged asset | Low | High | the SHA-256 must match `SHA256SUMS.txt` of the same release, fetched over HTTPS from the forge |

## Rollback

Revert the tasks' commits; with no binary present the launcher was never on the served path.

## Follow-ups

- [x] Owner decision: Accepted with the sign-off "draft the next stages, signedoff", 2026-10-19.
- [ ] Measure quarantine and SmartScreen on a fetched binary before ADR-110 T3 switches.

## Amendment, 2026-10-28: one hook engine, with verified provisioning

The owner's Go-hook selection removes Decision 3's Node-engine fallback. Registered hooks select the native lifecycle;
the old engine remains only under tests as a comparison oracle. Existing Node CLI readers and edit gates remain explicit
CLI dependencies, not another lifecycle implementation.

Without a second engine, a cold SessionStart must finish provisioning before it can run the native guards. This replaces
Decision 2's detached fetch with a bounded synchronous bootstrap: the network operations share a 15-second deadline and the
downloaded binary has a bounded version probe. No other event fetches. Failure, an unsupported platform, or disabled fetching
with no verified cache is could-not-run, never a hook verdict. A cached executable is checksum-checked before each launch.

The landing's CI run builds the release assets from that commit. The release downloads and verifies the complete set and
its checksum list before creating the release with those files attached. No native binary enters the Git tree.

The native bridge preserves the retained CLI's actual output descriptors, so delivery receipts are not written merely
because an intermediate buffer accepted text. On Windows its bound also ends its owned child tree; inherited stdio does
not use CREATE_NO_WINDOW. Source compatibility CLIs accept the existing explicit local-binary seam; registered hooks use
the verified cache.

The installer/launcher tests execute a real native binary after the Node installer writes it, including on Windows CI.
This checks execution in that environment; it is not a claim about every adopter's local application-control policy.

## Amendment, 2026-10-28: native provenance (ADR-131)

`SHA256SUMS.txt` gains an additive `# qh-core-source-v1 <source-sha-or-dash> <source-digest> <run-id-or-dash>` header.
The source digest covers the shared conservative native-input scope. Release builds check the same source snapshot
before and after compilation. Publishing verifies the expected source revision and landing run as well as all asset hashes.
The installer keeps that exact manifest beside the executable. Legacy manifests still install, while only committed
CI provenance can support a new native attestation. Normal prompt hooks perform no new provenance scan or network lookup.
