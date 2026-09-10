# Task ADR-044-T1: Ship a compose recipe, not a replacement command

**Depends-on:** none
**Covers:** F-1, UC1-S1, UC1-S2, UC1-S3, UC1-S4
**Estimated scope:** S (docs and header; no render change)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

INSTALL, plugin README, and the `statusline.mjs` header show compose: keep the host command, same `$input`, append stdout. Must not require deleting `refreshInterval`. Must not claim QH set the bar. No layer token on the segment.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/INSTALL.md` | edit | copy-paste is compose, not the one-liner as the whole command |
| `plugin/README.md` | edit | same class |
| `plugin/scripts/statusline.mjs` | edit | header recipe is the same class; do not change `render()` / `reading()` |
| `tests/statusline.test.mjs` | add | fails if the one-liner is still the whole copyable `statusLine.command` |

## Ordered Steps

1. [S1] Bind the failing tests for the Covers IDs. [proof: acceptance]
2. [S2] Reshape INSTALL, plugin README, and the `statusline.mjs` header to compose. [proof: acceptance]
3. [S3] Keep `render()` / `reading()` and `hooks.json` unchanged. [proof: acceptance]

## Acceptance

```bash
node --test --test-name-pattern 'statusline segment:' tests/statusline.test.mjs && node --test --test-name-pattern 'the wired statusline segment does not grow a layer token' tests/statusline.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `statusline segment: copy-paste is compose not a replacement command` | `tests/statusline.test.mjs` | INSTALL, plugin README, and the header keep the host command, feed `$input`, append stdout; none is the one-liner as the whole command | F-1, UC1-S1, UC1-S2 | S1, S2 |
| `statusline segment: recipe does not delete refreshInterval or claim QH set the bar` | `tests/statusline.test.mjs` | refreshInterval is named and not required to be deleted; cannot-set statusLine; hooks.json has no statusLine | F-1, UC1-S3 | S1, S2, S3 |
| `the wired statusline segment does not grow a layer token` | `tests/statusline.test.mjs` | `render()` has no layer token | F-1, UC1-S4 | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | F-1 tests over shipped strings |
| 2 — something selects it | INSTALL / README / header are the paste surfaces |
| 3 — the caller can discover it | those three files |
| 4 — it is used | an adopting engineer pastes the recipe |

## Mutation Log

- 2026-09-10 · fe80715* · mutant killed · exit 1 · `plugin/README.md` · restoring the one-liner as the README copy-paste makes that block the whole statusLine.command again · acceptance-sha256:88fd874029e3dd265edcc7c0da8592f34df0d909697d44c71c2bfeef18a9b6cf

## Invariants

- The copyable block is not the QH one-liner as the whole `statusLine.command`.
- `refreshInterval` is not required to be deleted.
- `hooks.json` has no `statusLine`. `render()` has no layer token.
- Does not reverse ADR-038–043. Does not change `reading()`.

## Risks

- First README command test still matches `qh-doctor` (it must).
- A warning that *mentions* the one-liner in backticks is not a copyable replacement block; a line whose only command *is* that one-liner must fail.

## Stop Condition

A green test while any of the three surfaces still pastes the one-liner as the whole command.

## Out of Scope

- `render()` / `reading()` behaviour (permanent: boundary: ADR-042)
- `--json` `layer` (permanent: boundary: ADR-043)
- Layer on the bar (permanent: boundary: leftover grill)

## Notes

Class: every shipped copyable statusline snippet. Sweep: `rg -n 'node "$(qh-root)/scripts/statusline.mjs"'` excluding specs and ADRs. Outermost: shipped docs/header strings.

