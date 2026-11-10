# ADR-140: On Windows the core ends a gate's tree through a job object

**Status:** Accepted
**Date:** 2026-11-10
**Owner:** Zy
**Spec:** None — no spec stage; docs/BACKLOG.md §440 and the owner's choice of 2026-11-10 ("New ADR, core only") are the inputs
**Cross-references:** docs/adr/ADR-135-branch-state-runs-in-the-core.md, docs/adr/ADR-136-the-edit-gates-run-from-the-core.md, plugin/lib/fence.py, CLAUDE.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks; each adds catalogue mutants on the platform-neutral half it implements
**Invalidates:** ADR-136 — Decision 3's "The core matches Node there; it does not do better": on Windows the core now ends the tree and the Node runner does not, so the parity test's two timeout scenarios split by runner there (T2 relocks ADR-136 T2, T3 and T4). ADR-135 — its Risks' Windows direct-child kill in `bsRun`, which now ends a job (T3)
**Served-path change:** On Windows, an edit gate the core runs (`qh bridge shell-hook`) and every command `run()` starts (git, the artifact batch's Node runner at core/hooks/artifact.go:155) have every process they started ended at their deadline, and `run()`'s also when the command returns, where today an MSYS-started grandchild survives and the edit gate says "process cleanup could not be confirmed"

## Context

CI's Windows job on land/c5a296af (2026-11-01) measured it: in tests/shell-hook-native.test.mjs's hang scenario, a `sleep` that
the bash gate started outlived the deadline under `taskkill /PID … /T /F`, and both runners said "process cleanup could not be
confirmed". ADR-136 recorded that the core matches Node there and filed the fix as BACKLOG §440. `taskkill /T` walks Windows
parent links; an MSYS process start (fork, then exec) leaves the started program's Windows parent dead, so there is no tree left to
walk. Two Windows 11 boxes measured the same shape for adr-verify's fences on 2026-09-05 (BACKLOG §123): the orphan ran to
completion past taskkill while holding the pipe.

The class, enumerated 2026-11-10 with `git ls-files core | xargs grep -ln taskkill` (two files) plus the Windows tree file that
names the missing job object (`core/hooks/bstree_windows.go:11-13`): the shell hook's deadline (`shkEndTree`,
core/hooks/shellhook_kill_windows.go:23), `bsRun`'s, which kills only the direct child (ADR-135 Risks) and serves every `run()`
including the artifact batch's Node runner (core/hooks/artifact.go:155, the Codex review of this record), and the bridge's cancel
(`executeNodeCLI`, core/hooks/bridge_exec_windows.go:23-29), which no registered hook reaches on Windows: the two edit gates
run natively, and `branch-state` never reaches Node. On the Node side, `run-shell-hook.mjs:187` and `check-child.mjs:21` use
taskkill too; Node has no API for a job object.

## Existing Primitives Audit

- `plugin/lib/fence.py` `WindowsJob` / `windows_job` (fence.py:158-394): the measured design this ports. Start the child
  CREATE_SUSPENDED, create a job, assign the child, resume its threads found through a Toolhelp thread snapshot (the start closes
  the thread handle it could have kept), kill it when it cannot be resumed, and at the deadline call TerminateJobObject with
  taskkill as the fallback. Reused as the design; Go cannot import it, so the core gets its own port.
- `shkOwnTree` / `shkEndTree` (core/hooks/shellhook_kill_*.go): the per-platform pair `shkRun` calls. Reshaped: the Windows pair
  takes the job, and `shkRun` gains one call after `Start` that adopts the child.
- `bsWatchTree` (core/hooks/bstree_*.go): `bsRun`'s per-platform hook after `Start`, which ends the Unix group at the deadline
  and once Wait returns (BACKLOG §438). Reshaped: it returns an error too, so a Windows child that could not be resumed is a
  failed run, and on Windows it is `winWatch` over the job.

## Decision

1. **One platform-neutral job-tree routine with a kernel seam.** `core/hooks/wintree.go` (no build tag) holds the order and the
   fallbacks: create a job, assign the suspended child, resume it whatever happened to the job, kill it and return an error when
   it cannot be resumed; at the deadline terminate the job, and run taskkill only when there is no job or terminating it failed.
   The kernel calls are a struct of functions: `core/hooks/wintree_windows.go` fills it from kernel32 (CreateJobObjectW,
   AssignProcessToJobObject, TerminateJobObject, CreateToolhelp32Snapshot, Thread32First/Next, OpenThread, ResumeThread), and
   the tests fill it with fakes, so every branch runs on every platform (CLAUDE.md §7: the platform is a parameter).
2. **The shell hook adopts its gate.** On Windows `shkOwnTree` adds CREATE_SUSPENDED to the creation flags; `shkRun` calls
   `shkAdopt` right after `Start` (a no-op elsewhere) and passes what it returns to `shkEndTree`. A child that cannot be resumed
   is reported as a failed start, not waited on until the deadline.
3. **`run()` adopts its command** the same way: `bsEndTree` starts it suspended, and `bsWatchTree` adopts it and ends the job
   at the deadline and once Wait returns, as the Unix process group is ended since BACKLOG §438. A git daemon started without
   asking to break away is ended with the command, as one sharing the Unix group would be; git starts it again when needed.
