# Task ADR-108-T2: The subagent contract carries the mrw way

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one sentence, one test)
**Owner:** unassigned
**Produces:** the batching sentence in `subagentContract`
**Consumes:** none
**Proof map:** v1

## Goal

Every spawned role whose delegation allows edits is told, in the contract the SubagentStart hook hands it, to read every
site before the first edit, make the edits as one batch, and check that each edit landed (ADR-108, Decision 2).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/completion-rules.mjs` | edit | `subagentContract` gains one sentence after `roleLine`, only for a role that is not read-only |
| `tests/adr-108.test.mjs` | edit | the test below |
| `tests/mutations/plugin/scripts/completion-rules.mjs.json` | edit | the catalogue mutant |

## Ordered Steps

1. [S1] Add the test below and record the red run.
2. [S2] Add the sentence: `Read every site you will touch before the first edit, make the edits as one batch, and check that each landed: an edit that matched nothing is a failure (the execution skill's "Read and edit in batches").` A read-only role does not get it.
3. [S3] Add the catalogue mutant (the sentence dropped) and record a killed mutant. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/adr-108.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - a spawned implementer is told to read every site, edit in one batch, and check each edit landed")" = 1 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a spawned implementer is told to read every site, edit in one batch, and check each edit landed` | `tests/adr-108.test.mjs` | through the real SubagentStart hook: an implementer's contract carries the sentence; a reviewer's (read-only) does not; the sentence names the `execution` skill's section heading, which exists (`tests/mrw-way.test.mjs` holds the heading) | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the sentence in `subagentContract` |
| 2 — something selects it | a non-read-only `agent_type` |
| 3 — the caller can discover it | the SubagentStart hook's output |
| 4 — it is used | the test drives the real hook |

## Mutation Log
- 2026-10-17 · 6d947c86* · mutant killed · exit 1 · `plugin/scripts/completion-rules.mjs` · the implementer contract no longer carries the batching sentence · acceptance-sha256:220c0bb23c57488fa7c27018a3d1a6d3c1598046ea6f0a4ccfed403cddd774fb

## Invariants

- `tests/review-contract.test.mjs` (ADR-098 T2, locked) stays green: the blocking definitions are untouched.

## Risks

- None beyond ADR-108's.

## Stop Condition

Stop and ask if the sentence cannot be added without changing a line a locked test hashes.

## Out of Scope

- The read-only roles' contract (permanent: boundary: they do not edit)

## Verification Log
- 2026-10-17 · 6d947c86* · exit 1 · `out=$(node --test --test-reporter=tap tests/adr-108.test.mjs 2>&1) \ …` · acceptance-sha256:220c0bb23c57488fa7c27018a3d1a6d3c1598046ea6f0a4ccfed403cddd774fb · ms:4020 · test-lock-sha256:8d53c3894517bab72e97eb78f76c900ae04a9819d10ca817efc857b872987c53 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYWRyLTEwOC50ZXN0Lm1qcwlhIGNoZWNrIHRoYXQgY291bGQgbm90IHN0YXJ0IGlzIHJlcG9ydGVkIG9uY2UgYXMgZXZpZGVuY2UtbGltaXRlZCwgbm90IHJ1biBhZ2FpbgllZjdmZTQ1Y2QxMmFmYWVmMDUxYjMyNjEyODdhMjUxNmVjNGQ1M2IwZTFmMzhkNjhkNGIyNDc4ODE0NzVkYzk3CmJvZHkJdGVzdHMvYWRyLTEwOC50ZXN0Lm1qcwlhIHNwYXduZWQgaW1wbGVtZW50ZXIgaXMgdG9sZCB0byByZWFkIGV2ZXJ5IHNpdGUsIGVkaXQgaW4gb25lIGJhdGNoLCBhbmQgY2hlY2sgZWFjaCBlZGl0IGxhbmRlZAlhM2E3ZjBhZGI5YjI1Zjg4YzVkN2EzNTM1YWZjMWUwMTE5ZDY3YWFlZDc0Njg2Zjk3M2I2MDFkYWY0ODUzZGQ0
  ```
  ```
- 2026-10-17 · 6d947c86* · exit 0 · `out=$(node --test --test-reporter=tap tests/adr-108.test.mjs 2>&1) \ …` · acceptance-sha256:220c0bb23c57488fa7c27018a3d1a6d3c1598046ea6f0a4ccfed403cddd774fb · ms:2646
- 2026-10-18 · 097ca621* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:220c0bb23c57488fa7c27018a3d1a6d3c1598046ea6f0a4ccfed403cddd774fb · ms:0 · test-lock-sha256:53543b4984edf3bf6a34047ad545617f720059c4a4945773d9a0830094c7dc9e · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYWRyLTEwOC50ZXN0Lm1qcwlhIGNoZWNrIHRoYXQgY291bGQgbm90IHN0YXJ0IGlzIHJlcG9ydGVkIG9uY2UgYXMgZXZpZGVuY2UtbGltaXRlZCwgbm90IHJ1biBhZ2Fpbgk3ZTY4MDgxZGI0MTIzZTczYjZmN2EzYTg1YjNiZDNiNWUyNDhjNTNkMTEyNzc1NDk0MGY3MDZkZWJmN2I4OTc3CmJvZHkJdGVzdHMvYWRyLTEwOC50ZXN0Lm1qcwlhIHNwYXduZWQgaW1wbGVtZW50ZXIgaXMgdG9sZCB0byByZWFkIGV2ZXJ5IHNpdGUsIGVkaXQgaW4gb25lIGJhdGNoLCBhbmQgY2hlY2sgZWFjaCBlZGl0IGxhbmRlZAlhM2E3ZjBhZGI5YjI1Zjg4YzVkN2EzNTM1YWZjMWUwMTE5ZDY3YWFlZDc0Njg2Zjk3M2I2MDFkYWY0ODUzZGQ0CmJvZHkJdGVzdHMvYWRyLTEwOC50ZXN0Lm1qcwlhIHR1cm4gd2hvc2Ugd3JpdGVzIGxlZnQgdGhlIHRyZWUgdW5jaGFuZ2VkIGlzIHRvbGQgc28gb25jZSwgYW5kIGEgdHVybiB3aG9zZSB3cml0ZXMgY2hhbmdlZCBpdCBpcyBub3QJZTQxOGViZjBiNmI4ZGQ3YTIzYjI5NWU2MzhiNGFkYzVmNDYzNTQ0ZTNlODc3MGQzNTYzOGIwOGQ0MTUyMjkxMgpib2R5CXRlc3RzL2Fkci0xMDgudGVzdC5tanMJYSB3cml0ZSB0aGUgb2JzZXJ2ZWQgdHJlZSBjYW5ub3QgY29udGFpbiBpcyBuZXZlciBuYW1lZCB1bmNoYW5nZWQsIGFuZCBhIG5vLW9wIGluc2lkZSBpdCBzdGlsbCBpcwlkZGIxMDcxZDA5OWZjZDZlODhjMTBjNGMyNmQ0ZmUzOTNjOTczOTdmZjViNjBkNjJkNjJlZTEzZWFlN2EzNDYy · test-lock-kind:replace
