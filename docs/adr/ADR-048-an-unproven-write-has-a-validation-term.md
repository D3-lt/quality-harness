# ADR-048: An UNPROVEN write has a validation term

**Status:** Accepted
**Date:** 2026-09-12
**Owner:** zy
**Spec:** `docs/specs/2026-09-12-unproven-write-has-a-validation-term.md`
**Cross-references:** ADR-005, ADR-042, ADR-047, `CLAUDE.md`, `plugin/scripts/lifecycle.mjs`, `plugin/scripts/statusline.mjs`, `tests/lifecycle.test.mjs`
**Governs:** `plugin/scripts/lifecycle.mjs`, `plugin/scripts/statusline.mjs`, `tests/lifecycle.test.mjs`, `tests/mutations.json`

Class: every Advise surface that keys `lastUnprovenWrite > lastPublish` with no validation term, and both arms that advance `lastUnprovenWrite`. Enumerated 2026-09-12 with `rg -n "lastUnprovenWrite" plugin/scripts/lifecycle.mjs plugin/scripts/statusline.mjs` and `git ls-files -- plugin/scripts/lifecycle.mjs plugin/scripts/statusline.mjs tests/lifecycle.test.mjs tests/mutations.json`:

```
plugin/scripts/statusline.mjs:67:  const unprovenWrite = (state.lastUnprovenWrite ?? -1) > state.lastPublish
plugin/scripts/lifecycle.mjs:1940:      if (kind === 'unrecognised') {
plugin/scripts/lifecycle.mjs:1966:      lastUnprovenWrite = Math.max(lastUnprovenWrite, use.position)
plugin/scripts/lifecycle.mjs:3441:  const unprovenWrite = (state.lastUnprovenWrite ?? -1) > state.lastPublish
plugin/scripts/lifecycle.mjs:4175:    if ((state.unverifiedSince(state.lastPublish) || (state.lastUnprovenWrite ?? -1) > state.lastPublish) && projectCheckCommand(input.cwd)) {
plugin/scripts/lifecycle.mjs:4205:  const unverified = state.unverifiedSince(state.lastPublish) || (state.lastUnprovenWrite ?? -1) > state.lastPublish
```

```
plugin/scripts/lifecycle.mjs
plugin/scripts/statusline.mjs
tests/lifecycle.test.mjs
tests/mutations.json
```

Members in: `sessionStateNote`, PreToolUse commit advice, Stop, `statusline.mjs` `reading()`; both `lastUnprovenWrite` assignment arms. Members left out: `classifyCommand` / MEASURED_FAMILIES; path helpers; Cost 2 wording ("the transcript contains file mutations"); chmod-000 (sibling spec).

**Enforced-by:** `tests/lifecycle.test.mjs::a passing recognised check after an UNPROVEN write silences Advise`, `tests/lifecycle.test.mjs::a failing check after an UNPROVEN write still Advises, and Read does not flag`, `tests/lifecycle.test.mjs::a failed UNPROVEN write does not advance lastUnprovenWrite`
**Invalidates:** none — checked (does not reverse ADR-042 F-24; does not reverse ADR-047 unrecognised→UNPROVEN). Extends ADR-042 T3 leftover named in ADR-047 Non-Goal.
**Served-path change:** Stop / `sessionStateNote` / the wired statusline / PreToolUse on Bash `git commit` go silent after a passing recognised check following the final successful UNPROVEN write; a failed write is not a write a later check can prove.

## Context

Inherited from `docs/specs/2026-09-12-unproven-write-has-a-validation-term.md` §Problem / §Goal. Measured 2026-09-12 on `239980b`: `mrw write --plan-file p.txt` then passing `npm test` is FLAG; `sed -i` then the same check is silent. The note asserts "no recognised check has proven it" while `Last check: npm test passed`.

Debt at authoring (`python3 plugin/bin/adr-debt docs/adr`): none of the deferred rows or open follow-ups is this validation term. Not pulled in.

## Existing Primitives Audit

