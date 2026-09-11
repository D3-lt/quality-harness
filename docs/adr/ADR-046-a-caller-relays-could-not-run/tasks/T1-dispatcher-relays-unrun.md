# Task ADR-046-T1: The dispatcher relays a gate's could-not-run code as UNPROVEN

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** XS (one branch in the shell dispatcher; one hook-stdin test; one catalogue entry)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`facts-gate-dispatch.sh` printed `<gate> is not satisfied for <file> … Fix the artifact, not the gate` (and its PostToolUse variant) for ANY nonzero exit — including the code each gate reserves for "nothing was checked": a record the gate never opened, blamed, and an instruction to edit it. The gate's own code (adr-lint 2, arch-lint 2, adr-retire-check 2, spec-verify 4; postmortem-verify declares none) is now recognised before the finding text is composed, and the dispatcher prints `UNPROVEN: <gate> could not run (exit N): <the gate's could-not-run sentence, else its first line>` on stdout, exit 0 — the vocabulary and stream it already uses for a file it could not classify.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/facts-gate-dispatch.sh` | edit | `unrun_exit`; the UNPROVEN branch before the finding text |
| `tests/gates.test.mjs` | edit | through `run-shell-hook.mjs` on stdin, a plugin copied without `lib/`, adr-lint (2) and spec-verify (4), both boundaries; the real plugin on a broken spec still says "not satisfied" |
| `tests/mutations.json` | edit | the branch disabled |

## Ordered Steps

1. [S1] Reproduce: the hook on a no-lib plugin prints nothing useful or the finding text. Bind the failing test on stdin at both boundaries. [proof: acceptance]
2. [S2] `unrun_exit` and the branch. [proof: acceptance]
3. [S3] The catalogue entry; `node scripts/mutate.mjs --case`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'the dispatcher relays a gate that could not run' tests/gates.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the dispatcher relays a gate that could not run as UNPROVEN, never as an unsatisfied artifact` | `tests/gates.test.mjs` | adr-lint exit 2 and spec-verify exit 4 at PostToolUse (as `additionalContext`) and at the completion boundary: the UNPROVEN line with the gate's sentence, no "not satisfied", no "Fix the artifact"; the real plugin on a broken spec says "not satisfied yet" and not UNPROVEN | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `unrun_exit` in the dispatcher |
| 2 — something selects it | every nonzero gate exit passes the branch before the finding text |
| 3 — the caller can discover it | the hook adapter wraps the line as `additionalContext` at PostToolUse |
| 4 — it is used | the hook on stdin against a plugin without `lib/` |

## Mutation Log
- 2026-09-11 · eb0fe36* · mutant killed · exit 1 · `plugin/scripts/facts-gate-dispatch.sh` · with the branch disabled a no-lib adr-lint falls through to "is not satisfied … Fix the artifact", which the hook-stdin test refuses · acceptance-sha256:d098c7bfa462a2e28173a71c948e9835d8f190269dfdf0968d7df837deb44f66

## Invariants

- A gate that ran and found something is reported exactly as before, at both boundaries.
- The dispatcher still exits 0 on every path.

## Risks

- `grep -m1 'could not run'` could pick a stdout line of a gate that wrote findings AND exited its could-not-run code; no gate does, and the fallback is the first line.

## Stop Condition

A green run while a gate's could-not-run exit produces "is not satisfied" or "Fix the artifact".

## Out of Scope

- A could-not-run code for postmortem-verify (deferred: ADR-046 Follow-ups — it loads no lib)

## Notes

Codes verified by execution 2026-09-11 (ADR-046 §Context table). The adapter's main guard compares `import.meta.url` with `argv[1]`, so the test resolves the temp plugin through `realpathSync` — on macOS `os.tmpdir()` is under `/var` → `/private/var` (CLAUDE.md §7).

## Verification Log
- 2026-09-11 · eb0fe36* · exit 0 · `node --test --test-name-pattern 'the dispatcher relays a gate that could not run' tests/gates.test.mjs` · acceptance-sha256:d098c7bfa462a2e28173a71c948e9835d8f190269dfdf0968d7df837deb44f66 · ms:1362
- 2026-09-11 · eb0fe36* · exit 0 · `node --test --test-name-pattern 'the dispatcher relays a gate that could not run' tests/gates.test.mjs` · acceptance-sha256:d098c7bfa462a2e28173a71c948e9835d8f190269dfdf0968d7df837deb44f66 · ms:884
