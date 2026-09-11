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

### UC-4: one fence opener, read by the writer, the verifier and the reader alike

Added 2026-09-11 after the Codex review of T1/T2 (HIGH): the opener was three regexes — adr-verify `bash|sh|shell`, adr-lint's digest path `bash` only, adr-next a bare ```bash\n — and on a ```sh task adr-verify wrote a `done` row that adr-lint accepted with NO digest check, because `acc_all` was `""` and the whole `want_digest` block was skipped. Reproduced 2026-09-11: a forged digest produced byte-identical adr-lint output.

- **Trigger:** a task's Acceptance fence opens with ```bash, ```sh or ```shell (optional trailing whitespace) · **Preconditions:** the task is otherwise conforming
- **Main flow:**
  1. `adr-verify` finds the fence with `record.ACCEPTANCE_FENCE`, runs it, and records the digest.
  2. `adr-lint` finds the same fence with the same constant, digests it, and judges the `done` row against that digest.
  3. `adr-next` finds the same fence with the same constant and reports the task done.
- **Failure paths:**
  - a. the recorded digest does not match the fence → adr-lint blocks the `done` row, for sh and shell exactly as for bash.
  - b. the fence opens with a language no gate runs (```python) or with no label → adr-lint blocks, naming the opener it found; adr-verify refuses; adr-next has no fence to hash. Never an empty `acc_all` that skips the check.
- **Postconditions:** `rg` over the gates finds no private opener regex; a forged digest on a ```sh task is refused with the digest message.

### UC-5: a gate that cannot load a shared module says so with its own could-not-run code

Added 2026-09-11 after the Codex review (MEDIUM ×2): the `record.py`-absent branch of adr-verify and spec-verify was reachable by no test (the fixture lacked both libs and the fence check fired first), and a missing lib exited 2 in every gate — the code spec-verify documents as "bound test missing" and adr-verify as "authoring problem", both findings about the record.

- **Trigger:** a gate starts with `plugin/lib/fence.py` or `plugin/lib/record.py` absent from the `lib/` beside its real `bin/` · **Preconditions:** the gate was copied on its own
- **Main flow:**
  1. The gate writes ONE line to stderr naming the missing file and the directory it looked in, nothing to stdout, and exits with the could-not-run code its own Exit block reserves: 4 for adr-verify, spec-verify and qh-mcp; 2 for adr-lint, adr-next, arch-lint, adr-debt, adr-retire-check.
  2. The same gate reached through a symlink from a directory with no `lib/` runs, because `lib/` is resolved from `realpath(__file__)`.
- **Failure paths:**
  - a. the `isfile` guard is removed → a traceback and exit 1, which the test refuses.
  - b. the code is a finding's code → the Exit block and the test disagree; the test binds the wording ("could not run") to the numeral, not the numeral alone.
- **Postconditions:** every lib a gate loads has a fixture in which exactly that lib is absent; every Exit block names the code and says could-not-run.

### UC-6: a repeated `## ` heading is reported, never resolved in silence

Added 2026-09-11 after the Codex review (MEDIUM, second half): `sections_of` keeps the last of a repeated heading; the old adr-verify regex kept the first; nothing said so. Owner's decision: define it.

- **Trigger:** a task or ADR carries the same `## ` heading twice outside fences · **Preconditions:** none
- **Main flow:**
  1. `record.repeated_headings` names the heading; every gate reads the LAST occurrence, identically.
  2. adr-lint blocks a repeated `## Acceptance` (two fences, one digest — the severity of the no-fence check) and advises any other repeat (the severity of a missing section); the ADR is read by the same rule.
  3. adr-verify refuses to run or write anything against a task with a repeated heading (exit 2, authoring).
- **Failure paths:**
  - a. the check is removed → a duplicate Acceptance passes both gates; the test shows it blocked and refused.
  - b. a `## ` line inside a fence is counted as a repeat → false finding; the test shows a fenced `## A` beside an unfenced `## A` is not a repeat.
- **Postconditions:** the shipped corpus has no repeated heading (enumerated 2026-09-11 over `git ls-files 'docs/**/*.md' tests/fixtures`); the fixture task lints clean of the message.

### UC-7: adr-verify's remaining section readers are the shared grammar

Added 2026-09-11, closing BACKLOG §197: `append_entry` (the entry writer), `declared_steps` and `claims_in` still read a section with `(?=^## |\Z)`, which ends at a `## ` line inside a fence — and the Verification Log is where a fenced excerpt lives.

- **Trigger:** a task's Verification Log or Ordered Steps holds a fenced block containing a line beginning `## ` · **Preconditions:** none
- **Main flow:**
  1. `adr-verify --human` appends its entry as the LAST line of the section, after the fence, through `record.section_span`.
  2. `adr-verify --steps S2` accepts an `[S2]` declared after the fenced line, through `sections_of`.
  3. `adr-verify --sweep` counts a claim written after the fenced line, through `sections_of`.
- **Failure paths:**
  - a. the old regex returns → the entry lands inside the fence, S2 is refused, the claim leaves the denominator; each has its own regression and its own catalogue entry.
  - b. the section is absent → the writer still refuses with the add-a-heading sentence, so the append is the section being found, not a fallback.
- **Postconditions:** `rg -n '\(\?=\^## \|\\Z\)' plugin/bin` finds nothing; the one-module test refuses the shape.

## Scenarios

### UC4-S1 [happy] a sh-labelled task the writer recorded is digest-checked by the verifier [@implemented] → `tests/evidence-chain.test.mjs::a sh-labelled Acceptance the writer recorded is digest-checked by adr-lint, not skipped` cmd:`node --test --test-name-pattern 'digest-checked by adr-lint, not skipped' tests/evidence-chain.test.mjs`

```gherkin
Given a conforming task whose Acceptance fence opens with ```sh, ```shell or ```bash followed by spaces
When adr-verify --mutant kills a mutant and adr-verify records an exit-0 run
And the README marks the task done
Then adr-lint exits 0 and says nothing about a missing fence
```

### UC4-S2 [failure] a forged digest on a sh-labelled task is refused for the digest [@implemented] → `tests/evidence-chain.test.mjs::a sh-labelled Acceptance the writer recorded is digest-checked by adr-lint, not skipped` cmd:`node --test --test-name-pattern 'digest-checked by adr-lint, not skipped' tests/evidence-chain.test.mjs`

```gherkin
Given the same task after every acceptance-sha256 in it is changed by one hex digit
When adr-lint runs
Then it exits 1
And it says no exit-0 entry carries the current Acceptance digest
```

### UC4-S3 [failure] a fence no gate runs is a finding that names its opener [@implemented] → `tests/evidence-chain.test.mjs::a sh-labelled Acceptance the writer recorded is digest-checked by adr-lint, not skipped` cmd:`node --test --test-name-pattern 'digest-checked by adr-lint, not skipped' tests/evidence-chain.test.mjs`

```gherkin
Given a task whose Acceptance fence opens with ```python
When adr-lint runs
Then it exits 1
And it says the Acceptance has no runnable fence (```bash, ```sh or ```shell)
And it says the fence opens with ```python
```

