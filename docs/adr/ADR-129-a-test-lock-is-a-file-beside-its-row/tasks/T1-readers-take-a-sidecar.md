# Task ADR-129-T1: The readers take a sidecar lock

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (record.py's one lock reading)
**Owner:** unassigned
**Produces:** sidecar lock reading
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A row whose lock field is `test-lock-file:<path>` is read from that file, verified against the row's `test-lock-sha256:`, by
every gate that reads a lock; anything that cannot be shown is UNPROVEN; a `test-lock-b64:` row reads as before.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | `TEST_LOCK_FIELD` and its anonymous twin take `test-lock-file:`; `_recorded_lock` reads the file |
| `tests/lock-sidecar.test.mjs` | add | the invariant and its twins |
| `tests/mutations/plugin/lib/record.py.json` | edit | the mechanisms' mutants |

## Ordered Steps

1. [S1] Write `tests/lock-sidecar.test.mjs` in a repository the test creates: a task whose first red carries
   `test-lock-file:` and a tracked file with the payload reads the same lock map as the `test-lock-b64:` form, and adr-lint
   names a moved test (red today).
2. [S2] Add the twins: a missing file, an ignored one, one outside the repository, one whose bytes hash to another sha (a
   CRLF rewrite of the payload among them), and an unreadable one are each UNPROVEN with `done` withheld; an untracked one is
   read and advised; a relock after a sidecar first red keeps the first red's check (`first_check`); a `test-lock-b64:` row
   is unchanged.
3. [S3] Implement in record.py through one resolver used by every decode; list the path against `git ls-files` (CLAUDE.md §8), never `existsSync`.
4. [S4] Run adr-lint over this repository's corpus: no finding changes.

## Acceptance

```bash
node --test --test-reporter=tap tests/lock-sidecar.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a sidecar lock reads as its inline twin, and names a moved test` | `tests/lock-sidecar.test.mjs` | the reading | — | S1, S3 |
| `a sidecar that is missing, ignored, outside, altered or unreadable is UNPROVEN, and an untracked one is read` | `tests/lock-sidecar.test.mjs` | nothing reads as a pass | — | S2, S3 |
| `a relock after a sidecar first red keeps its check` | `tests/lock-sidecar.test.mjs` | the historical decode | — | S2, S3 |
| `every record this repository tracks passes its own adr-lint` | `tests/corpus-lint.test.mjs` | no corpus finding changes | — | S4 |

## Mutation Log

## Invariants

- A `test-lock-b64:` row is read byte for byte as before; no existing finding changes.

## Risks

- A path that climbs out of the repository: refused as a lock that could not be read.

## Stop Condition

A reader outside record.py parses the lock field itself: stop and route it through record.py first.

## Out of Scope

- Writing sidecar rows (deferred: T2).

## Verification Log
