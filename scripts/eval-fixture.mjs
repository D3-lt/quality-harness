#!/usr/bin/env node
// eval-fixture.mjs — materialise the absolute paths a corpus-backed eval case needs.
//
// `claude plugin eval` can hand a case a real decision corpus through
// `execution.add_dirs`, and that is the only fixture mechanism measured to work
// here (2026-08-27): an ABSOLUTE path scored 1.00 with the model reading the
// corpus, a relative path scored 0.00, `${CLAUDE_PLUGIN_ROOT}` scored 0.00, and
// `execution.scaffold_script` under `--scaffold` loaded, ran, and left the
// agent's working directory empty.
//
// An absolute path cannot be committed — it names one machine. So the case is
// generated: a template under `evals/templates/` plus a corpus path produce a
// real `case.yaml` in a scratch directory, which the runner is then pointed at.
// Generated cases are never committed; the template is.
//
// THE CORPUS IS COPIED, NEVER REFERENCED. A case grants the agent Bash, and an
// agent with Bash and an absolute path into somebody's live repository can write
// to it. The snapshot is read from the source once and everything after that
// happens to the copy.
//
// Usage:
//   node scripts/eval-fixture.mjs --corpus <dir> [--out <dir>] [--template <dir>]
//   node scripts/eval-fixture.mjs --corpus ~/RustroverProjects/zeus --list
//
// Exit: 0 on success, 2 on a usage problem. Writes only under --out.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const KNOWN = new Set(['--corpus', '--out', '--template', '--list'])

/** The subdirectories of a decision corpus worth copying, in the order tried. */
export const CORPUS_PARTS = ['docs/adr', 'docs/specs', 'docs/architecture.md', '.quality-harness.json']

/**
 * Copy the decision-record parts of `source` into `into`, and report what landed.
 *
 * Only the corpus is taken. A repository's source tree is irrelevant to every
 * case this generates and copying it would make a 400MB fixture out of a 2MB one.
 */
export function snapshot(source, into) {
  const taken = []
  for (const part of CORPUS_PARTS) {
    const from = path.join(source, part)
    if (!existsSync(from)) continue
    const to = path.join(into, part)
    mkdirSync(path.dirname(to), { recursive: true })
    cpSync(from, to, { recursive: true, dereference: true })
    taken.push(part)
  }
  return taken
}

