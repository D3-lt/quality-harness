---
name: quality-policy
description: Apply universal scope, simplicity, verification, and risk-routing discipline to substantive code changes. Use in the main coordinator for implementation planning and completion; do not use as a second lifecycle router or preload its full body into child agents.
user-invocable: false
---

# Quality Policy

**Resolving `${CLAUDE_PLUGIN_ROOT}`.** Paths below use it. If it reaches you as
literal text rather than a directory, this skill was loaded under its bare name
from a personal skills directory — which is not a plugin, so the placeholder is
never substituted there. Run `qh-root` and use what it prints in place of it.

Apply this policy in the main coordinating session. `/quality-harness:work` owns lifecycle classification; this
skill supplies the invariant and selects the least expensive quality depth that fits the risk.

## Quality kernel

- Preserve requested behavior and explicit non-goals; invent no features.
- Make the smallest coherent change and follow existing project patterns.
- DRY duplicated knowledge or policy, not merely similar-looking syntax.
- Use SOLID as boundary diagnostics, not as a demand for more types or layers.
- Add no speculative abstraction, configuration, fallback, compatibility path, or extension point.
- Require fresh executed evidence before claiming success.
- Escalate material ambiguity or scope expansion to the coordinator or user.

## Route by risk, not size alone

| Tier | Signals | Quality path |
|---|---|---|
| Small | Local, reversible, no contract or trust-boundary effect | One writer; targeted check; inline scope/simplicity pass. |
| Moderate | Several coupled behaviors or meaningful regression surface | One writer; caller-observed checks; one fresh-context reviewer. |
| High | Auth, untrusted input, money/data integrity, concurrency, migration, public contract, production infrastructure, or cross-module ownership | Caller-observed checks; `/quality-harness:quality-cycle` or `/quality-harness:codex-review`; fix only confirmed blockers. |
| Open decision | At least two credible designs remain and a wrong choice is costly to reverse | `/quality-harness:consensus`; otherwise decide directly. |

Large mechanical work does not automatically need a panel or ADR. Parallelize only independent
research or file ownership that can be isolated without coordination collisions.

## Evidence contract

The coordinator executes the repository-owned acceptance command before asking for a verdict and
records:

```text
status: executed | unavailable
command: exact command, or empty when unavailable
exitCode: integer, or null when unavailable
summary: useful output or the concrete limitation
```

Use normal project commands. If a custom command is not recognizable as a test, lint, build,
check, verify, or validator, run it through
`node ${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs --cwd <repo> -- <command> <args>` so lifecycle hooks can
identify the executed gate. A nonzero result cannot support a clean verdict.

## Blocking review findings

A finding blocks only when all are true:

1. It is inside stated scope or a regression caused by the diff.
2. It is material to correctness, security, data integrity, required behavior, or concrete
   maintainability.
3. It cites exact code plus a failing check, reproduction, violated contract, or direct trace.
4. It has a minimal in-scope remedy.
5. It explains why existing passing evidence does not already settle the concern.

Style preferences, future-proofing, alternative architectures, speculative edge cases, raw
duplication, and optional cleanup are advisory. Never auto-apply reviewer suggestions. Permit one
fix and one re-review; repeated or disputed findings return to the coordinator.

## Delegation boundary

Spawned agents are leaf roles unless explicitly assigned as coordinators. Give each child its role,
owned scope, non-goals, repository context, and expected evidence. Do not inject or invoke `/quality-harness:work`
inside a child; the plugin's `SubagentStart` hook supplies the compact leaf contract.
