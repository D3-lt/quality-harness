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

### UC-8: the writer supplies the line break a heading at end-of-file left out

Added 2026-09-11 after the second Codex review (MEDIUM, introduced by T6): `append_entry` splices by `section_span`, and a `## Verification Log` that is the file's last line with no line break has a span whose head ends at the heading text. Reproduced: `--human` wrote `## Verification Log- 2026-…` — one line, no section, exit 0. The regex T6 replaced required `\n` after the heading and refused the file.

- **Trigger:** `adr-verify --human` (or any recording path) on a task whose target heading is the file's last line with no terminator · **Preconditions:** LF or CRLF file
- **Main flow:**
  1. The writer adds the missing break in `\n` form after the heading and appends the entry on its own line; `write_source` spells the file's own line ending back.
  2. `sections_of` on the written file reads the entry INSIDE the section.
- **Failure paths:**
  - a. the break is not added → the glued line is not a heading to any reader, and the evidence is silently outside every section (the live defect).
- **Postconditions:** the heading keeps the file's own line ending; the entry is in the section the grammar reads.

### UC-9: a quoted line cannot toggle the grammar, and an open fence is reported

Added 2026-09-11 after the second Codex review (A): adr-verify quotes a failed run's last lines inside an indented ``` fence. A bound test that printed one ``` line put three fence lines into the log; the walk went out of phase, `## Mutation Log` became text, and the next `--human` entry landed under it with exit 0. Reproduced on a fence whose command prints `chr(96)*3`.

- **Trigger:** a run whose output holds a line whose first non-blank characters are ``` or ~~~; separately, a record whose fence never closes · **Preconditions:** none
- **Main flow:**
  1. `record.fence_safe(line)` spells such a line with a backslash before the marker; `excerpt_fence` — the one place adr-verify writes a fence into a record — passes every quoted line through it.
  2. `record.unterminated_fence(text)` names the line and opener of a fence still open at end of text, from the same walk as `sections_of`.
  3. adr-verify refuses to run or write against a task with an open fence (exit 2); adr-lint blocks a task on it and advises an ADR; adr-next carries it as the task's `unproven` note.
- **Failure paths:**
  - a. the writer stops escaping → the excerpt toggles the grammar and the next entry lands under the wrong heading (the live defect).
  - b. the open fence is resolved silently → every heading after it is text and no gate says so.
- **Postconditions:** the next entry is read back in the Verification Log by `sections_of`; a hand-left open fence is refused, blocked, advised and noted, by line.

### UC-10: an unrunnable opener is named whole

Added 2026-09-11 after the second Codex review (LOW): adr-lint captured the opener to its first token, so ```bash title=x was reported as "opens with ```bash" — the part that is fine — and the rejected `title=x` was the one thing left out.

- **Trigger:** an Acceptance whose first fence line is not a runnable opener · **Preconditions:** none
- **Main flow:**
  1. adr-lint names the whole first fence line, trimmed, through `record.first_fence_line`.
- **Failure paths:**
  - a. the capture stops at whitespace → the author is shown a line that is not the one rejected.
- **Postconditions:** ```bash title=x, ~~~bash and ```BASH are each named as written.

### UC-11: one fence grammar

Added 2026-09-11 after the second Codex review (MEDIUM): the section walk toggled on any line whose first non-blank characters were ```, while the runnable opener was an unanchored regex over the section text — two grammars for the same three characters. Measured: `prose ```bash` ran; a ````bash opener matched from its second backtick; an inner ```bash inside a four-backtick fence ran; `echo '```'` ran as `echo '`; a ~~~-fenced `## Acceptance` was a second heading.

