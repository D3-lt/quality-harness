# ADR-003: A gate asserts behaviour, not shape

**Status:** Accepted
**Date:** 2026-08-27
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-002-a-mutant-restore-outlives-its-process.md, docs/BACKLOG.md §25, §27
**Governs:** `plugin/bin/**`, `tests/mutations.json`
**Enforced-by:** `tests/package.test.mjs::every shipped gate carries at least one mutation`
**Invalidates:** none — checked. ADR-002 governs `bin/adr-verify` as a single mechanism; this record governs what KIND of check any gate under `bin/` may be. Both can hold: ADR-002 says that gate must restore a file it broke, this one says every gate must assert something a deleted line breaks.
**Served-path change:** Someone proposing a new gate is handed this record by `adr-context bin/<new-gate>` before they write it, and a gate added with no mutation makes the suite go red.

## Context

This plugin ships ten executable gates. The question this record settles came up
as a concrete proposal — "just tell the LLM it has to pass a cyclomatic
complexity lint and it will write simpler code" — and the general answer matters
more than that one feature.

Two measurements from 2026-08-27 bound the problem.

**Prose does very little.** `gates-advise-never-block` reported Δ −0.40, then
Δ 0.00 over ten runs, and the cause was that no run ever answered: thirteen of
thirteen ended `error_max_turns` while hunting an empty sandbox. The number was
arithmetic, not behaviour. The corpus's other evidence points the same way —
every behaviour change demonstrated in this repository has come from a command
with an exit code, not from wording.

**A shape check is satisfiable without changing anything.** Cyclomatic
complexity counts branches per function. Splitting one twenty-branch function
into five four-branch functions turns the metric green with the total branching
unchanged, plus new indirection. A model is better at that mechanical extraction
than a person, because it does not get bored. The reliable output of a
complexity gate is smaller functions, which is not the same thing as simpler
code.

That second failure is the same class this repository kept finding all day, in
its own work: a report calling eighteen working forwarders "drifted", a mutation
that stayed GREEN because it described a mechanism the code did not have, a
boundary grader that passed by producing nothing, and a test suite that dropped
from 82 tests to 80 and still said `fail 0`. Each one is a signal produced
without being connected to the thing it claims to report on.

## Existing Primitives Audit

- `adr-verify --mutant` already implements the rule this record generalises: it
  breaks a mechanism and requires a test to go red. **Reused as the standard**,
  not modified.
- `scripts/mutate.mjs` and `tests/mutations.json` already hold one catalogue
  entry per mechanism, and the campaign already reports GREEN when nothing
  notices. **Reused**; T1 adds the check that the catalogue covers every gate.
- `scripts/mutate-propose.mjs` already finds contract strings that no test
  asserts — the cheap half of the same idea. **Reused unchanged.**
- `skills/mutation-audit/SKILL.md` already embodies the principle without ever
  stating it as a rule for choosing gates. **Reshaped** by T1's doc change.

## Decision

Every gate this plugin ships asserts an observable property that no
restructuring can satisfy. In the owner's words, which are the clearest
statement of it:

> **Don't ask for simple code, ask for code whose mechanism a deleted line
> breaks.**

The four shapes that qualify, each already shipped or already used here:

- *"This test must fail when I delete the wiring"* — `adr-verify --mutant`.
- *"A doc comment must document the declaration it sits on"* — a doclint.
- *"Every catalogue tool appears in the README"* — a count that cannot drift.
- *"Every mint path honours the exemption"* — written against the paths, not
  against a function.

None can be satisfied by moving code around, because each asserts behaviour or a
correspondence rather than a form.

A complexity number is not banned from the toolkit; it is banned from being a
gate. **As a conversation trigger it earns its place** — "this function crossed
15, come look" is useful information. As a threshold that fails CI it produces a
compliant number and teaches the model that splitting is the goal.

What would make this decision wrong: a shape check whose satisfying edit is
itself the improvement — where there is no cheaper way to make the number move
than to actually fix the thing. If such a check is proposed, this record should
be revisited rather than cited. No example is known here today, which is the
honest state of it rather than a claim that none exists.

## Audit of the class

**The class:** every executable gate this plugin ships under `bin/`, since each
is a check somebody's CI can come to depend on.

**Enumerated by command, not memory:**

```bash
python3 - <<'PY'
import json, os
cat = json.load(open('tests/mutations.json'))['mutations']
for g in sorted(x for x in os.listdir('bin') if '.' not in x):
    print(f"{g:20s} {sum(1 for e in cat if e['file'] == f'bin/{g}')}")
PY
```

Run 2026-08-27 — ten gates, every one already carrying at least one mutation:

| gate | mutations | gate | mutations |
|---|---|---|---|
| `adr-lint` | 15 | `adr-next` | 4 |
| `adr-verify` | 14 | `adr-retire-check` | 3 |
| `adr-judge` | 12 | `postmortem-verify` | 3 |
| `qh-root` | 4 | `arch-lint` | 2 |
| | | `spec-verify` | 2 |
| | | `adr-debt` | 1 |

So the invariant already holds and nothing asserts it — which is precisely the
gap this record exists to close, and precisely the shape of the defects listed in
Context. T1 turns the happy accident into a red suite.

**Members deliberately left out:** the `.cmd` shims beside each gate. They
forward to the gate and carry no logic of their own; `tests/standalone-link.test.mjs`
already asserts every gate has one. Named here so their absence from the table is
a decision rather than an oversight.

## Alternatives Considered

