#!/usr/bin/env node
// attest-import.mjs — file a peer's corpus-probe attestation, checked against its commit.
//
// ADR-070. A peer runs `corpus-probe --attest` and pastes the JSON into a message; this
// reads that message and files the attestation in docs/corpus-reports/, or refuses and
// writes nothing. release-evidence reads only `at` (ADR-064), so this is where the rest
// is held to what the commit gives: the probe's digest, the readers fingerprint and the
// plugin version are re-derived from git at `at`, never read from a working tree.
//
// Usage:  node scripts/attest-import.mjs [--root <dir>] [--check] <message-file | ->
// Exit:   0 filed (with --check: would be) · 1 refused, every reason listed
//         2 usage · 3 could not look: `at` is not in this clone, or git failed
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { READER_DIRECTORIES } from '../plugin/scripts/reader-paths.mjs'
import { isMainModule } from '../plugin/scripts/main-module.mjs'

/** The attestation schema of docs/corpus-reports/README.md, in the order a file is written. */
export const KEYS = ['date', 'at', 'atReason', 'plugin', 'kind', 'probeSha256', 'readers', 'platform', 'node', 'python',
  'corpus', 'couldNotRun', 'disagreements', 'readinessUnproven', 'look', 'notCompared', 'verdictChanges', 'runner', 'found']
const CORPUS_KEYS = ['records', 'undecided', 'tasks', 'taskDirectories', 'countsFrom']
// The looks a probe report carries (ADR-089), and null for a report that carried none.
const LOOKS = ['ok', 'PARTIAL', 'UNPROVEN', null]

/** Every top-level JSON object in `text`, in order; braces in prose that do not parse are skipped. */
export function jsonObjects(text) {
  const found = []
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0
    let inString = false
    for (let i = start; i < text.length; i++) {
      const c = text[i]
      if (inString) {
        if (c === '\\') i++
        else if (c === '"') inString = false
      } else if (c === '"') inString = true
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) {
        try {
          found.push(JSON.parse(text.slice(start, i + 1)))
          start = i
        } catch { /* prose, not JSON: look from the next brace */ }
        break
      }
    }
  }
  return found
}

// git at `root`, answering buffers so a blob's bytes are hashed as git holds them.
function gitIn(root) {
  return (...args) => spawnSync('git', ['-C', root, ...args], { timeout: 30_000, maxBuffer: 1 << 28 })
}

/**
 * The readers fingerprint at `at`, from git: the same files, order, skips and LF
 * normalisation as corpus-probe's `readerFingerprint` over a checkout (dotfiles,
 * `__pycache__` and `.pyc` skipped; only regular files, as the disk walk takes them).
 */
export function readersAt(git, at) {
  const listing = git('ls-tree', '-r', '-z', at, '--', ...READER_DIRECTORIES.map(directory => `plugin/${directory}`))
  if (listing.error || listing.status !== 0) return null
  const files = String(listing.stdout).split('\0').filter(Boolean)
    .map(line => { const [meta, name] = line.split('\t'); return { mode: meta.split(' ')[0], name: name.slice('plugin/'.length) } })
    .filter(({ mode, name }) => (mode === '100644' || mode === '100755')
      && !name.split('/').some(part => part.startsWith('.') || part === '__pycache__') && !name.endsWith('.pyc'))
    .map(({ name }) => name).sort()
  const hash = createHash('sha256')
  for (const file of files) {
    const blob = git('show', `${at}:plugin/${file}`)
    if (blob.error || blob.status !== 0) return null
    hash.update(`${file}\0`)
    hash.update(blob.stdout.toString('utf8').replaceAll('\r\n', '\n'))
    hash.update('\0')
  }
  return hash.digest('hex')
}

/** The file name ADR-070 files an attestation under. */
export function fileName(attestation) {
  const runner = String(attestation.runner ?? '').toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '')
  return `${attestation.date}-${runner}-${attestation.plugin}-${String(attestation.at).slice(0, 7)}.json`
}

