# Model out of the loop, and a terse state protocol

**Date:** 2026-09-26. **Status:** research note. It decides nothing, and every stage below
becomes work only through its own spec and an Accepted ADR (CLAUDE.md §10). The roadmap is
`docs/BACKLOG.md` §301.

## Why this exists

The owner asked how the harness could be faster and cheaper in tokens without weakening its
evidence. The answer here starts from what one working session (2.110.1 → 2.111.0) actually
spent its effort on, not from a survey.

- **Mechanical work done by the model.** About a dozen hand repoints of stale mutation
  entries. Line-numbered edit plans that broke, off by one. A missing JSON comma that broke
  the catalogue. Long prose peer reports triaged by hand, and six attestation files written
  by hand from JSON the peers had already produced.
- **Waiting.** The tree was locked out while a mutation run rewrote files in place. Gate
  results at load 20-30, which §18 says cannot count as evidence. CI queued behind itself.
- **Always-on prose.** Every hook injects full English sentences, and an unchanged finding
  is restated each turn.
- **Regexing shell.** The publish classifier's bugs came back release after release (§269,
  §296, §298, §300), and it refused the session's own heredocs.

## The principle: the model as exception handler

Compile the lifecycle into deterministic steps, and call the model only where a decision
cannot be computed. The harness already does this for verdicts; the unexplored part is doing
it for the work.

- Xia et al., *Agentless: Demystifying LLM-based Software Engineering Agents* (2024): a fixed
  localize → repair → validate pipeline matched or beat autonomous agents at a fraction of the
  cost.
- Ridnik et al., *Code Generation with AlphaCodium* (2024): "flow engineering" around the
  model beats prompt engineering.
- Yang et al., *SWE-agent* (2024): the design of the agent-computer interface mattered more
  than the model.
- Wang et al., *Executable Code Actions Elicit Better LLM Agents* (CodeAct, 2024): actions as
  code need fewer turns than JSON tool calls.

## Tokens: saved by not sending, not by encoding

- **Prompt caching.** Cached input is billed at about a tenth of fresh input. Order the
  context so the static part comes first and the volatile part last. The plugin README says
  one profiled session read 99.2% of its input from cache. This note did not re-measure that;
  Stage 1 does.
- **Ids and deltas are lossless compression the model decodes in context.** Refer to §295.7,
  F-12 or ADR-060/T2, never re-paste the text, and say only what changed. This is the usable
  form of gist tokens (Mu, Li, Goodman, *Learning to Compress Prompts with Gist Tokens*, 2023),
  which an API does not expose.
- **Retrieval over long files.** Serve one § of a 1.1 MB backlog, not the file. Li et al.,
  *Retrieval Augmented Generation or Long-Context LLMs?* (2024): retrieval wins on cost, long
  context on quality, and routing between them keeps most of both. Liu et al., *Lost in the
  Middle* (2023): what matters belongs at the edges of the context.
- **Model cascades.** A small model for triage, the large one for fixes: Chen, Zaharia, Zou,
  *FrugalGPT* (2023); Ong et al., *RouteLLM* (2024).
- **Context as memory hierarchy.** Packer et al., *MemGPT* (2023). The harness's agentsmemory
  palace is the paging store.

## Speed

- Measured 2026-09-26 at load about 6: a native binary starts in 2 ms, `python3 -c 0` in
  19 ms, `node -e 0` in 74 ms, and importing `lifecycle.mjs` takes 84 ms. `adr-next` on one
  ADR takes 106 ms. An Edit/Write fires about four hook processes, so about 0.3-0.6 s per
  edit, and SessionStart takes 0.6-1.7 s.
- The largest speed-up of the session was algorithmic, not a language change: a per-call
  prefix rescan made one Go-corpus run take 149 s, and one memoised scan made it 1.5 s.
- Incremental computation, as in Salsa (rust-analyzer) and Hammer et al., *Adapton* (2014),
  lets a long-lived process answer from what it already parsed.
- Mutation testing: mutant schemata compile every mutant into one copy behind a switch
  (Untch, Offutt, Harrold, 1993). Predictive mutation testing skips mutants a model is
  confident about (Zhang et al., ISSTA 2016). Test-impact selection runs only the tests that
  cover the mutated line.
- A Rust core would bring a hook from about 80-150 ms to about 5-20 ms. It would save no
  tokens: a model turn costs seconds and thousands of tokens, a hook milliseconds and none.
  It would cost a rewrite of the readers and the mutation catalogue, plus six signed native
  builds. It is Stage 6's measured alternative to a daemon, not a starting point.

## Biology as a design source, and where the analogy stops

The owner liked the immune-system framing and pointed out that biology has far more than one
process worth copying. Each row below names the process, the mechanism it maps to, and whether
the harness has that mechanism yet.