- `unverifiedSince` / `verifiedAfterLastMutation` — **reuse.** Same `lastSuccessfulValidation > last && lastSuccessfulValidation === lastValidation` term. Do not fold `lastTreeRefresh` into the UNPROVEN branch (the spec did not).
- `lastSuccessfulValidation` / `lastValidation` — **reuse.** Already recorded.
- `lastUnprovenWrite` / Stop / `sessionStateNote` / `reading()` / PreToolUse — **reshape.** Read the validation term; do not set `lastMutation` (F-24).
- `commandSucceeded` — **reuse** for both lastUnprovenWrite arms, the same success test lastPublish already uses.

## Decision

**UNPROVEN Advise uses the same validation term the mutation branch already has. `lastUnprovenWrite` advances only on success.**

1. A passing recognised check after the final UNPROVEN write silences Advise on all four surfaces. A failing check does not (`lastSuccessfulValidation === lastValidation`). Publish still silences (`lastUnprovenWrite > lastPublish`). `lastMutation` stays -1 (F-24).
2. `lastUnprovenWrite` advances only when `commandSucceeded` is true. `executed()` remains true for `is_error` unless a hook blocked; that is not this write. A missing result does not count as failure (in-flight stays unadvanced because `executed()` already requires a result).

## Alternatives Considered

- **Set `lastMutation` for MCP / unrecognised so `unverifiedSince` piggybacks.** Rejected: ADR-042 F-24 ("Set lastMutation without recording a path").
- **Treat `lastValidation` (a check ran) as silence.** Rejected: a failing check would clear the advisory.
- **Gate only MCP, leave failed Bash `mrw write` advancing.** Rejected: one arm of the mandated path stays a lie.
- **Fold `lastTreeRefresh` into the UNPROVEN term.** Rejected: the spec did not; mutation-only.

## Component / Boundary Impact

| Component | Ownership after change | Why it changes |
|-----------|------------------------|----------------|
| `analyzeTranscript` | Session authorship | lastUnprovenWrite only on success; `unprovenWritePending` |
| Stop / PreToolUse / `sessionStateNote` / `reading()` | Session evidence | read the validation term |

None — internal to Session. No Module Map file in this repository; no architecture doc to update.

## Wiring & Contract Changes

Inherited from the spec §Contracts Touched; delta: `unprovenWritePending` is the shared predicate the four surfaces read.

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `unprovenWritePending` | T1 | T2 | No — T2's dirty case is F-1 implemented while `executed()` still treats `is_error` as a write |

## Implementation

See `docs/adr/ADR-048-an-unproven-write-has-a-validation-term/tasks/README.md`.

## Consequences

- **Positive:** `mrw write` then the project's check clears Advise the way `sed -i` already does.
- **Negative:** a failed write that the hook did not block is silent until a later successful write (fail-closed on "did it happen").
- **Neutral:** a green ADR-042 / ADR-047 FLAG test with no following check stays green; it is not this fact.

## Out of Scope

Inherited from the spec §Non-Goals; delta: none.

- Unreadable named-path open / chmod 000 traceback (permanent: boundary: sibling spec `docs/specs/2026-09-12-unreadable-file-is-could-not-run.md`)
- UNPROVEN Advise inventing changed paths or "the transcript contains file mutations" (permanent: boundary: sibling spec `docs/specs/2026-09-12-unproven-advise-does-not-invent-writes.md`)
- Writing subcommands of a measured family (`ruff format`, `eslint --fix`) (permanent: boundary: later spec; not F-1)
- Making unrecognised into mutation (permanent: boundary: ADR-047's after stands)
- A full PowerShell / cmd mutation grammar (permanent: boundary: those families stay unrecognised)
- Changing Read / Grep / Glob into writes (permanent: boundary: KNOWN_NON_WRITE_TOOLS)

## Risks

Inherited from the spec §Risks; delta: none.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Green ADR-042 / ADR-047 FLAG tests with no following check | High | High | UC1-S2: that green is not this fact. Dirty case is UNPROVEN write + passing check → silent |
| `lastValidation` (a check ran) treated as silence | High | High | term is `lastSuccessfulValidation === lastValidation` |
| Record `lastMutation` for unrecognised / MCP | Med | High | F-24; `lastMutation` stays -1 |
| Folding chmod-000 or Cost 2 into this fact | High | Med | Non-Goals |

## Rollback

Remove `unprovenWritePending` and the `commandSucceeded` gates on both lastUnprovenWrite arms. No persistent state.

## Follow-ups

- [ ]
