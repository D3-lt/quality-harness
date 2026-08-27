// Wave 4a of docs/TEST-PLAN.md — the contract between what the skills TELL a
// model to run and what the gates actually accept.
//
// Every defect this session found had the same shape: a document says X and the
// code does Y, and nothing compares them. The skills are 15,698 words of
// instructions naming gate commands, flags, slash commands and template paths.
// Nothing checked that any of them still resolve.
//
// This is a ratchet, not a bug hunt — everything resolves today. It fails when a
// flag is renamed, a gate is dropped, or a skill starts instructing an
// invocation the gate refuses.
//
// NOT covered here: whether a skill's instructions produce good behaviour. That
// needs `claude plugin eval`, which is in early access and unavailable, and
// authoring graders that cannot be run is the failure this project keeps fixing.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))
const root = resolve(testDir, '..')
const bin = join(root, 'bin')
// Extensionless only: a bin/*.cmd is a Windows shim for a gate, not a gate.
const gates = readdirSync(bin).filter(name => !name.includes('.'))
const skills = readdirSync(join(root, 'skills'))
const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` }

/**
 * Lines as a reader means them, not as the file wraps them.
 *
 * A code span may wrap: `adr-verify --mutant <file> --from --to\n--why` is one
 * instruction across two lines. Joining only lines that end mid-span keeps a
 * fenced block's commands on their own lines, where each really is separate —
 * and stops a window from running past a line end into unrelated text. Joining
 * the whole file instead attributed `git diff --summary`, three lines away, to
 * adr-debt.
 */
export function logicalLines(text) {
  const out = []
  let fence = false
  let pending = null
  const odd = line => ((line.match(/`/g) ?? []).length % 2) === 1
  for (const raw of text.split('\n')) {
    if (/^\s*```/.test(raw)) { fence = !fence; out.push(raw); continue }
    if (pending !== null) {
      const joined = `${pending} ${raw.trim()}`
      if (!fence && odd(joined)) { pending = joined; continue }
      pending = null
      out.push(joined)
      continue
    }
    if (!fence && odd(raw)) { pending = raw.trim(); continue }
    out.push(raw)
  }
  if (pending !== null) out.push(pending)
  return out
}

// Flags a skill names alongside exactly one gate, attributed to that gate. The
// window stops at the end of the code span or sentence, so a later unrelated
// command on the same line is not swept in.
function flagsNamedBySkills() {
  const found = new Map()
  for (const skill of skills) {
    const text = readFileSync(join(root, 'skills', skill, 'SKILL.md'), 'utf8')
    for (const line of logicalLines(text)) {
      for (const gate of gates) {
        for (const m of line.matchAll(new RegExp(`\\b${gate}\\b`, 'g'))) {
          const tail = line.slice(m.index + gate.length).split(/`|\. |, |;/)[0]
          for (const flag of tail.match(/--[a-z][a-z-]*/g) ?? []) {
            const key = `${gate} ${flag}`
            if (!found.has(key)) found.set(key, new Set())
            found.get(key).add(skill)
          }
        }
      }
    }
  }
  return found
}

test('every gate flag a skill instructs is a flag that gate declares', () => {
  // What this proves and what it does not. It catches a skill naming a flag the
  // gate has no notion of — an invented or stale instruction. It does NOT prove
  // the gate still PARSES the flag: `--why` survived being renamed at its parse
  // site because the string still appeared in an error message. The gate-side
  // direction is covered by the invocation table below, which runs the thing and
  // pins what comes back.
  const named = flagsNamedBySkills()
  assert.ok(named.size >= 8, `attribution found only ${named.size} flags — the parser broke`)

  for (const [key, users] of named) {
    const [gate, flag] = key.split(' ')
    const source = readFileSync(join(bin, gate), 'utf8')
    assert.ok(source.includes(flag),
      `${[...users].join(', ')} instruct \`${gate} ${flag}\`, but ${gate} declares no such flag`)
  }
})

