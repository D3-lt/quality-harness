# Install

The two-line install is at the top of the [README](../README.md). This page is everything the
two lines do not say: what you need, how to check it worked, what it adds to a session, and the
routes for machines that are not a Claude Code terminal. Updating is a separate page —
[UPDATE.md](UPDATE.md) — because the things that go wrong on update are different things.

Every command below was run on 2026-09-04 against plugin 2.64.0 and Claude Code 2.1.260 unless a
line says otherwise. Where a statement comes from Claude Code's documentation rather than from a
run here, it says so.

## What you need

| | Required | What is actually tested |
|---|---|---|
| Claude Code | 2.1.154 or newer — the build dynamic workflows shipped in. On Pro, enable them in `/config`. | Developed against 2.1.260. Older builds are not re-tested. |
| Python | 3.9 or newer, by syntax: the gates use `list[str]`-style annotations under `from __future__ import annotations` and no `match` statement. | **3.12** — the only version CI runs, on all three operating systems. |
| Node.js | Any current release. | **24**, in CI. |
| Bash | Any. On Windows: Git for Windows (Git Bash). The hook runner finds it from `CLAUDE_CODE_GIT_BASH_PATH`, then `PATH` (skipping the System32 WSL stub), then the per-user and system Git for Windows installs. | Windows CI runs the whole suite through it. |
| Git | Any. | — |
| Codex CLI | Only for `/quality-harness:codex-review` and `:codex-advise`. Nothing else depends on it. | Not in CI. |
| `jq` | Optional, Windows only — advisory JSON checks. Hook dispatch does not use it. `winget install jqlang.jq` | — |

The plugin ships no project-specific paths, test commands or policy. It reads the repository it
is run in.

## Install into Claude Code

In a Claude Code session:

```text
/plugin marketplace add D3-lt/quality-harness
/plugin install quality-harness@quality-harness
```

The install summary says either `Plugin is now active.` or `Run /reload-plugins to activate.` —
do what it says. If `/reload-plugins` warns that it would invalidate the prompt cache, run
`/reload-plugins --force`.

From a shell, without a session (installs to user scope unless `--scope` says otherwise; the
plugin loads at the next launch):

```bash
claude plugin marketplace add D3-lt/quality-harness
claude plugin install quality-harness@quality-harness
```

Scopes, from Claude Code's documentation: **user** (you, every project — the default), **project**
(every collaborator, written to `.claude/settings.json`), **local** (you, this repository only).

## Check it worked

Four commands, each answering a different question. Run them rather than trusting this page.

```bash
claude plugin list                             # installed, version, scope, enabled
adr-lint --version                             # which copy a bare gate name reaches — path included
qh-root                                        # the newest install on this machine
node "$(qh-root)/scripts/qh-doctor.mjs"        # what ships, drift, and how many findings fail vs advise
```

`adr-lint --version` answers with the version **and the directory it was loaded from**. That is
the line to read when two gates seem to disagree: on a machine with more than one copy, a bare
name can reach either.

To see the inventory and what it costs in context before deciding to keep it:

```bash
claude plugin details quality-harness
```

On 2.64.0 that reports 14 skills, 4 agents and 7 hook events, and an always-on cost of about
2,300 tokens per session; each skill costs more only when it fires. Re-run it for the version you
have — the number is measured by the CLI, not written here.

## What it adds to a session

- **Skills**, namespaced: `/quality-harness:work`, `/quality-harness:adr-write`, and the rest. The
  namespace is deliberate; it says which copy answered.
