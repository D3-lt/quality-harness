# Task ADR-045-T4: A gate that cannot load a shared module exits its own could-not-run code

**Depends-on:** T1
**Covers:** F-5, UC5-S1, UC5-S2
**Estimated scope:** S (exit codes and Exit blocks in four gates; one test reworked, one added; catalogue entries)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A gate whose `plugin/lib/fence.py` or `plugin/lib/record.py` is not beside its real `bin/` exits the could-not-run code its own Exit block reserves — never a finding's code — with one line on stderr naming the file and the directory looked in, nothing on stdout, no traceback. Every lib a gate loads is exercised absent on its own, so no loader branch is reachable by no test. Each Exit block says in words what the code means.

The table decided here (the header is the authority for its gate):

| Gate | Lib-absent code | Why that code |
|------|-----------------|---------------|
| `adr-verify` | 4 | its could-not-look code (`inconclusive`); 2 is "no Acceptance section", a finding about the task |
| `spec-verify` | 4 | its "could not run a bound test" code; 2 is "bound test missing", a finding about the spec |
| `qh-mcp` | 4 | new; 2 is "usage, a broken invocation", which sends a caller to its command line rather than its install |
| `adr-lint` | 2 | its Exit block already reserves 2 for "nothing was checked"; the block now names the lib |
| `adr-next`, `arch-lint`, `adr-debt`, `adr-retire-check` | 2 | 2 already meant only this in each of them |

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-verify` | edit | fence and record branches exit 4; Exit block says so |
| `plugin/bin/spec-verify` | edit | fence and record branches exit 4; Exit block says so |
| `plugin/bin/qh-mcp` | edit | fence branch exits 4; Exit block gains 4 |
| `plugin/bin/adr-lint` | edit | Exit block: 2 is could-not-run, including the lib |
| `tests/gates.test.mjs` | edit | per-gate code table; one lib absent at a time in load order; Exit-block wording bound; one stderr line, empty stdout; symlink probe; `check-attr` in a repository the test creates |
| `tests/mutations.json` | edit | `isfile` guards for adr-verify's and spec-verify's record branch; the numeral in adr-verify, spec-verify, qh-mcp; test name updated on the adr-next / adr-lint guards |

## Ordered Steps

1. [S1] Bind the failing tests: the fence-present / record-absent fixture for adr-verify and spec-verify, the codes above, the Exit-block wording, the symlink probe. [proof: acceptance]
2. [S2] Change the codes and the Exit blocks; re-home `check-attr` into a fixture repository. [proof: acceptance]
3. [S3] Add the catalogue entries; run each with `node scripts/mutate.mjs --case`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'a gate copied without plugin/lib says so|reached through a symlink loads the lib|every exit code a gate can literally produce|the record grammar is one module' tests/gates.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a gate copied without plugin/lib says so and exits with its could-not-run code; with lib/ beside it, it runs` | `tests/gates.test.mjs` | per gate: Exit block names the code beside "could not run" and the lib; each lib absent in turn → that code, one stderr line, empty stdout, no traceback; whole lib/ → exit 0 | F-5, UC5-S1 | S1, S2 |
| `a gate reached through a symlink loads the lib beside its real file, not beside the link` | `tests/gates.test.mjs` | `realpath(__file__)` behaviourally: a link runs, a copy in the same place refuses | F-5, UC5-S2 | S1, S2 |
| `every exit code a gate can literally produce is declared in its own docstring` | `tests/gates.test.mjs` | the new `sys.exit(4)` literals are declared | F-5 | S2 |
| `the record grammar is one module: every gate loads plugin/lib/record.py and none keeps a copy` | `tests/gates.test.mjs` | `eol: lf` asked of a repository the test created, beside a path no rule covers | F-5 | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | each branch is a literal `sys.exit(<code>)` after a one-line `stderr.write` |
| 2 — something selects it | the fixture removes exactly one lib |
| 3 — the caller can discover it | the Exit block names the code and the meaning |
| 4 — it is used | the CLI exits the code and prints the sentence |

## Mutation Log

## Invariants

- No lib-absent exit shares a number with a finding in the same gate's Exit block.
- stderr on that path is exactly one line; stdout is empty.
- No test spawns `git` in the repository under test (CLAUDE.md §9).

## Risks

- A caller scripted against adr-verify / spec-verify / qh-mcp exiting 2 for a missing lib now sees 4 — the code that already meant could-not-look in two of them; the sentence on stderr is unchanged.

## Stop Condition

A green run while any gate's record branch is reached by no fixture, or while a lib-absent exit equals a finding's code in that gate's Exit block.

## Out of Scope

- A `record.py` that exists but raises on import (deferred: `docs/specs/2026-09-11-one-record-grammar.md` §Non-Goals — traceback and exit 1 today; named by the review as residual)
- adr-lint's soft `fence.py` load (permanent: boundary: one check says UNRUN; a linter is not stopped by a helper — BACKLOG §174)

## Notes

Class: `rg -n 'record.py|fence\.py' plugin/bin/*` — every `isfile` guard: adr-verify ×2, spec-verify ×2, qh-mcp ×1, adr-lint ×1 (record; fence is a `try`), adr-next, arch-lint, adr-debt, adr-retire-check ×1 each. All nine hard guards have a fixture arm; before this task adr-verify's and spec-verify's record arms had none. The structural `realpath(__file__)` regex stays (it is satisfiable by the fence loader alone) and is now backed by the symlink probe, which is not.

## Verification Log
