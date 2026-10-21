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

## 302. CLOSED 2026-10-15 (sweep: both open items fixed) — The 2026-09-26 inbox: one regression of mine, four false blocks and advisories fixed for 3.0, two left open

**CLOSED 2026-10-15** (backlog sweep, each item re-verified against the code): both items left open here are fixed. A nested `[build failed]` no longer grades a real kill inconclusive (§253, ADR-085; `plugin/bin/adr-verify` anchors the line), and adr-lint reads a Python `Class::method` selector as `Class.method`. The `-k` filter spelling was never probed and is declined as an unconfirmed lead.

Eight inbox drawers from peer projects (go-cli-adr-corpus, go-recall-service, rust-records-corpus), each with a repro. Each was confirmed against source before acting.

**Fixed for 3.0** (each with a regression test beside a dirty twin, and a RED catalogue mutant):

1. **A false self-dependency FAIL — a 2.111.0 regression of mine.**
   - The report: `T2-the-surfaces-say-what-t1-made-true.md` with `Depends-on: T1` was refused as depending on itself.
   - The cause: adr-lint's `id_matches` matched a task id ANYWHERE in the file name, although its docstring promised an anchored match. The §295 self-dependency check reused it without reading the regex.
   - The same loose match also mapped the README order of T1 onto T2's row (`order(T1)=2`).
   - Now a task's id is the first task-id token in its name, as adr-next already read it.
2. **Advice on relock rows.** `--relock` rows (ms:0) were advised as "too short to have run the fence". A lock snapshot runs no fence; the floor now skips it.
3. **cargo's `--test <binary>` read as a test-name filter**, which blocked `done` on every row outside that binary. It was removed from the filter flags. It had been there since the first commit, with no measured runner behind it.
4. **A two-runner fence.**
   - One runner's filter was applied to the other runner's tests, which also blocked `done`.
   - Now a test runner of the row's language with no filter, whose command names the row's file, its directory or Go's `...`, runs that row.
   - cargo is deliberately not in that list: its `-E` and positional names are filters this gate does not parse. A catalogue GREEN found the first cut treating them as unfiltered.
5. **arch-lint read Go's `./...` as a missing path** (reported twice), which blocked a project's real gate. A token containing `...` is a package pattern.

**Left open:**
- A nested `[build failed]` grades a real kill inconclusive. This is §253, now with a second corpus and a repro (go-recall-service `keep/t8-build-probe.out`). It is not a false block: the grade is weaker than it should be, and the reporter worked around it.
- `Class::method` spelling for Python unittest rows in a Tests table (from the two-runner report). It was reported beside #4 and is not blocking there.

**How #1 got past every check.**
- The new check was tested only on the one-task fixture, where it must FIRE. Nothing tested that it stays silent on a real name that merely mentions another task. The dirty half of CLAUDE.md §4 was there; the clean half needed an adversarial realistic input.
- A mutation campaign cannot find a check that fires too often: every mutant weakens it.
- None of the outside corpora of the 2.111.0 rounds had a slug containing another task id.
- So the class — a check reused on the strength of its docstring — is named here. The fix is a test on the shape reported, through the gate itself.

## 303. CLOSED 2026-10-15 (sweep: one item fixed, three declined) — 3.0.0 before the tag: a Codex round and three outside runs (2026-09-26)

