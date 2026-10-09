# Task ADR-094-T4: a write outside the repository is not an unseen write

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one predicate, its callers and tests)
**Owner:** unassigned
**Produces:** `unobservableWrites(log, root)` — counts only writes the repository could have been changed by
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `an absolute path outside the root is not an unseen write`, `a relative or unplaceable path still is`, `the previous-session notice does not count an outside write`

## Goal

`unobservableWrites` skips an absolute `file.written` path outside the repository's root, as `unseenWriteSince` already does, so a write to a scratchpad no longer counts as work the check has not seen.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `unobservableWrites(log, root)` (`:6315`) uses `outsideRoot` (`:807`); every caller passes the root; the comment at `:5299-5304`, which records the opposite decision, is corrected |
| `tests/outside-root-writes.test.mjs` | add | two tests |
| `tests/mutations/plugin/scripts/lifecycle.mjs.json` | edit | two entries, one per `Rests-on` name |
| `tests/lifecycle.test.mjs` | edit | the two ADR-068 T2 tests that used a path outside the repository as their "write git cannot see" (`SessionEnd records what was left unverified, and the next startup here says so`; `EVIDENCE-LIMITED opens the completion gate only with a stated reason, and only over docs`) use an ignored file inside the tree; the first also writes outside the repository and asserts it is not counted. Owner decision, 2026-10-09: "Keep T4 and relock" |
| `docs/adr/ADR-068-git-refuses-in-a-linked-worktree-and-says-when-it-is-armed/tasks/T2-sessionstart-says-git-not-armed.md` | edit | its lock snapshot is re-recorded by `adr-verify --relock --replace-hashes` (appended to its Verification Log by the tool) |

## Ordered Steps

