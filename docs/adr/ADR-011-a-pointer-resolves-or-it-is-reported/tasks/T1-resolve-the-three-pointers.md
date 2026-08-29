# Task ADR-011-T1: resolve Governs, Cross-references and Invalidates in adr-lint

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** the pointer-resolution truth table in `tests/gate-regressions.py` (T2)
**Consumes:** none
**Data dependency:** hermetic

## Goal

Resolve a record's `Governs:`, `Cross-references:` and `Invalidates:` values against the files git
tracks and against the corpus, advise when one names nothing, and say "could not look" rather than
"names nothing" when git cannot answer.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | it already resolves `Spec:` and `Enforced-by:`; these are the three headers it does not, and `check_record` is where a record's headers are read |
| `plugin/templates/adr-template.md` | edit | the header prose still says these values are recorded; an author learns a pointer is now resolved only if the template says so |
| `tests/gate-regressions.py` | edit | where the gates' resolution checks live, and where the truth table T2 mirrors is written |
| `tests/mutations.json` | edit | ADR-003 requires a shipped mechanism to carry a mutation, and this check's whole risk is being silent on a corpus where everything resolves |

`check_record` is the line that SELECTS this: `check_pointers` is unreachable until it is called
there, and deleting that one call leaves every test about the parse passing.

## Ordered Steps

1. Confirm the failing tests first, all red today because no such check exists: a record whose three
   headers name a tracked path, a real record and a glob that matches produces no advice; a record
   naming an untracked path, a record number the corpus does not have, and a glob matching nothing
   produces three findings and no blocking error; and a run with no tracked listing available
   produces neither — it says it could not look.
2. Add `tracked_paths(root)`: `git ls-files` plus `git ls-files --others --exclude-standard`, run
   through the same `subprocess` discipline the gate already uses, returning `None` — not an empty
   set — when git is unavailable or the directory is not a repository. `None` and `set()` must be
   different things; conflating them is how "I could not look" becomes "the tree is empty" and every
   pointer in the corpus becomes a finding at once (ADR-005).
3. Add the `Governs:` resolution: each declared path resolves when it equals a tracked path, is a
   directory prefix of one, or is a glob matching at least one — `**` crossing separators, `*` not,
   matching `lifecycle.mjs::globToRegExp`. Normalize both separators before any structural test on
   the value (CLAUDE.md §7); a declaration written `plugin\bin\**` is the same declaration.
4. Add the `Cross-references:` resolution, reusing `enforcement_pointers`' backtick-aware comma
   split: an item that looks like a repository path must be tracked; one matching `ADR-\d+` must
   resolve against the corpus via `resolve_qualified_dep`'s record glob; anything else, including a
   bare `§NN`, is left alone rather than guessed at.
5. Add the `Invalidates:` resolution, and give it its OWN parse: `none\b` yields nothing, otherwise
   the LEADING token is the record id and the prose after it is ignored. Comma-splitting this header
   turns `ADR-001 — the clause of its Decision reading "…"` into pointers; the seven `none — checked.
   ADR-003 governs …` values in this corpus are saved from that only by the `none` guard.
6. Report each unresolved pointer with `errors.advise`, naming the header, the pointer and what was
   looked for. Never `errors.append` — CLAUDE.md §3, and the record's own day-one argument.
7. Update the template's `Governs:`, `Cross-references:` and `Invalidates:` prose to say the value is
   resolved and what a glob means.
8. Add the mutation: remove the resolution so an unresolvable pointer reads as fine, and confirm the
   suite goes red.

## Acceptance

