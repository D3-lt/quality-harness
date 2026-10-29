# ADR-132: The installed plugin includes its Go core

**Status:** Accepted
**Date:** 2026-10-29
**Accepted:** 2026-10-29 by the owner: "okay, do this then"
**Owner:** Zy
**Spec:** None — the owner approved a self-contained release bundle
**Cross-references:** docs/adr/ADR-116-qh-ships-as-release-assets-fetched-and-verified.md, docs/adr/ADR-131-native-reader-identity-and-measured-cost.md
**Governs:** plugin/scripts/qh-hook.sh, plugin/scripts/native-cli.mjs, scripts/build-plugin.mjs, scripts/plugin-bundle.py, scripts/core-release-assets.mjs, scripts/release-assets.mjs, scripts/marketplace-source.mjs, scripts/hook-cost.mjs, .claude-plugin/marketplace.json
**Enforced-by:** tests/bundled-core.test.mjs::bundled hooks and compatibility CLIs run offline on their first event and reject damaged bundles, tests/plugin-bundle.test.mjs::the bundle contains exactly the committed plugin and all verified native targets with executable modes
**Invalidates:** ADR-116's separate runtime download as the installed distribution path, and the directory-only marketplace assumption in ADR-008's historical packaging test; source boundaries, checksum verification and historical evidence remain
**Served-path change:** installation brings the matching Go core; the first hook and later hooks need no core download

## Context

Missing-core errors reached macOS and Windows sessions after the hook engine moved to Go. A live development-folder
install advertised an unpublished version, whose release download returned HTTP 404. v3.8.61 repaired public availability,
but separate provisioning still permits a first-session failure independently of plugin installation.

ADR-116 rejected binaries committed with every release because its measured cadence would add roughly 500 MB per week
to Git history. A generated release ZIP avoids binary source commits. Claude Code's marketplace reference supports an
HTTPS archive source and SHA-256 pin from v2.1.224. The deployed host is v2.1.312.
Source: https://code.claude.com/docs/en/plugins/marketplace-reference#archive-plugin-source.

## Existing Primitives Audit

Reuse the existing target inventory, CI builds, native source manifest, checksum verifier, launchers and release chain.
Use Python's standard ZIP library in repository tooling; adopters run only the already compiled binaries. Preserve
source-checkout provisioning and the explicit source-check seam. No new daemon, hook, startup scan or compiler requirement.

## Decision

1. CI packages the exact release commit's plugin tree plus all supported verified native assets, checksums and source
   identity under native/. It publishes quality-harness.zip and a receipt naming version, source commit, CI run and ZIP
   digest. Binaries never enter source Git. Only the declared plugin surfaces and generated native files may ship.
2. Both shell hooks and retained Node CLI transports choose the bundled target when its marker or native/ exists. The
   marker also identifies a bundle whose entire native/ directory is missing. A missing or invalid bundle reports an
   installation failure, never a cache substitution or fetch. Unbundled source checkouts keep bounded provisioning.
3. Release verification compares the ZIP's complete entry set, bytes and executable modes with the named commit and
   verified CI native artifact. A source mismatch, wrong run, duplicate, unexpected file, missing file, changed byte or
   wrong permission prevents publication. The adjacent native manifest retains ADR-131's actual-binary identity.
4. Publish before promoting. The marketplace keeps its previous source until the new release ZIP is public, its
   unauthenticated download verifies, and a cold Claude install has run. The new version, immutable archive URL and digest
   land together through the existing landing command, in a metadata-only commit after release. A pinned ZIP including
   its source commit identity cannot supply its own digest in that same source commit.
   For the initial migration, pin the already published v3.8.61 Git subdirectory and commit while the first ZIP is built;
   the previous live ./plugin source would otherwise expose an unpublished candidate before promotion.
   The release command exits 2 while promotion is pending, including when resumed after the release already exists;
   exit 0 also requires the public catalogue to advertise the verified bundle.
5. The historical directory-only package tests keep their callbacks byte-identical and are skipped explicitly for immutable
   object sources. Active package tests enforce the new boundary and attack malformed archives. No old log is rewritten.

## Alternatives Considered

- Commit binaries under plugin/: recreates ADR-116's Git-history growth.
- Keep SessionStart downloads for installed users: preserves the independent failure point the owner wants removed.
- Publish a mutable latest ZIP without a checksum: loses the immutable package binding and version pairing.
- Advertise the future ZIP in its source commit: makes an update point to a missing artifact before CI and publication.
- Introduce a distribution service or another binary repository: unnecessary for a supported HTTPS archive source.

## Component / Boundary Impact

Repository-only packaging and promotion tools own release assembly and the catalogue. The plugin owns target selection
and checksum validation. The Go engine's decisions and optional-check policy do not change. Release and catalogue are two
observable phases; an interrupted promotion leaves the previous working version advertised.


The registered-chain cost collector uses the selected plugin's bundle, ignores an unrelated ambient source override for
that installed path, and does not rewrite the bundle's checksum or provision another cached core. Its regression starts
with a missing ambient core and still measures successful bundled hooks.

## Wiring & Contract Changes

| Surface | Producer | Consumer | Contract |
|---------|----------|----------|----------|
| qh-plugin CI artifact | build-plugin | release-assets | exact source tree plus verified native assets and ZIP receipt |
| native/ | plugin bundle | hooks, CLI transports, probe | platform binary, checksum sidecar, retained CI manifest |
| archive source | marketplace-source | Claude Code | public immutable HTTPS URL, version and SHA-256 |
| source checkout cache | qh-fetch | unbundled development launcher | matching version, verified bytes; no installed-bundle fallback |

## Implementation

The packager and runtime boundary regressions run through the repository gate. Existing asset and launcher mutants
remain exercised after moving the shared verifier; new archive and bundle-selection mutations cover the changed path.
The catalogue changes only after the release and cold-install checks, using the generated, reviewable manifest.

## Consequences

Installation downloads a larger complete package once. Session hooks need no provisioning request or startup wait.
The release source history contains no binaries. Publication requires a separate catalogue landing; it deliberately
retains the previous available version while the candidate is built and checked.

## Out of Scope

Removing the remaining Node CLI tools, changing reader verdicts, adding supported architectures, binary signing,
changing optional-check policy, or claiming new CPU/context savings from packaging.

## Risks

Archive extraction must preserve executable permissions on macOS/Linux and work with Git Bash on Windows. A host below
the archive-source minimum must update Claude Code. A running session must reload the plugin to use the new install.
Development-folder installs still require an available or explicitly provisioned source version.

## Rollback

Restore the previous immutable archive pin through a metadata landing. Keep already published release assets and old
cache evidence. Reverting to the old directory source restores its separate provisioning requirement.

## Follow-ups

- [ ] Complete independent review, platform CI, cold archive installation and catalogue promotion.
- [ ] Run the Windows bundle boundary when the owner's Windows host is available.
