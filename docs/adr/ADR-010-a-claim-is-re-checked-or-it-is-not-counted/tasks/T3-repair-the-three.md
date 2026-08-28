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
| `docs/adr/ADR-010-…/tasks/T3-recheck.sh` | add | the acceptance itself — it asserts fresh evidence and re-runs the three fences, and it names no `--sweep`, so it can never make the sweep re-enter itself |
| `docs/adr/ADR-006-a-verdict-that-names-its-own-reliability/tasks/T2-amend-and-bind-the-spec.md` | edit | its fence calls `python3 bin/spec-verify`, which moved to `plugin/bin/` — exit 2 at HEAD |
| `docs/adr/ADR-007-a-dependency-that-crosses-records/tasks/T1-a-qualified-id-resolves.md` | edit | its fence calls `tests/gate-regressions.py bin skills/postmortem/SKILL.md` — both paths moved, and the script now takes a repository root as a fourth argument — exit 1 |
| `docs/adr/ADR-009-a-decision-names-what-enforces-it/tasks/T1-parse-and-resolve.md` | edit | same fence, same two reasons — exit 1 |

## Ordered Steps

1. **Write the failing check first — it is this task's red test.** Write `T3-recheck.sh`: for each of the three tasks, assert an exit-0 Verification Log entry carries the task's CURRENT fence digest, then run that fence and require exit 0. Confirm it is red, and red on the SECOND half — the fences fail — not on the first, which passes today because the digests still match. Then run `python3 plugin/bin/adr-verify --sweep docs/adr` and confirm it names exactly these three with exit codes 2, 1, 1; if it names a fourth, stop before editing anything, because a claim that broke for a different reason is a different task.
2. Repair each fence to name the paths as they now are, changing nothing else about what it asserts. A fence that is broadened while being repaired is a fence whose recorded evidence never proved the new form.
3. Re-run each task's own tests by hand and confirm each repaired fence exits 0 for the right reason — that it exercises the same subject as before, not merely that it is green.
4. Re-record each with `adr-verify <task.md>` on a clean tree. Editing the fence changes its digest, so the previous exit-0 entries become superseded by design; `adr-lint` will refuse those `done` rows until the new entries exist. Commit between runs, because `adr-verify` dirties the tree by writing its own entry.
5. Re-run the sweep and confirm zero false successes. **Unrecorded, and deliberately so** — it is a check on the corpus, not this task's evidence, and putting it in the fence is what created the recursion.

## Acceptance

```bash
bash docs/adr/ADR-010-a-claim-is-re-checked-or-it-is-not-counted/tasks/T3-recheck.sh
```

<**This was `adr-verify --sweep docs/adr` and a review found two holes in it, one of them fatal.**

The fatal one: T3's fence becomes a claim the moment it earns an exit-0 entry, so every later sweep
would re-run it — and re-running it is another sweep. Unbounded recursion, introduced by the very
task meant to prove the sweep works. T1 now refuses any fence naming `--sweep`, which is the general
guard; this fence names none, which is the narrow one.

The second: a clean sweep does not prove a repair. Editing the three fences without re-recording
makes their old entries **superseded** — neither half — so the sweep reports zero false successes and
exits 0 with no fresh evidence anywhere. So the script asserts, for each of the three tasks, that an
exit-0 entry carries the task's CURRENT digest, and then re-runs the fence. It is red today on the
second half, and red on the first half for exactly the shortcut that would otherwise pass.>

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| — | `T3-recheck.sh` | It asserts, per repaired task, that an exit-0 entry carries the CURRENT fence digest, then runs the fence. Both halves must pass. | — |

**Why no unit test, said plainly rather than left as a gap:** a test asserting "this repository's
corpus has zero false successes" would be a test of the corpus, not of the code, and it would fail
for anyone who forked the repository mid-repair. T1 carries the mechanism's tests. What this task
must prove is narrower and specific to three files: that each has a fence which passes AND fresh
evidence carrying that fence's digest. `T3-recheck.sh` asserts exactly those two things and nothing
else, which is why it can be red today and cannot go green by a shortcut.

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
- The acceptance never invokes `--sweep`, so this task's own claim can never make the sweep recurse.
- Superseding an entry is not repairing it. A fence edited without re-recording fails this task.
- The three records' Status and Decision text are untouched — this repairs their evidence, not their content.

## Risks

- Editing a fence without re-recording makes its old entry superseded, which the sweep tolerates — so a clean sweep would read as a successful repair. Mitigated by asserting the current digest appears in an exit-0 entry, which supersession cannot satisfy.
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
