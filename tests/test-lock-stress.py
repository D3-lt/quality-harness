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

from record import body_digest, extract_test_body

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
    ("  [ 2 -eq 2 ] && echo {T}", False),
]


def shell_source(lines):
    return "test_lock_dirty() {\n" + "\n".join(lines) + "\n}\n"


def bash_observes(source):
    run = subprocess.run(
        ["bash", "-c", source + "test_lock_dirty\n"],
        capture_output=True, encoding="utf-8", errors="replace", timeout=10)
    return run.returncode, run.stdout, run.stderr


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


if __name__ == "__main__":
    rng = random.Random(SEED)
    arm1(random.Random(rng.random()))
    arm2(random.Random(rng.random()))
