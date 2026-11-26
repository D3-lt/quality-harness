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

One end-to-end invocation of `node plugin/scripts/work-next.mjs --json` per version took 10.29 s and 7.59 s respectively. The 5,005 output bytes matched. Wall time includes Git, Python, filesystem caches and other activity on the host. The repeatable result is the elimination of repeated directory scans. The operation-count regression runs with `node --test --test-name-pattern="bounds work on unrelated" tests/archive-not-in-flight.test.mjs`.

## Client check and next experiment

On macOS, Cursor CLI discovered the reading tools after the project registered and enabled the server. Codex CLI's app server called `qh_adr_next` on the Go fixture and returned T2 ready and T1 done. The two checks used temporary configuration. [Client setup](../mcp.md)

The next ROI hypothesis is that a new agent with a working reader reaches the correct first task with fewer actions. Compare normal shell discovery with the documented MCP call on the same held-out corpus and host. Freeze the expected task and its blocking evidence first. Score correct task selection, unsupported completion claims, tool calls, elapsed time and total session cost. This reader benchmark measures no model spending or task-completion rate. [Existing intervention benchmark design](2026-10-30-intervention-benchmarks.md)
