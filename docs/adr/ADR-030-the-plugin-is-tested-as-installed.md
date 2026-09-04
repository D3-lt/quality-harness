# ADR-030: Give the delegation machinery a socket, and test the plugin as installed

**Status:** Proposed
**Date:** 2026-09-04
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-029-a-role-declares-the-capability-it-needs.md, docs/adr/ADR-028-a-step-names-the-run-that-exercised-it.md, docs/adr/ADR-008-the-plugin-is-not-the-repository.md, docs/adr/ADR-019-an-orphan-must-prove-it-is-ours.md, docs/adr/ADR-027-the-harness-ships-an-operating-surface.md, docs/BACKLOG.md
**Governs:** None — declared by its tasks. The files this decision owns are created by T1 and T2, and a `Governs:` naming paths before they exist is the rot ADR-011 catches.
**Enforced-by:** `tests/installed.test.mjs::every shipped surface is reachable from the installed plugin`
**Invalidates:** none — checked. ADR-029 declared capability at the CALL SITE and explicitly left named definitions to a later decision with a different trigger; this is that decision, and it does not change a single `agent()` call. ADR-008 decided what ships and is untouched: this adds a directory INSIDE `plugin/`, and the shipped-set test is extended in the same commit rather than worked around.
**Served-path change:** A skill can address a role by name instead of describing it in prose, and every shipped surface is exercised from the plugin as a user installs it rather than only from a checkout.

## Context

**Two gaps, and they share a cause.** A peer session's harness audit (2026-09-03) enumerated the host
surfaces this plugin does not stand on. Running it here found the project ahead on distribution and
level on exactly one axis — subagent configuration. ADR-029 closed half of that: ten `agent()` calls
that declared nothing now declare `model`. It deliberately left the other half, and said so.

**The half left open is the socket.** `plugin/agents/` does not exist, so `permissionMode`,
`maxTurns`, `memory`, `isolation` and per-agent hooks are at their defaults for every role, and
**a skill cannot address a role by `subagent_type` at all** — it can only describe one in prose and
hope. ADR-028 and ADR-029 built the machinery for a strong planner directing weaker executors
(PEAR: ~50% utility for strong-planner/weak-executor against ~30% the other way), and the machinery
currently has nothing to plug into. Measured 2026-09-04: this machine's `/reload-plugins` reports
**11 agents across 8 installed plugins, and this plugin contributes none of them.**

**The second gap is how any of it is verified.** Every test in this repository runs against the
CHECKOUT. `tests/` spawns gates from `plugin/bin/`, reads workflows from `plugin/workflows/`, and
imports scripts by relative path. Nothing exercises the plugin **as a user receives it** — unpacked
in the plugin cache, addressed through `${CLAUDE_PLUGIN_ROOT}`, with only the files ADR-008 ships.

That is CLAUDE.md §8's rule one level up: *a gate whose answer depends on who is asking is not a
gate*. A checkout has `tests/`, `docs/`, `scripts/` and a `.git`; an installed plugin has none of
them. Every defect this project has shipped in that gap was invisible locally — the `${CLAUDE_PLUGIN_ROOT}`
placeholder that stays literal outside a plugin (why `qh-root` exists), the standalone gate measured
passing a record the plugin rejected, and the entry guard that made six scripts no-ops on Windows.
**A green suite from a checkout is not evidence about the artifact.**

**And the install path is live, not hypothetical.** `qh-root` exists because resolving the newest
installed copy by string order picks `2.9.0` over `2.59.0` — measured on this machine today, where a
naive `ls | tail -1` answers `2.9.0` and `qh-root` correctly answers `2.59.0`.

## Existing Primitives Audit

- **`plugin/bin/qh-root`** already resolves the newest installed plugin, version-aware, and already
  exits non-zero rather than guessing when it cannot find one. **Reuse it as the locator** — T2 has no
  business reimplementing version ordering, which is the exact thing that was got wrong before.
- **`plugin/scripts/qh-doctor.mjs`** (ADR-027) already classifies what is installed and already
  distinguishes "could not look" from a finding. T2's report reuses its vocabulary rather than
  inventing a second one.
- **`tests/package.test.mjs::what ships is the plugin and nothing else`** already asserts the shipped
  set in both directions. It is EXTENDED for `agents/` in the same commit as T1, never worked around.
- **`plugin/scripts/lifecycle.mjs::subagentContract`** already speaks to a spawn through
  `SubagentStart`, and ADR-029 T2 already puts the declared capability there. A named definition adds
  a name to that conversation; it does not need a new channel.
- No existing primitive runs anything from the installed cache. Nothing to reshape for T2.

## Decision

**Ship named agent definitions, and add one check that exercises the plugin from where a user runs
it.**

**1. `plugin/agents/` — the socket.** A small set of definitions for the roles this plugin already
spawns, each declaring what the host lets a definition declare. Named, so a skill can say
`subagent_type: <name>` instead of describing a role in prose and hoping the model reconstructs it.

★ **The definitions carry a CAPABILITY CLASS, never a version-pinned model id** — ADR-029's rule,
which stands unchanged and now applies in a second place. That is the whole reason this is additive
rather than a competing source of truth: a definition and a call site both request a class, and the
host binds both.

**2. `tests/installed.test.mjs` — the plugin as installed.** One check that locates the installed
plugin with `qh-root`, and asserts that every surface a user reaches is reachable THERE: each gate
runs, each skill's frontmatter parses, each workflow parses, and the files ADR-008 withholds are
absent.

**Three limits are part of this decision.**

**It SKIPS, loudly, when no install is present.** A fresh checkout and CI have no installed plugin,
and a check that failed there would be a check people delete. Absent install is `UNRUN` — reported,
never a finding, never silence (ADR-005).

