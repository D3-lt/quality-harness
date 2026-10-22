# ADR-123: A living product model whose rules run, specs that change it, and the product concerns every spec states

**Status:** Accepted
**Date:** 2026-10-22
**Owner:** Zy
**Spec:** None — no spec stage; the owner's direction of 2026-10-22 over docs/research/2026-10-22-the-product-layer.md
**Cross-references:** docs/research/2026-10-22-the-product-layer.md, docs/research/2026-08-28-verification-is-the-bottleneck.md, docs/adr/ADR-112-the-lifecycle-is-measured-where-it-can-work.md, docs/adr/ADR-124-skills-for-every-host.md, plugin/skills/spec-write/SKILL.md, plugin/templates/spec-template.md, plugin/templates/architecture-template.md, plugin/bin/spec-verify, plugin/bin/arch-lint, plugin/scripts/work-next.mjs
**Governs:** `plugin/skills/spec-write/SKILL.md`, `plugin/templates/spec-template.md`, `plugin/templates/architecture-template.md`, `plugin/bin/spec-verify`, `plugin/bin/arch-lint`, `plugin/scripts/work-next.mjs`
**Enforced-by:** None — declared by its tasks; each adds one campaign mutation per mechanism.
**Invalidates:** none — checked: spec-verify's existing modes keep their meaning for an ordinary spec; a spec without the new sections is advised, not refused, until a project opts in (Decision 3).
**Served-path change:** a repository can keep a product model whose rules run as tests, a spec states its outcome, its four risks and twelve product concerns and records how it changes the model, spec-write grills in rounds, and the architecture document carries quality scenarios with measures.

## Context

**The owner's direction, 2026-10-22:** after reading pdd-kit, "use the good parts of it make ours better", then "do a bit more
research on product level, product architectures, composition, general parts of a well designed product, what it takes, product
management, and then we can refold those into our plugin skills and templates … not necessary to copy exactly as pdd does, but
keeping the direction." The research is `docs/research/2026-10-22-the-product-layer.md`, with every claim cited there. In short:

- **A product model has seven recurring parts** (strategic DDD, capability maps, story mapping, JTBD, impact maps, opportunity
  solution trees, arc42, C4): goals with a metric; actors and journeys; capabilities; context and boundaries; a glossary;
  business rules with executable examples; decisions and assumptions. Only the rules are executable in the field's practice;
  the rest is checkable for structure (every goal names a metric, every element is linked).
- **A well-designed product states twelve concerns** or marks each not applicable with a reason: outcome; guardrails; quality
  scenarios (six fields, ISO/IEC 25010); reliability; performance budget; accessibility; security; data; empty, loading, error
  and permission states; internationalisation; operability; cost.
- **Product management adds** the four risks (value, usability, feasibility, viability), typed assumptions with their tests, and
  success and kill criteria fixed before the result.
- **The agent-era tools** (spec-kit, Kiro, BMAD, pdd-kit) check their readiness and constitution gates by the model reviewing
  itself (Kiro also generates property-based tests from requirements); OpenSpec alone checks a change's structure mechanically:
  a change is a set of requirement deltas, validated against the living spec and merged.

**What this plugin does today:** a spec is per change (`plugin/templates/spec-template.md`: problem, goal, actors, use cases,
scenarios, Facts bound to tests, domain, contracts, non-goals, risks, open questions); nothing keeps the product whole. The goal
is prose. The architecture document maps the code (`plugin/templates/architecture-template.md`: module map, dependency contracts,
concept ownership, composition root, test doubles, trust boundaries). spec-write grills "one question per message"
(`plugin/skills/spec-write/SKILL.md:74`). Two ways spec-verify passed without a test running were fixed in bc2ab93e (a
do-nothing Cmd override; a runner that selected nothing).

### The class, enumerated

| Class | Command | Output (2026-10-22) |
|-------|---------|---------------------|
| A spec reader | `mrw read --stat --grep 'spec-template|Facts|Ready-for-ADR' plugin/bin/spec-verify plugin/scripts/work-next.mjs plugin/bin/adr-lint` | spec-verify, work-next, adr-lint (T2, T3, T4) |
| A spec status | `mrw read --grep 'Ready-for-ADR|Draft' plugin/scripts/work-next.mjs` | `specStatus` (:309) and the readiness reports (:338, :681); `Living` is unknown there (the cold review measured `specStatus` returning null) (T3) |
| An architecture reader | `mrw read --stat --grep 'Module Map|Trust & Data' plugin/bin/arch-lint` | arch-lint (T5) |

