# Task ADR-022-T2: Record which declared mechanism a killed mutant bound

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one option, one row field)
**Owner:** unassigned
**Produces:** the ` · covers:<name>` Mutation Log row field, written by `adr-verify --mutant --covers` (T2)
**Consumes:** `rests_on()` (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`adr-verify --mutant --covers <mechanism>` appends the declared name to the Mutation Log row it
writes, and refuses — before touching a file — a name the task did not declare in `Rests-on:`. Every
row already in this corpus still parses.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-verify` | edit | the option, the pre-flight refusal, and the row suffix at the existing writer |
| `plugin/bin/adr-lint` | edit | `MLOG_RE` accepts the optional suffix; without this the tool writes rows its own linter rejects |
| `plugin/templates/task-template.md` | edit | the row grammar is documented there and would otherwise disagree with what the tool writes |
| `tests/gate-regressions.py` | edit | the regression, through the shipped CLI |
| `tests/mutations.json` | edit | registers this task's mutant |

## Ordered Steps

1. [S1] Write the failing regression first (TDD red), through the CLI: `--covers` with an undeclared name must refuse and change nothing on disk, and `--covers` with a declared name must land in the row. It must fail before any code changes. [proof: acceptance]
2. [S2] Refuse an undeclared name in the option-validation phase, BEFORE the journal is armed and before either fence runs. ADR-016 put transaction preflight ahead of the first fence for this reason; a refusal after a mutation has been applied is a refusal that has already changed the tree. [proof: acceptance]
3. [S3] Append ` · covers:<name>` to the row the existing writer produces, as a suffix on the existing grammar rather than a second grammar. [proof: acceptance]
4. [S4] Widen `MLOG_RE` to accept the field, and assert every Mutation Log row tracked in this repository today still parses under the widened pattern. A grammar change that orphans recorded evidence is the one thing this row may never do. [proof: acceptance]
5. [S5] Assert `--covers` is optional: a `--mutant` run without it writes exactly the row it writes today, byte for byte. [proof: acceptance]
6. [S6] Register a mutant that deletes the pre-flight refusal — not the name comparison — and confirm RED. Deleting the comparison would redden S1 whether or not the refusal is reached before the journal, which is ADR-020 T4's lesson. [proof: mutation]

## Acceptance

```bash
set -o pipefail
python3 tests/gate-regressions.py plugin/bin plugin/skills/postmortem/SKILL.md . 2>&1 | tee /tmp/adr022-t2.out \
  && ! grep -qiE "traceback|assertionerror" /tmp/adr022-t2.out \
  && grep -q "covers refuses a mechanism the task did not declare" tests/mutations.json
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `covers refuses a mechanism the task did not declare` | `tests/gate-regressions.py` | undeclared name refused, tree unchanged | — | S1, S2 |
| `the refusal happens before the journal is armed` | `tests/gate-regressions.py` | no mutation applied, no journal written | — | S2 |
| `a declared mechanism reaches the recorded row` | `tests/gate-regressions.py` | the suffix is written | — | S1, S3 |
| `every row in this corpus still parses` | `tests/gate-regressions.py` | widened `MLOG_RE` orphans nothing | — | S4 |
| `a mutant run without covers writes the row it writes today` | `tests/gate-regressions.py` | the field is optional | — | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the five tests above |
| 2 — something selects it | the option is parsed in `adr-verify`'s existing `--mutant` group and the pre-flight runs on every `--covers` invocation; the registered mutant deletes that call and S1 goes red |
| 3 — the caller can discover it | `--covers` appears in `adr-verify`'s usage text and in the task template's row grammar |
| 4 — it is used | T3's report is its only consumer, and the record's Follow-up counts real declarations |

## Mutation Log

## Invariants

- A `--mutant` run without `--covers` writes the row it writes today, unchanged, forever.
- Every Mutation Log row tracked in this repository parses under the widened grammar.
- The refusal happens before the journal is armed and before either fence runs.
- `adr-verify` never invents a mechanism name; it only accepts one the task declared.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The widened grammar orphans a recorded row | Low | High | S4 asserts every tracked row parses, rather than a sample |
| The refusal lands after the mutation is applied | Med | High | S2 asserts the tree is unchanged, and S6's mutant is on the call site, not the comparison |
| The suffix collides with the optional trailing digest field | Med | Med | S4's corpus-wide parse, plus the suffix's fixed `covers:` marker |

## Stop Condition

Stop and return to the record if a mutant needs to bind more than one declared mechanism. That would
make the field a list and the coverage arithmetic a set operation, and the record's argument that the
declaration is cheap prose rests on it being neither.

## Out of Scope

- Reporting which declared mechanisms are uncovered, which is T3's (permanent: boundary: this task writes the field; reading it across a task is a separate check with its own silence obligations)
- Binding the row to the output its run printed (deferred: docs/BACKLOG.md §98 — blocked on ADR-020's one-month Follow-up count, not merely punted)
- Any change to what `done` requires (permanent: boundary: the record keeps the obligation existential, and this task adds a field, not a condition)

## Verification Log
