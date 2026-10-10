// Which command is this project's check, and how it came to be named: declared in .quality-harness.json, or inferred from a
// manifest, and whether an inferred one can be trusted. Moved out of lifecycle.mjs unchanged (BACKLOG section 375, stage B3).
// It reads the project's files and nothing it is told: no session, no ledger.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { nearestExistingDirectory } from './event-log.mjs'
import { shellWords } from './shell-words.mjs'
import { SHELL_NAMES, programName } from './publish-command.mjs'
import { checkInCode } from './corpus-text.mjs'
import { gitRepositoryLookup } from './tree-facts.mjs'

// Discovery, in the order a person would try: the repository's own script, then
// its package manifest, then its build file, then the language's default. The
// offer is routed through `qh-check`, which is the only thing here that records
// evidence — naming a command without it leaves a run nothing can see, which is
// worse than saying nothing. Returns null when the project names no check; the
// gate must not
// invent one.
const PROJECT_CHECKS = [
  { file: 'scripts/selftest.sh', command: 'bash scripts/selftest.sh' },
  { file: 'selftest.sh', command: 'bash selftest.sh' },
  // Ahead of the language manifests on purpose: a repository that ships a
  // verify script has said what its check is, and `cargo test` / `go test ./...`
  // is a guess at part of it. ts-no-adr-corpus ran `./verify.sh`, this list did not
  // know the name, and the gate asked for "the smallest repository-owned test,
  // lint, build, or validation command" — naming nothing it could not already
  // see. Reported 2026-08-26.
  { file: 'scripts/verify.sh', command: 'bash scripts/verify.sh' },
  { file: 'verify.sh', command: 'bash verify.sh' },
  { file: 'Cargo.toml', command: 'cargo test' },
  { file: 'go.mod', command: 'go test ./...' },
  { file: 'pytest.ini', command: 'pytest' },
  { file: 'tox.ini', command: 'pytest' },
  // PHP was missing entirely, and the consequence was not "no answer" but a
  // WRONG one: Laravel and Symfony ship a package.json whose only scripts are
  // `dev` and `build`, both vite, so discovery fell through to the package
  // manager and named `npm run build` as a pure-PHP API's check — a frontend
  // build that cannot fail because of a PHP edit or pass because of one.
  // Measured 2026-08-29 against the installed 2.34.1 in a real Laravel
  // repository (docs/BACKLOG.md §56). `phpunit.xml` is the declaration; a
  // `composer.json` alone is a weaker signal and is handled above it, by the
  // script the repository names for itself.
  { file: 'phpunit.xml', command: 'php vendor/bin/phpunit' },
  { file: 'phpunit.xml.dist', command: 'php vendor/bin/phpunit' },
]

/**
 * The check a project declares in `.quality-harness.json`, if it declares one.
 *
 * Anything that is not a non-empty string is IGNORED rather than honoured, and
 * ignoring it must leave the rungs below intact: a config file that turned the
 * feature off by being malformed would be the worst of both — no answer, and no
 * sign that anything was expected.
 */
function declaredCheckCommand(directory) {
  let config
  try {
    config = JSON.parse(readFileSync(path.join(directory, '.quality-harness.json'), 'utf8'))
  } catch { return null }
  const check = config?.check
  return typeof check === 'string' && check.trim() ? check.trim() : null
}

/**
 * Whether a project turned ADR-061's refusal back into its warning, with
 * `"publish": "warn"` in `.quality-harness.json` (the owner's decision,
 * 2026-09-22). Only that exact value counts. Anything else present is reported
 * as ignored and keeps the refusal, so a typo cannot silently switch it off.
 * An unreadable file keeps the refusal too, and says nothing: it declares nothing.
 *
 * `discovery` is the root lookup the refusal was decided on. Reading the file
 * from a SECOND lookup let the two disagree: a second lookup that failed fell
 * back to the current directory, missed the root's opt-out and refused (Codex
 * review round 3). A lookup that could not answer is unknown, never "here".
 */
export function publishSetting(cwd, discovery = null) {
  const directory = nearestExistingDirectory(path.resolve(cwd))
  if (!directory) return { warn: false, ignored: false, unknown: true }
  const found = discovery ?? gitRepositoryLookup(directory)
  if (!found.ok) return { warn: false, ignored: false, unknown: true }
  let config
  try {
    config = JSON.parse(readFileSync(path.join(found.root ?? directory, '.quality-harness.json'), 'utf8'))
  } catch { return { warn: false, ignored: false, unknown: false } }
  if (!config || typeof config !== 'object' || !Object.hasOwn(config, 'publish')) return { warn: false, ignored: false, unknown: false }
  return config.publish === 'warn' ? { warn: true, ignored: false, unknown: false } : { warn: false, ignored: true, unknown: false }
}

