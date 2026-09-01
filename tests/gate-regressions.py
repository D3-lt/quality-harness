#!/usr/bin/env python3
"""Focused false-green controls for the quality-harness ADR gates."""

import importlib.machinery
import importlib.util
import contextlib
import io
import io
import os
import re
import subprocess
import sys
import time
import tempfile
from contextlib import redirect_stdout
from pathlib import Path

sys.dont_write_bytecode = True


def load_script(name, path):
    loader = importlib.machinery.SourceFileLoader(name, str(path))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


def test_abnormal_mutant_termination(verify):
    """A crashed fence is never mistaken for an assertion that killed a mutant."""
    for code in (-11, 137, 139, 0xC0000005, 0xC0000409):
        assert verify.abnormal_termination(code, ""), code
    assert verify.abnormal_termination(
        1, "/bin/bash: line 1: 42 Segmentation fault (core dumped) python3 test.py")
    assert verify.abnormal_termination(1, "Fatal Python error: Aborted")
    for code, output in (
            (0, "1 passed"),
            (1, "AssertionError: expected 1, got 2"),
            (1, "expected output not to contain segmentation fault"),
            (2, "SyntaxError: invalid syntax"),
            (128, ""),
            (193, "")):
        assert not verify.abnormal_termination(code, output), (code, output)

    print("PASS — abnormal mutant termination is inconclusive")


# The one grammar both `Enforced-by:` parsers must implement. Mirrored verbatim
# in tests/lifecycle.test.mjs — a rule with two implementations is only shared if
# something compares them, and these two disagreed on three of these seven.
ENFORCEMENT_GRAMMAR = [
    ("`a`, `b`", ["a", "b"]),
    ("a, b", ["a", "b"]),
    ("adr-lint", ["adr-lint"]),
    ("None — a naming convention", []),
    ("nonetheless-a-real-pointer", ["nonetheless-a-real-pointer"]),
    ("<the check>", []),
    ("`one`, two", ["one", "two"]),
    ("`a label, with a comma`", ["a label, with a comma"]),
]


# The one glob grammar both `Governs:` matchers must implement. Mirrored
# verbatim in tests/lifecycle.test.mjs, for the same reason ENFORCEMENT_GRAMMAR
# is: `**` crosses separators and `*` does not, and two implementations of that
# rule are only shared if something compares them.
GOVERNS_MATCH_GRAMMAR = [
    ("plugin/bin/adr-lint", "plugin/bin/**", True),
    ("plugin/bin/adr-lint", "plugin/bin/*", True),
    ("plugin/bin/nested/x", "plugin/bin/*", False),
    ("plugin/bin/nested/x", "plugin/bin/**", True),
    ("plugin/bin/adr-lint", "plugin/bin", True),
    ("plugin/bin/adr-lint", "plugin/bin/adr-lint", True),
    ("plugin/bin/adr-lint", "plugin/bin/adr-lin", False),
    ("plugin/binx/adr-lint", "plugin/bin", False),
    ("plugin/bin/adr-lint", "plugin\\bin\\**", True),
    ("plugin/bin/adr-lint", "./plugin/bin/**", True),
    ("plugin/bin/adr-lint", "plugin/bin/", True),
    ("tests/mutations.json", "tests/mutations.json", True),
    ("tests/mutations.json", "tests/mutations?json", True),
    ("tests/mutations.json", "", False),
]


# The one disposition grammar all THREE gates must implement. adr-lint, adr-debt
# and adr-retire-check each carry their own copy of `disposition_span` — they are
# standalone scripts with no import path between them (ADR-011: a shared file
# under bin/ acquires a generated forwarder) — so the copies are only shared if
# something compares them. Each row is (line, expected inner text or None).
#
# The rows that pay for the table, measured 2026-08-28 (docs/BACKLOG.md §37): a
# NESTED `()` inside the disposition made every one of the three misread it,
# because `[^)]*` cannot cross the `)` of the inner pair.
DISPOSITION_GRAMMAR = [
    ("- A (permanent: by design)", "permanent: by design"),
    ("- A (permanent)", "permanent"),
    ("- A (deferred: docs/BACKLOG.md §37)", "deferred: docs/BACKLOG.md §37"),
    # THE DEFECT. Every gate reported something false about this line.
    ("- A (permanent: the `archive()` helper keeps originals)",
     "permanent: the `archive()` helper keeps originals"),
    ("- A (deferred: notes.md, see `foo(1)` for why)",
     "deferred: notes.md, see `foo(1)` for why"),
    # Two levels deep, and an inner pair that is empty.
    ("- A (permanent: f(g(x)) is fine)", "permanent: f(g(x)) is fine"),
    # A parenthetical that is not a disposition is not one.
    ("- A (see also)", None),
    ("- A (permanently unavailable)", None),
    ("- A no parenthetical at all", None),
    # Unbalanced: there is nothing to return, and guessing would invent a span.
    ("- A (permanent: unclosed", None),
    # The FIRST disposition-shaped group wins, and it is the caller's job to
    # decide whether ending the line matters. adr-lint requires that; adr-debt's
    # architecture.md scan deliberately does not.
    ("- A (deferred: x) and (permanent: y)", "deferred: x"),
]


# What may follow a disposition and still leave it closing the bullet. All THREE
# gates carry a copy of `closes_the_line`, so the rows are run against all three.
#
# Reported 2026-08-29 against v2.31.1 from an adopting corpus: `(deferred: x).`
# — a well-formed pointer with a full stop after it — was rejected, and adr-debt
# then printed BROKEN [malformed] with an EMPTY pointer, which is the vocabulary
# for "nothing after the colon". All 15 of that corpus's broken-pointer findings
# were this shape, blocking at exit 1. The `.` predates v2.31.1; the old regex
# anchored on `\)\s*$`, which allows whitespace and nothing else.
CLOSES_THE_LINE = [
    ("- A (permanent: why)", True),
    ("- A (permanent: why).", True),
    ("- A (deferred: notes.md).", True),
    ("- A (deferred: notes.md);", True),
    ("- A (deferred: notes.md) ", True),
    ("- A (deferred: notes.md) .", True),
    # A SECOND PARENTHETICAL IS NOT PUNCTUATION, and this row is the reason the
    # end-of-bullet rule is narrowed rather than dropped.
    ("- A (permanent: why) (see also)", False),
    ("- A (permanent: why) and more prose", False),
]


# The one sha grammar the WRITER and the READERS must agree on. Mirrored between
# adr-lint and adr-verify — six literal copies of the pattern before ADR-011's
# successor, and the writer emitted a width no copy accepted.
#
# The boundaries are not typed: 4 came from `git -c core.abbrev=4 rev-parse
# --short HEAD`, and 64 from a real `git init --object-format=sha256` repository
# (9ae7b849…, measured 2026-08-29). A hand-invented width is a guess about what
# git does; these are what it did.
SHA_GRAMMAR = [
    ("6aaf", True),                                                     # core.abbrev=4
    ("6aafd94", True),                                                  # git's default here
    ("6aafd948f3d8cca6c4be10aaf95514c46609b3be", True),                 # full SHA-1
    ("9ae7b8494baf383e0ed2b53238a961316e6dcdd284dfad3e83361e95557de407", True),  # full SHA-256
    ("6aaf*", True),                                                    # dirty tree
    ("no-git", True),                                                   # outside a repository
    ("6aa", False),                                                     # narrower than git allows
    ("9ae7b8494baf383e0ed2b53238a961316e6dcdd284dfad3e83361e95557de4077", False),  # 65
    ("6aafd9g", False),                                                 # not hex
    ("", False),
]


def verification_errors(lint, acceptance, entries, mlog=()):
    infos = {
        "T1": {
            "human": False,
            "vlog": entries,
            "mlog": list(mlog),
            "acc_all": acceptance,
            "acc_first": acceptance.splitlines()[0],
        }
    }
    # The REAL findings type, not a bare list: `.advise` is a second channel and
    # a plain list silently has no such method, so a check that advises would
    # raise here rather than be measured.
    errors = lint.Findings()
    lint.check_verification(infos, "| T1 | probe | done |", errors)
    return errors


def test_permanent_disposition_citations(bin_dir, lint):
    """Typed permanent bases are advised through the shipped CLI path."""
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        root = base / "repo"
        root.mkdir()
        subprocess.run(["git", "init", "-q", str(root)], check=True)
        evidence = root / "docs" / "evidence.md"
        evidence.parent.mkdir()
        evidence.write_text("first line\nsecond line\n", encoding="utf-8")
        deleted = root / "docs" / "deleted-after-index.md"
        deleted.write_text("tracked, then removed\n", encoding="utf-8")
        untracked = root / "docs" / "same-change.md"
        untracked.write_text("new receipt\n", encoding="utf-8")
        subprocess.run(
            ["git", "-C", str(root), "add", "docs/evidence.md", "docs/deleted-after-index.md"],
            check=True)
        deleted.unlink()

        def lint_disposition(disposition, repository=root, env=None):
            record = repository / "ADR-001-probe.md"
            record.write_text(
                "# ADR-001: Probe\n\n"
                "**Status:** Proposed\n"
                "**Spec:** None — no spec stage\n"
                "**Served-path change:** None — lint fixture only\n\n"
                "## Alternatives Considered\n\n- Keep the old form.\n\n"
                "## Wiring & Contract Changes\n\nNone — implementation-internal only.\n\n"
                f"## Out of Scope\n\n- Probe entry ({disposition})\n",
                encoding="utf-8")
            return subprocess.run(
                [sys.executable, str(Path(bin_dir).resolve() / "adr-lint"), str(record)],
                cwd=repository, capture_output=True, text=True, env=env)

        def assert_clean(disposition):
            result = lint_disposition(disposition)
            assert result.returncode == 0, result.stdout + result.stderr
            assert "permanent basis" not in result.stdout, result.stdout

        def assert_advice(disposition, *words):
            result = lint_disposition(disposition)
            assert result.returncode == 0, result.stdout + result.stderr
            # `permanent basis` now carries the entry it is about between it and
            # the colon (GitHub issue #5), so the marker is the phrase rather
            # than the phrase-plus-colon it used to be.
            assert "permanent basis" in result.stdout, result.stdout
            lowered = result.stdout.lower()
            assert all(word.lower() in lowered for word in words), result.stdout

        for valid in (
            "permanent: boundary: this decision chooses the limit",
            "permanent: boundary: the `helper()` call remains outside (by design)",
            "permanent: fact: the receipt has two lines; citation: file `docs/evidence.md:2`",
            "permanent: fact: this file lands in the same change; citation: file `docs/same-change.md:1`",
            "permanent: fact: the package behavior is versioned; citation: version `@scope/name@1.2.3`",
            "permanent: fact: the publisher documents it; citation: url https://example.invalid",
            "permanent: fact: the publisher documents it; citation: url https://example.invalid/receipt",
        ):
            assert_clean(valid)

        deferred = lint_disposition("deferred: docs/BACKLOG.md §1")
        assert deferred.returncode == 0, deferred.stdout + deferred.stderr
        assert "permanent basis" not in deferred.stdout, deferred.stdout

        for legacy in ("permanent", "permanent: remembered reason"):
            assert_advice(legacy, "classify", "boundary", "fact")

        malformed = (
            ("permanent: boundary:   ", ("accepted forms",)),
            ("permanent: fact: ; citation: version `name@1`", ("non-empty",)),
            ("permanent: boundary: chosen; citation: url https://example.invalid",
             ("boundary", "citation")),
            ("permanent: fact: unsupported claim", ("citation",)),
            ("permanent: fact: unsupported claim; citation: docs/evidence.md:2",
             ("typed receipt",)),
            ("permanent: fact: unsupported; citation: file `docs/evidence.md:2`; citation: version `x@1`",
             ("exactly one",)),
            ("permanent: fact: unsupported; citation: file `docs/evidence.md:2` trailing",
             ("typed receipt",)),
            ("permanent: Boundary: chosen", ("accepted forms",)),
            ("permanent:  boundary: chosen", ("accepted forms",)),
            ("permanent: fact: unsupported; citation: url HTTPS://example.invalid",
             ("lowercase", "https")),
            ("permanent: fact: unsupported; citation: url https:///receipt",
             ("host",)),
            ("permanent: fact: unsupported; citation: url https://example.invalid\\evil",
             ("host",)),
            ("permanent: fact: unsupported; citation: url https://bad_host.invalid",
             ("valid", "host")),
            ("permanent: fact: unsupported; citation: url https://example.invalid/path?",
             ("host", "optional path")),
            ("permanent: fact: unsupported; citation: url https://example.invalid/path#",
             ("host", "optional path")),
            ("permanent: fact: unsupported; citation: url https://@example.invalid/path",
             ("host", "optional path")),
            ("permanent: fact: unsupported; citation: file `../outside.md:1`",
             ("leaves the repository",)),
            ("permanent: fact: unsupported; citation: file `docs/missing.md:1`",
             ("not a repository candidate",)),
            ("permanent: fact: unsupported; citation: file `docs/deleted-after-index.md:1`",
             ("absent", "working tree")),
            ("permanent: fact: unsupported; citation: file `docs/evidence.md:0`",
             ("positive", "line")),
            ("permanent: fact: unsupported; citation: file `docs/evidence.md:3`",
             ("line 3", "does not exist")),
        )
        for disposition, words in malformed:
            assert_advice(disposition, *words)
        assert_advice(
            "permanent: fact: unsupported; citation: file `docs/evidence.md:" +
            "9" * 5000 + "`",
            "line number", "too large")
        low_limit_env = dict(os.environ, PYTHONINTMAXSTRDIGITS="640")
        low_limit = lint_disposition(
            "permanent: fact: unsupported; citation: file `docs/evidence.md:" +
            "9" * 700 + "`",
            env=low_limit_env)
        assert low_limit.returncode == 0, low_limit.stdout + low_limit.stderr
        assert "permanent basis" in low_limit.stdout and "line" in low_limit.stdout.lower(), \
            low_limit.stdout

        outside = base / "outside"
        outside.mkdir()
        outside_evidence = outside / "evidence.md"
        outside_evidence.write_text("outside\n", encoding="utf-8")
        link = root / "linked"
        if sys.platform == "win32":
            junction = subprocess.run(
                ["cmd.exe", "/d", "/c", "mklink", "/J", str(link), str(outside)],
                capture_output=True, text=True)
            assert junction.returncode == 0, junction.stdout + junction.stderr
        else:
            link.symlink_to(outside, target_is_directory=True)
        blob = subprocess.run(
            ["git", "-C", str(root), "hash-object", "-w", str(outside_evidence)],
            check=True, capture_output=True, text=True).stdout.strip()
        subprocess.run(
            ["git", "-C", str(root), "update-index", "--add", "--cacheinfo",
             f"100644,{blob},linked/evidence.md"], check=True)
        assert_advice(
            "permanent: fact: the linked receipt escapes; citation: file `linked/evidence.md:1`",
            "leaves the repository")

        if sys.platform != "win32":
            (root / "loop-a").symlink_to(root / "loop-b")
            (root / "loop-b").symlink_to(root / "loop-a")
            subprocess.run(
                ["git", "-C", str(root), "update-index", "--add", "--cacheinfo",
                 f"100644,{blob},loop-a/evidence.md"], check=True)
            assert_advice(
                "permanent: fact: this path loops; citation: file `loop-a/evidence.md:1`",
                "could not")

        no_git = base / "not-a-repository"
        no_git.mkdir()
        unknown = lint_disposition(
            "permanent: fact: git cannot classify this; citation: file `docs/evidence.md:1`",
            no_git)
        assert unknown.returncode == 0, unknown.stdout + unknown.stderr
        assert "could not validate" in unknown.stdout.lower(), unknown.stdout
        assert "not a repository candidate" not in unknown.stdout.lower(), unknown.stdout

        read_errors = lint.Findings()
        lint._check_permanent_file_citation(
            "docs/evidence.md:2", root, {"docs/evidence.md"}, read_errors,
            read_text=lambda _path: (_ for _ in ()).throw(OSError("denied")))
        assert any("could not read" in item.lower() for item in read_errors.advice), \
            read_errors.advice
        assert not any("not a repository candidate" in item.lower()
                       for item in read_errors.advice), read_errors.advice

        loop_errors = lint.Findings()
        lint._check_permanent_file_citation(
            "docs/evidence.md:2", root, {"docs/evidence.md"}, loop_errors,
            resolve_path=lambda _path: (_ for _ in ()).throw(RuntimeError("symlink loop")))
        assert any("could not validate" in item.lower() for item in loop_errors.advice), \
            loop_errors.advice

        def external_receipt_must_not_ask_git(inner):
            findings = lint.Findings()
            lint.check_permanent_disposition(
                inner, root / "ADR-001-probe.md", findings, root,
                lambda: (_ for _ in ()).throw(
                    AssertionError("an external receipt asked git for file candidates")))
            assert findings.advice == [], findings.advice

        external_receipt_must_not_ask_git(
            "permanent: fact: package behavior; citation: version `@scope/name@1.2.3`")
        external_receipt_must_not_ask_git(
            "permanent: fact: published behavior; citation: url https://example.invalid/path")

        plugin_root = Path(bin_dir).resolve().parent
        debt_text = (plugin_root / "bin" / "adr-debt").read_text(encoding="utf-8")
        mcp_text = (plugin_root / "bin" / "qh-mcp").read_text(encoding="utf-8")
        for text in (debt_text, mcp_text):
            lowered = text.lower()
            assert re.search(
                r"chosen boundaries.*cited facts.*(?:not reported|unswept|neither.*reported)",
                lowered, re.S), lowered
        for relative in (
            "templates/adr-template.md",
            "skills/adr-write/SKILL.md",
            "skills/adr-write/references/lessons.md",
        ):
            guidance = (plugin_root / relative).read_text(encoding="utf-8")
            assert "(permanent: boundary: <reason>)" in guidance, relative
            assert "(permanent: fact: <claim>; citation: <typed receipt>)" in guidance, relative
            assert "(deferred: <pointer>)" in guidance or "`deferred`" in guidance, relative
            assert "legacy" in guidance.lower() and "advice" in guidance.lower(), relative

    print("PASS — permanent disposition citations")


