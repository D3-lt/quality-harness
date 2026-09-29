// BACKLOG §319 items 12 and 8, from the corpus-chaos round of e016066. Item 12 (js-spa-client):
// scripts/mutate.mjs over a catalogue that is not `{ mutations: [...] }` crashed with a TypeError
// and exit 1, a stale finding's status, and `--stale` led its gone-killer line with the word
// `undefined`. Item 8: the corpus-chaos skill's macOS bound was an alarm, and a Go binary's
// runtime ignores SIGALRM. The review of that first pass added three: an ENTRY that is not a
// mutation still passed, adr-lint raised a traceback over a catalogue of another shape, and the
// new perl bound left the command running when the bound itself was interrupted. Each test has a
// control beside it, so a check that can only say "clean" fails here.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runner = join(repoRoot, 'scripts', 'mutate.mjs')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })
// A scratch root this file made, holding one source and a catalogue. No git runs here (CLAUDE.md §9).
const scratch = catalogue => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-chaos-315-'))
  temps.push(dir)
  mkdirSync(join(dir, 'tests'))
  writeFileSync(join(dir, 'a.mjs'), 'export const f = () => 1\n')
  writeFileSync(join(dir, 'tests', 'mutations.json'), typeof catalogue === 'string' ? catalogue : `${JSON.stringify(catalogue, null, 2)}\n`)
  return dir
}
const mutate = (dir, ...args) => spawnSync(process.execPath, [runner, '--root', dir, ...args], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
const slashes = text => text.replaceAll('\\', '/')
const ENTRY = { label: 'f', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: 'export const f = () => 1', to: 'export const f = () => 2' }

// §319 item 12. `{"mutations":"x"}` is the worst of them: a string iterates, so `--stale` printed
// a stale line for an entry that does not exist, at exit 1, the status of a real finding.
test('mutate refuses a catalogue that is not { mutations: [...] } with exit 2 and the file named, before any branch', () => {
  for (const shape of ['{}', '[]', 'null', '42', '{"mutations":{}}', '{"mutations":"x"}']) {
    const dir = scratch(`${shape}\n`)
    const catalogue = slashes(join(dir, 'tests', 'mutations.json'))
    for (const args of [['--stale'], ['--list'], ['--narrow'], []]) {
      const run = mutate(dir, ...args)
      const said = `${shape} ${args.join(' ')}:\n${run.stdout}\n${run.stderr}`
      assert.equal(run.status, 2, said)
      assert.ok(slashes(run.stderr).includes(catalogue), said)
      assert.ok(run.stderr.includes('"mutations" is an array'), said)
      assert.ok(!said.includes('TypeError'), said)
      assert.equal(run.stdout, '', said)
    }
  }
  // The controls: a well-formed catalogue that is current exits 0, and one whose entry is stale
  // exits 1 with the finding on stdout and nothing on stderr, so the two stay apart.
  const current = mutate(scratch({ mutations: [ENTRY] }), '--stale')
  assert.equal(current.status, 0, `${current.stdout}\n${current.stderr}`)
  assert.ok(current.stdout.includes('every entry matches its source exactly once'), current.stdout)
  const stale = mutate(scratch({ mutations: [{ ...ENTRY, from: 'export const f = () => 3' }] }), '--stale')
  assert.equal(stale.status, 1, `${stale.stdout}\n${stale.stderr}`)
  assert.ok(stale.stdout.includes('1 catalogue entry does not match the source exactly once'), stale.stdout)
  assert.equal(stale.stderr, '')
})

// §319 item 12, its second half.
test('mutate --stale leads a gone killer\'s line with a word, not `undefined`, beside a stale line that leads with its count', () => {
  const dir = scratch({ mutations: [
    { ...ENTRY, label: 'narrowed-f', only: '^(?:f is one)$' },
    { ...ENTRY, label: 'moved-g', from: 'export const g = () => 1', to: 'export const g = () => 2' },
  ] })
  writeFileSync(join(dir, 'tests', 'a.test.mjs'), "test('f is 1', () => {})\n")
  const run = mutate(dir, '--stale')
  assert.equal(run.status, 1, `${run.stdout}\n${run.stderr}`)
  const lines = run.stdout.split('\n')
  assert.ok(!lines.some(line => line.startsWith('undefined')), run.stdout)
  assert.ok(lines.includes('killer gone  narrowed-f :: no file it names defines "f is one"'), run.stdout)
  // The control: the stale entry beside it still leads with its count.
  assert.ok(lines.includes('0x  a.mjs :: moved-g'), run.stdout)
})

// The review of the first pass: it fenced the top level alone, so `{"mutations":[42]}` passed,
// `--stale` printed `unreadable  undefined :: undefined` at exit 1, a stale finding's status, and
// `--list` and the campaign crashed with a TypeError. The bad entry sits second, so the index the
// refusal names is the entry's own and not always 0.
test('mutate refuses a catalogue entry that is not a mutation with exit 2, naming the entry, before any branch', () => {
  const G = { ...ENTRY, label: 'g' }
  const shapes = [
    [42, /entry 1 must be an object/],
    [null, /entry 1 must be an object/],
    [[], /entry 1 must be an object/],
    [{}, /entry 1's "label" must be a string/],
    [{ ...G, label: 7 }, /entry 1's "label" must be a string/],
    [{ ...G, to: undefined }, /entry 1 \("g"\)'s "to" must be a string/],
    [{ ...G, tests: 'tests/a.test.mjs' }, /entry 1 \("g"\)'s "tests" must be an array of strings/],
    [{ ...G, tests: [1] }, /entry 1 \("g"\)'s "tests" must be an array of strings/],
    [{ ...G, only: 5 }, /entry 1 \("g"\)'s "only" must be a string when present/],
  ]
  for (const [entry, why] of shapes) {
    const dir = scratch({ mutations: [ENTRY, entry] })
    for (const args of [['--stale'], ['--list'], ['--narrow'], []]) {
      const run = mutate(dir, ...args)
      const said = `${JSON.stringify(entry)} ${args.join(' ')}:\n${run.stdout}\n${run.stderr}`
      assert.equal(run.status, 2, said)
      assert.ok(slashes(run.stderr).includes(slashes(join(dir, 'tests', 'mutations.json'))), said)
      assert.match(run.stderr, why, said)
      assert.ok(!said.includes('TypeError') && !said.includes('undefined'), said)
      assert.equal(run.stdout, '', said)
    }
  }
  // The control: the same two entries well-formed are read, with `only` absent from one and a
  // string in the other.
  const well = mutate(scratch({ mutations: [ENTRY, { ...G, only: '^(?:f is 1)$' }] }), '--list')
  assert.equal(well.status, 0, `${well.stdout}\n${well.stderr}`)
  assert.ok(well.stdout.includes('only: /^(?:f is 1)$/'), well.stdout)
  assert.equal(well.stderr, '')
})

// The review of the first pass, measured: adr-lint's resolve_enforcement raised on a
// tests/mutations.json of another shape, outside `protected()`, so the lint of a record with an
// Enforced-by pointer ended in a traceback and exit 1; and a file that was not JSON read as one
// holding no labels, so the advice said the pointer "is not a mutation label" of a catalogue it
// never read. Run through adr-lint's own command line, the boundary the finding came through.
const bin = join(repoRoot, 'plugin', 'bin')
const RECORD = ['# ADR-001: Probe', '', '**Status:** Accepted', '**Spec:** None — no spec stage',
  '**Enforced-by:** `x`', '**Served-path change:** None — this decision changes no served path.', '',
  '## Existing Primitives Audit', '', 'Nothing existing covers it.', '', '## Decision', '', 'Do the thing.', '',
  '## Alternatives Considered', '', '- Doing nothing — rejected, the bug persists.', '',
  '## Consequences', '', 'The thing is done.', '', '## Wiring & Contract Changes', '', 'None.', '',
  '## Out of Scope', '', '- The other thing (deferred: ADR-002)', ''].join('\n')
// adr-lint over RECORD in a scratch repository this file made, whose tests/mutations.json holds
// `catalogue`, or which has none when it is null. Its git runs only there (CLAUDE.md §9).
const enforcement = catalogue => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-chaos-316-lint-'))
  temps.push(dir)
  spawnSync('git', ['init', '-q'], { cwd: dir, timeout: 30_000, windowsHide: true })
  mkdirSync(join(dir, 'tests'))
  if (catalogue !== null) writeFileSync(join(dir, 'tests', 'mutations.json'), catalogue)
  writeFileSync(join(dir, 'ADR-001-probe.md'), RECORD)
  // 60s: a Windows runner's first Python spawn can take 30 (tests/adr-next.test.mjs:29).
  const run = spawnSync('python3', [join(bin, 'adr-lint'), join(dir, 'ADR-001-probe.md')], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  return { run, advice: run.stdout.split('\n').filter(line => line.includes('Enforced-by names')).join('\n') }
}

test('adr-lint calls an Enforced-by pointer UNPROVEN over a catalogue it cannot read, and never raises', () => {
  // A million deep: Python's json raises RecursionError, which is not a ValueError, from 3.9
  // (at a thousand) to 3.14 (which parses a hundred thousand).
  const deep = `${'['.repeat(1_000_000)}${']'.repeat(1_000_000)}`
  for (const shape of ['[]', 'null', '42', '{}', '{"mutations":null}', '{"mutations":{}}', '{"mutations":[42]}',
    '{"mutations":[{"label":[1]}]}', '{"mutations":[{"label":"x"},42]}', 'not json', deep]) {
    const { run, advice } = enforcement(`${shape}\n`)
    const said = `${shape.slice(0, 40)}:\n${run.stdout}\n${run.stderr}`
    assert.equal(run.status, 0, said)
    assert.ok(!run.stderr.includes('Traceback'), said)
    assert.match(advice, /Enforced-by names `x`.*UNPROVEN.*tests\/mutations\.json could not be read/, said)
    assert.ok(!advice.includes('which is not a mutation label'), said)
  }
  // The controls: a catalogue holding the label resolves the pointer, and one without it, or no
  // catalogue at all, still says the pointer names nothing, which there it was seen to.
  const holds = enforcement('{"mutations":[{"label":"x"}]}\n')
  assert.equal(holds.run.status, 0, `${holds.run.stdout}\n${holds.run.stderr}`)
  assert.equal(holds.advice, '')
  for (const catalogue of ['{"mutations":[{"label":"y"}]}\n', null]) {
    const { run, advice } = enforcement(catalogue)
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
    assert.match(advice, /Enforced-by names `x`, which is not a mutation label.*pointer to nothing/, run.stdout)
    assert.ok(!advice.includes('UNPROVEN'), advice)
  }
})

// §319 item 8. Every perl bound either corpus-chaos file offers is run here as written, over a
// node child that catches SIGALRM and does nothing, which is what a Go binary's runtime does.
const chaos = join(repoRoot, 'plugin', 'skills', 'corpus-chaos')
const perlBounds = file => [...readFileSync(join(chaos, file), 'utf8').matchAll(/`perl -e '([^'`]*)' \d+ <command>`/g)].map(match => match[1])
const IGNORES_ALARM = "process.on('SIGALRM', () => {}); setTimeout(() => {}, 3000)"
const DIES_ON_ALARM = 'setTimeout(() => {}, 3000)'
const bound = (script, budget, ...command) => spawnSync('perl', ['-e', script, String(budget), ...command], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
// A POSIX host with a perl, or the test is skipped with the reason.
const posixPerl = t => {
  if (process.platform === 'win32') { t.skip('this measures a POSIX fork, process group and SIGALRM, which Windows does not have'); return false }
  const perl = spawnSync('perl', ['-e', 'exit 0'], { timeout: 30_000, windowsHide: true })
  if (perl.error || perl.status !== 0) { t.skip(`no perl to run here: ${perl.error?.code ?? perl.status}`); return false }
  return true
}

test('every perl bound the corpus-chaos skill offers ends a child that ignores SIGALRM', t => {
  if (!posixPerl(t)) return
  // The control: the old bound ends a child that dies on SIGALRM, and not one that ignores it.
  const OLD = 'alarm shift; exec @ARGV'
  assert.equal(bound(OLD, 1, process.execPath, '-e', DIES_ON_ALARM).signal, 'SIGALRM')
  // Two seconds: the child must be running its handler before the alarm, or it dies of it.
  const outlived = bound(OLD, 2, process.execPath, '-e', IGNORES_ALARM)
  assert.deepEqual([outlived.status, outlived.signal], [0, null], 'the old bound was expected to let this child finish')
  const forms = { 'SKILL.md': perlBounds('SKILL.md'), 'abominations.md': perlBounds('abominations.md') }
  assert.ok(forms['SKILL.md'].length >= 1, 'SKILL.md offers a perl bound for stock macOS')
  for (const [file, scripts] of Object.entries(forms)) {
    for (const script of scripts) {
      const run = bound(script, 1, process.execPath, '-e', IGNORES_ALARM)
      assert.deepEqual([run.status, run.signal], [137, null], `${file}: ${script}\n${run.stderr}`)
    }
  }
  // abominations.md bounds its runs the same way: with a form of its own, or by pointing at SKILL.md's.
  assert.ok(forms['abominations.md'].length || readFileSync(join(chaos, 'abominations.md'), 'utf8').includes('(SKILL.md)'))
})

// A command that ignores SIGALRM and starts a grandchild, in a directory of its own. The child
// writes its pid to `<base>.child`; the grandchild writes its pid to `<base>.pid`, then beats into
// `<base>.beat` until it is killed or ten seconds pass.
const groupFixture = () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-chaos-315-group-'))
  temps.push(dir)
  writeFileSync(join(dir, 'grandchild.cjs'), "const fs = require('node:fs')\nfs.writeFileSync(process.argv[2] + '.pid', String(process.pid))\nsetInterval(() => fs.appendFileSync(process.argv[2] + '.beat', '.'), 50)\nsetTimeout(() => process.exit(0), 10000)\n")
  writeFileSync(join(dir, 'child.cjs'), "process.on('SIGALRM', () => {})\nrequire('node:fs').writeFileSync(process.argv[2] + '.child', String(process.pid))\nrequire('node:child_process').spawn(process.execPath, [require('node:path').join(__dirname, 'grandchild.cjs'), process.argv[2]], { stdio: 'ignore' })\nsetTimeout(() => {}, 10000)\n")
  return dir
}
// Whether the grandchild under `base` is still beating 600 ms from now. Read from its beat, not
// from `kill(pid, 0)`: an orphan nobody has reaped yet still answers that. Only a group still
// beating is killed here, its group first while the grandchild keeps that id from being reused,
// then the grandchild, for a bound that never made one; a dead pid may be another process's.
const stillBeating = base => {
  const beats = () => { try { return statSync(`${base}.beat`).size } catch { return 0 } }
  const before = beats()
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 600)
  const outlived = beats() > before
  if (outlived) {
    try { process.kill(-Number(readFileSync(`${base}.child`, 'utf8')), 'SIGKILL') } catch {}
    try { process.kill(Number(readFileSync(`${base}.pid`, 'utf8')), 'SIGKILL') } catch {}
  }
  return outlived
}

// The skill says its perl bound kills the command's whole process group, as `timeout` does, so a
// process the reader started is not left behind to be reported as the reader's own leftover.
test('the perl bound SKILL.md offers ends the command\'s whole process group, not only the command', t => {
  if (!posixPerl(t)) return
  const dir = groupFixture()
  // Runs `script` over the child, and says whether the grandchild it started outlived the bound.
  const outlives = (script, name) => {
    const base = join(dir, name)
    // Three seconds: two node processes start before the grandchild's pid is written.
    const run = bound(script, 3, process.execPath, join(dir, 'child.cjs'), base)
    assert.deepEqual([run.status, run.signal], [137, null], `${script}\n${run.stderr}`)
    assert.ok(existsSync(`${base}.pid`), `${script}: the grandchild never started`)
    return stillBeating(base)
  }
  // The control: a bound that kills only the command leaves the grandchild running.
  assert.equal(outlives('$t = shift; $p = fork or exec @ARGV; $SIG{ALRM} = sub { kill KILL => $p }; alarm $t; waitpid $p, 0; exit($? & 127 ? 128 + ($? & 127) : $? >> 8)', 'control'), true)
  const forms = perlBounds('SKILL.md')
  assert.ok(forms.length >= 1, 'SKILL.md offers a perl bound for stock macOS')
  forms.forEach((script, index) => assert.equal(outlives(script, `form-${index}`), false, script))
})

// The review of the first pass, measured: its bound put the command in a process group of its
// own and handled ALRM alone, so a TERM, INT or HUP sent to the bound itself (an interrupt, an
// outer timeout) ended perl and left the command's whole group running with no bound at all.
test('a perl bound SKILL.md offers leaves nothing running when it is itself sent TERM, INT or HUP', async t => {
  if (!posixPerl(t)) return
  const dir = groupFixture()
  const interrupted = async (script, name, signal) => {
    const base = join(dir, name)
    const run = spawn('perl', ['-e', script, '60', process.execPath, join(dir, 'child.cjs'), base], { stdio: 'ignore', timeout: 30_000, windowsHide: true })
    const exited = new Promise(resolve => run.on('exit', (code, sig) => resolve([code, sig])))
    // Signalled only once the grandchild is up, by when perl has long had its handlers: a signal
    // before them would be measuring the race, not the bound.
    for (const deadline = Date.now() + 20_000; !existsSync(`${base}.pid`) && Date.now() < deadline;) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    assert.ok(existsSync(`${base}.pid`), `${script}: the grandchild never started`)
    run.kill(signal)
    return [await exited, stillBeating(base)]
  }
  // The control: the first pass's bound dies of the TERM and leaves the command's group running.
  const FIRST_PASS = '$t = shift; $p = fork or do { setpgrp; exec @ARGV }; $SIG{ALRM} = sub { kill KILL => -$p }; alarm $t; waitpid $p, 0; exit($? & 127 ? 128 + ($? & 127) : $? >> 8)'
  assert.deepEqual(await interrupted(FIRST_PASS, 'control', 'SIGTERM'), [[null, 'SIGTERM'], true])
  const forms = perlBounds('SKILL.md')
  assert.ok(forms.length >= 1, 'SKILL.md offers a perl bound for stock macOS')
  for (const [index, script] of forms.entries()) {
    for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
      assert.deepEqual(await interrupted(script, `form-${index}-${signal}`, signal), [[137, null], false], `${signal}: ${script}`)
    }
  }
})

// SKILL.md prefers GNU timeout with `-s KILL`: its default TERM is one a command may catch, and a
// child that ignores both SIGALRM and SIGTERM ran out its time under `gtimeout 1` (measured,
// coreutils 9.12: exit 124 at 3 s). Homebrew names GNU timeout `gtimeout`; Linux names it `timeout`.
test('the gtimeout bound SKILL.md prefers ends a child that ignores SIGALRM and SIGTERM', t => {
  if (process.platform === 'win32') { t.skip('GNU timeout signals a POSIX process, which Windows does not have'); return }
  const skill = readFileSync(join(chaos, 'SKILL.md'), 'utf8')
  const form = /`gtimeout ((?:-\S+ \S+ )*)\d+ <command>`/.exec(skill)
  assert.ok(form, 'SKILL.md offers a gtimeout bound')
  assert.ok(skill.indexOf(form[0]) < skill.indexOf("`perl -e '"), 'gtimeout comes first, perl is the fallback')
  const gnu = ['gtimeout', 'timeout'].find(name => {
    const version = spawnSync(name, ['--version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
    return !version.error && version.stdout.includes('GNU coreutils')
  })
  if (!gnu) { t.skip('no GNU timeout on this host'); return }
  const STUBBORN = "process.on('SIGTERM', () => {}); process.on('SIGALRM', () => {}); setTimeout(() => {}, 3000)"
  const bounded = flags => spawnSync(gnu, [...flags, '1', process.execPath, '-e', STUBBORN], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  // The control: GNU timeout's default TERM lets this child run out its three seconds.
  const plain = bounded([])
  assert.deepEqual([plain.status, plain.signal], [124, null])
  // With `-s KILL` it ends at the budget. GNU timeout sends it to its own process group, itself
  // included, so it dies of the KILL too; a timeout that outlived its group would exit 137.
  const run = bounded(form[1].trim().split(' ').filter(Boolean))
  assert.ok(run.signal === 'SIGKILL' || run.status === 137, `${form[0]}: ${run.status} ${run.signal}`)
})

// Every perl bound the text offers is run above. These hold the text itself: the alarm form is
// offered nowhere, in whatever spelling, and abominations.md's Bounds point at SKILL.md's.
test('neither corpus-chaos file offers the alarm bound, and abominations.md\'s Bounds point at SKILL.md', () => {
  const ALARM = /alarm\s+shift\s*;\s*exec\b/
  // The control: the pattern finds the form both files shipped at ffd4892.
  assert.match("`perl -e 'alarm shift; exec @ARGV' 120 <command>`", ALARM)
  for (const file of ['SKILL.md', 'abominations.md']) {
    assert.doesNotMatch(readFileSync(join(chaos, file), 'utf8'), ALARM, file)
  }
  const bounds = readFileSync(join(chaos, 'abominations.md'), 'utf8').split(/^## /m).find(section => section.startsWith('Bounds'))
  assert.ok(bounds, 'abominations.md has a Bounds section')
  assert.ok(bounds.split(/\n- /).some(bullet => bullet.includes('stock macOS') && bullet.includes('(SKILL.md)')), bounds)
})
