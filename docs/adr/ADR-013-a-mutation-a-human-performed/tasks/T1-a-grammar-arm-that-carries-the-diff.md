# Task ADR-013-T1: Add the human-observed arm to the Mutation Log grammar

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** `MLOG_HUMAN_RE` — the row shape a human-observed mutation entry must match
**Consumes:** none
**Data dependency:** hermetic

## Goal

`adr-lint` accepts a Mutation Log row that records a human-performed mutation, and refuses one that
omits the file, the change or the failing test.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | `MLOG_RE` gains the arm; `check_task` is what SELECTS it, since that is where Mutation Log rows are matched |
| `tests/gate-regressions.py` | edit | the shape assertions, both directions |
| `tests/mutations.json` | edit | the catalogue entry that proves the arm can be broken |

## Ordered Steps

1. Write the failing test first: a row reading `- <date> · human-observed · mutant killed · test exit <N> · `<file>` · line <N> · from `<text>` · to `<text>` · test `<name>` · <why>` must PARSE, and six malformed variants (no test name, no from/to, no line number, a bare verdict, an empty why, a kill claimed on `test exit 0`) must NOT. Confirm red.
   **Shape revised 2026-08-30, before any row existed**, on evidence from wcag-43 — the session that reported §74 and holds the only real instance. Three changes: `from`/`to` are Markdown code spans of variable delimiter length, because 26 of this repository's 345 tool mutations contain a backtick and the languages where that is routine (Go raw strings, JS template literals, shell, Markdown) are what this plugin ships to; `line <N>` is carried because from-text alone is not unique in a file (`return nil` identifies nothing) and a row that parses while being unreproducible is the exact property the refusals exist to prevent; and `test exit <N>` records what the person actually observed, spelled differently from the tool arm's `exit <N>` because that one is the ACCEPTANCE FENCE's code and this fence is the thing that cannot run — same number, different observation, so it does not borrow the other's vocabulary.
2. Add the arm to `MLOG_RE`, keeping the three tool-run arms unchanged so an existing row still parses byte for byte.
3. Add the catalogue entry and confirm it comes back RED against the test file that drives `check_task`, not against the regex directly.

## Acceptance

```bash
set -o pipefail
python3 tests/gate-regressions.py plugin/bin plugin/skills/postmortem/SKILL.md . 2>&1 | tee /tmp/acc-t1.out && ! grep -qE "no tests to run|^FAIL" /tmp/acc-t1.out
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `a human-observed mutation row carries its diff and its failing test` | `tests/gate-regressions.py` | the arm parses a complete row and refuses each incomplete one | — |
| `an existing tool-written mutation row parses unchanged` | `tests/gate-regressions.py` | the three original arms are untouched | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the parse assertions |
| 2 — something selects it | `check_task` matching Mutation Log rows through `MLOG_RE`, proved by the catalogue mutation |
| 3 — the caller can discover it | the row shape is documented in `adr-lint`'s usage text, which is what an author reads before writing one |
| 4 — it is used | nothing measures this yet — T3's template note is what would make an author reach for it |

## Mutation Log

## Invariants

- A tool-written row that parses today parses identically after this change.
- A row missing the file, the from/to or the test name is refused, not advised — an incomplete claim is not a weaker claim, it is an unreproducible one.

## Risks

- Widening `MLOG_RE` loosens a grammar two gates share. Mitigated by asserting the existing arms unchanged in the same test.

## Stop Condition

Stop if the arm cannot be added without changing how an existing row parses. That would mean the
grammar needs a version rather than an arm, which is a different decision.

## Out of Scope

- Writing the row. (deferred: this record's T2)
- Deciding whether such a row counts as the `mutant killed` a `done` task needs. (deferred: this record's T3)

## Verification Log
