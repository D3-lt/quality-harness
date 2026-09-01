# Task ADR-022-T1: Let a task declare the mechanisms its fence's claim rests on

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one parser, one gate reading)
**Owner:** unassigned
**Produces:** `rests_on()` — the `**Rests-on:**` declaration parser in `plugin/bin/adr-lint` (T1)
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A task file may carry `**Rests-on:** `name`, `name`, …`, naming the mechanisms its Acceptance
fence's claim depends on. `adr-lint` parses it, reports a declaration it cannot read, and reports a
name declared twice — and stays silent for every task that does not carry the header, which is every
task in the corpus today.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | `rests_on()` and its two advisories; the header is read where the other task headers already are |
| `plugin/templates/task-template.md` | edit | the header has to be documented where authors read, or the field exists and nobody fills it |
| `tests/gate-regressions.py` | edit | the regression, through the shipped CLI on a task fixture |
| `tests/mutations.json` | edit | registers the mutant this record's `Enforced-by` will rest on |

## Ordered Steps

1. [S1] Write the failing regression first (TDD red), through the CLI on a fixture task carrying `**Rests-on:** `a`, `b``: the two malformed cases must be named and a well-formed declaration must draw nothing. It must fail before any code changes. [proof: acceptance]
2. [S2] Add `rests_on(text)` returning `None` when the header is absent and a list of names when present — `None` and `[]` are different answers, because "no declaration" and "declared nothing" are different states and ADR-005 forbids collapsing them. [proof: acceptance]
3. [S3] Advise on a declaration that does not parse, and on a name declared twice. Both advisory; neither enters the blocking channel. [proof: acceptance]
4. [S4] Assert SILENCE on every task file in this repository's own corpus, none of which carries the header. A new advisory that fires 40 times on an unmodified tree is the defect BACKLOG §59 records. [proof: acceptance]
5. [S5] Document the header in the task template beside the other optional headers, saying what it is for and that it is optional. [proof: acceptance]
6. [S6] Register a mutant that breaks the parser's absent-header branch — returning `[]` where `None` belongs — and confirm RED. That is the branch S4 depends on, and a mutant on the parse body would be killed by S1 whether or not the absent case works. [proof: mutation]

## Acceptance

```bash
set -o pipefail
python3 tests/gate-regressions.py plugin/bin plugin/skills/postmortem/SKILL.md . 2>&1 | tee /tmp/adr022-t1.out \
  && ! grep -qiE "traceback|assertionerror" /tmp/adr022-t1.out \
  && grep -q "a declaration that cannot be read is reported" tests/mutations.json
```

<The catalogue grep is chained because the mutation label is half of what this task produces and CI
gates on the campaign, not on this fence — the lesson ADR-020 T1 paid for twice.>

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a declaration that cannot be read is reported` | `tests/gate-regressions.py` | a malformed `Rests-on:` is named | — | S1, S3 |
| `a mechanism declared twice is reported` | `tests/gate-regressions.py` | duplicate names are named | — | S1, S3 |
| `a well-formed declaration draws nothing` | `tests/gate-regressions.py` | capable of clean on the same fixture | — | S1 |
| `an absent declaration is not an empty one` | `tests/gate-regressions.py` | `None` vs `[]` are distinct | — | S2 |
| `the corpus as it stands draws no new advice` | `tests/gate-regressions.py` | silence across every tracked task file | — | S4 |
| `the declaration advisories never block` | `tests/gate-regressions.py` | advisory channel only | — | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the six tests above |
| 2 — something selects it | `rests_on()` is called from the task-header reader `adr-lint` already runs on every task; the registered mutant breaks the absent-header branch and S4 goes red |
| 3 — the caller can discover it | the template documents the header, and the advisory quotes the line it could not read |
| 4 — it is used | the record's Follow-up counts declarations after a month |

## Mutation Log

- 2026-09-01 · b5c6809* · mutant killed · exit 1 · `plugin/bin/adr-lint` · an absent header read as an empty declaration · acceptance-sha256:9c01800fe70da6c6060d637dd974081fcac6ebd114a4635aea1fbebaa5bd3e2c

## Invariants

- A task with no `Rests-on:` is read exactly as it is today, forever. This corpus has 40 such tasks and none of them may change behaviour.
- `None` (no header) and `[]` (header declaring nothing) stay distinct values.
- Advisory. Neither finding enters the blocking channel.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The new advisory fires across the existing corpus | Med | High | S4, asserted on every tracked task file rather than assumed |
| The header parser accepts a line that is not a declaration | Med | Med | S1's malformed arm, and the parser matches the header shape rather than scanning for names |

## Stop Condition

Stop and return to the record if the declaration turns out to need structure beyond a list of names
— a mechanism with an owner, a file, or a nested claim. The whole argument for prose here is that it
is cheap and creates only an obligation; a field with structure is a schema, and a schema is worth
its own decision.

## Out of Scope

- Anything a mutation row records, which is T2's (permanent: boundary: this task adds the declaration only, and a declaration nothing binds to is still worth having — it is what the sweep in the record cannot derive)
- Reporting coverage of declared mechanisms, which is T3's (permanent: boundary: it consumes both this parser and T2's row field, and cannot be written before either)
- Comparing the declaration against the fence's shape, which is T4's (permanent: boundary: separate advisory, separate proxy, separate risk of firing wrongly)

## Verification Log
- 2026-09-01 · b5c6809 · exit 0 · `set -o pipefail …` · acceptance-sha256:9c01800fe70da6c6060d637dd974081fcac6ebd114a4635aea1fbebaa5bd3e2c · ms:6395
