# Task ADR-098-T2: One blocking definition, one severity vocabulary, the leaf contract once per audience

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** L (one skill becomes canonical; two agents and `host-review.mjs` mirror it; three workflows and three skills reference it)
**Owner:** unassigned
**Produces:** the `## Blocking findings` block in `plugin/skills/review/SKILL.md` (canonical); `BLOCKING_CRITERIA` in `host-review.mjs` (its mirror for Codex); severity `blocking|advisory` and the `advisories` result key in `review-ring.js`
**Consumes:** `reviewPrompt` in its post-T1 form (T1)
**Data dependency:** needs a live Claude Code session for S2 only (does `SubagentStart` fire for a shipped workflow's `agent()`?); the fence is hermetic
**Proof map:** v1
**Rests-on:** `one blocking definition`, `the canonical text is definition A`, `mirrors equal the canonical text`, `one severity vocabulary`, `agent files do not restate the leaf contract`, `every editing role forbids publishing`

## Goal

Every reviewer applies one blocking definition (A) with one severity vocabulary, a Claude subagent gets the leaf contract once, from
`SubagentStart`, and every editing role is told not to commit or push.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/skills/review/SKILL.md` | edit | `:47-51` (B) becomes `## Blocking findings`: definition A between `<!-- blocking-criteria -->` markers; `:18-19` keeps "A delegated reviewer is a read-only leaf role" and names the `SubagentStart` contract instead of restating it |
| `plugin/skills/quality-policy/SKILL.md` | edit | `:56-69` refers to the review skill's `## Blocking findings` and keeps its fix-loop rule; `:73-75` already names the hook and stays |
| `plugin/skills/execution/SKILL.md` | edit | `:8-10` keeps "When spawned, you are a leaf role" and refers to the `SubagentStart` contract instead of listing it; `:46` ("Do not commit, push, deploy, or migrate…") stays |
| `plugin/agents/qh-correctness-reviewer.md` | edit | `:22-23` (hybrid) becomes the verbatim mirror; `:30` "You are a leaf" deleted |
| `plugin/agents/qh-synthesis.md` | edit | `:23-26` becomes the verbatim mirror; `:33` deleted |
| `plugin/agents/qh-scope-reviewer.md` | edit | `:29` deleted |
| `plugin/agents/qh-narrow-fixer.md` | edit | `:19` "You are a leaf…" becomes "You do not commit or push.": it is the one agent whose `tools:` (`:5`) lists `Edit` and `Write`, and `subagentContract` gives an editing role no publish prohibition (`completion-rules.mjs:377-387`) |
| `plugin/workflows/quality-cycle.js` | edit | `:31` keeps "You are an assigned read-only leaf reviewer." and drops the restated rules (if S2 holds); `:56` and `:107` refer to the role's own blocking criteria instead of restating them; `:107` keeps the catalogue's `from` (`model: 'opus', agentType: 'quality-harness:qh-synthesis'`) |
| `plugin/workflows/review-ring.js` | edit | `:59` enum `['blocking', 'advisory']`; `:98-129` `minors` becomes `advisories`; `:86` keeps "read-only REVIEWER and a leaf role" and drops the restated rules (if S2 holds); `:116` keeps "narrowly scoped FIXER and a leaf role" and "Do not commit or push." and drops the other restated rules (if S2 holds); `:89` refers to the review skill's blocking criteria |
| `plugin/workflows/consensus.js` | edit | `:30` holds two sentences today, the role sentence and a do-not-invoke sentence: it keeps "You are a read-only leaf role." and drops the second (if S2 holds) |
| `plugin/scripts/host-review.mjs` | edit | `reviewPrompt` (`:90-100`) gains `BLOCKING_CRITERIA`, the mirror; `:92` stays the Codex leaf line; `:93` (a catalogue `from`) is untouched |
| `plugin/scripts/completion-rules.mjs` | read | `subagentContract` (`:374-397`) is the one Claude-subagent definition and is unchanged, so `tests/goldens/other-events.json:22` does not move |
| `tests/review-contract.test.mjs` | add | the six tests below |
| `tests/mutations/plugin/skills/review/SKILL.md.json` | add | one entry each for `one blocking definition` and `the canonical text is definition A` |
| `tests/mutations/plugin/workflows/review-ring.js.json` | edit | one entry each for `one severity vocabulary` and `every editing role forbids publishing` (the fixer's sentence); the three existing `from` lines (all `:121`) are untouched |
| `tests/mutations/plugin/agents/qh-synthesis.md.json` | edit | one entry for `mirrors equal the canonical text`; the existing `model: opus` entry is untouched |
| `tests/mutations/plugin/agents/qh-narrow-fixer.md.json` | edit | one entry for `every editing role forbids publishing` (the agent's sentence); the existing `name: qh-narrow-fixer` entry is untouched |

Disposition of every line the two enumerations printed on 2026-10-12, so the class is closed here and not by memory:

| Line(s) | Today | After |
|---------|-------|-------|
| `agents/qh-correctness-reviewer.md:30`, `qh-scope-reviewer.md:29`, `qh-synthesis.md:33` | "You are a leaf" | deleted: `SubagentStart` says it |
| `agents/qh-narrow-fixer.md:19` | "You are a leaf" | replaced by "You do not commit or push." |
| `scripts/completion-rules.mjs:381` | the Claude contract | kept: the one definition |
| `scripts/host-review.mjs:92`, `:117` | Codex leaf line and marker | kept: Codex gets no `SubagentStart` |
| `skills/codex-advise/SKILL.md:22`, `:80`; `skills/codex-review/SKILL.md:22`, `:142`, `:156` | recursion markers | kept (locked); T1 changes `:80` and `:142` to prompt-file examples that still begin with the marker |
| `skills/execution/SKILL.md:9`, `skills/review/SKILL.md:18` | restate the do-not-invoke list | reduced to the role sentence and a reference |
| `skills/quality-policy/SKILL.md:73`, `skills/work/SKILL.md:15`, `:121` | coordinator instructions naming the hook | kept |
| `workflows/consensus.js:30` | role sentence plus a do-not-invoke sentence | role sentence kept, second sentence dropped (if S2 holds) |
| `workflows/quality-cycle.js:31`, `workflows/review-ring.js:86` | role sentence plus restated rules | role sentence kept, rules dropped (if S2 holds) |
| `workflows/review-ring.js:116` | role sentence, "Do not commit or push.", restated rules | role sentence and the publish prohibition kept, other rules dropped (if S2 holds) |
| `workflows/review-ring.js:120` | "lets the leaf role finish" | kept: not the contract |
| `skills/quality-policy/SKILL.md:58` (A), `skills/review/SKILL.md:47` (B) | two definitions | review skill holds A; quality-policy refers to it |
| `agents/qh-synthesis.md:23` (A), `agents/qh-correctness-reviewer.md:22` (hybrid) | two wordings | both become the verbatim mirror |
| `workflows/quality-cycle.js:56` (hybrid), `:107` (A), `workflows/review-ring.js:89` (B) | restated | referenced |

## Ordered Steps

1. [S1] Write the six tests of the Tests table in `tests/review-contract.test.mjs` and record the red run with `adr-verify` (TDD red).
2. [S2] In a live session, run a shipped workflow whose role is an `agent()` and read whether that role's context carries the `QUALITY CONTRACT` text `subagentContract` emits. [proof: human: the sign-off quotes the line the role received, or says it received none]
3. [S3] Make the review skill canonical, write the three mirrors, and point quality-policy, quality-cycle and review-ring at it.
4. [S4] Change review-ring's severity and result key; remove three agent files' leaf lines and replace `qh-narrow-fixer.md`'s with its publish prohibition; shorten the workflow and skill restatements as the disposition table says, keeping every editing role's publish prohibition.
5. [S5] Re-run both enumeration commands and put each command and its count in the sign-off. [proof: human: the two counts and every surviving line match the disposition table]
6. [S6] Record one killed mutant per `Rests-on` name with `adr-verify --mutant`. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/review-contract.test.mjs tests/workflows.test.mjs tests/host-review.test.mjs tests/hook-goldens.test.mjs 2>&1) \
  && for t in 'the blocking criteria have one definition and every mirror is its text' 'the canonical blocking block is definition A' 'every review schema says blocking or advisory' 'no agent file restates the leaf contract the SubagentStart hook gives' 'a workflow prompt keeps one role sentence and no restated rules' 'every editing role keeps an explicit publish prohibition'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done \
  && test "$(git grep -n -i -E 'blocks only when|blocking only if|blocking finding must|a blocker (must|requires)' -- plugin | wc -l)" -eq 4
```

The final count is the canonical definition and its three mirrors; it is 7 today.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the blocking criteria have one definition and every mirror is its text` | `tests/review-contract.test.mjs` | the block between the review skill's markers equals, after whitespace folding, the text in `qh-correctness-reviewer.md`, `qh-synthesis.md` and `BLOCKING_CRITERIA`; quality-policy, quality-cycle and review-ring hold no five-part definition of their own | none | S1, S3 |
| `the canonical blocking block is definition A` | `tests/review-contract.test.mjs` | the block between the markers holds each of A's five conditions (in stated scope or a regression caused by the diff; material to correctness, security, data integrity, required behavior or concrete maintainability; exact code plus a failing check, reproduction, violated contract or direct trace; a minimal in-scope remedy; why existing passing evidence does not already settle it); the same check over definition B's text, as a fixture, fails | none | S1, S3 |
| `every review schema says blocking or advisory` | `tests/review-contract.test.mjs` | review-ring's and quality-cycle's `severity` enums and `validReview` accept exactly `blocking` and `advisory`; review-ring returns `advisories` and never `minors` | none | S1, S4 |
| `no agent file restates the leaf contract the SubagentStart hook gives` | `tests/review-contract.test.mjs` | no file in `plugin/agents/` matches `you are a leaf`; `subagentContract` still opens with `QUALITY CONTRACT — you are a leaf role` | none | S1, S4 |
| `a workflow prompt keeps one role sentence and no restated rules` | `tests/review-contract.test.mjs` | the `LEAF` text of each workflow, `consensus.js` included, is one sentence holding the locked substring, and none repeats `subagentContract`'s rule sentences | none | S1, S4 |
| `every editing role keeps an explicit publish prohibition` | `tests/review-contract.test.mjs` | every `plugin/agents/*.md` whose `tools:` lists `Edit` or `Write` says it does not commit or push; review-ring's fixer prompt holds "Do not commit or push."; the execution skill holds "Do not commit, push"; a fixture agent with `Edit` and no such sentence is reported | none | S1, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the six tests |
| 2 — something selects it | quality-cycle names `qh-correctness-reviewer` and `qh-synthesis` as `agentType` (catalogue-pinned); review-ring's reviewer invokes the review skill; `reviewPrompt` builds every Codex review |
| 3 — the caller can discover it | the review skill's `## Blocking findings` heading; quality-policy names it |
| 4 — it is used | nothing measures this yet: whether reviews' severities agree across hosts on the same diff |

## Mutation Log
- 2026-10-12 · 25a7e319* · mutant killed · exit 1 · `plugin/skills/review/SKILL.md` · the canonical block drifts from its three mirrors; the mirror-equality test must fail · acceptance-sha256:a63faa932568fbfada12dc6d75e81a07615ed1291c93b36ccfe6cbcc854207e3 · covers:one blocking definition
- 2026-10-12 · 25a7e319* · mutant killed · exit 1 · `plugin/skills/review/SKILL.md` · the canonical block loses definition A condition four; the definition-A test must fail · acceptance-sha256:a63faa932568fbfada12dc6d75e81a07615ed1291c93b36ccfe6cbcc854207e3 · covers:the canonical text is definition A
- 2026-10-12 · 25a7e319* · mutant killed · exit 1 · `plugin/agents/qh-synthesis.md` · the synthesis mirror drifts from the canonical block; the mirror-equality test must fail · acceptance-sha256:a63faa932568fbfada12dc6d75e81a07615ed1291c93b36ccfe6cbcc854207e3 · covers:mirrors equal the canonical text
- 2026-10-12 · 25a7e319* · mutant killed · exit 1 · `plugin/workflows/review-ring.js` · review-ring accepts minor again; the severity-vocabulary test must fail · acceptance-sha256:a63faa932568fbfada12dc6d75e81a07615ed1291c93b36ccfe6cbcc854207e3 · covers:one severity vocabulary
- 2026-10-12 · 25a7e319* · mutant killed · exit 1 · `plugin/agents/qh-synthesis.md` · an agent file restates the leaf contract again; the no-restatement test must fail · acceptance-sha256:a63faa932568fbfada12dc6d75e81a07615ed1291c93b36ccfe6cbcc854207e3 · covers:agent files do not restate the leaf contract
- 2026-10-12 · 25a7e319* · mutant killed · exit 1 · `plugin/workflows/review-ring.js` · the fixer prompt loses its publish prohibition; the editing-role test must fail · acceptance-sha256:a63faa932568fbfada12dc6d75e81a07615ed1291c93b36ccfe6cbcc854207e3 · covers:every editing role forbids publishing
- 2026-10-12 · 25a7e319* · mutant killed · exit 1 · `plugin/agents/qh-narrow-fixer.md` · the editing agent loses its publish prohibition; the editing-role test must fail · acceptance-sha256:a63faa932568fbfada12dc6d75e81a07615ed1291c93b36ccfe6cbcc854207e3 · covers:every editing role forbids publishing

## Invariants

- `subagentContract` and its golden (`tests/goldens/other-events.json:22`) are unchanged.
- The locked substrings stay in the workflow prompts: `read-only REVIEWER and a leaf role` and `narrowly scoped FIXER and a leaf role` (`tests/workflows.test.mjs:85-86`), `read-only leaf role` (`:114`), `read-only leaf reviewer` (`:144`).
- Every editing role keeps an explicit publish prohibition: `qh-narrow-fixer.md`, review-ring's fixer prompt (`review-ring.js:116`) and the execution skill (`:46`). Neither `subagentContract` nor ADR-060's reviewer guard covers an editing role.
- The review skill's routing section still points at quality-policy and does not load it (`tests/routing.test.mjs`, "the coordinator loads quality-policy and a delegated reviewer does not", locked by ADR-057).
- Relock cost: zero. Locks counted with `python3 scripts/test-locks.py` on 2026-10-12: 17 on `tests/workflows.test.mjs` (ADR-057 T3), 15 on `tests/routing.test.mjs` (ADR-057 T1, T2, T4), the `SubagentStart` tests in `tests/lifecycle.test.mjs` (ADR-068 T2), 0 on `tests/host-review.test.mjs` and `tests/hook-goldens.test.mjs`; no locked body is edited.

## Risks

- A mirror is edited alone: the first test fails on any difference.
- An adopter's caller reads review-ring's `minors`: none in this repository; named in the parent record's Wiring.

## Stop Condition

Stop and ask if S2 shows a workflow's `agent()` receives no `SubagentStart` contract (the workflow prompts then keep their rules, and
the record's Decision 2 is amended first), or if any locked test body would have to change.

## Out of Scope

- The `CODEX-*-LEAF:` markers' wording (T1 keeps them; they guard recursion, which `SubagentStart` cannot)
- What a review checks beyond the blocking criteria (the review skill's passes)

## Verification Log
- 2026-10-12 · 25a7e319* · exit 1 · `out=$(node --test --test-reporter=tap tests/review-contract.test.mjs tests/workflows.test.mjs tests/host-review.test.mjs tests/hook-goldens.test.mjs 2>&1) \ …` · acceptance-sha256:a63faa932568fbfada12dc6d75e81a07615ed1291c93b36ccfe6cbcc854207e3 · ms:15646 · test-lock-sha256:ab008d20f8c784f1fe95206aa0323546426f2ccebab4dd2830e849ebec36dc09 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcmV2aWV3LWNvbnRyYWN0LnRlc3QubWpzCWEgd29ya2Zsb3cgcHJvbXB0IGtlZXBzIG9uZSByb2xlIHNlbnRlbmNlIGFuZCBubyByZXN0YXRlZCBydWxlcwk4MGEzNjdhMDBhYWYxNTllY2YwNjllZWExYzlkYjZlYjA5ZTU1NWU2OGM2ODhhYzU2Y2NiNjZhYmY4MzNhYzU1CmJvZHkJdGVzdHMvcmV2aWV3LWNvbnRyYWN0LnRlc3QubWpzCWV2ZXJ5IGVkaXRpbmcgcm9sZSBrZWVwcyBhbiBleHBsaWNpdCBwdWJsaXNoIHByb2hpYml0aW9uCWRkY2MyNzU2Yzk4MWQ1MjAyNjM3ZDVkNjg0ZjU1MjQxY2Q2NzdkYzI5N2RkZTM0M2M3MDc4YmJmYWZiOGM3MTcKYm9keQl0ZXN0cy9yZXZpZXctY29udHJhY3QudGVzdC5tanMJZXZlcnkgcmV2aWV3IHNjaGVtYSBzYXlzIGJsb2NraW5nIG9yIGFkdmlzb3J5CWQxNGZiNzU1OTllNTE0NDU4ODI4MWI0NDdlNGQ3NDNhYzA1Y2IyMjU1NzVlYTc0OWY5MTQzYTQ0N2FiMjQ2OTkKYm9keQl0ZXN0cy9yZXZpZXctY29udHJhY3QudGVzdC5tanMJbm8gYWdlbnQgZmlsZSByZXN0YXRlcyB0aGUgbGVhZiBjb250cmFjdCB0aGUgU3ViYWdlbnRTdGFydCBob29rIGdpdmVzCTk4MDBiYjdhNTcxNDk0Zjk5ZTgzM2NlYWFhMTIzNDYxYWUxODMwYmUzMmNhZjA2YTMyMGEyNDhjNThjMTk4ZmIKYm9keQl0ZXN0cy9yZXZpZXctY29udHJhY3QudGVzdC5tanMJdGhlIGJsb2NraW5nIGNyaXRlcmlhIGhhdmUgb25lIGRlZmluaXRpb24gYW5kIGV2ZXJ5IG1pcnJvciBpcyBpdHMgdGV4dAlmODAzYjI2OWJiOThjYzJjZDgzNmY1ZGU1ZTdkNGY2OTZlZDA3YjkzZWQ5YTYyZGJjMDVjMjdmZDE0YWMwNzdmCmJvZHkJdGVzdHMvcmV2aWV3LWNvbnRyYWN0LnRlc3QubWpzCXRoZSBjYW5vbmljYWwgYmxvY2tpbmcgYmxvY2sgaXMgZGVmaW5pdGlvbiBBCWNmNDgyODYyMDU4MzY4NjM5ZDMwZWI1ZTdkMDk3MDAyNmEyNjkxZDMxY2I4NTdkY2UxMDU1OTQxYmU2ZTIwMTY
  ```
  ```
- 2026-10-12 · 25a7e319* · exit 0 · `out=$(node --test --test-reporter=tap tests/review-contract.test.mjs tests/workflows.test.mjs tests/host-review.test.mjs tests/hook-goldens.test.mjs 2>&1) \ …` · acceptance-sha256:a63faa932568fbfada12dc6d75e81a07615ed1291c93b36ccfe6cbcc854207e3 · ms:15605
- 2026-10-12 · 25a7e319* · exit 0 · `out=$(node --test --test-reporter=tap tests/review-contract.test.mjs tests/workflows.test.mjs tests/host-review.test.mjs tests/hook-goldens.test.mjs 2>&1) \ …` · acceptance-sha256:a63faa932568fbfada12dc6d75e81a07615ed1291c93b36ccfe6cbcc854207e3 · ms:15772
- 2026-10-12 · 25a7e319* · exit 0 · `out=$(node --test --test-reporter=tap tests/review-contract.test.mjs tests/workflows.test.mjs tests/host-review.test.mjs tests/hook-goldens.test.mjs 2>&1) \ …` · acceptance-sha256:a63faa932568fbfada12dc6d75e81a07615ed1291c93b36ccfe6cbcc854207e3 · ms:16281
- 2026-10-12 · 25a7e319* · exit 0 · `out=$(node --test --test-reporter=tap tests/review-contract.test.mjs tests/workflows.test.mjs tests/host-review.test.mjs tests/hook-goldens.test.mjs 2>&1) \ …` · acceptance-sha256:a63faa932568fbfada12dc6d75e81a07615ed1291c93b36ccfe6cbcc854207e3 · ms:16186
- 2026-10-12 · 25a7e319* · exit 0 · `out=$(node --test --test-reporter=tap tests/review-contract.test.mjs tests/workflows.test.mjs tests/host-review.test.mjs tests/hook-goldens.test.mjs 2>&1) \ …` · acceptance-sha256:a63faa932568fbfada12dc6d75e81a07615ed1291c93b36ccfe6cbcc854207e3 · ms:22639
- 2026-10-12 · 25a7e319* · exit 0 · `out=$(node --test --test-reporter=tap tests/review-contract.test.mjs tests/workflows.test.mjs tests/host-review.test.mjs tests/hook-goldens.test.mjs 2>&1) \ …` · acceptance-sha256:a63faa932568fbfada12dc6d75e81a07615ed1291c93b36ccfe6cbcc854207e3 · ms:17713
- 2026-10-12 · 25a7e319* · exit 0 · `out=$(node --test --test-reporter=tap tests/review-contract.test.mjs tests/workflows.test.mjs tests/host-review.test.mjs tests/hook-goldens.test.mjs 2>&1) \ …` · acceptance-sha256:a63faa932568fbfada12dc6d75e81a07615ed1291c93b36ccfe6cbcc854207e3 · ms:16592
- 2026-10-12 · human-observed · S2 observed 2026-10-12 in this session: a shipped Workflow's four agent() roles each received the SubagentStart hook text beginning 'QUALITY CONTRACT — you are a leaf role' (2 occurrences in each of the four agent transcripts of workflow run wf_b3182079-c79); the workflow prompts therefore drop the restated rules
- 2026-10-12 · human-observed · S5 observed 2026-10-12 after the edits: the definition-phrase grep of ADR-098 Context item 2 (git grep -n -i -E over its four phrases, -- plugin) printed 4 lines, the canonical block and its 3 mirrors, down from 7; git grep -n -i -E "leaf (role|reviewer)|read-only leaf|-LEAF:|you are a leaf|a leaf role" -- plugin printed 18 lines in 11 files, down from 22 in 15; every surviving line matches a kept or reduced row of the disposition table
- 2026-10-12 · 25a7e319* · exit 0 · `out=$(node --test --test-reporter=tap tests/review-contract.test.mjs tests/workflows.test.mjs tests/host-review.test.mjs tests/hook-goldens.test.mjs 2>&1) \ …` · acceptance-sha256:a63faa932568fbfada12dc6d75e81a07615ed1291c93b36ccfe6cbcc854207e3 · ms:31825
