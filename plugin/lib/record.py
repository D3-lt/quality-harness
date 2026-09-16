#!/usr/bin/env python3
"""The record grammar: how a gate finds a `## ` section, which fence under
`## Acceptance` is the runnable one, how that fence is normalized, and how it is
hashed. One definition, loaded by every gate that reads records.

Shared since 2026-09-11 (ADR-045). Until then these functions were COPIED into
the gates — `sections_of` five times, `normalize_acceptance` three times,
`acceptance_digest` twice — and one copy had drifted: `adr-next` carried a
`sections` with no code-fence toggle, so a task whose Acceptance fence held a
line beginning `## ` read as two sections there and one everywhere else. Its
digest then differed from the one `adr-verify` wrote, and a verified task read as
unverified with nothing said.

The fence OPENER was the same class one step further in (ADR-045 T3): three
regexes in three gates — `bash|sh|shell` in adr-verify, `bash` in adr-lint's
digest path, a bare ```bash\\n in adr-next — so a task written with ```sh was run
and recorded by the writer, then never digest-checked by the verifier, whose
narrower opener found no fence and skipped the check in silence. `acceptance_fence`
is that opener, once — and since T10 it is a view of the same fence grammar the
section walk uses, not a second regex over the same characters.

ADR-011 rejected "one shared grammar module" because a file under `plugin/bin/`
grows a standalone forwarder and is read as a gate by the package tests.
`plugin/lib/fence.py` (2026-09-06) is the idiom that avoids both: `lib/` is not
`bin/`, the forwarders leave it at the plugin root, and each gate resolves it from
`os.path.realpath(__file__)` — never from `PATH` or cwd, so a forwarder run reads
the grammar of the install it forwards to. This file is loaded the same way.

Why the bodies are exactly adr-lint's: `adr-lint` refuses a `done` row whose
`acceptance-sha256:` does not match its own digest of the fence, `adr-verify`
writes that digest, and `adr-next` decides DONE by it (ADR-010, ADR-020). The
bytes `normalize_acceptance` returns are unchanged from every copy, so no
existing evidence row changes meaning.
"""
import ast
import base64
import hashlib
import json
import re
from pathlib import Path

__all__ = [
    "sections_of",
    "section_span",
    "repeated_headings",
    "unterminated_fence",
    "fence_safe",
    "acceptance_fence",
    "first_fence_line",
    "normalize_acceptance",
    "acceptance_digest",
    "split_lines",
    "TEST_HASH_REQUIRED_FROM",
    "TEST_LOCK_FIELD",
    "TEST_LOCK_FIELD_ANON",
    "tests_table_rows",
    "vlog_has_test_lock",
    "vlog_has_red",
    "first_red_lock_suffix",
    "lock_suffix_for_run",
    "lock_snapshot_suffix",
    "moved_lock_bodies",
    "lock_findings",
    "lock_blocks_done",
    "vlog_row_is_lock_snapshot",
    "body_digest",
    "declared_check",
]


_HEADING = re.compile(r"^## (.+?)\s*$")

# THE ONE FENCE GRAMMAR (ADR-045 T10). A fence line is a run of three or more
# backticks or tildes at the start of a line, after any leading blanks — the
# blanks because adr-verify's excerpts are two spaces in and the walk has read
# them as fences since it existed. CommonMark's two markers, both. What follows
# the marker is the info string on an opener and must be blank on a closer; a
# fence closes only on the SAME marker character at AT LEAST the opening length,
# so an inner ```bash inside a ```` fence is text, not a fence, and a ~~~ never
# closes a ```. A backtick opener whose info string contains a backtick is not
# an opener (CommonMark: that line is inline code).
#
# Until T10 there were two grammars for the same three characters: the section
# walk toggled on any line whose first non-blank characters were ```, and the
# runnable opener was an UNANCHORED regex over the section text, so `prose ```bash`
# was runnable, a ````bash opener matched from its second backtick, an inner
# ```bash inside a four-backtick fence ran, and a ``` inside the command ended the
# body mid-line (measured 2026-09-11: `echo '```'` ran as `echo '`). One grammar
# now, and every view below — headings, spans, repeats, the open fence, the
# runnable body, the line a writer must neutralise — is a view of it.
_FENCE = re.compile(r"^(?P<indent>[ \t]*)(?P<marker>`{3,}|~{3,})(?P<rest>.*)$")

# The runnable fence under `## Acceptance`, whatever the author spelled the
# language: `bash`, `sh` or `shell`, optional trailing whitespace, and nothing
# else on the opener line. `sh` and `shell` are reasonable things to type and the
# fence runs through bash either way; refusing them bought nothing and cost a
# reader a minute of guessing (docs/BACKLOG.md §70). `bash` stays first because
# it is what the template says. Backticks only: a ~~~bash fence is a fence to the
# walk and never runnable, and adr-lint names it. Exactly these bytes, so a
# label with an attribute (```bash title=x) or a capital (```BASH) is not
# runnable and is reported rather than run.
_RUNNABLE_INFO = re.compile(r"(?:bash|sh|shell)[ \t]*$")


def _fence_opened(line):
    """`(marker_char, length)` if `line` opens a fence, else None."""
    m = _FENCE.match(line)
    if not m:
        return None
    marker, rest = m.group("marker"), m.group("rest")
    if marker[0] == "`" and "`" in rest:
        return None
    return marker[0], len(marker)


def _fence_closes(line, opened):
    """Whether `line` closes a fence opened with `opened` = `(marker_char, length)`.

    The closer rest is ASCII space and tab only — the same bytes `_RUNNABLE_INFO`
    allows after a language label. `.strip()` also treats NEL, NBSP and the
    other Unicode whitespace as nothing, so a raw NEL after ``` closed a fence
    that T11 says is still one line (ADR-045 T12).
    """
    m = _FENCE.match(line)
    return (m is not None and m.group("marker")[0] == opened[0]
            and len(m.group("marker")) >= opened[1] and re.fullmatch(r"[ \t]*", m.group("rest")))


def _sections(text):
    """Every `## ` section of `text` in document order, fence-aware.

    Each item is `(heading, lines, start, body_start, end)`: the heading text,
    the section's lines without their line breaks, the offset of the heading
    line's first character, the offset just past its line break, and the offset
    of the next unfenced `## ` line (or `len(text)`). Offsets index the ORIGINAL
    text, so a writer can splice by them; lines are what a reader compares.

    THE ONE WALK. `sections_of`, `section_span` and `repeated_headings` are views
    of this list, so a reader that finds a section and a writer that rewrites it
    cannot disagree about where it is — adr-verify's entry writer used its own
    regex until ADR-045 T6, and a `## ` line inside a fenced output excerpt ended
    its section early (docs/BACKLOG.md §197).

    A line that opens a fence (`_FENCE`: three or more ``` or ~~~ after any
    leading blanks) starts one, and only a closer of the same marker at least as
    long ends it; a `## ` line inside is text, not a heading — an Acceptance fence
    that writes a task file through a heredoc, or a bash comment beginning `## `,
    is the case. `## ` needs the single space every gate has always required. A
    fence still open at the end of the text is reported by `unterminated_fence`,
    never closed here.

    Lines are split by `split_lines`: `\\r\\n`, `\\r` and `\\n` end a line and
    NOTHING ELSE does. Until ADR-045 T11 this was `str.splitlines()`, which also
    breaks on VT, FF, FS, GS, RS, NEL, LS and PS — so a heading holding one of
    them read as two lines, one of which could be a second heading (a repeated-
    heading block manufactured from one line), and a command holding one was
    hashed with that byte turned into `\\n`, which is not "otherwise preserved".
    """
    return _scan(text)[0]


# The only line breaks this grammar knows. Markdown's are these three; Python's
# `str.splitlines()` adds eight more (VT, FF, FS, GS, RS, NEL, LS, PS) that no
# editor shows as a line break and no gate wants to treat as one (ADR-045 T11).
_LINE_BREAK = re.compile(r"\r\n|\r|\n")


def split_lines(text):
    """`(line, start, end)` for every line of `text`: the line without its break,
    the offset of its first character, and the offset just past its break (or
    `len(text)` for an unterminated last line). Empty text yields nothing; a text
    ending in a break yields no empty line after it — the same lines
    `str.splitlines()` gives for CR/LF input, and only those."""
    pos = 0
    for m in _LINE_BREAK.finditer(text):
        yield text[pos:m.start()], pos, m.end()
        pos = m.end()
    if pos < len(text):
        yield text[pos:], pos, len(text)


def _scan(text):
    """The one walk: `(sections, open_fence)`.

    `sections` is what `_sections` documents. `open_fence` is None when every
    fence closed, else `(line_number, opener_line)` for the fence still open at
    the end of the text — the 1-based line and its text, for a gate that wants to
    name it. Callers do not resolve an open fence: every heading after it is
    text, and a reader that guessed where it should have closed would be reading
    a record that does not exist (ADR-045 T8).
    """
    out, cur, fence, lineno = [], None, None, 0
    for line, start, pos in split_lines(text):
        lineno += 1
        if fence is None:
            opened = _fence_opened(line)
            if opened:
                fence = (lineno, line, opened)
        elif _fence_closes(line, fence[2]):
            fence = None
        m = None if fence is not None else _HEADING.match(line)
        if m:
            if cur is not None:
                cur[4] = start
                out.append(tuple(cur))
            cur = [m.group(1), [], start, pos, None]
        elif cur is not None:
            cur[1].append(line)
    if cur is not None:
        cur[4] = len(text)
        out.append(tuple(cur))
    return out, fence


