// One file, one key — however the path to it was spelled
// (docs/audits/2026-09-18-adr-060.md, C1).
//
// Three sites build the key an artifact verdict is stored and looked up under:
// the per-edit gate that records `artifact.gated`, the `file.written` event, and
// rule A's candidates at the turn end. Only the third was canonical. The other two
// were merely RESOLVED — so through a symlinked checkout, or a Windows 8.3 short
// name (`RUNNER~1` in a temp path, against the long form git answers with), the verdict was
// stored under one spelling and looked up under another. `answered` never matched,
// and every artifact a per-edit gate had already judged was gated again, and
// reported again, at every boundary. Re-work and noise rather than a missed
// finding — but it is the dedupe rule A exists to provide, never firing.
//
// Measured by an auditor on macOS (`/tmp` against `/private/tmp`), then seen for
// real on this branch's first Windows CI run, 2026-09-19.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lifecycleScript = join(repoRoot, 'plugin', 'scripts', 'lifecycle.mjs')
const runner = join(repoRoot, 'plugin', 'scripts', 'run-shell-hook.mjs')
const IDENTITY = { GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid',
  GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid' }
const BAD_RECORD = '# ADR-900: a record with no sections\n'

// A directory symlink needs a privilege a stock Windows account lacks; there the
// same mismatch arrives on its own as an 8.3 short name, and CI exercises it.
test('a verdict recorded through a symlinked path is found again at the turn end', { skip: process.platform === 'win32' ? 'a directory symlink needs SeCreateSymbolicLinkPrivilege; the 8.3 short name reproduces this on the Windows runner' : false }, () => {
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-artifact-key-')))
  try {
    const real = join(top, 'real')
    const linked = join(top, 'linked')
    const env = { ...process.env, ...IDENTITY, CLAUDE_PLUGIN_DATA: join(top, 'data'), TMPDIR: top, TMP: top, TEMP: top }
    const run = (command, args, options = {}) => spawnSync(command, args, { encoding: 'utf8', timeout: 120_000, env, ...options })
    const git = (...args) => { const out = run('git', ['-C', real, ...args]); assert.equal(out.status, 0, out.stderr); return out }
    mkdirSync(join(real, 'docs', 'adr'), { recursive: true })
    git('init', '-q')
    writeFileSync(join(real, 'a.md'), 'a\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'base')
    symlinkSync(real, linked, 'dir')

    // Everything the HOST says goes through the symlink; git and rule A answer
    // with the real path. That difference is the whole test.
    const session = `artifact-key-${process.pid}`
    const hook = payload => run(process.execPath, [lifecycleScript], { cwd: top, input: JSON.stringify({ ...payload, session_id: session, cwd: linked }) })
    const file = join(linked, 'docs', 'adr', 'ADR-900-bad.md')
    hook({ hook_event_name: 'SessionStart', source: 'startup' })
    writeFileSync(file, BAD_RECORD)
    hook({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: file } })
    const gated = run(process.execPath, [runner, 'facts-gate-dispatch.sh'], { cwd: linked,
      input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: file }, session_id: session, cwd: linked }) })
    // The control: the per-edit gate DID judge the file, so there is a verdict to find.
    assert.match(`${gated.stdout}${gated.stderr}`, /ADR-900-bad\.md/, 'the per-edit gate reported the malformed record')

    const log = readFileSync(join(real, '.git', 'quality-harness', 'sessions', `${session}.jsonl`), 'utf8')
      .split('\n').filter(Boolean).map(line => JSON.parse(line))
    const canonical = join(real, 'docs', 'adr', 'ADR-900-bad.md')
    const keys = log.filter(entry => entry.event === 'artifact.gated' || entry.event === 'file.written').map(entry => `${entry.event} ${entry.path}`)
    assert.ok(keys.length >= 2, `both events were recorded: ${keys}`)
    assert.deepEqual(keys.filter(key => !key.endsWith(` ${canonical}`)), [], 'every key is the canonical spelling, whatever the host said')

    // And the consequence: the turn end does not gate, or report, that file again.
    const stop = hook({ hook_event_name: 'Stop' })
    assert.doesNotMatch(`${stop.stdout}`, /Artifact validation failed/, `a file already judged for this content is not judged again: ${stop.stdout.slice(0, 400)}`)
  } finally { rmSync(top, { recursive: true, force: true }) }
})
