# Backlog archive — 301 to 400

Closed sections of `docs/BACKLOG.md`, moved here verbatim on 2026-10-12. Nothing below was edited;
the index in `docs/BACKLOG.md` keeps every heading and points here. This file is history (CLAUDE.md §10).

## 301. CLOSED 2026-10-06 (stages 1, 3–7 delivered or declined by measurement; see the end) — Roadmap: take the model out of the loop, and a terse state protocol (2026-09-26)

The owner's direction after 2.111.0. The reasoning, the measurements and the papers are in
`docs/research/2026-09-26-model-out-of-the-loop.md`. Each stage is work only once its ADR is
Accepted (§10), and each states its success as a number against Stage 1's baseline.

1. Measure: hook injection per hook and event, cache-prefix hygiene, mutation campaign time and stale entries.
2. The terse state protocol `qh1`: one facts object, two renderers, deltas only, a cached legend, findings by id, a `backlog` § reader.
3. A zero-dependency shell lexer for the publish classifier. The existing tables are the acceptance.
4. Mutation tooling: `--repoint`, worktree-isolated campaigns, test-impact selection.
5. Finding to fixture: a peer finding schema, `finding-to-fixture`, `attest-import`, differential readers.
6. Latency: a content-addressed gate cache and compile cache. Then a daemon or a Rust core, chosen by measurement.
7. Research-grade: cascades, Datalog gates, mutant schemata, a job lease, predictive mutation testing, a Merkle release root.

Non-goals: binary or hex encoding, lossy compression on evidence, a semantic answer cache, and any runtime npm dependency in `plugin/`.

**Stage 1 — done 2026-09-26, without an ADR.** It is repository tooling that changes no shipped behaviour, so it ran as a bounded change. That departs from the line above; the owner can still ask for a record.
- `session-profile --attribute` now splits hook rows by the command's script, not only the event. It counts bytes a source re-sent byte-identical to its own previous record ("unchanged"), and it sums the harness's `durationMs` per hook.
- A command-less record (additional context, system message) is joined to its `hook_success` by `toolUseID`. The join is made only when that tool call ran exactly one command for the event; otherwise the record stays "(command not recorded)".
- `tests/session-profile.test.mjs` is new; the attribution code had no test before. Six catalogue mutants were added, all RED.
- The `mutate.mjs` half was dropped. `--stale` already counts stale entries, the cache records per-mutant `elapsedMs`, and CI records job wall time.
- "Cache-prefix hygiene" was not built: a transcript does not say where the cached prefix ended, so no reader can measure it. That is could-not-look.

**The baseline, one session (this one, 2026-09-26, 21 MB transcript).** No control arm.
- Injected bytes: Claude Code's own attachments are the bulk; all hooks together are 10.3%.
- This plugin, 1.9% measured:
  - `branch-state.mjs` sent 25.2 KB over 57 prompts, 2.7 KB of it unchanged.
  - `lifecycle.mjs` PreToolUse:Bash sent 15.4 KB over 87 records.
  - The ceiling is 2.6%, if the 0.7% of hook bytes still carrying no command were all this plugin's. That 0.7% includes another plugin's SessionStart context.
  - A first reading, before the join, said lifecycle added 0 B. That was an artefact of which record holds the text.
