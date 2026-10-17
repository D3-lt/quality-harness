// A heavy run's lease (plugin/scripts/lease.mjs, ADR-077): the small file a run that burns the machine publishes, so a check
// run beside it can say so. The core takes one where the Node path does, around the detached artifact pass (ADR-110's amended
// Decision 4); the same directory, file name and fields, so either implementation's observer reads the other's lease.
package hooks

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"time"
)

// leaseDir is `$QUALITY_HARNESS_LEASE_DIR`, else one under the OS temp directory.
func leaseDir() string {
	if dir := os.Getenv("QUALITY_HARNESS_LEASE_DIR"); dir != "" {
		return dir
	}
	return filepath.Join(os.TempDir(), "quality-harness-leases")
}

type heldLease struct {
	file string
	made bool
}

func randomHex(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// untrusted: the lease directory is used only as a directory of this user's that no one else can write.
func untrusted(dir string) (string, bool, error) {
	_, statErr := os.Lstat(dir)
	made := errors.Is(statErr, fs.ErrNotExist)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", made, err
	}
	found, err := os.Lstat(dir)
	if err != nil {
		return "", made, err
	}
	if found.Mode()&os.ModeSymlink != 0 {
		return dir + " is a symlink", made, nil
	}
	if !found.IsDir() {
		return dir + " is not a directory", made, nil
	}
	if runtime.GOOS != "windows" {
		if refused := foreignOwner(dir, found); refused != "" {
			return refused, made, nil
		}
	}
	return "", made, nil
}

// publish writes the lease to a temporary name, created exclusively, and renames it into place.
func publishLease(file string, lease *Obj) error {
	temp := fmt.Sprintf("%s.%d.%s.tmp", file, os.Getpid(), randomHex(3))
	f, err := os.OpenFile(temp, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	_, werr := f.WriteString(stringify(lease))
	if cerr := f.Close(); werr == nil {
		werr = cerr
	}
	if werr != nil {
		return werr
	}
	// A rename onto a file another process holds open may be refused for a moment on Windows: retried, a growing wait apart.
	for attempt := 1; ; attempt++ {
		err := os.Rename(temp, file)
		if err == nil || attempt >= 8 || !errors.Is(err, fs.ErrPermission) {
			return err
		}
		time.Sleep(time.Duration(25*attempt) * time.Millisecond)
	}
}

// takeLease publishes this run's lease, or answers why it could not.
func takeLease(dir, command, root, state string) (*heldLease, string) {
	for attempt := 1; ; attempt++ {
		refused, made, err := untrusted(dir)
		if err == nil && refused != "" {
			return nil, refused
		}
		if err == nil {
			start := time.Now()
			file := filepath.Join(dir, fmt.Sprintf("%d-%d-%s.json", os.Getpid(), start.UnixMilli(), randomHex(3)))
			lease := O("pid", float64(os.Getpid()), "command", command, "root", resolvePath(root), "start", isoTime(start), "state", state)
			if err = publishLease(file, lease); err == nil {
				return &heldLease{file: file, made: made}, ""
			}
		}
		if errors.Is(err, fs.ErrNotExist) && attempt < 2 {
			continue
		}
		return nil, errCode(err, err.Error()) + " on " + dir
	}
}

// releaseLease removes this run's own lease, and the directory with it when this run made it and it is empty.
func releaseLease(held *heldLease) {
	os.Remove(held.file)
	if held.made {
		os.Remove(filepath.Dir(held.file))
	}
}