def test_proof_map_contract(bin_dir, lint):
    """Proof-map v1 has one closed grammar shared by parser and guidance."""
    def findings(ordered, rows, header="**Proof map:** v1", newline="\n"):
        source = newline.join([
            "# Task ADR-999-T1: proof-map probe",
            "",
            header,
            "",
            "## Ordered Steps",
            "",
            *ordered,
            "",
            "## Tests",
            "",
            "| Test name | File | Verifies | Covers | Steps |",
            "|-----------|------|----------|--------|-------|",
            *rows,
        ])
        errors = lint.Findings()
        lint.check_step_proof_map(
            Path("T1-proof-map-probe.md"), source, lint.sections_of(source), errors)
        return errors

    valid_steps = [
        "1. [S10] Write the failing test first.",
        "   1. [S999] This nested example is content, not a task step.",
        "   Continuation text stays attached to S10.",
        "2. [S2] Exercise the fence. [proof: acceptance]",
        "3. [S7] Kill the behavioral mutant. [proof: mutation]",
        "4. [S3] Inspect the rendered result.",
        "   [proof: human: compare both outputs]",
    ]
    valid_rows = [
        "| `test_red` | `tests/test_gate.py` | handles escaped \\| content | — | S10 |",
        "| supplementary | `tests/test_gate.py` | extra coverage | — | — |",
    ]
    assert not findings(valid_steps, valid_rows), "the complete v1 map must pass"
    assert not findings(valid_steps, valid_rows, newline="\r\n"), \
        "CRLF must not change proof-map grammar"
    indented_steps = [f" {line}" for line in valid_steps]
    assert not findings(indented_steps, valid_rows), \
        "CommonMark permits top-level list markers to be indented up to three spaces"
    even_slashes = [
        "| `test_red` | `tests/test_gate.py` | ends in \\\\| — | S10 |",
        valid_rows[1],
    ]
    assert not findings(valid_steps, even_slashes), \
        "an even backslash run does not escape the following table separator"

    moved = [valid_steps[3], valid_steps[0], *valid_steps[1:3], *valid_steps[4:]]
    assert not findings(moved, valid_rows), \
        "step identity must survive list reordering independently of ordinals"

    for bad_id in ("[S0]", "[S01]", "[s1]", "no-id"):
        errors = findings([f"1. {bad_id} Write the failing test."], valid_rows)
        assert errors, f"invalid stable step identity passed: {bad_id}"

    errors = findings(
        ["1. [S1] Write the failing test.", "2. [S1] Implement it. [proof: acceptance]"],
        ["| `t` | `f` | v | — | S1 |"])
    assert any("duplicate" in error.lower() for error in errors), errors

    for cell in ("S1-S3", "S*", "all", "S1, S1", "S01", "S1 prose"):
        errors = findings(["1. [S1] Write the failing test."],
                          [f"| `t` | `f` | v | — | {cell} |"])
        assert any("invalid Steps cell" in error for error in errors), (cell, errors)

    dangling = findings(["1. [S1] Write the failing test."],
                        ["| `t` | `f` | v | — | S9 |"])
    assert any("S9" in error and "no Ordered Step" in error for error in dangling), dangling
    uncovered = findings(["1. [S1] Write the failing test."],
                         ["| t | f | v | — | — |"])
    assert any("S1" in error and "not referenced" in error for error in uncovered), uncovered

    empty_human = findings(
        ["1. [S1] Write the failing test. [proof: human: ]"],
        ["| t | f | v | — | — |"])
    assert any("S1" in error and "no valid proof marker" in error
               for error in empty_human), empty_human
    no_space_human = findings(
        ["1. [S1] Write the failing test. [proof: human:reason]"],
        ["| `t` | `f` | v | — | — |"])
    assert any("S1" in error and "no valid proof marker" in error
               for error in no_space_human), no_space_human
    unknown_marker = findings(
        ["1. [S1] Write the failing test. [proof: review]"],
        ["| t | f | v | — | — |"])
    assert any("S1" in error and "no valid proof marker" in error
               for error in unknown_marker), unknown_marker
    fenced_marker = findings(
        ["1. [S1] Write the failing test.", "   ```text",
         "   [proof: acceptance]", "   ```"],
        ["| t | f | v | — | — |"])
    assert any("S1" in error and "no valid proof marker" in error
               for error in fenced_marker), fenced_marker
    tilde_marker = findings(
        ["1. [S1] Write the failing test.", "   ~~~text",
         "   [proof: acceptance]", "   ~~~"],
        ["| `t` | `f` | v | — | — |"])
    assert any("S1" in error and "no valid proof marker" in error
               for error in tilde_marker), tilde_marker
    indented_fence = findings(
        [" 1. [S1] Write the failing test.", "    ```text",
         "    [proof: acceptance]", "    ```"],
        ["| `t` | `f` | v | — | — |"])
    assert any("S1" in error and "no valid proof marker" in error
               for error in indented_fence), indented_fence
    misleading_close = findings(
        ["1. [S1] Write the failing test.", "   ````text",
         "   ````still code", "   [proof: acceptance]",
         "   ````also code", "   ````"],
        ["| `t` | `f` | v | — | — |"])
    assert any("S1" in error and "no valid proof marker" in error
               for error in misleading_close), misleading_close

    unretained = findings(["1. [S1] Write the failing test."],
                          ["| t | f | v | — | S1 |"])
    assert any("does not retain it" in error for error in unretained), unretained

    missing_column = findings(
        ["1. [S1] Write the failing test. [proof: acceptance]"],
        ["| t | f | v | — |"])
    # Change the header independently: a short data row with a sound header has
    # a different, row-specific finding.
    short_source = "\n".join([
        "**Proof map:** v1", "", "## Ordered Steps", "",
        "1. [S1] Write the failing test. [proof: acceptance]", "", "## Tests", "",
        "| Test name | File | Verifies | Covers |",
        "|-----------|------|----------|--------|",
        "| t | f | v | — |",
    ])
    column_errors = lint.Findings()
    lint.check_step_proof_map(Path("T1.md"), short_source,
                              lint.sections_of(short_source), column_errors)
    assert any("Steps" in error and "fifth" in error for error in column_errors), column_errors
    assert missing_column, "a v1 data row with no fifth cell must be rejected"

    extra_source = short_source.replace(
        "| Test name | File | Verifies | Covers |",
        "| Test name | File | Verifies | Covers | Steps | Extra |").replace(
        "|-----------|------|----------|--------|",
        "|-----------|------|----------|--------|-------|-------|").replace(
        "| t | f | v | — |", "| `t` | `f` | v | — | S1 | extra |")
    extra_errors = lint.Findings()
    lint.check_step_proof_map(Path("T1.md"), extra_source,
                              lint.sections_of(extra_source), extra_errors)
    assert any("exactly five" in error for error in extra_errors), extra_errors

    short_separator = "\n".join([
        "**Proof map:** v1", "", "## Ordered Steps", "",
        "1. [S1] Write the failing test.", "", "## Tests", "",
        "| Test name | File | Verifies | Covers | Steps |",
        "|-----------|------|----------|--------|",
        "| `t` | `f` | v | — | S1 |",
    ])
    separator_errors = lint.Findings()
    lint.check_step_proof_map(Path("T1.md"), short_separator,
                              lint.sections_of(short_separator), separator_errors)
    assert any("separator" in error and "five" in error
               for error in separator_errors), separator_errors

    no_separator = short_separator.replace(
        "|-----------|------|----------|--------|\n", "").replace(
        "| Test name | File | Verifies | Covers | Steps |",
        "| Test name | File | Verifies | Covers | Steps |")
    no_separator_errors = lint.Findings()
    lint.check_step_proof_map(Path("T1.md"), no_separator,
                              lint.sections_of(no_separator), no_separator_errors)
    assert any("separator" in error for error in no_separator_errors), no_separator_errors

    fenced_table = "\n".join([
        "**Proof map:** v1", "", "## Ordered Steps", "",
        "1. [S1] Write the failing test.", "", "## Tests", "", "```markdown",
        "| Test name | File | Verifies | Covers | Steps |",
        "|-----------|------|----------|--------|-------|",
        "| `t` | `f` | v | — | S1 |", "```",
    ])
    fenced_errors = lint.Findings()
    lint.check_step_proof_map(Path("T1.md"), fenced_table,
                              lint.sections_of(fenced_table), fenced_errors)
    assert any("Tests table" in error for error in fenced_errors), fenced_errors
    tilde_table = fenced_table.replace("```markdown", "~~~markdown").replace("```", "~~~")
    tilde_errors = lint.Findings()
    lint.check_step_proof_map(Path("T1.md"), tilde_table,
                              lint.sections_of(tilde_table), tilde_errors)
    assert any("Tests table" in error for error in tilde_errors), tilde_errors

    indented_table = "\n".join([
        "**Proof map:** v1", "", "## Ordered Steps", "",
        "1. [S1] Write the failing test.", "", "## Tests", "",
        "    | Test name | File | Verifies | Covers | Steps |",
        "    |-----------|------|----------|--------|-------|",
        "    | `t` | `f` | v | — | S1 |",
    ])
    indented_table_errors = lint.Findings()
    lint.check_step_proof_map(Path("T1.md"), indented_table,
                              lint.sections_of(indented_table), indented_table_errors)
    assert any("Tests table" in error for error in indented_table_errors), \
        indented_table_errors

    commented_table = fenced_table.replace("```markdown", "<!--").replace("```", "-->")
    commented_table_errors = lint.Findings()
    lint.check_step_proof_map(Path("T1.md"), commented_table,
                              lint.sections_of(commented_table), commented_table_errors)
    assert any("Tests table" in error for error in commented_table_errors), \
        commented_table_errors

    indented_code_marker = findings(
        ["1. [S1] Write the failing test.", "       [proof: acceptance]"],
        ["| `t` | `f` | v | — | — |"])
    assert any("S1" in error and "no valid proof marker" in error
               for error in indented_code_marker), indented_code_marker
    commented_marker = findings(
        ["1. [S1] Write the failing test.", "   <!-- [proof: acceptance] -->"],
        ["| `t` | `f` | v | — | — |"])
    assert any("S1" in error and "no valid proof marker" in error
               for error in commented_marker), commented_marker

    for header in ("**Proof map:**", "**Proof map:** v2"):
        errors = findings(valid_steps, valid_rows, header=header)
        assert errors, f"a present unsupported proof-map header passed: {header}"

    commented_header = "\n".join([
        "<!--", "**Proof map:** v1", "-->", "", "## Ordered Steps", "",
        *valid_steps, "", "## Tests", "",
        "| Test name | File | Verifies | Covers | Steps |",
        "|-----------|------|----------|--------|-------|", *valid_rows,
    ])
    commented_header_errors = lint.Findings()
    lint.check_step_proof_map(Path("T1.md"), commented_header,
                              lint.sections_of(commented_header), commented_header_errors)
    assert not commented_header_errors, commented_header_errors
    assert len(commented_header_errors.advice) == 1, commented_header_errors.advice

    legacy = findings(valid_steps, valid_rows, header="")
    assert not legacy, legacy
    proof_advice = [item for item in legacy.advice
                    if "Proof map: v1" in item and "not checked" in item]
    assert len(proof_advice) == 1, legacy.advice
    shown_later = findings(
        [*valid_steps, "```text", "**Proof map:** v1", "```"],
        valid_rows, header="")
    assert not shown_later and len(shown_later.advice) == 1, shown_later.advice

    legacy_tilde_heading = "\n".join([
        "## Acceptance", "", "```bash", "true", "```", "~~~markdown",
        "## Acceptance", "shown example only", "~~~", "", "## Tests", "",
    ])
    legacy_sections = lint.sections_of(legacy_tilde_heading)
    assert "```bash" not in "\n".join(legacy_sections["Acceptance"])
    assert "shown example only" in legacy_sections["Acceptance"]

    plugin_root = Path(bin_dir).resolve().parent
    template = (plugin_root / "templates" / "task-template.md").read_text(encoding="utf-8")
    skill = (plugin_root / "skills" / "adr-write" / "SKILL.md").read_text(encoding="utf-8")
    required = (
        "**Proof map:** v1",
        "[S<n>]",
        "| Test name | File | Verifies | Covers | Steps |",
        "[proof: acceptance]",
        "[proof: mutation]",
        "[proof: human: <reason>]",
    )
    for phrase in required:
        assert phrase in template, (phrase, "task template")
        assert phrase in skill, (phrase, "adr-write skill")

    print("PASS — proof-map v1 contract")


