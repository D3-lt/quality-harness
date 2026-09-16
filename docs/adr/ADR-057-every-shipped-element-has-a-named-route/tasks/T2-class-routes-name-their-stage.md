# Task ADR-057-T2: Class routes name the stage they route to

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** `work` class routes
**Consumes:** `quality-policy` risk table (single copy) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `class D's arch-write route`, `work's operating name`, `work's mutation-audit name`, `the stage claim keyed to nextStage's branches`, `the pinned routing text and skill-name checks`

## Goal

`work` names `arch-write` and the Open decision route in class D, `postmortem` in class A, `operating` in §0 and `mutation-audit` in §3, and no longer claims `work-next` reports an outdated architecture document.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/routing.test.mjs` | edit | the four tests below |
| `plugin/skills/work/SKILL.md` | edit | class D: "structural change with no architecture document → `/quality-harness:arch-write` → the Open decision route in `quality-policy` when two credible designs remain → `adr-write` → user Accepted gate → `adr-execute`" (the condition `adr-write` step 1 already states); the chain paragraph says so; class A backticks `postmortem`; §0 adds "when a gate behaves unexpectedly or the plugin was just updated, load `/quality-harness:operating` before trusting its output"; §3 names `/quality-harness:mutation-audit`; "Where this repository is" drops the architecture-document case |

## Ordered Steps

1. [S1] Add the four tests to `tests/routing.test.mjs` with real assertions and see each fail on an assertion (TDD red).
2. [S2] Edit class D's route and the chain paragraph that follows the class table; backtick `postmortem` in class A.
3. [S3] Add the `operating` step to §0.
4. [S4] Name `/quality-harness:mutation-audit` in §3's false-green sentence.
5. [S5] Remove "an architecture document older than the decision that changed it" from "Where this repository is", keeping the other cases it lists.
6. [S6] Run the fence green and record mutants: delete `arch-write` from class D; delete the `operating` step; delete the `mutation-audit` name; restore the architecture sentence. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(class D routes a structural change with no architecture document through arch-write|work names operating for a gate that behaves unexpectedly|work names mutation-audit where it asks whether a gate can fail|work claims no stage that work-next never selects)$' tests/routing.test.mjs 2>&1) \
  && for name in 'class D routes a structural change with no architecture document through arch-write' 'work names operating for a gate that behaves unexpectedly' 'work names mutation-audit where it asks whether a gate can fail' 'work claims no stage that work-next never selects'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/skill-metadata.test.mjs tests/skill-contract.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `class D routes a structural change with no architecture document through arch-write` | `tests/routing.test.mjs` | class D's route cell names `/quality-harness:arch-write` before `adr-write`, carries the no-architecture-document condition and names the Open decision route; class A backticks `postmortem` | — | S1, S2 |
| `work names operating for a gate that behaves unexpectedly` | `tests/routing.test.mjs` | §0 names `/quality-harness:operating` in a step about a gate behaving unexpectedly or a plugin update | — | S1, S3 |
| `work names mutation-audit where it asks whether a gate can fail` | `tests/routing.test.mjs` | §3's paragraph with the false-green guard names `/quality-harness:mutation-audit` | — | S1, S4 |
| `work claims no stage that work-next never selects` | `tests/routing.test.mjs` | reads the stage ids `nextStage` can return from `plugin/scripts/work-next.mjs`'s `STAGES.find(s => s.id === '…')` branches; while `arch-write` is not among them, "Where this repository is" must not mention an architecture document. A synthetic source that adds the branch permits the sentence, and a synthetic `work` body with the sentence and no branch is reported — so the test stays right when BACKLOG §210's predicate lands | — | S1, S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the four tests above |
| 2 — something selects it | the class table and §0/§3 are what the coordinator reads; S6's mutants show each assertion reads its line |
| 3 — the caller can discover it | `work/SKILL.md`; `tests/skill-contract.test.mjs` keeps every `/quality-harness:` name resolvable |
| 4 — it is used | nothing measures this yet; ADR-057's Follow-up re-counts `arch-write`, `operating`, `mutation-audit` and `postmortem` |

## Mutation Log
- 2026-09-16 · fc99e1e* · mutant killed · exit 1 · `plugin/skills/work/SKILL.md` · class D goes back to an unnamed architecture prerequisite, so no route reaches arch-write · acceptance-sha256:f851889b55cb276437632fe9b2531b809880c0044e8e3da3187f76c0f04a1524 · covers:class D's arch-write route
- 2026-09-16 · fc99e1e* · mutant killed · exit 1 · `plugin/skills/work/SKILL.md` · section 0 describes the operating guide in prose instead of naming the skill a session can load · acceptance-sha256:f851889b55cb276437632fe9b2531b809880c0044e8e3da3187f76c0f04a1524 · covers:work's operating name
- 2026-09-16 · fc99e1e* · mutant killed · exit 1 · `plugin/skills/work/SKILL.md` · the false-green guard describes mutation without naming the skill that measures it · acceptance-sha256:f851889b55cb276437632fe9b2531b809880c0044e8e3da3187f76c0f04a1524 · covers:work's mutation-audit name
- 2026-09-16 · fc99e1e* · mutant killed · exit 1 · `plugin/skills/work/SKILL.md` · work again claims work-next reports an outdated architecture document that nextStage cannot select · acceptance-sha256:f851889b55cb276437632fe9b2531b809880c0044e8e3da3187f76c0f04a1524 · covers:the stage claim keyed to nextStage's branches
- 2026-09-16 · fc99e1e* · mutant killed · exit 1 · `plugin/skills/work/SKILL.md` · a route names a skill that does not exist, which skill-contract must refuse · acceptance-sha256:f851889b55cb276437632fe9b2531b809880c0044e8e3da3187f76c0f04a1524 · covers:the pinned routing text and skill-name checks

## Invariants

- Every phrase `tests/skill-metadata.test.mjs` pins in `work/SKILL.md` stays.
- `plugin/scripts/work-next.mjs` is not edited.
- Class D's `arch-write` condition matches `adr-write` step 1's; this task does not widen it.

## Risks

- A structural change in a repository that already has an architecture document does not route to `arch-write`; `adr-write` step 1 updates the map in the same commit instead. That is the existing rule, kept.

## Stop Condition

Stop and ask if `nextStage` can in fact return `arch-write` for some corpus state — then the sentence was true and the test is wrong.

## Out of Scope

- The risk table and Codex wording (T1's job)
- Implementing the architecture-staleness predicate (deferred: docs/BACKLOG.md §210)

## Verification Log
- 2026-09-16 · fc99e1e* · exit 1 · `set -o pipefail …` · acceptance-sha256:f851889b55cb276437632fe9b2531b809880c0044e8e3da3187f76c0f04a1524 · ms:173 · test-lock-sha256:97e53f08d3d3fb502a405f4521f169311f1ff170f108614f328754c352080adb · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3JvdXRpbmcudGVzdC5tanMJYSBDb2RleCByb3V0ZSBzYXlzIHdoYXQgcnVucyB3aGVuIENvZGV4IGlzIG5vdCBpbnN0YWxsZWQJNjE5YTZmYTE5YzBkNGIwNGFmNTUyMjE1ODFiNDVjYmEzOTMwNDBmYWMyYzU2ODhkYzc0MjdkZTZkNDlmMWVhNgpib2R5CXRlc3RzL3JvdXRpbmcudGVzdC5tanMJY2xhc3MgRCByb3V0ZXMgYSBzdHJ1Y3R1cmFsIGNoYW5nZSB3aXRoIG5vIGFyY2hpdGVjdHVyZSBkb2N1bWVudCB0aHJvdWdoIGFyY2gtd3JpdGUJNzhjY2UyY2FiYjlkYzlhMWRiZGI5MzkxYzAzMTA1MTFkZjMwOTA3ZjJjMjg4ZThiZjQwMTA5MTJmY2Q3ZWQ3MApib2R5CXRlc3RzL3JvdXRpbmcudGVzdC5tanMJZXZlcnkgc2hpcHBlZCBza2lsbCwgYWdlbnQgYW5kIHdvcmtmbG93IGlzIG5hbWVkIGJ5IGEgcm91dGUJYWM5MDJjOTFkMjMxMjU4MWE4ZTYyNTVjNzViNGJkZDhkNWVhMTc5NjJjZjE1NGQ5YjY4NDFjMjAyYjlmYWFmYQpib2R5CXRlc3RzL3JvdXRpbmcudGVzdC5tanMJdGhlIE1vZGVyYXRlIHRpZXIgc3Bhd25zIHRoZSBjb3JyZWN0bmVzcyByZXZpZXdlciBieSBuYW1lCTE1OWE4ZGYyMjMxMzlkZjE2Y2MwMTBkYjgyMTRjMDIyNzFkMmU2ZDA1YzVjNTNlMGVlNmY2MjA0ZDM3ZWQwY2IKYm9keQl0ZXN0cy9yb3V0aW5nLnRlc3QubWpzCXRoZSBjb29yZGluYXRvciBsb2FkcyBxdWFsaXR5LXBvbGljeSBhbmQgYSBkZWxlZ2F0ZWQgcmV2aWV3ZXIgZG9lcyBub3QJMTU5M2NlMjM5ZGIyZGNhMjcwNDQzZjg4NjM2ZmRmNmNjNzM5NDA0MDllOGQ4NDY2ZTBkYjA3NTkzZTEzOGVhOApib2R5CXRlc3RzL3JvdXRpbmcudGVzdC5tanMJdGhlIHJpc2sgdGFibGUgaGFzIG9uZSBob21lCWRlOGU1NmQzODE4ZDVjNzA1MmVhMjQ5YTIxMWZlZmE5ZWEyNTUzYTkxODNlODljNmJiODlkYzA1MTExMTBjMzcKYm9keQl0ZXN0cy9yb3V0aW5nLnRlc3QubWpzCXdvcmsgY2xhaW1zIG5vIHN0YWdlIHRoYXQgd29yay1uZXh0IG5ldmVyIHNlbGVjdHMJNDIxZDViMmY5NThlMjYwNTU2OWViODVhOTFhNDM4ZjZiYjQ5NWQ4ZmZlZmJlNWY4ZjAyNTE1ODYzNGZkNDgxNgpib2R5CXRlc3RzL3JvdXRpbmcudGVzdC5tanMJd29yayBuYW1lcyBtdXRhdGlvbi1hdWRpdCB3aGVyZSBpdCBhc2tzIHdoZXRoZXIgYSBnYXRlIGNhbiBmYWlsCTYyOGU3NjBlN2YwZjQ1MmVlZTgyMDFkYjYxZGUwYzBmYjQ1MjYzZjUxMTliN2NmNGIxZDQ4NzIwMWIwMDY1NjIKYm9keQl0ZXN0cy9yb3V0aW5nLnRlc3QubWpzCXdvcmsgbmFtZXMgb3BlcmF0aW5nIGZvciBhIGdhdGUgdGhhdCBiZWhhdmVzIHVuZXhwZWN0ZWRseQkyN2Q1OTVhMjU2ZjNjMmMwNWEzOGM4NGRjZTQ0ZDA1YzlmNjA1OTVlZGUwMzM3NWMxZjY4NjBiYjcwYWNiMTAw
  ```
  ```
- 2026-09-16 · fc99e1e* · exit 0 · `set -o pipefail …` · acceptance-sha256:f851889b55cb276437632fe9b2531b809880c0044e8e3da3187f76c0f04a1524 · ms:1323
- 2026-09-16 · fc99e1e* · exit 0 · `set -o pipefail …` · acceptance-sha256:f851889b55cb276437632fe9b2531b809880c0044e8e3da3187f76c0f04a1524 · ms:1028
- 2026-09-16 · fc99e1e* · exit 0 · `set -o pipefail …` · acceptance-sha256:f851889b55cb276437632fe9b2531b809880c0044e8e3da3187f76c0f04a1524 · ms:982
- 2026-09-16 · fc99e1e* · exit 0 · `set -o pipefail …` · acceptance-sha256:f851889b55cb276437632fe9b2531b809880c0044e8e3da3187f76c0f04a1524 · ms:967
- 2026-09-16 · fc99e1e* · exit 0 · `set -o pipefail …` · acceptance-sha256:f851889b55cb276437632fe9b2531b809880c0044e8e3da3187f76c0f04a1524 · ms:999
