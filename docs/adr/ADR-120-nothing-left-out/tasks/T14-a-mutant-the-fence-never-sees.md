# Task ADR-120-T14: A mutant the fence never sees is inconclusive; a missing dependency is could-not-run

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** the escape check and the missing-dependency grade in `adr-verify --mutant`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A mutant whose fence `cd`s to an existing directory outside the worktree copy is reported inconclusive with the reason, never survived; a clean fence that fails in the worktree for a missing module or dependency is could-not-run (exit 4), not a failure (exit 1).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/mutant-escape.test.mjs` | create | the rows below (0 locks: new) |
| `plugin/bin/adr-verify` | edit | before the clean run, find absolute paths in the fence text that name an existing directory outside the worktree (extending `fence_names_checkout`, :954-984); a survivor under one is inconclusive with "this fence never sees the mutated copy"; a clean failure whose output names a missing module (`BUILD_BROKE`, :349) in an isolated run exits 4 (:1956-1977) |
| `plugin/skills/adr-execute/SKILL.md` | edit | the two new outcomes |
| `tests/mutations/plugin/bin/adr-verify.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: a fence `cd /abs/other && node --test` (an existing directory outside the copy) with a mutant that the real tests would kill reads inconclusive, not survived; the same fence run with `--in-place` is unaffected; a fence that `cd`s into a directory inside the copy is unaffected; a clean fence that fails with `Cannot find module` in the worktree exits 4 with the hint; a clean fence that fails on an assertion still exits 1.
2. [S2] Implement both checks.
3. [S3] Document them in the skill. [proof: human: the skill wording, read in the round's review]
4. [S4] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/mutant-escape.test.mjs 2>&1) \
  && for n in "a fence that leaves the copy makes a survivor inconclusive" \
      "a missing dependency in the worktree is could-not-run, an assertion failure is not"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a fence that leaves the copy makes a survivor inconclusive` | `tests/mutant-escape.test.mjs` | the escape check | — | S1, S2 |
| `a missing dependency in the worktree is could-not-run, an assertion failure is not` | `tests/mutant-escape.test.mjs` | the grade | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | the hook or gate that calls it; the mutants on that call |
| 3 — the caller can discover it | the advice or output text, and the skill where one is named |
| 4 — it is used | every session or run of the gate in question |

## Mutation Log
- 2026-10-21 · f0504cf3* · mutant killed · exit 1 · `plugin/bin/adr-verify` · a fence that leaves the copy is not looked for · acceptance-sha256:917dfe1a53438007b6e56f721888d3cf2275f45d0993b35f7ab52caac7532eae
- 2026-10-21 · f0504cf3* · mutant killed · exit 1 · `plugin/bin/adr-verify` · an in-place run is judged for leaving the copy too · acceptance-sha256:917dfe1a53438007b6e56f721888d3cf2275f45d0993b35f7ab52caac7532eae
- 2026-10-21 · f0504cf3* · mutant killed · exit 1 · `plugin/bin/adr-verify` · a path that names no directory counts as leaving the copy · acceptance-sha256:917dfe1a53438007b6e56f721888d3cf2275f45d0993b35f7ab52caac7532eae
- 2026-10-21 · f0504cf3* · mutant killed · exit 1 · `plugin/bin/adr-verify` · a missing module in the worktree is a failure of the fence · acceptance-sha256:917dfe1a53438007b6e56f721888d3cf2275f45d0993b35f7ab52caac7532eae
- 2026-10-21 · f0504cf3* · mutant killed · exit 1 · `plugin/bin/adr-verify` · a missing module in place is could-not-run too · acceptance-sha256:917dfe1a53438007b6e56f721888d3cf2275f45d0993b35f7ab52caac7532eae
- 2026-10-21 · f0504cf3* · mutant killed · exit 1 · `plugin/bin/adr-verify` · the missing-module signature is not the one node prints · acceptance-sha256:917dfe1a53438007b6e56f721888d3cf2275f45d0993b35f7ab52caac7532eae

## Invariants

- Every locked test keeps its body; new tests go beside locked ones.
- Node and Go agree wherever both implement the rule.

## Risks

- A fence that names an outside directory for data only (a fixture path) loses its survivor verdict: it says so, and `--in-place` stays the remedy.

## Stop Condition

Stop if a survivor's fence names only a symlink or an environment variable: those stay undetected, as ADR-076 records.

## Out of Scope

- Following `$VAR` or symlinked paths in a fence (permanent: boundary: ADR-076 records them undetectable from the text)

## Verification Log
- 2026-10-21 · f0504cf3* · exit 1 · `out=$(node --test --test-reporter=tap tests/mutant-escape.test.mjs 2>&1) \ …` · acceptance-sha256:917dfe1a53438007b6e56f721888d3cf2275f45d0993b35f7ab52caac7532eae · ms:1979 · steps:S1 · test-lock-sha256:161cfa37022165b1213ca8287f941795dfeb98f085682427c3087e66c4253346 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvbXV0YW50LWVzY2FwZS50ZXN0Lm1qcwlhIGZlbmNlIHRoYXQgbGVhdmVzIHRoZSBjb3B5IG1ha2VzIGEgc3Vydml2b3IgaW5jb25jbHVzaXZlCTY5YWI3ZTkxN2FiYWI4MWM2YjBiZjRiMGMxY2QyZWMyNzM3MWZiODA0MjMwYmQzY2Y0OGY3MzA0MzFhYzNmMWUKYm9keQl0ZXN0cy9tdXRhbnQtZXNjYXBlLnRlc3QubWpzCWEgbWlzc2luZyBkZXBlbmRlbmN5IGluIHRoZSB3b3JrdHJlZSBpcyBjb3VsZC1ub3QtcnVuLCBhbiBhc3NlcnRpb24gZmFpbHVyZSBpcyBub3QJMTc2YmUxOTEyYjk4MWUxZmE2Y2RjMjAwYzU3YzcwYzIyNzFiZTA2YTAwOTI5MDdiMDNhZTM5YTk1MmIwZDdmMg
  ```
  ```
- 2026-10-21 · f0504cf3* · exit 0 · `out=$(node --test --test-reporter=tap tests/mutant-escape.test.mjs 2>&1) \ …` · acceptance-sha256:917dfe1a53438007b6e56f721888d3cf2275f45d0993b35f7ab52caac7532eae · ms:6484
- 2026-10-21 · f0504cf3* · exit 0 · `out=$(node --test --test-reporter=tap tests/mutant-escape.test.mjs 2>&1) \ …` · acceptance-sha256:917dfe1a53438007b6e56f721888d3cf2275f45d0993b35f7ab52caac7532eae · ms:6984
- 2026-10-21 · f0504cf3* · exit 0 · `out=$(node --test --test-reporter=tap tests/mutant-escape.test.mjs 2>&1) \ …` · acceptance-sha256:917dfe1a53438007b6e56f721888d3cf2275f45d0993b35f7ab52caac7532eae · ms:5382
- 2026-10-21 · f0504cf3* · exit 0 · `out=$(node --test --test-reporter=tap tests/mutant-escape.test.mjs 2>&1) \ …` · acceptance-sha256:917dfe1a53438007b6e56f721888d3cf2275f45d0993b35f7ab52caac7532eae · ms:4785
- 2026-10-21 · f0504cf3* · exit 0 · `out=$(node --test --test-reporter=tap tests/mutant-escape.test.mjs 2>&1) \ …` · acceptance-sha256:917dfe1a53438007b6e56f721888d3cf2275f45d0993b35f7ab52caac7532eae · ms:6655
- 2026-10-21 · f0504cf3* · exit 0 · `out=$(node --test --test-reporter=tap tests/mutant-escape.test.mjs 2>&1) \ …` · acceptance-sha256:917dfe1a53438007b6e56f721888d3cf2275f45d0993b35f7ab52caac7532eae · ms:4724
- 2026-10-21 · f0504cf3* · exit 0 · `out=$(node --test --test-reporter=tap tests/mutant-escape.test.mjs 2>&1) \ …` · acceptance-sha256:917dfe1a53438007b6e56f721888d3cf2275f45d0993b35f7ab52caac7532eae · ms:6699 · steps:S1,S2
- 2026-10-21 · human-observed · observed by the coordinator: the adr-execute skill's paragraph on this task's behaviour matches adr-verify; approved · acceptance-sha256:917dfe1a53438007b6e56f721888d3cf2275f45d0993b35f7ab52caac7532eae
