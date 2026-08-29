# ADR-010: Re-check the corpus's own claims, and count only the ones you could check

**Status:** Accepted
**Date:** 2026-08-28
**Owner:** zy
**Spec:** docs/specs/2026-08-28-a-claim-that-stopped-being-true.md
**Cross-references:** docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-006-a-verdict-that-names-its-own-reliability.md, docs/adr/ADR-008-the-plugin-is-not-the-repository.md, docs/research/2026-08-28-verification-is-the-bottleneck.md, docs/BACKLOG.md §45
**Governs:** `plugin/bin/adr-verify`
**Enforced-by:** `sweep: a corpus with nothing re-checkable does not report success`
**Invalidates:** none — checked. ADR-002 governs `adr-verify`'s mutant-restore machinery and ADR-006 governs `mutate.mjs`'s baseline; this adds a reader beside both and changes neither. ADR-005 and ADR-006 are the precedents this follows rather than records it overturns.
**Served-path change:** A maintainer runs one command and learns which of this corpus's recorded claims have silently stopped being true — three of fifteen, today. Nothing a plugin user's agent does changes.

## Context

The spec's Problem and Goal own the argument; this is the decision-relevant part.

**Measured 2026-08-28 against this repository's own corpus, by re-running every re-checkable fence:
3 of 15 distinct exit-0 claims fail at HEAD.**

| record / task | exit |
|---|---|
| `ADR-006-…/tasks/T2-amend-and-bind-the-spec.md` | 2 |
| `ADR-007-…/tasks/T1-a-qualified-id-resolves.md` | 1 |
| `ADR-009-…/tasks/T1-parse-and-resolve.md` | 1 |

All three broke the same afternoon, when ADR-008 moved `bin/` and `skills/` under `plugin/` and their
fences kept naming the old paths. **Their `acceptance-sha256` digests still match**, because the
fence TEXT did not change — the world under it did — so `adr-lint` reads them as valid evidence and
exits 0. That is the gap: the digest binds evidence to a command, and nothing binds a command to a
world in which it still passes.

