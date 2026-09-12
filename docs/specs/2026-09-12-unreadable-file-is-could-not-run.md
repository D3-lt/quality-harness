# Spec: An unreadable file is could-not-run, not failures-found

> **Date:** 2026-09-12 · **Status:** Ready-for-ADR
> **Owner:** zy · **Becomes:** ADR-049 (`docs/adr/ADR-049-an-unreadable-file-is-could-not-run.md`)
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** plugin/bin/postmortem-verify:57-63 (control), plugin/scripts/facts-gate-dispatch.sh (`unrun_exit`, ADR-*.md name-match), plugin/bin/adr-lint (`check_adr`, `main`), plugin/bin/adr-verify, plugin/bin/adr-judge, plugin/bin/adr-retire-check, plugin/bin/spec-verify (`check_spec`), plugin/bin/arch-lint, plugin/bin/adr-debt, plugin/bin/adr-next (`load`, `owning_record_status`), docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-046-a-caller-relays-could-not-run.md, CLAUDE.md §3 §7 §16, tests/gates.test.mjs (`postmortem-verify on a path it cannot read`, `the dispatcher relays a gate that could not run as UNPROVEN, never as an unsatisfied artifact`), tests/adr-next.test.mjs (`chmod 000` `skip:`), tests/staged-product.test.mjs (directory)

## Problem

An unreadable named path (`chmod 000`, PermissionError) is an uncaught traceback and exit 1. The gate reports "failures found" about a file it never opened. Measured 2026-09-12 on working-tree `plugin/bin` (HEAD `624d23d` then; same arms on `239980b`): copy a real record to temp, `chmod 000` (precondition: `read_text` raises PermissionError), `python3 plugin/bin/<gate> <path>`. Crash, exit 1, stdout begins `Traceback (most recent call last):`, ending `PermissionError: [Errno 13] Permission denied`: adr-lint (ADR-named: `check_adr` read_text; non-ADR name `record.md`: `main` Status discriminator), adr-verify (after `exists()`, then `read_text`), adr-judge, adr-retire-check, spec-verify `check_spec`, arch-lint. Control: postmortem-verify exit 2, one stderr line `[postmortem-verify] could not run: … — [Errno 13] Permission denied`. adr-debt on a lone file is `not a directory` exit 1 (did not open); adr-next on a lone ADR is exit 0 `owns no tasks directory`. Same class when they do open: adr-debt `rglob` of a parent dir; adr-next `load` of an unreadable task; adr-next `owning_record_status` on a sibling ADR. `_Unreadable` / `RESTS_ON_UNREADABLE` is the Rests-on header sentinel (decode / grammar), not OSError on open.

## Goal

A named-path open that raises `OSError` is could-not-run: one could-not-run line, that gate's own Exit-header code, no traceback. Missing-file, directory, and not-recognised arms stay. `_Unreadable` stays decode-only.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| adopting engineer / CI | human role | an unreadable record is could-not-look, not a lint failure |
| listed Python gates | system | wrap the named-path open in `except OSError`; use that gate's Exit-header could-not-run code |
| postmortem-verify | system | remain the control (already exit 2, one could-not-run line) |
| `_Unreadable` | system | stay the Rests-on sentinel; not the OSError arm |
| facts-gate-dispatch.sh | system | mapped could-not-run (2/4) is UNPROVEN, not "not satisfied" |

## Use Cases

### UC-1: A listed gate that cannot open a named path reports could-not-run

- **Trigger:** the gate is pointed at a path that exists as a file (or, for adr-debt/adr-next, a directory whose member it then opens) and `read_text` raises `OSError` · **Preconditions:** existing missing-file / directory / not-recognised checks have already run and did not fire
- **Main flow:**
  1. Copy a real record (or task / archive README / spec / architecture / postmortem) to a temp tree. `chmod 000`. Confirm the open is refused (`PermissionError`) before the gate runs.
  2. Spawn `python3 plugin/bin/<gate> <path>` (working-tree path, not a bare name).
  3. The gate writes one could-not-run line naming the path and the `OSError`, nothing that looks like a finding about the record, and exits the code its own Exit block reserves for could-not-run:
     - adr-lint, arch-lint, adr-retire-check, adr-debt, adr-judge → 2
     - spec-verify → 4
     - adr-verify → 4 (not 1: 1 is `survived` / a fence that failed)
     - adr-next → 1 (header: "the ADR or tasks directory could not be read")
     - postmortem-verify → 2 (already)
  4. No `Traceback`. A readable sibling of the same kind still produces that gate's ordinary finding or pass.
