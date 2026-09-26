# quality-harness

A development lifecycle whose claims are backed by executable evidence rather than
by prose. Decisions get records, records get tasks, and a task is done when a tool
ran its check and wrote down what happened — not when someone says so.

The point is narrow and worth stating plainly: **a passing test is not evidence
that a test can fail.** This harness breaks your code on purpose to find out, and
refuses to call a green suite proof of anything until something has been shown able
to go red.

## What is installed right now

Ask, rather than trusting this page:

    node "$(qh-root)/scripts/qh-doctor.mjs"

`qh-root` is on `PATH` inside a Claude Code session. From any other terminal, name the
installed copy: `node ~/.claude/plugins/cache/quality-harness/quality-harness/<version>/scripts/qh-doctor.mjs`.

It reports the resolved root and version, what ships, whether each installed home
gate is a forwarder or a stale copy, drift against this plugin, and how many lint
findings actually fail versus only advise. Every figure is measured at call time.
Nothing in this README counts anything, on purpose — a number written here would be
wrong by the next release, which is the failure the harness exists to catch.

## The status line

The gates' reading of the current session, where you already look and with no prompt
text spent on it: `QH ✓ checked`, `QH ✗ 3 unverified`, `QH · nothing edited` or
`QH ? could not look`, each followed by how long ago it was observed, or
`QH ? last observed 41m ago` when that observation is too old to speak for the tree.
A `CI ✓`, `CI ✗`, `CI …` or `CI ?` tail says what CI reports for the branch.
The plugin cannot set your `statusLine`.
Keep that command (and any `refreshInterval`). Feed the same `$input` to this
script and append its stdout — one line, or empty:

    qh=$(node "$(qh-root)/scripts/statusline.mjs" <<< "$input" 2>/dev/null)
    [ -n "$qh" ] && printf '%s\n' "$qh"

It reads the JSON Claude Code pipes to the command and this session's event log, reads
the log again only when it changed, starts at most one `git rev-parse` (cached, so most
renders start nothing), and never writes an error — a status line is the one surface you
cannot dismiss.

## The stages, and what runs them

| you want to | invoke |
|---|---|
| discover requirements before designing | `/quality-harness:spec-write` |
| record a durable decision | `/quality-harness:adr-write` |
| execute an accepted decision, task by task | `/quality-harness:adr-execute` |
| implement a decided, bounded change | `/quality-harness:execution` |
| find out whether your tests detect anything | `/quality-harness:mutation-audit` |
| review a diff | `/quality-harness:review` |
| get a different-lineage second opinion | `/quality-harness:codex-review` |
| retire or archive a record | `/quality-harness:adr-retire` |
| let the lifecycle route the whole job | `/quality-harness:work` |
| operate the harness itself | `/quality-harness:operating` |
| run every reader over a corpus you do not own and report what it printed | `/quality-harness:corpus-chaos` |

Not sure which stage you are at? `node "${CLAUDE_PLUGIN_ROOT}/scripts/work-next.mjs"`
reads your corpus and says what is waiting, and why.

`ls "${CLAUDE_PLUGIN_ROOT}/skills"` is the full list — this table names the common
path, not the inventory.

## The gates

`${CLAUDE_PLUGIN_ROOT}/bin/` holds them. They **advise and do not halt the work**, with one exception below. A
gate that stops an agent produces a user who cannot tell what to do next, which is
worse than no gate — so a finding tells you what is wrong and lets you proceed.

**They do still exit non-zero on a failing finding**, and that is not a contradiction:
"not blocking" is about not seizing control of your session, not about pretending
everything passed. The exit code is what a CI step or a stage precondition reads.
`qh-doctor` prints how many findings fail versus how many only advise — and the
difference between those two words is the thing to read, because "the gate
complained" and "the gate refused" are not the same statement.

**One exception, and it can be turned off.** Before a command that invokes `git commit` or
`git push` runs — through `bash -c`, `pwsh -Command` or an argv list too — a working tree no
`qh-check` has passed on is refused (ADR-061), when the session log was read whole, and the
refusal names the invocation it saw. A torn log, an unordered check, or a check that could not
look only warns. `"publish": "warn"` in `.quality-harness.json` makes the refusal a warning; any
other value is ignored and said to be. A command that merely mentions either word — a grep, a
heredoc, a file name — is warned about, never refused, and gets none of the publish-time artifact
checks: only a proven invocation is refused (CLAUDE.md §16). One known limit: a `;` or a newline
inside quoted data or a heredoc body reads as a command position, so an `echo` of quoted text that
names a push after a `;` is refused, and the refusal names what it saw.

