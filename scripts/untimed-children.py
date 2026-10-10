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

`--hidden` asks the Windows question of the same calls, and it has two halves. A
call whose output is redirected should pass `**NO_WINDOW` (record.py), or
creationflags naming CREATE_NO_WINDOW, so no console window opens for it. A call
that shares the gate's stdio must NOT: with no handles passed, a child started
with that flag gets a console of its own and everything it prints is lost, which
is how qh-check printed nothing on Windows at 2b036de. libuv draws the same line
for Node's windowsHide. A parameter whose default is a subprocess call (`run=
subprocess.run`) is read as that call, since that is what runs.
"""
import ast
import pathlib
import sys

CALLS = {"run", "call", "check_call", "check_output", "Popen"}
# Any of these gives the child explicit handles, which is what CREATE_NO_WINDOW needs.
IO = {"stdin", "stdout", "stderr", "capture_output", "input"}


def runner_aliases(tree):
    """{function name: {parameter: call}} for parameters that default to subprocess.<call>."""
    aliases = {}
    for fn in ast.walk(tree):
        if not isinstance(fn, ast.FunctionDef):
            continue
        args = fn.args
        positional = args.posonlyargs + args.args
        pairs = list(zip(positional[len(positional) - len(args.defaults):], args.defaults))
        pairs += [(arg, default) for arg, default in zip(args.kwonlyargs, args.kw_defaults) if default is not None]
        for arg, default in pairs:
            if (isinstance(default, ast.Attribute) and isinstance(default.value, ast.Name)
                    and default.value.id == "subprocess" and default.attr in CALLS):
                aliases.setdefault(fn.name, {})[arg.arg] = default.attr
    return aliases


def subprocess_calls(source):
    """(call node, method, enclosing function) for every subprocess call but run_bounded's Popen."""
    tree = ast.parse(source)
    enclosing = {}
    for fn in ast.walk(tree):
        if isinstance(fn, ast.FunctionDef):
            for node in ast.walk(fn):
                enclosing.setdefault(id(node), fn.name)
    aliases = runner_aliases(tree)
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        where = enclosing.get(id(node), "<module>")
        if (isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name)
                and node.func.value.id == "subprocess" and node.func.attr in CALLS):
            attr = node.func.attr
        elif isinstance(node.func, ast.Name) and node.func.id in aliases.get(where, {}):
            attr = aliases[where][node.func.id]
        else:
            continue
        if attr == "Popen" and where == "run_bounded":
            continue
        yield node, attr, where


def untimed(source, label):
    """(label, line, call, enclosing function, why) for every call with no timeout."""
    return [(label, node.lineno, attr, where, "names no timeout") for node, attr, where in subprocess_calls(source)
            if not any(k.arg == "timeout" for k in node.keywords)]


def sets_no_window(keyword):
    """Whether this keyword sets CREATE_NO_WINDOW: `**NO_WINDOW`, or creationflags naming it.

    The value is read, not only the key: `creationflags=0` opens a window like no flag.
    """
    if keyword.arg is None:
        return isinstance(keyword.value, ast.Name) and keyword.value.id == "NO_WINDOW"
    if keyword.arg != "creationflags":
        return False
    return any((isinstance(n, ast.Constant) and n.value == 0x08000000)
               or (isinstance(n, ast.Name) and n.id in ("NO_WINDOW", "CREATE_NO_WINDOW"))
               or (isinstance(n, ast.Attribute) and n.attr == "CREATE_NO_WINDOW")
               for n in ast.walk(keyword.value))


def unhidden(source, label):
    """(label, line, call, enclosing function, why) for every call whose console is wrong on Windows."""
    findings = []
    for node, attr, where in subprocess_calls(source):
        hides = any(sets_no_window(k) for k in node.keywords)
        inherits = not ({k.arg for k in node.keywords} & IO)
        if inherits and hides:
            findings.append((label, node.lineno, attr, where,
                             "shares this gate's stdio and sets CREATE_NO_WINDOW, so on Windows its output is lost"))
        elif not inherits and not hides:
            findings.append((label, node.lineno, attr, where,
                             "redirects its output but sets no CREATE_NO_WINDOW (**NO_WINDOW or creationflags)"))
    return findings


def main(argv):
    hidden_mode = "--hidden" in argv
    argv = [a for a in argv if a != "--hidden"]
    paths = [pathlib.Path(p) for p in argv] or sorted(pathlib.Path("plugin/bin").iterdir()) + sorted(pathlib.Path("plugin/lib").glob("*.py"))
    check = unhidden if hidden_mode else untimed
    findings = []
    scanned = 0
    unparsed = []
    unreadable = []
    for path in paths:
        if path.suffix == ".cmd":
            continue
        if not path.is_file():
            # A path the caller NAMED that is not there was not scanned; the default listing holds only what exists.
            if argv:
                unreadable.append(str(path))
            continue
        try:
            findings.extend(check(path.read_text(encoding="utf-8"), str(path)))
            scanned += 1
        except SyntaxError:
            unparsed.append(str(path))
    for label, line, call, where, why in findings:
        print(f"{label}:{line}: subprocess.{call} in {where}() {why}")
    # A gate that did not parse, or no gate at all, is not a clean scan (CLAUDE.md §3).
    for path in unparsed:
        print(f"{path}: could not parse")
    for path in unreadable:
        print(f"{path}: could not read")
    if findings:
        return 1
    if unparsed or unreadable:
        print(f"UNRUN: {len(unparsed) + len(unreadable)} input(s) did not parse or could not be read, so what they hold was not scanned.")
        return 2
    if not scanned:
        print("UNRUN: no gate to scan, so nothing here has been checked, which is not the same as clean.")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
