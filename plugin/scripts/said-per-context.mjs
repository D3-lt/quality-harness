// ADR-122 T2: whether a hook item is already in the context it would be said into.
//
// The evidence is what the model RECEIVED, never what a hook claims it wrote. Measured 2026-10-22 on Claude Code 2.1.307
// over one long session: a hook record in the transcript is not delivery (13 of 433 recorded additionalContext texts were
// in no later request), while the transcript's own `api-request` records say exactly what was sent. A request names a
// `base` request, keeps its first `keep` messages and appends `tail`, a list of `api-request-blob` hashes; so the last
// request's whole message list can be rebuilt, and hook text arrives there as role `system` messages (about 500 sightings;
// a role `user` message holding hook text is someone quoting it). A compaction, a clear, a rewind and a fork are therefore
// already in the last request, and nothing older can stand for it.
//
// The verdicts:
//   said         the item's marker is in a role `system` message of the receiving context's last request
//   pending      it was said after that request (recordSaid), so no request could carry it yet
//   unsaid       there is request evidence, and it does not carry the item
//   no-evidence  no request records, a chain that cannot be rebuilt, a parse failure, or a scan past its budget
// Only `said` and `pending` may suppress. `no-evidence` means the caller does what it did before this module existed.
//
// The scan is incremental and never waits: a cache per transcript (offset, identity, request index, the markers each blob
// holds) lives in the said-marker directory under its sweep, written through a temporary file and a rename; a blob is a
// content address, so its markers never change once read. The offset never passes an incomplete last line.
import { createHash } from 'node:crypto'
import { closeSync, mkdirSync, openSync, readFileSync, readSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { saidMarkerDirectory } from './housekeeping.mjs'

export const BUDGET_BYTES = 8 * 1024 * 1024
export const BUDGET_MS = 1000
// The main loop's requests (measured 2026-10-22: every recorded request of the session carried this prefix).
const MAIN_LOOP = /^repl_main_thread\b/
const MARKER = /<qh:[A-Za-z0-9_.-]+@[0-9a-f]{8}>/g

const digest = text => createHash('sha256').update(text).digest('hex')

/** The marker an item carries: its name and the first 8 hex of the SHA-256 of its stable text (never its volatile parts). */
export function itemMarker(item, stableText) {
  return `<qh:${item}@${digest(String(stableText)).slice(0, 8)}>`
}

const stamp = key => digest(key).slice(0, 32)

function receivingTranscript(input) {
  // A subagent's context is its own; without its transcript there is no evidence for it, never the parent's.
  if (input?.agent_id) return typeof input.agent_transcript_path === 'string' ? input.agent_transcript_path : null
  return typeof input?.transcript_path === 'string' ? input.transcript_path : null
}

const emptyCache = identity => ({ identity, offset: 0, requests: {}, order: [], blobs: {} })

function identityOf(file, fd, size) {
  // Windows reads 0, as the Go twin does there (core/hooks/saidinode_windows.go), so both key one cache alike.
  const ino = process.platform === 'win32' ? 0 : statSync(file).ino
  const head = Buffer.alloc(Math.min(size, 4096))
  readSync(fd, head, 0, head.length, 0)
  const first = head.toString('utf8').split('\n')[0]
  return `${ino}:${digest(first).slice(0, 16)}`
}

function blobMarkers(message) {
  if (message?.role !== 'system') return []
  const content = message.content
  const texts = typeof content === 'string' ? [content]
    : Array.isArray(content) ? content.filter(b => b?.type === 'text' && typeof b.text === 'string').map(b => b.text) : []
  return [...new Set(texts.flatMap(t => t.match(MARKER) ?? []))]
}

/** Read what was appended since the cache's offset; returns the cache and the bytes read, or null for no evidence. */
function scan(file, cacheFile, { budgetBytes, budgetMs }) {
  const started = Date.now()
  let fd
  try { fd = openSync(file, 'r') } catch { return null }
  try {
    const size = statSync(file).size
    const identity = identityOf(file, fd, size)
    let cache = null
    try { cache = JSON.parse(readFileSync(cacheFile, 'utf8')) } catch { cache = null }
    if (!cache || cache.identity !== identity || cache.offset > size) cache = emptyCache(identity)
    // At most the budget is read per firing, and what was read is kept, so a long transcript is caught up over several
    // firings; until it is, the answer is no evidence, never a verdict on a part of it.
    const remaining = size - cache.offset
    const length = Math.min(remaining, budgetBytes)
    const chunk = Buffer.alloc(length)
    readSync(fd, chunk, 0, length, cache.offset)
    const text = chunk.toString('utf8')
    let consumed = 0, timedOut = false, unparseable = false
    // The last piece after the final newline is a line still being written (or empty): it is never read, and the offset
    // stops before it, so it is read whole next time.
    for (const line of text.split('\n').slice(0, -1)) {
      if (Date.now() - started > budgetMs) { timedOut = true; break }
      consumed += Buffer.byteLength(line, 'utf8') + 1
      if (!line.trim()) continue
      let record
      try { record = JSON.parse(line) } catch { unparseable = true; continue }
      if (record?.type === 'api-request-blob' && typeof record.hash === 'string') {
        cache.blobs[record.hash] = blobMarkers(record.message)
      } else if (record?.type === 'api-request' && typeof record.id === 'string') {
        cache.requests[record.id] = { base: record.base ?? null, keep: Number(record.keep) || 0,
          tail: Array.isArray(record.tail) ? record.tail : [], querySource: String(record.querySource ?? '') }
        cache.order.push(record.id)
      }
    }
    cache.offset += consumed
    if (unparseable) cache.unparseable = true
    try {
      mkdirSync(path.dirname(cacheFile), { recursive: true })
      const temporary = `${cacheFile}.${process.pid}.tmp`
      writeFileSync(temporary, JSON.stringify(cache))
      renameSync(temporary, cacheFile)
    } catch { /* a cache that cannot be kept costs a rescan next time, never a verdict */ }
    return { cache, bytesRead: consumed, overBudget: timedOut || remaining > budgetBytes, unparseable: Boolean(cache.unparseable) }
  } catch { return null } finally { closeSync(fd) }
}

/** The last request of the receiving context, rebuilt into its message-blob hashes; null when it cannot be rebuilt. */
function lastRequest(cache, agent) {
  const id = [...cache.order].reverse().find(r => agent || MAIN_LOOP.test(cache.requests[r]?.querySource ?? ''))
  if (!id) return null
  const chain = []
  for (let at = id, guard = 0; at; guard += 1) {
    const r = cache.requests[at]
    if (!r || guard > cache.order.length) return null
    chain.push(r)
    at = r.base
  }
  let messages = []
  for (const r of chain.reverse()) {
    if (r.keep > messages.length) return null
    messages = messages.slice(0, r.keep).concat(r.tail)
  }
  return { id, messages }
}

/** Whether `item`, with this stable text, is in the receiving context: said, pending, unsaid or no-evidence. */
export function saidInContext(input, item, stableText, { cacheDir = saidMarkerDirectory(), budgetBytes = BUDGET_BYTES,
  budgetMs = BUDGET_MS } = {}) {
  const marker = itemMarker(item, stableText)
  const file = receivingTranscript(input)
  if (!file) return { verdict: 'no-evidence', marker, bytesRead: 0 }
  const scanned = scan(file, path.join(cacheDir, stamp(`scan#${file}`)), { budgetBytes, budgetMs })
  if (!scanned || scanned.overBudget || scanned.unparseable) return { verdict: 'no-evidence', marker, bytesRead: scanned?.bytesRead ?? 0 }
  const last = lastRequest(scanned.cache, Boolean(input?.agent_id))
  if (!last) return { verdict: 'no-evidence', marker, bytesRead: scanned.bytesRead }
  // A marker in any blob the last request carries is positive evidence. A blob the transcript never recorded (a session
  // older than the request records keeps its early messages unrecorded: 571 of 930 in the session measured 2026-10-22)
  // could hold it, so with one missing, absence cannot be shown, and the answer is no evidence.
  if (last.messages.some(hash => scanned.cache.blobs[hash]?.includes(marker))) return { verdict: 'said', marker, bytesRead: scanned.bytesRead }
  if (last.messages.some(hash => !(hash in scanned.cache.blobs))) return { verdict: 'no-evidence', marker, bytesRead: scanned.bytesRead }
  try {
    statSync(path.join(cacheDir, stamp(`pending#${file}#${last.id}#${marker}`)))
    return { verdict: 'pending', marker, bytesRead: scanned.bytesRead }
  } catch { return { verdict: 'unsaid', marker, bytesRead: scanned.bytesRead } }
}

/** Record that `marker` was said now, after the receiving context's last request; it answers only while that request is last. */
export function recordSaid(input, marker, { cacheDir = saidMarkerDirectory(), budgetBytes = BUDGET_BYTES, budgetMs = BUDGET_MS } = {}) {
  const file = receivingTranscript(input)
  if (!file) return false
  const scanned = scan(file, path.join(cacheDir, stamp(`scan#${file}`)), { budgetBytes, budgetMs })
  const last = scanned && !scanned.overBudget && !scanned.unparseable && lastRequest(scanned.cache, Boolean(input?.agent_id))
  if (!last) return false
  try {
    mkdirSync(cacheDir, { recursive: true })
    writeFileSync(path.join(cacheDir, stamp(`pending#${file}#${last.id}#${marker}`)), '', { flag: 'wx' })
  } catch (error) { return error?.code === 'EEXIST' }
  return true
}
