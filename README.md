# Quality Harness

A [Claude Code](https://claude.com/claude-code) plugin that records what actually ran when an
agent says work is done.

An agent's "all tests pass" reads the same whether it ran the right tests, the wrong ones, or
none. Quality Harness runs the check itself and writes the command, its exit code, the commit and
a digest of the command into a file in your repository.

## Install

```text
/plugin marketplace add D3-lt/quality-harness
/plugin install quality-harness@quality-harness
```

Then, in your repository, run `/quality-harness:work` and ask for work as usual.

- [docs/TUTORIALS.md](docs/TUTORIALS.md): ten minutes with a throwaway repo, a real test, and a
  test that cannot fail being caught.
- [docs/ONBOARDING.md](docs/ONBOARDING.md): the first week.
- [docs/INSTALL.md](docs/INSTALL.md): requirements, Windows, Claude Desktop and other MCP
  clients, CI-only use, uninstalling.
- [docs/UPDATE.md](docs/UPDATE.md): updating, and what stays old when you do.

## A recorded run

```text
- 2026-09-03 · 1d9381f* · exit 0 · `python3 -m unittest -v test_duration` · acceptance-sha256:b43e2374… · ms:75
```

Date · commit (`*`: the tree was dirty) · exit code · command · digest of the command, so editing
the command invalidates the entry · duration. The tool writes the line; a model does not.

## What it does

- **Runs the check itself.** `adr-verify` runs a task's acceptance command and records the
  result. `qh-check` runs your project's declared check and records it, with the machine load at
  the start and end; a pass taken above the core count is marked unattributable.
- **Checks that tests can fail.** A mutation campaign breaks one mechanism at a time and reports
  every test that did not notice.
- **Advises, with two refusals.** Every gate reports and lets work continue, except:
  - a `git commit` or `git push` on a tree no `qh-check` has passed on is refused;
    `"publish": "warn"` in `.quality-harness.json` turns this into a warning;
  - a reviewer agent the plugin started read-only cannot edit, commit or push.

  A failing check still exits non-zero, for CI.
- **Says when it could not look.** A check that could not run reports `UNRUN`, `PARTIAL` or
  `UNPROVEN`, never a result it did not observe.
- **Keeps decisions next to the code.** Decision records (ADRs), one file per decision, with task
  files whose readiness and evidence are computed from the files, not from a status someone typed.

## What it costs

- A task states how it will be checked before the code is written.
- The full mutation campaign is for CI and releases, not every edit.
- The model takes more turns: 2.33× in the 2026-08-28 eval, one run per arm. See
  [docs/BENCHMARKS.md](docs/BENCHMARKS.md) for why that is the worst case for cost.
- It runs the check you declare (`check` in `.quality-harness.json`) and has no opinion about your
  language or test runner.
- `adr-lint` judges decision records against its own template. A MADR or Nygard record under an
  `adr/` or `decisions/` directory is linted against that template and fails on the sections it
  lacks. `work-next` and `adr-state` read any record's Status.

## Who it is for

People who let agents write code they have to maintain. Not a linter or a formatter, and not worth
it on a throwaway prototype.

## Supported tools

| | What you get | Tested |
|---|---|---|
| **Claude Code** | Skills, hooks, workflows and every gate | Linux, macOS and Windows in CI on every push |
| **MCP clients** (Claude Desktop, Cursor, Zed, Codex) | The read-only gates, through the bundled `qh-mcp` server | The server is tested; those clients are not |
| **Any shell or CI, no AI** | Every gate in `bin/`: a plain `python3` or `node` program with a meaningful exit code | This repository gates itself with them |

`qh-mcp` exposes only gates that read; the two that run an acceptance command are not available
over MCP. Codex is optional and used only as a reviewer from a different model lineage
(`codex-review`, `codex-advise`).

## Measured results

With and without the plugin, five runs per arm, 2026-09-03:

| case | with | without | Δ |
|---|---|---|---|
| adr-write-consults-the-corpus | 1.00 | 0.00 | +1.00 |
| done-needs-tool-written-evidence | 0.76 | 0.00 | +0.76 |
| four general code-quality cases | | | −0.07 to +0.04 |

The plugin changes what the model does when the task is about verification, and not when it is
ordinary good practice. Method, caveats, cost and this repository's own corpus figures:
[docs/BENCHMARKS.md](docs/BENCHMARKS.md). The problem it addresses: among self-assessing coding
agents, 75.8% of failures are false successes, and LLM judges do not exceed AUROC 0.65 at catching
them ([sources](docs/research/2026-08-28-verification-is-the-bottleneck.md)).

Measure your own corpus. The report is read-only and never runs your acceptance commands:

```bash
node "$(qh-root)/scripts/corpus-report.mjs" docs/adr
```

## What it includes

Skills, invoked as `/quality-harness:<name>`:

- `work`: main-session coordinator for substantive development.
- `spec-write`: requirements as facts bound to tests.
- `adr-write`: a proposed, executable decision record.
- `adr-execute`: execute an Accepted record task by task, with tool-written evidence.
- `adr-retire`: archive records without losing their authority or open obligations.
- `arch-write`: current-state architecture map and audit.
- `execution`: a bounded change with fresh evidence.
- `review`: code review with risk routing.
- `mutation-audit`: break a mechanism and measure whether anything notices.
- `corpus-chaos`: run every reader over a corpus you do not own, then break a scratch copy of it.
- `postmortem`: structured learning from a material failure.
- `codex-review`, `codex-advise`: a fresh-context Codex review or second opinion.
- `quality-policy`: the shared scope, simplicity and evidence contract.
- `operating`: what is installed, whether a gate is stale, how to read a finding's severity.

Gates, on `PATH` while the plugin is enabled:

- `spec-verify`: every fact in a spec is bound to a test.
- `adr-lint`: a record's grammar, coverage, evidence and dangling pointers.
- `adr-verify`: runs a task's acceptance command and writes the evidence.
- `adr-judge`: whether a record rests on anything observable. Advisory only.
- `adr-next`: task readiness computed from the task files.
- `adr-debt`: deferred items and open follow-ups.
- `adr-retire-check`: a retirement keeps authority and obligations.
- `arch-lint`: an architecture document against the code.
- `postmortem-verify`: a postmortem's claims against its evidence.
- `qh-check`: runs the project's check and records the result and the load.
- `qh-mcp`: the reading gates over MCP.
- `qh-root`: the installed plugin root.

Corpus readers, which report and exit 0: `work-next.mjs`, `adr-state.mjs`, `adr-context.mjs`,
`corpus-report.mjs`, `corpus-probe.mjs`.

Workflows, for costly cases only: `quality-cycle` (high-risk review), `consensus` (an open design
decision that is costly to reverse), `review-ring` (one review, at most one fix, then
revalidation).

Hooks: protected branches, leaf agents, completion evidence, artifact gates, and the publish
refusal above. A session-start notice reports standalone copies of the gates that have drifted
from the plugin; `sync-standalone.mjs --link` replaces them with forwarders.

## Requirements

- Claude Code 2.1.154 or newer. On Pro, enable dynamic workflows in `/config`.
- Python 3.9 or newer; CI tests 3.12.
- Node.js; CI runs 24.
- Bash (Git Bash on Windows) and Git.
- Codex CLI, only for `codex-review` and `codex-advise`.

## Developing the plugin

- `plugin/` is the only thing published: `.claude-plugin/marketplace.json` points at it.
  `tests/`, `docs/` and `scripts/` never ship. A file under `plugin/` that is not part of the plugin
  fails the suite (ADR-008).
- Load the working tree with `claude --plugin-dir ./plugin`, and run the gate with
  `bash scripts/selftest.sh`. The rules for working here are in [CLAUDE.md](CLAUDE.md).
- A bare gate name on `PATH` runs the installed release. Name the working-tree path to test an edit.
- A marketplace added from a local path also copies ignored files, so it is larger than a
  published install.

This repository gates itself with the same tools, and [docs/BACKLOG.md](docs/BACKLOG.md)
records each time its own checks were wrong.

## License

MIT. See [LICENSE](LICENSE).
