# Task ADR-126-T6: land names the Windows check once land/<sha> is pushed

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** the Windows check line
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

After `git push origin <sha>:refs/heads/land/<sha>` succeeds, `land.mjs` logs one line with the commands a Windows peer runs at
that sha (`git clone -c core.longpaths=true`, fetch the branch, `bash scripts/selftest.sh`), before it waits.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/windows-check.test.mjs` | create | the case (0 locks: new) |
| `scripts/land.mjs` | edit | after the staged push (:144-145) |
| `CLAUDE.md` | edit | §13: ask a Windows peer on a landing that changes a test or a reader |

## Ordered Steps

1. [S1] Write the failing test and record the red run: the line appears after the staged push and before the wait, names the
   full sha, and does not appear on a dry run or when the push failed.
2. [S2] Log it; add the sentence to §13.
3. [S3] Record a killed mutant, with a catalogue entry. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/windows-check.test.mjs 2>&1) \
  && for n in "land names the Windows check once land/<sha> is pushed, and only then"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `land names the Windows check once land/<sha> is pushed, and only then` | `tests/windows-check.test.mjs` | the line | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new test |
| 2 — something selects it | `land()` after the staged push |
| 3 — the caller can discover it | the line in its output |
| 4 — it is used | every landing |

## Mutation Log
- 2026-10-22 · 66ed9d88* · mutant killed · exit 1 · `scripts/land.mjs` · land names the Windows check once land/<sha> is pushed · acceptance-sha256:2392ce259489931454ef7d06a7c8c8bd27f6d0d48f11861fa338e2ae6eddcaca

## Invariants

- land's exit codes and pushes are unchanged.

## Risks

- None beyond a longer log.

## Stop Condition

Stop if the line would carry anything personal (§6): it names the public remote and the sha only.

## Out of Scope

- Sending the message (permanent: boundary: a script cannot reach another session).

## Verification Log
- 2026-10-22 · 66ed9d88* · exit 1 · `out=$(node --test --test-reporter=tap tests/windows-check.test.mjs 2>&1) \ …` · acceptance-sha256:2392ce259489931454ef7d06a7c8c8bd27f6d0d48f11861fa338e2ae6eddcaca · ms:198 · test-lock-sha256:6f137f2e065f14c9b7a3a7922d299f007e9d734f3efbc04caf6ef1d1055c4372 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvd2luZG93cy1jaGVjay50ZXN0Lm1qcwlsYW5kIG5hbWVzIHRoZSBXaW5kb3dzIGNoZWNrIG9uY2UgbGFuZC88c2hhPiBpcyBwdXNoZWQsIGFuZCBvbmx5IHRoZW4JOWIzZTg4MGQ0NDAyNTViYzEzYjc0ZGE3YzRhZGRlZTAyYjRiNmEyNTVjZDgwYTg2OTFkZjA4ZjhkZDM0ZWFmNg
  ```
  ```
- 2026-10-22 · 66ed9d88* · exit 0 · `out=$(node --test --test-reporter=tap tests/windows-check.test.mjs 2>&1) \ …` · acceptance-sha256:2392ce259489931454ef7d06a7c8c8bd27f6d0d48f11861fa338e2ae6eddcaca · ms:285
