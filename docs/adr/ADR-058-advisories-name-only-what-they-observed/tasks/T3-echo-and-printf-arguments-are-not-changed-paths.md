# Task ADR-058-T3: Echo and printf arguments are not changed paths

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** none
**Consumes:** `tests/advice-accuracy.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the echo and printf argument skip in bashMarkdownMutationPaths`, `the redirect target still counting`, `each named test actually running`, `the regression suites that pin path extraction`

## Goal

`bashMarkdownMutationPaths` takes nothing from the arguments of an `echo` or `printf` segment except its `>`/`>>` redirect target.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/advice-accuracy.test.mjs` | edit | the two tests below |
| `plugin/scripts/lifecycle.mjs` | edit | the candidate loop in `bashMarkdownMutationPaths` (line 1642) skips echo/printf arguments that are not a redirect target |

## Ordered Steps

1. [S1] Add the two tests with real assertions, including the measured command verbatim, and see each fail on an assertion (TDD red).
2. [S2] In the segment loop, when the segment's command word is `echo` or `printf`, keep only the token after `>` or `>>`.
3. [S3] Run the fence green and record mutants: drop the skip; skip the redirect target too. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(echo and printf arguments are not changed paths|an echo redirect target is still a changed path)$' tests/advice-accuracy.test.mjs 2>&1) \
  && for name in 'echo and printf arguments are not changed paths' 'an echo redirect target is still a changed path'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/unread-advice.test.mjs tests/unread-advice-followon.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `echo and printf arguments are not changed paths` | `tests/advice-accuracy.test.mjs` | the measured `cp … && rm -rf -- "$RUN" && echo "run dir removed, review kept at scratchpad/codex-review-f37f57a.md"` and `printf '%s\n' notes.md` yield no path under the project | — | S1, S2 |
| `an echo redirect target is still a changed path` | `tests/advice-accuracy.test.mjs` | `echo x > docs/new.md` and `printf y >> README.md`, in a temp project containing those files, still yield the target | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `analyzeTranscript` records these paths for the Stop message and the artifact gate; S3's mutants delete the skip |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | ADR-058's Follow-up replay |

## Mutation Log

## Invariants

- A real Markdown write through `tee`, `cp`, `mv`, `sed -i` or a redirect is still reported.

## Risks

- `echo` with an unusual redirect spelling (`1>file.md`); the test names the two forms the session used.

## Stop Condition

Stop and ask if an existing test of Markdown-only change handling (BACKLOG §174) goes red.

## Out of Scope

- The unreproduced `spec-write/SKILL.md` path (BACKLOG §213)

## Verification Log
