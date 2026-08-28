# Task ADR-006-T2: amend the spec to the chosen mechanism and bind every fact

**Depends-on:** T1
**Covers:** F-1, F-2, F-3
**Estimated scope:** S (single file)
**Owner:** zy
**Produces:** none
**Consumes:** `UNPROVEN` verdict in `scripts/mutate.mjs` (T1)
**Data dependency:** hermetic

## Goal

Bring `docs/specs/2026-08-27-a-mutation-that-proves-nothing.md` into line with the mechanism ADR-006
chose, bind all nine facts and three scenarios to tests that exist, and take the spec from Draft to
Ready-for-ADR under its own gate.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/specs/2026-08-27-a-mutation-that-proves-nothing.md` | edit | F-4, F-5 and F-6 are worded around "the mutated line was executed", the mechanism ADR-006 rejects on measured evidence; every fact is `@draft` with `— to bind` |

## Ordered Steps

1. Confirm the gate is red first: `spec-verify --spec docs/specs/2026-08-27-a-mutation-that-proves-nothing.md` fails today on unbound facts and `@draft` tags. Paste the run.
2. Reword F-4, F-5 and F-6 from execution of the mutated line to the baseline: a verdict is counted as noticed only when the named tests PASSED before the mutation was applied. Keep the assertions falsifiable and keep the vocabulary requirement in F-6.
3. Amend the Problem section to separate the two classes the spec merged — unreached and vacuous — and record that coverage was measured blind to the vacuous one (100% line and branch, before and after, test passing with the mechanism broken). State plainly that this spec's original root cause covered one class, not both.
4. Add a Decided entry for the mechanism, naming the owner's ADR-first ordering call and what it avoided: nine red stubs written against a design that does not ship.
5. Bind F-1 to the test that ALREADY asserts it — `tests/package.test.mjs::every catalogue entry still matches the source it mutates, exactly once` — rather than writing a second assertion of the same behaviour. Bind F-2 and F-3 to tests in `tests/mutate-runner.test.mjs` for the HUNG and exit-1 rules, which are existing behaviour with no direct test today. Bind F-4 through F-9 and the three scenarios to the tests T1 created.
6. Flip every `@draft` to `@spec`, and re-run the gate until it exits 0. Paste the run.

## Acceptance

```bash
python3 bin/spec-verify --spec docs/specs/2026-08-27-a-mutation-that-proves-nothing.md
```

The WORKING-TREE gate, not the bare name. `spec-verify` on PATH is the forwarder
`--link` installs, and it resolves to the newest INSTALLED plugin — which in this
repository is the last release, not the change under test. Demonstrated
2026-08-28: the bare name reported `bound test not found` for a binding the
working-tree gate accepts, because the fix was three commits old and unreleased.
A fence that tests the released gate proves nothing about the commit it is
recorded against.

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `every catalogue entry still matches the source it mutates, exactly once` | `tests/package.test.mjs` | a `from` matching other than exactly once is caught before a campaign runs | F-1 |
| `a run killed by signal is HUNG rather than GREEN` | `tests/mutate-runner.test.mjs` | a null status or a signal is its own verdict, not a pass | F-2 |
| `a passing baseline leaves every existing verdict exactly as it was` | `tests/mutate-runner.test.mjs` | UC1-S1: a proven verdict is unchanged, and a vacuous mutation is still GREEN | UC1-S1 |
| `UNPROVEN entries are in neither half of the noticed ratio` | `tests/mutate-runner.test.mjs` | UC1-S2 and F-4: only a passing baseline lets an entry into the ratio | F-4, UC1-S2 |
| `a verdict taken against a failing baseline is UNPROVEN, not RED` | `tests/mutate-runner.test.mjs` | UC1-S3 and F-5 | F-5, UC1-S3 |
| `an UNPROVEN entry names its test-set and the next action` | `tests/mutate-runner.test.mjs` | F-6 and F-8 | F-6, F-8 |
| `an UNPROVEN entry still reports the verdict the tests produced` | `tests/mutate-runner.test.mjs` | F-9 | F-9 |
| `a baseline is taken once per distinct test-set, not once per mutation` | `tests/mutate-runner.test.mjs` | F-7 | F-7 |
| `GREEN and STALE both count as missed and exit 1` | `tests/mutate-runner.test.mjs` | the existing exit rule, asserted directly for the first time | F-3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the bound tests above, all collectable |
| 2 — something selects it | `spec-verify --spec` is the spec's own gate and runs in the acceptance fence; the bound tests run in `scripts/selftest.sh` |
| 3 — the caller can discover it | the spec's `Verify` block names the exact command; `adr-context` returns ADR-006 for `scripts/mutate.mjs` |
| 4 — it is used | to be recorded at execution: the spec-verify run at exit 0, with its fact count by tag |

## Class Sweep

**Class:** every fact and scenario in this spec whose wording assumes coverage rather than a baseline.

```bash
grep -n "executed\|execution\|mutated line" docs/specs/2026-08-27-a-mutation-that-proves-nothing.md
```

Run 2026-08-28: eight hits. Five are historical and correct to keep — they describe the mechanism
this record rejected and why, which is the point of amending rather than rewriting. Two were live
contradictions the fact-by-fact edit had missed, both outside the Facts table and therefore outside
what `spec-verify` can check: the **Domain** paragraph still defined "proven" as *the mutated line
was executed*, and a **Risks** row still mitigated *measuring execution*. Both reworded to the
baseline. The eighth is Grill Log row 2, a record of what was scouted, also correctly historical.

This is the sweep earning its place: the facts were amended one at a time and the two prose sections
that DEFINE the same vocabulary were not, so the spec would have carried a Domain section
contradicting every fact above it, with the gate green.

## Mutation Log

<!-- tool-written by adr-verify --mutant -->

The authored note here read "not applicable — this task ships no mechanism". `adr-lint` refused the
`done` row over it, and the gate was right. The MECHANISM this task ships is the set of bindings,
and the fence's job is to prove each one names a test that exists. Breaking a binding must therefore
turn the fence red, and if it does not, the fence is passing on the document rather than checking
it. "It is only documentation" is exactly the reasoning that produces unfalsifiable evidence.

## Invariants

- No fact is bound to a test that does not exist; `spec-verify --spec` is the mechanical check.
- F-1 binds to the existing assertion rather than a duplicate.
- The spec's Non-Goals are unchanged: generating mutations, and `adr-verify --mutant`, stay out.
- The Decided section keeps the owner's instruct-never-block ruling intact and adds to it, never rewrites it.

## Risks

- Rewording a fact could quietly weaken it into something the chosen mechanism trivially satisfies. Mitigated by keeping each assertion falsifiable and by the class sweep, which forces the scenarios to be reworded with their facts.
- Binding a fact to a test that asserts something adjacent. Mitigated by naming the exact `path::name` and letting `spec-verify --spec` prove each one is collectable.

## Stop Condition

Stop if rewording F-4 cannot be done without making it unfalsifiable — that would mean the chosen
mechanism does not actually satisfy the spec's goal, and the decision should be re-opened rather
than the fact softened to fit it.

## Out of Scope

- Adding new facts for the vacuous class. (deferred: docs/BACKLOG.md §39)
- Taking the spec beyond Ready-for-ADR. (permanent: ADR-006 already exists and covers these facts; the spec's remaining job is to be bound and accurate.)

## Verification Log
<!-- tool-written by adr-verify; empty at authoring -->
- 2026-08-28 · 43848d6 · exit 0 · `python3 bin/spec-verify --spec docs/specs/2026-08-27-a-mutation-that-proves-nothing.md` · acceptance-sha256:4e8961845d5e117c3eebf6da98d09554c110cc9a411f0f6ca2844ebda787025a
