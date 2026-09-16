// ADR-057's route matcher, shared by tests/routing.test.mjs and
// tests/routing-stress.test.mjs. It is a module rather than code inside the
// routing test because a test body is locked at its first red (ADR-050) and the
// stress test must drive the SAME matcher, not a copy of it.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const MEMBER_GLOBS = ['plugin/skills/*/SKILL.md', 'plugin/agents/*.md', 'plugin/workflows/*.js']
export const ROUTERS = ['plugin/skills/work/SKILL.md', 'plugin/skills/quality-policy/SKILL.md', 'plugin/skills/review/SKILL.md']

/** Paths git knows for these globs, tracked or about to be added — never the disk (CLAUDE.md §8). */
export function listed(...globs) {
  const run = spawnSync('git', ['-C', repoRoot, 'ls-files', '--cached', '--others', '--exclude-standard', '--', ...globs],
    { encoding: 'utf8', timeout: 60_000 })
  assert.equal(run.status, 0, `git must list ${globs.join(' ')}`)
  return [...new Set(run.stdout.split('\n').filter(Boolean))]
}

/** A skill is named by its directory; an agent or workflow by its file stem. */
export function memberName(path) {
  return path.startsWith('plugin/skills/') ? path.split('/')[2] : path.split('/').pop().replace(/\.(md|js)$/, '')
}

export function readTexts(paths) {
  return new Map(paths.map(path => [path, readFileSync(join(repoRoot, path), 'utf8')]))
}

/** The text after YAML frontmatter. A description's "do not use X" is a boundary, not a route. */
export function body(text) {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
}

export function escaped(name) {
  return name.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')
}

// The trailing (?![\w-]) is what keeps `review` from being found inside
// `review-ring` — the same hazard `lifecycle.mjs` paid for with `--rm` (CLAUDE.md §5).
export function routerPattern(name) {
  return new RegExp('`' + escaped(name) + '`|quality-harness:' + escaped(name) + '(?![\\w-])')
}

export function workflowPattern(name) {
  return new RegExp('/quality-harness:' + escaped(name) + '(?![\\w-])|agentType:\\s*[\'"]quality-harness:' + escaped(name) + '[\'"]')
}

/** Names of members that no router body and no workflow names, excluding each member's own file. */
export function unrouted(members, routers, workflows) {
  const named = ({ path, name }) =>
    [...routers].some(([file, text]) => file !== path && routerPattern(name).test(body(text)))
    || [...workflows].some(([file, text]) => file !== path && workflowPattern(name).test(text))
  return members.filter(member => !named(member)).map(member => member.name)
}
