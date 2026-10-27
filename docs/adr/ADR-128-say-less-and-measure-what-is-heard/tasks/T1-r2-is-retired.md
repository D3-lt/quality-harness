# Task ADR-128-T1: R2 is retired; no turn end names a commit below HEAD

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** L (cross-boundary: Node and Go turn ends)
**Owner:** unassigned
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Remove R2 (`unchecked-commits`) from both turn ends, with `sessionCommits`, `uncheckedCommitsReason` and the upstream
exclusion, so nothing at Stop names a commit below HEAD; R1 keeps speaking for the tree.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/completion-rules.mjs` | edit | drop the R2 rule and `uncheckedCommitsReason` |
| `plugin/scripts/tree-facts.mjs` | edit | drop `sessionCommits` and `remoteHead` |
| `core/hooks/turnend.go` | edit | the Go R2 |
| `core/hooks/treefacts.go` | edit | the Go `sessionCommits` and `remoteHead` |
| `tests/r2-remote-commits.test.mjs` | delete | its subject is gone |
| `tests/r2-retired.test.mjs` | add | the new invariant |
| `tests/mutations/plugin/scripts/tree-facts.mjs.json`, `completion-rules.mjs.json`, `core/hooks/treefacts.go.json` | edit | retire R2's mutants |

## Ordered Steps

1. [S1] Write `tests/r2-retired.test.mjs`: a session that commits an unchecked tree, then commits a checked fix, ends with no
   commit named, under Node and the Go core (red today).
2. [S2] Run `python3 scripts/test-locks.py` on every test that names R2 (`mrw read tests --grep 'unchecked-commits|newly
   reachable commit' --count` gave 7 files on 2026-10-23). A locked body is not edited: record each lock and retire it through
   its owning task, or keep it if it asserts R1 only. [proof: human: the locks found and each one's disposition are in the commit message]
3. [S3] Remove R2 from both cores, then `orphan-sweep` and `dead-code-scan` for what it orphaned.
4. [S4] Close BACKLOG §411, §416 and §420 as retired with R2. [proof: human: the three closing lines name this task]

## Acceptance

```bash
node --test --test-reporter=tap tests/r2-retired.test.mjs && QUALITY_HARNESS_HOOK_IMPL=go node --test --test-reporter=tap tests/r2-retired.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `no turn end names a commit below HEAD` | `tests/r2-retired.test.mjs` | R2 is gone in both cores | — | S1, S3 |
| `R1 still names an unchecked tree` | `tests/r2-retired.test.mjs` | the dirty twin: R1 is untouched | — | S3 |

## Mutation Log
- 2026-10-27 · 34e79f7d* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · R1 is never queued at Stop, so an unchecked tree goes unnamed · acceptance-sha256:a82e34114205a20134b879abc9b55bb378b4e03c165ddecba354312df48b8802

## Invariants

- R1's text and keys are unchanged; the publish refusal is unchanged.

## Risks

- A locked test asserts R2's text: S2 names it before anything is removed; a lock is never edited past.
- No doubles: the tests run the real hook in a scratch repository.

## Stop Condition

A locked test that asserts R2 has no owning task that can retire it: stop and ask.

## Out of Scope

- Naming an unchecked commit any other way (permanent: boundary: the owner, 2026-10-23, "R2 check only head").

## Verification Log
- 2026-10-27 · 34e79f7d* · exit 1 · `node --test --test-reporter=tap tests/r2-retired.test.mjs && QUALITY_HARNESS_HOOK_IMPL=go node --test --test-reporter=tap tests/r2-retired.test.mjs` · acceptance-sha256:a82e34114205a20134b879abc9b55bb378b4e03c165ddecba354312df48b8802 · ms:1669 · test-lock-sha256:cdfbef29308814da89e119357b4da8f5569aa4b3a3c9d1011c071595aae0d693 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcjItcmV0aXJlZC50ZXN0Lm1qcwlSMSBzdGlsbCBuYW1lcyBhbiB1bmNoZWNrZWQgdHJlZQlmMTkxYjdmNWUwYmI2OTgyMDNlMWMwZTBhYWZmYjM4YzMzMDRkZjcyZTVjOTM4NzdmYmUwMTZjMjA1ODg5NjgzCmJvZHkJdGVzdHMvcjItcmV0aXJlZC50ZXN0Lm1qcwlubyB0dXJuIGVuZCBuYW1lcyBhIGNvbW1pdCBiZWxvdyBIRUFECTk1MTFiNDkzYjUwNTdjOTU0N2MyMzIyOTU0Nzk4NDViZTM2Nzg0ZmJiNGUwNDU1NWE4NDg4YmFlOTE5Yjg0M2I
  ```
  --- last 10 line(s) of stdout (of 48 after folding 48 raw)
    ...
  1..2
  # tests 2
  # suites 0
  # pass 1
  # fail 1
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 1523.333042
  ```
- 2026-10-27 · 34e79f7d* · exit 0 · `node --test --test-reporter=tap tests/r2-retired.test.mjs && QUALITY_HARNESS_HOOK_IMPL=go node --test --test-reporter=tap tests/r2-retired.test.mjs` · acceptance-sha256:a82e34114205a20134b879abc9b55bb378b4e03c165ddecba354312df48b8802 · ms:2870
- 2026-10-27 · 34e79f7d* · exit 1 · `node --test --test-reporter=tap tests/r2-retired.test.mjs && QUALITY_HARNESS_HOOK_IMPL=go node --test --test-reporter=tap tests/r2-retired.test.mjs` · acceptance-sha256:a82e34114205a20134b879abc9b55bb378b4e03c165ddecba354312df48b8802 · ms:1700
  ```
  --- last 10 line(s) of stdout (of 70 after folding 70 raw)
    ...
  1..2
  # tests 2
  # suites 0
  # pass 0
  # fail 2
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 154.9435
  ```
- 2026-10-27 · 34e79f7d* · exit 0 · `node --test --test-reporter=tap tests/r2-retired.test.mjs && QUALITY_HARNESS_HOOK_IMPL=go node --test --test-reporter=tap tests/r2-retired.test.mjs` · acceptance-sha256:a82e34114205a20134b879abc9b55bb378b4e03c165ddecba354312df48b8802 · ms:2832
