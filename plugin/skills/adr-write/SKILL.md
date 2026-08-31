---
name: adr-write
description: Create a proposed, executable decision record for a durable technical choice. Use when the user asks for an ADR or when work changes a public contract, persistent state, trust boundary, cross-component ownership, or costly-to-reverse architecture. Do not use for bounded implementation, open-ended requirements discovery, or ADR retirement.
---

# ADR Write

**Resolving `${CLAUDE_PLUGIN_ROOT}`.** Paths below use it. If it reaches you as
literal text rather than a directory, this skill was loaded under its bare name
from a personal skills directory — which is not a plugin, so the placeholder is
never substituted there. Run `qh-root` and use what it prints in place of it.

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
- **`node ${CLAUDE_PLUGIN_ROOT}/scripts/adr-state.mjs`** prints what governs what as it stands now,
  supersessions already applied, plus the areas two accepted decisions both claim, the decisions
  nothing points at the code, and the supersessions whose replacement is missing. It is derived from
  the corpus rather than maintained beside it, so it cannot drift; it reads, judges nothing, and
  exits 0 whatever it finds.
- **`node ${CLAUDE_PLUGIN_ROOT}/scripts/adr-context.mjs <path>...`** over the paths this decision
  would touch returns the governing records **and the graveyard** — the superseded and withdrawn
  decisions about the same code. Re-proposing an approach the team already killed is invisible from
  the diff, and this is the only place it is written down.
- **Read the active ADR catalog, then search the governing decisions it names for what your decision
  changes.** The compact catalog may link both active ADRs and still-governing archived ADRs. Do not
  recursively load archived task logs or lint history. If you are removing, renaming, or re-scoping
  something — a family of arms, a contract, a default — another governing ADR may consume it, and a
  pre-registered criterion two documents away can be silently invalidated by a choice that looks
  local. Reconcile any authority change in the active/catalog sidecars in the same commit; never
  rewrite a frozen archived record.

## Audit the class, not the instance

The change in front of you is one member of a set. A record that names only that
member leaves every sibling ungoverned, and ungoverned is invisible — nothing
reports the twelve call sites the decision was about but never mentioned.

Before writing `Governs:`, do three things and put the result in the record:

1. **Name the class in one sentence.** What property makes something a member?
   "Every gate that spawns a subprocess", not "adr-lint".
2. **Enumerate it with a command, not from memory.** A `grep`, a `glob`, a
   `adr-context` run — something the next reader can re-run and get the same set.
3. **Record the command and the count.** A `Governs:` of nine paths that came
   from a repeatable query is a claim someone can check. Nine paths that came
   from recall is a guess with a colon after it.

Members you deliberately leave out are part of the decision: name them and say
why. Silence reads as "there were none", and that is the failure this exists to
stop.

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
   classified as `(permanent: boundary: <reason>)` for a choice this ADR owns or
   `(permanent: fact: <claim>; citation: <typed receipt>)` for an external premise. Debt is
   surfaced at authoring time, never silently carried.
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


## What a complete record contains

These are the record's own quality bar, checked by `adr-lint` so nobody has to take your word for
it. Each one exists because a record missing it could not be executed or could not be proved. Write
the record so they hold; where one genuinely does not apply, say so in the record itself rather than
leaving the reader to guess.

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
- Run `adr-judge <adr.md>` too and paste the run. It checks the two axes a schema cannot see —
  whether the record rests on anything observable, and whether a reader in a year will know what was
  decided. It never blocks and never can: these are heuristics about prose, and a model verdict must
  never enter this corpus's evidence chain. Close what is real, or say in the record why it stands.
  `adr-judge --rubric` prints the questions rather than answering them; read the record against them
  yourself when the rules pass but the decision still feels thin — that is the judgement the rules
  cannot make, and you are the one qualified to make it.
- Run `adr-lint <adr.md>` before presenting the ADR and paste the run; present any finding you did
  not close, with your reason. Mechanically checked: Status, Spec
  header, Alternatives ≥1, Wiring non-empty, Out of Scope dispositions, task sections/headers,
  bash-fence Acceptance, TDD step 1, README↔task-file consistency, task-DAG cycles,
  wave/order-vs-dependency ordering (Depends-on + Consumes edges), Verification Log grammar +
  README `done` ⇔ matching exit-0 adr-verify entry, spec coverage. Still
  review-enforced (the lint does NOT check them): primitives audit, C4/bounded-context, Rollback,
  `None — <reason>` completeness — verify these by reading, don't assume the exit code covers them.
- **Contract coupling scan is mandatory at any size.** If task A's `Produces` matches task B's `Consumes`, A must complete before B regardless of grouping. `adr-lint` catches the edges it can see (T-id refs and backticked tokens in `Consumes` matching a sibling's `Produces`) — write `Consumes` with the producing task's id in parens (`Resolver.resolve() (T2)`) so every edge is machine-visible; prose-only contract references are invisible to the gate.
- **Out of Scope entries carry a disposition** — use `(permanent: boundary: <reason>)` for a
  limit this ADR chooses, `(permanent: fact: <claim>; citation: <typed receipt>)` for an external
  premise, and `(deferred: <pointer>)` for punted work. A typed receipt is `file` followed by a
  backticked `<repository-path>:<line>`, `version` followed by a backticked `<name>@<version>`, or
  `url` followed by `https://<host>[/<path>]`. `adr-lint` advises on legacy `(permanent)` /
  `(permanent: <reason>)` spellings without changing their permanent meaning; `adr-debt` sweeps
  only deferred entries so they resurface.

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

Append-only and dated, in [references/lessons.md](references/lessons.md). **Read it before deciding
what a record must contain**, or when a section feels like a formality — every entry is there
because a record that skipped it cost something later.