export function publishSettingNote(setting) {
  if (setting.warn) return ' Refusal is off for this project: `"publish": "warn"` in .quality-harness.json makes this a warning.'
  if (setting.ignored) return ' The `"publish"` value in .quality-harness.json was ignored: only `"publish": "warn"` turns this refusal into a warning.'
  return ''
}

// A declaration that cannot fail does not certify. Measured 2026-09-22: `true`,
// `:`, `exit 0`, `sh -c true` and `bash -c 'exit 0'` each exit 0. One layer of
// `sh -c` or `bash -c` around those is the same command. `sh check.sh` is not.
// ⚠ IT WAS A REGEX OVER THE TEXT, and a chaos round of 626934a passed five constant
// checks through it — `test 1`, `/usr/bin/true`, `echo ok`, `true || false` and
// `true # comment` — each recorded as a passing check that then unlocks a commit.
// Read as the shell splits it (ADR-067), the list's exit status is evaluated the way
// the shell would, from the commands whose status the text alone fixes (`true`, `:`,
// `echo`, `exit N`, `test` with one literal operand, a shell's `-c` string): a check
// whose status is fixed is constant (`npm test || true`, `npm test; echo done`).
const KNOWN_STATUS = { true: 'zero', ':': 'zero', echo: 'zero', printf: 'zero', false: 'nonzero' }

export function constantSuccessCheck(command) {
  if (typeof command !== 'string' || !command.trim()) return false
  return listStatus(command, 0) === 'zero'
}

// The exit status of a whole list, evaluated as the shell does — `&&` and `||`
// short-circuit, `;`, a newline and a pipe take the next command's status, and a
// command sent to the background is 0 — as 'zero', 'nonzero' or 'either' when a
// command that may run has a status the text cannot fix. `npm test || true` is 'zero'
// whatever the tests do. A constant here REFUSES the declaration, so anything this
// does not model is 'either': a builtin that changes how the rest runs (`set -e`,
// `trap`, `source`), a subshell, a redirection that can fail on its own (Codex review
// of the 626934a batch: `set -e; test -f F; echo done`, `(exit 0); test -f F` and
// `true < F` were each read as constant and depend on the tree).
const LIST_CONTROL = new Set(['set', 'shopt', 'trap', 'exec', 'source', '.', 'eval', 'return', 'alias', 'unalias', 'builtin', 'enable'])

function listStatus(text, depth) {
  const { commands, complete } = shellWords(text)
  if (!complete || commands.length === 0 || depth > 3) return 'either'
  if (commands.some(c => c.redirects > 0 || c.ended === '(' || c.ended === ')' || LIST_CONTROL.has(programName(c.argv[0] ?? '')))) return 'either'
  const merge = (a, b) => (a === b ? a : 'either')
  let status = 'zero'
  for (let i = 0; i < commands.length; i++) {
    const joiner = i === 0 ? ';' : commands[i - 1].ended
    const own = commands[i].ended === '&' ? { status: 'zero' } : commandStatus(commands[i], depth)
    // `exit` before the end stops the list on the paths that reach it; the others go
    // on, so only a path every run takes is known. As the LAST command it is simply
    // the list's status, combined like any other (`test -f F || exit 0` is 0).
    if (own.exits && i < commands.length - 1) {
      if (joiner === '&&' ? status === 'zero' : joiner === '||' ? status === 'nonzero' : true) return own.status
      return 'either'
    }
    if (joiner === '&&') status = status === 'zero' ? own.status : status === 'nonzero' ? 'nonzero' : merge(own.status, 'nonzero')
    else if (joiner === '||') status = status === 'nonzero' ? own.status : status === 'zero' ? 'zero' : merge(own.status, 'zero')
    else status = own.status
  }
  return status
}

function commandStatus(c, depth) {
  // A word that is exactly `[` is the test builtin, not a glob.
  if (c.substitutions.length || c.argv.length === 0 || (c.dynamic.includes(0) && c.argv[0] !== '[')) return { status: 'either' }
  const [program, ...args] = c.argv
  const name = programName(program)
  if (name === 'exit') {
    if (args.length === 0 || !/^\d+$/.test(args[0])) return { status: 'either', exits: true }
    return { status: Number(args[0]) === 0 ? 'zero' : 'nonzero', exits: true }
  }
  if (name in KNOWN_STATUS) return { status: KNOWN_STATUS[name] }
  if ((name === 'test' || name === '[') && !c.dynamic.some(k => k > 0)) {
    const operands = name === '[' && args.at(-1) === ']' ? args.slice(0, -1) : args
    if (operands.length === 1 && !operands[0].startsWith('-')) return { status: operands[0] === '' ? 'nonzero' : 'zero' }
    return { status: 'either' }
  }
  // Only a bare `-c`: `sh -ec`, `bash -o pipefail -c` change how the string runs.
  if (SHELL_NAMES.has(name.toLowerCase()) && args[0] === '-c' && args[1] !== undefined) return { status: listStatus(args[1], depth + 1) }
  return { status: 'either' }
}

