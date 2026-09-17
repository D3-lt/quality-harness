# ADR-058: The commit and completion advisories name only what they observed

**Status:** Accepted
**Date:** 2026-09-16
**Owner:** zy
**Spec:** None — no spec stage. The behaviour is already decided by ADR-047 (an unrecognised command is UNPROVEN), ADR-051 (Advise names only proven paths) and ADR-053 (a false advisory is not a finding); this record removes four measured false positives under those decisions.
**Cross-references:** ADR-047, ADR-048, ADR-051, ADR-053, ADR-054, `docs/BACKLOG.md` §213, `docs/BACKLOG.md` §216
**Governs:** `plugin/scripts/lifecycle.mjs`

Class: every PreToolUse and Stop advisory that `plugin/scripts/lifecycle.mjs` emits from its transcript scan (`analyzeTranscript`) or the commit branch of `handleHook`. Enumerated 2026-09-16 at `e813f0a` with `grep -n "Nothing has verified the work since your last change\|could not prove a repository path\|Changed paths include\|the same finding as earlier this session still stands\|Artifact validation failed" plugin/scripts/lifecycle.mjs` — five message sites (lines 932, 2308, 2381, 2754-2755, 2938, 4513). Members this record does not change: the artifact-gate runner messages at 2308/2381 (they report what the gates return; the false one here was fed an invented path, which T3 removes upstream), and the "same finding still stands" repeat at 2938 (a repetition policy, which belongs to its own record).

**Enforced-by:** `tests/advice-accuracy.test.mjs::a timeout-wrapped check is a check`, `tests/advice-accuracy.test.mjs::mrw read is a read, not an unproven write`, `tests/advice-accuracy.test.mjs::echo and printf arguments are not changed paths`, `tests/advice-accuracy.test.mjs::a commit in another repository does not arm this repository's commit advisory`, `tests/advice-accuracy.test.mjs::read-only arguments are not changed paths`, `tests/advice-accuracy.test.mjs::a wrapper file operand is still a changed path`, `tests/advice-accuracy.test.mjs::a nested publish or a repository override still arms the commit advisory`
**Invalidates:** none — checked. ADR-047's rule stands: `mrw read` becomes a RECOGNISED read, not an unrecognised command waved through. ADR-053/054's publish wrappers (`command|env|sudo|exec|time`) are unchanged; T1 adds a timeout wrapper to the VALIDATION side only.
**Served-path change:** a session that runs `gtimeout 590 bash scripts/selftest.sh`, reads with `mrw read`, echoes a sentence ending in `.md`, or commits in a scratch repository no longer receives a commit or completion advisory that none of those earned.

## Context

Measured 2026-09-16 on the main transcript of the session that executed ADR-057 (282 tool calls): the plugin's own hooks injected 22 messages (lifecycle.mjs 15, branch-state.mjs 7), about 8.6 KB. Of the 15 lifecycle messages, the commit and completion advisories were reproduced one by one against the functions that emit them:

1. `gtimeout 590 bash scripts/selftest.sh` → `classifyCommand` `unrecognised`, `isValidationCommand` false. Every validation pattern is anchored, so the timeout prefix hides the check. A shell measured the wrapper: `gtimeout 5 false` exits 1, `gtimeout 5 true` 0, `gtimeout 1 sleep 3` 124, `timeout --kill-after=2 5 false` 1, `gtimeout -k 2 5 true` 0 — the wrapper carries the check's own status, and `validationVerdict` already reads 124 as `timeout`.
2. `mrw read docs/BACKLOG.md:1-5` → `unrecognised`, which ADR-047 turns into a pending UNPROVEN write; the Stop advisory then said "I could not prove a repository path for those edits" at the end of turns that edited nothing in the repository.
3. `cp … && rm -rf -- "$RUN" && echo "run dir removed, review kept at scratchpad/codex-review-f37f57a.md"` → `bashMarkdownMutationPaths` returned `<repo>/run dir removed, review kept at scratchpad/codex-review-f37f57a.md`, an echo argument reported as a changed path, which the artifact gate then failed to classify.
4. `git -C <scratch repo> commit --allow-empty -m probe` → the commit branch returns only when `isGitPublishCommand` is false; it never asks `gitPublishTargetsThisProject`, which the publish boundary already uses (lifecycle.mjs:878).

