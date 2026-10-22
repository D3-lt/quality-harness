# ADR-124: The skills reach other agent hosts through one shared link the plugin keeps fresh

**Status:** Accepted
**Date:** 2026-10-22
**Owner:** Zy
**Spec:** None — no spec stage; the owner's scope answer of 2026-10-22 ("more hosts from one source")
**Cross-references:** docs/adr/ADR-001-skills-are-never-linked.md, docs/adr/ADR-004-templates-are-not-linked.md, docs/adr/ADR-123-the-product-layer.md, docs/research/2026-10-22-the-product-layer.md
**Governs:** `plugin/scripts/sync-standalone.mjs`, `plugin/scripts/standalone-link.mjs`, `plugin/scripts/on-session-start.mjs`
**Enforced-by:** None — declared by its tasks; each adds one campaign mutation per mechanism.
**Invalidates:** ADR-001 and ADR-004, narrowly — the clauses "it never installs a skill, on any platform" (ADR-001 Decision) and "`--link` installs gates only" (ADR-004 Decision) gain one exception: `--link --agents` links each skill under the shared agent skills directory, a path Claude Code is measured (T1) not to serve. Their general rule stands unchanged for every path Claude Code serves and for templates.
**Served-path change:** a user who runs `sync-standalone.mjs --link --agents` once gets this plugin's skills in every measured host that reads `~/.agents/skills`, and the links follow each plugin update without another run.

## Context

**The owner's scope answer, 2026-10-22,** while comparing pdd-kit: "more hosts from one source". pdd-kit serves several hosts by
copying its skills into each host's own directory and writing a marker beside each copy (its providers list, read 2026-10-22). A
copy per host is what ADR-001 measured going stale: nine of eleven personal copies had drifted by 2026-08-26.

**What the hosts document, read 2026-10-22, not measured:** Codex, Cursor, Gemini CLI and Copilot each read skills from a
project `.agents/skills` and a user `~/.agents/skills`. Only Codex documents that it follows a symbolic link there. Claude Code
reads `~/.claude/skills` and serves this plugin's skills as `quality-harness:<name>`; whether it also reads `~/.agents/skills` is
not documented either way.

**Why a link is dangerous here, and when it is not:** ADR-001 measured on 2026-08-27 that Claude Code collapses two names whose
real paths are equal, and the namespaced one loses. A link under a path Claude Code serves would remove every
`quality-harness:<name>` entrypoint. A link under a path Claude Code does not serve cannot collapse anything, but that is a claim
about Claude Code to measure, never to assume (CLAUDE.md §16): T1 measures it on the exact directory Claude Code serves.

**Why a link goes stale, and how this one does not:** ADR-004 measured on 2026-08-28 that a link into the plugin cache names one
version, and the cache evicts old versions: 23 of 61 releases were absent, so a link left behind dangles and nothing reports it.
This decision never links into a versioned directory. Each skill link targets a fixed path under the plugin's own data
directory, `$CLAUDE_PLUGIN_DATA/current`, and that one pointer is repointed to the running plugin root at every SessionStart.

## Existing Primitives Audit

- `linkPlan()` in `plugin/scripts/standalone-link.mjs` enumerates what `--link` installs, per artifact kind. **Extended:** a
  `skill-agents` kind, produced only under `--agents`.
- `replaceable()` refuses to touch a file this plugin did not install, but identifies a skill by its frontmatter `name` alone
  (`standalone-link.mjs:724`), so a user's own skill of the same name passes it. **Not reused for agent links:** an entry under
  `~/.agents/skills` is this plugin's only when the manifest (Decision 1) lists it and it is still a link to the target recorded
  there; anything else, a directory with the same frontmatter included, is left alone and named.
- `archive()` backs up before replacing. **Reused unchanged.** `write()` (`:1014`) only writes files and `currentState()` throws for
  a link; **extended** with a link branch (create, or replace a link the manifest owns), keeping archive-before-replace and the
  forwarder path unchanged.
- `linkTypeFor()` picks the Windows link type and refuses to guess a junction (BACKLOG §239). **Reused unchanged:** a Windows
  machine that cannot create a directory link is told so, and nothing is copied in its place.
- `on-session-start.mjs` already runs at every SessionStart with `CLAUDE_PLUGIN_DATA` set (`completion-rules.mjs:319`,
  `on-session-end.mjs:33` write there). **Extended:** it repoints `current`.

## Decision

1. **One shared endpoint, and a manifest of what it wrote.** `sync-standalone.mjs --link --agents` writes, for each skill the
   plugin ships, one link `~/.agents/skills/<name>` → `$CLAUDE_PLUGIN_DATA/current/skills/<name>`, and records each link, its
   target and the data directory in `~/.agents/.quality-harness-links.json`. It writes nothing per host and has no host
   selector: every host that reads that directory sees the same links. It creates a link only where nothing exists, and replaces
   only a link the manifest owns. Without `--apply` it reports what it would write, as `--link` does today.
