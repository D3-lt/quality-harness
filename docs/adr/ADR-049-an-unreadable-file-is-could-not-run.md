# ADR-049: An unreadable file is could-not-run

**Status:** Proposed
**Date:** 2026-09-12
**Owner:** zy
**Spec:** `docs/specs/2026-09-12-unreadable-file-is-could-not-run.md`
**Cross-references:** ADR-005, ADR-034, ADR-045, ADR-046, `CLAUDE.md`, `plugin/bin/postmortem-verify`, `plugin/scripts/facts-gate-dispatch.sh`
**Governs:** `plugin/bin/adr-lint`, `plugin/bin/adr-verify`, `plugin/bin/adr-judge`, `plugin/bin/adr-retire-check`, `plugin/bin/spec-verify`, `plugin/bin/arch-lint`, `plugin/bin/adr-debt`, `plugin/bin/adr-next`, `plugin/scripts/facts-gate-dispatch.sh`, `tests/gates.test.mjs`, `tests/mutations.json`

Class: every named-path open a listed gate performs whose `read_text` (or equivalent) raises `OSError`. Not "a missing file", not `_Unreadable`, not the dispatcher's miss-path `[ ! -r ]`. Enumerated 2026-09-12 with `rg -n "read_text\(" plugin/bin/adr-lint plugin/bin/adr-verify plugin/bin/adr-judge plugin/bin/adr-retire-check plugin/bin/spec-verify plugin/bin/arch-lint plugin/bin/adr-debt plugin/bin/adr-next plugin/bin/postmortem-verify` and `git ls-files -- plugin/bin/adr-lint plugin/bin/adr-verify plugin/bin/adr-judge plugin/bin/adr-retire-check plugin/bin/spec-verify plugin/bin/arch-lint plugin/bin/adr-debt plugin/bin/adr-next plugin/bin/postmortem-verify plugin/scripts/facts-gate-dispatch.sh tests/gates.test.mjs tests/mutations.json`. Named members (after exists / is_dir / not-recognised where those arms already run):

```
plugin/bin/adr-lint:1012 check_adr
plugin/bin/adr-lint:5453 main Status discriminator
plugin/bin/adr-verify:2582 after exists()
plugin/bin/adr-judge:319 after exists()
plugin/bin/adr-retire-check:467 after is_file()
plugin/bin/spec-verify:676 check_spec
plugin/bin/arch-lint:520 after exists()
plugin/bin/adr-debt:472 rglob of a parent dir
plugin/bin/adr-next:395 load
plugin/bin/adr-next:479 foreign-task
plugin/bin/adr-next:681 owning_record_status
plugin/bin/postmortem-verify:57-63 control (already)
```

Members left out: qh-mcp / qh-root (they do not read a named record); `_Unreadable` / `RESTS_ON_UNREADABLE`; miss-path `[ ! -r ]` in `facts-gate-dispatch.sh`; later `read_text` of a file already opened; Cost 2 wording (sibling spec).

**Enforced-by:** `tests/gates.test.mjs::an unreadable named path is could-not-run, not failures-found`, `tests/gates.test.mjs::chmod-000 ADR-*.md is UNPROVEN through the dispatcher, not not satisfied`
**Invalidates:** none — checked (does not reverse ADR-005, ADR-034's unlistable-directory list, ADR-045 T4 lib-missing codes, or ADR-046's `unrun_exit` table). Complements them. Does not pull ADR-046's deferred dispatcher row for adr-judge (CLI could-not-run only; adr-judge is not dispatched).
**Served-path change:** `python3 plugin/bin/<gate> <unreadable path>` prints one could-not-run line and exits that gate's Exit-header could-not-run code instead of a PermissionError traceback; chmod-000 `ADR-*.md` through the hook dispatcher is `UNPROVEN`, not "adr-lint is not satisfied".

## Context

Inherited from `docs/specs/2026-09-12-unreadable-file-is-could-not-run.md` §Problem / §Goal. Measured 2026-09-12 on working-tree `plugin/bin` (HEAD `239980b`): copy a real record, `chmod 000` (precondition: `read_text` raises `PermissionError`), spawn the working-tree gate. Crash, exit 1, traceback on the members above. Control: postmortem-verify exit 2, one stderr line `[postmortem-verify] could not run: … — [Errno 13] Permission denied`.

Debt at authoring (`python3 plugin/bin/adr-debt docs/adr`): none of the deferred rows or open follow-ups is this unreadable-file fact. Not pulled in. ADR-046's adr-judge dispatcher follow-up stays: this record gives adr-judge CLI exit 2 on an unreadable named path, and does not add it to `unrun_exit`.

## Existing Primitives Audit

