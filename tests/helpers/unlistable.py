#!/usr/bin/env python3
"""Run a gate with one directory whose listing fails, on every platform (ADR-092 T2, T7).

Usage: python3 tests/helpers/unlistable.py <gate> <directory> [gate arguments...]

`chmod 000` does not stop a listing on Windows and does not stop one as root, so the walk's
listing seam (`record.walk`'s `list_dir`) is set instead: listing `<directory>` raises
`PermissionError`, every other directory lists as it does. The gate loads plugin/lib/record.py by
its own path and reuses a module already loaded from that path, so the patched `walk` is the one
it imports. Repository tooling only; this never ships.
"""
import importlib.util
import os
import runpy
import sys
from pathlib import Path

gate, failing, *arguments = sys.argv[1:]
record_file = os.path.join(os.path.dirname(os.path.dirname(os.path.realpath(gate))), "lib", "record.py")
spec = importlib.util.spec_from_file_location("record", record_file)
record = importlib.util.module_from_spec(spec)
sys.modules["record"] = record
spec.loader.exec_module(record)
target = os.path.realpath(failing)


def _failing_list_dir(directory):
    if os.path.realpath(directory) == target:
        raise PermissionError(13, "Permission denied (injected by tests/helpers/unlistable.py)", str(directory))
    return Path(directory).iterdir()


original = record.walk


def walk(root, pattern="*", is_link=record._is_link, unlisted=None, list_dir=None):
    return original(root, pattern, is_link, unlisted=unlisted, list_dir=_failing_list_dir)


record.walk = walk
sys.argv = [gate, *arguments]
runpy.run_path(gate, run_name="__main__")
