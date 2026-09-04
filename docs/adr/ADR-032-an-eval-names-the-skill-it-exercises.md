# ADR-032: Make an eval name the skill it exercises

**Status:** Accepted
**Date:** 2026-09-04
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-003-a-gate-asserts-behaviour-not-shape.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-027-the-harness-ships-an-operating-surface.md, docs/BACKLOG.md, plugin/evals/README.md
**Governs:** plugin/evals/**
**Enforced-by:** `tests/evals.test.mjs::every eval case declares the skill it exercises, or declares that it exercises none`
**Invalidates:** none — checked. ADR-003 says a gate asserts behaviour rather than shape and is the reason the graders here are deterministic; this decides what a case DECLARES about itself and changes no grader. ADR-027 governs the `operating` skill, one of the skills this record's coverage report names as having no case.
**Served-path change:** "Which skills does the eval suite actually exercise?" is answered by a command instead of by counting by hand, and the answer distinguishes a skill with no case from a case nobody has attributed.

## Context

**BACKLOG §105, filed 2026-09-02**, reported that nine of thirteen shipped skills had no eval, with a
table of counts. **That table is wrong, and the interesting part is that nobody could tell.**

**Measured 2026-09-04**, grepping each case directory for the name of any shipped skill:

    for d in plugin/evals/*/; do … grep -rhoE '\b(adr-execute|adr-retire|…|work)\b' "$d" | sort -u; done

| case | skills its text names |
|---|---|
| `a-vacuous-test-is-not-a-review` | `mutation-audit`, `review` |
| `adr-write-consults-the-corpus` | `adr-write`, `work` |
| `complexity-instruction-given` / `-omitted` | `adr-write`, `work` |
| `done-needs-tool-written-evidence` | **none** |
| `fence-warning-given` / `-omitted` | `work` |
| `gates-advise-never-block` | `work` |

§105's table says `review` has **0** cases and `execution` has **1**. This grep says `review` has one
and `execution` none. `done-needs-tool-written-evidence` is plainly an `adr-execute` case — it asks
the model to mark a task done without tool-written evidence — and names no skill anywhere.

**Both counts are guesses, because nothing in the corpus declares the mapping.** §105 counted by some
method it did not record; this grep counts textual mentions, which credits a skill for being
name-dropped in a comment and misses a case that never says its subject out loud. Two methods, two
answers, no authority — which is this project's own defect class applied to its eval suite: a claim
about coverage that nothing computes.

**The routing claim is the sharp end.** `work` routes to `review` for a whole risk tier. The Trigger
grader every case uses is `type: tool_used, tool: Skill` — it asserts that A skill fired, not that the
INTENDED one did. So a router that sends the model to the wrong skill scores identically to one that
routes correctly, and the routing table stays prose.

**`tags:` is available and is not a new mechanism.** `claude plugin eval --tag <tag>` filters cases,
so a tag is both a declaration and a selector. Verified 2026-09-04 against the runner: a case tagged
`skill-review` was selected by `--tag skill-review` and rejected by `--tag zzz-nonexistent`, so the
key is honoured rather than merely tolerated.

## Existing Primitives Audit

- **`tags:` in a case's frontmatter** — runner-supported, verified above. No new file, no new parser.
- **`plugin/evals/README.md`** already states the Skill-Use facets (Trigger / Compliance / Boundary)
  and the deterministic-grader rule. This record adds attribution, not a scoring policy.
- **`tests/package.test.mjs`** already reads the shipped tree and is where shipped-set claims live; a
  coverage report over skills belongs beside it rather than inside it, because it is about `evals/`.
- **`tool_used: Skill`** is the only Trigger grader the suite has. Whether the runner can assert WHICH
  skill fired was not determined here and is not decided by this record.

## Decision

**Every eval case declares, in its `tags:`, which shipped skill it exercises — and a case that
exercises none says so.**

The spelling is `skill-<name>` for a subject, and `skill-unattributed` for a case whose subject its
author cannot honestly name. A repository test reads those tags, compares them against the skills the
plugin actually ships, and REPORTS three counts: skills with at least one case, skills with none, and
cases declaring no subject.

**`skill-unattributed` is a first-class answer, not a gap to be filled.** Four of the eight existing
cases are A/B pairs — `complexity-instruction-given` / `-omitted`, `fence-warning-given` / `-omitted`
— which measure whether an INSTRUCTION changes behaviour, not whether a skill fires. Forcing a subject
onto them would invent an attribution, which is precisely the fabricated observation ADR-005 forbids.
A count of unattributed cases is information; a wrong mapping is not.

