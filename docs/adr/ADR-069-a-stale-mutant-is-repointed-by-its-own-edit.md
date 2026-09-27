# ADR-069: A stale mutant is repointed by its own edit

**Status:** Accepted
**Date:** 2026-09-27
**Owner:** Zy
**Spec:** None — no spec stage; BACKLOG §301 Stage 4 (mutation tooling), its first item
**Cross-references:** docs/BACKLOG.md, docs/adr/ADR-006-a-verdict-that-names-its-own-reliability.md, docs/adr/ADR-023-a-measured-verdict-may-be-reused.md, docs/research/2026-09-26-model-out-of-the-loop.md
**Governs:** scripts/mutate.mjs
**Enforced-by:** `tests/mutate-runner.test.mjs::repointEntry reproduces the mechanical repoints of the 3.1.0 batch and refuses the rest`
**Invalidates:** none — checked (ADR-006 and ADR-023 govern how a mutant is graded and when a verdict is reused; this record changes neither, and a repointed entry is measured afresh because its subject changed)
**Served-path change:** None — this ADR changes only repository tooling (`scripts/mutate.mjs`); nothing in `plugin/` changes.

## Context

A catalogue entry in `tests/mutations.json` names its mutation by text: `from` must occur exactly once in `file`, and `to` replaces it. An edit that changes that line leaves the entry STALE: it matches nothing, so it mutates nothing. Two checks already say so:
- `node scripts/mutate.mjs --stale` lists every stale entry with the nearest line (`staleEntries`, BACKLOG §280);
- `tests/mutate-runner.test.mjs::mutate --stale over the real catalogue exits 0 and says every entry matches` fails the selftest while any entry is stale, so no stale entry reaches a commit that passed the gate.

What no tool does is the repair. Every stale entry of the 3.1.0 batch was rewritten by hand in `tests/mutations.json`, a 13,700-line JSON file whose strings carry escaped regexes.

**Measured 2026-09-27**, by replaying the rule below over `git log -p tests/mutations.json` from 341c49c through a11f334, each entry against the source as the commit that repointed it left it. Twelve entries had their `from` rewritten by hand while they matched nothing:
- six are reproduced exactly: the ADR-067 keyword skip (twice), `cmd /c`, a shell that parses without executing, `--help` and `--version`, and the orphan-sweep occurrence count;
- six are refused: in five the edited text is no longer on the nearest line (the two ADR-068 T1 guards, `+o noexec`, a shell option taking a value, a command substitution rewritten), and one has no nearest line at all (an echo piped into a shell).

Two more hand repoints of the batch (the dry-run exemption, the survival-note override) were made before any commit and are not in the history; replayed from the session, both are refused. So six of fourteen were mechanical, and the rule reproduces each; eight were rewrites, whose right mutant is a judgement about the new code.

**The same rule repoints onto a sibling, also measured.** A cold review deleted each of the 1,138 single-line entries' line in turn and ran the rule: 83 were proposed onto a different, unchanged line (`hook.qh-publish-commit.enabled` onto its `qh-publish-push` sibling in `plugin/scripts/lifecycle.mjs`, among others). In all six mechanical cases above, the nearest line was ADDED by the change that made the entry stale; in all 83 siblings it pre-existed. That is condition 5 below.

At a11f334 the catalogue holds 1,453 entries: 315 have a `from` spanning lines, and 66 of the single-line ones have an edit that only inserts (an empty `oldMid`).

The class, every catalogue entry whose `from` does not match its file exactly once, enumerated with `node scripts/mutate.mjs --stale`: 0 at a11f334.

## Existing Primitives Audit

- `staleEntries(mutations, read)` in `scripts/mutate.mjs` finds each stale entry and a nearest line by shared words. **Reused** as the locator.
- `addedLines` / `changedDiffArgs` (`--changed`) read a diff's added lines in one fixed format. **Reused** for condition 5.
- `--stale` prints the stale list. **Kept**; `--repoint` is its sibling.
- `dirtyTargets` and `--force`: the campaign refuses to rewrite a source with uncommitted edits unless `--force` accepts that an edit made during the run is rolled back. **Reused** unchanged by `--write`'s measurement.
- The campaign runner and its ADR-023 cache grade an entry. **Reused** to measure what `--write` wrote.
- `adr-verify --mutant` records a task's own mutant against its fence and never reads the catalogue. **Unrelated.**

## Decision

`scripts/mutate.mjs --repoint [--since <ref>]` answers, for each stale entry, with a proposal or a refusal, and writes nothing. An entry's EDIT is `oldMid` → `newMid`, the text between the longest common prefix and suffix of its `from` and `to`. The entry is repointed when all of these hold, and refused naming the first that fails:
1. its `from` is one line;
2. `staleEntries` gives a nearest line, taken whole from the file, indentation included;
3. `oldMid` is non-empty and occurs exactly once on that line;
4. that line occurs exactly once in the file as a SUBSTRING, as the campaign counts `from`;
5. that line was ADDED since `<ref>` (`git diff <ref> -- <file>`; default `HEAD`, whose catalogue matched its sources because the selftest required it).

The proposal is `from` = that line and `to` = that line with `oldMid` replaced by `newMid`. An entry that matches more than once is refused as ambiguous. Exit codes: 0 when nothing is stale; 1 while anything is stale, proposed or refused.

