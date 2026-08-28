# Agent instructions

**Read [`CLAUDE.md`](CLAUDE.md) in this directory before changing anything.** It is the single source
of truth for how work is done here, and it is not long. This file exists because Codex and several
other harnesses look for `AGENTS.md`; keeping a second full copy would be the two-copies-drift
failure this project has two accepted decisions about (ADR-001, ADR-004).

Five rules are repeated here because the cost of missing one is not a wasted hour:

1. **`plugin/` is the product; everything above it is the work that produces it and never ships.**
   `.claude-plugin/marketplace.json` decides that with one field. In the tests, `repoRoot` is the
   repository and `root` is the plugin — they are different directories.

2. **Never commit while a gate is red, and never pipe a gate.** `bash scripts/selftest.sh` must exit
   0 after your last edit. `| tail` and `|| true` hide the exit code. Do not chain a commit after a
   test in one command.

3. **Call a gate by its working-tree path, never its bare name.** `adr-lint` on `PATH` runs the last
   released plugin, not your edit. Use `python3 plugin/bin/adr-lint`, `node plugin/scripts/…`.

4. **Nothing personal reaches GitHub.** This repository is public and publishes its own corpus.
   Never write an absolute home path into a commit message, a record, a comment or a fixture —
   describe it or assemble it at runtime. `git status --short` before every push, and read it.

5. **Three platforms, and paths are where they break.** This ships to Windows, macOS and Linux and
   CI blocks on all three. Normalize both separators before any structural test on a path — a
   traversal spelled `..\dir\file` is invisible to `split("/")`, and a guard that misses it reports
   safety it never checked. Never write a separator into a literal you will compare. Any file matched
   across a line boundary needs `text eol=lf` in `.gitattributes`, asserted by asking `git
   check-attr`. Make the platform a parameter (`resolve_bash(platform=…)`) — a Windows-only branch
   with no injectable seam has no test, and you cannot run Windows locally. `CLAUDE.md` §7 lists the
   five real defects this rule is made of.

6. **Evidence is tool-written.** `## Verification Log` and `## Mutation Log` are written by
   `adr-verify` and never by hand. A GREEN mutation is a finding about the test, not an invitation to
   choose an easier mutant.

Everything else — the two-roots split, what moves silently when files move, why gates advise and
never block, Windows, the class sweep, the release steps — is in `CLAUDE.md`.
