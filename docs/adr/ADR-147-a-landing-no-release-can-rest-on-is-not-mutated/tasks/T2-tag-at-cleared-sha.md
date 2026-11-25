# Task ADR-147-T2: A release's tag is made at the sha its evidence cleared, or the release stops

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** `the tag made at the cleared sha`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the tag is pushed before the release is created`, `the release verifies the tag and keeps its target`, `a tag elsewhere stops the release`

## Goal

`node scripts/release.mjs` never publishes a release whose tag names another commit than the one `release-evidence`
answered SUCCESS for (ADR-147 Decision 6).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/release.mjs` | edit | The tag push, `--verify-tag`, the resume from a tag at the same sha, and the message at :142 |
| `tests/release-tag.test.mjs` | add | The tests below; before editing `tests/release.test.mjs`, `python3 scripts/test-locks.py` says which of its tests are locked, and those stay byte-identical |
| `tests/mutations/scripts/release.mjs.json` | edit | One mutant per mechanism in `Rests-on` |
| `tests/helpers/release-world.mjs` | edit | The fake forge answers the tag's push and its lookup |
| `CLAUDE.md`, `.claude/rules/13-releasing.md`, `docs/architecture.md` | edit | §13 step 7 and the module map's release step say the command makes the tag at the cleared sha |

## Ordered Steps

1. [S1] Write the tests of the table below and confirm they are red (TDD red): the command creates the release with
   no `--verify-tag` and pushes no tag.
2. [S2] After `release-evidence` answered SUCCESS and the assets are verified, and before `gh release create`: run
   `git push origin <sha>:refs/tags/<tag>` with no force. A push that exits non-zero stops the release with exit 1 and
   a line naming the tag and the sha; nothing is published.
3. [S3] Create the release with `gh release create <tag> --target <sha> --latest --verify-tag` and the notes and assets
   as today. The target stays: the forge ignores it for a tag that exists and uses it for one deleted in between, and
   the locked test `release tags only a sha release-evidence clears, with its full sha and --latest` reads it.
4. [S4] At the start, a tag that has no release no longer always exits 2: when `git ls-remote origin refs/tags/<tag>`
   prints that tag at HEAD's sha, the command goes on, so a run whose push succeeded and whose creation failed
   resumes and makes the same push again; at any other sha it exits 2 and says the forge does not show the tag at this
   commit and that releasing the commit it names needs `release-evidence` to answer SUCCESS there; when the forge could
   not be asked it exits 1 and says the tag could not be read.
5. [S5] Reword CLAUDE.md §13 step 7 and its rules file. [proof: acceptance]
6. [S6] Add the catalogue mutants (the push dropped; the push forced; `--verify-tag` dropped; a failed push ignored; a
   tag at another sha resumed; an unread forge resumed) and record one killed per `Rests-on` name. [proof: mutation]

## Acceptance

```bash
node --test tests/release-tag.test.mjs tests/release.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the tag is pushed at the cleared sha before the release is created` | `tests/release-tag.test.mjs` | Through the command's injected runner: the push of `<sha>:refs/tags/<tag>` without force comes after the evidence and the verified assets and before `gh release create`, which carries `--verify-tag` and `--target <sha>`; with the push exiting 1 no release is created and the exit is 1; with evidence not SUCCESS, or the assets not verified, neither call is made | — | S1, S2, S3 |
| `a push cannot move a tag that exists` | `tests/release-tag.test.mjs` | In a repository the test made, with a bare remote holding the tag at another commit: the same push the command makes exits non-zero and the remote's tag is unchanged; at the same commit it exits 0 | — | S1, S2 |
| `a tag without a release resumes only at its own sha` | `tests/release-tag.test.mjs` | Through the injected runner: the tag on the forge at HEAD's sha goes on to the evidence and the push; at another sha, with no line, with a longer version's tag, a branch that ends alike or a short id, the exit is 2 and the message names `release-evidence` and does not say "by hand"; with the lookup failing beside the right line the exit is 1 and the message says the tag could not be read; in each nothing is checked, pushed or published | — | S1, S4 |
| `the instructions say the command makes the tag` | `tests/release-tag.test.mjs` | CLAUDE.md §13 step 7 names the tag's push, `--verify-tag` and ADR-147 | — | S1, S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the push and the changed creation in `scripts/release.mjs`, and their tests |
| 2 — something selects it | `release.mjs`'s own step order; the first test fails when the push is removed |
| 3 — the caller can discover it | the lines the command prints, and CLAUDE.md §13 step 7 |
| 4 — it is used | T3's release |

