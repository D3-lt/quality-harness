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
    "first_red_lock_suffix",
    "lock_findings",
    "lock_blocks_done",
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
)
TEST_LOCK_FIELD_ANON = (
    r"(?: · test-lock-sha256:[0-9a-f]{64})?"
    r"(?: · test-lock-b64:[A-Za-z0-9_-]+)?"
)
_LOCK_SHA = re.compile(r"test-lock-sha256:([0-9a-f]{64})")
_LOCK_B64 = re.compile(r"test-lock-b64:([A-Za-z0-9_-]+)")
_MACHINE = re.compile(
    r"^- (?P<date>\d{4}-\d{2}-\d{2}) · (?:[0-9a-f]{4,64}\*?|no-git) · "
    r"exit (?P<exit>\d+) · `"
)
_BDD_NAME = re.compile(
    r"""(?:\b(?:it|test)\s*\()\s*(['"`])([^'"`\n]+)\1\s*,"""
)
CONFIG_NAME = ".quality-harness.json"


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
    """Whether any Verification Log line already carries the first-red lock."""
    log = "\n".join(sections_of(text).get("Verification Log", []))
    return bool(_LOCK_SHA.search(log))


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


def body_digest(body, python=False):
    """SHA-256 of comment-stripped, whitespace-collapsed body; strings kept."""
    text = body.replace("\r\n", "\n").replace("\r", "\n")
    if python:
        text = re.sub(r'"""(?:.|\n)*?"""', " ", text)
        text = re.sub(r"'''(?:.|\n)*?'''", " ", text)
    text = _strip_comments_keep_strings(text, python=python)
    lines = []
    for line in text.split("\n"):
        collapsed = re.sub(r"[ \t]+", " ", line).strip()
        if collapsed:
            lines.append(collapsed)
    return hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest()


def _strip_comments_keep_strings(text, python=False):
    out, i, n, quote = [], 0, len(text), None
    while i < n:
        c = text[i]
        if quote:
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if c == quote:
                quote = None
            i += 1
            continue
        if c in "'\"`" and not (python and c == "`"):
            quote = c
            out.append(c)
            i += 1
            continue
        if not python and c == "/" and i + 1 < n:
            nxt = text[i + 1]
            if nxt == "/":
                i += 2
                while i < n and text[i] != "\n":
                    i += 1
                continue
            if nxt == "*":
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
        out.append(c)
        i += 1
    return "".join(out)


def extract_test_names(text, python=False):
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
    names, seen = [], set()
    for match in _BDD_NAME.finditer(text):
        start = text.rfind("\n", 0, match.start()) + 1
        if re.match(r"\s*(?://|#)", text[start:match.start()]):
            continue
        name = match.group(2)
        if name not in seen:
            seen.add(name)
            names.append(name)
    return names


def extract_test_body(text, name, python=False):
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
    bdd = re.search(
        r"""(?:\b(?:it|test)\s*\()\s*(['"`])""" + re.escape(name) + r"""\1\s*,""",
        text)
    if not bdd:
        return None
    start = text.rfind("\n", 0, bdd.start()) + 1
    if re.match(r"\s*(?://|#)", text[start:bdd.start()]):
        return None
    brace = text.find("{", bdd.end())
    if brace == -1:
        return None
    depth = 0
    for j in range(brace, len(text)):
        if text[j] == "{":
            depth += 1
        elif text[j] == "}":
            depth -= 1
            if depth == 0:
                return text[brace:j + 1]
    return text[brace:]


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
        python = path.suffix == ".py"
        for name in extract_test_names(source, python=python):
            body = extract_test_body(source, name, python=python)
            if body is None:
                if (rel, name) in named:
                    unproven.add((rel, name))
                continue
            bodies[(rel, name)] = body_digest(body, python=python)
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
    return {"check": check, "bodies": bodies, "unproven": unproven}


def first_red_lock_suffix(text, root):
    """Suffix for the first TDD-red row, or empty when a lock already exists."""
    if vlog_has_test_lock(text):
        return ""
    digest, token = encode_lock(snapshot_lock(root, tests_table_rows(text)))
    return f" · test-lock-sha256:{digest} · test-lock-b64:{token}"


def _recorded_lock(vlog):
    """Lock parsed from the first TDD-red row, else (date, None)."""
    first_date = None
    first_red = None
    for line in vlog:
        line = line.strip()
        m = _MACHINE.match(line)
        if not m:
            continue
        if first_date is None:
            first_date = m.group("date")
        if m.group("exit") != "0" and first_red is None:
            first_red = line
            first_date = m.group("date")
    if first_red is None:
        return first_date, None
    sha = _LOCK_SHA.search(first_red)
    b64 = _LOCK_B64.search(first_red)
    if not sha:
        return first_date, None
    parsed = decode_lock(b64.group(1)) if b64 else None
    return first_date, {"digest": sha.group(1), "map": parsed}


def lock_findings(vlog, *, root, tests, label=""):
    """blocks and advice for a done claim against first-red hashes."""
    prefix = f"{label}: " if label else ""
    date, recorded = _recorded_lock(vlog)
    if recorded is None:
        missing = (
            f"{prefix}marked done but has no first-red test-lock-sha256 — "
            "UNPROVEN, not a skip of the lock"
        )
        if date is None or date < TEST_HASH_REQUIRED_FROM:
            return [], [missing + f" (advisory until {TEST_HASH_REQUIRED_FROM})"]
        return [missing + f" (required from {TEST_HASH_REQUIRED_FROM})"], []

    if recorded["map"] is None:
        return [f"{prefix}first-red test-lock-sha256 is present but the lock map "
                "could not be read — UNPROVEN"], []
    current = snapshot_lock(root, tests)
    recorded_map = recorded["map"]
    blocks = []
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
    for key in recorded_map.get("unproven", set()):
        rel, name = key
        blocks.append(f"{prefix}Tests-table `{rel}`::{name} could not be hashed — "
                      "UNPROVEN, done is refused")
    for (rel, name), digest in recorded_map.get("bodies", {}).items():
        now = current["bodies"].get((rel, name))
        if now is None:
            blocks.append(f"{prefix}locked test `{rel}`::{name} vanished — done is refused")
        elif now != digest:
            blocks.append(f"{prefix}locked test `{rel}`::{name} hash moved — done is refused")
    return blocks, []


def lock_blocks_done(text, root):
    """True when is_done must withhold done because the lock does not hold."""
    log = sections_of(text).get("Verification Log", [])
    blocks, _advice = lock_findings(
        log, root=root, tests=tests_table_rows(text), label="")
    return bool(blocks)
