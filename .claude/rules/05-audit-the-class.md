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

## The class includes the change you are writing

Measured 2026-09-08. `plugin/scripts/lifecycle.mjs:1026` carries this comment, from a live report on
2026-08-26:

> `(?<![-\w])` not `\b`: a hyphen is a word boundary, so `--rm` matched the `rm` command.

The instance was fixed there. The class was never swept. Four months of that comment sitting in the
repository did not stop the same author writing `go\s+test\b` into `plugin/bin/adr-lint` two files
away, where it matched `go test-helper`, `cargo test-fuzz run` and `node --test-reporter=x` — each
then classified as a MEASURED runner, which is the half that permits a blocking failure (BACKLOG
§179).

So §5 is not only about the members of the bug you are closing. Before adding a pattern over command
names or paths, grep this repository for prior art on that exact hazard — the lesson is usually
already here, written by someone who paid for it, in a file you were not planning to open.
