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
import subprocess
import os
import runpy
import sys

ACTIVE = True
OPENED, LISTED, STATTED, RAN = {}, {}, {}, []
# The environment variables the gate read (name -> value, or None when unset), and whether it read the whole environment.
ENVREAD, ENV_ALL = {}, []
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
        info = (_REAL_STAT if follow else _REAL_LSTAT)(path)
    except OSError:
        return None
    top = info.st_mode & 0o170000
    # A file is recorded with the size and modification time it had: a gate that stats a file reads them, and "it is a file" was not
    # all it saw. A directory's own modification time moves with every entry written in it, so it is a kind and nothing more.
    if top == 0o100000:
        return "file:%d:%d" % (info.st_size, info.st_mtime_ns)
    return "dir" if top == 0o040000 else "link" if top == 0o120000 else "other"


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
                # scandir hands out entries that answer is_dir() and stat() without another call from the gate.
                if event == "os.scandir":
                    for name in LISTED[path]:
                        STATTED.setdefault(os.path.join(path, name), _kind(os.path.join(path, name)))
            except OSError:
                LISTED[path] = None
            finally:
                ACTIVE = True
    elif event == "os.system":
        RAN.append({"argv": None, "line": os.fsdecode(args[0]), "cwd": os.getcwd()})
    elif event in ("os.exec", "os.spawn", "os.fork", "os.forkpty"):
        # A child whose command is not visible here: recorded as one that cannot be run again, so the answer is not kept.
        RAN.append({"argv": None, "line": None, "cwd": os.getcwd()})
    # A subprocess is recorded where it is asked for (see _recorded), not from this event: on Windows the event carries the command
    # already joined into one string, which cannot be run again as the list the gate passed.


def _recorded(original):
    def init(self, args, *rest, **named):
        if ACTIVE:
            try:
                shell = named.get("shell", rest[7] if len(rest) > 7 else False)
                cwd = named.get("cwd", rest[8] if len(rest) > 8 else None)
                env = named.get("env", rest[9] if len(rest) > 9 else None)
                executable = named.get("executable", rest[1] if len(rest) > 1 else None)
                stdin = named.get("stdin", rest[2] if len(rest) > 2 else None)
                where = _text(cwd) if cwd else os.getcwd()
                if env is not None or executable is not None or stdin not in (None, subprocess.DEVNULL):
                    # Its environment, its program or its input is not kept, so it cannot be run again as it was asked for: recorded
                    # as such, and the answer is not kept.
                    RAN.append({"argv": None, "line": None, "cwd": where})
                elif isinstance(args, (list, tuple)) and not shell:
                    RAN.append({"argv": [os.fsdecode(part) for part in args], "line": None, "cwd": where})
                elif isinstance(args, (str, bytes)) and (shell or os.name == "nt"):
                    RAN.append({"argv": None, "line": os.fsdecode(args), "cwd": where})
                elif isinstance(args, (str, bytes)):
                    # POSIX without a shell: a string is the name of the program and nothing else.
                    RAN.append({"argv": [os.fsdecode(args)], "line": None, "cwd": where})
                else:
                    RAN.append({"argv": None, "line": None, "cwd": where})
            except Exception:
                RAN.append({"argv": None, "line": None, "cwd": os.getcwd()})
        return original(self, args, *rest, **named)
    return init


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


def _watched(environ):
    cls = type(environ)
    real_getitem, real_iter = cls.__getitem__, cls.__iter__

    def getitem(self, key):
        try:
            value = real_getitem(self, key)
        except KeyError:
            if ACTIVE and self is environ and isinstance(key, str):
                ENVREAD.setdefault(key, None)
            raise
        if ACTIVE and self is environ and isinstance(key, str):
            ENVREAD.setdefault(key, value)
        return value

    def iterate(self):
        if ACTIVE and self is environ:
            ENV_ALL.append(True)
        return real_iter(self)

    cls.__getitem__, cls.__iter__ = getitem, iterate


def main(argv):
    global ACTIVE
    if len(argv) < 3:
        sys.stderr.write("usage: trace_run.py <manifest-file> <gate> [arguments...]\n")
        return 2
    manifest, gate, rest = argv[1], os.path.abspath(argv[2]), argv[3:]
    sys.addaudithook(_audit)
    _watched(os.environ)
    subprocess.Popen.__init__ = _recorded(subprocess.Popen.__init__)
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
            "env": ENVREAD,
            "env_all": bool(ENV_ALL),
            "blind": ["a read through a file descriptor passed in", "a stat made below Python"],
        }
        # A manifest that cannot be written must not change what the gate returned: its exit status and output are the gate's.
        try:
            with open(manifest, "w", encoding="utf-8") as handle:
                json.dump(record, handle)
        except OSError:
            pass
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv))
