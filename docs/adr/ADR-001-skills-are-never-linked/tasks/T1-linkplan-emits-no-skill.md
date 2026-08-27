# Task ADR-001-T1: `linkPlan` emits no skill entry, on any platform

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** `linkPlan()` emits no entry with `lineage: 'skill'`
**Consumes:** none
**Data dependency:** hermetic

## Goal

`--link` plans gate forwarders and template links only, so no personal skill is ever pointed at the
plugin's own skill directory.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/standalone-link.mjs` | edit | remove the skill branch from `linkPlan()`; the comment in its place is the only written record of why linking one is forbidden |
| `scripts/sync-standalone.mjs` | edit | `linkMode()`'s closing message is what SELECTS this behaviour for the operator — it states which half is release-proof and that skills are never linked |
| `scripts/lifecycle.mjs` | edit | the SessionStart shadow-install notice says the same thing, so the hook and the tool cannot disagree |
| `tests/standalone-link.test.mjs` | edit | the assertion over all three platforms, plus the four existing tests retargeted off skill entries onto template entries |

## Ordered Steps

1. Confirm the failing test is red first: add `no skill is ever linked, because a link would hide the namespaced skill` to `tests/standalone-link.test.mjs`, asserting `linkPlan` returns no entry whose path contains a `skills` segment for `darwin`, `linux` and `win32`, and watch it fail against the skill-linking `linkPlan`.
2. Delete the skill loop from `linkPlan()`, leaving a comment that states the mechanism (path identity collapses two names into one, and the namespaced entrypoint is the one that loses).
3. Retarget the four existing tests that used a skill entry as their vehicle — `a skill this plugin does not ship is unreachable`, the Windows template fallback, `a link left pointing at an older version is repointed`, and `a repoint still happens when the archive cannot make a link` — onto gate or template entries, since no skill entry exists to mine.
4. Keep `archive()`'s directory handling and give its test an explicitly constructed entry, because no shipped plan produces a directory entry any more; record that in `docs/BACKLOG.md` rather than leaving it unexplained.
5. Split the operator message in `linkMode()` and the notice text in `lifecycle.mjs`: gates are release-proof, templates are version-pinned links, skills are never linked.

## Acceptance

```bash
node --test tests/standalone-link.test.mjs 2>&1 | tee /tmp/adr001-t1.out; ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr001-t1.out
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `no skill is ever linked, because a link would hide the namespaced skill` | `tests/standalone-link.test.mjs` | `linkPlan` emits no skill entry on darwin, linux or win32, while gate and template lineages remain | — |
| `a skill this plugin does not ship is unreachable, not merely unlisted` | `tests/standalone-link.test.mjs` | a third-party skill or binary in the same directories can never be named by the plan | — |
| `a link left pointing at an older version is repointed` | `tests/standalone-link.test.mjs` | the repoint path still works, measured on a template rather than a skill | — |
| `a repoint still happens when the archive cannot make a link` | `tests/standalone-link.test.mjs` | an EPERM in `archive` does not abort the repoint | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `no skill is ever linked, because a link would hide the namespaced skill` |
| 2 — something selects it | `linkMode()` in `scripts/sync-standalone.mjs` calls `linkPlan` and writes only what it returns; mutation `link: no skill is ever linked` re-adds the skill loop and the test goes red |
| 3 — the caller can discover it | the `--link` closing message names the rule and its reason; `node scripts/sync-standalone.mjs --link` prints it |
| 4 — it is used | observed live 2026-08-27: after the thirteen bare-name links were removed and the plugin reloaded, all thirteen `quality-harness:*` skills were listed again |

## Mutation Log

- 2026-08-27 · dd9d952* · mutant killed · exit 1 · `scripts/standalone-link.mjs` · re-adds the skill loop the decision removed; the plan must never name a skill · acceptance-sha256:7ec98f05924877db2b979cbae1f582987268a59209043ee34d476c683d3ed32d

## Class Sweep

**Class:** every artifact kind this plugin ships that Claude Code also serves under a namespaced
`quality-harness:<name>` identity — those are the kinds a link can collapse.

```bash
ls -d bin hooks scripts skills templates
node -e "import('./scripts/standalone-link.mjs').then(m=>console.log([...new Set(m.linkPlan(process.cwd()).map(e=>e.lineage))].join(' ')))"
```

Run 2026-08-27 after the fix: ships `bin hooks scripts skills templates`; `--link` covers
`gate shim template`. One of the five kinds — `skills` — is served under a namespaced identity, and
it is no longer linked. `agents/` and `commands/` would join the class the day either is added; the
first command is what shows they are absent today, and it is why that is a sweep rather than a
recollection.

## Invariants

- Gate forwarders and template links keep being planned; this task removes one artifact kind, not the mechanism.
- Nothing this plugin did not install is ever named by the plan — `replaceable()` stays untouched.
- No file outside the user's `.claude` install tree is read or written.

## Risks

- A future `agents/` or `commands/` directory would be a new member of the same class. The test iterates the plan's lineages rather than checking for a literal `skills`, so a newly linked kind shows up in its assertion — but the test cannot know whether that kind is namespaced. Named in the ADR's class audit.

## Stop Condition

Stop if `linkPlan` is found to have a consumer outside this repository, or if removing the skill
branch makes any gate or template entry disappear from the plan — that would mean the branch was
load-bearing for something other than skills.

## Out of Scope

- Removing bare-name skills from any machine — the operator's action, not this tool's.
- Templates continuing to be version-pinned links (that's T2's neighbour, and ADR-001's Follow-up).

## Verification Log
- 2026-08-27 · dd9d952* · exit 0 · `node --test tests/standalone-link.test.mjs 2>&1 | tee /tmp/adr001-t1.out; ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr001-t1.out` · acceptance-sha256:7ec98f05924877db2b979cbae1f582987268a59209043ee34d476c683d3ed32d
