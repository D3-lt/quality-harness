# Task ADR-010-T3: repair the three claims that stopped being true

**Depends-on:** T1
**Covers:** none — this repairs the corpus the spec measured; no fact describes it
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** none
**Consumes:** `adr-verify --sweep` and its four-bucket report (T1)
**Data dependency:** hermetic

## Goal

The three fences that stopped passing when ADR-008 moved the plugin are repaired and re-recorded, so
`adr-verify --sweep docs/adr` reports zero false successes over this repository's own corpus.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/adr/ADR-006-a-verdict-that-names-its-own-reliability/tasks/T2-amend-and-bind-the-spec.md` | edit | its fence calls `python3 bin/spec-verify`, which moved to `plugin/bin/` — exit 2 at HEAD |
| `docs/adr/ADR-007-a-dependency-that-crosses-records/tasks/T1-a-qualified-id-resolves.md` | edit | its fence calls `tests/gate-regressions.py bin skills/postmortem/SKILL.md` — both paths moved, and the script now takes a repository root as a fourth argument — exit 1 |
| `docs/adr/ADR-009-a-decision-names-what-enforces-it/tasks/T1-parse-and-resolve.md` | edit | same fence, same two reasons — exit 1 |

## Ordered Steps

1. **Confirm the failure first, which is this task's red state.** Run `python3 plugin/bin/adr-verify --sweep docs/adr` and confirm it names exactly these three with exit codes 2, 1, 1. If it names a fourth, stop and investigate before editing anything — a claim that broke for a different reason is a different task.
2. Repair each fence to name the paths as they now are, changing nothing else about what it asserts. A fence that is broadened while being repaired is a fence whose recorded evidence never proved the new form.
3. Re-run each task's own tests by hand and confirm each repaired fence exits 0 for the right reason — that it exercises the same subject as before, not merely that it is green.
4. Re-record each with `adr-verify <task.md>` on a clean tree. Editing the fence changes its digest, so the previous exit-0 entries become superseded by design; `adr-lint` will refuse those `done` rows until the new entries exist. Commit between runs, because `adr-verify` dirties the tree by writing its own entry.
5. Re-run the sweep and confirm zero false successes.

## Acceptance

```bash
python3 plugin/bin/adr-verify --sweep docs/adr
```

<This fence is obviously red until the work lands: it exits non-zero today, naming three claims. It
also cannot pass vacuously — a corpus with no claims reports no rate and does not report success
(F-12), so an empty or unparsed corpus fails rather than sailing through.>

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| — | — | This task adds no test. It repairs data, and its proof is T1's mechanism run over the real corpus — which is the only place these three claims exist. | — |

**Why no new test, said plainly rather than left as a gap:** a test asserting "this repository's
corpus has zero false successes" would be a test of the corpus, not of the code, and it would fail
for anyone who forked the repository mid-repair. T1 already carries the mechanism's tests. What this
task proves is that the mechanism, run against real data, reports clean — and that is exactly what
its Acceptance fence does.

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three repaired fences |
| 2 — something selects it | the sweep runs them; that is the Acceptance |
| 3 — the caller can discover it | n/a: no declared interface — this is data repair |
| 4 — it is used | to be recorded at execution: the sweep's output before and after, with both counts |

## Class Sweep

**Class:** every recorded fence that names a path ADR-008 relocated.

```bash
grep -rn "^\(python3\|node\|bash\) .*\(^\|[^a-zA-Z/._-]\)\(bin\|skills\|templates\|workflows\|hooks\)/" docs/adr/*/tasks/*.md | grep -v 'plugin/'
```

To be run and recorded at execution. Known at authoring: three tasks, found by re-running every
re-checkable fence rather than by grep — which is the point, since a fence can break for reasons a
grep cannot see. Any sibling this command finds that the sweep did not name is a fence that is stale
but still passing, and it should be repaired here too and said so.

## Mutation Log

<!-- tool-written by adr-verify --mutant; empty at authoring. This task adds no mechanism, so it
     carries no mutant of its own — T1's mutations cover the sweep that judges it. Recorded here
     rather than left blank so the absence is a decision instead of an omission. -->

## Invariants

- A repaired fence asserts the same subject as before. Repair is not broadening.
- Every repaired task gets a fresh tool-written exit-0 entry; no log is hand-edited.
- The three records' Status and Decision text are untouched — this repairs their evidence, not their content.

## Risks

- A fence is "repaired" into something that passes but no longer proves what the task claimed. Mitigated by step 3, and by the fact that each of these three fences names a specific test file whose subject is checkable by reading it.
- Re-recording marks the tree dirty and the next task's sha carries `*`. Mitigated by committing between runs, which the execute skill already requires.

## Stop Condition

Stop if a fence cannot be repaired without changing what it asserts — that means the task's evidence
is genuinely gone rather than mislocated, and whether to re-execute the task or supersede the record
is the owner's decision, not this task's.

## Out of Scope

- Repairing anything the sweep does not name. A fence that still passes is not this task's business, even if it looks fragile.
- Adding a check that fences stay in step with moved paths. (deferred: docs/BACKLOG.md §45)

## Verification Log
<!-- tool-written by adr-verify; empty at authoring -->
