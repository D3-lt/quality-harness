#!/usr/bin/env node
// rules-inject.mjs — deliver the path-scoped rules on the read paths CLAUDE.md
// actually mandates.
//
// `.claude/rules/*.md` carry `paths:` frontmatter and the loader honours it, so
// CLAUDE.md stays a rulebook and each rule's evidence arrives on the tool call
// that makes it relevant. Measured 2026-09-04, in one session, on both halves:
// at wake-up only the `paths: "**"` rule was resident; reading docs/BACKLOG.md
// injected exactly the three rules whose globs match it and neither of the two
// other docs/-scoped rules, so the filter is the glob and not the directory.
//
// ⚠ THE TRIGGER IS THE `Read` TOOL AND NOTHING ELSE. Measured the same session:
// `cat .gitattributes` through Bash injected neither of the two rules that glob
// `.gitattributes`; `mrw_read` on docs/research/ injected neither of that file's
// rules; `Write` and `Edit` injected nothing. A `Read` of a tracked file did,
// and a rule already delivered is not re-sent — the loader dedups per session.
//
// That is a gate that cannot fire, in this repository. CLAUDE.md §14 mandates
// reading and writing through `mrw`, so a session OBEYING §14 receives none of
// its path-scoped rules — and it cannot notice, because an absent rule produces
// silence, which is what a rule with nothing to say also produces. This hook
// closes that hole for Bash, `mrw` and new-file writes.
//
// ⚠ SCOPE EXCLUDES `Edit`, DELIBERATELY. The harness refuses an Edit to a file
// not already Read in the conversation, so every Edit is preceded by a Read that
// the built-in loader already answered. Matching it here would buy one duplicate
// and no coverage. `Write` IS matched: a NEW file has no prior Read.
//
// ⚠ A PATH IS A PATH ONLY IF `git` SAYS SO (CLAUDE.md §8). A Bash command is
// free text, and a token that merely LOOKS like a path is not an observation
// that a file was touched — injecting a rule on one would be CLAUDE.md §3's
// defect wearing a helpful hat. Worse, it is unbounded: `grep -rn foo .` puts
// every path in the tree in play and would inject the whole rulebook, which is
// the wake-up cost the split exists to avoid. So candidates are resolved against
// `git ls-files` plus `--others --exclude-standard`, never `existsSync`, and a
// call that would deliver more than MAX_RULES says so instead of truncating.
//
// ⚠ IT EXITS 0 WHATEVER HAPPENS. A PostToolUse hook that throws interrupts the
// session it was meant to help, and this one is a convenience, never a gate —
// CLAUDE.md §3, gates instruct and never block. Malformed stdin, a missing
// rules directory, an unreadable state file and a tree with no `git` all mean
// "deliver nothing" and say nothing. The cost of that silence is the status quo
// ante; the cost of throwing is the user's turn.
//
// ⚠ IT SENDS A POINTER, NEVER A BODY (the owner, 2026-10-27). Measured that day over one session's transcript: the bodies
// this hook injected were about 70k characters, 3.9% of the context, more than everything the plugin itself said (0.2%).
// One line per governing rule, its path and its title, tells the reader which rule to open; the evidence stays in the file.
//
// Wired from .claude/settings.json. Reads a PostToolUse payload on stdin and
// writes a hookSpecificOutput document on stdout.
//
// Usage:
//   node scripts/rules-inject.mjs < payload.json
//
// Exit codes:
//   0  always
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { isMainModule } from '../plugin/scripts/main-module.mjs'


/** Normalize a path for structural comparison: both separators, no leading
 * `./`, no drive prefix. CLAUDE.md §7 — never write a separator into a literal
 * you will compare, and a Windows path is a path. */
export function normalize(path) {
  return String(path)
    .replace(/\\/g, '/')
    .replace(/^[A-Za-z]:/, '')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
}

/** Translate one `paths:` glob into a regular expression.
 *
 * `**` crosses separators, `*` and `?` do not. Anchored at both ends, because a
 * pattern that matches a suffix would make `tests/mutations.json` match
 * `plugin/tests/mutations.json`, which is a different file. */
export function globToRegExp(pattern) {
  // Character by character, not a chain of replaces. The chain has to collapse
  // `**` to a placeholder and expand it afterwards, and that placeholder is what
  // got this wrong the first time: `plugin/**` became `plugin/(?:.*/)?`, which
  // matches `plugin/bin/` and NOT the file inside it. Seven assertions went red
  // together, which is the only reason it was a five-minute defect instead of a
  // rule that silently governed nothing.
  const glob = normalize(pattern)
  let body = ''
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i]
    if (char === '*' && glob[i + 1] === '*') { body += '.*'; i += 1 }
    else if (char === '*') body += '[^/]*'
    else if (char === '?') body += '[^/]'
    else body += char.replace(/[.+^${}()|[\]\\]/, '\\$&')
  }
  return new RegExp(`^${body}$`)
}

