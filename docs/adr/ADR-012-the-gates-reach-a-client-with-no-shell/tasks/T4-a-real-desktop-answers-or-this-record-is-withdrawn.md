# Task ADR-012-T4: Package the server, and measure whether a real Claude Desktop can use it

**Blocked-on:** a person with Claude Desktop installed registers `qh-mcp`, restarts the client, calls a `qh_*` tool against a corpus and reports the finding. Only they can confirm it — no command here can, because the observation IS a human using another program on their own machine. The sign-off lands as a `human-observed` Verification Log entry on this task.
**Depends-on:** T1, T2, T3
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** none — this is the terminal task
**Consumes:** the tool result shape (T3)
**Data dependency:** needs a real Claude Desktop install, restarted, on the machine running the measurement

## Goal

`qh-mcp` ships like every other gate — forwarder, `.cmd` shim, packaging test — and a real Claude
Desktop, registered against it, answers a question only a gate can answer.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/mcp.md` | add | The `claude_desktop_config.json` entry a user copies, and what the client does and does not get |

The Windows shim, the packaging list and this record's `Governs:` were owned by T1 instead: the
packaging suite asserts a shim and a mutation catalogue entry per `bin/` entry, so the gate went red
the moment `plugin/bin/qh-mcp` existed and there was nothing to defer. `adr-lint` refused the
duplicate `add` and is what caught it.

`plugin/scripts/standalone-link.mjs` is deliberately NOT edited: it generates a forwarder for every
entry it finds in `plugin/bin/`, so the new one is picked up by construction. The packaging test is
what proves that actually happened rather than assuming it.

## Ordered Steps

1. Confirm the failing test first — write the RED packaging test asserting `plugin/bin/qh-mcp` and
   its `.cmd` ship, and that the mode in
   **git's index** (`git ls-files -s`) is executable. A Git for Windows checkout reports `0644` for
   everything on disk, so `statSync` answers a question about the checkout rather than the package
   (CLAUDE.md §7). Confirm red before adding the files.
2. Add the `.cmd` shim, matching the existing ones rather than inventing a shape.
3. Write `docs/mcp.md`: the config entry, the five tools, and — plainly — that `adr-verify` and
   `spec-verify` are absent and why. A user who cannot find them must find the reason instead of
   assuming it is an oversight.
4. Register against a real Claude Desktop and restart it. Ask it: *"use the quality-harness tools to
   lint the ADRs in <path> and tell me what they say."* Record the exact prompt, whether a tool was
   called, and the answer.
5. Record the `WithInstructions` observation in the same run — did any of the server's instruction
   text reach the model? This is the measurement agentsmemory's ADR-021 T3 has had pending for a
   week; report it back to that corpus whichever way it goes.
6. Set `Governs:` on the parent record now that `plugin/bin/qh-mcp` is tracked.

## Acceptance

Acceptance is human-observed: a Claude Desktop session, restarted after registration, called at
least one `qh_*` tool and reported the gate's finding. Sign-off records the exact prompt, the tool
called, the corpus path, and whether the server's instruction text was visible to the model.

The automated half — packaging — runs as part of the suite and is not this task's acceptance,
because it cannot answer the question this task exists to ask.

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `what ships is the plugin and nothing else` | `tests/package.test.mjs` | Existing test; the new bin entry and its shim are in the shipped tree | — |
| `every shipped gate carries at least one mutation` | `tests/package.test.mjs` | Existing test; `qh-mcp` is a gate and must be in the campaign | — |
| `a bin entry ships executable in git's index` | `tests/package.test.mjs` | The mode git records, not the mode this checkout has | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | The packaging assertions |
| 2 — something selects it | `standalone-link.mjs` finding the new bin entry, asserted rather than assumed |
| 3 — the caller can discover it | `docs/mcp.md` carries the config entry; the `claude_desktop_config.json` snippet IS the discovery mechanism for this client |
| 4 — it is used | **This task's sign-off is the rung-4 measurement** — the only one in this record, and the reason the acceptance is human-observed |

**Status 2026-08-29:** steps 1-3 and 6 are done — the packaging assertions cover `plugin/bin/qh-mcp`
and its shim (T1 added the gate to the lists those tests read, and `git ls-files -s` records `100755`
for the gate), `docs/mcp.md` is written, and the parent record's `Governs:` is set. Steps 4 and 5 —
the measurement — are what remain, and they need a Claude Desktop restart on the machine doing the
measuring. The task stays `pending`: an unrun measurement is not a finding, and a `done` row without
its own exit-0 evidence is refused for exactly this reason.

