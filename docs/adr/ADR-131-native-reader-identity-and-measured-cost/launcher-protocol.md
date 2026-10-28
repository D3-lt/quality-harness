# ADR-131 launcher experiment v2

Frozen after protocol-v1's completed controls and before timing this optimization.
Keep v1 and all its results. Its five valid blocks establish the optional-runner
context difference; this separate experiment isolates the launcher's utility work.

## Observed reason for the change

The full replay invokes 32 registered commands. The old launcher's real forwarding
utility counter observed uname twice, dirname once and tr once on this Mac. A
positive native reviewer decision proves that this was an executed launch.
The optimized launcher queries uname once, extracts the version with shell
builtins, and resolves forward-slash script directories with shell builtins.
Native backslash paths are normalized before directory extraction. Every launch
still verifies the complete executable checksum. No cache or bypass is added.

## Comparison fixed before timing

Snapshot two otherwise identical plugin trees from the candidate. L0 uses the
released launcher's bytes; L1 uses the optimized launcher. Prove the launcher is
their only differing reader file. Both run the exact same candidate native binary.
Record source, executable and reader digests. Snapshot/provisioning is outside
timing. Keep equal-length generated paths, one fresh fixture per replay, and the
same governed/empty corpora and event trace as v1.

Five serial pairs per corpus, in orders L0/L1, L1/L0, L0/L1, L1/L0, L0/L1.
Disable Node/native process instrumentation for these timings. The separate
external waiter still records root waited-subtree CPU; it is never summed with
nested CPU. Retain all semantic positive assertions and require equal model-context
characters and bytes within each pair. Actual-session routing remains separate.

Start only with known load below the core count and adequate free memory, without
a peer build. Use endpoint samples, a per-hook deadline, and a ten-minute block
bound. Preserve rejected/contended attempts and rerun the same pair unchanged.
Report every sample, median paired ratios and ranges. Overlapping timing/CPU
variability does not establish a speed improvement. External utility-start
reduction is a distinct, directly observed claim, not a total process count.

The Windows native-path, CRLF-version, payload/argument, missing closing quote and
tampered-binary controls must pass in CI. Local Mac evidence is not a Windows
measurement. Do not change the workload, counts or denominator after seeing v2.
