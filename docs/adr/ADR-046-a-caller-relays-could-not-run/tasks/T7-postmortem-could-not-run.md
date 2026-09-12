# Task ADR-046-T7: postmortem-verify declares could-not-run and sits in the table

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** XS (one `OSError` arm; one table row; one dispatcher relay; one catalogue entry)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`postmortem-verify` on a missing path tracebacked at exit 1; the dispatcher then said "not satisfied". It was the only dispatched gate absent from the could-not-run table. It now declares exit 2 for a named path it could not read, sits in `unrun_exit` and in `qh-mcp` `UNRUN_EXIT`, and a missing-path CLI is 2 with no traceback. An existing unreadable `*/docs/postmortems/*.md` reaches the dispatcher as `UNPROVEN: postmortem-verify could not run (exit 2)`.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/postmortem-verify` | edit | `OSError` → stderr sentence, exit 2; Exit block names it |
| `plugin/scripts/facts-gate-dispatch.sh` | edit | `unrun_exit` includes `postmortem-verify` → 2 |
| `plugin/bin/qh-mcp` | edit | `UNRUN_EXIT` includes `postmortem-verify` → 2 |
| `tests/gates.test.mjs` | edit | missing path is 2; valid is 0; non-postmortem is 1; table lists it; unreadable path is UNPROVEN |
| `tests/mutations.json` | edit | the table row dropped |

## Ordered Steps

1. [S1] Reproduce: missing path is traceback + exit 1. Bind the CLI and the dispatcher. [proof: acceptance]
2. [S2] The arm, the table, `UNRUN_EXIT`. [proof: acceptance]
3. [S3] The catalogue entry; `node scripts/mutate.mjs --case`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'postmortem-verify on a path it cannot read' tests/gates.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `postmortem-verify on a path it cannot read exits could-not-run, and the dispatcher relays it as UNPROVEN` | `tests/gates.test.mjs` | missing path exit 2, no traceback; valid 0; non-postmortem 1; `unrun_exit` lists it; an unreadable `docs/postmortems` file is UNPROVEN at the completion boundary | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `sys.exit(2)` in `check`; the table row |
| 2 — something selects it | `OSError` on `read_text`; dispatcher `unrun_exit` |
| 3 — the caller can discover it | the Exit block; `UNRUN_EXIT` |
| 4 — it is used | the CLI on a missing path; the hook on an unreadable postmortem path |

## Mutation Log

## Invariants

- A valid postmortem is still 0; a non-postmortem is still 1.
- A missing file is classified UNPROVEN before the gate when the path does not match `*/docs/postmortems/*.md`.

## Risks

- Git for Windows has no POSIX permission bits; the unreadable-path arm skips when `chmod 000` still reads.

## Stop Condition

A green run while a missing path is exit 1 with a traceback, or while the table omits postmortem-verify and the dispatcher says "not satisfied".

## Out of Scope

- adr-judge (deferred: ADR-046 Follow-ups — it is not dispatched)

## Notes

Found by the third Codex review (LOW, then in-class). T1's Out of Scope left this deferred; the owner said no edges.

## Verification Log