### UC4-S4 [happy] adr-next reads the fence adr-verify ran, whatever the opener [@implemented] → `tests/adr-next.test.mjs::a sh-labelled Acceptance fence adr-verify recorded is done to adr-next` cmd:`node --test --test-name-pattern 'sh Acceptance fence adr-verify recorded' tests/adr-next.test.mjs`

```gherkin
Given a task whose Acceptance fence opens with ```sh, ```shell or ```bash followed by spaces
When adr-verify records an exit-0 run
And adr-next --all --json reads the directory
Then the task is listed under done
And a task whose fence opens with ```python is refused by adr-verify and is not done
```

### UC5-S1 [failure] a gate with fence.py but no record.py says so and exits with its could-not-run code [@implemented] → `tests/gates.test.mjs::a gate copied without plugin/lib says so and exits with its could-not-run code; with lib/ beside it, it runs` cmd:`node --test --test-name-pattern 'a gate copied without plugin/lib says so' tests/gates.test.mjs`

```gherkin
Given each gate copied into a bin/ with a lib/ beside it holding every module it loads BEFORE the one under test
When it is run with --version
Then it exits with the could-not-run code its own Exit block names — 4 for adr-verify, spec-verify and qh-mcp, 2 for the record-only gates
And stderr is exactly one line naming the missing module and the directory looked in
And stdout is empty and there is no traceback
And the same gate with the whole lib/ beside it exits 0
```

