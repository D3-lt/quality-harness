#!/usr/bin/env python3
"""The record grammar: how a gate finds a `## ` section, normalizes an Acceptance
fence, and hashes it. One definition, loaded by every gate that reads records.

Shared since 2026-09-11 (ADR-045). Until then these three functions were COPIED
into the gates — `sections_of` five times, `normalize_acceptance` three times,
`acceptance_digest` twice — and one copy had drifted: `adr-next` carried a
`sections` with no code-fence toggle, so a task whose Acceptance fence held a
line beginning `## ` read as two sections there and one everywhere else. Its
digest then differed from the one `adr-verify` wrote, and a verified task read as
unverified with nothing said.

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
    "normalize_acceptance",
    "acceptance_digest",
]


def sections_of(text):
    """`## ` sections of a Markdown record: heading → its lines, fence-aware.

    A line starting with ``` toggles a code fence, and a `## ` line inside one
    is text, not a heading — an Acceptance fence that writes a task file through
    a heredoc, or a bash comment beginning `## `, is the case. A repeated heading
    resets its section rather than appending to it, and `## ` needs the single
    space every gate has always required.
    """
    out, cur, fence = {}, None, False
    for line in text.splitlines():
        if line.lstrip().startswith("```"):
            fence = not fence
        m = None if fence else re.match(r"^## (.+?)\s*$", line)
        if m:
            cur = m.group(1)
            out[cur] = []
        elif cur is not None:
            out[cur].append(line)
    return out


def normalize_acceptance(raw):
    """Canonical Acceptance text — the bytes the digest is taken over.

    Normalize line endings and remove only blank lines adjacent to the Markdown
    fence. Shell-significant indentation and internal blank lines stay intact.
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
