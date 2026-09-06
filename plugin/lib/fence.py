#!/usr/bin/env python3
"""The fence: run a child bounded, and kill its whole tree when the bound fires.

Shared by adr-verify, spec-verify and qh-mcp since 2026-09-06. Until then this
same code was COPIED into each gate, because a shared module under `plugin/bin/`
would have been read as a gate by the package tests — so every change was three
hunks, every test ran three times, and every catalogue entry existed three
times. The three copies were verified code-identical (docstrings stripped, same
AST) before they became this file. `plugin/lib/` is not `bin/`: the package test
enumerates gates from `bin/` alone, the standalone forwarders exec
`$root/bin/<gate>`, and each gate resolves this directory from its own path.

Everything here is process control that has to hold on Windows and POSIX alike:
`run_bounded`, the Job Object that is the Windows `killpg`, `kill_tree`, the
bounded drain, and the traces that say where a timeout's seconds went. The tests
drive this module through adr-verify — the call the defects came in through
(CLAUDE.md §4) — and prove the other two gates import the same object rather
than a copy.
"""
import os
import signal
import subprocess
import sys
import time

__all__ = [
    "last_error",
    "kernel32",
    "WindowsJob",
    "resume_suspended",
    "windows_job",
    "windows_processes",
    "RefusingAssignment",
    "descendants",
    "trace_survivors",
    "kill_tree",
    "trace_timeout",
    "drain_after_kill",
    "run_bounded",
]


def last_error(ctypes):
    """GetLastError where it exists. Windows-only in ctypes; None elsewhere, so the
    seam that drives these branches off-Windows does not raise inside the very
    report it is checking."""
    return getattr(ctypes, "get_last_error", lambda: None)()


def kernel32(ctypes, wintypes):
    """kernel32 with EVERY prototype this file uses declared, once.

    ⚠ The default restype is c_int, and a HANDLE is pointer-sized. The first
    draft declared the snapshot call only, and two Windows boxes independently
    found the consequence: GetCurrentProcess() came back as -1 instead of the
    all-ones pseudo-handle, IsProcessInJob failed with ERROR_INVALID_HANDLE, and
    because the trace sat inside `if IsProcessInJob(...)` the failure printed
    NOTHING — the third kernel32 call in this file whose failure the branch
    around it swallowed. So the rule is now mechanical rather than per-call:
    every function used below is declared here, and every call that can fail
    is checked where it is made. A peer measured the struct-size cousin too:
    Process32FirstW with the ANSI size returns 0 with ERROR_BAD_LENGTH and an
    EMPTY list, shaped exactly like the tasklist filter that never existed.
    """
    H, B, D = wintypes.HANDLE, wintypes.BOOL, wintypes.DWORD
    P = ctypes.POINTER
    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    for name, restype, argtypes in (
        ("GetCurrentProcess", H, []),
        ("IsProcessInJob", B, [H, H, P(B)]),
        ("CreateJobObjectW", H, [ctypes.c_void_p, wintypes.LPCWSTR]),
        ("SetInformationJobObject", B, [H, ctypes.c_int, ctypes.c_void_p, D]),
        ("AssignProcessToJobObject", B, [H, H]),
        ("TerminateJobObject", B, [H, wintypes.UINT]),
        ("CloseHandle", B, [H]),
        ("CreateToolhelp32Snapshot", H, [D, D]),
        ("QueryInformationJobObject", B, [H, ctypes.c_int, ctypes.c_void_p, D, P(D)]),
        ("Thread32First", B, [H, ctypes.c_void_p]),
        ("Thread32Next", B, [H, ctypes.c_void_p]),
        ("Process32FirstW", B, [H, ctypes.c_void_p]),
        ("Process32NextW", B, [H, ctypes.c_void_p]),
        ("OpenThread", H, [D, B, D]),
        ("ResumeThread", D, [H]),
    ):
        fn = getattr(k32, name)
        fn.restype, fn.argtypes = restype, argtypes
    return k32


