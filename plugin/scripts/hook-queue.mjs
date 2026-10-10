// The actions a hook has decided to take but not yet delivered. Judges queue; the dispatcher delivers once, as one
// composed answer (ADR-060 T1). Moved out of lifecycle.mjs unchanged (BACKLOG section 375, stage B3): it is the one
// piece of module state the rules share, so it has a module of its own and nothing else in it.

// Rule actions a hook collects; main() delivers them with any legacy output in one
// composed result (ADR-060 T1's deliver).
export const pendingActions = []

export function queueAction(action) {
  pendingActions.push(action)
}
