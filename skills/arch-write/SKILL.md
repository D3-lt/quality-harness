---
name: arch-write
description: Create or audit a current-state architecture document. Use when the user invokes `/quality-harness:arch-write`, asks for an architecture map/audit, or an accepted structural decision changes module boundaries or ownership. Use grill-only mode for a read-only architecture audit. Do not use for a single decision record, bounded implementation, or speculative future design without code evidence.
---

# Arch Write

Produce or audit a repo's standing architecture doc: the current-state integral that ADRs are
deltas against. Writing the implicit architecture down finds real defects — orphaned artifacts,
contract identity confusion, shared-file collisions, cross-repo re-derivation — that per-ADR
gates structurally cannot see. Template is source of truth: `${CLAUDE_PLUGIN_ROOT}/templates/architecture-template.md`
(re-read it, do not paraphrase). Gate: `arch-lint <architecture.md>` exit 0.

Match the repository's existing documentation convention; use `docs/architecture.md` only when
none exists. One document per repository; a multi-repository system may also keep a system-level
document in its coordinating repository.

## Stage 1 — Scout (no questions)

Derive everything the code already answers. **Nothing discoverable is asked in the grill.**

- Module inventory + observed dependency edges from the real graph: imports (Python/TS), `cargo
  metadata` / `pub(crate)` surface (Rust), composer + namespace use (PHP), roles/playbook includes
  (Ansible).
- Entry points, composition/bootstrap sites, config surfaces.
- Existing gates: test suites, linters, CI checks that already pin structure.
- Candidate concept duplicates: same-named symbols/schemas/constants in >1 place.

Use subagents only for independent, bounded areas whose evidence can be reconciled without shared
edits. Output a draft Module Map, observed edge list, and duplicate-concept candidates labeled
OBSERVED.

## Stage 2 — Grill (intent, through role lenses)

Interrogate only what code cannot answer: intent. **Every question is a proposed fact** —
falsifiable assertion + the check that would bind it + recommended answer first:

> Observed: `resolver/` imports `support_client/`. Proposed rule D3: resolver must not depend on
> transport — recommended: accidental, invert via port. Check: import-boundary test. Accept /
> reject / it's intended?

Run the lenses; each feeds its sections:

| Lens | Interrogates | Sections fed |
|------|--------------|--------------|
| Principal architect | boundaries, dependency direction, one-reason-to-change per module | Module Map, Dependency Contracts |
| Data architect | concept ownership, source of truth per datum, schema authority | Concept Ownership (DRY) |
| Security architect | trust boundaries, secret paths, authn/z chokepoints | Trust & Data Boundaries |
| Ops architect | deploy topology, config injection, construction sites | Composition Root |
| Test architect | double substitutability, where each gate lives | Test Doubles |

Run the lenses inline by default. Use `/quality-harness:consensus` only when the architecture choice is genuinely
open, at least two credible designs remain, and reversal is costly; then grill only disagreements.

Grill rules (inherited from /quality-harness:spec-write):

- Recommended answer first; user overrides.
- Every accepted rule mints a table row **with its Check cell** — a rule that binds to nothing
  will evaporate into prose.
- Check doesn't exist yet → write it now if cheap (grep gate, import test), else tag the cell
  `(deferred: <task/ADR pointer>)` — `adr-debt` sweeps it.
- Rejected proposals are logged in Superseded or dropped explicitly — no silent disappearance.

## Stage 3 — Author + gate

1. Fill the template. Every section present; non-applicable ones get `None — <reason>`.
2. Pick checks from `references/gate-catalog.md` for the repo's ecosystem — the invariant is
   *every rule row binds to an executable check in this repo's toolchain*, the mechanism is
   ecosystem-specific.
3. Set **Gate command:** to the one command that runs every check (usually a test-suite subset).
4. Run `arch-lint <architecture.md>` and paste the run. Its findings are about this document —
   close them, or say which one stands and why.
5. Run the Gate command itself; failing checks are the point — each failure is a found defect:
   fix the code or supersede the rule, never soften the check.
6. **Red proof for every new check:** deliberately violate the rule (or mutate the input),
   observe the check FAIL, revert. A gate never seen red is unverified — the vacuous-pass modes
   in `references/gate-catalog.md` (escaped `\|`, `! grep` on a missing path, zero-match `-k`
   selectors) all read as coverage while checking nothing. `arch-lint` catches the static ones;
   the red proof catches the rest.

## grill-only mode

`/quality-harness:arch-write grill-only`: scout as above, then diff OBSERVED against the existing
architecture.md (or against the implicit architecture when none exists). Emit a divergence
report only — no doc edits: rules violated in code, code structure undocumented, checks that no
longer run, concept duplicates without an ownership row. Each finding cites file:line evidence.

- **Baseline rule:** establish the execution state first. Pre-execution repo (tasks pending,
  modules not yet built) → "documented module absent" is the expected state, not a divergence;
  reporting it is N fake findings. Divergence = doc and code disagree about what EXISTS, not
  about what is planned.
- **Execute the gates, don't eyeball them:** run every check cell and the Gate command; classify
  each as pass / fail / **cannot-fail** (the vacuous modes in gate-catalog). A cannot-fail gate
  is a finding of its own, ranked above rule violations.

## Pipeline touchpoints

- `/quality-harness:adr-write` on a repo with an architecture doc: Component/Boundary Impact inherits from it by
  reference; an ADR that adds/moves modules updates the Module Map in the same commit.
- `/quality-harness:work` on structural goals in a repo without a doc: creating it is the prerequisite step.
- After `/quality-harness:adr-execute` completes a structural ADR: re-run `arch-lint` + the Gate command.

## Anti-patterns (refuse to ship)

- Check cell that says "keep in sync" / "manually verified" — not a check; `arch-lint` rejects.
- Module row with two reasons to change — split the module or the row.
- Grill question the scout could have answered — scout harder first.
- Rule accepted in conversation but never minted as a row — it will be re-interpreted.
- Deleting a superseded rule instead of moving it to Superseded with its ADR tag.