def main():
    if len(sys.argv) != 4:
        raise SystemExit(
            "usage: gate-regressions.py <payload-bin> <postmortem-skill> <repo-root>")
    bin_dir = Path(sys.argv[1])
    # ADR-008 moved the gates under `plugin/`, so bin/'s parent is no longer the
    # repository. The two roots are different things now — the tree a record is
    # linted IN, and the tree the gate ships in — and a script needing both is
    # given both rather than deriving one from the other.
    repo_root = Path(sys.argv[3]).resolve()
    lint = load_script("adr_lint_regressions", bin_dir / "adr-lint")
    verify = load_script("adr_verify_regressions", bin_dir / "adr-verify")
    spec_gate = load_script("spec_verify_regressions", bin_dir / "spec-verify")
    arch_gate = load_script("arch_lint_regressions", bin_dir / "arch-lint")
    retire = load_script("adr_retire_regressions", bin_dir / "adr-retire-check")
    debt = load_script("adr_debt_regressions", bin_dir / "adr-debt")
    test_abnormal_mutant_termination(verify)
    test_permanent_disposition_citations(bin_dir, lint)
    test_proof_map_contract(bin_dir, lint)
    test_a_digestless_row_must_already_be_committed(lint)
    test_the_expected_digest_is_not_printed(lint)
    test_a_permanent_advisory_names_its_entry(lint)

    acceptance = "printf first\nprintf second"
    digest = verify.acceptance_digest(verify.normalize_acceptance(acceptance))
    assert digest == lint.acceptance_digest(lint.normalize_acceptance(acceptance))
    # Three-way, not two: adr-next decides what is DONE from the same digest, so a
    # third implementation drifting would make it call verified tasks unverified
    # and hand a session work that is already finished.
    nxt = load_script("adr_next_regressions", bin_dir / "adr-next")
    test_an_entry_records_how_long_the_run_took(bin_dir, lint, verify, nxt)
    test_the_floor_runs_on_a_done_row(lint)
    test_a_digestless_row_cannot_hide_behind_a_duration(bin_dir, lint)
    test_a_committed_evidence_row_that_has_gone_missing_is_reported(bin_dir, lint)
    test_a_fence_declaration_is_read_or_reported(bin_dir, lint, repo_root)
    test_the_rests_on_grammar_has_one_meaning(lint, verify)
    test_covers_binds_a_killed_mutant_to_a_declared_mechanism(bin_dir, lint, verify, repo_root)
    import hashlib as _h
    assert digest == _h.sha256(nxt.normalize_acceptance(acceptance).encode("utf-8")).hexdigest()
    # And the normalizers themselves must agree, not merely their digests here.
    for raw in ("  \n printf a\n\n", "printf a\r\nprintf b\r\n", "\n\nprintf a\n\n\n"):
        assert (verify.normalize_acceptance(raw)
                == lint.normalize_acceptance(raw)
                == nxt.normalize_acceptance(raw)), raw

    # is_done's two true arms — the reason a hand-typed `done` cannot make a task
    # disappear from the ready list.
    done_digest = _h.sha256(nxt.normalize_acceptance("printf a").encode("utf-8")).hexdigest()
    entry = f"## Verification Log\n- 2026-08-22 · no-git · exit 0 · `printf a` · acceptance-sha256:{done_digest}\n"
    assert nxt.is_done(entry, done_digest, False)
    # A failing run is not done, and neither is evidence for a different fence.
    failed = entry.replace("exit 0", "exit 1")
    assert not nxt.is_done(failed, done_digest, False)
    assert not nxt.is_done(entry, "0" * 64, False)
    # A human-observed task needs its sign-off, and only that.
    human = "## Verification Log\n- 2026-08-22 · human-observed · Zy read it end to end\n"
    assert nxt.is_done(human, None, True)
    assert not nxt.is_done("## Verification Log\n", None, True)
    current = (
        "- 2026-08-22 · no-git · exit 0 · `printf first …` · "
        f"acceptance-sha256:{digest}"
    )
    assert verification_errors(lint, acceptance, [current]) == []
    assert verification_errors(lint, "printf first\nprintf changed", [current])

    legacy = "- 2026-08-21 · no-git · exit 0 · `printf first`"
    assert verification_errors(lint, "printf first", [legacy]) == []
    assert verification_errors(lint, acceptance, [legacy])
    legacy_multiline_display = "- 2026-08-21 · no-git · exit 0 · `printf first …`"
    assert verification_errors(lint, "printf first", [legacy_multiline_display])

    prefix = "- 2026-08-22 · no-git · mutant "
    suffix = f" · `src/a.py` · remove mechanism · acceptance-sha256:{digest}"
    assert lint.MLOG_RE.match(prefix + "killed · exit 1" + suffix)
    assert not lint.MLOG_RE.match(prefix + "killed · exit 0" + suffix)
    assert lint.MLOG_RE.match(prefix + "survived · exit 0" + suffix)
    assert not lint.MLOG_RE.match(prefix + "survived · exit 1" + suffix)
    assert lint.MLOG_RE.match(prefix + "inconclusive · exit 0" + suffix)
    assert lint.MLOG_RE.match(prefix + "inconclusive · exit 2" + suffix)

    # ADR-013 T1 — `a human-observed mutation row carries its diff and its failing test`.
    # A mutation is the EASIER of the two evidence kinds to perform by hand (edit a line,
    # run, read the code, revert), yet MLOG_RE had no human arm while VLOG_RE did.
    # Reported by wcag-43 as BACKLOG §74 against a task whose Acceptance contains a
    # blocked clause, so `adr-verify --mutant` cannot run the fence at all. The arm takes
    # their narrow proposal: a hand-written row must LOCATE the change, quote the diff and
    # NAME the test that went red, so a reader can re-run it. That keeps a forgeability
    # property rather than removing one.
    human_mut = (
        "- 2026-08-30 · human-observed · mutant killed · test exit 1 · "
        "`src/wcag_scanner/eval/scorer.py` · line 187 · "
        'from `if match_reason(r.mutated_node) == "right_reason":` · to `if True:` · '
        "test `test_reason_matching_counts_right_and_wrong_separately` · "
        "the fence's integration clause cannot run"
    )
    assert lint.MLOG_HUMAN_RE.match(human_mut), "a complete human row must parse"
    assert lint.MLOG_RE.match(human_mut), "and MLOG_RE must admit it via the shared arm"

    # Markdown's own code-span rule, so a mutated line may CONTAIN a backtick. 26 of this
    # repository's 343 tool mutations do, and the languages where that is routine — Go raw
    # strings, JS template literals, shell, Markdown — are what this plugin ships to.
    backticked = (
        "- 2026-08-30 · human-observed · mutant killed · test exit 1 · `x.go` · line 12 · "
        "from ``s := `raw` + x`` · to ``y := `q` `` · test `TestRaw` · fence needs a live db"
    )
    assert lint.MLOG_RE.match(backticked), \
        "a variable-length code span must carry a body containing backticks"
    # And the field separator itself may appear inside the diff, because the delimiters
    # bound it — three of the 343 contain ' · '.
    assert lint.MLOG_RE.match(
        "- 2026-08-30 · human-observed · mutant killed · test exit 2 · `x.py` · line 9 · "
        "from `a · b` · to `c · d` · test `t` · why"), "delimiters must bound the separator"
    # An ambiguous span — a two-backtick body that itself contains `` — is REFUSED,
    # not guessed at. The backreferenced spelling accepted it by lazily closing
    # early, which is how a row means one thing to the writer and another to the
    # reader. It is also the spelling that was catastrophically slow (_code_span).
    assert not lint.MLOG_RE.match(
        "- 2026-08-30 · human-observed · mutant killed · test exit 1 · `x.go` · line 12 · "
        "from ``s := `` `` · to `y` · test `T` · why"), "an ambiguous code span must be refused"
    # And the whole point of the rewrite: a row of backticks is REJECTED FAST.
    # 600 of them cost `where_it_stopped` 2.07s before this change and grew faster
    # than the square; a Mutation Log bullet is author-controlled and check_task
    # runs this per bullet, so the gate hung on a long line instead of reporting it.
    _t0 = time.perf_counter()
    _row = ("- 2026-08-30 · human-observed · mutant killed · test exit 1 · `x.py` · line 1 · "
            "from " + "`" * 4000 + "x")
    assert not lint.MLOG_RE.match(_row)
    lint.where_it_stopped(lint.MLOG_RE, _row)
    _dt = time.perf_counter() - _t0
    assert _dt < 1.0, f"rejecting a row of backticks must not backtrack: took {_dt:.3f}s"

    # Each incomplete variant is REFUSED, not advised: an incomplete claim is not a weaker
    # claim, it is an unreproducible one — a reader cannot re-run what the row does not name.
    for why, bad in (
        ("no test name", human_mut.split(" · test `")[0] + " · a why with no test"),
        ("no from/to",
         "- 2026-08-30 · human-observed · mutant killed · test exit 1 · `a.py` · line 3 · "
         "test `test_x` · why"),
        ("no line number", human_mut.replace(" · line 187", "")),
        ("a bare verdict",
         "- 2026-08-30 · human-observed · mutant killed · `src/a.py`"),
        ("an empty why", human_mut.rsplit(" · ", 1)[0] + " · "),
        # `test exit` carries the same non-zero constraint the tool arm's `exit` does, so a
        # row claiming a kill on a passing test is refused on its face.
        ("a kill on exit 0", human_mut.replace("test exit 1", "test exit 0")),
    ):
        assert not lint.MLOG_RE.match(bad), \
            f"a human-observed row with {why} must be refused: {bad!r}"

    # A location that cannot be pointed at is not a location. `line 0` names no
    # line in any file and `line 007` is not how one is written; both parsed until
    # a Codex review found them, and both would have produced a row a reader
    # cannot follow — the property the other refusals exist to protect.
    assert not lint.MLOG_RE.match(human_mut.replace("line 187", "line 0")), \
        "line 0 names no line and must be refused"
    assert not lint.MLOG_RE.match(human_mut.replace("line 187", "line 007")), \
        "a zero-padded line number must be refused rather than silently accepted"
    assert lint.MLOG_RE.match(human_mut.replace("line 187", "line 1")), \
        "line 1 is a real line and must still parse"

    # An EMPTY code span carries no diff, so `from` must hold at least one
    # character while `to` may be empty — deleting a line is a real mutation and
    # the row should be able to say so.
    assert not lint.MLOG_RE.match(human_mut.replace(
        'from `if match_reason(r.mutated_node) == "right_reason":`', "from ``")), \
        "an empty `from` names no change and must be refused"
    assert lint.MLOG_RE.match(human_mut.replace("to `if True:`", "to ``")), \
        "an empty `to` is a deletion and must still parse"

    # `an existing tool-written mutation row parses unchanged`. The arm widens a grammar two
    # gates share, so the original arms are asserted in the same test — a widening that
    # quietly changed one of them would otherwise pass.
    assert lint.MLOG_RE.match(prefix + "killed · exit 1" + suffix), "tool arm changed"
    assert not lint.MLOG_RE.match(prefix + "killed · exit 0" + suffix), "tool arm changed"
    assert not lint.MLOG_RE.match(prefix + "survived · exit 1" + suffix), "tool arm changed"
    # The human arm must not become a way past the tool arm's exit-code pairing.
    assert not lint.MLOG_RE.match(
        "- 2026-08-30 · human-observed · mutant killed · exit 0 · `src/a.py` · why"), \
        "the human arm must not reopen the killed/exit-0 pairing the tool arms refuse"

    # ADR-013 T1 step 3 — the arm proved through `check_task`, the caller that actually
    # refuses a row. Asserting the regex object alone tests the pattern; a reader reaches
    # it through here, and this is where a widening that never got wired would show up.
    def mlog_errors(row):
        with tempfile.TemporaryDirectory() as td:
            probe = Path(td) / "T9-probe.md"
            probe.write_text(
                "# Task X-T9: probe\n\n"
                "**Depends-on:** none\n**Covers:** none\n**Produces:** none\n"
                "**Consumes:** none\n\n"
                "## Goal\n\ng\n\n"
                "## Affected Files\n\n| File | Change | Why |\n|---|---|---|\n"
                "| `x.py` | edit | w |\n\n"
                "## Ordered Steps\n\n1. Write the failing test first.\n2. Then the rest.\n\n"
                "## Acceptance\n\n```bash\ntrue\n```\n\n"
                "## Tests\n\n| Test name | File | Verifies | Covers |\n|---|---|---|---|\n"
                "| t | f | v | — |\n\n"
                "## Invariants\n\n- i\n\n## Risks\n\n- r\n\n"
                "## Stop Condition\n\nstop\n\n## Out of Scope\n\n- none\n\n"
                "## Verification Log\n\n## Mutation Log\n\n" + row + "\n",
                encoding="utf-8")
            errs = lint.Findings()
            lint.check_task(probe, set(), errs)
            return [e for e in errs if "Mutation Log entry" in e]

    assert mlog_errors(human_mut) == [], \
        f"check_task must accept a complete human row: {mlog_errors(human_mut)}"
    assert mlog_errors(backticked) == [], "check_task must accept a backticked body"
    # The must-fail direction in the same test, without which an arm that accepted
    # everything would satisfy both assertions above (CLAUDE.md §4).
    assert mlog_errors(human_mut.replace("test exit 1", "test exit 0")), \
        "check_task must still refuse a kill claimed on a passing test"
    assert mlog_errors("- 2026-08-30 · human-observed · mutant killed · `src/a.py` · why"), \
        "check_task must still refuse a row that locates nothing"
    # And the refusal an author reads must NAME the lane, or nobody finds it.
    said = mlog_errors("- 2026-08-30 · human-observed · mutant killed · `src/a.py` · why")[0]
    assert "--human-mutant" in said and "cannot run" in said, \
        f"the refusal must tell an author the lane exists and when it applies: {said}"

    legacy_kill = (
        "- 2026-08-21 · no-git · mutant killed · exit 1 · "
        "`src/a.py` · old unbound kill"
    )
    mutation_info = {
        "T1": {
            "human": False,
            "path": Path("T1.md"),
            "vlog": [current],
            "mlog": [legacy_kill],
            "has_mlog": True,
            "acc_all": acceptance,
        }
    }
    mutation_errors = []
    lint.check_mutation_evidence(
        mutation_info, "| T1 | probe | done |", mutation_errors)
    assert mutation_errors
    mutation_info["T1"]["mlog"] = [prefix + "killed · exit 1" + suffix]
    mutation_errors = []
    lint.check_mutation_evidence(
        mutation_info, "| T1 | probe | done |", mutation_errors)
    assert mutation_errors == []

    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / "test_probe.py"
        source.write_text(
            '"""test_from_docstring"""\n'
            '# def test_from_comment(): pass\n'
            'NAME = "test_from_string"\n'
        )
        for name in ("test_from_docstring", "test_from_comment", "test_from_string"):
            assert spec_gate.test_definition_exists(source, name, None)[0] is False
        source.write_text(
            "def test_real():\n    assert True\n\n"
            "async def test_async():\n    assert True\n\n"
            "def helper():\n    return True\n\n"
            "class Utility:\n"
            "    def test_method(self):\n"
            "        assert True\n"
        )
        assert spec_gate.test_definition_exists(source, "test_real", None)[0] is True
        assert spec_gate.test_definition_exists(source, "test_async", None)[0] is True
        assert spec_gate.test_definition_exists(source, "helper", None)[0] is False
        assert spec_gate.test_definition_exists(source, "Utility::test_method", None)[0] is False

        source = (
            "class TestProbe:\n"
            "    def test_method(self):\n"
            "        assert True\n"
        )
        assert spec_gate.python_test_defined(source, "test_method")[0] is False
        assert spec_gate.python_test_defined(source, "TestProbe::test_method")[0] is True

        php = Path(tmp) / "ProbeTest.php"
        php.write_text(
            "<?php\n"
            "$fixture = <<<'TXT'\n"
            "function test_only_in_nowdoc() {}\n"
            "TXT;\n"
            "function helper() {}\n"
            "function test_real() {}\n"
        )
        assert spec_gate.test_definition_exists(php, "test_only_in_nowdoc", None)[0] is False
        assert spec_gate.test_definition_exists(php, "helper", None)[0] is False
        assert spec_gate.test_definition_exists(php, "test_real", None)[0] is False
        php.write_text(
            "<?php\n"
            "final class ProbeTest extends TestCase {\n"
            "    public function test_real() {}\n"
            "}\n"
        )
        assert spec_gate.test_definition_exists(php, "test_real", None)[0] is True
        php.write_text('<?php\n$helper->test("fake case", function () {});\n')
        assert spec_gate.test_definition_exists(php, "fake case", None)[0] is False
        php.write_text('<?php\nSuite::test("fake static", function () {});\n')
        assert spec_gate.test_definition_exists(php, "fake static", None)[0] is False

        javascript = Path(tmp) / "probe.test.js"
        javascript.write_text('helper.test("fake case", () => {});\n')
        assert spec_gate.test_definition_exists(javascript, "fake case", None)[0] is False
        javascript.write_text('test("real case", () => {});\n')
        assert spec_gate.test_definition_exists(javascript, "real case", None)[0] is True

        ruby = Path(tmp) / "probe_test.rb"
        ruby.write_text(
            "=begin\n"
            "def test_only_in_block_comment\nend\n"
            "=end\n"
            "def helper\nend\n"
            "def test_real\nend\n"
        )
        assert spec_gate.test_definition_exists(
            ruby, "test_only_in_block_comment", None)[0] is False
        assert spec_gate.test_definition_exists(ruby, "helper", None)[0] is False
        assert spec_gate.test_definition_exists(ruby, "test_real", None)[0] is True
        ruby.write_text('helper.it "fake case" do\nend\n')
        assert spec_gate.test_definition_exists(ruby, "fake case", None)[0] is False

        fake = Path(tmp) / "test_fake.py"
        fake.write_text(
            "def test_real():\n"
            "    # test_fake\n"
            "    marker = 'test_fake'\n"
            "    assert True\n"
        )
        infos = {
            "T1": {
                "human": False,
                "tests": [("test_fake", "test_fake.py")],
                "path": Path("T1.md"),
                "vlog": [current],
            }
        }
        identity_errors = []
        lint.check_tests_exist(infos, "| T1 | probe | done |", identity_errors, Path(tmp))
        lint.check_tests_can_fail(infos, "| T1 | probe | done |", identity_errors, Path(tmp))
        assert identity_errors

        empty = Path(tmp) / "test_empty.py"
        empty.write_text(
            "def test_empty():\n"
            "    pass\n\n"
            "def test_other():\n"
            "    assert True\n"
        )
        assert arch_gate.symbol_errors("row", "`test_empty`", [], [empty])

        mutation_infos = {
            "T1": {
                "human": False,
                "path": Path("T1.md"),
                "acc_all": acceptance,
                "vlog": [current],
                "mlog": [prefix + "killed · exit 1" + suffix],
                "has_mlog": True,
            }
        }
        mutation_errors = []
        lint.check_mutation_evidence(
            mutation_infos, "| T1 | probe | done |", mutation_errors)
        assert mutation_errors == []
        mutation_infos["T1"]["acc_all"] = "printf changed"
        mutation_errors = []
        lint.check_mutation_evidence(
            mutation_infos, "| T1 | probe | done |", mutation_errors)
        assert mutation_errors

        nested = Path(tmp) / "archive"
        nested.mkdir()
        unit = nested / "ADR-001-unit"
        unit.mkdir()
        (unit / "README.md").write_text(
            "# ADR-001 notes\n\n## Follow-ups\n\n- [ ] Preserve obligation.\n")
        assert retire.meaningful_obligations(nested)["ADR-001"] == 1
        assert retire.receipt_count(["- [ ] from ADR-0010"], "ADR-001") == 0
        assert retire.receipt_count(["- [ ] from ADR-001"], "ADR-001") == 1

        corpus = Path(tmp) / "corpus"
        active = corpus / "adr"
        archive = corpus / "adr-archive"
        decoy_dir = corpus / "other"
        active.mkdir(parents=True)
        archive.mkdir()
        decoy_dir.mkdir()
        archived = archive / "ADR-001-history.md"
        archived.write_text(
            "# ADR-001: History\n\n**Status:** Accepted\n\n"
            "## Decision\n\nHistorical choice.\n")
        decoy = decoy_dir / "ADR-001-decoy.md"
        decoy.write_text("# ADR-001: Decoy\n\n**Status:** Accepted\n")
        active_current = active / "ADR-002-current.md"
        active_current.write_text(
            "# ADR-002: Current\n\n**Status:** Accepted\n\n## Decision\n\nCurrent.\n")
        (active / "BACKLOG.md").write_text("# ADR Backlog\n\n## Follow-ups\n")
        archive_readme = archive / "README.md"

        def write_archive(effect="governing", obligations="none"):
            digest_value = retire.decision_unit_digest(archive, "ADR-001", archived)
            archive_readme.write_text(
                "# ADR Archive\n\n"
                "**Lifecycle:** Frozen historical ADR records\n"
                "**Active corpus:** ../adr\n"
                "**Retirement cutover:** 2026-08-22\n\n"
                "## Retired Records\n\n"
                "| ADR | Title | Decision effect | Retired | Reason | Obligations | SHA-256 |\n"
                "|-----|-------|-----------------|---------|--------|-------------|---------|\n"
                f"| [ADR-001](ADR-001-history.md) | History | {effect} | 2026-08-22 | old format | {obligations} | {digest_value} |\n")

        def retirement_exit():
            return subprocess.run(
                [sys.executable, str(bin_dir / "adr-retire-check"), str(archive_readme)],
                capture_output=True, text=True).returncode

        (active / "README.md").write_text(
            "# ADR Catalog\n\n"
            "| ADR | Title | Authority |\n|---|---|---|\n"
            "| [ADR-001](../other/ADR-001-decoy.md) | Decoy | governing |\n"
            "| [ADR-002](ADR-002-current.md) | Current | governing |\n")
        write_archive()
        assert retirement_exit() == 1

        (active / "README.md").write_text(
            "# ADR Catalog\n\n"
            "| ADR | Title | Authority |\n|---|---|---|\n"
            "| [ADR-001](../adr-archive/ADR-001-history.md) | History | governing |\n"
            "| [ADR-002](ADR-002-current.md) | Current | governing |\n")
        assert retirement_exit() == 0

        archived.write_text(
            "# ADR-001: History\n\n**Status:** Proposed\n\n"
            "## Decision\n\nHistorical choice.\n")
        write_archive()
        assert retirement_exit() == 1
        archived.write_text(
            "# ADR-001: History\n\n**Status:** Accepted with caveat\n\n"
            "## Decision\n\nHistorical choice.\n")
        write_archive()
        assert retirement_exit() == 1
        archived.write_text(
            "# ADR-001: History\n\n**Status:** Accepted\n\n"
            "## Decision\n\nHistorical choice.\n")
        write_archive()
        assert retirement_exit() == 0

        active_current.write_text(
            "# ADR-002: Current\n\n**Status:** Proposed\n\n## Decision\n\nCurrent.\n")
        (active / "README.md").write_text(
            "# ADR Catalog\n\n"
            "| ADR | Title | Authority |\n|---|---|---|\n"
            "| [ADR-002](ADR-002-current.md) | Current | governing |\n")
        write_archive("superseded by ADR-002")
        assert retirement_exit() == 1
        active_current.write_text(
            "# ADR-002: Current\n\n**Status:** Accepted\n\n## Decision\n\nCurrent.\n")
        assert retirement_exit() == 0
        active_current.write_text(
            "# ADR-002: Current\n\n**Status:** Accepted with caveat\n\n"
            "## Decision\n\nCurrent.\n")
        assert retirement_exit() == 1
        active_current.write_text(
            "# ADR-002: Current\n\n**Status:** Accepted\n\n## Decision\n\nCurrent.\n")

        archived.write_text(archived.read_text() + "\n## Follow-ups\n\n- [ ] Preserve work.\n")
        wrong_backlog = decoy_dir / "BACKLOG.md"
        wrong_backlog.write_text(
            "# Wrong Backlog\n\n## Follow-ups\n\n- [ ] Preserve ADR-001 work.\n")
        write_archive("superseded by ADR-002", "`../other/BACKLOG.md`")
        assert retirement_exit() == 1

        # An invalid active-corpus path must be rejected before adr_files can
        # traverse either that unrelated directory or the archive itself.
        unsafe_archive = corpus / "unsafe-archive"
        unsafe_archive.mkdir()
        outside = Path(tmp) / "outside"
        outside.mkdir()
        unsafe_readme = unsafe_archive / "README.md"
        unsafe_readme.write_text(
            "# ADR Archive\n\n"
            "**Lifecycle:** Frozen historical ADR records\n"
            "**Active corpus:** ../../outside\n"
            "**Retirement cutover:** 2026-08-22\n\n"
            "## Retired Records\n")
        original_adr_files = retire.adr_files
        original_argv = sys.argv
        retire.adr_files = lambda _root: (_ for _ in ()).throw(
            AssertionError("invalid active corpus was traversed"))
        sys.argv = [str(bin_dir / "adr-retire-check"), str(unsafe_readme)]
        try:
            try:
                with redirect_stdout(io.StringIO()):
                    retire.main()
                raise AssertionError("invalid active corpus unexpectedly passed")
            except SystemExit as exc:
                assert exc.code == 1
        finally:
            retire.adr_files = original_adr_files
            sys.argv = original_argv

    # --- Wave 3a: adr-lint's engines, none of which had ever run -------------

    def task(tid, dep="none", consumes="none", produces="none"):
        return {"dep": dep, "consumes": consumes, "produces": produces}

    # A cycle is the one thing a task DAG must never contain: it means no order
    # exists, so every wave table built from it is a fiction.
    infos = {"T1": task("T1", dep="T2"), "T2": task("T2", dep="T1")}
    errors = []
    lint.check_dag(infos, "", errors)
    assert errors and "cycle" in errors[0], errors
    # A three-hop cycle must be caught too — the DFS has to walk, not peek.
    infos = {"T1": task("T1", dep="T3"), "T2": task("T2", dep="T1"), "T3": task("T3", dep="T2")}
    errors = []
    lint.check_dag(infos, "", errors)
    assert errors and "cycle" in errors[0], errors

    # An ordering edge with no Depends-on anywhere: T2 consumes a token T1
    # produces. This is the edge a hand-written README cannot be expected to know
    # about, which is exactly why the gate derives it.
    infos = {"T1": task("T1", produces="`schema.sql`"),
             "T2": task("T2", consumes="`schema.sql`")}
    edges = lint.dag_edges(infos)
    assert [(a, b) for a, b, _ in edges] == [("T1", "T2")], edges
    # And it must be directional: producing a token you also consume is not an
    # edge to yourself, and an unrelated token is not an edge at all.
    infos = {"T1": task("T1", produces="`schema.sql`"),
             "T2": task("T2", consumes="`other.sql`")}
    assert lint.dag_edges(infos) == []

    # The README's wave/order table has to be a valid topological leveling of
    # those edges, or it tells a reader to start work that cannot start.
    infos = {"T1": task("T1", produces="`schema.sql`"),
             "T2": task("T2", consumes="`schema.sql`")}
    good = "| Order | Task | Depends-on |\n| 1 | T1 | none |\n| 2 | T2 | T1 |\n"
    errors = []
    lint.check_dag(infos, good, errors)
    assert errors == [], errors
    inverted = "| Order | Task | Depends-on |\n| 1 | T2 | none |\n| 2 | T1 | none |\n"
    errors = []
    lint.check_dag(infos, inverted, errors)
    assert errors and "strictly earlier" in errors[0], errors
    # Same wave is not earlier: parallel-safe means no edge between them.
    same = "| Order | Task | Depends-on |\n| 1 | T1 | none |\n| 1 | T2 | none |\n"
    errors = []
    lint.check_dag(infos, same, errors)
    assert errors, "an edge inside one wave must be reported"

    # check_verification's two rejections. The first is why --human exists; the
    # second is the whole anti-fabrication premise.
    human_infos = {"T1": {"human": True, "vlog": [], "acc_all": "", "acc_first": ""}}
    errors = []
    lint.check_verification(human_infos, "| T1 | probe | done |", errors)
    assert errors and "human-observed" in errors[0], errors
    human_infos["T1"]["vlog"] = ["- 2026-08-22 · human-observed · Zy read it end to end"]
    errors = []
    lint.check_verification(human_infos, "| T1 | probe | done |", errors)
    assert errors == [], errors

    failing = {"T1": {"human": False, "vlog": ["- 2026-08-22 · no-git · exit 1 · `pytest`"],
                      "acc_all": "", "acc_first": "pytest"}}
    errors = []
    lint.check_verification(failing, "| T1 | probe | done |", errors)
    assert errors and "no exit-0 entry" in errors[0], errors

    # A contract row naming no producing task is an orphan: the contract exists
    # in prose and nothing in the plan builds it.
    with tempfile.TemporaryDirectory() as tmp:
        adr = Path(tmp) / "ADR-001-probe.md"
        adr.write_text(
            "# ADR-001\n\n## Inter-task Contracts\n\n"
            "| Contract | Producer | Consumer |\n"
            "|---|---|---|\n"
            "| `schema.sql` | the database work | T2 |\n", encoding="utf-8")
        errors = []
        lint.check_contract_table(adr, ["T1-a", "T2-b"], errors)
        assert any("orphaned contract" in e for e in errors), errors

        adr.write_text(
            "# ADR-001\n\n## Inter-task Contracts\n\n"
            "| Contract | Producer | Consumer |\n"
            "|---|---|---|\n"
            "| `schema.sql` | T1 | T9 |\n", encoding="utf-8")
        errors = []
        lint.check_contract_table(adr, ["T1-a", "T2-b"], errors)
        assert any("consuming task T9" in e for e in errors), errors

        adr.write_text(
            "# ADR-001\n\n## Inter-task Contracts\n\n"
            "| Contract | Producer | Consumer |\n"
            "|---|---|---|\n"
            "| `schema.sql` | T1 | T2 |\n", encoding="utf-8")
        errors = []
        lint.check_contract_table(adr, ["T1-a", "T2-b"], errors)
        assert errors == [], errors

    # The detector for a test that cannot go red — itself untested until now,
    # which is the joke this project keeps having to notice about its own gates.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "tests").mkdir()

        def can_fail(source, name="test_probe", filename="probe.py"):
            (root / "tests" / filename).write_text(source, encoding="utf-8")
            infos = {"T1": {"human": False, "tests": [(name, f"tests/{filename}")],
                            "path": Path("T1-probe.md")}}
            errors = []
            lint.check_tests_can_fail(infos, "| T1 | probe | done |", errors, root)
            return errors

        # A body with no failure call at all: green for every input, forever.
        assert can_fail("def test_probe():\n    value = 1 + 1\n"), "no assertion must be caught"
        # The ordinary case.
        assert can_fail("def test_probe():\n    assert 1 + 1 == 2\n") == []
        # An `assert` that is only MENTIONED — in a docstring or a backtick — is
        # not a failure path. code_only exists for exactly this, and a test whose
        # prose says `assert` while its code says nothing is the most convincing
        # possible decoration.
        assert can_fail('def test_probe():\n    """We assert the value is right."""\n    x = 2\n'), \
            "an assert inside a docstring must not count"
        # Delegating to a same-file helper is real: the test goes red when the
        # helper does, so following one level is correct rather than lenient.
        assert can_fail(
            "def check_value(v):\n    assert v == 2\n\n"
            "def test_probe():\n    check_value(1 + 1)\n") == []
        # But only one level, and only within the file: a helper that asserts
        # nothing does not launder the test.
        assert can_fail(
            "def check_value(v):\n    return v\n\n"
            "def test_probe():\n    check_value(1 + 1)\n"), \
            "a helper with no assertion must not satisfy the check"

    # Would the Acceptance filter actually run the test the task names? A filter
    # that selects nothing is the failure adr-verify's scored_nothing also guards.
    assert lint.selected_by_filter("pytest -k test_alpha", "test_alpha")
    assert not lint.selected_by_filter("pytest -k test_alpha", "test_beta")
    # -k takes a boolean expression, not a literal.
    assert lint.selected_by_filter("pytest -k 'alpha or beta'", "test_beta")
    # KNOWN GAP, asserted so it is a decision rather than a surprise: `and` is
    # treated as `or`, because the split is over any token. pytest would NOT run
    # test_alpha under `-k 'alpha and beta'`, so this over-selects and the gate
    # misses that case. The function's stated policy is that a false alarm costs
    # more than a hole — people skip a noisy gate — so the bias is deliberate.
    # Recorded in docs/BACKLOG.md item 20.
    assert lint.selected_by_filter("pytest -k 'alpha and beta'", "test_alpha")
    # go -run takes an unanchored regex, so a prefix selects.
    assert lint.selected_by_filter('go test -run "TestLexNorm|TestRankRRF"', "TestLexNormAscii")
    assert not lint.selected_by_filter('go test -run "TestLexNorm"', "TestRankRRF")
    # selected_by_filter is only ever asked about a NARROWING command — a fence
    # with no filter runs everything and satisfies the check trivially. Asserted
    # at the caller, because that is where the guard lives: asking
    # selected_by_filter directly about `pytest -q` returns False, which would be
    # a false alarm on every unfiltered fence if the guard were removed.
    def named(acc, tests):
        return {"T1": {"human": False, "acc_all": acc, "acc_first": acc,
                       "tests": tests, "path": Path("T1-probe.md")}}

    errors = []
    lint.check_named_tests_are_run(named("pytest -q", [("test_alpha", "t.py")]),
                                   "| T1 | probe | done |", errors)
    assert errors == [], errors

    errors = []
    lint.check_named_tests_are_run(named("pytest -k test_alpha", [("test_beta", "t.py")]),
                                   "| T1 | probe | done |", errors)
    assert errors and "does not select it" in errors[0], errors

    errors = []
    lint.check_named_tests_are_run(named("pytest -k test_alpha", [("test_alpha", "t.py")]),
                                   "| T1 | probe | done |", errors)
    assert errors == [], errors

    # A table row is only a promise for a task claimed done; a pending task is
    # still being written and its fence is allowed to be narrower.
    errors = []
    lint.check_named_tests_are_run(named("pytest -k test_alpha", [("test_beta", "t.py")]),
                                   "| T1 | probe | pending |", errors)
    assert errors == [], errors

    # --- severity: what blocks, and what only advises ---------------------

    # The line is between form and content, and both halves must hold or the
    # distinction is decoration. Absent FORM advises; absent CONTENT, an unfilled
    # placeholder, a fabricated claim and a self-contradicting record all block.
    with tempfile.TemporaryDirectory() as tmp:
        adr = Path(tmp) / "ADR-001-probe.md"

        def findings(text):
            adr.write_text(text, encoding="utf-8")
            errors = lint.Findings()
            lint.check_adr(adr, errors)
            return errors, errors.advice

        complete = (
            "# ADR-001: Probe\n\n"
            "**Status:** Accepted\n"
            "**Spec:** None — no spec stage\n"
            "**Served-path change:** None — this decision changes no served path.\n\n"
            "## Existing Primitives Audit\n\nNothing existing covers it.\n\n"
            "## Decision\n\nDo the thing.\n\n"
            "## Alternatives Considered\n\n- Doing nothing — rejected, the bug persists.\n\n"
            "## Consequences\n\nThe thing is done.\n\n"
            "## Wiring & Contract Changes\n\nNone.\n\n"
            "## Out of Scope\n\n- The other thing (deferred: ADR-002)\n")
        errors, advice = findings(complete)
        assert errors == [], errors

        # FORM: the header is gone. The record still says what it decided.
        errors, advice = findings(complete.replace("**Status:** Accepted\n", ""))
        assert errors == [], errors
        assert any("Status" in a for a in advice), advice

        # CONTENT: the section is there and says nothing.
        errors, _ = findings(complete.replace(
            "- Doing nothing — rejected, the bug persists.\n", ""))
        assert any("Alternatives Considered" in e for e in errors), errors

        # PLACEHOLDER: a document presenting as a decision while containing none.
        # Moving this to advice let the bundled adr-template.md pass outright.
        errors, _ = findings(complete.replace(
            "**Served-path change:** None — this decision changes no served path.",
            "**Served-path change:** <one sentence>"))
        assert any("placeholder" in e for e in errors), errors

        # A POINTER THAT DOES NOT RESOLVE contradicts the record.
        errors, _ = findings(complete.replace(
            "**Spec:** None — no spec stage", "**Spec:** docs/specs/nowhere.md"))
        assert any("does not exist" in e for e in errors), errors

    # Advice never changes the verdict, which is the whole point of the channel.
    empty = lint.Findings()
    empty.advise("shape")
    assert not empty and empty.advice == ["shape"]

    # --- spec-verify's stack detection, which decides which runner owns a test --

    assert spec_gate.split_binding("tests/api.py::test_login") == ("tests/api.py", "test_login")
    assert spec_gate.split_binding("test_login") == (None, "test_login")
    assert spec_gate.split_binding("  a::b  ") == ("a", "b")
    # Only the FIRST separator splits, so a namespaced name survives intact.
    assert spec_gate.split_binding("a.php::Class::method") == ("a.php", "Class::method")

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)

        def stack_for(*markers, dirs=()):
            here = root / "probe"
            if here.exists():
                for child in sorted(here.rglob("*"), reverse=True):
                    child.unlink() if child.is_file() else child.rmdir()
                here.rmdir()
            here.mkdir()
            for d in dirs:
                (here / d).mkdir(parents=True)
            for m in markers:
                (here / m).parent.mkdir(parents=True, exist_ok=True)
                (here / m).write_text("{}", encoding="utf-8")
            return spec_gate.detect_stack(here)

        assert stack_for("composer.json") == "phpunit"
        # pest only when its binary is actually vendored; composer alone is phpunit.
        assert stack_for("composer.json", "vendor/bin/pest") == "pest"
        assert stack_for("pyproject.toml") == "pytest"
        assert stack_for("pytest.ini") == "pytest"
        assert stack_for("setup.cfg") == "pytest"
        assert stack_for("Cargo.toml") == "cargo"
        assert stack_for("package.json") == "vitest"
        assert stack_for(dirs=("molecule",)) == "molecule"
        # Nothing to go on is None, not a guess: handing a test to the wrong
        # runner is what made 23 passing bindings report RED (see the comment in
        # test_runs).
        assert stack_for() is None
        # Order matters where a repo carries two markers — composer wins over
        # package.json, which is the case a PHP project with a JS front end hits.
        assert stack_for("composer.json", "package.json") == "phpunit"

    # path_stack answers the same question per TEST rather than per repo, which is
    # the whole fix for a monorepo: the test's own path says which project owns it.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "apps" / "api" / "vendor" / "bin").mkdir(parents=True)
        (root / "apps" / "api" / "vendor" / "bin" / "phpunit").write_text("", encoding="utf-8")
        (root / "apps" / "api" / "tests").mkdir(parents=True)
        (root / "apps" / "web" / "node_modules").mkdir(parents=True)
        (root / "apps" / "web" / "package.json").write_text("{}", encoding="utf-8")
        (root / "apps" / "web" / "tests").mkdir(parents=True)

        assert spec_gate.path_stack(root, "apps/api/tests/LoginTest.php") == (
            "phpunit", root / "apps" / "api")
        assert spec_gate.path_stack(root, "apps/web/tests/login.test.ts") == (
            "vitest", root / "apps" / "web")
        # No project of its own: the caller keeps the repo-root stack, which is
        # right for a single-project repository.
        assert spec_gate.path_stack(root, "docs/notes.md") is None
        assert spec_gate.path_stack(root, "") is None
        # A path escaping the root must not walk out of it. `..` is caught by the
        # walk reaching the root; an ABSOLUTE binding replaces the root entirely
        # and is caught by the relative_to guard — different code, same answer,
        # and only the second one exercises that guard.
        assert spec_gate.path_stack(root, "../elsewhere/test.php") is None
        assert spec_gate.path_stack(root, "/etc/hosts") is None
        # pest beats phpunit when both binaries are vendored in the same project.
        (root / "apps" / "api" / "vendor" / "bin" / "pest").write_text("", encoding="utf-8")
        assert spec_gate.path_stack(root, "apps/api/tests/LoginTest.php")[0] == "phpunit"

    # test_exists without --collect: a definition in the file, or a named reason.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "tests").mkdir()
        (root / "tests" / "api.py").write_text(
            "def test_login():\n    assert True\n", encoding="utf-8")

        ok, why = spec_gate.test_exists("tests/api.py::test_login", root, "pytest", False)
        assert ok, why
        ok, why = spec_gate.test_exists("tests/api.py::test_missing", root, "pytest", False)
        assert not ok and "tests/api.py" in why, why
        ok, why = spec_gate.test_exists("tests/gone.py::test_login", root, "pytest", False)
        assert not ok and "file not found" in why, why
        # A stack that binds by name only still needs a real definition.
        ok, why = spec_gate.test_exists("test_login", root, "cargo", False)
        assert not ok and "#[test]" in why, why
        (root / "src").mkdir()
        (root / "src" / "lib.rs").write_text(
            "#[test]\nfn test_login() { assert!(true); }\n", encoding="utf-8")
        ok, why = spec_gate.test_exists("test_login", root, "cargo", False)
        assert ok, why
        # A molecule scenario is a directory with a molecule.yml in it.
        ok, why = spec_gate.test_exists("smoke", root, "molecule", False)
        assert not ok and "Molecule scenario" in why, why
        (root / "molecule" / "smoke").mkdir(parents=True)
        (root / "molecule" / "smoke" / "molecule.yml").write_text("", encoding="utf-8")
        ok, _ = spec_gate.test_exists("smoke", root, "molecule", False)
        assert ok
        # --collect runs a COLLECTOR, and a collector that cannot be run tells
        # you nothing about whether the test exists. Reporting that as "bound
        # test not found" is the same defect ADR-005 removed from the run path,
        # one mode over: the author is sent to write a test that is already
        # there. Deferred by ADR-005, closed here (docs/BACKLOG.md §38).
        # `vendor/bin/pest` does not exist here, so the collector cannot START —
        # a FileNotFoundError, not a verdict about the binding.
        ok, why = spec_gate.test_exists("tests/X.php::test_login", root, "pest", True)
        assert ok == "unrun", f"a collector that cannot run is not an absent test: {ok!r} {why}"
        assert "could not be run" in why.lower(), why

        # A path-less binding on a stack that requires one is malformed, and says so.
        ok, why = spec_gate.test_exists("test_login", root, "pytest", False)
        assert not ok and "malformed binding" in why, why

    # TRAJECTORY, not just output. The pipeline checks that Ordered Steps step 1
    # SAYS "establish the failing test", and that some entry SAYS exit 0. It has
    # never checked that the failing run came first — so a task can claim TDD in
    # its prose and show a log that only ever passed, which is the difference
    # between "did the check pass" and "was the check ever able to fail here".
    #
    # Named from Google's SDLC guide 2026-08-28: output evaluation asks whether
    # the result is right; trajectory evaluation asks whether the sequence that
    # produced it was. This corpus already grades trajectory in its eval suite
    # (`tool_order`) and never did in its evidence chain.
    #
    # ADVICE, never blocking. Six of this repository's own records were written
    # after the code shipped and say so; failing them retroactively is the
    # day-one gate nobody keeps.
    green_only = ["- 2026-08-28 · abc1234 · exit 0 · `go test ./...` · acceptance-sha256:" + "0" * 64]
    advice = [str(a) for a in getattr(
        verification_errors(lint, "```bash\ngo test ./...\n```", green_only), "advice", [])]
    assert any("TDD red run" in a and "T1" in a for a in advice), (
        f"a log that only ever passed should be advised on: {advice}")

    red_then_green = [
        "- 2026-08-28 · abc1234 · exit 1 · `go test ./...` · acceptance-sha256:" + "0" * 64,
        "- 2026-08-28 · def5678 · exit 0 · `go test ./...` · acceptance-sha256:" + "0" * 64,
    ]
    advice = [str(a) for a in getattr(
        verification_errors(lint, "```bash\ngo test ./...\n```", red_then_green), "advice", [])]
    assert not any("TDD red run" in a for a in advice), f"red-then-green is the shape we want: {advice}"

    # A KILLED MUTANT proves the same property from the other side — the fence
    # went red when the mechanism broke. Advising there would be noise on a task
    # that has already shown it. Measured on this repository's own corpus: this
    # clause takes the check from nine firings to zero, and every one of those
    # nine had killed a mutant. That is also why the two cases above matter — a
    # check that fires on nothing in the only corpus available is indistinguishable
    # from one that cannot fire at all.
    advice = [str(a) for a in verification_errors(
        lint, "```bash\ngo test ./...\n```", green_only,
        mlog=["- 2026-08-28 · abc1234 · mutant killed · exit 1 · `x.go` · why · acceptance-sha256:"
              + "0" * 64]).advice]
    assert not any("TDD red run" in a for a in advice), (
        f"a killed mutant already shows the fence can fail: {advice}")

    # ADR-009 T1. `Governs:` says which paths a decision owns; nothing said what
    # FAILS when the decision is violated. Task Acceptance proves the task got
    # DONE — a different question from whether the decision still holds.
    #
    # Resolved against the REAL tree, not a fixture, because the point is that a
    # pointer names something that exists here.
    root = repo_root
    def enforcement(value):
        errs = lint.Findings()
        lint.check_enforcement(f"**Enforced-by:** {value}\n", Path("ADR-999-probe.md"), errs, root)
        return list(errs), [str(a) for a in errs.advice]

    # Each of the three forms, all naming something real in this repository.
    for good in ("`link: no skill is ever linked`",
                 "`adr-lint`",
                 "`tests/package.test.mjs::every shipped gate carries at least one mutation`"):
        blocking, advice = enforcement(good)
        assert not blocking, f"{good}: enforcement must never block: {blocking}"
        assert not advice, f"{good}: resolves, so nothing to advise: {advice}"

    # Codex review, 2026-08-28. The containment guard splits on "/" only, so a
    # Windows-spelled traversal reached neither branch: `..\\skills\\x.md` has no
    # forward slash, so `".." in pointer.split("/")` is False AND the gate form's
    # `"/" not in pointer` is True — and the pointer then resolved, from the
    # gate's own directory, to an ordinary file that is not a gate at all. A
    # record would read as enforced by a skill document.
    # Asserted on the GUARD, not through resolve_enforcement. Going through the
    # caller passed with the guard broken, because the gate form's own "contains
    # no /" test catches the same input once the separator has been normalized —
    # so the mutation on the normalization came back GREEN and the test was
    # proving something other than what it named. The defect is only reachable
    # on Windows; the guard is reachable everywhere.
    for escape in ("..\\skills\\adr-write\\SKILL.md", "../skills/adr-write/SKILL.md",
                   "..\\..\\etc\\passwd", "/etc/passwd",
                   "C:\\Windows\\System32\\cmd.exe", "C:/Windows/System32/cmd.exe"):
        assert lint.leaves_the_tree(escape), f"this pointer leaves the tree: {escape}"
        assert lint.resolve_enforcement(escape, root) is None, (
            f"and so it must resolve as nothing: {escape}")
    # The guard is not merely refusing everything, which would satisfy every
    # assertion above and prove nothing.
    for kept in ("adr-lint", "link: no skill is ever linked",
                 "tests/package.test.mjs::every shipped gate carries at least one mutation"):
        assert not lint.leaves_the_tree(kept), f"this pointer stays in the tree: {kept}"
    # The forms that SHOULD still resolve, so the guard is not merely refusing
    # everything — which would pass the four assertions above and prove nothing.
    assert lint.resolve_enforcement("adr-lint", root) == "gate", "a real gate still resolves"

    # Codex review, 2026-08-28. redact_home kept a home path out of a task file
    # only where the spelling matched byte for byte. A Node stack trace on
    # Windows prints forward slashes while Path.home() returns backslashes, so
    # the one platform CI runs and a laptop cannot was the one that leaked.
    win = "C:\\Users\\Alice"
    for spelling in ("C:\\Users\\Alice\\p\\x.mjs", "C:/Users/Alice/p/x.mjs",
                     "c:\\users\\alice\\p\\x.mjs"):
        out = verify.redact_home(spelling, home=win, platform="win32")
        assert "Alice" not in out and "alice" not in out, f"leaked: {spelling} -> {out}"
    # A sibling directory sharing the prefix is NOT this user's home and must
    # survive intact — otherwise the redaction corrupts evidence it was not
    # asked to touch.
    # Assembled rather than written out: a literal home path in a tracked file is
    # the leak this repository's own check exists to catch, and a fixture is not
    # exempt from it.
    posix = "/".join(("", "home", "alice"))
    sibling = f"{posix}-two/x"
    assert verify.redact_home(sibling, home=posix, platform="linux") == sibling, (
        "a sibling sharing the home's name is not the home")
    assert verify.redact_home(f"{posix}/x", home=posix, platform="linux") == "~/x"
    # Case matters where the filesystem says it does, and only there.
    upper = f"{posix.upper()}/x"
    assert verify.redact_home(upper, home=posix, platform="linux") == upper
    assert verify.redact_home(upper, home=posix, platform="darwin") == "~/x"
    # A home that cannot be resolved, or that is a filesystem root, leaves the
    # text alone rather than rewriting every path in it.
    for useless in (None, "", "/", "\\", "C:\\"):
        assert verify.redact_home(f"{posix}/x", home=useless, platform="linux") == f"{posix}/x", (
            f"an unusable home must redact nothing: {useless!r}")

    # ADR-005's class, still open in adr-lint on 2026-08-28 and found by a test
    # that happened to contain a regex. strip_comments knew `//` and `/* */` and
    # nothing else, so a `/*` inside a REGEX LITERAL's character class opened a
    # block comment that ran to the next `*/` anywhere in the file — in
    # tests/package.test.mjs that swallowed everything after it, and a pointer
    # naming a test that is plainly present reported as naming nothing.
    js = (
        "const re = /[a-z/*-]+/g\n"
        "test('kept', () => {})\n"
        "// test('commented out', () => {})\n"
        "/* test('blocked', () => {}) */\n"
        "const s = '/* not a comment */'\n"
        "test('after a string', () => {})\n"
    )
    stripped = lint.strip_comments(js)
    assert "'kept'" in stripped, f"a regex containing /* must not open a comment: {stripped!r}"
    assert "'after a string'" in stripped, f"a string containing /* must not either: {stripped!r}"
    assert "'commented out'" not in stripped, "a line comment must still be removed"
    assert "'blocked'" not in stripped, "a block comment must still be removed"
    # And end to end: the pointer form this repository actually uses.
    live = "tests/package.test.mjs::every shipped gate carries at least one mutation"
    assert lint.resolve_enforcement(live, repo_root) == "test", (
        "a test that is present must resolve as present")

    # ADR-010. With no shell there is nothing to run, so every claim is
    # UNCHECKED rather than failed — and this is asserted through the seam
    # rather than through PATH, because emptying PATH removes bash on POSIX and
    # removes nothing on Windows, where resolve_bash() finds Git Bash by
    # absolute path. One injected value covers all three platforms.
    with tempfile.TemporaryDirectory() as sd:
        fence = "exit 0"
        digest = verify.acceptance_digest(verify.normalize_acceptance(fence))
        (Path(sd) / "T1.md").write_text(
            f"# T1\n\n## Acceptance\n\n```bash\n{fence}\n```\n\n## Verification Log\n"
            f"- 2026-08-28 \u00b7 abc1234 \u00b7 exit 0 \u00b7 `{fence}` \u00b7 "
            f"acceptance-sha256:{digest}\n", encoding="utf-8")
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = verify.sweep_corpus(sd, shell=None)
        out = buf.getvalue()
        assert "unrunnable" in out, f"no shell means unchecked, not failed: {out}"
        assert "FALSE" not in out, f"and never a verdict about the code: {out}"
        assert code == 1, "nothing was checked, so nothing is verified"

    # A pointer that resolves to nothing is the rot this exists to catch.
    blocking, advice = enforcement("`no-such-mutation-label-anywhere`")
    assert not blocking, f"still never blocking: {blocking}"
    assert any("no-such-mutation-label-anywhere" in a for a in advice), (
        f"an unresolvable pointer must be named: {advice}")

    # `None — <reason>` is a first-class answer: most decisions are not
    # mechanically enforceable, and saying so is information the corpus lacked.
    _, advice = enforcement("None — this is a naming convention, not a mechanism")
    assert not advice, f"None is an answer, not a gap: {advice}"

    # A record without the header is unchanged — six of the eight here predate it.
    errs = lint.Findings()
    lint.check_enforcement("# ADR-999: no such header\n", Path("ADR-999-probe.md"), errs, root)
    assert not list(errs) and not errs.advice, "a record without the header must be untouched"

    # Codex review, 2026-08-28. Five findings, all reproduced before being fixed.
    #
    # A PRODUCTION FUNCTION is not a test. `test_body` matches any function
    # definition with that name, so `lifecycle.mjs::shellWords` resolved — and a
    # reader would conclude a test backs the decision when none does.
    assert lint.resolve_enforcement("scripts/lifecycle.mjs::shellWords", root) is None
    assert lint.resolve_enforcement("bin/adr-lint::enforcement_pointers", root) is None
    # ...and it must hold for a REASON. That assertion passed by accident until
    # 2026-08-28: a gate has no extension, so its Python source was masked under
    # JavaScript comment rules, and whether the `def` survived depended on where
    # the `/*` sequences in its own docstrings fell. Editing an unrelated comment
    # flipped it. The path decides now, and both directions are asserted.
    assert not lint.looks_like_a_test(Path("plugin/bin/adr-lint"))
    assert not lint.looks_like_a_test(Path("plugin/scripts/lifecycle.mjs"))
    for real in ("tests/package.test.mjs", "spec/models/user_spec.rb", "internal/x/foo_test.go",
                 "src/__tests__/a.js"):
        assert lint.looks_like_a_test(Path(real)), f"this is a test file: {real}"
    # A test that IS present still resolves, so the guard is not refusing everything.
    assert lint.resolve_enforcement("tests/gate-regressions.py::main", root) == "test"

    # A registration inside a COMMENT or a STRING is not a definition either. The
    # comment beside the regex claimed this already held; it did not, which is
    # the second time in this session a comment carried the bug.
    with tempfile.TemporaryDirectory() as jt:
        probe = Path(jt) / "p.test.mjs"
        probe.write_text(
            "// test('in a line comment', () => {})\n"
            "/* test('in a block comment', () => {}) */\n"
            "const s = \"test('in a string', () => {})\"\n"
            "test.skip('a real skip', () => {})\n"
            "test.only('a real only', () => {})\n"
            "it('a real it', () => {})\n"
            "test('a real test', () => {})\n")
        # A RELATIVE pointer, which is the only kind allowed now — an absolute
        # one is refused by the containment guard below, and that refusal is
        # itself asserted there.
        # A registration at LINE START inside a block comment. The statement
        # anchor cannot see the difference — this is the one case only the
        # comment stripper catches, and without it the stripper's mutation came
        # back GREEN because every other ghost was already excluded by the anchor.
        (Path(jt) / "b.test.mjs").write_text(
            "/*\ntest('ghost at line start in a block', () => {})\n*/\n"
            "test('a real one below', () => {})\n")
        assert lint.resolve_enforcement(
            "b.test.mjs::ghost at line start in a block", Path(jt)) is None
        assert lint.resolve_enforcement("b.test.mjs::a real one below", Path(jt)) == "test"

        for ghost in ("in a line comment", "in a block comment", "in a string"):
            assert lint.resolve_enforcement(f"p.test.mjs::{ghost}", Path(jt)) is None, ghost
        # `.skip` and `.only` ARE registrations and were being rejected as absent
        # while a commented-out ghost resolved — wrong in both directions at once.
        for real in ("a real skip", "a real only", "a real it", "a real test"):
            assert lint.resolve_enforcement(f"p.test.mjs::{real}", Path(jt)) == "test", real

    # A pointer may not leave the repository. `../README.md` and an absolute path
    # both resolved as gates, so a file outside the tree could satisfy a record.
    # An ABSOLUTE test pointer is the case only the containment guard catches —
    # the gate branch already refuses anything containing a slash, so the guard's
    # mutation was GREEN until this line existed.
    assert lint.resolve_enforcement(
        f"{root / 'tests' / 'package.test.mjs'}::every shipped gate carries at least one mutation",
        root) is None, "an absolute test pointer leaves the repository"
    assert lint.resolve_enforcement("../README.md", root) is None
    assert lint.resolve_enforcement(str(root / "README.md"), root) is None
    assert lint.resolve_enforcement("README.md", root) is None, "a repo file is not a gate"
    assert lint.resolve_enforcement("adr-lint", root) == "gate"

    # ONE GRAMMAR. The two parsers disagreed on three inputs; the truth table is
    # asserted here and mirrored in the JS suite, because a shared rule with two
    # implementations is only shared if something compares them.
    for value, want in ENFORCEMENT_GRAMMAR:
        got = lint.enforcement_pointers(f"**Enforced-by:** {value}\n")
        assert got == want, f"{value!r}: python said {got}, the shared grammar says {want}"

    # BACKLOG §47. adr-verify WRITES the sha `git rev-parse --short HEAD` returns,
    # unvalidated, while every reader accepted `[0-9a-f]{7,40}` — six literal
    # copies of one pattern, five in adr-lint and one in adr-verify.
    #
    # git honours `core.abbrev`, which it allows down to 4, and a SHA-256
    # repository emits up to 64. Reproduced 2026-08-29 on a clone with
    # `core.abbrev=4`: adr-verify wrote `- … · 6aaf* · exit 0 · …` and exited 0,
    # and BOTH readers rejected its own entry — the sweep's CLAIM_RE included.
    # One cause, two consequences: a claim the sweep cannot read leaves the
    # denominator, which makes the false-success rate look BETTER; and adr-lint's
    # refusal of a `done` row without a matching exit-0 entry is BLOCKING, so a
    # corpus with core.abbrev < 7 cannot mark anything done using evidence the
    # tool itself just wrote.
    for sha, want in SHA_GRAMMAR:
        line = (f"- 2026-08-29 · {sha} · exit 0 · `printf a` · acceptance-sha256:" + "0" * 64)
        for name, pattern in (("adr-lint VLOG_RE", lint.VLOG_RE),
                              ("adr-lint VLOG_DIGEST_RE", lint.VLOG_DIGEST_RE),
                              ("adr-verify CLAIM_RE", verify.CLAIM_RE)):
            got = bool(pattern.match(line) if name != "adr-verify CLAIM_RE"
                       else pattern.search(line))
            assert got is want, f"{name} disagrees with the shared grammar on {sha!r}"
        legacy = f"- 2026-08-29 · {sha} · exit 0 · `printf a`"
        assert bool(lint.VLOG_LEGACY_RE.match(legacy)) is want, (
            f"the legacy reader disagrees with the shared grammar on {sha!r}")
        mutant = (f"- 2026-08-29 · {sha} · mutant killed · exit 1 · `x.py` · why · "
                  "acceptance-sha256:" + "0" * 64)
        for name, pattern in (("MLOG_RE", lint.MLOG_RE), ("MLOG_DIGEST_RE", lint.MLOG_DIGEST_RE)):
            assert bool(pattern.match(mutant)) is want, (
                f"the mutation reader {name} disagrees with the shared grammar on {sha!r}")

    # THE WRITER CHECKS ITSELF. Widening the readers closes today's gap; this is
    # what stops the next one, because the width git returns is decided by a
    # config file this tool does not own. An entry it cannot read back is a
    # refusal, not a silent write.
    assert verify.readable_entry("- 2026-08-29 · 6aaf · exit 0 · `printf a` · acceptance-sha256:"
                                 + "0" * 64), "a 4-wide sha is what core.abbrev=4 produces"
    assert not verify.readable_entry("- 2026-08-29 · 6aa · exit 0 · `printf a` · "
                                     "acceptance-sha256:" + "0" * 64)

    # The record-number resolvers diverged, and NOT symmetrically — checked
    # rather than assumed. `(record_number_of(t) or cutoff) < cutoff` treats
    # ADR-000 as absent, and absent means "checked in full", so the pre-existing
    # bug erred STRICT in every case measured here. It is still wrong: the
    # falsy-or cannot express "this record is number zero", and the next reader
    # of that line has to re-derive which direction it fails in.
    with tempfile.TemporaryDirectory() as rt:
        root = Path(rt)
        for record, task in (("ADR-000-zero", "T1-a.md"), ("ADR-014-normal", "T1-a.md")):
            (root / record / "tasks").mkdir(parents=True)
            (root / record / "tasks" / task).write_text("# T1\n", encoding="utf-8")
        assert verify.record_number_of(root / "ADR-000-zero" / "tasks" / "T1-a.md") == 0
        assert verify.record_number_of(root / "ADR-014-normal" / "tasks" / "T1-a.md") == 14
        # ...and zero is not absent. This is the assertion the falsy-or cannot pass.
        assert verify.demoted_by(0, 14) is True, "ADR-000 is below a cutoff of 14"
        assert verify.demoted_by(None, 14) is False, "no number is not below the cutoff"
        assert verify.demoted_by(14, 14) is False and verify.demoted_by(13, 14) is True

    # AN ANCESTOR THAT MERELY LOOKS LIKE A RECORD. `record_number_of` scanned
    # every path component in reverse, so a task in a directory nobody numbered
    # inherited a number from a parent — `~/adr-42-notes/proj/docs/adr/probe/…`
    # resolved as ADR-42 and was demoted against a cutoff it has nothing to do
    # with. The owning record is the DIRECTORY THE TASKS LIVE IN, which is the
    # same thing adr-lint's `adr_number` reads.
    with tempfile.TemporaryDirectory() as rt:
        stray = Path(rt) / "adr-42-notes" / "proj" / "probe" / "tasks"
        stray.mkdir(parents=True)
        (stray / "T1-a.md").write_text("# T1\n", encoding="utf-8")
        assert verify.record_number_of(stray / "T1-a.md") is None, (
            "a directory that merely looks like a record is not this task's record")

    # ADR-011 T1. `Governs:`, `Cross-references:` and `Invalidates:` were checked
    # for SHAPE and never against the thing they name, so a path that named
    # nothing read exactly like a path that named something. Measured 2026-08-28:
    # ADR-008 moved the plugin under `plugin/` and seven records' `Governs:`
    # lines stopped resolving; `adr-context` answered "none governs" for the whole
    # gate surface and `adr-lint` passed throughout.
    corpus_dir = repo_root / "docs" / "adr"

    def pointers(text, tracked=None, corpus=None):
        errs = lint.Findings()
        lint.check_pointers(text, Path("ADR-999-probe.md"), errs,
                            repo_root if tracked is None else None,
                            corpus_dir if corpus is None else corpus,
                            tracked=tracked)
        return list(errs), [str(a) for a in errs.advice]

    # THE ONE GLOB GRAMMAR, mirrored verbatim in tests/lifecycle.test.mjs. `**`
    # crosses separators and `*` does not; a bare declaration matches the file
    # itself and anything under it. Two implementations of one rule are only
    # shared if something compares them — ADR-009's lesson, applied again.
    for candidate, declaration, want in GOVERNS_MATCH_GRAMMAR:
        got = lint.path_matches_declaration(candidate, declaration)
        assert got is want, (
            f"{candidate!r} vs {declaration!r}: python said {got}, the shared grammar says {want}")

    # The DIRTY answer, for the header with live consequences.
    _, advice = pointers("**Governs:** `plugin/bin/no-such-gate`\n")
    assert any("no-such-gate" in a for a in advice), (
        f"a Governs path matching nothing tracked must be named: {advice}")
    # ...and it is ADVICE. CLAUDE.md §3: a gate instructs and never blocks, and a
    # corpus adopting this on a tree it did not write would light up on day one.
    blocking, _ = pointers("**Governs:** `plugin/bin/no-such-gate`\n")
    assert not blocking, f"an unresolvable pointer never blocks: {blocking}"

    # The CLEAN answer, in the same test, so a check that reports clean is shown
    # able to report dirty. `plugin/bin/**` is this corpus's own case.
    _, advice = pointers("**Governs:** `plugin/bin/**`, `tests/mutations.json`\n")
    assert not advice, f"both of these resolve against the real tree: {advice}"

    # A directory prefix resolves without a glob.
    _, advice = pointers("**Governs:** `plugin/bin`\n")
    assert not advice, f"a declared directory resolves through the files under it: {advice}"

    # COULD NOT LOOK is not a verdict (ADR-005). With no tracked listing the check
    # resolves nothing and says so — the alternative is that an empty listing makes
    # every pointer in the corpus a finding at once.
    blocking, advice = pointers("**Governs:** `plugin/bin/no-such-gate`\n", tracked=False)
    assert not blocking, f"could-not-look never blocks either: {blocking}"
    assert any("could not" in a.lower() for a in advice), (
        f"the gate must say it could not look: {advice}")
    assert not any("no-such-gate" in a for a in advice), (
        f"and must not name a pointer as unresolved when it never resolved any: {advice}")

    # `Cross-references:` — a tracked path and a real record resolve; an absent
    # record and an untracked path are named. A bare `§NN` fragment is left alone
    # rather than guessed at (deferred, docs/BACKLOG.md §44).
    _, advice = pointers(
        "**Cross-references:** docs/adr/ADR-009-a-decision-names-what-enforces-it.md, "
        "docs/BACKLOG.md §44, §45\n")
    assert not advice, f"every one of these resolves: {advice}"

    # ADR-011's deferred half, closed. A `§NN` fragment is resolved to a heading
    # in the file cited beside it — the bare `§45` above inherits `docs/BACKLOG.md`
    # from the item before it, which is how every multi-section citation in this
    # corpus is written.
    assert lint.section_fragments(["docs/BACKLOG.md §44", "§45"]) == [
        ("docs/BACKLOG.md", 44), ("docs/BACKLOG.md", 45)]
    assert lint.section_fragments(["§45"]) == [], (
        "a fragment with no path ahead of it names nothing this gate can resolve")
    # THE DIRTY ANSWER, and it is advice like every other pointer finding.
    blocking, advice = pointers("**Cross-references:** docs/BACKLOG.md §9999\n")
    assert not blocking, f"an unresolvable fragment never blocks: {blocking}"
    assert any("§9999" in a for a in advice), (
        f"a cited section that does not exist must be named: {advice}")
    # A PREFIX IS NOT A MATCH. `§4` against a file whose only heading is `## 44`
    # resolves happily and wrongly under a prefix test, and the citation it would
    # bless is the one most likely to be a typo for the section beside it.
    assert lint.has_section("## 44. Forty-four\n", 44) is True
    assert lint.has_section("## 44. Forty-four\n", 4) is False, "§4 is not `## 44`"
    assert lint.has_section("## 34 (superseded). No period after the digits\n", 34) is True
    assert lint.has_section("Section 44 mentioned in prose, not a heading\n", 44) is False
    # COULD NOT LOOK, again, and distinguishable from a missing section: a tracked
    # file this process cannot read is not a file without that heading (ADR-005).
    errs = lint.Findings()
    lint.check_pointers("**Cross-references:** docs/BACKLOG.md §44\n", Path("ADR-999-probe.md"),
                        errs, None, corpus_dir, tracked=["docs/BACKLOG.md"])
    assert not list(errs), "could-not-read never blocks"
    assert any("could not be read" in str(a) for a in errs.advice), (
        f"an unreadable file must not be reported as a missing section: {list(errs.advice)}")
    _, advice = pointers("**Cross-references:** docs/adr/ADR-404-nothing-here.md\n")
    assert any("ADR-404" in a for a in advice), f"a cited record that does not exist: {advice}"
    _, advice = pointers("**Cross-references:** docs/no-such-file.md\n")
    assert any("no-such-file" in a for a in advice), f"a cited path that does not exist: {advice}"

    # BACKLOG §37. A disposition containing PARENTHESES was misread by all three
    # gates that parse one, because `[^)]*` cannot cross the `)` of a nested
    # pair. Measured 2026-08-28 on `(permanent: the `archive()` helper keeps
    # originals)`, and the three consequences were not the same finding:
    #   - plugin/bin/adr-lint            advised "needs a disposition" on a
    #                                    bullet that visibly carries one
    #   - plugin/bin/adr-debt (bullets)  reported BROKEN [malformed] — a false
    #                                    finding, and adr-debt exits 1 on those
    #   - plugin/bin/adr-debt (arch)     captured a TRUNCATED pointer and
    #                                    resolved it, naming a path nobody wrote
    # adr-retire-check shares the shape and only ever needed existence, so its
    # count never changed; it is fixed for uniformity and no defect is claimed.
    #
    # ONE TABLE, THREE COPIES. The gates are standalone scripts with no import
    # path between them, so the copies are only shared if something compares
    # them — ADR-009's `enforcement_pointers` lesson, applied again.
    for module in (lint, debt, retire):
        for line, closes in CLOSES_THE_LINE:
            span = module.disposition_span(line)
            assert span, f"{module.__name__}: {line!r} has a disposition to locate"
            got = module.closes_the_line(line, span[2])
            assert got is closes, (
                f"{module.__name__}.closes_the_line({line!r}): got {got}, "
                f"the shared grammar says {closes}")
        for line, want in DISPOSITION_GRAMMAR:
            span = module.disposition_span(line)
            got = span[0] if span else None
            assert got == want, (
                f"{module.__name__}.disposition_span({line!r}): got {got!r}, "
                f"the shared grammar says {want!r}")
            if span:
                assert line[span[1]:span[2]] == f"({got})", (
                    f"{module.__name__}: the span must bound the group it returned")

    # THE DIRTY AND CLEAN ANSWERS for adr-lint's own use of it, in one place: a
    # nested paren is accepted, a bullet with no disposition is still named, and
    # a balanced parenthetical that does not END the bullet is not a disposition.
    def dispositions(*bullets):
        """Out of Scope findings from the REAL gate, not a reimplementation of it.

        This used to mirror check_adr's loop here, which is how a test comes to
        assert something the gate does not do: the mirrored copy read raw lines,
        so a wrapped bullet was judged on its first line in the test exactly as it
        was in the gate, and both agreed while both were wrong.
        """
        body = ("# ADR-999: probe\n\n**Status:** Proposed\n\n"
                "## Alternatives Considered\n\n- A: rejected because b.\n\n"
                "## Wiring & Contract Changes\n\nNone — implementation-internal only.\n\n"
                "## Out of Scope\n\n" + "\n".join(bullets) + "\n")
        with tempfile.TemporaryDirectory() as probe_dir:
            probe = Path(probe_dir) / "ADR-999-probe.md"
            probe.write_text(body, encoding="utf-8")
            errs = lint.Findings()
            lint.check_adr(probe, errs)
        return [str(a) for a in errs.advice if "disposition" in str(a)]

    nested_legacy = dispositions(
        "- Renaming it (permanent: the `archive()` helper keeps originals)")
    assert any("permanent basis" in item and "classify" in item
               for item in nested_legacy), nested_legacy
    assert not any("ends with no machine-readable" in item for item in nested_legacy), (
        "a nested paren is still one legacy disposition, so it gets classification advice "
        f"rather than no-disposition advice: {nested_legacy}")
    named = dispositions("- Renaming it")
    assert any("Renaming it" in a for a in named), (
        f"and a bullet with no disposition is still named: {named}")
    named = dispositions("- Renaming it (permanent: why) (see also)")
    assert any("see also" in a for a in named), (
        f"a disposition that does not end the bullet is not one, and never was: {named}")

    # A DISPOSITION MAY WRAP. Reported 2026-08-29 from an adopting corpus and
    # confirmed the same hour on this project's own ADR-012, whose Out of Scope
    # bullets wrap: reading these line by line saw `(deferred: each` with no
    # closing paren and reported "needs a disposition" about well-formed Markdown.
    # The rule was already decided one gate over — `adr-judge::bullets` does this
    # and its docstring says why, dated 2026-08-27 — and was never carried here.
    assert lint.scope_bullets(["- A (deferred:", "  notes.md)"]) == ["- A (deferred: notes.md)"]
    assert lint.scope_bullets(["- A (permanent: why)", "", "Loose prose after a blank line."]) == [
        "- A (permanent: why)"], "a blank line ends the bullet, as Markdown says it does"
    assert lint.scope_bullets(["- A (permanent: why)", "Unindented prose."]) == [
        "- A (permanent: why)"], "and so does an unindented line"
    assert lint.scope_bullets(["- one", "- two"]) == ["- one", "- two"], "two bullets stay two"
    # A NESTED SUB-BULLET IS A CHILD, NOT AN ENTRY. Reported 2026-08-29 from an
    # adopting corpus whose Out of Scope entry enumerates what it defers as an
    # indented list: each child was told it needed its own disposition, which
    # would be four pointers to the one issue the parent already defers as a
    # unit. The reporter checked it against the UNEDITED file before reporting,
    # so it was not confused with the wrap fix shipped the same hour.
    assert lint.scope_bullets([
        "- Parent (deferred: docs/BACKLOG.md)",
        "  - first child, which wraps",
        "    onto another line",
        "  - second child",
        "- A real sibling",
    ]) == ["- Parent (deferred: docs/BACKLOG.md)", "- A real sibling"], (
        "children are neither entries nor part of the parent's disposition line")
    assert dispositions(
        "- Parent (deferred: docs/BACKLOG.md)",
        "  - first child",
        "  - second child") == [], "no child is asked for a disposition"
    # ...and the parent is still HELD to the rule: a child list does not excuse
    # the entry that owns it. Without this, suppressing children entirely would
    # satisfy the assertion above while dropping a real finding.
    assert dispositions(
        "- Parent with no disposition at all",
        "  - first child",
        "  - second child"), "the parent is still an entry and still checked"

    assert dispositions("- A wrapped one (deferred:", "  docs/BACKLOG.md)") == [], (
        "a disposition split across a wrap is still a disposition")
    assert dispositions("- A wrapped one with no disposition", "  and more of it"), (
        "and a wrapped bullet that really has none is still named")

    # `Invalidates:` takes the LEADING token and ignores the prose after it.
    # Every real value in this corpus is either `none — checked. ADR-003 governs
    # …` or `ADR-001 — the clause of its Decision reading "…"`; comma-splitting
    # the second turns its prose into pointers.
    assert lint.invalidates_pointer("**Invalidates:** none — checked. ADR-003 governs `bin/**`\n") is None
    assert lint.invalidates_pointer(
        '**Invalidates:** ADR-001 — the clause reading "`--link` installs gates, and templates"\n'
    ) == "ADR-001"
    _, advice = pointers(
        '**Invalidates:** ADR-001 — the clause reading "`--link` installs gates, and templates"\n')
    assert not advice, f"ADR-001 exists and the prose is not a pointer: {advice}"
    _, advice = pointers("**Invalidates:** ADR-404 — a record that was never written\n")
    assert any("ADR-404" in a for a in advice), f"an invalidated record must exist: {advice}"

    # A record carrying none of the three headers is untouched.
    blocking, advice = pointers("# ADR-999: no headers at all\n")
    assert not blocking and not advice, "a record without these headers must be unchanged"

    # THE COURT OF LAST RESORT: every record in this repository resolves today.
    # A silent check and a check that cannot fire look identical, which is why the
    # dirty cases above are asserted in the same run as this one.
    for record in sorted(corpus_dir.glob("ADR-*.md")):
        blocking, advice = pointers(record.read_text(encoding="utf-8", errors="replace"))
        assert not blocking, f"{record.name}: pointers never block: {blocking}"
        assert not advice, f"{record.name}: every pointer in this corpus resolves: {advice}"

    # BACKLOG §41, the adr-lint half. `split_dependencies` existed for exactly
    # this and was wired only into the Depends-on VALIDATION; the DAG built a few
    # lines below still scanned the RAW value, on both headers. So the gate that
    # rejects an unresolvable qualified dependency was, in the same run, adding a
    # local edge for it — `ADR-003-T4` contributing a `T4` edge, because TID_RE
    # does not treat `-` as a word character.
    def dag(consumes="none", dep="none"):
        infos = {
            "T4": {"dep": "none", "consumes": "none", "produces": "none"},
            "T9": {"dep": dep, "consumes": consumes, "produces": "none"},
        }
        return lint.dag_edges(infos)

    assert dag(consumes="ADR-003-T4") == [], (
        f"a qualified id in Consumes is foreign and contributes no local edge: {dag(consumes='ADR-003-T4')}")
    assert dag(dep="ADR-003-T4") == [], (
        f"and the same in Depends-on, which the validator already knew: {dag(dep='ADR-003-T4')}")

    # THE CLEAN ANSWER in the same place: a LOCAL id on either header still
    # builds its edge. Without this, a dag_edges that returned [] unconditionally
    # would satisfy both assertions above (CLAUDE.md §4).
    assert [e[:2] for e in dag(consumes="T4")] == [("T4", "T9")], (
        f"a local Consumes id still orders the pair: {dag(consumes='T4')}")
    assert [e[:2] for e in dag(dep="T4")] == [("T4", "T9")], (
        f"a local Depends-on id still orders the pair: {dag(dep='T4')}")

    # ADR-007 T1. `Depends-on` could only name a SIBLING: adr-lint rejected
    # anything else with a blocking error, so the field designed to carry
    # "this must not start before that" could not express a cross-record edge
    # at all. Reported 2026-08-28 from a corpus one step from executing on it.
    #
    # The trap that decides the parser's shape, measured: TID_RE is
    # (?<!\w)T\d+(?!\w), so "ADR-003-T4" yields ['T4'] — the hyphen is not a
    # word character. A qualified id must be consumed WHOLE before any local
    # scan, or it binds to a same-numbered LOCAL task. A wrong edge is worse
    # than a missing one, because the DAG then looks answered.
    qualified, local = lint.split_dependencies("ADR-003-T4, T2, ADR-004/T1")
    assert qualified == ["ADR-003-T4", "ADR-004/T1"], qualified
    assert local == ["T2"], local
    # The whole point: no local T4 may be produced from the qualified id.
    assert "T4" not in local, "a qualified id bound to a local task"

    # An unqualified id is untouched — no existing record may change verdict.
    assert lint.split_dependencies("T1, T2") == ([], ["T1", "T2"])
    assert lint.split_dependencies("none") == ([], [])

    # And it must RESOLVE against the corpus, not the sibling set. Checked
    # against this repository's own records so the test fails if the corpus
    # shape it assumes ever changes, rather than passing against a fixture that
    # agrees with the code by construction.
    corpus = repo_root / "docs" / "adr"
    assert lint.resolve_qualified_dep("ADR-003-T1", corpus), "ADR-003 has a T1"
    assert not lint.resolve_qualified_dep("ADR-003-T9", corpus), "ADR-003 has no T9"
    assert not lint.resolve_qualified_dep("ADR-900-T1", corpus), "no ADR-900 exists"
    # Zero-padding and the slash form are the same pointer.
    assert lint.resolve_qualified_dep("ADR-0003/T1", corpus)

    # A cycle ACROSS records. Per-record DAG checks cannot see one by
    # construction: each record's graph is acyclic on its own, and the cycle
    # only exists in the union. Making cross-record edges real without widening
    # the check would move the blindness rather than remove it.
    with tempfile.TemporaryDirectory() as cyc:
        cyc_dir = Path(cyc)
        for name, tid, dep in (("ADR-010-a", "T1", "ADR-011-T1"),
                               ("ADR-011-b", "T1", "ADR-010-T1")):
            tasks = cyc_dir / name / "tasks"
            tasks.mkdir(parents=True)
            (cyc_dir / f"{name}.md").write_text("# probe\n")
            (tasks / f"{tid}-t.md").write_text(f"# Task {tid}: probe\n\n**Depends-on:** {dep}\n")
        found = []
        errs = lint.Findings()
        lint.check_cross_record_cycles(cyc_dir, errs)
        found = [str(e) for e in errs] + [str(a) for a in errs.advice]
        assert any("cycle" in f.lower() for f in found), f"a two-record cycle must be caught: {found}"
        assert any("010" in f and "011" in f for f in found), f"and must name both: {found}"

    # And the real corpus, which has cross-record edges and no cycle, stays quiet.
    errs = lint.Findings()
    lint.check_cross_record_cycles(corpus, errs)
    assert not list(errs) and not errs.advice, f"a healthy corpus must be silent: {list(errs)}"

    with tempfile.TemporaryDirectory() as js_tmp:
        # A JavaScript REGEX LITERAL is neither a comment nor a string, and the
        # masker knew about neither case. An apostrophe inside one — `/it's/` —
        # opened a phantom string that ran to the next apostrophe anywhere in the
        # file, blanking every test defined in between.
        #
        # Found 2026-08-28 binding a spec fact to a real, present test in
        # tests/package.test.mjs: the detector saw 3 of its 6 tests and answered
        # "bound test not found". Same class as ADR-005 — a gate stating an
        # observation it never made — and the worst shape of it, because the
        # author is told the test they are looking at does not exist.
        js_probe = Path(js_tmp) / "probe.test.mjs"
        js_probe.write_text(
            "test('before the regex', () => {})\n"
            "test('holds the regex', () => { assert.match(x, /it's here/) })\n"
            "test('after the regex', () => {})\n"
        )
        for js_name in ("before the regex", "holds the regex", "after the regex"):
            found, why = spec_gate.test_definition_exists(js_probe, js_name, None)
            assert found is True, f"{js_name}: {why}"

        # A regex may also follow the `)` that closes an `if`/`while`/`for`
        # header, and the first fix did not know that: `if (ready) /it's/.test(v)`
        # read the `/` as division, so the apostrophe opened a phantom string
        # again and the file's tests vanished. Found 2026-08-28 by an independent
        # review, in the fix for the same defect one shape over.
        js_probe.write_text(
            "if (ready) /it's/.test(v)\n"
            "test('after a regex that follows a control header', () => {})\n"
        )
        found, why = spec_gate.test_definition_exists(
            js_probe, "after a regex that follows a control header", None)
        assert found is True, why

        # And on the SAME LINE, which is what makes the control-header case
        # load-bearing rather than belt-and-braces. The line bound below already
        # rescues the next line; only knowing that a regex may follow `)` rescues
        # a definition sharing the line with it. Measured 2026-08-28: with the
        # CONTROL_HEADER branch the name is found, without it the probe returns
        # nothing at all — the mutation for it was GREEN until this case existed.
        js_probe.write_text(
            "if (ready) /it's/.test(v); test('sharing the line with a regex', () => {})\n"
        )
        found, why = spec_gate.test_definition_exists(
            js_probe, "sharing the line with a regex", None)
        assert found is True, why

        # THE GENERAL GUARD, which is what actually closes the class: a `'` or
        # `"` string cannot span a line in JavaScript, so an unterminated one is
        # not a string. Without this, every construct the lexer does not know
        # about — today's regex, tomorrow's something else — can swallow the
        # rest of the FILE. With it, the damage of any future mis-detection is
        # bounded to one line.
        js_probe.write_text(
            "const oops = 'unterminated because this line ends\n"
            "test('survives an unterminated quote', () => {})\n"
        )
        found, why = spec_gate.test_definition_exists(
            js_probe, "survives an unterminated quote", None)
        assert found is True, why

        # A template literal DOES span lines, so it must stay unbounded.
        js_probe.write_text(
            "const t = `line one\ntest('hidden inside a template literal', () => {})\nline three`\n"
            "test('after the template literal', () => {})\n"
        )
        found, _ = spec_gate.test_definition_exists(js_probe, "after the template literal", None)
        assert found is True
        found, _ = spec_gate.test_definition_exists(
            js_probe, "hidden inside a template literal", None)
        assert found is False, "a test name inside a template literal is not a definition"

        # Division must still read as division. Masking from a `/` that opens no
        # regex blanks real code, so the detector stays conservative there too.
        js_probe.write_text(
            "test('divides', () => { const r = a / b; const s = c / d })\n"
            "test('after the division', () => {})\n"
        )
        for js_name in ("divides", "after the division"):
            found, why = spec_gate.test_definition_exists(js_probe, js_name, None)
            assert found is True, f"{js_name}: {why}"

    # BACKLOG §52. Step 1 of a task must ESTABLISH RED. The check asked whether
    # the word "test" appeared in it — a shape test, on a step whose behaviour
    # was already correct. ADR-006 T2 opens "Confirm the gate is red first:
    # `spec-verify --spec ...`", which establishes red and never says "test", so
    # a correct task was advised at and a step saying "update the tests later"
    # was not. Found 2026-08-29 by Claude Desktop running qh_adr_lint over this
    # corpus through the MCP server (ADR-012 T4) — the gate's own rule, ADR-003:
    # a gate asserts behaviour, not shape.
    def step_one_advice(step):
        with tempfile.TemporaryDirectory() as td:
            probe = Path(td) / "T9-probe.md"
            probe.write_text(
                "# Task X-T9: probe\n\n"
                "**Depends-on:** none\n**Covers:** none\n**Produces:** none\n"
                "**Consumes:** none\n\n"
                "## Goal\n\ng\n\n"
                "## Affected Files\n\n| File | Change | Why |\n|---|---|---|\n"
                "| `x.py` | edit | w |\n\n"
                "## Ordered Steps\n\n" + step + "\n2. Then the rest.\n\n"
                "## Acceptance\n\n```bash\ntrue\n```\n\n"
                "## Tests\n\n| Test name | File | Verifies | Covers |\n|---|---|---|---|\n"
                "| t | f | v | — |\n\n"
                "## Invariants\n\n- i\n\n## Risks\n\n- r\n\n"
                "## Stop Condition\n\nstop\n\n## Out of Scope\n\n- none\n\n"
                "## Verification Log\n", encoding="utf-8")
            errs = lint.Findings()
            lint.check_task(probe, set(), errs)
            return [a for a in errs.advice if "TDD red" in a]

    assert step_one_advice("1. Confirm the gate is red first: `spec-verify --spec x`") == [], \
        "a step that establishes red without saying 'test' is the shape we want"
    assert step_one_advice("1. Write the failing test first, and confirm it is red.") == [], \
        "the canonical wording must keep passing"
    # The must-fail direction, without which accepting everything would satisfy
    # both cases above (CLAUDE.md §4): a step 1 that establishes nothing is still
    # advised at.
    assert step_one_advice("1. Update the documentation and the changelog."), \
        "a step 1 that establishes no failing state must still be advised at"

    # BACKLOG §57. Two defects in one function, found from opposite directions.
    #
    # A BDD test is NAMED BY A STRING — `it('name', …)`, `t.Run("name", …)`,
    # `it 'name' do` — and the declaration matcher wanted `name(`, an identifier
    # being CALLED. So the whole JS/TS/Ruby/Go-subtest family was invisible, and
    # a session running adr-lint over a finished Vitest corpus was told all seven
    # of its tasks named tests that do not exist. Reported 2026-08-29.
    #
    # And the last-resort fallback accepted ANY line mentioning the name,
    # returning the rest of the file as its "body" — so a name appearing only in
    # a COMMENT or a bare string satisfied `check_tests_exist`. The check for a
    # Tests table naming a test that is not there could be satisfied by a note
    # saying it was planned. Found here while reproducing the first.
    for label, source, present in [
        ("vitest arrow", "it('t_name', () => {\n  expect(1).toBe(1)\n})\n", True),
        ("vitest async", 'it("t_name", async () => {\n  expect(1).toBe(1)\n})\n', True),
        ("jest function", "test('t_name', function () {\n  expect(1).toBe(1)\n})\n", True),
        ("go subtest", 't.Run("t_name", func(t *testing.T) {\n  _ = 1\n})\n', True),
        ("rspec do/end", "it 't_name' do\n  expect(1).to eq 1\nend\n", True),
        ("plain function", "func t_name(t *testing.T) {\n  _ = 1\n}\n", True),
        # The must-fail direction, and it is the half that was broken: without
        # these three, a `test_body` returning the whole file for anything would
        # satisfy every case above (CLAUDE.md §4).
        ("comment only", "// t_name is planned\n", False),
        ("string only", "const s = 't_name'\n", False),
        ("absent", "it('other', () => {})\n", False),
    ]:
        found = lint.test_body(source, "t_name", python=False) is not None
        assert found is present, f"test_body on {label}: found={found}, expected={present}"

    # BACKLOG §57, second half — and the reason this assertion goes through
    # `check_tests_exist` instead of through `test_body`. The BDD fix above
    # passed its own assertions while being UNREACHABLE in production: the caller
    # passed `code_only(...)` output, which blanks every string literal, so
    # `it('name', …)` arrived as `it('', …)` and the name was gone before the
    # matcher ran. Reported the same day by the session that had asked for the
    # fix and then re-ran it against its own corpus — nine identical messages,
    # unmoved. A test that exercises the mechanism and not the PATH is the defect
    # this repository exists to refuse (CLAUDE.md §4).
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        (root / "src").mkdir()
        (root / "src" / "wizard.test.ts").write_text(
            "import { describe, it, expect } from 'vitest'\n\n"
            "describe('wizard', () => {\n"
            "  it('test_carriers_derive_from_availability', () => {\n"
            "    expect(carriersFor('courier')).toEqual(['dpd'])\n"
            "  })\n"
            "})\n", encoding="utf-8")
        rows = ("| Test name | File | Verifies | Covers |\n|---|---|---|---|\n"
                "| `{name}` | `src/wizard.test.ts` | it works | — |\n")
        def exists_findings(name):
            # `evidenced_task_ids` asks the question of a task that is `done` or
            # carries an exit-0 entry, so the fixture must carry one — otherwise
            # the check skips and BOTH cases below come back empty, which is how
            # the first version of this test passed while asserting nothing.
            infos = {"T1": {
                "path": root / "T1.md",
                "tests": [(name, "src/wizard.test.ts")],
                "vlog": ["- 2026-08-29 · abc1234 · exit 0 · `npx vitest run` · "
                         "acceptance-sha256:" + "0" * 64],
            }}
            errs = lint.Findings()
            lint.check_tests_exist(infos, "| T1 | x | done |", errs, root)
            return [str(e) for e in list(errs) + list(errs.advice)]

        named = exists_findings("test_carriers_derive_from_availability")
        assert not any("no executable definition" in f for f in named), \
            f"a Vitest test named by a string exists: {named}"
        # The must-fail direction: the same call path must still report a row
        # naming a test that is genuinely absent, or the assertion above is
        # satisfied by a check that reports nothing at all.
        absent = exists_findings("test_nobody_wrote_this")
        assert any("no executable definition" in f for f in absent), \
            f"a row naming a test that does not exist must still be reported: {absent}"

    # BACKLOG §60. A rejection that quotes the first 70 characters of a bad row
    # shows the PREFIX — which, for a row correct up to a trailing addition, is
    # exactly the part that was fine. Reported 2026-08-29 by a session that
    # hand-wrote six Verification Log rows, had four rejected for prose appended
    # after the closing backtick, and was shown a correct-looking prefix beside a
    # complaint about grammar.
    bad = "- 2026-08-29 · a279259 · exit 0 · `make test` (0 import-graph violations)"
    said = lint.where_it_stopped(lint.VLOG_RE, bad)
    assert "(0 import-graph violations)" in said, said
    assert "then stops at" in said, said
    # The must-fail direction: a row that fails from its very first character has
    # no good prefix to point at, and must still be quoted rather than reported
    # as an empty remainder.
    assert lint.where_it_stopped(lint.VLOG_RE, "- not a row at all").startswith("- not a row"), \
        "a row that never starts matching is still shown"

    # BACKLOG §67. `//go:build readcostspec` is lexically a comment and
    # semantically a build constraint — restoring it removes whole test functions
    # from compilation. The comment-only guard classifies by SHAPE, so it refused
    # the strongest mutant a task whose deliverable IS the tag can have. Reported
    # 2026-08-29 with a hand-verified repro: `go test -run …` exited 0 over a
    # suite that executed nothing.
    for directive in ("//go:build readcostspec", "// +build linux", "//nolint:errcheck",
                      "# type: ignore", "# noqa: E501", "// eslint-disable-next-line",
                      "/* istanbul ignore next */", "#!/usr/bin/env bash"):
        assert verify.DIRECTIVE_COMMENT.search(directive), \
            f"a toolchain directive is not prose: {directive!r}"
    # The must-fail direction, and it is the whole guard (CLAUDE.md §4): ordinary
    # comments must NOT be exempted, or the exemption re-opens the hole the
    # comment-only check exists to close.
    for prose in ("// Bindings for the spec, in the DEFAULT lane",
                  "# the go: prefix appears mid-sentence here",
                  "// a note about nolint policy", "/* ignore this paragraph */"):
        assert not verify.DIRECTIVE_COMMENT.search(prose), \
            f"ordinary prose must stay comment-only: {prose!r}"

    # BACKLOG §65. An acceptance fence runs against the WORKTREE, so a file git
    # ignores can carry tool-written exit-0 evidence and still ship to nobody.
    # Measured 2026-08-29 on a Go repository whose .gitignore held a bare
    # `crossagentschat` for a build artifact, which also matched
    # `cmd/crossagentschat/` — a clean clone did not build, and a guard against
    # logging a credential existed in no committed file.
    with tempfile.TemporaryDirectory() as td:
        repo = Path(td)
        subprocess.run(["git", "init", "-q", str(repo)], check=True)
        (repo / ".gitignore").write_text("thing\n", encoding="utf-8")
        (repo / "cmd" / "thing").mkdir(parents=True)
        (repo / "cmd" / "thing" / "main.go").write_text("package main\n", encoding="utf-8")
        (repo / "kept.go").write_text("package main\n", encoding="utf-8")
        found = lint.ignored_paths(repo, {"cmd/thing/main.go", "kept.go"})
        assert found.get("cmd/thing/main.go") == "thing", found
        # The must-fail direction, and it is the whole check (CLAUDE.md §4): a
        # tracked path must NOT be reported, or "everything is ignored" satisfies
        # the assertion above and the finding means nothing.
        assert "kept.go" not in found, found
        # And a probe that could not run answers {} rather than "nothing is
        # ignored" — the two are different answers (ADR-005).
        assert lint.ignored_paths(None, {"x"}) is None
        assert lint.ignored_paths(repo, set()) == {}
        # A probe that RAN and found nothing is {}; a probe that COULD NOT RUN is
        # None, and the caller says so. Returning {} for both made the guard
        # unobservable — a mutation removing it could not be killed, which is a
        # finding about the code rather than about the test (BACKLOG §65).
        # In its OWN temp root: a directory under `repo` is inside that
        # repository, so check-ignore answers there and the case proves nothing.
        with tempfile.TemporaryDirectory() as elsewhere:
            assert lint.ignored_paths(Path(elsewhere), {"x"}) is None
        assert lint.ignored_paths(repo, {"kept.go"}) == {}

    # BACKLOG §54. The recorded failure block was the tail of `stdout + stderr`,
    # so a runner whose verdict goes to stdout and whose noise goes to stderr —
    # ansible's exact shape — left a block containing NONE of the failure.
    # Measured 2026-08-29: one FAIL line and twelve warnings produced ten
    # warnings and no FAIL, and the reporting session hit it five times while
    # every deploy was in fact correct.
    tail = verify.failure_tail("FAIL: the assertion that matters\n",
                               "\n".join(f"warning {i}" for i in range(1, 13)))
    assert any("FAIL: the assertion that matters" in ln for ln in tail), tail
    assert any("stdout" in ln for ln in tail) and any("stderr" in ln for ln in tail), tail
    # The raw count is stated whenever folding changed the picture, because a
    # block that hides what it compressed reads as the whole run.
    assert any("12 raw" in ln for ln in tail), tail
    # The must-fail direction (CLAUDE.md §4): an EMPTY stream is omitted, not
    # labelled — otherwise "always emit both headers" satisfies the assertions
    # above while saying nothing about what was captured.
    # BACKLOG §70. The per-stream tail stopped the verdict being EVICTED and not
    # being BURIED: measured on a real fence, fourteen recorded lines of which two
    # carried the verdict and ten were one deprecation warning repeated. A reader
    # whose eye lands mid-block concludes the task failed on a deprecation.
    noisy = verify.failure_tail("FAIL: the line a reader needs\n",
                                "\n".join(["warning: deprecated module"] * 12))
    # (x12), not (x10): §72 folds the WHOLE stream before truncating, so the
    # count is what happened rather than what survived the tail. The earlier
    # version of this assertion expected (x10) and was asserting the defect.
    assert any("(x12)" in ln for ln in noisy), noisy
    assert sum(1 for ln in noisy if "deprecated" in ln) == 1, noisy
    assert any("FAIL: the line a reader needs" in ln for ln in noisy), noisy
    # The must-fail direction (CLAUDE.md §4): DISTINCT lines must not be folded,
    # or the block loses content rather than repetition.
    distinct = verify.collapse_repeats(["one", "two", "two", "three"])
    assert distinct == ["one", "two  (x2)", "three"], distinct

    # BACKLOG §72. Folding the TAIL counts what survived the tail, not what
    # happened: five identical warnings with two cut by the tail reported (x3),
    # accurate about the block and wrong about the world. Folding FIRST makes the
    # counts true and makes truncation rarer — twelve raw lines fold to four, so
    # nothing is cut at all. Reported 2026-08-29 on a fixture built to separate
    # three questions a uniform block cannot: is folding consecutive-only, do
    # unique lines survive, and how does folding compose with truncation.
    dup = "warning: deprecated module"
    interleaved = verify.failure_tail(
        "FAIL: the verdict\n",
        "\n".join([dup] * 5 + ["UNIQUE-A"] + [dup] * 5 + ["UNIQUE-B"]))
    assert [ln for ln in interleaved if dup in ln] == [f"{dup}  (x5)", f"{dup}  (x5)"], interleaved
    assert "UNIQUE-A" in interleaved and "UNIQUE-B" in interleaved, interleaved
    # Consecutive-only: two runs of the same line separated by a unique one must
    # NOT collapse into a single (x10), which would be a different claim.
    assert not any("(x10)" in ln for ln in interleaved), interleaved
    # And when the FOLDED lines still exceed the budget, the header says so —
    # the truncation is disclosed after folding rather than before it.
    many = verify.failure_tail("", "\n".join(f"distinct line {i}" for i in range(40)))
    assert any("after folding 40 raw" in ln for ln in many), many

    only_err = verify.failure_tail("", "boom\n")
    assert not any("stdout" in ln for ln in only_err), only_err
    assert verify.failure_tail("", "") == []
    # And a killed run's leftovers decode whether they arrive as bytes, str or
    # None, because that is what TimeoutExpired hands back.
    assert verify.decode_stream(b"partial") == "partial"
    assert verify.decode_stream("partial") == "partial"
    assert verify.decode_stream(None) == ""

    # BACKLOG §73. Changing one word in a tasks README — `done` to `partial` —
    # took a task from 2 findings to 0 on a real corpus. Not "partial is
    # unmodelled", which was already filed: choosing the honest label REMOVED the
    # task from every evidenced-task check, including a Mutation Log finding true
    # regardless of the label. `done` buys scrutiny, `pending` is a lie once code
    # has landed, and the truthful word makes the linter stop looking.
    readme = "| Task | Scope | Status |\n|---|---|---|\n| T1 | s | {} |\n"
    def status_advice(value):
        errs = lint.Findings()
        lint.check_task_status_vocabulary({"T1": {"path": Path("T1.md")}},
                                          readme.format(value), errs)
        return [a for a in errs.advice if "does not act on" in a]

    # ADR-014 T1 — `partial is no longer an unrecognised status`.
    #
    # §73 measured the cost of it NOT being one: a task whose README status read
    # `partial` produced 0 findings where the same task marked `done` produced 2,
    # so the honest word bought silence from the linter. §73 removed the silence
    # by ADVISING on the unknown word. ADR-014 finishes the job by making it known
    # — the advice was a placeholder for a decision nobody had made yet.
    assert not status_advice("partial"), \
        "partial is a status this reader acts on and must not be advised at"
    # The must-fail direction (CLAUDE.md §4): a word genuinely outside the
    # vocabulary must still be reported, or §73 has been undone rather than
    # completed. `running`, `failed` and `deferred` were all observed in another
    # corpus's legend and are deliberately NOT adopted (the record's Out of Scope).
    for unknown in ("running", "failed", "deferred", "mostly-done"):
        assert status_advice(unknown), \
            f"{unknown} is outside the vocabulary and must say the checks did not run"
    # The statuses this reader DOES act on stay silent, or the advice fires on
    # every task and means nothing.
    for known in ("done", "pending", "blocked", "DONE", "partial", "PARTIAL"):
        assert not status_advice(known), f"{known} is acted on and must not be advised at"
    # An empty or placeholder cell is not a claim, so it is not a finding either.
    for blank in ("", "—", "-"):
        assert not status_advice(blank), f"{blank!r} claims nothing"
    # A REAL README writes `**done** (2026-07-29) — prose about what happened`,
    # not a bare token. The first version compared the whole cell and would have
    # fired on every row of a corpus that writes them that way — caught before
    # release by a session reporting its README shape while reporting a clean
    # negative on something else. A check that fires on every row is one people
    # switch off (docs/BACKLOG.md §73).
    for dressed in ("**done** (2026-07-29) — sshd drop-in split off to T3b (deferred)",
                    "`blocked` waiting on prod", "_pending_"):
        assert not status_advice(dressed), f"a dressed status is still its word: {dressed!r}"
    # And the emphasis must not hide an unrecognised one either.
    dressed_advice = status_advice("**running** — two of thirteen steps")
    assert dressed_advice, "emphasis is not an exemption"
    # The message names the WORD it acted on as well as the cell it read. Quoting
    # only the cell reads as though that whole string was treated as the status,
    # which invites the conclusion that the parser is naive in exactly the way it
    # is not (docs/BACKLOG.md §75).
    assert "`running` (from" in dressed_advice[0], dressed_advice
    # And when the cell IS the word, it is not repeated back twice.
    assert "(from" not in status_advice("running")[0], status_advice("running")

    # BACKLOG §75. A README commonly holds TWO tables whose first column is
    # `| T1 |`: the status table, and a wave/ordering table whose third column is
    # DEPENDS-ON. Taking the status column index from the first header and
    # applying it to every later row read `T3, T5, T6` as a status — 7 of 28
    # records on a real corpus, one correct read and one garbage read per task.
    # The column is per-table too: one status table is
    # `ID | Title | Status | Owner | Acceptance` and another is
    # `ID | Title | Status | Acceptance`, so an index right for one is wrong for
    # the other even among the correct tables.
    two_tables = (
        "| ID | Title | Status | Owner | Acceptance |\n|---|---|---|---|---|\n"
        "| T1 | groups | **done** (2026-07-20) | zy | full check |\n"
        "\n## Wave order\n\n"
        "| ID | Title | Depends-on | Note |\n|---|---|---|---|\n"
        "| T1 | groups | T3, T5, T6, bitbucket-deploy | T1 first |\n")
    errs = lint.Findings()
    lint.check_task_status_vocabulary({"T1": {"path": Path("T1.md")}}, two_tables, errs)
    assert not [a for a in errs.advice if "does not act on" in a], \
        f"a depends-on column is not a status: {errs.advice}"
    # ADJACENT tables, with no blank line or heading between them. This is what
    # makes the per-header re-read load-bearing: with a gap, the reset on any
    # non-table line already clears the column, so a mutant that skipped the
    # re-read behaved identically and the campaign said so by staying GREEN. Two
    # mechanisms, only one of them exercised — which is the same defect class as
    # a catalogue entry naming a test that never drives the path.
    adjacent = (
        "| ID | Title | Status |\n|---|---|---|\n"
        "| T1 | groups | done |\n"
        "| ID | Title | Depends-on |\n|---|---|---|\n"
        "| T1 | groups | T3, T5, T6 |\n")
    errs = lint.Findings()
    lint.check_task_status_vocabulary({"T1": {"path": Path("T1.md")}}, adjacent, errs)
    assert not [a for a in errs.advice if "does not act on" in a], \
        f"a second table's column is not a status even with no gap: {errs.advice}"

    # THE SAME TASK ID IN BOTH TABLES, which is the second-order case: `T4` is
    # `done` in the status table and `T10` in the producer table, so under the
    # old parse whichever was read LAST won — a task's real status overwritten by
    # a dependency cell. Measured on a corpus where 173 rows across 14 of 14 task
    # READMEs sit in a non-first table (docs/BACKLOG.md §75).
    duplicated = (
        "| ID | Title | Status | Covers | Acceptance |\n|---|---|---|---|---|\n"
        "| T4 | the task | done | F-1 | something |\n"
        "| T11 | partial one | **running** — two of thirteen | F-2 | something |\n"
        "\n"
        "| Producer | Contract | Consumer(s) | Ordering note |\n|---|---|---|---|\n"
        "| T4 | the contract | T10 | T4 first |\n"
        "| T11 | another | T2, T4, T9 | later |\n")
    errs = lint.Findings()
    lint.check_task_status_vocabulary(
        {"T4": {"path": Path("T4.md")}, "T11": {"path": Path("T11.md")}}, duplicated, errs)
    named = [a for a in errs.advice if "does not act on" in a]
    assert len(named) == 1 and "T11" in named[0], \
        f"a Consumer(s) cell must not overwrite a status, and T11's real one must survive: {named}"

    # The must-fail direction: the STATUS table is still read, in a README with
    # the same two-table shape — otherwise "ignore the second table" degrades
    # into "ignore everything" and the check silently stops working.
    errs = lint.Findings()
    lint.check_task_status_vocabulary(
        {"T1": {"path": Path("T1.md")}},
        two_tables.replace("**done** (2026-07-20)", "**running** — two of thirteen"), errs)
    assert [a for a in errs.advice if "does not act on" in a], \
        "the status table must still be read when a second table follows it"
    # And a task the reader has no file for is not reported: the status belongs
    # to a row this corpus cannot resolve, which is a different finding.
    errs = lint.Findings()
    lint.check_task_status_vocabulary({}, readme.format("running"), errs)
    assert not [a for a in errs.advice if "does not act on" in a], errs.advice

    # ADR-014 T1 — `a partial task with passing evidence owes what a done task owes`.
    #
    # This is the half that makes `partial` a status with OBLIGATIONS rather than a
    # softer word for pending. A task that landed real work, recorded a passing
    # fence, and is honest that it is not finished must still be asked whether that
    # fence can fail. Reported by klientams-front-v2-01 as the shape that actually
    # bites: all nine of their tasks read `done` for a week, then 2.35.0 introduced
    # the mutation obligation and seven turned FAIL without changing — and four of
    # the nine fences could not fail at all. Nobody KNEW they were part-done. So
    # `partial` cannot only be a word an author sets when they already know; the
    # obligation has to be derivable from the evidence, and this is where it is.
    partial_acc = "printf first"
    partial_pass = (f"- 2026-08-22 · no-git · exit 0 · `printf first …` · "
                    f"acceptance-sha256:{lint.acceptance_digest(partial_acc)}")
    partial_info = {
        "T1": {"human": False, "path": Path("T1.md"), "vlog": [partial_pass],
               "mlog": [], "has_mlog": False, "acc_all": partial_acc}
    }
    errs = lint.Findings()
    lint.check_mutation_evidence(partial_info, "| T1 | probe | partial |", errs)
    assert errs or errs.advice, \
        "a partial task with a passing fence must still be asked to show that fence can fail"

    # `a partial task is not asked for a done row's evidence`. The exit-0
    # requirement belongs to a claim of completion, and `partial` does not make one.
    # Without this the new status would be `done` under another name.
    errs = lint.Findings()
    lint.check_verification({"T1": {"human": False, "vlog": [], "mlog": [],
                                    "acc_all": partial_acc,
                                    "acc_first": partial_acc}},
                            "| T1 | probe | partial |", errs)
    assert not [e for e in errs if "no exit-0" in e or "hand-declare" in e], \
        f"a partial task claims no completion and must not be asked for a done row's evidence: {list(errs)}"
    # The must-fail direction: a `done` row with no evidence IS still refused, or
    # this task loosened `done` instead of adding a status beside it.
    errs = lint.Findings()
    lint.check_verification({"T1": {"human": False, "vlog": [], "mlog": [],
                                    "acc_all": partial_acc,
                                    "acc_first": partial_acc}},
                            "| T1 | probe | done |", errs)
    assert [e for e in errs if "exit-0" in e or "hand-declare" in e], \
        f"done must still require its evidence: {list(errs)}"

    # ADR-014 T2 — `Blocked-on requires a human-observed acceptance`.
    def blocked_on_findings(header, acceptance="```bash\ntrue\n```",
                            stems=("T4-registry",)):
        with tempfile.TemporaryDirectory() as td:
            probe = Path(td) / "T9-probe.md"
            probe.write_text(
                "# Task X-T9: probe\n\n"
                "**Depends-on:** none\n**Covers:** none\n**Produces:** none\n"
                "**Consumes:** none\n" + header +
                "\n## Goal\n\ng\n\n"
                "## Affected Files\n\n| File | Change | Why |\n|---|---|---|\n"
                "| `x.py` | edit | w |\n\n"
                "## Ordered Steps\n\n1. Write the failing test first.\n2. Then the rest.\n\n"
                "## Acceptance\n\n" + acceptance + "\n\n"
                "## Tests\n\n| Test name | File | Verifies | Covers |\n|---|---|---|---|\n"
                "| t | f | v | — |\n\n"
                "## Invariants\n\n- i\n\n## Risks\n\n- r\n\n"
                "## Stop Condition\n\nstop\n\n## Out of Scope\n\n- none\n\n"
                "## Verification Log\n", encoding="utf-8")
            errs = lint.Findings()
            lint.check_task(probe, set(stems), errs)
            return ([e for e in errs if "Blocked-on" in e],
                    [a for a in errs.advice if "Blocked-on" in a])

    human_acc = "Acceptance is human-observed: a person restarts the client and reports."
    event = "**Blocked-on:** commit 3f97d0ba is an ancestor of master (git merge-base --is-ancestor 3f97d0ba master)\n"

    # A task genuinely waiting on the outside world declares it, and its Acceptance
    # is human-observed — there is no fence to run, which is what waiting MEANS.
    blocking, _ = blocked_on_findings(event, human_acc)
    assert blocking == [], f"Blocked-on on a human-observed task must be accepted: {blocking}"

    # The same header on a task with a RUNNABLE fence is refused. A task that can
    # run its own acceptance is not waiting on the outside world; it is unfinished,
    # which is `pending` or `partial`. The distinction is structural — a bash fence
    # or the explicit human-observed sentence — never a reading of the fence's text,
    # which is the heuristic docs/BACKLOG.md §67 refused.
    blocking, _ = blocked_on_findings(event)
    assert blocking, "Blocked-on on a task with a runnable bash fence must be refused"
    assert "human-observed" in blocking[0], \
        f"and the refusal must say what would make it legitimate: {blocking[0]}"

    # `a task without Blocked-on is unaffected`. The header is OPTIONAL: every task
    # file valid before this change stays valid, or the corpus turns red overnight.
    blocking, advice = blocked_on_findings("")
    assert blocking == [] and advice == [], \
        f"a task without the header must be untouched: {blocking} {advice}"

    # ADVICE, not a refusal: a Blocked-on that names no CHECKABLE event.
    #
    # Reported by klientams-front-v2-01, who supplied both the good shape and the
    # reason it will not happen by itself. Their real one is a command that exits
    # 0 or 1 — `git merge-base --is-ancestor 3f97d0ba master` — and their warning
    # is that all nine of their tasks already carry a `## Stop Condition`, which is
    # prose about when to abandon. If `Blocked-on` lands beside those it gets
    # filled in the same register unless the difference is said out loud.
    #
    # It is ADVICE because they also named a class this cannot resolve: an event
    # only checkable by someone with access the local reader lacks ("an accepted
    # client-verify-assets appears in the router audit log on both prod nodes").
    # That is a legitimate Blocked-on that no command here can run, so refusing it
    # would punish the honest case.
    _, advice = blocked_on_findings(
        "**Blocked-on:** the upstream team getting round to it\n", human_acc)
    assert advice, "a Blocked-on naming no checkable event must be advised at"
    assert "exits 0" in advice[0] or "command" in advice[0], \
        f"and the advice must say what a checkable event looks like: {advice[0]}"
    # The must-fail direction: a header that DOES name a check stays silent, or the
    # advice fires on every Blocked-on and means nothing.
    _, advice = blocked_on_findings(event, human_acc)
    assert advice == [], f"a Blocked-on naming a runnable check must not be advised at: {advice}"

    # ADR-014 T2 — the advisory's checkable-event test must be LINEAR.
    # Its natural regex spelling backtracked quadratically on a value that opens a
    # parenthesis and never closes one: 0.84s at 16k characters, 11.9s at 60k, with
    # the cost on the REJECTING path — which is the path that fires the advisory.
    # That is the same finding a review had just made about the Mutation Log code
    # span, written again the same day by the session that had been told.
    assert lint.names_a_check(
        "commit abc is an ancestor of master (git merge-base --is-ancestor abc master)")
    assert lint.names_a_check("`git merge-base --is-ancestor abc master`")
    assert not lint.names_a_check("the upstream team getting round to it")
    assert not lint.names_a_check("waiting ()"), "an empty parenthesis names nothing"

    # Four soundness cases from a Codex review, all confirmed live before fixing.
    # The predicate cannot read prose, so each is settled by STRUCTURE or admitted
    # as undetectable and handled in the wording instead (CLAUDE.md §3).
    assert not lint.names_a_check("the upstream team gets round to it (eventually)"), \
        "a one-word parenthetical is prose, not a command"
    assert not lint.names_a_check("wait until someone cares `"), \
        "an UNPAIRED backtick is a typo, not a code span"
    assert not lint.names_a_check("waiting on `` "), \
        "an empty code span names nothing"
    # A command may legitimately contain parentheses, and a sentence may legitimately
    # end in a full stop. Both were refused, which is the mirror failure: telling an
    # author who DID name a check that they did not.
    assert lint.names_a_check("probe exits zero (python -c SystemExit(0))."), \
        "a command containing parentheses, after trailing punctuation, is still a command"
    # The class this genuinely cannot detect: an event only a PERSON can confirm.
    # klientams-front-v2-01 named it and it has no command by construction, so it
    # gets an explicit marker rather than a guess at prose.
    assert lint.names_a_check(
        "the router audit log shows accepted on both prod nodes — checked by: SRE on call"), \
        "an explicit observer marker is a way to check, even with no command"
    assert not lint.names_a_check("SRE confirms the router audit log shows accepted"), \
        "but naming a role in prose is NOT the marker — that is the part this cannot read"
    _t0 = time.perf_counter()
    assert not lint.names_a_check("(" + "a" * 200000)
    _dt = time.perf_counter() - _t0
    assert _dt < 0.5, f"an unclosed parenthesis must not backtrack: took {_dt:.3f}s"

    # ADR-014 T2, follow-on. Reported by wcag-43 against the shipped rule: the
    # refusal tests whether the fence RUNS, and that is a proxy that happens to
    # correlate. Their T11 genuinely IS waiting — on T10 putting a judge back on
    # the production path — so "a runnable fence means you are not waiting" gets
    # the right verdict for their task by a route that is not true.
    #
    # The distinction that does the work is WHOSE CLOCK the event is on:
    #   Depends-on — another task IN THIS CORPUS. Someone here can go and do it.
    #   Blocked-on — something OUTSIDE it. Nobody here can make it happen sooner.
    #
    # The hole that leaves: a task with an UNRUNNABLE fence and an IN-CORPUS
    # blocker passes the shipped rule and should not, or Blocked-on becomes a
    # second spelling of Depends-on and the two drift.
    sibling_event = "**Blocked-on:** T4 landing the registry\n"
    blocking, _ = blocked_on_findings(sibling_event, human_acc)
    assert blocking, "Blocked-on naming a task in this corpus must be refused"
    assert "Depends-on" in blocking[0], \
        f"and the refusal must name the header that IS for in-corpus work: {blocking[0]}"
    # The must-fail direction: an event outside the corpus that merely CONTAINS a
    # T-shaped token is not an in-corpus dependency. Without this the check would
    # refuse legitimate events and teach people to route around it.
    blocking, _ = blocked_on_findings(
        "**Blocked-on:** the vendor enabling API T5000 on our account "
        "(curl -sf https://vendor.invalid/status)\n", human_acc)
    assert blocking == [], f"an external event mentioning a T-token must be accepted: {blocking}"

    # A Tests row naming a path OUTSIDE this repository is "I could not look", not
    # "nothing can run this". Reported 2026-08-30 by depozitas-laravel-22, who then
    # went and found the test: present in the repo the `../` path names, on an
    # unmerged branch, added by the very commit the task records. The gate looked in
    # ONE repository, for a path built to point outside it, and reported absence as a
    # verdict about the world — CLAUDE.md §3, and the tool already owns the right
    # idiom nine lines below in its own output ("could not ask git … so that check
    # did NOT run").
    #
    # It also BLOCKED, so a task whose code genuinely lives elsewhere made the owning
    # repository's lint permanently red with no reachable state that satisfies it.
    cross = {
        "T1": {"human": False, "path": Path("T1.md"),
               "vlog": ["- 2026-08-22 · no-git · exit 0 · `x` "
                        "· acceptance-sha256:" + "0" * 64],
               "mlog": [], "acc_all": "x", "acc_first": "x",
               "tests": [("test_the_sentinel_is_refused",
                          "../other_repo/tests/Unit/GuardTest.php"),
                         ("test_a_second_row_same_file",
                          "../other_repo/tests/Unit/GuardTest.php")]}
    }
    errs = lint.Findings()
    lint.check_tests_exist(cross, "| T1 | probe | done |", errs, Path("."))
    blocking = [e for e in errs if "GuardTest" in e]
    advice = [a for a in errs.advice if "GuardTest" in a]
    assert not blocking, f"a path leaving the repository must not BLOCK: {blocking}"
    assert advice, "but it must still be reported"
    assert len(advice) == 1, \
        f"and once per file, not once per row — two rows named one path: {advice}"
    assert "could not" in advice[0].lower() or "did not run" in advice[0].lower(), \
        f"the wording must say what it could not do, not what is absent: {advice[0]}"

    # The must-fail direction: a path INSIDE the repository that does not exist is
    # still a blocking finding, or this turns a real check into a shrug.
    inside = {"T1": dict(cross["T1"],
                         tests=[("test_x", "tests/does_not_exist_here.py")])}
    errs = lint.Findings()
    lint.check_tests_exist(inside, "| T1 | probe | done |", errs, Path("."))
    assert [e for e in errs if "does_not_exist_here" in e], \
        "a missing file INSIDE the repo must still block"

    postmortem = Path(sys.argv[2]).read_text().lower()
    assert "any severity" not in postmortem and "after any bug" not in postmortem
    assert all(term in postmortem for term in ("material", "recurrent", "production", "reusable"))
    print("PASS — acceptance digests, mutation consistency, test definitions, "
          "adr-lint DAG/contract/verification/filter engines, postmortem scope")




