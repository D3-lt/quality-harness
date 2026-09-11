# Task ADR-045-T9: adr-lint names the whole unrunnable opener line

**Depends-on:** T3
**Covers:** F-10, UC10-S1, UC10-S2
**Estimated scope:** XS (one line in adr-lint, then one call into the lib; one regression arm; one catalogue entry)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

adr-lint's no-runnable-fence finding named the opener it found with `^[ \t]*```(\S*)` — the first non-space token — so ```bash title=x was reported as "opens with ```bash": the part that is fine, with the rejected `title=x` left out. The whole first fence line, trimmed, is named. First as a widened capture in adr-lint (its own commit); then, with T10, through `record.first_fence_line`, so ~~~bash and ```BASH are named the same way from the same grammar and adr-lint carries no fence regex of its own.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | the opener named is `first_fence_line(acc)` |
| `plugin/lib/record.py` | edit | `first_fence_line` (with T10) |
| `tests/evidence-chain.test.mjs` | edit | ```bash title=x and ~~~bash named whole; never "opens with ```bash," |
| `tests/mutations.json` | edit | the first-token capture restored |

## Ordered Steps

1. [S1] Bind the failing arm: ```bash title=x  ` reported as `opens with ```bash title=x`. [proof: acceptance]
2. [S2] Capture the whole line; then route through `first_fence_line`. [proof: acceptance]
3. [S3] Add the catalogue entry; run it with `node scripts/mutate.mjs --case`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'digest-checked by adr-lint, not skipped' tests/evidence-chain.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a sh-labelled Acceptance the writer recorded is digest-checked by adr-lint, not skipped` | `tests/evidence-chain.test.mjs` | sh/shell/`bash ` accepted with no fence complaint (the happy arm); python named; ```bash title=x named whole and trimmed; ~~~bash named | F-10, UC10-S1, UC10-S2 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `first_fence_line` is in `record.__all__` |
| 2 — something selects it | adr-lint's no-fence finding calls it |
| 3 — the caller can discover it | the CLI prints the line the author wrote |
| 4 — it is used | the attributed and tilde arms through `adr-lint` |

## Mutation Log
- 2026-09-11 · eb0fe36* · mutant killed · exit 1 · `plugin/bin/adr-lint` · the first-token capture names ```bash title=x as ```bash again, and the attributed arm asserts the whole line · acceptance-sha256:c2f7f9d91f7bf1785cf90e87b2fc1b7cf9425f516cde6c551fc799037ca73830

## Invariants

- The finding's text before the opener is unchanged; only what follows "opens with" widened.

## Risks

- A very long first fence line is printed whole. It is the author's line; truncating it is the defect this task removes.

## Stop Condition

A green run while adr-lint reports ```bash title=x as opening with ```bash.

## Out of Scope

- Naming a second fence when the first is unrunnable and a later one is (permanent: boundary: `acceptance_fence` walks over example fences and finds the later runnable one, so no finding is raised at all in that case)

## Notes

Class: every place a gate prints an opener it found — `rg -n 'opens with' plugin/bin` → adr-lint only. Found by the second Codex review of ADR-045 (L2).

## Verification Log
- 2026-09-11 · eb0fe36* · exit 0 · `node --test --test-name-pattern 'digest-checked by adr-lint, not skipped' tests/evidence-chain.test.mjs` · acceptance-sha256:c2f7f9d91f7bf1785cf90e87b2fc1b7cf9425f516cde6c551fc799037ca73830 · ms:1798
- 2026-09-11 · eb0fe36* · exit 0 · `node --test --test-name-pattern 'digest-checked by adr-lint, not skipped' tests/evidence-chain.test.mjs` · acceptance-sha256:c2f7f9d91f7bf1785cf90e87b2fc1b7cf9425f516cde6c551fc799037ca73830 · ms:1711
