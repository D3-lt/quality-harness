//go:build windows

package hooks

import "os"

// fileInode is 0 on Windows, as plugin/scripts/said-per-context.mjs reads it there, so the two twins key one cache alike;
// the identity's other half, the first record's digest, still tells a replaced transcript.
func fileInode(os.FileInfo) uint64 { return 0 }
