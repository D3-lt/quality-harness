# Test plan — closing the gap between what the harness enforces and what it proves

**Status:** proposed, 2026-08-25. Written against `48211bd`.
Companion to `docs/BACKLOG.md` item 14 (what the adversarial review found) — that item
records defects; this one records *unproven behaviour*.

## Why this exists

A path-coverage audit classified 112 uncovered regions across the harness:

| Classification | Count | Meaning |
|---|---:|---|
| UNTESTED | 88 (30 high / 44 medium / 14 low) | reachable in production, never executed by a test |
| DEFENSIVE | 15 | correctly uncovered — see *Deliberately not covered* |
| UNREACHABLE-HERE | 7 | Windows-only; the CI `windows` job's job, not a test's |
| DEAD | 2 | one region, `hookArguments`' fall-through — **already fixed** in `48211bd` |

Exactly one genuinely dead line existed project-wide. The real gap is the 88.

The shape of the gap is worth stating plainly: **enforcement is measured at 93.83 % line
coverage; the gates enforcement depends on are measured at 63 %.** `bin/adr-verify`, the
tool the whole "the model cannot claim a task is done without evidence" premise rests on,
is the least-covered file in the repository at **47 %**.

## The rule for every row below

This project's own doctrine is *a gate that cannot fail is evidence of nothing*. A test
that cannot fail is the same thing. So every row names three fields, and a row is not
done until all three are satisfied:

1. **Assertion** — what the test claims.
2. **Killing mutation** — the specific one-line change to the source that must turn the
   test red. Apply it, watch the test fail, revert it. A row whose mutation leaves the
   suite green did not test what it says it tested.
3. **Lands in** — which file, so the harness matches the surface (see *Harnesses*).

`assert.ok(result.status === 0)` with no named mutation is the failure mode this plan
exists to prevent.

## Harnesses — use the right one, the cwd trap has bitten twice

| Surface | Harness | Why |
|---|---|---|
| `scripts/lifecycle.mjs` hooks | `tests/lifecycle.test.mjs` via `runLifecycleHook()` | It supplies an explicit `cwd` in the payload. Without it the gate falls back to `process.cwd()` and answers about *this* checkout — on a protected branch the branch gate fires first and hides the gate under test. |
| `bin/*` gates, end to end | `tests/gates.test.mjs`, `mkdtempSync` + `cpSync(fixture)` as at `tests/gates.test.mjs:77-84` | Rows that mutate task files must not mutate `tests/fixtures/ok`. |
| `bin/*` internals, function level | `tests/gate-regressions.py` via `load_script()` | Reaches helpers that no CLI invocation exercises. |
| Manifest / CI / declaration pins | `tests/package.test.mjs` | Binds config to the scripts a human runs. |

---

# Wave 0 — push, and let CI answer three open questions

Nothing has been pushed. `.github/workflows/selftest.yml` has **never executed**, so three
premises this plan would otherwise assume are claims, not results:

- Does `coverage.sh` hold its floor under `QUALITY_HARNESS_COVERAGE_STRICT=1` on Linux?
- Is the `windows` job red for the reason predicted (bare-name PATH exec of `#!` scripts)
  or for some other reason?
- **Does `claude plugin validate` work unauthenticated?** This one gates Wave 4.

**Done — run `32882955305`, 2026-08-25.** ubuntu and macOS green at 73/73; the coverage
floor holds under `STRICT=1`; and `claude plugin validate --strict` **passes with no
credentials**, so Wave 4 is CI-buildable and that job is blocking now.

The Windows prediction was **wrong**, and usefully so. The job was red for 13 tests, and
the causes were defects in the SUITE — bare-name gate spawns, `split("/")` against a `D:\…`
path, POSIX permission bits a Git for Windows checkout does not have, a POSIX path literal,
and a CRLF checkout breaking a multi-line `SKILL.md` regex. All are fixed. Until that fix
had landed the job was measuring itself, which is why the note below about the 7
UNREACHABLE-HERE regions being "the Windows job's job" only becomes true now.

---

# Wave 1 — the evidence chain — **DONE**, and it found the premise broken

**Landed `fef9d3d` + follow-up. 13 tests in `tests/evidence-chain.test.mjs`; every killing
mutation below applied and confirmed red.** `bin/adr-verify` went 47% → 83%; Python total
63% → 68%.

