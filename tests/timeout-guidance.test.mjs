import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function documentedArgs() {
  const skill = readFileSync(new URL('../plugin/skills/corpus-chaos/SKILL.md', import.meta.url), 'utf8')
  const offered = skill.match(/`gtimeout ([^`]+) <command>`/)
  assert.ok(offered, 'the documented timeout command is present')
  return offered[1].split(/\s+/)
}

test('corpus guidance explicitly selects KILL instead of the catchable default', () => {
  assert.deepEqual(documentedArgs(), ['-s', 'KILL', '120'])
})

test('the documented timeout kills a child that ignores TERM on POSIX', {
  skip: process.platform === 'win32' && 'native Windows child exits do not represent POSIX signals',
}, t => {
  const candidates = ['gtimeout', 'timeout'].map(command => ({ command,
    probe: spawnSync(command, ['--version'], { encoding: 'utf8', timeout: 5000, windowsHide: true }) }))
  const available = candidates.find(({ probe }) => probe.status === 0 && /coreutils/.test(probe.stdout))
  if (!available) {
    t.skip('neither timeout frontend answered with a coreutils version')
    return
  }
  const args = documentedArgs()
  const child = 'process.on("SIGTERM", () => console.log("term")); console.log("ready"); setTimeout(() => console.log("completed"), 3000)'
  const run = options => spawnSync(available.command, [...options, '1', process.execPath, '-e', child], {
    encoding: 'utf8', timeout: 5000, windowsHide: true,
  })
  const caught = run([])
  assert.ifError(caught.error)
  assert.match(caught.stdout, /^ready\n(?:term\n)+completed\n$/, caught.stderr)
  const killed = run(args.slice(0, -1))
  assert.ifError(killed.error)
  // GNU and Rust coreutils report different exits: observe the child's behavior instead.
  assert.equal(killed.stdout, 'ready\n', killed.stderr)
  assert.equal(killed.stderr, '')
  assert.ok(killed.signal || killed.status !== 0)
})
