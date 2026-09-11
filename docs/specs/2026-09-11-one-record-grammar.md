# Spec: One record grammar, loaded, not copied

> **Date:** 2026-09-11 · **Status:** Ready-for-ADR
> **Owner:** zy · **Becomes:** ADR-045
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** plugin/lib/fence.py (commit `1a400ca`, 2026-09-06, "One fence, three gates"), plugin/bin/adr-next (`sections`, `normalize_acceptance`, `acceptance`, `is_done`, `unprovable_evidence`), plugin/bin/adr-lint (`sections_of`, `normalize_acceptance`, `acceptance_digest`, `tracked_paths`), plugin/bin/adr-verify (`normalize_acceptance`, `acceptance_digest`, `acceptance_of`), plugin/bin/arch-lint (`sections_of`, `tracked_paths`), plugin/bin/spec-verify, plugin/bin/adr-debt, plugin/bin/adr-retire-check, docs/adr/ADR-011-a-pointer-resolves-or-it-is-reported.md (Alternatives: "one shared grammar module" rejected), docs/adr/ADR-010-a-claim-is-re-checked-or-it-is-not-counted.md, docs/adr/ADR-020-a-run-leaves-a-trace-outside-the-file.md, CLAUDE.md §4 §5 §8, scripts/coverage.sh

## Problem

The Python gates each carry their own copy of the record grammar, and one copy disagrees. Executed 2026-09-11 on `ea12656`: `rg -n 'def sections_of|def sections\(|def normalize_acceptance|def acceptance_digest' plugin/bin` names eleven definitions across seven gates — `sections_of` in adr-lint:376, spec-verify:107, arch-lint:60, adr-debt:232, adr-retire-check:109 (five identical, fence-aware bodies); `normalize_acceptance` in adr-lint:605, adr-verify:240, adr-next:220 (three identical); `acceptance_digest` in adr-lint:620, adr-verify:257 (two identical, adr-next inlines the same sha256 at :248); and `sections` in adr-next:207, which has no code-fence toggle. Probed with a task file whose Acceptance fence holds the line `## B`: adr-next reads sections `['A', 'B', 'Verification Log']`, adr-lint reads `['A', 'Verification Log']`. adr-next's Acceptance body is therefore a different string, its sha256 is different, and `is_done` / `unprovable_evidence` compare that digest to the one `adr-verify` wrote — a task can be reported unverified against evidence that verified it, silently. The same probe through `adr-verify`'s CLI refused the file ("no non-empty ```bash fence under ## Acceptance"), because its two Acceptance readers (adr-verify:2171, :2542) are a fence-blind regex `(?=^## |\Z)` — the writer of the digest cannot even see the fence adr-lint hashes. ADR-011 recorded "one shared grammar module imported by both … Rejected" because a shared file under `plugin/bin/` would acquire a forwarder; `plugin/lib/fence.py` (commit `1a400ca`) has since shown the idiom that avoids that — a module under `plugin/lib/`, loaded by path from each gate's own `__file__` — and nothing records that it supersedes the rejection. Separately, `tracked_paths` is defined twice with opposite membership: adr-lint:3445 includes `git ls-files --others --exclude-standard` (a file being added counts), arch-lint:279 deliberately refuses it (`--cached` only). Both cite CLAUDE.md §8; the shared name says neither rule.

## Goal

The record grammar — how a `## ` heading is found, how an Acceptance fence is normalized, how it is hashed — is defined once in `plugin/lib/record.py` and loaded by every gate that reads it, the way `plugin/lib/fence.py` is loaded; adr-next and adr-verify read the Acceptance fence the same way adr-lint does, so the three digests are one computation; and the two git listings carry names that state their rule.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| session running `adr-next` | human role | be told a task is done when `adr-verify` recorded it done, whatever the fence contains |
| `plugin/lib/record.py` | system | hold `sections_of`, `normalize_acceptance`, `acceptance_digest` once |
| every gate that reads records (`adr-lint`, `adr-verify`, `adr-next`, `spec-verify`, `arch-lint`, `adr-debt`, `adr-retire-check`) | system | load the module from `lib/` beside its own `bin/`; keep no copy; say could-not-run (exit 2) when `lib/` is absent |
| `adr-lint` / `arch-lint` git listings | system | be named for what they list |
| CI floors and attributes (`scripts/coverage.sh`, `.gitattributes`) | system | measure `plugin/lib/` and check it out LF everywhere |

