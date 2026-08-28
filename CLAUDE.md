# Working in this repository

This is the source of `quality-harness`, a Claude Code plugin. It is also the thing the plugin is
about: a development lifecycle whose claims are backed by executable evidence rather than by prose.
So the bar here is higher than the code alone would justify — a gate that cannot fail, or a record
that claims more than happened, is not a bug in this project, it is the defect this project exists
to demonstrate the absence of.

Everything below was paid for by a real debug cycle. Where a rule names a date, that is when it bit.

---

## 1. The repository is not the plugin

`plugin/` is the product. `.claude-plugin/marketplace.json` declares `"source": "./plugin"`, so a
user downloads that directory and nothing else — 663 K rather than the repository's 1,619 K
(measured 2026-08-28). Everything above `plugin/` is the work that produces it and never ships.

| Stays at the repository root | Lives under `plugin/` |
|---|---|
| `tests/`, `docs/`, `.github/`, `README.md`, `LICENSE` | `plugin/bin/`, `plugin/skills/`, `plugin/templates/`, `plugin/workflows/`, `plugin/hooks/`, `plugin/evals/` |
| `.claude-plugin/marketplace.json` | `plugin/.claude-plugin/plugin.json` |
| `scripts/selftest.sh`, `scripts/coverage.sh`, `scripts/mutate.mjs` | the other twelve, under `plugin/scripts/` |

Those three scripts stay because they read `tests/`, which does not ship. The twelve that moved
resolve their own root as `dirname(dirname(import.meta.url))` and are correct wherever they sit.

**There are now two roots and they are different directories.** In the tests, `repoRoot` is the
repository and `root` is the plugin. Getting one wrong produces a check that measures the wrong tree
and stays green from a checkout, which is the whole risk class ADR-008 named. `tests/package.test.mjs::what
ships is the plugin and nothing else` fails if the manifest and the tree disagree, in either
direction.

**When files move, four things move with them and every one fails silently:**

1. `.gitignore` patterns (a rule that stops matching does not warn — this repository published a
   personal home path for two days that way).
2. `.gitattributes` (`plugin/bin/* text eol=lf` is what makes the Windows job see LF gates).
3. `tests/mutations.json` `file:` paths.
4. **Every `Governs:` header in `docs/adr/`.** On 2026-08-28 the move un-governed the entire corpus:
   seven records named paths that no longer existed, `adr-context` answered "none governs", and
   `adr-lint` passed throughout because `Governs:` is checked for shape and never against the tree.
   BACKLOG §45 carries the gate that would have caught it.

---

## 2. Run the checks the way they are meant to be run

```bash
bash scripts/selftest.sh          # the repository-owned gate. 271 tests. Exit 0 or it did not pass.
bash scripts/coverage.sh          # JS + Python floors; --report to read the numbers without enforcing
node scripts/mutate.mjs           # the full campaign, ~37 min. --case '<substring>' for one.
python3 plugin/bin/adr-lint <adr> # a record's own gate
```

**Never pipe the gate.** `bash scripts/selftest.sh | tail` and `... || true` both hide the exit
code, and a check whose result nothing reads is decoration.

**Name the working-tree path for a gate, never the bare name.** `adr-lint` on `PATH` is a forwarder
that resolves the newest *installed* plugin — in this repository that is the last RELEASE, not your
edit. It produced a false PASS three times on 2026-08-28, once nearly into a recorded Verification
Log. Write `python3 plugin/bin/adr-lint`, `node plugin/scripts/lifecycle.mjs`.

**Never commit while a gate is red, and make sure you would notice.** Do not chain a commit after a
test in one command; a `for` loop's exit status is its last iteration's `echo`, so a printed FAIL
sails into a commit. This has happened here more than once. Run the gate, read it, then commit.

**Write commit messages with `git commit -F -` and a quoted heredoc**, never `-m "..."`. A backtick
in a double-quoted message is command substitution: on 2026-08-28 a shell silently deleted the phrase
`def enforcement_pointers(` from a commit message explaining a defect, and the commit still
succeeded. Backticks are how this project writes about code, so this is not a rare case.

---

## 3. Gates instruct; they never block

A gate here advises and never prevents a user's or a skill's attempt. In `plugin/bin/adr-lint`,
`errors.advise(...)` is advisory and `errors.append(...)` is blocking — moving something between
them is a real behavioural change, not a formatting choice.

The reason is not politeness. A blocked agent produces a user who cannot tell what to do next, which
is worse than not having the plugin at all. Say what is wrong and let the work proceed.

Corollary: **a gate must never report an observation it did not make.** A filter that matched
nothing is "I could not look", not "the thing is absent"; a subprocess that failed to start is not a
failing check; a parse failure is not a content finding. Three instances of this shipped in one day
(ADR-005). If a check cannot determine something, it says so — `UNRUN`, `PARTIAL`, `UNPROVEN` — and
never borrows the vocabulary of a verdict.

---

## 4. Evidence is tool-written or it is not evidence

`## Verification Log` and `## Mutation Log` in a task file are written by `adr-verify`, never by
hand. It runs the Acceptance fence itself, appends the date, git sha, exit code, displayed command
and a SHA-256 of the whole fence, and exits with the command's code. `adr-lint` rejects any entry
off-grammar and refuses a `done` row without a matching exit-0 entry.

```bash
python3 plugin/bin/adr-verify <task.md>
python3 plugin/bin/adr-verify <task.md> --mutant <file> --from <text> --to <text> --why <what this kills>
```

