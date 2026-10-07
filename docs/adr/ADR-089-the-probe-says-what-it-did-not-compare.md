# ADR-089: corpus-probe says what its diff and attestation could not see

**Status:** Accepted
**Date:** 2026-10-06
**Owner:** Zy
**Spec:** None — no spec stage; the leads are docs/BACKLOG.md §351 ("Untrue sentence or blind spot": items 10, 22.3, 14), §353's two leads for §354's batch, and the php-laravel-monolith attestation of 3.8.8
**Cross-references:** docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-064-corpus-chaos-is-the-release-loop.md, docs/adr/ADR-070-a-peer-attestation-is-imported-and-checked-against-its-commit.md, docs/adr/ADR-082-an-attestation-says-what-changed.md, docs/BACKLOG.md, docs/corpus-reports/README.md, CLAUDE.md
**Governs:** plugin/scripts/corpus-probe.mjs, scripts/attest-import.mjs, scripts/release-evidence.mjs, docs/corpus-reports/README.md, plugin/bin/adr-retire-check
**Enforced-by:** None — declared by its tasks. Each task adds one campaign mutation per `Rests-on` name; naming them before they exist would be a pointer to nothing.
**Invalidates:** ADR-082 — its Decision says `verdictChanges` is null "when the reports are not comparable", and a PARTIAL look is not comparable today; under this record a PARTIAL pair is compared over the records at least one run gave a verdict, and only an UNPROVEN look or different corpora stay null. Its spec's facts F-1 ("`compared` counts the adr-lint records present in both reports") and F-2 ("a `look` other than ok … is null") change with it. ADR-070 — Decision 2's key list gains `look` and `notCompared` (additive; every filed attestation stays valid). ADR-064 — Decision 2's "prints only what changed" gains a line grammar, and a PARTIAL pair is no longer wholly "not compared".
**Served-path change:** `corpus-probe --diff` prints one marked line per element that came or went, and compares the work-next, adr-state and adr-next fields it skipped; `corpus-probe --attest` carries `look` and `notCompared` and counts verdict moves over a PARTIAL run; a reader whose output overflowed is said to have overflowed; `adr-retire-check --adopt` prints no absolute path, and the sentences that name it say it reports rather than adopts.

## Context

All measurements below were taken 2026-10-06 with the working-tree probe at `73f930f` (plugin 3.8.10), node 24.11.1, Python 3.14.8, macOS 27.0, over scratch copies of `tests/fixtures/corpora/go-module` in the session scratchpad (git-staged, never committed, no `--sweep`). The reader fingerprint read `dirty: true` throughout, because another session had `plugin/bin/adr-next` modified; that only nulls `at`, and nothing below depends on `at`.

