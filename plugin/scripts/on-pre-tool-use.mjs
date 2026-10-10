// PreToolUse: the reviewer guard for a role spawned read-only (ADR-060), the decisions that govern a file about to be edited,
// and the publish rule for a command that names commit or push (ADR-061, ADR-081). Moved out of lifecycle.mjs unchanged
// (BACKLOG section 375, stage D).
import { SHELL_TOOLS, mentionsCommitOrPush, publishUnchecked, readOnlyRole, readOnlyVerdict } from './publish-verdict.mjs'
import { MUTATION_TOOLS } from './hook-record.mjs'
import { emitJson } from './hook-queue.mjs'
import { decisionContextFor } from './session-orientation.mjs'
import { artifactRule } from './artifact-pass.mjs'

export async function onPreToolUse(input, recorded) {
  // A read-only role is read-only by contract, and the contract is checked HERE
  // — in the plugin-level hook, which does run inside a subagent (BACKLOG
  // §135). The same guard declared in the agents' own frontmatter was measured
  // inert on a real box: a qh-correctness-reviewer ran `sed -i` on a tracked
  // file and no hook was called. `agent_type` is what the payload carries
  // inside a subagent, so the role is read from it; the verdict is the guard's.
  if (readOnlyRole(input.agent_type) && (SHELL_TOOLS.has(input.tool_name) || MUTATION_TOOLS.has(input.tool_name))) {
    const reason = readOnlyVerdict(input)
    if (reason) {
      emitJson({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `quality-harness reviewer guard (${readOnlyRole(input.agent_type)}): ${reason}`,
        },
      })
      process.stderr.write(`quality-harness reviewer guard: ${reason}\n`)
      return
    }
  }
  // What has already been decided about this file. Not a finding — there is
  // nothing to fix and nothing to answer for; it is the one thing the corpus
  // knows that the code does not say, handed over at the moment it applies.
  if (MUTATION_TOOLS.has(input.tool_name)) {
    const context = decisionContextFor(input)
    if (context) {
      emitJson({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: context,
        },
      })
    }
    return
  }
  // No branch guard. This harness is about the quality of a project's records
  // and the evidence behind them, not about how anyone uses git — the agent
  // already knows git, and a repository that wants a branch policy states it
  // in CLAUDE.md, where a human wrote it. Told plainly on 2026-08-26 after the
  // guard fired on a command whose FIRST act was `git switch -c task/…`, the
  // very escape it was demanding.
  if (!SHELL_TOOLS.has(input.tool_name)) return
  if (!mentionsCommitOrPush(input.tool_input?.command)) return
  // `recorded` is the publish request, or the prepared-but-unlogged mention
  // (recordHookEvent). The artifact gate is a publish-time check with a
  // publish-time budget: a mention publishes nothing and gets none of it — a
  // peer measured 12 KB of adr-lint findings on a grep before this (2026-09-23).
  publishUnchecked(input, recorded)
  if (recorded?.event === 'publish.requested') await artifactRule(input, recorded)
}
