# Spec: Unproven Advise does not invent a write

> **Date:** 2026-09-12 · **Status:** Ready-for-ADR
> **Owner:** zy · **Becomes:** standalone until an ADR
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** plugin/scripts/lifecycle.mjs (`missingEvidenceReason` :2445, `record` `<Bash mutation:` :1935, `hasInterpreterCommand` :929, INTERPRETER_WORD :920), plugin/scripts/classify-command.mjs (`MEASURED_FAMILIES` includes `node`), docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-047-an-unrecognised-command-is-unproven.md, docs/specs/2026-09-12-unproven-write-has-a-validation-term.md (Non-Goal: Cost 2), CLAUDE.md §3 §16, tests/lifecycle.test.mjs

## Problem

Advise names a write it did not prove. Live on HEAD `239980b` (ADR-047 retest): `node --version` is `mutation` because `hasInterpreterCommand` (`lifecycle.mjs:941`) is true for any `node` executable, so `analyzeTranscript` records `<Bash mutation: node --version>` (`:1935`) and PreToolUse says `Changed paths include: <Bash mutation: node --version>`. A version probe is named as a changed path. `ps aux` and `curl -s <url>` are `unrecognised` (`MEASURED_FAMILIES` does not contain them); `mutationPaths` stays empty; `missingEvidenceReason` (`:2451–2452`) then says `The transcript contains file mutations.` Safe direction (they flag). The text claims a fact where it should admit it could not classify the command or could not resolve a path. Control: `sed -i` on a real file still names that file.

## Goal

Advise names only paths it proved. When it could not classify the command, or could classify a mutation but could not resolve a path, it says that — never "Changed paths include" a command, never "the transcript contains file mutations."

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| adopting engineer | human role | trust the Advise sentence: a path listed is a path that changed |
| `missingEvidenceReason` | system | pick the sentence from what `mutationPaths` actually holds |
| `analyzeTranscript` | system | keep recording unresolved Bash mutations as a marker; the consumer must not call the marker a path |
| Stop / PreToolUse | system | emit the honest sentence |

## Use Cases

### UC-1: Advise admits could-not-look when it has no proven path

- **Trigger:** Stop or PreToolUse Advise after an executed command that left no proven path in `mutationPaths` · **Preconditions:** the surface is already going to Advise (UNPROVEN write, or mutation with only the unresolved marker)
- **Main flow:**
  1. `ps aux` or `curl -s https://example.com` is `unrecognised`. `lastUnprovenWrite` advances. `mutationPaths` is empty.
  2. `node --version` is `mutation` (`hasInterpreterCommand`). The only recorded entry is `<Bash mutation: node --version>`.
  3. `missingEvidenceReason` does not print `Changed paths include: …` for a `<Bash mutation: …>` marker and does not print `The transcript contains file mutations.`
  4. It admits could-not-look: could not classify the command, or could not resolve a path. ADR-005 vocabulary.
- **Failure paths:**
  - a. at step 3, empty `mutationPaths` → `The transcript contains file mutations.` (the live `ps`/`curl` defect).
  - b. at step 3, the unresolved marker is treated as a path → `Changed paths include: <Bash mutation: node --version>` (the live interpreter-probe defect).
  - c. at step 4, silence the Advise entirely because the message is hard — fail-open; ADR-047 F-2 / validation-term F-1 still require Advise until a check or publish.
  - d. `sed -i file.md` or native Write still must name the real path.
- **Postconditions:** no proven path → could-not-look sentence. A proven path → `Changed paths include:` those paths only. Marker-only is not a path.

## Scenarios

### UC1-S1 [happy] sed -i still names the file it wrote [@implemented] → `tests/lifecycle.test.mjs::Stop does not invent writes from probes, markers, or paths outside the repo` cmd:`node --test --test-name-pattern 'Stop does not invent writes from probes, markers, or paths outside the repo' tests/lifecycle.test.mjs`

```gherkin
Given an executed Bash sed -i on a repository file
When missingEvidenceReason runs on that transcript
Then the sentence names that file under Changed paths include
And it does not say the transcript contains file mutations
```

### UC1-S2 [failure] node --version, ps, and curl do not invent writes [@implemented] → `tests/lifecycle.test.mjs::Stop does not invent writes from probes, markers, or paths outside the repo` cmd:`node --test --test-name-pattern 'Stop does not invent writes from probes, markers, or paths outside the repo' tests/lifecycle.test.mjs`

