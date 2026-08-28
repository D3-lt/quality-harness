# ADR-001: Never install a personal copy of an artifact the plugin already serves by name

**Status:** Accepted
**Date:** 2026-08-27
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/BACKLOG.md §25, docs/adr/ADR-004-templates-are-not-linked.md (amends the template clause of the Decision below)
**Governs:** `scripts/standalone-link.mjs`, `scripts/sync-standalone.mjs`, `tests/standalone-link.test.mjs`
**Invalidates:** none — checked (this is the first record in this corpus; `adr-state.mjs` reports "No decision records found under this repository")
**Served-path change:** A user who runs `sync-standalone.mjs --link` keeps all thirteen `quality-harness:<name>` skills instead of losing them; `--link` now installs gate forwarders and template links only.

**This record was written after the code shipped, and says so deliberately.** The defect was found
in live use on 2026-08-27 — the owner noticed `quality-harness:work` had disappeared from their
session — and was diagnosed and fixed the same day under a reload-and-retry loop, shipping as
v2.18.2 (`6bbff6d`). The decision, its alternatives and the choice between them are recorded here as
they actually happened, including who chose. Nothing below is reconstructed from a commit message.
The corpus this plugin ships exists to stop records claiming more than happened; a record that
implied the design preceded the fix would be exactly that.

## Context

This plugin is served by Claude Code as `quality-harness:<name>`. Some machines additionally keep
unnamespaced compatibility copies of the same skills under the user's personal skills directory, so
that `/adr-write` works alongside `/quality-harness:adr-write`.

Those personal copies never updated. Measured 2026-08-26: nine of eleven had drifted, and the
standalone `/adr-write` was 28 lines behind — missing `adr-judge`, `adr-context` and the rewritten
record contract entirely. v2.18.0 answered that with `sync-standalone.mjs --link`, which replaced
each copy with a link to the installed plugin so it could never fall behind again.

Measured 2026-08-27, after that change: the personal skill and the plugin skill resolved to the same
directory, and the loader offered **one** skill rather than two. The bare name survived;
`quality-harness:<name>` did not. Thirteen documented entrypoints disappeared. The change that
stopped thirteen copies drifting had removed thirteen entrypoints instead.

The mechanism is path identity, not name collision. Observed in the same live listing that was
missing the thirteen: `consensus` and `review-ring` appear as **both** bare and namespaced
simultaneously, because they are distinct paths. Two names for one path collapse; two names for two
paths do not.

## Existing Primitives Audit

- `linkPlan()` in `scripts/standalone-link.mjs` already enumerates what `--link` installs, per
  artifact kind, with a `lineage` field. **Reshaped:** the skill branch was removed; the gate,
  shim and template branches are unchanged.
- `plan()` / `pairs()` in `scripts/sync-standalone.mjs` already enumerates what `--apply` copies.
  **Reshaped:** a skill is now paired only when the destination already exists.
- `replaceable()` in `scripts/standalone-link.mjs` already refuses to touch a file this plugin did
  not install. **Reused unchanged** — it is why the owner's `autoresearch`, `codebase-memory` and
  `troubleshoot-orders-equinox` skills were never at risk.

## Decision

`--link` installs **gates** (as forwarders) and **templates** (as symlinks). It never installs a
skill, on any platform. `--apply` refreshes a skill **only where one already exists**, and never
creates one — so removing a bare-name skill stays removed instead of being restored by the next sync
and reported as an update.

The general rule, which is what the next reader needs: **never install a personal copy of an
artifact that Claude Code already serves from the plugin under a `quality-harness:<name>` identity,
and never point one at the plugin's own directory for that artifact.** A link makes both resolve to
one path and the namespaced entrypoint — the documented one — is the one that loses.

What would make this decision wrong: a Claude Code release that de-duplicates by identity rather
than by path, so that two names for one path both survive. That is observable — the test named in T1
asserts the plan, not the loader, so it would keep passing while the reason for it evaporated. The
falsifying observation is a live skill listing showing a bare name and its `quality-harness:` twin
while the personal copy is a link into the plugin cache. No such data exists today.

## Audit of the class

**The class:** every artifact kind this plugin ships that Claude Code also serves under a
namespaced `quality-harness:<name>` identity.

**Enumerated by command, not memory:**

```bash
ls -d bin hooks scripts skills templates                      # what the plugin ships
node -e "import('./scripts/standalone-link.mjs').then(m=>console.log([...new Set(m.linkPlan(process.cwd()).map(e=>e.lineage))].join(' ')))"
```

Run 2026-08-27: the plugin ships `bin hooks scripts skills templates`; `--link` covers
`gate shim template`. Of the five shipped kinds, exactly **one** — `skills`, 13 entries — is served
under a namespaced identity, so the class has exactly one member today and it is the one that broke.

**Members deliberately left out, and why:**

- `bin`, `templates` — no namespaced identity exists for either, so nothing can collapse. They stay
  linked, which is the whole value of `--link`.
- `hooks`, `scripts` — never installed into the user's home at all; `--link` has no branch for them.
- `agents/`, `commands/` — **this plugin ships neither today** (the `ls` above shows both absent).
  Both are served by Claude Code under namespaced identities, so either one, if added later, joins
  this class the day it appears. T1's test iterates the plan's lineages rather than checking for the
  string `skills`, so a new linked kind is visible to it, but it cannot know that a future kind is
  namespaced. This is named here rather than left silent.

## Alternatives Considered

