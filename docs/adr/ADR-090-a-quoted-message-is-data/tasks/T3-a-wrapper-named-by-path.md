# Task ADR-090-T3: a wrapper named by its absolute path is that wrapper

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one function in one file, its tests and a campaign entry)
**Owner:** unassigned
**Produces:** `programIndex` matching its wrappers by `programName` for an absolute path
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a wrapper named by an absolute path is read as that wrapper`, `a relative path is not a wrapper`

## Goal

`/usr/bin/env git push`, and every other wrapper `programIndex` knows when written as an absolute path, is the
publish it runs and is refused on an unchecked tree; a relative path or a look-alike name stays a mention.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `programIndex` (`:3800`): compare `programName(word)` when `word` is an absolute path; `publishInCommand` (`:4193`) calls it and is what selects it |
| `tests/publish-command.test.mjs` | edit | two new tests beside the locks |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Run `python3 scripts/test-locks.py tests/publish-command.test.mjs`, then write the two tests and
   record the red run (TDD red). Red today: `publishCommandIn('/usr/bin/env git push')` is null (measured
   2026-10-06 at 73f930f).
2. [S2] In `programIndex`, read an absolute-path word (POSIX `/…`, and a Windows drive path, normalised as
   CLAUDE.md §7 asks) by its `programName` for `exec`, `nohup`, `doas`, `command`, `time`, `nice`, `sudo`,
   `timeout`, `xargs` and `env`. A relative path is unchanged.
3. [S3] Record one killed mutant per Rests-on name and add each to `tests/mutations.json`: one that drops the
   absolute-path reading (the refusal test goes red), and one that reads any path by its name (the `./env`
   row goes red). The fence's first segment only runs the suite; its two checks are the two tests, one per
   Rests-on name, so the third segment adr-lint counts rests on no mechanism of its own. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/publish-command.test.mjs 2>&1) \
  && for t in 'a wrapper named by its absolute path runs the publish it wraps' 'a relative path or a look-alike wrapper name stays a mention'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a wrapper named by its absolute path runs the publish it wraps` | `tests/publish-command.test.mjs` | unarmed and unchecked, each is `deny` and names `git push`: `/usr/bin/env git push`, `/usr/bin/env -- git push` (csn behavioral-contract-cases.ts:591, :603), `/usr/bin/env -S "git push"`, `/bin/env git push`, `/usr/bin/sudo git push`, `/usr/bin/time git push`, `/usr/bin/nice git push`, `/usr/bin/nohup git push`. The `env`, `time` and `nice` rows also run under bash with a recording stand-in `git` on `PATH`, which must record `push`; `sudo` is lexed only, never executed (ADR-067 Decision 2). CLEAN twin: after `qh-check`, none is `deny` | none | S1, S2 |
| `a relative path or a look-alike wrapper name stays a mention` | `tests/publish-command.test.mjs` | unarmed and unchecked, none is `deny`: `./env git push`, `/usr/bin/envsubst git push`, `echo /usr/bin/env git push` | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `publishInCommand` calls `programIndex` for every command; the refusal test drives the real PreToolUse hook |
| 3 — the caller can discover it | n/a: no declared interface — the effect is the PreToolUse decision |
| 4 — it is used | nothing measures this yet |

## Mutation Log

## Invariants

- A relative path is never read as a wrapper.
- A bare wrapper word is read exactly as today.

## Risks

- A program the user installed at an absolute path named like a wrapper, which does not run its arguments:
  refused on an unchecked tree, the conservative side; ADR-090 Risks names it.

## Stop Condition

Stop and ask if any data row is `deny`, or if a test the steps edit has become locked.

## Out of Scope

- Wrappers the classifier does not model (`find -exec`, `parallel`) — ADR-090 Out of Scope.

## Verification Log