- **Trigger:** any gate reads a record · **Preconditions:** none
- **Main flow:**
  1. A fence line is three or more ``` or ~~~ after any leading blanks (`record._FENCE`); an opener's info string follows the marker; a closer has nothing after it and matches the same marker at least as long; a backtick opener whose info string holds a backtick is not an opener (CommonMark).
  2. `sections_of`, `section_span`, `repeated_headings`, `unterminated_fence`, `fence_safe`, `acceptance_fence` and `first_fence_line` are views of that one grammar. The runnable opener is a LINE: backticks, exactly `bash`, `sh` or `shell`, optional trailing blanks; the body runs to the matching closer; example fences before it are walked over.
  3. adr-verify, adr-lint and adr-next find the fence with `acceptance_fence` and nothing else; `ACCEPTANCE_FENCE` no longer exists.
- **Failure paths:**
  - a. a second grammar returns → the one-module test refuses the shape; the probe's edge cases disagree.
  - b. a digest of an existing fence changes → forbidden; recomputed over every tracked record before the change: 222 files, 97 digests, 0 differences.
- **Postconditions:** the three CLIs agree on ```bash title=x, ```BASH, ~~~bash, a four-backtick outer with an inner ```bash, an unterminated fence and an indented ```bash.

### UC-12: only CR, LF and CRLF break a line

Added 2026-09-11 after the second Codex review (MEDIUM), reversing the Non-Goal below: `str.splitlines()` also breaks on VT, FF, FS, GS, RS, NEL, LS and PS, so a heading holding one read as two lines — the second possibly a heading, manufacturing the repeated-heading block of UC-6 out of one line — and a command holding one was hashed with the byte turned into `\n`.

- **Trigger:** any gate reads a record · **Preconditions:** none
- **Main flow:**
  1. `record.split_lines(text)` yields `(line, start, end)` on `\r\n`, `\r`, `\n` and nothing else; the walk and `acceptance_fence` read through it.
  2. A heading holding any of the eight is one heading with the byte in its name; a command holding one reaches the digest as the bytes it is.
- **Failure paths:**
  - a. `splitlines()` returns → the probe shows a heading split and a repeat manufactured.
  - b. a digest of an existing fence changes → forbidden; recomputed over every tracked record: 0 differences (the corpus holds none of the eight).
- **Postconditions:** adr-verify's `--help` and every docstring that described `splitlines()` describe this.

### UC-13: a closer rest is ASCII space and tab only

Added 2026-09-12 after the third Codex review (LOW): `_fence_closes` used `.strip()`, so NEL, NBSP and the other Unicode whitespace counted as "nothing after the marker" and closed a fence T11 says is still one line. `_RUNNABLE_INFO` already allowed only `[ \t]*` after a language label.

- **Trigger:** a gate reads a fence closer · **Preconditions:** a fence is open
- **Main flow:**
  1. `_fence_closes` treats a line as a closer only when the rest is ASCII space and tab (`re.fullmatch(r"[ \t]*", rest)`).
  2. ``` and ```\\t close; ```\\x85 and ```\\xa0 do not; `first_fence_line` trims only those same bytes.
- **Failure paths:**
  - a. `.strip()` returns → a NEL after the marker closes the fence and a following `## ` is a heading.
  - b. a digest of an existing fence changes → forbidden; recomputed over every tracked record: 0 differences.
- **Postconditions:** corpus digest-diff vs the `.strip()` closer is 0.

### UC-14: adr-lint's Exit block names the exits it produces

Added 2026-09-12 after the third Codex review (LOW): the header claimed exit 2 for "unknown flag, no record named"; measured `--bogus`, no args, and a missing file are 1; only lib-missing (and not-recognised) is 2.

- **Trigger:** a reader of adr-lint's Exit block, or a caller that keys on the code · **Preconditions:** none
- **Main flow:**
  1. Code 1's own clause names an unknown flag, no record named, and a missing file.
  2. Code 2's own clause is could-not-run and names `plugin/lib/record.py` (and not-recognised).
- **Failure paths:**
  - a. the header puts unknown flag / no record named on 2 → a caller that keys on 2 treats a usage miss as could-not-run.
- **Postconditions:** `--bogus`, no args, and a missing file exit 1; lib-missing stays 2.

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

### UC8-S1 [happy] an entry under a heading that ends the file lands in the section [@implemented] → `tests/evidence-chain.test.mjs::an entry appended under a heading that ends the file without a line break lands in the section, on its own line` cmd:`node --test --test-name-pattern 'ends the file without a line break' tests/evidence-chain.test.mjs`

```gherkin
Given a task whose "## Verification Log" is the last line of the file with no line break, in LF and in CRLF
When adr-verify --human appends an entry
Then the heading keeps the file's own line ending and the entry is on its own line
And sections_of reads the entry inside "Verification Log"
And a glued "## Verification Log- …" line is not a heading to sections_of
```

### UC8-S2 [failure] the glued line the old splice produced is not a heading [@implemented] → `tests/evidence-chain.test.mjs::an entry appended under a heading that ends the file without a line break lands in the section, on its own line` cmd:`node --test --test-name-pattern 'ends the file without a line break' tests/evidence-chain.test.mjs`

```gherkin
Given a task carrying the line "## Verification Log- 2026-09-01 · human-observed · glued"
When sections_of reads it
Then there is no "Verification Log" section — which is why the corruption was silent
```

