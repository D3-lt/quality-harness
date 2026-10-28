# Task ADR-109-T2: adr-verify runs a landed plan's inverses, and breaks its invariants, as mutants

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (one arm beside --mutant-plan, reusing its parser and transaction)
**Owner:** unassigned
**Produces:** `adr-verify --inverse <plan>` and `adr-verify --break-invariants <plan>`
**Consumes:** the counts in Follow-ups (T1); `--mutant-plan`'s parser and restore transaction (ADR-107)
**Proof map:** v1

## Goal

For a plan that has landed, run each hunk's inverse as a mutant through the existing transaction, record each as killed or
survived in the Mutation Log, and restore the tree; and for each of the task's `## Invariants` that names a site the plan
touched, run the inverse of those sites together and report the invariant `unguarded` when the fence stays green, `unread`
when it names nothing the plan touched (ADR-109, Decisions 2, 3 and 4).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-verify` | edit | the `--inverse <plan>` arm: parse with `--mutant-plan`'s reader; refuse a plan that has not landed; per hunk, restore the original lines in the transaction, run the fence, classify, record, restore |
| `tests/inverse-plan.test.mjs` | add | the test below |
| `tests/mutations/plugin/bin/adr-verify.json` | edit | the catalogue mutants |
| `plugin/skills/adr-execute/SKILL.md` | edit | one paragraph beside `--mutant-plan` |

## Ordered Steps

1. [S1] Add the test below and record the red run.
2. [S2] Implement `--inverse`; a plan whose hunk body is not at its address is refused as not landed, before any fence runs. A plan carries only its new lines, so the original lines are read from git at `--before <ref>`, HEAD when it is not given (the owner, 2026-10-28): HEAD for a plan landed in the working tree, `<sha>^` for one landed in commit `<sha>`. A hunk whose lines at that ref are already its body has not landed there.
3. [S3] Implement `--break-invariants`: resolve each `## Invariants` bullet's backticked names through adr-lint's existing resolver to the plan's hunks; an invariant with no resolved site is `unread`; one with sites runs their inverses together and is `unguarded` on a green fence, `guarded` on a red one. Each verdict is one Mutation Log row naming the bullet.
4. [S4] Add the catalogue mutants (a survivor recorded as killed; a hunk left restored after exit; a not-landed plan run; an invariant with no resolved site reported unguarded) and record a killed mutant. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/inverse-plan.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - a landed plan's inverses are run one at a time, a survivor is named by its address, and the tree is restored")" = 1 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a landed plan's inverses are run one at a time, a survivor is named by its address, and the tree is restored` | `tests/inverse-plan.test.mjs` | through the CLI on a fixture: a two-hunk plan where the fence sees one hunk gives one killed row and one survived row naming the address, exit 1; every file is byte-identical after; a plan that has not landed is refused with nothing run or written; a plan whose every hunk is seen exits 0 | — | S1, S2, S3 |
| `a plan landed in a commit is read against the ref --before names, and one whose every hunk is seen exits 0` | `tests/inverse-plan.test.mjs` | `--before HEAD~1` reads a committed plan's original lines; against HEAD the same plan has not landed | — | S2 |
| `an invariant whose named sites reverse with the fence green is unguarded, one naming nothing the plan touched is unread` | `tests/inverse-plan.test.mjs` | `--break-invariants`: guarded, unguarded and unread on one fixture, one row per run invariant, the tree restored | — | S3 |
| `a hunk's place in today's file moves by the lines the hunks above it added or deleted` | `tests/inverse-plan.test.mjs` | a hunk that grew and a delete above a third hunk: each found where today's file holds it, the delete's inverse an insert | — | S2 |
| `a child that reaches no verdict is never one: a failed clean fence, a fence past its time, an emptied file` | `tests/inverse-plan.test.mjs` | a verdict only from the row a child printed with an agreeing exit, never from its exit alone; a file emptied by the plan is not run, and said why (the Codex review of f6d81a58) | — | S2 |
| `a deletion that never landed is refused, and deletions that met are put back as one hunk` | `tests/inverse-plan.test.mjs` | a deletion is landed only where its neighbours are what the plan leaves; two deletions at one insertion point are one restoring hunk (the Codex review of f6d81a58) | — | S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the arm |
| 2 — something selects it | `--inverse` on the command line |
| 3 — the caller can discover it | `--help` and the adr-execute skill |
| 4 — it is used | the test drives the CLI |

## Mutation Log
- 2026-10-28 · 2a0d6c10* · mutant killed · exit 1 · `plugin/bin/adr-verify` · a plan whose body is not at its address is refused before any fence runs; without the check the named test's not-landed plan is run · acceptance-sha256:a8e43b2958d8b37f3f26a134323710be0b74e8ac14068132b13fbacfcbf96dc7

## Invariants

- No third plan reader: the arm imports `--mutant-plan`'s parser.
- The source is never left mutated after exit (the transaction's `finally`, ADR-002).

## Risks

- None beyond ADR-109's.

## Stop Condition

Stop and ask if `--mutant-plan`'s transaction cannot hold several sequential mutations of one file in one run.

## Out of Scope

- Generated variants (permanent: boundary: ADR-109 alternative (a))

## Verification Log
- 2026-10-28 · 2a0d6c10* · exit 1 · `out=$(node --test --test-reporter=tap tests/inverse-plan.test.mjs 2>&1) \ …` · acceptance-sha256:a8e43b2958d8b37f3f26a134323710be0b74e8ac14068132b13fbacfcbf96dc7 · ms:1841 · test-lock-sha256:35c33b4603dc1509f1090fc0d344cc2356ed7bb6e5dde506caa3fd1412abb022 · test-lock-file:docs/adr/locks/35c33b4603dc1509f1090fc0d344cc2356ed7bb6e5dde506caa3fd1412abb022.lock
  ```
  ```
- 2026-10-28 · 2a0d6c10* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:a8e43b2958d8b37f3f26a134323710be0b74e8ac14068132b13fbacfcbf96dc7 · ms:0 · test-lock-sha256:4b83f053a53255330f5293f694d59bfb1721cc2e92793849eef14864f76ce735 · test-lock-file:docs/adr/locks/4b83f053a53255330f5293f694d59bfb1721cc2e92793849eef14864f76ce735.lock · test-lock-kind:replace
- 2026-10-28 · 2a0d6c10* · exit 0 · `out=$(node --test --test-reporter=tap tests/inverse-plan.test.mjs 2>&1) \ …` · acceptance-sha256:a8e43b2958d8b37f3f26a134323710be0b74e8ac14068132b13fbacfcbf96dc7 · ms:8703
- 2026-10-28 · f6d81a58* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:a8e43b2958d8b37f3f26a134323710be0b74e8ac14068132b13fbacfcbf96dc7 · ms:0 · test-lock-sha256:63f6aac445b2aae22abdc0f74873768c0bcf8a2f4fca115004194dd57b4d169c · test-lock-file:docs/adr/locks/63f6aac445b2aae22abdc0f74873768c0bcf8a2f4fca115004194dd57b4d169c.lock · test-lock-kind:replace