### UC5-S2 [happy] a gate reached through a symlink loads the lib beside its real file [@implemented] → `tests/gates.test.mjs::a gate reached through a symlink loads the lib beside its real file, not beside the link` cmd:`node --test --test-name-pattern 'reached through a symlink loads the lib' tests/gates.test.mjs`

```gherkin
Given a symlink to a gate in a temporary bin/ with no lib/ anywhere near it
When the link is run with --version from that directory
Then it exits 0
And a copy of the gate in the same place exits with the gate's could-not-run code
```

### UC6-S1 [failure] a repeated ## Acceptance is refused by the writer and blocked by the verifier [@implemented] → `tests/evidence-chain.test.mjs::a repeated ## Acceptance is refused by adr-verify and blocked by adr-lint; another repeat is advice` cmd:`node --test --test-name-pattern 'a repeated ## Acceptance is refused' tests/evidence-chain.test.mjs`

```gherkin
Given a task with two ## Acceptance sections
When adr-verify runs it
Then it exits 2 saying ## Acceptance appears more than once, and writes no entry
When adr-lint runs
Then it exits 1 with the same finding as a blocking line
```

### UC6-S2 [happy] any other repeated heading is advice, and a clean record says nothing [@implemented] → `tests/evidence-chain.test.mjs::a repeated ## Acceptance is refused by adr-verify and blocked by adr-lint; another repeat is advice` cmd:`node --test --test-name-pattern 'a repeated ## Acceptance is refused' tests/evidence-chain.test.mjs`

```gherkin
Given a task with two ## Risks sections, and an ADR with two ## Context sections
When adr-lint runs each
Then it exits 0 and prints an advice line naming the repeated heading
And on the unmodified fixture it prints no line about a repeat
```

### UC7-S1 [happy] an entry is appended after a fenced ## line, never inside the fence [@implemented] → `tests/evidence-chain.test.mjs::an entry is appended after a fenced ## line in the Verification Log, not inside the fence` cmd:`node --test --test-name-pattern 'appended after a fenced ## line' tests/evidence-chain.test.mjs`

```gherkin
Given a Verification Log holding an exit-1 row and a fenced excerpt whose first line begins "## "
When adr-verify --human appends an entry
Then the entry is the last line of the section and the excerpt is intact and first
And a task with no ## Verification Log is still refused with the add-a-heading sentence
```

### UC7-S2 [happy] --steps sees a step declared after a fenced ## line [@implemented] → `tests/evidence-chain.test.mjs::--steps sees a step declared after a fenced ## line in Ordered Steps` cmd:`node --test --test-name-pattern 'sees a step declared after a fenced' tests/evidence-chain.test.mjs`

```gherkin
Given Ordered Steps declaring [S1], then a fenced block containing "## ", then [S2]
When adr-verify --steps S2 runs
Then it exits 0 and the row carries steps:S2
And --steps S9 is refused naming S1 and S2 as declared
```

### UC7-S3 [failure] a claim after a fenced ## line stays in the sweep's denominator [@implemented] → `tests/sweep.test.mjs::a claim written after a fenced ## line in the Verification Log is still a claim` cmd:`node --test --test-name-pattern 'fenced ## line in the Verification Log is still a claim' tests/sweep.test.mjs`

```gherkin
Given a Verification Log holding an exit-1 row, a fenced excerpt beginning "## ", then an exit-0 claim
When adr-verify --sweep --json runs
Then claims is 1 and held is 1
And the same log without the exit-0 row reports 0 claims
```

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

### UC2-S2 [failure] a gate copied without lib/ says so and exits with its could-not-run code [@implemented] → `tests/gates.test.mjs::a gate copied without plugin/lib says so and exits with its could-not-run code; with lib/ beside it, it runs` cmd:`node --test --test-name-pattern 'a gate copied without plugin/lib says so' tests/gates.test.mjs`

