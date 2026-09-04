---
paths:
  - "plugin/bin/**"
  - "plugin/scripts/**"
  - "scripts/**"
---

# Why §3: gates instruct; they never block

The rule is in `CLAUDE.md` §3. This file is the evidence behind it.

In `plugin/bin/adr-lint`, `errors.advise(...)` is advisory and `errors.append(...)` is blocking —
moving something between them is a real behavioural change, not a formatting choice.

The reason is not politeness. A blocked agent produces a user who cannot tell what to do next, which
is worse than not having the plugin at all. Say what is wrong and let the work proceed.

The corollary — a gate must never report an observation it did not make — is ADR-005. A filter that
matched nothing is "I could not look", not "the thing is absent"; a subprocess that failed to start
is not a failing check; a parse failure is not a content finding. Several instances of this shipped
in one day before the record was written. If a check cannot determine something, it says so —
`UNRUN`, `PARTIAL`, `UNPROVEN` — and never borrows the vocabulary of a verdict. On 2026-09-04 the
same defect appeared inside code written to fix an ADR-005 violation: `Path.glob` swallows
`OSError`, so an unreadable record read as an empty one and "nothing is ready" was reported as a
verdict from a directory nothing had looked inside.
