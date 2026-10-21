// ADR-120 T15: whether the spec gate skips a file. A spec git marks `linguist-generated` is made by a tool, not written, and a
// spec the project lists under `"ignore"` in .quality-harness.json is one it has said the gate has no business with; a finding
// about either has no author to act on it. The dispatcher asks this for a spec and nothing else, and only a positive answer
// skips: a repository git cannot read, a declaration that is refused, a listing that fails all leave the spec gated (CLAUDE.md §16).
//
// Exit 0 skip · 1 gate it · 2 gate it, and the declaration was refused (the reason is on stdout, as the dispatcher's UNPROVEN line).
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { isMainModule } from './main-module.mjs'
import { ignoreSpecs } from './project-config.mjs'

const git = (cwd, args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 10_000, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })

export function specSkip(file) {
  const where = git(path.dirname(file), ['rev-parse', '--show-toplevel', '--show-prefix'])
  if (where.error || where.status !== 0) return { skip: false, problem: null }
  const [root, prefix = ''] = where.stdout.split('\n')
  const rel = prefix + path.basename(file)
  const attribute = git(root, ['check-attr', 'linguist-generated', '--', rel])
  if (!attribute.error && attribute.status === 0 && /: linguist-generated: (?:set|true)\s*$/.test(attribute.stdout)) return { skip: true, problem: null }
  const { specs, problem } = ignoreSpecs(root)
  if (problem || specs.length === 0) return { skip: false, problem }
  const listed = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...specs.map(spec => `:(top)${spec}`)])
  if (listed.error || listed.status !== 0) return { skip: false, problem: 'git could not list the paths `ignore` names, so none was skipped' }
  return { skip: listed.stdout.split('\0').includes(rel), problem: null }
}

export function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1) return 1
  const { skip, problem } = specSkip(argv[0])
  if (problem) {
    process.stdout.write(`UNPROVEN: ${problem}\n`)
    return 2
  }
  return skip ? 0 : 1
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main()
}
