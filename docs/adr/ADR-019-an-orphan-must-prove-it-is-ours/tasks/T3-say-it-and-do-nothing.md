# Task ADR-019-T3: Say what was found, and make sure nothing acts on it

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** none
**Consumes:** `orphans()` (T2), `classifyHomeFile()` (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Surface orphans in the session-start notice and in `sync-standalone.mjs`'s report, with the evidence
that identified them — and prove no code path deletes, moves or archives what is named.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `shadowInstallNotice()` gains an orphan sentence — this is the line that SELECTS the whole feature at session start |
| `plugin/scripts/sync-standalone.mjs` | edit | the report gains an orphan section; the write paths are untouched |
| `tests/lifecycle.test.mjs` | edit | asserts the notice text, the count-only rendering, and the silence when there are none |
| `tests/mutations.json` | edit | registers `orphan: the report never becomes a write` and `orphan: an orphan is named at session start` |

<The notice line is the answer to "which line selects this, and what fails if it is deleted?" — the
mutation registered for it goes GREEN if nothing asserts the notice actually names an orphan.>

## Ordered Steps

1. [S1] Write the failing tests first (TDD red): a temp home holding a planted orphan, asserting the notice names it and `sync-standalone.mjs`'s report lists it. Both fail before the rendering exists.
2. [S2] Render in the notice: name the file, the release it was last shipped in, and the route that identified it. Say plainly that the plugin will not remove it and that the decision is the user's. [proof: acceptance]
3. [S3] Render in `sync-standalone.mjs`: an orphan section separate from `drifted`/`missing`, because the right action differs — a drifted copy is refreshed and an orphan is not ours to touch. `unidentified` is reported as a COUNT only, never enumerated, so a machine full of other tools' files produces one line rather than a list. [proof: acceptance]
4. [S4] Assert the negative that the whole record rests on: with a planted orphan present, `--apply` leaves it byte-identical and present, and `linkMode --apply` does too. [proof: acceptance]
5. [S5] Register both mutations and confirm each is RED: one deleting the notice's orphan sentence, one making the report delete what it names. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test tests/lifecycle.test.mjs tests/standalone-link.test.mjs 2>&1 | tee /tmp/adr019-t3.out \
  && ! grep -qE "^# fail [1-9]|no tests to run|tests 0" /tmp/adr019-t3.out \
  && grep -q "the report never becomes a write" tests/mutations.json
```

<Red before the work: the planted-orphan tests fail against a notice that says nothing about orphans.
The two suites are named together deliberately — the rendering lives in one and the classification in
the other, and neither alone proves this task.>

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an orphan is named at session start, with its evidence` | `tests/lifecycle.test.mjs` | the notice names the file, the release and the route | — | S1, S2 |
| `a home with no orphan says nothing about orphans` | `tests/lifecycle.test.mjs` | the same fixture minus the planted file produces no orphan sentence — the clean answer shown able to be dirty | — | S2 |
| `unidentified files are counted, not listed` | `tests/lifecycle.test.mjs` | four unidentified files yield a count and no filenames | — | S3 |
| `the report lists an orphan separately from drift` | `tests/standalone-link.test.mjs` | an orphan is not offered as work `--apply` would do | — | S3 |
| `--apply` leaves a named orphan present and byte-identical | `tests/standalone-link.test.mjs` | the negative the record rests on, asserted on the file itself rather than on the absence of a call | — | S4 |
| `--link --apply` leaves a named orphan present and byte-identical | `tests/standalone-link.test.mjs` | the second write path, which archives — so its silence has to be asserted separately | — | S4 |

<S4's two tests assert the FILE, not that a delete function went uncalled. A test that spies on a
call proves the code shape; a test that reads the bytes afterwards proves the property, and survives
a refactor that reaches the filesystem another way.>

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the six tests above |
| 2 — something selects it | `shadowInstallNotice()` is called by the session-start path in `lifecycle.mjs`, and `sync-standalone.mjs`'s `main()` prints the section; the S5 mutation deleting the notice sentence proves the notice line is reached |
| 3 — the caller can discover it | the notice text itself is the interface — a user reads it; the test asserting the wording is the check on that rung |
| 4 — it is used | nothing measures this yet; the parent ADR's Follow-up counts `unidentified` rows across reporting machines |

## Mutation Log

- 2026-09-01 · f0cf3d9* · mutant killed · exit 1 · `plugin/scripts/standalone-link.mjs` · the report becoming a write, which the record forbids · acceptance-sha256:17606c571ec4fccfb5196b4fc07791c49e55587109c678016a78f9d5d7a190ba

## Invariants

- No file under the user's home is written, moved, archived or deleted by any path this task touches.
- The notice is silent when there is nothing to say — an empty orphan set produces no sentence.
- `unidentified` never appears as a filename in user-facing output.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The notice grows long enough that the drift half is lost in it | Med | Med | The orphan section is one sentence plus at most four names, matching the existing drift rendering's cap |
| A reader takes "orphan" as an instruction to delete | Med | High | The wording states the plugin will not remove it and the decision is the user's; the test asserts that clause specifically, not just the filename |

## Stop Condition

Stop if either `--apply` test cannot be written against the real code path — if the write paths are
entangled enough that the negative can only be asserted by spying on a call, the shape of the tools
is the finding, and it goes back to the ADR.

## Out of Scope

- Offering a flag that deletes an orphan (permanent: boundary: the parent ADR's Decision)
- Anything about drift scope or `SHADOW_SCOPE` derivation (deferred: docs/BACKLOG.md §96)

## Verification Log
- 2026-09-01 · f0cf3d9 · exit 0 · `set -o pipefail …` · acceptance-sha256:17606c571ec4fccfb5196b4fc07791c49e55587109c678016a78f9d5d7a190ba
