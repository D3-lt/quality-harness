---
name: mutation-audit
description: Break a mechanism on purpose and check whether anything notices, to find tests and contracts that assert nothing. Use when the user asks whether the tests actually test anything, wants mutation testing, suspects a suite is green for the wrong reason, asks "are these tests real", or wants confidence before trusting a passing run. Do not use to judge a diff or to review code someone wrote — that is `review`; this skill never reads for quality, it only measures what a suite detects.
---

# Mutation Audit

**Resolving `${CLAUDE_PLUGIN_ROOT}`.** Paths below use it. If it reaches you as
literal text rather than a directory, this skill was loaded under its bare name
from a personal skills directory — which is not a plugin, so the placeholder is
never substituted there. Run `qh-root` and use what it prints in place of it.

A passing suite is a claim, and it is the one claim nobody checks. A test that stays
green with its mechanism broken is asserting something else — usually that the code
imports, or that a fixture still parses.

This skill measures detection: break something, see whether the suite says so. It
does not read code for quality and it does not judge a diff. `review` does that, on
the code as written; this works on the code as broken.

## When to use

- "Do my tests actually test anything", "are these tests real", "mutation testing".
- A suite went green through a change that should have broken it.
- Before trusting a passing run on something that matters — a release, a gate, a
  parser, a platform path you cannot execute.
- After adding a contract that lives in a string: a tool name in a document, a
  documented flag, a routing description.

Not for reviewing a diff, not for finding bugs by reading, and not for raising
coverage — coverage says a line ran, which is a different and weaker claim.

## The cheap half needs no mutation

Most mutation testing is expensive because it rewrites source and re-runs a suite
per mutation. The highest-value finding needs neither.

**A contract string that appears in no test is already unasserted.** You can read
that off the tree. Tool names inside documents, `templates/...` paths, documented
`--flags`, and the clauses of a skill description are all contracts, and no
compiler touches them — so nothing notices when they rot, and the suite stays
green while saying so confidently.

