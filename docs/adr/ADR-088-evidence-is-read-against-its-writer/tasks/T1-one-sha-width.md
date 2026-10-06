# Task ADR-088-T1: every row reader takes one sha width, keyed to the object format

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (one shared field in `record.py`, three gates import it, one new test file, campaign entries, one skill paragraph)
**Owner:** unassigned
**Produces:** `record.SHA_FIELD` and `record.sha_fits(sha, object_format)`, the one row sha reading
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `every row reader takes one sha width`, `a sha wider than the object format is not evidence`

## Goal

`adr-lint`, `adr-next` and `adr-verify` read a Verification Log row's sha through one field in
`plugin/lib/record.py`. In a SHA-1 repository a sha over 40 characters is off-grammar to all three.
Elsewhere, and wherever git cannot say, the field is 4-64 as it is today.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | `SHA_FIELD` (moved from adr-lint `:169` and adr-verify `:2005`), used by `_MACHINE` (`:778`); `object_format(root)`, one bounded `git rev-parse --show-object-format`, cached per root, `None` when git cannot answer; `sha_fits(sha, object_format)` |
| `plugin/bin/adr-lint` | edit | imports `SHA_FIELD`; the row check (`:1873`) blocks a row `sha_fits` rejects, naming the width and the format. This is what selects the narrowing for the lint |
| `plugin/bin/adr-next` | edit | `VLOG_DIGEST_RE` (`:95`) and `VLOG_LEGACY_RE` (`:117`) take `SHA_FIELD`; a row `sha_fits` rejects is not evidence. This is what selects it for `done` |
| `plugin/bin/adr-verify` | edit | imports `SHA_FIELD`; the prior-pass count (`:3190`) uses it and `sha_fits` |
| `plugin/skills/adr-execute/SKILL.md` | edit | the paragraph "What it does NOT prove is that a command ran" names what is deliberately not checked: a row's sha existing, a repeated row, the order of dates (ADR-088 Decision 2) |
| `tests/vlog-sha-width.test.mjs` | add | the two tests below |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write the two tests in this task's Tests table and record the red run (TDD red). Each builds its scratch repositories under the test's own temporary directory (CLAUDE.md §9). They are initialised with `git init` and `git init --object-format=sha256`, with no commit, and every path is assembled at runtime (§6). Red today: `adr-next` prints `READY` for the 4- and 64-character rows, and `adr-lint` passes the 41-character row in the SHA-1 repository. Run `python3 scripts/test-locks.py tests/gate-regressions.py` first. Its `SHA_GRAMMAR` table stays as is, and no locked test changes.
2. [S2] Move `SHA_FIELD` into `record.py`. `adr-lint`, `adr-verify` and `adr-next` import it, and `_MACHINE` uses it. `adr-next`'s two patterns and `adr-verify:3190` lose their `{7,40}` copies. Re-run the class command from ADR-088 Context. The six evidence-row lines must now name the shared field, and `adr-judge:86` and `branch-state.mjs:374` stay as they are.
3. [S3] Add `object_format(root)` and `sha_fits(sha, object_format)`. `no-git` always fits. Any sha fits when the format is `None` or `sha256`. A sha over 40 hex characters, `*` aside, does not fit `sha1`.
4. [S4] Apply `sha_fits` in adr-lint's row check (blocking, with the width and the format in the message), in adr-next's done reading, and in adr-verify's prior-pass count.
5. [S5] Edit the adr-execute paragraph so it says, in one sentence each, that a row's sha is not checked against git, that a repeated row is not flagged, and that row dates are not ordered, and why (ADR-088). [proof: human: a reviewer reads the paragraph against ADR-088 Decision 2]
6. [S6] Record one killed mutant per Rests-on name, and add both to `tests/mutations.json`:
   - one restores `adr-next`'s `{7,40}`, so the agreement test goes red;
   - one makes `sha_fits` accept every width, so the narrowing test goes red. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/vlog-sha-width.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - (every row reader takes the sha width git can print|a sha wider than the object format is not evidence)")" = 2
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every row reader takes the sha width git can print` | `tests/vlog-sha-width.test.mjs` | through the CLIs `python3 plugin/bin/adr-lint` and `python3 plugin/bin/adr-next --all`, a done task whose only row has a 4-, 7- or 40-character sha in a SHA-1 repository, or a 41- or 64-character sha in a SHA-256 one, is exit 0 to adr-lint and `done` to adr-next. A real `adr-verify` run under `core.abbrev=4` and `core.abbrev=40` writes a row both read as evidence. DIRTY twin: the same 41-character row in the SHA-1 repository is blocked by adr-lint and not `done` to adr-next | none | S1, S2, S3, S4 |
| `a sha wider than the object format is not evidence` | `tests/vlog-sha-width.test.mjs` | in a SHA-1 repository, a 41- and a 64-character sha are each blocked by adr-lint, with "41" or "64" and "sha1" named, and are not counted by adr-next. CLEAN twin: the same rows with `PATH` emptied for the gate (git absent) lint exit 0 and carry no width finding, because could-not-look reports nothing; a 65-character sha stays off-grammar either way | none | S1, S3, S4 |
| `the sweep counts a claim only when its sha fits the repository` | `tests/vlog-sha-width.test.mjs` | added after a Codex review of the diff: `adr-verify --sweep`'s claim reader (`claims_in`) is in the class too. In a SHA-1 repository a 41-character exit-0 row is no claim (`claims` 0); CLEAN twins: a 40-character row there, and a 41-character row in a SHA-256 repository, are one claim each | none | S4 |
| `a lock snapshot whose sha does not fit does not release a moved lock` | `tests/vlog-sha-width.test.mjs` | added after a second Codex review: the test lock's row reader (`_recorded_lock`) is in the class. In a SHA-1 repository, after a real red and green, a moved locked test withholds done, and a real `--relock --replace-hashes` snapshot releases it (the twin); the same snapshot with its sha widened to 41 characters does not | none | S4 |
| `a lock snapshot whose sha does not fit does not stand in for the recovery lock` | `tests/vlog-sha-width.test.mjs` | added after a review of 8fe4fa8: the writer's lock readers (`vlog_has_test_lock`, `vlog_has_red`) are in the class. In a SHA-1 repository, a lockless red row then a 41-character lock snapshot: a real adr-verify green writes a recovery lock. Twin: with a 7-character snapshot it writes none | none | S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | adr-lint's row check and adr-next's done reading call `sha_fits`; both tests run the CLIs, so dropping either call turns a test red |
| 3 — the caller can discover it | the off-grammar message names the width and the object format; adr-lint's grammar help text names the field |
| 4 — it is used | any corpus in a SHA-256 or `core.abbrev<7` repository; nothing measures this yet |

## Mutation Log
- 2026-10-06 · 3ae6c8c* · mutant killed · exit 1 · `plugin/bin/adr-next` · adr-next reads the 7-40 sha copy again, so a 4-character row adr-lint accepts is READY · acceptance-sha256:245e5928c506ebd59c9692f0b28bd80eea51da2a857b2b851c36722a2bdb9bed · covers:every row reader takes one sha width
- 2026-10-06 · 3ae6c8c* · mutant killed · exit 1 · `plugin/lib/record.py` · sha_fits accepts every width, so a 41- or 64-character sha in a SHA-1 repository lints clean and is done · acceptance-sha256:245e5928c506ebd59c9692f0b28bd80eea51da2a857b2b851c36722a2bdb9bed · covers:a sha wider than the object format is not evidence
- 2026-10-06 · 3ae6c8c* · mutant killed · exit 1 · `plugin/bin/adr-verify` · the sweep counts a 41-character row in a SHA-1 repository as a claim that held · acceptance-sha256:245e5928c506ebd59c9692f0b28bd80eea51da2a857b2b851c36722a2bdb9bed · covers:every row reader takes one sha width
- 2026-10-06 · 3ae6c8c* · mutant killed · exit 1 · `plugin/lib/record.py` · the lock reads a snapshot row whose sha does not fit, so it releases a moved lock · acceptance-sha256:245e5928c506ebd59c9692f0b28bd80eea51da2a857b2b851c36722a2bdb9bed · covers:every row reader takes one sha width
- 2026-10-06 · 8fe4fa8* · mutant killed · exit 1 · `plugin/lib/record.py` · a lock snapshot whose sha does not fit stands in for a lock, so no recovery lock is written · acceptance-sha256:245e5928c506ebd59c9692f0b28bd80eea51da2a857b2b851c36722a2bdb9bed · covers:every row reader takes one sha width

## Invariants

- Every row `adr-verify` writes, in either object format and at any `core.abbrev`, is evidence to every reader.
- `adr-lint` and `adr-next` never disagree on whether a row's sha is acceptable.
- A lookup git could not answer never produces a finding.

## Risks

- The new git spawn in adr-next must be bounded and cached, or a corpus of many records pays it per task. Mitigation: one call per root, through the same bounded runner `record.git_root` uses.

## Stop Condition

Stop and ask if any honest `adr-verify` row is refused, if a locked test would have to change, or if git prints a sha over 40 characters in a SHA-1 repository at any `core.abbrev`. The last would mean the narrowing is wrong, not the test.

## Out of Scope

- The publish binding — T2. A sha's existence, repeats and date order — ADR-088 Decision 2.

## Verification Log
- 2026-10-06 · 3ae6c8c* · exit 1 · `out=$(node --test --test-reporter=tap tests/vlog-sha-width.test.mjs 2>&1) \ …` · acceptance-sha256:245e5928c506ebd59c9692f0b28bd80eea51da2a857b2b851c36722a2bdb9bed · ms:614 · test-lock-sha256:fe2c629fd5a0acdba9c73ef5e77ec2ad33749d856a3c2648c491c9c6964eec54 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvdmxvZy1zaGEtd2lkdGgudGVzdC5tanMJYSBzaGEgd2lkZXIgdGhhbiB0aGUgb2JqZWN0IGZvcm1hdCBpcyBub3QgZXZpZGVuY2UJYWM1YTY5OGJmMTIzY2FmNDE5ZmY1MDczNDllZTUwNTY0ODhlNDAwYWYyMzlkNzlkOTk4YTA2ZDk5ZGMwZjAxYQpib2R5CXRlc3RzL3Zsb2ctc2hhLXdpZHRoLnRlc3QubWpzCWV2ZXJ5IHJvdyByZWFkZXIgdGFrZXMgdGhlIHNoYSB3aWR0aCBnaXQgY2FuIHByaW50CTkzYWViZDZkODY0ZjgxNjhjZDI5NGNlZTNkYzFkZTU0MTAxMTUyNmNmNjU5ZGRlNzNjOTg4NWQ5MzQ2OGE1ZTE
  ```
  ```
- 2026-10-06 · 3ae6c8c* · exit 0 · `out=$(node --test --test-reporter=tap tests/vlog-sha-width.test.mjs 2>&1) \ …` · acceptance-sha256:245e5928c506ebd59c9692f0b28bd80eea51da2a857b2b851c36722a2bdb9bed · ms:5078
- 2026-10-06 · 3ae6c8c* · exit 0 · `out=$(node --test --test-reporter=tap tests/vlog-sha-width.test.mjs 2>&1) \ …` · acceptance-sha256:245e5928c506ebd59c9692f0b28bd80eea51da2a857b2b851c36722a2bdb9bed · ms:3270
- 2026-10-06 · 3ae6c8c* · exit 0 · `out=$(node --test --test-reporter=tap tests/vlog-sha-width.test.mjs 2>&1) \ …` · acceptance-sha256:245e5928c506ebd59c9692f0b28bd80eea51da2a857b2b851c36722a2bdb9bed · ms:3153
- 2026-10-06 · 3ae6c8c* · exit 0 · `out=$(node --test --test-reporter=tap tests/vlog-sha-width.test.mjs 2>&1) \ …` · acceptance-sha256:245e5928c506ebd59c9692f0b28bd80eea51da2a857b2b851c36722a2bdb9bed · ms:4406
- 2026-10-06 · 8fe4fa8* · exit 0 · `out=$(node --test --test-reporter=tap tests/vlog-sha-width.test.mjs 2>&1) \ …` · acceptance-sha256:245e5928c506ebd59c9692f0b28bd80eea51da2a857b2b851c36722a2bdb9bed · ms:5102
