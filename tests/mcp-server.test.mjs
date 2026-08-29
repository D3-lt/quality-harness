// ADR-012 T1. The server is driven the way a client drives it — a real process,
// line-delimited JSON on its stdin, one JSON object per line back on stdout.
// Calling `dispatch()` directly would test the dispatch and not the transport,
// and the framing is exactly where a hand-written JSON-RPC server goes wrong.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: probeCall },
  ])
  assert.ok(lines.length >= 3, `expected a reply per request, got ${lines.length}`)
  assert.equal(replies.length, lines.length)
  assert.equal(result.status, 0, result.stderr)
})

// One real call, used by the transport tests above. T1 registered a probe tool
// here; T2 replaced it with the five gates, so this is one of those.
const probeCall = {
  name: 'qh_adr_lint',
  arguments: { adr: join(repoRoot, 'tests', 'fixtures', 'ok', 'ADR-001-selftest.md') },
}

test('a registered tool can be called and returns content', () => {
  const { replies } = talk([INIT, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: probeCall }])
  const call = replies.find(reply => reply.id === 2)
  assert.equal(call.error, undefined, JSON.stringify(call.error))
  assert.equal(call.result.isError, false)
  assert.ok(Array.isArray(call.result.content))
  assert.equal(call.result.content[0].type, 'text')
  assert.ok(call.result.content[0].text.length > 0)
})

// --- ADR-012 T2: the five reading gates, and the two that must be absent -----

const fixture = join(repoRoot, 'tests', 'fixtures', 'ok')
const bin = join(repoRoot, 'plugin', 'bin')
const READING_GATES = ['qh_adr_lint', 'qh_adr_next', 'qh_adr_debt', 'qh_adr_judge', 'qh_arch_lint']

function list() {
  const { replies } = talk([INIT, { jsonrpc: '2.0', id: 2, method: 'tools/list' }])
  return replies.find(reply => reply.id === 2).result.tools
}

function call(name, args) {
  const { replies } = talk([INIT, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }])
  return replies.find(reply => reply.id === 2)
}

test("every reading gate is listed, and calling it returns that gate's own output", () => {
  const listed = list().map(tool => tool.name).sort()
  assert.deepEqual(listed, [...READING_GATES].sort(),
    'tools/list must name exactly the five gates that never execute corpus content')

  // One end-to-end call per tool, compared against the same gate run directly.
  // Deleting any single reading_tool() call turns exactly this assertion red.
  const invocations = [
    ['qh_adr_lint', { adr: join(fixture, 'ADR-001-selftest.md'), tasks_dir: join(fixture, 'tasks') },
      'adr-lint', [join(fixture, 'ADR-001-selftest.md'), join(fixture, 'tasks')]],
    ['qh_adr_next', { path: join(fixture, 'tasks'), all: true }, 'adr-next', [join(fixture, 'tasks'), '--all']],
    ['qh_adr_debt', { dirs: [fixture] }, 'adr-debt', [fixture]],
    ['qh_adr_judge', { adr: join(fixture, 'ADR-001-selftest.md') }, 'adr-judge', [join(fixture, 'ADR-001-selftest.md')]],
    ['qh_arch_lint', { doc: join(fixture, 'architecture.md') }, 'arch-lint', [join(fixture, 'architecture.md')]],
  ]
  for (const [tool, args, gate, argv] of invocations) {
    const reply = call(tool, args)
    assert.equal(reply.error, undefined, `${tool}: ${JSON.stringify(reply.error)}`)
    const text = reply.result.content.map(part => part.text).join('')
    const direct = spawnSync('python3', [join(bin, gate), ...argv], { encoding: 'utf8', timeout: 60_000 })
    assert.notEqual(direct.status, null, `${gate} was not executed`)
    assert.ok(text.includes(direct.stdout.trim().split('\n')[0]),
      `${tool} did not return the gate output\nMCP:\n${text}\ndirect:\n${direct.stdout}`)
  }
})

test('no tool executes text the corpus supplies', () => {
  const tools = list()
  // `not any(...)` over an empty registry is true, and a server that registered
  // nothing would satisfy the boundary while providing no boundary at all.
  assert.ok(tools.length > 0, 'the registry is empty, so the assertion below asserts nothing')
  assert.ok(tools.some(tool => tool.name === 'qh_adr_lint'), 'the registry is not the real one')

  for (const tool of tools) {
    for (const forbidden of ['adr-verify', 'spec-verify', 'adr_verify', 'spec_verify']) {
      assert.ok(!JSON.stringify(tool).includes(forbidden), `${tool.name} names ${forbidden}`)
    }
  }
  // Asserted against the source as well, so a future author cannot satisfy the
  // registry half by renaming the tool while still spawning the gate.
  const source = readFileSync(server, 'utf8')
  assert.ok(!/adr-verify|spec-verify/.test(source),
    'the server names a gate that executes text the corpus supplies; over MCP the client names the file')
})

