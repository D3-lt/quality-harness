#!/usr/bin/env python3
"""Stress the first-red hasher against oracles written from its promise, not its code.

The promise (record.py `body_digest`, `bdd_callback_body`): a locked test whose
BEHAVIOUR changes must change its digest; a comment-only edit must not; the body
hashed for a BDD test is that test's own callback, never a neighbour's.

Two arms, cheapest first (skill: stress-testing). Both are seeded and every
failure label carries what a hand replay needs. Run by tests/test-lock.test.mjs;
the pass is exit 0 with the two `armN iterations=` lines on stdout, and an arm
that observed no differing case fails, because a run that could not have gone
red proves nothing.

  QH_STRESS_SEED        default 54
  QH_STRESS_ITERATIONS  per arm, default 300
"""
import os
import random
import subprocess
import sys

from record import (
    TEST_HASH_REQUIRED_FROM,
    body_digest,
    extract_test_body,
    first_red_lock_suffix,
    lock_findings,
)

SEED = int(os.environ.get("QH_STRESS_SEED", "54"))
ITERATIONS = int(os.environ.get("QH_STRESS_ITERATIONS", "300"))
WORDS = ["alpha", "bravo", "charlie", "delta", "echo", "fox", "golf",
         "hotel", "india", "juliet", "kilo", "lima"]


def fail(arm, label, **detail):
    print(f"{arm} FAIL seed={SEED} {label}")
    for key, value in detail.items():
        print(f"--- {key} ---")
        print(value if isinstance(value, str) else repr(value))
    sys.exit(1)


# --- arm 1: shell digest against bash itself ---------------------------------
#
# (template, is_comment). {T} is the token the variant changes. A data template
# must make the token OBSERVABLE to bash, or the oracle has nothing to say about
# it. The comment templates are the spec's own negative: a comment-only edit
# keeps the digest.
SHELL_LINES = [
    ("  echo {T}", False),
    ("  echo https://example.invalid/#{T}", False),
    ("  echo word\\;#{T}", False),
    ("  echo word\\ #{T}", False),
    ("  echo ok # {T}", True),
    ("  # {T}", True),
    ("  echo ok ; # {T}", True),
    ("  echo ok | cat # {T}", True),
    ("  cat <<EOF\n# {T}\nEOF", False),
    ("  cat <<EOF\n// {T}\nEOF", False),
    ("  cat <<EOF\n}\n{T}\nEOF", False),
    ("  cat <<'EOF'\nhttps://x/#{T}\nEOF", False),
    ("  cat <<-EOF\n\t{T}\n\tEOF", False),
    ("  echo \"{T}\"", False),
    ("  echo '# {T}'", False),
    ("  x=$(( 1 << 2 )); echo $x {T}", False),
    ("  true=1; n=$(( 1 << true ))\n  # {T}\n  true", True),
    ("  true=1; n=$(( 1 << true + 0 ))\n  # {T}\n  true", True),
    ("  cat <<< 'word'\n  # {T}\n  word", True),
    ("  cat <<EOF # {T}\nline\nEOF", True),
    ("  pattern='(('\n  cat <<EOF\n}\n{T}\nEOF", False),
    ("  x=$(( 1 + 2 )); cat <<EOF\n{T}\nEOF", False),
    ("  p='((' ; cat <<EOF\n}\n{T}\nEOF", False),
    ("  cat <<EOF\n((\nEOF\n  cat <<EOF\n}\n{T}\nEOF", False),
    ("  n=$(( $(if false; then cat <<EOF\n}\nEOF\nfi; echo 1) + 0 )); echo {T}", False),
    ('  p="first\n(( \\""; if false; then cat <<EOF\n}\nEOF\nfi; echo {T}', False),
    ("  [ 2 -eq 2 ] && echo {T}", False),
]


def shell_source(lines):
    return "test_lock_dirty() {\n" + "\n".join(lines) + "\n}\n"


