# ADR-047: An unrecognised command is UNPROVEN

**Status:** Accepted
**Date:** 2026-09-12
**Owner:** zy
**Spec:** `docs/specs/2026-09-12-unrecognised-command-is-unproven.md`
**Cross-references:** ADR-005, ADR-041, ADR-042, `CLAUDE.md`, `plugin/scripts/lifecycle.mjs`, `plugin/scripts/classify-command.mjs`, `tests/classify.test.mjs`
**Governs:** `plugin/scripts/classify-command.mjs`, `plugin/scripts/lifecycle.mjs`, `tests/classify.test.mjs`, `tests/lifecycle.test.mjs`, `tests/reviewer-guard.test.mjs`, `tests/mutations.json`

Class: a Bash command whose executable family the POSIX denylist / validation patterns / nested-shell peel do not cover. Enumerated 2026-09-12 with `rg -n "export function isPotentialMutationCommand|export function isValidationCommand|export function classifyCommand|function bashVerdict|lastUnprovenWrite = |function nestedShellScript|FOREIGN_SHELL_FAMILIES" plugin/scripts/lifecycle.mjs plugin/scripts/classify-command.mjs` and `git ls-files -- plugin/scripts/lifecycle.mjs plugin/scripts/classify-command.mjs tests/classify.test.mjs tests/lifecycle.test.mjs tests/reviewer-guard.test.mjs tests/mutations.json`:

```
plugin/scripts/classify-command.mjs:17:export const FOREIGN_SHELL_FAMILIES = new Set(['pwsh', 'powershell', 'cmd'])
plugin/scripts/classify-command.mjs:48:export function classifyCommand(command, hooks, depth = 0) {
plugin/scripts/lifecycle.mjs:600:function nestedShellScript(command) {
plugin/scripts/lifecycle.mjs:887:export function isValidationCommand(command) {
plugin/scripts/lifecycle.mjs:1100:export function isPotentialMutationCommand(command) {
plugin/scripts/lifecycle.mjs:1124:export function classifyCommand(command) {
plugin/scripts/lifecycle.mjs:1880:  let lastUnprovenWrite = -1
plugin/scripts/lifecycle.mjs:1941:        lastUnprovenWrite = Math.max(lastUnprovenWrite, use.position)
plugin/scripts/lifecycle.mjs:1966:      lastUnprovenWrite = Math.max(lastUnprovenWrite, use.position)
plugin/scripts/lifecycle.mjs:3933:function bashVerdict(command, cwd, depth = 0) {
```

```
plugin/scripts/classify-command.mjs
plugin/scripts/lifecycle.mjs
tests/classify.test.mjs
tests/lifecycle.test.mjs
tests/mutations.json
tests/reviewer-guard.test.mjs
```

Members in: four-way `classifyCommand`; Session `lastUnprovenWrite` for executed unrecognised Bash; `bashVerdict` deny of `unrecognised`; `nestedShellScript` POSIX five-name set. Members left out: `bashMarkdownMutationPaths` / `bashDeletionMutationPaths` / path helpers / publish-boundary (architecture: do not extract); a PowerShell/cmd mutation grammar; `is_error` as UNPROVEN write; MCP write + passing check (sibling spec).

**Enforced-by:** `tests/classify.test.mjs::recognised POSIX rm is mutation and selftest is validation`, `tests/classify.test.mjs::an unrecognised PowerShell or cmd write is not neither`, `tests/classify.test.mjs::pwsh or cmd with POSIX letters in the payload is unrecognised, not mutation`, `tests/lifecycle.test.mjs::unrecognised Bash is Advise the same way an MCP write is`, `tests/reviewer-guard.test.mjs::a reviewer is denied Remove-Item and pwsh -Command rm`
**Invalidates:** none — checked (does not reverse ADR-041's echo/ls peel; does not reverse ADR-042's MCP UNPROVEN). Extends `lastUnprovenWrite` to executed unrecognised Bash.
**Served-path change:** Stop / `sessionStateNote` / the wired statusline / PreToolUse on Bash `git commit` Advise after an executed unrecognised Bash command; a read-only reviewer is denied `Remove-Item` and `pwsh -Command rm`.

## Context

Inherited from `docs/specs/2026-09-12-unrecognised-command-is-unproven.md` §Problem / §Goal. Measured 2026-09-12 on `624d23d`: `false` plus `false` was `neither`; Session treated that as a write that did not happen. `Remove-Item` was silent; `pwsh -Command rm` was mutation via substring `rm`.

Debt at authoring (`python3 plugin/bin/adr-debt docs/adr`): none of the deferred rows or open follow-ups is this four-way classify. ADR-041's leftover unknown `neither` verbs stay unpeeled. Not pulled in.

## Existing Primitives Audit

- `isPotentialMutationCommand` / `isValidationCommand` — **reshape** into a four-way result. The booleans stay; Session and the reviewer read `classifyCommand`.
- `commandInvocation` / `executableName` / `nestedShellScript` / `shellSegments` / `withoutHeredocBodies` — **reuse.** Not extracted.
- `lastUnprovenWrite` / Stop / `sessionStateNote` / `reading()` / PreToolUse commit advice — **reshape.** Same scalar `mcp__mrw__mrw_write` already sets.
- `bashVerdict` / `readOnlyVerdict` — **reshape.** Deny `unrecognised` before the mutation boolean.
- `isKnownProbePrefix` — **reshape.** Must not peel `unrecognised` as a known probe.

