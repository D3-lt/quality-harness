# Task ADR-124-T4: Peers on other platforms load a linked skill

**Depends-on:** T3
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** the outside evidence for the release
**Consumes:** `--link --agents` (T3); the measured host list and the Claude Code verdict (T1)
**Data dependency:** needs eligible peers, one on Windows, with hosts installed; the Acceptance is a person's reading
**Proof map:** v1

## Goal

A Windows peer and a second macOS or Linux peer install the plugin at one version, run `--link --agents --apply`, start a fresh
session of each host they have and invoke a linked skill; then update the plugin to a second version, start a Claude Code session
so `current` is replaced, remove the old version's directory, and invoke the skill again; each reports everything printed and
its corpus-probe attestation is imported.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `docs/corpus-reports/` | create | the imported attestation, counts only |
| `docs/adr/ADR-124-skills-for-every-host.md` | edit | the host list gains what the peers observed |

## Ordered Steps

1. [S1] Before the peers link anything, ask each to record that a fresh session of each of its hosts does not list
   `spec-write` from `~/.agents/skills`, and that `CLAUDE_PLUGIN_DATA` is set in its Claude Code session; then to run
   `--link --agents --apply`, start a Claude Code session (which creates `current`), start fresh sessions of each host, invoke
   the skill, and paste everything printed, including any link-creation failure. [proof: human: the person reads each peer's verbatim output and records platform, host, version, listed, body followed]
2. [S2] Ask each peer to update to the second version, start a Claude Code session, confirm `current` names the new root, remove
   the old root, invoke the linked skill in a fresh host session again, and paste everything printed. [proof: human: the person confirms on each platform, Windows included, that the pointer was replaced and the body was followed after the old root was gone]
3. [S3] Ask each peer to run `corpus-probe.mjs --json` at the implementation commit, after its mutation jobs are green, and import
   each peer's attestation separately with `node scripts/attest-import.mjs`. [proof: acceptance]

## Acceptance

Acceptance is human-observed: a person reads each peer's output and signs off naming platform, host, version, whether the
linked skill's body was followed before and after the update, and that `current` was replaced; each attestation is filed under
`docs/corpus-reports/`.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| — | — | — | — | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the sign-off and the attestation |
| 2 — something selects it | the release (CLAUDE.md §18) |
| 3 — the caller can discover it | the record |
| 4 — it is used | release-evidence reads the attestation |

## Mutation Log

## Invariants

- Nothing from a peer's machine is committed but counts and versions (CLAUDE.md §6).

## Risks

- A peer's permission check blocks the link: its user approves there, never worked around.

## Stop Condition

Stop the release if any peer's Claude Code lists a bare `spec-write` or loses `quality-harness:spec-write` after linking.

## Out of Scope

- Hosts no peer has (permanent: boundary: the list names only what was observed).

## Verification Log
