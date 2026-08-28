# Spec: Report how many recorded claims stopped being true

> **Date:** 2026-08-28 · **Status:** Draft — see the note below
> **Owner:** zy · **Becomes:** standalone (an ADR follows on acceptance)
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec docs/specs/2026-08-28-a-claim-that-stopped-being-true.md` exits 0.
> **Status note:** all 17 facts are `@implemented` and all 7 scenarios are bound and passing, but
> `spec-verify --implemented` reports `[PARTIAL]` and the status stays Draft. The facts run through a
> `Cmd` override; the scenarios cannot, because scenarios have no `Cmd` column and this repository
> declares no `package.json` to tell spec-verify which runner owns `tests/`. That is ADR-005's `UNRUN`
> doing its job — the gate says it could not run them rather than that they failed — and the fix is
> docs/BACKLOG.md §38, not a `package.json` added to make a gate go green.
> **Cross-references:** docs/adr/ADR-003-a-gate-asserts-behaviour-not-shape.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-006-a-verdict-that-names-its-own-reliability.md, docs/adr/ADR-008-the-plugin-is-not-the-repository.md, docs/research/2026-08-28-verification-is-the-bottleneck.md

## Problem

**Three of this corpus's fifteen recorded exit-0 claims stopped being true this afternoon, and every
gate stayed green.** ADR-008 moved `bin/` and `skills/` under `plugin/`; three task fences still name
the old paths. Re-running one gives exit 1. Their `acceptance-sha256` digests still match, because
the fence TEXT did not change — the world under it did — so `adr-lint` reads them as valid evidence
and passes.

Nothing in this repository computes or names a rate over recorded claims
(`grep -rln false.success plugin/ scripts/ tests/` → no hits). The mutation campaign's `244/244
noticed` measures whether the SUITE detects a broken mechanism; it says nothing about whether a claim
the corpus recorded still holds.

Externally this is the field's headline metric: false success is 75.8% of failures among
self-assessing coding agents (arXiv 2606.09863), and one in five "solved" SWE-bench patches is
semantically wrong (arXiv 2603.00520). Our own measured 3-in-15 is the same fraction.

## Goal

Report a false-success rate over recorded claims, computed from the corpus that already exists, and
count a claim that cannot be re-checked in neither half of it. Today's number is 3/15.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| maintainer | human role | know how many of this corpus's claims still hold before handing it to someone |
| CI | scheduled job | fail when a recorded claim stops being true |
| adopting team | human role | turn this on over pre-existing history without going red on day one |

## Use Cases

### UC-1: Maintainer measures whether the corpus's claims still hold

- **Trigger:** the sweep is invoked, on demand or by CI · **Preconditions:** an ADR corpus with at least one exit-0 Verification Log entry
- **Main flow:**
  1. Collect every exit-0 Verification Log entry in the corpus.
  2. Reduce to distinct `(task, digest)` pairs — the same fence proved twice is one claim.
  3. Partition: re-checkable (digest matches the task's current Acceptance fence) versus superseded.
  4. Re-run each re-checkable task's current fence.
  5. Report `false / re-checkable` plus the superseded and unrunnable counts on their own lines, naming every task that failed.
- **Failure paths:**
  - a. at step 3, a digest does not match the current fence → the claim proved a command that no longer exists; it is superseded and counted in neither half.
  - b. at step 4, the fence fails because the machine could not run it → unrunnable, counted in neither half, never reported as a false success.
  - c. at step 4, the fence fails on its own terms → a false success; the sweep names the task and exits non-zero.
  - d. the corpus has no exit-0 entry at all → there is no rate; say so rather than printing 0/0 as if it were clean.
- **Postconditions:** every exit-0 claim is in exactly one of four buckets — held, false, superseded, unrunnable — and the buckets sum to the distinct claim count.

### UC-2: Adopting team turns the sweep on over history they did not write

- **Trigger:** a repository with a pre-existing corpus runs the sweep for the first time · **Preconditions:** `.quality-harness.json` may carry `strictFrom`
- **Main flow:**
  1. The sweep runs as in UC-1.
  2. A false success on a record numbered below the `strictFrom` cutoff is reported as advice rather than as a failure.
  3. The verdict line says `[strictFrom]` so a demoted result is never mistaken for a clean one.
- **Failure paths:**
  - a. no `strictFrom` is configured → every record is in scope and the sweep fails on any false success.
- **Postconditions:** the count is unchanged by `strictFrom`; only the exit code is.

## Scenarios

### UC1-S1 [happy] A claim whose fence still passes is counted as held [@implemented] → `tests/sweep.test.mjs::a claim whose fence still passes is counted as held`

```gherkin
Given a task file with an exit-0 entry whose digest matches its current Acceptance fence
And that fence passes at HEAD
When the sweep runs
Then the claim is counted in the denominator and not in the numerator
And the reported rate is 0 over 1
```

### UC1-S2 [failure] A claim whose fence no longer passes is named and fails the sweep [@implemented] → `tests/sweep.test.mjs::a claim whose fence no longer passes is named and fails the sweep`

```gherkin
Given a task file with an exit-0 entry whose digest matches its current Acceptance fence
And that fence now exits non-zero on its own terms
When the sweep runs
Then the task and its fence are named in the output
And the claim is counted in the numerator
And the sweep exits non-zero
```

### UC1-S3 [failure] A superseded claim is counted in neither half [@implemented] → `tests/sweep.test.mjs::an entry whose digest no longer matches its fence is superseded`

```gherkin
Given a task file with an exit-0 entry whose digest does not match its current Acceptance fence
When the sweep runs
Then the claim is reported as superseded on its own line
And it appears in neither the numerator nor the denominator
And the sweep does not fail because of it
```

### UC1-S4 [failure] A fence the machine could not run is not a false success [@implemented] → `tests/sweep.test.mjs::a fence the machine could not run is not a false success`

```gherkin
Given a re-checkable claim whose fence fails because a required tool is absent from PATH
When the sweep runs
Then the claim is reported as unrunnable, naming the environment problem
And it appears in neither the numerator nor the denominator
And it is never reported as a false success
```

### UC1-S5 [failure] A corpus with no exit-0 claim reports no rate rather than a clean one [@implemented] → `tests/sweep.test.mjs::an empty corpus reports no claim rather than a clean sweep`

```gherkin
Given a corpus in which no task file carries an exit-0 Verification Log entry
When the sweep runs
Then the output says there is no claim to check
And no rate is printed
And the sweep does not report success
```

### UC2-S1 [happy] A record below the strictFrom cutoff is advised, not failed [@implemented] → `tests/sweep.test.mjs::a false success below the strictFrom cutoff is advice, not a failure`

```gherkin
Given `.quality-harness.json` sets strictFrom to ADR-005
And a false success is found in ADR-002
When the sweep runs
Then the finding is reported as advice
And the verdict line names strictFrom
And the sweep exits zero
```

### UC2-S2 [failure] A record at or above the cutoff still fails [@implemented] → `tests/sweep.test.mjs::a false success at or above the cutoff still fails`

```gherkin
Given `.quality-harness.json` sets strictFrom to ADR-005
And a false success is found in ADR-007
When the sweep runs
Then the finding is reported as a failure
And the sweep exits non-zero
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | The mutation campaign's ratio counts mutations, not recorded claims; `UNPROVEN` is in neither half of it. This spec adds a second, disjoint measurement and does not change that one. | `tests/sweep.test.mjs::every claim lands in exactly one bucket and the four sum to the total` | @implemented | `node --test tests/sweep.test.mjs` |
| F-2 | The corpus holds 16 exit-0 Verification Log entries over 15 task files, measured 2026-08-28. | `tests/sweep.test.mjs::two entries proving the same fence are one claim` | @implemented | `node --test tests/sweep.test.mjs` |
| F-3 | Nothing in the repository computes or names a false-success rate before this spec. | `tests/sweep.test.mjs::a claim whose fence no longer passes is named and fails the sweep` | @implemented | `node --test tests/sweep.test.mjs` |
| F-4 | A model verdict may never enter the evidence chain. The AUROC-0.65 finding for LLM judges (arXiv 2606.09863) confirms this existing rule; it is not re-decided here, and the sweep adds no judge. | `tests/sweep.test.mjs::a Mutation Log line is not a claim` | @implemented | `node --test tests/sweep.test.mjs` |
| F-5 | The population is exit-0 Verification Log entries, not `done` rows and not agent utterances. | `tests/sweep.test.mjs::a human-observed entry is not a claim` | @implemented | `node --test tests/sweep.test.mjs` |
| F-6 | A recorded entry does not store its command — only the fence's first line and a SHA-256 of the whole normalized fence — so re-running a claim means running the task's CURRENT fence. | `tests/sweep.test.mjs::a multi-line fence is re-checked whole, not by its first line` | @implemented | `node --test tests/sweep.test.mjs` |
| F-7 | A claim is FALSE when its task's current Acceptance fence does not exit 0 at HEAD on its own terms. | `tests/sweep.test.mjs::a claim whose fence still passes is counted as held` | @implemented | `node --test tests/sweep.test.mjs` |
| F-8 | An exit-0 entry whose digest does not match its task's current fence is SUPERSEDED: counted in neither half of the rate, and reported on its own line. | `tests/sweep.test.mjs::an entry whose digest no longer matches its fence is superseded` | @implemented | `node --test tests/sweep.test.mjs` |
| F-9 | Exit-0 entries sharing a task and a digest are one claim. The denominator counts distinct `(task, digest)` pairs, not log lines. | `tests/sweep.test.mjs::one task with two different digests is two claims` | @implemented | `node --test tests/sweep.test.mjs` |
| F-10 | A fence that fails because the machine could not run it is UNRUNNABLE, counted in neither half, and never reported as a false success. | `tests/sweep.test.mjs::a fence the machine could not run is not a false success` | @implemented | `node --test tests/sweep.test.mjs` |
| F-11 | Every claim lands in exactly one of held, false, superseded, unrunnable, and the four sum to the distinct claim count. | `tests/sweep.test.mjs::every claim lands in exactly one bucket and the four sum to the total` | @implemented | `node --test tests/sweep.test.mjs` |
| F-12 | A corpus with no exit-0 claim reports that there is nothing to check, and does not print a rate or report success. | `tests/sweep.test.mjs::an empty corpus reports no claim rather than a clean sweep` | @implemented | `node --test tests/sweep.test.mjs` |
| F-13 | A false success fails the sweep with a non-zero exit. | `tests/sweep.test.mjs::a false success at or above the cutoff still fails` | @implemented | `node --test tests/sweep.test.mjs` |
| F-14 | A false success on a record below the configured `strictFrom` cutoff is reported as advice, the verdict line names `strictFrom`, and the exit code is zero. | `tests/sweep.test.mjs::a false success below the strictFrom cutoff is advice, not a failure` | @implemented | `node --test tests/sweep.test.mjs` |
| F-15 | `strictFrom` changes the exit code only. The reported counts are identical with and without it. | `tests/sweep.test.mjs::strictFrom changes the exit code and nothing else` | @implemented | `node --test tests/sweep.test.mjs` |
| F-16 | The sweep never blocks a user's or a skill's attempt: it reads the corpus and runs recorded fences, and alters no file. | `tests/sweep.test.mjs::a sweep leaves the corpus byte-identical` | @implemented | `node --test tests/sweep.test.mjs` |
| F-17 | Each of the four buckets is exercised by a fixture, not only by whatever the live corpus happens to contain — the corpus holds zero superseded and zero unrunnable claims today, so those branches would otherwise never fire. | `tests/sweep.test.mjs::a fence that invokes the sweep is reported unrunnable and never executed` | @implemented | `node --test tests/sweep.test.mjs` |