Not changed, and why:
- Most "Nothing has verified" messages followed a check the session ran as `…; gtimeout 590 bash scripts/selftest.sh > "$S/out" 2>&1; code=$?; echo …`. That command's recorded exit status is the trailing `grep`'s, so the gate could not see the check's result; CLAUDE.md §2 already says to run the gate bare. The advisory was right not to count it.
- One advisory listed `plugin/skills/spec-write/SKILL.md`, a file the session never touched. It did not reproduce through `bashMarkdownMutationPaths` for the suspected heredoc shape, so it is not fixed here (CLAUDE.md §16: reproduce before encoding) and stays in BACKLOG §213.

## Existing Primitives Audit

- **`isValidationCommand` and its `ASSIGNMENT_PREFIX` strip** (lifecycle.mjs:1071-1101) — **extend.** A timeout wrapper is stripped beside the assignment prefix, after `UNSAFE_SEGMENT` has seen the whole segment, so nothing is laundered.
- **`validationVerdict`** (exit 124 → `timeout`) — **reuse**; a timed-out check stays a failed verification.
- **`isMrwWriteCheckCommand` / `commandInvocation`** (lifecycle.mjs:517, 1105) — **reuse** to recognise the `mrw read` invocation, including `mrw --root DIR read`.
- **`bashMarkdownMutationPaths`** (lifecycle.mjs:1617) — **reshape**: a segment whose command is `echo` or `printf` contributes only its redirect target.
- **`gitPublishTargetsThisProject`** (lifecycle.mjs:878) — **reuse** in the commit branch, with its unresolved case kept advising.
- **`tests/unread-advice.test.mjs` harness** (transcript, toolUse, toolResult, runLifecycleHook) — **reuse its shape** in a new test file; the locked bodies in existing files are not edited.

## Decision

**A commit or completion advisory names only what the transcript shows. A check run under a timeout wrapper is a check; `mrw read` is a read; an echoed sentence is not a changed path; a commit in another repository does not arm this repository's commit advisory. Where the gate cannot resolve something, it still advises (ADR-005, ADR-047).**

1. **T1 — a timeout-wrapped check is a check.** Strip one leading `timeout` or `gtimeout` invocation — its options (`-k N`, `--kill-after=N`, `-s SIG`, `--signal=SIG`, `--preserve-status`, `--foreground`, `-v`) and one duration — before matching `VALIDATION_PATTERNS`. `gtimeout 5 rm -rf x` stays a mutation.
2. **T2 — `mrw read` is a read.** `classifyCommand` returns `neither` for an `mrw read …` or `mrw --root DIR read …` invocation that is the whole segment; `mrw write` keeps today's classification.
3. **T3 — echo and printf arguments are not changed paths.** In `bashMarkdownMutationPaths`, a segment whose command word is `echo` or `printf` contributes only the target of its `>`/`>>` redirect.
4. **T4 — a commit elsewhere does not arm this repository's commit advisory.** The commit branch returns early when every commit or push segment resolves to a repository other than this one. A segment whose target cannot be resolved still advises.
5. **T5 — wc, grep, git ls-files and mrw read arguments are not changed paths** (added 2026-09-17). The Follow-up replay found that T1 and T2 made two commit advisories name files that were only read: the commands around `wc`, `grep` and `git ls-files` became recognised mutations, and `bashMarkdownMutationPaths` read their `.md` arguments. Those segments, and `mrw read`, contribute only a redirect target, as T3's do; a `grep` naming an ugrep option that writes or runs a command keeps every candidate. The rest of the class is BACKLOG §220.
6. **T6 — a wrapper's file operand is still a changed path** (added 2026-09-17). A cold review of ADR-059's draft found that T3 and T5 skipped a wrapper's own operand too: `/usr/bin/time -o docs/timing.md wc -l …` writes `docs/timing.md` (measured) and was no longer named. A segment with a Markdown word before its command keeps every candidate.
7. **T7 — a nested publish or a repository override still arms the commit advisory** (added 2026-09-17 from a Codex review). T4's shortcut walked only top-level segments, so `…; bash -c 'git commit …'` and `GIT_DIR=<this>/.git git -C <other> commit` were silenced though they publish here. The shortcut now refuses a publish its walk cannot resolve (`bash -c`, `$(…)`, a heredoc body) and a `--git-dir`, `--work-tree` or `GIT_…=` override.

**What would make each fail, and whether that data exists:** each task's test reproduces the exact command shape from the measured session (above) through `handleHook` or the classifier, and each carries its opposite — a timeout-wrapped mutation, an `mrw write`, an `echo … > file.md`, an unresolvable `git -C "$X" commit` — which must still advise. Both halves are constructible today; the mutants delete each new guard.

## Alternatives Considered

