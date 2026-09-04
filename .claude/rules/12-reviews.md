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
  hour. Always `< /dev/null`, and wrap it in a hard kill.
- **Scope it to the code that changed.** A diff dominated by renames is not reviewable; name the
  files whose semantics changed and ask numbered questions.
- **Give it a budget it can finish in, and read the exit code.** `gtimeout … codex exec` returning
  **124** is a KILL, not a clean pass — on 2026-09-04 a review died at its deadline having emitted
  one sentence naming defect classes and describing none of them. A killed review certifies
  nothing; those words were a lead, and each had to be reproduced by hand.
- **Forbid it from spawning another `codex exec`.** That same run burned its whole budget recursing
  into a nested one that could not start under the sandbox.
- **Reconcile every finding against source.** Neither accept nor dismiss one by authority.