function packageManagerCommand(directory) {
  let manifest
  try {
    manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'))
  } catch { return null }
  const scripts = manifest?.scripts
  if (!scripts || typeof scripts !== 'object') return null
  const runner = existsSync(path.join(directory, 'pnpm-lock.yaml')) ? 'pnpm'
    : existsSync(path.join(directory, 'yarn.lock')) ? 'yarn'
    : existsSync(path.join(directory, 'bun.lockb')) ? 'bun'
    : 'npm'
  // A BUILD IS NOT A CHECK. `build` was the last resort here, so any repository
  // with a package.json and no test/check/lint/typecheck script was told its
  // evidence command was a build — which compiles and says nothing about
  // behaviour. Naming nothing is the honest answer (ADR-005): a reader can act
  // on "I could not determine this project's check", and cannot act on a build
  // that passes while the code is broken.
  for (const name of ['test', 'check', 'lint', 'typecheck']) {
    if (typeof scripts[name] === 'string' && scripts[name].trim()) {
      return runner === 'npm' ? `npm run ${name}` : `${runner} ${name}`
    }
  }
  return null
}

function makeTargetCommand(directory) {
  for (const file of ['Makefile', 'makefile', 'justfile', 'Justfile']) {
    let source
    try { source = readFileSync(path.join(directory, file), 'utf8') } catch { continue }
    const runner = /justfile/i.test(file) ? 'just' : 'make'
    for (const target of ['test', 'check', 'lint', 'verify', 'validate', 'build']) {
      if (new RegExp(`^${target}\\s*:`, 'm').test(source)) return `${runner} ${target}`
    }
  }
  return null
}

// The check this project owns, named so a session can run it instead of guessing.
export function projectCheckCommand(cwd = process.cwd()) {
  return checkCommandOrigin(cwd).command
}

/**
 * The check for `cwd` AND where it came from: `declared` when the project said
 * so in `.quality-harness.json`, `inferred` when this tool read it off a
 * manifest, `none` when neither, `refused` when the declaration cannot fail,
 * `unproven` when the repository root could not be read. `discovery`, when a
 * test passes one, is that lookup's answer instead of asking git again.
 *
 * One resolver, two callers. `runTheCheckSentence` needs the provenance to say
 * whether a red on a clean tree is a finding about the environment, and
 * resolving the root a second time at that call site is how one rule becomes two
 * spellings that drift — which cost this project a defect the same day
 * (docs/BACKLOG.md §66).
 */
/**
 * fastCheckCommand reads the `fastCheck` a project declares beside `check`
 * (ADR-081): the same rules, a non-empty string that is not a constant success.
 * Anything else is no fast check, and `qh-check --fast` says so.
 */
export function fastCheckCommand(root) {
  let config
  try { config = JSON.parse(readFileSync(path.join(root, '.quality-harness.json'), 'utf8')) } catch { return null }
  const fast = typeof config?.fastCheck === 'string' ? config.fastCheck.trim() : ''
  return fast && !constantSuccessCheck(fast) ? fast : null
}

