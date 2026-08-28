# Task ADR-008-T2: move the plugin under it, and assert what ships

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** L (cross-boundary)
**Owner:** zy
**Produces:** none
**Consumes:** the verified answer to where `${CLAUDE_PLUGIN_ROOT}` points (T1)
**Data dependency:** hermetic

## Goal

Move the shipped surface under one directory, point `source` at it, and add the check that keeps the
boundary — derived from the manifest, so the tree and the manifest cannot disagree.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `.claude-plugin/marketplace.json` | edit | `source` is the single place that decides what is published |
| `bin/`, `scripts/`, `skills/`, `templates/`, `workflows/`, `hooks/` | move | the shipped surface |
| `scripts/selftest.sh` | edit | its paths gain the prefix, and it is what a developer and CI both run |
| `.github/workflows/selftest.yml` | edit | five path references |
| `tests/package.test.mjs` | edit | the shipped-set assertion, read from the manifest rather than a list |

## Ordered Steps

1. Confirm the failing test first: assert that every file under the plugin directory named by `marketplace.json`'s `source` is exactly the shipped set, and that `tests/`, `docs/` and `evals/results` are NOT under it. Red before the move, because `source` is `"."` and everything is under it.
2. Move the shipped surface with `git mv`, one directory per commit, so a bisect can name which move broke what.
3. Point `source` at the new directory in the same commit as the last move, so no commit exists in which the manifest and the tree disagree.
4. Re-prefix the paths in `scripts/selftest.sh` and the CI workflow, and run both.
5. Install the moved plugin from the local marketplace and confirm a skill resolves a `${CLAUDE_PLUGIN_ROOT}` path at runtime — the checkout cannot prove this, which is the same gap T1 exists for.

## Acceptance

```bash
bash scripts/selftest.sh
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `what ships is the plugin and nothing else` | `tests/package.test.mjs` | the file set under `marketplace.json`'s `source` equals the shipped surface; `tests/`, `docs/` and eval results are outside it | — |
| `the plugin contains the complete reusable decision lifecycle` | `tests/package.test.mjs` | unchanged in substance — every skill, gate, template and workflow is still present after the move | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the tests above |
| 2 — something selects it | `scripts/selftest.sh` and CI; the shipped-set check reads the manifest, so it fails when the two drift |
| 3 — the caller can discover it | a contributor adding a file learns from the failing check which side of the boundary it belongs on |
| 4 — it is used | to be recorded at execution: the installed cache size before and after, measured on a real install |

## Class Sweep

**Class:** every path that assumes the plugin root and the repository root are the same directory.

```bash
grep -rn "resolve(testDir, '\.\.')\|join(root, 'bin')\|join(root, 'scripts')" tests/ scripts/ | head -20
```

To be run and recorded at execution. Known at authoring: ten test files reach for `bin/` or
`scripts/` from a root computed as the checkout root, five CI references, and `selftest.sh`. The
sweep is how a path missed by the move is found before a user finds it, since a test computing its
own root will keep passing from a checkout whatever the manifest says.

## Mutation Log

<!-- tool-written by adr-verify --mutant; empty at authoring -->

## Invariants

- No commit exists in which `source` and the tree disagree.
- The shipped-set check is derived from the manifest, never from a hardcoded list.
- `tests/`, `docs/` and `evals/results/` are outside the shipped set; `evals/` case definitions stay inside, because `plugin.json` declares them.
- Every skill and gate present before the move is present after it.

## Risks

- A test computing its own root keeps passing from the checkout while the shipped plugin is broken. Mitigated by step 5, an install from the local marketplace, and by T1 having settled the root question first.
- One large mechanical diff is hard to review. Mitigated by one directory per commit.

## Stop Condition

Stop if a `${CLAUDE_PLUGIN_ROOT}` path fails to resolve from a real install after the move — that is
T1's assumption failing late, and the record is Withdrawn rather than patched around.

## Out of Scope

- Reducing `tests/` or `docs/`. (permanent: the problem is that they ship, not that they exist.)
- Rewriting published history. (deferred: docs/BACKLOG.md §42)

## Verification Log
<!-- tool-written by adr-verify; empty at authoring -->
