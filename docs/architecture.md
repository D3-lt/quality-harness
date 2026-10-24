# Architecture: quality-harness

**Status:** Living — every ADR that changes structure updates this doc in the same commit.
**Repo:** this repository (`plugin/` is the product; everything above it is the work that produces it)
**Tier:** library
**Gate command:** `node --test tests/package.test.mjs tests/gates.test.mjs tests/workflows.test.mjs tests/hook-goldens.test.mjs tests/qh-core-parity.test.mjs tests/go-core-parity-adr-111.test.mjs tests/qh-check.test.mjs tests/ledger-writes.test.mjs tests/log-receipts.test.mjs tests/fail-open.test.mjs tests/publish-hook.test.mjs tests/observed-events.test.mjs tests/land.test.mjs tests/release.test.mjs tests/release-evidence.test.mjs tests/review-ledger.test.mjs tests/side-door-sweep.test.mjs tests/path-length.test.mjs`
**Last full audit:** 2026-10-20 — first authoring, derived from the tree at 522fce9f; no `/quality-harness:arch-write grill-only` run yet

This is the current-state integral; the records under `docs/adr/` are deltas against it. Everything below was read from the
tree at 522fce9f on 2026-10-20, and every claim names the file it was read from or the command that re-derives it. The
document states no counts (CLAUDE.md, preamble): where a number matters, the command that produces it is given instead.
Every rule row below was OBSERVED in code and in an Accepted record; none was minted in conversation, because no grill
has been held on this document yet.

## Re-deriving this document

| Question | Command |
|----------|---------|
| Which record governs which path, and where two records claim the same file | `node plugin/scripts/adr-state.mjs` (`--json` for every path) |
| What governs a given path, and which tests catch it | `node plugin/scripts/adr-context.mjs plugin/scripts/lifecycle.mjs` |
| Which task of a record is next, and what proves it | `python3 plugin/bin/adr-next docs/adr/ADR-110-a-static-core-owns-the-hooks.md` |
| Which commands the hooks register | `mrw read plugin/hooks/hooks.json` (`--grep '"command"' --count` for how many) |
| What each event is handed to | `mrw read 'plugin/scripts/lifecycle.mjs:/^const HANDLERS/,+11'` |
| Which file writes which ledger | `mrw read --grep '[a-z-]+\.jsonl' plugin/scripts plugin/bin plugin/lib` |
| What the forge requires before main moves | `mrw read .github/rulesets/main.json` |
| Whether this document still passes its own gate | `python3 plugin/bin/arch-lint docs/architecture.md` |

## Module Map

One row per module, with the record that owns it. Where `adr-state` reports a path as contested, the owner named is the
record whose Decision the module implements today; `node plugin/scripts/adr-state.mjs` lists every claimant.

