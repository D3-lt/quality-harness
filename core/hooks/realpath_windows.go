//go:build windows

package hooks

import (
	"strings"
	"syscall"
	"unsafe"
)

var procGetFinalPathNameByHandleW = syscall.NewLazyDLL("kernel32.dll").NewProc("GetFinalPathNameByHandleW")

// nativeRealpath is libuv's uv_fs_realpath, which Node's realpathSync.native calls: the final path of a handle opened on the
// path, so a junction and an 8.3 name resolve as they do for Node. filepath.EvalSymlinks has not followed a junction since
// Go 1.23, and the Windows job showed the cost: an edit through a junctioned checkout got no decision context
// (land/2a2cdf3a, run 41455681278).
func nativeRealpath(abs string) (string, error) {
	name, err := syscall.UTF16PtrFromString(namespaced(abs))
	if err != nil {
		return "", err
	}
	// The open libuv makes: no access asked, so no share mode can conflict, and backup semantics so a directory opens.
	handle, err := syscall.CreateFile(name, 0, 0, nil, syscall.OPEN_EXISTING,
		syscall.FILE_ATTRIBUTE_NORMAL|syscall.FILE_FLAG_BACKUP_SEMANTICS, 0)
	if err != nil {
		return "", err
	}
	defer syscall.CloseHandle(handle)
	buf := make([]uint16, syscall.MAX_PATH)
	for {
		// VOLUME_NAME_DOS (0); a buffer too small answers the size it needs, the NUL included.
		n, _, callErr := procGetFinalPathNameByHandleW.Call(uintptr(handle), uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)), 0)
		if n == 0 {
			return "", callErr
		}
		if int(n) < len(buf) {
			buf = buf[:n]
			break
		}
		buf = make([]uint16, n)
	}
	final := syscall.UTF16ToString(buf)
	switch {
	case strings.HasPrefix(final, `\\?\UNC\`):
		return `\\` + final[8:], nil
	case strings.HasPrefix(final, `\\?\`):
		return final[4:], nil
	}
	// libuv answers EINVAL for any other prefix.
	return "", syscall.EINVAL
}

// namespaced is Node's path.toNamespacedPath on an absolute path, which fs.realpathSync.native applies before libuv sees it:
// a drive path gains `\\?\`, a UNC path becomes `\\?\UNC\`, and one already namespaced, or a device path, is left alone
// but for a trailing separator, which Node's path.resolve drops first. So `\\?\C:\` opens the volume, not its root
// directory, and fails as Node's EISDIR does; kept, it answered `C:\` (BACKLOG §446, measured on Windows 11 at 4c0be0f8).
// A drive or UNC path keeps its trailing separator: the final path is the same with or without it (the same run).
func namespaced(abs string) string {
	if len(abs) <= 2 {
		return abs
	}
	if abs[0] == '\\' && abs[1] == '\\' {
		if abs[2] != '?' && abs[2] != '.' {
			return `\\?\UNC\` + abs[2:]
		}
		if len(abs) > 4 && strings.HasSuffix(abs, `\`) {
			return abs[:len(abs)-1]
		}
		return abs
	}
	if isASCIILetter(rune(abs[0])) && abs[1] == ':' && abs[2] == '\\' {
		return `\\?\` + abs
	}
	return abs
}
