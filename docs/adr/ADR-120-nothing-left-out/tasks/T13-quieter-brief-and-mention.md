# Task ADR-120-T13: branch-state reads the session's worktree and says a permanent unknown once; `git stash push` is no push

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** branch-state's cwd and permanent-unknown rule; the mention arm's stash rule
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

branch-state reports the worktree the session's payload names, a repository whose remotes name no GitHub host is said once per session, and the mention advisory no longer fires on `git stash push`.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/branch-state-cwd.test.mjs` | create | the cwd and permanent-unknown rows (0 locks: new) |
| `tests/mention-stash.test.mjs` | create | the stash rows (0 locks: new) |
| `plugin/scripts/branch-state.mjs` | edit | read the hook payload's `cwd` when present (`main`, :929-1027) and use it for every directory the script derives, from `mrw read --grep 'process\.cwd\(\)|cwd:' plugin/scripts/branch-state.mjs`: the shell's cwd (:75), the detached refresher (:836), the review ledger (:937), and both cache lookups (:957, :981); a `no remote names a GitHub host` state is keyed once per session, not per head change (:919-924) |
| `plugin/scripts/publish-verdict.mjs` | edit | `mentionsCommitOrPush` (:36-48): `stash push` after `git` is no push |
| `core/hooks/publish.go` | edit | the same (:33-64) |
| `tests/mutations/plugin/scripts/branch-state.mjs.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: a payload whose `cwd` is a linked worktree reports that worktree; a repository with only a Bitbucket remote prints its unknown at the first prompt and nothing on later prompts whose head changed; a GitHub repository whose run is in progress still says it once per change; `git stash push` draws no mention, `git push` and `git -c x=y push` still do.
2. [S2] Read the payload `cwd`; key the permanent unknown per session.
3. [S3] Add the stash rule to the mention arm, Node and Go.
4. [S4] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/branch-state-cwd.test.mjs tests/mention-stash.test.mjs 2>&1) \
  && for n in "branch-state reports the session's worktree and says a permanent unknown once" \
      "git stash push is no push, and a real push is still mentioned"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done \
  && (cd core && go test ./hooks/)
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `branch-state reports the session's worktree and says a permanent unknown once` | `tests/branch-state-cwd.test.mjs` | cwd and the once-per-session key | — | S1, S2 |
| `git stash push is no push, and a real push is still mentioned` | `tests/mention-stash.test.mjs` | the mention arm | — | S1, S3 |
| `a permanent unknown is heard once by each session and survives a refresh of its snapshot` | `tests/branch-state-cwd.test.mjs` | the once-per-session key across a TTL refresh | — | S2 |
| `git stash push repeated without a separator is still no push` | `tests/mention-stash.test.mjs` | the stash rule repeats until nothing changes | — | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | the hook or gate that calls it; the mutants on that call |
| 3 — the caller can discover it | the advice or output text, and the skill where one is named |
| 4 — it is used | every session or run of the gate in question |

## Mutation Log
- 2026-10-21 · 7a9107e8* · mutant killed · exit 1 · `plugin/scripts/branch-state.mjs` · the shell runs in the process directory, not the payload cwd · acceptance-sha256:b01875400be9677c00dc915f6bd4fc7f54ec4c6d36a04b2c30f4c867a66d769d
- 2026-10-21 · 7a9107e8* · mutant killed · exit 1 · `plugin/scripts/branch-state.mjs` · a permanent unknown is said again to the session that heard it · acceptance-sha256:b01875400be9677c00dc915f6bd4fc7f54ec4c6d36a04b2c30f4c867a66d769d
- 2026-10-21 · 7a9107e8* · mutant killed · exit 1 · `plugin/scripts/publish-verdict.mjs` · the advisory arm mentions a push in a stash · acceptance-sha256:b01875400be9677c00dc915f6bd4fc7f54ec4c6d36a04b2c30f4c867a66d769d
- 2026-10-21 · 7a9107e8* · mutant killed · exit 1 · `core/hooks/publish.go` · the Go advisory arm mentions a push in a stash · acceptance-sha256:b01875400be9677c00dc915f6bd4fc7f54ec4c6d36a04b2c30f4c867a66d769d