- **Treat `> file 2>&1` and `; code=$?; echo …` compounds as validation.** Rejected: the command's exit status is not the check's, and a redirect can overwrite a tracked file. CLAUDE.md §2 already asks for the gate to be run bare; the session that measured this did not.
- **Add `timeout`/`gtimeout` to `PUBLISH_WRAPPER`.** Rejected: that list decides whether a publish is preceded by a check (ADR-054); the defect is on the validation side.
- **Silence the commit advisory for any `git -C` commit.** Rejected: an unresolvable target would then read as "not this repository", the fail-open direction CLAUDE.md §16 forbids.
- **Throttle repeated advisories by a per-session counter.** Deferred to its own record: it changes every gate's behaviour, and mixing it with accuracy fixes would make the re-measure unable to say which change removed which message.

## Component / Boundary Impact

| Component | Ownership after change | Why it changes |
|-----------|------------------------|----------------|
| `lifecycle.mjs` classifier | unchanged | T1 and T2 recognise two more shapes correctly |
| `lifecycle.mjs` path extraction | unchanged | T3 stops reading echo/printf arguments as paths |
| `lifecycle.mjs` commit branch | unchanged | T4 asks the existing target check |
| `tests/advice-accuracy.test.mjs` | repository gate | new file |

None — no Module Map file in this repository; no architecture document to update.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `isValidationCommand` / `classifyCommand` results | a timeout-wrapped check is `validation`; `mrw read` is `neither` | T1, T2 | commit and completion advisories, the reviewer guard, `publishPrecededByValidation` |
| `bashMarkdownMutationPaths` result | no echo/printf arguments; no `wc`, `grep`, `git ls-files` or `mrw read` arguments beyond a redirect target | T3, T5 | Stop "Changed paths include", the commit advisory, the artifact gate |
| PreToolUse commit advisory | not armed by a commit that resolves to another repository | T4 | sessions |

## Inter-task Contracts

None. The four tasks change different functions and add tests to one new file; they are ordered only so that file is created once (T1).

## Implementation

See `docs/adr/ADR-058-advisories-name-only-what-they-observed/tasks/README.md`.

## Consequences

- **Positive:** the four reproduced false advisories stop; a bare `gtimeout`-bounded check, which the `costly-runs` discipline recommends, counts as evidence.
- **Negative:** `readOnlyVerdict` also reads `classifyCommand`, so a reviewer role may now run `mrw read` and a timeout-wrapped check; both are reads or checks.
- **Negative, found after T1–T4 landed:** recognising more commands exposed BACKLOG §220 — two commit advisories on the measured session named read-only files instead of saying they could not prove a path. T5 closes those two (replayed 2026-09-17); the other read-only families still carry the defect until §220's record lands.
- **Negative, found in review of ADR-059's draft:** T3 and T5 as first shipped dropped a wrapper's file operand (`time -o docs/timing.md`), a real write left unnamed. T6 closes it; no release carried it.
- **Negative, found in Codex review 2026-09-17:** T4 as first shipped silenced a commit to this repository hidden in `bash -c` or chosen by `GIT_DIR`/`--git-dir` — a fail-open. T7 closes it; no release carried it.
- **Neutral:** a check buried in a compound command is still invisible to the gate, by design.

## Out of Scope

- A per-session repetition counter or cadence for advisories (deferred: docs/BACKLOG.md §217)
- The unreproduced `spec-write/SKILL.md` path (deferred: docs/BACKLOG.md §213)
- Reading a check's verdict out of a compound command or a redirect (permanent: boundary: the recorded exit status is not the check's; CLAUDE.md §2 asks for the gate to be run bare)
- The reviewer guard's other refusals of read-only commands (deferred: docs/BACKLOG.md §216)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The timeout strip hides a mutation behind a wrapper | Low | High — a mutation counted as a check | Strip only after `UNSAFE_SEGMENT` saw the whole segment; T1's test asserts `gtimeout 5 rm -rf x` stays a mutation |
| `mrw read` gains a write flag in a future release | Low | Med | T2 recognises the `read` subcommand only; the mutant widens it to any `mrw` |
| T4 silences a commit whose target resolves wrongly | Low | Med | only fully resolved foreign targets return early; the unresolved test keeps advising |

## Rollback

Revert the task commits. No persistent state, no migration; the four false advisories return.

## Follow-ups

- [x] After T1–T4 land, replay the ADR-057 session's recorded hook points through `lifecycle.mjs` at `e813f0a` and at the new head, and record the before/after count of commit and completion advisories in BACKLOG §213. — done 2026-09-16, BACKLOG §213 ("Re-measured after ADR-058"): 21 messages before and after; two path lists got worse through §220.