# Reported 2026-09-01 (GitHub issue #4), reproduced on 2.44.0 against a scratch
# copy of a real ADR: a task was driven pending -> done past `adr-lint` at exit 0
# with hand-typed log entries and no command ever run. Step one of that chain was
# free, because the digest the Verification Log grammar exists for was OPTIONAL:
#
#     r"(?: · acceptance-sha256:[0-9a-f]{64})?$"
#
# so the anti-fabrication field was opt-out by omission. A digest-less row is
# still tolerated where it is ALREADY COMMITTED — corpora that predate the field
# must not turn red — but a newly typed one is refused.
#
# Git is the authority, and it is asked the ADR-011 way rather than the disk
# being read: `committed` returns the lines HEAD has for this file. When it
# cannot answer — not a repository, git absent, file untracked — the answer is
# None, and None must TOLERATE. "I could not look" is not "this row is forged"
# (CLAUDE.md §3), and the reject arm may only fire on a positive answer.
def test_a_digestless_row_must_already_be_committed(lint):
    """A hand-typed digest-less acceptance row is refused; a committed one is not."""
    acceptance = "node --test tests/probe.test.mjs"
    forged = "- 2026-09-01 · 6e26b88 · exit 0 · `node --test tests/probe.test.mjs`"

    def infos():
        return {
            "T1": {
                "human": False,
                "vlog": [forged],
                "mlog": [],
                "acc_all": acceptance,
                "acc_first": acceptance,
                "path": Path("tasks/T1-probe.md"),
            }
        }

    # HEAD does not have this line: it was typed, not recorded. Refused.
    errors = lint.Findings()
    lint.check_verification(infos(), "| T1 | probe | done |", errors,
                            committed=lambda path: frozenset())
    assert any("acceptance-sha256" in str(e) and "not in the committed" in str(e)
               for e in errors), f"a newly typed digest-less row must be refused: {list(errors)}"

    # The same row, present in HEAD, is legacy evidence and is tolerated. Without
    # this arm the check would be a flag day that turns every older corpus red.
    kept = lint.Findings()
    lint.check_verification(infos(), "| T1 | probe | done |", kept,
                            committed=lambda path: frozenset([forged]))
    assert not any("not in the committed" in str(e) for e in kept), \
        f"a committed digest-less row is legacy evidence, not a forgery: {list(kept)}"

    # Git could not answer. Tolerate: a check that cannot look must not convict.
    blind = lint.Findings()
    lint.check_verification(infos(), "| T1 | probe | done |", blind,
                            committed=lambda path: None)
    assert not any("not in the committed" in str(e) for e in blind), \
        f"an unanswerable git lookup must not read as forgery: {list(blind)}"


