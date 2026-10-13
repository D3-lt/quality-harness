# Task ADR-100-T2: `qh-check --commit` checks the staged tree and commits it in one call

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (the check runner, its gate wrapper, its help and the plugin README)
**Owner:** unassigned
**Produces:** `qh-check --commit [<git commit arguments>]`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a red check never reaches git`, `a working tree unlike the index is refused first`, `arguments and stdin reach git`, `the ledger certifies the tree committed`

## Goal

One call runs the project's fast check (or its full check when none is declared) on a tree equal to the index and, only when
it passes, runs `git commit` with the caller's arguments and stdin.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/qh-check.mjs` | edit | `--commit`: the index check before anything, the run as `--fast` does it, then `git commit` on exit 0 |
| `plugin/bin/qh-check` | edit | the docstring names `--commit` and its exit codes (what makes it discoverable) |
| `plugin/README.md` | edit | one line beside `qh-check` |
| `tests/qh-check-commit.test.mjs` | add | the four tests below |
| `tests/mutations/plugin/scripts/qh-check.mjs.json` | edit | entries for the refusal, the gate on the check's exit, and the pass-through |

## Ordered Steps

1. [S1] Write `tests/qh-check-commit.test.mjs` and run the Acceptance fence red. [proof: acceptance]
2. [S2] Before running anything, refuse with exit 2, naming what: a working tree unlike the index (`git diff --quiet` for unstaged changes, `git ls-files --others --exclude-standard` for untracked paths that are not ignored, up to ten named); and any git argument that commits a tree other than the index — a pathspec (an argument after `--`, or one that is not an option), `-p`/`--patch`, `--interactive`, `-o`/`--only`, `-i`/`--include` (the cold review of ADR-100, 2026-10-13: `git commit -- A` with A and B staged commits a tree no check saw). `--amend`, `-a`, `-F`, `-m` and `--no-edit` are allowed: on a tree equal to the index they commit the index.
3. [S3] Run the check exactly as `qh-check --fast` does (the full check when no `fastCheck` is declared), recorded in the same ledger, its output printed.
4. [S4] On exit 0 only, spawn `git commit <arguments after --commit>` with stdin inherited. When git exits 0, compare `HEAD^{tree}` with the tree the check recorded; a mismatch (a pre-commit hook that rewrote the index, a peer staging mid-run) is said, naming both trees and that the commit was made, and exits 1. Otherwise return git's exit code; on any check exit but 0, return it and never spawn git.
5. [S5] The docstring and the README line. [proof: acceptance]
6. [S6] Catalogue entries for S2 to S4, killed. [proof: mutation]

## Acceptance

