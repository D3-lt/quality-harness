---
paths:
  - "tests/**"
---

# Why §9: tests must not touch the repository they are testing

The rule is in `CLAUDE.md` §9. This file is the evidence behind it.

A test that spawns `git` in a directory it did not itself create is one typo away from committing to
this repository. On 2026-08-28 a blanket rename bound the `git -C <temp repo>` helpers to the real
repository root; the suite created commits and a branch on `main`. Give the temp-directory variable
and the repository-root constant clearly different names, and never let a rename cross that line
unexamined.
