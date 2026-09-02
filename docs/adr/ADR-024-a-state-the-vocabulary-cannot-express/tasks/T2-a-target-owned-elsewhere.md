# Task ADR-024-T2: Let an author declare a target this repository does not own

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** the `(external: <where>: <pointer>)` disposition
**Consumes:** the `UNRESOLVED` verdict word and the kinds it covers (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`(external: <where>: <pointer>)` resolves as intentional, prints in its own column, and exits 0 —
so a corpus that is one half of a cross-repo decision can be green and honest at once.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-debt` | edit | the shared balanced-disposition scanner gains the keyword; a new column; the exit rule |
| `plugin/bin/adr-lint` | edit | the Out of Scope disposition check must accept the new form, or a record using it is rejected by the other gate |
| `plugin/templates/adr-template.md` | edit | the disposition list a record author reads is the thing that SELECTS this — undocumented, it is unreachable |
| `tests/gate-regressions.py` | edit | fixtures, since this corpus has no external pointers |

## Ordered Steps

1. [S1] Write the failing fixtures first: a bullet tagged `(external: backend repo: ADR-007)` is not reported and does not fail the run; one missing `<where>` is refused with a message naming what is missing; and an undeclared unresolvable pointer still reports `UNRESOLVED` from T1. (TDD red.)
2. [S2] Extend the ONE balanced scanner at `adr-debt:69` with the keyword. Do not write a second parser — two parsers for one grammar drift, which is the defect `assertion_segments` was already consolidated for.
3. [S3] Teach `adr-lint`'s Out of Scope check the same form, from the same grammar. A disposition one gate accepts and the other rejects is worse than no disposition.
4. [S4] Print external rows in their own column with their `<where>`, and exit 0 for them. [proof: mutation]
5. [S5] Document it in the ADR template's disposition list beside `permanent` and `deferred`, since that list is what an author reads. [proof: human: a reader checks the template names the form beside its siblings — prose has no assertion, and a keyword test for it is the word-matching contract test §80 is about]

## Acceptance

```bash
set -o pipefail
python3 tests/gate-regressions.py plugin/bin plugin/skills/postmortem/SKILL.md . 2>&1 | tee /tmp/adr024-t2.out \
  && ! grep -qE "Traceback|AssertionError" /tmp/adr024-t2.out \
  && node --test tests/gates.test.mjs 2>&1 | tee /tmp/adr024-t2b.out \
  && ! grep -qE "^not ok|# fail [1-9]" /tmp/adr024-t2b.out
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `test_an_external_target_is_declared_not_broken` | `tests/gate-regressions.py` | a declared external pointer is not reported and exits 0 | — | S1, S2, S4 |
| `test_an_external_declaration_names_where` | `tests/gate-regressions.py` | a missing `<where>` is refused, so the row still answers the reader's question | — | S1, S2 |
| `test_both_gates_read_one_disposition_grammar` | `tests/gate-regressions.py` | adr-lint and adr-debt accept the same spelling | — | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three fixtures above |
| 2 — something selects it | the shared scanner is on both gates' only disposition path; the mutation on the exit rule proves it is reached |
| 3 — the caller can discover it | the ADR template's disposition list — the file an author actually reads; without that line the form exists and nobody can find it |
| 4 — it is used | nothing here will use it, by measurement. The reporting corpus is the observer, and the parent ADR pre-registers removal if ten records pass with no use |

## Mutation Log

## Invariants

- One grammar, one scanner, both gates. A form one accepts and the other rejects is a trap.
- `<where>` is required: the column exists to answer "who owns this", and a declaration without it answers nothing.
- An external row exits 0; an undeclared unresolvable row still exits 1.
- `(permanent: …)` semantics are untouched — external debt is real work owned elsewhere, not a chosen limit, so it must not become invisible the way permanent entries are.

## Risks

- The disposition becomes a way to silence a typo. Mitigated by printing every external row in its own column on every run, so a wrong declaration stays visible rather than disappearing the way a permanent entry does.

## Stop Condition

Stop if the balanced scanner cannot take a third keyword without ambiguity against the existing two —
a grammar that needs a rewrite is a different decision from one that needs a sibling.

## Out of Scope

- A machine-readable `<where>` — a URL or a git remote (deferred: docs/BACKLOG.md §107)
- Resolving the pointer in the other repository (the parent ADR's Out of Scope says why)

## Verification Log
