---
name: adr-write
description: Create a proposed, executable decision record for a durable technical choice. Use when the user asks for an ADR or when work changes a public contract, persistent state, trust boundary, cross-component ownership, or costly-to-reverse architecture. Do not use for bounded implementation, open-ended requirements discovery, or ADR retirement.
---

# ADR Write

Create a short ADR that is reviewable first and executable later. Templates are source of truth; do not restate them from memory.

## When to use

- Non-trivial change: new feature, cross-module refactor, public contract, schema, security/compliance, or persistent state.
- User asks for ADR/decision record/task breakdown. (Spec/requirements/BDD scenarios → `/quality-harness:spec-write` first; its output feeds this skill.)
- Existing decision must be captured before `/quality-harness:adr-execute`.

Skip for single-file fixes, pure docs, dependency bumps, or brainstorming before a direction is chosen.

## Before drafting — check what your decision invalidates

Two recalls, both cheap, both for the same failure: an ADR written in isolation that contradicts one
already accepted.

- **`am_search`** the subsystem and the decision. The palace is where this pipeline's lessons
  accumulate; a rule filed by another session applies here without anyone editing this skill.
- **Read the active ADR catalog, then search the governing decisions it names for what your decision
  changes.** The compact catalog may link both active ADRs and still-governing archived ADRs. Do not
  recursively load archived task logs or lint history. If you are removing, renaming, or re-scoping
  something — a family of arms, a contract, a default — another governing ADR may consume it, and a
  pre-registered criterion two documents away can be silently invalidated by a choice that looks
  local. Reconcile any authority change in the active/catalog sidecars in the same commit; never
  rewrite a frozen archived record.

## Required Inputs

Ask one concise question for anything missing:

- Topic and trigger: what changes, why now.
- Owner.
- ADR number and project ADR path; match existing repo naming.
- Task scale: always a `tasks/` directory; the wave table and DAG appear as the count grows.

## Workflow

1. Read fresh:
   - `${CLAUDE_PLUGIN_ROOT}/templates/adr-template.md`
   - `${CLAUDE_PLUGIN_ROOT}/templates/task-template.md` if task files are needed
   - `${CLAUDE_PLUGIN_ROOT}/templates/tasks-readme-template.md` if task files are needed
   Then run `adr-debt <active-project-adr-dir>` and read the active `BACKLOG.md` — every reported deferred item or open
   follow-up relevant to this ADR is pulled into Context, re-deferred with a fresh pointer, or
   promoted to `(permanent: <why>)`. Debt is surfaced at authoring time, never silently carried.
   Keep a sibling historical archive outside this recursive scan; its obligations must already have
   receipts in the active backlog under the `adr-retire` contract.
   If the repo has an architecture doc (`docs/architecture.md` or repo convention): read it —
   Component/Boundary Impact inherits from its Module Map by reference (deltas only); an ADR
   that adds/moves modules updates the map in the same commit. Structural change + no arch doc →
   recommend `/quality-harness:arch-write` first.
2. Draft the ADR as `Proposed`. When a spec exists: set the `Spec:` header to its path; inherit
   Contracts/Non-Goals/Risks by reference (deltas only — never re-transcribe the tables); distribute
   every @spec fact/scenario ID into task `Covers:` headers so the union covers the spec.
3. If implementation has more than 3 small tasks, create `tasks/README.md` plus one task file per
   independently executable task. Task files are the source of truth; the README is a derived index.

   Four things an author gets wrong by default. Each cost a real debug cycle:

   **Write an acceptance fence that FAILS before the work is done.** Ask what your command does when
   the tests it names do not exist yet. For `go test -run`, `phpunit --filter` and `cargo test
   <name>` the answer is "prints a summary and exits 0" — so the gate passes at the moment of
   authoring, with nothing built. `adr-verify` now records such a run as a failure, but the fence
   should be written so it is obviously red until the work lands.

   **Say when a step needs real data even though the gate is hermetic.** A task whose Ordered Steps
   require a populated corpus, a live service or recorded traffic, while its Acceptance is a
   self-contained unit test, has a requirement the gate cannot see. Write that dependency into the
   task explicitly, and put whatever the run must record — sample size, the measurement it was taken
   against — into the sign-off line. Otherwise the gate goes green with the actual requirement unmet.

   **Name what SELECTS each new thing, not just what implements it.** If a task adds an arm, a
   handler, a backend or a config field, its Affected Files table must also carry the registry, the
   composition root, the flag parser or the help text that makes it reachable — and its Tests table
   must carry a check that fails when that one line is deleted. A component with tests and no caller
   is this pipeline's most common shipped defect.

   **Date every number and name the thing it was measured on.** "98% of answers are in the top 20"
   is unfalsifiable a month later and actively misleading once the data changes; a task that copies
   such a figure into a source comment ships evidence that no longer exists. Write "measured
   YYYY-MM-DD against <what>" or do not write the number.
