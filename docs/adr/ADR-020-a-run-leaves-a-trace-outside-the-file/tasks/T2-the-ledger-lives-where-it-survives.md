# Task ADR-020-T2: Append each run to a ledger that outlives the temp directory

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** `run_ledger()` (T2), the ledger append format (T2)
**Consumes:** `output_digest()` (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Record each verified run in an append-only ledger outside the repository, in a
location that survives a reboot — and never in the system temp directory.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-verify` | edit | `run_ledger()` sits beside `mutant_journal()`, whose keying it reuses and whose fallback it deliberately does not |
| `tests/gate-regressions.py` | edit | asserts the location rule and the append format |
| `tests/mutations.json` | edit | registers `verify: the run ledger never falls back to the temp directory` |

## Ordered Steps

1. [S1] Write the failing test first (TDD red): with `CLAUDE_PLUGIN_DATA` unset, `run_ledger()` must not return a path under `tempfile.gettempdir()`. It fails before the function exists.
2. [S2] `run_ledger(cwd)` — keyed by a digest of the resolved repository path exactly as `mutant_journal()` is, under `CLAUDE_PLUGIN_DATA` when set, else a per-user data directory. NEVER the system temp directory: a mutant journal spans seconds and a ledger spans days, and a check whose evidence is routinely absent trains its reader to skim. [proof: acceptance]
3. [S3] Append one JSON line per verified run: the task path relative to the repository, the acceptance digest, the output digest, the exit code and the date. No absolute path is written — the same redaction rule the entry follows. [proof: acceptance]
4. [S4] Cap the file and say what is dropped: keep the most recent N lines per task, and drop oldest-first. A ledger that grows without bound is one a user eventually deletes, which silently removes the mechanism. [proof: acceptance]
5. [S5] A ledger that cannot be written does NOT fail the verification. Recording the run is this tool's job; refusing to record a passing run because a directory is read-only would turn a machine problem into a verdict about the code (ADR-005). Say so on stderr and carry on. [proof: acceptance]
6. [S6] Register the mutation restoring the temp-directory fallback, and confirm it is RED. [proof: mutation]

## Acceptance

```bash
set -o pipefail
python3 tests/gate-regressions.py plugin/bin plugin/skills/postmortem/SKILL.md . 2>&1 | tee /tmp/adr020-t2.out \
  && ! grep -qiE "traceback|assertionerror" /tmp/adr020-t2.out \
  && grep -q "the run ledger never falls back to the temp directory" tests/mutations.json
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the ledger is never placed under the system temp directory` | `tests/gate-regressions.py` | the one rule that separates a ledger from a journal | — | S1, S2 |
| `CLAUDE_PLUGIN_DATA wins when it is set` | `tests/gate-regressions.py` | the user's own choice of data directory is honoured | — | S2 |
| `one verified run appends exactly one line` | `tests/gate-regressions.py` | the append format, and that a re-run does not rewrite history | — | S3 |
| `no absolute path reaches the ledger` | `tests/gate-regressions.py` | the same redaction rule the entry follows | — | S3 |
| `the ledger is capped oldest-first per task` | `tests/gate-regressions.py` | it cannot grow until a user deletes it | — | S4 |
| `a ledger that cannot be written does not fail the run` | `tests/gate-regressions.py` | a machine problem is not a verdict about the code | — | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the six tests above |
| 2 — something selects it | `adr-verify`'s write path calls it on every recorded run; the S6 mutation fails if the location rule is dropped |
| 3 — the caller can discover it | `CLAUDE_PLUGIN_DATA` is named in the ADR and in `adr-verify`'s docstring — a user relocating plugin state needs to know the ledger moves with it |
| 4 — it is used | nothing measures this yet; T3 is the only reader and the ADR's Follow-up counts its firings |

## Mutation Log

## Invariants

- No file is written inside the repository being verified.
- A ledger failure never changes the exit code of a verification.
- The ledger never contains an absolute path.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The per-user directory differs by platform and is guessed wrong | Med | Med | The platform is a parameter, as CLAUDE.md §7 requires, and both branches are asserted from one machine |
| A concurrent run interleaves lines | Low | Low | One append per run, opened in append mode; a torn line is dropped by the reader in T3 rather than treated as disagreement |

## Stop Condition

Stop if no per-user location can be chosen that is writable on all three platforms
without asking the user to configure one. A ledger that exists only when
configured is a mechanism almost nobody has, and that changes the ADR's premise.

## Out of Scope

- Reading the ledger, which is T3's (deferred: this record's T3)
- Sharing a ledger between machines or users (permanent: boundary: the ADR's Decision — it is per-user local state by construction)

## Verification Log
