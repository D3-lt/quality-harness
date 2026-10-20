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
node scripts/land.mjs --dry-run
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `land --dry-run passes only when main carries exactly the committed ruleset` | `tests/land.test.mjs` | equal, unprotected, and unequal in contexts, integration ids, bypass actors or enforcement, from an injected gh | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the live ruleset |
| 2 — something selects it | GitHub enforces it on every push to `main` |
| 3 — the caller can discover it | `release-evidence` and `land --dry-run` say it |
| 4 — it is used | every landing, observed in S4 |

## Mutation Log

## Invariants

- No bypass actor is added. The probe in S3 moves no ref, local or remote; it leaves an entry in the forge's rule insights, which is audit residue, not state.

## Risks

- A wrong ruleset refuses every landing: Rollback deletes it by id.

## Stop Condition

Stop and roll back if the probe in S3 lands, or if S4 cannot fast-forward `main` after its checks passed.

## Out of Scope

- Protecting tags (permanent: boundary: tags are made by `gh release create` after release-evidence)

## Verification Log
