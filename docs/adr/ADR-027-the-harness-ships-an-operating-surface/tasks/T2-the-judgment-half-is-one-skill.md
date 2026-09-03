# Task ADR-027-T2: Ship the judgment half as one skill that enumerates nothing

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (single file plus its check)
**Owner:** unassigned
**Produces:** `quality-harness:operating` (T2)
**Consumes:** `node "$QH/scripts/qh-doctor.mjs"` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the skill names the command T1 produces`, `the skill enumerates no inventory a command can count`, `a fourteenth skill still satisfies the existing skill contract and metadata suites`

## Goal

The operating knowledge that no command can output ships with the plugin and is versioned with it,
and the half a command *can* output is not duplicated beside it.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/skills/operating/SKILL.md` | create | the judgment half |
| `tests/qh-doctor.test.mjs` | edit | the check that it points rather than enumerates |
| `tests/mutations.json` | edit | one catalogue entry for that check |

## Ordered Steps

1. [S1] Write the failing check first: the skill must name the `qh-doctor` invocation, and must NOT contain a list of skill names, gate names or template names. Confirm red before the skill exists. (TDD red.) [proof: acceptance]
2. [S2] Write `plugin/skills/operating/SKILL.md` carrying only what a command cannot print: why a standalone copy is dangerous rather than merely stale, why the template is authoritative over any enumeration of it, the forwarder-versus-copy distinction with the correction history the reporter had to add, and the habit for verifying an upgrade. [proof: acceptance]
3. [S3] Point every countable question at `qh-doctor` and every vocabulary question at `plugin/templates/adr-template.md`, by path. [proof: acceptance]
4. [S4] Confirm the existing skill suites still pass with a fourteenth skill present, and add the catalogue mutation. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test tests/qh-doctor.test.mjs tests/skill-contract.test.mjs tests/skill-metadata.test.mjs 2>&1 | tee /tmp/adr027-t2.out \
  && ! grep -qE "no tests to run|^not ok|^# fail [1-9]" /tmp/adr027-t2.out \
  && grep -q "qh-doctor" plugin/skills/operating/SKILL.md
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the operating skill points at the command and enumerates nothing` | `tests/qh-doctor.test.mjs` | the pre-registered failure in ADR-027's Decision has a check, not just a promise | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `plugin/skills/operating/SKILL.md` is tracked and the fence greps it |
| 2 — something selects it | the plugin serves it by name as `quality-harness:operating`; `tests/skill-metadata.test.mjs` reads every shipped skill's frontmatter |
| 3 — the caller can discover it | its `description` frontmatter is what an agent matches against, and it names operating the harness |
| 4 — it is used | not observable from here — no telemetry, and a proxy would read like evidence |

## Mutation Log

- 2026-09-03 · 3feae18 · mutant killed · exit 1 · `plugin/skills/operating/SKILL.md` · the skill must give a runnable invocation; a skill that names no command is prose · acceptance-sha256:daca98f18773398b76c60da0c93c0d3c930ef5ffd0b638f261fcf0feb8223ac7 · covers:the skill names the command T1 produces
- 2026-09-03 · 3feae18* · mutant killed · exit 1 · `plugin/skills/operating/SKILL.md` · a count in the skill is the pre-registered failure; it must be caught · acceptance-sha256:daca98f18773398b76c60da0c93c0d3c930ef5ffd0b638f261fcf0feb8223ac7 · covers:the skill enumerates no inventory a command can count

## Verification Log

- 2026-09-03 · 3feae18 · exit 0 · `set -o pipefail …` · acceptance-sha256:daca98f18773398b76c60da0c93c0d3c930ef5ffd0b638f261fcf0feb8223ac7 · ms:1792
- 2026-09-03 · 3feae18* · exit 0 · `set -o pipefail …` · acceptance-sha256:daca98f18773398b76c60da0c93c0d3c930ef5ffd0b638f261fcf0feb8223ac7 · ms:727

## Invariants

- The skill names `qh-doctor` and defers every countable question to it.
- The skill contains no list of skills, gates, templates or workflows.
- The skill states no lint severity, count or threshold as a literal.

## Risks

- A future edit adds "just one" inventory line and the skill starts rotting exactly as the reported CLAUDE.md did. That is the pre-registered failure in ADR-027, and S1's check is what makes it visible rather than a promise.

## Stop Condition

Stop if the judgment half turns out to be empty once the countable half is a command — that would
mean the skill is not needed, and shipping an empty one to satisfy this record would be the
formality this corpus refuses.

## Out of Scope

- A `plugin/README.md` (permanent: boundary: ADR-027's Alternatives rejects it — agents load skills, and a README has no version coupling to what it describes)
- The half of the reporter's CLAUDE.md that is genuinely theirs (external: the adopter's machine: GitHub issue #9 category B)
