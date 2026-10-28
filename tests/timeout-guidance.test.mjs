import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('corpus guidance uses a GNU timeout with an uncatchable signal', t => {
  const candidates = ['gtimeout', 'timeout'].map(command => ({ command,
    probe: spawnSync(command, ['--version'], { encoding: 'utf8', timeout: 5000, windowsHide: true }) }))
  const available = candidates.find(({ probe }) => probe.status === 0 && /GNU coreutils/.test(probe.stdout))
  if (!available) {
    t.skip('neither timeout frontend answered with a GNU coreutils version')
    return
  }
  const skill = readFileSync(new URL('../plugin/skills/corpus-chaos/SKILL.md', import.meta.url), 'utf8')
  const offered = skill.match(/`gtimeout ([^`]+) <command>`/)
  assert.ok(offered, 'the documented timeout command is present')
  const args = offered[1].split(/\s+/)
  assert.deepEqual(args, ['-s', 'KILL', '120'])
  const ran = spawnSync(available.command, [...args.slice(0, -1), '1', process.execPath, '-e',
    'setTimeout(() => {}, 3000)'], { encoding: 'utf8', timeout: 5000, windowsHide: true })
  assert.ok(ran.signal === 'SIGKILL' || ran.status === 137, JSON.stringify({ status: ran.status, signal: ran.signal, stderr: ran.stderr }))
})
