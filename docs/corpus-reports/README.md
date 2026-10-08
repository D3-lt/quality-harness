# Outside runs, attested

`scripts/release-evidence.mjs` refuses to clear a sha for release when any file under
`plugin/scripts/`, `plugin/bin/`, `plugin/lib/` or `plugin/hooks/` changed since the last tag and no
file here attests that somebody outside this repository ran those readers at a revision that carries
every one of those changes (CLAUDE.md §18, §13.5). This directory is that evidence. It is read by a
tool, so its shape is fixed.

**What goes here is an attestation, never the report.** A probe report over another repository is
that repository's content — record ids, task names, its check command — and this repository never
commits anything derived from another corpus (CLAUDE.md §6). The attestation carries only what the
release question needs:

```json
{
  "date": "2026-09-23",
  "at": "<full sha of the commit whose readers were run>",
  "plugin": "<plugin.json version at that commit, or the installed version>",
  "kind": "probe | hand",
  "probeSha256": "<probe.sha256 from the report, when kind is probe>",
  "platform": "<OS and version>",
  "node": "<version>",
  "python": "<version>",
  "corpus": { "records": 0, "undecided": 0, "tasks": 0, "taskDirectories": 0 },
  "couldNotRun": 0,
  "disagreements": 0,
  "readinessUnproven": 0,
  "look": "ok | PARTIAL | UNPROVEN",
  "notCompared": 0,
  "verdictChanges": { "compared": 0, "passToFail": 0, "failToPass": 0 },
  "runner": "<who ran it, without naming a person or a machine>",
  "found": "<one line: what was reported, or 'nothing new'>"
}
```

`at` is the field the tool reads: a run counts for a release only when `at` is after the last tag and
reachable from the sha being released — a run at the tag itself ran the OLD readers. Everything else
is for the person reading the record. One file per run, named `<date>-<platform>-<corpus label>.json`;
the label is yours, not the corpus's real name if that would identify it.

A finding a run confirms changes the reader and lands in a fixture corpus; the rule, and the sweep
that checks it, are in `/quality-harness:corpus-chaos`.

How to get one: `/quality-harness:corpus-chaos`. The probe writes it from a saved report:
`node corpus-probe.mjs --attest <label> <report.json> --since <earlier.json>`. Its `at` is `null`, with `atReason`, when the
probe ran on an installed plugin (no git checkout) or on reader files that differ from their commit —
release-evidence compares commits, so neither can place the run. `found` is left for you to fill.

`verdictChanges` (ADR-082) counts the adr-lint verdicts that moved since `--since`, the same runner's
earlier report of the same corpus: `compared` records, `passToFail` that left PASS, `failToPass` that
reached PASS. It is `null` without `--since`, or when the two reports cannot be compared. A PARTIAL
pair is compared over the records both runs read (ADR-089): a record is compared when both reports
list it and at least one run gave it a verdict, and every other record listed in either report is
counted in `notCompared`, which is `null` exactly when `verdictChanges` is. `look` is the run's look,
the worse of the report's and work-next's, or `null` when the report carried none. From plugin 3.8.0,
release-evidence counts an attestation only when `verdictChanges` is an object with `passToFail` 0;
one taken against a report from the last tag serves. A `look: PARTIAL` attestation counts only beside
one whose `look` is `ok` (ADR-089 Alternative (d)), and the release reason names its look and its
`notCompared`.

`corpus.records` counts the records a reader acts on; `corpus.undecided` (from plugin 3.8.13) counts
the records it found and holds back — a plan, or a Status no reader acts on — so a corpus whose only
record is Proposed reads `records: 0, undecided: 1` rather than an empty corpus (BACKLOG §362). An
attestation from an older probe has no `undecided`, which says nothing either way.

How to file one (ADR-070): save the peer's message, whatever surrounds the JSON, and run
`node scripts/attest-import.mjs <message-file>` (or `-` for stdin). It files the one attestation in
the message under `<date>-<runner>-<plugin>-<at, 7 characters>.json`, after checking that the probe
digest, the readers fingerprint and the plugin version are the ones git gives at `at`, and refuses,
writing nothing, when any key is outside the schema above, the kind is not `probe`, or the run is
already filed. `--check` does all of it but the write; exit 3 means `at` is not in this clone yet.
A `kind: hand` attestation, with no digest to check, is still written by hand.

**With every outside run, ask for the ledger counts too** (ADR-081, ADR-084): `node <plugin>/scripts/ledger-report.mjs
--json` from the runner's repository root, using the installed plugin (it reads that repository's own
`.git/quality-harness/` ledgers). It prints counts only — skills invoked, same-tree skips with an estimated
saving, checks run — and says UNPROVEN for a ledger it could not read whole. Paste it into the release's
BACKLOG entry; it is not an attestation and is never filed here.
