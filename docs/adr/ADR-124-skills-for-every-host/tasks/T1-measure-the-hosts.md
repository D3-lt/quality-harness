# Task ADR-124-T1: Measure which hosts load a linked skill, and that Claude Code does not read the shared directory

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** the measured host list and the Claude Code verdict
**Consumes:** none
**Data dependency:** needs the hosts installed on this machine and fresh sessions of each; the Acceptance is a person's reading
**Proof map:** v1

## Goal

On this machine, observe for each installed host whether a skill linked under `~/.agents/skills` is listed and its body is
followed, and whether Claude Code lists anything from that directory when the link resolves to the exact directory Claude Code
already serves as `quality-harness:<name>`.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/adr/ADR-124-skills-for-every-host.md` | edit | the measured list (Decision 4), with each host's version and the date |

## Ordered Steps

1. [S1] Before any link exists, record the failing observation: a probe skill whose description carries one nonce and whose body
   instructs the agent to print a second, different nonce; in a fresh session of each host, ask for the probe and record that
   neither nonce appears. As a positive control, place the same probe as a plain directory under each host's documented skills
   path and record that both nonces appear. [proof: human: the person reads each host's transcript, before and after]
2. [S2] Link the probe under `~/.agents/skills` from a directory outside every host's own path; in a fresh session of each host,
   record whether the description nonce is listed and whether the body nonce is printed when the skill is invoked.
   [proof: human: the person reads each host's transcript and records host, version, listed, body followed]
3. [S3] Link `~/.agents/skills/spec-write` to the real directory Claude Code currently serves as `quality-harness:spec-write`
   (resolved from the installed plugin root, not a copy); in a fresh Claude Code session, record the skill listing before and
   after, and invoke `quality-harness:spec-write`. [proof: human: the person reads both listings and confirms the namespaced skill is still listed and invocable, and no bare `spec-write` appeared]
4. [S4] Remove every link and probe this task made, and write the measured list into the record. [proof: acceptance]

## Acceptance

Acceptance is human-observed: a person reads each host's before and after transcripts and the two Claude Code listings, and
signs off naming each host, its version, whether the description nonce was listed and whether the body nonce was printed, and
whether Claude Code's listing changed.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| — | — | — | — | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the sign-off |
| 2 — something selects it | T3 reads the verdict before it writes a link |
| 3 — the caller can discover it | the record's Decision 4 |
| 4 — it is used | T3 and T4 |

## Mutation Log

## Invariants

- Nothing is left linked after the task.
- A host counts as supported only when its body nonce was printed, not when its description was listed.

## Risks

- A host caches its skill list across sessions; every observation is in a fresh session, started after the link changed.

## Stop Condition

Stop the record if Claude Code's listing changes in S3: Decision 5 applies and the owner decides again.

## Out of Scope

- Hosts not installed on this machine (deferred: T4 asks peers that have them)

## Verification Log
