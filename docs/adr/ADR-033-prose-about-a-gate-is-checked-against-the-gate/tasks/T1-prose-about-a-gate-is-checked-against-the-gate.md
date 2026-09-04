# Task ADR-033-T1: Sweep for prose that describes a gate flag the gate no longer has

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (one script, one test file, four catalogue entries, one CLAUDE.md section)
**Owner:** unassigned
**Produces:** `node scripts/flag-claim-sweep.mjs [<range>|--all]` — a `RE-READ` line per (commit, served-prose file) whose flag surface changed and whose prose named that flag before the commit; `COULD NOT LOOK` where the parent has no gates or no prose; exit 0 always
**Consumes:** `git log` / `git ls-tree` / `git show` over `plugin/bin/` and the served-prose corpus
**Data dependency:** hermetic — reads git objects only, writes nothing, spawns no gate
**Proof map:** v1
**Rests-on:** `flag-sweep: an unchanged flag surface reports nothing`, `flag-sweep: a flag removed from the surface is still a change`, `flag-sweep: the backlog is history, not prose this project serves`, `flag-sweep: a gate name is matched whole, not as a substring`

## Goal

A commit that changes what a user can type at a gate produces a list of the served prose that made a
claim about that flag — small enough that somebody reads it.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/flag-claim-sweep.mjs` | create | the sweep |
| `tests/flag-claim-sweep.test.mjs` | create | the two filters, each shown capable of both answers |
| `tests/mutations.json` | edit | four catalogue entries, or the checks are unproven (ADR-003) |
| `CLAUDE.md` | edit | §2 named no sweep at all, so none of the three was discoverable |

## Ordered Steps

1. [S1] Establish the failing tests. **Recorded honestly: they were NOT written first.** `scripts/flag-claim-sweep.mjs` existed before `tests/flag-claim-sweep.test.mjs` did — this project's own ordering, broken by the author, and rewording this step to read as though it had not is the one repair that is not available. Red was observed AFTER the fact and through the mechanism rather than by a stash: dropping the `!b.has(f)` guard from `flagsChanged` — catalogue entry `flag-sweep: an unchanged flag surface reports nothing` — makes every flag read as changed and takes three of the seven tests red. That is a weaker claim than reverting to the touched-line reading the design replaced, which no single catalogue entry expresses because it is a different function rather than a changed line; what covers THAT is the `a flag whose line moved` test, written for it. A test written against existing code can be shaped by what that code already does, and no amount of after-the-fact red detects that; the mutations at S5 are what actually bind these assertions to the mechanism. [proof: acceptance]
2. [S2] Measure before designing, five keys over the 109 commits touching `plugin/bin/`, each narrowing the previous: gate name over all docs (295 findings), gate name over served prose (48), touched-line flags (76 across 21 commits), touched-line flags plus the gate-name filter (76), and the flag SET difference plus the gate-name filter (1). The rejected keys are recorded in the record's Alternatives with their numbers, because the numbers are the argument and a later reader cannot re-derive them cheaply. [proof: acceptance]
3. [S3] Check the gate-name filter against the TRUE positive before adopting it, not after. It drops `codex-advise` and `codex-review`, which name `--version` about the `codex` binary; it keeps `plugin/skills/operating/SKILL.md`, which names `qh-root`. Had it killed the one real instance, that would have been the finding rather than the filter. [proof: acceptance]
4. [S4] Write the script: set-difference key, served-prose corpus with `docs/adr/` and `docs/BACKLOG.md` excluded as history, gate list derived from the tree at each commit rather than hardcoded, `COULD NOT LOOK` kept apart from clean (ADR-005), exit 0 always (CLAUDE.md §3). [proof: acceptance]
5. [S5] Add four catalogue mutations and confirm all four come back RED. [proof: mutation]
6. [S6] Correct the script's own header once the key changed. Its first version recorded a table measured against a different flag extractor; leaving it would have made the file an instance of the class it exists to detect. [proof: acceptance]

## Acceptance

```bash
set -o pipefail
node --test tests/flag-claim-sweep.test.mjs 2>&1 | tee /tmp/adr033-t1.out \
  && ! grep -qE "no tests to run|^not ok|^# fail [1-9]" /tmp/adr033-t1.out \
  && node scripts/flag-claim-sweep.mjs --all > /dev/null \
  && python3 plugin/bin/adr-lint docs/adr/ADR-011-a-pointer-resolves-or-it-is-reported.md
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a flag added to the surface is reported, and an unchanged surface is not` | `tests/flag-claim-sweep.test.mjs` | both answers in one test, so a `flagsChanged` returning `[]` cannot pass at full coverage | — | S3, S4 |
| `a flag removed from the surface is reported too` | `tests/flag-claim-sweep.test.mjs` | removal, the more dangerous direction: prose telling a reader to type what the gate now refuses | — | S3, S4 |
| `a flag whose line moved is not a flag whose surface changed` | `tests/flag-claim-sweep.test.mjs` | THE mechanism — the reflow case that separates 1 finding from 76 | — | S1, S3, S4 |
| `a flag is matched whole, so a longer flag is not a claim about it` | `tests/flag-claim-sweep.test.mjs` | `--version` does not match `--versions` or `--no-version` | — | S3 |
| `a gate name is matched whole, so prose about another tool does not qualify` | `tests/flag-claim-sweep.test.mjs` | the filter that drops the two codex false positives | — | S2, S3 |
| `history is not served prose, and skills are` | `tests/flag-claim-sweep.test.mjs` | ADRs and the backlog are excluded on purpose; a skill is not | — | S3 |
| `flagsIn reads the long flags a text declares` | `tests/flag-claim-sweep.test.mjs` | the extractor both halves of the set difference rest on | — | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `node scripts/flag-claim-sweep.mjs --all` runs and reports |
| 2 — something selects it | the Acceptance fence runs it; the four catalogue entries mutate it |
| 3 — the caller can discover it | CLAUDE.md §2 names it beside its two siblings, which nothing referenced before this task |
| 4 — it is used | one run found the real instance in this repository's history. Whether a human runs it before a future release is not observable from here, and a proxy would read like evidence |

## Invariants

- The sweep never blocks: exit 0 whatever it finds (CLAUDE.md §3).
- A commit whose parent has no gates or no served prose is `COULD NOT LOOK`, never clean (ADR-005).
- `docs/adr/` and `docs/BACKLOG.md` are never treated as prose to correct — both are history, and a record describing the behaviour as it stood when the decision was taken is right.
- The gate list is derived from the tree at each commit, so a twelfth gate is covered without editing this script.
- The script's header states the classes it does NOT catch. A sweep that reads as covering the class would be the defect it was written for.

## Risks

- **Precision is measured on one repository's history.** 1 finding across 109 commits is this
  corpus, not a general claim. A project whose skills quote many flags would see more, and the
  gate-name filter would carry less of the load. The record keeps the rejected `Documents:` header
  as the alternative if that happens.
- **The set difference cannot see a flag whose MEANING changed while its spelling did not.** A flag
  that keeps its name and changes what it does produces no finding at all. That is a real hole in
  the flag class itself, not only in the three classes named out of scope, and nothing here detects
  it.
- **The served-prose corpus is a path-shape rule.** A new documentation directory is outside it
  until someone edits `isServedProse`, and the failure is silent — the sweep reports clean rather
  than reporting that it did not look. The test pins the current shape; it cannot pin a directory
  nobody has created yet.

## Stop Condition

Abandon if the sweep's precision on this repository drops below roughly one finding per firing
commit — at that point it is the gate-name key with extra steps, and the honest move is to withdraw
it rather than to keep tuning filters until the numbers look right. Re-measure with the command in
S2 before concluding either way; a count remembered rather than run is what this record exists to
prevent.

## Out of Scope

- The COUNT, VOCABULARY and CONVENTION drift classes (deferred: no key exists for them — named in
  the record's Out of Scope and in the script's own header).
- A `Documents:` header on records (deferred: rejected in the record's Alternatives on measurement).
- Running the sweep in CI (deferred: its two siblings are not, and a list of places to look wants a
  human reading it).

## Verification Log
- 2026-09-04 · 0a006a4 · exit 0 · `set -o pipefail …` · acceptance-sha256:50e30ba5d8fb228113d18925eca3a980e90685fd16c9be6730f5c2c49e75a817 · ms:37455 · steps:S1,S2,S3,S4,S6
