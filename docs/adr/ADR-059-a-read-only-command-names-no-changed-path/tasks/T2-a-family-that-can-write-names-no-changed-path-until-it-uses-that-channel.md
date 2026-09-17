# Task ADR-059-T2: A family that can write names no changed path until it uses that channel

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** none
**Consumes:** `READ_ARGUMENT_FAMILIES` table and `readsOnlyItsArguments` (T1); `tests/read-only-arguments.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the write-channel tests in the family table`, `a used write channel keeping every candidate`, `each named test actually running`, `the regression suites that pin path extraction`

## Goal

`sort`, `uniq`, `find`, `file`, `rg` and the read-only `git` subcommands (`diff`, `log`, `show`, `status`, `rev-parse`, `cat-file`, `grep`) contribute only a redirect target unless the segment uses that family's write channel, as listed in ADR-059's Decision.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/read-only-arguments.test.mjs` | edit | the two tests below |
| `plugin/scripts/lifecycle.mjs` | edit | channel tests for these families in `READ_ARGUMENT_FAMILIES`; the `git` branch of `readsOnlyItsArguments`; `FIND_WRITES` also matches `-fprint0` |
| `tests/advice-accuracy.test.mjs` | edit | a regression pin for the git-revision colon rule, which T2's `git show` read hid from its only test |

## Ordered Steps

1. [S1] Add the two tests and see the first fail on an assertion (TDD red). The second pins every channel and passes before the change, except `-fprint0` in the reviewer guard; S3's mutants show it can fail.
2. [S2] Add the families with their channel tests:
   - `sort` looks for a single-dash cluster containing `o` and for `--o…`/`--co…`.
   - `uniq` counts operands after options, with `-` as an operand and `-f`, `-s`, `-w` consuming a value; two or more operands use the channel.
   - `find` asks the corrected `FIND_WRITES`.
   - `git` first keeps every candidate for a `-c`/`--config-env` global option or a `GIT_…=` word before the command, then checks the subcommand's own channel options.
   - `rg` also keeps every candidate for a `RIPGREP_CONFIG_PATH=` word before the command.
3. [S3] Run the fence green and record mutants:
   - drop `sort`'s cluster test;
   - drop `sort`'s `--co` prefix;
   - let `uniq` count `-` as an option;
   - restore `FIND_WRITES`' `(?:\s|$)` ending;
   - drop `git`'s `-c` check;
   - drop `git`'s `--output`;
   - drop `rg`'s `--pre`.

   [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(a family that can write names no changed path until it uses that channel|a used write channel keeps every candidate)$' tests/read-only-arguments.test.mjs 2>&1) \
  && for name in 'a family that can write names no changed path until it uses that channel' 'a used write channel keeps every candidate'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs tests/reviewer-guard.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a family that can write names no changed path until it uses that channel` | `tests/read-only-arguments.test.mjs` | the measured reads — `sort`, `uniq`, `find docs -name '*.md'`, `file`, `rg`, `git diff --`, `git log --`, `git show`, `git status`, `git rev-parse`, `git cat-file`, `git grep -n a` — beside a write classify `mutation` and yield no path | — | S1, S2 |
| `a used write channel keeps every candidate` | `tests/read-only-arguments.test.mjs` | each channel still yields its `.md` path: `sort -o F`, `-oF`, `-uo F`, `--output=F`, `--out=F`, `--compress-program=CMD`, `uniq IN OUT`, `uniq - OUT`, `find -delete`, `-exec`, `-fprint0 F`, `file -C`, `git diff/log/show --output=F`, `git -c diff.external=CMD diff`, `GIT_EXTERNAL_DIFF=CMD git diff`, `git grep -O`, `git grep --textconv`, `rg --pre`, `rg --hostname-bin`, `RIPGREP_CONFIG_PATH=F rg`; and `FIND_WRITES` matches `-fprint0` | — | S1, S2 |
| `a revision path under a used git channel is not a changed path` | `tests/advice-accuracy.test.mjs` | `git diff --output=docs/timing.md HEAD:docs/BACKLOG.md HEAD:notes.md` yields `docs/timing.md` and no `HEAD:` path | — | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `printsOnly` asks the table; each read test asserts `classifyCommand` returns `mutation`; S3's mutants remove a channel test |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | ADR-059's Follow-up replay |

**A surviving mutant, 2026-09-17.** Deleting the git-revision colon rule (`if (/^.{2,}:/.test(candidate)) continue`) survived this fence after S2, though T1's fence killed it with the same suites. `tests/lifecycle.test.mjs` pinned the rule only through `git show <rev>:<path>`, which S2 makes a read. The rule still decides for a git read that uses its channel. So a regression pin was added to `tests/advice-accuracy.test.mjs`, which this fence runs whole, and the mutant was run again.

