# Task ADR-046-T2: qh-mcp relays a reading gate's could-not-run code on the error channel

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** XS (one table and one branch in the server; one stdin test; one catalogue entry)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`_gate_result` returned every completed gate — including adr-next's exit 2 for a missing `record.py` — as `isError: false` content: "adr-next exit 2 · could not run …" wearing the shape of a gate that ran and found something. ADR-012 §2 reserves the error channel (`isError`, or an error object) for a gate that could not run, and the server already answers a missing path and an interpreter that did not start with an error object through `GateDidNotRun`. Decided here: the same shape. `UNRUN_EXIT` names each reading gate's own code (adr-lint, adr-next, adr-debt, arch-lint, adr-retire-check → 2; adr-judge's 2 is a broken invocation refused before spawning; postmortem-verify has none), keyed on the code and never on stderr wording (CLAUDE.md §16); `_gate_result` raises `GateDidNotRun("could not run: <gate> exit N — <the gate's first line>")`. Content for a gate that ran is unchanged and verbatim.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/qh-mcp` | edit | `UNRUN_EXIT`; the raise in `_gate_result`; the module docstring and `INSTRUCTIONS` name the case |
| `tests/mcp-server.test.mjs` | edit | a server copied with `fence.py` and without `record.py`: adr-next and adr-lint on the error channel with the gate's sentence; with `record.py` beside it, content |
| `tests/mutations.json` | edit | the branch disabled |

## Ordered Steps

1. [S1] Reproduce: `tools/call qh_adr_next` on a no-`record.py` copy answers `isError: false`. Bind the failing test on stdin. [proof: acceptance]
2. [S2] `UNRUN_EXIT` and the raise. [proof: acceptance]
3. [S3] The catalogue entry; `node scripts/mutate.mjs --case`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'could-not-run code reaches the client' tests/mcp-server.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a reading gate that exits its own could-not-run code reaches the client on the error channel, not as content` | `tests/mcp-server.test.mjs` | `reply.error.message` is `could not run: adr-<next\|lint> exit 2 — [adr-<next\|lint>] could not run: plugin/lib/record.py …`, never "failed"; with `record.py` beside the copy the same call is `isError: false` content beginning `adr-next exit 0` or `3` | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `UNRUN_EXIT` and the raise in `_gate_result` |
| 2 — something selects it | every `_run_gate` result passes through `_gate_result` |
| 3 — the caller can discover it | the error object reaches the client with the gate's sentence |
| 4 — it is used | the server on stdin against a copy without `record.py` |

## Mutation Log
- 2026-09-11 · eb0fe36* · mutant killed · exit 1 · `plugin/bin/qh-mcp` · with the branch disabled adr-next exit 2 comes back as isError false content and the stdin test finds no error object · acceptance-sha256:ae15eb892b6fcfdefebb530c6fbeba900c605baef1c8cd9ce8054283fb7a2da4

## Invariants

- ADR-012 §1 untouched: no registrar changes; no executing gate is named in the file.
- The `verbatim` claim for a gate that ran is untouched.

## Risks

- A gate whose could-not-run code changes: `tests/gates.test.mjs` `LIB_ABSENT` binds it to the Exit block first.

## Stop Condition

A green run while a reading gate's could-not-run exit is returned as `isError: false`.

## Out of Scope

- `isError: true` content as the shape (permanent: boundary: ADR-012 §2 names the error object the server already uses for could-not-run; two shapes for one meaning is drift)

## Notes

The one-module test asserts qh-mcp's source never mentions `record.py` (it reads no records), so the table's comment names "the grammar module" rather than the file. Codes verified by execution 2026-09-11 (ADR-046 §Context).

## Verification Log
- 2026-09-11 · eb0fe36* · exit 0 · `node --test --test-name-pattern 'could-not-run code reaches the client' tests/mcp-server.test.mjs` · acceptance-sha256:ae15eb892b6fcfdefebb530c6fbeba900c605baef1c8cd9ce8054283fb7a2da4 · ms:257
- 2026-09-11 · eb0fe36* · exit 0 · `node --test --test-name-pattern 'could-not-run code reaches the client' tests/mcp-server.test.mjs` · acceptance-sha256:ae15eb892b6fcfdefebb530c6fbeba900c605baef1c8cd9ce8054283fb7a2da4 · ms:240
