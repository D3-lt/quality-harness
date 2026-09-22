# ADR-059: A read-only command's arguments are not changed paths

**Status:** Accepted
**Date:** 2026-09-17
**Owner:** zy
**Spec:** None — no spec stage. ADR-051 already decides that Advise names only proven paths; this record removes a measured class of paths that are not proven.
**Cross-references:** ADR-047, ADR-051, ADR-058, `docs/BACKLOG.md` §213, `docs/BACKLOG.md` §218, `docs/BACKLOG.md` §220
**Governs:** `plugin/scripts/lifecycle.mjs`, `plugin/scripts/classify-command.mjs`

Class: every token `bashMarkdownMutationPaths` (plugin/scripts/lifecycle.mjs) turns into a changed path although no segment of the command writes it. Enumerated 2026-09-17 at `4e9c79a`: `grep -n "^const READ_ONLY_CHILD" plugin/scripts/lifecycle.mjs` lists 32 read-only command families. ADR-058 already handles `echo` and `printf` (T3), `wc`, `grep`, `git ls-files` and `mrw read` (T5), and a wrapper's own operand (T6). The remaining members are the other families the classifier recognises, the read-only `git` subcommands, and a `NAME=<file>.md` assignment used only by reads. Members left out, each with its reason, are in Out of Scope.

**Enforced-by:** `tests/read-only-arguments.test.mjs::a channel-free read names no changed path`, `tests/read-only-arguments.test.mjs::a family that can write names no changed path until it uses that channel`, `tests/read-only-arguments.test.mjs::an assigned path used only by reads is not a changed path`, `tests/read-only-arguments.test.mjs::a used write channel is a write to the classifier and the guard`, `tests/read-only-arguments.test.mjs::a variable inside a redirect target is still a changed path`
**Invalidates:** ADR-058 — T5's `readsOnlyItsArguments` predicate becomes a per-family table (T1). Its four families keep exactly today's behaviour, and `tests/advice-accuracy.test.mjs` is in every task's fence.
**Served-path change:** a commit or completion advisory after a command that reads Markdown with `cat`, `head`, `find`, `sort`, `git diff` or another measured read-only family, or passes an assigned path only to such a read, no longer names that file as changed.

## Context

ADR-058's Follow-up replay (BACKLOG §213) showed that the more commands the classifier recognises, the more often the path extractor reports a read. T5 fixed the two commit advisories that replay caught, and the attribution showed the class is wider. At `4e9c79a`, `bashMarkdownMutationPaths` still returns:

- `docs/a.md` for `touch b.log && cat docs/a.md`;
- `docs/a.md` for `touch b.log && sed -n 1p docs/a.md`;
- every `docs/*.md` for `touch b.log; for f in docs/*.md; do cat "$f"; done`;
- `notes.md` as well as `docs/new.md` for `cp notes.md docs/new.md`;
- `docs/a.md` for `T=docs/a.md && mrw read "$T" | sed -n 1p; touch b.log`.

In the measured session, the last shape named the ADR-058 T2 task file after `T=… && mrw read "$T" | sed -n '1,90p'; cd plugin/lib && python3 -c …`.

**Measured 2026-09-17** in a scratch git repository on macOS (BSD userland), GNU coreutils 9.11, ripgrep 15.2.0, jq 1.7.1-apple, file-5.41 and git 2.55.0. Before and after each command: `git status --porcelain --ignored --untracked-files=all` and every file's mtime and size.

- **Unchanged, 42 of 42 reads:** `cat`, `gcat`, `head`, `ghead`, `tail`, `gtail`, `cut`, `gcut`, `tr`, `ls`, `stat`, `gstat`, `which`, `basename`, `dirname`, `realpath`, `readlink`, `diff`, `cmp`, `md5sum`, `gmd5sum`, `shasum -a 256`, `gsha256sum`, `sha256sum`, `jq .`, `column -t`, `nl`, `rg`, `sort`, `gsort`, `uniq`, `guniq`, `find docs -name '*.md'`, `file`, `git diff --`, `git log --`, `git show HEAD:<path>`, `git status`, `git rev-parse`, `git cat-file -p`, `git grep -n a`, `git grep -n a -- <path>`.
- **Changed by 14 channels:** `sort -o F`, `sort -oF`, `gsort --output=F`, `gsort --output F`, `uniq IN OUT`, `guniq IN OUT`, `find … -delete`, `find … -exec touch …`, `file -C -m M`, `git diff --output=F`, `git log --output=F`, `git show --output=F`, `rg --pre CMD`, `git grep -O'CMD'`.
- **Not writes when run:** `find … -execdir touch x.md \;` exited 1; `git grep --textconv` changed nothing with no driver configured. Both run a command, so both stay channels.
- **Also measured:** `/usr/bin/time -o docs/timing.md wc -l …` writes `docs/timing.md` (ADR-058 T6 keeps that operand).

