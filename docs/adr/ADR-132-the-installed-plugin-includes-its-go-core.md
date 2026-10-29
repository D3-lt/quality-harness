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

The first landing campaign at 69374807 found a stale narrowed selector: mutation shard 9/48 named the now-skipped
directory-only boundary test. Auditing the class with
`mrw read --grep 'what ships is the plugin and nothing else|marketplace source is the plugin directory' tests/mutations`
listed these catalogues: .gitignore.json, .gitattributes.json and tests/package.test.mjs.json. The first two selectors now
name an active archive test that copies the real rules into an owned Git fixture and verifies both ignored/unignored
paths and LF/unspecified attributes. The agent-admission mutant moved from the retired test's array to the actual bundle
whitelist, with an agent in the committed fixture. Historical callbacks remain unchanged.

The scoped `--case 'package: the '` run noticed 3/3 mutations; the moved agent-admission case noticed 1/1. A complete
catalogue regex scan found no narrowed selector still selecting either retired title. These are local scoped results;
the corrected candidate still requires its complete landing campaign.

Windows CI also exposed an archive fixture whose bytes depended on core.autocrlf, and a Node --import receiving a drive
path instead of a file URL. The CLI test now passes pathToFileURL(preload).href. The packager pins core.autocrlf=false
and tar.umask=0022 for both assembly and verification, so a Windows checkout or private tar mode cannot redefine the
expected release bytes or permissions. The conflicting-config regression failed before the fix on macOS with the
same README byte mismatch reported by Windows. Scoped catalogue cases independently remove each configuration pin.

The bounded audit command
`mrw read --grep 'pathToFileURL|core.autocrlf|--import' tests/plugin-bundle.test.mjs tests/helpers/release-world.mjs scripts/build-plugin.mjs scripts/marketplace-source.mjs`
identified the one new CLI preload site. The packaging fixture now fixes its initial committed LF bytes, then the
regression deliberately sets conflicting archive configuration. Platform CI remains the Windows execution evidence.

The first release preflight ran `bash scripts/dead-code-scan.sh`: Vulture 2.16 named only ZipInfo.create_system and
ZipInfo.compress_type as unused. zipfile reads these fixed standard-library configuration names while writing the
archive; they cannot be renamed. The explicit keep declarations in scripts/vulture-allowlist.py record that reason
(CLAUDE.md §13). Re-running the complete dead-code scan returned 0 with every scanner run and no findings.

Published v3.8.62 binds the archive to 7bdb0be3fd24f94c518da05e9c15087202fa4c1f and CI run 40861695329.
All jobs concluded success. The Windows bundle boundary passed with the verified CI binary; attest-import filed its
counts-only outside receipt in docs/corpus-reports/2026-10-29-windows-bundle-3.8.62-3.8.62-7bdb0be.json.
A cold Claude Code installation from the public HTTPS archive passed in an isolated configuration. Its installed
macOS binary retained mode 0755 and the CI checksum; --version and SessionEnd passed with fetching disabled and a
fresh plugin data directory, which remained empty. Catalogue promotion pins that same public archive and digest.

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

- [x] Complete independent review, platform CI, cold archive installation and catalogue promotion.
- [x] Run the Windows bundle boundary when the owner's Windows host is available.
