# Task ADR-012-T5: Expose the last two reading gates, and say why the third stays out

**Depends-on:** ADR-012-T2
**Covers:** none — no spec
**Estimated scope:** S (two registrations, two handlers, two tests)
**Owner:** unassigned
**Produces:** `qh_adr_retire_check` and `qh_postmortem_verify` over MCP, read-only by registration
**Consumes:** the `reading_tool` registry and the two-channel result split (T1, T3)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a gate deferred by scope is reachable once exposed, and its own output comes back`, `a call naming no single mode is refused rather than guessed at`

## Goal

The two reading gates ADR-012 deferred are reachable from a client with no shell, and `qh-root` is
absent for a stated reason rather than by omission.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/qh-mcp` | edit | two handlers and two `reading_tool` registrations |
| `tests/mcp-server.test.mjs` | edit | the listing set, the round-trip per tool, and the mode refusal |
| `tests/mutations.json` | edit | three catalogue entries, or the checks are unproven (ADR-003) |

## Ordered Steps

1. [S1] Establish the failing tests: extend `READING_GATES` to seven, add a round-trip invocation per new tool against fixtures that already exist (`adr-archive/README.md`, `postmortem-selftest.md`), and add the mode-refusal test. The listing assertion is exact, so all of this is red until the registrations land. Confirmed by `git stash push -- plugin/bin/qh-mcp` and re-running: **3 failed / 12 passed**, restored with `git stash pop`. Recorded honestly: the registrations were written before the test edits, so this is red observed AFTER the fact rather than TDD; the mutations at S6 are what bind the assertions. [proof: acceptance]
2. [S2] Re-run the safety enumeration a THIRD time rather than trusting the record's two earlier runs — `grep -cE 'subprocess\.(run|Popen)'` returns 0 for both gates, and a sweep for `write_text`, `open(...,'w')`, `mkdir`, `unlink` and `rename` finds only string operations and a comment. Read-only in fact, not by assertion, and `--adopt` calls `adoption_report()` rather than adopting anything. [proof: acceptance]
3. [S3] Add the two handlers and registrations through `reading_tool`, the only registrar there is, so the read-only annotation stays derived rather than declared. [proof: acceptance]
4. [S4] Refuse a `qh_adr_retire_check` call that names no single mode — neither argument, half the `--adopt` pair, or both modes at once. The gate answers those with a usage dump at exit 1, which over MCP is indistinguishable from a finding; this is the same third reason `adr-judge` already refuses (T3). [proof: acceptance]
5. [S5] Leave `qh-root` unexposed and record why in the source beside the registrations, not only here. [proof: acceptance]
6. [S6] Add three catalogue mutations and confirm each comes back RED. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test tests/mcp-server.test.mjs 2>&1 | tee /tmp/adr012-t5.out \
  && ! grep -qE "no tests to run|^not ok|^# fail [1-9]" /tmp/adr012-t5.out \
  && python3 plugin/bin/adr-lint docs/adr/ADR-027-the-harness-ships-an-operating-surface.md
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every reading gate is listed, and calling it returns that gate's own output` | `tests/mcp-server.test.mjs` | both new tools are advertised AND reachable, output compared against the gate run directly | — | S2, S3 |
| `adr-retire-check is refused when the call names no single mode` | `tests/mcp-server.test.mjs` | each ambiguous shape is refused for its own reason, and both valid shapes still reach the gate | — | S4 |
| `no tool executes text the corpus supplies` | `tests/mcp-server.test.mjs` | the boundary is unchanged by this scope change — asserted over the registry AND the source | — | S1, S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `tools/list` returns seven tools, each `readOnlyHint: true` |
| 2 — something selects it | the test calls each one over a real stdio pipe and compares against the gate run directly |
| 3 — the caller can discover it | the tool description carries what the gate answers and what its exit codes mean — the channel T4 measured as the one that arrives |
| 4 — it is used | not observable from here: the only witness to a client calling a tool is someone at that client, which is T4's own finding. A proxy would read like evidence |

## Mutation Log

## Verification Log

## Invariants

- Every registered tool is annotated read-only, and `reading_tool` is still the only registrar.
- Neither `adr-verify` nor `spec-verify` appears in the registry or in the server's source.
- A gate that ran returns its findings as content with `isError: false`; a call that could not run returns an error object and no content.
- `qh-root` is not registered.

## Risks

- Two more tools widen the surface a client sees. Both are readers by the enumeration in S1, and the annotation is derived from the registrar rather than declared, so the widening cannot smuggle in a writer.
- `--adopt` reads two roots and could be mistaken for a mutating mode by its name. It is not: it calls `adoption_report()` and writes nothing, which S1 checked directly rather than inferring from the name.

## Stop Condition

Stop if either gate turns out to write anything, or to spawn anything with argv the corpus
influences. The boundary is what makes the rest of this record safe, and a scope change that touches
it is a different decision.

## Out of Scope

- Exposing `qh-root` (permanent: boundary: it answers "which install is newest on THIS machine", and over MCP that machine is the server's rather than the caller's — an answer about a different thing than the caller believes, which is the defect ADR-031 exists to prevent)
- Exposing `adr-verify` or `spec-verify` in any form (permanent: boundary: ADR-012's Decision, unchanged)
- The mutation half on Desktop (deferred: docs/BACKLOG.md §33)
- Re-measuring Desktop on a current build (deferred: docs/BACKLOG.md §33 — it needs a human at the client, which is T4's own finding)
