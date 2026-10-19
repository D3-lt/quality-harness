# ADR-117: The evidence is written only by its tools, and a door that cannot close here is named where it closes

**Status:** Accepted
**Date:** 2026-10-19
**Owner:** Zy
**Spec:** None — no spec stage; the owner, 2026-10-19, choosing "close the open doors" as the next stage: "I need this to be world class and delivering results. delivering software in a deterministic way"
**Cross-references:** docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-061-an-unchecked-publish-is-refused.md, docs/adr/ADR-066-git-refuses-an-unchecked-publish.md, docs/adr/ADR-088-evidence-is-read-against-its-writer.md, docs/adr/ADR-113-the-go-core-takes-the-rules-and-side-doors-are-enumerated.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks
**Served-path change:** an agent's hook-visible write into the check ledgers is refused; an uncommitted log row adr-verify did not write is refused by adr-lint; whether the forge protects `main` is said

## Context

ADR-113 T3 enumerated the side doors around the evidence and left three open (`scripts/side-doors.json`, 2026-10-19):

- **forged-ledger-row:** a row written into `checks.jsonl` by hand, in `qh-check`'s shape, passes the ledger's shape check;
- **hand-typed-log-row:** a Verification or Mutation Log row with a computed digest passes adr-lint, since the digest binds a row to a fence, not to a run (ADR-088);
- **push-no-verify-from-a-script:** `--no-verify` skips git's pre-push hook, and the text refusal reads only the command it is shown (ADR-061, ADR-066).

ADR-113 rejected signing the ledger: a local gate cannot hold a key the agent cannot read. That stays rejected. What a local gate can do is refuse the writes it can see, and make a forged row cost a second forged file a hook also guards.

Measured 2026-10-19: across the session logs kept in this repository, no `file.written` event names a path under `.git/quality-harness/`: no session wrote there through a tool the hook sees.

## Existing Primitives Audit

- **The publish refusal's shape** (ADR-061): a PreToolUse refusal with a project opt-out (`"publish": "warn"`); this record's refusal takes the same shape.
- **The shell lexer's redirects** (`shellWords`, both paths): a command's redirect targets, already parsed; the refusal reads them, never a regex over the text.
- **`stateDir`** (both paths): the one place the ledgers live; the refusal is scoped to the session repository's own.
- **adr-lint's digest-less-row rule** (`check_verification`): "legacy means already committed"; the receipt rule takes the same asymmetry.
- **`branch-state.mjs`'s `gh` reads**: how the forge is asked, bounded, with could-not-look said.

## Decision

1. **A hook-visible write into the session's own state directory is refused (T1).** An Edit, Write, MultiEdit, NotebookEdit or mrw MCP write whose canonical path is under `<git-dir>/quality-harness/`, and a Bash or PowerShell command whose parsed redirect or `tee` target is there, are refused at PreToolUse, naming the tool that writes that file (`qh-check`, `adr-verify`). Reads pass, and so do the tools' own runs. A program that writes the file itself is not seen and stays a boundary, said as one. `"ledgers": "warn"` in `.quality-harness.json` turns the refusal into a warning. It is the third sanctioned refusal (CLAUDE.md §3), and this record is its Accepted authority once accepted. Node and the Go core both (ADR-113 Decision 1).
2. **Every row adr-verify appends leaves a receipt, and adr-lint refuses an uncommitted row without one (T2).** `adr-verify` appends `{task, sha256 of the row, at}` to `receipts.jsonl` in the task's repository state directory for every Verification and Mutation Log row it writes: runs, mutants, human sign-offs, human mutants and relocks. `adr-lint` refuses a row the committed file does not hold and no receipt names, under the rule digest-less rows already follow: a committed row needs none, and a file it cannot look at accuses nothing (ADR-005). Decision 1 guards the receipts file.
3. **`push --no-verify` from a script is closed at the forge, and the closing is observed (T3).** No local hook can see a push a script makes with `--no-verify`. A branch ruleset on `main` requiring the selftest checks closes it; for this repository that is the owner's action. `release-evidence` says whether `main`'s rules require status checks, and says could-not-look where `gh` cannot answer.
4. **A door has three states (T3):** `caught`, `open`, and `boundary` (closed outside this plugin, with where). `scripts/side-doors.json` moves forged-ledger-row to caught for what the hook sees and boundary for a program, hand-typed-log-row to caught, and push-no-verify to boundary; the sweep's line counts each state, and `open` is 0.

**This fails if** an Edit or a readable redirect writes `checks.jsonl` without a refusal or the opt-out's warning; a read of a ledger is refused; an uncommitted log row with no receipt passes adr-lint, or a committed one fails it; or a door is counted closed with no mechanism or no named place it closes.

## Alternatives Considered

- **Sign the ledger or the rows.** Rejected again (ADR-113): the agent can read any key the gate can.
- **A `reference-transaction` git hook to refuse unchecked ref updates.** Rejected: it fires on fetch, rebase and every ref update, so a false refusal of ordinary work is likely, and a block needs stronger evidence than that (CLAUDE.md §16).
- **Detect a forged row after the fact by matching it to a hook-seen `qh-check` run.** Not chosen: `qh-check` also runs from terminals, git's hook and CI, so a row with no seen run is not evidence of a forgery.

