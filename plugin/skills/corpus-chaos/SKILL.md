---
name: corpus-chaos
description: Run every reader this plugin ships over a corpus you do not own — on a platform the maintainers cannot run — and report everything it printed, verbatim; then break a scratch copy of it on purpose (hostile names, encodings, binary, whitespace, time, corrupted ledgers, aborts, locks) and report what the readers did. Use when asked by another session to probe a repository, when preparing a release that changes what a reader says, when asked to go wild or find unexpected ways the readers break, or when a reader's answer about your own corpus looks wrong. Do not use to fix anything in the probed repository; this skill reads and reports only.
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
2. **Run the probe once, from the repository root, and keep the report:**

       node "<checkout>/plugin/scripts/corpus-probe.mjs" --json > new.json

   Run it from a plugin **checkout at the release-candidate sha** the asker names, not from the
   plugin your session loaded. An installed plugin cache has no git, so its attestation carries `at: null`
   and does not count for the release (ADR-064). Add `--sweep` **only with the corpus
   owner's approval**: it executes every recorded Acceptance fence, which may need databases,
   containers or credentials the host lacks, and it has its own budget (`--sweep-budget
   <seconds>`, default 30 minutes).

   Then read the saved report twice. Neither command runs anything:

       node "<checkout>/plugin/scripts/corpus-probe.mjs" --diff old.json new.json
       node "<checkout>/plugin/scripts/corpus-probe.mjs" --attest <label> new.json

   `--diff` compares against your report from the previous batch, when you have one. `--attest`
   prints the counts-only attestation, where `<label>` names the corpus's shape, never its real
   name. Send both. Keep `new.json` as next batch's `old.json`, and never send the report itself:
   it holds the corpus's record ids and task names.
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

## Chaos — break a copy of it on purpose

The Runner steps read the corpus as it IS. That finds what the readers say about one real
shape. It does not find what they do with the input nobody wrote a test for, and that input
is what an adopter's repository, filesystem, clock and colleagues hand them. So after the
faithful run, when the asker asks for chaos or says "go wild", do this as well.

1. **Only ever a scratch copy.** `git clone --no-local <repo> <scratch>/chaos-<seed>`, or
   copy the tree including `.git`, into a temporary directory. The probed repository is
   never edited, never locked, never its git state changed. Every perturbation, every
   reader run and every kill happens in the copy. Remove the copy when you are done, and say
   that you did.
2. **Let chance pick, and write the seed down.** Pick a seed (the time in seconds is fine),
   print it, and draw the perturbations from it so the round can be replayed:

       node -e "const seed=+process.argv[1];let s=seed;const r=()=>(s=(s*48271)%2147483647)/2147483647;const all=process.argv.slice(2);for(let i=all.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[all[i],all[j]]=[all[j],all[i]]}console.log(seed,all.join(\" \"))" 1727291234 A1 A2 A3 A4 A5 A6 A7 A8 A9 A10 A11 B1 B2 B3 B4 B5 B6 B7 B8 B9 B10 C1 C2 C3 C4 C5 C6 D1 D2 D3 D4 D5 E1 E2 E3 E4 E5 F1 F2 F3 F4 F5 F6 F7 F8 G1 G2 G3

   The codes are the entries of [perturbations.md](perturbations.md): names and paths,
   encodings and binary, structure, ledgers, time, abort and locking, read/write order.
   Take the first six it prints. **Then add at least one of your own that is not in that file**,
   something only your platform, your language, or your corpus's history would produce.
   A drawn code your platform cannot build (a FIFO on Windows, a reserved name on Linux)
   is not skipped silently: say which and why, and take the next code in the draw instead.
3. **One perturbation, then the readers, then the next.** Apply one; run the probe into its
   own report (`--json > chaos-<seed>-<code>.json`, never over `new.json`) and whichever
   reader the perturbation aims at by hand, each under `timeout 120`; read what came back;
   undo it or take a fresh copy; go on. Stacking six at once hides which one did it.