class WindowsJob:
    """One Job Object around one fence — the Windows `killpg` (BACKLOG §123).

    `taskkill /F /T` walks the process tree from a pid, and a fence whose bash
    has already exited has no tree to walk: its backgrounded subshell is
    reparented, and on 2026-09-05 a real Windows 11 box showed exactly that —
    `tree before taskkill: leader 4732, children []`, taskkill answering non-zero
    on the dead pid, and the orphan running all 100 beats to completion while
    holding the pipe. A Job Object is membership, not ancestry: every process
    the fence starts inherits it however it is reparented, TerminateJobObject
    kills them all in one call, and KILL_ON_JOB_CLOSE means a gate that dies
    takes its fence with it instead of leaving the orphan this replaces.

    ⚠ THE SPAWN RACE IS CLOSED DELIBERATELY. Popen returns with the child already
    running, and bash backgrounds its subshell within milliseconds — a grandchild
    forked before AssignProcessToJobObject is outside the job, which is the very
    shape this exists to kill. So `run_bounded` starts the fence CREATE_SUSPENDED,
    this assigns it, and `resume` finds the primary thread through a toolhelp
    snapshot (Popen closes the thread handle it could have kept) and resumes it.
    A peer measured the alternative as "flaky rather than wrong, which is worse
    to diagnose", and that is why the order is fixed here rather than left to
    Popen. On a CI runner the gate itself is usually already inside a job;
    nested jobs are allowed since Windows 8, and IsProcessInJob is traced so one
    run says which case it was.
    """

    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000
    JobObjectExtendedLimitInformation = 9
    TH32CS_SNAPTHREAD = 0x4
    THREAD_SUSPEND_RESUME = 0x2

    def __init__(self, proc, started=None, k32=None):
        import ctypes
        from ctypes import wintypes
        self.ctypes, self.wintypes = ctypes, wintypes
        # Injectable so the FAILED arm of the probe below can be driven on any
        # host: it exists because that arm was silent, and a branch that exists
        # for that reason must be shown to speak.
        self.k32 = k32 or kernel32(ctypes, wintypes)
        self.pid = proc.pid
        inside = wintypes.BOOL()
        if self.k32.IsProcessInJob(self.k32.GetCurrentProcess(), None, ctypes.byref(inside)):
            trace_timeout(f"gate already inside a job: {bool(inside.value)} (nested job follows)",
                          started or time.monotonic())
        else:
            # A probe that fails must say so: this line was silent on two boxes
            # while the call behind it failed with ERROR_INVALID_HANDLE.
            trace_timeout(f"gate-in-job probe FAILED (GetLastError={last_error(ctypes)}); "
                          f"nesting unknown", started or time.monotonic())
        # Read before any kernel object exists: a Popen without _handle raises
        # here and leaks nothing, instead of after CreateJobObjectW.
        target = int(proc._handle)
        self.handle = self.k32.CreateJobObjectW(None, None)
        if not self.handle:
            raise OSError(last_error(ctypes), "CreateJobObjectW failed")
        self._kill_on_close()
        if not self.k32.AssignProcessToJobObject(self.handle, target):
            code = last_error(ctypes)
            self.k32.CloseHandle(self.handle)
            raise OSError(code, "AssignProcessToJobObject failed")

    def _kill_on_close(self):
        ctypes, wintypes = self.ctypes, self.wintypes

        class IO_COUNTERS(ctypes.Structure):
            _fields_ = [(name, ctypes.c_ulonglong) for name in (
                "ReadOperationCount", "WriteOperationCount", "OtherOperationCount",
                "ReadTransferCount", "WriteTransferCount", "OtherTransferCount")]

        class BASIC(ctypes.Structure):
            _fields_ = [("PerProcessUserTimeLimit", wintypes.LARGE_INTEGER),
                        ("PerJobUserTimeLimit", wintypes.LARGE_INTEGER),
                        ("LimitFlags", wintypes.DWORD),
                        ("MinimumWorkingSetSize", ctypes.c_size_t),
                        ("MaximumWorkingSetSize", ctypes.c_size_t),
                        ("ActiveProcessLimit", wintypes.DWORD),
                        ("Affinity", ctypes.c_size_t),
                        ("PriorityClass", wintypes.DWORD),
                        ("SchedulingClass", wintypes.DWORD)]

        class EXTENDED(ctypes.Structure):
            _fields_ = [("BasicLimitInformation", BASIC), ("IoInfo", IO_COUNTERS),
                        ("ProcessMemoryLimit", ctypes.c_size_t), ("JobMemoryLimit", ctypes.c_size_t),
                        ("PeakProcessMemoryUsed", ctypes.c_size_t), ("PeakJobMemoryUsed", ctypes.c_size_t)]

        info = EXTENDED()
        info.BasicLimitInformation.LimitFlags = self.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not self.k32.SetInformationJobObject(self.handle, self.JobObjectExtendedLimitInformation,
                                                ctypes.byref(info), ctypes.sizeof(info)):
            self.k32.CloseHandle(self.handle)
            raise OSError(last_error(ctypes), "SetInformationJobObject failed")

    def resume(self):
        """Resume every thread of the fence — the one it was created with. Raises on failure."""
        ctypes, wintypes = self.ctypes, self.wintypes

        class THREADENTRY32(ctypes.Structure):
            _fields_ = [("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD),
                        ("th32ThreadID", wintypes.DWORD), ("th32OwnerProcessID", wintypes.DWORD),
                        ("tpBasePri", wintypes.LONG), ("tpDeltaPri", wintypes.LONG),
                        ("dwFlags", wintypes.DWORD)]

        snap = self.k32.CreateToolhelp32Snapshot(self.TH32CS_SNAPTHREAD, 0)
        if snap == wintypes.HANDLE(-1).value:
            raise OSError(last_error(ctypes), "CreateToolhelp32Snapshot failed")
        resumed = 0
        try:
            entry = THREADENTRY32()
            entry.dwSize = ctypes.sizeof(entry)
            ok = self.k32.Thread32First(snap, ctypes.byref(entry))
            if not ok:
                raise OSError(last_error(ctypes), "Thread32First failed on the first call")
            while ok:
                if entry.th32OwnerProcessID == self.pid:
                    thread = self.k32.OpenThread(self.THREAD_SUSPEND_RESUME, False, entry.th32ThreadID)
                    if thread:
                        # ResumeThread answers the PREVIOUS suspend count, or
                        # DWORD(-1) on failure. A fence created suspended has 1;
                        # anything above that is still suspended after one call.
                        # The first draft discarded the answer and counted the
                        # thread as resumed either way (Codex review of b019c42).
                        previous = self.k32.ResumeThread(thread)
                        rounds = 0
                        while previous not in (0xFFFFFFFF, 0, 1) and rounds < 16:
                            previous = self.k32.ResumeThread(thread)
                            rounds += 1
                        self.k32.CloseHandle(thread)
                        if previous == 0xFFFFFFFF:
                            raise OSError(last_error(ctypes), f"ResumeThread failed for thread {entry.th32ThreadID}")
                        if previous not in (0, 1):
                            raise OSError(0, f"thread {entry.th32ThreadID} still suspended (count {previous})")
                        resumed += 1
                ok = self.k32.Thread32Next(snap, ctypes.byref(entry))
        finally:
            self.k32.CloseHandle(snap)
        if not resumed:
            raise OSError(0, f"no thread of {self.pid} found to resume")

    def terminate(self):
        """Kill every member. True only when the call itself succeeded."""
        return bool(self.k32.TerminateJobObject(self.handle, 1))

    def members(self):
        """Pids still in the job — survivors by MEMBERSHIP (BACKLOG §128).

        Ancestry cannot answer this. A process still holding the pipe after
        TerminateJobObject is either in the job (the kill did not take) or
        outside it (forked before assignment, or broke away), and those are
        different defects. Raises when the query fails, so the caller reports
        COULD NOT LIST rather than an empty job (ADR-005).
        """
        ctypes, wintypes = self.ctypes, self.wintypes
        JOB_OBJECT_BASIC_PROCESS_ID_LIST = 3
        capacity = 512

        class PROCESS_ID_LIST(ctypes.Structure):
            _fields_ = [("NumberOfAssignedProcesses", wintypes.DWORD),
                        ("NumberOfProcessIdsInList", wintypes.DWORD),
                        ("ProcessIdList", ctypes.c_size_t * capacity)]

        info = PROCESS_ID_LIST()
        if not self.k32.QueryInformationJobObject(self.handle, JOB_OBJECT_BASIC_PROCESS_ID_LIST,
                                                  ctypes.byref(info), ctypes.sizeof(info), None):
            raise OSError(last_error(ctypes), "QueryInformationJobObject failed")
        return [int(info.ProcessIdList[index]) for index in range(int(info.NumberOfProcessIdsInList))]

    def close(self):
        """Release the job handle. With KILL_ON_JOB_CLOSE this is also the last kill."""
        if self.handle:
            self.k32.CloseHandle(self.handle)
            self.handle = None


def resume_suspended(proc, k32=None):
    """Resume a CREATE_SUSPENDED child with no job to do it — the same snapshot walk."""
    job = WindowsJob.__new__(WindowsJob)
    import ctypes
    from ctypes import wintypes
    job.ctypes, job.wintypes, job.pid = ctypes, wintypes, proc.pid
    job.k32 = k32 or kernel32(ctypes, wintypes)
    job.resume()


def windows_job(proc, started=None, k32=None):
    """A job around a CREATE_SUSPENDED `proc`, resumed either way. NEVER RAISES.

    The fence was started suspended so the job could exist before it forks. It
    MUST be resumed whatever happens to the job: a fence left suspended is a
    hang wearing the timeout's name. If even that fails, the fence is killed so
    the gate reports UNRUN promptly instead of waiting out the timeout on a
    process that never ran.

    ⚠ QUALITY_HARNESS_JOB_UNAVAILABLE is the seam for the arm BELOW the job
    (BACKLOG §129). With it set, AssignProcessToJobObject is refused at the
    kernel32 boundary and everything after — the fallback resume, the taskkill
    kill, the streams left open — runs live. It exists because that arm had
    never executed on a real Windows host: every measured run took the job, and
    a stubbed test driving both arms is not the live fallback. The refusal is
    traced as INDUCED so a reader never mistakes a forced fallback for an
    observed one. A diagnostic; never set it where the gate is trusted.
    """
    started = started or time.monotonic()
    job = None
    try:
        if os.environ.get("QUALITY_HARNESS_JOB_UNAVAILABLE"):
            trace_timeout("QUALITY_HARNESS_JOB_UNAVAILABLE is set: AssignProcessToJobObject "
                          "will be refused (INDUCED, not observed)", started)
            if k32 is None:
                import ctypes
                from ctypes import wintypes
                k32 = kernel32(ctypes, wintypes)
            k32 = RefusingAssignment(k32)
        job = WindowsJob(proc, started, k32=k32)
        trace_timeout(f"job object holds {proc.pid}", started)
    except Exception as failure:
        trace_timeout(f"job object unavailable ({type(failure).__name__}: {failure}); "
                      f"falling back to taskkill", started)
    try:
        if job is not None:
            job.resume()
        else:
            resume_suspended(proc, k32=k32)
    except Exception as failure:
        trace_timeout(f"could not resume the suspended fence ({type(failure).__name__}: {failure}); "
                      f"killing it so this reports UNRUN now rather than after the timeout", started)
        try:
            proc.kill()
        except Exception:
            pass
    return job


def windows_processes():
    """Every process as (name, pid, parent pid), from one Toolhelp snapshot.

    ⚠ NO SUBPROCESS. The first two drafts of the §129 instrument spawned
    `tasklist` (with a filter it does not have) and then PowerShell/CIM — and a
    peer measured the second as 15s × (2 + children) worst case under the very
    flag someone sets to measure timing: an instrument able to out-hang the hang
    it explains. A snapshot is a syscall, ~4ms measured on Windows 11, and the
    same primitive `WindowsJob.resume` already uses. A row is reported, never
    interpreted: an interactive leader shows a conhost child, a spawned one does
    not, and neither is a survivor.
    """
    import ctypes
    from ctypes import wintypes
    k32 = kernel32(ctypes, wintypes)

    class PROCESSENTRY32W(ctypes.Structure):
        _fields_ = [("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD),
                    ("th32ProcessID", wintypes.DWORD), ("th32DefaultHeapID", ctypes.c_size_t),
                    ("th32ModuleID", wintypes.DWORD), ("cntThreads", wintypes.DWORD),
                    ("th32ParentProcessID", wintypes.DWORD), ("pcPriClassBase", wintypes.LONG),
                    ("dwFlags", wintypes.DWORD), ("szExeFile", wintypes.WCHAR * 260)]

    snap = k32.CreateToolhelp32Snapshot(0x2, 0)
    if snap == wintypes.HANDLE(-1).value:
        raise OSError(last_error(ctypes), "CreateToolhelp32Snapshot failed")
    found = []
    try:
        entry = PROCESSENTRY32W()
        entry.dwSize = ctypes.sizeof(entry)
        ok = k32.Process32FirstW(snap, ctypes.byref(entry))
        if not ok:
            # ERROR_BAD_LENGTH (24) here means dwSize is not the WIDE struct.
            raise OSError(last_error(ctypes), "Process32FirstW failed on the first call")
        while ok:
            found.append((entry.szExeFile, int(entry.th32ProcessID), int(entry.th32ParentProcessID)))
            ok = k32.Process32NextW(snap, ctypes.byref(entry))
    finally:
        k32.CloseHandle(snap)
    return found


class RefusingAssignment:
    """kernel32 whose AssignProcessToJobObject answers 0 with ERROR_ACCESS_DENIED.

    The §129 seam, at the API boundary and nowhere higher: every other call
    reaches the real kernel32, so what runs after the refusal is the live
    fallback rather than a stub of it. ERROR_ACCESS_DENIED (5) is what Windows
    answers when a process may not join a nested job — the real shape of "job
    unavailable" on a host where it happens.
    """

    ERROR_ACCESS_DENIED = 5

    def __init__(self, real):
        self._real = real

    def __getattr__(self, name):
        return getattr(self._real, name)

    def AssignProcessToJobObject(self, job, process):
        import ctypes
        setter = getattr(ctypes, "set_last_error", None)
        if setter is not None:
            setter(self.ERROR_ACCESS_DENIED)
        return 0


def descendants(pid, rows):
    """Everything below PID in a snapshot, as (name, pid), by walking parents.

    `rows` are (name, pid, parent) as `windows_processes` reports them. Pure,
    so the walk runs on any host. A pid already found is never re-added, so a
    process that is its own parent (the idle process) or a parent pid that was
    reused cannot loop it. Reported, never interpreted.
    """
    wanted = {pid}
    found = []
    remaining = list(rows)
    grew = True
    while grew:
        grew = False
        rest = []
        for name, cpid, parent in remaining:
            if parent in wanted and cpid not in wanted:
                wanted.add(cpid)
                found.append((name, cpid))
                grew = True
            else:
                rest.append((name, cpid, parent))
        remaining = rest
    return found


def trace_survivors(pid, job, processes, started):
    """Name what is still alive after a drain timed out, on request (BACKLOG §128).

    The CI runner sat at 60s on byte-identical code and nothing ever said which
    process was holding the pipe. Two listings, each its own observation with
    its own could-not-look (ADR-005): the tree below the fence by ancestry, and
    the job's members by membership. A holder in the first and not the second
    forked before assignment or broke away; one in the second is a kill that
    did not take; one in neither is not a process this gate started. Off by
    default like every trace here.
    """
    traced = bool(os.environ.get("QUALITY_HARNESS_TRACE_TIMEOUT"))
    if not traced:
        return
    try:
        trace_timeout(f"drain timeout survivors below {pid} by ancestry: {descendants(pid, processes())}", started)
    except Exception as failure:
        trace_timeout(f"drain timeout survivors below {pid} by ancestry: COULD NOT LIST "
                      f"({type(failure).__name__}: {failure})", started)
    if job is None:
        trace_timeout("drain timeout survivors by job membership: no job", started)
        return
    try:
        trace_timeout(f"drain timeout survivors by job membership: {job.members()}", started)
    except Exception as failure:
        trace_timeout(f"drain timeout survivors by job membership: COULD NOT LIST "
                      f"({type(failure).__name__}: {failure})", started)


def kill_tree(pid, platform=None, run=subprocess.run, timeout=15, job=None, processes=None):
    """Kill PID and everything it started (BACKLOG §120). NEVER RAISES.

    `subprocess.run(timeout=)` kills its direct child and nothing else. A fence
    runs through bash, so the real work — a test runner, a mutation campaign —
    is a grandchild, and on 2026-09-04 one ran on with PPID 1 for minutes after
    the sweep had filed its claim as unrunnable, rewriting this very file. A
    timeout that reports "stopped" while the work continues is a false verdict,
    not a slow one.

    ⚠ `killpg(pid)`, NOT `killpg(getpgid(pid))`. `start_new_session=True` makes
    the child a session leader, so its process group id IS its pid — and the
    lookup is not merely redundant, it defeats the whole thing for the ordinary
    shell pattern `work &`: the leader exits at once, `getpgid` raises
    ProcessLookupError for a reaped pid, and the group that is still holding the
    pipe is never signalled. Measured 2026-09-04 (Codex review of a46973e):
    `bash -c 'sleep 3 &'` at a 0.3s timeout took **3.02s** through the lookup and
    **0.31s** without it. The tests missed it because their fence keeps bash
    alive in the foreground, which is the case the lookup happens to survive.

    ⚠ IT NEVER RAISES, and that is not defensiveness. It runs while another
    exception is in flight; one raised here REPLACES that exception, and the
    caller then reports the wrong thing — measured in the same review, a
    PermissionError from this function reached `qh-mcp`'s `except OSError` arm
    and a gate that ran and timed out was reported as one that *did not start*
    (ADR-005's exact class).

    `platform` and `run` are the seam (CLAUDE.md §7): the Windows branch is
    exercised on every host by injecting both, and taskkill is never spawned
    where it does not exist. Shared from plugin/lib/fence.py since 2026-09-06;
    until then this was copied verbatim into spec-verify and qh-mcp, because a
    shared module under bin/ would have been read as a gate by the package tests.

    RETURNS whether the kill was OBSERVED to work. False is not "it failed", it
    is "nothing here saw it work" — taskkill answering non-zero, killpg raising,
    an injected runner that reports nothing. A caller that prints "was killed"
    on a False has reported an observation it did not make, which is the one
    thing CLAUDE.md §3 forbids a gate to do. BACKLOG §123 is why the distinction
    is not theoretical: the tree kill is proved on macOS, unproved on Linux, and
    does not work on a Git Bash tree at all.
    """
    processes = windows_processes if processes is None else processes
    try:
        if (platform or os.name) == "nt":
            # BACKLOG §123. Membership first, ancestry second: a job kills the
            # reparented subshell taskkill cannot see. When the job answers, the
            # tree is gone and taskkill would only report a dead pid.
            if job is not None and job.terminate():
                if os.environ.get("QUALITY_HARNESS_TRACE_TIMEOUT"):
                    sys.stderr.write(f"[trace-timeout] job object terminated the tree of {pid}\n")
                return True
            # BOUNDED. `taskkill` is a process like any other and can itself hang;
            # unbounded here it wears the fence timeout's name, and on 2026-09-04
            # a Windows job sat on this exact test to its 60s cap while every
            # other platform passed. TimeoutExpired lands in the `except` below
            # and answers False — not confirmed, which is the honest verdict.
            # BACKLOG §129. Under the trace flag, name what is there to kill and
            # what is left after — the CI runner sometimes leaves a survivor and
            # nothing so far has said which process it was. One snapshot before,
            # one after, matched on (name, pid) so a reused pid is not read as
            # a survivor; no subprocess, so no timeout to multiply (see
            # windows_processes). A snapshot that fails SAYS so: the first
            # draft's listing failed silently and reported no children for ever.
            traced = bool(os.environ.get("QUALITY_HARNESS_TRACE_TIMEOUT"))
            before = []
            if traced:
                try:
                    before = [(name, cpid) for name, cpid, parent in processes() if parent == pid]
                    sys.stderr.write(f"[trace-timeout] tree before taskkill: leader {pid}, children {before}\n")
                except Exception as failure:
                    sys.stderr.write(f"[trace-timeout] tree before taskkill: COULD NOT LIST ({type(failure).__name__}: {failure})\n")
            done = run(["taskkill", "/F", "/T", "/PID", str(pid)],
                       capture_output=True, timeout=timeout)
            if traced:
                try:
                    now = {(name, cpid) for name, cpid, parent in processes()}
                    alive = [child for child in before if child in now]
                    sys.stderr.write(f"[trace-timeout] tree after taskkill: rc="
                                     f"{getattr(done, 'returncode', None)}, still alive {alive}\n")
                except Exception as failure:
                    sys.stderr.write(f"[trace-timeout] tree after taskkill: COULD NOT LIST ({type(failure).__name__}: {failure})\n")
            return getattr(done, "returncode", None) == 0
        os.killpg(pid, signal.SIGKILL)
        return True
    except Exception:
        return False


def trace_timeout(label, started):
    """Attribute a timeout's seconds, on request (BACKLOG §128).

    Three Windows CI runs sat at ~60s against a 1s fence timeout, and the
    arithmetic of the bounds below (1s + 15s + 10s) does not reach 60. A hang
    nobody can attribute is a hang nobody can fix, so with
    QUALITY_HARNESS_TRACE_TIMEOUT set every phase of the cleanup stamps stderr
    with its offset from the moment the fence was started. Off by default; a
    diagnostic, never a verdict.
    """
    if not os.environ.get("QUALITY_HARNESS_TRACE_TIMEOUT"):
        return
    try:
        sys.stderr.write(f"[trace-timeout] {label} +{round((time.monotonic() - started) * 1000)}ms\n")
        sys.stderr.flush()
    except Exception:  # a diagnostic must never replace the timeout it describes
        # The first call sits INSIDE the TimeoutExpired handler, before the tree
        # is killed. A closed or broken stderr raising here would replace that
        # exception and leave the fence running — a trace turning into the
        # defect it exists to explain. Found by the Codex review of df8740a.
        pass


def drain_after_kill(proc, platform, grace=10, started=None, job=None, processes=None):
    """Kill the tree and collect what it wrote, bounded, without raising.

    Bounded because a descendant that made a session of its own escapes the
    group kill and can hold the pipe open for ever; unbounded here, that hang
    would wear the timeout's name. What it could not collect is None, which
    every reader of a TimeoutExpired here already handles.

    Returns `(stdout, stderr, killed)`. `killed` is `kill_tree`'s own answer,
    carried rather than assumed, so the caller that prints the verdict can say
    what was observed instead of asserting a kill nobody checked.

    ⚠ ON WINDOWS THE STREAMS ARE NOT CLOSED HERE, and that is BACKLOG §128.
    `Popen.communicate(timeout=)` on Windows reads each pipe from a daemon
    thread, and when it times out that thread is still blocked in the read,
    HOLDING the BufferedReader's lock. `stream.close()` takes the same lock, so
    it waits until the read returns — which is when the orphan lets go of the
    pipe. The test fence sleeps 60s; the earlier fence beat for 20s; the two
    measured hangs were 60.1s and 21.9s. Reproduced on macOS with a bare pipe
    and a reading thread: close() blocked until the writer went away. POSIX
    `communicate` uses selectors and holds no such lock, which is why only
    Windows hung. Left open, the handles die with the interpreter. Measured on
    CPython 3.14.7 (macOS): the interpreter exited cleanly, exit 2, with such a
    thread still blocked; two Windows 11 boxes exited 2 as well. If finalization
    ever does contend for that lock, CPython waits one second and then aborts
    with a fatal error (bufferedio.c, `_enter_buffered_busy`) — bounded either
    way, which is why the exit code is asserted rather than assumed.
    """
    started = time.monotonic() if started is None else started
    killed = False
    trace_timeout("kill_tree start", started)
    try:
        killed = kill_tree(proc.pid, platform, job=job)
        trace_timeout(f"kill_tree end confirmed={killed}", started)
        out, err = proc.communicate(timeout=grace)
        trace_timeout("drain communicate returned", started)
        return out, err, killed
    except Exception as failure:
        trace_timeout(f"drain communicate {type(failure).__name__}", started)
        # BACKLOG §128: the one moment the survivor can be named is now, while
        # it is still holding the pipe. Windows only — POSIX closes the streams
        # below and has no job to ask.
        #
        # ⚠ BaseException, not Exception, and the guard is not decoration. This
        # runs while a TimeoutExpired is in flight, so anything escaping here
        # REPLACES it and the caller reports a gate that did not start rather
        # than one that timed out — ADR-005's exact class, and the reason
        # kill_tree carries a NEVER RAISES contract. Two paths escape the inner
        # handlers, which catch Exception: an injected processes() or a job
        # whose members() raises outside Exception, and a failure whose __str__
        # raises while the COULD NOT LIST message is being built (Codex review,
        # 2026-09-06).
        if (platform or os.name) == "nt":
            try:
                trace_survivors(proc.pid, job, windows_processes if processes is None else processes, started)
            except BaseException:
                pass
        if (platform or os.name) != "nt":
            for stream in (proc.stdout, proc.stderr, proc.stdin):
                if stream is not None:
                    try:
                        stream.close()
                    except Exception:
                        pass
        trace_timeout("drain streams released", started)
        return None, None, killed


def run_bounded(argv, *, timeout, platform=None, job_factory=None, **popen):
    """`subprocess.run(argv, timeout=…)` whose timeout reaches the whole tree.

    The child starts in its own session (POSIX) or process group (Windows) so
    `kill_tree` has something to address. On `TimeoutExpired` the tree is
    killed, whatever the child had written is collected, and the exception is
    re-raised carrying it. Every other keyword goes to Popen unchanged —
    `capture_output` included, spelled out here because Popen does not take it.

    Two deliberate differences from `subprocess.run`, both narrower than they
    look. It does NOT use `with Popen(...)`: that block's exit waits on the
    child with no bound, so a cleanup that failed to kill anything turned the
    timeout into a hang (measured 3.41s against a 0.3s timeout). And on POSIX,
    `subprocess.run` leaves the raw BYTES it had buffered on a text-mode
    `TimeoutExpired` while this leaves decoded text; `decode_stream` accepts
    either, and the difference is stated here rather than claimed away.
    """
    platform = platform or os.name
    if popen.pop("capture_output", False):
        popen["stdout"] = popen["stderr"] = subprocess.PIPE
    if platform == "nt":
        popen["creationflags"] = (popen.get("creationflags", 0)
                                  | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x200))
    else:
        popen["start_new_session"] = True
    factory = windows_job if job_factory is None else job_factory
    if platform == "nt" and factory is windows_job:
        # Started SUSPENDED so the job exists before the fence can fork; see
        # WindowsJob. An injected factory (tests) gets a running child.
        popen["creationflags"] = popen.get("creationflags", 0) | 0x4
    proc = subprocess.Popen(argv, **popen)
    started = time.monotonic()
    job = None
    try:
        # The job is membership; it has to exist before the fence forks anything —
        # and it is created INSIDE this try, so a Ctrl-C between the spawn and
        # communicate still reaches the cleanup below instead of escaping with a
        # suspended fence behind it (Codex review of b019c42).
        job = factory(proc, started) if platform == "nt" else None
        out, err = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        trace_timeout(f"fence timeout after {timeout}s", started)
        out, err, killed = drain_after_kill(proc, platform, started=started, job=job)
        expired = subprocess.TimeoutExpired(argv, timeout, output=out, stderr=err)
        # The cleanup's own answer travels ON the exception because the code
        # that prints the verdict is nowhere near the code that did the killing.
        expired.tree_killed = killed
        raise expired from None
    except BaseException:
        # subprocess.run kills its child on ANY exception — a Ctrl-C turned
        # into KeyboardInterrupt, a SystemExit — so that a gate being stopped
        # does not leave its fence behind.
        drain_after_kill(proc, platform, job=job)
        raise
    finally:
        # A job handle is a kernel object. Closing it is what KILL_ON_JOB_CLOSE
        # keys on, and a long-lived qh-mcp would otherwise keep one per fence.
        if job is not None:
            try:
                job.close()
            except Exception:
                pass
    return subprocess.CompletedProcess(argv, proc.returncode, out, err)
