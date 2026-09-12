# Spec: An unrecognised command is UNPROVEN, not a non-write

> **Date:** 2026-09-12 · **Status:** Ready-for-ADR
> **Owner:** zy · **Becomes:** ADR-047 (`docs/adr/ADR-047-an-unrecognised-command-is-unproven.md`)
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** plugin/scripts/lifecycle.mjs (`isPotentialMutationCommand`, `isValidationCommand`, `nestedShellScript`, `innerCommands`, `isKnownProbePrefix`, `bashVerdict`, `analyzeTranscript`), docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-041-a-probe-prefix-is-not-the-mutation.md, docs/adr/ADR-042-unproven-write-is-advise.md, CLAUDE.md §16, tests/classify.test.mjs, tests/lifecycle.test.mjs

## Problem

The hole is fail-open, not file size. `isPotentialMutationCommand` / `isValidationCommand` are booleans; `false` plus `false` is `neither`, and Session treats that as a write that did not happen. Measured 2026-09-12 on HEAD `624d23d` by calling those two plus `analyzeTranscript` / `readOnlyVerdict` / `describeCommand` in `plugin/scripts/lifecycle.mjs` on live strings: `rm -rf build` is mutation (authorship `bash`, `lastUnprovenWrite` -1); `Remove-Item -Recurse build`, `cmd.exe /c del x.md`, `pwsh -Command Set-Content x.md hi`, and `powershell.exe -Command Remove-Item -Recurse build` are `neither` (authorship `none`, `lastMutation` -1, `lastUnprovenWrite` -1, reviewer guard allows). `zsh -c "rm -rf ${(s: :)files}"` is mutation because the letters `rm` match; the same family with no POSIX verb (`zsh -c "echo ${#files}"`) is `neither`. `bash scripts/selftest.sh` is validation. `cmd /c rmdir /s /q build` is mutation because `rmdir` is in the POSIX denylist on the outer string, not because `cmd` is recognised. ADR-005 / CLAUDE.md §16: "not recognised as X" is never "known to be not-X".

## Goal

A Bash command whose executable family is not in a measured set is `unrecognised`. Session treats that as UNPROVEN (could-not-classify the write), not as "not a mutation". Recognised POSIX `rm` stays mutation. Healthy `bash scripts/selftest.sh` stays validation.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| adopting engineer | human role | trust Stop / PreToolUse: a PowerShell or cmd write is not silent "nothing happened" |
| command classifier | system | return `mutation`, `validation`, `neither`, or `unrecognised` — never collapse the last into `neither` |
| `analyzeTranscript` | system | `unrecognised` advances `lastUnprovenWrite` (UNPROVEN), not authorship `none` |
| Stop / PreToolUse / `bashVerdict` | system | consume that four-way result; `unrecognised` is could-not-look, not "not a write" |

## Use Cases

### UC-1: Session treats an unrecognised executable family as UNPROVEN

- **Trigger:** an executed Bash tool_use is classified · **Preconditions:** the hook can read the transcript
- **Main flow:**
  1. Classify the command. Recognised POSIX `rm -rf build` is mutation. Healthy `bash scripts/selftest.sh` is validation.
  2. If the executable family is not in the measured set, the result is `unrecognised`, not `neither`.
  3. Session records that as UNPROVEN (`lastUnprovenWrite`), not authorship `none`. Stop / PreToolUse Advise on that write. Isolated `echo` / `ls` stay `neither` (ADR-041).
- **Failure paths:**
  - a. at step 2, PowerShell / cmd classify as `neither` → `lastUnprovenWrite` stays -1, authorship `none`, Stop is silent, the reviewer guard allows the write (the live defect).
  - b. at step 1, a POSIX-verb regex on the outer string "recognises" a foreign-family write (`rm` as a PowerShell alias; `cmd /c rmdir` matching `rmdir`; `zsh -c` whose `-c` body happens to contain the letters `rm`) → the family is claimed recognised without the inner payload being read.
