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

    node "${CLAUDE_PLUGIN_ROOT}/scripts/qh-doctor.mjs"

It reports the resolved root and version, what ships, whether each installed home
gate is a forwarder or a stale copy, drift against this plugin, and how many lint
findings actually fail versus only advise. Every figure is measured at call time.
Nothing in this README counts anything, on purpose — a number written here would be
wrong by the next release, which is the failure the harness exists to catch.

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

Not sure which stage you are at? `node "${CLAUDE_PLUGIN_ROOT}/scripts/work-next.mjs"`
reads your corpus and says what is waiting, and why.

`ls "${CLAUDE_PLUGIN_ROOT}/skills"` is the full list — this table names the common
path, not the inventory.

## The gates

`${CLAUDE_PLUGIN_ROOT}/bin/` holds them. They **advise and never halt the work.** A
gate that stops an agent produces a user who cannot tell what to do next, which is
worse than no gate — so a finding tells you what is wrong and lets you proceed.

**They do still exit non-zero on a failing finding**, and that is not a contradiction:
"never block" is about not seizing control of your session, not about pretending
everything passed. The exit code is what a CI step or a stage precondition reads.
`qh-doctor` prints how many findings fail versus how many only advise — and the
difference between those two words is the thing to read, because "the gate
complained" and "the gate refused" are not the same statement.

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

**Every gate answers `--version`**, with the version of the tree IT was loaded
from — not the newest copy on the machine:

    $ adr-lint --version
    adr-lint 2.63.0 (…/plugins/cache/quality-harness/quality-harness/2.63.0)

Ask the gate whose output you are questioning. A resolver answers "which install is
newest here", which on a machine where a bare name can resolve two different ways
may not be the copy that just ran — so two gates disagreeing is a finding, not a
glitch.

## The roles you can address by name

`${CLAUDE_PLUGIN_ROOT}/agents/` holds named agent definitions, so a delegating
skill can say `subagent_type: qh-synthesis` instead of describing the role in prose
and hoping it is reconstructed. Read the directory rather than a list here; each
file's frontmatter states what the role is for and which capability CLASS it asks
for — an alias the host binds, never a version-pinned model id, which would be a
stored fact about a catalogue this plugin does not own.

They are namespaced `qh-` so they cannot shadow a role you or your host defines.

## Where the vocabulary lives

`${CLAUDE_PLUGIN_ROOT}/templates/adr-template.md` is the source of truth for record
structure, dispositions and citation forms. Read the template rather than a summary
of one — a summary is always narrower than the real thing, and forms nobody knows
about are forms nobody uses.

## Start here

1. Install, then run `qh-doctor` above to see what you have.
2. Load `/quality-harness:operating` once, for how to run the harness itself.
3. Bring a real decision to `/quality-harness:adr-write`, or a real change to
   `/quality-harness:work`.

The repository holds the walkthroughs, the measured comparison against a no-plugin
baseline, and the costs: <https://github.com/D3-lt/quality-harness>.