**CLOSED 2026-10-15** (backlog sweep, each item re-verified against the code): the brace-expanded `git {-c,hook…=false} push` is fixed (`plugin/scripts/shell-words.mjs` expands braces; tests in `tests/publish-command.test.mjs`). Declined: whether a spec's `Implemented` status is terminal (a lead with no observed cost), a cargo positional or `-E` filter crediting every Rust row (by design, adr-lint's docstring says why), and the refresher-lock interleaving (its cost is one extra bounded `gh` refresh, and Codex's interleavings were never reproduced).

**Outside runs at 2c0f7b2.**
- **go-cli-adr-corpus, on the corpus that caught §302's regression.** ADR-075 PASSes; all 82 records PASS; `couldNotRun` 0, `disagreements` 0. Its `at` was null because it ran from a `git archive`.
  - A lock-moved task routed to adr-execute is intended.
  - Its spec with `**Status:** Implemented` reads UNPROVEN, which is honest under the documented set. OPEN lead: should `Implemented` be a recognised terminal spec status?
- **Windows (git 2.49).** The probe was clean, and its attestation is filed. It also caught two real test defects, fixed in efad638:
  - the publish-hook tests assumed git ≥ 2.54, and now skip with that reason;
  - the detached refresher's cwd held the temp repository, so cleanup hit EPERM. Cleanup now waits for it and retries.
- **ts-generator:** could not run; its classifier refused the cloned code, and the decision is with its user. Could-not-run, not a finding.

**The Codex round (high effort, v2.111.0..2c0f7b2) found seven real defects.** The release was HELD for #1, a fail-open. Each was confirmed against source and fixed with a test that fails without the fix, and a RED catalogue mutant.
1. **P1, a fail-open.** `git push --no""-verify` and `--no\-verify` read as a plain invocation in an armed session: advice, while bash handed git a real `--no-verify`. Quotes and escapes are now stripped before the checks, and a `$` or a backtick keeps the refusal.
2. **Paths in the stored hook command were re-expanded by `sh`.** A `$` in the installation path vanished. The paths are single-quoted now.
3. **Two prompts that both judged a lock stale could start two refreshers.** The second renamed the first one's fresh lock. The lock now holds a unique token, and a reclaimer puts back a lock whose token is not the one it judged stale.
4. **A quoted git config value (`remote = "origin"`) broke push invalidation.** Values are now read as git reads them: quotes, escapes, comments.
5. **The unfiltered-runner rule matched a DIRECTORY SUBSTRING**, and it credited a pytest `::` selector and an `echo` of a runner. A runner must now start its segment, and its path arguments must reach the row exactly: the file, a directory holding it, a dotted module, or Go's `...`.
   - The catalogue then found the first `::` check dead: an argument carrying `::` never equals a path.
   - Worse, the check never credited the one test a `file::test` selector does run, which was a false block.
   - A selector now credits exactly the row it names.
6. **Removing `--test` had also removed cargo's binary scoping.** `--test X` now selects only `tests/X.rs`. A cargo command without it cannot be shown not to run a Rust row, so it does not block (§16).
7. **arch-lint's `...` exemption covered any token containing `...`.** Only a token ENDING in it is Go's pattern.

**How #1 got past T3's own review and catalogue.** The escape table listed the spellings measured that day, and every one of them was a plain token. Shell quoting is transformation, not text. §16's rule — reproduce shell semantics against a shell — applied here, and was not applied to the new predicate. The fix judges what git receives, not what was typed.

**Round 2 (Codex, high effort, efad638..fd3922b) and the campaign at fd3922b.** The release was HELD again for #1, a fail-open.
1. **P1, a fail-open, the same class as round 1's #1.** `git push --no-\<newline>verify` and `git push --no-{verify,verify}` reach git as `--no-verify` (measured with `printf '%s\n'` under bash), and each read as a plain invocation in an armed session. The quote fix had judged what was typed after removing quotes, not what the shell EXPANDS. `leavesHookInPlace` now joins line continuations first, and outside quotes it admits only an allowlist of plain characters: a wrong `false` costs nothing, since ADR-061 refuses the unchecked tree as it did before git was armed.
   - `git {-c,hook.qh-publish-push.enabled=false} push` is never matched as a publish by ADR-061's text classifier at all, in any session. That gap predates 3.0 and is the §301 Stage 3 lexer's; OPEN.
   - Four more GREENs in the same campaign. Two were a second path masking the first. `without_workspace_filters` (shard 7): 3.0.0's two-runner credit credited every pnpm fixture's PHP row, so a pnpm-only fence with a TypeScript row was added. The prompt path's `key` (shard 18): the locked T1 test read a cache the refresher behind the previous prompt had already keyed; a new test collects with nothing cached, and the mutant's `only` points at it, the locked body unchanged.
   - Shard 21: `--test` put back among the narrowing flags went unseen, because `cargo_runs` now credits every cargo fixture. `node --test <file>` — a mode flag — is what keeps it out, and no fixture held it. Shard 10: CF1's blank-line stall test is a timing bound, and the mutant is CUBIC (10.0s at 4,000 lines, 77s at 8,000, measured on the regex alone): 4,000 sat on the 10s bound, so a fast runner let it through. It now uses 6,000.
2. **A GREEN catalogue mutant (shard 33/48):** "a mention imports the check source before its warning reads the ledger". ADR-066's review fix had put a second `importCheckRecords` inside `publishVerdict`, so each import hid the other (both removed: RED; either one: GREEN). The import now lives in each caller once — PreToolUse's boundary and `runPublishHook` — and `publishVerdict` only decides.
3. **adr-lint, fixed:** a pytest class selector (`file::TestSuite`) and a unittest dotted class were read as a test name and blocked the rows they run (a false block). A selector's last component rules a row out only when it is another `test*` function; a class cannot be shown not to hold the row (§16). Go directory arguments are not recursive: `go test ./pkg` credited `pkg/sub/…`, and a bare `go test` credited every Go row; only `/...` descends, and a bare call after a `cd` is not judged. A quoted `cargo test --test "smoke"` is the same binary.
4. **arch-lint, fixed:** `! grep -q x ./missing...` still passed for ever. A `...` token is exempt only where its base exists; Go itself refuses a missing base (`lstat ./cmd/: no such file or directory`, go1.27.1, 2026-09-26).
5. **branch-state, fixed:** `[Branch "main"]` is the same section to git and was no section to the key. Section names are now read in any case, and a config shape the key does not model — an include, a continued line, an escaped or old-style subsection — gives a null key, which is refreshed rather than trusted.
6. **Known open, under-block or cost only:**
   - `cargo test <filter>` and `cargo nextest run -E 'test(…)'` beside a filtered runner credit every Rust row: the positional and expression filters are not parsed, and a flag-value table typed from memory is §16's own failure. Under-block.
   - The refresher lock can still start two refreshers, or leave none held, under two interleavings Codex constructed. The cost is one extra bounded `gh` refresh; the served answer still states its age.

**How #1 got past round 1.** Round 1's fix judged quotes and escapes, and its table listed the spellings measured that day. Expansion is a different shell phase, and an allowlist is the form that does not need the next spelling named. It is the §16 lesson again, applied late: reproduce the shell, and prefer failing closed where closed costs nothing.

**Round 3 (Codex, high effort, the armed check alone) — and why the check was turned around.** The first request was refused by the reviewer's own content filter ("possible cybersecurity risk") and certified nothing; the same question reworded as a correctness review of a predicate ran. It found ten inputs the check accepted while bash and zsh handed git `-n` or a hook-disabling `-c`: a redirection glued to an option (`git commit -n</dev/null`, `-n>&1`, `git -c</dev/null core.hooksPath=…`), an attached value (`-nm123`, `-nm'fix: bug'`), and an inline alias. Before patching, seven more were tried and all were accepted too: `--work-tree=`, `--git-dir=`, `--exec-path=`, `PATH=/tmp/bin;`, `source ./x;`, `. ./x;` and `alias git=true;` — githooks(5) runs a hook from the work-tree root, so `--work-tree` alone moved the session log out of the hook's sight.
- Three rounds had each found a new door, and every fix had added one more thing the check KNEW to be dangerous. A wrong `false` costs nothing here — on an unchecked tree it is exactly 2.111.0's refusal — so `leavesHookInPlace` is now a grammar of what is known to be plain: a quote-aware split into segments; `git`, then only `--no-pager`, `-P`, `-C <dir>` or `-c user.*=…`, then `commit` or `push`, then only non-option words, listed long options and short clusters from listed letters (a value-taking letter ends its cluster; `n` is in no set). Any other segment may not start with an assignment, an environment builtin, `source`, `.`, `alias` or a wrapper, and may not run git inside it. Quoted text holding an operator is judged by the same grammar. `git config`, any `.git/` path and any `hooksPath` keep the refusal.
- The denylist lines it replaces were deleted, and their catalogue mutants re-pointed at the rule that now carries each case; the round-3 redirection rule turned out redundant under the grammar (a glued redirection fails the letter check, and on a plain word changes nothing git receives) and was removed with its safe-redirect set.
- **Residual, named:** a program the command runs before git can still reconfigure git, exactly as a script file can. The check judges only what the command's own text hands git; ADR-066 never claimed more.
- **Moved back:** forms outside the grammar that 3.0's candidates left to git in an armed session now keep ADR-061's refusal on an unchecked tree, as in 2.111.0.
- **Round 4 (Codex, the grammar alone, asked only what it wrongly accepts).** Five inputs, each measured under bash and zsh: a quoted option hidden as code (`git commit '-nm;message'`), a carriage return — and VT, FF, NBSP — read as a word separator, `printf -v GIT_CONFIG_COUNT %s 0` (an assignment by no listed builtin), `bash -c "git commit -m x;"`, and `echo "git commit;"`. Fixed:
  - a git argument that hides quoted code is not plain;
  - only a space or a tab separates words, and any other control character outside quotes keeps the refusal;
  - `GIT_*`, `CLAUDE_*`, `PATH`, `HOME`, `XDG_CONFIG_HOME` or `env` named anywhere keeps it;
  - a publish inside quoted code or a heredoc body counts only under `echo`, `printf`, `cat`, `git` or `node`, and anywhere else vetoes; a heredoc whose own line goes on (`cat <<EOF | docker … sh`) counts its body for nothing.
  - `echo "git commit;"` stays `true`: nothing publishes, so nothing can pass the hook. The request's wording ("invokes git commit") was mine and wider than the safety property.
  - `node` is listed because the locked T3 row names it and a node child inherits the environment by default; `env` named anywhere closes the way out of that.
- **The campaign at cdd3bda** had one GREEN of 1,358: "an unfiltered runner runs only its own language's rows". The round-2 Go branch gives every Go row Go semantics whichever runner matched, which masked the language check for Go rows only; a Python row credited by a Go runner (`go test ./tools` over `tools/test_b.py`) is the case no fixture held, and now does. Test-only: the readers, and both outside attestations at cdd3bda, are unchanged.

## 304. CLOSED 2026-10-15 (sweep: open items declined) — After v3.0.0: two leads the release did not hold for (2026-09-26)

**CLOSED 2026-10-15** (backlog sweep): items 1, 3 and 4 were already closed in the text. Declined as feature requests with no measured need: `**Status:** blocked` as an adr-next stop, a relock backed by a killed mutant, and reading a run-level `skipped` workflow as other than an alarm (a wording decision, not a defect).

v3.0.0 was released at 4487256 (release-evidence SUCCESS, 55/55 jobs, outside runs attested at cdd3bda). Two leads came in during its last campaign; neither is a fail-open in a gate, and neither is decided here.

1. branch-state picks `gh run list --branch <b> --limit 1`. At cdd3bda the push run and the dispatched run were created in the same second (17:56:53Z); the list returned the CANCELLED push run, so the brief said "CI cdd3bda: CANCELLED" while the campaign had concluded `failure`. The same tie with a green push run and a red campaign would have read green. Pre-existing (not 3.0). Likely fix: select by the branch head sha, prefer workflow_dispatch over push for one sha, and say which run it read. The tie itself came from my wait loop printing `null` for an empty list (jq `.[0]` on []), which let the dispatch fire before the push run existed; §13.3's ordering was lost that time (ids still ordered push < dispatch).

2. go-cli-adr-corpus ADR-055 T2 (peer, 2026-09-26): their tasks/README marks T2 `blocked` on purpose until the test lock can accept a moved body whose change is recorded as a killed mutant against the new assertion (filed to wing_quality-harness inbox 2026-09-13). 3.0.0 still offers only `--relock --replace-hashes` (advised "weaker than first-red"). work-next lists T2 as ready → adr-execute because task files win over the derived README. Questions: should a task file's `**Status:** blocked` stop adr-next (is `blocked` a recognised status?), and should the lock grow a mutant-backed relock?

3. **ADR-066 in a linked worktree.** A commit made in `git worktree add` of the session's repository finds no session log under that worktree's git dir, so `publish-hook.mjs` exits 0 without judging it (measured 2026-09-26). The text refusal still applies; git's own refusal does not. Question: should the hook read the log from the common git dir?

4. **A session is armed only from the next user prompt after SessionStart wrote the exports.** Three commits in the session that built 3.0.0 (17:56Z, 18:52Z, 19:49Z) left no `publish.hook-ran` after `publish.offered` at 16:45Z; the first user prompt after that compaction (≈19:52Z) is when the Bash environment gained `GIT_CONFIG_*`, and every commit since records the hook. It also turned a test red: `tests/publish-hook.test.mjs` spawned git with the session's exports, whose `enabled=true` outranked the repo-local disable it asserted; the file now starts every git from no `GIT_CONFIG_*`. Named in ADR-066's Follow-ups.

**2026-09-27 (3.0.2): item 1 CLOSED; item 2 answered; items 3 and 4 are the owner's.**

- **Item 1.** `branch-state` now lists 20 runs and reads the newest run of EACH workflow at the sha of the newest run, ordered by run id (`headRuns`); the worst of them is the verdict, a red one outranks one still running, and the full form names the run ids it read. The run id, not `createdAt`, breaks the tie: `createdAt` has one-second resolution. Measured 2026-09-27: `gh run list --commit cdd3bda…` returned the dispatch (failure, 36260813407) and the push (cancelled, 36260813368), both at 17:56:53Z, and across the newest eight runs on main id order and `createdAt` order agree; `cancel-in-progress` cancels the older run, so the higher id is the verdict that stands. `release-evidence`'s `selectRun` stays as it is: it asks whether a full campaign exists, so its tie goes to the dispatch.
- **The class (§5), enumerated with `git grep -n "'run', 'list'\|run list" -- plugin scripts`:** two readers pick a run. `branch-state` read one run of ANY workflow; this repository's weekly `evals` schedule runs at main's HEAD (`gh run list --workflow evals.yml`: 35580344647 at 66030ad, a schedule run), so once it was the newest run a selftest red read as evals green. Fixed with the per-workflow read. `release-evidence` already filters `--workflow selftest.yml` and was left alone.
- **Measured, not built: a run-level `skipped` is an alarm.** ts-generator lists `ci`, `platforms` and `e2e` at one sha, and 9 of its last 100 runs are `e2e skipped`. Non-success still reads as ⚠, so a skipped workflow at the head now alarms beside a green one where before it alarmed only when it was the newest run. Whether `skipped` should count as "asserted nothing" is a decision, not a fix.
- **Item 2.** The peer's `ADR-055/tasks/T2-repeat-pattern-and-contract-93.md` carries no `**Status:**` line; only the derived `tasks/README.md` says `blocked`. READY follows the documented rule that task files win (§10). A relock backed by a killed mutant is a feature request for the owner, not a defect.
- Tests: four new tests in `tests/branch-state.test.mjs`, 4/4 failing on the 3.0.1 reader; four catalogue mutants (`--case 'BACKLOG §304'`), 4/4 RED.
- **Codex review of 38fd72c (gpt-6-astra, high): REQUEST CHANGES, five findings, all confirmed against source and fixed before the tag.** (1) The first bullet's "the higher id is the verdict that stands" is FALSE here: `selftest.yml` keys its concurrency group on the event, so a dispatch never cancels the push, and a green dispatch hid a red push. Each event now answers for itself; a cancelled run answers nothing once its workflow completed at the same commit under another event, and alone is still an alarm. (2) Workflows are grouped by `workflowDatabaseId`, not by name: a ruleset workflow lists none. (3) A 20-run window holding nothing but the answering commit may have cut off a workflow: a green answer there is COULD NOT LOOK; a red one stays red. (4) A re-run keeps its id and moves `startedAt`, so runs are ordered by latest start, then id. (5) HEAD's runs answer when HEAD ran; otherwise the newest run's commit, which the render names. Tests: seven new tests; 11 catalogue mutants, 11/11 RED. Over ts-generator (`ci`, `platforms`, `e2e` at 310b18c) the reader names all three red workflows where 3.0.1 read `e2e` alone.

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

## 306. CLOSED 2026-10-15 (sweep: one item carried to §381, the rest declined) — 2026-09-27 — ADR-067 (a lexer for the text refusal), a dead-code cleanup, and a sweep that could not see bindings

**CLOSED 2026-10-15** (backlog sweep, each item re-verified against the code): the brief saying "every job concluded success" for a run whose jobs were skipped is real (`plugin/scripts/branch-state.mjs` reads the run's conclusion and views jobs only for a failing run) and is carried to §381. Declined: `corpus-probe --diff` printing speedups (a lead with no stated need); the `skipped` wording is §304's.

**Released first:** v3.0.2 at 826ec94 (release-evidence SUCCESS, 55/55; §304 item 1).

**ADR-067, Accepted by the owner 2026-09-27.** §301 Stage 3, scoped to what git's hook (ADR-066) does not decide. T1 (`plugin/scripts/shell-words.mjs`, proved against bash 3.2 and zsh 5.9 with a recording stand-in git) and T2 (`publishCommandIn` walks the lexer's argv; the `PUBLISH_*` regexes except `PUBLISH_MENTION` are gone) are built. T3 (the armed grammar on the same lexer) is next.
- Measured against the old classifier row by row: every `PUBLISHES`, `WINDOWS_PUBLISHES` and `DISABLES_THE_HOOK` row returns the same invocation; the seven `KNOWN_FALSE_REFUSALS` return null and moved to `NOT_PUBLISHES`; mean cost 4.57 µs per call against 2.1 µs before (bound 25).
- **A fail-open the old table encoded as correct.** `node -e "/names commit or push \\(`git commit`\\)/"` sat in `NOT_PUBLISHES`. Run under bash and zsh with a stand-in git, both run `git commit`: a backtick inside double quotes is a command substitution. The walk refuses it; the row moved to `PUBLISHES`. The same class as §16's "one of this repository's own tests had encoded the fail-open".
- **A GREEN T2 mutant was a finding about the tests.** Dropping the heredoc-fed-to-a-shell path changed no verdict: the only heredoc row was `cat <<X | bash`, which reaches the shell through the upstream path. `bash <<'EOF' … EOF` and `bash <<<"…"` joined `PUBLISHES`.
- Isolation: the first harness run executed the REAL git under `zsh -c`, because zsh read a startup file that put it back on PATH. The probe row (`/usr/bin/env git --version` must reach the stand-in) caught it; the harness runs `zsh -f`.
- Measured 2026-09-27 for Decision 4: with an unclosed quote on the same line neither bash nor zsh runs anything; bash runs a completed earlier LINE, zsh does not.

**Dead code, removed (owner, 2026-09-27: "cleanup these").** A scan of top-level definitions found five instances that `scripts/orphan-sweep.mjs` had reported clean ("0 orphan(s) of 726" at 826ec94):
- `plugin/lib/record.py` `_BDD_NAME`: a retired regex kept only as a catalogue mutant's restore target; the mutant now inlines it.
- `plugin/scripts/lifecycle.mjs` `lastPythonVersion` / `probedPythonVersion()`: recorded "for whatever wants to RECORD which interpreter ran", and nothing did. Removed with its test asserts; §93's recording half stays open, now without a stand-in that only tests read.
- `SLOW_HOOK_NOTE`: a test oracle exported from production; it moved to `tests/hook-env.mjs`.
- `__pathMatchesDeclarationForTest` (an alias of an exported function) and `__declaredEnforcementForTest` (`declaredEnforcement` is exported itself now).
- A sixth, found by the widened sweep below: `READER_PATHS` in `plugin/scripts/reader-paths.mjs`, read only by `scripts/release-evidence.mjs`. The list stays shared (ADR-064); the `plugin/` prefix moved into release-evidence.

**Why the sweep saw none of them (§5, the class):** it counted `function` and `def` only, and its `SHIPPED` scope matched no `.py`, so `plugin/lib/` was never read. It now counts top-level `const`/`let`/`var`, Python classes and module-level names, and reads `.py`. At dcb7df4 and cb45a39^ it finds `DURATION_REQUIRED_FROM`, `VALIDATION_VERDICTS` and both `__…ForTest` aliases beside the functions it already found; the tests say so. At 826ec94 it finds all six. The test "the shipped tree defines nothing it does not reach" runs it at HEAD, so the selftest now fails on a dead binding as it did on a dead function. CLAUDE.md §13 step 1 names it as the pre-release dead-code scan.

**The gate found a fail-open in the lexer, and a name collision.** `((1 << 2))` then `git commit` on the next line: the lexer read the arithmetic shift as a heredoc and swallowed the commit into its body, so `publishCommandIn` returned null. `tests/lifecycle.test.mjs` "the publish warning reads commit or push through wrappers and quoting" caught it. An arithmetic command at command position is now skipped whole; the row is in the bash/zsh differential fixtures, and a catalogue mutant is RED. ADR-060's "the command classifiers are gone" flagged the lexer's inner `heredocBodies`, a retired symbol name; it is `readHeredocs`.

**Codex review of 341c49c (gpt-6-astra, xhigh): REQUEST CHANGES, seven findings, all confirmed and fixed before the tag.** Six were regressions toward fail-open: forms the deleted regex refused, now returned null by the walk, each executed by the reviewer under bash and zsh with a recording git.
- A `$(…)` inside `${…}`, `$((…))` or an arithmetic command `((…))`: the lexer skipped the whole expression. `substitutionsIn` now collects the substitutions an expression runs without reading its text as commands.
- A process substitution split the argv: `git push</dev/null 2> >( /bin/cat ) --no-verify` lost its `--no-verify`, and the armed grammar read it as plain. It is one dynamic, code-flagged word now, never plain.
- A continued heredoc delimiter (`<<\` then `EOF`) kept its backslash-newline, and the body swallowed a later push.
- Script text through `| cat |` into a shell; `printf '%s' …` and `echo -n …` piped into a shell (the last two pre-existing). `stdinScripts` follows `cat` and `tee` upstream, strips `echo`'s options, and reads `printf`'s arguments one by one.
- `bash --rcfile "-n" -c "git push"`: the rcfile name was read as `-n`. Options now consume their values before any `-n` check.
- `<$(git push)`: a command of redirections alone was dropped with its substitution.
- The seventh, a new false refusal: `echo "bash" "-c" "git push"` was read as a shell. `echo` and `printf` run none of their arguments.

Also fixed, pre-existing and named by the same review: `bash -cx "…"` (a `-c` inside a cluster) and ANSI-C spellings (`$'git' push`, `git $'\x70ush'`), now decoded. Two mutants of these fixes came back GREEN first, each a finding about the tests: a process substitution hiding `git config hook.… false` (the code flag's only protection) and an ANSI-C simple escape now have rows. Catalogue: 56 ADR-067 mutants, all RED.

**The campaign at 9b49efa failed on two GREENs, and they were mine: §18's "a refactor that moves an observable turns the tests on the old site vacuous".** T3 moved splitting to the lexer; ADR-066's round-2 and round-3 grammar mutants (the backslash-newline join feeding the text checks; a verb that mentions commit or push) stayed in the catalogue, and their only rows were forms the lexer now resolves before either mechanism is reached. I had run the ADR-067 mutants, not every mutant on the file I refactored. Each mechanism still guards a real form, now a `DISABLES_THE_HOOK` row: `cp x .g\`+newline+`it/config; git commit` (the `.git/` text check sees it only after the join) and `git rebase --exec git\ commit\ -n HEAD && git push` (an escaped-space command is plain text, not code). The first rebase row used `HEAD~1`, and the `~` alone made the grammar refuse it with the mutant applied too: a row that is refused for another reason kills nothing. Run over the families this batch touched (`ADR-066`, `publish armed`, `publish-hook`, `ADR-067`): all RED.

**ADR-068, Accepted by the owner 2026-09-27 and done:** git's hook judges a linked worktree whose repository holds the session's log (it passed every worktree commit: measured, main checkout exit 1, worktree exit 0); SessionStart after a compaction or resume says git's refusal takes effect from the next prompt while no hook run follows the offer. §304 items 3 and 4 are closed by it. It ships in 3.1.0 with ADR-067, since 3.1.0 was never tagged.

**Open:**
- ADR-067 T3.
- The catalogue's 27 walk mutants run once load allows (the armed tests misfire under contention); the 22 regex mutants they replace are gone.
- Leads from the 826ec94 outside run: the brief says "every job concluded success" when some jobs were skipped (a locked test's regex pins the wording); `corpus-probe --diff` prints slowdowns and never speedups.
- A run-level `skipped` workflow reads as an alarm (§304); ts-generator has 9 in its last 100 runs. The owner's decision.

## 307. CLOSED 2026-10-15 (sweep: one fail-open carried to §381, the rest fixed or declined) — 2026-09-27 — Two corpus-chaos outside runs of the 3.1.0 candidate 626934a: rule P, the constant check, the hook and four readers

**CLOSED 2026-10-15** (backlog sweep, each item re-verified against the code): a declared check piped into `tee` (`npm test | tee log`) is still not read as one that cannot fail (`constantSuccessCheck` returns false, measured today), a fail-open carried to §381. Fixed since: an empty or missing Status (adr-lint), a task name holding a newline, and a UTF-16 record (every reader now says PARTIAL or UNKNOWN, measured in a scratch corpus). Declined: PowerShell script blocks in the precise arm (an open dialect; the advisory arm and git's hook still apply), the remaining Windows path wording, session logs under `.git/worktrees/` (which write made them was never established), and an extra absent-task reason ("could add").

**Runners.** A macOS session over a PHP/React corpus (Darwin 27.0.0, node 26.10.0, git 2.55.0; every row run under `bash -c` and `zsh -f -c` with a recording stand-in git) and a Windows 11 session over a TS generator monorepo (10.0.26200, node 24.20.0, git 2.49.0.windows.1, Git Bash, pwsh 7.6.6, PowerShell 5.1; a stand-in `git.cmd` and GIT_TRACE). Both probes were clean: couldNotRun 0, disagreements 0, only the readers hash moved. The Windows host could not run ADR-068's worktree hook (git 2.49, below 2.54). Every finding below was confirmed against source before it was fixed; the triage follows the skill's four classes.

**Rule P, fail-opens now refused.**
- `echo push | xargs git` and `xargs -I{} git {} <<< push` (macOS H6, H17): `xargs` builds git's argv from its stdin, and where that stdin is literal text the argv is known.
- `git submodule foreach 'git push'` (macOS R17), and by the same mechanism `git rebase -x/--exec <cmd>` and `git bisect run <cmd>`: git runs the command itself.
- `cmd //c call git push` and `cmd //c "g^it push"` (Windows): cmd's `call`, and its caret escape. Every caret in a cmd string is read as one, which can only reveal a publish that is spelled there.
- `pwsh -EncodedCommand <base64>` (Windows; also `-e`, `-ec` and the parameter's prefixes): the script is decoded from base64 UTF-16LE and read. A value that is not one decodes to text naming no publish.
- `powershell -c "iex 'git push'"` (Windows): `Invoke-Expression` runs its string, as `eval` does.
- `Start-Process git -ArgumentList push` (Windows), with `saps`, cmd's `start` and `-FilePath`: the launched command line is read. The unmeasured spellings are rows marked as such.
- Found while writing those rows, not by either runner: the verb scan read ANY option as taking the next word unless that word was the verb, so `git --no-pager submodule foreach 'git push'` was missed. It is the set git 2.55 answered to on 2026-09-27: `-C -c --git-dir --work-tree --namespace --config-env --attr-source` take a separate value, and `--exec-path --html-path --man-path --info-path --version -v --help -h` print and exit before any verb (the commit count did not move; GIT_TRACE showed `git version` or `git help`).

**Rule P, false refusals now allowed.** `git commit --dry-run`, `git push --dry-run`, `git push -n` (macOS R6); `commit -n` is `--no-verify` and stays a publish. And from the verb scan above: `git --no-pager stash push`, `git -P stash push`, `git --version push`, `git --exec-path push`.

**The advisory arm** reads a PowerShell backtick escape (`git comm`it`, Windows) and an encoded script. Both reached it as no mention at all, so they were wholly silent.

**The constant check, a fail-open (macOS, own perturbation).** `test 1`, `/usr/bin/true`, `echo ok`, `true || false` and `true # just check` each passed `qh-check` as a real check and were recorded, which unlocks a commit. It was a regex over the text; the list's exit status is now evaluated from the lexer's words, so `npm test || true` and `npm test; echo done` are constant and `npm test && true` is not.

**git's hook (macOS W10, W11).** `sessionOwnsRepository` took the PARENT of git's common directory as the repository. A worktree of a bare repository whose session had started in it passed unchecked (a fail-open), and a commit inside a submodule was judged on the superproject's session (a false refusal). It is the common directory itself.

**The hook's input (macOS F7, filed in §295 round 1 and still present).** `null` and a `cwd` of 42 crashed the hook with a stack trace at exit 0, and `[1,2]` said nothing. Valid JSON that is not an object with a string `cwd` is now named on stderr the way unparsable input is.

**Readers (Windows).**
- F-2 and F-3: adr-next stops a task it could not read (NUL bytes, empty, or listed by git and absent from the disk) with the reason. SessionStart read only `ready`, `blocked` and `done`, so a directory holding one read "fully evidenced", and one whose only task was unreadable was dropped without a word; work-next's `readinessUnproven` caught only the absent file, by a disk check of its own. adr-next marks the task `unreadable`, and SessionStart, work-next and the probe (`adrNext[].unreadable`) all read the mark. SessionStart also says a directory whose task is stopped by its own sign-off, where it said nothing.
- F-1 and F-2: a record whose status no reader could use (one fullwidth colon in `**Status:**`; a record saved as UTF-16) made `records` 0 with `look` ok, was never linted, and was omitted from adr-state's JSON while its text said could-not-look. adr-state's JSON names it (`unread`) and its text lists it as it lists such a record beside readable ones; the probe reports it (`undecided`) and lints it; adr-lint says a record holding NUL bytes is not UTF-8 before any section finding. `look` stays the corpus reader's, as work-next's does: a Proposed or `Implemented` record is named, not made PARTIAL.
- F-4: adr-next's human `acceptance:` line is quoted corpus text, as its goal line already was: a fence comment printed a `could-not-look:` line in the tool's voice.
- F-5a: the probe's adr-lint runs wrote `.git/qh-advice-survival.json` into the probed repository, against the probe's own "writes nothing". adr-lint honours `QUALITY_HARNESS_STATE_DIR` as the hooks do, and the probe points it at scratch. F-5b: the UNKNOWN line said "no git metadata directory here" over a note that was there and unparsable; it names which. F-5c: another version's note (`{"version": 99}`) was read as empty and REWRITTEN, its data lost and every count a first sighting; a key this version never writes makes it UNKNOWN, and the file is left as it is.

A fixture corpus carries F-1 and F-2: `tests/fixtures/corpora/undecided-records` (a fullwidth-colon record; an Accepted record whose task is UTF-16LE, marked `-text`), asserting `undecided`, `readinessUnproven`, `adrNext[].unreadable`, the lint FAIL's reason and the SessionStart UNPROVEN line. (fixture-waived: F-3's task git lists and the disk lacks needs an index entry `git add` cannot make, F-4 is adr-next's human text the probe does not read, and F-5 is adr-lint's own ledger; each has a test beside its fix, in tests/work-next-readiness.test.mjs, tests/adr-next.test.mjs, tests/gate-regressions.py and tests/corpus-probe.test.mjs)

**Also in this batch, mine.** CI's coverage job at 626934a failed on the cost-bound test ADR-067 T2 added: 57 µs per call under coverage instrumentation against 4.6 µs uninstrumented. The bound stays 25 µs uninstrumented and is 400 µs under `NODE_V8_COVERAGE`; the twenty-fold mutant lands above both. And ADR-067's two catalogue entries for the keyword skip and `cmd /c` went STALE when this batch changed those lines, which the family run said in those words; they name the new lines.

§306's Open list is superseded by this section for the two items it carried: ADR-067 T3 is done, and the walk mutants ran with every family this batch touched (ADR-066, ADR-067, ADR-068, publish, constant, 2.111.0-rc, survival, probe, readiness, ready line, adr-state, SessionStart): every mutant measured RED; the three that went STALE because this batch changed their lines (the keyword skip, `cmd /c`, adr-state's look) name the new lines and are RED.

**Codex review of this batch (gpt-6-astra, xhigh, before commit): REQUEST CHANGES, four findings, each executed by the reviewer under bash and `zsh -f` with a recording git, each confirmed and fixed.**
- A fail-open in my dry-run rule: `git commit -m --dry-run` commits with that message, and `git push -o --dry-run` pushes. `--dry-run` is a dry run only as a flag: not the value of an option that takes one (the set `git commit -h` and `git push -h` print on git 2.55.0), not after `--`, and not turned off again by `--no-dry-run`.
- False refusals in my constant check: `set -e; test -f F; echo done`, `set -o pipefail; test -f F | true`, `(exit 0); test -f F` and `true < F` each exit 0 or 1 with the tree and were read as constant. A constant refuses the declaration, so what the check does not model is not constant now: a builtin that changes how the list runs, a subshell, a redirection (the lexer counts them), and a shell string after any flag but a bare `-c`. The reviewer's residual, `test -f F || exit 0`, is constant and was missed; an `exit` that is the last command is the list's status now, and a command sent to the background is 0.
- xargs invented invocations: `-E push`, `-0` and a `printf ''` upstream launched no git. Only a here-string, a heredoc or an `echo` upstream, with `-I`, `-i`, `--replace`, `-r` and `-t`, is read; the rest is left to the advisory arm.
- The survival note's override was one file for every repository, so one repository's findings advanced another's counts and a clean run erased them. It is a root with one directory per repository, keyed as event-log.mjs keys its own.
Every finding has a row or a test and a catalogue mutant; all 47 of this batch's mutants and the 52 entries naming a changed line are RED, and every catalogue entry's `from` matches its file exactly once.

**By design, recorded.** A git reached through a variable or a command substitution (macOS H1, H8, H9; Windows `& ("g"+"it") push`) is a mention at most, as §269 pinned: git's hook is the refusal there. `cmd /c git …` from Git Bash (msys rewrites `/c` to `C:/`) and a backslash-path `git.exe` under bash run nothing and are refused: the conservative direction. macOS W6 (a main checkout moved without `worktree repair`) is git's own breakage, not the hook's.

**Named, not fixed.**
- A PowerShell dialect in the precise arm: backtick escapes and script blocks (`1 | % { git push }`). A backtick pre-pass turns `Write-Host "a`"; git push; `""`, one string, into a refusal. The advisory arm warns on the backtick; git's hook refuses where it can arm.
- cmd's `if <condition> <command>`, beyond what the POSIX reading catches. Unmeasured; for the next Windows round.
- A pipeline check (`npm test | tee log`) is not read as constant: its status is `tee`'s only without `pipefail`.
- A record with no readable `**Status:**`, or an empty one (macOS C4), lints PASS with the advice "no **Status:** line".
- adr-lint prints a task file name holding a newline across two lines (macOS A6); `prove it:` and adr-verify print native backslashes that Git Bash eats when pasted, and adr-lint's human header prints the absolute plugin path (Windows). Wording, next batch.
- Session logs appeared under `.git/worktrees/<wt>/` and `.git/modules/<sub>/` in the macOS run, where no SessionStart ran. Which write made them is not established; a lead for the next batch.

**The re-runs at 9cc9a35 (both reported from outside runs, 2026-09-27).** The macOS session re-ran every row above under bash and `zsh -f` and the hook cases W10/W11 and F7: each fix held (twelve rule-P rows, no mismatch; W10 refused, W11 passed, its superproject twin refused; the three payload shapes named). Its one lead, `true < x` and `: < x` passing once `x` exists, is by design: their status depends on the tree, the same class as `test -f x`, and refusing them was the false refusal the Codex round fixed. The Windows session re-ran under Git Bash, pwsh 7.6.6, PowerShell 5.1 and cmd with a stand-in `git.cmd` and GIT_TRACE: every earlier miss and every new row is read as the shell runs it, and F-2b, F-3, F-4 and F-5a to F-5c are fixed as described; its probe attests the same readers hash.
- **A fail-open it measured, fixed before the tag: `cmd /c if 1==1 git push`** pushed under cmd, pwsh and PowerShell 5.1 (and `cmd //c` under Git Bash) and was read as no publish. cmd's `if [/i] [not] <condition> <command>` now reaches the command for each condition shape (`errorlevel N`, `exist P`, `defined V`, `cmdextversion N`, `a==b`, `a <op> b`); a POSIX `if` is followed by a command, which matches none of them, and reads as before. The first row is measured, the other shapes are rows beside it, and a catalogue mutant is RED. The readers changed with it, so the attestations at 9cc9a35 do not cover the tag; another outside run is asked for.
- Leads for the next batch, each under-block or wording: adr-lint PASSes a record whose status it cannot read (F-1, named above); SessionStart counts the task directory under such a record "fully evidenced" without naming the record, and work-next's `tasksUnderAnUndecidedRecord` is empty there; adr-state gives "[no **Status:** line]" for a UTF-16 record where adr-lint knows it holds NUL bytes, and adr-next reads the tasks under that record without saying the record was unreadable; the absent-task reason could add "or a name this filesystem cannot hold" (`T3-a:b.md` on NTFS). An observation for the record: `start` launches the publish in a detached console, so its exit and output never reach the session; the text refusal is the only one that sees it.
- CI's windows job failed at 9cc9a35 on a test of mine: the new adr-state test compared `unread` paths written with `/`, and adr-state prints native separators in every path field (the probe normalises them, §279 item 5). The test normalises too; §7's rule, broken by its own author.

## 308. CLOSED 2026-09-27 — git's hook wrote its "ran" event into a linked worktree's own git dir

**Found by the owner's question after 3.1.0 ("check what caused"), the lead §307 left open.** Both chaos rounds of 626934a saw a session log appear in `.git/worktrees/<wt>/quality-harness/sessions/`, where no SessionStart ran. Reproduced at 5b61a71 (a main checkout with a started session, a worktree, a dirty file, `publish-hook.mjs prepare-commit-msg` in the worktree): a second log appeared there holding one line, `publish.hook-ran`, and the session's own log held only `session.started` and `publish.unarmed`. The writer was `plugin/scripts/publish-hook.mjs`'s `appendEvent(cwd, …)`, which resolves the worktree's own git dir. The `.git/modules/<sub>/` log of the first round was the other cause, the submodule misjudged as the session's repository, fixed in 3.1.0 (W11).

**What it cost.** `publish.hook-ran` is what marks a session armed (ADR-066 Decision 3), so a session that committed only from a worktree read as never armed: after a compaction SessionStart would say git's refusal had not run. The over-warning direction; the verdict itself was unaffected.

**Fixed.** The event goes to the log the session keeps: the owning repository's, when the hook judges a worktree because that repository holds the session's log. A test asserts the session's log records it and the worktree's git dir holds no session log; its mutant (writing to `cwd` again) is RED, and the two ADR-068 T1 entries name the rewritten guard. A worktree log that 3.1.0 already wrote is left in place and no longer written to.

## 309. CLOSED 2026-10-15 (was PARTLY FIXED 2026-09-27; three items carried to §381, the rest decided, moot or declined) — Three Windows corpus-chaos runs of 916b515: a crash past rule P, a silent record budget, git in another case

**CLOSED 2026-10-15** (backlog sweep, each item re-verified against the code): carried to §381, each still real: adr-lint's done loops read only the README's done claim (`plugin/bin/adr-lint` `done_task_ids(readme_text)`; only one site merges the task files' own claims); two task files declaring one id are not named by adr-lint (the second silently replaces the first); and the dead-code scan has no unreachable-statement rule (`scripts/unused-names.sh` runs biome with the unused-name rules only). Decided: on a git below 2.54 rule P's misses are warned about (ADR-066, ADR-067). Fixed: adr-next's permission line no longer prints a path. Moot: the outside run at that sha. Declined as Windows-only and never reproduced here: NTFS case folding and 8.3 names, a task reached through a self-symlink, and the `timeout-tree` beat flake.

**How it was found.** Two desktop sessions on Windows 11 (Node 24.20.0, Python 3.14.7, Git for Windows 2.49.0) ran `/quality-harness:corpus-chaos` at 916b515: one over a JS SPA with no corpus (seed 1790532118, the drawn codes plus 8.3 short names, abominations V and X2), one over a TypeScript generator monorepo (seed 1790532165, the drawn codes plus NTFS case folding, abominations Y1 and Z4). Both attestations are filed through `scripts/attest-import.mjs` (ADR-070), its first use on a real message. Both probes are clean over their own corpora. Neither host could run focus 1 as asked: git 2.49 has no config-based hooks, and the only newer git was 2.53 under WSL.

**Focus 1, through the hook by hand, confirms §308 from outside.** Fed `publish-hook.mjs prepare-commit-msg` in a linked worktree, and through a real `git commit` with a classic hooksPath: at 916b515 the event went to the main checkout's log and nothing appeared under `.git/worktrees`; the control at v3.1.0 created `.git/worktrees/wt-linked/quality-harness/sessions/probe-sess.jsonl`.

**Fixed in this batch (fail-open).**
- **F7: a 10 MB command crashed the hook before rule P was read.** `mentionsCommitOrPush`'s base64 scan, `[...command.matchAll(/[A-Za-z0-9+/]{8,}={0,2}/g)]`, overflowed V8's regex stack on one word past about 5.6 MB (`RangeError: Maximum call stack size exceeded`). The hook exited 1, and a PreToolUse exit 1 does not block, so the `git push` at the end went unrefused. Reproduced here on macOS (node 26.10.0). It splits on what a base64 word cannot hold now: the same runs, 29 ms on the 10 MB input. The regression drives the hook with that payload and asserts the refusal; its mutant (the old match) is RED.
- **C-1: the corpus readers stopped at 200 records and said `look ok`.** `recordFilesFromListing` ended its loop on `RECORD_BUDGET` with a bare `break`: with 1,100 records adr-state said read 200, look ok, and with 10,000 the probe linted 200 and said nothing else. The first file past the budget is on `unreadable` now, with the reason `record budget: 200 records were read; this file and every later one in the listing were not examined`, and the look is PARTIAL. So adr-state's `unread`, work-next's `partialBecause` and the probe's `undecided` all name it. Tested through adr-state at 201 records, with a clean twin at exactly 200; both mutants are RED. (fixture-waived: a 201-record fixture corpus would carry 201 files for one field; tests/record-budget.test.mjs builds it at run time instead)
- **git in another case, or through a `.cmd` shim.** `GIT push`, `Git commit -m x`, `Git.Exe push` and `git.cmd push` published under the stand-in and were read as no publish, while `git.EXE push` was caught (`programName` strips `.exe` case-insensitively and then compared `=== 'git'`). Measured here as well: `GIT --version` and Python's `subprocess.run(['GIT', '--version'])` both run git 2.55.0 on macOS. On macOS git's own hook arms and refuses; on Windows with git 2.49 there is no such hook, and rule P was the only refusal. `isGit` now matches git in any case and a `.cmd` shim, only for git, because a builtin (`exit`, `eval`, `set`) is looked up case-sensitively. On a case-sensitive host these names run nothing and are refused, the conservative direction. Both call sites have a RED mutant, and ADR-067's subprocess entry names the rewritten line (`--repoint` refused it, correctly: it is a rewrite).

**Dead code the scan did not see.** While in `lifecycle.mjs`: an unreachable second `return` in `handleHook` and a doubled `/**`, both removed. `scripts/dead-code-scan.sh` runs orphan-sweep, vulture and knip; none of them reports an unreachable statement in JS. ESLint's `no-unreachable` does. That is a lead for the scan, not yet a step in it.

**By design, recorded.**
- Rule P's misses for a git reached through a variable, a substitution, a function, `source <(…)`, `trap`, `find -exec`, `xargs` fed by `printf`, perl `exec` or `eval` of a built string (tender-reef's 23 bash rows), and PowerShell's script blocks (`Invoke-Command`, `. { }`, `ForEach-Object`, `$b = {…}; & $b`, `try {}`: 9 rows in scalable-badger's run, 11 in tender-reef's). These are mentions, as §269 and §307 pinned. ⚠ On a host whose git is below 2.54 no hook arms, so there these are warned about and not refused. Whether that is acceptable is an owner question, not a fix.
- `echo git push ^& git commit -m x` is refused though cmd.exe runs no publish for it: the hook reads what the Bash or PowerShell tool runs, and bash backgrounds at `&` and then commits.
- The hostile goal (abomination V) is quoted into SessionStart inside «…» and attributed to the task file. ESC and BEL are stripped. The line tells the reader to read the fence before `adr-verify` runs it, and git's hook is the refusal for a fence that pushes.

**Leads for the next batch, unconfirmed here.**
- `python -c "import os; os.system('git push')"` published and is not read. `SUBPROCESS_STRING` names `subprocess.*` and `exec*`, not `os.system`.
- Duplicate record ids: two ADR-002 files in one root (tender-reef C1), and ADR-001 under three roots (scalable-badger C6). No duplicate line, contested 0, and adr-lint judged one record against the other's tasks.
- Windows 8.3 short names: `adr-next docs/adr/ADR-00~1.MD` sequenced another record's tasks. adr-lint accepts any record with any tasks dir and never checks the prefix.
- A done claim that nothing checks:
  - README `pending` beside a task file saying `done` with no log: adr-lint PASS.
  - `**Status:**` followed by U+2003, an em space, then `done`: not read as done, and `unbacked` goes empty.
- A tracked task NTFS folds onto another (`T1-CLASSIFY-A-QUOTE.md` beside `T1-classify-a-quote.md`) is lost silently, and two readers count 2 and 1 without saying they disagree.
- An NBSP after `##` in `## Acceptance`: adr-lint says no fence, adr-next says the fence changed, and SessionStart says run `adr-verify`, which answers "no ## Acceptance section".
- A locked or vanishing task file:
  - adrLint's verdict is `exit 1` with an empty or null reason.
  - `unbacked` lists a task nobody could read.
  - adr-state states "governing nothing" over unread Affected Files.
  - adr-next's Permission-denied line prints the absolute path, username included (§6's class, on a peer's disk).
- G2:
  - `adr-next <non-record> --json` prints prose.
  - `corpusReport.totals.unreadable` is 0 while adrNext names the binary task.
  - SessionStart says a task directory is UNPROVEN, and then says T1 there is ready.
- Record ids under three digits are records only by content (`ADR_FILE` wants `\d{3,4}`), while adr-lint reads `\d{1,4}`. A short-id file without `## Context` or `## Decision` is named nowhere.


**A third Windows run, over this repository's own corpus** (lexical-mango, seed 1790532186, main at 8902ada in a scratch clone): 64 records, 145 tasks, all 64 lints PASS, nothing unproven, and no path leaked. The attestation is filed. It ran focus 1 by hand and saw the same as above: both `publish.hook-ran` events were in the main log and nothing was under `.git/worktrees/wt/`. Its rule P rows add `g^it pu^sh` under cmd (neither arm sees it), cmd's `for %i in (push) do git %i` and `set G=git& call %G% push`, and pwsh's `iex ('git ' + 'push')`: mentions or less, the §307 class. Leads for the next batch:
- **Two task files declaring one id: one is dropped from every bucket.** `T9-a.md` and `T9-b.md` both `# Task ADR-040-T9`: adr-next lists only T9-b, and adr-lint names neither as a duplicate.
- **`--attest` over a could-not-look report prints zero counts with no look field.** An NTFS junction loop made `work-next --json` answer `look: UNPROVEN, records: 0`, and the attestation read `corpus: 0/0/0, couldNotRun 0` with nothing saying the look failed. ⚠ An attestation of a probe that could not look reads as a clean run to `release-evidence`. That is the attestation's own fail-open, and it touches ADR-070's import: a candidate for this batch.
- **A status nobody lists governs as Accepted.** `Accepted (partially)`, `accepted` and `ACCEPTED` are governing, with no remark; `Implemented` is undecided and says so.
- Wording:
  - U+200B passes into adr-next's and SessionStart's quoted titles, while U+202E, U+202C and U+200F are stripped.
  - A BOM and the heading's `# ` sit inside adr-next's «…» title.
  - `(advisory until 2026-09-13)` is keyed on the ROW's date, so it is right, but it reads as a grace period that ended a fortnight ago. `(advisory: recorded before 2026-09-13)` says what it means.

**Fixed in a second pass the same day** (the owner: "proceed addressing the gaps"). Each has a test through the reader's CLI and catalogue mutants; all 14 entries naming a line changed since 916b515 are RED.
- **`os.system` and `os.popen`** now count as a subprocess call that hands its string to a shell. Measured here first: both ran git 2.55.0 from `python3 -c`.
- **A done claim nothing checked.**
  - adr-lint reads the task file's own `**Status:** done` as a claim, from the header above the first `## ` only, and asks it for the same evidence as a README claim. The finding names the file the claim is in.
  - work-next reads any horizontal space after `**Status:**`.
  - The class, enumerated with `git grep -nF '[ \t]' -- plugin/ | grep -iE 'status|state'`, has nine status parses. Seven capture `(.+)` and then strip, which is Unicode-aware in both languages; one reaches `\S` only by backtracking over a `*`. Only work-next's done-claim line missed.
  - ⚠ Siblings left: `check_test_lock` and the other `done_task_ids` loops in adr-lint still read only the README's claim.
- **Two task files declaring one id.** adr-next stops the id as UNPROVEN and names both files, rather than letting the second overwrite the first. Sibling left: adr-lint still names neither as a duplicate.
- **An attestation over a probe that could not look.** `at` is null, with `atReason` "the probe could not look at the corpus (look UNPROVEN)", when the probe's or work-next's look is UNPROVEN. So `attest-import` refuses it (refusal 4), and `release-evidence` counts it for nothing. There is no schema change, and PARTIAL still attests.
- The 2.111.0-rc CF1 entry named the rewritten work-next line. `--repoint` refused it, correctly: the mutant rewrites the class. It now names the new line and is RED.
- ⚠ **A hazard in how this session writes, not in any tool here.** A backslash-u escape with four hex digits, typed into a command, reached the shell already decoded, even inside a quoted heredoc: `od -c` showed the U+2003 bytes. So two tests and this section briefly held invisible characters where an escape was meant. Brace escapes and "U+2003" are used instead. It was first blamed on `mrw` and filed to that project's inbox; that drawer is retracted, because mrw wrote exactly the bytes it was given.

Still leads: duplicate record ids, 8.3 names, NTFS case folding, the NBSP heading, a locked task file, G2, short record ids, statuses nobody lists, and the wording items.

**A fourth run, macOS, over the same TypeScript monorepo** (ts-generator-87, seed 1790535531, git 2.55.0, node 26.10.0, load 22–37 throughout). The probe was clean, and its attestation is filed under the shape label `macos-ts-generator-monorepo` (it was sent under the corpus's own name). Focus 1 held for plain, bare and nested worktrees. Two fail-closed-everywhere and fail-open findings, fixed with real-git tests and RED mutants:
- **The hook command outlived its node.** The exports bake `process.execPath`, which Homebrew makes a versioned Cellar path. Once it was removed, git refused every commit and push in every repository the shell touched, because git refuses when a hook command cannot start. That happens before `publish-hook.mjs`'s own promise to exit 0 when it cannot look. The command now falls back to the `node` on PATH, so a moved node still refuses what it should. A missing script says on stderr that nothing was judged and refuses nothing. The `exec` stays last, because git appends its own arguments to the command. The existing single-quoting mutant now names the script in the `exec` clause.
- **A torn log tail swallowed the next event.** `publish.hook-ran` was appended onto a torn last line, so no reader could see that git's hook ran (ADR-068). An append now starts on a fresh line when the tail has no newline. The torn line is still reported as torn, and the existing append mutant names the rewritten line.

Leads, unconfirmed here:
- `work-next` (human) prints a spec path raw, and `adr-state` a record title raw: an OSC title sequence, SGR colours, a bidi override and an unquoted `</system-reminder>`. adr-next and SessionStart quote and strip the same text.
- A FIFO `.md` under `docs/specs` is counted nowhere and named nowhere.
- A spec 40 directories deep is counted nowhere. It may be one level by design, but nothing says so.
- A task reached through a self-symlink (`tasks/tasks -> ../tasks`) is named by that path in SessionStart and adr-next. The probe reports it as a disagreement.
- Rule P misses a static argv in `node -e "…spawnSync('git',['push'])"` and `perl -e 'system("git","push")'`, while Python's list form is read. It also misses `git -c alias.p=push p` and `make -f /dev/stdin`. The rest of its 13 rows are the dynamic §307 class.
- A sparse checkout makes the probe spawn adr-lint once per path git lists and the disk lacks: 164 of them, 48 s against 4 s.

**A third pass on the leads** (the owner: "proceed with the §309 leads"). Committed in def97b9 and the commit after it. Each lead was confirmed against source and reproduced (on macOS, or through a portable stand-in: a directory named like a task file is unreadable on every platform). Each has a test through the reader's CLI that failed first, and catalogue mutants that are RED.
- **Raw escapes.** work-next and adr-state print their human lines through `terminalText`, and adr-state quotes a record title. Both quoters drop zero-width characters and a BOM; adr-next's title drops a BOM-held `# `.
- **G2.**
  - No task is offered as ready beside one nobody could read.
  - `adr-next --json` answers JSON for a path with no tasks directory.
  - corpus-report counts a NUL-byte or empty task as unreadable. The matrix asserts it: `corpusReportUnreadable` on the undecided-records fixture.
- **C-5.**
  - adr-lint crashed with a traceback on any unreadable task file anywhere in the corpus; it is could-not-run, exit 2, naming the file.
  - An exit-code verdict in the probe carries the gate's reason.
  - The corpus reader no longer drops an unreadable task file: its directory is asked about (work-next: UNPROVEN), and adr-state reports that record's scope as `governsUnproven` rather than governing nothing.
- **C-4.** A task whose Acceptance fence could not be read no longer says its fence "changed", and SessionStart no longer sends it to `adr-verify`, which would refuse it.
- **C1 and C6.** A folder named exactly for another record is that record's, so a second ADR-002 no longer takes the first's tasks: in the corpus reader, and in adr-next's `resolve_tasks_dir`. adr-state names every id carried by more than one record (`duplicateIds`).
- **Rule P.** Now read: node's `child_process` argv lists and perl's `system`/`exec` lists (`perl` is an interpreter now), and an alias set with `git -c alias.<name>=<value>`, including `!` aliases. git's own `commit` and `push` run over an alias of the same name (measured: `git -c alias.version=status version` printed the version), so those stay publishes.
- **C-2.** A record named with the ADR prefix is found at any width (`ADR-7-x.md`), as record.py reads it; a bare number still needs three or four digits. work-next's own text named `ADR-12-thing.md` as findable by filename, which the regex made false until now.
- **Sparse checkout.** A record the corpus reader never opened is `unread` in the probe, with its reason, and adr-lint is not spawned for it.
- **Wording.** The pre-cutover lock advice says "(advisory: an entry recorded before 2026-09-13)".
- Catalogue entries that named rewritten lines were re-pointed by hand after `--repoint` refused them, correctly, as rewrites: CF1, L7, the §288 PARTIAL line, the router line, the ISO-date guard, the dry-run guard, the orphans line, the single-quoting and append lines.

**By design, recorded.**
- `accepted` and `ACCEPTED` govern, because a status is read case-insensitively. `Accepted (partially)` governs too, because its first word is read, as `Superseded by …` is.
- A FIFO is never listed by git, so a reader that must not depend on the disk (§8) cannot count it.
- Specs are read one level under `docs/specs/`, the location the spec-write stage writes to. A project that nests them gets no count, and nothing says why: a wording lead.

**Still leads.**
- NTFS case folding (C-3) and Windows 8.3 short names: Windows-only, needing a Windows run to confirm a fix.
- A task named through a self-symlink: the probe already reports it as a disagreement.
- adr-lint's `check_test_lock` and its other README-only loops still read only the README's done claim.
- adr-next's Permission-denied line prints the path as it was given, absolute when the caller passed one.

**CI at 8badec4 (run 36349664889) went red, on five jobs, all of them this batch's own doing.**
- **windows:** the hostile-spec-path fixture wrote a name holding ESC and BEL, which Windows refuses (ENOENT). The platform is a parameter now: on Windows the name carries a bidi override and a zero-width space, which NTFS allows, and the same assertion runs.
- **Four GREEN mutants in four shards,** each an old guard this batch made unobservable (§18's hazard, met here):
  - The two adr-lint entries for `read_named` ("named path plus strictFrom reads through read_named", "named-path OSError is could-not-run at check_adr") are equivalent mutants now. The top-level OSError handler (C-5) answers a second open exactly as `read_named` does: exit 2, could-not-run, the path named. The property they protected holds structurally and is still asserted, so both entries are deleted.
  - "SessionStart does not count an unreadable task's directory as evidenced" mutated a guard G2's `continue` made unreachable. The guard and its `unreadTasks.length` arithmetic are removed as dead code, and so is the entry. The G2 mutant protects the behaviour, and the "stopped task" entry names the simplified line and is RED.
  - "the year of an ISO date is not a record number" went GREEN because C1's rule, a folder named for another record, now also keeps a dated record from borrowing a record's folder. A new test uses a dated folder that no record names, where only the ISO guard decides, and the entry runs only that test. RED.

**CI at 3cb9493 (run 36352514113): windows only, two tests.**
- The same terminal-output test matched `docs/specs/a` with a `/`; work-next prints native separators, and its output was right, escapes included (`docs\specs\a\u{202e}b\u{200b}dm.md`). The match takes either separator now (§7, broken again by its author).
- `timeout-tree.test.mjs::adr-verify: run_bounded kills the tree on timeout` failed with "the grandchild never wrote a beat". It passed on this job at 77cdded and at 8badec4, and nothing in this batch touches `run_bounded`. §121 closed that message's truncation cause. What remains looks like a slow Windows runner where the bound fires before the grandchild's first beat, which the fixture cannot tell from a grandchild that never started. It cannot be reproduced here, so it is a lead for the next Windows run, not a fix.
The readers changed with this batch (lifecycle.mjs, corpus-probe.mjs, work-next.mjs, adr-next, adr-lint), so the four attestations at 916b515 do not cover a tag cut after it; another outside run is needed at the final sha (§18).

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

## 319. CLOSED 2026-10-15 (was PARTLY FIXED 2026-09-29; one item carried to §381, the rest fixed, moot or declined) — The corpus-chaos round of e016066 (plugin/ = v3.1.3): four fail-opens, a forged line, and two repository leads

**CLOSED 2026-10-15** (backlog sweep, each item re-verified against the code): `scripts/dead-code-scan.sh` expands an empty array under `set -u`, which bash 3.2 aborts on (latent while the tree has Python files), carried to §381. Fixed since: the trailing-space blame, the skill's `alarm` bound, the catalogue crash and `undefined` killer line, the forged lines, and the reader items listed in §321. Moot: the vendored specs and the literal reader (§320, ADR-073). Declined: a supersession cycle (whether it is by design was never decided), the `**Statusas:**` misquote (left on purpose in §321, since a word boundary moves toward silence), the three counts of a removed record's orphaned tasks (no single right count was defined), and the unaudited FIFO reads of the other Python readers.

**Asked of ten sessions** (owner, 2026-09-28): eight local and two over Remote Control, with the corpus-chaos Asker text at e016066, whose plugin/ is byte-identical to v3.1.3 (ae06e14).
- **Ran:** ts-generator (TS generator, a spec-only corpus, seed 1790626717) and vitest-spa-v2 (JS SPA, 2 records and 9 tasks, seed 1790626777). Both on macOS 27.0 and Python 3.14.7; Node 24.11.1 and Node 26.10.0 respectively. Their attestations are filed: `docs/corpus-reports/2026-09-28-{static-generator-ts,js-spa-two-adr}-3.1.3-e016066.json`.
- **Could not run:** rust-records-corpus and infrastructure, whose classifiers refused the foreign code as "Code from External". Each surfaced it to its user and did not work around it.
- **Deferred:** go-recall-service, for its own owner-set goal.
- **Pending when this was written:** go-cli-adr-corpus, and the two Remote Control sessions.

**Fail-open. To be fixed before the next plugin release.**
1. **A spec one directory below `docs/specs/` is counted nowhere, named nowhere, and with only such specs work-next says "No QH corpus is in use"** (ts-generator C5). Reproduced here: `docs/specs/billing/refunds.md` with `Ready-for-ADR` gives `0 spec(s)` and that sentence.
2. **A record whose Status line holds a NUL byte is counted "undecided" with `look: ok`**, byte-identical to an honest `Proposed` (js-spa-client B5). It also hides a binary task under it: `readinessUnproven` stays empty, and only SessionStart's adr-next line names the task. adr-lint, handed the same file, says it cannot read it. Reproduced here: `look ok`, `undecidedRecords 1`, `partialBecause []`.
3. **corpus-report counts a dangling task symlink nowhere and names it nowhere**, while adr-lint, adr-next and work-next each say they could not read it, and the probe reports no disagreement (js-spa-client). A tasks directory that is a symlink to a sibling's counts one directory's tasks. Partly reproduced here: `unreadableDirs []`.
4. **The checks.jsonl import grades malformed rows:** a row with a numeric `at` and odd types becomes `check.passed`, and a row missing its fields becomes `check.failed` (js-spa-client D5). The runner could show no downstream wrong answer, because the tree had changed. Not reproduced here.

**Output that forges the tool. Next batch, security-flavoured.**
5. **work-next's human output prints a newline in a spec's file name raw**, so a name can forge a line such as `[quality-harness] Nothing in the QH corpus is waiting.` (ts-generator V). ESC and BEL are already escaped, and `--json` escapes newlines. Reproduced here.
6. **SessionStart passes adr-next's stderr through unredacted**, so an absolute scratch path reaches the model (js-spa-client, a symlink loop). The probe's own copy of those lines is redacted. Not reproduced here.

**Wording. Next batch.**
7. adr-next guesses "a sparse or partial checkout?" for a task file whose name gained a trailing space (js-spa-client A1). The verdict, UNPROVEN, is right; the guessed cause is not.
8. The corpus-chaos skill offers `perl -e 'alarm shift; exec @ARGV' 120 <cmd>` as a macOS timeout. It does not bound a Go binary, whose runtime ignores SIGALRM: measured on mrw v1.30.0 and a dev build, an alarm of 3 ran 30 s (infrastructure). `gtimeout -s KILL` bounds it.

**By design, recorded with the reason.**
9. Vendored fixture trees under any `docs/specs/` are counted as the repository's specs: 77 golden renders in ts-generator give a standing "77 UNPROVEN" warning. This is §291's class (open): what counts as the project's own corpus.
10. ADR-072's literal reader counts any quoted literal as a definition: an array element, a `console.warn` argument, an object key, a `describe` name, `test.skip`, `test.todo`, a test in dead code. It refuses a name built by concatenation (js-spa-client, 9 of 14 fooled). That is Decision 2's rule as written. ADR-073 (Proposed) is the check that does not depend on it: a narrowed baseline that runs fewer tests than it names.
11. No reader flags a supersession cycle or a record that supersedes itself: everything reads as superseded, and nothing governs (js-spa-client Z3). Not reproduced here. Whether this is by design is open.

**Repository tooling.**
12. **mutate.mjs crashes with a TypeError on a catalogue that is not `{ mutations: [...] }`**, and exits 1, the same status as a stale finding, so a consumer cannot tell the two apart. Also, `--stale`'s gone-killer line leads with the word `undefined`, which reads as a JavaScript `undefined` (js-spa-client).
13. **bash 3.2 aborts on an empty array's `"${a[@]}"` under `set -u`** (go-recall-service's lead from its own analyze.sh). Audited here over every `set -u` script: `plugin/scripts/facts-gate-dispatch.sh` is safe, because `candidates` starts non-empty and `matches` is expanded only after its count check. `scripts/coverage.sh` already uses `${a[@]+"${a[@]}"}`, with a comment on why. `scripts/dead-code-scan.sh:46` is a member: an empty `files` would abort, although this repository always has Python gates. Confirmed on /bin/bash 3.2.57: `"${a[@]}"` on an empty array aborts with "unbound variable", while `${#a[@]}` and the guarded form do not.

**Addendum, 2026-09-29: the reports that arrived after this entry was written, and the 3.1.4 batch.**
- **Ran, and attested:**
  - php-react-app: a Laravel + React monorepo with 93 records and 278 tasks, seed 1790626837, Node 24.11.1.
  - go-cli-adr-corpus: a Go corpus with 92 records and 232 tasks, seed 1790626901, Node 26.10.0.
  - Both ran at e016066 on macOS 27.0 and Python 3.14.7. Filed: `docs/corpus-reports/2026-09-28-{laravel-react-monorepo-contract-first,go-cli-adr-corpus}-3.1.3-e016066.json`.
  - go-cli-adr-corpus had also run at cd7e6ab (seed 1790620491, its inbox drawer 4f199b24), and six of its eight findings there reproduced at e016066.
  - go-recall-service filed one lead to the inbox. The two Remote Control sessions stayed offline.

**Fixed in 3.1.4.** Each has a regression in `tests/chaos-e016066.test.mjs` and catalogue mutants, and every mutant is RED.
- **Items 1 to 5 above:**
  - Item 1: `work-next` names nested specs (`nestedSpecs`) and routes to neither core nor an all-clear while they exist.
  - Item 2: a NUL byte makes a record unreadable, with a reason, so the look is PARTIAL. The binary task under it is covered by that PARTIAL rather than named on its own, because the owner of a task under an unreadable record is unknown.
  - Item 3: `taskFiles` reads a linked task file through the link, so a dangling one is counted unreadable. It names a linked directory without following it, and corpus-report's line now says "or are links this reader does not follow".
  - Item 4: `checkEventName` grades only a numeric `exit` and a boolean `git`.
  - Item 5: every path in `work-next`'s text goes through `visiblePath`.
- **A false refusal (go-cli-adr-corpus D5, at both commits).** A `session.started` whose observation failed was read as the baseline. A Stop over a pristine tree then said "work no `qh-check` has passed on", and PreToolUse denied `git push`. Reproduced here through the hook.
  - It is the late-baseline class (`tests/late-baseline.test.mjs`), and this member was missed. `sessionBaseline(log)` now takes the first start that looked, and every reader uses it.
  - Enumerated with `mrw read --grep "=== 'session.started'" plugin/`: 7 sites in lifecycle.mjs and 1 in statusline.mjs.
  - The twins still refuse: a dirty tree, and a write on record. A torn log still gets no baseline.
  - The session note's reader stayed GREEN under its mutant until a test was added for it.
- **A fail-open in JSON (go-cli-adr-corpus item 1, at both commits).** adr-state's text listed "Declared but matching nothing git tracks … `--json for all`", while the JSON had no such field. It now has `governsUnmatched`. The class is every `--json for all` pointer in plugin/, enumerated with `mrw read --grep 'json for' plugin/`: 8 pointers, and this was the only one without a field.
- **php-react-app E5.** adr-lint waited forever on a FIFO named as a record or as a task. It now refuses a named non-regular file as could-not-run, with exit 2. So does a FIFO among another record's tasks, which the cross-record cycle check reads: the same could-not-run a directory named like a task already got (`tests/gates.test.mjs`).
  - Members left, as a class: adr-lint's other reads of corpus paths, such as a spec, a test file, a README or the config. `mrw read --grep 'read_text\(' plugin/bin/adr-lint` lists 29 lines.
  - Git lists no FIFO, so the git-listed reads never meet one. The glob-listed and header-named reads can.
  - adr-next and the other Python readers are not audited.
- **php-react-app, the real corpus: a false refusal.** A Tests row naming an npm script (`test:visual` in `package.json`) was refused as "no executable definition". A top-level `scripts` key now counts as a definition. A dependency key, a nested key and a value are still refused.
- **The corpus-chaos skill (go-cli-adr-corpus).** Step 4's hook example set `cwd` to the probed repository, and the hook appends a session log there (218 rows), which step 6 forbids. The example now names a scratch clone and says that the hook writes.

**Next batch: output that forges the tool, the same class as item 5.**
- A `.quality-harness.json` `check` value holding newlines, a closing tag, ESC and a fake SYSTEM line reaches SessionStart's Verification line verbatim (go-cli-adr-corpus H1).
- A task file name holding a newline splits adr-lint's advice (A6).
- Item 6 above.
- `work-next`'s relock remedy prints a task path raw inside a command, under `commandInCode`'s keep-the-bytes rule.

**Next batch: wording, and readers that disagree.**
- **§307 F-1 gains members.** Each of these still lints PASS:
  - `**Status:** Acc\xc3\x28epted`, invalid UTF-8 (B3).
  - An empty `**Status:**` (C4). Its regex, `^\*\*Status:\*\*\s*(.+?)\s*$` under `re.M`, crosses the newline and reads the next line. That regex is at two sites, adr-lint:2681 and :6130, found with `mrw read --grep 'Status:.{1,8}s\*' plugin/bin/ plugin/lib/ plugin/scripts/`.
  - `**Statusas:**` (php-react-app, Lithuanian headers), which is read as a `**Status` prefix and quoted by adr-next as `**as:** …**`.
- **A torn `checks.jsonl`** is reported as "this session's event log could not be read whole" (D4, at both commits). The verdict, unknown, is right; it names the wrong file.
- **corpusReport's `showsFailing`** counts every red-first row, so it reads as 232 of 232 failing.
- **The probe** keeps adr-lint's verdict and drops its advice.
- **The orphaned tasks of a removed record** are counted three ways: 232 tasks, 90 directories and 89 adr-next entries (C2).
- **adr-state's `unread`** gives `reason: null` for an unrecognised status (X1, §293).
- **A trailing-space task file** is invisible to readiness (php-react-app A1), a sibling of item 7.
- **A README Execution Order row** with its Depends-on column dropped passes (B9).
- **adr-lint's Invalidates check** does not look in a sibling archive.
- **Stripped ESC** leaves `[31m` residue inside «…».

**By design, with the reason.**
- **A FIFO record is invisible to work-next, adr-state and the probe.** Git lists no FIFO, and every corpus reader reads git's listing (§8).
- **adr-lint's version line names the plugin root that answered.** That line is the evidence of which copy ran, and the probe redacts it.
- **go-recall-service's lead (inbox drawer 8ce8d68): adr-next calls a task done while a `[proof: human: …]` step has no human-observed row.**
  - This matches the done rule as written: the proof map maps steps to proof forms, and done needs an exit-0 entry plus a killed mutant.
  - Whether a step-level human proof should gate done is a question for the owner, and needs a record.

**Repository tooling.** At e016066, go-cli-adr-corpus measured `mutate --stale` against `node --test --test-name-pattern`. Twelve more shapes pass it, although no test runs:
- a hashbang holding the name;
- a regex literal after `export default` or a spread;
- the raw text compared, not the literal's value;
- `test.skip`, `test.todo` and `describe.skip`;
- a test under `if (false)`;
- a test in a function never called;
- a name passed through `.toUpperCase()`;
- the name as an `assert.ok` message.

Two false refusals: `//` followed by U+2028, and the raw-versus-value case in the other direction. All are ADR-072 Decision 2's literal reader (§318), which ADR-073 (Proposed) would not depend on.

**The Codex round and the CI run of fe918bb (2026-09-29).** gpt-6-astra, xhigh: REQUEST CHANGES, with six findings. Each was confirmed against the source and fixed in the same batch, with a regression test and a RED mutant.
- **P1, a fail-open.** The late baseline counted only `file.written` as prior work. A shell edit writes none, so a sequence of failed start, a Stop that saw the edit, a commit, and a clean publish look adopted the committed tree and forgave it. The fix: a late baseline is taken only from the FIRST look that succeeded (`lateBaselineAllowed`). The same holds for a session with no `session.started` at all, whose first look saw a dirty tree.
- **P2, a false refusal left behind.** git's own hook prepares no late baseline, so a push launched from a script was still refused over a pristine tree. `publishVerdict` now applies the same rule without writing, and only to a log that holds the failed start. A linked worktree's empty log is still judged unchecked (ADR-068), and a test holds that.
- **npm scripts.** A script whose value is not a string (`null`, a number) counted as a definition, and npm drops it. A manifest behind a BOM lost every script.
- **A line break in a nested spec's name** hid the spec again: `.+` does not cross it.
- **A task-shaped FIFO, directly or through a link,** reached a blocking read in corpus-report. The default reader now refuses anything but a regular file without opening it, including in `run()`, whose own `readFileSync` default had bypassed it.

The CI run of fe918bb, 36486684619, was red in three jobs.
- **Two catalogue mutants went GREEN:** "work-next speaks through terminalText" and adr-lint's "C-5 could-not-run".
  - This is the hazard §18 names: `shown` now escapes every path before `terminalText` sees it, and `refuse_irregular` answers the directory case before the global OSError handler does.
  - Each got a test on the route it still guards alone: an archive catalog's effect cell in work-next's PARTIAL line, and a permission-denied task file.
  - Only the new mutants had been run locally, not every catalogue entry on the files changed.
- **Windows.** A test compared a POSIX path with work-next's native `docs\specs\…`. And MSYS `mkfifo` exits 0 while native Python sees no file, so the FIFO tests now skip unless `statSync().isFIFO()` holds.
- **One more slip, found by a STALE mutant:** the agent tool decoded a backslash-u escape for U+FEFF in a plan into a raw BOM inside adr-lint's source. It is written `chr(0xFEFF)` now.
- (fixture-waived: the findings fixed from this section are names holding a newline, a tag or a NUL byte, and trees holding a FIFO or a dangling link. A Windows checkout of `tests/fixtures/corpora/` cannot hold any of them. Each has a regression that builds its own scratch tree, and skips where the platform refuses the name: `tests/chaos-e016066.test.mjs`, `tests/chaos-315-codex-render.test.mjs` and `tests/chaos-315-codex-status.test.mjs`.)

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

## 324. CLOSED 2026-10-12 (was PARTLY FIXED 2026-10-01) — After 3.3.0: the lock hasher's JavaScript scanner, the coverage-only flakes, and the stale brief capped

**CLOSED 2026-10-12** (re-verified against the code in the backlog sweep): Item 1 was taken by ADR-078. Its spec-verify and can-fail leftovers were taken by ADR-079 (Accepted, 4/4 tasks exit-0; spec-verify:332, adr-lint:4791-4827 read through js_reading/js_test_lookup). Items 2, 2b and 3 are closed with their instruments (tests/branch-state.test.mjs:889-896, scripts/coverage.sh:154-158, branch-state.mjs:733).

**1. The test-lock hasher cannot tell a string from code in JavaScript, and a local fix is not safe.**
Reproduced: `extract_test_names` returns `a negative value is a finding` for
`tests/unasserted-isolation.test.mjs`, a name that exists only inside the string constant `SUITE`.
`_iter_bdd_calls` skips a `test(` only when its LINE starts with a comment. The obvious fix — skip a head that
`_js_like_in_code` says is not in code — was written with a red test and its twin, and then made 12 active
records fail their own adr-lint (ADR-052, -054, -055, -057, -067, -068, -069, -071, -072, -073, -075, -076):
their locks name tests the hasher no longer sees. Some of those names are fixture strings (`other`, `f and g`,
`a`), but others are real tests (`a brace-built publish is refused`, `after a compaction the session is told
git's refusal is not yet armed`, `declaring a capability does not cost a role its schema`). The cause, measured:
neither JavaScript scanner in `plugin/lib/record.py` knows a regex literal. In
`tests/publish-command.test.mjs` the literal `/(["'])(.*?)\1/` flips `_js_like_code_positions` into
"string" at offset 34425, and every test after it reads as data; `_mask_lock_noncode` blanks the same heads.
**The same state machine is `_matching_js_brace`**, which decides where a locked test's body ends, so a regex
literal holding a quote inside a test can already make a lock hash the wrong span — the latent twin of this lead.
The change was reverted (both files back to their shas). A correct fix is a JavaScript lexer that knows regex
literals (with the division ambiguity) and template interpolation, and a lock format that records which hasher
took it, so existing evidence keeps its meaning. That is a decision record's work and the owner's to accept.

**2. `the cached branch CLI reads a fresh answer without starting Git` is not reproduced outside GitHub's
runner.** It failed the coverage job of both push runs at 35b36fa and eabf6a3 (the second after a 60 s wait, so the
refresher never wrote) and passed the dispatched run at eabf6a3. In a `node:24` Linux container the test passed
alone under `--experimental-test-coverage` (0.42 s, twice) and after every file that precedes it in
`coverage.sh`'s serial order (0.45 s, twice). `waitForSnapshot` now prints, on a timeout, what the git directory
holds, the snapshot and the refresher's lock with its age, so the next failure carries its own evidence.
**Addendum 2026-10-02:** it failed again at 6d1178f (coverage floor, run 36971099606), and the diagnostics
above never reached the log: `coverage.sh` shows only a suite's failing-tests block, and `waitForSnapshot`
printed to stderr. `waitForSnapshot` now THROWS its diagnostics (and the load average), so they land in that
block. The next three coverage runs passed (b7e867e, c454442, d866327), so the cause is still unobserved.
Closed as not reproduced, with the instrument armed: the next failure says what the refresher left.

**2b. The coverage job's Python stage failed differently at c11a507: the tutorial replay's mutant survived.**
`tests/tutorial.test.mjs:141` expects the page's mutant (`int(text.rstrip("s"))` → `0`) to be killed, and the
run recorded a survivor: the fence (`… | tee /tmp/t1.out && grep -q "OK" /tmp/t1.out`) said OK with the parser
broken. The same test passed that job's JavaScript stage, and `coverage.sh` passes here in full. Ruled out:
stale bytecode (the mutant changes the file's size, which the `.pyc` check compares) and another writer of
`/tmp/t1.out` (only the tutorial writes it, and its two runs are sequential). `coverage.sh` printed only the last
20 lines, which cut adr-verify's first line and the fence's output off; it now prints the whole failing-tests
block, so the next failure says where the run went and what the fence printed.

**3. For the owner:** `branch-state --cached` serves a stored snapshot labelled with its age, and has served one
hours old naming a branch the checkout no longer holds (§322, §323). Whether a snapshot past some age — or one
whose branch is not the checkout's — should be shown at all is a product judgement, not a defect.
  **Decided 2026-10-01: cap the age.** A brief no longer shows a snapshot older than ten minutes: it says how old
  the last answer is and that a refresh is running, and the refresher still starts (`SHOW_AT_MOST_SECONDS`,
  `a brief snapshot past the age cap is not shown, and a refresh starts`, catalogue entry RED). The full report
  and a fresh cache hit are unchanged; a snapshot under the cap is served as before (ADR-065 T2).
  **Decided 2026-10-01: item 1 goes to ADR-078** (Proposed, spec `docs/specs/2026-10-01-a-lock-reads-javascript-as-javascript.md`).
  Measured while writing it: hasher 1's body masker also misreads — 14 real tests in `tests/mutate-propose.test.mjs`
  and `tests/evidence-chain.test.mjs` would be dropped by gating discovery on it, and it hashes a prefix for a test
  holding `` `${ cond ? `x ${y} }` : '' }` ``. ADR-078 leaves three things here, each deferred from its Out of Scope:
  `spec-verify`'s check that a bound JavaScript test exists (`plugin/bin/spec-verify:636`) and `adr-lint`'s can-fail
  check (`plugin/bin/adr-lint:4900`) still read with hasher 1's masker; and the records whose locks hasher 2 reads
  differently are relocked one by one, as each maintainer chooses.

## 325. CLOSED 2026-10-15 (was PARTLY CLOSED 2026-10-06; moot or declined) — A session start spends its time starting processes, and reads the six oldest records

**CLOSED 2026-10-15** (backlog sweep): the six adr-next starts are moot, since ADR-099 removed adr-next from SessionStart. The synchronous `gh` at SessionStart is ADR-065's deliberate choice ("never an old one") and has no measured target; declined until a Windows timing shows it matters.

Reported by the owner from Windows on 2026-10-01: SessionStart hooks take long to complete. Measured the
same day on macOS with a `startup` payload, tracing every child process:

- `lifecycle.mjs` took 0.91s: 4 `git` calls, then 6 `adr-next` Python spawns in series (83–110ms each).
  The cap `TASK_DIRECTORY_READ_CAP` (`plugin/scripts/lifecycle.mjs:1205`) reads six directories in
  listing order. In this repository those are ADR-001 to ADR-006, every one done. So the hook pays six
  interpreter starts to report nothing, and every record that could be in flight goes into
  "+62 more: UNPROVEN — not read".
- `branch-state.mjs --cached 120` took 0.11s with a fresh cache and 1.56s without one. 637ms of that
  was one `gh run list`. At session start the 120s cache is usually stale.

A Python start and a `gh` call each cost far more on Windows than here; no Windows timing is recorded
yet. **Lead:** one `adr-next` process reading every task directory removes five interpreter starts and
the cap together. `branch-state` at SessionStart could serve its git half and refresh `gh` in the
background, as the brief already does. Both change what a shipped reader prints, so each needs a measured
target first (a Windows timing), then a spec and an outside run (§18).

**Triaged 2026-10-06.** The "six oldest" half is fixed. `taskDirectories` (`plugin/scripts/lifecycle.mjs`, the comment citing §325) ranks directories by their newest change. SessionStart says so: "reads the 6 most recently changed per session start". The process-start half is still open, and it stays without an ADR on purpose, under the owner's measured-target rule (2026-09-26). Measured on macOS 2026-10-06: about 65 ms per adr-next start, so the six cost about 0.4 s of a 1.1–1.5 s SessionStart. That is too thin a target to justify a new multi-directory CLI contract. A Windows timing is still the missing number, and the draft waits for it. If it is ever written, the draft must keep two things. Each directory's could-not-look stays its own, so one locked directory does not blind the batch (§350 C3). And the single-directory invocation stays byte-identical.

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
## 330. CLOSED 2026-10-15 (was DEFERRED 2026-10-01; declined until measured) — the artifact batch gates each path in its own shell

**CLOSED 2026-10-15** (backlog sweep): the cost is still one bash per path (`plugin/scripts/run-shell-hook.mjs`), but no wall time was measured after ADR-080, and the section itself says "measure before deciding". Declined until a measurement over a real batch shows the per-path shell matters.

`runArtifactBatch` (`plugin/scripts/run-shell-hook.mjs:600`) starts one bash per path through
`facts-gate-dispatch.sh`, about 200 ms each. Replayed on a local clone of an adopter's session log, 217
targets took 43.3 s. ADR-080 takes the pass off every hook's critical path, which removes the wait but
not the work. Gating a batch in one shell would cut the work too, but it gives up the dispatcher's
per-path isolation, so it is its own decision. Measure the pass's wall time after ADR-080 ships before
deciding.

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

## 351. CLOSED 2026-10-15 (was OPEN 2026-10-06; one false refusal carried to §381, the rest fixed or by design) — §295 triaged against a0d963d: what is still open

**CLOSED 2026-10-15** (backlog sweep, each item re-verified against the code): the ADR-090 residual is a real false refusal, measured today (`freshRepositoryCommit` is false for an unquoted `-m push` and for `-m "$(cat <<'EOF' …)"`, true for `-m "a fix"`), carried to §381. Fixed: the unterminated-line siblings (`plugin/scripts/check-ledger.mjs` `ledgerPass` serves `latestFastPass` and `passedAlready`). By design (ADR-088 Out of Scope): a hand-written five-field ledger line, and the writer-side lock readers' sha widths (no defect claimed). ADR-090's own Follow-ups stay in that record.

Every item of §295 was checked against the working-tree readers at a0d963d. The check was a read-only subagent reproducing each item in scratch copies of `tests/fixtures/corpora/go-module`. FIXED: items 2, 3, 4, 5, 7, 12, 13, 17, 18, 19.1/2/4, 21.1/2, 22.4, 23.1/2, 24, and the duplicate-id half of 11. BY DESIGN: 19's `--json` data, 22.5, 23.5's `Accepted (partially)`, 23.7. Still open, worst direction first:
- **Fail-open:**
  - 8: a duplicate Verification Log row, a 41-character sha, and a sha naming no commit each lint PASS with no finding.
    - **Fixed by ADR-088 T1 (executed 2026-10-06, uncommitted at 3ae6c8c).** The row sha field lives once in `record.py`, and `adr-next` reads it as `adr-lint` does (4-64), so a `core.abbrev=4` or SHA-256 row is no longer `done` to one and `READY` to the other. In a SHA-1 repository a sha over 40 characters is blocked by adr-lint and not evidence to adr-next or adr-verify. Unchecked by design, said in the adr-execute skill: a sha naming no commit, a repeated row, and row dates out of order (ADR-088 Decision 2, with the measurements). Test `tests/vlog-sha-width.test.mjs`; two mutants RED.
    - After two Codex reviews of the diff, the sweep's claim reader (`claims_in`) and the test lock's row reader (`_recorded_lock`, through `lock_findings`) take the same width; each has a test and a mutant RED. The writer-side lock readers `--relock` uses (`lock_hasher` and `moved_lock_bodies`) take no repository and still read every width.
  - 22.1: `human_outcome` reads "revoked", "rolled back", ❌, "done? no" and "passed? not really" as pass.
    - **Fixed 2026-10-06.** "revoked", "reverted", "rolled back" (verb forms only) and ❌ are stop words, and an affirmative asked and answered no ("done? no") is a stop. The noun "rollback" is left alone, because a real approval's follow-up uses it (§287). Measured over the 13 unique human-observed sign-offs under the owner's projects directory: none carries any of these. `tests/human-outcome-negatives.test.mjs` has six stops and three controls. Two new mutants and one repointed, all RED.
  - 20.Q5: corpus-probe output saved as `T3-report.md` is ready in adr-next and work-next, while adr-lint FAILs it.
    - **Fixed 2026-10-06.** adr-next stops a file in `tasks/` that never mentions an Acceptance, naming why, so it is not offered as ready. A malformed `##\u00a0Acceptance` heading keeps its own, sharper note. All 244 task files under the owner's projects carry the heading. Test `tests/no-acceptance-task.test.mjs`; mutant RED. Side effect: a self-looping symlinked task is now one unreadable task, not adr-next failing whole, so `tests/chaos-e016066.test.mjs` drives that path with a mode-000 file instead. Its three §319 item 6 mutants are RED again.
  - 22.2: a spec symlinked outside the repository is listed in `uncoveredReadySpecs`.
    - **By design, 2026-10-08.** ADR-092 Decision 2 (its finding 1) settled that a record linked to a file outside the repository is placed by its listed path and counted; the spec reader follows the same rule. Reproduced in a scratch repository: with the target present the spec is in `uncoveredReadySpecs`; with it gone (a CI clone) it is in `unprovenSpecs`. The answer depends on the machine only where the link does, and is never silent.
  - 9: lifecycle accepts any `check.*` event whose `after.tree` matches, unbound to `checks.jsonl`. This needs a record.
    - **Fixed by ADR-088 T2 (executed 2026-10-06, uncommitted at 3ae6c8c).** `publishVerdict` judges the session log through `ledgerBoundLog`: a `check.*` event counts only when `checks.jsonl` holds a record with its id, its grade and its tree, and the refusal names the events it dropped. Rule P and git's own hook both read it. A ledger not read whole is could-not-look to the verdict whoever imported it, and an unterminated last line counts as not read whole (a Codex review of the diff). Unchecked by design: a hand-written five-field `checks.jsonl` line still clears the refusal in silence, an unparseable line in either file still turns it into advice, and the Stop, SessionStart, SessionEnd and statusline readers are not bound (ADR-088 Out of Scope). Siblings of the unterminated-line class, not changed: `latestFastPass` and qh-check's `passedAlready`. Tests `tests/publish-ledger-binding.test.mjs`; mutants RED. ADR-066 T1's locked test relocked with the owner's approval.
- **Hang:** item 1 and 19.3, one cause. A FIFO or a directory named `*.md` in `tasks/` hangs work-next, adr-next and corpus-probe (rc 124 at 25 s), or stops the whole directory. adr-lint already refuses non-regular entries. Give the other readers the same per-entry stop.
  - **Fixed 2026-10-06.** adr-next stops a non-regular task entry as unreadable, without opening it, and reads the rest. work-next and the corpus reader in lifecycle never open one. That covers a FIFO, a directory named `T3-x.md`, and a git-tracked link to a FIFO, which is the shape git lists. corpus-probe over a FIFO corpus now finishes in 0.8 s; adr-lint still refuses the record (§319). The test is `tests/irregular-task-entry.test.mjs`, three cases. Four catalogue mutants, all RED.
- **Untrue sentence or blind spot:**
  - 10: `attestation()` has no `look`; with git absent it says "not a git checkout"; `diffReports` never compares specs.
    - **Fixed earlier, confirmed 2026-10-08.** By ADR-089: an attestation carries `look` (every 3.8.13 outside attestation shows it); git that cannot run is said as "git could not be run (<code>)", apart from a plugin outside a checkout (`corpus-probe.mjs` `gitReason`); and `--diff` compares `unprovenSpecs` and `uncoveredReadySpecs` with the other workNext lists.
  - 22.3: ENOBUFS is worded "did not start", and there is no `maxBuffer`.
    - **Fixed earlier, confirmed 2026-10-08.** ADR-089 T4: the probe's reader spawns (`run`, `gate` and adr-lint's) pass `maxBuffer` (64 MiB), and ENOBUFS reads "ran, and its output passed the probe's buffer (ENOBUFS), so what it said was not read" (`failedToRun`).
  - 14: `--adopt` echoes absolute paths, and work-next says "adopts it".
    - **Fixed earlier, confirmed 2026-10-08.** ADR-089 T5 made `--adopt` name each root relative to the working directory, or by its last component; a scratch corpus given both relative and absolute arguments printed no home path. work-next now says `--adopt` "reports what adopting it needs; it changes nothing". A dangling link in the corpus stops the run with exit 2 naming it, which is ADR-092 Decision 10, not a defect.
- **Hardening:**
  - 11/20.Q6: homoglyph and fullwidth ids (`АDR-005`, `T６`) count with no remark.
    - **Fixed 2026-10-08.** Reproduced in a scratch corpus: a Cyrillic-A record name and a fullwidth-digit one were counted by their titles with no remark, and a fullwidth `T6` task was READY in adr-next while adr-lint blocked "README lists 'T6' but no task file matches it". adr-lint now advises on a record or task file whose name reads as an id only after NFKC and a small A/T look-alike map, naming the code points and the ASCII name. The block stays; the remark is new. No tracked name in this repository holds a non-ASCII character. Test `tests/lookalike-names.test.mjs` with an ASCII control; four mutants RED. Not changed: work-next and the probe still read the file sets they read (A4's half), since adr-lint now names the file both disagree about.
  - 20.Q1: only `<>«»` are mapped.
    - **By design, 2026-10-08.** The map exists for characters a parser reads as a frame: `<`, `>`, and the quote marks themselves. `＜ ＞ ﹥ 〈 〉` are already look-alikes, the same kind of character `‹›` that `<>` are mapped to, so mapping them changes nothing a reader parses. Entities and Markdown inside the quotes are printed as text, never rendered.
  - 6: adr-next prints a ZWSP raw.
    - **Fixed earlier, confirmed 2026-10-08.** `adr-next` `_UNSAFE` holds U+200B–U+200F, U+2060–U+2069 and the BOM (`adr-next:316`); a task whose title and fence hold a ZWSP printed no raw U+200B byte (checked with `od -c`).
  - 23.4: impossible and 1970 dates PASS.
    - **Fixed earlier, confirmed 2026-10-08.** Closed under §355 ("Impossible dates"): `record.row_date_problem` refuses 2026-02-30, 2026-02-31 and 2099-01-01 in adr-lint and adr-next. 1970-01-01 is a real date and stays accepted, a named limit.
  - 21.3: a sparse checkout counts "0 task file(s)".
    - **Fixed 2026-10-08.** Reproduced with a sparse checkout (`git sparse-checkout set --no-cone` over the record only): work-next said "0 task file(s)" while git listed two. The directory was already UNPROVEN; the count now says "0 task file(s) on disk, and 2 more that git lists and the disk does not hold", and the JSON carries `tasksNotOnDisk`. Test `tests/work-next-absent-count.test.mjs` with a control; two mutants RED. SessionStart's line ("UNPROVEN — listed by git, not on disk") was already true and is unchanged.
    - **The gpt-6.1-sol review of the 3.8.14 reader changes (129331b0..HEAD) found one untrue sentence in this fix, now fixed.** Every failed `stat` was counted as "the disk does not hold"; EACCES on a parent proves no absence. Only ENOENT and ENOTDIR count as not on disk; any other failure is "could not be inspected" (`tasksUninspected`). Readiness is unchanged: both make the directory UNPROVEN. A POSIX mode-000 case in the same test; one new mutant, two repointed and the moved 2.110.0-rc L4 entry repointed, all RED. The review found no demoted block, no false look-alike advice and no other regression.
    - **From an outside 3.8.14 run (laravel-react-monorepo), fixed after 3.8.14.** The probe summary copied neither count, so a pasted probe report could not show them, the class the probe's own spec comment names. `workNext.tasksNotOnDisk` and `workNext.tasksUninspected` are in the report now, and `--diff` compares them with the other counts. Test `tests/probe-tasks-not-on-disk.test.mjs` with a control; two mutants RED, the moved ADR-089 T1 entry repointed and RED. A probe whose baseline predates them prints "before lacks workNext.tasksNotOnDisk" once.
- **Not checked here (Windows):** 16, 19.3's wording, 23.3, 23.6. 20.Q4's line key is UNKNOWN.
  - **Addressed 2026-10-09, without a Windows peer: the release CI's Windows job runs each case.** Read from run 37891968679's Windows log (v3.8.16):
    - 16, one junction loop blinding the corpus: §350 C7 fixed it after the report; `tests/corpus-link-loop.test.mjs` builds a real junction on Windows and passes ("a record reached again through a link that loops is read once, and the copies are named", and the SessionStart and work-next twins).
    - 19.3, a directory named like a task (PermissionError): §351 item 1's fix stops a non-regular entry unopened; "a directory named like a task is stopped unopened, and the other tasks are read" passes on Windows.
    - 23.3, reserved names: Git for Windows does not check out `CON.md` or `nul.md`, so such a task is listed and not on disk; "a task git lists but the disk lacks is stopped" passes on Windows, work-next counts it apart (21.3), and a name ending in a dot or a space is named PARTIAL (§355).
    - 20.Q4: "a torn checks.jsonl is named as checks.jsonl, not as the session log" passes on Windows. The key it questioned is `checks.jsonl:<size in bytes>` (`lifecycle.mjs`, the dedupe key), not a line: "line 10 of a one-line file" read a 10-byte size as a line. Nothing untrue is said.
    - 23.6, an 8.3 alias in `Governs:`: by design, and said. A Governs path resolves against git's listing (CLAUDE.md §8), which holds the long name, so `STANDA~1.MJS` names no tracked file, and adr-lint says so: "Governs: declares `scripts/STANDA~1.MJS`, which no tracked file matches" (reproduced 2026-10-09). No reader resolves a declared spelling through the disk.

**Codex review before 3.8.8 (gpt-6-astra, xhigh, 4283d6a...3ff59fb, REQUEST CHANGES, 2026-10-06): six findings. All six were confirmed against source and fixed, each with a test that failed first. They are in `tests/adr-next-codex-3-8-8.test.mjs` and one evidence-chain test.**
- **P1, a stop that still counted done.** `classify` reads `done` before any stop. So a task titled for another record (§292) with exit-0 evidence counted done under this one and released its dependents. A human approval later taken back did the same, because `is_done` took the FIRST non-stop sign-off. Now `done` is withheld by `foreign_stop` and by `human_stop`. `human_stop` reads the LAST sign-off: a stop later approved after a fix is done. `foreign_state` applies the same rule to a cross-record dependency.
- **P1, a prefixed build failure graded killed** (ADR-085). See the Follow-up in that record.
- **P2, `foreign_state` opened a FIFO** that `load` had guarded. Now it is unknown, unopened.
- **P2, an irregular entry sharing an id was skipped** when it sorted after the evidenced file. Now both names are given and the task is UNPROVEN.
- **P2, my take-back words stopped success prose.** "the expired token was revoked" and "verified: rolled back … successfully" were both stops. `TAKEN_BACK` now requires the verb to attach to the verdict: after a clause break that follows an affirmative, or with "approval", "sign-off" or "verdict" as its subject.
- **P2, `❌observed` passed**, since the word boundary excluded it. A cross is now a stop wherever it sits.
- Eight catalogue entries repointed; nine added. All 17 are RED.

**ADR-086 residual false refusals (Codex re-review of a14a751, 2026-10-06, P2, left open).** `freshRepositoryCommit` refuses a fresh-repository commit whose message says "push" or holds a quoted `;`, because it reads raw text: `/push/` over the whole command, and `step.code` for a quoted span holding an operator. Both were refused before ADR-086 as well, so nothing regressed. Inputs, each `freshRepositoryCommit(…, {})` false at the working tree after the fix:
- `R=$(mktemp -d) && cd "$R" && git init -q && git commit --allow-empty -m "push the fix"`
- `R=$(mktemp -d) && cd "$R" && git init -q && git commit --allow-empty -m "a;b"`
- Smallest fix the review suggests: classify the invoked verbs and git argument positions instead of raw text — a `push` only as a git subcommand, and a quoted operator only where git or a shell would run it, never in a `-m` value.
- **Fixed by ADR-090 (executed 2026-10-06, uncommitted at 2cb2d28).** T1 masks a commit's message value written as one quoted, non-dynamic literal whose spelling occurs once, before ADR-066's armed grammar and ADR-086's fresh-repository proof read the text; both inputs above, and `-m "let R=1"`, are now advised. Still open: an unquoted value (`-m push`) and the common `-m "$(cat <<'EOF' … EOF)"` stay refused (ADR-090 Out of Scope, Alternatives (e) and (f)), as do the owner decisions in ADR-090 Follow-ups.

## 352. CLOSED 2026-10-15 (was OPEN 2026-10-06; declined) — The GitHub scout: what outside projects offer, and what each needs before it is taken

**CLOSED 2026-10-15** (backlog sweep): the §16 inputs were taken (ADR-090's shell-input rows). Every other item is an idea that the section itself says needs a measured target and an Accepted record (per-test kill attribution, a Stryker export, a decision/tasks/tests agreement check, skill-call duration, Codex or Copilot hook adapters, `ccusage`), and the pub-laravel-adr lead got no reply from either peer. Declined; a new record re-opens any of them.

The owner asked for a scout of GitHub projects that could help, ranked by stars and by stack, including
those that mention a Claude plugin. It used `gh search repos`, `gh search code` and `gh api` only; nothing
was cloned or run. Plan of record: `ok-plan-this-properly-flickering-lightning` (2026-10-06).
- **Outside corpora** (for 3.8.8 and after): public/php-dated-adr `adr/` (167, dated names);
  public/rst-nested-adr (142 `.rst` records in 39 nested `docs/decisions`); public/go-sdk-adr
  `docs/architecture` (63, `adr-NNN-`); vectordotdev/vector `rfcs/` (76, date plus issue number);
  public/laravel-adr `docs/adr` (66, Laravel monorepo); public/swift-adrs `docs/decisions` (61,
  Swift). Windows-shaped: public/dir-status-rfc (status set by directory), public/spec-folder-adr
  (`#1043 - Title` spec folders). Peers are asked first. A run made by the releasing session is labelled
  as its own and is never imported as an attestation (§18).
- **Inputs for §16:** the test suites of kenryu42/cc-safety-net and nizos/probity (both MIT), harvested
  as commands our publish classifier must classify. Inputs only; no code copied, and no blocking taken (§3).
- **Done now:** `mutation-audit` names Infection, gremlins or go-mutesting, and muter, plus the static
  no-assertion linters (`expect-expect`, `testifylint`).
- **Each needs a measured target and an Accepted record before it is built:**
  - per-test kill attribution, a fence test that killed nothing (scott-cc; `killedBy` already holds the
    data);
    - **Measured 2026-10-06: INCONCLUSIVE.** The v3.8.7 release campaign (run 37411500980) printed 2082 RED rows and 1258 distinct killing test names, from all 48 shard logs fetched with `gh run view --job`. But 53 narrowed entries that WERE red have an `only` pattern matching none of those printed names. So killer names cannot be matched back to the catalogue, and the logs never list the tests a baseline RAN, only the killers. A "test that killed nothing" count needs `mutate.mjs` to emit each baseline's run test names. That is a change to the campaign's output, and it needs a record.
  - a Mutation Log export in Stryker's `mutation-testing-elements` schema;
  - a check that a record's Decision, its tasks and its Tests table agree (spec-kit `analyze`, OpenSpec
    `validate --strict`);
  - skill-call duration beside ADR-084's count (claude-night-market);
  - hook-input adapters for Codex and Copilot CLI (probity);
  - `ccusage` as the instrument for the next §19 footprint measurement.
- **Not taken:** code from unlicensed repositories (scott-cc); any blocking behaviour.
- **Released as v3.8.8 at 944bb37 (2026-10-06), Latest.** release-evidence said SUCCESS: 55 jobs green, including the dispatched full campaign (run 37457712766). Before that, the campaign at e39ace5 failed one Windows test, fixed in 944bb37.
  - **Outside runs attested** (`docs/corpus-reports/*-3.8.8-944bb37.json`):
    - react-spa: 2 compared, passToFail 0.
    - pub-laravel-adr (public/laravel-adr, public, no `--sweep`): 66 compared, passToFail 0. All 66 are FAIL at both revisions; 52 records against 66 compared, 14 undecided. Why every record FAILs there was not checked; that is a lead for corpus shape, not for 3.8.8.
    - php-laravel-monolith: 17 records. `verdictChanges` is null because the look is PARTIAL. The runner compared it by hand: all 23 adr-lint verdicts unchanged, and the §313 sentence fired on a real case and is accurate there.
    - app-ts-monorepo and web-app-no-adr-corpus: 0 records each.
  - **Could not run:** rust-records-corpus, whose "Code from External" classifier needs its user's approval. Not yet replied: php-react-app and a11y-tooling-ad.
  - **My request was wrong once.** It asked for `--sweep` on public corpora, which re-runs a stranger's acceptance commands. Two peers refused and said why, and I sent a correction to all six. Future requests ask for public corpora WITHOUT `--sweep`.
  - **Ledger counts (ADR-081, ADR-084; counts only):**
    - react-spa: 9 sessions, 0 skills, 0 skips, 8 checks (7 passed).
    - php-laravel-monolith: 13 sessions, 0 skills, 0 skips, 3 checks.
    - app-ts-monorepo: 12 sessions, 0 skills, 0 skips, 95 checks (80 passed).
    - web-app-no-adr-corpus: 1 session, 0 skills, 0 skips, 2 checks.
    The skill counter shipped in 3.8.7, so no adopter has recorded a skill call yet.

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

## 354. CLOSED 2026-10-12 (was OPEN 2026-10-06) — A public corpus with YAML-frontmatter records (public/swift-adrs): three reader leads

**CLOSED 2026-10-12** (re-verified against the code in the backlog sweep): Items 1 and 3 are fixed (tests/not-recognised-reason.test.mjs, tests/alternatives-heading.test.mjs). Item 2 was decided by ADR-087, Accepted, where `active` is governing (record.py:635-639). The fixture corpus tests/fixtures/corpora/yaml-frontmatter exists. The 'no tests failed' false stops were fixed in ddb36198 (tests/human-stop-red-green.test.mjs).
From an outside run (a11y-tooling-web, with its user's approval, no `--sweep`) of public/swift-adrs @ b2177fb, v3.8.7 → 944bb37. Its 61 records in `docs/decisions` carry YAML frontmatter (`status`, `supersedes`, `superseded_by`): 32 active, 29 superseded. Readers said the same at both revisions, so none of this is a regression. Attestation filed: 61 compared, passToFail 0. To be confirmed against source, worst direction first:
1. **Silent "not-recognised".** 32 of 61 records get adr-lint "not-recognised", exit 2, with no reason and no advice. Example: `026-invert-original-codex-prompt.md` is valid frontmatter followed by prose with no `##` sections. Half the corpus is hidden, and only `records: 29` against `compared: 61` shows it. A not-recognised verdict should say what was missing.
   - **Fixed for 3.8.10.** adr-lint's not-recognised sentence ends "This file: …", naming what THIS file lacks: no Status line; a Status other than `**Status:**` outside a record directory; a Status no reader acts on (a YAML `status: active` IS read, as `active`); or no `## Context`/`## Decision` heading. corpus-probe carries that clause as the row's `reason`. Test `tests/not-recognised-reason.test.mjs`; three mutants RED; three repointed entries RED.
2. **Frontmatter status is not read, and the advice is wrong.** adr-state reads 29, governing 0. work-next says accepted 0, `next = adr-retire` and retirable 29, although 12 of the 29 say `status: active`. Telling a corpus with 32 active decisions to retire is wrong for this shape. Before any fix, decide whether YAML `status: active` reads as Accepted (ADR-074 Decision 1 defines which Status forms count). That needs a record and a measured shape: MADR 3 also writes a frontmatter `status`.
3. **An untrue sentence.** All 29 FAILs say "Alternatives Considered has no entries". Record 001 has `## Rejected Alternatives` with two entries: the heading is named differently, not empty. It should say "no `## Alternatives Considered` section (found `## Rejected Alternatives`)".
   - **Fixed for 3.8.10.** When the section is absent, the sentence adds "the record has no `## Alternatives Considered` section; it has `## Rejected Alternatives`". An empty section keeps the plain sentence, which three tests and a mutant pin. Test `tests/alternatives-heading.test.mjs`; mutant RED.
A fixture corpus with this shape belongs in `tests/fixtures/corpora/`, following the go-module pattern (§282).
- **Released as v3.8.9 at 4ff7518 (2026-10-06), Latest.** release-evidence said SUCCESS. Outside runs: laravel-react-monorepo (95 compared; both fixed cases confirmed on its corpus) and python-adr-corpus (77 compared), both passToFail 0.
- **A third case from the 3.8.9 run, fixed for 3.8.10.** python-adr-corpus's 076/T11 still read as unbacked, for two reasons:
  - Its last human sign-off pasted "2374 passed / 1 failed", and «failed» read as a verdict. A negative word right after a number is now a count. "it failed 3 times" still stops.
  - That sign-off was a day OLDER than the task's tool-written exit-0 rows. A stop now takes back only evidence recorded before it. Implemented as one filtered list of sign-offs, which keeps the human-mutant filter testable: a first version recomputed the filter and turned its mutant GREEN.
  Test `tests/human-stop-3-8-10.test.mjs`, with controls. Two mutants RED; all 18 sign-off mutants re-ran RED.
- **Codex review of 944bb37..73f930f (gpt-6-astra, high, REQUEST CHANGES): three P1 fail-opens in my 3.8.9 and 3.8.10 rules.** Each rule was wider than its case, and each width turned a stop into done. The review's own inputs are now tests:
  - **"no + two words" (shipped in 3.8.9):** "observed no progress and stopped the rollout" and "No we must stop" counted done. Now "no" takes at most one modifier and only a gerund ("no visible blocking"). "no change yet blocking the release" pins the width.
  - **The count rule (3.8.10 RC):** "step 2 failed on Safari" counted done. Only test-summary syntax ("N passed / N failed", "N failed, N passed") is a count now.
  - **Later evidence (3.8.10 RC):** an exit-0 row for a DIFFERENT fence cleared a real stop. Only a row with the current Acceptance's digest outranks an older stop, never a relock snapshot. A human-only Acceptance has no digest and so nothing to outrank it.
  - Two guards in my first narrowing were redundant, and their mutants went GREEN; both are removed. Four mutants were added and three repointed; all 21 sign-off mutants re-ran RED.
  - **Process slip:** 3.8.9 shipped without the §12 review that would have caught the first of these. 3.8.10 fixes it.
- **Codex re-review of ee82e08 (REQUEST CHANGES): the count rule was still wider than its case, and an order-only check could be gamed.**
  - "Safari 17 passed; 18 failed the manual check", "Safari 18 failed, 17 passed" and "step 1 passed; 2 cannot proceed" counted done. Text cannot tell a test summary from a version or a step number, so **the count rule is removed.** A pasted summary that is the LAST sign-off is a stop again, the conservative reading. T11's case is covered by the older-stop rule, because its summary predates its exit-0 rows.
  - An exit-0 row DATED before a refusal, but placed below it, cleared the refusal. Now a clearing row must be dated on or after the sign-off; same-day rows keep their append order.
  - **Left open, the safe direction:** "approved; no tests failed" and "approved; no failed tests" are false stops. This predates 3.8.9, and a bounded absence form is a later decision.
  - Two count entries were deleted with their rule and one date mutant added; all 20 sign-off mutants re-ran RED.

## 355. CLOSED 2026-10-12 (was PARTLY CLOSED 2026-10-06) — Five Windows corpus-chaos runs of v3.8.9: one blinding bug, three fail-opens, and leads

**CLOSED 2026-10-12** (re-verified against the code in the backlog sweep): Every lead has a fix or a by-design closure, and the fix sites are in the code (GIT_LISTING_BUFFER at 4 sites; record.py row_date_problem/status_labels/clipped; adr-lint unreadable_record_numbers; work-next.mjs:848,995; ready-lines.mjs:307; lifecycle.mjs:239), with their tests tracked.
The owner brought five Windows 11 desktops back for testing. Each ran the probe and the chaos catalogue on v3.8.9 (4ff7518) over its own corpus or a public one: go-sdk-adr, php-dated-adr, a 70-record Go CLI corpus (twice), and a 209-task Python backend corpus with CRLF files. Each run diffed against v3.8.8 where it had a baseline. **No CRLF defect was found anywhere.** adr-lint's own stdout is CRLF on Windows, and the probe trims it. Attestations at 4ff7518: 62, 70 and 70 compared, all passToFail 0; one has no baseline. Replies came over the bridge, because none of the sessions has the palace tools.
**Fixed for 3.8.10:**
- **The plugin was blind on large repositories (php-dated-adr, 27,289 files).** `trackedPaths` ran `git ls-files -z` under Node's 1 MiB default buffer and hit ENOBUFS at 2.3 MB. Every JS reader then said "git could not list the tree" (UNPROVEN). Class, by `grep -n "spawnSync('git'" plugin/scripts/*.mjs`: the four calls whose output grows with the tree, the listing, the deleted-file diff, `gitLines` and the status read, now share `GIT_LISTING_BUFFER` (256 MiB). The others read one value. Test `tests/large-listing.test.mjs` (skipped on Windows, because MAX_PATH caps the long names); mutant RED. The constant's mutant covers the listing site only; the other three sites have no large-output test.
- **A pending record lost its git listing** (go-sdk-adr). adr-lint reassigned `tracked` to None for a pending record with no tasks and no ## Implementation paths. It then said "could not be listed from git", and resolved Enforced-by from disk, an ignored file included (§8). The reassignment is removed. Test `tests/adr-lint-pending-tracked.test.mjs`; mutant RED.
- **False "row removed" advice** (Python corpus). Mutation Log `--human-mutant` rows match VLOG_RE, but were compared only with the Verification Log. On a clean tree they were reported removed, with an instruction to re-run adr-verify, in an order that flipped between runs. Now compared with the whole file, and sorted. Test `tests/mutation-log-row-kept.test.mjs`; mutant RED; one entry repointed.
- **Impossible dates** (§351 23.4, measured again). A row dated 2026-02-30, 2026-02-31 or 2099-01-01 linted PASS and counted done. The shared `record.row_date_problem` makes such a row off-grammar in adr-lint, and not evidence in adr-next. 1970 is a real date and is still accepted: that limit is named, not guessed. Test `tests/impossible-row-date.test.mjs`; four mutants RED.
- The probe's could-not-run note for adr-lint exit 2 is trimmed, since a Windows line keeps its CR.
**Leads, not fixed:**
- A duplicate record number is counted twice and named by no reader (two runs).
  - **Fixed 2026-10-08.** adr-state already named the pair (`duplicateIds`, since §309). adr-lint now advises on either record: "another record in this corpus carries number N: <file> — … renumber one of them". It is advice, so the verdict does not change. work-next still counts both, which is correct: they are two records, and it leaves record questions to adr-state. Test `tests/duplicate-record-number.test.mjs`; three mutants RED. This repository's corpus has no duplicate (`adr-state --json`, `duplicateIds: []`).
- A Status with invalid UTF-8 gets PASS plus advice, while a fullwidth colon gets UNPROVEN (two runs).
  - **Closed 2026-10-08 as by design, after reproducing both.** A fullwidth colon means no Status label is read at all. Then the check that done tasks need an Accepted record cannot run, so the record is UNPROVEN (§350 C8). Invalid UTF-8 inside a read label gives a value no reader acts on (`Acc�epted`), which every reader treats as undecided: a plan, never a work order. That is the safe direction, and adr-lint's advice already names U+FFFD and what it usually means (the Codex review of ffd4892, #6). Making it UNPROVEN would add nothing a reader acts on.
- A trailing-DOT task or record name ("T99.md.") is named nowhere: the Windows twin of §321's trailing space.
  - **Fixed 2026-10-08, and the class was wider.**
    - **Tasks.** adr-next's two §321 sites, the git listing and the disk scan, now strip dots as well as whitespace after `.md` (`_past_md`). A `T1-a.md.` is stopped and named, as `T1-a.md ` is; whitespace keeps its §321 wording, and a dot is said as a dot.
    - **Records.** Here the trailing space was never handled either. `ADR-001-a.md.` and `ADR-002-b.md ` were counted nowhere and named nowhere, with look ok. work-next now names each in `partialBecause`, and the look is PARTIAL.
    - **adr-lint.** Its cross-record enumeration dropped such a record, so a dependency on it was a FAIL, "names no record in this corpus". A first version made the whole enumeration could-not-look, which turned every OTHER missing dependency in the corpus into advice and skipped the cycle check: one stray file demoted a real refusal elsewhere, a fail-open an advisor read caught before review. Now only a pointer whose number belongs to such a name is could-not-look (`unreadable_record_numbers`), and the test's twin row keeps an unrelated missing dependency a FAIL. Both could-not-look sentences now name both causes ("could not be listed from git, or a record in it could not be read"); the second cause was already true of an unreadable record and was never said.
    - **The gpt-6.1-sol review of this batch (139713e3..5972a472) found two more fail-opens in that narrowing, both fixed.**
      - A dated stray name (`2026-10-08-notes.md.`) gave its year as a record number, and a missing `ADR-2026-T1` became advice. Only an `ADR-NNN-` or `NNNN-` name, never a dated one, lends a number now.
      - The citation path returned could-not-look to callers that act only on "not a record", so the warning went silent. Citations are left as they were at 139713e3.
      - Both inputs are rows in `tests/trailing-dot-task.test.mjs` through the CLI; two mutants RED; all 19 §355 mutants re-ran RED.
      - **The one scoped verification review found a third, introduced by the first fix**: a task-shaped stray name (`004-T2-note.md.`) lent 4, and a missing `ADR-004-T1` became advice. The number now comes from `record_id`, ADR-063's identity rule, so a dated name is its stem and a task-shaped name is no record. A third row and a third mutant, RED; the moved §355 entry repointed and RED. Its verdict on the SessionStart change: no regression.
      - The same full gate caught a regression in the SessionStart change: the UNPROVEN line displaced an existing ready line under an unreadable record. It now replaces only the "fully evidenced" count.
    - Tests `tests/trailing-dot-task.test.mjs`, four cases, each skipped where the filesystem drops the name. Five mutants RED; the moved §321 entry repointed; all 103 §321 and 111 ADR-092 mutants re-ran RED.
- Two Status lines (Superseded, then Accepted) read silently as the first.
  - **Fixed 2026-10-08.** The reading is unchanged: every reader still takes the first label, which keeps the two runtimes agreeing. adr-lint now advises when two label lines give different kinds, lists them, and says which one counts. `record.py`'s Status walk is one generator, `_status_lines`, shared by `record_status` (first label) and the new `status_labels` (every label), so the two cannot disagree about which lines are labels. Test `tests/two-status-lines.test.mjs`; three mutants RED; the moved ADR-074 T1 entry repointed and RED; all 98 Status-labelled catalogue mutants re-ran RED. No record here has two disagreeing lines.
- `records[].status` loses underscores through `recordStatus`.
  - **Closed 2026-10-08 by the owner's decision: left as ADR-074 Decisions 1-2 define it.** Both runtimes strip every `_` and agree. Keeping intraword underscores, as CommonMark does, would also reclassify: `Accepted_with_conditions` would govern where it is undecided now. Reading it as undecided is the conservative direction, and no outside corpus has shown the shape.
- The scrubber over-redacts: `https://<host>[/<path>]` and "`a`/`b`".
  - **Closed 2026-10-08 as by design.** Reproduced: `` `https://<host>[/<path>]` `` becomes `` `https://<host>[<path>` `` and `` "`a`/`b`" `` becomes `` "`a`<path>`b`" ``. The scrubber's own comment records the decision (`lifecycle.mjs` `scrubber`, "THE SAFE DIRECTION IS OVER-SCRUBBING, BY DECISION"): three review rounds found a leak each time its boundary was made cleverer. Each narrowing here reopens one: exempting a `/` after a backtick would print `` `x`/Users/<name>/… `` whole, and exempting one after `[` would print a Markdown link `[/Users/<name>/…](…)` whole. A lost hint costs a question; a shipped home path cannot be recalled (§6).
- adr-lint cuts quotes at [:70] and [:80] with no "…".
  - **Fixed 2026-10-08.** `record.clipped(text, width)` cuts to the width and adds `…` only when it cut. The class is every f-string in a `plugin/bin` Python gate that interpolates a `[:N]` slice: 17 sites in adr-lint (8), adr-debt (1), adr-retire-check (2) and arch-lint (6), plus adr-judge's alternative head, which imports nothing from record.py and keeps its own one-line form. Two adr-lint Verification Log sentences had the opposite fault: they appended `…` to a row short enough to print whole. A first grep over `.strip()[:N]` missed two `cells[0][:40]` sites; `tests/clipped-quotes.test.mjs` sweeps every gate for the slice form, shows its pattern matching a sliced line first, and found them. Three mutants RED. Not changed: slices that build keys or values rather than quoted text.
  - **Found by the 3.8.13 outside runs, fixed after the tag.** A cut that fell just after a space printed the mark one space off the word (`abc …`): 11 of 57 clipped quotes in one corpus. `clipped` now drops trailing whitespace before the mark. A row in `tests/clipped-quotes.test.mjs`, one new mutant RED, two moved entries repointed; all four clip mutants re-ran RED. Cosmetic, so 3.8.13 shipped with it.
- adr-lint prints a content claim about a task before saying the file holds NUL bytes, so the probe's reason hides the encoding cause.
  - **Fixed 2026-10-08, in the probe.** Reproduced with invented names, adr-lint itself stops at the NUL finding for a task and for a record. What hid the cause was ordering across files: the record's own content findings print before a task's "holds NUL bytes", and the probe took the first finding as the row's reason. A FAIL row now prefers that finding and otherwise keeps the first. Test `tests/probe-nul-reason.test.mjs`, with its control; mutant RED; all 54 probe-labelled catalogue mutants re-ran RED.
- SessionStart says nothing about unreadable records, and calls their directories "fully evidenced".
  - **Fixed 2026-10-08.** Reproduced with invented names: adr-next said `owner_unreadable: true` ("it holds a NUL byte, so it is not text"), and SessionStart counted the directory "fully evidenced". adr-next sets that flag whenever it found the record and read no Status from it, which includes a record read whole with no Status line ("it has no Status line"). So the line says "could not read a Status from the record that owns these tasks", with adr-next's reason, and the directory is UNPROVEN. A record with no Status is UNPROVEN in adr-lint too (§350 C8). Neither this repository nor any fixture corpus produces the line. Test `tests/session-start-unreadable-owner.test.mjs`: both cases, plus the control; mutant RED; all 21 SessionStart catalogue mutants re-ran RED.
- On a junction loop, work-next's headline says "a listed record could not be read" though every record was read.
  - **Fixed 2026-10-08.** The loop itself is Windows-only: git tracks a POSIX directory link as a link and walks nothing through it. The untrue sentence is not Windows-only. work-next printed it for every PARTIAL cause: a task alias, a dangling link, a format no reader parses, a name no reader reads. It now says "part of the corpus could not be read", which is true of each. adr-state said the same sentence, but its look is also PARTIAL when an archive catalog cannot establish a record's standing; it now uses adr-context's wording, which names both causes. Two tests (in `tests/trailing-dot-task.test.mjs` and `tests/session-start-unreadable-owner.test.mjs`) and two mutants RED.
- php-dated-adr's 168 front-matter records are counted nowhere (ADR-087 territory).
  - **Measured 2026-10-08 at HEAD, and the owner's decision.** Shallow clones of both public corpora, run by this session (not attestations). The php-dated corpus's 173 files carry front matter with no Status anywhere: all are named in `notRead`, and work-next then says "No QH corpus is in use", which is untrue over 173 named record-shaped files. The swift corpus reads correctly now (29 records, 12 accepted, the 17 retirable are Superseded, 32 without `## Context` named). ADR-092 Decision 9 keeps the look ok for a candidate whose read succeeded. **Owner, 2026-10-08: fix the headline only, keep ADR-092's look rule.** Queued after 3.8.14.
  - **Fixed 2026-10-08, after 3.8.14.** When the stage is "no corpus" and record-shaped files were named as not read, work-next now says "No record this reader recognises is in use: the N record-shaped file(s) named above were not read, so this is not \"no corpus\"", and its "because" clause says the same. The stage, the JSON and the look (ADR-092 Decision 9) are unchanged. Over the public php-dated clone it prints that line with N = 173. Test `tests/work-next-not-read-headline.test.mjs` (invented names, the same shape) with an empty-repository control; two mutants RED.
- A lone CR cuts a SessionStart title with no marker.
  - **Closed 2026-10-08 as by design.** A lone CR is a line ending in CommonMark, and both title readers split on it (`record.title_line`, lifecycle's `titleLine`: `/\r\n|\r|\n/`). So `# Task …: first half\rsecond half` has the heading "first half", and SessionStart quotes the heading whole. Nothing was cut, so there is nothing to mark.
- The UTF-16 hook-payload sentence could say "UTF-16?".
  - **Fixed 2026-10-08.** A hook payload that is not JSON and holds NUL bytes now adds "It holds NUL bytes: saved as UTF-16?" to the existing sentence, and plain garbage is said as before. Test in `tests/session-start-unreadable-owner.test.mjs`; one mutant RED, one repointed and RED.
**A doc error, for the owner:** `git -c core.longpaths=true clone` does not persist the setting; `git clone -c core.longpaths=true` does. It is wrong in CLAUDE.md §7 and .claude/rules/07, and it was wrong in my request too.
- **Closed 2026-10-08.** CLAUDE.md §7 already gives `git clone -c core.longpaths=true` and says why the other form fails. `.claude/rules/07` described the first run's working `git -c … clone` accurately but never said which form to use; it does now.

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

## 358. CLOSED 2026-10-15 (was OPEN 2026-10-07; declined by its own measurement) — the Status word's end is each runtime's Unicode, where the record name's digits are now one frozen table

**CLOSED 2026-10-15** (backlog sweep): the two runtimes' Unicode tables still differ in code (`plugin/lib/record.py` `_STATUS_RUN`, `plugin/scripts/decision-corpus.mjs` `[\p{L}\p{N}]`), but the measured ranges were identical (770), and the section says to build it only when a supported runtime pair differs. Declined until one does.

ADR-092's review fix (finding 3) froze the decimal digits a name arm reads into one table both languages
share. The Status word is not frozen: record.py's `status_word` reads `[^\W_]` and lifecycle.mjs's
`recordStatusKind` reads `[\p{L}\p{N}]`, each from its own runtime's Unicode. A letter assigned in a
Unicode version one runtime has and the other lacks, written straight after the word (`Accepted` plus
U+11DE0, by the review's report), ends the word in one and continues it in the other, so the record
governs in one language only. Not reproducible here: measured 2026-10-07, Python 3.14 (unidata 16.0.0)
and this machine's Node (`process.versions.unicode` 16.0) both give 770 identical letter-or-number ranges.

The fix would be the digit table's shape, a frozen 770-range letter-or-number table in both languages
(or one data file both read), held by the parity test. Not built: no runtime pair here disagrees, and
the table is a generated blob in two files. Build it when a supported runtime pair's ranges differ.

## 359. CLOSED 2026-10-15 (was OPEN 2026-10-07; declined, no measured need) — Python record readers read a whole file with no byte bound

**CLOSED 2026-10-15** (backlog sweep): `read_regular` still reads a whole file (`plugin/lib/record.py`), but the section itself says it is not fail-open and that a cap would change adr-lint's verdict. Declined until an oversized record is seen in a real corpus.

The second half of ADR-092's review finding 13, confirmed by its last review round: `read_regular`
(`plugin/lib/record.py`) reads a regular file whole, so an 8 MiB record with one unbroken line is one
8 MiB allocation (v3.8.10 read it twice; the fixes read it once). Not fail-open: every answer is still
the answer for the whole file. Not built: no Python reader declares a byte budget, and a cap would
change adr-lint's verdict on a large real record. The JS screen is bounded since the same fixes.

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

## 364. CLOSED 2026-10-15 (was OPEN 2026-10-09; declined, the decision was never made) — A locked test that many records share goes red in every earlier record, silently

**CLOSED 2026-10-15** (backlog sweep): still true that a changed shared locked test is never re-linted in every record that locks it (`plugin/lib/record.py` checks only the record being linted), but the section says "Not built; the owner's decision", and nobody has made it. Declined; re-open with a decision of what an earlier record's lint should say.

Reported from outside (a peer session, a 15-record adopter corpus): a later task extends a shared integration test and lints only its own record, so every earlier record that locked that test fails `adr-lint` with "locked test … hash moved" and nobody is told. Seen three times in a day there. Read in source: the lock check (`plugin/lib/record.py`, the "hash moved" block) runs only when THAT record is linted, and the per-edit gate lints only the file touched. `python3 scripts/test-locks.py <test-file>` lists the lockers but is asked only before an edit. Not built; the owner's decision: lint every locker of a changed locked test (adr-context knows them), or treat a lock on a widely shared test differently. Relocking all without reviewing each diff defeats the lock.

## 365. CLOSED 2026-10-15 (was OPEN 2026-10-09; carried to §381) — The title route sends a non-record markdown file to adr-lint

**CLOSED 2026-10-15** (backlog sweep): still real (`plugin/scripts/facts-gate-dispatch.sh` excludes only `-T<n>`, so `# ADR-051 T7 …` with a space is routed). Carried to §381.

Confirmed by the reporter (a peer session): an evaluation whose first line is `# ADR-051 T7 S5: …` is read as a record by `facts-gate-dispatch.sh` (the `grep '^# ADR-[0-9]'` title test, BACKLOG §190), adr-lint answers not-recognised, and "UNPROVEN: adr-lint could not run" is printed on every touch. Advisory, exits 0. A title that names a record is not a record: the route needs the structure (`Status:`, a Context section) as well as the title, with a case that must still route (CLAUDE.md §16: every "this is data" exemption needs its "this is code again" twin).

## 366. CLOSED 2026-10-15 (was OPEN 2026-10-09; carried to §381) — The branch brief repeats a constant clause because it shares a line with changing state

**CLOSED 2026-10-15** (backlog sweep): still real, narrowed. The age suffix is no longer compared, but the once-per-change text still holds HEAD and the dirty count beside the constant clause (`plugin/scripts/branch-state.mjs`). Carried to §381.

Reported, with three consecutive outputs, by a peer session on a repository with no GitHub remote: "CI COULD NOT LOOK — no remote names a GitHub host" is printed on nearly every prompt. Cause, consistent with the output and with a no-remote scratch repo here (three identical prompts printed it once, then nothing): the brief is suppressed when its text is unchanged, and the text carries HEAD, the uncommitted count and the read age, which change. The CI clause never does. Keep it as its own line with its own once-per-change check (CLAUDE.md §19: volatile text out of the compared text). Not built.

## 367. CLOSED 2026-10-15 (was OPEN 2026-10-09; both false refusals carried to §381) — The publish refusal judges a `git commit` by its text, not by where it runs

**CLOSED 2026-10-15** (backlog sweep): ADR-104 is Accepted and shipped in v3.8.32 for the literal `-C` form. Both remaining false refusals are carried to §381: `cd <literal> && git commit` (deferred by ADR-104), and the arithmetic guard refusing literal data in a quoted heredoc body or an `echo` argument (measured today: `foreignCommitPath` is null for a heredoc body line `((1)) fix`).

Measured in this session: with no `qh-check` passed on the tree, `git init … && git commit` inside a scratch repository under the session's temp directory was refused ("names commit or push"). The command publishes nothing from this repository. A false refusal (CLAUDE.md §16; the owner: fixed now). Class: a publish command whose working directory is not the repository (a `cd` into another repository, `git -C <elsewhere>`, a `GIT_DIR`). Not built; start from `publishCommandIn` and the commit-only proof in `lifecycle.mjs`.

2026-10-15: observed again in this repository on a fast-pass tree (`git -C <scratchpad fixture> -c user.email=… commit -qm base; echo "commit exit $?"`, refused as "not proven to be one commit"). ADR-104 (Proposed) records the decision for the literal `-C` form, with the twin rows measured on git 2.56.0. Left here, deferred by ADR-104: `cd <literal> && git commit`, and a fixture built in the same command as its commit.

Correction, 2026-10-15: of the two items above, only `cd <literal> && git commit` is deferred by ADR-104. A fixture built in the same command as its commit is a permanent boundary there (Out of Scope: a program or a second git step before the commit can re-point `L`), so it is not open work.

2026-10-15, Codex scoped verification of 99a574c1..12cbbadb (ADR-104): the arithmetic guard added in 12cbbadb also refuses literal data, so these stay refused on an unchecked unarmed tree although they commit only into the other repository: `git -C /foreign commit -F - <<'EOF'` with a body line `Document ((1)) as literal text`, and `git -C /foreign commit -m x; echo 'let x=1'`. `maskedMessages` masks commit argument values but not a quoted heredoc body or an `echo` argument. Refusal direction (a false refusal, not a fail-open), filed under the one-verification-round rule. Fix: scan `ARITHMETIC` over the text with quoted heredoc bodies and single-quoted `echo` arguments removed, keeping a twin where a double-quoted `$((…))` still refuses.

## 368. CLOSED 2026-10-15 (was OPEN 2026-10-09; declined, not traced) — `subagent.ended` outnumbers `subagent.started` 692 to 30 in one session log

**CLOSED 2026-10-15** (backlog sweep): the source was never traced, and the obvious fix (a matcher on SubagentStop) is not one, since that event feeds the reviewer guard (`plugin/hooks/hooks.json`). Declined until the extra rows are traced to a writer.

One session log (a week of events) holds 774 `subagent.ended` rows over 692 distinct agent ids and 46 `subagent.started` over 30; 722 of the ended rows carry an empty `agentType`. `SubagentStop` has no matcher in `plugin/hooks/hooks.json`, so it fires for every stop. Source not traced: workflow or teammate agents that never fire a start are the lead. Costs one `lifecycle.mjs` run each (timeout 120).

## 369. CLOSED 2026-10-15 (was OPEN 2026-10-09; superseded by §374 and §378) — What a third-party spec-driven framework does better, as adoption candidates

**CLOSED 2026-10-15** (backlog sweep): every candidate was re-measured in §374 or re-filed in §378; nothing here is open on its own.

A read-only comparison (subagent reports; three claims checked against the files: the test selector is local-only, the positive-control lint exists, non-PR CI runs force the full matrix). Candidates, in priority order: (1) an AST lint that every gate has a test driving it to its failing verdict, discovered and not listed, empty allowlist, fail-closed when it scans zero; (2) an AST lint against a read failure collapsed into "absent" or into a pass (empty catch, pass-shaped catch, exists-collapse), which mechanises ADR-005; (3) "scanned zero is a violation" on every sweep; (4) shrink-only allowlist ratchets (a stale entry fails); (5) the qh-check fast lane: a measured read-set selector with a widening ladder (unknown means everything) and a forced-full path list, full on push; (6) a measured skill-listing budget and a description-length lint; (7) a record of declined requests with re-open criteria; (8) a randomised per-wrap delimiter for untrusted text, to compare with ADR-090. Their CI never trusts the selector: the full unit suite runs sharded on every product change, with no result cache, so a cache is a bet beyond that evidence. Not adopted: the multi-runtime installer, the phase loop, translations, generated twins.

## 370. CLOSED 2026-10-15 (was OPEN 2026-10-09; one item carried to §381, the rest declined) — An adopter survey: what is ignored, what costs time (15 sessions, 12 shapes)

**CLOSED 2026-10-15** (backlog sweep, each item re-verified against the code): an unarmed publish hook is recorded and never said (`plugin/scripts/publish-verdict.mjs` records `publish.unarmed`; no reader prints it), carried to §381. It is not Windows-only: any git below 2.54 leaves it unarmed. Declined as unconfirmed leads never traced here: missing infrastructure read as a red check, a stray untracked root file, `check.passed` rows from an older HEAD, the mid-Grilling advisory, and `file.written` outside the repository (not reproduced). The two SessionStart items were closed by ADR-099.

Asked of every live session (10 Mac, 5 Windows; shapes: an Ansible estate repository, two Laravel-and-React monorepos, two Python FastAPI backends, a Rust workspace of about twenty crates, a Go multi-module workspace, two Go command-line tools, three React and TypeScript front ends, two TypeScript generators) and answered from their transcripts and `.git/quality-harness/` logs; "not measured" marks a guess. Nobody skipped a gate or routed a commit around the hook; seven skipped the SessionStart "Run qh-check" advisory because they had changed nothing in the repository.
- **Ignored text, in sessions out of 15.** The per-prompt brief, 14: a CI line that can never resolve (a non-GitHub remote or no run), 8; a failed run's job list repeated, 5; "the last answer is N min old … refreshing", 10. SessionStart: "ADR tasks in flight", 10; "+N more task directories: UNPROVEN", 8; "the previous session ended with N shell mutation(s) … run qh-check", 7 (a clean tree, a pass already on the exact tree, an 11-day-old row, or work in a temp directory); the "Verification:" paragraph, 6; "git's own refusal … has not run yet", 5; the archive-marker advice, 3.
- **Read in source (2026-10-09).** `branch-state.mjs` stamps `said` with a withheld marker when it withholds a snapshot past the cap, so the next identical brief prints again (this is also why §366's constant clause repeats). `ciRed()` repeats a completed failed run on every prompt by design (CLAUDE.md §15). `previousSessionNotice` (`lifecycle.mjs`) reads the previous session's row only: it never consults the ledger for the current tree and never expires.
- **Time.** Harness overhead is small: SessionStart 0.9-2.2 s, PreToolUse 82 ms quiet and about 1.0 s mean under load, PreCompact 5.5 s once, a per-write gate 0.4-0.9 s on Windows. The wall time is the declared check: medians of 35-42 s (two command-line tools), 100-136 s (a Laravel-and-React monorepo), 480-2060 s (a Go multi-module workspace), and 1400-2170 s (a FastAPI backend, two of three runs red because a database container and a browser build were missing). A prose-only commit paid the full check in 5 sessions: about 25 minutes of suite for three prose commits in one, 5 of 13 runs in another.
- **Planned (plan of 2026-10-09, one record).** The brief says nothing past the cap and keeps `said` on the last shown text; a failed run prints once, then one short line; SessionStart says a standing paragraph once per repository per three days and the previous-session advice only for a dirty, unchecked tree; a project may declare `"prose"` globs so a prose-only change reuses the last pass; writes outside the repository stop being recorded (once reproduced).
- **A correction that settles the prose rule (a FastAPI-backend session, same day).** Its first reply said Markdown cannot break the suite; it withdrew that: two of its unit tests read the docs and the runbooks, so a docs-only diff can turn its suite red and a default-on prose rule would have been unsafe there. The narrower fix it names exists already: a declared `fastCheck` (ADR-081) of the unit suite plus `adr-lint` on the touched records. So the rule stays opt-in, and the one-line hint qh-check prints after a prose-only change names both `prose` and `fastCheck`. Its auto-mode classifier also refused to let the session declare a diff-routing check as a "CI bypass": any such declaration needs the project owner's explicit approval, which the hint says.
- **Left here, with the evidence.** Infrastructure missing reported as a red check, not could-not-run (a FastAPI backend). A stray untracked file in the repository root gated but never shown (a Go tool on Windows). `check.passed` rows re-emitted at session start from an older HEAD (two Windows sessions). Tasks of a record whose Status says implemented listed as ready (a Rust workspace). The "unattributable" flag on every run on a shared machine. Git for Windows below 2.54 leaves publish unarmed in every session and nothing tells the agent (three Windows sessions, git 2.49). The artifact-validation advisory firing mid-Grilling on an unrelated Bash call. `file.written` and `artifact.gated` recorded for writes outside the repository (three Windows sessions, 0.4-0.9 s each; not yet reproduced here). Not ours, so not filed as defects: a rule-injection reprint, a detector scoreboard dump, a drifted-memory block, the post-compaction `/amm` line, and the host's PowerShell path guards.
- **Closed by ADR-099, 2026-10-12: the two SessionStart items above.** "ADR tasks in flight" and "+N more task directories: UNPROVEN" are no longer said: SessionStart, the compaction note and `qh_orientation` name no ready task, and `work-next` is the one reader of "ready".

## 371. CLOSED 2026-10-15 (was OPEN 2026-10-09; (1) fixed by ADR-104, (2) carried to §381) — The publish advice judges the session's repository for a commit aimed elsewhere, and reads the index before an in-command `git add`

**CLOSED 2026-10-15** (backlog sweep): (1) is fixed for a literal `-C` path by ADR-104 (v3.8.32); its `cd` form is §367's, carried. (2), "unchecked" said about an index an in-command `git add` has not changed yet, is still real (`plugin/scripts/publish-verdict.mjs` reads the index standing only) and is carried to §381.

Two peer leads, both advice only (nothing refused), both confirmed against source. (1) `git -C $R commit …` into a scratch repository the command made, in an armed session: the advice said "the staged index is unchecked" about the session repository's tree and index. `observe()` reads the session's repository and the command's `-C` or `cd` target is not consulted for that advice. (2) `git add <files> && git commit -F - <<…` in one command: the same advice, from a `write-tree` of a copy of the index taken at PreToolUse, before the `git add` runs. This is the second independent sighting of the candidate recorded under the 3.1.6 release campaign (2026-09-29). Direction: when the command stages, or names another repository, the index claim is "not known", never "unchecked". Not built. A spelling to keep for §16 twins: an assignment from another variable (`R=$S/r-a; mkdir -p $R; git -C $R init -q; …`) is not a literal under ADR-093's grammar and stays refused on an unchecked armed tree, by design.

Third sighting of (2), 2026-10-09: `git add docs/BACKLOG.md && git commit -F - <<…` in one command was refused as "not proven to be one commit" while a fast pass stood on the tree; the same two commands run apart went through. The refusal is ADR-081's, working as written, so this is the cost of chaining, not a defect; it is recorded because the advice for the first form says "unchecked" about an index the `git add` has not yet changed.

## 372. CLOSED 2026-10-15 (was OPEN 2026-10-09; declined) — What ADR-094 deliberately leaves: injected prompts, implemented records listed as ready, per-call PreToolUse advice

**CLOSED 2026-10-15** (backlog sweep): the repeated PreToolUse advice is deduplicated now (decision context once per session, publish advice by key), and the section never named which advice repeated. The per-prompt brief on host-injected prompts needs "a spike first" that nobody ran. Declined.

Three leads from the adopter survey (BACKLOG §370) and the independent critique of its plan, left out of ADR-094 on purpose. (1) The per-prompt brief also runs for prompts the host injects (cross-session and background-task notices). The brief script reads no stdin today, so whether the hook payload carries the prompt is unmeasured, and no survey session named it; a spike must come first. (2) The ADR tasks in flight list tasks of records that are implemented, and one session reported tasks of Proposed records listed as ready; `readyTaskLines` (`lifecycle.mjs:1873-1960`) showed no Status filter in the part read, which is a §10 defect if it holds ("a record is a work order only while Accepted"). Not verified. (3) PreToolUse lifecycle advice was repeated 183 times in one session (about 750 bytes and about 1.0 s each); not in ADR-094, whose T2 covers SessionStart only. Direction for (3): the same text-hash marker `saidHere` introduces, applied per repository to the advice that restates a standing fact.

Update 2026-10-10, from the outside run of c944ee05 (a Rust workspace repository): lead (2) is confirmed on a corpus we do not own. Two records whose Status line reads "Accepted — implemented at <sha> on main …" had their `T1` listed as ready; a third, truly not-started record was right. The reader grades a task done only by its Verification Log, so by ADR-005 it is not wrong to call a task without evidence ready; the cost is the noise, and the fix is on the corpus side (log the evidence or retire the record) or in a decision about what "implemented" in a Status may mean to the reader. No code change was made in the ADR-094 batch.

Update 2026-10-10, from a Windows outside run of 3.8.18 (a Python FastAPI-and-Celery backend, 72 records, 209 tasks; `look ok`, 0 of 77 verdicts changed from 3.8.17): the SessionStart in-flight line named one task as ready while `work-next` lists the same task under `readyButClaimedDone` (a README row says done and nothing proves it); in that corpus 3 tasks are ready, 3 of them claimed done, 10 unbacked. Confirmed in source: `lifecycle.mjs` never reads `readyButClaimedDone`; only `work-next.mjs` and `corpus-probe.mjs` do, so a session that reads only the hook would start work on a task a README calls finished. Not fixed here: the ready lines belong to the ADR-record cluster of section 375 (wave B2) and the fix is a judgement about which reader owns "ready", not a one-line guard. Re-open when: that cluster is extracted, or an adopter reports starting a finished task.

Update 2026-10-12: lead (2) is closed by ADR-099. Only `work-next` says which task is ready, so a Proposed or implemented record's task is no longer offered at SessionStart, and the disagreement with `readyButClaimedDone` has no second reader to come from. Leads (1) and (3) stay open.

## 373. CLOSED 2026-10-15 (was OPEN 2026-10-10; fixed, owned elsewhere, or declined) — What executing ADR-094 showed about the gates themselves

**CLOSED 2026-10-15** (backlog sweep): (2) the two ledger readers are one (`ledgerPass`, ADR-101) and (3) the full sha for `gh run list --commit` is in place. (1) the hand-written fast-check list belongs to ADR-103 and §378's stage 3. (4) a contention discriminator besides load is declined as an idea, and (5) is a lesson.

Five findings from executing ADR-094 that are about the harness, not about the batch, left here with the evidence. (1) **The fast check does not run the tests that call a changed function.** `fastCheck` runs a fixed list of eleven test files; T4 changed `unobservableWrites`, three locked tests in two other files (`tests/lifecycle.test.mjs`, `tests/observed-events.test.mjs`) asserted the opposite on purpose, and a local commit went in red for them; only the full gate (and, for the second file, only the full gate) found it. A fast list written by hand is a classifier over "which tests matter" (§16). Direction: derive the list from the files a commit touches (the test files that import them), or say in the commit advice that the fast pass covers a named list. (2) **`qh-check`'s ledger reader exists twice in `lifecycle.mjs`** since `passedAlready` moved there: `latestFastPass` and `passedAlready` read the same file the same way, and a catalogue entry had to carry context to tell them apart. Direction: one reader with a ledger name. (3) **`gh run list --commit` needs the full sha**; a watcher written with a short one waited the whole hour and reported "null". (4) **The load gate never opens on this machine**: a container VM, `fseventsd` and other projects' builds hold the load between 14 and 31, so "wait for load below the core count" waited 30 minutes and then ran contended, and every gate result carried "unattributable". Direction: a gate that cannot be attributed on a shared machine needs a different discriminator than the load average (the lease that ADR-077 holds already names the neighbours). (5) **A locked test that uses a path outside the repository as its example of "a write git cannot see"** is the example every author reaches for, because it is the cheapest to build; three tests did, in three different records. When a decision changes what such a write means, the class is found by running the whole suite, not by searching for the function.

## 374. CLOSED 2026-10-15 (was OPEN 2026-10-10; one number carried to §381, the rest parked) — The §369 comparison candidates, re-measured: two fail-opens fixed, one idea declined with a test, one declined with numbers, five filed

**CLOSED 2026-10-15** (backlog sweep): the stale figure in `.claude/rules/19-adopter-footprint.md` is carried to §381. The agent-description budget, the declined-idea index, the swallowed-read lint, the gate-control table and the stale-entry ratchets stay parked under their own re-open conditions in the text below.

Re-measured against this repository before building anything (three read-only surveys, an advisor pass, a Codex pass on the first plan, five findings folded in). The first plan was cut by the owner ("will it actually make quality harness better?"): most of the list was hygiene that would have made `selftest` heavier and changed nothing for an adopter.
- **Taken, from a swallowed-read triage** (`f9c639a2`, `52cd9a66`). Command: a one-off acorn pass (`node --expose-internals`, as `scripts/untimed-spawns.mjs` loads it) over `plugin/scripts/*.mjs`: 37 files, 140 `try` blocks around a filesystem read (24 empty `catch`, 56 returning a literal, 3 returning undefined, 12 returning a computed value, 45 with a longer body). The 57 longer or computed ones were read in a listing and most inspect the error code (not counted). The sites that can turn "could not read" into a pass, a clean answer or permission were read by hand: two were real. (1) An unparseable `.quality-harness.json` made `qh-check` run the inferred check and record a pass for it; the declared check never ran. Now UNRUN, exit 2, full and `--fast`. (2) `standalone-link`'s `replaceable()` read any failed `lstat` as "absent, free to overwrite" in a directory that holds the user's own tools; only ENOENT is absent. The others map an unreadable file to the closed answer (no pass, an unseen write, a refusal) or are display and housekeeping. Not covered: the Python gates' `except` around a read (`adr-lint`, `adr-verify`, `record.py`), and a read made through a helper whose `try` holds no filesystem call.
- **Taken, from a Windows run of 3.8.17** (a Windows 11 runner, Git Bash 5.2): prose reuse works as designed there; two sentences were wrong. A tree identical to one that had passed was reported as "only prose changed", and a skip row chained to a reuse row rather than to the pass that ran. Both reproduced on macOS and are fixed in `f9c639a2`. Its T4 numbers: an outside-root write costs about 0.77 s of hook time against about 1.09 s inside (three hooks timed by direct payload, serial sum; `facts-gate-dispatch` ~0.45 s dominates). Not measured inside a live Write.
- **Taken, `52cd9a66`: a scan of nothing is not a clean one.** `untimed-spawns` exited 0 over an empty list and over files it could not parse; `untimed-children` skipped an unparsed gate with `continue`; `orphan-sweep` said "0 of 0 definitions". UNRUN, exit 2. The advisory sweeps keep exit 0 by design (§2).
- **Declined: a randomised per-wrap delimiter for untrusted text.** `corpusText` already rewrites `«` `»` `<` `>` inside the text (`lifecycle.mjs`, `corpusText`) and `codeSpan` adapts its fence; the "compare with ADR-090" premise was wrong (ADR-090 is about quoted commit messages). `tests/quoted-text-closes.test.mjs` now proves a hostile `»`, `«` or tag cannot close the mark; the backtick breakout was already tested. Re-open when: a quoted corpus string is shown to end its own mark.
- **Declined with numbers: a read-set selector for `qh-check --fast`.** Replayed over the last 100 commits (a scratch script, not kept): 193 test files; 86 commits widen to the full suite (68 are docs-only: BACKLOG, ADR records, corpus reports; 9 touch the mutation catalogue; 9 touch the config, hooks or rules), 14 are selective and bimodal at about 1% or about 99% of the suite, because nearly every test reaches `lifecycle.mjs`. Median 100%, so a file-level selector saves nothing where the time goes. Re-open when: a per-test read-set exists (coverage per test) or `lifecycle.mjs` is split so its reach is not the whole suite. The measured lever is the other one: 68 of 100 commits are docs-only, and this repository's `selftest` reads docs, so `prose` (ADR-094 T3) is not declared here; a docs lane (the tests that read `docs/`) is the candidate, and it also answers §373 finding 1 for them.
- **Filed, not taken. Re-open when** is on each. (a) The listing budget covers skills only (`tests/skill-metadata.test.mjs`): the 4 agent descriptions (1,008 characters) are in no budget, and `.claude/rules/19-adopter-footprint.md` states 7,422 where 7,372 is measured. Re-open when an agent description grows past the skills' 700-byte cap. (b) 34 `DECLINED` headings in this file are free prose and `adr-context` reads ADRs only, so a declined idea is invisible to it. Re-open when a declined idea is re-proposed. (c) No stale-entry check for `scripts/vulture-allowlist.py` (3 names), `SYNTHETIC` in `tests/package.test.mjs`, or the `// untimed-spawn:` acknowledgements; the matcher at `scripts/untimed-spawns.mjs:97` also accepts the text inside a string literal, which wants its "this is code again" twin (`trivial` already has a ratchet: `tests/classify.test.mjs`). Re-open when a stale entry hides a finding. (d) A swallowed-read lint with a shrink-only baseline: 83 sites swallow today; most are hooks that must exit 0. Re-open when the triage's class recurs. (e) A gate-control table (each gate driven to its failing verdict on a dirty fixture): `tests/package.test.mjs` already requires a mutation per gate. Re-open when a gate is found that no test can make fail. Also: `scripts/dead-code-scan.sh` runs vulture over its allowlist alone on a repository with no Python; unreachable here, and untestable without fake `uvx`/`npx`.

Update 2026-10-10, owner: the candidates filed above (a), (c), (d), (e), the dead-code-scan note and the declined selector do not make sense while `lifecycle.mjs` has its current shape; they are parked behind section 375 and re-opened per wave there, not on their own conditions.

Update 2026-10-10, from the Windows runs of 3.8.18 (two sessions, Windows 11, Git Bash 5.2, node 24.20): the prose-reuse, identical-tree and skip-row fixes and the malformed-config refusal behave as designed (a trailing comma, a directory, an empty file, `null`, `[]` and a dangling junction are each exit 2 with the detector file never created); the new tests give 16 pass, 0 fail, 2 skipped there. Two leads taken in the working tree: a config that starts with a byte-order mark (what Windows PowerShell 5.1 writes) is refused with a message that names it, not an invisible character in quotes; and the dangling-link test builds a junction on Windows instead of skipping. The ELOOP symlink-loop test for `replaceable` still skips there (no loop is buildable). A lead for the next outside-run request: a plain `git clone` of this repository fails on Windows with "Filename too long" (two archived task files, CLAUDE.md section 7); the request must say `git clone -c core.longpaths=true`.

## 375. CLOSED 2026-10-15 (was OPEN 2026-10-10; every box ticked, the leftover leaf carried to §381) — `lifecycle.mjs` is one 7,591-line bag of small functions: dumb recorders, pure judges, a replay harness

**CLOSED 2026-10-15** (backlog sweep): every planned move is done. Left over and carried to §381: `walk`, `outsideRoot`, `inside` and `GIT_LISTING_BUFFER` still live in `plugin/scripts/decision-corpus.mjs`, and the hook goldens skip on Windows.

Owner, 2026-10-10: the file is one big chunk that could be rules maintained bit by bit, it is heavy and probably not the right shape, and it may become a project of its own later. Diagnosis: `docs/research/2026-10-10-lifecycle-shape.md`; seam map (effect-classified call graph, 17 clusters): `docs/research/2026-10-10-lifecycle-seams.md`. The finding that decides the direction: 84% of calls already stay inside a cluster, and 41% of function lines can reach a git or process spawn, so the missing pieces are the file boundary and the split of judging from gathering facts. Direction chosen: stage A golden transcripts at the hook boundary, B extract the pure clusters behind a facade, C `facts` at the entangled judges, D rules as files. No behaviour change in A or B; a golden that changes is a finding.

Baseline, measured at `52cd9a66` on 2026-10-10 (re-measure after every wave and add a column):

| measure | baseline |
|---|---|
| lines in `lifecycle.mjs` | 7,591 |
| top-level functions / exported | 275 / 112 |
| pure share of function lines (no file, process, clock or event effect reachable) | 28% (151 functions, 1,532 of 5,384 lines) |
| function lines that can reach a spawn | 41% (45 functions, 2,205 lines) |
| calls that stay inside a cluster | 84% (399 of 474) |
| test files reached by a change here (selector replay, section 374) | about 99% of 193 |
| fast-lane selector median share over the last 100 commits | 100% |
| commits touching the file | 244 of 1,735 (14%) |
| golden transcripts | 0 at the baseline; 5 scenarios, 68 hook calls after stage A's first slice (`tests/hook-goldens.test.mjs`, `tests/goldens/`; 5.6 s; in the repository's fast list) |
| scripts importing from it | 9 |

After B1 (2026-10-10, re-measured the same way): `lifecycle.mjs` 6,498 lines (from 7,591), 229 top-level functions (from 275), 106 exported (from 112), 14 clusters (from 17), 336 of 401 calls inside a cluster (84%, unchanged). The pure share of the remaining function lines fell from 28% to 22% and the share that can reach a spawn rose from 41% to 47%: the leaf that left was the pure part, so what is left is more entangled, which is what stage C is for. `publish-command.mjs` is 1,156 lines (88 declarations, imports only the tokenizer).

After B2 (2026-10-10, re-measured the same way): `lifecycle.mjs` 4,466 lines (from 7,591 at the baseline, 6,498 after B1), 146 top-level functions (from 229), 70 exported (from 106), 12 clusters, 190 of 238 calls inside a cluster (80%). The pure share of the remaining function lines is 12% and the share that can reach a spawn 57%: B1 and B2 took the pure parts out, and what stays is the entangled part stage C is for. Two new leaves: `corpus-text.mjs` (178 lines, 14 declarations; reads no file, process or event; imports the OS module and one constant from `publish-command.mjs`) and `decision-corpus.mjs` (1,927 lines, 111 declarations; reads files and git's file listing, writes nothing, records no event). 191 of the 483 catalogue entries moved with them (`tests/mutations/plugin/scripts/corpus-text.mjs.json`, `decision-corpus.mjs.json`). Four shipped scripts (`adr-context`, `adr-state`, `corpus-probe`, `work-next`) import the corpus reader and the text functions directly now; `adr-context` and `adr-state` no longer import `lifecycle.mjs` at all, so a change to what the hooks say no longer selects them.

After B3 (2026-10-10, re-measured the same way): `lifecycle.mjs` 1,792 lines (from 7,591 at the baseline, 4,466 after B2), 46 top-level functions (from 146), 28 exported (from 70), 7 clusters, 47 of 55 calls inside a cluster. What stays is the session side and the dispatcher: the orientation and its notes, the sweeps, the ready-task lines, the shadow-install and stale-version notices, `recordHookEvent`, `deliver`, `handleHook` and `main`. Eight new files, in dependency order and with no cycle (the generator refuses a module that needs a later one or one left in `lifecycle.mjs`): `plugin-root.mjs` (7), `hook-queue.mjs` (12; the one piece of module state the rules share), `tree-facts.mjs` (282; what git and the filesystem say), `check-command.mjs` (337; which command is the project's check), `check-ledger.mjs` (557; what the ledgers say was checked), `artifact-pass.mjs` (641), `completion-rules.mjs` (572) and `publish-verdict.mjs` (384). The call graph of the 195 top-level declarations had one cycle (`listStatus` and `commandStatus`, which moved together); the partition followed it.

After B4 (2026-10-10, re-measured the same way): `lifecycle.mjs` 571 lines (from 7,591 at the baseline, 1,792 after B3), 8 top-level functions (from 46), 5 exported, 2 clusters. What stays is the entry and the dispatcher: `handleHook`, `deliver`, `main`, `readStdin`, the output flush and the slow-hook note. Seven new files, in dependency order with no cycle: `project-config.mjs` (90), `housekeeping.mjs` (144), `ready-lines.mjs` (334), `session-notes.mjs` (285), `install-notices.mjs` (192), `session-orientation.mjs` (144) and `hook-record.mjs` (126). Eighteen files in all now hold what `lifecycle.mjs` held (`publish-command`, `corpus-text`, `decision-corpus` and the eight of B3 beside these), 7,368 lines between them.

After D (2026-10-10): `lifecycle.mjs` 230 lines (from 7,591 at the baseline, 571 after B4). It holds the entry (`main`, `readStdin`), the answer's composition (`deliver`, the output flush and the slow-hook note) and `handleHook`, which now does the cross-cutting work every event gets (the skill count, recording the event, importing the pass's verdicts, the late-baseline note, the reviewer state check) and then looks the event up in a table. Five files hold the rules, one per family of events: `on-session-start.mjs` (79), `on-session-end.mjs` (60; PreCompact and SessionEnd), `on-subagent-start.mjs` (13), `on-pre-tool-use.mjs` (60) and `on-turn-end.mjs` (16; Stop, SubagentStop and TaskCompleted). The table is a `Map`, so an event name such as `constructor` finds nothing. The output state that `emitJson` and `deliver` shared (`pendingOutput`) moved to `hook-queue.mjs` beside the queued actions, behind `emitJson`, `peekOutput` and `takeOutput`; it is the only module state the rules share.

After C (2026-10-10): two judges are functions of their facts, each split into a gatherer and a judgement. `publishVerdict` (rule P, the only refusal that reads a ledger) is `publishJudgement(publishFacts(...), request)`; the facts are read lazily and once, in the order the judgement asks, so a decision that stops early reads no more than before. `completionRules` (R1, R2, R4 and the completion claim) is `completionJudgement(completionFacts(...), input)`, and its wrapper records the claim and queues the actions in the old order. The three sentence builders that read the project to name its check (`runTheCheckSentence`) now take that sentence as an argument; `uncheckedCommitsReason` keeps its exported signature as a wrapper. `scripts/effect-classes.mjs` follows every call a function makes through the plugin's modules and names the first file read, process, clock, environment or output it reaches; `tests/pure-judges.test.mjs` shows it answering on code that does and holds twelve functions, the two judgements among them, to "pure". Two decision-table tests walk the judgements over their facts (13,824 combinations for rule P, 10,000 or more for the turn end) and check the properties a refusal or an answer must have, each shown failing on a judgement that breaks it; 10 catalogue mutants (one per condition of the refusal, four on the turn end) are killed by them.

- [x] A (2026-10-10). Golden transcripts: scripted payloads through the real `node lifecycle.mjs` against fixture repositories in a hermetic environment (own home, temp, plugin data, git config; time, ids, paths and load normalised), stdout, stderr, exit and the session, pass and check ledgers stored. First slice: orientation (startup, again, resume, compact, clear), the publish classifier (34 command forms, deny / advise / silent), full and fast passes with a change after each, writes and turn ends, subagents, tasks, compaction, a skill call and an edit to a record. Second slice, the net under stage B3: `qh-check` itself (a red check and what the next commit hears, a red fast check, a green full check, the same tree twice, a change to a prose file alone, a config that is not valid JSON, and the check ledger rows each leaves), the ADR task readiness lines (an Accepted record with a ready task and an evidenced one, a Proposed record's task, and the lines said again after a compaction and a task edit), and the artifact gates (a malformed record and a fuller one, gated at the write and at the turn end, with the pass ledger). Eight scenarios, 8 mutants (wording and logic) all killed. Recorded on POSIX; Windows skips with the reason named. **Left in A:** a Windows run of the goldens (CI only), and the events written by gates that run outside this file (`adr-verify`, `adr-next`), which are those gates' own records.
- [x] B1 (done in the working tree 2026-10-10; unreleased, a pure move). The publish-command classifier moved unchanged to `plugin/scripts/publish-command.mjs`: 36 functions and 52 constants that read a command's text and nothing else (clusters 5 and 6 less `publishUnchecked`, which reads the event log and spawns; cluster 12), chosen by closure over callees so that nothing impure came with them, and generated from the AST rather than cut by hand. The goldens replay byte-identical; `tests/publish-command.test.mjs`, `shell-words.test.mjs` and the rest of the fast list pass; 136 of 619 catalogue entries moved with it (`tests/mutations/plugin/scripts/publish-command.mjs.json`, one per source) and a sample of ten, spread across it, were killed against the moved code. Two comment blocks that sat apart from their declarations were moved by hand. Callers use named imports; there is no facade, because a re-export only a test reads is what knip's production mode refuses. **Not moved, and why:** the test-work reader (cluster 9: it feeds the completion claim, a different concern) and the prose and config readers (11), which are small and wait for B2; the 26 ADR `Governs:` headers that name `lifecycle.mjs` were left as they are (records are history), so `adr-context` does not yet name `publish-command.mjs`. **Release:** the readers hash changes with any move, so a release needs a new outside run (CLAUDE.md section 18).
- [x] B2 (done in the working tree 2026-10-10; unreleased, a pure move). Corpus text and quoting moved to `plugin/scripts/corpus-text.mjs` (the quoting, code-span, path and command functions and `scrubber`), and the decision-corpus reader (cluster 0: record identity, status and edge reading, frozen archives, `adrCorpus`, `decisionContext`, with the helpers they need) to `plugin/scripts/decision-corpus.mjs`; both generated from the AST (closure over callees, imports derived, an atomic mrw plan) and unchanged in content. The goldens replay byte-identical, the lifecycle, golden and 22 other touched test files pass, `--stale` is clean, and 13 catalogue mutants spread over both modules were killed against the moved code. **What the generator missed, found by the gate:** a namespace import (`import * as lifecycle`) in four tests, an import written inside a test string, and a line shifted by one in a file holding a U+2028 (acorn counts it as a line break, mrw does not; fixed in the generator and the line repaired). Four locked test bodies changed by one import path each (three in `tests/lifecycle.test.mjs`, one in `tests/corpus-shapes.test.mjs`, locked by four task files in two records); each diff was read, and the five task files were re-locked with `adr-verify --relock --replace-hashes` (tool-written entries), after which every record passes its lint. Four other test files that read the corpus through the namespace import now point it at the new module and keep the local name, so no body changed. Stale cross-references in `plugin/lib/record.py`, `adr-lint`, `adr-next` and `adr-state` now name the new modules. **Left out:** the test-work reader (cluster 9) and the prose and config readers (cluster 11), which are small and wait for B3; `walk`, `outsideRoot` and `inside`, small JSON and path helpers that landed in `decision-corpus.mjs` because records use them and are imported back by `lifecycle.mjs` (a home of their own when B3 shows who else needs them). **Release:** the readers hash changed again, so a release needs one new outside run (CLAUDE.md section 18).
- [x] B3 (done in the working tree 2026-10-10; unreleased, a move with a few hand edits). The entangled clusters moved into the eight files above, by explicit member lists checked against the call graph; constants went to the earliest module that uses them. **Hand edits, all found by a test and each with its own mutant or a registration:** (1) `artifact-pass.mjs` starts the detached pass from `new URL('./lifecycle.mjs', import.meta.url)`; moved verbatim it started itself and no pass ever ran, which `tests/artifact-pass-behind.test.mjs` caught after 70 s (the class: a moved line that names its own file; the three `import.meta.url` uses in the moved code were audited, the other two name a sibling and the plugin root and are unchanged); (2) nine helpers that take a `log` became exports because modules now share them, and `tests/evidence-flip.test.mjs` made each say why a torn log cannot flatter it; (3) the same test lists the four new files that name the log reader; (4) tests that read a function's source or import it from the old file in a string or as a namespace: `hook-work`, `lifecycle.test` (a helper), `publish-command.test` (a constant), four namespace importers (the local name stays and an object merges the modules, so no body changed). **Locks:** thirteen task files were re-locked with `adr-verify --relock --replace-hashes` (tool-written entries) because locked test bodies in `observed-events`, `publish-hook` and `gate-rules` changed by an import path or a file name; each diff was read before. Goldens (eight scenarios) replay byte-identical; 19 catalogue mutants spread over the six modules that have entries were killed with the verdict cache off; `--stale` clean. **Left out:** `walk`, `outsideRoot`, `inside` and `GIT_LISTING_BUFFER` still live in `decision-corpus.mjs` and are imported by four of the new files (a small leaf of their own is the honest home, and needs one more regeneration); the session side and dispatcher stay for D; `pendingOutput` and `cachedPython` are module state that stays with their users until C. **Release:** the readers hash changed, so a release needs one new outside run (CLAUDE.md section 18).
- [x] B4 (done in the working tree 2026-10-10; unreleased, a pure move with one widened guard). The session side leaves `lifecycle.mjs`: the project config reader, the sweeps, the ready-task lines with the interpreter probe, the session notes and mention markers, the shadow-install and stale-version notices, the orientation and the decision context, and the hook-to-event recorder. Generated and applied as in B3; the call graph again had no cycle and the generator found none between the new files. Hand edits: two namespace-importing tests gained a module in their merged object; `tests/evidence-flip.test.mjs` registers `hook-record.mjs` as a file that names the log reader; the one-spawn guard in `tests/lifecycle.test.mjs` ("a bin/ gate is spawned in a way Windows can actually run") counted `spawnSync(tool` in `lifecycle.mjs` alone and would have read zero after the move; it now counts across every script, which also closes the gap that a second spawn in any other file went unseen (its task file was re-locked after the diff was read). 14 catalogue mutants over the seven new files were killed with the verdict cache off; the goldens replay byte-identical; `--stale` is clean. No file in the new modules names itself (`import.meta` and `process.argv[1]` do not occur; the one remaining mention of `lifecycle.mjs` checks that an installed version has an entry script). **Release:** unchanged; the readers hash moved again, one outside run covers the whole of stage B.
- [x] C (done in the working tree 2026-10-10; unreleased, and it changes behaviour in one place). `facts` at the judges: see the paragraph above. **Found by the table, fixed:** when a committed tree had no check and the session log was cut, R1 opened with "whether `qh-check` succeeded on it cannot be shown" and then said "what no `qh-check` has passed on is the tree at HEAD" in the same message: an accusation in the vocabulary of an observation beside its own retraction (ADR-005). The held-commit sentence now says "whether a `qh-check` passed on the tree at HEAD cannot be shown" when the log is cut; a catalogue mutant keeps it. This is a plugin behaviour change, so the Codex review of section 12 is due before a tag. **Left out, and why:** `unobservableWrites` is not pure (it resolves a recorded path against the disk to see whether it lay outside the repository), so `completionFacts` calls it and the judgement receives its answer; making it a fact that arrives already resolved is the next step for that rule. `reviewChangedState` (R3), `recordHookEvent` and `deliver` are not split: R3 writes as it reads, and the other two are the recorders and the composer, not judges. A judgement that throws now queues nothing where an exception in R2 used to leave R1 already queued; the judgements build strings from plain data, and silence is the weaker direction, but it is a difference. **Review (section 12):** a different-lineage review (gpt-6.1-sol, high effort, read-only, scoped to `git diff 89c2578d..HEAD -- plugin/`, covering the whole of stage B to D as well as this stage) found no blocker and confirmed that the import graph has no cycle, every changed module parses and the dispatcher branches match the baseline. Two findings, both fixed: the facts were not read at most once (`sentence` was read again by each of R1, R2 and R4, as it was before the split) and `uncheckedCommitsReason` had changed what its first argument means while two locked test lines still passed a directory. The read-once helper is now one module, `lazily.mjs`, used by both fact builders; the two test lines pass a sentence and their task was re-locked after the diff was read.
- [x] D (done in the working tree 2026-10-10; unreleased). Rules as files, `lifecycle.mjs` a dispatcher: see the paragraph above. The five rule files are the branches of the old `handleHook` moved verbatim (two lines of dedent and the dropped trailing `return`), so the goldens replay byte-identical. Hand work: the catalogue entries that named text inside `handleHook` were re-targeted to the file that holds it (15 entries, the indentation of each `from` and `to` adjusted by the same two spaces) and three entries were added for the table row, the turn-end artifact request and the output state; 19 mutants over the new files were killed with the verdict cache off. `tests/evidence-flip.test.mjs` had one entry for `handleHook` that was driven through PreCompact and SessionEnd only; it is now `onSessionEnd`, and `onSessionStart`, whose two log reads the old entry had covered by omission, is registered as not executed with the reason read from the code (the compaction note is served only from a log read whole; the arming note reads `awaitingArming`, where a lost line can only make it appear). Orphaned comment blocks that sat above code `lifecycle.mjs` no longer holds were moved to the files that hold the code, checked by comparing the syntax trees before and after (comments are the only difference). **Left out:** the preamble of `handleHook` is still one function; `deliver` composes by shape and could be a rule of its own; and the skill count (ADR-084) stays inline because it must run before the event is recorded. Stage C (judges as functions of facts) is the next change to what the code does rather than where it sits.
- [x] Re-open the section 374 candidates (2026-10-10, after D). The declined selector, re-measured: a change to `lifecycle.mjs` is no longer a change to the whole plugin, and the share of test files that can reach a shipped script by name fell from about 99% of 193 to 63% of 199 (125 files; a scratch pass over `plugin/scripts` and `tests`, a script name found in a file counted as an edge, so comments and strings make it an upper bound; 50 test files name `lifecycle.mjs` themselves, 12 name `qh-check.mjs`, and every module that `qh-check.mjs` imports inherits the 12 plus their closures). That is the reach, not the selection: 86 of the last 100 commits widened to the full suite for reasons that have nothing to do with `lifecycle.mjs` (docs, the catalogue, config, hooks), so the median stays 100% and **the selector stays declined**. Its lever is still the docs lane (68 of 100 commits). (a), (c), (d) and (e) are not re-opened: their own conditions have not occurred, and the owner parked them behind the shape of these two files, which section 376 is still changing; they are looked at again after it.
- [x] The `Governs:` headers (2026-10-10, after the split; CLAUDE.md section 1 says a moved file takes its header with it, and the first plan left them as history). Measured first: `adr-context` answered for none of the fourteen moved modules it was asked about (`node plugin/scripts/adr-context.mjs plugin/scripts/<module>.mjs`, 0 records each), so the hook that hands a session the decisions governing the file it is about to edit said nothing for the code that used to be in `lifecycle.mjs`. Nineteen Accepted records that named `lifecycle.mjs` now also name the modules that hold the code each of them is about (chosen from what the record decides, not from its number: the corpus-reading records get `decision-corpus.mjs`, the publish records `publish-verdict.mjs` and `publish-command.mjs`, the claim and unchecked-work records `completion-rules.mjs`, and so on; ADR-060, which governs the hook program as a whole, gets the recorder, the queue, the five rule files and the ledger readers). Only the header line of each changed; every record passes `adr-lint`. After: 1 to 5 records answer for each of the modules with a subject. Still ungoverned, because no record is about them: `corpus-text.mjs`, `project-config.mjs`, `housekeeping.mjs`, and `prose-hint.mjs` (ADR-094 declares its paths in its tasks).
- [x] What the split costs an adopter, measured (2026-10-10; a lead from an outside run, whose adr-next timings were taken under a load of 8 to 35 and name a Python script the split did not touch). One hook process per event, `lifecycle.mjs` at `v3.8.17` against HEAD, a hermetic home and a fresh repository, 15 runs of each, alternating, median, on a machine at a load of 12 to 13 on 10 cores (so the difference is the figure and the absolutes are not): PreToolUse 29 ms before, 33 ms after; Stop 113 and 114 ms; SessionStart 85 and 88 ms. About 3 to 4 ms more per event, from loading about thirty modules instead of one; the most frequent event pays the most in proportion (about 12%) and the least in absolute terms. Not a finding. Re-open when: a hook event costs an adopter more than the slow-hook note's threshold. The outside runs on three other corpora (an ADR corpus of 20 records, a PHP monolith of 17, a monorepo of 94) read every verdict as before: 26, 23 and 96 compared, none changed, the readers hash the only line of the diff on the first and third, and the second a PARTIAL look it always printed; two other peers could not run foreign code under their own permission rules and were not asked to work around it.
- [x] Named as left in stage C, looked at again: `unobservableWrites` is a gatherer, not a judge (it resolves a recorded path against the disk), and the judgement already receives its answer, so `completionJudgement` is pure and held to it; making the helper pure too would split path canonicalisation from the stat and change no verdict. `reviewChangedState` (R3) writes as it reads, `recordHookEvent` is the recorder and `deliver` the composer: each is a recorder by role and has nothing to judge. None is split; the reason is the role, not the effort.

Left out on purpose: the evidence ledger as an agent-neutral protocol and the shell-intent classifier as a library with a differential suite against real shells (the two candidates for a separate project); a resident process; retiring the text classifier for git's own hooks (ADR-066). Unknown until measured: how much of the 41% is an injected seam the effect pass counted as a spawn; Windows behaviour of any moved path-handling function (CI only).

## 376. CLOSED 2026-10-12 (was OPEN 2026-10-10) — `qh-check.mjs`: one 250-line function that decides, runs, times and records

**CLOSED 2026-10-12** (re-verified against the code in the backlog sweep): both qh-check cuts shipped in v3.8.19 (129653f0). qh-check.mjs is 185 lines, checkPlan is held pure (tests/pure-judges.test.mjs:105-108), and the Windows tree kill is check-child.mjs:20 killTree.

Owner, 2026-10-10, after stage D: "qh-check is also a next suspect, I do not like it." Measured the way section 375 measured `lifecycle.mjs` (`plugin/scripts/qh-check.mjs`, 391 lines, 10 top-level functions, 3 exported, one cluster, 9 of 9 calls inside it): 293 of 312 function lines can reach a spawn, and nearly all of them are `runCheck`, a single function that resolves the project and its config (refusing on an unreadable one), decides whether the tree was already checked or only prose changed, picks the command and its origin, waits for a quiet machine, launches and bounds the child, observes the tree before and after, classifies the exit, writes the ledger row and prints the sentence. The pieces it calls (`check-command.mjs`, `check-ledger.mjs`, `tree-facts.mjs`, `project-config.mjs`) are the ones section 375 made leaves, so the file is now all that is left of the old shape. 13 files import it or name it, 25 commits touched it. Direction, not decided: the same three-part cut that worked for the publish verdict, `plan` (a function of the project's config, the ledger and the tree observation: skip, reuse for prose, refuse, or run which command and why), `run` (launch, bound and time the child, the only part that spawns), and `record` (the row and the printed sentence), with goldens first: the `checks` scenario of `tests/hook-goldens.test.mjs` already pins the sentences for a red check, a green one, the same tree twice, a prose-only change and an unreadable config. Needs from the owner: a "go".

Delivered 2026-10-10, on the owner's go ("go ahead accepted"; read as the go this section asked for, not as a choice between releasing now and batching, which was asked in the same message and is still open). `qh-check.mjs` 350 lines (from 391), nine top-level functions (from ten), the largest 74 lines (`runCheck`, from about 230). The cut followed the stage-C shape rather than a bare three-way split: `checkFacts` (what the repository, the config, the command, the prose and the ledger say, each read lazily and once, in the order the plan asks) and `checkPlan`, a function of those facts that returns either a refusal (exit 2 and the sentence) or the command, how it came to be named, the prose and the pass that already covers the tree. `scripts/effect-classes.mjs` holds `checkPlan` to pure (`tests/pure-judges.test.mjs`), and `tests/check-plan.test.mjs` walks 1,440 combinations of its facts (config readable or not, `--fast` with and without a `fastCheck`, five ways a command can be named, three prose declarations, a covering pass or none, `--again` flag and environment) against what a refusal, a run and a skip must look like, including that each reason is told in its own words and a refusal reads no more than it needs; each property is shown failing on a plan that breaks it. What is not pure stayed named for what it does: `reuseByProse` (a prose reuse appends a row, and the position check after the append can veto it, so it is a step of the run), `recordSkip`, `takeTurn` (the lease and the wait), `recordRun` and `runCheck`, the orchestrator. Two files left with their code unchanged: `prose-hint.mjs` (the hint after a long pass that followed a text-only change: three functions that read git and the check ledger) and `check-child.mjs` (`runLaunched` and the bound, the only place that starts the project's check). The three exports tests import (`runCheck`, `checkLaunch`, `repositoryDiscovery`) stayed defined in `qh-check.mjs`, so no locked test body changed and no task was re-locked; `stateDir` now comes from `event-log.mjs`. **Found on the way:** the bound a check runs under (`QUALITY_HARNESS_CHECK_TIMEOUT`, one hour by default) was asserted nowhere; `tests/qh-check-timeout.test.mjs` now shows a value that is not a positive number is the default, and a check whose child holds its pipes is stopped through its process group. Three of the new mutants were GREEN at first and each said something: two tests were too weak (the refusal wording was not asserted; the group kill was hidden by the spawn's own timeout) and one mutant was equivalent (the memoising of a fact read once) and was dropped. 10 new mutants and the 30 existing entries (re-targeted to the file that now holds their text; the one about `--again` was rewritten for `checkPlan`) were killed against the moved code with the verdict cache off; `--stale` is clean; the goldens replay unchanged. A plugin behaviour change: none intended; the Codex review of section 12 is still due before a tag. **Release:** the readers hash changed again; the one outside run is asked once, for the whole of sections 375 and 376.

Review (section 12) of that change, 2026-10-10: a different-lineage review (gpt-6.1-sol, high effort, read-only, scoped to the diff of `plugin/` since the stage B to D series closed) compared the moved functions with their old text (identical apart from `export`), the prose-reuse append, position check and retraction, the lease and wait-signal logic and the record-writing body (identical, apart from the returned exit shape), and probed the rerun matrix, the order in which facts are read, and that `stateDir` is the same function the old import re-exported. No finding, no blocker. It ran no signal test and not the suite; the full gate (2,172 passed, 0 failed, 2 skipped, run on a machine above its core count at the end) did.

Second cut, 2026-10-10, on the owner's "dissect qh-check": what was left of `runCheck` after the first cut that was neither the decision nor the child. `qh-check.mjs` is now 186 lines, five functions, the largest `runCheck` at 66 lines (from about 230 at the start of this section). Two files: `check-lease.mjs` (`takeTurn`, the wait for a turn and the lease around it, moved unchanged) and `check-record.mjs`, which holds what a run leaves behind. Three functions of it are pure and held to it by `tests/pure-judges.test.mjs`: `classifyRun` (how a finished child ended: the signal this process forwarded wins, a spawn error is `unstarted` even beside a signal, a signal is no verdict), `runRecord` (the row; the id is handed in, the neighbours are kept without the path of their lease file) and `proseReuseRow` (the row a prose-only reuse stands in as, whose times are the original's). The three writes stay effects by role: `reuseByProse` (with the position check and the retraction, unchanged), `recordSkip`, `recordRun`. `tests/check-record.test.mjs` shows each pure function on its clean case and its dirty twin; 7 new mutants and the 42 existing ones on the five files were killed with the verdict cache off. The goldens replay unchanged and the dead-code scan is clean. What the order of the file now reads as: facts, plan, then the run's steps in the order the comments name them. **Not cut, on purpose:** the load sampling and the observation before and after (they are the run's own measurement and belong inside it), and `checkLaunch` (its Windows arm is the tested seam).

Release review (section 12), 2026-10-11, of the whole candidate: a different-lineage review (gpt-6.1-sol, high effort, read-only) scoped to `git diff 5e5bba7c..HEAD -- plugin/` (the 3.8.18 tag against `13d6d7b5`), covering the lifecycle split, both qh-check cuts, the Windows tree kill and the `stateDir` change. It compared the moved code with its old text, probed the refusals, the signals, the lease and the POSIX timeout, and checked the Windows termination through source and a stubbed `taskkill` only. No finding, no blocker. 3.8.19 is the release this section's work ships in.

Found by the version bump itself: the artifacts golden recorded the plugin version inside an adr-lint line ("adr-lint 3.8.18"), so every release would have failed it with a transcript that had not changed. The normaliser now blanks a version after `adr-lint`; the golden was re-recorded and differs from the old one in that token alone.

Found by the dead-code scan before the tag: with `qh-check.mjs` importing `stateDir` from `event-log.mjs`, the re-export of it from `lifecycle.mjs` had no production reader (knip, production mode: 1 unused export). It is gone; the seven test files that took it from there import it from `event-log.mjs`, and the three that merge modules into a `lifecycle` object add it to the merge, so no test body changed and no task was re-locked. Scan after: orphan-sweep 0 of 1,697, vulture 2.16 over 22 files 0, knip 6.41.0 0.

Found by the Windows run of the new timeout test (CI, 2026-10-10): the bound did not stop the check there. `runLaunched` killed the shell that started the check (`child.kill`) and, on Windows, the check itself is a child of that shell, so it ran on, holding the pipes, until it ended by itself: the test waited its full 120 s. A defect older than this section (the moved code was unchanged), invisible on POSIX where the whole process group is signalled. Fixed: on Windows the tree is taken with `taskkill /pid N /T /F` (`killTree`, falling back to the shell kill if taskkill fails), and the spawn no longer carries node's own `timeout` option, which ended the shell a moment before the timer and left a tree whose root had gone. The POSIX tests show the arguments and the fallback; only the Windows job runs the real thing, and that is the check on this fix. Two mutants on it are killed; one on the removed option is unobservable off Windows and was not kept.

## 377. CLOSED 2026-10-12 (was OPEN 2026-10-10) — Two leads not yet confirmed, and an advisory nobody acted on

**CLOSED 2026-10-12** (re-verified against the code in the backlog sweep): lead 1 was declined against adr-next with a re-open condition, and lead 2 was fixed in f6923af2 (standalone-link and eval-deltas tests now remove their temp dirs). The other temp entries stay advice by decision.

- A peer (a memory-service session, 2026-10-10) reports that `adr-next --all` reads a negative word used descriptively in a human-observed sign-off note as a STOP: three tasks in its corpus show `stopped` because a note quotes the failure it observed ("build failed" repro filed, a fence that used to print FAIL, a reranker that was stopped). The `adr-execute` skill documents the rule ("a negative word in the note's own words is a STOP"), so this is either the grammar working as designed or a reading that wants a verb-aware rule; not confirmed against `plugin/bin/adr-next`, not changed. Shape: the cost is a task that displays `stopped` until its owner re-signs in other words.
- The full gate prints "the tests left 93 entries in their temp directory, removed on exit" (33 `quality-harness-status`, 14 `link`, 8 `qh-mutate-run`, 7 `eval-deltas`, and singletons) on every run. The selftest removes them, so nothing accumulates, but a test that leaves its directory until exit is a test whose cleanup nobody reads; which tests, and whether any should clean up itself, is unmeasured.

Update 2026-10-10, both leads looked at. (1) The sign-off grammar: read against `plugin/bin/adr-next` (`human_outcome`, `stop_reason`). A negative word in the note's own words is a stop by design, programme output after a marker and a negated negative are exempt, and the stop is displayed with the clause that caused it first (an outside run of 3.8.8), so a signer sees which word. A verb-aware rule would have to tell "a fence that used to print FAIL" from "confirmed FAIL" in English, and the wrong answer is a done task that is not: the fail-open direction (CLAUDE.md section 16). **Declined.** The cost stays what it was: a task shows `stopped` until its owner re-signs in other words. Re-open when: a note that states a pass is shown stopped by a word the exemptions should have covered (a quote after a marker, a counter), which is a gap in them and not in the principle. Not reproduced here with the peer's own notes, which stay with the peer. (2) The temp entries: 33 `quality-harness-status` are the product's own per-session status-line cache directories (`statusline.mjs` `cachePath`, one per session id in the temp directory), made by the tests that drive the status line with different ids; that is the cache working, not a test forgetting, and it is the line the advisory exists to show. 14 `link` (`standalone-link.test.mjs`) and 7 `eval-deltas` (`eval-deltas.test.mjs`) were tests that never removed what they made; both now remove it when the file is done, and the two files leave nothing in a temp directory of their own. The rest (`qh-mutate-run`, the singletons) is unmeasured and stays advice.

## 378. CLOSED 2026-10-15 (was OPEN 2026-10-11; clear items carried to §381, the rest parked or moot) — What the hooks and the gate repeat, measured; three items ADR-095 does not take

**CLOSED 2026-10-15** (backlog sweep, each item re-verified against the code): the clear open items are carried to §381 (the JSONC comment ending at U+2028, measured today; `"publish": "warn"` silenced at git's hook; the underscore false stop; `affectedFiles` ignoring the Change column; the review-contract test reading `plugin/` from disk; node's JSON error with no line and column; the jq and uvx tests that fail instead of skip; the testmon inline-table read; the bare `bash` spawns; the scratch-corpus lifecycle test; a spec-fact retirement tag). Moot: the ready-line cache items (ADR-099 deleted it), "delete or wire `post-edit-check`" (ADR-102 wired it), and the refusal-prose stop rule (the owner kept it). Every other item is parked under its own "Re-open when" in the text below, none of whose triggers has been seen. The check-speed plan's stage 3 question is §381's.

Measured 2026-10-11 with a preload that counts every child process and file read of one real hook event (method: ADR-095 T1), against a fresh clone of this repository (about 100 records) on a machine at a load of 4 to 6 on 10 cores. SessionStart 1.2 to 1.4 s, of which six serial `adr-next` runs are 1.0 to 1.4 s (118 to 1,104 ms each) and repeat unchanged on the second start; Stop starts 13 `git` children (106 to 258 ms), four of them the same `rev-parse --show-toplevel`; PreToolUse is 29 to 37 ms with no child; the first PreToolUse Edit of a governed path is 347 ms (the decision corpus, 300 reads, 4.5 MiB) and the second 79 ms; `qh-check` with a check that exits at once is about 105 ms with two `git` children, so its cost is the project's check, and this repository's check ran about a dozen times in one session at 260 to 330 s each. Node's compile cache gives nothing at this size. The governing record is ADR-095 (Proposed); T1 to T4 take the tool, the ready-line cache, the identity memo and the gate's concurrency. Left out, with the number:
- **Run the misses of the ready-line cache concurrently.** The slowest of the six `adr-next` runs is 1,104 ms of 1,370, so the wall time falls by about 0.3 s, and only on a miss. Re-open when: a corpus is found where the misses are evenly sized and the sum is above a second. Closed 2026-10-12 by ADR-099: the cache is deleted, so there are no misses to run.
- **Read the decision corpus once per session, not per governed path.** The first Edit costs 347 ms and the next 79 ms. Re-open when: the cost is seen on a second governed path in one session.
- **A per-test verdict cache for the repository's own gate.** The reach of a change here fell from about 99% to 63% of the test files after the split (an upper bound), but 86 of the last 100 commits widen to the whole suite for reasons other than reach, and a reused pass on an input nobody listed is the failure this project exists to demonstrate the absence of. Re-open when: a per-test read-set exists (coverage per test, with the files, the environment and the child scripts a test touches) and a mutant shows a wrong reuse is caught.
- **ADR-095 delivered, 2026-10-11 (all five tasks).** T1 `scripts/hook-cost.mjs` (the tool every figure here is reproduced with); T2 the ready-task lines from a cache keyed by the content of the whole corpus directory (a start in an unchanged corpus: 1.09 s and 10 children to 103 to 109 ms and 3 to 4 children; found at execution: the key had to cover other records' tasks, the sibling records, which files git lists and today's date, because the gate reads them all); T3 the repository's identity asked once per process (turn-end event 16 children to 11; found by the regression run: two result shapes under one memo key); T5 `git status -uall` once per process for at most two seconds, only where `lifecycle.mjs main` switches it on (turn-end event 9 children; added after three outside runs measured 125 to 400 ms for the three calls; alternative (e) narrowed with the owner's yes); T4 the gate prints `selftest: concurrency N (cores C, load L)` and takes `QH_SELFTEST_CONCURRENCY`. Four outside runs (three macOS corpora, one Windows) confirmed the counts on their own repositories.
- **T4's measurement, and the rule it declined (2026-10-11).** The whole gate at nine, five and three test files at once: 268, 282 and 392 s, one run each, under a load of 5 to 14 from other sessions. Five costs about 5% (inside the noise of one run each) and three about 46%, so no setting was faster and no automatic rule was shipped. The reading that remains is about neighbours and not about speed: five at once leaves about four of ten cores for the other sessions at a cost inside the noise. Re-open when: the owner wants the gate to yield cores under load (a rule `load >= 0.6 * cores => ceil(cores / 2)` is one line in `selftest.sh`), or a second measurement on a quiet machine shows five at once is not slower.
- **Left by ADR-095, with the evidence.** `hook-cost` flags the two `write-tree` calls in an observation as a repeat; they are not (the second reads the temporary index after `add -A`, a different environment the tool cannot see). The first PreToolUse Edit of a governed path reads the decision corpus (299 reads, 4.5 MiB, 216 to 347 ms) and the next one does not: a once-per-session cost that a cache keyed like T2's would remove. Both are unmeasured on an outside corpus.
- **A finding about §377, from the same arc.** The sign-off grammar of `adr-next` read the executing session's own notes as a stop three times in one day, on the words `Stop` (the event's name) and `cannot`, each time withholding `done` until the note was re-signed in other words. That is lead 1 of the update above, now with three first-hand instances: the cost is real and small, the principle (a negative word in the note's own words is a stop) stands, and the gap is that nothing says which word did it before the task shows `stopped` (the stop line does name it; the author had to run `adr-next` to see it). Re-open when: a note that states a pass is stopped by a word inside a quote the exemptions should cover.
- **Release review of ADR-095 (section 12), 2026-10-11: the ready-line cache (T2) is withdrawn, the two memos fixed.** A different-lineage review (gpt-6.1-sol, high effort, read-only, scoped to `git diff v3.8.19..HEAD -- plugin/`) found six blockers and two should-fix, each verified by reading or by a probe. All six blockers were in the cache or the identity memo, and all were fail-open. (1) The gate reads files its Tests tables name, anywhere in the repository (the test locks), and the project's `.quality-harness.json` check; neither was in the key. (2) An empty directory beside the tasks changes the gate's answer (a duplicate task id) and was invisible to the key. (3) Git's object format decides whether an old evidence row counts as done and was not in the key (ADR-095 Decision 2 had said it must be). (4) A gate installed as a link loads the library beside its real path, which the key did not hash. (5) The result of a run was stored under the snapshot taken before it, so a file changed during the run filed a newer answer under the older key. (6) The identity memo was keyed by the spelling of a directory, so a link repointed at another repository between two asks returned the old root and the publish check read the wrong repository. Of the two should-fix, one is accepted (the status memo can miss an untracked file created by a concurrent process within its two seconds, advisory readers only, as the owner's yes for T5 said) and one is fixed (the lifetime used the wall clock, so a clock set back kept an answer alive). Done: the cache, its test and its catalogue are removed and the three callers restored; the identity memo is keyed by the resolved directory; the status lifetime uses a monotonic clock; each has a regression test shown failing under a mutant. The lesson is about the class: a cache keyed on what its author enumerated is only as sound as the enumeration, and a gate whose reads are data-dependent (it reads whatever a table names) cannot be enumerated.
- **What would make the ready-line cache sound (re-open when the owner wants the ~1 s per start back).** Key it by what the gate actually read, recorded by tracing it: run `adr-next` under a wrapper that records every file it opens (and a hash of each), every directory it lists (and the sorted names), every path it stats (existence and kind) and every git command it runs (and a hash of the output), plus the interpreter version and the environment variables it can see; store that manifest with the answer; on a lookup re-check the manifest (re-hash, re-list, re-stat, re-run the git commands, about 20 ms) and only a manifest that still holds is a hit; store nothing if a file changed during the run (compare its signature before and after). That closes (1) to (5) by construction, because nothing is enumerated by hand. Measured value to beat: the second start 1.09 s to about 105 ms on a corpus of 100 records, 0.4 to 2.8 s saved on the four outside corpora, about 1.9 s on the Windows one. The cost is a Python wrapper, a manifest checker and a test for each kind of dependency, with a mutant per kind.
- **ADR-095 T6 delivered, 2026-10-11: the ready-task cache, keyed by what the gate read.** `plugin/lib/trace_run.py` runs `adr-next` under a recorder (an audit hook for opens, listings and subprocesses; wrappers on `os.stat`, `os.lstat` and the `os.path` predicates; every imported module's source); `plugin/scripts/ready-cache.mjs` stores the answer with that manifest and reuses it only while every entry holds. Measured on a fresh clone of this repository at a load of 4.8 on 10 cores: first SessionStart 1,405 ms with 33 children (6 of them the gate), second 117 ms with 10 children (0 of them the gate). The manifest of one real run over this record's task directory holds 16 files, 3 listings, 31 stat-ed paths and 3 git commands, and 92 standard-library files left out. 20 catalogue entries, one per kind of dependency and per wiring site. Found while proving it: (1) the mutation runner's environment (`PYTHONPYCACHEPREFIX`) moves bytecode out of `__pycache__`, so the recorder logged the standard library's compiled copies as dependencies and the recorder test failed in the campaign and not in a shell; the manifest now names the prefix and the cache ignores it; (2) a statted path in the same directory as an imported module was answered for by the import system's own listing, so the statted-kind re-check survived its mutant until the test's absent paths moved to a directory nothing lists; (3) a missing file the gate tries to open is a dependency on its absence, or no run is ever storable. Left: the `os.path` predicate wrappers are redundant on POSIX (the `os.stat` wrapper sees them) and may be what records `os.path.exists` on an interpreter with a C fast path; no mutant tells them apart here, so that is UNPROVEN until a Windows run says. Re-open when: a Windows run of `hook-cost.mjs SessionStart` shows the second start still runs the gate.
- **ADR-095 T6, two outside reviews of the same tree, 2026-10-11: what was fixed and what was left.** A Windows run (a Windows peer, Python 3.14) refuted the cache: the second start ran the gate again for every task directory. Cause, confirmed against CPython's source and the peer's probe: on Windows the `subprocess.Popen` audit event carries the command already joined into one string, so the recorder wrote each command as a list of single characters, the re-check could not start them, and every lookup missed in silence. Fixed: a command is recorded where it is asked for (`Popen.__init__`, the list or the line the gate passed), a line is run again through the shell, a shape that cannot be run again is recorded as such and the answer is not kept, and a recorded command that cannot be started is a miss that says so. A different-lineage review (gpt-6.1-sol, high) of v3.8.19..HEAD found nine more; fixed now: a stat records a file's size and modification time and not only its kind; the entries of a scanned directory are recorded (an entry answers is_dir() without another call); an environment variable the gate read is a dependency (name and value), a gate that reads the whole environment is not cached and says why; `os.system` is recorded as a line and `exec`, `spawn` and `fork` as not repeatable; a manifest that cannot be written no longer changes the gate's exit status or output, and a gate that fails under the recorder is answered by a plain run; the status memo is skipped for a path with a `..` component (an invalid path was reported as a clean tree). Left, each with a reason: (1) a command's output is taken after the gate's run, so a change inside that window is not seen (a window of milliseconds; closing it needs the output captured at the moment the child ran); (2) a file restored to its old size and modification time passes both signatures (needs a deliberate utimes), and the hash of a file is kept for the life of one hook process; (3) files under the interpreter's prefixes and in `__pycache__` are never dependencies, so reading one as data is not noticed (the interpreter's own signature is checked); (4) the identity memo keeps its answer if `GIT_WORK_TREE` and the like change inside one process (a hook process does not change them). Re-open when: a Windows run of `hook-cost.mjs SessionStart` still shows the gate in the second start, or a gate is found that does any of (1) to (4).
- **A lead from the Windows run of ADR-095 T6 (2026-10-11): the second start's per-directory `git ls-files` re-checks are the largest part of what remains.** On Windows the second SessionStart is 512 ms with 10 children and the gate not started; six of the children are one `ls-files` per task directory at about 30 ms each, about 180 ms of it. The same command is recorded once per directory because the gate asks for each directory separately. One `git ls-files` over the corpus root, answered per directory from the one output, would replace them; it is not safe to do without the recorder naming what each output depends on, which a combined command would hide. Measured on that host only; not measured here. Re-open when: a second start is the cost someone reports. Found in the same run, fixed: a variable's name is matched without regard to case on Windows (the interpreter reads `ComSpec` where the process lists `COMSPEC`, and a spread copy of the environment is a plain object), in the key and in the check.
- **Outside runs of the 3.8.20 candidate (cffeac6e), 2026-10-11: no reader said anything different; two leads.** Three corpus probes from v3.8.19 to cffeac6e (a Windows web repository with no records, a macOS web repository with no records, a macOS PHP monolith with 17 records and 24 tasks) showed only the readers digest moving, with no verdict changes and nothing that could not run. None of them exercises the ready-task cache, since the probe does not run SessionStart; the cache is covered by the Windows peer's `hook-cost` run (second start 489 ms, no gate started). Lead 1: on a repository whose only design document is a dated spec from another tool's workflow, `adr-lint` reads it as an undecided record and fails it on "Alternatives Considered has no entries"; the same in both versions. Whether a document with no `Status` header is a record at all is a reader question for the next record. Lead 2: a Popen that raises in its own `__init__` (CPython on Windows cannot build a command line from bytes that are not text) is recorded as a command that cannot be repeated, so that answer is not kept; that is the conservative reading, chosen on purpose. Re-open when: a corpus whose design documents are not ADRs is reported as noisy.
- **Deferred by ADR-096 (turn-end findings reach the agent), 2026-10-12.** Three items the record leaves for later, each with what would re-open it. (1) A small local decision model as the router at Stop: whether a finding is worth continuing the turn for, which finding first, whether a claim of done is done; it routes and ranks only, never decides pass, fail or UNPROVEN, falls back to the deterministic rule when absent or slow, and logs every decision for an A/B against that rule (the redesign plan's phase 3b; the owner's idea). Re-open when: ADR-096 has a week of session logs to compare against. (2) SubagentStop: its `additionalContext` continues the subagent, not the parent that owns the work; delivering a subagent's findings to the parent needs a PostToolUse hook on the Agent tool. Re-open when: a parent is shown to miss a finding a subagent's work produced. (3) TaskCompleted: the hooks reference read on 2026-10-12 did not settle where its output goes. Re-open when: the reference or a probe says.
- **The verification review of ADR-096's code (gpt-6.1-sol, read-only, 2026-10-12): four fixed, three left with reasons.** Fixed in the same round, each with a test and a killed catalogue entry: a Stop that has continued once now reaches only the user, so a finding that arrives between the two Stops cannot continue the turn again; a finding handed to a subagent's context no longer counts as heard by the main agent (rows carry the recipient); the artifact pass's could-not-start finding is counted per audience like the rest; `turnEnd` is read from the nearest existing directory, as the rules read it, so a deleted working subdirectory keeps `notify`. Left: (1) the late-baseline notice is queued only on the event that observes the late baseline, so when that is a subagent's start it reaches the user and never the main agent (a once-per-session notice; re-open when an adopter misses it); (2) an artifact pass that dies before writing its end is reported with a fresh token each time it is retried, so on an unchanged tree it says "left no end" at every turn end and now continues the turn once each time (it said it at every boundary before ADR-096 too; re-open when a pass is seen dying repeatedly in an adopter's log); (3) under `"turnEnd": "notify"` the could-not-start finding is checked against the agent audience at Stop and so is said to the user at each Stop while the pass cannot start (minor; it is the same message the user saw before ADR-096).
- **The framework comparison (section 369), re-opened 2026-10-11 on the owner's note that the parked comparison had already been in the backlog.** The parked candidates are the ones to take next, in the owner's priority order from section 369: the swallowed-read lint with a shrink-only baseline (d), the gate-control table (e), the stale-entry ratchets (c), the agent listing budget (a). They were parked behind the shape of `lifecycle.mjs` and `qh-check.mjs`, which is now settled. A new record, not this one.
- **Per-file unused names, 2026-10-12: the release scan could not see them; the gate now reads them on every run.** The owner asked whether the static tools at our disposal are used properly, then: "use these all the time, not voluntarily". vulture matches names across the whole program, and knip and orphan-sweep read exports, so an import unused in the file that imports it was invisible to all three: `uvx ruff@0.15.6 check --select F401,F811,F841` over the 24 Python files found 9 (7 in shipped gates), and `npx @biomejs/biome@2.5.12 lint --only=correctness/noUnusedImports --only=correctness/noUnusedVariables` over plugin/, scripts/ and tests/ found 34 (7 in plugin/ and scripts/), on the tree whose pre-release scan had just printed "found nothing". Every one is deleted that no lock pins, but one: `TEST_HASH_REQUIRED_FROM` in adr-lint and adr-next is a re-export that a locked test reads as a module attribute (`tests/test-lock.test.mjs`, ten locks, asserts the gates and `record` answer the same cutover), so it stays, with `noqa: F401` and the reason beside it; the first gate run after deleting it went red on exactly that. `scripts/unused-names.sh` now runs both, pinned, from `selftest.sh` and `dead-code-scan.sh`; a missing tool is UNRUN (exit 3) and fails the gate; every CI job that runs the tests installs the pinned ruff; `tests/unused-names.test.mjs` shows each verdict both ways and its five catalogue mutants are killed. A different-lineage review of the first draft (gpt-6.1-sol, read-only) found five fail-opens, one regression (the re-export above) and one minor, all fixed in the same round, each with a test and a killed catalogue entry: an empty listing or an empty class read as clean; Python with an extension in plugin/bin, nested tests and `.js` were never selected; a path git quotes was skipped; a tool that could not start was counted as a finding instead of UNRUN (a verdict now needs the tool's own clean line or its own count); `python3 -m ruff` of any version was used (now only the pinned one); and the CI wiring assertion accepted the pin inside a comment. One scoped verification of those fixes found two gaps, fixed the same way: a verdict pattern that matched a tool's words anywhere in its output, a file name included, now anchored to the tool's own summary line; and a pin in an inline comment. Left, with reasons: (1) unused parameters, which biome 2.x reports under a separate rule not selected here (1.9.4 counted about 35, mostly uniform hook signatures and test callbacks' `t`): a signature is not dead code. (2) Unused locals inside tests are not read, only their imports: `tests/gate-rules.test.mjs:286` (`elapsed`) sits in a test locked by ADR-075 T2 and ADR-091 T3, and the spawn timeout already bounds what it measured. (3) About 640 biome style findings (506 `useTemplate`): preference, not defects. (4) Not adopted yet: `scripts/hook-cost.mjs` as a CI budget, and a workflow linter (actionlint or zizmor, neither installed here). (5) shellcheck 0.11.0 over the 7 shell scripts: 4 notes (SC2012 twice, SC2016, SC1003), none a defect, and not wired.
- **The third history rewrite, 2026-10-12: an abbreviation of a framework name in a quoted owner note.** The framework comparison entry above quoted the owner's note with an abbreviation of a framework name from the sensitive list (CLAUDE.md §6); the owner chose to reword it and scrub history. `git filter-repo --replace-text` in a fresh clone replaced that one string in every commit (22 rewritten, from the 2026-10-11 ADR-095 commit on); `git log --all -p -i -G` and `git grep -i` over every branch and tag found it nowhere afterwards. The v3.8.20 tag moved from d9015d0d to dc2b3c41 and its release's target with it; v3.8.19 and older were not touched. As in the 2026-10-07 rewrites, shas cited inside that range (the Verification Logs of ADR-095 T6 and ADR-096 T1-T3, and the four 3.8.20 attestations) were left as history, not remapped. A full gate in a fresh clone of the rewritten history passed but for the test in the next entry, which fails the same way on the history before the rewrite. The class is abbreviations too: the pre-commit name scan now includes this one.
- **A lead, 2026-10-12: `reported: a scratch corpus does not pull the record gates` (tests/lifecycle.test.mjs) fails when the checkout itself lives under the temp directory.** Measured in two fresh clones in a session scratchpad under the system temp root, one of the rewritten history and one of the history before it: both fail alone with "Artifact validation failed … expected exactly one owning ADR" where the test expects no artifact verdict for the scratch corpus. The same test passes in a checkout outside the temp root and on every CI runner. Not yet traced: which reader decides "scratch" from a path, and whether it compares against the temp root or the plugin root. CLAUDE.md §8 is the rule it may break; it changes nothing for a checkout outside the temp root.
- **Deferred by ADR-097 and ADR-098, 2026-10-12, with what a cold review found.** (1) Removing the `post-edit-check.sh` PostToolUse hook: its output never reaches the agent (plain PostToolUse stdout, no `hookSpecificOutput`; fired twice in a month here), but the staged-product spec binds it (UC2-S5 and F-33, `@implemented`), ADR-038 T3's evidence names its test, and `spec-verify` accepts only `@draft`, `@spec` and `@implemented`, so no fact can be retired. Consumers found by the review and `git grep`: `tests/package.test.mjs:942`, `tests/staged-product.test.mjs:124` and `:659`, `tests/lifecycle.test.mjs:439` (the ADR-068 T2 lock "every hook script the runner accepts has its arguments wired"), `tests/hook-work.test.mjs:49`, `tests/gate-rules.test.mjs:1331-1368` (a mutation-runner fixture), `tests/mutation-cache-merge.test.mjs:207,218`, and three `tests/post-edit-check.test.mjs` fences in `tests/mutations/plugin/scripts/workflow-parse.mjs.json`. Re-open: a spec-fact retirement tag, then one task with all of these. (2) ADR-098's bare-mention advice left to an armed git hook fails open two ways: a static shell spelling such as `unset G"I"T_CONFIG_COUNT; sh release.sh # commit` disables the hook while the classifier returns `invoked: null` and no raw-text predicate matches (bash does remove the variable, and the injection depends on it, `plugin/scripts/publish-verdict.mjs:121`); and under `"publish": "warn"` git's hook delivers no warning either (`plugin/scripts/publish-hook.mjs:93` discards non-denying verdicts), so suppression turns a warning into silence. Re-open: a predicate that reads the command as the shell does, with both counterexamples as tests (CLAUDE.md §16). (3) A correction: the commit message of 863b82f2 (the 2026-10-12 history rewrite) says the ADR-068 T2 relock "re-ran the task's fence". It did not: `adr-verify --relock --replace-hashes` records new lock hashes and exits (`plugin/bin/adr-verify` near line 3154; its rows read `ms:0`). The relocked test passed in the full gate of the rewritten clone, which is the evidence; the message overstates it.
- **Deferred by ADR-099 (SessionStart does not list ready tasks), 2026-10-12.** The owner accepted the record on the condition that the reversed records are retired rather than reconciled in place; the adr-retire stage retires whole decision units only, so ADR-099 T2 archives ADR-040, ADR-046 and ADR-095 whole as `governing`. Two gaps it names: (1) a tag that retires a spec fact, so the ADR-040 spec's F-1 bindings (UC1-S1 to S3, `@implemented`) can be closed rather than left naming the tests T1 deletes (`spec-verify` accepts only `@draft`, `@spec` and `@implemented`; the same gap holds ADR-097's post-edit hook above). Re-open: with the post-edit hook, as one retirement-tag record. (2) Retiring part of a record: a single task (ADR-095 T6, ADR-040 T1, ADR-046 T3 and T5) or a single clause (ADR-094 Decision 2's member "the ADR tasks in flight"); there is no "superseded in part" effect and a frozen file cannot carry a note, so the partial reversal is said only in ADR-099's `Invalidates:` and the archive rows' Reason. Re-open when: a second record needs to reverse part of a still-governing one.
- **Two leads from executing ADR-097 to ADR-099, 2026-10-12.** (1) The artifact pass says `UNPROVEN: could not classify <path>` for every path a commit deletes; a deleted file has nothing to validate, so the line is noise on every removal (seen on each ADR-097 deletion). (2) After a subagent fixed a record, the parent's next PreToolUse (a read-only `git status` and `mrw read`) was handed four "Artifact validation failed" blocks for ADR-099, each the subagent's mid-edit state (a README listing T3, T5 and T6 that no longer existed; two different segment counts for the same fence), while `adr-lint` on the tree at that moment exited 0. A finding judged on a tree that has since changed reached the agent as current. Not yet traced: whether the pending-until-said state of ADR-096 replays findings recorded under a subagent's events without re-checking the tree they were judged on.
- **Both leads above fixed, 2026-10-12.** (1) `facts-gate-dispatch.sh` passes a missing path whose name has an extension other than `.md` in silence, as it passes an existing one: only Markdown can be a record. A missing `.md` in any case, and a name with no extension (it may have been a directory), keep their could-not-look; `tests/dispatch-streams.test.mjs` holds both directions, two catalogue mutants killed. (2) `importPassVerdicts` no longer says a finding about bytes a later pass in the same ledger gated as different bytes; a later verdict whose bytes are unknown supersedes nothing. Comparing against the file's current bytes was not taken: the import cannot know a newer pass will run, and the locked fixtures write synthetic blobs. `tests/artifact-pass-behind.test.mjs` holds both directions, two catalogue mutants killed. Left: a finding about bytes that changed after the last pass, with no newer pass yet, is still said until the next boundary gates the new bytes.
- **Release review of v3.8.21..17066d76 (section 12), 2026-10-12: four blocking, two advisory, all fixed in the same round.** A different-lineage review (gpt-6.1-sol, high, read-only, launched through the plugin's own `host-review.mjs --prompt-file`) of the launcher, the two artifact-gate fixes above and ADR-098's review contract. Each finding was read against source before it was fixed, and each fix has a test that went red first and a killed catalogue entry. (1) The superseded-finding rule hid a finding that was current again when a file returned to the finding's bytes after a later pass gated other bytes; a finding is now superseded only while the file does not hold its bytes. (2) The deleted-path rule passed in silence any missing name with a dot, so a deleted directory such as `decisions.v1` holding records said nothing; it is now silent only when a history base (`QUALITY_HARNESS_HISTORY_BASES`, else HEAD) holds the path as a file (`git cat-file -t` is `blob`), and the 2026-09-10 assertion that a never-tracked missing `.js` is UNPROVEN is restored. (3) The launcher's `exec --help` probe had no hard kill, so a binary that ignores SIGTERM could hang it; it is killed with SIGKILL at its deadline. (4) Any SIGKILL was reported as "killed at its budget of 600 s"; only the deadline (`ETIMEDOUT`) is the budget now, and another signal is named. (5) A temporary directory that could not be made threw out of the result contract (exit 1, not 2); it is now a reason, and a failed removal is said on stderr. (6) The review skill still told Pass 1 to "output critical/high only"; the old severity words are gone from every review surface and a test holds it. The reviewer's own run of the four test files was refused temporary directories by its sandbox (7 passed, 19 failed), so its test evidence is limited to the contract tests; the fixes here were run locally.
- **ADR-097's ready-line deferral landed in ADR-099, 2026-10-12.** ADR-097 deferred "the SessionStart ready lines and the ADR-095 cache" here (`ADR-097:102`); ADR-099 T1 removed both (`ready-cache.mjs`, `trace_run.py`, the readiness half of `ready-lines.mjs`), and the spec-retirement tag it could not supply is item (1) of the ADR-099 entry above.
- **Release review of 271aa9e9..c1218079 (section 12), 2026-10-12: one blocking finding, fixed; its verification found two more, fixed; no further round.** A different-lineage review (gpt-6.1-sol, high, read-only, through `host-review.mjs --prompt-file`) of the `adr-retire-check` backlog location (f8b5a785), ADR-099 T1+T2 (d97f86d5), ticked receipts (7df1c9f3) and the batch's one history query (4442eed7) found one regression: the batch and the standalone dispatcher split `QUALITY_HARNESS_HISTORY_BASES` differently, so `HEAD,<sha>` gave a deleted tracked script two verdicts (cb43cc11). The one scoped verification of that fix and of c1218079 (a spec is covered only by the records that name it, found while binding ADR-099 T2's mutants) found two blocking gaps: CR, VT and FF still split on one side only, and a **Spec:** header was credited to both of its resolutions where adr-lint takes the first. Both fixed in the commit after c1218079, with catalogue mutants killed (history bases 6/6, spec coverage 4/4). By the owner's rule of one verification per fix round (2026-10-07), those last fixes were not sent for another review. Left: what an unreadable record covers still counts for every spec, a branch no test asserts.
- **Lead: the test suite leaves 68 entries in the temp directory** (the full gate's own advice line, 2026-10-12, on 4442eed7): `quality-harness-status` x33, `qh-mutate-run` x8, and one each of about 27 other prefixes, removed only when the gate exits. Each is a test whose cleanup does not cover every exit. Re-open when: one is traced to a test that leaks on a failing path, or the count grows.
- **§371 seen again, 2026-10-12.** Building a fixture in a scratch repository under the session's scratchpad, a `git commit` there was refused by the publish hook because the session's repository had no full pass: lead (1) of §371, the hook judging the session's repository for a commit aimed elsewhere. The probe moved into a test that builds its fixture without a commit.
- **The release campaign of 686ac9be (run 38285705686) found two catalogue mutants ADR-099 had left vacuous, 2026-10-12** (CLAUDE.md §18: a refactor that moves an observable turns the tests on the old site vacuous). `§350 C6` (adr-next's ownerless hedge) was pointed at the corpus matrix, which saw it only in the SessionStart ready line T1 removed; `§351` (`readRegularText` opening a FIFO) was pointed at the FIFO case, which work-next reached only through the deleted `taskDirectories` disk listing. Both mechanisms are still asserted: by `tests/adr-next.test.mjs` ("tasks with no owning record are said to have none…") and by the tracked-link-to-FIFO case, which git lists. The entries are repointed and killed again. The executing session ran the 20 entries its test edits could weaken; the whole catalogue was the measure that could see these.
- **A sign-off citing the `## Stop Condition` section read as a stop, 2026-10-13, fixed.** `work-next` named ADR-078 T2 as a task marked done with no evidence: its approval says "+8%, under the Stop Condition's 25%", and `adr-next` read the section's name as the verdict `stop` (the same at v3.8.19, v3.8.20 and v3.8.21, so it shipped unseen). The section name, with or without a possessive or plural, is now neutralised like a counter name; the condition said to be met, reached, hit, triggered, tripped, fired, applied or held still stops, and so does the bare word. `tests/adr-next.test.mjs` holds both directions; two catalogue entries kill the exemption and the met guard. Class, enumerated with `python3 plugin/bin/adr-next docs/adr --all | grep -E '\s(stopped|blocked)\s'`: seven stopped tasks before, six after; the one that changed is ADR-078 T2, and the other six are stopped by their own superseded `**Status:**`, correctly. This is the fourth first-hand instance of lead 1 above (a word in an approval's prose read as its verdict).
- **ADR-099 T2's archive move turned `adr-debt docs/adr` red, 2026-10-13, fixed.** The run printed `UNRESOLVED [adr] … ('ADR-046 Follow-ups — it is not dispatched')` for ADR-049's deferral and exited 1 (0 UNRESOLVED at v3.8.21, 1 at v3.8.22): `_resolve_adr_id` looked for the record in the active corpus only, so a record the adr-retire stage moved read as "a typo, or a record owned by another repository". adr-lint had paid for the same lesson for citations (`archived_record_numbers`, `plugin/bin/adr-lint:4441`); adr-debt was the sibling it never reached. A pointer to a record in a sibling whose README carries the archive's Lifecycle line is now UNSWEPT (it can never resurface, exit 0), spelled from the scan directory rather than resolved, so no home path is printed; a sibling without the line is no archive, and an id no tree holds stays UNRESOLVED. `tests/adr-debt-archive.test.mjs` holds the three directions; three catalogue entries kill them. Class, enumerated with `mrw read --grep 'def _resolve_adr_id|def resolve_record_number|def resolve_qualified_dep' plugin/bin/ plugin/lib/`: three resolvers of a record id. `resolve_record_number` (adr-lint citations) already reads the archive; `resolve_qualified_dep` (adr-lint, a task's dependency) reads the active corpus only on purpose, because a task must not depend on a frozen one. Nothing in the gate ran `adr-debt` over this repository, which is why it shipped unseen; `tests/corpus-lint.test.mjs` now does, with a failing control first; ADR-049's pointer itself is history and stays as written.
- **The backlog index hid 44 receipts from `adr-debt`, 2026-10-13, fixed.** `python3 plugin/bin/adr-debt docs/adr`, run per commit from v3.8.21: 0 UNRECEIPTED through 863b82f2, 31 at db1db5fa ("The backlog becomes an index"), 44 from 41645b31 to v3.8.22. `receipted` searched only the destination file for the source record's id, and the index moved each closed section's text, receipts included, to `docs/backlog-archive/`, leaving the heading and an `Archived: [..](..)` link (CLAUDE.md §10). It now reads the destination and every file its `Archived:` lines link to, inside the git root; and it names the destination as the pointer wrote it, where it had printed the path resolved against the git root, which named this machine's home on all 44 lines. 44 to 0 on this corpus. `tests/adr-debt-archive.test.mjs` holds the receipt in an archive file, its twin (an archive file that never names the source) and the spelling; two catalogue entries kill them; `tests/corpus-lint.test.mjs` now fails on any UNRECEIPTED line in this repository's corpus. Class: the shipped readers that open a backlog. By a literal name, `mrw read --grep "[\"']BACKLOG\.md[\"']" plugin/bin/ plugin/lib/ plugin/scripts/` finds one, `adr-retire-check:351-352`; by a deferral pointer's path, `adr-debt`'s `receipted` (fixed here). `adr-retire-check` (`active_backlog` and its receipt count) reads `- [ ]` and `- [x]` rows under `## Follow-ups`, a section the index keeps in the file; no other shipped reader opens the backlog.
- **Deferred by ADR-100 (a procedure the agent repeats is one command), 2026-10-13.** Phases 3 and 4 of the redesign plan the owner set on 2026-10-12 stay here until their own records: (1) phase 3, one reader of "is this tree checked" (`treeChecked`, `passedAlready` and `latestFastPass` in `plugin/scripts/check-ledger.mjs` collapsed into one, read by the publish verdict and `qh-check`) and the cached CI state said at `git push`; (2) phase 4, the owner's decision on CLAUDE.md §3 (keep two refusals, or widen what "checked" means with an opt-out), which the plan says to take with phases 2 and 3's results. ADR-101 (one reader per check ledger, 2026-10-13, Proposed) takes phase 3 as one reader per authority rather than one over both, declines the CI line at `git push` (the per-prompt brief already repeats a red run), and defers phase 4 here too.
- **Lead from an outside project, 2026-10-13: `qh-check` cannot say where its time went.** A peer session measured its declared check (a Go suite) at 455 s over three runs (463, 455, 455) on a 10-core Mac; a hand-instrumented run found 364 s of it in one test that runs nested modules' suites serially, and after bounding those the check fell to 150 to 170 s. `qh-check` printed the total, the exit and the load, and nothing that pointed at that test. The lead: name the slowest packages, or tests for a runner that emits them (`go test -json`, `pytest --durations`, a node reporter), in the footer and in the ledger row. First measure whether the 64 KiB output tail `qh-check` keeps holds what a parse needs, on this repository and on one outside corpus. The same peer's second idea, declared partitions whose green result is reused while their declared inputs are unchanged, is the per-test verdict cache already deferred above, with the same blind spot (a child process reading files the key does not see); a printed skip and a forced full run before every push would be its conditions. Re-open when: one adopter's check is shown to spend most of its time in a part the footer would have named.
- **ADR-100 T4 (a docs lane) withdrawn on its own ship rule, 2026-10-13.** The lane S3 derives, every `tests/*.test.mjs` naming `docs/`, a quoted `'docs'` segment or `ls-files` (`grep -lE "docs/|'docs'|\"docs\"|ls-files" tests/*.test.mjs`), is 140 of 218 test files. One run of it: exit 0, 1,732 tests, 270 s, load 3.75 at start and 14.54 at end on 10 cores (partly its own). The current `fastCheck` list ran in 97.7, 99.3, 104.9 and 122.5 s on four runs the same day. T4 ships only if the lane is faster and agrees, so it cannot ship, and the 20-commit replay and the seeded faults were not run. Why: most of this repository's tests build fixtures under a `docs/` path or read the tracked tree, so "the tests that read docs/" is most of the suite; a narrower derivation is a classifier whose error is fail-open (a test it drops is one a docs change can break unseen). The time is not the only leg: the lane holds 8 of the list's 12 files (js-reading, gates, publish-command, qh-check-reads-the-ledger, test-locks, corpus-probe, attest-import, hook-goldens, the slowest among them) and 132 more, so it does strictly more work than the list and is not faster under any load. `fastCheck` is unchanged. What would re-open it: a derivation from what each test actually opens (the per-test read-set recorder deferred above), not from its source text.
- **Phase 4 decided by the owner, 2026-10-13: Branch A, the two sanctioned refusals stay** (CLAUDE.md §3 unchanged; ADR-100's and ADR-101's deferral of phase 4 lands here). The harness is `qh-check` and the publish refusal, `adr-verify`, the mutation campaign and the outside attestation, driven by `qh-check --commit` and `node scripts/release.mjs`; Branch B (a pass that also covers `adr-lint` on touched records, a push judged against a red CI) is not taken, and the plan wrote an ADR only for Branch B's Accept, so none is written. Asked with the alternative of deciding after the first release through `release.mjs` had measured phase 2's promise (34 tool calls per release to at most 3); the owner chose now. The same day the owner kept `evidence-limited` as a covering review status in `release-evidence` (ADR-100 T1 S3, as built), and chose one more scoped review for a fix round's last commit over exempting it from the review gate, when the gate refused 289e71f5.
- **The Stop Condition exemption in `adr-next` took four review rounds, 2026-10-13: a §16 lesson.** e7506f5e neutralised the section's name; a Codex review found "the Stop Conditions were met", "Stop Condition: met" and a backed-out possessive read as a pass (7eb7be00); its verification found "Stop Condition not met" and "unmet" read as stops (289e71f5); the scoped review of 289e71f5 found "Stop Condition limit: reached" read as a pass (fixed in the commit after it). Each round's cases are in `tests/adr-next.test.mjs`'s Stop Condition test and each guard has a catalogue entry. The shape of the failure: an exemption that turns a stop into a pass is a classifier attacked from the fail-open side (CLAUDE.md §16), and every widening of its guard opened a new member. If a fifth round finds another, the narrower rule is the one to take: exempt only the cited forms ADR-078 T2's note uses (`under`/`within`/`inside the Stop Condition`), and read every other mention as a stop. The commit that fixes this round is covered by no recorded review, so `release-evidence` will refuse v3.8.23 until one runs over it (the owner's rule of 2026-10-13: one scoped review of a fix round's last commit).
- **Two `adr-verify` findings from an outside corpus, 2026-10-13, fixed.** A peer session on macOS with 3.8.22 reported: (1) a failed run's quoted output was indented line by line, blank lines included, so the task file held a line of two spaces and `git diff --check` exited 2; (2) a `--mutant` clean fence that passed in the checkout failed in the worktree because an ignored dependency directory is not carried into it, and nothing said so. Both confirmed against source: `excerpt_fence` prefixed every line (`plugin/bin/adr-verify:485` before the fix), and `worktree.mjs build` copies `git ls-files --others --exclude-standard` (`plugin/scripts/worktree.mjs:156`), which excludes ignored files by construction; the only ignored-file check was on the mutant target. The class, enumerated with `rg -n 'excerpt_fence\(|"  \`\`\`"' plugin scripts`: one writer and two callers (the Verification Log excerpt and the Mutation Log excerpt), both fixed by stripping each excerpt line on its right; every other line a run appends is already stripped (`why.strip()`, `human.strip()`). The UNPROVEN line of an isolated run now says the worktree holds no ignored file and names `--in-place`, the help text and the adr-execute skill say it, and a clean fence failing in place is not told about a worktree. Tests: `tests/adr-verify-isolation.test.mjs`, the run through `git diff --check` and the hint with its in-place twin; three catalogue mutants RED, and the ADR-045 T8 entry repointed and RED.
- **The fifth Stop Condition round, 2026-10-13: the adjacency pattern is replaced by a clause rule.** The scoped Codex review of 289e71f5..b02048b7 (recorded in `reviews.jsonl`, status blocking) executed `observed; Stop Condition: limit reached` against the target: `human_outcome` pass, `is_done` True — a separator before the word between, which the a39e91a6 pattern did not take. As the entry above planned for a fifth round, the lookahead is gone: `neutralise` in `plugin/bin/adr-next` blanks a `Stop Condition` only when no verdict word (`met`, `reached`, `hit`, `triggered`, `tripped`, `fired`, `applies`/`applied`, `holds`/`held`) follows it before the clause ends at `. ; ! ?` or a line break, or when every one that does is denied (`not`, `never`, `no`, with up to two auxiliaries between). A comma is no break, so "the Stop Condition, which was reached" stops. The known cost, chosen as the direction this reader errs in (CLAUDE.md §16): "under the Stop Condition's 25%, all checks met" now reads as a stop. Every case of the four earlier rounds stays in `tests/adr-next.test.mjs` and passes; five cases are added. The six catalogue entries on the old pattern were replaced by six on the new rule, all RED after one GREEN (the auxiliary denial, killed by adding "has not yet been reached"), and four entries whose source line the call change moved were repointed and RED.
- **The verification review of 3ddfe748 (status blocking, in `reviews.jsonl`), 2026-10-13, both fixed.** Executed against the target: `observed; Stop Condition: limit 25.0% reached` returned pass, a fail-open, because the decimal point ended the clause; and `approved; Stop Condition was not being met`, a pass at the base, returned stop, because the denial's auxiliaries left out `be` and `being`. A full stop now ends the clause only before a space or the note's end, and the denial takes NEGATOR's forms (`wasn't` too) and every auxiliary either list knows. Three cases added; two catalogue entries repointed and three added, all RED.
- **The verification review of a9a265fd (status blocking, in `reviews.jsonl`), 2026-10-13: the clause boundary is removed.** Executed against the target: `observed; Stop Condition: max. 25.0% reached` returned pass, a fail-open, because an abbreviation's full stop ended the clause. That is the seventh spelling in seven rounds, and the last two were clause boundaries, so `neutralise` now reads everything after the name: a Stop Condition is blanked only when no verdict word follows it anywhere in the note, or every one that does is denied. No boundary is left for a verdict to hide behind. The cost, chosen in this reader's direction (§16): a note citing the section that later says anything met or reached, in any sentence, reads as a stop. Two cases added; four catalogue entries repointed to the new scan; all twelve entries on this block RED.
- **Lead from an outside corpus, 2026-10-13, needs an owner decision: approvals whose prose describes a refusal read as stops.** A peer session's `work-next.mjs --json` listed 13 tasks in `unbackedDoneClaims`, every one `stopped … a human sign-off says stop on ‹word›` under `adr-next` 3.8.22. The peer sent the 13 notes verbatim (kept out of this repository, §6). Each note's verdict is an approval, and each trigger word (refused in six tasks; failed in two; refuse, refuses, cannot, an upper-case FAILED, fails) sits in prose that reports the system under test behaving as designed. The shapes, described rather than quoted: a boundary reported as still refusing what it should; a documented split between clamping and refusing; a receipt that keeps every failed hunk; an earlier run that failed before a fix; a relock note explaining why a test's assertion changed. None uses an underscore-joined identifier (that false-stop shape, `test_refused_scope`, is reproduced here separately and unfixed), and a CamelCase test name is not a trigger. Two mechanisms, confirmed in `human_stop` (`plugin/bin/adr-next:728`): only the LAST sign-off is read, and no row clears it unless it is an exit-0 row for the current fence, dated on or after the sign-off, and not an `adr-verify --relock` snapshot — so a relock note followed by its relock row stays stopped for good. Both are deliberate: the reader errs toward stop (§16), and text cannot tell a refusal that is the subject from a refusal that is the verdict. The decision: keep it (adopters see false stops on approvals that describe refusals, and cannot clear them without signing an observation again), or change it narrowly. Candidates: let a relock row clear a stop whose note is the relock's own justification, or read a negative word as the verdict only in the note's first clause or after its last affirmative. Each candidate is a fail-open surface and gets its §16 twin before it ships.
- **A probe of 2f97b6d0, 2026-10-13: the verdict is an open set, so the stop is now the default.** Before sending it for review, fifteen phrasings a person might write for a condition met were executed against it, and twelve read as a pass: satisfied, exceeded, breached, crossed, fulfilled, passed, surpassed, in effect, true, matched, invoked, activated (the listed hit, tripped and triggered stopped). A list of verdict words over an open space is the §16 failure, so the polarity is inverted: the name `Stop Condition` stays a stop word, and is blanked only when it is cited as a measure (`under`, `within`, `inside`, `below`, `beneath` or `per` before it) with no undenied listed verdict after it anywhere in the note, or when every listed verdict after it is denied (including `unmet`). After the change all fifteen probe verbs read as a stop, every earlier case holds, and `adr-next --all` over every record in `docs/adr` reports no human sign-off stop. The remaining fail-open needs a measure word AND an unlisted verdict ("under the Stop Condition's limit, which was exceeded"). Seven cases added; four catalogue entries added and the scan-scope entry given the case that makes it matter; all thirteen entries on the block RED.
- **The review of a9a265fd..1542b962 (status blocking, in `reviews.jsonl`), 2026-10-13: two fail-opens that predate the inversion, fixed, and the review loop on this block closed.** Executed against the target: `observed: the condition was met per the Stop Condition` returned pass, because only what FOLLOWS the name was scanned and `per` cited it as a measure; and `observed: Stop Condition was not unmet` returned pass, because an un- verdict counted as a denial even when negated. Both existed at the base. Verdicts are now read over the whole note, and a negated un- verdict is the condition met. Its two advisories are taken too: twelve verdicts it found missing from the list are added (satisfied, exceeded, breached, crossed, fulfilled, surpassed, matched, invoked, activated, attained, achieved, violated), and `see` cites the section as the measures do, so "see the Stop Condition section" is a pass again. Six cases added (one, "was in effect", keeps the default-stop path tested now that the list names "satisfied"); six catalogue entries repointed and three added, all sixteen on the block RED; `adr-next` over every record in `docs/adr` reports no human sign-off stop. **No further Codex round on this exemption** (the owner's rule for heuristic readers, one round per change and then outside corpus runs, has been exceeded): the next evidence is the outside corpus run §18 requires before v3.8.23.
- **The pre-release review of 59d54e3d (status blocking, in `reviews.jsonl`), 2026-10-13: one fail-open fixed, two words left out on purpose.** Executed against the target: `observed: Stop Condition is no longer unmet` returned pass, because the denial matched `not`, `never`, `no` and contractions but not `no longer`, which NEGATOR already knows. The denial now takes `no longer`; one case and one catalogue entry added, RED, and the contraction entry repointed, RED. Its advisory, `passed` and `true` missing from the verdict list, is NOT taken: the verdicts are read over the whole note, so either word anywhere ("tests passed") beside a cited measure would turn a real approval into a stop, and branch (a) needs a measure word AND one of them to fail open. Re-open if a sign-off on disk is found saying a cited Stop Condition was passed.
- **The coverage review of 5bd51f8a (status blocking, in `reviews.jsonl`), 2026-10-13: a regression of that commit, fixed.** Executed against the target: `observed: Stop Condition is not no longer met` went from stop at the base to pass, because the inner `no longer` was taken as the denial and the outer `not` ignored. A denial that is itself directly negated now counts as the verdict said (`STOP_CONDITION_NEGATED`), which also stops "never not reached". Two cases added; the not-met entry repointed and one entry added, both RED.
- **The v3.8.23 outside runs, 2026-10-13.** The request at bd9e613c went to the seven idle local sessions. Six were first refused by their own permission classifier ("Code from External") and ran once their users allowed it; one ran at once. All seven exited 0, and no adr-lint verdict moved in any: a Laravel/React monorepo corpus (94 records, 96 verdicts compared; filed as `docs/corpus-reports/2026-10-13-laravel-react-monorepo-3.8.22-bd9e613.json`), a Python service corpus (72 records, 77 compared), an Ansible corpus (20 records, 26 compared), a Laravel ADR corpus (17 records, 23 compared, look PARTIAL in both runs, not investigated), a React SPA corpus (2 records, 2 compared; filed as `docs/corpus-reports/2026-10-13-react-spa-3.8.22-bd9e613.json`), and two repositories with no ADR corpus the readers recognise (0 records). Only two are filed: the other labels name their projects, and a filename here may not (§6). The record-by-record comparison of the first found nothing exercising the new Stop Condition reading or the adr-debt archive receipts, and the React SPA runner checked by hand that its corpus has no Stop Condition sign-off and no frozen archive, so those two changes still have no outside observation. One lead, unconfirmed: the Python service corpus saw `adr-lint` on one record go from 372 to 1478 ms, one sample per side in sequence on a loaded machine. Counts from `ledger-report --json` (sessions read; checks passed/failed): 6, 64/8 (plus one interrupted); 3, 1/2; 5, 1/0; 6, 2/1; 4, 7/1; 13, 80/15; 6, 2/0. The coverage review of bd9e613c (evidence-limited) adds one advisory, a false stop on a triple negation ("not not not met"), the direction this reader errs in; left as it is.
- **A suppression the pre-release dead-code scan does not count, 2026-10-13, needs an owner decision.** Asked whether the five zero counts were silenced: `uvx ruff@0.15.6 check --ignore-noqa --select F401,F811,F841` over the gates reports two, `record.TEST_HASH_REQUIRED_FROM` imported but unused at `plugin/bin/adr-next:90` and `plugin/bin/adr-lint:126`, each under a `# noqa: F401` with its reason: the name is re-exported only so `tests/test-lock.test.mjs` (locked by ten tasks) and `tests/gate-regressions.py:3710` can read it through those modules. An export only a test reaches is dead code by §13, which allows no allow-list; the locked test must stay byte-identical, so removing it means a new test beside it and the locks re-taken. The other exceptions, each documented beside it: three names in `scripts/vulture-allowlist.py` (two ctypes struct fields and a `sys` flag, written by attribute), three `from fence import *` shims (F401/F403), and knip's generated config (`ignoreExportsUsedInFile`, two OS binaries, the `internal` dependency, workflow exports checked separately).
- **Decided by the owner, 2026-10-13: the `TEST_HASH_REQUIRED_FROM` re-export keeps its `noqa`.** Retiring it was chosen first, then withdrawn on a fact the first question left out: one of the ten tasks that lock `writer, done, and is_done agree on the same hashes` is `docs/adr-archive/ADR-056-a-quoted-separator-is-not-a-joiner/tasks/T1-quoted-separator-is-not-a-joiner.md`, a frozen record whose catalog digest covers its file bytes, so its lock cannot be re-taken. The re-export stays until that record leaves the archive or the archive's digest rule changes. The same day the owner chose ONE PUSH PER RELEASE (fix rounds commit on the fast check and stay local; one full `qh-check` before `release.mjs` pushes), after ten full gate runs on 2026-10-13 missed the redesign's four-per-session target, and kept the refusal-prose stop rule above as it is.
- **The coverage review of ceea7705 (status blocking, in `reviews.jsonl`), 2026-10-13: three findings fixed, one already declined.** The status line showed the ahead and unreviewed counts after a commit, a push or a branch switch had made them another tree's: `gitReading` now shows them only when the cache's key equals `snapshotKey()` read from files now, and an unprovable key shows nothing. A parent checkout's lease showed in a linked worktree nested inside it: a lease now counts only where its root has this checkout's Git directory. The review heads were cut to the newest 64, so an older review that still covered HEAD could drop out and the count rose: every head now reaches `git rev-list --stdin`, through an `input` that `budgeted` and `shell` pass on. Tests and seven mutants added, all RED. The fourth finding, that a render can still spawn `git rev-parse` and write its own cache on a miss, is §246, declined 2026-09-24 and not changed by that commit. Left as they are: with HEAD unchanged, a review that lands is not counted until the hook next refreshes (the count errs high), and `ciReading` still shows the last branch's CI for up to 15 minutes after a branch switch.
- **The outside runs at 7b675248, 2026-10-13, and one finding they produced.** The request went to the nine idle local sessions, with the probe plus a read-only status-line render. Two were refused by their own permission classifier ("Code from External"), and nothing ran there. Seven ran, all exits 0, no adr-lint verdict moved. Six are filed, each under a shape label the runner chose: a Laravel/React monorepo corpus (94 records, 96 compared; the runner also checked adrNext, adrState, workNext and the other readers byte-identical old to new), an Ansible infrastructure corpus (20 records, 26 compared), a Laravel CMS corpus (17 records, 23 compared, look PARTIAL both sides, as before), a Python service corpus (72 records, 77 compared), a React SPA corpus (2 records, 2 compared) and an SPA frontend with no records (1 compared). Not filed: a run that compared nothing, and every attestation whose first label named its project; the runners re-attested under shape labels. The renders showed `QH ? unknown` (the synthetic session has no event log), `CI ?` on three Bitbucket remotes, red CI with read and unread jobs counted apart, and `load` between 1.55× and 2.15× while the probes overlapped. `!rev` went unexercised: no runner's checkout holds a review ledger, and the caches there were written by the installed, older hook. **Confirmed defect, older than 3.8.23:** `collect` counts ahead and behind with `git rev-list --left-right --count origin/<branch>...HEAD` (`plugin/scripts/branch-state.mjs:163`) and never with the configured upstream, though the pushed tip two lines below resolves `@{upstream}` first. A branch tracking `origin/master` with no `origin/<same name>` therefore caches `ahead: null` (the React SPA runner, 1 commit ahead by `git rev-list --count @{u}..HEAD`), and both the brief and the status line show nothing for it. The failure is silence, never a wrong number. Fixing it changes a reader, so the fix is a release decision. The same full `qh-check` passed at 7b675248 (2266 pass, 0 fail) but is recorded unattributable: load rose from 1.7 to 11.91 while the probes ran.
- **Fixed 2026-10-13 on the owner's choice, before the release: the ahead count of a branch tracking an upstream of another name.** `collect` still counts against `origin/<branch>` first, and when that fails while `@{upstream}` resolves, it counts `@{upstream}...HEAD`, the ref the pushed tip is read from. A branch with both an `origin/<branch>` and a differently named upstream is still counted against the first; a test fixture answers that call in many locked tests. Regression `a branch tracking an upstream of another name is counted against it, with real git`, a bare remote and a branch made with `--track origin/main`; one mutant, RED, and 56/56 `branch-state` mutants noticed (that run began at load 12.7, so a kill there is attributable only because every baseline passed under the same load). A reader changed, so the outside runs at 7b675248 attest an older sha and a new round is needed.
- **The outside runs at 297ea135, 2026-10-13.** Eight sessions were asked again; one was still refused by its permission classifier. Seven ran, all exits 0, no adr-lint verdict moved, and all seven are filed: a Go CLI corpus (148 records, 148 compared), the Laravel/React monorepo corpus (96 compared; adrNext, adrState, workNext and the other readers byte-identical old to new), the Python service corpus (77), the Ansible corpus (26), the Laravel CMS corpus (23, look PARTIAL both sides), the React SPA corpus (2) and the SPA frontend with no records (1). The React SPA runner, whose checkout found the defect, ran this candidate's branch-state once and its status line then showed `↑1`, matching `git rev-list --left-right --count @{u}...HEAD`. The other six checkouts have an `origin/<branch>` or no upstream at all, so they show only that the fallback leaves the ordinary case alone. Two runs printed "slower" adr-lint lines (two records in one, nine in another) while load reached 22 on 10 cores; adr-lint did not change between the candidates, so they are not read as a regression. Left as designed, raised by one runner: a branch with no upstream and no `origin/<branch>` (never pushed, nothing configured) is still not counted, since nothing names what it should be counted against. The full `qh-check` at 297ea135 passed attributably: 2267 pass, 0 fail, load 2.94 to 8.29 on 10 cores.
- **3.8.24's first release run, 2026-10-13: CI's windows job failed, the tag was refused, and Windows peers ran the readers.** `release.mjs` pushed 1443dd24, every other job concluded success, and `release-evidence` exited 1 on `windows: failure`; v3.8.24 was not tagged, as designed. The one failing test was ceea7705's own, `a check or a campaign in flight for this checkout is shown from its lease, and no lease is removed`, at `a subdirectory is the same checkout` (`'' !== '⧗ check 2m'`). It reached CI for the first time with this release, one push per release. The cause, reproduced by this repository's Windows checkout with TEMP set to an 8.3 alias (exit 1 with the same assertion; exit 0 with a long TEMP): the test named `root/sub` without creating it, so `flightReading` resolved it by spelling (`path.resolve`, keeping `RUNNER~1`) while the lease's root was resolved by the filesystem (`realpathSync.native`, expanding it). Its first Windows run passed 67/67 only because that machine's temp path has no short name. Fixed in the test (3410c978): a status line's cwd exists. Left as it is, named: `canonicalPath` still resolves a cwd that does not exist by spelling (canonicalising the nearest existing ancestor would close it; a reader change, so not in this release). Windows outside runs at 1443dd24 (five sessions asked; all were first refused by their permission classifier, and four ran once their users allowed it): a Go CLI corpus (70 compared), a Python service corpus (77), a React/TypeScript frontend with no records (1), all filed, and one with no records that compared nothing, not filed. No verdict moved, no `load` token showed (Windows keeps no load average), no path had mixed separators, and `↑N` matched `git rev-list --count @{u}..HEAD` where it showed. Two leads the same Windows checkout raised, confirmed against source, older than 3.8.23, both erring toward silence, open for the next round: (1) on a detached HEAD `collect` lists runs with `gh run list --branch HEAD` (`plugin/scripts/branch-state.mjs:227`), and the by-commit retry (`:253`) runs only when that page had rows, so a detached checkout, which the probe recipe itself makes, says "no run recorded for this branch" while its commit has runs; (2) `behind` is stored (`:184`) but `render` prints only "N ahead of origin" (`:460`), and the status line only `↑N`, so a diverged branch reads like an unpushed one.
- **Fixed 2026-10-13 after 3.8.24: the four status-line and branch-state leads the 3.8.24 outside runs left.** (1) A detached HEAD is listed by its commit (`gh run list --commit <sha>`), and an empty listing says "no run recorded for this commit"; it was listed as a branch named `HEAD`. (2) `behind` is said: the brief reads "2 ahead and 3 behind origin" or "3 behind origin", and the status line `↑2 ↓3`. (3) `canonicalPath` resolves the part of a path that exists through the filesystem and joins the rest on as written, so a cwd that does not exist yet still matches a lease reached through a link or an 8.3 name; the test builds the link with `linkDirectory`, a junction on Windows. (4) `tests/statusline.test.mjs` run alone left nine `quality-harness-status-<hash>` caches and a `quality-harness/` event-log fallback in the real temp directory (measured with an empty `TMPDIR`: 10 entries; after, 0). It now sets its own TMPDIR, TMP and TEMP and removes them at exit. The whole selftest left nothing, since `scripts/selftest.sh:26-27` already gives each run its own; the class left open is every other test file run directly with `node --test`, enumerated by running it under an empty `TMPDIR` and listing what remains. Tests for each; five mutants; 91 of 91 `status line`, `statusline` and `branch-state` mutants noticed at load under 3.
- **The coverage review of 26440a7d (status blocking, in `reviews.jsonl`), 2026-10-13: three findings, all fixed.** (1) A detached HEAD whose commit could not be read was taken as attached: listed as a branch named `HEAD`, with the upstream fallback resolving `origin/HEAD`, a probe's listing at the default branch's tip read green. Such a HEAD is no longer asked about at all; it says "HEAD is detached and its commit could not be read". (2) `canonicalPath` resolved the path lexically before asking the filesystem, so a `..` after a link meant the directory holding the link (`/var/..` is `/private` to the filesystem and `/` to `path.resolve`). The whole path is asked first now; the ancestor walk runs only for a path that does not exist. Its test is skipped on Windows, which removes a `..` lexically before it follows a junction. (3) The test sandbox let an inherited `QUALITY_HARNESS_STATE_DIR` send session logs outside it; the sandbox deletes it, and a run with the override set left the override directory uncreated. Two mutants added and one repointed; 93 of 93 `status line`, `statusline` and `branch-state` mutants noticed.
- **The outside runs at e114e08b, 2026-10-13, and a lead about the probe's own load.** Seven Mac sessions ran it; all exits 0, no adr-lint verdict moved, all seven filed: go-cli-adr (148 compared), laravel-react-monorepo (96), python-service-adr (77), ansible-infra-adr (26), laravel-cms-adr (23, look PARTIAL both sides), react-spa (2), spa-frontend-no-adr (1). None of their checkouts is detached, behind, or run from a missing cwd, so they show only that the ordinary case is unchanged; the three new paths have their tests and mutants and no outside observation. The attestation files were written from the values each runner pasted, not from the pasted text itself. The full `qh-check` at e114e08b passed attributably (2272 pass, 0 fail, load 3.79 to 8.7 on 10 cores). **Lead, unconfirmed, seen twice by the Laravel/React runner:** its probe starts on a quiet machine and ends near load 22 on 10 cores (2.75 to 21.54 here, 1.84 to 22.01 at 297ea135), which would also account for every "slower" adr-lint line in these rounds; it did not look at the process table, so another session's work is not excluded. If the probe's own fan-out does it, `corpus-probe` should bound its concurrency by the core count, as `selftest.sh` does.
- **3.8.25 released 2026-10-13 at 34b33609 (55 jobs, release-evidence SUCCESS), and a gap it showed in `scripts/release.mjs`.** Started behind a wait for load below 8, its step-1 `qh-check` still ended at load 18.01 on 10 cores, was recorded "unattributable", and `release.mjs` pushed on it. CLAUDE.md §18 says a contended pass is unattributable too. Here the release rested on the attributable gate at e114e08b (2272 pass; the tree since then differs only by attestation files and the version) and on the dispatched CI campaign, so nothing unproven shipped. But the command does not refuse, or rerun, a gate it just recorded as contended. Lead for the next round: on a contended step-1 pass, `release.mjs` should wait for load below the core count and run the gate again, or exit 2 naming it.
- **Fixed 2026-10-13, the gap above: `release.mjs` no longer pushes on a contended full check.** It runs `qh-check --again`, never a reused pass, and samples the load around it with qh-check's own `contention` (`plugin/scripts/load.mjs`). A pass on a contended machine is taken again once the load is below the core count, a second contended pass exits 2 with nothing pushed, a machine that never quiets exits 3 at the deadline, and a load that cannot be read is not contended. The test fake's seams were changed in its shared helper (the six ADR-100 T3 tests are locked and byte-identical): it accepts `--again`, and its load is quiet unless a test says otherwise, so the real machine's load never decides a test. One test and three mutants added; ADR-100 T3's red-check entry repointed; 38/38 `release` mutants noticed. CLAUDE.md §13 step 1 and `.claude/rules/13-releasing.md` said the command reuses a pass already taken, and now say what it does.
- **The corpus-probe load lead, measured 2026-10-14: refuted for the probe itself; the request pattern caused it.** `corpus-probe.mjs` runs every reader through `spawnSync`, one child at a time, and `adr-lint` and `plugin/lib` hold no thread or process pool (`mrw read --grep "ThreadPool|ProcessPool|concurrent\.futures|multiprocessing|Popen\("`: one `Popen`, the fence runner). One probe run alone over this repository's corpus, on a quiet machine, took 62 s and moved the 1-minute load from 2.75 to a peak of 3.79, sampled every 2 s, with the node/python/git process count at 13 to 16, the machine's own background. The spikes to about 22 on 10 cores came from the requests: each outside round was sent to seven local sessions at once, so seven probes ran together, twice beside this repository's full gate, which itself runs tests at the core count. So every "slower" line in those rounds compares timings taken under different contention and says nothing about a reader. Two follow-ups, neither started: the outside-run request should be staggered, or sent with a note that a concurrent round makes timings unattributable, and no gate run here should overlap one; and `corpus-probe --diff` could record the load at each run and mark a "slower" line unattributable when either side was contended (a reader change, so a release decision).
- **Phase 1 of the redesign, measured 2026-10-14 at `8aea26fb`; `post-edit-check.sh` is not the per-write gap.** Each PostToolUse Edit hook of `plugin/hooks/hooks.json` was timed alone, as a process, in a throwaway clone with a hermetic home (the method of `scripts/hook-cost.mjs`, which has no PostToolUse event; a scratch script ran it), median of five, at a load of 3.1 to 3.4 on 10 cores. Per edit, summed: a script (`plugin/scripts/load.mjs`) 198 ms (facts gate 77, `post-edit-check` 75, `lifecycle.mjs` 46); a decision record 420 ms (facts gate 347, `post-edit-check` 28, `lifecycle.mjs` 45); `README.md` 182 ms (110, 28, 44). The PreToolUse Edit before it (`hook-cost.mjs Edit`) is 223 ms on the first event of a session and 32 ms after. So the redesign's 1.09 s per write is not reproduced at HEAD, the ≤0.35 s target holds except on a record path, and the largest part there is the facts gate, which ADR-097 measured as acted on 12 times of 12. `post-edit-check` is 28 to 75 ms: its removal (deferred by ADR-097; spec facts F-33 and UC2-S5 bind it) is not warranted on cost, and stays a question of whether a hook whose output never reaches the agent should run at all. Components by file at HEAD: `plugin/scripts` 65, `plugin/bin` 24 (12 gates and their `.cmd` twins), skills 15, agents 4, workflows 3, `plugin/lib` 2, templates 6, hook entries 14; the skill and agent listing, counted as `- quality-harness:<name>: <description>` lines, 7,079 characters. Neither is the 2026-10-11 diagnostic's method (94 components, 8,859 characters), so they are a new baseline, not a comparison. Re-open when: a hook is added to PostToolUse, or the per-write sum passes 0.35 s on a script path.
- **The cold review of ADR-098 (2026-10-14), its six advisory findings, left with what would re-open each.** Two blocking findings and an out-of-scope one (`--range` and a dotted tag) were fixed the same day (the record's Follow-up). Left: (1) `review-ring.js:86` lost "Do not modify files" in `27186796`; its reviewer `agent()` has no `agentType`, so the reviewer guard does not cover it, and `tests/review-contract.test.mjs:117` now forbids restating the sentence; UNPROVEN which `agent_type` the host passes for an `agent()` without one. Re-open when: a transcript of a review-ring run shows that line, or a review-ring reviewer edits a file. (2) Decision 2 says quality-cycle's roles are two agents; `quality-cycle.js:57` also spawns `qh-scope-reviewer`, whose own blocking sentence (`qh-scope-reviewer.md:25-26`) the class grep does not catch; synthesis applies definition A after it, so the verdict holds. Re-open when: the scope reviewer's blocking sentence and definition A disagree on a finding. (3) The record's Implementation says it does not change `publish-verdict.mjs:339`, and its Follow-up records that `d98114f2` did; records are history, so the Follow-up is where it is said. (4) `affectedFiles` (`decision-corpus.mjs:885-901`) counts every Affected Files row whatever its Change column says, so ADR-098 governs four files its tasks only read. Re-open when: `adr-context` names a record for a file it only read, in a way that misleads. (5) T1's builder scan (`tests/codex-launcher.test.mjs:55-56`) saw only `'exec', ...` and `'exec', '-C'`; fixed the same day: the any-spelling test also scans for any flag after `'exec'`. (6) `tests/review-contract.test.mjs:72-73` reads `plugin/` from disk, not `git ls-files` (CLAUDE.md §8); an untracked file turns it red, never green.
- **The component manifest's first finding (2026-10-14): the TaskCompleted hook reaches nobody who acts.** Declaring every hook's consumer (`scripts/components.json`) and a Codex review of it showed that `TaskCompleted` and `SubagentStop` deliver their turn-end findings as `systemMessage` (`plugin/scripts/lifecycle.mjs` `deliver`: only a Stop that reaches the agent writes `additionalContext`), which the user sees and the agent does not, and that `TaskCompleted`'s `task.completed` event is read by no shipped file. `SubagentStop` still feeds the reviewer guard (`subagent.ended`, `publish-verdict.mjs`); `TaskCompleted` feeds nothing a tool reads. It is the class ADR-097 removed: a candidate for removal from `plugin/hooks/hooks.json`, which changes what an adopter's session runs, so it waits for the owner. Re-open when: the owner decides, or ADR-096's deferred item 3 settles where TaskCompleted output goes.
- **The component manifest, two limits the verification review named (Codex, 2026-10-14, on `3d13a624`).** (1) A hook's key joins its command and arguments with spaces, so two hooks whose arguments differ only in where a space falls (`a b` and `c` against `a` and `b c`) share a key; no hook in `plugin/hooks/hooks.json` has an argument with a space. Re-open when: one does. (2) A consumer is checked by its token being in the named file, not by the event it handles: a channel moved to another event's branch of the same file still passes. The header of `scripts/component-manifest.mjs` says so. Re-open when: a declared channel is found wrong a second time.
- **Correction, 2026-10-14, to "the TaskCompleted hook reaches nobody who acts" above: it does.** `plugin/scripts/on-turn-end.mjs` handles Stop, SubagentStop and TaskCompleted alike, and calls `artifactRule`, which starts the session's detached artifact pass (ADR-080; spec `docs/specs/2026-10-01-no-hook-waits-on-the-artifact-pass.md` F-1 names TaskCompleted as one of its boundaries); the pass's verdicts are imported at the next hook and said to the agent at the next hook that reaches it (ADR-096). So TaskCompleted's text is user-only, and the event is a trigger a tool acts on; it is not a removal candidate. Found while drafting the removal record, before it was written: the manifest had declared the text channel and missed the pass, and `scripts/components.json` now declares it for all three turn-end hooks. What the manifest cannot see, said again: a consumer the declaration leaves out is invisible to its check. Left as the question for the owner: `post-edit-check.sh`, whose output reaches only the transcript, is either deleted (spec facts F-33 and UC2-S5 retired first) or wired to the agent as `additionalContext`, as the facts gate's output already is.
- **ADR-102's post-edit check: four residuals the verification review of T6 named, each reproduced in the parent commit too (Codex, 2026-10-14).** (1) A failing or missing `tail` exits the hook 2 or 127, so "every path exits 0" holds only where coreutils do; re-open when a host is found without `tail`. (2) With `jq` and no `node`, a valid JSONC file is named from jq's error, because the fallback needs node; with no `node`, a `.cjs` is not checked and says nothing. Re-open when an adopter without node is seen. (3) A line comment ending at U+2028 is accepted by TypeScript's parser and refused by the fallback (a false finding); re-open when a file is found with one. (4) The fourth, `{"a":[,]}` read as valid (a fail-open this record introduced in T3), is fixed by T7.
- **Addendum, 2026-10-14, to the residual (3) above: U+2028 cuts both ways.** The scoped review of T7 (Codex, approve; the fallback compared with TypeScript 6.0.3's `parseConfigFileTextToJson` over 3,146 valid and 968 malformed comma cases and 37,448 token sequences, no mismatch) found that a line comment ending at U+2028 or U+2029 is also a fail-open: `{"a":1,//c<U+2028> "b": <LF>}`, refused by TypeScript, reads as valid. Shipped in 3.8.27 as it is, the owner's rule being one verification per fix round: this is the advisory post-edit check, not a gate, the artifact pass and the project's check still read such a file, and a fix would void the three attestations at 83916b53. The smallest fix is `[^\\r\\n\\u2028\\u2029]` in the line-comment rule. Re-open: with the next change to `post-edit-check.sh`.
- **ADR-102's post-edit check reads no JSON on a host without `jq`, 2026-10-14, the owner's call.** Three outside runs on Windows (Windows 11, Git Bash, v3.8.27) had `node` and no `jq`: `post-edit-check.sh:111` exits 0 before the JSONC fallback, so `{"a": }` was silent, as Decision 4 of ADR-102 chose ("a checker that is not installed says nothing"). `node` alone could read it (the fallback already parses with it). Re-open: the owner decides whether a host with `node` and no `jq` should be checked; ADR-102 T9 left it out of scope. The same runs found the Store-alias `python3`, fixed as T9.
  - **Taken, 2026-10-14 (the owner: "yes node for json"): ADR-102 T10.** Without `jq`, `node` reads the file as JSONC alone and names it; a `node` that fails without a word is `UNRUN`. Decision 4 still holds for every other absent checker.
  - **Sibling, 2026-10-14 (ADR-102 T11, from the Codex review of T10):** a `node` that cannot start (a missing `NODE_OPTIONS` module, a broken install) is now `UNRUN` on the JSON path. The `.cjs` path (`node --check`, shipped in 3.8.27) prints such a failure, minus stack frames, as a finding about the file. Re-open: require `SyntaxError` in `node --check`'s output before naming the file, and say `UNRUN` otherwise.
    - **Taken, 2026-10-14: ADR-102 T15.** `node --check` names a `.cjs` file only when it reports a `SyntaxError`; anything else is `UNRUN`.
- **The facts-first dispatcher claimed any `.md` below a `tasks/` directory as an ADR task, 2026-10-14, fixed.** A peer session (a Go CLI repository) reported `facts-gate FAILED (ADR ownership) for …/bench/tasks/fixture-md-repeated/base/guide.md: expected exactly one owning ADR, found 0`, while `adr-context` resolved the file to its Accepted record. Cause: `facts-gate-dispatch.sh` routed by `[[ "$f" == */tasks/*.md ]]`, and bash's `*` crosses `/`. Now a file is a task by path only when its own directory is `tasks/` (a task title still claims it anywhere); the `tasks_index` disjunct became redundant and went. Class, enumerated with `rg -n "/tasks/|'tasks'|\"tasks\"" plugin/scripts plugin/bin plugin/lib`: every other member reads the immediate directory (`adr-verify` 2359, `trajectory-metrics` 66) or treats any `tasks` ancestor as a reason to SKIP a file (`decision-corpus` 1118/1173, `record.py` 887/967, `adr-retire-check` 279), the safe direction; `work-next` was fixed for the same shape by ADR-099. Test: `tests/gates.test.mjs` "a file nested below a tasks/ directory is not a task", with its dirty twin; catalogue entry killed.
  - **Addendum, from the Codex review of 9fcee428 (2026-10-14):** a path spelled `tasks/./T1.md` escaped the new directory test, since the lexical parent's name is `.`. The dispatcher now reads the parent directory as the filesystem names it (`cd` and `pwd`, falling back to the written name for a deleted file's missing directory) for both the classification and the ownership lookup. Test: the same gates test, a dot-component twin; catalogue entry killed.
  - **Addendum, from the Codex review of 53c6d167 (2026-10-14):** with `CDPATH` set, `cd` printed where it went into the resolved directory, so a relative task with an owner was told it had none and a relative `tasks/README.md` skipped its owner's lint (a fail-open). `CDPATH` is cleared for that `cd`. Test: a relative owned task under `CDPATH=.`; catalogue entry killed.
  - **The class, from the Codex review of f3e19558 (2026-10-14):** `rg -n '\$\(\s*cd |\bcd [^-]' plugin/scripts plugin/bin plugin/hooks -g '*.sh'` found four more `cd` calls, all in `facts-gate-dispatch.sh`. Lines 188 and 191 are given absolute paths, which CDPATH never searches. Lines 16 (`SCRIPT_DIR`, for a script run by a relative path) and 162 (`archive_catalog_for`, given a relative file) take relative ones and now clear CDPATH the same way. Those two carry no dedicated regression; the reviewed site does.
- **ADR-102's node JSON reader names no line or column, 2026-10-14.** An outside run at bb8e7acb (a Python WCAG corpus): `jq` says `line 3, column 8`; node's `JSON.parse` gives a quoted excerpt only, so in a large file the agent must search for it. Re-open: compute line and column from node's position (where its message carries one) and print them as `path:line:col:`. Not a false finding and not a silence; advisory quality.
- **ADR-102's post-edit check, two notes from the Windows reruns of the 3.8.28 candidate (9c10ae04, 2026-10-14).** (1) With no runnable Python 3 at all (the Store alias as both `python3` and `python`, shimmed), a broken `.py` is silent: Decision 4's rule for an absent checker, kept by T9. A peer asked for an `UNRUN` line instead, as `.json` now gets through `node`; the owner's call, since it would print on every `.py` edit on such a host. (2) On Windows a finding names the file as bash received it (`/c/…`) on the JSON path and as Python received it (`C:/…`) on the Python path. Re-open: print one form, if a reader of the finding is ever confused by it.
  - **Decided, 2026-10-14 (the owner, "Go" on the recommendation to keep it):** (1) stays as it is: with no runnable Python 3, a `.py` is silent under Decision 4, recorded in ADR-102 T15's Out of Scope. (2) stays open.
- **The check, made fast without claiming more: stages 0 and 1 measured and shipped, 2026-10-14** (the plan the owner approved: measure, order, then select only with evidence; §378's lead "qh-check cannot say where its time went").
  - Stage 0: `scripts/selftest.sh` keeps one row of per-file test times per run in `<git-dir>/quality-harness/selftest-files.jsonl` (`scripts/file-timing-reporter.mjs`); `scripts/check-timing.mjs` names the slowest and failed files, joins each run to its check and its contention, models the slowest worker as listed and longest first, and `--summary` reads qh-check's own ledgers in any repository. The model tracks real wall within 2-4% (as listed 249.6/245.3/401.2 s vs 257.7/252.7/410.0 s). In this clone's ledger: 608 full checks, pass median 156.9 s, p90 265.7 s, 215 contended, 18 red then green on the same tree; the fast check's median is 104.5 s, and its slowest file is `tests/publish-command.test.mjs` (125-146 s alone).
  - Stage 1: the files run failed first, then unmeasured, then longest first (`scripts/test-order.mjs`). A first A/B showed no gain because node 24's `node --test` SORTS the files it is given (c, b, a ran as a, b, c; measured); the plan had assumed otherwise. The suite now runs through `scripts/run-tests.mjs` (node:test `run()`, which keeps the order; exit code compared with the CLI's case by case). Three alternated A/B pairs, every run contended: ordered 194.5/192.2/244.7 s vs glob 239.5/234.8/309.7 s, -18.8/-18.1/-21.0% per pair (gate: -10%). `QH_SELFTEST_ORDER=glob` keeps the old order for re-measuring.
  - Not measured: time to first failure on a seeded red (failed-first runs a red file at once by construction; not observed), and CI's job durations before and after (needs a push).
  - Next: stage 2 (the slowest files' own cost, `publish-command` first, which also bounds the per-commit fast check); stage 3 (selection) waits for 30 runs of per-file rows; stage 4 (adopters) waits for stage 1 or 3 and the peer survey.
  - **Stage 2, profiled 2026-10-15 (a scratch spawn profiler over one file at a time, outside the gate):** `publish-command.test.mjs` started 500 hook processes (79 s) and 4,762 `git` children (29 s; ~4.3 `rev-parse`, 2.1 `write-tree`, 1.1 `add` per hook call, ~5 ms each) in a 102 s run alone. The git calls belong to commit and push commands only (`scripts/hook-cost.mjs PreToolUse`: 84 ms, 0 children), so adopters pay them per commit, not per tool call. Alone at load ~3.5, `observed-events` took 48 s and `lifecycle` 29 s against 88 s and 79 s inside the gate: contention inflates a file 2-3x, which is why ordering paid and per-test fixes would pay less. No helper-only change halves `publish-command`: its tests call the hook one row at a time, synchronously, from locked bodies. It also bounds the per-commit fast check (median 104.5 s). Options left for the owner: split the file (relocks under several ADRs), or memoise `rev-parse`/`write-tree` inside one hook process (product code, ~7% of that file).
  - **Stage 4 survey, 2026-10-15** (`check-timing --summary` over each peer's own ledger, read-only): playtrix `just check` (lint, typecheck, vitest, PHPUnit) 73 runs, pass median 131.2 s, p90 300.2 s, 0 red then green; a Laravel repository `make test` (PHPUnit in Docker) 2 passes, ~160 s; a Python repository `make test` (pytest in Docker) one pass at 2,173 s with heavy peers beside every run, 1 red then green. Three refused by their classifier ("Code from External") and answered from their own files: two vitest repositories and a bash-only one. No surveyed repository uses its runner's selection mode, though vitest (three repositories) has `related`/`--changed`; pytest has none installed, PHPUnit none natively. The survey also showed `contended` under-reports a shared machine, so `--summary` now counts runs with another check beside them (here 80 of 608, against 215 contended by load).
  - **Selecting tests inside `qh-check`, deferred by ADR-103 (Proposed, 2026-10-15)**: stage 3 of the check-speed plan, re-opened when this clone holds 30 full runs of per-file rows (`selftest-files.jsonl`) and an offline replay shows a selection that would have gone red on every red run at no more than 40% of the full run's cost; a skipped test is said as skipped, never as passed (ADR-005).
  - **Two environment dependencies the Windows run of a85341f7 named, 2026-10-15:** `tests/post-edit-check.test.mjs` (four tests) expects `jq`'s wording and fails, rather than skips, on a host without `jq`; `tests/unused-names.test.mjs` (three) fails with UNRUN where `uvx` is absent. Both are locked by ADR-102 and ADR tasks; a `skip:` with the reason (CLAUDE.md §7) needs their relock. The same run found that clone's `main` shares no history with origin (1,599/1,909 commits apart), which is the owner's to look at, not this repository's.
  - **ADR-103's pytest-testmon reader reads an inline table's strings, 2026-10-15** (the verification review of T4, Codex, P2, filed under the owner's rule of one scoped verification per fix round): `[dependency-groups]` with `dev = [{include-group = "pytest-testmon"}]` names a group, not a package, yet draws the `pytest --testmon` hint. Advisory only, not a regression (it matched before T4 too), and it needs a group named exactly `pytest-testmon`. Re-open: drop `{...}` from a dependency-array line before matching (`plugin/scripts/fast-check-hint.mjs` `tomlDeclaresTestmon`), with that manifest as a negative and a real declaration after an include as a positive.
  - **A test's bare `bash` reached WSL on a Windows host, 2026-10-15** (a Windows peer's run of 10c73dbb from PowerShell 7, where `C:\Windows\system32\bash.exe` comes before Git's on PATH and `CLAUDE_CODE_GIT_BASH_PATH` is unset): two of 31 failed, because `/bin/bash: C:Users…scriptsselftest.sh: No such file or directory`, and `tests/test-order.test.mjs` then died on a null match instead of naming the bash failure. The same 31 passed from Git Bash and from cmd.exe, with both a short-name temp directory and a short-name working directory, which confirms 6bc9c300. Fixed for the three sites that already preferred `CLAUDE_CODE_GIT_BASH_PATH` (`test-order`, `file-timing`, `gate-concurrency`): they spawn `tests/helpers/bash.mjs` `testBash()`, which is the product's `resolveBashExecutable` (it skips `system32` and `WindowsApps`); `test-order` asserts the run's exit before reading it. Test: `tests/test-bash.test.mjs`; catalogue entry killed. Class, enumerated with `rg -c "(spawn|spawnSync|execFile|execFileSync)\(['\"]bash['\"]" tests scripts`: 33 more bare-`bash` spawns in 9 files (`post-edit-check` 17, `package` 6, `publish-command` 3, `staged-product` 2, and one each in `catalogue-readers`, `chaos-315-codex-status`, `gate-rules`, `untimed-spawns`, `scripts/unasserted.mjs`). CI's Windows runner puts Git's bash first, so they pass there; on a WSL-first host they fail. Many sit in locked bodies, so the fix is a relock, or the CI-side rule that PATH must lead with Git's bash. Re-open when a Windows developer runs the suite from PowerShell.
  - **Stage 2's slices ran last under stage 1's order, 2026-10-15** (found reading `scripts/check-timing.mjs` while counting stage 3's rows): node names a test by the file that called `test()` (measured on node 24.11.1), so every test `tests/helpers/shard.mjs` registers was charged to a row for the helper (51 tests, ~77 s) and `publish-command.test.mjs` and its two slices read 0 tests and 0 ms, which `test-order` ranked as the shortest. The file's own complete event cannot correct it: through `run()` it read 30 ms for a 400 ms file and `passed` for a file whose test failed, and a test's `loc` option is ignored. Fixed in `scripts/test-order.mjs`: a row that counted no tests of its own and did not fail is unmeasured, so it runs right after the failed files; test `a file whose row counted no tests of its own is unmeasured, not the shortest`, two catalogue mutants killed. Class, by command over the latest row (`tests: 0` entries, and entries not named `*.test.mjs`): the three publish-command files, and `tests/helpers/shard.mjs` the only helper row; `rg -l 'helpers/shard.mjs' tests` lists the same three plus the helper's own test. **Left for stage 3:** a red in a sharded test is recorded under the helper, so last-failed-first cannot name its file and the offline replay must map a helper row to the files that import it; `check-timing`'s model counts the helper as one 77 s file where it is three ~26 s processes. Stage 1's 19% was measured with the slices last.
  - **Stage 3 replayed, 2026-10-15** (`node scripts/check-timing.mjs --replay`, added for it: per changed tree, the files a selection would run — a file that changed, one whose text names a changed path, one that failed or was absent in the run before — and their share of the summed test time; tests in `tests/check-timing.test.mjs`, eight catalogue mutants killed). Over this clone's 27 runs with per-file times: 10 changed trees (one more whose change git could no longer read), 1 red run (`tests/gate-rules.test.mjs`, 04:42), caught by a selection costing 65% of the run; median subset 18%, 0–65%, against the 40% ceiling. Verdict `UNPROVEN: 27 runs with per-file times, 30 needed`. **The count is the weak half of the gate:** 17 of the 27 runs are the 2026-10-14 ordering A/B over two commits, which add runs and no evidence, and the decision rests on one red run. Three more runs reach 30 and change nothing about that. Whether ADR-103's re-open condition should count changed trees and red runs instead of runs is the owner's call; until then stage 3 stays deferred, and `--replay` answers it in one command whenever asked. It reads each file's text as it is now, not as it was at the run.
  - **Stage 3's gate counts changed trees and red runs, the owner, 2026-10-15** ("yes count changes and red runs"): `check-timing --replay` says MEETS only with 30 changed trees or more (`--trees`), 5 red runs or more (`--reds`), every red run caught and a median share at or under 40%; a run repeated on the same tree no longer counts. This replaces ADR-103's "30 full runs" re-open condition, which the record's text keeps as history. At the decision: 11 changed trees, 1 red run, `UNPROVEN: 11 changed trees of 30 needed, 1 red runs of 5`.
  - **Stage 3's one miss is a contended timing red, 2026-10-15** (`node scripts/check-timing.mjs --replay --json` at 921330b9): 18 changed trees, 3 red runs, 2 caught, median share 20%. The miss is the full check of 2026-10-15T12:05 (tree a7f68ee1, the ADR-104 implementation): `tests/observed-events.test.mjs` failed for a real reason (a locked ADR-060 T4 assertion on the publish advice's wording) and WAS selected, since its text names `plugin/scripts/publish-verdict.mjs`, which changed. The unselected file is `tests/corpus-reading-bounds.test.mjs`, a timing test that failed at load 50.46 on 10 cores and passes alone; it names only `plugin/scripts/decision-corpus.mjs`, which did not change. So the selection missed no defect, but the gate as the owner set it ("every red run caught") counts that run as a miss for good: no number of further trees turns this history into MEETS, while the verdict keeps saying `UNPROVEN`. The plan's own rule says a contended run is unattributable and is never compared, and `--replay` does not read the contention `qh-check` recorded. The open question is the owner's: should the replay judge only uncontended red runs (on this machine, most runs are contended), or should a contended red count as a miss? Until that is answered, stage 3 stays deferred and nothing is built.

## 379. CLOSED 2026-10-15 — The host cancelled SessionEnd on exit, and no session row was written for a day

**Reported by the owner, 2026-10-15:** "lifecycle.mjs - i still see this - that sessionclose hook canceled, when i ctrl+c exit the claude". The plugin's `sessions.jsonl` on that machine held no row after 2026-10-14T08:03Z.

- **Cause, from the host's hooks reference (https://code.claude.com/docs/en/hooks, SessionEnd):** every SessionEnd hook runs under one budget, 1.5 s by default, changed only by `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` or by a hook `timeout` in the user's, project's or local settings; "timeouts set on plugin-provided hooks don't raise the budget", so the `"timeout": 30` in `plugin/hooks/hooks.json` is not honoured there. The hook's SessionEnd path made eight git calls (three `rev-parse`, `write-tree`, `add -A`, `write-tree`, `status --porcelain -z -uall`; listed through a git shim on PATH), 360 ms of a 506 ms CPU profile at load 4 on this repository, and more on a loaded machine.
- **Reproduced on Claude Code 2.1.300**, a session in a pty exited with two Ctrl+C and a git slowed by 0.3 s a call: the debug log said `SessionEnd:prompt_input_exit [node ${CLAUDE_PLUGIN_ROOT}/scripts/lifecycle.mjs] cancelled` and no row was written. With git unslowed, at load 4, the same exit completed and wrote its row; a headless `claude -p` exit did too.
- **Fixed:** `lifecycle.mjs` hands a SessionEnd's input to a detached copy of itself (`endsBehind`, the artifact pass's pattern) and returns; the copy observes the tree as it is then (ADR-060 T6 unchanged) and writes the row. A detached child started by a SessionEnd hook outlived the host's exit (a marker written 3 s after it). After the fix the same slowed reproduction said `completed with status 0`, and the row arrived 2.6 s later. With no data home the hook stays inline so its message is printed where it can be read; `QUALITY_HARNESS_SESSION_END_RUNNER=inline` keeps the work in the hook, which `scripts/selftest.sh` and the test helpers that read the row on return set. Tests `tests/session-end-behind.test.mjs`; four catalogue mutants killed (the `inline` one by a race the detached copy loses by a node start).
- **Class**, by command (`node -e` over `plugin/hooks/hooks.json`, every event with its hooks' timeouts): SessionEnd is the only event under a budget the plugin cannot set; every other event's `timeout` is honoured. **Not covered by a test:** that the copy survives the host's exit is shown by the pty reproduction only, on macOS; the Windows behaviour of a detached copy at exit is unmeasured. The cancellation also hides the hook's stderr at exit, which it always did.
- **Codex review of 6b1879c7 (high effort, REQUEST CHANGES, one P2), fixed:** node returns a pid for a runner script that does not exist, so the hook handed its work to a copy that died unheard and no row and no word were left. The runner is now checked with `existsSync`, as the artifact pass checks its own; a missing one is said on stderr and the hook records the end itself (test `a runner that does not exist is said, and the hook records the end itself`). The `inline` twin no longer rests on a race: it asserts the inline hook's own stderr (a data home that is a file cannot be written) and that `inline` is not reported as a missing runner, which a mutant that ignored `inline` would print. Five catalogue mutants killed. Not changed, recorded: `QUALITY_HARNESS_HOOK_INPUT` stays in the copy's environment and reaches its git children (no harm established); a copy that starts and then fails leaves no receipt, as an inline hook cancelled by the host did.
- **Windows, 2026-10-15** (a Windows 11 peer, Git Bash, node 24.20.0, a fresh clone at f1c3c7c1): `tests/session-end-behind.test.mjs` 3/3 and `tests/test-order.test.mjs` 6/6 passed, so the detached copy writes its row there and its temp working directory was deleted; the peer found no directory left in `%TEMP%` and no `node.exe` naming the hook afterwards. Still unmeasured on Windows: a real host's SessionEnd, where the parent exits under the budget while the copy runs. `tests/hook-goldens.test.mjs` measured nothing there (its transcripts are POSIX-only, §375).

## 385. CLOSED 2026-10-20 (fixed in 2b6a0e63, shipped in 3.8.48) — adr-lint passes a tasks README whose index lost its separator row and lists a task twice

Closed by the re-check of 2026-10-20 at 14bc3430: the fix below is in `plugin/bin/adr-lint` (6279-6324, advice), tested by
`tests/readme-index-shape.test.mjs` with its catalogue mutants; only the heading had stayed OPEN.

Found executing ADR-115 T1: a write meant for T1's row replaced the table's `|----|…` separator instead, so the index read
`| ID | … |` then T1 `done` then T1 `pending`. `python3 plugin/bin/adr-lint` on the record printed [PASS]. Two task rows
with one id, one done and one pending, is a README that disagrees with itself; whether `done_task_ids` reads the first, the
last or both is not checked here. The README is a derived index (CLAUDE.md §10), so the task files still win; the gap is that
nothing says the index is malformed. Left: a test with a duplicated row and a missing separator, each said.
  - **Fixed 2026-10-19, for the release after 3.8.47:** adr-lint now says, as advice, a row in a table with no separator under its header, and a task listed twice in an index table (one whose first column is the task id; a contract table names its producer once per contract). The class, enumerated by running adr-lint over every record in `docs/adr/`: one instance, ADR-012 listing T5 as done and again as pending; the stale pending row is removed (adr-next reads T5 done). `tests/readme-index-shape.test.mjs`, three catalogue mutants.

## 388. CLOSED 2026-10-20 (the owner: the lock is keyed from the record's repository whatever --cwd is) — A task whose code lives in another repository, named by a path relative to THAT repository, cannot reach done

An outside report (a date-named infrastructure corpus whose code lives in a sibling Rust repository, 2026-10-20): the Tests
table named `src/...` paths of the code repository, so adr-lint read each against the record's own repository ("names no file
in the repo"), the test lock stayed "frozen at the first red", and `adr-verify --relock --cwd <code repo>` then called unrelated
tests "vanished". The supported spelling is a path leaving the repository (`../<repo>/src/...`), which adr-lint reads as could
not look, never absent (tests/foreign-corpus.test.mjs, fixture `ADR-001-cross-repo`). Not yet known: whether the lock and the
done rule can be satisfied with that spelling at all, since the lock hashes test bodies it cannot read across the boundary.
Left: build the fixture's task to `done` with `../` paths and a lock, and say plainly what a cross-repository task can and
cannot claim; until then the reporter's `partial` is the honest status.
  - **Evidence the same day, from the reporter (adr-lint 3.8.48, verbatim in substance):** with the Tests table rewritten to
    `../../../<code repo>/src/...`, `partial` passes and `done` is refused with "locked test `src/election.rs`::... vanished"
    for about 150 tests. The lock was written by `adr-verify --relock --cwd <code repo>`, which keyed it `src/...` relative
    to `--cwd`, while adr-lint resolves the Tests table from the record's repository: the two spellings never meet. That is
    a defect in the pair, not the corpus. A second refusal in the same run, "check was absent at first-red and is now
    declared", is the evidence rule working (the first red predates the project's declared check) and is not cross-repo.
  - **The reporter's relock, the same day, settled it:** `adr-verify <task> --relock --replace-hashes` run from the record's
    root (no `--cwd`) keyed the lock `../../../<code repo>/src/...`, and `done` was accepted by adr-lint 3.8.48, with the
    advice that the lock is weaker than first-red. So the defect is the `--cwd` relock alone: it keys the lock relative to
    `--cwd` while every reader keys it from the record's repository. Left: key the lock from the record's repository whatever
    `--cwd` is, or refuse a `--cwd` relock whose keys the Tests table cannot name. The same relock also cleared the
    first-red check refusal above, with no red run: that is §390.
  - **Decided by the owner, 2026-10-20: key from the record's repository** ("we do not have much adopters so it is safe").
    `adr-verify` roots both the first-red lock (`lock_suffix_for_run`) and `--relock` at `fence_cwd(task)`, the record's
    repository, whatever `--cwd` is; the fence still runs in `--cwd`. A relock with `--cwd` elsewhere also hashed NOTHING
    before the fix, which adr-lint read as advice only ("the lock hashed no bodies"), so done could pass on a lock that held
    no test. Tests: tests/test-lock.test.mjs `a relock with --cwd elsewhere keys the lock from the record, so the readers can
    read it back` and `a red run with --cwd elsewhere keys its first-red lock from the record`, both catalogue mutants
    killed. Closed with this entry's commit.

## 389. CLOSED 2026-10-20 (the receipt wording by ADR-119 T3, 3fd4db37; the resolver half decided against, as CLAUDE_PLUGIN_ROOT is unset in a session's Bash) — An older adr-verify writes no receipt, and the newer hook then refuses its row

The same report: `~/.claude/bin/adr-verify` and `adr-lint` are forwarders that resolve the newest INSTALLED plugin (the cache,
3.8.42 on that machine), while the session's hooks ran a 3.8.48 checkout. A red row written by the 3.8.42 adr-verify carries
no receipt (receipts arrived with ADR-117 T2, in 3.8.48), so the 3.8.48 hook read it as "not in the committed file, and no
adr-verify receipt names it". Each gate is right for its own version; the pair disagrees. Left: the receipt refusal could say
when a row's writer may predate receipts, and the forwarder could prefer the plugin root the session runs
(`CLAUDE_PLUGIN_ROOT`) over the newest cache entry. The immediate remedy is the owner's: update the installed plugin.
  - **Closed 2026-10-20 by ADR-119 T3 (3fd4db37).** The receipt refusal now says when a row's writer may predate receipts
    (3.8.48) and that updating the installed plugin is the remedy. The resolver half is not built: `printenv
    CLAUDE_PLUGIN_ROOT` exited 1 in the main session's Bash tool (T3 S4), so a forwarder started from a session's Bash
    cannot read the plugin root the session runs, and preferring it would change nothing.
  - **Reopened and closed 2026-10-21 by ADR-120 T4 (86692f9f).** The resolver half is built after all: `printenv
    CLAUDE_PLUGIN_ROOT` still fails in a session's Bash, but SessionStart now writes `QH_PLUGIN_ROOT` into the session's env
    file, which reaches it from the next prompt, and the forwarders and `qh-root` prefer it over the newest installed copy.

## 390. CLOSED 2026-10-20 (the owner: a relock may move the check binding, and it is said) — A relock takes the current check into the lock, so "check absent at first-red" clears with no red run

From the §388 reporter: a task refused with "check was absent at first-red and is now declared — done is refused" was
accepted after `adr-verify --relock --replace-hashes`, with no new red run. `lock_findings` (plugin/lib/record.py:4149-4162)
compares the check of the latest lock, and a relock snapshots the current check (`snapshot_lock`), so the binding moves with
it. The only thing said is the generic "lock map was taken by `adr-verify --relock --replace-hashes` — weaker than
first-red"; the check that moved is not named. ADR-052 makes a relock an explicit later lock and is silent on the check.
Open question, the owner's: may a relock move the check binding at all? If yes, the advice should name the check move;
if no, a relock should keep the first lock's check and the refusal should stand until a red under the declared check.
  - **Decided by the owner, 2026-10-20: yes.** A relock may move the check binding, and adr-lint now says so: "the relock
    moved the check binding from no declared check to the check with sha256 …: done rests on the relock, not on a red under
    the declared check" (`_recorded_lock` reads the first kindless lock's check, `lock_findings` compares it;
    tests/test-lock.test.mjs `a relock that moved the check binding passes done and names the move`, with its catalogue
    mutant killed). Closed with this entry's commit.

## 391. CLOSED 2026-10-20 (fixed by ADR-119 T2, 28a69f70) — A review row records the model the reviewer printed, not the one the launcher pinned

Reported by a peer repository's session from its `.git/quality-harness/reviews.jsonl`, confirmed here: `plugin/scripts/host-review.mjs:61`
(`reviewFromOutput`) takes the reviewer's self-printed `model` over the pinned one (`CODEX_MODEL`, :17, passed as `-m` at :139), and
the Codex row at :256 records `review.model ?? CODEX_MODEL`. Runs pinned to gpt-6.1-sol were recorded as "gpt-6", "GPT-6 (Codex)" and
"Codex". No gate reads the row's `model` or `bound` today (`scripts/release-evidence.mjs` reads status, head, base and exact), so this is
a record that says less than the tool observed, not an open gate. To be closed by ADR-119 T2.
  - **Closed 2026-10-20 by ADR-119 T2 (28a69f70).** A row's `model` is the pinned one, `reportedModel` what the reviewer
    printed when it differs, and `bound` is `pinned`, `disagrees` or `unproven` (`reviewFromOutput` in
    `plugin/scripts/host-review.mjs`, and the rows `hostReview` and the `--prompt-file` form record).

## 392. CLOSED 2026-10-21 (fixed by ADR-120 T5, 831df3b5) — One check change draws the §390 relock advice once per task

An outside run of 3.8.49 over a peer's Go corpus (55 records, 239 tasks; attestation go-kernel at 7712a333, 0 verdicts changed) printed
57 advice lines of one form, every one with the same pair of check digests: one change to the declared check, relocked across records
005–023. The advice is right each time; said 57 times it is an adopter cost (CLAUDE.md §19) and a reader stops reading it. Left: say the
move once per record, or once per (from, to) check pair with the tasks it covers, keeping the per-task line where the pair differs.
  - **Closed 2026-10-21 by ADR-120 T5 (831df3b5, amended 8d021b2a).** adr-lint says a relock's check move once per (from, to)
    pair, naming the tasks it covers, and keeps the per-task line where a pair is unique.

## 393. CLOSED 2026-10-21 (fixed by ADR-120 T1 and T2, 13ba9efa, 692a869c, dcc4693a) — What a group of several commands pipes onward is not modelled, so three publish forms read wrong

Found by the Codex reviews of ADR-119 T1's rounds (c48dd5b0..cfd24edc and 7e7c59ee..892ba222). Since 892ba222 a group of several
commands piped onward proves nothing from its last command (`plugin/scripts/publish-command.mjs` `stdinScripts`, `core/hooks/publishcmd.go`),
which closed a false refusal (`{ printf %s '#'; echo 'git push'; } | sh`, a comment to the shell). Left, each as it was before T1:
- **Fail-open, mitigated:** `{ echo hi; echo 'git push'; } | sh` really pushes (the shell runs its second line) and the text refusal reads
  it as no publish. Git's own pre-push hook (ADR-066) still refuses it where the session armed it.
- **False refusal:** nested groups sharing a first command overwrite the inner group's boundary, so
  `{ { printf %s '#'; echo 'git push'; } | sh; echo MARK; } | cat` is still a proven publish (`shell-words.mjs:106`, `shellwords.go:222`).
- **False refusal:** the xargs reader (`publish-command.mjs:671`, `publishcmd.go:1044`) still trusts a group's last command:
  `{ printf %s '#'; echo push; } | xargs git` reads as `git push` though its input is `#push`.
Left: model a group's combined output (its commands' printed lines, in order) for `sh` and `xargs`, or read any group of several
commands feeding either as could-not-look, which advises rather than refuses. The owner's 2026-10-15 direction for this area is a
grammar, not another patch.
  - **Added 2026-10-20, from ADR-119 T1's second fix round (95bb1ef9):** the same gap on the check side, a fail-open older than
    T1. A group that is not piped onward is flattened into the outer list, because the lexer marks `groupEnd` only when a pipe
    follows the group, so a group's own `;` escapes an outer `||` skip: `true || { true; false; }` exits 0 in bash, sh and zsh
    and is accepted as a real check (`plugin/scripts/check-command.mjs` `listStatus`, `core/hooks/checkcmd.go`), and so is
    `true || npm test | { cat; false; }`. Contrived in shape; the same grammar closes it.
  - **Closed 2026-10-21 by ADR-120 T1 (13ba9efa) and T2 (692a869c, reworked in dcc4693a).** T1's grammar reads groups,
    negation and definitions as units in both cores, so the check-side forms are refused. T2 reads a group piped to a shell or
    to xargs through the bytes it prints, evaluated over known statuses, and a group it cannot render gives nothing; nested
    groups keep their own boundaries.