- A `done` row on a **Proposed** record is refused, correctly: it claims an unaccepted decision was
  executed. Leave the row `pending` with the reason and let the evidence stand.
- Changing an Acceptance fence invalidates every entry taken under the old one. That refusal is
  correct. Re-run on a clean tree; never edit a log.
- `adr-verify` dirties the tree by writing its own entry, so verifying several tasks in one pass
  marks all but the first dirty.

**A GREEN mutation is a finding about the test, never a reason to pick an easier mutant.** On
2026-08-28 a mutation on a containment guard came back GREEN because the assertion went through a
caller where a *second* guard caught the same input — the test was proving something other than what
it named. Assert the mechanism, not a downstream effect something else also covers.

**Coverage cannot see a vacuous assertion.** `assert.deepEqual(uncovered(...), [])` against a
subject mutated to return `[]` passes at 100% line and branch coverage. Every check that returns a
"clean" answer must be shown capable of returning a dirty one, in the same test.

---

## 5. Audit the class, not the instance

A fix that lands is one member of a set. Before recording anything done:

1. Name the class — the property that made this wrong, stated so it can be searched for.
2. Enumerate the members **with a command**, not from memory.
3. Put the command and what it returned into the record. A sweep that found nothing is worth
   recording; a sweep nobody ran must not read like one.

Siblings you leave are new tasks, named in the record.

---

## 6. Nothing personal reaches GitHub

This is a public repository and it publishes its own corpus.

- `tests/package.test.mjs::nothing tracked in this repository names a personal filesystem path`
  reads everything `git ls-files` returns and must stay green.
- **Never write an absolute home path** into a commit message, an ADR, a backlog entry, a comment or
  a test fixture. Describe it instead, or assemble it at runtime the way the fixtures do
  (`"/".join(("", "home", "alice"))`). BACKLOG §42 tripped on exactly this, and so did a fixture
  written the same day to test the redaction.
- `adr-verify` redacts this machine's home from anything it writes into a task file — both separator
  spellings, case-insensitively where the filesystem is. Do not rely on it as the only line.
- `plugin/evals/results/` is gitignored and stays that way. Do not commit eval results, transcripts,
  or anything derived from another repository's corpus.
- `git status --short` before every push, and read it.

---

## 7. Windows is a first-class target and you cannot test it here

The `windows` CI job is blocking. Three classes have bitten:

- **Path spelling.** `Path.home()` returns `C:\Users\Name` while a Node stack trace in the same
  output prints forward slashes. Any code comparing or rewriting paths must handle both separators,
  and case-insensitively on Windows and macOS. A guard that splits on `/` alone is blind to
  `..\dir\file` — which is how a traversal check passed while doing nothing.
- **Spawning.** The gates are `#!/usr/bin/env python3` scripts; Windows cannot exec them, and a
  direct spawn returns status `null`. Spawn through the interpreter.
- **Testability.** A rule you cannot exercise off Windows is a rule with no test. Make the platform
  and the home directory injectable parameters (`redact_home(block, home=..., platform=...)`,
  `resolve_bash(platform=...)`) so the Windows branch is reachable from any machine.

---

## 8. Tests must not touch the repository they are testing

A test that spawns `git` in a directory it did not itself create is one typo away from committing to
this repository. On 2026-08-28 a blanket rename bound two `git -C <temp repo>` helpers to the real
repository root; the suite created two commits and a branch on `main`. Give the temp-directory
variable and the repository-root constant clearly different names, and never let a rename cross that
line unexamined.

---

## 9. Working with the ADR corpus

`docs/adr/` is the live corpus and its records are executable, not decorative.

```bash
node plugin/scripts/work-next.mjs             # which lifecycle stage is waiting, and why
node plugin/scripts/adr-state.mjs             # what governs what, contested areas, dangling supersessions
node plugin/scripts/adr-context.mjs <path>... # which records govern these files — and which were killed
python3 plugin/bin/adr-next <adr> --all       # readiness, computed from the task files
python3 plugin/bin/adr-debt docs/adr          # deferred items and open follow-ups
```

- A record is executed only when its `Status:` is `Accepted`. Proposed, Draft, withdrawn and
  archived records are history or plans, never work orders.
- A record's `<record>/tasks/README.md` is a **derived index**. Where it disagrees with the task files, the task files
  win.
- `docs/BACKLOG.md` is where a sibling left for later goes, with the evidence that found it.

---

## 10. Reviews

`/quality-harness:codex-review` runs a different-lineage read-only review. Two operational notes,
both learned the hard way on 2026-08-28:

- **Redirect stdin.** `codex exec` blocks on an open stdin and hangs indefinitely with no output —
  it printed `Reading additional input from stdin...` and sat at 0% CPU for 1h40m. Always
  `< /dev/null`, and wrap it in a hard kill.
- **Scope it to the code that changed.** A diff with 86 renames in it is not reviewable; name the
  eight files whose semantics changed and ask numbered questions.

Reconcile every finding against source. Neither accept nor dismiss one by authority — but note that
on this repository the last three Codex passes found real defects, and every one of them was in code
written the same day to fix the same class.

---

## 11. Releasing

1. `bash scripts/selftest.sh` green after the last edit.
2. Bump `version` in `plugin/.claude-plugin/plugin.json`.
3. Push, wait for **all six** CI jobs (ubuntu, macos, windows, mutations, plugin validate, coverage
   floor). CI is the only place the full mutation campaign and Windows actually run.
4. `gh release create vX.Y.Z --latest` — `--latest` is not the default and has been forgotten.