## Domain

**Claim** — one distinct `(task file, acceptance digest)` pair carrying an exit-0 Verification Log
entry. **Bucket** — held · false · superseded · unrunnable; a claim is in exactly one.
**Rate** — false ÷ (held + false). Superseded and unrunnable are outside the ratio and reported
beside it, the way `UNPROVEN` sits beside the campaign ratio.

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| the sweep's CLI surface and exit code | add | CI, a maintainer, `scripts/selftest.sh` if it adopts the sweep |
| `.quality-harness.json` `strictFrom` | reuse unchanged | adopting corpora; the existing readers in `adr-lint` |
| Verification Log entry grammar | **none** — read only | `adr-verify` remains the sole writer |

## Non-Goals

- Generating mutations, or changing the campaign's ratio. (permanent: F-1 — two disjoint measurements, and conflating them would hide both.)
- Changing what `adr-verify` writes into a task file. (permanent: the entry already carries everything the sweep needs — F-6.)
- Any LLM judge, scorer, or model verdict anywhere in this mechanism. (permanent: F-4.)
- Measuring the AGENT's claims rather than the corpus's. That needs a session-transcript store this repository does not have. (deferred: revisit if one is ever added.)
- Trajectory evaluation beyond the single existing advisory, and the unresolved-pointer gates. (deferred: docs/BACKLOG.md §44, §45.)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The sweep re-runs 14 distinct fences, so it is far slower than any existing gate and gets skipped | High | High | It is a periodic sweep and a CI job, never a per-commit or per-edit gate; the fences it runs are the corpus's own, so the cost is already understood |
| A fence with a side effect is re-run outside its intended moment | Med | High | Fences in this corpus are test invocations; the sweep runs them unchanged and must not be given a way to skip or rewrite one — if a corpus has a destructive fence, that is a defect in the fence |
| The superseded and unrunnable branches never fire on the live corpus and rot into decoration | High | Med | F-17: each bucket has a fixture, and a mutation must make each branch's absence detectable |
| The rate is read as a quality score for the project rather than a freshness measure of its corpus | Med | Med | The output names what it measured and over what; the Problem section's 3/15 came from a mechanical move, not from bad work |
| `strictFrom` is used to make a real false success disappear | Low | High | F-15: the counts are identical with and without it, so a demoted finding is still counted and still printed |

