# Task ADR-046-T5: SessionStart surfaces every UNPROVEN and lists directories in posix form

**Depends-on:** T3
**Covers:** none — no spec
**Estimated scope:** S (`surfaceReadyLines`; `posixListed` on the relative directory; compact prefers UNPROVEN; one hook-stdin test)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

SessionStart sliced `ready.lines` to 3 and hid a later directory's UNPROVEN behind `(+N more)`. Compact re-emitted `ready.lines[0]`. A could-not-look is never an ordinary ready line: it always surfaces; the cap still applies to ready/blocked/done. The relative directory is `posixListed` — `path.relative` is native separators and Windows CI is a structural-path job. `status === null` is `did not run`, already the T3 branch, now reached by an injected spawn.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `posixListed` exported; `surfaceReadyLines`; `readyTaskLines(spawn=)`; compact prefers UNPROVEN |
| `tests/lifecycle.test.mjs` | edit | 4 healthy dirs cap; 4 dirs one UNPROVEN surfaces; `status === null`; SessionStart on stdin |
| `tests/mutations.json` | edit | `surfaceReadyLines` put back to `slice(0, 3)` |

## Ordered Steps

1. [S1] Bind the failing test: 4 directories, one UNPROVEN, that line appears; 4 healthy still cap. [proof: acceptance]
2. [S2] `surfaceReadyLines`; posix relatives; compact preference; spawn seam. [proof: acceptance]
3. [S3] The catalogue entry; `node scripts/mutate.mjs --case`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'SessionStart always surfaces an UNPROVEN ready line' tests/lifecycle.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `SessionStart always surfaces an UNPROVEN ready line and still caps ordinary ones` | `tests/lifecycle.test.mjs` | `posixListed('docs\\tasks')` is `docs/tasks`; 4 ordinary lines cap at 3 + `(+1 more)`; a fourth UNPROVEN always shows; `status === null` is `did not run`; SessionStart nolib on 4 dirs shows every UNPROVEN and no cap; the real plugin caps ordinary lines | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `surfaceReadyLines`, `posixListed` |
| 2 — something selects it | SessionStart orientation; `readyTaskLines` relatives |
| 3 — the caller can discover it | the SessionStart hook on stdin |
| 4 — it is used | 4-directory fixtures through the hook and the injected spawn |

## Mutation Log

## Invariants

- Three ordinary ready lines still cap with `(+N more)`.
- A posix-listed relative is what production emits on every platform.

## Risks

- A mutation that unwraps `posixListed` at the call site is GREEN on macOS (native relative is already posix). The helper is asserted with a backslash operand; Windows CI catches a call-site revert.

## Stop Condition

A green run while a fourth directory's UNPROVEN is hidden behind `(+N more)`.

## Out of Scope

- Raising the ordinary-line cap (permanent: boundary: three was the existing SessionStart budget; this task only stops hiding could-not-look)

## Notes

Found by the third Codex review (MEDIUM path + LOW truncation). `posixListed` already existed for listing membership; this reuses it for emitted relatives.

## Verification Log
