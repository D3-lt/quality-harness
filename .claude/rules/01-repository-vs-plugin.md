---
paths:
  - "plugin/**"
  - "scripts/**"
  - ".claude-plugin/**"
  - ".gitignore"
  - ".gitattributes"
  - "tests/mutations.json"
  - "tests/package.test.mjs"
---

# Why §1: the repository is not the plugin

The rule is in `CLAUDE.md` §1. This file is the evidence behind it.

`.claude-plugin/marketplace.json` declares `"source": "./plugin"`, so a user downloads that
directory and nothing else — a fraction of the repository (measured 2026-08-28).

| Stays at the repository root | Lives under `plugin/` |
|---|---|
| `tests/`, `docs/`, `.github/`, `README.md`, `LICENSE` | `plugin/bin/`, `plugin/skills/`, `plugin/templates/`, `plugin/workflows/`, `plugin/hooks/`, `plugin/evals/` |
| `.claude-plugin/marketplace.json` | `plugin/.claude-plugin/plugin.json` |
| `scripts/selftest.sh`, `scripts/coverage.sh`, `scripts/mutate.mjs` | everything else, under `plugin/scripts/` |

Those scripts stay because they read `tests/`, which does not ship. The ones that moved on
2026-08-28 resolve their own root as `dirname(dirname(import.meta.url))` and are correct wherever
they sit; so does everything added there since.

**Two roots, two names.** In the tests, `repoRoot` is the repository and `root` is the plugin.
Getting one wrong produces a check that measures the wrong tree and stays green from a checkout,
which is the whole risk class ADR-008 named. `tests/package.test.mjs::what ships is the plugin and
nothing else` fails if the manifest and the tree disagree, in either direction.

**What moves silently when files move — each of these fails without a warning:**

1. `.gitignore` patterns (a rule that stops matching does not warn — this repository published a
   personal home path that way, and nothing warned).
2. `.gitattributes` (`plugin/bin/* text eol=lf` is what makes the Windows job see LF gates).
3. `tests/mutations.json` `file:` paths.
4. **Every `Governs:` header in `docs/adr/`.** On 2026-08-28 the move un-governed the entire corpus:
   records named paths that no longer existed, `adr-context` answered "none governs", and
   `adr-lint` passed throughout because `Governs:` was checked for shape and never against the tree.
   BACKLOG §45 is that gate, and it closed 2026-08-29 with ADR-011: `adr-lint` and `adr-state`
   now resolve every declared path against `git ls-files` and advise when one matches nothing.

## Why the instruction files state no counts

The `CLAUDE.md` §1 table row and the sentence under it once carried the same figure for the same set
of scripts. One was written about a past move and one described the tree as it stands; the
directory grew, and only the second went wrong. The rule became "past tense and dated, or not at
all", which held for most of a day, and was still too weak: a dated count invites the next writer to
add an undated one beside it, has to be re-judged on every nearby edit, and hands a reader a number
to act on when the thing that can answer is one command away. The selftest line in §2 carried a
test count that was wrong by hundreds before anyone noticed; issue #9's adopter found the same rot in
their own instruction file. A number written into an instruction file is a cached answer with no
invalidation, in a file nothing checks, read by every session.