## Invariants

- Every locked test keeps its body; new tests go beside locked ones.
- Node and Go agree wherever both implement the rule.

## Risks

- A repository that gains a GitHub remote mid-session: the state changes, so it is said again.

## Stop Condition

Stop if the host starts UserPromptSubmit with no payload `cwd`: the fallback stays `process.cwd()`, said as such.

## Out of Scope

- The rest of §383's mention over-matching (quoted arguments of `gh`, grep patterns) (permanent: boundary: a quoted word can be code again in an interpreter's argument, CLAUDE.md §16; it needs measured rows per program, not this task)

## Verification Log
- 2026-10-21 · 7a9107e8* · exit 1 · `out=$(node --test --test-reporter=tap tests/branch-state-cwd.test.mjs tests/mention-stash.test.mjs 2>&1) \ …` · acceptance-sha256:b01875400be9677c00dc915f6bd4fc7f54ec4c6d36a04b2c30f4c867a66d769d · ms:3598 · test-lock-sha256:3694acd13c191cf46eea1373f347c6f05b0522b20851987433c36279ee5d326a · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYnJhbmNoLXN0YXRlLWN3ZC50ZXN0Lm1qcwlicmFuY2gtc3RhdGUgcmVwb3J0cyB0aGUgc2Vzc2lvbidzIHdvcmt0cmVlIGFuZCBzYXlzIGEgcGVybWFuZW50IHVua25vd24gb25jZQlkZGY3OTVlMzU4N2M0NmQ2ZTM2YzM3NzM2Mjk4MjlkNjVjYjFmOTY2N2UzM2Y2YWY3YzI0ODU0OTM4ZmJlMjlmCmJvZHkJdGVzdHMvbWVudGlvbi1zdGFzaC50ZXN0Lm1qcwlnaXQgc3Rhc2ggcHVzaCBpcyBubyBwdXNoLCBhbmQgYSByZWFsIHB1c2ggaXMgc3RpbGwgbWVudGlvbmVkCTk5OTdhMzNkMDhiNGMwNDI5MWZmYmIzN2NkZTk4OTAyYmE5ZDhlM2JhMTkxOTdkOTc0NjI2MzI4ZmQyNjdlZjc
  ```
  ```
