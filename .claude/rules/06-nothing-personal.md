---
paths:
  - "docs/**"
  - "tests/**"
  - "plugin/**"
  - ".github/**"
---

# Why §6: nothing personal reaches GitHub

The rules are in `CLAUDE.md` §6. This file is the evidence behind them.

This is a public repository and it publishes its own corpus.

- `tests/package.test.mjs::nothing tracked in this repository names a personal filesystem path`
  reads everything `git ls-files` returns and must stay green.
- Assemble a home path at runtime the way the fixtures do (`"/".join(("", "home", "alice"))`).
  BACKLOG §42 tripped on exactly this, and so did a fixture written the same day to test the
  redaction.
- `adr-verify` redacts this machine's home from anything it writes into a task file — both separator
  spellings, case-insensitively where the filesystem is. Do not rely on it as the only line.
- The results directory under `plugin/evals/` is gitignored and stays that way.
