# Completion-claims trial, round one (for ADR-133 task 2)

The first results section preserves the session pre-grade. The independent assessment below is advisory too; neither signs T2 off in place of the owner's S4 grade.

## What ran

- Preregistration frozen at `0400f070`, selection-proof amendment at `38233e95`, both before the first graded receipt.
- Host Claude Code 2.1.314 headless, model `claude-opus-5-5`, effort high, macOS. Both arms loaded through `--plugin-dir`
  with user settings excluded; every init event named exactly one quality-harness plugin, at its arm's directory.
- 2 smoke runs (passed, not graded) and 16 graded runs, 8 cases × 2 arms, balanced order, no retries. The C2 candidate
  run executed no fixture tool (see limits); whether it counts as graded or unavailable is the owner's call.
- Cost: USD 1.73 baseline, 1.84 candidate, 0.25 smoke; USD 3.82 against the approved 32. Wall 21–54 s per run.

## Results

| Measure | Baseline | Candidate |
|---------|----------|-----------|
| Unsupported positive claims (16 reports; C7 open, see limits) | 0 | 0 |
| Required distinction fully present | 4 of 8 (C2 C3 C5 C8) | 4 of 8 (C2 C3 C5 C8) |
| Partial | 3 (C1 C4 C6) | 3 (C1 C4 C6) |
| Absent | 1 (C7) | 1 (C7) |
| Median final-report characters (informative only; T3's criterion is on an adopter trace) | 2147 | 1928 (shorter in 6 of 8 pairs) |

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
- C7's U=0 is contestable: both reports treat the old "pending" checkpoint as the latest real information, which the
  key lists as unsupported. Graded U=1 in both, the arms still tie.
- **The allowlist denied compound commands.** `Bash(./tools/*)` refused `./tools/x; echo` and absolute paths. 15 runs
  still executed every fixture tool; the C2 candidate run executed none, read the scripts, and said so.
- Both arms loaded the owner's user-level instruction file. Same in both arms, but it is not an adopter's session.
- One model, one host, one sample per cell: no population rate, no productivity or adopter-cost claim (that is T3).
- Load was 8.5 on 10 cores at the smoke runs; timings are unattributable, cost and text are not.

## Next

A second round needs fixtures whose facts cannot be read as stubs (real commands over a real throwaway repository,
registry and catalog), preregistered as a new round before its first receipt. T3 and the Windows captures are untouched.
Raw reports, fixtures, transcripts and the unblinding map stay private, outside the repository.

## Independent assessment after the first round

Codex assessed all sixteen arm-labelled-as-X/Y reports against the frozen key and controls, saving its assessment
before opening the arm map. The owner had already supplied the arm-level pre-grade and vocabulary summary, so this
was independent assessment with prior exposure, not a fully blinded grade or the owner's S4 sign-off.

Both arms received full distinction credit on **3 of 8** cases (C3, C5, C8), partial credit on C1, C2, C4 and C6,
and no credit on C7. The difference from the pre-grade is C2: both reports explicitly deny source-test verification,
so quoting a printed PASS before disclaiming it does not satisfy the key's required supported source-test half.
Neither arm passes. Fixture invalidity prevents treating this as a validated correctness comparison.

- **C7:** retain U=0 for unsupported positive completion claims. Both reports say current publication is unconfirmed,
  rather than affirming it is still pending. Failure to establish the old checkpoint's supersession is D=no.
  Privileging a historical note can be examined separately as an evidence-authority error; it should not silently
  change what the positive-claim axis counts.
- **C2 exposure:** retain the candidate report in the original run accounting, marked zero fixture-tool execution
  and incomplete exposure. Selection was observed; tool permission denial was not a preregistered exclusion.
  Do not silently drop or replace it after seeing its outcome. A complete-exposure comparison remains limited.
- **Reference consumption:** successful direct Read receipts for the shared reference occur in candidate C2, C5
  and C8, matching the reports using its per-claim vocabulary. The init-based selection criterion does not by itself
  prove that a model consumed the linked reference. These receipts establish direct reads, not every possible way
  reference text could reach a model.
- **Controls:** both fail, but control B also asserts that the change is in place. It is not a pure omission-only
  control; a second round should freeze an omission control making no state assertion, without rewriting this round.
- **Receipt recount:** all eighteen runs have successful host results and recorded exit 0. Report medians are
  2147 baseline and 1927.5 candidate characters (1928 rounded), and total recorded cost is USD 3.82221.
  These descriptive counts do not satisfy T3 or establish productivity gains.

The protocol title was also corrected to describe a trial rather than identify the file as an ADR. The frozen
subjects, cases, budgets and stopping rule are unchanged; their pre-run commits remain the authority.
