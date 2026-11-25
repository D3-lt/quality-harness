# Task ADR-147-T1: A landing of a version already tagged is recognised, and anything else is left to the pin check

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** `the released-version answer`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the tag is that version's own`, `the version is three runs of digits`, `the event, ref and head come first`, `a failed command is no tag`

## Goal

`scripts/landing-class.mjs` also answers "skip" for a push to `land/<sha>` whose plugin version is already tagged on the
forge, and is otherwise unchanged: every other input gets the answer ADR-146's pin check gives it (ADR-147 Decisions 1
and 3).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/landing-class.mjs` | edit | `landingClass` reads `version` and `tags`; new `readRelease`; the CLI passes both; the header says both answers |
| `tests/landing-released.test.mjs` | add | The tests below; the five tests of `tests/landing-class.test.mjs` are locked by ADR-146 T1 and stay byte-identical |
| `tests/mutations/scripts/landing-class.mjs.json` | edit | One mutant per mechanism in `Rests-on` |
| `.github/workflows/selftest.yml` | edit | Comments only: the four that say a pin is the one landing without a campaign |
| `scripts/release-evidence.mjs`, `scripts/release.mjs` | edit | Comments only, the same sentence |
| `CLAUDE.md`, `.claude/rules/13-releasing.md` | edit | §13 step 3 and §18 say which land push is the full campaign; the measurement of 2026-11-25 |

## Ordered Steps

1. [S1] Write the tests of the table below and confirm they are red (TDD red): `readRelease` does not exist and a
   tagged version does not skip.
2. [S2] In `landingClass`, after the checks of the event, the sha, the ref and the head and before the parent check:
   answer `{ skip: true }` with a reason naming the version when `version` is a string matching three dot-separated runs
   of digits and `tags` is an array of lines one of which is a full object id, a tab and exactly `refs/tags/v<version>`.
   Other lines are ignored. Anything else falls through to the existing checks.
3. [S3] Add `readRelease(cwd, spawn)`: `git cat-file blob HEAD:plugin/.claude-plugin/plugin.json`, decoded as strict
   UTF-8 and parsed; when its `version` has the shape of S2, `git ls-remote origin refs/tags/v<version>`. Each child has
   the timeout and `windowsHide: true` the file's other children have; a command that exited non-zero or timed out
   leaves its fact absent, and so does an `ls-remote` answer that does not end in a newline. The manifest is taken as
   the blob's bytes, with or without a final newline. `readFacts` is not changed, so the locked tests that count its
   commands stay as they are. The CLI merges both.
4. [S4] Reword the comments and the two instruction sections named in Affected Files. No workflow key, condition or
   step changes: `git diff` of the workflow shows comment lines only. [proof: acceptance]
5. [S5] Add the catalogue mutants (the tag's name compared by suffix; an empty answer accepted; a short object id
   accepted; the version's shape not checked; the answer given before the event, the ref or the head is checked; the
   output of a command that exited non-zero read; a line cut short read) and record one killed per `Rests-on` name.
   [proof: mutation]

## Acceptance

```bash
node --test tests/landing-released.test.mjs tests/landing-class.test.mjs tests/landing-class-workflow.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a landing of a version already tagged skips the campaign` | `tests/landing-released.test.mjs` | The facts of a code landing with its version's tag skip, alone and beside a branch whose name ends in the tag's name; beside them each that does not, and then answers as the pin check does: no line; another version's tag; a longer version that starts alike; only the branch that ends in the tag's name; a short object id; a line without a tab; a version with a suffix, with two parts, with a letter, not a string, absent; a pull request, a dispatch, another branch, `land/<another sha>`, a head that is not the sha. A pin with no tag still skips as a pin, and a tagged version skips whatever its parents are | — | S1, S2 |
| `the version and its tag are read from git and the forge` | `tests/landing-released.test.mjs` | Through the spawn seam: with both commands answering, the facts are the version and the lines; with each in turn exiting 1 beside its whole answer, timing out or answering text, the answer is not "skip", and neither is it with the forge's answer cut one byte short; a manifest that is whole JSON with no final newline is read; one cut inside its JSON, not JSON, not UTF-8, or without a version asks the forge nothing | — | S1, S3 |
| `the command reads a real tag` | `tests/landing-released.test.mjs` | In a repository the test made, with a bare remote: a commit that changes a source file writes `skip=1` once its version's lightweight tag is on the remote, and again with an annotated tag; it writes `skip=0` with no tag, with the tag only in the local repository, with a longer version's tag on the remote, with a manifest that does not parse, and with `git` absent from `PATH`; the exit is 0 every time | — | S1, S3 |
| `the instructions say which landing is the full campaign` | `tests/landing-released.test.mjs` | CLAUDE.md §13 step 3 and §18 and the workflow's comment each name ADR-147 beside the released-version rule, and the workflow's keys are those of ADR-146 T2's test, which still passes | — | S1, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `readRelease`, the new branch of `landingClass` and their tests |
| 2 — something selects it | the CLI the seed job already runs (ADR-146 T2's test fails without that step); `the command reads a real tag` runs that CLI |
| 3 — the caller can discover it | the line the command prints, and the script's header |
| 4 — it is used | T3's landing |

## Mutation Log
- 2026-11-25 · eecdce9f3* · mutant killed · exit 1 · `scripts/landing-class.mjs` · the tag's name is compared by how it ends · acceptance-sha256:356c79201c7668fa17c5122cbfb3927193eb836407de013e93a5077fd58ff803 · covers:the tag is that version's own
- 2026-11-25 · eecdce9f3* · mutant killed · exit 1 · `scripts/landing-class.mjs` · the version's shape is not checked · acceptance-sha256:356c79201c7668fa17c5122cbfb3927193eb836407de013e93a5077fd58ff803 · covers:the version is three runs of digits
- 2026-11-25 · eecdce9f3* · mutant killed · exit 1 · `scripts/landing-class.mjs` · a tagged version answers before the event is checked · acceptance-sha256:356c79201c7668fa17c5122cbfb3927193eb836407de013e93a5077fd58ff803 · covers:the event, ref and head come first
- 2026-11-25 · eecdce9f3* · mutant killed · exit 1 · `scripts/landing-class.mjs` · the output of a command that exited non-zero is read · acceptance-sha256:356c79201c7668fa17c5122cbfb3927193eb836407de013e93a5077fd58ff803 · covers:a failed command is no tag

## Invariants

- A fact the command could not read never yields "skip".
- `readFacts` and the five locked tests of `tests/landing-class.test.mjs` are byte-identical.
- The workflow's keys, conditions and steps are byte-identical.

## Risks

- A runner's `git ls-remote` prints a tag otherwise than S2 expects: the answer is then "run".

## Stop Condition

Stop if any locked test of `tests/landing-class.test.mjs` would have to change: the seam is then wrong and goes back to
the owner. (`git ls-remote origin refs/tags/v3.8.81` against this repository's forge printed one line, the tag's own,
on 2026-11-25.)

## Out of Scope

- Reading the first skipped landing (deferred: docs/adr/ADR-147-a-landing-no-release-can-rest-on-is-not-mutated/tasks/T3-measured.md)

## Verification Log
- 2026-11-25 · eecdce9f3* · exit 1 · `node --test tests/landing-released.test.mjs tests/landing-class.test.mjs tests/landing-class-workflow.test.mjs` · acceptance-sha256:356c79201c7668fa17c5122cbfb3927193eb836407de013e93a5077fd58ff803 · ms:3131 · test-lock-sha256:8d83bc896ad0df41cb3070a79beb38a66f75d8978522a99271e426faa421bbc8 · test-lock-file:docs/adr/locks/8d83bc896ad0df41cb3070a79beb38a66f75d8978522a99271e426faa421bbc8.lock
  ```
  --- last 10 line(s) of stdout (of 32 after folding 32 raw)
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 3047.589166

  ✖ failing tests:

  test at tests/landing-released.test.mjs:1:1
  ✖ tests/landing-released.test.mjs (72.990708ms)
    'test failed'
  ```
- 2026-11-25 · eecdce9f3* · exit 0 · `node --test tests/landing-released.test.mjs tests/landing-class.test.mjs tests/landing-class-workflow.test.mjs` · acceptance-sha256:356c79201c7668fa17c5122cbfb3927193eb836407de013e93a5077fd58ff803 · ms:3490
- 2026-11-25 · eecdce9f3* · exit 0 · `node --test tests/landing-released.test.mjs tests/landing-class.test.mjs tests/landing-class-workflow.test.mjs` · acceptance-sha256:356c79201c7668fa17c5122cbfb3927193eb836407de013e93a5077fd58ff803 · ms:3353
- 2026-11-25 · eecdce9f3* · exit 0 · `node --test tests/landing-released.test.mjs tests/landing-class.test.mjs tests/landing-class-workflow.test.mjs` · acceptance-sha256:356c79201c7668fa17c5122cbfb3927193eb836407de013e93a5077fd58ff803 · ms:2780
- 2026-11-25 · eecdce9f3* · exit 0 · `node --test tests/landing-released.test.mjs tests/landing-class.test.mjs tests/landing-class-workflow.test.mjs` · acceptance-sha256:356c79201c7668fa17c5122cbfb3927193eb836407de013e93a5077fd58ff803 · ms:3089
- 2026-11-25 · eecdce9f3* · exit 0 · `node --test tests/landing-released.test.mjs tests/landing-class.test.mjs tests/landing-class-workflow.test.mjs` · acceptance-sha256:356c79201c7668fa17c5122cbfb3927193eb836407de013e93a5077fd58ff803 · ms:2787
- 2026-11-25 · abe4286cb* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:356c79201c7668fa17c5122cbfb3927193eb836407de013e93a5077fd58ff803 · ms:12 · test-lock-sha256:8c4534b366c74fffd83be060302d33b7bff7bc655b45a5b6c432e07cdae9c51c · test-lock-file:docs/adr/locks/8c4534b366c74fffd83be060302d33b7bff7bc655b45a5b6c432e07cdae9c51c.lock · test-lock-kind:replace
- 2026-11-25 · abe4286cb* · exit 0 · `node --test tests/landing-released.test.mjs tests/landing-class.test.mjs tests/landing-class-workflow.test.mjs` · acceptance-sha256:356c79201c7668fa17c5122cbfb3927193eb836407de013e93a5077fd58ff803 · ms:2088