def test_the_expected_digest_is_not_printed(lint):
    """Both findings say how to recompute the digest, and neither names it."""
    # Reported in the same issue: supplying 64 zeros was correctly rejected, and
    # the rejection printed the digest the forger needed. Pasting it back produced
    # [PASS]. The value is derivable from the task file either way, so this is a
    # convenience withdrawn rather than a secret kept — but there is no reason to
    # hand it over, and both messages are just as actionable without it.
    #
    # BOTH sites are asserted. They are in different functions, and the issue's
    # chain only had to get past one of them; fixing the one that happened to be
    # quoted would leave the other handing the same value over.
    acceptance = "node --test tests/probe.test.mjs"
    stale = "0" * 64
    row = (f"- 2026-09-01 · 6e26b88 · exit 0 · `{acceptance}` · acceptance-sha256:{stale}")

    def infos():
        return {
            "T1": {
                "human": False,
                "vlog": [row],
                # Must MATCH MLOG_TOOL_ARM, or `other` is empty, the finding takes
                # its "Mutation Log is empty" arm, and the disclosing branch is
                # never rendered — which is why the first version of this test
                # could not kill the mutation that restores the disclosure.
                # `survived` pairs with `exit 0` in that grammar.
                "mlog": ["- 2026-09-01 · 6e26b88 · mutant survived · exit 0 · `x.mjs` · "
                         "broke the guard and the fence still passed"],
                "has_mlog": True,
                "acc_all": acceptance,
                "acc_first": acceptance,
                "path": Path("tasks/T1-probe.md"),
            }
        }

    drift = lint.Findings()
    lint.check_verification(infos(), "| T1 | probe | done |", drift,
                            committed=lambda path: None)
    said = "\n".join(str(e) for e in drift)
    assert "Acceptance digest" in said, f"the fence-drift finding must still fire: {said}"
    # ANY 64-hex run, not the one this test computed. The first version of this
    # assertion derived the expected digest through `normalize_acceptance` while
    # the gate derives it without — so `want not in said` was true whether or not
    # a digest was printed, and the mutation restoring the disclosure came back
    # GREEN. A test whose expected value is computed a second way can be
    # vacuous without ever looking wrong (CLAUDE.md §4).
    assert not re.search(r"[0-9a-f]{64}", said), \
        f"the drift finding discloses a digest: {said}"

    mutation = lint.Findings()
    lint.check_mutation_evidence(infos(), "| T1 | probe | done |", mutation)
    told = "\n".join(str(e) for e in mutation)
    assert "killed" in told, f"the mutation finding must still fire: {told}"
    assert not re.search(r"[0-9a-f]{64}", told), \
        f"the mutation finding discloses a digest: {told}"


