// ADR-137 T3 Decision 4: a reader failure is said as the could-not-look line, from a recovered panic or a spent budget.
package hooks

import (
	"testing"
	"time"
)

func TestDecisionReaderWithin(t *testing.T) {
	cases := []struct {
		name string
		read func() string
		want string
	}{
		{"an answer", func() string { return "Decisions that govern what you are about to change:" }, "Decisions that govern what you are about to change:"},
		{"silence", func() string { return "" }, ""},
		{"a panic", func() string { panic("the reader broke") }, decisionReaderFailed},
		{"a spent budget", func() string { time.Sleep(2 * time.Second); return "too late" }, decisionReaderFailed},
	}
	for _, c := range cases {
		if got := decisionReaderWithin(50*time.Millisecond, c.read); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}
