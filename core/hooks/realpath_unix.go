//go:build !windows

package hooks

import "path/filepath"

// nativeRealpath is what libuv's uv_fs_realpath answers on unix, realpath(3): every link resolved.
func nativeRealpath(abs string) (string, error) { return filepath.EvalSymlinks(abs) }
