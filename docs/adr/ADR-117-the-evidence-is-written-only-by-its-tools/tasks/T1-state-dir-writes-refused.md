# Task ADR-117-T1: A hook-visible write into the state directory is refused

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** the state-directory refusal
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

An Edit, Write, MultiEdit, NotebookEdit or mrw MCP write, or a parsed redirect or `tee` in a Bash or PowerShell command, landing under the session repository's `<git-dir>/quality-harness/`, is refused at PreToolUse on both paths, naming the tool that writes it; `"ledgers": "warn"` warns instead (ADR-117, Decision 1).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/ledger-writes.test.mjs` | add | the task's test, with a planted twin that must fail |
| `plugin/scripts/ledger-guard.mjs`, `core/hooks/ledger_guard.go` | add | the guard: which tool write, redirection, `tee` or `sh -c` lands in the state directory, relative targets moved by a literal `cd`; the opt-out; the two texts |
| `plugin/scripts/on-pre-tool-use.mjs`, `core/hooks/publish.go` | edit | the refusal, after the reviewer guard |
| `plugin/scripts/shell-words.mjs`, `core/hooks/shellwords.go`, `core/hooks/parity_test.go`, `tests/qh-core-parity.test.mjs` | edit | each command keeps its output redirections' targets (`writes`), compared between the lexers |
| `CLAUDE.md` §3, `.claude/rules/03-gates-advise.md`, `README.md`, `plugin/README.md`, `tests/turn-end-delivery.test.mjs` | edit | three refusals are sanctioned; ADR-096's tasks relocked for the changed assertion |
| `tests/mutations/plugin/scripts/*.json` | add, edit | catalogue entries |
| `plugin/scripts/event-log.mjs` | edit | `repositoryStateDir` exported, so the guard covers the repository's own state directory under a state root (the Codex review of aae06d72..90b9ceaf) |

## Ordered Steps

1. [S1] Write the failing test, with the twins that must pass. Record the red run.
2. [S2] Implement on the Node path and in the Go core, reading redirects from the shell lexer both have.
3. [S3] Record a killed mutant per decision point, with catalogue entries for Node and Python sources; Go mutants through adr-verify with a fence that builds `qh`. [proof: mutation]

## Acceptance

```bash
node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a write into the state directory is refused, and a read of it, the tools' own runs and a write elsewhere are not` | `tests/ledger-writes.test.mjs` | each tool and each redirect form refused, under Node and Go; cat, mrw read, tail, qh-check and adr-verify passing; a write into a sandbox's ledger outside the session repository passing; the opt-out warning | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the change |
| 2 — something selects it | the hook, gate or reader that calls it, and the mutant that deletes the call |
| 3 — the caller can discover it | the refusal's or the finding's text |
| 4 — it is used | every session and every gate run |

## Mutation Log
- 2026-10-19 · f07020a3* · mutant killed · exit 1 · `plugin/scripts/on-pre-tool-use.mjs` · the ledger guard is never asked · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · f07020a3* · mutant killed · exit 1 · `plugin/scripts/shell-words.mjs` · an output redirection's target is not kept · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · f07020a3* · mutant killed · exit 1 · `plugin/scripts/ledger-guard.mjs` · a tee file is not read as a write · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · f07020a3* · mutant killed · exit 1 · `plugin/scripts/ledger-guard.mjs` · a sh -c string is not read · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · f07020a3* · mutant killed · exit 1 · `plugin/scripts/ledger-guard.mjs` · a cd does not move where a relative target lands · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · f07020a3* · mutant killed · exit 1 · `plugin/scripts/on-pre-tool-use.mjs` · the opt-out does not warn · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · f07020a3* · mutant killed · exit 1 · `core/hooks/publish.go` · the Go core never asks the ledger guard · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · f07020a3* · mutant killed · exit 1 · `core/hooks/shellwords.go` · the Go lexer keeps no redirection target · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · f07020a3* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · the Go core does not read a tee file · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · f07020a3* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · the Go core does not read a sh -c string · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · f07020a3* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · the Go core ignores a cd · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · f07020a3* · mutant killed · exit 1 · `core/hooks/publish.go` · the Go core does not warn under the opt-out · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · 90b9ceaf* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · Go reads a substitution · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · 90b9ceaf* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · Go keeps the directory before a cd · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · 90b9ceaf* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · Go keeps PowerShell path separators · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · 90b9ceaf* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · Go reads the PowerShell writers · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · 90b9ceaf* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · Go reads search_replace and walk paths · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · 90b9ceaf* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · Go guards the repository state directory under a state root · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · 90b9ceaf* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · Go follows a link at the leaf · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · 90b9ceaf* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · Go folds case on macOS and Windows · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · a855f7f7* · mutant killed · exit 1 · `core/hooks/shellwords.go` · Go keeps a command of redirections alone · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · a855f7f7* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · Go reads a PowerShell value after a colon · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · a855f7f7* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · Go keeps PowerShell content out of the destinations · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · a855f7f7* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · Go follows a link to a file not there yet · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · a855f7f7* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · Go keeps a walk out of a guarded directory behind .git · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · a855f7f7* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · Go judges a walk above a guarded directory · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · 671827fa* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · Go reads every word after a parameter that carries no content · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · 671827fa* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · Go resolves a relative link from its real directory · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · 671827fa* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · Go keeps a content value out of the destinations · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · f7dc229c* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · Go never reads a quoted word as a parameter · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · f7dc229c* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · Go reads a bare word after a destination named in full as content · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9
- 2026-10-19 · f7dc229c* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · Go keeps the word after a content parameter out · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9

