# Task ADR-098-T1: One Codex launcher, with stdin closed, a hard budget and the sol pin

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (`host-review.mjs`, two skills, one rules note, one new test file, catalogue)
**Owner:** unassigned
**Produces:** `codexInvocation` and `CODEX_TIMEOUT_MS` exported from `host-review.mjs`; the `--prompt-file` CLI form; `CODEX_MODEL = 'gpt-6.1-sol'`; `reviewPrompt` in its post-T1 form
**Consumes:** none
**Data dependency:** needs a Codex CLI for S2 only (its `exec --help` and `debug models --bundled` output, recorded in the sign-off with its `--version`); every other step and the fence are hermetic, the tests faking `run` or pointing `CODEX_CLI_PATH` at a stub
**Proof map:** v1
**Rests-on:** `stdin is closed`, `the budget kills the run`, `one model constant`, `the skills launch through host-review`

## Goal

Every Codex run the plugin starts is built by `host-review.mjs` (stdin closed, killed at one budget, pinned to `gpt-6.1-sol`, `-o` and
`--ignore-user-config` reconciled), and both Codex skills launch through it.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/host-review.mjs` | edit | `codexInvocation({ bin, repo, effort, prompt, output, ignoreUserConfig, skipGitRepoCheck })` returns argv and spawn options (`stdio: ['ignore', 'pipe', 'pipe']`, `timeout: CODEX_TIMEOUT_MS`, `killSignal: 'SIGKILL'`, `windowsHide: true`); `hostReview` (`:102-123`) uses it, with `-o` in a fresh `mkdtemp` directory read and removed after exit; the `--ignore-user-config` probe; `CODEX_MODEL` (`:11`); `EFFORTS` (`:12`) set to what S2 measured; the `--prompt-file` CLI form in the main block (`:151-158`), which is what selects the new path |
| `plugin/skills/codex-review/SKILL.md` | edit | `:112-166` launch through `node ${CLAUDE_PLUGIN_ROOT}/scripts/host-review.mjs --host codex --effort <e> --repo <root> --prompt-file <file>`; `:4`, `:29`, `:94` name `gpt-6.1-sol`; the recursion section (`:20-25`) and every `CODEX-REVIEW-LEAF:` marker stay |
| `plugin/skills/codex-advise/SKILL.md` | edit | `:63-85` the same; `:4`, `:30`, `:60`; the recursion section (`:20-26`) and every `CODEX-ADVISE-LEAF:` marker stay |
| `.claude/rules/12-reviews.md` | edit | `:26-28`: the launcher closes stdin and kills at its budget; the reason stays |
| `tests/codex-launcher.test.mjs` | add | the five tests below |
| `tests/host-review.test.mjs` | read | imports `CODEX_MODEL`, fakes `run` with schema JSON on stdout and no `-o` file, and reads the prompt as `argv.at(-1)` (`:84-93`): the `-o` file is read first and stdout when it is empty, and the prompt stays the last argument, so the file is unchanged (0 locks) |
| `tests/workflows.test.mjs` | read | the locked "Codex review and advice skills mark spawned sessions as non-recursive leaves" (`:218-226`, ADR-057 T3) must stay byte-identical and green |
| `tests/mutations/plugin/scripts/host-review.mjs.json` | edit | one entry per `Rests-on` name; the three existing `from` lines (`:29`, `:93`, `:134`) are not edited by this task |
| `tests/mutations/plugin/skills/codex-review/SKILL.md.json` | add | the entry for `the skills launch through host-review` (a skill that writes `codex exec` again) |

## Ordered Steps

1. [S1] Write the five tests of the Tests table in `tests/codex-launcher.test.mjs` and record the red run with `adr-verify` (TDD red).
2. [S2] Resolve the Codex binary as `resolveCodex` does; run its `--version`, `exec --help` and `debug models --bundled`; record whether `-o` and `--ignore-user-config` are listed and which efforts `gpt-6.1-sol` exposes, and set `EFFORTS` to that set. [proof: human: the sign-off quotes the version and the matching lines of the two listings]
3. [S3] Implement `codexInvocation`, the budget and kill, the `-o` directory, the probe, the model constant and the `--prompt-file` form in `host-review.mjs`.
4. [S4] Rewrite both skills' launch sections to call `host-review.mjs --prompt-file`; keep their recursion sections, markers and output blocks; name the model in their descriptions, and align their effort tables (`codex-review:81-100`, `codex-advise:49-61`) and descriptions with the set S2 measured.
5. [S5] Update `.claude/rules/12-reviews.md:26-28`. [proof: human: the note names the launcher and still says why the redirect exists]
6. [S6] Record one killed mutant per `Rests-on` name with `adr-verify --mutant`. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/codex-launcher.test.mjs tests/host-review.test.mjs tests/workflows.test.mjs 2>&1) \
  && for t in 'a Codex run closes stdin and is killed at its budget' 'a Codex run past its budget is unavailable, never clean' 'the Codex command line has one builder and one model' 'the prompt-file form sends the caller'"'"'s prompt and prints the final message' 'both Codex skills launch through host-review and keep their recursion markers'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done \
  && test "$(git grep -c "gpt-6-astra" -- plugin | wc -l)" -eq 0
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a Codex run closes stdin and is killed at its budget` | `tests/codex-launcher.test.mjs` | `codexInvocation` options: `stdio[0]` is `'ignore'`, `timeout` is `CODEX_TIMEOUT_MS`, `killSignal` is `'SIGKILL'`; `hostReview` hands exactly those options to a fake `run` | none | S1, S3 |
| `a Codex run past its budget is unavailable, never clean` | `tests/codex-launcher.test.mjs` | a fake `run` returning `{ error: { code: 'ETIMEDOUT' }, signal: 'SIGKILL' }` with schema-valid stdout: the result is `unavailable` and its reason names the budget | none | S1, S3 |
| `the Codex command line has one builder and one model` | `tests/codex-launcher.test.mjs` | argv holds `-m gpt-6.1-sol`, `-o` under a fresh temporary directory, and `--ignore-user-config` exactly when the faked help lists it; the prompt is the last argument; no shipped file but `host-review.mjs` builds a `codex exec` argv | none | S1, S3 |
| `the prompt-file form sends the caller's prompt and prints the final message` | `tests/codex-launcher.test.mjs` | the CLI with `CODEX_CLI_PATH` at a stub that writes its `-o` file: stdout is that file's text; a stub that exits 1 gives exit 2 and a reason | none | S1, S3 |
| `both Codex skills launch through host-review and keep their recursion markers` | `tests/codex-launcher.test.mjs` | neither skill holds a `codex" exec` or `<absolute-codex>" exec` line; each documents `host-review.mjs --host codex` with `--repo` and `--prompt-file`; `CODEX-REVIEW-LEAF:` at least 3 times and `CODEX-ADVISE-LEAF:` at least twice | none | S1, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the first three tests |
| 2 — something selects it | `hostReview` calls `codexInvocation` (the first test fails if it builds its own argv); the CLI branch selects `--prompt-file` (the fourth test fails if it is deleted) |
| 3 — the caller can discover it | both skills document the command, and the fifth test reads them |
| 4 — it is used | nothing measures this yet: a count of Codex runs ended by the budget against runs completed, from transcripts |

