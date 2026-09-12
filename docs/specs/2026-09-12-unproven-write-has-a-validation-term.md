# Spec: An UNPROVEN write has a validation term

> **Date:** 2026-09-12 · **Status:** Ready-for-ADR
> **Owner:** zy · **Becomes:** ADR-048 (`docs/adr/ADR-048-an-unproven-write-has-a-validation-term.md`)
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** plugin/scripts/lifecycle.mjs (`analyzeTranscript` `lastUnprovenWrite` / `lastSuccessfulValidation` / `unverifiedSince`, `sessionStateNote`), plugin/scripts/statusline.mjs (`reading`), plugin/scripts/classify-command.mjs, docs/adr/ADR-042-unproven-write-is-advise.md, docs/adr/ADR-047-an-unrecognised-command-is-unproven.md, docs/specs/2026-09-12-unrecognised-command-is-unproven.md (Non-Goal: MCP write + passing check), CLAUDE.md §4 §16, tests/lifecycle.test.mjs (`an unknown non-Bash write is Advise, not nothing edited`, `unrecognised Bash is Advise the same way an MCP write is`)

## Problem

`lastUnprovenWrite > lastPublish` has no `lastSuccessfulValidation` term. The mutation branch already has one (`unverifiedSince` / `verifiedAfterLastMutation`). ADR-047 put the mandated write path into that bucket: `mrw write --plan-file p.txt` is `unrecognised` and advances `lastUnprovenWrite`. Probe 2026-09-12 on HEAD `239980b`, importing `classifyCommand` / `analyzeTranscript` / `sessionStateNote` from working-tree `plugin/scripts/lifecycle.mjs`: `mrw write` then passing `npm test` is still FLAG (`lastSuccessfulValidation` 1, note: "UNPROVEN write since the last publish; no recognised check has proven it. Last check: `npm test` passed."). Same for `mcp__mrw__mrw_write`. Control: `sed -i` then the same passing check is SILENT. Publish still silences. The printed remedy is inert. Before ADR-047 the CLI path was silent; after, it is unclearable.

## Goal

A passing recognised check after the final UNPROVEN write silences Advise. A failing check does not. Publish still silences. Read / Grep still must not flag.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| adopting engineer | human role | running the project's check after `mrw write` (CLI or MCP) clears the advisory, the way it already does after `sed -i` |
| `analyzeTranscript` | system | already records `lastSuccessfulValidation`; the UNPROVEN Advise surfaces must read it |
| Stop / PreToolUse / `sessionStateNote` / wired statusline | system | Advise on lastUnprovenWrite only when that validation term has not passed after the write |

## Use Cases

### UC-1: A passing recognised check after the final UNPROVEN write silences Advise

- **Trigger:** an executed UNPROVEN write (`mcp__mrw__mrw_write`, `mcp__other__write`, or unrecognised Bash such as `mrw write --plan-file p.txt`) then a recognised project check · **Preconditions:** the hook can read the transcript; a project check exists so the surfaces have something to Advise
- **Main flow:**
  1. The write advances `lastUnprovenWrite`. Authorship UNPROVEN. `lastMutation` stays -1 (F-24).
  2. A recognised check runs after that write (`npm test`). `lastSuccessfulValidation` advances and equals `lastValidation`.
  3. Stop, `sessionStateNote`, the wired statusline, and PreToolUse commit advice are silent — the same way `sed -i` then the same passing check is silent today.
  4. A later successful this-project publish still silences (`lastUnprovenWrite <= lastPublish`).
- **Failure paths:**
  - a. at step 3, the UNPROVEN surfaces still key `(lastUnprovenWrite ?? -1) > lastPublish` with no validation term → passing check FLAGS, note asserts "no recognised check has proven it" while `Last check: npm test passed` (the live defect on 239980b).
  - b. at step 2, a failing check (`npm test` failed) → still FLAG (must not treat `lastValidation` alone as silence).
  - c. at step 1, Read / Grep / Glob / `mcp__mrw__mrw_read` → must not advance `lastUnprovenWrite` (KNOWN_NON_WRITE_TOOLS).
  - d. at step 3, set `lastMutation` for unrecognised / MCP so `unverifiedSince` piggybacks → F-24 rejected ("Set lastMutation without recording a path").
  - e. a green ADR-042 / ADR-047 test that only asserts FLAG with no following check → this fact stays dirty.
