# ADR-110: A static core owns the hooks, and the lifecycle is opt-in

**Status:** Accepted
**Date:** 2026-10-17
**Owner:** Zy
**Spec:** None — no spec stage; the owner, 2026-10-17, on the benchmark peer's restructure point 6 ("a small always-on core for one-shot fixes, with the ADR/spec lifecycle opt-in"): "worth further exploring … i do prefer golang or even better rust", then "go"
**Cross-references:** docs/adr/ADR-060-advisories-react-to-observed-events.md, docs/adr/ADR-080-no-hook-waits-on-the-artifact-pass.md, docs/adr/ADR-096-turn-end-findings-reach-the-agent.md, docs/adr/ADR-098-what-the-plugin-says-matches-what-it-does.md, docs/adr/ADR-107-the-plugin-works-the-mrw-way.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks; T1's contract is the existing hook goldens, and T2 adds catalogue mutants on the Go source.
**Served-path change:** none until T3; T1 is a second implementation that passes the same transcripts, and T2 measures it.

## Context

Every hook event this plugin registers starts a Node process. Measured 2026-10-17 on the owner's machine at load 8: a
bare `node -e ''` takes 0.10–0.15 s, one event through `plugin/scripts/lifecycle.mjs` 0.10 s, and a Go binary's start
(`mrw --version`) is below `time`'s resolution. `plugin/hooks/hooks.json` registers 13 commands over 11 events, and a
PostToolUse on Bash fires three of them. So every tool call in a session pays about 0.1 s before any rule runs, and on
the one-shot tasks the benchmark measures (ADR-106; no skill was invoked in 54 of 54 plugin-arm attempts, read
2026-10-17), that startup and the turn-end round are the plugin's entire footprint.

The hooks are the always-on half of the plugin: the check ledger and `qh-check`, the tree observation, the publish
verdict, the turn-end rules, the subagent contract, the branch-state brief, the orientation. They are string, file and
`git` work over JSON on stdin, 18,855 lines of JavaScript under `plugin/scripts/` at e5d4769e, with no dependency a
static binary cannot carry. The lifecycle is the other half — the record corpus and its gates (`adr-lint`,
`adr-verify`, `adr-next`, `spec-verify`, `arch-lint`), the skills and the templates — and it is what an adopter opts into
by keeping a decision corpus.

Two things make a second implementation of the hooks tractable rather than reckless. The hook goldens
(`tests/hook-goldens.test.mjs`, `tests/goldens/*.json`: eight scenarios covering orientation, the publish classifier,
full and fast passes, writes and turn ends, subagent and task events, checks, readiness and artifacts) are byte-exact
transcripts of what every event says and leaves in the ledgers, recorded through the real hook in an environment that
holds nothing of the machine. They were written as the refactor contract for `lifecycle.mjs` (BACKLOG §375), and they
are the contract here. And `mrw` is Go: its plan grammar and its ledger are a package the core imports, which is the
owner's "QH and mrw go together" as one binary rather than two CLIs.

The class: every command `plugin/hooks/hooks.json` registers. Enumerated 2026-10-17 by
`mrw read --grep '"command"' --count plugin/hooks/hooks.json`: 13. Left out, on purpose: the lifecycle gates under
`plugin/bin/` (7,000 lines of `adr-lint` alone, with some 350 catalogue mutants behind it; porting them re-opens every
fail-open that catalogue closed), the skills, the templates, and `scripts/` (repository tooling that does not ship).

## Existing Primitives Audit

- **The hook goldens** (`tests/hook-golden.mjs`, `tests/goldens/`): the sandbox, the fixture repositories, the
  normaliser and the eight scenarios. T1 runs them against the Go binary by one seam: the path the sandbox spawns.