1. [S1] Write the two tests of the Tests table and record the red run (TDD red). Red today: the outside write is counted.
2. [S2] Reproduce before changing code: run a Write to a path outside the repository with the PostToolUse hook on, read the session log, and record whether `file.written` was appended with `observable: false` and what `previousSessionNotice` counts. Time the hook for an inside and an outside path on this machine. If the cost does not reproduce, say so in the sign-off: the Windows figure stays UNPROVEN until the outside run. [proof: human: the reproduction run and its timings are in the sign-off line]
3. [S3] Pass the root to `unobservableWrites` at every caller (enumerate them with `mrw read --grep 'unobservableWrites' plugin tests` and put the command and the count in the sign-off), skip an absolute path outside the root, and keep a relative or unplaceable path counted.
4. [S4] Record two killed mutants: drop the skip; make an unplaceable path skip as well. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/outside-root-writes.test.mjs 2>&1) \
  && for t in 'an absolute write outside the repository is not counted as unseen' 'a relative or unplaceable write path is still counted as unseen'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an absolute write outside the repository is not counted as unseen` | `tests/outside-root-writes.test.mjs` | a log with a `file.written` entry for a scratchpad path and `observable: false` gives zero, and the previous-session notice does not mention it; a path through a symlinked temp directory (`/tmp` resolves to `/private/tmp`) is placed correctly | none | S1, S3 |
| `a relative or unplaceable write path is still counted as unseen` | `tests/outside-root-writes.test.mjs` | the dirty twin: a relative path, a missing path and a path inside the root stay counted | none | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `previousSessionNotice` and the completion advice call `unobservableWrites`; dropping the skip turns the first test red |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | the three Windows sessions' counts after the change (the outside run); nothing measures this yet |

## Mutation Log
- 2026-10-09 · 6d54fa17* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · drops the outside-root skip, so a scratchpad write is counted as unseen again · acceptance-sha256:1e187092184d7382c347e9eef8c4290a2e80428df3e9fcffb91e99c78b4302ad · covers:an absolute path outside the root is not an unseen write
- 2026-10-09 · 6d54fa17* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · skips an unplaceable path as if it were outside, so a path nobody could place stops counting · acceptance-sha256:1e187092184d7382c347e9eef8c4290a2e80428df3e9fcffb91e99c78b4302ad · covers:a relative or unplaceable path still is
- 2026-10-09 · 6d54fa17* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · takes the previous-session count without the root, so the notice counts a scratchpad write · acceptance-sha256:1e187092184d7382c347e9eef8c4290a2e80428df3e9fcffb91e99c78b4302ad · covers:the previous-session notice does not count an outside write

## Invariants

- A write whose place cannot be established is still counted: unplaceable is not outside (CLAUDE.md §16).
- `unseenWriteSince` is unchanged.

## Risks

- A symlinked or case-folded root misplaces a path; the test uses the same spellings `outsideRoot` already handles.

## Stop Condition

Stop and ask if a caller cannot know the root, or if the reproduction shows the entry is not recorded at all (then the premise is different and the task is dropped).

## Out of Scope

- The per-write hook cost on Windows, if it does not reproduce here (deferred: docs/BACKLOG.md §370)

## Verification Log
- 2026-10-09 · 6d54fa17* · exit 0 · `out=$(node --test --test-reporter=tap tests/outside-root-writes.test.mjs 2>&1) \ …` · acceptance-sha256:1e187092184d7382c347e9eef8c4290a2e80428df3e9fcffb91e99c78b4302ad · ms:281
- 2026-10-09 · 6d54fa17* · exit 0 · `out=$(node --test --test-reporter=tap tests/outside-root-writes.test.mjs 2>&1) \ …` · acceptance-sha256:1e187092184d7382c347e9eef8c4290a2e80428df3e9fcffb91e99c78b4302ad · ms:264
- 2026-10-09 · 6d54fa17* · exit 0 · `out=$(node --test --test-reporter=tap tests/outside-root-writes.test.mjs 2>&1) \ …` · acceptance-sha256:1e187092184d7382c347e9eef8c4290a2e80428df3e9fcffb91e99c78b4302ad · ms:265
- 2026-10-09 · 6d54fa17* · exit 1 · `out=$(node --test --test-reporter=tap tests/outside-root-writes.test.mjs 2>&1) \ …` · acceptance-sha256:1e187092184d7382c347e9eef8c4290a2e80428df3e9fcffb91e99c78b4302ad · ms:197 · test-lock-sha256:1566d85039e47e28f694adee560257b41a336832b66ebb61109ed468040277a3 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvb3V0c2lkZS1yb290LXdyaXRlcy50ZXN0Lm1qcwlhIHJlbGF0aXZlIG9yIHVucGxhY2VhYmxlIHdyaXRlIHBhdGggaXMgc3RpbGwgY291bnRlZCBhcyB1bnNlZW4JMzRmMzE3OTMyZTNlNTVjMzdiZWIwYTM5M2NmN2FhMGMxZDYwOWI0MTRjNmFjOTA1NjlhNTE4NmFlNzFjNWMyYgpib2R5CXRlc3RzL291dHNpZGUtcm9vdC13cml0ZXMudGVzdC5tanMJYW4gYWJzb2x1dGUgd3JpdGUgb3V0c2lkZSB0aGUgcmVwb3NpdG9yeSBpcyBub3QgY291bnRlZCBhcyB1bnNlZW4JMGM2ZGEwM2NmOWU4ZTE0MGFmNGZiOWY5NmNjZmZlN2Y5OGNkNWQ5OTdiMGE0YmJiNDk3MzQ3YjllYmE2MzQ2Zg
  ```
  ```
- 2026-10-09 · 6d54fa17* · exit 0 · `out=$(node --test --test-reporter=tap tests/outside-root-writes.test.mjs 2>&1) \ …` · acceptance-sha256:1e187092184d7382c347e9eef8c4290a2e80428df3e9fcffb91e99c78b4302ad · ms:199
- 2026-10-09 · human-observed · observed by the executing session on macOS, 2026-10-09: the PostToolUse hook recorded a Write to a scratchpad path as file.written with observable false (before the change), in 0.10 s against 0.10 s for a path inside the repository over 3 runs each; the Windows 0.4-0.9 s per write is NOT reproduced and stays UNPROVEN until the outside run; unobservableWrites callers enumerated with mrw read --grep: 2 in plugin/scripts/lifecycle.mjs, both given the root
