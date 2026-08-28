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