The smoke check to run before touching Desktop, and the config entry to paste, are both in
`docs/mcp.md`. The handshake carries an `instructions` string; whether Desktop renders it into the
model's context is step 5's observation, and it is the measurement agentsmemory's ADR-021 T3 has had
pending for a week.

### Step 5, taken 2026-08-29 — Desktop does NOT surface `WithInstructions` to the model

**Claude Desktop 1.40609.0, macOS, registered servers at the time of the measurement:
`quality-harness`, `MCP_DOCKER` (~180 tools) and `agentsmemory`.** Registration is
`command` = the absolute `sys.executable`, `args` = the absolute path to `plugin/bin/qh-mcp`.

The probe was designed to be answerable from ONE source only. The handshake was already known to
CARRY the string — `initialize` returns a populated `instructions` field — so carrying it proves
nothing about rendering, and a probe answerable from the tool descriptions would have been no probe
at all. Diffing the `instructions` text against the five descriptions leaves exactly one
discriminator: the error channel means the gate **COULD NOT RUN**, *"which is not the same answer as
finding nothing"*. `advis`/`ADVICE` appear in both and are therefore worthless here; that sentence
appears in no description.

Asked, before any tool call: *"what do the quality-harness server's instructions say about its error
channel — what does an error mean there, as opposed to a finding?"*

The answer opened: *"I don't have a separate server-instructions block for quality-harness — what
loaded is the five tool descriptions. So I can tell you what those say about the distinction, but I
shouldn't dress it up as a documented server-level policy I've read."*

**This is a null with positive evidence behind it, not a silence.** Three things make it stronger
than a failure to reproduce a sentence:

1. The model reported the ABSENCE explicitly and unprompted, and declined to pass off the
   descriptions as the instructions — the exact confusion this probe was built to detect.
2. It then reconstructed the finding/error split from the descriptions alone and got it
   *differently*: it grounded "an error is a broken call" in `qh_adr_judge`'s description (whose only
   non-zero exit is a broken invocation) rather than in the server-level sentence, and never produced
   the could-not-run/found-nothing distinction.
3. The tool descriptions demonstrably DID reach the model — it summarised all five accurately,
   including `qh_adr_debt` exiting 1 on a dangling pointer. So the transport delivered `tools/list`
   and did not deliver `instructions`. That separates "client dropped it" from "nothing arrived at
   all", which a bare null could not.

**The confound named before the run does not apply to this half — with one residue.** Tool-choice
crowding from MCP_DOCKER's ~180 tools could explain a missing CALL; it cannot explain a missing
instructions block, which the model never chooses. What it could still explain is a client that
budgets context and drops a server-level block when the tool surface is large. Nothing here
distinguishes "Desktop never renders instructions" from "Desktop did not render them in THIS
session", and the control that would — the same probe with the other two servers disabled — was not
run.

**Recorded as a first-class variable rather than a caveat, on the agentsmemory session's argument
(2026-08-29), which corrects the framing above.** A null with 180 competing tools and a null without
them are different measurements with different remedies: only the second is something a server
author can act on. Their ordering rule is worth keeping — run the DISABLED case first, because a
positive there establishes the mechanism exists and makes the crowded run a degradation measurement
against a known-good, whereas a null in the crowded case alone establishes very little.

Applied to what was actually taken: step 4's result is a POSITIVE obtained under crowding, which is
the strong direction — the tools were chosen despite 180 competitors. Step 5's result is a NULL
obtained under crowding, which is the weak one. So step 4 needs no re-run and step 5 has an open
control. It is recorded as an unrun control, not as a doubt about the answer: the model's report is
about its own context and is evidence, and the descriptions arriving in the same session rules out
the transport.

**Consequence for this record.** ADR-012's Out of Scope already refuses to rely on
`server.WithInstructions` for anything load-bearing, listing it as populated-but-unproven and naming
this task as the measurement. It is now measured, and the refusal was right: everything a Desktop
user must know has to live in a TOOL DESCRIPTION, which is what the model actually reads. Nothing in
this repository depends on the instructions string, so nothing changes — but a future author adding
a server-level policy there would be writing into a channel this client discards.

**Scope of the claim.** One client, one version, one machine, one date, with the other registered
servers named above. It says nothing about other MCP hosts, and a later Desktop version may render
it. Re-measure with the same probe rather than assuming this holds.

