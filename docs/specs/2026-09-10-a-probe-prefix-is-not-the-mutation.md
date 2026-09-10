# Spec: A probe prefix is not the mutation

> **Date:** 2026-09-10 · **Status:** Ready-for-ADR
> **Owner:** zy · **Becomes:** ADR-041 (`docs/adr/ADR-041-a-probe-prefix-is-not-the-mutation.md`)
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** plugin/scripts/lifecycle.mjs (`isPotentialMutationCommand`, `describeCommand`, `analyzeTranscript`, `missingEvidenceReason`), docs/adr/ADR-005-a-gate-reports-what-it-observed.md, tests/classify.test.mjs, tests/lifecycle.test.mjs (`describeCommand` navigation peel)

## Problem

After installing this branch, a `quality-harness:review` Stop in another repository listed install probes as the change: `Changed paths include: <Bash mutation: echo "== cache versions"; ls ~/.claude/plugins/cache/…>, <Bash mutation: adr-lint --version; …>` and then asked for `go test ./...` because that tree has `go.mod`. Executed 2026-09-10 against working-tree `plugin/scripts/lifecycle.mjs`: isolated `echo` / `ls` are not mutations; `adr-lint --version` is validation; Stop is silent on those. The same Stop lists the echo/ls prefix (truncated with `…`) when a later segment actually mutates (`rm -rf build`), and lists `adr-lint --version; node …` when a fail-closed interpreter follows the version probe. `describeCommand` peels only `cd`/`pushd`/`popd`. The sentence that exists to say what changed names the probe.

## Goal

Stop names a mutating segment (or a resolved path) as the change. A leading read-only probe is not that name, and a Bash tool_use that is only such probes is not Session authorship.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| adopting engineer | human role | trust Stop "Changed paths": a cache `ls` / `echo` / `adr-lint --version` is not the edit they owe a check for |
| Stop / Session evidence | system | `missingEvidenceReason` lists what mutated, then names this project's check |
| `analyzeTranscript` | system | authorship and `mutationPaths` follow mutating Bash segments, not a probe prefix |
| `describeCommand` | system | the `<Bash mutation: …>` marker is a readable stand-in for the write, one line |

## Use Cases

### UC-1: Stop reports the mutating segment, not a leading probe

- **Trigger:** Stop runs after a Bash tool_use in the transcript · **Preconditions:** the hook can read the transcript; the cwd names a project check
- **Main flow:**
  1. Classify the command: isolated `echo` / `ls` are not mutations; `adr-lint --version` is validation.
  2. If a later segment mutates, record authorship and a marker for that mutating remainder (or a resolved path).
  3. Stop "Changed paths" names that remainder or path, then the project's check.
- **Failure paths:**
  - a. at step 1, the tool_use is only probes plus inert navigation → not authorship; Stop does not list Changed paths and does not demand the check for that turn.
  - b. at step 3, a mutating compound starts with a probe → the marker is not the probe prefix (today it is: echo/ls truncated with `…`, or `adr-lint --version; …`).