/** The attestation with its keys in the schema's order. */
export function ordered(attestation) {
  const out = {}
  for (const key of KEYS) {
    if (!(key in attestation)) continue
    out[key] = key === 'corpus' && attestation.corpus && typeof attestation.corpus === 'object'
      ? Object.fromEntries(CORPUS_KEYS.filter(k => k in attestation.corpus).map(k => [k, attestation.corpus[k]]))
      : attestation[key]
  }
  return out
}

/**
 * ADR-070 Decision steps 1-6 over a message's text, against the repository at `root`.
 * `{ attestation, name }` to file, `{ refused: [reasons] }`, or `{ couldNotLook }`.
 */
/** Whether `value` is a well-formed verdictChanges: null, or exactly its three counts (ADR-082). */
function verdictChangesShape(value) {
  if (value === null) return true
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const count = n => Number.isInteger(n) && n >= 0
  return Object.keys(value).sort().join(',') === 'compared,failToPass,passToFail'
    && count(value.compared) && count(value.passToFail) && count(value.failToPass)
    && value.passToFail + value.failToPass <= value.compared
}

export function check(text, root) {
  const candidates = jsonObjects(text).filter(o => o && typeof o === 'object' && !Array.isArray(o) && 'at' in o && 'kind' in o)
  if (candidates.length !== 1) {
    return { refused: [`1: the message holds ${candidates.length} attestations (an object with \`at\` and \`kind\`); exactly one is filed`] }
  }
  const [attestation] = candidates
  const refused = []
  const unknown = Object.keys(attestation).filter(key => !KEYS.includes(key))
  const corpusUnknown = attestation.corpus && typeof attestation.corpus === 'object'
    ? Object.keys(attestation.corpus).filter(key => !CORPUS_KEYS.includes(key)) : []
  if (unknown.length || corpusUnknown.length) {
    refused.push(`2: keys outside the attestation schema (${[...unknown, ...corpusUnknown.map(k => `corpus.${k}`)].join(', ')}): a report's content is never committed`)
  }
  if (attestation.kind !== 'probe') refused.push(`3: kind is ${JSON.stringify(attestation.kind)}; only a probe attestation carries digests to check, and a hand one is filed by hand`)
  if ('verdictChanges' in attestation && !verdictChangesShape(attestation.verdictChanges)) {
    refused.push(`2: verdictChanges is ${JSON.stringify(attestation.verdictChanges)}; it is null, or exactly { compared, passToFail, failToPass }: `
      + 'non-negative integers with passToFail + failToPass <= compared (ADR-082)')
  }
  // ADR-089: what the run saw. `notCompared` counts the records a run did not compare, so it is null
  // exactly when verdictChanges is: a run that compared nothing has nothing to count.
  if ('look' in attestation && !LOOKS.includes(attestation.look)) {
    refused.push(`2: look is ${JSON.stringify(attestation.look)}; it is ok, PARTIAL, UNPROVEN or null (ADR-089)`)
  }
  if ('notCompared' in attestation) {
    const n = attestation.notCompared
    const changes = attestation.verdictChanges ?? null
    if (!(n === null || (Number.isInteger(n) && n >= 0))) refused.push(`2: notCompared is ${JSON.stringify(n)}; it is a non-negative integer or null (ADR-089)`)
    else if ((n === null) !== (changes === null)) {
      refused.push(`2: notCompared is ${JSON.stringify(n)} beside verdictChanges ${JSON.stringify(changes)}; it is null exactly when verdictChanges is (ADR-089)`)
    }
  }
  // The date names the file, so it must be a date: `../../x` would have filed outside
  // docs/corpus-reports (Codex review of 3.1.0..e0ef6d4, F1).
  if (typeof attestation.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(attestation.date)) {
    refused.push(`2: date is ${JSON.stringify(attestation.date)}, not YYYY-MM-DD`)
  }
  if (typeof attestation.at !== 'string' || !/^[0-9a-f]{40}$/.test(attestation.at)) {
    refused.push(`4: at is ${JSON.stringify(attestation.at)}, not a full 40-hex sha`)
    return { refused }
  }
  const git = gitIn(root)
  const commit = git('cat-file', '-e', `${attestation.at}^{commit}`)
  if (commit.error) return { couldNotLook: `git could not run in ${root}: ${commit.error.message}` }
  if (commit.status !== 0) return { couldNotLook: `at ${attestation.at} is not a commit in this clone: fetch it, then import again` }
  const probe = git('show', `${attestation.at}:plugin/scripts/corpus-probe.mjs`)
  const version = git('show', `${attestation.at}:plugin/.claude-plugin/plugin.json`)
  const readers = readersAt(git, attestation.at)
  if (probe.status !== 0 || version.status !== 0 || readers === null) return { couldNotLook: `git could not read the readers at ${attestation.at}` }
  const probeSha256 = createHash('sha256').update(probe.stdout).digest('hex')
  if (attestation.probeSha256 !== probeSha256) refused.push(`5: probeSha256 ${attestation.probeSha256} is not ${probeSha256}, the probe at ${attestation.at.slice(0, 7)}`)
  if (attestation.readers !== readers) refused.push(`5: readers ${attestation.readers} is not ${readers}, the readers at ${attestation.at.slice(0, 7)}`)
  let pluginVersion = null
  try { pluginVersion = JSON.parse(version.stdout.toString('utf8')).version } catch { /* compared below as null */ }
  if (attestation.plugin !== pluginVersion) refused.push(`5: plugin ${JSON.stringify(attestation.plugin)} is not ${JSON.stringify(pluginVersion)}, plugin.json at ${attestation.at.slice(0, 7)}`)
  const name = fileName(attestation)
  // And the name it builds is a plain name, whatever a field held: the file lands in
  // docs/corpus-reports or nowhere.
  if (name !== path.basename(name) || name.startsWith('.')) refused.push(`6: the file name ${JSON.stringify(name)} is not a plain name inside docs/corpus-reports`)
  const dir = path.join(root, 'docs', 'corpus-reports')
  const duplicate = existsSync(dir) && readdirSync(dir).filter(file => file.endsWith('.json')).some(file => {
    try {
      const filed = JSON.parse(readFileSync(path.join(dir, file), 'utf8'))
      return filed.at === attestation.at && filed.runner === attestation.runner
    } catch { return false }
  })
  if (duplicate) refused.push(`6: a duplicate: docs/corpus-reports already holds this runner's run at ${attestation.at.slice(0, 7)}`)
  return refused.length ? { refused } : { attestation: ordered(attestation), name }
}

