# ADR-046: A caller relays could-not-run as could-not-run

**Status:** Accepted
**Date:** 2026-09-11
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** ADR-005, ADR-012, ADR-040, ADR-045, `docs/BACKLOG.md` §199
**Governs:** `plugin/scripts/facts-gate-dispatch.sh`, `plugin/bin/qh-mcp`, `plugin/scripts/lifecycle.mjs`, `tests/gates.test.mjs`, `tests/mcp-server.test.mjs`, `tests/lifecycle.test.mjs`, `tests/mutations.json`
**Enforced-by:** `tests/gates.test.mjs::the dispatcher relays a gate that could not run as UNPROVEN, never as an unsatisfied artifact`, `tests/mcp-server.test.mjs::a reading gate that exits its own could-not-run code reaches the client on the error channel, not as content`, `tests/lifecycle.test.mjs::SessionStart says UNPROVEN, with the gate's reason, when adr-next could not run`, `tests/lifecycle.test.mjs::runArtifactGates returns UNPROVEN when a dispatched gate could not run or could not classify`, `tests/lifecycle.test.mjs::SessionStart always surfaces an UNPROVEN ready line and still caps ordinary ones`, `tests/gates.test.mjs::ADR-046 names the ADR-012 §2 amendment for a completed could-not-run exit`, `tests/gates.test.mjs::postmortem-verify on a path it cannot read exits could-not-run, and the dispatcher relays it as UNPROVEN`
**Invalidates:** Amends ADR-012 §2 for the could-not-run case. ADR-012 §2 says: "every completed run returns its findings and the gate's exit code as ordinary content, and the error channel is reserved for the cases ADR-005 already names: the interpreter did not start, the path does not exist, git could not be asked." Findings of a run that did run stay on the content channel, unmodified. This record amends that clause for a completed reserved could-not-run exit: that run checked nothing, so `qh-mcp` raises `GateDidNotRun` on the error channel rather than returning the exit as ordinary content. ADR-012 itself is not rewritten. ADR-040 makes a git listing the gates could not obtain UNPROVEN in the SessionStart orientation; this adds the gate itself not answering. ADR-005 is the rule both apply.
**Served-path change:** A plugin whose `lib/` is missing beside `bin/` — the stale-copy shape the forwarders replace — is told so by every surface that runs a gate: the edit-time dispatcher prints `UNPROVEN: <gate> could not run (exit N): <the gate's sentence>` instead of "is not satisfied … Fix the artifact, not the gate"; an MCP client gets a JSON-RPC error object instead of `isError: false` content; the SessionStart orientation says UNPROVEN where a ready task would be instead of nothing.

## Context

ADR-045 T4 gave every gate one exit code that means "nothing was checked", read from its own Exit block and verified 2026-09-11 by running each gate with its lib removed:

| gate | missing lib | exit | first stderr line |
|---|---|---:|---|
| adr-verify | fence.py, record.py | 4 | `[adr-verify] could not run: plugin/lib/<lib>.py is not beside this gate's bin/ …` |
| spec-verify | fence.py, record.py | 4 | `[spec-verify] could not run: …` |
| qh-mcp | fence.py | 4 | `[qh-mcp] could not run: …` |
| adr-lint | record.py | 2 | `[adr-lint] could not run: …` |
| adr-next | record.py | 2 | `[adr-next] could not run: …` |
| arch-lint | record.py | 2 | `[arch-lint] could not run: …` |
| adr-debt | record.py | 2 | `[adr-debt] could not run: …` |
| adr-retire-check | record.py | 2 | `[adr-retire-check] could not run: …` |

The second different-lineage review of ADR-045 (CLAUDE.md §12) then followed those codes into the surfaces that run the gates and found three that turned them into something else. Executed 2026-09-11 against a copy of the plugin with `lib/` absent:

- `plugin/scripts/facts-gate-dispatch.sh` (`:333`, `:340` on `1739425`) printed `adr-lint is not satisfied for <record> … Fix the artifact, not the gate` for adr-lint's exit 2 — a verdict about a record the gate never opened, and an instruction to edit it.
- `plugin/bin/qh-mcp` `_gate_result` (`:217`) returned adr-next's exit 2 as `{"isError": false, "content": [{"text": "adr-next exit 2\n…could not run…"}]}` — the shape of a gate that ran and found something, which ADR-012 §2 says a gate that could not run must not borrow.
- `plugin/scripts/lifecycle.mjs` `readyTaskLines` (`:2763`) `continue`d on any adr-next status other than 0 or 3, so the SessionStart orientation said nothing at all — the same silence as a repository with no tasks. The two comment paragraphs above `spawnGate` record the month of empty Windows sessions that exact `continue` produced once before.

Class: every surface that spawns a gate and reads its exit. Enumerated 2026-09-11: `rg -n "spawnGate\(|run_bounded\(|\\\$BIN/|run_adr_lint" plugin/scripts plugin/bin/qh-mcp` — the three above; `work-next.mjs` and `statusline.mjs` print commands and spawn no gate; the remaining `.mjs` callers propagate the process exit unchanged.

## Existing Primitives Audit

- The dispatcher's `UNPROVEN: could not classify %s` line and `exit 0` — **reused**: the new line uses the same word, the same stream and the same exit.
- qh-mcp's `GateDidNotRun` → `_error(INTERNAL_ERROR, …)` path for a missing path or an interpreter that did not start — **reused**: the downstream code raises the same exception, so the client sees the shape it already handles.
- lifecycle.mjs's `look: 'UNPROVEN'` for a git listing that could not be obtained (ADR-040) — **reused as vocabulary**: the per-directory line says `UNPROVEN —` and ends `Ready tasks there are not known.`
- The per-gate could-not-run table (ADR-045 T4, `tests/gates.test.mjs` `LIB_ABSENT`) — **reused as the source of the numbers** in each caller; each caller carries only the gates it runs.

## Decision

**A caller that runs a gate relays the gate's own could-not-run code as could-not-run, in the vocabulary that caller already uses for a look that did not happen — never as a finding about the artifact, never as content, never as silence.**

1. The code is the gate's, read from its Exit block and verified by execution (the table above). A caller keys on the CODE, never on stderr wording: a classifier over another program's prose is an empirical claim about every gate's text (CLAUDE.md §16).
2. `facts-gate-dispatch.sh` prints `UNPROVEN: <gate> could not run (exit N): <the gate's could-not-run sentence, else its first line>` and exits 0, for adr-lint 2, arch-lint 2, adr-retire-check 2, spec-verify 4, postmortem-verify 2. On PostToolUse the line is stdout (`additionalContext`); on commit/completion it is stderr, the stream `runArtifactGates` reads (the same split as the finding text). Every `UNPROVEN:` print in this file uses that split, including `could not classify`.
3. `qh-mcp` raises `GateDidNotRun` when a reading gate exits its own code (`UNRUN_EXIT`: adr-lint, adr-next, adr-debt, arch-lint, adr-retire-check, postmortem-verify → 2), carrying `could not run: <gate> exit N — <the gate's first line>`; the client receives a JSON-RPC error object, the channel ADR-012 §2 reserves for could-not-run after this record's amendment of that clause. adr-judge's 2 is a broken invocation the server refuses before spawning. Content for a gate that ran is unchanged and verbatim.
4. `lifecycle.mjs` `readyTaskLines` emits, where the ready line would be, `<dir>: UNPROVEN — adr-next could not run (exit N): <first line> Ready tasks there are not known.` — or `did not run (<spawn error or signal>)` for status null, or `exited N but its answer was not JSON`. The directory is `posixListed`. SessionStart always surfaces UNPROVEN lines; the three-line cap applies to ordinary ready/blocked/done lines only.
5. Each is tested at its outermost boundary (CLAUDE.md §4) against a plugin copied without `lib/`: the hook adapter on stdin at both boundaries, `runArtifactGates` (stderr consumer), the MCP server on stdin, the SessionStart hook on stdin with `CLAUDE_PLUGIN_ROOT`; and each beside the real plugin answering with a finding or a ready task, so the clean arm is the classification and not a message always printed.

## Alternatives Considered

