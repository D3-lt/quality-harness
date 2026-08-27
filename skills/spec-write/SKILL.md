---
name: spec-write
description: Discover and write verifiable requirements before design or implementation. Use when the user invokes `/quality-harness:spec-write`, asks for a spec/use cases/BDD scenarios, or brings a feature idea too ambiguous to plan; use grill-only mode to audit an existing plan, ADR, or PR description without editing it. Do not use when behavior is already decided and the task is bounded implementation or ADR retirement.
---

# Spec Write

Turn a fuzzy idea into a decision-ready, machine-verifiable spec: grill mints **facts** (falsifiable
assertions bound to tests), not paragraphs. The most expensive failure is building the wrong thing
well; the second most expensive is a decision that evaporates into prose a later model re-interprets.
Chain position: `/quality-harness:spec-write` → `/quality-harness:adr-write` → `/quality-harness:adr-execute`.

Template is source of truth — read `${CLAUDE_PLUGIN_ROOT}/templates/spec-template.md` fresh before authoring; do
not restate from memory. The executable gate is `spec-verify` (exit 0 = gate passes).

## When to use

- New feature or behavior change where requirements are not yet decided.
- User asks for spec / requirements / use cases / acceptance scenarios.
- Before an ADR whose Decision would otherwise rest on unstated assumptions.

Skip for: single-file bug fixes, pure docs, dependency bumps, or work with an already-accepted
spec/ADR.

## Audit the class, not the instance

A requirement discovered from one example is a rule about a class of inputs. A
scenario written for the example passes for the example and says nothing about
its siblings — which is exactly how a spec ships green and the bug reappears
under a different name.

For each Fact, before writing scenarios:

1. **State the class the Fact governs.** "Any path the gate cannot read", not
   "a missing file".
2. **Enumerate the members** — the boundary values, the error shapes, the
   platforms — with a query or a list, not from memory.
3. **Write the scenario against the class**, and name the members it covers.
   Where one member behaves differently, that is a second Fact, not a footnote.

A Fact whose class you cannot state is not yet a requirement; it is one
observation, and it should say so rather than pretending to generality.

## The Fact lifecycle

Every behavioral decision becomes a Facts-table row: `F-n | assertion | test | tag`.

- **@draft** — decided (in scout or grill), no test bound yet (`— to bind` allowed).
- **@spec** — test committed and collectable; it MAY FAIL — that is the TDD red state. Required for
  Ready-for-ADR.
- **@implemented** — test passes; flipped during /quality-harness:adr-execute, never during spec writing.

## Workflow

### Stage 0 — Scout (mints facts, not notes)

Explore codebase, docs, prior ADRs/specs first. **Anything discoverable is never asked** — grep and
read instead of interviewing. Everything established from the repo lands directly as a Facts row:
`F-n | assertion | evidence: file:line | @draft` (evidence path sits in the Test column until a test
is bound). Show scouted facts to the user as one batch for veto — never ask them as questions.

### Stage 1 — Grill (every question is a proposed fact)

Interview the user about every unresolved aspect:

- **One question per message.** Never batch topics.
- **Each question is a PROPOSED FACT** with a sketched test binding, recommended answer first:

  > Proposed F-7: "A user has at most one active subscription." Enforced by
  > `tests/Feature/SubscriptionTest.php::test_single_active_subscription`.
  > (Recommended: accept — CheckoutService.php:88 already assumes it.) Accept / amend / reject?

  Accept → row lands @draft with the sketched binding. Amend → user's wording becomes the
  assertion, test sketch adjusted, then lands. Reject → becomes a Non-Goals bullet or glossary line.
- A question that cannot be phrased as a falsifiable assertion is either **non-behavioral** (naming,
  sequencing, ownership — allowed; Grill Log Fact cell = `non-behavioral`) or **not yet decomposed**
  — split it and re-ask the parent first.
- **Walk decision branches in dependency order** — resolve a parent decision before its children.
- **Coverage checklist drives the stop** — grill until each maps to ≥1 Facts row or an explicit
  `None — <reason>`: actors · trigger + goal per use case · edge/failure paths · invariants ·
  non-goals · contracts touched · risks · success criteria.
- **The grill ends mechanically:** run `spec-verify --draft <spec>` and paste the output. User says
  "enough" → unanswered items become Open Questions rows, each naming the @draft fact it blocks;
  status stays below Ready-for-ADR (the script enforces this, not a promise).
