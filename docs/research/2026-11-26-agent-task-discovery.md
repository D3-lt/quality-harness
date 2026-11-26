# How much work does it take an agent to find its next task?

## Comparison

GitHub star counts below are rounded snapshots from the GitHub API on 2026-11-26. They describe the reach of these projects. The performance measurements below come from quality-harness.

| Project | How an agent finds or carries work forward |
| --- | --- |
| Superpowers (327k) | Skills take the agent from an approved design to a plan, implementation, tests and review. Installation is documented per host. [Repository](https://github.com/obra/superpowers) |
| GitHub Spec Kit (152k) | The tasks command derives dependency-ordered work from the design. An analysis step checks consistency across the spec, plan and task list. [Quickstart](https://github.github.com/spec-kit/quickstart.html) |
| OpenSpec (76k) | A proposed change groups its artifacts and tasks. The agent can resume the change and archive it after implementation. [Repository and worked example](https://github.com/Fission-AI/OpenSpec) |

Anthropic observed that agents resuming a task spent time reconstructing progress. It tested a progress file, Git history, and a basic functional check at session start. For quality-harness, that suggests measuring the existing next-task reader and whether a real client can obtain its answer. [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

## Hypothesis and result

Grouping the tracked README spellings by directory once per corpus read should reduce repeated path operations and preserve every archive decision. The baseline was `f76aa590a`. Both versions read the same checkout and the same Git listing. The comparison wrapped Node's `path.dirname` to count calls within `adrCorpus`, then compared the returned records, sets and non-enumerable diagnostic fields using deep equality.

| Corpus | Baseline calls | Indexed calls | Result |
| --- | ---: | ---: | --- |
| This project, 2,329 tracked paths and 147 records | 986,593 | 1,593 | All fields equal |
| Each of the 12 fixture corpora | 22–310 for 11 fixtures, 751 for YAML frontmatter | 10–44 for those 11, 122 for YAML frontmatter | All fields equal on every fixture |

Three alternating pairs of `node plugin/scripts/work-next.mjs --json` on the clean `da7051519` corpus put the baseline median at 7.172 s and the indexed candidate (`137a21f1`) at 7.197 s. The initial single runs of 10.29 s and 7.59 s overstated the wall-time benefit. The operation-count regression runs with `node --test --test-name-pattern="bounds work on unrelated" tests/archive-not-in-flight.test.mjs`.

A trace then put 6.979 s of a 7.284 s call in the Python batch. Its 128 queries called `load` 256 times. Reusing the parsed tasks within each query reduced the median of three further alternating pairs from 7.191 s to 5.706 s on the same macOS host and corpus. Each new run finished sooner than its paired baseline. All six CLI responses matched byte for byte (5,005 bytes), as did all 128 detailed batch replies (409,493 bytes). A regression counts real file opens when a batch asks about the same task directory twice.

The direct corpus query used by MCP also loaded each record once to discover it and again to report it. On the same checkout, one `adr-next docs/adr --json` comparison took 7.644 s before and 3.853 s with one read per record. Both returned the same 133 records, 400,259 stdout bytes, 655 diagnostic bytes and exit status. Peak resident memory was 45.96 MB and 43.07 MB respectively. The regression counts file opens through this entry point as well.

Review also found a POSIX case outside that comparison. In a fresh Git repository, a tracked root-level filename containing literal backslashes made the baseline read a different, ignored README and report an Accepted record as withdrawn. The corrected reader kept the record active. Its results and operation counts on the corpora in the table still matched the indexed measurements. [Path regression tests](../../tests/listed-backslash.test.mjs)

## Client check and next experiment

On macOS, Cursor CLI discovered the reading tools after the project registered and enabled the server. Codex CLI's app server called `qh_adr_next` on the Go fixture and returned T2 ready and T1 done. A second Codex check read the corpus-root option from the advertised schema and passed the PHP fixture's active corpus root. It returned two ready tasks across two records with tasks. Both clients used temporary configuration. [Client setup](../mcp.md)

For a corpus-wide ready-task lookup, the default MCP text response on the PHP fixture took 315 UTF-8 bytes, compared with 696 with `all: true` and 5,181 with `json: true`. The JavaScript fixture took 226, 325 and 2,178 bytes respectively, and Go took 222, 308 and 1,878. These measurements include the path printed by the gate, so checkout location affects the byte counts. The default answers which tasks are ready. JSON also supplies dependencies, acceptance commands and other task details.

Anthropic recommends offering concise and detailed responses when different tasks require different context. The existing text and JSON modes let this reader support both. The measurements above compare payload size. Measuring an agent's bill or task success requires the session experiment below. [Writing effective tools for AI agents](https://www.anthropic.com/research/writing-tools-for-agents)

The next ROI hypothesis is that a new agent with a working reader reaches the correct first task with fewer actions. Compare normal shell discovery with the documented MCP call on the same held-out corpus and host. Freeze the expected task and its blocking evidence first. Score correct task selection, unsupported completion claims, tool calls, elapsed time and total session cost. This reader benchmark measures no model spending or task-completion rate. [Existing intervention benchmark design](2026-10-30-intervention-benchmarks.md)
