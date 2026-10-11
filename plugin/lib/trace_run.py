#!/usr/bin/env python3
"""Run a gate and write down everything it read (ADR-095 T6).

    trace_run.py <manifest-file> <gate> [gate arguments...]

The gate runs exactly as it would alone: its stdout, stderr and exit code pass through, and its own `sys.argv` is
`[gate, arguments...]`. Beside it, an audit hook records every file it opens (with the size and modification time it had when it
was opened), every directory it lists (with the names it listed) and every subprocess it starts, and wrappers on `os.stat`,
`os.lstat` and the `os.path` predicates record every path it asked about and whether it was there. The manifest is JSON written
when the gate ends, however it ends. Every module the gate imported is recorded too, by its source file, because the import
machinery trusts a compiled copy after a stat of its own that nothing here can see.

What this does NOT see is named in the manifest's `blind` list rather than left to be assumed: a read through a file descriptor
passed in, and a stat made below Python. A cache that reuses an answer is only as sound as this list is short.
"""
import json
import os
import runpy
import sys

ACTIVE = True
OPENED, LISTED, STATTED, RAN = {}, {}, {}, []
_REAL_STAT = os.stat
_REAL_LSTAT = os.lstat
_REAL_LISTDIR = os.listdir


def _text(path):
    try:
        return os.path.abspath(os.fsdecode(path))
    except (TypeError, ValueError):
        return None


def _kind(path, follow=True):
    try:
        mode = (_REAL_STAT if follow else _REAL_LSTAT)(path).st_mode
    except OSError:
        return None
    top = mode & 0o170000
    return "dir" if top == 0o040000 else "link" if top == 0o120000 else "file" if top == 0o100000 else "other"


def _signature(path):
    try:
        info = _REAL_STAT(path)
    except OSError:
        return None
    return [info.st_size, info.st_mtime_ns]


def _audit(event, args):
    global ACTIVE
    if not ACTIVE:
        return
    if event == "open":
        if isinstance(args[0], (str, bytes, os.PathLike)):
            path = _text(args[0])
            if path and path not in OPENED:
                ACTIVE = False
                try:
                    OPENED[path] = _signature(path)
                finally:
                    ACTIVE = True
    elif event in ("os.listdir", "os.scandir"):
        raw = args[0] if args and isinstance(args[0], (str, bytes, os.PathLike)) else "."
        path = _text(raw)
        if path and path not in LISTED:
            ACTIVE = False
            try:
                LISTED[path] = sorted(os.fsdecode(name) for name in _REAL_LISTDIR(path))
            except OSError:
                LISTED[path] = None
            finally:
                ACTIVE = True
    elif event == "subprocess.Popen":
        # (executable, args, cwd, env)
        command = [os.fsdecode(part) for part in (args[1] or [args[0]])]
        RAN.append({"argv": command, "cwd": _text(args[2]) if args[2] else os.getcwd()})


def _noted(path):
    target = _text(path) if isinstance(path, (str, bytes, os.PathLike)) else None
    if target and ACTIVE and target not in STATTED:
        STATTED[target] = _kind(target)
    return target


def _traced(real):
    def inner(path, *rest, **named):
        _noted(path)
        return real(path, *rest, **named)
    return inner


def _prefixes():
    import sysconfig
    found = {sys.prefix, sys.base_prefix, sys.exec_prefix, sys.base_exec_prefix}
    for name in ("stdlib", "platstdlib", "purelib", "platlib"):
        value = sysconfig.get_paths().get(name)
        if value:
            found.add(value)
    return sorted({os.path.realpath(item) for item in found if item} | {item for item in found if item})


def _modules():
    sources = set()
    for module in list(sys.modules.values()):
        name = getattr(module, "__file__", None)
        if not isinstance(name, str):
            continue
        if name.endswith((".pyc", ".pyo")):
            try:
                import importlib.util
                name = importlib.util.source_from_cache(name)
            except (ValueError, NotImplementedError):
                continue
        sources.add(os.path.abspath(name))
    return sources


def main(argv):
    global ACTIVE
    if len(argv) < 3:
        sys.stderr.write("usage: trace_run.py <manifest-file> <gate> [arguments...]\n")
        return 2
    manifest, gate, rest = argv[1], os.path.abspath(argv[2]), argv[3:]
    sys.addaudithook(_audit)
    os.stat = _traced(os.stat)
    os.lstat = _traced(os.lstat)
    # On POSIX os.path.exists and the other predicates go through os.stat, so the wrapper above already sees them; these are wrapped
    # too for an interpreter whose predicates do not (a C fast path). Unproven here: no mutant tells the two apart on this platform.
    for name in ("exists", "lexists", "isdir", "isfile", "islink"):
        if hasattr(os.path, name):
            setattr(os.path, name, _traced(getattr(os.path, name)))
    code = 0
    sys.argv = [gate, *rest]
    try:
        runpy.run_path(gate, run_name="__main__")
    except SystemExit as stop:
        code = stop.code if isinstance(stop.code, int) else (0 if stop.code is None else 1)
        if isinstance(stop.code, str):
            sys.stderr.write(stop.code + "\n")
    finally:
        ACTIVE = False
        sys.stdout.flush()
        opened = dict(OPENED)
        for source in _modules():
            opened.setdefault(source, _signature(source))
        record = {
            "gate": gate,
            "python": {"executable": os.path.realpath(sys.executable), "version": sys.version},
            "prefixes": _prefixes(),
            "pycache": sys.pycache_prefix,
            "opened": opened,
            "listed": LISTED,
            "statted": STATTED,
            "ran": RAN,
            "blind": ["a read through a file descriptor passed in", "a stat made below Python"],
        }
        with open(manifest, "w", encoding="utf-8") as handle:
            json.dump(record, handle)
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv))
