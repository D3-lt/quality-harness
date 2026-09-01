# ADR-022: A fence names what its claim rests on

**Status:** Proposed
**Date:** 2026-09-01
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-003-a-gate-asserts-behaviour-not-shape.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-013-a-mutation-a-human-performed.md, docs/adr/ADR-016-a-mutant-earns-its-verdict.md, docs/adr/ADR-018-every-ordered-step-names-its-proof.md, docs/adr/ADR-020-a-run-leaves-a-trace-outside-the-file.md
**Governs:** `plugin/bin/adr-lint`, `plugin/bin/adr-verify`, `plugin/templates/task-template.md`, `tests/gate-regressions.py`, `tests/mutations.json`, `scripts/fence-obligation-sweep.py`
**Enforced-by:** `lint: a declared mechanism with no bound mutant is reported`, `verify: --covers refuses a mechanism the task did not declare`
**Invalidates:** none — checked. ADR-016's obligation is extended rather than replaced: at least one killed mutant bound to the current fence digest remains exactly what `done` requires, and this record adds a second, advisory reading beside it. ADR-013's human-observed lane is unchanged and gains the same optional field. ADR-018's proof map answers which STEP is proved by what; this answers which MECHANISM inside one fence is measured, and the two do not overlap. ADR-020's acceptance-entry binding is untouched, and the Mutation Log binding it deferred stays deferred (see Out of Scope). ADR-003's requirement that a mutant be behavioural is unchanged.
**Served-path change:** `adr-lint` tells an author which of a fence's declared mechanisms no mutant has ever been shown to catch, instead of falling silent once any one mutant is bound.

## Context

`adr-lint` requires, before a task may be `done`, at least one `mutant killed` row bound to the
current Acceptance fence's SHA-256 (`plugin/bin/adr-lint:2094`, `check_mutation_evidence`). The
obligation is **existential**. Vacuity is **per-mechanism**: a fence that chains three assertions and
carries one killed mutant has been shown capable of failing for one reason, and nothing has been
learned about the other two.

Reported 2026-08-30 by klientams-front-v2-01, correcting a claim made in this repository. In their
corpus, a task passed every current gate carrying two killed mutants while a mechanism its headline
claim rested on was unbound — the second mutant SURVIVED on first run, and had they recorded only
the first, the task would have satisfied the obligation and shipped green. Four of nine fences there
could not fail at all before the audit.

Measured on this corpus 2026-09-01 with `python3 scripts/fence-obligation-sweep.py`, so the local
shape is counted rather than assumed:

```
task files carrying an Acceptance fence           : 40
  >1 assertion, exactly 1 digest-bound killed mutant: 26
  >1 assertion, no digest-bound killed mutant       : 0
  1 assertion                                       : 7
```

The remaining 7 carry two or more digest-bound kills against a multi-assertion fence — the shape this
record wants to make ordinary rather than incidental.

**What that measurement is, stated so the record does not claim more than it took.** The sweep counts
shell segments that are not obviously setup, and digest-bound `mutant killed` rows. Both are
observable in the file. **It does not show that any mechanism is unbound.** A fence's segments are
not its mechanisms: several segments can rest on one mechanism, and one segment can rest on several.
26 is a first-order proxy — a count of places worth looking — and treating it as a defect count would
be the same error this record exists to correct.

That limit is not a gap in the sweep; it is the finding. **Nothing in a task file enumerates what its
fence's claim rests on**, so nothing — tool or reader — can count what is unproven. The quantifier
cannot be tightened without that enumeration, and the enumeration cannot be derived: ADR-016 already
established, for the same command, that the tool cannot safely infer structure from arbitrary shell,
because a fence may invoke a wrapper, container, build system, generator or remote service.

**The trap this record must not fall into.** The obvious fix — restore the `## Mutants` table the
task template once carried — is the shape that was deliberately removed. That table was hand-filled
**evidence**: a row asserting a mutant was killed, typed by an author who need not have run anything.
It was the last piece of self-declared proof in the pipeline, and the tool-written Verification Log
replaced it precisely to close that hole. Re-introducing it as prose would re-open it.

## Existing Primitives Audit

- `check_mutation_evidence()` (`plugin/bin/adr-lint:2094`) already reads every task's Mutation Log,
  resolves the current fence digest, and decides whether a `done` row is backed. **Reused** — the new
  reading is computed from state it already holds, and its `done` rule is not changed.
- `MLOG_RE` and the mutation row grammar (`plugin/bin/adr-lint:181`, written at
  `plugin/bin/adr-verify:1359`) already carry a free-text `<why>` field and an optional trailing
  `acceptance-sha256`. **Extended** with one optional suffix field rather than a second grammar.
- `errors.advise()` versus `errors.append()` already separates advisory from blocking output.
  **Reused**; everything this record adds is advisory.
- `HUMAN_MLOG_RE` and ADR-013's human-observed lane already accept a row this tool did not produce.
  **Reused** unchanged; the new field is optional there too, so the lane keeps working.
