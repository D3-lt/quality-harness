// ADR-110 T1: the Go core (core/, `qh hook <event>`) and the Node hooks it reimplements answer alike where the goldens do not
// look. Two comparisons, each between the two implementations live, never against a stored answer:
//   - every string literal in the classifier's own test files, through the lexer and every classifier both implement. The
//     files are found by what they test, so a row added to any of them lands here without anyone remembering;
//   - what a session leaves outside the repository's ledgers (sessions.jsonl and claims.jsonl under the plugin data home,
//     the compaction note, the generation file and the said-markers under TMPDIR), and what the next session reads back.
// Skipped, with the reason, where `go` is not on PATH: there is no core to compare.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { remove } from './helpers/remove.mjs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { mentionsCommitOrPush } from '../plugin/scripts/publish-verdict.mjs'
import { commitOnlyCommand, foreignCommitPath, freshRepositoryCommit, leavesHookInPlace, publishCommandIn, stagesBeforeCommit } from '../plugin/scripts/publish-command.mjs'
import { shellWords } from '../plugin/scripts/shell-words.mjs'
import { parseShell } from '../plugin/scripts/shell-grammar.mjs'
import { constantSuccessCheck } from '../plugin/scripts/check-command.mjs'
import { fixtureRepo, ledgers, normaliser, runHook, sandbox } from './hook-golden.mjs'
import { required } from './helpers/require.mjs'
import { itemMarker, recordSaid, saidInContext } from '../plugin/scripts/said-per-context.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const coreDir = path.resolve(here, '..', 'core')
const goVersion = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const noGo = required('go', goVersion.error || goVersion.status !== 0
  ? `go is not on PATH (${goVersion.error?.code ?? `exit ${goVersion.status}`}), so the Go core cannot be built here` : false)

// The test files that drive the classifier, by the names they import. This file names them too, and is left out.
const CLASSIFIER = /\b(?:publishCommandIn|shellWords|leavesHookInPlace|freshRepositoryCommit|constantSuccessCheck|foreignCommitPath|mentionsCommitOrPush|stagesBeforeCommit|commitOnlyCommand)\b/
const classifierTests = () => readdirSync(here).filter(name => name.endsWith('.test.mjs') && name !== path.basename(fileURLToPath(import.meta.url)))
  .filter(name => CLASSIFIER.test(readFileSync(path.join(here, name), 'utf8'))).sort()

// Every single-, double- or backtick-quoted literal with no interpolation, as the value JavaScript gives it. Read by a
// scanner that walks the file once, past comments and regular-expression literals, so a quote inside one of those cannot
// start a literal: a matcher over the text did exactly that, and a backtick inside a string swallowed the rows after it.
function literals(files) {
  const found = new Set()
  for (const file of files) {
    const text = readFileSync(path.join(here, file), 'utf8')
    let last = ''
    for (let i = 0; i < text.length; i++) {
      const c = text[i]
      if (c === '/' && text[i + 1] === '/') { i = text.indexOf('\n', i); if (i < 0) break; continue }
      if (c === '/' && text[i + 1] === '*') { i = text.indexOf('*/', i + 2) + 1; if (i <= 0) break; continue }
      if (c === '/' && (last === '' || '(,=:[!&|?{};+-*%<>~^'.includes(last))) {
        let inClass = false
        for (i++; i < text.length && text[i] !== '\n'; i++) {
          if (text[i] === '\\') { i++; continue }
          if (text[i] === '[') inClass = true
          else if (text[i] === ']') inClass = false
          else if (text[i] === '/' && !inClass) break
        }
        last = '/'
        continue
      }
      if (c === "'" || c === '"' || c === '`') {
        let j = i + 1
        let interpolated = false
        for (; j < text.length && text[j] !== c; j++) {
          if (text[j] === '\\') { j++; continue }
          if (c !== '`' && text[j] === '\n') break
          if (c === '`' && text[j] === '$' && text[j + 1] === '{') {
            interpolated = true
            let depth = 0
            for (j += 1; j < text.length; j++) {
              if (text[j] === '{') depth++
              else if (text[j] === '}' && --depth === 0) break
            }
          }
        }
        if (!interpolated) {
          try { const value = (0, eval)(text.slice(i, j + 1)); if (typeof value === 'string') found.add(value) } catch { /* not a literal */ }
        }
        i = j
        last = c
        continue
      }
      if (!/\s/.test(c)) last = c
    }
  }
  return [...found]
}

