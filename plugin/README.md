# quality-harness

A development lifecycle whose claims are backed by tool-written evidence. Decisions get records,
records get tasks, and a task is done when a tool ran its check and wrote down what happened.
It also breaks your code on purpose, to show that a passing test can fail.

## What is installed

    node "$(qh-root)/scripts/qh-doctor.mjs"

`qh-root` is on `PATH` inside a Claude Code session. From another terminal, name the installed
copy: `node ~/.claude/plugins/cache/quality-harness/quality-harness/<version>/scripts/qh-doctor.mjs`.
It reports the root, the version, what ships, whether each home gate is a forwarder or a stale
copy, and how many lint findings fail versus only advise, all measured when it runs.

## The status line

It shows the gates' reading of the session: `QH ✓ checked`, `QH ✗ 3 unverified`,
`QH · nothing edited` or `QH ? could not look`, with the observation's age, and a `CI ✓`, `CI ✗`,
`CI …` or `CI ?` tail for the branch. The plugin cannot set your `statusLine`. Keep that command
(and any `refreshInterval`), feed the same `$input` to this script, and append its stdout:

    qh=$(node "$(qh-root)/scripts/statusline.mjs" <<< "$input" 2>/dev/null)
    [ -n "$qh" ] && printf '%s\n' "$qh"

It starts at most one cached `git rev-parse`, and never prints an error.

## The stages

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
| run every reader over a corpus you do not own | `/quality-harness:corpus-chaos` |

`node "${CLAUDE_PLUGIN_ROOT}/scripts/work-next.mjs"` says which stage is waiting, and why.
`ls "${CLAUDE_PLUGIN_ROOT}/skills"` is the full list.

## The gates

`${CLAUDE_PLUGIN_ROOT}/bin/` holds them. They advise and let the work continue, and they exit
non-zero on a failing finding so CI can read it. `qh-doctor` shows which findings fail and which
only advise.

Two refusals exist:

- **An unchecked publish (ADR-061).** A `git commit` or `git push` on a working tree no `qh-check`
  has passed on is refused, however it is launched (`bash -c`, `pwsh -Command`, an argv list).
  - A command that only mentions either word is warned about, never refused.
  - A torn session log, an unordered check, or a check that could not look only warns.
  - `"publish": "warn"` in `.quality-harness.json` turns the refusal into a warning.

  Where git runs config-based hooks (2.54 or later), git refuses it at the event itself
  (ADR-066). This holds in any repository or linked worktree the session commits into, and for
  `--no-verify` commits too. The plugin offers the hook through `CLAUDE_ENV_FILE` and writes
  nothing into your repository.
- **The reviewer guard (ADR-060).** A role spawned read-only, such as `qh-scope-reviewer`, may not
  edit, commit or push.

The evidence chain rests on two gates:

- `adr-lint` checks a record's shape and refuses a `done` row with no tool-written proof.
- `adr-verify` runs a task's acceptance command and appends the date, commit, exit code and a
  digest of the command; editing the command invalidates earlier entries. `--mutant` breaks the
  code on purpose, re-runs the check, and records whether anything noticed.

No model writes those logs. If a row says `exit 0`, a process exited 0.

Run your project's check through `qh-check`. It runs the command declared as `check` in
`.quality-harness.json` (or one inferred from a manifest), records the result with the machine load
at start and end, and is what the commit and completion advisories read. A check run any other way
is not recorded.

Every gate answers `--version` with the version of the tree it was loaded from. Ask the gate whose
output you are questioning.

## Roles and templates

`${CLAUDE_PLUGIN_ROOT}/agents/` holds named roles (`qh-correctness-reviewer`, `qh-scope-reviewer`,
`qh-synthesis`), spawned by name. `${CLAUDE_PLUGIN_ROOT}/templates/adr-template.md` is the source of
truth for record structure.

## Start here

1. `/plugin marketplace add D3-lt/quality-harness`, `/plugin install quality-harness@quality-harness`,
   restart, and run `qh-doctor`.
2. Load `/quality-harness:operating` once.
3. Bring a decision to `/quality-harness:adr-write`, or a change to `/quality-harness:work`.

Walkthroughs, benchmarks and costs: <https://github.com/D3-lt/quality-harness>.
