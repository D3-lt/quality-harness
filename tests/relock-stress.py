#!/usr/bin/env python3
"""Stress ADR-052 --relock against oracles written from the Decision, not the code.

The promise (docs/adr/ADR-052-an-explicit-relock-is-not-a-later-red.md §Decision):
`--relock` is an explicit later lock, never a silent later red. It does not run
the Acceptance fence. Default refuses a moved hashed body; `--replace-hashes`
is the only replace path and is weaker than first-red. A kind row
(`test-lock-kind:relock|replace`) is the done map and is not a passing
Acceptance run. A later red with a different sha and no kind still conflicts.
R3 recovery has no kind. Combo with --mutant/--human-mutant/--sweep/--restore/
--human fails; `--replace-hashes` without `--relock` fails.

Three arms (skill: stress-testing). Replay a failure with
QH_RELOCK_STRESS_SEED=<seed> PYTHONPATH=plugin/lib python3 tests/relock-stress.py.

  QH_RELOCK_STRESS_SEED        default 54
  QH_RELOCK_STRESS_ITERS      arm 1/2 iterations, default 80
  QH_RELOCK_STRESS_MUTANTS    "1" runs 10 hand mutants after a green baseline.
                              Default off: node --test runs files in parallel
                              and a product mutation would race. Prove locally:
                              QH_RELOCK_STRESS_MUTANTS=1 node --test tests/relock-stress.test.mjs

Flag pool from `rg 'args\\[i\\] == "--' plugin/bin/adr-verify` (2026-09-14):
  --cwd --human --mutant --also-restore --human-mutant --test --test-exit
  --from --to --why --covers --steps --sweep --timeout --json --restore
  --relock --replace-hashes
LEFT OUT of the combo oracle (Decision does not name them): --cwd (required
for snapshot; hides the --sweep combo), --also-restore --test --test-exit
--from --to --why --covers --steps --timeout --json (the last two refuse for
a different rule: sweep-only).

Kind pool from `rg 'test-lock-kind:' plugin/lib/record.py` (2026-09-14):
  relock | replace
LEFT OUT: first-red, later, recovery, empty — R3 and first-red have no kind.
"""
from __future__ import annotations

import importlib.machinery
import importlib.util
import itertools
import os
import py_compile
import random
import shutil
import subprocess
import sys
import tempfile

from record import (
    encode_lock,
    lock_findings,
    snapshot_lock,
    tests_table_rows,
    vlog_row_is_lock_snapshot,
)

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERIFY = os.path.join(REPO, "plugin", "bin", "adr-verify")
ADR_NEXT = os.path.join(REPO, "plugin", "bin", "adr-next")
SEED = int(os.environ.get("QH_RELOCK_STRESS_SEED", "54"))
ITERATIONS = int(os.environ.get("QH_RELOCK_STRESS_ITERS", "80"))
KIND_SPEC = frozenset({"relock", "replace"})
LOCK_KEYS = ("test-lock-kind", "test-lock-b64", "test-lock-sha256")
INCOMPATIBLE = ("--mutant", "--human-mutant", "--sweep", "--restore", "--human")
NAMED = "locked dirty"
REL = "tests/lock-subject.test.mjs"
ACCEPT_DIGEST = "0" * 64
SUBJECT_OK = (
    "import test from 'node:test'\n"
    "import assert from 'node:assert/strict'\n"
    "test('locked dirty', () => {\n"
    "  assert.equal(2, 2)\n"
    "})\n"
)
SUBJECT_MOVED = (
    "import test from 'node:test'\n"
    "import assert from 'node:assert/strict'\n"
    "test('locked dirty', () => {\n"
    "  assert.equal(1, 2)\n"
    "})\n"
)


def fail(arm, label, **detail):
    print(f"{arm} FAIL seed={SEED} {label}")
    for key, value in detail.items():
        print(f"--- {key} ---")
        print(value if isinstance(value, str) else repr(value))
    sys.exit(1)