- **Agents**, namespaced `qh-`, so they cannot shadow a role you or your host defines.
- **Hooks** on `SessionStart`, `SubagentStart`, `SubagentStop`, `TaskCompleted`, `Stop`,
  `PreToolUse` and `PostToolUse`. They advise and never seize the session (README, "It never
  blocks you").
- **`bin/` on the Bash tool's `PATH`** while the plugin is enabled — Claude Code does this for any
  plugin that ships a `bin/` directory. So `adr-lint`, `adr-verify`, `qh-root` and the other gates
  resolve by bare name inside a session. Outside a session they do not, unless you create
  forwarders (below).
- **No MCP server, LSP server or settings** are declared by the manifest. `qh-mcp` exists for
  clients you register it with yourself; see "Claude Desktop" below.

⚠ **Organisation-distributed installs lose `bin/`.** Claude Code's plugin documentation states that
a plugin distributed through claude.ai organisation settings cannot include a top-level `bin/`
directory. Not measured here — nobody has installed this plugin that way — but if you do, expect
to call the gates by path: `python3 "$(qh-root)/bin/adr-lint"`, and `qh-root` itself by its path.

## A guided first run

Paste this into Claude Code after installing, and it will show you what it added rather than
telling you:

```text
Install the Quality Harness plugin and show me what it added.

1. Run: /plugin marketplace add D3-lt/quality-harness
2. Run: /plugin install quality-harness@quality-harness
3. Restart when prompted, then run `qh-root` and list the gates in its bin/ directory.
4. Tell me which lifecycle stage my repository is at by running
   `node "$(qh-root)/scripts/work-next.mjs"` — it reads, judges nothing, and exits 0
   whatever it finds.
5. Summarise in three lines: what got installed, what it will do the next time I
   ask for substantive work, and what it will NOT do without me asking.
```

Then: [TUTORIALS.md](TUTORIALS.md) for ten minutes on a throwaway repository, or
[ONBOARDING.md](ONBOARDING.md) for the first week.

## Bare gate names outside a session

Inside a Claude Code session, `bin/` is on `PATH`. In your own terminal it is not. Two routes:

- **Forwarders** — `node "$(qh-root)/scripts/sync-standalone.mjs" --link` writes one small script
  per gate under `~/.claude/bin/`, each resolving the newest installed plugin **at call time**, so
  no release can leave them behind. Put `~/.claude/bin` on your shell `PATH`.
- **Never `--apply`.** That writes a *copy*, and a copy is stale by the next release. The
  session-start notice will then report it as drifted, every session, until you replace it.

## Claude Desktop, and any other MCP client

Desktop has no shell, no hooks and no plugin loader; it has MCP. The plugin ships `qh-mcp`, a stdio
server exposing the **reading** gates — `adr-lint`, `adr-next`, `adr-debt`, `adr-judge`,
`arch-lint`, `adr-retire-check`, `postmortem-verify` — and deliberately not the two that execute
text from your corpus. [mcp.md](mcp.md) has the registration, the three things that cost people an
afternoon, and the one-line probe to run before touching Desktop.

Two facts that belong here rather than there:

- **The registration names an absolute path, and that path decides what version Desktop runs.**
  A path under the plugin cache (`.../quality-harness/quality-harness/2.64.0/bin/qh-mcp`) is pinned
  to that version and stays there through every update. A path into a git checkout runs whatever
  is on disk at call time. Neither is wrong; both need to be a decision. [UPDATE.md](UPDATE.md)
  says what to do at each update.
- **From Desktop you can be told what is wrong; you cannot record that you fixed it.** The evidence
  half of the lifecycle — `adr-verify` — needs a shell. Cursor, Zed, Codex and any other MCP client
  get the same seven tools and the same limit; the server is tested here, those clients are not.

## Codex

Codex is a **reviewer** in this plugin, not a host. `/quality-harness:codex-review` and
`:codex-advise` shell out to the Codex CLI for a verdict from a different model lineage. Install
the Codex CLI and authenticate it; nothing else changes.

There is nothing to install into Codex as a host. The `AGENTS.md` in this repository exists so a
Codex session can *develop the plugin*; it is not a surface the plugin offers to your project.

## No AI at all: CI and Makefiles

Every gate in `bin/` is a plain `python3` or `node` program with a meaningful exit code. Clone the
repository, or point at the installed copy, and run them directly:

```bash
python3 plugin/bin/adr-lint docs/adr          # from a clone
python3 "$(qh-root)/bin/adr-lint" docs/adr    # from an install, in a shell that has qh-root
```

They exit non-zero on a failing finding and print advisories that do not fail; `qh-doctor`
prints the current split. This repository gates itself this way on every push.

## Developing the plugin itself

```bash
claude --plugin-dir ./quality-harness/plugin
```

A `--plugin-dir` plugin with the same name as an installed one takes precedence for that session,
so you can test a checkout without uninstalling the release. **Call gates by working-tree path**
(`python3 plugin/bin/adr-lint`) while you do — a bare name reaches the installed copy, not your
edit. `bash scripts/selftest.sh` is the repository's own gate; exit 0 or it did not pass.

## Uninstall

```text
/plugin uninstall quality-harness@quality-harness
```

Or `claude plugin uninstall quality-harness@quality-harness` from a shell. What that does **not**
remove: previous versions under `~/.claude/plugins/cache/quality-harness/`, and any forwarders you
created under `~/.claude/bin/`. Delete both by hand if you want a clean machine; the forwarders
will otherwise report that no plugin resolves, which is correct.
