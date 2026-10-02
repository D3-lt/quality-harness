# Task ADR-083-T4: No verdict on this corpus changes

**Depends-on:** T2, T3
**Covers:** none — the bar ADR-079 T4 set for a reader change
**Estimated scope:** S (one run of an existing comparator)
**Owner:** unassigned
**Produces:** none
**Consumes:** hasher 3 (T2)
**Data dependency:** live: this repository's records and specs, and `plugin/` rebuilt from git at e8a3de8
**Proof map:** v1
**Rests-on:** `the comparator can fail`, `the comparison is empty`

## Goal

Every record's `adr-lint` verdict and every spec's `spec-verify` verdict is the same with `plugin/` at e8a3de8 (3.7.2) and with the candidate (ADR-083 Context).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/adr/ADR-083-the-lexer-reads-jsx/tasks/T4-no-verdict-changes.md` | edit | its own logs, written by adr-verify |

## Ordered Steps

1. [S1] Record the red run with the candidate plugin set aside: the comparator cannot run without both sides. [proof: acceptance]
2. [S2] Run the comparison against e8a3de8; its `--control` must fail first. [proof: acceptance]
3. [S3] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
bash scripts/verdict-diff.sh --control e8a3de8; test $? -eq 1 && bash scripts/verdict-diff.sh e8a3de8
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the comparator |
| 2 — something selects it | this task's fence, before the release |
| 3 — the caller can discover it | the diff it prints |
| 4 — it is used | the release decision |

## Mutation Log
- 2026-10-02 · c454442* · mutant killed · exit 1 · `scripts/verdict-diff.sh` · the comparator reports no change whatever the two sides printed · acceptance-sha256:2ad50a201b848cffe90382a0aa7ba8108127c1e28af09095df5d23f8f65b1b6e · covers:the comparator can fail
- 2026-10-02 · c454442* · mutant killed · exit 1 · `scripts/verdict-diff.sh` · the version stamp and its plugin path are left in, so two identical verdicts compare different · acceptance-sha256:2ad50a201b848cffe90382a0aa7ba8108127c1e28af09095df5d23f8f65b1b6e · covers:the comparison is empty

## Invariants

- The baseline is rebuilt from git, never retaken after an edit.

## Risks

- None beyond ADR-079 T4's.

## Stop Condition

Stop and ask if the diff is not empty.

## Out of Scope

- Corpora we do not own: the outside runs (the record's Follow-ups).

## Verification Log
- 2026-10-02 · c454442* · exit 1 · `bash scripts/verdict-diff.sh --control e8a3de8; test $? -eq 1 && bash scripts/verdict-diff.sh e8a3de8` · acceptance-sha256:2ad50a201b848cffe90382a0aa7ba8108127c1e28af09095df5d23f8f65b1b6e · ms:45 · test-lock-sha256:45419203407b89188dc409625a7362a6e56333c1910c4b1c62b5d441ff914bb4 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2
  ```
  --- last 1 line(s) of stderr
  bash: scripts/verdict-diff.sh: No such file or directory
  ```
- 2026-10-02 · c454442* · exit 0 · `bash scripts/verdict-diff.sh --control e8a3de8; test $? -eq 1 && bash scripts/verdict-diff.sh e8a3de8` · acceptance-sha256:2ad50a201b848cffe90382a0aa7ba8108127c1e28af09095df5d23f8f65b1b6e · ms:147648
- 2026-10-02 · c454442* · exit 0 · `bash scripts/verdict-diff.sh --control e8a3de8; test $? -eq 1 && bash scripts/verdict-diff.sh e8a3de8` · acceptance-sha256:2ad50a201b848cffe90382a0aa7ba8108127c1e28af09095df5d23f8f65b1b6e · ms:162183