# Independent of TEST_LOCK_FIELD / _row_lock_sha: walk trailing ` · key:val`
# tokens from the right. Spec: kind is optional relock|replace after b64.
def trailing_lock(line):
    rest = line.rstrip()
    seen = {}
    while True:
        idx = rest.rfind(" · ")
        if idx < 0:
            break
        token = rest[idx + 3:]
        if ":" not in token:
            break
        key, _, val = token.partition(":")
        if key not in LOCK_KEYS:
            break
        if key not in seen:
            seen[key] = val
        rest = rest[:idx]
        if key == "test-lock-sha256":
            break
    sha = seen.get("test-lock-sha256")
    if sha is None or len(sha) != 64 or any(c not in "0123456789abcdef" for c in sha):
        return None, None
    kind = seen.get("test-lock-kind")
    if kind in KIND_SPEC:
        return sha, kind
    return sha, ""


def oracle_snapshot(line):
    _sha, kind = trailing_lock(line)
    return kind in KIND_SPEC


def machine_exit(line):
    if not line.startswith("- "):
        return None
    marker = " · exit "
    at = line.find(marker)
    if at < 0:
        return None
    rest = line[at + len(marker):]
    digits = []
    for ch in rest:
        if ch.isdigit():
            digits.append(ch)
        else:
            break
    if not digits:
        return None
    return int("".join(digits))


def vlog_row(date, exit_code, suffix="", command="run", digest=ACCEPT_DIGEST):
    return (f"- {date} · no-git · exit {exit_code} · `{command}` · "
            f"acceptance-sha256:{digest} · ms:12{suffix}")


def task_markdown(vlog, fence="exit 99"):
    log = "\n".join(vlog)
    return (
        "# Task ADR-052-stress: relock probe\n\n"
        "## Acceptance\n\n"
        "```bash\n"
        f"{fence}\n"
        "```\n\n"
        "## Tests\n\n"
        "| Test name | File | Verifies | Covers |\n"
        "|-----------|------|----------|--------|\n"
        f"| `{NAMED}` | `{REL}` | lock | F-1 |\n\n"
        f"## Verification Log\n\n{log}\n"
    )


def current_suffix(root, kind=None):
    text = task_markdown([])
    snap = snapshot_lock(root, tests_table_rows(text))
    digest, token = encode_lock(snap)
    extra = f" · test-lock-kind:{kind}" if kind else ""
    return f" · test-lock-sha256:{digest} · test-lock-b64:{token}{extra}"


def write_subject(root, body=SUBJECT_OK):
    tests = os.path.join(root, "tests")
    os.makedirs(tests, exist_ok=True)
    path = os.path.join(tests, "lock-subject.test.mjs")
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(body)