```bash
test "$(node --test --test-reporter=tap tests/qh-check-commit.test.mjs 2>&1 | grep -oE '^ok [0-9]+ - (qh-check --commit commits the staged tree only after its check passes|a red check never reaches git commit and its exit code is the check.s|qh-check --commit refuses a working tree that differs from the index before running anything|qh-check --commit passes its git arguments and stdin through|qh-check --commit refuses a pathspec and says when the commit records a tree the check did not see|a check that stages a file while it runs is not committed|a signing flag takes no next word, and a pathspec is still refused|an abbreviated or unknown long option is refused)$' | sed -E 's/^ok [0-9]+ - //' | sort -u | wc -l | tr -d ' ')" = 8 \
  && node --test tests/qh-check.test.mjs tests/qh-check-reads-the-ledger.test.mjs tests/qh-check-shell.test.mjs \
  && grep -q -- '--commit' plugin/bin/qh-check
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `qh-check --commit commits the staged tree only after its check passes` | `tests/qh-check-commit.test.mjs` | a fixture repository with a passing `fastCheck` gets one commit, and the fast ledger one pass row | — | S3, S4 |
| `a red check never reaches git commit and its exit code is the check's` | `tests/qh-check-commit.test.mjs` | a check exiting 3 leaves HEAD unchanged and `qh-check` exits 3 | — | S4 |
| `qh-check --commit refuses a working tree that differs from the index before running anything` | `tests/qh-check-commit.test.mjs` | an unstaged edit and, separately, an untracked file each exit 2 with no ledger row; an ignored file does not refuse | — | S2 |
| `qh-check --commit passes its git arguments and stdin through` | `tests/qh-check-commit.test.mjs` | `--commit -F -` with a message on stdin commits that message | — | S4 |
| `qh-check --commit refuses a pathspec and says when the commit records a tree the check did not see` | `tests/qh-check-commit.test.mjs` | `--commit -- a.txt` and `--commit -p` exit 2 with no check run; a pre-commit hook that stages another file makes the commit exit 1 naming both trees | — | S2, S4 |
| `a check that stages a file while it runs is not committed` | `tests/qh-check-commit.test.mjs` | a run whose tree moved is graded unproven, so its exit 0 commits nothing (added 2026-10-13 after an advisor's review of e6a00957: the post-commit compare used a fresh observation, not the ledger's row) | — | S4 |
| `a signing flag takes no next word, and a pathspec is still refused` | `tests/qh-check-commit.test.mjs` | `-S`, `-S<key>`, `--gpg-sign[=<key>]`, `-am` and `--amend --no-edit` are accepted; a pathspec after `-S` and `-pm` are refused (the same review: `-S` was read as taking a value, a false refusal) | — | S2 |
| `an abbreviated or unknown long option is refused` | `tests/qh-check-commit.test.mjs` | long options are an allowlist of whole names, because git accepts an unambiguous prefix (`--on` is `--only`; the Codex review of ce54814c) | — | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the five tests |
| 2 — something selects it | `qh-check.mjs`'s argument parser; a catalogue entry removes `--commit` from the accepted words |
| 3 — the caller can discover it | `qh-check --help`, `plugin/README.md` |
| 4 — it is used | the fast ledger's rows followed by a commit at the same tree; nothing measures this yet |

## Mutation Log
- 2026-10-13 · 7ccda8bd* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · a red check is followed by git commit; the chain hides the exit the owner rule exists for · acceptance-sha256:141bddd05603b42b0e3feba9c631bdfc3bd9d1ed5ccfedbe7056a8313f27c065 · covers:a red check never reaches git
- 2026-10-13 · 7ccda8bd* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · a working tree unlike the index is checked and its index committed, a tree no check saw · acceptance-sha256:141bddd05603b42b0e3feba9c631bdfc3bd9d1ed5ccfedbe7056a8313f27c065 · covers:a working tree unlike the index is refused first
- 2026-10-13 · 7ccda8bd* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · the caller message and stdin never reach git; every commit says qh-check · acceptance-sha256:141bddd05603b42b0e3feba9c631bdfc3bd9d1ed5ccfedbe7056a8313f27c065 · covers:arguments and stdin reach git
- 2026-10-13 · 72443c13* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · a run the ledger grades unproven, its tree moved mid-run, is committed on its exit 0 · acceptance-sha256:0037970ea411d575e376bfa0ed8a411a131ab72aa36771e4f2f3d93a12d3d40c · covers:the ledger certifies the tree committed
- 2026-10-13 · 72443c13* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · -S<key> reads the rest of its key as flags, and a legitimate signed commit is refused · acceptance-sha256:0037970ea411d575e376bfa0ed8a411a131ab72aa36771e4f2f3d93a12d3d40c · covers:arguments and stdin reach git
- 2026-10-13 · 72443c13* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · a red check is followed by git commit; the chain hides the exit the owner rule exists for · acceptance-sha256:0037970ea411d575e376bfa0ed8a411a131ab72aa36771e4f2f3d93a12d3d40c · covers:a red check never reaches git
- 2026-10-13 · 72443c13* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · a working tree unlike the index is checked and its index committed, a tree no check saw · acceptance-sha256:0037970ea411d575e376bfa0ed8a411a131ab72aa36771e4f2f3d93a12d3d40c · covers:a working tree unlike the index is refused first
- 2026-10-13 · ce54814c* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · an abbreviation such as --on (--only) passes through and commits a tree no check saw · acceptance-sha256:69ab086ed7fffed3f80a20dd96576d98140958ef46b39e46e5864cd2426d21be · covers:arguments and stdin reach git
- 2026-10-13 · ce54814c* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · a run the ledger grades unproven, its tree moved mid-run, is committed on its exit 0 · acceptance-sha256:69ab086ed7fffed3f80a20dd96576d98140958ef46b39e46e5864cd2426d21be · covers:the ledger certifies the tree committed
- 2026-10-13 · ce54814c* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · a red check is followed by git commit; the chain hides the exit the owner rule exists for · acceptance-sha256:69ab086ed7fffed3f80a20dd96576d98140958ef46b39e46e5864cd2426d21be · covers:a red check never reaches git
- 2026-10-13 · ce54814c* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · a working tree unlike the index is checked and its index committed, a tree no check saw · acceptance-sha256:69ab086ed7fffed3f80a20dd96576d98140958ef46b39e46e5864cd2426d21be · covers:a working tree unlike the index is refused first