- **A PARTIAL run hides a real regression from both outputs (reproduced).** A corpus whose `ADR-001` is readable and whose added `ADR-002` holds a NUL byte is `look: PARTIAL` (`partialBecause` names ADR-002). Deleting ADR-001's only alternative turned it PASS → FAIL ("Alternatives Considered has no entries"). `--diff` printed exactly `look: PARTIAL → PARTIAL: not compared`, and `--attest --since` gave `verdictChanges: null`, also with the earlier report's reader digest changed so the same-readers rule did not apply. The control, the same readers-digest change over two `ok` reports, gave `{ compared: 1, passToFail: 0, failToPass: 0 }`. The cause is `comparable` (`plugin/scripts/corpus-probe.mjs:473`), which requires `look === 'ok'` on both sides, and `verdictChanges` (`:663`) returns null when it is false.
- **What that cost (filed).** The php-laravel-monolith attestation of 3.8.8 (`docs/corpus-reports/2026-10-06-php-laravel-monolith-3.8.8-944bb37.json`) has 17 records and `verdictChanges: null` because its look is PARTIAL. Its runner compared all 23 adr-lint verdicts by hand (BACKLOG §352, the v3.8.8 release note). release-evidence counts it as nothing (`countsAsRun`, `scripts/release-evidence.mjs:250`). BACKLOG also records the same corpus "PARTIAL in both runs, uncompared" at the 3.8.7 RC, and §321's leads record a peer diffing the JSON by hand because `--diff` "compares nothing when both reports are PARTIAL".
- **The "-" mark (§353's lead): the symptom as worded did NOT reproduce; a real ambiguity did.** At the working tree and at `944bb37`, `setChange` (`:545-550`) prints a removed advice line as `adrLint <file> advice: - <line>`. Removing one advice line in the scratch corpus printed exactly that. What did reproduce, by varying a saved report by hand:
  - several elements are joined onto ONE line with `, ` (`:549`), and advice text itself contains `, ` and ` - `, so the second and later marks sit mid-sentence and cannot be told from the text. One line read `… advice: + advice: T2: a new line, with a comma - and a dash, - advice: T1-add-items.md: UNRUN …`;
  - `adrLint <file>: new, <verdict>` (`:588`) and `adrLint <file>: removed` (`:598`) carry no mark at all;
  - two grammars coexist: `SessionStart + <line>` (`:604-605`) and `<field>: + <item>`.
  The outside run's own output was not filed, so which of these it met is UNKNOWN.
- **The blind spot is wider than item 10 (reproduced, and enumerated).** A hand-varied report changing `workNext.specs`, `unprovenSpecs`, `retirable`, `next`, `underUndecided` and one `adrNext[].ready` printed only the advice line above: none of those six was compared. The class is every report key `diffReports` never reads. Enumerated over the scratch report `a.json` with `node -e 'const r=require(process.argv[1]),s=require("fs").readFileSync(process.argv[2],"utf8"),b=s.slice(s.indexOf("export function diffReports"),s.indexOf("/** The version of the interpreter"));console.log([...Object.keys(r),...Object.keys(r.workNext).map(k=>"workNext."+k),...Object.keys(r.adrState).map(k=>"adrState."+k)].filter(k=>{const l=k.split(".").pop();return !b.includes("\x27"+l+"\x27")&&!b.includes("."+l)}).join(" "))' a.json plugin/scripts/corpus-probe.mjs`, which printed 14 keys: `root frozenTaskDirs adrNext corpusReport sweep slowest workNext.underUndecided workNext.retirable workNext.specs workNext.unprovenSpecs workNext.next adrState.governingNothing adrState.contested adrState.danglingSupersession`. It matches by name anywhere in the function, so it under-reports: `workNext.look` and `adrState.look` count as read because `.look` appears for the top-level look, and `workNext.partialBecause` because the PARTIAL arm reads it, though an `ok` pair never compares it. Those three are in the class too; `look` changes are already said by the PARTIAL arm, and `partialBecause` is empty under an `ok` look. `uncoveredReadySpecs` is not in the probe report at all; work-next prints it (`plugin/scripts/work-next.mjs:704`) and the probe's summary (`:427-441`) drops it.
- **`look` is absent from the attestation (item 10, read).** `attestation` (`:676-711`) carries no `look`. A PARTIAL run attests exactly like an `ok` one, and a release reader cannot see that part of the corpus was unread.
- **"not a git checkout" with git absent (item 10): reproduced only through the seam.** End to end, with `PATH` holding only node and python3, the probe's own listing failed first, the look was UNPROVEN, and `atReason` gave the look reason, which is right. The conflation is one level down: `readerFingerprint` (`:79`) given a `run` that fails with `ENOENT` returns `{ git: null, dirty: null }` and no reason, the same value as a plugin that is not a checkout, so `atReason` (`:689`) can only say "the plugin is not a git checkout". It reaches a reader whenever the corpus listing succeeds and the fingerprint's git spawn does not.
- **ENOBUFS (item 22.3, reproduced).** A child printing 2 MiB through `spawnSync` with no `maxBuffer` returned `error.code` `ENOBUFS`, status null, and 1,114,112 bytes of stdout: it started, ran and was cut off. `failedToRun` (`:129-133`) worded it `did not start: ENOBUFS`. None of the probe's reader spawns (`:231`, `:233`, `:283`) sets `maxBuffer`, so each has Node's 1 MiB default; the original report was adr-lint at 4,002 tasks (§295 item 22).
- **`--adopt` (item 14, reproduced).** `python3 plugin/bin/adr-retire-check --adopt docs/adr docs/adr-archive` from a scratch corpus printed `[MIGRATION-REQUIRED] <absolute scratchpad path>/docs/adr + <absolute scratchpad path>/docs/adr-archive …` (`plugin/bin/adr-retire-check:441` prints the resolved roots). The mode only reports and writes nothing (`adoption_report`, `:383-453`), yet `plugin/scripts/work-next.mjs:840` and `plugin/scripts/lifecycle.mjs:3611` both say it "adopts it". Enumerated with `grep -n -E "adopts it|--adopt" plugin/scripts/*.mjs plugin/skills/*/SKILL.md`: those two sentences, plus `lifecycle.mjs:1852` ("adopt it first (`adr-retire-check --adopt …`)"), which names the step, not the tool's effect, and is left as is.
- **Locks (CLAUDE.md §2).** `python3 scripts/test-locks.py` reported 71 locks on `tests/corpus-probe.test.mjs`, 24 on `tests/release-evidence.test.mjs`, 8 on `tests/attest-import.test.mjs`, 1 on `tests/corpus-matrix.test.mjs`, and 0 on `tests/named-not-dropped.test.mjs` and `tests/chaos-315-probe.test.mjs`. The locked tests pin single-element lines (`workNext.unbacked: + …`, `PASS → FAIL — …`), `look: ok → UNPROVEN: not compared`, `verdictChanges` null against an UNPROVEN `since` (ADR-082 T1), and attest-import's refusal of a fourth key inside `verdictChanges` (ADR-082 T2). The decision below keeps every one byte-identical.

## Existing Primitives Audit

- **`setChange`** (`corpus-probe.mjs:545`): reshaped to emit one line per element; every set comparison already goes through it, so the grammar changes in one place.
- **`verdictMoves`** (`:483`): reused as the one comparison `--diff` prints and the attestation counts (ADR-082). It gains the "both sides gave a verdict" rule and returns the not-compared count beside `compared`.
- **`comparable`** (`:473`): narrowed to "neither side is UNPROVEN, and the corpora match".
- **`readerFingerprint`** (`:79`): already separates `reason` (a reader file unreadable); it gains the git spawn's failure as its own field.
- **`failedToRun`** (`:129`): the one classifier for a spawn's `error`; it gains the ENOBUFS arm.
- **`verdictChangesShape`, `KEYS`** (`scripts/attest-import.mjs:103`, `:22`) and **`countsAsRun`, `outsideRun`** (`scripts/release-evidence.mjs:250`, `:254`): reused. `verdictChanges` keeps exactly its three keys.
- **`adoption_report`** (`plugin/bin/adr-retire-check:383`): its advice line already prints a path relative to the active root's parent (`:451`); the verdict line adopts the same rule.

## Decision

1. **`--diff` grammar (T1).** Every output line is one of these, and nothing else:
   - `<field>: + <element>` or `<field>: - <element>`: ONE element per line, for every list `--diff` compares. That includes advice, unproven lines, `partialBecause`, `undecided`, `couldNotRun`, `disagreements` and SessionStart (now `SessionStart: + <line>`).
   - a record that came or went is `adrLint: + <file> (<verdict>)` or `adrLint: - <file> (was <verdict>)`, replacing `new,` and `removed`;
   - `<field>: <before> → <after>` for a scalar or a verdict, with ` — <reason>` when one is carried;
   - `<field>: <verdict>, reason changed — <reason>`, as today;
   - a state line naming what was not compared: `look: … : not compared`, `corpora differ …`, `before lacks …`, `<reader>: … has no answer …`.
   A single-element change therefore prints exactly what it prints today. `--diff` also compares the fields it skipped: `workNext.specs`, `unprovenSpecs`, `uncoveredReadySpecs` (which the report now carries), `retirable`, `underUndecided` and `next.id`; `adrState.governingNothing` (by file), `contested` and `danglingSupersession`; and each `adrNext[].ready` by task directory.
2. **A PARTIAL pair is compared over what both runs read (T1, T2).**
   - `comparable` is true when neither look is UNPROVEN and the corpora match.
   - `verdictMoves` compares a record only when both reports list it AND at least one side gave it a verdict, meaning one other than `unread` and not null. PASS → `unread` or PASS → null is still a move out of PASS, so it still counts in `passToFail`.
   - Every record listed in either report and not compared is counted as `notCompared`.
   - Under a PARTIAL look, `--diff` replaces its first line with `look: <before> → <after>: counts not compared; adr-lint verdicts compared over the records both runs read`, then prints the named lists and the verdict lines as above.
   - UNPROVEN on either side keeps today's single line, and `verdictChanges: null`.
3. **The attestation says what it saw (T2).**
   - It gains `look`: the worse of the report's `look` and `workNext.look`, ordered `ok` < `PARTIAL` < `UNPROVEN`, or null when the report has none.
   - It gains `notCompared`: the count above, or null whenever `verdictChanges` is null.
   - `verdictChanges` keeps exactly `{ compared, passToFail, failToPass }`.
   - `readerFingerprint` records `gitReason` when its git spawn failed, and `atReason` then reads `git could not be run (<code>), so the readers' commit is unknown`. "the plugin is not a git checkout" is kept for a plugin that git answered is not one.
4. **Filing and release (T3).**
   - attest-import accepts `look` (one of the three words, or null) and `notCompared` (a non-negative integer, or null; null exactly when `verdictChanges` is null).
   - release-evidence's rule for counting a run is unchanged in form: `verdictChanges` is an object, `passToFail` is 0 and `compared` is above 0.
   - Its `attested` reason names, for each attestation that carries them, `look` when it is not `ok`, and `notCompared` when it is above 0.
   - An attestation without the new keys is judged exactly as before.
5. **ENOBUFS (T4).** Every reader spawn in `probe` passes `maxBuffer: READER_OUTPUT_LIMIT` (64 MiB). `failedToRun` words ENOBUFS as `ran, and its output passed the probe's 64 MiB buffer (ENOBUFS), so what it said was not read`, never `did not start`.
6. **`--adopt` (T5).**
   - `adr-retire-check --adopt` prints each root relative to the working directory when it lies inside it, and as its last component otherwise. It never prints an absolute path.
   - `work-next.mjs:840` and `lifecycle.mjs:3611` say: "`adr-retire-check --adopt <active> <archive>` reports what adopting it needs; it changes nothing".

**Why release-evidence's change is not a weakening that §3 or ADR-005 forbid.**
- The acceptance rule changes in one place, by the owner's choice (Alternative (d), 2026-10-06): a PARTIAL run now carries a count it could not carry before, and it may CORROBORATE a release, but it attests one only beside an attestation whose `look` is `ok`. So a PARTIAL-only release stays UNPROVEN as today, and a PASS → FAIL inside a PARTIAL corpus, unseen today, is now refused. Nothing is weakened. T3 implements the filter in `outsideRun`.
- What it admits is an observation the tool made, over records it read, with the unread ones counted as `notCompared` rather than counted as unchanged. That is ADR-005's rule applied per record instead of per corpus.
- It replaces a hand comparison the owner already accepted for 3.8.8 with a tool-written one, and the release reason line says what was not compared.
- It also refuses more:
  - a PASS → FAIL inside a PARTIAL corpus, invisible today, becomes `regressed`;
  - a PASS record that became unreadable counts as a regression, not as unchanged.
- An UNPROVEN run still attests nothing.

**This fails if** any of these is shown by a test through the CLI on saved reports:
- a two-element change prints on one line;
- an element that came or went prints without `+` or `-` directly after `<field>: `;
- one of the six named work-next fields, or an `adrNext` ready set, changes with no line;
- the scratch reproduction above (a PARTIAL pair with ADR-001 PASS → FAIL) gives anything but `passToFail: 1` and a `PASS → FAIL` line;
- an UNPROVEN `since` gives anything but null;
- a locked assertion changes;
- release-evidence attests a PARTIAL attestation with `passToFail` above 0;
- `failedToRun` words ENOBUFS as `did not start`.
Valid for reports written by the probe at or after T1. An older report lacks `uncoveredReadySpecs`, and `--diff` says `before lacks workNext.uncoveredReadySpecs`, as it does for every field.

## Alternatives Considered

- **(a) Leave `--diff` comma-joined and only add `-` to `new`/`removed`.** Rejected: the comma join is the ambiguity, since advice text contains `, ` and ` - `.
- **(b) Unified-diff output (`+`/`-` in column one).** Rejected: every locked assertion pins `<field>: + <element>`, and a column-one mark would need the field repeated anyway to say which list moved. One element per line already gives a reader a mark at a fixed position.
- **(c) Keep `verdictChanges: null` under PARTIAL, and add only `look`.** Rejected: the 3.8.8 run shows a PARTIAL corpus a runner had to compare by hand, and the reproduction shows a real PASS → FAIL that today refuses nothing more specific than `uncompared`.
- **(d) Count a PARTIAL attestation only beside an `ok` one.** CHOSEN by the owner (2026-10-06): a PARTIAL run corroborates and can refuse (`regressed`), but never attests alone. It is a one-line filter in `outsideRun`, carried by T3.
- **(e) Require `notCompared` to be 0 to attest.** Rejected: that is (c) by another name for every PARTIAL corpus.
- **(f) Put `look` and `notCompared` inside `verdictChanges`.** Rejected: ADR-082 T2's locked test refuses a fourth key there, and the top level is where release-evidence and a human read the run's shape.
- **(g) No `maxBuffer`, only the wording.** Rejected: the 4,002-task corpus would then still lose adr-lint's answer on every run; the wording without the buffer only names the loss.
- **(h) Drop `--diff`'s privacy exposure in this record** (it prints advice and paths verbatim; BACKLOG §321, the v3.2.0 outside-run note). Rejected here: a different decision. The skill already asks runners to send only `--attest`.

## Component / Boundary Impact

None — internal to `plugin/scripts/corpus-probe.mjs`, `plugin/bin/adr-retire-check` and two sentences in `plugin/scripts/work-next.mjs` and `plugin/scripts/lifecycle.mjs` (shipped), and two repository scripts. No reader's JSON loses a field.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `corpus-probe --diff` text | one element per line, every element marked; new fields compared; PARTIAL compares verdicts | T1 | outside runners, the session reading a run |
| probe report `workNext.uncoveredReadySpecs` | new field, from work-next's own JSON | T1 | `--diff`, `tests/corpus-matrix.test.mjs` |
| `verdictMoves` return | gains `notCompared`; compares a PARTIAL pair | T1 | `attestation` (T2), `diffReports` |
| attestation JSON | gains `look`, `notCompared`; `verdictChanges` under PARTIAL | T2 | attest-import, release-evidence (T3) |
| `probe.readers.gitReason` | new, present only when git could not run | T2 | `attestation` |
| attestation schema | `look`, `notCompared` join `KEYS` | T3 | `docs/corpus-reports/README.md`, filed attestations |
| release-evidence `attested` reason | names `look` and `notCompared` when present | T3 | the release session |
| `failedToRun` wording, reader `maxBuffer` | ENOBUFS arm; 64 MiB | T4 | `couldNotRun[].why` |
| `adr-retire-check --adopt` verdict line, two remedy sentences | no absolute path; "reports … changes nothing" | T5 | adopters, SessionStart |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `verdictMoves` returning `{ compared, notCompared, moves }` over a PARTIAL pair | T1 | T2 | No for its callers' types; yes for one meaning — `compared` no longer counts a record with no verdict on either side, which under an `ok` look is a record whose adr-lint could not run in both reports; it moves to `notCompared` |
| attestation keys `look` and `notCompared` | T2 | T3 | No — additive; T3 makes attest-import accept them |

## Implementation

See `docs/adr/ADR-089-the-probe-says-what-it-did-not-compare/tasks/README.md`.

## Consequences

- **Positive:** a runner reads one marked line per change and no longer compares JSON by hand. A PARTIAL corpus such as php-laravel-monolith counts verdict moves over what was read, and a regression inside it refuses the release. A release reader sees from the attestation alone whether part of the corpus was unread.
- **Negative:** `--diff` output grows by one line per element where it used to join them. A PARTIAL attestation now carries a verdict count, but under Alternative (d), the owner's decision, it attests a release only beside an `ok` one, so a PARTIAL-only release stays UNPROVEN as before. The probe can now hold up to 64 MiB per reader in memory.
- **Neutral:** two unlocked assertions change, because they pinned the joined form: `tests/corpus-probe.test.mjs:588` and `tests/named-not-dropped.test.mjs:100-101`. The PARTIAL control at `tests/named-not-dropped.test.mjs:106` changes too. All three are in files or tests with 0 locks, and the tasks re-check that before editing them.

## Out of Scope

- `--diff` comparing `corpusReport`, `sweep`, `frozenTaskDirs` and `slowest` (permanent: boundary: `corpusReport` and `frozenTaskDirs` restate counts and records `--diff` already compares, `sweep` runs only under `--sweep`, which runners over public corpora are asked not to use (BACKLOG §352) and which a runner's own corpus rarely carries twice, and `slowest` is derived from `timings`, which is compared)
- `--diff` printing a corpus's advice text and paths, which leaks content if a runner sends it (deferred: docs/BACKLOG.md §321, the v3.2.0 outside-run note "Next batch: the skill says `--attest` is the only line that leaves the host, or `--diff` redacts paths and titles")
- `look: ok` over a corpus whose files were never recognised as records (deferred: docs/BACKLOG.md §353, the dir-status-rfc lead)
- `adr-verify --sweep` echoing `{root}` (`plugin/bin/adr-verify:2566`) and lifecycle's "the process did not start" (`plugin/scripts/lifecycle.mjs:6000`) (deferred: docs/BACKLOG.md §351, the "Untrue sentence or blind spot" list; Follow-ups asks the owner to file them as their own items)
- YAML-frontmatter Status reading (permanent: boundary: §354 item 2, which needs its own record under ADR-074)
- Comparing advice in the attestation (permanent: boundary: ADR-082 Alternatives rejected it; advice moves for benign reasons)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A PARTIAL attestation over a corpus whose most records were unread corroborates a release beside an `ok` one | Low | Med | `notCompared` and `look` ride in the attestation and in release-evidence's reason; under Alternative (d), the owner's decision, it never attests alone |
| A record unread on one side only reads as a regression where the corpus changed, not the reader | Low | Low | it is a move out of PASS, so the release is refused and the runner says which record; that is the fail-closed direction |
| A reader printing past 64 MiB | Low | Low | the ENOBUFS wording names it; the limit is one constant |
| A test elsewhere pins the joined form | Low | Low | T1 S1 greps `tests/` for `, - ` and `, + ` forms and for `SessionStart + ` before the edit |

## Rollback

Revert the tasks' commits. Attestations filed with `look` and `notCompared` would then be refused by the older attest-import if re-filed, and release-evidence ignores keys it does not read. A report taken by the newer probe diffs under the older one with `after lacks workNext.uncoveredReadySpecs`-style lines only.

## Follow-ups

- [x] Owner decision (2026-10-06): Alternative (d). A PARTIAL attestation attests a release only beside an `ok` one.
- [x] Corrected 2026-10-07, during execution, to match the owner's Accept decision (Alternative (d)): Consequences ("a PARTIAL-only release can now attest") and the first Risks row, and T3's Goal, Steps, Tests, Stop Condition and Out of Scope, which had excluded (d). No tool-written log was touched.
- [ ] Owner action: file `plugin/bin/adr-verify:2566` (`{root}` echoed) and `plugin/scripts/lifecycle.mjs:6000` ("the process did not start") in docs/BACKLOG.md as siblings of §351's untrue-sentence list, naming this record; this drafting session was not permitted to edit BACKLOG.
- [ ] Owner action: add a line to §351 and §353 naming ADR-089 as the record for items 10, 14, 22.3 and the `--diff` mark lead, so `adr-debt` finds the receipts.
- [ ] Owner action: `adr-debt docs/adr` reported, 2026-10-06, four UNRECEIPTED deferrals from this record (the `--diff` privacy item, the dir-status-rfc `look: ok` item, and the `adr-verify:2566` / `lifecycle.mjs:6000` pair), because no BACKLOG destination names ADR-089 yet; filing the receipts above closes them.
- [ ] Owner action: the adr-write skill's step 5 asks for one cold read-only review of a split-task record touching a public contract before it is presented. The drafting session was a leaf role not permitted to spawn one, so none was run.
- [ ] Owner decision: the docs/specs/2026-10-02-an-attestation-says-what-changed.md facts F-1 and F-2 are Implemented history; whether the spec gets a superseding note once this record is Accepted.
