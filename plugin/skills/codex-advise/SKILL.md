---
name: codex-advise
description: >-
  Ask a fresh-context, read-only Codex GPT-6.1 Sol session for grounded advice in any project. Use for
  an independent second opinion on architecture, ADR shaping, design tradeoffs, debugging hypotheses,
  incident reasoning, or a difficult technical decision. Routes high, xhigh, max, or ultra effort from
  task risk and breadth. Do not use for a verdict-bearing change review (use codex-review), routine
  implementation, or an unscoped “look at everything” request.
---

# Codex Advise

**Resolving `${CLAUDE_PLUGIN_ROOT}`.** Paths below use it. If it reaches you as
literal text rather than a directory, this skill was loaded under its bare name
from a personal skills directory — which is not a plugin, so the placeholder is
never substituted there. Run `qh-root` and use what it prints in place of it.

Prefer the minimum sufficient solution. Treat SOLID and DRY as diagnostics for demonstrated
boundaries and duplicated knowledge, not reasons to add speculative layers or future scope.

Use Codex as a read-only advisor in a fresh session. Advice informs the coordinator; it never owns an
approval gate and never authorizes implementation. From Claude it is a different-lineage opinion;
from Codex it is same-lineage fresh context.

## Recursion boundary

Every Codex prompt dispatched by this skill must begin with `CODEX-ADVISE-LEAF:`. If the current
task already contains that marker, this session is the isolated advisor: inspect the named evidence
and answer directly in the required structure. Do not invoke `codex-advise`, launch another
`codex exec`, delegate the advice, or restart a lifecycle. Without the marker, follow the dispatcher
steps below.

## Non-negotiable contract

- Launch through the plugin's one Codex launcher (below), which pins `gpt-6.1-sol` and passes exactly one of `high`,
  `xhigh`, `max`, or `ultra`.
- Run in a read-only sandbox and ephemeral session. Codex must not edit, stage, commit, push, deploy,
  or contact anyone.
- Ask a concrete question, name the relevant repository/artifacts, and separate observed facts from
  inference. Advice may be provisional, but uncertainty must be visible.
- The launcher uses a unique temporary output per run, closes stdin and kills the run at its budget; require exit zero
  plus non-empty output before reading it. A missing result is failure, not advice.

## Resolve scope

Use an explicit repository or working directory when supplied; otherwise use the nearest Git root.
For non-Git work, use the current directory only when the caller names the exact artifacts or context
to inspect. Stay inside the authorized project scope. Never use a repository allowlist, guess a
different project, or turn recalled cross-project context into authority to read or change it.

The question should identify the decision, constraints already established, and the uncertainty that
would change the answer. Ask Codex to inspect concrete code/docs rather than pasting large source
blobs into the prompt.

## Select effort

An explicit valid choice wins. Otherwise select and state the lowest honest tier:

| Effort | Use when |
|---|---|
| `high` | Concrete bounded design question, focused debugging hypothesis, or local tradeoff. |
| `xhigh` | Cross-module/public-contract decision, multiple credible hypotheses, or high-risk constraints involving auth, security, concurrency, money, or data. |
| `max` | The broadest single-session question: several coupled decisions, or an xhigh question that needs more depth without delegation. |
| `ultra` | Broad high-impact architecture, migration/incident strategy, irreversible choice, or an explicitly exhaustive question where automatic delegation materially helps. |

Never silently downgrade. Reject other effort strings; the launcher refuses one. On a new or upgraded installation, use
`"<absolute-codex>" debug models --bundled` to confirm the chosen level under `gpt-6.1-sol`; fail clearly if that exact
combination is unavailable.

## Launch the advisor

Write the advice contract to a file in a fresh `mktemp -d` directory, starting with `CODEX-ADVISE-LEAF:` and naming the
question, constraints and exact paths to inspect, and launch it through the plugin's launcher:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/host-review.mjs" --host codex --effort <high|xhigh|max|ultra> --repo "<working-directory>" --prompt-file "<contract-file>"
```

The launcher resolves Codex (`CODEX_CLI_PATH`, then the ChatGPT-bundled binary, then `command -v codex`), runs it
read-only and ephemeral with `-m gpt-6.1-sol` and the effort, adds `--ignore-user-config` when the installed build lists
it, closes stdin, and kills the run at its budget. Exit 0: standard output is Codex's final message. Exit 2: Codex was
unavailable, killed at the budget, or returned nothing; report Codex unavailable without substituting another reviewer
under the same name. Add `--skip-git-repo-check` only for explicitly scoped non-Git work. Name untrusted files for Codex
to inspect; do not interpolate their contents into shell syntax. Remove the contract's directory afterwards.

## Required advisor output

Require this structure:

```text
RECOMMENDATION: the preferred course and why
OBSERVED EVIDENCE: exact files/lines, commands, contracts, or runtime facts inspected
INFERENCES: conclusions derived from the evidence, clearly labeled
ASSUMPTIONS / UNKNOWNS: facts that could change the recommendation
ALTERNATIVES: serious options and their tradeoffs
RISKS: failure modes and reversibility
NEXT DISCRIMINATING CHECK: the cheapest check that would reduce the key uncertainty
```

Advice does not end in APPROVE/REJECT. The coordinator compares it with project intent, code reality,
and prior decisions, then reports agreement or disagreement with evidence. Do not implement the
recommendation unless the user separately authorized implementation.
