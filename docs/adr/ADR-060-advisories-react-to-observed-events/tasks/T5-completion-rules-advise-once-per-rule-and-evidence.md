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
out=$(node --test --test-reporter=tap --test-name-pattern '^(the scripted session advises as its step table lists|a repository without a check hears no completion advisory|an unchecked commit is named even when its tree equals the session start|writes the tree cannot see re-open the finding)$' tests/observed-events.test.mjs 2>&1) \
  || { printf '%s\n' "$out"; exit 1; }
for name in 'the scripted session advises as its step table lists' 'a repository without a check hears no completion advisory' 'an unchecked commit is named even when its tree equals the session start' 'writes the tree cannot see re-open the finding'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { printf '%s\n' "$out"; echo "did not run: $name"; exit 1; }; done \
  && node --test tests/lifecycle.test.mjs tests/claims-rate.test.mjs tests/statusline.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the scripted session advises as its step table lists` | `tests/observed-events.test.mjs` | ADR-060's fifteen steps, driven through SessionStart, PreToolUse, Stop and `qh-check` as processes in two temp repositories. Each step's delivered rules equal the Decision's table: R1 at steps 2, 10 and 15; P at 9, 11 and 12; R2 naming `five` at 14; nothing else. The ledger rows at steps 2 and 3 are both `unverified` with `version: "events/1"`, and `tally` recognises them beside an old row without a version. The row at step 9′, after P warned and the unchecked commit ran, is `unverified`. | — | S1, S2, S3 |
| `a repository without a check hears no completion advisory` | `tests/observed-events.test.mjs` | the same steps in a repository with no declared or inferred check deliver nothing, and its ledger rows are `no-check` | — | S1, S2, S3 |
| `an unchecked commit is named even when its tree equals the session start` | `tests/observed-events.test.mjs` | A session starts with an uncommitted file. Outside any hook it is committed, then a new file is written. Stop delivers R1 and R2, and R2 names that commit | — | S1, S2 |
| `writes the tree cannot see re-open the finding` | `tests/observed-events.test.mjs` | • **Repository with a check:** an Edit outside the repository, then Stop, gives R1 with a count and no path. A second outside Edit, then Stop, gives R1 again. `qh-check` passes, then Stop gives nothing.<br>• **Two worktrees of one repository:** an Edit outside the repository from worktree A, then `qh-check` passing in worktree B, then Stop in A gives R1.<br>• **Non-git directory with a declared check:** an Edit, then Stop, gives R4 and R1; a second Stop gives nothing; `qh-check` passes, then Stop gives nothing; an Edit during a passing `qh-check` still gives R1 at the next Stop.<br>• **Statusline:** from these logs it renders "last observed" with an age, and "unknown" without a log. | — | S1, S2, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the four tests |
| 2 — something selects it | the hooks route to the rules; the scenario drives them as processes; S6's mutants change a step's delivery |
| 3 — the caller can discover it | shipped guidance and SubagentStart name `qh-check` |
| 4 — it is used | every session's completion advisories and statusline |

## Mutation Log

## Invariants

- ADR-035's ledger receives one row per completion event.
- The completion artifact calls are unchanged until T6.
- Every `tests/mutations.json` entry matches exactly once after this task.

## Risks

- Removing emitter tests hides a regression the scenario does not cover. The removed tests are named in the commit.

## Stop Condition

Stop and ask if the scenario needs a different step table to describe a real state, since that changes ADR-060's pre-registered table.

## Out of Scope

- Artifact validation and notes (deferred: docs/adr/ADR-060-advisories-react-to-observed-events/tasks/T6-artifacts-and-notes-read-observed-changes.md)

## Verification Log