def bash_observes(source):
    run = subprocess.run(
        ["bash", "-c", source + "test_lock_dirty\n"],
        capture_output=True, encoding="utf-8", errors="replace", timeout=10)
    return run.returncode, run.stdout, run.stderr


def bash_oracle_available():
    """(ok, why): can the `bash` this process resolves run a probe and print it?

    On a Windows runner `bash` from Python resolved to something that printed
    the same thing for every input, so 300 pairs observed nothing and the arm
    refused to call that a pass (CI 34764859969). An oracle that cannot answer
    is UNRUN, said by name, not a failing arm and not a silent pass.
    """
    try:
        run = subprocess.run(
            ["bash", "-c", "echo probe-$((1+1))"],
            capture_output=True, encoding="utf-8", errors="replace", timeout=10)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return False, f"{type(exc).__name__}: {exc}"
    if run.stdout.strip() == "probe-2":
        return True, ""
    return False, (f"exit={run.returncode} stdout={run.stdout.strip()[:80]!r} "
                   f"stderr={run.stderr.strip()[:160]!r}")

def shell_digest(source):
    body = extract_test_body(source, "test_lock_dirty", shell=True)
    return body, (None if body is None else body_digest(body, shell=True))


def arm1(rng):
    observable = comment_only = 0
    for iteration in range(ITERATIONS):
        picks = [rng.choice(SHELL_LINES) for _ in range(rng.randint(1, 5))]
        tokens = [rng.choice(WORDS) for _ in picks]
        change = rng.randrange(len(picks))
        replaced = list(tokens)
        replaced[change] = rng.choice([w for w in WORDS if w != tokens[change]])
        a = shell_source([t.replace("{T}", w) for (t, _), w in zip(picks, tokens)])
        b = shell_source([t.replace("{T}", w) for (t, _), w in zip(picks, replaced)])
        body_a, digest_a = shell_digest(a)
        body_b, digest_b = shell_digest(b)
        label = f"iteration={iteration} changed_line={change} template={picks[change][0]!r}"
        if body_a is None or body_b is None:
            fail("arm1", label + " body=None (unproven where bash runs it)", a=a, b=b)
        out_a, out_b = bash_observes(a), bash_observes(b)
        if out_a != out_b:
            observable += 1
            if digest_a == digest_b:
                fail("arm1", label + " bash output differs, digest did not move",
                     a=a, b=b, bash_a=out_a, bash_b=out_b, body_a=body_a)
        if picks[change][1]:
            comment_only += 1
            if digest_a != digest_b:
                fail("arm1", label + " comment-only edit moved the digest",
                     a=a, b=b, body_a=body_a, body_b=body_b)
    if not observable or not comment_only:
        fail("arm1", f"nothing to observe: observable={observable} comment_only={comment_only}")
    print(f"arm1 iterations={ITERATIONS} observable={observable} comment_only={comment_only}")


# --- arm 2: BDD callback body against the generator's own knowledge ----------
#
# The generator writes each test's callback and remembers it. The oracle is
# that memory, never the extractor: the returned body is exactly the callback
# written for that name, carries its own marker and nobody else's.
BLOCK_LINES = {
    "php": ["expect(1)->toBe(1);", "$s = '}';", "$s = \")\";", "$s = '=>';",
            "// { not a brace", "# ) not a paren", "$f = fn () => 1;",
            "$m = ['k' => 2];", "run(function () { return 1; });"],
    "js": ["expect(1).toBe(1)", "const s = '}'", "const s = \")\"", "const s = '=>'",
           "// { not a brace", "const f = () => 1", "const o = { k: 2 }",
           "if (/[)]/.test(')')) run()",
           "run(function () { return 1 })"],
}
ARROW_EXPRESSIONS = {
    "php": ["expect(2)->toBe(2)", "expect(')')->toBe(')')", "expect('{')->toBe('{')",
            "run(fn () => 1)", "expect(['a' => 1])->toBe(['a' => 1])",
            "run(function () { return 1; })"],
    "js": ["expect(2).toBe(2)", "expect(')').toBe(')')", "expect('{').toBe('{')",
           "run(() => 1)", "({ a: 1 })", "run(function () { return 1 })"],
}
BLOCK_OPENERS = {
    "php": ["test({q}{name}{q}, function () ", "it({q}{name}{q}, function (): void "],
    "js": ["it({q}{name}{q}, () => ", "test({q}{name}{q}, async () => ",
           "it({q}{name}{q}, function () "],
}
ARROW_OPENERS = {
    "php": ["test({q}{name}{q}, fn () => ", "it({q}{name}{q}, fn (): void => "],
    "js": ["it({q}{name}{q}, () => ", "test({q}{name}{q}, async () => "],
}


