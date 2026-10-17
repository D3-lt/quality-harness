# Task ADR-110-T3: hooks.json points at qh, and the lifecycle is named where a corpus exists

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** M (the registration, the install check, one SessionStart line)
**Owner:** unassigned
**Produces:** `plugin/hooks/hooks.json` running `qh hook <event>`; the lifecycle line at SessionStart
**Consumes:** the numbers in Follow-ups (T2); `qh hook <event>` (T1)
**Proof map:** v1

## Goal

After the owner has read T2's numbers: every hook entry runs the binary, an install that lacks the platform's binary
refuses to switch and says so, and SessionStart in a repository with a decision corpus says one line that the lifecycle
applies here (ADR-110, Decision 5).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/hooks/hooks.json` | edit | 13 commands become `${CLAUDE_PLUGIN_ROOT}/bin/qh hook <event>` |
| `plugin/bin/qh` and `plugin/bin/qh.exe` | add | the built binaries per platform, produced by the release workflow, never hand-copied |
| `plugin/scripts/sync-standalone.mjs` | edit | the forwarders point at the binary where it answers `qh --version`, and refuse where it does not |
| `core/hooks/orientation` | edit | the lifecycle line, said once per repository where `hasDecisionCorpus` is true |
| `tests/core-install.test.mjs` | add | the test below |

## Ordered Steps

1. [S1] Add the test below and record the red run.
2. [S2] Point `hooks.json` at the binary; add the install refusal; add the line.
3. [S3] Add the catalogue mutants (the refusal dropped; the line said where no corpus exists) and record a killed mutant. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/hook-goldens.test.mjs tests/core-install.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - an install without the platform's binary refuses to switch, and a corpus is named once at SessionStart")" = 1 \
  && ! printf '%s\n' "$out" | grep -qE '^not ok|# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an install without the platform's binary refuses to switch, and a corpus is named once at SessionStart` | `tests/core-install.test.mjs` | with the binary absent, the switch is refused and named; with it present, every `hooks.json` command resolves and answers; SessionStart in a corpus repository says the line once, and in a bare repository says nothing | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the `hooks.json` commands |
| 2 — something selects it | the host reads `hooks.json` |
| 3 — the caller can discover it | the SessionStart line |
| 4 — it is used | every hook event, in every session |

## Mutation Log

## Invariants

- The goldens pass against the binary before and after this task.
- The Node scripts stay in the tree for one release after, so a rollback is a `hooks.json` revert.

## Risks

- None beyond ADR-110's.

## Stop Condition

Stop and ask if T2's Follow-ups line is not in the record, or if the owner has not read it.

## Out of Scope

- Removing the Node scripts (deferred: the release after T3, as its own commit)

## Verification Log