## Open Questions

<!-- Empty. Every question the grill opened is decided and lands in the Facts table; the one deliberately unanswered item was non-behavioral and belongs to ADR-010. -->

## Verify

```bash
spec-verify --spec docs/specs/2026-08-28-a-claim-that-stopped-being-true.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 0 | Scouted, not asked: what does the corpus already record, and does anything measure it? | F-1, F-2, F-3, F-4 | 16 exit-0 entries over 15 tasks; the campaign ratio measures mutations; no false-success rate exists; a model verdict is already barred. |
| 1 | Which claims does the harness measure itself against? | F-5 | Exit-0 Verification Log entries — chosen over `done` rows, unfalsifiable-claim analysis, and agent utterances. |
| 2 | Scouted mid-grill: can a recorded entry's command be re-run as written? | F-6 | No. Only the first line and a digest are stored, so re-running means running the CURRENT fence — which is what makes the digest the discriminator. |
| 3 | What is an entry whose digest no longer matches the current fence? | F-8 | Superseded: neither half, reported on its own line — ADR-006's `UNPROVEN` shape. |
| 4 | Two entries prove the identical fence. Once or twice? | F-9 | Once. The denominator counts distinct `(task, digest)` pairs. |
| 5 | Derived from precedent, not asked: a fence that fails because the machine could not run it. | F-10 | Unrunnable, never a false success — `adr-verify::environment_failure()` already classifies it and ADR-005 makes it the rule. |
| 6 | Derived from precedent, not asked: does the sweep block anything? | F-16 | No. It reads and re-runs; it writes nothing. |
| 7 | What happens when a false success is found? | F-13, F-14, F-15 | The sweep fails. Adopting corpora are covered by the existing `strictFrom` cutoff, which changes the exit code and not the counts. |
| 8 | Measured during the grill: does the live corpus exercise every branch? | F-17 | No — zero superseded and zero unrunnable today, so both need fixtures or they are decoration. |
| 9 | Non-behavioral: which tool carries the sweep, and under what name? | non-behavioral | Deferred to the ADR. The behaviour above does not depend on whether it is a flag on an existing gate or a new one. |
