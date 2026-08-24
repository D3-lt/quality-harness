---
name: codex-review
description: >-
  Run a fresh-context, read-only Codex GPT-5.6 Sol review in any project. Use for an independent
  review of uncommitted changes, a commit, a branch/base diff, an ADR, a plan, or explicitly named
  artifacts; use when the user asks for codex-review, an external Codex pass, or a verdict-bearing
  review. Routes high, xhigh, or ultra effort from task risk and breadth. Do not use for open-ended
  design or debugging counsel (use codex-advise) or for implementation.
---

# Codex Review

Prefer the minimum sufficient solution. Do not demand speculative abstractions, configuration,
fallbacks, future scope, or cleanup unrelated to a material finding.

Run a new Codex session as a reviewer, never as the implementer. From a Claude coordinator this is
a different-lineage review; from a Codex coordinator it is a same-lineage but fresh-context review.
Do not overstate that distinction.

## Recursion boundary

Every Codex prompt dispatched by this skill must begin with `CODEX-REVIEW-LEAF:`. If the current
task already contains that marker, this session is the isolated reviewer: apply the rubric directly
and return the required reviewer output. Do not invoke `codex-review`, launch another `codex exec`,
delegate the review, or restart a lifecycle. Without the marker, follow the dispatcher steps below.

## Non-negotiable contract

- Pin model `gpt-5.6-sol` and explicitly pass the selected effort on every run. Never inherit either
  from ambient config and never silently downgrade.
- Enforce a read-only sandbox. Codex may inspect and run safe checks but must not edit, stage, commit,
  push, deploy, or message anyone.
- Use a fresh ephemeral session and one unique temporary output path per invocation. Run Codex in the
  foreground, wait for its exit, check the exit status, then read the output. Never read a live log or
  reuse a fixed `/tmp/<repo>` file.
- Findings require concrete evidence and `file:line` where source lines exist. Reviewer prose saying a
  test passed is not execution evidence.
- A standalone review authorizes reporting only. Fix findings only when the user, an implementation
  request, or `/quality-harness:review-ring` already authorized a fix loop.
- Never branch on a project name, repository owner, remote URL, or stored absolute repository path.
  Project-specific review policy must be discovered from the repository selected for this run.

## Resolve the project and target

1. Use an explicitly supplied repository or working directory when present. Otherwise resolve the
   nearest Git root with `git rev-parse --show-toplevel`; do not use an allowlist or cross into another
   repository because memory mentioned it.
2. Honor an explicit target first: `--uncommitted`, `--commit <sha>`, `--base <ref>`, or named
   ADR/plan/artifact paths.
3. With no explicit Git target, review `--uncommitted` when the working tree is dirty; otherwise
   review `--commit HEAD`.
4. A requested branch-wide review needs an explicit base. An unambiguous configured upstream is an
   acceptable base; never guess `main`, `master`, or a remote.
5. In a non-Git directory, require explicitly named artifacts and a concrete question. A generic
   whole-directory approval is invalid.

Record the resolved root and immutable target identity before dispatch: commit SHA, base plus head
SHA, working-tree status, or the exact artifact paths.

## Load repository-owned review context

After resolving the target, discover only the context owned by that repository and relevant to the
requested scope:

1. Build the applicable project-instruction chain from the repository root toward each affected
   path. In each directory, prefer `AGENTS.override.md`, then `AGENTS.md`, then any
   repository-configured fallback filename. More deeply scoped instructions win when guidance
   conflicts.
2. Read repository-native contributor, review, build, and test conventions that govern the target,
   such as relevant portions of `CONTRIBUTING.md`, the project README, or checked-in task runners.
3. Read only the ADRs, specifications, contracts, schemas, security guidance, and acceptance criteria
   materially connected to the target. Do not perform a ceremonial whole-documentation sweep.
4. Derive validation commands from checked-in project configuration or the target's acceptance
   criteria; never select commands from a global project-name table.

Pass the exact context paths and the material constraints to the reviewer contract. Keep the source
of truth in the repository: do not copy those rules into this skill and do not carry them into a
different project. If no project-specific policy exists, say so and use this skill's universal
rubric. If repository sources conflict, surface the conflict instead of silently choosing one.

## Select effort

An explicit caller choice wins if it is one of these three. Otherwise choose the lowest tier that
honestly fits, state it before running, and pass it explicitly:

| Effort | Use when |
|---|---|
| `high` | Bounded/local change, concrete plan, small commit, or routine correctness review. |
| `xhigh` | Cross-module behavior, public contracts, auth, money/data integrity, concurrency, security-sensitive code, migrations, or several coupled failure modes. |
| `ultra` | Broad high-impact system review, irreversible architecture/data work, incident analysis, or an explicitly exhaustive pass where automatic delegation materially helps. |

