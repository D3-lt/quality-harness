// Package catalogcheck asks whether every hooks mutation catalogue entry still type-checks once applied. A Go mutant that does
// not build fails the Node wrapper that names it, and the campaign grades any failing exit RED (scripts/mutate.mjs classify), so a
// compile error reads as a behaviour test's kill. Measured at 4e95a79e: twelve of the 150 hooks entries did not build.
//
// tests/go-catalogue-typecheck.test.mjs selects the entries through mutate.mjs's own loader (loadCatalogue), so the catalogue's
// grammar is read in one place, and hands them here as a list. `go list` names the files this host selects (GoFiles, TestGoFiles)
// and the build-excluded ones, and gives export data for every import. Two builds are checked, as the tests make them: the
// production package (GoFiles alone, which tests/helpers/source-core.mjs builds into the binary) and the test package (GoFiles
// and TestGoFiles, which `go test` builds). An entry in a production file must type-check in both, since a name that exists only
// in a test file is defined in the second and undefined in the first (the Codex review of the guard: bsStubTip for bsNoTags); an
// entry in a test file, in the test package. Each substitution is applied in memory; nothing is written or built per entry. An
// entry in a file this host excludes is counted apart, never as checked. An entry whose text does not match exactly once was never
// applied, so it fails here as it is STALE in the campaign. A package of its own and test-only, so neither the hooks tests nor a
// mutant's wrapper compiles go/types or runs it.
package catalogcheck

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"go/ast"
	"go/importer"
	"go/parser"
	"go/token"
	"go/types"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// entry is one catalogue entry as the wrapper hands it over: where it is (catalogue#n), and the four fields a mutation is.
type entry struct {
	Where string `json:"where"`
	Label string `json:"label"`
	File  string `json:"file"`
	From  string `json:"from"`
	To    string `json:"to"`
}

// checked is one package as the host builds it: its production files, then its test files, parsed; the ones it excludes named.
type checked struct {
	root, dir, importPath string
	fset                  *token.FileSet
	conf                  types.Config
	files                 []*ast.File // production files first, then test files
	production            int         // how many of files are production files
	source                map[string]string
	index                 map[string]int
	excluded              map[string]bool
}

type tally struct {
	entries, checked, failed, excluded, stale int
	findings, staleNotes, excludedNotes       []string
}

// parse reads and parses the files and checks both unmutated builds: a package that does not check as it is judges no entry.
func (c *checked) parse(production, tests []string, read func(string) (string, error)) error {
	c.source, c.index, c.production = map[string]string{}, map[string]int{}, len(production)
	for _, name := range append(append([]string{}, production...), tests...) {
		full := filepath.Join(c.dir, name)
		text, err := read(full)
		if err != nil {
			return err
		}
		file, err := parser.ParseFile(c.fset, full, text, parser.SkipObjectResolution)
		if err != nil {
			return err
		}
		c.index[full], c.source[full] = len(c.files), text
		c.files = append(c.files, file)
	}
	if err := c.builds(true); err != nil {
		return fmt.Errorf("the unmutated package does not type-check: %v", err)
	}
	return nil
}

// builds type-checks the test package and, when asked, the production package alone.
func (c *checked) builds(production bool) error {
	if production {
		if _, err := c.conf.Check(c.importPath, c.fset, c.files[:c.production], nil); err != nil {
			return fmt.Errorf("production build: %s", c.relative(err))
		}
	}
	if _, err := c.conf.Check(c.importPath, c.fset, c.files, nil); err != nil {
		return fmt.Errorf("test build: %s", c.relative(err))
	}
	return nil
}

func (c *checked) relative(err error) string {
	return strings.ReplaceAll(err.Error(), c.root+string(filepath.Separator), "")
}

