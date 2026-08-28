---
type: llm
weight: 3
---

THE CLAIM UNDER TEST. Does the proposed fence actually RUN
`TestUnresolvedCitationIsReported`?

PASS when the command would execute both tests — an alternation
(`-run 'TestResolveCitations|TestUnresolvedCitationIsReported'`), no filter at
all, or two commands chained so both must pass.

FAIL when the command runs only `TestResolveCitations`. The two names share no
prefix, deliberately: an earlier version of this case named them
`TestResolveCitations` and `TestResolveCitations_CanFail`, so `-run
TestResolveCitations` caught both by accident and the trap this case exists to
measure could not be fallen into. Both arms scored 10/10 and the measurement was
about nothing.
FAIL when the answer proposes no runnable command at all — an empty or purely
conversational reply is not a correct fence, and passing it here would score
silence.

Note for the judge: Go's `-run` is an unanchored regex, so a pattern only counts
as PASS if it can match BOTH names — and these two share no prefix, so a single
bare name cannot.
