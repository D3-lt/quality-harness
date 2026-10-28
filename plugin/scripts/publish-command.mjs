// Recognise executable commit/push invocations for reviewer and artifact guards.
// ADR-130 removes classifiers used only to exempt commands from compulsory checks.
// Recognition remains conservative over command text (ADR-067, CLAUDE.md §16).
import { shellWords } from './shell-words.mjs'
import { parseShell } from './shell-grammar.mjs'

// The text the shell never evaluates, taken out before the arithmetic scan: a quoted here-document's
// body, and an `echo` or `true` argument spelled in single quotes, or in double quotes with no `$`,
// backtick or backslash. `((1))` in a message and `echo 'let x=1'` are data; a double-quoted `$((…))`
// expands, so it stays (BACKLOG §381, item 4; the Codex scoped review of 12cbbadb).
// ⚠ A SPELLING IS ONLY A GUESS AT WHERE THE DATA STANDS. An arithmetic command is listed by no
// shellWords command, so only this scan sees it, and three spellings that read as data stood in
// code instead: a body repeated as a command after the here-document, an ANSI-C `$'…'` echo whose
// value is spelled across a closing quote and an arithmetic command, and a `<<-` body whose tabs the
// lexer strips (Codex reviews of 921330b9..976aa281 and 976aa281..18879680). So, as maskedMessages
// does, an occurrence of a spelling is swapped for a marker, and kept out only when the text read
// again holds the marker in exactly the slot the data came from. Each occurrence is tried on its own
// and at most one is kept per slot: a literal repeated as data (`echo 'let x=1'; echo 'let x=1'`) is
// two slots, while a copy that is code leaves its slot unmarked and stays (BACKLOG §381 L3, ADR-119 T3).
const DATA_MARK = 'qhdata'

