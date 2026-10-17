// The per-session event log and the state directory that holds it: plugin/scripts/event-log.mjs and git-directory.mjs. The
// state directory is `<git-dir>/quality-harness/` inside a repository and `<tmp>/quality-harness/<sha256 of the cwd>/` outside
// one; a row appended here is the row event-log.mjs appends, `at` first.
package hooks

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"
)

// isoNow is `new Date().toISOString()`.
func isoNow() string { return isoTime(time.Now()) }

func isoTime(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }

func isDir(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}

// resolvePath is path.resolve of one path.
func resolvePath(p string) string {
	abs, err := filepath.Abs(p)
	if err != nil {
		return filepath.Clean(p)
	}
	return abs
}

// relPath is path.relative: "" for the same place, `to` itself when there is no relative way there.
func relPath(from, to string) string {
	from, to = resolvePath(from), resolvePath(to)
	if from == to {
		return ""
	}
	rel, err := filepath.Rel(from, to)
	if err != nil {
		return to
	}
	return rel
}

// nearestExistingDirectory is the nearest existing DIRECTORY at or above a path, or "" when none exists.
func nearestExistingDirectory(candidate string) string {
	current := candidate
	for !isDir(current) {
		parent := filepath.Dir(current)
		if parent == current {
			return ""
		}
		current = parent
	}
	return current
}