| Module | Layer | One reason to change | Owner |
|--------|-------|----------------------|-------|
| `plugin/.claude-plugin/plugin.json` | infra | the plugin's name, version and the components a host loads | ADR-008 |
| `plugin/hooks/hooks.json` | infra | which command each host event runs | ADR-038, ADR-060, ADR-110 T3 |
| `plugin/scripts/lifecycle.mjs` | api | how one hook event is read, routed to its handler and answered once | ADR-060, ADR-096 |
| `plugin/scripts/on-session-start.mjs` | domain | what a session is told when it starts | ADR-099 |
| `plugin/scripts/on-pre-tool-use.mjs` | domain | what is said or refused before a tool runs | ADR-060, ADR-061, ADR-117 |
| `plugin/scripts/on-turn-end.mjs` | domain | what a finished turn, subagent or task says about itself | ADR-060, ADR-096 |
| `plugin/scripts/on-session-end.mjs` | domain | the row a session leaves for the next one | ADR-060 |
| `plugin/scripts/on-subagent-start.mjs` | domain | the contract a spawned role is handed | ADR-060 |
| `plugin/scripts/publish-verdict.mjs` | domain | whether a commit or push is on a checked tree (rule P) | ADR-061, ADR-066 |
| `plugin/scripts/publish-command.mjs` | domain | which shell commands publish | ADR-067, ADR-090 |
| `plugin/scripts/shell-words.mjs` | domain | how shell text splits into words | ADR-067 |
| `plugin/scripts/shell-grammar.mjs` | domain | how the words of a check read as lists, pipelines, groups and definitions (Go twin: `core/hooks/shellgrammar.go`) | ADR-120 |
| `plugin/scripts/ledger-guard.mjs` | domain | which writes into the state directory are refused | ADR-117 |
| `plugin/scripts/reviewer-guard.mjs` | domain | what a read-only role may not do | ADR-060 |
| `plugin/scripts/publish-hook.mjs` | adapter | git's own side of the publish refusal | ADR-066, ADR-068 |
| `plugin/scripts/check-ledger.mjs` | domain | how the check ledgers are read | ADR-081, ADR-101 |
| `plugin/scripts/check-record.mjs` | adapter | how a check run is written to the ledgers | ADR-060, ADR-111 |
| `plugin/scripts/qh-check.mjs` | api | running the project's check and recording it | ADR-060, ADR-081, ADR-100 |
| `plugin/scripts/event-log.mjs` | adapter | where the state directory is and how the session log is appended | ADR-060 |
| `plugin/scripts/tree-facts.mjs` | adapter | what git says about the working tree, bounded | ADR-060, ADR-068 |
| `plugin/scripts/artifact-pass.mjs` | domain | the detached pass of record gates over what a session changed | ADR-080 |
| `plugin/scripts/run-shell-hook.mjs` | adapter | how a shell hook is started from Node on every platform | ADR-038, ADR-080 |
| `plugin/scripts/facts-gate-dispatch.sh` | adapter | which record gate runs on an edited file | ADR-046, ADR-053 |
| `plugin/scripts/post-edit-check.sh` | adapter | the per-edit syntax and type checks | ADR-038, ADR-119 |
| `plugin/scripts/branch-state.mjs` | adapter | what CI says about the branch, from a snapshot | ADR-065 |
| `plugin/scripts/said-per-context.mjs` | domain | whether a hook item is already in the context it would be said into, from the last request the transcript records (Go twin: `core/hooks/saidcontext.go`) | ADR-122 |
| `plugin/scripts/host-review.mjs` | adapter | launching a different-lineage review and recording it | ADR-062, ADR-100 |
| `plugin/scripts/decision-corpus.mjs` | domain | how the record corpus is listed and what governs a path | ADR-039, ADR-063 |
| `plugin/scripts/work-next.mjs` | domain | where a repository is in the lifecycle | ADR-038, ADR-043 |
| `plugin/scripts/corpus-probe.mjs` | api | running every reader over a corpus this repository does not own | ADR-064, ADR-089 |
| `plugin/scripts/statusline.mjs` | ui | the status-line segment | ADR-044 |
| `plugin/bin/qh-check` | api | the gate's command-line entry (forwards to `qh-check.mjs`) | ADR-060, ADR-100 |
| `plugin/bin/adr-lint` | domain | whether a record and its tasks are well formed and proved | ADR-045, ADR-117 |
| `plugin/bin/adr-verify` | domain | running a task's Acceptance and writing its log rows | ADR-016, ADR-020, ADR-117 |
| `plugin/bin/adr-next` | domain | which task is ready and what proves it | ADR-007, ADR-020 |
| `plugin/bin/adr-debt` | domain | deferred scope and open follow-ups across a corpus | ADR-014 |
| `plugin/bin/adr-judge` | domain | whether a record rests on anything observable | ADR-049 |
| `plugin/bin/adr-retire-check` | domain | an archive catalogue and its receipts | ADR-063 |
| `plugin/bin/spec-verify` | domain | a facts-first spec against its grammar and the code | ADR-079 |
| `plugin/bin/arch-lint` | domain | an architecture document against its template and the repository | ADR-045, ADR-049 |
| `plugin/bin/postmortem-verify` | domain | a postmortem against its schema | none by path in `adr-state`; its header cites ADR-031 |
| `plugin/bin/qh-mcp` | api | the reading gates over MCP stdio, for a client with no shell | ADR-012 |
| `plugin/bin/qh-root` | infra | which installed copy is newest | ADR-031 |
| `plugin/lib/record.py` | domain | the record grammar every Python gate loads | ADR-045, ADR-092 |
| `plugin/lib/fence.py` | adapter | running a child bounded and killing its tree | ADR-045 |
| `plugin/skills/` | ui | what each lifecycle stage tells the agent to do | ADR-057 |
| `plugin/agents/` | ui | the spawned roles and the capability each declares | ADR-029, ADR-060 |
| `plugin/workflows/` | ui | the bounded multi-role workflows (consensus, review-ring, quality-cycle) | ADR-057, ADR-062 |
| `plugin/templates/` | domain | the shapes the gates read | ADR-009, ADR-017 |
| `core/cmd/qh/main.go` | api | the static binary's command line | ADR-110 |
| `core/hooks/` | domain | the Go twin of the hook rules | ADR-110, ADR-113 |
| `scripts/` | infra | this repository's own tooling; never ships | ADR-008 |
| `tests/` | infra | this repository's suite and the mutation catalogue | ADR-003, ADR-091 |
| `.github/workflows/selftest.yml` | infra | what CI runs on main, on landings and on dispatch | ADR-023, ADR-118 |
| `.github/rulesets/main.json` | infra | what the forge requires before main moves | ADR-118 |
| `.githooks/pre-commit` | infra | refusing a commit mid-mutation or of an unmutated shipped file | none by path in `adr-state`; BACKLOG §127c |

