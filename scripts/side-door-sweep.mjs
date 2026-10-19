#!/usr/bin/env node
// ADR-113 T3: the side doors around the evidence, enumerated as a class (Decision 3). A guarantee that holds on the governed
// path only is a guarantee about that path, and what goes around it is what this names. Three kinds of site, in what ships
// (plugin/) and in the Go core (core/), each found by what the code does:
//   - writer: a code file that names `checks.jsonl`, `fast-checks.jsonl`, `baseline.jsonl`, or a Verification or Mutation Log,
//     outside a comment, and holds a file-write primitive;
//   - spawn: a git call whose arguments, on one line, name a verb that publishes or makes a commit;
//   - tool: a tool that can write a file, against each command a PreToolUse or PostToolUse group runs, matchers read anchored.
// Every site is in scripts/side-doors.json with its reason and what governs it; a site not listed fails, and so does an entry
// no site matches. These are classifiers over code (CLAUDE.md §16): a writer that builds its ledger's name in another file, or
// a git call split over lines, is not seen, so a site this does not find is not known to be absent. Files are what git lists
// (§8), so the answer does not depend on what else is on the disk.
//
//   node scripts/side-door-sweep.mjs [--json]
//
// Exit: 0 every site listed · 1 a site unlisted or an entry stale · 2 could not run.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMainModule } from '../plugin/scripts/main-module.mjs'

// QUALITY_HARNESS_SIDE_DOOR_ROOT names another repository to sweep, which is how the test shows the gate failing.
const ROOT = process.env.QUALITY_HARNESS_SIDE_DOOR_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LEDGER = /(?:fast-checks|checks|baseline)\.jsonl|\b(?:Verification|Mutation) Log\b/
const WRITE = {
  js: /\b(?:appendFileSync|writeFileSync|appendFile|writeFile|createWriteStream|renameSync|copyFileSync)\s*\(/,
  py: /\bopen\([^)\n]*['"][rb+]*[wax][rwxab+]*['"]|\.write_(?:text|bytes)\(|\bos\.(?:replace|rename)\(|\bshutil\.(?:copy\w*|move)\(/,
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

// The command a hook entry runs, by the file it names last.
const hookName = hook => path.basename(String((hook.args ?? []).at(-1) ?? hook.command ?? ''))

export function sites({ files, read, hooks, writingTools }) {
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
  const read = file => { try { return readFileSync(path.join(ROOT, file), 'utf8') } catch { return null } }
  const result = sweep({ files: listedFiles.stdout.split('\0').filter(Boolean), read, hooks, allow })
  if (argv.includes('--json')) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  else {
    for (const site of result.unlisted) process.stdout.write(`side-door-sweep: unlisted ${site.key} — add it to scripts/side-doors.json with its reason, or close it\n`)
    for (const site of result.stale) process.stdout.write(`side-door-sweep: stale ${site.key} — no site matches this entry; remove it\n`)
    const open = (allow.doors ?? []).filter(door => door.status === 'open')
    process.stdout.write(`side-door-sweep: ${result.found.length} site(s), ${result.unlisted.length} unlisted, ${result.stale.length} stale; `
      + `${open.length} door(s) named open: ${open.map(door => door.id).join(', ') || 'none'}\n`)
  }
  return result.unlisted.length || result.stale.length ? 1 : 0
}

if (isMainModule(import.meta.url)) process.exitCode = main(process.argv.slice(2))
