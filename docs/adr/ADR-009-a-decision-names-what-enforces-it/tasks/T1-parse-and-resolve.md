# Task ADR-009-T1: parse Enforced-by and advise when it names nothing

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** the parsed and resolved `Enforced-by:` value in `bin/adr-lint` (T2)
**Consumes:** none
**Data dependency:** hermetic

## Goal

Let a record name the check that fails when its decision is violated, resolve each pointer against
the tree, and advise when one names nothing that exists.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `templates/adr-template.md` | edit | an author has no way to learn a header exists unless the template carries it, with the `None — <reason>` escape stated as first-class |
| `bin/adr-lint` | edit | `header_val` already reads headers and `check_tests_exist` already resolves test ids; this is the same resolution against a different header |
| `tests/gate-regressions.py` | edit | where the gates' resolution checks live |
| `tests/mutations.json` | edit | ADR-003 requires a shipped mechanism to carry a mutation |

## Ordered Steps

1. Confirm the failing test first: a record whose `Enforced-by:` names a test, a gate and a mutation label that all exist produces no advice, and one naming a mutation label absent from the catalogue does. Both red today — there is no such header and no check.
2. Parse the header, accepting a comma-separated list and `None — <reason>`, and reject nothing: an unparseable value is advised on, never blocking.
3. Resolve each pointer by form — a catalogue label against `tests/mutations.json`, a `path::name` test id the way `check_tests_exist` already does, a gate name against `bin/`.
4. Report which FORM resolved, so a reader can tell a measured claim (a mutation the campaign grades every run) from an asserted one (a test that merely exists).
5. Add the header to the ADR template with one worked example of each form and the `None` escape.

## Acceptance

```bash
python3 tests/gate-regressions.py bin skills/postmortem/SKILL.md
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `Enforced-by resolves a mutation label, a test id and a gate` | `tests/gate-regressions.py` | each form resolves against the real tree, and the resolved form is reported | — |
| `Enforced-by naming nothing is advised on, never blocking` | `tests/gate-regressions.py` | an absent pointer produces advice and no blocking finding | — |
| `a record without the header is unchanged` | `tests/gate-regressions.py` | the eight existing records produce no new finding | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the tests above |
| 2 — something selects it | `tests/gates.test.mjs::focused false-green regressions remain closed` runs the regression file in `scripts/selftest.sh` and CI; a catalogue mutation removes the resolution and the suite goes red |
| 3 — the caller can discover it | the ADR template carries the header with worked examples, which is where an author writing a record is looking |
| 4 — it is used | to be recorded at execution: `adr-lint` run over this repository's eight records, confirming none changes verdict |

## Class Sweep

**Class:** every header a record declares that points at something outside the record.

```bash
grep -nE '^\*\*(Governs|Spec|Cross-references|Invalidates|Enforced-by):' docs/adr/ADR-00*.md | head -20
```

Run 2026-08-28 over the nine records. Five headers point outside the record: `Spec:` and `Governs:`
are resolved by the lint today, `Enforced-by:` is resolved by this task, and **`Cross-references:` and
`Invalidates:` are resolved by nothing**. A record can cite an ADR that does not exist or claim to
invalidate one, and no gate notices — the same rot this task is about, already present in two headers
every record here carries. Left deliberately and filed as docs/BACKLOG.md §44: closing them is cheap
once this task's resolution machinery exists, which is the argument for closing them next rather than
now, in a change whose regression can be attributed.

A second member the authoring list did not have, found while implementing: `test_body` — the resolver
`check_tests_exist` uses — matches a FUNCTION name, and a `node:test` name is a string ARGUMENT.
`code_only` blanks string contents, so neither it nor a substring search can see one. Every JS test in
this repository is that shape, and `check_tests_exist` never surfaced it because its own guard skips
any name containing a space. So the sweep found a live gap in the resolver it was reusing, not only
in the headers it set out to enumerate.

## Mutation Log

<!-- tool-written by adr-verify --mutant; empty at authoring -->

## Invariants

- A record without the header is unchanged in every respect.
- An unresolvable pointer is ADVICE; nothing here blocks.
- `None — <reason>` is a first-class answer, not a failure to fill something in.
- The lint proves a check EXISTS and never that it can fail; that is ADR-003's rule and `mutate.mjs`'s job.

## Risks

- Resolution could be too permissive and accept a pointer that names nothing real. Mitigated by asserting the absent case in the same test as the present ones.
- Three pointer forms is three parsers. Mitigated by resolving each with machinery `adr-lint` already has rather than new code per form.

## Stop Condition

Stop if resolving a pointer requires running a check rather than locating it — that would put a test
execution inside the linter, which is a different tool with a different cost, and the decision should
be re-taken rather than forced.

## Out of Scope

- Proving a named check can fail. (permanent: ADR-003's rule and the campaign's job.)
- Backfilling the header into existing records. (deferred: docs/BACKLOG.md §44)
- Resolving `Cross-references:` or `Invalidates:`. (deferred: docs/BACKLOG.md §44)

## Verification Log
<!-- tool-written by adr-verify; empty at authoring -->
