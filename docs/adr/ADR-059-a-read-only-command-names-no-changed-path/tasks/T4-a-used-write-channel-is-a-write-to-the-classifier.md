# Task ADR-059-T4: A used write channel is a write to the classifier and the guard

**Depends-on:** T3
**Covers:** none — no spec
**Estimated scope:** S (two files)
**Owner:** unassigned
**Produces:** none
**Consumes:** `READ_ARGUMENT_FAMILIES` table and `readsOnlyItsArguments` (T1); `tests/read-only-arguments.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the write-channel hook in classifyCommand`, `a program channel staying unrecognised`, `a read without its channel staying neither`, `each named test actually running`, `the regression suites that pin the classifier`

Added 2026-09-17 from a Codex review (`gpt-6-astra`, xhigh) of `e813f0a...ecd7852`. At `ecd7852`, every one of these classifies `neither`, so a successful run records no authorship and the reviewer guard exits 0:
- **Output channels:** `uniq /dev/null README.md`, `sort -o README.md /dev/null`, `find … -fprint out.txt`, `file -C -m docs/magic`, `git diff --output=out.txt HEAD`.
- **Program channels:** `rg --pre CMD`, `sort --compress-program=CMD`, `git grep -O'CMD'`.

The same was true at `e813f0a` for the bare forms. ADR-058 T1's timeout peel carried it to `gtimeout 5 uniq /dev/null README.md`, which had been `unrecognised`. These are the channels T2 measured; the extractor knew them and the classifier did not.

## Goal

`classifyCommand` returns `mutation` for a read-only family that uses a measured output channel, and `unrecognised` for one that runs a program. This holds at the top level, under a peeled wrapper, and inside `$(…)`, so transcript authorship and the reviewer guard follow.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/read-only-arguments.test.mjs` | edit | the two tests below |
| `plugin/scripts/lifecycle.mjs` | edit | a `writeChannelOf(command)` hook over `shellCommandRegions × shellSegments`, passed to `classifyCommandWithHooks`; `sort`'s option split into output and program patterns the extractor also uses |
| `plugin/scripts/classify-command.mjs` | edit | after the family checks, `unrecognised` or `mutation` from the hook before the mutation boolean |

## Ordered Steps

1. [S1] Add the two tests and see the first fail on an assertion (TDD red). The second pins reads without a channel and passes before the change; S3's mutants show it can fail.
2. [S2] Add `writeChannelOf(command)`.
   - **`mutation` (output channels):**
     - `sort` with a short cluster holding `o` or `--o…`;
     - `uniq` with two operands;
     - `find` with `-delete`, `-fls`, `-fprint`, `-fprint0` or `-fprintf`;
     - `file` with a short cluster holding `C` or `--comp…`;
     - `git diff`, `log` or `show` with `--output`.
   - **`unrecognised` (program channels):** `sort --co…`, `rg --pre`/`--pre-glob`/`--hostname-bin`, `git grep -O`/`--open-files-in-pager`.

   Wire it as a hook in `classifyCommand`: `unrecognised` returns at once, and `mutation` joins the mutation boolean.
3. [S3] Run the fence green and record mutants: drop the hook from the hooks object; ignore `mutation` from it; ignore `unrecognised`; drop `uniq`'s operand test; drop the `$(…)` regions from the hook. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(a used write channel is a write to the classifier and the guard|a read without its channel is still not a write)$' tests/read-only-arguments.test.mjs 2>&1) \
  && for name in 'a used write channel is a write to the classifier and the guard' 'a read without its channel is still not a write'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs tests/classify.test.mjs tests/reviewer-guard.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a used write channel is a write to the classifier and the guard` | `tests/read-only-arguments.test.mjs` | the output shapes above, bare, under `gtimeout 5` and in `echo "$(…)"`, classify `mutation`; the program shapes classify `unrecognised`; a transcript whose only command is `gtimeout 5 uniq /dev/null README.md` records authorship; the reviewer guard refuses `gtimeout 5 uniq /dev/null README.md` and `git diff --output=README.md HEAD` | — | S1, S2 |
| `a read without its channel is still not a write` | `tests/read-only-arguments.test.mjs` | `uniq docs/a.md`, `uniq -c -f 1 docs/a.md`, `sort -u docs/a.md`, `gtimeout 5 sort docs/a.md`, `find docs -name '*.md'`, `file docs/a.md`, `git diff HEAD`, `git log -1`, `rg a docs` classify `neither`, and the guard passes `sort README.md` | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `classifyCommand` passes the hook; `analyzeTranscript` and the reviewer guard read `classifyCommand`, and the test drives the guard as a process; S3's mutant drops the hook |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | every commit and Stop advisory and every reviewer-guard decision |

