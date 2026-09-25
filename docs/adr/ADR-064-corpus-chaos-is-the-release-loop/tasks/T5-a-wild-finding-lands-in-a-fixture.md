# Task ADR-064-T5: A wild finding lands in a fixture

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one script, three docs)
**Owner:** unassigned
**Produces:** `scripts/chaos-fixture-sweep.mjs`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `an outside finding with no fixture is named`, `a section that names a fixture or a waiver is not`, `history before the cutoff is not swept`

## Goal

The rule is written down once, and a sweep checks it.
- **The rule.** `plugin/skills/corpus-chaos/SKILL.md:76-78` already says a confirmed finding changes the reader and a field of `expected.json`. That sentence gains "in a fixture corpus under `tests/fixtures/corpora/`, or a `(fixture-waived: <reason>)` in its BACKLOG section". `docs/corpus-reports/README.md` points at it rather than restating it.
- **The sweep.** `scripts/chaos-fixture-sweep.mjs` reads `docs/BACKLOG.md` with the section reader `backlog-record-sweep.mjs` exports. It lists each section numbered above 282 whose heading matches `OUTSIDE_RUN`, the named regex `/\breported (?:from|by)\b|\boutside runs?\b|\bcorpus-chaos\b/i`, and whose body names neither a `tests/fixtures/corpora/` path nor a waiver.
- **The cutoff.** Sections up to 282 predate the rule, and CLAUDE.md §10 forbids rewriting them to satisfy it, so they are not swept.
- **Advisory.** It prints and exits 0, like `scripts/backlog-record-sweep.mjs`, and it joins CLAUDE.md §2's list of advisory sweeps.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/chaos-fixture-sweep.mjs` | add | the sweep |
| `plugin/skills/corpus-chaos/SKILL.md` | edit | extend the existing rule sentence |
| `docs/corpus-reports/README.md` | edit | point at the rule |
| `CLAUDE.md` | edit | add the sweep to §2's command list |
| `tests/chaos-fixture-sweep.test.mjs` | add | the tests below |
| `tests/mutations.json` | edit | mutants |
| `docs/adr/ADR-064-corpus-chaos-is-the-release-loop.md` | edit | add `scripts/chaos-fixture-sweep.mjs` to `Governs:` once it exists |

## Ordered Steps