## Invariants

- `qh-check` without `--commit` behaves exactly as before (its locked tests stay byte-identical: 4 locks on `tests/qh-check.test.mjs`, 2026-10-13).
- No `git commit` is spawned unless the check exited 0 on a tree equal to the index, with no argument that commits another tree; a commit whose `HEAD^{tree}` is not the checked tree is never reported as a success.

## Risks

- git's own hooks (ADR-066's `prepare-commit-msg`) run inside the commit and judge the tree: the fast pass just recorded is what they read, so the commit goes through with ADR-081's advice.
- A fixture repository's commit judged by this session's publish hook (BACKLOG §371): the tests strip the `GIT_CONFIG_*` variables the session hands git and run git with `core.hooksPath` set by the test.

## Stop Condition

Stop and ask if the publish hook refuses the commit `--commit` makes on a fast pass, or if a lock on an existing qh-check test would have to change.

## Out of Scope

- `git push` from the same command (a push needs the full check, ADR-081).

## Verification Log
- 2026-10-13 · 7ccda8bd* · exit 1 · `test "$(node --test --test-reporter=tap tests/qh-check-commit.test.mjs 2>&1 | grep -oE '^ok [0-9]+ - (qh-check --commit commits the staged tree only after its check passes|a red check never reaches git commit and its exit code is the check.s|qh-check --commit refuses a working tree that differs from the index before running anything|qh-check --commit passes its git arguments and stdin through|qh-check --commit refuses a pathspec and says when the commit records a tree the check did not see)$' | sed -E 's/^ok [0-9]+ - //' | sort -u | wc -l | tr -d ' ')" = 5 \ …` · acceptance-sha256:141bddd05603b42b0e3feba9c631bdfc3bd9d1ed5ccfedbe7056a8313f27c065 · ms:1356 · test-lock-sha256:3e266d2a829e2621255e4e26e40f8b8e3f1a4f7f2ec632dd916e67bd7edf38bb · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcWgtY2hlY2stY29tbWl0LnRlc3QubWpzCWEgcmVkIGNoZWNrIG5ldmVyIHJlYWNoZXMgZ2l0IGNvbW1pdCBhbmQgaXRzIGV4aXQgY29kZSBpcyB0aGUgY2hlY2sncwljNDcwMzA1ODNmNmQ5N2I1OTFhYmQ3YmFiNWNlZmVjY2UzZTUzOTEzMGI0OGUxYTYxMjhjMTcxY2VlODNhZjg1CmJvZHkJdGVzdHMvcWgtY2hlY2stY29tbWl0LnRlc3QubWpzCXFoLWNoZWNrIC0tY29tbWl0IGNvbW1pdHMgdGhlIHN0YWdlZCB0cmVlIG9ubHkgYWZ0ZXIgaXRzIGNoZWNrIHBhc3NlcwllOWFjNzUwMzNmZDQ5MzZhMmFmYjQ4ZTEzNWYxZDU2ODIyMGQxZTFlMzA4MWI2OTUxZDI5MWVjZDY2NzE1NjgxCmJvZHkJdGVzdHMvcWgtY2hlY2stY29tbWl0LnRlc3QubWpzCXFoLWNoZWNrIC0tY29tbWl0IHBhc3NlcyBpdHMgZ2l0IGFyZ3VtZW50cyBhbmQgc3RkaW4gdGhyb3VnaAljMjhjMDZhYjY0ODk0NjgxNjA0MDJkZjM2ZWVkMmIxMGZhMmIxNDY2MTk3YWU1N2MxZjQwYTExYmZhZTFiZjVjCmJvZHkJdGVzdHMvcWgtY2hlY2stY29tbWl0LnRlc3QubWpzCXFoLWNoZWNrIC0tY29tbWl0IHJlZnVzZXMgYSBwYXRoc3BlYyBhbmQgc2F5cyB3aGVuIHRoZSBjb21taXQgcmVjb3JkcyBhIHRyZWUgdGhlIGNoZWNrIGRpZCBub3Qgc2VlCWE1NjI3NGRkMzE4ZjViZmI3NGM4NzM1M2NhYzNlY2YyNGI5ZjczYjlhMzY5YTFhNTVhZGNiYTk4NDAxMmMwZDgKYm9keQl0ZXN0cy9xaC1jaGVjay1jb21taXQudGVzdC5tanMJcWgtY2hlY2sgLS1jb21taXQgcmVmdXNlcyBhIHdvcmtpbmcgdHJlZSB0aGF0IGRpZmZlcnMgZnJvbSB0aGUgaW5kZXggYmVmb3JlIHJ1bm5pbmcgYW55dGhpbmcJNWRmMTU2MzcxNmMwNGFlZGUyN2NhMzIwNmQ0Yzg0OTUwMWI4ZWZmYTgxYmM3MWI2YTJlZGQwNWI4ZGE1OTA1Yw
  ```
  ```
