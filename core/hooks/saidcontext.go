// Whether a hook item is already in the context it would be said into (plugin/scripts/said-per-context.mjs, ADR-122 T2).
// The evidence is the receiving context's last request, rebuilt from the transcript's api-request records (base, keep,
// tail) and their api-request-blob messages; hook text reaches the model there as role `system` messages (measured
// 2026-10-22 on Claude Code 2.1.307). The cache is the Node module's, by the same name and fields, so either honours the
// other's. Only "said" and "pending" may suppress; "no-evidence" means the caller does what it did before.
package hooks

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const (
	saidBudgetBytes = 8 * 1024 * 1024
	saidBudgetMs    = 1000
)

var (
	saidMainLoop = regexp.MustCompile(`^repl_main_thread\b`)
	saidMarkerRe = regexp.MustCompile(`<qh:[A-Za-z0-9_.-]+@[0-9a-f]{8}>`)
)

type saidRequest struct {
	Base        *string  `json:"base"`
	Keep        int      `json:"keep"`
	Tail        []string `json:"tail"`
	QuerySource string   `json:"querySource"`
}

type saidCache struct {
	Identity    string                 `json:"identity"`
	Offset      int64                  `json:"offset"`
	Requests    map[string]saidRequest `json:"requests"`
	Order       []string               `json:"order"`
	Blobs       map[string][]string    `json:"blobs"`
	Unparseable bool                   `json:"unparseable,omitempty"`
}

type saidOptions struct {
	cacheDir    string
	budgetBytes int64
	budgetMs    int64
}

func defaultSaidOptions() saidOptions {
	return saidOptions{cacheDir: saidMarkerDirectory(), budgetBytes: saidBudgetBytes, budgetMs: saidBudgetMs}
}

func saidDigest(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:])
}

// ItemMarker is the marker an item carries: its name and the first 8 hex of the SHA-256 of its stable text.
func ItemMarker(item, stableText string) string {
	return fmt.Sprintf("<qh:%s@%s>", item, saidDigest(stableText)[:8])
}

func saidStamp(key string) string { return saidDigest(key)[:32] }

func receivingTranscript(input map[string]any) string {
	if id, _ := input["agent_id"].(string); id != "" {
		path, _ := input["agent_transcript_path"].(string)
		return path
	}
	path, _ := input["transcript_path"].(string)
	return path
}

func saidIdentity(file string, f *os.File, info os.FileInfo) string {
	ino := fileInode(info)
	head := make([]byte, 4096)
	n, _ := f.ReadAt(head, 0)
	first := string(head[:n])
	if i := strings.IndexByte(first, '\n'); i >= 0 {
		first = first[:i]
	}
	return fmt.Sprintf("%d:%s", ino, saidDigest(first)[:16])
}

func blobMarkers(message map[string]any) []string {
	if role, _ := message["role"].(string); role != "system" {
		return []string{}
	}
	var texts []string
	switch content := message["content"].(type) {
	case string:
		texts = append(texts, content)
	case []any:
		for _, b := range content {
			block, _ := b.(map[string]any)
			if t, _ := block["type"].(string); t == "text" {
				if s, ok := block["text"].(string); ok {
					texts = append(texts, s)
				}
			}
		}
	}
	seen := map[string]bool{}
	out := []string{}
	for _, t := range texts {
		for _, m := range saidMarkerRe.FindAllString(t, -1) {
			if !seen[m] {
				seen[m] = true
				out = append(out, m)
			}
		}
	}
	return out
}

type saidScan struct {
	cache       *saidCache
	bytesRead   int64
	overBudget  bool
	unparseable bool
}

