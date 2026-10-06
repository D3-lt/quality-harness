# ADR-088: A row's sha fits its repository, and a publish pass names its ledger record

**Status:** Accepted
**Date:** 2026-10-06
**Owner:** Zy
**Spec:** None — no spec stage; docs/BACKLOG.md §351 lists items 8 and 9 of §295 as still open, and item 9 says "This needs a record"
**Cross-references:** docs/adr/ADR-020-a-run-leaves-a-trace-outside-the-file.md, docs/adr/ADR-021-a-deleted-row-is-a-change-to-the-evidence.md, docs/adr/ADR-025-a-clean-run-is-evidence-of-itself.md, docs/adr/ADR-052-an-explicit-relock-is-not-a-later-red.md, docs/adr/ADR-060-advisories-react-to-observed-events.md, docs/adr/ADR-061-an-unchecked-publish-is-refused.md, docs/adr/ADR-066-git-refuses-an-unchecked-publish.md, docs/adr/ADR-081-qh-check-reads-its-own-ledger.md, plugin/skills/adr-execute/SKILL.md, docs/BACKLOG.md, CLAUDE.md, .claude/rules/16-classifiers-are-empirical.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks. T1 and T2 each add one campaign mutation per `Rests-on` name; naming them before they exist would be a pointer to nothing.
**Invalidates:** ADR-061 — "not `check.passed`" in its Decision now means: no check event, bound to a `checks.jsonl` record, grades the tree passed. A pass that only the session log holds no longer clears the refusal. ADR-066 — its T1 locks `an unresolved check order is not worded as unchecked`, whose hook half seeds the session log with events no ledger holds. Under T2 that fixture is refused, so the test is relocked (ADR-052) with ledger-backed events and unchanged assertions. That is an owner decision (Follow-ups).
**Served-path change:** `adr-lint` blocks, and `adr-next` does not count, a Verification Log row whose sha is wider than the repository's object format can print. `adr-next` counts the 4-6 and 41-64 character shas `adr-lint` already accepts, so the two stop answering one task two ways. Rule P and git's publish hook refuse an unchecked publish whose only pass is a check event that names no `checks.jsonl` record.

## Context

All measurements were taken 2026-10-06 against the working tree at ee82e08 (git 2.56.0, node 24.11.1), in scratch directories built from `tests/fixtures/corpora/go-module` and by the real hooks. No commit was made in any scratch repository.

- **The bound this record lives inside (ADR-020; the adr-execute skill's "What it does NOT prove is that a command ran"; GitHub issue #4).** Everything these gates read is written by a person or an agent with the same rights. A local gate cannot tell a run from a transcription, and nothing here changes that. What a design can do is raise the cost of forging, and make every reader agree on what it accepts. This record claims no more than that.
- **Item 8, reproduced.** A one-row done task (`T1` of the fixture) was changed one way at a time. Each variant was linted with `python3 plugin/bin/adr-lint` and its output was diffed against the baseline:

  | Variant | adr-lint | Output vs. baseline | adr-next `T1` |
  |---------|----------|---------------------|---------------|
  | baseline (`no-git`) | exit 0 | — | done |
  | the passing row repeated | exit 0 | identical | done |
  | a 41-character sha, in a SHA-1 repository | exit 0 | identical | **READY** |
  | a 40-character sha naming no object | exit 0 | identical | done |
  | a 4-character sha (`2026`) | exit 0 | identical | **READY** |
  | a 64-character sha | exit 0 | identical | **READY** |
  | a 65-character sha (control) | exit 1, off-grammar | — | — |
  | a later-dated row placed before an earlier one | exit 0 | identical | done |

  So the item stands as written: all four forgeries pass with no finding. It also hides a defect the item did not name. `adr-lint`, `adr-verify`'s `SHA_FIELD` and `record.py`'s `_MACHINE` accept 4-64 characters. `adr-next`'s two row patterns, and `adr-verify`'s count of prior passes, accept 7-40. One task is therefore `done` to one tool and `READY` to another.
- **The class: every pattern over a row's sha.** Enumerated with `mrw read --grep '\[0-9a-f\]\{(4|7),(40|64)\}' plugin`, which matched eight lines in six files. Six read evidence rows:
  - `plugin/bin/adr-lint:169`;
  - `plugin/bin/adr-verify:2005` and `:3190`;
  - `plugin/lib/record.py:778`;
  - `plugin/bin/adr-next:95` and `:117`.

  Two do not: `plugin/bin/adr-judge:86` matches a commit named in prose, and `plugin/scripts/branch-state.mjs:374` matches a CI run's sha. **Prior art (§5):** BACKLOG §47 widened the readers to 4-64 on 2026-08-29. An honest clone with `core.abbrev=4` makes `adr-verify` write a 4-character sha, and a SHA-256 repository prints up to 64. `tests/gate-regressions.py:1999-2027` pins the four readers it named, and `adr-next` was not among them.
- **What width git can print.** In a SHA-1 repository, `git rev-parse --short=41 <object>` printed 40 characters. In a `--object-format=sha256` repository it printed 41, and a full name there is 64. So a 41-character sha is impossible in a SHA-1 repository and legal in a SHA-256 one. Any narrowing has to be keyed on `git rev-parse --show-object-format`.
- **Why the sha's existence is not checked (§320's "by design", measured rather than restated).** `git cat-file -e <sha>^{commit}` was run over the sha of every row:
  - this repository's 242 distinct shas: 0 name no commit in this clone, and all 242 name no commit in a `--depth 1` clone of it;
  - two other corpora on this machine: 14 and 36 shas, 0 naming no commit;
  - the only misses found anywhere were 4 shas in `docs/TUTORIALS.md` and `README.md`, which are examples, not rows.

  So an existence check never fires on honest rows in a full clone, and fires on every row in a shallow one. A shallow clone is `actions/checkout`'s default. A rebased or squash-merged branch is the same case, unmeasured here only because this repository commits to `main`. A forger defeats the check with one `git rev-parse --short HEAD`, or by copying a sibling row's sha. §320 holds: the check costs honest work and costs a forger nothing.