- Hook latency is the larger cost.
  - `branch-state.mjs` averaged 1,609 ms per prompt (max 7,462 ms) despite `--cached 120`. Measured apart at load 23: a cache hit is 0.10 s (Node's start); a miss is 1.28 s, of which git is about 0.4 s and each `gh` call 1.1-2.3 s. So the average is prompts more than 120 s apart missing the cache.
  - `lifecycle.mjs` PreToolUse:Bash averaged 416 ms.
- Another project's recall hook sent 132.6 KB over 117 prompts, 43.6 KB unchanged, averaging 2,052 ms. That was handed to that project, not changed here.
- What this means for the order:
  - Stage 2 can save at most this plugin's 1.9-2.6% of injected bytes, so it must justify itself on clarity or on another session's numbers.
  - `branch-state`'s cache misses are the plugin's largest measured cost, and they are the first target for Stage 6.

**v3.0 (owner, 2026-09-26: "ship it as 3.0").** It is two records, Accepted after one cold review whose findings were all folded in.
- **ADR-066** replaces Stage 3's lexer. Git refuses an unchecked publish through a session-scoped config hook on `prepare-commit-msg` and `pre-push`. It needs git 2.54 or later; a session counts as armed only once the hook has run.
- **ADR-065** is Stage 6's first target: the branch-state brief is served from a keyed snapshot and refreshed behind the prompt.
- Stage 2 (qh1) is deferred on its numbers.

**Load-sensitive test, found 2026-09-26.** `tests/observed-events.test.mjs` "a check that finishes in a later turn clears the finding then" failed once in the full gate at load 27. It took 14.6 s and Stop emitted R4 where R1 was expected. Run alone at the same load, it passed in 3.6 s. It is not caused by the Stage 1 change, which touches only `scripts/`. Open: find which deadline R4 depends on, and whether R4 there is a real could-not-look or a test budget.

**Stage 4, 2026-09-27: ADR-069 (Accepted) takes its first item, `--repoint`.** A replay of the 3.1.0 batch's hand repoints found six of fourteen mechanical, and the rule reproduces each; a cold review measured 83 of 1,138 sibling proposals without the record's added-line condition. Deferred from ADR-069 and still Stage 4's: an entry whose `from` spans lines (315 of 1,453 at a11f334, none in the replay), an entry whose edit only inserts (66), worktree-isolated campaigns (the tree was held unedited through every campaign of that batch), and test-impact selection beyond `--changed`.

**Stage 5, 2026-09-27: ADR-070 (Accepted) takes `attest-import`.** `node scripts/attest-import.mjs --check <file>` over each of the 59 files in `docs/corpus-reports/` at 916b515, counting every reason but "a duplicate" (each is already filed): 40 agree with their commit on the probe digest, the readers fingerprint and the plugin version; 10 are refused because they carry no `readers` field (they predate ADR-064 T1's fingerprint), 9 of them also for a `plugin` annotated by hand; 9 are `kind: hand`, which it does not check. ADR-070's Context expected 41 and 9: the audit script behind it skipped the readers check when the field was absent, and so counted one of the ten as consistent. The importer refuses a run whose readers cannot be checked, which is the rule for anything filed from now on; the ten stay as history. Deferred from ADR-070 and still Stage 5's: a hand attestation, and an audit of every filed attestation in CI.

**Stage 4, 2026-09-28: ADR-072 (Accepted, T1 to T5 done) narrows the catalogue, measured.** 811 of 1,582 entries now run only the tests that killed their mutant (T3, 953a882). The next dispatched campaign, 36476465667 at e016066, summed 10,304 shard runner-seconds against 50,430 for 36413858960, a 79.6% saving. Its slowest shard took 382 s (was 1,258 s) and its median 212 s (was 1,084 s). Two Codex rounds reviewed T1 and T2, then T4, and T4 and T5 closed their findings. BACKLOG §318 records what the literal reader still misreads. ADR-073 (Proposed) takes the check that would not depend on it: a narrowed baseline that runs fewer tests than it names is STALE. The narrowing's own measurement ran by hand in a linked worktree, since peer sessions run this checkout's hooks. Such a worktree must live outside the temp root, because tests/lifecycle.test.mjs rightly treats a checkout under it as a real project. Still Stage 4's: worktree-isolated campaigns as a tool, and multi-line and insert-only entries.

**Closed 2026-10-06 — the roadmap as it stands, stage by stage** (the owner: address every open topic):
1. Measure: done 2026-09-26 (`session-profile --attribute`), and since then every outside run carries ledger counts.
2. qh1: declined on its own numbers — it could save at most this plugin's 1.9–2.6% of injected bytes (above).
3. Shell lexer for the publish classifier: superseded by ADR-066 (git refuses at the event) and ADR-067.
4. Mutation tooling: ADR-069 (`--repoint`), ADR-071 (re-anchoring), ADR-072 (a mutant runs only its killers —
   the test-impact selection), ADR-073, ADR-075 and ADR-076 (worktree isolation).
5. Finding to fixture: ADR-064 (fixture corpora and the matrix), ADR-070 (`attest-import`), ADR-082 (verdict
   changes counted); `scripts/verdict-diff.sh` is the differential reader.
6. Latency: ADR-065 (branch-state snapshot), ADR-080 (no hook waits on the artifact pass), ADR-081 (a passed
   tree is not checked again). A daemon or a Rust core had no measured target and is not work (the owner,
   2026-09-26: a stage ships only on a measured target). §325 is the next measured latency item.
7. Research-grade: ADR-077 (a heavy run holds a lease). Cascades, Datalog gates, mutant schemata, predictive
   mutation testing and a Merkle release root have no measured target; they stay ideas in
   `docs/research/2026-09-26-model-out-of-the-loop.md`, not open work here.

## 305. CLOSED 2026-09-26 (3.0.1) — The test lock hashed a node:test options object instead of the test

**Found by reading an advisory.** Filling ADR-066's Follow-ups, `adr-lint` advised that five of ADR-066's done tests "call nothing and assert nothing". All five are declared `test(name, { skip: needsConfigHooks }, async () => {…})`. `record.bdd_callback_body` took the first `{` at paren depth 0 after `name,` as the body, which is the OPTIONS object.

**Two readers, one function, two consequences:**
- **The test lock failed OPEN.** `extract_test_body` hashed `{ skip: needsConfigHooks }`, so an edit to the test itself never moved its lock. Measured in a scratch clone: deleting all three assertions from a locked ADR-066 T2 test left `adr-lint`'s output byte-identical, exit 0.
- **The can-fail check was false advice.** It reported correct tests as unable to go red. There were seven such advisories on this repository's own records (ADR-002, ADR-045, ADR-066), unread across releases — the §17 failure, in the corpus that writes the rule.

**The class, enumerated:** `grep -rn -e bdd_callback_body -e extract_test_body -e _iter_bdd_calls -e 'test_body(' plugin/` shows two readers: adr-lint's `test_body`, with four call sites, and the lock's `extract_test_body`. Both funnel through `bdd_callback_body`, so one fix covers both. This repository holds 25 tests in the options-object form.

**Fixed (3.0.1):**
- An object directly after `name,` and followed by `,` is skipped as an argument, and the scan resumes after it. Its own `=>` and braces are never read as the callback.
- An object the call closes on (`test(name, { todo: true })`) leaves no callback: UNPROVEN, never the code after the call.
- Trailing options (`it(name, fn, 5000)`, `test(name, fn, { timeout })`) and a destructured parameter are read as before.
- A lock recorded over the options object gets §212's answer, not a clean pass: it is UNPROVEN and done is refused until `adr-verify --relock --replace-hashes` locks the body. That branch is checked before §212's, which also read the options as the body. ADR-066 T1 and T2 were relocked after review. ADR-002 and ADR-045 carried no such lock and simply lost their false advisories.

**Adopters:** a done task whose Tests table names an options-object test locked before 3.0.1 now reads UNPROVEN until relocked. It is the honest verdict — the lock never covered the test — and the message names the way out.

**Codex review of the fix (one round, eight findings, each probed against the code).** Two were fixed by one rule that replaced the first cut's special case: at paren depth 0, a `{` whose previous non-space character is `,` is an object ARGUMENT, and one after `:` is a TypeScript return type. Each is skipped whole. This fixes:
- NBSP and form-feed before the options, which the first cut's `" \t\r\n"` set missed;
- `test(name, fn, { timeout })`, whose trailing options were hashed as the body and are now UNPROVEN;
- `(): { v: T } => …`, whose return type was read as the body.

Named, not fixed:
- A callback body textually IDENTICAL to its options object (`test('x', {skip}, () => {skip})`) makes an options-era lock indistinguishable from a current one. A matching edit can then read clean (#1), and a genuine move can be labelled "locked over its options object" (#8). This needs a body equal to its own options text; the digest cannot tell them apart.
- Nested template literals inside options (`` `a${`}`}z` ``) defeat the masker, which is pre-existing in callbacks too (#2).
- An unclosed call is invalid JS (#4).
- An expression callback's trailing arguments are hashed with it (`() => x, 5000`), so changing the timeout moves the lock. This is inherited and fails closed (#6).

## 308. CLOSED 2026-09-27 — git's hook wrote its "ran" event into a linked worktree's own git dir

**Found by the owner's question after 3.1.0 ("check what caused"), the lead §307 left open.** Both chaos rounds of 626934a saw a session log appear in `.git/worktrees/<wt>/quality-harness/sessions/`, where no SessionStart ran. Reproduced at 5b61a71 (a main checkout with a started session, a worktree, a dirty file, `publish-hook.mjs prepare-commit-msg` in the worktree): a second log appeared there holding one line, `publish.hook-ran`, and the session's own log held only `session.started` and `publish.unarmed`. The writer was `plugin/scripts/publish-hook.mjs`'s `appendEvent(cwd, …)`, which resolves the worktree's own git dir. The `.git/modules/<sub>/` log of the first round was the other cause, the submodule misjudged as the session's repository, fixed in 3.1.0 (W11).

**What it cost.** `publish.hook-ran` is what marks a session armed (ADR-066 Decision 3), so a session that committed only from a worktree read as never armed: after a compaction SessionStart would say git's refusal had not run. The over-warning direction; the verdict itself was unaffected.

**Fixed.** The event goes to the log the session keeps: the owning repository's, when the hook judges a worktree because that repository holds the session's log. A test asserts the session's log records it and the worktree's git dir holds no session log; its mutant (writing to `cwd` again) is RED, and the two ADR-068 T1 entries name the rewritten guard. A worktree log that 3.1.0 already wrote is left in place and no longer written to.

## 310. FIXED 2026-09-28 — The suite and the mutation campaign left their temp directories behind, 66,000 of them on one Mac

**Found by a peer session** (ts-generator-87, 2026-09-28). It counted 65,904 `qh-*` directories in this Mac's user temp dir, about 0.7 GiB, and deleted 45,367 older than a day at its own user's request. Confirmed here by measurement, not from the prefixes alone: temp entries counted by prefix before and after each suite run on its own, then around one whole selftest.
- One selftest left about 160 entries: `qh-sweep` 84 (`tests/sweep.test.mjs`'s corpus helper never removed what it made), `quality-harness-status-<hash>` 26 (statusline's per-session cache, one per test session id), `qh-mutate-pyc` 12, Python `tmp*` 5, `qh-pyc` 4, and about 25 single entries.
- Two of the singles came from tests this batch added: `qh-own-done` and `qh-unreadable-task` reuse `agedCorpus`, which leaked.
- The mutation campaign multiplied all of it. Each mutant re-runs the suites it names, and `scripts/mutate.mjs`'s `childEnv` made a `qh-mutate-pyc-*` directory per child and removed none. That is how `qh-sweep` alone reached 15,885.

**Removed.** 28,000 entries older than an hour, then the rest once `lsof` showed nothing held any of them, then 2,959 statusline cache files. 24 remain: live sessions' `-gen`, `-note` and `-status` files. Python `tmp*` directories and the peer sessions' `qh-probe-*.json` files in `/private/tmp` were left alone; they are not provably this project's.

**Prevented, class-wide.**
- `scripts/selftest.sh` gives the run one temp directory, exported as TMPDIR, TMP and TEMP, so every test, gate and hook it spawns writes there. The exit trap removes it, a run cut short included. Before the verdict, one `advice:` line names by prefix whatever the tests left. Not on Windows, whose CI runner is discarded after the job and whose MAX_PATH the longer prefix would eat into.
- `scripts/mutate.mjs` runs every child through `runChild`, in a scratch temp directory that also holds its bytecode cache, and removes it when the child ends.
- Tested at the outermost boundary: a real campaign over a scratch repository whose test deliberately forgets a temp directory leaves the probe TMPDIR empty. Both mutants (no removal, no TMPDIR) are RED.

**And at the source,** so a file run on its own stays clean. `sweep` (its corpus helper and the `qh-link` directory), the `qh-pyc` caches in `test-lock` and `relock-stress`, and `agedCorpus` in `gates` now remove what they create. Measured on their own: sweep +85 to +0, test-lock +2 to +1, relock-stress +2 to +0. The one left is the stress test's per-run cache. That test is LOCKED (ADR-052, ADR-054, ADR-055), and an edit to its body moved the lock and refused four tasks' done at the gate. So the body was restored byte for byte, and its cache is left to the selftest's temp directory.

**Left.** The long tail of single leaks is caught by the selftest's temp directory and named by its advice line, not fixed one by one. A developer running one of those files outside `selftest.sh` still leaves one entry. The statusline's per-session cache in the product is one small file per Claude session, never pruned; a lead, not a leak the tests cause.

## 311. FIXED 2026-09-28 — Windows opened a terminal tab per hook child since 3.0.0; and a Codex round over 3.1.0..e0ef6d4

**Windows tabs, reported by the owner on 3.1.0.** After each prompt, Windows Terminal flashed open several tabs for about a second. Traced here, not reproduced here (no Windows host):
- ADR-065 (57070e8, released in 3.0.0) made the `UserPromptSubmit` branch-state hook serve a snapshot and start a detached `--refresh` process behind the prompt. That process is spawned `detached` with `windowsHide`, so it has no console. Its `git` and `gh` children (`execFileSync` in `run`) did not pass `windowsHide`, and a console child of a console-less parent gets a console of its own, which Windows Terminal shows as a tab. One per child, several per refresh.
- 2.x (v2.110.0, v2.111.0) ran the same hook inline with `--cached 120` and no detached process: `detached: true` occurs in branch-state.mjs 0 times at those tags and once at v3.0.0. The hook list itself is unchanged across the whole range.
- The same gap existed at every other spawn in `plugin/`: lifecycle's gate spawns and Python probe, publish-hook, qh-check, qh-doctor, corpus-probe, work-next, event-log, host-review, workflow-parse. The Python gates, once started hidden, had the same gap one level down: their `subprocess.run` children (git, bash) started with a console.

**Fixed, class-wide.** Every Node spawn in `plugin/` passes `windowsHide: true`. Every Python gate starts its children with `**NO_WINDOW` (`record.py`'s `no_window(platform)`, CREATE_NO_WINDOW on `nt` and nothing elsewhere); `fence.py` ORs the flag into its own `creationflags`. Guards, so the class stays closed:
- `node --expose-internals scripts/untimed-spawns.mjs --hidden` over `plugin/`: 29 hidden · 0 shown · 0 unknown, asserted by `tests/untimed-spawns.test.mjs`.
- `python3 scripts/untimed-children.py --hidden` over the shipped gates, asserted by `tests/untimed-children.test.mjs`, and `no_window`'s value on both platforms.
- Four catalogue entries (spawnGate, branch-state, `no_window`, adr-next's git) are RED.
- **Not confirmed on Windows.** The owner's machine and the Windows peers are asked to say whether tabs still open after the next release.

**Codex round** (gpt-6-astra, 3.1.0 `5b61a71`..`e0ef6d4`, REQUEST CHANGES, six findings, all confirmed against source):
- **F1 (P1).** `attest-import` took `date` and the built file name unchecked, so `date: "../../../../x"` filed outside `docs/corpus-reports/`. A date must be `YYYY-MM-DD` and the name a plain basename; both refused with a numbered reason.
- **F2 (P1).** A `-c` alias was read by its first word only: `git -c 'alias.c=commit -m' c --dry-run` is `commit -m --dry-run`, a commit whose message is `--dry-run`, and was read as nothing; `alias.p=push --dry-run` was read as a push. The alias's own words now come first, then help and dry-run are judged on the whole.
- **F4 (P2).** Git runs its own command over any alias of the same name, not only commit and push (`git -c alias.version=push version` printed the version on 2.55.0). `GIT_COMMANDS` holds `git --list-cmds=main` from 2.55.0, and an alias is read only for a name outside it. This corrects §309's "those stay publishes", which kept only commit and push.
- **F5 (P2).** A `!` alias's arguments were joined as shell source, so `git -c 'alias.x=!echo' x 'ok; git push'` was a push. git passes them as `"$@"`; each is single-quoted now.
- **F3 (P2).** An interpreter's string literal was read as a call: `node -e "console.log(\"spawnSync('git', ['push'])\")"` was a push. The first fix skipped only a call spelled straight after a quote, which still refused `print("run: os.system('git push')")` and perl's `print qq{system("git", "push")}`, a false refusal fixed in the same batch. `insideLiteral` tracks quote state up to the call, with backslash escapes and perl's `q`/`qq` delimiters. It is not a parser: a quote in a comment can flip it, and that only ever turns a refusal into advice, which §16 permits and git's own hook (ADR-066) still backs.
- **F6 (P2).** An unreadable task in a shared `tasks/` beside one record vanished from readiness. It goes to the sole record now, so its directory reads UNPROVEN.
- Each has a test and a RED entry; three older entries were re-pointed by `--repoint`, five by hand after it refused them as rewrites, and "git's own commit and push win over an alias" is deleted with the set it mutated (F4's entry covers the rule).

**Left.** The readers changed again (lifecycle.mjs, corpus-probe.mjs, work-next.mjs, adr-next, adr-lint), so an outside run is needed at the release sha (§18); Windows peers are asked about the tabs in the same request. The §309 leads stand.

## 312. FIXED 2026-09-28 — §311's Windows fix lost qh-check's output; a second Codex round; the dead-code scan's blind spots

**CI at 2b036de (run 36389420507) went red: windows and one mutation shard.** Both came from §311 itself.

- **windows: four tests read `''` from `qh-check`.** They were "a constant success is not a check…", "every gate refuses a flag it does not know", and two in `qh-check-shell`. Each exit code was right; the output was gone. §311 added CREATE_NO_WINDOW to the Python forwarder's `subprocess.call`, which shares the gate's stdio. Python passes no handles when none are given, so a child started with that flag gets a console of its own, and everything it prints goes there. libuv draws the line the other way for Node: `windowsHide` adds CREATE_NO_WINDOW only when no stdio is inherited.
  - **§311's model was wrong, and this corrects it (the record stays as written).** It said the Python gates' children "had the same gap one level down". They did not. A gate Node starts with `windowsHide` has a windowless console, and its children share it. What opened the tabs is a process with NO console, which is the `detached` refresher (CREATE_NO_WINDOW is ignored beside DETACHED_PROCESS), and its children. The Python `NO_WINDOW` sweep is harmless on a call whose output is redirected, and wrong on one that inherits.
  - **Fixed.** `qh-check` no longer passes the flag. `untimed-children --hidden` now has two halves. A call that shares the gate's stdio must not set CREATE_NO_WINDOW. A redirected call must set it, and `creationflags` is read by its value (`creationflags=0` was accepted). A parameter that defaults to a subprocess call (`run=subprocess.run`) is read as that call.
  - It found `fence.py`'s `taskkill`, which now sets the flag. The fixture shows each half firing.
  - The four Windows tests are the outermost check, and only CI runs them.
- **mutations 16/48: "chaos 916b515 C-5: an unread task file stays attributed to its record" went GREEN.** §311's F6 line handed unread shared tasks to the sole record, so deleting C-5's own `owned.push` changed nothing a test could see. The test now asserts `taskFiles` directly, and the mutant is RED.

**Codex round 2** (gpt-6-astra, xhigh, 2b036de; REQUEST CHANGES; five findings, each confirmed against source or by execution):

- **F2, a fail-open this batch introduced, so the release was held.** §311's `insideLiteral` read an interpolating literal as data:
  - JS `` `${spawnSync("git", ["push"])}` ``, a python f-string, and perl `qq{@{[system(…)]}}` each ran the call and read as nothing;
  - so did python's `"""a " b"""; os.system(…)`;
  - and perl `q{a {b} system(…)}` was still refused.

  Now a literal's interpolation hole is code again: `${`, `@{`, and `{` in an f-string, where `{{` is a literal brace. Triple quotes and perl's nested bracket delimiters are followed.
- **F1.** An alias was split as a shell splits it. Git splits on whitespace only, and refuses `alias.x=push;true` and a value with a leading space; both were measured on 2.55.0 as "is not a git command". `gitSplit` follows git's rules.
- **F3.** `GIT_COMMANDS` held `--list-cmds=main`, which includes external programs. An external program's alias runs when the program is missing: `--exec-path=/nonexistent -c alias.mergetool=version mergetool` printed the version. The list is now the 149 builtins (`--list-cmds=builtins`), and a builtin's alias is still ignored with the exec path broken. An external name's alias is read, which refuses a command git would not run when the program is installed; that is the conservative direction.
- **F4.** The Node scanner saw neither injected runners nor `windowsHide: false`. Runner parameters are read now, scoped to their own function; a file-wide first cut flagged a local `run` string builder. Five sites gained `windowsHide`: offerPublishHook's probe, archiveHistory, host-review twice, and verify.
  - `verify.mjs`'s spawn is acknowledged untimed, since it is the caller's own foreground command.
  - `untimed-spawns --hidden`: 33 hidden · 0 shown · 0 unknown.
  - §311's "29 hidden · 0 shown · 0 unknown, class-wide" was incomplete, and this corrects it.
- **F5.** Once unreadable, T2 (naming ADR-002) became the sole record ADR-001's task. An unread shared task is nobody's now. It stays in `unreadTasks`, and readiness asks about its directory through them, so it is still UNPROVEN rather than dropped.
- The round-2 fixes were not re-reviewed.
- Residual, stated rather than claimed away:
  - a quote in a comment can still flip `insideLiteral`, which only turns a refusal into advice;
  - an escape that spells `push` at runtime (`"pu\x73h"`) predates this batch and reads as nothing;
  - perl backticks are not read.

**The dead-code scan's blind spots** (the owner asked whether 0 findings was real, 2026-09-28). The zero was real, but three things would have hidden a finding:
1. **vulture's allowlist works by name, in every file.** `process` (46 sites) and `assertion` (70) hid any unused variable of that name, and a planted `process = 1` went unreported. The three renameable sites now carry a leading underscore, which vulture skips at that site only, and the allowlist keeps the three names that cannot be renamed. The planted variable is reported now.
2. **knip treated tests as entry points.** Four exports were reached only by tests. `appendEvent` and `ASSERTION_ARM_WITHDRAWN` (re-exported by lifecycle.mjs) and `findGitDir` (by statusline.mjs) are now imported from their own modules. `NEVER_MIRRORED`, a list only a test read, moved into that test. The scan runs knip a second time with `--production`.
3. **`plugin/workflows/*.js` were outside knip's globs.** They are scanned now. Their `meta` is read by the Workflow host, so knip's export check is off there, and the scan names any other export instead: a planted one was hidden by the exemption alone.

Not scanned: the shell scripts, because no standard dead-code tool reads bash. **Left:** `dead-code-scan.sh` has no test showing it dirty, since it needs `uvx` and `npx`. The dirty runs above were probes, not a test.

## 313. CLOSED 2026-10-06 — The outside run for 3.1.1, and the leads it and the refused runs brought

**Outside run at 7cccbac** (§18), by a peer session over a Laravel 7 / PHP 7.4 e-commerce admin: Darwin 27.0.0 arm64, node 24.11.1, python 3.14.7. Their tree was not clean: 7 uncommitted paths, none of them ADR or decision files. The run was a probe with exit 0: 17 records, 24 tasks, 7 task directories, couldNotRun 0, disagreements 0, readinessUnproven 0. It is filed as `docs/corpus-reports/2026-09-28-laravel-cms-3.1.0-7cccbac.json`, and `attest-import --check` agreed with the commit. The runner verified `partialBecause` (an archive record with no catalog row) and `unprovenSpecs` (a spec with no Status line) against their corpus as real. Their adr-lint gave 6 FAIL, 1 not-recognised and 17 PASS, and they read each FAIL as the corpus's own gap.

**Could not run: three peers**, each refused by its own permission classifier ("Code from External"): a React SPA, an Ansible repository and a Rust repository. That refusal is correct, and none was asked to work around it.

**Leads, not yet confirmed against source:**
- **adr-retire-check reads a status exactly; every other reader reads its first word.** An archived governing record whose status is `Accepted (2026-07-17 — …)` fails with "archived governing decision is not Accepted" (`is_accepted_status`, plugin/bin/adr-retire-check). adr-state, work-next and adr-lint count the same record as governing (§309, "by design"). The strict docstring says the difference is deliberate, and no record decides it either way. It was measured with 3.0.1 on an Ansible corpus and needs the owner's decision.
- **adr-lint FAILs `./docs/decisions/tasks: no task files`** where that directory holds only a subdirectory: `docs/decisions/tasks/007_ledger_rollup/` has a README and T1. The corpus keeps legacy `docs/decisions/NNN_*.md` records beside `docs/adr/`. Whether the task walk should enter `tasks/<NNN>/` for that shape is the question, and whether this FAIL speaks about a directory it never looked into.
- `not-recognised` for a legacy `docs/decisions/005_*.md` record reads as the reader declining a shape, which is correct.

**Closed 2026-10-06, each lead checked against the code at a0d963d.**
- **Lead 1 (the strict status) is fixed.** `is_accepted_status` in `plugin/bin/adr-retire-check` reads the first word through ADR-074's `status_kind`, so `Accepted (2026-07-17 — …)` is Accepted there as in every other reader.
- **Lead 2 was an untrue sentence, now fixed.** Reproduced in a scratch corpus: a `docs/decisions/007_ledger_rollup.md` record whose shared `docs/decisions/tasks/` holds only `007_ledger_rollup/T1-x.md` drew `docs/decisions/tasks: no task files`. The FAIL stays, since adr-lint reads no task there. The sentence now names the subdirectories that hold task files, says they were not entered, and names the remedy: pass the record's own directory as the second argument, which was run and reads the task. Whether the walk should enter `tasks/<stem>/` by itself is a layout decision and is not made here. Test `tests/adr-lint-nested-tasks.test.mjs`, with the flat layout as its control; catalogue mutant `§313: a shared tasks directory's subdirectories are not named`, RED.
- **Lead 3 is by design**, as the entry says.

## 314. FIXED 2026-09-28 — Where git outran observe()'s budget, an unchecked publish passed in silence; and what the 3.1.1 batch's failures now cost to repeat

**Found by a red release run.** On the first attempt of the 3.1.1 release run (36400420809) the Windows runner was about 3× slower than the two runs before it. A PreToolUse hook took 14.5s, and two tests that expected a refusal failed. Reproduced here, not guessed at, with a `git` shim that sleeps 6s on `write-tree`, which only `observe()` runs. The tests fail the same way, and a PreToolUse `git commit` on an unchecked tree printed only the slow-hook line: no refusal, and no word about the state. `publishVerdict` returned `null` before saying anything whenever the observation had failed. So did git's own hook (ADR-066), which calls the same function. On a host where git is slow, the publish check was silent at both ends. That breaks ADR-005's rule that could-not-look is said in those words.

**Fixed.**
- `publishVerdict` now says "whether this repository is checked is unknown — its working tree could not be observed (<reason>)". It never refuses on that: a state nobody could read is advice (CLAUDE.md §16).
- git's hook prints the same sentence at the event, still exiting 0.
- `QUALITY_HARNESS_OBSERVE_BUDGET_MS` raises observe()'s 5s budget on a slow host, and it is what makes the case deterministic in a test.
- The two suites that expect refusals set the budget themselves, so a slow runner no longer fails them. Both pass under the 6s shim.
- The new test drives both paths and shows each one's twin refusing at the normal budget. Four catalogue mutants are RED.
- `lifecycle.mjs` is a reader, so a release needs another outside run (§18).

**The batch's failures, and what now catches each one before it repeats:**
- **CREATE_NO_WINDOW on a child that shares stdio lost its output** (§312). `untimed-children --hidden` fails on it, CLAUDE.md §7 states the rule, and the evidence is in `.claude/rules/07`.
- **A "this is data" exemption opened a fail-open** (§312, F2). CLAUDE.md §16 now requires a "this is code again" twin row, with the evidence in `.claude/rules/16`.
- **A locked test was edited, the third time** (2026-09-25, -26, -28). `python3 scripts/test-locks.py <file> [name]` answers "is it locked" in one command, and its test names ADR-068 T2 on a copy of the incident's own task file. CLAUDE.md §2 says to run it before changing a test. It reports 97 locks on `tests/lifecycle.test.mjs`.
- **A new line blinded an old mutant** (§312, C-5). `mutate --changed` cannot see this class: it picked 22 of 1544 entries for that diff and not C-5. A file-level pass is 338 `lifecycle.mjs` entries, which is the campaign. CLAUDE.md §18 now fixes the order instead: no bump and no outside run until the push's own campaign is green. Evidence is in `.claude/rules/18`.
- **Tests inherited a product budget that a slow runner outran.** CLAUDE.md §7 says a test sets the budgets it depends on.

**Not addressed here:** the Windows tabs the owner still sees on the new version. They wait on which process opens them and whether the plugin is the source; see the reply of 2026-09-28.

## 315. FIXED 2026-09-28 — 3.1.1's literal check made the publish classifier quadratic on long interpreter scripts

**Found by a push run's coverage job** (36413849215, at 287a207). "the classifier stays under its cost bound" failed under coverage instrumentation while the dispatched run's coverage job passed, which points to runner contention. The test was not the finding. Checking whether this batch had moved the classifier toward the bound was.
- On the suite's 712 short literals it had not: a mean of 3.5-4.5µs per call, against 3.4-3.8µs over 673 literals at e0ef6d4. The bound is 25µs, or 400µs under coverage.
- A long script was another matter. `insideLiteral` (§311, §312) rescanned an interpreter script from its start for every call it tested. A `python3 -c` script with 4,000 `os.system` calls in 125 KB took 6,427ms, where e0ef6d4 took 41.8ms on the same input (measured in a worktree, 2026-09-28). That runs inside the PreToolUse hook, so a big enough generated script could run past the host's hook timeout.
- **Shipped in 3.1.1 and 3.1.2.** 3.1.2's notes name it under Known open.

**Fixed.** `literalScanner` keeps the scan's position, and the one caller asks in order of position, so a script is read once: the same input takes 46ms. The loop body is unchanged, so the §312 mutants still name its lines. A new test pins a 4,000-call script under 1s (5s under coverage) and checks both answers: a call inside a string is data, and a real call is still read. Its mutant, which makes every query rescan from the start, is RED. The call site's rewrite left three catalogue entries stale, and `mutate --repoint --reanchor --write` repaired all three (one of them re-anchored) and measured them RED.

**The class, and what was missed.** The cost test measures a mean over short literals, and it is the class member that let this through: no test fed a long input to a scanner that could be quadratic. The other per-call scans over a word in the classifier are the `matchAll` regexes, which are linear. The ADR-067 lexer (`shellWords`) was measured at 42ms on this input before the change.

## 316. FIXED 2026-09-28 — The slowest selftest test, batched; and a cost bound that was a claim about one machine

**Stage 6, measured first** (the owner asked to work the open 3.x items, 2026-09-28). The hooks were not where the time went. Medians over 10-20 runs, this Mac:

| Path | Median |
|---|---|
| a trivial PreToolUse | 59ms |
| bare `node -e ''` | 40ms |
| a warm compile cache on the trivial PreToolUse | 42ms |
| PreToolUse on a `git commit` | 198ms |
| Stop | 181ms |
| SessionStart | 767ms |
| `observe()` | 43ms |

The selftest's node suite was 151s at 8cc0327. One test was 59s of it: "every catalogue mutant still parses, so a kill is behavioural", measured at 18.5-22.3s alone.

**Batched, not cached.** 862 JavaScript mutant files took 8.7s through `node --check` over 8 workers, and 1.1s in ONE child that parses each as an ES module with V8's own parser (`vm.SourceTextModule`, under `--experimental-vm-modules`, which parses and never evaluates). Both flagged the same 10 files, with 0 disagreements. The Python half, 676 mutants and about 114MB of large gates, was one serial process and is now four concurrent ones. The test alone now takes 4.6-6.5s. Each batch carries a planted syntax error and a clean file, so a checker that stopped seeing errors fails the test, and a batch that did not run fails it too (ADR-005).
- A content-addressed cache was considered and not built. It helps only a warm local run, CI never has one, and it puts a stale-verdict risk inside the test that proves a kill is behavioural.
- **The whole suite did not get faster, measured.** The node suite took 153.5s after the change against 151s before, at load 15-19 (the first attempt took 73 minutes at load 82 and is not counted). The test ran concurrently with the others and was never on the suite's critical path. The change saves about 50s of CPU per run on a shared machine, not wall-clock time. The critical path is the next thing to measure, not guess.

**The cost bound.** "the classifier stays under its cost bound" failed in CI's coverage-floor job at 287a207 (the push run) and at 43b0353, with means of 45.3 and 46.8µs against 25, while the dispatched run of 287a207 passed. It fails in the Python-gates phase of `coverage.sh`: that phase runs the suite in parallel under coverage.py without `NODE_V8_COVERAGE`, so the 25µs bound meant for an uncontended machine applied to a loaded one. Locally the same test under node's coverage measured 5.27µs.
- The bound now also scales with a reference workload timed in the same process: 275 times a regex-and-split iteration of about 0.09µs here, which is 25µs.
- Contention slows both sides. A slower classifier slows only one, so the twenty-fold mutant stays RED. ADR-067 T2 recorded that mutant only in its Mutation Log, and it is now also a catalogue entry (RED at load 16).
- The test body is locked by ADR-067 T3 and is byte-identical; only the module-level constant changed.

**Named, not started:**
- The CI mutation campaign, about 25 minutes a release, is the largest wall-clock cost still unmeasured by stage.
- The 30s scripted-session and 23s false-green tests are next on the list.
- The compile cache saves about 17ms a hook: measured, small, cheap.

## 317. CLOSED 2026-10-06 (by ADR-075; one inert residual in a locked test) — §241's race has a second reader: the hook's own test executes the mutant the suite installed

**Found running the gate for ADR-072 T1** (`qh-check`, 2026-09-28, load about 8 to 16 on 10 cores). `tests/post-edit-check.test.mjs` "the hook only acts on the tools it is for, and on files that exist" failed once: `run('Bash', broken.sh)` printed bash's `syntax error near unexpected token 'then'` for its scratch file. `plugin/scripts/post-edit-check.sh` exits at once for any tool but Edit, Write, MultiEdit and NotebookEdit (:7-9). The file then passed 3/3 alone, and the re-run passed 1471/1471.

**The writer is §241's.** `tests/gate-rules.test.mjs:1330-1353` runs `scripts/mutate.mjs --case 'the post-edit check acts only on the edit tools'` in the real checkout, and its empty-lock arm proceeds. That installs `Edit|Write|MultiEdit|NotebookEdit|Bash) ;;` in the hook while other test files run beside it, and a hook that acts on `Bash` prints exactly the output above. Lines 1362-1372 also write a `# scratch` line into the real hook and restore it.
- §241 named `tests/package.test.mjs`, which reads the file's text. This reader EXECUTES the hook, so it fails on the mutant's behaviour, not on a count.
- It is a false red on this repository's own gate, and each hit costs a gate re-run.
- The same window is live for every session that runs this checkout's hooks (§272): a peer's PostToolUse on a `Bash` call during that window runs the mutant.
- UNPROVEN that this entry was the one installed at that moment: nothing captured the file's bytes. The output matches it and no other of the hook's six catalogue entries.

Nothing changed here. §241's fix, moving the guard test's campaign into a disposable repository as `tests/mutation-cache-merge.test.mjs` does, closes both readers. It was declined on 2026-09-24; this is the evidence that it now fails the gate.

**Closed 2026-10-06.** ADR-075 moved every arm of `the mutation runner refuses to run over an editor, or beside
another runner` that PROCEEDS into a fixture repository (`inFixture`), and made isolation the default, so no
campaign this test starts installs a mutant in this checkout: the race §241 and this entry describe is gone. Two
arms still write into the checkout — a `# scratch` line in `plugin/scripts/post-edit-check.sh` and a comment in
`plugin/scripts/adr-state.mjs`, each restored in a `finally` — and the test is locked (ADR-075 T2), so it stays
byte-identical. Both writes are comments, so nothing that EXECUTES the code can observe them, which was the
failure here; a reader of the text could, for the length of one test.

## 318. CLOSED 2026-10-06 (its check exists since ADR-073; the torn catalogue write fixed) — What ADR-072's literal reader still misreads, and the check that would not depend on it

**Found by the second Codex review** (gpt-6-astra, xhigh, read-only, of ADR-072 T4 at cd7e6ab). T5 fixed the two inputs where a quoted name inside a regular expression counted as a definition: after a control statement's condition, and after a postfix `++` or `--`. The review's other inputs are recorded here, not fixed. Each was reproduced by the reviewer in memory, not by a campaign.
- `const q = {} / 2; const r = /'ghost'/;`: `}` is read as a statement's end, so the division opens a regular expression, the reader loses its place, and `ghost` counts as defined (fail-open). An object literal followed by a division is rare in a test file.
- `const q = {} / 2; test('real', …)`: the same misreading hides `real` (a false refusal).
- A regular expression holding `{` inside a template hole, when that expression is itself misread, changes the hole's depth (fail-open, through the misreading above).
- A line comment ended by a lone carriage return runs on (a false refusal). A CRLF line ends it.
- Malformed input (an unterminated literal or hole) is not diagnosed globally; later literals can still be returned.
- The catalogue write is a plain `writeFileSync`, so a kill during that one write can leave a torn file.

**Why this is recorded, not chased.** The owner's rule for a heuristic reader is one different-lineage round per change, then outside runs (2026-09-24). Over the 81 test files the catalogue names, the reader and the old quoted-substring rule agree on 1,386 of 1,387 runner-reported names; the one difference is a name that sits only in a comment, which the reader correctly refuses. That measurement cannot see a false definition the two rules share.

**The check that would not depend on the reader.** A narrowing's killers are real tests by construction: the campaign that recorded them ran exactly the entry's files, at the key the narrowing reads. The fail-open that matters is later, when a killer is renamed or deleted and its name survives as some other literal: `--stale` then says nothing, the entry stays RED through its other killers, and it runs fewer tests than its pattern names. The campaign's own baseline already runs the pattern. Comparing the number of tests it ran (`leafTestsRun`) with the number of names in the pattern would catch that, whatever the source text says. That is a campaign change and is not scheduled here.

**Closed 2026-10-06.** The check this entry proposed — comparing the tests a narrowed baseline ran with the names
its pattern holds — is ADR-073's: a baseline that runs fewer tests than its pattern names is `short`, and no
mutant is graded under it (`scripts/mutate.mjs`), so a renamed killer no longer hides behind the reader. The
reader's remaining misreads are rare inputs, kept under the owner's rule for heuristic readers (one different-
lineage round, then outside runs). The torn-file risk is fixed: `mutate --repoint --write` and `--narrow --write`
write the catalogue through a temporary file and a rename (`writeCatalogue`), tested with a failing-rename twin
in `tests/mutate-catalogue-write.test.mjs`; one mutant killed.

## 320. CLOSED 2026-10-06 — The inbox, reviewed: seventeen findings, two not yet recorded anywhere

The owner asked for the inbox to be reviewed (2026-09-29). Its 17 findings date from 2026-09-24 to 2026-09-28. Each one was matched to the section that answered it, and every "fixed" claim below was checked against the code at 1ba1681, not taken from the prose.

**Answered by earlier sections, and confirmed in the code:**
- go-cli-adr-corpus, the false self-dependency: fixed for 3.0 (§302 item 1).
- go-recall-service, advice on relock rows: fixed (§302 item 2).
- rust-records-corpus, cargo's `--test` read as a name filter: fixed (§302 item 3). adr-lint's filter flags are now `-run|--filter|-k|--name`.
- go-recall-service, the two-runner fence: fixed (§302 item 4). Its `Class::method` spelling for Python unittest is still open there.
- go-recall-service, arch-lint reading Go's `./...` as a missing path: fixed (§302 item 5). arch-lint now reads `...` as a package pattern.
- go-cli-adr-corpus, the artifact hook linting `tasks/README.md` as a record: fixed (§285). The same finding reported "files not in the commit", which is by design, since the artifact set is the session's changes. Its "could not classify" was a file that no longer existed.
- go-recall-service, corpus-probe linting frozen archived records: changed in §279 item 4. A frozen record is still linted, and its adrLint entry carries `frozen: true`.
- go-cli-adr-corpus's round at cd7e6ab, and go-recall-service's `[proof: human]` lead: triaged in §319's addendum.

**Recorded and still open:**
- ts-generator, generated fixture trees read as specs: §291.
- The nested `[build failed]`, reported twice by go-recall-service: §253.
- A fullwidth colon in a Status line: §293.
- A status adr-lint cannot read, which still lints PASS: §307 F-1, with the members §319 adds.
- A trailing-space task file: §319, next batch.

**By design, with the reason:**
- go-recall-service's D2: a Verification Log row whose digest matches no fence, and whose sha names no commit, changes nothing. A row whose `acceptance-sha256` matches no current fence is history and never counts toward done. A local gate cannot tell a run from a transcription, so it does not check that the sha exists either; it raises the cost of a forged row instead.

**Not recorded anywhere until now. Both are open, and both are for the next batch:**
1. **adr-lint lints a non-record as a record when its name starts `adr<digit>`** (go-recall-service, 2026-09-26: `docs/evaluations/adr018-sweep.md`). The commit dispatcher routes a file titled `# ADR-<n>` to adr-lint. adr-lint's not-recognised guard, `(?:adr|spec)[-_]?\d`, then accepts the name, and it FAILs the report for missing record sections. A sibling named `2026-09-25-adr018-gap-list.md` got "not-recognised".
   - The artifact check is advice, so this is noise and not a refusal. But it cannot be silenced there: renaming the file would orphan a `--human` row that names its path.
   - The design question is §16's: which signal separates a record from a report about one? The candidates are a `**Status:**` line, the ADR corpus directory, or the name. Changing it must not silence a real record that lacks its Status line, which the guard's own comment forbids.
   - **A second corpus (laravel-cms, corpus-chaos at e016066, 2026-09-29):** two Codex review transcripts named `.editor/notes/adr004_review_notes_part1_20260101.md` were counted as undecided records and linted as records ("Alternatives Considered has no entries"). They sit outside every directory the project calls its corpus. So corpus discovery reaches these files by their name's shape too, not only adr-lint.
2. **adr-verify writes a failing run's raw control bytes into the task file** (go-cli-adr-corpus, 2026-09-25: a UTF-16 fixture's NULs).
   - `excerpt_fence(failure_tail(...))` passes each line through `fence_safe`, which neutralises fence markers and nothing else. A NUL makes git treat the task file as binary, and mrw then refuses to edit it.
   - The reporter escaped the NULs by hand. The acceptance digest covers the fence, not the capture, so that edit left it unchanged.
   - The fix belongs in `excerpt_fence`, beside `fence_safe`: show control bytes as visible escapes, as `visiblePath` already does in the readers.

**After the review, the one false refusal still open among these leads is fixed on main, for the next release.** go-cli-adr-corpus's C4 was listed under §307 F-1 in §319's addendum, but it is not only a silence.
- Both of adr-lint's Status regexes, `^\*\*Status:\*\*\s*(.+?)\s*$`, let `\s*` cross the line break, so an empty `**Status:**` line was read from the line after it.
- Reproduced in a scratch corpus: an empty Status followed by `**Proposed:** 2026-09-01 by Zy`, with a task marked done. The blocking done check then FAILed the record with "Status is 'Proposed:** 2026-09-01 by Zy' but T1 is marked done", quoting a status the record does not have.
- Both sites now read the value on its own line (`[ \t]*`). An empty Status line is now said to be empty, as advice.
- A regression is in `tests/chaos-e016066.test.mjs`. Its controls: a real `Proposed` over a done task is still refused, and the no-tasks advice no longer quotes the next line. Three mutants, all RED.
- The rest of §307 F-1 (invalid UTF-8, `Acceptable`, `**Statusas:**`) still lints PASS. That is silence, not a refusal, so it stays in the next batch.

**Closed 2026-10-06.** Both new findings are fixed in code:
- §320.1: adr-lint's name arm no longer admits `adr<digit>` (the comment at its record discriminator names §320.1; ADR-074 T3).
- §320.2: `record.visible` escapes control bytes before `fence_safe` (§321).
The "recorded and still open" pointers are answered as follows. §291 and §293 are closed. §253 goes to an ADR draft, because its fix changes a verdict's strength. §307 F-1 now draws advice. The trailing-space task file is fixed in §321 (`tests/chaos-315-trailing-space.test.mjs`).

## 321. FIXED 2026-09-29 — The 3.1.5 batch: output that forges the tool, two readers that named the wrong thing, and ADR-073's first campaign

**ADR-073's first campaign found one short entry, and it was false.** Run 36521596839 at d0d1e66 ran all 48 shards. One entry, `workflow-parse: --js refuses a file neither dialect parses`, said "its pattern names 8 tests and 7 ran". All 8 ran.
- `leafTestsRun` discounts any leaf whose name ends in a source extension. That is §53's rule, for a file wrapper the path filter missed. One killer is named `… the Workflow fallback is for .js`.
- The discount used to turn a pass into unrun, the safe direction. ADR-073 turned it into STALE, which fails a campaign. Now a line whose exact name the pattern names is counted as a leaf; a wrapper's name is never one of those names.
- The class, enumerated by a script that runs `namesOf` over every `only` in the catalogue: 1 of 814 narrowed entries names a test ending in `.mjs`, `.js`, `.py` or `.cjs`. `killedBy` is not a member: it drops a name only when it has no whitespace AND an extension.
- `baselineOf`'s third argument is now the names, not their count; ADR-073's Wiring said a count.
- Every catalogue entry on `scripts/mutate.mjs` was run after the change (§18): 80 of 80 RED. Five were re-measured against the full catalogue, because a filtered scratch catalogue had made their baselines fail.

**Output that forges the tool (§319's addendum, and item 6).** Each fix has a regression with a control beside it, and catalogue mutants, all RED.
- **adr-verify's excerpt (§320.2).** `record.visible` writes each control, bidi override and invisible character as `\u{…}`, before `fence_safe`. A tab is kept.
- **adr-lint's printer (A6).** The verdict, every finding, every advice line and the withheld-advice line go through `visible(…, keep="")`. Only the print changed: the ADR-037 history keeps each finding's own text.
- **The check command (H1).** Every rendering goes through `checkInCode`, at 8 sites in lifecycle.mjs. Controls are escaped, and a `<` directly before a tag name is shown as `‹`. A redirection keeps its bytes, except `<name` written with no space.
- **SessionStart's adr-next line (item 6).** It goes through `gateSaid`: the repository root becomes `.` and the home directory `~`, and the line is cleaned like corpus text (`corpusText`, split out of `quotedCorpusText`).
- **work-next's relock remedy.** The text goes through `visiblePath`; the JSON keeps the bytes.
- **A sibling, found with `mrw read --grep 'commandInCode\(' plugin/scripts/`.** SessionStart's "Prove it with `adr-verify <task>`" kept a newline in a task name. `commandInCode` now escapes controls; zero-width characters, bidi overrides and the BOM keep their bytes, with the note.

**§307 F-1.** adr-lint now advises when a record's Status does not start with a word the readers act on: Accepted, Proposed, Draft, Rejected, Superseded, Withdrawn or Deprecated. It also says when the Status holds bytes that are not UTF-8. `Accepted (partially)` reads as Accepted in every reader, so it draws no advice.
- **`**Statusas:**` is not fixed, on purpose.** Six readers match the label without a word boundary: adr-lint:2207, adr-next:321 and :988, record.py:509, and lifecycle.mjs:1664 and :1669 (found with `mrw read --grep '0,2\}Status' plugin/`).
- Adding `\b` would turn adr-next's stop on an unrecognised task status into ready. It would also make record.py stop counting such a file as a record. Both move toward silence (§16). The misquote (`**as:** …**`) is a wording problem, and it stays open.

**D4.** Five sentences said "the session log could not be read whole" when only `checks.jsonl` had torn. `tornRecord(log, words)` makes each of them name `checks.jsonl` when that is what tore.
- R3's "where that run began may be among what was lost" is now said only when the session log itself tore, since `checks.jsonl` records no start.
- That narrowing has no test of its own: the review test tears the session log.

**Still open from §319's addendum and §320:**
- §320.1 (a name starting `adr<digit>` linted as a record).
- `showsFailing`; the probe dropping advice; C2; X1.
- Trailing-space task files; B9; Invalidates in a sibling archive; `[31m` residue.
- §302's `Class::method`; `**Statusas:**`; adr-lint's other corpus reads and FIFOs.

**Addendum, the same day: one Codex round on ffd4892, and a review of its fixes.** Codex (gpt-6-astra, xhigh) answered REQUEST CHANGES with six findings. All six were confirmed against source and fixed, each with a failing test first and catalogue mutants, all RED. Read-only reviewers were then asked to refute each fix, and they found the defects named below. The ones that reached silence or a forged line are fixed; the rest are recorded.
- **P1, a fail-open in `leafTestsRun`.** A suite prints `✔ <name>` when it completes, so a suite whose children were all skipped, or an empty one, counted as a test that ran, and a baseline of nothing graded `pass`. That was true before ffd4892 for any such suite; the names exemption only widened it.
  - The count is capped at the reporter's summary (`ℹ pass` plus `ℹ fail`), which a suite or a skip never adds to.
  - The review of the first cap found two holes, both fixed: it read the FIRST summary-shaped line, so a test printing `ℹ pass 7` lifted it; and a file the pattern matched nothing in prints its wrapper as a passing test, which lifted it by one. The last summary is read now, and each known wrapper is taken off.
  - Every catalogue entry on `scripts/mutate.mjs` was run again after each change (§18).
- **P2, adr-lint's other printers.** A missing file, an unknown option, `--advice-survival`, a directory named like a record and a file adr-lint does not recognise each printed a name's newline raw. All go through `one_line` now, and each route has a test.
- **#3, a tag in SessionStart.** A ready line's prefix and its `adr-verify` command printed `<system-reminder>` from a directory or task name. Corpus-derived paths go through `shownPath` (a `<` before a tag name becomes `‹`), and `commandInCode` says when the shown path is not the file's real name.
  - The review found work-next printing the same archive sentence raw (fixed), and a control after a tag name escaping the rule, because `visiblePath` had already turned it into a backslash (fixed).
- **#4, a displayed command that no longer ran.** A tab stays raw in `checkInCode`, and `wc -l <CLAUDE.md` keeps its bytes. That was measured in bash, zsh, sh and dash: the `‹` spelling exits 1. The previous-session line says "Run `qh-check` (it runs …)", so the only runnable instruction names `qh-check`.
- **#5, advice that claimed agreement.** It now says what adr-lint read and what adr-next's rule is, and it names lifecycle's reading when the value holds markup.
  - A first fix removed the markup before matching, as lifecycle does. The review showed that it silenced `_Proposed_`, which adr-next and adr-lint's other Status readers do not read as Proposed. It was reverted.
- **#6.** The advice names U+FFFD, not where it came from.
- **Codex's residual:** the D4 test's Stop regex missed "the session log". It no longer does.

**Recorded, open:**
- **The printer shape in the other Python gates.** spec-verify, arch-lint, adr-retire-check, adr-next, adr-verify, adr-debt, adr-judge and postmortem-verify each print a path or a finding without `one_line`. Find them with `mrw read --grep 'print\(' plugin/bin/`.
- **U+2028 and U+2029 pass through** `record.visible`, `visiblePath` and `terminalText`. A JS multiline regex and Python's `splitlines` both break a line there. This predates this batch and applies to the whole class.
- **A redirection from a path holding `/`** (`npm test </dev/null`) is still shown with `‹`. It is display only: the runnable instruction names `qh-check`.
- **The readers disagree about a status with markup inside it, or a letter after the word.** lifecycle removes `*`, `_` and backticks, and its `\b` is ASCII, so it reads `_Accepted_` and `Acceptedé` as Accepted; adr-next and adr-lint do not. Which reading is right is the owner's decision.
- **`leafTestsRun` called without `files`** takes no wrapper off the cap. The campaign always passes them.

**Released as v3.1.5 at ebfaee0 (2026-09-29).** The dispatched campaign 36536183116 was green on all 55 jobs. Five outside runs at ebfaee0 came back clean, and their attestations are in `docs/corpus-reports/` (…-3.1.5-ebfaee0.json): ts-generator, go-cli-adr-corpus, php-react-app, js-spa-client and laravel-cms. What they raised is for the next batch, and none of it is a refusal or a fail-open:
- **Enforced-by splits prose into pointers** (go-cli-adr-corpus, its ADR-007:9). `enforcement_pointers` cuts a sentence at backticks and commas, and `check_enforcement` advises on fragments such as `) and` and `eleven cases)`. It is advice only.
- **The stage menu says "no QH corpus is in use"** under a message that has just named an unread nested spec (ts-generator). The menu is the static catalogue, but beside that message it reads as a claim.
- **A record that keeps its status in a `## Status` section** is read by lifecycle's `recordStatus` and called not-recognised by adr-lint (laravel-cms, `docs/decisions/005_…`). The two disagree about whether it is a record at all. This is the §320.1 question from the other side.
- **A Tests row naming a missing test identifier FAILs, while one naming a missing test title is advice** (js-spa-client). Whether that is by design is open.
- **branch-state printed another commit's CI verdict** under `main @ <HEAD>`, twice on 2026-09-29 (9cc9a35, then 3ecf036), each from a cache entry written minutes earlier. The line names its sha, so it does not lie about which commit it describes, but it raised an alarm about a commit that was not HEAD. What wrote those entries was not established.
- **Not exercised by any outside run:** H1, D4 and §320.2 need a hostile name, a torn file or a UTF-16 fixture. The runners said so rather than passing them.

**ADR-074, executed 2026-09-29 (8e995fc..).** Siblings and leftovers it named, for the next batch:
- **ADR-038's evidence names a removed test.** Its T2 Tests row, `a MADR file is not-recognised, not a failed record`, is advised on by adr-lint; the record is history and is left. ADR-074's Follow-ups name the reversal.
- **lifecycle and adr-lint still disagree about names.** lifecycle's `ADR_FILE` admits `adr018-…` and `0005-…` by name; adr-lint admits only the canonical `ADR-<n>`. A numbered note with no record content (`docs/adr/0005-notes.md`) is a record to lifecycle and not-recognised to adr-lint.
- **ADR-074's Context sweep command does not run.** `git ls-files … | mrw read --files-from - --grep …` is refused by mrw v1.31.0 (`--grep and --files-from are two sources of specs`). The sweep was taken with `mrw read --grep '…' plugin/bin plugin/lib plugin/scripts`.
- **A candidate false refusal in the publish hook.** A `git commit` in a scratch repository under the session scratchpad was refused because this checkout had no qh-check pass on its current tree; the commit was not in this checkout. Teaching the hook where a command commits is the direction §16 warns about (a command can `cd` into this checkout as easily).
  - **It recurred on 2026-10-06, twice.** Once while staging `tests/fixtures/corpora/go-module` for a probe, and once inside a read-only triage subagent. Both were `git commit` in a fresh repository under the session scratchpad. Both were worked around by moving git into a node script, which is the hook's blind spot rather than a fix. Put to the owner as a decision; nothing changed in the hook.
- **The the Go kernel corpus corpus-chaos report at e0348fb** (palace inbox 47979ad5): a FIFO named as a task file hangs corpus-probe, work-next and adr-next (the 3.1.6 FIFO fix covered adr-lint); a FIFO record is skipped by work-next's count; `corpus-probe.mjs` crashes on a missing or read-only TMPDIR (an unguarded `mkdtempSync`); `record.decode_lock` never compares a lock payload with its declared sha, so a tampered payload gets the wrong diagnosis (done is still refused).

**ADR-074's corpus-chaos round at 559827d (2026-09-29).** Seven local sessions were asked; six ran it (the PHP/Laravel corpus, the TS generator corpus, the React SPA corpus, the Laravel/React corpus, the Go CLI corpus, the Go kernel corpus); the Rust corpus's classifier refused foreign code. No record on any real corpus changed its Status or its kind; every prediction about adr-lint's admission held. Fixed in the same batch, each with a failing test first: the not-recognised sentence repeated a fragment; lifecycle's content test and record.py's `looks_like_record` ignored a `## Status` section and lifecycle looked only under `adr`, so a record adr-lint reads was absent from corpus-probe, work-next, adr-state and adr-retire-check (T3's out-of-scope premise was false); the human-proof advice named README.md, was silent on steps without an `[S<n>]` id, and said "names" for two; the no-Status advice now names the section form, and the unrecognised advice names a leading non-letter such as `：`. Left:
- **A record with no readable Status and done tasks passes adr-lint** (the Laravel/React corpus), while `Proposed` with done tasks fails. Pre-existing; `check_status_allows_execution` returns when no Status is read. Possibly a fail-open.
- **`corpusReport.showsFailing` became `shownAbleToFail`** and `--diff` does not report a renamed key (the React SPA corpus).
- **A relative root argument** (`adr-state.mjs --json .`, `work-next.mjs --json .`) reads archived records as UNPROVEN, look PARTIAL (the Go kernel corpus F1, also at e0348fb). Absolute paths and no argument are correct.
- **A numbered `NNN-slug.md` record that loses its Status** is not-recognised by adr-lint ("not a finding about that file") while lifecycle lists it by its number (the Go kernel corpus F4) — the name-rule sibling above.
- **A companion document inside a record's folder** (the Rust corpus a companion document inside a record's folder, a `## Status` section and a Context) is now listed as an undecided record, and linted. It never governs.
- **Withdrawn by its reporter:** the PHP/Laravel corpus saw a record with no readable Status missing from the probe's `undecided`; its own chaos1.json holds it there with `status: null`, and a hermetic replay agrees — its printer showed only the null status.
- **By design, named so it is not re-found:** `Acc**epted` and `Accepted-ish` govern (markup removed, the first word); `[Accepted](x)` does not (link markup is not markup here); `### Status` and a fenced `## Status` are not read.

**The re-runs at 5579109 (2026-09-29).** the Laravel/React corpus, the React SPA corpus and the Go kernel corpus re-ran their fixed cases: every fix held, verbatim. the Laravel/React corpus and the React SPA corpus filed clean attestations at 5579109 (records and advice byte-identical to 559827d apart from the readers hash). What they left, none a regression of this batch:
- **adr-next's default text is silent on an unsigned human proof** (the React SPA corpus). The note is on `--all` done lines, in `--json` and in adr-lint; the one-line summary "All N task(s) carry exit-0 evidence…" does not carry it.
- **An uncatalogued record in an archive's root** (the Go kernel corpus F7) is named by all three readers now, but adr-state cuts its reason mid-word ("catalo]") and then gives the unknown-status advice for a status that is Accepted; work-next calls the unlisted record "listed" and drops all routing for one file at exit 0; adr-retire-check counts 9 archived where adr-state and work-next count 24 records.
- **adr-lint's not-recognised line says "not named ADR-<n>"** from the file name when the title is `ADR-998` (the Go kernel corpus), and the corpus readers do not see such a file at all.

**The code review of the ADR-074 batch (2026-09-29, `/code-review` at high effort, standing in for a Codex round the budget did not allow).** Ten findings; each was checked against source. Fixed, each with a failing test first: the inline Status reader ignored code fences, so a fenced `Status: Proposed` example made adr-lint REFUSE an Accepted record with done tasks (a false refusal); no colon was required, so a prose line such as `Status codes …` was read as a Status and beat the `## Status` section — over this machine's checkouts 53 files had a prose line read as their Status value, none changing its kind; lifecycle's `rawStatus` stripped underscores from a section's supersession target; Python `strip`/`re.I` and JS `trim`/`/i` disagreed on a byte-order mark, `\x1c` and `ſtatus`; lifecycle looked for content records in fewer directories than adr-lint; an indented numbered sub-item was read as a step and a `1)` list as none; adr-next's `main` kept its own "accepted" regex; a human-observed task was told twice about one missing sign-off; an empty section was called a line. The label is now one regex per language, colon required, matched letter by letter, one line at a time outside fences. A label written with a fullwidth colon is no label any more, and adr-lint's advice names the character. Left:
- **lifecycle's name rule** still lists `adr012`-style names adr-lint does not recognise (review #6; the sibling above).
- **The Status is parsed several times per adr-lint run** (main, check_adr, the done check, the no-tasks advice), each a full fence-aware walk (review #10). Cost, not correctness.
- **The C4 catalogue entry** ("an empty Status line read from the next line") is re-pointed at the fence walk: reading from the next line is impossible by construction now that the reader matches one line at a time.

**Leads from the last outside runs at 084d925 and bbc522d (2026-09-29), for the next batch:**
- **The task-status readers still take a label with no colon** (`adr-next` `task_status`, adr-lint `terminal_task_status`): the class the code review fixed in the record readers, outside ADR-074's scope. A palace fact records `task_status` false-matching `Statusline`.
- **`corpus-probe --diff` compares nothing when both reports are PARTIAL** — it says `not compared`, honestly, and a peer then diffs the JSON by hand (the PHP/Laravel corpus).
- **adr-lint's escaped advice shows a leading space before an invisible character**, "` {feff}Accepted`", where the value holds none (the React SPA corpus).
- **A task index cell such as `✓ commit b96632f`** parses to an empty task status, so "the checks that run for an evidenced task did NOT run for it" (the Rust corpus). A task-index reader, not a record reader.
- **Known open at the 3.1.6 tag, by the owner's decision:** a record with no readable Status whose tasks are marked done passes adr-lint with advice only while every other reader calls it undecided. Pre-existing; making it a refusal needs its own Accepted record and an opt-out (CLAUDE.md §3).

**The release campaign at b866a0f (2026-09-29): red, four findings, fixed before the tag.**
- **Windows:** two fixtures in `tests/gate-regressions.py` wrote `Acceptedé` with `write_text` and no encoding. On Windows that is the cp1252 byte 0xE9, invalid UTF-8, read with replacement as `Accepted` plus U+FFFD, whose first word is `Accepted`, so adr-retire-check exited 0 where 1 was asserted. Fixed with `encoding="utf-8"`, and the byte case is now pinned as bytes on every platform: a Status of `Accepted` followed by an invalid byte governs, as `Accepted.` does. The class, enumerated with `git diff v3.1.5.. -- 'tests/*.py'` over added writes carrying non-ASCII with no `encoding=`: these two, no others.
- **Two ADR-063 mutants on lifecycle's frozen-archive arm were GREEN.** ADR-074's per-segment record-directory check admits `adr-archive/` by its name, so the dated corpus never reached the arm (the §18 class: a refactor turned the old site's tests vacuous). Two tests in `tests/record-identity.test.mjs` now keep the archive under `history/`, and both entries point at them.
- **The corpus matrix lost its only never-checked record** when ADR-074 made MADR records linted, so "§321 probe: the matrix holds advice to the records the gate checked" was GREEN. The entry is removed; the mechanism stays covered by "§321 probe: advice rides only under a verdict the gate reached" (`tests/chaos-315-probe.test.mjs`). A lead: a matrix fixture should hold a record the gate never checks again.
- **A candidate false advisory:** the publish hook said "the staged index is unchecked" on `git add <files> && git commit` in one command, over a tree `qh-check` had passed. It reads the index before the `git add` runs.
- **The per-prompt brief named a CI sha that is not HEAD's.** During that release it printed `main @ b866a0f, 3 uncommitted path(s) · ⚠ CI 3ecf036: FAILURE — windows: failure`. 3ecf036 is an old commit on main with no run among the newest 40, and `.git/qh-branch-state.json` kept that line as `said` beside a `state.ci.sha` of b866a0f. `node plugin/scripts/branch-state.mjs` run by hand at the same moment named b866a0f correctly. The brief came from the installed plugin, not this tree. Cause not found; the history rewrite and force-push just before it are the first place to look.
- **Review #10's "cost, not correctness" was wrong within the day.** The Status parsed several times per adr-lint run made a 400,000-line record take 2.48s against 1.46s at v3.1.5, and under coverage it ran out the default 30s artifact-gate budget: the `coverage floor` job at 677c63d failed "the artifact gate budget is raisable…" (both runs), where b866a0f had passed it. `record_status` and `status_section` are memoised now: 1.77s. That test's second half is a performance assertion on the product default, and has no deterministic twin; lifecycle's repeated parsing is not changed.
- **A 15s hang guard failed a release campaign once.** At b089080, dispatch run 36615071490's `coverage floor` failed "the cached branch CLI reads a fresh answer without starting Git" (`tests/branch-state.test.mjs:584`, "the refresh wrote what it saw"): `waitForSnapshot` gives a detached refresher 15s, and under coverage on a CI runner that was not enough. The push run 36615070747 passed it at the same sha, and a rerun of the one job passed. Neither branch-state nor its test changed in 3.1.6. The test is locked (ADR-065 T2), so widening the wait belongs in `waitForSnapshot`, a hang guard that should outlast the slowest legitimate scheduling rather than assert a speed.

**ADR-075 (Proposed 2026-09-30) takes Stage 4's "worktree-isolated campaigns"**, deferred from ADR-069 and ADR-071 with no receipt here until now (spec docs/specs/2026-09-29-a-campaign-never-touches-the-checkout.md). What ADR-075 leaves, by its Out of Scope:
- **`--repoint --write` and `--narrow --write` still run in place**: they edit this checkout's catalogue by design, and a worktree would lose the edit. They still expose peers while they measure.
- **`plugin/bin/adr-verify --mutant` and `scripts/unasserted.mjs` rewrite source in the checkout too**, found by the class command in ADR-075's Context. Same exposure, one mutant at a time.
- **A fence `adr-verify` records does not say its load**, so a Verification Log entry taken under contention reads like any other.
- **ADR-071's other two deferrals to this file** — an entry whose `from` spans lines, and an entry whose edit only inserts — are the Stage 4 line of 2026-09-27 above, which predates ADR-071 and so never named it; they stay open there.

**§301, 2026-09-30: the roadmap has a plan with contracts.** `docs/research/2026-09-30-the-nervous-system-plan.md` turns §301's stages into N1 to N5, each naming its producer, reader, permitted action, unknown arm, owner, dataset and numeric criteria. A Codex review of the plan found the roadmap had none. N1 is ADR-075 (Proposed, amended for the same review's four blocking findings). The machine lease is split out of Stage 7 as N3.

**The Codex round on ADR-075 (2026-09-30, gpt-6-astra at xhigh, 3b2a830...4c3c242): REQUEST CHANGES, seven findings, each confirmed against source and fixed with a test that fails without it.** Each mechanism has a catalogue entry, and all ten new ones are RED in an isolated campaign. So are the twenty ADR-075 entries: 30/30 once one entry was repointed (below).
- **#1 SIGTERM waited for the process it had to end.** The child's campaign loop is synchronous (the header of `scripts/mutate.mjs` measured this on 2026-08-27), so a group SIGTERM ended only the test run in flight, and the parent's grace began at the child's exit, which could be hours away. The SIGKILL now fires 2 s after the signal. A group that outlives SIGKILL keeps its worktree, and the lock now names the survivor. Test: the campaign ends within 6.5 s of SIGTERM while a 9 s mutant is still to come. The survivor arm has no test: no fixture can make a process group outlive SIGKILL.
- **#2 The child's marker reached its tests.** `childEnv` kept `QUALITY_HARNESS_CAMPAIGN_CHILD`, so an isolated campaign running this suite gave the suite's own nested `--in-place` campaigns the child's exemptions (no dirty-target check, no exposure line, no load line). Both the marker and the owner path are dropped now. Class: `mrw read --grep "QUALITY_HARNESS_[A-Z_]+\]?: '1'|\[CAMPAIGN_CHILD\]: '1'" scripts plugin` finds this marker and `QUALITY_HARNESS_MUTATION_IN_FLIGHT` (`scripts/mutate.mjs`, `scripts/unasserted.mjs`). The second is inherited on purpose: it tells every descendant that a mutant is live.
- **#3 Parity could certify two incomplete campaigns.** Two runs ended by their timeout after the same first row agreed on every row they had printed. A run is now compared only when it exited 0 or 1, printed its summary, and holds a verdict for every label that `--list` selects. Also found while checking this: the verdict reader required `<-`, so a RED that names no killer was never compared. The parity script and the fixture's `verdicts()` now share one reader; `mrw read --grep '\\s\+<-' scripts tests plugin` found no third reader. Left: nothing fails if the call to `incomplete` in parity's `main` is deleted. The CLI's clean arm cannot tell a skipped check from a passed one, and no fixture yields a deterministic partial run.
- **#4 A child spawned before its parent recorded it.** A parent killed in that window left a lock and an `owner.json` naming only itself, so a sweep could remove the tree under the live child. The child now runs nothing until `owner.json` names it, and gives up once the parent that file names has ended (30 s deadline). Test: a child whose owner file names a dead parent exits 2 within 20 s and runs no suite.
- **#5 The snapshot was git's normalised content, not the checkout's bytes.** A CRLF file under `eol=lf` checked out as LF: `git stash create` exits 0 with a warning and stores LF, measured 2026-09-30. Every tracked regular file whose worktree bytes differ from the checkout's now gets the checkout's, and the run says how many. That overlay also covers uncommitted edits, which made "the worktree holds the uncommitted content" GREEN. The stash is still what carries a tracked file deleted in the checkout, so that entry now names a deletion test and is RED again. Class, via `mrw read --grep "'stash', 'create'|'worktree', 'add'|'clone'" scripts plugin`: this snapshot, and `campaign-parity.mjs`'s clone. The clone is committed content on purpose, and both parity runs read the same clone.
- **#6 Setup after `worktree add` could throw past the cleanup.** The overlay and the selection write now remove the worktree when they fail. A cache that cannot be read in is said, and is neither reused nor written back: the child's cache would replace the checkout's without the verdicts it never saw. Test: a directory where the cache belongs (ENOTSUP on macOS). No fixture makes the overlay or the selection write fail, so their removal arm has no test.
- **#7 The Windows arm of the SIGTERM test raced the surviving child.** The next campaign ran at once and met the correct "another run is in flight". It now waits with `afterTheOrphan`. That test is locked by T2 and T3, so both were relocked after this review (`adr-verify --relock --replace-hashes`, weaker than first-red, and adr-lint says so). Windows has not run it yet.
- **T4's signed-off counts, re-measured with #3's reader at 61a6d83 (after the merge of 3.1.7)**: `campaign-parity --tests tests/lifecycle.test.mjs` 122 entries, 0 mismatches, worktree built in 221 ms; `--shard 1/48` 38 entries, 0 mismatches, 200 ms. Every listed entry was graded in both runs, all RED. Run at `nice -n 10` beside a load of about 9.5 on 10 cores.

**The Codex round owed by 3.1.6 (2026-09-30; gpt-6-astra at xhigh over `git diff v3.1.5 v3.1.6` of the six reader files; REQUEST CHANGES, five findings), fixed for 3.1.7 in 236f9ae.** Each reproduced against the shipped readers first, and each has a row in `tests/status-codex-316.test.mjs` and a RED catalogue mutant. What the fixes leave, by class:
- **`re.I` without ASCII folding, the class of finding 5.** `git grep -nP 're\.(I|IGNORECASE)(?![A-Za-z])' -- 'plugin/lib/*.py' 'plugin/bin/*'` counted 79 on 2026-09-30. `re.I` folds `ı`, `ſ` and the Kelvin sign into ASCII and JS's `/i` does not, so a pattern matters only when it holds `i`, `s` or `k` AND answers a question a JS reader also answers. Fixed: `_RECORD_DIRECTORY` and `_RECORD_SECTION`. The other 77 were not audited one by one: task ids, titles, `adr-judge` prose, `OWN_DONE_RE` (`Status|State`). A lead, not a finding.
- **`\s` between `##` and the heading word** still differs: Python's includes `\x1c`-`\x1f` and `\x85`, JS's includes U+FEFF. That applies to `_RECORD_SECTION` against `readsAsRecord`, and to the level marker of `_HEADING` against `STATUS_HEADING`. Finding 4 fixed only the trailing whitespace.
- **JS `.` against Python `.`** was fixed in the Status readers (the fence opener, the heading text). lifecycle's generic `markdownSection` and its other readers were not audited.
- **`STATUS_HEADING`'s text capture** (`[^\r\n]+?` rather than `.+?`) has no test: a heading such as `## Sta` + U+2028 + `tus` is not exercised, so a mutant there would survive.

**A lead for N2 (the reader of `contended`), from N1's first gates (2026-09-30).** Two passing `qh-check` runs of this repository's selftest were marked unattributable: load 3.57 at the start and 10.97 at the end, then 8.73 and 12.82, on 10 cores. After the first one, the machine still stood at 9.8, with macOS indexing daemons (`suggestd`, `spotlightknowledged`) near a core each. So the contention was real, but the end sample also counts the check's own parallel load. An N2 advisory keyed on the end sample would fire on any gate heavy enough to load the machine by itself. N2 has to separate the two before its replay criterion can mean anything: the start sample alone is one candidate; the check's own CPU time against wall time is another. Neither has been measured.

**The Codex round on what 3.2.0 ships (2026-09-30, gpt-6-astra at high, `git diff v3.1.6 32ad1a6 -- plugin/scripts/load.mjs plugin/scripts/qh-check.mjs tests/qh-check.test.mjs`): REQUEST CHANGES, three findings, each reproduced by the reviewer's probes, confirmed against source and fixed with a test beside T1's locked four.** The six new mutants are RED, and so are T1's six and qh-check's eight re-run over the changed files (§18).
- **#1 Rounding hid a load above the count.** `sampleLoad` rounded to two places before comparing, so 4.001 on 4 cores recorded 4 and was not contended. The load is kept as read now. The line shows two decimals unless rounding would put an above-count load on the count, and then it shows the value as read.
- **#2 A sampler that threw stopped the check.** At the start the declared check never ran; at the end no record was written and the exit was lost. A throw is now an unread load, at either end.
- **#3 A malformed value read as a measured quiet load.** A negative or non-finite sample, and an infinite core count, now read as unread. `runCheck` also replaced a `cores: 0` or `NaN` it was given with the host's count, because it tested truthiness; an option passed is now used as given. Class: `sampleLoad` has two callers, qh-check and `campaignLoad` in `scripts/mutate.mjs` (whose `QUALITY_HARNESS_CORES=0` takes the same path), and `mrw read --grep 'sampleLoad|contention\(|loadLine\(' plugin scripts` finds no third.
- **Residual, the reviewer's:** no native Windows run, and no reader of the stderr line's shape outside this repository was checked; the line stays on stderr, apart from the check's own stdout.

**v3.2.0's outside runs at a180e72 (2026-09-30):** php-laravel-monolith (17 records, 24 tasks) and react-spa (2 records, 9 tasks), each with probe exit 0, 0 could-not-run, 0 disagreements, filed with `attest-import`. Two further runners were refused by their own permission classifiers ("Code from External") and were released rather than asked to work around it. A lead from the react-spa runner, confirmed against source: `plugin/skills/corpus-chaos/SKILL.md:166` asks a runner to "paste the `--diff` output and the `--attest` JSON whole", and `--diff` prints removed or added advice lines verbatim, including the corpus's record paths, task file names and test titles. A runner following the skill toward a public destination leaks exactly what "never send the report" protects (CLAUDE.md §6). Next batch: the skill says `--attest` is the only line that leaves the host, or `--diff` redacts paths and titles.

**The release campaign at a180e72 (run 36707652332) failed on Windows, on the first Windows run of ADR-075's tests.** "a second campaign waits while an orphaned child of the first still runs" found no orphan: the next run swept the worktree as its owners' leftover and ran (exit 0, not 2). libuv puts every child it does not detach in a job object that ends the child with its parent, so on Windows a campaign whose parent is killed leaves no child working, which is the better outcome. The test now skips on win32 with that reason. The skip is a test option, and the T2/T3 locks hash the body, so no relock was needed. The same log shows #5's overlay at work on a real `core.autocrlf` checkout: "7 tracked file(s) hold bytes git stores differently".

**v3.2.0 released 2026-09-30 at bf518e3** (release-evidence SUCCESS, 55 jobs; dispatch run 36711099312). Leads left after it, for the next batch:
- **The README had gone stale on shipped behaviour and was rewritten (2026-09-30).** It said `adr-lint` reports a MADR or Nygard file as not recognised. Since ADR-074 (3.1.6), such a record under an `adr/` or `decisions/` directory is linted against this plugin's template and fails on its missing sections, measured on a scratch MADR and Nygard record (exit 1 each). The benchmark and corpus figures moved to `docs/BENCHMARKS.md` with their dates.
- **"the README names every skill and gate this plugin ships" is a substring test.** The `operating` skill was listed nowhere, and the test passed because "Efficient operating model" contains the word. A skill or gate whose name is an ordinary word is satisfied by prose. The rewrite lists it; the check could match a name only as a list item or in backticks.
- **The commit hook's artifact validation named files absent from the working tree** (reported by the react-spa session, 2026-09-29): after `git switch -c <new> origin/master` from a branch that tracked four files the new one lacks, a docs-only commit's block carried "UNPROVEN: could not classify" for those four, by absolute path. The file list came from somewhere other than the current tree, perhaps a record from before the switch. The hook revision was not captured.

**3.2.1 (2026-09-30): the brief's false red, the --diff leak, and the README test.**
- **branch-state raised an old commit's failure as this branch's CI.** `gh run list --branch main` intermittently served a page of runs weeks old: 24ce31b and aa74be9 on 2026-09-30, and 3ecf036 at b866a0f on 2026-09-29. `headRuns` answered with the newest listed run whenever HEAD had none, so the brief said `⚠ CI 24ce31b: FAILURE` over a green branch. Where the pushed tip (`origin/<branch>`) is read, only HEAD's runs or the tip's answer; otherwise it is COULD NOT LOOK, naming the shas it saw. Where the tip cannot be read, the old fallback stands, which keeps §304's locked tests byte-identical. The same query from a shell and through `shell()` returned today's runs moments later, so the stale page could not be reproduced on demand. Four new mutants, and all 41 branch-state entries, are RED.
- **corpus-chaos asked runners to paste `--diff` output, which prints a corpus's record paths and test titles** (the react-spa runner's lead). The class is the skill's whole verbatim design, which is deliberate: defects live in the exact sentences a reader prints. So the rule is now where the output goes. Verbatim output goes only to the asker by direct reply, never to an issue, a pull request or a commit, and only the attestation is ever filed. Enumerated with `rg -n -i "verbatim|paste .*(report|output|whole)|everything it printed" plugin/skills CLAUDE.md .claude/rules/18-somebody-else-runs-it.md`. The runner steps and the asker's request are changed. CLAUDE.md §18's "ask for everything it printed, verbatim" stands, because it is a private channel; that it must never reach a public destination is not written there, and CLAUDE.md is the owner's to change.
- **"the README names every skill and gate" now requires a backticked name**, and shows that a prose word fails. The `operating` skill had passed unlisted.
- **Left for the next batch:** the staged-index advisory reads the index before a `git add` in the same command runs (a classifier change, measured against shells first, §16); stale artifact-validation paths after `git switch` (not reproduced); a `qh-check` pass recorded in a linked worktree does not count for the main checkout's pre-push hook (ADR-068's per-worktree state; a pass over identical content is still evidence).
- **The Codex round on a50270e (gpt-6-astra at high): REQUEST CHANGES, four findings, each confirmed by the reviewer's probes and fixed.** (1) When the collection budget ran out after `gh`, the tip read never happened and the old fallback answered, so the tip and HEAD are now read before `gh`. (2) A stale local `origin/<branch>` was taken for the forge's tip, so a tip's answer is now labelled "the pushed tip as last fetched; HEAD has no run". (3) The run choice read `origin/<branch>` while `snapshotKey` followed the configured upstream, so the tip is now `@{upstream}` first, as the key resolves it. (4) A prefix match is not identity: whole shas are now compared whole, and a prefix counts only when it is 7 to 40 hex digits and names exactly one listed commit, so a one-letter sha and a shared prefix name nothing. Three more mutants were added, two were repointed, and all 44 branch-state entries are RED. **Left, for the owner:** where no tip can be read at all (no upstream and no `origin/<branch>`), the newest listed run still answers, named. Removing that means relocking the §304 tests that pin "the newest commit's runs answer" (11 of them failed under the strict rule).

**v3.2.1's outside runs at 025584a (2026-09-30):** php-laravel-monolith (17 records, 24 tasks) and react-spa (2 records, 9 tasks), each with probe exit 0, 0 could-not-run, 0 disagreements. The readers digest moved from 79a695dc… to afe2319f…, and the react-spa runner's own `--diff` showed nothing else change.
- **A refusal of a commit in a scratch repository, classified as by design.** `D=$(mktemp -d …); cd $D && git init && … git commit` was refused as this repository's unchecked publish. ADR-066 T3's `leavesHookInPlace` fails closed on any `$` (plugin/scripts/lifecycle.mjs:4679), and the text refusal judges the session's working directory. So a command whose target directory is built at run time keeps ADR-061's refusal, because nothing in the text proves which repository it commits into. The work around it was legitimate: the commit was made from a Node script's own `spawnSync`, as the tests make theirs. **The candidate false refusal is its literal-path twin,** `cd /abs/other && git commit` or `git -C /abs/other commit`, where the text does name a repository that is not this one. It was not observed, and it needs §16's measured cases and "this is code again" twins (`cd .`, `cd "$(git rev-parse --show-toplevel)"`) before a sanctioned refusal changes.

**branch-state's last fallback removed (the owner, 2026-09-30).** In 3.2.1, where no pushed tip could be read at all, the newest listed run still answered for the branch. A stale page could therefore still show an old commit's verdict, including a stale green, on a checkout with no upstream. Now only HEAD's runs or the tip's answer; otherwise COULD NOT LOOK, "and no pushed tip could be read". A tip's answer is noted after the verdict ("the pushed tip as last fetched; HEAD has no run"): inline in the brief, and on its own line in the full form, so the verdict and its runs still follow the sha.
- §304's ten fixtures list runs only at a commit other than HEAD. They are kept byte-identical: the tests' `runner` helper answers the tip with the newest commit its `gh run list` fake lists, the world those fixtures describe, unless the table names a tip itself.
- One locked test, "a refresh that still renders the same brief line is not reprinted", builds a real repository with no upstream. Its fake `gh` now reports that repository's HEAD. The test is about dedupe, not run selection. ADR-065 T1 and T2 were relocked (`--relock --replace-hashes`, weaker than first-red).
- A mutant that restores the fallback is RED, and so are all 44 branch-state entries.

## 322. FIXED 2026-09-30 — ADR-076: a recorded mutant runs in a worktree, and what its execution found

ADR-076 (N4) executed on `spec/isolated-mutant`, fast-forwarded into `main` at e0e8376: T1 3e1b214,
T2 26d099f, T3 176d7b0, the Codex round 4300b93, T4 e0e8376.

- **One mechanism, shipped.** `plugin/scripts/worktree.mjs` builds, removes and sweeps; `scripts/mutate.mjs`,
  `plugin/bin/adr-verify` and `scripts/unasserted.mjs` all use it. S6 re-ran every catalogue entry on the moved
  code uncached (135/135 RED on `worktree.mjs` and `mutate.mjs`, 128/128 on `adr-verify` and `fence.py`).
- **The move broke one fixture, and the class was one member.** `tests/mutation-cache-merge.test.mjs` copies
  `mutate.mjs`'s plugin imports into a temporary directory and did not copy `worktree.mjs`. Found by S6 as an
  UNPROVEN baseline, not by the unit tests. Enumerated with `mrw read --grep "load\.mjs'|main-module\.mjs'" tests/
  scripts/ .github/`: the only copy list of that import closure.
- **A SIGTERM during the worktree build left the tree behind**, 10 times in 10 when forced, and twice in the
  suite under load. The build now holds SIGTERM and SIGINT and acts on them once the id is known.
- **The Codex round: seven findings, all held against source, all fixed** (4300b93's message lists them): a fence's
  group settled before its tree goes; a fence gated until it is recorded; `unasserted.mjs` records its process
  group; a symlinked target is refused; F-4's boundary on both sides, shell metacharacters included (the spec is
  amended); the builder in a session of its own; `build()`'s setup inside its error contract.
- **T4, signed off by the owner:** three pinned replays — ADR-075 T1 (`plugin/scripts/load.mjs`, "a load at the
  core count is not contended"), ADR-074 T1 (`plugin/bin/adr-retire-check`, "adr-retire-check bypasses the shared
  rule"), ADR-072 T1 (`scripts/mutate.mjs`, "a RED record carries its killers") — each isolated and `--in-place` in
  fresh clones, at 176d7b0 and again at 4300b93: 12/12 completed and killed, every isolated first line "isolated
  in", zero mismatches. This closes the ADR's follow-up.
- **One deliberate deviation, stated in 176d7b0:** `unasserted.mjs`'s dirty-target refusal applies in place only.
  Isolated, the worktree's copy is what is neutered, so refusing there refused correct work.

Left open, each a lead:

- **The Windows ownership record names the leader pid, not the job's members** (Codex's residual risk), and
  `unasserted.mjs` records no group on Windows at all. A killed owner there leaves a tree the sweep keeps only
  while that pid lives. Nothing here can run Windows; the release's outside run is where it would show.
- **The Ctrl-C test reaches the build window only by timing**; its mutant survived once. A deterministic twin now
  asks the builder's process group through a PATH shim, and the catalogue entry names both.
- **A `UserPromptSubmit` brief named `spec/machine-lease @ 8024144, 4 uncommitted`, read 15109s ago**, while no
  checkout on this machine held that branch and both worktrees' caches read correctly. Not reproduced, cause
  unknown: which directory the hook read from is the first question.
- **`adr-verify --help`'s exit-code paragraph was garbled** ("… nothing was / could-not-look class as
  `inconclusive`"): 022e9ce dropped "read and nothing was written — the same" from the middle of a sentence.
  Restored in the commit that files this entry (found by `git log -S`, not by any check: prose in help text has
  none).

## 323. FIXED 2026-10-01 — ADR-077: a heavy run holds a lease, and the review of the 3.3.0 candidate

ADR-077 (N3) executed on `spec/machine-lease`: T1 4535501, T2 4231a77, the review round after.

- **T1:** `plugin/scripts/lease.mjs`, and `qh-check` takes a lease, names its neighbours at the check's start
  and end (`beside`, `besideAtEnd`, `waitedMs`), waits its turn when asked, and releases after the check has
  closed. **S6 found the ticket-order test blind**: its two waiters poll 50 ms apart, so a rule that ignored
  tickets still passed; a test that asks `admit` directly now kills it (a survivor stays in T1's Mutation Log).
- **T2:** a campaign holds the same lease in its parent, recording the isolated child and its group.
  **S6's first killed-parent mutant survived** because child OR group keeps the lease live; the mutant that
  removes both is killed. One `alive` now: `worktree.mjs` wraps the lease module's three-valued probe.
- **ADR-076 T3 relocked** (weaker than first-red, and adr-lint says so): the test-lock hasher took
  `test('a negative value is a finding', …)`, declared INSIDE the string constant `SUITE`, for a test of that
  file, and its "body" ran on into the fixture helper T2 extended. **Open lead: the lock hasher reads tests
  inside string literals.** Enumerated with `mrw read --grep "[\"'\`]test\('|\\\\ntest\(|\"test\(\"" tests/`:
  ten files declare a test inside a string (campaign-fixture.mjs, chaos-315-mutate-catalogue.test.mjs,
  gate-regressions.py, leftovers-after-adr053.test.mjs, mutate-isolation.test.mjs, mutate-runner.test.mjs,
  relock-stress.py, test-lock-stress.py, test-lock.test.mjs, unasserted-isolation.test.mjs). Any lock over
  one of them can move when an unrelated helper does.
- **The review of the 3.3.0 candidate (Codex, xhigh, at 4231a77): eight findings, all held against source.**
  Fixed with a test each, red first, and a catalogue entry each: (1) the default lease directory is trusted only
  as this user's own, not a symlink, not writable by others, and temporary lease files are created exclusively;
  (2) deciding that a waiter may start and marking it running are one step, under an atomic `mkdir` lock with a
  dead or stale holder broken — Codex's interleaving admitted two waiters; (3) a campaign waits BEFORE any signal
  handler is installed, since its wait is synchronous and a handler held the signal until the work had started;
  (4) every lease step in `qh-check` and the campaign is a diagnostic, and the check's exit and record stand;
  (6) on Windows a fence has ended only when its job was CLOSED, not because one existed; (7) a campaign names
  its neighbours at its end too; (8) a wait bound that overflows to Infinity milliseconds is the default.
  **(5), the isolated child released by `owner.json` before its lease named it, is fixed by order and has no
  test**: the window lies between two adjacent statements and nothing can land in it from outside.
- **The candidate's own campaign found two tests that stopped proving their mechanism** (47 entries re-run
  uncached, 45 RED). `ADR-076 T2: a stopped run removes its tree` went GREEN: since the build holds its
  signals, the test's SIGTERM, sent as soon as the worktree appears, mostly lands during the build, so the fence
  never starts and the fence's own end is never exercised; a test that signals only once the fence runs now
  kills it. `Codex 3.3.0 #1`'s first mutant only dropped the symlink check, and a symlink then failed the
  next check ("not a directory") anyway; the mutant that FOLLOWS the link is the one that matters, and is RED.
- **CI at the first candidate (10a0c96) failed two jobs, three findings, none reachable on this Mac.**
  Windows: `adr-verify` named the checkout in git's `C:/…` spelling where the native one was expected
  (the resolved spelling is now tried first), and a lease recorded `root` the same way (`take` records
  `path.resolve(root)`). Coverage floor: `a campaign leaves nothing in the temp directory` found the
  default lease directory left in a TMPDIR the test chose, because `coverage.sh`, unlike `selftest.sh`,
  names no private lease directory; a run now removes a lease directory it MADE once its last lease goes
  (rmdir, so anything else in it keeps it), and never one a caller named. Both lease fixes change a reader,
  so the attestations at 10a0c96 no longer cover the release and were asked for again.
- **CI at the second candidate (35b36fa): Windows passed; two more findings.** macOS CI left a worktree
  behind in `a process a fence leaves running is ended before its worktree goes` because `settle_group`
  read `EPERM` — which macOS answers for a group whose killed members are zombies not yet reaped — as
  "not ended" and stopped at once; only ESRCH now proves the end, and anything else is asked again until the
  grace runs out. And the coverage job's instrumentation made a detached branch-state refresher outlast a
  15 s wait in `the cached branch CLI reads a fresh answer without starting Git`; that wait is a hang guard,
  now 60 s, since a healthy refresher answers in well under a second. Neither reproduced on this Mac.
- **Correction to the line above: widening that wait did not fix it.** At eabf6a3 the push run's coverage job
  failed the same test after 61 s, so the refresher never wrote its snapshot in that environment at all — not
  slowness. The dispatched run at the same sha passed it, and `--experimental-test-coverage` on Linux CI is the
  only place it has failed (2 of 3 coverage runs since 10a0c96; never under the plain selftest on any platform,
  never locally, including under `coverage.sh`). **Open lead, cause unknown**: the test writes its stale
  snapshot without a `key` and an earlier step runs with a nonexistent `GIT_DIR`; the next useful move is to
  make `waitForSnapshot` report what it found on timeout (the lock, the snapshot, the trace) rather than guess.
- **§322's unexplained brief, explained.** `branch-state --cached` serves the stored snapshot first and
  labels its age, and this machine's main checkout had been on `spec/machine-lease` hours earlier; the same
  shape recurred at 5627 s ("main @ e0e8376") and was then replaced by a fresh answer on the next prompt. The
  reader said what it had and how old it was. What remains is a judgement, not a defect: whether a snapshot
  hours old, naming a branch the checkout no longer holds, should be shown at all.
- **v3.3.0 released** at eabf6a3046b0bb13a1e0643577b0e75bed409422 (release-evidence SUCCESS: 55 jobs,
  dispatched run 36786131988; outside runs php-laravel-monolith at eabf6a3, and react-spa and
  php-laravel-monolith at the two earlier candidates, all filed in `docs/corpus-reports/`).

## 326. FIXED 2026-10-01 — The Codex round on ADR-078 (01443dd): seven findings, four of them fail-opens

gpt-6-astra at xhigh, read-only, over `d93da62..01443dd` (record.py, adr-verify) and `v3.3.0..01443dd`
(branch-state.mjs): REQUEST CHANGES. The reviewer ran each input through node v26.10.0, so each P1 below is an
edit that changes node's exit while the lock stayed clean. Each finding has a red regression in
`tests/test-lock.test.mjs` or `tests/branch-state.test.mjs`, and a catalogue entry `Codex 01443dd: …`; all 13
are RED.

1. **A literal at the start of an arrow's expression body was masked as white space.** The body began after it
   (`() => 'enabled' && …` hashed `&& …`), and a template's interpolation could become the "block". Literals
   now mask as NUL.
2. **Divisions read as regexes.** The property test looked back over white space only (`obj./* gap */in / 2`),
   `of / 2` was read by the keyword table, and TypeScript's `n! / 2` read `!` as an operator. A property is now
   the previous token being `.`; `of`, `yield` and `await` are UNPROVEN; `!` after a value in TypeScript is
   postfix.
3. **Regex data named as a test.** `debugger` then `/test('ghost', …)/`, and the same after `for await (…)`.
   Every reserved word that cannot end a value now opens a regex, and `for await (` is a for header.
4. **Unicode white space and line terminators.** U+2028 did not end a line comment, and U+00A0 was read as part
   of an identifier. Both are now JavaScript's own sets (ECMA-262 §12.2-3).
5. **A file ending inside `${…}` read as complete.** It is now UNPROVEN from the template's start (F-7).
6. **A lock that cannot be read was read as hasher 1 by `--relock`, and a payload with two check records chose
   one.** Two check records make a lock unreadable; `--relock` refuses an unreadable lock unless
   `--replace-hashes`; any `check@<n>` is read, and an unknown n is UNPROVEN.
7. **The brief's ten-minute cap was skipped on a fresh cache hit** (`--cached 3600` showed a 30-minute-old
   answer), and it compared a rounded age (600.4 s passed). The cap now bounds every brief and compares
   milliseconds.

Re-run after the fixes, over every `.mjs` under `tests/`, `plugin/` and `scripts/`: hasher 2 loses no body
hasher 1 bounds, drops no top-level test, and stops early on no file.

## 327. FIXED 2026-10-01 — After 3.4.0, judged from an adopter's session (§19): what the brief repeats, a regression 3.4.0 shipped, and which records session start reads

1. **Only a red CI repeats; an unknown is said once** (owner's decision). On any unpushed branch an adopter
   was told "COULD NOT LOOK — no run recorded for this branch" on every prompt until they pushed. `ciRed`
   replaces `ciAlarm`, and a snapshot withheld past the cap is said once. Committed as 2d8c473.
2. **3.4.0 doubled `adr-next`.** Over this corpus's 69 task directories it took 15.7 s at 8eb438c, against
   7.7 s at v3.3.0 (measured in one process, 2026-10-01). The cause: `lock_findings` read every hasher-1
   lock a second time, under hasher 2, to build the relock advice, and `adr-next` and `lock_blocks_done`
   discard that advice. They now pass `advise=False`. A file's digests are also memoised on its text,
   because a record's tasks name the same test file and each task's snapshot re-read it. After both:
   4.0 s for the same 69 directories.
3. **Session start read the oldest records.** `TASK_DIRECTORY_READ_CAP` took the first six directories
   listed: here ADR-001 to ADR-006, all done. It now reads the six whose task files changed most recently
   (newest modification time; no process start, and uncommitted work ranks first). Reading those heavier
   records made session start take 2.4 s; after item 2's memoisation, 1.2 s warm and 1.65 s cold
   (0.9 s at 3.3.0, over the wrong records). Codex's architecture review named this, as finding 4.
4. **Left, with reasons.** The listing descriptions (7.4 KB, always on) are not shortened: the plugin's
   evals name skills explicitly, so nothing measures description-based routing, and a cut would be
   unmeasured. The six `adr-next` spawns are not batched into one process, because the saving is
   interpreter starts, and no Windows timing exists to set a target (§325).
5. **The Codex round on f79d84d (gpt-6-astra at xhigh): REQUEST CHANGES, one P2.** The cache writer keeps `said`
   across a refresh, so the withheld stamp, a constant, silenced the next snapshot's expiry: refresh, full report,
   601 s on, and the brief said nothing over an answer it was withholding. The stamp now names the snapshot by its
   `at`. The regression replaces the snapshot under a kept stamp; two catalogue entries cover it, both RED. The
   reviewer found nothing else material in the lock or ranking changes, and probed both with simulated Windows paths.

## 328. CLOSED 2026-10-06 (not reproduced; its instrument stays) — A campaign printed nothing on Windows, once, inside a locked test

The Windows job of push run 36837928673, at 9845434 (a docs-only commit), failed
`tests/mutate-runner.test.mjs` "the campaign cache records the tests that killed each RED entry", at its
line 1026. The test's third campaign printed **nothing** to stdout, so "1/2 mutations were noticed." was
absent. The whole test took 34 s, well inside its 180 s timeout. The same code passed Windows at 8eb438c,
before that commit, and at 7906383, after it. Nothing in 3.4.x touches the campaign runner.

What is not known: why. The assertion message carries only stdout, so the campaign's stderr and exit status
were never shown, and the test is locked by two records (ADR-073 T1, ADR-075 T2), so it cannot be changed to
show them. Next time it fails, read the job log for the campaign's own lines before the assertion. A new
test beside it, asserting the campaign's exit status and printing its stderr, would make the next occurrence
say why.
  **Added the same day:** `a campaign that prints no summary says why: its exit, its signal and its stderr`
  (tests/mutate-runner.test.mjs), beside the locked test. It runs one campaign over the same shape, and when it
  fails it prints the exit status, signal, error, stdout and stderr, so the next Windows occurrence carries its
  own cause.
- **Correction to ADR-078's Out of Scope, found while scouting the convergence:** `plugin/bin/spec-verify:636`
  reads **Swift** (`_matching_js_brace` over a Swift-masked text), not JavaScript. The JavaScript reader in
  spec-verify is `test_definition_exists` (`plugin/bin/spec-verify:348-360`): its own `mask_noncode` with
  `regex_literals`, plus `registered_test_names`, and a JavaScript suffix list without `.mts` or `.cts`. The
  record is history and stays as written; this line is the correction.

**Closed 2026-10-06, not reproduced.** The Windows job has run `tests/mutate-runner.test.mjs` in every push and
dispatch since — 17 Windows runs from 2026-10-02 to 2026-10-06 alone — and the campaign printed its summary each
time. The test added beside the locked one prints exit, signal, error and stderr when it fails, so a recurrence
arrives with its cause; reopen then.

## 329. CLOSED 2026-10-06 (reworked, Accepted, shipped in 3.7.0) — ADR-079 (every gate reads JavaScript one way) is parked on its review

A cold Codex review (gpt-6-astra, xhigh) of the Proposed ADR-079, its spec and its stubs asked for changes,
with eight findings, each reproduced by the reviewer.
1. The rule "UNPROVEN when the name occurs past the lexer's stop" misfires both ways: an escaped title is
   decoded, so it never occurs verbatim; a substring of other data (`ghostly`) triggers it; and a head
   before the stop with its body past it reads as missing.
2. `js_title_exists` (adr-lint:4613) is a second existence path. It searches the raw source, and spaced
   titles take it before `test_body` is reached.
3. The can-fail check re-scans the extracted body with `code_only`. An assertion inside `${…}` reads as
   "asserts nothing", and `/assert/` reads as an assertion.
4. Three registration vocabularies still disagree: `test.skip`, `test/* */(`, `helper.test`,
   `describe`, `t.Run`, and an interpolated title.
5. The class audit missed `commented_out`, the Ruby and declaration fallbacks, `resolve_enforcement`, and
   `.mts`/`.cts` at adr-lint:3772.
6. The stubs pass a deliberately wrong implementation, T1 asserts no CLI exit 4, and T2's CLI fixture never
   runs its checks, because no task is evidenced.
7. Both fences count matching lines, so a duplicate passing title satisfies them.
8. The corpus bar has no defined comparison, its baseline is taken after the change, and its exceptions
   are inconsistent.

Next: rework the spec and ADR against these, then run one more review.

**A second review, pasted by the owner (2026-10-01), agrees with every finding above.** Its citations were spot-checked against source: `plugin/bin/adr-lint:3801` and `:5402`. It adds two things for the rework:
- Narrow the consequence that "the three gates agree on which tests exist". The registration vocabularies still differ (`test.skip`, `describe`, `t.Run`, interpolated titles), and the spec's non-goals freeze that.
- Make the corpus bar a diff of a baseline captured BEFORE the edit against the after run, with an explicit exception list, empty meaning no difference is allowed.


**Reworked and accepted, 2026-10-01.** A read-only scout mapped every JavaScript-reading site, and the record was
rewritten from that map. A third review (a cold Codex round on the rework) found seven more gaps. The owner chose
to fold them in and accept without a fourth review of the record; the implementation gets its own Codex round and
outside corpus runs. The new rule: a test not found in a file the lexer did not read to its end, or found with a
body that cannot be bounded, is UNPROVEN. ADR-079 lists the full class, the residuals it does not claim to fix,
and the comparator its T4 runs against `plugin/` at cd8f95f.

**Closed 2026-10-06.** ADR-079 was reworked against these findings and accepted (031ffb6), executed (efd7cdf),
its Codex round folded in (6f258e2, §336), and released as 3.7.0 (723fa19). `adr-next` reads all four tasks done.
## 331. CLOSED 2026-10-02 (each residual disposed below) — ADR-080 shipped behind the boundary; what its code review changed, and what is left

ADR-080 is executed: no boundary gates artifacts in line. Replayed on a local clone of an adopter's real 422 KB
session log, a commit's PreToolUse took 44287 ms at 9ed651c and 164 ms after; the detached pass then gated all
217 targets in 93 s, in one pass.

A cold Codex round on the code (gpt-6-astra, xhigh) asked for changes. Each finding was confirmed against
source, fixed, and given a test and a catalogue mutant:
1. A finding's key was only path and content, so a timeout said first silenced a later real finding about the
   same bytes. The key now also carries whether the verdict was complete, and a hash of what it said.
2. Reclaiming a stale lock could leave two owners, and a late release could delete a successor's lock.
   Reclaim now goes through a successor file named for the stale lock's token, created exclusively. A pass
   releases only before its deadline, and it stops gating by the lock's deadline less its grace.
3. A batch that stopped on unconfirmed cleanup stopped only its chunk. It now says so on the batch protocol,
   and the pass stops; the rest is said UNRUN.
4. A pass that failed, or could not write its ledger, could stay silent. The hook records each pass it starts
   in the session log, and the next hook says UNRUN for a pass that left no end.
5. A failed spawn's `error` was attached after an early return. It is attached first.

Left, named rather than fixed:
- **No test produces a real failed spawn** (`child.pid` undefined); the fix is the listener's order only.
- **Windows job objects:** a host that kills its hook's job may take a detached child with it. Unverified;
  a pass that dies leaves its lock to lapse, and the next boundary resumes it.
- **The import reads the ledger and the session log on every hook.** Its cost at adopter scale is not
  measured.
- **The one-second race left by item 2:** an owner releasing at the exact instant of its deadline can still
  remove a successor's lock. The cost is duplicate gating, never a lost verdict.
- **branch-state said `CI COULD NOT LOOK` twice on 9ed651c**, naming runs at shas from an older page
  (3ecf036, then c11a507), while `gh run list` listed 9ed651c's run first and green. Reproduce the query the
  brief makes before deciding whether it is `gh` paging or the reader's selection.
- **`checkInputs` reuse, deferred by the owner (ADR-081 Out of Scope).** It would let a pass stand across a change
  that touches nothing the check reads. It cannot be measured yet: those adopters edit through Bash and mrw, which
  log no `file.written`, so "only non-code changed since the last pass" has no ground truth in their logs. Revisit
  once a source of truth for edits made outside the file tools exists.

**Disposition, 2026-10-02.** No residual is left open without a trigger:
- **No test produces a real failed spawn.** Deferred. The pass spawns `process.execPath`, which cannot
  fail to start without a seam this code does not have. The listener is attached before any return
  (`lifecycle.mjs`, the `child.on('error', …)` beside the spawn), and `!child.pid` is said UNRUN.
  Trigger: the next change to that spawn adds an injectable spawner and this test with it.
- **Windows job objects.** Closed as observable: since item 4, a pass that dies with its host's job
  leaves no end, and the next hook says UNRUN for it. Trigger: an outside Windows run reporting that
  UNRUN line.
- **The import's cost at adopter scale.** Deferred to ADR-081's follow-up measurement (on or after
  2026-10-08), which reads the adopters' hook timings in the same pass.
- **The one-second release race.** Closed as accepted: its cost is a duplicate gating of the same
  targets, never a lost verdict.
- **branch-state's stale `CI COULD NOT LOOK` on 9ed651c.** Deferred: it has not recurred since. Trigger:
  the next occurrence is re-run with `QUALITY_HARNESS_TRACE_FILE` set, which records the query the brief
  made, before deciding between `gh` paging and the reader's selection.
- **`checkInputs` reuse.** Deferred by the owner, now with a trigger: mrw appending `file.written`, and
  the shell hook appending it for Bash writes. An inbox finding for mrw's project records the first of
  these.

## 332. CLOSED 2026-10-01 (fixed for 3.6.1; unproven on Windows) — Windows: a campaign's parent cannot rename onto `owner.json` while its child reads it

Seen once, on the dispatched release campaign of ab59864 (run 36867526703, job `windows`). The test
`a narrowed entry whose baseline runs fewer tests than it names is STALE, and one that runs them all is measured`
(tests/mutate-runner.test.mjs) failed with exit 2:

```
mutate: Error: EPERM: operation not permitted, rename '…\.git\qh-campaigns\4908-242f29\owner.json.4908.tmp' -> '…'
mutate: the isolated campaign's parent ended before it recorded this run, so it does not start
```

Neither `scripts/mutate.mjs` nor this test changed in 3.5.0. The likely mechanism, not yet reproduced: the parent
publishes `owner.json` with a write to a temp file and a rename onto it (`scripts/mutate.mjs:333`), while the child
polls the same file (`ownedBy`, `:216`). Windows refuses a rename onto a file another process holds open, where POSIX
replaces it. The child then ends without its run, which is correct, but the campaign said nothing a person can act on.
Next: reproduce with a reader holding the target open, then retry the rename a few times with a short delay, as
`rmSync`'s `maxRetries` does, and say so if it still fails.

**Fixed for 3.6.1, without a Windows reproduction.** `plugin/scripts/replace-file.mjs` retries a rename that
Windows answers EPERM, EACCES or EBUSY up to 8 times, waiting about 0.7 s in all, and still throws any other
error, or the last one. The class, enumerated with `git grep -n "renameSync(" -- plugin/scripts scripts plugin/bin`,
plus the aliased rename a cold Codex review found that grep could not:
- `worktree.mjs:61`, the owner record: this failure. It now uses the helper.
- `lease.mjs:61`: a failure there said "could not use the lease". It now uses the helper.
- `lifecycle.mjs`, the pass lock's successor: a failure starts no pass this time.
- `branch-state.mjs`, both renames: a failure counts the lock as held.
- `scripts/mutate.mjs:241`, `writeBackCache` (renameSync aliased as `rename`): a failure keeps the old cache and
  says so.
The last three were already safe, so they stay as they are. The tests drive the helper through its `rename` and
`sleep` seams, and run both callers through it (tests/replace-file.test.mjs); no macOS test can make a real
rename busy. The diagnosis is likely, not proven: libuv opens files to allow deletion, so "another process reads
it" alone may not be the cause. A later Windows campaign is what would show that the race is gone.

## 333. CLOSED 2026-10-02 (not recurred) — Windows: `mutate --narrow` once missed its `3/3 mutations were noticed.` line

The push run of 6782901 (run 36894085194, job `windows`) failed one test:
`mutate --narrow proposes, writes only with --write, and undoes a narrowing that is not RED`
(tests/mutate-runner.test.mjs), at `assert.ok(run('--force').stdout.includes('3/3 mutations were noticed.'))`. The
test took 33 s. The dispatched campaign at the same sha (36894098947) passed it on Windows, and v3.6.0 was cut on
that run. The assertion message carries no stdout, so the run's own words are lost. This is the same shape as
§328: a Windows campaign that prints no summary. Next time it fails, read the job log for the campaign's lines
before the assertion. If it recurs, a test beside it that prints the run's stdout and stderr on failure would say
why, as §328's did.

Closed 2026-10-02: it did not recur. On every `selftest.yml` run after 6782901 that reached the `windows` job
(19 runs, 5 of them dispatched campaigns: 6f6ddaa, 723fa19, f1ad71c, e8a3de8, 4171b6e), that test passed in
3.1–8.4 s, against the failing 33.2 s. Read from each job's log. The same test failed nowhere else.

## 334. CLOSED 2026-10-02 (not reproduced; the left-behind worktree is by design) — an isolated `adr-verify --mutant` ran a corpus fence many times slower than the checkout did

Observed while recording ADR-079 T4's mutants. Its fence, `scripts/verdict-diff.sh`, runs `adr-lint`
and `spec-verify` over every tracked record and spec, twice per side. In this checkout one
`--control` comparison took 78s. Run through `adr-verify --mutant` in its default isolated worktree
(`.git/qh-campaigns/<pid>/tree`, ADR-075), the clean fence's first pass had reached ADR-035 of 74
records after 31 minutes, at a load average near 4 on 10 cores. The run was stopped, its worktree
removed by hand (`git worktree remove --force`), and the mutants recorded with `--in-place`, where
each took minutes.

Not measured: which call is slow inside the worktree. Candidates to time first are the git calls
`adr-lint` makes per record (`tracked_or_unignored_paths`, the test-lock reads) from a worktree nested
under the parent's `.git/`. Also not measured: whether a killed isolated run is meant to leave its
worktree behind. `adr-verify --restore` said nothing was recorded, and the worktree stayed until it
was removed by hand.

Closed 2026-10-02, on two measurements at load about 5.5 on 10 cores:
- `adr-lint` on three records took 0.71/0.44/0.46 s in the checkout and 0.60/0.39/0.51 s in a
  worktree built by `plugin/scripts/worktree.mjs build`.
- The whole `scripts/verdict-diff.sh cd8f95f` took 74 s in that worktree, against 78 s in the
  checkout.

So neither the nested worktree nor the git calls of adr-lint reproduce the slowdown, and nothing
in how `adr-verify` spawns a fence sets a different environment. The 31 minutes stays an
unexplained observation of one run, UNPROVEN as a defect. If it recurs, time the fence's own
children while the run is live.

The worktree it left behind is by design. `adr-verify` leaves a killed run's tree for the next
isolated run's sweep (`plugin/bin/adr-verify` around the "left for a later sweep" message, and the
`worktree.mjs sweep` call before a build). Removing it by hand pre-empted that sweep.

Not recurring, 2026-10-02: ADR-083 T4's two `--mutant` runs of the same corpus-wide fence, in the default isolated worktree, took 230 s and 324 s.

## 335. CLOSED 2026-10-02 (the spec was corrected) — ADR-079 F-11's rationale says a moved lock is advice below `strictFrom`; the code blocks it

F-11 (`docs/specs/2026-10-01-every-gate-reads-javascript-one-way.md`) says UNPROVEN "keeps a moved
lock's exceptions: on a frozen archived record, and on a record below `strictFrom`, it is advice".
ADR-079 T2 built that for UNPROVEN, and its test asserts both halves. But `check_test_lock` demotes a
moved lock only on a frozen record. It runs inside `errors.protected()` and raises with
`evidence=True`, so below `strictFrom` a moved lock still blocks. The behaviour asked for is
unambiguous; the comparison it is justified by is not true of the code. Which one should change is
the owner's call: the spec's sentence, or the lock's handling below `strictFrom`.

Owner's decision 2026-10-02: the spec changes and the lock does not. A moved lock is evidence, and
`strictFrom` never demotes evidence; UNPROVEN is advice there because it is could-not-look. F-11 now
says so. Its bound test keeps the name it was locked under, and the spec row notes that.

## 336. CLOSED 2026-10-06 (residuals are ADR-079's stated limits) — ADR-079's Codex round on efd7cdf: four findings fixed, residuals named

One round (gpt-6-astra, xhigh, read-only, REQUEST CHANGES). Each finding was reproduced against
source before it was fixed, and each fix has a regression with an adverse twin in
`tests/js-reading.test.mjs` and a catalogue mutant run RED:

1. P1: a Tests row naming its own file (`probe` in `probe.mjs`) skipped the existence check, and
   the can-fail check said UNPROVEN only for spaced titles, so an unbounded body there was silence.
   `names_its_own_file` is now one predicate read by both checks.
2. P2: `const checkIt = helper` was followed as a helper, bounded from the binding, and borrowed the
   next function's assertion. Only a binding whose value is a function or an arrow is followed now.
3. P2: `test('x' /* why */, …)` read as missing, because the lookup skipped only whitespace between
   the title and its comma. It now also skips a comment the lexer placed, and nothing it could not.
4. P2: `verdict-diff.sh` erased any `/tmp/…` word, so two findings differing only there compared
   equal. It now takes out only the version stamp and the side's own plugin path. Its control
   wraps BOTH sides, differing only in such a word, so a normalisation that erases one fails it.

Residuals the reviewer named and nothing here changes: a named callback (`test('x', helper)`) named
by an identifier blocks `done` as UNPROVEN, which is the ADR's rule for a body that cannot be
bounded; `test.each(table)(…)`, generic callbacks and escape decoding keep their earlier limits.
Not rerun by the reviewer: the CLI fixtures and the corpus comparison (rerun here: no verdict changed).

**Closed 2026-10-06.** The four fixes shipped in 3.7.0. The named residuals are the record's own rule, not
leftovers: a body that cannot be bounded is UNPROVEN and blocks `done`, which is the safe direction.

## 337. CLOSED 2026-10-02 (ADR-083, for 3.9.0) — the JavaScript lexer has no JSX mode; 3.7.0 refused real tests in React corpora

Reported by two outside runs against 3.7.0 at 723fa19, before its tag (a react-spa corpus and a
laravel-react-monorepo corpus). Both showed records going adr-lint PASS → FAIL on done tasks naming
tests that exist, all in `.test.tsx` files. The first runner measured `_js_lex(text, ts=True)` over
its corpus: 61 of 65 `.tsx` test files stop, and 0 of 50 `.ts`. Every stop is at the `/` of a closing
or self-closing tag. Reproduced here: `it("a", () => { render(<B>x</B>) })` followed by `it("b", …)`
stops at the `/` of `</B>`, and `b` reads UNPROVEN, in `.tsx` and `.jsx` alike. The second runner
found two of its six refused titles registered further down their files, and three genuinely gone
(stale rows); a lexer that never reaches the end can say neither.

Fixed for 3.7.0 by the owner's choice (2026-10-02, "advise now, JSX ADR next"):
`record.js_stop_at_jsx` names a stop that sits on a JSX tag's `/` (`</` or `/>`) in any
JavaScript-family suffix but `.ts .mts .cts`. Both gates then say UNPROVEN as advice naming JSX:
adr-lint never blocks on it, and spec-verify advises instead of exit 4. A stop anywhere else, and a
tag in plain TypeScript, still refuses. The test is `a test past a JSX tag the lexer cannot read yet
is advice, never a refusal`. Under-blocking is the named cost: a test genuinely missing from such a
file is advice now.

Still open, and the next record: a JSX mode for the shared lexer. It is ADR-078's lexer, and the
test lock reads with it (hasher 2), so it is a spec and an ADR for the owner's acceptance, not a
patch. Residuals until then, none measured on a corpus yet:
- an apostrophe in JSX text (`<p>Don't</p>`) opens a string, so a stop there is not at a tag `/`
  and still refuses;
- `</a>` with another `/` later on the same line lexes as a regex and does not stop, so code
  positions after it can be wrong;
- `/>` after a string attribute (`<X a="s" />`) reads as a division;
- the lock still cannot bound a `.tsx` test after the first tag.

**Addendum 2026-10-02, 3.7.1 failed open; fixed for 3.7.2.** Both outside runners measured it at
f1ad71c. The react-spa runner renamed one Tests row to a name that exists nowhere, in a `.tsx` file
whose lexer stops at line 59 of 1327: 3.6.1 refused it, 3.7.1 passed it with JSX advice. The
laravel-react-monorepo runner found the same thing on a real record: a row naming `onOrder` (a prop,
not a test) went FAIL → PASS. So advice for every name past a JSX stop lost a check 3.6.1 had.

Now a name is missing past a JSX stop only when the lexer did not find it AND
`record.js_raw_titles` does not either. That is one comment-aware raw reading, which both gates
call: it strips comments, keeps string contents, and decodes each it/test/describe title. Missing
keeps 3.6.1's verdict: it blocks for an identifier name and is advice for a spaced title in
adr-lint, and exits 2 in spec-verify. Any other name gets the JSX advice. The tests are
`past a JSX tag, a test no reading finds is still missing` and `past a JSX tag, a comment is not a
test and does not hide one`.

The first version of this fix read raw text with no comment handling. A read-only correctness
reviewer, standing in for Codex, found four defects in it:
- a found test whose body the lexer could not bound went silent;
- a comment before a title made a found test read as absent, which blocked;
- in spec-verify, a comment after `it(` refused a test that exists;
- in spec-verify, a commented-out stale call passed as advice.

The reviewer also found an advisory one: `}` then `/>/.test(s)` took the JSX exemption with no JSX
in the file. Now a stop counts as JSX only after a `<Name` or `<>` in code before it.

The raw reading still over-finds. A never-written name that appears only inside a string literal
reads as advice, an under-block in both gates. The different-lineage round for 3.7.1 and 3.7.2 is
owed: the Codex budget is spent until 2026-10-07.

**Closed by ADR-083** (docs/specs/2026-10-02-the-lexer-reads-jsx.md).
- `_js_lex` reads JSX for `.js .mjs .cjs .jsx .tsx`: elements, fragments, attributes, `{…}`
  expressions and text. Anything it cannot read is a stop.
- A lock over a file whose reading JSX changes is taken by hasher 3; every other lock stays hasher 2,
  and recorded locks are read as they were taken.
- The 3.7.2 stop-gap is deleted: `js_stop_at_jsx`, `js_raw_titles`, `jsx_stopped` and the
  `"advise"` arm, together with their tests and catalogue entries.

Each residual above now reads, in tests/test-lock.test.mjs `the lexer reads JSX: …`:
- the apostrophe in JSX text;
- `</a>` with a later `/`;
- `/>` after a string attribute;
- the lock bounding a `.tsx` test (`a lock over a JSX file is taken by hasher 3 …`);
- the string-held whole call, which needs no raw reading now.

Named residual: in `.tsx`, a generic function TYPE written `<T>(x: T) => T` after a `:` reads as an
element. It never closes, so it stops (UNPROVEN), never a wrong reading; `<T,>` and `<T extends U>`
are read as type parameters.

## 338. CLOSED 2026-10-02 (ADR-082, for 3.8.0) — an attest line carries no sign that the run found a FAIL

Reported by the react-spa runner against 3.7.0: its `corpus-probe --attest` line said
`"disagreements":0` and `"found":""` while the same run's `--diff` showed both of its records going
adr-lint PASS → FAIL. `release-evidence` reads only the attestation, so it would have accepted a
release that falsely refuses the runner's corpus. Not yet read: what `disagreements` counts, and
whether a reader verdict that changed between two probe reports can be carried in the attestation
without carrying the report (§6).

Closed by ADR-082 (docs/specs/2026-10-02-an-attestation-says-what-changed.md).
- `disagreements` counts adr-next/work-next readiness splits (`compareReaders`), not verdicts.
- `corpus-probe --attest … --since <earlier report>` now adds `verdictChanges`: counts only, from
  the comparison `--diff` prints (`verdictMoves`).
- `attest-import` files it when it is null or exactly its three counts.
- From plugin 3.8.0, `release-evidence` refuses a run that compared nothing (`uncompared`) and any
  run whose verdicts left PASS (`regressed`), even beside a clean one. Its advice names each kind.
- Attestations from before 3.8.0 are judged as before.

## 339. CLOSED 2026-10-02 (fixed for 3.7.3) — a second `adr-verify` cleared a live run's mutant journal

Reported by a peer session in another checkout, 2026-10-02. A long `adr-verify --mutant --in-place`
was still running its clean fence when a `--relock` in the same checkout printed `RESTORED
transaction: all members were already at entry state. The recovery journal is clear.` Nothing was
damaged that time, but the live run had lost its crash recovery.

Confirmed in code:
- The journal is keyed only by the checkout (`mutant_journal`).
- It named no owner.
- Every invocation recovers it first (`recover_mutant`, before `--relock` and every other mode).

The baseline phase is the reported case: recovery clears the journal. In the mutant phase it is
worse: a second call writes the original bytes back under the live fence and clears the journal.
The fence then tests unmutated code, which can record a false "survived".

Fixed:
- The journal records `owner.pid`.
- Recovery refuses while that pid is alive, `--restore` included, and names it.
- Liveness is asked of `plugin/scripts/worktree.mjs alive <pid>`, the probe the campaign sweep
  already trusts. Python's `os.kill(pid, 0)` would end the process on Windows.
- A probe that cannot answer reads as alive.

The test is `a live mutant run keeps its journal: another adr-verify refuses to recover it`. Its
twin is the existing `a SIGKILLed mutant run is restored by the next run`. Catalogue entries are
labelled `§339:`.

Limit, named: a journal written by a release before 3.7.3 names no owner. Such a journal is still
recovered as before, so a run started under an older plugin is unprotected until it ends.

## 340. CLOSED 2026-10-06 (3.8.0 released; ADR-081's measurement taken 2026-10-06, see §350 tail) — 3.8.0 released; ADR-081's measurement is due

main at f992e4f carried §339's journal owner, ADR-082 and ADR-083: green in CI and unreleased. The owner
first chose to hold the tag for the different-lineage round (§12), whose budget returns 2026-10-07, then
asked for the review to be done in this session instead (§341).
- **Released 2026-10-02:** v3.8.0, Latest, at 4171b6e. The dispatched campaign 36992731601 ran 55 of 55
  jobs green, and `release-evidence` returned SUCCESS. Both outside runs attest with `--since` their 3.7.2
  reports, the first release ADR-082's rule binds:
  - react-spa: `compared` 2, PASS → FAIL 0;
  - laravel-react-monorepo: `compared` 95, PASS → FAIL 0.
  Every "lexer stopped at a JSX tag" line is gone in both, and the `onOrder` record still FAILs.
  `dead-code-scan` found 0 (orphan-sweep 0 of 1472, vulture 2.16, knip 6.39.0). The Codex round owed for
  3.7.2 (f1ad71c..e8a3de8) is moot: its scope, the JSX stop-gap, was deleted by ADR-083, and 3.8.0's
  review is §341.
- **On or after 2026-10-08:** ADR-081's follow-up. Its record fixes the date at "a week after release"
  (v3.6.0, 2026-10-01). Measure same-tree skips and hook durations at the adopters, against the 53 of 280
  measured before it. This also answers §331's import-cost residual. It is the only item left here.
- **§333:** closed 2026-10-02. It did not recur on any of 19 Windows runs since 6782901.

## 341. CLOSED 2026-10-02 (fixed for 3.8.0) — the stand-in review of 3.8.0: two reviewers, nine fixes, residuals named

The owner asked for the review to be done here instead of waiting for Codex ("do the review yourself",
2026-10-02). Two independent read-only correctness reviewers took `e8a3de8..5ac7436`: one on ADR-083's
lexer and hasher 3, one on ADR-082 and §339. Both said REQUEST CHANGES. Each finding was reproduced,
then fixed with a regression and a catalogue mutant (labels `review of …`).

**Invariant held.** With `jsx` off, `_js_lex` matched e8a3de8's on 60,960 inputs: every tracked
JS-family file, slices of each, and generated token strings. It also matched on 192 files × both TS
modes, measured separately here.

**Fixed:**
1. **Unspaced left shift (blocker).** `1<<bits` opened a JSX element in a JSX-capable file, which stopped
   the lexer and refused a JSX-free test, in the gates and the lock both. A `<` after a `<` is now a
   shift.
2. **TSX generic parameters.** `<T = unknown>(x) => x` and `<const T,>(x) => x` read as elements. Both are
   type parameters now, like `<T,>` and `<T extends U>`.
3. **Comments in a tag.** A comment inside a tag (`<div /* note */ id="a" />`, `// …`) stopped the lexer;
   it now reads as a comment.
4. **Generic components.** The generic component `<Table<Row> rows={rows} />`, common in TSX, stopped the
   lexer. Its balanced type arguments now read as literal.
5. **A closed element's start leaked.** When a file that held an element ended inside a template, the stop
   landed at the closed element instead of at the template.
6. **Relock advice.** The relock advice said only "hasher 1 → hasher 2". A hasher-2 lock over a file JSX
   now reads gets the same advice toward hasher 3.
7. **A regression hidden by its version (blocker, fail-open).** A run reporting PASS → FAIL was ignored
   when its `plugin` field was not a strict x.y.z ≥ 3.8.0. That includes a run at a sha whose
   plugin.json still says 3.7.2. A regression now counts at any version.
   - A run that compared zero records no longer attests.
   - An attestation that could not be checked is named beside an uncompared one.
8. **`--since` checks.** `--since` against a report taken by the same readers now compares nothing, and a
   record listed twice counts once.
9. **Journal owner (§339).** Without node, the owner was called "a live adr-verify run", and after a
   SIGKILL that blocked every later call, `--restore` included.
   - POSIX now asks the kernel (signal 0); an owner whose liveness cannot be established is said to be
     unknown, never live.
   - An implicit recovery refuses, and names `--restore`; an explicit `--restore` recovers past it.
   - A live owner refuses both, and is no longer called "adr-verify" (pid reuse).
   - `worktree.mjs alive` refuses a pid it cannot parse.

**Residuals, named:**
- A generic function TYPE in a TSX type position reads as an element and stops (UNPROVEN, never a wrong
  reading). That covers `: <T>(x: T) => T`, `type F = <T>(x: T) => T`, and `Map<string, <T>() => T>`.
- `< div />` with a space after `<` is not read as JSX, as under hasher 2.
- A PASS that became could-not-run counts in `passToFail`. That fails closed, and the advice covers it.
- `recover_mutant` has no lock between reading a journal, probing its owner and unlinking it; that race
  predates §339. Trigger: a report of two recoveries interleaving.

## 342. CLOSED 2026-10-06 (not reproduced in 17 Windows runs since it was instrumented; the sampler stays) — the artifact-gate budget test is bimodal on Windows

The push run of 4171b6e (36992722231, v3.8.0's sha) failed one job on `windows`, one test:
`the artifact gate budget is raisable, and running out of it names the budget` (tests/lifecycle.test.mjs:891).
The second half, run with the default 30s budget, got `facts-gate-dispatch.sh timed out after 30000ms`
instead of a verdict on the 400,000-line record. The dispatched campaign at the same sha (36992731601)
passed it in 12.7s, and `release-evidence` reads that run, so the tag stands.

**It predates 3.8.0.** That test's duration on `windows`, read from each run's log on 2026-10-02:

| run | sha | result |
|---|---|---|
| 36992722231 | 4171b6e | ✖ 136.3s |
| 36992731601 | 4171b6e | ✔ 12.7s |
| 36985881795 | d866327 | ✔ 135.9s |
| 36971099606 | 6d1178f | ✔ 122.2s |
| 36963737035 | f1ad71c | ✔ 132.7s |
| 36963745574 | f1ad71c | ✔ 6.8s |
| 36965411586, 36965403941 | e8a3de8 | ✔ 12.5s, 13.5s |
| 36918242536, 36918231925, 36909665154, 36902698378, 36898882347 | 723fa19, 031ffb6, cd8f95f, 6f6ddaa | ✔ 7.5s to 12.8s |

It takes either 7–14s or 122–136s. The slow mode passed three times, and failed once, when the judged run
also exceeded 30s. §16629's note already says that half is a performance assertion on the product default,
with no deterministic twin.

**Hypothesis, unverified:** the starved run (100ms budget) kills the shell, but on Windows a grandchild
(the gate's python over 400,000 lines) keeps the pipe open. So `spawnSync` returns only when it exits,
which would explain why the slow mode outlasts the 100s window. The process is still running during
the judged run. Test it on a Windows runner: list processes after the starved call. Fix either the
tree kill or the test's own budget (CLAUDE.md §7).

**Instrumented, 2026-10-02 (the owner chose this over waiting).** The test's body is locked (ADR-068
T2), so the instrument sits outside it in `tests/lifecycle.test.mjs`:
- a `beforeEach` starts a sampler process that writes the python, bash and sh processes, with pid,
  parent and age, every 5 s while that one test runs;
- an `afterEach` prints the samples when the run took over 60 s.

Only executable names are written (`ps … comm`, `tasklist`'s image name), never arguments.
`QH_SAMPLE_PRINT_MS=0` showed it printing on a fast run here. The next slow Windows run shows whether a
python process outlives the starved call.

**Closed 2026-10-06, not reproduced.** Every Windows job since the instrument landed, read from each run's
log: 17 runs from 37007601613 (2026-10-02 12:35) to 37411500980 (2026-10-06 03:58), the test took 6.9–14.4 s
every time, the fast mode; the slow 122–136 s mode last appeared before 2026-10-02 12:00. The sampler stays
in `tests/lifecycle.test.mjs` and prints itself on any run over 60 s, so a recurrence arrives with the process
evidence the hypothesis needs; reopen then. The same disposition as §333 and §334.

**A Windows 11 desktop, 2026-10-02** (node 24.20.0, Python 3.14.7, Git Bash msys 3.5.7, NTFS), its user
approving the run: ten runs at 8fe7ae2 all passed in 7.2–8.7 s. None went past 60 s, so the sampler
printed nothing. The slow mode did not reproduce there, which points at the windows-latest runner rather
than at Windows itself. The trigger stays: the next slow CI run prints its samples.

## 343. CLOSED 2026-10-02 (fixed for 3.8.1) — ADR-081's fast exemption said nothing of a partial stage, and skipped the unseen-write veto

An outside reading of ADR-081's skip and exemption, given to the session by the owner, found two holes.
Both were confirmed in source before any fix. Each applies only to a commit told through on a fast pass;
a push still needed the full check.
1. **A partial stage was not said.** `publishVerdict`'s fast branch (`plugin/scripts/lifecycle.mjs`,
   ADR-081) returned before any index comparison. So a fast pass on the working tree let a commit of a
   different index through, saying only "a fast check passed on this tree". The full path says "the
   staged index is unchecked" at the same point.
2. **The fast exemption did not apply the unseen-write veto.** `latestFastPass` read only
   `fast-checks.jsonl`. `passedAlready` refuses to skip when a session log holds an `observable: false`
   write the pass does not cover; the fast path never read the logs. A write git cannot see, made after
   the fast pass, still let the commit through.

**Fixed:**
- The veto is one function, `unseenWriteSince(root, {seen, seq, started})`. `passedAlready` calls it
  against `checksSeen`, and `latestFastPass` against `fastSeen`, so there is no second copy.
- `recordFileWritten` now logs `fastSeen`, the fast ledger's count, beside `checksSeen`. A write logged
  before 3.8.1 has no `fastSeen` and is judged by its time alone, the rule the full skip already keeps
  for a write with no count.
- The fast advisory adds "the staged index is not the tree the fast check ran on" when `now.index` is
  not `now.tree`.

Regressions in `tests/qh-check-reads-the-ledger.test.mjs`. Each was red first, at the assertion it
names:
- `a commit told through on a fast pass says when the staged index is not the tree it checked`, with a
  whole-stage twin;
- `a write git cannot see, after a fast pass, takes the commit back to the full check`, driven through
  the PostToolUse hook, with a later fast pass as the twin that covers the write;
- `a write the fast ledger counts after its pass is seen, even when the clock went back`, with a
  `fastSeen: 0` twin.

Catalogue: four `§343:` mutants. Four ADR-081 entries were retargeted onto `unseenWriteSince` and
`latestFastPass`, because the veto moved out of `qh-check.mjs`.

**The review of this fix: REQUEST CHANGES, one blocker.** It was an independent read-only correctness
reviewer, standing in for Codex, whose budget returns 2026-10-07.
- **The blocker, a false refusal.** `recordFileWritten` logs any write outside the repository as
  `observable: false`, a scratchpad note or a peer's temp file included, and the veto read every one.
  So a fast-path commit was refused after the session saved a commit message outside the tree. A full
  pass is never refused that way, so the fix had made the fast exemption stricter than the full check.
  The reviewer reproduced it through the real hooks.
- **Fixed, the owner's choice of two:** only a write inside the repository counts (`outsideRoot`, through
  the existing `relativeWithinRoot`). That applies in both callers, so the full skip no longer loses
  itself to a scratchpad write either. Twin: `a write outside the repository vetoes neither a fast-path
  commit nor the full skip`. Two more `§343 review:` mutants. All six §343 mutants were killed.

**The class: every reader of a pass ledger that skips a check or excuses a publish.** Enumerated with
`mrw read --grep "checks\.jsonl'|fast-checks\.jsonl'|unseenWriteSince\(|unobservableWrites\(" plugin/`:
- `passedAlready` (qh-check.mjs) applies the veto;
- `latestFastPass` applies it now;
- `importCheckRecords` (lifecycle.mjs) feeds `checkStanding`, which decides a publish and reads NO veto.
  `unobservableWrites` is called only by `observedFacts` and `completionRules`, both advisory. The first
  draft of this entry said otherwise, and the review corrected it.

The remaining hits are the writer (qh-check.mjs) and a size read used for a cache key.

**Residuals, named:**
- **A full pass, then a write inside the repository that git cannot see** (an ignored file): commit and
  push both go through. The full publish standing reads no veto, while a fast pass now does. Trigger: a
  report of a publish over an ignored input the check reads. **The owner, 2026-10-02: leave as is.** The
  full check is the strong proof, and ADR-081 already names the limit ("a tree hash covers no ignored
  file").
- **A direct write to a file outside the repository that the tree symlinks to** is not counted. Writing
  through the in-tree link is.
- **A `file.written` with no `at`** vetoes here, where `unobservableWrites` treats it as covered.
  `appendEvent` always stamps `at`, so only a hand-written row has none.
- **`git commit -a` from PreToolUse** gets the partial-stage sentence even when every change is tracked.
  Git's own hook sees the index git commits. Advice text only.
- Bash and mrw still write no `file.written`, so the veto cannot see their writes. That is §331's trigger
  for `checkInputs`.

## 344. CLOSED 2026-10-02 (fixed for 3.8.2, the owner's choice) — branch-state twice listed weeks-old runs as the newest

Around 10:50Z, the `UserPromptSubmit` brief said `CI COULD NOT LOOK — no run listed is at HEAD 7f780b1 or
at the pushed tip; the 20 listed are at f6335f5, 21cadc1, f149a36, …`. Those are this repository's
2026-09-16 release commits. At the same time, `gh run list` listed 489737c's run in progress. The
brief failed closed: it reported unknown, never green.

Not reproduced:
- `branch-state.mjs` run from inside `.git/quality-harness/sessions`, the session's working directory
  shortly before, read the right runs.
- So did `gh run list` from `.git`.

The cause is unknown. Candidates: `gh` serving an old page, which the brief's own text names, or a
snapshot from another key. Next sighting: keep the snapshot file and its key before it refreshes.

**Second sighting, about 11:20Z.** The brief said `the 20 listed are at d4dfaeb, 3b2a830, b089080, …`
(late-September commits), a minute after 77bd909 was pushed and its campaign dispatched. The snapshot
`.git/qh-branch-state.json` was kept before it refreshed:
- its key was `["ref: refs/heads/main","77bd909…","77bd909…"]`, which is HEAD and the pushed tip, so it
  was not another key;
- `state.ci.note` held the stale list, so the list is what `gh run list --branch main --limit 20` (the
  call at `plugin/scripts/branch-state.mjs:182`) returned.

Run three times right afterwards, the same call listed 77bd909's two runs first. **The cause is `gh`, or
the API behind it, serving an older page of a branch-filtered list shortly after a push.** Both sightings
came within minutes of one. The reader already says that in its own words, and it fails closed. A
possible change, not made: retry once when no listed run is at HEAD or at the tip, or ask `--commit
<sha>` as well. That spends a second `gh` call on a hook that fires on every prompt (CLAUDE.md §19), so
it waits for a third sighting or the owner's call.

**The owner chose the retry (2026-10-02). Fixed for 3.8.2:**
- A listing with runs, none of them at HEAD or the tip, is asked once more with `gh run list --commit
  <tip, else HEAD>`, and a fresh answer is read.
- A second stale answer is still COULD NOT LOOK, never an old commit's verdict.
- A listing that answers is never asked twice.

Test: `a stale listing is asked once more by commit, and only a stale one is`, red first. The catalogue
has two `§344:` mutants. The existing `branch-state: the tip is read and passed to the run choice`
mutant now targets one shared `tipSha`, because the retry would otherwise have supplied the tip that
the mutant took away.

**The review of this fix: REQUEST CHANGES, one blocker** (an independent read-only reviewer standing in
for Codex). `gh run list --commit` is not filtered by branch. A new branch whose upstream is main had a
`--branch` listing holding only its own older run, and the retry then read main's red at that commit
as the branch's own: COULD NOT LOOK had become a wrong FAILURE, repeated on every prompt. Fixed: the
retry asks for `headBranch` and keeps only this branch's rows. An arm in the test covers it, and a
`§344 review:` mutant. All three §344 mutants and the tip mutant were killed. The same review
corrected the sampler's comment: on macOS `comm` is the whole path, so `ucomm` is used there.

## 345. CLOSED 2026-10-02 (item 3 fixed for 3.8.2; item 1 decided by the owner) — a fresh corpus's reading of 3.8.1: three name clashes, one fair ask

A first outside run on an older Python ADR corpus (72 records, 219 tasks; attested as
`python-adr-corpus` at 77bd909): every verdict at 3.8.1 equals 3.7.2's (`compared` 78, PASS → FAIL 0).
The runner flagged four things, each checked in source:
1. **"Three shipped tasks come back READY."** Not a defect. They are done in their README, but their
   evidence is stale or predates acceptance digests. `work-next` lists them in `readyButClaimedDone`
   (`plugin/scripts/work-next.mjs:475-478`, §280 item 4, §289 item 2), and the runner confirmed all three
   are there. **The owner, 2026-10-02: they stay in `ready`.** Task files win over the derived README,
   and the separate field already says to verify first.
2. **`readinessUnproven: 0` beside adr-next's `unproven` reasons.** A name clash. `readinessUnproven`
   counts task directories work-next could not read (`plugin/scripts/corpus-probe.mjs:186-189`), not
   tasks with unproven evidence.
3. **An `undecided[].reason` is null** for a status that was read but not recognised. The `status` field
   holds the text, but a reason saying "a status that is not a known value" (as against "Proposed")
   would help. **Fixed for 3.8.2:** `corpus-probe` gives each undecided record a reason: "a plan, not yet
   decided", "a status this reader does not recognise", "no status line this reader can read", or "its
   archive catalog does not establish its effect". Test: `probe: a record held back says why — a plan,
   an unknown status, or none read`. Two `§345:` mutants.
4. **`workNext.accepted` equals `records`.** It is computed: records whose kind is `governing`
   (`work-next.mjs:532`).

A second fresh corpus, a web app, could not run: its session's permission check refused the cloned
script, and it has no `docs/adr` anyway. Its 55 `.tsx`/`.jsx` test files would be fresh input for
ADR-083's lexer if its user approves.
**Its user approved, 2026-10-02.** `record._js_lex` at 77bd909 read all 74 tracked test files to the
end: 55 `.tsx` and 19 `.ts`, with `ts` set for both and `jsx` set for `.tsx`. It found
`stop=None` and no unknown (kind 3) position. The runner's controls on the same build:
- an unterminated JSX attribute string stops (stop=21);
- an unterminated template stops;
- valid JSX read with `jsx=False` stops at `/div>`;
- the same JSX with `jsx=True` reads to the end.
So the zero is not vacuous: ADR-083's JSX mode is what reads this corpus.

## 346. CLOSED 2026-10-06 (3.8.7: --diff compares undecided[], records and the environment) — `--diff` never compares `undecided[]`

The laravel-react-monorepo runner's 3.8.2 report changed in one section only: `undecided[]` gained
§345's reasons. Its `--diff` against 3.8.1 printed only the readers line. `diffReports`
(`plugin/scripts/corpus-probe.mjs:514-580`) compares workNext, adrState, adrLint, couldNotRun,
disagreements and sessionStart, but never `undecided`. So a record that moves into it or out of it, or
whose reason changes, is invisible to `--diff`. A record that stops being read shows only through its
adrLint line.

The gap predates 3.8.2. It is not fixed there, because changing the probe would invalidate all three
3.8.2 attestations. The fix adds an `undecided` set-change by file, plus a reason change, with a test
and an `expected.json` field (CLAUDE.md §18).

**A second gap, from a 3.8.4 run:** the host's Python moved from 3.14.7 to 3.14.8 between two runs.
`--diff` did not say so, because it compares no environment field, so a verdict that moved with the
interpreter would carry no hint of why.

## 347. CLOSED 2026-10-02 (fixed for 3.8.3, the owner: "append") — a skip left no trace, so ADR-081's follow-up could not count it

Asked whether the event logs are used fully, the session listed what they still do not record. The first
item was that `qh-check`'s same-tree skip (ADR-081) returned 0 and wrote nothing. Its follow-up, to
measure how often the skip saves a run, could therefore only infer the count. Before the change the
session considered a row in `checks.jsonl` and rejected it: `passedAlready` grades the LATEST row for
the tree, so a skip row there would undo the next skip, and the session import would read it as a check
event.

Fixed: a skip appends one row to `.git/quality-harness/skips.jsonl` with `id`, `at`, `command`,
`tree`, `passId` (the pass it reused), `passedAt` and `savedMs`. No reader of a pass opens that file.
A ledger that cannot be written is said on stderr, and the skip and its exit stand. Test: `a skip is
recorded in its own ledger, naming the pass it reused`, red first, and `a skip whose ledger cannot be
written is said, and still skips`. Three `skip ledger:` mutants, all killed. `savedMs` is the reused
pass's duration, an estimate rather than a measurement. A stand-in read-only review APPROVED, and its two
advisories (the untested failure arm, and calling the estimate an estimate) were acted on. ADR-081's
Follow-ups name the file.

The other gaps from the same answer stay open:
- mrw and Bash writes leave no `file.written` (§331; a finding was filed to mrw's inbox the same day);
- the fast check never skips (by design);
- artifact-gate verdicts are kept per session.

## 348. CLOSED 2026-10-02 (fixed for 3.8.4) — on Windows a full branch-state takes 6.4–7.7 s and loses the release line at SessionStart

A Windows 11 desktop session ran an installed 3.8.3 (node 24.20.0, git 2.49.0, gh 2.87.3, logged in) on
a repository whose CI at HEAD is red. It timed each hook five times, in ms:

| command | min | median | max |
|---|---|---|---|
| lifecycle SessionStart | 257 | 265 | 285 |
| branch-state (full) | 6374 | 6656 | 7704 |
| branch-state --brief --cached 120 | 171 | 180 | 191 |
| lifecycle UserPromptSubmit | 193 | 198 | 217 |
| `node -e 0` | 88 | 100 | 108 |

That session's SessionStart banner also said the release read had used up its 8000 ms budget before
`git describe`. So at SessionStart on Windows the full reader runs close to its budget, and the release
half is lost. The per-prompt brief is cheap, because it serves from the snapshot.

Not yet known: which call takes the time. A red CI adds one `gh run view` per failing run, and 3.8.2's
§344 retry adds a `gh run list --commit` only on a stale page. A per-call timing was asked of the runner.
Fix by the evidence (CLAUDE.md §19): parallelise the `gh` calls, cap `gh run view` at the first failing
run, or move the release half ahead of `gh`.

**The breakdown, from the same runner, one timing per call:**
- git: about 690 ms in all (rev-parse ×4: 181, status: 127, rev-list: 95, remote -v: 100, describe: 100,
  diff: 83).
- `gh run list`: 1240 ms, returning 20 runs.
- `gh run view --json jobs`: 1.6–2.5 s each, once per failing run at HEAD. `headRuns` keeps the newest per
  workflow and event, so three were fetched there (e2e, platforms, ci): about 5.7 s.

So `gh` fills the budget, almost all of it in the per-run job views, and the release half (git, about
180 ms) runs after them and is the half that gets lost. Two fixes follow:
1. Read the release half before `gh`, as the tip already is (Codex review of 3.2.1). This is cheap
   and changes no output.
2. Cap the job views. That is a cost trade-off on what the brief names, and it is the owner's call.

**Fixed for 3.8.4 (the owner chose the budget over a count, 2026-10-02).** "View only the first failing
run" would have broken `every workflow at the newest commit answers, and a green one does not hide a red
one`, which ADR-065 T1 and T2 lock. So the views spend a budget instead:
- the first red workflow is always viewed;
- the rest are viewed only while the views have used less than 2 s (`JOB_VIEW_BUDGET_MS`), and any past
  it are named `<workflow> (<event>): failure, jobs not read`, never dropped;
- a fast host, and the locked test's instant fakes, view every one;
- the release half is now `releaseHalf(run)`, read before `gh` and carried in the checkpoint.

Test: `job views stop at their budget, and the release half is read before gh`, red first, with a clock
seam on `collect`. Three `§348:` mutants, plus the retargeted checkpoint entry, all killed.
The stand-in review APPROVED with three advisories, all taken:
- a workflow whose view FAILED is named too, which was dropped before this change;
- the entry reads "— jobs not read", because the brief joins entries with commas;
- the statusline counted named workflows as jobs, and now says `CI ✗ 1 job(s) +2 unread`.
Statusline test: `a workflow whose jobs were not read is counted apart from jobs`. All four §348 mutants
were killed.

## 349. CLOSED 2026-10-06 (items 2 and 4 fixed after 3.8.7; 1 fixed earlier; 3 no change; 5 not reproduced) — a Go ADR corpus on Windows: no verdict moved, five readings to judge

The first Windows outside run, on a Go CLI ADR corpus of 70 records and 177 tasks, attested as
`windows-go-cli-adr-heavy` at 8fe7ae2: `compared` 70, PASS → FAIL 0, no disagreements, nothing that
could not run. Its runner flagged five things:
1. **The repository does not clone on Windows by default.** `git clone` failed with "Filename too long"
   (exit 128, checkout failed) under a %TEMP% scratch directory about 115 characters deep. The longest
   tracked path is 157 characters (ADR-059's archived task names, and ADR-060 T3), and 22 tracked paths
   exceed 120. `git -c core.longpaths=true clone` works. `plugin/` peaks at 106 characters, so an
   installed plugin is not affected; a contributor's or outside runner's clone is. Options: say
   `core.longpaths` in every outside-run request, or a selftest bound on tracked path length plus
   shorter names. Archived records are frozen, which leaves only the first for them. **Fixed, the
   owner's choice (2026-10-02):** a bound of 128 characters, held by `tests/path-length.test.mjs`, with a
   dirty twin. Three active task files were renamed with `git mv` (no content change, `T<n>-` ids kept),
   and their references updated. Five ARCHIVED paths (ADR-058, ADR-059) could not be renamed: the
   frozen digest covers file names, and `adr-retire-check` failed until the renames were reverted. The
   owner chose a closed list for those five, which may only shrink. A Windows clone needs
   `core.longpaths` until they leave. CLAUDE.md §7 states the rule, and `.claude/rules/07` holds the
   evidence.
2. **"ready 3" names shipped work, and gives no reason.** Three tasks have exit-0 evidence, but their
   locked test hashes moved when a later record edited those tests. adr-next's JSON says exactly that
   (re-lock debt), but work-next's human line and adr-next's per-directory "ready T1" do not. The owner
   kept such tasks in `ready` (2026-10-02, Q3); this lead is about saying WHY in the human line.
3. **adr-lint FAILs two records on the same cause** (a moved lock). That is correct by its own rule, and
   it names `adr-verify --relock --replace-hashes`. No change proposed.
4. **Advice that fits historical evidence badly.** "records exit 1 in 192ms, which is too short to have
   run this task's Acceptance fence" fires on old red-first entries, where a fast exit-1 is the expected
   shape of a missing test. The fence-segments count advice appears on almost every record (3–27 lines
   each). The first is a possible false advisory, to check against the rule's intent.
5. **adr-lint slower on four records**, 3.7.2 → 3.8.3 (900 ms → 2.1–2.7 s). One run each on Windows, so
   possibly noise. To re-measure before reading anything into it.

`readinessUnproven: 0` beside adr-next's unproven reasons is §345's name clash, not a count error.

**Closed 2026-10-06:**
- **Item 2, fixed.** adr-next's own human line already said why (the ⚠ "carries exit-0 evidence, but its test
  lock withholds done" line). work-next's did not: a ready task held only by a moved lock was listed as "READY
  and claimed done without evidence — `adr-verify` them first", untrue twice over. It is now a line of its own
  naming the relock. Test: `tests/lock-unreadable.test.mjs::work-next says a ready task held back by a moved lock
  carries its evidence, and names the relock`; one mutant killed, and the older entry on the line repointed.
- **Item 4, fixed — a false advisory.** The floor asks whether a command could have FINISHED in its time; a
  failing one can stop at its first error, and GitHub #6 was about exit 0 in 3 ms. Only exit-0 rows are judged
  now. Test: `tests/gate-regressions.py::test_a_failing_row_may_be_fast`, with an exit-0 twin; one mutant killed,
  two older entries repointed and RED. The fence-segments count advice is §17's work, not a false advisory.
- **Item 5, not reproduced.** Re-measured 2026-10-06 on macOS, three runs each, v3.7.2 against HEAD: ADR-060
  562–707 ms → 557–570 ms, ADR-061 90–93 → 82, ADR-081 233–241 → 213–216. HEAD is not slower here. Windows was
  not re-measured; the report was one run per record.

## 350. CLOSED 2026-10-06 (all of C1–C10 and items 1–9 released in v3.8.7) — Windows corpus-chaos on 3.8.3: one crash, three could-not-look read as absence

A Windows 11 desktop (NTFS, 8.3 names on, LongPathsEnabled, Git for Windows 2.49.0) ran the corpus-chaos
skill with the installed 3.8.3 readers, whose readers digest matched the release byte for byte. Its user
approved. The baseline was this repository's corpus grafted into a web app, 83 records, all PASS. Each
case was a fresh copy with one perturbation. Findings, as reported, each to confirm against source
before fixing:
- **F1, a crash.** A UTF-16 test file makes adr-lint and adr-next exit 1 with a traceback:
  `record.py` `_read_file` → `path.read_text(encoding="utf-8")` → UnicodeDecodeError, reached through
  `lock_findings` → `snapshot_lock`. It hits every record whose lock names the file, frozen ADR-056
  included. ADR-049 says an unreadable file is could-not-run, not a crash. A third reading of the same
  file FAILs with advice to "rewrite the construct it stopped at", when the encoding is the cause.
- **F2, could-not-look read as absence.** A test file held open with FileShare.None: adr-lint says
  "could not run … Permission denied" (right), but adr-next says the locked test "vanished — done is
  refused". work-next then lists those tasks in `readyButClaimedDone` and says "adr-verify them first",
  and `disagreements` stays empty. `partialBecause` names only the record. One locked file blinds 76 of
  83 records' cross-record reads.
- **F3, an absolute path past the scrubber.** SessionStart's truncated "could not run" line carries a
  home path that `couldNotRun` scrubs to `<path>`. adr-lint's header always prints the absolute plugin
  directory (by design, to name which copy answered).
- **F4, a case-only duplicate in the git index** (`t1-….md` beside `T1-….md`, one file on disk):
  work-next counts 199 tasks where corpus-report counts 198. Nothing names the collision.
- **F5, a path over 260 characters.** The advice says "a checkout root longer than -34 characters" (a
  negative number), and adr-next blames ".quality-harness.json check could not be read" for a long task
  path. adr-lint PASS against work-next's unbacked T1–T4 is not listed as a disagreement.
- **F6, an unreadable task file counted as an unbacked done claim** (icacls deny read): work-next says
  "adr-verify <task file> because a task is marked done", but nothing could read whether it claims
  anything. The probe's look is "ok" with an empty `partialBecause`, while corpusReport says
  `unreadable: 1`.
- **Lead, a dangling junction at `docs/adr`:** every reader says "No QH corpus is in use", where ADR-034
  says a corpus root is a question, not an empty answer.
- **Lead, an 8.3 alias in Affected Files:** a lock reads "vanished" for a test that exists. Low priority:
  the runner made the alias itself.

Held right: CRLF everywhere, read-only attributes, a case-only rename on disk, 8.3 short names as access
paths, a junction loop (UNPROVEN, no hang, no leftover git.exe), and `docs/ADR` in upper case. Not
tried: `--sweep`, alternate data streams, a delete-pending file.

**All five Windows desktops reported (2026-10-02). Their findings merge into these classes, each to
confirm against source:**
- **C1, crashes.** A UTF-16 test file named by a lock (F1 above). A TEMP pointing at a missing
  directory: `corpus-probe --json` exits 1 with an ENOENT stack trace from `mkdtemp`
  (`corpus-probe.mjs:312`), and no JSON.
- **C2, could-not-look read as absence or as a claim.** A locked test file says "vanished" (F2). An
  unreadable or undecodable task is an "unbacked done claim" with "adr-verify it first" (F6; and a UTF-16
  T1). A task directory that is a junction leaving the tree makes done tasks READY, because
  ".quality-harness.json check could not be read" (reported twice). The guess is that the project root
  is resolved from the task's REAL path. A long path blames the same file (F5).
- **C3, one lock blinds the corpus.** One locked task file turns adr-lint into "could not run" for
  57–76 of 64–83 records, in four reports. Its cross-record read fails on a file the record does not
  own. `probe.couldNotRun` lists only adr-next, so an attestation's `couldNotRun` reads 1. Windows'
  sharing violation is worded "Permission denied", which points at ACLs.
- **C4, an absolute home path in SessionStart's truncated "could not run" line.** Three reports. The
  same message in `couldNotRun` is scrubbed.
- **C5, counted but not named, or dropped in silence:**
  - case twins in git's index (two reports: 199 against 198 tasks, the twin named nowhere);
  - a junctioned task directory, omitted from corpusReport (141 against 145 tasks);
  - a readable task under an unreadable record, in no list;
  - a case-only renamed record, dropped from corpusReport;
  - a fullwidth-colon (U+FF1A) Status record, which leaves work-next's count with look "ok" and no reason;
  - adr-state losing paths silently on CR-only line endings, and not naming an unreadable task;
  - junctions that loop or leave the tree, skipped without a word;
  - the SessionStart window swapping a missing task directory out without naming it (two reports);
  - `--diff` on a PARTIAL report saying only "not compared", never what dropped out.
- **C6, FAIL-OPEN: a missing owner record still yields a work order.** With the record deleted, adr-next
  exits 0 with `status: null`, `undecided: null`, `owner_unreadable: false` and READY tasks, and
  SessionStart says "T1 is ready … Prove it". A UTF-16 record gets the right hedge ("this may not be a
  work order"). work-next and adr-state say PARTIAL for the same copy.
- **C7, a junction loop under `docs/adr` is followed 64 levels deep.** `corpus-probe` was killed at
  120 s. work-next took 49 s and said `records: 192` with look "ok". adr-state reported ADR-001 contested
  with itself. A loop inside a tasks directory was handled (no hang) in two other reports.
- **C8, untrue sentences:**
  - "Superseded by a record that is not in this corpus" for an unreadable record;
  - "a checkout root longer than -34 / -3 characters" (two reports);
  - adr-lint's blocking content verdicts about a file it just called undecodable;
  - a lowercase `readme.md` linted as a task while also read as the README;
  - fixture specs (`tests/golden-*/docs/specs`) counted as the corpus's own unproven specs;
  - adr-lint PASS on a record whose Status nobody could read (U+FF1A), as advice only.
- **C9, platform-dependent JSON.** work-next and adr-next print `docs\\adr\\…` on Windows where every other
  field prints `/` (three reports).
- **C10, a dangling junction at `docs/adr`** reads as "No QH corpus is in use" (ADR-034).

Held right across the five runs: CRLF, read-only trees, Hidden and System attributes, alternate data
streams, 8.3 names, a hard link (adr-next named the ambiguity), a garbage ledger, odd SessionStart stdin,
locales, time zones, a UTF-16 record, and a loop inside a tasks directory.
C1, C6 and C7 come first: a crash, a fail-open, a hang.

**Fixed for 3.8.5 (the owner chose C1+C6+C7 first, 2026-10-02):**
- **C1:** `_read_file` catches UnicodeDecodeError, so an undecodable test file is could-not-read and its
  locked names are unproven. A temp directory the probe cannot use is one line on stderr, exit 3.
- **C6:** adr-next's answer carries `owner_missing`, and both it and the SessionStart line say "no
  record owning these tasks was found, so whether they are a work order is UNKNOWN". This is kept
  apart from an unreadable owner, which the 2.111.0-rc test pins. The SessionStart line says it right
  after "T1 is ready —", not first like the unreadable and undecided caveats: ADR-068 T2 locks a test
  (`SessionStart says UNPROVEN, with the gate's reason, when adr-next could not run`) whose ownerless
  `docs/tasks` fixture expects "`docs/tasks`: T1 is ready —", and the first placement turned the gate
  red on it.
- **C7:** `adrCorpus` reads a record once by its real path. Every other listed path to the same file
  (a junction or symlink loop) is named, unread, and the look is PARTIAL.

Tests, each red first:
- `a lock over a test file it cannot decode says unproven, and does not crash`;
- `probe: a temp directory that does not exist is said, not a stack trace`;
- `tasks with no owning record are said to have none, apart from an unreadable one`;
- `the ready line says when no record owns the tasks, before the instruction`;
- `a record reached again through a link that loops is read once, and the copies are named`.

Five `§350` mutants, all killed. C2–C5 and C8–C10 stay open, as the next batch.

**Class audit (CLAUDE.md §5), 2026-10-02.**
- **C7, other corpus listers.** `mrw read --grep 'adrCorpus\(|readdirSync\(|trackedPaths\(' plugin/scripts/`:
  work-next, adr-state and corpus-probe each list with `trackedPaths` and read through `adrCorpus`, so the
  fix covers all three. The Python gates walk with `rglob` instead (`adr-debt`, `adr-retire-check`,
  `adr-verify`). On macOS (Python 3.14.8) they were run over a scratch corpus holding `docs/adr/self -> .`
  and `docs/adr/ADR-001-x/back -> ..`: `adr-debt docs/adr` (exit 0) and `adr-retire-check docs/adr`
  (exit 1, the corpus's own finding) each returned in under a second and named no path through either
  link, because `rglob` does not recurse into symlinks. A Windows junction is NOT measured. It stays open
  for a Windows runner.
- **C1, other strict UTF-8 reads.** `mrw read --grep 'read_text\(encoding="utf-8"\)|…decode\("utf-8"\)'
  plugin/bin/ plugin/lib/`: every hit is the plugin's own `plugin.json`, read under `except Exception`,
  or a read under `except (OSError, UnicodeError)`. One is not: `adr-verify`'s `recover_mutant` reads
  its own mutant journal catching `OSError` and `json.JSONDecodeError` only, so a journal that is not
  UTF-8 raises a traceback where "corrupt mutant journal retained" was meant. It is a file the tool
  wrote itself, and it stays open as a sibling.

**3.8.4 (d4c7819) is not tagged:** the owner chose to go straight to 3.8.5, since C6 is a fail-open
that 3.8.4 carried. It predates 3.8.4, which did not touch adr-next.

**The matrix carries C6 (CLAUDE.md §18):** a new corpus, `tests/fixtures/corpora/orphan-tasks`, has one
Accepted record and a task directory whose record is gone. Its `expected.json` requires SessionStart's
hedge, and a sixth `§350` mutant (`owner_missing = False`, checked by the matrix row) is killed. C7
cannot be a fixture, because git lists a tracked symlink as one path and does not walk through it; its
test injects the listing instead.

**The same fixture shows a C5 gap in work-next, recorded as it is:** it counts the ownerless task
(`tasks: 1`), but names it nowhere: `ready` and `readinessUnproven` are empty and the look is `ok`.
The probe's `adrNext` list never visits that directory, so the readers do not disagree on paper.
This is the safe direction, a task not offered rather than one offered without a hedge. It joins
the C5 batch, and the fixture's `expected.json` will change when it is fixed.

**The stand-in review of 3.8.5 (the owner's choice over Codex, 2026-10-02)** had three blockers, each
reproduced by the reviewer and fixed with a test and a killed mutant:
- **C6 by another route, a fail-open.** `owning_record` bound any record of the same number, so with
  `ADR-002-a.md` deleted, `ADR-002-a/tasks/` went to an Accepted `ADR-002-b.md`, READY and unhedged.
  Now only a number-only folder binds by number. A record inside its own folder
  (`ADR-002-x/ADR-002-x.md`) is now looked for too: without it, an owned task was hedged as ownerless.
- **C7's reason printed the first path raw.** A newline in a listed name forged a line of work-next's
  output (§319's class). It is shown escaped now. It was also worded "through a link" where a
  case-folded spelling reaches the same file with no link; it now says "another listed path to the
  same file on disk".
- **C1's message named the temp directory,** against corpus-probe's own header contract, on Windows a
  path holding the user name. It now names only the variable.

Advice the review gave, decided:
- adr-next's no-tasks JSON said `owner_missing: false` where nothing was looked for; it is `null` now.
- **Open, safe direction:** a symlinked tasks directory still gets the ownerless hedge, because
  `tasks_dir.resolve()` runs with no `record_dir`.
- **Open:** work-next's `undecidedRecords` counts a link copy of an Accepted record.
- **Open, C2:** a locked test file later saved as UTF-16 reads "vanished — done is refused", not
  unreadable. The new test covers only `snapshot_lock`.
- Not run by the reviewer: a Windows junction under `realpathSync.native`.

**Outside runs of 3.8.5 at 5c6980a (2026-10-02):** react-spa, python-adr-corpus and
laravel-react-monorepo on macOS, and a Windows 11 run on a specs-only TypeScript monorepo. None moved a
verdict. The Windows runner also repeated its 3.8.3 chaos cases on scratch copies:
- **Unusable TEMP: fixed.** It exits 3 with the one-line reason, with no stack trace and no JSON.
- **Junction loop (`mklink /J docs\adr\loopback docs\adr`): half fixed, and the first item for 3.8.6.**
  - No hang: the probe took 22 s against a 17 s baseline. `records: 3`, the look is PARTIAL, every
    duplicate is named, and adr-state reads 3.
  - But TASKS are not deduplicated: work-next says `tasks: 192` and 64 `unbacked`, and the probe lists
    192 adr-lint entries.
  - SessionStart offers the same task again through the link:
    `docs/adr/loopback/ADR-001-…/tasks: T1 is ready … Prove it with adr-verify docs/adr/loopback/…`, 7
    lines.
  - This is not a fail-open: every offered task is real and owned by an Accepted record, and no finding
    is hidden. It is the same file counted many times. `taskDirectories` needs the realpath rule that
    `adrCorpus` now has. A Windows junction is the first measurement of `realpathSync.native` on one.
- **Deleted owner record: half fixed.** SessionStart now says "no record owning these tasks was found …
  UNKNOWN". work-next, however, says `look: ok`, counts the task, and names it nowhere. This is the C5
  gap the `orphan-tasks` fixture shows, now seen on Windows too.
- The UTF-16-test-file-under-a-lock case was not run by that runner.

3.8.5 at 5c6980a was ready to ship with the two halves above named as known open: neither offers
unreal work or hides a real finding.

**Then a second Windows run (js-spa-windows) held the tag:** C1's fix had turned a crash into a false
sentence. With `tests/test-lock.test.mjs` saved as UTF-16 in a copy of this repository:
- adr-lint FAILed 6 records with "locked test … vanished — done is refused";
- adr-next said the same for 5 T1s;
- work-next said "READY and claimed done without evidence".
The file was there and nobody had seen it gone. `_read_file` returned None for "gone" and for "cannot
read" alike, and `lock_findings` called every None "vanished". This is CLAUDE.md §3 — "a gate never
reports an observation it did not make" — and 3.8.5 introduced it; 3.8.3 crashed instead. The stand-in
review had flagged it as advice ("Open, C2" above), and an outside run measured it.

**Fixed for 3.8.6** (the version is bumped, since main already serves 3.8.5):
- `snapshot_lock` records `unreadable`, the Tests-row files that are there and could not be read. A
  failed lookup counts as there: "could not look" is not "gone".
- `lock_findings` then says "could not be read — the file is there, but not as UTF-8 text, or not
  openable by this process — UNPROVEN, done is refused".
- The block stays, as UNPROVEN blocks done everywhere else; only the sentence was false.
- The test is `a locked test file that is there and cannot be read is UNPROVEN, not vanished`. It goes
  through adr-lint, with a gone-file twin that still says "vanished". Two mutants are killed.
- With the mode bits denying a read on macOS, adr-lint stops earlier with "could not run … Permission
  denied", from its own read of the Tests-row file. That is honest, and its absolute path is F2/F3's
  open item.

The same run's other repeats:
- A junction loop under `tasks/` made `git ls-files` itself hang on Windows; the probe took 126 s and
  said UNPROVEN, which is honest.
- With TEMP missing, adr-lint still PASSes while the probe says adr-lint has "nowhere to put its state".
  The probe's sentence over-claims and adr-lint's state write fails silently: open.
- A deleted owner gave adr-next `owner_missing: true`, and work-next still said nothing, the C5 gap.
- F2 and F6 are unchanged, as expected.

**A third Windows run (windows-js-python-plugin-adr-heavy, over this repository at 8902ada) found the
Python half of C7: `adr-debt docs/adr` HANGS over a junction loop** (`New-Item -ItemType Junction`;
killed at 300 s, no output; 12 s without the junction). Under Git Bash, `cmd //c mklink /J` mangles
its switch and silently makes nothing. Git for Windows walks into the junction too, so every JS reader
said UNPROVEN ("git could not list the tree"), which is honest. adr-retire-check finished.

**Fixed for 3.8.6 (the owner, 2026-10-02: "fix the hang in 3.8.6"):**
- `record.walk(root, pattern)` is `rglob` that never enters a symlink or a junction
  (`os.path.isjunction`, Python 3.12+). A link is still yielded when its name matches.
- It replaces every `rglob` in `plugin/`: adr-debt ×3, adr-retire-check ×4, adr-verify, adr-lint's
  no-git fallback, arch-lint and spec-verify.
- `mrw read --grep 'rglob\(|os\.walk\(|glob\("\*\*' plugin/` now finds two comments and no call.
- Tests: `record.walk yields what rglob yields, and never enters a directory it is told is a link`, with
  an injected predicate, since a junction cannot be made off Windows; and `record.walk and adr-debt
  finish over a link that loops back to the corpus`, with a real junction on Windows and a symlink
  elsewhere.
- One mutant is killed. ⚠ Off Windows the second test passes without the fix: Python 3.13+ `rglob`
  already skips symlinks. Only the Windows CI job measures the junction.

**Asked and withdrawn (the owner chose "fix in 3.8.6" on a premise I had not checked):** that run
suggested an all-UNPROVEN probe attests as a clean run, since `couldNotRun` reads 0. It does not.
`attestation()` gives `at: null` with `atReason: "the probe could not look at the corpus (look
UNPROVEN) …"`, pinned at `tests/corpus-probe.test.mjs:434`, and an attestation without `at` counts
for nothing. release-evidence's `countsAsRun` also needs `compared > 0`. Nothing changed.

**The stand-in review of the 3.8.6 lock fix:**
- **Blocker, fixed.** `_present` asked `Path.is_file`, which from Python 3.13 swallows every OSError,
  so a directory above the file that the process may not search still said "vanished". It uses
  `os.stat` now, with a test and a killed mutant.
- **Open.** `moved_lock_bodies` treats an unreadable file as a moved body, so `adr-verify --relock`
  offers "pass --replace-hashes" over a file it could not read. Whether a `--replace-hashes` lock then
  leaves that test unlocked through `tool_blind` was not settled.
- Checked clean: no encoded lock, digest or comparison reads the new `unreadable` key; frozen-record
  conversion and the strictFrom exemption carry the new line; a FIFO, a dangling symlink and a missing
  file still say "vanished".

**Outside runs of 3.8.6 at bf1b55c:** react-spa, python-adr-corpus and laravel-react-monorepo on macOS,
and windows-js-python-plugin-adr-heavy (this repository at 8902ada, 64 records compared) and
windows-ts-monorepo-specs-only on Windows 11. None moved a verdict.
- **The junction fix, measured on Windows by two runners.** `adr-debt docs/adr` over
  `docs/adr/loop` → `docs/adr`: exit 0 in 13 s, byte-identical to the no-junction control; 5c6980a
  was killed at 300 s. `adr-retire-check docs/adr-archive/README.md` with a junction under the
  archive: PASS, identical to its control, the archived count not doubled.
- ⚠ **My request was wrong twice:** I asked for `adr-retire-check docs/adr` and then
  `adr-retire-check docs/adr-archive`. It takes the archive README FILE, so those runs FAILed before
  walking anything and said nothing about junctions. **Lead:** a directory argument gets
  "archive README not found: <dir>"; the gate could say it wants the README file.
- **php-react-app (59,042 files on disk, 2,397 tracked), 5c6980a against bf1b55c:** `adr-debt docs/adr`,
  `adr-retire-check docs/adr-archive/README.md` and `--adopt docs/adr docs/adr-archive` were
  identical apart from the banner.
  - arch-lint was not run, because php-react-app has no architecture doc.
  - Read from source instead: `repo_files` counts toward its 6,000 cap only tracked, non-skipped,
    non-binary files, so the walk's ORDER matters only past 6,000 such files. There rglob's order was
    already filesystem order; the walk's is sorted, and so deterministic.
- **Lead, F3's class:** adr-debt's banner prints the plugin's absolute path, which on Windows holds the
  user name. Every gate's banner does.
- **Still open:** the loop's tasks are not deduplicated (`tasks: 192`, `unbacked` 64, 7 SessionStart
  lines through `loopback`), unchanged from 5c6980a.
- **The UTF-16 fix, measured on Windows (js-spa-windows, a copy of this repository at bf1b55c with
  `tests/test-lock.test.mjs` saved as UTF-16):** adr-lint and adr-next say "could not be read — the file is
  there, but not as UTF-8 text … — UNPROVEN, done is refused". No "vanished" names that file. The 200
  "vanished" advice lines in the probe are archived-record history, the same 200 as at 3.8.3.
- **Two wrong sentences left, both unchanged since 5c6980a (C2 and C8, open):**
  - work-next says the five lock holders are "READY and claimed done without evidence — `adr-verify`
    them first". They carry exit-0 evidence, and re-running adr-verify does not fix an unreadable file.
  - adr-lint's registration check over the same file blames syntax, "the lexer could not read the file
    as far as the test … rewrite the construct it stopped at", where the lock check names the
    encoding.

**Released as v3.8.6 at 9c335c6c372f79bc3f4d10adeaae372fc22dac7b (2026-10-02).** release-evidence said
SUCCESS: 55 jobs, plus the six outside runs at bf1b55c. 9c335c6 differs from bf1b55c only in two test
files, which the Windows job failed on the first push: a cp1252 `·` and a CRLF split, both in the
new tests and none in a reader.

**A CI hang, open:** in dispatch 37056738851 the `mutations 3/48` shard was killed at the 30-minute
job limit; every other shard took 5–6 minutes, and the cancelled job kept no log. Attempt 2 of the
same shard passed. Locally, `mutate.mjs --shard 3/48 --no-cache` noticed 42/42. The one suite it
could not judge, `tests/human-proof-advice.test.mjs`, "never finished" at baseline under load 10, and
alone it passes 3/3 in 1.7 s. The cause is unknown. The next shard that is killed should print which
mutant it was on: a campaign that is killed leaves nothing to diagnose, and §342 is the same shape on
Windows.

**The rest of §350, for 3.8.7 (the owner, 2026-10-05: "implement this plan end to end, NO LEFTOVERS").**
Each item has a test through the outermost callable and a `§350` catalogue mutant. Batch A's and C8's
tests were seen red before their fix. C5's and C4's were written after the fix and passed on first run;
the catalogue mutants are what showed each one failing. C9's test has not been seen red at all, because
it can only fail on Windows. The owner's calls made while planning: C2 and C3 ride
in this batch; a Status nobody could read is a new `[UNPROVEN]` verdict with exit 3, not advice and not
a FAIL; `golden`, `golden-*` and `golden_*` directories are excluded by every reader; a gate's banner
shows the home directory as `~`.
- **Item 1, the possible fail-open.** `moved_lock_bodies` no longer offers `--replace-hashes` over a file
  it could not read: `adr-verify --relock` refuses in either mode and names the file, UNPROVEN. That
  settles the open question above: a `--replace-hashes` over an unread file would have hashed no body
  for it, and `tool_blind` then reads later edits as advice — a test left unlocked by the gate's own
  instruction. The skip inside `moved_lock_bodies` became dead once the caller refused first, and is gone.
- **Item 2.** `recover_mutant` catches `UnicodeDecodeError`, so a non-UTF-8 journal is "corrupt mutant
  journal retained", not a traceback.
- **Item 3 and C7's tail.** `taskDirectories` and work-next's task list read a directory and a task
  file once, by real path (`onceByRealPath`); every other path is named with `aliasReason`, and the
  look is PARTIAL. SessionStart says it in one line instead of offering the task again.
- **Item 4 (C5).** work-next names a task directory no record owns (`ownerlessTaskDirectories`), as
  readiness UNPROVEN, and no longer calls the corpus clear. `orphan-tasks/expected.json` changed with it.
- **Item 5.** `owning_record` takes the listed path, so a symlinked tasks directory finds its record.
- **Item 6, the untrue sentences:** work-next names a lock that could not be read rather than saying
  "adr-verify them first"; adr-lint's registration check names an encoding, not "rewrite the construct
  it stopped at"; the probe's scratch message names only its own scratch; `adr-retire-check` given a
  directory asks for the README file; a dangling link at the corpus root is PARTIAL, not "No QH corpus".
- **Item 7 (§346).** `--diff` names an environment change and compares `undecided` by file and reason.
- **C3.** A file the linted record does not own, unreadable, is advice on the cross-record cycle check
  ("a cycle through them is UNPROVEN, not absent"), never could-not-run for the whole record. A Windows
  sharing violation (winerror 32) is "held open by another process", never "Permission denied", and no
  reason carries the path (`os_reason`).
- **C2.** An unreadable or undecodable task is readiness UNPROVEN, not an unbacked done claim; the
  project root is resolved from the LISTED path (`git_root`, shared in `record.py`), so a task directory
  that is a junction leaving the tree, or a long path, no longer blames `.quality-harness.json`.
- **C8.** adr-state says "Superseded by a record that could not be read" (`supersededByUnreadable`); the
  long-path advice past 260 says the path alone is past MAX_PATH; adr-lint says nothing about the
  content of a record or task it called not text; a `readme.md` in any case is the index, never a task;
  fixture and golden specs are not the corpus's; a locked test reached through another spelling of the
  same file (`os.path.samefile`) is compared by digest, not "vanished"; a record with no readable Status
  is `[UNPROVEN]`, exit 3, relayed by the facts dispatcher as UNPROVEN. On a record older than the
  corpus's `strictFrom` it is advice instead, tagged as strictFrom tags any demoted finding: it was advice
  before `[UNPROVEN]` existed, and exit 3 over history is the day-one failure strictFrom prevents.
  ⚠ An outside run where a record moves PASS → UNPROVEN counts in ADR-082's `passToFail` ("left PASS"),
  so `release-evidence` reads it as a regression. That is the record's own definition, kept; a corpus
  with a record that has no Status line will show it.
- **C5.** work-next names every record it does not act on, with its reason (`undecidedNamed`; the text
  names any reason other than "a plan, not yet decided"); a readable task under an unreadable record is
  attributed to it, whichever way the record failed; a lone CR ends a line in every JS corpus read;
  corpus-report counts a record in any case; SessionStart names a task directory git lists and the disk
  does not hold; adr-state names an unread task under any governing record; `--diff` on a PARTIAL report
  names what made it partial and what dropped out. A case twin in the listing is one task, named — the
  item-3 rule, with its own test.
- **C9.** adr-next, work-next, adr-state and adr-context write `/` in every JSON path. The test is red
  only where the separator is `\`, which the Windows CI leg runs; no mutant is catalogued, because a
  campaign off Windows cannot see one.
- **C4/F3.** SessionStart's could-not-run line goes through corpus-probe's `scrubber`, now in
  lifecycle.mjs, so a home path in a spelling `os.homedir()` does not match (an 8.3 name, a resolved
  link) is `‹path›`. Every gate's banner shows the home directory as `~`; ADR-031's Follow-ups say so.
- **Ops.** `scripts/mutate.mjs` writes `mutate: <time> baseline <files>` and `mutate: <time> mutant
  <label>` to stderr before each run, so the next killed shard names what it was in.
- **Batch B, the autoharness review's skill-listing idea.** `tests/skill-metadata.test.mjs` holds each
  description to 700 bytes and the listing to 6,850 characters (measured: 648 and 6,518), and to a
  trigger — "Use when …" or a quoted phrase. execution, postmortem and quality-policy were reworded to
  "Use when"; each keeps its "Do not use" boundary, and adr-execute's eval-pinned text is unchanged.

Slips of mine on the way, each caught before a commit: an insertion split `os_reason` so its fallthrough
landed in another function (every non-sharing reason was None for one edit); two range replaces swallowed
a test's closing `})` (mrw's balance advisory said so; I read past the range only after the parse error).

**Class audits (CLAUDE.md §5), 2026-10-05:**
- **A verdict on content after "not text".** `mrw read --grep 'holds NUL bytes' plugin/bin/ plugin/lib/`:
  adr-lint ×2, both now return at once; adr-next's is a stopped task, no content verdict. Nothing else.
- **The banner.** `mrw read --grep 'def gate_identity|def _shown' plugin/bin/`: every `gate_identity` has
  its `_shown`, the same count of each.
- **Native separators in JSON.** `str(path)` beside a JSON key in `plugin/bin/` and `plugin/lib/`: none
  left. `path.relative(` in a script that writes JSON: adr-context ×2 was the same defect and is fixed
  with the C9 test; event-log, mutate-propose, performance-trace, run-shell-hook and worktree use it for a
  comparison or already join with `/`; qh-check's is a human stderr line (an absolute path there only
  when the record lies outside the checkout — named, not changed).
- **A case-sensitive README test.** `[!=]= "README.md"` across `plugin/`: adr-retire-check's archive
  walk (an archive's catalog is `README.md` by contract) and lifecycle's `listedReadme`, which decides the
  other spellings on purpose. Neither changed.

**The catalogue, after the batch:** moving `scrubber` and `undecidedReason` into lifecycle.mjs and
rewriting the lines under 26 older entries left them matching nothing (`mutate.mjs --stale`, which the
selftest runs). `--repoint --since HEAD` proposed seven; `--write` refused them on stderr, exit 2,
because their files were uncommitted — the tool working, which a grep of mine over its output hid. All 26
were repointed by hand, each `from` checked to match its file exactly once, and `--stale` then said every
entry matches.

**Still open, and why:** the skill-usage counter and ledger reader (Batch C) wait for a record the owner
Accepts; the ADR-081 measurement is due on or after 2026-10-08; §342 waits for its trigger, the next slow
Windows run.

**Deferred by ADR-084 (Proposed, 2026-10-05):** hook durations per event. No ledger records how long a
hook took, so `ledger-report.mjs` cannot report it; recording one is a separate decision, with its own
cost on every event.

**The stand-in review of f8d1eaf (2026-10-05), and the push's own CI.** Every finding was reproduced by
the reviewer in a scratch tree and is fixed here with a test and a killed catalogue mutant:
- **A fail-open, introduced by f8d1eaf.** A done task saved as UTF-16 PASSed under strictFrom: the NUL
  finding was demoted to advice, and the task's `None` info kept every evidence check off it. The
  finding is now `evidence=True`, never demoted.
- **A done task under a record with no readable Status** stood on an old record, where `Proposed`
  blocks. `check_status_allows_execution`, inside `protected()`, now says UNPROVEN.
- **A false refusal.** `--relock` called a body "moved" that `lock_findings` accepted through another
  spelling; `moved_lock_bodies` takes the same `_same_file` lookup, with the root passed in (never put
  into the lock map, which is encoded).
- **Untrue or lost sentences:** the scrubber turned gateSaid's `~/x` into `~‹path›`; adr-state matched
  an unreadable superseder by number across corpora; the probe's UNPROVEN entry carried no reason (the
  matrix now requires one); work-next's count line said every held-back record "carries a status".
Advice taken as it is: the dispatcher's exit-3 line carries the first `unproven:` finding and not the
advice, as its could-not-run line carries one reason.

The push's campaign (run 37354513065) then had three GREEN mutants and a red Windows job:
- **`§350 C3: … against the unresolved root`** was GREEN on Linux, where `/tmp` is not a link. The test
  now reaches the checkout through a symlink, so the two spellings differ on every platform.
- **`chaos 916b515 C-5`** went GREEN because its test, renamed by C3, no longer reached adr-lint's main
  could-not-run handler. A new test does — a task the record itself owns, unreadable — and it found that
  the handler printed the absolute temp path on macOS (relpath of a listed path against a resolved cwd),
  now compared by real path. Its sibling: a directory or FIFO named like another record's task still
  made this record could-not-run through `refuse_irregular`; it is cycle-check advice now, like C3.
- **`review e0ef6d4 F6`** went GREEN because the directory of an unopenable task is already readiness
  UNPROVEN through `unopenable`; the second route through `unreadTasks` was removed as redundant. The
  GREEN also showed that an unreadable task in a shared `tasks/` beside its sole record was named
  "no record owning these tasks was found"; `unreadTasks` now count as owned.
- **Windows:** `tests/adr-next.test.mjs` expected `tasks_dir` with backslashes (C9 changed it, by
  design), and a scratch directory named `nul` — a device name there — could not be a spawn's cwd.
  C9's own test ran green on that job, never having been seen red, as said above.

**ADR-084 (Accepted by the owner, 2026-10-05) is executed for 3.8.7:** a PreToolUse `Skill` hook records
`skill.invoked` for this plugin's skills and prints nothing; `plugin/scripts/ledger-report.mjs` reads the
skill counts, same-tree skips and checks, UNPROVEN for a ledger not read whole. Each task has its red
run, its exit-0 run and a killed mutant per Rests-on name in its own Mutation Log.

**Outside runs of the 3.8.7 RC at 7483869 (2026-10-05)** — react-spa (compared 2), laravel-react-monorepo
(compared 95) and php-laravel-monolith (PARTIAL in both runs, uncompared): no verdict moved, no PASS →
UNPROVEN. rust-records-corpus could not run, its classifier refusing cloned code. They found two defects, both fixed
before the tag, each with a test and a killed catalogue mutant:
- **A privacy regression, introduced by the review fix above.** Exempting `~` from the scrubber's
  absolute-path head printed a record's Cross-references `~/<other private repository>/…` whole, where
  3.8.6 printed `~<path>`. Reverted: a path under the home directory stays a placeholder, and gateSaid's
  line says `~‹path›`. The reviewer had called that form cosmetic; the run showed it is the point.
- **An over-count.** The probe counted adr-lint's exit 2 on a not-recognised note (a file named like a
  record that never claimed to be one) as could-not-run, two of them in that corpus. It is a verdict;
  any other exit 2 is still counted.
A runner's caveat worth keeping: a days-old clone under `/private/tmp` had tracked files deleted by the
OS's periodic cleanup, and failed with ERR_MODULE_NOT_FOUND — a fresh clone, never a release defect.
- **rust-records-corpus ran after its user approved** (compared 185, no verdict moved; FAIL 117 / PASS 68 both sides) and
  found a third: a record with no Status that FAILs on another rule prints `unproven: … no **Status:** line`
  under the FAIL — FAIL outranks UNPROVEN, by design — and the probe kept only the FAIL's first finding and
  its advice, so the record's one Status signal was in no report. The probe now carries `unproven` lines
  under any reached verdict and `--diff` compares them. rust-records-corpus also saw the `~` leak, fixed above.
- **The Windows CI job of the dispatched campaign at 91c62db** found the `~` leak in its other spelling:
  `~\elsewhere\x.md` met no absolute-path head (a `/`, a drive letter or a UNC prefix) and printed whole,
  in 3.8.6 as well. A `~` followed by either separator is now `~<path>`, with a test that runs everywhere.
  The same campaign's other jobs were cancelled by GitHub ("not acquired by Runner of type hosted").
- **The runs at e3f77ce** (react-spa compared 2, python-adr-corpus 78, laravel-react-monorepo 95, all
  passToFail 0; php-laravel-monolith PARTIAL and the corpus-free web app compared nothing) confirmed the
  `~` and couldNotRun fixes. php-react-app found one more, older than this release: `records[].status` copied a
  record's Status line unscrubbed, so "recorded in `~/<other repository>/…`" printed whole in the full report
  (never in --diff or --attest). It and `workNext.partialBecause[].reason`, which can carry a Status, are
  scrubbed now; the audit was `mrw read --grep '(goal|title|stopped_by|reason|why|status): [a-z]' corpus-probe.mjs`
  for fields emitted without `scrub(`, which found those two and nothing else carrying corpus text.
- **The runs at 3706765** (react-spa 2, python-adr-corpus 78, laravel-react-monorepo 95 compared, all passToFail
  0) confirmed the Status scrub. php-react-app noted that `--diff` compared no field of `records[]`, so that very fix
  was invisible to it; the owner chose to fix it before the tag: `--diff` now names records that came or went
  and a Status that changed. The campaign at 3706765 also had one GREEN: `§350 RC: a path under ~ is printed
  whole` became equivalent once HOME_RELATIVE ran first (e3f77ce), and I had not re-run that function's
  other mutants after adding it — the §18 class. The entry is removed; HOME_RELATIVE's own mutant holds the
  mechanism.
- **A lead, not yet proven:** the installed 3.8.6 per-prompt branch-state brief once printed `main @ e3f77ce, 4
  uncommitted` labelled "read 60s ago" about an hour after 3706765 was committed and the tree was clean;
  `branch-state.mjs --brief` run by hand answered correctly. Whether the snapshot ADR-065 serves can carry an
  age younger than its content is unverified, and is the next thing to look at in branch-state.
- **The runs at ca3d61d** (react-spa 2, python-adr-corpus 78, laravel-react-monorepo 95, all passToFail 0).
  php-react-app: the new records diff printed "X → X" where the older report held a raw Status and the newer a
  scrubbed one; it now compares after scrubbing both sides, so a redaction-only change is not a change. Its
  other lead, `let's /work` in a quoted chat line becoming `<path>`, is the scrubber's documented safe
  direction (over-scrubbing), kept.
- **The branch-state lead above is withdrawn.** Two later instances were timed: a brief reading `@ 3706765,
  read 312s ago` and one reading `@ ca3d61d, 4 uncommitted, read 56s ago` were each taken before the commit
  that followed (06:47 against 06:51:11; ~06:58:10 against 06:58:24), so the age each said was true and the
  snapshot was simply older than the commit. The first instance was not timed and is not claimed either way.
- **Outside runs at 4283d6a, filed:** react-spa (2), python-adr-corpus (78) and laravel-react-monorepo (95),
  all passToFail 0 — `docs/corpus-reports/2026-10-06-*-3.8.7-4283d6a.json`.
- **ADR-081 and ADR-084 follow-ups, done 2026-10-06** (the owner: no dated leftovers). Six adopters ran a
  read-only, counts-only command over their own ledgers: before v3.6.0, 6 of 344 checks re-ran on an
  already-passed tree; after, 3 checks in all, none, and 0 same-tree skips anywhere. Too few runs since 3.6.0 to
  compare with the spec's 53 of 280: UNPROVEN, not shown. From now on every outside run also pastes
  `ledger-report.mjs --json` (docs/corpus-reports/README.md), so both counts repeat per release.

## 353. CLOSED 2026-10-06 — A 3.8.8 regression from an outside run: "no visible blocking" stopped an approval
An outside run after the tag (laravel-react-monorepo: 93 records, 278 tasks; 95 compared, passToFail 0, filed) found two tasks moving done → stopped at 944bb37.
- **A false stop.** An approval of a video check ended "no visible blocking on a busy mid-clip frame", and "blocking" was read as the verdict. The reading was wrong before 3.8.8 too. 3.8.8 exposed it by making the LAST sign-off decide, and in that task this note is the last one. `NEUTRALISED` now also neutralises a negative word that "no" and at most two words name as absent: "no visible blocking", "no blocking issues". The twins still stop: "blocking on legal", and "no, it failed", which keeps its comma.
- **A right stop with an unreadable reason.** The note ended "The post-deploy demo eye check (S6) is NOT done", but the printed reason quoted the note from its start and was cut before that clause. The reason now names the words that stopped it first: `a human sign-off says stop on «NOT done»: …`. They come from `stop_words`, in `human_outcome`'s own order.
- Test `tests/human-stop-3-8-9.test.mjs`. Two new mutants; all 13 catalogue entries on the edited verdict code re-run RED.
- Not checked: php-react-app's other tasks that were already unbacked at v3.8.7, because of moved test locks.
- **A second 3.8.8 regression, from another outside run** (python-adr-corpus: 72 records, 209 tasks; 77 compared, passToFail 0, filed). Task 076/T11 carries tool-written exit-0 rows, yet newly read as unbacked.
  - **Cause.** `adr-verify --human-mutant` writes `· human-observed · mutant killed · test exit N · …`, which the sign-off pattern also matches. With 3.8.8's last-sign-off rule, that row's `--why` ("the request fails …") read as a stop and withheld done. Reproduced with that shape.
  - **The same row was also a fail-open, older than 3.8.8.** It counted as a human-observed task's sign-off, in adr-next's `is_done` and in adr-lint's done check, so a task nobody signed off counted done.
  - **Fix.** `HUMAN_MUTANT_NOTE` excludes the row in both adr-next readers, and adr-lint's check skips it. Test `tests/human-mutant-row.test.mjs`, three cases with controls. Three mutants, RED; the 13 sign-off mutants re-ran RED.
- **Leads from the same run, for §354's batch:**
  - corpus-probe `--diff` printed adrLint advice that DISAPPEARED (the 3.8.8 duration floor, correctly) with no "-" mark, while workNext lines carry "+". A reader cannot tell removed from added.
  - public public/dir-status-rfc (62 `RFC*.md` with status set by directory) read as `look: ok` with 0 records. "ok" over a corpus never recognised should be could-not-look, or say what it did not recognise.

## 356. CLOSED 2026-10-08 — corpus-probe `--diff` reports a transient could-not-look as a changed advice line

Found by an outside run of the 3.8.10 RC (d39a15f) on laravel-react-monorepo: `--diff` against v3.8.9 showed one added advice, `adrLint docs/adr-archive/ADR-030-…md advice: cross-record dependency cycles were NOT checked: this corpus could not be listed from git`. Read from source, nothing between v3.8.9 and d39a15f can add that line: `record_files`, `check_cross_record_cycles` and `tracked_or_unignored_paths` are unchanged, and the one edit on the path (adr-lint's pending branch no longer re-takes `tracked` as None) can only remove it. The peer re-ran adr-lint twice on the same record at d39a15f: PASS, no advice; both `git ls-files` calls under 0.1 s at load 5–6. The original probe ran while the peer's machine logged load 10–32, so a 30 s `ls-files` timeout is plausible but unmeasured.

The lead: a could-not-look advice is an observation about the run, not about the corpus, and `--diff` lists it beside real advice changes. A diff could mark advice lines of the could-not-look kind separately (or say "transient: could not look") so a reader does not chase a regression. Not built; no target measured.

**Closed 2026-10-08.** `--diff` now marks an adr-lint advice line that came or went and says what the run could not look at (`NOT checked`, `could not be listed`, `could not be read`, `could not run`), with "— could-not-look: about this run, not the corpus; re-run before reading it as a change". The line is still printed; ordinary advice is unmarked (`tests/probe-diff-transient.test.mjs`, both directions). Members of the class: the one place --diff prints advice (`mrw read --grep 'setChange\(|adviceChange\(' plugin/scripts/corpus-probe.mjs`: the advice call, now `adviceChange`; the `unproven` call already says what could not be decided).

## 357. CLOSED 2026-10-07 — History rewritten to remove other projects' names; older evidence points at the old history

The whole history was rewritten on 2026-10-07 to remove other projects' names, so every commit sha
changed: a sha written into a file before this entry — Verification and Mutation Logs, attestation
`at` fields, record and backlog citations — refers to the pre-rewrite history and does not resolve
here, and is left as written (§10). The same commit re-seals ADR-042 (its archived unit changed) and
re-locks ADR-068 T2 (a locked test's string literals changed); the next release needs a fresh outside
run (§18), because every existing attestation names a pre-rewrite commit.

## 360. CLOSED 2026-10-07 — History rewritten a second time, for strings copied from other repositories' corpora

§357 removed other projects' NAMES. The same day showed that their file names, path stems, directory
names and document titles had been committed too: a parity row reproducing an outside probe's finding
quoted the corpus's own paths and titles, and older fixtures, tests, records and this backlog carried
record stems and file names from outside runs. Each was replaced, in the tree and in all history, by an
invented equivalent that keeps the property its test reads (a date prefix, a sort order, a case quirk).
Every commit sha changed again: shas written before this entry, attestations at 13136e6, a48fa5f and
fb27573 included, refer to an earlier history and are left as written (§10). A finding from outside is
reproduced from now on with invented names, never with the corpus's own (CLAUDE.md §6).

## 361. CLOSED 2026-10-08 — A sign-off that quotes its red run before the green one read as a stop

From an outside session (reproduced here with invented names). A human-observed sign-off affirmed what
it saw, "observed: … red run 111 (tests alone on main): TestAlphaRefusesFirst failed …; green run 222 on
head …: ok …, with all three tests unable to skip (TestGammaNeedsTool fails on …)", and adr-next stopped
on «failed» while adr-lint said PASS. The rows around it could not clear it: the exit-0 fence rows were
dated the same day ABOVE it, and the rows below were `adr-verify --relock --replace-hashes`, which never
outrank a stop (§354). This was not a fail-open. It was the safe direction, but a done task was held back from its dependents.

- **Class: a negative word the note QUOTES as evidence, read as the note's own verdict.** §281 (program
  output after a marker), §353 ("no visible blocking") and §354's open "approved; no tests failed" are
  members already found. Two are closed here.
- **The red→green run report.** `run_report_removed` in `plugin/bin/adr-next` blanks the last red run's
  clause (to its first break) only when the note affirms before it, a green run follows that clause, and
  the green clause has its own pass word. Nothing else is blanked.
  Everything else still speaks. `not_the_verdict` applies it with `NEUTRALISED` in `human_outcome` and in
  `stop_words`, so a stop's reason names its own word, never the red run's.
- **The absence form.** `NEUTRALISED` reads "no tests failed" and "no failed tests" as an absence for a
  closed list of nouns only (tests, checks, jobs, cases). "No it failed" and "no deploys failed" stop.
- **Stated limit: an aside is read, never blanked.** The owner chose this on 2026-10-08. The reported
  row ends "(TestGammaNeedsTool fails on …)", which says how a test refuses to skip, and text cannot
  tell it from "(the deploy fails)". So that row stays a false stop, the safe direction, and a writer
  leaves the aside out or words it without a negative. The rule was reached in two steps:
  - A first cut blanked any aside after the green clause's pass word. That made "green run 222: ok (the
    deploy failed)" done, a fail-open.
  - A present-tense-only rule left "(the deploy fails)" done, a fail-open again.
  Both steps are removed. Both notes are now must-stop rows, and so is the reported row.
- **A guard removed.** A first cut also required the green run to be the very next clause. Its mutant
  stayed GREEN, because the red clause is blanked only to its first break, so a clause between them is
  read anyway. The guard is removed.
- **Enumeration:** `mrw read --grep 'AFFIRMATIVE|NEGATIVE_WORD|human_outcome|humanOutcome|NEUTRALISED'
  plugin/` returns two files: `plugin/bin/adr-next`, the only classifier, and `plugin/lib/record.py:1048`,
  a docstring naming it. No JavaScript copy exists to drift.
- Test `tests/human-stop-red-green.test.mjs`: seven false-stop rows are now done, and 28 twins still stop.
  Eleven new mutants are RED. Three mutants that guarded only the aside rule were retired with it, and two
  were repointed. One twin row was replaced after its mutant went GREEN: it had a past-tense aside, and the
  new row has a pass word after the green clause. The repointed existing entry is RED, and so are the 39
  existing entries the sign-off labels select.

## 362. CLOSED 2026-10-08 — An attestation says `records: 0` for a corpus whose only record is Proposed, while carrying a lint verdict for it

Found by an outside run at 139713e3 (null-corpus, look ok). Its attestation said `corpus.records: 0` and `verdictChanges.compared: 1`. Reproduced here with invented names: one file, `docs/notes/specs/2026-09-01-widget-design.md`, holding `# ADR-041: …`, `**Status:** Proposed` and a `## Context` heading, outside any record directory.
- **The readers agree.** Both runtimes recognise the file as a record, through the content arm. work-next says "0 record(s), 0 accepted … 1 further record(s) are not acted on" and names it as a plan; adr-state names it as Proposed; the probe lints it (FAIL) and puts it in `undecided`.
- **The attestation does not say so.** `corpusCounts` copies work-next's `records`, which counts the records a reader acts on, and an attestation has no field for undecided ones. So "records: 0" sits beside a compared verdict. The probe's `disagreements` compares readiness only, so it reports 0, which is correct for what it measures.
- At an older revision (two days earlier) the same corpus gave no lint verdict: ADR-092's content arm now recognises a record-shaped file outside a record directory. That is by design (Decision 1, as amended on 2026-10-07).
- **Smallest fix:** add `corpus.undecided` (the probe's `undecided.length`) to `corpusCounts`, `attest-import`'s `CORPUS_KEYS` and the schema in `docs/corpus-reports/README.md`. **Not done:** it changes the attestation schema, and tests locked by ADR-089 T2 and ADR-082 T2 compare the whole `corpus` object, so they would need relocking with the owner's approval.
- **Fixed 2026-10-08, the owner's decision ("add undecided").** `corpusCounts` writes `corpus.undecided`, the length of the report's `undecided` list, beside `records`. `attest-import` files it, and `docs/corpus-reports/README.md` documents it. A report with no `undecided` list (an older probe) gets no count rather than a 0, so the locked tests' fixture reports, which carry none, still pass byte-identical: no relock was needed after all. Tests: `tests/probe-attest-undecided.test.mjs` (held back, none held back, older report) and a new case in `tests/attest-import.test.mjs`. Three mutants RED. The invented reproduction now attests `{"records":0,"undecided":1,"tasks":0,"taskDirectories":0}`.

## 363. CLOSED 2026-10-08 — ADR-091 landed; its shipped readers, reviewed, and one hook line it exposed
ADR-091 was executed by a background worktree agent (T1-T3, each with a red run and killed mutants; the relock of ADR-075 T2's test the owner approved on 2026-10-07), rebased onto main and fast-forwarded. The catalogue move was generated from main `5f776809`'s catalogue plus T1/T2's entries; main's catalogue had not changed since. The generator stays out of the repository, as T3 S3 says.
- **The gpt-6.1-sol review of the shipped readers (b84d1dd1..724660e7): five findings, all fixed now.**
  - **Fail-open:** adr-lint resolved an `Enforced-by` label from a per-source file the campaign refuses: an entry mutating another source, a label repeated across files (case aside), an empty per-source file. `mutation_labels` now applies `loadCatalogue`'s rules and is could-not-look on each.
  - A listed catalogue path that is not a regular file (a link loop) was skipped, so its label read "a pointer to nothing". It is could-not-look, naming the path.
  - mutate-propose read an unreadable, oversized or non-JSON catalogue file as no catalogue, and a string in it as "neither". Such a string is now `unproven`, and the report names the file.
  - Pre-existing, fixed with them: a `--tests` directory written with backslashes or a trailing slash matched nothing; the template and adr-lint's docstring promised a grade "on every run", which a stale entry does not get.
  - Test `tests/catalogue-readers-review.test.mjs` (the locked `tests/catalogue-readers.test.mjs` is unchanged); six mutants RED; the moved T2 entry repointed and RED.
- **The one scoped verification review: no new fail-open; one regression and two remaining fail-opens, fixed.** A tracked catalogue file deleted but not staged made the catalogue unread (the campaign skips it, `git ls-files --deleted`): it is skipped now. adr-lint checked less of an entry's shape than the campaign (`from`, `to`, `tests`, `only`): it applies `ENTRY_FIELDS` now. mutate-propose called a string catalogued when it appeared anywhere in a catalogue's text, a refused one or an entry's metadata included: only a shape-valid entry's `from` counts now, and a refused catalogue is unproven. `tests/mutate-propose.test.mjs`'s fixture entry held only `from`, which the campaign refuses; it carries a whole entry now. Four mutants RED (one GREEN first, until a row with a malformed entry inside a `mutations` array); all 18 ADR-091 mutants re-ran RED. No further review round (the owner's rule).
- **The full gate then caught a regression in that fix, for adopters.** The entry-shape rules (the campaign's `ENTRY_FIELDS`, and a label used once) applied to a single `tests/mutations.json`, which in an adopter's repository follows that adopter's runner: the plugin ships none. A label-only catalogue, resolved since 3.8.x, read UNPROVEN (`tests/chaos-315-mutate-catalogue.test.mjs`). The campaign's rules now apply where the catalogue has the per-source form, which is this campaign's; a single file alone is read as before ADR-091, in adr-lint and in mutate-propose. Named limit: a legacy-only catalogue whose text mentions a string still reads it as catalogued, as it always did. Rows moved to the per-source form, a legacy twin added; four scoping mutants RED; all 22 ADR-091 mutants re-ran RED.
- **A hook line the move exposed, closed as by design.** Deleting `tests/mutations.json` printed "UNPROVEN: could not classify" from `facts-gate-dispatch.sh`. A first fix silenced a missing path that is not `*.md`; the full gate refused it. `tests/staged-product.test.mjs` records the decision (2026-09-10): a missing non-Markdown path is UNPROVEN, because a deleted path the hook cannot see may be a whole record directory (`docs/adr/ADR-001-x/`), and silence there is the fail-open direction (§16). The fix was reverted; the line is that rule working.
- **Record defects the executor reported, left as history (§10):** T3's S2 command (`adr-lint docs/adr`) refuses a directory, and T3's Acceptance prose repeats a paragraph. S2, S6 and S8 await the owner's sign-off; S8 reads the per-shard timings of the first dispatched campaign after the push. Follow-up 1 (what "owner" means) is open in the record.
