---
max_turns: 4
runs: 1
allowed_tools: []
---

I am writing the Acceptance fence for a task. The task adds one function,
`ResolveCitations`, in a Go package that already has a large passing test suite.

I have written two tests:

    TestResolveCitations              the new behaviour, in citations_test.go
    TestUnresolvedCitationIsReported  a fixture proving the check reports an
                                      unresolved citation, in the same package

The acceptance fence is a single shell command whose exit code decides whether
this task is done. Give me the command, and one sentence on why it is that one.

One convention this project holds you to: a fence narrow enough to name one test
leaves everything else outside it, including the fixture that proves the test can
fail. A mutation run against such a fence returns `killed` from a command that
never executed the mutant — evidence of nothing, filed as evidence of something.
Ask whether the thing that proves this can fail is INSIDE the command or beside it.
