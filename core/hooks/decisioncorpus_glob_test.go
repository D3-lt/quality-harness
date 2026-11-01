// The Codex review of 8d872045..b27d665a (part A1, P1): a short Governs glob made the backtracking matcher retry every split,
// C(60,10) = 75,394,027,566 tries for ten `*a` and a `b` against sixty `a`s, on the per-edit hook path. Glob matching now steps
// through the path once. Node's regex has the same weakness (BACKLOG); this holds the core's answer and its time.
package hooks

import (
	"strings"
	"testing"
	"time"
)

func TestDecisionCorpusGlobIsLinear(t *testing.T) {
	started := time.Now()
	if dcPathMatchesDeclaration(strings.Repeat("a", 60), strings.Repeat("*a", 10)+"b") {
		t.Fatal("ten `*a` and a `b` matched sixty `a`s")
	}
	// A hang guard, not a performance assertion: the backtracking matcher did not return in minutes.
	if elapsed := time.Since(started); elapsed > 2*time.Second {
		t.Fatalf("one glob took %v", elapsed)
	}
	for _, tc := range []struct {
		file, glob string
		want       bool
	}{
		{strings.Repeat("a", 60) + "b", strings.Repeat("*a", 10) + "b", true},
		{"docs/a/b/x.md", "docs/**/x.md", true},
		{"docs/x.md", "docs/**/x.md", true},
		{"docs/a/x.md", "docs/*/x.md", true},
		{"docs/a/b/x.md", "docs/*/x.md", false},
		{"A.MD", "*.md", true},
		{"a/b", "a*b", false},
		{"ab", "a?b", false},
		{"axb", "a?b", true},
		{"a\nb", "a**b", false},
		{"a\nb", "a*b", true},
	} {
		if got := dcPathMatchesDeclaration(tc.file, tc.glob); got != tc.want {
			t.Errorf("dcPathMatchesDeclaration(%q, %q) = %v, want %v", tc.file, tc.glob, got, tc.want)
		}
	}
}
