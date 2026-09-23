# ADR-041: A probe prefix is not the mutation

**Status:** Accepted
**Date:** 2026-09-10
**Owner:** zy
**Spec:** `docs/specs/2026-09-10-a-probe-prefix-is-not-the-mutation.md`
**Cross-references:** ADR-005, `plugin/scripts/lifecycle.mjs` (`describeCommand`, `analyzeTranscript`, `isPotentialMutationCommand`, `isValidationCommand`)
**Governs:** `plugin/scripts/lifecycle.mjs`

Class: Stop's `<Bash mutation: …>` marker is a `describeCommand` remainder, and today that remainder still starts at a leading read-only probe. Enumerated 2026-09-10 with `rg -n 'function describeCommand|function analyzeTranscript|function missingEvidenceReason|NAVIGATION_PREFIX' plugin/scripts/lifecycle.mjs` and `git ls-files -- plugin/scripts/lifecycle.mjs tests/lifecycle.test.mjs tests/classify.test.mjs`:

```
1708:export function describeCommand(command, limit = 72) {
1714:    const peeled = remainder.replace(NAVIGATION_PREFIX, '')
1731:const NAVIGATION_PREFIX = /^\s*(?:cd|pushd|popd)(?:[ \t]+(?:"[^"]*"|'[^']*'|[^\s;&|<>]+))*[ \t]*(?:&&|;|\n)/
1735:export function analyzeTranscript(raw, cwd = process.cwd()) {
2324:function missingEvidenceReason(state, cwd, paths = state.mutationPaths) {
```

```
plugin/scripts/lifecycle.mjs
tests/classify.test.mjs
tests/lifecycle.test.mjs
```

Members in: `describeCommand` (and Stop / SubagentStop / TaskCompleted / PreToolUse, which print its marker). Members left out: `analyzeTranscript` authorship of probe-only Bash (already `none`; locked by UC1-S2); `missingEvidenceReason` (prints recorded paths); `tests/classify.test.mjs` (whole-command kinds unchanged); `READ_ONLY_CHILD` (Python subprocess strip, not a shell peel list); other `neither` verbs (`cat`, `pwd`, `git status`, `mystery-tool`, `tar -xf`) — peeling those treats "not recognised as mutating" as known read-only (CLAUDE.md §16).

**Enforced-by:** `tests/lifecycle.test.mjs::Stop names the mutating remainder after a probe prefix`, `tests/lifecycle.test.mjs::probe-only Bash is not Session authorship`
**Invalidates:** none — checked (does not reverse ADR-038, ADR-039, or ADR-040; does not change which inferred check a foreign repo is told to run)
**Served-path change:** Stop `Changed paths include:` names the mutating remainder (or a resolved path), not a leading `echo` / `ls` / `adr-lint --version` probe.

## Context

Inherited from `docs/specs/2026-09-10-a-probe-prefix-is-not-the-mutation.md` §Problem / §Goal. Isolated `echo` / `ls` are already not mutations; `adr-lint --version` is already validation. `describeCommand` peels only `cd` / `pushd` / `popd`, so a mutating compound is listed as the probe prefix, truncated with `…`.

Debt at authoring (`python3 plugin/bin/adr-debt docs/adr`): none of the deferred rows or open follow-ups is this Stop marker. Not pulled in.

## Existing Primitives Audit

- `describeCommand` / `NAVIGATION_PREFIX` — **reshape.** Also peel a leading known probe or validation segment.
- `isPotentialMutationCommand` / `isValidationCommand` — **reuse.** Per-segment; do not encode a new shell allowlist.
- `shellSegments` / `commandInvocation` / `executableName` — **reuse.**
- `READ_ONLY_CHILD` — **leave.** Python subprocess argv strip, not this peel.

## Decision

**`describeCommand` peels a leading `echo` or `ls` segment that is not itself a mutation, and a leading validation segment. The marker names what remains. Probe-only Bash stays not Session authorship.**

1. After (and interleaved with) the existing navigation peel, drop a leading segment that is `echo` or `ls` and that `isPotentialMutationCommand` does not flag, or that `isValidationCommand` accepts.
2. `echo x > out.txt` stays a mutation and is not peeled.
3. Unknown `neither` verbs are not peeled. Fail-closed interpreter remainders stay mutations.
4. Probe-only `echo` / `ls` / `adr-lint --version` (plus inert navigation) is not authorship. That is already true of the whole-command classifier; the bound test locks it.

## Alternatives Considered

- **Peel every `neither` prefix.** Rejected: `mystery-tool write-files` and `tar -xf` are `neither`. That is "not recognised as mutating", not known read-only (ADR-005 / CLAUDE.md §16).
- **Withhold the marker whenever a path already resolved.** Rejected: `adr-lint --version; node plugin/scripts/work-next.mjs` resolves no path; the marker would still name the version probe.
- **Turn the mutation denylist into a shell allowlist.** Rejected: Non-Goal of the spec.

## Component / Boundary Impact

| Component | Ownership after change | Why it changes |
|-----------|------------------------|----------------|
| `lifecycle.mjs` `describeCommand` | Session evidence | peel known probe / validation prefixes |
| Stop / SubagentStop / TaskCompleted / PreToolUse | same | print the peeled marker |

## Wiring & Contract Changes

Inherited from the spec §Contracts Touched; delta: none.

## Inter-task Contracts

None.

## Implementation

See `docs/adr/ADR-041-a-probe-prefix-is-not-the-mutation/tasks/README.md`.

## Consequences

- **Positive:** Stop names `rm -rf build` (or the resolved path), not a truncated `echo` / `ls` cache listing. A version probe before a fail-closed interpreter is not the listed change.
- **Negative:** `cat README.md; rm -rf build` still names `cat` until a later fact enumerates that verb.
- **Neutral:** Probe-only Bash was already not authorship; the failure scenario locks it.

## Out of Scope

Inherited from the spec §Non-Goals; delta: none.

- Reverse ADR-038, ADR-039, or ADR-040 (permanent: boundary: Non-Goal)
- Event ledger / ADR-035 `claims.jsonl` (permanent: boundary: Non-Goal)
- Statusline marker text (permanent: boundary: different surface)
- Host adapter / Governs unify (permanent: boundary: Non-Goal)
- Turning the denylist into a shell allowlist (permanent: boundary: CLAUDE.md §16)
- Which inferred check a foreign repo is told to run (permanent: boundary: Non-Goal)
- Peeling unknown `neither` verbs (permanent: boundary: F-1 names `echo`, `ls`, and validation only)

## Risks

Inherited from the spec §Risks; delta: none.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Peeling `echo` hides a redirect on the same segment | Med | High | Do not peel a segment `isPotentialMutationCommand` flags |
| Peeling unknown `neither` hides a write | Med | High | Peel only `echo` / `ls` and validation |

## Rollback

Revert the probe peel in `describeCommand`. No persistent state.

## Follow-ups

- [ ]