- 2026-10-13 · 7ccda8bd* · exit 0 · `test "$(node --test --test-reporter=tap tests/qh-check-commit.test.mjs 2>&1 | grep -oE '^ok [0-9]+ - (qh-check --commit commits the staged tree only after its check passes|a red check never reaches git commit and its exit code is the check.s|qh-check --commit refuses a working tree that differs from the index before running anything|qh-check --commit passes its git arguments and stdin through|qh-check --commit refuses a pathspec and says when the commit records a tree the check did not see)$' | sed -E 's/^ok [0-9]+ - //' | sort -u | wc -l | tr -d ' ')" = 5 \ …` · acceptance-sha256:141bddd05603b42b0e3feba9c631bdfc3bd9d1ed5ccfedbe7056a8313f27c065 · ms:15320
- 2026-10-13 · 7ccda8bd* · exit 0 · `test "$(node --test --test-reporter=tap tests/qh-check-commit.test.mjs 2>&1 | grep -oE '^ok [0-9]+ - (qh-check --commit commits the staged tree only after its check passes|a red check never reaches git commit and its exit code is the check.s|qh-check --commit refuses a working tree that differs from the index before running anything|qh-check --commit passes its git arguments and stdin through|qh-check --commit refuses a pathspec and says when the commit records a tree the check did not see)$' | sed -E 's/^ok [0-9]+ - //' | sort -u | wc -l | tr -d ' ')" = 5 \ …` · acceptance-sha256:141bddd05603b42b0e3feba9c631bdfc3bd9d1ed5ccfedbe7056a8313f27c065 · ms:15362
- 2026-10-13 · 7ccda8bd* · exit 0 · `test "$(node --test --test-reporter=tap tests/qh-check-commit.test.mjs 2>&1 | grep -oE '^ok [0-9]+ - (qh-check --commit commits the staged tree only after its check passes|a red check never reaches git commit and its exit code is the check.s|qh-check --commit refuses a working tree that differs from the index before running anything|qh-check --commit passes its git arguments and stdin through|qh-check --commit refuses a pathspec and says when the commit records a tree the check did not see)$' | sed -E 's/^ok [0-9]+ - //' | sort -u | wc -l | tr -d ' ')" = 5 \ …` · acceptance-sha256:141bddd05603b42b0e3feba9c631bdfc3bd9d1ed5ccfedbe7056a8313f27c065 · ms:15364
- 2026-10-13 · 72443c13* · exit 1 · `test "$(node --test --test-reporter=tap tests/qh-check-commit.test.mjs 2>&1 | grep -oE '^ok [0-9]+ - (qh-check --commit commits the staged tree only after its check passes|a red check never reaches git commit and its exit code is the check.s|qh-check --commit refuses a working tree that differs from the index before running anything|qh-check --commit passes its git arguments and stdin through|qh-check --commit refuses a pathspec and says when the commit records a tree the check did not see|a check that stages a file while it runs is not committed|a signing flag takes no next word, and a pathspec is still refused)$' | sed -E 's/^ok [0-9]+ - //' | sort -u | wc -l | tr -d ' ')" = 7 \ …` · acceptance-sha256:0037970ea411d575e376bfa0ed8a411a131ab72aa36771e4f2f3d93a12d3d40c · ms:2583
  ```
  ```