// canonical resolves a path the way Git spells it, and falls back to the lexical path when it cannot be resolved.
func canonical(candidate string) string {
	resolved, err := filepath.EvalSymlinks(candidate)
	if err != nil {
		return candidate
	}
	if !filepath.IsAbs(resolved) && filepath.IsAbs(candidate) {
		return candidate
	}
	if strings.HasPrefix(resolved, `\\?\UNC\`) {
		return `\\` + resolved[8:]
	}
	if strings.HasPrefix(resolved, `\\?\`) {
		return resolved[4:]
	}
	return resolved
}

// canonicalFile is the ONE spelling a file gets when it is persisted as an event key: its nearest existing ancestor
// canonicalised, the rest re-appended, a symlinked leaf keeping its own name.
func canonicalFile(absolute string) string {
	parent := nearestExistingDirectory(absolute)
	if parent == "" {
		return absolute
	}
	return filepath.Join(canonical(parent), relPath(parent, absolute))
}

var headLine = regexp.MustCompile(`^(?:ref: refs/\S+|[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$`)

func isGitDirectory(directory string) bool {
	st, err := os.Stat(filepath.Join(directory, "HEAD"))
	if err != nil || !st.Mode().IsRegular() {
		return false
	}
	head, err := os.ReadFile(filepath.Join(directory, "HEAD"))
	if err != nil || !headLine.MatchString(strings.TrimSpace(string(head))) {
		return false
	}
	common := directory
	pointer, err := os.ReadFile(filepath.Join(directory, "commondir"))
	if err == nil {
		p := strings.TrimSpace(string(pointer))
		if p == "" {
			return false
		}
		if filepath.IsAbs(p) {
			common = filepath.Clean(p)
		} else {
			common = filepath.Join(directory, p)
		}
	} else if !errors.Is(err, fs.ErrNotExist) {
		return false
	}
	return isDir(filepath.Join(common, "objects")) && isDir(filepath.Join(common, "refs"))
}

var gitdirPointer = regexp.MustCompile(`^gitdir: ([^\r\n]+)\r?\n?$`)

// findGitDir locates Git metadata for a checkout, worktree or bare repository without spawning Git.
func findGitDir(start string) string {
	here := resolvePath(start)
	if real, err := filepath.EvalSymlinks(here); err == nil {
		here = real
	}
	for {
		if isGitDirectory(here) {
			return here
		}
		candidate := filepath.Join(here, ".git")
		st, err := os.Stat(candidate)
		if err != nil && !errors.Is(err, fs.ErrNotExist) && !errors.Is(err, syscall.ENOTDIR) {
			return ""
		}
		if err == nil {
			if st.IsDir() {
				if isGitDirectory(candidate) {
					return candidate
				}
				return ""
			}
			if !st.Mode().IsRegular() {
				return ""
			}
			text, err := os.ReadFile(candidate)
			if err != nil {
				return ""
			}
			m := gitdirPointer.FindStringSubmatch(string(text))
			if m == nil {
				return ""
			}
			target := strings.TrimSpace(m[1])
			if !filepath.IsAbs(target) {
				target = filepath.Join(here, target)
			}
			if isGitDirectory(target) {
				return target
			}
			return ""
		}
		parent := filepath.Dir(here)
		if parent == here {
			return ""
		}
		here = parent
	}
}

func sha256Hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

var stateDirectories = map[string]string{}

// stateDir is where this repository's ledgers live; QUALITY_HARNESS_STATE_DIR is a root each repository keeps its own place under.
func stateDir(cwd string) string { return stateDirSpawn(cwd, true) }

func stateDirSpawn(cwd string, spawn bool) string {
	base := repositoryStateDir(cwd, spawn)
	if override := os.Getenv("QUALITY_HARNESS_STATE_DIR"); override != "" {
		return filepath.Join(resolvePath(override), sha256Hex(base)[:16])
	}
	return base
}

func repositoryStateDir(cwd string, spawn bool) string {
	if cwd == "" {
		cwd, _ = os.Getwd()
	}
	directory := nearestExistingDirectory(resolvePath(cwd))
	key := directory
	if directory == "" {
		key = cwd
	}
	if spawn {
		key += ":true"
	} else {
		key += ":false"
	}
	if kept, ok := stateDirectories[key]; ok {
		return kept
	}
	resolved := ""
	if directory != "" {
		if found := findGitDir(directory); found != "" {
			resolved = filepath.Join(canonical(found), "quality-harness")
		}
		if resolved == "" && spawn {
			run := git(5*time.Second, nil, "-C", directory, "rev-parse", "--absolute-git-dir")
			if run.err == nil && run.status == 0 && strings.TrimSpace(run.stdout) != "" {
				resolved = filepath.Join(canonical(strings.TrimSpace(run.stdout)), "quality-harness")
			}
		}
	}
	if resolved == "" {
		seed := cwd
		if directory != "" {
			seed = canonical(directory)
		}
		resolved = filepath.Join(os.TempDir(), "quality-harness", sha256Hex(seed))
	}
	stateDirectories[key] = resolved
	return resolved
}

var unsafeSessionChars = regexp.MustCompile(`[^A-Za-z0-9._-]`)

func sessionLogFile(cwd, session string) string {
	return filepath.Join(stateDir(cwd), "sessions", unsafeSessionChars.ReplaceAllString(session, "_")+".jsonl")
}

// appendEvent appends `{ at, ...entry }` as one line, on a fresh line whatever the tail. False when it could not.
func appendEvent(cwd string, session any, entry *Obj) bool {
	id, ok := session.(string)
	if !ok || id == "" {
		return false
	}
	file := sessionLogFile(cwd, id)
	if err := os.MkdirAll(filepath.Dir(file), 0o777); err != nil {
		return false
	}
	lead := ""
	if f, err := os.Open(file); err == nil {
		if st, err := f.Stat(); err == nil && st.Size() > 0 {
			last := make([]byte, 1)
			if n, _ := f.ReadAt(last, st.Size()-1); n == 1 && last[0] != '\n' {
				lead = "\n"
			}
		}
		f.Close()
	}
	row := O("at", isoNow())
	for _, k := range entry.keys {
		row.Set(k, entry.vals[k])
	}
	return appendLine(file, lead+stringify(row)+"\n")
}

func appendLine(file, text string) bool {
	f, err := os.OpenFile(file, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o666)
	if err != nil {
		return false
	}
	_, werr := f.WriteString(text)
	cerr := f.Close()
	return werr == nil && cerr == nil
}

// Log is a session log as readEvents returns it: the entries, and whether it was read whole.
type Log struct {
	E        []any
	Complete bool
}

// readEvents reads a session's log; an unreadable log or a torn line is not a complete one.
func readEvents(cwd string, session any) Log {
	id, ok := session.(string)
	if !ok || id == "" {
		return Log{E: []any{}, Complete: true}
	}
	text, err := os.ReadFile(sessionLogFile(cwd, id))
	if err != nil {
		return Log{E: []any{}, Complete: errors.Is(err, fs.ErrNotExist)}
	}
	entries := []any{}
	whole := true
	for _, line := range strings.Split(string(text), "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		v, err := parseJSON(line)
		if err != nil {
			whole = false
			continue
		}
		entries = append(entries, v)
	}
	return Log{E: entries, Complete: whole}
}

const absent = "absent"

const contentIDMaxBytes = 32 * 1024 * 1024

// contentId identifies the bytes of a file: their sha256, "absent" for a path that is not there, nil for one that could not be read.
func contentId(file string) any {
	f, err := os.OpenFile(file, os.O_RDONLY|syscall.O_NONBLOCK, 0)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) || errors.Is(err, syscall.ENOTDIR) {
			return absent
		}
		return nil
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil || !st.Mode().IsRegular() || st.Size() > contentIDMaxBytes {
		return nil
	}
	h := sha256.New()
	n, err := io.Copy(h, io.LimitReader(f, contentIDMaxBytes+1))
	if err != nil || n > contentIDMaxBytes {
		return nil
	}
	return hex.EncodeToString(h.Sum(nil))
}