- 2026-10-21 · 7a9107e8* · exit 0 · `out=$(node --test --test-reporter=tap tests/branch-state-cwd.test.mjs tests/mention-stash.test.mjs 2>&1) \ …` · acceptance-sha256:b01875400be9677c00dc915f6bd4fc7f54ec4c6d36a04b2c30f4c867a66d769d · ms:6672
- 2026-10-21 · 7a9107e8* · exit 0 · `out=$(node --test --test-reporter=tap tests/branch-state-cwd.test.mjs tests/mention-stash.test.mjs 2>&1) \ …` · acceptance-sha256:b01875400be9677c00dc915f6bd4fc7f54ec4c6d36a04b2c30f4c867a66d769d · ms:4871
- 2026-10-21 · 7a9107e8* · exit 0 · `out=$(node --test --test-reporter=tap tests/branch-state-cwd.test.mjs tests/mention-stash.test.mjs 2>&1) \ …` · acceptance-sha256:b01875400be9677c00dc915f6bd4fc7f54ec4c6d36a04b2c30f4c867a66d769d · ms:4503
- 2026-10-21 · 7a9107e8* · exit 0 · `out=$(node --test --test-reporter=tap tests/branch-state-cwd.test.mjs tests/mention-stash.test.mjs 2>&1) \ …` · acceptance-sha256:b01875400be9677c00dc915f6bd4fc7f54ec4c6d36a04b2c30f4c867a66d769d · ms:4876
- 2026-10-21 · 7a9107e8* · exit 0 · `out=$(node --test --test-reporter=tap tests/branch-state-cwd.test.mjs tests/mention-stash.test.mjs 2>&1) \ …` · acceptance-sha256:b01875400be9677c00dc915f6bd4fc7f54ec4c6d36a04b2c30f4c867a66d769d · ms:6799
- 2026-10-21 · 6a15e3e9* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:b01875400be9677c00dc915f6bd4fc7f54ec4c6d36a04b2c30f4c867a66d769d · ms:0 · test-lock-sha256:d5c7f8c747ae97df66b3933fea2d761faf3a43ec5d2ca0ca67164c0edfcf6e7a · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYnJhbmNoLXN0YXRlLWN3ZC50ZXN0Lm1qcwlhIHBlcm1hbmVudCB1bmtub3duIGlzIGhlYXJkIG9uY2UgYnkgZWFjaCBzZXNzaW9uIGFuZCBzdXJ2aXZlcyBhIHJlZnJlc2ggb2YgaXRzIHNuYXBzaG90CWMzNWU1MzQzZWYzMzU4NmE1ZDE2Nzc0NjdhOGNiZTllNWQxMmY0YzIwNDAwOGZmMzU5Y2ZhY2E5NTE2NWVjZDEKYm9keQl0ZXN0cy9icmFuY2gtc3RhdGUtY3dkLnRlc3QubWpzCWJyYW5jaC1zdGF0ZSByZXBvcnRzIHRoZSBzZXNzaW9uJ3Mgd29ya3RyZWUgYW5kIHNheXMgYSBwZXJtYW5lbnQgdW5rbm93biBvbmNlCWRkZjc5NWUzNTg3YzQ2ZDZlMzZjMzc3MzYyOTgyOWQ2NWNiMWY5NjY3ZTMzZjZhZjdjMjQ4NTQ5MzhmYmUyOWYKYm9keQl0ZXN0cy9tZW50aW9uLXN0YXNoLnRlc3QubWpzCWdpdCBzdGFzaCBwdXNoIGlzIG5vIHB1c2gsIGFuZCBhIHJlYWwgcHVzaCBpcyBzdGlsbCBtZW50aW9uZWQJOTk5N2EzM2QwOGI0YzA0MjkxZmZiYjM3Y2RlOTg5MDJiYTlkOGUzYmExOTE5N2Q5NzQ2MjYzMjhmZDI2N2VmNwpib2R5CXRlc3RzL21lbnRpb24tc3Rhc2gudGVzdC5tanMJZ2l0IHN0YXNoIHB1c2ggcmVwZWF0ZWQgd2l0aG91dCBhIHNlcGFyYXRvciBpcyBzdGlsbCBubyBwdXNoCWNjMDI0ZTM2NGFhMzE4YzJmN2M5ZTQ4MDQxMjgwNzMwNTAwNDcxODQ3NjNjMzFhOGUxZTdhZjhlNjRkNWZlMjI · test-lock-kind:replace
- 2026-10-21 · 6a15e3e9* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:b01875400be9677c00dc915f6bd4fc7f54ec4c6d36a04b2c30f4c867a66d769d · ms:0 · test-lock-sha256:d5c7f8c747ae97df66b3933fea2d761faf3a43ec5d2ca0ca67164c0edfcf6e7a · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYnJhbmNoLXN0YXRlLWN3ZC50ZXN0Lm1qcwlhIHBlcm1hbmVudCB1bmtub3duIGlzIGhlYXJkIG9uY2UgYnkgZWFjaCBzZXNzaW9uIGFuZCBzdXJ2aXZlcyBhIHJlZnJlc2ggb2YgaXRzIHNuYXBzaG90CWMzNWU1MzQzZWYzMzU4NmE1ZDE2Nzc0NjdhOGNiZTllNWQxMmY0YzIwNDAwOGZmMzU5Y2ZhY2E5NTE2NWVjZDEKYm9keQl0ZXN0cy9icmFuY2gtc3RhdGUtY3dkLnRlc3QubWpzCWJyYW5jaC1zdGF0ZSByZXBvcnRzIHRoZSBzZXNzaW9uJ3Mgd29ya3RyZWUgYW5kIHNheXMgYSBwZXJtYW5lbnQgdW5rbm93biBvbmNlCWRkZjc5NWUzNTg3YzQ2ZDZlMzZjMzc3MzYyOTgyOWQ2NWNiMWY5NjY3ZTMzZjZhZjdjMjQ4NTQ5MzhmYmUyOWYKYm9keQl0ZXN0cy9tZW50aW9uLXN0YXNoLnRlc3QubWpzCWdpdCBzdGFzaCBwdXNoIGlzIG5vIHB1c2gsIGFuZCBhIHJlYWwgcHVzaCBpcyBzdGlsbCBtZW50aW9uZWQJOTk5N2EzM2QwOGI0YzA0MjkxZmZiYjM3Y2RlOTg5MDJiYTlkOGUzYmExOTE5N2Q5NzQ2MjYzMjhmZDI2N2VmNwpib2R5CXRlc3RzL21lbnRpb24tc3Rhc2gudGVzdC5tanMJZ2l0IHN0YXNoIHB1c2ggcmVwZWF0ZWQgd2l0aG91dCBhIHNlcGFyYXRvciBpcyBzdGlsbCBubyBwdXNoCWNjMDI0ZTM2NGFhMzE4YzJmN2M5ZTQ4MDQxMjgwNzMwNTAwNDcxODQ3NjNjMzFhOGUxZTdhZjhlNjRkNWZlMjI · test-lock-kind:replace
- 2026-10-22 · ee3886b0* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:b01875400be9677c00dc915f6bd4fc7f54ec4c6d36a04b2c30f4c867a66d769d · ms:0 · test-lock-sha256:ea04916a1a9ae237559dcc289f2f207a650b3bc295a0695ac68cb2a24b741604 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYnJhbmNoLXN0YXRlLWN3ZC50ZXN0Lm1qcwlhIHBlcm1hbmVudCB1bmtub3duIGlzIGhlYXJkIG9uY2UgYnkgZWFjaCBzZXNzaW9uIGFuZCBzdXJ2aXZlcyBhIHJlZnJlc2ggb2YgaXRzIHNuYXBzaG90CTQwYmMyMTE1MzhiODcwOThkODJmMzE1NWRiYzMzODU3ZmVkMTVkODkwZDNhMjdmMTU3NGFhZWJhNGQxY2Q4ZWQKYm9keQl0ZXN0cy9icmFuY2gtc3RhdGUtY3dkLnRlc3QubWpzCWJyYW5jaC1zdGF0ZSByZXBvcnRzIHRoZSBzZXNzaW9uJ3Mgd29ya3RyZWUgYW5kIHNheXMgYSBwZXJtYW5lbnQgdW5rbm93biBvbmNlCWRkZjc5NWUzNTg3YzQ2ZDZlMzZjMzc3MzYyOTgyOWQ2NWNiMWY5NjY3ZTMzZjZhZjdjMjQ4NTQ5MzhmYmUyOWYKYm9keQl0ZXN0cy9tZW50aW9uLXN0YXNoLnRlc3QubWpzCWdpdCBzdGFzaCBwdXNoIGlzIG5vIHB1c2gsIGFuZCBhIHJlYWwgcHVzaCBpcyBzdGlsbCBtZW50aW9uZWQJOTk5N2EzM2QwOGI0YzA0MjkxZmZiYjM3Y2RlOTg5MDJiYTlkOGUzYmExOTE5N2Q5NzQ2MjYzMjhmZDI2N2VmNwpib2R5CXRlc3RzL21lbnRpb24tc3Rhc2gudGVzdC5tanMJZ2l0IHN0YXNoIHB1c2ggcmVwZWF0ZWQgd2l0aG91dCBhIHNlcGFyYXRvciBpcyBzdGlsbCBubyBwdXNoCWNjMDI0ZTM2NGFhMzE4YzJmN2M5ZTQ4MDQxMjgwNzMwNTAwNDcxODQ3NjNjMzFhOGUxZTdhZjhlNjRkNWZlMjIKYm9keQl0ZXN0cy9tZW50aW9uLXN0YXNoLnRlc3QubWpzCXRoZSBHbyBjb3JlJ3Mgc3Rhc2ggcm93cyBhbnN3ZXIgYXMgdGhlIE5vZGUgb25lcyBkbwk3ZDEzY2ZjYzZlZmJhNjAxY2YxMGFjYjBiN2FhNjQ0NzE3Y2FlOGQwZDBmNzY4ZmRkOWQ4ZjlmOWUwNjY4MTRi · test-lock-kind:replace