- **Duplicates are written by the tools.** A scan of every task file's Verification Log found the following. In this repository: 224 logs, 9 repeated rows, 0 logs whose dates run backwards. Three of the repeats carry `ms:`, in ADR-035 T3, ADR-054 T4 and ADR-076 T2. ADR-076 T2's pair entered in one commit (`26d099f`), the one that recorded its mutants. The ADR-054 pair is `adr-verify --relock` snapshot rows. In the other corpora on this machine: 37 logs, 7 repeats, none carrying `ms:`. Why one run was written twice is not established. A finding on a repeated row would fire on tool output.
- **What a duplicate or a reorder moves.** The fixture was run through `adr-lint`, `adr-next --all`, `trajectory-metrics.mjs --json` and `corpus-report.mjs --json`:
  - neither gate changed;
  - a repeated row raised `entries` from 1 to 3 in both metrics;
  - one hand-appended `exit 1` row, wherever it sits, moved `shownAbleToFail` from 0 to 1.

  So no gate verdict moves. Two counts move, and they move for a hand-written row whatever its order.
- **Item 9, reproduced through the real PreToolUse hook.** The scratch repository declared `sh check.sh` (which exits 1), started a session, edited a file, then asked about `git commit -qm x`:

  | What was written before the publish | Decision |
  |-------------------------------------|----------|
  | nothing | `deny` |
  | `qh-check` really ran and failed (control) | `deny` |
  | session log: `{"event":"check.passed","after":{"tree":<tree>}}`; `checks.jsonl` absent | **allowed, silent** |
  | session log: the same, naming `record: "no-such-record"`, `seq: 99` | **allowed, silent** |
  | session log: `{"event":"check.timeout","after":{"tree":<tree>}}` | **advice** |
  | `checks.jsonl`: `{"id","exit":0,"git":true,"before":<obs>,"after":<obs>}`, five fields | **allowed, silent** |
  | `checks.jsonl`: `{"id","after":<obs>}` (graded `check.unproven`) | **advice** |
  | `checks.jsonl`: a pass of `echo other`, not the declared check | **allowed, silent** |
  | `checks.jsonl` or the session log: one unparseable line | **advice** |

  `checkEventsFor` (`plugin/scripts/lifecycle.mjs`, read 2026-10-06 at `:4716`) accepts any `check.*` event whose `after.tree` matches. `publishVerdict` (`:5157`) reads the session log at `:5181` and trusts what it finds. Two other facts frame the result. The only writer of `check.*` events is `importCheckRecords` (`:4414`), which copies `checks.jsonl`. ADR-060 is caught by `a check event is written by qh-check`. **The honest bound:** binding an event to the ledger moves a silent forge one file over, at about the same cost. Anything that can append either file can still turn the refusal into advice with one unparseable line, because ADR-061 never refuses on a could-not-look. That rule is not changed here.
