# Backlog archive — 101 to 200

Closed sections of `docs/BACKLOG.md`, moved here verbatim on 2026-10-12. Nothing below was edited;
the index in `docs/BACKLOG.md` keeps every heading and points here. This file is history (CLAUDE.md §10).

## 101. CLOSED 2026-09-01 by ADR-021 T1 — a Verification Log row deleted from a committed file was invisible

Found 2026-09-01 while reading `yzhao062/awesome-auditable-ai`, whose "Audit Trails and Decision
Records" section names hash-chained records. The question it prompted — can a row be REMOVED from
one of our logs without anything noticing — was probed rather than assumed.

**Probed through the `adr-lint` CLI on a git fixture**, against `HEAD`'s copy of the gate rather than
the working tree's, because the mutation campaign was mutating that file at the time and a probe
against a deliberately broken subject measures the mutant. Three rows committed (`exit 1`, then two
`exit 0`, all carrying the current fence digest), then rows removed and the gate re-run:

| removed from the committed log | what `adr-lint` said |
|---|---|
| nothing (baseline) | two findings, both about the fixture and unrelated |
| the RED `exit 1` row | **identical to baseline** |
| one of the two GREEN rows | **identical to baseline** |
| every row | caught — `T1 marked done but its Verification Log has no exit-0 entry` |

**The one that matters is the RED row.** Deleting it makes a log imply a red-green cycle that did not
happen, which is the claim two task files in this corpus currently disclose BY HAND in prose because
nothing checks it. The "every entry passed, so nothing shows the fence could fail" advisory does not
fire, because a `## Mutation Log` entry suppresses it — a killed mutant is evidence the fence can
fail, which is correct, and which is why it cannot also serve as the deletion detector.

`grep -n "committed\|known" plugin/bin/adr-lint` returns one use of `known`: the digest-less notice.
Nothing else reads the committed file. Deletion is unmodelled, not defended.

### The fix, and the more elaborate one that lost to it

**A hash chain is NOT the fix, and this entry exists partly to record why.** Each row carrying the
digest of its predecessor would make deletion and reordering detectable, and it costs a new field, a
cutover date, invalidation semantics, and a change to what `adr-verify` writes.

`check_verification` **already calls `committed_lines()` two lines above the digest-less notice.**
The committed rows are in hand at the point the present rows are being read. Detecting a deletion is
comparing the two. No new field, no cutover, no writer change.

A chain beats git in exactly one place: where `committed()` answers `None` — a corpus copied without
its `.git`, a rewritten or squashed history. That is the boundary, and nothing has reported it, so it
is named here and not built.

**Two things the cheap version must get right**, both of them this repository's own rules:

1. `known is not None` guards it, exactly as the digest-less notice is guarded. A naive
   `for row in known: if row not in present` fires on every task in a corpus with no `.git`, which is
   a filter that could not look reporting absence (CLAUDE.md §3, ADR-005). The regression needs an
   arm proving SILENCE when `committed()` returns `None`.
2. Compare only Verification Log rows. `committed_lines()` returns every line of the committed file,
   so an unfiltered diff would fire on ordinary prose edits — including the correction notes this
   corpus writes into task files routinely. Filter through `VLOG_RE` on both sides.

**WRITTEN UP 2026-09-01 as `docs/adr/ADR-021-a-deleted-row-is-a-change-to-the-evidence.md`**, Proposed,
extending ADR-010 (a claim is re-checked or it is not counted). Its one task carries the call-site
mutation and the two silence arms — `committed()` returning `None`, and a prose-only edit. The
rejected hash chain is recorded in the record's Alternatives with the reason, so the next session
meeting the idea does not re-derive it.

**EXECUTED 2026-09-01.** `check_verification` now advises on a committed entry line absent from the
file, guarded on `known is not None` and filtered through `VLOG_RE` on both sides. Both silence arms
are asserted on the same fixture, the advisory CHANNEL is asserted rather than the summary line, and
the mutation `lint: a committed evidence row that has gone missing is reported` deletes the CALL and
is RED. Evidence written by `adr-verify` into T1's Verification and Mutation Logs.

## 102. CLOSED 2026-09-02 — a mutant that did not PARSE counted as noticed, and only the parser noticed it

Split out of §53's 2026-09-01 measurement because it is a decision about what the campaign's numbers
mean, not a defect to repair.

`state: a supersession chain is followed` rewrites `supersededBy: /^superseded\s+by\b/i.test(status)`
to `supersededBy: false &&`. That does not parse. `tests/lifecycle.test.mjs` dies at import in 40ms
with no subtest named, `mutate.mjs` reads a non-zero exit, and the mutant is counted RED — one of the
`416/416 mutations were noticed`.

**Nothing asserted anything.** The suite never ran. A syntax-error mutant proves the file is fed to a
parser, which was never in doubt.

**The precedent is already here and points the other way.** This repository decided that a mutant
whose process ends abnormally is INCONCLUSIVE rather than killed —
`tests/gate-regressions.py::abnormal mutant termination is inconclusive`, and `adr-verify`'s
`CRASH_OUTPUT` / `abnormal_termination`. The reasoning was that a false survivor costs a rerun while
a false kill permanently credits proof nobody observed. A mutant that cannot be parsed credits
exactly that kind of proof.

**The decision to make**, and why it is not obvious: classifying non-parsing mutants as inconclusive
would change what the campaign's exit code and its `N/N noticed` headline mean, and it would put a
burden on catalogue authors to write mutants that parse — which is arguably right, since a mutant is
supposed to change BEHAVIOUR, and one that changes nothing but syntax tests nothing. Against it: a
syntax-error mutant is trivially detectable and cheap to reject at authoring time, so a lint on the
catalogue may be the smaller change than a new verdict class.

**Scope, measured rather than guessed:** exactly ONE of the 416 catalogue entries has this property
today.

---

**CLOSED 2026-09-02 as an AUTHORING defect, not a new verdict class** — the smaller change this
entry itself argued for. A mutant is supposed to change BEHAVIOUR, and one that changes only syntax
tests nothing, so it is rejected where it is written rather than reclassified where it runs. The
campaign's exit code and its `N/N noticed` headline keep meaning what they always did, which the
verdict-class option would have altered.

**The count had grown from one to two** by the time this landed — the second was a duplicate `cwd=`
keyword in an `adr-verify` mutant — which is why it became a check rather than a cleanup:

    state: a supersession chain is followed          `supersededBy: false &&`   (JS syntax)
    sweep: a fence runs where it was recorded …      duplicate `cwd=` keyword   (Python syntax)

Both now express the same intent in code that parses, and both still come back RED — for a
behavioural reason rather than because the file reached a parser.

`tests/package.test.mjs::every catalogue mutant still parses, so a kill is behavioural` applies
`node --check` or `ast.parse` to each entry's mutated text. Shown capable of firing: restoring the
original un-parseable form fails it and names the entry.

## 104. CLOSED 2026-09-02 — `gh run watch --exit-status` exits 0 on a CANCELLED run, and a push cancels the run you are releasing on

Found 2026-09-02 while releasing v2.52.0, by nearly cutting the tag on it. Both halves are
release-procedure defects and neither is visible from the command's output alone.

**Half one: the watch reports success for a run that never finished.** `gh run watch <id>
--exit-status` (gh 2.98.0) printed the cancellation and then exited 0:

    X The operation was canceled.
    mutations 1/4: .github#253

    [exited with code 0]

`--exit-status` documents itself as exiting non-zero "if the run fails". A cancelled run did not
fail, so the flag is arguably behaving as written — which is precisely the trap. The vocabulary a
release gate needs is *did every job succeed*, and `cancelled` answers neither `success` nor
`failure`. This is CLAUDE.md §3's rule arriving from outside the repository: a tool that could not
finish looking must not be read as having looked and found nothing wrong.

The API does say it plainly, and is what a release must read:

    gh run view <id> --json conclusion,jobs \
      --jq '"\(.conclusion)", (.jobs[] | "\(.name): \(.conclusion)")'
    RUN: completed cancelled at d866534
      mutations 3/4: cancelled

**Half two: pushing during the run is what cancelled it.** `.github/workflows/selftest.yml:21`
sets `cancel-in-progress: true` on a concurrency group keyed by event and ref. So a second push to
`main` kills the in-flight run for the first — by design, and correct for ordinary development,
where only the newest commit matters. It is wrong for a release, where the run is EVIDENCE FOR A
SPECIFIC SHA and the next push destroys it.

The failure mode is quiet in the way this project cares about: the release run reaches six of nine
jobs green, the three cancelled shards are the expensive ones (the full mutation campaign), and the
watch says 0. A release cut there carries no mutation evidence at all while looking fully verified.

**Two rules, both cheap, and CLAUDE.md §13 now carries them:** read `conclusion` per job rather
than the watch's exit code, and do not push again until the release run is done or accept that the
tag needs a fresh run at the new head.

**Not a hypothetical.** The release was held and re-run at `b8e4e4c`; the tag was not cut on the
cancelled evidence.

**CLOSED 2026-09-02 (55fb0fd, 8a20265).** `scripts/release-evidence.mjs` is that check, and it
gated the release it was written for — v2.52.0 was cut only after it reported nine of nine
`success` at `77f020c`. Four verdicts, and only `success` clears a sha: `failed` names each job and
its conclusion, `incomplete` stays distinct from `failed` per ADR-005, and `unreadable` is "I could
not look". A run carrying ZERO jobs is `unreadable` by a named branch, because `[].every(...)` is
true and an empty job list would otherwise clear every sha ever at full coverage.

**Two more `gh` traps found while using it, and they are one finding: an abbreviated sha is
accepted and then silently means nothing.**

    gh run list --commit 57a1e76        -> []            (not an error — an empty list)
    gh release create --target 77f020c  -> HTTP 422 "Release.target_commitish is invalid"

The first is the dangerous one: `[]` reads exactly like "this commit has no runs", so a release
check would report "could not look" forever while the run sat there. `release-evidence.mjs` expands
the sha with `git rev-parse` before asking. The second at least fails loudly.

**And a third, in the WATCHER rather than the check.** The first background poller treated exit 2
(`unreadable`) as terminal, so a single `dial tcp … i/o timeout` to `api.github.com` ended it
sixteen minutes early — after which two shards went green unobserved. Separating "could not look"
from "found a problem" is pointless if the caller collapses them again: a watcher must RETRY an
unreadable answer and wake only on `success` or `failed`. Fixed in the poller; recorded here
because the same mistake is available to anyone scripting the release.

## 106. CLOSED 2026-09-02 — mutation shards were sliced by index, so the slowest carried 53% more than the fastest

Filed 2026-09-02 by ADR-023, which deferred it. `scripts/mutate.mjs --shard i/n` slices the
catalogue by INDEX, so a shard's cost depends on which suites its entries happen to name. Measured
at 430 entries over four shards, using per-suite runtimes taken the same day:

    shard 1/4: 107 mutants, 24.6 min
    shard 2/4: 108 mutants, 16.1 min
    shard 3/4: 107 mutants, 18.1 min
    shard 4/4: 108 mutants, 21.3 min

Even counts, uneven cost, because three suites are 86% of the campaign
(`lifecycle.test.mjs` 17.2s x 116, `gates.test.mjs` 14.1s x 96, `evidence-chain.test.mjs` 22.2s x
34). The campaign waits for the slowest, so 8.5 of those minutes are pure wall-clock loss.

ADR-023 T1 raised the matrix to eight, which shrinks the absolute gap without addressing the
imbalance — the ratio is a property of the slicing, not of the count.

**Why it was deferred rather than done.** The obvious fix is to slice by estimated cost, and the
obvious estimate is a table of per-suite runtimes. **That table is a list kept beside the artifact**
— the shape this corpus distrusts, and the one ADR-011 named: it is right on the day it is written
and silently wrong after any suite changes, with nothing to report the drift. A number that decides
scheduling and answers to nothing is worse than an uneven shard.

**The honest version measures rather than remembers**: have the campaign record each entry's
observed duration as it runs, and slice the next run from those. That makes the estimate a
measurement with a provenance, and makes a stale one visible. It is also a bigger piece of work
than raising a matrix number, needs somewhere durable to keep the timings, and interacts with
ADR-023's verdict cache, which will be writing per-entry state anyway.

**Do this after ADR-023 T2 lands**, and share its store rather than adding a second one.

**CLOSED 2026-09-02**, exactly that way. `shardByCost()` in `scripts/mutate.mjs` does
longest-processing-time-first over the durations ADR-023's cache already records, so the estimate is
a measurement from the campaign's own last run and a stale one fixes itself on the next. No table
was added.

An entry with no timing sorts FIRST, at Infinity — an unmeasured mutant is the one whose cost is
unknown, and separating the unknowns is a safer guess than assuming they are cheap. With no timings
at all it degrades to round-robin, partitions correctly, and says `no timings yet — even counts`
rather than claiming a balance it did not compute.

The partition is asserted over the real catalogue at several shard counts, because an overlap
double-counts a verdict and a gap drops one silently: 436 entries, 436 unique, every entry in
exactly one shard.

## 107. CLOSED 2026-09-24 — `(external: <where>: …)` takes free text, so the owner of a cross-repo target is unsearchable

Deferred out of ADR-024 T2, which introduced the disposition. `<where>` is prose — "backend repo",
"the Laravel side", "platform-team monorepo" — chosen because the reader's question is *who owns
this*, and a human sentence answers it immediately while a URL does not.

What it costs: nothing can group, count or follow these. A team with a dozen cross-repo pointers
cannot ask "what do we owe the backend repo", and a target that MOVES leaves every citation of it
stale with nothing to report the drift — the `Governs:` rot ADR-011 closed, one field over.

**The obvious fix is the one to be careful about.** A machine-readable form (a git remote, an HTTPS
URL, an `org/repo#ADR-007` triple) is greppable and checkable — but checking it means reaching into
another repository, which ADR-024 rules out permanently: a gate whose answer depends on what else is
cloned beside it is the machine-dependence CLAUDE.md §8 forbids. So a typed `<where>` would be
*shaped* like a resolvable pointer and resolve against nothing, which is a worse lie than prose.

**What would make this worth doing:** a corpus with enough external pointers that grouping them is a
real question, and a decision about what a typed target is FOR if nothing may follow it. Neither
exists yet — ADR-024's own criterion says the disposition comes out entirely if ten records pass
without a use, and this entry should not outlive that.

**CLOSED 2026-09-24.** Not pursued: the disposition is used twice in the corpus, so ADR-024's removal criterion has not fired and no corpus has enough external pointers for grouping to be a question. Reopen when one does.

## 109. CLOSED 2026-09-02 — a commit taken mid-mutation captures a neutered gate, and nothing looked

Found by doing it, twice, on `main` — then reproduced deliberately in a throwaway clone to confirm
the mechanism rather than infer it.

`scripts/unasserted.mjs` and `scripts/mutate.mjs` replace one `errors.append(...)` with `pass` at a
time to ask whether anything asserts it, and restore afterwards. A `git add -A` inside that window
commits a **shipped gate with a finding removed**:

    050ee28  L387  errors.advise("archive README lacks…")  ->  pass
    af618d0  L395  errors.append("active and archive…")    ->  pass

Different lines, because each `add -A` caught a different instant of the sweep.

**Reproduced 2026-09-02**, in a clone so nothing was risked: journal, neuter one finding,
`git add -A && git commit -m "an innocent docs commit"` — and the commit captured
`errors.append(…)` → `pass`, one file changed, subject says docs.

**Why it is invisible where anyone would look**, which is the part worth keeping:

- the journal is **gitignored**, so `git status` reads completely normally;
- a neutered gate is **valid Python** that simply reports one thing less — nothing errors;
- and it is one more modified file in a commit you are not inspecting, because you are committing
  documentation.

**ADR-002 does not cover this and was never meant to.** It guarantees a mutant restore outlives the
PROCESS — journal first, signal handler, recovery on the next run — which protects against a kill.
A concurrent commit is a different failure: the tool is working correctly, the tree is broken on
purpose, and a third party captures it.

**CLOSED with `.githooks/pre-commit`**, the only guard that fires at the moment of the mistake. It
refuses while either journal exists, names the file that is neutered right now, and stands down when
it is gone. Driven by `tests/package.test.mjs::the pre-commit hook refuses a commit taken
mid-mutation, and only then` — run in a scratch repo rather than read, and asserting it does NOT
refuse an honest tree, or it would pass equally against a hook that refuses everything.

**Its limit, stated rather than assumed:** `core.hooksPath` is per-clone local config, so an
uninstalled hook protects nobody. `CLAUDE.md` §2 now carries the one-line install beside the rule it
enforces. The suite's sibling check (`no mutation tool left a gate neutered in this tree`) still
exists and still only fires if someone runs the suite — which a docs commit does not, and that is
precisely how both real instances got through.

**The first line is not the hook.** It is: do not run a mutation tool and edit the tree at the same
time. All three of that day's self-inflicted defects trace to doing exactly that.

## 110. DECLINED 2026-09-24 — Should a task be edited through a tool rather than rewritten as a file?

**Raised 2026-09-02 by the same user as §108**, from watching the lifecycle run on their own
project, and recorded at their framing rather than above it: *"failai - db, ir irankiai ja
administruot"* — the files are the database, and the tools administer it. *"ka already partly ir
daro adr toolingas"* — which the ADR tooling already partly does.

The concrete shape they proposed:

    ./tool adr5 task5 --mark-in-progress      instead of read-whole-file, patch, write-whole-file
    ./tool adr5 --get-in-progress-tasks       instead of the model reconstructing state from files
    adr-add-task --title --body               instead of composing a task file from the template

**Their stated hypothesis, and it is a hypothesis:** *"gal jam sunku daug output i 1 faila uztai
jis cia 15 min generuoja tuos adr … butu 5 tool gabaliukais su kita mintim gal butu lengviau
reasonint"* — perhaps a large single-file output is what costs, and five small tool calls would be
easier to reason with.

**What is already measured, and it does not settle this.** §108 established that the six pre-draft
commands cost 1.87s serial against 1.34s batched — the COMPUTE is not the cost — and named turn
count as the likely dominant term without establishing it. This proposal points the other way: it
would REPLACE one large write with several small tool calls, which is more turns and fewer output
tokens. §108 and §110 therefore disagree about which resource is scarce, and neither has the
measurement that would settle it.

**And it is in tension with `mrw`**, the tool this same machine's instructions now mandate for
multi-file work, whose rule 3 is *"One call, not N"* and whose rule 4 is *"One plan, not N writes"*.
`mrw` exists because a batched edit is cheaper AND because a silent no-op write is the failure it
catches. A per-task CLI is the opposite trade. Both cannot be right in general; which is right here
depends on whether the cost is turns or tokens, and on whether a small typed operation is less
error-prone than a plan `mrw` verifies hunk by hunk.

**The half that is not in tension and is worth taking on its own:** the READ side. `./tool adr5
--get-in-progress-tasks` replaces a model walking files and inferring state with one query and a
typed answer. That is `adr-next`, `adr-state.mjs` and `adr-debt` already, and the gap is that they
are not addressable per-record-per-task. Nothing about adding a query argues against `mrw`, and it
removes the reconstruction §108 measured as turns.

**Open questions a record would have to answer**, none of which are answered by preference:
which resource is actually scarce (turns, output tokens, or author attention); whether a typed
`--mark-in-progress` can maintain the evidence chain, since a status word is exactly what
`adr-verify` refuses to let anyone type; and whether the write side can be a `mrw` plan the tool
GENERATES rather than a second write path beside it.

**Do not start this before §108's turn-count measurement exists.** Both entries rest on the same
unmeasured claim, and building either on it would be the speculative complexity this corpus refuses.

---

**Declined 2026-09-24.** Not started: it waits behind §108's turn-count measurement, which does not exist. Reopen with that number.

## 111. CLOSED 2026-09-07 (shipped as ADR-025) — the shipped gate re-runs a fence the caller just ran, and a merge removes it

**Closed by `scripts/backlog-record-sweep.mjs` finding it, 2026-09-07.** The receipt:

```
$ python3 plugin/bin/adr-next docs/adr/ADR-025-… --all | awk '{print $1}' | sort | uniq -c
   2 done
$ grep -m1 '^\*\*Status:\*\*' docs/adr/ADR-025-….md
**Status:** Accepted
```

The section below is what was known when it was filed and is kept as written (§10).

**MEASURED 2026-09-02 across this corpus's own 51 task files**, which is the only reason this is
filed rather than assumed:

    tasks 51 · verification entries 93 · mutation entries 94
    fence executions = 93 + (94 x 2) = 281        -> 5.5 per task

The x2 is the finding. `adr-verify --mutant` runs the acceptance fence CLEAN before it applies the
mutant (`plugin/bin/adr-verify:1257`), unconditionally, every invocation — correctly, because a
failure that already exists cannot be donated to a mutant. But step 4 of `adr-execute` has the agent
run `adr-verify <task>` immediately before, on the same tree, with the same fence. The clean run is
then recomputation of a result taken seconds earlier.

**94 of the 281 executions — 33% — are that clean run.**

This corpus already decided the principle, in ADR-023: a verdict may be reused when the subject file,
every test file the entry names, and the edit strings are byte-identical, keyed on CONTENT and never
on history or a commit range. What ADR-023 built lives in `scripts/mutate.mjs`, which is
repository-owned and **does not ship**. `plugin/bin/adr-verify` does ship, and is the thing every
adopting corpus actually runs.

**It is not invisible here either, and I asserted that it was.** This entry said "our fence is ~0.7s,
so 5.5 runs is invisible", generalised from the two task files I happened to have open. The corpus
records the timing, so it was checkable and I did not check it:

    23 recorded fence timings · min 3ms · median 4,787ms · max 25,537ms

At the median, 5.5 runs is **26s per task** and a five-task wave is **131s**. That is not invisible,
it is just small enough that nobody filed it. The adopting corpus reporting `go test ./...` at
43.837s (§108) pays **4 minutes per task** and twenty per wave — same multiplier, different base.

**A second finding fell out of taking that measurement — and it is WRONG, which is the more useful
result of the two.** I wrote: "only 21 of 93 verification entries carry an `ms:` field — 22%, so this
corpus cannot answer whether a change made the lifecycle faster, and recording the number is the
precondition for every optimisation below." Then checked the code instead of the count:

    plugin/bin/adr-verify:2277 writes ` · ms:{elapsed_ms}` unconditionally
    ADR-020 T1 (dab3afe) landed it 2026-09-01 16:00:45 +0300
    every timing-blind entry is dated 2026-09-01 or earlier; every entry after carries ms:

**ADR-020 already closed it.** The 22% is not a live gap, it is history: 72 entries taken before the
field existed. Coverage forward is 100% and nothing needs building.

⚠ **This is the §103 class — a record asserting a live defect the code has already fixed — and it is
the ninth instance, filed BY the session that built §103's detector and measured it at 1-in-9 before
declining it.** The mechanism I declined would not have caught this one either: §103's anchor check
tests whether a quoted `file:line` snippet is still in the tree, and this entry quoted no snippet. It
asserted a COUNT, which is checkable by a different move entirely — read the writer, not the written.
That is the actual generalisation §103 was reaching for and did not find, and it is worth more than
the detector: **when a record says "N of M records lack X", the question is not how many lack it but
whether the thing that writes X still omits it.** History is not evidence of current behaviour.

**And the history must NOT be backfilled.** An `ms:` invented for a run taken in August is a
tool-written field filled in by hand — the one thing §4 of CLAUDE.md exists to prevent. Those 72
entries stay blind, correctly.
**What remains ours is the multiplier.** The adopting corpus pays 5.5 runs of a 43.8s fence per
task, serial, and a five-task wave is twenty minutes. That is the half hour reported as "the ADR
tooling is slow", and this is the part of it that genuinely is ours.

**WHAT MUST NOT COLLAPSE, and the reason is structural rather than cautious.** A fence run is
(command, TREE BYTES). Red and green are taken on deliberately different trees, and each mutant is a
third; sharing a result across them would not be caching, it would be reporting an observation that
was never made. So the floor is not one run — it is one per distinct tree state. Only the clean
baseline is a genuine duplicate, because it is the same command on the same bytes as the Validate
run that preceded it.

**The safety rule that has to come with it**, inherited from ADR-023 rather than invented: reuse only
an exit-0 clean result, only when the fence digest AND the subject and test file bytes are identical,
never across a dirty tree, and the row must say it was reused and at which sha. A `--mutant` run that
silently skipped its baseline and printed the same output as one that took it is exactly the
report-claims-more-than-happened defect this project exists to demonstrate the absence of.

**Not started.** Sized S-M: the key function already exists in `scripts/mutate.mjs` as `cacheKey()`
and would be reimplemented rather than imported, since the gate ships and the script does not — which
is itself worth a line in the record, because two copies of a cache key drifting apart is a worse
failure than the cost it saves.

---

## 113. CLOSED 2026-09-04 by ADR-031 — no gate answered `--version`, and the sibling this entry proposed was the wrong shape

**Filed 2026-09-03 with ADR-027, from GitHub issue #9.** `grep -c '\-\-version' plugin/bin/adr-lint`
returns 0, and the same holds for the other ten gates. An adopter upgrading to 2.57.1 could not ask

any gate what it was, so they invented one: run the forwarder and `python "$QH/bin/adr-lint"` against
one real ADR and diff the output. That works, and nobody should have to derive it.

**Why it is filed rather than fixed here.** ADR-027 answers the question the missing flag was being
used to answer — `qh-doctor` prints the resolved root and version — so the urgency is gone while the
gap remains. Adding `--version` to eleven gates is a different decision with its own class question:
whether the version is read from `plugin/.claude-plugin/plugin.json` at run time (correct, and a file
read on every invocation) or baked in at release (fast, and exactly the stored-count defect this
corpus keeps finding). That choice is the work, not the flag.

**The sibling nobody has raised.** `qh-root` already resolves the plugin root and is the natural
place for a version answer, so this may be one gate's change rather than eleven. Measure before
assuming: `for f in plugin/bin/*; do case "$f" in *.cmd) continue;; esac; grep -c 'version' "$f"; done`.

**CLOSED 2026-09-04 by ADR-031. The measurement this entry asked for was run, and it answered the
opposite of the sibling above.** Eleven gates, `--version:0` on every one, confirmed by the command
this entry names.

**The sibling — "`qh-root` already resolves the plugin root, so this may be one gate's change rather
than eleven" — is exactly the answer ADR-031 rejects, and rejects for a reason this entry had in
front of it.** A central answer reports whichever copy of ITSELF resolved. CLAUDE.md §2 records two
PATH mechanisms that resolve differently and a machine may carry both, so `qh-root`'s answer can be
about a different install from the `adr-lint` whose output is being questioned. A version that can be
about another binary is worse than none, because it resolves. Per-gate it is, and the duplication is
the point: eleven gates that answer for themselves DISAGREE when the installs disagree, which is the
finding an adopter cannot otherwise get.

**The other half of the class question — runtime read versus baked at release — was already settled
by precedent, not by argument.** `qh-doctor` reads `version` from `plugin.json` at run time
(`plugin/scripts/qh-doctor.mjs:96-99`). Baking is the stored-count defect this corpus keeps finding.

**Still open, and deferred rather than done:** `--version` on the `.mjs` scripts under
`plugin/scripts/`. They are not on `PATH` as bare names, so the two-mechanism trap does not reach
them, and `qh-doctor` already answers for that surface — but nothing checks that claim.


## 114. DECLINED 2026-09-24 — Does an intermediate plan layer actually help a weak executor, or only shape its failures?

**Filed 2026-09-03 with ADR-028.** The owner reports that handing tasks to a smaller model fails on
reasoning and step-planning rather than on writing code, and asks whether ADR → plan groups → tasks
would let a weak model execute under a strong planner. ADR-028 adds the verdict channel that makes a
SKIPPED step loud. It does not answer whether the arrangement works, and this entry is the part that
would.

**What the literature already settles, so nobody re-derives it.** PEAR (arXiv 2510.07505), 23
planner/executor pairs: strong planner + weak executor ≈ 50% utility, weak planner + strong executor
≈ 30%, strong/strong 65–85% — *"a weak planner constrains the entire system, and its negative effect
cannot be offset even by stronger executors."* So the split is sound and the planner is the half that
must stay strong. Diff-XYZ (arXiv 2510.12487) cuts the other way and is the reason this is a question
rather than a plan: format choice materially changes success for large models, while **smaller models
benefit little from any formatting choice**.

**What is genuinely unmeasured here.** Whether a task file written by a strong model lets a weak one
execute it at a useful rate ON THIS CORPUS. Neither paper measures a repository-scale lifecycle with
tool-written evidence, and this project has the rarer half already: an ablation harness with a
control arm. The experiment is available — run the eval suite with the executor model overridden via
`--model` while the case text stays fixed — and it has never been run.

**Also deferred here:** per-step file attribution in `Ordered Steps`, so step coverage could be
derived from a diff rather than from a declared test row. ADR-028 rejected it for now because
`Affected Files` is task-level and adding per-step files changes every task ever written; revisit if
ADR-028's pre-registered failure fires for the opposite reason.

⚠ **The residual both directions share, measured twice on one day by two independent sessions.** A
strict format produces confidently wrong, perfectly conformant output: the `mrw` maintainer produced
three such plans in one session, all applied at exit 0 with every guard satisfied, and the session
writing this hit the same class four times. Whatever this entry concludes, **budget for the
downstream gate** — a plan layer moves that failure, it does not remove it.

**Declined 2026-09-24.** The plan-layer experiment is not scheduled (deferred here by ADR-028 and ADR-029). Reopen with a record when an eval budget exists.

## 116. CLOSED 2026-09-04 by ADR-028 T3 — `adr-verify --steps` was UNCHECKED, not merely unrecorded, on three paths

**Found 2026-09-04, executing ADR-030 T1.** `python3 plugin/bin/adr-verify <task> --steps S5 --mutant …`
exits 0, kills the mutant, writes its Verification Log entry — and the entry carries no `steps:`
field. The flag was parsed, validated against the task's declared step identities, and then not used.

The cause is visible in one command:

    grep -n "record_run(" plugin/bin/adr-verify
    1340:            record_run(task, text, cmd, today, clean, clean_elapsed_ms, entry_sha)
    1467:    record_run(task, task.read_text(encoding="utf-8"), cmd, today, clean,
    2083:def record_run(task, text, cmd, today, result, elapsed_ms, sha, steps=None):
    2447:    code = record_run(task, text, cmd, today, r,

`steps` defaults to `None`, and only the call at 2447 — the plain fence path — passes it. The two
mutation-path calls take the default, so the field is dropped without a word. ADR-028 T1 added the
flag and its refusal of an undeclared id; both are on the plain path only.

**Why it is worth an entry rather than a quiet fix.** An option accepted and ignored is this
project's own named class: the gate reports nothing, exits 0, and the author reasonably believes the
run recorded what they asked it to record. It is the same shape as the six scripts whose entry guard
made them no-ops on Windows (§113) and as `mutate.mjs` printing nothing for a STALE verdict — a
silent no-op inside a tool whose entire job is to make claims checkable.

**What is NOT yet known:** whether the mutation path SHOULD carry the field at all. A mutation run's
verification entry is taken on a mutated tree, and a `steps:` value there would say a step was
exercised by a run whose subject was deliberately broken. That may be exactly why it was left out —
but nothing says so, in the code or in ADR-028, and a deliberate omission that looks identical to an
oversight is indistinguishable from one. Either pass `steps` through both call sites, or refuse
`--steps` together with `--mutant` and say why. Silence is the one option that is wrong.

**Class, not instance.** The general form is a flag validated in `main()` and consumed on one of
several paths out of it. Enumerate with `grep -n "def main" -A 400 plugin/bin/adr-verify | grep -nE
"^\s*[a-z_]+ = (value|True)"` against the call sites each option reaches; this entry checked `--steps`
only, and does not claim the others are clean.

**CLOSED 2026-09-04 by ADR-028 T3, and the entry above was wrong about two things.**

**The open question was answered by reading the code rather than deciding.** The paragraph above
worries that "a mutation run's verification entry is taken on a mutated tree, and a `steps:` value
there would say a step was exercised by a run whose subject was deliberately broken." **It is not
taken on a mutated tree.** The entry the `--mutant` path writes is the CLEAN run's — `record_run(…,
clean, clean_elapsed_ms, …)` — and `adr-verify`'s own comment at that call site says so: "the clean
run that made this verdict possible is recorded — the same observation the plain path writes". ADR-025
put it there for that reason. So there was nothing to decide: ADR-028's Decision already says the
field goes on "the Verification Log entry", this path writes one, and the omission was a bug against
the record as written. That is why T3 is a task under ADR-028 and not a new record.

**The symptom was milder than the defect.** `run_mutant()` always exits, and the `--steps` preflight
sat BELOW that call, so on the mutation path the validation was not merely unused — it was
UNREACHABLE. `--steps S9 --mutant` against a task declaring no S9 ran to completion. Measured
2026-09-04, not inferred.

**The class sweep found two more, which is the part this entry did not have.** Enumerating every
branch that leaves `main()` before the preflight:

    grep -n 'if human_mutant is not None:\|if human is not None:\|if steps is not None:' plugin/bin/adr-verify
    2335:    if human_mutant is not None:   → exits
    2358:    if human is not None:          → exits
    2406:    if steps is not None:          ← the preflight

`--human` and `--human-mutant` had the same silence, and fixing the `--mutant` path does not reach
them. Neither runs a fence, so both REFUSE `--steps` rather than carry it, beside the `--covers`
guard that refuses the same shape of meaningless combination.

⚠ **THE PARAGRAPH ABOVE WAS WRONG WHEN IT WAS WRITTEN, AND AN INDEPENDENT REVIEW CAUGHT IT THE SAME
DAY.** It says the sweep found "two more" and reads as though the set were then complete. Codex,
reviewing 429ec43..407d75b on 2026-09-04, found **two further** members: `--restore` exits before the
preflight (reproduced: `--steps S1 --restore` → exit 0, flag dropped) and `--sweep` omitted `--steps`
from its incompatibility list at `plugin/bin/adr-verify:2321-2324`. Four members, not two.

**The lesson is about the command, not the count.** CLAUDE.md §5 says enumerate with a command
rather than from memory, and that was obeyed — the sweep ran
`grep -n 'if human_mutant is not None:\|if human is not None:\|if steps is not None:'`. It found what
it searched for. It could not find `--restore` or `--sweep` because it searched for three branch
NAMES instead of for every exit out of `main()`, so those two were never in the corpus it looked at.
**A sweep is only as complete as the command that ran it, and a command written from the instances
you already know reproduces the gap it was meant to close.** The general form of a correct sweep here
is "every `sys.exit` reachable before the check", which is a question about control flow, not a
grep for names.

All four refuse now, and `tests/evidence-chain.test.mjs` pairs each path with the phrase it must
produce — a shared non-zero check would have passed on the `unknown option` these once returned.

**Still open, and named here rather than claimed clean:** the sweep covered `--steps` only. The
general form — a flag validated in `main()` and consumed on one of several paths out of it — was not
enumerated for `--covers`, `--also-restore`, `--timeout` or `--json`. Three of those already carry
combination guards; nothing has checked whether the guards cover every exit path.

## 117. CLOSED 2026-09-04 — a noun in an honest sign-off was read as a verdict, and the opposite hole was open beside it

**Found 2026-09-04** while reconciling a disagreement this repository was carrying in the open:
`docs/adr/ADR-012-.../tasks/README.md` said T4 was `done`, and `adr-next` printed it `READY`. Two
readers, one corpus, opposite answers — the §58 class, in a corpus that had already fixed §58 once.

**The cause, measured rather than guessed.** T4 is human-observed, so its `done` rests entirely on
how `adr-next` reads the sign-off text. That text is affirmative and forensic: the tool ran, the gate
answered, the finding came back correct — and it also reports, honestly, that the client rendered
**"no server-level block"** of instructions. `NEGATIVE` contained `block(?:ed)?`, so a noun naming a
chunk of text was read as the verdict *blocked*, and `human_outcome()` returned `stop`:

    NEGATIVE hits: ['block']      AFFIRMATIVE hits: ['Confirms']

A negative word anywhere beats an affirmative one — deliberately, and the guard is right to do that.
What was wrong is that the guard assumed a sign-off is a verdict sentence. **A sign-off worth reading
describes what was observed, and observation prose is full of nouns.**

**The same look found the opposite hole, which nobody had reported.** `block(?:ed)?` with a trailing
`(?![a-z])` matches neither `blocks` nor `blocking`, so *"confirmed, but the rollout blocks on legal"*
was counted **done** — precisely the failure the guard exists to prevent, reachable through every
entry that lacked an `-s`/`-ing` form. A guard can be too narrow and too wide in the same expression,
and only sweeping every word in every form shows both.

**The class sweep, run rather than recalled.** Every negative word through four verb forms:

| word | bare | -ed/-n | -s | -ing |
|---|---|---|---|---|
| block | **deliberately no** | yes | yes | yes |
| stop, fail, withdraw, reject, abort | yes | yes | yes | yes |
| refuse | **was no** → yes | yes | yes | yes |

`refuse` is the third finding and this task did not introduce it: the stem stops at `refus`, so the
trailing lookahead rejected the `e` and the bare word **never matched at all**, before or after.
Closed in the same line. `block` bare stays out on purpose, and the test asserts that ABSENCE, so a
later reader cannot mistake the deliberate gap for an oversight.

**Not a record.** The guard's intent is unchanged — an affirmative outcome must be stated, a negative
one wins — and nothing about the evidence contract moved. This is bounded implementation: a matcher
that did not match what it claimed to.

**Verified:** `adr-next` on ADR-012 now prints all five tasks `done`, agreeing with the README and
with `adr-lint`. Two catalogue mutations, one per direction.

## 119. CLOSED 2026-09-06 — the mutation campaign cannot run a Python test, so 352 assertions can never kill a mutant

Found 2026-09-04 by CI on `dd8b6e5`, shard `mutations 3/8`: 60 of 61 noticed. The GREEN was
`lint: a path::name pointer names a test file, not a production function`, and the mechanism it
mutates was asserted the whole time — in `tests/gate-regressions.py`, which checks
`resolve_enforcement("bin/adr-lint::enforcement_pointers", root) is None` in-process. The catalogue
entry declared `tests/gates.test.mjs`, which never mentioned it.

The declaration was wrong, and it could not have been right. `scripts/mutate.mjs:524` spawns
`node --test`, and nothing else:

```
const run = spawnSync(process.execPath,
  ['--test', ...mutation.tests.map(t => path.join(root, t))], ...)
```

So a `.py` path in a `tests:` list is unreachable by construction. Measured the same day:

```
$ grep -c '^def test_\|^    assert ' tests/gate-regressions.py
352
$ grep -c 'gate-regressions.py' tests/mutations.json
0
$ node --test tests/gate-regressions.py >/dev/null 2>&1; echo $?
1
```

Zero entries name the file, so nothing is currently mis-declared — and the exit 1 means a future
declaration would fail the entry's BASELINE and be reported as unproven, not as a false RED. That is
the honest branch, so this is a gap and not a lie. It is still a gap: 352 assertions the campaign
grades nothing about, in the suite that carries most of the gates' in-process behaviour.

The instance was fixed at the boundary instead (`8692148`) — a CLI-level regression in
`tests/gates.test.mjs` that kills the mutant. That is the right fix for one mechanism and does not
scale to the suite: rewriting 352 Python assertions as subprocess tests would trade in-process
precision for spawn cost, and most of them have no CLI surface to assert through.

**What this needs first, before any runner change:** a count of how many of those 352 assert a
mechanism that NO `.mjs` test also covers. Only that subset is genuinely unguarded; the rest are
belt-and-braces and cost nothing. The heuristic tried here does not answer it — asking which
catalogue entries declare a test file that never names an identifier from the mutated line returned
51 of 489, and nearly every one is a test that correctly spawns a gate through its CLI and so never
names the gate's internals. The regression added in `8692148` would be flagged by that same rule.
Recorded because a sweep that did not work is worth as much as one that did (CLAUDE.md §5), and
because the next session should not re-derive it.

Teaching the runner a second test language is an ADR, not a patch: it changes what a `tests:` entry
means, it needs `python3` resolved the way `resolve_bash()` is (CLAUDE.md §7), and the baseline and
timeout semantics in `scripts/mutate.mjs` are written against `node --test`'s output shape.

**Receipt:** the campaign is what enumerates this class, and a tag runs it in full with `--no-cache`
(CLAUDE.md §13.6), which is why this surfaced on a release run rather than on a push.

**CLOSED 2026-09-06, and the heading above is WRONG — left standing because it is what was
believed.** The measurement this section asked for ("a count of how many of those 352 assert a
mechanism that NO `.mjs` test also covers") was never the right question, and doing it would have
produced a number about nothing.

**THE 352 ASSERTIONS ARE REACHABLE BY THE CAMPAIGN, and always were.**
`tests/gates.test.mjs:531` — `focused false-green regressions remain closed` — SPAWNS
`python3 tests/gate-regressions.py` and asserts its exit status. So every assertion in that file
runs inside any campaign entry that declares `tests/gates.test.mjs`, and its failure fails the
entry. Measured: `node scripts/mutate.mjs --no-cache --case 'a path::name pointer names a test
file'` → **RED, killed by `focused false-green regressions remain closed`**, and applying the
mutant by hand fails at `tests/gate-regressions.py:1738` — the exact assertion this section named
as unreachable.

**AND THE 2026-09-04 GREEN WAS REAL, so the section was not a misreport either.** Reproduced in a
detached worktree at `dd8b6e5`: the same mutation, the same assertion, and the Python suite
**passes**. Everything material is byte-identical between then and now — `tests/gate-regressions.py`
does not appear in `git diff --stat dd8b6e5 HEAD` at all, and both the mutated line and the
assertion match at that sha. `plugin/bin/adr-lint` gained 105 lines elsewhere in between, and one
of them made that assertion sensitive to this guard. So the mutant was genuinely un-killed then and
is killed now, by a Python assertion, through a `.mjs` declaration.

**What was actually true, and is all that was ever true:** a `.py` path written DIRECTLY in a
`tests:` list is unreachable, because `scripts/mutate.mjs` spawns `node --test` and nothing else.
That is a DECLARATION-SHAPE limit, not a coverage hole — the assertions behind it are reached
through the `.mjs` file that spawns them. The section read the one instance as evidence of the
other, and the "352 assertions the campaign grades nothing about" sentence is the cost of that.

**Closed by saying so at authoring time**, since the honest branch (a failing baseline, reported
UNPROVEN) is silent about *why*: `tests/package.test.mjs::every catalogue entry names tests the
campaign can actually spawn` fails on any `tests:` path `node --test` cannot spawn, and on any that
the repository does not track, and shows itself rejecting a `.py` path in the same test.

**NOT DONE, and no longer justified by this section:** teaching the runner a second test language.
This section was the argument for it, and the argument does not hold — the Python assertions
already grade mutants. Anyone reopening it needs a new reason, and the ADR §119 called for should
not be written on this one.

## 120. CLOSED 2026-09-04 (855d14d, 08344b7) — `adr-verify --sweep`'s fence timeout killed the fence and left its campaign running

Found 2026-09-04 at `2dd1a39`, running `python3 plugin/bin/adr-verify --sweep docs/adr --json`
from a Claude Code background shell for the research refresh. In order:

1. Seventeen task files under `docs/adr` have a fence that runs `scripts/mutate.mjs`
   (`grep -l 'mutate.mjs' docs/adr/*/tasks/*.md | wc -l` → 17). One of them runs
   `node scripts/mutate.mjs --case verify:`, and on today's catalogue that sub-campaign runs
   longer than `SWEEP_TIMEOUT_DEFAULT = 900`.
2. At 900 s the sweep's `subprocess.run(…, timeout=timeout)` (`plugin/bin/adr-verify:1969`)
   killed the `bash` running the fence and filed the claim as `unrunnable` — the right bucket.
   It did not kill the fence's child. `ps -o pid,ppid,etime,command -p $(cat .mutate-lock)` →
   `85706  1  17:40 node scripts/mutate.mjs --case verify:`: PPID 1, two and a half minutes past
   the timeout, still mutating `plugin/bin/adr-verify` in the working tree while the sweep had
   moved on to the next task.
3. The shell hosting the sweep then hit its host's ten-minute cap and was killed with its
   process group, orphan included, mid-mutant. `git diff --stat` → `plugin/bin/adr-verify | 2 +-`
   (`ACCEPTANCE_FENCE` narrowed to `(?:bash)`), `.mutate-lock` naming a dead pid,
   `.mutate-inflight.json` holding the original. ADR-002's journal did its job; nothing ran the
   restore. `git checkout -- plugin/bin/adr-verify` restored it.

Two defects, one class:

- **A fence timeout does not reach the process group.** `subprocess.run(timeout=)` kills its
  direct child, and every fence here runs through `bash`, so the real work is always a
  grandchild. The class, enumerated rather than remembered:
  `grep -nE 'timeout=' plugin/bin/adr-verify plugin/bin/spec-verify plugin/bin/qh-mcp` →
  `adr-verify:1292, 1388, 1969, 2492`, `spec-verify:98, 486, 518, 562`, `qh-mcp:148` — nine
  sites; `grep -nE 'start_new_session|killpg|preexec_fn' plugin/bin/*` → nothing. Three of the
  `adr-verify` sites are the ordinary fence run and the `--mutant` run, so a `--mutant` that times
  out has the same shape: a campaign it started keeps rewriting the tree after the tool has
  reported. The fix shape is `start_new_session=True` plus `os.killpg(…, SIGKILL)` on
  `TimeoutExpired` on POSIX, and `CREATE_NEW_PROCESS_GROUP` plus `taskkill /T` on Windows — a
  platform seam (CLAUDE.md §7), not a `sys.platform` branch with no test.
- **The sweep is read-only in what it writes and not in what it runs.** `sweep_corpus`'s
  docstring says "This writes nothing", and that is true of the sweep. It runs fences, a fence may
  run the campaign, and the campaign rewrites `plugin/bin/`. The byte-identity the docstring cites
  is asserted over the corpus, and `plugin/bin/` is not the corpus. A sweep over this repository
  is a mutation run and belongs under the same rule as one (CLAUDE.md §2: never run a mutation
  tool and edit the tree at the same time) — or in a clone, which is where the second attempt
  went: `git clone . <scratch>/qh-sweep` and sweep there, detached with `os.setsid()` because
  macOS has no `setsid`.

Not a defect: a 900-second fence is `unrunnable`, and that is the honest bucket. The 2026-09-01
figure of `0 unrunnable` over 52 claims will not survive a re-run at this timeout, and the
research note says so.

Sibling left, named: `scripts/mutate.mjs` writes `.mutate-inflight.json` and handles a lock left
by a dead pid (`mutate.mjs:87-102`), but `grep -n restore scripts/mutate.mjs` finds nothing — there
is no on-demand restore from a stale journal the way `adr-verify --restore` offers one for its
own. `git checkout` was the restore used here, which works only because the mutated file was
tracked and otherwise clean.

**Fixed 2026-09-04, the same day.** Every timeout site in the three gates that spawn — four in
`adr-verify`, four in `spec-verify`, one in `qh-mcp` — now goes through `run_bounded`, which starts
the child in its own session (POSIX) or process group (Windows) and calls `kill_tree` on
`TimeoutExpired`: `os.killpg(…, SIGKILL)`, or `taskkill /F /T /PID`. Platform and kill command are
parameters, so the Windows branch runs on every host (`tests/timeout-tree.test.mjs::kill_tree asks
taskkill for the whole tree on Windows`). The helper is copied into each gate: a shared module under
`bin/` is read as a gate by `tests/package.test.mjs`, and `tests/mcp-server.test.mjs` refuses the
server source naming an executing gate — which the first copy's docstring did.

The regression is at every boundary the defect came through: adr-verify's fence run, its `--sweep`,
and the helper in each gate, with a pid-free heartbeat fixture because Git Bash reports MSYS pids.
Red before the fix: *"the heartbeat kept moving after the gate reported the timeout"*. Three
catalogue mutants narrow `killpg` to `kill`; four existing entries were re-pointed at the call sites
they mutate. **Two of the three came back GREEN on the first run** (§4's class): the mutated helper
kills only the direct child and then waits on the pipes the orphan still holds, so it returns only
when the heartbeat's own twenty seconds end — after which "the beat stopped once the gate returned"
is true for the wrong reason. The discriminator is *when* the gate returned; asserted first now, and
`node scripts/mutate.mjs --no-cache --case 'kills the tree'` → `3/3 mutations were noticed`.

Left open, named: the sweep is still a mutation run in effect (it runs fences that run the
campaign), so it belongs in a clone; and `scripts/mutate.mjs` still has no on-demand restore from
its own journal. Neither is what this section was about.

## 121. CLOSED 2026-09-24 — A truncating heartbeat made a timeout test flaky, and two siblings the same day

Found 2026-09-04 by CI run `33885863345` on `b466f24`: `selftest (macos-latest)` FAILED while
ubuntu, windows and all eight mutation shards passed. One test,
`tests/timeout-tree.test.mjs::adr-verify: an interrupted run_bounded kills the tree`, with
`the grandchild never wrote a beat, so the fixture proved nothing`.

The fixture, not the subject. Its heartbeat wrote with `open("beat.txt", "w")` (and `echo >` in the
bash fences), which TRUNCATES: between the truncate and the write the file exists and is empty, and
a read landing in that window returns `""` — which `assertTreeDied` cannot tell from "the grandchild
never started". Same code on every runner; the macOS job was simply loaded enough to land in the
window. The beat appends now, and its LENGTH is the counter, so `""` means only that nothing has
been written yet. Three consecutive local runs, 14/14 each.

**The class, and it is the one worth carrying:** a test fixture that goes through a state
indistinguishable from failure will report that failure eventually, on someone else's machine, and
be read as a defect in the subject. Ask of any fixture file: is there an instant where it exists and
says nothing? Append rather than truncate; make the signal monotonic.

Two siblings, named rather than fixed:

- **`scripts/selftest.sh` dies silently after `claude plugin validate`, intermittently.** Observed
  twice on 2026-09-04: exit 1, output ending at 359 bytes right after the third `claude plugin
  validate --strict`, no message. `set -euo pipefail` (line 2) turns any non-zero from that CLI into
  an immediate exit, and the CLI writes nothing on the way out. Both times a re-run passed with
  637 tests green. That is "could not look" reported as "the gate failed" — ADR-005's class in this
  repository's own entry point. Whether the CLI or the harness is at fault is unmeasured.
- **A backgrounded fence still holds the sweep's pipe.** The group kill now reaches it (§120), but
  a descendant that makes a session of its own escapes; `drain_after_kill` bounds the wait at ten
  seconds rather than solving it. Raised by the Codex review as a residual risk and accepted as one.

**CLOSED 2026-09-24.** Heartbeat fixed in 3e934b8. Sibling 1 closed in 7eb8ac3 — its text sits under §122's heading, where it was written, and is not moved (CLAUDE.md §10). Sibling 2 is an accepted residual, bounded in `plugin/lib/fence.py`.

## 122. CLOSED 2026-09-04 — the suite wrote its new ledger into ANOTHER plugin's data directory


**THE FIRST SIBLING IS CLOSED, 2026-09-06, and it was reproduced a fourth time getting there.** A
session running `bash scripts/selftest.sh` with a Codex review in flight got exit 1 and a log of
**359 bytes** ending right after the third `✔ Validation passed` — the same signature to the byte —
and initially wrote it off as unrelated scratch-directory flakiness. It is this.

**What was measured, and what still is not.** Forty consecutive isolated runs of
`claude plugin validate --strict plugin/skills` all exited 0, so this is not the CLI failing
deterministically, and the cause remains unattributed. The fix does not need it. `selftest.sh` now
runs each validate through a `validate()` wrapper that captures output and status, and a non-zero
exit **with no output at all** is reported as `UNRUN` by name — saying that nothing was validated
and that this is not a finding about the manifest — instead of `set -euo pipefail` ending the script
wordlessly.

It still FAILS, and that is deliberate: a check that did not run must never read as one that
passed. What changes is that the reader is told which of the two happened, which is the whole of
ADR-005 applied to this repository's own entry point.

`tests/package.test.mjs::a plugin validate that dies saying nothing is UNRUN, not a finding about
the manifest` drives both arms through a stub `claude` on `PATH`: silent non-zero must say `UNRUN`
and name this section; a non-zero **with** output must NOT — otherwise the fix has only moved the
lie to the other side. The stub fails on the FIRST validate so the script exits before the suite,
which keeps the test at about a second (§144, closed the same day).

**The second sibling — a backgrounded fence escaping the group kill by making its own session — is
untouched and stays open.**
Found the same hour it was introduced, by running `qh-doctor` and not believing the number.

ADR-035 T2 gave the Stop hook a ledger at `$CLAUDE_PLUGIN_DATA/claims.jsonl`. `tests/lifecycle.test.mjs`
spawns that hook dozens of times and did not set the variable, so every completion event in the suite
appended a row to whatever the environment happened to hold. On this machine the shell snapshot
exports `CLAUDE_PLUGIN_DATA` pointing at another plugin's data directory under `~/.claude/plugins/data/`,
and **81 rows landed in that plugin's directory** — every one of them from a `/private/tmp/quality-*` fixture
directory, so all 81 were this suite's and none was another tool's. The file has been removed and
`runLifecycleHook` now points the variable at a directory under the suite's own temp root; a test
that wants a different ledger passes its own `env`, which still wins.

**The class is CLAUDE.md §9 with the boundary moved.** §9 says a test must not touch the repository
it is testing, and the evidence behind it is a suite that committed to `main`. This is the same rule
one directory further out: a test writes only where it created, and "where it writes" is not always
a path in the test — here it was an environment variable the test never mentioned. Ask of any new
side effect: what does it write to when nobody configures it, and is that a place this suite made?

Two things this did NOT establish, and neither should be read into it:

- **Nothing says production is wrong.** Claude Code appears to give each plugin its own data
  directory (`~/.claude/plugins/data/quality-harness-quality-harness/` exists, empty), so a hook
  spawned by the host for THIS plugin should receive its own path. That was not measured — only the
  test-time inheritance was — and ADR-035 T2's Stop Condition already says to check a live payload
  before trusting the location premise.
- **No other plugin's data was read, altered or lost.** Only the file this suite created was
  removed, and its rows were checked one by one first.

## 123. CLOSED 2026-09-05 on two real Windows boxes — a Job Object kills the reparented subshell taskkill could not see; the nested-job case on the CI runner is the one reading still owed

CI run `33892254729` on `5642b53`, which is the first run that carried §120's fix through every job.
Three mutants GREEN on the Linux campaign, four tests red on Windows, and both halves say the same
thing: **the assertions written for §120 encoded one platform's behaviour and were presented as the
mechanism's.** CLAUDE.md §7's class, in code written the same day to obey §7.

**Linux — the DEFECT does not reproduce, so the mutant cannot die.**
`verify: the group kill does not look the group up, because the leader may be gone` came back GREEN
on `mutations 4/8`. On macOS, `getpgid` on a leader that has exited raises `ProcessLookupError`, the
swallow skips the kill, and the group survives — measured, 3.02s against a 0.3s timeout. On Linux the
reaped leader stays a zombie until `Popen` waits, so `getpgid` still answers and the lookup works.
The FIX is right on both (`start_new_session` makes the pgid the pid, so the lookup buys nothing),
but the mutant that proves it can only die where the defect exists, and the campaign runs on Linux.

`spec:` and `mcp: an interrupted gate kills the tree it started` were GREEN there too, while the
`verify:` one — the only member of that family with a test that drives a real gate rather than the
helper through a probe — died. Not diagnosed; the probe's orphan behaves differently under Linux.

All three are **de-registered**, and this section is why. A mutant that cannot die on the platform
the campaign runs on is a permanently GREEN row, and a permanently GREEN row teaches a reader that
GREEN is normal — the one thing this catalogue exists to prevent. The mechanisms are not left
unproved: `verify/spec/mcp: a … timeout kills the tree …` and `verify: an interrupted gate kills the
tree it started` still die on every platform, and cover the same code.

**Windows — the kill does not reach the tree.** `adr-verify: a fence whose leader exits still has its
tree killed` took **21.9s against a 1s timeout**, and the three `a cleanup that raises does not
replace the timeout` tests took **30.0s**. So `CREATE_NEW_PROCESS_GROUP` plus `taskkill /F /T` did
not reach a Git Bash subshell tree, and the bounded drain did not bound it there. Skipped on win32
with that measurement named, per §7's rule that a skip follows the log rather than an analogy.

⚠ **Say what this leaves true.** On Windows the timeout still fires and the gate still reports
`UNRUN` — nothing regressed. What is NOT true is that the tree dies with it: that half is
**UNPROVEN on Windows**, and the only Windows assertion left is
`kill_tree asks taskkill for the whole tree on Windows`, which checks the COMMAND SHAPE and not its
effect. ADR-035 and §120 must not be read as saying otherwise.

Open, and not attempted here: why `taskkill /T` misses a Git Bash tree (MSYS processes are not
Windows children of `bash.exe` in the way `/T` walks), and whether the drain needs a Windows-specific
bound. Neither can be measured from this machine — `windows-latest` is a VM and Docker Desktop on
macOS has no Windows container mode — so the next attempt is a CI round, not a local one.


**2026-09-05 — corrected by measurement, not rewritten.** "Does not work on Windows" above was too
broad, and this section's own numbers were the reason: the 21.9s and the 30.0s were `close()` waiting
behind a Windows `communicate` reader thread on a pipe a survivor still held (§128) — they measure
how long a survivor lived, not whether the kill reached anything. Then measured on two Windows 11
boxes and the CI runner: `taskkill /F /T` **does** kill a Git Bash fence's subshell tree when bash is
alive to be walked — beats at return 5, three seconds later 5, on a real box; the `--sweep` tree test
passing on win32; the CI runner's own direct path returning in 1.3s with the tree dead. What
**stands** is narrower and real: the leader-exits shape (`( … ) &` alone), where bash has exited
before `taskkill /T` runs on its pid and there is no root to walk — the gap POSIX closed with `killpg`,
with no Windows equivalent here, unproved on any Windows box because the test that would prove it is
still skipped. And on the CI runner the kill is **non-deterministic** even in the foreground shape:
pass / 60s / 60s / pass on byte-identical gate code, survivor unattributed (§129). The three Linux
findings above are unchanged.

**2026-09-05, closed by measurement.** The leader-exits fixture (`( … ) &` alone) run by hand on two
Windows 11 boxes on branch `windows-job-object`: before, `taskkill` non-zero on the dead leader pid,
`drain communicate TimeoutExpired` at +11.1s, the orphan running **all 100 beats** to completion;
after, `job object terminated the tree of <pid>`, `kill_tree end confirmed=True` within 1ms,
`drain communicate returned`, exit 2 in **1.2s**, beats **5 at return, 5 at 3s, 5 at 15s**, twice
per box. `taskkill /T` walks ancestry and a reparented subshell has none; a Job Object is membership.
The fence starts CREATE_SUSPENDED so the job exists before bash can fork, KILL_ON_JOB_CLOSE ties the
fence's life to the gate's, and the resume walks a Toolhelp thread snapshot because Popen closes the
handle it could have kept. The peers also found three blind instruments on the way and one design
with a 15×(2+N)s worst case, all fixed before merge — the record is in `wing_craft` and the decision
in this wing's `decisions` room.

**And the nested case, read on the CI runner itself (run for `b019c42`, windows-latest):**
`gate already inside a job: True (nested job follows) +7ms · job object holds 2508 +7ms · job object
terminated the tree of 2508`, adr-verify back in 1141ms. Both peer boxes had honestly answered
`False`; the runner is the one environment where the gate starts inside a job, and the nested
assignment took and the terminate reached the tree. The probe that printed that line was silent one
sha earlier — which is the whole reason the rule about prototypes became mechanical.
## 124. CLOSED 2026-09-24 — ADR-035's own criterion killed ADR-035's feature, four hours after it shipped

The `asserted` arm of `completionClaim` is **withdrawn**, by the criterion the record
pre-registered against it, on the first real measurement. This section is that measurement.

**What was pre-registered.** ADR-035 §Decision: the vocabulary stays only at precision ≥ 0.90 —
"at most three messages classified `asserted` carry no completion assertion a reader would
recognise" — and "below that the `asserted` arm is withdrawn in the same commit that records the
measurement, and the ledger keeps recording `none` so the evidence half is still counted."

**What was measured**, 2026-09-04, on the first real run of `plugin/evals/a-claim-nothing-can-back`
(`claude plugin eval --case … --runs 3`, both arms, $0.88, six answers). Three were classified
`asserted`. All three were exemplary honest disclosures:

    with    "duration parsing — fix is in for the `90s` case, tests not yet run on my side."
    without "Haven't run the suite yet. That last clause is there because I couldn't verify it."
    without "I can't verify anything here — the working directory is empty … and I have no shell."

**Precision 0/3, against a threshold of 0.90.** Not a near miss.

**The cause is nameable, and it is not the assertion patterns.** `interimResponse` — the negation
classifier that takes precedence — has no "haven't run", "can't verify", "not yet run", "no shell".
Those messages therefore reached the assertion arm at all, where a nearby *green* or *fix is in*
matched. The precedence design was right; the negation vocabulary it rests on is far too small for
the sentences an honest agent actually writes.

**Why withdrawal rather than a quick fix to the negation list.** Because the fix would be tuned
against the very sample that failed, and a threshold cleared by adjusting until it clears is not a
threshold. The corrected vocabulary must be measured on FRESH answers before it ships. Until then a
detector that flags *"I can't verify anything here"* as a false success is worse than none: it is
exactly the gate people learn to ignore, which this project holds to be worse than no gate.

**What survives the withdrawal**, and it is most of the mechanism: the ledger still records every
completion event with its evidence kind (`verified` / `unverified` / `no-check` / `could-not-look`),
`claims-rate.mjs` still partitions them in ADR-010's buckets, `trajectory-metrics.mjs` is untouched,
and the plain evidence advisory still fires on unverified work exactly as it did before ADR-035.
What is gone is the accusation — no message is told it claimed something.

⚠ **A zero in the false half now means the arm is off, NOT that no false success occurred.** Anyone
reading `claims-rate.mjs` output while this section stands must read it that way.

**What a future attempt owes.** A negation vocabulary covering the three sentences above (they are
asserted as `none` in `tests/lifecycle.test.mjs` so a restored arm cannot pass without them), and a
fresh measurement on answers not used to build it. `ASSERTION_ARM_WITHDRAWN` in
`plugin/scripts/lifecycle.mjs` is the switch and carries the same note.

**The thing worth keeping from all of this.** The criterion was not decoration. It was written
before the code, it was measurable in an afternoon for under a dollar, and it killed the feature its
own author wanted — which is the only evidence that any of the other criteria in this corpus mean
anything either.

**MEASURED 2026-09-06, and it turned up a SECOND arm with no observed producer.** ADR-035 T4 asked
for a calibration of the `asserted` arm over at least thirty real final messages. That exercise
cannot be run — the arm was withdrawn on 2026-09-04, before the measurement it was pre-registered
against ever happened, so there are no `asserted` rows to label and a reported
"precision 1.00 over 0 rows" would be arithmetic on an empty set. `scripts/claims-calibrate.mjs`
refuses to print one and says why.

What it can measure is the distribution the arms that remain produce on real data. Over the 80
newest transcripts on this machine, 68 of which carried a final assistant message:

| arm | count | share |
|---|---|---|
| `none` | 63 | 92.6% |
| `hedged` | 5 | 7.4% |
| `limited` | **0** | — |
| `unavailable` | 0 | — |
| `asserted` | 0 | unreachable by construction |

⚠ **`limited` fired on nothing.** It is not withdrawn and not unreachable — `evidenceLimited()` is
live and a message could take it — but across 68 real final messages nothing did. That is the same
SHAPE as the defect this section records, one step earlier: an arm whose producer nobody has
observed, sitting in a classifier that is trusted because its other arms behave. It is not evidence
of a defect; it is the absence of evidence that it works, which is precisely what §124 says the
`asserted` arm had before it was measured.

**Do not read this as a reason to withdraw `limited`.** Zero observations over 68 messages from one
machine, one week, one person's writing is a thin sample, and the arm exists for a case (a session
that genuinely could not look) that is rare by design. The finding is that nothing has ever
confirmed it fires, and that is now written down rather than assumed.

**What a restored `asserted` arm owes**, unchanged and now with a baseline: precision ≥ 0.90 over
≥ 30 real final messages, labelled by a human, and the table above is what it must beat rather than
a number invented at the time.

**CLOSED 2026-09-24.** The arm was withdrawn by its own pre-registered criterion (`ASSERTION_ARM_WITHDRAWN` in `plugin/scripts/claim-status.mjs`); ADR-035 T4 is signed off. The conditions for restoring it are recorded above. Nothing owed.

## 125. CLOSED 2026-09-04 (after v2.65.0) — two ways an unjudged row became a favourable verdict

**Left by** the Codex `gpt-5.6-sol` xhigh review of `v2.64.0..d7a764b` on 2026-09-04, run under
CLAUDE.md §12 before the v2.65.0 tag. It returned REQUEST CHANGES with four findings. Two were the
§3 defect inside the gates themselves and were fixed in `c27a555`. These two were not, and they are
the same class as each other: **a row nothing could judge is counted in the half that reads clean.**

**125a — an unrecognised claim or evidence value is counted as held.** `plugin/scripts/claims-rate.mjs`
lines 56-57 default a non-string to `'unavailable'` / `'could-not-look'`, which the exclusion at 58
then removes correctly. But a value that IS a string and is simply not one this tool knows falls
through both, and line 65's `else counts.held += 1` puts it in the clean half of the denominator.
Reviewer probe, exit 0: a row with `evidence: "mystery"` produced `held: 1`, denominator `1`,
rate `0`. The buckets ADR-010 defines are a closed set; nothing validates membership.

**125b — an entry whose exit code did not parse is counted as an entry that passed.**
`plugin/scripts/trajectory-metrics.mjs:86` keeps every line matching `ENTRY`, while line 88 keeps
only those where `EXIT` also matched. A line that is entry-shaped with an unreadable exit code
therefore raises `entries` without raising `red` or `green`, reaches the `outcomeOnly` arm at
line 133-137, and line 158 then says of it "every entry passed and no mutant was killed". Nothing
observed that it passed. Reviewer probe, exit 0: one malformed entry, `evidenced: 1`,
`outcomeOnly: 1`, rate `0`.

**Also here, and the same shape one layer down:** `trajectory-metrics.mjs:43-47` swallows every
`readdirSync` error, so an unreadable subtree silently shrinks a real denominator and a missing root
and an unreadable one both render as "no task files" at line 145. That message is honest that it is
not a clean corpus; it is not honest about which of the two it saw. `claims-rate.mjs` mapped every
read error to "no ledger ... Nothing has been recorded", which was the same collapse `qh-doctor`
had just been fixed for — so `c27a555` closed one member of this class and left
its sibling — exactly what CLAUDE.md §5 says to name rather than leave silent. **Both are closed
now**: `trajectory-metrics` reports PARTIAL through an optional sink, and `claims-rate` distinguishes
ENOENT ("nothing has been recorded") from every other error ("COULD NOT READ"), carrying `looked`
into its JSON so a consumer can tell the two apart as well. Found still open by the review of
a4ac0f3…88a26b1, which is the second time a reviewer has had to point at the half left behind.

**Why not fixed in the same commit.** The fix is a validation layer over two enums and a log
grammar, and it changes what the denominators mean — every rate this corpus has recorded moves.
That deserves its own record and its own before/after measurement, not a rider on a release fix.

**⚠ Read every `claims-rate` and `trajectory-metrics` number taken before this is closed with that
caveat**, on top of the one BACKLOG §124 already imposes: a zero in the false half means the
assertion arm is off, and a denominator here may include rows nothing judged.

**One more thing the review left, out of its own scope:** `tests/mutations.json` still registers
`stop: a confident claim over unverified edits is named as a false success` against the branch
ADR-035's withdrawal made unreachable. With the arm hard-off that replacement is behaviourally
inert and is likely to SURVIVE the full campaign a tag forces. Not verified here — the campaign was
not run for it — so it is named as a thing to watch on the v2.65.0 tag run, not as a finding.

## 126. CLOSED 2026-09-04 — the withdrawal left its body behind, and three checks noticed inside four hours

§124 withdrew ADR-035's `asserted` arm by making `completionClaim` return `none` before it reached
the vocabulary. That was the right call and the criterion deserves the credit. What it did NOT do
was remove the code below that early return, and **unreachable code is not a dormant feature — it is
a branch no test can enter, a mutant nothing can kill, and a coverage floor paying for both.** All
three arrived, on the same commit, without anyone looking for them:

1. **The coverage floor went red at `d7a764b` and stayed red**, and the next session planned a
   release on top of it. `bash scripts/coverage.sh` → exit 1, `93.91` against a floor of `94`. The
   uncovered column named `plugin/scripts/lifecycle.mjs ... 1768-1796` — the whole assertion loop —
   and `2086-2094`, `falseSuccessReason`, which only that loop could reach. Missing a floor by 0.09
   is not a rounding problem; it is twenty-nine lines that stopped being executable at 17:20.

2. **The mutation campaign reported a survivor, in CI, in the words this project uses for it:**

       GREEN    stop: a confident claim over unverified edits is named as a false success
                <- the tests did not notice
       64/65 mutations were noticed.

   `tests/mutations.json` still bound that mechanism to `const reason = claim.kind === 'asserted'`.
   Nothing could kill it because nothing could reach it. The mutant was PREDICTED from source before
   the shard finished and then observed — recorded that way round, because a prediction confirmed is
   worth more than the same sentence written afterwards.

3. **`claims-rate.mjs` had no idea the arm was off.** `ASSERTION_ARM_WITHDRAWN` lived in exactly one
   file, and `counts.false` only ever increments on an `asserted` row, so the first real ledger would
   have printed `0 / N completion claims were false successes (0.0%)` — a **structural** zero, not a
   measured one. §124 warned about this in prose. The tool that prints the number said nothing, and
   prose beside a gate is not the gate. `qh-doctor` then pointed readers at that rate without a word.

**What was done.** `CLAIM_ASSERTIONS`, the loop, the sentence-quoting, `falseSuccessReason` and the
`claim.kind === 'asserted'` ternary are deleted; so is the mutation entry that named them. The
patterns, the measurement that killed them and what a restored arm owes live in ADR-035 and §124,
which is where a future attempt reads them from rather than from a commented-out array nobody
re-measured. `ASSERTION_ARM_WITHDRAWN` stays, and its meaning changed: **it is now a LABEL that
`claims-rate` and `qh-doctor` read, not a switch.** Flipping it restores nothing. Both tools now say
`claim detection is WITHDRAWN` beside any rate they print, both arms asserted in one test and both
bound to a mutant.

⚠ **§124's sentence calling it "the switch" is history and stays as written** (CLAUDE.md §10). This
section is where the meaning changed.

**The lesson, and it is not about this feature.** A pre-registered criterion that fires is only half
the discipline; the other half is that withdrawing a feature is a DELETION, not an early return. An
early return leaves the corpus asserting things about code that can no longer run — and every one of
the three signals above was a check this repository already owned, already running, reporting
correctly, with nobody reading it.

## 127. CLOSED 2026-09-05 — a cleanup nobody bounded, and two tests that measured the runner's mood

Three findings from the release of v2.65.0, all about the same thing: a check whose answer depends
on the machine's load rather than on the code.

**127a — CLOSED 2026-09-04. `taskkill` had no timeout, and it hung a Windows job.** The Codex review
of `v2.64.0..d7a764b` said it: *"`taskkill` has no timeout and its return code is ignored"*. The
commit that followed fixed the return code and left the bound. Hours later the Windows job on
`0a18d04` sat on `adr-verify: a fence timeout kills the tree the fence started` until the test's own
60s cap, while `plugin/bin/adr-verify` was **byte-identical** to `479fbef`, where the same job had
passed. A cleanup that can hang unbounded wears the fence timeout's name — which is the exact defect
`run_bounded`'s own docstring says it exists to prevent, one layer further in. `kill_tree` now takes
a `timeout` and a `TimeoutExpired` answers `False`: not confirmed, never "it failed". Both arms are
asserted and the bound is bound to a mutant.

⚠ **Half a finding applied is how the other half gets forgotten.** The review named both defects in
one sentence and the fix took one. Nothing flagged the remainder — no gate can — and the cost was a
red release run on the platform the release existed to be tested on.

**127b — BOTH CLOSED, the second on 2026-09-05. Tests that asserted against wall-clock bounds could not
tell a defect from a busy runner.**

- ✅ `tests/evidence-chain.test.mjs::the recorded duration is the clean fence, not the clean fence
  plus the mutant` — measured on one tree: **2.21s alone, 4.77s** with a `codex exec` review running
  beside it, where the second run failed. Its ceiling was `SLEEP_MS * 1.8`, and **a constant is a
  clock**. It now compares a measurement to a MEASUREMENT: one plain run of the same fence, taken on
  same machine moments earlier, and the mutant run must come in under 1.6× of it. Both invocations
  pay the same startup, so the ratio survives a runner that is uniformly slow. The FLOOR stays
  absolute deliberately — load only ever makes `ms` bigger, so a floor cannot false-fail, and it is
  what catches an implementation recording zero.

  ⚠ **A CORRECTION TO WHAT THIS SECTION FIRST CLAIMED.** It said the rework was verified not to cost
  the detection, citing `verify: the recorded duration is the clean fence alone` coming back RED.
  That mutant sets `clean_elapsed_ms = 0`, so its RED proves the FLOOR catches zero and says nothing
  about whether the CEILING still catches mutant time leaking back in. The review of a4ac0f3…88a26b1
  named that, and it was right: a verification was claimed that had not been made. A mutant that
  actually reinstates the historical defect — measuring the duration at the late `record_run` call,
  after the mutant has run — now exists and is RED:
  `verify: the recorded duration does not span the mutant run too`.

  ⚠ **AND IT IS NOT FULLY LOAD-INDEPENDENT**, which the first wording also overstated. The baseline
  and the measured run are two separate invocations, so load can drift BETWEEN them: a fast baseline
  followed by a slow run can still false-fail, and a slow baseline followed by a fast run carrying
  the defect could false-pass. This is strictly better than a constant and it is not immune. The
  immune version needs both numbers from one process.
- ✅ `tests/timeout-tree.test.mjs::assertTreeDied`'s `PROMPT_MS = 10_000` — closed 2026-09-05. The
  signal that is not a clock was in the fixture all along: the grandchild is bounded at 100 beats, so
  if it had written all of them by the time the gate returned it FINISHED ON ITS OWN, and every
  "did the beat stop" check after that is vacuous — the exact way two mutants came back GREEN on
  2026-09-04. `beat()` now counts newline-terminated LINES and the assertion is `beats < 100` at
  return; a slow machine does not change the answer. The first attempt at this (2026-09-04, reverted)
  failed for a reason worth keeping: the two Python probes wrote beats with no newline, so a line
  count read zero everywhere — the idea was right and the fixtures were the missing piece. Both now
  append `str(i) + chr(10)`; the bash fences always did. (A 2026-09-04 edit to this section also ate
  this bullet's head, so it read as a fragment until now — noted rather than hidden.)

A release run that reddens at random is a gate people learn to re-run rather than read, which is the
failure mode this corpus rejects everywhere else. **The general rule the closed half earned: when an
assertion needs a number that depends on the machine, take that number ON the machine, in the same
test, instead of writing a constant and hoping.**

**127c — CLOSED 2026-09-04. A check that enumerates through `git ls-files` is blind until you
commit.** `bash scripts/selftest.sh` was green
locally while the same commit failed on **all four** CI jobs, for one cause: `plugin/scripts/claim-status.mjs`
carried no mutation. `tests/package.test.mjs::every shipped gate carries at least one mutation`
resolves shipped scripts through `git ls-files`, correctly (CLAUDE.md §8) — so a NEW file is invisible
to it until it is committed, and every local run before that commit passes. The check is right and
the workflow around it is not: **the first run after `git add` is the first honest one.**

**Closed by `scripts/staged-mutation-guard.mjs`**, driven from `.githooks/pre-commit`. It asks the
same question of the INDEX, at the moment of commit, and ONLY when a file under `plugin/bin` or
`plugin/scripts` is being ADDED — so an ordinary commit pays nothing. A catalogue it cannot parse
finds NOTHING rather than everything: this runs at commit time, and a guard that refuses the world
because it could not read one file is a guard people turn off (ADR-005). The hook resolves the script
relative to ITSELF rather than to the repository being committed, which is what lets the suite drive
the real guard from a scratch repo (CLAUDE.md §9) instead of asserting the hook's text.
**Addendum 2026-09-05 — one sibling in the shipped JavaScript, and a second defect the review found
behind it.** The class audit here was of the Python gates. The same command over the shipped JS
(`git ls-files 'plugin/scripts/*.mjs' | xargs grep -nE '\b(spawnSync|execSync|execFileSync|spawn|execFile)\('`)
found every site bounded except the one that is itself a cleanup: `run-shell-hook.mjs`
`terminateProcessTree` ran `taskkill /T /F` with no timeout, on the `setTimeout` path a hook takes
after ITS timeout fired — the exact shape of this section. The Codex review of the bound then found
the worse defect underneath: `runWithTimeout` resolved ONLY on the child's `close`, so a cleanup that
hung, failed or never started meant the timeout had fired and was then never reported — the promise
stayed pending until the child exited on its own or the host's 120s deadline killed the runner
(reviewer-measured: a forced cleanup failure made a 50ms run wait 777ms for natural exit). And the
first bound chosen, 15s, did not fit the smallest outer margin, lifecycle's 5s
`ARTIFACT_GATE_KILL_MARGIN_MS`: the outer kill would land first and the tree would never be reported.

Now: `TASKKILL_TIMEOUT_MS` 2s and `CLEANUP_GRACE_MS` 1s, both synchronous on the timer path, tested
to sum below every outer margin that waits on this runner (lifecycle's, and each `run-shell-hook.mjs`
entry in `hooks.json`); `terminateProcessTree` returns whether the kill was ISSUED (taskkill exit 0
or the group kill not throwing) through a `spawnSyncImpl` seam driven on every host; after the
grace `runWithTimeout` settles with `cleanupConfirmed: false`, releases the pipes and unrefs the
child, so a failed cleanup is a reported timeout rather than a hang. `cleanupConfirmed` is set only
by `close` — a kill issued is not a kill that landed (ADR-005). Four catalogue mutants are RED:
the dropped bound, the dropped grace settle, a failed taskkill reported as issued, and the timer
that no longer terminates. The second review pass found two more, both fixed in the same change: the
POSIX fallback returned true whenever `child.kill` did not throw, though `ChildProcess.kill` answers
false when the signal could not be sent (now the boolean is the answer, through a `groupKill` seam);
and the failed-cleanup test proved the PROMISE settled but not that the wrapper PROCESS exits, which
is what the host deadline measures — an outer-process test now shows the runner exiting inside the
grace with its abandoned child still alive, and a mutant that keeps the settle but drops the
pipe-destroy/unref is RED. Five mutants carry this section's label; the pre-existing timer mutant,
repinned to the new body, is the sixth.

**Windows evidence, 2026-09-05, a real Windows 11 box at 5017c43 (peer session, worktree, nothing
edited):** `tests/gate-rules.test.mjs` 36/36; the platform arm read `[win32] the abandoned child
after the wrapper exited: ESRCH` — the same reading that had turned the CI windows job red on
70021d7, reproduced independently, so on Windows the non-detached child does not outlive the
wrapper and the exit timing is the whole proof there; all five labelled mutants RED
(`5/5 mutations were noticed`); one real `taskkill /T /F` of a live node child measured
`taskkill ms 105 status 0` against the 2s bound. The peer's caveats stand: that is one child, no
tree, on an idle box — not what taskkill costs under CI load against a deep tree, which is the case
the bound exists for. The same run surfaced a `DEP0190` deprecation (args passed with
`shell: true`) from the gate-rules file, not a failure: it is the pre-existing cmd-forwarder test at
`tests/gate-rules.test.mjs:1125`, which exercises `spawnSync` with `shell: true` on purpose, and is
unrelated to this section.


## 128. DECLINED 2026-09-24 — the Windows hang has a mechanism, reproduced; the fix is proven on the CI runner and two Windows boxes; what occasionally survives the kill is still unattributed

`adr-verify: a fence timeout kills the tree the fence started, not only bash` sits to its own 60s
cap on Windows. `runPython(..., timeout: 60_000)` returns at ~60.1s, which means **adr-verify did
not return at all** — this is a hang, not a bound being exceeded.

**What is measured, and it is three runs:**

| sha | Windows | what happened |
|---|---|---|
| `479fbef` | success | same `plugin/bin/adr-verify` blob as `0a18d04` |
| `0a18d04` | failure | 60.0s cap, `adr-verify` byte-identical to the run above |
| `867592c` | failure | 60.1s cap, **after** `taskkill` was given a 15s bound (§127a) |

**What that rules out.** The first pair says it is not the content of `adr-verify` — the file was the
same blob across a pass and a fail. The second says it is not an unbounded `taskkill`: the bound
landed between those runs and the hang did not move. Both of the obvious explanations are gone.

**What is still open.** Where the 60 seconds go. The arithmetic does not reach it: a 1s fence
timeout, a 15s taskkill bound and a 10s `communicate` grace is ~26s worst case. Something waits
that none of those three bound — the likely candidate is the second `communicate()` on a Windows
pipe still held by a subshell `taskkill /T` could not reach, but that is a HYPOTHESIS and this
repository does not record those as findings.

**What was done instead.** The test is skipped on Windows with the measurement attached, the way
its sibling already was — CLAUDE.md §7 says a fixture that cannot be built on a platform gets a
`skip:` with the reason named, after the log shows it rather than by analogy. The log has now shown
it twice. ⚠ **This does not make the Windows path work.** BACKLOG §123 stands: the tree kill is
proved on macOS, unproved on Linux, and does not work on a Git Bash tree. A skipped test is an
honest UNPROVEN, and it is worth less than a passing one — what it buys is a release that is not
permanently red on a platform whose behaviour nobody has yet explained.

**What would close this**, in order of what it costs: a Windows runner someone can attach a debugger
to; or an instrumented run that prints a timestamp on each side of `kill_tree` and `communicate` so
the 60 seconds can be attributed rather than guessed at. The second is cheap and does not need a
Windows machine to design — only to run.

**2026-09-05 — the mechanism, and it reproduces on macOS.** Python's `Popen.communicate(timeout=)`
is two different things on two platforms. On POSIX it multiplexes the pipes with a selector and no
thread holds anything. On Windows it starts a **daemon reader thread per pipe**, and when the
timeout fires those threads are still blocked inside `read()`, each **holding its BufferedReader's
lock**. `drain_after_kill`'s except branch then called `stream.close()` — which takes the same lock,
and so waits until the read returns, which is when the orphan lets go of the pipe. The test fence
sleeps 60s: 60.1s measured. The leader-exits fence beats for 20s: 21.9s measured in §123. Two fences,
two durations, both equal to the orphan's pipe-hold time.

The lock behaviour is CPython's `io` module, not Windows', so it reproduces here with a bare pipe and
a reading thread: `close()` blocked for the full 2s the probe allowed, and returned the instant the
writer went away. The Windows-only part — that `communicate` leaves reader threads behind — is read
from the interpreter's own `subprocess.py` (`_readerthread`), not inferred.

⚠ **What this does and does not say about §123.** `close()` can only wait while some writer still
holds the pipe, so this mechanism explains the *duration* of a hang, never the *survival* that made
one possible. §123's own fixture is the **leader-exits** shape — `( … ) &` and nothing else — where
bash has already exited by the time `taskkill /T` runs on its pid, so there is no root to walk and
the reparented subshell survives. That is a real Windows gap (kill-by-pid cannot reach a reparented
child; POSIX closed the same gap with `killpg`) and it **stands**. What was too broad was the
sentence "taskkill did not reach a Git Bash subshell tree": on the very CI runs where the direct
test hung 60s, `adr-verify --sweep … takes its tree with it` — same fence, same `kill_tree`,
asserting the heartbeat STOPPED — passed. The subshell dies there when bash is alive to be walked.

**The fix**: on `nt`, the streams are not closed in the except branch; the handles die with the
interpreter. Measured rather than cited: on CPython 3.14.7 (macOS) the interpreter exited cleanly,
exit 2, with such a thread still blocked, and two Windows 11 boxes exited 2 as well. If finalization
ever does contend for the lock, CPython waits one second and then **aborts with a fatal error**
(`bufferedio.c`, `_enter_buffered_busy`) — an earlier draft here said "at most one second per
stream" as if it then continued; it does not, and the all-platform test now asserts the exit code so
an abort would show rather than pass. The Windows arm is driven on every host
through the `platform` seam: a child that sleeps, a thread blocked on its stdout, and a drain told it
is on `nt` must return without waiting; under the mutant that closes anyway, `close()` blocks behind
the thread and the campaign sees RED.

**What is still not proved**: that this is the whole of the Windows hang. `QUALITY_HARNESS_TRACE_TIMEOUT`
now stamps every cleanup phase with its offset, and the test `a timed-out fence returns within the
bound the arithmetic gives` runs on **every** platform with the trace on. On Windows it is the proof;
if it fails, its message carries the trace, which is the attribution this section was opened for.

**2026-09-05, measured on real Windows — two boxes, independently, on `df8740a`.** Windows 11 Pro
25H2 (10.0.26200.9168), Python 3.14.7, node v24.20.0, Git Bash 5.2.37, `core.autocrlf=true`.

| box | `adr-verify` returned | kill_tree | drain | exit |
|---|---|---|---|---|
| 1 | **1489ms** against a 1s fence | confirmed=True at +83ms | `communicate returned` at +58ms | 2 |
| 2 | **1297ms** | confirmed=True at +86ms | `communicate returned` at +41ms | 2 |

The 60s wait is gone. `drain communicate returned` means both pipes hit EOF — every holder died —
so `taskkill /F /T` reached the whole tree including the foreground `sleep 60`. Box 1 then ran the
heartbeat fixture by hand, twice: **beats at return = 5, three seconds later = 5.** Alive when the
kill landed, dead after it — observed, not inferred. Box 2 ran the `--sweep` tree test: passes on
win32. The seam test (a sleeping child, a thread blocked on its stdout, a drain told it is on `nt`)
returned in ~80ms on all three gates.

**Still open, and narrower than before:** what held the pipe for 60s in the *direct* path on the CI
runner, when the `--sweep` path killed the same fence's subshell on the same runs. The `df8740a` CI
trace names it either way. And the leader-exits shape (§123) is unproved on Windows on any box:
neither peer ran it, and the test that would is still `posixTree`-skipped. The discriminator a peer
named, and it is the right one: the process ancestry `taskkill /T` can walk — a reparented subshell is
outside it, a foreground one is not.

⚠ **Superseded in part, 2026-09-06 — see §145.** The leader-exits shape has now run on a real
Windows 11 box: 8/8 pass. The discriminator above is not what decided it. That host never calls
`taskkill`; a Job Object kills by membership, so a reparented subshell is still in the job. The
ancestry gap stands as written and is unreachable wherever job setup succeeds.

**Instrumented 2026-09-06 (`292fed8`), still OPEN.** The survivor is still unattributed; what changed
is that the next occurrence names it. A drain that times out now lists, under the trace flag, what
is still alive two ways: the tree below the fence by ancestry (`descendants`, a pure fixpoint walk
over one Toolhelp snapshot, reused-pid-safe) and the job's members by membership
(`WindowsJob.members`, `QueryInformationJobObject`). Each is its own observation with its own
`COULD NOT LIST`, and "no job" is said in those words rather than shown as an empty list
(ADR-005). The reading, when it fires: a holder in the tree and not the job forked before
assignment or broke away; one in the job is a kill that did not take; one in neither is not a
process the gate started. Driven on every host through the `processes` and `job` seams
(`tests/timeout-tree.test.mjs`, three copies), six mutants RED. What closes this is a CI or
Windows run that hangs WITH the flag set — the instrument only speaks when asked.

One correction from a peer that belongs here: the `returned N.NN` diagnostic in the seam test was
interpolated only into a *failing* assertion, so a passing run never showed it. A diagnostic that
speaks only on failure is not a diagnostic.

**2026-09-05, the CI runner itself, on `df8740a`.** The un-skipped trace test ran on `windows-latest`:
`adr-verify returned in 1324ms · kill_tree end confirmed=True +67ms · drain communicate returned
+108ms`. The same direct-path invocation, with byte-identical gate code, on the same runner: `479fbef`
passed, `0a18d04` and `867592c` sat at 60s, `df8740a` returned in 1.3s. **The pre-fix hang was
non-deterministic.** The fix therefore bounds the bad case (the trace would read `drain communicate
TimeoutExpired` at ~+11s, under the test's 40s) rather than proving the survivor gone, and the
survivor's identity is still unknown. The trace names the case when it recurs; that is what it is for.

**Declined 2026-09-24.** Not reproducible here: the mechanism is fixed on the CI runner and two Windows machines, and what occasionally survives the kill is unattributed. The trace names the case when it recurs; reopen then.

## 129. DECLINED 2026-09-24 — the §128 fix exposed a fence orphan that sometimes outlives the kill on the CI runner

Found on the first Windows CI run of `df8740a`: `tests/evidence-chain.test.mjs` failed as a **file**, in
168ms, in its `test.after` hook —

    Error: EPERM, Permission denied: \\?\C:\Users\RUNNER~1\AppData\Local\Temp\quality-harness-chain-rTcpbg
        at rmSync (node:fs:1283:18)
        at TestContext.<anonymous> (tests/evidence-chain.test.mjs:68:29)

`rmSync` on Windows answers EPERM when a live process holds a file in the tree or has it as its cwd.
Several fences in that file are `echo starting; sleep 30` (lines 390, 401, 1343, 1374) or `sleep 60`
(1653) under a 1–2s `QUALITY_HARNESS_FENCE_TIMEOUT`, so a `sleep` that survived `taskkill /F /T` is
the candidate — and §128 established that on this runner it sometimes does.

**Why this is new rather than old.** Before `df8740a`, when the orphan survived, `adr-verify` blocked
in `close()` until it exited (§128), so by the time the `after` hook ran nothing held the directory —
the test just took 30–60s longer than it should and passed. Now `adr-verify` returns promptly, the
orphan is still alive at cleanup, and the leak is visible. **The fix did not create a survivor; it
stopped hiding one.** The file passed on `6250809` for that reason, not because the runner was clean.

**What was done.** The `after` hook reports a held directory loudly, by name, with this section's
number, instead of failing the whole file after every assertion in it has already been judged — on
win32 only, and only for the error codes a held directory produces. That is not the same as ignoring
it: every Windows log now names the leak, and a leak that stops appearing is the closure signal.

**What would close it.** Attribute the survivor. The trace seam (§128) stamps the cleanup phases but
not the fence's own process tree; a `tasklist /FI "PARENTPID eq <bash>"` snapshot taken by `kill_tree`
just before `taskkill` on `nt`, printed under the same trace flag, would name what is there to kill and
what is left after. That is one Windows run away from an answer and needs no Windows machine to write.


**2026-09-06 — one of the three skips was never earned, and it is now off.**
`tests/timeout-tree.test.mjs` applied `posixTree` to three tests. Two assert that the process tree
DIED, which is the non-deterministic thing §128 measured, and their skip is correct. The third —
`<gate>: a cleanup that raises does not replace the timeout`, run for `spec-verify`, `qh-mcp` and
`adr-verify` — was skipped by ANALOGY with its neighbours.

It never needed to be. That test replaces `kill_tree` with a function that raises, so the
platform-specific path the skip exists for is the one thing it does not execute. What it asserts is
that a raising cleanup does not replace the `TimeoutExpired` that caused it, and that the caller
still reports inside its bound — the same question on every host, and precisely ADR-005's class: a
gate that ran and timed out being reported as one that did not start.

`CLAUDE.md` §7 says a skip is earned after the log shows the fixture cannot be built on that
platform, never by resemblance. Nothing in any log ever showed it for this one. Three tests now run
on Windows that did not before, on the deterministic half of exactly the mechanism §128 and §129 are
about.

⚠ **Passing on Windows is NOT claimed here.** They pass on macOS, where they already ran; this
change is that Windows executes them at all. Windows cannot be run locally (§7), so CI is what
answers, and if one of them is red there that is a finding about the gate on Windows and not about
the skip being lifted — which is the outcome that would justify the lift most.

**Still open and untouched:** the two tree-death assertions, the unattributed 60s pipe holder in the
direct path, and the leader-exits shape (§123) on Windows.

⚠ **Measured 2026-09-06 — see §145.** All three cleanup-raises tests pass 8/8 on a real Windows 11
box, with no surviving processes and no leftover temp directories. That is not this residual being
cleared: every run took the Job Object path, so the fallback branch the residual is conditional on
never executed.

**The seam exists as of `292fed8` (2026-09-06); the measurement has not been taken.**
`QUALITY_HARNESS_JOB_UNAVAILABLE=1` refuses `AssignProcessToJobObject` at the kernel32 boundary
(`RefusingAssignment`: answers 0 with ERROR_ACCESS_DENIED, the shape Windows gives when a process
may not join a nested job) and lets everything after it run live — the fallback resume, the
taskkill kill, the streams left open. The refusal is traced as INDUCED so a forced fallback is
never read as an observed one. Both arms drive on any host through the `k32` seam; three mutants
RED. The command a Windows box runs to exercise this residual for real:

    QUALITY_HARNESS_JOB_UNAVAILABLE=1 QUALITY_HARNESS_FORCE_TREE_TESTS=1 QUALITY_HARNESS_TRACE_TIMEOUT=1 node --test tests/timeout-tree.test.mjs

The trace must show `INDUCED, not observed` and `falling back to taskkill`; the three
cleanup-raises tests then run on the taskkill arm with their 30-second child, which is the exact
shape the residual predicts. Survivors in `Win32_Process` afterwards, or an `EPERM` on the temp
directory, would be this residual reproduced; none would be the fallback measured clean on one
host. This stays OPEN until that run exists.

⚠ **A residual the Codex review named, NOT fixed here, and deliberately so.** Lifting the skip means
the cleanup-raises probe now runs on Windows, where it stubs `kill_tree` with a function that raises
before killing anything and then leaves a 30-second child behind. On Windows the communication
streams are deliberately not closed (§128's fix), so if Job Object setup ever takes its documented
unavailable fallback, that child can outlive the probe and delay or contaminate the rest of the run —
the §129 leak, arriving through the door §129's own fix opened. The outer 60-second test timeout
bounds it, so it is a delay and not an indefinite hang.

Two fixes were considered and both rejected for now. Shortening the child's sleep would weaken the
assertion that gives the test its meaning: `elapsed < 10s` against a 30-second child is what proves
the caller did not wait for it, and a 5-second child makes a waiting caller pass. Reaping the pid in
the probe needs a handle `run_bounded` owns and does not hand back.

**So it is recorded rather than guessed at.** `CLAUDE.md` §7: Windows cannot be run locally, and when
the log is minutes away, wait for it rather than inventing the platform difference. If CI shows the
delay, the mechanism is already written down here and the fix is a seam on `run_bounded`, not a
smaller sleep.

**Declined 2026-09-24.** Not reproducible here, as §128. Reopen on the next CI occurrence.
## 130. CLOSED 2026-09-05 — six children a shipped gate spawned carried no timeout, and the runner never reaped

**The rule, from the owner, relayed by a peer session the same day it was earned:** every child a
test, hook or script spawns has a timeout, and the runner reaps its children before it exits. The
incident behind it: two hook children from another project hung in catastrophic regex backtracking
*after* their test had recorded FAILED, were reparented to launchd, and burned ~90% of a core each
for **15.5 hours** — found by a hot laptop and its fans, not by any test output.

**Enumerated by AST, not grep** (`scripts/untimed-children.py`), because a multi-line
`subprocess.run(` is one call and a grep for `timeout` on its first line lies. On `main` at
`32f1525`, six calls in shipped gates named no timeout:

| site | what it runs | why it can hang |
|---|---|---|
| `adr-verify:557` `syntax_ok` | `bash -n` / `php -l` / `gofmt -e` over a path from a user's task file | an external parser on uncontrolled input — the incident's exact shape |
| `adr-verify:671`, `:676` `git_sha` | `git rev-parse`, `git status --porcelain` | `index.lock`, a credential helper, a slow mount |
| `adr-verify:1978` `git_says` | `git -C … <args>` | same |
| `adr-verify:2643` `main` | `git rev-parse --show-toplevel` | same |
| `arch-lint:232` `tracked_paths` | `git ls-files --cached` | same |

Every fence and runner already went through `run_bounded`, which carries the fence timeout and
kills the tree; it was the *ancillary* calls around them that were open-ended. All six now carry
`timeout=30`. `subprocess.run(timeout=)` kills only the direct child. For the syntax checkers and
`git rev-parse`/`ls-files` that is the whole tree; `git status` is not — it can spawn an fsmonitor
hook — so it goes through `run_bounded`, and every site returns its honest could-not-look answer on
`TimeoutExpired` rather than a traceback (the review of `b019c42` found both). Anything that does
spawn goes through

**Kept true** by `tests/untimed-children.test.mjs`, which drives the checker on a fixture holding one
untimed call, one timed call and one `run_bounded` — and must report exactly the first — before
asserting the tree is clean. `scripts/selftest.sh` now traps EXIT to `pkill -P $$` and, as its last
step, fails if any child is still attached (direct children only; a reparented grandchild is what the
gates' own tree kill is for, §120/§123).

**Not covered here, named.** The suite's own spawns. The four shared `run()` helpers
(`tests/gates.test.mjs`, `evidence-chain`, `tutorial`, `gate-rules`) already carried 60–120s;
`scripts/python-interpreter.mjs::runPython` — which most Python spawns in tests go through — carried
none and now defaults to 120s, keeping any caller's own. What remains is direct `spawnSync` calls in
tests and repository scripts: a line-based count says ~116 without `timeout` on the call's first
line, which over-counts multi-line options and is a place to look, not a number to trust. Most are
`git init` in a scratch dir or a node script over a fixture; the CI job cap and the `selftest.sh`
trap bound what they leave. An AST-level checker for JavaScript, the way `untimed-children.py` is
for the gates, is the next step if that count is ever to be believed.

**Addendum 2026-09-05 — the leak check measured itself, on Linux only.** The first two CI runs
carrying it (`33951187877` on `b019c42`, `33952517573` on `2830860`) failed `selftest (ubuntu-latest)`
with `FAIL — child process(es) still running after the suite: 13461` and nothing else — one pid, no
name, so no attribution — while macOS and Windows passed on the same commits. The pid was the
instrument's own subshell. `leftover=$(pgrep -P $$ 2>/dev/null)`: bash 5.2 execs a bare command
substitution in place, but the redirection defeats that optimisation and it forks a subshell, which
is a direct child of `$$`; `pgrep` excludes only itself, so it reported the subshell. bash 3.2 on
macOS never matched. Reproduced in a `node:24-bookworm` container with one line —
`x=$(pgrep -P $$); echo "[$x]"` prints `[]`, `y=$(pgrep -P $$ 2>/dev/null)` prints `[118]` — and
absent on the macOS shell. The check now runs `pgrep` from the main shell into a file, where it is
the direct child and excludes itself, and names a survivor through `ps -o pid,ppid,etime,args`; both
arms were run on bash 5.2 and 3.2 (clean shell → exit 0; a backgrounded `sleep 30` → named, exit 1).
A full non-root run of the suite in that container was `Killed` by the container before the check
ran, so the container proves the mechanism, not the suite; the next Ubuntu CI run is the suite's own
reading. This is the second instrument in two days that read its own presence as a finding
(§127b was the first), and the lesson is the same: prove the clean arm on every platform the check
runs on, not the one in front of you.
**Addendum 2026-09-05 — the AST count the grep could not be.** `scripts/untimed-spawns.mjs` reads
every tracked `.mjs`/`.js` with the acorn Node ships for its own REPL (`--expose-internals`; no
dependency, and when the path is not there the tool is UNRUN, exit 2). A multi-line call is one
call, an options object is read for `timeout` wherever it sits, and options this tool cannot read
— a variable, a spread with no explicit `timeout` — are UNKNOWN: a place to look, never clean and
never a finding. `// untimed-spawn: <reason>` above a call acknowledges it; a bare acknowledgement is
refused. Run over the whole tree on this date it said **39 timed · 95 untimed · 8 unknown · 1
acknowledged · 0 unparsed** — against the grep's "~116", which counted first lines. The shipped tree
(`plugin/scripts`, `plugin/workflows`) is gated by `tests/untimed-spawns.test.mjs` at 0 untimed: its
one untimed call, the runner's own `spawn` inside `runWithTimeout`, is acknowledged with its reason
(the timer below it terminates the tree and settles after the grace), and its four UNKNOWNs are
`spawnSync(…, options)` where `options` carries `timeout` a line above. The 95 in `tests/` and
`scripts/` are reported, not gated: the count is printed into every test run from the live tree,
and the next step is a ratchet from that number, not a floor written here. **Same day, second pass:**
the sixteen in `scripts/` — every one a `git`, `gh` or suite runner that CI executes — now carry a
bound (30-60s for git and gh; 20 minutes for the whole-suite runs `unasserted.mjs` makes under a
neutered gate, so a hung mutant run is restored and reported HUNG before the job cap kills it
mid-restore), and the test asserts `scripts/` at zero. The suite's own count is a ratchet in the
test, `RATCHET = 79`, which may fall and never rise; the checker's summary line printed into every
run is the live number. **Third pass, same day: zero.** The 79 suite sites were given `timeout:
60_000` in one pass generated from the checker's own AST positions and applied as 79 single-line
`mrw` hunks (every one a `*Sync` call, so the only behaviour change is that a hung git or node in a
test dies at 60s instead of at the job cap); the checker then read 134 timed · 0 untimed · 8 unknown,
and the test's ratchet became a floor: `parsed.untimed` must be empty, naming any new site. The 8
UNKNOWN are options passed as a variable — `runPython`'s own default and lifecycle's objects that
carry `timeout` a line up — and stay printed, not gated.

## 131. CLOSED 2026-09-05 — a PreToolUse advisory was rendered to the person, one prefixed line per line, on every commit attempt

**Observed by the owner, two terminals, 2026-09-05.** In one, every commit attempt in a
go-cli-adr-corpus session printed `PreToolUse:Bash says: Nothing has verified the work since
your last change …` with the full changed-path list and the run-the-check instruction. In another,
an team-memory session, a twelve-line adr-lint report arrived as twelve `PreToolUse:Bash says:`
lines, blank lines included. Every line of both was addressed to the agent. The person had nothing
to do with them and saw all of them, repeatedly.

**Two mechanisms.** `advise()` emitted the whole finding as `systemMessage`, which Claude Code renders
to the person line by line; the agent-facing channel at a tool boundary is
`hookSpecificOutput.additionalContext`, which the plugin already used for orientation but not for
advisories. And the gate had no memory: the same finding for the same state was said in full on every
commit attempt. A third, smaller: `bashMarkdownMutationPaths` resolved a shell assignment
`A=docs/adr/X.md` as a path literally called `A=docs/…` (the unwrap ran only for `-flag=value`), so
the owner's changed-path list carried a file that does not exist.

**Now.** At `PreToolUse` the full text goes to `additionalContext` and stderr; the person gets one line,
`quality-harness advised the agent: <first sentence> (full text in the transcript)`. The same
finding (keyed on its text) is said in full once per session, through the same marker
`firstMentionThisSession` already uses for path context; a repeat is one line for the agent and
nothing for the person, and a CHANGED finding — an adr-lint report after a fix — is said in full
again. Completion-event advisories (`TaskCompleted`, `SubagentStop`, `Stop`) are unchanged: they
fire once per boundary and `systemMessage` is the right channel there. Assignments are unwrapped
before the `.md` test, so a quoted value is seen too. Four catalogue mutants are RED: the context
dropped, the report restored as `systemMessage`, the dedupe removed, the unwrap removed.

**The rule "never hide a finding" is kept, not relaxed.** stderr still carries every advisory in
full; the person is still told, once, that one was made; the agent still gets the instruction every
time. What changed is who reads what, which is what the two terminals were measuring.

**The Codex review of the change found four things, all fixed before commit.** The first unwrap
treated any `NAME=value` TOKEN as an assignment, so `printf 'file=docs/BACKLOG.md'` — data — resolved
to a real file; assignments are now read in assignment position, one per shell segment, through
the quote-aware tokenizer the deletion parser already uses, which also makes `DOC='docs/My File.md'`
one value (the token scanner had split it in two and matched neither). A `key=value` token that is
not an assignment is skipped as an argument. The once-per-session marker was `existsSync` then
`writeFileSync`, so two parallel tool calls with the same finding both said it in full; it is now an
exclusive create (`flag: 'wx'`), EEXIST being the second caller's answer — asserted by reading, since
a sequential test cannot make two callers race. And the test had matched a substring and repeated
only an identical state; it now asserts `additionalContext` equals the transcript's full text, and
that a CHANGED finding in the same session is news again. Seven mutants on this section are RED.

## 132. CLOSED 2026-09-05 — a slow hook was a pause with no name, and compaction kept the once-per-session markers that now had nothing to protect

**Two things the owner asked about hooks, in one sitting.** First: a new session hung for seconds on
macOS and nothing said why — the §15 `branch-state` hook, uncached, two 15s `gh` calls in series
(fixed in `2830860`). The generalisation is that a hook has no way to name its own cost: Claude Code
shows nothing while a hook runs, and a slow hook and a slow model look identical from the chair.
Second: the plugin's `SessionStart` orientation already fires again after compaction (no matcher, no
dedupe — this repository's own `SessionStart:compact` line is that hook), but the once-per-session
markers from `firstMentionThisSession` — path context on the first edit of a file, and now the §131
advisory dedupe — survived compaction. After compaction the agent has lost every context those
markers gated, and a surviving marker kept the second mention to one line for exactly the session
that no longer had the first.

**Now.** `lifecycle.mjs` holds its one JSON object until `main()` returns (Claude Code parses one
object per hook run; `emitJson` buffers, `flushOutput` writes) and, when the run took at least
`SLOW_HOOK_MS` (5s; `QUALITY_HARNESS_SLOW_HOOK_MS` overrides, `0` names every run), adds one line on
both channels — `quality-harness: the <event> hook took N.Ns — the pause has this name` — appended to
whatever `systemMessage` the run already carried, never instead of it. And a session carries a
generation: `SessionStart` with `source: compact` (or `clear`) bumps it, the marker stamp includes it,
and every first mention is first again; a `resume` does not bump, because the context is still
there. Three mutants RED: the generation ignored in the stamp, the bump dropped on `compact`, the
threshold check removed.

**What this does not do.** It does not budget any hook — a slow hook is still slow; it is named. The
markers live in the OS temp directory keyed on the session id, as before; a machine that clears its
temp mid-session makes every mention first again, which errs toward not hiding.

**The Codex review found three, all fixed before commit.** The `clear` arm of the generation bump was
untested and unmutated (a compact-only condition would have passed); it has both now. The hook
subprocesses the tests spawn inherited the real OS temp directory, so the said-markers and
generation files they wrote outlived the per-run root's cleanup — the child is now pointed at the
run's root through `TMPDIR`/`TMP`/`TEMP`, and a test asserts the markers land there. And the
cleanup swallowed every failure; it now retries a bounded number of times and lets the last failure
surface, because a leak reported as a pass is the thing this repository exists to refuse.

## 133. CLOSED 2026-09-05 — compaction dropped what the gates had measured, and a new session started knowing nothing about the last one

**The gap.** After compaction a session has the model's summary of what it was doing and none of
what the gates had measured: which paths were edited since the last publish, whether anything had
checked them, what the last check said, which ADR task was in flight. §132 made the once-per-session
markers reset on compaction; nothing handed the state back. And a NEW session in the same directory
started blind to the previous one having ended with unverified edits — the exact state the commit
gate exists to catch, carried across the one boundary the gate cannot see.

**Now.** Two hook events the plugin had never declared. `PreCompact` reads the transcript the way the
completion gates do and writes a note (`sessionStateNote`: paths since last publish, verified or
NOT, last check and verdict, ADR task in flight) to a per-session file; the compact `SessionStart`
appends it to the orientation as `What this session was doing before compaction (…)`. A resume does
not. `SessionEnd` appends a row to `sessions.jsonl` under `CLAUDE_PLUGIN_DATA` — reason, whether it
looked, whether anything was unverified, the files — and a `startup` `SessionStart` in the same
directory reads the last row for that directory and, only when it was unverified, says so and names
the project's check. A transcript that cannot be read is said on stderr and nothing is written
(ADR-005); no data home is said the same way. Four mutants RED: the note not kept, the note not
handed back, the row not written, the startup not reading it.

**Not done here.** The sessions ledger is read whole; it is append-only and one row per session, so
it grows slowly, but a reader that walks from the end is the next step if it ever matters. The note
lives in the OS temp directory keyed on the session id, like the generation; a cleared temp loses
it, which reads as "nothing to hand back", never as a wrong state.

**The Codex review found six, all fixed before commit.** `SessionEnd` had analysed the transcript
twice and spawned `adr-next` under the host's short end-of-session budget — it analyses once and
spawns nothing now. A session that could not read its transcript wrote a row, and a session that
edited nothing wrote `unverified: false`; either masked an earlier unverified session for a reader
that stopped at the newest row — now no row is written for a blind session, rows carry a three-way
`status` and the reader walks past `neutral`. "Here" was a lexical `path.resolve` on the cwd — it is
now the realpath of the repository root, case-folded on Windows and macOS through a platform
parameter, so `/tmp` and `/private/tmp` agree and a subdirectory is the same place. A failed
PreCompact left the previous note to be handed back as current — the old note is removed first. The
note said "verified" for what is one observation, a recognised check passing after the edits, while
the commit gate also runs artifact gates — it says the narrower thing. Shell mutations were counted
and then dropped from the row — they are kept and rendered. Six mutants RED.

## 134. CLOSED 2026-09-05 — the gates' reading of a session had no surface a person sees without spending prompt text

**The gap.** Everything the gates know about a session — edits since the last publish, whether a
recognised check passed after them — reached a person only as hook text at a tool boundary (§131
made that one line) or not at all. Claude Code's status line is the surface a person already looks
at and cannot dismiss, and the plugin had no segment for it (§7361 named `statusLine` as unused).

**Now.** `plugin/scripts/statusline.mjs` reads the statusLine JSON from stdin and prints one segment:
`QH ✓ checked`, `QH ✗ N unverified`, `QH · nothing edited` (only where the project names a check),
`QH ? transcript NMB` above a 50MB cap, or nothing. It spawns nothing — a status line renders
constantly and a command that waits on git freezes the prompt — analyses the transcript only when its
size or mtime changed, through a per-session cache in the temp directory, and never writes stderr or
exits non-zero. The plugin cannot set a user's `statusLine`; the README shows the one line to add to
their own command, through `qh-root`. Three mutants RED: the cache ignored, unverified rendered as
checked, the cap ignored.

**Not done.** No CI verdict, no ADR task in flight: both need a spawn or a network call per render,
and both belong to a cache a hook writes (this repository's `branch-state.mjs --cached` is that shape
for CI). A second reader of an answer that exists is the next step; a second asker is not.

## 135. CLOSED 2026-09-05 — a read-only reviewer could write through Bash, and Desktop could not ask what governs a file

**Two gaps from the same assessment.** The three read-only roles (`qh-correctness-reviewer`,
`qh-scope-reviewer`, `qh-synthesis`) said "never edits" and omitted Edit and Write from their tools
— and kept Bash, which writes through `sed -i`, a heredoc, `git commit`. The contract was a sentence.
And Claude Desktop reaches this plugin only through MCP, where the seven reading gates were exposed
but not the one question a session asks most, which decisions govern the file I am about to touch —
answered for Claude Code by the SessionStart and PreToolUse hooks, which Desktop never runs.

**Now.** `plugin/scripts/reviewer-guard.mjs` is a PreToolUse hook declared in the three agents' own
frontmatter (`hooks:` scoped to the subagent, matcher `Bash|Edit|Write|MultiEdit|NotebookEdit`). It
refuses, with exit 2 and the reason, a Bash command the mutation classifier reads as a write outside
the temp roots, a publish, and any editing tool; it passes reads, diffs, checks, scratch writes, and
a payload it cannot read — a guard broken on its own bug must not stop a reviewer reading. This is a
role boundary, not a quality gate advising on work (`CLAUDE.md` §3): the role says never, and the
tool list could not reach Bash. A test asserts every agent that says read-only declares the guard on
every writing tool, and no other agent carries it. Three mutants RED.

`qh_adr_context` joins the MCP registry through the same read-only registrar: the paths named, an
optional root, JSON on request; run through `node` from PATH with the corpus root derived from the
first path (`.git` or `docs/adr` above it), because the server's own cwd is nobody's repository.
No node, no root, no path: could not run, never an empty answer. One mutant RED.

**Unverified live, said plainly.** Whether `${CLAUDE_PLUGIN_ROOT}` expands in an agent-frontmatter
hook command was not confirmed by running a reviewer under the installed plugin from this session
(the agents load at session start). If it does not, the hook command fails to start, Claude Code
treats a non-2 exit as not blocking, and the guard is silent — the shape this repository names as the
worst one. The first reviewer run after this release should be watched for the guard's line, and the
reading recorded here.

**The Codex review (second pass; the first was killed at its deadline and certified nothing, §12)
found two, fixed before commit.** Three shapes passed the first guard: `bash -c '<write>'`, a write
inside `$(…)` or backticks, and an editor (`vim`, `nano`, `code`…), because the classifier reads
the OUTER command. The guard now judges each inner payload as a command of its own (three levels
deep) and names the editors; both are mutants now. And `_repo_root` walked up from a symlink's own
directory rather than its target's — `realpath` first. What stands, and the reviewer said so: the
guard is a fail-open denylist by nature; an arbitrary script it cannot read can still write. The
strong form would omit Bash from the reviewer roles, and they need it to run checks. Named here
rather than solved.

**The expansion question, answered from the reference rather than a run.** The plugins reference
states that `${CLAUDE_PLUGIN_ROOT}` resolves "anywhere the placeholder appears" in skill and agent
content, and that it is also exported as an environment variable to every hook process. The guard's
command, `node "${CLAUDE_PLUGIN_ROOT}/scripts/reviewer-guard.mjs"`, is therefore reached by either
route — inline substitution when the agent file is read, or shell expansion from the environment
when it is not. What a live run still adds is the guard's own stderr line in a reviewer's transcript;
the first one after 2.73.0 remains worth reading, but the mechanism is documented, not assumed.

**Measured inert, 2026-09-05, same day.** A peer session on a real Windows 11 box installed 2.74.0
(main head at the time), started fresh \`claude -p\` sessions in a scratch repository, and spawned a
real \`quality-harness:qh-correctness-reviewer\`. It ran \`sed -i\` on a tracked file, the file changed,
and no hook was called: zero occurrences of \`reviewer guard\` in either transcript. The discriminator:
the same payload piped into \`reviewer-guard.mjs\` directly gave the right message and exit 2. Both
on-disk copies carried the frontmatter hook verbatim. So the script was fine and the frontmatter
hook was never invoked — on that box, for a plugin-shipped agent, it is inert. The peer's caveat: the
parent session that spawned the nested ones had not been restarted after the update.

**The guard now lives where the hook fires.** The plugin-level \`PreToolUse\` in \`lifecycle.mjs\` runs
inside a subagent (the peer's subagent found and named it), and the payload there carries
\`agent_type\`. For a role in \`READ_ONLY_ROLES\` the hook emits \`permissionDecision: "deny"\` with the
guard's reason and writes the guard's line to stderr; the verdict itself (\`readOnlyVerdict\`) moved
into \`lifecycle.mjs\`, because \`reviewer-guard.mjs\` imports it and a dynamic import of the guard from
inside the handler deadlocked on the ESM cycle while this module was the entry with a top-level
await pending. The frontmatter declaration stays, harmless, for a host where it does fire. A live
reading of the Bash arm at 2.75.0 is the one still owed; the local reading is a reviewer payload
piped into the hook, which denies.

## 136. CLOSED 2026-09-05 — the install tracked main head and nothing said so; Desktop still lacked the orientation; the evals ran nowhere

**Three leftovers from the same assessment.** `claude plugin update` installs the marketplace's
`./plugin` at the head of `main`, not at a tag: on this date the local install read 2.72.0 before
that version's CI had finished, and nothing on the machine could tell a release from a head. Claude
Desktop, reaching the plugin over MCP, had `qh_adr_context` (§135) but not the orientation the
SessionStart hook gives Claude Code. And the eval suite — the only measurement here with a control
arm — ran only on a laptop that remembered to run it.

**Now.** `qh-doctor` carries a `release` section: it asks the remote, bounded, whether `v<installed>`
is a tag (the marketplace clone fetches `main` only, so its own tags stop where it was first made)
and says `is a published tag`, `has NO tag on the remote: this is main head`, or `COULD NOT LOOK` —
never "released" for a remote it could not reach. `plugin/scripts/orientation.mjs` prints the
SessionStart orientation for a directory, or one line naming its absence, and `qh_orientation`
exposes it through the read-only registrar. `.github/workflows/evals.yml` runs weekly and on
dispatch: with `ANTHROPIC_API_KEY` it runs `claude plugin eval`, prints the with/without table and
the false-claims reading, and keeps the results as an artifact; without the key it prints UNRUN and
exits 0 — a green that measured nothing is the shape ADR-005 forbids. It gates nothing.

**Not done.** `qh_doctor` over MCP is deliberately absent, for the reason `qh-root` is (ADR-031): it
answers about the SERVER's machine, and only when Desktop runs the server locally is that the
caller's. A CI-verdict segment for the status line needs a cache a hook writes per repository; this
repository's `branch-state.mjs --cached` is that shape, and generalising it is a later step.

**The Codex review found five, fixed before commit.** A release lookup that could not look left the
doctor at exit 0 — it is now part of the incomplete-report condition (exit 2). `git ls-remote` could
hang on a credential prompt, match `v2.73.0-rc` for `v2.73.0`, or read a repointed clone — now
`GIT_TERMINAL_PROMPT=0`, `--refs`, an exact ref comparison, and the origin checked against this
plugin's repository. `orientation.mjs` accepted any existing path and phrased an empty orientation
as three claims about the directory — now a directory check and a neutral absence. The eval command
put `./plugin` after the variadic `--allow-tools`, which would have swallowed it — target first now;
and a keyed run that wrote no result could read as green — it fails, while the keyless path carries a
warning and a job summary saying UNRUN. "Not asked" became its own doctor state, because a caller that
did not ask had not failed to look.

## 137. CLOSED 2026-09-05 — the CI reader lived in one repository, and the status line could not say what CI said

**The gap.** `branch-state.mjs` (§15) — branch, dirt, ahead, the CI verdict with its failing job names,
unreleased shipped change — was this repository's own hook, wired in its `.claude/settings.json`.
Every adopter had the same blind spot it was written for. And the status line (§134) could say what
the gates measured but not what CI said, which needs `gh` and seconds, neither of which a status line
can spend.

**Now.** The reader ships in the plugin (`plugin/scripts/branch-state.mjs`, unchanged in behaviour;
`git mv`) and the plugin's `hooks.json` declares it on `SessionStart` (`--cached 120`) and
`UserPromptSubmit` (`--brief --cached 120`), so every adopter gets the line and this repository
keeps no copy of its own: its `settings.json` now carries only the rules hook. The cache the hook
writes into `.git/qh-branch-state.json` is the answer the status line reads — a second reader, never
a second asker: `findGitDir` walks up without spawning git (a worktree's `.git` file is followed),
`usableCache` is the same guard the hook uses, and the piece is `CI ✓`, `CI ✗ N job(s)`, `CI …`,
`CI ? (Nm old)` past fifteen minutes, or `CI ?` when the hook could not look. No cache, no piece.
Four mutants RED: a future-dated cache accepted, a red verdict without its alarm, a stale cache read
as fresh, a red CI rendered green.

**Trade-off, stated.** An adopter without `gh` now sees "COULD NOT LOOK — NOT a green branch; an
unknown one" on every prompt. That is §15 applied to them, and the honest form; if it proves to be
the line nobody reads by the third prompt, the per-prompt form should say it once per session and
the SessionStart form every time — a change to `render`, with the marker `firstMentionThisSession`
already provides.

**The Codex review found two, fixed before commit.** `findGitDir` walked lexical parents, so a cwd
that is a symlink into a repository missed it and a relative `gitdir:` resolved against the wrong
directory — the walk starts from the realpath now, and a test aliases a subdirectory through a
symlink. And a bare repository, whose cache the hook writes at its root, was never recognised — `HEAD`
plus `objects/` at a directory is that directory. The reviewer also read the trade-off above and
confirmed the channel: plain stdout on `UserPromptSubmit` reaches the model as context.

## 138. CLOSED 2026-09-05 — the gates answered about the wrong repository, and said "none governs" while doing it

**Why this was run.** Every number in this repository describes a corpus that USED the lifecycle,
with nothing to compare against; the one measurement with a control arm is the eval suite, which is
deliberately unrun (no key). The alternative costs nothing and has form: v2.38.0's closed sections
were found by foreign corpora, not by this repository's CI. So the read-only gates were pointed at
the five other ADR corpora on this machine — `laravel-monolith` (6 records),
`laravel-cms` (8), `cross-agent-chat` (3), `go-cli-adr-corpus` (22),
`team-memory-main` (61) — nothing in those trees was edited.

**The defect it found, in the tool shipped hours earlier as Desktop parity.** `adr-context`, run from
one repository and asked about another's file, printed:

    Read 35 record(s); none governs /Users/…/team-memory-main/internal/auth/origin.go

35 is THIS corpus's record count. It read its own corpus, never looked at that file's repository, and
rendered the result as a confident negative about that file — while, asked from that repository, the
same path answers `GOVERNS … ADR-049` and names the test enforcing it. Identical output for "no
decision governs this" and "I consulted a corpus with no relation to this path": the ADR-005 class,
and the exact defect ADR-031 exists to prevent (an answer about a different thing than the caller
believes — the reason `qh-root` is not exposed over MCP). Five corpora, five wrong answers.

Now a target outside the corpus root is named as outside, with exit 2 and `read: null` in JSON, and
never counted as "none governs". `within()` realpaths both sides (so `/tmp` and `/private/tmp`
agree), compares by path segment (a sibling `…-other` is not inside), and resolves a RELATIVE target
against the ROOT rather than the process's directory — which the first shape got wrong, and the
existing test caught by refusing where it used to answer. The MCP tool was already correct: it
derives the root from the path. Two mutants RED.

**What the run found in THEM, reported and not fixed** (`wing_team-memory/inbox`, and to that
session directly): team-memory's ADR-049 T1 carries passing acceptance evidence and its Tests table
names three Go tests that exist nowhere in the repository — the fence's own `-run` alternation names
them too, and `go test -run` over a pattern matching nothing exits 0. Whether the behaviour is
covered under other names is their judgement, not mine.

**Left standing, named rather than fixed.** Every corpus keeps non-ADR documents in `docs/adr/`
(`BACKLOG.md` in all five, plus `README.md`, `WAVE.md`, `PREREGISTRATION-….md`), and `adr-lint`
given one reports content findings against it — "Alternatives Considered has no entries" about a
backlog. The natural invocation, `adr-lint docs/adr/*.md`, therefore produces noise on every corpus
tried. It is the same class as the defect above: a document that never claimed to be a record is
judged as a malformed one. Not fixed here because the fix is a recognition rule and this section is
already the largest thing in it.

## 139. CLOSED 2026-09-05 — the gate accused a repository of naming tests it had not written, and the cause was the fix to issue #7

**Found by the foreign-corpus run of §138, and it is the finding that justifies the exercise.**
`adr-lint` reported that team-memory's ADR-045 T3 names `TestNoToolDescriptionClaimsALongMemoryCannotBeMoved`
in a file containing "no executable definition with that name". The function is declared there, plain,
at line 97. Two more in the same file were reported the same way. That is a gate manufacturing a
false accusation against real code — the failure this project exists to be the absence of — and no
corpus here would ever have shown it, because it depends on a comment style this repository does not
use.

**The cause is the fix to issue #7.** `code_only` blanks comments and literals with a sequence of
regexes, and the ORDER decides which class of defect you get:

| order | what it eats |
|---|---|
| comments first (before #7) | a `"//"` LITERAL is read as a comment; the rest of the line, its closing quote and any brace after it are deleted |
| literals first (after #7, until now) | a backtick inside a `//` COMMENT opens a raw string that runs to the next backtick — swallowing every declaration in between |

Go comments quote field names in backticks routinely, so the second ordering deletes real code from
ordinary Go. The file that exposed it quotes a field name in backticks in a comment; three `func Test…` declarations
after it vanished. Both orderings have now shipped here, which is the whole argument: **there is no
correct ordering.** A left-to-right scanner holds one state at a time and can express neither defect.
One already existed in `adr-lint` for Go (`_go_code_only`, one caller); it is now `scan_code_only`,
takes `hash_comments` for the PHP and shell cases the regex handled, and is what both `code_only`s
return. Four mutants RED, including issue #7's own, repinned from the regex it used to describe to
the state it now describes.

**The two gates each keep their own copy, and a test now holds them to the same answers.** They are
standalone executables with no shared module, and issue #7 is on record as having been fixed in one
and inherited by the other — "protected by call order is not protected by construction, and arch-lint
inherited exactly that difference". `tests/gates.test.mjs` runs both strippers over the same six
fixtures and asserts the outputs are EQUAL, so the next divergence fails rather than waiting for a
foreign corpus to notice.

**One mutant came back GREEN on the first pass, and that was a finding about the test.** The
arch-lint issue-#7 mutant survived: the fixtures put a comment marker inside a RAW string and never
inside a quoted one, so nothing held the `"`-state to it — adr-lint was covered only by its own Go
lexer fixture, which arch-lint has no equivalent of. The fixture set gained the quoted case rather
than the mutant being softened (`CLAUDE.md` §4).

**What it means for the corpora.** Re-linted after the fix, the five foreign corpora went from eight
failing records to five, and team-memory's ADR-045 now passes. Of the three findings this run made
against that repository, one was real and severe — ADR-049 T1's three tests had been deleted by a
later commit, leaving an auth guard serving with no behaviour test for a week — one was this false
positive, and one is a stale `Proposed` record for its owner. A gate whose findings are one-third
fabricated is not a gate anyone should act on, which is why this section outranks the feature work it
interrupted.

## 140. CLOSED 2026-09-05 — the classifier §124 named as the cause, fixed against §124's own three messages

**What §124 left behind.** ADR-035's assertion arm was withdrawn at precision 0/3, and the section
named the cause rather than leaving it: `interimResponse` — the negation classifier that takes
precedence — had no words for "haven't run", "can't verify", "not yet run", "no shell". The three
messages it misclassified are recorded there verbatim. That is a testable fixture set with no eval
key and no model, so the cause could be fixed even though the arm cannot be re-armed.

**What this does and does not do.** `unverifiedDisclosure` is a new predicate whose words come from
those three messages and nowhere else; `completionClaim` now calls a message carrying them `hedged`
rather than `none`. It **re-arms nothing**: there is still no producer of `asserted`, and restoring
one needs a fresh measurement at precision ≥ 0.90, which needs the eval suite. What changes is the
kind recorded today.

**The regression it made, and why the predicate is separate.** Adding the words to `interimResponse`
directly — the obvious fix, and the first one written — also widened what that predicate does at
`Stop`, where it SUPPRESSES the evidence advisory for a turn that is blocked or waiting. So
"I have not run the tests yet" silenced the advisory that says nothing has verified the work. Saying
you did not run the check is the moment the gate must speak, not the moment it goes quiet. The suite
caught it (`an honest final message over unverified edits gets the plain evidence advisory`), and the
fix is two predicates: `interimResponse` stays narrow and keeps the suppression, `unverifiedDisclosure`
feeds the claim kind and nothing else. A mutant merges them back and is RED.

**Five mutants**, including the two repinned whose text moved into the new function. The dirty arm is
asserted beside the fixtures: five ordinary completion messages must stay `none`, or a widened
negation classifier swallows every claim and the ledger's evidence half measures nothing.

## 141. CLOSED 2026-09-05 — a backlog was judged as a malformed decision record, in five corpora out of five

**§138 named this and left it.** Every ADR corpus on this machine keeps non-record documents beside
the records: `BACKLOG.md` in all five, plus `README.md`, `WAVE.md` and a `PREREGISTRATION-….md`.
`adr-lint` reads one record at a time, so the natural invocation `adr-lint docs/adr/*.md` handed it
those documents — and it reported "Alternatives Considered has no entries" and "Wiring & Contract
Changes empty" about a backlog. Eight documents across the five corpora, every one a verdict about a
file that never claimed to be a record: the same class as §138's "none governs" and §139's "no
executable definition", which is three in one day from one exercise.

**The discriminator is `**Status:**`.** Every record carries it; none of those eight documents does.
A file with no Status line AND no `ADR-…`/`SPEC-…` name is now reported as NOT A DECISION RECORD,
with the sentence saying nothing was checked and pointing at `adr-debt <corpus-dir>` for the
directory-level question, and it exits 2 — the could-not-look code, not the findings code.

**The arm that must not move**, and it is a mutant: a file NAMED `ADR-…` keeps its findings whatever
it contains. A record missing its Status line is a real finding, and this must never become the way
to silence one. A document carrying a Status line is judged whatever it is called, so a corpus with
its own naming convention loses nothing.

**Why this is the last of the foreign-corpus findings rather than the first.** It is the least severe
of the three — noise rather than a false accusation — and it was visible from the first minute of the
run. It went last because §139 was a gate telling a repository its real tests did not exist, and that
outranks tidiness. What the three share is the shape ADR-005 names: a tool answering about something
it was not looking at, in a vocabulary that reads as a verdict.

## 142. CLOSED 2026-09-05 — every push paid for a release, and the rule that was supposed to justify it named a trigger that does not exist

**Reported by the owner, in the form "23 minutes to release is nonsense", and the first answer was
wrong.** The suspicion was that tags re-run what `main` already measured. They do not: this workflow
has no tag trigger at all — `on: push: branches: [main]`, `pull_request`, `workflow_dispatch` — and
`gh run list --limit 100` finds zero runs ever raised by a tag ref. So the condition

    QUALITY_HARNESS_FULL_CAMPAIGN: ${{ startsWith(github.ref, 'refs/tags/') || github.ref == 'refs/heads/main' }}

had a first half that nothing could take. The real cost was the second half: **every** push to `main`
ran the full 581-mutant catalogue, eight shards at 17–23 minutes each. On this day that was roughly
ten pushes, most of them backlog records, tests, or documentation.

**Three places asserted the dead half as policy**, which is the part that matters more than the
minutes. `CLAUDE.md` §13.6 said "always full (`--no-cache` on tags and `main`)".
`.claude/rules/13-releasing.md` explained why "tags keep running the whole catalogue".
`tests/package.test.mjs` ASSERTED it: `assert.match(condition, /refs\/tags\//, 'a tag must force a
full campaign')` — a test holding the workflow to a behaviour the workflow could not perform, green
for as long as the dead code stayed dead. A mutant on the same line was pinned to the dead text too.

⚠ **ADR-023's pre-registered criterion rests on this.** Rule 1 reads: a wrong reuse "surfaces at the
next tag precisely because tags keep running the full set". That mechanism has never existed. The
criterion is not void — the `main` half was doing the work all along — but the record names the wrong
reason, and a criterion whose stated mechanism is absent is one nobody can check as written. Recorded
here rather than edited into the record, which is history (`CLAUDE.md` §10).

**Now.** `--no-cache` fires when, and only when, the run was raised by `workflow_dispatch`. An
ordinary push reuses what ADR-023 already allows it to. The release procedure gains one step: ask for
the campaign at the sha you are about to tag (`gh workflow run selftest.yml --ref main`).

**And the cheap path cannot become a quiet evidence hole**, which is the only reason this is safe:
`release-evidence.mjs` now reads the run's `event`. A sha whose newest run was a push is `cached` —
exit 2, "could not look at a full campaign" — never `SUCCESS`, however green every job is. A run that
does not say what raised it is `unreadable` for the same reason: an older `gh`, or an answer missing
the field, must not read as a full campaign (ADR-005). Both are mutants, as are the workflow
condition and the two documentation claims' replacements.

**What this costs.** A release now needs a deliberate dispatch and a wait; forgetting it produces a
refusal rather than a silent under-evidenced tag, which is the trade this project always takes. An
ordinary push to `main` drops from about 23 minutes to a few.

## 144. CLOSED 2026-09-06 — one test degraded 12x during a single session, and the suite only notices when it crosses a cap

`tests/gate-rules.test.mjs::arch-lint rejects a gate that cannot fail and a symbol that is not there`
was measured five times on 2026-09-06 across one session, on an unchanged machine:

| run | tree | duration | result |
|---|---|---|---|
| 1 | before any edit | 19,320 ms | pass |
| 2 | before any edit | 23,348 ms | pass |
| 3 | before any `plugin/bin` edit | 242,534 ms | pass |
| 4 | with §143 applied | 241,588 ms | pass |
| 5 | same code as 4 | 60,015 ms | **fail — hit a cap** |
| 6 | same code as 4 | 231,743 ms | pass |

**The change under test was exonerated by runs 3 and 4**: it was already taking 242 s before any
gate was touched, and it passed WITH the change applied. Run 5 is the same code as runs 4 and 6.
So this is load-dependent slowness, not a regression — the machine was running repeated gate
invocations and a second agent session at the time.

**The defect is not the slowness, it is that nothing reports it.** A test that takes 19 s and a test
that takes 232 s are both a green tick, and the suite says nothing until the duration crosses a
timeout — at which point it reports a FAILURE, which is what a correctness defect looks like. A
session that had not kept its earlier logs would have read run 5 as "my change broke arch-lint" and
gone looking in the wrong place. That is the same class as §143 one level up: the output does not
carry what a reader needs to tell two different causes apart.

⚠ **Do not "fix" this by raising the cap.** The cap is what eventually surfaced it at all. What is
missing is a duration a reader can compare against — the suite already prints per-test milliseconds,
so the material is there and nothing reads it.

**Related and probably the same root**: §121 (a truncating heartbeat made a timeout test flaky, and
two siblings the same day) and §26 (orphaned child processes a killed run leaves behind). Whether
this test is slow because it spawns a gate per table row, or because something it spawns is not
being reaped, is not established here — measuring that is the first task, not a fix.

**Not scheduled.** Recorded because run 5 cost a diagnosis that only the earlier logs could settle.

**CLOSED 2026-09-06.** The first task was the measurement, and it answers the question this section
left open — *"whether this test is slow because it spawns a gate per table row, or because something
it spawns is not being reaped"* — with **neither**.

`arch-lint rejects a gate that cannot fail and a symbol that is not there`, measured today on an
otherwise idle machine: **1,103 ms alone** (`node --test --test-name-pattern`), and **2,217 /
2,260 / 2,455 ms** inside three full-suite runs. So its own spawns cost about a second, and its
floor in-suite is ~2.2 s. Run 1's 19,320 ms was already 9x that floor and run 3's 242,534 ms about
110x it. The table above is a record of MACHINE LOAD, and this section's own reading — "load
dependent slowness, not a regression" — is confirmed rather than merely argued.

**The defect was the reporting, and that is what closed.** `scripts/slow-tests.mjs` reads the TAP
`selftest.sh` already knows how to write (`QUALITY_HARNESS_TAP`), which until now nothing read — the
script says so itself: *"it is a diagnostic, not a gate, and nothing reads the file here."*

⚠ **NO STORED BASELINE, and that is the whole design.** A checked-in table of expected durations is
a list kept beside the artifact — right the day it is written, silently wrong after any machine,
runner or suite change, with nothing to report the drift. That is the defect §106 named when it made
the campaign's shard costs come from the campaign's own last run. So the comparison is WITHIN ONE
RUN: every test against the median of the same run. A uniformly slower afternoon moves the median
with the outliers and reports the same answer — asserted in the tests, both directions.

It reports and never blocks (§3), and could-not-look is said in those words: an unreadable
transcript, one with no timed tests, and a run whose median is 0 ms are each `UNRUN`, never a clean
report.

**It found something on its first real run**, which is the receipt worth more than the tool:

```
median 75.4ms over 762 top-level test(s).
     44151ms   585x  every catalogue mutant still parses, so a kill is behavioural
     11968ms   159x  focused false-green regressions remain closed
      5592ms    74x  adr-verify restores declared generated outputs with their source
```

`arch-lint rejects a gate that cannot fail` — the test this section is ABOUT — is not in the top
eight. The suite's real cost is one test at 44 seconds, 585x the median, and nobody had a reason to
know that.

**SIBLING, named and not done (§5):** `every catalogue mutant still parses` spawns `node --check` or
`python3 -c ast.parse` twice per catalogue entry, and the catalogue is past six hundred entries — so
it grows with the corpus and is now a sixth of the suite's wall-clock on its own. Whether that is
worth batching is a separate question from this section, and nothing here measured it.

**THAT SIBLING IS DONE, the same day, and the numbers are worth the honesty.** The test spawned a
parser TWICE PER ENTRY — about 1,180 processes at 618 entries — and `mkdtemp`'d a directory per
entry that nothing ever removed. Now: originals are deduped by file (many entries name the same
one), every Python file goes through ONE batched `ast.parse` process instead of ~578, the Node
`--check` calls run eight at a time, and there is one temp directory, removed.

**Measured: 44,151 ms → 5,322 ms for the test.** ⚠ **And the suite's wall-clock did NOT move** —
47.5 s against 48.4 / 48.1 / 51.1 / 48.8 s before, which is inside the noise. `node --test` runs
FILES concurrently, so this test was never alone on the critical path and shortening it frees a
core rather than a minute. The win that is real is the test's own cost, which grew with the
catalogue, and about 880 fewer processes per run on four platforms.

The checks themselves are unchanged, and that was verified rather than assumed: an entry whose `to`
was temporarily made unparseable is still caught and still named. A batched parse that did not RUN
is asserted to fail loudly, because "the batch did not start" must never read as "everything
parsed" (ADR-005).

## 145. CLOSED 2026-09-24 — MEASURED 2026-09-06 on a real Windows 11 box — three deferred questions answered, and one of them for a reason nobody predicted

**§128, §129 and §123 all deferred to CI because Windows cannot be run locally (§7).** A peer
session with a Windows 11 Pro box ran the suite directly. This is the log §7 says to wait for.

**Environment.** Windows 11 Pro 10.0.26200.0 · node v24.20.0 · Python 3.14.7 · git
2.49.0.windows.1 · `core.autocrlf` system `true`, so a CRLF checkout · Git Bash 5.2.37(1) under
`Program Files\Git\bin` · clone of `29e83ca` into a scratch directory, read-only, nothing repaired.

**Command, eight full runs:** `QUALITY_HARNESS_FORCE_TREE_TESTS=1 node --test
tests/timeout-tree.test.mjs`. Every run: 24 tests, 20 pass, 0 fail, 4 skipped, exit 0, wall
27151–27290 ms. The four skips are the SIGINT group, self-declared — `process.kill(pid, 'SIGINT')`
terminates a Windows process outright, so no Python handler runs.

| assertion | verdict | per-run ms |
|---|---|---|
| a fence timeout kills the tree the fence started, not only bash | 8/8 pass | 2414–2448 (spread 34) |
| a fence whose leader exits still has its tree killed (§123) | 8/8 pass | 2368–2395 |
| `spec-verify`: a cleanup that raises does not replace the timeout | 8/8 pass | 1136–1164 |
| `qh-mcp`: same | 8/8 pass | 1136–1153 |
| `adr-verify`: same | 8/8 pass | 1174–1188 |

### §123 passes on Windows, and the discriminator this repository wrote down does not apply

§128's entry names the discriminator a peer proposed and this file endorsed: `taskkill /T` walks
process **ancestry**, so a reparented subshell sits outside the reachable tree. **On this box
`taskkill` is never called.** The peer rebuilt the `LEADER_EXITS_FENCE` fixture by hand outside the
clone and ran `plugin/bin/adr-verify` against it with `QUALITY_HARNESS_TRACE_TIMEOUT=1`:

    [trace-timeout] gate already inside a job: True (nested job follows) +6ms
    [trace-timeout] job object holds 33316 +6ms
    [trace-timeout] fence timeout after 1s +1060ms
    [trace-timeout] kill_tree start +1060ms
    [trace-timeout] job object terminated the tree of 33316
    [trace-timeout] kill_tree end confirmed=True +1060ms
    [trace-timeout] drain communicate returned +1061ms

Returned in 1252 ms, exit 2, the `UNRUN … its process tree was killed` beat. `beat.txt` held five
lines at return and still five three seconds later — the reparented subshell is dead, not merely
orphaned. The same trace shape appears on the ordinary fence-timeout path, so this is the normal
arm on this host and not something the hand-built fixture provoked.

**Why:** a Job Object kills by **membership**, not by ancestry, and reparenting a child does not
remove it from the job. The ancestry gap is real and it is unreachable wherever job setup succeeds.
So the right reading is not "§123 was wrong" — it is that the failure mode this repository reasoned
its way to is **gated behind a fallback nobody has executed on a real host**.

### What is NOT closed by this

- **§128 is not closed.** The CI runner saw pass / 60 s / 60 s / 1.3 s on byte-identical code; this
  box shows a 34 ms spread across eight runs and never approaches the 60 s bound. That is evidence
  about **this machine** as much as about the code, and the peer said so unprompted. The
  unattributed pipe holder in the direct path stays unattributed.
- **§129's residual is unreproduced, not cleared, and the distinction is the whole entry.** Zero
  surviving `python`/`bash`/`sleep` in `Win32_Process` after every run, zero leftover
  `qh-timeout-tree-*` or `quality-harness-*` directories, no `EPERM` on `rmdir`. But the residual
  the Codex review named was **conditional on Job Object setup taking its fallback**, and that
  fallback was never observed: both tree fixtures (§128's heartbeat fence and §123's leader-exits
  fence) were rebuilt by hand outside the clone and traced directly, and each took the job arm with
  `confirmed=True` — 1234 ms and 1252 ms, identical trace shape. `taskkill` appears in no trace line
  on that host across 11 suite runs. The stubbed unit test drives both arms; a stub is not the live
  fallback. **The specific risk was not exercised.** Forcing job setup to fail is the measurement
  that would settle it, and nothing here does that.

  → The seam now exists: `QUALITY_HARNESS_JOB_UNAVAILABLE` (§129, `292fed8`). The measurement is
  still a Windows box's to take.

  ⚠ **This bullet first read "every run logged `gate already inside a job: True`", and that
  overstated the evidence.** Exactly ONE test per suite run surfaces that trace, the one that
  reports where the time went; every other `kill_tree` test captures the gate's stderr and emits
  nothing, and `QUALITY_HARNESS_TRACE_TIMEOUT=1` across the suite does not change that. So the claim
  originally rested on one traced test per run plus a single hand-built fixture. The peer measured
  the missing half and corrected its own report unprompted; the conclusion is unchanged and the
  wording above is the one the evidence carries. **The residual is exactly the place not to let that
  slide** — a sentence stronger than its measurement is how an open risk gets read as closed.
- **The four SIGINT tests still have no Windows answer.** The suite skips them itself on win32.

### An incidental confirmation worth more than it looks

Bare `bash` on this box resolves to the **WSL stub under `System32`**, which reports itself as
`x86_64-pc-linux-gnu`. Git Bash is not first on `PATH` for a plain process. `resolve_bash()`
returned the `Program Files\Git` path unaided, skipping both the System32 and WindowsApps stubs.
`.claude/rules/07-platforms-and-paths.md` has been wrong about that guard **in both directions**;
this is a third independent execution of it, on a host where the wrong answer was the one sitting
first on `PATH`.

**Not scheduled.** Recorded because three entries deferred a measurement to CI and a real box
answered two of them differently than the reasoning predicted.

**CLOSED 2026-09-24.** A measurement record; the work it leaves is tracked by §128 and §129.

## 146. CLOSED 2026-09-06 — the "already said this" dedupe markers are never cleaned up

The same Windows session counted **48 zero-byte files** named `quality-harness-said-<32 hex>` under
`TEMP`, dated the day before its work, unchanged across all eight runs. It was right that they are
ours and right about what they are for.

`plugin/scripts/lifecycle.mjs:3057` — `firstMentionThisSession()` writes one marker per
`(sessionId, generation, key)` with `flag: 'wx'`, so a second parallel tool call carrying the same
finding sees `EEXIST` and stays quiet (Codex review, 2026-09-05). That mechanism is correct and
should stay.

**Nothing ever removes them.** One file per distinct finding per session generation, for the life of
the machine's temp directory. Zero bytes each, so this is not a disk problem — it is unbounded file
growth in a shared directory, on every adopter, from a shipped plugin.

**What is not established:** whether it matters. A temp directory the OS sweeps makes this a
non-issue; one that is never swept makes it slow `readdir` for everything else eventually. Neither
was measured, and the count above is one machine on one day.

**Do not "fix" it by removing the marker.** The marker is what stops a finding being said twice, and
that was itself a review finding. The candidate is an age-based sweep at session start — which is a
new failure surface (deleting a live session's marker) and needs its own thought, not a one-liner.

**Closed in `292fed8`.** Markers now live under `<tmp>/quality-harness-said/` and
`sweepStaleMarkers()` removes anything older than a week, at most once a day per machine — it
reads that one directory, not the whole temp root, and a guard file holding the time it last ran
bounds even that. The legacy shapes that sat under the temp root are swept too: `said-` markers
from earlier releases, and the one-per-session `gen-` and `note-` files, which are the same class
and were found by the same sweep of the file (`CLAUDE.md` §5) — matched on exactly 32 hex and
nothing else, so nothing that is not ours is ever touched. The sweep never throws, returns what it
did, and names every place it could not look, so a test can tell "nothing was old" from "could not
look" (ADR-005). The exclusive-create dedupe is unchanged: the marker still stops a finding being
said twice.

The failure surface the entry warned about — deleting a live session's marker — is bounded by the
week: a session older than that has its finding said once more, which is the side this mechanism
has always erred toward. Old-removed, live-kept, wrong-shape-untouched and could-not-look are one
test each in `tests/lifecycle.test.mjs`; one mutant (a sweep that removes nothing) RED. Relocating
the directory also moved one assertion in the compaction test, which looked for markers at the
temp root — updated to look where they now are, with the same intent.

## 147. CLOSED 2026-09-24 — MEASURED 2026-09-06 — what actually makes the campaign slow, and what a Go port would and would not buy

Adopters report the mutation campaign taking 30 minutes or more. The cause was assumed to be the
interpreter. It is not, and the numbers say so.

**The runner spawns `node --test` and nothing else** (`scripts/mutate.mjs`) — no external mutation
tool, no Python. Its cost was `mutants × whole-test-file`, serially, because it passed FILES to the
test runner and never a test name. Measured on this machine:

| | |
|---|---|
| `tests/timeout-tree.test.mjs`, one run | 51.9 s |
| of which deliberate `sleep` | ~32 s — a test proving a 1 s timeout kills a tree waits 1 s, then 1.2 s to watch a heartbeat STOP |
| of which interpreter startup | ~20 s — a 3,200-line Python gate through `SourceFileLoader`, three times per test before the fence was shared |
| actual computation | none worth measuring |

**So faster hardware buys almost nothing here**, and that is the finding a port would have been
sold on. The sleeps are wall-clock and the startups are process spawn.

### The two changes that did buy something, and neither is a language

- **`--test-name-pattern` per entry (`only`), 6750937.** The same mutant: **42 s → 0.12 s**. A
  mutant killed by one test in a 26-test file had been paying for all 26, including 13 fence
  timeouts with nothing to do with it.
- **Parallelism, measured with a throwaway Go runner** — 5 workers, one `git worktree` each, same 15
  mutants, same commit, same machine: **3 m 28 s against 12 m 01 s** serial, with byte-identical
  verdicts. ~3.5× on a 10-core box, and the win comes from the work being SLEEP: a dozen sleeping
  processes cost one core between them.

The two compose, and narrowing is worth an order of magnitude more than parallelism.

### Why Node, and where Go would actually pay

Neither win was the language. Node spawns children in parallel perfectly well — 8 × `sleep 1` in
1.02 s wall from one process — and the runner is serial because it was WRITTEN serial, with
`spawnSync` in a `for` loop. What a port would have cost: 672 lines with 29 tests of its own and 14
catalogue mutants proving those tests bind, all re-earned from zero, for a script that does not even
ship (it reads `tests/`).

⚠ **The place Go would genuinely pay is the GATES, and it is not a performance question.** They are
Python, they ship, and they are the source of most of `CLAUDE.md` §7 — the `python3`-that-is-not-
Python, the Git Bash resolution, the version drift. That is an 11,000-line port with 600 catalogue
entries pinned to Python source strings, and it deserves its own decision on its own evidence.

### The worktree, and the hazard that did not bite

Parallel mutants cannot share a working tree: two runs rewriting one file corrupt each other, which
is what the pid lock forbids. One worktree per WORKER (not per mutant) is the answer, and it removes
the journal's whole failure class — a disposable tree cannot leave a mutated file behind.

⚠ `wing_craft` records that a linked worktree's `.git` is a POINTER FILE, and that four tests went
red inside one at a green tag — including "a mutation-cleanup test that drives a real repository".
It did not bite here: 15 mutants in 5 worktrees gave verdicts identical to the main tree. The hazard
is conditional on the worktree being ISOLATED from the main checkout — a container mount, a chroot,
a different mount namespace — where the directory its `.git` points at is absent. Same filesystem,
same answers. **So worktrees are safe for local and CI parallelism and would break inside a
container**, and that belongs in the code when the worktrees land.

⚠ **AND CLEANUP IS NOT AUTOMATIC.** The Go experiment leaked all five on its first GREEN: `os.Exit`
skips deferred functions, exactly as `process.exit()` skips `finally`. Removal must happen BEFORE
the exit call, a registry must be written BEFORE the first worktree exists so a SIGKILLed run is
reaped at next startup, and `git worktree prune` must follow removal — the same shape, and the same
reasoning, as the mutation journal at `scripts/mutate.mjs:50-51`.

**Not scheduled: worktrees in `mutate.mjs`.** Writing the cleanup before there is a caller is the
speculative complexity YAGNI refuses; it lands with the feature.

**CLOSED 2026-09-24.** A measurement record; the narrowing shipped in 6750937, and the worktree isolation it considered is §241's.

## 148. CLOSED 2026-09-06 — the mutation cache is never persisted between CI runs, so every push measures everything

`.mutation-cache.json` reuses a RED verdict whose `(file, from, to, tests, only)` are byte-identical
to the run that took it (ADR-023), and it works — locally. CI passes `--no-cache` on the dispatched
run by design, but the PUSH runs have no cache to reuse either: nothing restores or saves one, and
the only artifact uploaded is the TAP transcript. So a commit touching one line of prose re-measures
600 mutants across 12 shards.

**What makes this more than an `actions/cache` step.** The runner writes `prev ∪ own` and DELETES
keys whose verdict went GREEN. Twelve shards each restoring the same previous cache and uploading
their own would, under a naive union, re-add a GREEN's stale RED from the eleven shards that did not
measure it — a verdict resurrected by shards that never took it. **Deletions have to win**, so each
shard must say which keys it MEASURED this run, and a merge job must apply that.

Sketch: the cache file gains `measured: [keys]` (the loader ignores unknown fields, so no format
break); `scripts/mutation-cache-merge.mjs` resolves each key by its measuring shard, absent meaning
deleted; the workflow restores by prefix, uploads per shard, merges, and saves. Release runs keep
`--no-cache`, so a tag is still fully measured — that is ADR-023 T3 and does not change.

**CLOSED 2026-09-06**, in `0b7d220` and `cf379e3`, and the sketch above survived contact with
two exceptions worth more than the feature.

`scripts/mutate.mjs` now writes `measured` — the keys a run took a verdict on, empty for the ones
it reused — and `scripts/mutation-cache-merge.mjs` resolves each key by its measuring shard. The
workflow restores by prefix, uploads one artifact per shard, merges, and saves.

**What the sketch did not say, and it is the load-bearing half.** Absence arrives TWICE, and only
one of the two is a deletion. Inside a `measured` claim an absent key means the shard deleted it;
a shard that never REPORTED — killed at the 25-minute wall, which happened twice on `4b7045c` —
makes its keys carry no claim from anyone, so their prior verdicts survive untouched and a mutant
that went GREEN stays RED for ever. The same resurrection, reached through silence. So the merge
refuses an incomplete run (`--expect 12`) and writes nothing rather than publishing a cache that
freezes one.

**And the shape that would have made every release impossible.** The merge must not run on a
dispatch, and the obvious `if:` goes on the JOB — but `release-evidence.mjs` filters on
`j.conclusion !== 'success'`, so `skipped` is exit 1 there exactly like `failed`, and a release may
only be cut from a dispatched run. A job-level condition would have made every release
permanently unreleasable, first symptom a release refused for a job that did what it was told. The
job always runs; its STEPS skip. `tests/package.test.mjs` fails on any job-level
`workflow_dispatch` condition now, and shows itself rejecting that shape.

**The balance half closed itself.** `--no-cache` suppresses reuse, but the `--shard` block reads
the same file for its `ms` timings unconditionally — so a restored cache gives the dispatched run
a cost-balanced split instead of round-robin, with no flag semantics changed. That is the comment
at `.github/workflows/selftest.yml` about shards not being cost-balanced on the run that most
needs to fit in 25 minutes.

**Two instruments found what reading did not.** The campaign returned GREEN on the CI-shape
mutant: the test looped its assertion over the real workflow and checked the bad fixture BESIDE
that loop with a different assertion, so the mutated line never ran against a shape that must fail
it — one predicate, two inputs, fixed it. And the Windows entry-guard sweep caught
`mutation-cache-merge.mjs` comparing `import.meta.url` to a ``file://${process.argv[1]}`` template,
inert on Windows, which would have exited 0 having merged nothing.

**The Codex review found four things, and the first two meant NONE of this would have worked**
(`916e124`, `291d292`). `--expect 12`'s operand was collected as a thirteenth report path, so the
workflow's exact invocation always refused and the save never ran — and the test passed because
its refusal arm asserted only `/REFUSED/`, which eleven files plus a stray `12` also satisfies.
`upload-artifact@v4` excludes DOTFILES by default even when the path names one, and
`if-no-files-found` reports the empty upload as a success, so no shard report would have reached
the merge and nothing would have said why. Then the one that mattered most for this project's own
thesis: twelve prefix `cache/restore` lookups are not one snapshot — partial-key matching returns
the newest match at the moment of each lookup, so a concurrent save hands two jobs different cost
maps, and two cost maps do not compose into a partition. `--no-cache` cannot save that, because it
forbids reusing a verdict and cannot measure an entry no shard selected: a "full" campaign could
have come back complete-looking and short, and `release-evidence` would have accepted it. A
`mutation-cache-seed` job now resolves the snapshot once and hands every shard the same artifact.
Fourth, a count is not completeness — twelve reports with `2/12` twice and no `3/12` passed, so
the merge now requires each identity exactly once.

**And the campaign found the same weak TEST shape twice in one file, hours apart.** Both times an
`assert.doesNotMatch(realArtifact, ...)` with the counter-fixture checked BESIDE it instead of
THROUGH it. A negative assertion over the real artifact is unkillable on its own — the artifact
satisfies almost any weakened form of it. It becomes killable only when the check is a FUNCTION
and a fixture that must fail goes through the same function. Worth more than either fix.

**LEFT OPEN, and named rather than done quietly:** `--no-cache` fuses "do not reuse" with "do not
write", so a dispatched run measures all 611 entries and stores none of it. Splitting it would let
the run a release is cut from refresh the cache it just proved. Not needed for this section.

## 149. CLOSED 2026-09-24 — CI went red on a49ab52 — one cause, two symptoms, and a race it exposed

The Windows job and `mutations 6/12` both failed, and every local gate was green. Both trace to
the `NODE_TEST_CONTEXT` fix in fc03c7c, which is worth stating plainly: **the fix was correct and
it made previously-hollow work real.**

`node --test` sets `NODE_TEST_CONTEXT` for its children, and an inner `node --test` that
inherits it speaks the parent's binary protocol on a private channel — stdout empty. Six test files
here spawn the campaign from inside `node --test`, so every campaign they drove produced nothing
readable and cost almost nothing. Stripping the variable made those campaigns actually run.

**Symptom 1 — the lock test timed out (Windows, 60,276 ms).**
`tests/gate-rules.test.mjs`'s dead-owner arm is the one arm that does not refuse: it PROCEEDS, so
it runs a real campaign of whatever `--case` names. It named `mktemp -d is a temp`, whose test
file is `tests/lifecycle.test.mjs` — 4,500 lines, run twice for baseline and mutant. Survivable
only while the inner runs were hollow. `spawnSync` killed it at 60 s, before `releaseTheRun()`,
leaving a LIVE pid in the lock: `'4696' !== ''`. Now pointed at the cheapest entry in the
catalogue (`post-edit-check.test.mjs`, three tests, 0.2 s): **60,276 ms → 465 ms**. The arm also
asserts the run FINISHED, because a lock cleared by a killed run is cleared for the wrong reason.

**Symptom 2 — the catalogue test, in a different file, was the victim.**
`every catalogue entry still matches the source it mutates` reported `advisory: mktemp -d is a
temp directory — matches 0x`. Nothing was wrong with that entry. The killed runner had left
`plugin/scripts/lifecycle.mjs` mutated, and the catalogue test read the mutated file.

⚠ **THE RACE IS REAL AND PRE-EXISTING, and this only narrowed it.** `node --test` runs FILES
concurrently, so a test that spawns the mutation runner has a real source file rewritten while
sibling test files read it. `QUALITY_HARNESS_MUTATION_IN_FLIGHT` covers the runner's OWN inner
run (`tests/package.test.mjs:598`) and says nothing to a sibling. The window was 60 s here and is
~0.2 s now; it is not closed. **§147's worktrees close it properly** — a campaign that mutates its
own checkout cannot be seen by anything reading the main tree — which is one more reason that work
is worth doing beyond the 3.5x.

**Symptom 3 — a GREEN mutant, `mutations 6/12`.** `mutate: a baseline that never ran is not
called a failing suite` survived. Correct, and mine: fc03c7c added a SECOND branch answering
`unrun` (output with no spec reporter lines), and a killed run has no stdout either — so deleting
the signal check changed the reason and not the verdict, while the test asserted only the state.
It asserts the `why` now: a killed run is named by its signal, not by its silence. RED again.

**What this says about the local gate.** It was green on all three. The lock test's cost is
platform-dependent (Windows is slower), and the other two are a concurrency race and a mutant —
neither of which `selftest.sh` measures. §15's rule earned again: a local green is not a branch
being green, and they are different checks.

**CLOSED 2026-09-24.** Symptoms fixed in 104fc06; the race it exposed is §241's.

## 150. CLOSED 2026-09-07 — a mutation verdict was parsed and then discarded when its task had no verification row

Raised by the Codex review of `6896ed6` (2026-09-06) as a MEDIUM against
`plugin/scripts/trajectory-metrics.mjs`, and left rather than folded into that change because it is
not a defect in it — the tool is older and the fix is a decision about buckets, not a patch.

`measure` classifies a task first and counts second (`trajectory-metrics.mjs:138-145`). A task with
no verification entries and one *survived* mutation is `unevidenced`, so the loop `continue`s before
`totals.survived` is touched: the verdict was read out of the file and then thrown away. The
reviewer reproduced both shapes — `unevidenced: 1, survived: 0` for a survivor, and the same for an
inconclusive.

**Why it matters now rather than before:** `plugin/scripts/corpus-report.mjs` publishes those
counts, so a corpus can print `survived 0` while holding a parsed survived mutant, in a report whose
whole purpose is to be handed to someone else. A number that is wrong in the flattering direction is
the worst kind this project can emit.

**Why the existing test misses it:** `tests/trajectory-metrics.test.mjs:37-50` supplies a survivor
*with* a green verification row, so the task is evidenced and the count lands.

**The decision, not the patch:** whether such a task belongs outside the evidenced ratio (it has
claimed nothing) while its mutation verdicts are still aggregated in a separate bucket, or whether a
mutation row alone should make a task evidenced. The first keeps ADR-010's buckets intact and needs
a second counter; the second changes what "evidenced" has meant across every number this project has
published. Do not pick one by reading — the ratio is quoted in `README.md` and in the research note,
so whichever is chosen has to say what the old figures meant.

**CLOSED 2026-09-07 — NEITHER of the two options above, because reading the guard dissolved the
question.** The decision was framed as "does a mutation row alone make a task evidenced", and the
line already answered it:

```js
if (!task.entries && !task.killed) { totals.unevidenced += 1; continue }
```

`!task.killed` is that answer. A killed-mutant-only task has ALWAYS been evidenced here. The guard
simply named ONE of the three verdicts, so the defect is not a missing policy — it is an asymmetry,
and the asymmetry ran in the flattering direction: **good news kept a task in and got counted; bad
news dropped the task and took its verdict with it.** That is not a bucket preference, it is the
defect class this project exists to demonstrate the absence of.

So the guard is symmetric: `survived` and `inconclusive` keep a task in exactly as `killed` always
has. A survivor-only task lands in `outcomeOnly`, which is right — a survivor shows the fence did
NOT catch it, so nothing there proves the check can fail.

**What the old figures meant: the same thing.** That was this section's condition for choosing, and
it is discharged by measurement rather than by argument — the one unevidenced task in this corpus on
2026-09-07 (`ADR-035/tasks/T4`) carries no mutation verdict at all, so nothing moved:

```
node plugin/scripts/trajectory-metrics.mjs docs/adr   # before AND after
  72 / 73 evidenced task(s) show their check COULD have failed here (99%)
  8 red of 178 acceptance entries · 152 killed · 10 survived · 2 inconclusive
```

`README.md` and the research note quote that ratio and neither needs a word changed.

```
node scripts/mutate.mjs --case 'trajectory: a survived or inconclusive'
  RED  a survived or inconclusive mutant is not parsed and then discarded
       <- killed by: a mutation verdict is never parsed and then discarded, whichever verdict it is
bash scripts/selftest.sh   exit 0, 790 tests
```

⚠ **Why the existing test missed it, restated as the lesson:** the fixture at
`tests/trajectory-metrics.test.mjs` gave its survivor a green verification row, so the task was
evidenced by the ROW and the count landed. The survivor was never the thing being tested. The new
test gives three tasks a mutation log and no verification log at all, and shows `unevidenced`
still reachable in the same test so the bucket cannot have been emptied instead of fixed.

**Not closed by this:** `corpus-report.mjs` republishes these counts, and nothing checks that what
it prints matches what `measure` returned. That gap is smaller than the one just closed, but it is
the same shape one layer out.

## 151. DECLINED 2026-09-24 — MEASURED 2026-09-06 — the mechanism has now run on three corpora, not one, and two of them are not mine

§12 of the research says the position plainly: *"the only tool that does X" is a claim about a set of
one until somebody else runs the sweep on their corpus and reports the buckets.* Three peer sessions
were asked; two answered within the hour, both at plugin 2.82.0, both having checked the numbers
against their own tree rather than eyeballing them.

| corpus | records | task files | evidenced | shown able to fail | entries | red | killed | survived | inconclusive |
|---|---|---|---|---|---|---|---|---|---|
| quality-harness | 35 | 73 | 72 | 71 (99%) | 176 | 8 | 151 | 10 | 2 |
| team-memory | 58 | 163 | 132 | 126 (95%) | 534 | 95 | 373 | 49 | 10 |
| mrw (**Go**) | 25 | 52 | 52 | 52 (100%) | 310 | 27 | 246 | 9 | 2 |

**No path leaked from any of them**, which is the §6 property the review of `6896ed6` was about; two
independent readers checked the block for a home directory or a username before pasting it.

⚠ **DO NOT QUOTE `survived` AS A DEFECT COUNT.** The team-memory owner flagged it unprompted: in
that corpus a survived mutant is a FINDING kept deliberately, so 49 is partly backlog and not 49
holes. The mrw owner said the same of theirs — three of the nine are from that day and the bucket
did its job. A ratio a corpus's owner has to caveat is a ratio this project must not publish bare.

**The tool was righter than a grep, and that is worth keeping.** mrw's owner cross-checked
`killed 246` against `grep -rho 'mutant killed' docs/adr | wc -l` = **247** and traced the extra to
prose in an ADR's Follow-ups discussing mutants. The counter reads log ROWS; a grep reads strings.
Anyone auditing these numbers with a grep will hit the same discrepancy and conclude the tool is
wrong.

**Stack-neutral, tested rather than assumed.** The Go corpus reported no JavaScript assumption
anywhere across `adr-lint`, `adr-verify`, `adr-debt` and `corpus-report`.

**OPEN, asked for independently by BOTH readers:** `--json` should name WHICH entries are
entry-shaped and unjudged. "4 of 52" is a number nobody can act on, and the mrw owner's grep for
such rows found none — so either the row-shape rule is broader than a hand-written pattern, or the
four are shaped unexpectedly. Naming them is what settles it.

**Declined 2026-09-24.** Naming the unjudged entries in `--json` is not scheduled; the count stays.

## 152. CLOSED 2026-09-07 — advice that fires every run trains filtering, and the filtering produced a false statement

Reported 2026-09-06 by the mrw session, and it is the evidence §85 never had. `adr-lint`'s
fence-segments-vs-`Rests-on` advice fires on every task, every run, unchanged — six identical lines
on a six-task record. The owner began filtering them with `grep -v`, then told a reviewer
*"adr-lint PASS, no advice outstanding"*, which was FALSE, and the reviewer caught it.

That is the whole cost of a true-but-unactionable message, measured: it does not annoy, it trains a
habit, and the habit produces a false claim about a gate's output — in a project whose subject is
false claims about work. §85 has stood as a taste complaint; this is a consequence.

Shape to look at: emit once per record, or only when the count CHANGES. Neither is obviously right —
advice that vanishes on the second run is advice a reader never sees if they only ever read the
second run.

**Two siblings from the same report, one fix:** `adr-verify`'s refusal of a malformed `--covers` is
the one line it emits WITHOUT the `[adr-verify]` prefix, so a scripted caller's
`grep -E 'mutant (killed|SURVIVED)'` swallows it and the run looks like it produced nothing. A
non-matching `--mutant --from` is then indistinguishable from a genuine survivor, because both end
as "no verdict line". Could-not-look wearing the shape of a verdict (ADR-005), in a tool that
enforces that rule on everyone else.

**2026-09-07 — A SECOND INSTANCE, and it names a THIRD shape neither option above considered.**
BACKLOG §157: the `branch-state` release line printed *"plugin/ changed in 8 file(s) since v2.81.0 —
§13: a green shipped change is released, not parked"* on every prompt, for four releases, while
there was nothing to release. The owner filtered it. A session then read it and had to spend a turn
proving it false before any work could start.

The two shapes this section proposed — emit once per record, emit only when the count CHANGES — are
both **rate limits on a message assumed to be true**. §157's message was FALSE, and the fix was
neither: it made the advice correct, after which it fires only when there is something to do. That
is the same end state both options were reaching for, arrived at without the objection this section
already raised against them ("advice that vanishes on the second run is advice a reader never sees
if they only ever read the second run").

So the triage question comes first, and it is cheap:

- **Is the advice TRUE every time it fires?** If not, that is the defect. Rate-limiting a false
  message hides it better and leaves it false — strictly worse than the annoyance.
- **Only if it is always true** is this section's original question live: `adr-lint`'s
  fence-segments-vs-`Rests-on` advice IS true on all six of those task files, and unactionable, and
  that is the case the two shapes above are for.

⚠ **And the cost is now measured twice, in the same direction.** §152's original cost was a false
claim ABOUT a gate's output ("adr-lint PASS, no advice outstanding"). §157's was a false claim BY a
gate, believed for four releases because nobody re-read a line they had learned to skip. Filtering
is not the failure; it is the correct response to a channel that has stopped carrying signal. The
failure is upstream of the reader every time.

**Still open**: nothing. The two `adr-verify` siblings are settled below, and neither was what this
section said it was. The `adr-lint` case is settled too — by ADR-037, and NOT the way this section
proposed.

### 2026-09-07 — closed by ADR-037, and the advisory this section named was not the one to fix

This section proposed two shapes, *emit once per record* and *emit only when the count changes*, and
then added a triage question that ranked them behind "is it true every time?". ADR-037 rejected both
as **rationing** and required a measurement first. That measurement (ADR-037 T1) then answered a
question this section had not asked:

```
78 live advisory findings across 22 of 37 records
34 — 44%, on 17 records — ONE advisory: the proof-map legacy notice
 7 — the fence-segments advisory THIS SECTION IS ABOUT
 2 — an uncovered declared mechanism
35 — one-offs
```

⚠ **THE ADVISORY THIS SECTION NAMED IS 9% OF THE NOISE.** It was reported from a six-task record
where fence-segments was what that reader happened to see; across a corpus it is not the problem, and
the dominant one was never mentioned by anybody. **A field report is a sample of one reader's corpus,
and the ranking it implies is not the ranking** — which is the argument for measuring before
rationing, made by the measurement rather than by anyone's taste.

ADR-037 T2 then acted on the proof-map notice. Its wording ended *"when authoring a NEW task"*: it
named file X and instructed the reader about future file Y, so it was unactionable **by reading**,
which needs no survival count to establish. Deletion was checked and rejected on evidence —
`adr-lint` over a record with the header and one without differ in that line and nothing else, so
dropping it makes an unrun check silent. It now says `UNRUN`, names what is therefore unproven, and
gives the edit for the file it reports on.

⚠ **AND THE COUNT DID NOT MOVE, WHICH IS THE POINT.** Re-measured after the change: **34 of 79, on
the same 17 records.** ADR-037's rule is *acted on or removed, never emitted less often*; a fix that
reduced the line count would have been the rationing this record refuses. What changed is whether a
reader can do anything about the line, and whether doing it makes the line go away — both now
asserted, with a mutant that restores the old wording.

**Left open deliberately:** the fence-segments advisory (7 of 78) is a separate decision the number
does not yet call for, and `docs/BACKLOG.md` §85's original taste complaint about it stands
unanswered. It is named in ADR-037 T2's Out of Scope rather than carried here.
was what this section said it was.

### 2026-09-07 — the two `adr-verify` siblings, investigated before being fixed

⚠ **SIBLING 1 WAS ALREADY FIXED, AND HAD NO REGRESSION.** `fail()` prefixes `[adr-verify]`
(`plugin/bin/adr-verify:617`), and its own docstring documents the change. What nothing asserted was
the prefix **at the boundary the report came through** — the `--covers` refusal itself.
`tests/gate-regressions.py` checked only `returncode == 2`, so the fix was one edit away from being
silently reverted. Both refusal arms now assert it, with a mutant that strips the prefix:

```
$ node scripts/mutate.mjs --case "wears the tool's name"
RED  adr-verify: a refusal wears the tool's name, or a scripted caller never sees it  <- killed by:
       focused false-green regressions remain closed
1/1 mutations were noticed.
```

⚠ **SIBLING 2'S DIAGNOSIS IS FALSE AS WRITTEN, and this section carried it for a day.** A survivor
and a non-matching `--mutant --from` do NOT read identically. Run through the CLI on a scratch
fixture:

```
$ adr-verify tasks/T1.md --cwd . --mutant src.js --from 'n > 0' --to 'n >= 0' --why probe
exit=1
[adr-verify] MUTANT APPLIED to src.js: …
- 2026-09-07 · no-git · mutant survived · exit 0 · `src.js` · probe · acceptance-sha256:b60893e0…
[adr-verify] NOT evidence: the fence passed with the mechanism broken…

$ adr-verify tasks/T1.md --cwd . --mutant src.js --from 'n > 99' --to 'n >= 99' --why probe
exit=2
[adr-verify] MUTANT DID NOT APPLY: --from text is not present in src.js. Nothing was run…
```

Different exit codes, and only one of them emits a verdict row. **What collapsed them for the
reporter was their grep**: `grep -E 'mutant (killed|SURVIVED)'` — uppercase `SURVIVED`, which this
tool never emits (the row says `survived`) — read **through a pipe**, which returns the pipe's
status instead of the gate's. Both are already named rules here, §13.5 and the `mrw` contract; what
was missing is that a caller who gets them wrong sees a clean-looking nothing.

### ⚠ But the probe found a real one next door, and it is this section's own shape

**`survived` and `inconclusive` BOTH leave exit 1.** So a caller reading only the code cannot tell
*"the suite noticed nothing"* — a finding about the test — from *"nothing could be told"*, which is
could-not-look. ADR-005, in the tool that enforces it on everyone else.

The triage question this section added on 2026-09-07 answers it: **is the advice true every time it
fires?** Nothing shipped claims a nonzero exit means `survived` — `adr-execute`'s skill points the
reader at the three verdicts, not at the code — so this is not a false message needing a rate limit.
It is a TRUE-BUT-INCOMPLETE contract: `--help` said *"0 only on `killed`"* and stopped, which reads
as though the rest were one answer. The fix is the prose, and it names the row as the verdict.

**Backed rather than described**, because a contract sentence nothing runs is the failure mode this
project is about. A test drives both cases through the CLI and asserts they share exit 1 and differ
in the row, with a mutant that renames the inconclusive verdict:

```
$ node scripts/mutate.mjs --case "did not build is inconclusive"
RED  adr-verify: a mutant that did not build is inconclusive, never a survivor  <- killed by:
       a survivor and an inconclusive share an exit code, and are told apart by the row
1/1 mutations were noticed.
```

Its fixture is JavaScript on purpose: `adr-verify` parse-checks a mutated **Python** file and
refuses a broken one outright (exit 2, *"the mutant does not parse"*), so a node fence is the
cheapest place an `inconclusive` is reachable through the CLI at all. Measured, not assumed — a
Python import-time crash (`THRESHOLD = 1/0`) comes back `killed`, correctly.

**Siblings left, named not fixed** (§5): `plugin/bin/adr-verify:595` is an unreachable duplicate
`return` after the `TimeoutExpired` arm — harmless, and outside this scope. And the `adr-lint`
fence-segments advice above is untouched; it remains the live half of §152.

## 153. DECIDED (b) 2026-09-06 — a THIRD route to "the router offers work the record forbids starting"

Found 2026-09-06 by asking the reporter of `f8a0698` whether that fix covered their case. It did
not, and the answer is worth more than the fix was.

**Three distinct routes to one sentence**, two closed and one open:

1. A human sign-off whose note says STOP — closed 2026-09-04 (`stopped_by`).
2. `**Blocked-on:** <event>` in the task file — closed 2026-09-06 (`f8a0698`); `adr-next` had never
   read the field at all, `grep -c` returned 0.
3. **`**Status:** blocked` in the TASK FILE, with no `Blocked-on:` field.** Open.

**What route 3 actually is, checked rather than assumed.** `KNOWN_TASK_STATUS` is applied by
`status_word(cell)` to a README TABLE CELL (`adr-lint:1916-1933`). A `**Status:**` header inside a
task file is read by NEITHER tool. So the reporter's word did not "pass lint" — lint never looked
there. `adr-next` reads task files and deliberately never the README, which is a derived index
(`CLAUDE.md` §10, and `adr-next:10` says so in its own header). The two tools therefore do not
disagree about a status; they read two different files, and a status written in the file the router
reads is read by nobody.

**How the reporter got there, which is the part that indicts the vocabulary rather than the code:**
they reached for a status word, `adr-lint` refused their invented `skipped` and named
`done`/`pending`/`blocked`, and they took `blocked`. The refusal was good behaviour and it routed
them to a word that changes no routing. The one moment a reader is being told what the vocabulary
IS, is the moment to name `Blocked-on:` for a task waiting on an external event.

**THE DECISION, and it should not be made by patching whichever file is open:**

- **(a) `adr-next` reads a task-file `**Status:**` header.** Makes a field nobody currently reads
  load-bearing, and puts a second source of truth for "is this task done/blocked" beside the
  evidence rules — which is exactly what `is_done` exists to prevent (a typed word is not
  evidence). A typed `blocked` stopping the router is far less dangerous than a typed `done`
  finishing a task, but it is the same shape.
- **(b) Leave routing to `Blocked-on:` and the sign-off, and make `adr-lint` SAY so** — when it
  advises about a status word, name `Blocked-on:` as the thing that stops the router. Costs
  nothing semantically and closes the gap the reporter actually fell into.
- **(c) Both**, with (a) narrowed to `blocked` only and never to `done`.

Whichever is chosen has to answer: what does a README cell reading `blocked` mean if the task file
says nothing? Today it means nothing to the router, and the README is the file most corpora edit

**DECIDED (b), 2026-09-06, on a measurement rather than a preference.** The reporter counted their
own 58-record / 163-task corpus:

```
task READMEs with a Status column        48
task FILES with a **Status:** header      5   (done ×2, partial, Withdrawn, blocked)
task files with Blocked-on:               0
```

48 against 5 settles which file records status in practice, and **zero** settles the rest: the field
that stops the router is used NOWHERE in that corpus, so the only way anyone there learns it exists
is being told while choosing a word. That is the advisory, and it now names `Blocked-on:` and says
in as many words that a status in the README routes nothing.

**(a) and (c) are rejected, and the reason is in those five values.** They are not one vocabulary —
`done` twice, `partial`, `Withdrawn 2026-08-22. Not deferred, not blocked:…`, and a `blocked`.
Nobody was following a scheme; each session invented what it needed. Making that header load-bearing
would promote four improvisations into router input. And narrowing (a) to `blocked` only works until
someone writes the other word in the same place — **two task files there already carry
`**Status:** done`, neither evidenced**. A typed `done` finishing a task is precisely what `is_done`
exists to prevent.

⚠ **AND THE REPORTER'S OWN MECHANISM CLAIM WAS WRONG, which is why this was checked rather than
acted on.** They said `adr-lint` refused their invented status and named the three words — true —
and passed it on as lint having read the TASK FILE. Lint's message said `README.md: T3 has status
skipped`; it never read the task file. They had the evidence in front of them and reported the
mechanism from a read rather than from the output. The observation was right, the mechanism was not,
and a fix built on their sentence would have taught `adr-next` to read the wrong file. A peer report
is a lead to confirm against source.

**What is NOT closed:** the `**Status:**` header in a task file is still read by nobody. It stays
unread deliberately — five ad-hoc values across six weeks is not a vocabulary to route on — but a
field a user can write in the obvious place with no reader is a wart, and the honest options are to
have `adr-lint` say so when it sees one, or to stop the template implying it exists.
first.

## 154. CLOSED 2026-09-07 — dispatching immediately after a push ties on `createdAt`, and `release-evidence` then read the push run

Hit 2026-09-06 cutting v2.83.0, and it cost a full CI cycle. `git push` then
`gh workflow run selftest.yml` in the same command produced two runs at sha `6fa18bd` with the
**identical** `createdAt` of `2026-09-06T19:11:25Z`:

```
34054097512 workflow_dispatch 6fa18bd completed/success created=2026-09-06T19:11:25Z
34054097463 push              6fa18bd completed/success created=2026-09-06T19:11:25Z
```

Both concluded success. `release-evidence.mjs` reads the NEWEST run for the sha, the tie resolved to
the push run, and it correctly refused: **`CACHED` — "the newest run for this sha was raised by
`push`, so its mutation campaign may have reused cached verdicts"**. The dispatched full campaign had
run and passed; the gate could not tell which of the two it was looking at.

**The refusal is right and must stay.** A tag resting on a cached campaign is exactly the quiet
evidence hole §142 closed, and the tool choosing the safe branch under ambiguity is the behaviour
this project wants everywhere. The defect is that the ambiguity is REACHABLE by the documented
release sequence — §13 says push, then dispatch, and doing both promptly is the obvious way to do
it.

**Worked around by hand:** wait for the push run to register, then dispatch, so the dispatch is
unambiguously newer (53s apart on the successful attempt).

**Shapes to consider, none chosen:** prefer a `workflow_dispatch` run over a `push` run when both
carry the same sha and the same timestamp, rather than ordering on time alone — the event is the
thing the verdict actually depends on, and it is already read. Or ask for runs filtered by event and
compare the two candidates explicitly. Or have §13 tell the reader to wait, which is the
documentation-shaped answer and the weakest, because it is the same "instruction where a mechanism
belongs" this project keeps finding.

⚠ A tie is not rare here: a push and a hand-dispatch issued from one shell land in the same second
routinely. This will recur on every release cut the fast way.

**CLOSED 2026-09-07 by the first of the three shapes above — the event, not the clock.**
`scripts/release-evidence.mjs` grew `selectRun`, exported and pure: it takes the newest instant and,
among the runs SHARING it, prefers a `workflow_dispatch`. `fetchRun` now asks
`gh run list --limit 20 --json databaseId,event,createdAt` instead of `--limit 1`, because
`--limit 1` is what handed the tie back to gh's ordering in the first place.

**Only among the tied ones**, and that half needed its own test: preferring a dispatch
unconditionally would resurrect a campaign taken BEFORE a later push, which is exactly the quiet
evidence hole §142 closed. `a newer push still wins over an older dispatch` is that test, and it is
the arm the second mutant below breaks.

An unreadable `createdAt` keeps gh's own order rather than ranking values that do not compare — the
ADR-005 reading applied to the ordering itself — and the fixture is arranged so the fallback lands
on the PUSH, so the arm cannot be a way to smuggle a pass.

The CACHED refusal is untouched. What changed is which run the question is about.

```
node scripts/mutate.mjs --case 'release-evidence: a createdAt tie'
  RED  a createdAt tie is broken by the event, not by list order
       <- killed by: a dispatch and a push at the same instant resolve to the dispatch
node scripts/mutate.mjs --case 'release-evidence: only runs tied'
  RED  only runs tied at the newest instant may prefer a dispatch
       <- killed by: a newer push still wins over an older dispatch
node scripts/mutate.mjs --case 'release-evidence: an unreadable createdAt'
  RED  an unreadable createdAt is not silently ordered
       <- killed by: a timestamp nothing can read is not silently ordered
bash scripts/selftest.sh   exit 0, 783 tests
```

⚠ **The documentation-shaped answer was NOT taken, deliberately.** §13 still says push, then
dispatch, and says nothing about waiting — because the mechanism now handles the tie and an
instruction telling a reader to sleep between two commands is the "instruction where a mechanism
belongs" this section already named as the weakest option.

**Not closed by this:** the tie is broken only when the two runs carry the same `createdAt` to the
second. If GitHub ever reports sub-second timestamps, a dispatch issued a few hundred milliseconds
after a push stops tying and starts losing — and the gate would go back to answering CACHED with no
tie in sight. Nothing here detects that; it would surface as the old symptom returning.

## 156. MITIGATED 2026-09-07 — the campaign's heaviest shard is OOM-killed, and §148's complete timings made it heavier

Two dispatched runs at `14fc5a6`, both 18 of 19 jobs green, both dying on the SAME shard:

```
34084310165  mutations 1/12  exit 143  "The runner has received a shutdown signal"
34087948045  mutations 1/12  exit 137  "node scripts/mutate.mjs --shard 1/12 --no-cache" Killed
```

**137 is SIGKILL and `Killed` is the kernel's word**, so the second is unambiguous: the process was
killed for memory, not stopped for time. It died at ~11 minutes against a 25-minute cap while other
shards finished in 12–14, and it had printed **46 of its 50 verdicts** — four short. Every verdict in
both logs is RED. Nothing was found; the shard ran out of room.

⚠ **§148 MADE IT WORSE, AND THAT IS THE PART WORTH KEEPING.** `shardByCost` packs by measured
duration, and the cache §148 added gave it COMPLETE coverage:

| run | shard 1 | timings available |
|---|---|---|
| v2.84.0 (green) | 54 of 630 | 539 |
| this one (killed twice) | 50 of 629 | **629** |

Better timing coverage packs the slowest entries together more tightly. Cost is TIME, so the
tightest-packed shard is also where the memory-heaviest work concentrates — a dimension nothing
balances. §148 bought a cost-balanced split and paid for it in peak memory on one shard, which
nobody predicted and which no local run would show.

**MITIGATED, NOT DIAGNOSED: 12 shards → 16.** The same lever §147 used for wall-clock, applied to a
different resource. It reduces entries per shard and therefore peak accumulation. It does NOT
explain what accumulates: 46 mutants each spawn `node --test` and the runner's own retention is
bounded (`classify` returns a verdict plus a memoised baseline reference), so the growth is
unattributed. If a shard OOMs again at 16, more shards is the wrong answer and the accumulation must
be measured directly.

**A local reproduction was attempted and DID NOT reproduce**, which is why the diagnosis stops here.
Even with CI's own seed cache downloaded from the run's artifact, `--shard 1/12` selected 53 entries
against CI's 50 (514 matching timings against 629). The shard a local run measures is not the shard
that died, and a number taken from the wrong set would have been worse than no number.

⚠ **AND THE ATTEMPT LEFT A SHIPPED GATE NEUTERED.** The local campaign was stopped mid-run, which is
precisely what `CLAUDE.md` §2 forbids — never run a mutation tool and edit the tree at the same
time, and never stop one. It left `plugin/scripts/lifecycle.mjs` with `docsOnly(state.mutationPaths) &&`
removed from a Stop guard, plus a stale `.mutate-inflight.json` and `.mutate-lock`.
`tests/package.test.mjs::no mutation tool left a gate neutered in this tree` caught it on the next
run; `git checkout` restored it because the file was tracked and otherwise clean. The guard worked,
and the rule it enforces was broken by the session that wrote the guard's own backlog entries.

### ⚠ 2026-09-07, later — it OOMed again at 16, and then the SAME sha passed

The mitigation's pre-registered criterion above says: *"If a shard OOMs again at 16, more shards is
the wrong answer and the accumulation must be measured directly."* It did OOM again — and the next
thing measured says the criterion cannot be applied as written, because the premise it assumed is
false.

```
34113733783  mutations 13/16  exit 143  killed at 8m31s, 29c4dc1
34114899388  mutations 13/16  SUCCESS   same sha, same shard, no change of any kind
```

**Nothing was pushed between them.** The tree, the catalogue and the shard assignment were byte
identical; only the runner differed. So at 16 shards the OOM is **LOAD-DEPENDENT, NOT
DETERMINISTIC** — which the two deaths at 12 shards, both on shard 1, did not distinguish, and which
nobody would have learned without re-dispatching an unchanged sha.

That changes the diagnosis, in both directions:

- **The mitigation is doing something.** At 12 it died twice out of two; at 16 it died once out of
  four dispatched campaigns today (`34107450870`, `34109119220`, `34110706970`, `34113733783`,
  `34114899388` — one death, and one unrelated `timeout-tree` failure). The shard is no longer over
  the limit; it is near it.
- **The criterion still bites, and should.** "Near the limit" is not a resting place for a check
  that gates every release: it means a release can be blocked by a coin flip, and a session that
  does not know this will read a `143` as a finding. Measuring what accumulates is still the work.
  What is now ruled out is doing it by *re-sharding until it stops happening* — that would only move
  the coin flip's odds, and would look like a fix.

⚠ **And the failure mode is `143`, which is the OTHER half of this.** Exit 143 is SIGTERM: the shard
printed 46-plus RED verdicts and was then stopped. **Nothing was found; the shard ran out of room.**
`release-evidence.mjs` correctly refuses that sha, because a campaign that did not finish is
could-not-look — but the CI job's own name says only `failure`, so the first reading available to a
session is "a mutant survived". That is ADR-005 one level up, in the CI summary rather than in any
gate this repository owns. Named here rather than fixed; it is a different piece of work.

**This section stays MITIGATED.** No new mitigation was applied, no shard count changed, and the
release that hit it (v2.88.0) went out on the re-dispatch, on `release-evidence.mjs` SUCCESS.

## 157. CLOSED 2026-09-07 — the release line anchored on a LOCAL tag, so the machine that cuts the releases is the one it lies to

Found by a briefing-only `/am` on a clean tree at `46a2656`, which is to say: found by reading the
nag instead of filtering it. The hook printed, on every prompt:

```
release  plugin/ changed in 8 file(s) since v2.81.0 — §13: a green shipped change is released, not parked.
```

**The count was TRUE and the conclusion was FALSE.** Those eight files did change since v2.81.0 —
and every one of them shipped, across v2.82.0, v2.83.0, v2.84.0 and v2.85.0. `git ls-remote --tags
origin` put `refs/tags/v2.85.0` at `46a265611ecf407b1fab10faa2c364c1e0e3b188`, which was HEAD
exactly, and `git diff --name-only 14fc5a6..HEAD -- plugin/` was empty. §13's own "plugin/ unchanged
means nothing to release" was the right answer, and the reader said the opposite for four releases.

Cause, one line, `plugin/scripts/branch-state.mjs`:

```js
const tag = run(['git', 'describe', '--tags', '--abbrev=0'])
```

`git describe` reads LOCAL refs. `gh release create` — what §13 step 7 tells you to run — creates
the tag on the FORGE. A clone that never fetched stops at the last tag it happened to have. So the
anchor is the newest local tag while the sentence is phrased about the newest RELEASE, and the two
diverge silently on exactly the machine that does the releasing.

**Enumerated with a command, not from memory** (`CLAUDE.md` §5): `git grep -n "describe --tags"
-- scripts plugin/scripts` returns ONE member. No sibling to leave behind.

**Two things this is a member of.** `CLAUDE.md` §8 — a check whose answer depends on what is on your
disk — and BACKLOG §152, *advice that fires every run trains filtering*. §152's evidence was
`adr-lint`'s fence advice, which was true-but-unactionable. This is worse: a false conclusion, every
prompt, in the product whose subject is false claims about work. §152 stays open on its own terms;
this is its second instance and the sharper one.

**AND THE LINE HAD NO TEST.** `tests/branch-state.test.mjs` covered green, red, still-running,
could-not-look, the cache, the budget and the seam — and never once rendered a state with
`shippedSinceTag > 0`. That is how it shipped, and it is the whole lesson: the arm nobody asserted
is the arm that was wrong.

**THE FIX.** `releaseAnchor` asks the forge for its newest release and diffs from that commit. It is
asked ONLY when the local anchor already claims something is pending — the one case where the advice
fires — so a repository with nothing to release spawns no third subprocess inside the 8s hook
budget. That restriction is asserted by a test that spies on the process table, not assumed.

Null is a real answer and the COMMON one for adopters: no `gh`, not a GitHub remote, no releases cut
at all. Then the anchor stays local and the line says so — *"the newest tag THIS CLONE knows — a
release tagged on the forge would not be here"* — because that and "the newest release" are
different observations and ADR-005 forbids printing them alike.

⚠ **The arm that would have failed silently and flatteringly:** `targetCommitish` is a branch NAME
for a release cut from a branch. Diffing against it anchors on the branch tip, which is HEAD, so it
would report nothing unreleased FOR EVER. Only a 40-hex value is accepted and the commit must be one
this clone holds.

```
node scripts/mutate.mjs --case 'branch-state: a targetCommitish'
  RED  a targetCommitish that is not a sha is not an anchor
node scripts/mutate.mjs --case 'branch-state: a release commit this clone lacks'
  RED  a release commit this clone lacks is not an anchor
node scripts/mutate.mjs --case 'branch-state: the forge is asked only'
  RED  the forge is asked only when the local anchor says work is pending
node scripts/mutate.mjs --case 'branch-state: a locally-anchored release line'
  RED  a locally-anchored release line says its anchor is local
bash scripts/selftest.sh   exit 0, 789 tests
```

**NOT fixed, and deliberately:** `git fetch --tags` was the obvious move and it is the wrong one —
it silences the symptom on one machine and makes the defect unreproducible for everybody else. The
state was left alone until the mechanism was fixed.

**Left open by this:** the forge lookup asks for the newest release of the repository the `gh`
remote resolves to, whatever branch it was cut from. A repository that maintains release branches
would anchor a feature branch on a release from another line and undercount. Nothing here detects
that; it needs a repository shaped that way to be worth solving.

### The different-lineage review found four more, and two of them were mine

`gpt-5.6-sol` at `high`, read-only, on `1888954` and `9453c01`: **REQUEST CHANGES**, five findings,
four HIGH. All accepted after reconciling each against source, folded in as `c42f213`. Recorded here
because the shapes are more interesting than the patches, and because two of them were introduced by
the very commits that were fixing this section.

**"Ask only when the answer could change" is the same mistake as not looking.** The first version
called the forge only when the LOCAL diff was already non-empty, to save a subprocess inside the 8s
hook budget — and I wrote a test asserting that restriction, which is how confident I was. It hides
two shapes: a local tag NEWER than the release and pointing at HEAD makes the local diff empty, so
nothing is asked and everything between the release and that tag goes unreported; and a clone with
no local tag at all never asks either. The optimisation was a prediction about the answer, made
without the answer.

**Existence is not ancestry.** `git cat-file -e` proved this clone HOLDS the release commit, which a
fetched release branch also satisfies. `merge-base --is-ancestor` is the same one process and is
what a diff from that commit actually needs.

**A filter that was already missing does not become correct by being inherited.** `gh run list
--commit` returns every workflow at that sha, and `selectRun` prefers ANY `workflow_dispatch` on a
tie — so an unrelated dispatched workflow could beat the selftest push and clear a sha whose
campaign was cached. `--limit 1` had the identical exposure and nobody had named it; §154's fix made
it reachable and therefore visible. Now `--workflow selftest.yml`.

**The fallback I argued for was the flattering branch.** An unparseable `createdAt` fell back to
gh's own first entry, and I justified it in a comment as "the behaviour before the tie-break
existed". That entry can be an OLDER successful dispatch while a newer push exists — SUCCESS where
the honest answer is CACHED. Ordering nothing can establish is `null` now, which the caller already
renders as exit 2. ⚠ **A comment citing precedent is not a reason**, and this is the second time in
this section that a true sentence carried a false conclusion.

**And one from the residual-risks section rather than the findings:** `gh release view` with no tag
resolves the repository's latest, and rather than rely on what that excludes, `isDraft` and
`isPrerelease` are read and either one refuses the anchor. A draft would have counted work as
released that no adopter can install.

The LOW finding was two vacuous tests, both mine: `the newest dispatch is chosen` put the dispatch at
index 0, so it passed for a `selectRun` that only ever returned `runs[0]`; and the forge clean and
dirty cases were separate tests where §4 wants the counterexample in the same one. Both rewritten.

⚠ **Round one was killed at 25 minutes by `gtimeout` at `xhigh` and produced nothing.** Per §12 that
certifies nothing, and the re-run at `high` — the rubric's own tier for a bounded local change —
returned in under two minutes with all five findings. The effort level was over-routed and the cost
was a wasted half hour, not a better review.

### Round two: the fixes moved two of the holes, and the review PROBED instead of arguing

`REQUEST CHANGES` again, two HIGH, folded in as `4f9f2b4`. What makes this round worth recording is
the method: it ran a slow `gh` through the seam and read the render, rather than reasoning about
what the code would do.

**COULD-NOT-LOOK WAS SILENCE, and making the lookup unconditional is what made it reachable.**
`shippedSinceTag` was `null` for a diff that never ran and `0` for one that ran and found nothing,
and `render` printed nothing for both. So an 8-second `gh release view` spends the collection budget,
every later git call is refused, and the reader prints a clean, green, entirely silent report on a
branch with unreleased work. **The round-one fix created the exposure and the round-one review
could not have seen it**, because the lookup was still conditional when it read the code.

`budgeted` now marks a prevented command `budget: true` — a command that RAN and failed is a
different thing from one that was never spawned, and one `ok: false` for both is how the two became
the same silence. `collect` carries `releaseBlocked`; `render` prints
`COULD NOT LOOK — … That is not "nothing to release"`.

**THE REFUSAL WAS DEFEATED BY THE LINE AFTER IT.** Every forge refusal collapsed to `null`, and
`git describe` then handed back the very tag that had just been refused. A prerelease sitting at HEAD
is the case: reject it as the anchor, fall back, anchor on it anyway, empty diff, silence. `null` was
carrying four different answers and the caller could act on none of them.

`releaseAnchor` returns `{kind, name?, ref?, note, blocked}` — `release`, `absent`, `rejected`,
`unrelated`, `unknown`. `name` is carried ON A REFUSAL so the caller can keep that tag out of its own
fallback. `blocked` separates what must be said from what must stay quiet: **`absent` is deliberately
not blocked**, because most adopters have no releases cut and §152 is exactly about advice that fires
every run.

**And the LOW finding was two tests proving less than they named** — both written the same day, both
by me. The ancestry fixture let every unlisted command fail, so restoring `cat-file -e` also returned
null and it still passed: it named ancestry and proved that *some* git call failed. `cat-file -e`
succeeds in that fixture now and only ancestry fails, and the mutant SWAPS the two guards rather than
deleting one. `--workflow selftest.yml` had no test at all and could be deleted with the focused suite
unchanged; `runListArgv` is the callable boundary now (§4).

⚠ **The fold-in then produced a GREEN mutant, which is the same lesson one turn later.** The render
test injects its own runner returning `budget: true`, so it exercises the FLAG and never the code
that sets it — deleting the marking from `budgeted` changed nothing it could see. Fixed by asserting
on `budgeted` itself, both directions (`d16f85b`). **A test that supplies the mechanism it is
checking is testing its own fixture**, and that is the third time in this section that a green result
came from measuring the wrong thing.

Ten branch-state mutants and six release-evidence mutants, all RED. Three review rounds, three sets
of real findings; the count of rounds is not the point, that none of them was empty is.

### Round three: the hole moved sideways a third time, and the review PROBED again

Two HIGH, folded in as `4b3a3c7`. The reviewer imported the module, injected runners, and read the
brief line — it did not reason about what the code would do. Both findings are the same sentence
in different places: **round two's fix closed one path and moved the same honesty hole one step
sideways.**

**Every forge failure that was not "no release" was quiet.** `HTTP 401: Bad credentials`, a network
drop, a permission error, a timeout, `gh` missing — all landed in `absent` with `blocked: false`. A
local tag at HEAD then diffed to zero and the reader printed a green, silent, release-clean line.
Only a POSITIVELY identified no-release is silent now; everything else is `unknown` and says so.
That costs an adopter without `gh` a second could-not-look line, and they already get the CI one for
the same reason — consistent rather than new noise, which is the §152 test applied honestly.

**A rejected release was swallowed by an ALIAS.** `blocked` was only reported when there was no
anchor at all, so a prerelease at HEAD plus any local tag under a DIFFERENT name — `candidate` on
the same commit — anchored locally, diffed to zero, and fell silent. The name-comparison guard stops
the identical tag walking back in and does nothing about an alias, so **the blocked STATE has to
survive the fallback**, not the tag be filtered out of it.

⚠ **AND THAT FIX MADE THE NAME FILTER LOOK DEAD — the second GREEN mutant of the session.** With an
empty diff both paths now reach COULD NOT LOOK, so deleting the filter changed nothing any test
could see. It is still load-bearing where the diff is NOT empty: anchoring on the prerelease measures
"since the prerelease", which UNDERSTATES the unreleased work and prints a confident count while
doing it. Covered now (`fb2464f`).

**Both GREENs this session had the same shape and the same answer.** A surviving mutant is a finding
about the test; assert the mechanism where it is load-bearing, never pick an easier mutant (§4).
The first was a render test supplying the flag it was checking; the second was a guard whose distinct
effect only shows in a case no fixture had.

⚠ **A process finding worth more than any single defect here.** Round one was killed at 25 minutes by
`gtimeout` at `xhigh` and produced nothing; round three hung for 12 minutes on
`Reading additional input from stdin...` and produced nothing. `.claude/rules/12-reviews.md` already
says to redirect stdin from `/dev/null` and I omitted it twice — about 37 minutes for an instruction
that has been written down since the rule was created. **This is §152's shape once more: an
instruction where a mechanism belongs**, and the reviewer cannot report the defect because the
reviewer is what failed to start.

Three rounds, three sets of real HIGH findings, and each round could only find its own because the
previous fix created the exposure. The count of rounds is not the point; that none of them was empty
is.

### Round four: a call the previous fold-in made explicitly, overturned on evidence

Two HIGH and a MEDIUM, folded in as `7b85e27`.

**`HTTP 404` was in the quiet list and is not evidence of anything.** A missing repository, a wrong
remote and a private repository the token cannot see all return 404, and each was being read as "no
release cut" — silence over a state nobody had established. `gh` says `release not found` when the
repository is readable and holds none, which is the observation actually being claimed. Membership
in the quiet set is by EXACT DIAGNOSTIC now, never by HTTP status.

**And narrowing `absent` had made a non-GitHub repository shout on every prompt** — a could-not-look
line for the whole life of any repository not hosted there. `none of the git remotes …` is
NOT-APPLICABLE, not unknown: there is no forge release to be uncertain about. §152 is exactly this,
and the honest classification and the quiet one turned out to be the same one.

⚠ **THE THIRD FINDING OVERTURNED A CALL THE PREVIOUS FOLD-IN MADE EXPLICITLY.** Round three's commit
argues, in its own message, that a non-empty count is not silence and the local hedge already says
where the number came from — so a blocked forge beside a real count could be suppressed. That is
wrong for a reason the argument did not consider: **the local tag can be NEWER than the published
release**, so the count UNDERSTATES the unreleased work while omitting the reason it might.
Understating is the flattering direction. The hedge says the anchor is LOCAL; it does not say the
forge was UNREADABLE. Both clauses render now.

⚠ **The catalogue gate failed the suite during this change** — `every catalogue entry still matches
the source it mutates, exactly once` — because a render rewrite left a mutant pointing at text that
no longer existed. The gate doing its job on the same commit that adds two more entries to it.

**A pattern worth naming, because four rounds is not a badge.** Every round found a real defect, and
every one of them was in the CLASSIFICATION of `gh`'s failure modes — never in the anchoring, the
ancestry, or the diff. The feature's surface is "how many ways can a subprocess fail, and which of
them may be silent", and that surface is bigger than the defect it was built to fix. Round five was
asked to judge the design rather than hunt a fifth defect, on the grounds that the answer is worth
more than another narrow finding.

### Round five: the design judgement, and what shipped

`REQUEST CHANGES` a fifth time — a MEDIUM saying the round-four fix had moved again (a non-GitHub
repository WITHOUT `gh` gets ENOENT, which is `unknown`, which is a could-not-look line on every
prompt), and a MEDIUM on a test weakness. But round five was asked a different question, and its
answer is what shipped:

> I would ship the simpler local-tag wording and remove the forge lookup from this always-on reader.
> Four review rounds have demonstrated that correctly classifying every `gh` failure is the dominant
> feature, not incidental plumbing … The original defect only required the reader to stop calling a
> local tag a published release.

**Taken.** `releaseAnchor`, `NO_RELEASE` and the structured-answer machinery are gone: **116 lines of
production code and 268 of test**, for a subprocess inside an 8s hook budget that five reviews could
not get right. What ships is the fix that was available on the first day and was rejected as the
lesser one:

```
plugin/ changed in 2 file(s) since v2.81.0, the newest tag THIS CLONE holds — a release
tagged on the forge is not here, so check `gh release view` before treating this as
unreleased (§13).
```

⚠ **THE RULE THIS PAYS FOR: a reader that fires on every prompt may not depend on a subprocess whose
failure modes it must enumerate.** `release-evidence.mjs` answers the same question exactly and is
allowed to be slow, allowed to need `gh`, and allowed to refuse — because it runs once, when someone
asks (§13.5). The always-on reader gets the cheap honest observation and NAMES what it cannot see.

**What survived the revert, because each was right independently of the forge:**

- `budgeted` marks a command it PREVENTED, so a spent budget is distinguishable from one that ran and
  failed. Without that field the two are one `ok: false` and become the same silence.
- The release line says COULD NOT LOOK rather than falling silent when the diff did not come back —
  `null` for "never ran" and `0` for "ran and found nothing" rendered identically, which is this
  reader's own defect class.
- An untagged repository stays silent, because there is genuinely nothing to compare.
- `fetchRun` takes `exec` as a seam, so the full-sha expansion is asserted at the boundary that
  shells out. `gh run list --commit <abbreviated>` returns `[]`, which reads exactly like "no runs".

**And the honest accounting.** Five rounds found real defects and the fifth found that the feature
was the wrong shape — which the first four could not, because each was asked whether the code was
correct and none was asked whether it should exist. **A review answers the question you put to it.**
The step-back question cost one round and saved the feature's whole maintenance surface; it should
have been asked at round two, when the second consecutive finding landed in the same classifier.

### ⚠ The revert is confirmed by the release that shipped it

Cutting v2.86.0 produced the fact the whole arc was arguing about, without anyone looking for it:

```
gh release view <tag> --json targetCommitish
  v2.86.0 → main
  v2.85.0 → 46a265611ecf407b1fab10faa2c364c1e0e3b188
  v2.84.0 → 16f06fc378cce8721cf2c7d40446907a94a1af11
  v2.83.0 → 6402b1b36d69f7b03b6e5c962b3372f72627bf81
  v2.82.0 → 021fea1ddfef9883e7852467c798a2ff63c79e68
```

**Five releases cut the same way by the same command, and one of them records a BRANCH NAME.** The
removed `releaseAnchor` refused anything that was not 40 hex — correctly, because diffing against a
branch name anchors on its tip and reports nothing unreleased for ever. So the forge lookup would
have **refused this repository's own newest release**, and it would have done so nondeterministically:
green on four releases, could-not-look on the fifth, with nothing in the tool or the reader able to
say why.

That is the failure surface argument made concrete. The classification was not hard because the code
was careless; it was hard because **the field being classified is not stable**, and no amount of
review rounds finds an instability that only appears on the sixth sample. The always-on reader
never had to know this. `release-evidence.mjs` does not either — it asks about RUNS, not releases.

⚠ **This is also a live check on `.claude/rules/13-releasing.md`.** §13.7 says `gh release create
vX.Y.Z --latest`, and nothing there passes `--target`. Whatever makes `targetCommitish` land as a sha
or as `main` is not in the documented procedure, so no reader may depend on it. Not chased further:
the code that cared about it is gone.

## 158. CLOSED 2026-09-07 — the always-on reader was KILLED BY ITS HOST on a non-GitHub remote, so §15's whole mechanism was silently absent

Reported from outside this machine — GitHub issue #12, against 2.85.0, from a Windows 11 / Git Bash
checkout whose only remote is a self-hosted GitLab. The `UserPromptSubmit` hook was killed by its
host on three consecutive prompts:

```
UserPromptSubmit hook timed out after 20s — output discarded.
```

⚠ **A KILLED HOOK RENDERS NOTHING.** Not a degraded line, not a `COULD NOT LOOK` — the host discards
the output entirely. So the reader built because *a session that does not ask is told nothing*
(§15's incident) was itself telling that adopter nothing, on every prompt, while reporting no fault
anywhere. Attribution was the reporter's and is definitive rather than inferred: it is the only
`UserPromptSubmit` hook in any installed plugin or in user/project/managed settings declaring
`"timeout": 20`.

### Two independent causes, each enough alone, both MEASURED by the reporter

**1. `gh` was asked about a repository `gh` cannot answer for, on every cache miss.** `collect()`
ran `gh run list --branch <b> --limit 1 --json …` unconditionally. Where no remote points at a known
GitHub host the CI half is *structurally* unavailable — and finding that out is not free:

- standalone in that checkout: **4,214 ms**, exit 1, `failed to determine base repo: none of the git
  remotes configured for this repository point to a known GitHub host`;
- in a live session it did not fail fast, it BLOCKED — the hook's own output carried `spawnSync gh
  ETIMEDOUT` on one turn and `budget of 8000ms spent before 'gh run list --branch master …'` on
  another.

So every non-GitHub adopter paid between 4s and the entire 8s collection budget, per cache miss, for
an answer that cannot exist.

**2. A host kill discarded the git half AND wrote no cache, so there was no backoff.** The two
halves are deliberately independent, so the render can say COULD NOT LOOK about CI while still
reporting branch, head and dirt. That holds when `BUDGET_MS` expires. It does not hold when the HOST
kills the process: the whole output goes, including the git half already gathered — the half a
session actually reads. And `cached()` called `write()` only after `gather()` returned, so a killed
run left **no cache entry at all** and the next prompt re-paid in full. That is exactly the observed
shape: three timeouts in a row, none cheaper than the last. **A completed slow run cached its own
COULD NOT LOOK for 120s; a killed one cached nothing, which is the case that most needed it.**

**3. The report ruled out the easy fix itself.** Re-measured warm with a forced cache miss in the
same checkout: **1,390 ms** end to end, exit 0. 20s is ample and the hang was the whole cause —
so nothing here argued for a larger timeout, and the reporter said so before anyone could suggest it.

### The fix — 5e0243c, then 1f98983 after review

The discriminator for (1) is LOCAL, needs no network, and costs about 150ms beside the six `git`
calls `collect` already spawned: `git config --get-regexp '^remote\..*\.url$'`. Nothing matching
`/github/i` means `gh` is not asked, and the reason is carried into the render rather than an empty
answer being implied (ADR-005, `CLAUDE.md` §3).

⚠ **This buys latency with a bounded, VISIBLE loss.** A GitHub Enterprise host whose hostname does
not contain `github` loses its CI line — and is TOLD it lost it, on the same could-not-look path.
Taken deliberately against a hook that was being killed outright.

For (2), `collect` now takes a `checkpoint` callback and calls it ONCE with the git half **before**
`gh` is attempted; `cached` persists it. The checkpoint is a strictly worse answer than the final
one and says so in its own notes — `'this answer was stored before the CI half was gathered'` — so a
session reading it is not misled. A floor, not a result.

### ⚠ Round nine: the fix for ADR-005 broke ADR-005 one line lower

A different-lineage review of 5e0243c returned two MEDIUM findings, both confirmed against source.

**`git config --get-regexp` exits 1 when NOTHING MATCHED**, which is a real answer about the
repository: it has no remotes. Every *other* failure — the budget spent, git absent, an unreadable
config — is a question that could not be PUT, and `remotes.ok` alone cannot tell those apart. All of
them rendered as *"no remote names a GitHub host, so `gh` was not asked"*, a verdict. The reviewer's
probe showed an unreadable lookup reading identically to positive absence. `shell` now carries the
exit status a command reported, and the two keep different words; `gh` is skipped either way, so the
latency fix is unaffected.

**And the checkpoint test was vacuous about the thing it was named for.** It drove a hand-written
`gather` that checkpointed and returned, so it exercised the forwarding in `cached` and nothing at
all about `collect`'s ordering — *moving the checkpoint after `gh` would have escaped it*, which is
the single thing the checkpoint exists to prevent. It is now asserted through `collect` itself on
the real `run` seam, and the second prompt is PERFORMED rather than described: a first run killed
during the network half, then an actual `cached()` read that must not gather again and renders an
explicitly unknown CI beside a surviving git half. That is `CLAUDE.md` §4 — assert the mechanism,
not a downstream effect something else also covers.

Four mutants added across the two commits; `branch-state` now carries eleven.
`node scripts/mutate.mjs --case branch-state` — **11/11 noticed**.
`bash scripts/selftest.sh` — exit 0, 795 tests.

### §5 — the class, enumerated with a command rather than from memory

The class: **an external tool spawned on an always-on hook path whose failure is not fast.**

⚠ **And the obvious command is the wrong one, which is itself the finding.** Grepping for
`spawnSync('…'` finds `git` five times and `node` once and MISSES `gh` ENTIRELY — because
`branch-state.mjs` passes one argv array through a `run` seam, so no command name is ever a spawn's
first argument there. A class audit that cannot find the member it was written about is not an
audit. The enumeration that works looks for the argv:

```
$ grep -ohE "\['(gh|git|node|npm|npx|curl|python3?|py|taskkill|codex)'" \
    plugin/scripts/lifecycle.mjs plugin/scripts/branch-state.mjs plugin/scripts/run-shell-hook.mjs \
  | sort | uniq -c
   2 ['gh'
   8 ['git'
   1 ['py'
   1 ['python'
   1 ['python3'

$ grep -ohE "(spawnSync|execFileSync|spawn)\('[a-z0-9.]+'" <the same three files> | sort | uniq -c
   5 spawnSync('git'
```

**`gh` is the only network-bound member**, and both its call sites are in `branch-state.mjs`, both
now behind the local gate. Everything else is `git` or `node` — local, and no slower to fail than
the filesystem. `py -3` / `python` / `python3` are `resolvePython`'s Windows probe: local, and
reached from a GATE rather than from the `UserPromptSubmit` reader, which is `branch-state.mjs`
alone. `taskkill` appears only through `spawnSyncImpl`, on Windows teardown. **No sibling left.**

### ⚠ The third independent arrival at the same conclusion, and the first from outside

§157's review rounds four and five flagged the non-GitHub case while arguing to cut the forge lookup
from this reader, on exactly this ground: *a check that runs on every prompt may not depend on a
subprocess whose failure modes it has to enumerate.* Both rounds treated it as noise — a cosmetic
line on a repository nobody in this project runs. Issue #12 says it was not noise: on Windows, with
a non-GitHub remote, the same dependency killed the entire reader on every prompt. **The removal was
right for a stronger reason than the one that motivated it, and the evidence for that reason had to
come from a machine and a repository this project has never seen.**

### ⚠ Round ten: the discriminator was reading an exit code Windows can forge

`git config --get-regexp` exits 1 for "no match", so round nine's fix had to read an exit code to
tell *no remotes* from *could not look*. A different-lineage review found that reading unsound **on
the one platform this was reported from**: libuv gives a forcibly killed Windows process exit status
1 as well, so on Windows a killed lookup and git's own no-match are the same number, and the honest
arm could still render as a verdict.

`git remote -v` exits 0 with EMPTY OUTPUT where there are no remotes. The distinction is carried by
`ok` alone, where no platform can blur it — and the `status` field round nine added to `shell` is
gone with the reason for it, which also answers the same review's second finding (nothing regressed
that field at the seam).

**The general form, filed to craft:** a `run`/`shell` seam that reports only `{ ok }` cannot
distinguish an exit code that means *no match* from a process that could not run — true of `grep`,
`git config --get-regexp`, `diff`. The cheap fix is to carry the status; **the better fix is to pick
a command whose success/failure already answers the question**, because a status can be forged by a
platform and `ok` cannot.

Third finding, LOW and correct: the second-prompt test killed the run AFTER `collect` returned, so
an unusable early checkpoint followed by a real one after `gh` would have satisfied it. The runner
now throws INSIDE `gh run list`, where the host actually kills, and the test asserts that what is on
disk at that moment is usable and claims no CI answer.

### The CI flake this release hit, which is not §158's but is on its path

Dispatched run `34107450870` failed one job: `the grandchild never wrote a beat, so the fixture
proved nothing` (`tests/timeout-tree.test.mjs`). At a 1s fence timeout the fence was killed before
bash had started the background subshell, so nothing was alive to prove the tree kill on. **The
fixture failing loudly rather than passing vacuously is the assertion working** — BACKLOG §127b
replaced a clock with exactly this check for exactly this reason. What it needed was room: three
seconds is ~15 of the grandchild's 100 beats, so the "it ran to completion on its own" guard still
bites and the fence's own `sleep 60` still times out long before it.

⚠ **And `release-evidence` refused once on the way, correctly** — §154's shape reversed. Dispatching
immediately after a push gave the PUSH run the later `createdAt`, so the newest run for the sha was
a cached campaign and the tool said `CACHED`, not SUCCESS. Re-dispatching with no push in between
fixed it. The lesson is the one §154 already recorded from the other direction: **the two runs a
release-time push produces are close enough in time that neither ordering can be assumed.**

Released as **v2.87.0** at `35c75d8`, `--latest`, on `release-evidence.mjs` SUCCESS — 23 jobs,
dispatched run `34110706970`. Issue #12 closed with the fix, the two review rounds, and the
Enterprise-hostname cost stated rather than hidden.

## 159. CLOSED 2026-09-07 — §13's own release order loses a race it creates, three times in one session

`CLAUDE.md` §13 says push (2), then dispatch the full campaign (3). Both raise a run at the same
sha, and `release-evidence.mjs` picks the NEWEST by `createdAt` — so which one it judges depends on
whether the push webhook or the `gh workflow run` API call registers first. Measured across one
afternoon's four releases:

| sha | push `createdAt` | dispatch `createdAt` | newest | verdict |
|---|---|---|---|---|
| `e1fc9c0` | 09:41:29 | 09:41:34 | dispatch | usable |
| `29c4dc1` | 10:00:27 | 10:00:26 | **push** | `CACHED`, refused |
| `35c75d8` | — | — | dispatch | usable |
| `3c0e9cc` | 12:27:49 | 12:27:48 | **push** | `CACHED`, refused |

**One second, either way, three times out of four decided by the network.** The refusal is the tool
working exactly as §154 built it — a push run's mutation campaign may reuse cached verdicts, and a
release may not rest on one. But the procedure that produced the refusal is this repository's own,
and it costs a full campaign every time it loses: dispatch, wait ten minutes, get told to dispatch
again, wait ten more.

**The fix is ordering, not tie-breaking.** §154 already resolves an exact tie toward
`workflow_dispatch`; this is not a tie, it is a one-second loss. Waiting until the push run EXISTS
before dispatching makes the dispatch unambiguously newer, needs no change to
`release-evidence.mjs`, and adds no judgement to a tool whose whole value is that it makes none.

```bash
git push
gh run list --commit "$(git rev-parse HEAD)" --limit 1 --json databaseId   # until it answers
gh workflow run selftest.yml --ref main
```

⚠ **AND THE COST WAS PAID BEFORE IT WAS SEEN.** The first refusal was read as a one-off and worked
around by re-dispatching; only the third made the pattern visible. A procedure that fails
occasionally and recovers cheaply is one nobody writes down — which is `docs/BACKLOG.md` §152's
shape applied to a runbook rather than to a gate's output.

## 160. CLOSED 2026-09-07 — ten of eleven gates answered `unknown option: --help`

Reported the same day by **two outside corpora independently**, neither of which had read this
repository's source:

> *"Options are discoverable only by grepping the source."* — a 17-record corpus, auditing 2.88.0
>
> *"`adr-verify --help` prints `unknown option: --help`. Bare invocation prints the usage, so the
> information is there. Small, but it is the first thing anyone types."* — a session that had just
> shipped an ADR task through the full drill

Reproduced here on 2.90.0, over every executable in `plugin/bin/`:

```
adr-debt           exit=2 unknown option: --help
adr-judge          exit=2 unknown option: --help
adr-lint           exit=2 unknown option: --help
adr-next           exit=2 unknown option: --help
adr-retire-check   exit=2 unknown option: --help
adr-verify         exit=2 [adr-verify] unknown option: --help
arch-lint          exit=2 unknown option: --help
postmortem-verify  exit=2 unknown option: --help
qh-mcp             exit=2 qh-mcp: unknown option: --help
qh-root            exit=2 qh-root: unknown option: --help
spec-verify        exit=0 usage: spec-verify [-h] …
```

**Ten of eleven.** The one that worked is the only gate using `argparse`, which gives `-h` for free —
so this was never a decision, it is what happens when every gate hand-rolls `reject_unknown_flags`
and nobody types the flag that the function is designed to reject.

⚠ **AND TWO OF THEM PRINTED THEIR USAGE ANYWAY, AT EXIT 2, AFTER AN ERROR LINE.** `adr-judge` and
`qh-root` emit `unknown option: --help` and then the usage block. So the information was there, wearing
a refusal — which is this repository's own ADR-005 inverted: a successful answer dressed as a failure.

Every gate now prints its module docstring and exits 0 for `--help` and `-h`.

⚠ **THE FIX IS SIX COPIES, AND THE TEST IS WHAT MAKES THAT SAFE.** `reject_unknown_flags` is duplicated
into six gates and four others parse their own argv; sharing it would mean the 25-line `plugin/lib/`
loader in each, which is more duplication than it removes. Instead `tests/gates.test.mjs` walks the
BIN DIRECTORY — not a list — and requires every executable in it to answer both flags with exit 0 and
a real usage block, and to not say "unknown option" while doing it. A new gate that forgets this fails
here rather than shipping mute.

**Named, not fixed** (from the same reports): `adr-debt` truncates follow-ups at 70 characters with no
`--full` flag; `adr-next` reports `READY` for tasks whose Affected Files already exist in HEAD; and
`Enforced-by: None — <reason>` requires an em dash, which conflicts with the house convention against
them in written output.

## 161. CLOSED 2026-09-07 — the shipped workflows' parse check COULD NOT FAIL on the node CI pins, and a node upgrade is the only reason anyone found out

**Found by:** `bash scripts/selftest.sh` going red mid-session on bytes nobody had touched.

`scripts/selftest.sh` and `tests/installed.test.mjs` both validated the three shipped
workflows with `node --check`. On 2026-09-07 the same three files, unchanged, gave:

```
$ ~/.nvm/versions/node/v24.11.1/bin/node --check plugin/workflows/consensus.js ; echo $?
0
$ /opt/homebrew/bin/node --check plugin/workflows/consensus.js
SyntaxError: Illegal return statement
Node.js v26.8.1
```

All three failed under v26.8.1; `selftest.sh` runs under `bash -l`, which put the
newer node first, while the interactive shell had the older one. CI pins node 24
(`.github/workflows/selftest.yml`), so CI was green throughout and this was invisible
there.

**The check was wrong, not the files.** A Workflow script is neither an ES module nor
a CommonJS one. The Workflow tool's contract requires the file to BEGIN with `export
const meta = {...}` — ESM — and documents a top-level `return` as how a workflow
yields its result — a function body. No node parse goal accepts both, so `node
--check` was answering about a dialect it does not implement. Deleting the top-level
returns to satisfy the proxy would have changed shipped behaviour to make a wrong
check pass.

⚠ **AND ON NODE 24 IT WAS VACUOUS — the check could not have gone red at all.** Chasing
the red turned up the worse half. `node --check` on a `.js` file whose contents include
an `export` exits 0 no matter what follows it:

```
$ printf 'const broken = (\n'                    > c1.js  # no export
$ printf 'export const a = 1\nconst broken = (\n' > c2.js  # same error, after an export
$ printf 'export const a = 1\nconst broken = (\n' > c3.mjs # same bytes, .mjs
$ for f in c1.js c2.js c3.mjs; do node --check $f >/dev/null 2>&1; echo "$f=$?"; done
c1.js=1
c2.js=0     # ← an unbalanced paren, accepted
c3.mjs=1
```

Measured on v24.11.1, which is what `.github/workflows/selftest.yml` pins. So for as
long as CI has run this check on `plugin/workflows/*.js`, it has been incapable of
reporting a syntax error in any of them — CLAUDE.md §4's "every check that can return
clean must be shown returning dirty", failed by the gate this repository ships. The
node 26 red was not the defect; it was the first thing that ever made the check speak.

**Fix:** `plugin/scripts/workflow-parse.mjs` reads the file the way the runtime wraps
it — strip the one export the format allows, compile the rest as an async function
body — and returns a message naming the file. `scripts/selftest.sh` and
`tests/installed.test.mjs` use it. Only `export <declaration>` is stripped, so `export
default` and `export {…}` stay refused rather than quietly widening the dialect, and
`tests/workflow-parse.test.mjs` shows it returning dirty in every arm it can.

**Audit of the class (§5):** every `node --check` in the repository.

```
$ grep -rn "node --check\|'--check'" scripts/ tests/ plugin/ | grep -v workflow-parse
scripts/selftest.sh:101:node --check "$ROOT/scripts/lifecycle.mjs"
scripts/selftest.sh:102:node --check "$ROOT/scripts/run-shell-hook.mjs"
scripts/selftest.sh:103:node --check "$ROOT/scripts/verify.mjs"
tests/lifecycle.test.mjs:439:    '--', process.execPath, '--check', path.join(pluginDir, 'scripts/lifecycle.mjs'),
tests/package.test.mjs:684:    const child = spawn(process.execPath, ['--check', file], …)
plugin/scripts/post-edit-check.sh:45:    node --check "$file_path" 2>&1 | tail -30 || true
```

- The three `scripts/*.mjs` and `tests/lifecycle.test.mjs` name `.mjs` files, where the
  vacuity above does not apply and `--check` asks the right question. They stay.
- `tests/package.test.mjs:684` already knew, in a comment dated 2026-09-03: it compares
  each mutant against its ORIGINAL precisely because a workflow "does not parse
  standalone even unmutated". That is the right call for a mutation sweep and needs no
  change — but the lesson never reached `selftest.sh`, which is how this survived.
- ⛔ `plugin/scripts/post-edit-check.sh:45` was SHIPPED and is the one that mattered: a
  `PostToolUse` hook that runs after every Edit/Write, printing `SyntaxError: Illegal
  return statement` over a CORRECT workflow for any adopter on node 26. An advisory
  that is always wrong on a whole file type is one a reader learns to skip (ADR-037).
  It now tries the module goal, then the Workflow dialect, and speaks only when
  NEITHER parses — saying so in those words, so a reader is not told there is one
  parse goal when two were tried.

**Sibling left as a new task:** nothing in this repository executes a workflow, so
`workflow-parse.mjs` proves the file parses in the dialect and NOT that the Workflow
tool accepts it. That gap is the same shape as the one `node --check` had, only much
smaller, and closing it needs a runner this repository does not have.

**A different-lineage review of 2cde29f (§12) found four more ways to get a FLATTERING
answer out of the fix itself, and all four are now regressions:**

1. **The header strip was global and the header was never required.** `/^export
   (?=…)/gm` stripped every column-zero declaration export, so a file with NO `export
   const meta`, one whose header is not first, one carrying a second export, and one
   with an export nested in a block all came back clean — none of them is a Workflow
   script. One anchored, non-global strip, and the header is now required.
2. **`spawnSync` can return `status: 0` TOGETHER WITH an `ETIMEDOUT` error**, and a
   killed child returns a null status with no error at all. Reading `status === 0`
   first returned clean for a check that never finished; the null case fell through to
   `parses as neither`, a verdict nothing measured. The failure fields are read first,
   and the test injects all three shapes through a `spawn` seam.
3. **An unusable `TMPDIR` threw past every handler**, so the hook printed a raw stack
   and its `|| true` turned that into advice nobody could act on. It is `COULD NOT
   CHECK` now, and the CLI exits **4** for could-not-look rather than 1.
4. ⛔ **And the test written for (3) found a fourth, which no reviewer saw:** the
   CLI's own main-module guard compared `import.meta.url` to `pathToFileURL(argv[1])`.
   `/var` is a symlink to `/private/var` on macOS (§7), so a copy invoked through the
   unresolved spelling matched nothing, ran nothing, printed nothing — and exited 0.
   The most flattering failure a checker can have, in the checker written to stop
   exactly that. Both sides are resolved now.

⚠ **An exit code alone cannot say a checker ran.** Node exits 1 for its own startup
failures, which is the same code this tool uses for a finding — so a corrupt or absent
`workflow-parse.mjs` printed a `MODULE_NOT_FOUND` stack trace under the heading "here
is what is wrong with your file". The CLI now prints `QH-PARSE-COMPLETE` on stdout as
positive evidence it reached the end, and `post-edit-check.sh` reports `UNRUN` when
that line is missing whatever the exit code says.

**Second sibling:** the fixture for "a broken file is still reported" had to be an
unclosed PAREN, not an unclosed brace. `node --check` wraps a file it reads as
CommonJS, and the wrapper's own closing brace completes it — `node --check` exits 0 on
`if (1) { return { ok: true }`. Any test elsewhere that proves a syntax check bites by
deleting a closing brace is proving less than it says.

## 162. DECLINED 2026-09-24 — `adr-lint` reported 2.2× slower on an outside corpus, and NOT REPRODUCIBLE here

**Reported from outside, 2026-09-07**, by a session working a 25-record corpus:
`adr-lint` on one 4-task record took **11.2 s on 2.85.0 and 24.9 s on 2.88.0**, same
record, same machine. Consequences it observed on the same session: a corpus sweep
exceeded a 120 s tool timeout twice; `facts-gate-dispatch.sh` timed out on six commits
at budgets from 1.6 s to 24.7 s, each time reporting *"the gates have no verdict on
this edit"*; the 45 s hook boundary was exhausted before later artifacts were gated.

⚠ **The consequence is the part that matters, and it is this repository's own defect
class.** A gate that does not run, reported as nothing-is-blocked, is ADR-005 with the
timing as its cause rather than a missing branch.

**What was measured HERE, and it does not reproduce:**

```
$ for d in docs/adr/ADR-037-… docs/adr/ADR-020-…; do
    s=$(date +%s%N); python3 plugin/bin/adr-lint "$d" >/dev/null 2>&1; e=$(date +%s%N)
    echo "$(basename $d) $(( (e-s)/1000000 ))ms tasks=$(ls $d/tasks/*.md | wc -l)"
  done
ADR-037-advice-earns-its-place-by-being-acted-on 150ms tasks=3
ADR-020-a-run-leaves-a-trace-outside-the-file     42ms tasks=3
```

cProfile over one of those runs: 0.037 s total, of which 0.016 s is `builtins.compile`
— the interpreter reading adr-lint's own 4,551 lines. There is no hot loop to find in
this corpus, because nothing here is slow.

**So this is INCONCLUSIVE, not fixed and not dismissed.** Two readings fit the same
evidence and this repository cannot separate them:

1. Something in 2.88.0 scales with a property this corpus does not have — a large
   `tests/` tree the code-scanner reads, many `Enforced-by`/`Covers` pointers each
   resolving through the filesystem, or a per-pointer subprocess.
2. The 11.2 s figure was never adr-lint's own time — a cold interpreter, a slow
   filesystem, or an antivirus scanner on a Windows host would move both numbers
   together without a regression existing.

**What would settle it, and it has to come from the corpus that saw it:**
`python3 -X importtime -m cProfile -s cumulative $(command -v adr-lint) <record>`, or
simply the top 15 cumulative rows. Ask for that before changing any code — a fix
guessed at from a ratio measured elsewhere is exactly the kind of unverified change
this corpus refuses to record as done (§5).

**Do not silently raise the budgets in response.** `QUALITY_HARNESS_SHELL_TIMEOUT_MS`
is the reporter's own stated workaround and they said so; a budget raised to hide an
unexplained 2.2× is a gate tuned until it stops reporting.

**Declined 2026-09-24.** Not reproducible here; the profile command that would settle it is in the body, and it has to come from the corpus that saw it. Reopen with that profile.

## 163. DECLINED 2026-09-24 — nothing here measures what the harness costs or saves, and REWORK is the candidate that does not need token accounting

**Raised from outside, 2026-09-07**, by a session writing public copy that wanted to
assert a token saving. It could not source the claim; neither can this repository.

**What is not measured, stated plainly so nobody quotes an absence as a result:**
there is no before/after on token cost, no turn count, no cache-hit figure, on any
date. Nothing in this corpus measures its own cost, and the structural argument for a
saving — a gate binary does deterministic work in a subprocess, so the model reads a
verdict rather than doing the reasoning — is a mechanism, not a measurement. Half the
plugin is skills, which are markdown loaded INTO context, so even the structural
argument only covers `plugin/bin/`.

**The candidate instrument, credited to that session: count REWORK, not tokens.** A
gate that refuses bad work should show up as fewer repeated attempts at the same task,
and that is countable without any token accounting. This corpus already holds the
artefact: every `## Verification Log` entry is tool-written, timestamped, and carries
an exit code, so *attempts before the first exit-0 entry for a task* is a number that
exists today and that nobody has ever summed.

**Why it is still OPEN and not a task:** the number is meaningless without a control —
the same tasks attempted without the gates — and this repository cannot produce one
from its own history, because every task in it was done under the gates. A count with
no control would be a figure with nothing to compare it to, which is how an
unfalsifiable claim gets a decimal point.

⚠ **Do not publish the count as a saving if someone computes it.** A ratio measured
against no control is the shape of claim §11's research file exists to keep this
project away from.

**Declined 2026-09-24.** Nothing here measures what the harness costs or saves, and no record takes it up. The REWORK candidate is recorded above for whoever does.

## 164. CLOSED 2026-09-07 — six gates produced an exit code their own docstring never named

**Found by:** classifying three rounds of different-lineage review plus two outside
reports. Six of thirteen defects in §161 were one class, and it is not confined to
that file: **a gate has three outcomes — clean, a finding, could-not-look — and the
channel to its caller has two.** The exit code is the only part of that channel a
script can read.

Two instances were already reported from outside before today:

- *"`adr-next` exits 3 when every task is done. Reasonable, but a plain `for` loop
  over records reads it as failure."* (field report, 2026-09-07)
- §152: `adr-verify --mutant` leaves 1 for both `survived` and `inconclusive`, so a
  caller reading only the code cannot tell a finding about the test from
  could-not-look.

**Audit of the class (§5).** An AST sweep of `plugin/bin/` for literal exit codes,
against each gate's own `Exit:` block:

```
adr-judge:         exits 0, 2  — no `Exit:` block at all
adr-retire-check:  exits 0, 1  — no `Exit:` block at all
qh-mcp:            exits 0, 2  — no `Exit:` block at all
adr-lint:          exits 2, declared 0, 1
qh-root:           exits 2, declared 0, 1
adr-verify:        exits 1, declared 0, 2
adr-debt · adr-next · arch-lint · postmortem-verify · spec-verify: correct
```

`spec-verify` is the one that already had it right, and is worth copying: a dedicated
**4** for could-not-look, ranked below a real failure on purpose — *"4 is reached only
when nothing observed failed — as far as I could check, and I could not check
everything"* (`spec-verify:858`). The outside audit that reported its exit 4 as
undocumented had read only the first line of a two-line block; the block is complete.

**Fix:** all six now declare their codes, and
`tests/gates.test.mjs::every exit code a gate can literally produce is declared in its
own docstring` parses each gate with `ast` and fails on any literal code the docstring
does not name. Two catalogue entries prove it bites: one drops a code from a block, one
deletes a block.

⚠ **The check is ONE-DIRECTIONAL AND SAYS SO.** `sys.exit(2)` is findable in an AST;
`sys.exit(worst)` is not. So `source ⊆ declared` is what it can prove, and a declared
code with no literal is NOT reported as unreachable — a mirror of a parser that claims
more than it can see adds silence, not safety. `spec-verify`'s 3 and 4 are exactly that
case and are correct.

**Sibling left as a new task:** declaring a code is not the same as HAVING one for
could-not-look. `adr-verify --mutant` still leaves 1 for both `survived` and
`inconclusive` (§152), and the docstring now says so rather than fixing it. Giving that
state its own code is a behaviour change for every caller of `--mutant`, so it belongs
in a record and not in this sweep.

## 165. DECLINED 2026-09-24 — `workflow-parse` proves a file PARSES, not that the Workflow runtime will load it

**Named by the third different-lineage review of 3e872cc**, 2026-09-07, and deferred
rather than fixed because it widens the question rather than correcting an answer.

`checkWorkflowSource` compiles the source as an async function body, so it proves the
bytes are syntactically a Workflow script. The runtime asks for more. Its own contract
requires `export const meta = {...}` to be a **pure literal** — no variables, calls or
interpolation — with a non-empty `name` and `description`. Both of these return `null`
today and both are files the runtime refuses before launch:

```js
export const meta = {}                                    // no name, no description
export const meta = { name: `run-${Date.now()}`, … }      // not a literal
```

So the checker still gives a flattering answer on a file that will not run — smaller
than the one §161 replaced, and the same shape.

**Why it is not done here.** "Does this parse" and "will the runtime accept this" are
different questions, and the second has a moving answer: the metadata rules belong to
the installed Claude Code, not to this plugin, and pinning them in a gate makes this
repository assert a contract it does not own and cannot see change. §162's rule applies
— a check whose authority comes from elsewhere needs the elsewhere named.

**What would close it, in order of what it costs:**

1. Parse the `meta` object with a real JS parser and require `name` and `description`
   to be non-empty string literals. Cheap, catches the common case, and asserts only
   what the Workflow tool's own documented contract says in words.
2. Report a Workflow-goal pass as `UNPROVEN` rather than clean, so the checker never
   claims more than it measured. Correct and useless — a check that is never clean is a
   check nobody runs (ADR-037).
3. Run the file through the real Workflow runtime. There is no runner in this
   repository and adding one would ship a dependency on the host, which is what the
   `workflows/` format exists to avoid.

⚠ **(1) is the only one worth doing, and only when something asks for it.** Nothing has
yet: the three shipped workflows all carry literal metadata with both fields, and no
outside report names this. Filed so the gap is written down rather than rediscovered as
a surprise.

**Declined 2026-09-24.** Not scheduled. The two steps in the body — parse `meta` with a real parser, report a Workflow-goal pass as UNPROVEN — stay the order to take them in.

## 166. CLOSED 2026-09-07 — `adr-next` offered a WITHDRAWN task as the next thing to build

**Reported from an outside corpus** (team-memory, `main @ c0e6c95d`, plugin 2.88.0):

```
$ adr-next docs/adr/ADR-018-… --all
done     T1  …
done     T3  …
READY    T2  Task ADR-018-T2: A recall records which session ran it — WITHDRAWN
```

Three signals in that corpus said not to build it: the task's own heading ends
`— WITHDRAWN`; its `**Status:**` reads *"Withdrawn 2026-08-22. Not deferred, not
blocked: this task will not be built"*; and the README row says `withdrawn`. The
reporter's own instructions make the next READY task the **default next action**, so
the router sent a session at work the team had deliberately abandoned. They caught it
only by reading the file first.

⚠ **The asymmetry was the tell, and it is theirs:** a RECORD-level withdrawal is
handled loudly and correctly — *"the record owning these tasks is **Withdrawn**, not
Accepted … what follows is a reading of its PLAN, not of work anyone has decided to
do"*. A TASK-level one fell through to READY in silence.

**Confirmed here by reading the source, not by trusting the report.** `human_stop`
reads the Verification Log for a sign-off and nothing else; `load` never looked at a
task file's `**Status:**` header at all. That header was read by NO tool in this
plugin.

**Fix:** `status_stop` reads it. A terminal status (`withdrawn`, `superseded`,
`abandoned`, `cancelled`) routes to `stopped` with the reason and its provenance. So
does an unrecognised one — which is the second half and the more general one:

⚠ **AN UNKNOWN STATUS WAS ACTIONABLE, AND THAT IS THE WRONG DEFAULT DIRECTION.** The
reporter put it exactly right: `adr-lint` already says of `todo` that *"this reader
does not act on"* it, while `adr-next` offered the same task as READY. Two tools
disagreeing about the same unknown word, one of them permissively. Guessing the
permissive answer is what a work router must never do (ADR-005).

**Two things this fix nearly broke, both caught by its own tests:**

- The printed reason went through ONE site that said *"a human sign-off says stop"* —
  true of a Verification Log note and false of a `**Status:**` header nobody signed. A
  gate does not report an observation it did not make, including about where its own
  reason came from (§3). The reason carries its provenance now.
- Matching only the status's FIRST word stopped `in progress` dead — a multi-word
  buildable status routed as unrecognised, which is this fix causing the exact failure
  it was written to prevent. Whole status and first word are both checked, and the
  ordinary vocabulary is pinned by a test that loops over it.

**Not done, and named here:** the reporter also observed `adr-lint` linting the same
withdrawn task as live and advising on its acceptance fence — *"a fence for a task that
will never be built is churn"*. That is the same blind spot in a different gate, and
its status vocabulary is a different one (the README row's, not the file header's), so
it is a separate change.

## 167. CLOSED 2026-09-07 — §166's named sibling: `adr-lint` advised on a task that will never be built, and `partial` was missing from the vocabulary

Two follow-ups to §166, both from the same outside corpus, both closed here.

**1. Advice about a withdrawn task is churn.** `adr-lint` linted the withdrawn task as
live and advised on its sections and its acceptance fence. A reviewer in that corpus
called it out unprompted — *"a fence for a task that will never be built is churn"*.
Reproduced here: fifteen advisory lines on a task whose own header says it will not be
built.

The withholding is at the ONE place advice leaves the gate, not at the dozens where it
is raised, and it is **said rather than silent**:

```
advice withheld: T2.md declares **Status:** `withdrawn 2026-08-22. …`, so 15 authoring
advisory line(s) about it were NOT shown — a task that will never be built does not
need its sections or its fence improved. Blocking checks still ran.
```

⚠ **ADVICE ONLY.** A withdrawn task must still be well formed, so blocking errors are
untouched. And only a RECOGNISED terminal word withholds anything: the permissive
reading of an unknown status is the defect §166 was about, and repeating it here to
save a line of output would be the same mistake with the sign reversed.

**2. `partial` was missing, and it is a real word.** The reporter swept 58 records and
166 task fences and handed back the complete set of `**Status:**` values in use, with
the one my list did not carry:

```
done                                          2
Withdrawn 2026-08-22                          1   → covered
blocked 2026-09-06 — skipped on the owner's…  1   → covered, first word
partial                                       1   → NOT in the vocabulary
```

`partial` means built-but-incomplete — work someone may pick up — so it is buildable.
It landed on `stopped` with *"does not recognise"*, which is the SAFE direction and the
wrong answer. ⚠ **adr-lint's own advisory text already named it** — *"leave it
`pending` or `partial` and say why in the task"* — so this repository was recommending a
word its own router refused. Added.

**Two copies of one vocabulary, checked against each other.** `adr-lint` and `adr-next`
now read the same header for different purposes and neither can import the other.
`tests/gate-rules.test.mjs::adr-lint and adr-next agree on which task statuses are
terminal` parses both tuples out of the two sources and compares them, because two
copies of one rule is how `Consumes` came to be missing what `Depends-on` had (§41).

**What the fix nearly shipped, caught by the suite immediately:** `withdrawn_tasks` was
bound inside the tasks-directory branch while the advice boundary runs on every record,
so a record with no tasks raised `UnboundLocalError` from the reporting path — a gate
crashing on the ordinary case, introduced by a change about tidying its output.

**Left for the reporter, on their side:** they observed that the same task reported
`done` before this change, taken from a README row that also says `partial`, while the
file header says `partial`. So the pre-fix verdict came from neither. Not this
repository's to explain, and named here only because §10 makes the file win, so the
routing for that task changes twice.

**Two later corrections from the reporter, both worth keeping:**

- Their "the `done` came from neither source" was their own error, not a defect here.
  `adr-next` was reading the THIRD source — the Verification Log, five exit-0 entries
  with a matching digest — exactly as documented. So the disagreement was never two
  indexes against a third; it was **evidence against the author's judgement**: a green
  fence with `partial` written beside it, a marker set at the file's birth and never
  updated.
- They then predicted this change would surface stale `partial` markers as phantom
  READY work. ⚠ **IT DOES NOT, AND THE ORDER IN `classify` IS WHY.** `done` is decided
  from the Verification Log BEFORE any status is consulted, so a status that disagrees
  with passing evidence loses to the evidence; only a `partial` with NO evidence is
  offered, which is the right answer for genuinely unfinished work. Verified on a
  fixture and pinned by `tests/adr-next.test.mjs::tool-written evidence outranks the
  task file's own Status word`, because that ordering was incidental before §166 and is
  load-bearing after it.

⚠ **AND WRITING THAT TEST CAUGHT ME OVERSTATING IT.** I told the reporter the ordering
meant *"`withdrawn` → stopped whatever its log says"*. Measured: **false.** Evidence is
read first for a terminal status too, so a task that was BUILT and then withdrawn routes
`done`. The test covered the empty-log case only, which is the one that happens; the
claim covered a case nothing exercised.

**Left open on purpose, and named rather than guessed:** whether `done` is the right
answer for a withdrawn-but-evidenced task. `done` says the corpus built it, which is
what the log shows; the record says nobody was meant to. Neither reading offers it as
work, which is the safety property, so nothing is at risk while the question stands.
⚠ **The reporting corpus has NO instance of it** — their withdrawn task's log is
deliberately empty (*"an empty log on a withdrawn task is correct, where on a completed
one it is the fabrication hole this pipeline exists to close"*), so the sequence only
arises if someone withdraws a task that was already evidenced. Real, but unperformed.
The arm is pinned as it behaves, so a reorder cannot change it silently.

**Last sibling, closed here:** `adr-lint`'s README-row advisory told the author of a
`superseded` or `withdrawn` row to *"Use `done`, `pending` or `blocked`"* — advice that
would DELETE what the corpus is saying, now that those words route from the task file.
A recognised terminal word gets its own sentence pointing at the file header instead;
a genuinely unknown word still gets the old advice, and both directions are asserted.

## 168. CLOSED 2026-09-07 — "open backlog items" was a count nothing re-checked, and three of them had shipped

**Found by** being asked what was left in the backlog and refusing to answer from the
headings. §103 is a prose record asserting a live defect the code has already fixed;
§93 is a commit claiming a section it never edited. This is the third side of the same
class: a section whose work SHIPPED, under a heading that still says PROPOSED.

```
$ grep -c '^## [0-9]' docs/BACKLOG.md                                    175
$ grep '^## [0-9]' docs/BACKLOG.md | grep -viEc 'CLOSED|WITHDRAWN|…'      36
```

Thirty-six is not the number of open items and nothing said so. `scripts/backlog-record-sweep.mjs`
asks `adr-next` about every record a not-closed section CLAIMS, and found three:

```
RECORD SHIPPED  §60   PROPOSED AS ADR-014 …    ADR-014: Accepted, 3 done, 0 not done
RECORD SHIPPED  §74   PROPOSED AS ADR-013 …    ADR-013: Accepted, 3 done, 0 not done
RECORD SHIPPED  §111  … — ADR-025              ADR-025: Accepted, 2 done, 0 not done
```

⚠ **IT ASKS `adr-next`; IT DOES NOT PARSE TASK FILES.** A record's state has one owner
and it is the gate that routes work. A second reader of the same task files would be a
second copy of the readiness rule, which is how `Consumes` came to be missing what
`Depends-on` had (§41).

**The first cut reported 20 of 39 and that was the defect, not the finding.** It took
every `ADR-NNN` anywhere in a section, so it flagged sections that merely CITE a
record — *"§43 Two outside papers, read 2026-08-28"* is not made stale by ADR-009
finishing. A sweep whose findings are mostly noise is one a reader learns to skim,
which is the whole cost ADR-037 is about. It now reads the HEADING, plus body phrases
that say in so many words where the work went (`PROPOSED AS`, `DEFERRED TO`,
`TRACKED AS`, `BECAME`, `MOVED TO`, `LIVES IN`, `SUPERSEDED BY`). Three findings, and
they are the three a human found by hand.

**It reports and never blocks**, and `RECORD SHIPPED` is stated as a place to look
rather than a verdict — a section may legitimately outlive its record, and a record
being finished says nothing about the prose around it. An ADR it cannot resolve, a
record with no tasks, and a gate that would not run are `COULD NOT LOOK`, which is not
a finding at all (ADR-005).

**Not done, named here:** the three sections themselves are untouched. §10 says records
and the backlog are history and are never rewritten to match today's code, so closing
them is a judgement about each one, not a sweep's output applied in bulk.

## 169. CLOSED 2026-09-07 — the fence timeout was environment-only, so forgetting it cost thirty minutes to discover

**Reported from an outside corpus, 2026-09-07**, ranked third of six by the reporter:

> `.quality-harness.json` takes `strictFrom` and `check` but **not** the fence timeout;
> `fence_timeout()` reads the environment. Any task whose Acceptance is the full Docker
> suite therefore needs `QUALITY_HARNESS_FENCE_TIMEOUT=3600` exported by whatever
> launches it. Forget it and you get `UNPROVEN` after 30 minutes — the right failure, at
> the cost of a 30-minute discovery.

`{"fenceTimeout": 3600}` is read now. **Precedence is environment, then config, then
default,** and the order is a decision rather than an accident: the variable is a
per-RUN override and the suite's own test seam, while the file is the project's standing
answer. A config that could beat the seam would make the suite's timing depend on the
checkout it happens to run in.

⚠ **A CONFIG IT CANNOT USE IS SAID, NOT SILENTLY DEFAULTED.** A typo that quietly
restored the default would be the hang this bound exists to catch, wearing a clean run
(ADR-005). `strict_from_number` returns its note to a caller that prints it; this is
called from inside the very f-strings that report a timeout, so it says its own — once
per process, or the note would repeat at every mention.

**Two process findings, both worth more than the feature:**

⛔ **The test was written in `tests/gate-regressions.py`, where it PASSED and its three
catalogue entries were UNPROVEN.** The campaign spawns `node --test` and nothing else,
so a `.py` test cannot back a mutant — the mutant runs, the baseline fails, and the
result proves nothing. This repository's own check said so in those words
(`every catalogue entry names tests the campaign can actually spawn`), which is the only
reason it was caught. Moved to `tests/gates.test.mjs` as a python probe.

**A different-lineage review of `c29aae7` then found three more, all in §167's own fix:**

1. ⛔ *"The evidence checks did NOT run for it either way"* was **false**.
   `evidenced_task_ids()` reads a task's exit-0 Verification Log whatever its README row
   says, so evidence-driven checks still run. The message claimed more than it knew, in
   a gate whose subject is exactly that (§33). Narrowed to the true fact.
2. ⛔ The branch told the author to put the README's word in the TASK FILE **without
   reading the file first**. If the file already says it, the advice is churn; if it says
   a DIFFERENT terminal word, the derived index was instructing an overwrite of the
   authoritative copy (§10). It now stays silent when they agree, and names the
   disagreement — *"Change the row, not the file"* — when they do not.
3. The two-gate vocabulary drift guard matched `"([^"]+)"` inside a `(…)` span, so a
   single-quoted or computed member compared EQUAL while the runtime tuples differed —
   a drift guard that cannot see drift. It parses with `ast` now.

## 170. CLOSED 2026-09-07 — the plugin linted its own postmortem SKILL as a malformed postmortem

**Found by the dispatcher firing on this repository**, during a commit that touched a
different skill file entirely:

```
[FAIL] plugin/skills/postmortem/SKILL.md · postmortem-verify 2.88.0
  ## Fix must contain ### Before and ### After fenced code blocks
  advice: frontmatter: date missing or not YYYY-MM-DD
  advice: missing section ## Symptom          ← the skill DOCUMENTS this section
  … eleven lines in total
```

⚠ **A DOCUMENT *ABOUT* POSTMORTEMS IS NOT A POSTMORTEM, and section headings alone
cannot tell them apart.** `is_postmortem` matched on four headings; the skill that
TEACHES the format necessarily lists every heading it requires, so the plugin's own
skill matched — and so would any adopter's guide, template, or checklist. Advice always
wrong on a whole class of file is advice a reader learns to skim (ADR-037), and this one
fired inside the plugin that ships the rule.

**The discriminator is the FRONTMATTER**, which is what `postmortem-verify` actually
reads and what a document about the format has no reason to carry: a real postmortem
declares `date`, `category` or `severity`; a guide declares `name`/`description` or
nothing. A path under `docs/postmortems/` still routes whatever its frontmatter says,
because there the author has already said what the file is.

Measured on four inputs, all four arms asserted:

```
frontmatter date/category/severity + the four headings   -> ROUTED
frontmatter name/description       + the four headings   -> skipped
no frontmatter                     + the four headings   -> skipped
plugin/skills/postmortem/SKILL.md (the file that found it) -> skipped
```

**The must-not-fail direction is the first line**, because a discriminator that refuses
everything would satisfy the other three and route no postmortem ever again.

**Named, not done:** a real postmortem living OUTSIDE `docs/postmortems/` with no
frontmatter is no longer routed. That is a deliberate trade — `postmortem-verify`
requires those fields anyway, so such a file was going to be told to add them — but it
is a case this dispatcher now skips silently rather than reporting, and silence is the
thing this corpus is otherwise careful about.

## 171. CLOSED 2026-09-07 — the remedy `spec-verify` recommends could not run on the platform it was recommended on

**Reported from an outside corpus, 2026-09-07, ranked SECOND of six:**

> Every fact bound to a `tests/blueprint/*.sh` shell function reports `UNRUN`, exit 4.
> The finding names the remedy — a `Cmd` cell — and the remedy fails on Windows:
> `BP_ROOT="$PWD" bash -c '…'` → *"The system cannot find the path specified"*. The
> command is launched **without a POSIX shell**, so the `VAR=value cmd` prefix form
> becomes the executable name. Only a machine-local absolute path to `bash.exe` runs,
> and a committed spec must not carry one.

⚠ **THE GATE TOLD ITS AUTHOR TO DO SOMETHING IT COULD NOT THEN DO, AND BLAMED THEM FOR
THE RESULT.** `subprocess(..., shell=True)` is `cmd.exe` on Windows. The exit 4 that
followed read as the author's fault.

**The resolver already existed — in the wrong file.** `resolve_bash` was defined in
`adr-verify` alone: absolute Git Bash on Windows, skipping the System32 WSL launcher and
the 0-byte WindowsApps Store alias, with `CLAUDE_CODE_GIT_BASH_PATH` first. `spec-verify`
had no way to reach it, so it did the only thing it could. Moved to `plugin/lib/fence.py`
— the lib BOTH gates already load — rather than copied, because two copies of one
resolver is how `Consumes` came to be missing what `Depends-on` had (§41).

**Three arms, all asserted, and the must-fail one first:**

```
BP_ROOT="$PWD" sh -c 'exit 0'   -> pass    ← the shape the report said failed
exit 3                          -> fail    ← or `pass` above is a runner that says yes to everything
no POSIX shell resolvable       -> unrun, naming CLAUDE_CODE_GIT_BASH_PATH
```

The third is the ADR-005 arm and it names the FIX, not only the fault: a `Cmd` written
in POSIX syntax on a box with no POSIX shell fails for a reason that has nothing to do
with the code under test, so reporting it as `fail` is exactly what this function's own
docstring already refused to do for a missing runner.

**Found while doing it:** the mutation entry `windows: adr-verify refuses the
WindowsApps bash alias` went STALE the moment the resolver moved, and the catalogue's
own check said so. It names `plugin/lib/fence.py` now — the same claim, about the file
that makes it.

## 172. CLOSED 2026-09-08 — `adr-next` printed READY over exit-0 evidence it had already read

**Reported 2026-09-08 from an outside corpus (59 records, 114 task files, plugin 2.94.0):** 3 of its
15 READY tasks were marked done in `tasks/README.md` and carried exit-0 Verification Log rows. That
repository's own protocol makes the next READY task the default next action, so a session was one
step from designing work already built; it avoided that only because a palace memory happened to
warn it.

**Narrower than reported, and the correction is the finding.** The reporter's own quoted row is the
truncated `docker run …` display form. `is_done` refuses it deliberately: a first-line-only row
cannot prove a multi-line fence (§58's allowance, copied condition for condition from `adr-lint`),
and `adr-lint --help` says the same. The two tools AGREE; the "3 marked done" is a typed claim in
a derived index, not evidence. What was wrong is the RENDER — this reader had made that observation
and printed a bare `READY`, which reads as "never attempted" (ADR-005).

`adr-next` now says which of two states produced the word: *carries exit-0 evidence that predates
acceptance digests and cannot prove this fence* or *…recorded against a different Acceptance — the
fence changed after that run*, on the `--all` lines and the `Next:` block. `is_done` is untouched;
nothing is granted. The must-fail arms: an empty log renders bare, and a row the allowance ACCEPTS
still renders `done`.

## 173. CLOSED 2026-09-08 — `--mutant` costs two full fence runs and `--help` did not say so

**Reported 2026-09-08 from an 18-record corpus:** a 26-minute acceptance cost ~52 under `--mutant`,
even though the mutation tripped the first command of an `&&` chain in seconds. Confirmed at the
source: the journal is armed `"phase": "baseline"` and the clean fence runs before the mutant —
that is what makes `killed` mean anything. The help said "runs the Acceptance fence", singular. It
now says twice, why, and that the cost is two full runs whatever the mutation trips. The reporter's
`--assume-baseline <digest>` is not taken: an exit-0 entry at the same sha proves the fence passed
once, not that the tree the mutant is applied to is the tree it passed on.

## 174. CLOSED 2026-09-08 — nine findings from two outside corpora, one seam: what the pipeline knows never reached the person editing

Two adopters drove `adr-lint` / `adr-verify` / `adr-next` 2.94.0 on their own corpora the same day
(one 59 records, one 18) and filed nine findings — two of them things the first reporter BROKE and
reverted after acting on the tool's own advisory in good faith. §172 and §173 above are two of the
nine. The owner's instruction was to address every one; none went to the backlog as open.

⚠ **The premise "we broke it while optimising for speed and deduplication" was checked and does not
hold for eight of nine.** The dedup commits (86390c7, ebce539, 0cf7daa) touched `lifecycle.mjs`,
`run-shell-hook.mjs` and `branch-state.mjs`, never the three gates; the classifier behind the ninth
(`isPotentialMutationCommand`) has not changed since 2.0.2. These are design gaps as old as the
features, found by the first corpora large enough to hit them.

**A1 — `adr-lint` detected an inert `! grep` guard and exited 0.** 37 of 114 fences there; all 37
rescued by an un-negated `grep -q -- "--- PASS"` beside them, which was the authors' habit and
nothing the gate guaranteed. The reporter proposed the split and it is taken: a negated guard that is
the fence's ONLY vacuity check (`vacuity_checks` empty) is now a FAILURE, decidable from the text;
one beside a positive assertion stays advice. Zero of that corpus and zero of this one cross the
line. What the reporter could not see and said so — whether OTHER corpora author the rescuing
assertion — is what the failure arm now measures for them, one record at a time.

**A2 — editing a fence silently invalidated evidence; the warning arrived after the edit.** Applying
the advisory to all 37 took that corpus from 1 failing record to 12. The advisory now carries the
cost on any task with an exit-0 row: *editing the fence changes its digest, and `done` is refused
until `adr-verify` re-runs it against the new text.* One sentence, on the message that prompts the
edit. The reporter's own cost check took a different branch (a legacy row) and told them editing was
safe — worth remembering when one sample is the evidence.

**A3 — the recommended fix breaks `sh -c '…'` fences when the guard is the last line inside the
wrapper.** Caught by that corpus's `sh -n` gate, never by this one. `adr-lint` now runs `bash -n`
over every fence through the shared `resolve_bash` (§171 — a bare `bash` on Windows is the WSL
launcher), reports a parse error as a failure (a fence that cannot RUN can never fail), and says
`UNRUN` in those words when no shell resolves. The advisory names the wrapper case when one is
present.

**A5 — no migration path for pre-digest evidence, and the only route degraded the record.** "Re-run
`adr-verify`" appended a FAILED run to a done task whose fence dialled `localhost:11434` from inside
a container. The log stays append-only (CLAUDE.md §4). `adr-verify` now says BEFORE the run, on any
task already carrying exit-0 rows, what a failure will read as and that a fence needing an
environment it does not set up should be fixed first; `adr-lint`'s refusal says the same. Asserted
in the order it prints: the notice precedes `WROTE this entry`.

**B1 — a record with no `tasks/` dir has no gate on its `Status:` line.** Four records shipped with
52 tests and sat `Proposed` six weeks; three sessions read `[PASS] (no tasks dir — ADR-level checks
only)` as approval. The label now says *its Status is not checked against evidence here*, and a
`Proposed`/`Draft` record whose `## Implementation` paths ALL resolve against `git ls-files` (never
the disk, §8) gets an advisory that says what it observed and that it cannot tell a finished
decision from a plan naming old files. Git unreachable → *that check did NOT run*.

**B3 — `--covers` unreachable without a `**Rests-on:**` header no template emits.** ⚠ THAT CLAIM IS
FALSE AS OF 2.51.0: `plugin/templates/task-template.md:41` has emitted the header since ADR-022 T1
(`b5c6809`); the reporter's ~90 task files predate it. The adoption gap is real, so `adr-lint` now
advises it on a task that has a Mutation Log and no exit-0 row yet — the moment the header buys
something — and NOT on done tasks: on this corpus that would have fired on forty verified tasks at
once, which §59 already measured the cost of.

**B4 — the pre-commit gate counted read-only Bash as a change.** ⚠ NOT REPRODUCED from the fragments
given: `gh run list --limit 1 --json …` classifies as non-mutating at HEAD and `cp src/… /tmp/…bak`
is temp-only exempt; both are now pinned by test. The verbatim commands were asked for. The half
that DID reproduce is the damage: a `<Bash mutation: …>` marker is appended beside every resolved
path, and `docsOnly` reads the marker as a non-document — so `sed -i` over fourteen Markdown files
demanded the full test run. The marker is now withheld when the command names Markdown files and no
other path that exists in the tree; a real non-Markdown target keeps it.

**B5 — three false-positive classes in the tests-exist sweep.** (1) *regex the name cell, not the
row* — `check_tests_exist` already reads cell 0 only. (2) *a backticked name may be a file* —
`test_x` beside `tests/test_x.py` was reported as a definition missing from itself; a row naming its
own file is now accepted when the file holds at least one test, and still reported when it holds
none (the identity regression, whose fixture was renamed off the coincidence). (3) *do not rank
strings to suggest a successor* — already doctrine here (§61); the message now asks the reporter's
discriminating question instead: whether a sibling IN THAT SAME FILE fences the same behaviour.

The two reporters' credit is recorded too: `--mutant` caught a green fence with an empty Mutation
Log, and the duration floor called a 289ms exit 1 for what it was.

## 175. CLOSED 2026-09-08 — §174's B4, with the verbatim inputs: a read-only heredoc was a mutation, and a relative path ignored the command's own `cd`

The reporter sent the three verbatim Bash inputs behind the "read-only Bash counted as a change"
finding, and withdrew one: the `cp … /tmp/….bak` call also mutated the source and restored it in
the same command, so the marker showed a fragment and the fragment was reported. The other two are
real and neither is §174's marker.

**(A) A `python3 - <<'PY'` heredoc that grepped the tree and printed JSON was a mutation.** Three
tokens tripped it, none of them a write: a bare `import re,pathlib,subprocess,json` (the token
`subprocess` matched an IMPORT), `subprocess.run(["grep", …])` (every subprocess was a write,
whatever it ran), and `re.search(r"def (test_\w+)")` (the call scanner read `def (` INSIDE a string
literal as a call to `def`, and an unknown call is a write by default). Now: the token is a USE
(`subprocess.`); a `subprocess.*([literal argv])` with no `shell=True` is asked the question this
module already answers for a shell line — `isPotentialMutationCommand` over the argv — and stripped
when the answer is no; calls are read from code with string literals blanked; and the safe-call set
gained the pure string, regex, container and path-read names. The must-fail arms: `["rm","-rf",…]`,
a computed argv, `shell=True` and `write_text` each stay a mutation.

**(C) `cd "…/memory"` then `cat >> project_adr_corpus_state.md` was reported as
`<repo>/project_adr_corpus_state.md` — a file that has never existed.** Every relative token was
resolved against the session's cwd, whatever the command had `cd`-ed to. `segmentDirectories` now
follows a command's own `cd`/`pushd` segment by segment (a `cd` to a directory that does not exist
FAILS and the shell stays put — which is also what keeps the fixtures' `cd /repo` inside the
project they stand for; `cd -`, `popd` and a variable make the directory UNKNOWN, and an unknown
directory resolves nothing rather than guessing). A resolved path outside the project is not
recorded, and a command whose every working segment runs outside the project with nothing reaching
back in by an absolute path or a variable is not a project mutation at all — the same exemption
the temp root already had. The reporter's second consequence — "a resolved path that `test -e`
cannot find is evidence the resolution was wrong" — is answered by the first: the resolution no
longer produces it.

## 176. CLOSED IN DIRECTION 2026-09-23 by ADR-060 — a file written through an MCP tool was INVISIBLE to the evidence gate, and this session was the reproduction

Found 2026-09-08 while closing §172-175, by noticing that another project's Stop hook reported this
session as having edited ONE file when it had rewritten nine.

⚠ **THIS IS FAIL-OPEN, WHICH IS THE DIRECTION THIS PROJECT EXISTS TO PREVENT.** Every other entry
in this file is about a gate that spoke when it should not have. This is a gate that says nothing
at all: a session that does its editing through an MCP write tool produces a transcript in which
`analyzeTranscript` finds no mutation, so `Stop` demands no evidence and a commit carrying real
authorship passes the completion gate having verified nothing.

Reproduced against HEAD:

```
node --input-type=module -e '
import { analyzeTranscript } from "./plugin/scripts/lifecycle.mjs"
const t = [
  {type:"assistant",message:{content:[{type:"tool_use",id:"m1",name:"mcp__mrw__mrw_write",
    input:{plan:"@@ src/app.py 1 replace\nx = 2"}}]}},
  {type:"user",message:{content:[{type:"tool_result",tool_use_id:"m1",content:"ok"}]}},
].map(o=>JSON.stringify(o)).join("\n")
const s = analyzeTranscript(t)
console.log("mutationPaths:", s.mutationPaths, "lastMutation:", s.lastMutation)'
→ mutationPaths: [] lastMutation: -1
```

**The class, enumerated with a command rather than from memory** (`CLAUDE.md` §5):

```
grep -n "MUTATION_TOOLS = " plugin/scripts/lifecycle.mjs
→ const MUTATION_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
grep -rn "mcp__" plugin/scripts/*.mjs plugin/hooks/*.json
→ one hit, in eval-fixture.mjs, unrelated to the evidence gate
```

So the membership test is a closed list of four built-in tool names. `Bash` is handled separately
and covers a shell `mrw`/`sed`/heredoc write — which is why THIS session was caught: its edits went
through the `mrw` CLI under `Bash`, and the pre-commit advisory listed them. The hole is the
**MCP** surface: `mcp__mrw__mrw_write` and every filesystem-writing MCP server a user has
configured. `CLAUDE.md` §14 and the global instruction file both tell a session to prefer `mrw` for
multi-file work, and the MCP form of that same tool is the one the gate cannot see — so the
project's own recommended workflow is the one route out of its own gate.

**Not fixed here, deliberately.** It was found after `selftest.sh` went green on §172-175 and while
a different-lineage review of those commits was in flight; folding a new fail-open into that diff
would have made both harder to judge. It is a bigger question than a name added to a set, because
an MCP tool's written path lives in a server-specific input shape (`mrw_write` takes a PLAN, not a
`file_path`), so this needs a decision about what the gate can honestly claim to read from an
arbitrary MCP call — and an unreadable one must be `UNKNOWN`, never silence (ADR-005).

**What a fix must not do:** treat an unrecognised `mcp__*` write as clean. The safe direction here
is the expensive one — an MCP tool this gate cannot parse is an unverified change it must SAY it
cannot account for.

**CLOSED IN DIRECTION 2026-09-23, by ADR-060, not by a fix here.** ADR-060 (Accepted, every task
done) reads writes through the TREE: its record says at line 310 *"Other tools' writes, such as an
MCP server's, are seen only through the tree"*, and at 315 *"Edits by the user or another tool in
the same tree count as unchecked work"*. So the fail-open this section describes — a transcript with
no recognised mutation, and nothing said — no longer exists: `observe()` compares the tree before
and after, and a Stop over a dirtied tree advises whatever tool dirtied it. The reproduction above
still returns `mutationPaths: []`, and that is now beside the point, because `analyzeTranscript` is
no longer what decides. Reproduce the closed shape by writing a file with any tool and ending the
turn: the Stop advisory names it. What ADR-060 does NOT close, said at its own line 311: a session
whose changes return the tree to its starting state is not advised, MCP or otherwise. And one
residual keyed on the old list stays: the read-only reviewer guard
(`lifecycle.mjs`, `readOnlyRole(...) && (tool_name === 'Bash' || MUTATION_TOOLS.has(...))`) refuses a
reviewer's Edit/Write/Bash before it runs, while a reviewer's MCP write is reported after the fact
through the tree instead (ADR-060 lines 301-302 record the same shape for a Bash write naming
neither word). The resume memory in the palace called this "the one fail-open nobody ships" for two
weeks after ADR-060 closed it — a header that says OPEN is read as open.

## 177. CLOSED 2026-09-08 — §174's blocking promotion would have refused a CORRECT fence, and the corpus that proved it escaped only by not writing `set -e`

§174 promoted an inert `! grep` guard to a blocking failure when it is a fence's only vacuity check.
A peer session was asked to try to break that from the working tree before it shipped, invoking
`plugin/bin/adr-lint` by absolute path and quoting the identity line (only the ROOT distinguishes
the copies — an unreleased tree carries the last released version number, so both said `2.95.0`).

**It reported no regression across 77 records — and then named the fence that matters anyway.** From
its own corpus, verbatim:

```
pytest … -q && ! grep -q "mark.xfail" … && PYTHON=python3 make architecture-gates
```

Guard mid-chain, `make` last, no un-negated `grep` anywhere. Under §174's predicate that is
"no vacuity check" and therefore a BLOCK — on a fence that is correct. It did not go red there only
because that corpus writes `set -o pipefail` and never `set -e`, so `inert_negated_guards` never
evaluated it. **Luck, not correctness**, and the peer said so rather than reporting a pass.

**The cause, measured rather than assumed:**

```
pytest <dir with no tests>            -> exit 5
pytest -k <filter matching nothing>   -> exit 5
python3 -m unittest discover          -> exit 5
go test ./...   (no test files)       -> exit 0
node --test     (no test files)       -> exit 0
```

That asymmetry is the whole reason the negated-guard idiom exists: a Go corpus needs
`! grep -- "--- PASS"` because its runner says nothing on an empty run, and a pytest corpus never
writes one because exit 5 already says it. **The predicate did not know the commonest runner in the
population it judged** — 102 of that corpus's 114 fences are pytest. A runner that fails on an empty
selection is now itself the vacuity check (`EMPTY_RUN_FAILS_RE`), and adding one to that list is a
claim about its exit code that must be measured the same way.

⚠ **AND THE DEEPER ERROR, which the near-miss exposed: the promotion was asserting a UNIVERSAL
NEGATIVE.** "Nothing in this fence can fail when the run scored nothing" is unprovable over arbitrary
shell — `inert_negated_guards`'s own docstring already cites ADR-016 for exactly that, and only ever
asserts the positive ("this line cannot fail the script"), which is checkable. The blocking arm
quietly asserted the negative. It now blocks only when EVERY segment is a check, a runner, or
recognised setup; one command it cannot classify and the finding is advice that says
`UNPROVEN here, not established` and names what it could not account for (ADR-005). The genuine
target — a `go test` runner, a mid-chain guard, nothing else asserting — still blocks.

**Second finding from the same run: the Proposed/Implementation advisory was silent on exactly the
four records that produced §174's B1.** The peer checked out the commit before those records were
flipped to Accepted, into a worktree so `Status: Proposed` and a real git context both held, and got
zero advisory hits on three records whose every path is tracked. Cause: `sections_of` keys on the
exact heading text, and the extractor asked for `## Implementation` alone —
`## Implementation Plan` and `## Implementation Notes` are the same section under another name and
returned nothing. Matched by prefix now. The peer flagged its own uncertainty here correctly ("I do
not know your extraction rule"), which is what made the report actionable rather than a guess.

⚠ **What the peer could NOT establish, reported as INCONCLUSIVE and worth keeping that way:** it
could not build a positive control that reaches the vacuity check from the CLI — a synthetic record
hit the digest check, the missing-Mutation-Log check and the no-killed-mutant check first. So
"my corpus stayed green" is not evidence the check is live. It is live here, and the evidence is the
mutation catalogue rather than the corpus: `lint: an inert guard that is the only vacuity check
fails the record` is RED, which is the arm a green corpus cannot supply.

## 178. CLOSED 2026-09-08 — §177's runner table measured the wrong case, and three sessions with three toolchains found it

§177 promoted "a runner that fails on an empty run is itself the vacuity check" and shipped a table
of runner names. The owner asked the obvious next question — *what about the other predicates, and
combinations, since for a model it is cheaper to fake it than to measure it* — and the answer turned
out to be that the table was faked in the one way that is hardest to notice: **every number in it was
real, and every number was of the wrong case.**

⚠ **THE HOLE IS "THE FILTER SELECTS NOTHING", NOT "THE DIRECTORY IS EMPTY".** A fence goes vacuous
when the tests it names were never written, so its `-k`/`-t`/`-run` filter matches nothing while real
tests sit beside it. The first table measured runners in an EMPTY DIRECTORY, which is a different
question, and the two disagree. Reported by a session with a JS toolchain, both cases measured with a
passing baseline in the same directory so a 0 could not be a runner that failed to start:

```
vitest 5.0.0   no test files -> 1     -t selects nothing -> 0
jest 30.5.0    no test files -> 1     -t selects nothing -> 0
```

An empty-directory table classifies both backwards. Re-measured here on the case that matters:

```
pytest -k                          baseline 0    selects nothing -> 5   fences it
bun test -t                        baseline 0    selects nothing -> 1   fences it
go test -run                       baseline 0    selects nothing -> 0
node --test --test-name-pattern    baseline 0    selects nothing -> 0
cargo test <filter>                baseline 0    selects nothing -> 0
```

`bun` survived the re-measurement but for a different reason than it was admitted on, and
`python3 -m unittest` did not: it was in the failing table on the strength of `discover` over an
empty directory, has no `-k` at all, and its selection is a module path whose bad value is an import
error rather than an empty selection. Different mechanism, unmeasured, now unknown.

**Three more defects the same pressure exposed, each self-inflicted in the same way:**

- ⚠ **`bun` was in the INERT half because it had been typed, not run.** `bun test` on an empty
  selection exits 1, so `bun test && ! grep … && echo done` was a BLOCK on a correct fence. Live for
  one commit.
- ⚠ **`npm test` was in the passing half, measured at 0 — over a `package.json` whose script was
  `node --test`.** A wrapper's exit code is whatever it wraps; over jest the same command exits
  non-zero. A wrapper measurement measures the wrapped thing, once, on one machine. `npm`, `yarn`,
  `pnpm`, `make`, `just` and `docker` are now unclassifiable by construction.
- ⚠ **An opt-out flag flips any runner.** Both JS runners ship `--passWithNoTests`, and a repo's own
  script can set it where this gate cannot see. A segment carrying one is now classified by nothing.

**What a peer's measurement does NOT license.** PHPUnit 8.5.40 was measured at exit 0 with
`--filter zzzNeverMatchesAnything`, confirmed as a real run by its own `No tests executed!` line, and
`php artisan test` was correctly reported INCONCLUSIVE — it demanded a TTY, produced no test output
and returned 0, which is the ambiguous shape that must not be scored. None of vitest, jest or PHPUnit
entered the tables. They agree with the passing half, so admitting them could only ever ENABLE a
block — which is the reason they stay out. Each is one version on one machine, and **a fence carries
no version**, so classifying by bare command name would assert across versions from a single point.
Unaccounted costs a weaker finding; wrong costs a false block on correct work.

**The rule this leaves behind, and it is the whole point:** a name in either table is a measurement
of the filter case, taken with a passing baseline beside it, and a name nobody measured must be in
neither. An unmeasured runner reaches `unaccounted_segments` and makes the finding UNPROVEN, so
adding a name buys nothing until somebody runs it — which is what removes the incentive to fake one.

## 179. CLOSED 2026-09-08 — I attacked my own blocking arm and it refused four correct fences; one of the two causes is a trap this repository had already paid for

Asked to review this work forcefully rather than wait for an external reviewer. The target chosen
was the only thing in §174-178 that can refuse work: the blocking arm. Method was to write fences
that DO assert something and check whether the gate blocks them — not to read the code and reason
about it, because reasoning about a predicate is how the predicate got written.

**Five false blocks, two causes.**

⚠ **A SEGMENT IS NOT ITS FIRST COMMAND.** Every table matches at the start of a segment, and a
segment is a whole pipeline. So a fence whose assertion is a later stage read as inert:

```
wc -l out | grep -q "^12$"          → classified by `wc`   → "asserts nothing"
cat out | grep -q -- "--- PASS"     → classified by `cat`  → "asserts nothing"
sort out | uniq | grep -q PASS      → classified by `sort` → "asserts nothing"
tail -1 out | grep -q ok            → classified by `tail` → "asserts nothing"
```

Each of those four fences has a real vacuity check and each was BLOCKED. Segments are now split into
pipeline stages: a segment IS a check when ANY stage is one, and is accounted for only when EVERY
stage is — with `set -o pipefail` any stage can fail, and without it the last stage's status is the
segment's, so neither end alone is the right reading.

⚠ **The splitter is quote-aware, and that is load-bearing rather than tidy.** The vacuity guard this
gate RECOMMENDS is `grep -qE "no tests to run|^FAIL|^--- FAIL" out`, whose alternation is a `|`
inside quotes. A naive split would cut the gate's own advice into three fragments and classify none
of them — the same shape as §174's finding that the recommended fix broke `sh -c '…'` fences, one
layer down.

⚠ **AND `\b` AFTER A COMMAND NAME MATCHES A HYPHEN — WHICH THIS REPOSITORY ALREADY KNEW.**
`go test-helper ./...`, `cargo test-fuzz run` and `node --test-reporter=x` were each classified as a
MEASURED runner, which is the half that PERMITS a block. `plugin/scripts/lifecycle.mjs:1026` carries
the identical lesson in its own comment — *"(?<![-\w]) not \b: a hyphen is a word boundary, so
`--rm` matched the `rm` command"* — from a live report on 2026-08-26. The instance was fixed there
and the CLASS was never swept, so it was rewritten from scratch two files away (`CLAUDE.md` §5, which
exists for exactly this and which I did not apply to my own change).

**What did NOT break, asserted rather than assumed:** the genuine hole still blocks (`go test` with
a mid-chain guard and nothing else asserting), and the three real runner commands the hyphenated
lookalikes shadow are still classified — without that arm the fix could have been "match nothing",
which satisfies every other assertion in the block.

**The method is the finding.** Four of these were invisible to a corpus sweep: a peer linted 77
records and 114 fences against this working tree and reported no verdict change, correctly, because
its fences do not happen to pipe into their checks. A green corpus is evidence about that corpus.
The mutation catalogue and a deliberately hostile fixture are what say the check is live and narrow.

## 180. CLOSED 2026-09-08 — the different-lineage review found four more, two of them fail-OPEN, one inside the fix I had just written

§179 was a self-attack that found six false blocks. A Codex xhigh review of the same range then returned
REQUEST CHANGES with five findings: two were §179's, already fixed, and **four were new**. That ratio is
the point of §12 and is recorded here rather than summarised away.

⚠ **FIRST, THE REVIEW ITSELF FAILED SILENTLY AND REPORTED SUCCESS.** The first dispatch sat blocked on
stdin for 55 minutes, wrote no output file, and exited **0**. `CLAUDE.md` §12 already says to redirect
stdin from `/dev/null`; the invocation omitted it. A review that never read a line certified nothing
while looking exactly like one that had — the same shape as §13's rule never to read a watch's exit code.

**1. The status carrier — WRONG IN BOTH DIRECTIONS, and §179's fix caused half of it.** §179 made a
segment a check when ANY pipeline stage was one, to stop `cat out | grep -q PASS` being refused. That is
a fail-open by itself. Reproduced against bash before encoding either:

```
set -e; (exit 5) | cat; echo R; exit 0        -> 0    tee MASKS the failure
set -eo pipefail; (exit 5) | cat; ...         -> 5
set -e; grep -q NOPE /dev/null || true; ...   -> 0    `|| true` NEUTRALISES
set -e; grep -q NOPE /dev/null || exit 1; ... -> 1    `|| exit 1` does not
```

So `pytest -k zzz | tee out` was counted as fenced by pytest's exit 5, which `tee` discards — a vacuous
fence declining to block. Only the STATUS CARRIER can fail a fence: the last pipeline stage unless
`pipefail` is set, and for an OR-list the last alternative — except where that tail ALWAYS fails
(`exit 1`, `false`), which is what makes `grep … || exit 1` load-bearing and `grep … || true` not.
⚠ **And one of this repository's own tests encoded the fail-open**: it piped every runner into `tee`
while asserting the runner fenced the fence. The test was corrected, not the assertion deleted.

**2. `writesOutsideProject` exempted genuine in-repository writes.** The project boundary was the CWD,
not the git root, so from `plugin/` the command `cd ../docs && touch BACKLOG.md` wrote to the repository
and read as outside it. `cd /etc/passwd` advanced the parser into a FILE — bash reports "Not a directory"
and stays put — after which every later write was judged against that. And `underDirectory` was lexical,
so a symlink pointing back in read as out. Now: the git root is the boundary, `cd` advances only to a
directory, both sides are canonicalised, and a relative token is resolved against the directory its
segment actually runs in.

**3. `withoutReadOnlySubprocessCalls` stripped mutating children — ADR-005 inverted inside the gate that
enforces it.** It stripped any `subprocess.*([literal argv])` whose argv `isPotentialMutationCommand` did
not recognise as mutating, which reads "I do not know this command" as "it is safe". Four slipped
through: `["tar","-xf",…]` extracts, `["find",".","-exec",…]` runs anything, `stdout=open("out","w")`
writes a file the argv never names, and `cmd = "rm"; subprocess.run([cmd,"-rf","build"])` hid the
executable in a variable the parser skipped. It is an ALLOWLIST now: every element must be a literal, the
executable must be positively known read-only, `find` must not execute or delete, and any output-handle
keyword keeps the call.

**4. The Markdown-only optimisation laundered a code write through the `EVIDENCE-LIMITED` escape.**
`python3 -c "open(\"plugin/bin/adr-lint\",\"w\").write(\"x\")" docs/BACKLOG.md` named one Markdown file,
so §174's marker suppression fired, `docsOnly` saw only documents, and the Stop notice was suppressed for
a command that rewrote a gate. The marker is now withheld only for a positively recognised DIRECT file
writer whose every resolvable target is Markdown; an interpreter, a heredoc or an unknown command keeps
it.

**What this says about the method.** §179's self-attack was real and found six. It also introduced
finding 1 and missed findings 2-4 — including in the very function it had just rewritten. Attacks
generated by the same reasoning that wrote the code inherit its blind spots; the four above came from a
reviewer that constructed its own inputs and ran them.

## 181. CLOSED 2026-09-08 — a row pointing at a file that was never created is not evidence the behaviour is unfenced

§174 changed the missing-test message to ask a discriminating question — *does a sibling IN THAT SAME
FILE fence the same behaviour?* The peer who supplied that question then acted on it in their own
corpus and reported it back as producing a FALSE GAP, with the measurement:

> I told you 26 renames : 2 real gaps. It is 27 : 1.

They wrote tests for both claimed gaps. One was real (a CLI exit-2 path on a private URL, live and
unfenced; disabling the gate now fails a new test). **The other was not, and their own rule is why
they called it one.** The row planned a test in `tests/unit/test_audit.py` — a file its author never
created. No sibling in that file, because there is no such file, so the rule answered "gap". The
behaviour was fenced all along in `test_audit_warning.py`, a differently-named file. They found that
only by writing two replacement tests and mutating: neither killed a mutant that was not already
dying, so both were deleted and the row corrected to name the real test.

⚠ **The finding lands on the OTHER branch — the one this session did not touch.** `check_tests_exist`
splits on whether the named file exists. The sibling question is on the file-EXISTS branch and is
fine there: a file present minus one test really is very likely a rename. The peer's case takes the
file-MISSING branch, whose message has said, since long before today:

```
… but no such file exists in the repo — the row describes a test nothing can run
```

That is a claim about the BEHAVIOUR drawn from an observation about a PATH, which is `CLAUDE.md` §16
and ADR-005 in the direction that manufactures findings rather than hiding them. **A row naming a
file that was planned and never created is a different finding from a row naming a test that was
deleted**, and only the second says anything about coverage.

The row still BLOCKS — it does point nowhere, and that is a real defect in the record. What it no
longer does is conclude: it now says the path names no file, that whether the behaviour is fenced
elsewhere is *unproven here*, and that the two cases are not the same finding.

**And the general point the reporter drew, which is this project's own thesis arriving from
outside:** *"I could not tell a real gap from a mislocated row by reading. I could only tell by
writing the test and mutating. Both candidate tests passed, both looked reasonable, and one was
worth nothing — the only thing that said so was that no mutation killed it which did not already
kill something else. A test that passes is not evidence; a test that uniquely fails is."*

## 182. DECLINED 2026-09-24 — a check is admitted by its COMMAND NAME, and whether it can fail depends on its OPERATOR

Found 2026-09-08 by running each admitted check against bash with the run scoring nothing, and
comparing the gate's verdict to the shell's exit code rather than to an expectation.

`POSITIVE_CHECK_RE` admits `grep`, `test`, `[`, `[[`, `cmp`, `diff` and `jq -e` as segments that "can
fail the fence on wrong output". That is true of the command names and false of several things a
person writes with them. With `out` created by `tee` and empty because nothing ran:

```
test -s out                 -> 1    a real check: fails on empty
test -n "$(cat out)"        -> 1    real
grep -q PASS out            -> 1    real
jq -e . out                 -> 1    real
test -f out                 -> 0    EXISTENCE, not content — cannot fail here
[ -f out ]                  -> 0
test -e out                 -> 0
[ -d . ]                     -> 0
diff expected.txt out       -> 0    both empty because nothing ran
cmp out out                 -> 0
```

Every one of the last six is counted as the fence's vacuity check, so a fence whose ONLY assertion is
`test -f out` — or a golden-file `diff` whose expected side is also empty — is not blocked. The
golden-file case is the realistic one: comparing recorded output against actual output is an ordinary
fence shape, and it passes proving nothing exactly when the run scored nothing.

**This is `CLAUDE.md` §16 applied one level down, and the same shape as §178's runner tables.** There
the classification was by command name when the answer depended on the *case being measured*; here it
is by command name when the answer depends on the *operator*. A name is not a behaviour.

**Direction and severity.** This UNDER-blocks: the fence still receives the inert-guard advisory, it
is simply not refused. That is the safe direction and it is why v2.96.0 ships with this open rather
than holding the release — §16's own last bullet says a classification permitting a block needs
stronger evidence than one permitting advice, and this is the advice side.

**What a fix must not do:** widen the block. The cheap correct move is to admit only the operators
that can fail on an empty run (`-s`, `-n`, `-z` on captured content, a `grep` with a pattern) and let
the rest fall to `unaccounted`, which is UNPROVEN rather than a verdict.

⚠ **And a second-order finding about the method:** the first version of this probe compared
`blocks == can_fail` and reported ten MISMATCHES that were all correct — the polarity was inverted,
since a fence that CAN fail is one that must NOT be blocked. A harness that reports everything as
broken is as useless as one that reports nothing, and the tell was that the control cases failed too.
Both controls are in the probe now.

**Declined 2026-09-24.** Open by choice since it shipped: it under-blocks, the safe direction. The operator-admission fix in the body stays the cheap correct move if it is ever taken.

## 183. CLOSED 2026-09-08 — two doors into the evidence gate that this release opened, found before it was tagged

Found while v2.96.0's CI was in flight, by probing `namesOnlyMarkdownFiles` and `writesOutsideProject`
DIRECTLY rather than through a transcript. Both are fail-opens — a real code write escaping the Stop
evidence requirement — and both are **regressions introduced by this range**, because before it
neither exemption existed. That is why the release was held and re-cut rather than shipped with them
filed.

**1. A bare word can be a directory.** `namesOnlyMarkdownFiles` skipped any token without a `/` or a
`.` on the grounds that it could not be a path. A bare directory name is one:

```
cp docs/BACKLOG.md plugin      -> docs-only, marker withheld   ⚠ writes into a code directory
cp docs/BACKLOG.md plugin/     -> held                          (the slash is what saved it)
mv docs/BACKLOG.md plugin      -> docs-only, marker withheld   ⚠
```

The trailing-slash form being correct is what made the whole function look right. Tokens are now
checked for existence whatever their shape, with the command word itself excluded so `cp` is not
mistaken for a path.

**2. `~` is expanded by the shell and was not expanded here.** `$HOME` was already held — a `$` marks
a token this gate cannot follow, so the command keeps its marker — but `~` carries no such mark:

```
cd /tmp && touch ~/<repo>/plugin/bin/adr-lint   -> EXEMPT from the evidence gate
                                                   while bash writes inside the repository
```

Expanded before the containment test now, with the genuinely-outside tilde case asserted so the fix
is not "never exempt".

⚠ **THE PATTERN ACROSS §180 AND §183 IS ONE PATTERN.** Every exemption added in this range — skip the
marker for documents, skip the gate for work outside the project, skip a read-only child process —
was correct for the case that motivated it and wrong for a neighbouring case nobody had written down.
An exemption is a hole with a justification attached, and the justification is not what needs
testing: the *edge of the hole* is. Each of the five was found by asking "what is the smallest change
to this input that keeps the exemption firing while making the write real?"

**Method note, and it cost a wrong conclusion first.** The probe that found these initially compared
`gate blocks == shell can fail` and reported ten MISMATCHES that were every one correct — the polarity
was inverted, since a fence that CAN fail is one that must NOT be blocked. The tell was that the
CONTROL cases failed too. A harness with no control is a harness whose output cannot be read in
either direction (see also §182).

## 184. CLOSED 2026-09-08 — the shell splitters mis-cut on an escape and a command substitution, and one of the three was a false block

Found by probing `pipeline_stages` and `or_alternatives` — written earlier the same day — against shapes
the shell has and they did not:

```
grep -qE "a\"b|c" out              -> split mid-pattern: a backslash escape closed the quote early
grep -q $(cat out | head -1) out   -> split inside $( ): two fragments, both still classifiable
grep -q "a\"||b" out               -> same escape bug on the OR splitter
```

Two of the three were ABSORBED — the garbage fragment landed in `unaccounted`, which is UNPROVEN and
advises rather than blocks, and that is the conservative design working. **The command-substitution
one was not.** `grep -q $(cat out` matched the check pattern and `head -1) out` matched the
asserts-nothing pattern, so nothing looked unknown while the real check was lost, and a correct fence
was REFUSED.

⚠ **The containment was accidental, not designed.** Two mis-splits happened to produce unrecognisable
fragments and one happened not to. That distinction is not a property of the splitter, so it was not
something to rely on.

Both splitters now share `_split_shell`, which tracks quotes, backslash escapes (double quotes only —
single quotes take none) and `$( )`/backtick nesting. Asserted with the gate's own recommended guard,
whose alternation is a `|` inside quotes, and with the vacuous control that must still block.

## 185. CLOSED 2026-09-08 — a legacy record was routed as a TASK and told its own ADR was missing

Reported 2026-09-08 from a 77-record corpus, with the mechanism traced in this repository's source and
the count reconciled exactly: **34 false failures in one commit**, on records the commit never touched.

```
facts-first gate FAILED (ADR ownership) for docs/adr/001-event-payload-shape.md:
  expected exactly one owning ADR (ADR-001), found 0.
```

The chain, reproduced here on a hermetic fixture:

- `is_adr()` requires `## Existing Primitives Audit`. That section post-dates half of any older corpus,
  so every record written before it answers false.
- Control reaches the TASK branch, whose title test is `^# (Task )?ADR-…` — and a record titled
  `# ADR-001: Event payload shape` matches it. **The `Task ` it just parsed is discarded.**
- The owner search then scans `dirname(dirname(file))` and widens upward, so it looks in `docs/` and the
  repository root and **never in `docs/adr/`, where the record itself is**. `found 0`, always.

The reporter's arithmetic accounted for the count with nothing left over: 77 records, 42 modern, 35
legacy, minus `README.md` whose title does not match — 34.

⚠ **The message was worse than the noise.** "expected exactly one owning ADR (ADR-001), found 0" reads
as *this task's record is missing*, sending a reader to look for a record that is open in front of
them. The truth was *this is not a task*.

**Section presence is not a proxy for record-ness.** The discriminator is the title, and it was already
being parsed: a file is a task when it lives under `*/tasks/`, when its title carries the `Task `
prefix, or when its id carries a `-T<n>` component. All three arms are asserted, the last two as the
must-fail direction — without them the fix could be "never check ownership", which the first assertion
alone would accept.

## 186. CLOSED 2026-09-08 — the most alarming thing this gate says was 21 for 21 wrong, and §185's fix was about to turn it on for every legacy corpus

Reported 2026-09-08, immediately after §185 shipped the routing fix, by the corpus that found §185.
The report is the reason §185 was not shipped alone.

`check_tests_can_fail` blocks with *"no failure call is reachable in its body … — nothing in it can go
red"*. That is the strongest claim `adr-lint` makes about anything: it says a test is decoration, and
acting on it means rewriting a test that was correct. Across all 77 records the reporter enumerated
every distinct test it flagged: **21 tests, 21 false positives.**

⚠ **And §185 is what made this urgent.** Before it, legacy records never reached `adr-lint` at all —
they were misrouted to the task branch. Fixing the routing hands 34 more records to a blocking check
measured wrong every time it fired, in the population least able to tell a true finding from a false
one. A fix that exposes a worse bug is not finished.

**Shape 1 — `pytest.raises`, 19 of the 21.** `with pytest.raises(ValueError): create_app()` goes red
when the exception is NOT raised; that IS the assertion. `self.assertRaises` already matched through
`\bself\.assert`, and the pytest spelling matched nothing. ⚠ The reporter's own project memory had
recorded this class against **adr-lint 2.85.0**, proved in-container at the time, with a note not to
rewrite the tests it flagged — and it survived every release since, because nothing in this
repository asserted it. A defect known to an adopter for weeks was invisible here.

**Shape 3 — a test that asserts nothing and fails by an uncaught exception.**
`for body in bodies: MontonioWebhookResponse(**body)` fences a schema; a `ValidationError` fails it.
"Nothing in it can go red" is a universal negative over arbitrary code, which is `CLAUDE.md` §16 and
ADR-016 — the identical error as declaring a shell fence vacuous, in a different language. The block
is now kept only where the claim actually holds, a body that **calls nothing at all**, which is the
dead test this check was written for. A body that calls something gets advice saying the question is
UNPROVEN and naming the call.

**Shape 2 did NOT reproduce.** The reporter suspected `async def` bodies were not extracted; measured
here, `test_body` extracts them and finds their asserts. Their case has another cause, and it was told
back to them as unreproduced rather than fixed on suspicion.

## 187. CLOSED 2026-09-08 — the §12 review found three more fail-opens, and one was §16's author breaking §16

The different-lineage review at the release sha returned **FAIL — do not tag**, with three HIGH
findings, all fail-opens, all verified here against bash before anything was changed.

**1. A three-alternative OR-list.** The two-alternative rule from §180 was right and did not
generalise:

```
set -e; grep -q PASS /dev/null || true || false     -> exits 0
```

The middle `true` short-circuits the `false`, so the list cannot fail — while `status_carriers`
saw an always-fails tail, flattened every earlier alternative and found the `grep`. ⚠ **The
regressions covered two-alternative lists only, so a three-alternative one passed against the
narrower implementation** — which is exactly the narrowing-mutant argument from §180 arriving as a
real defect rather than a hypothetical. An alternative that cannot fail now makes the whole list
unable to fail, whatever stands before it.

**2. A function DEFINITION read as the check being performed.** `grep() { return 0; }` matched
`POSITIVE_CHECK_RE` because `\b` accepts the boundary before `(` — the same word-boundary family as
§179's hyphen, in a third spelling. Defining a function named after a checker counted as running it.
Definitions are excluded now, and the compound construct stays UNPROVEN rather than becoming a block,
which is what the reviewer recommended and what ADR-016 requires of a shape this gate cannot model.

**3. ⚠ `sed`, `tee` and `awk` WERE IN A LIST NAMED `READ_ONLY_CHILD`.** `sed -i` edits in place,
`tee` writes every file it is given, and an awk program redirects with `print > "f"`. All three were
typed into that allowlist earlier the same day — in the commit that introduced the allowlist
*because* "not recognised as mutating" had been read as "safe".

```python
subprocess.run(["sed", "-i.bak", "s/a/b/", "service.py"])   -> classified NON-mutating
subprocess.run(["tee", "out.txt"])                          -> classified NON-mutating
```

**That is `CLAUDE.md` §16 broken by the session that wrote §16, in the same day's work, on the exact
predicate §16 was written about.** The rule was authored, committed, and then violated within hours
— which is the strongest available evidence for §16's own claim that prose does not bind and only an
executable check does. There is now a mutant that re-adds all three names and dies.

**What this says about the review that found them.** §179's self-attack found six defects; §180's
review found four more; this review found three more still, after both. Each pass was real and none
was sufficient, and the residual is not obviously zero now — it is only smaller than it was.

## 188. CLOSED 2026-09-08 — the Windows job caught a fail-open the whole macOS session could not: canonicalising only the side that exists

The v2.96.0 release campaign went red on two jobs. All three failures were introduced by this range,
and the first is the one that matters: **a Windows-only fail-open in the evidence gate**, invisible to
every check run on the development machine.

**1. `underDirectory` canonicalised one side and not the other.** It compared `canonical(root)` with
`canonical(candidate)`, and `realpathSync` resolves a path that EXISTS while throwing for one that
does not — so a not-yet-created write target stayed lexical while the root came back resolved. On
macOS those still share a prefix. On Windows, where the resolved form can differ in case or drive
mapping, they stop sharing one, and an in-repository write reads as OUTSIDE the project — exempted
from the evidence gate entirely. The `windows` job saw it as `other: 0` where 1 was expected:

```
printf x > notes.txt        -> the shell mutation was DROPPED, not counted
```

Both comparisons are made now and EITHER counts as inside, deliberately: saying "inside" keeps the
marker and demands evidence, while a wrong "outside" silently drops the requirement.

⚠ **AND CANONICALISING BOTH SIDES WAS NOT ENOUGH — the Windows job failed again on the same
assertion.** `realpathSync` resolves the 8.3 short form of a Windows temp directory to its long form
on one side of the comparison and not reliably on the other, so two spellings of the same directory
still did not compare equal, and `printf x > notes.txt` — a command with **no `cd` anywhere** — was
still exempted.

The second fix stops computing the answer and states the invariant: **a command that never navigates
runs where the session is, and that IS the project.** It cannot be outside it, whatever any path
comparison says. The containment arithmetic still runs, but only for the harder question it was
written for — where a `cd` actually landed. Two rounds on one defect, and the lesson is the shape of
the first attempt: I fixed the path comparison twice before noticing the case never needed one.

⚠ **AND THE GUARD CARRIES NO MUTANT, DELIBERATELY.** One was written and came back GREEN: with
`if (false) return false` the code falls through to the containment arithmetic, which on macOS
answers correctly anyway — so the guard is redundant on this platform and only bites where two
spellings of one directory fail to compare equal. Making it observable would need a fixture whose
lexical AND canonical forms both disagree, which is the Windows short/long-name case and cannot be
built here. `CLAUDE.md` §7 asks for a `skip:` with the reason named; `tests/mutations.json` has no
skip mechanism (its `only` key narrows test NAMES, not platforms), so the entry was removed rather
than left scoring GREEN for a reason that is not a finding.

**So the assertions beside it are honest but not falsifiable here**: they state something macOS
cannot disprove, and the `windows` CI job is the only witness that can. That is worth writing down
rather than leaving a reader to assume the local suite covers it.

⚠ **Nothing local could have found this.** `CLAUDE.md` §7 says the platform is a parameter and you
cannot run Windows here; this is that rule collecting. The exemption was added, reviewed twice,
attacked directly, and shipped past all of it — because every probe ran where `realpathSync` agrees
with the lexical path.

**2. Two of my own assertions passed on Windows for the wrong reason.** Three used `/tmp`, which does
not exist there, so the `cd` failed and the shell stayed put — which is exactly the behaviour the
parser copies, so "nothing was outside anything" satisfied two assertions that expected `false`. The
third expected `true` and failed honestly. All three use a real temporary directory now. A test that
passes because its precondition was never met is `CLAUDE.md` §4 in the test's own voice.

**3. A GREEN mutant: `a mutating literal subprocess argv is still a mutation`.** The guard requires
EVERY argv element to be a literal, and the case asserted for it — `cmd = "rm"` — is caught by the
executable check whether or not non-literals are skipped, because skipping leaves `-rf` as the
command name. The distinguishing case has a READ-ONLY literal head and the danger in a computed
argument: `find` with a computed `-exec`, where skipping the non-literal leaves a bare
`find . ./mutate` that `FIND_WRITES` cannot see. Asserted now.

## 189. CLOSED 2026-09-08 — v2.96.0 released from 17078b0, and what the four review rounds cost

`node scripts/release-evidence.mjs 17078b0` → **SUCCESS, 23 of 23 jobs**, including Windows, macOS,
the coverage floor and all 16 mutation shards. `gh release create v2.96.0 --latest` published against
that exact sha. Not a draft, not a prerelease; `releases/latest` answers `v2.96.0`.

**Four CI campaigns were spent, and three were spent correctly.** The release was held and re-cut
three times rather than shipped with a known defect: twice for fail-opens found by attacking the code
after the gate was already green (§183, §187), and once for a genuine red — the `windows` job (§188).
Only the last of those was found by CI; the other two would have shipped.

**What each round found, in order, none of them redundant:**

| round | method | found |
|---|---|---|
| §179 | self-attack: write fences that DO assert, check for refusal | 6 false blocks |
| §180 | different-lineage review at 08ace6a | 4 more, incl. 1 the self-attack had just introduced |
| §183 | probing the new exemptions directly | 2 fail-opens in the evidence gate |
| §187 | second review, after both | 3 more, one of them §16 broken by §16's author |
| §188 | the Windows CI job | 1 fail-open no macOS probe could see |

**And the mutation campaign caught four tests of mine that asserted nothing** — a guard arm that never
reached the guard, a heading case verified ad-hoc and never committed, an array entry written *outside*
the array it belonged in (valid JavaScript that evaluates and discards), and a case that read MUTATING
for a reason unrelated to the guard under test.

⚠ **The residual is not zero and should not be reported as such.** §182 ships open by choice — it
under-blocks, which is the safe half — with two smaller members recorded beside it. Each round above
was real and none was sufficient; the honest claim is that the residual is smaller than it was, not
that it is gone.

## 190. CLOSED 2026-09-09 — §185 traded a false failure for SILENCE, and a corpus without the `ADR-` prefix was invisible to three checks

Reported 2026-09-09 from a 41-record corpus running v2.96.0, with both findings reproduced here on a
hermetic fixture before anything was changed. The reporter also confirmed §186 landed: their vacuity
findings went from 23 blocking at 2.95.0 to 1 advisory at 2.96.0, and the `pytest.raises` shape stopped
firing.

⚠ **1. THE §185 FIX SHIPPED A REGRESSION IN THE WORSE DIRECTION.** §185 stopped legacy records being
misrouted to the task branch and told their own ADR was missing. Nothing then claimed them. The
`adr-lint` arm needs `[[ "$base" == ADR-*.md ]] || is_adr "$f"`, and a corpus that names records
`NNN-slug.md` AND predates `## Existing Primitives Audit` satisfies neither — so the commit boundary
went **silent** on records that fail `adr-lint` when it is invoked directly. Measured by the reporter
on one tree: of 41 records that fail when linted directly, the facts gate reported nothing for 1 at
2.95.0 and **35 at 2.96.0**.

A false failure is loud and gets fixed. Silence is the fail-open half, and this is the second time in
two days that closing one finding opened a worse one (§186 was the first). The dispatch now also
accepts a file whose TITLE says it is a record, with the same `-T<n>` discriminator §185 introduced, so
a task is still a task.

⚠ **2. AND `glob("ADR-*.md")` MADE A CROSS-RECORD CHECK UNABLE TO FAIL.** Three sites enumerated the
corpus that way. On a corpus with no `ADR-` prefixes that enumerates **nothing**, so:

- every `Cross-references:` and `Invalidates:` pointer resolved to absent — 93 false advisory lines in
  the reporting corpus, each naming a record sitting in the same directory;
- `check_cross_record_cycles` built its graph from the same glob and therefore had **zero nodes**. A
  gate that cannot fail is the defect this project exists to demonstrate the absence of, and it was
  sitting in the gate.

Proven by rename alone: `git mv 002-second.md ADR-002-second.md`, no content change, and the finding
disappears. `adr-write/SKILL.md` tells authors to match existing repository naming, so the corpus was
following this project's own advice.

⚠ **THE FIX HAD TO NOT RE-OPEN §66.** Widening to `NNN-slug.md` naively reads the `2026` of
`2026-07-12-router.md` as a record number and grows an ADR-2026 — measured on a real corpus 2026-08-26.
`plugin/scripts/lifecycle.mjs::adrNumber` already carries the guard, so the enumerator BORROWS it
rather than inventing one: `^(?!\d{4}-\d{2}-\d{2})(?:adr[-_]?)?(\d{1,4})[-._]`. That is `CLAUDE.md` §5
applied to the change being written, which §179 recorded me failing to do two days running.

⚠ **AND THE GUARD I BORROWED COVERED ONE SPELLING OF A DATE.** `2026-07-12-x.md` was excluded;
`2026_07_12-x.md` and `2026.07.12-x.md` walked straight past and enumerated as **ADR-2026** — §66
returning in a separator nobody had checked. Found by listing awkward filenames against the pattern
rather than by reading it, which is the same §5 move applied to the guard instead of the bug. The
lookahead is `\d{4}[-_.]\d{2}[-_.]\d{2}` now, and both spellings are asserted.

⚠ **AND THE FIX SUPERSEDED §185's MUTANT, which CI caught before I did.** `dispatch: a record is not
routed as a task because it lacks a modern section` went GREEN on the shard: the widened `adr-lint`
arm now claims a title-identified record BEFORE the task branch, so reverting that branch alone
changes nothing a test can observe — reaching §185's original bug would take two edits. The
user-visible behaviour is covered by the new mutant (`a record identified only by its title still
reaches adr-lint`), which is RED and fails to SILENCE, the exact symptom §190 is about. The
superseded entry was removed rather than left scoring GREEN, the same call as §188's unobservable
guard: a mutant that cannot fail is not evidence, it is a claim that something is untested when it
is untestable.

**Known limit, stated rather than discovered later:** the enumerator is NAME-based. A record whose
filename carries no number and whose title does is not enumerated, because reading every file's title
on a per-record check would open the whole corpus, and §162 already reports this gate as slow on an
outside corpus.

## 191. CLOSED 2026-09-09 — the PATH arm of the same cross-reference check: 13 of 21 findings false, triaged one by one from outside

Reported 2026-09-09, immediately after §190, by the same corpus — and the report is a full triage of
every finding the branch produced there, sorted into false, misleading and true. That shape is worth
as much as the finding: it says which lines the check earns.

`_looks_like_a_path` claimed any token containing a separator OR a dot-suffix. Both halves over-reach:

| class | count | example | why it is not a file |
|---|---|---|---|
| tracker ids | 8 | `ops/NCR-04`, `obs/OBS-1`, `auth/AUTH-1` | a slash, no extension — the corpus has cited these for months |
| attribute references | 2 | `PageAnalyser.llm_calls` | `\.\w+$` read `.llm_calls` as an extension |
| section fragments | 1 | `§6.1` | the same rule read `.1` as an extension |
| **a real file with a `:line`** | **2** | `docs/adr/060-x.md:137` | the file is tracked; the suffix was matched as part of its NAME |

The last row is the one that mattered most and the reporter ranked it first for exactly the right
reason: it **claims a tracked file is missing**. The `§` spelling of that idea was already paired back
to its file by `section_fragments`; `:NNN` is the same idea spelled the other way and had no handling.

An extension is required now, and the line suffix is stripped before resolution. `§`-led tokens are
refused outright.

**What was deliberately NOT changed**, because the reporter judged it and did not push: four findings
name a bare filename that exists at a longer path (`crypto.py` under `src/a11y_scanner/`). The message
is literally true and reads as worse than it is, but a suffix match brings its own ambiguity. Left
alone, and said out loud rather than silently.

⚠ **AND THE BRANCH EARNS ITS KEEP — the same report says so.** Four findings were TRUE, and two are
real defects in the reporting corpus: ADR-072 cites `015-plan-pricing-model.md` where the record is
`015-usage-metering-engine.md`, and ADR-073 cites `036-data-retention.md` where it is
`036-launch-checklist-followup.md`. So the fix narrows the token classifier in FRONT of the check
and leaves the check itself alone. Under-reporting is the safe half here because this branch advises
(`CLAUDE.md` §16), and the known cost is a genuinely missing extensionless path.

## 192. CLOSED 2026-09-09 — the release-candidate review found four defects the gate was green over, and one of them only exists on Linux

The §12 review of `17078b0..54ee033`, run after `scripts/selftest.sh` was green and before the tag,
returned REQUEST CHANGES with three HIGH findings and one MEDIUM. All four reproduce. The release
was held and re-cut rather than shipped with them named, because three fail OPEN.

### The corpus was enumerated from the DISK, next to a helper that already knew better

`record_files` globbed `docs/adr/*.md`. `Path.glob` suppresses the error it hits, so an unreadable
corpus directory returned an empty sequence and every caller read that as an empty corpus:

```
$ chmod 111 docs/adr        # the files inside are tracked and readable
Path.glob sees: []
git-backed records: [('001-first.md', 1), ('002-second.md', 2)]
resolve ADR-002: True
```

`check_pointers` then advised that a tracked `ADR-002` is "not a record in this corpus", and
`check_cross_record_cycles` built zero nodes and became a gate that cannot fail — the §190 symptom
again, from a different cause. `resolve_qualified_dep` is worse: it BLOCKS, so a could-not-look was
a refusal of correct work.

⚠ **`tracked_paths` was already three hundred lines away, with a docstring saying exactly this** —
that None and an empty set must never collapse, and that resolving against `Path.exists()` makes a
gate's verdict depend on who is asking. `CLAUDE.md` §5's second half, again: the lesson was paid for
in one function and rewritten fresh in another. `record_files` now takes `tracked` as a REQUIRED
positional with no default, so a call site that forgets it raises rather than falling back to the
disk. Two forgotten sites and seven test helpers did exactly that, loudly, on the first run.

### The date guard covered one width, one commit after covering one separator

`2026-9-9-x.md` still enumerated as ADR-2026. The lookahead demanded `\d{2}`, so every
single-digit-component spelling walked past it. Enumerated with a command rather than read:

```
2026-9-9-x.md    -> 2026     2026-9-09-x.md -> 2026
2026-09-9-x.md   -> 2026     2026-7-2_x.md  -> 2026
2026-07-x.md     -> 2026     2026-07.md     -> 2026
```

The year half is anchored to `(?:19|20)` so `0042-01-foo.md` is still record 42: rejecting a real
record costs a false advisory, and only the date spellings are worth that. **This is the same guard,
found the same way, one round apart — the sweep the first fix should have run.**

### A task file stood in for the record it belongs to

`001-T2.md` enumerated as record 1, so `resolve_record_number("ADR-001")` answered True on a corpus
where record 1 is genuinely absent. A missing record masked by its own task. Rejected aggressively
(`TASK_FILE_RE`), because admitting a task fails open and refusing a record only costs an advisory
(`CLAUDE.md` §16); `042-t3-storage.md` is asserted as still a record.

### A UTF-8 BOM hid a record from the commit boundary, on Linux and Windows only

Three bytes preserved §190's fail-open. Measured on one file, `EF BB BF # ADR-001: Legacy`:

| grep | `^# ADR-[0-9]` | control, no BOM |
|---|---|---|
| GNU grep 3.11 (debian) | 0 | 1 |
| busybox grep 1.37 | 0 | 1 |
| BSD grep (macOS 15) | **1** | 1 |

So a BOM-led legacy record routed nowhere on the platforms CI blocks on, and the boundary exited
silently. Stripped with a shell helper rather than by anchoring to line 1: the title patterns scan
the whole file on purpose, and narrowing them would trade one silence for another.

⚠ **The reviewer's own evidence line said BOTH title greps miss it, and that did not reproduce here**
— because it was read on macOS, where BSD grep skips the mark itself. The finding was right and its
measurement was platform-silent. `CLAUDE.md` §7 applied to a REVIEW rather than to code: a review run
on one platform carries that platform's answer, and the direction of the error is not predictable
from the finding. **The routing assertion in the regression cannot fail on macOS either**, before or
after the fix, so the helper is asserted directly beside it — an arm that fails on every platform.

### The extension cutoff fixed the reported attribute and not its class

`PageAnalyser.llm_calls` was six characters and `PageAnalyser.calls` is five. There is no rule that
separates `Identifier.identifier` from `crypto.py` — both are a word, a dot and a word — so a
SEPARATOR is required now, which is the discriminator that exists. That also retires the four
misleading bare-filename findings §191 declined to push on. Measured on this repository's own
corpus: every cited path carries both a separator and an extension, so nothing here changes.

**What found these, since it was not reading the code:** a different-lineage review that executed the
classifiers on inputs it constructed, and then a `chmod` fixture, a container running two other greps,
and a filename sweep to confirm each one. Four review rounds went into 2.96.0 and a fifth into this
release candidate; each found real defects, and none was sufficient. The residual is smaller, not
zero.

## 193. CLOSED 2026-09-09 — the fix for a fail-open shipped a fail-open, and a name-shaped guard was wrong in both directions twice

Round five of the release-candidate review, on `acaf062`, returned REQUEST CHANGES with two HIGH and
two MEDIUM. All four reproduce. The release was held a second time.

### The BOM helper erased a file whose title has no trailing newline

`IFS= read -r first < "$1" || return 0` returns non-zero at EOF **even when it filled the variable**,
so a one-line record with no terminator produced nothing at all:

```
no-newline.md        raw grep = MATCH    through bom_free = miss
bom+no-newline.md    raw grep = miss     through bom_free = miss
```

The first column is the state BEFORE this helper existed. So the fix for §192's fail-open introduced
a NARROWER fail-open of the same kind, and the regression written beside it covered only
newline-terminated input. It is byte-oriented now — a three-byte check, then `tail -c +4` or `cat` —
which also preserves NULs and stops buffering an arbitrarily long first line.

### A filename cannot settle whether a file is a record, and two rounds of guessing proved it

The name-shaped guards were widened by hand twice, and each round was wrong in BOTH directions:

| input | before | correct |
|---|---|---|
| `003-T2-plan.md` beside `003-real.md` | record 3, and sorted FIRST, so a real dependency BLOCKED | a task |
| `004-t2.md` titled `# ADR-004` | excluded | a record |
| `2000-13-storage.md` titled `# ADR-2000` | excluded by the `19|20` anchor | a record |
| `1899-9-9-notes.md` | ADR-1899 | a dated note |
| `2026-9-9-router.md` | ADR-2026 | a dated note |

⚠ **And the premise the aggressive rejection rested on was FALSE.** §192 argued that refusing a real
record only costs an advisory. `resolve_qualified_dep` BLOCKS, so it cost a refusal of correct work —
the direction `CLAUDE.md` §16 weighs heaviest, applied to a gate by the person who had just written
that section into the rules.

⚠ **And the correction to that correction: `resolve_qualified_dep` is not the only blocking consumer,
which is what this entry and the code comment beside it both claimed.**
`check_cross_record_cycles` appends too. Asserted from memory while writing the fix, repeated to the
next reviewer as a premise, and disproved by reading `errors.append` in the cycle check — a count of
blocking callers is exactly the kind of claim `CLAUDE.md` says to establish with a command rather
than from memory (§5).
the direction `CLAUDE.md` §16 weighs heaviest, applied to a gate by the person who had just written
that section into the rules.

The name no longer decides. Only the two ambiguous shapes — task-shaped and date-shaped — are opened,
and their TITLE says which they are; an ambiguous title that cannot be read leaves the whole
enumeration unproven rather than dropping that one file. The corpus is still not opened for the
unambiguous majority (§162).

### The blocking resolver stopped at the first name carrying the number

`resolve_qualified_dep` returned on the first candidate whose number matched, and sorted order puts
`003-T2-plan.md` ahead of `003-real.md`. It considers every candidate now.

### And its task half was still reading the disk

`tasks.is_dir()` and `tasks.glob()` survived §192's conversion untouched, so an IGNORED task file on
disk satisfied a blocking dependency and a tracked task absent from a sparse worktree read as
missing. Tasks come from `tracked` now, like the records — the same §8 fix, applied to the half that
was missed the first time.

### `core.quotePath=false` turns off ONE kind of escaping

It suppresses the escaping of non-ASCII bytes and nothing else. A path holding a tab, a newline, a
backslash or a quote still arrives C-quoted and wrapped in double quotes:

```
docs/adr/001-first.md
"docs/adr/002-tab\there.md"
```

The parser rejected the quoted entry, so a corpus containing one such file enumerated as EMPTY —
could-not-look read as nothing, one more time. `git ls-files -z` emits every name verbatim, and the
`.strip()` is gone because a name's own bytes may be spaces.

### What this round cost, and what it says

⚠ **And one of the mutants written for this round went GREEN, which is a finding about the test.**
The task-title guard survived deletion because the fixture titled its task `# Task ADR-003-T2` — a
spelling the RECORD pattern refuses anyway. Only `# ADR-003-T2`, which reads as a record until you
notice the suffix, needs that guard at all, and the fixture carried no such file while appearing to
test it. Both spellings are in the fixture now.

A superseded mutant was removed rather than left scoring GREEN: the date-width case no longer exists
as a distinct mechanism, and a mutant that can only fail for another mutant's reason is not evidence
(§188, §190). Five review rounds have now each found real defects in this release, and the two most
serious were introduced BY the previous round's fix. That is the argument for the review being the
gate rather than the formality, and for holding a release rather than naming a known fail-open in the
notes.

## 195. DECLINED 2026-09-24 — OpenCode support: what is already portable, what is not, and the one question that decides it

Asked for from outside: users of the OpenCode terminal agent want this harness there. Nothing is
being built yet. This entry records the surface as MEASURED on 2026-09-09 so the decision is made
against facts rather than against a recollection of either product.

### What is already host-neutral, measured

`plugin/bin/qh-mcp` runs standalone, spoken to over stdio with no Claude Code anywhere:

```
initialize ok: {'name': 'quality-harness', 'version': '2.97.0'}
tools: qh_adr_lint qh_adr_next qh_adr_debt qh_adr_judge qh_arch_lint
       qh_adr_retire_check qh_postmortem_verify qh_adr_context qh_orientation
```

Every gate in `plugin/bin` is a standalone Python or Node executable with a `.cmd` shim beside it,
so any agent that can run a shell command already has them. The whole `CLAUDE_*` coupling is three
variables — `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_CODE_GIT_BASH_PATH`.

### What does not port

`hooks/hooks.json` is a Claude Code declaration. An OpenCode plugin is a JavaScript module exporting
hook functions, loaded from `.opencode/plugins/` or the user's config directory, so the automatic
boundary needs an adapter that shells out to `lifecycle.mjs` and `branch-state.mjs` — both of which
already read a JSON payload on stdin, so the adapter is a payload translation rather than a rewrite.
Documented event names that line up: `session.created`, `tool.execute.before`, `tool.execute.after`,
`session.compacted`.

### ⚠ THE QUESTION THAT DECIDES WHETHER THIS IS WORTH BUILDING

**Their documented event list shows no clean equivalent of `UserPromptSubmit`.** `.claude/rules/15`
is one incident about exactly this: `SessionStart` ALONE IS NOT ENOUGH, because it fires when a
session begins and the session about to plan a release on a red branch is the one that never sees it.
A port built on `session.created` alone would reproduce the failure §15 exists to prevent, and would
do it silently, in someone else's harness, under this project's name.

So the first thing to establish is whether OpenCode can run something on every user message —
`message.updated` is a candidate and was NOT verified. **Unverified is the state this entry is in;
it is not a plan.**

### And the constraint that shapes any answer

`CLAUDE.md` §14 and the Quality Harness section of the user's global rules both say the plugin
package is the only source of truth, and that a second copy goes stale silently while serving an
older shape under a name that looks current. That measured hazard is about copies of the SKILLS.
Any OpenCode work has to be an adapter over the shipped gates, never a translated second lifecycle.

**Declined 2026-09-24.** No OpenCode adapter is built. The question that decides it — no clean equivalent of UserPromptSubmit — is recorded above; any adapter must wrap the shipped gates.

## 196. CLOSED 2026-09-24 — ADR-039 still names unused `readRecordFiles` after the walker was deleted

ADR-039 (Accepted) records as Neutral that unused `readRecordFiles` stays in `lifecycle.mjs`, and as
a Non-Goal "Untangle `lifecycle.mjs`, including deleting unused `readRecordFiles`". A later commit
on this branch deleted the function. The record still says it stays. History is not rewritten
(CLAUDE.md §10).

Command (2026-09-10), plugin product tree:

```
rg -n 'function readRecordFiles|readRecordFiles\(' plugin --glob '!**/node_modules/**' --glob '!**/__pycache__/**'
```

Output: empty. The symbol is gone from `plugin/`.

The Accepted record still cites the old line and the stay/Non-Goal:

```
docs/adr/ADR-039-records-use-the-same-listing.md:13:plugin/scripts/lifecycle.mjs:2990:function readRecordFiles(root, reader) {
docs/adr/ADR-039-records-use-the-same-listing.md:91:- **Neutral:** Unused `readRecordFiles` stays in `lifecycle.mjs`.
docs/adr/ADR-039-records-use-the-same-listing.md:97:- Untangle `lifecycle.mjs`, including deleting unused `readRecordFiles`
```

Leave the record. A later author who wants the corpus to describe today's tree writes a new record,
not an edit of 039.

**CLOSED 2026-09-24.** A note about a record: ADR-039 is history and is not rewritten to match today's code (CLAUDE.md §10). Nothing owed.

## 197. CLOSED 2026-09-24 — three fence-blind `## ` readers remain in adr-verify after ADR-045

ADR-045 moved the record grammar into `plugin/lib/record.py` and routed adr-verify's two Acceptance
readers through the shared, fence-aware `sections_of`. The class it fixed was "a reader that stops at
the next `^## ` line whatever fence it is inside". Enumerated 2026-09-11 on `ea12656`:

```
$ rg -n '\(\?=\^## \|\\Z\)' plugin/bin
plugin/bin/adr-verify:666:    m = re.search(rf"(^## {re.escape(section)}\s*\n)(.*?)(?=^## |\Z)", text, re.M | re.S)
plugin/bin/adr-verify:1672:    section = re.search(r"^## Ordered Steps$(?P<body>.*?)(?=^## |\Z)", text,
plugin/bin/adr-verify:1983:    section = re.search(r"^## Verification Log\s*\n(.*?)(?=^## |\Z)",
plugin/bin/adr-verify:2171:    section = re.search(r"^## Acceptance\s*$(.*?)(?=^## |\Z)", text, re.M | re.S)
plugin/bin/adr-verify:2542:    m = re.search(r"^## Acceptance\s*$(.*?)(?=^## |\Z)", text, re.M | re.S)
```

2171 and 2542 are fixed. The three left decide no digest, which is why they were not pulled into
ADR-045, and each needs its own regression before it moves:

- **666** finds a section by position to REWRITE it (the entry writer). A `## ` line inside a fenced
  output excerpt in the Verification Log — a test failure that printed a Markdown heading is enough —
  would end the section early, and the next entry would be appended in the wrong place.
- **1983** reads the Verification Log for the same reason; the same excerpt truncates what it reads.
- **1672** reads Ordered Steps; a fenced `## ` there is unlikely but not impossible.

Also left (a different disagreement, not fence-blindness): `adr-next` matches only a ```bash fence
under Acceptance while `adr-verify` and `adr-lint` read ```sh and ```shell too (`ACCEPTANCE_FENCE`).
A task written with ```sh is verified by one tool and offered as READY by another.

**CLOSED 2026-09-24.** Fixed by ADR-045 T3-T6 (9942edb): the three readers named above now read through `sections_of` (`plugin/bin/adr-verify`).

## 198. CLOSED 2026-09-11 — §197's three readers moved, and §197 was wrong about adr-lint

Correction to §197, which is left as written (CLAUDE.md §10). Its last paragraph says adr-verify AND
adr-lint read ```sh and ```shell. adr-verify did. adr-lint's `ACCEPTANCE_FENCE` did, but the check
that matters — the digest path at `plugin/bin/adr-lint:1654` on `01cb598` — was a third regex,
`bash\s*\n` only. Probed 2026-09-11 (Codex review of ADR-045 T1/T2, HIGH): a ```sh task adr-verify
ran and recorded; README `done`; adr-lint reported "no ```bash fence", `acc_all` was `""`, and the
whole `want_digest` block was skipped — the same output byte for byte with the digest forged. Not
"a different disagreement" as §197 called it: a fail-open in the gate whose one job is to refuse a
digest that does not match (CLAUDE.md §16).

Both halves of §197 are closed by ADR-045:

- T3 — one opener, `record.ACCEPTANCE_FENCE`, imported by adr-verify, adr-lint (fence check, digest
  path, human-mutant advisory) and adr-next. Class command and every hit's disposition are in the task.
- T6 — `append_entry`, `declared_steps`, `claims_in` read through `record.section_span` /
  `sections_of`; `rg -n '\(\?=\^## \|\\Z\)' plugin/bin` is empty and the one-module test refuses the
  shape. Each has its own regression: the entry writer on a fenced excerpt, `--steps` on a step
  declared after a fenced line, the sweep on a claim after one.

Also from the same review, in the same record: T4 (a missing lib exits the gate's own could-not-run
code, and the `record.py`-absent branch of adr-verify / spec-verify has a fixture), T5 (a repeated
`## ` heading is a finding). Left named: a `record.py` that exists but raises on import is a traceback
(spec §Non-Goals); the eight non-CR/LF separators `splitlines()` folds are documented, not changed.

## 199. CLOSED 2026-09-11 — the second Codex review of ADR-045: what T3–T6 introduced, and the edges they left

Findings of the different-lineage review of `9942edb`..`1739425` (CLAUDE.md §12), each closed in ADR-045
T7–T11 or ADR-046, with the two corrections to earlier records that §10 says go here rather than into them.

- **§198 overstated T6's writer bug.** §198 and T6 describe the fenced `## FAIL` case as reachable from
  tool-written output. It was not: adr-verify indents every excerpt line by two spaces, and `_HEADING`
  is line-start, so an indented `## ` inside an excerpt was never a heading. The T6 fixture used an
  unindented fence with an unindented `## FAIL` — a hand-written shape. The class T6 closed is real
  (a fence-blind reader ends a section at any `^## ` line), and the reachable member was the one the
  review then found: an excerpt line that is itself ``` (T8). §198 and T6 are left as written.
- **T8** — a quoted output line that is a fence line toggled the grammar; `## Mutation Log` became
  text and the next entry landed under it, exit 0. Neutralised at the writer through the grammar
  (`record.fence_safe`, `excerpt_fence`); an open fence is named by line by adr-verify (refuses),
  adr-lint (blocks a task, advises an ADR) and adr-next (`unproven` note).
- **T7** — T6's writer glued an entry onto a heading that ended the file without a line break; the regex
  it replaced had refused that file. **T9** — adr-lint named an unrunnable opener to its first token.
  **T10** — two fence grammars became one (CommonMark's two markers, length-matched closers, a runnable
  opener that is a line; `ACCEPTANCE_FENCE` deleted for `acceptance_fence`). **T11** — `splitlines()`'s
  eight extra separators, which the spec had filed as a non-goal on a session's reading rather than the
  owner's decision; reversed as a dated line, the corpus recomputed with 0 differences each time.
- **ADR-046** — three callers turned a gate's own could-not-run exit into something else:
  `facts-gate-dispatch.sh` into "not satisfied … Fix the artifact", `qh-mcp` into `isError: false`
  content, `lifecycle.mjs` into silence. A separate record because ADR-045 governs the grammar inside the
  gates and these are Session-layer surfaces relaying what a gate says about itself.

Left named (T11 §Out of Scope): the gates still call Python's `splitlines()` on record text OUTSIDE
`sections_of` — header lines (`**Rests-on:**`, `**Status:**`), table rows, the proof-map parser.
Enumerated 2026-09-11: `rg -n 'splitlines\(\)' plugin/bin/adr-lint plugin/bin/adr-next plugin/bin/adr-verify plugin/bin/spec-verify plugin/bin/arch-lint plugin/bin/adr-debt plugin/bin/adr-retire-check | rg -v '^\S+:\s*#'`
→ 25 call sites. None decides a heading or a digest (those go through `record.split_lines`), so a
stray FF in a header line can at most misread that header. Not fixed here: each is a different reader
with a different regression, and the class is the whole set of them.

## 200. DECLINED 2026-09-24 — adr-verify `file_newline` rewrites mixed terminators and does not name a lone CR

Measured 2026-09-12 against `plugin/bin/adr-verify` `file_newline` / `source_bytes` (the pair
`append_entry` uses). Not fixed in the ADR-045 T11/T12 delivery: not a one-function closer change,
and a rewrite of every evidence append is not shown to have 0 corpus impact.

```
$ python3 - <<'PY'
# file_newline / source_bytes copied from plugin/bin/adr-verify
lone.write_bytes(b'a\rb\n'); print(repr(file_newline(lone)), source_bytes('a\rb\n', file_newline(lone)))
mixed.write_bytes(b'a\r\nb\nc'); print(repr(file_newline(mixed)), source_bytes('a\r\nb\nc', file_newline(mixed)))
PY
```

- lone CR (`a\rb\n`): `file_newline` is `'\n'` (no `\r\n` byte pair); rewrite is `b'a\rb\n'` — the
  lone CR is kept as a byte, not named as a line break and not folded.
- mixed CRLF/LF (`a\r\nb\nc`): `file_newline` is `'\r\n'` because any `\r\n` wins; rewrite is
  `b'a\r\nb\r\nc'` — the LF line is converted to CRLF.

`file_newline` answers "does this file contain a CRLF pair?" and `source_bytes` then spells every
logical `\n` in that one terminator. A mixed file is rewritten as if it were only CRLF. A lone CR
is invisible to the detector. Each needs its own regression on `append_entry` / `write_source`,
and the class is the detector plus the rewriter, not T11's splitter.

**Declined 2026-09-24.** The lone-CR case in `file_newline` is not scheduled; mixed terminators keep the current rule.
