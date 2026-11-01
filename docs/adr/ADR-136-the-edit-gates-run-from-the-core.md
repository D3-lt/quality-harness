# ADR-136: The edit gates run from the core

**Status:** Accepted
**Accepted:** 2026-11-01 by Zy: "go further with moving mjs / js parts in to golang", then "Go on, end to end"
**Date:** 2026-11-01
**Owner:** Zy
**Spec:** None — the owner directed the port in conversation; the runner's own tests are the contract
**Cross-references:** docs/adr/ADR-110-a-static-core-owns-the-hooks.md, docs/adr/ADR-131-native-reader-identity-and-measured-cost.md, docs/adr/ADR-135-branch-state-runs-in-the-core.md
**Governs:** None — declared by its tasks
**Enforced-by:** tests/shell-hook-parity.test.mjs::the core answers every shell-hook row as the Node functions do, tests/shell-hook-native.test.mjs::the native shell hook says what the Node runner says in every scenario, tests/shell-hook-native.test.mjs::the edit-gate registrations spawn no node
**Invalidates:** none — checked; ADR-110's and ADR-135's boundary is amended below, no task changes state
**Amends:** ADR-110 2026-10-28 amendment ("The branch-state and edit-gate CLIs remain Node", docs/adr/ADR-110-a-static-core-owns-the-hooks.md:200) and ADR-135's Out of Scope entry keeping the edit-gate CLIs Node (docs/adr/ADR-135-branch-state-runs-in-the-core.md:128) — for the two registered PostToolUse runs only; the artifact batch and the hand-run CLI stay Node
**Served-path change:** After every Edit, Write, MultiEdit or NotebookEdit, the two PostToolUse registrations (`qh bridge shell-hook facts-gate-dispatch.sh` and `… post-edit-check.sh`) run their bash scripts from the Go core instead of through `node plugin/scripts/run-shell-hook.mjs`.

## Context

Measured 2026-11-01 on the owner's Mac at load 2.4 on 10 cores, three runs each: `node plugin/scripts/run-shell-hook.mjs
post-edit-check.sh` took 70 to 80 ms and `… facts-gate-dispatch.sh` 150 to 160 ms over a README edit payload, against 60 to
70 ms for `node -e 0`. The Node runner is most of each registration's cost, and both run after every edit in every adopter's
session (CLAUDE.md §19). The owner asked on 2026-11-01 to keep moving the JavaScript into the Go core; ADR-135 did branch
state, and BACKLOG §438 names this runner as the next Node process on the hook path.

The bash scripts (`plugin/scripts/facts-gate-dispatch.sh`, `post-edit-check.sh`) and the Python gates they call stay. Only the
runner moves: `runShellHook` (run-shell-hook.mjs:315-476) for post-edit-check, and `runEditGate` (691-718), which wraps it for
the facts gate and appends the `artifact.gated` event (the entry point at 719-724 chooses between them).

## Existing Primitives Audit

Reuse in the core: `canonicalFile`, `appendEvent` and `contentId` (core/hooks/eventlog.go:85, :239, :317), the uninteresting
path rule (core/hooks/orientation.go:84, :133), `hideWindow`, and ADR-135's runner (`bsRun`, core/hooks/branchstate_collect.go)
with its Unix process-group deadline. On Windows, the `taskkill /PID … /T /F` cancel already used by `executeNodeCLI`
(core/hooks/bridge_exec_windows.go:23-29) ends a gate's tree; ADR-135 accepted a direct-child kill there, which a 110 s gate
hang leaving Python grandchildren behind does not allow. Missing in Go and added here: Windows bash resolution (Git Bash, not
the System32 or WindowsApps stubs; run-shell-hook.mjs:126-163), the payload's Windows path rewrite (16-45), the per-script
arguments (101-120), the shell timeout setting (165-170), the MSYS crash banner (302), the signal name of a killed child, and
the relative-path wrapper of the uninteresting rule (plugin/scripts/uninteresting.mjs:41-45).

Class: every Node process the Go hooks start. Enumerated 2026-11-01 with
`git grep -n -E '"node"|\.mjs"' -- 'core/*.go' ':!*_test.go'`: run-shell-hook.mjs from the bridge (bridge.go) and from the
artifact pass's batch (artifact.go:155), install-notices.mjs (orientation.go:457), publish-hook.mjs (orientation.go:489) and
adr-context.mjs (pending.go:13). This record ports the bridge's two registered runs; the rest stay in BACKLOG §438.

## Decision

1. `qh bridge shell-hook facts-gate-dispatch.sh` and `qh bridge shell-hook post-edit-check.sh` are answered by the core: the
   same bash resolution, arguments, child stdin and environment, timeout, output (stdout wrapped as PostToolUse
   `additionalContext` when the gate passed and printed), messages and exit codes as `runEditGate` and `runShellHook`, and the
   same `artifact.gated` row. Exit 0 on every path but an unknown script.
2. Any other `qh bridge shell-hook` call (the artifact pass's `--batch`, an unregistered name) still spawns
   `node run-shell-hook.mjs`, which stays for those and for a hand run.
3. The deadline ends the gate's whole tree on every platform: the Unix process group (ADR-135's runner), and
   `taskkill /T /F` on Windows.
4. Parity is proved against the live Node functions (T1) and by running the same scenarios through both runners (T2, T3).
   Locked tests stay byte-identical.

## Alternatives Considered

- **Port the bash scripts too:** rejected for now; they hold the gate dispatch and its Python calls, a much larger surface, and
  the measured cost is the runner's.
- **Port the batch as well:** rejected; the artifact pass is detached and off the prompt, and the batch's history archive has
  its own tests.
- **Leave it Node:** rejected by the owner's direction; it is the largest remaining per-edit Node cost.

## Component / Boundary Impact

The hooks component of docs/architecture.md gains the runner in `core/hooks`; the scripts component keeps run-shell-hook.mjs
for the batch and a hand run. docs/architecture.md:109 is updated by T4.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `qh bridge shell-hook <registered script>` | Answered natively | core/hooks | the two PostToolUse registrations |
| `artifact.gated` event row | Same shape, written by Go | core/hooks | the Stop and lifecycle readers |
| PostToolUse `additionalContext` | Same bytes | core/hooks | the host |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `shellhook.go` helpers | T1 | T2, T3 | No |
| native `runShellHook` | T2 | T3, T4 | No |
| native `runEditGate` | T3 | T4 | No |

## Implementation

See ADR-136-the-edit-gates-run-from-the-core/tasks/README.md.

T1 to T3 were implemented on 2026-11-01; their logs hold each first red, passing fence and killed mutants. Two notes on them.
T2's first recorded mutant `--why` says the grandchild outlived the deadline; what failed was the comparison (the core added
"process cleanup could not be confirmed", a consequence of that survivor), and the survivor assertion was not reached. The
log is tool-written and stands; this is the correction. And reviewing T2 found the core passing a gate's invalid UTF-8
through as bytes where Node decodes it, one U+FFFD per maximal ill-formed subsequence; `shkDecodeUTF8` now does the same
(`the native shell hook decodes a gate's invalid UTF-8 as Node does`, and a catalogue mutant is RED).

