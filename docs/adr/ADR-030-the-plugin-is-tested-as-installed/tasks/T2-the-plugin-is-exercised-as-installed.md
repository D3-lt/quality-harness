# Task ADR-030-T2: Exercise the plugin from where a user actually runs it

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (one new suite)
**Owner:** unassigned
**Produces:** `tests/installed.test.mjs` — reachability of every shipped surface, from the installed copy (T2)
**Consumes:** `plugin/agents/` exists and ships (T1)
**Data dependency:** reads the INSTALLED plugin on the machine running it; hermetic where none exists, which is the `UNRUN` path
**Proof map:** v1
**Rests-on:** `an absent install is UNRUN and reported, never a silent pass and never a finding`, `the install is located with qh-root rather than by string order`, `every finding names the version it was measured against`

## Goal

The question ADR-008 opened — is the thing we ship the thing we tested — gets an answer that was run,
against the plugin as the host unpacked it, rather than against the checkout every other suite reads.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/installed.test.mjs` | create | the suite |
| `tests/mutations.json` | edit | two catalogue entries (ADR-003) |

## Ordered Steps

1. [S1] Write the failing checks first, both directions: with no install resolvable the suite reports UNRUN and passes; with one resolvable it asserts each shipped surface is reachable there. Confirm red. (TDD red.) [proof: acceptance]
2. [S2] Locate the install with `plugin/bin/qh-root` and nothing else. Version ordering is exactly what a naive `ls | tail -1` gets wrong — measured 2026-09-04 on this machine, where that answers `2.9.0` and `qh-root` answers `2.59.0`. [proof: acceptance]
3. [S3] Assert reachability only: each gate's interpreter starts and its module imports, each skill's frontmatter parses, each workflow parses, an independently-named FLOOR of directories is present, and the files ADR-008 withholds are absent. Behaviour stays with the checkout suites. [proof: acceptance]
   - **Amended 2026-09-04, before implementation.** This step said `agents/` is present. Measured the same day: `qh-root` resolves 2.59.0, whose tree has no `agents/` — T1 shipped it minutes earlier and no release carries it yet. Asserting checkout parity here measures RELEASE LAG, which is `qh-doctor`'s and `sync-standalone`'s question already (ADR-030's Primitives Audit says T2 reuses their vocabulary rather than inventing a second one), and it would be red for every developer between an edit to `plugin/` and the next release. ADR-030's own Decision names four things to assert and `agents/` is not among them, so this is the task file over-specifying its record rather than a change to the decision. What ships instead: anything the CHECKOUT ships and the install lacks is reported as a version NOTE naming both versions — ADR-005's vocabulary, never a finding. A version threshold ("assert it once installed >= X") was rejected: that is a stored fact about a catalogue this project does not own, which is the rot ADR-029 refuses.
4. [S4] Put the resolved VERSION in every finding, so a report can never be mistaken for one about a different build — the confusion measured on 2026-09-01, where a peer reported findings against a release already fixed. [proof: acceptance]
5. [S5] Add two catalogue mutations and confirm both come back RED. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test tests/installed.test.mjs 2>&1 | tee /tmp/adr030-t2.out \
  && ! grep -qE "no tests to run|^not ok|^# fail [1-9]" /tmp/adr030-t2.out
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every shipped surface is reachable from the installed plugin` | `tests/installed.test.mjs` | the artifact a user receives is the one we tested | — | S2, S3, S4 |
| `an absent install is UNRUN, not a pass and not a finding` | `tests/installed.test.mjs` | ADR-005: could-not-look never borrows the vocabulary of a verdict | — | S1 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `tests/installed.test.mjs` is tracked and `scripts/selftest.sh` globs `tests/*.test.mjs` |
| 2 — something selects it | the selftest glob runs it on every local run, and it is the only suite that reads the install |
| 3 — the caller can discover it | its UNRUN line names what it looked for and where, so a reader knows why it said nothing |
| 4 — it is used | it runs on every developer machine that has the plugin installed; the pre-registered check in ADR-030 measures whether that is ever more than zero |

## Mutation Log

## Verification Log

## Invariants

- No install resolvable means UNRUN — printed, never silent, never a finding.
- The install is located by `qh-root`, never by lexical ordering of directory names.
- Every finding names the resolved version.
- The suite reads and executes; it never writes to the installed copy.

## Risks

- It skips on machines without an install, including CI, and a check that always skips is decoration. That is the pre-registered failure in ADR-030, with a named command and a month's window.
- It could report a defect already fixed if the install is stale. S4 is the mitigation: the version is in the finding.

## Stop Condition

Stop if the suite cannot tell "no install" from "install is broken". Those need different things done
to them, and a check that says the same words about both is the ADR-005 defect this repository keeps
finding in other people's gates.

## Out of Scope

- Installing the plugin as part of the test (permanent: boundary: it would then test an install this test performed rather than the one the user has — ADR-030's Alternatives records this as the tempting wrong answer)
- Asserting gate BEHAVIOUR from the installed copy (permanent: boundary: the checkout suites own that, and two sources of truth for one claim is the defect this corpus keeps deleting)
- Repairing what it finds (permanent: boundary: `sync-standalone.mjs --link --apply` repairs, and that is a user's call, not a test's)
