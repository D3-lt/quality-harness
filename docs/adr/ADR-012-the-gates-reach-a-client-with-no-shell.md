# ADR-012: Expose the reading gates over MCP, and refuse the two that execute the corpus

**Status:** Accepted
**Date:** 2026-08-29
**Owner:** Zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-003-a-gate-asserts-behaviour-not-shape.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-002-a-mutant-restore-outlives-its-process.md, docs/adr/ADR-008-the-plugin-is-not-the-repository.md, docs/BACKLOG.md §33
**Governs:** `plugin/bin/qh-mcp`
**Enforced-by:** `mcp: the read-only annotation is derived from the registrar, not decorative`
**Invalidates:** none — checked
**Served-path change:** A user of plain Claude Desktop, which has no shell, can run this project's reading gates against a corpus on their own machine; today they can run none of them.

## Context

Everything structural in this plugin is a Claude Code construct — `plugin.json`, the marketplace,
SessionStart and PostToolUse hooks, `${CLAUDE_PLUGIN_ROOT}` substitution, the namespaced
`quality-harness:*` skills. Claude Code covers terminal, desktop app, web and IDE extensions. **Plain
Claude Desktop, with no Claude Code, is covered by none of it** (docs/BACKLOG.md §33, raised
2026-08-27).

The two halves of this plugin are not equally portable, and this repository has measured which is
which. The skills are markdown and would carry over by hand; that is the guidance half, and §35 now
states its evidence honestly — *three instructions were measured on cases too noisy to detect a small
effect, and none showed one*. The gates are plain Python CLIs needing nothing but Python and a shell;
that is the half whose effect this corpus has repeatedly demonstrated, and it is unreachable from a
client with no shell.

**What a Desktop client actually gets, from a project that shipped one.** Recalled 2026-08-29 from
the agentsmemory corpus, whose 2026-08-22 record ships a working Desktop MCP registration: the config
is `~/Library/Application Support/Claude/claude_desktop_config.json`, key `mcpServers`, a stdio entry
of `{command, args}` — the same shape Cursor and Claude Code use. Desktop gets **no protocol file, no
hooks, no subagent definitions, no slash commands. It is MCP-only.** That project's own recurring
finding across three records is the one to carry here: *every time a new client has FEWER
capabilities than the last, the defect is a step that assumed the capability was present.*

**Which gates may be exposed is decided by one property, and it is not read-versus-write.** Enumerated
2026-08-29 with `grep -n 'subprocess.run(' plugin/bin/*`:

| gate | what it spawns | may be exposed |
|---|---|---|
| `adr-lint` | `git rev-parse`, `git ls-files` — fixed argv | yes |
| `adr-debt` | `git rev-parse` — fixed argv | yes |
| `arch-lint` | `git rev-parse` — fixed argv | yes |
| `adr-next`, `adr-judge` | nothing | yes |
| `spec-verify` | **`subprocess.run(override_cmd, shell=True, …)` at :504** — a `Cmd` override read from the spec file | **no** |
| `adr-verify` | **the task file's Acceptance fence, through bash** | **no** |

Five gates read files and report. Two execute text that the corpus supplies. Over MCP the client
names the path, so exposing either of those two turns "lint my ADRs" into "run whatever is written in
the file I point you at" — remote code execution with extra steps, from a client that cannot see the
file it is about to have executed. `adr-verify --mutant` is worse again: it rewrites a file in the
caller's tree and restores it, and ADR-002's journal exists because that is dangerous *with* a process
to clean up after itself. Over MCP there is no hook at all, so a killed client leaves a mutated tree
with nothing to run the restore.

**A constraint measured elsewhere, carried here rather than rediscovered.** The same corpus records
that `server.WithInstructions` — the MCP handshake field that would carry protocol guidance — is
**confirmed on exactly one client (Claude Code) and UNMEASURED on Desktop**; that project's own
ADR-021 T3 live measurement has been pending for a week. The transport is proven (41 tools over
stdio, Desktop spawning the bridge); whether Desktop renders the instructions string into the model's
context, and at what length, is not. It also records that a Desktop registration **cannot be scoped**
— its bridge takes no per-project argument — so any design requiring a project notion is a design
Desktop cannot express.

## Existing Primitives Audit

- **The seven gates in `plugin/bin/`** — reused unchanged. This decision adds a caller, not a
  reimplementation; a second copy of a gate's logic behind MCP is the two-copies-drift failure
  ADR-001 and ADR-004 each already decided against.