const nodeRow = cmd => {
  const parsed = shellWords(cmd)
  return {
    cmd,
    publish: publishCommandIn(cmd), mentions: mentionsCommitOrPush(cmd), commitOnly: commitOnlyCommand(cmd),
    fresh: freshRepositoryCommit(cmd), stages: stagesBeforeCommit(cmd), leaves: leavesHookInPlace(cmd),
    foreign: foreignCommitPath(cmd), constant: constantSuccessCheck(cmd),
    tree: parseShell(parsed),
    words: {
      complete: parsed.complete,
      closed: parsed.closed,
      commands: parsed.commands.map(c => ({
        argv: c.argv, assignments: c.assignments, dynamic: c.dynamic, quoted: c.quoted, code: c.code,
        heredocs: c.heredocs.map(d => ({ delimiter: d.delimiter, quoted: d.quoted, body: d.body })),
        substitutions: c.substitutions, pipeTo: c.pipeTo, ended: c.ended, redirects: c.redirects, negated: c.negated ?? null, writes: c.writes,
        bangs: c.bangs, terminator: c.terminator, defines: c.defines, opens: c.opens, closes: c.closes, redirections: c.redirections,
      })),
    },
  }
}

test('the Go classifier answers every literal of the classifier\'s own tests as the Node one does', { skip: noGo }, t => {
  const files = classifierTests()
  assert.ok(files.includes('publish-command.test.mjs') && files.includes('shell-words.test.mjs'), `the classifier's tests were not found: ${files.join(', ')}`)
  const rows = literals(files).map(nodeRow)
  assert.ok(rows.length > 500, `only ${rows.length} literals were read, so the comparison would prove little`)
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-parity-'))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const corpus = path.join(scratch, 'corpus.json')
  writeFileSync(corpus, JSON.stringify(rows))
  const run = spawnSync('go', ['test', '-count=1', '-v', '-run', '^TestClassifierParity$', './hooks/'], {
    cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true, env: { ...process.env, QH_PARITY_CORPUS: corpus },
  })
  const said = `${run.stdout}\n${run.stderr}`
  assert.equal(run.status, 0, `the Go classifier disagrees with the Node one (or did not run):\n${said.split('\n').slice(-60).join('\n')}`)
  // A test that skipped would exit 0 too: the count it compared is what says it ran, over every row written.
  assert.match(said, new RegExp(`${rows.length} rows compared, 0 disagreements`))
})