- **Postconditions:** passing recognised check after the final UNPROVEN write silences. Failing check does not. Publish still silences. Read / Grep stay silent. Mutation path (`sed -i`) is unchanged.

### UC-2: A write that did not succeed is not an UNPROVEN write a later check can prove

- **Trigger:** an MCP or unrecognised-Bash write returns `is_error` or a nonzero exit · **Preconditions:** F-1's validation term is what consumers will use
- **Main flow:**
  1. `mcp__mrw__mrw_write` or `mrw write --plan-file p.txt` runs and fails (`is_error: true`, or Bash `commandSucceeded` is false).
  2. `lastUnprovenWrite` does not advance. Authorship stays `none` unless a later successful UNPROVEN write exists.
  3. A later passing `npm test` does not "prove" a write that did not happen — surfaces stay silent because there was no UNPROVEN write, not because the check cleared one.
- **Failure paths:**
  - a. at step 1, `executed()` (`lifecycle.mjs:1892`) is true for `is_error` unless a hook blocked → lastUnprovenWrite advances on the failed write. After F-1, a passing check then SILENCES as if the write happened.
  - b. at step 1, only MCP is gated and failed Bash `mrw write` still advances — one arm of the mandated path stays a lie.
  - c. treating "no result yet" as failure → an in-flight write never becomes UNPROVEN (fail-open the other way).
- **Postconditions:** lastPublish already requires `commandSucceeded`. lastUnprovenWrite uses the same success test. A failed write plus a passing check is not the F-1 dirty case.

## Scenarios

### UC1-S1 [happy] a passing recognised check after mrw write or mcp write silences Advise [@implemented] → `tests/lifecycle.test.mjs::a passing recognised check after an UNPROVEN write silences Advise` cmd:`node --test --test-name-pattern 'a passing recognised check after an UNPROVEN write silences Advise' tests/lifecycle.test.mjs`

```gherkin
Given a repository that names a project check
And an executed Bash `mrw write --plan-file p.txt` (unrecognised) or `mcp__mrw__mrw_write`
And then an executed Bash `npm test` that passed
When analyzeTranscript reads the transcript
And Stop runs, sessionStateNote is written, or PreToolUse runs on Bash git commit
Then lastUnprovenWrite is that write, not -1
And lastSuccessfulValidation is after that write
And those surfaces do not Advise
And sed -i then the same passing check is still silent (control)
```

### UC1-S2 [failure] a failing check does not silence, and Read does not flag [@implemented] → `tests/lifecycle.test.mjs::a failing check after an UNPROVEN write still Advises, and Read does not flag` cmd:`node --test --test-name-pattern 'a failing check after an UNPROVEN write still Advises, and Read does not flag' tests/lifecycle.test.mjs`

```gherkin
Given an executed UNPROVEN write
When the following recognised check failed
Then Stop, sessionStateNote, the wired statusline, and PreToolUse still Advise
And Read or Grep then a passing check stay silent (KNOWN_NON_WRITE)
And a successful this-project git commit after the write still silences
And a test that only asserts FLAG with no following check does not satisfy F-1
```

### UC2-S1 [happy] a failed mrw write does not advance lastUnprovenWrite [@implemented] → `tests/lifecycle.test.mjs::a failed UNPROVEN write does not advance lastUnprovenWrite` cmd:`node --test --test-name-pattern 'a failed UNPROVEN write does not advance lastUnprovenWrite' tests/lifecycle.test.mjs`

```gherkin
Given an executed mcp__mrw__mrw_write or Bash mrw write with is_error true
When analyzeTranscript reads the transcript
Then lastUnprovenWrite is -1
And a later passing npm test does not Advise (there was no UNPROVEN write)
And a successful mrw write then a passing npm test still silences (F-1 control)
```

### UC2-S2 [failure] executed() treating is_error as a write lets F-1 prove a miss [@implemented] → `tests/lifecycle.test.mjs::a failed UNPROVEN write does not advance lastUnprovenWrite` cmd:`node --test --test-name-pattern 'a failed UNPROVEN write does not advance lastUnprovenWrite' tests/lifecycle.test.mjs`

