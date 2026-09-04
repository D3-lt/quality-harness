---
paths:
  - "docs/adr/**"
  - "docs/BACKLOG.md"
---

# Why §10: working with the ADR corpus

The rules are in `CLAUDE.md` §10. This file is the reference behind them.

```bash
node plugin/scripts/work-next.mjs             # which lifecycle stage is waiting, and why
node plugin/scripts/adr-state.mjs             # what governs what, contested areas, dangling supersessions
node plugin/scripts/adr-context.mjs <path>... # which records govern these files — and which were killed
python3 plugin/bin/adr-next <adr> --all       # readiness, computed from the task files; a corpus root works too (ADR-034)
python3 plugin/bin/adr-debt docs/adr          # deferred items and open follow-ups
```

- A record is executed only when its `Status:` is `Accepted`. Proposed, Draft, withdrawn and
  archived records are history or plans, never work orders.
- A record's `<record>/tasks/README.md` is a **derived index**. Where it disagrees with the task
  files, the task files win.
- `docs/BACKLOG.md` is where a sibling left for later goes, with the evidence that found it.
- An ADR describing behaviour as it stood when the decision was taken is CORRECT and is never
  rewritten to match today's code; that is why the sweeps exclude `docs/adr/` and the backlog.
