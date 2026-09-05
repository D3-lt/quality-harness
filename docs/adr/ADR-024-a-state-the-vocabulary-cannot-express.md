# ADR-024: Give a name to the two states these gates can see but cannot say

**Status:** Accepted
**Date:** 2026-09-02
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-014-a-task-that-is-honestly-unfinished.md, docs/adr/ADR-017-a-permanent-fact-names-its-citation.md, docs/BACKLOG.md §82, §83
**Governs:** `plugin/bin/adr-debt`, `plugin/bin/adr-lint`
**Enforced-by:** `debt: an unresolvable pointer is not called broken`
**Invalidates:** none — checked. ADR-005 is the rule this applies rather than a record it overturns: "could not run" is not a failure, and this says the same of "could not resolve". ADR-014 gave an honestly-unfinished task the `partial` status and the `Blocked-on:` header; this adds a third kind of waiting it deliberately did not model, and changes neither of its two. ADR-017 owns the `(permanent: …)` disposition grammar and its typed receipts; the disposition added here sits beside those and leaves their parsing untouched.
**Served-path change:** A corpus that is one half of a cross-repo decision stops being permanently red, and a task waiting on a choice nobody has made says so in a header a tool can read instead of in three paragraphs of prose.

## Context

Both states were reported from OTHER repositories running these gates, and neither exists here.
Measured 2026-09-02: `adr-debt docs/adr` reports **0 BROKEN rows** in this corpus, and no task file
contains prose about waiting on an unmade decision. The universe here is empty; the gates ship, and
four peer projects ran them in the last week.

That is the same justification §78 shipped on, and it is worth stating rather than assuming: a check
whose local universe is empty is normally the thing this repository refuses to build (§103, §105).
The difference is that these two are **reported defects in shipped behaviour**, not speculative
gaps — someone ran the gate, could not act on what it said, and wrote down why.

**§82 — `BROKEN` is the wrong word.** `klientams-front-v2-01` ran `adr-debt` over a corpus that is
one half of a two-repo decision. Their pointer names `ADR-007`, which lives in the Laravel backend
repository, so it is **correct and unresolvable from here by construction, permanently**. `adr-debt`
exited 1 and said:

    BROKEN [adr] ADR-001…: ('ADR-007 Follow-ups, backend repo') A CourierInterface/registry …

`BROKEN` means *you wrote a bad pointer*. What happened is *I could not resolve this*. CLAUDE.md §3
forbids exactly this substitution in as many words, and ADR-005 is the record that decided it.

The tell that it is our gap and not their mess: the author wrote the excuse **into the pointer text,
inside the data field** — "adr-debt reports this pointer BROKEN because the destination lives in
another repository, which is correct and expected". A human writing a comment to a linter, inside a
value the linter cannot read, because the vocabulary has no word for the truth.

**§83 — a third kind of waiting.** `wcag-43` reported a task that is neither of ADR-014's two, and
declined to propose a fix: *"I have one instance and you have shipped two ADRs today on the strength
of one instance each; a third on the same evidence would be me pattern-matching my own case into
your format."* Recorded at their assessment. ADR-014 models waiting by ownership —

    Depends-on  — another task IN THIS CORPUS must land. Someone here can go and do it.
    Blocked-on  — something OUTSIDE it must happen. Nobody here can make it happen sooner.

Their task is waiting on **a decision nobody has made**. Every prerequisite exists, no work unblocks
it, no external event resolves it: a human has to choose between two named options. Today that reads
as `partial` with the whole thing carried in Verification Log prose, and an unmade decision does not
announce itself the way a shipped dependency does.

## Existing Primitives Audit

- **`resolve(pointer, md_file, scan_dir)` in `plugin/bin/adr-debt`** returns `(kind, ok)` and
  already distinguishes `empty`, `url`, `adr` and `path`. **Reuse and extend**: the verdict word is
  chosen at one print site from that `kind`, so §82's first half is a change to what an unresolved
  `adr` kind is CALLED, not to how it is detected.
- **The `(permanent: …)` / `(deferred: …)` disposition grammar (ADR-017)**, parsed by one balanced
  scanner at `adr-debt:69`. **Reuse the scanner**, add a sibling keyword; do not write a second
  parser, which is how the two would drift.
- **`Blocked-on:` (ADR-014)**, already an optional task header with its own lint rule and its own
  "say what would resolve it" discipline. **Reshape into a family** rather than copying: the new
  header is the same shape with a different resolver.
- Nothing exists for "the author asserts this target is outside this repository". That assertion is
  the whole of §82's fix and it has no representation today.

## Decision

**Two words, and both are the author's assertion rather than the gate's inference.**

**1. `adr-debt` stops calling an unresolved pointer BROKEN.** A pointer whose leading token is a
record id this corpus does not contain is reported `UNRESOLVED`, and the line names both readings
and the one thing that settles them — a typo, or a target elsewhere that should be declared. The
gate cannot tell those apart, so it claims neither. `empty` and `malformed` keep saying BROKEN:
those the gate CAN determine, because the defect is in the text in front of it.

**Exit code is unchanged at 1 for an undeclared UNRESOLVED**, and this is the deliberate half. The
row still needs action — the author must either fix the typo or declare the target. What changes is
that the action is now nameable.

**2. A new disposition, `(external: <where>: <pointer>)`**, resolving as intentional, counted in its
own column, exit 0. `<where>` is free text naming the repository or system that owns the target, so
the row carries the answer to the reader's only question.