def bdd_file(rng, lang):
    tests = []
    used = set()
    for index in range(rng.randint(1, 4)):
        name = f"t_{rng.choice(WORDS)}_{index}"
        marker = f"mark_{rng.choice(WORDS)}_{index}"
        used.add(name)
        quote = rng.choice(["'", '"'])
        if rng.random() < 0.5:
            lines = [rng.choice(BLOCK_LINES[lang]) for _ in range(rng.randint(0, 3))]
            lines.append(f"expect('{marker}')->toBe('{marker}');" if lang == "php"
                         else f"expect('{marker}').toBe('{marker}')")
            body = "{\n" + "\n".join("    " + line for line in lines) + "\n}"
            opener = rng.choice(BLOCK_OPENERS[lang]).format(q=quote, name=name)
            call = f"{opener}{body})"
        else:
            body = f"run('{marker}', {rng.choice(ARROW_EXPRESSIONS[lang])})"
            opener = rng.choice(ARROW_OPENERS[lang]).format(q=quote, name=name)
            call = f"{opener}{body})"
        call += ";" if lang == "php" else ""
        tests.append((name, marker, body, call))
    header = "<?php\n\n" if lang == "php" else ""
    text = header + "\n\n".join(call for _, _, _, call in tests) + "\n"
    return text, tests


def arm2(rng):
    counts = {"php": 0, "js": 0}
    for iteration in range(ITERATIONS):
        lang = rng.choice(["php", "js"])
        text, tests = bdd_file(rng, lang)
        counts[lang] += 1
        for name, marker, expected, _ in tests:
            got = extract_test_body(text, name, php=(lang == "php"))
            label = f"iteration={iteration} lang={lang} name={name}"
            if got != expected:
                fail("arm2", label + " body is not the callback written for it",
                     expected=expected, got=got, file=text)
            others = [m for n, m, _, _ in tests if n != name and m in (got or "")]
            if others:
                fail("arm2", label + f" body carries another test's marker {others}",
                     got=got, file=text)
    print(f"arm2 iterations={ITERATIONS} php={counts['php']} js={counts['js']}")



# --- arm 3: the verdict layer against ADR-050's Decision -------------------
#
# Arms 1 and 2 measure extraction and digests. This one measures what the GATE
# DECIDES, which is where R2/R3 of the memory-runtime handoff live and where
# nothing randomised had ever looked.
#
# The oracle is ADR-050 §Decision, transcribed once and quoted here, expressed
# over what the GENERATOR DID rather than over any hash — so it cannot inherit
# the hasher's bugs:
#
#   "The first TDD-red Verification Log row is the contract for every test body
#    the hasher can extract from each Tests-table File, and for a declared
#    `check` string or its absence. `done` is refused when any of those hashes
#    moved or vanished, when a named Tests-table body could not be hashed, when
#    a later red presents a different hash, or when `check` appears after
#    recorded absence. New names are allowed. Comment/whitespace-only edits do
#    not refuse."
#   "Cutover TEST_HASH_REQUIRED_FROM: missing lock advises before that day,
#    refuses from it."
#
# Everything below is the real writer (`first_red_lock_suffix`) and the real
# reader (`lock_findings`) over a real temporary tree.
CUTOVER = TEST_HASH_REQUIRED_FROM