- Grill Log records `# | Question | Fact | Decision(one line)` — the fact row carries the substance;
  the log is only an audit trail. spec-verify rejects log rows citing no Fact ID.

### Stage 2 — Use cases

One `UC-n` per actor-goal: trigger, preconditions, main flow, failure paths, postconditions. Every
failure path must reappear as a `[failure]` scenario.

### Stage 3 — Scenarios

Markdown Gherkin is the human-readable layer; the bound test is the executable truth. Heading
grammar is parsed by spec-verify — keep it exact:
`### UC<n>-S<m> [happy|failure] <title> [@tag] → `path::name``
≥1 `[happy]` + ≥1 `[failure]` per UC. A failure Then is explicit — never silent. Do NOT adopt
cucumber/behave — the Gherkin never executes; the bound test does.

### Stage 4 — Domain

Entities, relationships, state machines, ubiquitous language — implementation-free, ≤5 lines.
Invariants do NOT live here — they are Facts rows. Storage/schema detail is deferred to ADR/
implementation time.

### Stage 5 — Bind (Draft → Ready-for-ADR)

For every @draft fact and scenario: commit a collectable test stub — **failing is fine, that is TDD
red** — and flip the tag to @spec. Then run `spec-verify --spec <spec>`; Status may become
Ready-for-ADR only on exit 0. Paste the run into the conversation.

### Handoff

Save to `docs/specs/YYYY-MM-DD-<topic>.md` (project convention overrides). Stop for user review. On
acceptance → `/quality-harness:adr-write`: the ADR carries a `Spec:` header pointing here and inherits Contracts/
Non-Goals/Risks by reference (deltas only); tasks carry `Covers:` fact/scenario IDs.

## grill-only mode

`/quality-harness:spec-write grill-only <doc|plan|PR>`: run Stages 0–1 against the named target and emit a
**facts-coverage diff**: which checklist items have zero facts, which facts have no test binding,
which scenarios have no failure sibling, plus an Open Questions list. No spec authored.

## What a complete spec contains (checked by `spec-verify`, not by promise)

These are the spec's own quality bar. `spec-verify` reports on them so the claim is mechanical
rather than remembered; a finding you leave open is one you should name and justify, not one to
work around.

- Run `spec-verify --draft` before the grill closes and `--spec` before Ready-for-ADR; paste both.
- Every UC has ≥1 [failure] scenario; every scenario heading parses; Facts table non-empty; every
  Grill Log row cites a Fact ID or `non-behavioral`; Open Questions empty at Ready-for-ADR.
- No implementation detail (schemas, storage, algorithms) in the spec — but every behavioral
  decision MUST bind to a test ID. Test bindings are contracts, not implementation.

## Red Flags — STOP, you are rationalizing

| Excuse | Reality |
|--------|---------|
| "Requirements are already clear" | Clear to you ≠ decided by the user. A short grill is cheap; a wrong build is not. |
| "Happy path is enough for v1" | Failure paths are where drift and compliance bugs live. |
| "I'll bind tests after the ADR" | An unbound fact is prose — it will be re-interpreted. Bind the red test now. |
| "This decision doesn't need a fact" | Then it is non-behavioral — log it as such, or decompose it until it is falsifiable. |
| "User is in a hurry — skip the grill" | The grill is the shortcut. Ask fewer, better proposed facts — don't ask none. |
| "This question is answerable from the code" | Then it must not be asked — Stage 0: scout it into a fact with `evidence: file:line`. |
| "spec-verify is too strict here" | The gate failing IS the information. Fix the spec, not the gate. |

## Lessons

Append-only, dated.

- **2026-08-22 — Stage 5 says "commit a collectable test stub, failing is fine" and never says WHERE.**
  Ten deliberately-red tests were committed onto the branch that also carried an urgent CI fix, which
  made both CI lanes red and would have blocked the deploy that fix existed for. Red tests are correct
  and they belong on their OWN branch until the ADR turns them green. Before binding, ask what else is
  riding on this branch — if anything on it needs to ship before the ADR lands, cut the spec branch
  first. The corollary: a spec marked Ready-for-ADR whose bound tests are absent from the tree fails
  its own gate, so the spec document travels WITH its tests, not separately.

## Output

- Path of the spec file + the pasted `spec-verify` run (mode + exit code).
- Status (Grilling / Draft / Ready-for-ADR), Facts count by tag, UC count, scenario count
  (happy/failure split), Open Questions count.
- `Ready for /quality-harness:adr-write` only after `spec-verify --spec` exits 0 AND the user marks the spec
  Ready-for-ADR.
