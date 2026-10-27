# ADR-129 tasks

Derived index; the task files win.

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| [T1](T1-readers-take-a-sidecar.md) | The readers take a sidecar lock | pending | none — no spec | `node --test --test-reporter=tap tests/lock-sidecar.test.mjs` |
| [T2](T2-the-writer-writes-it.md) | adr-verify writes the lock to a sidecar | pending | none — no spec | `node --test --test-reporter=tap tests/lock-sidecar-write.test.mjs` |
