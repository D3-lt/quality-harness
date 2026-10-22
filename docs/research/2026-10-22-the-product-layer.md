# Field notes: the product layer

**Retrieved 2026-10-22.** What the established methods say a product is made of, what makes one well designed, and how
product management and the agent-era spec tools encode it; then where this plugin stands against it.

**These are the sources' claims, as reported.** Three read-only research passes collected them on 2026-10-22; nothing was
reproduced here. A claim marked *secondary* came from a summary, not the primary text. Follow the link before resting a
decision on it.

Why now: the owner read pdd-kit (github.com/itai-gendler/pdd-kit), a toolkit that keeps a product model beside the code, and
asked for the direction rather than a copy: "pdd showed us the gaps, not necessary to copy exactly as pdd does, but keeping the
direction."

---

## 1. What a product model is made of

Seven parts recur across strategic DDD, capability maps, story mapping, JTBD, impact mapping, opportunity solution trees,
arc42 and C4:

| Part | Where it recurs | Durable? | Can a machine check it? |
|------|-----------------|----------|-------------------------|
| Goals and outcomes, each with a metric | impact map "Why" (impactmapping.org/drawing.html); OST root (producttalk.org/opportunity-solution-trees); arc42 §1 (docs.arc42.org); JTBD outcome statements, "minimize/increase … metric" (ilp.mit.edu/node/13140) | yes; solutions churn, goals do not | only that a goal names its metric |
| Actors and their jobs or journeys | impact map "Who"; journey maps (nngroup.com/articles/customer-journey-mapping); story-map backbone (jpattonassociates.com/the-new-backlog); C4 persons | the backbone and journey phases are; release slices are not | structure only |
| Capabilities: what, not how | capability maps, about three levels, mutually exclusive and collectively exhaustive (bizzdesign.com, design principles for capability maps part 2); story backbone; job map (strategyn.com/jobs-to-be-done) | yes; slower than the processes that deliver them | no standard checker found |
| Context and boundaries | bounded contexts and context maps, nine relationship patterns (github.com/ddd-crew/context-mapping; martinfowler.com/bliki/BoundedContext.html); arc42 §3; C4 context and containers (c4model.com) | yes | yes: Structurizr inspections fail an element with no view or no decisions (docs.structurizr.com/workspaces/inspections); ArchUnit tests dependencies (archunit.org) |
| Glossary, the ubiquitous language | arc42 §12; the Bounded Context Canvas (github.com/ddd-crew/bounded-context-canvas); Business Rules Manifesto 3.2 | yes | structure only |
| Business rules with executable examples | Business Rules Manifesto v2.0: "a first-class citizen", declarative, distinct from enforcement (brcommunity.com/brg/BRManifesto.pdf); DMN decision tables, executable, with gap and overlap checks (omg.org/spec/DMN); specification by example, "living documentation" (Adzic, *Specification by Example*, 2011); Gherkin `Rule` (cucumber.io/docs/gherkin/reference) | yes, because CI runs it | **yes**: the examples run |
| Decisions, assumptions, open questions | arc42 §9; the canvas; OST assumption tests | decisions yes; assumptions until tested | structure only |

Traceability in practice is checked only from requirement down to code and test (OpenFastTrace, `req~name~rev` with
`Needs: impl|utest`, github.com/itsallcode/openfasttrace); no standard tool traces goal to capability.

## 2. What makes a product well designed

Twelve concerns a spec should state, or mark not applicable with a reason, each with how it is proven:

| Concern | The artifact | Proven by |
|---------|--------------|-----------|
| Outcome | HEART goal, signal, metric (research.google/pubs/pub36299, abstract; details *secondary*); a north-star metric with 3 to 5 inputs (amplitude.com, North Star) | analytics or an experiment |
| Guardrails | metrics that must not regress; Spotify ships only on non-inferiority across every guardrail (engineering.atspotify.com, 2024-03) | a statistical test |
| Quality scenarios | SEI's six fields: source, stimulus, artifact, environment, response, response measure (quality.arc42.org/articles/specify-quality-requirements), one per relevant ISO/IEC 25010:2023 characteristic (nine, safety new; quality.arc42.org/standards/iso-25010; the ISO text itself was not reachable) | a test or monitor on the measure |
| Reliability | SLI, SLO with window, percentile, threshold and scope; error budget policy (sre.google/sre-book/service-level-objectives; sre.google/workbook/error-budget-policy) | an SLO monitor |
| Performance budget | quantity, milestone timing, rule-based (web.dev/articles/performance-budgets-101) | CI (Lighthouse CI, bundle size) |
| Accessibility | WCAG 2.2, level A, AA or AAA (w3.org/WAI/standards-guidelines/wcag); ACT rules (w3.org/WAI/standards-guidelines/act) | automated in part (a vendor reports 57% of issues found, by issue count, deque.com), plus a manual audit |
| Security | the four questions of the Threat Modeling Manifesto (threatmodelingmanifesto.org) | review; the mitigations get tests |
| Data | FIPS 199 classification (csrc.nist.gov/pubs/fips/199/final); purpose, minimisation, retention (GDPR Art. 5 and 25, gdpr-info.eu) | a retention test or job, plus review |
| States | empty (three kinds), loading, error, permission per view (carbondesignsystem.com, empty-states pattern) | component or visual tests |
| Internationalisation | language, direction, characters, locale formats (w3.org/TR/international-specs); pseudo-localisation (learn.microsoft.com) | pseudo-locale tests |
| Operability | telemetry signals, runbook, owner (opentelemetry.io/docs/concepts/signals; AWS Well-Architected pillars) | a check that telemetry is emitted, plus review |
| Cost | a unit-cost ceiling (AWS Well-Architected, cost optimisation) | a billing alert |