// ADR-120 T1: the lexer's boundary fields and the grammar's tree, row by row, over the shapes the grammar reads and the ones it
// must refuse (the first test above compares them too, for every literal of the classifier's tests).
test('the Go core reads the same fields and tree as the Node classifier', { skip: noGo }, t => {
  const rows = [
    'true || { true; false; }', '! { true; false; }', '! { npm test; false; }', 'f() { false; } && true', '{ false & } || false',
    'true || true | { cat; false; }', 'false() { :; }; false', 'true && { true; false; }', '! { true; npm test; }', '{ npm test; } && true',
    '{ npm test; } || false', 'true() { false; }; true', 'function f() { false; } && true', 'function f { false; } || false',
    'function f { :; }; npm test', '{ npm test;', '(true; false) || x', '! (npm test) && true', '( { true; } ; false ) | cat',
    '{ { true; } }', 'f() ( true )', '{ true; } > log', '{ ; }', 'echo (', 'case x in a) true;; esac', 'f()\n{ false; }; f', '! ! { true; }',
    'a | b && c & d', '{ a & b; } | { c; }', 'f() { f; }; f', 'x || f() { :; }; f', '(a; (b; c)) && d',
  ].map(nodeRow)
  assert.ok(rows.some(row => row.tree !== null) && rows.some(row => row.tree === null), 'the rows hold trees and refusals')
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-parity-'))
  t.after(() => remove(scratch))
  const corpus = path.join(scratch, 'corpus.json')
  writeFileSync(corpus, JSON.stringify(rows))
  const run = spawnSync('go', ['test', '-count=1', '-v', '-run', '^TestClassifierParity$', './hooks/'], {
    cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true, env: { ...process.env, QH_PARITY_CORPUS: corpus },
  })
  const said = `${run.stdout}\n${run.stderr}`
  assert.equal(run.status, 0, `the Go core disagrees with the Node classifier (or did not run):\n${said.split('\n').slice(-60).join('\n')}`)
  assert.match(said, new RegExp(`${rows.length} rows compared, 0 disagreements`))
})

// A session's files outside the repository's ledgers, as rows: JSONL parsed line by line, a marker's name kept only as its
// shape (its stamp hashes the sandbox's own paths), a time stamp in a guard file as a number.
function leftBehind(box) {
  const files = []
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) { walk(file); continue }
      const name = path.relative(box.top, file).split(path.sep).join('/').replace(/[0-9a-f]{32}/g, '<stamp>')
      const text = statSync(file).size ? readFileSync(file, 'utf8') : ''
      const body = name.endsWith('.jsonl') ? text.split('\n').filter(Boolean).map(line => JSON.parse(line))
        : /^\d+$/.test(text) ? '<n>' : text.startsWith('{') ? JSON.parse(text) : text
      files.push([name, body])
    }
  }
  walk(box.data)
  walk(box.tmp)
  return files.sort((a, b) => (a[0] + JSON.stringify(a[1])).localeCompare(b[0] + JSON.stringify(b[1])))
}

function session(box, implementation) {
  const repo = fixtureRepo(box, 'repo', { '.quality-harness.json': '{"check":"sh check.sh"}\n', 'check.sh': 'exit 0\n', 'src/a.js': 'x\n' })
  const hook = (id, payload) => runHook(box, repo, id, payload, {}, implementation)
  const said = []
  said.push(hook('one', { hook_event_name: 'SessionStart', source: 'startup' }))
  writeFileSync(path.join(repo, 'src', 'a.js'), 'y\n')
  said.push(hook('one', { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: path.join(repo, 'src', 'a.js') } }))
  said.push(hook('one', { hook_event_name: 'Stop', last_assistant_message: 'Done, all tests pass.' }))
  said.push(hook('one', { hook_event_name: 'PreCompact', trigger: 'auto' }))
  said.push(hook('one', { hook_event_name: 'SessionStart', source: 'compact' }))
  said.push(hook('one', { hook_event_name: 'SessionEnd', reason: 'other' }))
  said.push(hook('two', { hook_event_name: 'SessionStart', source: 'startup' }))
  // locationKey folds case where the filesystem does, so the repository's and the sandbox's paths are also written in lower
  // case. The repository first: a sandbox name mkdtemp happened to spell in lower case already matched the normaliser's
  // '<repo>', and any other read '<box>/repo', so two sandboxes disagreed by their random names (a release check, 2026-10-19).
  const lower = value => JSON.parse(JSON.stringify(value).split(repo.toLowerCase()).join('<repo>').split(box.top.toLowerCase()).join('<box>'))
  return lower(normaliser(box, [repo])({ said, files: leftBehind(box) }))
}

const posixOnly = process.platform === 'win32' && 'the sessions this compares are recorded on POSIX, as the goldens are (BACKLOG section 375)'

