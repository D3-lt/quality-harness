# ADR-027: Ship an operating surface, and make the countable half a command

**Status:** Accepted
**Date:** 2026-09-03
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-001-skills-are-never-linked.md, docs/adr/ADR-004-templates-are-not-linked.md, docs/adr/ADR-019-an-orphan-must-prove-it-is-ours.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-026-the-front-door-is-a-product-page.md, docs/BACKLOG.md
**Governs:** None — declared by its tasks. Both files this decision owns are CREATED by T1 and T2, and `tests/gate-regressions.py::every pointer in this corpus resolves` correctly refuses a record that declares authority over paths no tracked file matches. Declaring them here at Proposed would be the pointer-to-nothing rot ADR-011 exists to catch; the tasks' `## Affected Files` tables carry them, which is where `adr-context` reads scope from when this header is absent.
**Enforced-by:** `tests/qh-doctor.test.mjs::the severity split is read out of the gate, not restated here`
**Invalidates:** ADR-008 — one clause of it, deliberately. ADR-008 decided what ships, and `tests/package.test.mjs::what ships is the plugin and nothing else` held `README.md` in its WITHHELD list; T3 moves it to the shipped list because the plugin needs a door of its own. The rest of ADR-008 stands untouched: the repository's own README, `docs/`, `tests/` and `.github/` still do not ship, and the marketplace source is still `./plugin`. ADR-001 and ADR-004 (skills and templates are never linked into a home directory) and ADR-019 (a file the plugin cannot prove it wrote is never named or acted on) are NOT invalidated — this record only reports what they already produce, and inherits ADR-019's refusal verbatim.

<This line said `none — checked` until the shipped-set gate refused `plugin/README.md`. The first draft of this record rejected a README, so the claim was true when written and false the moment T3 was added — which is exactly the stale cross-reference the corpus exists to catch, caught by the corpus.>
**Served-path change:** An adopter runs one command and is told the plugin root and version, whether each `~/.claude/bin` entry is a forwarder or a copy, what the plugin currently ships, and which lint findings fail versus advise — facts they presently reconstruct by reading source and then hand-maintain as prose.

## Context

GitHub issue #9, filed 2026-09-03 by an adopting user against v2.57.1, reports that using this
harness across projects costs them **150 lines of `~/.claude/CLAUDE.md` — 55% of a 273-line global
instruction file** that governs every project and every session.

Every claim in it was verified against this tree at v2.57.1 before this record was written:

| claim | checked with | result |
|---|---|---|
| `plugin/` ships no README and no `docs/` | `ls plugin/` | confirmed — seven directories, no prose entry point |
| 13 skills, 2,072 lines, all task-scoped | `ls plugin/skills \| wc -l`, `cat plugin/skills/*/SKILL.md \| wc -l` | confirmed exactly |
| `adr-lint` severity split is 50 failing to 48 advisory | `grep -c 'errors\.append(' plugin/bin/adr-lint`, same for `advise` | confirmed exactly |
| `adr-lint` has no `--version` | `grep -c '\-\-version' plugin/bin/adr-lint` | confirmed — 0 |
| the `external:` and typed-permanent-base vocabulary exists | `grep -c 'external:' plugin/bin/adr-lint` | confirmed — present and undocumented outside the template |

The reporter's own three drifts are the argument, and they all run one way — **the hand-written
file made the tool look stricter and narrower than it is.** It claimed `adr-lint` *rejects* an Out
of Scope bullet with no disposition, where the gate advises. It documented `(deferred: …)` and
`(permanent[: why])` but not `(external: <where>: <pointer>)` or the typed permanent bases, so those
forms were never authored — a shipped, tested, contract-asserted capability, unreachable because the
only document its author reads did not mention it. And it enumerated six template sections against a
template carrying twenty.

That is this project's own defect class turned on itself, and ADR-026 has already established the
shape of the answer for the front page: a reader needs a door, and prose that restates a live
artifact starts losing the day it is written.

**Debt reconciled at authoring time.** `adr-debt docs/adr` reports 79 deferred rows; the two that
touch this decision are §25's *"Removing the `qh-root` note from the eight skills that carry it"* and
*"Making templates release-proof the way gates are"*. Both stay deferred and are re-pointed below
rather than silently absorbed: this record adds an operating surface, it does not change how skills
or templates are installed, which is ADR-001's and ADR-004's ground.

## Existing Primitives Audit

- **`plugin/scripts/standalone-link.mjs`** already exports every classifier this needs:
  `FORWARDER_MARK`, `classifyHomeFile`, `scanSet`, `barePathWinner`, `releaseIndex` and `orphans`.
  **Reuse, not reshape.** Writing a second classifier would create exactly the second source of
  truth this record exists to remove, and `orphans()` already carries ADR-019's refusal.
