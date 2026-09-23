---
paths:
  - "plugin/scripts/corpus-probe.mjs"
  - "plugin/scripts/work-next.mjs"
  - "plugin/scripts/lifecycle.mjs"
  - "plugin/bin/adr-next"
  - "tests/corpus-matrix.test.mjs"
  - "tests/fixtures/corpora/**"
---

# Why §18: a reader is not shipped until somebody else has run it over a corpus we do not own

The rule is in `CLAUDE.md` §18. This file is the evidence behind it, and it is one day: 2026-09-23.

## What the suite could not see

That morning the suite was 1,216 tests, green for a week, and every product defect of the month had
been found by a peer session running the readers by hand over its own corpus, never by a test
(BACKLOG §261, §263, §264). The answer built that day was `plugin/scripts/corpus-probe.mjs` — every
reader spawned as a process over one repository, one JSON — and `tests/corpus-matrix.test.mjs`,
which runs it over five consumer-shaped corpora, through a symlink, on every CI platform (§265).

Then two idle Windows desktop sessions were asked to run the RELEASED readers by hand over a real
72-record, 209-task corpus and paste back everything they printed. In one hour, six defects the
suite had never seen (§266):

| what the reader said | what was true |
|---|---|
| SessionStart: `all 10 task(s) carry exit-0 evidence … (+3 more record set(s))` | six of nineteen directories read; the thirteen unread held every READY task |
| `adr-next --json`: `unproven: "recorded against a different Acceptance"` on ~200 done tasks | the digest matched; only the text render skipped the note |
| `adr-lint`: `Legacy no-digest evidence … Acceptance changed after verification` | no digest row existed to have observed a change |
| `corpus-probe --sweep`: `couldNotRun: did not start: ETIMEDOUT` | it started, and was killed at a 120s budget meant for one reader |
| `branch-state`: `` `selftest.sh` and the CI jobs are different checks `` | that repository has no `selftest.sh`; ours leaked into every adopter's text |
| `lifecycle.mjs < payload.json`: nothing, exit 0 | the payload was not JSON and the hook said so to nobody |

**Three of the six were in output the matrix did not assert, on the day the matrix existed.** The
matrix compares the fields a reviewer chose to put in `expected.json`; the peer read the whole
output. A structured expectation is a floor under what you already thought to check. It is not a
substitute for a person reading what the tool printed over a corpus shaped unlike yours.

## What the fix's reviewer then found

The fix went through three rounds of different-lineage review (§12): eight findings on the first
commit, three on the second, three on the third — fourteen, every one real, none visible from this
repository's corpus. Two are worth naming as classes:

- **A refactor that moves an observable to another tool turns the old tests vacuous.** Readiness was
  delegated from `work-next` to `adr-next`; three catalogue mutants on `work-next` went GREEN on CI
  the same day because the assertions that used to kill them were now satisfied by adr-next's rule.
  One of them guarded a case no fixture had (a directory two records share), was removed as
  redundant on that evidence, and had to be restored when the reviewer built the fixture.
- **A redaction over free text is a classifier over an open input space** (§16). Each round made the
  boundary cleverer and each round found a leak past it. The third round recorded a decision rather
  than a fourth regex: the scrubber over-scrubs — a regex literal or a URL's query path in a
  diagnostic is redacted too — because §6's direction is that a leak cannot be recalled and an
  over-scrub costs one question. That decision is pinned in `tests/corpus-probe.test.mjs`.

## What made the peer run work

- **Ask for the verbatim output of every reader, not a verdict**, and say in the first line that a
  reply IS the deliverable and that "it could not run because X" is a useful answer. The same
  session, asked earlier with "no reply needed", stayed silent.
- **Expect the peer's permission classifier to block foreign code** ("Code from External"). Its user
  must approve on that machine; asking the peer to work around it is permission laundering, and the
  peers refused correctly. Both first attempts were blocked; both ran after approval.
- **Every report is a lead.** Two of the eight peer findings were withdrawn by the peers themselves
  after one question each — a `cp1252` read of their own capture, an invalid JSON escape in their own
  payload. The withdrawal still bought a fix: the hook now says on stderr when its payload does not
  parse.
- **Hold a peer's sweep result to the same standard.** The peer's `adr-verify --sweep` filed 174 of
  206 claims as `false` on a host without that corpus's databases. The peer said so unprompted; the
  bucket cannot (§266 item 13, open).

## The gate on a shared machine

Four full-suite runs that day failed on nothing but deadline-shaped tests — an 8s collection budget,
a 10s spawn guard, `git took more than 5000 ms` — at load 13–30 on 10 cores from a peer's Rust
build, a VM and macOS `syspolicyd` assessing every spawned executable. Each passed alone in under a
second. The recipe that held: a `Monitor` that exits when the 1-minute load drops under the core
count, THEN the gate as its own background job with the whole budget — never a waiter and the gate
inside one background budget, which killed one run mid-suite and reported it as the gate's exit 1. A
contended result is unattributable in both directions, including a pass (`costly-runs`).
