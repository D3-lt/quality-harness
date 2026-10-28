package hooks

// ADR-120 T13: the Go advisory arm answers the rows of tests/mention-stash.test.mjs as the Node one does. The parity test compares
// them by corpus when it runs; this one holds them under a plain `go test ./hooks/`.

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStashPushIsNoMention(t *testing.T) {
	for _, command := range []string{
		"git stash push", "git stash push -m wip", "git -C sub stash push", "git -c x=y stash push -u", "git --no-pager stash push",
		"git stash push && git stash push", "git stash push git stash push", "git stash push git stash push git stash push",
		"echo ok; git stash push -m \"wip\"", "git\tstash push",
	} {
		if mentionsCommitOrPush(command) {
			t.Errorf("%q is a stash and was mentioned as a push", command)
		}
	}
	for _, command := range []string{
		"git push", "git -c x=y push", "git stash push && git push", "git push; git stash push", "git stash push; git commit -m x",
		"echo stash push", "git stash push-x; git stash push && echo push", "ngit stash push", "git stash push git stash push git push",
	} {
		if !mentionsCommitOrPush(command) {
			t.Errorf("%q is a push and was not mentioned", command)
		}
	}
}

type boundLog struct {
	log     Log
	dropped int
	torn    bool
}

// ledgerBoundLog is the session log with every check event checks.jsonl does not hold removed (ADR-088 T2).
func ledgerBoundLog(cwd string, log Log) boundLog {
	torn := boundLog{log: log, torn: true}
	text, err := os.ReadFile(filepath.Join(stateDir(cwd), "checks.jsonl"))
	if err != nil {
		if !errors.Is(err, fs.ErrNotExist) {
			return torn
		}
		text = nil
	}
	all := strings.Split(string(text), "\n")
	if strings.TrimSpace(all[len(all)-1]) != "" {
		return torn
	}
	records := map[string]any{}
	for _, line := range all[:len(all)-1] {
		if strings.TrimSpace(line) == "" {
			continue
		}
		record, err := parseJSON(line)
		if err != nil {
			return torn
		}
		id, ok := get(record, "id").(string)
		if !ok {
			return torn
		}
		if _, have := records[id]; !have {
			records[id] = record
		}
	}
	kept := []any{}
	for _, entry := range log.E {
		event, ok := get(entry, "event").(string)
		if !ok || !strings.HasPrefix(event, "check.") || event == "check.source-unreadable" {
			kept = append(kept, entry)
			continue
		}
		id, ok := get(entry, "record").(string)
		record, have := records[id]
		if ok && have && checkEventName(record) == event && strict(dig(record, "after", "tree"), dig(entry, "after", "tree")) && carriedAsRecorded(entry, record) {
			kept = append(kept, entry)
		}
	}
	return boundLog{log: Log{E: kept, Complete: log.Complete}, dropped: len(log.E) - len(kept)}
}

// carriedAsRecorded is whether a check event's code tree and list are the ledger record's: an event that names either must name
// what the record holds, or it is not bound (ADR-120 T9).
func carriedAsRecorded(entry, record any) bool {
	if code := dig(entry, "after", "codeTree"); !isUndefined(code) && !strict(code, dig(record, "after", "codeTree")) {
		return false
	}
	if list := get(entry, "prose"); !isUndefined(list) {
		declared, ok := proseList(get(record, "prose"))
		if !ok || !sameProse(list, declared) {
			return false
		}
	}
	return true
}
