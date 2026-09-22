# Task ADR-060-T3: A read-only role cannot commit or push, and its other changes are reported

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** the word rule, the reviewer deny and R3
**Consumes:** `observe(cwd)`, the state directory, the session event log and delivery (T1); `checks.jsonl` written by `qh-check` (T2); `tests/observed-events.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the word rule`, `the reviewer deny of Edit and Write by tool name`, `the deny decided before observation`, `R3 over tree, index and HEAD by agent id`, `each named test actually running`, `the regression suites that pin the reviewer guard`

## Goal

`containsCommitOrPush(command)` is the only reading of command text. For a read-only role, `readOnlyVerdict` denies Edit, Write, MultiEdit and NotebookEdit by tool name, and any Bash command the word rule matches. Every other Bash call is allowed, including `qh-check`. R3 reports a tree, index or HEAD change during that agent's run.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/observed-events.test.mjs` | edit | the test below |
| `plugin/scripts/lifecycle.mjs` | edit | `containsCommitOrPush`; `readOnlyVerdict` uses tool name and the word rule instead of `bashVerdict`; R3 on `subagent.ended` |
| `tests/mutations.json` | edit | entries whose `from` lives in `bashVerdict` are retired |
| `plugin/scripts/reviewer-guard.mjs` | edit | header comment: the guard reads one word rule, and a payload it cannot read still passes. Its recorded "a command this hook cannot parse … passes" no longer describes anything, because nothing is parsed |
| `plugin/agents/qh-correctness-reviewer.md`, `plugin/agents/qh-scope-reviewer.md`, `plugin/agents/qh-synthesis.md` | edit | guard comments match |
| `tests/reviewer-guard.test.mjs` | edit | Bash refusal cases the word rule does not match are removed; wrapped publishes are added |
| `tests/lifecycle.test.mjs` | edit | its two reviewer-guard tests and the §135 PreToolUse test pinned the classifier guard; they now pin the word rule. Found by running the suite, a gap in this task's original file list |
| `tests/read-only-arguments.test.mjs`, ADR-059 T4–T7 and T10 task files | edit | two ADR-059 tests asserted the classifier guard refuses plain writes; those assertions go. The body change moves ADR-059 T4–T7 and T10 locks, so each was re-locked with `adr-verify --relock --replace-hashes` (weaker than first-red, and adr-lint says so) and its fence re-run to exit 0. Found by the selftest, a gap in this task's original file list |

## Ordered Steps