/** Read the `paths:` list out of a rule file's frontmatter.
 *
 * Deliberately a line parser and not a YAML dependency: the frontmatter this
 * reads is a flat list of quoted strings written by hand in this repository,
 * and a rule whose frontmatter is malformed yields no patterns and is simply
 * never delivered — the same silence as a rule with nothing to say. */
export function parseRulePaths(text) {
  const lines = String(text).split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return []
  const patterns = []
  let inPaths = false
  for (const line of lines.slice(1)) {
    if (line.trim() === '---') break
    if (/^paths:\s*$/.test(line)) { inPaths = true; continue }
    if (!inPaths) continue
    const item = line.match(/^\s*-\s*(.+?)\s*$/)
    if (!item) { if (line.trim()) inPaths = false; continue }
    patterns.push(item[1].replace(/^["']|["']$/g, ''))
  }
  return patterns
}

/** Load every rule file, with its patterns, its body and its title.
 *
 * The title is what gets delivered: the body's first line, its heading marks
 * stripped. The frontmatter is machinery for the loader. */
export function loadRules(rulesDir) {
  let names
  try {
    names = readdirSync(rulesDir).filter((n) => n.endsWith('.md')).sort()
  } catch {
    return []
  }
  const rules = []
  for (const name of names) {
    let text
    try { text = readFileSync(join(rulesDir, name), 'utf8') } catch { continue }
    const patterns = parseRulePaths(text)
    if (!patterns.length) continue
    const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim()
    if (!body) continue
    const title = body.split(/\r?\n/).find((line) => line.trim())?.replace(/^#+\s*/, '').trim().slice(0, 160) ?? name
    rules.push({ name, patterns, body, title })
  }
  return rules
}

/** Every token in a Bash command that could name a file.
 *
 * Over-generous on purpose — this is the CANDIDATE set, and the `git` check
 * downstream is what turns a candidate into an observation. Splitting on shell
 * metacharacters rather than parsing the shell is adequate for the same reason:
 * a token this misses was never going to be resolved, and a token it invents
 * cannot survive `git ls-files`. */
function bashCandidates(command) {
  return String(command)
    .split(/[\s;|&()<>"'`]+/)
    .filter((t) => t && !t.startsWith('-'))
    .map((t) => t.replace(/^\$?\{?[A-Z_]+\}?\//, ''))
}

/** The paths one tool call claims to have touched, before any verification. */
export function candidatePaths(toolName, toolInput) {
  const input = toolInput ?? {}
  if (toolName === 'Bash') return bashCandidates(input.command ?? '')
  if (toolName === 'Write' || toolName === 'Edit') {
    return input.file_path ? [String(input.file_path)] : []
  }
  if (toolName === 'mcp__mrw__mrw_read') {
    // A spec is `path`, `path:10-20`, `path:/regexp/` or `path:$`. Only the
    // part before the first colon is the path — and a regexp address can itself
    // contain a colon, so split once rather than on every colon.
    return (input.specs ?? []).map((s) => String(s).split(':')[0]).filter(Boolean)
  }
  if (toolName === 'mcp__mrw__mrw_write') {
    // Plan hunks are `@@ <path> <address> <op> [guards]`. Body lines are not
    // headers even when they start with `@@` (mrw's own `raw=true` case), which
    // is why this requires the shape of a header and not just the sigil.
    const headers = String(input.plan ?? '').split(/\r?\n/)
      .map((l) => l.match(/^@@\s+(\S+)\s+\S+\s+(?:replace|insert-after|insert-before|delete|create)\b/))
      .filter(Boolean)
    return headers.map((m) => m[1])
  }
  return []
}

/** Keep only the candidates `git` knows about, relative to the repository root.
 *
 * CLAUDE.md §8: resolve against `git ls-files`, never `existsSync`. A check
 * whose answer depends on what is on your disk is not a check — and here the
 * untracked half matters too, because a file being ADDED is exactly the case
 * `Write` covers. */
export function resolveAgainstGit(candidates, cwd, runGit = defaultGit) {
  if (!candidates.length) return []
  let known
  try {
    known = new Set(
      runGit(['ls-files', '--cached', '--others', '--exclude-standard'], cwd)
        .split('\n').map(normalize).filter(Boolean),
    )
  } catch {
    return []
  }
  let root
  try { root = runGit(['rev-parse', '--show-toplevel'], cwd).trim() } catch { return [] }
  const out = new Set()
  for (const candidate of candidates) {
    // A candidate may be absolute, or relative to a cwd below the root; both
    // have to become root-relative before they can be compared to `ls-files`.
    const absolute = resolve(cwd, candidate)
    const rooted = normalize(absolute).startsWith(normalize(root) + '/')
      ? normalize(absolute).slice(normalize(root).length + 1)
      : normalize(candidate)
    if (known.has(rooted)) out.add(rooted)
  }
  return [...out]
}

function defaultGit(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 30_000 })
}

/** Which rules govern these paths. Order follows the rules' filenames, so a
 * delivery reads in the same order as CLAUDE.md's sections. */
export function matchRules(paths, rules) {
  const normalized = paths.map(normalize)
  return rules.filter((rule) => rule.patterns.some((pattern) => {
    const re = globToRegExp(pattern)
    return normalized.some((path) => re.test(path))
  }))
}

/** Where this session's record of what it has already delivered lives.
 *
 * Keyed on the session so two concurrent sessions do not silence each other,
 * and under the system temp directory so nothing is written into the tree being
 * worked on (CLAUDE.md §9) and no absolute home path is ever committed (§6). */
export function statePath(sessionId) {
  const safe = String(sessionId).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128)
  return join(tmpdir(), 'quality-harness-rules-inject', `${safe}.json`)
}

function alreadySent(sessionId) {
  if (!sessionId) return new Set()
  try {
    return new Set(JSON.parse(readFileSync(statePath(sessionId), 'utf8')))
  } catch {
    // No state, unreadable state, corrupt state: all mean "nothing is known to
    // have been sent". Delivering a rule twice is cheap; a read-only tmpdir
    // silently switching the hook off is not, which is why this does not throw.
    return new Set()
  }
}

function remember(sessionId, names) {
  if (!sessionId) return
  const file = statePath(sessionId)
  try {
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, JSON.stringify([...names]))
  } catch { /* see alreadySent: losing the record costs a duplicate, never a turn */ }
}

/** The whole decision, as a pure function of the payload and the rules.
 *
 * Returns the text to deliver and the rule names it covers, or null for
 * "deliver nothing" — which is the answer for most tool calls and must stay
 * indistinguishable in cost from the hook not being installed. Every governing
 * rule is named, one line each, so nothing is withheld and no cap is needed. */
export function decide(payload, rules, sent, options = {}) {
  const { cwd = payload?.cwd ?? process.cwd(), runGit = defaultGit } = options
  const candidates = candidatePaths(payload?.tool_name, payload?.tool_input)
  const paths = resolveAgainstGit(candidates, cwd, runGit)
  if (!paths.length) return null

  const governing = matchRules(paths, rules).filter((rule) => !sent.has(rule.name))
  if (!governing.length) return null

  const lines = governing.map((rule) => `- .claude/rules/${rule.name}: ${rule.title}`)
  return {
    text: `Rules governing the files this call touched; read the one that covers your change:\n${lines.join('\n')}`,
    names: governing.map((rule) => rule.name),
  }
}

/** Whether a glob matches every path. The host loads such a rule at SessionStart, so
 * delivering it again on the first tracked-file touch is a duplicate: measured
 * 2026-10-09, `14-mrw-and-team-memory.md` (`**`) arrived twice, once resident and
 * once from this hook. A rule that matches EVERYTHING cannot be one this hook is
 * needed for — it exists for the rules the loader reaches only on a `Read`. */
export function isMatchAll(pattern) {
  return /^(?:\*\*\/?)+$/.test(normalize(pattern))
}

export function run(stdin, options = {}) {
  let payload
  try { payload = JSON.parse(stdin) } catch { return null }
  const cwd = options.cwd ?? payload?.cwd ?? process.cwd()
  const rulesDir = options.rulesDir ?? join(cwd, '.claude', 'rules')
  const rules = loadRules(rulesDir).filter((rule) => !rule.patterns.some(isMatchAll))
  if (!rules.length) return null
  const sessionId = payload?.session_id ?? ''
  const sent = options.sent ?? alreadySent(sessionId)
  const outcome = decide(payload, rules, sent, { cwd, runGit: options.runGit })
  if (!outcome) return null
  if (!options.sent) remember(sessionId, new Set([...sent, ...outcome.names]))
  return outcome.text
}

async function main() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const text = run(Buffer.concat(chunks).toString('utf8'))
  if (!text) return
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: text,
    },
  }))
}

if (isMainModule(import.meta.url)) {
  // Nothing here may reach the exit code. The hook is a convenience; a stack
  // trace on stderr and a non-zero exit would turn a missing rule into an
  // interrupted turn, which is strictly worse than the hole it closes.
  main().catch(() => {}).finally(() => process.exit(0))
}