def unterminated_fence(text):
    """`(line_number, opener_line)` of a code fence that never closes, or None.

    A fence open at the end of a record hides every heading after it — the
    Acceptance a gate would run, the Verification Log it would write into — and
    the walk cannot tell that from a record that ends inside a long example. So
    it is reported, never resolved: adr-lint names the line, adr-verify refuses
    to run or write against the file (ADR-045 T8). The same walk as
    `sections_of`, so the fence this names is the fence that hid the headings.
    """
    open_fence = _scan(text)[1]
    return None if open_fence is None else open_fence[:2]


def fence_safe(line):
    """`line` spelled so it can never open or close a fence.

    A line whose first non-blank characters are a fence marker gets a backslash
    before them: `  ```` becomes `  \\````, which Markdown renders as the literal
    characters and this grammar reads as text. For a WRITER that quotes text it
    did not author — adr-verify's excerpt of a failed run's last lines — so the
    quoted output can never toggle the grammar of the record it is written into.
    Measured 2026-09-11: a bound test that printed one ``` line put three fence
    lines into the log; the walk went out of phase, `## Mutation Log` became text,
    and the next entry landed under it with exit 0 (ADR-045 T8).
    """
    m = _FENCE.match(line)
    if not m:
        return line
    return line[:m.end("indent")] + "\\" + line[m.end("indent"):]


def _as_lines(section):
    return section if isinstance(section, list) else [ln for ln, _s, _e in split_lines(section)]


def acceptance_fence(section):
    """The body of the runnable fence in an Acceptance section, or None.

    `section` is the section's text or its lines (what `sections_of` returns).
    The first fence whose opener is backticks labelled `bash`, `sh` or `shell`
    (`_RUNNABLE_INFO`) is the runnable one; its body is every line up to the
    closer that matches it, joined with `\\n`, and `normalize_acceptance` trims the
    blank edges before the digest is taken. Any other fence before it is walked
    OVER, closer to closer, so a ```text example that shows a ```bash line does
    not run, and a fence that never closes has no body (None — the walk reports
    the open fence separately, `unterminated_fence`). The writer (adr-verify),
    the verifier (adr-lint) and the reader (adr-next) find the fence here and
    nowhere else (ADR-045 T3, T10).
    """
    opened, body = None, None
    for line in _as_lines(section):
        if opened is None:
            opened = _fence_opened(line)
            if opened and opened[0] == "`" and _RUNNABLE_INFO.fullmatch(_FENCE.match(line).group("rest")):
                body = []
        elif _fence_closes(line, opened):
            if body is not None:
                return "\n".join(body)
            opened = None
        elif body is not None:
            body.append(line)
    return None


def first_fence_line(section):
    """The first line of `section` that begins a fence, trimmed, or None.

    For a gate that has to SAY what it found when `acceptance_fence` found
    nothing runnable: ```bash title=x, ~~~bash, ```BASH — the whole line, so the
    part that was rejected is the part the author is shown (ADR-045 T9, T10).
    """
    for line in _as_lines(section):
        if _FENCE.match(line):
            return line.strip(" \t")
    return None


def sections_of(text):
    """`## ` sections of a Markdown record: heading → its lines, fence-aware.

    A repeated heading yields the LAST occurrence — the same one `section_span`
    returns, so the two readers cannot select different bodies. A duplicate is
    an authoring defect adr-lint reports (`repeated_headings`) rather than a
    shape this reader resolves; last-wins is documented so that until it is
    fixed every gate at least reads the same body. See `_sections` for the walk
    and what it does to line separators.
    """
    return {heading: lines for heading, lines, _s, _b, _e in _sections(text)}


def section_span(text, heading):
    """`(start, body_start, end)` offsets of `## heading` in `text`, or None.

    `start` is the heading line's first character, `body_start` the character
    after its line break, `end` the start of the next unfenced `## ` line or
    `len(text)`. For a writer that must put an entry INTO a section: the same
    fence-aware walk as `sections_of`, the same last-wins on a repeated heading,
    so what it rewrites is what every reader reads.
    """
    span = None
    for name, _lines, start, body_start, end in _sections(text):
        if name == heading:
            span = (start, body_start, end)
    return span


def repeated_headings(text):
    """`## ` headings that appear more than once, in first-seen order.

    A record with two `## Acceptance` sections has two candidate fences and one
    digest; `sections_of` picks the last, and so would every gate — identically,
    but arbitrarily. This names the ambiguity so a gate can report it instead of
    resolving it in silence (ADR-045 T5).
    """
    seen, dup = set(), []
    for heading, _lines, _s, _b, _e in _sections(text):
        if heading in seen and heading not in dup:
            dup.append(heading)
        seen.add(heading)
    return dup


def normalize_acceptance(raw):
    """Canonical Acceptance text — the bytes the digest is taken over.

    CR and CRLF become LF, and only the blank lines adjacent to the Markdown fence
    are removed. Shell-significant indentation, internal blank lines and every
    other byte stay intact — including VT, FF, FS, GS, RS, NEL, LS and PS, which
    are not line breaks to this grammar (`split_lines`, ADR-045 T11) and reach
    the digest as the bytes they are. The writer (`adr-verify`), the verifier
    (`adr-lint`) and the reader (`adr-next`) hash exactly these bytes.
    """
    lines = raw.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    start, end = 0, len(lines)
    while start < end and not lines[start].strip():
        start += 1
    while end > start and not lines[end - 1].strip():
        end -= 1
    return "\n".join(lines[start:end])


def acceptance_digest(command):
    """SHA-256 of the complete normalized Acceptance fence."""
    return hashlib.sha256(command.encode("utf-8")).hexdigest()

# First-red test-body lock (ADR-050). One hasher, one parse, three callers.
# The calendar day is the day AFTER this repository's own 2026-09-12 evidence
# rows: a same-day cutover would refuse those rows, and F-1 forbids a later red
# from filling hashes the first red omitted.
TEST_HASH_REQUIRED_FROM = "2026-09-13"
TEST_LOCK_FIELD = (
    r"(?: · test-lock-sha256:(?P<test_lock>[0-9a-f]{64}))?"
    r"(?: · test-lock-b64:(?P<test_lock_b64>[A-Za-z0-9_-]+))?"
    r"(?: · test-lock-kind:(?P<test_lock_kind>relock|replace))?"
)
TEST_LOCK_FIELD_ANON = (
    r"(?: · test-lock-sha256:[0-9a-f]{64})?"
    r"(?: · test-lock-b64:[A-Za-z0-9_-]+)?"
    r"(?: · test-lock-kind:(?:relock|replace))?"
)
_LOCK_SHA = re.compile(r"test-lock-sha256:([0-9a-f]{64})")
_LOCK_B64 = re.compile(r"test-lock-b64:([A-Za-z0-9_-]+)")
_MACHINE = re.compile(
    r"^- (?P<date>\d{4}-\d{2}-\d{2}) · (?:[0-9a-f]{4,64}\*?|no-git) · "
    r"exit (?P<exit>\d+) · `"
)
# Retired quote-kind classes (`[^'\n]+`). Live walk is `_iter_bdd_calls`.
# A leftover HAND_MUTANT restores finditer on this regex.
_BDD_NAME = re.compile(
    r"""(?:\b(?:it|test)\s*\()\s*(?:'([^'\n]+)'|"([^"\n]+)"|`([^`\n]+)`)\s*,"""
)
_BDD_CALL_HEAD = re.compile(r"\b(?:it|test)\s*\(")
# adr-lint `_go_direct_test_definitions` plus go/testing isTest: Test + not-lowercase.
# `Fuzz` beside `Test`: a fuzz target is ordinary Go testing (`go test` runs its
# seed corpus) and rewriting its body is the same risk the lock exists for. A
# fuzz target is package-level and takes no receiver, so the method matcher
# and t.Run stay as they are. memory-runtime measured FuzzBeta invisible, 2026-09-13.
_GO_FUNC_TEST = re.compile(
    r"(?m)^[ \t]*func[ \t]+((?:Test|Fuzz)(?:[^a-z]\w*)?)[ \t]*\("
)
# spec-verify test_definition_exists: PHPUnit class method test* / Rust #[test] fn.
_PHP_FUNC_TEST = re.compile(r"\bfunction\s+&?\s*(test\w*)\s*\(", re.I)
_PHP_CLASS_OPEN = re.compile(r"\bclass\s+\w+[^;{]*\{")
_RUST_TEST_FN = re.compile(
    r"#\s*\[\s*(?:\w+::)*test(?:\s*\([^]]*\))?\s*\]"
    r"(?:\s*#\s*\[[^]]+\])*\s*(?:pub(?:\([^)]*\))?\s+)?"
    r"(?:async\s+)?fn\s+(\w+)\s*\(",
    re.S,
)
# spec-verify: PHP 8 #[Test] / PHPUnit\\Framework\\Attributes\\Test, then function.
_PHP_ATTR_TEST = re.compile(
    r"#\s*\[\s*(?:\\?PHPUnit\\Framework\\Attributes\\)?Test\s*\]"
    r"[^{;}]{0,300}\bfunction\s+&?\s*(\w+)\s*\(",
    re.S,
)
# PHPUnit 8.5 @test annotation lives in a comment; the masker blanks it.
_PHP_DOCBLOCK_TEST = re.compile(
    r"@test\b.*?\*/\s*(?:(?:public|protected|private|static|final|abstract)\s+)*"
    r"function\s+&?\s*(\w+)\s*\(",
    re.I | re.S,
)
# Same isTest name as package-level, with a receiver.
_GO_METHOD_TEST = re.compile(
    r"(?m)^[ \t]*func[ \t]+\([^)]+\)[ \t]+(Test(?:[^a-z]\w*)?)[ \t]*\("
)
# adr-lint test_body: t.Run("name",
_GO_T_RUN = re.compile(
    r"""\bt\.Run\s*\(\s*(['"`])([^'"`\n]+)\1\s*,""",
)
# spec-verify: function test_* or test_*() { at line start.
_SH_TEST_FN = re.compile(
    r"(?m)^[ \t]*(?:function[ \t]+(test\w*)(?:\s*\(\s*\))?|"
    r"(test\w*)\s*\(\s*\))\s*\{",
)
CONFIG_NAME = ".quality-harness.json"
# Swift Testing `@Test` (any arguments) / XCTest `func test*()` with no
# parameters. Matched on the masked text, so a commented-out or quoted
# declaration is not a test.
_SWIFT_TEST_ATTR = re.compile(
    r"@[ \t]*(?:`?Testing`?[ \t\r\n]*\.[ \t\r\n]*)?`?Test`?(?![\w`])")
