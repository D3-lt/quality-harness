# Task ADR-095-T1: a tool counts the children, repeats and reads of one hook event

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (one tool, one preload, tests)
**Owner:** unassigned
**Produces:** `scripts/hook-cost.mjs --json` — children (argument list, directory, time), repeats, file reads, wall time
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `every child a hook starts is listed`, `a repeat is the same program, arguments and directory`, `a hook that failed to run is not zero children`

## Goal

`scripts/hook-cost.mjs <event> <repository>` runs one event through the real hook program in a hermetic home and reports the children it started, the repeats among them and the file reads, so that every later figure in this record is reproduced by a command.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/hook-cost.mjs` | add | the tool: builds a hermetic home, feeds one event on stdin, reads the preload's log, prints a table or `--json` |
| `scripts/hook-cost-preload.cjs` | add | `--require`d by the tool: wraps `spawnSync`, `execFileSync`, `execSync`, `spawn` and `fs.readFileSync` and appends one JSON line per call; the one thing that selects it is the tool's `NODE_OPTIONS` |
| `tests/hook-cost.test.mjs` | add | three tests against a fixture hook program |
| `tests/mutations/scripts/hook-cost.mjs.json` | add | one entry per `Rests-on` name |

## Ordered Steps

1. [S1] Write the three tests of the Tests table and record the red run (TDD red): the tool does not exist.
2. [S2] Write the preload and the tool. A hook that exits non-zero, times out or cannot be started is reported as that, with the children seen so far.
3. [S3] Run the tool on `SessionStart`, `PreToolUse` (Read and Edit) and `Stop` against a fresh `git clone --no-local` of this repository and put the table (children, repeats, ms, reads) in the sign-off: it is the baseline of the record. [proof: human: the numbers match the Context of ADR-095 within the machine's noise]
4. [S4] Record three killed mutants, one per `Rests-on` name. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/hook-cost.test.mjs 2>&1) \
  && for t in 'hook-cost lists every child a hook starts, with its arguments and the time inside it' 'hook-cost flags the same program with the same arguments in the same directory as a repeat, and two different argument lists as none' 'a hook that fails to run is reported as such, never as zero children'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `hook-cost lists every child a hook starts, with its arguments and the time inside it` | `tests/hook-cost.test.mjs` | a fixture hook that starts three children is reported with three rows, each with its argument list and a time | none | S1, S2 |
| `hook-cost flags the same program with the same arguments in the same directory as a repeat, and two different argument lists as none` | `tests/hook-cost.test.mjs` | the fixture's two identical `git rev-parse` calls are one repeat of two; a `git rev-parse` and a `git status` are none (the dirty twin) | none | S1, S2 |
| `a hook that fails to run is reported as such, never as zero children` | `tests/hook-cost.test.mjs` | a fixture that exits 3 and one that never answers are reported as exit 3 and as timed out, with whatever children they had started; a zero-child row is not printed for them | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests |
| 2 — something selects it | the tool sets `NODE_OPTIONS` to the preload; deleting that line turns the first test red |
| 3 — the caller can discover it | n/a: a repository tool run by name |
| 4 — it is used | T2, T3 and T4 quote its output in their sign-offs |

## Mutation Log
- 2026-10-11 · 500c5231* · mutant killed · exit 1 · `scripts/hook-cost-preload.cjs` · drops execFileSync from the wrapped calls, so a child started that way is not listed · acceptance-sha256:25ef8e8e83b67440b1bb7b0640ad1add700622a4e913ae4e94e1b1aa4a0c036f
- 2026-10-11 · 500c5231* · mutant killed · exit 1 · `scripts/hook-cost.mjs` · groups repeats without the directory, so the same arguments asked in two directories read as a repeat · acceptance-sha256:25ef8e8e83b67440b1bb7b0640ad1add700622a4e913ae4e94e1b1aa4a0c036f
- 2026-10-11 · 500c5231* · mutant killed · exit 1 · `scripts/hook-cost.mjs` · reports a program that could not be started as having started zero children · acceptance-sha256:25ef8e8e83b67440b1bb7b0640ad1add700622a4e913ae4e94e1b1aa4a0c036f
- 2026-10-11 · 500c5231* · mutant killed · exit 1 · `scripts/hook-cost-preload.cjs` · drops execFileSync from the wrapped calls, so a child started that way is not listed · acceptance-sha256:25ef8e8e83b67440b1bb7b0640ad1add700622a4e913ae4e94e1b1aa4a0c036f · covers:every child a hook starts is listed
- 2026-10-11 · 500c5231* · mutant killed · exit 1 · `scripts/hook-cost.mjs` · groups repeats without the directory, so the same arguments asked in two directories read as a repeat · acceptance-sha256:25ef8e8e83b67440b1bb7b0640ad1add700622a4e913ae4e94e1b1aa4a0c036f · covers:a repeat is the same program, arguments and directory
- 2026-10-11 · 500c5231* · mutant killed · exit 1 · `scripts/hook-cost.mjs` · reports a program that could not be started as having started zero children · acceptance-sha256:25ef8e8e83b67440b1bb7b0640ad1add700622a4e913ae4e94e1b1aa4a0c036f · covers:a hook that failed to run is not zero children

## Invariants

- The tool measures a throwaway `git clone --no-local` it makes in its own scratch directory, because a hook writes its session log under the repository's git directory as it does in a real session; `--in-place` is for a repository already in scratch. A run never leaves a file in the repository it was pointed at.
- A measurement it could not take is said as could-not-look, never as a zero.

## Risks

- The preload changes how the hook runs (an extra module, patched functions): the tool reports wall time with and without it once, so the overhead is a number and not a hope.

## Stop Condition

Stop and ask if the preload changes a hook's output (it must not), or if a child started by a detached grandchild cannot be seen at all (then the tool says it counts only the hook's own children).

## Out of Scope

- Children of children (the Python gates' own subprocesses) (permanent: boundary: the hook's cost is its own children; a gate's inside is that gate's)

## Verification Log
- 2026-10-11 · 500c5231* · exit 1 · `out=$(node --test --test-reporter=tap tests/hook-cost.test.mjs 2>&1) \ …` · acceptance-sha256:25ef8e8e83b67440b1bb7b0640ad1add700622a4e913ae4e94e1b1aa4a0c036f · ms:448 · test-lock-sha256:83937ef3509797434e4350fa7afddcd339c8044279dcfb480e7abd256a5a7a46 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvaG9vay1jb3N0LnRlc3QubWpzCWEgaG9vayB0aGF0IGZhaWxzIHRvIHJ1biBpcyByZXBvcnRlZCBhcyBzdWNoLCBuZXZlciBhcyB6ZXJvIGNoaWxkcmVuCTYxYjVlNmIxYzNjNjkxZTQ1MjY4NWY4MDgwY2JlZjdiNDRkNDNjNzVhMDY5MzhiMGY2NDIyZGMzMGZkMGNmMDkKYm9keQl0ZXN0cy9ob29rLWNvc3QudGVzdC5tanMJaG9vay1jb3N0IGZsYWdzIHRoZSBzYW1lIHByb2dyYW0gd2l0aCB0aGUgc2FtZSBhcmd1bWVudHMgaW4gdGhlIHNhbWUgZGlyZWN0b3J5IGFzIGEgcmVwZWF0LCBhbmQgdHdvIGRpZmZlcmVudCBhcmd1bWVudCBsaXN0cyBhcyBub25lCWMxNmU3YjExN2FjZjJkOThhMDM3ODU1ZmRmZjNkZjdiMTBkYjhmN2VlZGU0ZTFhOGMyNjY1ZjhjMDIzNWQ1YjEKYm9keQl0ZXN0cy9ob29rLWNvc3QudGVzdC5tanMJaG9vay1jb3N0IGxpc3RzIGV2ZXJ5IGNoaWxkIGEgaG9vayBzdGFydHMsIHdpdGggaXRzIGFyZ3VtZW50cyBhbmQgdGhlIHRpbWUgaW5zaWRlIGl0CTg0ZmZlZTlhNWM5OTI4MjI2NWFhMTQyNjg4M2U2NjE1MmM3YjIwMTMxZDk3ZjU3NDU4NmIzZWI3YjY2ZTZjMGE
  ```
  ```
- 2026-10-11 · 500c5231* · exit 0 · `out=$(node --test --test-reporter=tap tests/hook-cost.test.mjs 2>&1) \ …` · acceptance-sha256:25ef8e8e83b67440b1bb7b0640ad1add700622a4e913ae4e94e1b1aa4a0c036f · ms:8127
- 2026-10-11 · 500c5231* · exit 0 · `out=$(node --test --test-reporter=tap tests/hook-cost.test.mjs 2>&1) \ …` · acceptance-sha256:25ef8e8e83b67440b1bb7b0640ad1add700622a4e913ae4e94e1b1aa4a0c036f · ms:8124
- 2026-10-11 · 500c5231* · exit 0 · `out=$(node --test --test-reporter=tap tests/hook-cost.test.mjs 2>&1) \ …` · acceptance-sha256:25ef8e8e83b67440b1bb7b0640ad1add700622a4e913ae4e94e1b1aa4a0c036f · ms:8114
- 2026-10-11 · human-observed · observed by the executing session on macOS, 2026-10-11, load 4 to 7 on 10 cores, node scripts/hook-cost.mjs against a fresh clone of this repository at HEAD, first event then warm second event: SessionStart 1261 ms with 17 children (6 adr-next, 11 git; rev-parse toplevel x3 and write-tree x2 repeat), second event 1091 ms with 10 children; PreToolUse 40 ms, 0 children, 35 reads of 584 KiB, second 34 ms; Edit 216 ms, 3 children, 299 reads of 4521 KiB, second 33 ms; the turn-end event (Stop) 217 ms with 16 children (rev-parse toplevel x6, write-tree x2, status x3 repeat), second 139 ms with 13 children; the preload itself adds 0 to 5 ms (PreToolUse warm 33.5 ms traced against 34.1 ms untraced); matches the Context of ADR-095 within the machine's noise
- 2026-10-11 · human-observed · observed by the executing session on macOS, 2026-10-11, load 4 to 7 on 10 cores, node scripts/hook-cost.mjs against a fresh clone of this repository at HEAD, first event then warm second event: SessionStart 1261 ms with 17 children (6 adr-next, 11 git; rev-parse toplevel x3 and write-tree x2 repeat), second event 1091 ms with 10 children; PreToolUse 40 ms, 0 children, 35 reads of 584 KiB, second 34 ms; Edit 216 ms, 3 children, 299 reads of 4521 KiB, second 33 ms; the turn-end event 217 ms with 16 children (rev-parse toplevel x6, write-tree x2, status x3 repeat), second 139 ms with 13 children; the preload itself adds 0 to 5 ms (PreToolUse warm 33.5 ms traced against 34.1 ms untraced); matches the Context of ADR-095 within the machine's noise; approved
- 2026-10-11 · 500c5231* · exit 0 · `out=$(node --test --test-reporter=tap tests/hook-cost.test.mjs 2>&1) \ …` · acceptance-sha256:25ef8e8e83b67440b1bb7b0640ad1add700622a4e913ae4e94e1b1aa4a0c036f · ms:8277
- 2026-10-11 · 500c5231* · exit 0 · `out=$(node --test --test-reporter=tap tests/hook-cost.test.mjs 2>&1) \ …` · acceptance-sha256:25ef8e8e83b67440b1bb7b0640ad1add700622a4e913ae4e94e1b1aa4a0c036f · ms:8221
- 2026-10-11 · 500c5231* · exit 0 · `out=$(node --test --test-reporter=tap tests/hook-cost.test.mjs 2>&1) \ …` · acceptance-sha256:25ef8e8e83b67440b1bb7b0640ad1add700622a4e913ae4e94e1b1aa4a0c036f · ms:8096
