---
paths:
  - "plugin/bin/**"
  - "plugin/scripts/**"
  - "plugin/skills/codex-review/**"
  - "plugin/skills/codex-advise/**"
  - "scripts/**"
---

# Why §12: reviews

The rules are in `CLAUDE.md` §12. This file is the evidence behind them.

The standing rule — a substantive change gets a different-lineage review before the tag — was set by
the owner on 2026-09-04, and its reason is measured rather than assumed: on this repository every
recent Codex pass has found real defects, each in code written the same day to fix the same class.
On the day the rule was set it fired on its first change and found regressions the author's own
tests had missed, including one the author had written an invariant for in the same wrong words as
the bug. A session reviewing its own fresh work is the worst reviewer of it available.

A clean pass is one reviewer's silence, not a verdict, and never substitutes for the gate or the
campaign.

## Operational notes, learned the hard way

- **Redirect stdin.** `codex exec` blocks on an open stdin and hangs indefinitely with no output —
  on 2026-08-28 it printed `Reading additional input from stdin...` and sat idle for well over an
  hour. The plugin's one launcher, `plugin/scripts/host-review.mjs` (ADR-098 T1), closes stdin and kills
  the run at its budget for every review the skills start; a `codex exec` run by hand still needs
  `< /dev/null` and a hard kill.
- **Scope it to the code that changed.** A diff dominated by renames is not reviewable; name the
  files whose semantics changed and ask numbered questions.
- **Give it a budget it can finish in, and read the exit code.** `gtimeout … codex exec` returning
  **124** is a KILL, not a clean pass — on 2026-09-04 a review died at its deadline having emitted
  one sentence naming defect classes and describing none of them. A killed review certifies
  nothing; those words were a lead, and each had to be reproduced by hand.
- **Forbid it from spawning another `codex exec`.** That same run burned its whole budget recursing
  into a nested one that could not start under the sandbox.
- **Reconcile every finding against source.** Neither accept nor dismiss one by authority.

## The launcher and its record (ADR-100, 2026-10-13)

The rules above are what `plugin/scripts/host-review.mjs` now does, so §12 points at it rather than restating them: stdin
closed, a hard kill at `CODEX_TIMEOUT_MS`, the model pinned in `CODEX_MODEL`, and the contract's leaf instruction forbidding
a nested `codex exec`. What it adds is the record: every run it starts appends `{base, head, exact, status}` to
`reviews.jsonl`, and `release-evidence` reads it. Before that, whether a review ran before a tag was prose; v3.8.22's
release took 34 tool calls between its bump and its tag (measured 2026-10-13 over that session's transcript), and none of
them asked whether the review had covered every commit.