test('a gate is spawned through the interpreter, never as a bare path', () => {
  // A `#!` spawn works on the developer's machine and returns status `null` on
  // the platform CI blocks on — neither an error nor a failure. Read the argv
  // the server would use rather than trusting the code to be right.
  const probe = [
    'import importlib.machinery, importlib.util, json, sys',
    `loader = importlib.machinery.SourceFileLoader("qh", ${JSON.stringify(server)})`,
    'spec = importlib.util.spec_from_loader("qh", loader)',
    'module = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(module)',
    'print(json.dumps([module._gate_argv("adr-lint", ["x"]), sys.executable]))',
  ].join('\n')
  // -B: importing the server as a module would otherwise leave a __pycache__
  // beside the gates, and a .pyc embeds the absolute source path — which is a
  // personal filesystem path inside the plugin tree (CLAUDE.md §6).
  const result = spawnSync('python3', ['-B', '-c', probe], { encoding: 'utf8', timeout: 60_000 })
  assert.notEqual(result.status, null, result.stderr)
  assert.equal(result.status, 0, result.stderr)
  const [argv, executable] = JSON.parse(result.stdout)
  assert.equal(argv[0], executable, 'the gate is spawned as a bare path, which returns null on Windows')
  assert.ok(argv[1].endsWith('adr-lint'), argv[1])
  assert.deepEqual(argv.slice(2), ['x'])
})

test('every argument a handler honours is declared in that tool schema', () => {
  // An argument the handler accepts and the schema never advertises works for
  // anyone who sends it and is invisible to anyone who reads the tool list.
  const declared = Object.fromEntries(list().map(tool => [tool.name, tool.inputSchema]))
  for (const name of READING_GATES) {
    assert.equal(declared[name].type, 'object', name)
    assert.equal(declared[name].additionalProperties, false,
      `${name} accepts arguments it does not declare`)
    assert.ok(Object.keys(declared[name].properties).length > 0, `${name} declares no arguments`)
  }
  // An undeclared argument is refused rather than silently honoured.
  const reply = call('qh_adr_lint', { adr: join(fixture, 'ADR-001-selftest.md'), bogus: 'x' })
  assert.ok(reply.error || reply.result.isError, 'an undeclared argument was accepted')
})

// --- ADR-012 T3: which channel a run uses -----------------------------------

// A finding is content; the error channel is reserved for a gate that could not
// run. Both halves are asserted here, and they must both run: a server hard-coded
// to `isError: false` passes the first alone, and one hard-coded to `true` passes
// the second alone. Only the pair measures the decision.
test('a gate that ran and found something returns content, and one that could not run does not', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-mcp-'))
  const incomplete = join(dir, 'ADR-999-incomplete.md')
  // Enough of a record to be recognised and not enough to pass: adr-lint reports
  // findings and exits 1. That is a gate that WORKED.
  writeFileSync(incomplete, '# ADR-999: a record with nothing behind it\n\n**Status:** Proposed\n')

  const found = call('qh_adr_lint', { adr: incomplete })
  assert.equal(found.error, undefined, `a gate with findings must not reach the error channel: ${JSON.stringify(found.error)}`)
  assert.equal(found.result.isError, false, 'findings are advice, not a broken tool')
  const text = found.result.content.map(part => part.text).join('')
  assert.match(text, /exit 1/, 'the exit code must be stated, not left to be inferred from output')

  // The other half: a path that is not there. The gate could not run, and that is
  // not the same answer as "ran and found nothing" (ADR-005).
  const absent = call('qh_adr_lint', { adr: join(dir, 'ADR-000-not-here.md') })
  assert.ok(absent.error, 'a path that does not exist must not come back as a clean run')
  assert.match(absent.error.message, /could not|does not exist/i, absent.error.message)
  assert.doesNotMatch(absent.error.message, /\bfailed\b/i,
    'a gate that could not run must not borrow the vocabulary of one that ran (ADR-005)')
  assert.ok(absent.error.message.includes('ADR-000-not-here.md'), 'the error must name what was attempted')
})

test('gate output is returned verbatim', () => {
  // A second opinion about a gate's output is a second gate, and this one has no
  // mutations. Compare against the same gate run directly.
  const adr = join(fixture, 'ADR-001-selftest.md')
  const reply = call('qh_adr_lint', { adr, tasks_dir: join(fixture, 'tasks') })
  const text = reply.result.content.map(part => part.text).join('')
  const direct = spawnSync('python3', [join(bin, 'adr-lint'), adr, join(fixture, 'tasks')],
    { encoding: 'utf8', timeout: 60_000 })
  assert.ok(text.includes(direct.stdout), 'the server modified, summarised or graded the gate output')
  assert.ok(text.includes('exit 0'))
  assert.ok(text.includes(adr), 'the result must name which tree was read')
})
