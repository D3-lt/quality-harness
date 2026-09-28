# ADR-071: A rewritten line is re-anchored on the text around its edit

**Status:** Accepted
**Date:** 2026-09-28
**Owner:** Zy
**Spec:** None — no spec stage; BACKLOG §301 Stage 4 (mutation tooling), ADR-069's follow-up
**Cross-references:** docs/adr/ADR-069-a-stale-mutant-is-repointed-by-its-own-edit.md, docs/BACKLOG.md
**Governs:** scripts/mutate.mjs
**Enforced-by:** `tests/mutate-runner.test.mjs::reanchorEntry reproduces the hand repoints repointEntry refused, and proposes no line the hand did not choose`
**Invalidates:** none — checked (ADR-069's `repointEntry`, its conditions, and the five locks its tasks hold over three tests are unchanged; the new rule answers only under a new flag, for entries ADR-069 refuses at its condition 2 or 3)
**Served-path change:** None — this ADR changes only repository tooling (`scripts/mutate.mjs`); nothing in `plugin/` changes.

## Context

ADR-069's follow-up asked for a count after the next refactor batch: stale entries against `--repoint` proposals and refusals. The 3.1.1 batch (e0ef6d4..aa3da2b) is that batch.

**Measured 2026-09-28** by replaying every entry whose `from` or `to` was rewritten by hand in `tests/mutations.json` between e0ef6d4 and 2b036de, and between 2b036de and aa3da2b. Each entry was replayed against its source at the later commit, with the lines that commit added (`git diff -U0`):
- 14 entries were rewritten by hand, and one more was deleted.
- ADR-069's rule reproduces 4 of the 14 byte for byte.
- It refuses the other 10, every one at condition 2 or 3: the edited text is no longer on the nearest line, or the entry only inserts.

**The candidate below, replayed the same way**, reproduces 3 more of the 14 byte for byte: the dry-run guard, the alias verb line and F3's `called` line. Over ADR-069's own fixture (`tests/fixtures/mutate-repoint/replay.json`, the 3.1.0 batch) it reproduces 2 more of the 12: an ADR-068 T1 guard and the command-substitution line. Across both batches it proposes no line the hand did not choose: 0 differ. It refuses:
- 4 whose anchor is too thin, fewer than 8 significant characters around the edit: the `!` alias (0), a shell option taking a value (4), `+o noexec` (5) and the escaped-quote line (7);
- 6 where no added line holds both anchors, because the text around the edit was rewritten too: the two Perl `qq` lines, the insert-only bin-gate spawn, the ADR-068 T1 linked-worktree guard, the echo piped into a shell, and F6, whose mechanism moved to another file;
- 1 where two added lines fit and the nearest line is neither: the ADR-067 help flag.

**The class**, every stale entry ADR-069 refuses at condition 2 or 3, enumerated with `node scripts/mutate.mjs --repoint` (each refusal names its condition): 0 at 8cc0327, because every entry is current.

**Why a separate flag.** ADR-069 T1 and T2 hold five locks over three tests in `tests/mutate-runner.test.mjs` (`python3 scripts/test-locks.py tests/mutate-runner.test.mjs repoint`). Two of those tests assert `repointEntry`'s refusals and `--repoint`'s output. A rule folded into `repointEntry` would move their verdicts, and a locked test stays byte-identical (CLAUDE.md §2). No locked test asserts the usage text or the set of known flags (the only such assertion, `tests/gate-rules.test.mjs`, matches `unknown option: --filter`).

## Existing Primitives Audit

- `repointEntry(entry, text, added)` (ADR-069). **Reused unchanged**; the new rule runs only where it refuses at condition 2 or 3.
- `editOf(from, to)`, the common prefix and suffix. **Reused**; the new rule takes its prefix P and suffix S, backed off to a word boundary.
- `staleEntries`' nearest line. **Reused** as the tie-break when more than one added line fits P and S.
- `addedLines` and ADR-069's condition 5. **Reused**: only a line the change added is a candidate, which is what kept ADR-069's measured sibling proposals at 0.
- `--repoint --write` and its measurement (ADR-069 T2). **Reused** for writing a re-anchored proposal.

## Decision

`scripts/mutate.mjs --repoint --reanchor [--since <ref>] [--write]` adds a second verdict, `reanchored`, from a new pure `reanchorEntry(entry, text, added)`. It returns `repointEntry`'s verdict unchanged unless that verdict is a refusal at ADR-069's condition 2 or 3. So a multi-line entry, which ADR-069 refuses first at its condition 1, is never re-anchored. For those refusals, and only those, it applies the rules below in this order. Each refusal names its rule by the name given here, never by a number, because the numbers belong to ADR-069:
- **the diff**: `added` is null (the diff since `<ref>` could not be read) → refused.
- **the anchors**: P and S are the longest common prefix and suffix of the entry's `from` and `to`, taken on the shared text. Each is then shortened while it ends (P) or begins (S) inside a word, with a word character on both sides of the cut, as seen in `from`. `alias` and `argv` share an `a` that is not an anchor. P and S never overlap: the prefix is taken first, and the suffix only from what is left. `newMid` is `to` between them: `to.slice(|P|, |to| − |S|)`, never `editOf`'s shorter middle.
- **the anchor floor**: P and S together hold at least 8 non-whitespace characters → otherwise refused. This is caution, not a measurement: without it the replay proposes 7 rows and none of them differs from the hand. It keeps a whole-line replacement from being proposed on the strength of the nearest line alone.
- **one added line**: the candidates are the file's lines whose trimmed text is in `added`, and which contain P, then S, each exactly once, with P ending no later than S begins. An empty P anchors at the start of the line and an empty S at its end. With one candidate, that line is chosen. With several, the line `staleEntries` names as nearest is chosen when it is one of them; otherwise the entry is refused.
- **one in the file**: the chosen line occurs exactly once in the file, counted as a substring as ADR-069 counts `from` → otherwise refused.

The proposal is `from` = the chosen line, and `to` = the chosen line up to the end of P, then `newMid`, then the chosen line from the start of S. Without `--reanchor`, `--repoint`'s output and exit code are exactly ADR-069's.

**What makes it fail.** Two fixtures replay the hand repoints: the 3.1.1 batch's rows, taken once into `tests/fixtures/mutate-repoint/replay-3.1.1.json` and never regenerated, and ADR-069's `replay.json`, read as it is. Over both, `reanchorEntry` must:
- keep `repointEntry`'s verdict on the 10 rows it reproduces;
- re-anchor 6 rows, byte-equal to the hand: the 5 above, and the ADR-067 help-flag row. (Amended at execution, 2026-09-28: in that row's fixture window only one added line holds its anchors, where the whole file has two and the nearest is neither. The tie-break's refusal is proven by the hand-built cases below instead.)
- refuse the other 10;
- propose nothing that differs from the hand.

Replay rows alone leave the rules untested at their edges, so hand-built cases sit beside them, as ADR-069's own test does:
- a sibling line the change did not add;
- a chosen line that occurs twice;
- S before P, and P occurring twice on a line;
- an empty S;
- a null diff;
- an entry refused at ADR-069's condition 4 or 5, which must come back with that refusal unchanged.

A mutant of each rule is RED: the back-off removed, the floor removed, the tie-break removed, the added-line filter dropped, the once-in-the-file check dropped, the order of P and S ignored, P or S allowed twice, and the rule run on any refusal rather than only at conditions 2 and 3.

## Alternatives Considered

- **Fold the rule into `repointEntry`.** Rejected: two tests ADR-069 locks assert its refusals, and moving them needs a relock nobody should take for a new rule that has its own flag.
- **A character-level prefix and suffix.** Rejected on the replay: it loses the alias row, whose prefix ends mid-word.
- **Re-anchor any line that fits P and S, unchanged lines included.** Rejected for the reason ADR-069 dropped it: 83 sibling proposals in its cold review. Condition 5 is kept.
- **Guess a moved mechanism's new file.** Rejected: F6's replacement shares no text with the entry, so a guess would be a mutant of the wrong code. A refusal that says so is the honest answer.
- **Do nothing; hand-repoint.** Rejected on the count: 5 of the 26 hand repoints across both batches are mechanical under this rule and are still rewritten by hand in escaped JSON.

## Component / Boundary Impact

None — internal to `scripts/mutate.mjs`, repository tooling that never ships.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `reanchorEntry(entry, text, added)` export | new pure function | T1 | T2, `tests/mutate-runner.test.mjs` |
| `scripts/mutate.mjs` flags | new `--reanchor`, valid only with `--repoint` | T2 | a person or session after a refactor |
| `tests/fixtures/mutate-repoint/replay-3.1.1.json` | new, taken once from history | T1 | `tests/mutate-runner.test.mjs` |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `reanchorEntry(entry, text, added)` → `{ verdict: 'reanchored', from, to }` or `{ verdict: 'refused', why }` | T1 | T2 | No — new |

## Implementation

See `tasks/README.md`: T1 (the rule and its replay), then T2 (the flag, reading and writing).

## Consequences

- **Positive:** by this measurement, 5 more of every 26 hand repoints become one command whose old and new lines a person reads.
- **Negative:** the tie-break trusts `staleEntries`' nearest line among the added lines that fit. It is measured on two batches, not proven; `--write` stays explicit and its diff reviewed. The anchor floor is caution the replay does not require (see Decision).
- **Neutral:** multi-line entries, and insert-only entries whose surrounding text changed, are still refused. Neither batch had a multi-line case, so there is still nothing to design one against.

## Out of Scope

- An entry whose `from` spans lines (deferred: docs/BACKLOG.md §301 — 0 of the 26 replayed repoints across two batches were multi-line)
- An insert-only entry whose surrounding text also changed (deferred: docs/BACKLOG.md §301 — the one case, the bin-gate spawn, needed a new mutant, not a new anchor)
- Worktree-isolated campaigns and test-impact selection (deferred: docs/BACKLOG.md §301 — measured 2026-09-28: `--changed` picked 22 of 1544 entries and missed the C-5 mutant a new line blinded; a file-level selection is 338 `lifecycle.mjs` entries, the campaign)
- Guessing where a moved mechanism went (permanent: boundary: which code the mutant should now name is a judgement about the new code)
- Changing `repointEntry` or its locked tests (permanent: boundary: ADR-069's verdicts stand; this record adds a flag beside them)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A re-anchored proposal names a similar line of a different mechanism | Low (0 of 5 measured differ from the hand; condition 5 keeps unchanged lines out) | Med | old and new lines printed; `--write` explicit and measured; the diff is reviewed |
| The fixture drifts from what it measured | Low | Med | taken once, commit named, never regenerated, as ADR-069's |
| `--reanchor` changes `--repoint`'s output without it | Low | Med | T2's test compares `--repoint`'s output with and without the flag on a scratch repository |

## Rollback

None — repository tooling only; revert the commit.

## Follow-ups

- [ ] After the next refactor batch, count re-anchored proposals against the hand again, and whether a multi-line case has appeared.
