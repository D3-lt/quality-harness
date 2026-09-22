# Task ADR-057-T3: Workflows spawn the shipped agents

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** workflow `agentType` call sites
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `quality-cycle's agentType options`, `review-ring's fixer agentType`, `the agentType-to-definition check`, `ADR-029's declared capabilities and the reviewer guard`

## Goal

`quality-cycle` spawns its correctness, scope and synthesis roles as `qh-correctness-reviewer`, `qh-scope-reviewer` and `qh-synthesis`, and `review-ring` spawns its fixer as `qh-narrow-fixer`, while the two roles that invoke skills stay inline.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/workflows.test.mjs` | edit | the three tests below |
| `plugin/workflows/quality-cycle.js` | edit | `agentType` on the `correctness`, `scope-simplicity` and `synthesis` calls; `model` stays (ADR-029); `codex-external` stays inline |
| `plugin/workflows/review-ring.js` | edit | `agentType: 'quality-harness:qh-narrow-fixer'` on `fix:once`; `review:fresh` stays inline |
| `tests/mutations.json` | edit | the two entries pinned to `fix:once`'s options line (`role: a spawned role that declares no capability is reported`, `role: a pinned model id is refused where an alias is required`) get `from`/`to` that match the new line, or `scripts/mutate.mjs` reports them STALE |
| `plugin/README.md` | edit | "The roles you can address by name" says a workflow addresses a role with `agentType`, with one example, without listing the directory |

The `agentType` option on each `agent()` call is the selecting line; deleting it returns the role to the default workflow subagent, which the tests catch.

## Ordered Steps

1. [S1] Add the three tests to `tests/workflows.test.mjs` using `runWorkflow` with a recording `agent` stub, and see each fail on an assertion (TDD red).
2. [S2] Add `agentType` to the three `quality-cycle.js` calls named above.
3. [S3] Add `agentType` to `review-ring.js`'s `fix:once` call, and update both pinned `tests/mutations.json` entries so each `from` matches the new line exactly once and each `to` still removes or pins `model` as before.
4. [S4] Update `plugin/README.md`'s roles paragraph. [proof: human: read the paragraph and confirm it describes workflow addressing without restating the agent list]
5. [S5] Run the fence green and record mutants: remove `agentType` from `quality-cycle`'s `synthesis` call; remove it from `review-ring`'s `fix:once`; rename one `agentType` to a definition that does not exist. [proof: mutation]
6. [S6] After committing, run `node scripts/mutate.mjs --case 'role: a'` and confirm both updated `fix:once` entries grade RED, not STALE. [proof: human: read the campaign's verdict line for the two role entries]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(quality-cycle runs its reviewers and synthesis as the shipped agents|review-ring runs its fixer as the shipped agent and keeps its reviewer inline|every agentType a workflow names is a shipped agent definition)$' tests/workflows.test.mjs 2>&1) \
  && for name in 'quality-cycle runs its reviewers and synthesis as the shipped agents' 'review-ring runs its fixer as the shipped agent and keeps its reviewer inline' 'every agentType a workflow names is a shipped agent definition'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/workflows.test.mjs tests/reviewer-guard.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `quality-cycle runs its reviewers and synthesis as the shipped agents` | `tests/workflows.test.mjs` | with `codex: true`, the recorded options for labels `correctness`, `scope-simplicity`, `synthesis` carry the three `quality-harness:qh-*` agent types and keep `model`; `codex-external` carries no `agentType` | — | S1, S2 |
| `review-ring runs its fixer as the shipped agent and keeps its reviewer inline` | `tests/workflows.test.mjs` | a blocking verdict drives the `fix:once` call with `agentType: 'quality-harness:qh-narrow-fixer'`; `review:fresh` carries no `agentType` | — | S1, S3 |
| `every agentType a workflow names is a shipped agent definition` | `tests/workflows.test.mjs` | every `agentType` literal in `plugin/workflows/*.js` is `quality-harness:<stem>` for a tracked `plugin/agents/<stem>.md`; a synthetic unknown name is reported | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests above |
| 2 — something selects it | the `agentType` option at each call site; S5's mutants delete it |
| 3 — the caller can discover it | the definitions' frontmatter `name`, which ADR-030 T1 keeps equal to the file stem |
| 4 — it is used | not observable from `tests/`: whether the host sets `agent_type` for a workflow-spawned agent, which the reviewer guard keys on (`lifecycle.mjs:4416`), is unverified; ADR-057's Follow-up re-counts agent invocations |

## Mutation Log
- 2026-09-16 · fc99e1e* · mutant killed · exit 1 · `plugin/workflows/quality-cycle.js` · quality-cycle's synthesis spawns the default workflow subagent again instead of qh-synthesis · acceptance-sha256:4366907c3980322b12387208ec56e716c0e97ee70ff0bcaddc357d0b8ebc1128 · covers:quality-cycle's agentType options
- 2026-09-16 · fc99e1e* · mutant killed · exit 1 · `plugin/workflows/review-ring.js` · review-ring's fixer spawns the default workflow subagent again instead of qh-narrow-fixer · acceptance-sha256:4366907c3980322b12387208ec56e716c0e97ee70ff0bcaddc357d0b8ebc1128 · covers:review-ring's fixer agentType
- 2026-09-16 · fc99e1e* · mutant killed · exit 1 · `plugin/workflows/quality-cycle.js` · a workflow names an agent no definition carries, which the host cannot resolve · acceptance-sha256:4366907c3980322b12387208ec56e716c0e97ee70ff0bcaddc357d0b8ebc1128 · covers:the agentType-to-definition check
- 2026-09-16 · fc99e1e* · mutant killed · exit 1 · `plugin/workflows/quality-cycle.js` · adding agentType costs the correctness reviewer its declared capability class · acceptance-sha256:4366907c3980322b12387208ec56e716c0e97ee70ff0bcaddc357d0b8ebc1128 · covers:ADR-029's declared capabilities and the reviewer guard

## Invariants

- Every `agent()` call keeps its `model` (ADR-029, `tests/workflows.test.mjs::every spawned role declares the capability it needs`).
- Roles whose prompt invokes a skill carry no `agentType`.
- `READ_ONLY_ROLES` in `plugin/scripts/lifecycle.mjs` is unchanged.
- Every `tests/mutations.json` entry naming `plugin/workflows/review-ring.js` still matches exactly once.

## Risks

- The host may not set `agent_type` for a workflow-spawned agent, so the reviewer guard may not apply; the prompts keep their read-only wording.
- The guard refuses some read-only commands a reviewer uses to gather evidence (BACKLOG §211); a `quality-cycle` reviewer that cannot look returns `unavailable`, and the workflow fails closed.

## Stop Condition

Stop and ask if `tests/reviewer-guard.test.mjs` or ADR-029's workflow test goes red, if a `quality-cycle` role turns out to invoke a skill, or if a live `quality-cycle` run returns `reviewer-unavailable` because the guard refused the evidence commands of a reviewer it spawned.

## Out of Scope

- `consensus.js` roles (permanent: boundary: its synthesis adjudicates design proposals, not reviews)
- Giving any definition the Skill tool (permanent: boundary: it widens a read-only role; ADR-057 Alternatives)
- Loosening the reviewer guard (deferred: docs/BACKLOG.md §211)

## Verification Log
- 2026-09-16 · fc99e1e* · exit 1 · `set -o pipefail …` · acceptance-sha256:4366907c3980322b12387208ec56e716c0e97ee70ff0bcaddc357d0b8ebc1128 · ms:99 · test-lock-sha256:3a8779cffef5f23c6b2d2a4a8bca6899bca9b062a922128472ff5d75fce4159e · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3dvcmtmbG93cy50ZXN0Lm1qcwlDb2RleCByZXZpZXcgYW5kIGFkdmljZSBza2lsbHMgbWFyayBzcGF3bmVkIHNlc3Npb25zIGFzIG5vbi1yZWN1cnNpdmUgbGVhdmVzCTIwMmRhMzk4ZTVlODJmZjcxNjc2NWFhNjAwZWI2ODcxOGMwMmZjMzY2ZGE3ZmRmNTY3YjQ3MzljM2VhNTZmYTYKYm9keQl0ZXN0cy93b3JrZmxvd3MudGVzdC5tanMJY29uc2Vuc3VzIHJvbGVzIHJlbWFpbiByZWFkLW9ubHkgbGVhdmVzIGFuZCBzeW50aGVzaXplIG9uZSBtaW5pbWFsIGRlY2lzaW9uCWQ2ZDExMDhmYTlmYjE3ZjMyZjU4MjRkNDkwZTU1YzgzMzBmZjZmY2ZjY2IwNGY4NmU4NThhYzUzYmVmMWJmMGQKYm9keQl0ZXN0cy93b3JrZmxvd3MudGVzdC5tanMJZGVjbGFyaW5nIGEgY2FwYWJpbGl0eSBkb2VzIG5vdCBjb3N0IGEgcm9sZSBpdHMgc2NoZW1hCTU5YjM1NGViODFiMzFlYzdiZGQyYjVlMzNiYWY5NTM2MTBmOTgzNTg5ZGZlMDNmNWVkZmU3YTE3YmJkYzBiZmYKYm9keQl0ZXN0cy93b3JrZmxvd3MudGVzdC5tanMJZXZlcnkgYWdlbnRUeXBlIGEgd29ya2Zsb3cgbmFtZXMgaXMgYSBzaGlwcGVkIGFnZW50IGRlZmluaXRpb24JZWRiYmJlODUyMGQ2OTllMzUzNTE2ZGRlYTk4ZWIzYmU0ZGQxMTc5OWUwYzgwN2M1OWFiOGJkY2M2MWFiNThjYgpib2R5CXRlc3RzL3dvcmtmbG93cy50ZXN0Lm1qcwlldmVyeSBzcGF3bmVkIHJvbGUgZGVjbGFyZXMgdGhlIGNhcGFiaWxpdHkgaXQgbmVlZHMJMGMyODFmZGQ3ZThjOWJjZmY2YWNhODRlNDA2YWYyNjVmNTM2MjEzMDhiN2RmNGM2ZDQyOWM0NTk2MGUyYWViOQpib2R5CXRlc3RzL3dvcmtmbG93cy50ZXN0Lm1qcwlxdWFsaXR5LWN5Y2xlIGNhbm5vdCBzeW50aGVzaXplIGEgcmVxdWlyZWQgZXZpZGVuY2UtbGltaXRlZCByZXZpZXcgaW50byBjbGVhbglhNGUxYzllODE1NDJiODM1OGVlYzExYmE3NDdmODNhZjA3OTNlN2VhZTc3M2ViMTA4NzQ2NWRhMDFjN2ZkMjhhCmJvZHkJdGVzdHMvd29ya2Zsb3dzLnRlc3QubWpzCXF1YWxpdHktY3ljbGUgZmFpbHMgY2xvc2VkIHdoZW4gYSByZXF1aXJlZCByZXZpZXdlciBpcyB1bmF2YWlsYWJsZQlhZjUwMmQzZDUxNTkxMWFiMWMzYzRkMTBhYmZhYTQzZGQyZTllYzlmYzg1MmQwNGM5MzZmMzkxNThkOTU1MTNlCmJvZHkJdGVzdHMvd29ya2Zsb3dzLnRlc3QubWpzCXF1YWxpdHktY3ljbGUgcHJlc2VydmVzIHVuYXZhaWxhYmxlIGNhbGxlciBldmlkZW5jZSB0aHJvdWdoIHN5bnRoZXNpcwlhNWMxZGMwM2IyMmQ5YzcyMTFlMTE2NzMzMjFmNWU2ZDMyYWViZWU4YTI2ZTNlYTMyYmUyNDM5MjBiODM0MTY5CmJvZHkJdGVzdHMvd29ya2Zsb3dzLnRlc3QubWpzCXF1YWxpdHktY3ljbGUgcnVucyBpdHMgcmV2aWV3ZXJzIGFuZCBzeW50aGVzaXMgYXMgdGhlIHNoaXBwZWQgYWdlbnRzCWY1YmM1MTI2YzZiNzEyZmFhNjZiZGNlZjlmNjQ5NmM0NzQyYmQyMDMzMjQxYmZiYjdhYTMzZDc1MTQzMDQ1OTYKYm9keQl0ZXN0cy93b3JrZmxvd3MudGVzdC5tanMJcmV2aWV3LXJpbmcgYWNjZXB0cyBhIGNvbnNpc3RlbnQgY2xlYW4gdmVyZGljdCBhZnRlciBwYXNzaW5nIGV2aWRlbmNlCTU2OWFlMTAxNzNjODkwMmQzMDVhN2Q1NDI0NjhhNDZhYjM0N2VmNzYxODQwZWFjNmM4NTNiNDM4M2Y2ZTJmNDUKYm9keQl0ZXN0cy93b3JrZmxvd3MudGVzdC5tanMJcmV2aWV3LXJpbmcgY2Fubm90IHR1cm4gdW5hdmFpbGFibGUgZXZpZGVuY2UgaW50byBhIGNsZWFuIHZlcmRpY3QJYWE4MWVmNWM2NWE3ZWJhYzIwNTBlZDM4ZTIxNDM5NGU2NzA1ZmMzMmJlOTAwMGNkOTM3NDBhZDEyMzI0NTljMgpib2R5CXRlc3RzL3dvcmtmbG93cy50ZXN0Lm1qcwlyZXZpZXctcmluZyBtYWtlcyBhdCBtb3N0IG9uZSBmaXggYW5kIHJldHVybnMgY29udHJvbCBmb3IgcmV2YWxpZGF0aW9uCWU2MDEyNGQ5NjVmYjZmMmY3OWYxNGJhM2JjYzFhMDdhNzkxNjdjZjc1N2FmMjRiMDA5N2Q1Yjc0NDY0YmY1M2QKYm9keQl0ZXN0cy93b3JrZmxvd3MudGVzdC5tanMJcmV2aWV3LXJpbmcgcmVqZWN0cyBtYWxmb3JtZWQgb3IgZmFpbGluZyBjYWxsZXIgZXZpZGVuY2UgYmVmb3JlIGRpc3BhdGNoCWU3ZjdlYmQ1NDJmODI2NjA3NGUwZjMyNjdlYzI4NjYyNTFkYTI1NmM0MTRjZGVhYjk1OTg4ZDVkMDJmMGI4MmUKYm9keQl0ZXN0cy93b3JrZmxvd3MudGVzdC5tanMJcmV2aWV3LXJpbmcgcnVucyBpdHMgZml4ZXIgYXMgdGhlIHNoaXBwZWQgYWdlbnQgYW5kIGtlZXBzIGl0cyByZXZpZXdlciBpbmxpbmUJNGE2YjMxNDdkZTFlMmRhMzVkOGZkNDYzYzYxMTRiYmY4YmFkZjUyMjBjN2UxYTQ5NzE0MzAzOGU3MWI3ZGRkMg
  ```
  ```
- 2026-09-16 · fc99e1e* · exit 0 · `set -o pipefail …` · acceptance-sha256:4366907c3980322b12387208ec56e716c0e97ee70ff0bcaddc357d0b8ebc1128 · ms:1478
- 2026-09-16 · fc99e1e* · exit 0 · `set -o pipefail …` · acceptance-sha256:4366907c3980322b12387208ec56e716c0e97ee70ff0bcaddc357d0b8ebc1128 · ms:1507
- 2026-09-16 · fc99e1e* · exit 0 · `set -o pipefail …` · acceptance-sha256:4366907c3980322b12387208ec56e716c0e97ee70ff0bcaddc357d0b8ebc1128 · ms:1469
- 2026-09-16 · fc99e1e* · exit 0 · `set -o pipefail …` · acceptance-sha256:4366907c3980322b12387208ec56e716c0e97ee70ff0bcaddc357d0b8ebc1128 · ms:1474
- 2026-09-22 · 4980936* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:4366907c3980322b12387208ec56e716c0e97ee70ff0bcaddc357d0b8ebc1128 · ms:0 · test-lock-sha256:02533fb0422874bdf4334abe9600390b71204712fef84788bd7aa1096a98a200 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3dvcmtmbG93cy50ZXN0Lm1qcwlDb2RleCByZXZpZXcgYW5kIGFkdmljZSBza2lsbHMgbWFyayBzcGF3bmVkIHNlc3Npb25zIGFzIG5vbi1yZWN1cnNpdmUgbGVhdmVzCTIwMmRhMzk4ZTVlODJmZjcxNjc2NWFhNjAwZWI2ODcxOGMwMmZjMzY2ZGE3ZmRmNTY3YjQ3MzljM2VhNTZmYTYKYm9keQl0ZXN0cy93b3JrZmxvd3MudGVzdC5tanMJY29uc2Vuc3VzIHJvbGVzIHJlbWFpbiByZWFkLW9ubHkgbGVhdmVzIGFuZCBzeW50aGVzaXplIG9uZSBtaW5pbWFsIGRlY2lzaW9uCWQ2ZDExMDhmYTlmYjE3ZjMyZjU4MjRkNDkwZTU1YzgzMzBmZjZmY2ZjY2IwNGY4NmU4NThhYzUzYmVmMWJmMGQKYm9keQl0ZXN0cy93b3JrZmxvd3MudGVzdC5tanMJZGVjbGFyaW5nIGEgY2FwYWJpbGl0eSBkb2VzIG5vdCBjb3N0IGEgcm9sZSBpdHMgc2NoZW1hCTU5YjM1NGViODFiMzFlYzdiZGQyYjVlMzNiYWY5NTM2MTBmOTgzNTg5ZGZlMDNmNWVkZmU3YTE3YmJkYzBiZmYKYm9keQl0ZXN0cy93b3JrZmxvd3MudGVzdC5tanMJZXZlcnkgYWdlbnRUeXBlIGEgd29ya2Zsb3cgbmFtZXMgaXMgYSBzaGlwcGVkIGFnZW50IGRlZmluaXRpb24JZWRiYmJlODUyMGQ2OTllMzUzNTE2ZGRlYTk4ZWIzYmU0ZGQxMTc5OWUwYzgwN2M1OWFiOGJkY2M2MWFiNThjYgpib2R5CXRlc3RzL3dvcmtmbG93cy50ZXN0Lm1qcwlldmVyeSBzcGF3bmVkIHJvbGUgZGVjbGFyZXMgdGhlIGNhcGFiaWxpdHkgaXQgbmVlZHMJYzY4NzhkNDNhYzRkZDkzOGI5NWM4M2RhOTIzZTA5ZDBiYWFiOGIxMzExYTJiN2QzYzA1MTgyOGFmNGQ1Nzk0Mgpib2R5CXRlc3RzL3dvcmtmbG93cy50ZXN0Lm1qcwlxdWFsaXR5LWN5Y2xlIGNhbm5vdCBzeW50aGVzaXplIGEgcmVxdWlyZWQgZXZpZGVuY2UtbGltaXRlZCByZXZpZXcgaW50byBjbGVhbglhNGUxYzllODE1NDJiODM1OGVlYzExYmE3NDdmODNhZjA3OTNlN2VhZTc3M2ViMTA4NzQ2NWRhMDFjN2ZkMjhhCmJvZHkJdGVzdHMvd29ya2Zsb3dzLnRlc3QubWpzCXF1YWxpdHktY3ljbGUgZmFpbHMgY2xvc2VkIHdoZW4gYSByZXF1aXJlZCByZXZpZXdlciBpcyB1bmF2YWlsYWJsZQlhZjUwMmQzZDUxNTkxMWFiMWMzYzRkMTBhYmZhYTQzZGQyZTllYzlmYzg1MmQwNGM5MzZmMzkxNThkOTU1MTNlCmJvZHkJdGVzdHMvd29ya2Zsb3dzLnRlc3QubWpzCXF1YWxpdHktY3ljbGUgcHJlc2VydmVzIHVuYXZhaWxhYmxlIGNhbGxlciBldmlkZW5jZSB0aHJvdWdoIHN5bnRoZXNpcwlhNWMxZGMwM2IyMmQ5YzcyMTFlMTE2NzMzMjFmNWU2ZDMyYWViZWU4YTI2ZTNlYTMyYmUyNDM5MjBiODM0MTY5CmJvZHkJdGVzdHMvd29ya2Zsb3dzLnRlc3QubWpzCXF1YWxpdHktY3ljbGUgcnVucyBpdHMgcmV2aWV3ZXJzIGFuZCBzeW50aGVzaXMgYXMgdGhlIHNoaXBwZWQgYWdlbnRzCTFhNzNhZGM5N2Y3YTFjZDcyN2I1MGM0YjUzOTlkNGQ4ODg0YTgwZmU0MTE5M2MyNDc4MzFmNWQ5YzVkZDBkOTAKYm9keQl0ZXN0cy93b3JrZmxvd3MudGVzdC5tanMJcmV2aWV3LXJpbmcgYWNjZXB0cyBhIGNvbnNpc3RlbnQgY2xlYW4gdmVyZGljdCBhZnRlciBwYXNzaW5nIGV2aWRlbmNlCTU2OWFlMTAxNzNjODkwMmQzMDVhN2Q1NDI0NjhhNDZhYjM0N2VmNzYxODQwZWFjNmM4NTNiNDM4M2Y2ZTJmNDUKYm9keQl0ZXN0cy93b3JrZmxvd3MudGVzdC5tanMJcmV2aWV3LXJpbmcgY2Fubm90IHR1cm4gdW5hdmFpbGFibGUgZXZpZGVuY2UgaW50byBhIGNsZWFuIHZlcmRpY3QJYWE4MWVmNWM2NWE3ZWJhYzIwNTBlZDM4ZTIxNDM5NGU2NzA1ZmMzMmJlOTAwMGNkOTM3NDBhZDEyMzI0NTljMgpib2R5CXRlc3RzL3dvcmtmbG93cy50ZXN0Lm1qcwlyZXZpZXctcmluZyBtYWtlcyBhdCBtb3N0IG9uZSBmaXggYW5kIHJldHVybnMgY29udHJvbCBmb3IgcmV2YWxpZGF0aW9uCWU2MDEyNGQ5NjVmYjZmMmY3OWYxNGJhM2JjYzFhMDdhNzkxNjdjZjc1N2FmMjRiMDA5N2Q1Yjc0NDY0YmY1M2QKYm9keQl0ZXN0cy93b3JrZmxvd3MudGVzdC5tanMJcmV2aWV3LXJpbmcgcmVqZWN0cyBtYWxmb3JtZWQgb3IgZmFpbGluZyBjYWxsZXIgZXZpZGVuY2UgYmVmb3JlIGRpc3BhdGNoCWU3ZjdlYmQ1NDJmODI2NjA3NGUwZjMyNjdlYzI4NjYyNTFkYTI1NmM0MTRjZGVhYjk1OTg4ZDVkMDJmMGI4MmUKYm9keQl0ZXN0cy93b3JrZmxvd3MudGVzdC5tanMJcmV2aWV3LXJpbmcgcnVucyBpdHMgZml4ZXIgYXMgdGhlIHNoaXBwZWQgYWdlbnQgYW5kIGtlZXBzIGl0cyByZXZpZXdlciBpbmxpbmUJNGE2YjMxNDdkZTFlMmRhMzVkOGZkNDYzYzYxMTRiYmY4YmFkZjUyMjBjN2UxYTQ5NzE0MzAzOGU3MWI3ZGRkMg · test-lock-kind:replace