## Hook events

Read from `plugin/hooks/hooks.json` and `plugin/scripts/lifecycle.mjs` (`HANDLERS`). Every entry runs `node` on a script
under `${CLAUDE_PLUGIN_ROOT}/scripts/`. `lifecycle.mjs` first records the event in the session log (`hook-record.mjs`),
imports what the artifact pass has said since the last hook (`artifact-pass.mjs`, ADR-080), then hands the event to its
handler; every rule queues what it decides (`hook-queue.mjs`) and `deliver` writes one JSON object to stdout.

| Event | Registered command(s) | Handler module |
|-------|-----------------------|----------------|
| SessionStart | `lifecycle.mjs`; `branch-state.mjs --cached 120` | `on-session-start.mjs` |
| UserPromptSubmit | `branch-state.mjs --brief --cached 120` | none in `lifecycle.mjs` |
| SubagentStart | `lifecycle.mjs` | `on-subagent-start.mjs` |
| PreToolUse (Bash, PowerShell, Edit, Write, MultiEdit, NotebookEdit, mrw MCP write) | `lifecycle.mjs` | `on-pre-tool-use.mjs` |
| PreToolUse (Skill) | `lifecycle.mjs` | counted as `skill.invoked` and nothing else (ADR-084) |
| PostToolUse (Edit, Write, MultiEdit, NotebookEdit) | `run-shell-hook.mjs facts-gate-dispatch.sh`; `run-shell-hook.mjs post-edit-check.sh`; `lifecycle.mjs` | recorded only; no handler |
| PostToolUse (mrw MCP write) | `lifecycle.mjs` | recorded only; no handler |
| Stop, SubagentStop, TaskCompleted | `lifecycle.mjs` | `on-turn-end.mjs` (SubagentStop also runs `reviewChangedState`) |
| PreCompact, SessionEnd | `lifecycle.mjs` | `on-session-end.mjs`; SessionEnd re-runs itself detached when `CLAUDE_PLUGIN_DATA` is set |

The read-only agents (`plugin/agents/qh-correctness-reviewer.md`, `qh-scope-reviewer.md`, `qh-synthesis.md`) also declare
`reviewer-guard.mjs` in their own frontmatter; the guard that is known to fire inside a subagent is the one in
`on-pre-tool-use.mjs` (its comment records the frontmatter guard measured inert, BACKLOG §135).

## The Go core

`core/` is a Go module (`core/go.mod`) with one command, `core/cmd/qh/main.go`: `qh hook <event>` answers a hook payload
as `lifecycle.mjs` does, `qh hook --artifact-pass <request>` is the detached pass, `qh check-command <dir>` names the
inferred check, and `qh mcp` serves read-only MCP resources (ADR-114). `core/hooks/` holds the rules, each file naming the
Node module it ports in its first lines (`mrw read core/hooks/lifecycle.go:1-3` and so on). The core imports only Go's
standard library and reaches `mrw` through its binary, never a Go import (ADR-110 Follow-ups, resolved 2026-10-17).