_SWIFT_MODIFIER = re.compile(
    r"(?:public|package|internal|private|fileprivate|open|static|class|final|"
    r"nonisolated|override|mutating|dynamic|required)\b"
)
_SWIFT_XCTEST_FN = re.compile(
    r"(?<![\w`.])(?:(?:@\w+(?:\([^)\n]*\))?|public|package|internal|private|"
    r"fileprivate|open|final|nonisolated|override)\s+)*"
    r"func\s+(`?)(test\w*)\1\s*(\()\s*\)"
)
_SWIFT_LITERAL_OPEN = re.compile(r'(#*)("""|")')
_SWIFT_REGEX_OPEN = re.compile(r"(#+)/")


def tests_table_rows(text):
    """(name, file) pairs from the Tests table, or an empty list."""
    rows = []
    for line in sections_of(text).get("Tests", []):
        stripped = line.strip()
        if not stripped.startswith("|"):
            continue
        cells = [c.strip() for c in stripped.strip("|").split("|")]
        if len(cells) < 2 or cells[0].lower().startswith("test name"):
            continue
        if cells and set(cells[0]) <= set("-: "):
            continue
        def untick(cell):
            m = re.search(r"`([^`]+)`", cell)
            return (m.group(1) if m else cell).strip()
        name, rel = untick(cells[0]), untick(cells[1])
        if name and rel and name not in ("—", "-"):
            rows.append((name, rel.replace("\\", "/")))
    return rows


def vlog_has_test_lock(text):
    """Whether any Verification Log machine row already carries a trailing lock."""
    return any(_row_lock_sha(line)
               for line, _m in _vlog_machine_rows(
                   sections_of(text).get("Verification Log", [])))


def vlog_has_red(text):
    """Whether any Verification Log machine row has a non-zero exit."""
    return any(m.group("exit") != "0"
               for _line, m in _vlog_machine_rows(
                   sections_of(text).get("Verification Log", [])))


def declared_check(root):
    """Trimmed `check` string, None when absent/ignored, or 'unproven'."""
    if root is None:
        return "unproven"
    path = Path(root) / CONFIG_NAME
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except OSError:
        return "unproven"
    except (json.JSONDecodeError, UnicodeError, TypeError, ValueError):
        return "unproven"
    if not isinstance(data, dict):
        return None
    check = data.get("check")
    if isinstance(check, str) and check.strip():
        return check.strip()
    return None


def _js_regex_span_end(text, i):
    """Index past a JS `/…/` we will keep, or None.

    `_swift_bare_regex_end` also matches division such as `8/"1/2"`. Trusting
    that candidate leaves a leftover quote that inverts stripper state (Codex
    high on 437f79d). Keep a candidate only when its interior has no quote, or
    the quote is the whole interior (`/"/`), an escape, or a character class.
    """
    end = _swift_bare_regex_end(text, i)
    if end is None or end - i < 3:
        return None
    inner = text[i + 1:end - 1]
    if not any(q in inner for q in '"\'`'):
        return end
    if inner in ('"', "'", "`", '\\"', "\\'", "\\`"):
        return end
    if inner.startswith("[") and "]" in inner:
        return end
    return None


def _quoted_span_end(text, i, python=False, go=False):
    """Index past the quoted literal at `text[i]`, or None if none opens there."""
    quote = text[i:i + 1]
    if quote not in "'\"`" or (python and quote == "`"):
        return None
    j, n = i + 1, len(text)
    while j < n:
        if text[j] == "\\" and j + 1 < n and not (go and quote == "`"):
            j += 2
            continue
        if text[j] == quote:
            return j + 1
        if text[j] == "\n" and quote != "`":
            return None
        j += 1
    return n


def _code_normalize(text, python=False, php=False, shell=False, rust=False,
                    go=False):
    """Whitespace-collapsed digest text with every literal kept byte-for-byte.

    The shared per-line collapse turned `"a  b"` into `"a b"`, so an assertion
    string could change without moving the hash. Same shape as `_swift_normalize`.
    """
    out, i, n, start = [], 0, len(text), 0

    def code(chunk):
        chunk = re.sub(r"[ \t]+", " ", chunk)
        return re.sub(r" ?\n[ \n]*", "\n", chunk)

    while i < n:
        if rust:
            prev_ok = i == 0 or not (text[i - 1].isalnum() or text[i - 1] == "_")
            raw = re.match(r'(?:b|c)?r(#*)"', text[i:]) if prev_ok else None
            if raw:
                hashes = raw.group(1)
                closer = '"' + hashes
                found = text.find(closer, i + raw.end())
                end = n if found < 0 else found + len(closer)
                out.append(code(text[start:i]))
                out.append(text[i:end])
                i = start = end
                continue
        heredoc = _heredoc_span(text, i, php=php, shell=shell)
        if heredoc is not None:
            head_end, payload_start, end = heredoc
            # The rest of the opener line is still code (`<<EOF | wc`).
            out.append(code(text[start:head_end]))
            out.append(code(text[head_end:payload_start]))
            out.append(text[payload_start:end])
            i = start = end
            continue
        if not (python or php or shell or rust or go):
            # JS `/…/` can hold a quote; treating that quote as a string
            # opener collapses the assertion (Codex on 6074117). Same
            # candidate rule as `_swift_bare_regex_end`.
            regex_end = _js_regex_span_end(text, i)
            if regex_end is not None:
                out.append(code(text[start:i]))
                out.append(text[i:regex_end])
                i = start = regex_end
                continue
        end = _quoted_span_end(text, i, python=python, go=go)
        if end is not None:
            out.append(code(text[start:i]))
            out.append(text[i:end])
            i = start = end
            continue
        i += 1
    out.append(code(text[start:]))
    return "".join(out).strip()

def body_digest(body, python=False, php=False, shell=False, rust=False,
                swift=False, go=False):
    """SHA-256 of comment-stripped, whitespace-collapsed body; strings kept."""
    text = body.replace("\r\n", "\n").replace("\r", "\n")
    if python:
        text = re.sub(r'"""(?:.|\n)*?"""', " ", text)
        text = re.sub(r"'''(?:.|\n)*?'''", " ", text)
    text = _strip_comments_keep_strings(
        text, python=python, php=php, shell=shell, rust=rust, swift=swift,
        go=go)
    if swift:
        return hashlib.sha256(_swift_normalize(text).encode("utf-8")).hexdigest()
    return hashlib.sha256(_code_normalize(
        text, python=python, php=php, shell=shell, rust=rust, go=go).encode("utf-8")).hexdigest()


def _char_is_escaped(text, i):
    """True when text[i] is preceded by an odd run of backslashes."""
    slashes = 0
    j = i - 1
    while j >= 0 and text[j] == "\\":
        slashes += 1
        j -= 1
    return slashes % 2 == 1

