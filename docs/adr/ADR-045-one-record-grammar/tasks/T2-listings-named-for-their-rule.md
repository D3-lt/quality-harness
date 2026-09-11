# Task ADR-045-T2: The two git listings are named for their rule

**Depends-on:** none
**Covers:** F-3, UC3-S1, UC3-S2
**Estimated scope:** S (a rename in one gate and its harness; one test)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

adr-lint's listing is `tracked_or_unignored_paths` — tracked, or on disk and not ignored. arch-lint's stays `tracked_paths` — the index. Neither body changes; on one repository they differ on exactly the untracked, non-ignored file.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | rename the definition, every call site, and the comment that names it |
| `tests/gate-regressions.py` | edit | the harness calls it by name |
| `tests/gates.test.mjs` | edit | the difference test, both directions, on a temporary repository |
| `tests/mutations.json` | edit | a mutant that makes the two listings agree |

## Ordered Steps

1. [S1] Bind the failing test for the Covers IDs. [proof: acceptance]
2. [S2] Rename in adr-lint and the harness; `rg -n '\btracked_paths\(' plugin/bin/adr-lint tests` finds no definition or call afterwards (the docstring may still name arch-lint's function). [proof: acceptance]
3. [S3] Add the catalogue entry; run it with `node scripts/mutate.mjs --case`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern "adr-lint's tracked_or_unignored_paths includes an untracked file" tests/gates.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `adr-lint's tracked_or_unignored_paths includes an untracked file; arch-lint's tracked_paths excludes it` | `tests/gates.test.mjs` | committed in both; untracked only in adr-lint's; ignored in neither; old name absent from adr-lint, new name absent from arch-lint | F-3, UC3-S1, UC3-S2 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | both functions are loaded as module attributes |
| 2 — something selects it | `check_pointers`, `check_adr`, `record_files` call adr-lint's; `repo_files` calls arch-lint's |
| 3 — the caller can discover it | the name states the rule at the call site |
| 4 — it is used | the test lists a real temporary repository through both |

## Mutation Log

- 2026-09-11 · d009b03* · mutant killed · exit 1 · `plugin/bin/adr-lint` · without the --others --exclude-standard call the listing is the index only and the file being added is no longer a member, so the two gates answer alike on the untracked file · acceptance-sha256:41c8f556e60ceeacf53e4c388ee677e8862c8ff39ef0fffe0ff6b112947d1485

## Invariants

- adr-lint's listing still runs `ls-files` and `ls-files --others --exclude-standard`; arch-lint's still runs `ls-files --cached`.
- Both still answer `None` when git cannot answer (ADR-005).

## Risks

- A call site keeps the old name and adr-lint dies with `NameError` on a path nobody's fixture reaches — the `rg` in S2 is the check, and the test asserts the old name is absent from the module.

## Stop Condition

A green run while `rg -n '\btracked_paths\(' plugin/bin/adr-lint` still matches, or while the two listings agree on the untracked file.

## Out of Scope

- Changing either listing's membership (permanent: boundary: ADR-011 / ADR-017 chose adr-lint's; arch-lint's docstring chose the index)
- Sharing the listing through `record.py` (permanent: boundary: opposite rules cannot be one function)

## Notes

Class: `rg -n 'def tracked_paths' plugin/bin` — two on `ea12656`, one after. Records naming `tracked_paths()` for adr-lint (ADR-011, ADR-015, ADR-017; BACKLOG) are history and are not edited.

## Verification Log
- 2026-09-11 · d009b03 · exit 0 · `node --test --test-name-pattern "adr-lint's tracked_or_unignored_paths includes an untracked file" tests/gates.test.mjs` · acceptance-sha256:41c8f556e60ceeacf53e4c388ee677e8862c8ff39ef0fffe0ff6b112947d1485 · ms:258
- 2026-09-11 · d009b03* · exit 0 · `node --test --test-name-pattern "adr-lint's tracked_or_unignored_paths includes an untracked file" tests/gates.test.mjs` · acceptance-sha256:41c8f556e60ceeacf53e4c388ee677e8862c8ff39ef0fffe0ff6b112947d1485 · ms:161
