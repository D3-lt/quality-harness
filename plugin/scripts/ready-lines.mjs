// The ready-task lines a session is oriented with: adr-next run over the repository, its first line said on its behalf,
// and what the record that owns a task says first. Moved out of lifecycle.mjs unchanged (BACKLOG section 375, stage B4).
// The interpreter probe is cached for the life of the process, here and nowhere else.
import { spawn, spawnSync } from 'node:child_process'
import os from 'node:os'
import { codeSpan, commandInCode, corpusText, pathInCode, quotedCorpusText, scrubber, shownPath } from './corpus-text.mjs'
import { PLUGIN_ROOT } from './plugin-root.mjs'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { TASK_DIRECTORY_READ_CAP, posixListed, taskDirectories, unmarkedArchives } from './decision-corpus.mjs'

// ADVISORY ONLY. This harness does not refuse a tool call — it tells the agent
// what it found and leaves the decision where it belongs.
//
// It used to block, and across three projects in one day it refused legitimate
// work six times: a commit gate that degraded with session length until nothing
// could be committed, a deletion sentinel that fired only on deletions already
// checked, a read-only `> /dev/null` read as authorship, an unfilled template
// shape stopping an edit that had already landed. Every one of those was the
// harness fighting its user, and the pattern is what it teaches: an agent that
// loses turns to a gate learns to route around the gate, and then the gate
// protects nothing at all.
//
// So a finding is now information, delivered at the moment it can still be acted
// on. What the harness gives up is the ability to STOP a fabricated claim; what
// it keeps is the ability to name one, loudly, every time it sees it. That was
// the owner's call, made explicitly and more than once.
// The one line a person sees. The full text is for the agent; the person needs
// to know a finding was made and where it went, not to read the instruction.
export function advisoryHeadline(reason) {
  const first = String(reason).split('\n').find(line => line.trim()) ?? String(reason)
  // ⚠ EVERY ADVISORY BEGINS `quality-harness: `, so "the first sentence", split
  // after a `.` or a `:`, was always that prefix and nothing else: the person read
  // "quality-harness advised the agent: quality-harness: (full text…)" — told a
  // finding was made and nothing about it. Two peer sessions flagged the line on
  // 2026-09-19. The caller already says who is speaking, so the prefix goes; and
  // only a FULL STOP ends the sentence, since these messages use `:` and `—` mid-clause.
  const sentence = first.trim().replace(/^quality-harness:\s*/i, '').split(/(?<=\.)\s/)[0]
  return sentence.length > 140 ? `${sentence.slice(0, 137)}…` : sentence
}

// SessionStart used to slice(0, 3) and hide a later directory's UNPROVEN
// behind "(+N more)". A could-not-look is never an ordinary ready line: it
// always surfaces; the cap still applies to ready/blocked/done lines (ADR-046 T5).
const EVIDENCED_SUMMARY = /^ {2}\(\d+ task director(?:y|ies) read (?:is|are) fully evidenced, not shown\)$/

export function surfaceReadyLines(lines, cap = 3) {
  let ordinary = 0
  const shown = []
  for (const line of lines) {
    // The evidenced count is never capped either: it is the answer to "why is
    // nothing listed", and hiding it re-creates the all-clear it replaced.
    const always = line.includes('UNPROVEN') || EVIDENCED_SUMMARY.test(line)
    if (always || ordinary < cap) {
      shown.push(line)
      if (!always) ordinary += 1
    }
  }
  const hidden = lines.length - shown.length
  if (hidden > 0) {
    // Two counts, two sentences, in the order a reader sums them: the directories
    // READ but not shown, then the ones NOT READ at all. Two Windows sessions read
    // `(+13 … UNPROVEN — not read …)` followed by `(+3 more record set(s))` as one
    // overlapping figure (2026-09-23), so the read-but-capped line now comes first
    // and says what it counts.
    const note = `  (+${hidden} more task director${hidden === 1 ? 'y' : 'ies'} read, not shown above)`
    const unread = shown.findIndex(line => /more task director(?:y|ies): UNPROVEN — not read/.test(line))
    if (unread >= 0) shown.splice(unread, 0, note)
    else shown.push(note)
  }
  return shown
}

