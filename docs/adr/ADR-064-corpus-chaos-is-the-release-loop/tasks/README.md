# ADR-064 tasks

| Task | Title | Depends-on | Status |
|------|-------|------------|--------|
| [T1](T1-the-probe-fingerprints-the-readers-it-ran.md) | The probe fingerprints the readers it ran | none | done |
| [T2](T2-the-probe-diffs-a-run-against-the-previous-one.md) | The probe diffs two saved reports | T1, T4 | done |
| [T3](T3-the-probe-writes-its-own-attestation.md) | The probe writes the attestation from a saved report | T1 | done |
| [T4](T4-every-reader-entry-carries-its-time.md) | Every reader spawn is timed | none | done |
| [T5](T5-a-wild-finding-lands-in-a-fixture.md) | A wild finding lands in a fixture | none | done |
| [T6](T6-three-fixture-corpora-for-the-shapes-found-in-the-wild.md) | Three fixture corpora for the shapes found in the wild | none | done |
| [T7](T7-the-corpus-chaos-skill-carries-the-release-loop.md) | The corpus-chaos skill carries the release loop | T2, T3 | done |

## Execution Order

| Wave | Tasks | Depends-on |
|------|-------|------------|
| 1 | T1, T4, T5, T6 | none |
| 2 | T2, T3 | T1, T4 (T2); T1 (T3) |
| 3 | T7 | T2, T3 |

T6 is built after the batch fixes that precede this record's execution have landed, so each fixture's `expected.json` records the fixed behaviour.
