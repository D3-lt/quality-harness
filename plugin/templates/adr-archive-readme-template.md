# ADR Archive

**Lifecycle:** Frozen historical ADR records
**Active corpus:** ../adr
**Retirement cutover:** YYYY-MM-DD

This sibling tree is outside current-format ADR lint and active debt sweeps. Records are immutable
historical evidence: do not rewrite them to satisfy gates introduced after they were authored.
Decision authority is recorded below because an archived `Accepted` ADR may still govern.

The active corpus `README.md` links every governing ADR, including governing records here. Open
work lives in the active corpus `BACKLOG.md` under `## Follow-ups`, never only in this archive.

Name this file `README.md`, exactly. Under any other spelling (`readme.md`, `Readme.md`) the
readers cannot decide whether this tree is a frozen archive, and they report readiness for its
task directories as UNPROVEN instead of leaving them alone.

## Retired Records

| ADR | Title | Decision effect | Retired | Reason | Obligations | SHA-256 |
|-----|-------|-----------------|---------|--------|-------------|---------|
| [ADR-NNN](ADR-NNN-title.md) | <title> | governing | YYYY-MM-DD | <why this record left current-format validation> | none | <SHA-256 of the frozen decision unit> |
| [ADR-NNN](ADR-NNN-title.md) | <title> | superseded by ADR-NNN | YYYY-MM-DD | <why> | `../adr/BACKLOG.md` | <SHA-256> |

`SHA-256` is the deterministic digest of the archived decision unit: relative file paths plus file
bytes. `Decision effect` is exactly `governing`, `superseded by <record>`, or `withdrawn`, where
`<record>` is `ADR-NNN` or a dated record's stem or path.

A record whose name carries no ADR number, such as `YYYY-MM-DD-slug.md`, is named by its stem
(ADR-063): its row links to it, `[YYYY-MM-DD-slug](YYYY-MM-DD-slug/YYYY-MM-DD-slug.md)`, and a
receipt or a `superseded by` names that stem or a path to the record. A four-digit name followed by
a month and a separator reads as a date, so name such a record with an `# ADR-N` title instead.

`Obligations` is:

- `none` only when the retired decision unit has no meaningful deferred or unchecked item;
- the path to the active corpus's canonical `BACKLOG.md`, whose `## Follow-ups` unchecked
  bullets name the source ADR exactly, by its ADR id or, for a dated record, its stem or path; or
- `disposed: <reason>` when every apparent item is a placeholder, completed, or deliberately
  abandoned.

Run `adr-retire-check <this-file>` after every catalog or archive change.