- **Ship a cyclomatic-complexity gate:** the proposal that prompted this record, and the one
  alternative here that was MEASURED rather than argued.
  Rejected because the metric is satisfied by relocation — five four-branch
  functions pass where one twenty-branch function failed, with the same total
  branching — so it reliably produces smaller functions rather than simpler ones,
  and it teaches splitting as the goal.

  Measured 2026-08-27 with `evals/complexity-instruction-given` and
  `evals/complexity-instruction-omitted` — the same duration-parser task, prompts differing by
  exactly three lines ("this repository fails CI on any function whose cyclomatic complexity
  exceeds 8"), five runs each, `--ablation none`:

  | | splits into helpers | total branch points ≤ 12 |
  |---|---|---|
  | instruction omitted | 0/5 | **5/5** |
  | instruction given | 1/5 | **4/5** |

  Two things, and the second is the one that decided this record. The instruction was **inert in
  four of five runs** — indistinguishable from not saying it. And **the single run that obeyed it is
  the single run that got worse**: it split the work into helpers AND pushed total branching over
  the budget, which is the relocation failure stated above, observed rather than predicted. The
  baseline wrote the table-driven single function every time, so the instruction was not needed for
  the good outcome and was the only source of the bad one. `n=5` makes 1/5 one observation, but the
  baseline's 5/5 stability is what gives it weight.
- **Put the rule in skill prose only, in `mutation-audit`:** the cheapest option,
  and where the principle already lives implicitly. Rejected as insufficient on
  its own: prose is re-interpreted by every model version and measurably weak
  here — `gates-advise-never-block` produced Δ 0.00 across ten runs, and the
  traces showed the skill text never reached the answer at all. Prose is still
  written (T1 changes `mutation-audit`), but it is not the mechanism.
- **Ship the complexity number as an advisory line rather than a gate:** rejected because every
  gate here judges records and evidence, and this would be the first to judge the user's SOURCE.
  The operator's standing rule keeps repository-owned checks in the project, where better
  instruments already exist — `zeus` carries `clippy::cognitive_complexity`, the Laravel stacks
  carry phpstan. Rejected on scope rather than on merit, and the owner's "conversation trigger"
  framing is recorded in the Decision as legitimate, so it is deferred rather than closed.
- **Rule by review instead of by record:** rely on whoever reviews a new gate to
  object. Rejected because it depends on the reviewer knowing; `adr-context
  bin/<new-gate>` hands this record to the author before the review exists.

## Component / Boundary Impact

None — internal. No module is added, moved or re-owned. T1 adds an assertion to
an existing suite and edits one skill document.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `tests/mutations.json` | becomes a required index: every `bin/` gate must appear as a `file` at least once | authors of new gates | `tests/package.test.mjs`, `scripts/mutate.mjs` |
| `skills/mutation-audit/SKILL.md` | states the behaviour-not-shape rule for choosing what to gate | this record | anyone invoking `quality-harness:mutation-audit` |
| `adr-context bin/<path>` | now returns this record for every gate | `docs/adr/ADR-003-…` `Governs:` | whoever proposes or edits a gate |

## Inter-task Contracts

None — one task.

## Implementation

See `ADR-003-a-gate-asserts-behaviour-not-shape/tasks/README.md`. One task.

## Consequences

- **Positive:** a gate added with no mutation makes the suite go red, so "this
  gate asserts something" stops being a thing anyone has to remember.
- **Positive:** the rule is attached to `bin/**`, so tooling delivers it to the
  next author rather than depending on them having read a skill.
- **Negative:** adding a gate now costs a catalogue entry as well as a test. That
  is the intended cost, and it is the cheapest half of what the rule asks.
- **Negative:** a genuinely useful shape check would now have to argue with an
  accepted record. The Decision names what would make it wrong so that argument
  has somewhere to start.
- **Neutral:** nothing about the existing ten gates changes; the invariant they
  already satisfy is simply asserted.

## Out of Scope

- Shipping any complexity measurement, gate or advisory. (deferred: docs/BACKLOG.md §28)
- Whether `.cmd` shims need mutations. (permanent: they carry no logic and `tests/standalone-link.test.mjs` already asserts each gate has one.)
- Any check over the user's own source code rather than their records. (permanent: the operator's standing rule keeps repository-owned checks project-scoped, and this plugin holds to it.)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A count of catalogue entries is itself a shape check — one entry satisfies it without asserting anything real | Med | High | Named openly: the count is a floor, not the guarantee. `mutate.mjs` already reports GREEN when a mutation is not noticed, and that campaign is the actual assertion. The test says "somebody wrote a mutation for this gate", nothing more, and T1's prose says so |
| The rule reads as a ban on all static checks, including good ones | Med | Med | The Decision names the falsifying case — a shape check whose satisfying edit IS the improvement — so the record can be revisited rather than lawyered |
| Prose in `mutation-audit` is weak and may not fire | High | Low | Accepted; the record and the test are the mechanism, the prose is a courtesy to a reader already there |

## Rollback

Delete the assertion T1 adds and this record. No persistent state, no contract
consumed outside this repository, no migration. The ten existing gates are
untouched either way.

## Follow-ups

- [x] Fold in the `complexity-instruction-given` / `complexity-instruction-omitted` A/B result. Done 2026-08-27; it is in Alternatives, and it moved this record from argued to measured.
- [x] Decide whether a complexity conversation-trigger belongs anywhere (docs/BACKLOG.md §28). Answered 2026-08-28: yes, in `skills/review/SKILL.md` Pass 2 — as a question about the specific confusion, never a score. That is the one delivery mode §36 measured as working: guidance at the moment it applies, to a reader who can see what the number cannot. The prohibition on shipping it as a gate is unchanged.