**Shipped hooks run Node; nothing selects Go at runtime.** `plugin/hooks/hooks.json` runs `node` for every entry, and no
file under `plugin/` or `core/` reads `QUALITY_HARNESS_HOOK_IMPL`. That variable is a test seam only
(`tests/hook-golden.mjs`: `IMPL` is `go` when it says so, and the binary comes from `QUALITY_HARNESS_QH_BIN` or
`core/bin/qh`). The status, as `adr-next` reported it on 2026-10-20:

- ADR-110 T1 (`qh hook` passes every golden) carries its evidence; T2 (measure the core against Node) is next and is a
  human sign-off; T3 (`hooks.json` points at `qh`) waits on T2.
- ADR-116 (release assets, a verified fetch into `CLAUDE_PLUGIN_DATA/qh/`, and a launcher `plugin/bin/qh-hook` that falls
  back to Node): T1 is next; none of its three tasks has landed, and `plugin/bin/qh-hook` does not exist yet.
- ADR-113 brought the turn-end rules into the core; `tests/hook-golden.mjs`'s `GO_LACKS` is empty and
  `tests/go-core-parity-adr-111.test.mjs` holds it so. `core/hooks/pending.go` names what is not ported: the decision
  context PreToolUse hands over for a governed file.
- ADR-114's `qh mcp` is built and not registered in the plugin until a measured use (its Decision 3).
- Not in the core at all: `branch-state.mjs`, `facts-gate-dispatch.sh` and `post-edit-check.sh`, which `hooks.json` runs
  directly.

Re-run: `python3 plugin/bin/adr-next docs/adr/ADR-110-a-static-core-owns-the-hooks.md` and the same for ADR-116.

## The state directory

`stateDir` (`plugin/scripts/event-log.mjs`, mirrored by `core/hooks/eventlog.go`) is `<git-dir>/quality-harness/` for a
repository — a linked worktree's own git directory, so one worktree's checks never clear another's — and
`<tmpdir>/quality-harness/<sha256 of the directory>/` outside one. `QUALITY_HARNESS_STATE_DIR` replaces the root (each
repository keeps a hashed subdirectory under it); `corpus-probe` uses that to write nothing into a probed repository.

| File | Written by | Read by |
|------|------------|---------|
| `checks.jsonl` | `qh-check` (`plugin/scripts/check-record.mjs`), the only writer | `check-ledger.mjs` (`ledgerPass`), the publish verdict, the turn end |
| `fast-checks.jsonl` | `qh-check --fast` (`check-record.mjs`) | `check-ledger.mjs` (`latestFastPass`); no reader of a full pass opens it (ADR-081) |
| `baseline.jsonl` | `qh-check --baseline` (`check-record.mjs`) | the turn end only (ADR-111) |
| `skips.jsonl` | `qh-check` when it reuses a pass on the same tree (`check-record.mjs`) | `ledger-report.mjs` |
| `passed-tests.json` | `qh-check`, after each pass: its test files by path and content, per ledger and command (`removed-tests.mjs`) | `qh-check`'s next pass, which names a test file gone and not moved |
| `receipts.jsonl` | `adr-verify`, one row per log row it writes (`plugin/lib/record.py`, `RECEIPTS_NAME`) | `adr-lint` (ADR-117 T2) |
| `reviews.jsonl` | `host-review.mjs` (`REVIEWS_FILE`), one row per review it launched | `release-evidence.mjs` (ADR-100) |
| `sessions/<session>.jsonl` | every hook (`appendEvent`, `sessionLogFile`); check events imported from `checks.jsonl` | the rules, `ledger-report.mjs`, the publish verdict |

Beside it, under `CLAUDE_PLUGIN_DATA` (machine-local, not per repository): `claims.jsonl` (`completion-rules.mjs` writes,
`claims-rate.mjs` reads) and `sessions.jsonl` (`on-session-end.mjs` writes, `session-notes.mjs` reads).

ADR-117 makes the state directory written only by its tools: a hook-visible write into it is refused
(`ledger-guard.mjs`, `core/hooks/ledger_guard.go`). Its refusal text names every writer: `qh-check` (checks, fast checks,
baseline, skips), `adr-verify` (receipts), the review launcher (`reviews.jsonl`) and the hooks (their session logs).