- **Failure paths:**
  - a. at step 3, uncaught `PermissionError` → traceback, exit 1, "failures found" (the live defect on adr-lint, adr-verify, adr-judge, adr-retire-check, spec-verify, arch-lint).
  - b. at step 3, wrap only `main()` of adr-lint → ADR-named files still crash in `check_adr`; adr-debt parent-dir `rglob` and adr-next `load` / `owning_record_status` still crash (same class, different site).
  - c. at step 3, analogize unreadable to missing-file → adr-lint/arch-lint stay 1; adr-verify stays 1 (`survived`); the Exit block and the test disagree.
  - d. at step 1, `chmod 000` still reads (Git for Windows has no POSIX permission bits) → the fixture did not build; `skip:` with that reason after the log shows it, not a Windows-only branch with no seam (CLAUDE.md §7; idiom: tests/adr-next.test.mjs).
- **Postconditions:** every listed member is could-not-run at its mapped code. postmortem-verify is unchanged. Missing-file / directory / not-recognised are not this flow.

### UC-2: Missing, directory, not-recognised, and `_Unreadable` stay their own contracts

- **Trigger:** a listed gate is pointed at a missing path, a directory, a file that never claimed to be a record, or a Rests-on pointer it cannot decode · **Preconditions:** none
- **Main flow:**
  1. Missing file: adr-lint `ADR not found` exit 1; arch-lint `file not found` exit 1; adr-verify `task file not found` via `fail()` exit 2; adr-judge `record not found` exit 2; adr-retire-check `[FAIL] archive README not found` exit 1; adr-debt `not a directory` exit 1. Unchanged.
  2. Directory: adr-lint `expected a record FILE, got a directory` exit 1 (not IsADirectoryError traceback — already fixed).
  3. not-recognised: adr-lint a file with no `**Status:**` and not named ADR-… → exit 2, the not-recognised sentence, nothing checked.
  4. `_Unreadable` / `RESTS_ON_UNREADABLE` remains the third answer `rests_on()` can give. It is not the `OSError` handler on open.
- **Failure paths:**
  - a. at step 1, `except OSError` replaces the `exists()` / `is_dir()` / not-recognised arms → missing and directory become could-not-run (forbidden).
  - b. at step 4, `_Unreadable` is reused as the OSError type or the open-failure flag → a Rests-on grammar miss is reported as a filesystem miss, or the reverse.
- **Postconditions:** the four contracts remain four answers. Unreadable is a fifth, on the open, mapped per Exit header.

### UC-3: The hook dispatcher reports UNPROVEN at mapped could-not-run, not "not satisfied"

- **Trigger:** facts-gate-dispatch.sh is pointed at a file that exists and selects a gate by name or title · **Preconditions:** F-1's mapped could-not-run codes; the file is one the dispatcher actually spawns a gate for
- **Main flow:**
  1. The dispatcher selects the gate by name or title (`ADR-*.md` / `is_adr` / `# ADR-` title → adr-lint; `*/docs/specs/*.md` or Facts+Grill Log → spec-verify --draft; architecture.md → arch-lint; archive README → adr-retire-check; `*/docs/postmortems/*.md` → postmortem-verify). That match is before `[ ! -r ]` (miss path only, ~312).
  2. It spawns the working-tree gate. If the gate returns its mapped could-not-run code (adr-lint / arch-lint / adr-retire-check / postmortem-verify 2; spec-verify --draft 4), the dispatcher prints UNPROVEN, not "not satisfied … Fix the artifact".
  3. Control: unreadable postmortem is already this path (tests/gates.test.mjs).
