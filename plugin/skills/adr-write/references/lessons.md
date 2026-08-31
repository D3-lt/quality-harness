## Lessons

Append-only, dated. When an ADR authored by this skill turns out to have been unexecutable or
misleading, the rule that would have prevented it goes here and, where a gate can enforce it
mechanically, into `adr-lint` — prose is re-interpreted by every model version, an
exit code is not.

- **2026-08-20 — an acceptance filter matching nothing exits 0**, so every task passed its own gate
  the moment it was written. Now caught by `adr-verify`; write fences that are obviously red first.
- **2026-08-20 — a Tests table naming tests nobody wrote.** Tasks marked done across five projects
  named tests absent from the files beside them. `adr-lint` now reads the real files.
- **2026-08-20 — a falsification gate that could not fail.** An ADR's whole design was "nothing
  ships until this gate passes", and the corpus it would run against could not produce a failing
  result. Before writing a criterion, ask what data would make it fail and whether that data exists.
- **2026-08-20 — a claim quantified against data that was later deleted.** A task required its
  figure to be written into a source comment; the corpus had been reset in between.

- **2026-08-21 — an acceptance fence's paths are relative to where the fence CDs to.** A task
  ended `cd apps/api && … && bash -n infra/deploy/foo.sh`; after the `cd` that path resolves to
  nothing, so the fence exited 127 on a file that existed. It fails loudly, which is the good case —
  but write every path in a fence relative to the directory the fence actually runs in, and read the
  fence once as if you were the shell.

### 2026-08-20 — a `permanent` disposition is the only one nothing ever sweeps

`adr-debt` resurfaces `(deferred: …)` at every `/quality-harness:adr-write`. It never resurfaces a
permanent entry, by design. So a permanent factual premise that is wrong does not merely mislead a
reader — it removes the item from every future sweep, and nothing will ever bring it back.

Measured: an ADR shipped `(permanent: MCP is request/response here; a server cannot wake a session)`.
The transport carries server-initiated notifications, the library in `go.mod` exposes three methods
for sending them, and the repo calls none. The capability was ruled out forever on a premise nobody
checked, and the maintainer described that same capability as the point of the product an hour later.

The rule: **a permanent entry names whether it is a chosen boundary or a factual premise.** Write
`(permanent: boundary: <reason>)` when this decision is exercising its authority to stop at a limit.
Write `(permanent: fact: <claim>; citation: <typed receipt>)` when the limit rests on something
outside the decision's authority, using `file` followed by a backticked `path:line`, `version`
followed by a backticked `name@version`, or `url` followed by an HTTPS URL. The receipt makes the
premise re-checkable; it does not prove
the claim. If you cannot name one, use `deferred`, because deferred is recoverable and permanent is
not. Legacy `(permanent)` and `(permanent: <reason>)` stay permanent but receive authoring advice.

### 2026-08-20 — an ADR built on a design comparison must record what tried to kill it

Three independent gate designs were generated, cross-critiqued, and one was picked by a judge with a
written rationale. Two adversarial reviewers then killed it, independently and for the same reason:
its central predicate blamed the wrong knob whenever a knob was already inert at baseline, producing
13 false alarms — one of them on the shipped compose stack.

A judge picks the best of what it was shown. It does not attack. If the Decision came from a
comparison, the ADR's Alternatives section records the WINNER and the Risks section records what the
adversarial pass found — including, when it happened, that the first winner was withdrawn. An ADR
that reads as though the right answer was obvious is hiding the evidence that makes it trustworthy.

### 2026-08-20 — a review finding is a hypothesis, not a work order

Twenty-odd findings arrived from independent reviewers in one session. Most were right and two were
wrong in instructive ways: one called a deliberate, commented safety skip an "unvalidated bypass",
and one read a documented calibration constant as evidence a knob was inert. Acting on either would
have removed a guard whose comment records the incident that motivated it.

So: **check a finding against the code before fixing it**, and record the refutation in the ADR
beside the findings you accepted. An Alternatives entry reading "raised as blocking; refuted, here
is why" is worth as much as the fixes — it stops the same finding being re-raised and re-actioned by
the next reviewer, who will also read the code and also see something surprising.

The corollary, which cost more: **an empty reviewer response is a FAILED review, never a clean one.**
Five reviews were dismissed as empty because the check for "did it reply" looked for a marker that
output format does not emit, and because logs were read while still being written. Two of the five
contained live defects in already-merged code. Before concluding a tool produced nothing, prove the
detector can see a success — run it against a known-good output first.

### 2026-08-20 — fix the instance, then audit the class by RUNNING it

One tool took a scope argument verbatim instead of resolving it, and leaked one project's data into
another. Fixing that tool answered nothing about the seven others with the same shape, and reading
them could not settle it: some took the argument raw deliberately, for reasons their comments
recorded. Executing the same question against each — two projects, one workspace, does naming no
scope show me the other's data — found three more leaks, one of them disclosing a verbatim source
line from another repository.

The rule: when a defect comes from a shared shape rather than a typo, enumerate the siblings and run
the question. Reading tells you which are candidates; only running tells you which are defects. And
write the audit as a test over the CLASS, so the next sibling added is asked the same question
without anyone remembering to ask it.