## The evidence chain

1. `adr-verify <task.md>` runs a task's `## Acceptance` fence (bounded by `plugin/lib/fence.py`) and appends the row to the
   task's `## Verification Log`; `--mutant` and `--mutant-plan` run a mutant in a worktree (ADR-076) and append to
   `## Mutation Log`; `--human` records a sign-off. Every row it writes leaves a receipt in `receipts.jsonl` (ADR-117 T2).
   Logs are never written by hand (CLAUDE.md §4).
2. `adr-lint <ADR.md>` reads the record and its tasks through `plugin/lib/record.py`, checks each row's digest against the
   Acceptance it claims, and refuses an uncommitted row no receipt names.
3. `adr-next` answers which task is ready and which carry exit-0 evidence for their current Acceptance; SessionStart and
   `work-next.mjs` read the same corpus listing (ADR-039).
4. The suite: `bash scripts/selftest.sh` is the project's declared `check` (`.quality-harness.json`), run through
   `qh-check`, which writes `checks.jsonl`; `fastCheck` is the per-commit subset (ADR-081, ADR-105).
5. The mutation campaign: `node scripts/mutate.mjs` runs `tests/mutations/<source>.json` (one file per mutated source,
   ADR-091) in a worktree of the working tree (ADR-075); CI shards it and reuses a verdict only when nothing it rests on
   changed (ADR-023).
6. `node scripts/release-evidence.mjs <sha>` is the one answer to "may this sha be released": every job of a dispatched
   full campaign concluded success, an outside run is filed for changed readers (`attest-import.mjs`, ADR-070), and a
   recorded review covers every plugin commit since the last tag (ADR-100). Its exit codes are in its own header.

## The release path

`node scripts/release.mjs` (ADR-100 T3) decides every step from what it observes, so a second run resumes:

1. A clean tree, the manifest version against the tags, a full `qh-check` on a machine not contended across it (ADR-115),
   and `bash scripts/dead-code-scan.sh`.
2. The landing, through `land` (`scripts/land.mjs`, ADR-118): it pushes the sha to `land/<sha>`; CI runs there
   (`.github/workflows/selftest.yml` runs on `land/**` pushes); once every context the forge requires has a successful
   newest check-run from the required app, it fast-forwards `main` to that same sha, reads the forge's `main` back and
   deletes `land/<sha>`. `.github/rulesets/main.json` (no bypass actors) refuses a push to `main` whose sha lacks the
   required checks; it does not require `land.mjs` itself, which is this repository's policy for getting them first.
3. It waits for the push run on `main` to exist, then dispatches the full campaign at that sha (BACKLOG §159).
4. It waits for every job of the dispatched run, bounded.
5. It runs `release-evidence` and acts only on its success.
6. It never dispatches while another dispatched run on the ref is in flight.
7. `gh release create vX.Y.Z --target <full sha> --latest`.

Exit codes for `release.mjs` and `land.mjs` are in each file's header.

## Sanctioned refusals

CLAUDE.md §3 sanctions the refusals it lists, and no others. Each lives in both implementations.

| Refusal | Record | Node | Go | Opt-out |
|---------|--------|------|----|---------|
| An unchecked commit or push, at PreToolUse | ADR-061, ADR-081 | `publish-verdict.mjs` via `on-pre-tool-use.mjs` | `core/hooks/publish.go` | `"publish": "warn"` |
| The same, refused by git at the event | ADR-066, ADR-068 | `publish-hook.mjs`, offered to git through `CLAUDE_ENV_FILE` at SessionStart | `core/hooks/orientation.go` (the offer) | `"publish": "warn"` |
| A read-only role editing, committing or pushing | ADR-060 | `on-pre-tool-use.mjs` (`readOnlyVerdict`), and `reviewer-guard.mjs` in the agents' frontmatter | `core/hooks/publish.go` | none: it fences a role the caller made read-only |
| A hook-visible write into the state directory | ADR-117 | `ledger-guard.mjs` via `on-pre-tool-use.mjs` | `core/hooks/ledger_guard.go` | `"ledgers": "warn"` |