Same shape as BACKLOG §45, found the same day: a `Governs:` path that stopped resolving, with every
gate green. §45 stays open and is **re-deferred** below — it is about a pointer that names nothing,
this is about a command that no longer passes, and one does not close the other.
(§45 CLOSED 2026-08-29 by ADR-011, which resolves declared paths against `git ls-files`. The
sentence above is kept as written because it is what was true when this record was accepted, and
the distinction it draws still holds: closing §45 did not close this record's claim.)

The corpus holds **0 superseded and 0 unrunnable claims today**, which is why F-17 exists: two of the
four buckets would never fire on real input and would ship as decoration.

## Existing Primitives Audit

Enumerated 2026-08-28 with
`grep -rln 'acceptance-sha256\|acceptance_digest' plugin/bin plugin/scripts scripts tests` — 10
files. Of those, the four that matter here:

- **`adr-verify::acceptance_digest()` / `normalize_acceptance()`** — the digest this decision turns on. **Reused unchanged.**
- **`adr-verify::environment_failure()`** — classifies a fence that could not reach its tools. Its **signature table is reused; its contract is RESHAPED, and the record said "unchanged" until a review caught it.** Its docstring is explicit that it *"does not change the exit code, downgrade a failure, or suppress the entry — an environment excuse that could turn red into green would be far worse than the confusion it set out to fix"*. In `--sweep` it does exactly that: it moves a claim out of `false`. The two uses are reconcilable because they answer different questions — recording asks *did this run pass*, the sweep asks *did I manage to check this claim* — but the difference is a decision, not a detail, and T1 must not let an assertion failure that merely mentions an environment string escape into `unrunnable`.
- **`adr-verify::bash_or_exit()`** — Windows Git Bash resolution, excluding the System32 WSL stub. **Reused for resolution, RESHAPED for failure:** it calls `sys.exit(2)` when Bash is absent, which is right for a single recorded run and wrong for a sweep, where an absent shell makes every claim unrunnable rather than killing the report. `resolve_bash()` beneath it returns `None` and is the right seam.
- **`adr-lint`'s Verification Log grammar (lines 66–80) and `strict_from_number()`** — **DUPLICATED, and the word matters.** Not "a small reader": `strict_from_number()` also resolves the git root, advises on a malformed config, and parses a record number that may not be numeric, and the log grammar sits behind section parsing. Calling that a reshape understates what can drift. This repository already duplicates `normalize_acceptance` across three gates by explicit design — the gates are standalone with no import path — so the trade is accepted, but T2 carries parity fixtures (malformed config, absent config, unparseable record number, root resolution) rather than an assumption that two copies agree.

`adr-debt` already sweeps a corpus directory and reports what it owes — considered as the host and rejected below.

## Decision

**`adr-verify --sweep <corpus-dir>` re-runs the corpus's own claims and reports how many stopped
being true.**

A **claim** is one distinct `(task file, acceptance digest)` pair carrying an exit-0 Verification Log
entry. Entries sharing both are one claim — 15 today, not 16 — because a log entry does not store its
command (`adr-verify:796-799` keeps only the fence's first line and a digest of the whole fence), so
re-running twice measures the same current fence twice.

Each claim lands in exactly one of four buckets, and they sum to the claim count:

| bucket | condition | in the ratio? |
|---|---|---|
| **held** | digest matches the current fence, and it exits 0 | denominator |
| **false** | digest matches, and it exits non-zero on its own terms | both halves |
| **superseded** | digest does not match the current fence | **neither** — reported on its own line |
| **unrunnable** | `environment_failure()` classifies the failure as a machine problem | **neither** — reported on its own line |

The rate is `false ÷ (held + false)`. Superseded and unrunnable sit beside it, exactly as `UNPROVEN`
sits beside the mutation campaign's ratio (ADR-006) and `UNRUN` beside `spec-verify`'s (ADR-005). A
claim that could not be re-checked is never counted as a claim that held.

**The partition must be total, and three inputs a review found do not fall out of it by themselves:**

- **A task with an exit-0 entry and no `## Acceptance` fence at all** is `superseded` — there is no
  current digest for the entry's digest to equal, and "does not match" is the correct reading of
  "there is nothing to match".
- **A fence that does not finish** is `unrunnable`, under an explicit timeout. Without one the sweep
  hangs and the claim reaches no bucket at all; `mutate.mjs` already treats a timed-out mutant as
  `HUNG` rather than as a verdict, and this is the same call.
- **A fence that itself invokes `--sweep`** is `unrunnable`, named as such, and **is not run**.
  Without this the sweep is unbounded: T3's own acceptance is a sweep, so the moment T3 earns an
  exit-0 entry it becomes a claim, and every later sweep re-runs it, which sweeps again. Found by
  review before it was written; the guard is a property of the sweep and not a workaround for T3,
  because any corpus can record a claim whose fence invokes the tool checking it.

**What would make this fail, and whether such data exists.** A false success is a fence that exits
non-zero on its own terms; the criterion is falsifiable today, and it fails today — 3 of 15, listed
above. It is valid for a corpus whose fences are re-runnable from a clean checkout, which is the
shape every fence in this repository has; a corpus with a fence needing a live service will report
those as unrunnable rather than as false, which is the correct answer and not a workaround.

**A false success fails the sweep.** Gates in this project advise and never block a user's or a
skill's attempt, and that is unchanged: the sweep is not a hook, not a `PreToolUse` check, and stops
nothing an agent is doing. It is the repository's own check, in the same class as
`bash scripts/selftest.sh` — which also fails, and must. An adopting corpus is covered by the
existing `.quality-harness.json` `strictFrom` cutoff: findings on records below it are demoted to
advice and the verdict line says `[strictFrom]`, so a demoted result is never mistaken for a clean
one. `strictFrom` changes the exit code only; the counts are identical with and without it.

## Alternatives Considered

- **A new gate, `bin/adr-recheck`.** Consistent with the ten existing gates and the cleanest boundary — a read-only reporter is a different verb from a writer of evidence. **Rejected:** it would have to duplicate *both* halves, including `environment_failure()`'s classifier table and `bash_or_exit()`'s Windows resolution. Those two are the most expensive things here to get wrong and the least testable off Windows, and a second copy is a second place for them to drift. Putting the sweep next to them costs one small entry-line reader instead.
- **A flag on `adr-debt`.** It already sweeps a corpus and answers "what does this corpus owe you", which a stale claim plainly is. **Rejected:** `adr-debt` is a fast pure-read scan whose only subprocess is `git rev-parse`. Attaching minutes of fence execution to it turns a cheap tool expensive without renaming it, and the predictable result is that people stop running it — the same way a gate with false alarms is a gate people learn to skip.
- **A repository-owned `scripts/recheck.mjs` at the root, beside `mutate.mjs`.** Simplest to write and it never ships. **Rejected for exactly that:** `strictFrom` exists to let *other* corpora adopt these gates over history they did not write, and a sweep that stays in this repository serves nobody it was designed for. ADR-008 drew the boundary; this belongs on the product side of it.
- **Report and never fail.** The purest reading of instruct-never-block. **Rejected:** a number nobody must act on drifts. `e95b0f9` removed 660 K by hand and 603 K grew back in two days, because nothing checked. The user-facing never-block rule is untouched — see the Decision.
- **Do nothing; `adr-lint` already gates evidence.** The honest counter-argument, and it is why this went unnoticed. **Rejected:** `adr-lint` verifies that a digest binds evidence to a command. Three claims prove that is not the same as the command still passing, and it passed all three.

## Component / Boundary Impact

No new component. `adr-verify` gains a second, read-only mode beside its writing mode: `--sweep`
runs fences and prints, and writes nothing to any task file. One reason to change is preserved by
that separation, and it is asserted rather than promised (T1's Tests table). No module moves, so the
architecture map is unchanged.

## Wiring & Contract Changes

Inherited from docs/specs/2026-08-28-a-claim-that-stopped-being-true.md §Contracts Touched; delta:

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `adr-verify --sweep <dir>` and its exit code | add | `plugin/bin/adr-verify` | a maintainer, CI, an adopting corpus |
| `adr-verify --help` / usage text | edit | `plugin/bin/adr-verify` | anyone who runs it — this is what makes `--sweep` discoverable at rung 3 |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `adr-verify --sweep` and its four-bucket report | T1 | T2, T3 | No — T2 adds a demotion to an exit code T1 defines; T3 consumes the report as its acceptance |

## Implementation

Three tasks in `tasks/`. See `tasks/README.md`.

## Consequences

- **Positive:** the corpus can be asked whether its own claims still hold, and answers with a number. Three untrue claims are already found, and the next `Governs:`-shaped breakage is caught by a command rather than by somebody noticing.
- **Positive:** it is the field's headline metric, computed from what already exists — no new recording, no LLM judge, and the AUROC-0.65 result for judges (docs/research §2) is why that stays true.
- **Negative:** the sweep re-runs 14 distinct fences, so it is far slower than any existing gate. It is a periodic and CI check, never a per-edit one, and that constraint is written into the tasks rather than left to habit.
- **Negative:** `adr-verify` grows a second mode. Mitigated by the write-nothing assertion, but it is a real widening of a tool whose value comes from doing one thing.
- **Neutral:** the number will read low or high for reasons that are about corpus freshness, not code quality — today's 3/15 came from a mechanical move, not from bad work. The report says what it measured and over what.

## Out of Scope

Inherited from docs/specs/2026-08-28-a-claim-that-stopped-being-true.md §Non-Goals; delta:

- Wiring the sweep into `scripts/selftest.sh`. (permanent: selftest is the fast per-commit gate and must stay fast; the sweep belongs in CI and in a maintainer's hands.)
- Resolving `Governs:`, `Cross-references:` or `Invalidates:` against the tree. (deferred: docs/BACKLOG.md §45 — CLOSED there 2026-08-29 by ADR-011; the deferral is kept as written because it was this record's scope at the time)
- Re-recording evidence for records whose fences are correct but whose digests predate a fence edit. (permanent: there are none — 0 superseded today — and `adr-lint` already refuses `done` on that state.)
- Repairing the 12 existing task fences whose `\| tee`-and-`grep` form can pass with the runner absent, and the task template that recommends it. (deferred: docs/BACKLOG.md §46)

## Risks

Inherited from docs/specs/2026-08-28-a-claim-that-stopped-being-true.md §Risks; delta:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `--sweep` shares a process with the mode that WRITES evidence, and a future edit lets it append | Med | High | T1's Tests table carries a check that the corpus is byte-identical after a sweep, and a mutation that removes the guard must go RED |
| A CI job running the sweep outruns its timeout as the corpus grows | Med | Med | 15 claims over 14 fences today; the job reports its own wall time so the trend is visible before it bites |
| A recorded claim's fence invokes the sweep, so the sweep recurses without bound | Med | **Critical** | A fence naming `--sweep` is reported unrunnable and never executed; T1 carries the fixture and a mutation on the guard that must go RED |
| A claim's fence is repaired but not re-recorded, so its stale entry becomes superseded and the sweep reads clean | Med | High | T3's acceptance asserts a fresh exit-0 entry carrying the CURRENT digest for each repaired task, not merely a clean sweep |
| An acceptance fence passes because its runner never started | **High** | **High** | The `\| tee …; ! grep` form this project's own task template recommends returns 0 when the runner is absent — measured 2026-08-28, exit 0 with `nosuchrunner`. Every fence in this record uses `set -o pipefail` and `&&` instead. The 12 existing fences and the template itself are a separate defect: docs/BACKLOG.md §46 |

## Rollback

Revert the commit. `--sweep` is read-only and stores nothing, so there is no state to unwind; the
only durable change is T3's repair of three fences, which is a correction that should outlive a
rollback of the sweep itself.

## Follow-ups

- [x] Set this record's `Enforced-by:` to T1's catalogue mutation label — done 2026-08-28.
- [x] Repair the acceptance-fence pattern in `templates/task-template.md` and the fences using it (docs/BACKLOG.md §46) — done 2026-08-28: template corrected, ten fences repaired and re-recorded, gate added.
