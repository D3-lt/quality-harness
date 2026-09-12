# Task ADR-049-T2: Dispatcher UNPROVEN at mapped could-not-run, not not satisfied

**Depends-on:** T1
**Covers:** F-2, UC3-S1, UC3-S2
**Estimated scope:** S (dispatcher test plus catalogue)
**Owner:** zy
**Produces:** none
**Consumes:** mapped could-not-run codes (2/4/1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `unrun_exit maps adr-lint`

## Goal

When facts-gate-dispatch.sh name-matches a chmod-000 `ADR-*.md` and the spawned gate returns its mapped could-not-run code, the dispatcher prints UNPROVEN, not "adr-lint is not satisfied … Fix the artifact". Unreadable postmortem stays the control. Traceback-at-1 is T1, not this task.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/gates.test.mjs` | edit | chmod-000 ADR-*.md through `run-shell-hook.mjs` + `facts-gate-dispatch.sh` |
| `tests/mutations.json` | edit | drop `adr-lint` from `unrun_exit` |

## Ordered Steps

1. [S1] Confirm the failing test for `Covers:` IDs exists and is red. [proof: acceptance]
2. [S2] After T1 maps adr-lint to 2, the existing `unrun_exit` table must print UNPROVEN for chmod-000 ADR-*.md. Do not treat traceback-at-1 as UNPROVEN. Do not move `[ ! -r ]` before name-match. [proof: acceptance]
3. [S3] Catalogue a mutant that drops `adr-lint` from `unrun_exit`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'chmod-000 ADR-\*\.md is UNPROVEN through the dispatcher|postmortem-verify on a path it cannot read' tests/gates.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `chmod-000 ADR-*.md is UNPROVEN through the dispatcher, not not satisfied` | `tests/gates.test.mjs` | name-matched unreadable ADR is UNPROVEN at mapped 2, not "not satisfied" | F-2, UC3-S2 | S1, S2 |
| `postmortem-verify on a path it cannot read exits could-not-run, and the dispatcher relays it as UNPROVEN` | `tests/gates.test.mjs` | control stays UNPROVEN at mapped 2 | UC3-S1 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | F-2 dispatcher test |
| 2 — something selects it | `unrun_exit` maps adr-lint → 2; mutant drops adr-lint from that case |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | PostToolUse / commit additionalContext is the served path |

## Mutation Log
- 2026-09-12 · 022e9ce* · mutant killed · exit 1 · `plugin/scripts/facts-gate-dispatch.sh` · drops adr-lint from unrun_exit so chmod-000 ADR-*.md is not satisfied at traceback-1 again · acceptance-sha256:60278f014341921539863d3e9e9e40970f7ef7f6d81ab5276f5e3bb1d04fd224 · covers:unrun_exit maps adr-lint

## Invariants

- Mapped 2/4 is UNPROVEN. Exit 1 that is a finding stays "not satisfied".
- A green nolib test (ADR-046 T1) does not satisfy F-2.
- Miss-path `[ ! -r ]` is unchanged.

## Risks

- Treating traceback-at-1 as UNPROVEN swallows a real finding.
- Binding only CLI `python3 plugin/bin/adr-lint` while the dispatcher stays "not satisfied".

## Stop Condition

chmod-000 ADR-*.md still prints "not satisfied … Fix the artifact", or a real finding at exit 1 becomes UNPROVEN.

## Out of Scope

- Wrapping the named-path open (T1)
- Pre-open `[ ! -r ]` before name-match
- Dispatcher mapping for adr-judge

## Verification Log
- 2026-09-12 · 022e9ce* · exit 0 · `node --test --test-name-pattern 'chmod-000 ADR-\*\.md is UNPROVEN through the dispatcher|postmortem-verify on a path it cannot read' tests/gates.test.mjs` · acceptance-sha256:60278f014341921539863d3e9e9e40970f7ef7f6d81ab5276f5e3bb1d04fd224 · ms:393
