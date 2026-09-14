# ADR-052: An explicit relock is not a later red

**Status:** Accepted
**Date:** 2026-09-14
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** ADR-005, ADR-050, `plugin/lib/record.py`, `plugin/bin/adr-verify`, `plugin/bin/adr-lint`, `plugin/bin/adr-next`
**Governs:** `plugin/lib/record.py`, `plugin/bin/adr-verify`, `plugin/bin/adr-lint`, `plugin/bin/adr-next`, `tests/test-lock.test.mjs`, `tests/mutations.json`, `tests/gate-regressions.py`

Class: every gate that writes or reads a Verification Log lock suffix (`test-lock-sha256` / `test-lock-b64` / a later `test-lock-kind`) to decide `done`. Enumerated 2026-09-14 with `rg -n "first_red_lock_suffix|lock_suffix_for_run|_recorded_lock|lock_findings|test-lock-sha256|test-lock-b64" plugin/lib/record.py plugin/bin/adr-verify plugin/bin/adr-lint plugin/bin/adr-next` and `git ls-files -- plugin/lib/record.py plugin/bin/adr-verify plugin/bin/adr-lint plugin/bin/adr-next tests/test-lock.test.mjs tests/mutations.json tests/gate-regressions.py`. Named members:

```
plugin/lib/record.py          TEST_LOCK_FIELD; _recorded_lock; lock_findings
plugin/bin/adr-verify         flag parse; record_run; ENTRY_RE
plugin/bin/adr-lint           TEST_LOCK_FIELD; check_test_lock
plugin/bin/adr-next            TEST_LOCK_FIELD_ANON; is_done / lock_blocks_done
tests/test-lock.test.mjs      lock tests
tests/mutations.json         catalogue
tests/gate-regressions.py     grammar agreement
```

Members left out: `first_red_lock_suffix` (ordinary first-red, still one lock per log unless `--relock`); `lock_suffix_for_run` recovery (R3 / v2.99.3 — a missing lock, not a replaced map); `TEST_HASH_REQUIRED_FROM` (stays `2026-09-13`); PHP JS-regex keep (`php=True` stays strings); Swift `#expect`.