**Abbreviations and command-line configuration.** Measured by the cold review of this draft, 2026-09-17:
- BSD `sort` accepts `--ou` as `--output` and `-uo F` as `-u -o F`, and its help lists `--compress-program`, which runs a command.
- `git log --outp` and `rg --pr` are refused.
- `git -c diff.external=CMD` and a `GIT_EXTERNAL_DIFF=CMD` prefix choose a program on the command line itself.

**Reach.** `gcat`, `ghead`, `gtail`, `gcut`, `gstat`, `gmd5sum`, `gsha256sum`, `gwc`, `gsort`, `guniq` and `shasum` are not in `MEASURED_FAMILIES` (plugin/scripts/classify-command.mjs), so any command naming one classifies `unrecognised` and never reaches the extractor. A table entry for them would change nothing a session sees; they are left out.

## Existing Primitives Audit

- **`printsOnly` in `bashMarkdownMutationPaths`** (ADR-058 T3, T5, T6) — **reuse.** A segment that only reads contributes only the token after `>`/`>>`, unless a word before its command names a Markdown file. This record widens who counts.
- **`readsOnlyItsArguments(segment, invocation)`** (ADR-058 T5) — **reshape** into a table from family name to a write-channel test. `wc`, `grep` (with its ugrep options), `git ls-files` and `mrw read` keep their answers.
- **`isRecognisedReadInvocation`** (ADR-058 T2) — **reuse unchanged.** It is also the classifier's hook, so it stays `mrw read`-only; folding the table into it would reclassify commands.
- **`FIND_WRITES`** (lifecycle.mjs) — **reuse and correct.** It already lists `find`'s writing and command-running primaries for the reviewer guard. Its `(?:\s|$)` ending misses `-fprint0`, which T2 fixes; the guard then refuses one more real write.
- **`READ_ONLY_CHILD`** (lifecycle.mjs) — **read, not changed.** It is the reviewer guard's list of children it lets pass. It includes `find`, `sort` and `uniq` without their channels, so it cannot be the extractor's table.
- **`shellCommandRegions`, `shellSegments`, `heredocBodies`, `gitSubcommand`, `commandInvocation`, `executableName`** — **reuse.**
- **The assignment loop at the top of `bashMarkdownMutationPaths`** — **reshape** (T3).

## Decision

**A segment whose command is a measured, classifier-recognised read-only family, and which does not use that family's write channel, contributes only its redirect target. An in-command `NAME=<file>.md` assignment is dropped only when every reference to the name is a plain argument of such a read.**

1. **T1 — channel-free families.** `cat`, `head`, `tail`, `cut`, `tr`, `ls`, `stat`, `which`, `basename`, `dirname`, `realpath`, `readlink`, `diff`, `cmp`, `md5sum`, `sha256sum`, `jq`, `column`, `nl`. Together with ADR-058 T5's families they become one table, `READ_ARGUMENT_FAMILIES`.
2. **T2 — families with a write channel.** A segment that uses its family's channel keeps every candidate, as today. Channels:
   - `sort`: a single-dash option cluster containing `o` (`-o F`, `-oF`, `-uo F`), or a long option starting `--o` or `--co`, which covers `--output`, `--compress-program` and their abbreviations.
   - `uniq`: two or more operands, where `-` counts as an operand and `-f`, `-s`, `-w` consume a value.
   - `find`: a primary `FIND_WRITES` matches, once corrected to match `-fprint0`.
   - `file`: `-C` or a long option starting `--c`.
   - `rg`: `--pre`, `--pre-glob` or `--hostname-bin`, or a `RIPGREP_CONFIG_PATH=` prefix.
   - `git`, in every subcommand: a `-c` or `--config-env` global option, or a `GIT_…=` prefix. Beyond that, `diff`, `log` and `show` count `--output`, `--ext-diff` and `--textconv`; `status`, `rev-parse` and `cat-file` count `--textconv` and `--filters`; `grep` counts `-O`, `--open-files-in-pager` and `--textconv`.