Start here:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/mutate-propose.mjs [repo-root]
node ${CLAUDE_PLUGIN_ROOT}/scripts/mutate-propose.mjs --json    # candidate catalogue entries
node ${CLAUDE_PLUGIN_ROOT}/scripts/mutate-propose.mjs --all     # including covered strings
```

It reads, writes nothing, takes no lock, and always exits 0. Three states, and the
middle one is the interesting one:

| state | meaning |
|---|---|
| `ASSERTED` | a test file names this string |
| `CATALOGUED` | only the mutation catalogue names it — a mutation exists, nothing asserts it |
| `UNASSERTED` | neither |

`CATALOGUED` without `ASSERTED` is how a promise survives its own deletion. Measured
here on 2026-08-26: `adr-execute`'s `tick off a task` trigger sat in that state, a
mutation deleting it left every test green, and an eval had shown the day before
that the wording carried a case from 0.00 to 1.00.

Triage the output. Most clauses are prose and deserve no test; saying so is also an
answer. Assert the ones where deleting the string would change what the software
does, and move on.

## What is worth a catalogue entry

A mutation earns its place when a real edit could plausibly produce it and the
result would be wrong. `s/true/false/` across a file generates noise;
`s/adr-verify/adr-check/` in a document is a Tuesday.

The classes worth hand-writing, because no language mutation tool reaches them:

- **Wrong tool or command name** — a document promising a binary that is not shipped.
- **Wrong or moved path** — a template, fixture, or script reference that no longer resolves.
- **Wrong, missing, or incomplete parameters** — a flag documented but never declared, a
  required argument the caller stopped passing, a call that still type-checks with one
  argument dropped.
- **Wrong order** — two guards swapped. This is the one that hides: both orders usually
  pass the happy path and differ only on the case the guard exists for.
- **Wrong placement** — a check moved outside the loop, a release moved before the read,
  a repair that runs before the lock that was supposed to protect it.
- **Unscoped change** — a filter, `LIMIT`, or path predicate deleted so the operation
  quietly applies to everything.
- **Platform and shell shapes** — an exit code, an error string, or a path separator for
  a system you are not running on.
- **Permission and environment failure** — the branch taken when a file is unreadable, a
  binary is missing, or a command cannot start at all.
- **A control that refuses nobody** — an authorization check, a healthcheck, an engine
  binding, a mass-assignment guard: something that exists, is documented, and gates
  nothing. Mutate the CONTROL, not the code it guards.
- **A success signal not gated on success** — a piped exit code, an unconditional `echo`,
  an `&&` whose left side short-circuited before the thing ever launched.

For ordinary code — flipped comparisons, off-by-one, negated conditions — use the
language's own mutation tool (`cargo-mutants`, `mutmut`, Stryker, PIT). It does that
better than a hand-written list, and leaves you free to spend the list on the above.

## The control is the thing to break, not the code it guards

The two classes above are worth their own section because the instinct is
backwards. Asked whether an admin panel is safe, the reflex is to mutate the
panel. The finding is in the CHECK: delete the authorization middleware from the
route and see whether anything at all goes red.

Four from one audit, 2026-08-27, all in code that had tests and passed them:

| the control | what it claimed | what it gated |
|---|---|---|
| admin panel authorization | a docblock beside it said restricted | nobody — it served its rows to anyone |
| the test suite | four documents said PostgreSQL | SQLite; it never touched the engine it named |
| the container healthcheck | reported healthy | not the pages, every one of which returned 500 |
| `may_write` outside the fillable list | mass assignment blocked | it was the one that WORKED — putting it back turns a test red |

Only the fourth was real, and it is the shape the other three should have had:
break it and something goes red. For each of the others the mutation is obvious
once the control is the target — remove the middleware, point the connection at
the documented engine, make the health endpoint's dependency fail — and each
takes minutes.

**A success signal is a control too.** Three ways one lies, all seen in one
session: an exit code swallowed by a pipe, an `echo` that runs whatever happened
above it, and an `&&` whose left side short-circuited so the thing it was
chaining never launched. The mutation is the same in all three — make the
underlying operation fail, and check the signal changes. If it does not, the
signal was never about the operation.

The tell that you are in this class: the check and the thing checked can be
described separately, and the check would still print the same thing if the
thing were deleted.

## A platform you cannot run is still testable

You will not execute PowerShell on macOS, and a mutation catalogue that pretends
otherwise is decoration. The pattern that works: put the platform's vocabulary in a
**classifier** with its own table of strings and exit codes, test the classifier
directly on that vocabulary, and mutate the table.

This repository's `validationVerdict` is the worked example — `cmd.exe`, PowerShell,
Win32 and Docker Desktop failure text and exits 126/127/9009 map to a verdict, and
deleting an entry from the table fails a test on any host. The audit is of the
mapping, which is where the bug was: before the taxonomy, 8 of 9 Windows shapes were
misread and 6 of them as `passed` — a check that never ran, reported as a clean pass.

## Running the mutations

The catalogue is JSON. Each entry names the file, the exact string to replace, its
replacement, and the tests that should notice:

```json
{ "label": "router: a done claim with no exit-0 entry routes to adr-verify",
  "file": "scripts/work-next.mjs",
  "from": "verdict === 'passed'",
  "to":   "true",
  "tests": ["tests/router.test.mjs"] }
```

`from` must match **exactly once** in the file, or the entry no longer describes the
code and asserts nothing.

Four verdicts, and two of them are not the pair people expect:

- **RED** — the tests noticed. This is success.
- **GREEN** — the tests did not. The mechanism is broken and the suite is content.
- **HUNG** — noticed, but by never terminating. Real: removing an upward-walk guard
  makes the loop run forever because a filesystem root is its own parent. A hang is
  not a pass and not an ordinary failure.
- **STALE** — the string matched zero or many times. The entry has rotted and is
  measuring nothing, which looks identical to passing until you check.

When a mutation comes back GREEN, **fix the test, not the code**. The code was
correct before you broke it. What is missing is the assertion, and writing one that
fails against the mutation and passes against the original is the whole deliverable.

## Safety — this rewrites real source

A runner mutates files in place and restores them from a journal. Three things must
hold, and each one is here because it failed:

- **One runner at a time**, via a pid lock. Two concurrent runs restore each other's
  files and both report nonsense.
- **Claim the lock before repairing the journal.** A second invocation that recovers
  first will un-mutate a live campaign's file and delete its journal; the first run
  then measures unmutated source and calls the mutation unnoticed.
- **Refuse a dirty working tree** for the files the run will touch. An edit made while
  a campaign is in flight is silently rolled back by the restore — the work looks
  applied, the tests run against old code, and the only symptom is a failure that
  makes no sense. This happened three times in one afternoon.

The journal is written to disk **before** the source is touched, because `SIGKILL`
runs no JavaScript and an in-process exit handler will not save you. Recover leftovers
at startup.

## Reporting

Give the count and the survivors, not a percentage alone. `134/135 noticed` with the
one survivor named is actionable; `99.3%` is not.

For each survivor: the mutation, the suite that stayed green, and what the missing
assertion has to check. Say plainly when a survivor is not worth an assertion — a
catalogue kept honest by pruning is worth more than one kept large.
