# ADR-062: A review is a host result

**Status:** Accepted
**Date:** 2026-09-22
**Owner:** zy
**Spec:** None — no spec stage. The owner chose, on 2026-09-22, a host port for reviews, with the reading role on Claude asking for haiku.
**Cross-references:** ADR-029, ADR-057
**Governs:** `plugin/scripts/host-review.mjs`, `plugin/workflows/quality-cycle.js`, `plugin/agents/qh-scope-reviewer.md`, `plugin/skills/quality-policy/SKILL.md`, `plugin/skills/work/SKILL.md`
**Enforced-by:** `tests/host-review.test.mjs::a host review is the schema or unavailable`
**Invalidates:** ADR-057 — the clause that quality-cycle's Codex role stays an inline agent
**Served-path change:** A Cursor, Codex, or Pi review enters quality-cycle as that host's JSON, and the scope role on Claude asks for haiku.

## Context

Quality-cycle can only spawn `agent()`. The Codex pass was therefore a `sonnet` role told to invoke the review skill and copy its findings into the schema, so the diff was read twice. The model names `opus`, `sonnet`, and `haiku` are Claude's classes. This session's harness is Cursor: `cursor --help` opens the editor, and `agent --help` (2026-09-22) is "Start the Cursor Agent", with `-p`, `--output-format json`, and `--mode ask` (read-only). Codex is a separate pin, `gpt-6-astra` plus an effort. Pi has no measured invocation on this machine (`command -v pi` printed nothing on 2026-09-22).

## Existing Primitives Audit

`quality-cycle` already requires `{ status, findings }`. `codex-review` already pins `gpt-6-astra` and `high`, `xhigh`, or `ultra`. This decision reuses that schema and that invocation. It does not add a fourth capability class.

## Decision

A host review is one JSON object: `status`, `findings`, `host`, `model`, `effort`, and `bound`. `bound` is `reported` only when the host's own output names the model. Otherwise it is `unproven`. An unproven bind does not by itself fail the review.

The coordinator runs `host-review.mjs` for `cursor`, `codex`, or `pi` and passes the object to quality-cycle as `externalReviews`. Cursor's runner is the measured `agent -p --output-format json --mode ask` invocation, with `--sandbox enabled`. No model is passed unless the caller names one. Quality-cycle does not spawn a model to fetch or translate it. If the caller asked for a host and no result for that host was passed, the cycle is `reviewer-unavailable`.

`codex` uses the invocation the review skill already specifies. A missing binary, an effort outside those three, or output that is not the schema is `unavailable`. `pi` returns `unavailable` and says the invocation was not measured, until a command that prints Pi's interface has been run. No argv is written down from memory.

On Claude, the scope role asks for `haiku`. Correctness and synthesis stay `opus`. The narrow fixer stays `sonnet`.

What would make this fail: quality-cycle with `codex: true` and no external result still spawning an agent whose label is `codex-external`. That call exists in the workflow today and the test can see it.

**Revision, 2026-09-22, before release (Codex review, xhigh, REQUEST CHANGES; the owner chose to fix all).** The first form did not review anything. The host was sent only "reply with one JSON object", with no repository scope, requirements, or evidence, so a clean answer said nothing about the change. `host-review.mjs` now takes `--scope`, `--requirements` and `--evidence` and sends them. A missing repository or scope is `unavailable` before any spawn. A host result is a review only when it is the whole schema: a status from the four, a `findings` array whose every entry carries `file`, `problem`, `impact`, `evidence`, `minimal_fix` and a `blocking` or `advisory` severity, with `blocking` status having a blocking finding and `clean` having none. Quality-cycle applies the same rule to `externalReviews` and answers `reviewer-unavailable` for any malformed entry. The documented commands in `quality-policy` and `work` omitted `--repo` and now name it and `--scope`. Still unmeasured: the shape of Cursor's `--output-format json` envelope. A result wrapped in an envelope fails the schema and reads as `unavailable`, which fails closed rather than certifying.

## Alternatives Considered

- **Keep the inline translator.** Rejected because it spends a second model to restate a result the host already returned.
- **Invent a Pi command line.** Rejected because a command that was not run is not a measured interface (CLAUDE.md §16).

## Component / Boundary Impact

None — the workflow and one script. Hooks are unchanged.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `externalReviews` | host JSON, or the cycle is unavailable | `host-review.mjs` | `quality-cycle` |
| scope `model` | `haiku` | the workflow and the agent file | Claude Code |

## Inter-task Contracts

None.

## Implementation

One change, in the files this record governs. Acceptance is `node --test tests/host-review.test.mjs` and `bash scripts/selftest.sh`.

## Consequences

- **Positive:** Codex and Pi can fill the same review result, and the reading role asks for the cheaper class.
- **Negative:** a machine with no measured Pi interface gets `unavailable` for that host.
- **Neutral:** correctness and synthesis stay `opus`.

## Out of Scope

- Moving git observation off the hook wait (permanent: boundary: the host waits for one JSON object, and this decision does not change that).
- Refusing a commit because a review has not finished (permanent: boundary: a review is not on the publish path).
- A version-pinned model id (permanent: boundary: ADR-029; the classes stay `opus`, `sonnet`, and `haiku`).
- Writing Pi's arguments before its interface has been executed (permanent: boundary: a command that was not run is not an interface).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Codex output is prose and the schema parse says unavailable | Med | Med | the runner asks for the schema; prose is unavailable, not a paraphrase |
| Scope review on haiku misses a design defect | Med | Med | correctness and synthesis stay opus |

## Rollback

Revert the commit. No stored format changes.

## Follow-ups

- [ ] Pi's review invocation, once a command that prints its interface has been run.