The first row found what the project exists to prevent: **a task marked `done` with `exit 3`
evidence linted green.** `check_verification` was correct and had never run, because
`done_task_ids` read only cell 0 of a README row and this project's index puts a number
there. Fixing it exposed a second rule that had never fired — "a fence that passes is not a
fence that can fail" — so the round-trip now runs `adr-verify --mutant` too. See
`docs/BACKLOG.md` item 18.

Deviation from the plan as written: these live in their own file rather than in
`tests/gates.test.mjs`. Thirteen tests sharing a corpus helper is a surface, not an
addendum.

# Wave 1 — the evidence chain (highest value, ~12 rows)

`bin/adr-verify` writes the Verification Log; `bin/adr-lint` and `bin/adr-next` read it.
Both halves are tested alone. If their formats drift, both suites stay green and the
anti-fabrication guarantee silently stops holding.

**Precise statement of the gap.** `tests/gate-regressions.py:48-56` already proves the two
*digest functions* agree (`verify.acceptance_digest(verify.normalize_acceptance(x)) ==
lint.acceptance_digest(lint.normalize_acceptance(x))`) and feeds a **hand-built** entry
string to `lint.check_verification`. What has never been tested is the **serialized line as
`append_entry` actually emits it** — the `·` separators, the ` …` multi-line truncation
marker, the `*` dirty-tree suffix, the placeholder strippers, the indented failure fence.
Every row below must read the file `adr-verify` wrote. Never reconstruct the string.