**Why an explicit declaration rather than a heuristic**, which is §82's stated open question — how
does a reader tell a genuine external target from a typo that merely looks external? They cannot, and
neither can the gate: `ADR-007` and `ADR-0O7` are equally unresolvable here. So the design refuses
to guess and makes the state **unrepresentable by accident**: a typo does not produce a declaration.
This is ADR-023's content-key reasoning applied to prose — put the assertion where only a human can
make it, then check it mechanically.

**3. A third task header, `Awaiting-decision:`**, stating the choice so a reader can make it.
`adr-lint` requires it to name at least two options or a question, because "waiting on a decision"
with no decision written down is the prose state this replaces. `adr-debt` counts these separately
from deferred debt, since nobody is notified when a choice continues not to be made.

**Pre-registered criterion, and it can fail:** if after ten records no task uses
`Awaiting-decision:` and no corpus reports an `(external: …)` pointer, both are formalities
generating parser surface and they come out. §83's reporter was right that one instance is thin;
what makes it worth building is that the state has no representation at all, not that it is common.

## Alternatives Considered

- **Report `UNRESOLVED` and stop there, with no declaration.** Rejected: it fixes the word and
  leaves the corpus permanently red, which is the cost §82 actually named — "the first thing a team
  does with a permanently-red gate is stop running it".
- **Infer external-ness from the pointer's shape** (a repo-looking prefix, an org/name path).
  Rejected: it is exactly the guess the gate cannot make, and a heuristic that is right most of the
  time turns a typo into a silently-accepted pointer, which is worse than the red row.
- **Reuse `(permanent: boundary: …)` for external targets.** Rejected: `permanent` means *this
  decision chooses to stop here*. An external target is not a chosen limit — the work exists and is
  owned elsewhere — and `adr-debt` deliberately never sweeps permanent entries, so real cross-repo
  debt would become invisible.
- **A new task STATUS rather than a header for §83.** Rejected on ADR-014's own reasoning: it warns
  that five words with one legend behind them is a taxonomy, and `partial` already describes the
  work accurately. What is missing is *why* it is stalled, which is a header.
- **Do nothing for §83, on the reporter's own advice.** Genuinely considered, and it is why the
  criterion above is pre-registered rather than assumed. Taken because the header costs one lint rule
  and the state is currently unrepresentable, not merely unusual.

## Component / Boundary Impact

None — internal to two gates. `adr-debt` keeps its single responsibility (find debt and say where it
is), `adr-lint` keeps its (judge a record's shape). No module moves, so `docs/architecture.md`'s
Module Map is unchanged.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `adr-debt` output | `UNRESOLVED` replaces `BROKEN` for an unresolvable record id; new `EXTERNAL` column | `plugin/bin/adr-debt` | a maintainer, CI |
| disposition grammar | `(external: <where>: <pointer>)` joins `permanent` / `deferred` | `plugin/bin/adr-debt`, `plugin/bin/adr-lint` | every record author |
| task header | `Awaiting-decision:` joins `Depends-on:` / `Blocked-on:` | `plugin/bin/adr-lint` | every task author |
| `plugin/templates/task-template.md` | documents `Awaiting-decision:` | template | task authors |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| the `UNRESOLVED` verdict word and its kinds | T1 | T2 | No — T2 moves a declared row out of the set T1 renamed |
| `(external: …)` parsed by the shared disposition scanner | T2 | none | No |

## Implementation

See `tasks/README.md`. Three tasks.

## Consequences

- **Positive:** a cross-repo corpus can be green and honest at once; a stalled decision is visible to
  a tool instead of buried in prose; and the gate stops asserting something it cannot observe, which
  is this project's own rule applied to itself.
- **Negative:** two more spellings in a grammar that already has several, and a new header authors
  must learn. The pre-registered criterion above is what removes them if they go unused.
- **Neutral:** exit codes are unchanged except for a row an author has explicitly declared external.

## Out of Scope

- Resolving a pointer INTO another repository — following it, or checking it exists there (permanent: boundary: this gate reads one tree, and a check that reaches across repositories would make its answer depend on what else is cloned beside it, which is the machine-dependence CLAUDE.md §8 forbids)
- A machine-readable form for `<where>` such as a URL or a git remote (deferred: docs/BACKLOG.md §107)
- §85's three unactionable messages, which need no new vocabulary (deferred: docs/BACKLOG.md §85)
- Deciding whether `partial` should also gain meaning from `Awaiting-decision:` (permanent: boundary: ADR-014 owns the status vocabulary and warns against growing it; this record adds a header and deliberately leaves the status alone)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `(external: …)` becomes the way to silence a real typo | Med | High | It is a declaration a human writes, and it prints in its own column on every run rather than disappearing — a wrong one is visible, unlike a permanent entry which is never swept |
| `UNRESOLVED` reads as softer and gets ignored | Low | Med | Exit stays 1 for an undeclared row, so CI fails exactly as it does today |
| Both features go unused, having added parser surface | Med | Low | Pre-registered in the Decision: after ten records with no use, they come out |
| The local universe is empty, so the tests could be vacuous | High | High | Every task asserts on fixtures AND asserts the gate can still say the other thing — the §78 shape, which is the precedent for shipping a check this corpus cannot exercise |

## Rollback

Revert the tasks. The disposition and header are additive: a corpus using neither behaves exactly as
it does today, and a corpus using them degrades to the current messages rather than failing. No
persistent state, no migration.

## Follow-ups

- [x] 2026-09-05, at 35 records: `Awaiting-decision:` appears in 2 records and `(external: …)` 13 times. Neither is zero, so both stay — the criterion did not fire.