## Mutation Log
- 2026-11-25 · d94eb8047* · mutant killed · exit 1 · `scripts/release.mjs` · the tag is not pushed before the release is created · acceptance-sha256:ad0f9e9c0a89eea345eaa590fb716f1e3047b749f793280fb25ffa7e32c6ad11 · covers:the tag is pushed before the release is created
- 2026-11-25 · d94eb8047* · mutant killed · exit 1 · `scripts/release.mjs` · the release is created without verifying that the forge has the tag · acceptance-sha256:ad0f9e9c0a89eea345eaa590fb716f1e3047b749f793280fb25ffa7e32c6ad11 · covers:the release verifies the tag and keeps its target
- 2026-11-25 · d94eb8047* · mutant killed · exit 1 · `scripts/release.mjs` · a tag the forge shows at another commit resumes the release · acceptance-sha256:ad0f9e9c0a89eea345eaa590fb716f1e3047b749f793280fb25ffa7e32c6ad11 · covers:a tag elsewhere stops the release

## Invariants

- No release is created in a run whose own push of the tag at the cleared sha did not exit 0. A tag the forge showed at this sha at the start lets the run go on to that push and does not replace it.
- A locked test of `tests/release.test.mjs` stays byte-identical.

## Risks

- The forge refuses the tag push (a ruleset, a credential): the release stops unpublished, and T3 would show it. On 2026-11-25 the forge had one ruleset, on the branch `main`.
- The seconds between the push and the creation stay open to a tag moved on the forge (ADR-147 Decision 6); no test here closes them.

## Stop Condition

Stop if a locked test of `tests/release.test.mjs` cannot stay as it is beside the change: the lock then needs the
owner's word. (One asserts `--target <sha> --latest` at the start of the creation call, which S3 keeps.)

## Out of Scope

- Which run a release takes its assets from (deferred: docs/BACKLOG.md §475)

## Verification Log
- 2026-11-25 · d94eb8047* · exit 1 · `node --test tests/release-tag.test.mjs tests/release.test.mjs` · acceptance-sha256:ad0f9e9c0a89eea345eaa590fb716f1e3047b749f793280fb25ffa7e32c6ad11 · ms:180 · test-lock-sha256:876af40b2c2a65bcd8783a23a1db9c90ce80bc66dd2ebf614a89afc97432281b · test-lock-file:docs/adr/locks/876af40b2c2a65bcd8783a23a1db9c90ce80bc66dd2ebf614a89afc97432281b.lock
  ```
  --- last 10 line(s) of stdout (of 39 after folding 39 raw)
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 95.178334

  ✖ failing tests:

  test at tests/release-tag.test.mjs:1:1
  ✖ tests/release-tag.test.mjs (83.132042ms)
    'test failed'
  ```
- 2026-11-25 · d94eb8047* · exit 0 · `node --test tests/release-tag.test.mjs tests/release.test.mjs` · acceptance-sha256:ad0f9e9c0a89eea345eaa590fb716f1e3047b749f793280fb25ffa7e32c6ad11 · ms:582
- 2026-11-25 · d94eb8047* · exit 0 · `node --test tests/release-tag.test.mjs tests/release.test.mjs` · acceptance-sha256:ad0f9e9c0a89eea345eaa590fb716f1e3047b749f793280fb25ffa7e32c6ad11 · ms:591
- 2026-11-25 · d94eb8047* · exit 0 · `node --test tests/release-tag.test.mjs tests/release.test.mjs` · acceptance-sha256:ad0f9e9c0a89eea345eaa590fb716f1e3047b749f793280fb25ffa7e32c6ad11 · ms:594
- 2026-11-25 · d94eb8047* · exit 0 · `node --test tests/release-tag.test.mjs tests/release.test.mjs` · acceptance-sha256:ad0f9e9c0a89eea345eaa590fb716f1e3047b749f793280fb25ffa7e32c6ad11 · ms:517
