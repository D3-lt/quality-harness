# ADR-017: A permanent fact names its citation

**Status:** Accepted
**Date:** 2026-08-31
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-003-a-gate-asserts-behaviour-not-shape.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-009-a-decision-names-what-enforces-it.md, docs/adr/ADR-011-a-pointer-resolves-or-it-is-reported.md, docs/adr/ADR-013-a-mutation-a-human-performed.md, docs/adr/ADR-014-a-task-that-is-honestly-unfinished.md, docs/adr/ADR-015-a-go-fence-can-reach-its-required-success.md
**Governs:** `plugin/bin/adr-lint`, `plugin/bin/adr-debt`, `plugin/bin/qh-mcp`, `plugin/templates/adr-template.md`, `plugin/skills/adr-write/SKILL.md`, `plugin/skills/adr-write/references/lessons.md`, `tests/gate-regressions.py`, `tests/mutations.json`
**Enforced-by:** `lint: a permanent disposition names whether it is boundary or fact`, `lint: a permanent fact file citation resolves to a repository line`
**Invalidates:** none — checked. ADR-003's behavioral-mutation rule gains two applications; ADR-005's observed-state vocabulary governs unresolved files and unavailable git; ADR-009 resolves the two exact mutation labels above; ADR-011's repository candidate set is reused rather than copied. ADR-013's human mutation lane, ADR-014's task statuses, and ADR-015's Go-fence advice are unchanged.
**Served-path change:** `adr-lint` advises an ADR author when a permanent Out of Scope disposition does not say whether it records a chosen boundary or a factual claim with one typed, checkable citation.

## Context

`(deferred: …)` entries return through `adr-debt`; `(permanent: …)` entries deliberately do not.
That makes a permanent reason the disposition most in need of a visible basis: when its factual
premise is stale or remembered incorrectly, no debt sweep asks anyone to reconsider it.

The current grammar accepts `(permanent)`, `(permanent: by design)`, and every non-empty free-form
reason as the same kind of disposition. It cannot distinguish the sentence “this ADR chooses not to
own deployment” from “tool X cannot perform deployment.” The first is a boundary the record is
entitled to choose. The second is a claim about the world whose usefulness depends on a reader being
able to check where it came from.

Measured 2026-08-31 against this repository's `docs/adr` corpus, a line-oriented scan found 47
single-line Out of Scope bullets containing a permanent disposition. None was authored under a
grammar that required the boundary/fact distinction. A blocking flag-day rule would therefore turn
history into a wall of findings without making any new record clearer. The new contract is advisory
and forward-facing: old spellings stay dispositions, while current guidance and authoring advice
point to the typed forms.

## Existing Primitives Audit

- `scope_bullets()` already returns complete top-level Out of Scope bullets, including wrapped
  dispositions while excluding child bullets. **Reused**; the new check does not parse Markdown a
  second way.
- `disposition_span()`, `closes_the_line()` and `_carries_a_disposition()` already locate a balanced
  terminal disposition, including reasons containing nested parentheses. **Reused and narrowed**
  only after the existing grammar has established that the bullet carries a disposition.
- `tracked_paths()` already asks git for tracked plus untracked, non-ignored repository candidates
  and preserves “could not look” as distinct from an empty set. **Reused** for `file` citations.
- `Findings.advise()` already reports useful authoring work without changing the command's exit
  status. **Reused exclusively**; no new branch appends a blocking finding.
- `tests/gate-regressions.py` already exercises the real disposition parser and all three standalone
  copies of its balanced-parenthesis grammar. **Extended at the CLI boundary** with a temporary git
  corpus rather than a second implementation of the rule.
- `tests/mutations.json` already makes an advisory observable by a behavioral campaign. **Reused**
  with one label for selection/classification and one for repository-line resolution.
- The ADR template, `adr-write` skill, its lessons, `adr-debt` docstring, and the MCP debt-tool
  description currently teach the free-form permanent spelling or describe every permanent item as
  a boundary. **Reshaped together** so creation and discovery surfaces do not prescribe different
  contracts. `adr-debt` behavior remains unchanged: both typed arms are permanent and unswept.

## Audit of the class

**Class:** every quality-harness reader that locates or interprets a permanent Out of Scope
disposition.

The bounded working-tree sweeps are:

```bash
rg -n '^def (disposition_span|scope_bullets|closes_the_line|_carries_a_disposition|check_adr|tracked_paths)\b|^DISPOSITION_TEXT\s*=' plugin/bin/adr-lint
rg -n '^def disposition_span\b' plugin/bin/adr-lint plugin/bin/adr-debt plugin/bin/adr-retire-check
```

The first sweep names the six functions and one grammar constant that form `adr-lint`'s disposition
path. The second names the three standalone balanced-span readers. `adr-debt` acts only on deferred
pointers, and `adr-retire-check` needs to preserve the historical permanent/deferred distinction;
neither decides whether a current permanent reason is well supported. Their span grammar and
behavior therefore stay unchanged. The new semantic advice belongs only to `adr-lint`, while the
shared `DISPOSITION_GRAMMAR` truth table continues to prevent the three span readers from drifting.

## Decision

Every top-level bullet in an ADR's `## Out of Scope` section continues to end in one
machine-readable disposition. `deferred` is unchanged. A newly authored permanent disposition uses
one of two typed forms:

```text
(permanent: boundary: <reason>)
(permanent: fact: <claim>; citation: file `<repository-path>:<line>`)
(permanent: fact: <claim>; citation: version `<name>@<version>`)
(permanent: fact: <claim>; citation: url https://<host>[/<path>])
```

`boundary` records a choice made by this decision. Its trimmed reason is non-empty and it has no
`citation` field. Punctuation, including nested parentheses, remains ordinary reason text; the
reserved `; citation:` suffix is not accepted on a boundary.

The structural keywords `boundary`, `fact`, `citation`, `file`, `version`, and `url` are exact,
lowercase, and case-sensitive. The parser trims the reason or claim payload before deciding whether
it is empty; it does not silently normalize a misspelled or differently cased keyword.

`fact` records a claim about something outside the decision's authority. Its trimmed claim is
non-empty and it ends with exactly one `; citation:` suffix of exactly one typed form:

- A `file` receipt is backticked, repository-relative, and ends in a positive decimal line number.
  Neither its lexical path nor its resolved target may leave the repository, including through a
  symlink. It resolves against `tracked_paths()` so an untracked, non-ignored file added in the same
  change is visible. The named file must be readable and the line number must exist. The linter
  checks neither the words on that line nor whether they entail the claim.
- A `version` receipt is backticked and contains a non-empty name and a non-empty version separated
  by the final `@`; this admits scoped package names. The linter performs no registry lookup and
  makes no semantic-version judgment.
- A `url` receipt is an absolute lowercase-`https` URL with a host and an optional path. The linter
  parses its shape and never fetches it.

Missing, malformed, duplicated, or trailing receipt text draws advice naming the accepted forms. A
file that is absent, leaves the tree, names no existing line, or cannot be read draws distinct
advice describing the observation. When git cannot provide the repository candidate set, the gate
says it could not validate the file receipt; it does not call the file missing.

Legacy `(permanent)` and `(permanent: <reason>)` spellings remain valid dispositions and continue to
satisfy `_carries_a_disposition()`. Each legacy bullet draws advice to classify it as `boundary` or
`fact`; it never becomes deferred and never changes `adr-lint`'s exit status. A malformed typed form
also draws advice rather than becoming “no disposition.” This preserves existing corpora and keeps
the remedy attached to the actual issue.

All new findings use `Findings.advise()`. The pass does not judge whether a factual claim is true,
whether a boundary is wise, whether a version has the claimed behavior, or whether a URL's publisher
is authoritative. Those remain review questions. `adr-debt` and `adr-retire-check` are unchanged and
continue to recognize legacy and typed permanent forms through their existing balanced span grammar.

The template and `adr-write` guidance replace the free-form recommendation with the two typed forms.
The lessons distinguish chosen boundaries from factual impossibilities: a choice explains itself;
a fact names the receipt a later author can re-check.

## Alternatives Considered

- **Require a citation on every permanent disposition.** Rejected because a chosen scope boundary
  is authority exercised by the ADR, not an external fact. Demanding a source would encourage
  decorative or fabricated citations for decisions that need a reason instead.
- **Keep one free-form permanent reason and let review infer its kind.** Rejected because the
  distinction is exactly what disappears after the authoring session, and the permanent lane is the
  one no debt sweep revisits.