def _strip_comments_keep_strings(text, python=False, php=False, shell=False,
                                rust=False, swift=False, go=False):
    out, i, n, quote = [], 0, len(text), None
    pending = None
    while i < n:
        if pending is not None and i >= pending[0]:
            out.append(text[pending[0]:pending[1]])
            i, pending, quote = pending[1], None, None
            continue
        c = text[i]
        if quote:
            out.append(c)
            if c == "\\" and i + 1 < n and not (go and quote == "`"):
                out.append(text[i + 1])
                i += 2
                continue
            if c == quote:
                quote = None
            i += 1
            continue
        if swift:
            # A Swift literal is kept as ONE span: `"""` bodies, raw `#"…"#`
            # and interpolations with nested quotes would otherwise flip the
            # quote state and let a `//` inside the literal strip code. Only
            # the comments inside an interpolation's expression are stripped,
            # and a regex literal is kept verbatim for the same reason.
            literal = _swift_literal_scan(text, i)
            if literal is not None:
                end, interpolations = literal
                cursor = i
                for start, stop in interpolations:
                    out.append(text[cursor:start])
                    out.append(_strip_comments_keep_strings(text[start:stop], swift=True))
                    cursor = stop
                out.append(text[cursor:end])
                i = end
                continue
            end = _swift_regex_end(text, i)
            if end is not None:
                out.append(text[i:end])
                i = end
                continue
        if rust:
            prev_ok = i == 0 or not (text[i - 1].isalnum() or text[i - 1] == "_")
            raw = re.match(r'(?:b|c)?r(#*)"', text[i:]) if prev_ok else None
            if raw:
                hashes = raw.group(1)
                closer = '"' + hashes
                start = i + raw.end()
                found = text.find(closer, start)
                end = n if found < 0 else found + len(closer)
                out.append(text[i:end])
                i = end
                continue
        heredoc = _heredoc_span(text, i, php=php, shell=shell)
        if heredoc is not None:
            # The opener token is code and the rest of its line is stripped like
            # any other code; the payload, from the next line to the closer, is
            # data and is copied verbatim when the scan reaches it.
            out.append(text[i:heredoc[0]])
            pending = (heredoc[1], heredoc[2])
            i = heredoc[0]
            continue
        if not (python or php or shell or rust or swift or go):
            # Same JS `/…/` keep as `_code_normalize`: a quote inside `/"/`
            # must not start string state or `//` inside the next string is
            # stripped as a comment (Codex high on 6e0fe99).
            regex_end = _js_regex_span_end(text, i)
            if regex_end is not None:
                out.append(text[i:regex_end])
                i = regex_end
                continue
        if c in "'\"`" and not (python and c == "`"):
            quote = c
            out.append(c)
            i += 1
            continue
        if not python and not shell and c == "/" and i + 1 < n:
            nxt = text[i + 1]
            if nxt == "/":
                i += 2
                while i < n and text[i] != "\n":
                    i += 1
                continue
            if nxt == "*":
                if rust or swift:
                    depth, j = 1, i + 2
                    while j < n and depth:
                        if text.startswith("/*", j):
                            depth += 1
                            j += 2
                            continue
                        if text.startswith("*/", j):
                            depth -= 1
                            j += 2
                            continue
                        if text[j] == "\n":
                            out.append("\n")
                        j += 1
                    i = j
                    continue
                i += 2
                while i + 1 < n and not (text[i] == "*" and text[i + 1] == "/"):
                    if text[i] == "\n":
                        out.append("\n")
                    i += 1
                i = i + 2 if i + 1 < n else i + 1
                continue
        if python and c == "#":
            while i < n and text[i] != "\n":
                i += 1
            continue
        if php and c == "#" and not text.startswith("#[", i):
            while i < n and text[i] != "\n":
                i += 1
            continue
        if shell and c == "#" and (i == 0 or (text[i - 1] in " \t\n;|&" and not _char_is_escaped(text, i - 1))):
            while i < n and text[i] != "\n":
                i += 1
            continue
        out.append(c)
        i += 1
    return "".join(out)


def extract_test_names(text, python=False, go=False, php=False, rust=False,
                       shell=False, swift=False):
    """Names this hasher can see in `text`."""
    if python:
        try:
            tree = ast.parse(text)
        except (SyntaxError, ValueError):
            tree = None
        if tree is not None:
            names = []
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) \
                        and node.name.startswith("test"):
                    names.append(node.name)
            return names
        return []
    if go:
        names, seen = [], set()
        for name, _after in _iter_go_func_tests(text):
            if name not in seen:
                seen.add(name)
                names.append(name)
        for name, _after in _iter_go_method_tests(text):
            if name not in seen:
                seen.add(name)
                names.append(name)
        for name, _after in _iter_go_t_runs(text):
            if name not in seen:
                seen.add(name)
                names.append(name)
        return names
    if rust:
        return [name for name, _after in _iter_rust_fn_tests(text)]
    if swift:
        return [name for name, _after in _iter_swift_tests(text)]
    if shell:
        return [name for name, _after in _iter_sh_tests(text)]
    names, seen = [], set()
    if php:
        for name, _after in _iter_php_function_tests(text):
            if name not in seen:
                seen.add(name)
                names.append(name)
    for name in _iter_bdd_names(text, php=php):
        if name not in seen:
            seen.add(name)
            names.append(name)
    return names


def _matching_js_brace(text, start):
    """Index of the `}` matching `text[start] == '{'`, skipping strings/comments.

    Same class as arch-lint `scan_code_only`: raw `{`/`}` counting treats a
    brace inside a string as the closer and hashes a prefix. If the span cannot
    be established, return None — do not hash a prefix (ADR-005). Hash the
    ORIGINAL slice, not code_only (ADR-050).
    """
    if start >= len(text) or text[start] != "{":
        return None
    state = "code"
    escaped = False
    depth = 0
    index = start
    while index < len(text):
        char = text[index]
        pair = text[index:index + 2]
        if state == "code":
            if pair == "//":
                state = "line-comment"
                index += 2
                continue
            if pair == "/*":
                state = "block-comment"
                index += 2
                continue
            if char in ('"', "'"):
                state = char
                escaped = False
            elif char == "`":
                state = "raw-string"
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return index
        elif state == "line-comment":
            if char == "\n":
                state = "code"
        elif state == "block-comment":
            if pair == "*/":
                state = "code"
                index += 2
                continue
        elif state == "raw-string":
            if char == "`":
                state = "code"
        else:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == state:
                state = "code"
        index += 1
    return None

def _js_like_in_code(text, pos):
    """True when pos is in code, same machine as `_matching_js_brace`."""
    if pos < 0 or pos >= len(text):
        return False
    state = "code"
    escaped = False
    index = 0
    while index < pos:
        char = text[index]
        pair = text[index:index + 2]
        if state == "code":
            if pair == "//":
                state = "line-comment"
                index += 2
                continue
            if pair == "/*":
                state = "block-comment"
                index += 2
                continue
            if char in ("'", '"'):
                state = char
                escaped = False
            elif char == "`":
                state = "raw-string"
        elif state == "line-comment":
            if char == "\n":
                state = "code"
        elif state == "block-comment":
            if pair == "*/":
                state = "code"
                index += 2
                continue
        elif state == "raw-string":
            if char == "`":
                state = "code"
        else:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == state:
                state = "code"
        index += 1
    return state == "code"


def _iter_go_func_tests(text):
    """Package-level `func TestXxx` in code. Yields (name, after_open_paren)."""
    seen = set()
    for match in _GO_FUNC_TEST.finditer(text):
        func_at = text.find("func", match.start(), match.end())
        if func_at < 0 or not _js_like_in_code(text, func_at):
            continue
        name = match.group(1)
        if name in seen:
            continue
        seen.add(name)
        yield name, match.end()

def _iter_go_method_tests(text):
    """`func (recv) TestXxx` in code. Yields (name, after_open_paren)."""
    seen = set()
    for match in _GO_METHOD_TEST.finditer(text):
        func_at = text.find("func", match.start(), match.end())
        if func_at < 0 or not _js_like_in_code(text, func_at):
            continue
        name = match.group(1)
        if name in seen:
            continue
        seen.add(name)
        yield name, match.end()


def _iter_go_t_runs(text):
    """Quoted names in t.Run("name",. Yields (name, after the comma)."""
    seen = set()
    for match in _GO_T_RUN.finditer(text):
        if not _js_like_in_code(text, match.start()):
            continue
        name = match.group(2)
        if name in seen:
            continue
        seen.add(name)
        yield name, match.end()


# No arithmetic guard here: `_in_arithmetic` refuses every `<<` inside `((…))`
# before this regex is consulted. A lookahead on what follows the marker was
# tried first and was stepped around by backtracking (`true` → `tru`), then
# made unreachable by that refusal — a guard nothing can fail is not kept.
_PHP_HEREDOC_OPEN = re.compile(r"<<<[ \t]*(['\"]?)([A-Za-z_]\w*)\1[^\n]*\n")
_SH_HEREDOC_OPEN = re.compile(r"<<-?[ \t]*(['\"]?)([A-Za-z_]\w*)\1[^\n]*\n")


def _heredoc_span(text, i, php=False, shell=False):
    """(head_end, payload_start, end) of the heredoc opening at `text[i]`, or None.

    PHP `<<<MARKER` closes at `MARKER;?` alone on a line; shell `<<[-]MARKER`
    at `MARKER`. `head_end` is just past the marker, `payload_start` the line
    after the opener, `end` past the closer line. Shared by the masker, which
    blanks the whole span, and the digest stripper, which keeps the PAYLOAD
    verbatim while the rest of the opener line is still code — so a `# comment`
    after `<<EOF` stays a comment, and a `//` URL or a `#` line INSIDE the
    heredoc is data. Not a heredoc: `<<<word` (a here-string; its second `<`
    must not open one) and a `<<` inside `((…))`, which is a shift whatever
    follows its right operand (`$((1 << true))`, `$((1 << true + 0))`). An
    unterminated heredoc runs to the end.
    """
    if php and text.startswith("<<<", i):
        opener, closer = _PHP_HEREDOC_OPEN, ";?"
    elif (shell and text.startswith("<<", i) and (i == 0 or text[i - 1] != "<")
          and not _in_arithmetic(text, i)):
        opener, closer = _SH_HEREDOC_OPEN, ""
    else:
        return None
    start = opener.match(text, i)
    if not start:
        return None
    tail = start.end()
    close = re.search(
        rf"(?m)^[ \t]*{re.escape(start.group(2))}{closer}[ \t]*(?:\n|$)", text[tail:])
    end = len(text) if close is None else tail + close.end()
    return start.end(2) + len(start.group(1)), tail, end


