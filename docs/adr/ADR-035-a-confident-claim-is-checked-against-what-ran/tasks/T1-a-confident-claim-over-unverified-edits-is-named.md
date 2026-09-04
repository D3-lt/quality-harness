# Task ADR-035-T1: The claim is classified, and a confident one over unverified edits is named

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** `completionClaim(message)` → `{ kind: 'unavailable'|'limited'|'hedged'|'asserted'|'none', phrase: string|null }`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the claim vocabulary`, `the precedence of the negative classifiers`, `the branch that selects the false-success advisory`

<The fence's own `grep -qE '^ℹ pass [1-9]'` and `'^ℹ fail 0$'` guards are NOT
listed, and the omission is deliberate rather than an oversight: `Rests-on` names
mechanisms in the SOURCE that a mutation can break, and no edit to
`lifecycle.mjs` can break a guard that lives in this file's own fence. Listing it
would ask the gate for a mutant that cannot exist.>

## Goal

At `Stop`, a final message that asserts completion over edits nothing has verified is told which
words made the claim and which check did not run; every other message keeps today's behaviour.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit — `completionClaim()` beside `interimResponse()`; branch on it in the Stop path before `missingEvidenceReason` | the classifier and the one call site that selects it |
| `tests/lifecycle.test.mjs` | edit — the four tests below | the outermost boundary: the hook process, a transcript, a payload |
| `tests/mutations.json` | edit — register `stop: a confident claim over unverified edits is named as a false success` | the ADR's `Enforced-by:` |

## Ordered Steps

1. [S1] Write the failing tests: a transcript with an edit and no check, `last_assistant_message`
   "✅ All tests pass. Task complete." → the `systemMessage` quotes `All tests pass` and names the
   check; the same transcript with "I edited the file but did not run the tests" → today's advisory,
   unquoted; a transcript whose check ran after the edit with the same confident message → no
   message at all. Red.
2. [S2] Implement `completionClaim(message)` with the vocabulary the ADR names, whole-word, and the
   precedence `unavailable` → `limited` → `hedged` → `asserted` → `none`, reusing `evidenceLimited`
   and `interimResponse` for the first two negative kinds. Export it.
3. [S3] In the Stop branch, after the `no-check` return, compute the claim; when
   `asserted` and the work is unverified, emit the false-success advisory with the quoted words,
   the check `projectCheckCommand()` names, and the edited paths. Otherwise fall through unchanged.
4. [S4] Register the mutant: replace the `asserted` branch's condition with `false` — the
   confident message must then get the plain advisory and the first test must go red.
   `[proof: mutation]`

## Acceptance

```bash
set -o pipefail
out=$(mktemp)
node --test --test-name-pattern 'false success|honest final message|verified edits is not|completionClaim reads negation' tests/lifecycle.test.mjs 2>&1 | tee "$out" && grep -qE '^ℹ pass [1-9]' "$out" && grep -qE '^ℹ fail 0$' "$out"
```

<WIDENED 2026-09-04, and the reason is in this task's own Mutation Log. The first
fence filtered on `'false success'` alone, which runs ONE test — so a mutant
breaking `the precedence of the negative classifiers` SURVIVED: that mechanism is
asserted by the three tests the filter excluded, and the fence could not see
them. It is the trap `templates/task-template.md` names, "a fence narrow enough
to name ONE test leaves everything else outside it", and it took a mutation to
find because the fence was green either way. Widening changes the digest and
invalidates every entry taken under the old fence. That is correct: those entries
proved a different command, and the survived row stays in the log as the finding
that produced this one.>

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a confident completion claim over unverified edits is named as a false success` | `tests/lifecycle.test.mjs` | the advisory quotes the words and names the check | — | S1, S3 |
| `an honest final message over unverified edits gets the plain evidence advisory` | `tests/lifecycle.test.mjs` | `none` and `hedged` keep today's sentence | — | S1, S3 |
| `a confident claim over verified edits is not a false success` | `tests/lifecycle.test.mjs` | the evidence half still wins | — | S1, S3 |
| `completionClaim reads negation before assertion` | `tests/lifecycle.test.mjs` | "not fixed yet" is `hedged`, "EVIDENCE-LIMITED: …" is `limited`, "" is `none`, `undefined` is `unavailable` | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the fourth test calls `completionClaim` directly |
| 2 — something selects it | the first test drives the whole hook process; the registered mutant deletes the branch and the test goes red |
| 3 — the caller can discover it | n/a: no declared interface — the hook is wired by `plugin/hooks/hooks.json` already |
| 4 — it is used | T2's ledger row carries the claim kind; `claims-rate.mjs` (T3) counts it |

