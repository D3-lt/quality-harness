# ADR-119: What the backlog still holds after the 2026-10-20 re-check

**Status:** Accepted
**Date:** 2026-10-20
**Owner:** Zy
**Spec:** None — no spec stage; the owner's approved plan of 2026-10-20 over the open backlog, re-checked read-only at 14bc3430
**Cross-references:** docs/BACKLOG.md, docs/adr/ADR-062-a-review-is-a-host-result.md, docs/adr/ADR-067-the-publish-classifier-reads-the-command-as-the-shell-splits-it.md, docs/adr/ADR-088-evidence-is-read-against-its-writer.md, docs/adr/ADR-090-a-quoted-message-is-data.md, docs/adr/ADR-098-what-the-plugin-says-matches-what-it-does.md, docs/adr/ADR-100-a-repeated-procedure-is-one-command.md, docs/adr/ADR-102-a-syntax-finding-at-the-edit-reaches-the-agent.md, docs/adr/ADR-104-a-literal-path-commit-elsewhere.md, docs/adr/ADR-110-a-static-core-owns-the-hooks.md, docs/adr/ADR-117-the-evidence-is-written-only-by-its-tools.md
**Governs:** `plugin/scripts/shell-words.mjs`, `core/hooks/shellwords.go`, `plugin/bin/adr-lint`, `plugin/scripts/host-review.mjs`, `plugin/bin/adr-next`, `core/hooks/publishcmd.go`, `core/hooks/publishcmd.go`, `plugin/scripts/standalone-link.mjs`, `plugin/scripts/post-edit-check.sh`, `scripts/dead-code-scan.sh`, `scripts/unused-names.sh`, `.claude/rules/19-adopter-footprint.md`, `plugin/scripts/decision-corpus.mjs`, `plugin/scripts/event-log.mjs`
**Enforced-by:** None — declared by its tasks. Each task adds one campaign mutation per mechanism; naming them before they exist would be a pointer to nothing.
**Invalidates:** ADR-062 — its Decision's `bound` vocabulary (`reported` or `unproven`) becomes `pinned`, `disagrees` or `unproven` under T2, and the row records the pinned model. ADR-098 T2's locked tests, and every ADR-102 task that locks the two post-edit tests T4 changes (T5 through T15, eleven owners each, from `python3 scripts/test-locks.py tests/post-edit-check.test.mjs '<test name>'` on 2026-10-20), are relocked by T4 with the reason recorded; ADR-100 T1's, ADR-104 T3's and ADR-117 T2's locked tests stay byte-identical, with new tests beside them.
**Served-path change:** a declared check `{ …; } | cat` or `{ …; } |& cat` is refused as a check that cannot fail; adr-lint gives the UNPROVEN error, not advice, for an unreadable or unbounded test of a task done only in its own file; a review row names the model the launcher pinned; adr-next no longer stops on a hyphenated name, a quoted stop word or a hook name; ADR-104's refusal no longer holds for a literal repeated as data; a receipt refusal says when its row's writer may predate receipts; and the post-edit check places a node JSON error that carries no position.

## Context

The owner asked for a plan over the open backlog. A read-only re-check on 2026-10-20 at 14bc3430 found most of BACKLOG §381
already fixed while the file still says otherwise: items 1–5 (035be390, 5b9108d3, 9f7d1573, c74ff306, 76d23349, 2eb10c61),
item 6 (c24e7f56), items 8–15 (f0f4cbf7, f62d0015, f596b8ce, 6e2cebed, 5c6641ff, 05562ebe, 3bff7696, 36cdcafd), item 7 by
the owner's decision (e957da1e), and the reviewer `--output` limit (6c30eba6). §385 is fixed too (2b6a0e63); only its heading
is stale. The backlog's own correction is made beside this record and is not a task here.

What is still present, each at the site the re-check found and this draft re-read at 14bc3430:

