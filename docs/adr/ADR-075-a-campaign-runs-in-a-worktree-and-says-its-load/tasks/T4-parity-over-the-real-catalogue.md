# Task ADR-075-T4: An isolated campaign grades the real catalogue as an in-place one does

**Depends-on:** T2
**Covers:** F-14, F-15
**Estimated scope:** M (one repository script, its test, one long measured run)
**Owner:** unassigned
**Produces:** `scripts/campaign-parity.mjs`
**Consumes:** `--in-place`, `isolate()` and the "worktree built in N ms" line (T2)
**Data dependency:** needs this repository's real catalogue at the commit under test, and a machine whose load is below its core count for the run (costly-runs)
**Proof map:** v1
**Rests-on:** `a mismatch is reported`, `the overhead bound is enforced`

## Goal

Isolation becomes the default only on evidence. Paired uncached runs, in-place and isolated, over the same content on the same machine, give the same selection and the same verdict for every entry in a declared set of the real catalogue, and every worktree is built in under 2 s.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/campaign-parity.mjs` | add | clones the commit under test into `<git-common-dir>/qh-parity/<id>` (never under the temp root, for the reason F-9 gives), commits there a catalogue holding only the declared entries, runs `mutate --root <clone> --no-cache --in-place` and `mutate --root <clone> --no-cache`, and compares per entry the label, the verdict and the baseline outcome. Exits 1 on any mismatch, or on any "worktree built in N ms" over 2000; prints both runs' lines and the counts; removes the clone |
| `tests/campaign-parity.test.mjs` | add | `compareRuns` finds a mismatch in a verdict, in a baseline and in the set of labels, and finds none in two equal runs; the script over the spec's fixture repository reports zero mismatches |

## Ordered Steps

1. [S1] Write `tests/campaign-parity.test.mjs` and see it fail on an assertion (TDD red). [proof: acceptance]
2. [S2] `scripts/campaign-parity.mjs` with an exported `compareRuns(inPlace, isolated)`, a `--tests <file>` filter (every entry whose `tests` include it) and `--shard i/n`, run as S1's test drives it.
3. [S3] Run the declared set once, detached, at load below the core count: `--tests tests/lifecycle.test.mjs` (122 entries on 2026-09-30; three of them, labelled "scratch corpora", "a drifted template" and "a template the user does not have", are the scratch-versus-project case), then `--shard 1/48`. Record the run with `adr-verify --human "<the two runs' counts, their worktree times and the commit>"`. [proof: human: the maintainer reads both runs' printed counts, confirms zero mismatches and every worktree under 2000 ms, and names the commit they ran at]
4. [S4] Record one killed mutant per Rests-on name with `adr-verify --mutant`. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/campaign-parity.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE 'ok [0-9]+ - (compareRuns finds a mismatch in a verdict, a baseline or the entries, and none in equal runs|the parity script finds no mismatch over the fixture repository, and builds each worktree in under 2 s)' "$T")" -eq 2
```

S3's real-catalogue runs are the completion criterion, and they are too long for a fence the gate re-runs. Their evidence is the human-observed sign-off S3 records, taken from the script's own printed counts.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `compareRuns finds a mismatch in a verdict, a baseline or the entries, and none in equal runs` | `tests/campaign-parity.test.mjs` | the comparison can return dirty, and clean when equal | F-14 | S2 |
| `the parity script finds no mismatch over the fixture repository, and builds each worktree in under 2 s` | `tests/campaign-parity.test.mjs` | the paired runs, their selection and the overhead bound, end to end | F-14, F-15 | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `scripts/campaign-parity.mjs` and its test |
| 2 — something selects it | S3's recorded run over the real catalogue |
| 3 — the caller can discover it | its usage line; ADR-075's Decision names it |
| 4 — it is used | once per change to the campaign's isolation; nothing schedules it |

## Mutation Log
- 2026-09-30 · 5426e53* · mutant killed · exit 1 · `scripts/campaign-parity.mjs` · no mismatch is ever reported, so every paired run reads as parity · acceptance-sha256:cb42d1e9652b84dbc147e0ae8bc9b456128898361e7bd28455b5c12abda9d3a5 · covers:a mismatch is reported
- 2026-09-30 · 5426e53* · mutant killed · exit 1 · `scripts/campaign-parity.mjs` · a worktree slower than the budget passes · acceptance-sha256:cb42d1e9652b84dbc147e0ae8bc9b456128898361e7bd28455b5c12abda9d3a5 · covers:the overhead bound is enforced

## Invariants

- The clone lives outside the temp root and is removed after the run.
- Both runs are uncached and read the same commit on the same machine; nothing else varies.

## Risks

- A test that reads the catalogue itself sees the declared subset in the clone; none of the 122 does (checked when S3 runs, and named in its sign-off if one does).

## Stop Condition

Stop and ask on any mismatch or any worktree over 2000 ms: isolation must not become the default until the cause is known.

## Out of Scope

- Parity for the whole catalogue in one run (deferred: docs/research/2026-09-30-the-nervous-system-plan.md)

## Verification Log
- 2026-09-30 · 5426e53* · exit 1 · `set -o pipefail …` · acceptance-sha256:cb42d1e9652b84dbc147e0ae8bc9b456128898361e7bd28455b5c12abda9d3a5 · ms:177 · test-lock-sha256:3f81420b1058e8bbcee3262d7cd2c7b38aa5579e7212721e063249745084f414 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2NhbXBhaWduLXBhcml0eS50ZXN0Lm1qcwljb21wYXJlUnVucyBmaW5kcyBhIG1pc21hdGNoIGluIGEgdmVyZGljdCwgYSBiYXNlbGluZSBvciB0aGUgZW50cmllcywgYW5kIG5vbmUgaW4gZXF1YWwgcnVucwlmYzMxZWJkMjA4MTJkMTRlY2EwZTZjNjQ5NTIwM2MyZWFjMGE3ODllNjVmM2Q5Yjg2NGJmNGVmOWRiN2JmMDBiCmJvZHkJdGVzdHMvY2FtcGFpZ24tcGFyaXR5LnRlc3QubWpzCXRoZSBwYXJpdHkgc2NyaXB0IGZpbmRzIG5vIG1pc21hdGNoIG92ZXIgdGhlIGZpeHR1cmUgcmVwb3NpdG9yeSwgYW5kIGJ1aWxkcyBlYWNoIHdvcmt0cmVlIGluIHVuZGVyIDIgcwljZDA4NjU0YjA2ZDhiMGM3M2RmMTZjMWU3Y2Q0ZjU3ZTliNjU1NDNkZDA5M2Y4YTU2ODdhYzFiNjUzNzE5ZjQ1
  ```
  --- last 10 line(s) of stdout (of 40 after folding 40 raw)
    ...
  1..1
  # tests 1
  # suites 0
  # pass 0
  # fail 1
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 76.923625
  ```
- 2026-09-30 · 5426e53* · exit 0 · `set -o pipefail …` · acceptance-sha256:cb42d1e9652b84dbc147e0ae8bc9b456128898361e7bd28455b5c12abda9d3a5 · ms:3375
- 2026-09-30 · 5426e53* · exit 0 · `set -o pipefail …` · acceptance-sha256:cb42d1e9652b84dbc147e0ae8bc9b456128898361e7bd28455b5c12abda9d3a5 · ms:3398
- 2026-09-30 · human-observed · Zy (owner) signed off 2026-09-30: S3 — parity counts approved: 122 lifecycle entries 0 mismatches (worktree 193 ms) and --shard 1/48 38 entries 0 mismatches (116 ms), measured at 5426e53
