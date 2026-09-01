# ADR-019: Make an orphan prove it is ours, and never act on it

**Status:** Accepted
**Date:** 2026-09-01
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-001-skills-are-never-linked.md, docs/adr/ADR-004-templates-are-not-linked.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/BACKLOG.md §95
**Governs:** `plugin/scripts/standalone-link.mjs`, `plugin/scripts/sync-standalone.mjs`, `plugin/scripts/lifecycle.mjs`, `tests/standalone-link.test.mjs`, `tests/lifecycle.test.mjs`
**Enforced-by:** `orphan: a file this plugin cannot prove it wrote is never named`

<This mutation label does not resolve yet: T1 creates it. Named here rather than left as
`None` because it is the check that fails when this decision is violated, and the campaign grades
it RED or GREEN on every run once it exists. `adr-lint` advises on the unresolved label until
T1 lands, which is the correct report while the record is accepted and unexecuted.>

**Invalidates:** none — checked. ADR-001 and ADR-004 both govern these files and both are about what `--link` and `--apply` INSTALL; this record is about what the tools SAY concerning a file already there, and changes neither installer. `replaceable()` — the primitive ADR-001 names as the reason the owner's own skills were never at risk — is reused unchanged and is not weakened.
**Served-path change:** A user whose home directory holds a file from a past installer that this plugin no longer ships is told which file, on what evidence, and what the version history says about it — where today both scanners are silent and a fork-era script is left asserting a layout that no longer exists.

## Context