## Mutation Log

- 2026-09-04 · 335ea07 · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the branch that selects the false-success advisory: without it a confident claim gets the plain evidence sentence · acceptance-sha256:357c53b5474cb1ced32ebc4cc57793d78df07d0f3c0040f5b53e326c2b6f55e2 · covers:the branch that selects the false-success advisory
- 2026-09-04 · 335ea07* · mutant survived · exit 0 · `plugin/scripts/lifecycle.mjs` · the precedence of the negative classifiers: without it 'not done' and 'fixed but blocked' are read as assertions and the honest message is accused · acceptance-sha256:357c53b5474cb1ced32ebc4cc57793d78df07d0f3c0040f5b53e326c2b6f55e2 · covers:the precedence of the negative classifiers
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-09-04 · 327f226 · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the precedence of the negative classifiers: without it 'not done' and 'fixed but blocked' are read as assertions and the honest message is accused · acceptance-sha256:9b23a203da37e667e07ab1b2debe9c055024d21c4cc02d63b38a8a4403204de8 · covers:the precedence of the negative classifiers
- 2026-09-04 · 327f226* · mutant survived · exit 0 · `plugin/scripts/lifecycle.mjs` · the claim vocabulary: the tick alone must be able to carry an assertion, or a message whose only claim is a tick reads as none · acceptance-sha256:9b23a203da37e667e07ab1b2debe9c055024d21c4cc02d63b38a8a4403204de8 · covers:the claim vocabulary
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-09-04 · 9561cdd · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the claim vocabulary: the tick alone must carry an assertion, or a message whose only claim is a tick reads as none · acceptance-sha256:9b23a203da37e667e07ab1b2debe9c055024d21c4cc02d63b38a8a4403204de8 · covers:the claim vocabulary
- 2026-09-04 · 9561cdd* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the branch that selects the false-success advisory: without it a confident claim gets the plain evidence sentence and the quoted words never appear · acceptance-sha256:9b23a203da37e667e07ab1b2debe9c055024d21c4cc02d63b38a8a4403204de8 · covers:the branch that selects the false-success advisory

## Invariants

- Nothing blocks: every new output is a `systemMessage`, never a non-zero exit from the hook.
- A negative or limited message is never classified `asserted`, whatever else it contains.
- A message the payload does not carry is `unavailable`, never `none`.

## Risks

- The vocabulary over-matches ("the build is green" in a question). Mitigated by whole-word
  matching, by negation taking precedence, and by T4's precision criterion.

## Stop Condition

If the Stop payload on the current Claude Code build no longer carries `last_assistant_message`
(check a live payload before assuming), stop: the classifier has nothing to read and this record's
premise needs re-checking.

## Out of Scope

- Recording anything — T2.
- Any change to what counts as evidence — `analyzeTranscript` is untouched.

## Verification Log
- 2026-09-04 · 335ea07 · exit 0 · `set -o pipefail …` · acceptance-sha256:357c53b5474cb1ced32ebc4cc57793d78df07d0f3c0040f5b53e326c2b6f55e2 · ms:295
- 2026-09-04 · 335ea07* · exit 0 · `set -o pipefail …` · acceptance-sha256:357c53b5474cb1ced32ebc4cc57793d78df07d0f3c0040f5b53e326c2b6f55e2 · ms:292
- 2026-09-04 · 327f226 · exit 0 · `set -o pipefail …` · acceptance-sha256:9b23a203da37e667e07ab1b2debe9c055024d21c4cc02d63b38a8a4403204de8 · ms:380
- 2026-09-04 · 327f226* · exit 0 · `set -o pipefail …` · acceptance-sha256:9b23a203da37e667e07ab1b2debe9c055024d21c4cc02d63b38a8a4403204de8 · ms:372
- 2026-09-04 · 9561cdd · exit 0 · `set -o pipefail …` · acceptance-sha256:9b23a203da37e667e07ab1b2debe9c055024d21c4cc02d63b38a8a4403204de8 · ms:434
- 2026-09-04 · 9561cdd* · exit 0 · `set -o pipefail …` · acceptance-sha256:9b23a203da37e667e07ab1b2debe9c055024d21c4cc02d63b38a8a4403204de8 · ms:404
