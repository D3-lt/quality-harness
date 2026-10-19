// ADR-117 T1: the evidence in a repository's state directory is written only by its tools. qh-check writes checks.jsonl,
// fast-checks.jsonl and baseline.jsonl there, and adr-verify the receipts; a row an agent writes by hand reads exactly like one
// they wrote, and a local gate cannot tell them apart (ADR-005, ADR-113). So a write into that directory the hook can see is
// refused at PreToolUse: an Edit, Write, MultiEdit, NotebookEdit or mrw MCP write, and a shell command's output redirection or
// `tee` file, `sh -c '…'` read the same way, relative targets resolved after a literal `cd`. A target built from a variable, a
// program that writes the file itself, and `cd -` or `cd ~` before a relative target are not read: a boundary, not a pass.
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { canonicalFile, nearestExistingDirectory, stateDir } from './event-log.mjs'
import { shellWords } from './shell-words.mjs'
import { SHELL_NAMES, programName } from './publish-command.mjs'
import { MRW_WRITE, MUTATION_TOOLS, mrwWritePaths } from './hook-record.mjs'
import { SHELL_TOOLS } from './publish-verdict.mjs'
import { gitRepositoryLookup } from './tree-facts.mjs'

// The files a shell command writes, each with the directory a relative one lands in (null where that is not known).
function shellTargets(command, base, depth = 0) {
  const found = []
  if (typeof command !== 'string') return found
  for (const c of shellWords(command).commands) {
    const name = programName(c.argv[0] ?? '')
    if (name === 'cd') {
      const to = c.argv[1]
      base = c.argv.length === 2 && !c.dynamic.includes(1) && to !== '-' && !to.startsWith('~') && base !== null ? path.resolve(base, to) : null
      continue
    }
    for (const write of c.writes ?? []) if (!write.dynamic) found.push({ file: write.target, base })
    if (name === 'tee') {
      for (let at = 1; at < c.argv.length; at++) if (!c.argv[at].startsWith('-') && !c.dynamic.includes(at)) found.push({ file: c.argv[at], base })
    }
    const inner = c.argv.indexOf('-c')
    if (SHELL_NAMES.has(name) && depth < 3 && inner > 0 && typeof c.argv[inner + 1] === 'string' && !c.dynamic.includes(inner + 1)) {
      found.push(...shellTargets(c.argv[inner + 1], base, depth + 1))
    }
  }
  return found
}

/** The path, as written, of a hook-visible write into the session repository's state directory, or null. */
export function ledgerWrite(input) {
  const cwd = input?.cwd
  if (typeof cwd !== 'string' || !cwd) return null
  const dir = canonicalFile(path.resolve(stateDir(cwd)))
  const inside = (file, base) => {
    if (!path.isAbsolute(file) && base === null) return false
    const relative = path.relative(dir, canonicalFile(path.resolve(base ?? cwd, file)))
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
  }
  const tool = input.tool_name
  if (tool === MRW_WRITE) return (mrwWritePaths(input.tool_input) ?? []).find(file => inside(file, cwd)) ?? null
  if (MUTATION_TOOLS.has(tool)) {
    const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path
    return typeof file === 'string' && file && inside(file, cwd) ? file : null
  }
  if (SHELL_TOOLS.has(tool)) return shellTargets(input.tool_input?.command, path.resolve(cwd)).find(t => inside(t.file, t.base))?.file ?? null
  return null
}

/** Whether the project turned the refusal into a warning, with `"ledgers": "warn"` in `.quality-harness.json`. */
export function ledgersWarn(cwd) {
  const directory = nearestExistingDirectory(path.resolve(cwd))
  const found = directory ? gitRepositoryLookup(directory) : { ok: false }
  try {
    return JSON.parse(readFileSync(path.join(found.root ?? directory, '.quality-harness.json'), 'utf8'))?.ledgers === 'warn'
  } catch { return false }
}

export const ledgerRefusal = file => `quality-harness ledger guard: ${file} is in this repository's state directory, where the `
  + 'evidence is written only by its tools: qh-check writes checks.jsonl, fast-checks.jsonl and baseline.jsonl, and adr-verify '
  + 'the receipts. Run the tool; a row written by hand is not evidence (ADR-117). A project that needs this write sets '
  + '"ledgers": "warn" in .quality-harness.json.'
export const ledgerWarning = file => `quality-harness ledger guard: ${file} is in this repository's state directory, written only `
  + 'by its tools; "ledgers": "warn" lets this write through, and a row written by hand is still not evidence (ADR-117).'
