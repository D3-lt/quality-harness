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
  "corpus": { "records": 0, "tasks": 0, "taskDirectories": 0 },
  "couldNotRun": 0,
  "disagreements": 0,
  "readinessUnproven": 0,
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
earlier report of the same corpus: `compared` records in both, `passToFail` that left PASS,
`failToPass` that reached PASS. It is `null` without `--since`, or when the two reports cannot be
compared. From plugin 3.8.0, release-evidence counts an attestation only when `verdictChanges` is an
object with `passToFail` 0; one taken against a report from the last tag serves.

How to file one (ADR-070): save the peer's message, whatever surrounds the JSON, and run
`node scripts/attest-import.mjs <message-file>` (or `-` for stdin). It files the one attestation in
the message under `<date>-<runner>-<plugin>-<at, 7 characters>.json`, after checking that the probe
digest, the readers fingerprint and the plugin version are the ones git gives at `at`, and refuses,
writing nothing, when any key is outside the schema above, the kind is not `probe`, or the run is
already filed. `--check` does all of it but the write; exit 3 means `at` is not in this clone yet.
A `kind: hand` attestation, with no digest to check, is still written by hand.
