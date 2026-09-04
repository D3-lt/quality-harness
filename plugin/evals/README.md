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

    CLAUDE_CODE_WALNUT_SPIRE=1 claude plugin eval --runs 1 --allow-tools Bash .

`--allow-tools` is an operator grant and `allowed_tools:` in a case's
frontmatter does not stand in for it. Without the grant a case that instructs
the model to run a script is scored on a model that could not run it, which
looks exactly like the skill failing to mention the script.

The runner defaults to `--ablation with-without`: each case also runs a
no-plugin baseline and reports Δ. That number is the only one worth quoting —
a score without a baseline cannot tell a skill that works from a model that
would have answered well anyway. `tool_used: Skill` becomes a with-only
indicator under ablation rather than part of the score, which is correct: a
baseline arm has no skill to invoke.

Cases are cheap on purpose — `max_turns` is small and `runs: 1` — because a suite
nobody runs is the claim-without-evidence this whole plan exists to remove.

## Every case declares the skill it exercises

`tags: [skill-<name>]` in a case's frontmatter, and `tags: [skill-unattributed]`
when naming a subject would be inventing one. The runner honours the key, so the
declaration doubles as a selector:

    CLAUDE_CODE_WALNUT_SPIRE=1 claude plugin eval --tag skill-review .

It exists because the count was otherwise a guess. BACKLOG §105 published a
coverage table; a grep over the same directories gave a DIFFERENT answer, and
neither was authoritative because nothing declared the mapping — one case's
subject is never named in its own text at all. `tests/evals.test.mjs` computes the
report from the declarations and fails on a case that declares nothing, which is
the state where the count goes back to being a guess (ADR-032).

`skill-unattributed` is a first-class answer, not a backlog. Four of the eight
cases are A/B arms measuring an INSTRUCTION rather than a skill, and one tests a
plugin-wide doctrine; forcing a subject onto them would be the fabricated
observation ADR-005 forbids.

The report ADVISES and never blocks. A threshold on "skills with a case" is met by
writing one thin case per skill, and the gate would then report that as coverage.
Measured 2026-09-04: **3 skills exercised, 11 with no case, 5 unattributed** — and
`work`, the router the lifecycle enters through, is among the uncovered.
