# ADR-102: A syntax finding at the edit reaches the agent

**Status:** Accepted
**Date:** 2026-10-14
**Owner:** zy
**Spec:** None — no spec stage; the owner chose this over removal on 2026-10-14, and the evidence is in Context
**Cross-references:** ADR-038, ADR-096, ADR-097, docs/specs/2026-09-09-a-staged-product-not-a-funnel.md, scripts/components.json
**Governs:** None — declared by its tasks
**Enforced-by:** ADR-102 T2: a syntax finding at the edit reaches the agent
**Invalidates:** None — spec facts F-33 and UC2-S5 (post-edit-check still runs on unclassified files) stay true; what changes is who hears it
**Served-path change:** after an Edit or Write, a syntax or lint finding from `post-edit-check.sh` is put into the agent's context; a clean file says nothing, where `php -l` and `ruff` used to print a success line to the transcript.

## Context

`plugin/scripts/post-edit-check.sh` runs after every native Edit, Write, MultiEdit and NotebookEdit (`plugin/hooks/hooks.json`, the
second PostToolUse entry) and checks the file it touched: `node --check` for JavaScript, `bash -n`, `jq empty`, `ruff check` or
`ast.parse` for Python, `php -l`. It exits 0 and prints its finding on stdout. ADR-097 measured that this output never reaches the
agent: Claude Code shows exit-0 PostToolUse stdout in the transcript view only, and `run-shell-hook.mjs:382-399` wraps only the
facts gate's output as `additionalContext`. ADR-097 deferred removing it because spec facts F-33 and UC2-S5 bind it.

Measured 2026-10-14 (BACKLOG §378, a throwaway clone, median of five, load 3.1 to 3.4 on 10 cores): the hook costs 28 to 75 ms per
edit. The component manifest (`scripts/components.json`) carries it as the one hook whose only consumer is text in the transcript.
The owner was offered three ways (wire it to the agent, delete it, leave it) and chose to wire it on 2026-10-14: a broken file is
then told to the agent at the edit that broke it, rather than at the next commit or turn end.

What the checkers print on a clean file, executed 2026-10-14 on this machine: `ruff 0.15.6 check --quiet` prints nothing and exits 0
(without `--quiet` it prints `All checks passed!`); `php -l` prints `No syntax errors detected in <file>` and exits 0, and on a
parse error prints the error and exits 255; `node --check`, `bash -n`, `jq empty` and `ast.parse` print nothing on a clean file. So
the output cannot be wired as it is: a Python or PHP edit would put a success line into the agent's context on every clean edit.

The class: every PostToolUse hook whose output is exit-0 stdout, enumerated with
`node -e 'for (const g of JSON.parse(require("fs").readFileSync("plugin/hooks/hooks.json","utf8")).hooks.PostToolUse) for (const k of g.hooks) console.log(k.args.join(" "))'`
(2026-10-14, three entries): the facts gate (already wrapped by `run-shell-hook.mjs`), `post-edit-check.sh` (this record), and
`lifecycle.mjs`, which answers in JSON through `deliver` and whose findings ADR-096 already says again at the next hook that reaches
the agent. This record takes the one member that is unwired.

## Existing Primitives Audit

- `run-shell-hook.mjs` already wraps the facts gate's exit-0 stdout as PostToolUse `additionalContext` (`:388-396`); the same branch
  takes a second script name. No new channel.
