# ADR-051: Unproven Advise does not invent writes

**Status:** Accepted
**Date:** 2026-09-12
**Owner:** zy
**Spec:** `docs/specs/2026-09-12-unproven-advise-does-not-invent-writes.md`
**Cross-references:** ADR-005, ADR-041, ADR-042, ADR-047, ADR-048, ADR-049, `CLAUDE.md`, `plugin/scripts/lifecycle.mjs` (`provenMutationPaths`, `missingEvidenceReason`, `docsOnly`, `sessionStateNote`, `record`), `plugin/scripts/statusline.mjs` (`reading`)
**Governs:** `plugin/scripts/lifecycle.mjs`, `plugin/scripts/statusline.mjs`, `tests/lifecycle.test.mjs`, `tests/statusline.test.mjs`, `tests/mutations.json`

Class: every surface that presents `mutationPaths` as a path list, a count, or a file predicate — not "Stop only", not "`node --version`". Enumerated 2026-09-12 with `rg -n "mutationPaths|docsOnly\\(|provenMutationPaths|missingEvidenceReason" plugin/scripts/lifecycle.mjs plugin/scripts/statusline.mjs` and `git ls-files -- plugin/scripts/lifecycle.mjs plugin/scripts/statusline.mjs tests/lifecycle.test.mjs tests/statusline.test.mjs tests/mutations.json`. Named members (working tree after `3ebc868`):

```
plugin/scripts/lifecycle.mjs:2135 provenMutationPaths
plugin/scripts/lifecycle.mjs:2158 docsOnly
plugin/scripts/lifecycle.mjs:2479 missingEvidenceReason
plugin/scripts/lifecycle.mjs:3471 sessionStateNote
plugin/scripts/lifecycle.mjs:4269 docsOnly(provenMutationPaths(...))
plugin/scripts/statusline.mjs:67-75 reading() count / kind
```

