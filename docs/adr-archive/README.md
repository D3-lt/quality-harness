# ADR Archive

**Lifecycle:** Frozen historical ADR records
**Active corpus:** ../adr
**Retirement cutover:** 2026-09-19

This sibling tree is outside current-format ADR lint and active debt sweeps. Records are immutable
historical evidence: do not rewrite them to satisfy gates introduced after they were authored.
Decision authority is recorded below because an archived `Accepted` ADR may still govern.

The active corpus `README.md` links every governing ADR, including governing records here. Open
work lives in the active corpus `BACKLOG.md` under `## Follow-ups`, never only in this archive.

## Retired Records

| ADR | Title | Decision effect | Retired | Reason | Obligations | SHA-256 |
|-----|-------|-----------------|---------|--------|-------------|---------|
| [ADR-056](ADR-056-a-quoted-separator-is-not-a-joiner.md) | A quoted separator is not a joiner | withdrawn | 2026-09-19 | ADR-060's Invalidates withdraws it: it governed how a command's TEXT is split, and nothing reads a command's text any more | none | 89147473e27b8ae94242b69a11e68f9d77881b19ea84a67c85d802858f8a092e |
| [ADR-058](ADR-058-advisories-name-only-what-they-observed.md) | Advisories name only what they observed | superseded by ADR-060 | 2026-09-19 | its changed paths came from parsed arguments; ADR-060 takes them from `git status` and Edit/Write events, and T7 deleted the tests its tasks locked | disposed: every deferred item concerns the command classifier ADR-060 T7 deleted; `docs/BACKLOG.md` §247 closes §213, §216, §217, §218 and §220 with it | a157bc3e90939fdbb55be3911405cb0fa9ee00d3ddee2c8fb26404382deb3489 |
| [ADR-059](ADR-059-a-read-only-command-names-no-changed-path.md) | A read-only command names no changed path | superseded by ADR-060 | 2026-09-19 | it decided per command family which arguments are writes; ADR-060 has no command families, so there is no channel left to classify | disposed: every deferred item names a command family or a write channel of the deleted classifier; `docs/BACKLOG.md` §247 closes §218 and §220 with it | b4d00c3788951d02d5134c6f8e806959c8baf5273f714a1e8186e1540b59d583 |
| [ADR-041](ADR-041-a-probe-prefix-is-not-the-mutation.md) | A probe prefix is not the mutation | superseded by ADR-060 | 2026-09-23 | it peeled a probe prefix off a command so the rest could be classified; ADR-060 reads no command text beyond the commit/push word rule, so there is nothing to peel | none | 53eff1a957fc61ea86894efaff2de17d47bb9074515e9a06f9e2cee8f000d11b |
| [ADR-042](ADR-042-unproven-write-is-advise.md) | UNPROVEN write authorship is Advise | superseded by ADR-060 | 2026-09-23 | it advised on a write whose authorship the transcript could not prove; ADR-060 observes the tree instead, so there is no UNPROVEN authorship to advise on | none | 5d79e0bd05f779d99cc6b303c01cbb4437ce4ece0cabf3bc1e6d3b3f8ce311ad |
| [ADR-047](ADR-047-an-unrecognised-command-is-unproven.md) | An unrecognised command is UNPROVEN | superseded by ADR-060 | 2026-09-23 | it classified every command four ways; ADR-060 T7 deleted the classifier, and `plugin/scripts/classify-command.mjs` is an empty tombstone kept because ADR-060 itself governs that path | none | 688e1585d5fe564959dec302caf61cf416098d014881722a89323cf31461fc1c |
| [ADR-048](ADR-048-an-unproven-write-has-a-validation-term.md) | An UNPROVEN write has a validation term | superseded by ADR-060 | 2026-09-23 | it let a passing check clear an UNPROVEN write; ADR-060 has no UNPROVEN writes, so the term has nothing to clear | none | 62702c325b73f8a230db712fff629a43d2d1c6942a64d1cb6980fbc2b92ce76a |

`SHA-256` is the deterministic digest of the archived decision unit: relative file paths plus file
bytes. `Decision effect` is exactly `governing`, `superseded by ADR-NNN`, or `withdrawn`.

`Obligations` is:

- `none` only when the retired decision unit has no meaningful deferred or unchecked item;
- the path to the active corpus's canonical `BACKLOG.md`, whose `## Follow-ups` unchecked
  bullets name the source ADR exactly; or
- `disposed: <reason>` when every apparent item is a placeholder, completed, or deliberately
  abandoned.

Run `adr-retire-check <this-file>` after every catalog or archive change.
