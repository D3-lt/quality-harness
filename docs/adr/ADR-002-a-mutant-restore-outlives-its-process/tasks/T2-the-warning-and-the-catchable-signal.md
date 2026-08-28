# Task ADR-002-T2: the warning survives the kill, and SIGTERM is actually tested

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** zy
**Produces:** none
**Consumes:** journal written before the mutation lands (T1)
**Data dependency:** hermetic

## Goal

The `MUTANT APPLIED` warning reaches the transcript before the fence runs even when the process is
killed, and the `SIGTERM` handler that restores in-process is covered by a test and a mutation
instead of being trusted.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `bin/adr-verify` | edit | `flush=True` on both warning lines; `_restore_and_exit` installed before `write_source` and restored in `finally` |
| `tests/evidence-chain.test.mjs` | edit | the flush assertion, plus the missing `SIGTERM` case this task exists to add |
| `tests/mutations.json` | edit | the flush mutation spans BOTH prints, and a new entry for the handler |

## Ordered Steps

1. Confirm the failing test is red first: assert that a run killed mid-fence has already emitted `MUTANT APPLIED` naming the file. Without `flush=True` this fails — measured 2026-08-27, both kill probes produced a completely empty log.
2. Add `flush=True` to both warning lines. Both, not one: removing it from only the first changes nothing, because the second flushes the same buffer microseconds later — a mutation that removed one alone reported GREEN and was describing a mechanism the code does not have.
3. Install `_restore_and_exit` as the `SIGTERM` handler before `write_source`, wrapped so a platform that cannot set it degrades to the journal rather than raising, and restore the previous handler in `finally`.
4. **Open work:** add `a SIGTERM mid-fence is restored in-process, without waiting for the next run` to `tests/evidence-chain.test.mjs`. Today every kill test uses `SIGKILL`, so deleting the handler leaves the suite green — the mechanism is untested and this record is the first place that is written down.
5. Add the matching mutation entry for the handler and confirm it goes RED.

## Acceptance

```bash
set -o pipefail
node --test tests/evidence-chain.test.mjs 2>&1 | tee /tmp/adr002-t2a.out && node scripts/mutate.mjs --case 'verify:' 2>&1 | tee /tmp/adr002-t2b.out && ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr002-t2a.out && ! grep -qE "^GREEN|^STALE|^HUNG" /tmp/adr002-t2b.out
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `the warning that names the broken file survives the kill that hides it` | `tests/evidence-chain.test.mjs` | the warning is out of the buffer before the fence starts | — |
| `a SIGTERM mid-fence is restored in-process, without waiting for the next run` | `tests/evidence-chain.test.mjs` | the handler turns a catchable kill into an unwind, so the `finally` runs | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests above |
| 2 — something selects it | `signal.signal(signal.SIGTERM, _restore_and_exit)` runs before `write_source`; the new mutation removes it and the new test goes red |
| 3 — the caller can discover it | the warning itself is the interface — it names the file and the undo command; the docstring records which signals the guarantee covers |
| 4 — it is used | measured 2026-08-27 at five `SIGTERM` timings, all restored in-process |

## Mutation Log

- 2026-08-27 · 1f444f9* · mutant killed · exit 1 · `bin/adr-verify` · removes the SIGTERM handler, so a catchable kill no longer unwinds into the finally restore · acceptance-sha256:687cfcd58ddf8c134deecbe39fc47a34471b8f7cef72f64f6370da2bed6c6ad1

## Class Sweep

**Class:** every way this process can be killed mid-fence, and whether the mutant comes back.

```bash
grep -n "kill('SIG" tests/evidence-chain.test.mjs
```

Run 2026-08-27 after this task: `SIGTERM` once and `SIGKILL` four times. The third member,
`SIGINT`, is **not** directly tested and is named here rather than left silent — it reaches the same
`finally` that `SIGTERM` now reaches, and the SIGTERM test is what proves that path restores. Before
this task the sweep returned `SIGKILL` only, which is why deleting the handler left the suite green:
the one signal the handler exists for was the one nothing sent.

## Invariants

- The warning is emitted before the fence starts, never after.
- A platform that cannot install the handler still gets the journal.
- The previous `SIGTERM` handler is restored, so `adr-verify` does not change signal disposition for anything that follows it.

## Risks

- Windows Python's signal support differs. The `signal.signal` call is wrapped and CI run 33067948621 passes the kill tests on `windows`; if the new `SIGTERM` test cannot run there it must be skipped with a stated reason, never silently.

## Stop Condition

Stop if the `SIGTERM` test cannot be made to fail with the handler removed — an unfalsifiable test
here would be worse than the untested handler, because it would report the gap as closed.

## Out of Scope

- The journal itself — T1's job.

## Verification Log
- 2026-08-27 · 1f444f9* · exit 0 · `node --test tests/evidence-chain.test.mjs 2>&1 | tee /tmp/adr002-t2a.out && node scripts/mutate.mjs --case 'verify:' 2>&1 | tee /tmp/adr002-t2b.out; ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr002-t2a.out && ! grep -qE "^GREEN|^STALE|^HUNG" /tmp/adr002-t2b.out` · acceptance-sha256:687cfcd58ddf8c134deecbe39fc47a34471b8f7cef72f64f6370da2bed6c6ad1
