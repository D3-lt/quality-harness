# Task ADR-110-T1: qh hook passes every hook golden byte for byte

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** L (a Go module reimplementing 13 hook commands against eight byte-exact transcripts)
**Owner:** unassigned
**Produces:** `cmd/qh` with `qh hook <event>`; the `QUALITY_HARNESS_HOOK_IMPL` seam in `tests/hook-golden.mjs`
**Consumes:** none
**Proof map:** v1

## Goal

A static Go binary answers every hook event exactly as `plugin/scripts/lifecycle.mjs` and its siblings do — the same
stdout, stderr, exit and ledger rows — on every scenario the hook goldens hold, and on one new golden per registered
event that had none (ADR-110, Decisions 1 and 2).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `core/go.mod` | add | the module; `mrw`'s packages pinned by version |
| `cmd/qh/main.go` | add | `qh hook <event>`, `qh --version` |
| `core/hooks/` | add | one package per event family: orientation, record (the event log and ledgers), observe (the scratch-index tree), publish (the classifier and verdict), turnend (R1, R2, R4, W, the nudge, the claim), contract (the subagent contract), brief (branch-state) |
| `tests/hook-golden.mjs` | edit | `QUALITY_HARNESS_HOOK_IMPL=go` makes the sandbox spawn the built binary instead of `node lifecycle.mjs`; unset, nothing changes |
| `tests/goldens/` | edit | a scenario for each registered event with none: PostToolUse on Edit/Write/NotebookEdit, PreToolUse on Skill, TaskCompleted; recorded through the NODE path before any Go code for that event is written |
| `.github/workflows/selftest.yml` | edit | `go build ./cmd/qh` on each platform, then the goldens run twice |
| `tests/mutations/core/` | add | catalogue entries on the Go source; `scripts/mutate.mjs` already runs a Go fence per entry |

## Ordered Steps

1. [S1] For each registered event with no golden, record one through the Node path and commit it; then add the `QUALITY_HARNESS_HOOK_IMPL=go` seam and record the red run (TDD red: no binary, every scenario fails).
2. [S2] Port one event family at a time, orientation first (the smallest), running the goldens after each; a mismatch is fixed in the port.
3. [S3] Port the publish classifier last and run `tests/goldens/publish-classifier.json` — the largest transcript — plus every `tests/publish-command.test.mjs` fixture row through the binary as a second check that the lexer agrees. [proof: acceptance]
4. [S4] Add catalogue mutants on the Go source for each rule family (the dedupe key, the observable-write filter, the publish lexer's heredoc arm, R1's key) and record a killed mutant. [proof: mutation]

## Acceptance

