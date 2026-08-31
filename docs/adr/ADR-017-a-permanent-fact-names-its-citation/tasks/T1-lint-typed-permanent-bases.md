# Task ADR-017-T1: lint typed permanent bases

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** typed permanent-disposition advice, repository-line receipt resolution, and the two ADR-017 mutation labels
**Consumes:** Out of Scope bullets from `scope_bullets()`, balanced spans from `disposition_span()`, repository candidates from `tracked_paths()`, and advisory reporting from `Findings.advise()`
**Data dependency:** hermetic

## Goal

Advise through the real `adr-lint` CLI when a permanent Out of Scope entry is neither a chosen
boundary nor a factual claim carrying exactly one typed, syntactically valid receipt.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | parse typed permanent forms, resolve repository-line receipts, issue advice, and select the pass from the ADR-level path |
| `plugin/bin/adr-debt` | edit | correct the CLI docstring without changing permanent/deferred sweep behavior |
| `plugin/bin/qh-mcp` | edit | correct the served debt-tool description without changing its adapter or exit contract |
| `plugin/templates/adr-template.md` | edit | make the two typed forms the creation-path examples and explain their different evidence duties |
| `plugin/skills/adr-write/SKILL.md` | edit | require new ADRs to distinguish a chosen boundary from a factual premise |
| `plugin/skills/adr-write/references/lessons.md` | edit | replace the ambiguous “permanent requires a checked fact” lesson with the typed boundary/fact rule |
| `tests/gate-regressions.py` | edit | exercise valid, legacy, malformed, unresolved, and could-not-look forms through the real CLI and print the acceptance sentinel |
| `tests/mutations.json` | edit | add one behavioral mutant for classification/selection and one for file-line resolution |

## Ordered Steps

1. Add `test_permanent_disposition_citations` to `tests/gate-regressions.py`, call it from `main()`,
   and print `PASS — permanent disposition citations` only after its assertions pass. First run the
   Acceptance fence against the unimplemented linter and record the expected red result: the new
   fact and legacy cases produce no typed-basis advice.
2. In that test, create a temporary git repository with a minimal Proposed ADR, a tracked two-line
   `docs/evidence.md`, and an untracked non-ignored same-change receipt, then invoke the working-tree
   `plugin/bin/adr-lint` as a CLI. Prove that a non-empty typed boundary and facts citing `file
   \`docs/evidence.md:2\``, the untracked receipt, `version \`@scope/name@1.2.3\``, `url
   https://example.invalid`, and `url https://example.invalid/receipt` produce no permanent-basis
   advice. A nested-parenthesis boundary reason and a deferred pointer are required no-finding
   controls.
3. Through the same CLI fixture, prove that `(permanent)`, a free-form `(permanent: reason)`, empty
   boundary/fact bodies, a boundary with the reserved citation suffix, a fact with no receipt, an
   untyped receipt, two receipt suffixes, trailing receipt prose, differently cased or whitespace-
   malformed keywords, uppercase `HTTPS`, a URL with no host, a relative path that leaves the tree, a
   symlink whose target leaves the tree, a missing file, line zero, and a line beyond EOF each
   produce targeted advice. A repository whose git candidate set cannot be obtained must say it
   could not validate the receipt rather than call the file absent. A focused helper control that
   forces a read error must produce distinct “could not read” advice rather than “missing.” Keep
   every outcome advisory: every CLI invocation exits exactly as it did before this task.
4. Add one permanent-disposition classifier that consumes the existing complete bullet and balanced
   span. Accept exactly `boundary`, and `fact` with one of `file`, `version`, or `url`; do not copy
   Markdown or balanced-parenthesis parsing. Treat every structural keyword as exact lowercase text
   and trim only the reason or claim payload. Resolve file candidates with `tracked_paths()`, reject
   tree-leaving lexical and symlink-resolved paths after normalizing both separators, verify a
   positive in-range line in a readable repository file, and preserve unknown/unreadable as distinct
   advice. Parse version and lowercase-HTTPS URL syntax without registry queries, subprocesses,
   sockets, or URL fetches. Update `adr-lint`'s CLI docstring to advertise the typed grammar.