- **Two fail-opens.** `plugin/scripts/shell-words.mjs:96` carries `&`, `&&` and `||` after a group's `}`, but not `|` or
  `|&`, so `{ false; } | cat` (always exit 0) is accepted as a real check: the group never joins the pipeline that
  `plugin/scripts/check-command.mjs:198`'s pass-through sink rule reads. And `plugin/bin/adr-lint:5027` (`check_tests_exist`)
  and `:5817` (`check_tests_can_fail`) still read done from the README alone (`set(done_task_ids(readme_text))`). That set
  reaches only `unproven_test` (`:4982-5004`), which turns UNPROVEN test evidence (a source it cannot read, a body it cannot
  bound) into an error for a done task and advice otherwise, so a task whose own file says done has it demoted to advice. A
  missing test and a test with no failure path block at `:5161` and `:5898` whatever the done set is. c24e7f56 moved four
  other sites to `claimed_done_ids`.
- **A review row that names the wrong model.** `plugin/scripts/host-review.mjs:61` lets the reviewer's printed model win over
  the pinned `-m` (`CODEX_MODEL` at :17, passed at :139), and the row at :256 records `review.model ?? CODEX_MODEL`. Seen in
  a peer repository's `reviews.jsonl`: runs pinned to gpt-6.1-sol recorded as "gpt-6", "GPT-6 (Codex)" and "Codex". No gate
  reads `model` or `bound` today (`scripts/release-evidence.mjs:450-457` reads status, head, base and exact), so this corrects
  the record and opens nothing.
- **Three false stops and refusals.** adr-next reads `approved: no canary-failed code was raised`, `restated without the stop
  word` and `fires SessionStart and Stop` as stops (BACKLOG §383; the ADR-113 T6 false stop seen 2026-10-20). ADR-104's
  refusal holds for `echo 'let x=1'; echo 'let x=1'`, because `plugin/scripts/publish-command.mjs:224` and
  `core/hooks/publishcmd.go:359` treat a literal as data only when it occurs once (BACKLOG §381 L3). And an older adr-verify's
  row is refused by a newer hook (BACKLOG §389): the forwarder's `RESOLVER` (`plugin/scripts/standalone-link.mjs:74-91`)
  picks the newest installed plugin, never the session's `CLAUDE_PLUGIN_ROOT`, which `plugin/bin/qh-root:86-88` prefers.
- **Wrong output and the gates' own blind spots** (§381 items 16, 18, 20, 21, 22, 24), and **test hygiene** (items 17, 19, 23).

Owner rules that shape the tasks: fail-opens and false refusals get fixed now; one verification review per fix round, and
only fail-opens and regressions block; a locked test changes only by a relock with its reason; no project names in the
repository.

### The class, enumerated

Each member set below came from a command run on 2026-10-20 at 14bc3430, and its output is what the tasks cover.

