# Decision catalog

Every record that governs this repository today, one line each. This is the discovery surface:
routine grounding reads this file, not the task logs and verification history behind it.

**Derived, never authoritative.** A record's own `Status:` wins; `adr-retire-check` fails when a
governing record is missing from here. Retired records live in [`../adr-archive/`](../adr-archive/README.md),
whose catalog says what each one's decision effect is now.

| ADR | Decision | Status |
|-----|----------|--------|
| [ADR-001](ADR-001-skills-are-never-linked.md) | Never install a personal copy of an artifact the plugin already serves by name | Accepted |
| [ADR-002](ADR-002-a-mutant-restore-outlives-its-process.md) | A mutant restore must outlive the process that applied it | Accepted |
| [ADR-003](ADR-003-a-gate-asserts-behaviour-not-shape.md) | A gate asserts behaviour, not shape | Accepted |
| [ADR-004](ADR-004-templates-are-not-linked.md) | Stop installing home copies of an artifact nothing reads | Accepted |
| [ADR-005](ADR-005-a-gate-reports-what-it-observed.md) | A gate reports what it observed, and "could not run" is not a failure | Accepted |
| [ADR-006](ADR-006-a-verdict-that-names-its-own-reliability.md) | Prove a verdict with a baseline, not with coverage | Accepted |
| [ADR-007](ADR-007-a-dependency-that-crosses-records.md) | Let a task depend on another record's task, and never call an unevaluated edge ready | Accepted |
| [ADR-008](ADR-008-the-plugin-is-not-the-repository.md) | Ship the plugin, not the repository | Accepted |
| [ADR-009](ADR-009-a-decision-names-what-enforces-it.md) | A record names the check that fails when its decision is violated | Accepted |
| [ADR-010](ADR-010-a-claim-is-re-checked-or-it-is-not-counted.md) | Re-check the corpus's own claims, and count only the ones you could check | Accepted |
| [ADR-011](ADR-011-a-pointer-resolves-or-it-is-reported.md) | A record's pointers resolve, or the gate says they do not | Accepted |
| [ADR-012](ADR-012-the-gates-reach-a-client-with-no-shell.md) | Expose the reading gates over MCP, and refuse the two that execute the corpus | Accepted |
| [ADR-013](ADR-013-a-mutation-a-human-performed.md) | Give a human-performed mutation a lane, and make the row checkable | Accepted |
| [ADR-014](ADR-014-a-task-that-is-honestly-unfinished.md) | Give an unfinished task a status the corpus can read | Accepted |
| [ADR-015](ADR-015-a-go-fence-can-reach-its-required-success.md) | A Go fence can reach its required success | Accepted |
| [ADR-016](ADR-016-a-mutant-earns-its-verdict.md) | A mutant earns its verdict | Accepted |
| [ADR-017](ADR-017-a-permanent-fact-names-its-citation.md) | A permanent fact names its citation | Accepted |
| [ADR-018](ADR-018-every-ordered-step-names-its-proof.md) | Every ordered step names its proof | Accepted |
| [ADR-019](ADR-019-an-orphan-must-prove-it-is-ours.md) | Make an orphan prove it is ours, and never act on it | Accepted |
| [ADR-020](ADR-020-a-run-leaves-a-trace-outside-the-file.md) | Bind an acceptance entry to something the file cannot produce | Accepted |
| [ADR-021](ADR-021-a-deleted-row-is-a-change-to-the-evidence.md) | A row removed from an evidence log is a change to the evidence | Accepted |
| [ADR-022](ADR-022-a-fence-names-what-its-claim-rests-on.md) | A fence names what its claim rests on | Accepted |
| [ADR-023](ADR-023-a-measured-verdict-may-be-reused.md) | Reuse a mutation verdict only when nothing it rests on has changed | Accepted |
| [ADR-024](ADR-024-a-state-the-vocabulary-cannot-express.md) | Give a name to the two states these gates can see but cannot say | Accepted |
| [ADR-025](ADR-025-a-clean-run-is-evidence-of-itself.md) | Record the clean run a mutation already takes, instead of taking it twice | Accepted |
| [ADR-026](ADR-026-the-front-door-is-a-product-page.md) | Make the front door a product page, and put the proof one click away | Accepted |
| [ADR-027](ADR-027-the-harness-ships-an-operating-surface.md) | Ship an operating surface, and make the countable half a command | Accepted |
| [ADR-028](ADR-028-a-step-names-the-run-that-exercised-it.md) | Bind an ordered step to the run that exercised it, so a skipped step is loud | Accepted |
| [ADR-029](ADR-029-a-role-declares-the-capability-it-needs.md) | A spawned role declares the capability it needs, instead of inheriting whatever ran | Accepted |
| [ADR-030](ADR-030-the-plugin-is-tested-as-installed.md) | Give the delegation machinery a socket, and test the plugin as installed | Accepted |
| [ADR-031](ADR-031-a-gate-answers-for-itself.md) | Make every gate answer `--version` for itself | Accepted |
| [ADR-032](ADR-032-an-eval-names-the-skill-it-exercises.md) | Make an eval name the skill it exercises | Accepted |
| [ADR-033](ADR-033-prose-about-a-gate-is-checked-against-the-gate.md) | Check the prose about a gate against the gate's actual flags | Accepted |
| [ADR-034](ADR-034-a-corpus-root-is-a-question-not-an-empty-answer.md) | Let `adr-next` answer for a corpus root instead of reporting it empty | Accepted |
| [ADR-035](ADR-035-a-confident-claim-is-checked-against-what-ran.md) | A confident claim is checked against what ran, and every verdict is counted | Accepted |
| [ADR-036](ADR-036-the-asserted-arm-is-retired-and-the-rate-is-joined-to-evidence.md) | The `asserted` arm is retired, and the false-success rate is joined to evidence rather than read off the prose | Accepted |
| [ADR-037](ADR-037-advice-earns-its-place-by-being-acted-on.md) | Advice earns its place by being acted on, and an advisory nobody acts on is removed rather than rationed | Accepted |
| [ADR-038](ADR-038-a-staged-product-not-a-funnel.md) | A staged product, not a funnel | Accepted |
| [ADR-039](ADR-039-records-use-the-same-listing.md) | Records use the same listing | Accepted |
| [ADR-040](../adr-archive/ADR-040-sessionstart-ready-uses-the-listing.md) | SessionStart ready uses the listing | Accepted |
| [ADR-043](ADR-043-layer-from-stages-catalog.md) | Name Core and Corpus from the STAGES catalog | Accepted |
| [ADR-044](ADR-044-statusline-snippet-is-a-segment.md) | Compose the statusline segment; do not replace statusLine | Accepted |
| [ADR-045](ADR-045-one-record-grammar.md) | One record grammar, loaded, not copied | Accepted |
| [ADR-046](../adr-archive/ADR-046-a-caller-relays-could-not-run.md) | A caller relays could-not-run as could-not-run | Accepted |
| [ADR-049](ADR-049-an-unreadable-file-is-could-not-run.md) | An unreadable file is could-not-run | Accepted |
| [ADR-050](ADR-050-a-locked-test-body-is-not-rewritten.md) | A locked test body is not rewritten | Accepted |
| [ADR-051](ADR-051-unproven-advise-does-not-invent-writes.md) | Unproven Advise does not invent writes | Accepted |
| [ADR-052](ADR-052-an-explicit-relock-is-not-a-later-red.md) | An explicit relock is not a later red | Accepted |
| [ADR-053](ADR-053-a-false-advisory-is-not-a-finding.md) | A false advisory is not a finding | Accepted |
| [ADR-054](ADR-054-a-go-raw-string-is-not-an-escape.md) | A Go raw string is not an escape | Accepted |
| [ADR-055](ADR-055-an-escaped-quote-is-still-the-name.md) | An escaped quote is still the name | Accepted |
| [ADR-057](ADR-057-every-shipped-element-has-a-named-route.md) | Every shipped element has a named route | Accepted |
| [ADR-060](ADR-060-advisories-react-to-observed-events.md) | Advisories react to observed events, not to parsed commands | Accepted |
| [ADR-061](ADR-061-an-unchecked-publish-is-refused.md) | An unchecked publish is refused | Accepted |
| [ADR-062](ADR-062-a-review-is-a-host-result.md) | A review is a host result (`bound` vocabulary superseded by ADR-119 T2) | Accepted |
| [ADR-063](ADR-063-a-record-is-its-number-or-its-stem.md) | A record is its number, or its stem | Accepted |
| [ADR-064](ADR-064-corpus-chaos-is-the-release-loop.md) | Corpus chaos is the release loop | Accepted |
| [ADR-065](ADR-065-branch-state-serves-its-snapshot.md) | The per-prompt branch-state brief serves its snapshot and refreshes behind the prompt | Accepted |
| [ADR-066](ADR-066-git-refuses-an-unchecked-publish.md) | Git itself refuses an unchecked publish, and a plain invocation is left to it | Accepted |
| [ADR-067](ADR-067-the-publish-classifier-reads-the-command-as-the-shell-splits-it.md) | The publish classifier reads a command as the shell splits it | Accepted |
| [ADR-068](ADR-068-git-refuses-in-a-linked-worktree-and-says-when-it-is-armed.md) | Git refuses in a linked worktree too, and the session is told when it is armed | Accepted |
| [ADR-069](ADR-069-a-stale-mutant-is-repointed-by-its-own-edit.md) | A stale mutant is repointed by its own edit | Accepted |
| [ADR-070](ADR-070-a-peer-attestation-is-imported-and-checked-against-its-commit.md) | A peer's attestation is imported, and checked against its commit | Accepted |
| [ADR-071](ADR-071-a-rewritten-line-is-reanchored-on-the-text-around-its-edit.md) | A rewritten line is re-anchored on the text around its edit | Accepted |
| [ADR-072](ADR-072-a-mutant-runs-only-the-tests-that-kill-it.md) | A mutant runs only the tests that kill it | Accepted |
| [ADR-073](ADR-073-a-narrowed-entry-runs-every-test-it-names.md) | A narrowed entry runs every test it names | Accepted |
| [ADR-074](ADR-074-one-status-reading-and-one-record-definition.md) | One Status reading and one record definition for every reader | Accepted |
| [ADR-075](ADR-075-a-campaign-runs-in-a-worktree-and-says-its-load.md) | A campaign runs in a worktree, and every result says the load it ran under | Accepted |
| [ADR-076](ADR-076-a-recorded-mutant-runs-in-a-worktree.md) | A recorded mutant runs in a worktree | Accepted |
| [ADR-077](ADR-077-a-heavy-run-holds-a-lease-and-names-its-neighbours.md) | A heavy run holds a lease, and names the heavy runs beside it | Accepted |
| [ADR-078](ADR-078-a-lock-reads-javascript-as-javascript.md) | A lock reads JavaScript as JavaScript, and says which reading took it | Accepted |
| [ADR-079](ADR-079-every-gate-reads-javascript-one-way.md) | Every gate reads JavaScript one way | Accepted |
| [ADR-080](ADR-080-no-hook-waits-on-the-artifact-pass.md) | No hook waits on the artifact pass | Accepted |
| [ADR-081](ADR-081-qh-check-reads-its-own-ledger.md) | qh-check reads its own ledger | Accepted |
| [ADR-082](ADR-082-an-attestation-says-what-changed.md) | An attestation says what its run changed | Accepted |
| [ADR-083](ADR-083-the-lexer-reads-jsx.md) | The lexer reads JSX | Accepted |
| [ADR-084](ADR-084-count-the-skills-adopters-use.md) | Count the skills adopters use, and read the ledgers in one report | Accepted |
| [ADR-085](ADR-085-a-build-diagnostic-in-an-assertion-is-a-kill.md) | A build diagnostic inside a failing assertion is a kill | Accepted |
| [ADR-086](ADR-086-a-fresh-repository-commit-is-not-refused.md) | A commit into a repository the command creates is not this checkout's publish | Accepted |
| [ADR-087](ADR-087-measured-status-shapes-are-read.md) | Measured status shapes are read | Accepted |
| [ADR-088](ADR-088-evidence-is-read-against-its-writer.md) | Evidence is read against its writer | Accepted |
| [ADR-089](ADR-089-the-probe-says-what-it-did-not-compare.md) | The probe says what it did not compare | Accepted |
| [ADR-090](ADR-090-a-quoted-message-is-data.md) | A quoted message is data | Accepted |
| [ADR-091](ADR-091-the-catalogue-is-a-file-per-source.md) | The catalogue is a file per source | Accepted |
| [ADR-092](ADR-092-one-definition-of-a-record.md) | One definition of a record, in Python, with lifecycle as its only mirror | Accepted |
| [ADR-093](ADR-093-a-literal-variable-directory-is-left-to-git.md) | An armed session leaves a commit into a literal-variable directory to git | Accepted |
| [ADR-094](ADR-094-a-standing-fact-is-said-once-and-prose-reuses-the-pass.md) | A standing fact is said once, and a prose-only change reuses the last pass | Accepted |
| [ADR-095](../adr-archive/ADR-095-a-hook-does-not-repeat-work-whose-inputs-have-not-changed.md) | A hook does not repeat work whose inputs have not changed | Accepted |
| [ADR-096](ADR-096-turn-end-findings-reach-the-agent.md) | Turn-end findings reach the agent | Accepted |
| [ADR-097](ADR-097-remove-what-nothing-acts-on.md) | Remove what nothing acts on | Accepted |
| [ADR-098](ADR-098-what-the-plugin-says-matches-what-it-does.md) | What the plugin says matches what it does | Accepted |
| [ADR-099](ADR-099-sessionstart-does-not-list-ready-tasks.md) | SessionStart does not list ready tasks; work-next owns ready | Accepted |
| [ADR-100](ADR-100-a-repeated-procedure-is-one-command.md) | A procedure the agent repeats is one command | Accepted |
| [ADR-101](ADR-101-one-reader-per-check-ledger.md) | One reader per check ledger | Accepted |
| [ADR-102](ADR-102-a-syntax-finding-at-the-edit-reaches-the-agent.md) | A syntax finding at the edit reaches the agent | Accepted |
| [ADR-103](ADR-103-qh-check-points-at-a-faster-check.md) | qh-check points at a faster check, and says when a run was slow for its history | Accepted |
| [ADR-104](ADR-104-a-literal-path-commit-elsewhere.md) | A commit whose literal `-C` path names another repository is not this checkout's publish | Accepted |
| [ADR-105](ADR-105-a-fast-committed-commit-is-checked-at-turn-end.md) | A commit its declared fast check passed on is not named unchecked at turn end | Accepted |
| [ADR-106](ADR-106-a-paired-benchmark-says-what-the-plugin-buys.md) | Measure what the plugin buys with a paired benchmark that hidden tests grade | Accepted |
| [ADR-107](ADR-107-the-plugin-works-the-mrw-way.md) | The plugin works the mrw way | Accepted |
| [ADR-108](ADR-108-the-hooks-say-what-to-do-next.md) | The hooks say what to do next, the mrw way | Accepted |
| [ADR-109](ADR-109-a-landed-plan-is-a-mutant-catalogue.md) | The agent writes the tests; the plugin tests the trust between the code and the contract | Accepted |
| [ADR-110](ADR-110-a-static-core-owns-the-hooks.md) | A static core owns the hooks, and the lifecycle is opt-in | Accepted |
| [ADR-111](ADR-111-the-turn-end-judges-against-a-baseline.md) | The turn end judges the work against a baseline taken at session start | Accepted |
| [ADR-112](ADR-112-the-lifecycle-is-measured-where-it-can-work.md) | The plugin is measured where its mechanism can work, against a kill criterion | Accepted |
| [ADR-113](ADR-113-the-go-core-takes-the-rules-and-side-doors-are-enumerated.md) | The Go core takes the hooks' rules, and the gaps between paths are enumerated | Accepted |
| [ADR-114](ADR-114-the-core-serves-state-as-mcp-resources.md) | The core serves session state as MCP resources, and pushes nothing less | Accepted |
| [ADR-115](ADR-115-a-release-judges-the-load-the-run-did-not-bring.md) | A release judges the load the run did not bring | Accepted |
| [ADR-116](ADR-116-qh-ships-as-release-assets-fetched-and-verified.md) | `qh` ships as release assets, fetched and verified, with Node as the fallback | Accepted |
| [ADR-117](ADR-117-the-evidence-is-written-only-by-its-tools.md) | The evidence is written only by its tools, and a door that cannot close here is named where it closes | Accepted |
| [ADR-118](ADR-118-main-lands-only-a-sha-ci-passed.md) | Main lands only a sha CI has already passed | Accepted |
| [ADR-119](ADR-119-what-the-backlog-still-holds.md) | What the backlog still holds after the 2026-10-20 re-check | Accepted |
| [ADR-120](ADR-120-nothing-left-out.md) | Nothing left out: the shell grammar, a retired spec fact, the session's own plugin, a Stop that can act | Accepted |
| [ADR-121](ADR-121-a-watcher-that-steers-on-evidence.md) | A watcher that steers on evidence, learns which nudges work, and remembers the lessons | Accepted |
| [ADR-122](ADR-122-said-once-per-context.md) | Each hook item is said once per context | Accepted |
| [ADR-123](ADR-123-the-product-layer.md) | A living product model whose rules run, specs that change it, and the product concerns every spec states | Accepted |
| [ADR-124](ADR-124-skills-for-every-host.md) | The skills reach other agent hosts through one shared link the plugin keeps fresh | Accepted |
| [ADR-125](ADR-125-a-blocking-review-covers-nothing.md) | A plugin commit is reviewed only when the newest review covering it did not request changes | Accepted |
| [ADR-126](ADR-126-one-run-per-release.md) | A release is one landing and one CI run, and a test sets every budget it depends on | Accepted |
| [ADR-127](ADR-127-an-escape-is-replayed-against-the-gates.md) | Every defect that escaped to someone outside is replayed against today's tests | Accepted |
| [ADR-128](ADR-128-say-less-and-measure-what-is-heard.md) | Say less, and measure what the agent does with what is said | Accepted |
| [ADR-129](ADR-129-a-test-lock-is-a-file-beside-its-row.md) | A test lock's payload is a committed file, and its row carries only the sha | Accepted |
| [ADR-130](ADR-130-checks-are-optional-tools.md) | Keep explicit checks and evidence; remove compulsory publishing checks, nags and automatic baselines | Accepted |
| [ADR-131](ADR-131-native-reader-identity-and-measured-cost.md) | Bind native reader identity and measure actual optional-check work and context reductions | Accepted |
| [ADR-132](ADR-132-the-installed-plugin-includes-its-go-core.md) | Install the plugin and verified Go core together from an immutable release archive | Accepted |
