// The four-way command classifier (ADR-047) was deleted by ADR-060 T7: nothing
// reads a command's text to decide what happened any more. Advisories react to
// observed git state and to tool-written check events, and the one reading of
// command text that survives is the `commit`/`push` word rule in lifecycle.mjs.
//
// ⚠ THIS FILE IS A TOMBSTONE, KEPT ON PURPOSE, AND IT SHIPS EMPTY.
//
// ADR-060 declares it in `Governs:` (its T7 deleted the code here), and a record is
// history: it is never rewritten to match today's code (CLAUDE.md §10). A `Governs:`
// path that no tracked file matches makes `adr-lint` advise that the decision
// governs nothing, and this repository's own regression probe asserts that no
// record in this corpus has such a pointer.
//
// So the path stays and the code goes. ADR-047, which also governed it, was retired
// under ADR-060 on 2026-09-23 with ADR-041, ADR-042 and ADR-048. This file can go
// only when ADR-060 itself no longer governs it. (Until then this comment said
// ADR-041 declared it too; ADR-041's `Governs:` named only lifecycle.mjs.)
//
//
// It exports nothing, so the orphan sweep has nothing to call dead, and it is
// named in `trivial` in tests/package.test.mjs for the same reason a forwarder
// is: there is no mechanism here to mutate.
