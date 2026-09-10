# ADR-044: Compose the statusline segment; do not replace statusLine

**Status:** Accepted
**Date:** 2026-09-10
**Owner:** zy
**Spec:** `docs/specs/2026-09-10-statusline-snippet-is-a-segment.md`
**Cross-references:** ADR-038, ADR-042, ADR-043, `docs/INSTALL.md`, `plugin/README.md`, `plugin/scripts/statusline.mjs`

**Governs:** `docs/INSTALL.md`, `plugin/README.md`, `plugin/scripts/statusline.mjs`, `plugin/hooks/hooks.json`, `tests/statusline.test.mjs`

Class: every shipped copyable statusline snippet. Enumerated 2026-09-10 with `rg -n 'node "$(qh-root)/scripts/statusline.mjs"'` on git-tracked files excluding specs and ADRs, and `git ls-files -- docs/INSTALL.md plugin/README.md plugin/scripts/statusline.mjs plugin/hooks/hooks.json tests/statusline.test.mjs`:

```
docs/INSTALL.md
plugin/README.md
plugin/hooks/hooks.json
plugin/scripts/statusline.mjs
tests/statusline.test.mjs
```

Members in: INSTALL.md paste, plugin README copy-paste, `statusline.mjs` header recipe. Members left out: `qh-doctor.mjs`, `docs/ONBOARDING.md`, root `README.md`, `plugin/evals/README.md` (same-day `rg` had no statusline/statusLine); `docs/BACKLOG.md` (history); `render()` / `reading()` (ADR-042; this record does not add a layer token).


**Enforced-by:** `tests/statusline.test.mjs::statusline segment: copy-paste is compose not a replacement command`, `tests/statusline.test.mjs::statusline segment: recipe does not delete refreshInterval or claim QH set the bar`, `tests/statusline.test.mjs::the wired statusline segment does not grow a layer token`
**Invalidates:** none — checked (does not reverse ADR-038–042; does not reverse ADR-043 `--json` `layer`)
**Served-path change:** the shipped statusline paste keeps the host `statusLine.command` and appends QH stdout from the same `$input`.


## Context

Inherited from `docs/specs/2026-09-10-statusline-snippet-is-a-segment.md` §Problem / §Goal. Executed 2026-09-10: the only copyable `statusLine.command` is `node "$(qh-root)/scripts/statusline.mjs" <<< "$input"` at INSTALL.md:85, plugin/README.md:31, statusline.mjs:20. Prose said "add the segment"; the paste is a replacement. `hooks.json` has no `statusLine`. Live miss: an adopting engineer replaced a two-row dashboard.

Debt at authoring (`python3 plugin/bin/adr-debt docs/adr`): none of the deferred rows is this compose recipe. ADR-030's deferred host `statusLine` is the field this spec refuses to claim; not pulled in.

## Existing Primitives Audit

- INSTALL / plugin README / `statusline.mjs` header paste — **reshape.** Compose, not a standalone command.
- `statusline.mjs` `render()` / `reading()` — **leave.** ADR-042 Advise wiring; no layer token.
- `hooks.json` — **leave.** No `statusLine`.

## Decision

**Every shipped copy-paste for the QH segment shows compose: keep the host command, feed the same `$input`, append stdout. QH does not set Claude's bar.**

1. INSTALL, plugin README, and the `statusline.mjs` header keep the host `statusLine.command` (and any `refreshInterval`), capture `node "$(qh-root)/scripts/statusline.mjs" <<< "$input"`, and append that stdout.
2. The copyable block itself must not be the one-liner as the whole `statusLine.command`.
3. Must not claim QH set Claude's `statusLine`. Must not require deleting `refreshInterval`.
4. This record does not add a layer token to the segment, and does not reverse ADR-038–043.

## Alternatives Considered

- **Leave the one-liner and strengthen the prose.** Rejected: the live miss pasted the block, not the sentence.
- **Delete `refreshInterval` in the recipe.** Rejected: host field; this fact does not require deleting it.
- **Ship `statusLine` from `hooks.json`.** Rejected: the plugin cannot set that host field.

## Component / Boundary Impact

| Component | Ownership after change | Why it changes |
|----------|------------------------|----------------|
| `docs/INSTALL.md` | GitHub install | copy-paste is compose |
| `plugin/README.md` | marketplace / cache | same class |
| `statusline.mjs` header | anyone reading the script as a recipe | same class |
| `hooks.json` | Session | none; still no `statusLine` |


## Wiring & Contract Changes

Inherited from the spec §Contracts Touched; delta: none.

## Inter-task Contracts

None.

## Implementation

See `docs/adr/ADR-044-statusline-snippet-is-a-segment/tasks/README.md`.

## Consequences

- **Positive:** pasting the shipped recipe keeps a host dashboard and appends the QH segment.
- **Negative:** a user with no host command still wires it themselves; QH does not install the bar.
- **Neutral:** `refreshInterval` is untouched. `--json` `layer` stays ADR-043.

## Out of Scope

Inherited from the spec §Non-Goals; delta: none.

- A layer token on the user-wired statusline (permanent: boundary: leftover grill; ADR-043 is `--json` only)
- QH setting Claude Code's `statusLine` (permanent: fact: the plugin cannot set that host field; citation: file `plugin/README.md:29`)
- Peel `cat` / `pwd` / `git status` / unknown `neither` (permanent: boundary: CLAUDE.md §16; ADR-041 left those unpeeled)
- Reverse ADR-038–043 (permanent: boundary: empty tree still Core; listing, probe prefix, UNPROVEN-write Advise, `--json` `layer` stand)
- Mixing this Goal into `docs/specs/2026-09-10-layer-from-stages-catalog.md` (permanent: boundary: sibling spec)
- Shipping a host adapter that writes the user's Claude settings (permanent: boundary: Non-Goal)
- Event ledger; hook opt-in; MCP verify (permanent: boundary: Non-Goal)

## Risks

Inherited from the spec §Risks; delta: none.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Paste of the one-liner replaces the host dashboard | High | High | F-1: the copyable block itself shows compose |
| Recipe requires deleting refreshInterval | Med | High | F-1: must not require deleting it |
| After claims QH installed Claude's bar | High | High | hooks.json has no statusLine |
| INSTALL and README drift | Med | High | Class is every copyable member |

## Rollback

Revert the three paste surfaces to the one-liner. No persistent state.

## Follow-ups

- [ ]
