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
import hashlib
import re

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
    """Whether `line` closes a fence opened with `opened` = `(marker_char, length)`."""
    m = _FENCE.match(line)
    return (m is not None and m.group("marker")[0] == opened[0]
            and len(m.group("marker")) >= opened[1] and not m.group("rest").strip())


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

    Lines are split with `str.splitlines()`, so every separator Python treats as
    a line break — `\\n`, `\\r\\n`, `\\r`, and also VT, FF, FS, GS, RS, NEL, LS and
    PS — ends a line, and a reader that joins the lines back with `\\n` has turned
    each of them into `\\n`. Files this gate reads arrive with CR/CRLF already
    folded; the eight others are a documented behaviour of the shared grammar,
    not an accident of one reader.
    """
    return _scan(text)[0]


def _scan(text):
    """The one walk: `(sections, open_fence)`.

    `sections` is what `_sections` documents. `open_fence` is None when every
    fence closed, else `(line_number, opener_line)` for the fence still open at
    the end of the text — the 1-based line and its text, for a gate that wants to
    name it. Callers do not resolve an open fence: every heading after it is
    text, and a reader that guessed where it should have closed would be reading
    a record that does not exist (ADR-045 T8).
    """
    out, cur, fence, pos, lineno = [], None, None, 0, 0
    for raw in text.splitlines(keepends=True):
        start, pos = pos, pos + len(raw)
        lineno += 1
        line = raw.splitlines()[0]
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
    return section if isinstance(section, list) else section.splitlines()


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
            return line.strip()
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
    are removed. Shell-significant indentation and internal blank lines stay
    intact. The section this text came out of was already read line by line
    (`_sections`), so any other Unicode line separator inside the fence has
    become `\\n` before it arrives here; nothing else about the command changes.
    The writer (`adr-verify`), the verifier (`adr-lint`) and the reader
    (`adr-next`) hash exactly these bytes.
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