- **`plugin/scripts/standalone-link.mjs`** generates a forwarder for every entry in `plugin/bin/`.
  A new entry there acquires one, which is why the server is a bin entry and not a file placed
  beside the gates for import (ADR-011 rejected a shared `bin/` module for the same reason).
- **No MCP SDK is reused, because none is present.** This plugin ships zero npm dependencies today
  and 663 K total (ADR-008, measured 2026-08-28). See Alternatives.

## Decision

Ship `plugin/bin/qh-mcp`: a stdio JSON-RPC server exposing **only the five gates that never execute
corpus content**, with three properties that are structural rather than remembered.

**1. Read-only is derived from registration, not declared by an author.** A gate is registered
through one of two functions. `reading_tool(...)` registers it and sets `annotations.readOnlyHint`
true; there is no second argument that can disagree, and no `executing_tool` exists at all. The two
executing gates are therefore not "marked dangerous" — they are unregisterable, and a future author
who wants one has to add a registrar and answer for it in review. This shape is taken from the
agentsmemory MCP server, where `ReadOnlyHint` falls out of which registrar method was used so the
annotation cannot contradict the registration.

**2. A finding is content, never a protocol error.** The gates advise and never block (CLAUDE.md §3),
and JSON-RPC has a channel — `isError`, or an error object — that a model reads as *the tool broke*.
A gate reporting findings has not broken; it has worked. So every completed run returns its findings
and the gate's exit code as ordinary content, and the error channel is reserved for the cases ADR-005
already names: the interpreter did not start, the path does not exist, git could not be asked. A gate
that could not run must not borrow the vocabulary of one that ran and found nothing, and over MCP the
protocol offers a new way to make exactly that mistake.

**3. The guidance rides on tool descriptions, because that is the channel proven to arrive.**
`WithInstructions` is unproven on Desktop, so nothing load-bearing may depend on it. Tool
descriptions provably arrive — they are how the model learns the tool exists at all. Each tool's
description therefore carries what a caller needs: what the gate answers, what its exit codes mean,
and that a finding is advice rather than a refusal. `WithInstructions` is still populated, as a
bonus that costs nothing and is not relied upon.

**The criterion this decision can fail, and the data that would show it.** T4 registers the server
against a real Desktop install and asks it a question only a gate can answer — "run adr-lint over
this corpus and tell me what it says". If Desktop cannot spawn the server, or spawns it and never
calls a tool, this decision fails and the record is withdrawn rather than softened. That is a live
possibility, not a formality: Desktop's config file is documented for stdio entries and this project
has never run one.

## Alternatives Considered

- **Use an MCP SDK (`@modelcontextprotocol/sdk`) rather than writing JSON-RPC by hand.** Rejected on
  ADR-008's measurement. This plugin ships zero npm dependencies and 663 K; the SDK brings
  `node_modules` into a package a user downloads from a marketplace, plus a supply chain this project
  cannot audit on every release. The surface actually needed is three methods — `initialize`,
  `tools/list`, `tools/call` — over line-delimited JSON on stdio. Hand-written is the smaller risk
  here, and the precedent is the agentsmemory server's own `mcp-stdio` subcommand, which bridges
  stdio with no Node and no extra dependency.
- **Port the skills to Desktop instead, as markdown the user pastes.** Rejected because it ships the
  half whose effect is unevidenced (§35) and leaves behind the half that works. It is also the half a
  user can do themselves today without us.
- **Expose all seven gates and guard the dangerous two by a permission flag.** Rejected: that is a
  check somebody has to remember, and this corpus's whole argument is against those. It also answers
  the wrong question — a role guard says *who* may run the tool, not *where* the execution lands, and
  the hazard here is that the execution lands in a tree the client named.
- **Have the server mutate its own copy: client sends content, server returns the mutated result.**
  Not rejected — deferred. It inverts who owns the filesystem, which is the actual problem, and it is
  the shape worth reaching for if the mutation half is ever wanted on Desktop. Out of scope here
  because it is a different tool with a different contract, not a flag on this one.
- **Do nothing; tell Desktop users to install Claude Code.** Rejected as the answer to §33, but
  recorded because it is the honest baseline: it costs nothing and it is what happens if T4 fails.

## Component / Boundary Impact

