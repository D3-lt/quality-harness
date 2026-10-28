#!/usr/bin/env node
// ADR-113 T3: the side doors around the evidence, enumerated as a class (Decision 3). A guarantee that holds on the governed
// path only is a guarantee about that path, and what goes around it is what this names. Three kinds of site, in what ships
// (plugin/) and in the Go core (core/), each found by what the code does:
//   - writer: a code file that names `checks.jsonl`, `fast-checks.jsonl`, `baseline.jsonl`, `receipts.jsonl` (ADR-117 T2), or a
//     Verification or Mutation Log, outside a comment, and holds a file-write primitive;
//   - spawn: a git call whose arguments, on one line, name a verb that publishes or makes a commit;
//   - tool: a tool that can write a file, against each command a PreToolUse or PostToolUse group runs, matchers read anchored.
// Each door in the class carries a state (ADR-117 Decision 4): `caught`, where something here refuses or says it; `boundary`,
// closed outside this plugin, with `where`; or `open`. An open door, a boundary with no place it closes, and a door with no
// state fail the gate, so a door is never left open by being left unsaid.
// Every site is in scripts/side-doors.json with its reason and what governs it; a site not listed fails, and so does an entry
// no site matches. These are classifiers over code (CLAUDE.md §16): a writer that builds its ledger's name in another file, or
// a git call split over lines, is not seen, so a site this does not find is not known to be absent. Files are what git lists
// (§8), so the answer does not depend on what else is on the disk.
//
//   node scripts/side-door-sweep.mjs [--json]
//
// Exit: 0 every site listed and every door caught or bounded · 1 a site unlisted, an entry stale or a door open · 2 could not run.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMainModule } from '../plugin/scripts/main-module.mjs'

