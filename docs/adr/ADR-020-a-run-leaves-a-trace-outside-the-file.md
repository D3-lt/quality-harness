# ADR-020: Bind an acceptance entry to something the file cannot produce

**Status:** Accepted
**Date:** 2026-09-01
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-010-a-claim-is-re-checked-or-it-is-not-counted.md, docs/adr/ADR-016-a-mutant-earns-its-verdict.md, docs/BACKLOG.md §97
**Governs:** `plugin/bin/adr-verify`, `plugin/bin/adr-lint`, `plugin/bin/adr-next`, `tests/gate-regressions.py`
**Enforced-by:** `verify: an acceptance entry carries the time its run took`

<T1 creates this label. `adr-lint` advises on it until then, which is the correct
report for a record that is accepted and unexecuted.>

**Invalidates:** none — checked. ADR-010 and ADR-016 both touch the evidence chain and neither is changed: ADR-010 is about re-checking claims and counting only the checkable, which this extends rather than contradicts, and ADR-016 governs when a mutant earns its verdict, which is untouched. The Verification Log grammar gains an optional-before-a-cutover field; no existing clause is withdrawn.
**Served-path change:** A `done` task verified from 2026-09-02 onward records how long its acceptance command took, and `adr-lint` advises when that duration could not plausibly have run the fence it claims — where today every field in the entry is computable from the task file alone.

## Context

Reported 2026-09-01 as GitHub issue #4, carried to #6 and `docs/BACKLOG.md` §97. A
task was driven from `pending` to `done` past `adr-lint` at exit 0 with hand-typed
entries and no command run. Two of the three steps in that chain now cost
something: a digest-less acceptance row is refused unless HEAD already has it, and
neither finding prints the digest it demands.

The third step is untouched, and it is the structural one. Every field in an
acceptance entry is derivable from the task file by anyone holding it:

    def acceptance_digest(command):
        """SHA-256 of the complete normalized Acceptance fence."""
        return hashlib.sha256(command.encode("utf-8")).hexdigest()

The reporter reproduced the digest independently from the file alone. So the
digest is a genuine FENCE-DRIFT detector — change the Acceptance command and prior
evidence stops matching, which is worth keeping — and it is not, and cannot be,
evidence that a command ran.

**The honest bound, stated first because the rest of this record depends on it:**
a local gate reading local files can never prove a command ran. Every artifact
`adr-verify` writes, a human can write. This record does not close that; it raises
the cost of forging from *typing one line* to *typing one line and a matching
record in a second artifact*, on the machine where the work is claimed to have
happened. A forger who deletes the ledger, or who works on a machine that never
had one, pays nothing extra. That is a modest claim and it must not be rounded up.

### Who this is against, which the first draft did not say

Reported on GitHub issue #6, 2026-09-01, by the person who filed the original: this
record was judging every option against an implicit adversary, and it was the wrong
one.

**The realistic forger is an agent taking the shortest path to `done`, not a person
who wants to defeat a gate.** The reporter is the data point — they produced the
chain in three lines of Python, deliberately, as a test — but the same edit is what
an agent under pressure to close a task writes with no adversarial intent at all.
It has the fence text in context, it knows the grammar from the template, and
typing the row is cheaper than starting Docker. No malice is required, which is
exactly why the Verification Log exists.

That changes the bar, and lowers it. Against a determined human nothing local
works, and this record already said so — but it said it in a way that made the
whole mechanism sound marginal. Against an agent the requirement is precise:

> the entry must carry a value the agent cannot produce by reasoning over the file
> it is holding.

Faced with such a field, an agent runs `adr-verify`, because invoking the tool is
cheaper than deriving the value. The acceptance digest fails that test for exactly
one reason — it is derivable — and that is a far smaller gap than "cannot
distinguish a run from a transcription" implies.

### Why a flap is not the cost it looks like

The first draft rejected duration partly because a binding that flaps is a gate
people switch off. That is true of people and false of agents, and the asymmetry
was pointed out in the same report: **an agent does not switch a gate off, it
re-runs the command** — which is the behaviour this record wants. So the cost of a
flap is one re-run, and the cost of no binding is a fabricated `done`. Those are
not the same size, and the first draft weighed them as if they were.

### What decided the location