- `adr-verify`'s existing option parsing and its `--mutant/--from/--to/--why` group already validate
  authoring input before any file is touched. **Extended** with one more member.
- `scripts/fence-obligation-sweep.py` already counts the corpus-level shape. **Reused** as the
  record's own re-runnable evidence; it is not a gate and does not become one.

## Audit of the class

**Class:** every place this product decides whether a recorded mutation obligation has been met.

Enumerated 2026-09-01:

```bash
git grep -n "mutant killed" plugin/bin/ scripts/ | grep -v "^plugin/bin/adr-verify:.*entry = "
git grep -n "def check_mutation_evidence\|MUTATION_REQUIRED_FROM" plugin/bin/adr-lint
```

Two members. `check_mutation_evidence()` in `adr-lint` is the gate that decides whether `done` is
backed, and it is the one this record extends. `scripts/mutate.mjs` grades this repository's own
fixed catalogue and writes campaign output; it never reads a consumer task's Mutation Log and cannot
award the task-level verdict governed here, so it is outside the class — the same boundary ADR-016
drew for the same file, and for the same reason.

**Left out deliberately:** `adr-next`'s readiness computation reads `done` rows but does not decide
what backs them, so it inherits whatever `check_mutation_evidence()` concludes and needs no change.

## Decision

A task may declare, in a new optional `**Rests-on:**` header, the named mechanisms its Acceptance
fence's claim depends on. `adr-verify --mutant` gains `--covers <mechanism>`, which records the
declared name in the Mutation Log row it writes and refuses a name the task did not declare.
`adr-lint` then reports which declared mechanisms have no `mutant killed` row bound to the current
fence digest.

**The report is advisory and the `done` rule does not change.** At least one bound killed mutant
remains exactly what `done` requires. This is not timidity about a gate: tightening `done` to demand
full coverage would make honest declaration the expensive choice, and an author who can lower an
obligation by writing less would write less. Keeping the requirement existential and the coverage
advisory means declaring a fourth mechanism costs nothing but a line of advice, which is the only
arrangement under which the declaration stays truthful.

**Why a hand-written declaration is safe where a hand-written table was not**, which is the whole
argument and the reason this does not re-open the hole ADR-016's predecessor closed:

| | old `## Mutants` table | `Rests-on:` |
|---|---|---|
| what the author writes | that a mutant was killed | what the fence's claim depends on |
| what it does for the author | discharges an obligation | creates one |
| what fabrication buys | a green record with no run behind it | more advice against yourself |
| who writes the evidence | the author | `adr-verify`, as now |

Hand-filling **evidence** is forgeable and was forged. Hand-filling an **obligation** can only make
the record admit more than it has proved. The incentive runs backwards, which is why the declaration
can be prose while every row about a run stays tool-written.

**Under-declaration is the residual risk, and it gets an advisory that says only what was observed.**
`adr-lint` compares the number of declared mechanisms against the number of non-setup segments it
counted in the fence, and advises when there are fewer of the first. Its wording names the count it
took — *"the fence chains 3 segments and 1 mechanism is declared"* — and never the count it did not:
it must not say a fence rests on three mechanisms, because that is precisely the thing this record
establishes cannot be derived from the file. This is CLAUDE.md §3's rule and ADR-005's vocabulary
applied to a check whose subject is a proxy.

**What would make this fail.** The pre-registered criterion is in Follow-ups: after a month, count
how many tasks declare more than one mechanism. If most declare exactly one, authors are treating
`Rests-on:` as a formality and the advisory is generating noise against a field nobody fills
honestly — in which case the field comes out, and the corpus is no worse off than today. Data that
could produce that failure exists as soon as the first tasks are authored under it. The criterion is
valid for this corpus, whose fences are shell chains of two to five segments; a corpus whose fences
are single opaque commands would need a different threshold, and the number should not be carried
there.

## Alternatives Considered

- **Derive the mechanisms from the fence.** Parse the shell, split on `&&`, treat each segment as a
  mechanism. Rejected: ADR-016 already established for this exact command that the tool cannot infer
  structure from arbitrary shell, and the sweep in Context is the demonstration — its segment count
  is usable as a hint and unusable as a fact, because a segment is neither necessarily one mechanism
  nor necessarily a whole one.
- **Require full per-mechanism coverage before `done`.** Rejected: it makes honest declaration the
  expensive choice. An author who declares one mechanism ships; an author who declares four is
  blocked. The gate would select for under-declaration and then report the resulting silence as
  coverage — a gate that is worse than none, which is the failure ADR-005 names.
- **Restore the hand-filled `## Mutants` table.** Rejected: it is the fabrication hole the
  Verification Log was built to close. The table in this decision holds obligations, not rows about
  runs, and no row about a run becomes hand-writable.
- **Report the ratio without naming mechanisms** — publish "1 bound mutant against 3 segments" per
  task and stop. Rejected: it is the sweep, which already exists and lives in `scripts/`. It tells an
  author a number and not which thing to go and mutate, so it cannot be acted on — the defect
  BACKLOG §85 records for two other messages that were true and unactionable.
