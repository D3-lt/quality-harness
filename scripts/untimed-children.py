#!/usr/bin/env python3
"""Every child a shipped gate spawns carries a timeout — enumerated, not remembered.

BACKLOG §130. A standing rule from the owner, set after two hook children from
another project hung in regex backtracking for 15.5 hours at 90% of a core each,
reparented to launchd, found by a hot laptop rather than by any test output.
This walks the AST of every gate under plugin/bin and reports each call to
subprocess.run / call / check_call / check_output / Popen that names no
`timeout=`. Popen inside `run_bounded` is the one exemption: that helper is the
bound (its communicate carries the timeout and its cleanup kills the tree).

REPOSITORY TOOLING, never shipped. Exit 1 with one line per finding, exit 0
with none — and tests/untimed-children.test.mjs shows it returning dirty on a
fixture before it is trusted to return clean on the tree (CLAUDE.md §4).

`--hidden` asks the Windows question of the same calls: does each pass `**NO_WINDOW`
(record.py) or `creationflags`? A gate a hook starts has no console, so a child
without CREATE_NO_WINDOW gets a console window of its own, which Windows Terminal
opens as a tab that flashes (reported on 3.1.0, 2026-09-28). `run_bounded` sets it
in the flags it builds, so it stays the one exemption here too.
"""
import ast
import pathlib
import sys

CALLS = {"run", "call", "check_call", "check_output", "Popen"}


def subprocess_calls(source):
    """(call node, method, enclosing function) for every subprocess call but run_bounded's Popen."""
    tree = ast.parse(source)
    enclosing = {}
    for fn in ast.walk(tree):
        if isinstance(fn, ast.FunctionDef):
            for node in ast.walk(fn):
                enclosing.setdefault(id(node), fn.name)
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
            continue
        if not (isinstance(node.func.value, ast.Name) and node.func.value.id == "subprocess"):
            continue
        if node.func.attr not in CALLS:
            continue
        where = enclosing.get(id(node), "<module>")
        if node.func.attr == "Popen" and where == "run_bounded":
            continue
        yield node, node.func.attr, where


def untimed(source, label):
    """(label, line, call, enclosing function) for every call with no timeout."""
    return [(label, node.lineno, attr, where) for node, attr, where in subprocess_calls(source)
            if not any(k.arg == "timeout" for k in node.keywords)]


def unhidden(source, label):
    """(label, line, call, enclosing function) for every call that would show a window on Windows."""
    def hidden(keyword):
        return keyword.arg == "creationflags" or (
            keyword.arg is None and isinstance(keyword.value, ast.Name) and keyword.value.id == "NO_WINDOW")
    return [(label, node.lineno, attr, where) for node, attr, where in subprocess_calls(source)
            if not any(hidden(k) for k in node.keywords)]


def main(argv):
    hidden_mode = "--hidden" in argv
    argv = [a for a in argv if a != "--hidden"]
    paths = [pathlib.Path(p) for p in argv] or sorted(pathlib.Path("plugin/bin").iterdir()) + sorted(pathlib.Path("plugin/lib").glob("*.py"))
    check = unhidden if hidden_mode else untimed
    findings = []
    for path in paths:
        if path.suffix == ".cmd" or not path.is_file():
            continue
        try:
            findings.extend(check(path.read_text(encoding="utf-8"), str(path)))
        except SyntaxError:
            continue
    for label, line, call, where in findings:
        what = "passes neither **NO_WINDOW nor creationflags" if hidden_mode else "names no timeout"
        print(f"{label}:{line}: subprocess.{call} in {where}() {what}")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
