# Task ADR-001-T1: classify a quote character

**Depends-on:** none
**Covers:** none — no spec
**Produces:** none
**Consumes:** none
**Status:** done

## Goal

`quote_kind('\'')` is `"single"` and `quote_kind('"')` is `"double"`.

## Affected Files

| File | Change | Why |
|---|---|---|
| `src/lib.rs` | edit | the classifier |
| `tests/lib_tests.rs` | edit | the integration tests |

## Ordered Steps

1. Write the failing tests first.
2. Add the classifier.

## Acceptance

```bash
grep -q 'fn a_raw_string_keeps_its_quotes' tests/lib_tests.rs
```

## Tests

The rows give the file by its bare name, as people write them. A same-named copy
may sit in an ignored directory on somebody's disk; the row still means the one
git tracks.

| Test name | File | Verifies | Covers |
|---|---|---|---|
| `a_single_quote_is_classified` | `lib_tests.rs` | both quote kinds | none |
| `a_raw_string_keeps_its_quotes` | `lib_tests.rs` | a raw string survives | none |

## Invariants

- One classifier.

## Risks

- None known.

## Stop Condition

Both tests pass.

## Out of Scope

- none

## Verification Log

- 2026-08-20 · no-git · exit 0 · `grep -q 'fn a_raw_string_keeps_its_quotes' tests/lib_tests.rs` · acceptance-sha256:1235f7d4e692a2c375db76840a789767ed6ec3f99ecca7cba2fde3502110c807 · ms:3
