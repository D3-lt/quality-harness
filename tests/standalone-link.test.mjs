import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync,
  symlinkSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  FORWARDER_MARK, RESOLVER, archive, backupRoot, bySemver, cacheDirectory, citeOrphan,
  classifyHomeFile, formerlyShipped, forwarderCmd, forwarderScript, orphans,
  barePathWinner,
  knownDigests, linkPlan, onSearchPath, replaceable, sameLineage, write,
} from '../plugin/scripts/standalone-link.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.join(repoRoot, 'plugin')

// Exactly two cases below are POSIX-only, and only because a `#!/bin/sh`
// forwarder cannot be executed on Windows — measured there on 2026-08-27, where
// both failed and everything else passed, symlink creation included. The Windows
// artefacts are the `.cmd` forwarder and the copy fallback, and both are asserted
// on every platform by content, so nothing about Windows goes unchecked. Skipping
// the symlink cases too would have been a guess that quietly dropped coverage on
// the platform this project keeps getting wrong.

function home(files = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'link-'))
  for (const [relative, contents] of Object.entries(files)) {
    const full = path.join(directory, relative)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, contents)
  }
  return directory
}

/** Run the resolver exactly as a forwarder does, against a fabricated cache. */
function resolve(versions, directory) {
  const cache = cacheDirectory(directory)
  for (const [name, hasBin] of Object.entries(versions)) {
    mkdirSync(path.join(cache, name, hasBin ? 'bin' : 'docs'), { recursive: true })
  }
  return spawnSync(process.execPath, ['-e', RESOLVER, cache], { encoding: 'utf8' }).stdout
}


