# Task ADR-049-T1: Named-path OSError is could-not-run

**Depends-on:** none
**Covers:** F-1, UC1-S1, UC1-S2, UC2-S1, UC2-S2
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** mapped could-not-run codes (2/4/1)
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `except OSError on named-path open`

## Goal

A named-path open that raises `OSError` is could-not-run at that gate's Exit-header code, with one could-not-run line and no traceback. Missing-file, directory, and not-recognised stay. `_Unreadable` stays decode-only. postmortem-verify stays the control.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | `read_named` in `check_adr` and the Status discriminator; Exit 2 names the unreadable path |
| `plugin/bin/adr-verify` | edit | wrap after `exists()`; `sys.exit(4)` not `fail()` |
| `plugin/bin/adr-judge` | edit | wrap after `exists()`; `return 2` |
| `plugin/bin/adr-retire-check` | edit | wrap after `is_file()`; Exit 2 |
| `plugin/bin/spec-verify` | edit | wrap `check_spec`; Exit 4 |
| `plugin/bin/arch-lint` | edit | wrap after `exists()`; Exit 2 |
| `plugin/bin/adr-debt` | edit | wrap `rglob` `read_text`; Exit 2 |
| `plugin/bin/adr-next` | edit | wrap `load` / foreign-task / `owning_record_status`; Exit 1 |
| `tests/gates.test.mjs` | edit | class test + postmortem chmod + missing/directory/not-recognised |
| `tests/mutations.json` | edit | drop the `check_adr` wrap |

## Ordered Steps

1. [S1] Confirm the failing tests for `Covers:` IDs exist and are red. [proof: acceptance]
2. [S2] Wrap each named-path open in `except OSError` (after exists / is_dir / not-recognised) and name the case in that gate's Exit-header could-not-run clause. Copy postmortem-verify:57-63. Do not catch `Exception`. Do not reuse `_Unreadable`. [proof: acceptance]
3. [S3] Catalogue a mutant that unwraps `check_adr` so ADR-named chmod 000 tracebacks again. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'an unreadable named path is could-not-run, not failures-found|postmortem-verify on chmod 000 is could-not-run|missing file, directory, and not-recognised stay their current exits' tests/gates.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an unreadable named path is could-not-run, not failures-found` | `tests/gates.test.mjs` | class of named-path OSError is mapped could-not-run, no traceback, not missing-file / `_Unreadable` | F-1, UC1-S2, UC2-S2 | S1, S2 |
| `postmortem-verify on chmod 000 is could-not-run` | `tests/gates.test.mjs` | control stays exit 2, one could-not-run line | UC1-S1 | S1, S2 |
| `missing file, directory, and not-recognised stay their current exits` | `tests/gates.test.mjs` | missing / directory / not-recognised unchanged | UC2-S1 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | class test |
| 2 — something selects it | `check_adr` and `main` Status discriminator call `read_named`; mutant unwraps `check_adr` |
| 3 — the caller can discover it | Exit-header could-not-run clause names a named path that exists but could not be read |
| 4 — it is used | CLI `python3 plugin/bin/<gate> <path>` is the served path |

## Mutation Log

## Invariants

- Catch `OSError` only.
- adr-verify unreadable is 4, not 1 (`survived`) and not `fail()` (2).
- Missing-file / directory / not-recognised sentences and exits stay.
- `_Unreadable` stays the Rests-on sentinel.
- `skip:` when chmod 000 still reads, after the log shows it.

## Risks

- Wrap only `main()` — ADR-named still crashes in `check_adr`.
- Analogize to missing-file so adr-verify uses 1.

## Stop Condition

A listed member still tracebacks, or unreadable is reported as missing-file / failures-found, or missing/directory/not-recognised change.

## Out of Scope

- Dispatcher UNPROVEN at mapped 2/4 (T2)
- Cost 2 wording
- qh-mcp / qh-root
- Changing `_Unreadable`

## Verification Log
