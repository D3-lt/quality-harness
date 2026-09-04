---
type: tool_used
weight: 1
tool: Skill
---

TRIGGER. Under `--ablation with-without` a `tool_used: Skill` grader is a
plugin-fired indicator and is NOT part of the score, which is what this is for:
it separates "the skill fired and its instruction did not land" from "no skill
fired at all". Those have opposite fixes — one is the body, the other is the
description — and without this the case cannot tell them apart.