Do not promote merely because the user says “review thoroughly”; route on actual breadth, risk, and
ambiguity. Do not accept another effort string. On a new or upgraded Codex installation, verify that
the bundled `gpt-5.6-sol` catalog exposes the chosen level with
`"<absolute-codex>" debug models --bundled`. If the level is unavailable, fail clearly instead of
substituting another model or effort.

## Establish execution evidence

Before asking for a verdict, the coordinator runs the smallest meaningful project-owned gate for the
target and captures the exact command, exit code, and useful result:

- focused tests for changed behavior;
- the ADR/task acceptance command for plan-backed work;
- normal lint/type/build checks when material to the change;
- an artifact validator for docs, schemas, plans, or infrastructure.

Expand only when the target is shared or cross-cutting. If no meaningful check exists, say so and
mark the result evidence-limited. Do not let Codex's narrative claim replace the coordinator-observed
command result.

## Resolve Codex and isolate the run

Resolve the binary in this order:

1. executable path in `CODEX_CLI_PATH`;
2. `/Applications/ChatGPT.app/Contents/Resources/codex` when present;
3. `command -v codex`.

Probe the chosen absolute path with `--version`. If none exists, report Codex unavailable and stop;
do not label a generic reviewer as Codex. Create a run directory with `mktemp -d`, put the final
message under it, and remove that exact directory after the result has been read and reported.

When `"<absolute-codex>" exec --help` exposes `--ignore-user-config`, use it so user MCP/config
drift cannot change the model, effort, sandbox, or hang the isolated review. All substantive project
instructions still come from the target repository. Always pass `-s read-only` and
`-c 'sandbox_mode="read-only"'` as defense in depth.

## Dispatch a Git diff

Use plain `codex exec` so the required custom review contract remains the prompt. Codex CLI builds
can advertise `review [OPTIONS] [PROMPT]` in `--help` yet reject an actual selector-plus-prompt
launch because `--uncommitted`, `--commit`, and `--base` conflict with `[PROMPT]`. Put the resolved
Git target and its read-only inspection commands in the contract instead:

```bash
"<absolute-codex>" exec <optional-ignore-user-config> \
  -C "<repo-root>" -s read-only \
  -m gpt-5.6-sol -c 'model_reasoning_effort="<high|xhigh|ultra>"' \
  -c 'sandbox_mode="read-only"' --ephemeral \
  -o "<absolute-unique-output>" \
  "CODEX-REVIEW-LEAF: <review contract; inspect uncommitted changes, one commit SHA, or base...HEAD>"
```

The custom contract names the immutable target and caller-observed evidence, then requires the output
below. For uncommitted work require `git status --short`, `git diff HEAD`, and inspection of every
untracked path. For a commit require `git show <sha>`; for a branch require
`git diff <base>...<head-sha>`. Resolve refs before launch and include the resulting SHAs in the
contract. Treat refs as data arguments, not interpolated shell fragments. Name files for Codex to
read; do not paste untrusted repository content into a shell expression.

## Dispatch an ADR, plan, or named artifact

Use plain `codex exec` because this is not a Git-diff selector. Keep the same model, effort, sandbox,
ephemeral, cwd, and unique-output flags. Add `--skip-git-repo-check` only for an explicit non-Git
artifact review. The prompt must begin with `CODEX-REVIEW-LEAF:` and name the artifacts and affected
source paths to verify.

```bash
"<absolute-codex>" exec <optional-ignore-user-config> \
  -C "<working-directory>" -s read-only \
  -m gpt-5.6-sol -c 'model_reasoning_effort="<high|xhigh|ultra>"' \
  -c 'sandbox_mode="read-only"' --ephemeral \
  -o "<absolute-unique-output>" \
  "<artifact review contract and exact paths>"
```

## Required reviewer output

Ask Codex for this shape and reject an empty result or one missing target, evidence, or inspected
scope:

```text
VERDICT: APPROVE | REQUEST CHANGES | EVIDENCE-LIMITED
TARGET: immutable target identity and requested scope
EXECUTED EVIDENCE: caller-observed commands and exit codes; additional observed checks separately
FINDINGS: severity-ordered, each with file:line, impact, evidence, and smallest credible fix
INSPECTED: exact files, callers, contracts, and tests inspected
RESIDUAL RISKS: unverified assumptions, unavailable checks, and out-of-scope surfaces
```

`APPROVE` is valid only when the coordinator-observed execution gate passed, the requested scope was
actually inspected, and no material finding remains. With no runnable evidence, the strongest valid
result is `EVIDENCE-LIMITED — no blocking findings observed`. A nonzero Codex exit, empty output,
missing scope manifest, or unsupported model/effort is a failed review, never approval.

Report findings first, then the verdict, executed evidence, inspected scope, and residual risks.
Reconcile Codex findings with real source/evidence; neither accept nor dismiss them by authority.