**Reported to agentsmemory ADR-021 T3** — filed to `wing_agentmemories`, room `inbox`, and sent to
the live `agentsmemory-main-5b` session. Not edited into that tree from here: another project's
record is context, never a work order.

### Step 4, taken 2026-08-29 — Desktop called the gates, and the gates answered

Same session, same client, same three registered servers as step 5 above.

**Prompt, as given:** *"use the quality-harness tools to lint the ADRs in `<absolute path to this
checkout>/docs/adr` and tell me what they say."* The prompt named this machine's absolute checkout
path, which is not reproduced here: `tests/package.test.mjs::nothing tracked in this repository
names a personal filesystem path` caught the verbatim transcription of it, which is the check doing
its job on the same commit that records the measurement. The absolute path matters to the result
only in that Desktop spawns the server with the application's working directory, so a relative
corpus path would not have resolved.

**Tools called:** `qh_adr_lint` across all twelve records, and `qh_adr_debt` over the corpus.

**What it reported back.** Lint 12/12 exit 0 with one advisory, on ADR-006's
`T2-amend-and-bind-the-spec.md`. Debt exit 0: 42 deferrals, 2 open follow-ups, 0 broken pointers,
0 unreceipted, 0 pointing into an archive. Both figures match what the gates print in a shell here,
so the transport did not garble the result and the server did not summarise it.

**Rung 4 is met.** The client with no shell called a gate over MCP and reported the gate's finding —
which is what this record's Decision claims and what its Stop Condition was written to distinguish
from a spawn that produces no call. Tool-choice crowding from `MCP_DOCKER`'s ~180 tools did not
materialise; the disable-and-retry contingency was not needed.

**The session was not just a transport.** It read the corpus and produced two findings a
pass/fail transport could not, and both are real:

1. **The ADR-006 advisory is a true positive about the CHECK, not about the record.** The step it
  flags is *"Confirm the gate is red first: `spec-verify --spec …`"*, which does establish red. The
  matcher is `"test" not in steps[0].lower()` (`plugin/bin/adr-lint`) — a keyword shape test on a
  step whose behaviour is correct. That is ADR-003's rule (a gate asserts behaviour, not shape)
  broken inside a gate. Filed as docs/BACKLOG.md §52 and fixed there.
2. **A dangling cross-corpus reference the pointer resolver structurally cannot see.** This record's
  Follow-ups name "ADR-021 T3", and there is no ADR-021 in this corpus — it is agentsmemory's, in
  another repository. `qh_adr_debt` did not flag it because it lives in a follow-up line rather than
  in a `(deferred: <pointer>)`, so it falls outside what ADR-011's resolver checks. The reference is
  qualified now; the gap in coverage is filed as docs/BACKLOG.md §52.

Finding (2) is the more interesting result of this task. It is exactly the class ADR-011 exists to
catch, entering through a channel that record's check does not cover — and it was found by pointing
the gates at their own corpus from a client that had never seen it.

**The row stays `pending` and that is not a hedge.** This task's Acceptance is human-observed prose
with no executable fence, so `adr-verify` has nothing to run and can write no entry; `adr-lint`
refuses a `done` row without matching exit-0 evidence, correctly. The sign-off above IS the record —
prompt, tools called, corpus path, answer, client version, date, and the other servers live at the
time — and it is falsifiable by re-running the same prompt.

## Mutation Log

## Invariants

- The shipped tree gains exactly two files under `plugin/`.
- `docs/mcp.md` states which gates are absent and why, not only which are present.

## Risks

- Desktop cannot spawn a Python stdio server from its config. This is the risk the task exists to
  measure; if it materialises the record is WITHDRAWN, not softened.
- The measurement is taken on one machine and one Desktop version. Say so in the sign-off — an
  undated measurement naming no version is unfalsifiable the moment either changes.

## Stop Condition

Stop if Desktop spawns the server but never calls a tool. That is a different finding from "cannot
spawn" — it means the tools are reaching the model and not being chosen — and it needs the prompt and
the tool descriptions examined before anyone concludes the transport is at fault.

## Out of Scope

- Any client other than Claude Desktop. (permanent: §33 is about the client with no shell; every
  other client this project cares about runs Claude Code, which already has the gates.)
- Making the measurement pass. (permanent: the criterion is falsifiable or it is a formality — if
  Desktop cannot use this, that is the answer, and this record says so in its Decision.)

## Verification Log