`--repoint --write` rewrites the proposed entries' `from` and `to` in `tests/mutations.json` and nothing else, writing `JSON.stringify(catalogue, null, 2) + '\n'`, which reproduced the catalogue byte for byte at a11f334. The order is fixed: claim the campaign lock; compute the proposals; check the proposed entries' sources for uncommitted edits, and without `--force` refuse with exit 2 BEFORE writing anything, since after a refactor those sources are uncommitted by definition; write; measure exactly the rewritten entries with the campaign runner; release the lock. Exit 0 only when every rewritten entry is RED and no entry remains stale. A rewritten entry graded GREEN, STALE, UNPROVEN or HUNG is left written and named, exit 1: it is a finding about the repoint or the test, and the diff is for a person to review. Refused entries are listed and untouched.

`--root <dir>` names the repository whose catalogue, sources, lock, journal and cache are used (default: this one). All five come from one pure exported resolver, so a scratch run cannot reach this checkout's lock or journal while a real campaign runs here.

**What makes it fail.** The twelve committed rows above are T1's fixture (`tests/fixtures/mutate-repoint/replay.json`), each with a window of its source inline so the fixture does not move when the repository does: the rule must propose exactly the six mechanical repoints, each byte-equal to the hand repoint, refuse the six rewrites, and refuse a sibling built the reviewer's way (a near-identical line the change did not add). Any other outcome fails it.

## Alternatives Considered

- **Fuzzy re-anchoring: edit distance to the nearest line, and a diff3 merge of the old edit.** Rejected: it would "repoint" the six rewrites into plausible mutants of the wrong mechanism (the ADR-068 guard's right mutant drops `owner === null`, text the old entry never had), and the sibling measurement shows where a nearest-line guess goes wrong.
- **Conditions 1-4 without condition 5**, as first drafted. Rejected on the cold review's measurement: 83 of 1,138 sibling proposals.
- **Anchoring entries by line number or by AST path.** Rejected: a line number moves on every edit above it, and an AST path needs a parser per language in repository tooling (JavaScript and Python today). The text anchor's uniqueness is itself the guard that a mutant lands where it was meant to.
- **Repointing inside the gate.** Rejected: a selftest that rewrites the catalogue it grades is self-certifying, the shape CLAUDE.md §4 forbids. The write is an explicit command whose diff a person reads.
- **Keep repointing by hand, with the `--stale` hint.** Rejected on the measurement: six of the batch's fourteen repoints were mechanical, each a hand edit of an escaped JSON string that the rule reproduces byte for byte.

## Component / Boundary Impact

None — internal to `scripts/mutate.mjs`, repository tooling that never ships.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `scripts/mutate.mjs` flags | new `--repoint`, `--since <ref>`, `--root <dir>`, `--repoint --write` | T1, T2 | a person or session after a refactor |
| `campaignPaths(root)` export | new pure resolver: catalogue, lock, journal, cache | T1 | T2, `tests/mutate-runner.test.mjs` |
| `repointEntry(entry, text, added)` export | new pure function | T1 | T2, `tests/mutate-runner.test.mjs` |
| `tests/mutations.json` | rewritten by `--repoint --write`, `from`/`to` only | T2 | the campaign |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `repointEntry(entry, text, added)` → `{ verdict: 'repointed', from, to }` or `{ verdict: 'refused', why }` | T1 | T2 | No — new |
| `campaignPaths(root)` and `--root` | T1 | T2 | No — the default root is this repository, as today |

## Implementation

See `tasks/README.md`: T1 (the rule, the resolver and the read-only flag), then T2 (the write, and measuring what it wrote).

## Consequences

- **Positive:** a mechanical repoint is one command whose output a person reads, in place of a hand edit of escaped JSON; a rewrite is named as needing judgement rather than patched.
- **Negative:** a proposal can still land on a similar line of a different mechanism when that line was itself added by the change; the RED it earns proves a test notices it, not that it is the same mechanism. The printed old and new lines, and the diff review, are the guard.
- **Neutral:** the saving is six of one batch's fourteen repoints. The 66 insert-only entries and the 315 multi-line ones are always refused.

## Out of Scope

- An entry whose `from` spans lines, 315 of 1,453 at a11f334 (deferred: docs/BACKLOG.md §301 — no replayed case was multi-line, so there is no measurement to design against yet)
- An entry whose edit only inserts, 66 at a11f334 (deferred: docs/BACKLOG.md §301 — with no removed text there is nothing to find on the new line; an anchor on the surrounding text is a different rule)
- Worktree-isolated campaigns, so the tree can be edited while one runs (deferred: docs/BACKLOG.md §301)
- Test-impact selection beyond `--changed` (deferred: docs/BACKLOG.md §301)
- Choosing a new mutant for a rewritten line (permanent: boundary: that is a judgement about the new code, and this record refuses it by design)
- An entry matching more than once (permanent: boundary: which occurrence was meant is a human decision)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A proposal lands on a similar line of a different mechanism | Low with condition 5 (0 of the 83 measured siblings pass it); Med without | Med | conditions 3-5; the output shows the old and new line; `--write` is explicit and measured; the diff is reviewed |
| `--write` corrupts the catalogue | Low | High | T2 asserts every untouched byte identical; only `from`/`to` of proposed entries change; git holds the prior version |
| A scratch `--root` run reaches this checkout's lock or journal and restores a live campaign's file | Med before this record | High | `campaignPaths(root)` derives all four from one root; its test and mutant pin that no path escapes the root |
| The measurement runs over sources being edited | Med | Med | the dirt check runs before the write, and `--force` is required, as for any campaign over uncommitted sources |

## Rollback

None — repository tooling only; revert the commit. A catalogue rewritten by `--write` is reverted with git like any other edit.

## Follow-ups

- [ ] After the next refactor batch, count stale entries against `--repoint` proposals and refusals, to decide whether multi-line and insert-only entries earn their own rule.
