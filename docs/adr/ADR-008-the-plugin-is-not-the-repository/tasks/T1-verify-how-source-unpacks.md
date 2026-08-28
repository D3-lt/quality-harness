# Task ADR-008-T1: find out how a source subdirectory is unpacked

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** zy
**Produces:** the verified answer to where `${CLAUDE_PLUGIN_ROOT}` points when `source` is not `"."` (T2)
**Consumes:** none
**Data dependency:** needs a real installed plugin cache — this cannot be answered from a checkout

## Goal

Establish, by installing a probe plugin and reading the result, whether a `source` subdirectory
becomes the plugin root or sits one level below it. Everything else in this record is contingent on
the answer.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/adr/ADR-008-the-plugin-is-not-the-repository/tasks/T1-probe.sh` | add | a throwaway marketplace with `source` set to a subdirectory, installed for real; the answer is not in this repository and cannot be reasoned out |

## Ordered Steps

1. Confirm the question is open rather than assumed: `grep -c CLAUDE_PLUGIN_ROOT` across skills and hooks returns 20 references whose correctness depends entirely on the answer, and no test in this repository exercises them from an installed cache — they all run from a checkout, where the paths resolve either way. That gap IS the finding, and it is why this task exists before the move.
2. **Look for the answer before manufacturing it.** Three marketplaces installed here already ship subdirectory sources, so the behaviour is observable in production without touching the user's plugin configuration at all. Building and installing a throwaway to learn something already demonstrated would have been the more invasive route to worse evidence.
3. Read both sides — the marketplace checkout root and the unpacked cache — and confirm which contents landed where.
4. Record the answer verbatim in this task, with the cache path inspected and the date, because it is a fact about a tool version rather than about this repository, and a later Claude Code may change it.
5. If the answer is "one level down", stop and mark the parent record Withdrawn with the finding. That is a successful outcome of this task, not a failure of it.

## Acceptance

```bash
bash docs/adr/ADR-008-the-plugin-is-not-the-repository/tasks/T1-probe.sh
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| the probe exits non-zero when the assumption fails | `docs/adr/ADR-008-the-plugin-is-not-the-repository/tasks/T1-probe.sh` | an installed plugin declaring a subdirectory `source` unpacks with that directory's CONTENTS at the plugin root; exit 1 when the subdirectory survives in the cache, exit 2 when no such plugin is installed | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the probe script |
| 2 — something selects it | run as this task's acceptance fence and recorded by `adr-verify` |
| 3 — the caller can discover it | the answer is written into this task file, which `adr-context` returns for `.claude-plugin/marketplace.json` |
| 4 — it is used | T2 does not start until this answer exists, and the parent record's Decision names it as the contingency |

## Class Sweep

**Class:** every assumption in ADR-008 about how the installer behaves, as opposed to how this
repository behaves.

```bash
grep -n "CLAUDE_PLUGIN_ROOT" .claude-plugin/marketplace.json hooks/hooks.json | head
grep -rlc "CLAUDE_PLUGIN_ROOT" skills/ hooks/ | wc -l
```

To be run and recorded at execution. The known member is the plugin root. A second, worth checking
in the same probe because it costs nothing extra: whether the installer copies files outside
`source` at all — if it does, the saving is smaller than the parent record claims and the numbers
there need correcting rather than the plan.

## The Answer

**A `source` subdirectory BECOMES the plugin root. ADR-008's assumption holds and the record may
proceed.** Established 2026-08-28 against Claude Code **2.1.250**.

Answered from PRODUCTION plugins already installed on this machine rather than a synthetic probe —
better evidence, and it altered nothing. Three marketplaces here ship subdirectory sources:

    openai-codex            codex                   source ./plugins/codex
    claude-code-plugins     code-review, others     source ./plugins/<name>
    claude-plugins-official claude-md-management    source ./plugins/claude-md-management

Read both sides for `openai-codex/codex`:

- the marketplace CHECKOUT root holds `LICENSE README.md package.json package-lock.json plugins
  scripts tests`
- the unpacked CACHE at `codex/1.0.6/` holds `agents commands hooks prompts schemas scripts skills
  .claude-plugin` — exactly the contents of `plugins/codex/`, and **not** the repository root. The
  repo's own `tests/` and `package.json` are absent from the cache entirely.
- its hooks resolve `${CLAUDE_PLUGIN_ROOT}/scripts/session-lifecycle-hook.mjs`, and `scripts/`
  exists inside `plugins/codex/` — so the placeholder resolves INSIDE the subdirectory.

Two consequences for ADR-008, both load-bearing:

1. **The twenty `${CLAUDE_PLUGIN_ROOT}` references do not change.** The risk table's Critical row —
   "resolves one level above the plugin, breaking all 20 references" — does not materialise.
2. **The saving is real and is exactly what the record claims.** `openai-codex` ships `plugins/codex`
   and not its repository's `tests/`, which is the arrangement ADR-008 proposes.

T1's stop condition — a negative answer withdrawing the record — is not reached. **T2 is unblocked
and deliberately not run**: it moves every file in the repository, and ADR-008 remains `Proposed`
pending the owner's word.

## Mutation Log

The authored note here said "not applicable — this task ships no mechanism". `adr-lint` refused the
`done` row over it and was right: the MECHANISM is the probe, and its whole value is that it can say
no. A probe that cannot report FAIL would have recorded "the assumption holds" whatever the cache
looked like — which is the unfalsifiable evidence this corpus exists to prevent, in the task whose
answer unblocks a repository-wide move.

Also worth stating rather than leaving the log to imply otherwise: the ANSWER was established by
reading two installed plugins first, and the probe was written afterwards to make that reading
re-runnable. The Verification Log therefore shows no red-then-green cycle, because the observation
came before the script.

<!-- tool-written by adr-verify --mutant below -->
- 2026-08-28 · 9429ff1 · mutant killed · exit 1 · `docs/adr/ADR-008-the-plugin-is-not-the-repository/tasks/T1-probe.sh` · inverts the test the probe exists to make: it would report the assumption holds whatever the cache contains · acceptance-sha256:46ecbafff0d757ee9af22b8e3efcfed34eeaa2a3d400fb4c0bd5b5c095094704

## Invariants

- The answer is obtained by installing and looking, never by reading documentation or inferring.
- The probe leaves no plugin installed and no marketplace registered when it finishes.
- A negative answer is recorded and withdraws the parent record; it is not worked around.

## Risks

- The probe could pass on this machine's Claude Code version and be wrong on another. Mitigated by recording the version alongside the answer, so a future reader knows what it was true of.
- Installing a probe plugin touches the user's real plugin configuration. Mitigated by naming it distinctly and removing it in the same script.

## Stop Condition

Stop if the probe cannot be installed without modifying the user's existing marketplace
configuration in a way the script cannot undo — the answer is not worth leaving their setup altered.

## Out of Scope

- Moving any file. (permanent: that is T2, and doing it here would mean the move preceded the evidence that it works.)
- Rewriting published history. (deferred: docs/BACKLOG.md §42)

## Verification Log
<!-- tool-written by adr-verify; empty at authoring -->
- 2026-08-28 · 7914035 · exit 0 · `bash docs/adr/ADR-008-the-plugin-is-not-the-repository/tasks/T1-probe.sh` · acceptance-sha256:46ecbafff0d757ee9af22b8e3efcfed34eeaa2a3d400fb4c0bd5b5c095094704