- **`plugin/scripts/sync-standalone.mjs`** already answers "what differs". `qh-doctor` calls it
  rather than re-deriving drift.
- **`plugin/scripts/adr-state.mjs`, `adr-context.mjs`, `work-next.mjs`, `plugin/bin/adr-next`,
  `adr-debt`** are the existing "ask the tool for the fact" family. `qh-doctor` joins it and is
  named in the issue as fitting it.
- **`scripts/release-evidence.mjs`** is the precedent for a reporter with meaningful distinct exit
  codes, including a `could not look` that is not a failure (ADR-005). Reused as a shape, not code.
- No existing skill is about operating the harness. All 13 are task-scoped. Nothing to reshape.

## Decision

Ship two things, split by whether a machine can answer the question.

**1. `plugin/scripts/qh-doctor.mjs` — the countable half, measured on every run.** One command
printing: the resolved plugin root and version; each `~/.claude/bin` entry classified as
`forwarder`, `copy`, `stale` or `unidentifiable`; the live inventory of skills, gates, templates and
workflows counted from the tree; drift, by calling `sync-standalone.mjs`'s own logic; and the
`adr-lint` severity split derived by reading the gate's source. Exit codes follow
`release-evidence.mjs`: `0` clear, `1` at least one home entry is a COPY, `2` could not look.

A copy earns the non-zero exit because it is the failure mode with a measured consequence — the
issue reports a standalone `adr-lint` of 455 lines against the plugin's 1,125 that **passed an ADR
the plugin rejected**. This is a report a user runs, not a gate in anyone's way, so the exit code is
a verdict and not a block; CLAUDE.md §3 is untouched.

**2. `plugin/skills/operating/SKILL.md` — only the judgment no command can output.** Why a
standalone copy is dangerous, why the template is authoritative over any enumeration of it, the
forwarder-versus-copy distinction with its correction history, and the habit for verifying an
upgrade. It points at `qh-doctor` for everything countable and enumerates nothing.

**3. `plugin/README.md` — the door, for a reader who has not loaded anything yet.** What the harness
is, the stage-to-command map, and where to go next. It ships INSIDE `plugin/`, so it is downloaded
and versioned with the thing it describes, and it is the surface a human browsing the marketplace or
the plugin cache actually lands on. Measured 2026-09-03 in `~/.claude/plugins/cache`: Anthropic's own
`skill-creator` and `figma` plugins ship one, and so does `eidos` — this is the convention, not an
exception to it. Like the skill, it points at `qh-doctor` for anything countable and at
`plugin/templates/adr-template.md` for vocabulary.

**The three are not alternatives to each other; they are three readers.** `qh-doctor` answers a
machine's question, the skill is what an agent loads mid-task, and the README is what a person opens
first. The anti-rot rule is the same for all three and is what actually does the work: none of them
enumerates anything a command can count.

**The pre-registered failure, and data that could produce it exists today.** If a later reading of
`plugin/skills/operating/SKILL.md` finds it has grown a list of skills, gates, templates or lint
findings, the split has failed and the enumerating half must move into `qh-doctor` or be deleted.
`git log -p -- plugin/skills/operating/SKILL.md` is the check, and the corpus that would produce the
failure is this repository's own next six months of edits — the same corpus that produced the
reporter's three drifts. Valid for a plugin whose shipped inventory changes most releases; do not
carry the threshold to a frozen artifact.

## Alternatives Considered

- **Shipping only the skill and no `plugin/README.md`.** REJECTED, and the first draft of this record
  rejected the README instead — on two reasons, one of which was simply false. It said "a README is
  prose with no version coupling to the thing it describes". A README inside `plugin/` is downloaded
  with the plugin and carries its version, which is exactly the coupling I claimed it lacked; the
  document that failed in issue #9 was an adopter's `~/.claude/CLAUDE.md`, which is uncoupled because
  it lives OUTSIDE the plugin, not because it is a README. The second reason — "agents load skills,
  not READMEs" — is true of agents and irrelevant to the human who opens the plugin first, and it is
  contradicted by the convention: `skill-creator`, `figma` and `eidos` all ship one. Corrected here
  rather than quietly: the error was mine, it was caught in review by the owner, and the reasoning is
  kept because a rejected alternative whose reason was wrong is worth more than a silently reversed one.
- **Put `qh-doctor` in `plugin/bin/` as a Python gate,** beside the other eleven. Rejected: every
  classifier it needs is already exported from `standalone-link.mjs` in JavaScript, so a Python
  binary would either shell out to Node or reimplement classification — a second source of truth for
  "is this a forwarder", which is the defect this record is about. It ships in `plugin/scripts/`
  beside `adr-state.mjs` and `work-next.mjs`, the family the issue names.