- `post-edit-check.sh` already says `UNRUN` when a checker could not look (`tests/post-edit-check.test.mjs`, "a checker that could
  not run is UNRUN, never a finding about the file"); that line is a finding about the run, and reaches the agent too.
- `scripts/components.json` declares each hook's consumer; the entry changes from `user-message` to `agent-context`.

## Decision

1. `post-edit-check.sh` prints only a finding or an `UNRUN` line, and nothing for a clean file: `ruff check --quiet`, and `php -l`'s
   output only when it exits non-zero. Its exit code stays 0 (advice, CLAUDE.md §3).
2. `run-shell-hook.mjs` hands `post-edit-check.sh`'s non-empty exit-0 stdout to the agent as PostToolUse `additionalContext`, as it
   does the facts gate's.

It fails if a clean edit of any handled file type prints anything, or if a broken file's diagnostic leaves the hook as plain stdout.

## Alternatives Considered

- **Delete the hook.** Rejected by the owner on 2026-10-14: the artifact pass and `qh-check` catch a broken file later, at the
  commit or turn boundary, and the agent loses the cheapest moment to hear it. It also needs F-33 and UC2-S5 retired.
- **Wire it as it is.** Rejected: on this machine a clean Python or PHP edit would say a success line to the agent on every edit,
  which is the always-on text CLAUDE.md §19 counts against every adopter.
- **Exit 2 on a finding,** which the host feeds to the model. Rejected: a non-zero PostToolUse exit reads as a hook failure, and
  this hook is advice (§3).

## Component / Boundary Impact

`plugin/scripts/post-edit-check.sh` and `plugin/scripts/run-shell-hook.mjs` change; no module is added or moved.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| PostToolUse output of `post-edit-check.sh` | plain stdout → `hookSpecificOutput.additionalContext` | T2 | the agent |
| `post-edit-check.sh` stdout on a clean file | a success line (ruff, php) → nothing | T1 | T2 |
| `scripts/components.json` | its consumer becomes `agent-context` | T2 | `tests/component-manifest.test.mjs` |

## Inter-task Contracts

T1 produces "stdout is empty for a clean file" (`post-edit-check.sh`), which T2 consumes: without it T2 would send a success line.

## Implementation

See `tasks/README.md`: T1 (quiet on a clean file), then T2 (the finding reaches the agent).

## Consequences

- **Positive:** a syntax error is told to the agent at the edit; the manifest loses its last text-only hook without a tool consumer.
- **Negative:** a finding costs the agent's context its diagnostic text (tails of 30 to 40 lines, as today).
- **Neutral:** the hook's cost per edit is unchanged; nothing is refused.

## Out of Scope

- Removing the hook, and retiring F-33 and UC2-S5 (permanent: boundary: the owner chose to wire it, 2026-10-14)
- TypeScript, Rust and Go, which the hook leaves to project checks (permanent: boundary: `post-edit-check.sh` says why, a per-edit debounce cannot bound a project-wide check)
- `lifecycle.mjs`'s PostToolUse findings (permanent: boundary: ADR-096 says them again at the next hook that reaches the agent)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The host merges two PostToolUse hooks' `additionalContext` differently from one | Low | Med | T2's human step: one live edit of a broken file, and the agent's context is read for both findings |
| A checker version that prints on success with `--quiet` | Low | Low | T1's test runs the real checker where it is installed and skips by name where it is not |

## Rollback

Revert the two task commits: the hook goes back to plain stdout. No persistent state changes.

## Follow-ups

- [ ] After a week of use, count from session logs how often an agent's next tool call after a post-edit finding touched the same file.

## Amendment (2026-10-14, the owner, after the cold review)

A cold read-only review of this record, run while T1 was executing, found that the hook names VALID files as broken, and each
was reproduced the same day: a `.cjs` file is parsed as an ES module (`require` plus a top-level `return`, valid CommonJS, is
"does not parse as an ES module"); JSX in a `.js` file "parses as neither a module nor a Workflow script"; a `tsconfig.json`
with comments is a `jq` parse error; a valid Python file prints Python 3.14's `SyntaxWarning`. Today these reach only the
transcript. Wired by T2, each would reach the agent on every edit of a correct file, and an agent that "fixes" a file valid for
its own toolchain is worse than one that hears nothing. Context above also names `node --check` for JavaScript; the hook runs
`workflow-parse.mjs` and says why it does not use `node --check` (`post-edit-check.sh`, its BACKLOG §161 comment).

The owner chose, offered three ways: **a finding is a syntax error, from a parser that is the file's own authority**, before
anything is wired (T3, which T2 now depends on).

3. `.mjs` keeps the ES-module parse; `.cjs` is checked by `node --check` (always CommonJS, so the §161 hazard of a `.js`
   with `export` cannot occur); `.js` and `.jsx` are not checked, because their dialect (ES module, CommonJS, Workflow
   script, JSX, Flow) cannot be known from the file. A JSON file `jq` refuses is named only when it does not parse as JSONC
   either (comments and trailing commas removed, strings kept), a test of the content rather than a list of names. Python is
   `ast.parse` with warnings off; `ruff` is dropped, because lint debt in a file the agent touched is not a syntax error.
   `.sh`, `.bash` and `.php` are unchanged.
4. Where this record says an `UNRUN` line is printed, that holds on the JavaScript parser's path only. A checker that is not
   installed (`jq`, `python3`, `php`, `node`) says nothing, and a file checked within five seconds of the same file is not
   checked again (the per-file debounce): silence after T2 means "nothing was found, or nothing looked", as it did before.
5. The Risks row about two hooks' `additionalContext` merging cannot be observed as written: the facts gate acts on Markdown
   records and this hook ignores them, so no edit draws output from both. T2's S3 observes the one thing it can: a finding from
   this hook in the agent's context.

T1's evidence locked the tests this changes, so T3 retakes T1's lock map with `adr-verify --relock --replace-hashes` after the
change is reviewed in the same commit, as ADR-091 and ADR-099 did with the owner's approval.
6. A finding names the edited file and gives the error alone (T4). An outside run over a repository we do not own
   (wcag-web, 2026-10-14) showed two shapes an agent cannot act on well: `jq`'s error names no file
   (`jq: parse error: Unmatched '}' at line 1, column 7`), and Python's finding was an eleven-line traceback through
   `<string>` and the interpreter's own `ast.py` before the error.
