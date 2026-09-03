# Task ADR-027-T1: Make the countable half a command that measures it

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** `node "$QH/scripts/qh-doctor.mjs"` (T1)
**Consumes:** none
**Data dependency:** hermetic for everything derived from the tree; the home-directory half reads whatever is on the machine and says so
**Proof map:** v1
**Rests-on:** `the severity split is read from plugin/bin/adr-lint at run time`, `a home file the plugin cannot prove it wrote is never called a copy`, `the CLI entry actually runs — the third fence segment executes the script, which is the check the Windows entry-guard defect would have failed`

## Goal

One command answers what an adopter currently reconstructs by reading source and then hand-maintains
as prose: the resolved plugin root and version, whether each `~/.claude/bin` entry is a forwarder or
a copy, what the plugin ships right now, and which `adr-lint` findings fail versus advise.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/qh-doctor.mjs` | create | the report itself |
| `tests/qh-doctor.test.mjs` | create | the checks, driven through the seams below |
| `tests/mutations.json` | edit | two catalogue entries, or the checks are unproven (ADR-003) |

## Ordered Steps

1. [S1] Write `tests/qh-doctor.test.mjs` first, asserting the severity split is READ from a fixture gate rather than restated, and that it is capable of a different answer — a fixture with a different append/advise ratio must produce a different number. Confirm it is red before the script exists. (TDD red.) [proof: acceptance]
2. [S2] Write `severitySplit(source)` taking the gate's TEXT, not a path, so the test drives it on a fixture and the real run drives it on `plugin/bin/adr-lint`. [proof: acceptance]
3. [S3] Write `homeReport({ homeDirectory, shippedNow })` over `classifyHomeFile` and `scanSet` from `plugin/scripts/standalone-link.mjs` — reused, never reimplemented. A file the classifier cannot attribute is reported `unidentifiable`, never `copy` (ADR-019). [proof: acceptance]
4. [S4] Write `inventory(pluginRoot)` counting skills, gates, templates and workflows from the tree, and derive the version from `plugin/.claude-plugin/plugin.json`. Enumerate nothing in prose. [proof: acceptance]
5. [S5] Wire `main()`: print the four blocks, exit `0` clear, `1` when at least one home entry is a `copy`, `2` when a required read could not be made. Guard the CLI entry with `pathToFileURL`, never a `file://` template. [proof: acceptance]
6. [S6] Add two catalogue mutations and confirm both come back RED. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test tests/qh-doctor.test.mjs 2>&1 | tee /tmp/adr027-t1.out \
  && ! grep -qE "no tests to run|^not ok|^# fail [1-9]" /tmp/adr027-t1.out \
  && node plugin/scripts/qh-doctor.mjs >/dev/null
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the severity split is read out of the gate, not restated here` | `tests/qh-doctor.test.mjs` | the figure that went stale in the report is derived, and a different gate yields a different split | — | S1, S2 |
| `a home file the plugin cannot prove it wrote is never called a copy` | `tests/qh-doctor.test.mjs` | ADR-019's refusal survives being reported on | — | S3 |
| `a forwarder and a copy are told apart, and only a copy is a finding` | `tests/qh-doctor.test.mjs` | the distinction the report had to correct itself about | — | S3, S5 |
| `the inventory is counted from the tree` | `tests/qh-doctor.test.mjs` | no enumeration can go stale | — | S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `plugin/scripts/qh-doctor.mjs` is tracked and the fence runs it |
| 2 — something selects it | the Acceptance fence executes it as a CLI, which is how a user reaches it |
| 3 — the caller can discover it | `plugin/skills/operating/SKILL.md` names the exact invocation (T2) |
| 4 — it is used | not observable from here: this repository has no telemetry, and saying so is better than a proxy that would read like evidence |

## Mutation Log

## Verification Log

## Invariants

- The severity split is read from the gate's source at run time and never stored.
- No output enumerates skills, gates, templates or workflows by name from a literal.
- A home file the plugin cannot attribute is `unidentifiable`; only an attributable non-forwarder is a `copy`.
- Exit `2` means "could not look" and never doubles as a finding (ADR-005).

## Risks

- Reusing `standalone-link.mjs` couples this to that module's exports. Accepted deliberately: the alternative is a second classifier, which is the defect this record exists to remove.
- The home-directory half is machine-dependent. Stated in the output rather than hidden.

## Stop Condition

Stop if the severity split cannot be derived without executing the gate. Importing a gate to count
its own findings would make this report depend on the gate running, and a reporter that cannot
answer when the subject is broken is worse than no reporter.

## Out of Scope

- Adding `--version` to the gates (deferred: docs/BACKLOG.md §113)
- Repairing anything it finds — `sync-standalone.mjs --link --apply` already does that (permanent: boundary: a report that also repairs cannot be run safely to ask a question)