`mutant_journal()` already keeps state outside the repository, and the ADR-002
reasoning behind it holds here too — a gate that runs in other people's
repositories does not get to leave files in them:

    base = os.environ.get("CLAUDE_PLUGIN_DATA") or tempfile.gettempdir()

That fallback is wrong for a ledger, and noticing it is what shaped this decision.
A mutant journal is *meant* to be transient: it exists for the seconds between
applying a mutant and restoring it, and `tempfile.gettempdir()` is exactly right.
A run ledger is consulted days later. Under the same fallback its absence would be
the NORMAL case, the cross-check would be silent almost always, and an advisory
that fires at random is one an author learns to skim — the second-order cost
GitHub issue #5 named on 2026-09-01, in this same corpus, about this same gate.

### Why the grammar addition is not the defect issue #4 reported

Issue #4's finding was that the acceptance digest was OPTIONAL, so the
anti-fabrication field was opt-out by omission. Adding another optional field
would repeat that exactly.

It is not optional. `adr-lint` already carries the mechanism for this precise
situation — a field that could not exist before a date:

    MUTATION_REQUIRED_FROM = "2026-08-22"

An entry dated on or after the cutover must carry the output digest; an earlier
one need not, and the row's own date says which it is. A missing field is
therefore a *checkable* claim about when the row was written, not a silent
opt-out. That is the difference between this and #4, and it is the reason the
field may live in the entry line at all.

### THE MEASUREMENT FIRED THE STOP CONDITION, AND MOST OF THIS RECORD DOES NOT SHIP

T1 S2 was written to run before the code, and it did. Measured 2026-09-01 against
this repository's own corpus — 40 task files carrying a bash acceptance fence, each
run twice on a clean tree:

| runner | fences | repeated-run output |
|---|---|---|
| `node --test` | 25 | **differs on every line** — a per-test duration `(1.6575ms)` |
| `gate-regressions.py` | 11 | byte-identical |
| other, `selftest.sh` | 4 | — |

48 of 56 lines differ between two runs of one `node --test` fence. This record's
Decision said, in advance: *if fewer than all of them are stable, part 3 does not
ship*. Twenty-five of forty are unstable, so it does not, and the rest follows:

- **Part 3, the ledger cross-check: does not ship.** Its own falsifier fired.
- **Part 2, the ledger: does not ship.** With no cross-check there is no reader,
  and a store nothing reads is the speculative complexity YAGNI exists to refuse.
- **Part 1, the output digest: does not ship.** With no reader it is an
  unverifiable number that changes every run, bought with a grammar change across
  three readers and a fourth place for the format to drift.

**Normalising the timings out was measured too, and rejected.** Stripping node's
`(N.NNNms)` does make the output byte-stable, so the mechanism is technically
rescuable. It is rejected because the normaliser is per-runner — node's spelling,
pytest's `in 0.12s`, Go's `0.004s`, PHPUnit's `Time: 00:01.234` — and a runner
nobody wrote one for produces a digest that can never match, which fires the
cross-check on honest work for exactly the corpora this plugin does not control.
That is the ungradeable, silently rotting surface ADR-019 rejected a content
signature for, one record later.

**What survives is the half this record first threw away.** The duration floor
needs no stability, no ledger and no second artifact, because it is refuted by
REASONING about the fence rather than by comparison with another run: a claim of
`exit 0` in 3ms against a fence that starts a container is wrong on its face. The
argument for it came from GitHub issue #6 after this record had already dropped it
as YAGNI, and the measurement that killed the alternative is what leaves it as the
whole decision.

## Existing Primitives Audit

- `mutant_journal(cwd)` in `plugin/bin/adr-verify` already keys per-repository
  state by a digest of the resolved path, outside the repository. **Reshaped:**
  the keying is reused; the `tempfile` fallback is not, for the reason above.
- `MUTATION_REQUIRED_FROM` in `plugin/bin/adr-lint` already expresses "required
  from a date, tolerated before it". **Reused unchanged** in shape, with its own
  constant.
- `normalize_acceptance()` and `acceptance_digest()` exist in three gates and
  `tests/gate-regressions.py` asserts all three agree. **Reused unchanged.** The
  new digest is a fourth value, not a change to these.
- `VLOG_RE` / `VLOG_DIGEST_RE` / `VLOG_LEGACY_RE` in `adr-lint` and `is_done()` in
  `adr-next` read the entry grammar. **Reshaped together**, because a third
  implementation drifting is what makes `adr-next` call verified tasks unverified.