3. **T3 — assignments.** A `NAME=<file>.md` value is kept unless every one of these holds:
   - the name is referenced at least once as `$NAME` or `${NAME}` outside single quotes;
   - no reference follows `>` or `>>`;
   - every reference is in a segment T1, T2 or ADR-058 T3/T5/T6 treats as reading;
   - the command has no heredoc body, no `${!` and no `export NAME`, `declare -x`, `set -a` or `set -o allexport`.

   References are found with the same traversal the assignment loop uses — `shellCommandRegions` × `shellSegments`, where a `$(…)` body is its own segment and no segment is skipped for an unknown directory. Each name keeps a list of its values. `A=docs/spec.md; printf x | tee "$A"` and the never-referenced `DOC='docs/spec.md' && printf x > docs/other.md` (both pinned in `tests/lifecycle.test.mjs`) keep their paths.
4. **T4 — a used write channel is a write to the classifier** (added 2026-09-17 from a Codex review). `classifyCommand` returned `neither` for every channel T2 measured, bare since before this record and wrapped since ADR-058 T1's timeout peel: `gtimeout 5 uniq /dev/null README.md` recorded no authorship and passed the reviewer guard. An output channel (`sort -o`, `uniq IN OUT`, `find -delete`/`-fprint*`/`-fls`, `file -C`, `git diff`/`log`/`show --output`) is now `mutation`; a program channel (`sort --compress-program`, `rg --pre`/`--pre-glob`/`--hostname-bin`, `git grep -O`) is `unrecognised`, at the top level, under a peeled wrapper and inside `$(…)`.
5. **T5 — a variable inside a redirect target is still a changed path** (added 2026-09-17 from a Codex review). T3 counted a reference as a write only when `>` came right before `$NAME`, so `T=README.md; printf x > "./$T"` dropped a real write. A reference now marks its name written when the shell word around it, quoted runs included, is the operand of `>` or `>>`.

**What would make each fail, and whether that data exists:** each test runs the measured shapes through `bashMarkdownMutationPaths` in a temp project, and asserts `classifyCommand` returns `mutation` wherever it claims a served-path effect. Each test carries its opposite, which must still yield the path:
- a family that uses its channel, in every spelling measured;
- a redirect beside a read;
- an assigned path that is redirected to, written through `$(…)` or after `popd`, reached through a heredoc or `${!…}`, exported, or never referenced.

The data exists: the measurement above, and the recorded session replayed in BACKLOG §213.

## Alternatives Considered

- **Drop candidates from every segment `isPotentialMutationCommand` calls non-mutating.** Rejected because it fails open twice on commands this session ran. That function answers false for anything `isValidationCommand` accepts, so `python3 plugin/bin/adr-verify "$T"`, which writes the task file, would stop naming it. And `find … -delete` reads as a family the guard trusts.
- **Reuse `READ_ONLY_CHILD` as the table.** Rejected because it answers the reviewer guard's question and lists `find`, `sort` and `uniq` without their channels. Tying the two would let a guard edit drop real writes from the advisory.
- **Resolve `$NAME` in the candidate loop instead of filtering the harvest.** Rejected because it newly resolves paths like `$D/tasks/T1.md` in segments no table covers (`sed -n`, loops), adding reports this record exists to remove, and it would change `tests/lifecycle.test.mjs`'s pinned never-referenced assignment.
- **The first draft of this record.** Rejected because a cold read-only review (2026-09-17) found it would drop real writes in five shapes: T3 treated `echo x >> "$NOTE"` as a read because `echo` prints (B1); T3 scanned only the segments the candidate loop keeps, missing a reference inside `$(…)`, after `popd`, in a heredoc or through `${!…}` (B2); T2's `sort` channel missed `-uo F`, `--out=F` and `--compress-program` (B3); T2 missed `git -c diff.external=…` and `GIT_EXTERNAL_DIFF=` (S1); and `uniq - OUT` was not counted (L2). Each was accepted, reproduced against `4e9c79a` where it could be executed, and folded into the Decision above. The same review found ADR-058 T3/T5 dropping a wrapper's operand (`time -o docs/timing.md`), shipped as ADR-058 T6, and found the `g`-prefixed names unreachable (removed), `git grep` unmeasured (now measured), a miscount in this Context, and an unmentioned `FIND_WRITES` (now reused). No finding was refuted.
- **One task per family.** Rejected: the behaviour is one predicate over one table, and the channel families differ only in their test.

## Component / Boundary Impact

