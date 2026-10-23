# Kinds and a graph: one reader per artifact, evidence collectors in a registry

**Status:** Idea, endorsed by the owner, 2026-10-23 ("this sounds promising … save this as a separate idea doc"; on the
strengths-and-dimensions reasoning: "I like this approach, seems reasonable thing to do. it would gain new strength to this
product"). Not yet a decision: it becomes one as an ADR (proposed as ADR-129, after 3.8.54 ships and ADR-128 is decided).

## The idea in one paragraph

Each artifact kind the lifecycle uses (product model, spec, ADR, task, architecture, evidence) gets one deterministic
module that parses it into a typed model, validates it, and names the ids it defines and references. One graph runtime
loads every kind, resolves the references (spec fact → task `Covers` → test → evidence row → release), and answers every
question a reader asks today: derived status, the next action, what governs a path, may this be released. Evidence is
gathered by small collectors, each registered with its inputs, its output, its cost budget and its own tests, so a new
kind of evidence is one module, one registry line and one test, never an edit to a hook or a gate. Skills stay the
authoring side (spec-write, adr-write, adr-execute, arch-write); the kind modules are the checking side.

## Why: what the current shape costs (measured 2026-10-23 in this repository)

- **The same artifact is read in many places, in three languages.** A record's `Status:` line is parsed in 7 code files
  and mentioned in an eighth (a comment in `corpus-probe.mjs`), across Python gates, the shared Python lib and Node scripts
  (corrected 2026-10-23 by the qh-core session's baseline, which counts the spelling `\*{0,2}Status` too); a task README table by `adr-lint` and `adr-next` (Python),
  `work-next`, `decision-corpus` and `trajectory-metrics` (Node) and a shell dispatcher. The plugin is 24 Python gates, 68
  Node scripts and 27 Go core files. A test exists only because the readers drift (`every reader gives one Status the same
  reading`).
- **Parity between languages is where the defects were.** In one release: Node's `trimEnd()` dropped a U+00A0 Go kept; a
  Python child under `-I` decoded stdin as cp1252 on Windows; R2's upstream rule had to be written twice and kept equal by
  hand, and nine review rounds found nine spellings of it (BACKLOG §411, §416, §420).
- **Tests take long and concentrate.** The last full selftest: 2,759 tests in 311 files, 2,310 s of test time (about 272 s
  of wall clock at the default concurrency); 16 files hold half of it, led by the sharded publish suite (214 s), the test
  locks (118 s), observed-events (93 s), the gates (92 s) and lifecycle (84 s). Most of that is spawning a real hook or gate
  per case, because the logic is reachable only through its process.
- **Hooks cost time per event.** Median durations in one session (`scripts/hook-footprint.mjs`): SessionStart 1,254 ms,
  PreToolUse 210 ms, UserPromptSubmit 91 ms, each paid on every event of every adopter session (CLAUDE.md §19).
- **The context carries noise.** The same session: 47 plugin outputs, about 4 acted on; the per-prompt branch-state line was
  70% of the plugin's characters (ADR-128's Context).
- **Adding a check means editing a hub.** A new piece of evidence touches a hook script, its Go twin, a gate, a golden and
  the release reader; a fix lands in several copies (`home_shown` is in eleven gates, BACKLOG §419).
- **Records cost an agent to read.** A record is a median 12 KB (about 3,000 tokens) and a task 9 KB, the largest 227 KB of
  tool-written logs; "Accepted" says decided, not built, and four Accepted records have no task done.

## The shape

| Layer | What it owns | Tested how |
|---|---|---|
| Kind module (`spec`, `model`, `adr`, `task`, `arch`, `evidence`) | parse → typed model + diagnostics; validate → findings (advise or block); ids defined and referenced | in-process unit tests over fixtures, no spawn; a parity test against today's reader before that reader is removed |
| Evidence collector (registered) | one observation: a check ran, a file was written, a review covered a range, a mutant was killed | its own unit tests and one catalogue mutant; its budget asserted |
| Registrar | the list of collectors: id, the kind it feeds, declared inputs (paths, events), output schema, cost budget, platforms | a test that every registered collector has tests, a mutant and a budget, and that nothing unregistered writes evidence (ADR-117) |
| Graph runtime | loads kinds, resolves references, derived status (Proposed → Accepted → In progress → Built → Superseded/Retired), next action, what governs a path, release readiness | queries over a fixture graph, in-process |
| Readers and gates (`adr-state`, `work-next`, `corpus-report`, `release-evidence`, the gates) | CLIs over the graph; no parser of their own | one end-to-end test each; the rest is the graph's |
| Hooks | call the collectors whose inputs changed (ADR-095's rule), say what the graph decides once per context (ADR-122) | the footprint and latency measured per release |
| Skills | authoring: how to write a spec, an ADR, a task | unchanged |

## What it would buy

- **One answer per question.** A status, a task's done-ness or a release's readiness is read once, so two readers cannot
  disagree, and a parity test retires itself when the old reader goes.
- **Smaller, faster tests.** A kind or a collector is tested in-process over fixtures; the spawned end-to-end tests shrink
  to one per entry point. The target is measured, not promised: the share of test time spent spawning, before and after.
- **Growth by registration.** A new evidence source is a collector: written, tested and budgeted alone, then registered.
  Nothing else changes, and the registrar's test refuses one without tests, a mutant or a budget.
- **Hooks that do less.** A hook runs only the collectors whose declared inputs changed, so its time per event follows
  what changed, not the size of the plugin.
- **Status that cannot lie.** "Built" is derived from evidence rows; an Accepted record with nothing built shows as such.
- **Agent reads that are small.** An executing agent reads the task and the record's decision card the graph serves, not
  the record's history.

## Where it lives: a separate repository, `qh-core` (the owner, 2026-10-23: "yes, separate repo, agreed. qh-core")

A Go module in its own repository: `kinds/<kind>`, `evidence/<collector>`, `graph`, one static binary per platform. The
plugin consumes it as a verified release asset (ADR-116 already fetches and verifies `qh`); the parity tests against today's
readers live in the plugin repository and run against the binary; the gates become thin CLIs over it, ported one kind at a
time with ADR-110's discipline (parity first, the old reader removed only when parity holds, no verdict changing on the way).
Two costs: two releases to cut, and a task dependency cannot cross repositories (`Depends-on` resolves inside one corpus), so
the boundary is a versioned contract (the ledger rows, the attestation schema, the graph's schema), never a shared task list.

**Licence.** The core and its contracts stay open (the plugin is public under MIT; what is published stays MIT; a change
applies to new code only): the core refuses commits, writes under `.git/`, and reads every file an adopter has, so it asks for
trust the open code earns; §18's outside runs depend on peers willing to run foreign code, and their classifiers refuse a
closed binary more readily than a script; and evidence nobody outside can verify contradicts the thesis in
`docs/research/2026-08-28-verification-is-the-bottleneck.md`. What fits a closed, paid layer is the platform the owner named:
a hosted graph across repositories, the adopter summaries (ADR-128 T4), ADR-121's learning across sessions, team views. The
platform's licence is decided when it has a shape, not now.

**Who would pay (open question, the owner's, 2026-10-23).** Not individuals: the open core serves them and is what spreads.
The buyer is whoever is accountable for what agents ship across many repositories and needs evidence rather than a transcript:
engineering and platform leads (what did agents ship this week, with which checks, reviews and outside runs), teams under an
audit or assurance regime (provenance for agent-written code; the prior art above is certification work), and harness or
agent vendors wanting a verification layer to embed. None of that is measured demand. The first evidence of value the product
can sell is its own number: the acted rate per finding (ADR-121 T1) and the escape rate (ADR-127) over adopters' corpora,
which ADR-128 T4 brings back. The honest order is: ship the open core, measure those two numbers on the adopters who already
run outside probes, and write the platform's Outcome (ADR-123's section: metric, guardrails, kill threshold) before building it.

## Risks and open questions

- **It is a rewrite, done as a strangler.** Each kind is ported alone, its parity test against today's reader is the gate,
  and a kind that cannot reach parity stays where it is.
- **Python gates are what adopters run today.** A gate rewritten in Go must keep its CLI, exit codes and output (the
  goldens hold them), and ship for every platform (ADR-116's release assets).
- **The registrar could become bureaucracy.** A collector's registry entry must be a few lines, checked by a test, or it
  will be skipped.
- **Order against the pending records.** ADR-121, ADR-123, ADR-124, ADR-127 and ADR-128 are open. This lowers the cost of
  executing all of them, which argues for it early; it also adds to the pile. A rule worth deciding with it: no new
  Accepted record until the oldest pending one has a task done.
- **First kind.** `task` with `evidence`: the most read, the most duplicated, and the one release readiness rests on.

## What is strong today, and what making each strength its own module would buy

The strengths, each with where it showed on 2026-10-23:

| Strength | Where it is | What it did today |
|---|---|---|
| Evidence is tool-written (ADR-117, the Verification and Mutation Logs, `checks.jsonl`, `reviews.jsonl`, attestations) | gates, `qh-check`, `host-review.mjs`, `attest-import` | `release-evidence` refused 3.8.54 three times, each time correctly: commits no review covered, a hand attestation that proved nothing, one unlisted binary |
| Every fix carries a killed mutant; a stale anchor is caught | `tests/mutations/`, `mutate.mjs --stale` | about 30 mutants added or re-pointed; four stale anchors caught before a commit; one mutant found measuring nothing since ADR-099 |
| Locked tests stay byte-identical | `test-locks.py`, the digests in task logs | caught one edit to a locked line |
| Could-not-look is never a pass (ADR-005) | every reader | UNPROVEN on the stale mutant, on a contended check, on a listing git could not give |
| A different-lineage review, recorded, and a release that refuses an uncovered commit | the launcher, `reviews.jsonl`, ADR-100/125 | about fifteen real defects found and fixed before the tag |
| An outside run on a platform we cannot run (§18) | `corpus-probe`, the attestations, a Windows peer | five real Windows failures, all confirmed against source |
| One landing, one run (ADR-126), the ruleset on main | `land.mjs`, `release.mjs` | nothing reached main unchecked |
| Decisions resolved against the corpus (`adr-context`, `Governs:`, the graveyard) | the ADR corpus | stopped a second decision of ADR-121's ledger and ADR-122's dedupe |
| A classifier is empirical, with code-again twins (§16) | the publish grammar, the scrubber, orphan-sweep | the twins are what each review round reached for |
| The safe direction is named (over-scrub, refuse-closed) | the scrubber, the refusals | each scrubber round failed toward hiding more, never less |

A pattern: every strength is a gate that catches, late and at the edges: at commit, at review, at release, on a peer's
machine. The weaknesses (BACKLOG §419, the read cost, the hook noise, the duplicated parsers, the test time) are costs paid
before any gate, on every turn. Making each strength a module moves it forward: the same check answers at task time, from
the graph, instead of at tag time, from a reader of its own.

What that buys, by the dimensions the owner named:

| Dimension | Today | What one module per kind buys | Measured basis |
|---|---|---|---|
| Agent level | A hook says a finding once per context; about 4 of 47 outputs acted on; the branch-state line is 70% of the text | Hooks answer from the graph: only a collector whose inputs changed runs, and the finding names the evidence it rests on; the acted rate is read from the ledger (ADR-121 T1, ADR-128 T4), so a rule that is not heard is retired on numbers | `hook-footprint`: 47 outputs, 19,997 chars, ~8% acted |
| Breakdown | The task is the unit of work, with its own fence and evidence; its status is a hand-typed README cell | A `task` kind with one reader; `Built` derived from evidence rows; a qualified `Depends-on` resolved by the graph, not by the lint alone | four Accepted records with no task done read as done work |
| Clarity | Decision, tasks, evidence and status live in one markdown tree; a task file grew to 227 KB of logs | Decision (frozen) · card (served) · task (executable) · evidence (ledger) · status (derived) are five things, each read by the one who needs it | median record 12 KB, task 9 KB, largest 227 KB |
| Product management | ADR-123 (pending) decides the model, the outcome and the Results table; nothing links an outcome to the evidence that the shipped change moved it | `model` and `spec` kinds with their own validators; the graph closes the loop outcome → spec → task → evidence → result, so "did it move the metric" is a query | ADR-123's eight tasks pending; no result row exists yet |
| Execution | `adr-execute`/`adr-verify` are strong; parity between Node, Go and Python is kept by hand; tests spawn a process per case | One implementation per rule in the Go core; kinds tested in-process; one end-to-end test per entry point | three parity defects in one release; 2,310 s of test time, 16 files holding half |
| Traceability | Partial and split: `Covers` → test by `adr-lint`; evidence → release by `release-evidence`; status by seven parsers | One graph; one reader per edge; every edge queryable both ways (what tests this fact; what fact does this test prove; what evidence lets this ship) | `every reader gives one Status the same reading` exists only because they drift |

What not to destructure, because it is already right or is process rather than structure:
- the three sanctioned refusals (CLAUDE.md §3): they stay in the hook path, outside any learned suppression;
- the review discipline (one round, one scoped verification, boundaries named): a process rule, not a module;
- the mutation catalogue: already one file per mutated source;
- test locks: already a tool-written digest; the graph reads them, it does not replace them.

Where it could cost more than it buys: a registrar that becomes paperwork (its entry must be a few lines, checked by a
test); a port that changes a verdict (the parity test is the gate); a sixth pending record on the pile (hence the rule
proposed above).

## Prior art (searched 2026-10-23; snippets, not full texts)

Each part is established on its own:
- **Traceability as code.** Doorstop keeps requirements and tests as files in the repository and checks their links; the
  RTEMS project chose it over database tools. Sphinx-Needs models requirements, specs and tests as linked items. Neither
  ties a link to tool-written evidence of a run.
- **Assurance cases from evidence.** Generating and regenerating GSN arguments from verification results is active research
  (an arXiv 2025 Eclipse pipeline; SRI's continuous assurance work, which names evidence generation as still mostly manual;
  knowledge graphs over evidence in a 2024 industry talk). That is the graph-of-claims-and-evidence idea, aimed at
  certification, not at an agent's session.
- **Typed evidence with a registry.** in-toto statements carry a predicate type, and its repository keeps a vetted list of
  predicates (SLSA provenance, SPDX, CycloneDX, runtime traces); a layout says which evidence a release needs. That is the
  shape of the collector registrar, for supply chains.
- **Agent harnesses.** Practitioners describe hooks as deterministic gates on an agent's "done", ADRs checked by a Stop hook,
  and verification design as the hard part. Most of it is blog posts, talks and skills; no measured study of whether hooks
  or ADRs change what an agent does was found.

What would be new is the combination and the measurement: one evidence graph that drives the agent inside its own session
(hooks answering from it, once per context), whose effect on the agent is measured per finding (ADR-121's ledger) and
reported back by adopters and peers on corpora this repository does not own (attested outside runs). The search found no
one doing that, which is a claim about what was found, not a proof that nobody has. `docs/research/2026-08-28-verification-is-the-bottleneck.md`
holds the earlier survey this builds on.

Sources: https://doorstop.readthedocs.io/en/v1.3/ · https://docs.rtems.org/docs/6.1/eng/req/tooling.html ·
https://arxiv.org/html/2511.14805v1 · https://sos-vo.org/node/83864/ · https://www.csl.sri.com/users/rushby/papers/sassur24.pdf ·
https://github.com/in-toto/attestation/blob/v1.0.2/spec/predicates · https://slsa.dev/blog/2023/05/in-toto-and-slsa ·
https://www.zenml.io/llmops-database/deterministic-verification-layer-for-ai-coding-agents ·
https://bitbytebit.substack.com/p/enforcing-invariants-in-ai-generated

## Measures to take before the ADR

1. Tokens an agent reads before its first edit on a task, from transcripts (the way `hook-footprint` reads hook output).
2. The share of selftest time spent in spawned processes, per file (`selftest-files.jsonl` carries the per-file time).
3. The number of code sites that parse each artifact, by command, so each port can show the count fall.