- **Recognise the gates' `could not run:` stderr sentence.** Rejected: a caller then carries a claim about eight programs' prose, and a gate that rewords its sentence fails open into the finding path. The code is the contract; the sentence is relayed, not parsed.
- **Return `isError: true` content from qh-mcp.** Rejected: ADR-012 §2 names the error channel — `isError`, *or an error object* — for could-not-run, and the server already answers a missing path and an interpreter that did not start with an error object through `GateDidNotRun`. Two shapes for one meaning is the drift this project keeps paying for; one shape, and the gate's text rides in its message.
- **Leave postmortem-verify without a could-not-run code.** Rejected on the third review: it is dispatched, a missing or unreadable path tracebacked at exit 1, and the dispatcher then said "not satisfied". It now declares exit 2 and sits in the table. adr-judge is still not dispatched here.
- **Fold these into ADR-045.** Rejected: ADR-045 governs the grammar inside the gates and its `Governs:` names no Session-layer surface; a record's scope is what it governs.

## Component / Boundary Impact

| Component | Ownership after change | Why it changes |
|----------|------------------------|----------------|
| `plugin/scripts/facts-gate-dispatch.sh` | edit-time and completion dispatcher | distinguishes a gate's could-not-run code before composing finding text |
| `plugin/bin/qh-mcp` | MCP server over the reading gates | a downstream could-not-run code is the error channel |
| `plugin/scripts/lifecycle.mjs` | SessionStart orientation | a directory whose adr-next did not answer is UNPROVEN, not absent |
| `tests/mutations.json` | mutation campaign | one entry per caller |

## Wiring & Contract Changes

| Surface | Change | Consumers |
|---------|--------|-----------|
| dispatcher stdout / stderr | `UNPROVEN: <gate> could not run (exit N): …` on the gate's code — stdout at PostToolUse, stderr at commit/completion | PostToolUse `additionalContext`, `runArtifactGates`, the completion and commit boundaries |
| `qh-mcp` `tools/call` | JSON-RPC error object for a reading gate's could-not-run code | any MCP client |
| SessionStart orientation | `UNPROVEN —` line under `ADR tasks in flight:` | the session |

postmortem-verify newly declares exit 2 for a path it could not read; the other gates' codes are unchanged.

## Inter-task Contracts

None. Wave 1's three tasks touch three files and share only the table of codes. Wave 2 (T4–T7) extends those callers; T6 is this record's own header.

## Implementation

See `docs/adr/ADR-046-a-caller-relays-could-not-run/tasks/README.md`.

## Consequences

- **Positive:** a stale or partial install is named at every surface that would otherwise have blamed a record, dressed the failure as content, or said nothing.
- **Negative:** three more places carry a per-gate number; each is bound to the gate's Exit block by `tests/gates.test.mjs` `LIB_ABSENT`, and a gate that changes its code fails that test before it can drift here.
- **Neutral:** a gate that ran — exit 0, 1, 3, or a finding's code — is reported exactly as before.

## Out of Scope

- A could-not-run code for adr-judge (deferred: Follow-ups — it is not dispatched; its 2 is a broken invocation the server refuses before spawning)
- Callers that only print a command (`work-next.mjs`, `statusline.mjs`) (permanent: boundary: they run no gate, so there is no exit to relay)
- The gates' own codes (permanent: boundary: ADR-045 T4 decided them; this record reads them)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| A gate's could-not-run code changes and a caller's table goes stale | Low | Med | `LIB_ABSENT` binds every gate's code to its Exit block by execution; the three tables cite it |
| A gate exits its could-not-run code for a reason that IS a finding | Low | Med | each Exit block reserves the code for "nothing was checked" and says so in the clause the test reads |
| The dispatcher's `grep -m1 'could not run'` picks a stdout line | Low | Low | on this path the gates write nothing to stdout; the fallback is the first line |

## Rollback

Revert the three hunks; the tests named in Enforced-by go red. No persistent state.

## Follow-ups

- [ ] adr-judge declares no could-not-run code this record keys; it is not a dispatched facts-first gate. If a caller starts spawning it for a look, it needs a row.
