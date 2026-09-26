# Task ADR-066-T3: Rule P leaves only a plain invocation to an armed session's git

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** S (one module, its tests and two documents)
**Owner:** unassigned
**Produces:** rule P's armed behaviour; `leavesHookInPlace()`
**Consumes:** `publishVerdict()`, `publish-hook.mjs`, `publish.hook-ran` (T1); the exports and `publish.offered` (T2)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `armed means the hook ran`, `only a plain invocation is advised`, `PowerShell and unarmed are unchanged`, `the reviewer guard is unchanged`

## Goal

Rule P advises instead of denying only when all three hold:
- the session log holds `publish.hook-ran`;
- the tool is Bash;
- `leavesHookInPlace(command)` proves the matched invocation keeps the hook: no `-c hook.*`, no `-c core.hooksPath`, no `GIT_CONFIG*`, `env` or `unset` in the command, no `--no-v…` on a push, and no `n` in a bundled short-option cluster of a commit.

Everything else keeps ADR-061's deny, row for row. CLAUDE.md §3 and the operating skill name the git event.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `leavesHookInPlace`; rule P reads `publish.hook-ran` and `tool_name` |
| `tests/publish-command.test.mjs` | edit | armed tables over the existing rows and the escape rows |
| `tests/mutations.json` | edit | mutants |
| `CLAUDE.md` | edit | §3's sanctioned refusal includes the git event (ADR-066 Invalidates) |
| `plugin/skills/operating/SKILL.md` | edit | the refusal's description names where it is decided when armed |

## Ordered Steps

1. [S1] Write the tests below and see each fail on an assertion (TDD red).
2. [S2] Add `leavesHookInPlace`. In rule P, compute `deny` as today, then clear it only when the session is armed, the tool is Bash, and the predicate holds. The advice says git decides at the event.
3. [S3] Amend CLAUDE.md §3 and the operating skill. [proof: human: §3 and the operating skill's refusal section read against the armed and unarmed behaviour]
4. [S4] Run the fence green, and record mutants with `adr-verify --mutant`:
   - arm on `publish.offered`;
   - drop the Bash check;
   - let `-c hook.` through the predicate;
   - let a bundled `n` through.
   [proof: mutation]
5. [S5] In one live Claude Code session, confirm by hand:
   - an unchecked `git commit` is refused by git, and `publish.hook-ran` is logged;
   - a `!`-mode `git commit` meets the same verdict.

   Record both in the sign-off. [proof: human: a live armed session's refusal from git, and what a `!`-mode commit met]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/publish-command.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (an armed session leaves a plain invocation to git|an armed session still refuses every form that can disable the hook|PowerShell, an offered-only session and the reviewer guard are unchanged)' | grep -qx 3
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an armed session leaves a plain invocation to git` | `tests/publish-command.test.mjs` | with `publish.hook-ran` and the Bash tool, the plain PUBLISHES rows and every KNOWN_FALSE_REFUSALS row yield advice and no deny | none | S1, S2 |
| `an armed session still refuses every form that can disable the hook` | `tests/publish-command.test.mjs` | these are denied on an unchecked tree when armed, and allowed on a checked one (the clean twin): `-c hook.qh-publish.enabled=false`, `.command=true`, `.event=`, `-c core.hooksPath=…`, `env GIT_CONFIG_COUNT=0`, `unset CLAUDE_CODE_SESSION_ID;`, `git push --no-verif`, `git commit -anm m` | none | S1, S2 |
| `PowerShell, an offered-only session and the reviewer guard are unchanged` | `tests/publish-command.test.mjs` | the existing verdicts are unchanged under the PowerShell tool when armed, with `publish.offered` but no `publish.hook-ran`, and for a read-only role | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `leavesHookInPlace`, the armed branch of rule P |
| 2 — something selects it | `publish.hook-ran` from T1; the "arm on `publish.offered`" mutant |
| 3 — the caller can discover it | CLAUDE.md §3, the operating skill, the advice text |
| 4 — it is used | S5's live confirmation, and the `publish.hook-ran` counts |

## Mutation Log

## Invariants

- Unarmed, PowerShell and reviewer-guard behaviour is ADR-060's and ADR-061's, row for row.
- An armed session is advised only on a form that cannot have disabled the hook.

## Risks

- `leavesHookInPlace` is itself a classifier over text. Its errors fail CLOSED: an unrecognised form keeps the deny (CLAUDE.md §16).

## Stop Condition

Stop and ask if S5 shows a live Bash call where the hook did not run.

## Out of Scope

- Removing the text refusal (deferred: docs/BACKLOG.md §301, the remaining text refusal)

## Verification Log