export function checkCommandOrigin(cwd = process.cwd(), discovery = null) {
  const directory = nearestExistingDirectory(path.resolve(cwd))
  if (!directory) return { command: null, origin: 'none' }
  const found = discovery ?? gitRepositoryLookup(directory)
  if (!found.ok) return { command: null, origin: 'unproven' }
  const root = found.root ?? directory
  // WHAT THE PROJECT SAYS, before any guess. Every rung below infers a command
  // from a manifest, and an inferred command can fail to DISCRIMINATE: measured
  // 2026-08-29 in a real Laravel repository, the derived `php vendor/bin/phpunit`
  // is red on a clean tree because of a host-only failure, so a session gets the
  // same exit code whether or not it broke anything — zero bits, which is worse
  // than the wrong-command defect it replaced (docs/BACKLOG.md §59). That
  // repository's own declared check discriminated cleanly against two injected
  // mutations. `.quality-harness.json` already carries this project's config, so
  // a declared check needs no new file and no parsing of prose.
  //
  // A declaration can of course be WRONG. That is the point: the mistake is then
  // the project's own, visible in a file someone can fix, rather than this tool
  // guessing and being wrong on the project's behalf.
  const declared = declaredCheckCommand(root)
  if (declared && constantSuccessCheck(declared)) return { command: null, origin: 'refused' }
  if (declared) return { command: declared, origin: 'declared' }
  // A script the repository NAMES FOR ITSELF beats a manifest guess, the same
  // reason `scripts/verify.sh` sits above `go test ./...`: `php vendor/bin/phpunit`
  // is a guess at how this project runs its tests, and in the repository that
  // reported §56 it is the wrong one — phpunit there runs only inside Docker, so
  // the bare host command would not execute at all.
  //
  // ⚠ THE `composer test` RUNG IS GONE, and removing it is the SAFE way to satisfy
  // the invariant it broke. It offered `composer test` as the project's own check
  // while the evidence check refused that string, and the two attempts to fix
  // that by ACCEPTING more each produced a P1 in review: first `--help` and
  // `test-data` passing the publish guard, then a whole `composer` family turning
  // `composer update` — which writes composer.lock — from `unrecognised` into
  // `neither`. Section 16 is explicit that a classifier permitting more needs
  // stronger evidence than one permitting less, and this rung was the demand for
  // it.
  //
  // Offering LESS satisfies the same invariant with none of that risk, and it
  // gives a Laravel project the BETTER answer anyway: it falls through to the
  // phpunit rung below, which a session running a real Laravel 11 tree confirmed
  // names the command they would actually run, with the inference caveat leading.
  // The rung also read a `laravel new` skeleton default as the project SPEAKING,
  // which it is not.
  for (const candidate of PROJECT_CHECKS) {
    if (existsSync(path.join(root, candidate.file))) {
      return { command: candidate.command, origin: 'inferred' }
    }
  }
  const packaged = packageManagerCommand(root)
  if (packaged) return { command: packaged, origin: 'inferred' }
  const made = makeTargetCommand(root)
  if (made) return { command: made, origin: 'inferred' }
  return { command: null, origin: 'none' }
}

// Names the project's own check when there is one, so the gate asks for
// something specific instead of leaving the reader to guess which invocation
// counts. Falls back to the general phrasing when the project names none.
export function runTheCheckSentence(cwd) {
  const { command, origin } = checkCommandOrigin(cwd ?? process.cwd())
  if (origin === 'refused') {
    return 'The check declared in `.quality-harness.json` is a constant success and was refused. '
      + 'Declare a command that can fail.'
  }
  if (origin === 'unproven') {
    return 'The repository root could not be read, so no check is named. '
      + 'That is not the same as this project having no check.'
  }
  if (!command) {
    return 'Run the smallest repository-owned test, lint, build, or validation command after the '
      + 'final edit and report the exact command and result.'
  }
  // A DECLARED command is the project speaking; an INFERRED one is this tool
  // guessing from a manifest, and a guess carries no confidence about the
  // environment it needs. Measured 2026-08-29: an inferred `php vendor/bin/phpunit`
  // was red on a clean tree because of a host-only failure, so a session got the
  // same exit code whether or not it had broken anything — and a red it did not
  // cause teaches distrust of the gate, which is what let an earlier wrong
  // command survive so long (docs/BACKLOG.md §59).
  if (origin === 'declared') {
    return `Run \`qh-check\` — it runs ${checkInCode(command)} (this project's own check) and records what it `
      + 'observed — after the final edit and report the exact command and result.'
  }
  // The word "environment" is deliberately NOT used here. It is reserved for a
  // run that actually failed that way, and a standing note carrying it in every
  // message would make the word stop meaning anything — which
  // tests/lifecycle.test.mjs::a check that could not run is not a finding about
  // the change asserts, and caught when the first version of this said it.
  // Lead with undeclared: burying the caveat after "this project's own check" is
  // how a Makefile `make test` was read as the project's check (2026-09-12).
  return `No \`check\` is declared in \`.quality-harness.json\`. I inferred from this `
    + `repository rather than from a declaration: ${checkInCode(command)}, so that is not this `
    + 'project\'s own check. If it is red on an unmodified tree the finding is about this '
    + 'machine and not about your change — say which, and declare the real command as `check`. '
    + `Run \`qh-check\` (it runs ${checkInCode(command)} and records what it observed) after the final `
    + 'edit and report the exact command and result.'
}

export function inferredCheckCaveat(cwd) {
  const { command, origin } = checkCommandOrigin(cwd)
  return origin === 'inferred'
    ? ` The check ${checkInCode(command)} was inferred from a manifest, not declared; declare it as \`check\` in .quality-harness.json.`
    : ''
}
