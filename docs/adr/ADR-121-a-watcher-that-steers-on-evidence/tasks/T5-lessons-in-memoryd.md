# Task ADR-121-T5: Proven lessons go to memoryd; mrw writes become visible

**Depends-on:** T1, T3
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** lesson memories; mrw receipts as `file.written`
**Consumes:** the contracts of T1, T3 (ADR-121 Inter-task Contracts)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A finding acted on and followed by a pass becomes an anchored lesson in the project's memoryd space; SessionStart lists the lessons for the area a session works in; mrw's `--json` receipt feeds `file.written` for every path an mrw write touched. The memoryd contract, from memory-runtime's answers of 2026-10-21 (checked there at 6740b1f): plain MCP JSON-RPC over the unix socket `host.json` names (mode 0600, same user); principal the human the session works for, `agent: quality-harness-watcher`; `insert` of kind `procedure` or `correction` with labels `source=quality-harness`, `project`, `rule` and a coarse `area` (`insert` attests identical text, so a retry writes nothing twice); an `anchor` of type `file-snippet` keyed on a stable verbatim span, never a line number; the watcher records `record_verdict` (verifier `quality-harness`, the commit) at each commit, so a drifted lesson reads stale and is never hidden; SessionStart uses `list` by exact labels (no embedding, milliseconds), never `recall` (an embed per query, about a second on a CPU TEI); an outcome on a recalled lesson goes to the `recall-feedback` space as one `fact` with labels `feedback`, `verdict` and `memory_id`. Findings and check results are never written as memories.

Amended 2026-10-21 from prior art (ADR-121 Decision 8): a lesson is written only when every piece of text it quotes is found verbatim, by code, in the evidence it cites (the emission, the command, the check's output tail, the anchored span); a lesson already shown in a session is not shown again in it; when lessons merge, the survivor keeps a `folded_in` list of what it absorbed.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/lessons.test.mjs` | create | the rows below, against an MCP test double that speaks the socket protocol (0 locks: new) |
| `core/hooks/lessons.go` | create | the detector (`host.json` → socket → MCP initialize within 300 ms; ENOENT, ECONNREFUSED or a socket mid-restart are absent), the lesson writer, the anchor verdicts, the SessionStart `list` |
| `plugin/scripts/hook-record.mjs` | edit | an mrw write's `--json` receipt records one `file.written` per path it names |

## Ordered Steps

1. [S1] Write the failing tests and record the red run, against an MCP double over a unix socket and mrw receipts captured from the real binary: an acted-and-passed finding inserts one lesson with `source=quality-harness`, the rule, the area and a `file-snippet` anchor; a retry is attested, not duplicated; a commit that changes the anchored span records `drifted`, and one that keeps it `verified`; SessionStart `list`s the lessons for the session's area and names them; a recalled lesson followed by a pass writes one `recall-feedback` fact; an mrw receipt naming two paths records two `file.written` rows; with no `host.json`, a refused socket or a socket missing mid-restart, nothing is written, nothing fails, and the absence is said once.
2. [S2] Implement the writer, the recall at SessionStart and the receipt reader.
3. [S3] What the memoryd double does not model is named in Risks. [proof: human: read in review]
4. [S4] Record a killed mutant per mechanism. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/lessons.test.mjs 2>&1) \
  && for n in "an acted and passed finding becomes one anchored lesson" \
      "an mrw receipt makes every written path visible"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an acted and passed finding becomes one anchored lesson` | `tests/lessons.test.mjs` | the writer | — | S1, S2 |
| `an mrw receipt makes every written path visible` | `tests/lessons.test.mjs` | the receipt reader | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | the hook or watcher path that calls it |
| 3 — the caller can discover it | `qh nudges`, the finding text, the record |
| 4 — it is used | every session once T3 ships |

## Mutation Log

## Invariants

- With no watcher running, every hook answers exactly as before this record.
- The sanctioned refusals are unchanged.

## Risks

- See the parent record's Risks.

## Stop Condition

Stop if memoryd's local socket requires credentials a hook cannot hold.

## Out of Scope

- See the parent record (permanent: boundary: the parent record's Out of Scope applies to every task)

## Verification Log