func scanTranscript(file, cacheFile string, opt saidOptions) *saidScan {
	started := time.Now()
	f, err := os.Open(file)
	if err != nil {
		return nil
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return nil
	}
	size := info.Size()
	identity := saidIdentity(file, f, info)
	var cache saidCache
	if raw, err := os.ReadFile(cacheFile); err != nil || json.Unmarshal(raw, &cache) != nil || cache.Identity != identity || cache.Offset > size {
		cache = saidCache{Identity: identity}
	}
	if cache.Requests == nil {
		cache.Requests = map[string]saidRequest{}
	}
	if cache.Blobs == nil {
		cache.Blobs = map[string][]string{}
	}
	if cache.Order == nil {
		cache.Order = []string{}
	}
	remaining := size - cache.Offset
	length := remaining
	if length > opt.budgetBytes {
		length = opt.budgetBytes
	}
	chunk := make([]byte, length)
	if _, err := f.ReadAt(chunk, cache.Offset); err != nil && int64(len(chunk)) != length {
		return nil
	}
	complete := bytes.LastIndexByte(chunk, '\n') + 1
	var consumed int64
	timedOut := false
	scanner := bufio.NewScanner(bytes.NewReader(chunk[:complete]))
	scanner.Buffer(make([]byte, 1024*1024), int(opt.budgetBytes)+1)
	for scanner.Scan() {
		if time.Since(started).Milliseconds() > opt.budgetMs {
			timedOut = true
			break
		}
		line := scanner.Bytes()
		consumed += int64(len(line)) + 1
		if len(bytes.TrimSpace(line)) == 0 {
			continue
		}
		var record map[string]any
		if json.Unmarshal(line, &record) != nil {
			cache.Unparseable = true
			continue
		}
		switch record["type"] {
		case "api-request-blob":
			if hash, ok := record["hash"].(string); ok {
				message, _ := record["message"].(map[string]any)
				cache.Blobs[hash] = blobMarkers(message)
			}
		case "api-request":
			if id, ok := record["id"].(string); ok {
				r := saidRequest{Tail: []string{}}
				if base, ok := record["base"].(string); ok {
					r.Base = &base
				}
				if keep, ok := record["keep"].(float64); ok {
					r.Keep = int(keep)
				}
				if tail, ok := record["tail"].([]any); ok {
					for _, h := range tail {
						if s, ok := h.(string); ok {
							r.Tail = append(r.Tail, s)
						}
					}
				}
				r.QuerySource, _ = record["querySource"].(string)
				cache.Requests[id] = r
				cache.Order = append(cache.Order, id)
			}
		}
	}
	cache.Offset += consumed
	if raw, err := json.Marshal(cache); err == nil {
		if os.MkdirAll(filepath.Dir(cacheFile), 0o755) == nil {
			temporary := fmt.Sprintf("%s.%d.tmp", cacheFile, os.Getpid())
			if os.WriteFile(temporary, raw, 0o644) == nil {
				_ = os.Rename(temporary, cacheFile)
			}
		}
	}
	return &saidScan{cache: &cache, bytesRead: consumed, overBudget: timedOut || remaining > opt.budgetBytes, unparseable: cache.Unparseable}
}

func lastRequest(cache *saidCache, agent bool) (string, []string, bool) {
	id := ""
	for i := len(cache.Order) - 1; i >= 0; i-- {
		if agent || saidMainLoop.MatchString(cache.Requests[cache.Order[i]].QuerySource) {
			id = cache.Order[i]
			break
		}
	}
	if id == "" {
		return "", nil, false
	}
	var chain []saidRequest
	for at, guard := id, 0; at != ""; guard++ {
		r, ok := cache.Requests[at]
		if !ok || guard > len(cache.Order) {
			return "", nil, false
		}
		chain = append(chain, r)
		if r.Base == nil {
			break
		}
		at = *r.Base
	}
	messages := []string{}
	for i := len(chain) - 1; i >= 0; i-- {
		r := chain[i]
		if r.Keep > len(messages) {
			return "", nil, false
		}
		messages = append(append([]string{}, messages[:r.Keep]...), r.Tail...)
	}
	return id, messages, true
}

// SaidInContext answers whether item, with this stable text, is in the receiving context: said, pending, unsaid or
// no-evidence, with the marker it carries.
func SaidInContext(input map[string]any, item, stableText string) (string, string) {
	return saidInContextWith(input, item, stableText, defaultSaidOptions())
}

func saidInContextWith(input map[string]any, item, stableText string, opt saidOptions) (string, string) {
	marker := ItemMarker(item, stableText)
	file := receivingTranscript(input)
	if file == "" {
		return "no-evidence", marker
	}
	scanned := scanTranscript(file, filepath.Join(opt.cacheDir, saidStamp("scan#"+file)), opt)
	if scanned == nil || scanned.overBudget || scanned.unparseable {
		return "no-evidence", marker
	}
	_, agent := input["agent_id"].(string)
	id, messages, ok := lastRequest(scanned.cache, agent && input["agent_id"] != "")
	if !ok {
		return "no-evidence", marker
	}
	missing := false
	for _, hash := range messages {
		markers, present := scanned.cache.Blobs[hash]
		if !present {
			missing = true
			continue
		}
		for _, m := range markers {
			if m == marker {
				return "said", marker
			}
		}
	}
	if missing {
		return "no-evidence", marker
	}
	if _, err := os.Stat(filepath.Join(opt.cacheDir, saidStamp("pending#"+file+"#"+id+"#"+marker))); err == nil {
		return "pending", marker
	}
	return "unsaid", marker
}

// RecordSaid records that marker was said now, after the receiving context's last request.
func RecordSaid(input map[string]any, marker string) bool {
	return recordSaidWith(input, marker, defaultSaidOptions())
}

func recordSaidWith(input map[string]any, marker string, opt saidOptions) bool {
	file := receivingTranscript(input)
	if file == "" {
		return false
	}
	scanned := scanTranscript(file, filepath.Join(opt.cacheDir, saidStamp("scan#"+file)), opt)
	if scanned == nil || scanned.overBudget || scanned.unparseable {
		return false
	}
	_, agent := input["agent_id"].(string)
	id, _, ok := lastRequest(scanned.cache, agent && input["agent_id"] != "")
	if !ok {
		return false
	}
	if os.MkdirAll(opt.cacheDir, 0o755) != nil {
		return false
	}
	f, err := os.OpenFile(filepath.Join(opt.cacheDir, saidStamp("pending#"+file+"#"+id+"#"+marker)), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		return os.IsExist(err)
	}
	_ = f.Close()
	return true
}
