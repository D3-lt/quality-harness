# Task ADR-072-T2: `--narrow` proposes `only` from recorded killers, and writes only what it measured

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (one script, its test)
**Owner:** unassigned
**Produces:** `narrowEntry(entry, record, sources)` and the `--narrow` flag of `scripts/mutate.mjs`
**Consumes:** cache `entries[key].killers: string[]` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a narrowing names exactly its killers`, `a metacharacter matches only itself`, `an unproven narrowing is refused`, `a narrowing that is not RED is undone`, `a renamed killer is named by --stale`

## Goal

`--narrow` proposes an anchored, escaped `only` for each entry ADR-072 Decision 3 admits and refuses the rest by name. `--narrow --write` writes them, measures each, and undoes any that are not RED. `--stale` names a narrowed entry whose pattern names a test no named file defines (Decision 2).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/mutate.mjs` | edit | `narrowEntry`; `--narrow` in the flag set, the usage line, and `main` |
| `tests/mutate-runner.test.mjs` | edit | the pure function, and the flag over a scratch repository |
| `tests/mutations.json` | edit | the mutants below |

## Ordered Steps

1. [S1] Write the tests below and see them fail on an assertion (TDD red).
2. [S2] `narrowEntry`: an entry with killers `a` and `b.c(x)` gets `^(?:a|b\.c\(x\))$`. It refuses, naming why:
   - a killer that is not a verbatim string literal in a named file, including a name built with `${…}`;
   - no recorded killers;
   - an existing `only`;
   - a verdict other than RED at the current key.
3. [S3] `--narrow [--cache <file>]` prints each proposal and each refusal and writes nothing. `--narrow --write` follows ADR-069's order (claim the lock, read, write the `only` fields, measure). An entry that is not RED under its pattern gets its `only` removed and is named, and the command exits 1. It refuses uncommitted subjects like any campaign. [proof: acceptance]
4. [S4] Extend `staleEntries`' caller so `--stale` also reports a narrowed entry whose pattern names a test no named file defines. In a scratch repository, rename a narrowed entry's killer: `--stale` names it and exits non-zero.
5. [S5] Record mutants with `adr-verify --mutant`, one per Rests-on name. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/mutate-runner.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (narrowEntry proposes exactly the recorded killers, escaped and anchored, and refuses what it cannot prove|mutate --narrow proposes, writes only with --write, and undoes a narrowing that is not RED|mutate --stale names a narrowed entry whose killer is no longer defined)' | grep -qx 3
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `narrowEntry proposes exactly the recorded killers, escaped and anchored, and refuses what it cannot prove` | `tests/mutate-runner.test.mjs` | the pattern; the escaping; each refusal by name, a computed name included | — | S1, S2 |
| `mutate --narrow proposes, writes only with --write, and undoes a narrowing that is not RED` | `tests/mutate-runner.test.mjs` | in a scratch repository: read-only by default; the write and its measurement; the undo | — | S1, S3 |
| `mutate --stale names a narrowed entry whose killer is no longer defined` | `tests/mutate-runner.test.mjs` | a renamed killer is reported, and a defined one is not | — | S1, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `narrowEntry` and its tests |
| 2 — something selects it | `--narrow` in `main`'s flag handling; the mutant removing it |
| 3 — the caller can discover it | the usage line |
| 4 — it is used | T3 |

## Mutation Log

## Invariants

- An entry with an `only` is never touched.
- Without `--write`, nothing is written.

## Risks

- Test names that repeat across files: the "no named file defines it" refusal is what keeps a harvest collision from narrowing onto the wrong test.

## Stop Condition

Stop and ask if a narrowed entry that is RED whole-file is not RED under its pattern in the scratch repository.

## Out of Scope

- Applying it to the catalogue (T3's job).

## Verification Log
