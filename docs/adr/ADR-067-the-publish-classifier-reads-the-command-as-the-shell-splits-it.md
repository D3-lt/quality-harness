# ADR-067: The publish classifier reads a command as the shell splits it

**Status:** Accepted
**Date:** 2026-09-27
**Owner:** Zy
**Spec:** None — no spec stage; BACKLOG §301 Stage 3, scoped by the owner on 2026-09-27 to what git's hook does not decide
**Cross-references:** docs/adr/ADR-061-an-unchecked-publish-is-refused.md, docs/adr/ADR-066-git-refuses-an-unchecked-publish.md, docs/adr-archive/ADR-056-a-quoted-separator-is-not-a-joiner.md, docs/BACKLOG.md, docs/research/2026-09-26-model-out-of-the-loop.md, CLAUDE.md
**Governs:** plugin/scripts/lifecycle.mjs, plugin/scripts/shell-words.mjs, plugin/scripts/publish-command.mjs
**Enforced-by:** `tests/shell-words.test.mjs::the lexer's argv is the argv the shell hands git`
**Invalidates:** ADR-066 — its Alternatives line "A zero-dependency shell lexer (BACKLOG §301 Stage 3 as first planned). Rejected." That rejection stands as a replacement for git's hook; this record adopts the lexer only as the reader for the text refusal that ADR-066 keeps (every unarmed session, every PowerShell call, and every armed command its grammar cannot prove plain). ADR-066's own decision is unchanged.
**Served-path change:** PreToolUse rule P stops refusing a command whose `git commit` / `git push` is only data (quoted text, a heredoc body, `eval`'s joined `--help`), and starts refusing a brace-built invocation (`git {-c,x=y} push`) it never matched.

## Context

ADR-061 refuses an unchecked publish from a command's text. ADR-066 moved the refusal to git's own hook where the session is ARMED, and kept the text refusal everywhere else. Where that text refusal still decides:
- a session whose git is below 2.54 (Ubuntu 24.04 ships 2.43, Debian 12 2.39; ADR-066 Context);
- every PowerShell call;
- an armed session's command that ADR-066's grammar (`leavesHookInPlace`) cannot prove plain. The grammar returns false for any `$`, backtick, brace or glob in the command.

The text refusal is a set of regexes (`PUBLISH_START`, `PUBLISH_SHELL_C`, `PUBLISH_EXE`, `PUBLISH_OPTS`, `PUBLISH_COMMAND` and five helpers in `lifecycle.mjs`). It carries a pinned list of known false refusals, `KNOWN_FALSE_REFUSALS` in `tests/publish-command.test.mjs`: seven rows, each correct work that is refused.

Measured 2026-09-27, bash 3.2.57 and git 2.55.0 on macOS, with `publishCommandIn` at 826ec94:

| Command | What the shell runs | Classifier today |
|---|---|---|
| `git {-c,x=y} push` | `git -c x=y push` (git's own `key does not contain a section: x` proves the expansion) | null — a publish it does not see |
| `eval "git push" "-h"` | `git push -h`, which prints help | `git push` — refused |
| `echo "example; git push"` | `echo` | `git push` — refused |
| `cat <<'EOF'` / `git push` / `EOF` | `cat` | `git push` — refused |

The same day, in an ARMED session (this record's author's), two probe commands were refused by rule P: one wrote a heredoc naming `git push` into a scratch file, the other put a fake `git` on `PATH`. Each carried a `$`, so the grammar could not prove it plain and the text refusal decided. Neither published anything. The work had to move into files, which is the route around the refusal that BACKLOG §269 records.

Cost, measured the same run: `publishCommandIn` averages 2.1 µs per call over the 385 string literals of `tests/publish-command.test.mjs`, 20 passes.

ADR-066 T3 already tokenizes: `hookSegments` splits words, quotes, escapes, operators and heredoc bodies for the armed grammar. So this record does not add a second reader of shell text. It replaces two partial ones with one.

**The graveyard, read.** ADR-056 ("a quoted separator is not a joiner") was withdrawn; it governed the ADVISORY joiner rules that ADR-060 retired, not the refusal. ADR-066 rejected a lexer as the REPLACEMENT for a git hook, for reasons that still hold: text cannot see a script file, and cannot say which repository a command commits into. Neither is claimed here.

The class, every reader of shell text that decides rule P, enumerated with:

```bash
grep -n "PUBLISH_[A-Z_]* = \|function hookSegments\|function shellRuns\|function quotedStringEnd\|function plainPublishes\|function segmentVerdict" plugin/scripts/*.mjs
```

Run 2026-09-27: 20 lines, all in `plugin/scripts/lifecycle.mjs`. Left out on purpose:
- `mentionsCommitOrPush` (advisory, never refuses, CLAUDE.md §3);
- `plugin/bin/adr-lint`'s fence reader, which is Python, judges runners not publishes, and has its own measured tables (CLAUDE.md §16).

## Existing Primitives Audit

- **`hookSegments()`** (ADR-066 T3) is the nearest primitive. It becomes the lexer, moved to its own module and completed; its caller `plainPublishes` keeps its verdicts row for row (T3).
- **`shellRuns()`** stays: the measured `-n` / `noexec` rule for a shell's `-c` string, now applied to lexed argv instead of a regex group.
- **`publishCommandIn()` / `containsCommitOrPush()`** keep their signatures and return value, so `publishVerdict`, rule P and the tests call them unchanged.
- **The tables in `tests/publish-command.test.mjs`** are the acceptance, as §301 planned.

## Decision

1. **One lexer, `plugin/scripts/shell-words.mjs`, zero dependencies.** `shellWords(text)` returns the simple commands the POSIX shell would run, in order, each as:
   - `argv`: the words after quote removal, escapes and brace expansion (comma lists, nested);
   - `assignments`: the leading `NAME=value` words;
   - `dynamic`: the indices of words holding an unquoted `$`, a backtick, a glob or a `{a..b}` range, whose run-time value the text does not fix;
   - `heredocs`: each body with its delimiter, whether the delimiter was quoted, and the command it feeds;
   - `substitutions`: the text of each `$(…)` and backtick span, lexed the same way;
   - per word, its provenance: which spans were quoted, and whether a quoted span held an operator (the code an interpreter may run, which ADR-066's grammar reads as a NUL today).

   Each command also carries its pipeline position: the command it feeds, if any.

   It also says whether the whole text lexed (`complete`). Operators split commands: `;`, `&`, `&&`, `||`, `|`, `(`, `)`, newline. A `#` that begins a word starts a comment.

2. **The ground truth is a shell, not a reading of one (CLAUDE.md §16), and three questions are kept apart.**
   - *Lexing:* for fixtures that run nothing dangerous, the lexer's argv must equal the argv a real `bash`, and `zsh` where present, hands a recording stand-in.
   - *Execution:* what the shell actually runs differs from what the classifier refuses, on purpose. `true || git push` runs no git and is refused (control flow is not evaluated); `eval "git push" "-h"` runs git for help only and is not a publish. The expected differences are listed in the test as data.
   - *Classification:* a row is a publish when either shell would run `git commit` / `git push` without `-h`/`--help`. Missing a publish is the direction that fails open.

   The harness runs in a scratch working directory. `PATH` holds only a directory of recording stand-ins. The shell is invoked by its absolute path. Rows that name git by an absolute path, or run another runtime, are rewritten to a stand-in or are lexed only, never executed as written.

3. **A publish is an argv, found by walking the lexed commands.** `publishCommandIn` returns `git <options> <verb>` when:
   - a command's argv, after assignments and the wrappers the regex already knew (`then`, `do`, `else`, `elif`, `exec`, `nohup`, `nice`, `doas`, `eval`), has `git` or `git.exe` (any directory, any quoting) first;
   - its git options (a value taken where git takes one) are followed by `commit` or `push`;
   - `-h` or `--help` does not follow the verb.

   It recurses, to a bounded depth, into:
   - the `-c` string of a shell whose options run it (`shellRuns`);
   - `eval`'s arguments joined by spaces, as `eval` does;
   - a heredoc body fed to a shell;
   - data piped INTO a shell that reads its script from stdin: `echo`/`printf` arguments, a here-string or a heredoc upstream of `| bash`, `| sh` and the other shells. This form is refused today (`echo "x; git commit --no-verify" | bash`, tests/publish-command.test.mjs:471), and `--no-verify` skips the push hook, so the armed hook does not cover it. An upstream this reader cannot see (`cat file | bash`) stays a script file (ADR-066);
   - each command substitution;
   - `pwsh`/`powershell -Command`, `cmd /c` and `wsl -e`, as the Windows rows do today;
   - the code string of `python -c` / `node -e` for the call spellings the regex matched (`subprocess.run([...])`, `execSync(...)`, `execFile(...)`).

   A command whose first word is dynamic is not a proven git, as today (`$(which git) push` stays a mention).

4. **An incomplete lex refuses what it did lex.** A shell reading `-c` text runs the commands before an unclosed quote, then fails (measured by the ADR's reviewer, 2026-09-27, bash). Refusing on the commands that did lex keeps today's direction, because the regex already matched across them. T1 measures `bash -c` and `zsh -c` on the same rows and records what each ran.

5. **The regex arms are deleted, with their catalogue mutants.** Replacement mutants target the lexer and the walk. `hookSegments` is deleted once `plainPublishes` reads `shellWords` (T3).

**What would make this fail:**
- any `PUBLISHES` or `WINDOWS_PUBLISHES` row, any `DISABLES_THE_HOOK` row, or any pipe-into-a-shell row that moves to not-refused;
- the brace row not refused;
- any of the seven `KNOWN_FALSE_REFUSALS` still refused;
- the mean cost per call over the same 385 literals above 25 µs.

T1-T3 build each of these as a test. The dirty side is today's classifier, run on the same rows before its deletion.

## Alternatives Considered

- **Another round of regex arms for the seven rows.** Rejected. Six review rounds in two days (ADR-066 Context) and §296, §298, §300 each added arms, and the pinned list never shrank.
- **Leave the text refusal as it is, and shrink the unarmed population instead** (arm after a compaction, arm linked worktrees). Not rejected, and it is not an alternative: the owner chose both, this record first. PowerShell and gits below 2.54 stay unarmed whatever is done there.
- **A lexer that also expands `$VAR` from the command's own assignments.** Rejected. `GIT=git; $GIT push` then becomes provable, but the value may come from the environment, and a refusal needs the stronger evidence (CLAUDE.md §16). It stays a mention, as pinned today.
- **An npm shell parser (`shell-quote`, `bash-parser`).** Rejected: the plugin ships zero runtime dependencies (ADR-008), and neither models heredocs fed to a shell.

## Component / Boundary Impact

- **`shell-words.mjs`** is new, pure, and imported only by `lifecycle.mjs`.
- **`lifecycle.mjs`** loses the `PUBLISH_*` regexes (except `PUBLISH_MENTION`, the advisory arm), `quotedStringEnd` and `hookSegments`. `publishCommandIn` and `plainPublishes` read `shellWords`.
- No hook, host, git or session-log boundary changes.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `plugin/scripts/shell-words.mjs` `shellWords()` | new module | T1 | `publishCommandIn` (T2), `plainPublishes` (T3) |
| PreToolUse rule P | refuses by argv: the seven data rows are allowed, the brace row is refused | T2 | Claude Code |
| `KNOWN_FALSE_REFUSALS` | emptied into `NOT_PUBLISHES` | T2 | the locked mention test, which then loops over nothing |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `shellWords()` and its differential test | T1 | T2, T3 | No — nothing reads it until T2 |
| `publishCommandIn()` on `shellWords` | T2 | T3 (the armed grammar still asks it first) | No — same signature and return |

## Implementation

See `tasks/README.md`:
- T1: the lexer, proved against bash and zsh.
- T2: the publish classifier reads argv; the regex arms and the known false refusals go.
- T3: the armed grammar reads the same lexer; `hookSegments` goes.

## Consequences

- **Positive:**
  - quoted data, heredoc bodies and `eval … -h` are no longer refused;
  - a brace-built publish is refused;
  - one reader of shell text instead of two, measured against a shell rather than argued.
- **Negative:**
  - a lexer is still text: a script file, a variable-built `git`, and a repository other than the session's stay out of its reach (ADR-066's reasons);
  - the ground-truth test needs a POSIX shell; on Windows CI it is skipped with that reason, and the Windows rows keep their table assertions.
- **Neutral:**
  - per-call cost rises from 2.1 µs, within the 25 µs bound. PreToolUse's 310-379 ms average is Node's start, so the bound is invisible there.

## Out of Scope

- Arming more sessions (after a compaction, linked worktrees, PowerShell) (deferred: docs/BACKLOG.md §304 items 3-4, the owner's second record after this one)
- Expanding variables from the command's own assignments (permanent: boundary: a refusal needs the stronger evidence, CLAUDE.md §16)
- PowerShell's own grammar beyond `-Command '…'` (deferred: docs/BACKLOG.md §301, no PowerShell row is refused wrongly today)
- Reading a script file the command runs (permanent: boundary: git's hook sees it, ADR-066)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The lexer misses a publish the regex caught (fail-open) | Med | High | every `PUBLISHES` row is a test; the differential test runs each under real shells; the old classifier stays in T2's test as the comparison until the rows agree |
| bash and zsh split a row differently | Med | Med | a publish under either shell is a publish (Decision 2); the rows that differ are recorded |
| The lexer is slower on long commands (a quadratic scan) | Low | Med | one linear pass; a 6,000-line heredoc row with a time bound, as the catalogue already does for CF1 |
| A locked ADR-066 test's body must change | Low | Med | T2 and T3 add new tests beside the locked ones and move rows between constants, which the locks do not hash |

## Rollback

Revert the commits. No persistent state, contract or external integration changes: the lexer is pure, and rule P's inputs and log events are unchanged.

## Follow-ups

- [ ] After a release, count rule P refusals per session against `publish.hook-ran` (session-profile), to see whether the text refusal still decides often enough to keep.