## Component / Boundary Impact

`plugin/scripts/` and `core/hooks/` gain the refusal; `plugin/bin/adr-verify`, `adr-lint` and `plugin/lib/record.py` gain receipts; `scripts/release-evidence.mjs` reads the forge's rules; `scripts/side-doors.json` and `side-door-sweep.mjs` gain a state. This repository has no architecture document.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| PreToolUse | a write into the state directory is refused | T1 | the host |
| `.quality-harness.json` `"ledgers"` | `"warn"` turns the refusal into a warning | T1 | an adopter |
| `<git-dir>/quality-harness/receipts.jsonl` | one row per log row adr-verify writes | T2 | adr-lint |
| `release-evidence` output | whether `main`'s rules require status checks | T3 | a release |
| `scripts/side-doors.json` `status` | `boundary` beside `caught` and `open` | T3 | the sweep |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| the state-directory refusal | T1 | T2 (it guards the receipts), T3 (it moves the door) | No — new |
| `receipts.jsonl` | T2 | T3 (it moves the door) | No — new |

## Implementation

See `tasks/README.md`.

## Consequences

- **Positive:** forging a pass or a log row through any tool the hook sees is refused; a hand-typed row needs a forged receipt behind a refusal; every door is caught or named where it closes.
- **Negative:** a third refusal, with its opt-out; a receipts file per repository.
- **Neutral:** committed history, CI and peers without the state directory are untouched.

## Out of Scope

- A program that writes a ledger itself (permanent: boundary: a hook sees tool calls and command text, not what a program does once it runs)
- Setting the ruleset on this repository's `main` (permanent: boundary: the owner's action on the forge; T3 observes it)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A legitimate write into the state directory is refused | Low | Med | no session here has made one (Context); the opt-out; the refusal names the tool to use |
| A receipt is missing for a row adr-verify did write | Med | High | every writer path is in T2's tests, each shown writing its receipt |

## Rollback

Revert the tasks' commits; the opt-out turns the refusal off without a revert.

## Follow-ups

- [x] Owner decision: Accepted, 2026-10-19, so the third refusal is sanctioned (CLAUDE.md §3).
- [ ] The owner sets a ruleset on `main` requiring the selftest checks; T3 then reads it as protected.
- [x] The Codex review of aae06d72..90b9ceaf, 2026-10-19: twelve findings. The nine forms the guard missed are now read, in Node and in Go. A task HEAD does not hold needs a receipt for every row, and receipts match by digest, so a moved task keeps its rows. The repository's own state directory is guarded under a state root. The forge read takes every page and calls an unreadable rule could-not-look. A missing door list fails the sweep. The owning-ADR search is bounded at the root for both of its searches. Decision 1 stands as written; the forms the guard still does not read are BACKLOG §387, and the boundary door names them.
- [x] The verification review of a855f7f7, 2026-10-19: six more, fixed in the commit after it. A command of redirections alone is refused, since emptying a session log let a pass through. PowerShell destinations are read by parameter, colon form included, and content values are not. A walk that reaches a guarded directory is refused. A link to a missing file is followed. A moved task keeps the rows HEAD holds. An unreadable required check is could-not-look.
- [x] The second verification review, of 671827fa, 2026-10-19: two regressions and one incomplete fix, fixed in the commit after it. A switch list read `-vb` as taking a value, and a one-letter parameter went unread. Now every word after a parameter is a candidate destination, unless that parameter carries content. A named destination's positional content is no longer refused. A relative link resolves from its real directory.
- [x] The third verification review, of f7dc229c, 2026-10-19: a prefix naming `-Filter` read as `-FilePath`, and a quoted `"-Value"` read as a parameter. Both turned a real destination into content. The PowerShell reader now excludes only the word after an unquoted content parameter and a bare word after a destination named in full. Its over-refusals are in BACKLOG §387.
- [x] The fourth verification review, of 9e2e2c1c, 2026-10-19: a comma list after a destination named in full (`-Path notes.txt, <ledger>`) is one argument, so its second element was dropped as content. A word that continues a comma list is now read the way the word that began the list was, and each element of a comma word is checked.
- [x] The fifth verification review, of 9cd08b8e, 2026-10-19, found that the comma handling made two new bypasses: a quoted trailing comma, and a path that contains a comma lost when split. Five rounds had each turned an exclusion into a bypass, so the PowerShell reader now excludes nothing. Every literal word of a writer is a candidate, whole and split at its commas, and so is a colon's value. A content word that is itself a ledger's path is refused with its write (BACKLOG §387).
- [x] The sixth verification review, of 34e05f2b, 2026-10-19: APPROVE, with one P2 that predates it. A parameter spelled with an en, em or horizontal-bar dash (`–Path:<ledger>`) is a parameter to PowerShell, and its colon value went unread. Both readers now accept those dashes, fixed in the commit after it.