## Mutation Log
- 2026-09-17 · 28ac724* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the hook is never passed, so uniq IN OUT and sort -o F are neither again · acceptance-sha256:46941cc9bd240b7c99cf4eee523a12571ab5413e6ad67847fa8ccc8119e3c761 · covers:the write-channel hook in classifyCommand
- 2026-09-17 · 28ac724* · mutant killed · exit 1 · `plugin/scripts/classify-command.mjs` · an output channel from the hook is ignored, so it classifies neither · acceptance-sha256:46941cc9bd240b7c99cf4eee523a12571ab5413e6ad67847fa8ccc8119e3c761 · covers:the write-channel hook in classifyCommand
- 2026-09-17 · 28ac724* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · uniq IN OUT is not an output channel, so gtimeout 5 uniq /dev/null README.md passes the guard again · acceptance-sha256:46941cc9bd240b7c99cf4eee523a12571ab5413e6ad67847fa8ccc8119e3c761 · covers:the write-channel hook in classifyCommand
- 2026-09-17 · 28ac724* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a channel inside $(…) is not seen · acceptance-sha256:46941cc9bd240b7c99cf4eee523a12571ab5413e6ad67847fa8ccc8119e3c761 · covers:the write-channel hook in classifyCommand
- 2026-09-17 · 28ac724* · mutant killed · exit 1 · `plugin/scripts/classify-command.mjs` · rg --pre CMD and git grep -O CMD fall back to neither · acceptance-sha256:46941cc9bd240b7c99cf4eee523a12571ab5413e6ad67847fa8ccc8119e3c761 · covers:a program channel staying unrecognised
- 2026-09-17 · 28ac724* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · every sort is an output channel, so sort -u docs/a.md classifies mutation · acceptance-sha256:46941cc9bd240b7c99cf4eee523a12571ab5413e6ad67847fa8ccc8119e3c761 · covers:a read without its channel staying neither
- 2026-09-17 · 28ac724* · mutant killed · exit 1 · `tests/read-only-arguments.test.mjs` · a renamed test selects nothing and the per-name ok grep must refuse it · acceptance-sha256:46941cc9bd240b7c99cf4eee523a12571ab5413e6ad67847fa8ccc8119e3c761 · covers:each named test actually running
- 2026-09-17 · 28ac724* · mutant killed · exit 1 · `plugin/scripts/classify-command.mjs` · a path-shaped executable is judged by its bare family again; classify.test and reviewer-guard.test kill it · acceptance-sha256:46941cc9bd240b7c99cf4eee523a12571ab5413e6ad67847fa8ccc8119e3c761 · covers:the regression suites that pin the classifier

## Invariants

- ADR-047: an unmeasured family is still `unrecognised`; this only moves measured families off `neither`.
- A read without its channel keeps its classification.

## Risks

- `find … -exec`, `git -c diff.external=…` and configured textconv or pager tools still classify as they did; named in BACKLOG §220.

## Stop Condition

Stop and ask if `tests/classify.test.mjs` or `tests/reviewer-guard.test.mjs` goes red.

## Out of Scope

- `find -exec`/`-execdir`/`-ok`, and git tools chosen by `-c`, `GIT_…=` or configuration, as classifier channels (deferred: docs/BACKLOG.md §220)