## Existing Primitives Audit

- **Facts bound to tests and spec-verify** are the product model's rules and their checker; no second gate is written.
- **The spec grammar** (use cases, scenarios, Facts, Open Questions, the Grill Log) is the model's grammar, with three sections
  added; a model is a spec whose Status is `Living`.
- **work-next's spec reports** gain the model's coverage reports.
- **arch-lint's section checks** gain two sections.
- **ADR-112's pre-registration** is the precedent for criteria fixed before the result; a spec's outcome follows it.

## Decision

1. **A living product model.** `docs/product/model.md`, from `plugin/templates/product-model-template.md`, Status `Living`, holds:
   Goals (`G-n`, each with a metric and its guardrails); Actors; Capabilities (`C-n`, what the product does, not how); Journeys
   (`J-n`, each naming the capabilities it uses, in order); a Glossary; Rules, the Facts table with a `Capability` column naming
   one `C-n` per rule; Context (the bounded contexts, pointing at `docs/architecture.md`); and Open Questions. A Living model
   carries no use cases or scenarios; its rules are its examples. Its rules are `@implemented` (what holds) or `@retired`; a
   `@spec` or `@draft` rule in a Living model is an error, because a model states what the product does, and planned behaviour
   lives in a change spec (Decision 2). *This fails if* a Living model passes with a rule that is not `@implemented` or
   `@retired`, or with a use-case section required of it.