Members left out: `record` (`<Bash mutation:` / `<Unresolved Bash deletion>` stay the unresolved stand-in); `classifyCommand` / `hasInterpreterCommand` (Cost 1 leftover: interpreter `--version`/`--help` as `neither`); `runArtifactGates` (F-4: own deletion handling, not Advise wording); `evidenceNudge` (already requires `path.isAbsolute`); `runTheCheckSentence` inferred-check copy (not this spec's facts).

**Enforced-by:** `tests/lifecycle.test.mjs::Stop does not invent writes from probes, markers, or paths outside the repo`, `tests/statusline.test.mjs::a marker-only transcript is unverified, not a numbered write`
**Invalidates:** none — checked (does not reverse ADR-041's remainder-is-the-mutation, ADR-042's Advise, ADR-047's UNPROVEN, ADR-048's validation term, or ADR-005). Complements them. ADR-048 already named this wording as a sibling Non-Goal; this record is that sibling. Does not pull ADR-046's deferred dispatcher row for adr-judge.
**Served-path change:** Stop / PreToolUse Advise lists only proven repository paths under `Changed paths include:`; empty or marker-only admits could-not-look and still Advises. Statusline marker-only is `QH ✗ unverified`, not a numbered write and not nothing-edited.

## Context

Inherited from `docs/specs/2026-09-12-unproven-advise-does-not-invent-writes.md` §Problem / §Goal. Measured 2026-09-12 on HEAD `239980b` (ADR-047 retest): `node --version` is `mutation` (`hasInterpreterCommand`); `record` stores `<Bash mutation: node --version>`; PreToolUse said `Changed paths include: <Bash mutation: node --version>`. `ps aux` / `curl -s` are `unrecognised`; `mutationPaths` empty; `missingEvidenceReason` said `The transcript contains file mutations.` Control: `sed -i` on a real file still names that file. Implementation landed in `3ebc868`; this record's tasks confirm the tests and bind mutants. They do not reimplement.

Debt at authoring (`python3 plugin/bin/adr-debt docs/adr`): none of the deferred rows or open follow-ups is this invent-writes fact. Not pulled in. Interpreter `--version`/`--help` as `neither` stays the spec Non-Goal. ADR-046's adr-judge dispatcher follow-up stays. ADR-050's test-lock cutover (`TEST_HASH_REQUIRED_FROM = "2026-09-13"`) is a different class.

## Existing Primitives Audit

- `sessionStateNote` already dropped `entry.startsWith('<')` and said `N shell mutation(s)` — **reshape.** Same filter, now `provenMutationPaths` (stand-in *and* outside-cwd).
- ADR-005 could-not-look vocabulary — **reuse.** Empty / marker-only is that sentence, never a invented path list.
- ADR-041 `describeCommand` remainder / probe prefix — **leave.** Remainder is still the mutation when it is a proven path. This record is the consumer that must not call the unresolved marker a path.
- ADR-042 UNPROVEN is Advise — **leave.** F-1c: do not silence Advise because the sentence is hard.
- `record` `<Bash mutation:` / `UNRESOLVED_DELETION_MUTATION` — **leave.** Consumers must not treat the stand-in as a path.
- `docsOnly` over raw `mutationPaths` — **reshape.** Over proven paths only.

## Decision

**Advise names only proven repository paths.** A proven path is a `mutationPaths` entry under cwd that is not empty and not a `<…>` stand-in. `missingEvidenceReason` lists those under `Changed paths include:`. Empty or marker-only is could-not-look (`I could not prove a repository path for those edits (could not classify the command, or could not resolve a path).`), still Advise. `docsOnly`, `sessionStateNote`, and statusline `count` use the same filter. Marker-only statusline stays `kind: unverified` (not `nothing`). `record` still writes the marker. Making `node --version` `neither` is a different fact.

It fails if: the marker is listed as a path; the empty-list fallback claims file mutations; a `<Unresolved Bash deletion>` is listed; `docsOnly` treats a stand-in as a non-document file; statusline counts the marker as a file or renders marker-only as nothing-edited; Advise is dropped to avoid the lie.

## Alternatives Considered

- **Make `node --version` / `python --version` `neither`.** Rejected: Cost 1 leftover; interpreter family stays mutation until a measured `--version`/`--help` fact. This record is wording and count, not classification.
- **Silence Advise when the sentence is hard.** Rejected: ADR-047 F-2 / validation-term F-1 still require Advise until a check or publish.
- **Filter only `<Bash mutation:`.** Rejected: F-4; `<Unresolved Bash deletion>` would still print as a path.
- **Rename the marker to a fake repo-relative path.** Rejected: still invents a write.

## Component / Boundary Impact

| Component | Ownership after change | Why it changes |
|-----------|------------------------|----------------|
| `missingEvidenceReason` / `docsOnly` / `sessionStateNote` | plugin/scripts/lifecycle.mjs | proven paths only |
| `statusline.mjs` `reading()` | plugin/scripts/statusline.mjs | count proven; marker-only unverified |
| `record` / classify | unchanged | marker stays; Cost 1 leftover |

None — no Module Map file in this repository; no architecture doc to update.

## Wiring & Contract Changes

Inherited from the spec §Contracts Touched; delta: none.

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `provenMutationPaths` | T1 | T2 | No — T2 keys the same filter T1 produces |

## Implementation

See `docs/adr/ADR-051-unproven-advise-does-not-invent-writes/tasks/README.md`.

## Consequences

- **Positive:** a listed path is a path that changed. Marker-only and unrecognised commands admit could-not-look instead of inventing a write.
- **Negative:** Bash still only extracts markdown paths; a `.py` token in `sed` is not a proven path (docs-only control is native Write of a non-doc file).
- **Neutral:** `record` still stores the stand-in. Statusline marker-only is unverified with no invented `0`.

## Out of Scope

Inherited from the spec §Non-Goals; delta: none.

- Validation term for UNPROVEN writes (permanent: boundary: ADR-048)
- Making `node --version` / `python --version` `neither` or `validation` (permanent: boundary: Cost 1 leftover; interpreter family stays mutation)
- Writing subcommands of a measured family (`ruff format`, `eslint --fix`) (permanent: boundary: Cost 1 leftover)
- chmod-000 could-not-run (permanent: boundary: ADR-049)
- Silencing UNPROVEN / mutation Advise (permanent: boundary: ADR-047 / ADR-048 F-1)
- Inferred-check lead copy / `.quality-harness.json` / unchanged brief suppress / CLAUDE.md §17 (permanent: boundary: not this spec's facts; landed beside them in `3ebc868`)

## Risks

Inherited from the spec §Risks; delta: none.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Drop Advise because the sentence is hard | High | High | UC1-S2: still Advises. Wording only |
| Marker treated as a path | High | High | `provenMutationPaths` drops `startsWith('<')` |
| Empty list claims "file mutations" | High | High | empty → could-not-look |
| Filter only `<Bash mutation:` | High | High | F-4: any `<…>` stand-in |
| `docsOnly` sees a stand-in as a non-doc file | High | High | F-5: `docsOnly` over proven paths |
| Statusline counts the marker | High | Med | F-3: count proven; marker-only unverified |

## Rollback

Restore `missingEvidenceReason` joining unfiltered `mutationPaths` / the `The transcript contains file mutations.` fallback, and statusline `count: edited.length`. No persistent state.

## Follow-ups

- [ ]