## Use Cases

### UC-1: adr-next agrees with adr-verify on a fence that contains a heading line

- **Trigger:** `adr-verify <task>` records an exit-0 entry for a task whose Acceptance fence contains a line beginning `## ` · **Preconditions:** the task has a ```bash fence under `## Acceptance` and a `## Verification Log` heading
- **Main flow:**
  1. `adr-verify` reads the Acceptance section fence-aware, runs the whole fence, and writes an entry carrying `acceptance-sha256:` of the normalized whole fence.
  2. `adr-next <tasks> --all --json` reads the same section with the same reader and computes the same digest.
  3. The task is listed under `done`.
- **Failure paths:**
  - a. at step 2, the reader stops at the fenced `## ` line → a shorter body, a different digest, `done: false` for a task the tool just verified (the live defect).
  - b. at step 1, the writer's reader stops at the fenced `## ` line → no closing fence is found and the run is refused, so no evidence exists for a runnable fence (the live defect on the writer's side).
  - c. after the run the fence is edited → `done: false` with `unproven` naming a different Acceptance. This must stay: it is the digest doing its job, not this defect.
- **Postconditions:** for one file, `adr-verify`'s recorded digest and `adr-next`'s computed digest are equal; an edited fence is still reported unproven.

### UC-2: one module, loaded by path, no copies