5. Select the classifier from the existing ADR-level lint path for every top-level Out of Scope
   bullet whose terminal span starts with `permanent`. Report legacy, malformed, and unresolved
   forms only through `Findings.advise()`. Do not narrow `DISPOSITION_TEXT`, alter
   `_carries_a_disposition()`, or edit the standalone `adr-debt` and `adr-retire-check` span readers;
   legacy text must remain a permanent disposition even while it receives migration advice.
6. Update `plugin/templates/adr-template.md`, `plugin/skills/adr-write/SKILL.md`, and
   `plugin/skills/adr-write/references/lessons.md` in the same change. Each must teach
   `(permanent: boundary: <reason>)` for a chosen limit and `(permanent: fact: <claim>; citation:
   <typed receipt>)` for a factual premise, while documenting legacy advice and leaving deferred
   pointers unchanged. Update only the descriptive text in `plugin/bin/adr-debt` and its served
   `plugin/bin/qh-mcp` tool description so both say permanent entries may be chosen boundaries or
   cited facts and neither kind is swept; do not alter their sweep/adapter behavior.
7. Add the exact mutation labels `lint: a permanent disposition names whether it is boundary or
   fact` and `lint: a permanent fact file citation resolves to a repository line`. The first removes
   or disables the unique call selecting the new classifier; the second disables only the deciding
   file-line resolution branch. Both mutants must compile, preserve unique source anchors, and be
   killed by `test_permanent_disposition_citations` through the CLI, not by catalogue-integrity
   checks.
8. Run the two focused catalogue-integrity tests outside the Acceptance fence, run the class sweep,
   record one killed `adr-verify --mutant` entry per mechanism, then finish with the full unpiped
   `bash scripts/selftest.sh`.

## Acceptance

```bash
set -o pipefail
python3 tests/gate-regressions.py plugin/bin plugin/skills/postmortem/SKILL.md . 2>&1 | tee /tmp/adr017-t1-gate-regressions.out &&
grep -qF 'PASS — permanent disposition citations' /tmp/adr017-t1-gate-regressions.out &&
! grep -qE 'Traceback|AssertionError|^FAIL' /tmp/adr017-t1-gate-regressions.out
```

The Python harness already succeeds before T1, so its exit code alone cannot prove the new behavior.
The positive sentinel is printed only after the named CLI regression runs and keeps this fence red
until the test is present and selected. Catalogue integrity remains a preflight rather than a way to
earn either behavioral kill:

