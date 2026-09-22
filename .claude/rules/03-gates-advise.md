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

The other failure from the same split: because advice does not block, a reader
decides the class is skippable and stops reading it. That is not the gate
instructing. It is the finding going unread. Field 2026-09-12: always-on advise
and a repeated pre-commit warning were treated as noise; a lineage rule in that
stream went unnoticed across a run of commits. Classify each line, or name it
dangling. Do not grep it away. Moving a finding from advise to append remains a
behaviour change (this section's first paragraph); this corollary does not move
any finding.

The same class includes always-on dumps a reader skips after one look: an unchanged
branch-state brief, a host recalled-memory block, invented Stop paths, an inferred
check called the project's own. Those are work we action (`CLAUDE.md` §17), not
noise. Dangling is only for a leftover that needs a human decision.

The corollary — a gate must never report an observation it did not make — is ADR-005. A filter that
matched nothing is "I could not look", not "the thing is absent"; a subprocess that failed to start
is not a failing check; a parse failure is not a content finding. Several instances of this shipped
in one day before the record was written. If a check cannot determine something, it says so —
`UNRUN`, `PARTIAL`, `UNPROVEN` — and never borrows the vocabulary of a verdict. On 2026-09-04 the
same defect appeared inside code written to fix an ADR-005 violation: `Path.glob` swallows
`OSError`, so an unreadable record read as an empty one and "nothing is ready" was reported as a
verdict from a directory nothing had looked inside.

## The one sanctioned refusal, and why it has an off switch

On 2026-09-22 the owner accepted ADR-061: a command naming commit or push, on a tree no `qh-check`
has passed on, is refused when the session log was read whole. The reason is the one this section
was written against, seen from the other side. A warning is advice, and a model that has learned
to skip advice still publishes. That is the "unread output" failure above, and it reaches a remote.

The cost of a refusal was paid within an hour of it going live. This repository's working tree is
the plugin every session on the machine loads, so a peer session met the refusal before any
release. It was denied a correct commit after a passing check, on every retry. The cause was the
index being looked up among checked trees; that is fixed, and only the tree can refuse now. The
session that fixed it was refused once too, by a heredoc whose body contained the word "commit".
That false refusal is kept by the owner's choice, because narrowing it needs command parsing, which
ADR-060 retired.

So the exception comes with its own rule: **a refusal needs an Accepted record and an opt-out.**
Here the opt-out is `"publish": "warn"` in `.quality-harness.json`. Only that exact value counts;
any other value is reported as ignored and keeps the refusal, so a typo cannot silently turn it
off. Every could-not-look — a torn log, an unordered check, a check that timed out or could not
observe its tree, a root git would not name — warns and never refuses (ADR-005).