## Invariants

- Gates advise and the sanctioned refusals are the only refusals (CLAUDE.md §3); this task adds only what ADR-117 sanctions.
- Node and the Go core say the same thing at each commit.

## Risks

- A path spelled through a symlink or `..` reaches the directory: canonicalise as `recordFileWritten` does.

## Stop Condition

Stop if a reading command is refused in the twin table.

## Out of Scope

- A program that writes a ledger itself (permanent: boundary: a hook sees tool calls and command text, not what a program does)

## Verification Log
- 2026-10-19 · f07020a3* · exit 1 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:569 · test-lock-sha256:d5e08c104403bf2ac24b5438f60643fc0e897d08765d777e9eecb3fcf2908e6b · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvbGVkZ2VyLXdyaXRlcy50ZXN0Lm1qcwlhIHdyaXRlIGludG8gdGhlIHN0YXRlIGRpcmVjdG9yeSBpcyByZWZ1c2VkLCBhbmQgYSByZWFkIG9mIGl0LCB0aGUgdG9vbHMnIG93biBydW5zIGFuZCBhIHdyaXRlIGVsc2V3aGVyZSBhcmUgbm90CTFiMDk5YTc5ZTE1MTg2MTUxODVhYjE0MDU1Nzc0NjQ4NjhjMTJhNTM1ZTY0NjNiODlmZWYzNDdiZDY2ZjY1MDA
  ```
  --- last 10 line(s) of stdout (of 32 after folding 32 raw)
        at Test.run (node:internal/test_runner/test:1402:25)
        at Test.start (node:internal/test_runner/test:1262:17)
        at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: undefined,
      expected: 'deny',
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-10-19 · f07020a3* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:3925
- 2026-10-19 · f07020a3* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:3983
- 2026-10-19 · f07020a3* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:3764
- 2026-10-19 · f07020a3* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:3745
- 2026-10-19 · f07020a3* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:3758
- 2026-10-19 · f07020a3* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:3780
- 2026-10-19 · f07020a3* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:4037
- 2026-10-19 · f07020a3* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:3765
- 2026-10-19 · f07020a3* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:3799
- 2026-10-19 · f07020a3* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:3763
- 2026-10-19 · f07020a3* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:3834
- 2026-10-19 · f07020a3* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:3769
- 2026-10-19 · 90b9ceaf* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:6468
- 2026-10-19 · 90b9ceaf* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:6361
- 2026-10-19 · 90b9ceaf* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:6179
- 2026-10-19 · 90b9ceaf* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:6321
- 2026-10-19 · 90b9ceaf* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:6211
- 2026-10-19 · 90b9ceaf* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:6141
- 2026-10-19 · 90b9ceaf* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:6178
- 2026-10-19 · 90b9ceaf* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:6167
- 2026-10-19 · a855f7f7* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:8019
- 2026-10-19 · a855f7f7* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:7946
- 2026-10-19 · a855f7f7* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:7842
- 2026-10-19 · a855f7f7* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:7926
- 2026-10-19 · a855f7f7* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:7959
- 2026-10-19 · a855f7f7* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:7983
- 2026-10-19 · 671827fa* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:9514
- 2026-10-19 · 671827fa* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:9236
- 2026-10-19 · 671827fa* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:9888
- 2026-10-19 · f7dc229c* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:10461
- 2026-10-19 · f7dc229c* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:10311
- 2026-10-19 · f7dc229c* · exit 0 · `node --test tests/ledger-writes.test.mjs && go build -C core -o bin/qh ./cmd/qh && QUALITY_HARNESS_HOOK_IMPL=go node --test tests/ledger-writes.test.mjs` · acceptance-sha256:4c65ac7b5c22ef8df1fc05b729f1050aaeb57adccb40c72f30cc7e214562e2a9 · ms:10259
