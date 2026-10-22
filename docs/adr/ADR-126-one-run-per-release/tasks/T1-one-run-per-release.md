# Task ADR-126-T1: A landing's push run is the release's full campaign, and main runs nothing of its own

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `release-evidence` clears a `land/<sha>` push run; the workflow's push trigger is `land/**` only
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

The workflow runs the full mutation campaign on every push to `land/**` and runs nothing on a push to `main`;
`release-evidence` reads a `push` run on `land/<its sha>` as a full campaign, and a pull request's run as cached.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/one-run-release.test.mjs` | create | the cases (0 locks: new) |
| `.github/workflows/selftest.yml` | edit | `on.push.branches` (:9); `QUALITY_HARNESS_FULL_CAMPAIGN` (:296) |
| `scripts/release-evidence.mjs` | edit | `evaluateRun`'s cached rule (:101-109); `fetchRun` asks for `headBranch` (:223) |
| `tests/mutations/scripts/release-evidence.mjs.json` | edit | the mechanism's mutant |

## Ordered Steps

1. [S1] Write the failing test and record the red run: a push run on `land/<sha>` is success; a push on any other branch and a
   pull request are cached; the workflow's push trigger names `land/**` alone; its full-campaign switch is true for a push to
   `land/**`.
2. [S2] Change the trigger and the switch; `evaluateRun` reads `headBranch`; `fetchRun` requests it.
3. [S3] Record a killed mutant, with a catalogue entry. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/one-run-release.test.mjs 2>&1) \
  && for n in "a push to land/<sha> is a full campaign, and any other push or a pull request is not" \
      "the workflow runs on land pushes, never on a push to main, and every land push is a full campaign"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a push to land/<sha> is a full campaign, and any other push or a pull request is not` | `tests/one-run-release.test.mjs` | `evaluateRun` | — | S1, S2 |
| `the workflow runs on land pushes, never on a push to main, and every land push is a full campaign` | `tests/one-run-release.test.mjs` | the workflow text | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | `main` calls `evaluateRun` on the run `fetchRun` returns |
| 3 — the caller can discover it | the SUCCESS line names the run |
| 4 — it is used | `scripts/release.mjs` step 5 |

## Mutation Log
- 2026-10-22 · 20c8615f* · mutant killed · exit 1 · `scripts/release-evidence.mjs` · only the landing branch of its own sha is a full campaign · acceptance-sha256:1b3592e89a1196ffde1ff27f5e501ce964e3efc26297fdc4f5f259e5fefbe634

## Invariants

- A run whose campaign may have reused verdicts is never cleared.

## Risks

- `headBranch` absent from an older run's answer: then it is cached, the safe side.

## Stop Condition

Stop if the forge's required checks stop arriving at a sha once main's push run is gone.

## Out of Scope

- The dispatch step in `release.mjs` (T5).

## Verification Log
- 2026-10-22 · 20c8615f* · exit 1 · `out=$(node --test --test-reporter=tap tests/one-run-release.test.mjs 2>&1) \ …` · acceptance-sha256:1b3592e89a1196ffde1ff27f5e501ce964e3efc26297fdc4f5f259e5fefbe634 · ms:203 · test-lock-sha256:24d621eaa57c9c405d049ecd36b4e3eeecdcc9dbc9c191390ddf6dc38c21d798 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvb25lLXJ1bi1yZWxlYXNlLnRlc3QubWpzCWEgcHVzaCB0byBsYW5kLzxzaGE-IGlzIGEgZnVsbCBjYW1wYWlnbiwgYW5kIGFueSBvdGhlciBwdXNoIG9yIGEgcHVsbCByZXF1ZXN0IGlzIG5vdAlmMTRkNzk2ZmUwMTAzMmViZjAzYmEzYzU0YTZlMmIzZTBlODY0YjBmYWYyOTY4ODAwZDVmYzA5MzkyYTQ1OTdhCmJvZHkJdGVzdHMvb25lLXJ1bi1yZWxlYXNlLnRlc3QubWpzCXRoZSB3b3JrZmxvdyBydW5zIG9uIGxhbmQgcHVzaGVzLCBuZXZlciBvbiBhIHB1c2ggdG8gbWFpbiwgYW5kIGV2ZXJ5IGxhbmQgcHVzaCBpcyBhIGZ1bGwgY2FtcGFpZ24JM2VkMzllYmZlNjhlZGExMmU4M2VlM2NiODVhNGI0MTM1ZTNmYjIyYmE4NGNhY2Q3YmJlMTQ2YmFkNGZkZmQ1ZQ
  ```
  ```
- 2026-10-22 · 20c8615f* · exit 0 · `out=$(node --test --test-reporter=tap tests/one-run-release.test.mjs 2>&1) \ …` · acceptance-sha256:1b3592e89a1196ffde1ff27f5e501ce964e3efc26297fdc4f5f259e5fefbe634 · ms:261
- 2026-10-22 · 6f2fc73e · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:1b3592e89a1196ffde1ff27f5e501ce964e3efc26297fdc4f5f259e5fefbe634 · ms:0 · test-lock-sha256:7c29029aedd11181bf261e2cf251c1bbd60719b4f5ebb0c12e4405e4eac801df · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvb25lLXJ1bi1yZWxlYXNlLnRlc3QubWpzCWEgcHVzaCB0byBsYW5kLzxzaGE-IGlzIGEgZnVsbCBjYW1wYWlnbiwgYW5kIGFueSBvdGhlciBwdXNoIG9yIGEgcHVsbCByZXF1ZXN0IGlzIG5vdAlmMTRkNzk2ZmUwMTAzMmViZjAzYmEzYzU0YTZlMmIzZTBlODY0YjBmYWYyOTY4ODAwZDVmYzA5MzkyYTQ1OTdhCmJvZHkJdGVzdHMvb25lLXJ1bi1yZWxlYXNlLnRlc3QubWpzCXRoZSB3b3JrZmxvdyBydW5zIG9uIGxhbmQgcHVzaGVzLCBuZXZlciBvbiBhIHB1c2ggdG8gbWFpbiwgYW5kIGV2ZXJ5IGxhbmQgcHVzaCBpcyBhIGZ1bGwgY2FtcGFpZ24JOWQ0NjM3NmVmNzZkMjVmOWVhNWZkYWUxOTQ0NGE0NmZkMTlkNWQ3YjJmMjAzNTVmNjVmMTFlOTYwZmE3Y2FjYQ · test-lock-kind:replace
