# Task ADR-012-T1: A stdio JSON-RPC core whose read-only annotation cannot disagree with its registration

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** `reading_tool()` registrar and the registry it fills (T2, T3); `dispatch(request)` returning a JSON-RPC response object (T2, T3)
**Consumes:** none
**Data dependency:** hermetic

## Goal

`plugin/bin/qh-mcp` answers `initialize`, `tools/list` and `tools/call` over line-delimited JSON on
stdio, with every tool registered through one function that sets `readOnlyHint` itself.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/qh-mcp` | add | The server. A `bin/` entry, so `standalone-link.mjs` gives it a forwarder like every other gate |
| `tests/mcp-server.test.mjs` | add | Drives the three methods over a real stdio pipe, as a client does |
| `tests/mutations.json` | edit | The catalogue entry for the registrar — the mechanism this task adds |
| `.gitattributes` | none — already correct | `plugin/bin/* text eol=lf` covers the new path by construction. Asked git rather than read the file: `git check-attr text eol -- plugin/bin/qh-mcp` answers `text: set`, `eol: lf` (CLAUDE.md §7) |
| `plugin/bin/qh-mcp.cmd` | add | `tests/package.test.mjs` requires a Windows shim per gate, CRLF, naming the `py` launcher first |
| `tests/package.test.mjs` | edit | the `gates` list this suite checks the shipped tree against |
| `tests/gate-rules.test.mjs` | edit | `every gate refuses a flag it does not know` asserts its case list equals `bin/`, so a new gate cannot be added without one |

The line that SELECTS a tool is `reading_tool()` itself — there is no registry literal to edit and
no dispatch table to add to, which is the point. Deleting the `readOnlyHint` assignment inside it is
the mutation that proves the annotation is derived rather than decorative.

## Ordered Steps

1. Write `tests/mcp-server.test.mjs` and confirm it is RED: spawn `plugin/bin/qh-mcp`, write an
   `initialize` request, assert a `serverInfo` comes back. The file does not exist, so the spawn
   fails and the test fails — confirm that before writing any server code.
2. Add `plugin/bin/qh-mcp` with the three methods, reading line-delimited JSON from stdin and
   writing one JSON object per line to stdout. Nothing else may be written to stdout — a stray
   `print` corrupts the stream, and this is the one bug a client reports as "the server is broken".
3. Add `reading_tool(name, description, schema, handler)`: appends to the registry AND sets
   `annotations.readOnlyHint = True`. It takes no argument that could set it otherwise, and no
   sibling registrar exists.
4. Add `tests/mutations.json` entries and `.gitattributes`, and run `git check-attr text eol` on the
   new path to confirm git agrees — read the answer git gives for the path, never the file.
5. Register one trivial probe tool so `tools/list` has something to return; T2 replaces it with the
   real five.

## Acceptance

```bash
set -o pipefail
node --test tests/mcp-server.test.mjs 2>&1 | tee /tmp/qh-mcp-t1.out && ! grep -qE "tests 0|^FAIL|not ok" /tmp/qh-mcp-t1.out
```

The `tests 0` guard is the one that matters here: `node --test` on a file whose every test was
renamed exits 0 having run nothing, and this fence is written before the file exists precisely so it
is red until it is not.

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `initialize returns a serverInfo over a real stdio pipe` | `tests/mcp-server.test.mjs` | The transport works as a client drives it, not as a unit test calls it | — |
| `every registered tool is annotated read-only, and nothing can register one that is not` | `tests/mcp-server.test.mjs` | `readOnlyHint` is derived from the registrar; asserts the registry is non-empty first, so it cannot pass vacuously | — |
| `a malformed request is answered, not crashed on` | `tests/mcp-server.test.mjs` | A client sending garbage gets a JSON-RPC error object and the server stays up | — |
| `nothing but JSON-RPC reaches stdout` | `tests/mcp-server.test.mjs` | Every line of stdout parses as JSON — the corruption bug a client cannot diagnose | — |

The read-only test must assert the registry has entries before asserting all of them are read-only:
`all()` over an empty list is `True`, which is a vacuous pass at 100% coverage — the exact class
CLAUDE.md §4 names.

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `initialize returns a serverInfo over a real stdio pipe` |
| 2 — something selects it | The stdio read loop; the mutation that breaks the `tools/call` dispatch arm and turns the suite red |
| 3 — the caller can discover it | `tools/list` output, asserted against the registry rather than a hand-written list |
| 4 — it is used | Nothing measures this yet — T4 is the first real client, and it is a human-observed run |

## Mutation Log

## Invariants

- Stdout carries JSON-RPC and nothing else.
- No registrar exists that can produce a tool without `readOnlyHint` set true.
- The server holds no state between calls.

## Risks

- Hand-written JSON-RPC mishandles a framing case a real client relies on. Mitigated by driving the
  actual pipe in T1's tests rather than calling `dispatch()` directly, and by T4 against a real client.

## Stop Condition

Stop and ask if `initialize` needs a protocol-version negotiation this task cannot pin from the
spec — guessing a version a client rejects makes every later task unmeasurable.

**Resolved 2026-08-29, without a guess.** No version is pinned where a client names one: the server
echoes `params.protocolVersion` back when it is a non-empty string, and falls back to a single named
constant only when the client sends none. The three methods implemented here are stable across every
published revision, so echoing costs nothing and removes the failure mode the stop condition names —
a pinned revision a real Desktop rejects would make T4 unmeasurable for a reason unrelated to this
decision. `a client speaking a different protocol revision is answered in its own revision` asserts
both halves.

## Out of Scope

- The real gate tools — that is T2.
- Result vocabulary — that is T3.

## Verification Log