None — internal to `plugin/scripts/lifecycle.mjs`: `bashMarkdownMutationPaths`, the predicate ADR-058 T5 added, and `FIND_WRITES`. No module, contract or hook entry changes.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `bashMarkdownMutationPaths` result | no arguments of a measured read-only family without its write channel; no assigned path used only by such reads | T1, T2, T3 | Stop "Changed paths include", the commit advisory, the artifact gate, `docsOnly` |
| `classifyCommand` result | a used output channel is `mutation`, a used program channel `unrecognised` (was `neither`) | T4 | transcript authorship, commit and Stop advisories, the reviewer guard |
| `FIND_WRITES` | also matches `-fprint0` | T2 | the reviewer guard, the extractor's `find` channel |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `READ_ARGUMENT_FAMILIES` table and `readsOnlyItsArguments` (T1) | T1 | T2, T3 | No — T5's four families keep their answers |
| `tests/read-only-arguments.test.mjs` (file exists) | T1 | T2, T3 | No — one writer creates the file |

## Implementation

See `docs/adr/ADR-059-a-read-only-command-names-no-changed-path/tasks/README.md`.

## Consequences

- **Positive:** an advisory stops naming Markdown files a session only read with the measured families or passed to them through a variable. Where the command's only write is unresolved, the advisory says it could not prove a path instead.
- **Negative:** these writes are no longer named by the read's argument, though the advisory still fires because the command stays a mutation:
- **Negative, found in Codex review 2026-09-17:** the classifier never knew these channels, and ADR-058 T1's peel extended that to wrapped commands, so a reviewer could run `gtimeout 5 uniq IN OUT`. T4 closes the measured channels; `find -exec` and git tools chosen by `-c`, `GIT_…=` or configuration still classify as before (BACKLOG §220).
- **Negative, also from that review:** T3 as first shipped dropped a path written as `> "./$T"`, a fail-open in the assignment scan. T5 closes it; no release carried it.
  - a tool selected by configuration outside the command line: a `diff.external` or textconv driver in git config, or `RIPGREP_CONFIG_PATH` set in the environment;
  - an alias or function named like a family that writes;
  - a read whose output feeds a writer: `ls docs/*.md | git restore --pathspec-from-file=-` names the listed files today and will not.
- **Neutral:** `READ_ONLY_CHILD` and `isRecognisedReadInvocation` are unchanged; `FIND_WRITES` refuses `-fprint0` in the reviewer guard too.

## Out of Scope

- `sed -n`, `awk` and other readers that write through their program text (`w file`, `print > file`) (deferred: docs/BACKLOG.md §220)
- `ag`, `date -r`, `true`, `pwd`, and the `g`-prefixed names and `shasum` the classifier does not recognise (deferred: docs/BACKLOG.md §220)
- The source operand of `cp`, `mv` and `rsync`, which those commands read or remove (deferred: docs/BACKLOG.md §220)
- A `for f in docs/*.md` loop glob expanded into changed paths (deferred: docs/BACKLOG.md §218)
- Interpreters (`node`, `python3`, `ruby`, `perl`, `php`) as readers (permanent: boundary: their program decides what they write, and ADR-051's could-not-prove wording is the honest answer)
- The reviewer guard's `READ_ONLY_CHILD` list (permanent: boundary: it answers a different question and stays separately measured)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A configured external diff, textconv or pager tool writes during a plain `git diff`/`log`/`show`/`grep` | Low | Low — advice only; the command still advises | Tools chosen on the command line (`-c`, `--config-env`, `GIT_…=`, flags) keep every candidate; config-selected ones are named in Consequences |
| A family gains a write option, or accepts an abbreviation not measured | Low | Low | Channels match option prefixes where the tool accepts abbreviations (`sort`, `file`); the table names the versions measured, and each channel has a test that keeps it reporting |
| The assignment rule misreads a reference | Med | Low | A reference the scan cannot see keeps the value only when no other reference exists. So T3 refuses to drop anything in the shapes it cannot scan (heredoc bodies, `${!`) and scans `$(…)` bodies and every segment regardless of directory |

## Rollback

Revert the task commits. No persistent state or contract; the removed paths return to the advisory.

## Follow-ups

- [x] After T1–T3 land, replay the measured session's commit and Stop points (the BACKLOG §213 method) at `a8ee9da` and at the new head, and record in BACKLOG §220 how many advisories still name a path no segment wrote. — done 2026-09-17, BACKLOG §220 ("ADR-059 re-measured"): 21 messages at both trees and identical paths on that session; one remaining false path comes from a gate run through its interpreter.