```bash
b=$(mktemp -d) && go build -C core -o "$b/qh" ./cmd/qh \
  && out=$(QUALITY_HARNESS_QH_BIN="$b/qh" QUALITY_HARNESS_HOOK_IMPL=go node --test --test-reporter=tap tests/hook-goldens.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cE '^ok [0-9]+ - ')" -ge 8 \
  && ! printf '%s\n' "$out" | grep -qE '^not ok|# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `orientation: startup, resume, compact and clear say their standing paragraphs as designed` | `tests/hook-goldens.test.mjs` | the existing scenario, run against the Go binary through the seam | — | S1, S2 |
| `publish: every form of a publish command gets the answer it got when the transcript was recorded` | `tests/hook-goldens.test.mjs` | the classifier transcript against the binary | — | S3 |
| `writes and turn ends: what was written, where, and what the turn says about it` | `tests/hook-goldens.test.mjs` | the turn-end rules against the binary | — | S2 |
| `every registered hook event has a golden` | `tests/hook-goldens.test.mjs` | each event in `hooks.json` appears in at least one scenario; a registered event with none turns red | — | S1 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `cmd/qh` |
| 2 — something selects it | the seam in the sandbox |
| 3 — the caller can discover it | `qh --version`, and `hooks.json` after T3 |
| 4 — it is used | the goldens run against it in CI |

## Mutation Log
- 2026-10-17 · e1bd26e2 · mutant killed · exit 1 · `core/hooks/turnend.go` · R1's key loses the tree's evidence revision, so a check event on the tree no longer re-opens the finding; the goldens hold R1's key in the action.emitted rows · acceptance-sha256:5bcdd21d1087b8853376b60f2ca2ddfb684a089ac0dbf531258626a871f5e9ba
- 2026-10-17 · e1bd26e2* · mutant killed · exit 1 · `core/hooks/publish.go` · rule P's dedupe never finds the advice already said on this tree, so every mention repeats it; the classifier golden holds one advisory per tree · acceptance-sha256:5bcdd21d1087b8853376b60f2ca2ddfb684a089ac0dbf531258626a871f5e9ba
- 2026-10-17 · e1bd26e2* · mutant killed · exit 1 · `core/hooks/ledger.go` · the observable-write filter calls a gitignored write observable, so a write git cannot see is recorded as one it can; the writes golden holds observable false for the ignored file · acceptance-sha256:5bcdd21d1087b8853376b60f2ca2ddfb684a089ac0dbf531258626a871f5e9ba
- 2026-10-17 · e1bd26e2* · mutant survived · exit 0 · `core/hooks/shellwords.go` · the lexer's heredoc arm reads a quoted delimiter as unquoted, so a quoted body is code again and its words are read as a publish or a mention; the classifier golden holds the quoted-heredoc forms · acceptance-sha256:5bcdd21d1087b8853376b60f2ca2ddfb684a089ac0dbf531258626a871f5e9ba
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-10-17 · e1bd26e2* · mutant killed · exit 1 · `core/hooks/shellwords.go` · the lexer's heredoc arm reads a quoted delimiter as unquoted, so a quoted body only cat or mrw reads is code again; the heredocs golden, added because this mutant survived the earlier scenarios, holds that body as data · acceptance-sha256:5bcdd21d1087b8853376b60f2ca2ddfb684a089ac0dbf531258626a871f5e9ba

## Invariants

- No golden is re-recorded to match the binary; a mismatch is a port defect.
- The Node path is byte-identical before and after this task (the goldens run against it too).
- The binary starts no detached process except where ADR-110's amended Decision 4 allows one (ADR-080's artifact pass, ADR-065's refresh), each under a deadline, reaped at SessionEnd, and holding no git lock.
- The ledger formats are unchanged; a row written by either implementation is read by both.

## Risks

- The classifier's lexer (`shellWords`) is the largest single port; its fixture rows are the second check.

## Stop Condition

Stop and ask if a golden cannot be matched without changing what the Node path says — that is a wording record, not
this one.

## Out of Scope

- Any gate under `plugin/bin/` (permanent: boundary: ADR-110 Decision 2)
- Selecting the binary in `hooks.json` (deferred: T3)

## Verification Log
- 2026-10-17 · beaa8c41* · exit 1 · `b=$(mktemp -d) && go build -C core -o "$b/qh" ./cmd/qh \ …` · acceptance-sha256:5bcdd21d1087b8853376b60f2ca2ddfb684a089ac0dbf531258626a871f5e9ba · ms:4373 · test-lock-sha256:7e1d0da7dfd73d634c435aeea2d341755a5fdbf92e451381f283423e31be2646 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvaG9vay1nb2xkZW5zLnRlc3QubWpzCWFydGlmYWN0czogYSByZWNvcmQgd3JpdHRlbiBiYWRseSBhbmQgYSByZWNvcmQgd3JpdHRlbiB3ZWxsIGFyZSBnYXRlZCBhdCB0aGUgd3JpdGUgYW5kIGF0IHRoZSB0dXJuIGVuZAljYjYyMjVhNTY3NDBhMjU0YjlmZmJmNjJmYWEzZGUyMjJlOTQ0MDczZjA4YmI0YjUxZGQ0NDI2ZTkyOTViNGMwCmJvZHkJdGVzdHMvaG9vay1nb2xkZW5zLnRlc3QubWpzCWNoZWNrczogYSByZWQgY2hlY2ssIGEgc2FtZS10cmVlIHNraXAsIGEgcmV1c2UgZm9yIHByb3NlIGFuZCBhbiB1bnJlYWRhYmxlIGNvbmZpZyBzYXkgd2hhdCB0aGV5IHNhaWQgd2hlbiByZWNvcmRlZAliYTg4NWFhNjA3ZTAyZjZkZTg4YWUyMjdmMjQyMWIxNzlkM2U5MTI4M2E3YWY4NjVjMzAyZDFkOGE2ZTE4NzQ2CmJvZHkJdGVzdHMvaG9vay1nb2xkZW5zLnRlc3QubWpzCWVkaXRzIGJ5IGV2ZXJ5IHRvb2wgdGhlIG1hdGNoZXJzIG5hbWU6IGJlZm9yZSBhbmQgYWZ0ZXIgV3JpdGUsIEVkaXQsIE11bHRpRWRpdCwgTm90ZWJvb2tFZGl0IGFuZCBhIFBvd2VyU2hlbGwgY29tbWFuZAljZDVkMmM0MDZhNDZlNDE1OTcyZTQxNDg0M2JlZWFiNmIwZDNmZTdjMTA3ZTMxOTJhOGI0NTI0NjJhZDhhOTBhCmJvZHkJdGVzdHMvaG9vay1nb2xkZW5zLnRlc3QubWpzCWV2ZXJ5IHJlZ2lzdGVyZWQgaG9vayBldmVudCBoYXMgYSBnb2xkZW4JZTFiZjBhOWFhYThmZTgzMmFlOWVjMjU4MmU2MDA1MDM0ZWI3MTBiZDVjZTI0Y2M3ZTAzNzcxODZlYTIxODhjNgpib2R5CXRlc3RzL2hvb2stZ29sZGVucy50ZXN0Lm1qcwlvcmllbnRhdGlvbjogc3RhcnR1cCwgcmVzdW1lLCBjb21wYWN0IGFuZCBjbGVhciBzYXkgdGhlaXIgc3RhbmRpbmcgcGFyYWdyYXBocyBhcyBkZXNpZ25lZAk0YTBjMjNjYzJkY2MwNGQwZTgxZDg3NTE2NzQ3ZGI0OTY0ZTNkYTMwNGNhMWRiOGU0YmE0ZTgyMDM0OGJmN2ZiCmJvZHkJdGVzdHMvaG9vay1nb2xkZW5zLnRlc3QubWpzCW90aGVyIGV2ZW50czogc3ViYWdlbnRzLCB0YXNrcywgY29tcGFjdGlvbiwgYSBza2lsbCBjYWxsIGFuZCBhbiBlZGl0IHRvIGEgcmVjb3JkCTJmZTBjYTM4NjFmM2QyNzhjNzhmYjkyMGM4MjlhMDZiZDgzZDc3ODJkYzFmNmE1YjFiMGM0NGJmZDU4NjlmNjQKYm9keQl0ZXN0cy9ob29rLWdvbGRlbnMudGVzdC5tanMJcHVibGlzaDogYSBmdWxsIHBhc3MsIGEgZmFzdCBwYXNzIGFuZCBhIGNoYW5nZSBhZnRlciBlYWNoIHNheSB3aGF0IHRoZXkgc2FpZCB3aGVuIHJlY29yZGVkCTJlMTlkOTdkZDNmZDNmMGRmNDFmOTlkOGQ2Y2U0Mzk5MWY1ZDY3NGZjYzhjMWMyZmVhMzlmZTg5N2MyMTZlZWUKYm9keQl0ZXN0cy9ob29rLWdvbGRlbnMudGVzdC5tanMJcHVibGlzaDogZXZlcnkgZm9ybSBvZiBhIHB1Ymxpc2ggY29tbWFuZCBnZXRzIHRoZSBhbnN3ZXIgaXQgZ290IHdoZW4gdGhlIHRyYW5zY3JpcHQgd2FzIHJlY29yZGVkCTQ3MjNmZjEyMjU3ZjM3NWI3OTkwYjFjNjk1ZjgxOWY2N2QyNWE3ODc3Y2ZiMGJiMWMzMjc4MTMxMzE4MWM2MmQKYm9keQl0ZXN0cy9ob29rLWdvbGRlbnMudGVzdC5tanMJcmVhZGluZXNzOiBhbiBhY2NlcHRlZCByZWNvcmQgd2l0aCBhIHJlYWR5IHRhc2ssIGFuIGV2aWRlbmNlZCBvbmUgYW5kIGEgcHJvcG9zZWQgcmVjb3JkIGFyZSBzYWlkIGFzIHRoZXkgd2VyZQljMzE2NWJkZWIzZjBkZmQ4ZDQ1MWQ4YmJjOWI2YzdkMjAzNWE4ZDU3YTJmOTFmZGFjZmM5ZGNhYjFkYjY2YTU3CmJvZHkJdGVzdHMvaG9vay1nb2xkZW5zLnRlc3QubWpzCXdyaXRlcyBhbmQgdHVybiBlbmRzOiB3aGF0IHdhcyB3cml0dGVuLCB3aGVyZSwgYW5kIHdoYXQgdGhlIHR1cm4gc2F5cyBhYm91dCBpdAkxM2JjOTcyNGJlN2VmY2M0OWVmMmQ2MmM4NTU1MDJjNGEyZDdhYWE5NmRhMjY2Njc5NTNjMjBhZWE3M2Y0NTkx
  ```
  ```
- 2026-10-17 · a3c619df · exit 0 · `b=$(mktemp -d) && go build -C core -o "$b/qh" ./cmd/qh \ …` · acceptance-sha256:5bcdd21d1087b8853376b60f2ca2ddfb684a089ac0dbf531258626a871f5e9ba · ms:18114
- 2026-10-17 · e1bd26e2 · exit 0 · `b=$(mktemp -d) && go build -C core -o "$b/qh" ./cmd/qh \ …` · acceptance-sha256:5bcdd21d1087b8853376b60f2ca2ddfb684a089ac0dbf531258626a871f5e9ba · ms:8147
- 2026-10-17 · e1bd26e2* · exit 0 · `b=$(mktemp -d) && go build -C core -o "$b/qh" ./cmd/qh \ …` · acceptance-sha256:5bcdd21d1087b8853376b60f2ca2ddfb684a089ac0dbf531258626a871f5e9ba · ms:7865
- 2026-10-17 · e1bd26e2* · exit 0 · `b=$(mktemp -d) && go build -C core -o "$b/qh" ./cmd/qh \ …` · acceptance-sha256:5bcdd21d1087b8853376b60f2ca2ddfb684a089ac0dbf531258626a871f5e9ba · ms:8275
- 2026-10-17 · e1bd26e2* · exit 0 · `b=$(mktemp -d) && go build -C core -o "$b/qh" ./cmd/qh \ …` · acceptance-sha256:5bcdd21d1087b8853376b60f2ca2ddfb684a089ac0dbf531258626a871f5e9ba · ms:8023
- 2026-10-17 · e1bd26e2* · exit 0 · `b=$(mktemp -d) && go build -C core -o "$b/qh" ./cmd/qh \ …` · acceptance-sha256:5bcdd21d1087b8853376b60f2ca2ddfb684a089ac0dbf531258626a871f5e9ba · ms:20897