- **Trigger:** a gate starts · **Preconditions:** the gate is under `<root>/bin/` and `<root>/lib/record.py` exists (a plugin cache, a checkout, or a forwarder's `$root`)
- **Main flow:**
  1. The gate resolves `lib/record.py` from `os.path.realpath(__file__)`, never from `PATH` or cwd, and loads it under one module name, displacing a foreign module of that name (the `fence.py` idiom).
  2. `sections_of`, `normalize_acceptance`, `acceptance_digest` are the module's objects in every gate; no gate defines its own.
- **Failure paths:**
  - a. `lib/record.py` is not beside `bin/` (a gate copied on its own) → one sentence naming the missing file and the directory looked in, exit 2, no traceback.
  - b. a gate keeps a private copy → the class is open again; the test that enumerates definitions in `plugin/bin` must fail.
- **Postconditions:** `rg 'def sections_of|def sections\(|def normalize_acceptance|def acceptance_digest' plugin/bin` finds nothing; `git check-attr eol plugin/lib/record.py` answers `lf`; `scripts/coverage.sh` measures `plugin/lib` (it already lists `$ROOT/lib` as a source).

### UC-3: the two git listings are named for their rule

- **Trigger:** a reader of `adr-lint` or `arch-lint` meets the listing function · **Preconditions:** a git repository with a committed file, an untracked non-ignored file, and an ignored file
- **Main flow:**
  1. adr-lint's listing is `tracked_or_unignored_paths`: tracked, plus on disk and not ignored — a file being added in the same commit is a member.
  2. arch-lint's listing stays `tracked_paths`: what `git ls-files --cached` answers — tracked or staged, and nothing that exists only on this machine.
- **Failure paths:**
  - a. the two functions share a name → a reader carries one rule into the other gate (the live shape).
  - b. the rename changes membership → forbidden; both functions keep their bodies.
- **Postconditions:** on the same repository the adr-lint listing contains the untracked file and the arch-lint listing does not; neither contains the ignored file; both contain the committed file.

## Scenarios

### UC1-S1 [happy] adr-next reports done what adr-verify recorded, with a `## ` line inside the fence [@implemented] → `tests/adr-next.test.mjs::a heading inside the Acceptance fence is not a heading: adr-next agrees with adr-verify's digest` cmd:`node --test --test-name-pattern 'a heading inside the Acceptance fence is not a heading' tests/adr-next.test.mjs`

```gherkin
Given a tasks directory holding one task whose Acceptance fence contains the line "## B"
When adr-verify runs the task and writes its exit-0 entry
And adr-next --all --json reads the same directory
Then the task is listed under done
And the digest adr-next computed equals the acceptance-sha256 adr-verify wrote
```

### UC1-S2 [failure] an edited fence is still unproven after the run [@implemented] → `tests/adr-next.test.mjs::a heading inside the Acceptance fence is not a heading: adr-next agrees with adr-verify's digest` cmd:`node --test --test-name-pattern 'a heading inside the Acceptance fence is not a heading' tests/adr-next.test.mjs`

```gherkin
Given the same task after adr-verify recorded it
When one character of the Acceptance fence is changed
And adr-next --all --json reads the directory again
Then the task is not listed under done
And its unproven note says the evidence was recorded against a different Acceptance
```

### UC2-S1 [happy] every record-reading gate loads plugin/lib/record.py and none keeps a copy [@implemented] → `tests/gates.test.mjs::the record grammar is one module: every gate loads plugin/lib/record.py and none keeps a copy` cmd:`node --test --test-name-pattern 'the record grammar is one module' tests/gates.test.mjs`

```gherkin
Given the gates under plugin/bin
When their sources are parsed
Then no gate defines sections_of, sections, normalize_acceptance or acceptance_digest
And adr-lint, adr-verify, adr-next, spec-verify, arch-lint, adr-debt and adr-retire-check each load lib/record.py from their own path
And git check-attr answers eol: lf for plugin/lib/record.py
```

### UC2-S2 [failure] a gate copied without lib/ says so and exits 2 [@implemented] → `tests/gates.test.mjs::a gate copied without plugin/lib says so and exits 2; with lib/ beside it, it runs` cmd:`node --test --test-name-pattern 'a gate copied without plugin/lib says so and exits 2' tests/gates.test.mjs`

```gherkin
Given a gate copied into a directory whose bin/ has no lib/ beside it
When it is run
Then it exits 2 with one sentence naming plugin/lib/record.py and the directory it looked in
And there is no traceback
And the same gate with lib/ copied beside it runs
```

### UC2-S3 [failure] the shared functions read the grammar one way and can be shown wrong [@implemented] → `tests/gates.test.mjs::record.py: a fenced ## is not a heading, blank edges are trimmed, and the digest is sha256 of exactly that` cmd:`node --test --test-name-pattern 'record.py: a fenced ## is not a heading' tests/gates.test.mjs`

```gherkin
Given plugin/lib/record.py loaded on its own
When sections_of reads a document with "## B" inside a fence and "## C" outside one
Then B is not a section and C is
And normalize_acceptance trims only blank lines at the fence edges and keeps internal ones
And acceptance_digest is the sha256 of exactly the normalized text
```

### UC3-S1 [happy] the two listings differ on an untracked, non-ignored file [@implemented] → `tests/gates.test.mjs::adr-lint's tracked_or_unignored_paths includes an untracked file; arch-lint's tracked_paths excludes it` cmd:`node --test --test-name-pattern "adr-lint's tracked_or_unignored_paths includes an untracked file" tests/gates.test.mjs`

```gherkin
Given a temporary git repository with a committed file, an untracked non-ignored file, and an ignored file
When adr-lint's tracked_or_unignored_paths and arch-lint's tracked_paths list it
Then both contain the committed file
And only adr-lint's contains the untracked file
And neither contains the ignored file
```

### UC3-S2 [failure] the old name is gone from adr-lint [@implemented] → `tests/gates.test.mjs::adr-lint's tracked_or_unignored_paths includes an untracked file; arch-lint's tracked_paths excludes it` cmd:`node --test --test-name-pattern "adr-lint's tracked_or_unignored_paths includes an untracked file" tests/gates.test.mjs`

```gherkin
Given plugin/bin/adr-lint loaded as a module
When its namespace is read
Then it has no tracked_paths
And arch-lint has no tracked_or_unignored_paths
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | Accepted. Current: adr-next:207 `sections` has no code-fence toggle; every other section reader in the gates does. Probed 2026-09-11 with a task whose Acceptance fence holds `## B`: adr-next sections `['A', 'B', 'Verification Log']`, adr-lint `['A', 'Verification Log']`. adr-verify:2171 and :2542 read Acceptance with `(?=^## \|\Z)` and refused the same file ("no non-empty ```bash fence"). After: adr-next and adr-verify read the Acceptance section through the shared fence-aware `sections_of`, normalize through the shared `normalize_acceptance`, and hash through the shared `acceptance_digest`, so for one file the digest adr-verify writes is the digest adr-next compares. Through both CLIs, outermost boundary (CLAUDE.md §4). An edited fence still reads unproven. Why it can fail: a reader that stops at a fenced `## ` hashes a shorter body; a writer that stops there records nothing. | `tests/adr-next.test.mjs::a heading inside the Acceptance fence is not a heading: adr-next agrees with adr-verify's digest` | @implemented | `node --test --test-name-pattern 'a heading inside the Acceptance fence is not a heading' tests/adr-next.test.mjs` |
| F-2 | Accepted. Current: eleven definitions of the grammar across seven gates (Problem). ADR-011 rejected a shared module because `plugin/bin/` grows a forwarder per file; `plugin/lib/fence.py` (commit `1a400ca`, 2026-09-06) is the idiom that supersedes that rejection — `lib/` is not `bin/`, each gate resolves it from `os.path.realpath(__file__)`, and a gate without it exits 2 with a sentence. After: `plugin/lib/record.py` holds `sections_of`, `normalize_acceptance`, `acceptance_digest`; every gate that had a copy loads it that way and deletes the copy; adr-next replaces `sections` and `normalize_acceptance` and its inline sha256 with the shared three. Not shared: `class Findings` (each gate's block/advise policy), `_Unreadable`, `scan_code_only`, `tracked_paths` (F-3). `.gitattributes` `*.py text eol=lf` already covers it, asserted with `git check-attr`; `scripts/coverage.sh` already lists `$ROOT/lib`. Why it can fail: a gate keeps a private copy; a gate resolves `lib/` from cwd or PATH; a copied gate dies in a traceback instead of saying could-not-run. | `tests/gates.test.mjs::the record grammar is one module: every gate loads plugin/lib/record.py and none keeps a copy` | @implemented | `node --test --test-name-pattern 'the record grammar is one module' tests/gates.test.mjs` |
| F-3 | Accepted. Current: adr-lint:3445 `tracked_paths` = `git ls-files` ∪ `git ls-files --others --exclude-standard` (a file being added counts, ADR-011 / ADR-017); arch-lint:279 `tracked_paths` = `git ls-files --cached` only, refusing `--others` because it admits a file that exists only on this laptop. Same name, opposite membership, both citing CLAUDE.md §8. After: adr-lint's is `tracked_or_unignored_paths` — tracked, or on disk and not ignored, which is exactly what its two `ls-files` calls answer; arch-lint's keeps `tracked_paths`, because `--cached` is the index and the index is what "tracked" means to git (a staged file is tracked; `committed_paths` would be false for it). Both bodies unchanged; every call site and the comment at adr-lint:3715 renamed. Why it can fail: the rename alters membership; a call site keeps the old name; the two listings agree on an untracked file. | `tests/gates.test.mjs::adr-lint's tracked_or_unignored_paths includes an untracked file; arch-lint's tracked_paths excludes it` | @implemented | `node --test --test-name-pattern "adr-lint's tracked_or_unignored_paths includes an untracked file" tests/gates.test.mjs` |

## Domain

**record grammar** = how a gate finds a `## ` section (fence-aware: a line starting with ``` toggles a fence, and a heading inside a fence is text), how it normalizes an Acceptance fence (line endings to `\n`, blank lines trimmed at the fence edges only), and how it hashes it (sha256 of the utf-8 normalized text). **loaded by path** = `importlib.util.spec_from_file_location` on `<dirname(dirname(realpath(__file__)))>/lib/<module>.py`, the `fence.py` idiom; never `sys.path`, never cwd. **copy** = a `def` of one of the three names in a gate. **tracked_or_unignored_paths** = `ls-files` ∪ `ls-files --others --exclude-standard`. **tracked_paths** (arch-lint) = `ls-files --cached`. **could-not-run** = exit 2 with a sentence, never a traceback (ADR-005).

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `plugin/lib/record.py` | new; `sections_of`, `normalize_acceptance`, `acceptance_digest` | adr-lint, adr-verify, adr-next, spec-verify, arch-lint, adr-debt, adr-retire-check |
| `plugin/bin/adr-next` `sections` / `normalize_acceptance` / inline sha256 | deleted; shared functions used | `acceptance`, `is_done`, `unprovable_evidence`, `human_stop`, `load` |
| `plugin/bin/adr-verify` `acceptance_of` and the recording path's Acceptance reader | read the section through `sections_of` | every `adr-verify` run; the claims sweep |
| `plugin/bin/adr-lint` `tracked_paths` | renamed `tracked_or_unignored_paths`; body unchanged | `check_pointers`, `check_adr`, `record_files`, tests/gate-regressions.py |
| the seven gates' module preamble | load `lib/record.py`; exit 2 with a sentence when absent | any gate copied without `lib/` |
| `tests/mutations.json` | entries with `file: plugin/lib/record.py`; entries for the new preambles | `scripts/mutate.mjs` |

## Non-Goals

- Sharing `class Findings`, `_Unreadable`, `scan_code_only`, or `tracked_paths` across gates.
- Changing any gate's block/advise policy, or any digest for a fence that contains no `## ` line (the normalized bytes of such a fence are unchanged, so every existing `acceptance-sha256:` stands).
- adr-verify's other three `(?=^## |\Z)` readers (adr-verify:666 `append_entry`'s section finder, :1672 Ordered Steps, :1983 Verification Log) — siblings of the same class, left for the backlog with this enumeration; they do not decide a digest.
- adr-next's ```bash-only fence match (adr-verify also reads ```sh / ```shell) — a different disagreement, not this spec.
- Rewriting ADR-011. Its rejection stands as history; this spec records what superseded it.
- Moving `fence.py`, or any file, so no `Governs:` header or `tests/mutations.json` `file:` path changes except the additions here.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| A gate resolves `lib/` from cwd or PATH and a forwarder run reads another install's grammar | Med | High | Same preamble as `fence.py`: from `realpath(__file__)`; the no-lib test runs from the repository cwd against a gate in a temp `bin/` |
| adr-next's grammar change alters a digest for an existing fence | Low | High | Only a fence containing a `## ` line changes body; `normalize_acceptance` bytes are identical; the parity assertions in tests/gate-regressions.py stay |
| A copied gate now dies for a helper it did not use before | Med | Med | Every gate that loads `record.py` uses it on every run; the refusal is one sentence, exit 2, and the test shows the same gate running with `lib/` beside it |
| The rename misses a call site | Low | High | `rg -n 'tracked_paths' plugin/bin/adr-lint tests` before and after; the test asserts the old name is absent from adr-lint's namespace |
| Mutation catalogue entries whose `from:` was a deleted copy stop matching | Low | Med | `rg` over tests/mutations.json for the bodies before deletion found none; new entries target `plugin/lib/record.py` |

## Open Questions

<!-- F-1, F-2, F-3 Accepted 2026-09-11 by the owner; the findings arrived accepted verbatim and were not re-grilled. Leftovers named in Non-Goals: adr-verify:666/:1672/:1983 fence-blind readers; adr-next ```bash-only match. -->

## Verify

```bash
python3 plugin/bin/spec-verify --spec docs/specs/2026-09-11-one-record-grammar.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | Does adr-next's section reader disagree with adr-lint's on a fenced `## ` line, and does the digest follow? | F-1 | Accepted. Probed: `['A', 'B', 'Verification Log']` vs `['A', 'Verification Log']`. adr-verify's own two Acceptance readers are the same class and refused the file; both move to `sections_of` so the requested CLI-to-CLI parity test can exist. |
| 2 | Is a shared module still rejected (ADR-011), or did `fence.py` supersede that? | F-2 | Accepted. `fence.py` (1a400ca) is the idiom; `lib/` is not `bin/`, so no forwarder. Recorded here and in ADR-045, never by editing ADR-011. |
| 3 | Which `tracked_paths` is misnamed? | F-3 | Accepted. adr-lint's — it lists untracked files. `tracked_or_unignored_paths` states its two `ls-files` calls; `committed_paths` for arch-lint would be false for a staged file. |
| 4 | Move `Findings`, `_Unreadable`, `scan_code_only` too? | non-behavioral | No. Each `Findings` docstring is its gate's policy; the others are one gate's. Non-Goal. |
