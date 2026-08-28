#!/usr/bin/env python3
"""Focused false-green controls for the quality-harness ADR gates."""

import importlib.machinery
import importlib.util
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
    for escape in ("..\\skills\\adr-write\\SKILL.md", "../skills/adr-write/SKILL.md",
                   "C:\\Windows\\System32\\cmd.exe", "C:/Windows/System32/cmd.exe"):
        assert lint.resolve_enforcement(escape, root) is None, (
            f"a pointer leaving the tree must resolve as nothing: {escape}")
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

    postmortem = Path(sys.argv[2]).read_text().lower()
    assert "any severity" not in postmortem and "after any bug" not in postmortem
    assert all(term in postmortem for term in ("material", "recurrent", "production", "reusable"))
    print("PASS — acceptance digests, mutation consistency, test definitions, "
          "adr-lint DAG/contract/verification/filter engines, postmortem scope")


if __name__ == "__main__":
    main()