- **Failure paths:**
  - a. at step 2, the gate tracebacks at exit 1 → unrun_exit maps 2/4, 1 does not match, dispatcher prints "adr-lint is not satisfied" about a file it never opened (the live defect on chmod-000 ADR-*.md; F-1's codes are what close it).
  - b. at step 2, treat traceback-at-1 as UNPROVEN → a real finding at exit 1 is swallowed.
  - c. at step 1, a green nolib test (ADR-046 T1) or unreadable-postmortem test while chmod-000 ADR-*.md stays "not satisfied".
- **Postconditions:** mapped 2/4 through the dispatcher is UNPROVEN. Exit 1 that is a finding stays "not satisfied". Miss-path `[ ! -r ]` is unchanged.

## Scenarios

### UC1-S1 [happy] postmortem-verify on chmod 000 is exit 2, one could-not-run line, no traceback [@implemented] → `tests/gates.test.mjs::postmortem-verify on chmod 000 is could-not-run` cmd:`node --test --test-name-pattern 'postmortem-verify on chmod 000 is could-not-run' tests/gates.test.mjs`

```gherkin
Given a temp copy of a real postmortem whose open is refused (chmod 000, PermissionError)
When python3 plugin/bin/postmortem-verify is pointed at that path
Then exit is 2
And stderr is one line matching [postmortem-verify] could not run:
And there is no Traceback
And a readable postmortem is still exit 0
```

### UC1-S2 [failure] an unreadable named path is not failures-found at exit 1 [@implemented] → `tests/gates.test.mjs::an unreadable named path is could-not-run, not failures-found` cmd:`node --test --test-name-pattern 'an unreadable named path is could-not-run, not failures-found' tests/gates.test.mjs`

```gherkin
Given the class of named-path opens that raise OSError
  And members: adr-lint ADR-named (check_adr) and non-ADR name (main Status read)
  And adr-verify after exists, adr-judge, adr-retire-check, spec-verify check_spec, arch-lint
  And adr-debt rglob of a parent dir that holds an unreadable md
  And adr-next load of an unreadable task and owning_record_status on an unreadable sibling ADR
When each gate is spawned at its working-tree path against that member
Then there is no Traceback and no exit 1 that means failures found
And each uses its own could-not-run code: adr-lint/arch-lint/adr-retire-check/adr-debt/adr-judge 2, spec-verify 4, adr-verify 4 not 1, adr-next 1, postmortem-verify 2
And wrapping only main() of adr-lint does not satisfy the ADR-named, adr-debt, or adr-next members
And when chmod 000 still reads, the case is skip: after the log shows it, not a Windows-only branch with no seam
```

### UC2-S1 [happy] missing file, directory, and not-recognised stay their current exits [@implemented] → `tests/gates.test.mjs::missing file, directory, and not-recognised stay their current exits` cmd:`node --test --test-name-pattern 'missing file, directory, and not-recognised stay their current exits' tests/gates.test.mjs`

```gherkin
Given adr-lint, arch-lint, adr-verify, adr-judge, adr-retire-check, adr-debt
When pointed at a missing path, a directory, or (adr-lint) a file with no Status and not named ADR-…
Then missing stays that gate's current missing-file code and sentence
And a directory is still expected a record FILE, not could-not-run
And not-recognised stays exit 2 with the not-recognised sentence
```

### UC2-S2 [failure] OSError on open is not the missing-file arm and is not _Unreadable [@implemented] → `tests/gates.test.mjs::an unreadable named path is could-not-run, not failures-found` cmd:`node --test --test-name-pattern 'an unreadable named path is could-not-run, not failures-found' tests/gates.test.mjs`

```gherkin
Given an unreadable named file that exists, and a missing path, and a Rests-on header
When the OSError wrap lands
Then unreadable is could-not-run at the mapped code, not ADR not found / task file not found / failures found
And _Unreadable remains the Rests-on sentinel in adr-lint and adr-verify
And a test that only asserts "no traceback" while exiting 1 does not satisfy F-1
```

### UC3-S1 [happy] an unreadable postmortem is UNPROVEN at mapped 2, not "not satisfied" [@implemented] → `tests/gates.test.mjs::postmortem-verify on a path it cannot read exits could-not-run, and the dispatcher relays it as UNPROVEN` cmd:`node --test --test-name-pattern 'postmortem-verify on a path it cannot read' tests/gates.test.mjs`

```gherkin
Given a temp copy of a real postmortem under docs/postmortems whose open is refused
When facts-gate-dispatch.sh is pointed at that path through run-shell-hook.mjs
Then the dispatcher says UNPROVEN: postmortem-verify could not run (exit 2)
And there is no "not satisfied" and no "Fix the artifact"
```

### UC3-S2 [failure] chmod-000 ADR-*.md is not "not satisfied" at traceback-1 [@implemented] → `tests/gates.test.mjs::chmod-000 ADR-*.md is UNPROVEN through the dispatcher, not not satisfied` cmd:`node --test --test-name-pattern 'chmod-000 ADR-\\*\\.md is UNPROVEN through the dispatcher' tests/gates.test.mjs`

```gherkin
Given a temp copy of a real ADR-*.md whose open is refused (chmod 000)
When facts-gate-dispatch.sh name-matches it and spawns adr-lint
Then the dispatcher is not "adr-lint is not satisfied … Fix the artifact"
And after F-1 maps adr-lint to 2, the line is UNPROVEN at mapped 2
And a nolib-only green (ADR-046 T1) does not satisfy this fact
And treating traceback-at-1 as UNPROVEN does not satisfy this fact
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | Accepted. Class: any named path a listed gate opens whose `read_text` (or equivalent open) raises `OSError`. Not "a missing file". Members enumerated 2026-09-12 from `plugin/bin` source and a chmod-000 spawn: adr-lint ADR-named `check_adr` read_text; adr-lint non-ADR name `main` Status discriminator read_text; adr-verify after `exists()` then read_text; adr-judge after `exists()`; adr-retire-check after `is_file()`; spec-verify `check_spec` (no exists arm — FileNotFoundError is OSError today too); arch-lint after `exists()`; adr-debt `rglob` of a parent dir (a lone file is `not a directory` exit 1 and does not open); adr-next `load` of an unreadable `*.md` in the tasks dir and `owning_record_status` sibling ADR read_text (a lone ADR is exit 0 owns no tasks directory). Control: postmortem-verify:57-63 `except OSError` → exit 2, one could-not-run line. qh-mcp / qh-root do not read a named record. Current: those members traceback, exit 1, PermissionError. After: wrap the named-path open in `except OSError` (after existing exists / is_dir / not-recognised checks). Each gate uses its own could-not-run code from its Exit header: adr-lint / arch-lint / adr-retire-check / adr-debt / adr-judge → 2; spec-verify → 4; adr-verify → 4 (not 1); adr-next → 1 (header already says could not be read); postmortem-verify → 2 (already). One could-not-run line, no traceback. Keep missing-file / directory / not-recognised. `_Unreadable` / `RESTS_ON_UNREADABLE` stays decode-only. Test method: `skip:` when chmod 000 still reads, after the log shows it (CLAUDE.md §7; tests/adr-next.test.mjs), not a silent `return` and not a Windows-only product branch with no seam. Why it can fail: wrap only `main()` of adr-lint (ADR-named still crashes in `check_adr`); analogize to missing-file so adr-lint stays 1 and adr-verify uses 1 (`survived`); catch `Exception` and swallow a real finding; reuse `_Unreadable` for OSError. | `tests/gates.test.mjs::an unreadable named path is could-not-run, not failures-found` | @implemented | `node --test --test-name-pattern 'an unreadable named path is could-not-run, not failures-found' tests/gates.test.mjs` |
| F-2 | Accepted. Class: a file the hook dispatcher selects a gate for by name or title before `[ ! -r ]`, then spawns that gate. Not "a missing file" and not the miss-path `[ ! -r ]` (facts-gate-dispatch.sh:312). Members: `ADR-*.md` / `is_adr` / `# ADR-` title → adr-lint (line ~250); spec (path or Facts+Grill Log) → spec-verify --draft; architecture.md → arch-lint; archive README → adr-retire-check. Control: unreadable `*/docs/postmortems/*.md` is already UNPROVEN (`tests/gates.test.mjs::postmortem-verify on a path it cannot read`; `unrun_exit` maps 2). Current: chmod-000 ADR-*.md name-matches, adr-lint traceback exit 1, `unrun_exit` maps adr-lint to 2 so 1 does not match, dispatcher prints "adr-lint is not satisfied … Fix the artifact". After: when the spawned gate returns its mapped could-not-run code, the dispatcher says UNPROVEN, not "not satisfied". Traceback-at-1 is F-1, not this fact. Why it can fail: F-1 tested only via CLI `python3 plugin/bin/<gate>`; dispatcher still "not satisfied" at exit 1. Treating traceback-at-1 as UNPROVEN swallows a real finding. A green nolib / unreadable-postmortem test while chmod-000 ADR-*.md stays "not satisfied". | `tests/gates.test.mjs::chmod-000 ADR-*.md is UNPROVEN through the dispatcher, not not satisfied` | @implemented | `node --test --test-name-pattern 'chmod-000 ADR-*.md is UNPROVEN through the dispatcher' tests/gates.test.mjs` |

## Domain

**could-not-run** = the gate did not check the record; Exit-header code for "nothing was looked at" (ADR-005). **failures found** = exit 1 on adr-lint / arch-lint / spec-verify structural / adr-verify `survived`. **named-path open** = the `read_text` (or equivalent) of a path the gate was given or discovered and then opened, after exists/is_dir/not-recognised. **`_Unreadable`** = Rests-on header sentinel, not OSError. **unreadable** = the open was refused (`OSError`, including PermissionError); exists() is true.

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| adr-lint `check_adr` and `main` named-path `read_text`; Exit 2 | OSError → could-not-run 2, not traceback 1 | facts-gate-dispatch.sh `unrun_exit` (adr-lint → 2), CI, CLI |
| adr-verify named-path `read_text`; Exit 4 | OSError → 4, not 1 | CLI, authoring callers; 1 stays `survived` |
| spec-verify `check_spec` `read_text`; Exit 4 | OSError → 4 | facts-gate-dispatch.sh (`spec-verify --draft` → 4) |
| arch-lint, adr-retire-check, adr-debt, adr-judge | OSError → 2 | dispatcher for arch-lint / adr-retire-check; CLI |
| adr-next `load` / `owning_record_status` | OSError → 1 (could not be read) | SessionStart / lifecycle.mjs adr-next UNPROVEN |
| `_Unreadable` | none | rests_on() |
| facts-gate-dispatch.sh `unrun_exit` (adr-lint / arch-lint / adr-retire-check / postmortem-verify 2; spec-verify --draft 4) | mapped could-not-run is UNPROVEN, not "not satisfied" | PostToolUse additionalContext; commit / completion stderr |
| missing-file / directory / not-recognised arms | none | existing tests (adr-lint Exit-block test; staged-product directory) |

## Non-Goals

- Unrecognised Bash / PowerShell / cmd (ADR-047 and its spec). Not this class.
- MCP write plus a passing check clearing UNPROVEN (docs/specs/2026-09-12-unproven-write-has-a-validation-term.md). Sibling leftover, not this spec.
- qh-mcp / qh-root reading a named record (they do not; usage exit 2).
- Changing `_Unreadable` / `RESTS_ON_UNREADABLE` into an OSError type.
- Changing missing-file, directory, or not-recognised exits or sentences.
- A Windows-only product branch with no injectable seam. `skip:` the fixture when chmod 000 still reads.
- Pre-open `[ ! -r ]` before ADR-*.md name-match so the gate is never spawned (F-2 is the mapped-code relay; the miss-path `[ ! -r ]` is not this class).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Wrap only `main()` of adr-lint | High | High | UC1-S2 names ADR-named `check_adr`, adr-debt `rglob`, adr-next `load` / `owning_record_status` as members |
| Unreadable analogized to missing-file (exit 1) | High | High | F-1 maps per Exit header; adr-verify 4 not 1; a no-traceback-at-1 test is not this fact |
| `except Exception` swallows a finding | Med | High | Catch `OSError` on the open, as postmortem-verify:57-63 |
| chmod 000 still reads on Windows | High | Med | `skip:` after the log shows it; no Windows-only wrap |
| Dispatcher still reports "not satisfied" if the gate exits 1 | High | High | F-2: mapped 2/4 is UNPROVEN. Traceback-at-1 is F-1. Bind through the dispatcher (CLAUDE.md §4), not only CLI |

## Open Questions

<!-- F-1 and F-2 Accepted 2026-09-12. adr-debt parent-dir / adr-next task / Windows skip are F-1 members, not a third fact. chmod-000 traceback is work. Leftover: ADR-047 validation-term sibling, not this spec. -->

## Verify

```bash
python3 plugin/bin/spec-verify --spec docs/specs/2026-09-12-unreadable-file-is-could-not-run.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | Unreadable named-path open (chmod 000 / PermissionError) is could-not-run at each gate's own Exit-header code, not traceback-at-1 failures-found; control postmortem-verify:57-63; keep missing/directory/not-recognised; `_Unreadable` stays decode-only; skip: when chmod 000 still reads? | F-1 | Accepted 2026-09-12. After: `except OSError` on named-path open; adr-lint/arch-lint/adr-retire-check/adr-debt/adr-judge 2; spec-verify 4; adr-verify 4 not 1; adr-next 1; postmortem-verify 2. Class includes ADR-named `check_adr`, adr-debt parent-dir, adr-next task / `owning_record_status`. |
| 2 | Hook dispatcher UNPROVEN at mapped 2/4, not "not satisfied", when it name-matches ADR-*.md (and spec/arch) before `[ ! -r ]` and spawns the gate? | F-2 | Accepted 2026-09-12. After: mapped could-not-run through unrun_exit is UNPROVEN. Traceback-at-1 is F-1. Control: unreadable postmortem. Dirty: chmod-000 ADR-*.md currently "not satisfied". |
