# Task ADR-118-T2: The ruleset is applied, a scripted unchecked push is refused, and a landing goes through

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** the live ruleset on `main`
**Consumes:** `land.mjs` and its `--dry-run`; `.github/rulesets/main.json` (T1)
**Data dependency:** needs the live forge (GitHub, this repository, admin rights to apply a ruleset)
**Proof map:** v1

## Goal

`main` carries the committed ruleset with no bypass. A scripted `--no-verify` push of an unchecked sha is refused, and
this task's own evidence commit lands through `land.mjs` (ADR-118, Decisions 1 and 5).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/land.mjs` | edit | `--dry-run` reads back the applied ruleset and exits 0 only when its enforcement, target, conditions, rules with integration ids, and empty bypass list equal the committed file, and every required context is declared |
| `tests/land.test.mjs` | edit | the dry-run's three answers, with an injected gh |
| `docs/adr/ADR-117-the-evidence-is-written-only-by-its-tools.md` | edit | a Follow-up naming where the door now closes; the record is not rewritten (CLAUDE.md §10) |

## Ordered Steps

1. [S1] Write the failing dry-run test. Equal: 0. Unprotected: 1. Each of these is 1 too: a context unlike the file's, an integration id unlike the file's, a bypass actor present, enforcement not `active`. Record the red run.
2. [S2] Add `--dry-run`. Apply the ruleset: `gh api -X POST repos/{owner}/{repo}/rulesets --input .github/rulesets/main.json`, and record its id in the ADR's Follow-ups.
3. [S3] Probe: fetch, and capture `origin/main`'s sha. Build an empty child of it with `git commit-tree origin/main^{tree} -p origin/main` (no local ref moves). Push it with `git push --no-verify origin <probe>:main`, require the rejection to name a required status check (not non-fast-forward), and confirm the forge's `main` is still the captured sha. If the probe is accepted, stop: delete the ruleset, force `main` back to the captured sha, and roll back. [proof: human: the refusal text and both `main` reads, quoted in the sign-off]
4. [S4] Land this task's evidence commit with `node scripts/land.mjs`, and confirm `origin/main` equals the sha CI ran. [proof: human: the land output and `git rev-parse origin/main`, quoted in the sign-off]
5. [S5] Record a killed mutant on the dry-run's comparison. [proof: mutation]

## Acceptance