- postmortem-verify:57-63 `except OSError` → one could-not-run line, exit 2 — **copy.** Same wrap, each gate's own Exit-header code.
- ADR-045 T4 / Exit-header could-not-run codes (lib-missing) — **reuse.** Unreadable named-path open is the same could-not-look class, in the same clause as lib-missing. adr-verify uses 4, not `fail()` (2) and not 1 (`survived`).
- ADR-046 `unrun_exit` (adr-lint / arch-lint / adr-retire-check / postmortem-verify → 2; spec-verify --draft → 4) — **reuse.** F-2 is that mapped code through the dispatcher is UNPROVEN. Traceback-at-1 is T1.
- ADR-034 unlistable record *directory* (`iterdir` / `COULD NOT READ`) — **leave.** An unreadable *file* inside a listable dir is this record's wrap. `load()` exiting 1 on an unreadable task file is command-level could-not-look; the directory tests stay.
- `_Unreadable` — **leave.** Rests-on decode-only.

## Decision

**A named-path open that raises `OSError` is could-not-run: one could-not-run line, that gate's own Exit-header code, no traceback.** Catch `OSError` only, after existing exists / is_dir / not-recognised arms. Mapped codes: adr-lint / arch-lint / adr-retire-check / adr-debt / adr-judge → 2; spec-verify → 4; adr-verify → 4 (not 1); adr-next → 1; postmortem-verify → 2 (already). When the dispatcher already selected a gate and that gate returns its mapped 2/4, the line is UNPROVEN, not "not satisfied". `skip:` when chmod 000 still reads, after the log shows it.

## Alternatives Considered

- **Analogize unreadable to missing-file.** Rejected: adr-lint/arch-lint stay 1; adr-verify's 1 is `survived`.
- **`except Exception`.** Rejected: swallows a real finding.
- **Reuse `_Unreadable` as the OSError type.** Rejected: that sentinel is Rests-on grammar.
- **Pre-open `[ ! -r ]` before ADR-*.md name-match.** Rejected: F-2 is the mapped-code relay; the miss path is not this class.
- **Treat traceback-at-1 as UNPROVEN in the dispatcher.** Rejected: a real finding at exit 1 would be swallowed.

## Component / Boundary Impact

| Component | Ownership after change | Why it changes |
|-----------|------------------------|----------------|
| listed Python gates | plugin/bin | wrap the named-path open |
| facts-gate-dispatch.sh | hook | no table edit if `unrun_exit` already maps; F-2 is the chmod-000 ADR-*.md path |
| postmortem-verify | control | unchanged |

None — no Module Map file in this repository; no architecture doc to update.

## Wiring & Contract Changes

Inherited from the spec §Contracts Touched; delta: none.

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| mapped could-not-run codes (2/4/1) | T1 | T2 | No — T2 keys the codes T1 produces; `unrun_exit` already maps them |

## Implementation

See `docs/adr/ADR-049-an-unreadable-file-is-could-not-run/tasks/README.md`.

## Consequences

- **Positive:** an unreadable record is could-not-look, not a lint failure about a file the gate never opened.
- **Negative:** spec-verify `check_spec` has no exists arm, so a missing spec becomes exit 4 (FileNotFoundError is OSError) rather than a traceback.
- **Neutral:** an unreadable adr-next *task file* is command-level exit 1 (`could not run:`). An unlistable record *directory* stays ADR-034's `COULD NOT READ` list.

## Out of Scope

Inherited from the spec §Non-Goals; delta: none.

- Unrecognised Bash / PowerShell / cmd (permanent: boundary: ADR-047)
- MCP write plus a passing check clearing UNPROVEN (permanent: boundary: sibling spec `docs/specs/2026-09-12-unproven-write-has-a-validation-term.md`)
- qh-mcp / qh-root reading a named record (permanent: boundary: they do not; usage exit 2)
- Changing `_Unreadable` / `RESTS_ON_UNREADABLE` into an OSError type (permanent: boundary: decode-only)
- Changing missing-file, directory, or not-recognised exits or sentences (permanent: boundary: four contracts remain four answers)
- A Windows-only product branch with no injectable seam (permanent: boundary: `skip:` the fixture when chmod 000 still reads)
- Pre-open `[ ! -r ]` before ADR-*.md name-match (permanent: boundary: F-2 is the mapped-code relay)
- Dispatcher mapping for adr-judge (deferred: ADR-046 Follow-ups — it is not dispatched)

## Risks

Inherited from the spec §Risks; delta: none.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Wrap only `main()` of adr-lint | High | High | UC1-S2 names ADR-named `check_adr`, adr-debt `rglob`, adr-next `load` / `owning_record_status` |
| Unreadable analogized to missing-file (exit 1) | High | High | F-1 maps per Exit header; adr-verify 4 not 1 |
| `except Exception` swallows a finding | Med | High | Catch `OSError` on the open, as postmortem-verify:57-63 |
| chmod 000 still reads on Windows | High | Med | `skip:` after the log shows it |
| Dispatcher still "not satisfied" if the gate exits 1 | High | High | F-2: mapped 2/4 is UNPROVEN. Traceback-at-1 is T1 |

## Rollback

Remove the `except OSError` wraps and the Exit-header named-path sentences. Dispatcher mapping is unchanged. No persistent state.

## Follow-ups

- [ ]