// check applies each entry's one substitution in memory and type-checks the builds that file is part of. An entry this package
// cannot place is an error, never a skip.
func (c *checked) check(entries []entry) (tally, error) {
	var t tally
	for _, e := range entries {
		t.entries++
		where := fmt.Sprintf("%s %q (%s)", e.Where, e.Label, e.File)
		full := filepath.Join(c.root, filepath.FromSlash(e.File))
		if e.File == "" || e.From == "" || filepath.Dir(full) != c.dir {
			return t, fmt.Errorf("%s: not an entry of the package this check loads", where)
		}
		if c.excluded[full] {
			t.excluded++
			t.excludedNotes = append(t.excludedNotes, "EXCLUDED on "+runtime.GOOS+"/"+runtime.GOARCH+": "+where)
			continue
		}
		i, active := c.index[full]
		if !active {
			return t, fmt.Errorf("%s: the file is neither built nor excluded here, so it cannot be read as part of the package", where)
		}
		if count := strings.Count(c.source[full], e.From); count != 1 {
			t.stale++
			t.staleNotes = append(t.staleNotes, fmt.Sprintf("STALE (matches %d times): %s", count, where))
			continue
		}
		t.checked++
		file, err := parser.ParseFile(c.fset, full, strings.Replace(c.source[full], e.From, e.To, 1), parser.SkipObjectResolution)
		if err == nil {
			original := c.files[i]
			c.files[i] = file
			err = c.builds(i < c.production)
			c.files[i] = original
		}
		if err != nil {
			t.failed++
			t.findings = append(t.findings, where+": "+err.Error())
		}
	}
	return t, nil
}

// loadHooks asks `go list` for the hooks package as this host selects it, and for export data of everything it and its tests
// import.
func loadHooks(root string) (*checked, error) {
	module := filepath.Join(root, "core")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	list := exec.CommandContext(ctx, "go", "list", "-deps", "-test", "-export",
		"-json=ImportPath,Dir,Export,GoFiles,TestGoFiles,XTestGoFiles,IgnoredGoFiles,Module", "./hooks")
	list.Dir = module
	var stderr bytes.Buffer
	list.Stderr = &stderr
	out, err := list.Output()
	if err != nil {
		return nil, fmt.Errorf("go list: %v\n%s", err, stderr.String())
	}
	type listed struct {
		ImportPath, Dir, Export                            string
		GoFiles, TestGoFiles, XTestGoFiles, IgnoredGoFiles []string
		Module                                             *struct{ GoVersion string }
	}
	exports := map[string]string{}
	var hooks *listed
	for decoder := json.NewDecoder(bytes.NewReader(out)); ; {
		var p listed
		if err := decoder.Decode(&p); err == io.EOF {
			break
		} else if err != nil {
			return nil, fmt.Errorf("go list output: %v", err)
		}
		if strings.Contains(p.ImportPath, " [") || strings.HasSuffix(p.ImportPath, ".test") {
			continue // the test variants and the test main; the plain package and its imports are what is checked
		}
		exports[p.ImportPath] = p.Export
		if filepath.Clean(p.Dir) == filepath.Join(module, "hooks") {
			found := p
			hooks = &found
		}
	}
	if hooks == nil {
		return nil, errors.New("go list did not name the hooks package")
	}
	if len(hooks.XTestGoFiles) > 0 {
		return nil, fmt.Errorf("the hooks package has external test files %v, which this check does not load", hooks.XTestGoFiles)
	}
	c := &checked{root: root, dir: filepath.Join(module, "hooks"), importPath: hooks.ImportPath, fset: token.NewFileSet(),
		excluded: map[string]bool{}}
	c.conf = types.Config{
		Importer: importer.ForCompiler(c.fset, "gc", func(path string) (io.ReadCloser, error) {
			if exports[path] == "" {
				return nil, fmt.Errorf("go list gave no export data for %q", path)
			}
			return os.Open(exports[path])
		}),
		Sizes: types.SizesFor("gc", runtime.GOARCH),
	}
	if hooks.Module != nil && hooks.Module.GoVersion != "" {
		c.conf.GoVersion = "go" + hooks.Module.GoVersion
	}
	for _, name := range hooks.IgnoredGoFiles {
		c.excluded[filepath.Join(c.dir, name)] = true
	}
	read := func(path string) (string, error) {
		raw, err := os.ReadFile(path)
		return string(raw), err
	}
	return c, c.parse(hooks.GoFiles, hooks.TestGoFiles, read)
}