| # | Assertion | Killing mutation | Lands in |
|---|---|---|---|
| 1.1 | Run `adr-verify` on a fixture task, then feed **the file it wrote** to `adr-lint` with that task marked `done` in the README → exit 0 | `adr-verify:556` `acceptance-sha256:` → `acceptance-sha:` | gates |
| 1.2 | Same round-trip, then edit the Acceptance fence by one character → `adr-lint` rejects (digest no longer matches) | `adr-verify:554` `acceptance_digest(cmd)` → `acceptance_digest("")` (a constant digest still round-trips, so only the *rebuttal* half catches it) | gates |
| 1.3 | In a dirty git repo the entry's sha field is `[0-9a-f]{7,40}\*`; clean tree → no `*`; outside a repo → `no-git`. All three parse under the reader's regex | `adr-verify:379` drop the `+ ("*" if …)` suffix | gates |
| 1.4 | Acceptance exits non-zero → entry says `exit 1`, block carries an indented ```` ``` ```` fence of the last ≤10 output lines, process exits 1, and `adr-lint` **rejects** a `done` row for that task | `adr-verify:559-560` delete the `out = …` / `block += …` fence append | gates |
| 1.5 | **The anti-fabrication row.** Acceptance exits 0 but scores nothing (`pytest -k <matches-nothing>`) → recorded as `exit 0`→`exit 1` with the `[adr-verify] … scored NO tests` explanation, and the process exits 1 | `adr-verify:536` `empty = code == 0 and scored_nothing(output)` → `empty = False` | gates |
| 1.6 | The rebuttal half: output carrying a `SOMETHING_RAN` marker **and** a no-tests phrase is **not** rewritten | `adr-verify:134` delete the `SOMETHING_RAN` check | gate-regressions |
| 1.7 | A task whose Verification Log still holds the template placeholders (`<Filled during execution: …>` and the multi-line `<Tool-written by …>`) comes back with both gone and only the entry present — and `adr-lint` accepts the result | `adr-verify:361` or `:363` delete either `re.sub` | gates |
| 1.8 | With `--cwd` omitted inside a repo, the acceptance command runs at the git toplevel (assert via `pwd`); outside a repo, at `task.parent` | `adr-verify:522-524` replace the toplevel resolution with `cwd = task.parent` | gates |
| 1.9 | `adr-verify --human "<who observed what>"` writes a `· human-observed ·` entry that `adr-lint` accepts for a human-observed task and `adr-next` counts as done | change the `human-observed` literal in the writer | gates |
| 1.10 | `--mutant` **killed**: a mutation that makes acceptance fail → verdict `killed`, exit 0, Mutation Log entry written, file restored byte-identical | `adr-verify:446-453` invert the killed/survived arms | gates |
| 1.11 | `--mutant` **survived**: a mutation acceptance does not notice → verdict `survived`, non-zero exit, explanation fence in the Mutation Log | same as 1.10, plus deleting the non-killed explanation fence at `:457-467` | gates |
| 1.12 | `--mutant` refusals: `MUTANT DID NOT APPLY`, `MUTANT NOT UNIQUE`, `COMMENT-ONLY MUTANT`, and *does not parse* — each refuses without scoring a verdict, **and the target file is restored** (the `finally` at `:454-455`) | `adr-verify:435-440` delete the parse check; `:454-455` delete the `finally` restore → the file is left mutated and the next row fails | gates |

**Expected effect:** `bin/adr-verify` 47 % → ~80 %; Python total 63 % → ~72 %.

---

# Wave 2 — the escapes, and the hook nothing has ever fired — **DONE**

**6 tests. Every killing mutation applied and confirmed red:** the emitted event name, a
role dropped from the read-only pattern, the `{15,}` reason length, the `docsOnly` guard,
and the Stop-only placement of `interimResponse`. `lifecycle.mjs` functions 94.59 → 97.30;
all-files lines 92.93 → 94.54.

No harness defect this time — the escapes behave as designed. What they lacked was anything
proving it, which for a gate's two exits is the same risk as being wrong. The `docsOnly`
guard and the Stop-only placement are the two assertions worth having: without them
`EVIDENCE-LIMITED:` releases code changes and "I am blocked" finishes a task.

Also added: `package.test.mjs` now walks every event `lifecycle.mjs` handles and asserts
`hooks.json` declares it. `SubagentStart` was handled, declared, and never once fired by a
test; the next handler added without a declaration fails the suite instead of being dead in
production while its tests stay green.

# Wave 2 — the escapes, and the hook nothing has ever fired (5 rows)

Two of these are the **exits** from the completion gate. An untested escape in a gate
system is the highest-risk item on this list: if it opens wider than intended, the gate is
decorative, and nothing currently notices.

The third is an entire registered hook. `hooks/hooks.json:18` declares `SubagentStart` with
a 10 s timeout and the installed plugin registers it, so `subagentContract()` runs on
**every subagent launch in production** and has never been executed by a test.

| # | Assertion | Killing mutation | Lands in |
|---|---|---|---|
| 2.1 | `SubagentStart` emits valid JSON with `hookSpecificOutput.hookEventName === 'SubagentStart'`, `additionalContext` matching `/QUALITY CONTRACT/`, exit 0, and **no** `"decision"` key | `lifecycle.mjs:1669` change the emitted `hookEventName` | lifecycle |
| 2.2 | Role split: `agent_type: 'explore'` → `/read-only/`; `agent_type: 'execution'` → `/smallest coherent diff/`. Cover every member of the read-only regex | `lifecycle.mjs:1537` drop `review` from `/(explore\|plan\|research\|review\|audit\|scout\|memory)/` → `review` silently gets told it may edit | lifecycle |
| 2.3 | `hooks/hooks.json` declares `SubagentStart` pointing at `scripts/lifecycle.mjs` | delete the `SubagentStart` block from `hooks.json` | package |
| 2.4 | `evidenceLimited`: a completion boundary with an authored-unverified artifact **blocks**; the same with `EVIDENCE-LIMITED: <≥16 chars of reason>` passes; with a *too-short* reason (`EVIDENCE-LIMITED: x`) it still **blocks** | `lifecycle.mjs:1407` `{15,}` → `{0,}` → the short-reason case stops blocking | lifecycle |
| 2.5 | `interimResponse`: `Stop` carrying "blocked on X" passes; **`TaskCompleted` carrying the identical text still blocks** (the escape is Stop-only by design) | move the `interimResponse` call out of the Stop-only branch → the `TaskCompleted` case goes green when it must be red | lifecycle |

Rows 2.4 and 2.5 are negative-control-first: write the *blocking* assertion before the
passing one, so a mistake in fixture construction cannot make the whole row vacuous.

**Expected effect:** `lifecycle.mjs` 93.83 % → ~96 %.

---

# Wave 3 — the gates whose engines have never run — **DONE**

**Landed across `ac76631` and follow-up. Every rule asserted with a case that makes it
fire, against a positive control asserted first, and every rule then disabled in turn and
confirmed red — 31 controls, all RED.**

Python gate coverage 68% → **78%**, and no gate is below 69% any more:
`adr-debt` 57→80, `arch-lint` 67→81, `adr-lint` 69→83, `postmortem-verify` 78→94,
`spec-verify` 65→69, `adr-next` 66→69, `adr-retire-check` 67→70.

Three things worth carrying forward rather than smoothing over:

- **`selected_by_filter` treats pytest's `-k 'a and b'` as `or`.** It over-selects, so the
  gate misses a named test the fence would not actually run. The function's stated policy is
  that a false alarm costs more than a hole, because people skip a noisy gate. Asserted
  as-is so it is a decision rather than a surprise.
- **A catalog row whose label is not an ADR id does NOT drop that record's seal** — the id
  is recovered from the link target. Asserted as a property, because the opposite is exactly
  how the `done` check came to apply to nothing (item 18).
- **Two of these tests initially asserted nothing**, and only the negative control said so:
  an `arch-lint` table under a heading that is not one of `RULE_SECTIONS` is never read, and
  a check cell written as `probe.py::test_x` parses as neither a path nor a symbol. Both
  passed happily while testing nothing at all.

# Wave 3 — the gates whose engines have never run (~18 rows)

Grouped by gate, ordered by what a silent regression costs.

### 3a. `bin/adr-lint` — 65 %, and the untested parts are the reasoning

| # | Assertion | Killing mutation | Lands in |
|---|---|---|---|
| 3.1 | DAG: a `Depends-on` cycle across three tasks is detected and named | `adr-lint:364-369` make `find_cycle` return `None` unconditionally | gate-regressions |
| 3.2 | DAG: a contract edge inferred from `Consumes` token ↔ another task's `Produces` token orders the tasks even with no `Depends-on` | `adr-lint:406-407` skip the token-match arm | gate-regressions |
| 3.3 | DAG: a `tasks/README.md` wave/order that disagrees with the topological level is reported | `adr-lint:412-416` drop the leveling comparison | gate-regressions |
| 3.4 | `check_tests_can_fail`: a test body with no assertion/fail call → "nothing in it can go red"; a body whose only `assert` sits in a docstring or backticks → **still** an error (the `code_only` pass); a body whose assert lives in a one-level same-file helper → accepted | `adr-lint:834-845` drop the `code_only(body)` call → the docstring case goes green | gate-regressions |
| 3.5 | `selected_by_filter`: quoted filter, `\Q…\E` translation, unquoted filter, and a `pytest -k` boolean expression each select what they should; a Tests-table name the filter does not select → error | `adr-lint:870-906` make `selected_by_filter` return `True` unconditionally | gate-regressions |
| 3.6 | `check_verification`'s two entry rejections: human-observed task marked `done` with no `· human-observed ·` entry; task marked `done` with no exit-0 entry at all | `adr-lint:490` / `:492-495` delete either rejection | gate-regressions (extend the existing `verification_errors` helper) |
| 3.7 | `check_contract_table`: a contract row naming no producing T-id is reported as orphaned; producing/consuming T-ids must match real task files | `adr-lint:437-449` skip the orphan guard | gate-regressions |

### 3b. The gates with an entire rule set uncovered — table-driven, one fixture each

| # | Assertion | Killing mutation | Lands in |
|---|---|---|---|
| 3.8 | `postmortem-verify`: nine cases from one good fixture, each mutated to violate exactly one rule — date format, category enum, severity enum, `files_changed` list, tags form, missing section, empty section, Fix Before/After fence, Root Cause fenced block | for each case, delete that one rule's check (nine separate mutations, one per case) | gates |
| 3.9 | `adr-retire-check`: 7-cell row shape, missing ADR id, duplicate listing, link does not resolve, bad Decision effect, `Retired` not `YYYY-MM-DD`, empty/placeholder Reason, SHA-256 mismatch, "catalog must say none" | per-case rule deletion as above | gates |
| 3.10 | `adr-retire-check`: the `disposed:` disposition escape accepts a row the strict rule would reject — **and does not accept anything else** | `adr-retire-check:354` widen the escape to match any prefix → the negative case goes green | gates |
| 3.11 | `arch-lint` `vacuous_gate_errors`: a markdown-escaped `\|` inside a command, and a check-cell path that does not exist in the repo | `arch-lint:95` / `:102-103` delete either detection | gates |
| 3.12 | `arch-lint` `symbol_errors`: symbol not in the file it points at; symbol appears nowhere in the repo; a non-test symbol; a symbol with no body. Plus the rule-row rules: empty cell, sync-prose, deferred escape, no-backtick | `arch-lint:340-351` make `symbol_errors` return `[]` | gates |
| 3.13 | `adr-debt`: pointer classification across path / URL / ADR-id / empty, and each of the `BROKEN` / `UNRECEIPTED` / `UNSWEPT` reports, including `git_root` resolution | `adr-debt:82-86` collapse the classifier to one branch | gates |
| 3.14 | `spec-verify` `test_runs` and `path_stack` in full: a spec whose named tests do not run is RED | `spec-verify:361-407` make `test_runs` return `True` | gates |
| 3.15 | `spec-verify --implemented`: the block reports RED with the offending rows and main assigns **exit 3**, distinct from exit 1 | `spec-verify:568` change the exit-3 assignment to 1 → the code assertion fails | gates |
| 3.16 | `adr-next` `is_done`: both true arms — a human-observed sign-off, and an exit-0 entry whose `acceptance-sha256` matches — and the done bucket accumulates. Extend `gate-regressions.py:49-50` to a **three-way** digest identity: verify ↔ lint ↔ next | `adr-next:92` change the digest input to unnormalized text → the three-way assertion fails | gate-regressions |

### 3c. The runner's fail-closed exits — wired, never driven end to end

| # | Assertion | Killing mutation | Lands in |
|---|---|---|---|
| 3.17 | `runShellHook` returns **2** for each of: gate exceeds the timeout; bash cannot be spawned; stderr carries an MSYS `*** fatal error -` abort banner while the child exits 0 | `run-shell-hook.mjs:244-246` `return 2` → `return run.status` in the timeout arm — the case that put unchecked ADR edits in production on Windows | lifecycle (new `tests/run-shell-hook.test.mjs` is also fine) |
| 3.18 | `scripts/verify.mjs` propagates: non-zero child exit → same code; death by signal → exit 1 with the signal named; spawn failure → exit 127 | `verify.mjs:35` `process.exitCode = code ?? 1` → `= 0` | new test file |

**Expected effect:** Python total ~72 % → ~85 %; `verify.mjs` 66 % → 100 %.

---

# Wave 4a — the skill/gate contract — **DONE**

**5 tests in `tests/skill-contract.test.mjs`; 8 killing mutations, all red.** Nothing was
broken — this is a ratchet, and saying so is part of reporting it honestly.

It asserts that every gate flag a skill instructs is one that gate declares, that every
multi-flag invocation the skills document has an entry that actually RUNS it, that a new
multi-flag shape cannot be added to a SKILL.md without one, and that every
`/quality-harness:<name>` and `templates/*.md` a skill points at resolves.

Three things the build taught, each of which had already produced a wrong answer once:

- **A wrapped code span is one instruction.** `adr-verify … --from --to` continued with
  `--why` on the next line; read line-wise it looks like a documented invocation the gate
  refuses. I nearly reported that as a defect. A false alarm on a shared gate is how the
  gate gets switched off.
- **But the window must still stop at a line end.** Joining the whole file attributed
  `git diff --summary`, three lines away, to `adr-debt`.
- **Pin the exit code, not the error text.** These gates parse argv by hand, so an
  unrecognized flag does not announce itself — its VALUE falls through to the positionals.
  With `--why` unparsed, `adr-verify` says `task file not found: probe`, which no
  usage-error pattern catches. And where a flag's whole effect is what it PRINTS — `--all` —
  the exit code is identical either way, so the output has to be asserted too.

# Wave 4b — behavioural evals — **BLOCKED**

`claude plugin eval` reports `` `plugin eval` is currently in early access `` and scaffolds
nothing. This is account-side, not a missing manifest key: `--eval-dir evals .` gives the
same message. CI cannot run it either, and it needs credentials for its agent runs and judge
model besides.

**Correcting an earlier claim in this document:** Wave 0's green `plugin-validate` job was
read as unblocking this. It does not — `validate` and `eval` are different commands.

Not started on purpose. A `case.yaml` plus graders nobody has ever run is exactly the
claim-without-evidence this plan exists to remove, and with the runner unavailable there is
no negative control at all. The first three cases to write, when it can be run:

1. `/adr-execute` on a task whose acceptance fails must not report success.
2. `/work` must not mark a README row `done` without running `adr-verify`.
3. `/execution` must respect the leaf-role contract Wave 2 pinned.

# Wave 4 — the skills (gated on Wave 0's `plugin-validate` result)

16,801 words of skill instruction across 12 skills currently have **zero** behavioural
coverage — `tests/skill-metadata.test.mjs` checks frontmatter, not conduct. `claude plugin
eval` exists for exactly this.

**Answered: green.** `claude plugin validate --strict` passes unauthenticated, so an
`evals/` suite can run in CI. `continue-on-error` is already dropped from that job and
`QUALITY_HARNESS_REQUIRE_CLI=1` is set on `selftest`.

First three evals, in priority order, because they encode the premise the user built this
for — *the model does not get to say it is done*:

1. `/adr-execute` on a task whose acceptance fails must not report success.
2. `/work` must not mark a README row `done` without running `adr-verify`.
3. `/execution` must respect the leaf-role contract Wave 2 row 2.2 pins.

---

# Deliberately not covered

A later reader should not "close the gap" by asserting these. They are uncovered on purpose:

- **15 DEFENSIVE regions** — `try/except` around optional imports, encoding fallbacks,
  `except Exception: pass` in the coverage hook. Driving them requires breaking the runtime
  to observe the guard, which tests the mock, not the code.
- **7 UNREACHABLE-HERE regions** — Windows path handling in `run-shell-hook.mjs`
  (`windowsPathForBash`, `resolveBashExecutable`'s PATH and registry walks). These are the
  **`windows` CI job's** responsibility, not a macOS/Linux test's. Unit-testing them with a
  faked `platform` is already done where it is meaningful (`resolveBashExecutable` takes
  injectable `platform`/`env`/`fileExists`); asserting the rest against a mocked filesystem
  proves nothing about Git Bash.
- **`hookArguments`' fall-through** — converted from `return []` to a throw in `48211bd`
  and covered by the "every hook script the runner accepts has its arguments wired" test.
  It is a guard against the *next* hook script; it stays uncovered-by-execution on purpose
  and covered-by-assertion via the set walk.

---

# The ratchet — one step per wave, not once at the end

After **each** wave:

1. `bash scripts/coverage.sh --report`
2. Raise the floors in `scripts/coverage.sh:21-24` to **measured − 1**, and update the
   `# Floors. Measured …` comment with the date and the new numbers.
3. Commit the floors **in the same commit as the tests that earned them**. A floor raised
   separately is a floor nobody can attribute.

Current floors: JS 92 line / 83 branch / 92 funcs; Python 62.
Current measured: JS 92.77 / 84.34 / 92.54; Python 63.

**Note:** `tests/package.test.mjs:70` pins `manifest.version === '2.1.2'`. Any per-wave
version bump breaks that assertion by design — update it in the same commit; it is not a
regression.

---

# How to know the plan itself worked — **RUNNABLE**

`node scripts/mutate.mjs` applies each mutation in `tests/mutations.json`, runs the suite that
should catch it, and restores the source. `--list` names them; `--case <substring>` runs one.

**33/33 noticed.** Four verdicts, and three of them are failures:

- `RED` — the suite stopped passing. What every row must do.
- `GREEN` — the tests did not notice. The row is asserting something else.
- `STALE` — the mutation no longer matches the code exactly once, so it asserts nothing.
  Deliberately a failure: a mutation nobody has re-read is the same stale record as a task
  list kept beside the tasks.
- `HUNG` — noticed, but by hanging rather than failing. Removing `path_stack`'s
  `relative_to` guard never terminates, because `Path("/").parent` is `Path("/")`.

**It found two of its own catalogue errors on the first run** — one row pointed at the wrong
test file (GREEN) and one no longer matched the source (STALE) — and one defect in itself: a
hard kill left `scripts/lifecycle.mjs` mutated in the working tree, because
`process.on('exit')` runs no JavaScript under SIGKILL. The intent is now journalled to
`.mutate-inflight.json` before the source is touched, and any leftover is repaired at
startup. A crash can lose the process; it cannot lose the file.

# How to know the plan itself worked

Two checks, neither of which is "the suite is green":

1. **Apply every killing mutation listed above, one at a time, and confirm the named row
   goes red.** A mutation that leaves the suite green means the row is decorative and must
   be rewritten before the wave counts as done.
2. **Dogfood `bin/adr-verify --mutant` on the harness's own tests.** The tool exists to
   answer "can this acceptance command notice a defect?" — pointing it at this repository's
   own suite is the cheapest available evidence that the tests this plan adds are worth
   their line count.
