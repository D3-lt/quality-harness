# Task ADR-027-T3: Ship the door a reader opens before loading anything

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (single file plus its check)
**Owner:** unassigned
**Produces:** `plugin/README.md` (T3)
**Consumes:** `node "$QH/scripts/qh-doctor.mjs"` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the README names the command T1 produces`, `the README enumerates no inventory a command can count`, `the shipped-set test still passes with a README present`

## Goal

Someone who opens `plugin/` — in the marketplace, in the plugin cache, or in a checkout — learns
what the harness is, which command answers which stage, and where to go next, from a file that
ships and versions with the plugin it describes.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/README.md` | create | the door |
| `tests/qh-doctor.test.mjs` | edit | the check that it points rather than enumerates |
| `tests/mutations.json` | edit | one catalogue entry for that check |

## Ordered Steps

1. [S1] Write the failing check first: `plugin/README.md` must name the `qh-doctor` invocation and must NOT contain a hardcoded count of skills, gates, templates or workflows, nor a list of their names. Confirm red before the file exists. (TDD red.) [proof: acceptance]
2. [S2] Write `plugin/README.md`: what the harness is in a paragraph, the stage-to-command map, the one-line install, and three pointers — `qh-doctor` for what is installed, `quality-harness:operating` for the judgment, `plugin/templates/adr-template.md` for the vocabulary. [proof: acceptance]
3. [S3] Confirm `tests/package.test.mjs::what ships is the plugin and nothing else` still passes with a new tracked file under `plugin/`, since that test asserts the manifest and the tree agree. [proof: acceptance]
4. [S4] Add the catalogue mutation and confirm it comes back RED. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test tests/qh-doctor.test.mjs tests/package.test.mjs 2>&1 | tee /tmp/adr027-t3.out \
  && ! grep -qE "no tests to run|^not ok|^# fail [1-9]" /tmp/adr027-t3.out \
  && grep -q "qh-doctor" plugin/README.md
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the plugin README points at the command and enumerates nothing` | `tests/qh-doctor.test.mjs` | the door cannot become the enumeration that rotted in issue #9 | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `plugin/README.md` is tracked and the fence greps it |
| 2 — something selects it | it is the conventional entry file of a plugin directory — measured 2026-09-03 in `~/.claude/plugins/cache`, `skill-creator`, `figma` and `eidos` each ship one |
| 3 — the caller can discover it | it sits at the root of what the marketplace downloads, so opening the plugin is the discovery |
| 4 — it is used | not observable from here — no telemetry, and a proxy would read like evidence |

## Mutation Log

- 2026-09-03 · ee52ed1 · mutant killed · exit 1 · `plugin/README.md` · the door must not grow an inventory — a count here is wrong by the next release · acceptance-sha256:9e8158f7aba5d890deb9f915ee95dc6bf4b35a74bb15c5cdbad18807bf9c456e · covers:the README enumerates no inventory a command can count

## Verification Log

- 2026-09-03 · ee52ed1 · exit 0 · `set -o pipefail …` · acceptance-sha256:9e8158f7aba5d890deb9f915ee95dc6bf4b35a74bb15c5cdbad18807bf9c456e · ms:12488

## Invariants

- The README names `qh-doctor` and defers every countable question to it.
- The README contains no count or list of skills, gates, templates or workflows.
- The README ships inside `plugin/`, so it is versioned with what it describes.

## Risks

- A README is the artifact most likely to grow an inventory, because enumerating is what READMEs
  usually do. S1's check is the guard, and it is the same guard T2 puts on the skill.

## Stop Condition

Stop if the README cannot be written without restating the stage-to-command map that
`plugin/skills/` and `plugin/bin/` already define — that would mean the door has become a second
index, which is the defect this record is about.

## Out of Scope

- `plugin/docs/` as a directory of further prose (permanent: boundary: the README is the door and the skill is the depth; a third prose tier would be the enumeration this record exists to prevent)
- Translating the README (deferred: docs/BACKLOG.md §112)