test('a wrapped instruction is read as one instruction, and a neighbouring one is not', () => {
  // Both halves matter. Without joining, `adr-verify … --from --to` reads as an
  // invocation missing --why and the suite reports a defect that is not there —
  // a false alarm on a shared gate is how the gate gets switched off. Without
  // the line bound, a window runs into the next command and attributes its flags
  // to the wrong tool.
  const wrapped = logicalLines('run `adr-verify <t.md> --mutant <f> --from <a> --to <b>\n--why <c>` now.')
  assert.equal(wrapped.length, 1)
  assert.match(wrapped[0], /--from <a> --to <b> --why <c>/)

  const separate = logicalLines('```bash\nadr-debt docs/adr\ngit diff --summary\n```')
  assert.ok(separate.some(line => line.trim() === 'adr-debt docs/adr'))
  assert.ok(separate.some(line => line.trim() === 'git diff --summary'))
})

const temps = []
function corpus() {
  const temp = mkdtempSync(join(os.tmpdir(), 'quality-harness-contract-'))
  temps.push(temp)
  const copy = join(temp, 'ok')
  cpSync(join(testDir, 'fixtures', 'ok'), copy, { recursive: true })
  return copy
}
test.after(() => {
  for (const temp of temps) rmSync(temp, { recursive: true, force: true })
})

function runGate(args, cwd) {
  const [command, ...rest] = args
  const [file, argv] = process.platform === 'win32'
    ? ['python3', [join(bin, command), ...rest]]
    : [command, rest]
  return spawnSync(file, argv, { cwd, env, encoding: 'utf8', timeout: 60_000 })
}

// Each entry pins the exit code the invocation actually reaches, not a pattern
// in its output. Matching on error text does not work here: these gates parse
// argv by hand, so an unrecognized flag does not announce itself — its VALUE
// falls through to the positionals and the gate reports something ordinary. With
// `--why` unparsed, adr-verify says `task file not found: probe`, which no
// usage-error regex catches but which a pinned exit code does.

// Every multi-flag invocation the skills document, instantiated against the
// fixture corpus. The test below refuses to let a new one be added to a SKILL.md
// without a runnable entry here — a documented invocation nobody has ever run is
// the same claim-without-evidence the gates themselves reject.
const INVOCATIONS = [
  // 1: the mutant survives — nothing reads unused.py, so the fence cannot notice
  // it. A survived mutant is a finding, and a finding is a real verdict.
  { shape: 'adr-verify --mutant --from --to --why', exit: 1,
    build: dir => ({ cwd: dir, args: ['adr-verify', 'tasks/T1-fixture.md', '--cwd', '.',
      '--mutant', 'unused.py', '--from', 'X = 1', '--to', 'X = 2', '--why', 'probe'] }) },
  { shape: 'adr-verify --human', exit: 0,
    build: dir => ({ cwd: dir, args: ['adr-verify', 'tasks/T1-fixture.md', '--human', 'Zy observed it'] }) },
  { shape: 'adr-retire-check --adopt', exit: 0,
    build: dir => ({ cwd: dir, args: ['adr-retire-check', '--adopt', 'adr', 'adr-archive'] }) },
  { shape: 'spec-verify --spec --repo', exit: 0,
    build: dir => ({ cwd: dir, args: ['spec-verify', '--spec', '--repo', dir, 'spec-selftest.md'] }) },
  // --all changes the OUTPUT, not the exit code: without it adr-next prints the
  // single next task and still exits 0, so a pinned code alone cannot tell
  // whether the flag was parsed. Where a flag's whole effect is what it prints,
  // that is what has to be asserted.
  { shape: 'adr-next --all', exit: 0, output: /^(?:READY|done|blocked)\s+T\d+/m,
    build: dir => ({ cwd: dir, args: ['adr-next', 'tasks', '--all'] }) },
]

