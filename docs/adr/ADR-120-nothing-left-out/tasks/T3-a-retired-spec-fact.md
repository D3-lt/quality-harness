# Task ADR-120-T3: A tag that retires a spec fact

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** the `@retired` tag in `spec-verify`, `work-next`, the spec template and the spec-write skill
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A spec fact or scenario can be tagged `@retired`: `spec-verify` accepts it without requiring or running its test, `work-next`
no longer counts it as owed, and the ADR-040 spec's F-1 rows that bind deleted tests are retired.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/spec-retired.test.mjs` | create | the new tag's rows (0 locks: new) |
| `plugin/bin/spec-verify` | edit | `SCEN_RE` (:112-113), fact tags (:775-779), the `--spec`/`--implemented` loops (:806-838) |
| `plugin/scripts/work-next.mjs` | edit | `specBoundIds` (:426-433) skips a retired id; the coverage route (:669-671) treats a spec whose recognised ids are all retired as owing nothing, and keeps a spec with no recognised id uncovered, as `tests/work-next-readiness.test.mjs:314,375` holds today |
| `plugin/bin/adr-lint` | read | `spec_ids` (:700-713) already reads only `@spec` and `@implemented`; asserted by a test, not changed |
| `plugin/templates/spec-template.md`, `plugin/skills/spec-write/SKILL.md` | edit | the tag list names `@retired` and when to use it |
| `docs/specs/2026-09-10-sessionstart-ready-uses-the-listing.md` | edit | F-1's rows, reversed by ADR-099 Decision 5, become `@retired` |
| `docs/adr/ADR-097-remove-what-nothing-acts-on.md` | read | its deferral is decided against in ADR-120 (Invalidates), not edited |
| `tests/mutations/plugin/bin/spec-verify.json`, `tests/mutations/plugin/scripts/work-next.mjs.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: a spec with an `@retired` fact and scenario passes `--spec` and `--implemented` without its test existing or running; an `@retired` row that binds a present test is advised; an unknown tag (`@retire`) is still `bad tag`; adr-lint's coverage does not require a retired id; a Ready-for-ADR spec whose live ids are covered and whose one uncovered id is retired is not routed as uncovered by `work-next`, nor is a spec whose recognised ids are all retired, while a Ready-for-ADR spec with no recognised id is still routed as uncovered.
2. [S2] Accept `@retired` in `SCEN_RE` and the fact-row tags; skip retired rows in the existence and run loops; advise a retired row that binds a present test.
3. [S3] Make `specBoundIds` return the retired ids apart from the live ones; a spec owes its live ids, a spec whose recognised ids are all retired owes nothing, and a spec with no recognised id keeps today's uncovered route.
4. [S4] Name the tag in the template and the skill. [proof: human: the wording of the template and the skill, read in the round's review]
5. [S5] Retire F-1's rows in the ADR-040 spec and run `spec-verify --spec` on it. [proof: acceptance]
6. [S6] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/spec-retired.test.mjs 2>&1) \
  && for n in "a retired fact or scenario is neither required nor run" \
      "a retired row that still binds a present test is advised" \
      "a tag that is not one of the four is still refused" \
      "work-next owes nothing for a retired id"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done \
  && python3 plugin/bin/spec-verify --spec docs/specs/2026-09-10-sessionstart-ready-uses-the-listing.md
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a retired fact or scenario is neither required nor run` | `tests/spec-retired.test.mjs` | `--spec` and `--implemented` pass with the test absent; adr-lint does not require the id | — | S1, S2 |
| `a retired row that still binds a present test is advised` | `tests/spec-retired.test.mjs` | the advice | — | S1, S2 |
| `a tag that is not one of the four is still refused` | `tests/spec-retired.test.mjs` | `@retire` is `bad tag` | — | S1, S2 |
| `work-next owes nothing for a retired id` | `tests/spec-retired.test.mjs` | the partly and the wholly retired spec | — | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | the tag regexes in `spec-verify` and `work-next`; the mutants on them |
| 3 — the caller can discover it | the spec template and the spec-write skill |
| 4 — it is used | the ADR-040 spec's F-1 rows |

## Mutation Log

## Invariants

- `@draft`, `@spec` and `@implemented` keep their meaning in every reader.
- A frozen archived record (ADR-040) is not edited; only its spec file is.

## Risks

- A retired fact hides a live one: the advice on a retired row whose test is present names it.

## Stop Condition

Stop if a spec outside this repository's `docs/specs/` uses `@retired` with another meaning (none known).

## Out of Scope

- Removing `post-edit-check.sh` (permanent: boundary: decided against in ADR-120, Invalidates — the hook's findings reach the agent since ADR-102 and ADR-119 T4 improved them)

## Verification Log