- 2026-10-13 · 72443c13* · exit 0 · `test "$(node --test --test-reporter=tap tests/qh-check-commit.test.mjs 2>&1 | grep -oE '^ok [0-9]+ - (qh-check --commit commits the staged tree only after its check passes|a red check never reaches git commit and its exit code is the check.s|qh-check --commit refuses a working tree that differs from the index before running anything|qh-check --commit passes its git arguments and stdin through|qh-check --commit refuses a pathspec and says when the commit records a tree the check did not see|a check that stages a file while it runs is not committed|a signing flag takes no next word, and a pathspec is still refused)$' | sed -E 's/^ok [0-9]+ - //' | sort -u | wc -l | tr -d ' ')" = 7 \ …` · acceptance-sha256:0037970ea411d575e376bfa0ed8a411a131ab72aa36771e4f2f3d93a12d3d40c · ms:16986
- 2026-10-13 · 72443c13* · exit 0 · `test "$(node --test --test-reporter=tap tests/qh-check-commit.test.mjs 2>&1 | grep -oE '^ok [0-9]+ - (qh-check --commit commits the staged tree only after its check passes|a red check never reaches git commit and its exit code is the check.s|qh-check --commit refuses a working tree that differs from the index before running anything|qh-check --commit passes its git arguments and stdin through|qh-check --commit refuses a pathspec and says when the commit records a tree the check did not see|a check that stages a file while it runs is not committed|a signing flag takes no next word, and a pathspec is still refused)$' | sed -E 's/^ok [0-9]+ - //' | sort -u | wc -l | tr -d ' ')" = 7 \ …` · acceptance-sha256:0037970ea411d575e376bfa0ed8a411a131ab72aa36771e4f2f3d93a12d3d40c · ms:16298
- 2026-10-13 · 72443c13* · exit 0 · `test "$(node --test --test-reporter=tap tests/qh-check-commit.test.mjs 2>&1 | grep -oE '^ok [0-9]+ - (qh-check --commit commits the staged tree only after its check passes|a red check never reaches git commit and its exit code is the check.s|qh-check --commit refuses a working tree that differs from the index before running anything|qh-check --commit passes its git arguments and stdin through|qh-check --commit refuses a pathspec and says when the commit records a tree the check did not see|a check that stages a file while it runs is not committed|a signing flag takes no next word, and a pathspec is still refused)$' | sed -E 's/^ok [0-9]+ - //' | sort -u | wc -l | tr -d ' ')" = 7 \ …` · acceptance-sha256:0037970ea411d575e376bfa0ed8a411a131ab72aa36771e4f2f3d93a12d3d40c · ms:16022
- 2026-10-13 · 72443c13* · exit 0 · `test "$(node --test --test-reporter=tap tests/qh-check-commit.test.mjs 2>&1 | grep -oE '^ok [0-9]+ - (qh-check --commit commits the staged tree only after its check passes|a red check never reaches git commit and its exit code is the check.s|qh-check --commit refuses a working tree that differs from the index before running anything|qh-check --commit passes its git arguments and stdin through|qh-check --commit refuses a pathspec and says when the commit records a tree the check did not see|a check that stages a file while it runs is not committed|a signing flag takes no next word, and a pathspec is still refused)$' | sed -E 's/^ok [0-9]+ - //' | sort -u | wc -l | tr -d ' ')" = 7 \ …` · acceptance-sha256:0037970ea411d575e376bfa0ed8a411a131ab72aa36771e4f2f3d93a12d3d40c · ms:15654
- 2026-10-13 · ce54814c* · exit 1 · `test "$(node --test --test-reporter=tap tests/qh-check-commit.test.mjs 2>&1 | grep -oE '^ok [0-9]+ - (qh-check --commit commits the staged tree only after its check passes|a red check never reaches git commit and its exit code is the check.s|qh-check --commit refuses a working tree that differs from the index before running anything|qh-check --commit passes its git arguments and stdin through|qh-check --commit refuses a pathspec and says when the commit records a tree the check did not see|a check that stages a file while it runs is not committed|a signing flag takes no next word, and a pathspec is still refused|an abbreviated or unknown long option is refused)$' | sed -E 's/^ok [0-9]+ - //' | sort -u | wc -l | tr -d ' ')" = 8 \ …` · acceptance-sha256:69ab086ed7fffed3f80a20dd96576d98140958ef46b39e46e5864cd2426d21be · ms:1729
  ```
  ```