test('what a session leaves outside the ledgers, and what the next one reads back, is the same from either implementation', { skip: noGo || posixOnly }, t => {
  const bin = mkdtempSync(path.join(os.tmpdir(), 'qh-parity-bin-'))
  t.after(() => rmSync(bin, { recursive: true, force: true }))
  const qh = path.join(bin, process.platform === 'win32' ? 'qh.exe' : 'qh')
  const built = spawnSync('go', ['build', '-o', qh, './cmd/qh'], { cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true })
  assert.equal(built.status, 0, `go build failed: ${built.stderr}`)
  const node = session(sandbox(t), { impl: 'node' })
  const go = session(sandbox(t), { impl: 'go', bin: qh })
  // The comparison must have something in it: the rows both ledgers hold, and the notices read back from them.
  assert.ok(node.files.some(([name]) => name === 'data/sessions.jsonl') && node.files.some(([name]) => name === 'data/claims.jsonl'))
  assert.match(JSON.stringify(node.said), /What this session was doing before compaction/)
  assert.match(JSON.stringify(node.said), /The previous session in this directory ended/)
  assert.deepEqual(go, node)
})

// ADR-110's amended Decision 4 (2026-10-17): the core detaches the artifact pass as the Node path does (ADR-080). The boundary
// that starts it says nothing of what it finds, the pass gates behind it under its own lock and the machine lease (ADR-077),
// and the next hook says the finding. Run with the default runner, never `inline`. A core that ran the pass inline would say
// the finding at the turn end itself, so the two transcripts would differ there.
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

function behindTheBoundary(box, implementation) {
  const repo = fixtureRepo(box, 'repo', { '.quality-harness.json': '{"check":"sh check.sh"}\n', 'check.sh': 'exit 0\n', 'src/a.js': 'x\n' })
  const detached = { QUALITY_HARNESS_ARTIFACT_PASS_RUNNER: '' }
  const hook = payload => runHook(box, repo, 'pass-1', payload, detached, implementation)
  const said = [hook({ hook_event_name: 'SessionStart', source: 'startup' })]
  mkdirSync(path.join(repo, 'docs', 'adr'), { recursive: true })
  writeFileSync(path.join(repo, 'docs', 'adr', 'ADR-001-bad.md'), '# ADR-001: bad\n\nno status here\n')
  said.push(hook({ hook_event_name: 'Stop', last_assistant_message: 'Wrote the record.' }))
  // The pass is its own process now: wait, bounded, for its end in its ledger and for its lock to be gone.
  const passes = path.join(repo, '.git', 'quality-harness', 'passes')
  const ledger = path.join(passes, 'pass-1.jsonl')
  const lock = path.join(passes, 'pass-1.lock')
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline && !(existsSync(ledger) && readFileSync(ledger, 'utf8').includes('"pass.ended"') && !existsSync(lock))) pause(100)
  assert.ok(existsSync(ledger) && readFileSync(ledger, 'utf8').includes('"pass.ended"'), `${implementation.impl}: the pass left no end within the bound`)
  said.push(hook({ hook_event_name: 'UserPromptSubmit', prompt: 'next' }))
  return normaliser(box, [repo])({ said, ledgers: ledgers(repo) })
}

test('the artifact pass runs behind the boundary that starts it, and the next hook says what it found, from either implementation', { skip: noGo || posixOnly }, t => {
  const bin = mkdtempSync(path.join(os.tmpdir(), 'qh-parity-bin-'))
  t.after(() => rmSync(bin, { recursive: true, force: true }))
  const qh = path.join(bin, 'qh')
  const built = spawnSync('go', ['build', '-o', qh, './cmd/qh'], { cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true })
  assert.equal(built.status, 0, `go build failed: ${built.stderr}`)
  const node = behindTheBoundary(sandbox(t), { impl: 'node' })
  const go = behindTheBoundary(sandbox(t), { impl: 'go', bin: qh })
  // What makes the comparison mean something: the turn end said no artifact finding, and the next prompt did.
  assert.doesNotMatch(JSON.stringify(node.said[1]), /Artifact validation failed/)
  assert.match(JSON.stringify(node.said[2]), /Artifact validation failed/)
  assert.deepEqual(go, node)
})