# (extension, hashable) — an extension the hasher does not know records
# bodies={} and unproven={…}, which is R2's state and must refuse by Decision.
LOCK_LANGS = [
    (".py", True), (".go", True), (".sh", True),
    (".php", True), (".rs", True), (".mjs", True),
    (".rb", False), (".txt", False),
]


def _subject(ext, names, token, comment, changed=None):
    """A test file in `ext` defining `names`, each asserting `token`.

    `changed` names the ONE test that asserts something else, so a case can move
    an unlisted sibling's body while every listed body stays byte-identical —
    the only shape that can tell a snapshot of all extractable names from one
    of the Tests table's own rows (ADR-050 locks the former).
    """
    tok = lambda n: (token + 5) if n == changed else token
    if ext == ".py":
        return "".join(f"def {n}():\n    # {comment}\n    assert 2 == {tok(n)}\n\n" for n in names)
    if ext == ".go":
        body = "".join(f"func {n}(t *testing.T) {{\n\t// {comment}\n"
                        f"\tif 2 != {tok(n)} {{\n\t\tt.Fatal(\"x\")\n\t}}\n}}\n\n" for n in names)
        return 'package lock\n\nimport "testing"\n\n' + body
    if ext == ".sh":
        return "".join(f"{n}() {{\n  # {comment}\n  [ 2 -eq {tok(n)} ]\n}}\n\n" for n in names)
    if ext == ".php":
        methods = "".join(f"    public function {n}(): void\n    {{\n        # {comment}\n"
                          f"        $this->assertSame(2, {tok(n)});\n    }}\n\n" for n in names)
        return "<?php\n\nfinal class LockSubjectTest extends TestCase\n{\n" + methods + "}\n"
    if ext == ".rs":
        return "".join(f"#[test]\nfn {n}() {{\n    // {comment}\n    assert_eq!(2, {tok(n)});\n}}\n\n"
                       for n in names)
    if ext == ".mjs":
        return "".join(f"test('{n}', () => {{\n  // {comment}\n  assert.equal(2, {tok(n)})\n}})\n\n"
                       for n in names)
    # Not a language the hasher knows: still a plausible test file.
    return "".join(f"def {n}\n  # {comment}\n  assert_equal 2, {tok(n)}\nend\n\n" for n in names)


def _task_text(rows, vlog=()):
    table = "\n".join(f"| `{n}` | `{r}` | lock | F-1 |" for n, r in rows)
    log = "\n".join(vlog)
    return ("## Tests\n\n| Test name | File | Kind | Covers |\n|---|---|---|---|\n"
            f"{table}\n\n## Verification Log\n\n{log}\n")


def _row(date, exit_code, digest, suffix="", command="run"):
    return (f"- {date} · no-git · exit {exit_code} · `{command}` · "
            f"acceptance-sha256:{digest * 64} · ms:12{suffix}")


# A fence whose own text carries a lock-shaped string. Only the TRAILING field
# is the lock, so this row has none whatever it mentions.
SHA_SHAPED_COMMAND = f"grep test-lock-sha256:{'c' * 64} build.log"

# Each edit says what the Decision does with it. `None` means the Decision does
# not speak to this case, so the arm asserts nothing about it.
EDITS = {
    "none": False,
    "comment_only": False,          # "Comment/whitespace-only edits do not refuse"
    "assertion": True,              # "any of those hashes moved"
    "delete_locked": True,          # "or vanished"
    "add_new_test": False,          # "New names are allowed"
    "assertion_unlisted": True,     # an unlisted sibling is locked too
    "check_appears": True,          # "when `check` appears after recorded absence"
    "check_removed": True,          # a locked hash vanished
    "check_moved": True,            # a locked hash moved
}