## Mutation Log
- 2026-10-12 · 7cd97baa* · mutant killed · exit 1 · `plugin/scripts/host-review.mjs` · a Codex run with an open stdin can wait for input forever · acceptance-sha256:f459671870efbfc7f1b52b10e427b0b8a69ba8f13615056d2edb41be36b4d5df · covers:stdin is closed
- 2026-10-12 · 7cd97baa* · mutant killed · exit 1 · `plugin/scripts/host-review.mjs` · a run killed at its budget is not said to be one · acceptance-sha256:f459671870efbfc7f1b52b10e427b0b8a69ba8f13615056d2edb41be36b4d5df · covers:the budget kills the run
- 2026-10-12 · 7cd97baa* · mutant killed · exit 1 · `plugin/scripts/host-review.mjs` · the pinned model drifts from the reviewer the owner chose · acceptance-sha256:f459671870efbfc7f1b52b10e427b0b8a69ba8f13615056d2edb41be36b4d5df · covers:one model constant
- 2026-10-12 · 7cd97baa* · mutant killed · exit 1 · `plugin/skills/codex-review/SKILL.md` · a skill builds its own codex exec command again · acceptance-sha256:f459671870efbfc7f1b52b10e427b0b8a69ba8f13615056d2edb41be36b4d5df · covers:the skills launch through host-review

## Invariants

