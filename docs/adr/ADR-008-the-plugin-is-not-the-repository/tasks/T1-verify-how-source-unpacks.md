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
2. Build a minimal probe plugin in a temporary directory: a marketplace naming `source` as a subdirectory, one skill, and one hook whose command names `${CLAUDE_PLUGIN_ROOT}/marker.txt`.
3. Install it, then read the unpacked cache directory: is `marker.txt` at its root, or one level down?
4. Record the answer verbatim in this task, with the cache path inspected and the date, because it is a fact about a tool version rather than about this repository, and a later Claude Code may change it.
5. If the answer is "one level down", stop and mark the parent record Withdrawn with the finding. That is a successful outcome of this task, not a failure of it.

## Acceptance

```bash
bash docs/adr/ADR-008-the-plugin-is-not-the-repository/tasks/T1-probe.sh
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `T1-probe.sh` | `docs/adr/ADR-008-.../tasks/T1-probe.sh` | a probe plugin whose `source` is a subdirectory unpacks with that directory's contents at the plugin root, exiting non-zero if not | — |

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

## Mutation Log

Not applicable — this task ships no mechanism. It answers a question and records the answer; the
probe is its own falsification, since it exits non-zero when the assumption does not hold. `adr-lint`
requires a killed mutant only for a task that ships a mechanism, and the honest note here is that
this task's evidence is the recorded observation, not a test.

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
