# Behavioural evals

Sixteen thousand words of skill instruction had no behavioural test at all: the
suite checked that every command a skill NAMES resolves and every flag it
instructs is declared, and nothing checked what a model does after reading one.

The facets are [Skill-Use](https://arxiv.org/html/2608.04828)'s — **Trigger**
(is the skill invoked), **Compliance** (is the procedure followed), **Boundary**
(is the forbidden thing avoided) — and the graders are deterministic wherever a
deterministic grader can see the answer. That is not a style preference. This
corpus's whole claim is that a `done` here is worth more than an opinion because
a tool wrote the evidence; scoring the skills that produce it with a model judge
would put the opinion back at the bottom of the stack.

`llm` graders appear only where the question is genuinely about prose.

    CLAUDE_CODE_WALNUT_SPIRE=1 claude plugin eval --runs 1 .

Cases are cheap on purpose — `max_turns` is small and `runs: 1` — because a suite
nobody runs is the claim-without-evidence this whole plan exists to remove.
