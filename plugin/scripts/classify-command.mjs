// The four-way command classifier (ADR-047) was deleted by ADR-060 T7: nothing
// reads a command's text to decide what happened any more. Advisories react to
// observed git state and to tool-written check events, and the one reading of
// command text that survives is the `commit`/`push` word rule in lifecycle.mjs.
//
// ⚠ THIS FILE IS A TOMBSTONE, KEPT ON PURPOSE, AND IT SHIPS EMPTY.
//
// ADR-041 and ADR-047 declare it in `Governs:`, and a record is history: it is
// never rewritten to match today's code (CLAUDE.md §10). A `Governs:` path that
// no tracked file matches makes `adr-lint` advise that the decision governs
// nothing, and this repository's own regression probe asserts that no record in
// this corpus has such a pointer. Deleting the path would make both true of
// four accepted records at once.
//
// So the path stays and the code goes. When ADR-060 is accepted and those
// records are retired under it, this file goes with them — that retirement is
// what removes the pointer, and it is deliberately not T7's to do (T7's Out of
// Scope, "records are history").
//
// It exports nothing, so the orphan sweep has nothing to call dead, and it is
// named in `trivial` in tests/package.test.mjs for the same reason a forwarder
// is: there is no mechanism here to mutate.
