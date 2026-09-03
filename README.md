# Quality Harness

**An AI coding agent will tell you it is finished. Sometimes it is not — and the
message looks exactly the same either way.**

Quality Harness is a plugin for [Claude Code](https://claude.com/claude-code) that
stops taking the agent's word for it. When work claims to be done, the plugin runs
the check itself and writes down what actually happened — the command, its exit
code, the commit it ran at — into a file in your repository. You read evidence
instead of a summary.

It is for people who already let an agent write real code and have started
wondering how much of "done" they can trust. It brings no opinions about your
language, layout or test runner.

## The problem, in one example

You ask an agent to fix a bug. It edits a few files and reports:

> ✅ All tests pass. Task complete.

Any of these could be true:

- it ran the tests and they passed — good
- it ran the wrong tests, and they passed because they never touched your bug
- it ran nothing at all and typed the sentence

**You cannot tell which from the message.** Neither can another AI you ask to
review it — that has been measured, and it grades how confident the writing sounds
rather than whether anything happened.

This is not a rare glitch. Among coding agents that report their own status, it is
the *most common* way they fail.

## What the plugin does about it

Instead of asking the agent whether it finished, it makes saying "finished" hard
to fake:

- **It runs the check itself.** Not the agent — the tool. It records the command,
  the exit code, the date and the commit, into the task file. If someone later
  edits the command, every earlier record of it is marked invalid, because it no
  longer proves what it claimed.
- **It checks that your tests can actually fail.** A test that passes no matter
  what is worse than no test, because it looks like safety. The plugin breaks each
  piece of your code on purpose and reports any test that did not notice.
- **It never blocks you.** Every check gives advice and lets the work continue. A
  tool that stops you without explaining leaves you worse off than no tool.
- **It says "I do not know" when it does not know.** If a check could not run, it
  says so, rather than reporting a clean result it never actually observed.
- **It keeps decisions where you can find them.** Why something was built a
  certain way lives in files next to the code, not in a chat log nobody can search
  six months later.

## What it costs you

A page that only lists benefits is exactly the tone this project tells you not to
trust, so:

- The full "can your tests fail" run takes about **40 minutes**. It is for CI and
  releases, not for every edit.
- **It is real work.** Before code, a task has to say how it will be checked and
  what would make you stop.
- **It brings no opinions about your project** — no folder layout, no test command,
  no configuration. It adapts to your repository, which also means it does not
  guess for you.

## Is it for you?

**Probably yes if** you work with AI agents on code you have to maintain, and you
have ever merged something an agent called done and later found it was not.

**Probably not if** you want a linter or a formatter — this is not that — or if
the project is a throwaway prototype where nobody will read the history.

## It holds itself to the same standard

This repository is the plugin's own first user: 474 tests, 416 deliberate
breakages checked in CI, three operating systems, and a public record of every
time its own checks turned out to be wrong — including one that shipped, was
tested three times, and was never actually called by anything.

That last part is the point. If the failures were missing from this page, the
claims above would be exactly the confident writing the research warns you about.

---

## Install

```text
/plugin marketplace add D3-lt/quality-harness
/plugin install quality-harness@quality-harness
```

**Or paste this into Claude Code and let it do the whole thing:**

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

Then run `/quality-harness:work` once in the main session for substantive
development, or a narrower skill when the task already names its stage
(`/quality-harness:execution`, `/quality-harness:review`, `/quality-harness:adr-write`).

Requirements are in full below; the short version is Claude Code 2.1.154+, Python
3.9+, Node.js, Bash (Git Bash on Windows) and Git.

## Which AI tools this works with

Three tiers, and they are different because the parts are different. Only the
first is what this project tests on every commit — the rest are stated as what the
surface is, not as a measurement nobody took.

| | What you get | Status |
|---|---|---|
| **Claude Code** | Everything: the lifecycle skills, the hooks, the workflows and every gate | Tested on Linux, macOS and Windows in CI on every push |
| **Any MCP client** — Claude Desktop, and editors that speak MCP such as Cursor, Zed or Codex | The **read-only** gates over MCP stdio, via the bundled `qh-mcp` server. No shell needed | The server is tested here; those specific clients are not. Standard line-delimited JSON-RPC, so it should connect — tell us if it does not |
| **Any shell, any CI, no AI at all** | Every gate in `bin/` is a plain `python3` or `node` program with a meaningful exit code. `adr-lint`, `adr-verify`, `spec-verify`, `arch-lint` and the rest run from a Makefile or a GitHub Action | Tested — this repository gates itself with them |

**`qh-mcp` deliberately exposes only gates that READ.** The two that execute a
task's acceptance fence are absent, and there is no registrar that could add one;
a test asserts that against the source, so renaming a tool cannot smuggle one in.
A client with no shell gets to read the corpus, never to run text the corpus
supplies.

**Codex is a reviewer here, not a host.** `codex-review` and `codex-advise` shell
out to the Codex CLI to get a verdict from a *different model lineage*, because a
review by the family that wrote the code is worth less. That is optional and
nothing else depends on it.

## How this is benchmarked

Two different questions, measured two different ways.

**Do the gates catch what they claim?** A mutation campaign breaks one mechanism
at a time — 447 catalogued edits — and reports every test that did not notice.
`node scripts/mutate.mjs`. A gate with no mutation that can kill it is not
evidence, and CI runs the whole catalogue on every push to `main` and every tag,
with no reuse.

**Do the written instructions change what a model does?** That is a separate
claim and prose cannot support it, so there are behavioural evals under
`plugin/evals/` — Trigger, Compliance and Boundary facets, graded
deterministically wherever a deterministic grader can see the answer:

```text
CLAUDE_CODE_WALNUT_SPIRE=1 claude plugin eval --runs 1 --allow-tools Bash .
```

**The number worth quoting is the Δ, not the score.** The runner defaults to
`--ablation with-without`: every case also runs a no-plugin baseline. A score
without a baseline cannot tell a skill that works from a model that would have
answered well anyway. Cases come in given/omitted pairs for exactly this reason.

And it reports losses. One case measured **Δ 0.00 with the skill invoked zero
times** — the instruction did nothing — which is written down rather than dropped,
because an eval suite that only publishes its wins is the tone this project tells
you not to trust.

## The evidence behind those claims

*Everything above in the terms a sceptical engineer would want. Skip it if the
summary was enough.*

**False success is the dominant agent failure mode.** Among self-assessing coding
agents making explicit status claims, **75.8% of failures are false successes** —
the work did not happen and the report says it did. Asking another model to catch
it does not work: **LLM judges never exceed AUROC 0.65**, because they grade the
confident closing language rather than the state change. Cheap deterministic
detectors reach **0.83–0.95** on the same task. And a passing suite is weaker
evidence than it looks: **one in five "solved" patches on SWE-bench Verified is
semantically wrong**, passing only because the tests were too weak to expose it.

Sources and effect sizes: [`docs/research/2026-08-28-verification-is-the-bottleneck.md`](docs/research/2026-08-28-verification-is-the-bottleneck.md).
Its §10 is the narrower list — what this repository measured itself, including a
null it will not promote to support, a retraction of its own published number, and
a column for findings it negated, left empty because it has negated none.

### The mechanisms, precisely

| Instead of | You get |
|---|---|
| An agent writing "✅ all tests pass" into a task file | `adr-verify` **runs the fence itself** and writes the date, git sha, exit code, duration and a SHA-256 of the fence it ran. Edit the fence and every entry taken under the old one is invalidated. |
| A green suite you hope means something | A **436-mutation campaign** that breaks each mechanism on purpose and fails if nothing notices. A test that cannot fail is found before you trust it. |
| A gate that blocks you and cannot say why | Gates that **advise and never block**. A blocked agent produces a user who cannot tell what to do next, which is worse than not having the plugin. |
| "I checked, it's fine" | A check that **cannot determine something says so** — `UNRUN`, `PARTIAL`, `UNPROVEN` — and never borrows the vocabulary of a verdict. A filter that matched nothing is "I could not look", not "the thing is absent". |
| Decisions living in a chat log | An **executable ADR corpus** — Architecture Decision Records, one file per decision — whose readiness, coverage, dangling pointers and open debt are computed from the task files by `adr-next`, `adr-state.mjs` and `adr-debt`, not from a status column somebody typed. |

**A note on the words.** An *ADR* is a short file recording one decision and why it
was made. A *fence* is the exact command a task must pass. A *mutation* is a
deliberate break introduced to see whether any test notices. If those three are
clear, the rest of this page reads normally.

## What it includes

### Lifecycle skills

- `work` — main-session coordinator for substantive development.
- `spec-write` — facts-first requirements and executable scenarios.
- `adr-write` — proposed, executable architecture decision records.
- `adr-execute` — task-by-task execution of active Accepted ADRs.
- `adr-retire` — archive records without erasing authority or obligations.
- `arch-write` — current-state architecture mapping and audit.
- `execution` — bounded implementation with fresh evidence.
- `review` — evidence-backed code review with risk routing.
- `mutation-audit` — break a mechanism on purpose and measure whether anything notices.
- `postmortem` — structured learning from material failures.
- `codex-review` — fresh-context GPT-5.6 Sol verdict review.
- `codex-advise` — fresh-context GPT-5.6 Sol technical advice.
- `quality-policy` — the shared simplicity, evidence, and leaf-agent contract.

Plugin skills are namespaced by Claude Code, for example
`/quality-harness:work` and `/quality-harness:adr-write`.

### Executable gates

The plugin's `bin/` directory is added to the Bash tool's `PATH` while the
plugin is enabled:

- `spec-verify` — requirements carry falsifiable facts bound to tests.
- `adr-lint` — a record's own gate: grammar, coverage, evidence, and dangling pointers.
- `adr-verify` — runs a task's Acceptance fence and writes the evidence itself.
- `adr-judge` — the two axes a schema cannot see: does the record rest on anything observable.
- `adr-next` — readiness computed from the task files, not from a status column.
- `adr-debt` — deferred items and open follow-ups, swept so they resurface.
- `adr-retire-check` — retirement without erasing authority or obligations.
- `arch-lint` — architecture documents against the code they describe.
- `postmortem-verify` — a postmortem's claims against its evidence.
- `qh-mcp` — the reading gates over MCP, for clients with no shell.
- `qh-root` — resolves the installed plugin root for a caller that has no placeholder.

**Name the working-tree path when you are developing the plugin itself.** A bare
gate name on `PATH` resolves to an installed release, which is not your edit.

Three corpus readers ship as scripts rather than gates, because they judge nothing
and exit 0 whatever they find:

- `work-next.mjs` — which lifecycle stage is waiting, and the files that put it there.
- `adr-state.mjs` — what governs what, contested areas, dangling supersessions.
- `adr-context.mjs` — which records govern these files, including the ones that were killed.

Canonical templates live in `templates/`. Skills locate them through
`${CLAUDE_PLUGIN_ROOT}`; no user home path or project name is embedded.

### Standalone install maintenance

Some machines keep unnamespaced compatibility copies under the user's home so
`/adr-write` works beside `/quality-harness:adr-write`. Nothing updates those, so
the plugin reports on them and never acts:

- A session-start notice names a copy that has drifted, and measures which one a
  bare gate name actually reaches rather than asserting it.
- It also names a file a past installer left that this plugin no longer ships —
  but only when a digest, a forwarder mark, or lineage against a cached release
  proves the plugin wrote it. Anything it cannot prove is counted, never named,
  because a file it cannot identify may well be another tool's.
- `sync-standalone.mjs` reports the same set the notice does, writes only with
  `--apply`, and `--link` replaces each gate with a forwarder that no release can
  leave behind. Neither mode touches a file reported as no longer shipped.

### Hooks and workflows

- Protected-branch, leaf-agent, completion-evidence, and artifact gates.
- Immediate facts-first checks after edits, repeated before completion.
- `quality-cycle` for bounded high-risk review.
- `consensus` for genuinely unresolved, costly-to-reverse choices.
- `review-ring` for one review, at most one minimal fix, then caller revalidation.

These are native dynamic workflows, distributed from the plugin root and invoked as
`/quality-harness:quality-cycle`, `/quality-harness:consensus`, and
`/quality-harness:review-ring`. Use them only when the scripted orchestration earns its additional
agents and token cost; routine changes stay in the main session or one bounded subagent.

## Requirements

- Claude Code 2.1.154 or newer. Dynamic workflows must be enabled; on Pro, enable them in `/config`.
- Python 3.9 or newer.
- Node.js.
- Bash. On Windows, use Git for Windows (Git Bash).
- Git.
- Codex CLI only for `codex-review`, `codex-advise`, or Codex workflow nodes.

On Windows, `jq` is recommended for advisory JSON syntax checks and general
command-line use, but hook dispatch does not depend on it:

```powershell
winget install jqlang.jq
```

The plugin ships no project-specific ADR locations, test commands, repository
allowlists, or business policy. It discovers and follows the active repository.

## Efficient operating model

- **Skills** carry reusable judgment and procedures. Only their compact descriptions are visible
  until selected; the full body loads on demand. Plugin skills are available to main sessions and
  discoverable by subagents under the `quality-harness:` namespace.
- **Dynamic workflows** hold repeatable fan-out, critique, and synthesis in script variables so
  intermediate agent output does not pollute the main context. Use them for the three explicitly
  bounded cases above, not as a default for routine work.
- **Subagents** are isolated leaves for narrow implementation, review, or research. Give them one
  owned scope and the exact namespaced skill they need; do not preload the entire lifecycle.
- **Command hooks** enforce deterministic policy and executable gates. The plugin intentionally
  avoids experimental agent hooks for production-critical blocking behavior.
- **Templates** stay centralized under `templates/` because several skills share the same schemas.
  Skills resolve them with `${CLAUDE_PLUGIN_ROOT}` instead of copying instructions into every skill.

This separation keeps context small, makes orchestration repeatable only where it earns its cost, and
keeps correctness gates outside model discretion.

## Repository layout

The plugin is `plugin/`, and it is the only thing published: `.claude-plugin/marketplace.json`
declares `"source": "./plugin"`, so an install carries 663 K rather than the repository's 1,619 K
and none of the work that produces it. `tests/`, `docs/` and the three gates this repository runs on
itself — `scripts/selftest.sh`, `scripts/coverage.sh`, `scripts/mutate.mjs` — stay above that
boundary and are checked on every push without shipping. A file committed under `plugin/` that is
not part of the plugin fails the suite (ADR-008).

## Test locally

From the repository's parent directory:

```bash
claude --plugin-dir ./quality-harness/plugin
```

Run the complete package verification, from the repository root:

```bash
./quality-harness/scripts/selftest.sh
```

The test suite validates the manifest, every skill's routing metadata, executable
permissions and syntax, lifecycle behavior, positive gate fixtures, and negative
controls proving the gates can reject invalid artifacts.

The Node hook runner parses Claude Code payloads before the bundled Bash gates
execute, so hook dispatch has no `jq` or Python dependency. On Windows it resolves
Git Bash from `CLAUDE_CODE_GIT_BASH_PATH`, then PATH (excluding the System32 WSL
stub), then per-user and system Git for Windows installs. It also normalizes
drive-letter and UNC paths before invoking the gates.

Normal `Stop` handling stays inside Node and checks only whether successful
repository evidence followed the final mutation. Full artifact gates remain strict
at `git commit`/`git push`, `TaskCompleted`, and `SubagentStop`, avoiding repeated
Git Bash launches when a main session merely stops on macOS or Windows.

The bundled Python gates explicitly read, write, and print UTF-8 so ADR evidence
remains valid on Windows code pages. Lifecycle classification treats visible,
read-only interpreter snippets as diagnostics while unknown scripts and unrecognized
calls remain mutation-capable; a repository validation must still follow them.

## Distribute

This directory can be published as a standalone Git repository. It includes a
single-plugin marketplace at `.claude-plugin/marketplace.json`.

After publishing it, users can run:

```text
/plugin marketplace add OWNER/REPOSITORY
/plugin install quality-harness@quality-harness
```

For local marketplace testing:

```text
/plugin marketplace add /absolute/path/to/quality-harness
/plugin install quality-harness@quality-harness
```

A marketplace added from a local PATH copies the working tree, ignored files included, so an install
made that way is larger than the published one and is not a measurement of what a user downloads.
Adding it by `OWNER/REPOSITORY` clones, and a clone has only what is tracked.

Run `/reload-plugins` if Claude Code asks for it after installation or update.
Claude's current plugin structure and distribution behavior are documented in
[Create plugins](https://code.claude.com/docs/en/plugins) and
[Plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces). Workflow behavior,
cost, limits, and plugin distribution are documented in
[Dynamic workflows](https://code.claude.com/docs/en/workflows).

## ADR archive model

Physical location controls the active validation cohort. Decision effect controls
authority. An archived exact-`Accepted` ADR can remain governing, so the active
catalog must still link it. Unresolved archived obligations require active backlog
receipts, and frozen decision-unit hashes detect silent historical edits.

Archive is never a synonym for superseded.

## License

MIT. See [LICENSE](LICENSE).
