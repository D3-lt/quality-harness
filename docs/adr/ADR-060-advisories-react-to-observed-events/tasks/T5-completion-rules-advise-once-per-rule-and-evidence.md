# Task ADR-060-T5: Completion rules advise once per rule and evidence

**Depends-on:** T4
**Covers:** none — no spec
**Estimated scope:** L (cross-boundary)
**Owner:** unassigned
**Produces:** rules R1, R2 and R4, the ledger and the statusline
**Consumes:** `observe(cwd)`, the state directory, the session event log and delivery (T1); `checks.jsonl` written by `qh-check` (T2); rule P (T4); `tests/observed-events.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `R1 unchecked-work`, `R2 unchecked-commits by commit id`, `the rule-and-evidence key`, `the P coverage skip`, `the unobservable-write count`, `the check opt-in`, `R4 remembered once per session and cwd`, `the kept suppressions and evidenceNudge`, `the ledger outcome order and version field`, `the ledger computed apart from the rules`, `the statusline reading the log`, `the kept completion artifact calls`, `each named test actually running`

## Goal

At turn, task and non-read-only subagent end, R1, R2 and R4 are the only completion advisories, besides the old artifact calls kept until T6. The suppressions and `evidenceNudge` stay. ADR-035 rows follow the outcome order with `version: "events/1"`. The statusline renders the last observation and its age, and shipped guidance names `qh-check`. The scripted session delivers what ADR-060's step table lists.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/observed-events.test.mjs` | edit | the four tests below |
| `plugin/scripts/lifecycle.mjs` | edit | R1, R2 and R4. The Stop, TaskCompleted and non-read-only SubagentStop branches emit these, plus the kept artifact calls, suppressions and `evidenceNudge`. `recordClaim` follows the outcome order; `runTheCheckSentence` and `subagentContract` name `qh-check` |
| `tests/mutations.json` | edit | entries whose `from` lives in the removed completion emitters or the old statusline are retired |
| `plugin/scripts/statusline.mjs` | edit | renders the last observation's verdict with "last observed <age>", and defines missing, stale and not-ok states |
| `plugin/README.md`, `plugin/skills/adr-execute/SKILL.md` | edit | shipped guidance names `qh-check` |
| `tests/claims-rate.test.mjs` | edit | old and new rows through `tally` |
| `tests/statusline.test.mjs` | edit | the statusline follows its input |
| `tests/lifecycle.test.mjs`, `tests/unread-advice.test.mjs`, `tests/unread-advice-followon.test.mjs`, `tests/advice-accuracy.test.mjs`, `tests/leftovers-after-adr053.test.mjs` | edit | tests of the removed completion emitters go; their parsing helpers stay until T7 |

## Ordered Steps

1. [S1] Write the four tests and see them fail on an assertion (TDD red).
2. [S2] Implement R1, R2 and R4 as in ADR-060's Decision.
   - Gate R1, R2 and R4 on `projectCheckCommand`.
   - Key R1 with the tree, revision and unobservable-write count, and skip a tree P named at the same revision.
   - Key R2 by commit and its tree's revision; skip the observed working tree and trees P named at their current revision.
   - Decide R4's once per session and `cwd` from `action.emitted` in the log.
