# Task ADR-046-T6: ADR-046 names the ADR-012 §2 amendment

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** XS (one Invalidates paragraph; one existence test; both records still lint)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`qh-mcp` now raises `GateDidNotRun` for a completed UNRUN exit. ADR-012 §2 says completed runs return as ordinary content. This record is the work order and still `Accepted`; it names that it amends ADR-012 §2 for the could-not-run case — quotes the clause, says what still holds (findings of a run that did run stay on the content channel). ADR-012 is not rewritten (CLAUDE.md §10).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/adr/ADR-046-a-caller-relays-could-not-run.md` | edit | `Invalidates:` names the amendment and quotes ADR-012 §2 |
| `tests/gates.test.mjs` | edit | the sentence is present; `Invalidates: none` is gone |

## Ordered Steps

1. [S1] Bind the test to the quoted clause and the content-channel sentence. [proof: acceptance]
2. [S2] The Invalidates paragraph. [proof: acceptance]
3. [S3] `python3 plugin/bin/adr-lint` on this record and on ADR-045 exits 0. [proof: acceptance]

## Acceptance

```bash
node --test --test-name-pattern 'ADR-046 names the ADR-012' tests/gates.test.mjs && python3 plugin/bin/adr-lint docs/adr/ADR-046-a-caller-relays-could-not-run.md && python3 plugin/bin/adr-lint docs/adr/ADR-045-one-record-grammar.md
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `ADR-046 names the ADR-012 §2 amendment for a completed could-not-run exit` | `tests/gates.test.mjs` | `Amends ADR-012 §2`; the quoted completed-run clause; findings of a run that did run stay on the content channel; `Invalidates: none` is gone | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the Invalidates paragraph |
| 2 — something selects it | adr-lint reads the header |
| 3 — the caller can discover it | the record is the work order a session reads |
| 4 — it is used | the existence test and both lints |

## Mutation Log
- 2026-09-12 · fa27ad5* · mutant killed · exit 1 · `docs/adr/ADR-046-a-caller-relays-could-not-run.md` · Invalidates none hides that this record amends ADR-012 §2 for a completed could-not-run exit · acceptance-sha256:9972a59b24bafd13d7a17820309cfa35799017c916f5a3b2349123688540317d

## Invariants

- ADR-012 is not edited.
- Findings of a run that did run stay on the content channel.

## Risks

- Quoting a clause from another record makes the quote a claim about that file; the test binds the words this record actually carries.

## Stop Condition

A green run while `Invalidates: none` returns.

## Out of Scope

- Rewriting ADR-012 (permanent: boundary: records are history, CLAUDE.md §10)

## Notes

Found by the third Codex review (LOW). This record was `Invalidates: none` when qh-mcp's channel change shipped.

## Verification Log
- 2026-09-12 · fa27ad5* · exit 1 · `node --test --test-name-pattern 'ADR-046 names the ADR-012' tests/gates.test.mjs && python3 plugin/bin/adr-lint docs/adr/ADR-046-a-caller-relays-could-not-run.md && python3 plugin/bin/adr-lint docs/adr/ADR-045-one-record-grammar.md` · acceptance-sha256:9972a59b24bafd13d7a17820309cfa35799017c916f5a3b2349123688540317d · ms:552
  ```
  --- last 10 line(s) of stdout (of 13 after folding 13 raw)
  ℹ pass 1
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 32.792042
  [FAIL] docs/adr/ADR-046-a-caller-relays-could-not-run.md + docs/adr/ADR-046-a-caller-relays-could-not-run/tasks · adr-lint 2.97.0 (~/CursorProjects/quality-harness/plugin)
    T4-artifact-gates-relay-unproven.md: T4 has passing acceptance evidence but no `mutant killed` entry — its Mutation Log is empty. A survived mutant means the fence passed with the mechanism broken; inconclusive means it failed without a failing assertion. Neither is evidence the test binds to anything.
    T5-orientation-surfaces-every-unproven.md: T5 has passing acceptance evidence but no `mutant killed` entry — its Mutation Log is empty. A survived mutant means the fence passed with the mechanism broken; inconclusive means it failed without a failing assertion. Neither is evidence the test binds to anything.
    advice: T7-postmortem-could-not-run.md: Ordered Steps step 1 must establish the failing test (TDD red) — currently: 1. [S1] Reproduce: missing path is traceback + exit 1. Bind the CLI and the disp
  ```
- 2026-09-12 · fa27ad5* · exit 0 · `node --test --test-name-pattern 'ADR-046 names the ADR-012' tests/gates.test.mjs && python3 plugin/bin/adr-lint docs/adr/ADR-046-a-caller-relays-could-not-run.md && python3 plugin/bin/adr-lint docs/adr/ADR-045-one-record-grammar.md` · acceptance-sha256:9972a59b24bafd13d7a17820309cfa35799017c916f5a3b2349123688540317d · ms:1294