**The report advises and never blocks.** A threshold on "skills with a case" would be met by writing
one thin case per skill, and the gate would then report that as coverage — the ADR-005 failure this
project keeps naming, and the reason §105's own numbers were not trustworthy. What the test DOES fail
on is a case with no `skill-*` tag at all, because that is the state where the count becomes a guess
again.

**What this record does NOT decide:** whether a Trigger grader can assert that the NAMED skill fired
rather than any skill. That is the check the routing claim actually needs, it depends on a grader
capability nobody here has established, and deciding it from ignorance would put a second unverified
claim on top of the first. It is deferred with the measurement that would settle it.

**Pre-registered failure, with data that could produce it.** If, after ten more cases, `skill-unattributed`
is the majority tag, then the vocabulary is being used to avoid the question rather than to answer it
honestly, and the tag should be removed so the suite is forced to say nothing rather than to say
"unknown" fluently. `grep -rc 'skill-unattributed' plugin/evals/*/prompt.md` against the case count is
the check. Valid for a suite whose cases are mostly single-skill; do not carry it to a suite that is
mostly ablation pairs, where unattributed is the correct majority.

## Alternatives Considered

- **Infer the subject from the case's text, as the Context grep does.** REJECTED: it credits a
  name-drop in a comment and misses `done-needs-tool-written-evidence`, whose subject is never named.
  It is also what produced two disagreeing tables.
- **A separate `SUBJECT` file, or a YAML comment, per case.** REJECTED: `tags:` already exists, is
  honoured by the runner, and doubles as the selector that runs one skill's cases.
- **Require every shipped skill to have a case, and fail the build otherwise.** REJECTED: it selects
  for one thin case per skill and then reports the result as coverage. The count is published instead,
  which is what makes it argue for itself.
- **Fix §105's table and move on.** REJECTED: the table was never the defect. Two people counting by
  hand got two answers, and a third would get a third.

## Component / Boundary Impact

`plugin/evals/*/prompt.md` gain a `tags:` line. One new repository test. No grader, prompt or score
changes, so no case's measured Δ moves.

## Wiring & Contract Changes

`tags:` becomes part of a case's contract with the suite. It is additive: a case without one is what
the new test reports.

## Inter-task Contracts

None — one task.

## Implementation

T1 tags the eight existing cases, adds the coverage test, and records the measured coverage in the
backlog so the number has a date and a method attached to it.

## Consequences

- **Positive:** "which skills does the suite exercise" becomes a command, and its answer distinguishes
  "no case" from "nobody said".
- **Positive:** `--tag skill-review` runs one skill's cases, which is the granularity an author of that
  skill wants.
- **Negative:** the honest coverage number is WORSE than §105's — three attributed subjects across
  fourteen shipped skills, not four across thirteen. That is the point of measuring it.
- **Neutral:** no case's score or Δ changes.

## Out of Scope

- Writing the missing cases for the eleven skills with none (deferred: docs/BACKLOG.md §105)
- A Trigger grader that asserts WHICH skill fired (deferred: docs/BACKLOG.md §105 — it needs a runner capability this record did not establish)
- Any change to how cases are scored, or to the ablation default (permanent: boundary: `plugin/evals/README.md` owns the scoring doctrine and this record only adds attribution)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `skill-unattributed` becomes the lazy default | Med | High — the count would read as coverage while meaning nothing | The pre-registered failure names the grep and the threshold, and removes the tag if it fires |
| A tag names a skill that no longer ships | Med | Med — a pointer to nothing, the ADR-011 class | The test resolves every `skill-*` tag against the shipped `plugin/skills/` directory and fails on one that matches nothing |
| The runner stops honouring `tags:` | Low | Low | The test reads the frontmatter itself; the runner's filter is a convenience, not the mechanism |

## Rollback

Remove the `tags:` lines and delete `tests/evals.test.mjs`. No persistent state and no consumer — the
tags are inert to scoring.

## Follow-ups

- [ ] After ten more cases, run the pre-registered grep and remove the `skill-unattributed` vocabulary if it has become the majority answer.
- [ ] Establish whether a grader can assert WHICH skill fired; until then the routing claim in `work` remains untested and BACKLOG §105 stays open for it.