| Process | Mechanism in the harness | State |
|---|---|---|
| **Adaptive immunity: antibodies** | A confirmed finding becomes a permanent fixture plus an `expected.json` field that recognises its class. Every release re-runs the whole library. | Partly built: ADR-064 matrix, `chaos-fixture-sweep`. Stage 5 automates it. |
| **Immune memory** | The library only grows. A class seen once is recognised on sight, on any corpus. | Built as a rule (§4, §18); not yet as a counted library. |
| **Clonal selection / affinity maturation** | Mutation testing keeps the tests that kill mutants. A GREEN mutant forces a sharper test. | Built: `mutate.mjs`, the catalogue. |
| **Negative selection (thymus)** | A detector is released only after it is shown to stay silent on clean input. Every "dirty" check has its clean twin (§4). Forrest et al., *Self-Nonself Discrimination in a Computer* (1994). | Built as a rule; Stage 3's lexer tables are its strongest form. |
| **Autoimmunity** | A false refusal: the gate attacks correct work. `KNOWN_FALSE_REFUSALS` is the list of known autoimmune reactions. | Tracked. Stage 3 aims to empty it. |
| **Innate vs adaptive** | Innate: static gates that fire on shape (adr-lint, the publish refusal). Adaptive: the fixture library learned from outside runs. | Both exist; only the adaptive half is fed from outside. |
| **Symbiosis / mutualism** | Peer sessions on corpora we do not own run our readers. They get findings about their repository; we get antigens we could not grow. | Built as the chaos protocol (§18). |
| **Horizontal gene transfer** | A lesson crosses projects without shared code: `wing_craft`, and the inbox convention. | Built in agentsmemory. |
| **Quorum sensing** | Act only once enough independent signals agree: release only with an outside attestation after the last tag. | Built: `release-evidence` needs one. The quorum size is 1. |
| **Apoptosis** | Retire what no longer earns its cost: superseded records (`adr-retire`), stale mutants (`--stale`), dead fixtures. | Partly built. Stage 4's `--repoint` decides between repair and removal. |
| **Homeostasis** | A feedback loop that keeps load inside a band: the costly-runs skill's thresholds, turned into a scheduler. | Prose only. Stage 7's job lease. |
| **Epigenetics** | The same code expressed differently per project, with no change to the genome: `.quality-harness.json` (`"publish": "warn"`, the declared `check`). | Built. |
| **Evolution / genesis** | Generate and select candidate fixes or tests under fitness pressure. GenProg (Le Goues et al., 2012); co-evolution of programs and tests (Arcuri, Yao, 2008). | Not planned. The fitness function would be the gates, so it only becomes safe once they cannot be gamed (Stage 3 onward). |

**Where the analogy stops.** An immune system tolerates losing some cells to a false attack;
here a false refusal blocks a person's correct work, and §16 already says a block needs more
evidence than advice. Evolution optimises whatever the fitness function measures, including
its holes, and SWE-bench's weak-test "solutions" (§11) are that failure. Use a process
where its mechanism has a named check in this table, never as a metaphor that justifies
code nobody can test.

Further reading: Kephart, *A Biologically Inspired Immune System for Computers* (1994); de
Castro, Timmis, *Artificial Immune Systems: A New Computational Intelligence Approach*
(2002).

## Non-goals, and why

- **Binary, hex, base64 or gzip as a token saver.** Tokenizers are trained on text. Hex and
  base64 cost about two to four times the tokens of the text they encode, and the model
  cannot reason inside compressed bytes.
- **Lossy prompt compression on evidence** (Jiang et al., *LLMLingua*, 2023: 2-20x smaller,
  with loss). Acceptable for background, never for a verdict or a log.
- **A semantic cache of model answers.** It returns a stale verdict that reads like a
  current one, which is the failure this project exists to prevent.
- **A runtime npm dependency in `plugin/`** (ADR-008).

## The stages, in order

Stage 1 measures, so every later stage states its success as a number and does not ship if
the number moves the wrong way.

1. **Measure.** `session-profile.mjs` attributes injected hook text per hook: count, bytes,
   tokens, unchanged repeats, and text that lands before the cacheable prefix.
   `mutate.mjs` reports campaign wall time and stale entries.
2. **Terse state protocol `qh1`.**
   - Emitters build one facts object. It is rendered tersely for the model, and as prose
     for the human and for a first occurrence. Deltas only.
   - The legend lives once in a cached skill reference.
   - Findings are referred to by id, and a `backlog` reader serves one § on demand.
   - A parity test covers every fact, and an A/B eval checks the model acts the same under
     both renderings.
3. **A zero-dependency shell lexer** replaces the publish classifier's regexes. The
   existing test tables are the acceptance; the known false refusals should empty.
4. **Mutation tooling.**
   - `mutate.mjs --repoint`, which proposes the moved text and writes it only after the
     mutant re-runs RED.
   - Worktree-isolated campaigns, so the working tree is never rewritten.
   - Test-impact selection.
5. **Finding to fixture.**
   - Peers send findings in a small JSON schema, and a tool turns each into a fixture and a
     failing matrix field.
   - `attest-import` files peer attestations.
   - Differential readers extend the probe's disagreement check.
6. **Latency.** A content-addressed gate cache keyed by the readers' fingerprint and the
   input bytes, and Node's compile cache. Then, only if the numbers still justify it, either
   a daemon or a Rust core. Redis only as an optional multi-machine backend.
7. **Research-grade, each its own ADR after 1-6 report.** Model cascades for triage roles,
   Datalog corpus rules, mutant schemata, a machine-wide job lease, predictive mutation
   testing, a Merkle root over release evidence, and the harness as scheduler.
