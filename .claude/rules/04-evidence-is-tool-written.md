---
paths:
  - "docs/adr/**"
  - "plugin/bin/adr-verify"
  - "plugin/bin/adr-lint"
  - "tests/**"
  - "scripts/mutate.mjs"
---

# Why §4: evidence is tool-written or it is not evidence

The rules are in `CLAUDE.md` §4. This file is the evidence behind them.

`adr-verify` runs the Acceptance fence itself, appends the date, git sha, exit code, displayed
command and a SHA-256 of the whole fence, and exits with the command's code. `adr-lint` rejects any
entry off-grammar and refuses a `done` row without a matching exit-0 entry.

```bash
python3 plugin/bin/adr-verify <task.md>
python3 plugin/bin/adr-verify <task.md> --mutant <file> --from <text> --to <text> --why <what this kills>
```

- A `done` row on a **Proposed** record is refused, correctly: it claims an unaccepted decision was
  executed. Leave the row `pending` with the reason and let the evidence stand.
- Changing an Acceptance fence invalidates every entry taken under the old one. That refusal is
  correct. Re-run on a clean tree; never edit a log.
- `adr-verify` dirties the tree by writing its own entry, so verifying several tasks in one pass
  marks all but the first dirty.
- `--why` is free prose inside a machine-formatted line, and it borrows the line's authority. On
  2026-09-04 an invented statistic nearly went in that way; the repair was to discard the uncommitted
  entries and re-run, never to edit the log.

**A GREEN mutation is a finding about the test.** On 2026-08-28 a mutation on a containment guard
came back GREEN because the assertion went through a caller where a *second* guard caught the same
input — the test was proving something other than what it named. Assert the mechanism, not a
downstream effect something else also covers. On 2026-09-04 a GREEN turned out to be a mechanism
declared against a test file that never asserted it — the assertion lived in
`tests/gate-regressions.py`, which the campaign cannot run at all (BACKLOG §119).

**A fix reported from outside gets its regression at the outermost callable boundary.** Verified
only by its own new assertions, a fix has been tested at the FUNCTION, not at the entry point the
report came in through. On 2026-08-29 that shipped twice in one hour: a BDD matcher that worked when
called directly and was unreachable in production, because the caller passed `code_only()` output
that had already deleted the name it searched for. The assertions were correct and green
throughout. Write the regression on a fixture in the reporter's language, through the same call the
report came through, or you have tested the patch instead of the bug (BACKLOG §57).

**Coverage cannot see a vacuous assertion.** `assert.deepEqual(uncovered(...), [])` against a
subject mutated to return `[]` passes at full line and branch coverage. Every check that returns a
"clean" answer must be shown capable of returning a dirty one, in the same test.
