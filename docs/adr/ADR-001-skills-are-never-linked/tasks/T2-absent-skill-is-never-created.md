# Task ADR-001-T2: a skill the user does not have is never created by a sync

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** zy
**Produces:** `plan()` omits a skill pair whose destination does not exist
**Consumes:** none
**Data dependency:** hermetic

## Goal

`--apply` refreshes a bare-name skill only where one already exists, so an operator who deletes one
keeps it deleted instead of having the next sync restore it and call it an update.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/sync-standalone.mjs` | edit | `pairs()` skips a skill whose destination is absent; `plan()` is what SELECTS the copy set that `--apply` writes |
| `tests/lifecycle.test.mjs` | edit | asserts both directions — absent stays absent, present is still kept in step |

## Ordered Steps

1. Confirm the failing assertion is red first: change the existing `plan()` test to expect `undefined` for `skills/adr-write/SKILL.md` in a home that has no such skill, and watch it fail against the current `pairs()`, which reports it `missing`.
2. In `pairs()`, skip a skill pair whose destination does not exist, with a comment recording that creating one is what puts a shadowing copy beside a skill the plugin already serves.
3. Add the other half of the assertion: a bare-name skill that DOES exist and has fallen behind is still reported `drifted`, so this narrows creation without abandoning the users who chose to keep one.
4. Reword the default-mode closing message so it no longer offers `--link` as something that stops skills drifting.

## Acceptance

```bash
node --test tests/lifecycle.test.mjs 2>&1 | tee /tmp/adr001-t2.out; ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr001-t2.out
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `the sync command reports before it writes, and syncs from the newest install` | `tests/lifecycle.test.mjs` | a skill absent from the home directory is not work, while one that exists and has drifted still is | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two assertions inside `the sync command reports before it writes, and syncs from the newest install` |
| 2 — something selects it | `main()` reports `plan()` and `--apply` writes exactly what it returns; mutation `sync: a skill the user does not have is not created` removes the guard and the test goes red |
| 3 — the caller can discover it | `node scripts/sync-standalone.mjs` on a machine with no bare-name skills prints "already matches this plugin" instead of listing thirteen as missing |
| 4 — it is used | observed live 2026-08-27 on this machine after the thirteen were deleted: both `--link` and the default report say there is nothing to do |

## Mutation Log

- 2026-08-27 · dd9d952* · mutant killed · exit 1 · `scripts/sync-standalone.mjs` · removes the guard, so a skill the user deleted is reported missing and recreated by --apply · acceptance-sha256:cda47fde00c08e89c17b20ba1c04cc83d45c728c5a395df23738d7e4701f3063

## Class Sweep

**Class:** every artifact kind `pairs()` creates in the user's home when the destination is absent.
A kind that can be created is a kind that can be re-created after the user deletes it.

```bash
grep -n "add(path.join(source" scripts/sync-standalone.mjs
```

Run 2026-08-27: **two** call sites for three kinds — line 70 sits inside a loop over
`['bin', 'templates']`, line 84 is the skills pair. Only the skills site is guarded, and
deliberately: `bin` and `templates` have no namespaced twin to shadow, so creating one cannot hide
anything. The sweep is recorded because "only skills needed the guard" is a claim, and this is the
command that makes it checkable — a first draft of this paragraph said "three call sites", which the
command it cites does not return.

## Invariants

- A bare-name skill that exists is still kept in step; this narrows creation, not refreshing.
- Gates and templates are still created when absent — they have no namespaced twin to shadow.

## Stop Condition

Stop if a consumer is found that relies on `--apply` provisioning a fresh standalone install from
nothing, since that workflow would no longer produce skills.

## Risks

- An operator installing the compatibility entrypoints for the first time now has to create the skill directories by hand. Stated in the ADR's Consequences; the alternative re-opens the shadowing this ADR exists to close.

## Out of Scope

- Whether the bare-name entrypoints should exist at all — the operator's `CLAUDE.md` decision, not this tool's.

## Verification Log
- 2026-08-27 · dd9d952* · exit 0 · `node --test tests/lifecycle.test.mjs 2>&1 | tee /tmp/adr001-t2.out; ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr001-t2.out` · acceptance-sha256:cda47fde00c08e89c17b20ba1c04cc83d45c728c5a395df23738d7e4701f3063