- `refuse_unreadable()` and `append_entry()` already own writing an entry.
  **Reused unchanged.**

## Decision

**An acceptance entry records how long its run took, and `adr-lint` advises when
that duration could not plausibly have produced the result it claims.**

`adr-verify` appends `ms:<integer>` to the entry it writes. Entries dated on or
after `DURATION_REQUIRED_FROM` must carry it; earlier entries need not, and
`adr-lint`, `adr-verify` and `adr-next` change together.

The duration is never compared for equality, with anything, on any path. It is
checked as a FLOOR: an entry claiming success in a time that could not have run the
fence it names is advised. A floor never reddens honest work, because honest work
is never absurdly fast, and it costs a forger either a real run or a plausible lie
they must reason about rather than paste.

**Why this meets the bar even though nothing can verify it.** The threat model is
an agent taking the shortest path to `done`, not a determined human. The
requirement is a value the agent cannot produce by reasoning over the file it
holds, and a wall-clock duration is not in that file. Faced with one, an agent runs
`adr-verify`, because invoking the tool is cheaper than inventing a number it would
then have to defend against a floor.

The three parts the first draft proposed — an output digest, a ledger, and a
cross-check between them — do not ship. The measurement above is why, and it was
the record's own pre-registered falsifier rather than a judgement made when the
work turned out to be inconvenient.

**What would make this decision wrong, and whether such data exists:** if honest
re-runs routinely produce different output for the same fence, the disagreement
advisory fires on correct work and the mechanism is worse than nothing. Output
that embeds a duration, a temp path, a random seed or a wall-clock time will do
exactly that. This is falsifiable and the data does not exist yet: T1 measures
the repository's own fences across repeated runs and records how many are stable.
**If fewer than all of them are stable, part 3 does not ship** — the record's own
Stop Condition, not a judgement call at the time.

**Duration is recorded too, and checked as a FLOOR rather than as a match.** The
first draft dropped it on the grounds that nothing would read it and no check could
fail on it. Both were wrong, and the counter-argument is the reporter's:

- A wall-clock duration is **not derivable from the file**, which is the only
  property the bar above actually requires.
- It needs no normalisation and does not have to reproduce, because nothing
  compares it for equality.
- A check CAN fail on it. An entry claiming `exit 0` in 3ms against a fence that
  starts a container and runs a full suite is not a flap, it is a fabrication.

So `adr-lint` advises when a recorded duration is implausibly short for the fence
it claims to have run. A floor never reddens honest work — honest work never comes
in absurdly fast — and it costs a forger either a real run or a plausible lie they
must now reason about rather than paste.

It is weaker than an output digest and much cheaper, and it composes with the
ledger rather than competing with it. It ships in the same task as the output
digest because both are fields of one entry and one grammar change.

## Alternatives Considered

- **Record the output digest in the ledger only, not in the entry.** Rejected
  because the entry is what travels with the corpus and what a reviewer on another
  machine can see; a ledger-only value is invisible to everyone but the machine
  that wrote it, and gives a forger nothing to have to keep consistent.
- **Record it in the entry only, with no ledger.** Rejected because it buys
  nothing against the reported attack: an unverifiable number in a file the forger
  is already editing is one more line to type.
- **Sign entries with a key.** Rejected as the same problem one level up: a local
  key readable by the tool is readable by whoever runs the tool, and a key that is
  not local makes this a service rather than a gate.
- **Keep the ledger in `tempfile.gettempdir()`, as `mutant_journal` does.**
  Rejected on the difference in lifetime: a journal spans seconds, a ledger spans
  days, and a check whose evidence is routinely absent trains its reader to skim.
- **Drop duration entirely, as this record's first draft did.** Rejected on
  2026-09-01 after GitHub issue #6 argued the case against it was wrong twice
  over: nothing would read it (false — a floor reads it), and it would flap (true,
  and irrelevant to a floor). The exclusion is gone from Out of Scope rather than
  quietly reworded, because it was a decision this record made and then reversed.
- **Check duration for equality rather than as a floor.** Rejected because that is
  the version that flaps: identical work legitimately takes different times, so an
  equality check reddens honest runs, which is the objection that killed duration
  in the first draft and is answered only by the floor.
