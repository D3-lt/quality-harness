// qh is the static core of quality-harness (ADR-110): `qh hook <event>` answers a hook event exactly as
// plugin/scripts/lifecycle.mjs does, and `qh --version` names the build.
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
	default:
		fmt.Fprintln(os.Stderr, "usage: qh hook <event> | qh --version")
		os.Exit(2)
	}
}
