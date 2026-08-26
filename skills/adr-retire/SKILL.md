---
name: adr-retire
description: Retire or archive ADR records without erasing decision authority, rewriting historical evidence, or losing open obligations. Use when the user asks to archive, retire, freeze, supersede, or reduce noise from an ADR corpus. Do not use to hide a failing current ADR, delete decision history, or execute archived work.
---

# ADR Retire

Use a hybrid lifecycle: physical location controls which records must satisfy today's format;
decision effect controls whether a choice still governs. Archive is not a synonym for superseded.

## Contract

- The active corpus and archive are disjoint sibling trees. Never put the archive below a directory
  recursively passed to `adr-debt` or a corpus linter.
- Active ADRs follow the current template and gates. Archived ADRs are frozen historical-format
  records; do not rerun acceptance merely to manufacture present-day evidence for old work.
- An archived `Accepted` ADR may still govern. The archive catalog's `Decision effect` is the
  current authority sidecar for frozen records: `governing`, `superseded by ADR-NNN`, or `withdrawn`.
- The active corpus `README.md` is the compact discovery surface. It links every governing ADR,
  including governing records in the archive, so routine grounding need not load historical tasks
  and verification logs.
- Every meaningful deferred item or unchecked follow-up leaves a receipt in the active
  root's canonical `BACKLOG.md` before retirement. Receipts name the source ADR exactly; archive
  pointers and unrelated external files are never backlog destinations.

## Workflow

1. Discover the repository's active ADR root, active catalog, archive convention, and task layouts.
   Project convention wins; do not dispatch on a project name.
2. Run `adr-debt <active-root>` and inspect the candidate decision unit: its ADR file,
   owned task directory, reviews, and attachments. A candidate with running tasks or an unresolved
   product/owner decision is not ready to retire — name what is still outstanding and leave the
   record active, because retiring it is how an open obligation disappears.
3. Classify the decision effect separately from record lifecycle:
   - `governing`: still authoritative but no longer worth current-format validation;
   - `superseded by ADR-NNN`: replacement is accepted, governing, and linked to its exact record;
   - `withdrawn`: decision never became authoritative or was explicitly abandoned.
4. Copy every meaningful archived `(deferred: ...)` and unchecked `## Follow-ups` item into the
   active root's `BACKLOG.md`, under `## Follow-ups`. Each unchecked bullet names its source ADR.
   Explicitly dispose placeholders, completed items, and abandoned work in the archive catalog
   rather than silently ignoring them.
5. Update the active `README.md`: current-format ADRs keep active links; governing archived ADRs get
   links to their archive paths; superseded/withdrawn records leave the governing catalog.
6. Create or update the archive `README.md` from
   `${CLAUDE_PLUGIN_ROOT}/templates/adr-archive-readme-template.md`. Add one row per archived ADR, including the
   decision unit's deterministic SHA-256 and its obligation receipt/disposition. The checker hashes
   every file beneath a per-ADR archive directory; for legacy flat archives it hashes the main ADR
   and files whose heading/path identifies the same ADR.
7. Move the entire decision unit with `git mv`. Do not edit the frozen ADR or task contents during
   the move. A later authority change updates the sidecar catalog, not the archived file.
8. Run:

   ```bash
   adr-retire-check <archive-root>/README.md
   adr-debt <active-root>
   git diff --summary
   ```

   Then lint every active ADR with the repository's current command. Verify the Git summary shows
   renames for the retired unit rather than delete-and-recreate or content rewrites.

## Existing Archives

Do not add the lifecycle marker and claim conformance immediately. Start with:

```bash
adr-retire-check --adopt <active-root> <archive-root>
```

Review its migration report, reconcile stale active links and obligations, then adopt the template
and run the strict one-argument check. The cutover governs new retirements; old records stay
historically honest.

## Stop Conditions

- The replacement/withdrawal decision is unclear.
- A governing ADR would disappear from the active catalog.
- An obligation has no active receipt or explicit disposition.
- The move changes archived content.
- The active and archive roots overlap.

Report retired ADR IDs, decision effects, moved paths, obligation receipts, exact checks, and any
legacy archive rows still awaiting reconciliation. Do not commit, push, or modify another project
unless the user authorized it.