```bash
python3 tests/gate-regressions.py plugin/bin plugin/skills/postmortem/SKILL.md .
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `a Governs path that matches nothing tracked is advised on` | `tests/gate-regressions.py` | the dirty answer, for the header with live consequences | — |
| `a Governs glob resolves when it matches at least one tracked file` | `tests/gate-regressions.py` | `plugin/bin/**` stays silent, and `*` does not cross a separator | — |
| `Cross-references resolves a tracked path and a record id, and reports neither when absent` | `tests/gate-regressions.py` | both forms, present and absent, in one case | — |
| `Invalidates takes the leading token and ignores the prose after it` | `tests/gate-regressions.py` | the real corpus values do not become pointers | — |
| `no tracked listing means could not look, not names nothing` | `tests/gate-regressions.py` | the ADR-005 state: zero findings, and a said-so, when git cannot answer | — |
| `an unresolvable pointer is advice and never a blocking error` | `tests/gate-regressions.py` | instruct-never-block, asserted on the errors object rather than the exit code | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the tests above |
| 2 — something selects it | `check_record` calls `check_pointers`; the catalogue mutation deletes the resolution and `tests/gates.test.mjs::focused false-green regressions remain closed` goes red in `scripts/selftest.sh` and CI |
| 3 — the caller can discover it | the ADR template's three header blocks say the value is resolved and what a glob means — that is where an author writing a record is looking |
| 4 — it is used | to be recorded at execution: `adr-lint` over this repository's ten records, confirming none changes verdict |

## Class Sweep

**Class:** every record-level header whose value points at something outside the record.

```bash
for h in Spec Cross-references Governs Enforced-by Invalidates; do \
  echo "$h: $(grep -l "^\*\*$h:\*\*" docs/adr/ADR-*.md | wc -l) of $(ls docs/adr/ADR-*.md | wc -l)"; done
```

Run 2026-08-29 over the ten records: `Spec:` 10, `Cross-references:` 10, `Governs:` 10,
`Invalidates:` 10, `Enforced-by:` 3. `Spec:` is resolved (blocking) and `Enforced-by:` is resolved
(advisory, ADR-009); the other three are resolved by nothing, and this task closes all three. The
task-level members of the same class — `Depends-on:` qualified ids (ADR-007), the `Tests` table
(`check_tests_exist`) and `(deferred: …)` dispositions (`adr-debt`, which reports `UNRECEIPTED`) —
are already resolved and are deliberately untouched.

A second run, of the resolution itself rather than the census, because a check that reports "clean"
must be shown able to report dirty (CLAUDE.md §4). An indicative sweep — its own matcher, not the
gate's — over the ten records reported **0 unresolved pointers**. The same sweep over a clone with
`ADR-003`'s `Governs:` changed from `tests/mutations.json` to `tests/mutations-GONE.json` reported
`ADR-003-…: Governs -> 'tests/mutations-GONE.json' MISSES`. Day-one silence on this corpus is
therefore a fact about the corpus. The count is indicative and not the gate's: the glob semantics
must come from the same rules as `lifecycle.mjs::globToRegExp`, which is what the truth table pins.

## Mutation Log

<!-- tool-written by adr-verify --mutant; empty at authoring -->

## Invariants

- Every finding this task adds is ADVICE; nothing here blocks.
- "Could not look" and "names nothing" are different answers and never collapse into one.
- Resolution is against what git tracks, never against what is on the asking machine's disk.
- A record carrying none of the three headers is unchanged in every respect.
- `Invalidates:` prose is never split into pointers.

## Risks

- The tracked listing is expensive on a large corpus. Mitigated by taking it once per lint run rather than per pointer.
- The Python glob and `globToRegExp` drift. Mitigated by the truth table T2 mirrors, which carries the `**`/`*` distinction on both sides.
- A corpus that vendors records outside the repository would see every path reported. Accepted: it is advice, and the finding names what was looked for.

## Stop Condition

Stop if the tracked listing cannot be obtained reliably on any supported platform — a check that
degrades to "could not look" on Windows is a check that does not exist there, and the decision to
resolve against git rather than the filesystem should be re-taken rather than forced.

## Out of Scope

- Reporting an unresolved `Governs:` through `adr-state`. (that is T2's job)
- Resolving a `§NN` fragment to a heading. (deferred: docs/BACKLOG.md §44)
- Backfilling `Enforced-by:` into the seven records that lack it. (deferred: docs/BACKLOG.md §44)

## Verification Log

<!-- tool-written by adr-verify; empty at authoring -->