- **Do nothing and document the limit.** Partly taken already — the templates and
  `adr-execute` were corrected on 2026-09-01 to stop claiming the Verification Log
  closes the fabrication hole. Rejected as sufficient on its own, because the
  reported chain is cheap enough that documentation alone leaves it cheap.

## Component / Boundary Impact

- `plugin/bin/adr-verify` — owns writing the entry and now the ledger. One reason
  to change: what a recorded run consists of.
- `plugin/bin/adr-lint` — owns reading entries and now the optional cross-check.
- `plugin/bin/adr-next` — owns readiness; changes only so its grammar does not
  reject an entry the other two accept.
- No new component. The ledger is per-user state, not a shared service.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| Verification Log entry grammar | new trailing ` · ms:<integer>`, required from a dated cutover | `adr-verify` | `adr-lint`, `adr-next` |
| `DURATION_REQUIRED_FROM` | new constant, the cutover date | `adr-lint` | `adr-lint` |

No schema, no network, no change to any skill's instructions.

## Inter-task Contracts

None — one task. The first draft had three, and the two that would have consumed
T1's contracts were deleted before they ran; see the measurement in Context.

## Implementation

See `tasks/README.md`. One task — the first draft's other two were deleted before they ran, for the reason recorded in Context.

## Consequences

- **Positive:** forging a `done` on the machine where the work is claimed requires
  editing two artifacts consistently rather than typing one line.
- **Positive:** the stability measurement in T1 is worth having on its own — a
  fence whose output changes between identical runs is a fence worth knowing about.
- **Negative, and the same size as the positive:** a forger who deletes the ledger,
  or who never had one, pays nothing extra. A reviewer on a different machine gains
  nothing at all. This raises a cost; it does not close a hole, and the
  documentation corrected on 2026-09-01 must keep saying so.
- **Negative:** one more field in a grammar four readers share, and a fourth place
  the entry format can drift.
- **Neutral:** entries written before the cutover stay valid forever, so the corpus
  contains two shapes and will for as long as it keeps its history.

## Out of Scope

- Proving that a command ran (permanent: fact: every artifact adr-verify writes, a human can write, so a local gate reading local files cannot distinguish a run from a transcription; citation: file `plugin/bin/adr-verify:186`)
- Signing entries, or any mechanism needing a key or a service (permanent: boundary: a key the tool can read is a key its runner can read, and a remote one makes this a service rather than a gate)
- Comparing two durations for EQUALITY, or reddening a build on a slow or fast run (permanent: boundary: the check is a floor, not a match; equality is what would make duration flap, and flapping is what the first draft wrongly rejected the whole field for)
- Cross-machine verification of a ledger (permanent: boundary: the ledger is per-user local state by construction; a reviewer elsewhere sees the entry and not the ledger)
- Applying the same binding to the Mutation Log (deferred: docs/BACKLOG.md §98)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Honest re-runs produce different output, so the output advisory fires on correct work | Med | Med — an agent re-runs rather than switching the gate off, so a flap costs one re-run against a fabricated `done` | T1 measures this repository's own fences before part 3 is written; the Stop Condition drops part 3 rather than shipping a noisy check |
| The ledger's absence is read as forgery by a later reader | Med | High | Absence produces NOTHING — no advice, no finding — and T3 asserts silence on an absent, unreadable and silent-about-this-row ledger separately |
| A fourth reader of the entry grammar drifts | Med | Med | `tests/gate-regressions.py` already asserts three-way agreement on the acceptance digest; T1 extends it to the new field |
| The ledger grows without bound | Low | Low | Append-only JSON lines keyed by task and digest; T2 caps it and says what is dropped |
| A 2.45 gate reads a 2.46 entry as malformed | Med | High | See Rollback — the field is appended at the END of the line, and older readers' patterns are checked against a 2.46-shaped entry in T1 |

## Rollback

Revert the three commits. Entries already written keep their `output-sha256:`
field, so a reverted (older) `adr-lint` must still accept them — that is the real
downgrade path and it is why T1 verifies the CURRENT released patterns against a
new-shape entry before the writer ships. The ledger is per-user state outside every
repository; deleting it affects nothing but the optional cross-check. No corpus
data is lost by rolling back, and no task's `done` status changes.

## Follow-ups

- [ ] After a month, count how often the ledger cross-check actually fires on real corpora, and how often it fires on honest work. If the second number is not zero, part 3 comes out.
