# Task ADR-146-T1: A pin landing is recognised from git, and anything else runs the campaign

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** `scripts/landing-class.mjs`, `the skip output line`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the three pinned keys`, `the one changed path`, `the parent is main's tip`, `the event and ref check`, `a failed command runs the campaign`

## Goal

`scripts/landing-class.mjs` answers "skip" only for a push to `land/<sha>` whose one commit sits on main's tip and changes
nothing but the values of `version`, `url` and `sha256` in `.claude-plugin/marketplace.json`, and "run" for everything
else, including everything it could not read (ADR-146 Decisions 1 and 2).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/landing-class.mjs` | add | `pinOnly`, `landingClass` and the CLI the workflow runs |
| `tests/landing-class.test.mjs` | add | The tests below |
| `tests/mutations/scripts/landing-class.mjs.json` | add | One mutant per mechanism in `Rests-on` |

## Ordered Steps

1. [S1] Write the tests of the table below and confirm they are red (TDD red): the script does not exist.
2. [S2] Add `pinOnly(before, after)` over two buffers, read as bytes: true only when both split on `\n` into the same
   number of lines, at least one line differs, and each differing pair matches
   `^(\s*)"(version|url|sha256)": "[^"\\]*"(,?)$` on both sides with equal indentation, key and comma.
3. [S3] Add `landingClass({ event, ref, sha, head, parents, main, entries, before, after })`, pure, returning
   `{ skip, reason }`. `skip` is true only when `event` is `push`, `ref` is `refs/heads/land/` followed by `sha`, `sha`
   is 40 or 64 lowercase hex digits and equals `head`, `parents` is an array of exactly one sha equal to `main`,
   `entries` is an array of exactly one entry with path bytes `.claude-plugin/marketplace.json`, status `M` and both
   modes `100644`, and `pinOnly(before, after)` holds.
4. [S4] Add the CLI: it reads `GITHUB_EVENT_NAME`, `GITHUB_REF` and `GITHUB_SHA`; runs `git rev-parse HEAD`,
   `git rev-list --parents -n 1 HEAD`, `git ls-remote origin refs/heads/main`,
   `git diff-tree -r --raw -z --no-renames --ignore-submodules=none <parent> <sha>` and two `git cat-file blob`, each
   with a timeout, `windowsHide: true` and its output taken as a buffer; a command that exited non-zero, timed out or
   printed what cannot be parsed whole leaves its fact absent. It prints the answer and the reason on one line, appends
   `skip=1` or `skip=0` to the file `GITHUB_OUTPUT` names, and exits 0.
5. [S5] Add the catalogue mutants (a fourth key accepted; the line-count check dropped; a second entry tolerated; the
   path compared by prefix; the mode check dropped; the parent check dropped; a merge accepted; the event check
   dropped; the ref compared by prefix; the output of a failed diff parsed) and record one killed per `Rests-on` name.
   [proof: mutation]

## Acceptance