- **What binding would cost honest sessions.** Every repository under the owner's projects directory that holds session logs was scanned: 3 repositories, 54 logs, 5,543 `check.*` events. All 5,543 name a `checks.jsonl` record whose `after.tree` and whose grade by today's `checkEventName` are the event's. Every event carries a `record` id, because the importer has written one since ADR-060 T2 (`4850fa0`, 2026-09-17). The constraint that picks the seam is test locks. `python3 scripts/test-locks.py` shows two locked tests that seed unbound check events through the real hook:
  - `an unresolved check order is not worded as unchecked` (locked by ADR-066 T1), which reaches the publish verdict;
  - `SessionEnd records what was left unverified, and the next startup here says so` (locked by ADR-068 T2), which reaches only the SessionEnd status.

  Twenty-five more sites, in five files, pass hand-built logs to pure functions.
- **Prior art for the binding (§5).** ADR-081's revision already reads the ledger this way for the fast exemption: "A row without a record id stops the skip and the exemption". `latestFastPass` reads `fast-checks.jsonl` directly.

## Existing Primitives Audit

- **`SHA_FIELD` and the §47 truth table** (`tests/gate-regressions.py` `SHA_GRAMMAR`). T1 moves the field into `plugin/lib/record.py`, beside `_MACHINE`, which already spells it. `adr-lint`, `adr-verify` and `adr-next` import it rather than restating it (ADR-045: one record grammar, loaded, not copied).
- **`record.git_root`**: T1 asks the same root for `rev-parse --show-object-format`. One bounded spawn, cached per root.
- **`importCheckRecords`** (`lifecycle.mjs:4414`) and **`checkEventName`** (`:4377`): T2 reads `checks.jsonl` with the same parse and grades each record with the same function. No second grader.
- **`readEvents`, `logIncomplete`, `checkStanding`**: unchanged. T2 filters the log `publishVerdict` reads before they see it, so every pure function and every test that hands one a log is untouched.
- **ADR-061's could-not-look rule**: reused as is. A ledger not read whole binds nothing and refuses nothing.

## Decision

1. **One sha width for every row reader, keyed to the repository (T1).** `record.py` owns the row sha field: 4 to 64 lowercase hex, an optional `*`, or `no-git`. Every reader in the class above imports it. Where `git rev-parse --show-object-format` answers `sha1`, a row whose sha has more than 40 characters is off-grammar:
   - `adr-lint` blocks it, as it blocks any off-grammar row;
   - `adr-next` and `adr-verify` do not count it as evidence.

   Where git answers `sha256`, or cannot answer, the field is 4-64. A could-not-look reports no finding.
2. **A sha's existence, a repeated row and the order of dates are not checked.** This is the stated limit, with the measurements above as its reason. It is said in the adr-execute skill's paragraph on what a `done` does not prove, so the next triage does not file it again as a fail-open.
3. **The publish verdict counts only check events its ledger holds (T2).** Before `publishVerdict` judges, every `check.*` event in the session log except `check.source-unreadable` is kept only when three things hold:
   - `checks.jsonl` was read whole;
   - it holds a record whose `id` is the event's `record`;
   - `checkEventName(record)` is the event's name, and the record's `after.tree` is the event's.

   An event that fails is dropped, and the refusal text says so in one clause. When `checks.jsonl` was not read whole, nothing is dropped. The existing torn-source rule then yields ADR-061's could-not-look advice, never a refusal. Both PreToolUse rule P and git's hook (`publish-hook.mjs`) reach this through `publishVerdict`. The Stop, SessionStart, SessionEnd and statusline readers are unchanged (Out of Scope).

**This fails if** any of these happen:
- a row an honest `adr-verify` writes, in either object format and at any `core.abbrev`, is blocked or not counted;
- `adr-lint` and `adr-next` disagree on any width T1's test drives;
- a "must still refuse" row of T2's tests clears the refusal through the real hook;
- a real `qh-check` pass, or its duplicate re-import, is refused.

The data to show each exists today: T1's scratch repositories in both formats, and T2's scratch repository driven by `qh-check`. The criterion holds for POSIX and Windows runners alike. Neither task reads a path.

## Alternatives Considered