One new component, `plugin/bin/qh-mcp`, owned by the same surface as the gates it calls. It has one
reason to change: the MCP protocol, or which gates are safe to expose. It **must not** acquire gate
logic — every answer it gives is a gate's answer, unmodified, which is what keeps ADR-003's
"a gate asserts behaviour" true of the MCP path without a second set of mutations.

No existing component changes ownership. `plugin/scripts/standalone-link.mjs` picks up the new bin
entry by construction and is not edited.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| MCP stdio (`initialize`, `tools/list`, `tools/call`) | new | `plugin/bin/qh-mcp` | any MCP client; Claude Desktop is the target |
| Tool names `qh_adr_lint`, `qh_adr_next`, `qh_adr_debt`, `qh_adr_judge`, `qh_arch_lint` | new | `plugin/bin/qh-mcp` | MCP clients |
| `claude_desktop_config.json` → `mcpServers.quality-harness` | new, user-installed | documentation | Claude Desktop |
| `plugin/bin/qh-mcp.cmd` | new Windows shim, same as every other bin entry | packaging | Windows users |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `reading_tool()` registrar and the tool registry it fills | T1 | T2, T3 | No — new |
| `dispatch(request)` returning a JSON-RPC response object | T1 | T2, T3 | No — new |
| Tool result shape: findings + exit code as content | T3 | T4 | No — new |

## Implementation

See `tasks/README.md`. Four tasks.

## Consequences

- **Positive:** The half of this plugin with demonstrated effect reaches a client that today gets
  none of it, without porting a skill or maintaining a second copy of any gate.
- **Positive:** The read-only property becomes structural. A tool cannot be advertised read-only and
  execute something, because the registrar that would allow it does not exist.
- **Negative:** A second caller of every exposed gate. A gate's output format is now load-bearing for
  two consumers, and a change that suits the CLI can break the MCP path silently — the two-consumer
  problem ADR-009 named for `Enforced-by` parsers, in a new place.
- **Negative:** `adr-verify` and `spec-verify` — the two gates that produce this corpus's actual
  evidence — are exactly the two Desktop cannot have. A Desktop user can be told what is wrong and
  cannot record that they fixed it. This ADR does not close §33; it closes the reading half of it.
- **Neutral:** The server is a bin entry, so it acquires a standalone forwarder and a `.cmd` shim
  like every other gate, and the packaging test will require both.

## Out of Scope

- Exposing `adr-verify` or `spec-verify` over MCP in any form. (permanent: both execute text the
  corpus supplies, and over MCP the client names the file. That is not a limitation to lift later —
  it is the boundary that makes the rest of this safe.)
- The mutation half on Desktop, via a server that mutates its own copy of client-supplied content.
  (deferred: docs/BACKLOG.md §33)
- Per-project or per-corpus scoping of a registration. (permanent: Desktop's bridge takes no such
  argument, measured on a shipped Desktop registration 2026-08-22, so a design requiring one is a
  design Desktop cannot express. The server takes the corpus path per call instead.)
- Porting any skill, hook, or slash command. (permanent: Desktop has no mechanism for any of them;
  this decision is about the enforcement half precisely because that is the portable one.)
- Relying on `server.WithInstructions` to deliver anything load-bearing. (deferred: docs/BACKLOG.md §33 —
  it is populated but unproven on Desktop, and the measurement that would settle it is T4's.)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Desktop cannot spawn a Python stdio server from its config | Low | High | T4 measures it against a real install before anything else is claimed; the decision is withdrawn rather than softened if it fails |
| A future author registers an executing gate | Low | High | No registrar exists that would allow it; T2's test asserts the two executing gates are absent from `tools/list` |
| A gate's output format changes and the MCP path breaks silently | Med | Med | The server returns gate output verbatim rather than parsing it, so there is no format to drift; T3 asserts this |
| Hand-written JSON-RPC mishandles a protocol case a client relies on | Med | Med | Scope is three methods; T1's test drives them as a real client does, over the actual stdio pipe |
| A client names a path outside the corpus | Med | Med | Every path argument is resolved and reported back in the result, so the caller sees which tree was read; the gates themselves are read-only |

## Rollback

Delete `plugin/bin/qh-mcp` and its `.cmd` shim, and remove the `mcpServers` entry from the client
config. No persistent state, no schema, no data migration — the server holds nothing between calls
and every answer is a gate's answer computed on demand.

## Follow-ups

- [ ] Take ADR-021 T3's pending measurement (does Desktop surface `WithInstructions`?) and report it
      back to the agentsmemory corpus, which has the same task open.