The opt-outs are keys in the project's `.quality-harness.json`. `.githooks/pre-commit` refuses too, but only in this
repository's own clones (it is not shipped): a commit while a mutation journal exists, and a staged shipped file nothing
mutates.

## Repository tooling

Nothing here ships (ADR-008); `tests/package.test.mjs` holds that `plugin/` is the whole product.

- **The gate:** `scripts/selftest.sh`, which starts its test files through `scripts/run-tests.mjs` in the order
  `scripts/test-order.mjs` computes; `scripts/coverage.sh` holds the JavaScript and Python floors.
- **Mutation:** `scripts/mutate.mjs` and the catalogue under `tests/mutations/`, whose paths mirror the source each file
  mutates; `scripts/mutation-cache-merge.mjs` and `scripts/campaign-parity.mjs` serve CI's shards;
  `scripts/staged-mutation-guard.mjs` is what `.githooks/pre-commit` asks about an added shipped file;
  `scripts/test-locks.py` says which tasks lock a test (ADR-050).
- **Release:** `scripts/release.mjs`, `scripts/land.mjs`, `scripts/release-evidence.mjs`, `scripts/attest-import.mjs`.
- **Dead code and static checks:** `scripts/orphan-sweep.mjs`, `scripts/dead-code-scan.sh` (with
  `scripts/vulture-allowlist.py`), `scripts/unused-names.sh`.
- **Sweeps** (advisory, a place to look): `scripts/flag-claim-sweep.mjs`, `scripts/backlog-claim-sweep.mjs`,
  `scripts/backlog-record-sweep.mjs`, `scripts/chaos-fixture-sweep.mjs`, `scripts/untimed-spawns.mjs`,
  `scripts/untimed-children.py`, and `scripts/side-door-sweep.mjs` over `scripts/side-doors.json` (ADR-113 T3, ADR-117).
- **Component declarations:** `scripts/components.json`, held to the tree by `scripts/component-manifest.mjs`: every file
  under `plugin/` and every `hooks.json` entry names what consumes it.
- **Hooks for this clone:** `git config core.hooksPath .githooks` (CLAUDE.md §2).

## Dependency Contracts

| # | Rule | Check |
|---|------|-------|
| D1 | What ships is `plugin/` and nothing else; the marketplace entry points there, and the plugin depends on no personal install (ADR-008) | `node --test tests/package.test.mjs` |
| D2 | Every Python gate loads the record grammar from the `plugin/lib/record.py` beside its own `bin/`, and none keeps a copy (ADR-045) | `node --test tests/gates.test.mjs` |
| D3 | Every spawned role declares the capability it needs (ADR-029) | `node --test tests/workflows.test.mjs` |
| D4 | `qh hook` answers what `lifecycle.mjs` answers, row for row, for the same payloads (ADR-110 T1) | `node --test tests/qh-core-parity.test.mjs` |
| D5 | ADR-111's rules and the parity scenarios answer the same in Go as in Node (ADR-113); the PreToolUse decision context is not ported yet (`core/hooks/pending.go`) | `node --test tests/go-core-parity-adr-111.test.mjs` |
| D6 | `hooks.json` is the only thing that selects the hook implementation (ADR-110 Decision 5) | (deferred: ADR-110 T3) |

## Concept Ownership (DRY)

| Concept | Single source | Consumers | Divergence check |
|---------|---------------|-----------|------------------|
| The record grammar (sections, the Acceptance fence, its digest) | `plugin/lib/record.py` | every gate under `plugin/bin/`; `decision-corpus.mjs` mirrors it (ADR-092) | `node --test tests/gates.test.mjs` |
| The order and outcome of check runs | `checks.jsonl`, written only by `check-record.mjs` | `check-ledger.mjs`, `core/hooks/ledger.go` | `node --test tests/qh-check.test.mjs` |
| The ledger row formats both implementations read and write | `plugin/scripts/` (the Node writers) | `core/hooks/json.go`, `core/hooks/eventlog.go`, `core/hooks/ledger.go` | `node --test tests/hook-goldens.test.mjs` |
| The required checks before main moves | `.github/rulesets/main.json` (read back from the forge by `land.mjs`) | `land.mjs`, `release-evidence.mjs` | `node --test tests/land.test.mjs` |
| What counts as a recorded review | `host-review.mjs` (`REVIEWS_FILE`, `REVIEW_COVERING`) | `release-evidence.mjs` | `node --test tests/review-ledger.test.mjs` |
| The mutation catalogue for a source | `tests/mutations/` (one file per mutated source, ADR-091) | `scripts/mutate.mjs`, CI shards, `.githooks/pre-commit` | `node --test tests/package.test.mjs` |