4. **No kill-on-close.** The job is ended only where the Unix process group is: at the deadline, and for `run()` when the
   command returns. JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE would also end the tree when the core itself dies before its cleanup runs
   (a host killing the hook). That protection is left out on purpose: the Unix runner does not have it either, and adding it on
   one platform only would be a second behaviour to explain.
5. **Node is not changed**, nor is `executeNodeCLI`, which no registered hook reaches. The Node runner keeps taskkill and keeps
   saying "process cleanup could not be confirmed" on Windows; the parity test says so per runner (T2).

What would make this fail, and the data that shows it: the CI Windows job's hang and orphan scenarios, where the grandchild's pid
is recorded. If an MSYS child broke away from the job the grandchild would survive and the native assertion would be red there.
Git for Windows' runtime asks to break away only when the job's limits permit it (msys2-runtime spawn.cc, read by the Codex
review of this record); the job sets no BREAKAWAY_OK, so ordinary MSYS starts stay inside. fence.py's measurement covered nested
jobs only on peers outside a job; CI's Windows runner usually runs inside one, and nesting is supported from Windows 8, so CI is
where that case is measured.

## Alternatives Considered

- **Keep taskkill and say the failure** (today, ADR-136 Decision 3). Rejected by the owner, 2026-11-10: the Windows gate leaves a
  process running after the hook said its deadline passed.
- **Assign after `Start` without suspending.** Rejected: bash backgrounds within milliseconds, and a grandchild started before the
  assignment is outside the job; fence.py's peers measured it as "flaky rather than wrong, which is worse to diagnose".
- **Resume with ntdll's NtResumeProcess.** Rejected: undocumented; the Toolhelp walk is documented and already measured here.
- **Give Node a job object** through the core or a native addon. Rejected by the owner, 2026-11-10 ("core only"): the edit gates
  run from the core (ADR-136), and the Node runner remains only for `--batch` and the unbundled fallback.
- **Give `executeNodeCLI` a job as well.** Not here: no registered hook reaches it on Windows (the Codex review of this record
  found the artifact batch goes through `run()` instead), so it would be code no hook runs.
- **Keep the locked parity test byte-identical** by comparing the timeout scenarios only off Windows in the `both()` helper.
  Rejected: that hides the per-runner difference in a helper instead of asserting it. The locked body changes in its Windows
  branch only, through `adr-verify --relock --replace-hashes` as ADR-134 did, an exception the owner accepted with this record.

## Component / Boundary Impact

None — internal to the core's process handling (`core/hooks`). The Windows tree helper has one reason to change: how Windows
ends a process tree.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `winTreeOps`, `winAdopt`, `winEnd`, `winWatch` | new, internal | core/hooks/wintree.go (T1, T3) | shkRun (T2), bsRun (T3) |
| Windows stderr of a timed-out edit gate | "process cleanup could not be confirmed" no longer said when the job ended the tree | shkRun (T2) | the agent's session |
| tests/shell-hook-native.test.mjs timeout scenarios | split per runner on Windows | T2 | ADR-136 T2, T3, T4 locks (relocked) |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `winAdopt(ops, pid)` / `winEnd(ops, tree, pid)` | T1 | T2, T3 | No — new |

## Implementation

See `ADR-140-a-windows-gate-tree-ends-by-job/tasks/README.md`.

## Consequences

- **Positive:** a timed-out gate on Windows ends what it started, as it does on macOS and Linux; the hook stops saying cleanup
  could not be confirmed for the common MSYS shape.
- **Negative:** Windows-only kernel code whose live half can be run only on Windows (CI's job and peers); the core and the Node
  runner say different things on Windows for a timed-out gate.
- **Neutral:** taskkill stays as the fallback, so a host where jobs cannot be created behaves as today and says so.

## Out of Scope

- The Node runner's taskkill (`run-shell-hook.mjs`, `check-child.mjs`) (permanent: boundary: the owner chose core only, 2026-11-10; Node has no job-object API)
- `executeNodeCLI`'s taskkill (permanent: boundary: no registered hook reaches it on Windows; Decision 5)
- Kill-on-close when the core itself dies (permanent: boundary: Decision 4, the Unix runner has no such protection either)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A suspended child is never resumed | Low | High | winAdopt resumes whatever happened to the job and kills the child when it cannot; a fake that fails resume is tested |
| CI's runner job forbids nesting | Low | Med | Assignment fails, taskkill runs as today, and the native Windows assertion is red there, so it is seen at landing |
| MSYS asks to break away | Low | Med | No BREAKAWAY_OK is set, and the runtime asks only when the limits permit it; the Windows tests show a survivor |
| A git daemon is ended when its command returns | Low | Low | It is restarted on demand; the Unix group ends one that shares it the same way |

## Rollback

Revert the three tasks' commits: `shkEndTree` returns to taskkill alone, `bsRun` to its direct-child kill, and the parity test's
Windows split is relocked back. No state is persisted.

## Follow-ups

- [ ] A Windows peer runs the hang scenario through an installed core (ADR-131's outside run on Windows)
