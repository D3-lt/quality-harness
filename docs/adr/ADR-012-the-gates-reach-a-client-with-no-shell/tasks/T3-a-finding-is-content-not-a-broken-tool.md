# Task ADR-012-T3: A finding is content; the error channel is reserved for a gate that could not run

**Depends-on:** T1, T2
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** the tool result shape — findings and exit code as content (T4)
**Consumes:** `dispatch(request)` (T1); the five tool definitions (T2)
**Data dependency:** hermetic

## Goal

A gate that ran and found problems returns them as ordinary content with its exit code; only a gate
that could not run reaches the JSON-RPC error channel.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/qh-mcp` | edit | The result builder, and the one place that decides which channel a run uses |
| `tests/mcp-server.test.mjs` | edit | Both channels, asserted against each other |
| `tests/mutations.json` | edit | The catalogue entry for the channel decision |

## Ordered Steps

1. Write the RED test: a gate run over a corpus with a real finding must come back with
   `isError` falsy and the finding in its content. It does not yet — confirm red.
2. Add the result builder. A completed run — the process started and exited, whatever its code —
   returns content: the gate's stdout and stderr verbatim, plus the exit code stated explicitly, so
   a caller can tell exit 1 from exit 0 without parsing prose.
3. Route only these to the error channel: the interpreter did not start, the gate file is missing,
   the requested path does not exist, the arguments do not match the schema. Each carries what was
   attempted, in the vocabulary ADR-005 already uses — `could not run`, never `failed`.
4. Assert gate output is returned VERBATIM. The server must not summarise, re-word or grade it;
   a second opinion about a gate's output is a second gate, and this one has no mutations.
5. Add the catalogue entry and confirm RED.

## Acceptance

```bash
set -o pipefail
node --test tests/mcp-server.test.mjs 2>&1 | tee /tmp/qh-mcp-t3.out && ! grep -qE "tests 0|^FAIL|not ok" /tmp/qh-mcp-t3.out
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `a gate that ran and found something returns content, not an error` | `tests/mcp-server.test.mjs` | The instruct-never-block rule over MCP; a non-zero exit is content | — |
| `a gate that could not run reaches the error channel, and says which` | `tests/mcp-server.test.mjs` | The other half — asserted in the same test, so neither can pass by the server always choosing one channel | — |
| `gate output is returned verbatim` | `tests/mcp-server.test.mjs` | Compares against the same gate run directly; catches any summarising the server might grow | — |

The first two must be one test or two tests that both run. A server hard-coded to `isError: false`
passes the first alone; hard-coded to `true` passes the second alone. Only the pair measures the
decision, which is the whole mechanism this task adds.

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `a gate that ran and found something returns content…` |
| 2 — something selects it | The channel branch; the mutation that forces every run down one channel and turns the pair red |
| 3 — the caller can discover it | Each tool's description states that a finding is advice and what the exit codes mean — the channel proven to arrive, since `WithInstructions` is unproven on Desktop |
| 4 — it is used | Nothing measures this yet |

## Mutation Log

- 2026-08-29 · 48baef8* · mutant killed · exit 1 · `plugin/bin/qh-mcp` · a completed run is content, never the error channel · acceptance-sha256:5ffd2e41049bc725bd6e5cc313be152548ba8844fa9c3f100255c04466f06b6d
- 2026-08-29 · 48baef8* · mutant killed · exit 1 · `plugin/bin/qh-mcp` · a path that is not there is a gate that could not run, not a clean result · acceptance-sha256:5ffd2e41049bc725bd6e5cc313be152548ba8844fa9c3f100255c04466f06b6d

## Invariants

- A process that started and exited never reaches the error channel.
- Gate output is never modified, summarised or graded by the server.
- "Could not run" and "ran and found nothing" are different results (ADR-005).

## Risks

- A gate writes something to stderr on a clean run and a caller reads it as a finding. Mitigated by
  stating the exit code explicitly rather than leaving the caller to infer it from output presence.

## Stop Condition

Stop and ask if a gate is found that exits non-zero for a reason that is neither a finding nor an
environment failure — the two-channel split assumes those are the only two, and a third would need
deciding rather than guessing.

**A third was found, 2026-08-29, and it is decided rather than absorbed.** `adr-judge` exits 0
whatever it finds — a heuristic about prose must never enter this corpus's evidence chain — so its
ONLY non-zero exit is a broken invocation. Spawned with neither `adr` nor `rubric` it printed its
usage and exited 2, and the server handed that back as content with an exit code, which reads
exactly like a gate that ran and found something. **The decision: the server never produces the
third case.** An invocation the gate would reject is refused before anything is spawned, where it is
still `could not run`. That keeps the two-channel split true rather than widening it, and it is
consistent with the schema validation T2 already does for the same reason. `a broken invocation is
refused, not dressed up as a finding` asserts it, and asserts the two valid shapes still reach the
gate — a handler hard-coded to refuse would otherwise pass.

## Out of Scope

- Changing any gate's exit codes. (permanent: the CLI is the contract; a second consumer does not get
  to rewrite it for the first.)

## Verification Log
- 2026-08-29 · 48baef8 · exit 0 · `set -o pipefail …` · acceptance-sha256:5ffd2e41049bc725bd6e5cc313be152548ba8844fa9c3f100255c04466f06b6d