function withoutData(text, { owns = () => true, echoes = true } = {}) {
  const { commands, complete } = shellWords(text)
  if (!complete) return text
  let out = text
  const take = (spelling, mark, stands) => {
    for (let at = out.indexOf(spelling); at !== -1; at = out.indexOf(spelling, at + 1)) {
      const next = out.slice(0, at) + mark + out.slice(at + spelling.length)
      const again = shellWords(next)
      if (again.complete && stands(again.commands)) { out = next; return }
    }
  }
  commands.forEach((step, n) => {
    step.heredocs.forEach((document, j) => {
      // A body keeps its line ending, or the delimiter line after it would join the marker.
      if (document.quoted && document.delimiter !== null && document.body.endsWith('\n') && owns(step, n, commands, text)) {
        take(document.body, `${DATA_MARK}\n`, read => read[n]?.heredocs[j]?.body === `${DATA_MARK}\n`)
      }
    })
    if (!echoes || (step.argv[0] !== 'echo' && step.argv[0] !== 'true')) return
    for (let k = 1; k < step.argv.length; k += 1) {
      const value = step.argv[k]
      if (!value.includes("'")) take(`'${value}'`, DATA_MARK, read => read[n]?.argv[k] === DATA_MARK)
      if (!/["\\$`]/.test(value)) take(`"${value}"`, DATA_MARK, read => read[n]?.argv[k] === DATA_MARK)
    }
  })
  return out
}

// The programs that only READ a quoted here-document: `cat` and `tee` copy it, `mrw write` takes it as a plan. Each
// was run under bash, zsh and sh with a stand-in for the verb in the body, and none ran it (CLAUDE.md §16). A body
// piped on (`cat <<'EOF' | sh`) is that program's input, and an argument or a substitution is something else to run,
// so only a command that is plain and last in its pipeline is a sink; an interpreter, `eval` and `source` are not.
const DATA_SINKS = new Set(['cat', 'tee'])
// ⚠ A BODY WRITTEN TO A FILE IS CODE AGAIN WHEN THE SAME COMMAND TEXT RUNS THAT FILE (CLAUDE.md §16's twin). Run under
// bash, zsh and sh: `cat > r.sh <<'EOF' … EOF` then `sh r.sh`, `bash`, `zsh`, `dash`, `. ./r.sh`, `source r.sh`, and
// `chmod +x r.sh; ./r.sh` all ran it, while `cat r.sh` did not. Across separate commands it stays the accepted gap:
// git's own hook (ADR-066) is the guard there. So a sink that writes keeps its body counted when a later command is
// not a plain reader and either names what was written, runs a file, or has a word it cannot read. A reader is plain
// only with no pipe, substitution, dynamic word or code (`cat r.sh | sh`, `echo $(sh r.sh)`, `cat <(sh r.sh)` each ran the
// body), and a shell needs no operand to run it (`sh < r.sh`, `| sh`): the Codex review of v3.8.42..2c747201.
const FILE_READERS = new Set(['cat', 'head', 'tail', 'wc', 'ls', 'less', 'more', 'grep', 'rg', 'diff', 'stat', 'file', 'echo', 'rm'])
const SCRIPT_RUNNERS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'source', '.'])
const WRAPPED_SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh'])
const OUTPUT_REDIRECT = /\d*>>?[|&]?\s*(?:"([^"]*)"|'([^']*)'|([^\s;&|<>()]+))/g
const sameFile = word => String(word).replace(/^\.\//, '')
function writtenFiles(step, text) {
  const files = new Set()
  if (programName(step.argv[0] ?? '') === 'tee') step.argv.slice(1).filter(word => !word.startsWith('-')).forEach(word => files.add(sameFile(word)))
  for (const [, double, single, bare] of text.matchAll(OUTPUT_REDIRECT)) files.add(sameFile(double ?? single ?? bare))
  return files
}
function runsWhatItWrote(step, n, commands, text) {
  const program = programName(step.argv[0] ?? '')
  const writes = program === 'mrw' || step.redirects > step.heredocs.length || (program === 'tee' && step.argv.length > 1)
  if (!writes) return false
  const files = writtenFiles(step, text)
  return commands.slice(n + 1).some(later => {
    const name = programName(later.argv[0] ?? '')
    // A command with no word can still run a substitution: an assignment (`x=$(sh r.sh)`) or a redirect alone (its verification).
    if (!later.argv.length) return later.substitutions.length > 0
    // Plain means no pipe, no substitution, no dynamic word and no code. A substitution is not always a dynamic word: one used
    // as a redirect target keeps no word at all (`> "$(sh r.sh)"`, its scoped review), so both are read.
    const plain = later.pipeTo === null && !later.substitutions.length && !later.dynamic.length && !later.code.some(Boolean)
    if (FILE_READERS.has(name)) return !plain
    // A shell named anywhere runs its input, whatever wraps it: `env sh < r.sh`, `xargs -0 sh -c < r.sh` (its scoped review).
    return later.dynamic.length > 0 || later.substitutions.length > 0 || later.argv[0].includes('/') || later.argv[0].endsWith('.sh')
      || SCRIPT_RUNNERS.has(name) || later.argv.some(word => WRAPPED_SHELLS.has(programName(word)) || files.has(sameFile(word)))
  })
}
function readsItsBodyAsData(step, n, commands, text) {
  if (step.pipeTo !== null || step.substitutions.length || step.dynamic.length || step.code.some(Boolean)) return false
  const program = programName(step.argv[0] ?? '')
  if (!DATA_SINKS.has(program) && !(program === 'mrw' && step.argv[1] === 'write')) return false
  return !runsWhatItWrote(step, n, commands, text)
}

// The text with those bodies taken out, for the advisory arm. Everything else stays as it was, so a word beside the
// body, a publish after it and a body something runs are all still seen.
export const withoutSinkBodies = text => withoutData(text, { owns: readsItsBodyAsData, echoes: false })

// Shells whose `-c` string runs, each executed with `-c` on 2026-09-26 (§296).
// pwsh and powershell take `-c` / `-Command` by their documentation. `su -c`,
// `runuser -c`, `flock -c`, `script -c` and `fish -c` are not named, so they are
// warned about rather than refused.
export const SHELL_NAMES = new Set(['bash', 'dash', 'zsh', 'ksh', 'tcsh', 'csh', 'sh', 'pwsh', 'powershell'])

const POWERSHELL = new Set(['pwsh', 'powershell'])

// Control keywords before a command, and the interpreters whose call spellings of a
// subprocess run git (`subprocess.run(["git","push"])`, `execSync('git push')`).
const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until'])

const INTERPRETERS = /^(?:python[\d.]*|node|nodejs|deno|bun|perl)$/

const SUBPROCESS_LIST = /subprocess\.(?:run|call|check_call|check_output|Popen)\(\s*\[\s*((?:(["'])[^"']*\2\s*,?\s*)+)/g

// The same argv list through node's child_process and perl's system/exec (a chaos round
// of 916b515: `spawnSync('git', ['push'])` and `system("git", "push")` pushed unread).
// perl's list form needs two items; a single string is a shell line, read below.
const CHILD_PROCESS_LIST = /\b(?:spawn|spawnSync|execFile|execFileSync)\(\s*((["'])[^"']*\2\s*,\s*\[[^\]]*)/g

const PERL_LIST = /\b(?:system|exec)\s*\(?\s*((["'])[^"']*\2(?:\s*,\s*(["'])[^"']*\3)+)/g

// `os.system` and `os.popen` hand their string to a shell (a Windows chaos round of
// 916b515: `python -c "import os; os.system('git push')"` pushed and was read as nothing).
const SUBPROCESS_STRING = /(?:subprocess\.(?:run|call|check_call|check_output|Popen)|\bexec(?:Sync|File|FileSync)?|\bos\.(?:system|popen))\(\s*(["'])(.*?)\1/g

// Whether offset `at` of an interpreter's script lies inside a string literal, as data.
// A call there is text the script prints, not a call it makes (Codex review of
// 3.1.0..e0ef6d4, F3: `print("run: os.system('git push')")` ran nothing). A literal
// that INTERPOLATES is code again inside its hole: `${…}` in a JS template or a perl
// "…"/qq, `@{[…]}` in perl, `{…}` in a python f-string (Codex round 2, F2: each ran the
// call it held and read as data). Python's triple quotes and perl's nested bracket
// delimiters (`q{a {b} …}`) are followed. Not a parser: a quote inside a comment can
// flip it, which only ever turns a refusal into advice (§16).
const PERL_QUOTE = /^(qq?)\s*([^\w\s])/

const CLOSER = { '{': '}', '(': ')', '[': ']', '<': '>' }

function literalAt(script, i, language) {
  const c = script[i]
  if (language === 'perl' && c === 'q' && !/[\w$@%]/.test(script[i - 1] ?? '')) {
    const quote = PERL_QUOTE.exec(script.slice(i, i + 8))
    if (!quote) return null
    const opener = quote[2]
    return { length: quote[0].length, close: CLOSER[opener] ?? opener, nest: CLOSER[opener] ? opener : null,
      escapes: true, holes: quote[1] === 'qq' ? ['${', '@{'] : [] }
  }
  if (c !== '"' && c !== "'" && c !== '`') return null
  if (language === 'python') {
    const prefix = /[A-Za-z]{0,2}$/.exec(script.slice(Math.max(0, i - 2), i))[0].toLowerCase()
    const triple = script.startsWith(c.repeat(3), i)
    return { length: triple ? 3 : 1, close: triple ? c.repeat(3) : c, nest: null,
      escapes: !prefix.includes('r'), holes: prefix.includes('f') ? ['{'] : [], fstring: prefix.includes('f') }
  }
  if (language === 'perl') {
    if (c === '`') return null
    return { length: 1, close: c, nest: null, escapes: true, holes: c === '"' ? ['${', '@{'] : [] }
  }
  return { length: 1, close: c, nest: null, escapes: true, holes: c === '`' ? ['${'] : [] }
}

// One scan per script, asked in order of position (the one caller sorts). Asked from the
// start for every call, a long script was quadratic: 4,000 calls in 125 KB took 6.4s
// where 3.1.0 took 42ms (BACKLOG §315).
function literalScanner(script, language) {
  const state = { stack: [], i: 0 }
  return at => insideLiteral(script, at, language, state)
}

function insideLiteral(script, at, language, state = { stack: [], i: 0 }) {
  // Open literals, and inside them the interpolation holes that are code again. `state`
  // resumes where the last query stopped, so the scan is not repeated.
  const stack = state.stack
  let i = state.i
  for (; i < at; i++) {
    const top = stack[stack.length - 1]
    const c = script[i]
    if (top?.close) {
      if (c === '\\' && top.escapes) { i++; continue }
      if (top.fstring && script.startsWith('{{', i)) { i++; continue }
      const hole = top.holes.find(opening => script.startsWith(opening, i))
      if (hole) { stack.push({ depth: 0 }); i += hole.length - 1; continue }
      if (top.nest && c === top.nest) { top.depth = (top.depth ?? 0) + 1; continue }
      if (script.startsWith(top.close, i)) {
        if (top.depth) { top.depth--; continue }
        stack.pop()
        i += top.close.length - 1
      }
      continue
    }
    if (top && c === '{') { top.depth++; continue }
    if (top && c === '}') { if (top.depth) top.depth--; else stack.pop(); continue }
    const literal = literalAt(script, i, language)
    if (literal) { stack.push(literal); i += literal.length - 1 }
  }
  state.i = i
  return Boolean(stack[stack.length - 1]?.close)
}

// Deep enough for `bash -c "sudo sh -c 'eval …'"`, bounded so a crafted command
// cannot make a hook recurse without end.
const WALK_DEPTH = 5

// A program's name as the shell looks it up: the last path component, without `.exe`,
// and without cmd's echo-off `@` (`@git push`).
export const programName = word => String(word).split(/[\\/]/).pop().replace(/\.exe$/i, '').replace(/^@/, '')

// git in any case, or through a `.cmd` shim. macOS and Windows look a program up
// case-insensitively: `GIT --version` ran git 2.55.0 on macOS (2026-09-27), and
// `GIT push`, `Git commit -m x`, `Git.Exe push` and `git.cmd push` published under a
// stand-in on Windows 11 (a chaos round of 916b515), where git 2.49 has no hook to
// arm. On a case-sensitive host they run nothing and are refused: the conservative way.
// Only git: a builtin (`exit`, `eval`, `set`) is looked up case-sensitively.
const isGit = name => /^git(?:\.cmd)?$/i.test(name)

const isFlag = word => typeof word === 'string' && word.startsWith('-')

// ADR-090 T3: a wrapper written as an absolute path (`/usr/bin/env`, `C:/tools/env.exe`)
// is that wrapper. A relative path (`./env`) is a program of the user's own, and stays one.
const WRAPPERS = new Set(['exec', 'nohup', 'doas', 'command', 'time', 'nice', 'sudo', 'timeout', 'xargs', 'env'])

export const ABSOLUTE = /^(?:[\\/]|[A-Za-z]:[\\/])/

const wrapperWord = word => (ABSOLUTE.test(word) && WRAPPERS.has(programName(word)) ? programName(word) : word)

// Where a command's program starts, past control keywords and the wrappers that run
// their arguments (`exec`, `env`, `sudo`, `time`, `nice`, `doas`, `timeout N`,
// `xargs`), each with the options that take a value. `{ text }` when the wrapper
// runs a STRING instead (`env -S "git push"`).
function programIndex(argv) {
  let k = 0
  while (k < argv.length) {
    const word = wrapperWord(argv[k])
    // cmd's `if [/i] [not] <condition> <command>` runs its command: the condition is
    // `errorlevel N`, `exist P`, `defined V`, `cmdextversion N`, `a==b`, or `a <op> b`
    // (a Windows chaos round of 9cc9a35: `cmd /c if 1==1 git push` pushed under cmd,
    // pwsh and PowerShell 5.1). A POSIX `if` is followed by a command, which matches
    // none of these shapes and is left where it is.
    if (/^if$/i.test(word)) {
      k += 1
      while (/^(?:\/i|not)$/i.test(argv[k] ?? '')) k += 1
      if (/^(?:errorlevel|exist|defined|cmdextversion)$/i.test(argv[k] ?? '')) k += 2
      else if ((argv[k] ?? '').includes('==') && !(argv[k] ?? '').startsWith('-')) k += 1
      else if (/^(?:==|equ|neq|lss|leq|gtr|geq)$/i.test(argv[k + 1] ?? '')) k += 3
    }
    // cmd's `call` runs its arguments (a Windows chaos round of 626934a: `cmd //c call
    // git push` pushed). No POSIX shell has a `call`, so reading it everywhere costs nothing.
    else if (KEYWORDS.has(word) || word === 'exec' || word === 'nohup' || word === 'doas' || /^call$/i.test(word)) k += 1
    else if (word === 'command' || word === 'time') k += argv[k + 1] === '-p' ? 2 : 1
    else if (word === 'nice') k += argv[k + 1] === '-n' ? 3 : /^-n?\d+$/.test(argv[k + 1] ?? '') ? 2 : 1
    else if (word === 'sudo') {
      k += 1
      while (isFlag(argv[k])) k += /^-[ugCDprtTU]$/.test(argv[k]) ? 2 : 1
    } else if (word === 'timeout') {
      k += 1
      while (isFlag(argv[k])) k += /^-[ks]$/.test(argv[k]) ? 2 : 1
      k += 1 // the duration
    } else if (word === 'xargs') {
      k += 1
      while (isFlag(argv[k])) k += /^-[nLPsdIEJR]$/.test(argv[k]) ? 2 : 1
    } else if (word === 'env') {
      k += 1
      while (k < argv.length) {
        if (argv[k] === '-S' || argv[k] === '--split-string') return { text: argv[k + 1] ?? '' }
        if (/^-[uC]$/.test(argv[k])) k += 2
        else if (isFlag(argv[k]) || /^[A-Za-z_]\w*=/.test(argv[k])) k += 1
        else break
      }
    } else if (k > 0 && /^[A-Za-z_]\w*=/.test(word)) k += 1
    else break
  }
  return k
}

// git's global options that take the NEXT word as their value when written without
// `=`. Measured 2026-09-27 on git 2.55.0 (`git <option> <value> rev-parse` answers);
// `--list-cmds` and `--super-prefix` refused a separate value there, and every other
// global is a flag. It was "any option takes the next word unless that word is the
// verb", which read `git --no-pager stash push` as a push and hid `git --no-pager
// submodule foreach 'git push'`.
const GIT_VALUED = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--attr-source'])

// Globals that print and exit before any verb runs (measured the same day: each left
// the commit count unchanged, and GIT_TRACE showed `git version` or `git help`).
const GIT_EXITS = new Set(['--exec-path', '--html-path', '--man-path', '--info-path', '--version', '-v', '--help', '-h'])

// The index of git's subcommand after `argv[at]` and git's own options, or
// `argv.length` when an option ends git before it reaches one.
function gitVerbIndex(argv, at) {
  let k = at + 1
  while (k < argv.length && argv[k].startsWith('-')) {
    if (GIT_EXITS.has(argv[k])) return argv.length
    k += GIT_VALUED.has(argv[k]) ? 2 : 1
  }
  return k
}

// Options of commit and push that take the NEXT word as their value, from `git commit
// -h` and `git push -h` on git 2.55.0 (2026-09-27): after one, `--dry-run` is a
// message or a push option, not a flag (Codex review of the 626934a batch: `git commit
// -m --dry-run` commits with that message). A short cluster ends in the valued letter.
const VERB_VALUED = {
  commit: /^(?:-[A-Za-z]*[mFCctU]|--(?:no-)?(?:file|author|date|message|reedit-message|reuse-message|squash|fixup|trailer|template|cleanup|unified|inter-hunk-context|pathspec-from-file))$/,
  push: /^(?:-o|--(?:no-)?(?:repo|receive-pack|exec|push-option|recurse-submodules))$/,
}

// Whether a commit or push is a dry run: `--dry-run` (or push's `-n`) standing as a
// flag, before `--`, and not turned off again by `--no-dry-run` after it.
function dryRun(verb, rest) {
  let dry = false
  for (let k = 0; k < rest.length; k++) {
    const word = rest[k]
    if (word === '--') break
    if (VERB_VALUED[verb].test(word)) k += 1
    else if (word === '--dry-run' || (verb === 'push' && word === '-n')) dry = true
    else if (word === '--no-dry-run') dry = false
  }
  return dry
}

// Aliases set on git's own command line with `-c alias.<name>=<value>`, keyed by name,
// which git reads case-insensitively (a chaos round of 916b515: `git -c alias.p=push p`
// pushes, and `git -c 'alias.x=!git push' x` runs its value as a shell line).
function gitAliases(argv, at, k) {
  const aliases = new Map()
  for (let i = at + 1; i < k; i++) {
    const value = argv[i] === '-c' ? argv[i + 1] : /^-c./.test(argv[i] ?? '') ? argv[i].slice(2) : null
    const alias = typeof value === 'string' ? /^alias\.([^=]+)=(.*)$/is.exec(value) : null
    if (alias) aliases.set(alias[1].toLowerCase(), alias[2])
  }
  return aliases
}

// git's BUILTIN commands on 2.55.0 (`git --list-cmds=builtins`, measured 2026-09-28). An
// alias of a builtin is ignored: `alias.version=status version` printed the version, and
// `--exec-path=/nonexistent -c alias.status=version status` still ran status. An
// EXTERNAL command is not in this list, because its alias wins when the program is
// missing (`--exec-path=/nonexistent -c alias.mergetool=version mergetool` printed the
// version; Codex round 2, F3), so its alias is read. A builtin added after 2.55 is
// missing here, so its alias reads as applying: a refusal of a command git would not
// run, the conservative way (Codex review of 3.1.0..e0ef6d4, F4).
const GIT_COMMANDS = new Set(`
  add am annotate apply archive backfill bisect blame branch bugreport bundle cat-file check-attr check-ignore
  check-mailmap check-ref-format checkout checkout--worker checkout-index cherry cherry-pick clean clone column
  commit commit-graph commit-tree config count-objects credential credential-cache credential-cache--daemon
  credential-store describe diagnose diff diff-files diff-index diff-pairs diff-tree difftool fast-export
  fast-import fetch fetch-pack fmt-merge-msg for-each-ref for-each-repo format-patch format-rev fsck
  fsck-objects fsmonitor--daemon gc get-tar-commit-id grep hash-object help history hook index-pack init
  init-db interpret-trailers last-modified log ls-files ls-remote ls-tree mailinfo mailsplit maintenance merge
  merge-base merge-file merge-index merge-ours merge-recursive merge-recursive-ours merge-recursive-theirs
  merge-subtree merge-tree mktag mktree multi-pack-index mv name-rev notes pack-objects pack-redundant
  pack-refs patch-id pickaxe prune prune-packed pull push range-diff read-tree rebase receive-pack reflog refs
  remote remote-ext remote-fd repack replace replay repo rerere reset restore rev-list rev-parse revert rm
  send-pack shortlog show show-branch show-index show-ref sparse-checkout stage stash status stripspace
  submodule--helper switch symbolic-ref tag unpack-file unpack-objects update-index update-ref
  update-server-info upload-archive upload-archive--writer upload-pack url-parse var verify-commit verify-pack
  verify-tag version whatchanged worktree write-tree`.trim().split(/\s+/))

// An alias value split as git splits it (split_cmdline): on whitespace, with quotes and
// backslashes, and no shell operators. `alias.x=push;true` names the one command
// `push;true`, which git refuses, and a value that starts with a space names the empty
// command (both measured on 2.55.0: "is not a git command"; Codex round 2, F1). An
// unclosed quote is refused by git too.
function gitSplit(value) {
  if (/^\s/.test(value)) return ['']
  const words = []
  let word = null
  let quote = null
  for (let i = 0; i < value.length; i++) {
    const c = value[i]
    if (quote) {
      if (c === quote) quote = null
      else if (c === '\\' && quote === '"' && i + 1 < value.length) word += value[++i]
      else word += c
    } else if (/\s/.test(c)) {
      if (word !== null) words.push(word)
      word = null
    } else {
      word ??= ''
      if (c === '"' || c === "'") quote = c
      else if (c === '\\' && i + 1 < value.length) word += value[++i]
      else word += c
    }
  }
  if (quote) return ['']
  if (word !== null) words.push(word)
  return words
}

// The alias git would run for the word at k, or undefined when git runs its own command.
function aliasFor(argv, at, k) {
  const name = String(argv[k] ?? '')
  return GIT_COMMANDS.has(name) ? undefined : gitAliases(argv, at, k).get(name.toLowerCase())
}

// A word as shell data: what `"$@"` hands a `!` alias is arguments, never source.
const shellQuote = word => `'${String(word).replace(/'/g, `'\\''`)}'`

// `git <options> commit|push` from `argv[at]`, or null. `--help` or `-h` straight after
// the verb opens a manual page. A help flag anywhere later does not (Codex, bbade17).
function gitInvocation(argv, at, dynamic) {
  const k = gitVerbIndex(argv, at)
  const alias = aliasFor(argv, at, k)
  // An alias is split as git splits it, and its own words come BEFORE the command
  // line's: `alias.c=commit -m` makes `c --dry-run` a commit whose message is
  // `--dry-run`, and `alias.p=push --dry-run` makes `p` a dry run (Codex review of
  // 3.1.0..e0ef6d4, F2). A `!` alias is a shell line, which gitRunsCommands reads.
  const expanded = alias !== undefined && !alias.startsWith('!') ? gitSplit(alias) : null
  const verb = expanded ? expanded[0] : argv[k]
  const rest = expanded ? [...expanded.slice(1), ...argv.slice(k + 1)] : argv.slice(k + 1)
  if ((verb !== 'commit' && verb !== 'push') || dynamic.includes(k)) return null
  if (rest[0] === '--help' || rest[0] === '-h') return null
  // A dry run publishes nothing (a chaos round of 626934a, R6). `commit -n` is
  // `--no-verify`, not a dry run, and stays a publish.
  if (dryRun(verb, rest)) return null
  return argv.slice(at, k + 1).join(' ')
}

// The shell commands a git subcommand runs itself: `submodule foreach <cmd>`,
// `rebase --exec <cmd>` / `-x <cmd>`, `bisect run <cmd>` (a chaos round of 626934a,
// R17: `git submodule foreach 'git push'` pushes in every submodule).
function gitRunsCommands(argv, at) {
  const k = gitVerbIndex(argv, at)
  const rest = argv.slice(k + 1)
  const alias = aliasFor(argv, at, k)
  // Git runs a `!` alias as `<body> "$@"`: the command line's words are data appended
  // to it, so `x 'ok; git push'` is one argument to `echo` (Codex review, F5).
  if (alias?.startsWith('!')) return [`${alias.slice(1)} ${rest.map(shellQuote).join(' ')}`.trim()]
  if (argv[k] === 'submodule') {
    const each = rest.indexOf('foreach')
    if (each < 0) return []
    let c = each + 1
    while (c < rest.length && /^(?:--recursive|-q|--quiet)$/.test(rest[c])) c++
    return c < rest.length ? [rest.slice(c).join(' ')] : []
  }
  if (argv[k] === 'rebase') {
    const run = []
    rest.forEach((word, i) => {
      if ((word === '--exec' || word === '-x') && i + 1 < rest.length) run.push(rest[i + 1])
      else if (word.startsWith('--exec=')) run.push(word.slice('--exec='.length))
    })
    return run
  }
  if (argv[k] === 'bisect' && rest[0] === 'run') return rest.length > 1 ? [rest.slice(1).join(' ')] : []
  return []
}

// `xargs` builds git's argv from its stdin: `echo push | xargs git`, and with `-I R`
// each input line replaces R (`xargs -I{} git {} <<< push`). Where that stdin is
// literal text, the argv is known (a chaos round of 626934a, H6 and H17). Read only
// where it is modelled: a here-string, a heredoc or an `echo` upstream, and the
// options below. An end-of-file marker (`-E`), a NUL or other delimiter, an argument
// file, or a `printf` upstream built an invocation the shell never ran (Codex review
// of the 626934a batch), so those are left to the advisory arm.
const XARGS_MODELLED = /^(?:-I.*|-i|--replace(?:=.*)?|-r|--no-run-if-empty|-t|--verbose)$/

function xargsInvocations(commands, n, start, tree) {
  const { argv, heredocs } = commands[n]
  const x = argv.findIndex((word, k) => k < start && programName(word) === 'xargs')
  if (x < 0) return []
  let replace = null
  for (let k = x + 1; k < start; k++) {
    if (!XARGS_MODELLED.test(argv[k])) {
      if (argv[k - 1] === '-I' || argv[k - 1] === '--replace') continue
      return []
    }
    if (argv[k] === '-I' || argv[k] === '--replace') replace = argv[k + 1] ?? null
    else if (argv[k].startsWith('--replace=')) replace = argv[k].slice('--replace='.length)
    else if (argv[k].startsWith('-I') && argv[k].length > 2) replace = argv[k].slice(2)
    else if (argv[k] === '-i') replace = '{}'
  }
  const texts = heredocs.map(doc => doc.body)
  // ADR-120 T2: a group that renders (every command a supported printer or a silent builtin, joined by `;`, `&&` or `||` over known
  // statuses) feeds xargs the bytes it prints, in order, not its last command's. One that does not gives it nothing: the words the
  // xargs line names itself are read, and the rest is could-not-look.
  const fed = groupFeeding(commands, n, tree)
  if (typeof fed.bytes === 'string') texts.push(fed.bytes)
  let loose = false
  for (const m of feederIndexes(commands, n, fed)) {
    const upstream = commands[m]
    const from = programIndex(upstream.argv)
    if (typeof from !== 'number' || upstream.dynamic.includes(from) || programName(upstream.argv[from] ?? '') !== 'echo') return []
    // An option or a backslash is where the shells differ: the text is read as written, and where xargs cannot split it the
    // whitespace reading stands (`echo 'push \c"' | xargs git` runs `git push` under dash).
    if (echoBytes(upstream.argv.slice(from + 1)) === null) loose = true
    texts.push(...literalOutput(upstream.argv, from))
  }
  const input = texts.join('\n')
  const tail = argv.slice(start)
  if (replace) {
    const built = []
    for (const line of input.split('\n')) {
      if (!line.trim()) continue
      built.push(tail.map(word => word.split(replace).join(line.trim())))
    }
    return built
  }
  const words = xargsWords(input) ?? (loose ? input.split(/\s+/).filter(Boolean) : null)
  return words === null ? [] : [[...tail, ...words]]
}

// What xargs makes of its stdin, measured on /bin/sh and /bin/dash with a stub for git (2026-10-21): blanks and newlines separate
// words; a quote groups what follows up to its mate (a newline or the end of the input inside one is an "unterminated quote":
// xargs runs nothing, so null); a backslash outside quotes takes the next character literally, a trailing one the newline the
// input ends with; inside quotes a backslash is itself.
function xargsWords(input) {
  const words = []
  let word = null
  let quote = ''
  for (let k = 0; k < input.length; k++) {
    const ch = input[k]
    if (quote) {
      if (ch === quote) quote = ''
      else if (ch === '\n') return null
      else word += ch
    } else if (ch === "'" || ch === '"') {
      quote = ch
      word ??= ''
    } else if (ch === '\\') word = `${word ?? ''}${input[++k] ?? '\n'}`
    else if (/\s/.test(ch)) {
      if (word !== null) words.push(word)
      word = null
    } else word = `${word ?? ''}${ch}`
  }
  if (quote) return null
  if (word !== null) words.push(word)
  return words
}

const NON_EXECUTORS = new Set(['echo', 'printf'])

// Whether a shell given these words (its name first) runs a string or its stdin at
// all (BACKLOG §298). Measured 2026-09-26 on bash, sh, zsh, dash, ksh, csh and tcsh:
// `-n`, alone or in a cluster (`-xn`, `-nc`), and `-o noexec` parse without
// executing; a later `+n` or `+o noexec` turns execution back on; `--help` and
// `--version` print and exit. PowerShell's options are words and none was measured.
// The options that take the next word as their value. A value is never read as an
// option: `bash --rcfile "-n" -c "git push"` runs the push (Codex review of 341c49c).
const SHELL_VALUED = /^(?:[+-]o|[+-]O|--rcfile|--init-file)$/

const POWERSHELL_VALUED = /^-[A-Z]\w+$/

function shellRuns(words) {
  if (POWERSHELL.has(programName(words[0]).toLowerCase())) return true
  let runs = true
  for (let i = 1; i < words.length; i++) {
    const word = words[i]
    if (SHELL_VALUED.test(word)) {
      if (word.endsWith('o') && words[i + 1] === 'noexec') runs = word.startsWith('+')
      i++
    } else if (word === '--help' || word === '--version') return false
    else if (/^-[A-Za-z]+$/.test(word) && word.includes('n')) runs = false
    else if (/^\+[A-Za-z]+$/.test(word) && word.includes('n')) runs = true
  }
  return runs
}

// A shell named at `argv[at]`: the index of its `-c` / `-Command` flag, the index where
// its options end when it reads a script from stdin (`{ stdin }`), or null when it
// runs a script file. A POSIX `-c` may sit anywhere in a cluster (`-lc`, `-cx`); the
// string is still the next word. PowerShell's `-EncodedCommand` (`-e`, `-ec`, and its
// prefixes) carries the script as base64 UTF-16LE (`{ flag, encoded: true }`); a
// Windows chaos round of 626934a measured it pushing while nothing here saw it.
// `-name` spelled as a prefix of a PowerShell parameter, as PowerShell accepts it.
const abbreviates = (word, full, shortest = 1) =>
  /^-[A-Za-z]+$/.test(word) && word.length - 1 >= shortest && full.startsWith(word.slice(1).toLowerCase())

const POWERSHELL_ENCODED = word => word.toLowerCase() === '-ec' || abbreviates(word, 'encodedcommand')

function shellString(argv, at) {
  const power = POWERSHELL.has(programName(argv[at]).toLowerCase())
  let k = at + 1
  while (k < argv.length) {
    const word = argv[k]
    if (power && POWERSHELL_ENCODED(word)) return { flag: k, encoded: true }
    if (power ? /^-c(?:o(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?)?$/i.test(word) : /^-[A-Za-z]*c[A-Za-z]*$/.test(word)) return { flag: k }
    if (word === '-' || word === '-s') { k += 1; continue }
    if (!/^[+-]{1,2}[A-Za-z][\w-]*(?:=.*)?$/.test(word)) return null
    const value = argv[k + 1]
    k += value !== undefined && !word.includes('=') && !/^[+-]/.test(value) && (SHELL_VALUED.test(word) || (power && POWERSHELL_VALUED.test(word))) ? 2 : 1
  }
  return { stdin: k }
}

// The script an `-EncodedCommand` value carries. A value that is not base64 of
// UTF-16LE decodes to text that names no publish, so a wrong guess costs nothing.
export const decodedPowerShell = value => Buffer.from(String(value), 'base64').toString('utf16le')

// The command line `start` (cmd), `Start-Process` or `saps` (PowerShell) launches, as
// words: cmd's `/x` options (`/d` takes a path) and a quoted title are skipped;
// PowerShell's `-FilePath` and `-ArgumentList` are read by name or position, and a list
// value (`push,origin`) is split. Unmeasured beyond `Start-Process git -ArgumentList
// push` (a Windows chaos round of 626934a); a wrong reading yields words that name no
// publish unless git and its verb are there.
const START_SWITCHES = /^-(?:wait|nonewwindow|passthru|usenewenvironment|loaduserprofile|lup|whatif|confirm)$/i

function startedCommand(command, start) {
  const { argv, quoted } = command
  let file = null
  let list = null
  const bare = []
  for (let k = start + 1; k < argv.length; k++) {
    const word = argv[k]
    if (/^\/d$/i.test(word)) k += 1
    else if (/^\/\w+$/.test(word)) continue
    else if (abbreviates(word, 'filepath') || /^-(?:ps)?path$/i.test(word)) file = argv[++k]
    else if (abbreviates(word, 'argumentlist') || /^-args$/i.test(word)) list = argv[++k]
    else if (START_SWITCHES.test(word)) continue
    else if (/^-[A-Za-z]/.test(word) && file !== null) k += 1
    else if (file === null && bare.length === 0 && (quoted[k] || word === '') && argv[k + 1] !== undefined && !/^-/.test(argv[k + 1])) continue
    else bare.push(word)
  }
  if (file === null) file = bare.shift() ?? null
  if (list === null && bare.length) list = bare.join(' ')
  if (file === null) return null
  return [file, ...(list ?? '').split(/[\s,]+/).filter(Boolean)].join(' ')
}

// What a program writes to stdout when that is decidable from its words: `echo`
// without its options, `printf`'s format and each argument. `cat` and `tee` pass
// their stdin through, so the search goes on upstream of them.
const PASS_THROUGH = new Set(['cat', 'tee'])

function literalOutput(argv, start) {
  const name = programName(argv[start] ?? '')
  const words = argv.slice(start + 1)
  if (name === 'echo') {
    let k = 0
    while (k < words.length && /^-[neE]+$/.test(words[k])) k++
    return [words.slice(k).join(' ')]
  }
  if (name === 'printf') return [...words, words.join(' ')]
  return []
}

// ADR-120 T2 (Decision 2): what a group or subshell of several commands writes to its stdout, read from the tree. Only a supported
// printer (`echo`, `printf`) contributes bytes and `:`, `true` and `false` contribute none; `;`, `&&` and `||` are evaluated left to
// right over statuses known from those (a printer and `:` and `true` 0, `false` 1). A `&`, a pipeline of several stages, a negation,
// another program, a substitution, a dynamic word, an option or escape the shells disagree on, a definition, or a redirection
// outside the two read below makes it null, which is could-not-look and never the empty string.

// Whether a printer's stdout still reaches the pipe, given its redirections: true, false (it goes to stderr or a file), or null
// when they are not the one `2>&1` or the one `>&2` / `>file` read here. Measured on /bin/sh and /bin/dash (2026-10-21).
function stdoutStays(redirections) {
  if (redirections.length === 0) return true
  if (redirections.length > 1 || redirections[0].dynamic) return null
  const { fd, op, target } = redirections[0]
  if (fd === '2' && op === '>&' && target === '1') return true
  if (fd !== '' && fd !== '1') return null
  return (op === '>&' && target === '2') || op === '>' || op === '>>' || op === '>|' ? false : null
}

// The bytes `echo` writes: its words joined by a space and a newline. An option (`-n`, `-e`, `-E`) or a backslash is where
// the shells differ, so it is not read.
const echoBytes = words => (words.some(word => /^-[neE]+$/.test(word) || word.includes('\\')) ? null : `${words.join(' ')}\n`)

// The bytes `printf` writes for a literal format whose only conversion is `%s` and whose only escapes are `\n` and `\t`: the
// format over its arguments, repeated while arguments remain, a missing one empty; a format with no conversion is written once.
function printfBytes([format, ...args]) {
  if (format === undefined || format.startsWith('-')) return null
  const pieces = []
  for (let k = 0; k < format.length; k++) {
    if (format[k] === '%') {
      if (format[++k] !== 's') return null
      pieces.push(null)
    } else if (format[k] === '\\') {
      const escaped = { n: '\n', t: '\t' }[format[++k]]
      if (escaped === undefined) return null
      pieces.push(escaped)
    } else pieces.push(format[k])
  }
  const per = pieces.filter(piece => piece === null).length
  let out = ''
  for (let round = 0, next = 0; round < Math.max(1, per ? Math.ceil(args.length / per) : 1); round++) {
    for (const piece of pieces) out += piece === null ? (args[next++] ?? '') : piece
  }
  return out
}

// A name the text defines EARLIER, in a shell the group runs in, is that function and not the builtin, so what it writes is not
// known. Measured on /bin/sh and /bin/dash with a stub for git (2026-10-21): `echo() { :; }; { echo 'git push'; } | sh` runs nothing,
// as does `{ echo() { :; }; }; …`, while a definition after the pipeline, inside a subshell or in an earlier pipeline stage leaves
// the builtin: those run in another shell, or later.
const containsNode = (node, target) => node === target || node.kids.some(kid => containsNode(kid, target))

function collectDefinitions(node, names) {
  if (node.t === 'def') names.add(node.name)
  else if (node.t === 'pipe') { if (node.kids.length === 1) collectDefinitions(node.kids[0], names) }
  else if (node.t !== 'cmd' && node.t !== 'sub') for (const kid of node.kids) collectDefinitions(kid, names)
}

function definitionsBefore(tree, target) {
  const names = new Set()
  const walk = node => {
    if (node === target || node.t === 'cmd' || node.t === 'def') return
    if (node.t === 'pipe') {
      const stage = node.kids.find(kid => containsNode(kid, target))
      if (stage) walk(stage)
      return
    }
    for (const kid of node.kids) {
      if (containsNode(kid, target)) return walk(kid)
      collectDefinitions(kid, names)
    }
  }
  walk(tree)
  return names
}

function printerBytes({ argv, dynamic, substitutions, redirections }, defined) {
  if (dynamic.length || substitutions.length || defined.has(argv[0])) return null
  const stays = stdoutStays(redirections)
  const bytes = argv[0] === 'echo' ? echoBytes(argv.slice(1)) : argv[0] === 'printf' ? printfBytes(argv.slice(1)) : null
  return bytes === null || stays === null ? null : stays ? bytes : ''
}

// `:`, `true` and `false` write nothing and have a status; with an argument, a redirection or a word the shell expands they are
// not read.
const SILENT_STATUS = new Map([[':', 0], ['true', 0], ['false', 1]])

// Whether errexit is in effect where `target` runs (the Codex review of 7a9107e8..dcc4693a): a group that is a pipeline stage runs in a
// subshell that inherits `set -e` from the shell around it, and exits at the first command that fails. Measured on /bin/sh and
// /bin/dash with a stub for git, under `env -i` (2026-10-21): `set -e; { false; echo 'git push'; } | sh` runs no push; with `set +e`
// before the group, `false || true`, or the failure after the print, it pushes. A set in an earlier pipeline stage, in a subshell or
// in a pipeline of several stages leaves this shell alone (`set -e | cat; …` pushes). The state is false inside a pipeline the shell
// ignores errexit for (left of `&&` or `||`, or negated).
//
// Two more answers (the same review, round 2). The state is UNKNOWN (null) after an earlier statement that may change it unseen: a
// `set` this does not read (it expands, redirects, has an option this does not know, or sits where it may not run: an and-or list, a
// background), `eval`, `.`, `source`, `command`, `builtin`, a call to a function defined earlier, a command word the shell expands.
// And under errexit known on, an earlier statement in a shell the group inherits whose status is known non-zero where errexit acts
// ends the shell before the group runs: `set -e; false; { echo 'git push'; } | sh` and `set -e; { false; }; …` run no push, while
// `false || true`, `false && true`, `false &` and `false | cat` do not end it. An earlier status this does not know ends nothing.
const SET_LETTERS = 'abCefmuvx'
const SET_NAMES = new Set(['errexit', 'pipefail', 'nounset', 'noclobber', 'xtrace', 'verbose', 'allexport', 'noglob'])
const MAY_SET_UNSEEN = new Set(['eval', '.', 'source', 'command', 'builtin'])

// The errexit state each `-e`, `+e`, `-o errexit` and `+o errexit` of a `set` leaves, left to right, or null.
function errexitEvents(args) {
  const events = []
  for (let i = 0; i < args.length; i++) {
    const word = args[i]
    if (word === '--' || !/^[-+]/.test(word)) break
    if (word.length === 1) return null
    const on = word[0] === '-'
    for (let at = 1; at < word.length; at++) {
      const letter = word[at]
      if (letter === 'o') {
        const name = args[++i]
        if (at !== word.length - 1 || !SET_NAMES.has(name)) return null
        if (name === 'errexit') events.push(on)
      } else if (!SET_LETTERS.includes(letter)) return null
      else if (letter === 'e') events.push(on)
    }
  }
  return events
}

// Appends the errexit states the commands of this node leave in its own shell, in order: true for on, false for off, null for unknown.
function collectSets(node, commands, defined, events) {
  if (node.t === 'cmd') {
    const { argv, dynamic, substitutions, redirections } = commands[node.i]
    if (argv[0] === 'set') {
      const found = dynamic.length || substitutions.length || redirections.length ? null : errexitEvents(argv.slice(1))
      events.push(...(found ?? [null]))
    } else if (MAY_SET_UNSEEN.has(argv[0]) || defined.has(argv[0]) || dynamic.includes(0)) events.push(null)
    return
  }
  if (node.t === 'def' || node.t === 'sub') return
  if (node.t === 'pipe') {
    if (node.kids.length === 1) collectSets(node.kids[0], commands, defined, events)
    return
  }
  const conditional = (inner, runs) => { if (inner.length) events.push(...(runs ? inner : [null])) }
  for (let k = 0; k < node.kids.length; k++) {
    const inner = []
    collectSets(node.kids[k], commands, defined, inner)
    conditional(inner, node.t === 'list' ? node.ops[k] === ';' : node.t !== 'andor' || node.kids.length === 1)
  }
}

// `{ ended, on }`: whether an earlier statement ended the shell before `target` runs, and whether errexit is in effect where it runs
// (true, false, or null for unknown).
function errexitAt(tree, target, commands, defined) {
  let state = false
  let ignored = false
  let ended = false
  const walk = node => {
    if (node === target || node.t === 'cmd' || node.t === 'def') return
    if (node.t === 'pipe') {
      if (node.bang) ignored = true
      const stage = node.kids.find(kid => containsNode(kid, target))
      if (stage) walk(stage)
      return
    }
    for (let k = 0; k < node.kids.length; k++) {
      const kid = node.kids[k]
      if (containsNode(kid, target)) {
        if (node.t === 'andor' && k < node.kids.length - 1) ignored = true
        return walk(kid)
      }
      const inner = []
      collectSets(kid, commands, defined, inner)
      if (inner.length) {
        for (const event of node.t === 'list' && node.ops[k] === ';' ? inner : [null]) state = event
      } else if (node.t === 'list' && node.ops[k] === ';' && state === true && !ignored && !ended) {
        ended = andorResult(kid, commands, defined, true)?.exited === true
      }
    }
  }
  walk(tree)
  return { ended, on: ignored ? false : state }
}

// What a group writes under errexit `on`; with it unknown (null), what it writes either way, or null when the two differ.
function listUnderErrexit(list, commands, defined, on) {
  if (on !== null) return listResult(list, commands, defined, on)
  const yes = listResult(list, commands, defined, true)
  const no = listResult(list, commands, defined, false)
  return yes !== null && no !== null && yes.bytes === no.bytes ? yes : null
}

// `{ bytes, status, failed, exited }` of one stage, or null. `failed` is whether a non-zero status of this stage is a failure errexit
// acts on: a command's, a subshell's, but not a group's, which ends non-zero when a command in it failed under an operator (`{ false
// && true; }` does not exit). `exited` is a group that ended the shell, a subshell ends only itself.
function stageResult(stage, commands, defined, errexit) {
  if (stage.t === 'group' || stage.t === 'sub') {
    const result = listResult(stage.kids[0], commands, defined, errexit)
    if (result === null) return null
    return stage.t === 'group' ? { ...result, failed: false } : { ...result, failed: true, exited: false }
  }
  if (stage.t !== 'cmd') return null
  const command = commands[stage.i]
  const bytes = printerBytes(command, defined)
  if (bytes !== null) return { bytes, status: 0, failed: true, exited: false }
  const { argv, dynamic, substitutions, redirections } = command
  if (argv.length !== 1 || dynamic.length || substitutions.length || redirections.length || defined.has(argv[0]) || !SILENT_STATUS.has(argv[0])) return null
  return { bytes: '', status: SILENT_STATUS.get(argv[0]), failed: true, exited: false }
}

// An and-or list, left to right: `&&` runs the next pipeline after status 0 and `||` after any other, and a skipped one leaves the
// status as it was. Every pipeline must be read, run or not. Under errexit the shell exits when the last pipeline of the list ran and
// failed; a failure of any other is ignored, and so is every command inside it.
function andorResult(andor, commands, defined, errexit) {
  let bytes = ''
  let status = 0
  let failed = false
  let ranLast = false
  for (let k = 0; k < andor.kids.length; k++) {
    const pipe = andor.kids[k]
    if (pipe.bang || pipe.kids.length !== 1) return null
    const last = k === andor.kids.length - 1
    const result = stageResult(pipe.kids[0], commands, defined, errexit && last)
    if (result === null) return null
    if (k === 0 || (andor.ops[k - 1] === '&&' ? status === 0 : status !== 0)) {
      bytes += result.bytes
      status = result.status
      failed = result.failed
      ranLast = last
      if (result.exited) return { bytes, status, exited: true }
    }
  }
  return { bytes, status, exited: errexit && ranLast && failed && status !== 0 }
}

function listResult(list, commands, defined, errexit) {
  let bytes = ''
  let status = 0
  for (let k = 0; k < list.kids.length; k++) {
    if (list.ops[k] !== ';') return null
    const result = andorResult(list.kids[k], commands, defined, errexit)
    if (result === null) return null
    bytes += result.bytes
    status = result.status
    if (result.exited) return { bytes, status, exited: true }
  }
  return { bytes, status, exited: false }
}

// The stage that feeds command `n` in the pipeline holding it, or null.
function feederOf(node, n) {
  if (node.t === 'pipe') {
    const at = node.kids.findIndex(kid => kid.t === 'cmd' && kid.i === n)
    if (at > 0) return node.kids[at - 1]
  }
  for (const kid of node.kids) {
    const found = feederOf(kid, n)
    if (found) return found
  }
  return null
}

const lastCommand = node => (node.t === 'cmd' ? node.i : lastCommand(node.kids.at(-1)))

// What feeds a shell or xargs from a group or subshell: `{ bytes, tail }` when it renders (printers and silent builtins joined by
// `;`, `&&` or `||`, a subshell with its redirections), with its exact bytes and the index of its last command, which the flat
// upstream scan must not read alone; `{ tail }` when it does not and holds several commands (nothing is proven from it);
// `{ m }` when it is one pipeline, whose last command is read as any other upstream. `{ tail: -1 }` for no group, and with no tree
// (text the grammar does not read) the flat scan stands as it was.
function groupFeeding(commands, n, tree) {
  const stage = tree ? feederOf(tree, n) : null
  if (!stage || (stage.t !== 'group' && stage.t !== 'sub')) return { tail: -1 }
  const tail = lastCommand(stage)
  // `|&` also pipes the group's stderr, which this does not read.
  const defined = definitionsBefore(tree, stage)
  const { ended, on } = errexitAt(tree, stage, commands, defined)
  const rendered = ended ? { bytes: '' } : commands[tail].closes.at(-1)?.joiner === '|&' ? null : listUnderErrexit(stage.kids[0], commands, defined, on)
  if (rendered !== null) return { bytes: rendered.bytes, tail }
  // A function defined earlier may stand for any command in the group, so the flat reading of its last pipeline proves nothing.
  if (defined.size) return { tail }
  let resolved = stage
  while (resolved.t === 'group' || resolved.t === 'sub') {
    const body = resolved.kids[0]
    if (body.kids.length !== 1 || body.kids[0].kids.length !== 1) break
    resolved = body.kids[0].kids[0].kids.at(-1)
  }
  if (resolved.t === 'cmd') return { m: resolved.i, tail: -1 }
  return resolved.t === 'group' || resolved.t === 'sub' ? { tail } : { tail: -1 }
}

// The commands whose own output feeds `n`: those piped to it, and the one a single-pipeline group resolves to.
const feederIndexes = (commands, n, fed) => commands.flatMap((c, m) => ((c.pipeTo === n || m === fed.m) && m !== fed.tail ? [m] : []))

// The text a shell would run from its stdin: its own heredoc or here-string, and
// what the pipeline upstream of it writes, through any `cat` or `tee`. `printf` and
// zsh's `echo` turn `\n` into a line; reading every text that way can only find a
// publish that is there (Codex review of 341c49c: `echo … | cat | bash`). A group's exact bytes are read as they are.
function stdinParts(commands, n, tree, seen) {
  const loose = commands[n].heredocs.map(doc => doc.body)
  const exact = []
  const fed = groupFeeding(commands, n, tree)
  if (typeof fed.bytes === 'string') exact.push(fed.bytes)
  for (const m of feederIndexes(commands, n, fed)) {
    if (seen.has(m)) continue
    seen.add(m)
    // The last command of a group of several commands is not all the group writes: `{ printf %s '#'; echo …; } | sh`
    // runs a comment (the review of c48dd5b0..cfd24edc), so nothing is proven from it. With a tree the group's bytes are read
    // above; this still holds where the grammar did not read the text.
    if (commands.some(c => c.groupEnd === m)) continue
    const upstream = commands[m]
    loose.push(...upstream.heredocs.map(doc => doc.body))
    const start = programIndex(upstream.argv)
    if (typeof start !== 'number' || upstream.dynamic.includes(start)) continue
    if (PASS_THROUGH.has(programName(upstream.argv[start] ?? ''))) {
      const through = stdinParts(commands, m, tree, seen)
      loose.push(...through.loose)
      exact.push(...through.exact)
    }
    loose.push(...literalOutput(upstream.argv, start))
  }
  return { loose, exact }
}

function stdinScripts(commands, n, tree) {
  const { loose, exact } = stdinParts(commands, n, tree, new Set())
  return [...loose.map(text => text.replace(/\\n/g, '\n')), ...exact]
}

function publishInText(text, depth) {
  if (depth > WALK_DEPTH) return null
  const words = shellWords(text)
  const { commands } = words
  const tree = parseShell(words)
  for (let n = 0; n < commands.length; n++) {
    const found = publishInCommand(commands, n, depth, tree)
    if (found) return found
  }
  return null
}

function publishInCommand(commands, n, depth, tree) {
  const { argv, dynamic, substitutions } = commands[n]
  const inner = texts => {
    for (const text of texts) {
      const found = publishInText(text, depth + 1)
      if (found) return found
    }
    return null
  }
  // A command substitution runs as its own command.
  const substituted = inner(substitutions)
  if (substituted) return substituted
  const start = programIndex(argv)
  if (typeof start === 'object') return inner([start.text])
  if (start >= argv.length || dynamic.includes(start)) return null
  const name = programName(argv[start])
  if (isGit(name)) {
    const invoked = gitInvocation(argv, start, dynamic)
    if (invoked) return invoked
    const ran = inner(gitRunsCommands(argv, start))
    if (ran) return ran
    for (const built of xargsInvocations(commands, n, start, tree)) {
      const fromStdin = gitInvocation(built, 0, [])
      if (fromStdin) return fromStdin
    }
  }
  // `eval` joins its arguments and runs them (a chaos round, 2.111.0-rc, php-react-app F1);
  // so does PowerShell's `Invoke-Expression` / `iex` (a Windows chaos round of 626934a:
  // `powershell -c "iex 'git push'"` pushed). No POSIX shell has either PowerShell name.
  if (name === 'eval') return inner([argv.slice(start + 1).join(' ')])
  if (/^(?:iex|invoke-expression)$/i.test(name)) return inner([argv.slice(start + 1).filter(word => !/^-c(?:o(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?)?$/i.test(word)).join(' ')])
  if (/^(?:start|saps|start-process)$/i.test(name)) {
    const started = startedCommand(commands[n], start)
    if (started) return inner([started])
  }
  // Windows runners, measured reaching git on a Windows 11 host (2.111.0-rc chaos):
  // `cmd /c` (`//c` from Git Bash) and `wsl`, with their options. cmd's caret escapes
  // the next character (`g^it push` runs git: a Windows chaos round of 626934a); every
  // caret is read as one, which can only reveal a publish that is spelled there.
  if (/^cmd$/i.test(name)) {
    let k = start + 1
    while (/^\/\/?(?:[qQdDaAuUsS]|[eEfFvV]:\w+)$/.test(argv[k] ?? '')) k += 1
    if (/^\/\/?[cCkK]$/.test(argv[k] ?? '')) return inner([argv.slice(k + 1).join(' ').replace(/\^(.)/gs, '$1')])
  }
  if (/^wsl$/i.test(name)) {
    let k = start + 1
    while (/^(?:-d|-u|--distribution|--user)$/.test(argv[k] ?? '')) k += 2
    if (/^(?:-e|--exec|--)$/.test(argv[k] ?? '')) k += 1
    if (k < argv.length) return inner([argv.slice(k).join(' ')])
  }
  // A shell named anywhere in the argv runs its `-c` string (`docker exec app sh -c`,
  // `sudo -u ci bash -c`) unless its options silence it; one at the program position
  // with no string runs its stdin. `echo` and `printf` run none of their arguments:
  // `echo "bash" "-c" "git push"` prints (Codex review of 341c49c).
  for (let k = start; k < argv.length && !NON_EXECUTORS.has(name); k++) {
    if (dynamic.includes(k) || !SHELL_NAMES.has(programName(argv[k]).toLowerCase())) continue
    const shell = shellString(argv, k)
    if (shell === null) continue
    if (shell.flag !== undefined) {
      if (shellRuns(argv.slice(k, shell.flag + 1)) && shell.flag + 1 < argv.length) {
        const script = argv[shell.flag + 1]
        const found = inner([shell.encoded ? decodedPowerShell(script) : script])
        if (found) return found
      }
      k = shell.flag + 1
    } else if (k === start && shellRuns(argv.slice(k, shell.stdin))) {
      const found = inner(stdinScripts(commands, n, tree))
      if (found) return found
    }
  }
  if (INTERPRETERS.test(name)) {
    for (const word of argv.slice(start + 1)) {
      // A call inside a string literal is data that is printed, not run (F3, above).
      const calls = [...word.matchAll(SUBPROCESS_LIST), ...word.matchAll(CHILD_PROCESS_LIST), ...word.matchAll(PERL_LIST)]
      const strings = [...word.matchAll(SUBPROCESS_STRING)]
      const scan = literalScanner(word, name === 'perl' ? 'perl' : name.startsWith('python') ? 'python' : 'js')
      const literal = new Map([...new Set([...calls, ...strings].map(call => call.index))].sort((a, b) => a - b).map(index => [index, scan(index)]))
      const called = call => !literal.get(call.index)
      for (const call of calls.filter(called)) {
        const list = [...call[1].matchAll(/(["'])([^"']*)\1/g)].map(item => item[2])
        const invoked = isGit(programName(list[0] ?? '')) ? gitInvocation(list, 0, []) : null
        if (invoked) return invoked
      }
      const found = inner(strings.filter(called).map(call => call[2]))
      if (found) return found
    }
  }
  return null
}

/** The `git commit …` or `git push …` this command invokes, in one spelling, or null. */
export function publishCommandIn(command) {
  if (typeof command !== 'string') return null
  return publishInText(command, 0)
}
