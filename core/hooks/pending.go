// The native lifecycle delegates corpus resolution to the retained ADR reader CLI.
package hooks

import (
	"path/filepath"
	"time"
)

func decisionContext(file, root string) string {
	if outsideRoot(root, file) || hasDecisionCorpus(trackedPaths(root)) == "false" {
		return ""
	}
	answer := run(10*time.Second, root, nil, "", "node", filepath.Join(pluginRoot(), "scripts", "adr-context.mjs"), "--hook", file)
	if answer.err != nil || answer.status != 0 {
		return "could-not-look: the decision reader could not run, so which decisions govern this edit is unknown."
	}
	return answer.stdout
}