- 2026-10-13 · ce54814c* · exit 0 · `test "$(node --test --test-reporter=tap tests/qh-check-commit.test.mjs 2>&1 | grep -oE '^ok [0-9]+ - (qh-check --commit commits the staged tree only after its check passes|a red check never reaches git commit and its exit code is the check.s|qh-check --commit refuses a working tree that differs from the index before running anything|qh-check --commit passes its git arguments and stdin through|qh-check --commit refuses a pathspec and says when the commit records a tree the check did not see|a check that stages a file while it runs is not committed|a signing flag takes no next word, and a pathspec is still refused|an abbreviated or unknown long option is refused)$' | sed -E 's/^ok [0-9]+ - //' | sort -u | wc -l | tr -d ' ')" = 8 \ …` · acceptance-sha256:69ab086ed7fffed3f80a20dd96576d98140958ef46b39e46e5864cd2426d21be · ms:16073
- 2026-10-13 · ce54814c* · exit 0 · `test "$(node --test --test-reporter=tap tests/qh-check-commit.test.mjs 2>&1 | grep -oE '^ok [0-9]+ - (qh-check --commit commits the staged tree only after its check passes|a red check never reaches git commit and its exit code is the check.s|qh-check --commit refuses a working tree that differs from the index before running anything|qh-check --commit passes its git arguments and stdin through|qh-check --commit refuses a pathspec and says when the commit records a tree the check did not see|a check that stages a file while it runs is not committed|a signing flag takes no next word, and a pathspec is still refused|an abbreviated or unknown long option is refused)$' | sed -E 's/^ok [0-9]+ - //' | sort -u | wc -l | tr -d ' ')" = 8 \ …` · acceptance-sha256:69ab086ed7fffed3f80a20dd96576d98140958ef46b39e46e5864cd2426d21be · ms:15530
- 2026-10-13 · ce54814c* · exit 0 · `test "$(node --test --test-reporter=tap tests/qh-check-commit.test.mjs 2>&1 | grep -oE '^ok [0-9]+ - (qh-check --commit commits the staged tree only after its check passes|a red check never reaches git commit and its exit code is the check.s|qh-check --commit refuses a working tree that differs from the index before running anything|qh-check --commit passes its git arguments and stdin through|qh-check --commit refuses a pathspec and says when the commit records a tree the check did not see|a check that stages a file while it runs is not committed|a signing flag takes no next word, and a pathspec is still refused|an abbreviated or unknown long option is refused)$' | sed -E 's/^ok [0-9]+ - //' | sort -u | wc -l | tr -d ' ')" = 8 \ …` · acceptance-sha256:69ab086ed7fffed3f80a20dd96576d98140958ef46b39e46e5864cd2426d21be · ms:15495
- 2026-10-13 · ce54814c* · exit 0 · `test "$(node --test --test-reporter=tap tests/qh-check-commit.test.mjs 2>&1 | grep -oE '^ok [0-9]+ - (qh-check --commit commits the staged tree only after its check passes|a red check never reaches git commit and its exit code is the check.s|qh-check --commit refuses a working tree that differs from the index before running anything|qh-check --commit passes its git arguments and stdin through|qh-check --commit refuses a pathspec and says when the commit records a tree the check did not see|a check that stages a file while it runs is not committed|a signing flag takes no next word, and a pathspec is still refused|an abbreviated or unknown long option is refused)$' | sed -E 's/^ok [0-9]+ - //' | sort -u | wc -l | tr -d ' ')" = 8 \ …` · acceptance-sha256:69ab086ed7fffed3f80a20dd96576d98140958ef46b39e46e5864cd2426d21be · ms:15568