A Definition of Done is "the state of the Increment when it meets the quality measures required for the product", and work
that does not meet it is not released (scrumguides.org/scrum-guide.html); a Definition of Ready is entry criteria, usually
INVEST (agilealliance.org glossary). Each DoD item can be a CI check or a review checkbox.

## 3. Product management, and how the agent-era tools encode it

- **Four risks** before building (svpg.com/four-big-risks): value, usability, feasibility, business viability, each with an
  owner. Continuous discovery: weekly interviews and assumption tests from a clear outcome (producttalk.org/2021/08/product-discovery);
  five assumption types: desirability, viability, feasibility, usability, ethical (producttalk.org).
- **Framing:** Amazon's PR/FAQ (Carr and Bryar, *Working Backwards*; *secondary*); a Shape Up pitch: problem, appetite,
  solution, rabbit holes, no-gos (basecamp.com/shapeup/1.5-chapter-06).
- **Experiments:** "We believe … will result in … we will know we have succeeded when …", with the signals fixed before the
  test (thoughtworks.com, hypothesis-driven development); kill criteria (Annie Duke, *Quit*, 2022; wording not found).
- **Feature flags as inventory:** release, experiment, ops and permission toggles, each with a removal task and an expiry, and
  a test that fails after it (martinfowler.com/articles/feature-toggles.html).
- **EARS** requirement shapes: ubiquitous, while, when, where, if-then (alistairmavin.com/ears).
- **The tools.** spec-kit keeps a constitution and per-feature spec, plan, research, data model, contracts and tasks; its gates
  are the model reviewing itself (github.com/github/spec-kit/blob/main/spec-driven.md). Kiro writes requirements in EARS, then
  design and tasks, with phase approvals and property-based tests in its IDE (kiro.dev/docs/specs). OpenSpec keeps a living
  `openspec/specs/`, writes each change as ADDED/MODIFIED requirement deltas, and its `validate` is executable: structure, a
  MODIFIED requirement against the one it replaces, a change with no deltas, every task ticked before archive; `archive` merges
  the deltas and rolls back on failure (github.com/Fission-AI/OpenSpec, docs/cli.md). BMAD splits analyst, PM, architect and
  scrum-master roles, with an LLM readiness gate (*secondary*). pdd-kit keeps `product-model/` and verifies by the agent reading
  the code, "never run it".

**Across every tool surveyed, the constitution and readiness gates are the model checking itself; none executes them.** The
executable checks that exist are structural (OpenSpec's validate) or examples that run (Kiro's property tests, Gherkin, DMN).

## 4. Where this plugin stands

| The field has | This plugin today | The gap |
|---------------|-------------------|---------|
| A durable product model (capabilities, journeys, rules, glossary, outcomes) | specs are per change (`plugin/templates/spec-template.md`); `docs/architecture.md` is a module map of the code | no product layer at all |
| Business rules as executable examples | Facts bound to tests, run by `spec-verify --implemented` | close; but `--implemented` runs only `@implemented` rows, and a `Cmd: true` override passes without proof a test ran (the cold review of ADR-123, 2026-10-22; `plugin/bin/spec-verify:530`, `:839`) |
| Deltas merged into a living spec, validated | a spec ends at `@implemented`; nothing merges it into a whole | no merge, no delta validation |
| Outcomes with a metric, guardrails, criteria fixed before the result | Goal is prose | no metric, no pre-registration (ADR-112 pre-registers for experiments; specs do not) |
| The twelve quality concerns, stated or not applicable | Non-Goals and Risks, free form | no checklist; nothing asks for accessibility, data, states, operability |
| The four risks and assumption tests | Risks, free form; scout facts | no risk lens; assumptions not typed or tested |
| Grill in rounds of the frontier (pdd-kit) | one question per message (`plugin/skills/spec-write/SKILL.md:74`) | cadence |
| Architecture quality goals and scenarios (arc42 §1, §10) | module map, contracts, trust boundaries | no quality scenarios with response measures |
| Executable gates | adr-lint, adr-verify, spec-verify, mutants, outside runs | **this plugin's edge**: the field's gates are self-review |

## 5. What to keep of the direction

Keep the direction pdd-kit points (a product model beside the code, changed with it) and the field's agreement on its parts,
and keep this plugin's difference: a claim is a check that can fail. Concretely:

1. A living product model, `docs/product/`, in the seven parts above; rules are Facts bound to tests, and the rest is checked
   for structure (every capability has a rule, every journey names existing capabilities, every goal names a metric).
2. A spec becomes a change to that model: its Facts and capabilities are deltas (added, modified, retired), and completing it
   merges them, validated as OpenSpec validates.
3. The spec template asks for the outcome (goal, signal, metric, guardrails, success and kill criteria committed before the
   result), the four risks with typed assumptions, and the twelve concerns, each stated or marked not applicable with a reason.
4. spec-write grills in frontier rounds, with the four risks and the twelve concerns as its coverage checklist.
5. The architecture template gains quality goals and scenarios with response measures, and a context map.
6. spec-verify runs every active rule and refuses to call a rule passed without proof its test ran.

Left out on purpose: blueprints (the owner, 2026-10-22); prioritisation scoring (RICE, Kano) and roadmaps, which are judgement
a gate cannot check; review-only judgements (value, viability, enough evidence), which stay with the people who own them.
