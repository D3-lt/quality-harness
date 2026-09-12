# ADR-050: A locked test body is not rewritten

**Status:** Accepted
**Date:** 2026-09-12
**Owner:** zy
**Spec:** `docs/specs/2026-09-12-a-locked-test-body-is-not-rewritten.md`
**Cross-references:** ADR-005, ADR-016, ADR-020, ADR-022, ADR-045, `CLAUDE.md`, `plugin/lib/record.py`, `plugin/bin/adr-lint`, `plugin/bin/adr-verify`, `plugin/bin/adr-next`
**Governs:** `plugin/lib/record.py`, `plugin/bin/adr-verify`, `plugin/bin/adr-lint`, `plugin/bin/adr-next`, `tests/test-lock.test.mjs`, `tests/gate-regressions.py`, `tests/mutations.json`

Class: every gate that writes or reads a Verification Log row to decide `done` / `is_done`. Enumerated 2026-09-12 with `rg -n "VLOG_DIGEST_RE|ENTRY_RE|is_done|acceptance_digest|record_run" plugin/bin/adr-lint plugin/bin/adr-verify plugin/bin/adr-next plugin/lib/record.py` and `git ls-files -- plugin/lib/record.py plugin/bin/adr-lint plugin/bin/adr-verify plugin/bin/adr-next tests/gate-regressions.py tests/mutations.json`:

```
plugin/lib/record.py          acceptance_digest; first-red hasher lives beside it
plugin/bin/adr-verify          record_run writes the row; ENTRY_RE must accept the suffix
plugin/bin/adr-lint           VLOG_RE / VLOG_DIGEST_RE / VLOG_TIMED_RE; check_test_lock at done
plugin/bin/adr-next            VLOG_DIGEST_RE; is_done
tests/gate-regressions.py      grammar agreement
tests/mutations.json          catalogue
```

Members in: first TDD-red `exit != 0` row only; `check` string or recorded absence; every extractable name in each Tests-table File. Members left out: `CLAIM_RE` (exit-0 claims; lock is not on green); human-observed rows; Mutation Log grammar; inferred `check` when the key was absent (F-9 records absence); `strictFrom` / `fenceTimeout`; a second ledger file (ADR-020). `tests/fixtures/judge/ADR-050-clean.md` is a fixture name, not this decision.

