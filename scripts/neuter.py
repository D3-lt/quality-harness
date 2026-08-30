"""Enumerate a Python gate's finding statements, and neuter them exactly.

Extents come from `ast`, and the EDIT is made here too. Doing the arithmetic in
one language removes the class of bug that produced `pass   return errs`: an
offset computed in JavaScript against line starts computed in Python.

  python3 neuter.py list  < gate        -> one "line:col:text" per finding
  python3 neuter.py cut N < gate        -> the gate with finding N replaced by `pass`
  python3 neuter.py all   < gate        -> the gate with every finding replaced
"""
import ast, sys


def sites(src):
    out = []
    for node in ast.walk(ast.parse(src)):
        if not isinstance(node, ast.Expr) or not isinstance(node.value, ast.Call):
            continue
        fn = node.value.func
        if not isinstance(fn, ast.Attribute) or fn.attr not in ("append", "advise"):
            continue
        if not isinstance(fn.value, ast.Name) or fn.value.id not in ("errors", "errs"):
            continue
        args = node.value.args
        if not args or not isinstance(args[0], (ast.Constant, ast.JoinedStr)):
            continue                      # a list being built, not a finding
        if isinstance(args[0], ast.Constant) and not isinstance(args[0].value, str):
            continue
        out.append(node)
    return sorted(out, key=lambda n: (n.lineno, n.col_offset))


def cut(src, nodes):
    """Replace each node with `pass`, slicing in BYTES.

    ast reports col_offset and end_col_offset as UTF-8 BYTE offsets, and these
    gates' messages are full of `—` and `·`. Slicing the str by those numbers cuts
    at the wrong character and produced `pass    return errs` -- a neutered file
    that does not parse, which the caller then read as a suite that noticed. The
    encoding, not the parser, was the bug.
    """
    lines = [ln.encode("utf-8") for ln in src.splitlines(keepends=True)]
    for node in sorted(nodes, key=lambda n: (n.lineno, n.col_offset), reverse=True):
        first, last = node.lineno - 1, node.end_lineno - 1
        head = lines[first][:node.col_offset]
        tail = lines[last][node.end_col_offset:]
        lines[first:last + 1] = [head + b"pass" + tail]
    return b"".join(lines).decode("utf-8")


src = sys.stdin.read()
found = sites(src)
mode = sys.argv[1]
if mode == "list":
    for n in found:
        text = " ".join(ast.get_source_segment(src, n).split())
        sys.stdout.write(f"{n.lineno}:{n.col_offset}:{text}\n")
elif mode == "all":
    sys.stdout.write(cut(src, found))
else:
    sys.stdout.write(cut(src, [found[int(sys.argv[2])]]))
