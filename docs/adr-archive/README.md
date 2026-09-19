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

`SHA-256` is the deterministic digest of the archived decision unit: relative file paths plus file
bytes. `Decision effect` is exactly `governing`, `superseded by ADR-NNN`, or `withdrawn`.

`Obligations` is:

- `none` only when the retired decision unit has no meaningful deferred or unchecked item;
- the path to the active corpus's canonical `BACKLOG.md`, whose `## Follow-ups` unchecked
  bullets name the source ADR exactly; or
- `disposed: <reason>` when every apparent item is a placeholder, completed, or deliberately
  abandoned.

Run `adr-retire-check <this-file>` after every catalog or archive change.