- **Make legacy or malformed permanent forms blocking.** Rejected because the measured corpus has
  at least 47 historical single-line instances. A flag-day failure would make a clean existing
  corpus unreachable and teach adopters to disable the gate.
- **Verify package versions and fetch URLs.** Rejected because lint is an offline repository read.
  Network availability and registry policy would make the verdict depend on where and when it ran.
- **Accept an untyped prose citation.** Rejected because a reader cannot mechanically distinguish a
  repository location, a version receipt, and an external URL or apply the right resolution rule.

## Component / Boundary Impact

None — internal to `adr-lint` plus shipped authoring and debt-discovery descriptions. No process
boundary moves, no network call is introduced, and no persistent state is written.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| Out of Scope permanent grammar | adds typed `boundary` and `fact` forms while retaining legacy forms as advisory-compatible dispositions | ADR authors and `adr-write` guidance | `adr-lint`, reviewers, future ADR authors |
| `adr-lint` advisory output | classifies legacy/malformed permanent forms and resolves typed file receipts to repository lines | the new check selected from the existing ADR-level pass | ADR authors, CI, `/quality-harness:adr-write` |
| ADR creation guidance | template, skill, and lessons prescribe the same typed forms | T1 | agents and humans creating ADRs |
| permanent-debt descriptions | `adr-debt` and its MCP tool description say permanent entries are chosen boundaries or cited facts and remain unswept | T1 | CLI and MCP debt-tool users |
| mutation catalogue | two exact labels falsify selection/classification and repository-line resolution | T1 | `scripts/mutate.mjs`, `Enforced-by:` resolution |

## Inter-task Contracts

None — one task.

## Implementation

One task, in `tasks/`. See `tasks/README.md`.

## Consequences

- **Positive:** a permanent factual premise leaves a typed trail that a later reader can locate
  without guessing what kind of source the author meant.
- **Positive:** chosen boundaries no longer masquerade as claims about what a tool or platform can
  do.
- **Positive:** legacy corpora remain lintable and receive a precise migration hint at the bullet
  that needs classification.
- **Negative:** one more authoring grammar exists, and file citations need maintenance when source
  lines move.
- **Negative:** an author can misclassify a factual claim as a boundary. The explicit word makes the
  choice reviewable but cannot make authorship honest.
- **Neutral:** deferred debt, retirement checks, exit codes, and historical disposition meaning do
  not change.

## Out of Scope

- Deciding whether a cited claim is true or whether its source is authoritative. (permanent: boundary: this linter validates receipt syntax and repository reachability, while semantic judgment remains review work.)
- Fetching URLs or querying package registries while linting. (permanent: boundary: offline deterministic authoring advice is the trust boundary of `adr-lint`.)
- Bulk-rewriting historical ADRs into the typed grammar. (permanent: boundary: legacy forms remain valid by design, and decision history is not rewritten merely to silence advisory migration guidance.)
- Changing how `adr-debt` sweeps deferred entries or how `adr-retire-check` preserves dispositions. (permanent: boundary: neither tool decides whether a current permanent factual premise is supported.)
- Automatically editing a permanent disposition or choosing its classification for the author. (permanent: boundary: gates report and advise; they do not mutate decision records.)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Legacy advice is noisy in records with many permanent bullets | Med | Med | report once per affected bullet with the bullet text and exact replacement forms; remain advisory so history stays operable |
| A fact is labeled `boundary` to avoid a citation | Med | High | make the type explicit in templates and review guidance; the gate never claims it can infer authorial intent |
| A valid file citation becomes stale after lines move | High | Med | require the line to resolve on every lint and name the exact path and line in advice; semantic anchoring remains explicitly outside scope |
| Git or a file cannot be read and absence is reported as fact | Low | High | preserve `tracked_paths()`'s unknown state and use “could not validate/read” wording rather than “missing” |
| Version or URL syntax is treated as proof of truth | Med | High | advice and documentation say “receipt,” never “verified”; tests use syntactically valid external receipts without lookup |
| The helper is correct but never selected | Med | High | the first mutation disables the ADR-level selection path and must be killed through the real CLI |

## Rollback

Revert T1. The broad legacy disposition grammar remains intact, so existing and newly typed text
continues to be preserved as permanent prose even when the linter stops interpreting the type. The
change writes no state and performs no migration.

## Follow-ups

None.
