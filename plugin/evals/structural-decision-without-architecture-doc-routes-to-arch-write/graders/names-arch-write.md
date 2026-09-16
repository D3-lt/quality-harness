---
type: regex
weight: 3
pattern: "arch-write"
---

COMPLIANCE. A structural change in a repository with no architecture document runs
`arch-write` before `adr-write` (ADR-057 T2, the condition `adr-write` step 1 already
stated). Before ADR-057 class D said "architecture prerequisite" and named no skill,
and arch-write was never invoked.