```bash
node --test --test-name-pattern='every catalogue entry still matches the source it mutates, exactly once|a mutation that matches across lines targets a file git checks out with LF' tests/package.test.mjs
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `test_permanent_disposition_citations` | `tests/gate-regressions.py` | through the real CLI: canonical boundary, tracked/untracked files, a version, and host-only/path URLs pass without basis advice; legacy, empty, duplicated, trailing, case/whitespace-malformed, uppercase-scheme, hostless, tree-leaving, symlink-escaping, absent and invalid-line forms advise; nested parentheses and deferred entries remain controls; unavailable git and forced unreadability produce distinct unknown/read-error advice; shipped debt descriptions name both permanent arms while behavior remains advisory | — |
| `every catalogue entry still matches the source it mutates, exactly once` | `tests/package.test.mjs` | both new anchors stay unique before and after mutation work; preflight only | — |
| `a mutation that matches across lines targets a file git checks out with LF` | `tests/package.test.mjs` | any multi-line Python mutation anchor is portable to Windows; preflight only | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `test_permanent_disposition_citations` exercises every accepted receipt type and the legacy/malformed branches |
| 2 — something selects it | the first mutant disables the ADR-level classifier call; the CLI regression and required sentinel must go red |
| 3 — the caller can discover it | the ADR template and `adr-write` skill show both exact forms, and CLI advice repeats the valid replacements |
| 4 — it is used | the temporary consumer corpus invokes the working-tree CLI; installed-consumer uptake is not measured yet |

## Class Sweep

**Class:** every quality-harness reader that locates or interprets a permanent Out of Scope
disposition.

```bash
rg -n '^def (disposition_span|scope_bullets|closes_the_line|_carries_a_disposition|check_adr|tracked_paths)\b|^DISPOSITION_TEXT\s*=' plugin/bin/adr-lint
rg -n '^def disposition_span\b' plugin/bin/adr-lint plugin/bin/adr-debt plugin/bin/adr-retire-check
rg -n 'permanent\[: why\]|permanent: <why>|permanent.*checked fact|permanent.*deliberate boundar' plugin/templates/adr-template.md plugin/skills/adr-write/SKILL.md plugin/skills/adr-write/references/lessons.md plugin/bin/adr-debt plugin/bin/qh-mcp
```

The first two commands must still enumerate the established lint path and all three balanced-span
copies; no fourth parser is permitted. After the guidance update, the third command must return no
old recommendation. If another shipped authoring source appears, stop and add it to Affected Files
before calling the guidance coherent.

## Mutation Log

<!-- tool-written by adr-verify --mutant; empty at authoring -->
- 2026-09-01 · 8dbb8f8* · mutant killed · exit 1 · `plugin/bin/adr-lint` · the ADR-level path must select typed permanent classification · acceptance-sha256:b3398f5172664c1600392b0abc1f69b3f49f68e8caccfe458ef6006b69b2f6d8
- 2026-09-01 · 8dbb8f8* · mutant killed · exit 1 · `plugin/bin/adr-lint` · a file fact must resolve its positive line within the cited repository file · acceptance-sha256:b3398f5172664c1600392b0abc1f69b3f49f68e8caccfe458ef6006b69b2f6d8

## Invariants

- Every finding introduced by this task is advisory; `adr-lint` exit behavior is unchanged.
- A legacy permanent form remains a machine-readable permanent disposition and never enters
  deferred debt.
- A chosen boundary needs a non-empty reason and no external receipt; a factual premise needs a
  non-empty claim and exactly one typed receipt.
- A file citation proves only that a repository candidate and line can be located, not that its text
  supports the claim.
- Version and URL receipts are parsed without external I/O.
- Unknown git state and unreadable files are reported as unknown observations, never as absence.
- Wrapped bullets, nested parentheses, child bullets, and deferred pointers retain the grammar
  already shared by `adr-lint`, `adr-debt`, and `adr-retire-check`.
- The creation template, authoring skill, lesson, CLI advice, and behavioral tests name the same two
  typed forms.

## Risks

- Tightening `DISPOSITION_TEXT` would silently turn migration advice into “no disposition” advice
  and could make another reader disagree. Leave the broad existence grammar unchanged and layer the
  advisory classifier after it.
- A path resolver built from `Path.exists()` would depend on ignored or generated files on one
  machine. Reuse `tracked_paths()` and test the untracked, non-ignored same-change case.
- Splitting a fact on the first semicolon or `@` would corrupt ordinary claims and scoped package
  names. Reserve the exact suffix marker and split version receipts at the final `@`.
- A source-anchor edit can orphan a mutation. Keep both mutants anchor-preserving, run the exact-once
  catalogue preflight around mutation work, and never count that preflight as the behavioral kill.
- A test importing the helper directly would miss unwired production code. Invoke the real CLI and
  require the sentinel emitted only after the CLI assertions pass.

## Stop Condition

Stop and return to the owner if the typed forms cannot be added without narrowing legacy disposition
recognition, if a file receipt requires a filesystem-only candidate set, if a URL/version branch
performs external I/O, or if either mechanism lacks a compiling mutant that the CLI regression
kills.

## Out of Scope

- Semantic validation of claims or source authority; the parent ADR fixes the syntax/reachability
  boundary.
- Bulk migration of existing ADR records; legacy advice is the compatibility contract.
- Changing `adr-debt`, `adr-retire-check`, or deferred-pointer resolution behavior; correcting the
  two shipped debt descriptions is part of this task.
- Automatic edits to consumer ADRs.

## Verification Log

<!-- tool-written by adr-verify; empty at authoring -->
- 2026-09-01 · 8dbb8f8* · exit 0 · `set -o pipefail …` · acceptance-sha256:b3398f5172664c1600392b0abc1f69b3f49f68e8caccfe458ef6006b69b2f6d8