## Verification Log
- 2026-09-10 · fe80715* · exit 1 · `node --test --test-name-pattern 'statusline segment:' tests/statusline.test.mjs && node --test --test-name-pattern 'the wired statusline segment does not grow a layer token' tests/statusline.test.mjs` · acceptance-sha256:88fd874029e3dd265edcc7c0da8592f34df0d909697d44c71c2bfeef18a9b6cf · ms:202
  ```
  --- last 10 line(s) of stdout (of 433 after folding 433 raw)
        at Test.postRun (node:internal/test_runner/test:1235:19)
        at Test.run (node:internal/test_runner/test:1163:12)
        at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3) {
      generatedMessage: true,
      code: 'ERR_ASSERTION',
      actual: '# Install\n\nThe two-line install is at the top of the [README](../README.md). This page is everything the\ntwo lines do not say: what you need, how to check it worked, what it adds to a session, and the\nroutes for machines that are not a Claude Code terminal. Updating is a separate page —\n[UPDATE.md](UPDATE.md) — because the things that go wrong on update are different things.\n\nEvery command below was run on 2026-09-04 against plugin 2.64.0 and Claude Code 2.1.260 unless a\nline says otherwise. Where a statement comes from Claude Code\'s documentation rather than from a\nrun here, it says so.\n\n## What you need\n\n| | Required | What is actually tested |\n|---|---|---|\n| Claude Code | 2.1.154 or newer — the build dynamic workflows shipped in. On Pro, enable them in `/config`. | Developed against 2.1.260. Older builds are not re-tested. |\n| Python | 3.9 or newer, by syntax: the gates use `list[str]`-style annotations under `from __future__ import annotations` and no `match` statement. | **3.12** — the only version CI runs, on all three operating systems. |\n| Node.js | Any current release. | **24**, in CI. |\n| Bash | Any. On Windows: Git for Windows (Git Bash). The hook runner finds it from `CLAUDE_CODE_GIT_BASH_PATH`, then `PATH` (skipping the System32 WSL stub), then the per-user and system Git for Windows installs. | Windows CI runs the whole suite through it. |\n| Git | Any. | — |\n| Codex CLI | Only for `/quality-harness:codex-review` and `:codex-advise`. Nothing else depends on it. | Not in CI. |\n| `jq` | Optional, Windows only — advisory JSON checks. Hook dispatch does not use it. `winget install jqlang.jq` | — |\n\nThe plugin ships no project-specific paths, test commands or policy. It reads the repository it\nis run in.\n\n## Install into Claude Code\n\nIn a Claude Code session:\n\n```text\n/plugin marketplace add D3-lt/quality-harness\n/plugin install quality-harness@quality-harness\n```\n\nThe install summary says either `Plugin is now active.` or `Run /reload-plugins to activate.` —\ndo what it says. If `/reload-plugins` warns that it would invalidate the prompt cache, run\n`/reload-plugins --force`.\n\nFrom a shell, without a session (installs to user scope unless `--scope` says otherwise; the\nplugin loads at the next launch):\n\n```bash\nclaude plugin marketplace add D3-lt/quality-harness\nclaude plugin install quality-harness@quality-harness\n```\n\nScopes, from Claude Code\'s documentation: **user** (you, every project — the default), **project**\n(every collaborator, written to `.claude/settings.json`), **local** (you, this repository only).\n\n## Check it worked\n\nFour commands, each answering a different question. Run them rather than trusting this page.\n\n```bash\nclaude plugin list                             # installed, version, scope, enabled\nadr-lint --version                             # which copy a bare gate name reaches — path included\nqh-root                                        # the newest install on this machine\nnode "$(qh-root)/scripts/qh-doctor.mjs"        # what ships, drift, and how many findings fail vs advise\n```\n\n`adr-lint --version` answers with the version **and the directory it was loaded from**. That is\nthe line to read when two gates seem to disagree: on a machine with more than one copy, a bare\nname can reach either.\n\nTo see the inventory and what it costs in context before deciding to keep it:\n\n```bash\nclaude plugin details quality-harness\n```\n\nOn 2.64.0 that reports 14 skills, 4 agents and 7 hook events, and an always-on cost of about\n2,300 tokens per session; each skill costs more only when it fires. Re-run it for the version you\nhave — the number is measured by the CLI, not written here.\n\n## What it adds to a session\n\n- **Skills**, namespaced: `/quality-harness:work`, `/quality-harness:adr-write`, and the rest. The\n  namespace is deliberate; it says which copy answered.\n- **Agents**, namespaced `qh-`, so they cannot shadow a role you or your host defines.\n- **Hooks** on `SessionStart`, `SubagentStart`, `SubagentStop`, `TaskCompleted`, `Stop`,\n  `PreToolUse` and `PostToolUse`. They advise and never seize the session (README, "It never\n  blocks you").\n- **Status line (user-wired).** The plugin cannot set Claude\'s `statusLine`. Add this to your own command to see `QH ✗` for unverified work and UNPROVEN writes:\n  `node "$(qh-root)/scripts/statusline.mjs" <<< "$input"`\n\n- **`bin/` on the Bash tool\'s `PATH`** while the plugin is enabled — Claude Code does this for any\n  plugin that ships a `bin/` directory. So `adr-lint`, `adr-verify`, `qh-root` and the other gates\n  resolve by bare name inside a session. Outside a session they do not, unless you create\n  forwarders (below).\n- **No MCP server, LSP server or settings** are declared by the manifest. `qh-mcp` exists for\n  clients you register it with yourself; see "Claude Desktop" below.\n\n⚠ **Organisation-distributed installs lose `bin/`.** Claude Code\'s plugin documentation states that\na plugin distributed through claude.ai organisation settings cannot include a top-level `bin/`\ndirectory. Not measured here — nobody has installed this plugin that way — but if you do, expect\nto call the gates by path: `python3 "$(qh-root)/bin/adr-lint"`, and `qh-root` itself by its path.\n\n## A guided first run\n\nPaste this into Claude Code after installing, and it will show you what it added rather than\ntelling you:\n\n```text\nInstall the Quality Harness plugin and show me what it added.\n\n1. Run: /plugin marketplace add D3-lt/quality-harness\n2. Run: /plugin install quality-harness@quality-harness\n3. Restart when prompted, then run `qh-root` and list the gates in its bin/ directory.\n4. Tell me which lifecycle stage my repository is at by running\n   `node "$(qh-root)/scripts/work-next.mjs"` — it reads, judges nothing, and exits 0\n   whatever it finds.\n5. Summarise in three lines: what got installed, what it will do the next time I\n   ask for substantive work, and what it will NOT do without me asking.\n```\n\nThen: [TUTORIALS.md](TUTORIALS.md) for ten minutes on a throwaway repository, or\n[ONBOARDING.md](ONBOARDING.md) for the first week.\n\n## Bare gate names outside a session\n\nInside a Claude Code session, `bin/` is on `PATH`. In your own terminal it is not. Two routes:\n\n- **Forwarders** — `node "$(qh-root)/scripts/sync-standalone.mjs" --link` writes one small script\n  per gate under `~/.claude/bin/`, each resolving the newest installed plugin **at call time**, so\n  no release can leave them behind. Put `~/.claude/bin` on your shell `PATH`.\n- **Never `--apply`.** That writes a *copy*, and a copy is stale by the next release. The\n  session-start notice will then report it as drifted, every session, until you replace it.\n\n## Claude Desktop, and any other MCP client\n\nDesktop has no shell, no hooks and no plugin loader; it has MCP. The plugin ships `qh-mcp`, a stdio\nserver exposing the **reading** gates — `adr-lint`, `adr-next`, `adr-debt`, `adr-judge`,\n`arch-lint`, `adr-retire-check`, `postmortem-verify` — and deliberately not the two that execute\ntext from your corpus. [mcp.md](mcp.md) has the registration, the three things that cost people an\nafternoon, and the one-line probe to run before touching Desktop.\n\nTwo facts that belong here rather than there:\n\n- **The registration names an absolute path, and that path decides what version Desktop runs.**\n  A path under the plugin cache (`.../quality-harness/quality-harness/2.64.0/bin/qh-mcp`) is pinned\n  to that version and stays there through every update. A path into a git checkout runs whatever\n  is on disk at call time. Neither is wrong; both need to be a decision. [UPDATE.md](UPDATE.md)\n  says what to do at each update.\n- **From Desktop you can be told what is wrong; you cannot record that you fixed it.** The evidence\n  half of the lifecycle — `adr-verify` — needs a shell. Cursor, Zed, Codex and any other MCP client\n  get the same seven tools and the same limit; the server is tested here, those clients are not.\n\n## Codex\n\nCodex is a **reviewer** in this plugin, not a host. `/quality-harness:codex-review` and\n`:codex-advise` shell out to the Codex CLI for a verdict from a different model lineage. Install\nthe Codex CLI and authenticate it; nothing else changes.\n\nThere is nothing to install into Codex as a host. The `AGENTS.md` in this repository exists so a\nCodex session can *develop the plugin*; it is not a surface the plugin offers to your project.\n\n## No AI at all: CI and Makefiles\n\nEvery gate in `bin/` is a plain `python3` or `node` program with a meaningful exit code. Clone the\nrepository, or point at the installed copy, and run them directly:\n\n```bash\npython3 plugin/bin/adr-lint docs/adr/ADR-001-skills-are-never-linked.md          # from a clone\npython3 "$(qh-root)/bin/adr-lint" docs/adr/ADR-001-skills-are-never-linked.md    # from an install, in a shell that has qh-root\n```\n\nThey exit non-zero on a failing finding and print advisories that do not fail; `qh-doctor`\nprints the current split. This repository gates itself this way on every push.\n\n## Developing the plugin itself\n\n```bash\nclaude --plugin-dir ./quality-harness/plugin\n```\n\nA `--plugin-dir` plugin with the same name as an installed one takes precedence for that session,\nso you can test a checkout without uninstalling the release. **Call gates by working-tree path**\n(`python3 plugin/bin/adr-lint`) while you do — a bare name reaches the installed copy, not your\nedit. `bash scripts/selftest.sh` is the repository\'s own gate; exit 0 or it did not pass.\n\n## Uninstall\n\n```text\n/plugin uninstall quality-harness@quality-harness\n```\n\nOr `claude plugin uninstall quality-harness@quality-harness` from a shell. What that does **not**\nremove: previous versions under `~/.claude/plugins/cache/quality-harness/`, and any forwarders you\ncreated under `~/.claude/bin/`. Delete both by hand if you want a clean machine; the forwarders\nwill otherwise report that no plugin resolves, which is correct.\n',
      expected: /refreshInterval/,
      operator: 'match',
      diff: 'simple'
    }
  ```
- 2026-09-10 · fe80715* · exit 0 · `node --test --test-name-pattern 'statusline segment:' tests/statusline.test.mjs && node --test --test-name-pattern 'the wired statusline segment does not grow a layer token' tests/statusline.test.mjs` · acceptance-sha256:88fd874029e3dd265edcc7c0da8592f34df0d909697d44c71c2bfeef18a9b6cf · ms:137