### UC9-S1 [happy] a printed fence line is written escaped and the next entry lands in the log [@implemented] → `tests/evidence-chain.test.mjs::a run that prints a fence line is quoted so the excerpt cannot toggle the grammar; an unclosed fence is refused and blocked` cmd:`node --test --test-name-pattern 'cannot toggle the grammar' tests/evidence-chain.test.mjs`

```gherkin
Given a task whose Acceptance prints a ``` line and exits 1, with a "## Mutation Log" after the Verification Log
When adr-verify records the run and then --human appends an entry
Then the printed line is written as "  \```" inside the excerpt
And sections_of reads the new entry in "Verification Log" and "Mutation Log" holds only its own row
```

### UC9-S2 [failure] an open fence is refused, blocked, advised and noted by line [@implemented] → `tests/evidence-chain.test.mjs::a run that prints a fence line is quoted so the excerpt cannot toggle the grammar; an unclosed fence is refused and blocked` cmd:`node --test --test-name-pattern 'cannot toggle the grammar' tests/evidence-chain.test.mjs && node --test --test-name-pattern 'code fence never closes' tests/adr-next.test.mjs`

```gherkin
Given a task with a fence somebody left open, and an ADR with a ~~~ fence left open
When adr-verify --human runs the task
Then it exits 2 naming the fence's line and writes nothing
When adr-lint runs each
Then the task is blocked and the ADR is advised, each naming the line and the opener
When adr-next reads the task
Then it is READY with an unproven note naming the open fence, and a closed fence carries no such note
```

### UC9-S3 [failure] the grammar names the open fence and spells a quoted line safe [@implemented] → `tests/gates.test.mjs::record.py: an unclosed fence is named by line, a tilde fence is a fence, and fence_safe spells a fence line so it cannot toggle` cmd:`node --test --test-name-pattern 'an unclosed fence is named by line' tests/gates.test.mjs`

```gherkin
Given plugin/lib/record.py loaded on its own
When unterminated_fence reads a closed document and an open one
Then the closed one is None and the open one is its 1-based line and opener text
And a ~~~-fenced "## " line is text like a ```-fenced one
And fence_safe escapes "  ```", "~~~x" and a tab-indented ```bash, and leaves other lines alone
```

### UC10-S1 [failure] an attributed or tilde opener is named whole [@implemented] → `tests/evidence-chain.test.mjs::a sh-labelled Acceptance the writer recorded is digest-checked by adr-lint, not skipped` cmd:`node --test --test-name-pattern 'digest-checked by adr-lint, not skipped' tests/evidence-chain.test.mjs`

```gherkin
Given a task whose Acceptance opens with "```bash title=x  " and one whose fence is ~~~bash
When adr-lint runs each
Then it exits 1 saying the fence opens with ```bash title=x, and with ~~~bash, respectively
And never "opens with ```bash,"
```

### UC10-S2 [happy] a runnable opener is not named, and the row it recorded is accepted [@implemented] → `tests/evidence-chain.test.mjs::a sh-labelled Acceptance the writer recorded is digest-checked by adr-lint, not skipped` cmd:`node --test --test-name-pattern 'digest-checked by adr-lint, not skipped' tests/evidence-chain.test.mjs`

```gherkin
Given a task whose Acceptance opens with ```sh, ```shell or ```bash followed by spaces
When adr-verify records it and adr-lint runs
Then adr-lint exits 0 and says nothing about a fence
```

### UC11-S1 [happy] the fence edges, each against the one grammar [@implemented] → `tests/gates.test.mjs::record.py: the opener is bash, sh or shell; a repeated heading is named; a span is where the reader reads` cmd:`node --test --test-name-pattern 'record.py: the opener is bash' tests/gates.test.mjs`

```gherkin
Given plugin/lib/record.py loaded on its own
When acceptance_fence reads ```bash title=x, ```BASH, ~~~bash, "see ```bash", an indented ```bash, an inner ```bash inside a ```` fence, a ````bash fence with a ``` line inside, an open fence, a command holding a ``` line, an example fence before the real one, and a ``` line inside a ~~~ fence
Then only the indented, four-backtick, command-holding, after-example and tilde-then-bash cases have a body, and each body is exactly the lines between opener and matching closer
And a line whose info string holds a backtick is not a fence, so the heading after it is a heading
And first_fence_line names ```bash title=x and ~~~bash whole and trimmed
```

