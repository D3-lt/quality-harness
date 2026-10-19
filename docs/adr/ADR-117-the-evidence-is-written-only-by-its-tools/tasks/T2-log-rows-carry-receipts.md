# Task ADR-117-T2: Every log row adr-verify writes leaves a receipt, and adr-lint refuses an uncommitted row without one

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `receipts.jsonl` and the receipt rule
**Consumes:** the state-directory refusal (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

adr-verify appends a receipt for every Verification and Mutation Log row it writes, and adr-lint refuses a row the committed file does not hold and no receipt names (ADR-117, Decision 2).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/log-receipts.test.mjs` | add | the task's test, with a planted twin that must fail |
| `plugin/lib/record.py` | edit | `state_dir`, the hooks' state directory, compared with `stateDir` in the test; `write_receipts` and `receipt_digests` |
| `plugin/bin/adr-verify` | edit | `append_entry`, the one writer of both logs, leaves the receipt, so a run, a mutant, a sign-off, a hand-reported mutant and a relock all do |
| `plugin/bin/adr-lint` | edit | `check_receipts` over every task's two logs, beside the digest-less rule, which keeps its own rows |
| `tests/mutations/plugin/bin/*.json`, `tests/mutations/plugin/lib/record.py.json` | edit | catalogue entries |

## Ordered Steps

1. [S1] Write the failing test, with the twins that must pass. Record the red run.
2. [S2] Write the receipt in every writer path (run, mutant, human sign-off, human mutant, relock), and the rule in adr-lint.
3. [S3] Record a killed mutant per decision point, with catalogue entries for Node and Python sources; Go mutants through adr-verify with a fence that builds `qh`. [proof: mutation]

## Acceptance

```bash
node --test tests/log-receipts.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a hand-typed uncommitted log row is refused, and every row adr-verify writes carries a receipt` | `tests/log-receipts.test.mjs` | each writer path leaving its receipt; a typed row refused; a committed row passing with no receipt; a repository with no state directory accusing nothing | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the change |
| 2 — something selects it | the hook, gate or reader that calls it, and the mutant that deletes the call |
| 3 — the caller can discover it | the refusal's or the finding's text |
| 4 — it is used | every session and every gate run |

## Mutation Log
- 2026-10-19 · 6ee72826* · mutant killed · exit 1 · `plugin/lib/record.py` · a written row leaves a receipt · acceptance-sha256:c43f13983836faed43e7bea50a2bb6479769feec7f7595a21c02900c82b11850
- 2026-10-19 · 6ee72826* · mutant killed · exit 1 · `plugin/bin/adr-verify` · adr-verify asks for the receipt · acceptance-sha256:c43f13983836faed43e7bea50a2bb6479769feec7f7595a21c02900c82b11850
- 2026-10-19 · 6ee72826* · mutant killed · exit 1 · `plugin/bin/adr-lint` · an unreceipted row is refused · acceptance-sha256:c43f13983836faed43e7bea50a2bb6479769feec7f7595a21c02900c82b11850
- 2026-10-19 · 6ee72826* · mutant killed · exit 1 · `plugin/bin/adr-lint` · adr-lint runs the receipt rule · acceptance-sha256:c43f13983836faed43e7bea50a2bb6479769feec7f7595a21c02900c82b11850
- 2026-10-19 · 6ee72826* · mutant killed · exit 1 · `plugin/lib/record.py` · a probe under a state root reads the repository receipts · acceptance-sha256:c43f13983836faed43e7bea50a2bb6479769feec7f7595a21c02900c82b11850
- 2026-10-19 · 6ee72826* · mutant killed · exit 1 · `plugin/lib/record.py` · a deleted receipts file is no receipts, not could-not-look · acceptance-sha256:c43f13983836faed43e7bea50a2bb6479769feec7f7595a21c02900c82b11850
- 2026-10-19 · 6ee72826* · mutant killed · exit 1 · `plugin/bin/adr-lint` · a Mutation Log row is held to the rule · acceptance-sha256:c43f13983836faed43e7bea50a2bb6479769feec7f7595a21c02900c82b11850

## Invariants

- Gates advise and the sanctioned refusals are the only refusals (CLAUDE.md §3); this task adds only what ADR-117 sanctions.
- Node and the Go core say the same thing at each commit.

## Risks

- A writer path missed leaves its own rows refused. Every row goes through `append_entry`, which writes the receipt; the test drives a run, a recorded mutant and a hand-reported mutant through it, and a sign-off and a relock reach the same call.
- A corpus upgrading from 3.8.47 or earlier with uncommitted rows adr-verify wrote before receipts existed sees them refused until it re-runs adr-verify or commits them. No date floor spares them, since a row's date is typed like the rest of it (ADR-088); the committed file is the line, as it is for a digest-less row.
- `rm` or `mv` of `receipts.jsonl` is not a write the T1 guard reads. Removing it makes every uncommitted row refused, which fails closed, so it is not a door that opens; T3 names it in `scripts/side-doors.json`.

## Stop Condition

Stop if a writer path cannot reach the task's state directory.

## Out of Scope

- A program that writes a ledger itself (permanent: boundary: a hook sees tool calls and command text, not what a program does)

## Verification Log
- 2026-10-19 · 6ee72826* · exit 1 · `node --test tests/log-receipts.test.mjs` · acceptance-sha256:c43f13983836faed43e7bea50a2bb6479769feec7f7595a21c02900c82b11850 · ms:1191 · test-lock-sha256:cfaee68a556e56f92850f26e797c7b1affdf1130200f45ba9897e3f5085754f1 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvbG9nLXJlY2VpcHRzLnRlc3QubWpzCWEgaGFuZC10eXBlZCB1bmNvbW1pdHRlZCBsb2cgcm93IGlzIHJlZnVzZWQsIGFuZCBldmVyeSByb3cgYWRyLXZlcmlmeSB3cml0ZXMgY2FycmllcyBhIHJlY2VpcHQJMTk3NzYzMzAzMzAyYTY0MDA2YjE4MTk3NDA2NTBkNThjMzBiMDdjMmFiNTI1MDZhNTk3N2NhYTNhODhmY2U1Mg
  ```
  --- last 10 line(s) of stdout (of 33 after folding 35 raw)
        at Test.run (node:internal/test_runner/test:1402:25)
        at Test.start (node:internal/test_runner/test:1262:17)
        at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: 0,
      expected: 1,
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-10-19 · 6ee72826* · exit 0 · `node --test tests/log-receipts.test.mjs` · acceptance-sha256:c43f13983836faed43e7bea50a2bb6479769feec7f7595a21c02900c82b11850 · ms:2486
- 2026-10-19 · 6ee72826* · exit 0 · `node --test tests/log-receipts.test.mjs` · acceptance-sha256:c43f13983836faed43e7bea50a2bb6479769feec7f7595a21c02900c82b11850 · ms:2403
- 2026-10-19 · 6ee72826* · exit 0 · `node --test tests/log-receipts.test.mjs` · acceptance-sha256:c43f13983836faed43e7bea50a2bb6479769feec7f7595a21c02900c82b11850 · ms:2475
- 2026-10-19 · 6ee72826* · exit 0 · `node --test tests/log-receipts.test.mjs` · acceptance-sha256:c43f13983836faed43e7bea50a2bb6479769feec7f7595a21c02900c82b11850 · ms:2421
- 2026-10-19 · 6ee72826* · exit 0 · `node --test tests/log-receipts.test.mjs` · acceptance-sha256:c43f13983836faed43e7bea50a2bb6479769feec7f7595a21c02900c82b11850 · ms:2457
- 2026-10-19 · 6ee72826* · exit 0 · `node --test tests/log-receipts.test.mjs` · acceptance-sha256:c43f13983836faed43e7bea50a2bb6479769feec7f7595a21c02900c82b11850 · ms:2468
- 2026-10-19 · 6ee72826* · exit 0 · `node --test tests/log-receipts.test.mjs` · acceptance-sha256:c43f13983836faed43e7bea50a2bb6479769feec7f7595a21c02900c82b11850 · ms:2456
- 2026-10-19 · 6ee72826* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:c43f13983836faed43e7bea50a2bb6479769feec7f7595a21c02900c82b11850 · ms:0 · test-lock-sha256:615d0a2a84aa156eb2319446469612ed4bf96cde74be335518f7697b09da8b5e · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvbG9nLXJlY2VpcHRzLnRlc3QubWpzCWEgaGFuZC10eXBlZCB1bmNvbW1pdHRlZCBsb2cgcm93IGlzIHJlZnVzZWQsIGFuZCBldmVyeSByb3cgYWRyLXZlcmlmeSB3cml0ZXMgY2FycmllcyBhIHJlY2VpcHQJNWQ0MTdmNGU2ZGE4NGZkYmRhMzQ0MTcxZGFmNmFmYzg0NGUzYzZiMGNmYmZjNDJiZjhmNTFhYTdiMWU5MThkMg · test-lock-kind:replace