_ARITHMETIC_BETWEEN = re.compile(r"[\w\s+\-*/%&|^~!<>=?:,$#]*")


def _in_arithmetic(text, i):
    """True only when `text[i]` is unmistakably a shift inside a same-line `((…))`.

    The two errors are not symmetric. Calling a real heredoc a shift leaves its
    payload unmasked, a `}` in it closes the function early, and the lock holds a
    PROVEN hash of a prefix (Codex, 2026-09-13: `$(( $(if …; then cat <<EOF` and a
    multi-line string carrying `((`). Calling a shift a heredoc costs UNPROVEN or
    a comment that moves the digest. So the text between the last `((` on this
    line and the `<<` must be purely arithmetic: no quote, no paren, no `;`, no
    `{`. `$(( (a+b) << c ))` is refused and reads as a heredoc — fail-closed.
    """
    line_start = text.rfind("\n", 0, i) + 1
    opened = text.rfind("((", line_start, i)
    if opened < 0:
        return False
    between = text[opened + 2:i]
    if "))" in between:
        return False
    return _ARITHMETIC_BETWEEN.fullmatch(between) is not None


def _mask_lock_noncode(text, hash_comments=False, heredocs=False, rust_raw=False,
                       shell_heredocs=False, swift=False, go=False):
    """Blank comments/strings/heredocs; keep offsets. spec-verify mask_noncode subset.

    spec-verify imports this module, so the masker cannot be imported from there.
    PHP needs hash comments and heredocs; Rust uses C-like comments and quotes.
    rust_raw blanks r#"..."# and nested /* */; shell_heredocs blanks << after PHP <<<.
    swift blanks every Swift literal WHOLE (quotes included, so the brace matcher
    sees no quote to re-open), `#/…/#` regex literals and nested /* */, and keeps
    backtick identifiers as code. A bare `/…/` regex literal is not masked; a body
    that might hold one is refused by `_swift_ambiguous_slash`.
    go treats backtick strings as raw (backslash is content). Interpreted quotes still C-escape.
    """
    out = list(text)
    i, n = 0, len(text)

    def blank(start, end, keep_quotes=False):
        for j in range(start, end):
            if out[j] != "\n" and not (keep_quotes and j in (start, end - 1)):
                out[j] = " "

    while i < n:
        if swift:
            literal = _swift_literal_scan(text, i)
            end = literal[0] if literal is not None else _swift_regex_end(text, i)
            if end is not None:
                blank(i, end)
                i = end
                continue
            if text[i] == "`":
                # An escaped identifier (`default`) is code: kept, so a test
                # declared with one has a name, and not read as a JS template.
                close = text.find("`", i + 1)
                if close != -1 and "\n" not in text[i:close]:
                    i = close + 1
                    continue
        if rust_raw:
            prev_ok = i == 0 or not (text[i - 1].isalnum() or text[i - 1] == "_")
            raw = re.match(r'(?:b|c)?r(#*)"', text[i:]) if prev_ok else None
            if raw:
                hashes = raw.group(1)
                closer = '"' + hashes
                start = i + raw.end()
                found = text.find(closer, start)
                end = n if found < 0 else found + len(closer)
                blank(i, end)
                i = end
                continue
        heredoc = _heredoc_span(text, i, php=heredocs, shell=shell_heredocs)
        if heredoc is not None:
            blank(i, heredoc[2])
            i = heredoc[2]
        elif text.startswith("//", i):
            end = text.find("\n", i + 2)
            end = n if end < 0 else end
            blank(i, end)
            i = end
        elif text.startswith("/*", i):
            if rust_raw or swift:
                depth, j = 1, i + 2
                while j < n and depth:
                    if text.startswith("/*", j):
                        depth += 1
                        j += 2
                        continue
                    if text.startswith("*/", j):
                        depth -= 1
                        j += 2
                        continue
                    j += 1
                blank(i, j)
                i = j
            else:
                end = text.find("*/", i + 2)
                end = n if end < 0 else end + 2
                blank(i, end)
                i = end
        elif hash_comments and text[i] == "#" and not text.startswith("#[", i):
            end = text.find("\n", i + 1)
            end = n if end < 0 else end
            blank(i, end)
            i = end
        elif text[i] in ("'", '"', "`"):
            quote, end = text[i], i + 1
            raw_backtick = go and quote == "`"
            while end < n:
                if not raw_backtick and text[end] == "\\":
                    end += 2
                    continue
                if text[end] == quote:
                    end += 1
                    break
                end += 1
            closed = end > i + 1 and end <= n and text[end - 1] == quote
            blank(i, min(end, n), keep_quotes=closed)
            i = max(end, i + 1)
        else:
            i += 1
    return "".join(out)


def _body_brace_after(masked, after_paren):
    """Index of `{` that opens the body, or None when the signature ends with `;`."""
    depth, i, n = 1, after_paren, len(masked)
    while i < n:
        char = masked[i]
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
        elif depth == 0:
            if char == "{":
                return i
            if char == ";":
                return None
        i += 1
    return None


def _closing_paren(masked, after):
    """Index of the `)` closing the call whose arguments start at `after`, or None."""
    depth, i, n = 1, after, len(masked)
    while i < n:
        char = masked[i]
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return None


def _span_from_paren(text, masked, after_paren):
    """Original `{...}` after a function `(`, or None."""
    brace = _body_brace_after(masked, after_paren)
    if brace is None:
        return None
    end = _matching_js_brace(masked, brace)
    if end is None:
        return None
    return text[brace:end + 1]

def _span_from_first_brace(text, masked, after):
    """Original `{...}` of an inline t.Run func, or None.

    t.Run("name", helper) has no inline func. The first `{` after the comma
    is then a sibling callback or helper's body — both the wrong body.
    Require the next code token to be `func`.
    """
    i, n = after, len(masked)
    while i < n and masked[i] in " \t\r\n":
        i += 1
    if not (masked.startswith("func", i)
            and (i + 4 >= n or not (masked[i + 4].isalnum() or masked[i + 4] == "_"))):
        return None
    brace = masked.find("{", i + 4)
    if brace == -1:
        return None
    end = _matching_js_brace(masked, brace)
    if end is None:
        return None
    return text[brace:end + 1]


def _parse_bdd_string(text, start, php=False):
    """JS/Pest quoted name at `start`. `(decoded, after, interpolated)` or None.

    Same-quote escapes decode; unescaped `${` (backtick) and PHP `"` `$`
    are interpolated (ADR-005 — skip). Go raw backticks are not this walk.
    """
    n = len(text)
    if start >= n or text[start] not in "'\"`":
        return None
    quote = text[start]
    i = start + 1
    out = []
    interpolated = False
    while i < n:
        c = text[i]
        if c == "\n":
            return None
        if c == "\\" and i + 1 < n:
            nxt = text[i + 1]
            if php and quote == "'":
                if nxt in ("\\", "'"):
                    out.append(nxt)
                    i += 2
                    continue
                out.append("\\")
                i += 1
                continue
            if php and quote == '"' and nxt == "$":
                out.append("$")
                i += 2
                continue
            if php and quote == '"':
                mapped = {"n": "\n", "t": "\t", "r": "\r", "\\": "\\", '"': '"'}
                if nxt in mapped:
                    out.append(mapped[nxt])
                else:
                    out.append("\\")
                    out.append(nxt)
                i += 2
                continue
            if quote == "`" and nxt == "$":
                out.append("$")
                i += 2
                continue
            out.append({"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f", "v": "\v"}.get(nxt, nxt))
            i += 2
            continue
        if c == quote:
            return ("".join(out), i + 1, interpolated)
        if php and quote == '"' and c == "$":
            interpolated = True
        if quote == "`" and c == "$" and i + 1 < n and text[i + 1] == "{":
            interpolated = True
        out.append(c)
        i += 1
    return None


def _iter_bdd_calls(text, php=False):
    """Yield `(decoded_name, after_comma)` for each non-interpolated it()/test()."""
    for head in _BDD_CALL_HEAD.finditer(text):
        line = text.rfind("\n", 0, head.start()) + 1
        if re.match(r"\s*(?://|#)", text[line:head.start()]):
            continue
        i = head.end()
        n = len(text)
        while i < n and text[i] in " \t\r\n":
            i += 1
        parsed = _parse_bdd_string(text, i, php=php)
        if parsed is None:
            continue
        name, after, interpolated = parsed
        if interpolated:
            continue
        if any(ch in name for ch in "\n\t\r"):
            continue
        j = after
        while j < n and text[j] in " \t\r\n":
            j += 1
        if j >= n or text[j] != ",":
            continue
        yield name, j + 1


