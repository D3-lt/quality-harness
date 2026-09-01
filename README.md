# Quality Harness

A self-contained Claude Code plugin for project-neutral development discipline:
requirements, ADR authoring and execution, architecture, executable evidence,
retirement, review, and scope control.

The plugin prefers small verified changes over feature breadth. It applies SOLID
and DRY only to demonstrated boundaries and duplicated knowledge; YAGNI wins over
speculative abstractions, configuration, and fallback paths.

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