```bash
node --test tests/landing-class.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `only the three pinned values may differ` | `tests/landing-class.test.mjs` | The pin of c65834167, as two stand-in texts, is a pin; beside it each row that is not: identical texts; a fourth key's value; a line added; a line removed; two lines swapped; the `plugins` line itself; indentation changed; a comma added; a key renamed on one side; a value holding an escaped quote; CRLF on one side | — | S1, S2 |
| `a pin landing is one commit on main that changes one regular file` | `tests/landing-class.test.mjs` | The whole fact set of a pin skips; beside it each fact that does not: a pull request, a dispatch, a push to another branch, `land/<another sha>`, a head that is not the sha, a short sha, two parents, a parent that is not main, no main, a second entry, another path, the path with a trailing byte, status `A`, a mode of 100755 or 120000, and absent blobs | — | S1, S3 |
| `the command reads a real commit` | `tests/landing-class.test.mjs` | In a repository the test made, with a bare remote: a pin commit on main's tip writes `skip=1`; a pin behind a second unlanded commit, a pin that also touches another file, a pin made a merge, a mode change, a remote without main, and a run with `git` absent from `PATH` each write `skip=0`; the exit is 0 every time | — | S1, S4 |
| `a command that failed leaves its fact absent` | `tests/landing-class.test.mjs` | Through the command's spawn seam: with every git command answering, a pin skips; with each command in turn exiting 1 beside its whole answer, timing out, or answering text, it does not; nor with a diff that ended early, two refs answered, or another commit's parents; `rawEntries` reads a whole listing and nothing less | — | S1, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `scripts/landing-class.mjs` and its tests |
| 2 — something selects it | T2's seed job runs it; T2's test fails without that step |
| 3 — the caller can discover it | the workflow's step and the script's header |
| 4 — it is used | T3's landing |

## Mutation Log
- 2026-11-25 · 5aaf5d1bd* · mutant killed · exit 1 · `scripts/landing-class.mjs` · a fourth key is accepted as a pinned value · acceptance-sha256:7bfc4b6aa6da31260650d8a2ea3681799a9076eb72e3bdd5f1a2eff8006a8479 · covers:the three pinned keys
- 2026-11-25 · 5aaf5d1bd* · mutant killed · exit 1 · `scripts/landing-class.mjs` · a second changed path is tolerated · acceptance-sha256:7bfc4b6aa6da31260650d8a2ea3681799a9076eb72e3bdd5f1a2eff8006a8479 · covers:the one changed path
- 2026-11-25 · 5aaf5d1bd* · mutant killed · exit 1 · `scripts/landing-class.mjs` · the parent is not compared with main's tip · acceptance-sha256:7bfc4b6aa6da31260650d8a2ea3681799a9076eb72e3bdd5f1a2eff8006a8479 · covers:the parent is main's tip
- 2026-11-25 · 5aaf5d1bd* · mutant killed · exit 1 · `scripts/landing-class.mjs` · the ref is compared by prefix only · acceptance-sha256:7bfc4b6aa6da31260650d8a2ea3681799a9076eb72e3bdd5f1a2eff8006a8479 · covers:the event and ref check
- 2026-11-25 · 5aaf5d1bd* · mutant killed · exit 1 · `scripts/landing-class.mjs` · the output of a git command that exited non-zero is read · acceptance-sha256:7bfc4b6aa6da31260650d8a2ea3681799a9076eb72e3bdd5f1a2eff8006a8479 · covers:a failed command runs the campaign

## Invariants

- A fact the command could not read never yields "skip".
- The three keys are one constant in one file.

## Risks

- A runner's git prints the raw diff otherwise than this parser expects: the parse then fails whole and the answer is "run".

## Stop Condition

Stop if the last five pins (2d8e0f198, ec6e2d0ed, 93b207fec, 4427b1af8, c65834167), read from this repository's history,
are not each a pin by `pinOnly`: the rule of ADR-146 Decision 1 then does not describe a real pin and goes back to the owner.

## Out of Scope

- Any change to the workflow (deferred: docs/adr/ADR-146-a-pin-landing-is-not-re-mutated/tasks/T2-workflow-skips.md)

## Verification Log
- 2026-11-25 · 5aaf5d1bd* · exit 1 · `node --test tests/landing-class.test.mjs` · acceptance-sha256:7bfc4b6aa6da31260650d8a2ea3681799a9076eb72e3bdd5f1a2eff8006a8479 · ms:296 · test-lock-sha256:62b5bd2d9778fef789956c37a939eff4c402a2a93d52b6b3a559665941dacf54 · test-lock-file:docs/adr/locks/62b5bd2d9778fef789956c37a939eff4c402a2a93d52b6b3a559665941dacf54.lock
  ```
  --- last 10 line(s) of stdout (of 35 after folding 35 raw)
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 179.368083

  ✖ failing tests:

  test at tests/landing-class.test.mjs:1:1
  ✖ tests/landing-class.test.mjs (173.345291ms)
    'test failed'
  ```
- 2026-11-25 · 5aaf5d1bd* · exit 0 · `node --test tests/landing-class.test.mjs` · acceptance-sha256:7bfc4b6aa6da31260650d8a2ea3681799a9076eb72e3bdd5f1a2eff8006a8479 · ms:3458
- 2026-11-25 · 5aaf5d1bd* · exit 0 · `node --test tests/landing-class.test.mjs` · acceptance-sha256:7bfc4b6aa6da31260650d8a2ea3681799a9076eb72e3bdd5f1a2eff8006a8479 · ms:2474
- 2026-11-25 · 5aaf5d1bd* · exit 0 · `node --test tests/landing-class.test.mjs` · acceptance-sha256:7bfc4b6aa6da31260650d8a2ea3681799a9076eb72e3bdd5f1a2eff8006a8479 · ms:3005
- 2026-11-25 · 5aaf5d1bd* · exit 0 · `node --test tests/landing-class.test.mjs` · acceptance-sha256:7bfc4b6aa6da31260650d8a2ea3681799a9076eb72e3bdd5f1a2eff8006a8479 · ms:3272
- 2026-11-25 · 5aaf5d1bd* · exit 0 · `node --test tests/landing-class.test.mjs` · acceptance-sha256:7bfc4b6aa6da31260650d8a2ea3681799a9076eb72e3bdd5f1a2eff8006a8479 · ms:2742
- 2026-11-25 · 5aaf5d1bd* · exit 0 · `node --test tests/landing-class.test.mjs` · acceptance-sha256:7bfc4b6aa6da31260650d8a2ea3681799a9076eb72e3bdd5f1a2eff8006a8479 · ms:2255
- 2026-11-25 · 5aaf5d1bd* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:7bfc4b6aa6da31260650d8a2ea3681799a9076eb72e3bdd5f1a2eff8006a8479 · ms:11 · test-lock-sha256:209d68fd57111a6be6d034ab1da92617c47ecf4a9e24dac22b172b4fc4285f22 · test-lock-file:docs/adr/locks/209d68fd57111a6be6d034ab1da92617c47ecf4a9e24dac22b172b4fc4285f22.lock · test-lock-kind:replace