- **Postconditions:** recognised POSIX `rm` is mutation; healthy `bash scripts/selftest.sh` is validation; an unrecognised family is UNPROVEN, never a known non-write.

### UC-2: Session surfaces read unrecognised the way they read a known UNPROVEN write

- **Trigger:** Stop, `sessionStateNote`, the wired statusline, or PreToolUse on Bash `git commit` after an executed unrecognised Bash tool_use · **Preconditions:** the hook can read the transcript; a project check exists so those surfaces have something to Advise
- **Main flow:**
  1. `analyzeTranscript` advances `lastUnprovenWrite` for that Bash tool_use (same scalar `mcp__mrw__mrw_write` already sets).
  2. Stop, `sessionStateNote`, the wired statusline, and PreToolUse commit advice Advise — not "nothing edited".
- **Failure paths:**
  - a. at step 1, `lastUnprovenWrite` stays non-Bash-only (lifecycle.mjs:1940) → classify can return `unrecognised` and every surface stays silent (the live defect; ADR-042's shape).
  - b. at step 1, isolated `echo` / `ls` are treated as unrecognised → those surfaces Advise every probe (ADR-041 reversed).
- **Postconditions:** unrecognised Bash is Advise the same way `mcp__mrw__mrw_write` is. Isolated `echo` / `ls` stay silent. Recognised POSIX `rm` stays the mutation path (`lastMutation`), not this scalar.

### UC-3: Family is the executable, not a denylist substring

- **Trigger:** the four-way classify is asked about a command whose payload contains POSIX mutation letters · **Preconditions:** F-1's four-way result exists
- **Main flow:**
  1. Family is the executable (`commandInvocation` / `executableName`), not a scan of the whole string for `rm` / `rmdir`.
  2. `pwsh`, `powershell`, `cmd`, `cmd.exe` are unrecognised even when the `-Command` / `/c` text holds `rm` or `rmdir`.
  3. POSIX `rm` as the executable stays mutation. A zsh `-c` body is not a family claim unless the test feeds a body that does not contain a POSIX verb.
- **Failure paths:**
  - a. at step 1, F-1 is implemented as `false` plus `false` → `unrecognised` while `:1106` still scans the whole string → `pwsh -Command rm -rf build` and `cmd /c rmdir` stay mutation; F-2 never sees them (the live defect).
  - b. at step 3, a "recognised zsh" test that only feeds `zsh -c "rm …"` → letters `rm` match; the unread-array member (`zsh -c "echo ${#files}"`) is neither today.
- **Postconditions:** foreign-family executables are unrecognised regardless of POSIX letters in the payload. Recognised POSIX `rm` as the executable stays mutation.

### UC-4: The reviewer guard does not allow an unrecognised command

- **Trigger:** PreToolUse on Bash inside a read-only reviewer role · **Preconditions:** `readOnlyRole` matches; F-1 four-way classify exists
- **Main flow:**
  1. `bashVerdict` / `readOnlyVerdict` reads the four-way result, not the mutation boolean alone.
  2. `unrecognised` is denied (could-not-classify is not "not a write"). Recognised mutation stays denied. Isolated `echo` / `ls` stay allowed. Healthy `bash scripts/selftest.sh` stays allowed.
- **Failure paths:**
  - a. at step 1, `bashVerdict` still keys `isPotentialMutationCommand` (`lifecycle.mjs:3916`) → `Remove-Item` is allowed today; after F-3, `pwsh -Command rm -rf build` becomes unrecognised and would also be allowed (F-3 opens a write the substring denylist currently denies).
  - b. at step 2, `echo` / validation are denied → the guard is no longer about writes.
- **Postconditions:** a read-only reviewer cannot run `Remove-Item` or `pwsh -Command rm`. Isolated `echo` still can.

## Scenarios

### UC1-S1 [happy] recognised POSIX rm is mutation and selftest is validation (F-1 Accepted) [@implemented] → `tests/classify.test.mjs::recognised POSIX rm is mutation and selftest is validation` cmd:`node --test --test-name-pattern 'recognised POSIX rm is mutation and selftest is validation' tests/classify.test.mjs`

```gherkin
Given the working-tree classifier
When it is asked about `rm -rf build` and `bash scripts/selftest.sh`
Then `rm -rf build` is mutation (authorship bash)
And `bash scripts/selftest.sh` is validation
And neither is unrecognised
```

### UC1-S2 [failure] an unrecognised PowerShell or cmd write is not neither (F-1 Accepted) [@implemented] → `tests/classify.test.mjs::an unrecognised PowerShell or cmd write is not neither` cmd:`node --test --test-name-pattern 'an unrecognised PowerShell or cmd write is not neither' tests/classify.test.mjs`

```gherkin
Given executed Bash tool_uses `Remove-Item -Recurse build`, `cmd.exe /c del x.md`, and `pwsh -Command Set-Content x.md hi`
When the four-way classify runs
Then each is unrecognised, not neither
And `rm -rf build` is still mutation
And `bash scripts/selftest.sh` is still validation
```

### UC2-S1 [happy] unrecognised Bash is Advise the same way an MCP write is (F-2 Accepted) [@implemented] → `tests/lifecycle.test.mjs::unrecognised Bash is Advise the same way an MCP write is` cmd:`node --test --test-name-pattern 'unrecognised Bash is Advise the same way an MCP write is' tests/lifecycle.test.mjs`

```gherkin
Given a repository that names a project check
And an executed Bash tool_use `Remove-Item -Recurse build`
When analyzeTranscript reads the transcript
And Stop runs, sessionStateNote is written, or PreToolUse runs on Bash git commit
Then lastUnprovenWrite is that tool_use, not -1
And authorship is UNPROVEN, not none
And those surfaces Advise rather than "nothing edited since the last publish"
And the same surfaces Advise on mcp__mrw__mrw_write
```

### UC2-S2 [failure] echo is not Advise, and a classify-only green is not this fact (F-2 Accepted) [@implemented] → `tests/lifecycle.test.mjs::echo is not Advise, and a classify-only green is not this fact` cmd:`node --test --test-name-pattern 'echo is not Advise, and a classify-only green is not this fact' tests/lifecycle.test.mjs`

```gherkin
Given an executed Bash tool_use `echo hi`
When Stop runs, sessionStateNote is written, or PreToolUse runs on Bash git commit
Then lastUnprovenWrite stays -1
And those surfaces do not Advise on the strength of that command
And a unit test that only asserts classify(Remove-Item) === unrecognised does not satisfy this fact
```

### UC3-S1 [happy] POSIX rm as the executable stays mutation (F-3 Accepted) [@implemented] → `tests/classify.test.mjs::POSIX rm as the executable stays mutation` cmd:`node --test --test-name-pattern 'POSIX rm as the executable stays mutation' tests/classify.test.mjs`

```gherkin
Given the working-tree classifier
When it is asked about `rm -rf build`
Then the family is the executable rm
And the result is mutation, not unrecognised
```

### UC3-S2 [failure] pwsh or cmd with POSIX letters in the payload is unrecognised, not mutation (F-3 Accepted) [@implemented] → `tests/classify.test.mjs::pwsh or cmd with POSIX letters in the payload is unrecognised, not mutation` cmd:`node --test --test-name-pattern 'pwsh or cmd with POSIX letters in the payload is unrecognised, not mutation' tests/classify.test.mjs`

```gherkin
Given `pwsh -Command rm -rf build`, `cmd /c rmdir /s /q build`, and `cmd.exe /c rmdir /s /q build`
When the four-way classify runs
Then each is unrecognised, not mutation
And `pwsh -Command Remove-Item -Recurse build` is unrecognised too
And `zsh -c "echo ${#files}"` is not a recognised-zsh mutation claim — the array is unread
```

### UC4-S1 [happy] a reviewer is denied Remove-Item and pwsh -Command rm (F-4 Accepted) [@implemented] → `tests/reviewer-guard.test.mjs::a reviewer is denied Remove-Item and pwsh -Command rm` cmd:`node --test --test-name-pattern 'a reviewer is denied Remove-Item and pwsh -Command rm' tests/reviewer-guard.test.mjs`

```gherkin
Given a read-only reviewer role
When PreToolUse runs on Bash `Remove-Item -Recurse build` or `pwsh -Command rm -rf build`
Then readOnlyVerdict denies the command
And POSIX `rm -rf build` is still denied
```

### UC4-S2 [failure] echo and selftest are not denied as unrecognised (F-4 Accepted) [@implemented] → `tests/reviewer-guard.test.mjs::echo and selftest are not denied as unrecognised` cmd:`node --test --test-name-pattern 'echo and selftest are not denied as unrecognised' tests/reviewer-guard.test.mjs`

```gherkin
Given a read-only reviewer role
When PreToolUse runs on Bash `echo hi` or `bash scripts/selftest.sh`
Then readOnlyVerdict allows the command
And a green F-3 classify test that leaves bashVerdict on the mutation boolean does not satisfy this fact
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | Accepted. Current: `isPotentialMutationCommand` (lifecycle.mjs:1096) and `isValidationCommand` (lifecycle.mjs:883) are booleans. `tests/classify.test.mjs:93` collapses `false` plus `false` to `neither`. `analyzeTranscript` (lifecycle.mjs:1898) records Bash authorship only when `isPotentialMutationCommand` is true; `lastUnprovenWrite` (lifecycle.mjs:1940) is assigned only for non-Bash unknowns. Measured 2026-09-12 on 624d23d: `Remove-Item -Recurse build`, `cmd.exe /c del x.md`, `pwsh -Command Set-Content x.md hi` are neither, authorship none, lastUnprovenWrite -1, bashVerdict allows. `rm -rf build` is mutation. `bash scripts/selftest.sh` is validation. After: a four-way classify (recommended name `classifyCommand`, name not this fact) returns `mutation`, `validation`, `neither`, or `unrecognised` when the executable family is not in a measured set. Session consumers treat `unrecognised` as UNPROVEN (could-not-classify the write), not as "not a mutation". Recognised POSIX `rm` stays mutation. Healthy `bash scripts/selftest.sh` stays validation. Isolated `echo` / `ls` stay neither (ADR-041). Why it can fail: (1) `rm` is a PowerShell alias — a POSIX regex on `rm` still "recognises" a PowerShell write. (2) `zsh -c "rm -rf ${(s: :)files}"` is mutation today because the letters `rm` match; `zsh -c "echo ${#files}"` is neither — a "recognised zsh" claim is a lie unless the test feeds an array that does not contain a POSIX verb. `nestedShellScript` (lifecycle.mjs:596) only names bash/dash/ksh/sh/zsh; `innerCommands` (lifecycle.mjs:3901) only peels `(ba\|z\|da)?sh -c`. (3) Widening the name list from memory recreates the fail-open (CLAUDE.md §16: execute each name on the case the gate is about). `cmd /c rmdir /s /q build` is mutation today because `rmdir` is in the denylist on the outer string, not because cmd is recognised. | `tests/classify.test.mjs::recognised POSIX rm is mutation and selftest is validation` | @implemented | `node --test --test-name-pattern 'recognised POSIX rm is mutation and selftest is validation' tests/classify.test.mjs` |
| F-2 | Accepted. Current: `lastUnprovenWrite` (lifecycle.mjs:1940) is assigned only for executed non-Bash unknowns. `unverifiedSince` (lifecycle.mjs:1970) keys `lastMutation` only. Stop (lifecycle.mjs:4177), PreToolUse (lifecycle.mjs:4147), `sessionStateNote` (lifecycle.mjs:3417), and `statusline.mjs:67` OR `lastUnprovenWrite > lastPublish` with that scalar. Measured 2026-09-12 on 624d23d in a temp project that names a check: executed `Remove-Item -Recurse build` is authorship none, lastUnprovenWrite -1, sessionStateNote status neutral "nothing edited since the last publish", Stop silent, PreToolUse silent — the same shape as `echo hi`. `mcp__mrw__mrw_write` is authorship UNPROVEN, lastUnprovenWrite 0, note "UNPROVEN write since the last publish", Stop emits systemMessage, PreToolUse Advises. `rm -rf build` Advises via lastMutation / unverifiedSince, not this scalar. After: an executed unrecognised Bash command advances `lastUnprovenWrite` the same way `mcp__mrw__mrw_write` does; Stop, sessionStateNote, the wired statusline, and PreToolUse commit advice Advise on it. Isolated `echo` / `ls` stay neither and do not advance the scalar (ADR-041). Recognised POSIX `rm` stays the mutation path. Why it can fail: a green F-1 classify unit test while analyzeTranscript still keys `isPotentialMutationCommand` and lastUnprovenWrite stays non-Bash-only (ADR-042's miss). Treating `echo` as unrecognised Advises every probe. | `tests/lifecycle.test.mjs::unrecognised Bash is Advise the same way an MCP write is` | @implemented | `node --test --test-name-pattern 'unrecognised Bash is Advise the same way an MCP write is' tests/lifecycle.test.mjs` |
| F-3 | Accepted. Current: `isPotentialMutationCommand` (lifecycle.mjs:1106) scans the whole command (minus heredoc) for POSIX verb letters. Measured 2026-09-12 on 624d23d: `pwsh -Command rm -rf build` and `powershell.exe -Command rm -rf build` are mutation (letters `rm`); `pwsh -Command Remove-Item -Recurse build` is neither; `cmd /c rmdir /s /q build` and `cmd.exe /c rmdir /s /q build` are mutation (letters `rmdir`); `cmd.exe /c del x.md` is neither; `zsh -c "rm -rf ${(s: :)files}"` is mutation; `zsh -c "echo ${#files}"` is neither. After: family is the executable (`executableName` lifecycle.mjs:505, `commandInvocation` :513), not a denylist substring. `pwsh` / `powershell` / `cmd` / `cmd.exe` are unrecognised even when the payload holds `rm` or `rmdir`. POSIX `rm` as the executable stays mutation. A "recognised zsh" claim is false unless the test feeds a `-c` body that does not contain a POSIX verb. Why it can fail: F-1 implemented as `false` plus `false` → `unrecognised` while :1106 still matches letters — F-2 never sees `pwsh -Command rm`. Adding `Remove-Item` to the denylist from memory. A recognised-zsh test that only feeds `zsh -c "rm …"`. | `tests/classify.test.mjs::POSIX rm as the executable stays mutation` | @implemented | `node --test --test-name-pattern 'POSIX rm as the executable stays mutation' tests/classify.test.mjs` |
| F-4 | Accepted. Current: `bashVerdict` (lifecycle.mjs:3916) denies only when `isPotentialMutationCommand` is true (and not temp-only). Measured 2026-09-12 on 624d23d: `Remove-Item -Recurse build` and `pwsh -Command Remove-Item -Recurse build` are allowed (reviewerDenies false); `pwsh -Command rm -rf build` and `cmd /c rmdir` are denied because they are mutation via substring. After F-3 those last two become unrecognised. After: `readOnlyVerdict` / `bashVerdict` treats `unrecognised` as could-not-classify and denies it — not "not a mutation" / allow. Isolated `echo` / `ls` stay allowed. Healthy `bash scripts/selftest.sh` stays allowed. Recognised POSIX `rm` stays denied. Why it can fail: F-3 ships and `pwsh -Command rm` flips from deny to allow. A green F-3 classify test while :3916 still keys the boolean. Denying `echo`. | `tests/reviewer-guard.test.mjs::a reviewer is denied Remove-Item and pwsh -Command rm` | @implemented | `node --test --test-name-pattern 'a reviewer is denied Remove-Item and pwsh -Command rm' tests/reviewer-guard.test.mjs` |

## Domain

**unrecognised** = the executable family is not in the measured set; could-not-classify, never a verdict that no write happened (ADR-005). **neither** = positively classified as not validation and not a recognised mutation (`echo`, `ls`). **UNPROVEN write** = `lastUnprovenWrite` advances; Stop / PreToolUse Advise (ADR-042). **measured set** = names executed on the case the gate is about, not typed from memory. Recommended identifier `classifyCommand` is naming, not the assertion.

Class F-1 governs: Bash tool_use whose executable family the POSIX denylist / validation patterns / nested-shell peel do not cover. Enumerated 2026-09-12 on 624d23d:

```
mutation     rm -rf build
neither      Remove-Item -Recurse build
neither      cmd.exe /c del x.md
neither      pwsh -Command Set-Content x.md hi
neither      powershell.exe -Command Remove-Item -Recurse build
mutation     zsh -c "rm -rf ${(s: :)files}"   (letters rm; array unread)
neither      zsh -c "echo ${#files}"         (same family; no POSIX verb)
mutation     cmd /c rmdir /s /q build        (letters rmdir, not a recognised cmd)
validation   bash scripts/selftest.sh
neither      echo "== cache versions"
```

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `isPotentialMutationCommand` / `isValidationCommand` (lifecycle.mjs:1096, :883) | four-way result; `false` plus `false` is not "known non-write" when the family is unrecognised | `analyzeTranscript`, `isKnownProbePrefix`, `bashVerdict`, `tests/classify.test.mjs:93` |
| `analyzeTranscript` Bash path (lifecycle.mjs:1898) and `lastUnprovenWrite` (lifecycle.mjs:1940) | `unrecognised` advances `lastUnprovenWrite`; authorship UNPROVEN, not none | Stop (lifecycle.mjs:4155, :4177), PreToolUse commit advice (lifecycle.mjs:4147) |
| `isKnownProbePrefix` (lifecycle.mjs:1763) | must not peel `unrecognised` as a known probe | `describeCommand` / `peelOneLeadingProbe` (lifecycle.mjs:1773) |
| `nestedShellScript` (lifecycle.mjs:596) / `innerCommands` (lifecycle.mjs:3899) | POSIX-only peel; `pwsh` / `cmd.exe` are unrecognised, not inner-script mutation | `bashVerdict` (lifecycle.mjs:3909) |
| `bashVerdict` (lifecycle.mjs:3916) | `unrecognised` is not "not a mutation" (today that allows a reviewer `Remove-Item`) | `readOnlyVerdict` / PreToolUse reviewer guard (lifecycle.mjs:4053) |

## Non-Goals

- A full PowerShell / cmd mutation grammar (`Remove-Item`, `Set-Content`, `del`, `rmdir` as recognised mutations). This spec makes those families unrecognised / UNPROVEN, not parsed.
- Peeling every `neither` verb (`cat`, `pwd`, `git status`) as known read-only. ADR-041 left that sibling; CLAUDE.md §16 still forbids treating "not recognised as mutating" as known read-only.
- Compound `git commit; echo done` (and other remainder compounds).
- Re-opening Core / Session / Corpus, adapters spawning Core, inheritance, a wholesale `lifecycle.mjs` split, extracting `record.py` / `fence.py` / `posixListed`, extracting path helpers, or moving the publish-boundary out of `lifecycle.mjs`.
- A passing recognised check clearing an MCP UNPROVEN write (`lastUnprovenWrite` has no validation term). Confirmed on 624d23d against source; sibling spec, not this one.
- An `is_error` / failed Bash command becoming an UNPROVEN write that later surfaces Advise. `executed()` is true for an errored result unless a hook blocked; F-2 keys executed unrecognised Bash. Different edge, not this spec.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A POSIX regex on `rm` / `rmdir` "recognises" a PowerShell or cmd write | High | High | Do not claim those families recognised. F-1's failure is unrecognised, not a new denylist. The alias and `cmd /c rmdir` are the test. |
| A "recognised zsh" test that only feeds `zsh -c "rm …"` | High | High | The unread-array member (`zsh -c "echo ${#files}"`) must stay in the class; letters `rm` matching is not a zsh peel. |
| Widening `pwsh` / `cmd.exe` / `powershell` from memory into the measured set | Med | High | CLAUDE.md §16: execute each name on the case the gate is about before writing it down. Unrecognised until measured. |
| `bashVerdict` keeps the boolean and a read-only reviewer `Remove-Item` is allowed | Med | High | F-4: unrecognised is deny, not allow. After F-3, `pwsh -Command rm` must not flip deny to allow. |
| A green F-1 classify test while Stop stays silent | High | High | F-2 binds lastUnprovenWrite and the Advise surfaces, through the same call the report comes through (CLAUDE.md §4). |

## Open Questions

<!-- Empty. User said enough 2026-09-12. F-1–F-4 Accepted and bound. Leftovers are Non-Goals / sibling specs: is_error as UNPROVEN write; MCP write + passing check (624d23d); PowerShell/cmd mutation grammar; compound git commit; echo done. -->

## Verify

```bash
python3 plugin/bin/spec-verify --implemented docs/specs/2026-09-12-unrecognised-command-is-unproven.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | Do PowerShell / cmd Bash commands that the POSIX denylist misses stay `neither` (a write that did not happen), or is that `unrecognised` / UNPROVEN? | F-1 | Accepted. Measured 624d23d: Remove-Item / cmd.exe /c del / pwsh Set-Content are neither, authorship none, lastUnprovenWrite -1. After: four-way classify; unrecognised when the family is not in a measured set. POSIX rm stays mutation; bash scripts/selftest.sh stays validation. |
| 2 | Does unrecognised Bash set lastUnprovenWrite / Stop Advise the same way mcp__mrw__mrw_write does, or is F-1 a classify return nobody reads? | F-2 | Accepted. Measured 624d23d: Remove-Item is silent like echo; mrw_write Advises via lastUnprovenWrite. After: unrecognised Bash advances that scalar; Stop / sessionStateNote / statusline / PreToolUse Advise. echo/ls stay neither. |
| 3 | Is family the executable, or does a POSIX denylist substring still "recognise" pwsh/cmd/zsh payloads? | F-3 | Accepted. Measured 624d23d: pwsh -Command rm and cmd /c rmdir are mutation via letters. After: family is the executable; pwsh/powershell/cmd/cmd.exe are unrecognised even when the payload holds rm/rmdir. POSIX rm stays mutation. |
| 4 | Does bashVerdict allow unrecognised (Remove-Item today; pwsh -Command rm after F-3), or is unrecognised a deny for the reviewer guard? | F-4 | Accepted. Measured 624d23d: Remove-Item allowed; pwsh -Command rm denied only via substring. After: unrecognised is deny. echo/selftest stay allowed. |
| 5 | Coverage leftover after F-1–F-4? | non-behavioral | Enough from the agent. No remaining fail-open in this spec. Leftovers named in Non-Goals. |
| 6 | User said enough? | non-behavioral | Enough 2026-09-12. Grill closed. F-1–F-4 Accepted. Bindings stay — to bind until work. Status Draft, not Ready-for-ADR. |