**Enforced-by:** `tests/test-lock.test.mjs::rewriting a locked assertion refuses done`, `tests/test-lock.test.mjs::first TDD-red row carries a tool-written hash for each named test`, `tests/test-lock.test.mjs::is_done refuses when a locked hash moved`
**Invalidates:** none — checked (does not reverse ADR-020's duration field, ADR-022's refusal of hand-filled proof tables, or ADR-045's one reader). Complements them: hashes live on the Verification Log the writer already appends.
**Served-path change:** `python3 plugin/bin/adr-verify <task.md>` writes `test-lock-sha256` / `test-lock-b64` on the first TDD-red row; `python3 plugin/bin/adr-lint` refuses `done` when a locked body, sibling, or declared `check` moved, vanished, or could not be read; `adr-next is_done` uses the same hashes.

## Context

Inherited from `docs/specs/2026-09-12-a-locked-test-body-is-not-rewritten.md` §Problem / §Goal. `acceptance-sha256` hashes the Acceptance **command**. Invert an assertion, keep the same `node --test --test-name-pattern`, and `done` still matches. Mutation `survived` catches a vacuous test, not a rewritten one.

Debt at authoring (`python3 plugin/bin/adr-debt docs/adr`): none of the deferred rows or open follow-ups is this lock. Not pulled in. ADR-020 issue #4 (digest optional by omission) is the analogous fail-open; this lock uses the same dated-cutover shape as `MUTATION_REQUIRED_FROM`.

`TEST_HASH_REQUIRED_FROM = "2026-09-13"`. This repository's own 2026-09-12 evidence rows would brick if the cutover were same-day, and F-1 forbids a later red from filling hashes the first red omitted.

## Existing Primitives Audit

- `acceptance_digest` / `plugin/lib/record.py` — **reuse.** Hasher and first-red parse live beside it (F-8). Do not copy into the gates.
- `MUTATION_REQUIRED_FROM` / `DURATION_REQUIRED_FROM` — **copy the shape.** One calendar day, advise before, refuse from.
- ADR-028 `steps:` suffix — **copy the shape.** Optional trailing field after `steps`, so every older row still parses.
- `code_only` in adr-lint — **do not use as-is.** It strips string literals that **are** the assertion (F-7). Keep strings.
- `.quality-harness.json` — **leave closed.** `check` / `strictFrom` / `fenceTimeout` only (F-5). Hash the trimmed `check` string, or record absence (F-9).
- `lifecycle.mjs` `declaredCheckCommand` — **reuse the trim.** Not a second lock of inferred commands.

## Decision

**The first TDD-red Verification Log row is the contract for every test body the hasher can extract from each Tests-table File, and for a declared `check` string or its absence.** `done` is refused when any of those hashes moved or vanished, when a named Tests-table body could not be hashed, when a later red presents a different hash, or when `check` appears after recorded absence. New names are allowed. Comment/whitespace-only edits do not refuse. One function in `plugin/lib/record.py`; adr-verify writes, adr-lint and adr-next read.

Cutover `TEST_HASH_REQUIRED_FROM = "2026-09-13"`: missing lock advises before that day, refuses from it.

## Alternatives Considered

- **Hash the Acceptance command more tightly.** Rejected: that is `acceptance-sha256`; the cheat keeps the command.
- **Mutation `survived` as the inversion detector.** Rejected: it catches a test that cannot fail, not a test rewritten to the new shape.
- **Hand-filled hashes in `## Tests`.** Rejected: ADR-022.
- **A second ledger file / output digest.** Rejected: ADR-020 (external ledger does not ship).
- **A hooks / rules DSL in `.quality-harness.json`.** Rejected: F-5.
- **Same-day cutover 2026-09-12.** Rejected: this corpus's own first-red rows that day would refuse `done`, and F-1 forbids backfill.

## Component / Boundary Impact

| Component | Ownership after change | Why it changes |
|-----------|------------------------|----------------|
| `plugin/lib/record.py` | record grammar | hasher, encode/decode, `lock_findings` |
| `adr-verify` | writer | first-red suffix |
| `adr-lint` | done gate | `check_test_lock`; grammar accepts the suffix |
| `adr-next` | router | `is_done` reads the same hashes |

None — internal to the gates. No Module Map file in this repository; no architecture doc to update.

## Wiring & Contract Changes

Inherited from the spec §Contracts Touched; delta: Verification Log optional suffix ` · test-lock-sha256:<hex> · test-lock-b64:<token>` after `steps`.

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| first-red hasher / suffix | T1 | T2, T3 | No — T2/T3 import `lock_findings`; they do not reimplement it |

## Implementation

See `docs/adr/ADR-050-a-locked-test-body-is-not-rewritten/tasks/README.md`.

## Consequences

- **Positive:** rewriting a locked assertion, sibling, or declared `check` cannot take a task to `done`.
- **Negative:** a Tests-table name the hasher cannot extract refuses `done` as UNPROVEN even when the behaviour is fenced elsewhere (F-2).
- **Neutral:** pre-cutover `done` without hashes stays `done` and is advised. Human-observed tasks skip the lock.

## Out of Scope

Inherited from the spec §Non-Goals; delta: none.

- A new external ledger / output digest / run cross-check (permanent: boundary: ADR-020)
- Hashing the fence command (permanent: fact: `acceptance_digest` already does; citation: file `plugin/lib/record.py:352`)

- Mutation `survived` as the inversion detector (permanent: boundary: vacuity, not inversion)
- Hand-filled hashes in `## Tests` (permanent: boundary: ADR-022)
- A hooks / rules / depends-on / blocks DSL in `.quality-harness.json` (permanent: boundary: F-5)
- Compiling shipped gates into static binaries (permanent: boundary: later spec)

## Risks

Inherited from the spec §Risks; delta: none.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Hasher cannot extract a named test | Med | High (lock fail-open) | F-2: refuse `done` as UNPROVEN |
| Existing `done` tasks have no test-sha256 | High | High (corpus goes red) | F-3: advise before `2026-09-13`; refuse from that date |
| Agent inverts a sibling omitted from the Tests table | Med | High | F-4: lock every extractable name in the File |
| Third copy of the hasher in a gate | High | High | F-8: `lock_findings is record.lock_findings` |

## Rollback

Remove the suffix from `record_run`, `check_test_lock`, and the `is_done` lock read. Grammar stays optional so existing rows parse. No persistent state outside the Verification Log.

## Follow-ups

- [ ] T1–T3 first-reds predate the writer; do not edit Verification Logs. Cutover
      `TEST_HASH_REQUIRED_FROM` is `2026-09-13`. Filling hashes on a later red is a
      spec change (F-1).
