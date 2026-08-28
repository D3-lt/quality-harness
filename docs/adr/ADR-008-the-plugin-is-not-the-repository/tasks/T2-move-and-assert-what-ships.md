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
| 4 — it is used | recorded below: installed from a local marketplace into an isolated config, `bin/qh-root` run from the unpacked cache |

## Class Sweep

**Class:** every path that assumes the plugin root and the repository root are the same directory.

```bash
grep -rn "resolve(testDir, '\.\.')\|join(root, 'bin')\|join(root, 'scripts')" tests/ scripts/ | head -20
```

Run 2026-08-28. The authoring command only finds the test files, so three more were run beside it;
each is repeatable and each is reported with what it returned.

1. The command above — 15 hits, all of them the deliberate split: `repoRoot` for the repository,
   `join(root, 'bin')` where `root` is now the plugin. No hit is a path still assuming the two are
   one directory.
2. Every repository-root-relative mention of a moved directory in the scripts, the CI workflow and
   the dotfiles:

   ```
   grep -rnE "(^|[^a-zA-Z/._-])(bin|skills|templates|workflows|hooks|evals)/" \
     scripts/*.sh scripts/*.mjs .github/workflows/*.yml .gitignore .gitattributes \
     .claude-plugin/*.json | grep -vE "plugin/(bin|skills|templates|workflows|hooks|evals)/"
   ```

   6 hits, every one of them inside a comment describing the gates rather than resolving a path.
3. Catalogue entries still naming a moved file without the prefix — `none`. 225 of 237 entries
   gained it; `tests/*` and `scripts/mutate.mjs` correctly did not.
4. Every gate still has its Windows shim beside it after the move — 10 gates, 10 shims.

**Siblings left for later, named rather than noticed:** nothing from this sweep. The one thing the
sweep cannot see is a path inside a SKILL body, which resolves through `${CLAUDE_PLUGIN_ROOT}` and
is covered by the install probe below instead.

## Execution Notes

**The install probe (Ordered Step 5), 2026-08-28, Claude Code 2.1.250.** A checkout cannot answer
this, which is the same gap T1 exists for: the tests run from a tree where the paths work whatever
the manifest says. Installed from the local marketplace into a throwaway `CLAUDE_CONFIG_DIR` so the
session's own plugin configuration was never touched.

The unpacked cache root holds `.claude-plugin bin evals hooks scripts skills templates workflows`
— the contents of `plugin/`, with `tests`, `docs`, `.github`, `README.md` and `LICENSE` all absent.
`bin/qh-root` run with `CLAUDE_PLUGIN_ROOT` set to that root exits 0 and prints it. `hooks.json`
resolves `${CLAUDE_PLUGIN_ROOT}/scripts/lifecycle.mjs` and `run-shell-hook.mjs`, and both are
present and parse. T1's answer holds against this repository's own moved tree, not only against
another project's.

**Measured saving.** 663 K tracked under `plugin/` against 1619 K tracked in the repository: a user
receives 41% of what they did. The record predicted ~660 K of ~1,491 K; the denominator grew because
the corpus did.

**A finding the probe turned up, which is NOT this repository's problem to fix.** A marketplace
added from a LOCAL PATH copies the working tree, gitignored files included — the isolated install
carried 1,488 K of `evals/results` and 220 K of `evals/generated` that no published install can
contain, because the real marketplace is the GitHub repository and a clone has neither. Worth
knowing before anyone measures a download by installing from a path: that number is not the number
a user gets.

**Deviation from Ordered Step 2, recorded rather than done quietly.** One commit for the move, not
one per directory. `source` and the paths have to move together, so a per-directory sequence
guarantees commits in which the suite is red — and never committing while a gate is red is the
stronger rule here. Rename detection keeps the diff readable, which is what the bisect rationale
was really after.

**A defect this task introduced and caught.** The first pass renamed the tests' repository-root
constant with a blanket text replacement, which also rewrote `git -C <temp repo>` helpers inside two
lifecycle tests. The suite then ran `git add -A` and `git commit` against the REAL repository and
created two commits and a branch on `main`. Reset and deleted; the working tree was untouched. The
rule that follows: a test that spawns `git` in a directory it did not create is one typo away from
committing to the repository it is testing, and a blanket rename over a name as common as `repo` is
how that typo gets made.

## Mutation Log

<!-- tool-written by adr-verify --mutant; empty at authoring -->
- 2026-08-28 · 9c15ebe · mutant killed · exit 1 · `.claude-plugin/marketplace.json` · source back at the repository root: the boundary is gone and tests/ and docs/ ship again · acceptance-sha256:f7e251b503caefecba11221ad2cc2227706140573bea20d61d9987da7b605256

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