Reported 2026-09-01 (GitHub issue #3, `docs/BACKLOG.md` §95), from a Windows 11 machine on 2.43.0
and as a follow-up to the scope-sharing fix in `bbd3f87`. `~/.claude/tests/selftest.sh`, 113 lines,
corresponds to no current upstream file — `scripts/selftest.sh` in this repository today is a
different, repository-scoped 70-line script. The orphan asserts the fork-era layout directly, so
after the reporter followed this plugin's own session-start guidance (*"better deleted than
synced"*) it printed `FAIL — 14 of 39 checks failed. Fix these before authoring anything.` All
fourteen were presence checks for the artifacts the guidance had just told them to delete. Every
functional check still passed, so it asserts a LAYOUT rather than detecting breakage — but its
summary reads as a broken install, and the obvious repair is to restore what the guidance said to
remove.

`SHADOW_SCOPE` cannot absorb it. Every entry pairs a home directory with a `shipped` one, and per
CLAUDE.md §1 `tests/` stays at the repository root and never ships. An orphan has no shipped
counterpart by definition.

### The measurement that decides the mechanism

The obvious rule — *a file in a scanned home directory that this plugin does not currently ship is
an orphan of ours* — is residual, and it is wrong. Measured 2026-09-01 against this machine's
`~/.claude/hooks/`, the directory `SHADOW_SCOPE` maps to `plugin/scripts`:

    for f in $(ls ~/.claude/hooks); do
      [ -e "plugin/scripts/$f" ] && echo "SHIPPED-NOW $f" || echo "NOT-SHIPPED $f"
    done

    SHIPPED-NOW  facts-gate-dispatch.sh
    SHIPPED-NOW  post-edit-check.sh
    NOT-SHIPPED  autoresearch-context.sh
    NOT-SHIPPED  cbm-code-discovery-gate
    NOT-SHIPPED  cbm-session-reminder
    NOT-SHIPPED  cbm-subagent-reminder

Four of the six are not ours at all. None appears in any plugin's cache under
`~/.claude/plugins/cache/*/*/*/hooks/`; they belong to `autoresearch` and `codebase-memory`. Three
of the four are wired in the user's own `settings.json` and were running during the session that
measured them:

    grep -oE '"[^"]*(cbm-|autoresearch-context)[^"]*"' ~/.claude/settings.json
    "$HOME/.claude/hooks/cbm-code-discovery-gate"
    "$HOME/.claude/hooks/cbm-session-reminder"
    "$HOME/.claude/hooks/cbm-subagent-reminder"

So the residual rule would name four live files belonging to two other tools as orphans of this
plugin, and three of them are hooks whose deletion breaks the user's session. That is not a tuning
problem. It is the rule being the wrong shape: *not ours* and *ours but retired* are indistinguishable
from absence in the current tree, and only positive evidence separates them.

### What this corrects in its own predecessor

`docs/BACKLOG.md` §95 and GitHub issue #3 both say this work inverts the tools' standing posture of
never acting on a file this plugin did not install, and therefore carries an unrecoverable
worst case. That framing assumed the tool would recommend a deletion. It does not have to, and
under CLAUDE.md §3 it should not: a gate here instructs and never acts. An advisory that names a
file and explains the evidence turns a wrong identification from lost data into a wrong sentence.
The posture is not inverted by this record — `replaceable()` still governs everything the tools
touch, and nothing new writes or deletes.

### Why digest-at-a-fixed-path is not enough either

`knownDigests(relative)` recognises a file as ours when it matches a cached release's copy at the
same relative path. Measured 2026-09-01 across this machine's cache:

    ls -d ~/.claude/plugins/cache/quality-harness/quality-harness/*/tests             # 10+ versions
    ls    ~/.claude/plugins/cache/quality-harness/quality-harness/*/tests/selftest.sh # no matches

Old releases shipped a `tests/` directory and none ever shipped a `selftest.sh`, so for the exact
file reported the known-digest set is empty. Worse, the relative path is not stable across this
project's own history: ADR-008 moved the gates under `plugin/` on 2026-08-28, and the home `hooks/`
directory has always mapped to a plugin directory of a different name. A lookup pinned to a
relative path answers "no" for a file that shipped for a year under a different one.

## Existing Primitives Audit

- `knownDigests(relative, home)` in `plugin/scripts/standalone-link.mjs` already walks every cached
  release and collects digests. **Reshaped:** the walk is reused, keyed on BASENAME across each
  release's whole tree rather than on one relative path, so a file that moved between releases is
  still recognised.
- `sameLineage(target, source, kind)` already decides whether a home file is a drifted copy of a
  plugin file rather than a stranger, by opening docstring, forwarder mark or first meaningful line.
  **Reused unchanged** as the second identification route, against a historical release's copy
  instead of the current tree's.
- `replaceable(entry, home)` already refuses anything that is not ours and returns the reason.
  **Reused unchanged.** It is the reason the owner's `autoresearch`, `codebase-memory` and
  `troubleshoot-orders-equinox` files were never at risk (ADR-001), and this record does not touch it.
- `SHADOW_SCOPE` (added 2026-09-01, `bbd3f87`) enumerates the directories a standalone install
  mirrors. **Reused for its home names only:** the orphan scan needs directories a PAST installer
  may have written, which is a superset, so it is not extended for this.
- `shadowInstallNotice()` in `plugin/scripts/lifecycle.mjs` already renders a drift report with a
  per-cause explanation. **Reshaped:** it gains an orphan section; nothing about drift changes.

## Decision

**A file under the user's home is named as an orphan only when this plugin can prove it wrote it,
and naming it is all that ever happens.**

Identification is positive and evidence-bearing. A home file is classified as `ours-orphan` only
when it is absent from the plugin's current tree AND at least one of these holds:

1. its digest matches a copy of the same basename in some cached release, or
2. it carries `FORWARDER_MARK`, or
3. `sameLineage()` matches it against a cached release's file of the same basename.

All three read **this plugin's own cache namespace only** —
`~/.claude/plugins/cache/quality-harness/quality-harness/` — never `cache/*/*/`. Routes 1 and 2 are
specific by construction: a digest identifies one file and `FORWARDER_MARK` is our string. Route 3
is not. `sameLineage(target, source, 'gate')` compares opening docstrings and `'shim'` matches
`%~dp0[\w-]+`, and neither is specific to this plugin — so a same-named file from another tool,
matched against another vendor's release, could pass it. Narrowing the namespace is what makes
route 3 safe to keep, and it is a condition of the decision rather than an implementation detail.

Anything the three cannot answer is reported as `unidentified` and is never called ours — the
vocabulary ADR-005 requires of a check that could not determine something. Absence from the current
tree is a precondition, never evidence.

The report is advisory in the strict sense: `--apply` deletes nothing and archives nothing, no code
path removes a home file, and the text says what was found and what the version history shows. The
user decides.

**What would make this decision wrong, and whether such data exists:** an orphan whose bytes were
edited by its user and whose lineage markers were rewritten satisfies none of the three routes, so
it is reported as `unidentified` and the user is not told what it is. That failure is real and
expected — the reporter's `tests/selftest.sh` is a probable instance, since no release ever shipped
that basename. This record chooses silence over a guess in that case, and the falsifying observation
is a machine where the `unidentified` count is large enough that the report is noise rather than
signal. No such data exists today: on the machine that authored this, the count over
`~/.claude/{bin,hooks,skills,templates}` is four, all four correctly not ours.

## Alternatives Considered

- **Residual rule — anything in a scanned directory the plugin does not currently ship is an orphan.**
  Rejected because it was measured wrong on the authoring machine: it names four files belonging to
  `autoresearch` and `codebase-memory`, three of them wired and live, as orphans of this plugin.
- **Recommend or perform deletion.** Rejected on CLAUDE.md §3 — a gate here instructs and never
  acts — and because copy mode does not archive, so a wrong identification is unrecoverable. Naming
  the file is what the reporter needed; the deletion was never the ask.
- **Content signature — recognise the fork-era layout by the strings it asserts.** Rejected as
  unfalsifiable maintenance: a signature is a claim about files that no longer exist in any tree we
  can check, so nothing can grade it, and it goes stale silently. Routes 1–3 are all checkable
  against artifacts on disk.
- **Extend `SHADOW_SCOPE` with a `tests` entry.** Rejected because `tests/` never ships, so
  `readdirSync(path.join(source, 'tests'))` throws and the `catch { continue }` swallows it — a
  green no-op, the same failure the `hooks`→`scripts` pairing exists to avoid, one field over.
- **Do nothing and document it.** Rejected because the reported failure is the plugin's own guidance
  producing a red summary whose obvious repair is to undo what the guidance recommended.

## Component / Boundary Impact

- `plugin/scripts/standalone-link.mjs` — owns identification. Gains the historical lookup and the
  classifier; keeps its one reason to change (what a standalone install is, and what is ours).
- `plugin/scripts/sync-standalone.mjs` — owns the copy/link report. Gains an orphan section it only
  prints. It does not gain a write path, so its reason to change is unaltered.
- `plugin/scripts/lifecycle.mjs` — owns the session-start notice. Gains an orphan sentence.
- No new component, no new ownership boundary.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `formerlyShipped(name, homeDirectory)` | new export — the cached releases whose tree holds this basename, with digests | `plugin/scripts/standalone-link.mjs` | T2 classifier |
| `classifyHomeFile(...)` | new export — `ours-shipped` \| `ours-orphan` \| `unidentified` | `plugin/scripts/standalone-link.mjs` | `sync-standalone.mjs`, `lifecycle.mjs` |
| `orphans(home)` | new export — the classified rows for every scanned directory | `plugin/scripts/standalone-link.mjs` | `sync-standalone.mjs`, `lifecycle.mjs` |
| `sync-standalone.mjs` stdout | additive section in the DEFAULT report — unconditional, no opt-out flag, no write path added | `sync-standalone.mjs` | the user |
| `shadowInstallNotice()` return string | additive sentence when orphans are found | `lifecycle.mjs` | the session-start hook |

No config key, no schema, no persistent state.

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `formerlyShipped()` | T1 | T2 | No — new export |
| `classifyHomeFile()` | T1 | T2, T3 | No — new export |
| `orphans()` | T2 | T3 | No — new export |

## Implementation

See `tasks/README.md`. Three tasks, sequential.

## Consequences

- **Positive:** a file a past installer left is named, with the evidence and the version history
  behind it, instead of being invisible to both scanners.
- **Positive:** the identification rule is stated so it can be broken on purpose — the mutation in
  `Enforced-by`, which T1 creates, WILL turn "we do not guess" into something the campaign grades
  every run. It does not exist yet; nothing about this record is graded until T1 lands.
- **Negative:** a home file whose bytes and lineage markers were both edited is reported as
  `unidentified` and the user gets no explanation of it. The reported `tests/selftest.sh` is a
  probable instance, so this record does not close its own trigger case, and says so.

  **THAT PREDICTION WAS WRONG, AND IS LEFT ABOVE RATHER THAN EDITED.** Measured by the reporter on
  2026-09-01 against the shipped code: their file was NAMED, `matched by lineage`, not reported as
  `unidentified`. The estimate came from looking for `*/tests/selftest.sh` across the cache — a
  PATH — while the mechanism keys on BASENAME, which is the decision this record makes two sections
  above, for exactly the path-instability reason. Ten of their thirty cached releases ship
  `scripts/selftest.sh`, so the lookup found it and `sameLineage` matched it. The fix reached
  further than the pessimistic estimate in the report it was answering, and the estimate was
  pessimistic because it was measured against the wrong key.

  The reporter also tried to break the rule this record rests on, which is worth more than the
  correction: they planted a foreign file (`gate-regressions.py`, content *"Wholly unrelated tool.
  Not quality-harness."*) at a genuinely shipped basename in a scanned directory. The unidentified
  count rose and **the plant was not claimed**. Basename alone does not convict — tested by someone
  trying to make it fail.
- **Negative, found in use:** the citation was wrong while the verdict was right. The report read
  `last shipped in 2.0.0`, false on both readings — 2.0.0 was the EARLIEST release holding the
  basename, and the one sharing none of the file's 89 unique lines while later releases shared
  four. A citation is the part a reader checks, so a wrong one sends them to the single copy that
  disproves a correct answer. Fixed 2026-09-01: releases are ordered numerically (the bare `.sort()`
  was lexical, the trap CLAUDE.md names), the cited release is the best match rather than the first
  found, and the wording says what matched.
- **Negative:** the historical lookup reads every cached release's tree. On the authoring machine
  that is 52 directories; it runs on the session-start path, so T2 owns showing the cost.
- **Neutral:** `--apply` gains no behaviour. Users who expect a report to be actionable by the same
  tool will have to act themselves, which is this project's standing posture, not a new one.

## Out of Scope

- Deleting, archiving or moving any file under the user's home (permanent: boundary: CLAUDE.md §3 — a gate here instructs and never acts, and copy mode does not archive, so a wrong identification would be unrecoverable)
- Deriving `SHADOW_SCOPE`'s drift scope from what the plugin currently ships, which would cover `plugin/workflows` (deferred: docs/BACKLOG.md §96)
- Identifying an orphan whose bytes and lineage markers were both edited (permanent: boundary: no artifact on disk can settle it, so any rule would be a guess this record chooses not to make)
- The `2.0.0` cache directory's non-release contents, which the historical lookup must tolerate (deferred: docs/BACKLOG.md §96)
- Anything about `--link`, which installs gates only and is a third, narrower scope (permanent: boundary: unchanged by this decision; ADR-004 governs it)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A false `ours-orphan` on another tool's file | Low | High — the user deletes something live | Identification is positive; T1's tests use the four real not-ours basenames measured on 2026-09-01 as fixtures, and the mutation in `Enforced-by` makes the residual rule fail the campaign |
| The report is noise on a machine with many unidentified files | Med | Low | `unidentified` is counted, not enumerated, and T3 asserts the count-only rendering |
| The historical lookup is slow on a large cache | Med | Med | T2 measures it against the authoring machine's 52 releases and records the figure with its date; the walk is per-basename and short-circuits on first match |
| A cache directory that is not a release (`2.0.0` holds `AUTHn`, `cuda-1.9`, `maximum`) yields a bogus match | Low | Med | The lookup requires a basename match AND a digest or lineage match; T1 asserts a junk directory contributes nothing |
| The reported file stays unidentified, so the issue is not closed by this record | High | Low | Stated in Consequences and in the record's own trigger; the reporter is told what the tool can and cannot say |

## Rollback

Revert the three commits. Nothing persists: no file is written under the user's home, no config key
is added, no state is stored, and the only outputs are strings printed by a report and a notice. A
partially executed record leaves the new exports unreferenced, which is inert.

## Follow-ups

- [ ] After this ships, count `unidentified` rows reported across the machines that report at all. If most reports are unidentified, the three routes are too narrow and the decision above is the thing to revisit — not the rendering.