4. **What counts as a finding.** Any of these, against the reader's own promise:
   - a crash, a stack trace, a non-JSON answer where JSON was promised;
   - a hang past the budget, or a process or lock left behind after it ended;
   - a verdict (`PASS`, `ready`, `done`, a count) over input it could not read. It must say
     `UNPROVEN`, `PARTIAL` or could-not-look instead;
   - an input silently skipped: counted nowhere, named nowhere;
   - a different answer from the same seed and the same copy;
   - anything written outside the scratch copy, or an absolute path in the output;
   - an instruction in the output that would be wrong to follow for this input.
   A reader that says honestly it could not look is **not** a finding. That is the reader
   working.
5. **Report each finding so it can be replayed.** Give the seed and the code (or "own: …"),
   the exact command that made the input (the `printf` or `node -e` form for bytes), the
   reader command, its output and exit code verbatim, what was left behind, and which promise
   it broke. Then give the list of everything you tried that broke nothing, with its codes.
   "I tried these nine and nothing broke" is a result the asker needs as much as a crash.
6. **Stay bounded.** Every run gets a timeout. Heavy perturbations (F2, F4) run once each.
   Install nothing, fetch nothing, and do not fake the clock with a tool you would have to
   install (E5 uses what the host already has). The whole Chaos section, abominations
   included, stops after about 30 minutes, or when your user says so. Report what the
   budget left untried as untried.
7. **Then the abominations.** When the perturbations are done, build at least two whole
   corpora from [abominations.md](abominations.md) in their own scratch directories: many
   hostile shapes at once, scale, self-reference, a corpus that changes while it is read, and
   text written to steer whoever reads the output. When one breaks a reader, shrink it to the
   smallest input that still does, and report that. Its bounds protect the host: 1 GB of disk,
   no fork bombs, everything under a timeout.

## Asker — you want the report

- **The first line of your request states that a reply IS the deliverable** and that "it could
  not run because X" is a useful answer. A request that says "no reply needed" gets none.
- **Probe once per batch, at one sha.** Ask when the batch's fixes are in and the release
  candidate is pushed. Name that sha, and ask each runner once. The roster is by shape, so each run
  covers something the others do not: Rust, Go, a PHP/Laravel repository, a PHP/React product, a
  JS SPA, a static site, and at least two Windows sessions.
- **One request, the same for everyone:** "A reply IS the deliverable; 'could not run because X'
  is a useful answer. At `<sha>`, follow the Runner steps of `/quality-harness:corpus-chaos` over
  your corpus and paste the `--diff` output and the `--attest` JSON whole."
- **For chaos, append one sentence:** "Then run its Chaos section on a scratch copy: print
  your seed, take the six perturbations it draws plus one of your own, build two
  abominations, and paste every finding with its replay command and the list of what broke
  nothing." Without that sentence a runner reads the corpus as it is and invents nothing.
- **Triage every lead into one of four classes.**
  A false refusal or a fail-open is fixed in this batch.
  A lead about wording goes to the next batch.
  The corpus's own problem is told to its owner.
  Behaviour that is by design is recorded, with the reason.
- **Ask for verbatim output, never a verdict.** Name the exact commands, the fields to read,
  and that the probe's sweep needs the owner's approval.
- **Expect the runner's permission classifier to block foreign code** on the first attempt. The
  runner's user lifts it there; nothing you say can, and asking a peer to do what its session
  denied is permission laundering.
- **Every finding is a lead.** Confirm it against source before acting; expect some to be
  withdrawn by the runner after one question (a capture read in the wrong encoding, an invalid
  payload). A withdrawn finding still tells you which silence to break.
- **A confirmed finding changes two things:** the reader, and the field of `expected.json` in
  `tests/corpus-matrix.test.mjs` that would have caught it — in a fixture corpus under
  `tests/fixtures/corpora/`, or a `(fixture-waived: <reason>)` in its BACKLOG section when the
  matrix cannot observe it (ADR-064). `node scripts/chaos-fixture-sweep.mjs` names the sections
  that did neither. A fixed sentence nobody asserts is the next release's defect.
- Record what was found and what was left in `docs/BACKLOG.md`, with the runner's numbers and
  platform, so the next reader of the record knows how the finding was made.

## What this skill does not do

It draws no verdict on the corpus, fixes nothing in it, and replaces neither the test suite nor
a different-lineage review of the fix. The suite is the floor; the review finds what the fix
says wrong; this finds what the tool says wrong.