// The gates in bin/ are `#!/usr/bin/env python3` scripts. Windows cannot exec a
// `#!` script, so spawning one directly returns status null — and readyTaskLines'
// `continue` swallowed that, leaving session orientation silently empty on every
// Windows session. Measured 2026-08-25 on windows-latest, where the hook produced
// nothing and reported no error. Name the interpreter there instead.
//
// Naming it is not the same as finding it. `python3` on a stock Windows 11 is an
// App Execution Alias under WindowsApps: a real, spawnable exe that is not Python.
// It prints "Python was not found; run without arguments to install from the
// Microsoft Store" to STDOUT — nothing on stderr — and exits 9009. So it sets no
// `error`, and an `error`-keyed fallback never fires; every gate came back 9009,
// which is neither 0 nor 3, and readyTaskLines swallowed it into the exact empty
// orientation the paragraph above says was fixed. Measured 2026-08-30 on Windows
// 11 build 26200.9168, where `py -3` ran the same gate and exited 3.
//
// Do not key the fallback on 9009 either. That is cmd.exe's own "command not
// found" code, borrowed by the alias, so it cannot separate "the interpreter never
// ran" from "the gate ran and returned 9009". The only honest question is whether
// the candidate answered AS PYTHON, which is why this probes for a known answer
// rather than detecting by name. resolve_bash() reaches for the same idea and
// only half-arrives: it skips the System32 WSL stub but NOT the WindowsApps
// launcher its own docstring names, so on a stock PATH it returns a 0-byte Store
// alias (BACKLOG §91). Probe; do not trust a name or an isfile().
// BACKLOG §93. The probe asked for the MAJOR version and threw the rest away, so
// a box with 3.14 and 3.10 both on PATH — four years and one semantic change
// apart — answered `3` either way and nothing recorded which one ran. §90 is the
// case where that mattered: the same guard returned different answers on each.
// Costs one format string; the acceptance check below still turns on the major.
const PYTHON_PROBE = 'import sys;print("%d.%d" % sys.version_info[:2])'

// Preference order. `py -3` is the launcher Windows actually ships for this and
// is the one standalone-link.mjs's cmd forwarder already reaches for; a bare
// `python` is next; `python3` is last because on Windows it is most often the
// alias. Every one of them is probed regardless — presence is never the evidence.
const WINDOWS_PYTHONS = [['py', '-3'], ['python'], ['python3']]

/**
 * The argv prefix that runs a real Python 3 on this machine, or null if nothing
 * on PATH answered as one. Windows only; POSIX execs the shebang itself.
 *
 * `candidates` and `run` are injected so the alias case is reachable from macOS
 * and Linux — a Windows-only branch with no seam is a branch with no test, and
 * that is precisely how the alias shipped past a suite that exercises the win32
 * branch on boxes where `python3` happens to be genuine.
 */