**Enforced-by:** `lock: default --relock refuses a moved hashed body`, `lock: --relock is parsed before unknown-option`, `lock: a relock row is weaker than first-red`, `lock: later-red conflict skips kind rows only`, `lock: a relock row is not a passing Acceptance run`, `lock: --relock cannot combine with --sweep`
**Invalidates:** none — checked (does not reverse ADR-050's first-red contract, ADR-020's duration field, or ADR-045's one reader). Complements ADR-050: F-1 still forbids a silent later red from filling hashes; this record is the explicit CLI that follow-up named.
**Served-path change:** `python3 plugin/bin/adr-verify --relock <task.md>` appends a new machine row whose trailing lock is the `done` map; `--replace-hashes` is valid only with `--relock` and is the only path that may replace a previously hashed body.


## Context

ADR-050 F-1: the first TDD-red lock is the contract; a later red does not fill hashes the first red omitted. That is still true of an ordinary `adr-verify` run.

Measured 2026-09-13 on adopting Go/Rust corpora (inbox `83fa36e8…`, `44e6e015…`): a first red taken while the hasher could not see the language, or on spec-write stub bodies, is frozen. v2.99.3 recovered a *missing* lock from a later row (R3) and advised when an empty lock was tool-blind (R2). It did not re-hash a committed map. `--relock` was rejected for that release.

ADR-050 Follow-ups still names the spec change: "Filling hashes on a later red is a spec change (F-1)". This record is that change. The Accepted ADR-050 file is not edited.

Owner pick 2026-09-14: default `--relock` fills unproven the hasher can now see and refuses if a previously hashed body moved; `--relock --replace-hashes` may replace moved hashes (committed stub-red); that row is weaker than first-red.

Debt at authoring (`python3 plugin/bin/adr-debt docs/adr`): the ADR-050 follow-up above is this work and is pulled in. Other open follow-ups are a different class and stay. `TEST_HASH_REQUIRED_FROM` is not bumped.

## Existing Primitives Audit

- ADR-050 `first_red_lock_suffix` / `lock_findings` / `_recorded_lock` — **reshape.** First red stays historical. A later machine row with trailing `test-lock-kind:relock` or `replace` is the `done` map. Ordinary later red with a different sha and no kind still conflicts.
- `lock_suffix_for_run` R3 recovery — **leave.** Recovers a missing trailing lock. `--relock` refuses when the log has none (use ordinary `adr-verify`).
- ADR-028 `steps:` suffix — **copy the shape.** Optional trailing `test-lock-kind:` after `test-lock-b64`, so every older row still parses.
- `adr-verify` unknown-option fail (~2505) — **reuse.** `--relock` must be parsed. `--replace-hashes` without `--relock` is refused by name, not as an unknown flag that would otherwise become the task path.
- `encode_lock` / `snapshot_lock` — **reuse.** Relock snapshots the current tree the same way first-red does.

## Decision

**`--relock` is an explicit, tool-written later lock, never a silent later red.** `python3 plugin/bin/adr-verify --relock <task.md>` does not run the Acceptance fence. It appends one new machine row whose command is `` `adr-verify --relock` `` (or `` `adr-verify --relock --replace-hashes` ``), carrying `test-lock-sha256` / `test-lock-b64` of a current snapshot and trailing `test-lock-kind:relock` or `replace`. First-red is not edited.

It fails if: `--relock` is combined with `--mutant`, `--human-mutant`, `--sweep`, `--restore`, or `--human`; `--replace-hashes` is given without `--relock`; the Verification Log has no trailing lock (empty log, or no lock yet — R3 already recovers that); default `--relock` sees a recorded `bodies` key that moved or vanished (the named test is printed, and `--replace-hashes` is mentioned); a still-unhashable Tests row (ghost, truncated regex, PHP file-level, `§NN`) becomes `done` because a relock ran; a later red with a different sha and no `test-lock-kind` is treated as the map; a relock row is read as first-red (no weaker advice); a relock row is treated as a passing Acceptance run (`is_done` / README `done`).

Default `--relock`: snapshot current; unproven the hasher can now see become bodies; still-unhashable stay unproven and still block `done`. `--relock --replace-hashes` may replace moved hashes; `lock_findings` advises that those hashes are weaker than first-red; `done` is not refused for the replaced hashes unless they move again after that row.

## Alternatives Considered

- **Silent later-red fill.** Rejected: ADR-050 F-1; a later red that happens to run after a hasher upgrade would rewrite the contract without saying so.
- **`--relock` always replaces hashes.** Rejected: a stub-red and an accidental assertion rewrite would look the same. Replacing a moved body needs `--replace-hashes`.
- **Bump `TEST_HASH_REQUIRED_FROM`.** Rejected: that advises missing locks, it does not re-hash committed maps, and it would brick this corpus's own 2026-09-13 rows.
- **Edit the first-red row in place.** Rejected: evidence is append-only (ADR-020 / ADR-021).
- **No kind field; treat any later lock as the map.** Rejected: later-red conflict would fire on the relock row, or would stop firing for a hand-assembled later red.

## Component / Boundary Impact

| Component | Ownership after change | Why it changes |
|-----------|------------------------|----------------|
| `plugin/lib/record.py` | record grammar | kind field; `_recorded_lock` prefers last relock; `lock_findings` advice |
| `adr-verify` | writer | `--relock` / `--replace-hashes`; does not run the fence |
| `adr-lint` / `adr-next` | readers | grammar accepts `test-lock-kind`; kind rows are not Acceptance completion |
| `tests/gate-regressions.py` | grammar agreement | a kind-bearing row still matches every reader |

None — internal to the gates. No Module Map file in this repository; no architecture doc to update.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| Verification Log suffix ` · test-lock-kind:relock` / `replace` | optional after `test-lock-b64` | `adr-verify --relock` | `_recorded_lock`, `ENTRY_RE`, lint/next VLOG regexes |
| `--relock` / `--replace-hashes` | new flags | `adr-verify` flag parse | authors recovering a committed map |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| relock kind field + writer row | T1 | T2 | No — T2 reads `test-lock-kind`; it does not invent a second grammar |

## Implementation

See `docs/adr/ADR-052-an-explicit-relock-is-not-a-later-red/tasks/README.md`.

## Consequences

- **Positive:** a committed stub-red or pre-hasher unproven map can become `done` without rewriting history or bumping the cutover date.
- **Negative:** a relock is weaker evidence than first-red; `done` after `--replace-hashes` is advice, not silence.
- **Neutral:** ordinary later reds still conflict; R3 recovery is unchanged.

## Out of Scope

- Bumping `TEST_HASH_REQUIRED_FROM` (permanent: boundary: missing-lock advice is not a re-hash; this corpus's 2026-09-13 rows must keep parsing)
- Re-hashing a committed map without `--relock` (permanent: boundary: ADR-050 F-1 stays for ordinary `adr-verify`)
- Teaching PHP `_js_regex_span_end` (permanent: boundary: PHP has no regex literals; leftover `/…/` with quotes stays a string)
- Skipping never-hashable Tests rows (`§NN`, ghost, truncated regex) so they stop blocking `done` (deferred: docs/BACKLOG.md §206)
- Swift `#expect` inbox (deferred: docs/BACKLOG.md §207)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A relock row is parsed as a later-red conflict | Med | High | `test-lock-kind` is distinct; later-red conflict skips kind rows; tests go dirty if that skip is too wide |
| Default `--relock` silently replaces a moved hash | Med | High | Writer refuses moved `bodies` unless `--replace-hashes`; mutant drops the check |
| Grammar rejects the kind field and `refuse_unreadable` blocks the write | Med | High | Widen `TEST_LOCK_FIELD` / `_ANON` / `_row_lock_sha` together; gate-regressions |

## Rollback

Remove `--relock` / `--replace-hashes` and ignore `test-lock-kind` on read. Existing first-red rows are unchanged. Relock rows already written stay in the log as later machine rows; a reader that does not know `kind` would treat a different sha as conflict — that is the pre-this-record behaviour and is the rollback.

## Follow-ups

- [x] Teach the centralised `first-red-lock` skill that a committed stub-red is recoverable only with `python3 plugin/bin/adr-verify --relock --replace-hashes`.