T4 switched the registered runs on 2026-11-01: both registrations answer with no flag and no node on PATH (`the edit-gate
registrations spawn no node`; a mutant sending them back to Node is RED), while `--batch` and other names still reach Node, so
tests/native-observation.test.mjs's Go→Node example (`bridge shell-hook` with no script) and tests/qh-launcher.test.mjs pass
unchanged. Reviewing the switch found the native runner wrote no process trace: ADR-131's cost readers lost every gate run,
and the locked trace-sink refusal test passed with nothing to refuse. The runner now traces its bash child as the core's other
spawns do (`the native shell hook traces the bash it runs`, mutant RED). Separately, the Go uninteresting-directory rule the
edit gate reuses matched paths the Node rule does not (ſ folding, line terminators); it was fixed in this branch (BACKLOG §439).

The Codex review of be9293a0..4275a404 at xhigh was killed at the launcher's 600 s budget and certified nothing; it was rerun
as two scoped reviews at high effort over the same range. Part A (runner, kill, bridge) found a spawn failure other than
not-found printed with Go's error text where Node prints `spawn <file> <libuv code>`; part B (helpers, the §439 rule, this
record) found no helper or rule divergence, and found the code mapping still incomplete: a directory named bash or a PATH set
to empty (execvp reports EACCES for both), and Windows' access denied and bad executable format (libuv's EPERM and EFTYPE).
Each was reproduced against Node where it can run here, fixed with a test that failed first, and has a catalogue mutant RED;
the Windows translation is tested only on Windows (`TestShellHookWindowsSpawnCodes`). The mapping is a closed list of the
codes libuv names for a failed spawn of a resolved bash; any other error keeps Go's text, a limit stated here rather than a
code guessed.

## Consequences

Two Node starts leave every edit. The costs: two runners exist until the batch is ported, held together by the parity test;
the Node runner's operation trace (`shell/<script>`, performance-trace.mjs) is not written by the core; the process trace of
the bash child is, so ADR-131's readers see each gate's process but not the operation span around it.

## Out of Scope

- The bash scripts and Python gates (permanent: boundary: the measured cost is the runner's; the gates are their own surface).
- The artifact batch, `archiveHistory` and `historyBases` (deferred: docs/BACKLOG.md §438).
- install-notices.mjs, publish-hook.mjs and adr-context.mjs on the hook path (deferred: docs/BACKLOG.md §438).

## Risks

A parity gap in an untested path reaches every edit; T2 and T3 run the same scenarios through both runners, and the release
needs an outside run on Windows (ADR-131), where bash resolution and `taskkill` cannot be run here. A canonical-key drift on
symlinks or 8.3 names would split `artifact.gated` rows from Node's (tests/artifact-key.test.mjs holds the Node side).

## Rollback

Point `RunBridge`'s registered scripts back at `executeNodeCLI` (bridge.go); run-shell-hook.mjs stays complete.

## Follow-ups

- [x] T1 to T4, each with its first red, passing fence and killed mutants.
- [ ] A release with an outside run on Windows (ADR-131), where bash resolution and `taskkill /T` cannot be run here.
