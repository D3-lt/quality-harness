# `lifecycle.mjs` is the wrong shape: diagnosis and the way out

Written 2026-10-10 after the owner's question ("it is one big chunk, which could be turned into rules and maintained bit by bit; it is heavy and probably not the right shape; it could be a project of its own, but that is for later"). Tracked by BACKLOG section 375. Measurements are from commit `52cd9a66`; the generated companion is `2026-10-10-lifecycle-seams.md`.

## What was measured

| | |
|---|---|
| `plugin/scripts/lifecycle.mjs` | 7,591 lines, 441 KB; 275 top-level functions (median 20 lines, largest 276), 112 exported |
| who changes it | 244 of 1,735 commits (14%) |
| who reaches it | a replay of the last 100 commits through a file-level test selector (BACKLOG section 374) found a change here selects about 99% of 193 test files, so the selector saves nothing where the time goes |
| who imports it | nine other scripts; `work-next` 17 names, `qh-check` 11, `corpus-probe` 6, `statusline` 6, `adr-state` 5, `publish-hook` 4, `adr-context` 3, `orientation` 1, `reviewer-guard` 1 |
| what it costs to load | about 15 ms over a bare `node` on the Mac (5 runs, 2026-10-10). On a Windows 11 runner (a peer's direct-payload timing of 8 runs, not measured inside a live Write) the `lifecycle.mjs` PostToolUse hook took 0.20 s for a write inside the repository and 0.16 s outside it, against 0.05 s for a bare `node`; the two shell hooks beside it took 0.52 and 0.37 s inside, 0.45 and 0.16 s outside |
| what it does | ten host events, fifteen hook commands in `plugin/hooks/hooks.json` |

## Diagnosis

1. **It is not a few giant functions. It is a bag of small ones with no module boundary.** The call graph is already modular: 399 of 474 calls (84%) stay inside one of 17 clusters (7 of them under four functions). The structure exists; the files do not.
2. **The hurt is blast radius and ownership, not startup.** One file means one review unit nobody can scope, one 6,100-line mutation catalogue keyed to it, test locks that cannot be reasoned about per concern, and a fast lane that cannot select. Changing the publish classifier and the ADR record reader looks like the same change.
3. **Judging is welded to gathering facts.** 45 functions (2,205 lines, 41% of function lines) can reach a git or process spawn; only 151 functions (1,532 lines, 28%) are pure. A verdict that needs a repository to be exercised is tested by building repositories, which is why `tests/lifecycle.test.mjs` runs to 4,341 lines and the suite is slow.
4. **The candidates filed in BACKLOG section 374 inherit the problem.** A stale-entry ratchet, a swallowed-read lint, a gate-control table and a fast-lane selector each need a stable unit to attach to. Owner, 2026-10-10: they do not make sense until this shape is settled. They are parked behind section 375.

## The direction taken: dumb recorders, pure judges, a replay harness

Hooks should only record what happened (an event, a ledger row) and gather facts. Every verdict (a refusal, a notice, a readiness, a skip) should be a pure function of a **facts** value, so that it can be exercised with a literal, replayed over saved facts, and moved to its own file without moving the world.

What this buys that a plain file split does not: **replay**. Feed yesterday's recorded hook inputs to tomorrow's reader and diff the sentences it says. That is the outside-corpus problem of CLAUDE.md section 18, solved on the owner's own machine before a release instead of after, and it makes every later extraction provable: the output must be byte-identical before and after.

Stages, each shippable alone, none changing behaviour:

- **A. Golden transcripts at the hook boundary (before any code moves).** A scripted sequence of hook payloads, run through the real hooks against a scripted fixture repository, with the stdout, stderr and ledger rows stored. `tests/lifecycle.test.mjs` is already black-box in spirit; what is missing is a set whose purpose is to stay byte-identical across a refactor. Real payloads are never stored today (the event log keeps events, not prompts); capturing them would be opt-in and local only (CLAUDE.md section 6), so the shipped goldens are synthetic.
- **B. Extract the pure clusters, behind a facade.** `lifecycle.mjs` keeps re-exporting every name the nine consumers import until each consumer is moved. Mutation-catalogue entries move with their source (ADR-091: one JSON per source) and `Governs:` headers with them (CLAUDE.md section 1). Order, from the seam map: wave 1, the shell-and-git literal reader and the command classifier internals (clusters 5, 6: 44 functions, 22 and 11 of them pure, none exported from the first), the test-work reader (9), the prose and config readers (11, 12); wave 2, the corpus text and quoting (3) and the ADR record reader (0: 71 functions, 49 pure, 27 exported); wave 3, the entangled publish, pass and session clusters (2, 1, 4, 7), where the strongest calls cross (4 to 1: 12, 2 to 1: 8).
- **C. Introduce `facts` at the entangled judges.** A judge takes `{ payload, ledger rows, tree observation, config, clock }` and returns `{ say, refuse, advise, rows }`; a thin recorder gathers the facts and appends the rows. This is where the 41% spawn-reaching code is split, and the only stage that changes how code is written rather than where it lives.
- **D. Rules as files (the end state).** A handler is `rules/<name>.mjs` exporting `{ event, match, run }`, discovered by directory; `lifecycle.mjs` is a dispatcher of a few hundred lines. A rule is the unit to test, mutate, review, own by ADR, and (later) disable by name.

Progress is a table of numbers in BACKLOG section 375, re-measured per wave: lines in `lifecycle.mjs`, test files that reach it, pure share of function lines, golden transcripts, and the fast-lane selector's median share (the section 374 measurement, repeated).

## What this is not

- Not a rewrite and not a behaviour change in stages A and B. Each wave is an ordinary patch release; a golden that changes is a finding, not an update.
- Not a separate project yet. The evidence ledger as an agent-neutral protocol, and the shell-intent classifier as a library with a differential suite against real shells, are the two candidates for one, and both come after the units exist.
- Not the resident process, and not deleting the text classifier for git's own hooks (ADR-066): both are research branches that stand better on stage D.

## Unknowns, named

- The seam map classifies effects by call name; a function that reaches a spawn only through an injected seam (several take one, for tests) is counted as reaching it, which overstates the 41%.
- Events produced outside `lifecycle.mjs` (qh-check, the gates) are not in the map's catalogue. Stage A needs the whole event catalogue, not this file's part.
- Windows has no local run: every wave's move of a path-handling function (clusters 0, 3, 5) is judged on CI alone.
- Whether `facts` should be one shape or one per judge is not decided; stage C starts with the smallest judge and finds out.
