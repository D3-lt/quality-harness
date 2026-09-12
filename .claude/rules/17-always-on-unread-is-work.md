---
paths:
  - "plugin/scripts/lifecycle.mjs"
  - "plugin/scripts/statusline.mjs"
  - "plugin/scripts/branch-state.mjs"
  - "plugin/hooks/hooks.json"
---

# Why §17: always-on unread output is work we action

The rule is in `CLAUDE.md` §17. This file is the evidence behind it.

**2026-09-12, field.** An adopting session (wcag) still was not reading two always-on dumps whose
content had not changed for most of the session: the `UserPromptSubmit` branch-state `--brief`
line, and a recalled-memory block the host injects. Under the unread-advice corollary they had
to say so rather than skip. The same Stop then listed as changed paths a Claude scratchpad under
`/private/tmp`, a home `.claude/` file, and `<Bash mutation: adr-verify --help …>` / a `printf`
into memory, and led with `Run \`make test\` (this project's own check)` for a command inferred
from a Makefile. The reader skipped the buried "inferred" caveat. Classify-and-skip was the
defect; the instruction is now: state the class plainly and action it.

What this plugin owns:

- **Stop / PreToolUse `Changed paths include`.** Only proven repository paths. A `<…>` stand-in,
  a home path, and a host scratchpad are could-not-look, not a write. Still Advise.
- **Inferred `check`.** Do not call it the project's own check. Lead with undeclared.
- **Unchanged brief branch-state.** Reprint when the line changes or CI is in alarm. SessionStart
  still prints the full form once. This plugin does not emit a palace dump; a host recalled-memory
  block that did not change is the same reader class.

What needs a human decision this turn cannot invent: Accept a Proposed record; push a release
(`CLAUDE.md` §13). Name that leftover as the action waiting, do not skip it as noise.