def _iter_bdd_names(text, php=False):
    """Quoted names passed to bare test()/it(."""
    seen = set()
    for name, _after in _iter_bdd_calls(text, php=php):
        if name in seen:
            continue
        seen.add(name)
        yield name


def _iter_php_function_tests(text):
    """PHPUnit class methods: test*, #[Test], @test docblock. Yields (name, after `(`)."""
    masked = _mask_lock_noncode(text, hash_comments=True, heredocs=True)
    seen = set()
    for class_match in _PHP_CLASS_OPEN.finditer(masked):
        start = class_match.end() - 1
        end = _matching_js_brace(masked, start)
        if end is None:
            continue
        body = masked[start:end + 1]
        orig = text[start:end + 1]
        for fn in _PHP_FUNC_TEST.finditer(body):
            name = fn.group(1)
            if name in seen:
                continue
            seen.add(name)
            yield name, start + fn.end()
        for fn in _PHP_ATTR_TEST.finditer(body):
            name = fn.group(1)
            if name in seen:
                continue
            seen.add(name)
            yield name, start + fn.end()
        for fn in _PHP_DOCBLOCK_TEST.finditer(orig):
            name = fn.group(1)
            if name in seen:
                continue
            seen.add(name)
            yield name, start + fn.end()


def _iter_rust_fn_tests(text):
    """`#[test]` / `#[tokio::test]` fn. Yields (name, after `(`)."""
    masked = _mask_lock_noncode(text, rust_raw=True)
    seen = set()
    for match in _RUST_TEST_FN.finditer(masked):
        name = match.group(1)
        if name in seen:
            continue
        seen.add(name)
        yield name, match.end()


def _iter_sh_tests(text):
    """Shell `test_*` / `function test_*` at line start. Yields (name, brace)."""
    masked = _mask_lock_noncode(text, hash_comments=True)
    seen = set()
    for match in _SH_TEST_FN.finditer(masked):
        name = match.group(1) or match.group(2)
        if name in seen:
            continue
        seen.add(name)
        yield name, match.end() - 1


def _swift_literal_scan(text, i):
    """(end, interpolations) for the Swift string literal opening at `text[i]`, or None.

    Raw strings (`#"…"#`, and triple-quoted ones behind `##`) close on the
    quote plus the same number of `#`, and escape with a backslash plus that
    many `#`. An interpolation (backslash, then `(`) is an expression: its
    nested literals, regex literals and comments are skipped before its
    parentheses are counted, so neither a `"}"` nor a `/* ) */` inside it ends
    the outer literal. `interpolations` holds the (start, end) of each
    expression's text. A triple quote not followed by a line break is an empty
    literal then a quote, as in the grammar. An unterminated single-line
    literal stops at the line break; a multi-line one runs to the end.
    """
    opening = _SWIFT_LITERAL_OPEN.match(text, i)
    if not opening:
        return None
    n = len(text)
    hashes, delim = opening.group(1), opening.group(2)
    j = opening.end()
    if delim == '"""' and not re.match(r"[ \t]*(?:\n|$)", text[j:j + 256]):
        delim, j = '"', i + len(hashes) + 1
    closer, escape = delim + hashes, "\\" + hashes
    interpolations = []
    while j < n:
        if text.startswith(escape, j):
            k = j + len(escape)
            if k < n and text[k] == "(":
                start, depth, k = k + 1, 1, k + 1
                while k < n and depth:
                    skipped = _swift_expression_skip(text, k)
                    if skipped is not None:
                        k = skipped
                        continue
                    if text[k] == "(":
                        depth += 1
                    elif text[k] == ")":
                        depth -= 1
                    k += 1
                interpolations.append((start, k - 1 if depth == 0 else k))
                j = k
                continue
            j = k + 1
            continue
        if text.startswith(closer, j):
            return j + len(closer), interpolations
        if delim == '"' and text[j] == "\n":
            return j, interpolations
        j += 1
    return n, interpolations


def _swift_expression_skip(text, k):
    """Index past a literal, regex literal or comment at `text[k]` in Swift code, or None."""
    literal = _swift_literal_scan(text, k)
    if literal is not None:
        return literal[0]
    if text.startswith("//", k):
        end = text.find("\n", k)
        return len(text) if end == -1 else end
    if text.startswith("/*", k):
        depth, j = 1, k + 2
        while j < len(text) and depth:
            if text.startswith("/*", j):
                depth, j = depth + 1, j + 2
            elif text.startswith("*/", j):
                depth, j = depth - 1, j + 2
            else:
                j += 1
        return j
    return _swift_regex_end(text, k)


def _swift_regex_end(text, i):
    """Index just past an extended `#/…/#` regex literal at `text[i]`, or None.

    It closes on an unescaped `/` plus the same number of `#` and may span lines;
    unterminated, it runs to the end, so the brace matcher fails closed. A bare
    `/…/` is NOT recognised here: telling it from division needs the type
    checker (`total!/f(x)` is division, `if /[}]/ ~= s` is a regex), so the
    extractor refuses a body that might hold one (`_swift_ambiguous_slash`).
    """
    opening = _SWIFT_REGEX_OPEN.match(text, i)
    if not opening:
        return None
    n = len(text)
    hashes, j = opening.group(1), opening.end()
    while j < n:
        if text[j] == "\\":
            j += 2
            continue
        if text.startswith("/" + hashes, j):
            return j + 1 + len(hashes)
        j += 1
    return n


def _swift_code_view(text):
    """`text` with Swift comments, literal text and `#/…/#` regexes blanked, offsets kept.

    Unlike `_mask_lock_noncode`, an interpolation's expression inside a literal
    stays visible (recursively viewed), because a regex literal or a comment
    can sit inside `\\(…)` and must be seen by `_swift_ambiguous_slash`.
    """
    out, i, n = list(text), 0, len(text)

    def blank(start, end):
        for j in range(start, end):
            if out[j] != "\n":
                out[j] = " "

    while i < n:
        literal = _swift_literal_scan(text, i)
        if literal is not None:
            end, interpolations = literal
            cursor = i
            for start, stop in interpolations:
                blank(cursor, start)
                out[start:stop] = _swift_code_view(text[start:stop])
                cursor = stop
            blank(cursor, end)
            i = end
            continue
        skipped = _swift_expression_skip(text, i)
        if skipped is not None:
            blank(i, skipped)
            i = skipped
            continue
        i += 1
    return "".join(out)


def _swift_normalize(text):
    """Whitespace-collapsed Swift for the digest, with every literal kept byte-for-byte.

    The shared per-line collapse would turn `"a  b"` into `"a b"`, so an
    assertion's expected string could change without moving the hash. Outside
    literals, runs of spaces and tabs become one space and blank lines and line
    edges are dropped, as for every other language.
    """
    out, i, n, start = [], 0, len(text), 0

    def code(chunk):
        chunk = re.sub(r"[ \t]+", " ", chunk)
        return re.sub(r" ?\n[ \n]*", "\n", chunk)

    while i < n:
        literal = _swift_literal_scan(text, i)
        end = literal[0] if literal is not None else (
            _swift_regex_end(text, i) or _swift_bare_regex_end(text, i))
        if end is None:
            i += 1
            continue
        out.append(code(text[start:i]))
        out.append(text[i:end])
        i = start = end
    out.append(code(text[start:]))
    return "".join(out).strip()


def _swift_bare_regex_end(text, i):
    """Index past a same-line `/…/` at `text[i]` that COULD be a bare regex, or None.

    A candidate opens on `/` followed by a character that is neither whitespace
    nor the second character of a comment opener, and closes on the next
    unescaped `/` on the same line; the scan gives up at `//` or `/*`, which a
    bare regex cannot hold unescaped. Division such as `8/2/2` is a candidate
    too: callers keep a candidate verbatim or inspect it, never trust it.
    """
    if text[i:i + 1] != "/" or text[i + 1:i + 2] in ("", " ", "\t", "\n", "/", "*"):
        return None
    j, n = i + 1, len(text)
    while j < n and text[j] != "\n":
        if text[j] == "\\":
            j += 2
            continue
        if text.startswith("//", j) or text.startswith("/*", j):
            return None
        if text[j] == "/":
            return j + 1
        j += 1
    return None


def _swift_ambiguous_slash(text):
    """True when a code `/` in a Swift source might open a bare regex literal.

    Telling `/…/` from division needs the type checker (`total!/f(x)` is
    division, `if /[}]/ ~= s` is a regex), and a regex can hold characters the
    masker would misread. A code `/` — seen through `_swift_code_view`, so one
    inside an interpolation counts — that opens a `_swift_bare_regex_end`
    candidate is ambiguous when the candidate's content holds a brace, a
    backslash, a quote of either kind or a backtick. The whole file is then refused (UNPROVEN)
    rather than hashed on a boundary nobody can vouch for. `a / b`, `8/2*3`,
    `8/2; }`, `8/2/2` and `8/2 } // note` never refuse; candidates that do not
    refuse are kept verbatim in the digest (`_swift_normalize`).
    """
    view = _swift_code_view(text)
    for i, char in enumerate(view):
        if char != "/":
            continue
        end = _swift_bare_regex_end(text, i)
        if end is not None and any(mark in text[i + 1:end - 1] for mark in "{}\\\"'`"):
            return True
    return False