## Mutation Log
- 2026-09-17 · 7d2b7c3* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · sort -o, -oF and -uo no longer count as its channel · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · covers:the write-channel tests in the family table
- 2026-09-17 · 7d2b7c3* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · sort --compress-program no longer counts as a channel · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · covers:the write-channel tests in the family table
- 2026-09-17 · 7d2b7c3* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · uniq - OUT counts one operand, so the file it writes is dropped · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · covers:the write-channel tests in the family table
- 2026-09-17 · 7d2b7c3* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · FIND_WRITES misses -fprint0 again, so find -fprint0 F drops F · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · covers:the write-channel tests in the family table
- 2026-09-17 · 7d2b7c3* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · every channel is ignored, so each family drops the file its channel writes · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · covers:a used write channel keeping every candidate
- 2026-09-17 · 7d2b7c3* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · git -c diff.external=CMD diff no longer keeps its candidates · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · covers:the write-channel tests in the family table
- 2026-09-17 · 7d2b7c3* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a GIT_EXTERNAL_DIFF= prefix no longer keeps the candidates of git diff · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · covers:the write-channel tests in the family table
- 2026-09-17 · 7d2b7c3* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · git diff/log/show --output=F drops F · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · covers:the write-channel tests in the family table
- 2026-09-17 · 7d2b7c3* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · rg --pre CMD no longer keeps its candidates · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · covers:the write-channel tests in the family table
- 2026-09-17 · 7d2b7c3* · mutant killed · exit 1 · `tests/read-only-arguments.test.mjs` · a renamed test selects nothing and the per-name ok grep must refuse it · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · covers:each named test actually running
- 2026-09-17 · 7d2b7c3* · mutant survived · exit 0 · `plugin/scripts/lifecycle.mjs` · a git revision such as origin/main:docs/x.md resolves as a changed path; tests/lifecycle.test.mjs kills it · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · covers:the regression suites that pin path extraction
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-09-17 · 7d2b7c3* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a git revision under a used channel resolves as a changed path; the regression pin in tests/advice-accuracy.test.mjs kills it · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · covers:the regression suites that pin path extraction

## Invariants

- A segment that uses its family's channel keeps every candidate, as before this record.
- `git ls-files` (ADR-058 T5) answers as before.
- `FIND_WRITES` only gains matches; the reviewer guard refuses nothing it allowed that did not write.

## Risks

- A configured `diff.external` or textconv driver writes under a plain `git diff`. Advice only; named in ADR-059's Consequences.

## Stop Condition

Stop and ask if a channel measured in ADR-059's Context does not change the tree when re-run on this machine, or if `tests/reviewer-guard.test.mjs` goes red.

## Out of Scope

- `ag`, and GNU findutils primaries beyond `FIND_WRITES` (deferred: docs/BACKLOG.md §220)

## Verification Log
- 2026-09-17 · 7d2b7c3* · exit 1 · `set -o pipefail …` · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · ms:235 · test-lock-sha256:8bd6dd3466400ddf8bcfa377d12d7ec6ea939c998fb6181b598d2c09a43fc692 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBjaGFubmVsLWZyZWUgcmVhZCBuYW1lcyBubyBjaGFuZ2VkIHBhdGgJZjI0YzIwYmYyMzcwYWJhOGUwZjNmZGI3NWUyMDNlMjM4NmZmNWMzZmNkMDhjOTAyODI0YzA1N2QwMWM4MmI4OApib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBmYW1pbHkgdGhhdCBjYW4gd3JpdGUgbmFtZXMgbm8gY2hhbmdlZCBwYXRoIHVudGlsIGl0IHVzZXMgdGhhdCBjaGFubmVsCThkNjZkMDcwOTk5OTAxZDUwYWZhODc5ZjhjMDE5YTBmNmZkOGM5NGQ4NjQ5N2I2NDYzYTJiZjk4NGZiMTUwMmMKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgcmVkaXJlY3QgYmVzaWRlIGEgY2hhbm5lbC1mcmVlIHJlYWQgaXMgc3RpbGwgYSBjaGFuZ2VkIHBhdGgJMTczYjI0ZGE2YjFmZjJiODk5NGJkNTlkZjY3YjUzZTdkNzcyM2RjOWE3NjA4M2E0OWVhM2FjYzFmMDdiNTJlNwpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSB1c2VkIHdyaXRlIGNoYW5uZWwga2VlcHMgZXZlcnkgY2FuZGlkYXRlCTRjZTRhOGVjMjBmNTdmOTM4MGY2NDQ4ZjljN2U0NDdmNDQ1MjU5OTIxZTBjOWE1NTY5ZWQxNWUwOTYwYzJiMDI
  ```
  ```
- 2026-09-17 · 7d2b7c3* · exit 0 · `set -o pipefail …` · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · ms:29456
- 2026-09-17 · 7d2b7c3* · exit 0 · `set -o pipefail …` · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · ms:28556
- 2026-09-17 · 7d2b7c3* · exit 0 · `set -o pipefail …` · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · ms:24894
- 2026-09-17 · 7d2b7c3* · exit 0 · `set -o pipefail …` · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · ms:25753
- 2026-09-17 · 7d2b7c3* · exit 0 · `set -o pipefail …` · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · ms:26139
- 2026-09-17 · 7d2b7c3* · exit 0 · `set -o pipefail …` · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · ms:31495
- 2026-09-17 · 7d2b7c3* · exit 0 · `set -o pipefail …` · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · ms:25145
- 2026-09-17 · 7d2b7c3* · exit 0 · `set -o pipefail …` · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · ms:24526
- 2026-09-17 · 7d2b7c3* · exit 0 · `set -o pipefail …` · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · ms:24087
- 2026-09-17 · 7d2b7c3* · exit 0 · `set -o pipefail …` · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · ms:28507
- 2026-09-17 · 7d2b7c3* · exit 0 · `set -o pipefail …` · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · ms:35155
- 2026-09-17 · 7d2b7c3* · exit 0 · `set -o pipefail …` · acceptance-sha256:65995b91291408322ed96c686985ca0e3f88ea6ac2b7a4d1d3c9f5a840b7e5f3 · ms:28804