// QUALITY_HARNESS_SIDE_DOOR_ROOT names another repository to sweep, which is how the test shows the gate failing.
const ROOT = process.env.QUALITY_HARNESS_SIDE_DOOR_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LEDGER = /(?:fast-checks|checks|baseline|receipts)\.jsonl|\b(?:Verification|Mutation) Log\b/
const WRITE = {
  js: /\b(?:appendFileSync|writeFileSync|appendFile|writeFile|createWriteStream|renameSync|copyFileSync)\s*\(/,
  // One level of call inside open()'s arguments is read through, so `open(os.path.join(d, NAME), "a")` is a write.
  py: /\bopen\((?:[^()\n]|\([^()\n]*\))*['"][rb+]*[wax][rwxab+]*['"]|\.write_(?:text|bytes)\(|\bos\.(?:replace|rename)\(|\bshutil\.(?:copy\w*|move)\(/,
  go: /\bos\.(?:WriteFile|OpenFile|Create|Rename)\(/,
  sh: />>|(?:^|[\s;|&])tee\s/,
}
const VERBS = ['commit', 'push', 'commit-tree', 'update-ref', 'merge', 'cherry-pick', 'revert', 'rebase', 'am']
const GIT_CALL = /['"]git['"]\s*,|\bgit\s*\(\s*\[/g
const VERB = new RegExp(`['"](${VERBS.join('|')})['"]`, 'g')
const SPAWNER = /\b(?:spawnSync|spawn|execSync|execFileSync|execFile|exec|check_output|check_call|Popen|Command)\s*\(|\bsubprocess\.run\s*\(/
const SHELLED = new RegExp(`\\bgit\\s+(?:-[Cc]\\s+\\S+\\s+)*(${VERBS.join('|')})\\b`)
const COMMENT = /^\s*(?:\/\/|\/\*|\*|#(?!!))/

// Which language a tracked file is, or null for one that is not code.
function kindOf(file, text) {
  const ext = path.extname(file)
  if (['.mjs', '.cjs', '.js'].includes(ext)) return 'js'
  if (ext === '.py') return 'py'
  if (ext === '.go') return 'go'
  if (ext === '.sh') return 'sh'
  if (ext !== '' || !file.startsWith('plugin/bin/')) return null
  const shebang = text.split('\n', 1)[0]
  return /python/.test(shebang) ? 'py' : /\b(?:ba|z)?sh\b/.test(shebang) ? 'sh' : /\bnode\b/.test(shebang) ? 'js' : null
}

// Name the executable boundary; native bridges retain the name of the CLI gate they select.
const hookName = hook => {
  const args = hook.args ?? []
  if (String(args[0]).replaceAll('\\', '/').endsWith('/scripts/qh-hook.sh')) {
    return args[1] === 'bridge' && args[2] === 'shell-hook' ? String(args[3]).split(/[\\/]/).pop() : 'qh-hook'
  }
  return String(args.at(-1) ?? hook.command ?? '').split(/[\\/]/).pop()
}

function sites({ files, read, hooks, writingTools }) {
  const found = []
  for (const file of files) {
    const text = read(file)
    const kind = typeof text === 'string' ? kindOf(file, text) : null
    if (!kind) continue
    const code = text.split('\n').filter(line => !COMMENT.test(line))
    if (code.some(line => LEDGER.test(line)) && code.some(line => WRITE[kind].test(line))) found.push({ kind: 'writer', key: file })
    const verbs = new Set()
    for (const line of code) {
      // A verb counts only inside the call's own arguments: up to the first `]` or `)` after the call names git.
      for (const call of line.matchAll(GIT_CALL)) {
        const args = line.slice(call.index + call[0].length).split(/[\])]/, 1)[0]
        for (const match of args.matchAll(VERB)) verbs.add(match[1])
      }
      const shelled = SPAWNER.test(line) && line.match(SHELLED)
      if (shelled) verbs.add(shelled[1])
    }
    for (const verb of verbs) found.push({ kind: 'spawn', key: `${file} ${verb}` })
  }
  for (const event of ['PreToolUse', 'PostToolUse']) {
    const matched = new Map()
    for (const entry of hooks?.hooks?.[event] ?? []) {
      let matcher = null
      try { matcher = new RegExp(`^(?:${entry.matcher ?? ''})$`) } catch { /* a matcher that is not a pattern credits no tool */ }
      for (const hook of entry.hooks ?? []) {
        const name = hookName(hook)
        if (!matched.has(name)) matched.set(name, new Set())
        for (const tool of writingTools) if (matcher?.test(tool)) matched.get(name).add(tool)
      }
    }
    for (const [name, tools] of matched) {
      for (const tool of writingTools) if (!tools.has(tool)) found.push({ kind: 'tool', key: `${event} ${name} ${tool}` })
    }
  }
  return found
}

export function sweep({ files, read, hooks, allow }) {
  const found = sites({ files, read, hooks, writingTools: allow.writingTools ?? [] })
  const listed = (kind, key) => Object.hasOwn(allow.sites?.[kind] ?? {}, key)
  const unlisted = found.filter(site => !listed(site.kind, site.key)).map(site => ({ ...site, key: `${site.kind} ${site.key}` }))
  const seen = new Set(found.map(site => `${site.kind} ${site.key}`))
  const stale = Object.entries(allow.sites ?? {}).flatMap(([kind, entries]) => Object.keys(entries)
    .filter(key => !seen.has(`${kind} ${key}`)).map(key => ({ kind, key: `${kind} ${key}` })))
  return { found, unlisted, stale }
}

const DOOR_STATES = ['caught', 'boundary', 'open']

/** Each door's state counted, and the doors that fail: open, a boundary with nowhere it closes, or a state not of the three.
 * A list that is missing or not a list fails as well: a door nobody read is not a door that is closed. */
export function doorStates(doors) {
  const counts = Object.fromEntries(DOOR_STATES.map(state => [state, 0]))
  if (!Array.isArray(doors)) return { counts, problems: [{ id: '(doors)', why: 'is not a list in scripts/side-doors.json, so no door was read' }] }
  const problems = []
  for (const door of doors) {
    if (Object.hasOwn(counts, door?.status)) counts[door.status] += 1
    if (door?.status === 'open') problems.push({ id: door.id, why: 'is open: catch it, or name where it closes as a boundary' })
    else if (door?.status === 'boundary' && !(typeof door.where === 'string' && door.where.trim())) problems.push({ id: door.id, why: 'is a boundary that names nowhere it closes' })
    else if (!Object.hasOwn(counts, door?.status)) problems.push({ id: door?.id, why: `has no state of ${DOOR_STATES.join(', ')}` })
  }
  return { counts, problems }
}

function main(argv) {
  const listedFiles = spawnSync('git', ['ls-files', '-z', '--', 'plugin', 'core'], { cwd: ROOT, encoding: 'utf8', timeout: 30_000, windowsHide: true })
  if (listedFiles.status !== 0) {
    process.stderr.write(`side-door-sweep: UNRUN — git ls-files failed: ${listedFiles.stderr || listedFiles.error?.message}\n`)
    return 2
  }
  let allow, hooks
  try {
    allow = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'side-doors.json'), 'utf8'))
    hooks = JSON.parse(readFileSync(path.join(ROOT, 'plugin', 'hooks', 'hooks.json'), 'utf8'))
  } catch (error) {
    process.stderr.write(`side-door-sweep: UNRUN — ${error.message}\n`)
    return 2
  }
  // A listed file that cannot be read may hold a door, so the sweep is UNRUN (the Codex review of 6641c951..4db47214); one
  // that is gone from the disk holds nothing.
  const unreadable = []
  const read = file => {
    try { return readFileSync(path.join(ROOT, file), 'utf8') } catch (error) {
      if (error?.code !== 'ENOENT') unreadable.push(`${file} (${error?.code ?? error?.message})`)
      return null
    }
  }
  const result = sweep({ files: listedFiles.stdout.split('\0').filter(Boolean), read, hooks, allow })
  if (unreadable.length) {
    process.stderr.write(`side-door-sweep: UNRUN — could not read ${unreadable.join(', ')}, so what they hold was not swept\n`)
    return 2
  }
  const doors = doorStates(allow.doors)
  if (argv.includes('--json')) process.stdout.write(`${JSON.stringify({ ...result, doors }, null, 2)}\n`)
  else {
    for (const site of result.unlisted) process.stdout.write(`side-door-sweep: unlisted ${site.key} — add it to scripts/side-doors.json with its reason, or close it\n`)
    for (const site of result.stale) process.stdout.write(`side-door-sweep: stale ${site.key} — no site matches this entry; remove it\n`)
    for (const problem of doors.problems) process.stdout.write(`side-door-sweep: door ${problem.id} ${problem.why}\n`)
    process.stdout.write(`side-door-sweep: ${result.found.length} site(s), ${result.unlisted.length} unlisted, ${result.stale.length} stale; `
      + `doors: ${DOOR_STATES.map(state => `${doors.counts[state]} ${state}`).join(', ')}\n`)
  }
  return result.unlisted.length || result.stale.length || doors.problems.length ? 1 : 0
}

if (isMainModule(import.meta.url)) process.exitCode = main(process.argv.slice(2))
