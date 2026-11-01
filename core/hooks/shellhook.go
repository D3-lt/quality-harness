// ADR-136 T1: the shell-hook runner's helpers, ported from plugin/scripts/run-shell-hook.mjs (normalizeHookPayload,
// hookFilePathFromPayload, hookArguments, resolveBashExecutable, shellHookTimeoutMs, shellRuntimeCrashed, persistedEventPath)
// and plugin/scripts/uninteresting.mjs (relativePathIsUninteresting). tests/shell-hook-parity.test.mjs runs both on the same
// rows. Every platform question is a parameter, so the win32 branches answer on any host (CLAUDE.md §7); path.win32 and
// path.posix are written out here rather than borrowed from path/filepath, whose answer depends on the host.
package hooks

import (
	"errors"
	"math"
	"math/big"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

var shkPathKeys = map[string]bool{"cwd": true, "file_path": true, "notebook_path": true, "filePath": true}

const shkDefaultTimeoutMs = 110_000

func shkASCIILetter(c byte) bool { return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') }

// shkWindowsPathForBash is windowsPathForBash: `C:\x` becomes `C:/x` and `\\server\share` becomes `//server/share`, the
// spellings a bash gate can read.
func shkWindowsPathForBash(value string) string {
	if len(value) >= 3 && shkASCIILetter(value[0]) && value[1] == ':' && value[2] == '\\' {
		return strings.ReplaceAll(value, `\`, "/")
	}
	if strings.HasPrefix(value, `\\`) {
		return "//" + strings.ReplaceAll(value[2:], `\`, "/")
	}
	return value
}

// shkArrayIndex is whether a key is an array index, which a JavaScript object lists first, in ascending order, whatever
// order JSON.parse met it in.
func shkArrayIndex(key string) (uint64, bool) {
	if key == "" || len(key) > 10 || (len(key) > 1 && key[0] == '0') {
		return 0, false
	}
	for i := 0; i < len(key); i++ {
		if key[i] < '0' || key[i] > '9' {
			return 0, false
		}
	}
	n, _ := strconv.ParseUint(key, 10, 64)
	return n, n < 1<<32-1
}

// shkJSKeys is the order Object.entries lists an object's keys in.
func shkJSKeys(o *Obj) []string {
	var indexes, rest []string
	for _, k := range o.Keys() {
		if _, ok := shkArrayIndex(k); ok {
			indexes = append(indexes, k)
		} else {
			rest = append(rest, k)
		}
	}
	sort.Slice(indexes, func(i, j int) bool {
		a, _ := shkArrayIndex(indexes[i])
		b, _ := shkArrayIndex(indexes[j])
		return a < b
	})
	return append(indexes, rest...)
}

// shkNormalizePathValues is normalizePathValues: a string under a path key is rewritten on win32, at any depth; an array's
// items are visited with no key, so a string directly in an array is never rewritten.
func shkNormalizePathValues(value any, platform, key string) any {
	switch v := value.(type) {
	case string:
		if platform == "win32" && shkPathKeys[key] {
			return shkWindowsPathForBash(v)
		}
		return v
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = shkNormalizePathValues(item, platform, "")
		}
		return out
	case *Obj:
		out := O()
		for _, k := range shkJSKeys(v) {
			out.Set(k, shkNormalizePathValues(v.Get(k), platform, k))
		}
		return out
	}
	return value
}

// shkNormalizeHookPayload is normalizeHookPayload: on win32 the payload's path values are rewritten for bash and the payload
// re-serialized; anything else, or a payload that is not JSON, is handed on as it came.
func shkNormalizeHookPayload(raw, platform string) string {
	if platform != "win32" {
		return raw
	}
	parsed, err := parseJSON(raw)
	if err != nil {
		return raw
	}
	return stringify(shkNormalizePathValues(parsed, platform, ""))
}

func shkParsedHookPayload(raw, platform string) any {
	parsed, err := parseJSON(raw)
	if err != nil {
		return nil
	}
	return shkNormalizePathValues(parsed, platform, "")
}

// shkHookFilePathFromPayload is hookFilePathFromPayload: tool_input.file_path ?? tool_input.notebook_path ??
// tool_response.filePath, and only a non-empty string answers. The chain is nullish: an empty string or a 0 stops it.
func shkHookFilePathFromPayload(raw, platform string) (string, bool) {
	payload := shkParsedHookPayload(raw, platform)
	candidate := dig(payload, "tool_input", "file_path")
	if nullish(candidate) {
		candidate = dig(payload, "tool_input", "notebook_path")
	}
	if nullish(candidate) {
		candidate = dig(payload, "tool_response", "filePath")
	}
	s, ok := candidate.(string)
	return s, ok && s != ""
}

// shkHookArguments is hookArguments: each hook script's argv, and an error for a script whose arguments nobody wired, since
// a gate handed no file exits 0.
func shkHookArguments(scriptName, raw, platform string) ([]string, error) {
	payload := shkParsedHookPayload(raw, platform)
	filePath, _ := shkHookFilePathFromPayload(raw, platform)
	switch scriptName {
	case "facts-gate-dispatch.sh":
		return []string{filePath, strOr(get(payload, "hook_event_name"))}, nil
	case "post-edit-check.sh":
		return []string{strOr(get(payload, "tool_name")), filePath}, nil
	}
	return nil, errors.New("quality-harness: " + scriptName + " is in HOOK_SCRIPTS but hookArguments does not build its arguments")
}

// shkStubDirectory is /[\\/](?:system32|windowsapps)[\\/]?$/i, folded over ASCII only as JavaScript folds without the u
// flag (Go's (?i) would also fold ſ to s).
func shkStubDirectory(directory string) bool {
	d := directory
	if d != "" && (d[len(d)-1] == '\\' || d[len(d)-1] == '/') {
		d = d[:len(d)-1]
	}
	for _, name := range []string{"system32", "windowsapps"} {
		n := len(name)
		if len(d) > n && (d[len(d)-n-1] == '\\' || d[len(d)-n-1] == '/') && shkASCIIFold(d[len(d)-n:]) == name {
			return true
		}
	}
	return false
}

func shkASCIIFold(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + 'a' - 'A'
		}
	}
	return string(b)
}

// shkResolveBash is resolveBashExecutable: CLAUDE_CODE_GIT_BASH_PATH, then each PATH directory but the System32 and
// WindowsApps stubs, then Git's install roots; false where none exists. env answers as a lookup (os.LookupEnv in use) and
// exists as the file test, so the win32 branch runs on any host.
func shkResolveBash(platform string, env func(string) (string, bool), exists func(string) bool) (string, bool) {
	if platform != "win32" {
		return "bash", true
	}
	if configured, _ := env("CLAUDE_CODE_GIT_BASH_PATH"); configured != "" {
		return configured, true
	}
	searchPath, ok := env("PATH")
	if !ok {
		searchPath, _ = env("Path")
	}
	for _, raw := range strings.Split(searchPath, ";") {
		directory := strings.TrimSuffix(strings.TrimPrefix(jsTrim(raw), `"`), `"`)
		if directory == "" || shkStubDirectory(directory) {
			continue
		}
		if candidate := shkWin32Join(directory, "bash.exe"); exists(candidate) {
			return candidate, true
		}
	}
	or := func(key, fallback string) string {
		if v, _ := env(key); v != "" {
			return v
		}
		return fallback
	}
	drive := or("SystemDrive", "C:")
	var roots []string
	if local, _ := env("LOCALAPPDATA"); local != "" {
		roots = append(roots, shkWin32Join(local, "Programs", "Git"))
	}
	roots = append(roots,
		shkWin32Join(or("ProgramFiles", drive+`\Program Files`), "Git"),
		shkWin32Join(or("ProgramFiles(x86)", drive+`\Program Files (x86)`), "Git"))
	for _, root := range roots {
		if candidate := shkWin32Join(root, "bin", "bash.exe"); exists(candidate) {
			return candidate, true
		}
	}
	return "", false
}

var (
	shkDecimal = regexp.MustCompile(`^[+-]?(?:Infinity|(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)$`)
	shkRadix   = regexp.MustCompile(`^0(?:[xX][0-9a-fA-F]+|[oO][0-7]+|[bB][01]+)$`)
)

// shkJSNumber is Number(string).
func shkJSNumber(s string) float64 {
	t := jsTrim(s)
	switch {
	case t == "":
		return 0
	case shkRadix.MatchString(t):
		base := map[byte]int{'x': 16, 'X': 16, 'o': 8, 'O': 8, 'b': 2, 'B': 2}[t[1]]
		n, _ := new(big.Int).SetString(t[2:], base)
		f, _ := new(big.Float).SetInt(n).Float64()
		return f
	case shkDecimal.MatchString(t):
		if strings.HasSuffix(t, "Infinity") {
			if t[0] == '-' {
				return math.Inf(-1)
			}
			return math.Inf(1)
		}
		f, _ := strconv.ParseFloat(t, 64)
		return f
	}
	return math.NaN()
}

// shkShellHookTimeoutMs is shellHookTimeoutMs: QUALITY_HARNESS_SHELL_TIMEOUT_MS when it is a safe integer in 100..110000,
// else 110000.
func shkShellHookTimeoutMs(env func(string) (string, bool)) float64 {
	raw, ok := env("QUALITY_HARNESS_SHELL_TIMEOUT_MS")
	if !ok {
		return shkDefaultTimeoutMs
	}
	configured := shkJSNumber(raw)
	if configured == math.Trunc(configured) && math.Abs(configured) <= 1<<53-1 && configured >= 100 && configured <= shkDefaultTimeoutMs {
		return configured
	}
	return shkDefaultTimeoutMs
}

// shkShellRuntimeCrashed is shellRuntimeCrashed, /^[^\n]{0,80}\[[a-z]+\][^\n]*\*\*\* fatal error[ -]/mi, matched by hand over
// UTF-16 code units: JavaScript's ^ under m starts a line after \r, U+2028 and U+2029 as well as \n, {0,80} counts code
// units, and i folds ASCII only. Go's regexp does none of the three.
func shkShellRuntimeCrashed(stderr string) bool {
	u := utf16.Encode([]rune(stderr))
	for start := 0; start <= len(u); start++ {
		if start > 0 && !shkLineTerminator(u[start-1]) {
			continue
		}
		for q := start; q <= start+80 && q < len(u) && u[q] != '\n'; q++ {
			if u[q] == '[' && shkBannerAt(u, q) {
				return true
			}
		}
	}
	return false
}

func shkLineTerminator(c uint16) bool { return c == '\n' || c == '\r' || c == 0x2028 || c == 0x2029 }

func shkBannerAt(u []uint16, open int) bool {
	r := open + 1
	for r < len(u) && u[r] < utf8.RuneSelf && shkASCIILetter(byte(u[r])) {
		r++
	}
	if r == open+1 || r >= len(u) || u[r] != ']' {
		return false
	}
	const banner = "*** fatal error"
	for t := r + 1; t < len(u) && u[t] != '\n'; t++ {
		if t+len(banner) >= len(u) {
			return false
		}
		matched := true
		for k := 0; k < len(banner) && matched; k++ {
			c := u[t+k]
			if c >= 'A' && c <= 'Z' {
				c += 'a' - 'A'
			}
			matched = c == uint16(banner[k])
		}
		if next := u[t+len(banner)]; matched && (next == ' ' || next == '-') {
			return true
		}
	}
	return false
}

// shkHost is what persistedEventPath reads from the process when its arguments are not absolute: process.cwd(), the
// environment's drive-specific directories (`=D:`), and whether the host is Windows (posix resolution converts a Windows cwd).
type shkHost struct {
	cwd     string
	env     func(string) (string, bool)
	windows bool
}

// shkPersistedEventPath is persistedEventPath: the spelling a path is persisted under, path.win32.resolve on win32 and
// path.posix.resolve elsewhere.
func shkPersistedEventPath(file, cwd, platform string, host shkHost) string {
	if platform == "win32" {
		return shkWin32Resolve(host, cwd, file)
	}
	return shkPosixResolve(host, cwd, file)
}

// shkRelativePathIsUninteresting is relativePathIsUninteresting: a path relative to the root sits under a fixture or
// generated directory, judged by its directory components; one that climbs out of the root is not.
func shkRelativePathIsUninteresting(relative string) bool {
	var parts []string
	for _, part := range strings.FieldsFunc(relative, func(r rune) bool { return r == '/' || r == '\\' }) {
		parts = append(parts, part)
	}
	if len(parts) > 0 && parts[0] == ".." {
		return false
	}
	if len(parts) == 0 {
		return false
	}
	return listedUnderUninterestingDirectory(parts[:len(parts)-1])
}

func shkWinSep(c byte) bool   { return c == '/' || c == '\\' }
func shkPosixSep(c byte) bool { return c == '/' }

// shkAt is charCodeAt for the ASCII questions these functions ask: 0 (no separator, no letter) past the end.
func shkAt(s string, i int) byte {
	if i < 0 || i >= len(s) {
		return 0
	}
	return s[i]
}

var shkReservedNames = map[string]bool{
	"CON": true, "PRN": true, "AUX": true, "NUL": true,
	"COM1": true, "COM2": true, "COM3": true, "COM4": true, "COM5": true, "COM6": true, "COM7": true, "COM8": true, "COM9": true,
	"LPT1": true, "LPT2": true, "LPT3": true, "LPT4": true, "LPT5": true, "LPT6": true, "LPT7": true, "LPT8": true, "LPT9": true,
	"COM\u00b9": true, "COM\u00b2": true, "COM\u00b3": true, "LPT\u00b9": true, "LPT\u00b2": true, "LPT\u00b3": true,
}

// shkReservedName is isWindowsReservedName(path, colonIndex). A colonIndex of -1 is slice(0, -1): every code unit but the
// last, so a path ending in an astral character keeps half of it and names no device.
func shkReservedName(path string, colonIndex int) bool {
	var part string
	if colonIndex < 0 {
		if path == "" {
			return false
		}
		last, size := utf8.DecodeLastRuneInString(path)
		if last >= 0x10000 {
			return false
		}
		part = path[:len(path)-size]
	} else {
		part = path[:colonIndex]
	}
	return shkReservedNames[strings.ToUpper(part)]
}

// shkNormalizeString is path.js normalizeString: resolves . and .. over the separators isSep accepts. Indexes are bytes, not
// code units; every test is on an ASCII byte and every cut is beside one, so the two agree.
func shkNormalizeString(path string, allowAboveRoot bool, separator byte, isSep func(byte) bool) string {
	res := ""
	lastSegmentLength := 0
	lastSlash := -1
	dots := 0
	var code byte
	for i := 0; i <= len(path); i++ {
		if i < len(path) {
			code = path[i]
		} else if isSep(code) {
			break
		} else {
			code = '/'
		}
		if isSep(code) {
			if lastSlash == i-1 || dots == 1 {
				// nothing
			} else if dots == 2 {
				if len(res) < 2 || lastSegmentLength != 2 || res[len(res)-1] != '.' || res[len(res)-2] != '.' {
					if len(res) > 2 {
						lastSlashIndex := len(res) - lastSegmentLength - 1
						if lastSlashIndex == -1 {
							res = ""
							lastSegmentLength = 0
						} else {
							res = res[:lastSlashIndex]
							lastSegmentLength = len(res) - 1 - strings.LastIndexByte(res, separator)
						}
						lastSlash = i
						dots = 0
						continue
					} else if len(res) != 0 {
						res = ""
						lastSegmentLength = 0
						lastSlash = i
						dots = 0
						continue
					}
				}
				if allowAboveRoot {
					if len(res) > 0 {
						res += string(separator) + ".."
					} else {
						res = ".."
					}
					lastSegmentLength = 2
				}
			} else {
				if len(res) > 0 {
					res += string(separator) + path[lastSlash+1:i]
				} else {
					res = path[lastSlash+1 : i]
				}
				lastSegmentLength = i - lastSlash - 1
			}
			lastSlash = i
			dots = 0
		} else if code == '.' && dots != -1 {
			dots++
		} else {
			dots = -1
		}
	}
	return res
}

// shkUNCRoot matches path.js's UNC root scan from index 2: the first part, where the second part starts, and where it ends.
func shkUNCRoot(path string) (first string, last, j int, ok bool) {
	j = 2
	last = j
	for j < len(path) && !shkWinSep(path[j]) {
		j++
	}
	if !(j < len(path) && j != last) {
		return "", 0, 0, false
	}
	first = path[last:j]
	last = j
	for j < len(path) && shkWinSep(path[j]) {
		j++
	}
	if !(j < len(path) && j != last) {
		return "", 0, 0, false
	}
	last = j
	for j < len(path) && !shkWinSep(path[j]) {
		j++
	}
	if !(j == len(path) || j != last) {
		return "", 0, 0, false
	}
	return first, last, j, true
}

// shkWin32Normalize is path.win32.normalize.
func shkWin32Normalize(path string) string {
	n := len(path)
	if n == 0 {
		return "."
	}
	rootEnd := 0
	device, hasDevice := "", false
	isAbsolute := false
	code := path[0]
	if utf16Len(path) == 1 {
		if code == '/' {
			return `\`
		}
		return path
	}
	if shkWinSep(code) {
		isAbsolute = true
		if shkWinSep(shkAt(path, 1)) {
			if first, last, j, ok := shkUNCRoot(path); ok {
				switch {
				case first == "." || first == "?":
					device, hasDevice = `\\`+first, true
					rootEnd = 4
					colonIndex := strings.IndexByte(path, ':')
					possibleDevice := ""
					if colonIndex+1 > 4 {
						possibleDevice = path[4 : colonIndex+1]
					}
					if shkReservedName(possibleDevice, len(possibleDevice)-1) {
						device = `\\?\` + possibleDevice
						rootEnd = 4 + len(possibleDevice)
					}
				case j == n:
					return `\\` + first + `\` + path[last:] + `\`
				default:
					device, hasDevice = `\\`+first+`\`+path[last:j], true
					rootEnd = j
				}
			}
		} else {
			rootEnd = 1
		}
	} else if colonIndex := strings.IndexByte(path, ':'); colonIndex > 0 {
		if shkASCIILetter(code) && colonIndex == 1 {
			device, hasDevice = path[:2], true
			rootEnd = 2
			if n > 2 && shkWinSep(path[2]) {
				isAbsolute = true
				rootEnd = 3
			}
		} else if shkReservedName(path, colonIndex) {
			device, hasDevice = path[:colonIndex+1], true
			rootEnd = colonIndex + 1
		}
	}
	tail := ""
	if rootEnd < n {
		tail = shkNormalizeString(path[rootEnd:], !isAbsolute, '\\', shkWinSep)
	}
	if tail == "" && !isAbsolute {
		tail = "."
	}
	if tail != "" && shkWinSep(path[n-1]) {
		tail += `\`
	}
	if !isAbsolute && !hasDevice && strings.Contains(path, ":") {
		// CVE-2024-36139: a relative tail must not come out reading as a drive.
		if len(tail) >= 2 && shkASCIILetter(tail[0]) && tail[1] == ':' {
			return `.\` + tail
		}
		for index := strings.IndexByte(path, ':'); index != -1; {
			if index == n-1 || shkWinSep(path[index+1]) {
				return `.\` + tail
			}
			next := strings.IndexByte(path[index+1:], ':')
			if next == -1 {
				break
			}
			index += 1 + next
		}
	}
	if shkReservedName(path, strings.IndexByte(path, ':')) {
		return `.\` + device + tail
	}
	if !hasDevice {
		if isAbsolute {
			return `\` + tail
		}
		return tail
	}
	if isAbsolute {
		return device + `\` + tail
	}
	return device + tail
}

// shkWin32Join is path.win32.join.
func shkWin32Join(args ...string) string {
	var parts []string
	for _, a := range args {
		if a != "" {
			parts = append(parts, a)
		}
	}
	if len(parts) == 0 {
		return "."
	}
	firstPart := parts[0]
	joined := strings.Join(parts, `\`)
	needsReplace := true
	slashCount := 0
	if shkWinSep(shkAt(firstPart, 0)) {
		slashCount++
		if len(firstPart) > 1 && shkWinSep(firstPart[1]) {
			slashCount++
			if len(firstPart) > 2 {
				if shkWinSep(firstPart[2]) {
					slashCount++
				} else {
					needsReplace = false
				}
			}
		}
	}
	if needsReplace {
		for slashCount < len(joined) && shkWinSep(joined[slashCount]) {
			slashCount++
		}
		if slashCount >= 2 {
			joined = `\` + joined[slashCount:]
		}
	}
	for _, p := range strings.Split(joined, `\`) {
		if colonIndex := strings.IndexByte(p, ':'); p != "" && colonIndex != -1 && shkReservedName(p, colonIndex) {
			return strings.ReplaceAll(joined, "/", `\`)
		}
	}
	return shkWin32Normalize(joined)
}

// shkWin32Resolve is path.win32.resolve(...args) for two or more arguments (its no-argument fast path is not reachable here).
func shkWin32Resolve(host shkHost, args ...string) string {
	resolvedDevice := ""
	resolvedTail := ""
	resolvedAbsolute := false
	for i := len(args) - 1; i >= -1; i-- {
		var path string
		if i >= 0 {
			path = args[i]
			if path == "" {
				continue
			}
		} else if resolvedDevice == "" {
			path = host.cwd
		} else {
			path, _ = host.env("=" + resolvedDevice)
			if path == "" {
				path = host.cwd
			}
			if strings.ToLower(shkUnits(path, 0, 2)) != strings.ToLower(resolvedDevice) && shkUnits(path, 2, 3) == `\` {
				path = resolvedDevice + `\`
			}
		}
		n := len(path)
		rootEnd := 0
		device := ""
		isAbsolute := false
		code := shkAt(path, 0)
		if utf16Len(path) == 1 {
			if shkWinSep(code) {
				rootEnd = 1
				isAbsolute = true
			}
		} else if shkWinSep(code) {
			isAbsolute = true
			if shkWinSep(shkAt(path, 1)) {
				if first, last, j, ok := shkUNCRoot(path); ok {
					if first != "." && first != "?" {
						device = `\\` + first + `\` + path[last:j]
						rootEnd = j
					} else {
						device = `\\` + first
						rootEnd = 4
					}
				}
			} else {
				rootEnd = 1
			}
		} else if shkASCIILetter(code) && shkAt(path, 1) == ':' {
			device = path[:2]
			rootEnd = 2
			if n > 2 && shkWinSep(path[2]) {
				isAbsolute = true
				rootEnd = 3
			}
		}
		if device != "" {
			if resolvedDevice != "" {
				if strings.ToLower(device) != strings.ToLower(resolvedDevice) {
					continue
				}
			} else {
				resolvedDevice = device
			}
		}
		if resolvedAbsolute {
			if resolvedDevice != "" {
				break
			}
		} else {
			resolvedTail = path[rootEnd:] + `\` + resolvedTail
			resolvedAbsolute = isAbsolute
			if isAbsolute && resolvedDevice != "" {
				break
			}
		}
	}
	resolvedTail = shkNormalizeString(resolvedTail, !resolvedAbsolute, '\\', shkWinSep)
	if resolvedAbsolute {
		return resolvedDevice + `\` + resolvedTail
	}
	if out := resolvedDevice + resolvedTail; out != "" {
		return out
	}
	return "."
}

// shkUnits is String.prototype.slice(from, to) over UTF-16 code units.
func shkUnits(s string, from, to int) string {
	u := utf16.Encode([]rune(s))
	if from > len(u) {
		from = len(u)
	}
	if to > len(u) {
		to = len(u)
	}
	return string(utf16.Decode(u[from:to]))
}

// shkPosixCwd is posixCwd: process.cwd(), or on a Windows host that cwd with its separators turned and its drive cut off.
func shkPosixCwd(host shkHost) string {
	if !host.windows {
		return host.cwd
	}
	cwd := strings.ReplaceAll(host.cwd, `\`, "/")
	if i := strings.IndexByte(cwd, '/'); i >= 0 {
		return cwd[i:]
	}
	u := utf16.Encode([]rune(cwd))
	return shkUnits(cwd, len(u)-1, len(u))
}

// shkPosixResolve is path.posix.resolve(...args) for two or more arguments.
func shkPosixResolve(host shkHost, args ...string) string {
	resolvedPath := ""
	resolvedAbsolute := false
	for i := len(args) - 1; i >= 0 && !resolvedAbsolute; i-- {
		if args[i] == "" {
			continue
		}
		resolvedPath = args[i] + "/" + resolvedPath
		resolvedAbsolute = args[i][0] == '/'
	}
	if !resolvedAbsolute {
		cwd := shkPosixCwd(host)
		resolvedPath = cwd + "/" + resolvedPath
		resolvedAbsolute = shkAt(cwd, 0) == '/'
	}
	resolvedPath = shkNormalizeString(resolvedPath, !resolvedAbsolute, '/', shkPosixSep)
	if resolvedAbsolute {
		return "/" + resolvedPath
	}
	if resolvedPath != "" {
		return resolvedPath
	}
	return "."
}
