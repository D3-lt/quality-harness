---
paths:
  - "docs/adr/**"
  - "docs/BACKLOG.md"
---

# Why §5: audit the class, not the instance

The rule is in `CLAUDE.md` §5. This file is the evidence behind it.

A fix that lands is one member of a set. A sweep that found nothing is worth recording; a sweep
nobody ran must not read like one. A sweep that did not work is worth recording too: on 2026-09-04
a heuristic over the mutation catalogue flagged a tenth of the entries and nearly all were correct
tests asserting at a CLI boundary — recorded in BACKLOG §119 so the next session does not re-derive
it. Siblings you leave are new tasks, named in the record.