## Verification Log
- 2026-09-17 · 28ac724* · exit 1 · `set -o pipefail …` · acceptance-sha256:46941cc9bd240b7c99cf4eee523a12571ab5413e6ad67847fa8ccc8119e3c761 · ms:186 · test-lock-sha256:3443aeafb533a85d426cfb781ffda5c26d8b437c1ea5a079769b8a45ce62120a · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBjaGFubmVsLWZyZWUgcmVhZCBuYW1lcyBubyBjaGFuZ2VkIHBhdGgJZjI0YzIwYmYyMzcwYWJhOGUwZjNmZGI3NWUyMDNlMjM4NmZmNWMzZmNkMDhjOTAyODI0YzA1N2QwMWM4MmI4OApib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBmYW1pbHkgdGhhdCBjYW4gd3JpdGUgbmFtZXMgbm8gY2hhbmdlZCBwYXRoIHVudGlsIGl0IHVzZXMgdGhhdCBjaGFubmVsCThkNjZkMDcwOTk5OTAxZDUwYWZhODc5ZjhjMDE5YTBmNmZkOGM5NGQ4NjQ5N2I2NDYzYTJiZjk4NGZiMTUwMmMKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgcmVhZCB3aXRob3V0IGl0cyBjaGFubmVsIGlzIHN0aWxsIG5vdCBhIHdyaXRlCWI5YTUyODBmMGI3NWI2NzZiZjZkYjQ1NWU2NDExMmMyOWYyNzRkZjUwNWEyNGE0MDU0NjJkMjE0MThiZTA1ZWMKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgcmVkaXJlY3QgYmVzaWRlIGEgY2hhbm5lbC1mcmVlIHJlYWQgaXMgc3RpbGwgYSBjaGFuZ2VkIHBhdGgJMTczYjI0ZGE2YjFmZjJiODk5NGJkNTlkZjY3YjUzZTdkNzcyM2RjOWE3NjA4M2E0OWVhM2FjYzFmMDdiNTJlNwpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSB1c2VkIHdyaXRlIGNoYW5uZWwgaXMgYSB3cml0ZSB0byB0aGUgY2xhc3NpZmllciBhbmQgdGhlIGd1YXJkCTgwMmY0NTkxNzE0N2M1YTFjYWRjNDZjNDc3NDhlNWIzN2MxMzNkMzdhODdkOWY4ZTk0NGY3YWU0YWJkMjA0Y2QKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgdXNlZCB3cml0ZSBjaGFubmVsIGtlZXBzIGV2ZXJ5IGNhbmRpZGF0ZQk0Y2U0YThlYzIwZjU3ZjkzODBmNjQ0OGY5YzdlNDQ3ZjQ0NTI1OTkyMWUwYzlhNTU2OWVkMTVlMDk2MGMyYjAyCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhbiBhc3NpZ25lZCBwYXRoIHVzZWQgb25seSBieSByZWFkcyBpcyBub3QgYSBjaGFuZ2VkIHBhdGgJYThmZmE2NTMyZjVmYWY4MzdhYWY3N2NiMDhlNmNjYWQ5MTkwNDZkMTEwMzdmNDA1ODBjOGJlNGRmYjRjNDFiNgpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYW4gYXNzaWduZWQgcGF0aCB3cml0dGVuLCBoaWRkZW4sIGV4cG9ydGVkIG9yIG5ldmVyIHJlZmVyZW5jZWQgaXMgc3RpbGwgYSBjaGFuZ2VkIHBhdGgJM2Q5ZjNmYmZlMGE0MzlhYzY3YWE1OGExNDQ1YzgxZTljMWZkM2Y0MzI0NTJlZjU1YWUxMzhiYTcwNGU3ZTZlOQ
  ```
  ```
- 2026-09-17 · 28ac724* · exit 0 · `set -o pipefail …` · acceptance-sha256:46941cc9bd240b7c99cf4eee523a12571ab5413e6ad67847fa8ccc8119e3c761 · ms:24951
- 2026-09-17 · 28ac724* · exit 0 · `set -o pipefail …` · acceptance-sha256:46941cc9bd240b7c99cf4eee523a12571ab5413e6ad67847fa8ccc8119e3c761 · ms:23857
- 2026-09-17 · 28ac724* · exit 0 · `set -o pipefail …` · acceptance-sha256:46941cc9bd240b7c99cf4eee523a12571ab5413e6ad67847fa8ccc8119e3c761 · ms:25060
- 2026-09-17 · 28ac724* · exit 0 · `set -o pipefail …` · acceptance-sha256:46941cc9bd240b7c99cf4eee523a12571ab5413e6ad67847fa8ccc8119e3c761 · ms:25130
- 2026-09-17 · 28ac724* · exit 0 · `set -o pipefail …` · acceptance-sha256:46941cc9bd240b7c99cf4eee523a12571ab5413e6ad67847fa8ccc8119e3c761 · ms:27666
- 2026-09-17 · 28ac724* · exit 0 · `set -o pipefail …` · acceptance-sha256:46941cc9bd240b7c99cf4eee523a12571ab5413e6ad67847fa8ccc8119e3c761 · ms:26563
- 2026-09-17 · 28ac724* · exit 0 · `set -o pipefail …` · acceptance-sha256:46941cc9bd240b7c99cf4eee523a12571ab5413e6ad67847fa8ccc8119e3c761 · ms:26814
- 2026-09-17 · 28ac724* · exit 0 · `set -o pipefail …` · acceptance-sha256:46941cc9bd240b7c99cf4eee523a12571ab5413e6ad67847fa8ccc8119e3c761 · ms:25850
