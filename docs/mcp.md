# The reading gates from a client with no shell

Plain Claude Desktop has no shell, no hooks, no slash commands and no plugin loader. It has MCP.
So `plugin/bin/qh-mcp` exposes the gates that only **read** — over stdio, with no SDK and no
dependency beyond the Python the gates already need.

ADR-012 is the decision; this is the part a user copies.

## Register it

`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS
(`%APPDATA%\Claude\claude_desktop_config.json` on Windows). Create the file if it is not there.

```json
{
  "mcpServers": {
    "quality-harness": {
      "command": "python3",
      "args": ["/absolute/path/to/quality-harness/plugin/bin/qh-mcp"]
    }
  }
}
```

Three things about that entry, each of which has cost somebody an afternoon somewhere:

- **Name the interpreter, not the gate.** `qh-mcp` is a `#!/usr/bin/env python3` script. Windows
  cannot exec one at all, and a GUI application's `PATH` is not your shell's, so `command` is the
  interpreter and the server is its argument.
- **Use an absolute path for both.** Desktop spawns the server with the working directory of the
  application, not of your project. If `python3` is not resolvable from a GUI process on your
  machine, put the full path there too — `which python3` in a terminal tells you what it is.
- **Restart Claude Desktop.** The config is read at startup. Editing it while Desktop is running
  changes nothing, and the failure looks exactly like a broken server.

A registration cannot be scoped to a project: Desktop's bridge takes no such argument. So the
server takes the corpus path **per call** instead, and every result names the paths it read back to
you, because over MCP the client names a path it cannot see.

## What you get

Five tools. Each one runs the gate itself and hands back its output unchanged — the server never
summarises, re-words or grades it, because a second opinion about a gate's output is a second gate.

| Tool | Gate | Answers |
|---|---|---|
| `qh_adr_lint` | `adr-lint` | Is this record well formed, and is its work proved? |
| `qh_adr_next` | `adr-next` | Which task is ready to start, and why are the others not? |
| `qh_adr_debt` | `adr-debt` | What did this corpus defer, and do the pointers still resolve? |
| `qh_adr_judge` | `adr-judge` | Does this record rest on anything observable? (always advisory) |
| `qh_arch_lint` | `arch-lint` | Does this architecture doc name checks that exist and can fail? |

**A finding is not an error.** The gates advise and never block. A gate that ran and found problems
returns them as ordinary content with its exit code stated; the protocol's error channel is
reserved for a gate that **could not run** — the path is not there, the gate is not installed, the
interpreter did not start, the arguments do not match the schema. Those say `could not run` and
name what was attempted. "Could not look" and "found nothing" are different answers, and this
server never spends one on the other.

## What you do not get, and why

`adr-verify` and `spec-verify` are **absent, permanently**. They are not missing and this is not an
oversight.

Both execute text the corpus supplies — a task file's Acceptance fence, a spec's command override —
and over MCP the client names the file. Exposing either would turn *"lint my ADRs"* into *"run
whatever is written in the file I point you at"*, from a client that cannot see the file it is about
to have executed. `adr-verify --mutant` is worse again: it rewrites a file in your tree and restores
it afterwards, and over MCP there is no hook to run the restore if the client goes away.

There is no flag that turns them on. The server has one registrar, it is called `reading_tool`, and
it sets the read-only annotation itself — so a tool here cannot be advertised read-only and execute
something. A future author who wants one has to add a registrar and answer for it in review.

The consequence is real and worth stating plainly: **from Desktop you can be told what is wrong and
you cannot record that you fixed it.** The evidence half of this lifecycle needs a shell. If you
want it, install Claude Code.

## Check it works

Before touching Desktop, confirm the server answers on your machine:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
              '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | python3 plugin/bin/qh-mcp
```

Two JSON lines back, the second naming the five tools. If that works and Desktop still shows
nothing, the problem is the config path, the interpreter, or the restart — in that order.