// ADR-122 T2: the Go core's SaidInContext answers every scenario as the Node module does, marker and verdict alike, each from
// a cache directory of its own so neither reads the other's answer.
test('the Go core judges what a context holds as the Node module does', { skip: noGo }, t => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-said-parity-'))
  t.after(() => remove(scratch))
  const MAIN = 'repl_main_thread:outputStyle:Concise'
  const blob = (hash, role, text) => ({ type: 'api-request-blob', hash, message: { role, content: [{ type: 'text', text }] } })
  const request = (id, base, keep, tail, querySource = MAIN) => ({ type: 'api-request', id, base, keep, tail, querySource })
  const text = 'quality-harness: this repository is unchecked'
  const mark = itemMarker('mention', text)
  const scenarios = {
    said: [blob('h1', 'system', `${text} ${mark}`), request('r1', null, 0, ['h1'])],
    compacted: [blob('h1', 'system', `${text} ${mark}`), request('r1', null, 0, ['h1']), blob('h2', 'user', 's'), request('r2', 'r1', 0, ['h2'])],
    kept: [blob('h1', 'system', `${text} ${mark}`), blob('h2', 'user', 's'), request('r1', null, 0, ['h1']), request('r2', 'r1', 1, ['h2'])],
    quoted: [blob('h1', 'user', `quoted ${mark}`), request('r1', null, 0, ['h1'])],
    sideQuery: [blob('h1', 'system', `${text} ${mark}`), blob('h2', 'user', 'u'), request('r1', null, 0, ['h2']), request('r2', null, 0, ['h1'], 'compact')],
    missingBlob: [blob('h1', 'user', 'u'), request('r1', null, 0, ['h1', 'hX'])],
    missingBase: [blob('h1', 'system', `${text} ${mark}`), request('r1', 'r0', 1, ['h1'])],
    noRequests: [blob('h1', 'system', `${text} ${mark}`)],
    pending: [blob('h1', 'user', 'u'), request('r1', null, 0, ['h1'])],
  }
  const rows = []
  for (const [name, records] of Object.entries(scenarios)) {
    const transcript = path.join(scratch, `${name}.jsonl`)
    writeFileSync(transcript, records.map(r => `${JSON.stringify(r)}\n`).join(''))
    const input = { session_id: 's1', transcript_path: transcript }
    const nodeCache = path.join(scratch, `${name}-node`)
    if (name === 'pending') recordSaid(input, mark, { cacheDir: nodeCache })
    const { verdict, marker } = saidInContext(input, 'mention', text, { cacheDir: nodeCache })
    // Go reads the pending mark from the directory Node wrote it in, as a hook of either core would.
    rows.push({ name, input, item: 'mention', text, cacheDir: name === 'pending' ? nodeCache : path.join(scratch, `${name}-go`), verdict, marker })
  }
  assert.deepEqual([...new Set(rows.map(r => r.verdict))].sort(), ['no-evidence', 'pending', 'said', 'unsaid'], 'every verdict is compared')
  const corpus = path.join(scratch, 'said.json')
  writeFileSync(corpus, JSON.stringify(rows))
  const run = spawnSync('go', ['test', '-count=1', '-v', '-run', '^TestSaidParity$', './hooks/'], {
    cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true, env: { ...process.env, QH_SAID_PARITY: corpus },
  })
  const said = `${run.stdout}\n${run.stderr}`
  assert.equal(run.status, 0, `the Go core disagrees with the Node module (or did not run):\n${said.split('\n').slice(-40).join('\n')}`)
  assert.match(said, new RegExp(`${rows.length} rows compared, 0 disagreements`))
})
