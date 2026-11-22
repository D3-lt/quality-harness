package hooks

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestArtifactPassRequiresLedger(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("QUALITY_HARNESS_LEASE_DIR", filepath.Join(dir, "leases"))
	for _, writable := range []bool{true, false} {
		ledger := filepath.Join(dir, "pass.jsonl")
		if !writable {
			ledger = dir
		}
		lock := filepath.Join(dir, "pass.lock")
		claim := claimPassLock(lock, passBudgetMs)
		if claim == nil || claim.err != "" {
			t.Fatalf("claim: %+v", claim)
		}
		request := filepath.Join(dir, "request.json")
		body := O("ledger", ledger, "lock", lock, "token", claim.token, "cwd", dir)
		if err := os.WriteFile(request, []byte(stringify(body)), 0o600); err != nil {
			t.Fatal(err)
		}
		if status := RunArtifactPass(request); (status == 0) != writable {
			t.Fatalf("writable %v: exit %d", writable, status)
		}
		if _, err := os.Stat(lock); !os.IsNotExist(err) {
			t.Fatalf("lock after pass: %v", err)
		}
		if writable {
			b, err := os.ReadFile(ledger)
			if err != nil || !strings.Contains(string(b), "pass.ended") {
				t.Fatalf("missing end: %s, %v", b, err)
			}
		}
	}
}
