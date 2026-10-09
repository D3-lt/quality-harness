# Task ADR-094-T3: a prose-only change reuses the last pass where the project declared it

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** L (qh-check, observe, the ledger and the hint)
**Owner:** unassigned
**Produces:** `proseSpecs(root)` (validated declaration) and the `codeTree` field of `observe()`'s optional result
**Consumes:** `passedAlready` and `firstMentionHere` (T2)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `no declaration changes nothing`, `a pass is reused only when the tree minus the declared paths is equal`, `a declaration that could hide code is refused`, `a reuse keeps the unseen-write veto`, `the hint is said after a passing prose-only run`

## Goal

In a project whose `.quality-harness.json` declares `prose`, a commit that changes only those paths reuses the last pass of the same command, and every other project behaves exactly as before.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `proseSpecs(root)` validates the declaration (a reader beside `fastCheckCommand`); `observe(cwd, budgetMs, { without })` computes `codeTree` only when asked (`:4954`); `passedAlready` accepts `codeTree` equality when the command and the `prose` list are equal and the row has a `codeTree` |
| `plugin/scripts/qh-check.mjs` | edit | passes `without` for a declared project, records `codeTree` and `prose` in `after`, appends the reuse row (`origin: 'reused'`, `reusedFrom`, `before.at` and `after.at` from the original) and the `skips.jsonl` row, prints the hint after a passing prose-only full run |
| `tests/prose-reuse.test.mjs` | add | the tests of the table, in a repository the test builds (CLAUDE.md §9) |
| `tests/mutations/plugin/scripts/lifecycle.mjs.json`, `tests/mutations/plugin/scripts/qh-check.mjs.json` | edit | one entry per `Rests-on` name |
| the file documenting `.quality-harness.json` keys (found with `mrw read --grep 'fastCheck' docs README.md plugin`) | edit | the `prose` key, what it asserts, and that a check which reads those files makes reuse wrong |

## Ordered Steps

1. [S1] Run `python3 scripts/test-locks.py tests/qh-check-reads-the-ledger.test.mjs`, then write the tests of the Tests table and record the red run (TDD red). The first test to write is reuse from a subdirectory.
2. [S2] `proseSpecs(root)`: refuse and say a declaration that is not an array of at most twenty non-empty strings, one starting with `-` or `:`, `.`, `*`, `**`, a spec matching no tracked path, a spec matching `.quality-harness.json`, a spec matching a gitlink. All specs are used with `:(top)` and the git default pathspec semantics.
3. [S3] `observe(cwd, budgetMs, { without })` returns `codeTree` (`git rm --cached -r --ignore-unmatch -- :(top)<spec>…` on the temporary index, then `write-tree`). No hook passes `without`.
4. [S4] `passedAlready` accepts a row when its command and `prose` list equal the current ones, it has a `codeTree`, and that equals the current one; the unseen-write veto runs from the original pass's start. A row without `codeTree` is never reused this way.
5. [S5] On a reuse, append the pass row and the `skips.jsonl` row and say one line. Do not reuse across a changed `prose` list.
6. [S6] The hint: after a full run that exited 0 and took at least a minute, where every path changed since the previous full pass of the same command is a text document (`.md`, `.mdx`, `.txt`, `.rst`), print one line naming `prose` and `fastCheck` and saying a declaration needs the project owner's approval; once per repository through `firstMentionHere`. Nothing is printed after a failed run.
7. [S7] Record five killed mutants, one per `Rests-on` name. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/prose-reuse.test.mjs 2>&1) \
  && for t in 'a declared prose-only change reuses the last pass, from a subdirectory too' 'a change outside the declared paths runs the check, whatever else is reused' 'a declaration that could hide code is refused and said' 'an unseen write after the original pass vetoes a reuse' 'a project that declares nothing is unchanged' 'the hint is said after a passing prose-only run and never after a failed one'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a declared prose-only change reuses the last pass, from a subdirectory too` | `tests/prose-reuse.test.mjs` | with `"prose": ["docs/"]`, a pass, then an edit under `docs/` run from `packages/web/`: reuse fires, one pass row with `origin: 'reused'` and `reusedFrom`, one skip row, and the publish verdict reads a pass for the new tree | none | S1, S3, S4, S5 |
| `a change outside the declared paths runs the check, whatever else is reused` | `tests/prose-reuse.test.mjs` | the dirty twins, each runs: a code file edited with a docs edit, a rename out of and into `docs/`, a deletion of a code file, a mode change, a check command changed, the `prose` list changed, an old row without `codeTree` | none | S1, S4 |
| `a declaration that could hide code is refused and said` | `tests/prose-reuse.test.mjs` | `.`, `*`, `**`, `*.json` (matches `.quality-harness.json`), a spec matching nothing, a gitlink under a prefix, a leading `-` or `:`, more than twenty — each is said and nothing is reused | none | S1, S2 |
| `an unseen write after the original pass vetoes a reuse` | `tests/prose-reuse.test.mjs` | an unobservable write logged after the original pass started: the check runs | none | S1, S4 |
| `a project that declares nothing is unchanged` | `tests/prose-reuse.test.mjs` | no `prose`: no `codeTree` computed, same-tree skip as before, rows without the new fields | none | S1, S3 |
| `the hint is said after a passing prose-only run and never after a failed one` | `tests/prose-reuse.test.mjs` | a passing run over only `.md` changes prints the hint once; a failed run and a code change print none | none | S1, S6 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the six tests |
| 2 — something selects it | `runCheck` asks `passedAlready` first; deleting the `codeTree` branch turns the first test red, and deleting the refusal of `*.json` turns the third red |
| 3 — the caller can discover it | the documented `prose` key and the hint line |
| 4 — it is used | a declaring project's skips with `origin: 'reused'` in `skips.jsonl`, counted by the outside run; nothing measures this yet |

## Mutation Log

## Invariants

- No `prose` declared: no new git call, no new field, no new behaviour.
- A tree that differs outside the declared paths always runs the check.
- A reused row never claims more than the original: its times are the original's, and its veto is the original's.
- A refused declaration is refused whole.

## Risks

- A project declares paths its check reads: that is its assertion, named in the hint and the docs. The twins above are the ways code gets in without the project meaning it.
- Windows: pathspec quoting and `:(top)` under Git Bash are unmeasured here; the outside run is the check (CLAUDE.md §18).

## Stop Condition

Stop and ask if `observe`'s temporary-index trick cannot compute `codeTree` inside the observe budget on this repository, or if a reuse cannot keep the unseen-write veto.

## Out of Scope

- A default for `prose` and a documentation classifier (permanent: boundary: see ADR-094 Alternatives (c))
- Declaring `prose` in this repository (permanent: boundary: its selftest reads the documents)

## Verification Log
