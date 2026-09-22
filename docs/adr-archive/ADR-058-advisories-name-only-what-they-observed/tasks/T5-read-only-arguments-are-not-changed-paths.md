# Task ADR-058-T5: wc, grep, git ls-files and mrw read arguments are not changed paths

**Depends-on:** T4
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** none
**Consumes:** `tests/advice-accuracy.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the read-argument skip in bashMarkdownMutationPaths`, `a write channel beside a read still counting`, `each named test actually running`, `the regression suites that pin path extraction`

Added 2026-09-17, after ADR-058's Follow-up replay (BACKLOG §213) found that T1 and T2 made two commit advisories name files that were only read. The owner chose a narrow fix here and a record for the whole class (BACKLOG §220). Attribution per segment, same day: the wrong paths came from `wc -l docs/BACKLOG.md` and `git ls-files 'plugin/agents/*.md' …` (flipped by T2's `mrw read` recognition) and from `grep -n "^## " …/T1-*.md` (flipped by T1's timeout peel). No `mrw read` argument produced either list, since a ranged `mrw read path:N-M` is already skipped by the git-revision colon rule. So the owner's `mrw read` scope is kept, and the families the measurement named are added.

## Goal

`bashMarkdownMutationPaths` takes nothing from a `wc`, `grep`, `git ls-files` or `mrw read` segment except its `>`/`>>` redirect target. A `grep` segment that names an ugrep option which writes or runs a command keeps every candidate.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/advice-accuracy.test.mjs` | edit | the two tests below |
| `plugin/scripts/lifecycle.mjs` | edit | the `printsOnly` test in `bashMarkdownMutationPaths`'s segment loop also asks a `readsOnlyItsArguments` predicate beside `isRecognisedReadInvocation` |

## Ordered Steps

1. [S1] Add the two tests with real assertions, including both measured commands. The first fails on an assertion (TDD red); the second pins the write direction, passes before the change by construction, and S3's mutants that skip the redirect target or drop the grep write-option check are what show it can fail.
2. [S2] Add `readsOnlyItsArguments(segment, invocation)`: `wc`; `grep` without `--save-config`, `--filter`, `--pager`, `--view` or `--format-open`; `git ls-files`; `isRecognisedReadInvocation`. OR it into `printsOnly`.
3. [S3] Run the fence green and record mutants: drop the predicate; drop the grep write-option check; skip the redirect target too. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(read-only arguments are not changed paths|a write beside a read is still a changed path)$' tests/advice-accuracy.test.mjs 2>&1) \
  && for name in 'read-only arguments are not changed paths' 'a write beside a read is still a changed path'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/lifecycle.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `read-only arguments are not changed paths` | `tests/advice-accuracy.test.mjs` | the two measured commands (`… wc -l docs/BACKLOG.md; … git ls-files 'plugin/agents/*.md' … \| tee /dev/stderr …` and `grep -n "^## " docs/tasks/T1-*.md …; cat > $S/… <<'EOF'`), `mrw read notes.md` and `mrw --root . read …` beside a write, and `wc -c` after an `rm`, yield no path under the project | — | S1, S2 |
| `a write beside a read is still a changed path` | `tests/advice-accuracy.test.mjs` | `grep … > docs/new.md`, `wc … >> README.md`, `mrw read … > docs/new.md`, `grep --save-config=docs/new.md`, `git ls-files docs && cp notes.md docs/new.md`, `T=docs/new.md && python3 plugin/bin/adr-verify "$T"` and `find docs -name 'new.md' -delete` still yield a path | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `analyzeTranscript` records these paths for the Stop message, the commit advisory and the artifact gate; S3's mutants delete the predicate |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | a replay of the two measured hook points, recorded in BACKLOG §213 |

## Mutation Log
- 2026-09-17 · 66fb261* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the predicate is never asked, so wc, grep, git ls-files and mrw read arguments are changed paths again · acceptance-sha256:d3530d62a27672d3da6fd7700b59585804960c2d81c6fd00496fe9657138b0bf · covers:the read-argument skip in bashMarkdownMutationPaths
- 2026-09-17 · 66fb261* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · wc is no longer a read-argument family · acceptance-sha256:d3530d62a27672d3da6fd7700b59585804960c2d81c6fd00496fe9657138b0bf · covers:the read-argument skip in bashMarkdownMutationPaths
- 2026-09-17 · 66fb261* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · git ls-files globs are expanded into changed paths again · acceptance-sha256:d3530d62a27672d3da6fd7700b59585804960c2d81c6fd00496fe9657138b0bf · covers:the read-argument skip in bashMarkdownMutationPaths
- 2026-09-17 · 66fb261* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a bare mrw read argument beside a write is a changed path again · acceptance-sha256:d3530d62a27672d3da6fd7700b59585804960c2d81c6fd00496fe9657138b0bf · covers:the read-argument skip in bashMarkdownMutationPaths
- 2026-09-17 · 66fb261* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · grep arguments are changed paths again · acceptance-sha256:d3530d62a27672d3da6fd7700b59585804960c2d81c6fd00496fe9657138b0bf · covers:the read-argument skip in bashMarkdownMutationPaths
- 2026-09-17 · 66fb261* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a grep naming --save-config=<file> is treated as a pure read, so the file it writes is not named · acceptance-sha256:d3530d62a27672d3da6fd7700b59585804960c2d81c6fd00496fe9657138b0bf · covers:a write channel beside a read still counting
- 2026-09-17 · 66fb261* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the redirect target of a grep, wc or mrw read segment is skipped too · acceptance-sha256:d3530d62a27672d3da6fd7700b59585804960c2d81c6fd00496fe9657138b0bf · covers:a write channel beside a read still counting
- 2026-09-17 · 66fb261* · mutant killed · exit 1 · `tests/advice-accuracy.test.mjs` · a renamed test selects nothing and the per-name ok grep must refuse it · acceptance-sha256:d3530d62a27672d3da6fd7700b59585804960c2d81c6fd00496fe9657138b0bf · covers:each named test actually running
- 2026-09-17 · 66fb261* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a git revision such as origin/main:docs/x.md resolves as a changed path; tests/lifecycle.test.mjs kills it · acceptance-sha256:d3530d62a27672d3da6fd7700b59585804960c2d81c6fd00496fe9657138b0bf · covers:the regression suites that pin path extraction

## Invariants

- A real Markdown write through `tee`, `cp`, `mv`, `sed -i`, `find -delete`, an interpreter or a redirect is still reported.
- A path assigned in the command (`T=docs/x.md`) is still reported; that harvest belongs to BACKLOG §220.

## Risks

- A future `wc`, `grep` or `git ls-files` option that writes a file. The measurement names the versions it ran on (macOS `wc`, coreutils `gwc`, Claude Code's `grep` wrapper over ugrep 7.8.4 and BSD grep 2.6.0, git 2.55.0).

## Stop Condition

Stop and ask if an existing test in `tests/lifecycle.test.mjs` about Markdown-only changes (BACKLOG §174) goes red.

## Out of Scope

- `cat`, `head`, `tail`, `sort`, `uniq`, `cut`, `ls`, `find`, `stat`, `file`, `diff`, `jq` and the other read-only families, and the assignment harvest (deferred: docs/BACKLOG.md §220)

## Verification Log
- 2026-09-17 · 66fb261* · exit 1 · `set -o pipefail …` · acceptance-sha256:d3530d62a27672d3da6fd7700b59585804960c2d81c6fd00496fe9657138b0bf · ms:112 · test-lock-sha256:af4db4a6966984bf89fe5c037eedeedbbfa1ce0a1e9125c83972c3745813a8df · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIGNvbW1pdCBpbiBhbm90aGVyIHJlcG9zaXRvcnkgZG9lcyBub3QgYXJtIHRoaXMgcmVwb3NpdG9yeSdzIGNvbW1pdCBhZHZpc29yeQlmYjEwMTkyMjNiNDQ1YmJkNWQyY2FjNTk1Y2RhNGU3MmExNzk1ZDAwZTYxMzgyZDRlYzg5MWJjOTJkOThhMTViCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCWEgY29tbWl0IHdob3NlIHJlcG9zaXRvcnkgY2Fubm90IGJlIHJlc29sdmVkIHN0aWxsIGFkdmlzZXMJZDk2MjUxOWI4OWUwOTNlZTA1OGJhZGI0Zjc2NDEwNDFmMjM1YzE5ZDI4MGUxZDU5MTViMTRlZWUxODc5YTRjNQpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIHRpbWVvdXQgd3JhcHBlciBkb2VzIG5vdCBsYXVuZGVyIGEgbXV0YXRpb24JOTdjM2NlOTJhMDYyMTFlNWNmMDcyNzE3ZTQ5YzI5MDA5MTcwZWJmMDI4MzI5ZDIxNjgzYjliYjg2YTE0NGMxMgpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIHRpbWVvdXQtd3JhcHBlZCBjaGVjayBpcyBhIGNoZWNrCTBjMWM2MzZlMTBmZDYzNGIwMTUwODcxZjUzYjdjMjY2YmE3YjQzZjI1NjNjN2ZiZjUwZDE4NDI5MWY4ZTViN2QKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJYSB3cml0ZSBiZXNpZGUgYSByZWFkIGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCTQyMTQyYTg2MDZmZDYxYjM1NjA5NjI4MWE2YWJkYWJjOWZhZDlmZTU2NzFjMWM5MmNkYzczY2I3MjdiODg1NjMKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJYW4gZWNobyByZWRpcmVjdCB0YXJnZXQgaXMgc3RpbGwgYSBjaGFuZ2VkIHBhdGgJNGI2MjhkNjA4ZDYwZTlhNWY3MWUyNWIzYmRmNGM2NDZjNmQ1NzY3ZGIyYTQ0NWI3NjU0MDJjNTk3ODdjYWYzZQpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwllY2hvIGFuZCBwcmludGYgYXJndW1lbnRzIGFyZSBub3QgY2hhbmdlZCBwYXRocwlkNTU2Y2M3MjIwNDZmODdiMjBjNGU5OTdjYzMwMDc1NmMyMDBjYzBhYzVjYTM1OWI1ODNjYmFmYjM3OTEyYzZlCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCW1ydyByZWFkIGlzIGEgcmVhZCwgbm90IGFuIHVucHJvdmVuIHdyaXRlCWI5YzI2MmI0ZTYzN2IzYmU1MDU3YzVjNTg4YWZlMWIzYjFhMDAxY2YxZjBjN2Y1ZWMyYzUzNTM5ZDVhMjgwNzIKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJbXJ3IHdyaXRlIGlzIHN0aWxsIGp1ZGdlZCBhcyBhIHdyaXRlCTgxOWM1NmRjODdhNzNkMjQzOWQwNjkyOWE1MDJmNWQwZDgzNzA1ZDY4YTYzOTgyZTI0YWI4M2ZkNzQxYWZjNDMKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJcmVhZC1vbmx5IGFyZ3VtZW50cyBhcmUgbm90IGNoYW5nZWQgcGF0aHMJMTExNTBhNjdlZTM5MGJkYzYzZTMxMDZhYTE4NzA2ZWY0MTI5YzU2MzkzNDNjNzY0ZTc0NWEzYzFmZTZmMDA0Ywpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwl0aGUgY29tbWl0IGdhdGUgaXMgc2lsZW50IGFmdGVyIGEgcGFzc2luZyB0aW1lb3V0LXdyYXBwZWQgY2hlY2sJNjcwYTA4NjFkMDZhNjMzYWJhYjAzNTM2ZmQ3YmFiZTYyMzMyMWM5YzA4MTdkNGQ4ZDEzZGIxMzBmZDA1ZjgzZQ
  ```
  ```
- 2026-09-17 · 66fb261* · exit 0 · `set -o pipefail …` · acceptance-sha256:d3530d62a27672d3da6fd7700b59585804960c2d81c6fd00496fe9657138b0bf · ms:24415
- 2026-09-17 · 66fb261* · exit 0 · `set -o pipefail …` · acceptance-sha256:d3530d62a27672d3da6fd7700b59585804960c2d81c6fd00496fe9657138b0bf · ms:24414
- 2026-09-17 · 66fb261* · exit 0 · `set -o pipefail …` · acceptance-sha256:d3530d62a27672d3da6fd7700b59585804960c2d81c6fd00496fe9657138b0bf · ms:23746
- 2026-09-17 · 66fb261* · exit 0 · `set -o pipefail …` · acceptance-sha256:d3530d62a27672d3da6fd7700b59585804960c2d81c6fd00496fe9657138b0bf · ms:23574
- 2026-09-17 · 66fb261* · exit 0 · `set -o pipefail …` · acceptance-sha256:d3530d62a27672d3da6fd7700b59585804960c2d81c6fd00496fe9657138b0bf · ms:24763
- 2026-09-17 · 66fb261* · exit 0 · `set -o pipefail …` · acceptance-sha256:d3530d62a27672d3da6fd7700b59585804960c2d81c6fd00496fe9657138b0bf · ms:24483
- 2026-09-17 · 66fb261* · exit 0 · `set -o pipefail …` · acceptance-sha256:d3530d62a27672d3da6fd7700b59585804960c2d81c6fd00496fe9657138b0bf · ms:23607
- 2026-09-17 · 66fb261* · exit 0 · `set -o pipefail …` · acceptance-sha256:d3530d62a27672d3da6fd7700b59585804960c2d81c6fd00496fe9657138b0bf · ms:24049
- 2026-09-17 · 66fb261* · exit 0 · `set -o pipefail …` · acceptance-sha256:d3530d62a27672d3da6fd7700b59585804960c2d81c6fd00496fe9657138b0bf · ms:23505
- 2026-09-17 · 332a707* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:d3530d62a27672d3da6fd7700b59585804960c2d81c6fd00496fe9657138b0bf · ms:0 · test-lock-sha256:b6bfb3474d21c25105e483a2d150a432aa814ddec0813860f7132d0946d3282a · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIHJldmlzaW9uIHBhdGggdW5kZXIgYSB1c2VkIGdpdCBjaGFubmVsIGlzIG5vdCBhIGNoYW5nZWQgcGF0aAk0MzY1NmU4ODJkMmM0NTNlODI0NzQyYWQ2MmJjZDNlMjc2YzA0YjJkZjVhM2MxM2NhZmU5MzIxYWI2NTUyNWJlCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCWEgdGltZW91dCB3cmFwcGVyIGRvZXMgbm90IGxhdW5kZXIgYSBtdXRhdGlvbgk5N2MzY2U5MmEwNjIxMWU1Y2YwNzI3MTdlNDljMjkwMDkxNzBlYmYwMjgzMjlkMjE2ODNiOWJiODZhMTQ0YzEyCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCWEgdGltZW91dC13cmFwcGVkIGNoZWNrIGlzIGEgY2hlY2sJMGMxYzYzNmUxMGZkNjM0YjAxNTA4NzFmNTNiN2MyNjZiYTdiNDNmMjU2M2M3ZmJmNTBkMTg0MjkxZjhlNWI3ZApib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIHdyYXBwZXIgZmlsZSBvcGVyYW5kIGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCWIwYmE2NjY5N2RjZmNhZjRlYTRiYzQ5NDkzOWY3ZTY1YjEzNThlYjdiYjJlMmZlNWZlZTdjMzYwMDM1YmE3NDQKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJYSB3cml0ZSBiZXNpZGUgYSByZWFkIGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCTQyMTQyYTg2MDZmZDYxYjM1NjA5NjI4MWE2YWJkYWJjOWZhZDlmZTU2NzFjMWM5MmNkYzczY2I3MjdiODg1NjMKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJYW4gZWNobyByZWRpcmVjdCB0YXJnZXQgaXMgc3RpbGwgYSBjaGFuZ2VkIHBhdGgJNGI2MjhkNjA4ZDYwZTlhNWY3MWUyNWIzYmRmNGM2NDZjNmQ1NzY3ZGIyYTQ0NWI3NjU0MDJjNTk3ODdjYWYzZQpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhbiBleHBvcnRlZCBuYW1lIGtlZXBzIGl0cyBhc3NpZ25lZCBwYXRoIGFmdGVyIGEgcmVhZAk5MTFmYWQ1YWU0YmYwYWMwNTczYmMwNTAxZWIxOWNkODZhOTJjZWQwZTEzMTJhOWM3ZTFhOTcwMzljYjM3M2NkCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCWVjaG8gYW5kIHByaW50ZiBhcmd1bWVudHMgYXJlIG5vdCBjaGFuZ2VkIHBhdGhzCWQ1NTZjYzcyMjA0NmY4N2IyMGM0ZTk5N2NjMzAwNzU2YzIwMGNjMGFjNWNhMzU5YjU4M2NiYWZiMzc5MTJjNmUKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJbXJ3IHJlYWQgaXMgYSByZWFkLCBub3QgYW4gdW5wcm92ZW4gd3JpdGUJYjljMjYyYjRlNjM3YjNiZTUwNTdjNWM1ODhhZmUxYjNiMWEwMDFjZjFmMGM3ZjVlYzJjNTM1MzlkNWEyODA3Mgpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwltcncgd3JpdGUgaXMgc3RpbGwganVkZ2VkIGFzIGEgd3JpdGUJODE5YzU2ZGM4N2E3M2QyNDM5ZDA2OTI5YTUwMmY1ZDBkODM3MDVkNjhhNjM5ODJlMjRhYjgzZmQ3NDFhZmM0Mwpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlyZWFkLW9ubHkgYXJndW1lbnRzIGFyZSBub3QgY2hhbmdlZCBwYXRocwkxMTE1MGE2N2VlMzkwYmRjNjNlMzEwNmFhMTg3MDZlZjQxMjljNTYzOTM0M2M3NjRlNzQ1YTNjMWZlNmYwMDRj · test-lock-kind:replace
- 2026-09-17 · 332a707* · exit 0 · `set -o pipefail …` · acceptance-sha256:d3530d62a27672d3da6fd7700b59585804960c2d81c6fd00496fe9657138b0bf · ms:22364