1. [S1] Write the test(s) below and see each fail on an assertion (TDD red).
2. [S2] Write the sweep with `OUTSIDE_RUN` and the cutoff as named constants; extend the skill sentence; point the README at it; add the command to CLAUDE.md §2.
3. [S3] Run the fence green, and record mutants with `adr-verify --mutant`: treat every section as naming a fixture; drop the cutoff. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/chaos-fixture-sweep.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (the chaos fixture sweep names an outside finding with no fixture|the chaos fixture sweep leaves history and ordinary sections alone)' | grep -qx 2
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the chaos fixture sweep names an outside finding with no fixture` | `tests/chaos-fixture-sweep.test.mjs` | over a scratch BACKLOG with three outside-run sections after the cutoff — one naming a fixture, one waived, one bare — only the bare one is listed, and the sweep exits 0 | none | S1, S2 |
| `the chaos fixture sweep leaves history and ordinary sections alone` | `tests/chaos-fixture-sweep.test.mjs` | a bare outside-run section numbered at or below the cutoff is not listed; a section after it whose heading says "reported" without "from"/"by" is not listed (the regex's must-not-match case) | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `scripts/chaos-fixture-sweep.mjs` |
| 2 — something selects it | CLAUDE.md §2's list of advisory sweeps |
| 3 — the caller can discover it | the skill and the reports README name it |
| 4 — it is used | the batch's closing step runs it |

## Mutation Log
- 2026-09-25 · c4acfae* · mutant killed · exit 1 · `scripts/chaos-fixture-sweep.mjs` · every section reads as naming a fixture, so nothing is listed · acceptance-sha256:c775a140275fa67a6ca292b900554bb44092dfb3192f3f7efcc6c30e1320a4d2 · covers:an outside finding with no fixture is named
- 2026-09-25 · c4acfae* · mutant killed · exit 1 · `scripts/chaos-fixture-sweep.mjs` · a waived section is listed · acceptance-sha256:c775a140275fa67a6ca292b900554bb44092dfb3192f3f7efcc6c30e1320a4d2 · covers:a section that names a fixture or a waiver is not
- 2026-09-25 · c4acfae* · mutant killed · exit 1 · `scripts/chaos-fixture-sweep.mjs` · history before the cutoff is swept · acceptance-sha256:c775a140275fa67a6ca292b900554bb44092dfb3192f3f7efcc6c30e1320a4d2 · covers:history before the cutoff is not swept

## Invariants

- The sweep never fails a gate (CLAUDE.md §3).
- No BACKLOG section is edited to satisfy it.

## Risks

- `OUTSIDE_RUN` is a classifier over prose (CLAUDE.md §16). A heading it does not match is not swept; the sweep is a place to look, not a census, and says so in its output.

## Stop Condition

Stop and ask if the only reliable signal for an outside finding turns out to be prose the regex cannot read.

## Out of Scope

- Making the sweep blocking (permanent: boundary: CLAUDE.md §3 — a new refusal needs its own accepted record)
- Sweeping sections up to §282 (permanent: boundary: CLAUDE.md §10 — the backlog is history and is not rewritten to meet a later rule)

## Verification Log
- 2026-09-25 · c4acfae* · exit 1 · `set -o pipefail …` · acceptance-sha256:c775a140275fa67a6ca292b900554bb44092dfb3192f3f7efcc6c30e1320a4d2 · ms:239 · test-lock-sha256:27b2fb9c75b21d7e471bf4f7c7d15ccec5abdab3e3e93d801252bbab359a159f · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2NoYW9zLWZpeHR1cmUtc3dlZXAudGVzdC5tanMJdGhlIGNoYW9zIGZpeHR1cmUgc3dlZXAgbGVhdmVzIGhpc3RvcnkgYW5kIG9yZGluYXJ5IHNlY3Rpb25zIGFsb25lCWMzOTI0NTJjZjFmNGUxZjllNDFkZDNlNmJjMGQxYzM2OTIwZWJkODk2ZTY2MTZkNzhjZThiYzdlZGJhNDg4NzgKYm9keQl0ZXN0cy9jaGFvcy1maXh0dXJlLXN3ZWVwLnRlc3QubWpzCXRoZSBjaGFvcyBmaXh0dXJlIHN3ZWVwIG5hbWVzIGFuIG91dHNpZGUgZmluZGluZyB3aXRoIG5vIGZpeHR1cmUJMzBlMTViNjRiYTNkNWZhZmJhNmNlNGExZTFmNDRhYzMxNTViN2U4NzAxZTAzZjVlOTM4MWE3NmYzMDJjNWFjYQ
  ```
  --- last 10 line(s) of stderr (of 110 after folding 112 raw)
    ...
  1..2
  # tests 2
  # suites 0
  # pass 0
  # fail 2
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 140.286291
  ```
- 2026-09-25 · c4acfae* · exit 0 · `set -o pipefail …` · acceptance-sha256:c775a140275fa67a6ca292b900554bb44092dfb3192f3f7efcc6c30e1320a4d2 · ms:149
- 2026-09-25 · c4acfae* · exit 0 · `set -o pipefail …` · acceptance-sha256:c775a140275fa67a6ca292b900554bb44092dfb3192f3f7efcc6c30e1320a4d2 · ms:148
- 2026-09-25 · c4acfae* · exit 0 · `set -o pipefail …` · acceptance-sha256:c775a140275fa67a6ca292b900554bb44092dfb3192f3f7efcc6c30e1320a4d2 · ms:145
