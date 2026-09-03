# ADR-026: Make the front door a product page, and put the proof one click away

**Status:** Accepted
**Date:** 2026-09-03
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-008-the-plugin-is-not-the-repository.md, docs/BACKLOG.md
**Governs:** `README.md`, `docs/ONBOARDING.md`, `docs/TUTORIALS.md`
**Enforced-by:** `tests/package.test.mjs::the README names every skill and gate this plugin ships`
**Invalidates:** none — checked. ADR-008 owns what ships versus what stays in the repository, and this record does not move either boundary: `README.md` and `docs/` remain repository-only, so nothing here changes the plugin download.
**Served-path change:** Someone who has never seen this project can install it and watch it catch a real defect inside ten minutes, without reading the design rationale first.

## Context

Two pieces of reader feedback, three weeks apart, said the same thing from
different directions.

A non-technical reader said the page was too technical to tell what the thing is
for. That was partly addressed by rewriting the opening in plain language. It was
not enough, and the second report says why: **a reader who is sold still has
nowhere to go.** The install command sat at line 82, behind four sections of
argument, and there was no walkthrough at all — no "run this, see this". The
first thing a convinced reader met was the requirements list.

**The tension this record has to resolve, and it is real.** This project's own
README says, in as many words, that a page listing only benefits is the tone not
to trust. "Make it sell like a product" reads as an instruction to become exactly
that. Resolved by deciding what selling means here: **showing the thing working on
a real repository, with output nobody typed by hand**, rather than adjectives. The
measured costs stay on the page — including the two ablation cases where the
plugin bought nothing — because a reader who finds the losses themselves later
trusts the wins less.

## Existing Primitives Audit

- **`README.md`.** Reuse and restructure. It already carried the plain-language
  opening, the measured numbers and the cost section; what it lacked was ordering
  and a next step.
- **`plugin/evals/README.md`** documents the eval harness for contributors.
  **Left alone** — a contributor document and a user document have different
  readers, and merging them is how both become useless.
- **`scripts/eval-compare.mjs` / `scripts/corpus-metrics.mjs`.** Reuse: the
  onboarding and README both point at these rather than restating their output,
  so a number in prose cannot drift from the command that produces it.
- Nothing exists for a first-run walkthrough. That is the gap.

## Decision

**The README opens with install and a visible result, and the argument follows.**
`## Start here` is the second section: two lines to install, one command to run,
and an example of the evidence line the tool writes, annotated field by field.

**Two new documents, both repository-only.**

- `docs/TUTORIALS.md` — two walkthroughs on a throwaway repository. The second
  one deliberately ends in a **failure**: a test is weakened until it cannot fail,
  the suite stays green, and the mutation check refuses to call it evidence. That
  is the product demonstrated rather than described.
- `docs/ONBOARDING.md` — hour one, week one, and an explicit list of **what to
  leave alone**, because adopting the whole lifecycle on day one is the way people
  bounce off it.

**Every output in the tutorials is copied from a real run.** No illustrative
transcripts. A tutorial whose output was written by hand is a fabricated
verification log with a different file extension, and this corpus does not get to
make that trade in its own documentation.

**Pre-registered criterion, and it can fail:** if a reader following
`TUTORIALS.md` on a clean machine cannot reproduce the two outcomes — `mutant
killed`, then `NOT evidence` — the walkthrough is wrong and comes out. It is
pinned to observable behaviour, not to a version.

## Alternatives Considered

- **Leave the README as one long page.** Rejected: the second report is evidence
  that the ordering, not the content, is what loses readers.
- **A separate marketing site.** Rejected: it would drift from the repository
  immediately, and this project's whole claim is that documentation which cannot
  be re-derived rots. `README.md` sits beside the code and the tests read it.
- **Write the tutorials with illustrative output.** Rejected on the project's own
  rule — see the Decision. It would also have been easier and shorter, which is
  what makes it worth naming.
- **Drop the cost and loss figures to make the page sell harder.** Rejected: the
  page argues against trusting benefits-only writing two screens later, and a
  document that contradicts itself teaches the reader to discount all of it.

## Component / Boundary Impact

None. Documentation only, all of it above `plugin/`, so ADR-008's shipping
boundary is untouched and the marketplace download does not change.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `README.md` | `## Start here` becomes the second section; install de-duplicated | repository | a new reader |
| `docs/TUTORIALS.md` | new — two runnable walkthroughs | repository | a new reader |
| `docs/ONBOARDING.md` | new — first hour, first week, what to skip | repository | a new adopter |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| the captured tutorial output | T1 | none | No |

## Implementation

See `tasks/README.md`. One task.

## Consequences

- **Positive:** a reader can install and see a real defect caught in ten minutes;
  the failure case is demonstrated rather than promised; the numbers stay one
  click away instead of being replaced by adjectives.
- **Negative:** three documents can now disagree with each other, and the tutorial
  output can go stale when a tool's messages change. The pre-registered criterion
  and the README test are what catch that.
- **Neutral:** nothing about the shipped plugin changes.

## Out of Scope

- Any change to what the plugin ships (permanent: boundary: ADR-008 owns that line and this record is documentation above it)
- A video or hosted demo (permanent: boundary: it could not be re-derived from this repository, which is the property that keeps the rest of this documentation honest)
- Translating the front page (deferred: docs/BACKLOG.md §112)
- Automated checking that the tutorial transcripts still match live tool output (deferred: docs/BACKLOG.md §112)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Tutorial output goes stale when a tool's wording changes | High | Med | The pre-registered criterion pins the two OUTCOMES rather than the exact prose, and §112 carries the automated check |
| The page reads as marketing and loses the trust it argues for | Med | High | The costs, the turn ratio and both zero-delta cases stay on the page; the tutorial's second half is a failure |
| Three documents drift apart | Med | Med | Onboarding and README point at `eval-compare` and `corpus-metrics` rather than restating numbers |

## Rollback

Delete the two documents and move `## Start here` back down. Nothing depends on
them, no persistent state, no migration.

## Follow-ups

- [ ] After the next release, re-run `TUTORIALS.md` end to end on a clean checkout and confirm both outcomes still appear — the pre-registered criterion.