2. **spec-verify judges a Living model.** `--spec` checks its structure: every capability has at least one rule; every journey
   names existing capabilities; every goal names a metric; every glossary term is defined once; every rule names an existing
   capability. `--implemented` runs every `@implemented` rule and passes a rule only on evidence its test ran: a runner's own
   summary of tests run (bc2ab93e's rules), and, in a Living model, a Cmd override passes only when its output carries that
   evidence too; one that exits 0 without it (`true`, `test 1 = 1`, `true; true`) is UNRUN, so no list of do-nothing commands
   decides. On a pass over a Living model, spec-verify appends a receipt (the digest of the Rules section, the commit, the
   verdict) to `model-runs.jsonl` in the repository's state directory; work-next reads it to name a capability no rule covers
   and a model not run since its rules changed. An ordinary spec is judged as before. *This fails if* a capability with no rule,
   a journey naming a missing capability, or a goal with no metric passes, or a rule passes whose test did not run.
3. **Every spec states what a product needs.** The spec template gains three sections. `## Outcome`: the goal it moves, the
   signal and metric, the guardrails that must not regress, the success and kill thresholds, and a Results table (date, metric,
   value, commit). spec-verify compares the thresholds as committed before the earliest Results row with the thresholds now, as
   ADR-112 compares a pre-registration with its data: thresholds added or changed after the first result are named. `## Risks` becomes the four risks, each with its typed assumptions (desirability, usability, feasibility,
   viability, ethical), the evidence for each, and the test chosen for the risky ones. `## Product Concerns`: the twelve
   concerns, each stated with how it is proven, or `N/A — <reason>`. spec-verify advises a missing section or a bare `N/A`;
   a project that sets `"productConcerns": "required"` in `.quality-harness.json` turns that advice into a finding. *This fails
   if* a concern marked `N/A` with no reason passes silently, or a spec whose thresholds were committed after its result is not
   named.
4. **A spec is a change to the model.** A spec in a repository with a model carries `## Model Delta`: the capabilities and rules
   it adds, modifies or retires, by id. When every rule the delta names is `@implemented` and passing, `spec-verify --merge <spec>`
   validates the delta (an added id is new, a modified or retired id exists, a modified rule's base text matches the model's),
   builds the whole merged model and runs Decision 2's structure checks over it, and only then writes it through a temporary
   file and a rename; otherwise it writes nothing and says why. *This fails if* a delta naming a missing id merges, a merge leaves
   a model that fails its own checks, or a merge that fails leaves the model half-written.
5. **spec-write grills in frontier rounds, over the whole checklist.** It keeps a tree of the open decisions; each round asks,
   numbered, every decision whose prerequisites are settled, at most seven, each a proposed fact with its test sketch and a
   recommended answer; a question that depends on another in the round waits; a fact the repository answers is looked up by a
   background scout and shown for veto, never asked; the coverage checklist adds the four risks and the twelve concerns; the
   grill ends when the frontier is empty. A `map` mode proposes a Living model for an existing repository, in rounds, written
   only on approval. *This fails if* a round asks a fact the repository answers or a question whose prerequisite is open.
6. **The architecture document carries quality.** The template gains `## Quality Scenarios` (one per relevant ISO/IEC 25010
   characteristic, six fields: source, stimulus, artifact, environment, response, response measure) and `## Context Map` (the
   bounded contexts and the relationship between each pair, from the nine patterns). arch-lint checks a scenario has all six
   fields and a numeric or observable measure, and that each context named in the model's Context exists here. *This fails if*
   a scenario with no response measure passes.

## Alternatives Considered

- **Copy pdd-kit's product model and its read-only verify:** rejected. The research shows every tool that verifies by reading is
  the model judging itself, which this project's founding research measures as the dominant false-success mode.
- **A separate product-model gate:** rejected. spec-verify already binds rules to tests and runs them; a second gate would
  duplicate the one mechanism that is executable.
- **Require the new spec sections everywhere at once:** rejected. Every adopter's existing specs would fail on upgrade; the
  sections are advised until a project opts in (Decision 3).
- **Prioritisation scoring (RICE, Kano) and roadmaps:** left out; judgement a gate cannot check.
- **Blueprints:** left out by the owner, 2026-10-22.

## Component / Boundary Impact

`plugin/templates/product-model-template.md` is added. spec-verify gains the Living status, the model's structure checks, the
`--merge` mode, the Outcome pre-registration check and the Product Concerns advice; work-next gains two reports; arch-lint gains
two sections; spec-write gains rounds and the map mode. No module is added to `docs/architecture.md`; each change sits in an
existing module.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `docs/product/model.md` | new optional artifact, Status `Living` | T3, T6 | spec-verify, work-next, spec-write |
| The spec template | `## Outcome`, the four-risk `## Risks`, `## Product Concerns`, `## Model Delta` | T2, T4 | spec-write, spec-verify |
| spec-verify | Living; structure checks; `--merge`; pre-registration; concerns advice | T2, T3, T4 | `qh-check`, CI |
| `model-runs.jsonl` in the repository's state directory | a receipt per passing `--implemented` run over a Living model | T3 | work-next |
| `.quality-harness.json` | `"productConcerns": "required"` | T2 | spec-verify |
| work-next | an uncovered capability; a model not run since its rules changed | T3 | the user |
| The architecture template and arch-lint | Quality Scenarios, Context Map | T5 | arch-lint |
| spec-write | frontier rounds; the risks and concerns checklist; `map` | T1, T6 | the user |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| The grill's round shape and checklist | T1 | T8 | No |
| The observed grill | T8 | T6 | No |
| The spec template's new sections | T2 | T4 | No — advised until opted in |
| The Living model and its spec-verify judgement | T3 | T4, T5, T6, T7 | No — new |
| `--merge` | T4 | T7 | No — new |
| Quality scenarios and the context map | T5 | T6 | No — new |
| The map mode | T6 | T7 | No |

## Implementation

See `tasks/README.md`.

## Consequences

- **Positive:** a repository can state what its product does and prove each rule by running it; a spec says what outcome it
  moves and what it must not break; the architecture says how good the product must be, measurably.
- **Negative:** more sections per spec; the concerns checklist is twelve lines even when most are N/A. A model is one more file
  a change must keep true, and spec-verify then fails a change that broke a rule.
- **Neutral:** an ordinary spec without the new sections keeps passing, advised.

## Out of Scope

- Blueprints (permanent: boundary: left out by the owner on 2026-10-22)
- Prioritisation scoring and roadmaps (permanent: boundary: judgement no gate can check)
- Serving the skills to other hosts (deferred: docs/adr/ADR-124-skills-for-every-host.md)
- Value, viability and enough-evidence judgements (permanent: boundary: they stay with the people who own them; the plugin asks for them and records them)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A Living model passes with a rule that never ran | Low | High | Decision 2 runs every `@implemented` rule on evidence (bc2ab93e); T3's tests include a no-op and a filter that selects nothing |
| Twelve concerns become boilerplate `N/A` | Med | Med | an `N/A` needs a reason; the grill asks them in rounds |
| A merge corrupts the model | Low | High | validate first, write through a temporary file and a rename, or write nothing |
| Adopters' specs fail on upgrade | Low | High | advised until opted in |

## Rollback

Each task is its own commit. The template and the model are files a user owns; reverting a task leaves an existing model as a
Markdown file nothing gates.

## Follow-ups

- [x] A cold Codex review of this record before acceptance (2026-10-22, twice: the first draft's seven findings and this draft's eight are folded in). Accepted by the owner on 2026-10-22.
- [ ] After T7: the release, with the outside run's attestation imported (CLAUDE.md §18).
