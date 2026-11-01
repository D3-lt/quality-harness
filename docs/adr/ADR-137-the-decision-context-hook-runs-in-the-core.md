# ADR-137: The decision-context hook runs in the core

**Status:** Accepted
**Accepted:** 2026-11-01 by Zy: "Full port, amend ADR-092" (asked against a Go cache of Node's answer, or stopping)
**Date:** 2026-11-01
**Owner:** Zy
**Spec:** None — the owner chose the port in conversation; the Node reader's tests and tests/fixtures/record-recognition.json are the contract
**Cross-references:** docs/adr/ADR-011-a-pointer-resolves-or-it-is-reported.md, docs/adr/ADR-092-one-definition-of-a-record.md, docs/adr/ADR-110-a-static-core-owns-the-hooks.md, docs/adr/ADR-135-branch-state-runs-in-the-core.md, docs/adr/ADR-136-the-edit-gates-run-from-the-core.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — the parity and replay tests are written by T1 and T2; this header names them once they exist
**Invalidates:** none — checked; ADR-092 is amended below and its tasks keep their done state
**Amends:** ADR-092 ("One definition of a record, in Python, with lifecycle as its only mirror", Decision 5) — the Go core becomes a second mirror, for the decision-context hook only, held to the same approved rows; and ADR-110's 2026-10-28 amendment keeping the reader Node (docs/adr/ADR-110-a-static-core-owns-the-hooks.md:200)
**Served-path change:** Before every Edit, Write, MultiEdit, NotebookEdit or mrw write in a repository with a decision corpus, PreToolUse answers which decisions govern the file from the Go core instead of spawning `node plugin/scripts/adr-context.mjs --hook`.

## Context

core/hooks/pending.go spawns `node adr-context.mjs --hook <file>` from PreToolUse whenever the edited file sits in a
repository with a decision corpus. Measured 2026-11-01 on this repository (about 135 records, load 3 to 6 on 10 cores): about
285 ms a call; 3462fc91 made a record's unresolved list lazy and brought it to about 170 ms where no record governs the file
and 220 ms where some do. Node's start is 60 to 70 ms of that and a CPU profile put most of the rest in reading and matching
the corpus. The owner chose on 2026-11-01 to port the hook path to Go rather than cache Node's answer, accepting a second
mirror of the record rules.

## Existing Primitives Audit

Reuse: the git listing, archive and record-shaped name rules and the uninteresting-directory rule in core/hooks/orientation.go;
the JavaScript value model and canonical paths in json.go and eventlog.go; the parity method of ADR-135 and ADR-136 (rows built
from the live Node exports, answered by a Go test, "N rows compared, 0 disagreements"). The approved answers ADR-092 Decision 6
put in tests/fixtures/record-recognition.json pin the new mirror as they pin the existing two.

Class: what decisionContext's output depends on, traced 2026-11-01 from plugin/scripts/decision-corpus.mjs:1879 back through
decisionsGoverning (:1861) and adrCorpus (:1480): record discovery from the listing (:1359-1437, :1232, :1301), reading and
recognition (:1517-1571, :1208), archives and catalogs (:693, :709-767), status (:560-644), declared Governs and task tables
(:831-966, :1014, :1644-1681), Enforced-by (:809-829), unproven records (:1609-1617) and the lazy unresolved list (:1736-1747).
Left Node-only because the hook never reads them: supersededBy, frozen, taskFiles, unreadTasks, declares, notRecognised,
discovery, alias reasons and unmarkedArchives (used by adr-state, the adr-context CLI, work-next and corpus-probe).

## Decision

1. The core answers the hook with the same text decisionContext prints for the same file and corpus: the same records, in
   listing order, cut at five per group, with the same Enforced-by, status, UNPROVEN and unresolved lines. Its gates stay:
   no corpus, or a file outside the root, says nothing.
2. The Go reader is a second mirror of record recognition (ADR-092 amended). It is held to every row of
   tests/fixtures/record-recognition.json and to a replay of decisionContext over every fixture corpus, copied into a scratch
   git repository, and over a clone of this repository, comparing the exact text for every tracked path and every path a
   record declares.
3. plugin/scripts/decision-corpus.mjs stays complete for its other callers and as the oracle the replay runs live.
4. A reader failure is said as today ("could-not-look: the decision reader could not run…"), from a recovered panic or a spent
   budget, never as silence.

## Alternatives Considered

- **Cache Node's answer in Go, no second mirror:** offered on 2026-11-01 and not chosen by the owner.
- **Stop after the lazy-unresolved fix:** offered and not chosen.
- **Port the whole reader:** rejected; the CLI, adr-state, work-next and corpus-probe gain nothing per edit.

## Component / Boundary Impact

The hooks component of docs/architecture.md gains the decision reader in core/hooks; plugin/scripts keeps decision-corpus.mjs.
docs/architecture.md and ADR-092's mirror list are updated by T3.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| PreToolUse decision context | Answered by Go, same text | core/hooks | the agent's context |
| Record recognition | A second mirror, held to record-recognition.json | core/hooks | the hook only |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `decisioncorpus.go` record rules | T1 | T2 | No |
| Go `decisionContext` | T2 | T3 | No |

## Implementation

See ADR-137-the-decision-context-hook-runs-in-the-core/tasks/README.md.

## Consequences

The hook's Node start and its corpus reading in JavaScript leave every edit in a decision corpus. The costs: two readers of the
record rules where ADR-092 wanted one per language, held together only by the parity rows and the replay, so a rule changed in
one and not the other is caught only where a row or a corpus exercises it; and the Go reader must be kept in step with every
future change to decision-corpus.mjs that touches the hook path.

## Out of Scope

- The adr-context CLI, adr-state, work-next and corpus-probe (permanent: boundary: they run by hand or off the edit path).
- unmarkedArchives and the other fields the hook never reads (permanent: boundary: Decision 1 is the hook's text).
- Python's own reader, plugin/lib/record.py (permanent: boundary: ADR-092 keeps it the definition).

## Risks

Drift between the mirrors; Unicode differences between JavaScript and Go (case folding, `\s`, `.`, no lookaround in Go's regexp),
each needing a row; realpath case on macOS and Windows; separators on Windows (listedPath needs a platform parameter). The
release needs an outside run (ADR-131).

## Rollback

Point pending.go back at the Node CLI; decision-corpus.mjs is unchanged.

## Follow-ups

- [ ] T1 to T4, then a release with an outside run.
