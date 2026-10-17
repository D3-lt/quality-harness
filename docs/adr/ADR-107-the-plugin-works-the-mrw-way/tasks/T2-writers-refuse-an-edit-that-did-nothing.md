# Task ADR-107-T2: The plugin's own writers refuse an edit that did nothing

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (a classified audit, then one red test and fix per writer found writing silently)
**Owner:** unassigned
**Produces:** the audit of plugin writers of tracked files, in this task's sign-off
**Consumes:** none
**Proof map:** v1

## Goal

Every plugin code path that edits a file a repository tracks applies all of its edits or none, says what each did, and
refuses an edit that matched nothing or matched more than once (ADR-107, Decision 2).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-verify` | read | its Verification Log and Mutation Log appends and `--mutant` apply and restore, classified first |
| `plugin/scripts/replace-file.mjs` | read | the shared replace helper, classified |
| `plugin/scripts/standalone-link.mjs` | read | links it writes, classified |
| `tests/mrw-way.test.mjs` | edit | one test per writer fixed |

## Ordered Steps

1. [S1] Enumerate the writers with the command in ADR-107's Context and, for each, record whether it edits a tracked file
   and how it reports an edit that changed nothing. [proof: human: the classified list, with the command and its count]
2. [S2] For each writer that can report success for an edit that changed nothing, add a red test through its CLI, then fix
   it. [proof: human: each fix's test name and its red run]
3. [S3] Record each fix's catalogue mutant and a killed mutant. [proof: mutation]

## Acceptance

Acceptance is human-observed: the owner signs off with `adr-verify <this file> --human "..."`, naming the audit's command,
its count, each writer's classification, and each fix's test.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| — | — | one test per writer found writing silently, named in the sign-off; none if the audit finds none | — | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | each fixed writer's refusal |
| 2 — something selects it | the writer's own CLI |
| 3 — the caller can discover it | the refusal names the edit |
| 4 — it is used | each test drives the CLI |

## Mutation Log

## Invariants

- A writer that already refuses a non-unique edit (`adr-verify --mutant`) keeps its wording.
- The plugin's own state and ledgers under `.git/` are not in the class.

## Risks

- A fix changes what a gate writes; the 106-record lint comparison runs before and after.

## Stop Condition

Stop and ask if a writer's all-or-nothing behaviour needs a format change to a ledger or a record.

## Out of Scope

- The repository's own tools under `scripts/` (permanent: boundary: they do not ship; CLAUDE.md §1)

## Verification Log