- **Postconditions:** a probe is not the listed change. Could-not-classify a remaining segment stays fail-closed as a mutation (not this spec's reverse).

## Scenarios

### UC1-S1 [happy] Stop names the mutating remainder after a probe prefix (F-1 Accepted) [@implemented] → `tests/lifecycle.test.mjs::Stop names the mutating remainder after a probe prefix` cmd:`node --test --test-name-pattern 'Stop names the mutating remainder after a probe prefix' tests/lifecycle.test.mjs`

```gherkin
Given a repository whose inferred check is `go test ./...`
And a Bash tool_use `echo "== cache versions"; ls ~/.claude/plugins/cache/<long>; rm -rf build` completed
When Stop runs
Then Changed paths names the mutating remainder or the resolved `build` path
And the Bash mutation marker does not present the echo/ls prefix as the change
```

### UC1-S2 [failure] probe-only Bash is not Session authorship (F-1 Accepted) [@implemented] → `tests/lifecycle.test.mjs::probe-only Bash is not Session authorship` cmd:`node --test --test-name-pattern 'probe-only Bash is not Session authorship' tests/lifecycle.test.mjs`

```gherkin
Given a repository that names a project check
And the only Bash tool_uses are `echo "== cache versions"; ls ~/.claude/plugins/cache/<long>` and `adr-lint --version`
When Stop runs
Then there is no Changed paths list for those tool_uses
And Stop does not demand the project check on the strength of those probes
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | Stop's `<Bash mutation: …>` marker names a mutating segment (or a resolved path), not a leading read-only probe (`echo`, `ls`, `adr-lint --version`). A Bash tool_use that is only those probes plus inert navigation is not Session authorship. | `tests/lifecycle.test.mjs::Stop names the mutating remainder after a probe prefix` | @implemented | `node --test --test-name-pattern 'Stop names the mutating remainder after a probe prefix' tests/lifecycle.test.mjs` |

## Domain

Session authorship is a transcript reading (`analyzeTranscript`), not a statusline surface. A Bash tool_use is one shell string; `describeCommand` is the one-line stand-in Stop prints when a write cannot be resolved to a path. `echo`/`ls` in `READ_ONLY_CHILD` strip Python subprocess argv — they are not a shell allowlist. Isolated `echo`/`ls` are denylist misses (`neither`); `adr-lint --version` is validation. `echo x > out.txt` remains a mutation.

Class F-1 peels: leading `echo` / `ls` whose segment is not a mutation, plus a leading validation segment (`adr-lint --version`). Enumerated 2026-09-10 by calling `isValidationCommand` / `isPotentialMutationCommand` / `describeCommand` / `analyzeTranscript` in `plugin/scripts/lifecycle.mjs` on the live names:

```
neither       echo "== cache versions"
neither       ls ~/.claude/plugins/cache/quality-harness
validation    adr-lint --version
validation    python3 plugin/bin/adr-lint --version
mutation      echo x > out.txt
mutation      python3 review_probe.py
mutation      node plugin/scripts/work-next.mjs
neither       probe-only echo; ls compound (authorship none)
mutation      same compound plus rm -rf build (marker currently names the echo/ls prefix)
```

Members left (a later fact, not F-1): other `neither` verbs (`cat`, `pwd`, `git status --short`, `mystery-tool`, `tar -xf`). Peeling them would treat "not recognised as mutating" as known read-only (CLAUDE.md §16).

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `describeCommand` / Stop `Changed paths include:` | marker must not be a leading probe | Stop, SubagentStop, TaskCompleted, PreToolUse commit advisory |
| `analyzeTranscript` Bash authorship | probe-only tool_use is not `lastMutation` | the same evidence gates |

## Non-Goals

- Do not reverse ADR-038, ADR-039, or ADR-040. Do not reopen listing (`trackedPaths` / `existsSync` corpus inventory).
- Leftover specs on this branch, different goals: `docs/specs/2026-09-09-a-staged-product-not-a-funnel.md`, `docs/specs/2026-09-10-records-use-the-same-listing.md`, `docs/specs/2026-09-10-sessionstart-ready-uses-the-listing.md`.
- Event ledger / ADR-035 `claims.jsonl`.
- Statusline: it consumes `analyzeTranscript`, but this spec is Stop/Session evidence text, not the statusline layout.
- Turning the mutation denylist into an allowlist. Fail-closed interpreter runs (`python3 review_probe.py`, `node plugin/scripts/work-next.mjs`) stay mutations unless a later fact says otherwise.
- Which inferred check a foreign repo is told to run (`go test ./...` from `go.mod`) — consequence of authorship, not this fact.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Peeling more prefixes hides a write the denylist only sees on the whole string (a redirect glued to `echo`) | Med | High | Keep `echo x > out.txt` a mutation; peel only `echo`/`ls` when the segment itself is not a mutation, and validation segments |
| Treating "not recognised as mutating" as "known read-only" for the remainder | Med | High | Do not peel unknown `neither` verbs. Remainder stays fail-closed (ADR-005 / CLAUDE.md §16). This fact is the named probes, not the whole shell |

## Open Questions

<!-- Empty. Interpreter remainder stays fail-closed mutation (Non-Goal). Statusline is a different surface (Non-Goal). -->

## Verify

```bash
python3 plugin/bin/spec-verify --spec docs/specs/2026-09-10-a-probe-prefix-is-not-the-mutation.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | Does Session classify read-only probes (`echo`, `ls`, `adr-lint --version`) as mutations, and is that a miss (not-recognised / UNPROVEN) vs a real mutation? | F-1 | Accepted. Isolated probes are not mutations (`echo`/`ls` neither; `adr-lint --version` validation). The hole is `describeCommand` naming the probe prefix of a mutating compound. |
| 2 | Coverage checklist (actors, trigger, edges, invariant, non-goals, contracts, risks, success) | F-1 | All map to F-1. Grill closed without a further fact. |
| 3 | Peel every `neither` prefix, or only the named probes? | F-1 | Named probes plus validation. Unknown `neither` is a sibling, not this fact (CLAUDE.md §16). |