```gherkin
Given executed Bash node --version
Then mutationPaths may hold the unresolved marker
And missingEvidenceReason does not say Changed paths include that marker
Given executed Bash ps aux or curl -s https://example.com
Then mutationPaths is empty
And missingEvidenceReason does not say the transcript contains file mutations
And both sentences admit could-not-classify or could-not-resolve
And Stop still Advises (this fact is the wording, not silence)
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | Accepted. Class: any Advise that has no proven path — not "node --version". Members measured 2026-09-12 on `239980b`: (1) unrecognised Bash with empty `mutationPaths` (`ps aux`, `curl -s`); `missingEvidenceReason` `:2451–2452` fallback `The transcript contains file mutations.` (2) mutation whose only entries are `<Bash mutation: …>` (`node --version` via `hasInterpreterCommand` `:941` + `record` `:1935`). After: `Changed paths include` lists only proven paths. Empty or marker-only → could-not-look (could not classify, or could not resolve a path). Do not silence the Advise (ADR-047 / validation-term). `sed -i` / native Write still name the file. Why it can fail: treating the marker as a path; empty-list fallback claiming mutations; dropping Advise to avoid the lie. Making `node --version` `neither` is a different fact (interpreter `--version` / Cost 1). | `tests/lifecycle.test.mjs::Stop does not invent writes from probes, markers, or paths outside the repo` | @implemented | `node --test --test-name-pattern 'Stop does not invent writes from probes, markers, or paths outside the repo' tests/lifecycle.test.mjs` |
| F-2 | Accepted. Class: a transcript that holds both a proven path and an unresolved marker. Current: `missingEvidenceReason` joins `distinct.slice(-5)` with no filter (`:2449–2451`). `sed -i file.md` then `node --version` → `Changed paths include: file.md, <Bash mutation: node --version>`. After: `Changed paths include` lists only proven paths; the marker is omitted, not renamed as a path. Empty-after-filter uses the F-1 could-not-look sentence. Why it can fail: F-1 tests only empty and only-marker; the mixed list still prints the marker. Dropping the proven path because a marker is present. | `tests/lifecycle.test.mjs::Stop does not invent writes from probes, markers, or paths outside the repo` | @implemented | `node --test --test-name-pattern 'Stop does not invent writes from probes, markers, or paths outside the repo' tests/lifecycle.test.mjs` |
| F-3 | Accepted. Class: every surface that presents `mutationPaths` as a count or a path list, not only `missingEvidenceReason`. Measured 2026-09-12: `sessionStateNote` `:3437` already drops entries that start with `<` and says `N shell mutation(s)`. `statusline.mjs` `reading()` `:70` sets `count: edited.length` (markers included), so `node --version` renders `QH ✗ 1 unverified` (`render` `:113`). After: count / `Changed paths include` use proven paths only. Marker-only still `kind: unverified` (do not render `QH · nothing edited`). Why it can fail: F-1/F-2 bind only Stop / PreToolUse copy; statusline still invents a file count. Silencing the segment because the count would be 0. | `tests/statusline.test.mjs::a marker-only transcript is unverified, not a numbered write` | @implemented | `node --test --test-name-pattern 'a marker-only transcript is unverified, not a numbered write' tests/statusline.test.mjs` |
| F-4 | Accepted. Class: every unresolved stand-in in `mutationPaths`, not only `<Bash mutation:`. Members: `<Bash mutation: …>` (`:1935`) and `<Unresolved Bash deletion>` (`UNRESOLVED_DELETION_MUTATION` `:34`, recorded via `bashDeletionMutationPaths` `:1485–1927`). `sessionStateNote` already drops `entry.startsWith('<')`. `missingEvidenceReason` and statusline `count` do not. After: proven path means a repository path, not any `<…>` stand-in. A filter that matches only `<Bash mutation:` still lists the deletion sentinel as a path. `runArtifactGates` `:2058` keeps its own deletion handling; this fact is Advise wording / count, not the gate. Why it can fail: F-1–F-3 fixtures are `node --version` / `ps` / `curl`; `rm -rf "$UNSET"` still prints `<Unresolved Bash deletion>` under Changed paths include. | `tests/lifecycle.test.mjs::Stop does not invent writes from probes, markers, or paths outside the repo` | @implemented | `node --test --test-name-pattern 'Stop does not invent writes from probes, markers, or paths outside the repo' tests/lifecycle.test.mjs` |
| F-5 | Accepted. Class: predicates that treat `mutationPaths` entries as files, not only the Advise sentence. `docsOnly` `:2128` is `paths.every(ext in DOC_EXTENSIONS)`; a `<…>` stand-in has no doc extension, so `sed -i file.md` then `node --version` is not docs-only and Stop demands the full check (the hole BACKLOG §174 paid for when the marker sat beside resolved markdown). `evidenceNudge` already requires `path.isAbsolute`. After: `docsOnly` is over proven paths only. Marker-only / empty / unrecognised stay not-docs-only, so Stop still Advises. Why it can fail: F-1–F-4 bind copy and count; fourteen `.md` files plus a version probe still lose the evidence-limited skip. Treating that skip as F-1c fail-open (it is the existing docs-only exemption, not silence because the sentence is hard). | `tests/lifecycle.test.mjs::Stop does not invent writes from probes, markers, or paths outside the repo` | @implemented | `node --test --test-name-pattern 'Stop does not invent writes from probes, markers, or paths outside the repo' tests/lifecycle.test.mjs` |

## Domain

**proven path** = a `mutationPaths` entry that is a repository path (native Write `file_path`, Bash-resolved markdown/deletion paths), not any `<…>` stand-in (`<Bash mutation: …>`, `<Unresolved Bash deletion>`). **could-not-look sentence** = ADR-005: the gate did not observe a path, so it does not report one. **Advise** still fires; F-1–F-4 are wording and count; F-5 is `docsOnly` over those same proven paths.

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `missingEvidenceReason` (lifecycle.mjs:2445) | empty / marker-only is could-not-look, not "file mutations" / "Changed paths include" the marker | PreToolUse, Stop |
| `statusline.mjs` `reading()` `:70` | `count` is proven paths only; marker-only stays `kind: unverified` | user-wired statusline |
| `docsOnly` (lifecycle.mjs:2128) | over proven paths only | Stop evidence-limited skip |
| `record` `<Bash mutation:` (lifecycle.mjs:1935) | stay the unresolved stand-in; consumers must not call it a path | `missingEvidenceReason` |
| `classifyCommand` / `hasInterpreterCommand` | none this fact | Cost 1 leftover |

## Non-Goals

- Validation term for UNPROVEN writes (docs/specs/2026-09-12-unproven-write-has-a-validation-term.md).
- Making `node --version` / `python --version` `neither` or `validation`. Interpreter family stays mutation until a measured `--version`/`--help` fact.
- Writing subcommands of a measured family (`ruff format`, `eslint --fix`).
- chmod-000 could-not-run.
- Silencing UNPROVEN / mutation Advise.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Drop Advise because the sentence is hard | High | High | UC1-S2: still Advises. Wording only |
| Marker treated as a path | High | High | `Changed paths include` filters `<Bash mutation:` |
| Empty list claims "file mutations" | High | High | empty → could-not-look |

## Open Questions

<!-- Empty. User said enough 2026-09-12. F-1–F-5 Accepted and bound. Leftovers are Non-Goals: interpreter --version/help; Cost 1 writing subcommands. -->

## Verify

```bash
python3 plugin/bin/spec-verify --spec docs/specs/2026-09-12-unproven-advise-does-not-invent-writes.md
python3 plugin/bin/spec-verify --implemented docs/specs/2026-09-12-unproven-advise-does-not-invent-writes.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | When Advise has no proven path, does it invent "Changed paths include" / "the transcript contains file mutations", or admit could-not-look? | F-1 | Accepted. After: proven paths only. Marker-only and empty are could-not-look. Still Advises. |
| 2 | When a transcript has both a proven path and a `<Bash mutation:>` marker, does Changed paths include list the marker? | F-2 | Accepted. After: proven paths only; marker omitted. |
| 3 | Does the statusline count the unresolved marker as an unverified path (`QH ✗ 1 unverified`)? | F-3 | Accepted. After: count proven paths only; marker-only stays unverified, not nothing-edited. |
| 4 | Is `<Unresolved Bash deletion>` also not a path, or only `<Bash mutation:`? | F-4 | Accepted. After: any `<…>` stand-in is omitted from path lists and counts. |
| 5 | Does `docsOnly` treat a stand-in as a non-document file and revoke the evidence-limited skip? | F-5 | Accepted. After: docsOnly over proven paths; marker-only still Advises. |
| 6 | User said enough? | non-behavioral | Enough 2026-09-12. Grill closed. F-1–F-5 Accepted and bound. Status Ready-for-ADR, no ADR this turn. |