- **(a) Do nothing, and document both items as the stated limit.** This is credible, and it is what Decision 2 chooses for half of item 8. Rejected for the rest. The sha disagreement is a defect between two shipped readers, not a forgery question. And the session-log pass is the vector §295 item 9 reported: a session log that every hook appends to stands in for the one file `qh-check` writes. Binding is cheap, measured 5,543 of 5,543 honest events, and ADR-081 already applies the same rule to the fast ledger.
- **(b) Check that a row's sha names a commit.** Rejected on the measurement in Context. It fires on every row of a shallow clone, never on honest rows of a full one, and a forger defeats it with one command. §320 stands.
- **(c) Flag a repeated row, or rows whose dates run backwards.** Rejected. Three tool-written duplicates sit in this corpus, so a finding would accuse the tools' own output. No gate reads row dates in order, so a reorder moves nothing a check can name.
- **(d) Bind the event to its ledger line (Decision 3).** Chosen, because it makes the refusal trust only the file `qh-check` writes, at the one seam every publish path shares (`publishVerdict`), with no change to a pure function or to the 5,543 honest events measured, and it accepts that the forging cost rises by one file rather than claiming more.
- **(e) Have the verdict read `checks.jsonl` directly, as `latestFastPass` does, and ignore the session log's check events.** This is equivalent in effect, and it is the cleaner end state. Rejected for now because it moves the ordering, dedupe and torn-source handling that `latestOf` and `logIncomplete` keep in the session log. That is a larger change to the one sanctioned refusal, for no difference a twin row can show.
- **(f) A check event, or a ledger line, carries a digest or a keyed MAC.** Rejected. A plain digest is recomputed by whoever forges the line. A key would live in the same `.git/quality-harness` or user directory the forger can read (ADR-020's bound).
- **(g) A duration floor on ledger lines, after ADR-020.** Rejected. ADR-020's floor reasons from a fence's text. A declared check is an arbitrary command, so no floor can be derived for it, and `qh-check` already records `before.at` and `after.at` for anyone who wants to read them.
- **(h) Mirror each ledger line outside the repository, and require both copies.** Rejected. The second copy is in a directory the same agent can write. It adds persistent state and a rollback, and the torn-line advice is unchanged.
- **(i) Bind every reader of check events, not only the refusal.** Deferred to the owner (Follow-ups). It changes the SessionEnd status a locked ADR-068 T2 test pins, and the forge it would close buys a wrong word, not a publish.

## Component / Boundary Impact

- `plugin/lib/record.py` gains the row sha field and the object-format lookup. Its reason to change stays the same: the record grammar.
- `plugin/bin/adr-lint`, `adr-next` and `adr-verify` stop owning a copy of it.
- `plugin/scripts/lifecycle.mjs`: the publish verdict gains one filter over the log it reads. Ownership is unchanged. `qh-check` remains the only writer of `checks.jsonl`, and the importer remains the only writer of check events.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| Verification Log row grammar | in a SHA-1 repository, a sha over 40 characters is off-grammar; elsewhere it is unchanged | T1 | adr-lint, adr-next, adr-verify, work-next through adr-next |
| `adr-next` done reading | a row with a 4-6 or 41-64 character sha that fits the repository counts | T1 | SessionStart ready line, work-next |
| PreToolUse rule P and git's publish hook | a check event no `checks.jsonl` record holds no longer clears an unchecked publish; the refusal names the dropped events | T2 | Claude Code, git |
| The adr-execute skill's paragraph on what `done` proves | names the three row properties deliberately not checked | T1 | sessions executing a record |

## Inter-task Contracts

None — T1 and T2 share no symbol. They are one record because both are the §295 forgery items, and both rest on ADR-020's bound.

## Implementation

See `docs/adr/ADR-088-evidence-is-read-against-its-writer/tasks/README.md`.

## Consequences

- **Positive:**
  - `adr-lint` and `adr-next` give one answer for every sha width git can print, so a `core.abbrev=4` or SHA-256 corpus is no longer `done` to one and `READY` to the other;
  - a sha no git in that repository could print is named;
  - the publish refusal stops trusting a file every hook appends to, and trusts the one `qh-check` writes, as ADR-060 already says it does.
- **Negative:**
  - The forging cost rises by about one file, not by an order of magnitude. A hand-written five-field `checks.jsonl` line still clears the refusal in silence.
  - One unparseable line in either file still turns it into advice. Both are stated here, and neither closes.
  - T2 relocks a locked ADR-066 test.
  - A ledger deleted while its session log survives turns honest past passes into a refusal until `qh-check` runs again. No such case was found on this machine.
- **Neutral:**
  - one cached `git rev-parse --show-object-format` per gate run in a repository;
  - one clause in a refusal that drops events.

## Out of Scope

- Checking that a row's sha names a commit (permanent: boundary: measured 2026-10-06, it fires on all 242 of this repository's shas in a depth-1 clone and on none in full clones of three corpora, and a forger defeats it with one `git rev-parse`; §320's reason stands)
- A repeated Verification Log row (permanent: boundary: 9 repeats in this corpus, 3 of them written by `adr-verify` in the commit that recorded their mutants; no gate verdict moves, and `entries` counts rows as written)
- Rows whose dates run backwards (permanent: boundary: no reader orders rows by date, and a reorder changed no output of adr-lint, adr-next, trajectory-metrics or corpus-report)
- Impossible, 1970 or backdated row dates, including a date before `MUTATION_REQUIRED_FROM` that skips the mutant obligation (deferred: docs/BACKLOG.md §351 item 23.4)
- `shownAbleToFail` counting any hand-appended `exit 1` row (permanent: boundary: a metric over rows a person can type; it buys a number, never a `done`)
- A hand-written `checks.jsonl` line, and an unparseable line in either file (permanent: boundary: the same trust domain as every other file these gates read; ADR-020's bound and ADR-061's could-not-look rule)
- A pass recorded for a command other than the declared check (permanent: boundary: only a hand-written line, or a change to an untracked `.quality-harness.json`, produces one; binding the command is a separate decision about honest config changes)
- Binding the Stop, SessionStart, SessionEnd and statusline readers (permanent: boundary: they describe and never refuse; a forge there buys a wrong word, and binding SessionEnd changes a test ADR-068 T2 locks — the owner's call in Follow-ups)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| An honest SHA-1 repository writes a 41+ character sha | Low | High | git caps `--short` at 40 there (measured); T1's test drives `core.abbrev=40` and `=4` through real `adr-verify` |
| `--show-object-format` is missing on an old git | Low | Low | an unanswered lookup is could-not-look, which is 4-64 as today; T1 tests it with an empty `PATH` |
| An honest check event fails to bind and a publish is refused | Low | High | 5,543 of 5,543 measured events bind; a ledger not read whole binds nothing; T2's clean twins run real `qh-check` |
| The relocked ADR-066 test loses its intent | Med | Med | its assertions stay byte-identical, and only the fixture gains ledger lines; the owner approves the relock first |

## Rollback

Revert T1's and T2's commits. No stored format changes: rows, `checks.jsonl` and session logs are read differently, never written differently. The relocked ADR-066 test is restored with its lock by the same revert.

## Follow-ups

- [x] Owner decision: approve T2's relock of `an unresolved check order is not worded as unchecked` (ADR-066 T1's lock). Its fixture gains ledger lines and its assertions stay the same. Approved 2026-10-06; relocked with `adr-verify --relock --replace-hashes` in ADR-066 T1's log and in T2's.
- [ ] Owner decision: should the Stop, SessionStart, SessionEnd and statusline readers be bound too (Alternative i)? That changes the SessionEnd status ADR-068 T2's locked test pins.
- [ ] Owner decision: does T2 earn its surface, given that a five-field ledger line still forges silently (Consequences)? Withdrawing it leaves item 9 as a stated limit, and T1 stands alone.
- [ ] Observed while drafting, not investigated: one honest run appears to have been written twice. ADR-076 T2's `ms:7223` row is repeated in `26d099f`.
- [x] ADR-088 executed 2026-10-06 (uncommitted at 3ae6c8c): T1 and T2 done, each with its red row and killed mutants in its own log. T1's S5 names a human proof (a reviewer reads the adr-execute paragraph against Decision 2) that no human has signed off yet. Two Codex reviews of the diff found five more gaps in Decision 1's class and Decision 3's reach. Each was fixed with a test that failed first and a mutant RED:
  - the sweep's claim reader counted a sha that does not fit;
  - the test lock's row reader let a snapshot whose sha does not fit release a moved lock;
  - a torn ledger left a pass standing in silence at git's own hook, which records no `check.source-unreadable`. `ledgerBoundLog` now reports `torn`, and `publishVerdict` reads that as could-not-look, whoever imported the ledger;
  - git's hook printed no could-not-look verdict. It now says it at the commit and push events, at exit 0;
  - an unterminated last ledger line was read as a whole record.

  Left as they are, by judgement:
  - a publish on a tree and index that equal the session's baseline is still `null` beside a torn ledger. ADR-061 asks for no check there, and no check event, whether bound, dropped or torn, enters that decision. Saying "unknown" there would speak of a check the verdict does not need;
  - siblings of the unterminated-line class not changed here: `latestFastPass` (`fast-checks.jsonl`) and qh-check's `passedAlready`;
  - writer-side readers of the lock rows, which take no repository (`lock_hasher` and `moved_lock_bodies`, both used by `--relock`), still read every width.
