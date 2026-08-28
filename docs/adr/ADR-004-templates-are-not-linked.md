# ADR-004: Stop installing home copies of an artifact nothing reads

**Status:** Proposed
**Date:** 2026-08-28
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-001-skills-are-never-linked.md, docs/BACKLOG.md §25
**Governs:** `scripts/standalone-link.mjs`, `scripts/sync-standalone.mjs`, `tests/standalone-link.test.mjs`
**Invalidates:** ADR-001 — the clause of its Decision reading "`--link` installs **gates** (as forwarders) and **templates** (as symlinks)". Its skills half is untouched and still governing; ADR-001's tasks and their evidence are unaffected, because both tasks were about skills.
**Served-path change:** A user who runs `sync-standalone.mjs --link --apply` no longer gets six template symlinks that need repointing after every release, and one who deletes theirs keeps them deleted; every skill already reads its template from the plugin root, which is always the running version.

**This record was written after the code shipped, and says so deliberately.** The owner asked for
the change directly on 2026-08-28 — "so unlink those claude templates then ... same as with skills"
— after the session repointed six links as routine post-update maintenance and then found that
nothing reads them. The alternatives below were weighed before the edit, but the edit landed in the
same session rather than after an acceptance gate. Recording it the other way round would be the
fabricated ordering this corpus exists to prevent. ADR-001 was written under the same honesty and
for a related reason; this one is not a repeat of that decision but the second half of it.

## Context

ADR-001 stopped `--link` from installing personal SKILL copies, because a personal skill resolving
to the plugin's own skill directory made both names resolve to one path and the loader then offered
one skill rather than two — `quality-harness:<name>` disappeared. It deliberately left templates
alone: they have no such collision, so a link there only ever removed drift. It also left an open
follow-up asking whether the six template links should be removed rather than repointed each
release.

Three things measured on 2026-08-28 answer that follow-up.

**Nothing reads them.** Every skill that names a template names it under the plugin root — six
references across `adr-write`, `adr-retire`, `arch-write` and `spec-write`, no exceptions — and that
path is always the running version. The bare-name skills that once read the home copies were deleted
by ADR-001, and `~/.claude/skills` on this machine now holds only `autoresearch`,
`codebase-memory` and `troubleshoot-orders-equinox`, none of them ours.

**A link names one version, so it is a standing chore.** After updating to 2.20.0 the six links were
still pointing at 2.18.3, and only `task-template.md` had actually drifted; the other five were
identical files behind a stale path. The tool's own report said as much — "a link names one version,
so re-run this after each release to repoint those" — which is a maintenance action that recurs
forever and produces nothing.

**A dangling link is worse than a stale copy, because nothing reports it.** The plugin cache evicts.
Measured 2026-08-28 against this machine's cache: of 61 releases in git history, 23 are absent,
including 2.18.1, 2.18.2 and 2.19.1 — all three shipped within two days of the links being written,
and the links happened to name 2.18.3 only by luck. `standaloneDriftNotice` compares digests, and
`digest()` returns `null` for an unreadable path, so a link naming an evicted version reads as
ABSENT rather than as behind and the notice says nothing at all. A stale copy is at least reported.

The asymmetry with gates is structural, not an oversight: a gate is executable, so its forwarder
runs the resolver at call time and no release can leave it behind. A template is data. Nothing
executes when a file is read, so there is no moment at which a version could be resolved, and a
symlink is the only indirection available.

## Existing Primitives Audit

- `linkPlan()` in `scripts/standalone-link.mjs` already enumerates what `--link` installs per
  artifact kind. **Reshaped:** the template branch was removed, the way ADR-001 removed the skill
  branch, leaving gate forwarders and their Windows shims.
- `pairs()` in `scripts/sync-standalone.mjs` already implements "refresh only where one exists" for
  skills. **Reused:** templates now follow the same rule, expressed as a per-directory policy so
  the gate half stays "create wherever missing" and is asserted separately.
- `replaceable()` and `archive()` are **reused unchanged**. They inspect whatever is actually in the
  user's home, which can be anything, so their branches stay live for gates.

## Decision

`--link` installs **gates only**, as forwarders. It installs no template and no skill, on any
platform. `--apply` refreshes a template **only where one already exists**, never creating one — the
same rule skills follow, for the same reason: a deletion has to stay deleted, or the next sync undoes
the user's decision and reports it as an update.