```gherkin
Given a gate copied into a directory whose bin/ has no lib/ beside it
When it is run
Then it exits with the could-not-run code its own Exit block names (2 for the record-only gates; F-5 amended the "exits 2" this scenario first said) with one sentence naming plugin/lib/record.py and the directory it looked in
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
| F-4 | Accepted 2026-09-11 (Codex review, HIGH; CLAUDE.md §16). Current at `01cb598`: the Acceptance fence opener is three regexes — adr-verify:446 `bash\|sh\|shell\s*\n`, adr-lint:1654 (the digest path) `bash\s*\n`, adr-next:237 `bash\n`. Reproduced on a ```sh task: adr-verify wrote a `done` row; adr-lint reported "no ```bash fence" and, with `acc_all == ""`, skipped the whole digest block, so a forged digest produced byte-identical output. After: `record.ACCEPTANCE_FENCE = ```(?:bash\|sh\|shell)\s*\n(.*?)```` is the one opener — bash, sh, shell, optional trailing whitespace, the bytes adr-verify and adr-lint's `ACCEPTANCE_FENCE` already carried — imported by adr-verify (recorder and sweep), adr-lint (fence check, digest path, human-mutant advisory) and adr-next; adr-lint's fence check names the opener it found when none is runnable; no gate defines an opener regex (the one-module test refuses the shape). Class: `rg -n 'bash' plugin/bin/*` — every regex hit named in T3. Why it can fail: a private opener returns; the fence check goes silent and `acc_all` is `""` for a fence that exists. | `tests/evidence-chain.test.mjs::a sh-labelled Acceptance the writer recorded is digest-checked by adr-lint, not skipped` | @implemented | `node --test --test-name-pattern 'digest-checked by adr-lint, not skipped' tests/evidence-chain.test.mjs` |
| F-5 | Accepted 2026-09-11 (Codex review, MEDIUM ×2; ADR-005). Current at `01cb598`: adr-verify:155 and spec-verify:65's `record.py`-absent branch is reachable by no test (the no-lib fixture lacks both libs, so the `fence.py` check fires first), `mutations.json` guards only adr-next's and adr-lint's `isfile`, and every lib-absent exit is 2 — which spec-verify:14 documents as "bound test missing", adr-verify:87 as "usage, authoring, or transaction problem", adr-lint:35 as "usage": a finding's code, or a code sending the caller to the wrong remedy. After: could-not-load exits the gate's OWN could-not-run code — 4 in adr-verify, spec-verify and qh-mcp (the could-not-look code the first two already had; new in qh-mcp), 2 in adr-lint, adr-next, arch-lint, adr-debt, adr-retire-check (their Exit blocks reserve 2 for "nothing was checked") — for `fence.py` and `record.py` alike; every Exit block says so in words; one line on stderr, nothing on stdout, no traceback. The test copies every lib a gate loads BEFORE the one under test, so each branch is reached; a symlink probe binds `realpath(__file__)` behaviourally; `check-attr` is asked in a repository the test creates (CLAUDE.md §9). Why it can fail: an `isfile` guard removed is a traceback; a code changed disagrees with the Exit block the test reads. | `tests/gates.test.mjs::a gate copied without plugin/lib says so and exits with its could-not-run code; with lib/ beside it, it runs` | @implemented | `node --test --test-name-pattern 'a gate copied without plugin/lib says so' tests/gates.test.mjs` |
| F-6 | Accepted 2026-09-11 (Codex review, MEDIUM; owner's decision: define it). Current at `01cb598`: `sections_of` keeps the LAST of a repeated `## ` heading; the adr-verify regex it replaced kept the first; adr-next's old `sections` merged both; no gate reports the repeat. After: `record.repeated_headings(text)` names every heading that repeats outside a fence, from the same walk `sections_of` uses; adr-lint blocks a repeated `## Acceptance` (`errors.append`, the severity of the no-fence check — two fences, one digest) and advises any other repeat in a task or an ADR (`errors.advise`, the severity of a missing section); adr-verify refuses to run or write against a task with any repeated heading (exit 2, authoring). Last-wins stays the documented reading so that until the record is fixed every gate reads the same body. Why it can fail: the check is removed; a fenced `## ` is counted as a repeat. | `tests/evidence-chain.test.mjs::a repeated ## Acceptance is refused by adr-verify and blocked by adr-lint; another repeat is advice` | @implemented | `node --test --test-name-pattern 'a repeated ## Acceptance is refused' tests/evidence-chain.test.mjs` |
| F-7 | Accepted 2026-09-11 (BACKLOG §197, closed). Current at `01cb598`: adr-verify:667 `append_entry`, :1673 `declared_steps`, :1984 `claims_in` read a section with `(?=^## \|\Z)` — the fence-blind class T1 removed from the two Acceptance readers. The Verification Log is where a fenced excerpt lives (a failed run's last lines), so the writer appended the next entry INSIDE such a fence and the sweep dropped every claim after it. After: `record.section_span(text, heading)` gives `(start, body_start, end)` from the same walk as `sections_of` (last-wins on a repeat, identical to the reader); `append_entry` splices by it and keeps the blank lines after the heading byte for byte; `declared_steps` and `claims_in` read through `sections_of`. `rg -n '\(\?=\^## \|\\Z\)' plugin/bin` finds nothing and the one-module test refuses the shape. Docstrings state what `splitlines()` does to the eight non-CR/LF separators (adr-verify:20 said "command content is otherwise preserved", which was false). Why it can fail: any of the three regexes returns — each has its own regression and catalogue entry. | `tests/evidence-chain.test.mjs::an entry is appended after a fenced ## line in the Verification Log, not inside the fence` | @implemented | `node --test --test-name-pattern 'appended after a fenced ## line' tests/evidence-chain.test.mjs` |
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
- adr-verify's other three `(?=^## |\Z)` readers (adr-verify:666 `append_entry`'s section finder, :1672 Ordered Steps, :1983 Verification Log) — siblings of the same class, left for the backlog with this enumeration; they do not decide a digest. *2026-09-11: pulled into scope as F-7 / UC-7 after the Codex review; the line above is left as written.*
- adr-next's ```bash-only fence match (adr-verify also reads ```sh / ```shell) — a different disagreement, not this spec. *2026-09-11: pulled into scope as F-4 / UC-4 — the review showed adr-lint's digest path had the same narrowing, and that it failed open; the line above is left as written.*
- Making `sections_of` source-preserving for the eight non-CR/LF separators `str.splitlines()` recognises (VT, FF, FS, GS, RS, NEL, LS, PS). Owner's decision 2026-09-11: document what the reader does (F-7), do not change the bytes adr-lint has hashed since the digest existed. The shipped corpus has no such separator (Codex probe, 137 tasks).
- Catching a `record.py` that exists but raises on import (a partially-written copy): a traceback and exit 1 today. Named by the review as residual; not a finding this spec fixes.
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
| 5 | Which openers are runnable, and where is that decided? (Codex review 2026-09-11, HIGH) | F-4 | `bash`, `sh`, `shell`, optional trailing whitespace — the set adr-verify and adr-lint's `ACCEPTANCE_FENCE` already carried — decided once in `record.py`. Probed before the fix: a ```sh `done` row passed adr-lint with a forged digest. |
| 6 | What code does a gate exit when it cannot load a shared module? (Codex review, MEDIUM; ADR-005) | F-5 | The gate's own could-not-run code, read from its Exit block: 4 where 2 is a finding (adr-verify, spec-verify) or usage with no could-not-run code (qh-mcp); 2 where the block already reserves it for "nothing was checked". Owner's decision: distinct from every finding code, per gate. |
| 7 | Is a repeated `## Acceptance` defined? (Codex review, MEDIUM) | F-6 | Owner's decision: define it. Reported, never resolved: adr-lint blocks a repeated Acceptance and advises other repeats; adr-verify refuses. Last-wins stays the documented reading so the gates agree until the record is fixed. |
| 8 | Are the three remaining `(?=^## \|\Z)` readers the same class? (BACKLOG §197) | F-7 | Yes — every one reads a section and stops at a fenced `## `. All three move to the shared grammar with their own regressions; the writer's span comes from the reader's walk. |
