# Task ADR-103-T3: a dependency is a declaration, and history ends at this run

**Depends-on:** T1, T2
**Covers:** none — no spec
**Estimated scope:** S (two readers narrowed, one sentence, two tests)
**Owner:** unassigned
**Produces:** none
**Consumes:** `fastCheckHint(root)` (T1), `slowRunLine(records, command, ms)` (T2)
**Data dependency:** hermetic; fixture manifests and ledgers the tests write
**Proof map:** v1

## Goal

The Codex review of T1 and T2 (2026-10-15, REQUEST CHANGES) found: pytest-testmon read from any text in `pyproject.toml` (a
comment, a description, `pytest-testmon-helper`) and named as if declared; ledger rows written after this run's own counted as
its earlier passes; the hint said "a minute or more" under a configured threshold of 0; and the whole ledger read on every full
run. A dependency is now a declaration with exactly that name; the history is the rows before this run's own, read from the
ledger's tail; the hint makes no claim about time (ADR-103, Decisions 1 and 2).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/fast-check-hint.mjs` | edit | comments stripped; a quoted declaration or a `name =` key whose name is exactly `pytest-testmon`; a requirements line naming exactly it; no duration in the text |
| `plugin/scripts/check-ledger.mjs` | edit | `slowRunLineAfter` reads the ledger's last MiB and keeps only the rows before this run's own; none found, no line |
| `tests/fast-check-hint.test.mjs` | edit | the first test below |
| `tests/slow-run.test.mjs` | edit | the second test below |
| `tests/mutations/plugin/scripts/fast-check-hint.mjs.json` | edit | entries below |
| `tests/mutations/plugin/scripts/check-ledger.mjs.json` | edit | entries below |

## Ordered Steps