1. [S1] Write the test and see it fail on an assertion (TDD red).
2. [S2] Add `containsCommitOrPush`: `commit` or `push` with no letter, digit, `_` or `-` directly before or after. Replace the Bash half of `readOnlyVerdict` with it, and decide the deny before the loop observes.
3. [S3] Implement R3 on `subagent.ended` for a read-only role, paired by `agentId`. It compares tree, index and HEAD with that agent's `subagent.started`, and names current status paths, paths staged now and new commits.
4. [S4] Run the fence green and record mutants:
   - drop `push` from the word rule;
   - observe before deciding the deny;
   - pair R3 by `agentType`;
   - drop the index from R3.

   [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(a read-only role cannot commit or push and its other changes are reported)$' tests/observed-events.test.mjs 2>&1) \
  || { printf '%s\n' "$out"; exit 1; }
for name in 'a read-only role cannot commit or push and its other changes are reported'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { printf '%s\n' "$out"; echo "did not run: $name"; exit 1; }; done \
  && node --test tests/reviewer-guard.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a read-only role cannot commit or push and its other changes are reported` | `tests/observed-events.test.mjs` | Temp repositories, hooks driven as processes.<br>• **Denied:** `git commit -m x`, `git push`, `bash -c 'git commit -m x'`, `pwsh -Command 'git push'`, a Python `subprocess.run(["git","push"])`, and Edit. A denied PreToolUse appends no event to the log.<br>• **Allowed:** `qh-check`, `node -e 'console.log(1)'`, `uniq < README.md`, `git log --oneline`, and `grep -n pre-commit README.md`.<br>• **R3 (staggered reviewers):** one that runs `git add` reports the staged path; one that runs `sort -o out.txt README.md` reports `out.txt`; one that changes nothing reports nothing.<br>• **R3 (overlapping reviewers):** the message says the state changed during that reviewer's run. | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | PreToolUse, SubagentStart and SubagentStop route through the loop, and the agents' frontmatter runs `reviewer-guard.mjs`; the test drives them as processes; S4's mutants break each |
| 3 — the caller can discover it | the refusal message names what the role may do instead |
| 4 — it is used | every quality-cycle and review-ring run |

## Mutation Log
- 2026-09-17 · 4850fa0* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · push is dropped from the word rule, so a reviewer's git push runs · acceptance-sha256:6ab9fad393ff4d58158d8924af8ae9c6122f7a98276951c1d8e7b74f21c2eb0b · covers:the word rule
- 2026-09-17 · 4850fa0* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · Edit is no longer denied by tool name · acceptance-sha256:6ab9fad393ff4d58158d8924af8ae9c6122f7a98276951c1d8e7b74f21c2eb0b · covers:the reviewer deny of Edit and Write by tool name
- 2026-09-17 · 4850fa0* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a PreToolUse is observed and logged before the guard decides, so a denied call leaves an event · acceptance-sha256:6ab9fad393ff4d58158d8924af8ae9c6122f7a98276951c1d8e7b74f21c2eb0b · covers:the deny decided before observation
- 2026-09-17 · 4850fa0* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · R3 pairs by agent type, so an overlapping reviewer's start hides the change · acceptance-sha256:6ab9fad393ff4d58158d8924af8ae9c6122f7a98276951c1d8e7b74f21c2eb0b · covers:R3 over tree, index and HEAD by agent id
- 2026-09-17 · 4850fa0* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · R3 ignores the index, so a reviewer's git add goes unreported · acceptance-sha256:6ab9fad393ff4d58158d8924af8ae9c6122f7a98276951c1d8e7b74f21c2eb0b · covers:R3 over tree, index and HEAD by agent id
- 2026-09-17 · 4850fa0* · mutant killed · exit 1 · `tests/observed-events.test.mjs` · a renamed test selects nothing and the per-name ok grep must refuse it · acceptance-sha256:6ab9fad393ff4d58158d8924af8ae9c6122f7a98276951c1d8e7b74f21c2eb0b · covers:each named test actually running
- 2026-09-17 · 4850fa0* · mutant killed · exit 1 · `plugin/scripts/reviewer-guard.mjs` · the frontmatter guard CLI never refuses, which only the reviewer-guard suite pins · acceptance-sha256:6ab9fad393ff4d58158d8924af8ae9c6122f7a98276951c1d8e7b74f21c2eb0b · covers:the regression suites that pin the reviewer guard

## Invariants

- Edit, Write, MultiEdit and NotebookEdit stay denied for read-only roles.
- No command text is read except by the word rule.
- A payload the guard cannot read passes.
- The old PreToolUse commit advisory and the old completion advisories are unchanged until T4 and T5.
- Every `tests/mutations.json` entry matches exactly once after this task.

## Risks

- A split word, a config alias or a script evades the word rule; R2 and R3 report the resulting commits, and a push is not reported. Named in ADR-060's Consequences.

## Stop Condition

Stop and ask if the SubagentStart or SubagentStop payload lacks `agent_id` or `agent_type`.

## Out of Scope

- A per-subagent sandbox (permanent: boundary: no such host setting is measured here)

## Verification Log
- 2026-09-17 · 4850fa0* · exit 1 · `set -o pipefail …` · acceptance-sha256:6ab9fad393ff4d58158d8924af8ae9c6122f7a98276951c1d8e7b74f21c2eb0b · ms:110 · test-lock-sha256:0de3de0237da43c77a4f19f4fc658cca2d5b37fbdfd6c8064327f2994de04760 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIGNoZWNrIGV2ZW50IGlzIHdyaXR0ZW4gYnkgcWgtY2hlY2sJZjgwMzk5YmMxY2EyZTlkMDI5MTRjYWM2NDlkNzYwNWEzMzljZTU4YTY0MTFkNDZiOGU0MWRkOWZiNGI1ZTc4Ywpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIHJlYWQtb25seSByb2xlIGNhbm5vdCBjb21taXQgb3IgcHVzaCBhbmQgaXRzIG90aGVyIGNoYW5nZXMgYXJlIHJlcG9ydGVkCTllYjY2ZmU5ZmI2YTVmYmI0OWIxODA1ODgxM2E3ZjQ0Y2FhNDg4NmQyZjFiMjY0YWRkNWIzMjIxMjZmNDQxNWEKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJYSB0dXJuIGVuZCBvYnNlcnZlcyB0aGUgdHJlZSB3aXRob3V0IHJlYWRpbmcgYW55IGNvbW1hbmQJZDc4ZDQyY2MwZjhiYWM3YWZkYjgxYmE3N2M1MzlkMmY0YWZjOGVhZDFkOTU3MDZjYmYyYzQzY2IxN2U4M2ZmYQpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlvYnNlcnZpbmcgd3JpdGVzIG5vdGhpbmcgaW50byB0aGUgcmVwb3NpdG9yeQlkNjVlMmY0Njc0MzcyNDgzZmZmMDM4ZDRmZWJhZWEyZDgyYWE3MzQwNGEyZDVhZjlhMjEwZWQ4YjAzMTJmNmJhCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCW9uZSBob29rIGRlbGl2ZXJzIGV2ZXJ5IGFjdGlvbiBpdCByZWNvcmRzCTc4ZWZhNTY4ZjMxZThhOTE0YzdkZDRkMGYyNmFmNDgzODFlNDhjMWUzZmFlMmFjNGM1NTZmNDI4MzRmZjQ0MmQ
  ```
  --- last 10 line(s) of stdout (of 36 after folding 36 raw)
    ...
  1..1
  # tests 1
  # suites 0
  # pass 0
  # fail 1
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 46.912292
  ```
- 2026-09-17 · 4850fa0* · exit 0 · `set -o pipefail …` · acceptance-sha256:6ab9fad393ff4d58158d8924af8ae9c6122f7a98276951c1d8e7b74f21c2eb0b · ms:2222
- 2026-09-17 · 4850fa0* · exit 0 · `set -o pipefail …` · acceptance-sha256:6ab9fad393ff4d58158d8924af8ae9c6122f7a98276951c1d8e7b74f21c2eb0b · ms:2378
- 2026-09-17 · 4850fa0* · exit 0 · `set -o pipefail …` · acceptance-sha256:6ab9fad393ff4d58158d8924af8ae9c6122f7a98276951c1d8e7b74f21c2eb0b · ms:2512
- 2026-09-17 · 4850fa0* · exit 0 · `set -o pipefail …` · acceptance-sha256:6ab9fad393ff4d58158d8924af8ae9c6122f7a98276951c1d8e7b74f21c2eb0b · ms:2279
- 2026-09-17 · 4850fa0* · exit 0 · `set -o pipefail …` · acceptance-sha256:6ab9fad393ff4d58158d8924af8ae9c6122f7a98276951c1d8e7b74f21c2eb0b · ms:2265
- 2026-09-17 · 4850fa0* · exit 0 · `set -o pipefail …` · acceptance-sha256:6ab9fad393ff4d58158d8924af8ae9c6122f7a98276951c1d8e7b74f21c2eb0b · ms:2112
- 2026-09-17 · 4850fa0* · exit 0 · `set -o pipefail …` · acceptance-sha256:6ab9fad393ff4d58158d8924af8ae9c6122f7a98276951c1d8e7b74f21c2eb0b · ms:2321
