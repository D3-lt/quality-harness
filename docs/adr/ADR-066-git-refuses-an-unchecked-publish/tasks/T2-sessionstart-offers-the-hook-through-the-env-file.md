# Task ADR-066-T2: SessionStart offers the hook through the environment file

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one module and its tests)
**Owner:** unassigned
**Produces:** `GIT_CONFIG_*` exports in `CLAUDE_ENV_FILE`; `publish.offered` / `publish.unarmed`
**Consumes:** `publishVerdict()`, `publish-hook.mjs`, `publish.hook-ran` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the probe decides the offer`, `the index is taken when the file is sourced`, `enabled beats a repo-local disable`

## Goal

At SessionStart, when `CLAUDE_ENV_FILE` is set, git run in the session's repository is probed for config-based hooks. If it names the probe hook, append exports that add `hook.qh-publish`:
- `command`, the `prepare-commit-msg` and `pre-push` events, and `enabled=true`;
- indexed by a shell expansion over the `GIT_CONFIG_COUNT` in force when the file is sourced;
- not appended when the file already carries them.

Record `publish.offered`, or `publish.unarmed` with the probe's answer.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `offerPublishHook({ env, run, file })`, called from SessionStart; the two log events |
| `plugin/hooks/hooks.json` | read | SessionStart already runs `lifecycle.mjs`, which selects this; no new registration |
| `tests/publish-hook.test.mjs` | edit | the tests below |
| `tests/mutations.json` | edit | mutants |

## Ordered Steps

1. [S1] Write the tests below and see each fail on an assertion (TDD red).
2. [S2] Add `offerPublishHook`:
   - probe with `git -c hook.qhprobe.command=true -c hook.qhprobe.event=pre-commit hook list pre-commit`, run in the session's repository;
   - on a named `qhprobe`, append POSIX exports that read the current `GIT_CONFIG_COUNT` (default 0), add four entries after it, and raise the count;
   - skip when the file already names `hook.qh-publish`.
3. [S3] Call it from SessionStart. Record `publish.offered`, or `publish.unarmed` with the reason: no env file, no repository, or the probe's answer.
4. [S4] Run the fence green, and record mutants with `adr-verify --mutant`:
   - start indices at 0;
   - offer without the probe;
   - drop `enabled=true`;
   - append twice.
   [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/publish-hook.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (sessionstart offers the hook only where git runs config hooks|an existing GIT_CONFIG_COUNT keeps its entries|the sourced env file makes git run the hook over a repo-local disable)' | grep -qx 3
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `sessionstart offers the hook only where git runs config hooks` | `tests/publish-hook.test.mjs` | a `run` seam whose probe names `qhprobe` appends the exports and logs `publish.offered`; one that does not (the clean twin) appends nothing and logs `publish.unarmed` with the reason; no `CLAUDE_ENV_FILE` is unarmed | none | S1, S2, S3 |
| `an existing GIT_CONFIG_COUNT keeps its entries` | `tests/publish-hook.test.mjs` | sourcing the file under `GIT_CONFIG_COUNT=1` leaves key 0 intact and makes ours keys 1-4; a second SessionStart appends nothing | none | S1, S2 |
| `the sourced env file makes git run the hook over a repo-local disable` | `tests/publish-hook.test.mjs` | in `sh`, sourcing the file makes `git hook list prepare-commit-msg` name `qh-publish` in a temporary repository whose local config sets `hook.qh-publish.enabled false` | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `offerPublishHook` |
| 2 — something selects it | SessionStart; the "offer without the probe" mutant |
| 3 — the caller can discover it | `publish.offered` / `publish.unarmed` in the session log |
| 4 — it is used | `publish.hook-ran` from T1, per session |

## Mutation Log

## Invariants

- Nothing is written into any repository.
- An offer is not arming; T3 reads only `publish.hook-ran`.

## Risks

- A probe run outside a repository reads as unsupported; it runs in the session's repository, and `publish.unarmed` names which reason applied.

## Stop Condition

Stop and ask if a live Claude Code Bash call does not see the exports after SessionStart (checked in T3 S5).

## Out of Scope

- PowerShell sessions (deferred: docs/BACKLOG.md §301, the remaining text refusal)

## Verification Log