// The control: a package of one production file and one test file, in memory. It shows the check passing a compiling edit in each,
// failing the class it exists for (a variable left unused), failing a production edit that names a function only a test file
// defines (the test package builds; the production one does not), counting a zero-match and a many-match entry as STALE and an
// excluded file apart, and refusing an entry it cannot place.
func TestCatalogueCheckControl(t *testing.T) {
	root := filepath.Join(string(filepath.Separator)+"synthetic", "repo")
	c := &checked{root: root, dir: filepath.Join(root, "p"), importPath: "example.invalid/p", fset: token.NewFileSet(),
		excluded: map[string]bool{filepath.Join(root, "p", "b_other.go"): true}}
	sources := map[string]string{
		filepath.Join(c.dir, "a.go"): "package p\n\nfunc f() string {\n\tkept := \"one\"\n\treturn kept\n}\n\n" +
			"var tag = noTags\n\nfunc noTags() string { return \"\" }\n",
		filepath.Join(c.dir, "a_test.go"): "package p\n\nfunc stubTip() string { return \"stub\" }\n\nvar tip = stubTip\n",
	}
	if err := c.parse([]string{"a.go"}, []string{"a_test.go"}, func(path string) (string, error) { return sources[path], nil }); err != nil {
		t.Fatal(err)
	}
	got, err := c.check([]entry{
		{Where: "control#1", Label: "a compiling production edit", File: "p/a.go", From: "\"one\"", To: "\"two\""},
		{Where: "control#2", Label: "a variable left unused", File: "p/a.go", From: "\treturn kept\n", To: "\treturn \"one\"\n"},
		{Where: "control#3", Label: "a production edit naming a test-only function", File: "p/a.go", From: "var tag = noTags", To: "var tag = stubTip"},
		{Where: "control#4", Label: "a compiling test-file edit", File: "p/a_test.go", From: "\"stub\"", To: "\"stubbed\""},
		{Where: "control#5", Label: "a text the file does not hold", File: "p/a.go", From: "return nothing", To: ""},
		{Where: "control#6", Label: "a text the file holds twice", File: "p/a.go", From: "return", To: "return"},
		{Where: "control#7", Label: "a file this host excludes", File: "p/b_other.go", From: "package p", To: "package p"},
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("control: %+v", got)
	if got.entries != 7 || got.checked != 4 || got.failed != 2 || got.stale != 2 || got.excluded != 1 || len(got.findings) != 2 ||
		!strings.Contains(got.findings[0], `"a variable left unused"`) || !strings.Contains(got.findings[0], "declared and not used: kept") ||
		!strings.Contains(got.findings[1], `"a production edit naming a test-only function"`) ||
		!strings.Contains(got.findings[1], "production build: ") || !strings.Contains(got.findings[1], "undefined: stubTip") ||
		!strings.Contains(got.staleNotes[0], "matches 0 times") || !strings.Contains(got.staleNotes[1], "matches 2 times") {
		t.Fatalf("the control was not judged as built: %+v", got)
	}
	if _, err := c.check([]entry{{Where: "control#8", Label: "elsewhere", File: "q/a.go", From: "x", To: "y"}}); err == nil {
		t.Fatal("an entry outside the loaded package was not refused")
	}
}

// QH_CATALOGUE_ENTRIES names the wrapper's list. Unset, as in a plain `go test ./...`, the test skips and says why
// (TestDecisionContextReplay's dcrRows does the same); the wrapper requires its PASS line, so the required run cannot skip.
func TestHooksCatalogueMutantsTypeCheck(t *testing.T) {
	listFile := os.Getenv("QH_CATALOGUE_ENTRIES")
	if listFile == "" {
		t.Skip("QH_CATALOGUE_ENTRIES is unset; tests/go-catalogue-typecheck.test.mjs writes it from scripts/mutate.mjs loadCatalogue")
	}
	raw, err := os.ReadFile(listFile)
	if err != nil {
		t.Fatal(err)
	}
	var entries []entry
	if err := json.Unmarshal(raw, &entries); err != nil || len(entries) == 0 {
		t.Fatalf("the entry list is unreadable or empty (%v): %d entries", err, len(entries))
	}
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	c, err := loadHooks(root)
	if err != nil {
		t.Fatal(err)
	}
	got, err := c.check(entries)
	if err != nil {
		t.Fatal(err)
	}
	for _, note := range got.excludedNotes {
		t.Log(note)
	}
	t.Logf("hooks catalogue entries on %s/%s: %d production and %d test file(s), %d entries: %d checked, %d failed, %d build-excluded here, %d STALE",
		runtime.GOOS, runtime.GOARCH, c.production, len(c.files)-c.production, got.entries, got.checked, got.failed, got.excluded, got.stale)
	if got.stale > 0 {
		t.Errorf("%d catalogue entr(ies) match their file zero or several times, so the campaign never applies them:\n%s",
			got.stale, strings.Join(got.staleNotes, "\n"))
	}
	if got.failed > 0 {
		t.Errorf("%d catalogue mutant(s) do not type-check, so the test that names each would fail on a build error, not on behaviour:\n%s",
			got.failed, strings.Join(got.findings, "\n"))
	}
}