- **`mrw`'s Go packages** (tool-multipathreadwrite): the plan parser, the per-line read ledger, the write receipt. The
  core imports them; it writes no plan reader of its own (ADR-107 T2's rule, carried over).
- **The ledgers' formats** (`.git/quality-harness/*.jsonl`, `fast-checks.jsonl`, the session log): unchanged. Both
  implementations read and write the same rows, so a session can switch between them mid-way and nothing is lost.
- **`hooks.json`**: the one registry. T3 changes its 13 commands; nothing else selects an implementation.

## Decision

1. **`qh` is one static Go binary, and `qh hook <event>` is what every hook entry runs (T1).** It reads the same JSON
   on stdin, writes the same stdout, stderr and exit, and leaves the same ledger rows as the Node path, byte for byte,
   across every golden scenario. Its source lives at `core/` in this repository, builds with `go build ./cmd/qh`, and
   imports `mrw`'s packages for plans and the read ledger. Go, not Rust, because `mrw` is Go and the code being replaced is
   subprocess, JSON and regex work that Go's standard library is shaped for; a long-lived daemon would change that
   answer, and Decision 4 forbids one.
2. **T1 ports nothing but the hooks, and the goldens decide when it is done.** No rule is redesigned in the port; a
   golden that the Go binary cannot match is a finding about the port, never a reason to re-record the golden. The Node
   path stays, unchanged, until T3.
3. **The core is measured before it is selected (T2).** Per event, the wall time and the bytes of hook output of both
   implementations, on this repository and on a corpus-less fixture; and in ADR-107 T4's benchmark stage, an arm with
   the Go hooks beside the Node hooks, on turns and cost per attempt. The numbers go into this record's Follow-ups.
4. **The core starts no detached process and owns no daemon.** The branch-state refresher's detached child is the one
   exception today (ADR-065), and it cost the benchmark a pair (a `git status` in a session's tree after the session
   ended, 2026-10-17). In the core, the refresh runs bounded inside the hook that asked for it, or is skipped and said.
5. **The lifecycle is opt-in by the corpus, not by a flag (T3).** The core says, at SessionStart in a repository with a
   decision corpus, one line that the lifecycle gates and skills apply here, and says nothing about them where there is
   none. The gates stay Python and JavaScript, invoked by name as today. `hooks.json` points at `qh hook` only after
   T2's numbers are in and the owner has read them.

**This fails if**: T3 lands before T2's numbers are in this record; any golden is re-recorded to match the Go binary;
the core spawns a detached process; a session that switches implementation loses a ledger row either could read; the
Go binary is selected by anything other than `hooks.json`.

## Alternatives Considered

- **(a) Rust.** The owner's stated preference. Not taken for this record: `mrw`'s grammar and ledger would need a second
  implementation or an FFI boundary, and the hooks hold no long-lived state that memory safety would protect. It is the
  right answer if the core ever grows a daemon, which Decision 4 forbids.
- **(b) Keep Node and cut the hook count.** Rejected as insufficient: the floor is the interpreter's start, measured at
  0.10 s, and three PostToolUse commands can be one but not zero.
- **(c) Route by task size with a flag or a classifier.** Rejected: a classifier over "is this a one-shot task" is an
  open-input predicate (CLAUDE.md §16) and fails open in one direction; the corpus is a fact the core can check.
- **(d) Port the gates too.** Rejected: the evidence chain's value is its catalogue, and a port re-opens it.
- **(e) Bundle `mrw` as a subprocess rather than importing it.** Rejected: two binaries, two installs, and the CLI
  boundary throws away the ledger the core needs for ADR-109's inversion.

## Component / Boundary Impact

New: `core/` (Go module), `cmd/qh`, a build step in CI for three platforms (`GOOS=darwin,linux,windows`). Changed at T3
only: `plugin/hooks/hooks.json`'s 13 commands. The plugin's install shape gains one binary per platform; the plugin
manifest and the skills are unchanged. This repository has no architecture document; the module map is this section.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `cmd/qh` | `qh hook <event>`: stdin JSON in, the Node path's exact stdout, stderr, exit and ledger rows out | T1 | the host, via `hooks.json` after T3 |
| `tests/hook-golden.mjs` | one seam: which implementation the sandbox spawns (`QUALITY_HARNESS_HOOK_IMPL=go` names the built binary) | T1 | `tests/hook-goldens.test.mjs`, run twice in CI |
| `plugin/hooks/hooks.json` | 13 commands become `qh hook <event>` | T3 | the host |
| SessionStart | one line naming the lifecycle where a corpus exists | T3 | the agent |

## Inter-task Contracts

| Contract | Producer | Consumer | Note |
|----------|----------|----------|------|
| `qh hook <event>` passing every golden | T1 | T2, T3 | T1 before T2 |
| the per-event and per-attempt numbers in Follow-ups | T2 | T3 | T3 only after the owner reads them |

## Implementation

See `docs/adr/ADR-110-a-static-core-owns-the-hooks/tasks/README.md`.

## Consequences

- **Positive:** about 0.1 s less per tool call and per prompt for every adopter, before any rule runs; one binary that
  is also `mrw`'s grammar; Windows hook behaviour that no longer depends on how Node spawned a shell.
- **Negative:** two implementations of the hooks during T1 and T2, kept honest only by the goldens; a Go toolchain in
  CI; a platform binary per release.
- **Neutral:** the gates, the skills and the records are untouched; an adopter who never installs the binary keeps the
  Node hooks until T3, and after T3 `hooks.json` is the one place that says which runs.

## Out of Scope

- Porting any gate under `plugin/bin/` (permanent: boundary: Decision 2 and alternative (d))
- A Rust core (deferred: alternative (a); revisited only if a daemon is ever decided)
- A task-size classifier (permanent: boundary: alternative (c), CLAUDE.md §16)
- Changing what any hook says (permanent: boundary: Decision 2; a wording change is its own record, as ADR-108 is)
- The benchmark arm itself (deferred: ADR-107 T4's stage, in tool-multipathreadwrite)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The goldens under-specify an event, so the port passes them and still differs | Med | High | T1 adds a golden for every event `hooks.json` registers that has none, before porting that event; T2's byte comparison runs on this repository's real sessions, not only fixtures |
| `mrw`'s packages change under the core | Med | Med | the core pins `mrw` by module version; a bump is a commit with the goldens re-run |
| The port drifts from the Node path while both exist | High | Med | CI runs the goldens against both until T3 removes the Node path's registration |
| A platform binary is missing at install | Low | High | T3's install step refuses to point `hooks.json` at a binary that does not answer `qh --version` on that platform, and says so |

## Rollback

Before T3: delete `core/`; nothing else changed. After T3: revert `hooks.json`'s commit; the Node scripts are still in
the tree and read the same ledgers.

## Follow-ups

- [ ] T2's numbers: per event, wall time and output bytes for both implementations; per attempt, turns and cost in the benchmark arm.
- [x] Owner decision: Accepted by the owner, 2026-10-17 ("go"); T3 waits on T2's numbers.
