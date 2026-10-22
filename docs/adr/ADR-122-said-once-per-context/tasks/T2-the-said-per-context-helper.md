# Task ADR-122-T2: One helper: the marker, the transcript scan, the fallback and the reset

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** L
**Owner:** Zy
**Produces:** `saidInContext(input, item, text)` and `SaidInContext`; the marker `<qh:<item>@<hash8>>`
**Consumes:** the hook-output record shapes and the channel measurement (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

One helper in Node and one in Go answer whether an item is in the receiving context, from that context's last request rebuilt
from the transcript (said, pending or unsaid), or say there is no evidence; and stamp the item's marker.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/said-per-context.test.mjs` | create | the scan, the marker and the fallback (0 locks: new) |
| `plugin/scripts/said-per-context.mjs` | create | `saidInContext`, `itemMarker`, the incremental scan and its cache |
| `core/hooks/saidcontext.go` | create | the Go twin |
| `core/hooks/saidcontext_test.go` | create | Go rows |
| `tests/qh-core-parity.test.mjs` | edit | parity rows for the marker and the verdict (new tests beside locked ones) |
| `plugin/scripts/session-notes.mjs` | edit | the fallback is `firstMentionThisSession`; the scan cache lives in `saidMarkerDirectory()` under `sweepStaleMarkers` |
| `core/hooks/notes.go` | edit | the same |
| `docs/architecture.md` | edit | the two module rows |
| `tests/mutations/plugin/scripts/said-per-context.mjs.json` | create | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run, one row per "this fails if" of Decisions 1, 2, 3 and 6, each with its
   twin: an age-only difference keeps the digest and a changed finding changes it; a marker in the last main-loop request's
   hook text is said, and the same marker only in an earlier request, or only in a side query's request, is unsaid; a marker
   inside a `tool_result` block of the request counts for nothing; a marker recorded as a hook attachment but in no request is
   unsaid; a request rebuilt through two `base` links is read whole, and a missing blob or base is no evidence; an item said
   after the last request is pending, skipped while that request is last, and said again once a newer request lacks it; a
   hook input with an `agent_id` reads that subagent's transcript, a parent's marker does not suppress it, and an unlocatable
   subagent transcript is no evidence; a compaction's next request without the marker makes it unsaid; a resumed session's
   request with the marker keeps it said; a transcript replaced at the same path (new inode or first `uuid`) drops the cache,
   and an appended one keeps it; an incomplete last line leaves the offset before it and is read when complete; a second
   firing reads no cached blob again; past 8 MiB or 1 s, or on a parse failure, the answer is no-evidence, never said; a
   firing never blocks on another's cache write; no evidence is said once per context in one line, not per firing; an UNRUN
   line that changed is said.
2. [S2] Write `itemMarker(item, stableText)`: SHA-256 over the stable text, first 8 hex; volatile parts are passed apart.
3. [S3] Write the scan: from the cached offset, within the transcript identity, parse each complete line; index `api-request`
   records (id, `base`, `keep`, `tail`, `querySource`) and `api-request-blob` records (hash, markers found in hook text
   blocks, which T1's shape table names); rebuild the last main-loop request; stop at the budget; store the offset after the
   last complete line.
4. [S4] Write the pending store: an item said after the last request is kept under that request's id in the per-session,
   per-generation marker directory, through an exclusive create that never waits; it answers only while that request is the
   last.
5. [S5] The Go twin and the parity rows; the module map rows.
6. [S6] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/said-per-context.test.mjs tests/qh-core-parity.test.mjs 2>&1) \
  && for n in "an item in the last request is said, and one only in an earlier request is not" \
      "a marker in a tool result or in a side query is not a saying" \
      "a hook record no request carries is not a saying" \
      "an item said after the last request is pending until a newer request" \
      "a subagent's item is judged on its own transcript" \
      "a replaced transcript drops its cache and an appended one keeps it" \
      "an incomplete last line is read when it completes, and no cached blob is read twice" \
      "no request evidence suppresses nothing" \
      "a changed item and a changed could-not-look line are said"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done \
  && go_out=$(cd core && go test ./hooks/ -run '^TestSaidPerContext$' -v 2>&1) \
  && printf '%s\n' "$go_out" | grep -q '^--- PASS: TestSaidPerContext' \
  && (cd core && go test ./hooks/)
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an item in the last request is said, and one only in an earlier request is not` | `tests/said-per-context.test.mjs` | the rebuilt last request is the evidence; a compaction's request; a resume's request | — | S1, S3 |
| `a marker in a tool result or in a side query is not a saying` | `tests/said-per-context.test.mjs` | hook text blocks only; the main-loop `querySource` only | — | S1, S3 |
| `a hook record no request carries is not a saying` | `tests/said-per-context.test.mjs` | a transcript hook record is not delivery (the 2026-10-22 measurement) | — | S1, S3 |
| `an item said after the last request is pending until a newer request` | `tests/said-per-context.test.mjs` | the pending store and its expiry | — | S1, S4 |
| `a subagent's item is judged on its own transcript` | `tests/said-per-context.test.mjs` | parent to child, child to parent, sibling; unlocatable is no evidence | — | S1, S3 |
| `a replaced transcript drops its cache and an appended one keeps it` | `tests/said-per-context.test.mjs` | the transcript identity beside the offset | — | S1, S3 |
| `an incomplete last line is read when it completes, and no cached blob is read twice` | `tests/said-per-context.test.mjs` | the offset and the content-addressed blob cache | — | S1, S3 |
| `no request evidence suppresses nothing` | `tests/said-per-context.test.mjs` | budget, parse failure, missing blob or base, no records; said once per context in one line | — | S1, S3 |
| `a changed item and a changed could-not-look line are said` | `tests/said-per-context.test.mjs` | the digest, Decision 6 | — | S1, S2 |
| `TestSaidPerContext` | `core/hooks/saidcontext_test.go` | the Go twin's rows | — | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | nothing until T3 routes the emitters; T3's mutants on each call |
| 3 — the caller can discover it | the marker in the hook output |
| 4 — it is used | T5's after-measurement |

## Mutation Log
- 2026-10-22 · 41177ffb* · mutant killed · exit 1 · `plugin/scripts/said-per-context.mjs` · only a role system message is hook text; a user message quoting a marker is not a saying · acceptance-sha256:f3b780e3f6d4289955d1956ed1f5d13f2a3ffc92caae8802a5939bd219e3ef2b
- 2026-10-22 · 41177ffb* · mutant killed · exit 1 · `plugin/scripts/said-per-context.mjs` · only the main loop's last request is the context, never a side query · acceptance-sha256:f3b780e3f6d4289955d1956ed1f5d13f2a3ffc92caae8802a5939bd219e3ef2b
- 2026-10-22 · 41177ffb* · mutant killed · exit 1 · `plugin/scripts/said-per-context.mjs` · an item said after the last request is pending · acceptance-sha256:f3b780e3f6d4289955d1956ed1f5d13f2a3ffc92caae8802a5939bd219e3ef2b
- 2026-10-22 · 41177ffb* · mutant killed · exit 1 · `plugin/scripts/said-per-context.mjs` · with a blob missing, absence is not shown · acceptance-sha256:f3b780e3f6d4289955d1956ed1f5d13f2a3ffc92caae8802a5939bd219e3ef2b
- 2026-10-22 · 41177ffb* · mutant killed · exit 1 · `plugin/scripts/said-per-context.mjs` · a subagent's context is its own transcript · acceptance-sha256:f3b780e3f6d4289955d1956ed1f5d13f2a3ffc92caae8802a5939bd219e3ef2b
- 2026-10-22 · 41177ffb* · mutant survived · exit 0 · `plugin/scripts/said-per-context.mjs` · the offset never passes an incomplete last line · acceptance-sha256:f3b780e3f6d4289955d1956ed1f5d13f2a3ffc92caae8802a5939bd219e3ef2b
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-10-22 · 41177ffb* · mutant killed · exit 1 · `plugin/scripts/said-per-context.mjs` · a replaced transcript drops its cache · acceptance-sha256:f3b780e3f6d4289955d1956ed1f5d13f2a3ffc92caae8802a5939bd219e3ef2b
- 2026-10-22 · 41177ffb* · mutant killed · exit 1 · `plugin/scripts/said-per-context.mjs` · the offset never passes an incomplete last line (the one guard, after the survivor showed two) · acceptance-sha256:f3b780e3f6d4289955d1956ed1f5d13f2a3ffc92caae8802a5939bd219e3ef2b

## Invariants

- A hook never waits on the scan or on a lock.
- Every failure to read errs toward saying.
- Node and Go agree on the marker and the verdict.

## Risks

- The host edits the context after a request (`context_management`) and removes a hook text block: T1's S4 answers it; if
  it can, the evidence is not the request and T2 stops (Stop Condition).
- What the test doubles do not model: the synthetic transcripts carry the record shapes T1 measured on 2.1.307; T5's real
  session meets the current one.

## Stop Condition

Stop if T1 recorded `querySource` or `context_management` as could-not-measure, or measured that a host-side edit removes
hook text after a request: the last request is then not the receiving context, and the owner decides.

## Out of Scope

- Routing the emitters (T3) and the channels (T4).

## Verification Log
- 2026-10-22 · 41177ffb* · exit 1 · `out=$(node --test --test-reporter=tap tests/said-per-context.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:f3b780e3f6d4289955d1956ed1f5d13f2a3ffc92caae8802a5939bd219e3ef2b · ms:11511 · test-lock-sha256:c281298f6e57f74dc1e719de1a19d721b764f76d6e8aa9f6a119c9a3f162248f · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvc2FpZC1wZXItY29udGV4dC50ZXN0Lm1qcwlhIGNoYW5nZWQgaXRlbSBhbmQgYSBjaGFuZ2VkIGNvdWxkLW5vdC1sb29rIGxpbmUgYXJlIHNhaWQJOTMyNmY0ODRiMmI0OWQ5NTAxMDA0YWQ0NjEzOGYyMzhiZjAzMWQyNGFjMzg2MDdmYTM3OTVlYmUzZTNjNjhiOQpib2R5CXRlc3RzL3NhaWQtcGVyLWNvbnRleHQudGVzdC5tanMJYSBob29rIHJlY29yZCBubyByZXF1ZXN0IGNhcnJpZXMgaXMgbm90IGEgc2F5aW5nCTJjOGIxZDQwNzBiM2FkMWI5YWFlMTdhZjNhYmM2MmJmYjI5YzQwYjBjZDNiMWMxMWEyYWMxOTc2MTVhNDM3MmIKYm9keQl0ZXN0cy9zYWlkLXBlci1jb250ZXh0LnRlc3QubWpzCWEgbWFya2VyIGluIGEgdG9vbCByZXN1bHQgb3IgaW4gYSBzaWRlIHF1ZXJ5IGlzIG5vdCBhIHNheWluZwk2Nzg0MDU4ODliZWY1MzAxNTMzNDNiZGFiNDA3ZmZjYjk1ZjJiODcyZmRiMjI3MGU0MDkwZTlkMGRmOTEwNjQyCmJvZHkJdGVzdHMvc2FpZC1wZXItY29udGV4dC50ZXN0Lm1qcwlhIHJlcGxhY2VkIHRyYW5zY3JpcHQgZHJvcHMgaXRzIGNhY2hlIGFuZCBhbiBhcHBlbmRlZCBvbmUga2VlcHMgaXQJYjZiZTRhMzkwNGIwMzgyYzI5MjE1MjdjNGM0NWVhMTdjNTZmZDYxMGRmYzk2YzdhOTNiYzUyOTQwNmY2NGVhOApib2R5CXRlc3RzL3NhaWQtcGVyLWNvbnRleHQudGVzdC5tanMJYSBzdWJhZ2VudCdzIGl0ZW0gaXMganVkZ2VkIG9uIGl0cyBvd24gdHJhbnNjcmlwdAkxNGU3ODU2MDIzMWQ0MzJlMjNjM2ZlNWZmZWI4OTY5ZGI2ZGVjNGE5M2E2MDhmNTE4ZDk1NmJiMWQ4ZTQ0MjVjCmJvZHkJdGVzdHMvc2FpZC1wZXItY29udGV4dC50ZXN0Lm1qcwlhbiBpbmNvbXBsZXRlIGxhc3QgbGluZSBpcyByZWFkIHdoZW4gaXQgY29tcGxldGVzLCBhbmQgbm8gY2FjaGVkIGJsb2IgaXMgcmVhZCB0d2ljZQkxMDBkODVhNzg5NDIwZTQ5MTFmZjhhNWExNjY1NDQwYTYwOTFmNzc4MTY3ODg3Y2IwZDUxNTBhOWYzMzdiZTg3CmJvZHkJdGVzdHMvc2FpZC1wZXItY29udGV4dC50ZXN0Lm1qcwlhbiBpdGVtIGluIHRoZSBsYXN0IHJlcXVlc3QgaXMgc2FpZCwgYW5kIG9uZSBvbmx5IGluIGFuIGVhcmxpZXIgcmVxdWVzdCBpcyBub3QJZDU5Yzc0N2UzZGE0ODMzNDY1ZDY4NGVjNmJlZTUyM2EzZDc5NjI4NzVkMjhhNGNlNmE3ZDlhYjg0NDA2ZGEwOQpib2R5CXRlc3RzL3NhaWQtcGVyLWNvbnRleHQudGVzdC5tanMJYW4gaXRlbSBzYWlkIGFmdGVyIHRoZSBsYXN0IHJlcXVlc3QgaXMgcGVuZGluZyB1bnRpbCBhIG5ld2VyIHJlcXVlc3QJODU1ZDYzOTgyYzdkZTc1MTI1NDk3MjE0YTUzNjVjNzUzNTcxMzljZmE2NjQ1ZmUwMGZhZTE0ODg3ZjdlNmU0Nwpib2R5CXRlc3RzL3NhaWQtcGVyLWNvbnRleHQudGVzdC5tanMJbm8gcmVxdWVzdCBldmlkZW5jZSBzdXBwcmVzc2VzIG5vdGhpbmcJNzZhMDg3M2FlYWI1MTYzM2NiMTQxYWZjOWUxZmY5NTVkMTNkY2YxZTc3NTE0Njk2NmMyMzk5ZWJlNDdkYTY1ZQp1bnByb3Zlbgljb3JlL2hvb2tzL3NhaWRjb250ZXh0X3Rlc3QuZ28JVGVzdFNhaWRQZXJDb250ZXh0
  ```
  ```
- 2026-10-22 · 41177ffb* · exit 0 · `out=$(node --test --test-reporter=tap tests/said-per-context.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:f3b780e3f6d4289955d1956ed1f5d13f2a3ffc92caae8802a5939bd219e3ef2b · ms:10047
- 2026-10-22 · 41177ffb* · exit 0 · `out=$(node --test --test-reporter=tap tests/said-per-context.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:f3b780e3f6d4289955d1956ed1f5d13f2a3ffc92caae8802a5939bd219e3ef2b · ms:9679
- 2026-10-22 · 41177ffb* · exit 0 · `out=$(node --test --test-reporter=tap tests/said-per-context.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:f3b780e3f6d4289955d1956ed1f5d13f2a3ffc92caae8802a5939bd219e3ef2b · ms:8857
- 2026-10-22 · 41177ffb* · exit 0 · `out=$(node --test --test-reporter=tap tests/said-per-context.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:f3b780e3f6d4289955d1956ed1f5d13f2a3ffc92caae8802a5939bd219e3ef2b · ms:8393
- 2026-10-22 · 41177ffb* · exit 0 · `out=$(node --test --test-reporter=tap tests/said-per-context.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:f3b780e3f6d4289955d1956ed1f5d13f2a3ffc92caae8802a5939bd219e3ef2b · ms:7664
- 2026-10-22 · 41177ffb* · exit 0 · `out=$(node --test --test-reporter=tap tests/said-per-context.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:f3b780e3f6d4289955d1956ed1f5d13f2a3ffc92caae8802a5939bd219e3ef2b · ms:6934
- 2026-10-22 · 41177ffb* · exit 0 · `out=$(node --test --test-reporter=tap tests/said-per-context.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:f3b780e3f6d4289955d1956ed1f5d13f2a3ffc92caae8802a5939bd219e3ef2b · ms:8615
- 2026-10-22 · 41177ffb* · exit 0 · `out=$(node --test --test-reporter=tap tests/said-per-context.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:f3b780e3f6d4289955d1956ed1f5d13f2a3ffc92caae8802a5939bd219e3ef2b · ms:9870
- 2026-10-22 · 41177ffb* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:f3b780e3f6d4289955d1956ed1f5d13f2a3ffc92caae8802a5939bd219e3ef2b · ms:0 · test-lock-sha256:e1f9fe2328f3b3cf6bd1f654ccc975087bee2aadb17197a06351d3ec0c5fe76d · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJY29yZS9ob29rcy9zYWlkY29udGV4dF90ZXN0LmdvCVRlc3RTYWlkUGFyaXR5CTNjZmJjNmRmYTgwYjEyZTg4YjMyMDcyNzc4MDczYmY2MzQ0YWI2YzliNGM0YmUwYWY2YTYwN2ZiM2QwMDRkMmUKYm9keQljb3JlL2hvb2tzL3NhaWRjb250ZXh0X3Rlc3QuZ28JVGVzdFNhaWRQZXJDb250ZXh0CWZmYTRkMzc2YTFhZGE0NDhmMWIzOGU4NTRjMmYzZjkxYjg2YTQ1ZTQ0YTQxODIwMTQxNzZhNzQ1NzM0YTI1MGEKYm9keQl0ZXN0cy9zYWlkLXBlci1jb250ZXh0LnRlc3QubWpzCWEgY2hhbmdlZCBpdGVtIGFuZCBhIGNoYW5nZWQgY291bGQtbm90LWxvb2sgbGluZSBhcmUgc2FpZAk5MzI2ZjQ4NGIyYjQ5ZDk1MDEwMDRhZDQ2MTM4ZjIzOGJmMDMxZDI0YWMzODYwN2ZhMzc5NWViZTNlM2M2OGI5CmJvZHkJdGVzdHMvc2FpZC1wZXItY29udGV4dC50ZXN0Lm1qcwlhIGhvb2sgcmVjb3JkIG5vIHJlcXVlc3QgY2FycmllcyBpcyBub3QgYSBzYXlpbmcJMmM4YjFkNDA3MGIzYWQxYjlhYWUxN2FmM2FiYzYyYmZiMjljNDBiMGNkM2IxYzExYTJhYzE5NzYxNWE0MzcyYgpib2R5CXRlc3RzL3NhaWQtcGVyLWNvbnRleHQudGVzdC5tanMJYSBtYXJrZXIgaW4gYSB0b29sIHJlc3VsdCBvciBpbiBhIHNpZGUgcXVlcnkgaXMgbm90IGEgc2F5aW5nCTY3ODQwNTg4OWJlZjUzMDE1MzM0M2JkYWI0MDdmZmNiOTVmMmI4NzJmZGIyMjcwZTQwOTBlOWQwZGY5MTA2NDIKYm9keQl0ZXN0cy9zYWlkLXBlci1jb250ZXh0LnRlc3QubWpzCWEgcmVwbGFjZWQgdHJhbnNjcmlwdCBkcm9wcyBpdHMgY2FjaGUgYW5kIGFuIGFwcGVuZGVkIG9uZSBrZWVwcyBpdAliNmJlNGEzOTA0YjAzODJjMjkyMTUyN2M0YzQ1ZWExN2M1NmZkNjEwZGZjOTZjN2E5M2JjNTI5NDA2ZjY0ZWE4CmJvZHkJdGVzdHMvc2FpZC1wZXItY29udGV4dC50ZXN0Lm1qcwlhIHN1YmFnZW50J3MgaXRlbSBpcyBqdWRnZWQgb24gaXRzIG93biB0cmFuc2NyaXB0CTE0ZTc4NTYwMjMxZDQzMmUyM2MzZmU1ZmZlYjg5NjlkYjZkZWM0YTkzYTYwOGY1MThkOTU2YmIxZDhlNDQyNWMKYm9keQl0ZXN0cy9zYWlkLXBlci1jb250ZXh0LnRlc3QubWpzCWFuIGluY29tcGxldGUgbGFzdCBsaW5lIGlzIHJlYWQgd2hlbiBpdCBjb21wbGV0ZXMsIGFuZCBubyBjYWNoZWQgYmxvYiBpcyByZWFkIHR3aWNlCTEwMGQ4NWE3ODk0MjBlNDkxMWZmOGE1YTE2NjU0NDBhNjA5MWY3NzgxNjc4ODdjYjBkNTE1MGE5ZjMzN2JlODcKYm9keQl0ZXN0cy9zYWlkLXBlci1jb250ZXh0LnRlc3QubWpzCWFuIGl0ZW0gaW4gdGhlIGxhc3QgcmVxdWVzdCBpcyBzYWlkLCBhbmQgb25lIG9ubHkgaW4gYW4gZWFybGllciByZXF1ZXN0IGlzIG5vdAlkNTljNzQ3ZTNkYTQ4MzM0NjVkNjg0ZWM2YmVlNTIzYTNkNzk2Mjg3NWQyOGE0Y2U2YTdkOWFiODQ0MDZkYTA5CmJvZHkJdGVzdHMvc2FpZC1wZXItY29udGV4dC50ZXN0Lm1qcwlhbiBpdGVtIHNhaWQgYWZ0ZXIgdGhlIGxhc3QgcmVxdWVzdCBpcyBwZW5kaW5nIHVudGlsIGEgbmV3ZXIgcmVxdWVzdAk4NTVkNjM5ODJjN2RlNzUxMjU0OTcyMTRhNTM2NWM3NTM1NzEzOWNmYTY2NDVmZTAwZmFlMTQ4ODdmN2U2ZTQ3CmJvZHkJdGVzdHMvc2FpZC1wZXItY29udGV4dC50ZXN0Lm1qcwlubyByZXF1ZXN0IGV2aWRlbmNlIHN1cHByZXNzZXMgbm90aGluZwljZTFmY2U2NzYwYWQyZDA0MWEzNTI2ODgwZDIxMmVjOWNlNjE1ZTc5MmNiZWEyNWRhY2U2M2QwMzUyNWY0NGEw · test-lock-kind:replace