// THIS IS A SHAPE CHECK, and it says so because ADR-003 forbids passing one off
// as a behaviour check. A cmd fence has no seam: there is no way to execute it
// from macOS or Linux and observe what it does.
//
// The control flow HAS since been executed on Windows 11 by a peer session — a
// hand-written copy of this form, pointed at an installed gate: one FAIL block
// instead of two, exit matching a direct `py -3` run, the passing case exit 0,
// and the `python` branch reached and propagating when `py` is hidden. What has
// NOT been run there is these files, so the shape check below is what this repo
// asserts and the commit records the boundary.
//
// Two measured facts shape the form. `A && B || C` is not if/else: `||` fires
// when B exits non-zero, not only when A fails, so every FAILING gate ran twice
// and the caller got the second interpreter's status. And a parenthesised
// `if (…) else (…)` — the obvious repair — breaks on an unquoted argument
// containing `)`. `C:\Program Files (x86)\…` is that argument, and the
// ProgramFiles(x86) root is already in resolve_bash's fallback list; measured
// "was unexpected at this time", exit 255, gate never run.
test('a cmd forwarder runs one interpreter and returns its exit code', () => {
  const gates = readdirSync(path.join(root, 'bin'))
    .filter(name => name.endsWith('.cmd'))
  assert.ok(gates.length >= 11, `expected the shipped .cmd forwarders, saw ${gates.length}`)

  const shipped = gates.map(name => [name, readFileSync(path.join(root, 'bin', name), 'utf8')])
  const generated = forwarderCmd('adr-lint')

  for (const [name, text] of [...shipped, ['<generated>', generated]]) {
    // The original defect, spelled the way it shipped.
    assert.doesNotMatch(text, /&&\s*\(\s*py\s+-3/,
      `${name}: chains the gate onto \`where /q py\` with && — a failing gate then runs twice`)
    assert.doesNotMatch(text, /\|\|\s*\(\s*python\b/,
      `${name}: falls back with || , which fires on the GATE's exit code, not on where's`)
    // And the repair that would have replaced one defect with another: the line
    // that expands %* must not sit inside a parenthesised block, because `)` in
    // an unquoted argument closes it early. Asserted as "starts at column 0",
    // which is what a call outside a block looks like — the generator's own
    // `if not defined QH_ROOT (` fence is a block too, and a legitimate one: it
    // expands no user argument, which is exactly the distinction that matters.
    for (const call of text.split(/\r?\n/).filter(line => line.includes('%*'))) {
      assert.match(call, /^(py -3|python) /,
        `${name}: an interpreter call is indented, so it is inside a block: ${call.trim()}`)
    }
    // The form that is actually there.
    assert.match(text, /^where \/q py && goto :usepy$/m, `${name}: must select by goto`)
    assert.match(text, /^exit \/b$/m,
      `${name}: bare 'exit /b' is what preserves the python branch's status`)
    assert.match(text, /^:usepy$/m, `${name}: missing the py label`)
  }

  // Both interpreters still reachable, one per branch — deleting the fallback
  // would satisfy everything above.
  assert.match(generated, /\r\npython "%QH_ROOT%\\bin\\adr-lint" %\*\r\n/)
  assert.match(generated, /\r\npy -3 "%QH_ROOT%\\bin\\adr-lint" %\*\r\n/)
  // Order matters: the bare `exit /b` must sit between them, or the py branch
  // runs after the python one and the gate executes twice again.
  const g = generated.replace(/\r\n/g, '\n')
  assert.ok(g.indexOf('\npython "') < g.indexOf('\nexit /b\n')
    && g.indexOf('\nexit /b\n') < g.indexOf('\npy -3 "'),
    'the fallback must exit before reaching the :usepy label')

  // The generator writes into the standalone bin directory and the eleven above
  // ship in the package. Different files, same job, so they drift unless
  // something compares them. Sliced from the selection line: the generator has an
  // earlier `)` closing its "no installed plugin" guard.
  const selection = text => {
    const lines = text.split(/\r?\n/)
    const start = lines.findIndex(line => line === 'where /q py && goto :usepy')
    assert.notEqual(start, -1, 'no interpreter-selection block found')
    return lines.slice(start).filter(Boolean).map(line => line.replace(/"[^"]*"/, '"<gate>"').trim())
  }
  assert.deepEqual(selection(generated), selection(shipped[0][1]),
    'the generated forwarder and the shipped ones must select the interpreter identically')
})

test('the resolver orders versions numerically, not lexically', () => {
  // The cache on the machine this was written for holds 2.0.4, 2.0.10, 2.1.7 and
  // 2.15.0 together. Lexical order puts 2.0.4 above 2.0.10 and 2.9.0 above
  // 2.15.0, so a forwarder sorting as strings would silently run last month's
  // gate and produce a verdict nobody could explain.
  const directory = home()
  try {
    assert.equal(path.basename(resolve({ '2.0.4': true, '2.0.10': true }, directory)), '2.0.10')
    assert.equal(path.basename(resolve({ '2.9.0': true, '2.15.0': true }, directory)), '2.15.0')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the resolver ignores a cached version with no gates in it', () => {
  const directory = home()
  try {
    assert.equal(path.basename(resolve({ '2.1.0': true, '2.99.0': false }, directory)), '2.1.0')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the resolver says nothing rather than guessing when the cache is absent', () => {
  const directory = home()
  try {
    assert.equal(spawnSync(process.execPath,
      ['-e', RESOLVER, path.join(directory, 'nowhere')], { encoding: 'utf8' }).stdout, '')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a forwarder pins no version, which is the whole point of it', () => {
  // A copy goes stale because it carries a version. If one ever appears in this
  // text, the forwarder has become a copy with extra steps.
  for (const text of [forwarderScript('adr-lint'), forwarderCmd('adr-lint')]) {
    assert.doesNotMatch(text, /\d+\.\d+\.\d+/, text)
    assert.match(text, /adr-lint/)
    assert.ok(text.includes(FORWARDER_MARK))
  }
})

test('the resolver asks what is INSTALLED, and falls back to the cache scan', () => {
  // docs/BACKLOG.md §50, reported 2026-08-29. The cache is a directory nothing
  // prunes — this machine's holds forty-one versions back to 2.0.0 — so a
  // leftover or half-removed directory with a higher number won over the
  // installed one silently, and the gate ran a version nobody chose.
  const home = mkdtempSync(path.join(tmpdir(), 'qh-resolver-'))
  const cache = cacheDirectory(home)
  const manifest = path.join(home, '.claude', 'plugins', 'installed_plugins.json')
  for (const version of ['2.33.1', '9.9.9']) {
    mkdirSync(path.join(cache, version, 'bin'), { recursive: true })
  }
  const resolve = () => spawnSync('node', ['-e', RESOLVER, cache], { encoding: 'utf8' }).stdout

  try {
    // THE DIRTY CASE FIRST: no manifest, so the scan answers — and it picks the
    // leftover. This is the behaviour that shipped, asserted so the fix below is
    // shown to change something.
    assert.equal(resolve(), path.join(cache, '9.9.9'),
      'with nothing installed to ask about, the newest cache directory is all there is')

    // ...and with a manifest, the INSTALLED version wins over the higher number.
    writeFileSync(manifest, JSON.stringify({
      plugins: { 'quality-harness@quality-harness': [
        { scope: 'user', installPath: path.join(cache, '2.33.1'), version: '2.33.1' },
      ] },
    }))
    assert.equal(resolve(), path.join(cache, '2.33.1'),
      'a leftover cache directory must not outrank what is installed')

    // A MANIFEST THAT DOES NOT PARSE FALLS BACK TO THE SCAN, never to nothing.
    // The file is not ours and its shape can change under us; degrading to the
    // old answer is the promise, and "no gate at all" is not an acceptable one.
    writeFileSync(manifest, '{ this is not json')
    assert.equal(resolve(), path.join(cache, '9.9.9'), 'a parse failure degrades, it does not erase')

    // An entry whose installPath has no bin/ is not a candidate either — a
    // half-removed install is exactly the shape this defect came from.
    writeFileSync(manifest, JSON.stringify({
      plugins: { 'quality-harness@quality-harness': [
        { scope: 'user', installPath: path.join(cache, '3.0.0'), version: '3.0.0' },
      ] },
    }))
    assert.equal(resolve(), path.join(cache, '9.9.9'),
      'an installPath with no bin is not an install')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('a forwarder in a directory nothing searches is reported, not assumed to work', () => {
  // Reported 2026-08-29 from another machine, measured rather than guessed.
  // The standalone bin directory was on PATH there only via `.zshrc`, which zsh reads for
  // INTERACTIVE shells. So the forwarder reached a human at a terminal and was
  // structurally absent from the two contexts where staleness is silent — an
  // agent's tool shell and a CI step, both non-interactive by construction. That
  // session's sweep ran a gate two releases old and could not have run anything
  // else. This tool writes the forwarder and installs no PATH entry: the
  // directory's reachability has been somebody else's shell profile all along,
  // and nothing ever said so.
  //
  // The platform is a PARAMETER because the answer differs by it and a branch
  // with no seam is a branch with no test (CLAUDE.md §7).
  assert.equal(onSearchPath('/opt/qh/bin', '/usr/bin:/opt/qh/bin', 'linux'), true)
  assert.equal(onSearchPath('/opt/qh/bin', '/usr/bin:/opt/bin', 'linux'), false,
    'the whole point: a directory nothing searches')
  assert.equal(onSearchPath('/opt/qh/bin/', '/usr/bin:/opt/qh/bin', 'linux'), true,
    'a trailing separator is the same directory')
  assert.equal(onSearchPath('/opt/qh/binx', '/usr/bin:/opt/qh/bin', 'linux'), false,
    'and a prefix is not a match')

  // Windows splits on `;` and compares case-insensitively; POSIX does neither.
  // Asserting the same input BOTH ways is what makes this a test of the seam
  // rather than of the developer's own platform.
  // Deliberately not under a Windows home directory: with separators normalised
  // `C:\\Users\\Someone` reads as a personal filesystem path, and
  // tests/package.test.mjs::nothing tracked in this repository names a personal
  // filesystem path is right to reject one (CLAUDE.md §6). Case-folding is what
  // this case is about, and `Opt` exercises it just as well.
  const winPath = 'C:\\Windows;c:\\opt\\qh\\bin'
  assert.equal(onSearchPath('C:\\Opt\\QH\\bin', winPath, 'win32'), true,
    'Windows folds case')
  assert.equal(onSearchPath('C:\\Opt\\QH\\bin', winPath, 'linux'), false,
    'and POSIX does not — same input, different answer, which is the point')
  assert.equal(onSearchPath('/a', '', 'linux'), false, 'an empty PATH searches nothing')
  assert.equal(onSearchPath('/a', undefined, 'linux'), false, 'and an absent one does not throw')
})

test('which copy a bare gate name reaches is precedence, not presence', () => {
  // Synthetic homes on purpose. The notice's own suite drives this through a real
  // temp directory and therefore only ever sees the host's platform; the Windows
  // rules — `;` as the separator, case-insensitive comparison, a drive prefix —
  // are reachable from any machine only if the home is a string rather than a
  // directory that had to be created. CLAUDE.md §7: a Windows-only branch with no
  // injectable seam is a branch with no test.
  const win = 'C:\\Users\\alice'
  const winBin = 'C:\\Users\\alice\\.claude\\bin'
  const winCache = 'C:\\Users\\alice\\.claude\\plugins\\cache\\'
    + 'quality-harness\\quality-harness\\2.44.0\\bin'

  // PRESENCE IS NOT PRECEDENCE, and the order is the whole answer.
  assert.equal(barePathWinner(win, `${winBin};${winCache}`, 'win32').winner, 'standalone')
  assert.equal(barePathWinner(win, `${winCache};${winBin}`, 'win32').winner, 'plugin')
  // The machine that reported this had only the cache — the case the old notice
  // asserted was impossible.
  assert.equal(barePathWinner(win, `C:\\Windows;${winCache}`, 'win32').winner, 'plugin')
  assert.equal(barePathWinner(win, 'C:\\Windows', 'win32').winner, 'neither')

  // Windows compares case-insensitively and does not care which separator was
  // typed; Linux is exact about both.
  assert.equal(barePathWinner(win, winBin.toUpperCase(), 'win32').winner, 'standalone')
  assert.equal(barePathWinner(win, winBin.replace(/\\/g, '/'), 'win32').winner, 'standalone')
  assert.equal(barePathWinner('/home/alice', '/HOME/ALICE/.claude/bin', 'linux').winner, 'neither',
    'a case-insensitive match on Linux would be wrong, not lenient')

  // An unreadable PATH is a look that did not happen (CLAUDE.md §3). It must not
  // be reported as a measured absence, and it must not be expressible only by
  // omitting the argument — the default-parameter trap this seam was written to
  // avoid.
  assert.equal(barePathWinner(win, undefined, 'win32').known, false)
  assert.equal(barePathWinner(win, null, 'win32').known, false)
  assert.equal(barePathWinner(win, '', 'win32').known, true,
    'an EMPTY PATH searches nothing, which is measured, not unknown')
  assert.equal(barePathWinner(win, '', 'win32').winner, 'neither')
})

test('a forwarder that could not run the gate does not report a pass', { skip: process.platform === 'win32' }, () => {
  // THIS TEST USED TO ASSERT THE DEFECT, and its comment carried the reasoning
  // that produced it: "the harness failing to run is never a finding about the
  // user's file. A non-zero here would make a project's own gate fail because a
  // tool is absent, which is the block this harness spent a release removing."
  //
  // That is CLAUDE.md §3 applied one level too far. §3 is about a gate that RAN
  // and found problems — it advises rather than refusing. A gate that could not
  // run has made NO observation, and in a shell `exit 0` is an observation.
  // Reported 2026-08-29 by a session running these gates elsewhere, with a
  // fixture: `adr-lint <record> && <the rest>` — the shape this project's own
  // task template encourages — sees success and CONTINUES, `adr-verify` records
  // exit 0 against the task, and the diagnostics went to stderr where nothing
  // reads them back. A tool-written false PASS in a Verification Log, from the
  // layer that exists to prevent exactly that.
  //
  // 4 is this repository's own "could not check" code, set by ADR-005 in
  // spec-verify. adr-verify already answered the same question one file over:
  // a zero exit that scored no tests is recorded as exit 1, because a filter
  // matching nothing is not a passing gate.
  const directory = home()
  const script = path.join(directory, 'adr-lint')
  writeFileSync(script, forwarderScript('adr-lint', path.join(directory, 'empty')))
  chmodSync(script, 0o755)
  try {
    const env = { ...process.env, HOME: directory }
    const run = spawnSync(script, [], { encoding: 'utf8', env })
    assert.equal(run.status, 4, `could-not-run has its own code, not 0:\n${run.stderr}`)
    assert.match(run.stderr, /did NOT run/, run.stderr)
    assert.match(run.stderr, /not a pass/, run.stderr)
    assert.doesNotMatch(run.stderr, /nothing is blocked/,
      '"nothing is blocked" is a decision, not a description — the gate not running IS the condition')

    // THE CONSEQUENCE, asserted rather than inferred from the exit code. This is
    // the shape that fabricated the evidence, and it is what has to stop working.
    const fence = spawnSync('sh', ['-c', `"${script}" && echo CONTINUED`], { encoding: 'utf8', env })
    assert.doesNotMatch(fence.stdout, /CONTINUED/,
      `an acceptance fence must not continue past a gate that never ran:\n${fence.stdout}`)
    assert.notEqual(fence.status, 0, 'and the fence itself must not exit 0')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the Windows forwarder uses CRLF and resolves the bare name through PATHEXT', () => {
  const text = forwarderCmd('adr-lint')
  assert.match(text, /\r\n/, 'cmd needs CRLF; an LF shim fails in confusing ways')
  assert.match(text, /where \/q py/, 'a Windows Python is python.exe, not python3')
  assert.doesNotMatch(text, /\$HOME/, 'cmd does not expand $HOME')
  assert.match(text, /%USERPROFILE%/)
})

test('a real forwarder resolves and runs the gate it names', { skip: process.platform === 'win32' }, () => {
  const directory = home()
  const script = path.join(directory, 'adr-lint')
  writeFileSync(script, forwarderScript('adr-lint', directory))
  chmodSync(script, 0o755)
  // A cache holding this very checkout, so the forwarder runs a real gate.
  const cache = path.join(cacheDirectory(directory), '9.9.9')
  mkdirSync(path.dirname(cache), { recursive: true })
  symlinkSync(root, cache, 'dir')
  try {
    const run = spawnSync(script, ['ADR-001-selftest.md', 'tasks'], {
      cwd: path.join(repoRoot, 'tests', 'fixtures', 'ok'),
      encoding: 'utf8',
      env: { ...process.env, HOME: directory },
    })
    assert.equal(run.status, 0, `${run.stdout}${run.stderr}`)
    assert.match(run.stdout, /\[PASS\]/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a gate is recognised by its subject, and by its opening line when it has no subject', () => {
  // Both shapes ship in this set. Checking only the first one refused
  // adr-retire-check, a genuine plugin copy, and left it drifted.
  const directory = home({
    'named': '#!/usr/bin/env python3\n"""adr-lint — a description that has since changed.\n',
    // Verbatim: a gate with no subject is matched on its whole opening line, so
    // a paraphrase is a different gate as far as this check is concerned.
    'unnamed': '#!/usr/bin/env python3\n"""Verify an opt-in ADR archive catalog and its active discovery/obligation receipts.\n',
    'reworded': '#!/usr/bin/env python3\n"""Verify an opt-in ADR archive catalog.\n',
    'mine': '#!/usr/bin/env python3\n"""my own tool that happens to share a name.\n',
  })
  try {
    assert.ok(sameLineage(path.join(directory, 'named'), path.join(root, 'bin', 'adr-lint'), 'gate'))
    assert.ok(sameLineage(path.join(directory, 'unnamed'),
      path.join(root, 'bin', 'adr-retire-check'), 'gate'))
    assert.ok(!sameLineage(path.join(directory, 'mine'), path.join(root, 'bin', 'adr-lint'), 'gate'))
    // Deliberately conservative: with no subject to anchor on there is nothing
    // left that survives a reworded description, so this reports and skips
    // rather than overwriting a file it cannot identify.
    assert.ok(!sameLineage(path.join(directory, 'reworded'),
      path.join(root, 'bin', 'adr-retire-check'), 'gate'))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a file this plugin never installed is left alone', () => {
  // The home config directory holds the user's own tools beside ours. Overwriting
  // one because it shares a name would destroy work nobody asked us to touch.
  const directory = home({
    '.claude/bin/adr-lint': '#!/usr/bin/env python3\n"""my own tool, same name.\n',
  })
  try {
    const entry = linkPlan(root, directory).find(e => e.to.endsWith(`bin${path.sep}adr-lint`))
    assert.equal(entry.state, 'skipped')
    assert.match(entry.why, /may be your own/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a forwarder this tool wrote may be rewritten by it', () => {
  const directory = home({ '.claude/bin/adr-lint': `#!/bin/sh\n# ${FORWARDER_MARK}\necho old\n` })
  try {
    const entry = linkPlan(root, directory).find(e => e.to.endsWith(`bin${path.sep}adr-lint`))
    assert.equal(entry.state, 'replaced')
    assert.equal(replaceable(entry, directory).why, 'our forwarder')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a symlink pointing outside this plugin is left alone', () => {
  const directory = home({ 'elsewhere/adr-lint': 'not ours\n' })
  mkdirSync(path.join(directory, '.claude', 'bin'), { recursive: true })
  symlinkSync(path.join(directory, 'elsewhere', 'adr-lint'),
    path.join(directory, '.claude', 'bin', 'adr-lint'))
  try {
    const entry = linkPlan(root, directory).find(e => e.to.endsWith(`bin${path.sep}adr-lint`))
    assert.equal(entry.state, 'skipped')
    assert.match(entry.why, /outside this plugin/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a skill this plugin does not ship is unreachable, not merely unlisted', () => {
  // The guard that matters. autoresearch, codebase-memory and the aiagentmemory
  // binaries live in the same directories as ours; the plan is built from the
  // PLUGIN's contents, so no path to them can be constructed at all.
  const directory = home({
    '.claude/skills/autoresearch/SKILL.md': '---\nname: autoresearch\n---\n',
    '.claude/bin/aiagentmemory': '#!/bin/sh\n',
  })
  try {
    const targets = linkPlan(root, directory).map(entry => entry.to)
    assert.ok(!targets.some(target => target.includes('autoresearch')))
    assert.ok(!targets.some(target => target.includes('aiagentmemory')))
    assert.ok(targets.some(target => target.endsWith(`bin${path.sep}adr-verify`)))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('no skill is ever linked, because a link would hide the namespaced skill', () => {
  // Linking a personal skill at the plugin's OWN skill directory makes both
  // resolve to one path, and the loader then offers one skill rather than two:
  // the bare name survives and `quality-harness:<name>` disappears. Reported
  // 2026-08-27 by the session that installed the links — "where quality-harness:
  // work skill gone?" — and the namespaced entrypoint is the documented one.
  const directory = home({
    '.claude/skills/adr-write/SKILL.md': '---\nname: adr-write\n---\nan existing bare-name copy\n',
  })
  try {
    for (const platform of ['darwin', 'linux', 'win32']) {
      const skills = linkPlan(root, directory, platform)
        .filter(entry => entry.to.includes(`${path.sep}skills${path.sep}`))
      assert.deepEqual(skills, [], `${platform} planned a skill link`)
    }
    // Gates have no such collision and are still planned.
    const rest = linkPlan(root, directory).map(entry => entry.lineage)
    assert.ok(rest.includes('gate') && rest.includes('shim'), rest.join(','))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('no template is linked either, so nothing this plans can dangle', () => {
  // Templates never hid anything — no path identity, no lost entrypoint — but
  // nothing reads the home templates directory once the bare-name skills are
  // gone — every skill names its template under the plugin root — and
  // a link names ONE version. Measured 2026-08-28 against this machine's cache:
  // 23 released versions already evicted, including the two either side of the
  // release the six links were written against. A link naming an evicted version
  // dangles, and a dangle reads as ABSENT rather than old — `digest()` returns
  // null and the drift notice says nothing at all. A stale copy gets reported.
  const directory = home({ '.claude/templates/adr-template.md': 'a copy kept by hand\n' })
  try {
    for (const platform of ['darwin', 'linux', 'win32']) {
      const planned = linkPlan(root, directory, platform)
      assert.deepEqual(planned.filter(e => e.lineage === 'template'), [],
        `${platform} planned a template link`)
      // Nothing at all is linked now; every entry is a forwarder that carries no
      // version and so cannot fall behind or point at a directory that is gone.
      assert.deepEqual([...new Set(planned.map(e => e.kind))], ['forwarder'],
        `${platform} planned something that names a version`)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('every gate the plugin ships gets both a forwarder and a Windows shim', () => {
  const directory = home()
  try {
    const plan = linkPlan(root, directory)
    const gates = plan.filter(e => e.lineage === 'gate').map(e => path.basename(e.to)).sort()
    const shims = plan.filter(e => e.lineage === 'shim').map(e => path.basename(e.to, '.cmd')).sort()
    assert.deepEqual(gates, shims, 'a gate with no shim is unreachable from Windows')
    assert.ok(gates.includes('adr-verify'))
    // Names matching is not enough: a .cmd holding a `#!/bin/sh` body has the
    // right name and is inert on Windows, which is the whole failure the shim
    // exists to prevent. Found 2026-08-27 by a mutation that swapped the two
    // generators and stayed green.
    for (const shim of plan.filter(e => e.lineage === 'shim')) {
      assert.match(shim.contents, /^@echo off\r\n/, path.basename(shim.to))
      assert.doesNotMatch(shim.contents, /^#!/, path.basename(shim.to))
    }
    for (const gate of plan.filter(e => e.lineage === 'gate')) {
      assert.match(gate.contents, /^#!\/bin\/sh\n/, path.basename(gate.to))
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the original is kept before it is replaced', () => {
  // Asked for on 2026-08-27 — "i need to backup my original ones first then" —
  // and the right answer is that nobody should have to. A backup you must
  // remember is the same failure as a sync you must remember.
  const directory = home({ '.claude/bin/adr-lint': '#!/usr/bin/env python3\n"""adr-lint — old.\n' })
  try {
    const entry = linkPlan(root, directory).find(e => e.to.endsWith(`bin${path.sep}adr-lint`))
    assert.equal(entry.state, 'replaced')
    const kept = write(entry, 'stamp', directory)
    assert.equal(readFileSync(kept, 'utf8'), '#!/usr/bin/env python3\n"""adr-lint — old.\n')
    assert.ok(kept.startsWith(backupRoot('stamp', directory)))
    // And the new one is in place, so the archive is not a substitute for the work.
    assert.ok(readFileSync(entry.to, 'utf8').includes(FORWARDER_MARK))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a directory is kept whole, not just the one file that named it', () => {
  // `archive` is asked to keep whatever is at a path before anything replaces
  // it, and a home config directory holds directories — a hand-made bare-name
  // skill is one. Losing everything but the file that named it would be a silent
  // data loss at the moment the backup matters most.
  //
  // This calls `archive` rather than `write`: the guarantee belongs to the
  // function that has the `recursive` flag, and routing through `write` meant
  // hand-building a plan entry no planner produces, which is the shape
  // `mutate-propose` exists to find.
  const directory = home({
    '.claude/skills/adr-write/SKILL.md': '---\nname: adr-write\n---\nold\n',
    '.claude/skills/adr-write/references/notes.md': 'a reference nothing else records\n',
  })
  try {
    const kept = archive({
      to: path.join(directory, '.claude', 'skills', 'adr-write'),
      relative: path.join('skills', 'adr-write'),
    }, 'stamp', directory)
    assert.equal(readFileSync(path.join(kept, 'references', 'notes.md'), 'utf8'),
      'a reference nothing else records\n')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a symlink is archived as a symlink, not as what it points at', () => {
  // The home skills directory holds a tracked symlink out to another repository.
  // Copying through it would pull that whole repository into a backup directory
  // and call it an original.
  const directory = home({ 'elsewhere/SKILL.md': '---\nname: adr-write\n---\n' })
  mkdirSync(path.join(directory, '.claude', 'skills'), { recursive: true })
  symlinkSync(path.join(directory, 'elsewhere'),
    path.join(directory, '.claude', 'skills', 'adr-write'), 'dir')
  try {
    const kept = archive({
      to: path.join(directory, '.claude', 'skills', 'adr-write'),
      relative: path.join('skills', 'adr-write'),
    }, 'stamp', directory)
    assert.ok(lstatSync(kept).isSymbolicLink(), 'the backup must not dereference it')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a dangling symlink is archived rather than throwing mid-run', () => {
  // The case the explicit branch exists for, and the one the first test missed:
  // cpSync preserves a live link but throws ENOENT on a broken one. A home
  // config directory collects broken links, because the checkout a skill points
  // at gets moved — and an exception here loses the originals of every entry
  // after it.
  const directory = home()
  mkdirSync(path.join(directory, '.claude', 'skills'), { recursive: true })
  const broken = path.join(directory, '.claude', 'skills', 'adr-write')
  symlinkSync(path.join(directory, 'moved-away'), broken)
  try {
    const kept = archive({ to: broken, relative: path.join('skills', 'adr-write') },
      'stamp', directory)
    assert.ok(lstatSync(kept).isSymbolicLink())
    assert.equal(readlinkSync(kept), path.join(directory, 'moved-away'))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('nothing to keep is not an error', () => {
  const directory = home()
  try {
    assert.equal(archive({
      to: path.join(directory, 'absent'), relative: 'absent',
    }, 'stamp', directory), null)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a copy of any released version is recognised, not only the newest', () => {
  // The reason lineage matching exists at all: a standalone set installed months
  // ago matches a version still in the cache long after it stopped being current.
  const directory = home()
  const cache = cacheDirectory(directory)
  mkdirSync(path.join(cache, '1.2.3', 'bin'), { recursive: true })
  writeFileSync(path.join(cache, '1.2.3', 'bin', 'adr-lint'), 'an old release\n')
  try {
    const digests = knownDigests(path.join('bin', 'adr-lint'), directory)
    assert.equal(digests.size, 1)
    assert.equal(knownDigests(path.join('bin', 'absent-everywhere'), directory).size, 0)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a Windows shim is recognised whether it is a forwarder or the copy it replaces', () => {
  const directory = home({
    'ours': `@echo off\r\nrem ${FORWARDER_MARK}\r\n`,
    'copied': '@echo off\r\nwhere /q py && (py -3 "%~dp0adr-lint" %*)\r\n',
    'theirs': '@echo off\r\necho something else entirely\r\n',
  })
  try {
    assert.ok(sameLineage(path.join(directory, 'ours'), '', 'shim'))
    assert.ok(sameLineage(path.join(directory, 'copied'), '', 'shim'))
    assert.ok(!sameLineage(path.join(directory, 'theirs'), '', 'shim'))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a template is recognised by its title, which survives edits to the body', () => {
  const directory = home({
    'drifted': '# ADR-NNN: <Verb + noun title>\n\nan older body entirely\n',
    'foreign': '# My own notes\n\nnothing to do with this plugin\n',
  })
  const source = path.join(root, 'templates', 'adr-template.md')
  try {
    assert.ok(sameLineage(path.join(directory, 'drifted'), source, 'template'))
    assert.ok(!sameLineage(path.join(directory, 'foreign'), source, 'template'))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a directory where a file belongs is reported, not clobbered', () => {
  // Someone made the home entry for a gate a directory. Whatever that is, it is
  // not the file this plugin installed, and removing it recursively to put a
  // forwarder there is exactly the kind of write this refuses.
  const directory = home({ '.claude/bin/adr-verify/inside': 'a file within\n' })
  try {
    const entry = linkPlan(root, directory)
      .find(e => e.to.endsWith(`bin${path.sep}adr-verify`))
    assert.equal(entry.state, 'skipped')
    assert.match(entry.why, /directory where a file belongs/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a directory in bin/ is not a gate, whatever it is named', () => {
  // Any Python import of a gate creates bin/__pycache__ unless it sets
  // dont_write_bytecode, and every enumeration here tested the NAME — dotless —
  // rather than asking whether it is a file. Found 2026-08-28 when an ad-hoc
  // import during debugging made five suites fail at once, and `--link` would
  // have generated a forwarder pointing at a directory.
  const source = home({ 'bin/real-gate': '#!/usr/bin/env python3\n"""real-gate — a gate.\n' })
  mkdirSync(path.join(source, 'bin', '__pycache__'), { recursive: true })
  const directory = home()
  try {
    const named = linkPlan(source, directory).map(entry => path.basename(entry.to))
    assert.ok(named.includes('real-gate'), named.join(','))
    assert.ok(!named.some(name => name.startsWith('__pycache__')),
      `a directory got a forwarder: ${named.join(',')}`)
  } finally {
    rmSync(source, { recursive: true, force: true })
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a plugin with no gates yields no forwarders rather than throwing', () => {
  const empty = home()
  const directory = home()
  try {
    assert.deepEqual(linkPlan(empty, directory).filter(e => e.lineage === 'gate'), [])
  } finally {
    rmSync(empty, { recursive: true, force: true })
    rmSync(directory, { recursive: true, force: true })
  }
})

test('an archive that cannot create a symlink records its target instead', () => {
  // Windows refuses symlink creation to an unprivileged account. Measured on a
  // real machine 2026-08-27: archive() threw EPERM, so write() threw, so the
  // repoint never happened, and thirteen of nineteen skill links stayed pinned
  // to the previous release. An archive that can fail takes the work with it.
  const directory = home({ 'elsewhere/SKILL.md': '---\nname: adr-write\n---\n' })
  mkdirSync(path.join(directory, '.claude', 'skills'), { recursive: true })
  const link = path.join(directory, '.claude', 'skills', 'adr-write')
  symlinkSync(path.join(directory, 'elsewhere'), link, 'junction')
  const refuse = () => { const error = new Error('EPERM'); error.code = 'EPERM'; throw error }
  try {
    const kept = archive({ to: link, relative: path.join('skills', 'adr-write') },
      'stamp', directory, refuse)
    assert.equal(readFileSync(kept, 'utf8').trim(), path.join(directory, 'elsewhere'),
      'the target is the whole content of a link, so recording it loses nothing')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the write still happens when the archive cannot make a link', {
  skip: process.platform === 'win32' ? 'no unprivileged file symlink' : false,
}, () => {
  // The failure that mattered: archive threw, so write threw, so the entry was
  // never installed. Thirteen of nineteen entries stayed on the previous release
  // and the run reported "6 of 19 installed". A gate left as a symlink by an
  // older version of this tool is the case that still reaches it.
  const directory = home()
  const old = path.join(cacheDirectory(directory), '1.0.0', 'bin')
  mkdirSync(old, { recursive: true })
  writeFileSync(path.join(old, 'adr-verify'), 'last release\n')
  mkdirSync(path.join(directory, '.claude', 'bin'), { recursive: true })
  const link = path.join(directory, '.claude', 'bin', 'adr-verify')
  symlinkSync(path.join(old, 'adr-verify'), link)
  const refuse = () => { const error = new Error('EPERM'); error.code = 'EPERM'; throw error }
  try {
    const entry = linkPlan(root, directory).find(e => e.to.endsWith(`bin${path.sep}adr-verify`))
    assert.equal(entry.state, 'replaced')
    // Only the ARCHIVE's link creation is refused; the forwarder itself must land.
    write(entry, 'stamp', directory, refuse)
    assert.ok(!lstatSync(link).isSymbolicLink(), 'the link was left in place')
    assert.equal(readFileSync(link, 'utf8'), entry.contents)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})


// ADR-019 T1. The record's own Decision, asserted route by route.
//
// The rule this replaces would have been residual — "in a scanned directory and
// not shipped now, therefore ours" — and it was measured WRONG before a line was
// written: four of the six files in this machine's home hooks directory belong to
// autoresearch and codebase-memory, and three of those were wired in the user's
// settings and running. A residual rule names all four and advises deleting three
// live hooks. So identification is positive, and every route is asserted alone.
function releases(directory, tree) {
  const cache = cacheDirectory(directory)
  for (const [version, files] of Object.entries(tree)) {
    for (const [relative, contents] of Object.entries(files)) {
      const full = path.join(cache, version, relative)
      mkdirSync(path.dirname(full), { recursive: true })
      writeFileSync(full, contents)
    }
  }
  return directory
}

test('a file the plugin no longer ships is ours only when something proves it', () => {
  const body = '#!/usr/bin/env python3\n"""probe — a retired gate."""\n'
  const directory = releases(home({ '.claude/bin/probe': body }), {
    '2.1.0': { 'bin/probe': body },
  })
  // Route 1, digest. The basename is gone from the current tree, and a release
  // carries a byte-identical copy.
  assert.deepEqual(
    formerlyShipped('probe', directory).map(found => found.version), ['2.1.0'])
  assert.equal(classifyHomeFile({
    file: path.join(directory, '.claude', 'bin', 'probe'),
    name: 'probe', shippedNow: false, homeDirectory: directory,
  }).state, 'ours-orphan')

  // Route 2, the forwarder mark, with NO release holding the basename at all —
  // so the digest route cannot be what answered.
  const forwarder = home({ '.claude/bin/gone': `#!/bin/sh\n# ${FORWARDER_MARK}\n` })
  assert.deepEqual(formerlyShipped('gone', forwarder), [])
  assert.equal(classifyHomeFile({
    file: path.join(forwarder, '.claude', 'bin', 'gone'),
    name: 'gone', shippedNow: false, homeDirectory: forwarder,
  }).state, 'ours-orphan')

  // Route 3, lineage: same opening docstring, DIFFERENT bytes, so route 1 cannot
  // answer for it.
  const drifted = releases(home({
    '.claude/bin/probe': body + '# edited locally\n',
  }), { '2.1.0': { 'bin/probe': body } })
  const found = classifyHomeFile({
    file: path.join(drifted, '.claude', 'bin', 'probe'),
    name: 'probe', shippedNow: false, homeDirectory: drifted,
  })
  assert.equal(found.state, 'ours-orphan')
  assert.equal(found.route, 'lineage', `the digest route must not be what answered: ${found.route}`)
})

test('a file no release ever shipped is unidentified, not an orphan of ours', () => {
  // The four measured on 2026-09-01 in this machine's home hooks directory. They
  // belong to autoresearch and codebase-memory; three were wired and running.
  const strangers = ['autoresearch-context.sh', 'cbm-code-discovery-gate',
    'cbm-session-reminder', 'cbm-subagent-reminder']
  const files = Object.fromEntries(
    strangers.map(name => [`.claude/hooks/${name}`, `#!/bin/sh\n# ${name}\n`]))
  const directory = releases(home(files), { '2.1.0': { 'scripts/post-edit-check.sh': 'ours\n' } })
  for (const name of strangers) {
    assert.equal(classifyHomeFile({
      file: path.join(directory, '.claude', 'hooks', name),
      name, shippedNow: false, homeDirectory: directory,
    }).state, 'unidentified', `${name} belongs to another tool`)
  }
})

test("another vendor's file is unidentified even when the basename is in some cache", () => {
  // The fixture that actually reaches route 3. The previous test proves only that
  // a basename ABSENT from the cache is unmatched, which lineage was never at risk
  // of; this plants the collision. `sameLineage` compares opening docstrings and a
  // `%~dp0` pattern, neither specific to this plugin, so the walk being bound to
  // this plugin's own cache namespace is what stops another vendor's same-named
  // file from satisfying it.
  const body = '#!/usr/bin/env python3\n"""cbm-session-reminder — a probe."""\n'
  const directory = home({ '.claude/hooks/cbm-session-reminder': body })
  const foreign = path.join(directory, '.claude', 'plugins', 'cache',
    'codebase-memory', 'codebase-memory', '1.0.0', 'hooks')
  mkdirSync(foreign, { recursive: true })
  writeFileSync(path.join(foreign, 'cbm-session-reminder'), body)

  assert.deepEqual(formerlyShipped('cbm-session-reminder', directory), [],
    "another vendor's cache is not this plugin's history")
  assert.equal(classifyHomeFile({
    file: path.join(directory, '.claude', 'hooks', 'cbm-session-reminder'),
    name: 'cbm-session-reminder', shippedNow: false, homeDirectory: directory,
  }).state, 'unidentified')
})

test('a basename that moved between releases is still recognised', () => {
  // ADR-008 moved the gates under `plugin/` on 2026-08-28, and the home `hooks/`
  // directory has never shared a name with the plugin directory that fills it. A
  // lookup pinned to one relative path answers "no" for a file that shipped for a
  // year under another.
  const body = 'dispatch\n'
  const directory = releases(home({ '.claude/hooks/facts.sh': body }), {
    '2.0.0': { 'hooks/facts.sh': body },
    '2.30.0': { 'scripts/facts.sh': body },
  })
  assert.deepEqual(formerlyShipped('facts.sh', directory).map(f => f.relative).sort(),
    ['hooks/facts.sh', 'scripts/facts.sh'])
})

test('a cache directory that is not a release contributes nothing', () => {
  // Real: this machine's cache holds a 2.0.0 directory with AUTHn, cuda-1.9 and
  // maximum in it, which is not a release of this plugin (BACKLOG §96).
  const directory = releases(home({ '.claude/bin/probe': 'x\n' }), {
    '2.0.0': { 'cuda-1.9/AUTHn': 'x\n', 'maximum/QDRn': 'x\n' },
  })
  assert.deepEqual(formerlyShipped('probe', directory), [])
  assert.equal(classifyHomeFile({
    file: path.join(directory, '.claude', 'bin', 'probe'),
    name: 'probe', shippedNow: false, homeDirectory: directory,
  }).state, 'unidentified')
})

test('a file the plugin ships today is never called an orphan', () => {
  const directory = releases(home({ '.claude/bin/probe': 'x\n' }), {
    '2.1.0': { 'bin/probe': 'x\n' },
  })
  assert.equal(classifyHomeFile({
    file: path.join(directory, '.claude', 'bin', 'probe'),
    name: 'probe', shippedNow: true, homeDirectory: directory,
  }).state, 'ours-shipped', 'still shipped wins over every orphan route')
})


// ADR-019 T2. The scan set is DERIVED, and the derivation is the point: the
// hand-written table missed `workflows` for four days after the hooks gap it was
// written to close, so the set a PAST installer may have written into is computed
// from the releases rather than remembered.
test('the scan set is derived from what the releases shipped', () => {
  const body = 'retired\n'
  const directory = releases(home({
    '.claude/attic/relic': body,   // only an OLD release shipped `attic`
    '.claude/nowhere/thing': 'x\n', // no release ever shipped `nowhere`
  }), { '2.1.0': { 'attic/relic': body } })

  const rows = orphans(directory)
  assert.ok(rows.some(row => row.directory === 'attic' && row.name === 'relic'),
    `a directory only an old release shipped must be scanned: ${JSON.stringify(rows)}`)
  assert.ok(!rows.some(row => row.directory === 'nowhere'),
    'a directory no release ever shipped is not ours to look in')
})

test('a home directory SHADOW_SCOPE names is scanned though no release shipped that name', () => {
  // The plugin ships its hook scripts under `scripts/` and they land in `hooks/`,
  // so deriving from release directory names alone would never look there.
  const body = '#!/bin/sh\n# an old dispatcher\n'
  const directory = releases(home({ '.claude/hooks/facts.sh': body }), {
    '2.1.0': { 'scripts/facts.sh': body },
  })
  assert.ok(orphans(directory).some(row => row.directory === 'hooks' && row.name === 'facts.sh'),
    'the home hooks directory is in the scan set on SHADOW_SCOPE\'s account')
})

test('an unidentified file gets a row rather than being dropped', () => {
  const directory = releases(home({ '.claude/bin/stranger': 'not ours\n' }),
    { '2.1.0': { 'bin/probe': 'ours\n' } })
  const row = orphans(directory).find(entry => entry.name === 'stranger')
  assert.ok(row, 'the count must be available without a second walk')
  assert.equal(row.state, 'unidentified')
})

test('an absent home directory is not an error', () => {
  const body = 'x\n'
  const directory = releases(home({ '.claude/bin/probe': body }),
    { '2.1.0': { 'bin/probe': body, 'templates/t.md': body, 'attic/a': body } })
  const rows = orphans(directory)
  assert.ok(rows.some(row => row.name === 'probe'),
    'directories the user does not have must not stop the ones they do')
})

test('a home with nothing of ours returns no orphan rows, and one planted returns one', () => {
  // The clean answer shown able to be dirty, in the same test and on the same
  // fixture. `deepEqual(orphans(home), [])` passes at 100% line and branch
  // coverage against a function mutated to return [] (CLAUDE.md §4).
  const body = 'retired\n'
  const directory = releases(home({}), { '2.1.0': { 'bin/probe': body } })
  assert.deepEqual(orphans(directory).filter(row => row.state === 'ours-orphan'), [])
  mkdirSync(path.join(directory, '.claude', 'bin'), { recursive: true })
  writeFileSync(path.join(directory, '.claude', 'bin', 'probe'), body)
  const dirty = orphans(directory).filter(row => row.state === 'ours-orphan')
  assert.equal(dirty.length, 1, `a planted orphan must be found: ${JSON.stringify(dirty)}`)
  assert.equal(dirty[0].evidence.route, 'digest')
  assert.equal(dirty[0].evidence.version, '2.1.0')
})


// ADR-019 T3 S4. The negative the whole record rests on, asserted on the FILE
// afterwards rather than by spying on a call: a spy proves the code's current
// shape, reading the bytes proves the property, and survives a refactor that
// reaches the filesystem another way.
test('neither write mode touches a file it named as an orphan', () => {
  const body = '#!/bin/sh\n# a retired checker\n'
  const directory = releases(home({ '.claude/attic/relic.sh': body }), {
    '2.1.0': { 'attic/relic.sh': body },
  })
  const target = path.join(directory, '.claude', 'attic', 'relic.sh')
  const row = orphans(directory).find(entry => entry.name === 'relic.sh')
  assert.equal(row.state, 'ours-orphan', 'the fixture must actually be named as one')

  const sync = path.join(process.cwd(), 'plugin', 'scripts', 'sync-standalone.mjs')
  for (const argv of [['--apply'], ['--link', '--apply']]) {
    spawnSync(process.execPath, [sync, ...argv],
      { encoding: 'utf8', env: { ...process.env, HOME: directory, USERPROFILE: directory } })
    assert.equal(readFileSync(target, 'utf8'), body,
      `${argv.join(' ')} must leave a named orphan present and byte-identical`)
  }
})


// Reported 2026-09-01 on GitHub issue #3, after ADR-019 shipped and named the
// reporter's file correctly. The VERDICT was right and the CITATION was wrong:
//
//   orphan   ~\.claude\tests\selftest.sh — last shipped in 2.0.0, matched by lineage
//
// Wrong on both readings. As "the last release that shipped this file" it is
// false — `scripts/selftest.sh` ships through 2.28.0 on that machine, so 2.0.0 is
// the FIRST. As "the release whose content matched" it is the worst available
// pick: measured across every cached copy, 2.0.0 shares 0 of the file's 89 unique
// non-blank lines while later releases share 4.
//
// That matters because the citation is the part a user acts on. Someone checking
// "was this really mine?" diffs against 2.0.0, finds nothing in common, and
// concludes the tool is wrong when its verdict is right.
test('an orphan cites the release it best matches, not the first one found', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'link-cite-'))
  const cache = cacheDirectory(home)
  const mine = '#!/bin/sh\nhave adr-lint\nhave adr-verify\nhave spec-verify\nhave arch-lint\n'
  const write = (version, relative, body) => {
    const full = path.join(cache, version, relative)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, body)
  }
  // The earliest release shares only the shebang; a later one shares almost all
  // of it. Both are found by basename, and only one is worth citing.
  write('2.0.0', 'scripts/probe.sh', '#!/bin/sh\nsomething else entirely\n')
  write('2.28.0', 'scripts/probe.sh', mine.replace('have arch-lint\n', ''))
  mkdirSync(path.join(home, '.claude', 'tests'), { recursive: true })
  writeFileSync(path.join(home, '.claude', 'tests', 'probe.sh'), mine)

  const verdict = classifyHomeFile({
    file: path.join(home, '.claude', 'tests', 'probe.sh'),
    name: 'probe.sh', shippedNow: false, homeDirectory: home,
  })
  assert.equal(verdict.state, 'ours-orphan')
  assert.equal(verdict.route, 'lineage')
  assert.equal(verdict.version, '2.28.0',
    `the citation must name the best match, not the first found: ${JSON.stringify(verdict)}`)
  assert.ok(verdict.shared > 0,
    `and say what matched, so a reader can check it: ${JSON.stringify(verdict)}`)
})

test('a cached version list is ordered numerically, not lexically', () => {
  // CLAUDE.md names this trap by name — "lexical order puts 2.0.4 above 2.0.10,
  // and this cache holds both" — and the first version of formerlyShipped used a
  // bare .sort() anyway. With a lexical order even "the first release found" is
  // not reliably the first.
  const home = mkdtempSync(path.join(tmpdir(), 'link-order-'))
  const cache = cacheDirectory(home)
  for (const version of ['2.0.4', '2.0.10', '2.1.0']) {
    const full = path.join(cache, version, 'bin', 'probe')
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, `# ${version}\n`)
  }
  assert.deepEqual(formerlyShipped('probe', home).map(found => found.version),
    ['2.0.4', '2.0.10', '2.1.0'],
    '2.0.10 comes after 2.0.4, which a lexical sort gets backwards')
})


test('a citation says what matched, and never claims to be the last release', () => {
  // The citation is the part a reader acts on, so its WORDING is asserted rather
  // than left to whoever edits the renderer next. "last shipped in X" was false on
  // both readings (GitHub issue #3): X was the earliest release holding the
  // basename, and the one sharing none of the file's lines.
  const lineage = citeOrphan({ route: 'lineage', version: '2.28.0', first: null, shared: 4 })
  assert.match(lineage, /matched by lineage against 2\.28\.0/)
  assert.match(lineage, /4 line\(s\)/, 'a reader must be able to check what matched')
  assert.doesNotMatch(lineage, /last shipped/,
    'the tool does not know the last release that shipped a file, and must not say it does')

  // An exact match is exact, so it says so — and names the span rather than one
  // end of it, because "shipped in 2.0.0" invites the question the span answers.
  const span = citeOrphan({ route: 'digest', version: '2.28.0', first: '2.0.0', shared: null })
  assert.match(span, /identical to the copy shipped in 2\.0\.0 through 2\.28\.0/)
  const single = citeOrphan({ route: 'digest', version: '2.5.0', first: '2.5.0', shared: null })
  assert.match(single, /identical to the copy shipped in 2\.5\.0/)
  assert.doesNotMatch(single, /through/, 'one release is not a span')

  // A forwarder carries no version at all, and the citation must not invent one.
  assert.equal(citeOrphan({ route: 'forwarder', version: null, first: null, shared: null }),
    'matched by forwarder')
})

test('semver ordering puts 2.0.10 after 2.0.4 and keeps non-releases last', () => {
  assert.deepEqual(bySemver(['2.1.0', '2.0.10', '2.0.4', '2.0.0']),
    ['2.0.0', '2.0.4', '2.0.10', '2.1.0'])
  // The cache is a directory nothing prunes and it holds things that are not
  // releases — this machine's has a 2.0.0 full of `cuda-1.9` and `maximum`.
  assert.deepEqual(bySemver(['junk', '2.0.4', 'also-junk']), ['2.0.4', 'junk', 'also-junk'])
})

// BACKLOG §94. Both forwarders resolve the plugin by running a `node -e` program,
// so without node the resolver does not run — and an unrun resolver yields an
// empty root, which the next branch reported as "no installed plugin". Measured
// 2026-08-30 on Windows 11 with the plugin FULLY INSTALLED, two versions in the
// cache: the user was told to install what was already installed, and doing so
// changed nothing. "I could not look" is not "there is nothing there".
//
// §94 named only the .cmd forwarder. The sh forwarder has the same hole for the
// same reason — `2>/dev/null` discards node's own error — so both are asserted
// here. That is the class, not the instance.
test('a forwarder that cannot run its resolver says so, and blames neither the plugin', () => {
  for (const [label, text] of [['cmd', forwarderCmd('adr-lint')], ['sh', forwarderScript('adr-lint')]]) {
    // The probe comes BEFORE the resolver, or the wrong message is already printed.
    const probe = label === 'cmd'
      ? text.indexOf('where /q node')
      : text.indexOf('command -v node')
    assert.ok(probe >= 0, `${label}: node is never probed for`)
    assert.ok(probe < text.indexOf('-e'), `${label}: node is probed after the resolver runs`)

    // A DIFFERENT remedy, because that is the whole defect. "install or update
    // the plugin" is the advice that cannot work when node is what is missing.
    assert.match(text, /node is not on PATH/, `${label}: the absent thing is not named`)
    assert.match(text, /install Node\.js/, `${label}: the message must name a remedy that can work`)

    // A DIFFERENT exit code. Both mean the gate did not run and both stop an
    // `&&` fence, but collapsing them is what made the two states
    // indistinguishable to anything reading the code.
    assert.match(text, label === 'cmd' ? /exit \/b 5/ : /exit 5/,
      `${label}: "could not look" must not share exit 4 with "looked and found nothing"`)
    assert.match(text, label === 'cmd' ? /exit \/b 4/ : /exit 4/,
      `${label}: the found-nothing branch must still exit 4`)

    // Still not a pass, in either branch. This is the line the whole forwarder
    // exists for and a rewrite must not lose it.
    assert.match(text, /this is not a pass/, `${label}: an absent checker certifies nothing`)
  }

  // And the cmd probe must not reintroduce the parenthesised block: an unquoted
  // argument containing `)` closes it early, which is why the interpreter
  // selection above is a goto rather than an if.
  const cmd = forwarderCmd('adr-lint')
  assert.match(cmd, /^where \/q node && goto :havenode$/m,
    'the node probe must select by goto, not by a parenthesised block')
  assert.match(cmd, /^:havenode$/m, 'missing the label the node probe jumps to')
})
