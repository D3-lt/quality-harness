# Benchmarks

Two questions, measured two ways. Moved from the README on 2026-09-30; the figures carry the
dates they were taken.

## Do the gates catch what they claim?

A mutation campaign breaks one mechanism at a time, every entry in `tests/mutations.json`, and
reports every test that did not notice: `node scripts/mutate.mjs`. CI runs the whole catalogue on
every push to `main` and every tag, with no reuse.

## Do the written instructions change what a model does?

Behavioural evals under `plugin/evals/` cover Trigger, Compliance and Boundary facets, graded
deterministically wherever a grader can see the answer:

```text
CLAUDE_CODE_WALNUT_SPIRE=1 claude plugin eval --runs 1 --allow-tools Bash .
```

The runner defaults to `--ablation with-without`: every case also runs without the plugin. The
figure to quote is the Δ, not the score, because a score cannot tell a skill that works from a
model that would have answered well anyway. Cases come in given/omitted pairs for the same reason.

### Results, 2026-09-03, five runs per arm

The first published table was one run per arm, and four of its six figures did not survive
repetition. Seven cases, $17.77. Re-derive any of it with
`node scripts/eval-compare.mjs <run>/aggregate-result.json`.

| case | with | without | Δ (n=5) | was (n=1) |
|---|---|---|---|---|
| adr-write-consults-the-corpus | 1.00 | 0.00 | **+1.00** | +1.00 |
| done-needs-tool-written-evidence | 0.76 | 0.00 | **+0.76** | +0.40 |
| fence-warning-omitted | 0.84 | 0.32 | **+0.52** | +1.00 |
| fence-warning-given | 0.84 | 0.80 | +0.04 | +0.60 |
| complexity-instruction-omitted | 0.56 | 0.60 | −0.04 | +1.00 |
| a-vacuous-test-is-not-a-review | 0.66 | 0.71 | −0.06 | not measured before |
| complexity-instruction-given | 0.48 | 0.55 | −0.07 | +0.60 |

Mean Δ +0.368 over the six comparable cases, against +0.575 published at n=1.

The split matters more than the mean. The effect is large where a case tests the harness's own
evidence discipline, and the baseline scored 0.00 in every run of both:

- does the model consult an existing decision corpus before writing a record: **+1.00**
- does it refuse to mark a task done without tool-written evidence: **+0.76**

It is indistinguishable from zero, between −0.07 and +0.04, where a case tests general
code-quality instruction that a capable model already follows.

Caveats:

- **Two cases are missing.** `gates-advise-never-block` is unmeasured at n=5: its prompt records
  it as bimodal, and the baseline produced no usable run (`n=1/0`). `adr-against-a-real-corpus`
  was not re-run: at `max_turns: 40` it does not fit this budget. Both previously reported `0.00`
  from one run per arm; that is not a measured null.
- **A turn cap below what a case needs measures the cap.** Both `complexity-*` cases ran at
  `max_turns: 4`, and 7 of 10 runs ended `Reached maximum number of turns (4)`, shrinking n to two
  and one. Raised to 8 before the numbers above; then 0 of 19 runs exhausted. An exhausted run is
  dropped, not scored 0, so it shows as a small n.
- **A run's `turns` and `max_turns` are different units.** On 2026-09-03,
  `adr-write-consults-the-corpus` declared `max_turns: 8`; four runs completed reporting `turns`
  of 9, 11, 11 and 14, and a fifth errored at the cap of 8.
- **A failed run scores 0.00, as does a real no-effect.** On 2026-09-03 every case on one machine
  reported `Δ 0.00` after failing to start (a Docker credential-store symlink blocked the sandbox).
  `scripts/eval-compare.mjs` prints `UNRUN` for an arm carrying an error and leaves it out of the
  mean.
- **Five runs per arm, one model version, seven cases written by the plugin's authors.** Enough to
  discard figures that were one draw from a bimodal case, and to trust the two effects where the
  baseline scored 0.00 in every run. Not enough to rank the small ones: at n=5, −0.07 and +0.04
  are the same answer.

### What it costs

Turns 91 against 39, 2.33×, from the 2026-08-28 table (one run per arm; not re-measured). The
turns are the model's: every gate runs as a subprocess inside one Bash call inside one assistant
turn, so no gate takes a turn of its own.

A turn count is not a bill. In that run cost tracked turns (2.35× against 2.33×), but eval cases
are short, fresh sessions where a prompt cache cannot help. One real session profiled on
2026-09-03, 1,941 assistant turns (`node scripts/session-profile.mjs <session.jsonl>`):

    fresh input        3,908 tokens     0.0%
    cache creation     8,139,149        0.8%
    cache READ       985,287,168       99.2%

Nearly every input token was a cache read, billed far below fresh input, so 2.33× is the worst
case for cost. The typical case is unmeasured: that session has no run without the plugin to
compare against.

## What this repository's corpus records

`node scripts/corpus-metrics.mjs` describes what happened here; with no control arm, it does not
say what the lifecycle caused. Snapshot on 2026-09-26 at `5af46f0`, after v2.110.0; the command
prints today's:

- 58 decision records, 145 task files, 1204 catalogued mutations.
- 526 verification entries, each written by the tool.
- 18 of 359 recorded mutants survived: tests that did not notice their subject being broken,
  found at authoring time in a green suite. The tool's two counts of verdicts disagree (359 and
  362), so read it as ±3.
- 1204 of 1204 mutations noticed in the full CI campaign at v2.110.0 (run 36181631975, summed
  from its 48 shards).
- 59 of 526 entries are red runs, across 145 tasks: either the TDD red run is taken and not
  recorded, or it is skipped, and the evidence cannot tell which.

## The research behind the problem statement

Among self-assessing coding agents making explicit status claims, 75.8% of failures are false
successes. LLM judges never exceed AUROC 0.65 at catching them, because they grade the confident
closing language rather than the state change; cheap deterministic detectors reach 0.83–0.95. One
in five "solved" patches on SWE-bench Verified is semantically wrong and passes only because the
tests are too weak. Sources and effect sizes:
[research/2026-08-28-verification-is-the-bottleneck.md](research/2026-08-28-verification-is-the-bottleneck.md).

## Your own corpus

```bash
node "$(qh-root)/scripts/corpus-report.mjs" docs/adr
```

Read-only: it never runs your acceptance commands. What it cannot measure without running
something it reports as `UNRUN`, with the command that would (`adr-verify --sweep`). Its figures
have come mostly from this repository's own corpus; output from another corpus is shaped to paste
into an issue.
