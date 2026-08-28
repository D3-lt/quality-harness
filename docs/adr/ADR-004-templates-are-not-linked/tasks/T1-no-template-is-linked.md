# Task ADR-004-T1: no template is linked, and a deletion stays deleted

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic

## Goal

Stop `--link` planning template symlinks and stop copy mode creating templates that do not exist,
so no entry this tool installs names a version — while keeping a template the user chose to keep
refreshed, which is the only thing serving Windows, where these were never links.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/standalone-link.mjs` | edit | `linkPlan()` is where what `--link` installs is decided; with no link entries the symlink, copy-only and repoint paths in `currentState()` and `write()` become unreachable and go with it |
| `scripts/sync-standalone.mjs` | edit | `pairs()` is where copy mode decides what to mirror; the per-directory policy keeps gates created-when-missing while templates follow the skill rule |
| `tests/standalone-link.test.mjs` | edit | asserts the new contract, and moves the four cases that used a template link onto gates where each concern is still live |
| `tests/lifecycle.test.mjs` | edit | asserts both halves of the copy-mode rule: a missing template is not work, a missing gate is |
| `tests/mutations.json` | edit | the mutation carrying ADR-001's guarantee rode on the removed loop; three entries added for the new rules, one removed for a contract that no longer exists |
| `tests/package.test.mjs` | edit | a catalogue entry matching nothing is only visible after a 37-minute campaign; reading it off the tree makes the same defect a suite failure |
| `scripts/lifecycle.mjs` | edit | the session notice told every user to re-run `--link --apply` to repoint templates, which is now false |

## Ordered Steps

1. Confirm the failing tests first: assert in `tests/standalone-link.test.mjs` that `linkPlan` emits no `template` lineage and nothing but `forwarder` kinds on darwin, linux and win32, and in `tests/lifecycle.test.mjs` that a template absent from the home directory is not work while a gate absent from it is. Both are red against the shipped code.
2. Remove the templates loop from `linkPlan()`, recording in its place why — nothing reads them, a link names one version, and an evicted version makes a link dangle silently where a stale copy would be reported.
3. Give `pairs()` a per-directory policy so `bin` is created when missing and `templates` is skipped when missing, matching the rule skills already follow one loop below.
4. Delete the link machinery `linkPlan` can no longer reach: the win32 copy-only branch and the repoint tail in `currentState()`, and the copy-only and symlink branches in `write()`. Retarget the four tests that used a template link onto gates, and point the archive test at `archive()` rather than hand-building a plan entry no planner produces.
5. Correct the three report strings, the header comment, and the SessionStart notice in `scripts/lifecycle.mjs` that promise template links, then rewrite ADR-001's `link: no skill is ever linked` mutation to ADD a skills loop rather than retarget the deleted one, and add three catalogue entries for the new rules.
6. Remove `link: Windows falls back to a copy for a file symlink`, whose branch is gone with the last link entry — a contract that no longer exists must not keep a mutation alive, because a mutation matching nothing is reported as STALE and sits in the summary beside real kills. Then add the check that reads that condition off the tree, so the next one is a suite failure in milliseconds rather than a count at the end of a campaign.

## Acceptance

```bash
set -o pipefail
node --test tests/standalone-link.test.mjs tests/lifecycle.test.mjs tests/package.test.mjs 2>&1 | tee /tmp/adr004-t1.out && ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr004-t1.out
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `no template is linked either, so nothing this plans can dangle` | `tests/standalone-link.test.mjs` | `linkPlan` emits no template lineage and only `forwarder` kinds, on all three platforms, even with a home template present | — |
| `no skill is ever linked, because a link would hide the namespaced skill` | `tests/standalone-link.test.mjs` | ADR-001's guarantee, now with the tail asserting gates and shims rather than gates and templates | — |
| `a directory where a file belongs is reported, not clobbered` | `tests/standalone-link.test.mjs` | `replaceable` refuses a directory where a gate belongs | — |
| `the write still happens when the archive cannot make a link` | `tests/standalone-link.test.mjs` | an EPERM from the archive does not take the install with it, on a symlinked gate | — |
| `a directory is kept whole, not just the one file that named it` | `tests/standalone-link.test.mjs` | `archive()` keeps a directory recursively, called directly rather than through `write()` | — |
| `the sync command reports before it writes, and syncs from the newest install` | `tests/lifecycle.test.mjs` | a missing template is not work; a drifted one is; a missing gate is; and a report writes nothing | — |
| `every catalogue entry still matches the source it mutates, exactly once` | `tests/package.test.mjs` | every mutation's `from` appears in its file exactly once, and the failure names which do not | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the tests above |
| 2 — something selects it | `scripts/selftest.sh` runs `node --test tests/*.test.mjs`, so all of them run on every check and in CI; four catalogue mutations break each half and the suite goes red |
| 3 — the caller can discover it | `sync-standalone.mjs --link` prints what it installs and why nothing else is linked; `adr-context scripts/standalone-link.mjs` returns ADR-001 and ADR-004 |
| 4 — it is used | run on this machine 2026-08-28: six links removed, then both `sync-standalone.mjs` and `--link` report "Nothing to do" — the deletion holds under the mode that used to recreate it |

