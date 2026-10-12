# ADR Archive

**Lifecycle:** Frozen historical ADR records
**Active corpus:** ../adr
**Retirement cutover:** 2026-09-19

This sibling tree is outside current-format ADR lint and active debt sweeps. Records are immutable
historical evidence: do not rewrite them to satisfy gates introduced after they were authored.
Decision authority is recorded below because an archived `Accepted` ADR may still govern.

The active corpus `README.md` links every governing ADR, including governing records here. Open
work lives in the active corpus's `BACKLOG.md` (the active root's own, or, where it has none, the one in
the directory the two roots share) under `## Follow-ups`, never only in this archive.

## Retired Records

| ADR | Title | Decision effect | Retired | Reason | Obligations | SHA-256 |
|-----|-------|-----------------|---------|--------|-------------|---------|
| [ADR-056](ADR-056-a-quoted-separator-is-not-a-joiner.md) | A quoted separator is not a joiner | withdrawn | 2026-09-19 | ADR-060's Invalidates withdraws it: it governed how a command's TEXT is split, and nothing reads a command's text any more | none | 89147473e27b8ae94242b69a11e68f9d77881b19ea84a67c85d802858f8a092e |
| [ADR-058](ADR-058-advisories-name-only-what-they-observed.md) | Advisories name only what they observed | superseded by ADR-060 | 2026-09-19 | its changed paths came from parsed arguments; ADR-060 takes them from `git status` and Edit/Write events, and T7 deleted the tests its tasks locked | disposed: every deferred item concerns the command classifier ADR-060 T7 deleted; `docs/BACKLOG.md` §247 closes §213, §216, §217, §218 and §220 with it | a157bc3e90939fdbb55be3911405cb0fa9ee00d3ddee2c8fb26404382deb3489 |
| [ADR-059](ADR-059-a-read-only-command-names-no-changed-path.md) | A read-only command names no changed path | superseded by ADR-060 | 2026-09-19 | it decided per command family which arguments are writes; ADR-060 has no command families, so there is no channel left to classify | disposed: every deferred item names a command family or a write channel of the deleted classifier; `docs/BACKLOG.md` §247 closes §218 and §220 with it | b4d00c3788951d02d5134c6f8e806959c8baf5273f714a1e8186e1540b59d583 |
| [ADR-041](ADR-041-a-probe-prefix-is-not-the-mutation.md) | A probe prefix is not the mutation | superseded by ADR-060 | 2026-09-23 | it peeled a probe prefix off a command so the rest could be classified; ADR-060 reads no command text beyond the commit/push word rule, so there is nothing to peel | none | 53eff1a957fc61ea86894efaff2de17d47bb9074515e9a06f9e2cee8f000d11b |
| [ADR-042](ADR-042-unproven-write-is-advise.md) | UNPROVEN write authorship is Advise | superseded by ADR-060 | 2026-09-23 | it advised on a write whose authorship the transcript could not prove; ADR-060 observes the tree instead, so there is no UNPROVEN authorship to advise on | none | ec7c281f267e4071fb7a54dbe1d1059ec41ed7152a9078674452ff4641a26710 |
| [ADR-047](ADR-047-an-unrecognised-command-is-unproven.md) | An unrecognised command is UNPROVEN | superseded by ADR-060 | 2026-09-23 | it classified every command four ways; ADR-060 T7 deleted the classifier, and `plugin/scripts/classify-command.mjs` is an empty tombstone kept because ADR-060 itself governs that path | none | 688e1585d5fe564959dec302caf61cf416098d014881722a89323cf31461fc1c |
| [ADR-048](ADR-048-an-unproven-write-has-a-validation-term.md) | An UNPROVEN write has a validation term | superseded by ADR-060 | 2026-09-23 | it let a passing check clear an UNPROVEN write; ADR-060 has no UNPROVEN writes, so the term has nothing to clear | none | 62702c325b73f8a230db712fff629a43d2d1c6942a64d1cb6980fbc2b92ce76a |
| [ADR-040](ADR-040-sessionstart-ready-uses-the-listing.md) | SessionStart ready uses the listing | governing | 2026-10-12 | ADR-099 reverses its Decision 2 and 3, its Alternative rejecting `work-next` for SessionStart ready, and T1 (the ready lines from `taskDirectories` and `readyTaskLines`, deleted by ADR-099 T1); Decision 1 and 4, the listing and `hasDecisionCorpus`, still govern | none | 5c1d3d02d1c4d8518b771550408abae54ae12a4c884b674482d65119f5d85fd1 |
| [ADR-046](ADR-046-a-caller-relays-could-not-run.md) | A caller relays could-not-run as could-not-run | governing | 2026-10-12 | ADR-099 reverses its Decision 4, the SessionStart half of Decision 5, T3, and T5 but its `posixListed` export (the UNPROVEN ready line and the render cap, deleted by ADR-099 T1); Decisions 1-3, the dispatcher and the `qh-mcp` relays, still govern | disposed: completed — its three deferrals are the adr-judge and postmortem-verify could-not-run codes, both delivered (`"adr-judge": 2` and `"postmortem-verify": 2` in `qh-mcp`'s `UNRUN_EXIT`, the record's checked Follow-up and T7) | 01eabc61a5ca0b0c0ee1e734c71407a7de8d33de3c6633df1af0f3d7476b240f |
| [ADR-095](ADR-095-a-hook-does-not-repeat-work-whose-inputs-have-not-changed.md) | A hook does not repeat work whose inputs have not changed | governing | 2026-10-12 | ADR-099 reverses its Decision 6 and T6 (the traced ready-task cache, deleted by ADR-099 T1) and the Served-path clause on cached in-flight lines; Decisions 1 and 3-5, the hook-cost tool and the identity and status memos, still govern | `../BACKLOG.md` | e7d81c751320e1833a79e2e4c37f20c592ff4f5e9836b37027838a66f32bab3e |

`SHA-256` is the deterministic digest of the archived decision unit: relative file paths plus file
bytes. `Decision effect` is exactly `governing`, `superseded by ADR-NNN`, or `withdrawn`.

`Obligations` is:

- `none` only when the retired decision unit has no meaningful deferred or unchecked item;
- the path to the active corpus's `BACKLOG.md` (the active root's own, or, where it has none, the
  one in the directory the two roots share), whose `## Follow-ups` bullets, open or ticked, name the
  source ADR exactly; or
- `disposed: <reason>` when every apparent item is a placeholder, completed, or deliberately
  abandoned.

Run `adr-retire-check <this-file>` after every catalog or archive change.
