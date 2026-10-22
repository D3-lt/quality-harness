//go:build !windows

package hooks

import (
	"os"
	"syscall"
)

// fileInode is a transcript's inode, half of the identity the said-per-context cache is kept under.
func fileInode(info os.FileInfo) uint64 {
	if stat, ok := info.Sys().(*syscall.Stat_t); ok {
		return uint64(stat.Ino)
	}
	return 0
}