test('every multi-flag invocation the skills document actually runs', () => {
  for (const { shape, build, exit: expected, output } of INVOCATIONS) {
    const dir = corpus()
    // The mutant row needs a file nothing reads, so the fence's verdict is about
    // the mutant rather than about the corpus.
    writeFileSync(join(dir, 'unused.py'), 'X = 1\n')
    writeFileSync(join(dir, 'tasks', 'T1-fixture.md'),
      `${readFileSync(join(dir, 'tasks', 'T1-fixture.md'), 'utf8').trimEnd()}\n\n## Mutation Log\n`)

    const { cwd, args } = build(dir)
    const result = runGate(args, cwd)
    assert.equal(result.status, expected,
      `${shape} is documented but the gate did not reach its verdict\n$ ${args.join(' ')}\n${result.stdout}${result.stderr}`)
    if (output) {
      assert.match(result.stdout, output,
        `${shape} ran, but produced nothing only that flag produces\n${result.stdout}`)
    }
  }
})

test('a documented invocation with two or more flags has a runnable instantiation', () => {
  // The guard on the table above. Without it a skill could start instructing a
  // new flag combination and nothing would ever run it — which is exactly the
  // state every gate in this repo was in before docs/TEST-PLAN.md.
  const covered = new Set(INVOCATIONS.map(entry => entry.shape))
  for (const skill of skills) {
    const text = readFileSync(join(root, 'skills', skill, 'SKILL.md'), 'utf8')
    for (const line of logicalLines(text)) {
      for (const gate of gates) {
        for (const m of line.matchAll(new RegExp(`\\b${gate}\\b`, 'g'))) {
          const tail = line.slice(m.index + gate.length).split(/`|\. |, |;/)[0]
          const flags = tail.match(/--[a-z][a-z-]*/g) ?? []
          if (flags.length < 2) continue
          const shape = `${gate} ${flags.join(' ')}`
          assert.ok(covered.has(shape),
            `${skill} documents \`${shape}\` and INVOCATIONS has no entry that runs it`)
        }
      }
    }
  }
})

test('no skill recommends a shape the evidence chain cannot cover', () => {
  // adr-write used to say "≤3 tasks: inline numbered list inside the ADR. No
  // `tasks/` directory." adr-verify writes its Verification Log and Mutation Log
  // into a TASK FILE, so inline tasks have nowhere for tool-written evidence to
  // land, and adr-lint runs ADR-level checks only without a tasks directory.
  // The plugin's own guidance routed small work around its own guarantee.
  const adrWrite = readFileSync(join(root, 'skills', 'adr-write', 'SKILL.md'), 'utf8')
  assert.doesNotMatch(adrWrite, /No `tasks\/` directory/,
    'adr-write must not recommend an ADR shape adr-verify cannot write evidence into')
  assert.match(adrWrite, /≤3 tasks.*`tasks\/` directory/s)
})

test('every command and template a skill points at resolves', () => {
  for (const skill of skills) {
    const text = readFileSync(join(root, 'skills', skill, 'SKILL.md'), 'utf8')

    // Slash commands resolve to a skill OR a workflow — the lifecycle stages are
    // skills, and consensus/quality-cycle/review-ring are workflows. The
    // asymmetry is real; a check that assumed one root would fail on the other.
    for (const m of text.matchAll(/\/quality-harness:([a-z-]+)/g)) {
      const name = m[1]
      const isSkill = existsSync(join(root, 'skills', name, 'SKILL.md'))
      const isWorkflow = existsSync(join(root, 'workflows', `${name}.js`))
      assert.ok(isSkill || isWorkflow,
        `${skill} points at /quality-harness:${name}, which is neither a skill nor a workflow`)
    }

    // Only templates/ is asserted. A skill also names paths like
    // docs/architecture.md and docs/postmortems/<filename> — those belong to the
    // PROJECT the plugin is used on, not to this repository, and asserting them
    // here would fail for a correct instruction.
    for (const m of text.matchAll(/templates\/[a-z-]+\.md/g)) {
      assert.ok(existsSync(join(root, m[0])), `${skill} points at ${m[0]}, which does not exist`)
    }

    for (const gate of text.match(/\b(?:adr|spec|arch|postmortem)-[a-z-]+\b/g) ?? []) {
      if (!gate.match(/^(adr-lint|adr-verify|adr-next|adr-debt|adr-retire-check|spec-verify|arch-lint|postmortem-verify)$/)) continue
      assert.ok(gates.includes(gate), `${skill} names the gate ${gate}, which is not bundled`)
    }
  }
})