export function main(argv = process.argv.slice(2)) {
  let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  let checkOnly = false
  let source = null
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root' && argv[i + 1]) root = path.resolve(argv[++i])
    else if (argv[i] === '--check') checkOnly = true
    else if (source === null && !argv[i].startsWith('--') || argv[i] === '-') source = argv[i]
    else source = undefined
  }
  if (!source) {
    process.stderr.write('usage: attest-import.mjs [--root <dir>] [--check] <message-file | ->\n')
    return 2
  }
  let text
  try { text = readFileSync(source === '-' ? 0 : source, 'utf8') } catch (error) {
    process.stderr.write(`attest-import: could not read ${source}: ${error.code ?? error.message}\n`)
    return 2
  }
  const answer = check(text, root)
  if (answer.couldNotLook) {
    process.stderr.write(`attest-import: could not look — ${answer.couldNotLook}. Nothing was written.\n`)
    return 3
  }
  if (answer.refused) {
    process.stdout.write(`attest-import: refused, nothing was written:\n${answer.refused.map(reason => `  - ${reason}`).join('\n')}\n`)
    return 1
  }
  const relative = path.posix.join('docs', 'corpus-reports', answer.name)
  if (checkOnly) {
    process.stdout.write(`attest-import: would file ${relative}\n`)
    return 0
  }
  mkdirSync(path.join(root, 'docs', 'corpus-reports'), { recursive: true })
  writeFileSync(path.join(root, relative), `${JSON.stringify(answer.attestation, null, 2)}\n`)
  process.stdout.write(`attest-import: filed ${relative}\n`)
  return 0
}

if (isMainModule(import.meta.url)) process.exitCode = main()
