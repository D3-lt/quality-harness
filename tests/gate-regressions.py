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


def verification_errors(lint, acceptance, entries):
    infos = {
        "T1": {
            "human": False,
            "vlog": entries,
            "acc_all": acceptance,
            "acc_first": acceptance.splitlines()[0],
        }
    }
    errors = []
    lint.check_verification(infos, "| T1 | probe | done |", errors)
    return errors


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: gate-regressions.py <payload-bin> <postmortem-skill>")
    bin_dir = Path(sys.argv[1])
    lint = load_script("adr_lint_regressions", bin_dir / "adr-lint")
    verify = load_script("adr_verify_regressions", bin_dir / "adr-verify")
    spec_gate = load_script("spec_verify_regressions", bin_dir / "spec-verify")
    arch_gate = load_script("arch_lint_regressions", bin_dir / "arch-lint")
    retire = load_script("adr_retire_regressions", bin_dir / "adr-retire-check")

    acceptance = "printf first\nprintf second"
    digest = verify.acceptance_digest(verify.normalize_acceptance(acceptance))
    assert digest == lint.acceptance_digest(lint.normalize_acceptance(acceptance))
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

    postmortem = Path(sys.argv[2]).read_text().lower()
    assert "any severity" not in postmortem and "after any bug" not in postmortem
    assert all(term in postmortem for term in ("material", "recurrent", "production", "reusable"))
    print("PASS — acceptance digests, mutation consistency, test definitions, postmortem scope")


if __name__ == "__main__":
    main()
