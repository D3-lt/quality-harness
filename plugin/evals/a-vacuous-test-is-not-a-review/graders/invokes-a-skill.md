---
type: tool_used
weight: 2
tool: Skill
---

TRIGGER, and a with-only indicator: the baseline arm has no skill to invoke, so
this is reported rather than scored under ablation.

"Does this test actually test anything" is the question `review` exists for, and
it is the one a test-quality review is named for in its own description. If no
skill fires, none of that text reaches the answer and this case's Δ measures the
base model rather than the plugin.

It is here because its absence was invisible on an earlier case: across thirteen
kept sandboxes both arms reported `skill_calls=0`, and nothing said so, because
the case had no trigger indicator at all.
