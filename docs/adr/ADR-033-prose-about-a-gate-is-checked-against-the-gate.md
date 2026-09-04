# ADR-033: Check the prose about a gate against the gate's actual flags

**Status:** Accepted
**Date:** 2026-09-04
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-011-a-pointer-resolves-or-it-is-reported.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-031-a-gate-answers-for-itself.md, docs/BACKLOG.md, scripts/backlog-claim-sweep.mjs
**Governs:** scripts/flag-claim-sweep.mjs, tests/flag-claim-sweep.test.mjs
**Enforced-by:** `flag-sweep: an unchanged flag surface reports nothing`, `flag-sweep: a flag removed from the surface is still a change`, `flag-sweep: the backlog is history, not prose this project serves`, `flag-sweep: a gate name is matched whole, not as a substring`
**Invalidates:** none — checked. ADR-011 resolves a record's declared paths against `git ls-files`; this asks a question about content that ADR-011 never asked, and neither check subsumes the other.
**Served-path change:** None — this decision adds a repository-only sweep. `scripts/` does not ship (ADR-008), so no adopter surface changes.

## Context

**The corpus can say a pointer names nothing. It cannot say a claim went false.**

A record's `Governs:` header names CODE paths. ADR-011 made those paths resolve against
`git ls-files` and advise when one matches nothing, which closes the case where a record points at a
file that moved or was deleted. It does not touch the opposite case: the path resolves perfectly, the
decision executes, the gate's behaviour changes — and the prose that DESCRIBES that gate goes on
asserting the behaviour it used to have. Nothing in the corpus points at that prose, so nothing can
notice.

**The instance, 2026-09-04.** ADR-031 gave all eleven gates a `--version` flag.
`plugin/skills/operating/SKILL.md` — a shipped skill, served to every adopter — went on telling
readers the gates could not answer what version they were. It was found by a human reading the file
during an unrelated documentation sweep, not by any check. It shipped in between.

It was not alone. The same sweep found `docs/mcp.md` saying "Five tools" when there were seven,
`adr-next` documented with three states after it had grown a fourth, and `plugin/evals/README.md`
missing the tag convention ADR-032 had introduced. Four stale claims, all in served prose, all
downstream of accepted decisions, none reachable from the corpus.

## Existing Primitives Audit

- **`adr-lint` / ADR-011's resolution check** — resolves `Governs:`, `Cross-references:` and
  `Invalidates:` against the tree. Answers "does this path exist", never "is this sentence still
  true". Both checks were green throughout the four instances above.
- **`scripts/backlog-claim-sweep.mjs`** — the closest existing thing, and the model for this one. It
  asks whether a commit that CLAIMS a backlog section actually edited it. Keyed on commit messages
  and `docs/BACKLOG.md`; it cannot see served prose, and its own header carries the lesson that
  governed this design: *"A sweep's real failure mode is not missing an instance — it is reporting
  enough noise that people stop reading it."*
- **`scripts/orphan-sweep.mjs`** — definitions nothing reaches. A different question entirely.
- **`adr-debt`** — deferred items and open follow-ups, from the records. Sees no prose outside them.
- **An authored header** (`Documents:` beside `Governs:`) — considered and rejected below, on the
  measurement rather than on taste.

Nothing existing covers it.

## Decision

**Ship a repository-only sweep that asks one question: a commit changed a gate's flag surface — does
the served prose that names that gate still say something true about that flag?**

Two filters decide what it reports, and both were measured rather than chosen:

1. **A flag change is a change to the SET of flags either side of the commit**, not a flag appearing
   on a line the commit touched. A reflowed help block moves lines without changing what a user can
   type.
2. **The prose must also name a gate.** Otherwise a skill that mentions `--version` about some other
   binary reads as a claim about ours.

The corpus it reads is served prose only: shipped `SKILL.md` files, the READMEs, and `docs/*.md`.
`docs/adr/` and `docs/BACKLOG.md` are excluded on purpose — both are history. An ADR describing the
behaviour as it stood when the decision was taken is CORRECT, and a backlog entry recording a defect
is supposed to describe the defect. Rewriting either to match today's code would destroy the record.

It reports and never blocks (CLAUDE.md §3), and it distinguishes "nothing to report" from "could not
look" (ADR-005): a commit whose parent has no gates or no prose is reported `COULD NOT LOOK`, never
as clean.

**Measured over the 109 commits touching `plugin/bin/`, five keys:**

| key | findings | commits firing |
|---|---|---|
| gate name, all docs | 295 | 4 |
| gate name, served prose only | 48 | 4 |
| touched-line flags, served prose | 76 | 21 |
| touched-line flags + doc names a gate | 76 | 21 |
| **flag SET difference + doc names a gate** | **1** | **1** |

The one finding is `plugin/skills/operating/SKILL.md` at `d0f6c24` — the instance. Zero false
positives across the whole history.

## Alternatives Considered

- **A `Documents:` header authored beside `Governs:`, naming the prose a record's decision makes
  claims in.** Rejected on the measurement, not on principle: it is the shape that generalises
  furthest, and it is the shape that rots. It asks an author to predict, at decision time, every
  document that will later describe the thing — and three of the four instances above were in files
  the deciding record had no reason to name. A header nobody fills in correctly produces a check that
  is green because it was asked nothing, which is the failure mode this project exists to avoid.
  Worth revisiting if the derived sweep's precision degrades.
- **Key on the gate NAME rather than the flag.** Fires on all four commits instead of two, at 48
  findings against 1. Better recall, and unreadable — 21 candidates for a single commit. Rejected
  under `backlog-claim-sweep`'s own lesson.
- **Read the `+`/`-` lines of the diff instead of comparing flag sets.** Simpler, and it is what the
  first implementation did: 76 findings across 21 commits, because a commit that reflows a help block
  reports every flag in it. Rejected, and the case is now a test.
- **Drop the gate-name filter to catch more.** It costs two false positives (`codex-advise` and
  `codex-review`, which name `--version` about the `codex` binary). Kept, and checked against the
  true positive BEFORE adopting it — `operating/SKILL.md` names `qh-root`, so the filter keeps the
  one instance it exists to catch. A filter that killed it would have been the finding instead.
- **Make it blocking.** Refused by CLAUDE.md §3, and rightly: the tool reports candidates to re-read,
  and a candidate is not a defect.

## Consequences

The flag class is now detectable from history rather than by someone happening to read the file. The
sweep is named in CLAUDE.md §2 alongside its two siblings, which were previously referenced by
nothing at all.

**The gap is not closed, and the record says so where the tool is read.** This catches flags. A
stale COUNT (`docs/mcp.md`), a stale VOCABULARY (`adr-next`'s states) and a missing CONVENTION
(`plugin/evals/README.md`) have nothing to key on and are still found only by reading. The script's
own header states this, because a sweep that implied it covered the class would be precisely the
kind of overclaim that motivated it.

Precision is measured on this repository's history and may not hold as the corpus grows. The
`Documents:` header stays available if it degrades.

## Wiring & Contract Changes

None. `scripts/` does not ship (ADR-008), so no adopter surface changes and no gate behaviour
changes. `tests/*.test.mjs` is globbed by `scripts/selftest.sh`, so the new test file runs without a
wiring change.

## Out of Scope

- The COUNT, VOCABULARY and CONVENTION classes (deferred: no key exists for them; they are named in
  the script header and in Consequences so a reader is not misled about coverage).
- A `Documents:` header on records (deferred: rejected above on measurement, revisit if precision
  degrades).
- Running the sweep in CI (deferred: its two siblings are not run there either, and a check whose
  output is a list of places to look wants a human reading it).
