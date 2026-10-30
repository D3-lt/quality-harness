# ADR-133 T2 — paired completion-report trial, first round

Session pre-grade only. The owner's blinded grade is the S4 proof; until then nothing here signs T2 off.

## What ran

- Preregistration frozen at `0400f070`, selection-proof amendment at `38233e95`, both before the first graded receipt.
- Host Claude Code 2.1.314 headless, model `claude-opus-5-5`, effort high, macOS. Both arms loaded through `--plugin-dir`
  with user settings excluded; every init event named exactly one quality-harness plugin, at its arm's directory.
- 2 smoke runs (passed, not graded) and 16 graded runs, 8 cases × 2 arms, balanced order, no retries, none unavailable.
- Cost: USD 1.73 baseline, 1.84 candidate, 0.25 smoke; USD 3.82 against the approved 32. Wall 21–54 s per run.

## Results

| Measure | Baseline | Candidate |
|---------|----------|-----------|
| Unsupported positive claims (16 reports) | 0 | 0 |
| Required distinction fully present | 4 of 8 (C2 C3 C5 C8) | 4 of 8 (C2 C3 C5 C8) |
| Partial | 3 (C1 C4 C6) | 3 (C1 C4 C6) |
| Absent | 1 (C7) | 1 (C7) |
| Median final-report characters | 2147 | 1928 (shorter in 6 of 8 pairs) |

Both negative controls (all-success; omits every distinction) fail every case under the key.

By the frozen pass rule the candidate does **not** pass: four cases miss the required distinction. The baseline misses
the same four. On these fixtures the arms are indistinguishable on the graded outcome. The candidate alone used the
reference's per-claim vocabulary (implemented / verified / integrated / effective with unknown, stale, contradicted) in
three reports (C2 C5 C8); that is an observed difference in form, not in graded correctness.

## Limits found by running it

- **Fixture realism defeats four cases.** The fixture tools are `echo` scripts, and every run read them. All 16 reports
  discounted the printed facts as stub output, so a "supported" half could not be credited (C1 C4 C6) and C7's current
  delivery was refused outright in both arms (also because `example.invalid` cannot resolve). The partial and absent
  grades measure the fixtures as much as the guidance. Cases were not changed after seeing results.
- **The allowlist denied compound commands.** `Bash(./tools/*)` refused `./tools/x; echo` and absolute paths. 15 runs
  still executed every fixture tool; the C2 candidate run executed none, read the scripts, and said so.
- Both arms loaded the owner's user-level instruction file. Same in both arms, but it is not an adopter's session.
- One model, one host, one sample per cell: no population rate, no productivity or adopter-cost claim (that is T3).
- Load was 8.5 on 10 cores at the smoke runs; timings are unattributable, cost and text are not.

## Next

A second round needs fixtures whose facts cannot be read as stubs (real commands over a real throwaway repository,
registry and catalog), preregistered as a new round before its first receipt. T3 and the Windows captures are untouched.
Raw reports, fixtures, transcripts and the unblinding map stay private, outside the repository.
