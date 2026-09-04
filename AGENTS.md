# Agent instructions

**Read [`CLAUDE.md`](CLAUDE.md) in this directory before changing anything.** It is the rulebook
for this repository, and the evidence behind each rule is in `.claude/rules/`, one file per section.
This file exists because Codex and other harnesses look for `AGENTS.md`; a second full copy would be
the two-copies-drift failure this project has accepted decisions about (ADR-001, ADR-004).

The rules whose cost of missing is not a wasted hour are repeated here:

- **`plugin/` is the product; everything above it is the work that produces it and never ships.**
  In the tests, `repoRoot` is the repository and `root` is the plugin — different directories.
- **Never commit while a gate is red, and never pipe a gate.** `bash scripts/selftest.sh` must exit
  0 after your last edit. `| tail` and `|| true` hide the exit code. Never chain a commit after a
  test in one command.
- **Call a gate by its working-tree path, never its bare name.** `adr-lint` on `PATH` runs an
  installed release, not your edit. Use `python3 plugin/bin/adr-lint`, `node plugin/scripts/…`.
- **Nothing personal reaches GitHub.** Public repository; it publishes its own corpus. Never write
  an absolute home path anywhere tracked. `git status --short` before every push, and read it.
- **Paths are where platforms break.** CI blocks on Windows, macOS and Linux. Normalize both
  separators before any structural test on a path; never write a separator into a literal you will
  compare; any file matched across a line boundary needs `text eol=lf`, asserted via
  `git check-attr`; make the platform a parameter. You cannot run Windows locally.
- **Evidence is tool-written.** `## Verification Log` and `## Mutation Log` are written by
  `adr-verify`, never by hand. A GREEN mutation is a finding about the test.
- **A gate never reports an observation it did not make.** Could-not-look is its own word, never a
  verdict.
- **No counts in the instruction files.** Run something if you want to know how many.

Everything else — and the measurements behind all of the above — is in `CLAUDE.md` and
`.claude/rules/`.