### UC11-S2 [failure] every gate finds the fence through one function [@implemented] → `tests/gates.test.mjs::the record grammar is one module: every gate loads plugin/lib/record.py and none keeps a copy` cmd:`node --test --test-name-pattern 'the record grammar is one module' tests/gates.test.mjs`

```gherkin
Given the gates under plugin/bin
When their sources are scanned
Then no gate carries an opener regex or a fence-blind section reader
And the scan matches those shapes when present
```

### UC12-S1 [happy] a heading holding a form feed is one heading and a NEL reaches the digest [@implemented] → `tests/gates.test.mjs::record.py: only CR, LF and CRLF break a line — a heading holding a form feed is one heading and a NEL reaches the digest` cmd:`node --test --test-name-pattern 'only CR, LF and CRLF break a line' tests/gates.test.mjs`

```gherkin
Given plugin/lib/record.py loaded on its own
When a heading holds each of VT, FF, FS, GS, RS, NEL, LS, PS
Then it is one heading with the byte in its name and no repeat is manufactured
And CR, LF and CRLF do break a line and do manufacture the repeat
And a NEL inside the Acceptance fence is in the normalized text and the digest is sha256 of exactly those bytes
```

### UC12-S2 [failure] the three real breaks do split, and do manufacture the repeat [@implemented] → `tests/gates.test.mjs::record.py: only CR, LF and CRLF break a line — a heading holding a form feed is one heading and a NEL reaches the digest` cmd:`node --test --test-name-pattern 'only CR, LF and CRLF break a line' tests/gates.test.mjs`

```gherkin
Given "## A" followed by "## A" separated by CR, by LF and by CRLF
When sections_of and repeated_headings read each
Then each is two lines and "A" is reported repeated — so the splitter is shown able to split
```

### UC13-S1 [happy] a bare closer and a tab closer still close [@implemented] → `tests/gates.test.mjs::record.py: a closer rest is only ASCII space and tab — NEL does not close a fence` cmd:`node --test --test-name-pattern 'a closer rest is only ASCII space and tab' tests/gates.test.mjs`

```gherkin
Given an Acceptance fence closed by ``` or by ``` then a tab
When sections_of and acceptance_fence read it
Then the body is the command and the next ## is a heading
And every tracked docs/adr record has the same digest as under the .strip() closer
```

### UC13-S2 [failure] NEL or NBSP after the marker does not close [@implemented] → `tests/gates.test.mjs::record.py: a closer rest is only ASCII space and tab — NEL does not close a fence` cmd:`node --test --test-name-pattern 'a closer rest is only ASCII space and tab' tests/gates.test.mjs`

```gherkin
Given an Acceptance fence whose closer rest is NEL or NBSP
When sections_of and acceptance_fence read it
Then the fence stays open, there is no runnable body, and the next ## is text
```

### UC14-S1 [happy] measured usage misses exit 1 and the header's code-1 clause names them [@implemented] → `tests/gates.test.mjs::adr-lint's Exit block names the exits it actually produces` cmd:`node --test --test-name-pattern "adr-lint's Exit block names the exits it actually produces" tests/gates.test.mjs`

```gherkin
Given the working-tree adr-lint
When it is invoked with --bogus, with no record, and with a missing file
Then each exits 1
And the Exit block's code-1 clause names unknown flag, no record named, and a missing file
```

### UC14-S2 [failure] the header that put those misses on 2 is refused [@implemented] → `tests/gates.test.mjs::adr-lint's Exit block names the exits it actually produces` cmd:`node --test --test-name-pattern "adr-lint's Exit block names the exits it actually produces" tests/gates.test.mjs`

