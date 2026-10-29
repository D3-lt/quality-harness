# Optional checks and native hook cost, 2026-10-29

The fixed replay shows less QH hook text and no automatic project-check launch after the optional-runner change. Native reader identity is now checked through source, target, executed bytes and the named CI artifact. Actual adopter-session confirmation is still pending; this report is generated-corpus evidence.

Protocols: [session comparison](../adr/ADR-131-native-reader-identity-and-measured-cost/protocol.md), [launcher comparison](../adr/ADR-131-native-reader-identity-and-measured-cost/launcher-protocol.md). The [counts and individual samples](2026-10-29-check-cost.json) contain no raw transcript, private project name or absolute path.

## Context and avoided work

Five balanced valid blocks exercised every matching registration: 32 command invocations per replay. One block crossed the load threshold on its final sample; its raw receipts were retained and the whole timing block repeated unchanged. All accepted traces preserved first governance delivery, syntax-error reporting, reviewer refusal, evidence-write refusal and resume suppression.

| Generated project | Before optional Node | Optional Node / optional Go / candidate | Reduction | Automatic checks per replay |
|---|---:|---:|---:|---:|
| Governed source and pending task | 5,400 characters | 3,676 characters | 31.9% | 1 → 0 |
| Same source, no ADR corpus | 5,230 characters | 3,506 characters | 33.0% | 1 → 0 |

Every accepted sample had the same counts. The 20% primary-trace target was met in this replay. These are exclusive model-directed hook-body characters and UTF-8 bytes, not tokens or the whole session context. Item rows remain useful for diagnosis but overlap and must not be summed.

The queued-check regression counts real executions: matching callers reuse one run; forced, fast, failed, changed-tree, torn-ledger and unseen-write cases still execute. This controlled lease-boundary test is separate from timing the session replay.

A/B pins the optional-runner change bundle. B/C compares the delivered Go cutover bundle, including intervening changes; it does not isolate language alone. C is built locally from the released source revision, rather than asserting identity with a downloaded release asset.

## Launcher optimization

Two snapshots differ only in qh-hook.sh and execute the same native binary. A forwarding utility counter observed the old launcher invoking uname twice, dirname once and tr once. The optimized Mac path invokes uname once. Checksum verification still runs on every launch. The Windows path retains separator normalization and awaits actual CI execution.

This removes three external utility invocations per verified Mac launch. Multiplying by the replay's 32 registrations predicts 96 fewer utility invocations; this is derived from the boundary counter, not a whole-OS process census.

| Corpus | Median paired wall ratio, new/old | Median paired waited-root CPU ratio |
|---|---:|---:|
| Governed | 0.949 | 1.001 |
| No ADRs | 0.949 | 0.998 |

The median paired wall observation was about 5% lower. Timing ranges overlap, and CPU variation does not establish a CPU speedup. One no-ADR pair was slower; it remains in the results. All pairs retained identical model-context counts. No observer overhead was subtracted.

## Scope and remaining cost

The native launch mutant executed a real harmless check and was killed by the installed-launcher regression. A Node-only interception no longer stands in for Go execution. Native and Node process observations are opt-in, bounded local diagnostics; normal prompt hooks perform no new provenance scan or network request.

The traced candidate's largest event groups were the retained three-registration edit chains, followed by SessionStart. Those Node CLI/edit-gate dependencies remain within the owner's selected scope. The redundant JavaScript lifecycle implementation remains removed.

## Limits and completion

- CPU is waited-root subtree usage. Detached work and shell-internal process visibility remain partial; nested CPU is never added to a parent's subtree total.
- Completion-receipt waits are synchronization in this harness. Historical manual quiet-machine waits and refusal false-positive rates were not recorded and cannot be reconstructed.
- The environment was Darwin 27.0.0 arm64, Node v26.12.1, Go go1.27.3 and Python 3.15.2. Local native builds used the same compiler and explicit build flags; cold download/provisioning was outside this experiment.
- Recounting every saved replay with the corrected footprint parser retained all totals. Corrected exec-completion accounting found no unresolved images in the saved observed traces. The fixtures are public generated data. Raw process/transcript files stay local.
- Claude Code 2.1.312 Windows receipt shapes were checked against the actual peer reply: 1,221 model-directed characters, no errors, and required findings retained. Empty output alone cannot distinguish suppression from a hook not firing. The parser now recognizes explicitly empty Stop summaries and counts recorded delivered plain text rather than its newline-terminated stdout; JSON envelopes remain excluded. The generated replay injects raw stdout, so its frozen totals above remain raw replay-body measurements, not actual Claude token counts.
- An unchanged Mac repository session independently had 13 plain receipts whose stdout exceeded delivered content by one newline. Its corrected model total is 1,940 characters; two Stop summaries with errors remain unpaired. The earlier private adopter sample is no longer available unchanged, so its partial totals cannot be promoted to complete evidence. Full outside output and remaining adopter confirmation are still release work.
- QH hook-body savings do not measure memoryd, other plugins, host instruction dumps or tool-output volume.

See [ADR-131 tasks](../adr/ADR-131-native-reader-identity-and-measured-cost/tasks/README.md) for tool-written acceptance and mutation evidence. No new release is claimed by this report.
