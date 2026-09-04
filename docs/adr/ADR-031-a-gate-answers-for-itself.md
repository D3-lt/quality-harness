# ADR-031: Make every gate answer `--version` for itself

**Status:** Accepted
**Date:** 2026-09-04
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-027-the-harness-ships-an-operating-surface.md, docs/adr/ADR-019-an-orphan-must-prove-it-is-ours.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/BACKLOG.md, plugin/scripts/qh-doctor.mjs, plugin/scripts/standalone-link.mjs
**Governs:** plugin/bin/**
**Enforced-by:** `tests/gates.test.mjs::every shipped gate answers --version with the version of the tree it was run from`
**Invalidates:** none — checked. ADR-027 ships `qh-doctor`, which answers "what is installed"; this answers "what just ran", and the two are different questions whenever more than one install is reachable. ADR-019 governs how a home file is classified and is untouched.
**Served-path change:** An adopter verifying an upgrade asks the gate they are about to trust, and it answers, instead of deriving a method by diffing its output against a known record.

## Context

**GitHub issue #9, filed 2026-09-01.** An adopter upgrading to 2.57.1 could not ask any gate what it
was. They invented a method: run the forwarder, then `python "$QH/bin/adr-lint"` against one real ADR
and diff the output against what they expected. That works, and nobody should have to derive it.

**Measured 2026-09-04, run rather than recalled:**

    for f in plugin/bin/*; do case "$f" in *.cmd) continue;; esac; \
      printf '%-32s --version:%s\n' "$f" "$(grep -c -- '--version' "$f")"; done

Eleven gates, `--version:0` on every one. `qh-root` mentions the word twice and both are about
directory names in the plugin cache.

**Why ADR-027 did not close this, though it was believed to.** ADR-027 lists this in its Out of
Scope, deferred here, on the reasoning that `qh-doctor` prints the resolved root and version so "the
urgency is gone while the gap remains". That is right about urgency and wrong about the question.
`qh-doctor` answers **what is installed**. An adopter running `adr-lint` needs to know **what just
ran**, and those are the same answer only when exactly one install is reachable.

**They are routinely not the same.** CLAUDE.md §2 records two mechanisms by which a bare gate name
resolves, measured across two sessions on 2026-08-29:

| on `PATH` | resolves to | goes stale when |
|---|---|---|
| `~/.claude/bin/<gate>` — a forwarder | the newest INSTALLED version, at call time | never; but it is never the working tree either |
| the plugin loader's cache injection | the version pinned when the SESSION STARTED | on `claude plugin update`; only `/reload-plugins` rewrites it |

Whichever sits earlier in `PATH` wins, a machine may have both, one, or neither — the Windows box in
issue #2 had only the second — and the second has no tell. A peer session reported findings against a
release already fixed for exactly this reason, and the run looked entirely normal.

**So a single version-reporting command is the wrong shape.** `qh-doctor --version`, or a `qh-version`
gate, would answer about whichever copy of ITSELF resolved — which is not necessarily the copy of
`adr-lint` that produced the output being questioned. A version answer that can be about a different
binary than the one that ran is worse than none, because it resolves.

## Existing Primitives Audit

- **`qh-doctor` (ADR-027)** already reads `version` from `plugin.json` at run time, at
  `plugin/scripts/qh-doctor.mjs:96-99`, with `null` when unreadable. The RUNTIME-READ pattern is
  therefore settled precedent in this repository, not a new choice; what is new is who does it.
- **`qh-root`** resolves the newest installed directory. It is the natural home for a version answer
  and is exactly the wrong one, for the reason above: it answers about the install, not the caller.
- **`gateNames()` in `standalone-link.mjs:832-845`** enumerates gates as `entry.isFile() &&
  !entry.name.includes('.')`. A shared `_version.py` in `bin/` would therefore NOT be forwarded — the
  dot excludes it — so a shared module is available and is not blocked by the forwarder machinery.
  It was still rejected; see Alternatives.
- **The `.cmd` shims** already pass `%*` through, so a flag needs no shim change.

## Decision

**Every shipped gate answers `--version`, and the answer is the version of the tree that gate was
loaded from, read from `plugin.json` at run time.**

Concretely: each gate prints `<name> <version>` and the resolved plugin root on stdout and exits 0.
The version is read from `Path(__file__).resolve().parent.parent / ".claude-plugin" / "plugin.json"`
— relative to the GATE, never to the caller's directory, never to `qh-root` — because the whole point
is that the file answers for the file the caller actually invoked.

**Three parts of this are the decision, not details.**

**Per-gate, not central.** A central answer is only correct where one install is reachable, and this
project has measured that assumption failing on three machines. The duplication is the feature: eleven
gates that each answer for themselves will disagree when the installs disagree, and that disagreement
is the finding an adopter cannot otherwise get.

**Read at run time, never baked at release.** A version substituted into the file at package time is a
stored count, and this corpus keeps finding stored counts wrong — it is the same defect as a hint that
carries a number. A file read costs microseconds and cannot drift from the manifest beside it.

**Unreadable is reported as unreadable.** If `plugin.json` cannot be read or parsed, the gate says so
and names the path it tried, and exits 0 — the same shape `qh-doctor` already uses. It must never
print a guess, and it must never fall back to `qh-root`, which would answer about a different tree
and look identical to success. That is ADR-005's rule, and the failure it prevents is precisely the
one this record exists to fix.

**Pre-registered failure, with data that could produce it.** If a later reading finds any gate's
`--version` resolving through anything but its own `__file__` — a `qh-root` call, an environment
variable, a baked constant — this decision has been reversed in practice and the enforcing test is
not testing what it names. `grep -n 'version' plugin/bin/*` against the eleven gates is the check, and
the corpus that would produce the failure is the next person who finds the duplication offensive and
factors it out. Valid while more than one install can be on `PATH`; on a machine that can only ever
have one, the whole argument collapses and a central answer is correct.

## Alternatives Considered

- **`qh-doctor --version` only, or a new `qh-version` gate.** REJECTED, and this was the first draft's
  choice. It answers about whichever copy of itself resolved. On a machine with both PATH mechanisms —
  measured, twice — that is a different install from the gate whose output is being questioned, and
  the answer would be confidently wrong rather than absent.
- **A shared `_version.py` in `plugin/bin/`.** REJECTED on a count, not on taste. It is permitted by
  `gateNames()` (the dot excludes it from forwarding), but each gate would then need a `sys.path`
  insert, `sys.dont_write_bytecode = True` to keep `__pycache__` out of an installed cache directory,
  and the import itself — MORE lines per gate than the four-line read it deduplicates. A DRY
  refactor that adds lines at every call site is not DRY, and `__pycache__` in `bin/` is a defect this
  repository has already had once (standalone-link.mjs:834-837, 2026-08-28).
- **Bake the version at package time.** REJECTED: the stored-count class. It also cannot be verified
  from a checkout, because the checkout would carry a placeholder.
- **Do nothing; document the derived method from issue #9.** REJECTED: it is prose describing a
  workaround for a missing capability, which is the shape ADR-027 exists to stop shipping.

## Component / Boundary Impact

Eleven gate scripts gain an argument branch. No gate's existing behaviour changes: `--version` is a
new spelling, and the flag is rejected today by the unknown-option check every gate already has.

## Wiring & Contract Changes

`--version` becomes part of the gates' public CLI contract. It is additive and terminal — it never
combines with another flag, and a gate seeing it does nothing else.

## Inter-task Contracts

None — one task. This record was drafted with a T1 (add the branch) / T2 (assert it) split, and the
split did not survive contact: the flag and the tests that bind it are a single TDD cycle, and a T1
whose evidence is "eleven gates print something" would be exactly the fence that cannot fail. The
draft's ordering note is preserved here rather than deleted, because the reason it was wrong is the
useful part: it read "T2 cannot be shown red until at least one gate answers", which is a description
of a test written after the code, not a contract between tasks.

## Implementation

One task. The `report_version()` block is inserted byte-identically into all eleven gates — imports
local, so nothing about a gate's existing imports changes what the block is — and the test drives
each of them out of a throwaway tree whose manifest carries a version no other tree on this machine
has. Enumeration, never a list: a twelfth gate added later fails the test until it answers too.

## Consequences

- **Positive:** the question issue #9 asked is answerable by asking, and the answer is about the
  binary that ran rather than about the install a resolver picked.
- **Positive:** two disagreeing installs become visible from the shell, which is currently only
  discoverable with `which` and prior knowledge that the trap exists.
- **Negative:** eleven copies of a four-line read. Deliberate, argued above, and the pre-registered
  failure is written to catch the refactor that would undo it.
- **Neutral:** nothing about how gates are installed, forwarded or shimmed changes.

## Out of Scope

- `--version` on the `.mjs` scripts under `plugin/scripts/` (deferred: docs/BACKLOG.md §113 — they are not on `PATH` as bare names, so the two-mechanism trap does not reach them, and `qh-doctor` already answers for that surface)
- Changing what `qh-doctor` reports (permanent: boundary: ADR-027 owns that surface and it answers a different question)
- Making any gate report the version of a DIFFERENT install (permanent: boundary: that is the defect this record exists to prevent)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A future refactor centralises the read and the test keeps passing | Med | High — it would silently restore the defect | The pre-registered failure names the grep, and T2 asserts each gate resolves through its own `__file__` by running each from a tree whose manifest says something different |
| `plugin.json` unreadable in some install shape | Low | Med | Reported as unreadable with the path tried, never guessed — ADR-005 |
| A twelfth gate is added and forgets the flag | Med | Low | T2 enumerates `plugin/bin/` rather than listing names, so the new gate fails the test |

## Rollback

Delete the branch from each gate and the test. No persistent state, no contract another component
consumes — the flag is a leaf, so removal is a deletion and nothing else.

## Follow-ups

- [ ] After the next release, run the pre-registered grep and confirm every gate still resolves through its own `__file__`.