def _swift_balanced_parens_end(masked, i):
    """Index just past the `)` matching `masked[i] == '('`, or None."""
    depth, n = 0, len(masked)
    while i < n:
        if masked[i] == "(":
            depth += 1
        elif masked[i] == ")":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return None


def _iter_swift_tests(text):
    """Swift Testing `@Test` funcs and XCTest `func test*()`, every occurrence.

    Yields (name, after `(`) in source order, a name once per declaration: two
    suites in one file may both declare `probe`, and the body is then the
    join of every declaration's body. A backticked name is yielded without
    its backticks.
    """
    masked = _mask_lock_noncode(text, swift=True)
    found = []
    for attr in _SWIFT_TEST_ATTR.finditer(masked):
        i = attr.end()
        while True:
            while i < len(masked) and masked[i] in " \t\r\n":
                i += 1
            if masked.startswith("(", i):
                i = _swift_balanced_parens_end(masked, i)
                if i is None:
                    break
                continue
            other = re.match(
                r"@[ \t]*`?\w+`?(?:[ \t\r\n]*\.[ \t\r\n]*`?\w+`?)*", masked[i:])
            if other:
                i += other.end()
                continue
            modifier = _SWIFT_MODIFIER.match(masked, i)
            if modifier:
                i = modifier.end()
                continue
            break
        if i is None:
            continue
        fn = re.match(
            r"func[ \t\r\n]+(`?)(\w+)\1[ \t\r\n]*(?:<[^>{]*>)?[ \t\r\n]*\(",
            masked[i:])
        if fn:
            found.append((attr.start(), fn.group(2), i + fn.end()))
    for fn in _SWIFT_XCTEST_FN.finditer(masked):
        found.append((fn.start(), fn.group(2), fn.end(3)))
    declared = set()
    for at, name, after_paren in sorted(found):
        if after_paren in declared:
            continue
        declared.add(after_paren)
        yield name, after_paren

def extract_test_body(text, name, python=False, go=False, php=False, rust=False,
                      shell=False, swift=False):
    """Best-effort body of `name`, or None."""
    if python:
        try:
            tree = ast.parse(text)
        except (SyntaxError, ValueError):
            return None
        for node in ast.walk(tree):
            if (isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
                    and node.name == name and node.body):
                start = node.body[0].lineno - 1
                end = max(getattr(stmt, "end_lineno", stmt.lineno) for stmt in node.body)
                return "".join(text.splitlines(keepends=True)[start:end])
        return None
    if go:
        masked = _mask_lock_noncode(text, go=True)
        for found, after_paren in _iter_go_func_tests(text):
            if found != name:
                continue
            return _span_from_paren(text, masked, after_paren)
        for found, after_paren in _iter_go_method_tests(text):
            if found != name:
                continue
            return _span_from_paren(text, masked, after_paren)
        for found, after_paren in _iter_go_t_runs(text):
            if found != name:
                continue
            return _span_from_first_brace(text, masked, after_paren)
        return None
    if rust:
        masked = _mask_lock_noncode(text, rust_raw=True)
        for found, after_paren in _iter_rust_fn_tests(text):
            if found != name:
                continue
            return _span_from_paren(text, masked, after_paren)
        return None
    if swift:
        if _swift_ambiguous_slash(text):
            return None
        masked = _mask_lock_noncode(text, swift=True)
        spans = [_span_from_paren(text, masked, after_paren)
                 for found, after_paren in _iter_swift_tests(text) if found == name]
        # A declaration of the name that discovery did not recognise as a test
        # (an attribute spelling not modelled here) must not leave a partial
        # lock that looks complete.
        declared = len(re.findall(
            r"\bfunc\s+`?" + re.escape(name) + r"`?\s*[<(]", masked))
        if not spans or len(spans) != declared or any(span is None for span in spans):
            return None
        return "\n".join(spans)
    if shell:
        masked = _mask_lock_noncode(text, hash_comments=True, shell_heredocs=True)
        for found, brace in _iter_sh_tests(text):
            if found != name:
                continue
            end = _matching_js_brace(masked, brace)
            if end is None:
                return None
            return text[brace:end + 1]
        return None
    if php:
        masked = _mask_lock_noncode(text, hash_comments=True, heredocs=True)
        for found, after_paren in _iter_php_function_tests(text):
            if found != name:
                continue
            return _span_from_paren(text, masked, after_paren)
    for found, after in _iter_bdd_calls(text, php=php):
        if found != name:
            continue
        return bdd_callback_body(text, after, php=php)
    return None


def bdd_callback_body(text, after, php=False):
    """Body of the callback that follows a BDD test's `name,` at `after`, or None.

    Bounded to that call. An unbounded find("{") lands in the NEXT test's block
    when the callback is an arrow with an expression body (Pest `fn () =>`, JS
    `() => expect(...)`), and whoever asked then reads the wrong body — the
    lock followed it, and adr-lint's can-fail check read the neighbour's
    assertions as this test's. Scanning at paren depth 0 from the callback's
    head, the first of `{` or `=>` decides: `=> {` and a bare `{` open a block
    body; `=> expr` is an expression body running to the call's `)`. A `)` at
    depth 0 before either means the call closed with no body (`test('x',
    helper)`). Both are the ORIGINAL slice (ADR-050).

    A `)` inside a regex literal closes the call early (`/[)]/.test(')')`);
    the masker does not know regex literals. A truncated expression must not
    get a proven hash, so an unbalanced slice is refused — UNPROVEN, never a
    prefix.
    """
    masked = _mask_lock_noncode(text, hash_comments=php, heredocs=php)
    n = len(masked)
    depth, i, brace = 0, after, None
    while i < n and brace is None:
        c = masked[i]
        if c == "(":
            depth += 1
        elif c == ")":
            if depth == 0:
                return None
            depth -= 1
        elif depth == 0 and c == "{":
            brace = i
        elif depth == 0 and masked.startswith("=>", i):
            i += 2
            while i < n and masked[i] in " \t\r\n":
                i += 1
            if i < n and masked[i] == "{":
                brace = i
            else:
                close = _closing_paren(masked, i)
                if close is None:
                    return None
                # A `/` outside a string is a regex literal or a division, and
                # the masker knows neither: `/[)]/` and `/\)/` both close the
                # call early, and `/\)/` leaves nothing unbalanced to notice.
                # No boundary can be established, so refuse — UNPROVEN.
                if "/" in masked[i:close]:
                    return None
                return text[i:close].strip()
            continue
        i += 1
    if brace is None:
        return None
    end = _matching_js_brace(masked, brace)
    if end is None:
        return None
    return text[brace:end + 1]


def _read_file(path):
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return None


def snapshot_lock(root, tests_rows):
    """Canonical lock map: check value plus every extractable name in Tests files."""
    check = declared_check(root)
    bodies = {}
    unproven = set()
    seen_files = []
    for _name, rel in tests_rows:
        if rel not in seen_files:
            seen_files.append(rel)
    named = {(rel, name) for name, rel in tests_rows}
    for rel in seen_files:
        path = None if root is None else Path(root, *rel.split("/"))
        source = None if path is None else _read_file(path)
        if source is None:
            for n, r in tests_rows:
                if r == rel:
                    unproven.add((rel, n))
            continue
        python = path.suffix.lower() == ".py"
        go = path.suffix.lower() == ".go"
        php = path.suffix.lower() == ".php"
        rust = path.suffix.lower() == ".rs"
        shell = path.suffix.lower() in (".sh", ".bash")
        swift = path.suffix.lower() == ".swift"
        for name in extract_test_names(
                source, python=python, go=go, php=php, rust=rust, shell=shell,
                swift=swift):
            body = extract_test_body(
                source, name, python=python, go=go, php=php, rust=rust,
                shell=shell, swift=swift)
            if body is None:
                if (rel, name) in named:
                    unproven.add((rel, name))
                continue
            bodies[(rel, name)] = body_digest(
                body, python=python, php=php, shell=shell, rust=rust,
                swift=swift, go=go)
        for n, r in tests_rows:
            if r == rel and (rel, n) not in bodies:
                unproven.add((rel, n))
    return {"check": check, "bodies": bodies, "unproven": unproven}


def encode_lock(snap):
    """Canonical payload + sha256 of it."""
    lines = []
    check = snap["check"]
    if check is None:
        lines.append("check\tabsent")
    elif check == "unproven":
        lines.append("check\tunproven")
    else:
        lines.append("check\t" + hashlib.sha256(check.encode("utf-8")).hexdigest())
    for (rel, name), digest in sorted(snap["bodies"].items()):
        lines.append(f"body\t{rel}\t{name}\t{digest}")
    for rel, name in sorted(snap["unproven"]):
        lines.append(f"unproven\t{rel}\t{name}")
    payload = "\n".join(lines).encode("utf-8")
    digest = hashlib.sha256(payload).hexdigest()
    token = base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")
    return digest, token


