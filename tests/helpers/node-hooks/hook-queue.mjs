// What a hook has decided but not yet said: the actions the rules queue, and the one JSON object the older rules emit. Judges
// queue; the dispatcher delivers once, as one composed answer (ADR-060 T1). Moved out of lifecycle.mjs unchanged (BACKLOG
// section 375, stages B3 and D): it is the module state the rules share, so it has a module of its own and nothing else in it.

// Rule actions a hook collects; main() delivers them with any legacy output in one
// composed result (ADR-060 T1's deliver).
export const pendingActions = []

export function queueAction(action) {
  pendingActions.push(action)
}

// ONE JSON object per run is what Claude Code parses from a hook's stdout, so a rule that has something to say holds it here
// and main() writes it once, composed with the queued actions. The older rules emit through this; the newer queue an action.
let pendingOutput = null
export function emitJson(value) {
  pendingOutput = value
}
export function peekOutput() {
  return pendingOutput
}
export function takeOutput() {
  const out = pendingOutput
  pendingOutput = null
  return out
}
