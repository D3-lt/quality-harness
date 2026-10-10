// SubagentStart: the leaf-role contract a subagent is handed. Moved out of lifecycle.mjs unchanged (BACKLOG section 375,
// stage D). It never blocks.
import { emitJson } from './hook-queue.mjs'
import { subagentContract } from './completion-rules.mjs'

export function onSubagentStart(input, recorded) {
  emitJson({
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
      additionalContext: subagentContract(input),
    },
  })
}