def load_is_done():
    loader = importlib.machinery.SourceFileLoader("adr_next_relock_stress", ADR_NEXT)
    spec = importlib.util.spec_from_loader(loader.name, loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod.is_done


def child_env(pyc_prefix):
    env = os.environ.copy()
    env["PYTHONPATH"] = os.path.join(REPO, "plugin", "lib")
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    env["PYTHONPYCACHEPREFIX"] = pyc_prefix
    env["QH_RELOCK_STRESS_MUTANTS"] = "0"
    return env


# --- arm 1: lock-row grammar vs a split parser --------------------------------

def arm1(rng):
    snapshot = not_snapshot = kind_in_command = invalid_kind = 0
    kinds = ["relock", "replace", "", None, "first-red", "later", "RELOCK"]
    for iteration in range(ITERATIONS):
        sha = "".join(rng.choice("abcdef0123456789") for _ in range(64))
        token = "eA" + "".join(rng.choice("AZaz09_-") for _ in range(8))
        kind = rng.choice(kinds)
        cmd_kind = rng.random() < 0.25
        command = "adr-verify --relock" + (" --test-lock-kind:relock" if cmd_kind else "")
        suffix = f" · test-lock-sha256:{sha} · test-lock-b64:{token}"
        if kind is not None:
            suffix += f" · test-lock-kind:{kind}"
        line = vlog_row("2026-09-13", rng.choice([0, 2]), suffix, command=command)
        label = (f"iteration={iteration} kind={kind!r} cmd_kind={cmd_kind} "
                 f"line={line}")
        want = oracle_snapshot(line)
        got = vlog_row_is_lock_snapshot(line)
        if want != got:
            fail("arm1", label + " snapshot oracle != product",
                 want=want, got=got, line=line)
        if want:
            snapshot += 1
        else:
            not_snapshot += 1
        if cmd_kind and kind not in KIND_SPEC:
            kind_in_command += 1
            if got:
                fail("arm1", label + " kind in the command was read as a snapshot",
                     line=line)
        if kind not in KIND_SPEC and kind not in ("", None):
            invalid_kind += 1
            if got:
                fail("arm1", label + " an unknown kind was read as a snapshot",
                     line=line)
    if not (snapshot and not_snapshot and kind_in_command and invalid_kind):
        fail("arm1", f"nothing to observe: snapshot={snapshot} "
                     f"not_snapshot={not_snapshot} kind_in_command={kind_in_command} "
                     f"invalid_kind={invalid_kind}")
    print(f"arm1 iterations={ITERATIONS} snapshot={snapshot} "
          f"not_snapshot={not_snapshot} kind_in_command={kind_in_command} "
          f"invalid_kind={invalid_kind}")


# --- arm 2: random logs vs a Decision reference model ---------------------------

def oracle_map(rows):
    """Map sha / kind / conflict / recovered from the Decision, not _recorded_lock.

    Last test-lock-kind:relock|replace is the done map. R3: first later machine
    row with a trailing lock when the first red has none. Later red with a
    different sha and no kind conflicts. Relock is not first-red.
    """
    first_red = None
    kind_rows = []
    later_red_no_kind = []
    later_locks = []
    past_first = False
    for line in rows:
        code = machine_exit(line)
        if code is None:
            continue
        sha, kind = trailing_lock(line)
        if kind in KIND_SPEC:
            kind_rows.append((sha, kind, line))
        if not past_first:
            if code != 0:
                first_red = (line, sha, kind, code)
                past_first = True
            continue
        if sha:
            later_locks.append((sha, kind, code, line))
        if code != 0 and sha and kind not in KIND_SPEC:
            later_red_no_kind.append(sha)
    recovered = False
    if kind_rows:
        map_sha, map_kind, _line = kind_rows[-1]
    elif first_red and first_red[1]:
        map_sha, map_kind = first_red[1], first_red[2] or ""
    else:
        map_sha, map_kind = None, ""
        for sha, kind, _code, _line in later_locks:
            if sha:
                map_sha, map_kind = sha, kind or ""
                recovered = True
                break
    conflict = next((other for other in later_red_no_kind
                     if other and other != map_sha), None)
    return {
        "map_sha": map_sha,
        "kind": map_kind if map_kind in KIND_SPEC else "",
        "conflict": conflict,
        "recovered": recovered and not kind_rows,
        "first_red": first_red is not None,
    }


def oracle_is_done(rows, digest, model):
    if model["conflict"]:
        return False
    for line in rows:
        if machine_exit(line) != 0:
            continue
        if f"acceptance-sha256:{digest}" not in line:
            continue
        if oracle_snapshot(line):
            continue
        return True
    return False


def arm2(rng):
    is_done = load_is_done()
    shapes = (
        "relock_only_green",
        "later_red_after_relock",
        "replace_kind",
        "r3_recovery",
        "first_red_only",
        "kind_in_command",
        "unhashable_stays",
    )
    seen = {name: 0 for name in shapes}
    done_false = done_true = weaker = conflict = recovered = 0
    for iteration in range(ITERATIONS):
        shape = rng.choice(shapes)
        date = rng.choice(["2026-09-13", "2026-09-14"])
        root = tempfile.mkdtemp(prefix="qh-relock-arm2-")
        try:
            write_subject(root)
            suffix_a = current_suffix(root)
            kind = "replace" if shape == "replace_kind" else "relock"
            suffix_kind = current_suffix(root, kind=kind)
            label = f"iteration={iteration} shape={shape} date={date}"

            if shape == "unhashable_stays":
                rel_rb = "tests/ghost.rb"
                with open(os.path.join(root, rel_rb), "w", encoding="utf-8") as handle:
                    handle.write("def test_lock_ghost\n  assert 1 == 1\nend\n")
                text = (
                    "# Task\n\n## Acceptance\n\n```bash\nexit 99\n```\n\n"
                    "## Tests\n\n"
                    "| Test name | File | Verifies | Covers |\n"
                    "|-----------|------|----------|--------|\n"
                    f"| `{NAMED}` | `{REL}` | lock | F-1 |\n"
                    f"| `test_lock_ghost` | `{rel_rb}` | lock | F-1 |\n\n"
                    "## Verification Log\n\n"
                )
                snap = snapshot_lock(root, tests_table_rows(text))
                digest, token = encode_lock(snap)
                red = vlog_row(date, 2, f" · test-lock-sha256:{digest} · test-lock-b64:{token}")
                relock = vlog_row(
                    date, 0,
                    f" · test-lock-sha256:{digest} · test-lock-b64:{token} · test-lock-kind:relock",
                    command="adr-verify --relock")
                rows = [red, relock]
                log_text = task_markdown(rows)
                # Rebuild with the .rb Tests row so is_done / findings see it.
                log = "\n".join(rows)
                log_text = text + log + "\n"
                blocks, advice = lock_findings(
                    rows, root=root,
                    tests=[(NAMED, REL), ("test_lock_ghost", rel_rb)],
                    label="T1")
                model = oracle_map(rows)
                if not blocks:
                    fail("arm2", label + " still-unhashable must still block done",
                         blocks=blocks, advice=advice)
                if is_done(log_text, ACCEPT_DIGEST, False, None, None, root):
                    fail("arm2", label + " a relock made still-unhashable done",
                         blocks=blocks)
                seen[shape] += 1
                continue

            if shape == "r3_recovery":
                rows = [
                    vlog_row(date, 2),
                    vlog_row(date, 0, suffix_a),
                ]
            elif shape == "first_red_only":
                rows = [vlog_row(date, 2, suffix_a)]
            elif shape == "kind_in_command":
                rows = [
                    vlog_row(date, 2, suffix_a),
                    vlog_row(date, 0, suffix_a,
                             command="adr-verify --relock --test-lock-kind:relock"),
                ]
            elif shape == "later_red_after_relock":
                write_subject(root, SUBJECT_MOVED)
                suffix_b = current_suffix(root)
                write_subject(root, SUBJECT_OK)
                rows = [
                    vlog_row(date, 2, suffix_a),
                    vlog_row(date, 0, suffix_kind, command="adr-verify --relock"),
                    vlog_row(date, 3, suffix_b),
                ]
            elif shape == "relock_only_green":
                rows = [
                    vlog_row(date, 2, suffix_a),
                    vlog_row(date, 0, suffix_kind, command="adr-verify --relock"),
                ]
            else:
                rows = [
                    vlog_row(date, 2, suffix_a),
                    vlog_row(date, 0, suffix_kind,
                             command=("adr-verify --relock --replace-hashes"
                                      if kind == "replace" else "adr-verify --relock")),
                ]
                if rng.random() < 0.4:
                    rows.insert(1, vlog_row(date, 0, suffix_a, command="node --test"))

            log_text = task_markdown(rows)
            tests = [(NAMED, REL)]
            blocks, advice = lock_findings(rows, root=root, tests=tests, label="T1")
            model = oracle_map(rows)
            want_done = oracle_is_done(rows, ACCEPT_DIGEST, model)
            if model["conflict"]:
                want_done = False
            got_done = bool(is_done(log_text, ACCEPT_DIGEST, False, None, None, root))
            if want_done != got_done:
                fail("arm2", label + " is_done oracle != product",
                     want_done=want_done, got_done=got_done, model=model,
                     blocks=blocks, advice=advice, vlog="\n".join(rows))
            if model["kind"] and not model["conflict"]:
                weaker += 1
                if not any("weaker than first-red" in a for a in advice):
                    fail("arm2", label + " a kind row was read as first-red (no weaker advice)",
                         advice=advice, vlog="\n".join(rows))
                if any(b for b in blocks if "later red" in b):
                    fail("arm2", label + " a kind row was treated as a later-red conflict",
                         blocks=blocks, vlog="\n".join(rows))
            if model["conflict"]:
                conflict += 1
                if not blocks:
                    fail("arm2", label + " later red no-kind different sha must refuse",
                         blocks=blocks, vlog="\n".join(rows))
            if model["recovered"]:
                recovered += 1
                if model["kind"]:
                    fail("arm2", label + " R3 recovery must have no kind", model=model)
            if want_done:
                done_true += 1
            else:
                done_false += 1
            if shape == "relock_only_green" and got_done:
                fail("arm2", label + " a relock row was treated as a passing Acceptance run",
                     vlog="\n".join(rows))
            seen[shape] += 1
        finally:
            shutil.rmtree(root, ignore_errors=True)

    missing = [name for name, count in seen.items() if not count]
    if missing or not (done_false and weaker and conflict):
        fail("arm2", f"nothing to observe: seen={seen} done_false={done_false} "
                     f"done_true={done_true} weaker={weaker} conflict={conflict} "
                     f"recovered={recovered}")
    print(f"arm2 iterations={ITERATIONS} done_false={done_false} done_true={done_true} "
          f"weaker={weaker} conflict={conflict} recovered={recovered}")


# --- arm 3: working-tree adr-verify vs a Decision exit-code oracle ---------------

def spawn_verify(args, cwd, env, timeout=30):
    return subprocess.run(
        ["python3", "-B", VERIFY, *args],
        cwd=cwd, env=env, capture_output=True, encoding="utf-8",
        errors="replace", timeout=timeout)


def write_task(root, vlog, fence="exit 99"):
    path = os.path.join(root, "T1.md")
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(task_markdown(vlog, fence=fence))
    return path


def arm3(_rng):
    pyc = tempfile.mkdtemp(prefix="qh-relock-pyc-")
    env = child_env(pyc)
    refused = allowed = empty_log = moved = replaced = 0
    try:
        for bits in itertools.product([False, True], repeat=5):
            mutant, hm, sweep, restore, human = bits
            root = tempfile.mkdtemp(prefix="qh-relock-cli-")
            try:
                write_subject(root)
                suffix = current_suffix(root)
                task = write_task(root, [vlog_row("2026-09-13", 2, suffix)])
                args = ["--relock"]
                if mutant:
                    args += ["--mutant", "prod.mjs"]
                if hm:
                    args += ["--human-mutant", "who"]
                if restore:
                    args.append("--restore")
                if human:
                    args += ["--human", "signed off"]
                if sweep:
                    args += ["--sweep", root, task]
                else:
                    args += [task, "--cwd", root]
                other = None
                for flag, on in zip(INCOMPATIBLE, bits):
                    if on:
                        other = flag
                        break
                run = spawn_verify(args, root, env)
                out = (run.stdout or "") + (run.stderr or "")
                label = f"combo other={other} bits={bits} args={args!r}"
                if other is None:
                    allowed += 1
                    if run.returncode != 0:
                        fail("arm3", label + " default --relock with a lock must exit 0",
                             code=run.returncode, out=out)
                else:
                    refused += 1
                    if run.returncode != 2:
                        fail("arm3", label + " combo must refuse with exit 2",
                             code=run.returncode, out=out)
                    if "cannot be combined" not in out:
                        fail("arm3", label + " combo must say it cannot be combined",
                             out=out)
                    if "--relock" not in out or other not in out:
                        fail("arm3", label + " combo must name both flags",
                             out=out, other=other)
            finally:
                shutil.rmtree(root, ignore_errors=True)

        # empty log / no trailing lock
        for shape in ("empty", "no_lock"):
            root = tempfile.mkdtemp(prefix="qh-relock-cli-")
            try:
                write_subject(root)
                vlog = [] if shape == "empty" else [vlog_row("2026-09-13", 2)]
                task = write_task(root, vlog)
                run = spawn_verify(["--relock", task, "--cwd", root], root, env)
                out = (run.stdout or "") + (run.stderr or "")
                empty_log += 1
                if run.returncode == 0:
                    fail("arm3", f"shape={shape} --relock with no trailing lock must fail",
                         out=out)
            finally:
                shutil.rmtree(root, ignore_errors=True)

        # moved body: default refuses; --replace-hashes writes
        root = tempfile.mkdtemp(prefix="qh-relock-cli-")
        try:
            write_subject(root)
            suffix = current_suffix(root)
            task = write_task(root, [vlog_row("2026-09-13", 2, suffix)])
            write_subject(root, SUBJECT_MOVED)
            run = spawn_verify(["--relock", task, "--cwd", root], root, env)
            out = (run.stdout or "") + (run.stderr or "")
            moved += 1
            if run.returncode == 0:
                fail("arm3", "default --relock must refuse a moved hashed body", out=out)
            if "replace-hashes" not in out:
                fail("arm3", "moved-body refuse must mention --replace-hashes", out=out)
            run = spawn_verify(
                ["--relock", "--replace-hashes", task, "--cwd", root], root, env)
            out = (run.stdout or "") + (run.stderr or "")
            replaced += 1
            if run.returncode != 0:
                fail("arm3", "--relock --replace-hashes must write on a moved body",
                     code=run.returncode, out=out)
        finally:
            shutil.rmtree(root, ignore_errors=True)

        # --replace-hashes without --relock. Fence is exit 0 so a dropped
        # guard would run ordinary verify and succeed — the only shape that
        # can kill that mutant (skill: a mutant that cannot change behaviour
        # is withdrawn; an exit-99 fence would still fail).
        root = tempfile.mkdtemp(prefix="qh-relock-cli-")
        try:
            write_subject(root)
            suffix = current_suffix(root)
            task = write_task(root, [vlog_row("2026-09-13", 2, suffix)], fence="exit 0")
            run = spawn_verify(["--replace-hashes", task, "--cwd", root], root, env)
            out = (run.stdout or "") + (run.stderr or "")
            refused += 1
            if run.returncode != 2:
                fail("arm3", "--replace-hashes without --relock must refuse",
                     code=run.returncode, out=out)
            if "--relock" not in out:
                fail("arm3", "--replace-hashes without --relock must name --relock",
                     out=out)
        finally:
            shutil.rmtree(root, ignore_errors=True)
    finally:
        shutil.rmtree(pyc, ignore_errors=True)

    if not (refused and allowed and empty_log and moved and replaced):
        fail("arm3", f"nothing to observe: refused={refused} allowed={allowed} "
                     f"empty_log={empty_log} moved={moved} replaced={replaced}")
    print(f"arm3 iterations={32 + empty_log + 2} refused={refused} allowed={allowed} "
          f"empty_log={empty_log} moved={moved} replaced={replaced}")


# --- prove the suite: 10 hand mutants, restore in finally (v3) ---------------

HAND_MUTANTS = (
    {
        "label": "default --relock refuses a moved hashed body",
        "file": os.path.join("plugin", "bin", "adr-verify"),
        "from": "    if not replace_hashes:\n        moved = moved_lock_bodies(vlog, current=snap)\n",
        "to": "    if False:\n        moved = moved_lock_bodies(vlog, current=snap)\n",
        "arm": "3",
    },
    {
        "label": "--relock is parsed before unknown-option",
        "file": os.path.join("plugin", "bin", "adr-verify"),
        "from": "        elif args[i] == \"--relock\":\n            relock = True\n",
        "to": "        elif args[i] == \"--relock-off\":\n            relock = True\n",
        "arm": "3",
    },
    {
        "label": "a relock row is weaker than first-red",
        "file": os.path.join("plugin", "lib", "record.py"),
        "from": "    if recorded.get(\"kind\"):",
        "to": "    if False:",
        "arm": "2",
    },
    {
        "label": "later-red conflict skips kind rows only",
        "file": os.path.join("plugin", "lib", "record.py"),
        "from": "            elif sha and not kind:\n                later_red_locks.append(sha.group(1))\n",
        "to": "            elif False:\n                later_red_locks.append(sha.group(1))\n",
        "arm": "2",
    },
    {
        "label": "a relock row is not a passing Acceptance run",
        "file": os.path.join("plugin", "bin", "adr-next"),
        "from": "            if vlog_row_is_lock_snapshot(line):\n                continue\n            if lock_blocks_done(text, root):\n",
        "to": "            if False:\n                continue\n            if lock_blocks_done(text, root):\n",
        "arm": "2",
    },
    {
        "label": "--relock cannot combine with --sweep",
        "file": os.path.join("plugin", "bin", "adr-verify"),
        "from": "    if relock and sweep is not None:\n        fail(\"--relock cannot be combined with --sweep\")\n",
        "to": "    if False:\n        fail(\"--relock cannot be combined with --sweep\")\n",
        "arm": "3",
    },
    {
        "label": "--relock cannot combine with --restore",
        "file": os.path.join("plugin", "bin", "adr-verify"),
        "from": "    if relock and restore:\n        fail(\"--relock cannot be combined with --restore\")\n",
        "to": "    if False:\n        fail(\"--relock cannot be combined with --restore\")\n",
        "arm": "3",
    },
    {
        "label": "--relock cannot combine with --human",
        "file": os.path.join("plugin", "bin", "adr-verify"),
        "from": "    if relock and human is not None:\n        fail(\"--relock cannot be combined with --human\")\n",
        "to": "    if False:\n        fail(\"--relock cannot be combined with --human\")\n",
        "arm": "3",
    },
    {
        "label": "--relock cannot combine with --mutant",
        "file": os.path.join("plugin", "bin", "adr-verify"),
        "from": "    if relock and mutant is not None:\n        fail(\"--relock cannot be combined with --mutant\")\n",
        "to": "    if False:\n        fail(\"--relock cannot be combined with --mutant\")\n",
        "arm": "3",
    },
    {
        "label": "--replace-hashes is valid only with --relock",
        "file": os.path.join("plugin", "bin", "adr-verify"),
        "from": "    if replace_hashes and not relock:\n        fail(\"--replace-hashes is valid only with --relock\")\n",
        "to": "    if False:\n        fail(\"--replace-hashes is valid only with --relock\")\n",
        "arm": "3",
    },
)


def prove_mutants():
    script = os.path.abspath(__file__)
    pyc = tempfile.mkdtemp(prefix="qh-relock-mut-pyc-")
    env = child_env(pyc)
    env["QH_RELOCK_STRESS_ITERS"] = os.environ.get("QH_RELOCK_STRESS_ITERS", "40")
    env["QH_RELOCK_STRESS_SEED"] = str(SEED)
    killed = 0
    try:
        for mutant in HAND_MUTANTS:
            path = os.path.join(REPO, mutant["file"])
            original = open(path, encoding="utf-8").read()
            count = original.count(mutant["from"])
            if count != 1:
                fail("mutants", f"{mutant['label']} --from matched {count} times, want 1",
                     path=path)
            mutated = original.replace(mutant["from"], mutant["to"], 1)
            try:
                with open(path, "w", encoding="utf-8", newline="\n") as handle:
                    handle.write(mutated)
                try:
                    py_compile.compile(path, doraise=True)
                except py_compile.PyCompileError as exc:
                    fail("mutants", f"{mutant['label']} INCONCLUSIVE (does not parse)",
                         error=str(exc))
                run = subprocess.run(
                    ["python3", "-B", script, "--arm", mutant["arm"]],
                    cwd=REPO, env=env, capture_output=True, encoding="utf-8",
                    errors="replace", timeout=120)
                out = (run.stdout or "") + (run.stderr or "")
                if run.returncode == 0:
                    fail("mutants", f"{mutant['label']} SURVIVED", out=out)
                if " FAIL seed=" not in out:
                    fail("mutants", f"{mutant['label']} INCONCLUSIVE (no FAIL line)",
                         code=run.returncode, out=out)
                killed += 1
                print(f"mutant killed: {mutant['label']}")
            finally:
                with open(path, "w", encoding="utf-8", newline="\n") as handle:
                    handle.write(original)
                restored = open(path, encoding="utf-8").read()
                if restored != original:
                    fail("mutants", f"{mutant['label']} restore did not put the file back",
                         path=path)
    finally:
        shutil.rmtree(pyc, ignore_errors=True)
    if killed != len(HAND_MUTANTS):
        fail("mutants", f"killed={killed} want {len(HAND_MUTANTS)}")
    print(f"mutants killed={killed}")


def main(argv):
    rng = random.Random(SEED)
    arm1_rng = random.Random(rng.random())
    arm2_rng = random.Random(rng.random())
    want = None
    mutants = os.environ.get("QH_RELOCK_STRESS_MUTANTS") == "1"
    args = list(argv)
    if "--mutants" in args:
        mutants = True
        args.remove("--mutants")
    if args[:2] == ["--arm", "1"] or args == ["--arm", "1"]:
        want = "1"
    elif args[:2] == ["--arm", "2"]:
        want = "2"
    elif args[:2] == ["--arm", "3"]:
        want = "3"
    elif args:
        fail("main", f"unknown args {args!r}")
    if want in (None, "1"):
        arm1(arm1_rng)
    if want in (None, "2"):
        arm2(arm2_rng)
    if want in (None, "3"):
        arm3(random.Random(rng.random()))
    if mutants and want is None:
        prove_mutants()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
