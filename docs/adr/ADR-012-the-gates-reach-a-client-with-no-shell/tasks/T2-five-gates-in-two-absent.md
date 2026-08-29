# Task ADR-012-T2: Register the five reading gates, and make the two executing ones unregisterable

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** the five tool definitions and their argument schemas (T3, T4)
**Consumes:** `reading_tool()` registrar and the registry it fills (T1)
**Data dependency:** hermetic

## Goal

`tools/list` returns exactly `qh_adr_lint`, `qh_adr_next`, `qh_adr_debt`, `qh_adr_judge` and
`qh_arch_lint`, each spawning its gate through the interpreter, and no path exists by which
`adr-verify` or `spec-verify` could be added.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/qh-mcp` | edit | The five `reading_tool()` calls and their handlers |
| `tests/mcp-server.test.mjs` | edit | The absence assertion, and one end-to-end call per tool |
| `tests/mutations.json` | edit | Catalogue entries for the two mechanisms this task adds |

The line that SELECTS each gate is its `reading_tool()` call; deleting one removes the tool from
`tools/list`, which is what the per-tool assertion catches. The line that selects the INTERPRETER is
the spawn — `[sys.executable, gate_path, *args]`, never the gate path alone, because Windows cannot
exec a `#!` script and a direct spawn there returns status `null`, which is neither an error nor a
failure (CLAUDE.md §7).

## Ordered Steps

1. Write the RED test first: assert `tools/list` contains `qh_adr_lint`. It does not yet, so the
   test fails — confirm that before adding the registration.
2. Add the five `reading_tool()` calls, each with a JSON schema declaring its arguments and a
   description carrying what the gate answers and what its exit codes mean (T3 covers the result
   shape; this task covers the declaration).
3. Add the absence test: `tools/list` contains no tool whose name or handler mentions `adr-verify`
   or `spec-verify`, asserted against the registry AND against the file's source text, so a future
   author cannot satisfy it by renaming.
4. Spawn every gate through `sys.executable`. Assert it, rather than trusting it: the test reads the
   spawn argv, because a `#!` spawn works on the developer's machine and returns `null` on the one
   CI blocks on.
5. Add catalogue entries and confirm both RED.

## Acceptance

```bash
set -o pipefail
node --test tests/mcp-server.test.mjs 2>&1 | tee /tmp/qh-mcp-t2.out && ! grep -qE "tests 0|^FAIL|not ok" /tmp/qh-mcp-t2.out
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `every reading gate is listed, and calling it returns that gate's own output` | `tests/mcp-server.test.mjs` | Each of the five is registered AND reachable — one assertion per tool, so deleting one registration is red | — |
| `no tool executes text the corpus supplies` | `tests/mcp-server.test.mjs` | `adr-verify` and `spec-verify` appear in neither the registry nor the source; the boundary this ADR exists for | — |
| `a gate is spawned through the interpreter, never as a bare path` | `tests/mcp-server.test.mjs` | The Windows-only failure that returns `null` rather than an error | — |

The absence test must first assert the registry is non-empty and contains a known tool. `not any(...)`
over an empty registry is `True`, and a server that registered nothing at all would pass the
boundary assertion while providing no boundary — the vacuous class CLAUDE.md §4 names.

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `every reading gate is listed…` |
| 2 — something selects it | The `reading_tool()` call per gate; the mutation that removes one and turns its assertion red |
| 3 — the caller can discover it | Each tool's JSON schema, asserted to declare every argument the handler honours — an argument the handler accepts and the schema never advertises works for anyone who sends it and is invisible to anyone who reads |
| 4 — it is used | Nothing measures this yet — T4 is the first real client |

## Mutation Log

- 2026-08-29 · 46ce66b* · mutant killed · exit 1 · `plugin/bin/qh-mcp` · a gate spawned as a bare path returns status null on Windows, which is neither an error nor a failure · acceptance-sha256:39cf2d0261d6d1649ef582f954211de5203f36da10267da9a0b4e67eb80ffc78
- 2026-08-29 · 46ce66b* · mutant killed · exit 1 · `plugin/bin/qh-mcp` · each gate reaches tools/list only through its own reading_tool call · acceptance-sha256:39cf2d0261d6d1649ef582f954211de5203f36da10267da9a0b4e67eb80ffc78

## Invariants

- `tools/list` names exactly five tools.
- No gate is spawned other than through `sys.executable`.
- Every argument a handler honours is declared in that tool's schema.

## Risks

- A gate's CLI flags change and the schema drifts. Mitigated by passing arguments through rather than
  reimplementing flag parsing, and by T3's rule that gate output is returned verbatim.

## Stop Condition

Stop and ask if any of the five turns out to spawn something other than `git` with fixed argv — the
Context table was enumerated 2026-08-29 and a gate that has changed since invalidates the boundary
this whole record rests on.

**Re-checked before registering anything, 2026-08-29**, with
`grep -n 'subprocess\.\(run\|Popen\|call\|check_output\)' plugin/bin/adr-lint plugin/bin/adr-debt
plugin/bin/arch-lint plugin/bin/adr-next plugin/bin/adr-judge`: four call sites across three gates,
every one a literal `["git", "-C", …]` list (`rev-parse --show-toplevel`, and `ls-files` with and
without `--others --exclude-standard`); `adr-next` and `adr-judge` spawn nothing at all. The
boundary the record rests on holds.

## Out of Scope

- The result vocabulary — that is T3.
- `adr-state`, `adr-context` and `work-next`, which are `plugin/scripts/*.mjs` rather than gates.
  (deferred: docs/BACKLOG.md §33)

## Verification Log
- 2026-08-29 · 46ce66b · exit 0 · `set -o pipefail …` · acceptance-sha256:39cf2d0261d6d1649ef582f954211de5203f36da10267da9a0b4e67eb80ffc78
- 2026-08-29 · a060f50 · exit 0 · `set -o pipefail …` · acceptance-sha256:39cf2d0261d6d1649ef582f954211de5203f36da10267da9a0b4e67eb80ffc78