- **Only the skill, no command.** Rejected by the issue's own evidence: every one of the three
  drifts was a *restatement of something measurable*. A skill alone would be the same artifact that
  already failed, shipped one directory further in.
- **Only the command, no skill.** Rejected: the forwarder-versus-copy history and "why a standalone
  copy is dangerous" are judgment, and a command that printed them would be prose with an exit code.
- **Add `--version` to `adr-lint`** as the issue notes is missing. Deferred rather than rejected —
  it is a real gap and a different decision, and `qh-doctor` answers the question the missing flag
  was being used to answer.

## Component / Boundary Impact

Three new components, all leaves. `qh-doctor` depends on `standalone-link.mjs` and
`sync-standalone.mjs` and nothing depends on it; the skill and the README depend on nothing and are
reached by name and by opening the plugin directory respectively.
None is imported by an existing module, so no existing component gains a reason to change.
Ownership after the change: the operating surface is the plugin's, which is the whole point — it is
currently owned by each adopter's global config.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `node "$QH/scripts/qh-doctor.mjs"` | new command, exit `0` clear / `1` a copy is installed / `2` could not look | T1 | adopters, `plugin/skills/operating/SKILL.md` |
| `quality-harness:operating` | new skill name, loadable by an agent | T2 | agents operating the harness |
| `plugin/README.md` | new file, shipped inside the plugin and versioned with it | T3 | a human opening the plugin or its marketplace entry |
| `plugin/.claude-plugin/plugin.json` | no change — skills and scripts are discovered from the tree | — | — |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `node "$QH/scripts/qh-doctor.mjs"` invocation and its exit codes | T1 | T2, T3 | No — both only name the command; it is additive |

## Implementation

See `tasks/README.md`. Three tasks.

## Consequences

- **Positive:** the operating facts an adopter needs are versioned with the plugin that produces
  them, so they update when it does — the property a user's `CLAUDE.md` structurally cannot have.
  The countable half cannot rot, because it is measured on every run.
- **Positive:** a capability that exists and is unreachable is the class this project is about; two
  of them (`external:`, typed `fact:` bases) become discoverable.
- **Negative:** a fourteenth skill, a fifteenth script and a README, on a surface the issue already calls
  large. Mitigated by the pre-registered failure above, which deletes the skill's enumerating half
  if it grows one.
- **Negative:** `qh-doctor` reads the home directory, which is machine-dependent by nature. It
  reports what it found and refuses to characterise what it cannot prove (ADR-019), so a green run
  on one machine is not a claim about another — and it says so in its own output.
- **Neutral:** nothing about how skills, gates or templates are installed changes. ADR-001 and
  ADR-004 are untouched.

## Out of Scope

- Adding `--version` to `adr-lint` and the other gates (deferred: docs/BACKLOG.md §113)
- Removing the `qh-root` note from the eight skills that carry it (deferred: docs/BACKLOG.md §25)
- Making templates release-proof the way gates are (deferred: docs/BACKLOG.md §25)
- Rewriting the reporter's own `~/.claude/CLAUDE.md`, or any adopter's (external: the adopter's machine: GitHub issue #9)
- `plugin/docs/` as a directory of further prose (permanent: boundary: the README is the door and the skill is the depth; a third prose tier would be the enumeration this record exists to prevent, one level down)
- Shipping the half of the reporter's 150 lines that is genuinely theirs — house ADR thresholds, per-project path conventions, composition with their other plugins (permanent: fact: the issue itself classifies these as category B and argues they should stay local; citation: url https://github.com/D3-lt/quality-harness/issues/9)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The skill grows an inventory and rots exactly as the report's CLAUDE.md did | Med | High — it would reproduce the defect one directory closer | The pre-registered failure in the Decision, with a named check and a corpus that can produce it |
| `qh-doctor` characterises a file it did not write | Low | High — ADR-019 exists because of this | Inherits `orphans()`/`classifyHomeFile`, which already refuse; asserted by a test that a foreign file is reported `unidentifiable` |
| The severity split is restated instead of derived, and drifts | Med | Med — it is the exact figure the report found stale | `Enforced-by` names the test; the count is read from `plugin/bin/adr-lint` at run time |
| Home-directory reads make the output machine-dependent | High | Low | Expected and stated in the output; the machine-independent half (inventory, severity) is derived from the tree |

## Rollback

Delete `plugin/scripts/qh-doctor.mjs`, `plugin/skills/operating/` and `tests/qh-doctor.test.mjs`,
and remove the two mutation entries from `tests/mutations.json`. No persistent state, no contract
another component consumes, no external integration — both additions are leaves, so removal is a
deletion and nothing else.

## Follow-ups

- [ ] After one release cycle, read `plugin/skills/operating/SKILL.md` against the pre-registered
      failure and delete any enumeration it has grown.