**Where git runs config-based hooks (2.54 or later), git itself refuses it (ADR-066).** At
SessionStart the plugin offers git a session-scoped hook through Claude Code's `CLAUDE_ENV_FILE`,
on `prepare-commit-msg` and `pre-push`; nothing is written into any repository. Once that hook
has run, an unchecked commit or push is refused at the event, in the repository it lands in,
whatever launched it — a script file and a commit with `--no-verify` included — and a plain
invocation, or a mention in quoted data, is only advice before it runs. A form that could switch
the hook off (`-c hook.*`, `GIT_CONFIG*`, `env`, `sudo`, `--no-verify` on a push) keeps the
refusal above, and so do PowerShell sessions and older gits.
The only other refusal is the reviewer guard (ADR-060): a role spawned read-only, such
as `qh-scope-reviewer`, may not edit, commit or push. It has no opt-out, because it
fences a role the workflow made read-only, not your own work.

Two of them carry the evidence chain and are worth knowing by name:

- `adr-lint` checks a record's shape and refuses a `done` row that has no
  tool-written proof behind it.
- `adr-verify` runs a task's acceptance command itself and appends what happened —
  the date, the commit, the exit code, a digest of the command. Change the command
  and every earlier entry stops matching, because it no longer proves what it
  claimed. Its `--mutant` mode breaks your code, re-runs the check, and records
  whether anything noticed.

Nothing in those logs is written by a model. If a row says `exit 0`, a process
exited 0.

Automatic edit hooks keep source checks local to the edited file. Project-wide
TypeScript, Rust and Go checks run when you explicitly invoke them or include them
in a task's acceptance command. Commit and completion verification still report
when the project's declared check has not run after the final edit.

Run that check through `qh-check`: it runs the command your project declared as
`check` in `.quality-harness.json` (or the one inferred from a manifest), observes
the tree before and after, and writes the result where the hooks read it. A check
run any other way is not recorded, so the advisories cannot see it.

`.quality-harness.json` also takes `"publish": "warn"`, which turns the one refusal
above back into a warning for projects that want the old contract.
At an artifact-verification boundary, tasks that resolve to the same ADR command
share that check within the pass. Findings are retained, and the next boundary
checks again. The harness's own selftests run in its development repository and CI;
they are not part of installed-user edit hooks.

**Every gate answers `--version`**, with the version of the tree IT was loaded
from — not the newest copy on the machine:

    $ adr-lint --version
    adr-lint 2.63.0 (…/plugins/cache/quality-harness/quality-harness/2.63.0)

Ask the gate whose output you are questioning. A resolver answers "which install is
newest here", which on a machine where a bare name can resolve two different ways
may not be the copy that just ran — so two gates disagreeing is a finding, not a
glitch.

## The roles you can address by name

`${CLAUDE_PLUGIN_ROOT}/agents/` holds named agent definitions, so a role is spawned by
name instead of described in prose and hoped to be reconstructed: a workflow passes
`agentType: 'quality-harness:qh-synthesis'` to `agent()`, and a skill says
`subagent_type: quality-harness:qh-correctness-reviewer`. Read the directory rather
than a list here; each file's frontmatter states what the role is for and which
capability CLASS it asks for — an alias the host binds, never a version-pinned model
id, which would be a stored fact about a catalogue this plugin does not own.

They are namespaced `qh-` so they cannot shadow a role you or your host defines.

## Where the vocabulary lives

`${CLAUDE_PLUGIN_ROOT}/templates/adr-template.md` is the source of truth for record
structure, dispositions and citation forms. Read the template rather than a summary
of one — a summary is always narrower than the real thing, and forms nobody knows
about are forms nobody uses.

## Start here

1. Install — `/plugin marketplace add D3-lt/quality-harness`, then
   `/plugin install quality-harness@quality-harness`, restart — and run `qh-doctor` above.
2. Load `/quality-harness:operating` once, for how to run the harness itself.
3. Bring a real decision to `/quality-harness:adr-write`, or a real change to
   `/quality-harness:work`.

The repository holds the walkthroughs, the measured comparison against a no-plugin
baseline, and the costs: <https://github.com/D3-lt/quality-harness>.
