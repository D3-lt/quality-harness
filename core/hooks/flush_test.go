package hooks

import (
	"errors"
	"testing"
	"time"
)

type failingWriter struct{}

func (failingWriter) Write([]byte) (int, error) { return 0, errors.New("EPIPE") }

type countingWriter struct{ n int }

func (c *countingWriter) Write(p []byte) (int, error) { c.n += len(p); return len(p), nil }

// TestFlushSaysWhetherItWrote is the Go half of "marks are recorded only after a write that succeeded"
// (tests/said-per-context-delivery.test.mjs): Run records the said-per-context marks only when flush wrote the whole output.
func TestFlushSaysWhetherItWrote(t *testing.T) {
	failed := &hookRun{input: O(), output: O("systemMessage", "x"), stdout: failingWriter{}, stderr: &countingWriter{}}
	if failed.flush(time.Now()) {
		t.Fatal("a write that failed was reported written")
	}
	ok := &hookRun{input: O(), output: O("systemMessage", "x"), stdout: &countingWriter{}, stderr: &countingWriter{}}
	if !ok.flush(time.Now()) {
		t.Fatal("a write that succeeded was reported failed")
	}
	none := &hookRun{input: O(), stdout: &countingWriter{}, stderr: &countingWriter{}}
	if none.flush(time.Now()) {
		t.Fatal("no output is nothing written")
	}
}
