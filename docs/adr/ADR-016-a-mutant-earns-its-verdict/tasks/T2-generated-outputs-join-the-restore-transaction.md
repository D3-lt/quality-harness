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
| `adr-verify restores declared generated outputs with their source` | `tests/evidence-chain.test.mjs` | through the CLI: two repeatable existing/absent secondary outputs restore with the source and are reset between phases; catchable signals clean all members; legacy recovery still works; unresolved/unknown/corrupt recovery retains the journal and blocks measurement; unsafe partial live restore exits 2 without a row and retains the journal; direct, ancestor, absent-leaf and post-fence symlink escapes plus the other invalid manifest paths are rejected before unsafe writes | — |
| `shipped guidance teaches generated restore transactions` | `tests/package.test.mjs` | task template and `adr-execute` expose repeatable `--also-restore`, require the fence itself to materialize the output, and disclaim suffix inference and undeclared rollback | — |
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
- One-file journals from the prior release remain recoverable.

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