4. Run `adr-lint <adr.md>` and paste the output. Exit 0 is the authoring gate — fix
   findings, don't hand-wave them.
5. For a split-task ADR, or one touching security, public contracts, migrations, parsers,
   concurrency, or other high-risk boundaries, run one cold read-only review before presenting it.
   Give the reviewer only the ADR, its linked spec/architecture sources, and its task files. Ask for
   concrete findings about completeness, ordering, ambiguity, risk, and missing proof; validate each
   finding against source, amend the same artifacts, and rerun `adr-lint`. Do not create a separate
   review document.
6. Present paths, summary, and the lint run. Stop for user review/acceptance; do not commit.

## Hard Gates

- Include every template section, or write `None — <reason>`.
- Include at least one alternative.
- Existing primitives audit is required for new components/contracts.
- C4 and bounded context checks are required when components change.
- Wiring must list all contracts/events/schema/config/public API changes; write `None — implementation-internal only` only when true.
- Rollback is required for persistent state, contracts, or external integrations.
- Each task needs: Goal, Affected Files, Ordered Steps, Produces, Consumes, Acceptance command, Tests, Invariants, Risks, Out of Scope, Stop Condition.
- Acceptance is a shell command with meaningful exit code, unless explicitly `human-observed` with sign-off.
- Each task file carries a `## Mutation Log` section. It is TOOL-WRITTEN by `adr-verify --mutant` at
  execution time and empty at authoring — but the section has to exist, because `adr-verify` refuses
  to record a mutant into a task that has nowhere to put it, and `adr-lint` requires a `mutant
  killed` entry before a task recorded from 2026-08-22 can be `done`. The old hand-filled
  `## Mutants` table it replaces was the last piece of self-declared evidence in the pipeline.
- A plan may not say "implement X" unless it also states how execution proves X is done.
- Ordered Steps start with the failing test (TDD red) for the task's `Covers:` IDs.
- When a spec exists: `Spec:` header set, inherited sections by reference, and the union of task
  `Covers:` must include every @spec fact/scenario — `adr-lint` blocks Accepted on uncovered IDs.
- `adr-lint <adr.md>` exits 0 before presenting the ADR. Mechanically enforced: Status, Spec
  header, Alternatives ≥1, Wiring non-empty, Out of Scope dispositions, task sections/headers,
  bash-fence Acceptance, TDD step 1, README↔task-file consistency, task-DAG cycles,
  wave/order-vs-dependency ordering (Depends-on + Consumes edges), Verification Log grammar +
  README `done` ⇔ matching exit-0 adr-verify entry, spec coverage. Still
  review-enforced (the lint does NOT check them): primitives audit, C4/bounded-context, Rollback,
  `None — <reason>` completeness — verify these by reading, don't assume the exit code covers them.