3. [S3] Route Stop (skipped while `hasBackgroundWork`), TaskCompleted and non-read-only SubagentStop through these rules. Keep the docs-only/EVIDENCE-LIMITED and interim-reply suppressions, `evidenceNudge` and the existing artifact calls. Apply the ledger outcome order from the tree, commits and writes themselves, not from R1 or R2, with the version field.
4. [S4] Point the statusline at the log.
5. [S5] Point shipped guidance at `qh-check` and remove the tests of the removed emitters. [proof: acceptance]
6. [S6] Run the fence green and record mutants:
   - fire R1 on every turn end;
   - drop the revision from R1's key;
   - drop the unobservable-write count from R1's key;
   - reset the baseline on a compact SessionStart;
   - skip R2 when a commit's tree equals the session-start tree;
   - drop the check opt-in;
   - map `verified` from whether R1 spoke;
   - compute `unverified` from R1's condition, so a tree P warned about records `verified`;
   - render the statusline without its age.

   [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(the scripted session advises as its step table lists|a repository without a check hears no completion advisory|an unchecked commit is named even when its tree equals the session start|writes the tree cannot see re-open the finding|a tree the publish warning named still records unverified|many unchecked commits are one finding|a turn that ended in a commit names the commit, not a change that is not there)$' tests/observed-events.test.mjs 2>&1) \
  || { printf '%s\n' "$out"; exit 1; }
for name in 'the scripted session advises as its step table lists' 'a repository without a check hears no completion advisory' 'an unchecked commit is named even when its tree equals the session start' 'writes the tree cannot see re-open the finding' 'a tree the publish warning named still records unverified' 'many unchecked commits are one finding' 'a turn that ended in a commit names the commit, not a change that is not there'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { printf '%s\n' "$out"; echo "did not run: $name"; exit 1; }; done \
  && node --test tests/observed-events.test.mjs tests/lifecycle.test.mjs tests/claims-rate.test.mjs tests/statusline.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the scripted session advises as its step table lists` | `tests/observed-events.test.mjs` | ADR-060's fifteen steps, driven through SessionStart, PreToolUse, Stop and `qh-check` as processes in two temp repositories. Each step's delivered rules equal the Decision's table: R1 at steps 2, 10 and 15; P at 9, 11 and 12; R2 naming `five` at 14; nothing else. The ledger rows at steps 2 and 3 are both `unverified` with `version: "events/1"`, and `tally` recognises them beside an old row without a version. The row at step 9′, after P warned and the unchecked commit ran, is `unverified`. | — | S1, S2, S3 |
| `a repository without a check hears no completion advisory` | `tests/observed-events.test.mjs` | the same steps in a repository with no declared or inferred check deliver nothing, and its ledger rows are `no-check` | — | S1, S2, S3 |
| `an unchecked commit is named even when its tree equals the session start` | `tests/observed-events.test.mjs` | A session starts with an uncommitted file. Outside any hook it is committed, then a new file is written. Stop delivers R1 and R2, and R2 names that commit | — | S1, S2 |
| `writes the tree cannot see re-open the finding` | `tests/observed-events.test.mjs` | • **Repository with a check:** an Edit outside the repository, then Stop, gives R1 with a count and no path. A second outside Edit, then Stop, gives R1 again. `qh-check` passes, then Stop gives nothing.<br>• **Two worktrees of one repository:** an Edit outside the repository from worktree A, then `qh-check` passing in worktree B, then Stop in A gives R1.<br>• **Non-git directory with a declared check:** an Edit, then Stop, gives R4 and R1; a second Stop gives nothing; `qh-check` passes, then Stop gives nothing; an Edit during a passing `qh-check` still gives R1 at the next Stop.<br>• **Statusline:** from these logs it renders "last observed" with an age, and "unknown" without a log. | — | S1, S2, S4 |
| `a tree the publish warning named still records unverified` | `tests/observed-events.test.mjs` | found by this task's mutation pass: with P suppressing R1 and nothing committed, the ledger must still record `unverified`. The scripted session could not see it, because at step 9′ an unchecked commit kept the row honest whatever the tree contributed | — | S1, S2, S3 |
| `many unchecked commits are one finding` | `tests/observed-events.test.mjs` | found in review of this task: seven unchecked commits deliver ONE R2 action naming the newest five and counting the rest, and the second turn end repeats none of them. A message per commit would be dozens of joined advisories in one hook after a fetch or a merge | — | S1, S2, S3 |
| `a turn that ended in a commit names the commit, not a change that is not there` | `tests/observed-events.test.mjs` | found by a peer session's test of this branch, 2026-09-18: after a commit the tree is unchecked and nothing is uncommitted, and R1 said both "work no `qh-check` has passed on" and "git reports no changed path" — the old commit-loop shape in a quieter form. R2 is silent for that commit by design (its tree is the observed tree), so R1 names it | — | S1, S2, S3 |
| `a check that finishes in a later turn clears the finding then` | `tests/observed-events.test.mjs` | the second shape quality-blueprints-07 named: a check inside a backgrounded call finishing in a LATER turn. The turn that ends while it runs is still unchecked; the next hook imports the record and the finding clears. The probe keeps its flags OUTSIDE the repository, because a fixture that writes into the tree it measures reads its own change | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the four tests |
| 2 — something selects it | the hooks route to the rules; the scenario drives them as processes; S6's mutants change a step's delivery |
| 3 — the caller can discover it | shipped guidance and SubagentStart name `qh-check` |
| 4 — it is used | every session's completion advisories and statusline |

## Mutation Log
- 2026-09-17 · bdb6dde* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · R1 fires on every turn end, not only over an unchecked tree or an unseen write · acceptance-sha256:5c420a7c07384e67455710af4916c2c900bfa306f718e85eec7e3c1ad15a3ede
- 2026-09-17 · bdb6dde* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · R1's key drops the evidence revision, so a check that ran and failed cannot re-open it · acceptance-sha256:5c420a7c07384e67455710af4916c2c900bfa306f718e85eec7e3c1ad15a3ede
- 2026-09-17 · bdb6dde* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · R1's key drops the count of writes the tree cannot see, so a second such write is silent · acceptance-sha256:5c420a7c07384e67455710af4916c2c900bfa306f718e85eec7e3c1ad15a3ede
- 2026-09-17 · bdb6dde* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the baseline moves to the newest observation, so a compact SessionStart resets what unchecked work is measured against · acceptance-sha256:5c420a7c07384e67455710af4916c2c900bfa306f718e85eec7e3c1ad15a3ede
- 2026-09-17 · bdb6dde* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · R2 skips a commit whose tree equals the session start, so a commit of exactly the work in flight is never named · acceptance-sha256:5c420a7c07384e67455710af4916c2c900bfa306f718e85eec7e3c1ad15a3ede
- 2026-09-17 · bdb6dde* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the check opt-in goes, so a project that named no check is judged against an invented one · acceptance-sha256:5c420a7c07384e67455710af4916c2c900bfa306f718e85eec7e3c1ad15a3ede
- 2026-09-17 · bdb6dde* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the ledger ignores an unchecked commit once the tree is checked, so step 14 records verified · acceptance-sha256:5c420a7c07384e67455710af4916c2c900bfa306f718e85eec7e3c1ad15a3ede
- 2026-09-17 · bdb6dde* · mutant survived · exit 0 · `plugin/scripts/lifecycle.mjs` · the ledger takes R1's P skip, so a tree the publish warning already named records verified · acceptance-sha256:5c420a7c07384e67455710af4916c2c900bfa306f718e85eec7e3c1ad15a3ede
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-09-17 · bdb6dde* · mutant killed · exit 1 · `plugin/scripts/statusline.mjs` · the status line renders no age, so an old observation reads as the tree as it is now · acceptance-sha256:5c420a7c07384e67455710af4916c2c900bfa306f718e85eec7e3c1ad15a3ede
- 2026-09-17 · bdb6dde* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the ledger takes R1's P skip, so a tree the publish warning already named records verified · acceptance-sha256:5b0765d5af4d8ce5bf9c73a79ff1ef2db731777cef1ea970871bd1dfbc10c28d
- 2026-09-17 · 555c7bc* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · R2 names every commit it found, so a fetch of dozens puts all of them in one message · acceptance-sha256:aa96a9368d960db3682d930cf47c1a6a6b73534a2a61ea17ca333fa76a167eb3
- 2026-09-17 · 555c7bc* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the ledger takes R1's P skip, so a tree the publish warning already named records verified · acceptance-sha256:aa96a9368d960db3682d930cf47c1a6a6b73534a2a61ea17ca333fa76a167eb3
- 2026-09-18 · dceba5e* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · R1 stops naming the commit it speaks for, so a committed turn is told it has changed work with no changed path · acceptance-sha256:7d9e9a12fb36759304990274eaf79a884eb1c1b12a94c6ec8e45c4d6c0a111b5

## Invariants

- ADR-035's ledger receives one row per completion event, except a read-only subagent's end: R3 owns that boundary and a reviewer makes no completion claim. Corrected during execution — the code returns before `recordClaim` there, and a denominator that quietly differs from its own record is the failure `recordClaim` exists to prevent.
- The completion artifact calls are unchanged until T6.
- Every `tests/mutations.json` entry matches exactly once after this task.

## Risks

- Removing emitter tests hides a regression the scenario does not cover. The removed tests are named in the commit.

## Stop Condition

Stop and ask if the scenario needs a different step table to describe a real state, since that changes ADR-060's pre-registered table.

## Out of Scope

- Artifact validation and notes (deferred: docs/adr/ADR-060-advisories-react-to-observed-events/tasks/T6-artifacts-and-notes-read-observed-changes.md)

## Verification Log
- 2026-09-17 · bdb6dde* · exit 1 · `set -o pipefail …` · acceptance-sha256:5c420a7c07384e67455710af4916c2c900bfa306f718e85eec7e3c1ad15a3ede · ms:6352 · test-lock-sha256:ae5b799b874c13129285421169fcfa298b7829a21efa65b481796e053d52db9d · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIGNoZWNrIGV2ZW50IGlzIHdyaXR0ZW4gYnkgcWgtY2hlY2sJZjgwMzk5YmMxY2EyZTlkMDI5MTRjYWM2NDlkNzYwNWEzMzljZTU4YTY0MTFkNDZiOGU0MWRkOWZiNGI1ZTc4Ywpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIGNvbW1hbmQgbmFtaW5nIGNvbW1pdCBvciBwdXNoIGlzIHdhcm5lZCBiZWZvcmUgaXQgcnVucwk5MDE3ZmIxMzdiZGYzMTRkNmM4MGI0N2ExOGExN2RhZGNiOWQ1OTBiYTRmNzg2MTNjNzBlY2I2MDRhNGNmNmU1CmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWEgcmVhZC1vbmx5IHJvbGUgY2Fubm90IGNvbW1pdCBvciBwdXNoIGFuZCBpdHMgb3RoZXIgY2hhbmdlcyBhcmUgcmVwb3J0ZWQJOWViNjZmZTlmYjZhNWZiYjQ5YjE4MDU4ODEzYTdmNDRjYWE0ODg2ZDJmMWIyNjRhZGQ1YjMyMjEyNmY0NDE1YQpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIHJlcG9zaXRvcnkgd2l0aG91dCBhIGNoZWNrIGhlYXJzIG5vIGNvbXBsZXRpb24gYWR2aXNvcnkJNmJhYzE1MTU4NTJjOTMwNjcwZDZkMzdjN2VmYzg5ODcwYjYwNzM4NGQ0MzA1Mzg1MmY3NmIwZDdjMzY4NTE3Ngpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIHR1cm4gZW5kIG9ic2VydmVzIHRoZSB0cmVlIHdpdGhvdXQgcmVhZGluZyBhbnkgY29tbWFuZAlkNzhkNDJjYzBmOGJhYzdhZmRiODFiYTc3YzUzOWQyZjRhZmM4ZWFkMWQ5NTcwNmNiZjJjNDNjYjE3ZTgzZmZhCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCWFuIHVuY2hlY2tlZCBjb21taXQgaXMgbmFtZWQgZXZlbiB3aGVuIGl0cyB0cmVlIGVxdWFscyB0aGUgc2Vzc2lvbiBzdGFydAlmMzY3NjM4YWIxZjc4ODQ0ZDFmZmRlN2EzM2YzZDk1MGVmNTRiYjhmYjhjMDU2YzIyOTUyY2VlN2RhZjBjZjM2CmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCW9ic2VydmluZyB3cml0ZXMgbm90aGluZyBpbnRvIHRoZSByZXBvc2l0b3J5CWQ2NWUyZjQ2NzQzNzI0ODNmZmYwMzhkNGZlYmFlYTJkODJhYTczNDA0YTJkNWFmOWEyMTBlZDhiMDMxMmY2YmEKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJb25lIGhvb2sgZGVsaXZlcnMgZXZlcnkgYWN0aW9uIGl0IHJlY29yZHMJNzhlZmE1NjhmMzFlOGE5MTRjN2RkNGQwZjI2YWY0ODM4MWU0OGMxZTNmYWUyYWM0YzU1NmY0MjgzNGZmNDQyZApib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwl0aGUgc2NyaXB0ZWQgc2Vzc2lvbiBhZHZpc2VzIGFzIGl0cyBzdGVwIHRhYmxlIGxpc3RzCWIxZmQwMjAwZTA4YzFjZDE4YTNhODExMzcxZmM4OThlMmUzYWEzM2NhMzY1YjlhNDFhZTQxZGMyODY1ODRkNzkKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJd3JpdGVzIHRoZSB0cmVlIGNhbm5vdCBzZWUgcmUtb3BlbiB0aGUgZmluZGluZwlkZGNiYzk4NmM0MTVlYjEwOTcxNTMxNTdjNWZiZmYyOWVhNGM0N2FjNjEyOTcwN2MzYzY4NTVjZWU0MTk4NTg4
  ```
  --- last 10 line(s) of stdout (of 281 after folding 281 raw)
    ...
  1..4
  # tests 4
  # suites 0
  # pass 0
  # fail 4
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 6266.077583
  ```
- 2026-09-17 · bdb6dde* · exit 0 · `set -o pipefail …` · acceptance-sha256:5c420a7c07384e67455710af4916c2c900bfa306f718e85eec7e3c1ad15a3ede · ms:28553
- 2026-09-17 · bdb6dde* · exit 0 · `set -o pipefail …` · acceptance-sha256:5c420a7c07384e67455710af4916c2c900bfa306f718e85eec7e3c1ad15a3ede · ms:28520
- 2026-09-17 · bdb6dde* · exit 0 · `set -o pipefail …` · acceptance-sha256:5c420a7c07384e67455710af4916c2c900bfa306f718e85eec7e3c1ad15a3ede · ms:27832
- 2026-09-17 · bdb6dde* · exit 0 · `set -o pipefail …` · acceptance-sha256:5c420a7c07384e67455710af4916c2c900bfa306f718e85eec7e3c1ad15a3ede · ms:28261
- 2026-09-17 · bdb6dde* · exit 0 · `set -o pipefail …` · acceptance-sha256:5c420a7c07384e67455710af4916c2c900bfa306f718e85eec7e3c1ad15a3ede · ms:27690
- 2026-09-17 · bdb6dde* · exit 0 · `set -o pipefail …` · acceptance-sha256:5c420a7c07384e67455710af4916c2c900bfa306f718e85eec7e3c1ad15a3ede · ms:27963
- 2026-09-17 · bdb6dde* · exit 0 · `set -o pipefail …` · acceptance-sha256:5c420a7c07384e67455710af4916c2c900bfa306f718e85eec7e3c1ad15a3ede · ms:27666
- 2026-09-17 · bdb6dde* · exit 0 · `set -o pipefail …` · acceptance-sha256:5c420a7c07384e67455710af4916c2c900bfa306f718e85eec7e3c1ad15a3ede · ms:28204
- 2026-09-17 · bdb6dde* · exit 0 · `set -o pipefail …` · acceptance-sha256:5c420a7c07384e67455710af4916c2c900bfa306f718e85eec7e3c1ad15a3ede · ms:29528
- 2026-09-17 · bdb6dde* · exit 0 · `set -o pipefail …` · acceptance-sha256:5b0765d5af4d8ce5bf9c73a79ff1ef2db731777cef1ea970871bd1dfbc10c28d · ms:29329
- 2026-09-17 · bdb6dde* · exit 0 · `set -o pipefail …` · acceptance-sha256:5b0765d5af4d8ce5bf9c73a79ff1ef2db731777cef1ea970871bd1dfbc10c28d · ms:29105
- 2026-09-17 · 555c7bc* · exit 0 · `set -o pipefail …` · acceptance-sha256:aa96a9368d960db3682d930cf47c1a6a6b73534a2a61ea17ca333fa76a167eb3 · ms:29622
- 2026-09-17 · 555c7bc* · exit 0 · `set -o pipefail …` · acceptance-sha256:aa96a9368d960db3682d930cf47c1a6a6b73534a2a61ea17ca333fa76a167eb3 · ms:29530
- 2026-09-18 · dceba5e* · exit 0 · `set -o pipefail …` · acceptance-sha256:7d9e9a12fb36759304990274eaf79a884eb1c1b12a94c6ec8e45c4d6c0a111b5 · ms:39690
- 2026-09-18 · dceba5e* · exit 0 · `set -o pipefail …` · acceptance-sha256:7d9e9a12fb36759304990274eaf79a884eb1c1b12a94c6ec8e45c4d6c0a111b5 · ms:39545