# Reported 2026-09-01 (GitHub issue #5), against 2.44.0. A record with four legacy
# permanent dispositions produced four advisory lines — the right COUNT, one per
# entry — and all four were byte-identical, because the advisory never named the
# entry it came from:
#
#     adr-lint ... | grep -c 'permanent basis'          -> 4
#     adr-lint ... | grep 'permanent basis' | sort -u   -> 1
#
# The author cannot tell which bullet to fix, and the output reads as a duplicated
# message rather than as four findings. The reporter had recorded it as a
# duplicate-diagnostics defect and had to go and count the dispositions to find it
# was correct. An advisory that looks like a bug is one an author stops reading —
# that second-order cost is the reason this is worth fixing rather than tolerating.
def test_a_permanent_advisory_names_its_entry(lint):
    """Two different dispositions produce two different advisory lines."""
    entries = [
        "permanent: the mechanism is the experiment that could justify reversing this ADR",
        "permanent: this ADR removes a closet's vote in ranking, not the closet",
        "permanent: each has its own arm and its own decision; this ADR moves one prior",
    ]
    errors = lint.Findings()
    for inner in entries:
        lint.check_permanent_disposition(
            inner, "ADR-003-probe.md", errors, Path("."), lambda: frozenset())

    said = [a for a in errors.advice if "permanent basis" in a]
    assert len(said) == len(entries), \
        f"one advisory per entry, which was never the defect: {said}"
    assert len(set(said)) == len(entries), \
        f"N entries must produce N DISTINCT lines, not N copies of one: {said}"
    # Each line must carry enough of its own entry to find the bullet by eye.
    for inner, line in zip(entries, said):
        excerpt = inner[len("permanent: "):][:24]
        assert excerpt in line, f"the advisory must name its entry: {excerpt!r} not in {line!r}"