## Composition Root

| Root | Constructs | Check |
|------|------------|-------|
| `plugin/hooks/hooks.json` | every hook command the host runs, with its matcher and timeout | `node --test tests/package.test.mjs` |
| `plugin/scripts/lifecycle.mjs` | the event-to-handler table and the one composed answer per event | `node --test tests/hook-goldens.test.mjs` |
| `core/cmd/qh/main.go` | the `qh` subcommands | `node --test tests/qh-core-parity.test.mjs` |
| `.quality-harness.json` | the project's `check` and `fastCheck`, which `qh-check` runs | `node --test tests/qh-check.test.mjs` |

## Test Doubles

| Fake | Stands in for | Contract (what must hold) | Check |
|------|---------------|---------------------------|-------|
| `tests/hook-golden.mjs` (sandbox and fixture repositories) | a host session on the machine | byte-exact stdout, stderr, exit and ledger rows per scenario, recorded with nothing of the machine | `node --test tests/hook-goldens.test.mjs` |
| the `exec` seam of `release()` in `scripts/release.mjs` | git and gh | every step decided from what the fake answers, nothing from state files | `node --test tests/release.test.mjs` |
| the forge world in `tests/land.test.mjs` | the forge's check-runs and rules | a landing moves main only when the newest required check-run succeeded | `node --test tests/land.test.mjs` |

## Trust & Data Boundaries

| Boundary | Crossing rule | Check |
|----------|---------------|-------|
| An agent's commit or push from a tool call | refused on a tree no `qh-check` passed on, unless `"publish": "warn"` (ADR-061) | `node --test tests/fail-open.test.mjs` |
| A commit or push git runs, however launched | git's `prepare-commit-msg` and `pre-push` refuse the unchecked one (ADR-066, ADR-068) | `node --test tests/publish-hook.test.mjs` |
| A read-only role's tools | no edit, commit or push; other changes are reported at SubagentStop (ADR-060) | `node --test tests/observed-events.test.mjs` |
| The state directory | written only by its tools; a hook-visible write is refused unless `"ledgers": "warn"` (ADR-117 T1) | `node --test tests/ledger-writes.test.mjs` |
| A task's log rows | written by `adr-verify` with a receipt; an uncommitted row without one fails `adr-lint` (ADR-117 T2) | `node --test tests/log-receipts.test.mjs` |
| The paths around the evidence | every side door is listed with its state, and a new one fails (ADR-113 T3) | `node --test tests/side-door-sweep.test.mjs` |
| `main` on the forge | only a sha whose required checks passed reaches it; `land.mjs` gets them on `land/<sha>` first (ADR-118) | `node --test tests/land.test.mjs` |
| A release | only on `release-evidence` success (CLAUDE.md §13) | `node --test tests/release-evidence.test.mjs` |
| What reaches the public repository | no personal path is tracked (CLAUDE.md §6) and every tracked path fits a Windows clone (CLAUDE.md §7) | `node --test tests/path-length.test.mjs` |

## Superseded

- An advisory decided by parsing a command's text rather than by observed events (ADR-041, ADR-042, ADR-047, ADR-048,
  ADR-058, ADR-059) — superseded by ADR-060 (advisories react to observed events).
- A quoted separator is not a joiner (ADR-056) — withdrawn.
- ADR-110 Decision 4 as first written, "the core starts no detached process" — narrowed by its amendment of 2026-10-17
  (ADR-080's and ADR-065's measured waits).
- `lifecycle.mjs` as one file holding every rule — split by event family into `on-*.mjs` (BACKLOG §375, stage D);
  `docs/research/2026-10-10-lifecycle-seams.md` and `docs/research/2026-10-10-lifecycle-shape.md` describe the file before
  that split.
