# Task ADR-028-T1: Let a run record which ordered steps it exercised

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (one gate plus its tests)
**Owner:** unassigned
**Produces:** ` · steps:S1,S3` trailing Verification Log field, written by `adr-verify --steps` (T1)
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `an entry written without --steps is byte-compatible with every reader`, `a step id the task does not declare is refused before the run is armed`, `the field is written by the tool during a real run, never accepted as a claim`

## Goal

A run of a task's acceptance fence can record which ordered steps it exercised, in the same
tool-written entry that already records the exit code and the digest — and an entry written without
it stays exactly as valid as it is today.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-verify` | edit | the `--steps` flag, its validation, and the trailing entry field |
| `tests/evidence-chain.test.mjs` | edit | the writer/reader contract, asserted on the line the tool actually emits |
| `tests/mutations.json` | edit | two catalogue entries, or the checks are unproven (ADR-003) |

## Ordered Steps

1. [S1] Write the failing tests first: an entry written WITHOUT `--steps` must be byte-identical to what the tool emits today, and one written WITH it must carry a trailing ` · steps:S1,S3`. Confirm both red before the flag exists. (TDD red.) [proof: acceptance]
2. [S2] Parse `--steps`, and REFUSE a step id the task file does not declare in its Ordered Steps — before the mutant journal is armed and before the fence runs, the same ordering `--covers` uses. A field naming a step that does not exist is a pointer to nothing. [proof: acceptance]
3. [S3] Append the field to the entry, trailing and optional, under the existing grammar and inside the existing digest. [proof: acceptance]
4. [S4] Confirm every gate that parses this grammar still reads both forms: `adr-lint`, `adr-next`, `adr-retire-check`. [proof: acceptance]
5. [S5] Add two catalogue mutations and confirm both come back RED. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test tests/evidence-chain.test.mjs tests/gates.test.mjs 2>&1 | tee /tmp/adr028-t1.out \
  && ! grep -qE "no tests to run|^not ok|^# fail [1-9]" /tmp/adr028-t1.out \
  && python3 plugin/bin/adr-lint docs/adr/ADR-022-a-fence-names-what-its-claim-rests-on.md
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an entry without --steps is unchanged, and every reader still parses it` | `tests/evidence-chain.test.mjs` | the optional trailing field breaks no existing evidence (ADR-021) | — | S1, S3, S4 |
| `--steps refuses an id the task never declared` | `tests/evidence-chain.test.mjs` | the field cannot name a step that does not exist | — | S2 |
| `the steps field is written by the run, not accepted as a claim` | `tests/evidence-chain.test.mjs` | the value lands only on an entry the tool wrote from a real run | — | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `--steps` appears in `adr-verify`'s usage and the fence exercises it |
| 2 — something selects it | `adr-verify` is the only writer of a Verification Log entry, and the tests drive it as a CLI |
| 3 — the caller can discover it | the flag is in the gate's usage text beside `--covers`, which is the flag it mirrors |
| 4 — it is used | T2's advisory is what makes a reader want it; adoption across the corpus is not observable from here and a proxy would read like evidence |

## Mutation Log

- 2026-09-03 · e02d7c2 · mutant killed · exit 1 · `plugin/bin/adr-verify` · an undeclared step id must be refused, or the field can name a step that does not exist · acceptance-sha256:1cbc575d030255d5d4204d3a218d5f7671a27e543eccd1b56cf334f9304c5f52 · covers:a step id the task does not declare is refused before the run is armed
- 2026-09-03 · e02d7c2* · mutant killed · exit 1 · `plugin/bin/adr-next` · a reader too narrow for the new field stops seeing the row as evidence — ADR-021 calls that a change to the evidence · acceptance-sha256:1cbc575d030255d5d4204d3a218d5f7671a27e543eccd1b56cf334f9304c5f52 · covers:an entry written without --steps is byte-compatible with every reader
- 2026-09-03 · e02d7c2* · mutant killed · exit 1 · `plugin/bin/adr-verify` · the field must be written BY THE RUN; a writer that drops it silently would let the log claim a step nothing recorded · acceptance-sha256:1cbc575d030255d5d4204d3a218d5f7671a27e543eccd1b56cf334f9304c5f52 · covers:the field is written by the tool during a real run, never accepted as a claim

## Verification Log

- 2026-09-03 · e02d7c2 · exit 0 · `set -o pipefail …` · acceptance-sha256:1cbc575d030255d5d4204d3a218d5f7671a27e543eccd1b56cf334f9304c5f52 · ms:36250
- 2026-09-03 · e02d7c2* · exit 0 · `set -o pipefail …` · acceptance-sha256:1cbc575d030255d5d4204d3a218d5f7671a27e543eccd1b56cf334f9304c5f52 · ms:27728
- 2026-09-03 · e02d7c2* · exit 0 · `set -o pipefail …` · acceptance-sha256:1cbc575d030255d5d4204d3a218d5f7671a27e543eccd1b56cf334f9304c5f52 · ms:26926

## Invariants

- An entry written without `--steps` is byte-identical to what the tool emitted before this task.
- A step id not declared in the task's Ordered Steps is refused before the fence runs.
- The field is written only by a run that executed the fence — never from an assertion.
- The digest continues to cover the whole fence, unchanged.

## Risks

- Three gates parse this grammar and ADR-021 makes a lost evidence row a change to the evidence. The field is trailing and optional so every written entry stays valid; S4 checks each reader rather than assuming.

## Stop Condition

Stop if the field cannot be added without changing how an existing entry parses. A grammar change
that invalidates written evidence is not worth this feature — the evidence chain is the product, and
ADR-021 exists because a removed row is a change to the record.

## Out of Scope

- The advisory that consumes this field (T2)
- Per-step file attribution (deferred: docs/BACKLOG.md §114)
- Making step coverage affect `done` (permanent: boundary: ADR-028's Decision keeps it advisory, because a blocking rule would select for declaring fewer steps and then report the silence as coverage)