- **Revert the skills to file copies (keep `--link` for gates and templates only):** restores both
  entrypoints immediately and is the smallest change. **Rejected:** copies drift again on every
  release, which is the exact problem `--link` was built to solve; it trades thirteen missing
  entrypoints for thirteen stale ones and re-opens the 2026-08-26 finding.
- **Convert one skill (`postmortem`) back to a copy and reload, to prove the hypothesis before
  changing the rest:** would have measured the mechanism rather than inferring it. **Rejected** by
  the owner as an unnecessary round trip once the `consensus` / `review-ring` control was found in
  the live listing — those two appear under both names because they are two paths, which
  demonstrates the mechanism without a further experiment.
- **Delete the bare-name skills entirely and serve only `quality-harness:*`:** ends skill drift
  permanently, because there is no second copy to drift. **CHOSEN by the owner.** Cost, accepted
  knowingly: it contradicts the operator's own `CLAUDE.md` line about deliberately exposing
  unnamespaced compatibility entrypoints. That line now describes a configuration this tool will not
  build for them.

An honest note on the second option: it was the better epistemics and it was declined. The
`consensus` control is real evidence, but it is evidence from a listing rather than from an
experiment this repository ran, and the record should not pretend otherwise.

## Component / Boundary Impact

None — internal to the standalone-install tooling (`scripts/standalone-link.mjs`,
`scripts/sync-standalone.mjs`). No module was added, moved or re-owned; `linkPlan` keeps its single
reason to change, which is "what `--link` installs".

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `linkPlan()` return value | no entry with `lineage: 'skill'` is ever emitted | `scripts/standalone-link.mjs` | `scripts/sync-standalone.mjs` `linkMode()`, `tests/standalone-link.test.mjs` |
| `plan()` return value | a skill pair is omitted unless the destination already exists | `scripts/sync-standalone.mjs` | `main()` report and `--apply` path, `tests/lifecycle.test.mjs` |
| `--link` operator message | states that gates are release-proof and skills are never linked | `scripts/sync-standalone.mjs` | the person running it |
| SessionStart shadow-install notice | same split, so the hook and the tool cannot disagree | `scripts/lifecycle.mjs` | every session in a repository with a decision corpus |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `linkPlan()` emits no `skill` lineage | T1 | none | No — T2 reads a different function |

## Implementation

See `ADR-001-skills-are-never-linked/tasks/README.md`. Two tasks.

## Consequences

- **Positive:** the thirteen `quality-harness:*` skills cannot be removed by this plugin's own
  install tooling. Skill drift ends for anyone who deletes the bare-name copies, because there is
  nothing left to drift.
- **Positive:** `--link`'s promise is now true as stated. It previously claimed the whole install
  never needed re-running; that held for gates and was false for skills and templates.
- **Negative:** an operator who wants unnamespaced skills must create and maintain them by hand.
  This tool will refresh such a copy but will never create one, so that configuration is supported
  and unassisted.
- **Negative:** the `qh-root` paragraph in eight skill bodies now points at bare-name copies that a
  machine following this decision does not have. Harmless, and recorded in `docs/BACKLOG.md` §25
  rather than silently left.
- **Neutral:** templates remain version-pinned symlinks, so `--link --apply` is still expected after
  each release for those. The operator message now says so instead of implying otherwise.

## Out of Scope

- Deleting the bare-name skills on any machine, which is the operator's own action. (permanent: this plugin advises and never removes a user's files unasked, and deleting them here would be the concealment the harness exists to prevent.)
- Making templates release-proof the way gates are, so they stop needing a repoint each release. (deferred: docs/BACKLOG.md §25)
- Any change to how Claude Code itself resolves two skills that share one path. (permanent: not this repository's code.)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A future `agents/` or `commands/` directory is added and linked, reproducing the collapse for a new kind | Med | High | Named explicitly in the class audit above; T1's test iterates plan lineages, so a new linked kind appears in its assertion rather than passing silently |
| The path-identity mechanism was inferred from a listing rather than from an experiment this repo ran | Low | Med | The `consensus` / `review-ring` control is recorded in Context; the falsifying observation is written into the Decision so a future reader knows what would overturn it |
| An operator who wants bare-name skills reads "never linked" as "not supported" | Med | Low | `--apply` still refreshes an existing bare-name skill; stated in Consequences and in the operator message |

## Rollback

Revert `6bbff6d`'s changes to `scripts/standalone-link.mjs` and `scripts/sync-standalone.mjs`, then
run `node scripts/sync-standalone.mjs --link --apply`, which re-creates the skill links from the
plugin. No persistent state and no external integration is involved.

Restoring the CONTENT of a deleted bare-name skill is a different question, and the honest answer is
narrower than it looks. `archive()` keeps originals under
`<home>/.claude/.quality-harness-backup/<timestamp>/`, one directory per run — but the archives
written by the runs that *linked* the skills hold the pre-link directories, while the removal
performed on 2026-08-27 recorded only each link's target, not a copy of the skill body. So the
recoverable content is whatever the pre-link archive holds, which on this machine is a 2.16.0-era
copy, not the current one. Anyone wanting the current text should copy it out of the installed
plugin instead.

## Follow-ups

- [x] Decide whether the six home template links should be removed rather than repointed each release (docs/BACKLOG.md §25). Answered 2026-08-28 by ADR-004: removed. Nothing reads them, and a link naming an evicted version dangles where a stale copy would at least be reported. That amends this record's Decision clause listing templates among what `--link` installs; the skills half stands.
