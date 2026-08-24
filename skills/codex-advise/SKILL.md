---
name: codex-advise
description: >-
  Ask a fresh-context, read-only Codex GPT-5.6 Sol session for grounded advice in any project. Use for
  an independent second opinion on architecture, ADR shaping, design tradeoffs, debugging hypotheses,
  incident reasoning, or a difficult technical decision. Routes high, xhigh, or ultra effort from
  task risk and breadth. Do not use for a verdict-bearing change review (use codex-review), routine
  implementation, or an unscoped “look at everything” request.
---

# Codex Advise

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

- Pin `gpt-5.6-sol` and explicitly pass exactly one of `high`, `xhigh`, or `ultra`.
- Run in a read-only sandbox and ephemeral session. Codex must not edit, stage, commit, push, deploy,
  or contact anyone.
- Ask a concrete question, name the relevant repository/artifacts, and separate observed facts from
  inference. Advice may be provisional, but uncertainty must be visible.
- Use a unique temporary output per run; wait for exit and require exit zero plus non-empty output
  before reading it. A missing result is failure, not advice.

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
| `ultra` | Broad high-impact architecture, migration/incident strategy, irreversible choice, or an explicitly exhaustive question where automatic delegation materially helps. |

Never silently downgrade. Reject other effort strings. On a new or upgraded installation, use
`"<absolute-codex>" debug models --bundled` to confirm the chosen level under `gpt-5.6-sol`; fail
clearly if that exact combination is unavailable.

## Resolve and run Codex

Resolve the absolute binary from executable `CODEX_CLI_PATH`, then the ChatGPT-bundled binary, then
`command -v codex`; probe it with `--version`. If no binary exists, report Codex unavailable without
substituting another reviewer under the same name.

Create a unique run directory with `mktemp -d` and an absolute final-message path inside it. Use
`--ignore-user-config` when `"<absolute-codex>" exec --help` exposes it. Run in the foreground with
all options explicit:

```bash
"<absolute-codex>" exec <optional-ignore-user-config> \
  -C "<working-directory>" -s read-only \
  -m gpt-5.6-sol -c 'model_reasoning_effort="<high|xhigh|ultra>"' \
  -c 'sandbox_mode="read-only"' --ephemeral \
  -o "<absolute-unique-output>" \
  <optional-skip-git-repo-check> \
  "CODEX-ADVISE-LEAF: <advice contract, question, constraints, and exact paths to inspect>"
```

Add `--skip-git-repo-check` only for explicitly scoped non-Git work. Name untrusted files for Codex
to inspect; do not interpolate their contents into shell syntax. After Codex exits, record the actual
exit status, require a non-empty output file, read it once, then remove the exact temporary directory.

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
