# Task ADR-016-T2: generated outputs join the restore transaction

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** explicit multi-file restore manifest and versioned recovery journal
**Consumes:** clean-before-mutate baseline and `UNPROVEN` no-write outcome from T1
**Data dependency:** hermetic

## Goal

Restore every explicitly declared generated output to its exact entry state when a source mutant's
Acceptance fence materializes it.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-verify` | edit | add repeatable `--also-restore`, validate a bounded manifest, journal it, restore it in-process, and recover conservatively after a kill |
| `plugin/templates/task-template.md` | edit | teach authors to declare outputs their fence generates from a mutated source |
| `plugin/skills/adr-execute/SKILL.md` | edit | show repeatable `--also-restore` on the canonical mutation command and state when it is required |
| `tests/evidence-chain.test.mjs` | edit | drive source generation, absent/existing outputs, signals, validation and recovery through the real CLI |
| `tests/package.test.mjs` | edit | assert the shipped task template and execution skill expose the same restore transaction without promising auto-detection |
| `tests/skill-contract.test.mjs` | edit | keep the newly documented multi-flag invocation runnable against the fixture corpus |
| `tests/mutations.json` | edit | add a behavioral mutant that disconnects secondary members from restore |

## Ordered Steps

1. Add the failing CLI test `adr-verify restores declared generated outputs with their source`.
   Its hermetic fence copies a mutation from `view.templ` into `view_templ.go`, runs a named test that
   goes red, and exits non-zero. With `--also-restore view_templ.go`, assert `killed`, then assert
   both paths exactly match their entry bytes.
2. Extend the same test with two repeatable secondary members, an output absent at entry,
   Ctrl-C/SIGTERM cleanup, an old one-file journal, and SIGKILL-style recovery where a changed
   secondary member is preserved, named as unresolved, and makes `--restore` plus any ordinary run
   exit non-zero. Add unknown/corrupt versioned journals that are retained. Make live cleanup turn a
   secondary path or ancestor into a directory or symlink: safe members restore, the unsafe path is
   preserved and named, the journal remains, the invocation exits 2, and no Mutation Log row is
   written. Add CLI refusals for absolute, traversing, directory, direct-symlink, symlink-ancestor,
   duplicate and target-as-secondary paths, including an absent leaf below a symlink that resolves
   outside cwd; no refusal may modify a file or write a log row.
3. Parse repeatable `--also-restore` values and build the complete validated manifest before either
   fence. Snapshot bytes plus existence, write a versioned phase-marked journal before the clean
   fence, restore declared outputs after that baseline, advance the phase before the target
   mutation, and keep the legacy journal reader.
4. Restore all declared members in `finally`; existing-at-entry members regain exact bytes and
   absent-at-entry members are removed only after revalidating the path and its ancestors against
   the no-symlink, inside-cwd manifest rules. Delete the journal only after full success. A partial
   live cleanup restores only safe members, exits 2, writes no Mutation Log row, and retains the
   journal and unsafe path. In killed-run recovery, never overwrite a secondary value that differs
   from its entry state because the tool cannot prove the killed process still owns it.
   Unknown/corrupt journals and every unresolved member remain recorded, exit non-zero, and block
   ordinary verification from measuring the tree.
5. Update the task template and `adr-execute`: use the option only for regular
   repository-relative outputs the recorded Acceptance fence itself materializes; declaration
   grants restore authority during the live run; undeclared side effects are not restored;
   interrupted unknown bytes require human reconciliation. Add a package-level contract test that
   holds both shipped guidance surfaces to the same rule.
6. Add the exact catalogue label `verify: generated mutation outputs are restored with their
   source` by disabling secondary-member restore selection through the CLI path. Prove the generated
   fixture, not a catalogue-integrity check, kills it; then run the full unpiped self-test.

## Acceptance

```bash
set -o pipefail
node --test --test-name-pattern='adr-verify restores declared generated outputs with their source|shipped guidance teaches generated restore transactions' tests/evidence-chain.test.mjs tests/package.test.mjs 2>&1 | tee /tmp/adr016-t2-restore-manifest.out &&
grep -qF '✔ adr-verify restores declared generated outputs with their source' /tmp/adr016-t2-restore-manifest.out &&
grep -qF '✔ shipped guidance teaches generated restore transactions' /tmp/adr016-t2-restore-manifest.out &&
! grep -qE '^✖|ℹ fail [1-9]' /tmp/adr016-t2-restore-manifest.out
```

Both named tests are new, and both positive greps are required so an absent test cannot be carried by
the other file. Run catalogue-integrity checks separately before and after the mutant.

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `adr-verify restores declared generated outputs with their source` | `tests/evidence-chain.test.mjs` | through the CLI: two repeatable existing/absent secondary outputs restore with the source and are reset between phases; an absent leaf below missing safe directories is accepted; catchable signals clean all members; absolute and unambiguous repository-relative legacy journals recover only inside cwd, while old cwd-prefixed multi-identity and traversing paths block even when one interpretation has known bytes; missing, moved-on, symlinked, unknown and corrupt state also remains blocking; Python 3.9-era Windows reparse attributes are classified without `Path.is_junction`; unsafe partial live restore exits 2 without a row and retains the journal; direct, ancestor, absent-leaf and post-fence symlink escapes plus the other invalid manifest paths are rejected before unsafe writes | — |
| `shipped guidance teaches generated restore transactions` | `tests/package.test.mjs` | task template and `adr-execute` expose repeatable `--also-restore`, require the fence itself to materialize the output, disclaim suffix inference and undeclared rollback, and warn that live overwrite/delete authority can destroy a concurrent edit | — |
| `every multi-flag invocation the skills document actually runs` | `tests/skill-contract.test.mjs` | the canonical `adr-verify --mutant --also-restore` command reaches a real mutation verdict against the fixture corpus | — |
| `every catalogue entry still matches the source it mutates, exactly once` | `tests/package.test.mjs` | the new source anchor remains unique; preflight only | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the CLI fixture observes manifest validation, journal, normal restore and killed recovery |
| 2 — something selects it | the catalogue mutant disconnects secondary-member restoration and the generated fixture goes red |
| 3 — the caller can discover it | parser/help behavior and the shipped task template name repeatable `--also-restore` and its limits |
| 4 — it is used | the fixture reproduces the `.templ` to generated-Go incident shape; real consumer uptake is not measured yet |

## Class Sweep

**Class:** every path stored in the mutant journal and every code path that removes that journal.

```bash
rg -n 'mutant_journal|journal\.(write_text|unlink)|recover_mutant|target\.write_bytes|--also-restore' plugin/bin/adr-verify plugin/templates/task-template.md plugin/skills/adr-execute/SKILL.md
```

Every unlink must follow complete restoration or an explicit no-change recovery conclusion. Every
manifest member must flow through validation, journal serialization, `finally`, and recovery. Keep
the old one-file journal as a named class member until its compatibility path is deliberately
retired by another decision.

## Mutation Log

<!-- tool-written by adr-verify --mutant; empty at authoring -->
- 2026-09-01 · ee1f208* · mutant killed · exit 1 · `plugin/bin/adr-verify` · disconnecting secondary-member restoration must leave the generated-output CLI fixture dirty · acceptance-sha256:437cc26da14a11df60fa6f0e0fa3f288fd016627e860d7d5bb5e1c9fa75b6201
- 2026-09-01 · ee1f208* · mutant killed · exit 1 · `plugin/bin/adr-verify` · the portable reparse-point control must reject junctions on pre-Path.is_junction Python · acceptance-sha256:437cc26da14a11df60fa6f0e0fa3f288fd016627e860d7d5bb5e1c9fa75b6201
- 2026-09-01 · ee1f208* · mutant killed · exit 1 · `plugin/bin/adr-verify` · the missing-intermediate fixture must require nearest-existing-ancestor validation rather than leaf-only absence · acceptance-sha256:437cc26da14a11df60fa6f0e0fa3f288fd016627e860d7d5bb5e1c9fa75b6201
- 2026-09-01 · ee1f208* · mutant killed · exit 1 · `plugin/bin/adr-verify` · legacy recovery must revalidate recorded paths before any read or write · acceptance-sha256:437cc26da14a11df60fa6f0e0fa3f288fd016627e860d7d5bb5e1c9fa75b6201
- 2026-09-01 · ee1f208* · mutant killed · exit 1 · `plugin/bin/adr-verify` · a missing legacy mutant target must retain its journal and block later measurement · acceptance-sha256:437cc26da14a11df60fa6f0e0fa3f288fd016627e860d7d5bb5e1c9fa75b6201
- 2026-09-01 · ee1f208* · mutant killed · exit 1 · `plugin/bin/adr-verify` · a moved-on legacy target must retain its journal and block later measurement · acceptance-sha256:437cc26da14a11df60fa6f0e0fa3f288fd016627e860d7d5bb5e1c9fa75b6201
- 2026-09-01 · ee1f208* · mutant killed · exit 1 · `plugin/templates/task-template.md` · the shipped task template must warn about live overwrite and deletion authority · acceptance-sha256:437cc26da14a11df60fa6f0e0fa3f288fd016627e860d7d5bb5e1c9fa75b6201
- 2026-09-01 · ee1f208* · mutant killed · exit 1 · `plugin/bin/adr-verify` · relative legacy targets must anchor to the recovery cwd rather than the launcher directory · acceptance-sha256:437cc26da14a11df60fa6f0e0fa3f288fd016627e860d7d5bb5e1c9fa75b6201
- 2026-09-01 · ee1f208* · mutant killed · exit 1 · `plugin/bin/adr-verify` · cwd-prefixed journals from the prior writer must resolve to their unique known target · acceptance-sha256:437cc26da14a11df60fa6f0e0fa3f288fd016627e860d7d5bb5e1c9fa75b6201
- 2026-09-01 · ee1f208* · mutant killed · exit 1 · `plugin/bin/adr-verify` · legacy recovery must block when multiple safe candidates match known states · acceptance-sha256:437cc26da14a11df60fa6f0e0fa3f288fd016627e860d7d5bb5e1c9fa75b6201
- 2026-09-01 · ee1f208* · mutant killed · exit 1 · `plugin/bin/adr-verify` · one known byte state must not resolve an ambiguous legacy path identity · acceptance-sha256:437cc26da14a11df60fa6f0e0fa3f288fd016627e860d7d5bb5e1c9fa75b6201
- 2026-09-01 · ee1f208* · mutant killed · exit 1 · `plugin/bin/adr-verify` · a traversing legacy path must retain its journal rather than select an unrelated contained candidate · acceptance-sha256:437cc26da14a11df60fa6f0e0fa3f288fd016627e860d7d5bb5e1c9fa75b6201

## Invariants

- The complete manifest is validated and journalled before either fence can change a declared path.
- The clean fence's declared side effects are restored before the mutant fence begins.
- Restore uses exact bytes/existence and never re-encodes a declared member.
- Only explicit regular paths whose lexical and resolved components remain inside cwd without a
  symlink are granted restore authority, including when the leaf was absent at entry.
- Every live write or deletion revalidates path safety; incomplete cleanup exits 2, records no
  verdict, and retains the journal.
- A killed-run recovery never overwrites unknown changed bytes for a secondary member.
- The journal remains when any declared member still needs reconciliation.
- An unresolved or unreadable journal makes `--restore` and ordinary verification exit non-zero.
- Unambiguous one-file journals from the prior release remain automatically recoverable; a relative
  spelling with traversal or multiple contained identities stays journalled for manual reconciliation.

## Risks

- A declared generated file can receive a legitimate concurrent edit. Explicit opt-in bounds the
  authority, and conservative killed recovery protects the uncertain case; document the live-run
  transaction clearly.
- A generator may write directories or repository-external files. Refuse them rather than silently
  broadening cleanup authority.
- Parser support can exist without being wired into the journal. The test must enter through the CLI
  and the mutant must break parser-to-restore behavior, not help prose.

## Stop Condition

Stop and return to the owner if safe restoration requires whole-worktree rollback, directory
deletion, following a symlink, or overwriting secondary bytes whose ownership the journal cannot
establish.

## Out of Scope

- Discovering generated paths automatically.
- Running a hidden generator outside the recorded Acceptance fence.
- Restoring caches, databases, directories, ignored external state, or undeclared files.

## Verification Log

<!-- tool-written by adr-verify; empty at authoring -->
- 2026-09-01 · ee1f208* · exit 1 · `set -o pipefail …` · acceptance-sha256:437cc26da14a11df60fa6f0e0fa3f288fd016627e860d7d5bb5e1c9fa75b6201
  ```
  --- last 10 line(s) of stdout (of 52 after folding 53 raw)
        at Test.run (node:internal/test_runner/test:1397:25)
        at Test.start (node:internal/test_runner/test:1257:17)
        at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: '# Task <ADR-NNN>-<slug-or-id>: <One-line goal>\n\n**Depends-on:** <task-ids comma-separated, or "none">\n**Blocked-on:** <OPTIONAL, and only where the Acceptance is human-observed: the event this task\nwaits on, written so a later reader can check whether it has HAPPENED. A command that exits 0 once\nit has is the best form — `commit <sha> is an ancestor of master (git merge-base --is-ancestor\n<sha> master)`. Where only someone with other access can confirm it — a log on a host you cannot\nreach, a person who has to look — say who, with `checked by: <who>`; the gate reads that marker\nand stops asking. Not a mood, and not\na second Stop Condition: that section says when to abandon, this one says what to wait for. A task\nwith a runnable ```bash fence cannot use this header — a task that can run its own acceptance is\nnot waiting, it is unfinished, which is `pending` or `partial`.>\n\n<An unqualified id names a SIBLING task in this ADR: `T2`. A QUALIFIED id names a task in another\nrecord and is written `ADR-003-T4` or `ADR-003/T4` — `adr-lint` resolves it against the corpus, and\none naming no record, or a record with no such task, is an error for the same reason a cited ADR must\nresolve.\n\nUse the qualified form when your task must not start until another RECORD\'s task lands. Before this\nexisted the constraint could only be written as prose, in whichever record noticed it — which is\nnever the record that has to obey it.>\n**Covers:** <spec fact/scenario IDs this task implements (F-3, UC1-S2), or "none — no spec">\n**Estimated scope:** S (single file) | M (multi-file) | L (cross-boundary)\n**Owner:** <name | unassigned>\n**Produces:** <contracts other tasks consume, or none>\n**Consumes:** <contracts from sibling tasks, or none>\n**Data dependency:** hermetic | needs <what: a populated corpus, a live service, recorded traffic, a model>\n\n<`hermetic` means every Ordered Step runs from a clean checkout with no external state. Anything else\nnames what is required. This header exists because the gate cannot see the difference: a task whose\nsteps need real data while its Acceptance is a self-contained unit test passes with its actual\nrequirement unmet, and nobody finds out until sign-off. If this is not `hermetic`, the sign-off line\nmust record what the run was taken against.>\n\n## Goal\n\n<One sentence. Small enough to implement and validate independently.>\n\n## Affected Files\n\n| File | Change | Why |\n|------|--------|-----|\n| `<path>` | <add/edit/delete> | <reason> |\n\n<Name what SELECTS the new thing, not only what implements it. If this task adds an arm, a handler, a\nbackend, a config field or a flag, the registry, composition root, flag parser or help text that\nmakes it reachable is an affected file too — and its absence is this pipeline\'s most common shipped\ndefect: a component that is finished, tested and called by nothing. Ask of each new symbol: which\nline selects this, and what fails if that line is deleted?>\n\n## Ordered Steps\n\n1. Confirm the failing test(s) for `Covers:` IDs exist and are red (commit them if missing — TDD red). <If Covers is "none — no spec": write the failing test for this task\'s behavior first.>\n2. <step>\n\n## Acceptance\n\n```bash\n<command whose exit code 0 proves this task is done>\n```\n\n<Ask what this command does when the task\'s tests DO NOT EXIST YET, which is its state the moment you\nwrite it. `go test -run <no match>`, `phpunit --filter <no match>` and `cargo test <name>` all print a\nsummary and exit 0 — so the gate passes with nothing built. `adr-verify` now records a run that\nscored no tests as a failure, but write the fence so it is obviously red first. A portable guard:\n\n    set -o pipefail\n    <runner> <args> 2>&1 | tee /tmp/acc.out && ! grep -qE "no tests to run|^FAIL|^--- FAIL" /tmp/acc.out\n\n`set -o pipefail` and `&&`, not `;`, and this is a correction rather than a style note. Without\npipefail the pipeline\'s exit status is `tee`\'s, and `;` then discards even that — so the ONLY thing\ntested is the grep, and a runner that never starts prints nothing the grep matches. Measured\n2026-08-28: `nosuchrunner --test x` exits 0 through the `;` form and 127 through this one. This\ntemplate recommended the broken form until then, and ten task fences in its own corpus inherited it.\n\n`adr-verify` does not save you here: `scored_nothing()` recognises only a runner\'s own "nothing to\nrun" vocabulary, and `environment_failure()` is consulted only when the exit code is already\nnon-zero — so the run is recorded as a tool-written exit-0 claim.\n\n`^FAIL` is needed as well as `^--- FAIL`: a build failure prints `FAIL <pkg> [build failed]` with no\n`--- FAIL` line, so a check counting only those reads a package that does not compile as a pass.>\n\nA second, subtler hole: a fence whose filter names the new unit AND suites that already pass is\nsatisfied by the already-passing ones alone. A `tests > 0` guard does not see this — the count is\nnon-zero and the result is `passed`, both truthfully, of the wrong subject. Measured 2026-08-20: a\nfence filtering `NewClass|ExistingSuiteA|ExistingSuiteB` exited 0 with 13 tests green and none of\nthe task done. Regression coverage belongs in the fence; it just must not be able to stand in for\nthe work. Run the NEW unit alone as the first command, then the regression suites as a second,\nchained so both must pass:\n\n    <runner> --filter \'<OnlyTheNewUnit>\' && <runner> --filter \'<RegressionSuites>\'\n\nThe general form, worth asking of any aggregate gate: which of these subjects could carry the\nverdict by itself?\n\nAnd the inverse, which is worse because it reads as success. A fence narrow enough to name ONE test\nleaves everything else outside it — including the fixture that proves the test can fail. Reported\n2026-08-27 from a Go corpus: the falsifiability case had to become a SUBTEST rather than a sibling,\nbecause a sibling sits outside the only command that has to pass, and `adr-verify --mutant` would\nhave returned `killed` from a fence that never ran the mutant. A `survived` verdict says the test is\ndecoration and you go and fix it; a `killed` verdict from a fence that never executed the mutation\nis evidence of nothing, filed as evidence of something. Ask of every fence: is the thing that proves\nthis can fail INSIDE the command, or beside it?\n\nA fourth, which is about the RUNNER rather than the fence: a fence can outrun the agent\'s tool\ntimeout. Reported 2026-08-27 from a Windows session, where `./verify.sh` under Docker took about\ntwelve minutes against a ten-minute limit — the command is killed, no entry is written, and the\nwork looks unverified when it was merely unfinished. Run such a fence detached and poll for it\n(`nohup <fence> > out 2>&1 &`, then check), then invoke `adr-verify` on a tree where the fence\ncompletes quickly, or narrow the fence to the subset this task actually proves and say in the task\nwhat the wider run covers.\n\n`adr-verify` deliberately offers no detached mode of its own, decided 2026-08-28 (ADR-002\nfollow-up). The whole guarantee is that the tool which RAN the command is the tool that wrote the\nentry; a mode that records a result someone else obtained reintroduces the hand-pasted evidence the\nVerification Log exists to eliminate. A slow fence is a fence problem, and it is yours to shape.\n\nIf automated proof is impossible: `Acceptance is human-observed: <exact sign-off step>.`\n\n## Tests\n\n| Test name | File | Verifies | Covers |\n|-----------|------|----------|--------|\n| <test> | <path> | <behavior/invariant> | <F-n / UCn-Sm or —> |\n\n<Before listing tests for a task that operates on EXISTING records, enumerate the shapes the\ncreation path can already produce — more than one child row, an unchanged line, an optional leg\nabsent, the state a reaper or scheduler leaves behind — and decide for each: test it, or refuse it\nwith a named error. Measured 2026-08-20: eleven P1 defects, every one a shape the creation contract\npermits and no test covered, all of them past a spec gate that RAN its bound tests. A gate verifies\nthe tests you wrote; a mutation proves a test binds to what it names. Neither invents the missing\none.>\n\n<Every name here must exist in the file beside it before the README may say `done` — `adr-lint` reads\nthe real files, because a table kept beside the truth is a thing somebody has to remember. And each\ntest must be able to FAIL: remove the mechanism it is about, watch it go red, put it back. Confirm the\nmutant still compiles first — a mutant that does not build has not been tested, it has been skipped.>\n\n## Reachability\n\n| Rung | How this task shows it |\n|------|------------------------|\n| 1 — exists | <the unit test> |\n| 2 — something selects it | <the call site, and the mutation that proves it is reached> |\n| 3 — the caller can discover it | <the schema / flag / doc, and the check on it — or `n/a: no declared interface`> |\n| 4 — it is used | <how usage would be observed, or `nothing measures this yet`> |\n\n<Rung 3 is the one that is missed. A tool argument the handler honours but the schema never\nadvertises works for anyone who sends it, so every behavioural test passes — and the caller who\nreads the schema never sends it. Only a source or schema check reaches that rung. Rung 4 is not a\ngate; writing "nothing measures this yet" is a legitimate and useful answer, and it is how a\ncapability that ships unused becomes visible later instead of never.>\n\n## Mutation Log\n\n<Tool-written by `adr-verify <task.md> --mutant <file> --from <text> --to <text> --why <text>`.\nDo NOT hand-type entries — `adr-lint` rejects anything off this grammar, and a hand-typed row is\nexactly the thing this section replaced.\n\n  - YYYY-MM-DD · <sha[*]|no-git> · mutant <killed|survived|inconclusive> · exit <N> · `<file>` · <why> · acceptance-sha256:<64 hex>\n\n`killed` requires a non-zero exit, `survived` requires exit 0, and `inconclusive` may carry either.\nThe acceptance digest binds the mutant to the exact fence it proved could fail; changing the fence\ninvalidates both passing and mutation eviden'... 5540 more characters,
      expected: /--also-restore\b/,
      operator: 'match',
      diff: 'simple'
    }
  ```
- 2026-09-01 · ee1f208* · exit 0 · `set -o pipefail …` · acceptance-sha256:437cc26da14a11df60fa6f0e0fa3f288fd016627e860d7d5bb5e1c9fa75b6201
- 2026-09-01 · ee1f208* · exit 0 · `set -o pipefail …` · acceptance-sha256:437cc26da14a11df60fa6f0e0fa3f288fd016627e860d7d5bb5e1c9fa75b6201
- 2026-09-01 · ee1f208* · exit 0 · `set -o pipefail …` · acceptance-sha256:437cc26da14a11df60fa6f0e0fa3f288fd016627e860d7d5bb5e1c9fa75b6201
- 2026-09-01 · ee1f208* · exit 0 · `set -o pipefail …` · acceptance-sha256:437cc26da14a11df60fa6f0e0fa3f288fd016627e860d7d5bb5e1c9fa75b6201
- 2026-09-01 · ee1f208* · exit 0 · `set -o pipefail …` · acceptance-sha256:437cc26da14a11df60fa6f0e0fa3f288fd016627e860d7d5bb5e1c9fa75b6201
- 2026-09-01 · ee1f208* · exit 0 · `set -o pipefail …` · acceptance-sha256:437cc26da14a11df60fa6f0e0fa3f288fd016627e860d7d5bb5e1c9fa75b6201