```gherkin
Given the Exit block
When code 2's own clause is read
Then it says could-not-run and names plugin/lib/record.py
And it does not name unknown flag or no record named
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
| F-8 | Accepted 2026-09-11 (second Codex review, MEDIUM; introduced by T6). Current at `1739425`: `append_entry` splices by `section_span`; a `## Verification Log` that is the file's last line with no line break has a head ending at the heading text, and the entry was written onto it — `## Verification Log- 2026-…`, no section, exit 0. The regex T6 replaced refused the file. After: the writer adds the missing break in `\n` form; `write_source` spells CRLF back; the entry is read back IN the section by `sections_of`; a glued line is shown not to be a heading. Why it can fail: the break is not added. | `tests/evidence-chain.test.mjs::an entry appended under a heading that ends the file without a line break lands in the section, on its own line` | @implemented | `node --test --test-name-pattern 'ends the file without a line break' tests/evidence-chain.test.mjs` |
| F-9 | Accepted 2026-09-11 (second Codex review, A). Current at `1739425`: adr-verify wrote a failed run's tail inside an indented ``` fence with no neutralising; a test that printed one ``` line put three fence lines into the log, the walk went out of phase, and the next entry landed under `## Mutation Log` with exit 0. After: `record.fence_safe` escapes a fence line's marker with a backslash and `excerpt_fence` is the one writer of a fence into a record; `record.unterminated_fence` names an open fence by line from the same walk; adr-verify refuses (exit 2), adr-lint blocks a task and advises an ADR, adr-next carries it as the `unproven` note. Why it can fail: the escaping is dropped; the refusal, block or note is removed; the name returns None. | `tests/evidence-chain.test.mjs::a run that prints a fence line is quoted so the excerpt cannot toggle the grammar; an unclosed fence is refused and blocked` | @implemented | `node --test --test-name-pattern 'cannot toggle the grammar' tests/evidence-chain.test.mjs` |
| F-10 | Accepted 2026-09-11 (second Codex review, LOW). Current at `1739425`: adr-lint:1472 `^[ \t]*```(\S*)` named ```bash title=x as "opens with ```bash". After: `record.first_fence_line` returns the whole first fence line trimmed and adr-lint prints it; ~~~bash and ```BASH are named the same way. Why it can fail: the capture stops at the first token. | `tests/evidence-chain.test.mjs::a sh-labelled Acceptance the writer recorded is digest-checked by adr-lint, not skipped` | @implemented | `node --test --test-name-pattern 'digest-checked by adr-lint, not skipped' tests/evidence-chain.test.mjs` |
| F-11 | Accepted 2026-09-11 (second Codex review, MEDIUM). Current at `1739425`: two fence grammars — the walk's line-start ``` toggle and `ACCEPTANCE_FENCE`, an unanchored regex over the section text: `prose ```bash` ran, ````bash matched from its second backtick, an inner ```bash inside a ```` fence ran, `echo '```'` ran as `echo '`, a ~~~-fenced heading was a heading. After: `record._FENCE` (three or more ``` or ~~~ after leading blanks; closer same marker, at least as long, nothing after; a backtick info string holding a backtick is not an opener) and every reader a view of it; `acceptance_fence(section)` walks fence to fence and returns the body of the first backtick opener labelled exactly bash/sh/shell; `first_fence_line`; `ACCEPTANCE_FENCE` deleted; three gates call the function. Digests recomputed over every tracked record: 222 files, 97 digests, 0 differences. Probed through three CLIs on six edges: identical. Why it can fail: a closer ignores length or marker or trailing text; a tilde fence runs; the inline-code rule is dropped; a gate grows a private regex. | `tests/gates.test.mjs::record.py: the opener is bash, sh or shell; a repeated heading is named; a span is where the reader reads` | @implemented | `node --test --test-name-pattern 'record.py: the opener is bash' tests/gates.test.mjs` |
| F-12 | Accepted 2026-09-11 (second Codex review, MEDIUM; the Non-Goal below reversed — the owner said no edges). Current at `1739425`: `str.splitlines()` in the walk; a heading holding VT, FF, FS, GS, RS, NEL, LS or PS read as two lines and could manufacture a repeated heading (a T5 block) from one line; a command holding one was hashed with the byte turned to `\n`. After: `record.split_lines` on `\r\n`, `\r` and `\n` only, used by the walk and `acceptance_fence`; the eight are bytes; docstrings and adr-verify `--help` say so. Digests recomputed over every tracked record: 0 differences. Why it can fail: the eight return to the splitter. | `tests/gates.test.mjs::record.py: only CR, LF and CRLF break a line — a heading holding a form feed is one heading and a NEL reaches the digest` | @implemented | `node --test --test-name-pattern 'only CR, LF and CRLF break a line' tests/gates.test.mjs` |
| F-3 | Accepted. Current: adr-lint:3445 `tracked_paths` = `git ls-files` ∪ `git ls-files --others --exclude-standard` (a file being added counts, ADR-011 / ADR-017); arch-lint:279 `tracked_paths` = `git ls-files --cached` only, refusing `--others` because it admits a file that exists only on this laptop. Same name, opposite membership, both citing CLAUDE.md §8. After: adr-lint's is `tracked_or_unignored_paths` — tracked, or on disk and not ignored, which is exactly what its two `ls-files` calls answer; arch-lint's keeps `tracked_paths`, because `--cached` is the index and the index is what "tracked" means to git (a staged file is tracked; `committed_paths` would be false for it). Both bodies unchanged; every call site and the comment at adr-lint:3715 renamed. Why it can fail: the rename alters membership; a call site keeps the old name; the two listings agree on an untracked file. | `tests/gates.test.mjs::adr-lint's tracked_or_unignored_paths includes an untracked file; arch-lint's tracked_paths excludes it` | @implemented | `node --test --test-name-pattern "adr-lint's tracked_or_unignored_paths includes an untracked file" tests/gates.test.mjs` |
| F-13 | Accepted 2026-09-12 (third Codex review, LOW). Current: `_fence_closes` used `.strip()`, so NEL / NBSP / other Unicode whitespace closed a fence T11 says is one line. After: closer rest is `[ \\t]*` only, matching `_RUNNABLE_INFO`; ``` and ```\\t close; ```\\x85 and ```\\xa0 do not. Corpus digest-diff vs the `.strip()` closer over tracked `docs/adr/**/*.md` is 0. Why it can fail: `.strip()` returns. | `tests/gates.test.mjs::record.py: a closer rest is only ASCII space and tab — NEL does not close a fence` | @implemented | `node --test --test-name-pattern 'a closer rest is only ASCII space and tab' tests/gates.test.mjs` |
| F-14 | Accepted 2026-09-12 (third Codex review, LOW). Current: adr-lint's Exit header claimed 2 for "unknown flag, no record named"; measured `--bogus`, no args, missing file are 1; only lib-missing (and not-recognised) is 2. After: the header's code-1 clause names those three; code 2 stays could-not-run + `plugin/lib/record.py`. Measured exits unchanged. Why it can fail: the header puts a usage miss on 2 and a caller that keys on 2 treats it as could-not-run. | `tests/gates.test.mjs::adr-lint's Exit block names the exits it actually produces` | @implemented | `node --test --test-name-pattern "adr-lint's Exit block names the exits it actually produces" tests/gates.test.mjs` |