The general rule this and ADR-001 are two halves of: **install a personal copy only where it is both
reachable by something and cheaper to maintain than the plugin's own copy.** ADR-001 covered the
first clause for skills, where a copy was actively harmful. This covers the second for templates,
where a copy is merely unread — and being unread is sufficient, because the maintenance is not free
and the failure mode when it lapses is silent.

What would make this wrong: any consumer that reads a template from the home directory rather than
the plugin root. The check is `grep -rn "templates/[a-z-]*\.md" skills/` returning only plugin-root
references, which is task T1's acceptance, so it fails rather than rots if a skill ever hard-codes a
home path.

## Alternatives Considered

- **Keep repointing them each release.** What the session did first, before checking whether
  anything read them. Rejected: it is a recurring action with no consumer, and the failure mode when
  someone forgets is invisible rather than noisy.
- **Make templates release-proof the way gates are.** The shape ADR-001 deferred to BACKLOG §25.
  Rejected as unbuildable: the indirection gates use is executable, and a template is read as data,
  so there is no call time at which to resolve anything. A stable intermediate symlink only moves the
  repoint from six links to one.
- **Drop templates from copy mode entirely as well.** Simpler to describe. Rejected on evidence:
  Windows has no unprivileged file symlink, so on that platform these were always real files, and a
  user who keeps one would be left with a copy nothing ever refreshes.
- **Leave the machinery in place and only stop planning templates.** Rejected: with no link entries,
  the symlink, copy-only and repoint paths in `currentState` and `write` become reachable only from
  their own tests — four new instances of the exact shape `mutate-propose` exists to find, in the
  repository that ships it.

## Component / Boundary Impact

None — internal to the standalone-install tooling. No gate, hook or skill changes behaviour.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `sync-standalone.mjs --link` | no longer installs template symlinks | `linkPlan()` | anyone running `--link --apply` |
| `sync-standalone.mjs` (copy mode) | a template is paired only where the destination exists | `pairs()` | anyone running `--apply` |
| `linkPlan()` entry shape | `kind: 'link'`, `target` and `directory` are no longer emitted | `linkPlan()` | `write()`, `currentState()` |

## Inter-task Contracts

None — single task.

## Implementation

One task, in `tasks/`. See `tasks/README.md`.

## Consequences

- **Positive:** no post-release repoint action; a user's deletion of a home template survives the
  next sync; nothing this tool plans can dangle, because a forwarder names no version.
- **Negative:** a user who relied on `~/.claude/templates` being auto-created must now create it once
  by hand; `--apply` will keep it current thereafter. Contradicts the operator's `CLAUDE.md` line
  about keeping unnamespaced templates aligned with the plugin — accepted knowingly by the owner,
  the same trade ADR-001 made for skills.
- **Neutral:** `sameLineage()` keeps its `skill` and default arms, neither of which `linkPlan` can
  now reach. They are the safety layer that decides whether to touch a user's file rather than
  anything the planner emits, and ADR-001 set the precedent of keeping them.

## Out of Scope

- Removing the `qh-root` note from the eight skills that carry it — still correct for anyone keeping a hand-made bare-name copy, and unrelated to templates. (deferred: docs/BACKLOG.md §25)
- Pruning evicted versions from the plugin cache, or anything else about how Claude Code manages it. (permanent: not this plugin's directory to manage; the eviction is evidence here, not a defect to fix.)
- Restoring the content of a template a user deletes. (permanent: the `archive` helper keeps originals per run under the backup root, and the plugin's own copy is always readable; a second recovery path would be a mechanism with no reader.)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A future skill hard-codes a home template path and silently reads nothing | Low | Med | T1's acceptance greps every skill's template reference; it fails if one names anything but the plugin root |
| A Windows user's kept template stops being refreshed | Low | Low | Copy mode still pairs it; asserted by the `plan()` test with a drifted home template present |
| Removing the link machinery breaks an archive path a gate still needs | Low | High | `archive()` untouched; its symlink and EPERM cases retargeted onto a symlinked gate, where they remain live |

## Rollback

Revert the commit and run `node scripts/sync-standalone.mjs --link --apply`, which re-creates the
template links from the installed plugin. No persistent state and no external integration is
involved. The six links removed on this machine on 2026-08-28 pointed at
`<plugin>/2.20.0/templates/`, and their pre-removal state is in the backup root written the same
day; recreating them needs no backup, since a link's whole content is its target.

## Follow-ups

None — the decision this record makes was the open follow-up on ADR-001.
