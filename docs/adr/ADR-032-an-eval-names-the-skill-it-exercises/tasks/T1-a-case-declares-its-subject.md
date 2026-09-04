# Task ADR-032-T1: Let a case declare its subject, and compute the coverage from it

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (eight frontmatter lines and one test file)
**Owner:** unassigned
**Produces:** `tags: [skill-<name>]` on every eval case, and a coverage report computed from them
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a case with no skill tag is reported rather than counted as covered`, `a skill tag that names no shipped skill is reported rather than resolving to nothing`

## Goal

"Which skills does the eval suite exercise?" is answered by reading declarations, and the answer tells
a skill with no case apart from a case nobody has attributed.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/evals/a-vacuous-test-is-not-a-review/prompt.md` | edit | declares `skill-review` |
| `plugin/evals/adr-write-consults-the-corpus/prompt.md` | edit | declares `skill-adr-write` |
| `plugin/evals/done-needs-tool-written-evidence/prompt.md` | edit | declares `skill-adr-execute`, which its text never names |
| `plugin/evals/complexity-instruction-given/prompt.md` | edit | declares `skill-unattributed` — an A/B arm |
| `plugin/evals/complexity-instruction-omitted/prompt.md` | edit | the other arm |
| `plugin/evals/fence-warning-given/prompt.md` | edit | declares `skill-unattributed` — an A/B arm |
| `plugin/evals/fence-warning-omitted/prompt.md` | edit | the other arm |
| `plugin/evals/gates-advise-never-block/prompt.md` | edit | declares `skill-unattributed` — a plugin-wide doctrine |
| `tests/evals.test.mjs` | create | reads the declarations and reports the three counts |
| `tests/mutations.json` | edit | three catalogue entries, or the checks are unproven (ADR-003) |

## Ordered Steps

1. [S1] Establish the failing tests. **Recorded honestly: they were NOT written first** — the eight cases were tagged before `tests/evals.test.mjs` existed. Red was observed AFTER the fact by `git stash push -- plugin/evals` and re-running: `pass 1 / fail 2`, restored with `git stash pop`. It is weaker than TDD for the usual reason — a test written after the code can be shaped by what the code already does — and the mutations at S7 are what actually bind these assertions. **That run also produced the finding worth keeping: only TWO of the three tests went red.** `a skill tag names a skill the plugin actually ships` PASSED with no tags at all, because with nothing declared the dangling list is empty. It is an absence check and cannot fail on an empty corpus, so red-first could never have bound it; the mutation that introduces a dangling tag is the only thing that does, and this is why S7 carries the weight here. [proof: acceptance]
2. [S2] Verify `tags:` is honoured by the runner rather than merely tolerated — a case tagged `skill-review` is selected by `--tag skill-review` and rejected by `--tag zzz-nonexistent`. A declaration the runner ignores is a comment. [proof: acceptance]
3. [S3] Tag the eight cases, attributing only where attribution is honest, and record the reason for each in a comment beside the tag. Four A/B arms and one plugin-wide doctrine case take `skill-unattributed`. [proof: acceptance]
4. [S4] Assert a tag resolves against the shipped `plugin/skills/` directory, so a renamed or deleted skill surfaces instead of pointing at nothing (ADR-011's class). [proof: acceptance]
5. [S5] Assert the report is shown capable of all three answers — attributed, uncovered, unattributed — in the same test, so a report that only ever said "covered" cannot pass. [proof: acceptance]
6. [S6] Record the measured coverage, with its date and the command that produced it, in `docs/BACKLOG.md` §105, beside the table it corrects. [proof: acceptance]
7. [S7] Add catalogue mutations and confirm each comes back RED. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test tests/evals.test.mjs 2>&1 | tee /tmp/adr032-t1.out \
  && ! grep -qE "no tests to run|^not ok|^# fail [1-9]" /tmp/adr032-t1.out \
  && python3 plugin/bin/adr-lint docs/adr/ADR-027-the-harness-ships-an-operating-surface.md
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every eval case declares the skill it exercises, or declares that it exercises none` | `tests/evals.test.mjs` | no case is left to be counted by guessing | — | S1, S3 |
| `a skill tag names a skill the plugin actually ships` | `tests/evals.test.mjs` | a declared subject resolves, rather than pointing at nothing | — | S4 |
| `the skill-coverage report can distinguish all three of its answers` | `tests/evals.test.mjs` | the report is capable of the dirty answer, not only the clean one | — | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | every case's frontmatter carries a `skill-*` tag |
| 2 — something selects it | the test reads them; `claude plugin eval --tag skill-review` selects by them, verified at S2 |
| 3 — the caller can discover it | the record and `plugin/evals/README.md` name the spelling, and the test's failure message gives it |
| 4 — it is used | whether authors of NEW cases attribute honestly is not observable yet; the pre-registered failure in the record is what would detect the vocabulary being abused |

## Mutation Log

## Verification Log

## Invariants

- Every case directory holding a `prompt.md` declares at least one `skill-*` tag.
- A `skill-<name>` tag other than `skill-unattributed` names a directory under `plugin/skills/`.
- The three counts partition: every shipped skill is either exercised or reported uncovered.
- No case's graders, prompt text, turn budget or score changes, so no measured Δ moves.

## Risks

- The tags are inert to scoring, so nothing about the suite's results changes and nothing verifies that. That is intended and is why the invariant above says so: this task adds attribution, not measurement.
- `skill-unattributed` could become the lazy default. The record's pre-registered failure names the grep that would detect it; this task cannot.

## Stop Condition

Stop if attributing a case requires deciding what it is FOR. Five of the eight already could not be
attributed honestly, and a subject invented to satisfy a test is the fabricated observation ADR-005
forbids — the tag exists to record that state, not to eliminate it.

## Out of Scope

- Writing cases for the eleven skills with none (deferred: docs/BACKLOG.md §105)
- A Trigger grader that asserts WHICH skill fired (deferred: docs/BACKLOG.md §105)
- Any change to scoring or to the ablation default (permanent: boundary: `plugin/evals/README.md` owns the scoring doctrine; this task only adds attribution)