def decode_lock(token):
    pad = "=" * ((4 - len(token) % 4) % 4)
    try:
        raw = base64.urlsafe_b64decode(token + pad)
        text = raw.decode("utf-8")
    except (ValueError, UnicodeError):
        return None
    check, bodies, unproven = None, {}, set()
    for line in text.split("\n"):
        parts = line.split("\t")
        if not parts:
            continue
        if parts[0] == "check" and len(parts) == 2:
            check = parts[1]
        elif parts[0] == "body" and len(parts) == 4:
            bodies[(parts[1], parts[2])] = parts[3]
        elif parts[0] == "unproven" and len(parts) == 3:
            unproven.add((parts[1], parts[2]))
    # A UTF-8 payload with no check record is not a lock (Codex: `eA` → `x`).
    if check is None:
        return None
    return {"check": check, "bodies": bodies, "unproven": unproven}


def first_red_lock_suffix(text, root):
    """Suffix for the first TDD-red row, or empty when a lock already exists."""
    if vlog_has_test_lock(text):
        return ""
    digest, token = encode_lock(snapshot_lock(root, tests_table_rows(text)))
    return f" · test-lock-sha256:{digest} · test-lock-b64:{token}"


def lock_suffix_for_run(text, root, code):
    """First-red lock, or a recovery lock on a later row when the log still has none.

    A first-ever green (empty log, exit 0) is not first-red and must not lock.
    """
    if code != 0 or vlog_has_red(text):
        return first_red_lock_suffix(text, root)
    return ""


def lock_snapshot_suffix(snap, kind):
    """Current snapshot plus a trailing test-lock-kind (ADR-052)."""
    digest, token = encode_lock(snap)
    return f" · test-lock-sha256:{digest} · test-lock-b64:{token} · test-lock-kind:{kind}"


def moved_lock_bodies(vlog, *, current):
    """Recorded hashed bodies that vanished or whose digest moved."""
    _date, recorded = _recorded_lock(vlog)
    if not recorded or not recorded.get("map"):
        return []
    moved = []
    for (rel, name), digest in (recorded["map"].get("bodies") or {}).items():
        now = current["bodies"].get((rel, name))
        if now is None or now != digest:
            moved.append((rel, name))
    return moved


def _vlog_machine_rows(vlog):
    """Yield (line, match) for each machine row outside a fenced excerpt."""
    fence = None
    for raw in vlog:
        # A fenced excerpt can hold a printed example row. That is output, not
        # a later red (Codex xhigh on 0fad183). Same fence grammar as the walk.
        if fence is None:
            opened = _fence_opened(raw)
            if opened:
                fence = opened
                continue
        else:
            if _fence_closes(raw, fence):
                fence = None
            continue
        line = raw.strip()
        m = _MACHINE.match(line)
        if m:
            yield line, m


def _row_lock_sha(line):
    """The row's TRAILING test-lock-sha256 field, or None.

    Anchored, because `_LOCK_SHA.search` also matched the RECORDED COMMAND: a
    fence whose text happens to contain `test-lock-sha256:<64 hex>` was read as
    a lock, which since the later-red rule could refuse a task whose tests never
    moved. The writer appends the field last (`first_red_lock_suffix`), so the
    end of the line is where a real one is. Optional `test-lock-kind` may
    follow the b64 (ADR-052).
    """
    return re.search(r" · test-lock-sha256:([0-9a-f]{64})"
                     r"(?: · test-lock-b64:[A-Za-z0-9_-]+)?"
                     r"(?: · test-lock-kind:(relock|replace))?"
                     r"[ \t]*$", line)

def vlog_row_is_lock_snapshot(line):
    """True when the row is a --relock/--replace-hashes snapshot, not an Acceptance run."""
    sha = _row_lock_sha(line.strip())
    return bool(sha and sha.group(2))


def _recorded_lock(vlog):
    """Lock parsed from the first TDD-red row, a recovery lock, or a later relock."""
    first_date = None
    first_red = None
    later_red_locks = []
    kind_rows = []
    for line, m in _vlog_machine_rows(vlog):
        if first_date is None:
            first_date = m.group("date")
        sha = _row_lock_sha(line)
        kind = sha.group(2) if sha else None
        if sha and kind:
            kind_rows.append((sha, line, kind))
        if m.group("exit") != "0":
            if first_red is None:
                first_red = line
                first_date = m.group("date")
            elif sha and not kind:
                later_red_locks.append(sha.group(1))
    if first_red is None:
        return first_date, None
    recovered = False
    kind = None
    if kind_rows:
        sha, lock_line, kind = kind_rows[-1]
    else:
        sha = _row_lock_sha(first_red)
        lock_line = first_red
        if not sha:
            # R3: the first red predates the lock writer. Take the first later
            # machine row that carries a trailing lock (any exit). Weaker than
            # first-red; later reds after that with a different sha still conflict.
            past = False
            for line, _m in _vlog_machine_rows(vlog):
                if not past:
                    if line == first_red:
                        past = True
                    continue
                other = _row_lock_sha(line)
                if other:
                    sha = other
                    lock_line = line
                    recovered = True
                    break
            if not sha:
                return first_date, None
    b64 = _LOCK_B64.search(lock_line) if sha else None
    parsed = decode_lock(b64.group(1)) if b64 else None
    # ADR-050: "done is refused … when a later red presents a different hash."
    # Kind rows are the done map (ADR-052), not a later-red conflict. A later
    # red with a different sha and no kind still conflicts.
    conflict = next((other for other in later_red_locks
                     if other != sha.group(1)), None)
    return first_date, {
        "digest": sha.group(1),
        "map": parsed,
        "conflict": conflict,
        "recovered": recovered,
        "kind": kind,
    }



def lock_findings(vlog, *, root, tests, label=""):
    """blocks and advice for a done claim against first-red hashes."""
    prefix = f"{label}: " if label else ""
    date, recorded = _recorded_lock(vlog)
    if recorded is None:
        missing = (
            f"{prefix}marked done but has no first-red test-lock-sha256 — "
            "UNPROVEN, not a skip of the lock; frozen at the first red — run "
            "adr-verify again so a later row can carry a recovery lock "
            "(weaker than first-red)"
        )
        if date is None or date < TEST_HASH_REQUIRED_FROM:
            return [], [missing + f" (advisory until {TEST_HASH_REQUIRED_FROM})"]
        return [missing + f" (required from {TEST_HASH_REQUIRED_FROM})"], []

    if recorded.get("conflict"):
        return [f"{prefix}a later red row carries a different first-red "
                f"test-lock-sha256 ({recorded['conflict'][:12]}… vs "
                f"{recorded['digest'][:12]}…) — done is refused"], []

    if recorded["map"] is None:
        return [f"{prefix}first-red test-lock-sha256 is present but the lock map "
                "could not be read — UNPROVEN"], []
    current = snapshot_lock(root, tests)
    recorded_map = recorded["map"]
    blocks = []
    advice = []
    if recorded.get("kind"):
        cmd = ("adr-verify --relock --replace-hashes"
               if recorded["kind"] == "replace" else "adr-verify --relock")
        advice.append(
            f"{prefix}lock map was taken by `{cmd}` — weaker than first-red")
    elif recorded.get("recovered"):
        advice.append(
            f"{prefix}first-red lock is recovered from a later row, not the "
            "first TDD-red — weaker than first-red evidence")
    rec_check = recorded_map.get("check")
    cur_check = current["check"]
    if rec_check == "unproven" or cur_check == "unproven":
        blocks.append(f"{prefix}.quality-harness.json check could not be read — UNPROVEN")
    elif rec_check == "absent" and cur_check is not None:
        blocks.append(f"{prefix}.quality-harness.json check was absent at first-red "
                      "and is now declared — done is refused")
    elif rec_check not in (None, "absent", "unproven") and cur_check is None:
        blocks.append(f"{prefix}.quality-harness.json check was locked and is now "
                      "absent — done is refused")
    elif rec_check not in (None, "absent", "unproven") and cur_check is not None:
        cur_hex = hashlib.sha256(cur_check.encode("utf-8")).hexdigest()
        if rec_check != cur_hex:
            blocks.append(f"{prefix}.quality-harness.json check string moved — done is refused")
    recorded_bodies = recorded_map.get("bodies") or {}
    recorded_unproven = recorded_map.get("unproven") or set()
    # R2: empty bodies + unproven is a pre-hasher artifact only for names the
    # hasher can now see. Still-unhashable names stay UNPROVEN (ADR-005: a
    # truncated regex / helper / ghost is not "the tool could not see the language").
    tool_blind = not recorded_bodies and recorded_unproven
    for key in recorded_unproven:
        rel, name = key
        if tool_blind and (rel, name) in current["bodies"]:
            advice.append(
                f"{prefix}Tests-table `{rel}`::{name} could not be hashed at "
                "first red — UNPROVEN; the lock hashed no bodies, so this is "
                "not evidence of tampering")
        else:
            blocks.append(
                f"{prefix}Tests-table `{rel}`::{name} could not be hashed — "
                "UNPROVEN, done is refused; frozen at the first red")
    for (rel, name), digest in recorded_bodies.items():
        now = current["bodies"].get((rel, name))
        if now is None:
            blocks.append(f"{prefix}locked test `{rel}`::{name} vanished — done is refused")
        elif now != digest:
            blocks.append(f"{prefix}locked test `{rel}`::{name} hash moved — done is refused")
    return blocks, advice


def lock_blocks_done(text, root):
    """True when is_done must withhold done because the lock does not hold."""
    log = sections_of(text).get("Verification Log", [])
    blocks, _advice = lock_findings(
        log, root=root, tests=tests_table_rows(text), label="")
    return bool(blocks)
