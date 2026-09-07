# Task ADR-037-T2: The proof-map advisory names an edit to the file it is about, or it is deleted

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one advisory)
**Owner:** zy
**Produces:** a proof-map advisory that says UNRUN and names the edit for the task it reports on
**Consumes:** T1's population reading
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `PROOF_MAP_LEGACY_ADVICE`

## Goal

The advisory that is 44% of this corpus's advice either becomes actionable on the file it names, or
stops being emitted. ADR-037's rule is *acted on or removed, never emitted less often*, so reducing
how often it fires is not one of the outcomes.

## ⚠ Which number this rests on, and which it does not

**Read:** T1's population reading — 78 live advisory findings across 22 of 37 records, of which
**34, on 17 records, are this one advisory**. That is what makes it the first candidate rather than
the fence-segments advisory `docs/BACKLOG.md` §152 was actually reported about (7 of 78).

⚠ **NOT read, and NOT the basis: survival across runs.** T1's note is one day old and every count in
it is 1, which is the correct day-one answer and no evidence at all about whether anyone acts. The
argument here does not need it and must not borrow its authority: the advisory's first wording ended
*"when authoring a NEW task"*, so it named file X and instructed the reader about future file Y. That
is unactionable **by reading**, which is a different claim from "nobody acted on it" and is settled
by looking at the sentence rather than by waiting.

## ⚠ Why NOT deletion, measured rather than assumed

ADR-037 offers deletion as an acceptable outcome, and here it collides with ADR-005. Run `adr-lint`
over a record whose tasks carry `**Proof map:** v1` and over one whose tasks do not:

```
ADR-036 (has the header)   → no proof-map line anywhere in the output
ADR-001 (legacy, has none) → the advisory, once per task, and nothing else
```

**This line is the only thing that says the cross-check did not run.** Delete it and an unrun check
goes silent — ADR-005 broken by the fix for noise, in the gate that enforces ADR-005 on everyone
else. So (a) make it actionable is the only available outcome, not the preferred one.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | `PROOF_MAP_LEGACY_ADVICE` says UNRUN, names what is unproven, and gives the edit for this file | the advisory must be actionable by reading it |
| `tests/gate-regressions.py` | the wording asserted in both halves, plus that doing what it says silences it | "made it actionable" is exactly the claim that rots into an untested comment |
| `tests/mutations.json` | a mutant restoring the unactionable wording | the change is a behaviour a test must be able to lose |

## Ordered Steps

1. [S1] Write the failing assertions FIRST: the line says UNRUN, names the file it is about, names
   the concrete edit, does NOT instruct about a future task, and disappears once the edit is made.
   `[proof: test: tests/gate-regressions.py]`
2. [S2] Reword the advisory to satisfy them.
   `[proof: test: tests/gate-regressions.py]`
3. [S3] Confirm no guidance file still quotes the old wording, by command.
   `[proof: human: grep over the tree, output in the record]`

## Acceptance

```bash
set -o pipefail
out=$(mktemp)
node --test --test-name-pattern 'focused false-green regressions remain closed' tests/gates.test.mjs 2>&1 | tee "$out" && grep -qE '^ℹ pass [1-9]' "$out" && grep -qE '^ℹ fail 0$' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `proof-map contract` | `tests/gate-regressions.py` | UNRUN, the named file, the named edit, no future-task instruction, and silence once acted on | — | S1, S2 |

## Reachability

`check_step_proof_map` reaches the advisory whenever a task has no `**Proof map:**` header; the test
calls it directly with and without one, so both directions run with no corpus and no repository.

## Stop Condition

If making it actionable requires a reader to change a legacy task they have no reason to touch, stop
and reconsider deletion: an edit nobody will make is not actionability, it is the same finding with
better manners.

## Out of Scope

The fence-segments advisory (7 of 78) and every one-off. Suppression, summarisation, and the "not
useful" affordance. This task changes one message.

## Mutation Log

- 2026-09-07 · 82a99ff* · mutant killed · exit 1 · `plugin/bin/adr-lint` · the advisory must name an edit to the file it reports on, not instruct about a future task · acceptance-sha256:e8653ac81f8ab5f2ead53d33c25953136cbe1165b42e613482b4374d8535c835 · covers:PROOF_MAP_LEGACY_ADVICE

## Verification Log

- 2026-09-07 · 82a99ff · exit 0 · `set -o pipefail …` · acceptance-sha256:e8653ac81f8ab5f2ead53d33c25953136cbe1165b42e613482b4374d8535c835 · ms:5932
- 2026-09-07 · 82a99ff* · exit 0 · `set -o pipefail …` · acceptance-sha256:e8653ac81f8ab5f2ead53d33c25953136cbe1165b42e613482b4374d8535c835 · ms:5983

## Invariants

- Nothing else in `adr-lint`'s output reports that the proof-map cross-check did not run.
- Doing what the advisory says silences it.

## Risks

**One advisory reworded is not a rule.** Nothing here stops the next advisory being written in the
same unactionable shape. The survival measurement from T1 is what would catch that, and it needs
runs this task cannot manufacture.