## Decision

**A Bash command whose executable family is not in a measured set is `unrecognised`. Session treats that as UNPROVEN, not as a known non-write. Family is the executable, not a denylist substring. The reviewer denies `unrecognised`.**

1. `classifyCommand` returns `mutation | validation | neither | unrecognised`. Foreign families (`pwsh`, `powershell`, `cmd`, including `.exe` stripped) are unrecognised before the mutation boolean. POSIX nested-shell `-c` bodies are classified as their own command. `gh` is in the measured set because `tests/lifecycle.test.mjs` already executed `gh release list >&2` as a non-mutation (CLAUDE.md §16).
2. Executed unrecognised Bash advances `lastUnprovenWrite` the same way `mcp__mrw__mrw_write` does. Isolated `echo` / `ls` stay `neither` and do not. Recognised POSIX `rm` stays `lastMutation`.
3. `pwsh -Command rm` and `cmd /c rmdir` are unrecognised, not mutation. POSIX `rm` as the executable stays mutation. `zsh -c "echo ${#files}"` is neither — not a recognised-zsh mutation claim.
4. `bashVerdict` denies `unrecognised`. `echo` and `bash scripts/selftest.sh` stay allowed. POSIX `rm` stays denied. F-3 must not flip `pwsh -Command rm` from deny to allow.

## Alternatives Considered

- **Collapse `false` plus `false` to `unrecognised` while leaving the substring denylist first.** Rejected: `pwsh -Command rm` stays mutation; F-2 never sees it (the live F-3 defect).
- **Add `Remove-Item` to the POSIX denylist.** Rejected: typed from memory; does not classify `pwsh` / `cmd` (CLAUDE.md §16).
- **A full PowerShell / cmd mutation grammar.** Rejected: Non-Goal. Those families are unrecognised, not parsed.
- **Extract path helpers / publish-boundary with this module.** Rejected: architecture for this ADR is Session-internal classify plus maps.

## Component / Boundary Impact

| Component | Ownership after change | Why it changes |
|-----------|------------------------|----------------|
| `classify-command.mjs` | Session classify | four-way result; family is the executable |
| `lifecycle.mjs` `analyzeTranscript` | Session authorship | unrecognised Bash is UNPROVEN |
| `lifecycle.mjs` `bashVerdict` | reviewer guard | unrecognised is deny |
| Stop / PreToolUse / `sessionStateNote` / `reading()` | Session evidence | already read `lastUnprovenWrite`; now see Bash |

None — internal to Session. No Module Map file in this repository; no architecture doc to update.

## Wiring & Contract Changes

Inherited from the spec §Contracts Touched; delta: `plugin/scripts/classify-command.mjs` is the four-way module; `lifecycle.mjs` binds hooks and maps `unrecognised`.

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `classifyCommand` four-way result | T1 | T2, T3, T4 | No — new symbol |
| family-first classify (foreign executable) | T2 | T4 | No — T4 must not allow `pwsh -Command rm` |

## Implementation

See `docs/adr/ADR-047-an-unrecognised-command-is-unproven/tasks/README.md`.

## Consequences

- **Positive:** a PowerShell or cmd write is UNPROVEN / reviewer-denied, not silent "nothing happened".
- **Negative:** an unmeasured executable that is actually read-only Advises and is denied in a reviewer role (fail-closed).
- **Neutral:** `isPotentialMutationCommand('pwsh -Command rm')` stays true; Session and the reviewer must not key that boolean alone.

## Out of Scope

Inherited from the spec §Non-Goals; delta: none.

- A full PowerShell / cmd mutation grammar (permanent: boundary: those families are unrecognised, not parsed)
- Peeling every `neither` verb as known read-only (permanent: boundary: ADR-041; CLAUDE.md §16)
- Compound `git commit; echo done` (permanent: boundary: Non-Goal)
- Extracting path helpers, `bash*MutationPaths`, or the publish-boundary (permanent: boundary: architecture of this ADR)
- A passing recognised check clearing an MCP UNPROVEN write (permanent: boundary: sibling spec; `lastUnprovenWrite` has no validation term)
- An `is_error` / failed Bash command becoming an UNPROVEN write (permanent: boundary: Non-Goal; `executed()` is a different edge)

## Risks

Inherited from the spec §Risks; delta: none.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A POSIX regex on `rm` / `rmdir` "recognises" a PowerShell or cmd write | High | High | Family first. F-3 tests `pwsh -Command rm` and `cmd /c rmdir`. |
| A "recognised zsh" test that only feeds `zsh -c "rm …"` | High | High | `zsh -c "echo ${#files}"` stays in the class. |
| `bashVerdict` keeps the boolean and F-3 flips deny to allow | Med | High | F-4 denies `unrecognised`; CLI and hook tests include `pwsh -Command rm`. |
| A green F-1 classify test while Stop stays silent | High | High | F-2 binds `lastUnprovenWrite` and the Advise surfaces. |

## Rollback

Remove the `classify-command.mjs` import and the unrecognised maps in `analyzeTranscript` / `bashVerdict`. No persistent state.

## Follow-ups

- [ ]
