# Task ADR-020-T4: The floor reads every row that claims a machine run, digest or not

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one file, two call sites)
**Owner:** unassigned
**Produces:** `VLOG_TIMED_RE` (T2)
**Consumes:** `implausibly_fast()` (T1), the extended Verification Log grammar (T1)
**Proof map:** v1

## Goal

Make the duration floor and the digest-less notice read the same set of rows: every
entry claiming that a machine ran something. Both were written against a pattern of
their own — the floor against `VLOG_DIGEST_RE`, the notice against `VLOG_LEGACY_RE` —
and the two were never asked to agree, so a row spelled

    - 2026-09-03 · deadbee · exit 0 · `docker run --rm golang:1 go vet ./...` · ms:3

is a valid entry under `VLOG_RE`, matches neither of the other two, and is seen by
neither check.

**What this is NOT.** It is not a route to a forged `done`. Measured through
`check_verification` before any code was written: such a row proves nothing, and a
task resting on it is refused elsewhere for carrying no digest-bearing entry
(`README.md: T1 marked done but no exit-0 entry carries the current Acceptance
digest`). What it does is sit in a log beside honest evidence, claiming `exit 0` in
3ms against a fence that starts a container, with every gate silent. Stated at that
size deliberately: inflating it would be the same false-success defect this record
exists to detect, one register over.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | adds `VLOG_TIMED_RE`, points the floor and the digest-less notice at it, and reuses `MS_FIELD` in `VLOG_RE` where the duration was spelled a second time |
| `tests/gate-regressions.py` | edit | the regression, driven through the `adr-lint` CLI on a git fixture — the boundary the defect was found at |
| `tests/mutations.json` | edit | registers the call-site mutant that reintroduces exactly this bug |

## Ordered Steps

1. [S1] Write the failing regression first (TDD red), through the SHIPPED CLI on a real git fixture: an honest digest row plus a digest-less `ms:3` row appended after the commit, asserting the floor speaks AND the digest-less notice speaks. Both must fail before any code changes. [proof: acceptance]
2. [S2] Add `VLOG_TIMED_RE` — an exit code, a command, an OPTIONAL digest, an optional duration — and point the floor and the digest-less notice at it. [proof: acceptance]
3. [S3] Leave `VLOG_LEGACY_RE` NARROW. It is load-bearing at the done-proving path (`legacy_matches`), where a legacy row can carry a single-line fence to `done`; widening it with `MS_FIELD` — the first fix considered — would have loosened what proves completion while trying to check it. Assert the done-proving path is unchanged by keeping the corpus green. [proof: acceptance]
4. [S4] Assert the wider pattern never matches a row the entry grammar rejects: everything `VLOG_TIMED_RE` matches, `VLOG_RE` matches. A notice that fires on a non-entry is advising about something no reader considers evidence. [proof: acceptance]
5. [S5] Register the mutation that swaps `VLOG_TIMED_RE` back to `VLOG_DIGEST_RE` at the CALL SITE, and confirm it is RED. A mutant inside the new pattern's body would prove nothing this task is about — that is the lesson T1 paid for. [proof: mutation]

## Acceptance

```bash
set -o pipefail
python3 tests/gate-regressions.py plugin/bin plugin/skills/postmortem/SKILL.md . 2>&1 | tee /tmp/adr020-t4.out \
  && ! grep -qiE "traceback|assertionerror" /tmp/adr020-t4.out \
  && grep -q "the floor reads every row that claims a machine run" tests/mutations.json
```

<The catalogue grep is chained with `&&` for T1's reason: a passing harness alone
cannot carry the verdict, because the mutation label is half of what this task
produces and CI gates on the campaign's answer rather than on this fence's.>

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a digest-less row cannot hide behind a duration` | `tests/gate-regressions.py` | the floor and the digest-less notice both see a row that carries `ms:` and no digest | — | S1, S2 |
| `an honest log stays silent` | `tests/gate-regressions.py` | capable of clean on the SAME fixture — without it both assertions above pass against a gate that shouts at every corpus | — | S1 |
| `the wider pattern matches only rows the entry grammar accepts` | `tests/gate-regressions.py` | `VLOG_TIMED_RE` ⊆ `VLOG_RE`, and a human sign-off is not a machine run | — | S4 |

<All three names live in one test function whose assertions carry these names in
their messages; the rows are backticked so the Tests reader keeps them.>

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `VLOG_TIMED_RE` is asserted directly in S4 |
| 2 — something selects it | TWO call sites, and each is asked separately: `check_verification` reads `timed = VLOG_TIMED_RE.match(row)` for the floor and for the digest-less notice. The mutation `lint: the floor reads every row that claims a machine run` swaps that ONE line back to `VLOG_DIGEST_RE` and both assertions in the regression go red. Deleting the pattern instead would redden S4 only — the difference T1 shipped without |
| 3 — the caller can discover it | the pattern sits between `VLOG_DIGEST_RE` and `VLOG_LEGACY_RE` with a comment saying which path may use which, so the next reader does not widen the legacy one |
| 4 — it is used | the corpus is linted by CI on every push; the notice fires on any digest-less row not already committed |

## Invariants

- `VLOG_LEGACY_RE` is unchanged, and nothing new can prove a task `done`.
- Everything `VLOG_TIMED_RE` matches is an entry `VLOG_RE` already accepts.
- The floor stays advisory; it never enters the blocking channel (CLAUDE.md §3).
- A row with no `ms:` is not floored — there is nothing to check, and saying otherwise would be a verdict from an observation not made (ADR-005).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Widening the pattern lets a hand-typed row prove `done` | Low | High | S3: the done-proving path keeps `VLOG_LEGACY_RE`; measured before the fix that a duration-bearing digest-less row proves nothing today, and it still proves nothing |
| The digest-less notice now fires on rows a corpus already holds | Low | Med | unchanged: it is still gated on `known is not None and row not in known`, so anything HEAD already carries stays silent |

## Stop Condition

Stop and return to the record if closing this requires touching `VLOG_LEGACY_RE`
or the done-proving path. This task is about what the floor SEES, not about what
counts as completion; if the two cannot be separated, the record is wrong about
its own layering and that is a decision, not an edit.

## Out of Scope

- A repository-owned gate that fails when a plugin function is defined and never referenced (deferred: docs/BACKLOG.md §99)
- `gitBranch()` in `plugin/scripts/lifecycle.mjs`, dead since the branch guard was removed (deferred: docs/BACKLOG.md §100)

## Verification Log

- 2026-09-01 · 3d625f6 · exit 0 · `set -o pipefail …` · acceptance-sha256:1719b42f9ae1188b7e9e3db95f80cbd71a447dff58a0f3ac6054b3fd161650bb · ms:3465

## Mutation Log