test('no skill tells the agent to stop on a gate verdict', () => {
  // The harness advises; so must its instructions. On 2026-08-26 the hooks were
  // made advisory-only and the skills were not, so adr-execute still opened with
  // "Verify before starting; stop and ask if any fail" and "Do not proceed on a
  // failing lint" — a block one layer up from the one that had just been removed.
  // Confirmed: "we opted FULL in with guided instructions for an AI agent."
  //
  // A gate's finding is information. The agent fixes what is real, and says
  // plainly what stands and why. What it must never do is halt with the verdict
  // as the reason.
  const halts = [
    /stop and ask if any fail/i,
    /do not proceed on a failing/i,
    /exit 0 required/i,
    /^#+\s*Hard Gates/im,
    /\bRefuse a candidate\b/,
  ]
  for (const skill of skills) {
    const file = join(root, 'skills', skill, 'SKILL.md')
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const halt of halts) {
      assert.doesNotMatch(text, halt, `${skill}: ${halt}`)
    }
  }

  // And the guidance that replaced them still names the gate — dropping the
  // instruction to RUN it would be the opposite failure: silence instead of a
  // block, which is the one the owner called worse than having no plugin.
  const execute = readFileSync(join(root, 'skills', 'adr-execute', 'SKILL.md'), 'utf8')
  assert.match(execute, /Run `adr-lint <adr\.md>` and paste the run/)
  assert.match(execute, /name which finding and why it does not apply/)
  const arch = readFileSync(join(root, 'skills', 'arch-write', 'SKILL.md'), 'utf8')
  assert.match(arch, /Run `arch-lint <architecture\.md>` and paste the run/)
  const post = readFileSync(join(root, 'skills', 'postmortem', 'SKILL.md'), 'utf8')
  assert.match(post, /Run `postmortem-verify [^`]+` and paste the run/)
  const spec = readFileSync(join(root, 'skills', 'spec-write', 'SKILL.md'), 'utf8')
  assert.match(spec, /paste both/)
})

test('the record skills audit the class, not the instance', () => {
  // Asked for on 2026-08-27, and earned the same day: the same defect was fixed
  // four times as if it were new — four mutation entries went STALE one at a
  // time from one refactor, a forbidden path literal was fixed in three files
  // across three commits, and an early exit that skipped recovery was fixed as a
  // single instance while the class of early exits went unaudited and bit again.
  //
  // The rule is only worth writing down if it survives an edit that deletes it,
  // and prose nothing asserts is exactly what mutation 135 proved does not.
  for (const skill of ['adr-write', 'spec-write', 'adr-execute', 'adr-retire']) {
    const text = readFileSync(join(root, 'skills', skill, 'SKILL.md'), 'utf8')
    assert.match(text, /^## Audit the class, not the instance$/m,
      `${skill}: the rule must be a section an agent can find, not a buried sentence`)

    const section = text.split(/^## Audit the class, not the instance$/m)[1].split(/^## /m)[0]
    // A slogan is not a procedure. Each one has to say to ENUMERATE, and to do it
    // with something repeatable — recall is what produced the four separate
    // fixes. `grep`, a glob, a named script: something the next reader can re-run.
    assert.match(section, /\benumerate\b/i, `${skill}: the rule must say to enumerate the class`)
    assert.match(section, /\b(command|grep|glob|query|adr-state|adr-context)\b/i,
      `${skill}: enumeration must name a repeatable means, not memory`)
    // And the half everyone drops: what you leave out is part of the decision.
    assert.match(section, /(deliberately leave out|leave for later|keep active|second Fact|new tasks)/i,
      `${skill}: the rule must say what to do with members left out`)
  }
})
