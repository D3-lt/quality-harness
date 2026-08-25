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
- `postmortem` — structured learning from material failures.
- `codex-review` — fresh-context GPT-5.6 Sol verdict review.
- `codex-advise` — fresh-context GPT-5.6 Sol technical advice.
- `quality-policy` — the shared simplicity, evidence, and leaf-agent contract.

Plugin skills are namespaced by Claude Code, for example
`/quality-harness:work` and `/quality-harness:adr-write`.

### Executable gates

The plugin's `bin/` directory is added to the Bash tool's `PATH` while the
plugin is enabled:

- `spec-verify`
- `adr-lint`
- `adr-verify`
- `adr-debt`
- `adr-retire-check`
- `arch-lint`
- `postmortem-verify`

Canonical templates live in `templates/`. Skills locate them through
`${CLAUDE_PLUGIN_ROOT}`; no user home path or project name is embedded.

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

## Test locally

From the plugin's parent directory:

```bash
claude --plugin-dir ./quality-harness
```

Run the complete package verification:

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