export function resolvePython(platform = process.platform, candidates = WINDOWS_PYTHONS, run = spawnSync) {
  if (platform !== 'win32') return null
  for (const [command, ...prefix] of candidates) {
    const probe = run(command, [...prefix, '-c', PYTHON_PROBE], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
    const answered = (probe.stdout ?? '').trim()
    // Keyed on the MAJOR: any 3.x is a real Python 3.
    if (probe.status === 0 && /^3(\.\d+)?$/.test(answered)) {
      return [command, ...prefix]
    }
  }
  return null
}

// Resolved once per process: readyTaskLines calls spawnGate per task directory,
// and re-probing three interpreters for each would cost more than the gates.
// `??=` would not do it — a machine with no Python resolves to null and would be
// re-probed on every call, three failed spawns each, exactly when probing is most
// expensive. The sentinel makes "asked, and the answer was none" a cached answer.
const UNPROBED = Symbol('python interpreter not yet resolved')

let cachedPython = UNPROBED

export function spawnGate(tool, args, options = {}, platform = process.platform, python) {
  // Hidden, and on Windows it is the whole point: a hook runs with no console, so a
  // child without windowsHide gets a console of its own, which Windows Terminal
  // opens as a tab that flashes (reported on 3.1.0, 2026-09-28).
  if (platform !== 'win32') return spawnSync(tool, args, { windowsHide: true, ...options })
  if (python === undefined && cachedPython === UNPROBED) cachedPython = resolvePython(platform)
  const interpreter = python !== undefined ? python : cachedPython
  if (!interpreter) {
    // No verdict here. A gate that could not start has not found anything, and
    // saying so is the whole of rule 3 — the shape matches spawnSync's own
    // "could not spawn" result so callers need no new branch to tell them apart.
    return {
      error: new Error('quality-harness: no Python 3 on PATH answered a version probe, so this gate did NOT run'),
      status: null, stdout: '', signal: null,
      stderr: 'quality-harness: no Python 3 found on PATH — an absent checker certifies nothing.\n',
    }
  }
  const [command, ...prefix] = interpreter
  return spawnSync(command, [...prefix, tool, ...args], { windowsHide: true, ...options })
}

// adr-next's first line, said on its behalf. A path under the repository is said relative to it,
// and the home directory as `~` — anything under it then becomes `~‹path›`, so no directory of the
// owner's other work is named — and a scratch checkout's absolute path is not repeated into the
// session; the rest is cleaned as corpus text is, because a task file's name reaches this line and
// must not print a control or a frame in this tool's voice (BACKLOG §319 item 6: js-spa-client, a
// symlink loop). Any absolute path left after that goes through `scrubber`, as the probe's does:
// `os.homedir()` as spelled missed a home path in any other spelling — an 8.3 short name, a
// resolved link — and it reached the session (BACKLOG §350 C4/F3, three Windows reports).
function gateSaid(text, root) {
  let out = String(text)
  for (const [prefix, placeholder] of [[root, '.'], [os.homedir(), '~']].filter(([prefix]) => prefix)) {
    for (const spelling of new Set([prefix, prefix.replaceAll('\\', '/'), prefix.replaceAll('/', '\\')])) {
      out = out.split(spelling).join(placeholder)
    }
  }
  return corpusText(scrubber({ root: null, pluginRoot: PLUGIN_ROOT })(out))
}

// What a ready line says first about the record that owns the task. adr-next's answer
// carries the owner's Status, and this line offered the task as ready whatever it was:
// under an owner that is binary or empty, or not Accepted (a Windows chaos round,
// 2.111.0-rc, P3). A record is a work order only once it is Accepted (CLAUDE.md §10).
function ownerCaveat(report) {
  if (report.undecided === true) {
    return `its record's Status is ${quotedCorpusText(report.status)}, not Accepted, so this is a plan, not a work order — `
  }
  if (report.owner_unreadable === true) {
    return 'its record was found but could not be read as one, so whether it is Accepted is UNKNOWN and this may not be a work order — '
  }
  return ''
}

// What a ready line says right after the task it offers when no record owns the tasks (BACKLOG
// §350 C6, a fail-open: with the record deleted, the line offered the task with no word). Said
// AFTER "is ready —", not first like the two above: ADR-068 T2 locks a test whose ownerless
// `docs/tasks` fixture expects "`docs/tasks`: T1 is ready —", and a locked test stays
// byte-identical (CLAUDE.md §2). It is still said before the instruction to prove the task.
function missingOwnerCaveat(report) {
  if (report.owner_missing === true) {
    return 'no record owning these tasks was found, so whether they are a work order is UNKNOWN — '
  }
  return ''
}

export function readyTaskLines(root, insideRepository, listing, spawn = spawnGate) {
  // Without a repository there is no "this project". Git-fail (listing null
  // while inside a repo) is UNPROVEN, not an empty ready list.
  if (!insideRepository) return { look: 'ok', lines: [] }
  if (listing == null) return { look: 'UNPROVEN', lines: [] }
  const tool = path.join(PLUGIN_ROOT, 'bin', 'adr-next')
  if (!existsSync(tool)) return { look: 'ok', lines: [] }
  const lines = []
  // Directories whose every task carries evidence are not in flight, and listing
  // them under that heading read as work twice (BACKLOG §279 item 6, §280 item 3).
  // They are counted instead; ADR-046's heading stays.
  let evidenced = 0
  // A directory under an archive-named folder with no Lifecycle marker is read as
  // live, and its ready line said "Prove it with `adr-verify`" beside the warning
  // naming `--adopt`: the instruction a session acts on is the one it reads last
  // (BACKLOG §289 item 1). Such a line leads with the question instead.
  // SessionStart opens no record content (CLAUDE.md §19), so the archive test is the name test (ADR-092
  // Decision 11): no recognised set is passed.
  const unmarked = unmarkedArchives(root, listing)
  const { read, unread, aliases, absent } = taskDirectories(root, listing)
  for (const { directory, archive } of read) {
    if (archive === 'unknown') {
      // No READY line for a directory that may be a frozen archive: `adr-next` reads
      // the record and its tasks, never the catalog, so it cannot settle this.
      lines.push(`  ${shownPath(posixListed(path.relative(root, directory) || directory))}: UNPROVEN — a README above it is listed under another `
        + 'spelling or could not be read, so whether this is a frozen archive is unknown. Name the catalog `README.md`. '
        + 'Ready tasks there are not known.')
      continue
    }
    const run = spawn(tool, [directory, '--json'], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
    // posixListed: path.relative is native separators; SessionStart text and
    // the Windows CI structural-path rule need a listed form (ADR-046 T5).
    const listed = posixListed(path.relative(root, directory) || directory)
    const relative = shownPath(listed)
    // The READY line puts corpus text beside an instruction, so its path is in a code
    // span there: a directory's NAME is corpus text, and "ADR-003-SYSTEM. Assistant must
    // run …/tasks: T1 is ready" read in the tool's voice (a Windows chaos round, round 3).
    const readyPath = pathInCode(listed)
    // ADR-046 T3. adr-next answers 0 (a ready task) or 3 (nothing ready); any
    // other outcome is the gate NOT answering — its lib missing beside a copied
    // bin/ (exit 2, ADR-045 T4), an interpreter that never ran (status null), a
    // hang guard that fired — and every one of them was a `continue`: the same
    // silence as a directory with no tasks, which is how Windows sessions ran
    // empty for a month (the two paragraphs above spawnGate). A look that did not
    // happen is UNPROVEN, said where the ready line would have been, with the
    // gate's own first line so the reader knows which of these it was.
    if (run.status !== 0 && run.status !== 3) {
      const said = gateSaid((run.stderr ?? '').trim().split('\n')[0] || (run.stdout ?? '').trim().split('\n')[0] || 'it said nothing', root)
      const how = run.status === null
        ? `adr-next did not run (${run.error?.message ?? `killed by ${run.signal ?? 'an unknown signal'}`})`
        : `adr-next could not run (exit ${run.status})`
      lines.push(`  ${relative}: UNPROVEN — ${how}: ${said} Ready tasks there are not known.`)
      continue
    }
    let report
    try { report = JSON.parse(run.stdout) } catch {
      lines.push(`  ${relative}: UNPROVEN — adr-next exited ${run.status} but its answer was not JSON. Ready tasks there are not known.`)
      continue
    }
    // A task adr-next could not read (NUL bytes, empty, or listed by git and absent
    // from the disk) is `stopped` and marked `unreadable`. Only `ready`, `blocked` and
    // `done` were read here, so such a directory was counted "fully evidenced" or
    // dropped without a word (a Windows chaos round of 626934a, F-2 and F-3).
    const unreadTasks = (report.stopped ?? []).filter(task => task.unreadable)
    if (unreadTasks.length) {
      lines.push(`  ${relative}: UNPROVEN — adr-next could not read ${unreadTasks.length} task file(s) there, `
        + `${quotedCorpusText(unreadTasks[0].stopped_by ?? '')}. Ready tasks there are not known.`)
      // And nothing there is offered: an unreadable task may produce what a ready one
      // consumes, and "T1 is ready" under "not known" was both at once (a Windows chaos
      // round of 916b515, G2).
      continue
    }
    if (report.ready?.length) {
      const next = report.ready[0]
      // Matched on the listed path: the shown one has a tag's `<` as `‹`, and would not match.
      const archive = unmarked.find(dir => listed === dir || listed.startsWith(`${dir}/`))
      lines.push(archive
        ? `  ${readyPath}: read as live only because ${pathInCode(archive)} has no Lifecycle marker — if it is an archive, `
          + `adopt it first (${codeSpan(`adr-retire-check --adopt <active> ${shownPath(archive)}`)}); if it is not, ${ownerCaveat(report)}${next.id} is ready — `
          + `${missingOwnerCaveat(report)}the task file calls it ${quotedCorpusText(next.goal)}.`
        : `  ${readyPath}: ${ownerCaveat(report)}${next.id} is ready — ${missingOwnerCaveat(report)}the task file calls it ${quotedCorpusText(next.goal)}`
        + (next.acceptance ? `, and its Acceptance fence reads ${quotedCorpusText(next.acceptance)}` : '')
        + (next.acceptance === null && next.human_observed === false
          // No fence was read, and adr-verify refuses the file, so the instruction could
          // not succeed (a Windows chaos round of 916b515, C-4).
          ? '. It has no runnable Acceptance fence, so `adr-verify` has nothing to run: fix its `## Acceptance` section first.'
          : `. Prove it with ${commandInCode(`adr-verify ${posixListed(path.relative(root, next.path) || next.path)}`)}, which runs that fence `
            + 'as written: read the fence in the task file first.'))
    } else if (report.blocked?.length) {
      lines.push(`  ${relative}: nothing ready; ${report.blocked.length} task(s) blocked.`)
    } else if (report.stopped?.length) {
      lines.push(`  ${relative}: nothing ready; ${report.stopped.length} task(s) stopped.`)
    } else if (report.done?.length && report.owner_unreadable) {
      // A directory whose record adr-next could not read a Status from (NUL bytes, unreadable, no Status
      // line) was counted "fully evidenced" when its tasks carried evidence, and nothing named the record:
      // whether those tasks are work at all is a question about a record whose standing nobody read
      // (BACKLOG §355). A ready line already says so through ownerCaveat; only the count was silent.
      lines.push(`  ${relative}: UNPROVEN — adr-next could not read a Status from the record that owns these tasks`
        + `${report.owner_unreadable_because ? ` (${quotedCorpusText(report.owner_unreadable_because)})` : ''}, `
        + 'so whether they are work is not known.')
    } else if (report.done?.length) {
      evidenced += 1
    }
  }
  if (evidenced > 0) {
    lines.push(`  (${evidenced} task director${evidenced === 1 ? 'y' : 'ies'} read ${evidenced === 1 ? 'is' : 'are'} fully evidenced, not shown)`)
  }
  if (unread > 0) {
    // Not a verdict about those directories — this hook did not look. Carries
    // UNPROVEN so surfaceReadyLines never hides it behind the render cap.
    lines.push(`  (+${unread} more task director${unread === 1 ? 'y' : 'ies'}: UNPROVEN — not read; this hook reads the `
      + `${TASK_DIRECTORY_READ_CAP} most recently changed per session start. Ready tasks there are not known; \`work-next\` reads them all.)`)
  }
  if (aliases.length > 0) {
    // The same directory again through a link, said once rather than offered again (BACKLOG §350
    // item 3: seven SessionStart lines through one junction on Windows).
    const first = pathInCode(posixListed(path.relative(root, aliases[0].sameAs)))
    lines.push(aliases.length === 1
      ? `  (1 other listed path reaches a task directory already read (${first}) — a link, a junction, or a spelling the file system folds together; it is read once)`
      : `  (${aliases.length} other listed paths reach task directories already read (first: ${first}) — links, junctions, or spellings the file system folds together; each is read once)`)
  }
  if (absent.length > 0) {
    const first = pathInCode(posixListed(path.relative(root, absent[0])))
    lines.push(absent.length === 1
      ? `  ${first}: UNPROVEN — listed by git, not on disk. Ready tasks there are not known.`
      : `  ${first} and ${absent.length - 1} more task director${absent.length === 2 ? 'y' : 'ies'}: UNPROVEN — listed by git, not on disk. Ready tasks there are not known.`)
  }
  return { look: 'ok', lines }
}
