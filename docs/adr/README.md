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
| [ADR-040](ADR-040-sessionstart-ready-uses-the-listing.md) | SessionStart ready uses the listing | Accepted |
| [ADR-041](ADR-041-a-probe-prefix-is-not-the-mutation.md) | A probe prefix is not the mutation | Accepted |
| [ADR-042](ADR-042-unproven-write-is-advise.md) | UNPROVEN write authorship is Advise | Accepted |
| [ADR-043](ADR-043-layer-from-stages-catalog.md) | Name Core and Corpus from the STAGES catalog | Accepted |
| [ADR-044](ADR-044-statusline-snippet-is-a-segment.md) | Compose the statusline segment; do not replace statusLine | Accepted |
| [ADR-045](ADR-045-one-record-grammar.md) | One record grammar, loaded, not copied | Accepted |
| [ADR-046](ADR-046-a-caller-relays-could-not-run.md) | A caller relays could-not-run as could-not-run | Accepted |
| [ADR-047](ADR-047-an-unrecognised-command-is-unproven.md) | An unrecognised command is UNPROVEN | Accepted |
| [ADR-048](ADR-048-an-unproven-write-has-a-validation-term.md) | An UNPROVEN write has a validation term | Accepted |
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
| [ADR-062](ADR-062-a-review-is-a-host-result.md) | A review is a host result | Accepted |
