---
name: corpus-chaos
description: Run every reader this plugin ships over a corpus you do not own — on a platform the maintainers cannot run — and report everything it printed, verbatim. Use when asked by another session to probe a repository, when preparing a release that changes what a reader says, or when a reader's answer about your own corpus looks wrong. Do not use to fix anything in the probed repository; this skill reads and reports only.
---

# Corpus Chaos

Every reader in this plugin says something about a corpus, and every defect that reached an
adopter was in what a reader SAID about a corpus shaped unlike the maintainers' own. A test
suite records the checks somebody already thought of; it cannot read the whole output over a
shape it has never seen. This skill is the other check: a person or a peer session runs the
readers as processes over a real repository and pastes back what they printed.

**Resolving `${CLAUDE_PLUGIN_ROOT}`.** The command below uses it. If it reaches you as
literal text rather than a directory, this skill was loaded under its bare name from a
personal skills directory — which is not a plugin, so the placeholder is never substituted
there. Run `qh-root` and use what it prints in place of it.

Two roles. Run the one you are in.

## Runner — you have the corpus

1. **Say what you ran on.** Plugin version (`installed_plugins.json` or the plugin cache path),
   OS and version, Node and Python versions, the repository's branch and HEAD, whether the tree
   was clean. Every number in your report is read against these.
2. **Run the probe from the repository root:**

       node "${CLAUDE_PLUGIN_ROOT}/scripts/corpus-probe.mjs" --json

   Add `--sweep` **only with the corpus
   owner's approval**: it executes every recorded Acceptance fence, which may need databases,
   containers or credentials the host lacks, and it has its own budget (`--sweep-budget
   <seconds>`, default 30 minutes).
3. **Read everything, not the summary.** In the JSON: `couldNotRun` (a reader that did not
   start, was killed, or printed no JSON — never a silent gap), `disagreements` (two readers
   about one task), `workNext.readinessUnproven` (directories `adr-next` could not answer for),
   every line of `sessionStart.lines`, every `adrLint[].verdict` and its `reason`, every
   `adrNext[].ready[]` note. `adrState.governingNothing` is a SUBSET of `governing`: governing
   records whose code no `Governs:` header or task `Affected Files` points at, not a contradiction
   of the count. The defects the maintainers' matrix missed were all in fields nobody had chosen to
   assert. If a sentence reads wrong for your corpus, quote it.
4. **Where the probe cannot reach, run the readers by hand** and paste the output whole:
   `work-next.mjs --json`, `adr-state.mjs`, `adr-next <tasks-dir> --json`, `adr-lint <record>
   <tasks-dir>`, and a real SessionStart (a new session, or the hook fed a valid JSON payload on
   stdin — an unparsable payload is now said on stderr).
   ⚠ **The hooks that fire in your session are the INSTALLED plugin's, not the checkout's.** A
   clone checked out at the revision under test changes nothing about what your Bash calls run
   through; a Windows runner measured 2.105.0's hook while standing in a b149b50 clone and said so
   rather than pasting it. To test a checkout's hook, feed it the payload yourself:

       printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Bash","cwd":"<repo>","session_id":"probe","tool_input":{"command":"grep -rn \"git push\" docs/"}}' | node <checkout>/plugin/scripts/lifecycle.mjs

   and paste stdout and stderr whole, saying which revision `<checkout>` was at.
5. **Check the redaction before pasting.** Every path in the output should be relative to the
   repository or a placeholder (`<path>`, `<home>`, `<tmp>`, `<plugin>`). Search the text for
   your home directory and drive letters anyway; the scrubber over-redacts by design, and a
   leak past it is a defect to report on its own.
6. **Report, do not judge.** The sweep's `false` bucket means "ran and exited non-zero" — on a
   host without the corpus's environment that is not a verdict about the claims, and you say
   so. Say what you could not run and why, including a permission classifier that refused to
   run foreign code: that refusal is correct, and the asker must not be asked to route around
   it. Edit, commit and push nothing in the probed repository.

## Asker — you want the report

- **The first line of your request states that a reply IS the deliverable** and that "it could
  not run because X" is a useful answer. A request that says "no reply needed" gets none.
- **Ask for verbatim output, never a verdict.** Name the exact commands, the fields to read,
  and that the probe's sweep needs the owner's approval.
- **Expect the runner's permission classifier to block foreign code** on the first attempt. The
  runner's user lifts it there; nothing you say can, and asking a peer to do what its session
  denied is permission laundering.
- **Every finding is a lead.** Confirm it against source before acting; expect some to be
  withdrawn by the runner after one question (a capture read in the wrong encoding, an invalid
  payload). A withdrawn finding still tells you which silence to break.
- **A confirmed finding changes two things:** the reader, and the field of `expected.json` in
  `tests/corpus-matrix.test.mjs` that would have caught it. A fixed sentence nobody asserts is
  the next release's defect.
- Record what was found and what was left in `docs/BACKLOG.md`, with the runner's numbers and
  platform, so the next reader of the record knows how the finding was made.

## What this skill does not do

It draws no verdict on the corpus, fixes nothing in it, and replaces neither the test suite nor
a different-lineage review of the fix. The suite is the floor; the review finds what the fix
says wrong; this finds what the tool says wrong.