- **Do nothing; the existential obligation is enough.** Rejected on the reporter's measurement: a task
  satisfied it while the mechanism its headline claim rested on was unbound, and nothing anywhere
  could have said so.

## Component / Boundary Impact

None — internal to the gates. `adr-lint` gains a reading over state `check_mutation_evidence()`
already computes; `adr-verify` gains one option and one optional row suffix. No module moves, and no
ownership changes: the Module Map in `docs/architecture.md` is unaffected.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| Task file `**Rests-on:**` header | new, optional | task author | `adr-lint` (T1, T3, T4), `adr-verify` (T2) |
| `adr-verify --mutant --covers <name>` | new option | CLI caller | `adr-verify` (T2) |
| Mutation Log row, optional ` · covers:<name>` field | grammar extension, backward compatible | `adr-verify` (T2) | `adr-lint` (T3) |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `rests_on()` declaration parser | T1 | T2, T3, T4 | No — new function, no existing caller |
| ` · covers:<name>` row field | T2 | T3 | No — optional suffix; every existing row still parses |

## Implementation

See `tasks/README.md`. Four tasks.

## Consequences

- **Positive:** the corpus can, for the first time, say which part of a fence's claim no mutant has
  been shown to catch. Today that question has no representation at all.
- **Positive:** the evidence half stays entirely tool-written. Nothing this record adds can be used
  to assert that a run happened.
- **Negative:** a truthful declaration is voluntary, and a lazy one is cheap. The segment-count
  advisory is a hint against that and not a guard; this record does not claim otherwise.
- **Negative:** one more optional header on a task template that already carries eight, against a
  corpus that has repeatedly found taxonomies rot (BACKLOG §60). The Follow-up count is what decides
  whether it stays.
- **Neutral:** existing task files and their rows are unaffected. A task with no `Rests-on:` is read
  exactly as it is today, so the corpus needs no migration and none is performed.

## Out of Scope

- Tightening the `done` rule to require per-mechanism coverage (permanent: boundary: it makes honest declaration the expensive choice, which selects for under-declaration and turns the resulting silence into apparent coverage — the argument is in the Decision)
- Deriving a fence's mechanisms from its shell (permanent: fact: the tool cannot safely infer structure from arbitrary shell, decided for this same command; citation: file `docs/adr/ADR-016-a-mutant-earns-its-verdict.md:30`)
- Binding a Mutation Log row to the output its run printed, so two mutants against one fence stop ending in the same 64 characters (deferred: docs/BACKLOG.md §98 — and BLOCKED, not merely punted: §98's own text says to do the acceptance half first and read ADR-020's Follow-up, which commits to a one-month count that has not elapsed)
- Reclassifying a mutant that does not parse (deferred: docs/BACKLOG.md §102)
- A fence linter for `! grep` under `set -e` (permanent: fact: this corpus has zero instances — 51 fences, 0 using `set -e`, 22 negated greps all in last-command position where the status is the exit status; citation: file `docs/BACKLOG.md:4418`)
- Judging whether a document says the right thing rather than contains a string (deferred: docs/BACKLOG.md §80 — its own entry states the honest fix needs graders that can run, which is the eval-fixture work in §30, not this record)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Authors declare one mechanism to silence the advisory | High | Med | The Follow-up counts exactly this and removes the field if it holds; the segment-count advisory in T4 makes a one-line declaration against a five-segment fence visible |
| The segment-count advisory fires on honest single-mechanism fences | Med | Med | T4's wording names only the counts observed, never a conclusion about the fence; and it is advisory, so a false hint costs a glance |
| The new row field breaks a reader of the existing grammar | Low | High | T2's Tests table carries a row asserting every pre-existing corpus row still parses, and the field is a suffix on a grammar that already has an optional trailing field |
| The declaration drifts from the fence it describes after a fence edit | Med | Med | A fence edit already invalidates every digest-bound entry, so coverage returns to zero and every declared mechanism is reported uncovered — the drift is loud rather than silent |

## Rollback

Delete the `**Rests-on:**` block from the task template, drop the `--covers` option, and remove the
three advisories. No persistent state, no external integration, and no migration to unwind: rows
carrying ` · covers:<name>` remain parseable by the pre-existing grammar because the field is an
optional suffix, so a rollback leaves the corpus readable without touching a single recorded row.

## Follow-ups

- [ ] After one month, count tasks authored under this record that declare more than one mechanism. If most declare exactly one, the field is a formality generating noise and it comes out — see the pre-registered criterion in the Decision.
- [ ] Re-run `python3 scripts/fence-obligation-sweep.py` after the first ten tasks are authored under `Rests-on:` and record whether the segment count and the declared count converge. If they do not, the segment proxy in T4 is measuring something other than what an author means by a mechanism, and T4's advisory is the part to reconsider.