```gherkin
Given F-1 is implemented
And mcp__mrw__mrw_write or mrw write failed (is_error, not hook-blocked)
And then npm test passed
When Stop or sessionStateNote runs
Then lastUnprovenWrite must not be the failed write
And the surfaces must not claim a recognised check proved that write
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | Accepted. Class: any executed write that advances `lastUnprovenWrite` — not "an MCP tool". Members enumerated 2026-09-12 on HEAD `239980b` by importing `classifyCommand` / `analyzeTranscript` / `sessionStateNote` from working-tree `plugin/scripts/lifecycle.mjs`: `mcp__mrw__mrw_write`, `mcp__other__write` (unknown non-Bash; `KNOWN_NON_WRITE_TOOLS` is Read/Grep/Glob/WebSearch/WebFetch/Task/TodoWrite/Skill/Agent/`mcp__mrw__mrw_read`); unrecognised Bash (`classifyCommand` `mrw write --plan-file p.txt` / `comby` / made-up in-place editors / `Remove-Item` — ADR-047). Current: `lastSuccessfulValidation` is recorded (`analyzeTranscript` lifecycle.mjs:1868, :1960) and clears the mutation branch (`unverifiedSince` :1994–1996, `verifiedAfterLastMutation` :1974–1976). UNPROVEN Advise ignores it: `sessionStateNote` :3441, PreToolUse :4175, Stop :4205, `statusline.mjs:67` all key `(lastUnprovenWrite ?? -1) > lastPublish`. Probe: `mrw write` then passing `npm test` → FLAG, `lastSuccessfulValidation` 1, note "UNPROVEN write since the last publish; no recognised check has proven it. Last check: `npm test` passed." Same for `mcp__mrw__mrw_write`. Control: `sed -i` then the same passing check → SILENT (`unverifiedSince` false). `mrw write` then failing `npm test` → FLAG. Read / Grep → `lastUnprovenWrite` -1, status `neutral`. `git commit` after the write → `lastPublish` advances, SILENT. After: the UNPROVEN branch uses the same validation term the mutation branch already has — a passing recognised check after the final UNPROVEN write silences; a failing check does not (`lastSuccessfulValidation === lastValidation`); publish still silences (`lastUnprovenWrite > lastPublish`). Do not set `lastMutation` for these writes (F-24). Why it can fail: (1) a green `an unknown non-Bash write is Advise` / `unrecognised Bash is Advise` test with no following check stays green. (2) `lastValidation` advances on a failed check and is treated as silence. (3) piggyback `unverifiedSince` by recording a path-less `lastMutation`. | `tests/lifecycle.test.mjs::a passing recognised check after an UNPROVEN write silences Advise` | @spec | `node --test --test-name-pattern 'a passing recognised check after an UNPROVEN write silences Advise' tests/lifecycle.test.mjs` |
| F-2 | Accepted. Class: an UNPROVEN-shaped tool_use that did not succeed. Members: MCP `is_error: true` (not hook-blocked); Bash unrecognised with `commandSucceeded` false (`lifecycle.mjs:672` — `is_error`, `interrupted`, or nonzero `exit_code`). Current: `executed()` (`:1892–1898`) returns true for `is_error` unless the result names a hook block, so both lastUnprovenWrite arms (`:1940` unrecognised Bash, `:1964` unknown non-Bash) advance on a failed write. lastPublish already requires `commandSucceeded` (`:1947`). After F-1, a failed write then a passing check SILENCES as if the write happened. After: lastUnprovenWrite advances only when the write succeeded — the same success test lastPublish already uses. A failed write plus a passing check is not F-1's dirty case. Why it can fail: F-1 implemented as `lastSuccessfulValidation > lastUnprovenWrite` while `executed()` still treats `is_error` as a write. Gating only MCP. Treating missing result as failure (in-flight never UNPROVEN). | `tests/lifecycle.test.mjs::a failed UNPROVEN write does not advance lastUnprovenWrite` | @spec | `node --test --test-name-pattern 'a failed UNPROVEN write does not advance lastUnprovenWrite' tests/lifecycle.test.mjs` |

## Domain

**UNPROVEN write** = `lastUnprovenWrite` advances; authorship UNPROVEN; `lastMutation` stays -1 (ADR-042 F-24). **validation term** = a recognised check passed after that write (`lastSuccessfulValidation` after the write, and `lastSuccessfulValidation === lastValidation`) — the term `unverifiedSince` already uses for `lastMutation`. **publish term** = `lastUnprovenWrite > lastPublish` (ADR-042 T3 / T4). Both must hold for Advise; either silence is enough. **neither** / Read / Grep are not this class.

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `sessionStateNote` (lifecycle.mjs:3441) `unprovenWrite = (lastUnprovenWrite ?? -1) > lastPublish` | AND the mutation branch's validation term | compact SessionStart, SessionEnd |
| PreToolUse commit advice (lifecycle.mjs:4175) | same | Bash `git commit` |
| Stop (lifecycle.mjs:4205) | same | completion systemMessage |
| `statusline.mjs` `reading()` (:67) | same | user-wired statusline |
| `analyzeTranscript` `lastSuccessfulValidation` / `lastUnprovenWrite` | F-1: consumers AND the mutation validation term. F-2: lastUnprovenWrite arms (`:1940`, `:1964`) only on success (`commandSucceeded` `:672`), not `executed()` is_error | the four surfaces |
| `classifyCommand` / MEASURED_FAMILIES / `KNOWN_NON_WRITE_TOOLS` | none | not this fact |

## Non-Goals

- Unreadable named-path open / chmod 000 traceback (docs/specs/2026-09-12-unreadable-file-is-could-not-run.md). Not this class.
- UNPROVEN / mutation Advise inventing changed paths or "the transcript contains file mutations" for a command the classifier did not prove wrote (`node --version` is `mutation` via interpreter name; `ps aux` / `curl -s` are `unrecognised` with empty `mutationPaths`). Sibling leftover of ADR-047, not F-1.
- Writing subcommands of a measured family (`ruff format` / `eslint --fix` classify `validation`; `go fmt` / `dotnet format` / `npm run format` / `yarn format` are `neither`). Later spec: subcommand of a measured family. Not F-1.
- Making unrecognised into mutation. ADR-047's after stands.
- A full PowerShell / cmd mutation grammar.
- Changing Read / Grep / Glob into writes.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Green ADR-042 / ADR-047 FLAG tests with no following check | High | High | UC1-S2: that green is not this fact. Dirty case is UNPROVEN write + passing check → silent |
| `lastValidation` (a check ran) treated as silence | High | High | term is `lastSuccessfulValidation === lastValidation`, as the mutation branch |
| Record `lastMutation` for unrecognised / MCP | Med | High | F-24 rejected it; `lastMutation` stays -1; mutationPaths stay empty |
| Folding chmod-000 or Cost 2 message-honesty into this fact | High | Med | Non-Goals. A green F-1 here does not close those |

## Open Questions

<!-- F-1 and F-2 Accepted 2026-09-12. This spec can stop. Leftovers: Cost 2 (message invents changed paths) and Cost 1 (measured-family writing subcommands) — sibling specs. chmod-000 is docs/specs/2026-09-12-unreadable-file-is-could-not-run.md. -->

## Verify

```bash
python3 plugin/bin/spec-verify --spec docs/specs/2026-09-12-unproven-write-has-a-validation-term.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | Does a passing recognised check after the final UNPROVEN write silence Advise the way it already does after a recognised mutation, or does lastUnprovenWrite stay uncleared until publish? | F-1 | Accepted. After: same validation term as the mutation branch. Failing check does not silence. Publish still does. Read/Grep must not flag. Both mrw arms (CLI unrecognised, MCP unknown). Control: sed -i + passing npm test. |
| 2 | Does a failed UNPROVEN-shaped write (`is_error` / nonzero exit) still advance lastUnprovenWrite, so F-1's passing check "proves" a write that did not happen? | F-2 | Accepted. After: lastUnprovenWrite only on success, same test as lastPublish (`commandSucceeded`). |
