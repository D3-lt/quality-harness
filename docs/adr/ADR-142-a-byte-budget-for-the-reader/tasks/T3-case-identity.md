# Task ADR-142-T3: The core reads one file once, however its listing spells it

**Depends-on:** T4
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** `dcFileIdentity`
**Consumes:** `tests/helpers/decision-rows.mjs` (T4)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Off Windows, `dcOnceByRealPath` keys a file with one hard link by device and inode, so two case spellings of one record on a
case-insensitive volume are one file and one alias, as Node's `realpathSync.native` makes them (ADR-142 Decision 3).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `core/hooks/decisioncorpus_read.go` | edit | `dcOnceByRealPath` (:455-491) keys by `dcFileIdentity(real)` instead of the real path (:478, :483) |
| `core/hooks/realpath_unix.go` | edit | `dcFileIdentity`: `dev:ino` for a regular file with one link, the real path otherwise |
| `core/hooks/realpath_windows.go` | edit | `dcFileIdentity`: the real path, already the on-disk spelling (BACKLOG §445) |
| `core/hooks/decisioncorpus_identity_test.go` | add | The identity rule over a stat seam: one link, two links, a stat failure |
| `tests/decision-case-identity.test.mjs` | add | A case-variant listing, Node's answer, and `TestDecisionCorpusParity` over it |
| `tests/mutations/core/hooks/decisioncorpus_read.go.json` | edit | The identity key reverted to the real path |

## Ordered Steps

1. [S1] Confirm the failing test exists and is red (TDD red): write `tests/decision-case-identity.test.mjs`, which lists
   `docs/adr/ADR-001-x.md` and `docs/adr/adr-001-x.md` over one file on disk and asks `corpusRecord` for both spellings. Where
   the scratch directory folds case (probed by stat of the other spelling) Node gives one record and one alias; elsewhere the
   second spelling is absent. Red on macOS: the core gives two records.
2. [S2] Add `dcFileIdentity` with the stat as a parameter, so the one-link and two-link branches run on every platform
   (CLAUDE.md §7), and the Go test `TestDcFileIdentityKeysOneLinkByInode` over fakes.
3. [S3] Key `firstPathTo` by it in `dcOnceByRealPath`; `better()` and the alias reason are unchanged.
4. [S4] Add the catalogue mutant and record one killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/decision-case-identity.test.mjs 2>&1 | tee "$out" && grep -q '✔ a record listed in two case spellings is read once by the core, as by Node' "$out" && (cd core && go test -count=1 -run '^TestDcFileIdentity' -v ./hooks/ 2>&1 | tee "$out") && grep -q '^--- PASS: TestDcFileIdentityKeysOneLinkByInode' "$out" && node --test tests/decision-context-parity.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a record listed in two case spellings is read once by the core, as by Node` | `tests/decision-case-identity.test.mjs` | Node and the core give the same record and alias rows over the case-variant listing; the row is filesystem-conditional and says which branch ran | — | S1, S3 |
| `TestDcFileIdentityKeysOneLinkByInode` | `core/hooks/decisioncorpus_identity_test.go` | One link keys by inode; two links and a failed stat key by the real path | — | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `dcFileIdentity` |
| 2 — selected | `dcOnceByRealPath`'s key; the mutant reverting it is red on a folding volume |
| 3 — discoverable | n/a: no declared interface |
| 4 — used | the decision context on macOS and Windows checkouts |

## Mutation Log

## Invariants

- Two hard links of one file stay two files, as in Node.
- Which spelling is kept, and the alias reason, are unchanged.

## Risks

- On a case-sensitive Linux runner the conditional row takes its absent branch; macOS and Windows CI take the folding one,
  so the folding branch is measured on landing, not only here.
- A case-variant spelling of a hard-linked file stays two in the core (ADR-142 Risks).

## Stop Condition

Stop if the Windows job shows the core and Node disagree on the folding row: `nativeRealpath` was taken to be canonical there.

## Out of Scope

- Byte budgets (T1, T2).

## Verification Log
