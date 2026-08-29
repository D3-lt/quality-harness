#!/usr/bin/env python3
"""Focused false-green controls for the quality-harness ADR gates."""

import importlib.machinery
import importlib.util
import contextlib
import io
import io
import subprocess
import sys
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

    acceptance = "printf first\nprintf second"
    digest = verify.acceptance_digest(verify.normalize_acceptance(acceptance))
    assert digest == lint.acceptance_digest(lint.normalize_acceptance(acceptance))
    # Three-way, not two: adr-next decides what is DONE from the same digest, so a
    # third implementation drifting would make it call verified tasks unverified
    # and hand a session work that is already finished.
    nxt = load_script("adr_next_regressions", bin_dir / "adr-next")
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

    assert dispositions("- Renaming it (permanent: the `archive()` helper keeps originals)") == [], (
        "a nested paren inside a disposition is still a disposition")
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

    assert status_advice("partial"), "an unrecognised status must say the checks did not run"
    # The must-fail direction (CLAUDE.md §4): the statuses this reader DOES act on
    # must stay silent, or the advice fires on every task and means nothing.
    for known in ("done", "pending", "blocked", "DONE"):
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
    dressed_advice = status_advice("**partial** — two of thirteen steps")
    assert dressed_advice, "emphasis is not an exemption"
    # The message names the WORD it acted on as well as the cell it read. Quoting
    # only the cell reads as though that whole string was treated as the status,
    # which invites the conclusion that the parser is naive in exactly the way it
    # is not (docs/BACKLOG.md §75).
    assert "`partial` (from" in dressed_advice[0], dressed_advice
    # And when the cell IS the word, it is not repeated back twice.
    assert "(from" not in status_advice("partial")[0], status_advice("partial")

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
        "| T11 | partial one | **partial** — two of thirteen | F-2 | something |\n"
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
        two_tables.replace("**done** (2026-07-20)", "**partial** — two of thirteen"), errs)
    assert [a for a in errs.advice if "does not act on" in a], \
        "the status table must still be read when a second table follows it"
    # And a task the reader has no file for is not reported: the status belongs
    # to a row this corpus cannot resolve, which is a different finding.
    errs = lint.Findings()
    lint.check_task_status_vocabulary({}, readme.format("partial"), errs)
    assert not [a for a in errs.advice if "does not act on" in a], errs.advice

    postmortem = Path(sys.argv[2]).read_text().lower()
    assert "any severity" not in postmortem and "after any bug" not in postmortem
    assert all(term in postmortem for term in ("material", "recurrent", "production", "reusable"))
    print("PASS — acceptance digests, mutation consistency, test definitions, "
          "adr-lint DAG/contract/verification/filter engines, postmortem scope")


if __name__ == "__main__":
    main()