- **Contract coupling scan is mandatory at any size.** If task A's `Produces` matches task B's `Consumes`, A must complete before B regardless of grouping. `adr-lint` catches the edges it can see (T-id refs and backticked tokens in `Consumes` matching a sibling's `Produces`) — write `Consumes` with the producing task's id in parens (`Resolver.resolve() (T2)`) so every edge is machine-visible; prose-only contract references are invisible to the gate.
- **Out of Scope entries carry a disposition** — `(permanent[: why])` for deliberate boundaries, `(deferred: <pointer>)` for punted work. Untagged bullets are rejected by `adr-lint`; `adr-debt` sweeps deferred entries so they resurface.

## Plan Quality Gate

A task plan is valid only when it names likely files, ordered implementation steps, tests to add/change, invariants to preserve, risks/rollback, explicit unknowns, and the condition that should block execution. No vague tasks; no guessing.

When two dependency-valid orders are otherwise comparable, put the first externally observable or
served-path slice earlier so a human can test the direction sooner — unless doing so creates a material
detour or weakens the proof.

## Task Layout by Size

- **≤3 tasks**: `tasks/` directory with task files and a flat `README.md`, same as 4–5. It is
  three small files, and it is the only shape the evidence chain can cover.

  This used to say "inline numbered list inside the ADR, no `tasks/` directory", and that
  advice routed small work into the one place the anti-fabrication guarantee does not apply.
  `adr-verify` appends its Verification Log and Mutation Log to a TASK FILE; without one
  there is nowhere for tool-written evidence to land. `adr-lint` runs ADR-level checks only
  when there is no tasks directory, so `done_task_ids` and `evidenced_task_ids` read an index
  that does not exist. Measured 2026-08-26: an ADR with three inline tasks all marked
  **done**, and no evidence anywhere, passes `adr-lint` with exit 0.
- **4–5 tasks**: `tasks/` directory with task files + a flat `README.md` listing tasks in execution order with `Depends-on` per task. Skip the ASCII DAG diagram.
- **>5 tasks**: full `tasks/README.md` with wave table (parallel-safe groups); ASCII DAG only when it clarifies complex branching (matches the template).

## Output

- Paths created/changed.
- Task count (and wave count if >5 tasks).
- Decision summary in one paragraph.
- `Ready for /quality-harness:adr-execute <path>` only after user marks the ADR `Accepted`.

## Lessons

Append-only, dated. When an ADR authored by this skill turns out to have been unexecutable or
misleading, the rule that would have prevented it goes here and, where a gate can enforce it
mechanically, into `adr-lint` — prose is re-interpreted by every model version, an
exit code is not.

- **2026-08-20 — an acceptance filter matching nothing exits 0**, so every task passed its own gate
  the moment it was written. Now caught by `adr-verify`; write fences that are obviously red first.
- **2026-08-20 — a Tests table naming tests nobody wrote.** Tasks marked done across five projects
  named tests absent from the files beside them. `adr-lint` now reads the real files.
- **2026-08-20 — a falsification gate that could not fail.** An ADR's whole design was "nothing
  ships until this gate passes", and the corpus it would run against could not produce a failing
  result. Before writing a criterion, ask what data would make it fail and whether that data exists.
- **2026-08-20 — a claim quantified against data that was later deleted.** A task required its
  figure to be written into a source comment; the corpus had been reset in between.

- **2026-08-21 — an acceptance fence's paths are relative to where the fence CDs to.** A task
  ended `cd apps/api && … && bash -n infra/deploy/foo.sh`; after the `cd` that path resolves to
  nothing, so the fence exited 127 on a file that existed. It fails loudly, which is the good case —
  but write every path in a fence relative to the directory the fence actually runs in, and read the
  fence once as if you were the shell.

### 2026-08-20 — a `permanent` disposition is the only one nothing ever sweeps

`adr-debt` resurfaces `(deferred: …)` at every `/quality-harness:adr-write`. It never resurfaces `(permanent: …)`,
by design. So a `permanent` tag whose REASON is wrong does not merely mislead a reader — it removes
the item from every future sweep, and nothing will ever bring it back.

Measured: an ADR shipped `(permanent: MCP is request/response here; a server cannot wake a session)`.
The transport carries server-initiated notifications, the library in `go.mod` exposes three methods
for sending them, and the repo calls none. The capability was ruled out forever on a premise nobody
checked, and the maintainer described that same capability as the point of the product an hour later.

The rule: **`permanent` requires a checked fact, not a recollection.** If the reason is a technical
impossibility, open the library, the transport, the API — and cite `file:line` or the version. If
you cannot check it inside a minute, it is `deferred`, because `deferred` is recoverable and
`permanent` is not. Reserve `permanent` for boundaries you are CHOOSING ("this ADR is about X, not
Y"), which are decisions and cannot be factually wrong.

### 2026-08-20 — an ADR built on a design comparison must record what tried to kill it

Three independent gate designs were generated, cross-critiqued, and one was picked by a judge with a
written rationale. Two adversarial reviewers then killed it, independently and for the same reason:
its central predicate blamed the wrong knob whenever a knob was already inert at baseline, producing
13 false alarms — one of them on the shipped compose stack.

A judge picks the best of what it was shown. It does not attack. If the Decision came from a
comparison, the ADR's Alternatives section records the WINNER and the Risks section records what the
adversarial pass found — including, when it happened, that the first winner was withdrawn. An ADR
that reads as though the right answer was obvious is hiding the evidence that makes it trustworthy.

### 2026-08-20 — a review finding is a hypothesis, not a work order

Twenty-odd findings arrived from independent reviewers in one session. Most were right and two were
wrong in instructive ways: one called a deliberate, commented safety skip an "unvalidated bypass",
and one read a documented calibration constant as evidence a knob was inert. Acting on either would
have removed a guard whose comment records the incident that motivated it.

So: **check a finding against the code before fixing it**, and record the refutation in the ADR
beside the findings you accepted. An Alternatives entry reading "raised as blocking; refuted, here
is why" is worth as much as the fixes — it stops the same finding being re-raised and re-actioned by
the next reviewer, who will also read the code and also see something surprising.

The corollary, which cost more: **an empty reviewer response is a FAILED review, never a clean one.**
Five reviews were dismissed as empty because the check for "did it reply" looked for a marker that
output format does not emit, and because logs were read while still being written. Two of the five
contained live defects in already-merged code. Before concluding a tool produced nothing, prove the
detector can see a success — run it against a known-good output first.

### 2026-08-20 — fix the instance, then audit the class by RUNNING it

One tool took a scope argument verbatim instead of resolving it, and leaked one project's data into
another. Fixing that tool answered nothing about the seven others with the same shape, and reading
them could not settle it: some took the argument raw deliberately, for reasons their comments
recorded. Executing the same question against each — two projects, one workspace, does naming no
scope show me the other's data — found three more leaks, one of them disclosing a verbatim source
line from another repository.

The rule: when a defect comes from a shared shape rather than a typo, enumerate the siblings and run
the question. Reading tells you which are candidates; only running tells you which are defects. And
write the audit as a test over the CLASS, so the next sibling added is asked the same question
without anyone remembering to ask it.
