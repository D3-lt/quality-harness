"""Wait for exactly one owned process group; stdout is an IPC receipt, never child output."""
import errno
import json
import os
import resource
import signal
import subprocess
import sys
import time


def main():
    request = json.load(sys.stdin)
    result = {"status": None, "signal": None, "timedOut": False, "error": None,
              "stdout": "", "stderr": "", "pid": None, "startedAt": None, "endedAt": None,
              "resources": {"userCpuMs": None, "systemCpuMs": None, "peakMemoryBytes": None,
                            "cpuScope": "unknown", "coverage": "unknown"}}
    before = resource.getrusage(resource.RUSAGE_CHILDREN)
    try:
        child = subprocess.Popen([request["file"], *request["args"]], cwd=request["cwd"],
                                 env=request["env"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, start_new_session=True)
    except OSError as error:
        result["error"] = errno.errorcode.get(error.errno, "EXECUTION_ERROR")
    else:
        result["pid"] = child.pid
        result["startedAt"] = int(time.time() * 1000)
        try:
            out, err = child.communicate(request["input"].encode("utf-8"), timeout=request["timeoutMs"] / 1000)
        except subprocess.TimeoutExpired as timeout:
            result["timedOut"] = True
            result["error"] = "ETIMEDOUT"
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            try:
                out, err = child.communicate(timeout=2)
            except subprocess.TimeoutExpired as remaining:
                # Detached work can retain a pipe. It is outside this waited subtree;
                # close our descriptors and leave that coverage explicitly partial.
                out, err = remaining.output or timeout.output or b"", remaining.stderr or timeout.stderr or b""
                for stream in (child.stdin, child.stdout, child.stderr):
                    if stream:
                        stream.close()
                child.wait(timeout=1)
        result["stdout"] = out.decode("utf-8", errors="replace")
        result["stderr"] = err.decode("utf-8", errors="replace")
        result["endedAt"] = int(time.time() * 1000)
        if child.returncode < 0:
            result["signal"] = signal.Signals(-child.returncode).name
        elif not result["timedOut"]:
            result["status"] = child.returncode
        usage = resource.getrusage(resource.RUSAGE_CHILDREN)
        peak = usage.ru_maxrss
        if sys.platform.startswith("linux"):
            peak *= 1024
        elif sys.platform != "darwin":
            peak = None
        result["resources"] = {"userCpuMs": (usage.ru_utime - before.ru_utime) * 1000,
                               "systemCpuMs": (usage.ru_stime - before.ru_stime) * 1000,
                               "peakMemoryBytes": peak, "cpuScope": "waited-subtree", "coverage": "partial"}
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