- quality-cycle's JSON path is unchanged: `validReview`, `reviewFromOutput` and ADR-062's schema; the prompt stays the last argv element.
- `tests/workflows.test.mjs` "Codex review and advice skills mark spawned sessions as non-recursive leaves" (locked by ADR-057 T3) stays byte-identical and passes: at least three `CODEX-REVIEW-LEAF:`, at least two `CODEX-ADVISE-LEAF:`, and both "Do not invoke … launch another `codex exec`" sentences remain.
- A missing binary, an effort outside the measured set, a nonzero exit, an empty output file or a timeout is `unavailable`, never clean.
- Relock cost: zero. `python3 scripts/test-locks.py` printed 0 locks on `tests/host-review.test.mjs` and 17 on `tests/workflows.test.mjs` (all ADR-057 T3), none of whose bodies this task edits.

## Risks

- `gpt-6.1-sol` missing from an adopter's catalog: the run is `unavailable`, which fails closed.
- The 600 s budget ends a long review: the result names the budget, so a reader knows it was killed, not clean.

## Stop Condition

Stop and ask if S2 shows `gpt-6.1-sol` absent from the bundled catalog or `-o` unsupported, or if keeping the skills' markers would need
the locked test changed.

## Out of Scope

- The skills' prompt contracts and output blocks (the parent record keeps them)
- Pi and Cursor runners (ADR-062)

## Verification Log
- 2026-10-12 · 7cd97baa* · exit 1 · `out=$(node --test --test-reporter=tap tests/codex-launcher.test.mjs tests/host-review.test.mjs tests/workflows.test.mjs 2>&1) \ …` · acceptance-sha256:f459671870efbfc7f1b52b10e427b0b8a69ba8f13615056d2edb41be36b4d5df · ms:224 · test-lock-sha256:5a22d2858dc935f231e7f732c452251094bcb3695febf115211c9e214a0ab5e4 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvY29kZXgtbGF1bmNoZXIudGVzdC5tanMJYSBDb2RleCBydW4gY2xvc2VzIHN0ZGluIGFuZCBpcyBraWxsZWQgYXQgaXRzIGJ1ZGdldAljZjdlNTdkZTM4YzEyNDljMzc4ZWUyYzI4MWEyNWIwYmQ1MjI1YWNlMGY5ZWVhZDhkNWRlM2U4YzQ2ZGQ5N2ViCmJvZHkJdGVzdHMvY29kZXgtbGF1bmNoZXIudGVzdC5tanMJYSBDb2RleCBydW4gcGFzdCBpdHMgYnVkZ2V0IGlzIHVuYXZhaWxhYmxlLCBuZXZlciBjbGVhbgljNTZiMmI1MDY2MDYxOWQ4MjMzZmIwMTlkMjRjYzJjZDNiNzNmYmY0NGI4ZjFjMzQyN2RjOGEwN2UyODRlYWQ1CmJvZHkJdGVzdHMvY29kZXgtbGF1bmNoZXIudGVzdC5tanMJYm90aCBDb2RleCBza2lsbHMgbGF1bmNoIHRocm91Z2ggaG9zdC1yZXZpZXcgYW5kIGtlZXAgdGhlaXIgcmVjdXJzaW9uIG1hcmtlcnMJOGQ1M2ZiNDIwYzljOWY5YmViMTE1ZGYyMzllOTkxMTc0ZGI2YzU3OWNmMDIzNTMwZjg0NjkwNTI5MjM2OWJhZApib2R5CXRlc3RzL2NvZGV4LWxhdW5jaGVyLnRlc3QubWpzCXRoZSBDb2RleCBjb21tYW5kIGxpbmUgaGFzIG9uZSBidWlsZGVyIGFuZCBvbmUgbW9kZWwJNDRmYjU4MGFmNTM3MTE1MzdlNzhhNWJiZGI2NzRlMGRhNGQyOWIzNDc4NTViNTk5YWY1NmZmOTMyN2Q0MWYzYQpib2R5CXRlc3RzL2NvZGV4LWxhdW5jaGVyLnRlc3QubWpzCXRoZSBwcm9tcHQtZmlsZSBmb3JtIHNlbmRzIHRoZSBjYWxsZXIncyBwcm9tcHQgYW5kIHByaW50cyB0aGUgZmluYWwgbWVzc2FnZQllYTIzYzY0ZTQ2YTk3YTc4ODM1MjBlMjE1MzE1NTIyNTQwMjIwYWI2OGUxZTE3Yzc3ZjFiYjg2NDhmMjQ3NWE5
  ```
  ```
