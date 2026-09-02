# Task ADR-024-T3: Give a task waiting on an unmade decision a header a tool can read

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** the `Awaiting-decision:` task header
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A task stalled on a choice nobody has made says so in a header, naming the options, and `adr-debt`
counts it apart from deferred debt.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | accept the header, and require it to name a choice rather than a mood |
| `plugin/bin/adr-debt` | edit | count these separately — nobody is notified when a choice continues not to be made, which is the whole complaint |
| `plugin/templates/task-template.md` | edit | the header list a task author reads is what SELECTS this |
| `tests/gate-rules.test.mjs` | edit | fixtures |

## Ordered Steps

1. [S1] Write the failing fixtures first: a task carrying `Awaiting-decision:` with two named options lints clean and is counted by `adr-debt`; one carrying the header with no choice in it is advised; a task with neither header is unchanged. (TDD red.)
2. [S2] Accept the header in `adr-lint` beside `Depends-on:` and `Blocked-on:`, reusing their reader rather than adding a third.
3. [S3] Require the value to name at least two options or a question. "Waiting on a decision" with no decision written down is the prose state this replaces, so accepting it would ship the defect under a new name. [proof: mutation]
4. [S4] Count them in `adr-debt`, in their own line. [proof: acceptance]
5. [S5] Document the header in the task template beside its two siblings, with the ownership distinction ADR-014 draws — inside the corpus, outside it, or a human's choice. [proof: human: a reader checks the template names all three and says which resolver each has]

## Acceptance

```bash
set -o pipefail
node --test tests/gate-rules.test.mjs 2>&1 | tee /tmp/adr024-t3.out \
  && ! grep -qE "no tests to run|^not ok|# fail [1-9]" /tmp/adr024-t3.out
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a task waiting on a choice nobody has made says so, and names the choice` | `tests/gate-rules.test.mjs` | the header is accepted with options and advised without them | — | S1, S2, S3 |
| `a task waiting on a choice nobody has made says so, and names the choice` | `tests/gate-rules.test.mjs` | adr-debt reports it on its own line, not folded into deferred | — | S1, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two fixtures above |
| 2 — something selects it | `adr-lint`'s header reader and `adr-debt`'s counter; the mutation on the require-a-choice rule proves the branch is reached |
| 3 — the caller can discover it | the task template's header list, which is the file an author reads before writing one |
| 4 — it is used | no task here is in this state, by measurement. The reporter's corpus has one; the parent ADR pre-registers removal if ten records pass with no use |

## Mutation Log

## Invariants

- The header must name a choice. A header that accepts "waiting on a decision" reproduces the prose state it replaces.
- ADR-014's two headers and the `partial` status are unchanged; this is a third kind of waiting, not a re-modelling of the two.
- `adr-debt` counts these apart from deferred debt: an unmade decision is not punted work and planning for it as such misleads.

## Risks

- A third header on an already-long task template. Mitigated by the parent ADR's pre-registered removal criterion, and by documenting all three together as one ownership question rather than as three rules.

## Stop Condition

Stop if `adr-lint`'s existing header reader cannot take a third member without special-casing —
that would mean the family is not a family, and the shape of the fix is wrong.

## Out of Scope

- Any change to the `partial` status or ADR-014's vocabulary (the parent ADR's Out of Scope says why)
- Notifying anyone when a decision goes unmade (permanent: boundary: these gates read a tree and print; nothing here has a channel to notify through, and inventing one is a different decision)

## Verification Log
