# Task ADR-123-T8: A model session grills in rounds as the skill says

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** the observed grill
**Consumes:** the grill's round shape and checklist (T1)
**Data dependency:** needs a model session over the eval fixture; the Acceptance is a person's reading
**Proof map:** v1

## Goal

An eval case shows a model session following T1's rules: round one asks exactly the decisions whose prerequisites are settled,
the repository fact is looked up and shown, and the dependent decisions come in round two.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/evals/grill-asks-the-frontier/` | create | four independent decisions, two that depend on them, one decision whose prerequisite stays open, and one fact the fixture repository answers |

## Ordered Steps

1. [S1] Before T1's wording lands, run the eval once on the current skill and record what round one asked (the red: one question per message). [proof: human: the person reads the transcript and records the questions asked]
2. [S2] Run the eval on T1's skill. [proof: human: the person reads the transcript and confirms round one asked exactly the four independent decisions, each with a recommendation and a test sketch, none of the dependent ones and not the repository fact; the fact was shown for veto; round two asked the two dependent ones; the decision with an open prerequisite was never asked]
3. [S3] Record the sign-off. [proof: acceptance]

## Acceptance

Acceptance is human-observed: a person reads both transcripts and signs off naming, per round, the decisions asked, and
confirming each clause of S2.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| — | — | — | — | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the eval case |
| 2 — something selects it | the plugin's eval suite |
| 3 — the caller can discover it | the eval's name |
| 4 — it is used | T6 consumes the sign-off |

## Mutation Log

## Invariants

- The eval fixture holds no project's content (CLAUDE.md §6).

## Risks

- One run is one sample: the sign-off names the model and date, and a later model may differ.

## Stop Condition

Stop T6 if S2 shows round one asking a dependent question or the repository fact: the wording does not carry the rule, and the
owner decides.

## Out of Scope

- A scored eval across models (permanent: boundary: one observed run is the evidence this record asks for).

## Verification Log