2. **The pointer follows the plugin.** At every SessionStart, `on-session-start.mjs` points `$CLAUDE_PLUGIN_DATA/current` at the
   running plugin root, through a temporary link and a rename, and only when it differs. That is a write inside the plugin's
   own data directory, not in the user's tree, and it refuses nothing. With `CLAUDE_PLUGIN_DATA` unset it writes nothing.
3. **A dangling or moved link is said.** The SessionStart pass reads the manifest: a listed link whose target is missing is named
   once per change, with the command that repairs it; a manifest whose data directory is not this session's
   `CLAUDE_PLUGIN_DATA` (the host moved it) is named once, with `--link --agents --apply`, which repoints every listed link to the
   new directory. SessionStart writes nothing outside the data directory, so the move is said, not made. `sync-standalone.mjs`
   names both too.
4. **Supported hosts are a measured list.** The record and the skill `operating` name the host and version combinations T1 and
   T4 observed loading a linked skill's body. A host not on the list may still read the links; nothing claims it does.
5. **Claude Code is never served a second path.** If T1 observes Claude Code reading `~/.agents/skills`, this decision stops:
   the links would collapse the namespaced skills ADR-001 protects, and the owner decides again.

## Alternatives Considered

- **Copy the skills into each host's directory, as pdd-kit does:** rejected. ADR-001 measured copies drifting; a copy per host
  multiplies that by the hosts.
- **Link straight into the versioned plugin cache:** rejected. ADR-004 measured it dangling after eviction.
- **A per-host link directory:** rejected. The hosts share `~/.agents/skills`; a per-host directory exists only for some, and the
  shared one is what they document.
- **Refresh the links themselves at SessionStart:** rejected. That writes into the user's home on every session; one pointer
  in the plugin's own data directory does the same with no write outside it.
- **Project-scope `.agents/skills` links:** left out; a repository's skills are its owner's choice.

## Component / Boundary Impact

`standalone-link.mjs` gains the `skill-agents` kind; `sync-standalone.mjs` gains `--agents`; `on-session-start.mjs` gains the
pointer refresh and the dangling check. No module is added to `docs/architecture.md`.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `$CLAUDE_PLUGIN_DATA/current` | a link to the running plugin root, refreshed at SessionStart | T2 | the agent links |
| `sync-standalone.mjs --link --agents` | new flag | T3 | the user |
| `~/.agents/skills/<name>` | a link per skill | T3 | Codex and every measured host |
| SessionStart output | one line naming a dangling agent link, once per change | T2 | the user |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| The measured host list and the Claude Code verdict | T1 | T3, T4 | No |
| The `current` pointer | T2 | T3 | No — new |
| `--link --agents` | T3 | T4 | No — new |

## Implementation

See `tasks/README.md`.

## Consequences

- **Positive:** one source serves every measured host; a plugin update reaches them at the next session with nothing to run.
- **Negative:** the links depend on `CLAUDE_PLUGIN_DATA` staying where the host put it; a host that moves it leaves the links on
  the old directory until `--link --agents --apply` runs again, and SessionStart names the move and that command. Refresh needs
  a Claude Code session: another host's session alone does not repoint `current`.
- **Neutral:** a user who never runs `--agents` sees no change.

## Out of Scope

- Project-scope `.agents/skills` (permanent: boundary: a repository's skills are its owner's choice)
- Translating skills into a host's own format where it differs (permanent: boundary: one source, served as it is; a host that cannot read it is not on the list)
- Templates and gates under other hosts (permanent: boundary: ADR-004's rule stands for templates; gates already reach any host through `PATH`)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Claude Code reads `~/.agents/skills` and collapses the namespaced skills | Low | High | T1 measures it on the served directory; Decision 5 stops |
| A host follows no links | Med | Low | it is left off the measured list (Decision 4) |
| `current` points at an evicted root between sessions | Low | Med | refreshed at every SessionStart; a dangling link is said |
| A user's own skill of the same name is replaced | Low | High | ownership is the manifest and the recorded target, never the frontmatter name (T3 regression) |
| The host moves `CLAUDE_PLUGIN_DATA` | Low | Med | the manifest records the old directory; SessionStart names the move and the repair (T2) |
| Windows cannot create a directory link without developer mode | Med | Low | `linkTypeFor` refuses to guess; the user is told; T4 measures it on a Windows peer |

## Rollback

Delete the links `--agents` wrote (`sync-standalone.mjs` names them) and revert the tasks' commits; the pointer in the plugin's
data directory is inert without them.

## Follow-ups

- [x] A cold Codex review of this record before acceptance (2026-10-22: REQUEST CHANGES; ownership by manifest, relocation, `write()`, Windows update run and the attestation folded in).
- [ ] After T4: the measured host list in `operating` and the release (CLAUDE.md §18).
