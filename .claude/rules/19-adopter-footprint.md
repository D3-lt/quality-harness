---
paths:
  - "plugin/hooks/hooks.json"
  - "plugin/skills/**"
  - "plugin/agents/**"
  - "plugin/scripts/branch-state.mjs"
  - "plugin/scripts/lifecycle.mjs"
---

# Why §19: judge cost from the adopter's session

The rule is in `CLAUDE.md` §19. This file holds the evidence: one owner correction and the measurements
taken because of it.

**2026-10-01.** Asked about the terse notation (`qh1`, BACKLOG §301 Stage 2), a session profiled ITS OWN
transcript. In that 42 MB transcript, instruction files were 14.7% of injected bytes, invoked skill bodies
8.7%, another plugin's recall hook 7.8%, and all of this plugin's hooks together about 4.3%. It then
proposed trimming the owner's global instruction files. The owner answered: *"we are judging here from the
project perspective — and I'm from plugin perspective when it gets installed to a user claude."* Every
item but one in that ranking was this repository's cost, or another project's, not the plugin's.

## What an installed copy sends, measured the same day (macOS, `plugin/` at 8eb438c)

Always on, in every adopter session:

- **The listing.** 15 skills, 4 agents and 3 workflows. Their listing text is 8,869 characters: skills 6,374 + agents
  1,008 + workflows 1,487, re-measured 2026-10-20 at c48dd5b0 (BACKLOG §381 item 24, ADR-119 T4) by counting code points
  in each `plugin/skills/*/SKILL.md` and `plugin/agents/*.md` frontmatter `description` (a folded `>-` value joined with
  spaces) and in each `plugin/workflows/*.js` meta `description` plus `whenToUse`; the 7,422 written here before was
  measured at 8eb438c. It is sent at every session start and again after every compaction, and it is the plugin's largest
  always-on text.
- **SessionStart.** On a fresh repository with no records: `lifecycle.mjs` 0 B in 136 ms;
  `branch-state.mjs` 228 B in 132 ms. On a 78-record corpus: `lifecycle.mjs` 593 B in 842 ms, mostly six
  serial `adr-next` interpreter starts (BACKLOG §325); `branch-state.mjs` 452 B.
- **UserPromptSubmit.** The brief is 271 B when it changes and nothing when it does not; unchanged
  suppression was confirmed on two consecutive prompts in a fresh repository. In this repository's session
  it was sent 176 times and only 436 B of 70 KB was unchanged, because a served-behind brief carries
  "(read Ns ago; refreshing)" and the cap message carries its age. That text differs on every prompt.
- **PreToolUse:Bash, PostToolUse, Stop.** 0 B on ordinary commands in both repositories. 124 B on Stop
  over the corpus, and advice only when a commit or push meets an unchecked tree.

Paid only by the sessions that invoke a skill, and again after each compaction:

- **Skill bodies.** `adr-execute` 26.4 KB, `adr-write` 17.0 KB, `mutation-audit` 17.0 KB, `corpus-chaos`
  15.7 KB, `codex-review` 10.5 KB, `spec-write` 10.3 KB, `work` 10.1 KB; the rest are 2–8 KB. In the profiled
  session, invoked skill bodies from every source totalled 311 KB, more than all hooks combined.

So the levers, in the order an adopter pays them, are the listing text, the per-prompt brief's volatile age,
SessionStart's process starts, and then the largest skill bodies. A terse encoding of hook facts (`qh1`)
reaches only the second and third, which is why its deferral (BACKLOG §301) still holds.