| Class | Command | Output |
|-------|---------|--------|
| An operator after a closed group that joins the group | `mrw read --grep 'closedGroup' plugin/scripts/shell-words.mjs core/hooks/shellwords.go` | two rules: `shell-words.mjs:96` and `shellwords.go:205`, each listing `&`, `&&`, `\|\|` and neither `\|` nor `\|&`, which the lexers already read as pipe operators (`shell-words.mjs:107`, `shellwords.go:219`) (T1) |
| A done loop that reads the README alone | `mrw read --grep 'done_task_ids\(readme_text\)\|claimed_done_ids\(' plugin/bin/adr-lint` | README-only: `:5027`, `:5817`, and `evidenced_task_ids` at `:3229` (the evidenced set, which T1 keeps: its twin is the `blocked` task with exit-0 evidence); `claimed_done_ids` at `:2956`, `:2994`, `:6098`, `:6170`, and the inline merge at `:2742` |
| A review row's model | `mrw read --grep 'recordReview\(' plugin/scripts/` | three writers: `host-review.mjs:242` (the non-Codex hosts, `review.model ?? model`), `:256` (Codex), `:384` (the prompt-file form, already `CODEX_MODEL`); the fix at `:61` reaches the first two (T2) |
| A literal taken as data only once | `mrw read --grep 'split\(spelling\)\.length\|strings\.Count\(out, spelling\)' plugin/scripts/ core/hooks/` | two sites: `publish-command.mjs:224`, `publishcmd.go:359` (T3) |
| A plugin-root resolver | `mrw read --grep 'CLAUDE_PLUGIN_ROOT' plugin/scripts/standalone-link.mjs plugin/bin/qh-root` | `qh-root:86` reads it; the `RESOLVER` in `standalone-link.mjs` does not (T3) |
| An array expanded bare under `set -u` | `mrw read --grep '"\$\{[A-Za-z_]+\[@\]\}"' scripts/dead-code-scan.sh scripts/unused-names.sh scripts/selftest.sh scripts/coverage.sh` | unguarded only at `dead-code-scan.sh:48`; `unused-names.sh:94,107,113` sit under `-gt 0` guards, `coverage.sh:90` and `selftest.sh:200` use `${a[@]+…}` (T4) |
| A test that reads `plugin/` from disk | `mrw read --count --grep 'readdirSync\((plugin\|path\.join\(plugin)' tests/` | 5 lines in 1 file, `tests/review-contract.test.mjs` (T4) |
| A bare `bash` spawn in a test | `mrw read --count --grep "spawnSync\('bash'\|execFileSync\('bash'\|spawn\('bash'" tests/` | 34 lines in 9 files; the plan's re-check counted 33, so T5 re-enumerates before converting (T5) |
| A test removal with no retry | `mrw read --count --grep 'rmSync\(' tests/` | 709 lines in 216 files, against `maxRetries` in 126 lines of 116 files; the regex does not isolate §380's class (tests that start a session, 28 files by its count), so T5's first step enumerates that class itself (T5) |

Members left out are named in Out of Scope.

### What governs these paths

`node plugin/scripts/adr-context.mjs` over each governed path, 2026-10-20: `shell-words.mjs` ADR-067, ADR-090, ADR-117;
`shellwords.go` and `publishcmd.go` ADR-110; `host-review.mjs` ADR-062, ADR-098, ADR-100; `adr-next` ADR-003, ADR-007,
ADR-020, ADR-031, ADR-034, ADR-045, ADR-049, ADR-050, ADR-052, ADR-074, ADR-078, ADR-088, ADR-092, ADR-113;
`publish-command.mjs` ADR-061, ADR-066, ADR-067, ADR-104; `standalone-link.mjs` ADR-001, ADR-004, ADR-019, ADR-030,
ADR-060; `post-edit-check.sh` ADR-038, ADR-102; `review-contract.test.mjs` ADR-098; `decision-corpus.mjs` ADR-011, ADR-039,
ADR-054, ADR-063, ADR-099; none governs `scripts/dead-code-scan.sh`, `scripts/unused-names.sh`, `tests/helpers/bash.mjs` or
`.claude/rules/19-adopter-footprint.md`. Reconciled: ADR-067 and ADR-090 (the classifier reads as the shell splits it; a
quoted message is data) are what T1 and T3 apply, not change. ADR-104's literal-as-data rule is extended to a repeated
literal with each occurrence's slot verified. ADR-062's `bound` vocabulary is the one decision this record changes
(Invalidates). The locks: `tests/review-ledger.test.mjs` (11, ADR-100 T1), `tests/foreign-commit.test.mjs` (14, ADR-104 T3),
`tests/log-receipts.test.mjs` (1, ADR-117 T2), `tests/review-contract.test.mjs` (6, ADR-098 T2) and the two post-edit tests
T4 changes, each locked by ADR-102 T5 through T15, all read with `python3 scripts/test-locks.py <file> [name]` on 2026-10-20; `tests/host-review.test.mjs`,
`tests/adr-next.test.mjs`, `tests/unused-names.test.mjs`, `tests/qh-core-parity.test.mjs` and `tests/standalone-link.test.mjs`
have 0.

## Existing Primitives Audit

- `claimed_done_ids` (`plugin/bin/adr-lint:2689`) already merges the README's done rows with each task file's own claim.
  Reused at the two remaining sites.
- `maskedMessages` in `publish-command.mjs` already verifies a masked span by re-lexing. T3 applies the same check per
  occurrence instead of refusing a repeated literal.
- `qh-root`'s order (`CLAUDE_PLUGIN_ROOT` when it holds `bin/`, then the newest cache entry) is the order the `RESOLVER`
  adopts, if the measurement in T3 shows a Bash-tool subprocess has the variable.
- The `-gt 0` guard (`scripts/unused-names.sh:92`), `required()` (`tests/helpers/require.mjs`), `testBash`
  (`tests/helpers/bash.mjs`) and the retrying `rmSync` idiom (`tests/unused-names.test.mjs:15`) are reused as they stand.
- `tests/qh-core-parity.test.mjs` answers every literal of the classifier's own tests through both implementations; T1's and
  T3's new rows reach the Go core through it.

## Decision

1. **T1:** `|` and `|&` after a group's `}` join the group to the pipeline, in both lexers, so the pass-through sink rule
   sees it. `check_tests_exist` and `check_tests_can_fail` read `set(claimed_done_ids(readme_text, infos))`, so
   `unproven_test` treats a task done in its own file as done.
2. **T2:** a review row records the model the launcher pinned. A printed model that differs goes in `reportedModel`.
   `bound` is `pinned`, `disagrees` or `unproven`, and is written into the row.
3. **T3:** adr-next does not read a hyphenated compound used as a name, a quoted or mentioned stop word, or a hook name as a
   verdict. ADR-104's data check verifies each occurrence of a repeated literal. The forwarder prefers the session's
   `CLAUDE_PLUGIN_ROOT` when a measurement shows it reaches a Bash-tool subprocess, and the receipt refusal says when a row's
   writer may predate receipts.
4. **T4:** the post-edit check places an unplaced node JSON error; `dead-code-scan.sh` survives an empty list and says UNRUN;
   biome adds `correctness/noUnreachable`; `review-contract.test.mjs` reads `plugin/` as git lists it; two post-edit tests skip
   without `jq` through `required()`; the listing figure is re-measured with its method, date and sha.
5. **T5:** a shared removal helper, `testBash` for bare spawns, and `walk`, `outsideRoot` and `GIT_LISTING_BUFFER` leave
   `decision-corpus.mjs` for `event-log.mjs`, the one module all four importers and `decision-corpus.mjs` already import.
   `outsideRoot` keeps its own local predicate; the exported `inside` moves only if the orphan check shows a caller outside.

Each task is executed through `adr-verify`: a red run first, a catalogue mutant killed, and one Codex review per round over
the round's range. What would make this fail: a twin listed as "must still refuse" or "must still stop" that passes after
its task. Every such twin is a row in that task's tests, so the fence goes red.

## Alternatives Considered

- **A grammar for the shell lexer now, in place of T1's `|` rule:** the owner chose on 2026-10-15 to build one rather than
  patch `! { …; }` with several commands. Rejected for T1: `|` and `|&` after a group are a gap in the rule that already
  carries `&`, `&&` and `||`, and leaving a fail-open open until a grammar lands breaks the fix-now rule.
- **Gate on the review row's `model`:** rejected. No reader acts on it (`release-evidence.mjs:450-457`), and making one
  would open a refusal no record sanctions (CLAUDE.md §3).
- **Leave the backlog items in BACKLOG §381 and fix them one by one without a record:** rejected. They change what four
  readers say (shell-words, adr-lint, adr-next, post-edit-check), which needs an outside run before release (CLAUDE.md §18),
  and a record is what carries the evidence.

## Component / Boundary Impact

No module is added or moved, except `tests/helpers/remove.mjs` (a test helper) and three helpers that move from
`plugin/scripts/decision-corpus.mjs` to `plugin/scripts/event-log.mjs` (T5). The Go core keeps parity with the Node
classifier through the existing parity test.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `shellWords()` command list | `ended` is `\|` or `\|&` after a group joined by a pipe | T1 | `check-command.mjs`, `publish-command.mjs`, the Go core |
| `reviews.jsonl` row | `model` is the pinned model; adds `bound` and, when it differs, `reportedModel` | T2 | nothing reads them today |
| `hostReview()` result `bound` | `pinned`, `disagrees` or `unproven` (was `reported` or `unproven`) | T2 | callers of `host-review.mjs` |
| The forwarder's `RESOLVER` | `CLAUDE_PLUGIN_ROOT` first when it holds `bin/` (only if measured present) | T3 | the home-directory forwarders `standalone-link.mjs` writes |
| `decision-corpus.mjs` exports | `walk`, `outsideRoot`, `GIT_LISTING_BUFFER` move to `event-log.mjs`; `inside` stays unless the orphan check shows a caller outside | T5 | `completion-rules.mjs`, `check-ledger.mjs`, `artifact-pass.mjs`, `tree-facts.mjs` |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `shellWords()` carrying `\|` and `\|&` after a group | T1 | T3 (re-lexing a masked literal) | No — a closed group joined by a pipe was previously dropped |
| The test files T1–T4 edit | T1, T2, T3, T4 | T5 (its closed lists are taken after they land) | No |

## Implementation

See `tasks/README.md`: T1, T2, T3 (after T1), T4, then T5 last.

## Consequences

- **Positive:** two fail-opens close; three false stops or refusals stop; a review row says what was pinned; four outputs
  stop being wrong; the dead-code scan sees unreachable code.
- **Negative:** four readers change (shell-words, adr-lint, adr-next, post-edit-check), so the release waits for an outside
  run, one peer at a time (CLAUDE.md §18). The relocks (ADR-098 T2, and ADR-102 T5 through T15) move locked bodies, each with its reason.
- **Neutral:** `reviews.jsonl` rows gain two fields nothing reads yet.

## Out of Scope

- §381 item 25, a tag that retires a spec fact: it needs its own record, and it changes spec-verify and adr-lint together (deferred: docs/BACKLOG.md §381)
- §381 L1, `! { …; }` with several commands, `! { npm test; false; }` among them: the owner wants a grammar, not another patch (deferred: docs/BACKLOG.md §381)
- §387, the PowerShell `Copy-Item`, `Move-Item` and `New-Item -Value` cmdlets and backticks: its reopen trigger is a run showing one used against a ledger, and no run has shown that (deferred: docs/BACKLOG.md §387)
- The Windows hook goldens, the second half of §381 item 23 (deferred: docs/BACKLOG.md §381)
- §384's slowdown measure (deferred: docs/BACKLOG.md §384)
- §386's signing, which ADR-116 already defers (deferred: docs/BACKLOG.md §386)
- ADR-112's pre-registration, which waits on its own stage (permanent: boundary: ADR-112 owns its pre-registration and its wait on the bench peer's baseline; nothing of this record's work is deferred into it)
- §383's other open bullets: the mention arm's over-match, no finding when no check is known, the wording after a red check, and the `treeMoved` advisory (deferred: docs/BACKLOG.md §383)
- The backlog's own correction (§381's re-check line, §385 archived, §391 filed for T2) (permanent: boundary: it is made in the same commit as this record, by the coordinator, and is history rather than a task)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Loosening adr-next turns a real stop into a pass | Med | High: a failed sign-off reads as done | each new pass row has a must-still-stop row beside it in the same test (T3) |
| Verifying each occurrence of a literal re-opens one of the three fail-open spellings §381 recorded | Med | High: a publish escapes the refusal | those three spellings are rows that must still refuse, in Node and Go (T3) |
| A relock hides a weakened assertion | Low | Med | each relock names its reason, and the moved assertion is read in the review of its round |
| The JSON position finder places an error at the wrong token | Low | Low: advisory output | the twin keeps an existing position unchanged; masking keeps offsets (T4) |
| Moving helpers creates an import cycle | Low | Med | `decision-corpus.mjs` already imports `event-log.mjs`, and `event-log.mjs` imports only `git-directory.mjs`; T5 stops on a cycle |

## Rollback

Each task is its own commit and reverts alone. No persistent state changes, except two fields `reviews.jsonl` rows gain
(T2), which no reader depends on; older rows stay readable.

## Follow-ups

- [x] A cold Codex review of this draft (`codex-review` skill, `host-review.mjs --host codex --effort high`) before acceptance: REQUEST CHANGES with five findings, all folded in, then a scoped verification APPROVE, 2026-10-20
- [x] After T1, T3 and T4: an outside run by an eligible peer, one at a time, filed with `attest-import`, then a bump and `release.mjs`: ansible-infra (28 compared) and go-kernel (58 compared) at 80066d00, 0 verdicts changed, filed 2026-10-20; bumped to 3.8.50