## Class Sweep

**Class:** every artifact kind `--link` and `--apply` can install into the home directory.

```bash
node -e "
const { linkPlan } = await import('./scripts/standalone-link.mjs')
const root = process.cwd()
for (const p of ['darwin','linux','win32'])
  console.log(p, JSON.stringify([...new Set(linkPlan(root, '/tmp/none', p).map(e => e.lineage + ':' + e.kind))]))
" --input-type=module
```

Run 2026-08-28: `gate:forwarder` and `shim:forwarder` on all three platforms, nothing else. The
three kinds this tool could install were gates, templates and skills; skills went in ADR-001,
templates go here, and gates are the one kind whose indirection carries no version.

## Mutation Log

<!-- tool-written by adr-verify --mutant; empty at authoring -->
- 2026-08-28 · 80fb77d · mutant killed · exit 1 · `scripts/sync-standalone.mjs` · the policy IS the rule: with templates created when absent, a deletion is undone by the next sync and reported as an update · acceptance-sha256:3250b9c8efc2ca27dc09f23f5d351134f54885f01da577eb3b2695110dec1cdb
- 2026-08-28 · 930cfbf · mutant killed · exit 1 · `plugin/scripts/sync-standalone.mjs` · sync: a template the user does not have is not created · acceptance-sha256:e14814c5d526c4f0aa1e72651a5a237f3dc2285e7448b2b9da69e8a37b641928

## Invariants

- `--link` plans nothing that names a version, so no entry it installs can dangle when the cache evicts.
- A gate is still created wherever it is missing — the standalone set exists so a bare-name gate resolves, and the two halves of the rule are asserted by separate mutations.
- A template or skill the user deleted stays deleted through both modes.
- `replaceable()` and `archive()` are unchanged: they inspect what is actually in the user's home, which can be anything, so their branches stay live.
- Nothing is executed from the home directory; `tests/package.test.mjs` enforces that independently.

## Risks

- Removing the link machinery could break an archive path a gate still needs. Mitigated by leaving `archive()` untouched and retargeting its symlink and EPERM cases onto a symlinked gate, where they remain reachable.
- ADR-001's recorded mutation rode on the deleted loop and would have gone STALE rather than RED — a mutation matching nothing reads like a passing one. Mitigated by rewriting it to add a skills loop and confirming RED before recording.

## Stop Condition

Stop if any consumer is found that reads a template from the home directory rather than the plugin
root — that would make the templates reachable, which is the premise this record rests on.

## Out of Scope

- Removing the `qh-root` note from the eight skills that carry it. (deferred: docs/BACKLOG.md §25)
- Deleting `sameLineage()`'s `skill` and default arms, which `linkPlan` can no longer reach. (deferred: docs/BACKLOG.md §25)
- Any change to how gates are installed. (permanent: a forwarder resolves at call time and carries no version, which is the property this task is extending to the rest of the plan by removing the rest.)

## Verification Log
<!-- tool-written by adr-verify; empty at authoring -->
- 2026-08-28 · 72fa5a3 · exit 0 · `node --test tests/standalone-link.test.mjs tests/lifecycle.test.mjs tests/package.test.mjs 2>&1 | tee /tmp/adr004-t1.out; ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr004-t1.out` · acceptance-sha256:3250b9c8efc2ca27dc09f23f5d351134f54885f01da577eb3b2695110dec1cdb
- 2026-08-28 · 74fa265 · exit 0 · `set -o pipefail …` · acceptance-sha256:e14814c5d526c4f0aa1e72651a5a237f3dc2285e7448b2b9da69e8a37b641928
