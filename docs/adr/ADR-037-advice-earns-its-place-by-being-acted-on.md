# ADR-037: Advice earns its place by being acted on, and an advisory nobody acts on is removed rather than rationed

**Status:** Accepted
**Date:** 2026-09-07
**Owner:** zy
**Spec:** None — the requirement is the field report in `docs/BACKLOG.md` §152 and the outside result cited under Context
**Cross-references:** ADR-005, ADR-035, `docs/BACKLOG.md`, `docs/research/2026-08-28-verification-is-the-bottleneck.md`
**Governs:** `plugin/bin/adr-lint`
**Enforced-by:** None — Proposed. The measurement is the first task; the rule it justifies is the second.
**Served-path change:** An advisory that fires on every task on every run either becomes actionable or stops being emitted. The reader is no longer trained to filter the gate's output.

## Context

A corpus reported that `adr-lint`'s fence-segments-vs-`Rests-on` advice fires on every task, every
run, unchanged — six identical lines on a six-task record. The reporter began filtering them with
`grep -v`, then told a reviewer *"adr-lint PASS, no advice outstanding"*, **which was false**, and
the reviewer caught it (`docs/BACKLOG.md` §152).

That is the cost, and it is not annoyance. Noise trained a habit; the habit produced a false
statement about a gate's output, in a project whose subject is false statements about work.

**The outside evidence names the threshold and the mechanisms.** *Lessons from Building Static
Analysis Tools at Google* reports that developer trust collapses above roughly a **10% effective
false-positive rate** — analyzers past it are dismissed or disabled — and that Tricorder holds its
own just below 5%. Their mechanisms are not frequency-tuning:

- findings are surfaced **at the moment of the change**, in review, not in a batch;
- the preferred report **carries a suggested fix**, which makes it actionable rather than merely
  correct;
- a **"Not useful" button** exists and its rate is continuously monitored;
- analyses that misbehave are **disabled**, not quieted.

**"Effective false positive" is their term and it is the one that applies here.** A finding is an
effective false positive when the reader does not act on it — whether or not it is factually true.
By that measure an advisory that fires unchanged on every task forever has an effective
false-positive rate approaching 100%, however accurate each line is.

## Decision

**Measure before rationing.** The question §152 poses — emit once per record, or only when the count
changes — is the wrong axis, and both answers have a real failure: advice that vanishes on the second
run is advice a reader never sees if they only read the second run.

**An advisory is judged by whether it is acted on.** `adr-lint` gains a way to tell whether a finding
it emitted was still present the next time it ran over the same record. A finding that survives
unchanged across runs is one nobody acted on.

**An advisory whose findings are never acted on is removed or made actionable — not rationed.** The
two acceptable outcomes for the fence-segments advice are (a) it carries a concrete suggested edit,
or (b) it is deleted. Emitting it less often is neither.

**A reader may always see the full set on demand.** Whatever is suppressed in the default view is
reachable with a flag, because a gate that hides a finding to look quiet is the defect one level up.

## Alternatives Considered

- **Emit once per record instead of once per task.** Rejected as the primary answer: it reduces the
  line count without changing whether anyone acts, so the effective false-positive rate is untouched
  and the reader still learns to skip the block.
- **Emit only when the count changes.** Rejected for the failure §152 already names: a reader who
  only ever sees the second run never sees the finding at all, which converts noise into silence —
  the worse of the two errors for a gate whose whole purpose is to say what it saw.
- **Add a "not useful" affordance, as Tricorder has.** Attractive and ultimately right, but it needs
  somewhere to put the signal and someone to read it. Deferred rather than rejected; the survival
  measurement below is the cheap first half of the same idea.
- **Do nothing.** Rejected on the evidence: the cost is already measured, and it is a false statement
  to a reviewer rather than an irritation.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| advisory survival record | a machine-local note of which advisory identities were emitted for a record, so a later run can tell a repeat from a new finding | `adr-lint` | the survival measurement; a future "not useful" signal |
| `adr-lint` default output | an advisory whose identity survived unchanged is summarised rather than repeated in full; the full set stays available behind a flag | `adr-lint` | a human reading a gate run |

## Implementation

**T1 — measure.** Over this corpus and any peer corpus that will run it, report for each advisory
identity how many runs it has survived unchanged. That number is the effective false-positive proxy,
and no rule ships before it exists.

**T2 — act on the number.** For each advisory whose findings never get acted on: attach a suggested
edit, or delete it. The fence-segments advice is the first case and the reason this record exists.

## Consequences

Advice becomes a thing the project measures rather than a thing it accumulates. Some existing
advisories will not survive that, which is the intent.

⚠ This record must not become a licence to quieten inconvenient findings. The rule is *acted on or
removed*, never *emitted less often*; the difference is the whole decision.

## Out of Scope

Blocking findings (`errors.append`). This record is about advice only. Nothing here changes what a
gate refuses.

## Risks

**A survival count is a proxy, not the thing.** A finding may survive because it is genuinely hard to
act on rather than because it is useless. The measurement names candidates; a human decides.

**Suppression could hide a real regression.** Mitigated by the full set staying available behind a
flag, and by summarising rather than dropping.

## Rollback

The survival record is additive and machine-local; deleting it and restoring unconditional emission
returns the previous behaviour exactly.
