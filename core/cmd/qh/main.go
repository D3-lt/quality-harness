// qh is the static core of quality-harness (ADR-110): `qh hook <event>` answers a hook event exactly as
// plugin/scripts/lifecycle.mjs does, `qh check-command <dir>` names the check a directory infers, and `qh --version` names the build.
package main

import (
	"fmt"
	"os"

	"github.com/D3-lt/quality-harness/core/hooks"
)

// version is set at build time with -ldflags "-X main.version=…"; a build without it says so.
var version = "dev"

func main() {
	args := os.Args[1:]
	switch {
	case len(args) == 1 && (args[0] == "--version" || args[0] == "-v"):
		fmt.Printf("qh version %s\n", version)
	case len(args) == 3 && args[0] == "hook" && args[1] == "--artifact-pass":
		// The detached artifact pass a hook started (ADR-080), reading the request it wrote.
		os.Exit(hooks.RunArtifactPass(args[2]))
	case len(args) == 2 && args[0] == "hook":
		// The event is the payload's own hook_event_name, as lifecycle.mjs reads it; the argument names the registration.
		os.Exit(hooks.Run(os.Stdin, os.Stdout, os.Stderr))
	case len(args) >= 2 && args[0] == "bridge":
		os.Exit(hooks.RunBridge(args[1], args[2:]))
	case len(args) == 1 && args[0] == "reviewer-guard":
		os.Exit(hooks.RunReviewerGuard(os.Stdin, os.Stderr))
	case len(args) == 3 && args[0] == "first-mention":
		if !hooks.RecordMention(args[1], args[2]) {
			os.Exit(1)
		}
	case len(args) == 2 && args[0] == "check-command":
		fmt.Println(hooks.CheckCommandJSON(args[1]))
	case len(args) == 1 && args[0] == "mcp":
		// ADR-114 T1: read-only resources over stdio, from the directory it is started in.
		cwd, _ := os.Getwd()
		os.Exit(hooks.ServeMCP(os.Stdin, os.Stdout, cwd))
	default:
		fmt.Fprintln(os.Stderr, "usage: qh hook <event> | qh bridge <branch-state|shell-hook> [args] | qh reviewer-guard | qh first-mention <session> <key> | qh check-command <dir> | qh mcp | qh --version")
		os.Exit(2)
	}
}
