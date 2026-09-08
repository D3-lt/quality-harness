# Why §16: a classifier is an empirical claim, and an unrecognised input is not a safe one

The rule is in `CLAUDE.md` §16. This file is the evidence, and all of it is one day: 2026-09-08,
when `adr-lint` gained a blocking failure and `lifecycle.mjs` gained three classifiers, and every
one of them was wrong in a way that reading the code could not show (BACKLOG §177-§180).

## Execute each name, on the case the gate is about

The blocking arm needed to know whether a test runner fails when it selects nothing. A table of
runner names was written and every number in it was real — and every number was of the wrong case.

The hole a vacuity check exists to catch is **a filter that selects nothing because the test was
never written**. The table measured **an empty directory**. Those are different questions, and a
session with a JS toolchain measured both:

```
vitest 5.0.0   no test files -> 1     -t selects nothing -> 0
jest 30.5.0    no test files -> 1     -t selects nothing -> 0
```

An empty-directory table classifies both backwards. Re-measured on the filter case, each with a
passing baseline in the same directory so a 0 cannot be a runner that failed to start:

```
pytest -k                          0 -> 5    fences it
bun test -t                        0 -> 1    fences it
go test -run                       0 -> 0
node --test --test-name-pattern    0 -> 0
cargo test <filter>                0 -> 0
```

Three ways the same list went wrong before it was measured:

- **`bun` was in the inert half because it had been typed, not run.** `bun test` on an empty
  selection exits 1, so a correct `bun test && ! grep … && echo done` fence was BLOCKED. Live for
  one commit.
- **`npm test` was measured at 0 — over a `package.json` whose script was `node --test`.** A
  wrapper's exit code is whatever it wraps; over jest the same command exits non-zero. A wrapper
  measurement measures the wrapped thing, once, on one machine. `npm`, `yarn`, `pnpm`, `make`,
  `just` and `docker` are unclassifiable by construction.
- **An opt-out flag flips any runner.** Both JS runners ship `--passWithNoTests`, and a repo's own
  script can set it where the gate cannot see.

A measurement taken elsewhere is evidence and not a licence: PHPUnit 8.5.40 was measured at 0 with
`--filter zzzNeverMatches`, confirmed by its own `No tests executed!` line, and still entered no
table — **a fence carries no version**, so a bare command name cannot be classified from one point.
`php artisan test` was reported INCONCLUSIVE by its measurer (a TTY warning, no test output, exit 0)
and that was the right call: a number that cannot be told apart from "aborted before running" is not
a measurement.

## "Not recognised as X" is never "known to be not-X"

ADR-005 governs what a gate may say about what it observed. It was being applied to verdicts and not
to the gate's own internal predicates, and that is the direction that fails open.

`withoutReadOnlySubprocessCalls` stripped any `subprocess.*([literal argv])` whose argv
`isPotentialMutationCommand` did not recognise as mutating — which reads "I do not know this
command" as "it is safe", inside the gate that enforces the rule. Four slipped through, all found by
a different-lineage reviewer constructing its own inputs:

```python
cmd = "rm"; subprocess.run([cmd, "-rf", "build"])   # executable hidden in a variable
subprocess.run(["tar", "-xf", "archive.tar"])       # extracts
subprocess.run(["find", ".", "-exec", "./mutate", "{}", ";"])
subprocess.run(["grep", "x", "in"], stdout=open("out.txt", "w"))  # writes a file the argv never names
```

It is an allowlist now. The same inversion produced the Markdown-only marker suppression that let
`python3 -c "open(\"plugin/bin/adr-lint\",\"w\")…" docs/BACKLOG.md` launder a gate rewrite through
the docs-only escape.

## Reproduce shell semantics against a shell

The status-carrier rule was wrong in both directions before four one-liners settled it:

```
set -e; (exit 5) | cat; echo R; exit 0        -> 0    a pipe MASKS the failure
set -eo pipefail; (exit 5) | cat; …           -> 5
set -e; grep -q NOPE /dev/null || true; …     -> 0    `|| true` NEUTRALISES
set -e; grep -q NOPE /dev/null || exit 1; …   -> 1    `|| exit 1` does not
```

Reading a check anywhere in a pipeline fixed a false block and opened a fail-open in the same edit:
`pytest -k zzz | tee out` counted as fenced by an exit 5 that `tee` discards. Only the status carrier
can fail a fence — the last pipeline stage unless `pipefail` is set, and an OR-list's last
alternative unless that tail always fails.

⚠ **One of this repository's own tests had encoded the fail-open**, piping every runner into `tee`
while asserting the runner fenced the fence. The test was corrected, not the assertion deleted.

## A block needs stronger evidence than advice

Every asymmetry above resolves the same way. A classification that only permits **advice** costs a
weaker finding when wrong. A classification that permits a **block** costs a false refusal of correct
work — and a gate that refuses correct work is one people stop running, which is `CLAUDE.md` §3's
whole argument. So an unmeasured runner, a wrapper, a version-specific behaviour and an
unclassifiable command all resolve to UNPROVEN, and adding a name buys nothing until somebody runs
it. That is also what removes the incentive to invent one.

## What found these, since it was not reading the code

Six false blocks came from writing fences that DO assert and checking whether the gate refused them.
Four more — including one introduced by that very self-attack, in the function it had just rewritten
— came from a different-lineage review that built its own inputs and executed them. Three GREEN
mutants said tests were not testing what they claimed. None of the ten came from re-reading.
