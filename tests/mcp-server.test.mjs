// ADR-012 T1. The server is driven the way a client drives it — a real process,
// line-delimited JSON on its stdin, one JSON object per line back on stdout.
// Calling `dispatch()` directly would test the dispatch and not the transport,
// and the framing is exactly where a hand-written JSON-RPC server goes wrong.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(testDir, '..')
const server = join(repoRoot, 'plugin', 'bin', 'qh-mcp')

// Windows cannot exec a `#!` script — the spawn returns status `null`, which is
// neither an error nor a failure, and the test then dies on JSON.parse(undefined)
// rather than on the property it is about (CLAUDE.md §7). Name the interpreter.
function talk(requests) {
  const input = requests.map(request => JSON.stringify(request)).join('\n') + '\n'
  const result = spawnSync('python3', [server], { input, encoding: 'utf8', timeout: 60_000 })
  assert.equal(result.error, undefined, `the server did not start: ${result.error}`)
  assert.notEqual(result.status, null,
    `the server was not executed at all (status null); stderr:\n${result.stderr}`)
  const lines = (result.stdout ?? '').split('\n').filter(Boolean)
  return { result, lines, replies: lines.map(line => JSON.parse(line)) }
}

const INIT = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
}

test('initialize returns a serverInfo over a real stdio pipe', () => {
  const { replies } = talk([INIT])
  assert.equal(replies.length, 1)
  const [reply] = replies
  assert.equal(reply.jsonrpc, '2.0')
  assert.equal(reply.id, 1)
  assert.equal(reply.error, undefined, JSON.stringify(reply.error))
  assert.equal(typeof reply.result.serverInfo.name, 'string')
  assert.ok(reply.result.serverInfo.name.length > 0)
  assert.equal(typeof reply.result.serverInfo.version, 'string')
  assert.ok('tools' in reply.result.capabilities, 'a server with no tools capability advertises no tools')
  // The client's protocol version is echoed rather than guessed. Pinning one a
  // client does not speak makes T4's Desktop measurement fail for a reason that
  // has nothing to do with this decision.
  assert.equal(reply.result.protocolVersion, '2025-06-18')
})

test('a client speaking a different protocol revision is answered in its own revision', () => {
  const { replies } = talk([{ ...INIT, params: { ...INIT.params, protocolVersion: '2024-11-05' } }])
  assert.equal(replies[0].result.protocolVersion, '2024-11-05')
  // …and a client that sends none at all still gets a usable handshake.
  const { replies: bare } = talk([{ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }])
  assert.equal(typeof bare[0].result.protocolVersion, 'string')
  assert.ok(bare[0].result.protocolVersion.length > 0)
})

test('every registered tool is annotated read-only, and nothing can register one that is not', () => {
  const { replies } = talk([INIT, { jsonrpc: '2.0', id: 2, method: 'tools/list' }])
  const listed = replies.find(reply => reply.id === 2)
  const tools = listed.result.tools
  // `every()` over an empty array is true. A server that registered nothing at
  // all would satisfy the read-only claim while providing no tools — the vacuous
  // pass CLAUDE.md §4 names, invisible at 100% coverage.
  assert.ok(tools.length > 0, 'tools/list returned nothing, so the claim below asserts nothing')
  for (const tool of tools) {
    assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} is not annotated read-only`)
    assert.equal(typeof tool.description, 'string')
    assert.ok(tool.description.length > 0, `${tool.name} has no description`)
    assert.equal(tool.inputSchema?.type, 'object', `${tool.name} declares no argument schema`)
  }

  // The annotation is DERIVED from the registrar, not written per tool. One
  // assignment in the source is what makes that true; a second occurrence means
  // somebody can now set it, and a sibling registrar means somebody can skip it.
  const source = readFileSync(server, 'utf8')
  assert.equal(source.match(/readOnlyHint/g).length, 1,
    'readOnlyHint is set in more than one place, so a tool can now disagree with its registration')
  const registrars = source.match(/^def \w*_?tool\(/gm) ?? []
  assert.deepEqual(registrars, ['def reading_tool('],
    'a second registrar exists, so a tool can be registered without the read-only annotation')
})

test('a malformed request is answered, not crashed on', () => {
  // Three shapes a real client produces when something upstream of it breaks.
  const input = '{not json\n' + JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'no/such/method' })
    + '\n' + JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'nope' } })
    + '\n' + JSON.stringify({ ...INIT, id: 4 }) + '\n'
  const result = spawnSync('python3', [server], { input, encoding: 'utf8', timeout: 60_000 })
  assert.notEqual(result.status, null, `the server was not executed: ${result.stderr}`)
  assert.equal(result.status, 0, `the server died: ${result.stderr}`)
  const replies = result.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line))

  assert.equal(replies[0].error.code, -32700, 'unparseable input is a parse error')
  assert.equal(replies[1].error.code, -32601, 'an unknown method is method-not-found')
  assert.equal(replies[1].id, 2)
  assert.equal(replies[2].error.code, -32602, 'an unknown tool name is invalid params')
  // The server stayed up: the request AFTER the three bad ones is still served.
  assert.equal(replies[3].id, 4)
  assert.equal(replies[3].error, undefined)
})

test('a notification is not answered', () => {
  // A JSON-RPC notification carries no id and must draw no reply. Claude Desktop
  // sends `notifications/initialized` immediately after the handshake; a server
  // that answers it puts an id-less response on the wire and the client reports
  // a protocol violation for something it never asked about.
  const { replies } = talk([INIT, { jsonrpc: '2.0', method: 'notifications/initialized' }])
  assert.equal(replies.length, 1, 'the notification drew a reply')
  assert.equal(replies[0].id, 1)
})

test('nothing but JSON-RPC reaches stdout', () => {
  // A stray print corrupts the stream, and it is the one bug a client reports
  // only as "the server is broken". Assert lines exist first: `every()` over an
  // empty array is true, so a server that printed nothing would pass silently.
  const { lines, replies, result } = talk([
    INIT,
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: replyProbe, arguments: {} } },
  ])
  assert.ok(lines.length >= 3, `expected a reply per request, got ${lines.length}`)
  assert.equal(replies.length, lines.length)
  assert.equal(result.status, 0, result.stderr)
})

// The probe tool T1 registers so `tools/list` has something to return. T2
// replaces it with the five real gates.
const replyProbe = 'qh_probe'

test('a registered tool can be called and returns content', () => {
  const { replies } = talk([INIT, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: replyProbe, arguments: {} } }])
  const call = replies.find(reply => reply.id === 2)
  assert.equal(call.error, undefined, JSON.stringify(call.error))
  assert.equal(call.result.isError, false)
  assert.ok(Array.isArray(call.result.content))
  assert.equal(call.result.content[0].type, 'text')
  assert.ok(call.result.content[0].text.length > 0)
})
