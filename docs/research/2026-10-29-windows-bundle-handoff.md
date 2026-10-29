# Windows bundle verification — v3.8.62 candidate

A reply is the deliverable. Return everything printed, verbatim and privately; "could not run because X" is useful.
Run after every job of the candidate's landing run is green, including mutation shards and core-assets. Use the candidate
commit, not a moving main. The owner said this host is available in the evening.

## Fetch and verify the candidate

In a disposable quality-harness checkout, fetch origin main and check out the exact candidate commit. Successful landing
deletes land/<full-sha>; the candidate remains reachable from main. Do not substitute main's moving HEAD for that commit.
Choose its completed green selftest.yml run from:

    gh run list --commit <full-sha> --workflow selftest.yml
    gh run view <run-id> --json status,conclusion,jobs

Download both artifacts into separate empty directories, outside the checkout:

    gh run download <run-id> --name qh-core --dir <native-assets>
    gh run download <run-id> --name qh-plugin --dir <bundle-assets>

From the candidate checkout, verify the ZIP against that commit and the CI native manifest:

    node --input-type=module -e "import {releasePluginFiles} from './scripts/release-assets.mjs'; console.log(releasePluginFiles(process.argv[1],process.argv[2],{at:process.argv[3],run:process.argv[4]}))" <bundle-assets> <native-assets> <full-sha> <run-id>

Run the focused Windows boundary tests once, serially and while the host is quiet:

    node --test --test-concurrency=1 tests/plugin-bundle.test.mjs tests/bundled-core.test.mjs tests/qh-launcher.test.mjs tests/launcher-cost.test.mjs

## Exercise the distributed binary

Extract quality-harness.zip into another empty directory with Expand-Archive. Its root contains .claude-plugin, scripts
and native; it is not nested under a plugin directory.

Set CLAUDE_PLUGIN_DATA to a fresh empty directory and QUALITY_HARNESS_QH_FETCH=off. Through Git Bash, run the extracted
scripts/qh-hook.sh --version before any SessionStart. It must answer qh version 3.8.62 without provisioning a cache.
In a new Claude Code session using this extracted plugin, check SessionStart, /clear and SessionEnd. Capture hook errors
and stderr, including a zero count when none occurred. Reload an installed plugin as the host requires; an old running
session does not test the candidate. Do not remove or alter the user's existing plugin installation to run this test.

The focused tests also prove that damaged binaries, and removal of the entire native directory, cannot cause a cache
substitution or network fetch. They use disposable files and preserve the reviewer guard.

## Run outside the corpus

Keep the foreign repository read-only. Copy the verified extracted native/ directory into the disposable candidate
checkout's plugin/native/ (an ignored generated output), so its source readers select the actual bundled binary. Do not
copy another release's binary or use an ambient QUALITY_HARNESS_QH_BIN override.

From the foreign repository, run the candidate's corpus-probe.mjs --json and save stdout to a private file. Compare with
the report retained at published v3.8.61 using corpus-probe.mjs --diff, then emit --attest with --since that old report.
Return the full new stdout/stderr and comparison privately, plus the counts-only attestation. If the old report is absent,
say so; do not invent a comparison. Confirm the report's native block names this exact commit, run and Windows asset.

Only attest-import writes the tracked counts-only receipt. Foreign reports, names, paths and transcript contents stay
outside this public repository.

## Release and promotion

The source and manifest stay pinned to the previously published release until the candidate ZIP is available and its cold
installation has passed. The release command publishes the verified ZIP with its receipt, then exits 2 while catalogue
promotion is pending. Generate the reviewable manifest with:

    node scripts/marketplace-source.mjs 3.8.62

Apply through mrw, run the repository gate, commit only the catalogue metadata and land it with scripts/land.mjs.
Run release.mjs again; exit 0 also verifies that the public catalogue advertises the public ZIP and matching checksum.
Do not tag a second build merely to publish the catalogue pin.
