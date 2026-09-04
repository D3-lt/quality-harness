---
paths:
  - "plugin/bin/**"
  - "plugin/scripts/**"
  - "scripts/**"
  - "tests/**"
---

# Why §8: a check must not depend on what is on your disk

The rule is in `CLAUDE.md` §8. This file is the evidence behind it.

`existsSync` over a repository path answers "is this on THIS machine", not "is this in the
repository". On 2026-08-28 a new check passed here and failed CI jobs on the same commit, because
it named a gitignored directory that exists on the laptop that ran the evals and on no fresh
checkout. Resolve repository paths against `git ls-files` (plus `--others --exclude-standard` for
files being added in the same commit), never against the filesystem.

The general form: **a gate whose answer depends on who is asking is not a gate.** Untracked build
output, a cached directory, a local tool on `PATH` — each one makes a green run mean something
different on every machine, and CI is where that gets discovered if you are lucky.