- 2026-10-12 · 7cd97baa* · exit 0 · `out=$(node --test --test-reporter=tap tests/codex-launcher.test.mjs tests/host-review.test.mjs tests/workflows.test.mjs 2>&1) \ …` · acceptance-sha256:f459671870efbfc7f1b52b10e427b0b8a69ba8f13615056d2edb41be36b4d5df · ms:1067
- 2026-10-12 · 7cd97baa* · exit 0 · `out=$(node --test --test-reporter=tap tests/codex-launcher.test.mjs tests/host-review.test.mjs tests/workflows.test.mjs 2>&1) \ …` · acceptance-sha256:f459671870efbfc7f1b52b10e427b0b8a69ba8f13615056d2edb41be36b4d5df · ms:1026
- 2026-10-12 · 7cd97baa* · exit 0 · `out=$(node --test --test-reporter=tap tests/codex-launcher.test.mjs tests/host-review.test.mjs tests/workflows.test.mjs 2>&1) \ …` · acceptance-sha256:f459671870efbfc7f1b52b10e427b0b8a69ba8f13615056d2edb41be36b4d5df · ms:907
- 2026-10-12 · 7cd97baa* · exit 0 · `out=$(node --test --test-reporter=tap tests/codex-launcher.test.mjs tests/host-review.test.mjs tests/workflows.test.mjs 2>&1) \ …` · acceptance-sha256:f459671870efbfc7f1b52b10e427b0b8a69ba8f13615056d2edb41be36b4d5df · ms:889
- 2026-10-12 · 7cd97baa* · exit 0 · `out=$(node --test --test-reporter=tap tests/codex-launcher.test.mjs tests/host-review.test.mjs tests/workflows.test.mjs 2>&1) \ …` · acceptance-sha256:f459671870efbfc7f1b52b10e427b0b8a69ba8f13615056d2edb41be36b4d5df · ms:828
- 2026-10-12 · 7cd97baa* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:f459671870efbfc7f1b52b10e427b0b8a69ba8f13615056d2edb41be36b4d5df · ms:0 · test-lock-sha256:7f3dbf729874e992b6f60d027973667c8e2f5d074fc31d41c7f64c51251af597 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvY29kZXgtbGF1bmNoZXIudGVzdC5tanMJYSBDb2RleCBydW4gY2xvc2VzIHN0ZGluIGFuZCBpcyBraWxsZWQgYXQgaXRzIGJ1ZGdldAljZjdlNTdkZTM4YzEyNDljMzc4ZWUyYzI4MWEyNWIwYmQ1MjI1YWNlMGY5ZWVhZDhkNWRlM2U4YzQ2ZGQ5N2ViCmJvZHkJdGVzdHMvY29kZXgtbGF1bmNoZXIudGVzdC5tanMJYSBDb2RleCBydW4gcGFzdCBpdHMgYnVkZ2V0IGlzIHVuYXZhaWxhYmxlLCBuZXZlciBjbGVhbgljNTZiMmI1MDY2MDYxOWQ4MjMzZmIwMTlkMjRjYzJjZDNiNzNmYmY0NGI4ZjFjMzQyN2RjOGEwN2UyODRlYWQ1CmJvZHkJdGVzdHMvY29kZXgtbGF1bmNoZXIudGVzdC5tanMJYm90aCBDb2RleCBza2lsbHMgbGF1bmNoIHRocm91Z2ggaG9zdC1yZXZpZXcgYW5kIGtlZXAgdGhlaXIgcmVjdXJzaW9uIG1hcmtlcnMJOGY1OTBlYmYyMmZlZDkzMDM4NWQ3Y2M2NmYxMTA5YWZkZmE4Y2U1NmNjOTcyZDBmMDdhYmYzYTY0MjVmNWRiMApib2R5CXRlc3RzL2NvZGV4LWxhdW5jaGVyLnRlc3QubWpzCXRoZSBDb2RleCBjb21tYW5kIGxpbmUgaGFzIG9uZSBidWlsZGVyIGFuZCBvbmUgbW9kZWwJNDRmYjU4MGFmNTM3MTE1MzdlNzhhNWJiZGI2NzRlMGRhNGQyOWIzNDc4NTViNTk5YWY1NmZmOTMyN2Q0MWYzYQpib2R5CXRlc3RzL2NvZGV4LWxhdW5jaGVyLnRlc3QubWpzCXRoZSBwcm9tcHQtZmlsZSBmb3JtIHNlbmRzIHRoZSBjYWxsZXIncyBwcm9tcHQgYW5kIHByaW50cyB0aGUgZmluYWwgbWVzc2FnZQllYTIzYzY0ZTQ2YTk3YTc4ODM1MjBlMjE1MzE1NTIyNTQwMjIwYWI2OGUxZTE3Yzc3ZjFiYjg2NDhmMjQ3NWE5 · test-lock-kind:replace