1. [S1] Add the tests below and record the red run (TDD red: a commented testmon is named; a later row counts).
2. [S2] Narrow the manifest reading and drop the duration from the text.
3. [S3] Keep only the rows before this run's own, from the ledger's tail.
4. [S4] Record killed mutants on the exact-name rule, the comment stripping and the before-this-run boundary. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/fast-check-hint.test.mjs tests/slow-run.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - (a dependency is a declaration of that name, not a mention|only the rows before this run's own are its history)")" = 2 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a dependency is a declaration of that name, not a mention` | `tests/fast-check-hint.test.mjs` | a commented declaration, a description mentioning it and `pytest-testmon-helper` draw the plain lever; `"pytest-testmon>=2"`, `pytest-testmon = "*"` and a requirements pin are named; the text never claims a duration | — | S1, S2 |
| `only the rows before this run's own are its history` | `tests/slow-run.test.mjs` | four passes, this run, a later pass: no line; this run missing from the ledger: no line; five before it: the line | — | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the narrowed readers |
| 2 — something selects it | `qh-check.mjs`'s run path (T1, T2) |
| 3 — the caller can discover it | the lines on stderr |
| 4 — it is used | ADR-103's Follow-ups |

## Mutation Log
- 2026-10-15 · 6bc9c300* · mutant killed · exit 1 · `plugin/scripts/check-ledger.mjs` · a pass written after this run would count as its history · acceptance-sha256:cbbc44195a3447fb937717f233ff0b222862bf682e02280140a2733fe69f632a

## Invariants

- T1's and T2's tests still pass: a declared runner is still named, a slow run is still said.

## Risks

- A ledger whose last MiB holds fewer than five passes before this run says nothing: could-not-say, never a false line.

## Stop Condition

Stop and ask if a common `pyproject.toml` layout declares pytest-testmon in a form neither rule reads.

## Out of Scope

- Manifests below the root (permanent: boundary: ADR-103 reads the root's manifests and says which file it read)

## Verification Log
- 2026-10-15 · 6bc9c300* · exit 1 · `out=$(node --test --test-reporter=tap tests/fast-check-hint.test.mjs tests/slow-run.test.mjs 2>&1) \ …` · acceptance-sha256:cbbc44195a3447fb937717f233ff0b222862bf682e02280140a2733fe69f632a · ms:8019 · test-lock-sha256:b3feb9c161482957ba30d8054474f8b3881c8342343cd1d39e4330611a0c5505 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvZmFzdC1jaGVjay1oaW50LnRlc3QubWpzCWEgZGVwZW5kZW5jeSBpcyBhIGRlY2xhcmF0aW9uIG9mIHRoYXQgbmFtZSwgbm90IGEgbWVudGlvbgkwOTI5NGZlMzE1MzgyZGY5Nzk3YTUzOWZjMDViMDA2YTc2MzU1ODQ2YmExNTNhYjNmNjQyMzg2YmI2ZjQwZTUwCmJvZHkJdGVzdHMvZmFzdC1jaGVjay1oaW50LnRlc3QubWpzCWEgcnVubmVyJ3Mgb3duIGZhc3QgY2hlY2sgaXMgbmFtZWQgZnJvbSBpdHMgbWFuaWZlc3QJNTFkMmQ3ZmYwMmI3NzdjMzBiNjgwNjE4NzA2NzViZjU2ODI0YzNhOTdjNDlmNWY3MTgyNjliZDhjZjNiZGY2Mgpib2R5CXRlc3RzL2Zhc3QtY2hlY2staGludC50ZXN0Lm1qcwlhIHNsb3cgcGFzcyB3aXRoIG5vIGZhc3RDaGVjayBoZWFycyBpdCBvbmNlLCBhbmQgbm90aGluZyBlbHNlIGhlYXJzIGl0CWIwNzM3ZjZhZWM5YjllNjUwYmVlMWVjODRkMDY1NzEwZWY5MWJkZGE2ZWI4MGU4MDUzYjc1Mjg4MDFiZWJlZjYKYm9keQl0ZXN0cy9mYXN0LWNoZWNrLWhpbnQudGVzdC5tanMJdGhlIGhpbnQgc2F5cyB3aGF0IGEgZmFzdCBwYXNzIGlzLCBhbmQgd3JpdGVzIG5vdGhpbmcJYThlOTUwZjE5MjkyNjJjZmMzOTEwZmYwNjI5OThjNzg5MGE5N2M1MTRiMjFkZTM4M2NiY2I3ZWNiYzYzYmM1MApib2R5CXRlc3RzL3Nsb3ctcnVuLnRlc3QubWpzCWEgcnVuIGhhbGYgYWdhaW4gaXRzIG93biBtZWRpYW4gaXMgc2FpZAlmOTYyZTFmNjJkNWM2YzRjNGRhYTRiYjhkYzM3YjA5NDk2ZWQ4ZjdmZGI0NzNjOTAyMzljZDgzMGFkYTI4MTAyCmJvZHkJdGVzdHMvc2xvdy1ydW4udGVzdC5tanMJYSBydW4gd2l0aGluIGl0cyBoaXN0b3J5LCBvciB3aXRoIHRvbyBsaXR0bGUgb2YgaXQsIHNheXMgbm90aGluZwlhOGJkZTM5YjFkMDA5ZjBlNzVhOTZiNmY5OTVjYTQyNDc3ODIxNGM0YmE0M2FjNzZlYjJiZmY0YjA5MGYxZjY5CmJvZHkJdGVzdHMvc2xvdy1ydW4udGVzdC5tanMJb25seSB0aGUgcm93cyBiZWZvcmUgdGhpcyBydW4ncyBvd24gYXJlIGl0cyBoaXN0b3J5CWJmNWEwNWU3M2FjMjUwOTNmMTVhZjhkNjNkNzFhODY5NjM2OTUwMTFiZmQ3YmY1N2VhMzNkYWFmM2ZiZjVkMzQKYm9keQl0ZXN0cy9zbG93LXJ1bi50ZXN0Lm1qcwlvbmx5IHRoaXMgY29tbWFuZCdzIG93biByZWNlbnQgZnVsbCBwYXNzZXMgbWFrZSB0aGUgbWVkaWFuCTQ4NTQ4OGRkMDlkZDk1NjA0OTAwOTkzYWE2M2MwY2YxZmUzNThjY2ZlZjZkNmExOWY5YmE2OGNjMjY2ZjdlOWE
  ```
  ```
- 2026-10-15 · 6bc9c300* · exit 0 · `out=$(node --test --test-reporter=tap tests/fast-check-hint.test.mjs tests/slow-run.test.mjs 2>&1) \ …` · acceptance-sha256:cbbc44195a3447fb937717f233ff0b222862bf682e02280140a2733fe69f632a · ms:7834