/** How many records and task files a snapshot holds, so a case can state its own scale. */
export function measure(root) {
  const adr = path.join(root, 'docs', 'adr')
  let records = 0
  let tasks = 0
  const walk = directory => {
    let entries = []
    try { entries = readdirSync(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      if (!entry.name.endsWith('.md')) continue
      if (/^(?:T\d|README)/i.test(entry.name)) tasks += 1
      else if (/^ADR[-_]?\d/i.test(entry.name)) records += 1
    }
  }
  walk(adr)
  return { records, tasks }
}

// Tools the runner refuses unless an OPERATOR grants them. `allowed_tools:` in a
// case declares what it wants; it does not grant. Measured 2026-08-27: a case
// declaring Write and Edit ran with `--allow-tools Bash`, the runner printed
// "not granted … Write, Edit" as its first line, the model could not write, and
// both behavioural graders failed for a reason that had nothing to do with the
// model. The same trap is already recorded in docs/BACKLOG.md finding B, read
// the same day, and hit anyway — so the invocation is generated, not remembered.
export const GATED = new Set(['Bash', 'Write', 'Edit', 'WebFetch', 'WebSearch', 'NotebookEdit'])

/** The gated tools a rendered case declares, so the printed command grants them. */
export function grantsFor(bodies) {
  const wanted = new Set()
  for (const body of bodies) {
    const block = /^\s*allowed_tools:\s*\[([^\]]*)\]/m.exec(body)
    const listed = block
      ? block[1].split(',')
      : (/^\s*allowed_tools:\s*$([\s\S]*?)^\s*\w/m.exec(body)?.[1] ?? '').split('\n')
    for (const raw of listed) {
      const name = raw.replace(/[-\s'"]/g, '')
      if (GATED.has(name) || name.startsWith('mcp__')) wanted.add(name)
    }
  }
  return [...wanted].sort()
}

/** Substitute the generated values into a template body. */
export function render(body, values) {
  return body.replace(/\{\{(\w+)\}\}/g, (whole, key) =>
    (Object.hasOwn(values, key) ? String(values[key]) : whole))
}

export function main(argv = process.argv.slice(2)) {
  const unknown = argv.filter(a => a.startsWith('--') && !KNOWN.has(a))
  if (unknown.length) {
    process.stderr.write(`eval-fixture: unknown option: ${unknown[0]}\n`
      + 'usage: eval-fixture.mjs --corpus <dir> [--out <dir>] [--template <dir>] [--list]\n')
    return 2
  }
  const value = flag => {
    const at = argv.indexOf(flag)
    return at === -1 ? null : argv[at + 1] ?? null
  }
  // fileURLToPath, not `new URL(...).pathname`: on Windows the latter yields
  // `/C:/…`, which `path.dirname` walks happily and no directory ever matches.
  // CI caught it 2026-08-27 — the templates lookup failed, so `main([])` returned
  // "no template directory" where the test expected "--corpus is required", and
  // the failure named the assertion rather than the platform.
  const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
  const templates = path.resolve(value('--template') ?? path.join(here, 'evals', 'templates'))
  if (!existsSync(templates)) {
    process.stderr.write(`eval-fixture: no template directory at ${templates}\n`)
    return 2
  }
  const names = readdirSync(templates).filter(name => name.endsWith('.case.yaml'))
  // Listing templates asks nothing about a corpus, so it must not demand one —
  // a flag that refuses the cheapest question is a flag people stop using.
  if (argv.includes('--list')) {
    for (const name of names) process.stdout.write(`${name.replace(/\.case\.yaml$/, '')}\n`)
    return 0
  }

  const corpus = value('--corpus')
  if (!corpus) {
    process.stderr.write('eval-fixture: --corpus <dir> is required — the decision corpus to snapshot.\n')
    return 2
  }
  const source = path.resolve(corpus.replace(/^~(?=\/|$)/, os.homedir()))
  if (!existsSync(source) || !statSync(source).isDirectory()) {
    process.stderr.write(`eval-fixture: not a directory: ${source}\n`)
    return 2
  }

  if (!names.length) {
    process.stderr.write(`eval-fixture: no *.case.yaml templates in ${templates}\n`)
    return 2
  }

  // The CASES must live inside the plugin — `--eval-dir` refuses an absolute
  // path, refuses anything outside the plugin, and refuses a name that does not
  // start with a letter or digit, so `.generated` is out and `generated` is in. The corpus SNAPSHOT does not, because
  // `add_dirs` takes an absolute path, so it stays in temp where a stale copy
  // cannot accumulate in the repository.
  const out = path.resolve(value('--out') ?? path.join(here, 'evals', 'generated'))
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'qh-corpus-'))
  const taken = snapshot(source, fixture)
  if (!taken.length) {
    process.stderr.write(`eval-fixture: ${source} holds none of ${CORPUS_PARTS.join(', ')}\n`)
    return 2
  }
  const scale = measure(fixture)

  const cases = path.join(out, 'cases')
  const rendered = []
  for (const name of names) {
    const id = name.replace(/\.case\.yaml$/, '')
    const directory = path.join(cases, id)
    mkdirSync(directory, { recursive: true })
    const body = render(readFileSync(path.join(templates, name), 'utf8'),
      { CORPUS: fixture, RECORDS: scale.records, TASKS: scale.tasks, NAME: id })
    writeFileSync(path.join(directory, 'case.yaml'), body)
    rendered.push(body)
  }
  const grants = grantsFor(rendered)

  process.stdout.write(`snapshot: ${taken.join(', ')} from ${source}\n`)
  process.stdout.write(`corpus:   ${fixture} (${scale.records} record(s), ${scale.tasks} task file(s))\n`)
  const relative = path.relative(here, cases).split(path.sep).join('/')
  process.stdout.write(`cases:    ${cases} (${names.length})\n\n`)
  process.stdout.write('Run them with:\n')
  process.stdout.write(`  claude plugin eval --eval-dir ${relative} --runs 3`
    + `${grants.length ? ` --allow-tools ${grants.join(' ')}` : ''} .\n`)
  if (grants.length) {
    process.stdout.write(`\nThe grant is not optional: these cases DECLARE ${grants.join(', ')}, and a\n`
      + 'declaration is not a grant — without it the runner says "not granted" on its\n'
      + 'first line and every behavioural grader fails for a reason about the invocation.\n')
  }
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main()
}
