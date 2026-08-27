---
type: llm
weight: 3
---

THE CLAIM UNDER TEST. Does the proposed fence actually RUN
`TestResolveCitations_CanFail`?

PASS when the command would execute both tests — a `-run` pattern matching both
(an alternation, a shared prefix like `-run TestResolveCitations`, or no filter
at all), or two commands chained so both must pass.

FAIL when the command names only `TestResolveCitations` in a way that excludes
the `_CanFail` case, or filters to one test by exact match.
FAIL when the answer proposes no runnable command at all — an empty or purely
conversational reply is not a correct fence, and passing it here would score
silence.

Note for the judge: `go test -run TestResolveCitations` DOES match
`TestResolveCitations_CanFail`, because Go's `-run` is an unanchored regex. That
counts as PASS. `-run '^TestResolveCitations$'` does NOT, and is a FAIL.
