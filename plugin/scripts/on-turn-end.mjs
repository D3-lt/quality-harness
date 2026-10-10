// Stop, SubagentStop and TaskCompleted: a turn or a task that ends is judged by the completion rules, and the artifact
// pass is asked for (ADR-060, ADR-080). Moved out of lifecycle.mjs unchanged (BACKLOG section 375, stage D).
import { hasBackgroundWork } from './hook-record.mjs'
import { readOnlyRole } from './publish-verdict.mjs'
import { completionRules } from './completion-rules.mjs'
import { artifactRule } from './artifact-pass.mjs'

export async function onTurnEnd(input, recorded) {
  const event = input.hook_event_name
  if (input.stop_hook_active === true || (event === 'Stop' && hasBackgroundWork(input))) return
  // A read-only role's end is R3's to report; the completion rules are about the
  // session's own work, and a reviewer authored none of it.
  if (event === 'SubagentStop' && readOnlyRole(input.agent_type)) return
  completionRules(input, recorded)
  await artifactRule(input, recorded)
}