```bash
node --test tests/land.test.mjs && node scripts/land.mjs --dry-run
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `land --dry-run passes only when main carries exactly the committed ruleset` | `tests/land.test.mjs` | equal, unprotected, and unequal in contexts, integration ids, bypass actors or enforcement, from an injected gh | — | S1, S2 |
| `land --dry-run reads the ruleset for a sha already on main` | `tests/land.test.mjs` | the dry run on a synchronized main still fails unprotected or unread, and passes on the committed ruleset (Codex review of 477e8c1a) | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the live ruleset |
| 2 — something selects it | GitHub enforces it on every push to `main` |
| 3 — the caller can discover it | `release-evidence` and `land --dry-run` say it |
| 4 — it is used | every landing, observed in S4 |

## Mutation Log
- 2026-10-20 · 1011db21* · mutant killed · exit 1 · `scripts/land.mjs` · a dry run fails on any difference from the committed ruleset · acceptance-sha256:eeeddf51d09a91fe25ff29914ef3f1f288952eb445e0e0f1ceb51a8e70b54bdc

## Invariants

- No bypass actor is added. The probe in S3 moves no ref, local or remote; it leaves an entry in the forge's rule insights, which is audit residue, not state.

## Risks

- A wrong ruleset refuses every landing: Rollback deletes it by id.

## Stop Condition

Stop and roll back if the probe in S3 lands, or if S4 cannot fast-forward `main` after its checks passed.

## Out of Scope

- Protecting tags (permanent: boundary: tags are made by `gh release create` after release-evidence)

## Verification Log
- 2026-10-20 · c7cd8a01* · exit 1 · `node --test tests/land.test.mjs && node scripts/land.mjs --dry-run` · acceptance-sha256:eeeddf51d09a91fe25ff29914ef3f1f288952eb445e0e0f1ceb51a8e70b54bdc · ms:320 · test-lock-sha256:068a7640f0df135766354fb644fc2c3c7a0931d06b28514bd00746f5c0512406 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvbGFuZC50ZXN0Lm1qcwlsYW5kIC0tZHJ5LXJ1biBwYXNzZXMgb25seSB3aGVuIG1haW4gY2FycmllcyBleGFjdGx5IHRoZSBjb21taXR0ZWQgcnVsZXNldAk4NmJmNjM4YzVlMjI0NmYwMWRjZjhkMzgwYjkyNGYzZmE3NWYxZWMxNjY5NGI0NGM2ZWRlNThkOTM5ODQxOTIyCmJvZHkJdGVzdHMvbGFuZC50ZXN0Lm1qcwlsYW5kIHBpY2tzIHRoZSBuZXdlc3QgY2hlY2stcnVuIG9mIHRoZSByZXF1aXJlZCBhcHAgZm9yIGVhY2ggY29udGV4dCwgb3ZlciBldmVyeSBwYWdlCTI0MzQ0NTdlZDMxMmQ5ZTQxM2U2MGRjMWNmZDNhMjNiODEzYTE0Mjg5YjQ0Njc1MzBhYWVhYzc1NjA3ZjIwZjMKYm9keQl0ZXN0cy9sYW5kLnRlc3QubWpzCWxhbmQgcHVzaGVzIG1haW4gb25seSBhZnRlciBldmVyeSByZXF1aXJlZCBjaGVjayBwYXNzZWQgYXQgdGhlIHNoYSBvbiBsYW5kLzxzaGE-CWE2NWVlM2JhZTQ5ZDYyNTBiNjRjODVjNTM1MDhmNThjODY1MjFkNGVhOTVkYTVmYmE3ZTliNWQ5MDg5ZjRkZTIKYm9keQl0ZXN0cy9sYW5kLnRlc3QubWpzCWxhbmQgcHVzaGVzIG5vdGhpbmcgd2hlbiB0aGUgZm9yZ2UgY2Fubm90IGJlIHJlYWQgb3IgcmVxdWlyZXMgYSBjaGVjayBubyBqb2IgZGVjbGFyZXMJMGMzYzgxOTJmZTcxODE3OWIyNmQ0YWIxMDc3ZGUxNmFmOGZiODE2YjhjMTJmMzdmYmIyZjNhYzY2NTRiMzNjNgpib2R5CXRlc3RzL2xhbmQudGVzdC5tanMJbGFuZCByZWZ1c2VzIG9mZiBtYWluIG9yIHdoZW4gbWFpbiBtb3ZlZCwgYW5kIHJlcXVpcmVzIHRoZSBmb3JnZSdzIG1haW4gdG8gYmUgdGhlIHNoYSBhZnRlciB0aGUgcHVzaAllNzk3MTk0YjBiM2Y3ZDdlNGE4YzUwNzEyNWIyYzc3YjVhY2MzYjZlNzZlMTk1YjY4ZGI1NDNmNWJiYjFhZmE4CmJvZHkJdGVzdHMvbGFuZC50ZXN0Lm1qcwlsYW5kIHNheXMgYW4gdW5wcm90ZWN0ZWQgbWFpbiBhbmQgcHVzaGVzIGl0IGRpcmVjdGx5LCBhbmQgYSB3YWl0IHBhc3QgaXRzIGRlYWRsaW5lIGV4aXRzIDMJZmU5NjM3ZDI3ZDA0YzI5YWJlYzZlZjIwMTQ0MmY1NGZlYTU1MGY4MjBhYzQyNmQxN2Q3MzU3YTUxOTkzNDM2OApib2R5CXRlc3RzL2xhbmQudGVzdC5tanMJbWFpblByb3RlY3Rpb24gaGFuZHMgbGFuZCBlYWNoIHJlcXVpcmVkIGNvbnRleHQgd2l0aCB0aGUgYXBwIHRoZSBydWxlIGJpbmRzIGl0IHRvCWY1NzcwNDc4ZTliYWM5NWRjMTQ0MjRjMjg3MjlmMmRmNmUzNGUwZjQzN2ViMDQ4OWIzNzhkMDE5MTQzZTVhMjIKYm9keQl0ZXN0cy9sYW5kLnRlc3QubWpzCXRoZSBjb21taXR0ZWQgcnVsZXNldCByZXF1aXJlcyBvbmx5IGpvYnMgdGhlIHdvcmtmbG93IGRlY2xhcmVzCTY5ZmEyMmU1NWZkOTg3ZTljNDU4YTI1ZjdlYWRmMTg0N2Q0YjI4MjZkZjU2NDMzZDllNGY3YzVlYTE3YTk3YTg
  ```
  --- last 10 line(s) of stdout (of 39 after folding 39 raw)
        at Test.postRun (node:internal/test_runner/test:1542:19)
        at Test.run (node:internal/test_runner/test:1467:12)
        at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: 0,
      expected: 1,
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-10-20 · 1011db21 · exit 2 · `node --test tests/land.test.mjs && node scripts/land.mjs --dry-run` · acceptance-sha256:eeeddf51d09a91fe25ff29914ef3f1f288952eb445e0e0f1ceb51a8e70b54bdc · ms:399
  ```
  --- last 10 line(s) of stdout (of 18 after folding 18 raw)
  ✔ land --dry-run reads the ruleset for a sha already on main (0.114416ms)
  ℹ tests 9
  ℹ suites 0
  ℹ pass 9
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 114.161584
  land: HEAD is not the main branch at 1011db21fb7599e27f8971e79adde76029d3b441; check out main at the sha to land, then run again
  ```
- 2026-10-20 · human-observed · Claude observed, 2026-10-20 (S3): ruleset 25462988 applied; origin/main captured at 1011db21fb7599e27f8971e79adde76029d3b441; an empty child of it (15215b49b615f60640734bcc945bafda3b11fad9, built with commit-tree, no local ref moved) pushed with git push origin <probe>:refs/heads/main was rejected: 'GH013: Repository rule violations found for refs/heads/main. - 8 of 8 required status checks are expected.' (not non-fast-forward); git ls-remote origin refs/heads/main still 1011db21fb7599e27f8971e79adde76029d3b441 after. --no-verify was left out: this session's own publish guard refuses that flag before the forge sees it, and the probe's tree equals main's checked tree, so only the forge decided. · acceptance-sha256:eeeddf51d09a91fe25ff29914ef3f1f288952eb445e0e0f1ceb51a8e70b54bdc
- 2026-10-20 · 1011db21* · exit 0 · `node --test tests/land.test.mjs && node scripts/land.mjs --dry-run` · acceptance-sha256:eeeddf51d09a91fe25ff29914ef3f1f288952eb445e0e0f1ceb51a8e70b54bdc · ms:2721