## Domain

**record grammar** = how a gate finds a `## ` section (fence-aware: a line starting with ``` toggles a fence, and a heading inside a fence is text) — *amended 2026-09-11 (UC-11, UC-12): a fence line is three or more ``` or ~~~ after leading blanks, closed only by the same marker at least as long with nothing after it; only CR, LF and CRLF break a line*, how it normalizes an Acceptance fence (line endings to `\n`, blank lines trimmed at the fence edges only), and how it hashes it (sha256 of the utf-8 normalized text). **loaded by path** = `importlib.util.spec_from_file_location` on `<dirname(dirname(realpath(__file__)))>/lib/<module>.py`, the `fence.py` idiom; never `sys.path`, never cwd. **copy** = a `def` of one of the three names in a gate. **tracked_or_unignored_paths** = `ls-files` ∪ `ls-files --others --exclude-standard`. **tracked_paths** (arch-lint) = `ls-files --cached`. **could-not-run** = exit 2 with a sentence, never a traceback (ADR-005).

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
- Making `sections_of` source-preserving for the eight non-CR/LF separators `str.splitlines()` recognises (VT, FF, FS, GS, RS, NEL, LS, PS). Owner's decision 2026-09-11: document what the reader does (F-7), do not change the bytes adr-lint has hashed since the digest existed. The shipped corpus has no such separator (Codex probe, 137 tasks). *2026-09-11, later: reversed as F-12 / UC-12 after the second Codex review — the owner's instruction is no edges, and the earlier line recorded a session's reading, not the owner's decision; the bytes adr-lint has hashed do not change because the corpus holds none of the eight (recomputed: 0 differences). The line above is left as written.*
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
| 9 | Did T6's writer introduce a corruption the old regex refused? (second Codex review, MEDIUM) | F-8 | Yes — a heading at EOF with no break. Reproduced, fixed at the writer, read back through the grammar. |
| 10 | Can tool-written output toggle the grammar of the record it is written into? (second Codex review, A) | F-9 | It could, with one printed ``` line. Neutralised at the writer through the grammar; an open fence is reported by line by every gate, never resolved. |
| 11 | Are the walk and the runnable opener one grammar? (second Codex review, MEDIUM) | F-11 | They were two. One now, CommonMark's two markers, length-matched closers, a runnable opener that is a line. Corpus digests: 0 differences. |
| 12 | Is the `splitlines()` behaviour a documented non-goal or an edge? (second Codex review, MEDIUM) | F-12 | An edge — the owner said no edges. Three line breaks; the eight separators are bytes. Corpus digests: 0 differences. |