def arm3(rng):
    import json as _json
    import shutil
    import tempfile

    refused = allowed = no_lock_block = no_lock_advice = later_red = 0
    for iteration in range(ITERATIONS):
        ext, hashable = rng.choice(LOCK_LANGS)
        names = [f"test_lock_{rng.choice(WORDS)}_{k}" for k in range(rng.randint(1, 3))]
        if ext == ".go":
            names = [f"Test{n.title().replace('_', '')}" for n in names]
        rel = f"tests/lock_subject{ext}"
        listed = names[:rng.randint(1, len(names))]
        rows = [(n, rel) for n in listed]
        edit = rng.choice(list(EDITS))
        if edit == "assertion_unlisted":
            # This edit only exists when something is NOT in the table, so the
            # generator makes that true rather than quietly becoming a no-op.
            if len(names) < 2:
                names.append(f"{'Test' if ext == '.go' else 'test_lock_'}Spare9")
            listed = names[:-1]
        unlisted = [n for n in names if n not in listed]
        date = rng.choice([CUTOVER, "2026-09-12", "2026-09-14"])
        # Three ways a log can fail to carry a lock, all seen in the field.
        lock_shape = rng.choice(["locked", "locked", "locked", "no_suffix", "green_only"])
        check_at_lock = rng.choice([None, "bash scripts/selftest.sh", "npm test"])

        root = tempfile.mkdtemp(prefix="qh-arm3-")
        try:
            os.mkdir(os.path.join(root, "tests"))
            subject = os.path.join(root, rel)
            with open(subject, "w", encoding="utf-8") as handle:
                handle.write(_subject(ext, names, 2, "before"))
            config = os.path.join(root, ".quality-harness.json")
            if check_at_lock is not None:
                with open(config, "w", encoding="utf-8") as handle:
                    handle.write(_json.dumps({"check": check_at_lock}))

            suffix = first_red_lock_suffix(_task_text(rows), root)
            label = (f"iteration={iteration} ext={ext} edit={edit} date={date} "
                     f"shape={lock_shape} check={check_at_lock!r} listed={listed}")
            if lock_shape == "locked" and not suffix:
                fail("arm3", label + " the writer recorded no lock at all")

            # The edit. Only `assertion`, `delete_locked`, `check_*` change what
            # the Decision is about; the rest are the controls that must not refuse.
            if edit == "assertion":
                with open(subject, "w", encoding="utf-8") as handle:
                    handle.write(_subject(ext, names, 1, "before"))
            elif edit == "comment_only":
                with open(subject, "w", encoding="utf-8") as handle:
                    handle.write(_subject(ext, names, 2, "after — only this line moved"))
            elif edit == "delete_locked":
                with open(subject, "w", encoding="utf-8") as handle:
                    handle.write(_subject(ext, names[1:], 2, "before"))
            elif edit == "assertion_unlisted":
                with open(subject, "w", encoding="utf-8") as handle:
                    handle.write(_subject(ext, names, 2, "before", changed=unlisted[0]))
            elif edit == "add_new_test":
                with open(subject, "w", encoding="utf-8") as handle:
                    handle.write(_subject(ext, names + ["test_lock_added_9"], 2, "before"))
            # ONLY when none was declared at lock time: writing a different
            # string over an existing one is a check_moved, which the Decision
            # refuses — the generator was staging that and calling it allowed.
            elif edit == "check_appears" and check_at_lock is None:
                with open(config, "w", encoding="utf-8") as handle:
                    handle.write(_json.dumps({"check": "bash scripts/selftest.sh"}))
            elif edit == "check_removed" and check_at_lock is not None:
                os.remove(config)
            elif edit == "check_moved" and check_at_lock is not None:
                with open(config, "w", encoding="utf-8") as handle:
                    handle.write(_json.dumps({"check": check_at_lock + " --verbose"}))

            if lock_shape == "green_only":
                vlog = [_row(date, 0, "a")]
            elif lock_shape == "no_suffix":
                vlog = [_row(date, 2, "a")]
            else:
                vlog = [_row(date, 2, "a", suffix)]
            if rng.random() < 0.3:
                vlog.insert(0, _row(date, 0, "a"))
            if rng.random() < 0.3:
                # A later red whose COMMAND mentions a lock; the row has none.
                vlog.append(_row(date, 4, "c", command=SHA_SHAPED_COMMAND))
            # "when a later red presents a different hash": a second red whose
            # lock was taken from a DIFFERENT body. The writer never emits two,
            # so this is the hand-written or tool-confused log the clause is for.
            second_red = lock_shape == "locked" and hashable and rng.random() < 0.25
            if second_red:
                with open(subject + ".tmp", "w", encoding="utf-8") as handle:
                    handle.write(_subject(ext, names, 7, "before"))
                shutil.move(subject + ".tmp", subject + ".keep")
                current = open(subject, encoding="utf-8").read()
                shutil.move(subject + ".keep", subject)
                other = first_red_lock_suffix(_task_text(rows), root)
                with open(subject, "w", encoding="utf-8") as handle:
                    handle.write(current)
                # The generator changed a hashable body, so the writer MUST pin
                # something else. Clearing `second_red` here instead trusted the
                # implementation's output to decide what the oracle expects, and
                # a hashing fault that ignored the change passed 300 iterations
                # with every counter positive (Codex, pass 7).
                if not other or other == suffix:
                    fail("arm3", label + " a changed hashable body produced no new lock",
                         suffix=suffix, other=other)
                vlog.append(_row(date, 3, "b", other))
                later_red += 1

            blocks, advice = lock_findings(vlog, root=root, tests=rows, label="T1")

            # --- the oracle, from the Decision -------------------------------
            if lock_shape in ("no_suffix", "green_only"):
                # "missing lock advises before that day, refuses from it"
                if date < CUTOVER:
                    no_lock_advice += 1
                    if blocks or not advice:
                        fail("arm3", label + " a missing lock before the cutover must advise, not block",
                             blocks=blocks, advice=advice)
                else:
                    no_lock_block += 1
                    if not blocks or advice:
                        fail("arm3", label + " a missing lock from the cutover must refuse",
                             blocks=blocks, advice=advice)
                continue

            must_refuse = second_red
            if not hashable:
                # "when a named Tests-table body could not be hashed"
                must_refuse = True
            elif EDITS[edit]:
                touched_locked = edit in ("check_appears", "check_removed", "check_moved")
                if edit == "check_appears":
                    touched_locked = check_at_lock is None
                elif edit in ("check_removed", "check_moved"):
                    touched_locked = check_at_lock is not None
                else:
                    # ADR-050 locks "every test body the hasher can extract from
                    # each Tests-table File" — snapshot_lock records a body for
                    # EVERY extractable name in a listed file, so an unlisted
                    # sibling is locked too. Keying this on `listed` let a
                    # snapshot that locked only listed names pass (Codex, pass 7).
                    touched_locked = True
                must_refuse = must_refuse or touched_locked

            if must_refuse:
                refused += 1
                if not blocks:
                    fail("arm3", label + " the Decision refuses this and the gate did not",
                         blocks=blocks, advice=advice, vlog="\n".join(vlog))
            else:
                allowed += 1
                if blocks:
                    fail("arm3", label + " the Decision allows this and the gate refused",
                         blocks=blocks, advice=advice, vlog="\n".join(vlog))
        finally:
            shutil.rmtree(root, ignore_errors=True)

    if not (refused and allowed and no_lock_block and no_lock_advice and later_red):
        fail("arm3", f"nothing to observe: refused={refused} allowed={allowed} "
                     f"no_lock_block={no_lock_block} no_lock_advice={no_lock_advice} "
                     f"later_red={later_red}")
    print(f"arm3 iterations={ITERATIONS} refused={refused} allowed={allowed} "
          f"no_lock_block={no_lock_block} no_lock_advice={no_lock_advice} later_red={later_red}")
if __name__ == "__main__":
    rng = random.Random(SEED)
    arm1_rng, arm2_rng = random.Random(rng.random()), random.Random(rng.random())
    available, why = bash_oracle_available()
    if available:
        arm1(arm1_rng)
    else:
        print(f"arm1 UNRUN bash oracle unavailable: {why}")
    arm2(arm2_rng)
    arm3(random.Random(rng.random()))
