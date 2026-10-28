// Historical publish-ledger proofs remain test-only after ADR-130 retired their production caller.
package hooks

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

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