# ADR-020 T1. The record's falsifier fired on its own first measurement — 25 of
# this corpus's 40 acceptance fences print a per-test duration, so a digest of a
# run's OUTPUT can never be compared. What survives is a duration and a FLOOR:
# a value the file cannot produce, checked by reasoning about the fence rather
# than by comparison with another run.
def test_an_entry_records_how_long_the_run_took(bin_dir, lint, verify, nxt):
    """The duration is required from a cutover, and an impossible one is advised."""
    acceptance = "docker run --rm golang:1 go vet ./..."
    digest = verify.acceptance_digest(verify.normalize_acceptance(acceptance))

    # THE FIELD IS NOT OPTIONAL-BY-OMISSION, which was issue #4's finding about
    # the acceptance digest. It is gated on the row's own date instead, the way
    # MUTATION_REQUIRED_FROM already gates mutation evidence, so a missing field
    # is a checkable claim about when the row was written.
    after = lint.DURATION_REQUIRED_FROM
    assert lint.VLOG_RE.match(
        f"- {after} · abc1234 · exit 0 · `probe` · acceptance-sha256:{digest} · ms:1200"), \
        "a new-shape entry must parse"
    assert lint.VLOG_RE.match(f"- 2026-08-01 · abc1234 · exit 0 · `probe` · "
                              f"acceptance-sha256:{digest}"), \
        "and every entry already in the corpus must keep parsing, forever"

    # All THREE readers, because a third drifting is what makes adr-next call a
    # verified task unverified and hand a session work that is finished.
    row = f"- {after} · abc1234 · exit 0 · `{acceptance}` · acceptance-sha256:{digest} · ms:1200"
    assert lint.VLOG_DIGEST_RE.match(row), "adr-lint reads the digest out of a new-shape row"
    assert nxt.is_done(f"## Verification Log\n{row}\n", digest, False), \
        "adr-next must still see a new-shape row as done"

    # THE DOWNGRADE PATH. A corpus verified under this version and read by the
    # PREVIOUS gate must not read as malformed. The field is appended at the end
    # for exactly this reason, and this asserts it against the released pattern
    # rather than trusting that it was.
    released = re.compile(
        r"^- \d{4}-\d{2}-\d{2} · (?:[0-9a-f]{7,}\*?|no-git) · exit (?P<exit>\d+) · "
        r"`(?P<command>[^`]+)` · acceptance-sha256:(?P<digest>[0-9a-f]{64})$")
    assert not released.match(row), (
        "the 2.45.0 pattern is anchored, so it does NOT match a longer row — which is "
        "why the cutover is dated: an older gate treats a new row as no-digest legacy "
        "rather than as malformed, and legacy rows are tolerated")

    # THE FLOOR. It speaks only about a duration that could not have produced the
    # result claimed, and it is never an equality check.
    assert lint.implausibly_fast(3, acceptance), \
        "exit 0 in 3ms cannot have started a container and run go vet"
    assert not lint.implausibly_fast(180_000, acceptance), \
        "a slow honest run is not a finding"
    # And a genuinely quick fence is silent on the SAME function — a floor that
    # fires on `true` would redden honest work, which is the objection that
    # killed duration from this record's first draft.
    assert not lint.implausibly_fast(3, "printf ok"), \
        "a fence that really is instant must never be advised"


# Reported on GitHub issue #6, 2026-09-01, verified on Windows against v2.47.0:
# `implausibly_fast` was defined, directly asserted three times, and CALLED FROM
# NOTHING. One grep hit in the whole plugin — the definition. A row claiming
# `exit 0` in 3ms against a fence that starts a container passed adr-lint clean.
#
# THIS TEST IS ABOUT THE CALL SITE, NOT THE PREDICATE. The three assertions that
# shipped are good ones about the function and cannot fail while no production
# path calls it: the fence was satisfied by the component while the selection did
# not exist, which is this repository's own documented most-common defect. Delete
# the `if implausibly_fast(...)` line and this goes red; delete the function and
# the older assertions go red too, which is the difference that matters.
def test_the_floor_runs_on_a_done_row(lint):
    """check_verification actually calls the floor, on a real parsed row."""
    acceptance = "docker run --rm golang:1 go vet ./..."
    digest = lint.acceptance_digest(lint.normalize_acceptance(acceptance))
    after = lint.DURATION_REQUIRED_FROM

    def infos(ms):
        row = (f"- {after} · abc1234 · exit 0 · `{acceptance}` · "
               f"acceptance-sha256:{digest} · ms:{ms}")
        return {
            "T1": {
                "human": False,
                "vlog": [row],
                "mlog": [f"- {after} · abc1234 · mutant killed · exit 1 · `x.py` · why · "
                         f"acceptance-sha256:{digest}"],
                "has_mlog": True,
                "acc_all": acceptance,
                "acc_first": acceptance,
                "path": Path("tasks/T1-probe.md"),
            }
        }

    fast = lint.Findings()
    lint.check_verification(infos(3), "| T1 | probe | done |", fast,
                            committed=lambda path: None)
    said = "\n".join(str(e) for e in fast) + "\n".join(fast.advice)
    assert "3ms" in said or "could not" in said.lower() or "implausib" in said.lower(), \
        f"exit 0 in 3ms against a container fence must be reported: {said}"

    # The same fixture, an honest duration, silent. A floor that speaks on both is
    # not a floor.
    slow = lint.Findings()
    lint.check_verification(infos(180_000), "| T1 | probe | done |", slow,
                            committed=lambda path: None)
    quiet = "\n".join(str(e) for e in slow) + "\n".join(slow.advice)
    assert "implausib" not in quiet.lower(), \
        f"a slow honest run must not be reported: {quiet}"

    # ADVISORY, never blocking (CLAUDE.md §3).
    assert not [e for e in fast if "implausib" in str(e).lower()], \
        "the floor advises; it must never enter the blocking channel"


# Reported 2026-09-01 while auditing the class GitHub issue #6 named: the floor
# T1 shipped is CALLED now, but on a narrower set of rows than T1's own
# Reachability table claimed. `VLOG_DIGEST_RE` requires the acceptance digest, so
# a row that omits the digest and carries ` · ms:3` is seen by neither the floor
# nor the digest-less notice issue #4 bought — it walks through the hole between
# two patterns that were never asked to agree.
#
# NOT a route to a forged `done`: such a row proves nothing, and a task resting on
# it is refused elsewhere for carrying no digest-bearing entry. What it does is sit
# in a log claiming `exit 0` in 3ms against a fence that starts a container, with
# every gate silent. Measured through this CLI before any code was written.
def test_a_digestless_row_cannot_hide_behind_a_duration(bin_dir, lint):
    """The floor and the digest-less notice read every row claiming a machine run."""
    fence = "docker run --rm golang:1 go vet ./..."
    digest = lint.acceptance_digest(lint.normalize_acceptance(fence))
    honest = (f"- 2026-09-01 · abc1234 · exit 0 · `{fence}` · "
              f"acceptance-sha256:{digest} · ms:41250")

    def lint_with(extra_row):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "repo"
            (root / "docs" / "adr" / "ADR-001-probe" / "tasks").mkdir(parents=True)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            record = root / "docs" / "adr" / "ADR-001-probe.md"
            record.write_text(
                "# ADR-001: Probe\n\n"
                "**Status:** Accepted\n"
                "**Spec:** None — no spec stage\n"
                "**Enforced-by:** None — lint fixture only\n"
                "**Served-path change:** None — lint fixture only\n\n"
                "## Alternatives Considered\n\n- Keep the old form.\n\n"
                "## Wiring & Contract Changes\n\nNone — implementation-internal only.\n\n"
                "## Out of Scope\n\n- none (permanent: boundary: fixture)\n",
                encoding="utf-8")
            tasks = root / "docs" / "adr" / "ADR-001-probe" / "tasks"
            (tasks / "README.md").write_text(
                "# ADR-001 Tasks\n\n## Task Index\n\n"
                "| ID | Title | Status | Covers | Acceptance |\n"
                "|----|-------|--------|--------|------------|\n"
                f"| T1 | probe | done | — | `{fence}` |\n", encoding="utf-8")
            task = tasks / "T1-probe.md"
            task.write_text(
                "# Task ADR-001-T1: probe\n\n"
                "**Depends-on:** none\n**Covers:** none\n**Produces:** none\n"
                "**Consumes:** none\n\n## Goal\n\ng\n\n"
                "## Affected Files\n\n| File | Change | Why |\n|---|---|---|\n"
                "| `x.py` | edit | w |\n\n"
                "## Ordered Steps\n\n1. Write the failing test first. [proof: acceptance]\n"
                "2. Then the rest. [proof: acceptance]\n\n"
                f"## Acceptance\n\n```bash\n{fence}\n```\n\n"
                "## Tests\n\n| Test name | File | Verifies | Covers | Steps |\n"
                "|---|---|---|---|---|\n| `t` | `x.py` | v | — | 1, 2 |\n\n"
                "## Invariants\n\n- i\n\n## Risks\n\n- r\n\n"
                "## Stop Condition\n\nstop\n\n## Out of Scope\n\n- none\n\n"
                f"## Verification Log\n{honest}\n", encoding="utf-8")
            subprocess.run(["git", "-C", str(root), "add", "-A"], check=True,
                           capture_output=True)
            subprocess.run(["git", "-C", str(root), "-c", "user.email=t@e",
                            "-c", "user.name=t", "commit", "-qm", "base"], check=True,
                           capture_output=True)
            # Appended AFTER the commit: `known` then holds the file without it,
            # which is what "not already recorded" means to this check.
            if extra_row:
                with task.open("a", encoding="utf-8") as handle:
                    handle.write(extra_row + "\n")
            return subprocess.run(
                [sys.executable, str(Path(bin_dir).resolve() / "adr-lint"), str(record)],
                cwd=root, capture_output=True, text=True).stdout

    forged = f"- 2026-09-03 · deadbee · exit 0 · `{fence}` · ms:3"
    said = lint_with(forged)
    assert "3ms" in said, (
        "a row claiming exit 0 in 3ms against a container fence must be floored "
        f"whether or not it carries a digest: {said}")
    assert "no acceptance-sha256" in said, (
        "and the digest-less notice must see it too — appending ` · ms:N` is not "
        f"a way out of the check GitHub issue #4 bought: {said}")

    # CAPABLE OF CLEAN, on the same fixture: the honest digest row with a duration
    # that fits its fence draws neither finding. Without this the two assertions
    # above pass against a gate that shouts at every corpus.
    quiet = lint_with(None)
    assert "3ms" not in quiet and "no acceptance-sha256" not in quiet, (
        f"an honest log must stay silent: {quiet}")

    # The wider pattern must never match a row the entry grammar rejects, or the
    # notice would speak about something no reader considers an entry at all.
    for row in (forged, honest, f"- 2026-09-03 · no-git · exit 1 · `{fence}`"):
        assert lint.VLOG_TIMED_RE.match(row) and lint.VLOG_RE.match(row), row
    assert not lint.VLOG_TIMED_RE.match(
        "- 2026-09-03 · human-observed · Zy read it end to end"), \
        "a human sign-off claims no machine run and has no duration to floor"


