// Families not yet ported. Each says nothing, which is not what the Node path says: the goldens that reach them are red.
package hooks

func (h *hookRun) onPreToolUse(rec *recorded)                   {}
func (h *hookRun) onTurnEnd(rec *recorded)                      {}
func (h *hookRun) importPassVerdicts(channel, recipient string) {}
func (h *hookRun) artifactRule(rec *recorded)                   {}
func containsCommitOrPush(command any) bool                     { return false }
func mentionsCommitOrPush(command any) bool                     { return false }