**It never writes to the installed copy.** It reads and executes; it does not repair. A test that
mutates the user's install would make a green run depend on having damaged something.

**It asserts REACHABILITY, not behaviour.** The gates' behaviour is covered by the existing suites
against the checkout, and duplicating that here would be two sources of truth for one claim. This
answers the different question ADR-008 opened: *is the thing we ship the thing we tested?*

**Pre-registered failure, with data that could produce it today.** If `tests/installed.test.mjs`
reports `UNRUN` on every machine that runs it for a month, it is measuring nothing and should be
deleted rather than kept as reassurance. The check is its own output: `grep -c UNRUN` over CI logs
against the number of runs. Valid while this project is developed on machines that also install it;
do not carry it to a repository whose authors never install the artifact.

## Alternatives Considered

- **Put the definitions in `plugin/skills/` prose instead.** Rejected: that is what exists today, and
  it is why a role cannot be addressed by name. Prose describing a role is exactly the restatement
  ADR-027 refuses.
- **Have T2 install the plugin itself, from the checkout.** Rejected, and it was tempting: it would
  make the check run everywhere including CI. But then it tests an install THIS TEST performed, not
  the one the user has — the same "measures the wrong tree" defect ADR-008 named. `UNRUN` where there
  is no install is the honest answer.
- **Make T2 blocking in CI.** Rejected: CI has no installed plugin, so it would be permanently red or
  permanently skipped, and a check that is always one of those teaches people to ignore it.
- **Do the whole §115 surface list** — `statusLine`, `outputStyle`, `permissions`, headless,
  `UserPromptExpansion`. Rejected as a set: using a surface because it exists is the speculative
  complexity this project rejects. Each is deferred or refused individually in Out of Scope, with the
  reason, so a later reader sees which were judged and which were merely not done.
- **Do nothing and rely on releasing carefully.** Rejected: every install-gap defect this project has
  had was invisible to a careful local run, which is the argument for a check rather than for more
  care.

## Component / Boundary Impact

One new shipped directory (`plugin/agents/`) and one new repository-only test. `plugin/agents/` is a
leaf: nothing imports it, the host reads it. `tests/installed.test.mjs` depends on `qh-root` and on
the installed tree, and nothing depends on it. No existing component gains a reason to change.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `plugin/agents/<name>.md` | new: named roles addressable by `subagent_type` | T1 | skills that delegate; the host's agent loader |
| `tests/package.test.mjs` shipped set | `agents` joins the list ADR-008's test enforces | T1 | this repository's own gate |
| `tests/installed.test.mjs` | new check, `UNRUN` where no install exists | T2 | this repository's own gate |

No public contract changes for a plugin CONSUMER: nothing existing changes shape, and a host that
ignores `agents/` behaves exactly as today.

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `plugin/agents/` exists and ships | T1 | T2 | No — T2 asserts every shipped surface is reachable, and simply covers one more directory once T1 lands |

## Consequences

- **Positive:** the delegation machinery of ADR-028 and ADR-029 gains something to plug into, and the
  remaining subagent knobs become expressible.
- **Positive:** the question ADR-008 opened — is the thing we ship the thing we tested — gets an
  answer that is run rather than assumed.
- **Negative:** a check that skips on most machines. Mitigated by the pre-registered deletion
  criterion, and by `UNRUN` being loud rather than silent.
- **Negative:** two places now request a capability class (a call site and a definition). Accepted:
  they are different callers, not two answers to one question, and both obey ADR-029's alias rule.
- **Neutral:** nothing about the existing suites changes; they keep testing the checkout, which is
  what they are for.

## Out of Scope

- Headless `-p --output-format json` integration (deferred: docs/BACKLOG.md §115)
- `statusLine` (deferred: docs/BACKLOG.md §115)
- `UserPromptExpansion` prompt-time routing (deferred: docs/BACKLOG.md §115)
- Asserting the BEHAVIOUR of gates from the installed copy — the checkout suites own that (permanent: boundary: two sources of truth for one claim is the defect this corpus keeps deleting; the installed check answers reachability, which nothing else asks)
- Repairing anything the installed check finds (permanent: boundary: a test that mutates the user's install makes a green run depend on having damaged something; `sync-standalone.mjs --link --apply` already repairs and is a user's call)
- `outputStyle` and `permissions` (permanent: boundary: no defect or stated need asks for either, and adopting a surface because it exists is the speculative complexity this project rejects)
- Any use of the `exit 2` veto on the four veto-capable events this plugin already registers (permanent: fact: CLAUDE.md §3 decides that gates instruct and never block, and reversing it is a decision owing its own argument rather than a line item here; citation: file `CLAUDE.md:113`)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The installed check skips everywhere and reassures without measuring | Med | Med — a check nobody's machine runs is decoration | The pre-registered deletion criterion, with a named command; `UNRUN` is printed, not silent |
| A named definition and a call site disagree about a role's capability | Med | Low — the host binds each independently | Both obey ADR-029's alias rule; neither is authoritative over the other, and Consequences says so |
| The check reads a STALE install and reports a defect already fixed | High | Med — this exact confusion cost a peer a false report | It reports the version it resolved, via `qh-root`, in every finding — the fix for the class measured on 2026-09-01 |
| `agents/` ships something that shadows a host or user agent name | Low | Med | T1 namespaces every definition and the shipped-set test names them |

## Rollback

Delete `plugin/agents/` and `tests/installed.test.mjs`, and remove `agents` from the shipped set in
`tests/package.test.mjs`. Both are leaves: nothing imports either, no persistent state, no migration,
and no evidence row is touched.

## Follow-ups

- [ ] After a month, run the pre-registered check and delete `tests/installed.test.mjs` if it has
      reported `UNRUN` on every run.