# ADR-021 T1. Every field in an entry is defended — the digest binds a row to the
# fence it proved, the duration is a value the file cannot produce — and all of it
# defends what a row SAYS. Nothing defended the log against a row being taken OUT.
#
# Measured 2026-09-01 through this CLI before any code was written: removing the
# RED exit-1 row, or one of two GREEN rows, produced output identical to the
# baseline. Only removing every row was caught. The RED one is what matters —
# deleting it makes the log imply a red-green cycle that did not happen, which two
# task files in this corpus disclose BY HAND in prose because nothing checked it.
def test_a_committed_evidence_row_that_has_gone_missing_is_reported(bin_dir, lint):
    """check_verification compares the rows HEAD holds against the rows present."""
    fence = "python3 -m pytest tests/"
    digest = lint.acceptance_digest(lint.normalize_acceptance(fence))
    red = f"- 2026-08-30 · aaa1111 · exit 1 · `{fence}` · acceptance-sha256:{digest} · ms:9100"
    green = f"- 2026-08-31 · bbb2222 · exit 0 · `{fence}` · acceptance-sha256:{digest} · ms:9400"

    def lint_after(edit, git=True):
        """Commit a three-row log, apply `edit` to the task text, run the gate."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "repo"
            tasks = root / "docs" / "adr" / "ADR-001-probe" / "tasks"
            tasks.mkdir(parents=True)
            # The Tests table names this file, and a task whose named test cannot
            # exist draws a BLOCKING finding of its own — which would drown the one
            # this test is about and make `[PASS]` unreadable as a channel check.
            (root / "x.py").write_text("def t():\n    assert True\n", encoding="utf-8")
            record = root / "docs" / "adr" / "ADR-001-probe.md"
            record.write_text(
                "# ADR-001: Probe\n\n**Status:** Accepted\n**Spec:** None — no spec stage\n"
                "**Enforced-by:** None — fixture\n**Served-path change:** None — fixture\n\n"
                "## Alternatives Considered\n\n- Keep the old form.\n\n"
                "## Wiring & Contract Changes\n\nNone — implementation-internal only.\n\n"
                "## Out of Scope\n\n- none (permanent: boundary: fixture)\n", encoding="utf-8")
            (tasks / "README.md").write_text(
                "# Tasks\n\n## Task Index\n\n| ID | Title | Status | Covers | Acceptance |\n"
                f"|----|-------|--------|--------|------------|\n| T1 | probe | done | — | `{fence}` |\n",
                encoding="utf-8")
            head = ("# Task ADR-001-T1: probe\n\n**Depends-on:** none\n**Covers:** none\n"
                    "**Produces:** none\n**Consumes:** none\n\n## Goal\n\nPROSE-MARKER\n\n"
                    "## Affected Files\n\n| File | Change | Why |\n|---|---|---|\n| `x.py` | edit | w |\n\n"
                    "## Ordered Steps\n\n1. Write the failing test first. [proof: acceptance]\n\n"
                    f"## Acceptance\n\n```bash\n{fence}\n```\n\n"
                    "## Tests\n\n| Test name | File | Verifies | Covers | Steps |\n|---|---|---|---|---|\n"
                    "| `t` | `x.py` | v | — | 1 |\n\n## Invariants\n\n- i\n\n## Risks\n\n- r\n\n"
                    "## Stop Condition\n\nstop\n\n## Out of Scope\n\n- none\n\n"
                    "## Mutation Log\n- 2026-08-31 · bbb2222 · mutant killed · exit 1 · `x.py` · why · "
                    f"acceptance-sha256:{digest}\n\n## Verification Log\n")
            task = tasks / "T1-probe.md"
            committed = head + red + "\n" + green + "\n"
            task.write_text(committed, encoding="utf-8")
            if git:
                subprocess.run(["git", "init", "-q", str(root)], check=True)
                subprocess.run(["git", "-C", str(root), "add", "-A"], check=True,
                               capture_output=True)
                subprocess.run(["git", "-C", str(root), "-c", "user.email=t@e",
                                "-c", "user.name=t", "commit", "-qm", "base"], check=True,
                               capture_output=True)
            task.write_text(edit(committed), encoding="utf-8")
            return subprocess.run(
                [sys.executable, str(Path(bin_dir).resolve() / "adr-lint"), str(record)],
                cwd=root, capture_output=True, text=True).stdout

    MARK = "no longer in this file"

    # THE FINDING. The red run is removed after it was committed.
    said = lint_after(lambda text: text.replace(red + "\n", ""))
    assert MARK in said and "aaa1111" in said, (
        f"a committed entry that has gone missing must be named: {said}")
    # ADVISORY, never blocking (CLAUDE.md §3): legitimate deletions exist — a log
    # rewritten because its fence changed, a record being retired. The CHANNEL is
    # what is asserted, not the overall exit: a fixture can carry other findings,
    # and reading the summary line would let this pass for the wrong reason.
    reported = [line for line in said.splitlines() if MARK in line]
    assert reported and all(line.strip().startswith("advice:") for line in reported), (
        f"the missing-row report must be advice, never a blocking finding: {reported}")
    assert said.startswith("[PASS]"), f"and nothing else in this fixture blocks: {said}"

    # CAPABLE OF CLEAN, on the same fixture — without this the assertion above
    # passes against a gate that shouts at every corpus.
    quiet = lint_after(lambda text: text)
    assert MARK not in quiet, f"a log nobody touched must draw nothing: {quiet}"

    # SILENCE WHEN GIT COULD NOT ANSWER. `committed_lines` returns None for "I
    # could not look", and a filter that could not look must never report absence
    # (ADR-005). Without a repository every task would otherwise be accused.
    nogit = lint_after(lambda text: text.replace(red + "\n", ""), git=False)
    assert MARK not in nogit, (
        f"no repository means 'I could not look', never 'the row is absent': {nogit}")

    # PROSE MAY CHANGE. `committed_lines` returns EVERY line of the committed
    # file, so an unfiltered comparison would accuse the correction notes this
    # corpus writes routinely. Both sides are filtered through VLOG_RE.
    prose = lint_after(lambda text: text.replace("PROSE-MARKER", "a sentence that was rewritten"))
    assert MARK not in prose, f"only Verification Log rows are compared: {prose}"


# ADR-022 T1. `adr-lint` requires ONE killed mutant bound to a fence's digest
# before a task may be `done`. The obligation is existential and vacuity is
# per-mechanism: a fence chaining three assertions with one bound mutant has been
# shown capable of failing for one reason, and nothing is known about the other
# two. Nothing in a task file enumerates what its fence's claim rests on, so
# nothing — tool or reader — can count what is unproven, and ADR-016 already
# settled that the structure cannot be inferred from arbitrary shell.
#
# `**Rests-on:**` is that enumeration. It is prose, and it is safe as prose for
# one reason only: it records an OBLIGATION, not evidence. Hand-filling it can
# only make the record admit more than it has proved, which is the opposite
# incentive to the hand-filled `## Mutants` table the Verification Log replaced.
def test_a_fence_declaration_is_read_or_reported(bin_dir, lint, repo_root):
    """The `Rests-on:` parser, its two advisories, and silence everywhere else."""
    fence = "python3 -m pytest tests/"

    def lint_with(header):
        """Run the shipped CLI on a one-task fixture carrying `header` verbatim."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "repo"
            tasks = root / "docs" / "adr" / "ADR-001-probe" / "tasks"
            tasks.mkdir(parents=True)
            (root / "x.py").write_text("def t():\n    assert True\n", encoding="utf-8")
            record = root / "docs" / "adr" / "ADR-001-probe.md"
            record.write_text(
                "# ADR-001: Probe\n\n**Status:** Accepted\n**Spec:** None — no spec stage\n"
                "**Enforced-by:** None — fixture\n**Served-path change:** None — fixture\n\n"
                "## Alternatives Considered\n\n- Keep the old form.\n\n"
                "## Wiring & Contract Changes\n\nNone — implementation-internal only.\n\n"
                "## Out of Scope\n\n- none (permanent: boundary: fixture)\n", encoding="utf-8")
            (tasks / "README.md").write_text(
                "# Tasks\n\n## Task Index\n\n| ID | Title | Status | Covers | Acceptance |\n"
                "|----|-------|--------|--------|------------|\n"
                f"| T1 | probe | pending | — | `{fence}` |\n", encoding="utf-8")
            (tasks / "T1-probe.md").write_text(
                "# Task ADR-001-T1: probe\n\n**Depends-on:** none\n**Covers:** none\n"
                "**Produces:** none\n**Consumes:** none\n"
                + (header + "\n" if header is not None else "")
                + "\n## Goal\n\ng\n\n"
                "## Affected Files\n\n| File | Change | Why |\n|---|---|---|\n"
                "| `x.py` | edit | w |\n\n"
                "## Ordered Steps\n\n1. Write the failing test first. [proof: acceptance]\n\n"
                f"## Acceptance\n\n```bash\n{fence}\n```\n\n"
                "## Tests\n\n| Test name | File | Verifies | Covers | Steps |\n"
                "|---|---|---|---|---|\n| `t` | `x.py` | v | — | 1 |\n\n"
                "## Invariants\n\n- i\n\n## Risks\n\n- r\n\n"
                "## Stop Condition\n\nstop\n\n## Out of Scope\n\n- none\n\n"
                "## Mutation Log\n\n## Verification Log\n", encoding="utf-8")
            return subprocess.run(
                [sys.executable, str(Path(bin_dir).resolve() / "adr-lint"), str(record)],
                cwd=root, capture_output=True, text=True).stdout

    UNREADABLE = "could not be read as a declaration"
    TWICE = "more than once"

    # THE FINDING, first arm: a value with no mechanism in it at all.
    for bad in ("**Rests-on:** ", "**Rests-on:** `unclosed", "**Rests-on:** <name>"):
        said = lint_with(bad)
        assert UNREADABLE in said, f"a declaration that cannot be read must be named: {bad!r} -> {said}"

    # THE FINDING, second arm: the same mechanism declared twice. The count is
    # what the coverage reading in T3 divides by, so a repeat makes it wrong.
    said = lint_with("**Rests-on:** `the exit code`, `the exit code`")
    assert TWICE in said and "the exit code" in said, f"a repeated mechanism must be named: {said}"

    # CAPABLE OF CLEAN on the same fixture. Without this, both assertions above
    # pass against a gate that shouts at every task it is given.
    quiet = lint_with("**Rests-on:** `the exit code`, `the printed digest`")
    assert UNREADABLE not in quiet and TWICE not in quiet, (
        f"a well-formed declaration must draw nothing: {quiet}")

    # ADVISORY, never blocking (CLAUDE.md §3). The CHANNEL is asserted line by
    # line, not the summary word, which a fixture's other findings could set.
    said = lint_with("**Rests-on:** `unclosed")
    reported = [ln for ln in said.splitlines() if UNREADABLE in ln]
    assert reported and all(ln.strip().startswith("advice:") for ln in reported), (
        f"the declaration findings are advisory: {reported}")

    # `None` (no header) and `[]` (a header declaring nothing) are DIFFERENT
    # STATES and ADR-005 forbids collapsing them: one is "the author said
    # nothing", the other is "the author said there is nothing". This is the
    # branch S4's silence rests on, and the registered mutant breaks it.
    without = "# Task\n\n**Depends-on:** none\n\n## Goal\n\ng\n"
    assert lint.rests_on(without) is None, "an absent header is not an empty declaration"
    assert lint.rests_on(without + "**Rests-on:** none — one indivisible command\n") == [], \
        "an explicit `none` declares nothing, which is not the same as declaring nothing readable"
    assert lint.rests_on(without + "**Rests-on:** `a`, `b`\n") == ["a", "b"]
    assert lint.rests_on(without + "**Rests-on:** `unclosed\n") is lint.RESTS_ON_UNREADABLE, \
        "and a value the parser could not read is a third answer, not either of the first two"

    # SILENCE ACROSS THE CORPUS AS IT STANDS. A new advisory that fires on an
    # unmodified tree is the defect BACKLOG §59 records. Resolved through
    # `git ls-files` rather than the filesystem (CLAUDE.md §8), and the count is
    # asserted in the same breath — a glob that matched nothing would otherwise
    # report "I could not look" as "the corpus is clean" (ADR-005).
    listed = subprocess.run(
        ["git", "-C", str(repo_root), "ls-files", "docs/adr/*/tasks/*.md"],
        capture_output=True, text=True)
    corpus = [Path(repo_root) / p for p in listed.stdout.split("\n") if p.strip()]
    assert len(corpus) >= 20, f"the silence claim needs a corpus to be silent about: {len(corpus)}"
    carried = [p.name for p in corpus
               if lint.rests_on(p.read_text(encoding="utf-8", errors="replace")) is not None]
    assert not carried, f"no task in this corpus declares Rests-on yet: {carried}"

    print("PASS — a fence declaration is read, or reported as unreadable")


# ADR-022 T2. One rule, two implementations — the shape that has already
# disagreed three times in this repository (ENFORCEMENT_GRAMMAR's comment says
# where). `adr-verify` must refuse an undeclared mechanism BEFORE it arms the
# journal, so it has to read `Rests-on:` itself; the writer and the reader are
# then held to this one table rather than to each other's good intentions.
RESTS_ON_GRAMMAR = [
    ("", None),
    ("**Rests-on:** `a`, `b`", ["a", "b"]),
    ("**Rests-on:** `a label, with a comma`", ["a label, with a comma"]),
    ("**Rests-on:** `one`, two", ["one", "two"]),
    ("**Rests-on:** none — one indivisible command", []),
    ("**Rests-on:** nonetheless-a-mechanism", ["nonetheless-a-mechanism"]),
    ("**Rests-on:** ", "UNREADABLE"),
    ("**Rests-on:** `unclosed", "UNREADABLE"),
    ("**Rests-on:** <the mechanism>", "UNREADABLE"),
]


def test_the_rests_on_grammar_has_one_meaning(lint, verify):
    """Both parsers of `Rests-on:` answer the shared table identically."""
    head = "# Task\n\n**Depends-on:** none\n\n"
    for header, want in RESTS_ON_GRAMMAR:
        text = head + (header + "\n" if header else "") + "\n## Goal\n\ng\n"
        for module in (lint, verify):
            got = module.rests_on(text)
            if want == "UNREADABLE":
                assert got is module.RESTS_ON_UNREADABLE, (module.__name__, header, got)
            else:
                assert got == want and (got is None) == (want is None), \
                    (module.__name__, header, got, want)
    print("PASS — the Rests-on grammar has one meaning in both gates")


# ADR-022 T2. `--covers` records WHICH declared mechanism a killed mutant bound.
# The refusal of an undeclared name has to land in the option-validation phase,
# before the journal is armed and before either fence runs: ADR-016 put
# transaction preflight ahead of the first fence because a refusal after the
# mutation has been applied is a refusal that has already changed the tree.
def test_covers_binds_a_killed_mutant_to_a_declared_mechanism(bin_dir, lint, verify, repo_root):
    """The option, its pre-flight refusal, the row suffix, and its optionality."""
    fence = ("python3 -c \"import pathlib,sys; "
             "sys.exit(1 if 'MUTATED' in pathlib.Path('x.py').read_text() else 0)\"")

    def fixture(tmp, declaration):
        root = Path(tmp) / "repo"
        tasks = root / "docs" / "adr" / "ADR-001-probe" / "tasks"
        tasks.mkdir(parents=True)
        (root / "x.py").write_text("OK = 1\n", encoding="utf-8")
        task = tasks / "T1-probe.md"
        task.write_text(
            "# Task ADR-001-T1: probe\n\n**Depends-on:** none\n**Covers:** none\n"
            "**Produces:** none\n**Consumes:** none\n"
            + (declaration + "\n" if declaration else "")
            + "\n## Goal\n\ng\n\n"
            "## Affected Files\n\n| File | Change | Why |\n|---|---|---|\n"
            "| `x.py` | edit | w |\n\n"
            "## Ordered Steps\n\n1. Write the failing test first. [proof: acceptance]\n\n"
            f"## Acceptance\n\n```bash\n{fence}\n```\n\n"
            "## Tests\n\n| Test name | File | Verifies | Covers | Steps |\n"
            "|---|---|---|---|---|\n| `t` | `x.py` | v | — | 1 |\n\n"
            "## Invariants\n\n- i\n\n## Risks\n\n- r\n\n"
            "## Stop Condition\n\nstop\n\n## Out of Scope\n\n- none\n\n"
            "## Mutation Log\n\n## Verification Log\n", encoding="utf-8")
        return root, task

    def mutate(declaration, covers):
        """Run `adr-verify --mutant` on a fresh fixture; return (result, root, task)."""
        tmp = tempfile.mkdtemp()
        root, task = fixture(tmp, declaration)
        argv = [sys.executable, str(Path(bin_dir).resolve() / "adr-verify"), str(task),
                "--cwd", str(root),
                "--mutant", "x.py", "--from", "OK = 1", "--to", "MUTATED = 1",
                "--why", "the fence stops reading the file"]
        if covers is not None:
            argv += ["--covers", covers]
        result = subprocess.run(argv, cwd=root, capture_output=True, text=True)
        return result, root, task

    DECLARED = "**Rests-on:** `the fence reads x.py`, `the exit code`"

    # THE REFUSAL. A name the task did not declare is not a name this tool may
    # invent — the whole argument for a hand-written declaration is that it can
    # only INCREASE what a record admits is unproven, and a mechanism the author
    # never wrote would enter the coverage reading as if they had.
    bad, root, task = mutate(DECLARED, "a mechanism nobody declared")
    assert bad.returncode == 2, (bad.returncode, bad.stdout, bad.stderr)
    assert "covers" in (bad.stdout + bad.stderr).lower(), (bad.stdout, bad.stderr)
    # AND THE TREE IS UNCHANGED. This is the assertion S6's mutant is aimed at:
    # a refusal that fires after the mutation has landed is not a pre-flight.
    assert (root / "x.py").read_text(encoding="utf-8") == "OK = 1\n", \
        "the refusal must happen before the mutation is applied"
    assert "mutant" not in task.read_text(encoding="utf-8").split("## Mutation Log")[1], \
        "and before any row is written"
    journals = list(root.rglob("*.adr-verify-*")) + list(root.rglob("*journal*"))
    assert not journals, f"and before the journal is armed: {journals}"

    # THE RECORD. A declared name reaches the row, as a suffix on the grammar
    # that was already there rather than as a second grammar.
    good, _, task = mutate(DECLARED, "the exit code")
    assert good.returncode == 0, (good.returncode, good.stdout, good.stderr)
    rows = [ln for ln in task.read_text(encoding="utf-8").splitlines()
            if ln.startswith("- ") and "mutant killed" in ln]
    assert len(rows) == 1, rows
    assert rows[0].endswith(" · covers:the exit code"), rows[0]
    # The readers must accept what the writer just wrote. Four patterns describe
    # this row across three gates, and the one time they drifted the writer
    # refused to write what the readers already accepted.
    assert lint.MLOG_RE.match(rows[0]), f"adr-lint must parse the row: {rows[0]}"
    bound = lint.MLOG_DIGEST_RE.match(rows[0])
    assert bound and bound.group("covers") == "the exit code", (
        f"and the digest reader must still bind it, with the mechanism readable: {rows[0]}")

    # OPTIONAL, byte for byte. A `--mutant` run with no `--covers` writes the row
    # it writes today; anything else is a silent migration of the whole corpus.
    plain, _, task = mutate(DECLARED, None)
    assert plain.returncode == 0, (plain.stdout, plain.stderr)
    unsuffixed = [ln for ln in task.read_text(encoding="utf-8").splitlines()
                  if ln.startswith("- ") and "mutant killed" in ln]
    assert len(unsuffixed) == 1 and "covers:" not in unsuffixed[0], unsuffixed
    assert lint.MLOG_RE.match(unsuffixed[0]) and lint.MLOG_DIGEST_RE.match(unsuffixed[0])

    # A task with NO declaration cannot use the option at all: there is nothing
    # for the name to be checked against, and accepting it would make `--covers`
    # a free-text field on exactly the tasks that declared nothing.
    nodecl, _, _ = mutate(None, "the exit code")
    assert nodecl.returncode == 2, (nodecl.returncode, nodecl.stdout, nodecl.stderr)

    # EVERY ROW ALREADY RECORDED IN THIS CORPUS STILL PARSES. A grammar change
    # that orphans recorded evidence is the one thing this suffix may never do,
    # and the count is asserted so a glob that matched nothing cannot report
    # "I could not look" as "every row parses" (ADR-005).
    listed = subprocess.run(
        ["git", "-C", str(repo_root), "ls-files", "docs/adr/*/tasks/*.md"],
        capture_output=True, text=True)
    recorded = []
    for rel in [p for p in listed.stdout.split("\n") if p.strip()]:
        body = (Path(repo_root) / rel).read_text(encoding="utf-8", errors="replace")
        if "## Mutation Log" not in body:
            continue
        section = body.split("## Mutation Log", 1)[1].split("\n## ", 1)[0]
        recorded += [ln for ln in section.splitlines() if ln.startswith("- ")]
    assert len(recorded) >= 10, f"the parse claim needs rows to be about: {len(recorded)}"
    orphaned = [r for r in recorded if not lint.MLOG_RE.match(r)]
    assert not orphaned, f"the widened grammar orphans no recorded row: {orphaned}"

    print("PASS — covers binds a killed mutant to a declared mechanism")


if __name__ == "__main__":
    main()
