// The classifier of what a shell command would publish: which words are a git commit or push, which are only
// mentioned, which run elsewhere, and which commit goes into a repository the command itself made (ADR-061,
// ADR-067, ADR-081, ADR-086, ADR-090, ADR-093). Moved out of lifecycle.mjs unchanged (BACKLOG section 375, stage B1):
// it is pure over the command text, so it takes no file, process or clock and imports only the tokenizer. Every
// answer it gives is held by tests/goldens/publish-*.json and tests/publish-command.test.mjs.
//
// The one reading of a command's text that stays (ADR-060, ADR-061): whether it
// INVOKES `git commit` or `git push`. Since ADR-067 it reads the command as the
// shell splits it (`shell-words.mjs`, proved against bash and zsh) and walks the
// argv of every simple command, rather than matching the text: a quoted string, a
// heredoc body and a comment are data, and `git {-c,x=y} push` is the invocation
// the shell runs. Nothing else is parsed.
//
// ⚠ UNTIL 2026-09-23 THIS MATCHED THE WORDS `commit` AND `push` ANYWHERE, and one
// day measured what that costs (BACKLOG §269): a grep for a symbol, a heredoc that
// mentioned the word, a scratch file named for the message it held — each refused,
// each correct work, and each refusal taught the session to put the text in a file
// and run `sh file.sh`. The same file then carried a real publish through
// unobserved. A gate that refuses correct work is one people route around, and the
// route is the one the work it should stop takes too (CLAUDE.md §16).
//
// ⚠ THIS IS STILL A READING OF TEXT (CLAUDE.md §16). What it proves is refused;
// what it misses but `mentionsCommitOrPush` sees is WARNED about. A `git` reached
// through a variable or a command substitution is a mention at most, and a script
// file is git's hook's to see (ADR-066).
import { shellWords } from './shell-words.mjs'

/**
 * commitOnlyCommand proves a command is one commit and nothing else (ADR-081):
 * one simple command, no substitution and nothing dynamic, whose program is git
 * and whose publish invocation is a commit. `publishCommandIn` names only the
 * FIRST invocation, so `git commit -m x && git push` would read as a commit;
 * anything this cannot prove is not one, and keeps the full check (Codex review).
 */
export function commitOnlyCommand(command) {
  if (typeof command !== 'string') return false
  const invoked = publishCommandIn(command)
  if (typeof invoked !== 'string' || !/(?:^|\s)commit$/.test(invoked)) return false
  const { commands } = shellWords(command)
  if (commands.length !== 1) return false
  const [only] = commands
  if (only.substitutions.length || only.dynamic.length || only.assignments.length || only.argv[0] !== 'git') return false
  // An unquoted here-document expands `$(…)`, so its body is code again (Codex review of ADR-081).
  if (only.heredocs.some(document => !document.quoted)) return false
  // The subcommand itself must be `commit`. An alias, `rebase --exec`, `-c` or `--exec-path`
  // can each run other commands, so before it only `-C <dir>` and `--no-pager` are allowed.
  let index = 1
  while (index < only.argv.length && only.argv[index].startsWith('-')) {
    if (only.argv[index] === '-C') index += 2
    else if (only.argv[index] === '--no-pager') index += 1
    else return false
  }
  return only.argv[index] === 'commit'
}

// Arithmetic assigns variables, and shellWords reads no command in it: `((R=1))` between
// `mktemp` and `cd "$R"` moves the commit (Codex re-review of a14a751, 2026-10-06).
// Bash also evaluates a variable's VALUE as an expression, so `((X))` can assign a name
// the text never spells (measured: `x=y=5; ((x)); echo "$y"` prints 5).
const ARITHMETIC = /\(\(|\$\[|(?<![\w-])let\s/

// What the hook process inherits that moves a repository or redefines a command before
// the text runs. Windows names are case-insensitive (CLAUDE.md §7), so any case counts.
const INHERITED_REDIRECTS = /^(?:GIT_DIR|GIT_WORK_TREE|GIT_INDEX_FILE|GIT_COMMON_DIR|GIT_OBJECT_DIRECTORY|BASH_ENV|ENV)$|^BASH_FUNC_/i

/**
 * freshRepositoryCommit proves from the text alone that a command commits into a
 * repository it created in a fresh `mktemp -d` directory (ADR-086 Decision 2): an
 * `&&`-chain from that variable's assignment through `cd "$V"` and a bare `git init`,
 * then only `git add` and `git commit`. No program may run in between, since any
 * program can write `$V/.git` as a gitfile pointing elsewhere, and a `;`, `||`, `|`,
 * `&`, newline, subshell or `!` lets the chain go on after `mktemp` or `cd` failed —
 * measured: a failed `mktemp` then `;` and `cd "$R"` commits HERE. The commands are
 * `cd` and `git` only, so `HOOK_UNSAFE_FIRST` has nothing left to exclude. Anything
 * this cannot prove is not one, and keeps ADR-061's refusal.
 */
export function freshRepositoryCommit(command, env = process.env) {
  if (typeof command !== 'string') return false
  // ADR-090 T1: a quoted message is one literal word, so no rule below reads it as code.
  command = maskedMessages(command)
  // One terminal newline ends the last command as the end of the text does; a newline
  // with anything after it is still a separator (Codex re-review of a14a751, P3).
  const text = command.replace(/\n$/, '')
  if (/[!{}`]/.test(text) || /(?<![\w.-])push(?![\w-])/.test(text)) return false
  if (HOOK_ENVIRONMENT_NAMES.test(text)) return false
  if (ARITHMETIC.test(text)) return false
  // ⚠ RESIDUAL: Bash may hold state this hook cannot see — a function or variable set by
  // an earlier command in the same shell, a startup file — and with no git hook armed
  // nothing judges at the event. That is why this unarmed path is this strict: what the
  // hook process inherits is read here, and anything else unproven keeps the refusal.
  if (Object.keys(env ?? {}).some(name => INHERITED_REDIRECTS.test(name))) return false
  const { commands, complete } = shellWords(text)
  if (!complete || commands.length < 4) return false
  const last = commands.length - 1
  if (commands.some((step, k) => step.heredocs.length || step.redirects || step.pipeTo !== null || step.ended !== (k === last ? '' : '&&'))) return false
  const [made, enter, init, ...rest] = commands
  const name = /^([A-Za-z_]\w*)=/.exec(made.assignments[0] ?? '')?.[1]
  if (made.argv.length || !freshDirectoryVariables(commands).has(name)) return false
  if (enter.assignments.length || enter.argv.length !== 2 || enter.argv[0] !== 'cd' || enter.argv[1] !== `$${name}` || !enter.dynamic.includes(1)) return false
  const plain = step => !step.assignments.length && !step.substitutions.length && !step.dynamic.length && !step.code.some(Boolean)
  if (!plain(init) || init.argv[0] !== 'git' || init.argv[1] !== 'init' || !init.argv.slice(2).every(word => word === '-q' || word === '--quiet')) return false
  return rest.every(step => {
    if (!plain(step) || step.argv[0] !== 'git') return false
    let at = 1
    while (step.argv[at] === '-c' && /^user\.(?:name|email)=/.test(step.argv[at + 1] ?? '')) at += 2
    return step.argv[at] === 'add' || step.argv[at] === 'commit'
  })
}

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

function xargsInvocations(commands, n, start) {
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
  for (const upstream of commands.filter(c => c.pipeTo === n)) {
    const from = programIndex(upstream.argv)
    if (typeof from !== 'number' || upstream.dynamic.includes(from) || programName(upstream.argv[from] ?? '') !== 'echo') return []
    texts.push(...literalOutput(upstream.argv, from))
  }
  const input = texts.join('\n')
  const tail = argv.slice(start)
  if (replace) return input.split('\n').filter(line => line.trim()).map(line => tail.map(word => word.split(replace).join(line.trim())))
  return [[...tail, ...input.split(/\s+/).filter(Boolean)]]
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

// The text a shell would run from its stdin: its own heredoc or here-string, and
// what the pipeline upstream of it writes, through any `cat` or `tee`. `printf` and
// zsh's `echo` turn `\n` into a line; reading every text that way can only find a
// publish that is there (Codex review of 341c49c: `echo … | cat | bash`).
function stdinScripts(commands, n, seen = new Set()) {
  const scripts = commands[n].heredocs.map(doc => doc.body)
  for (let m = 0; m < commands.length; m++) {
    if (commands[m].pipeTo !== n || seen.has(m)) continue
    seen.add(m)
    const upstream = commands[m]
    scripts.push(...upstream.heredocs.map(doc => doc.body))
    const start = programIndex(upstream.argv)
    if (typeof start !== 'number' || upstream.dynamic.includes(start)) continue
    if (PASS_THROUGH.has(programName(upstream.argv[start] ?? ''))) scripts.push(...stdinScripts(commands, m, seen))
    scripts.push(...literalOutput(upstream.argv, start))
  }
  return scripts.map(text => text.replace(/\\n/g, '\n'))
}

function publishInText(text, depth) {
  if (depth > WALK_DEPTH) return null
  const { commands } = shellWords(text)
  for (let n = 0; n < commands.length; n++) {
    const found = publishInCommand(commands, n, depth)
    if (found) return found
  }
  return null
}

function publishInCommand(commands, n, depth) {
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
    for (const built of xargsInvocations(commands, n, start)) {
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
      const found = inner(stdinScripts(commands, n))
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

// The words a segment may not start with, because they change what a later `git`
// runs or inherits: the environment builtins, sourcing, aliases, and wrappers that
// may run git without this session's environment (ADR-066 T3).
const HOOK_UNSAFE_FIRST = new Set(['export', 'unset', 'declare', 'typeset', 'readonly', 'local', 'source', '.',
  'eval', 'alias', 'unalias', 'env', 'exec', 'command', 'builtin', 'set', 'shopt', 'hash', 'sudo', 'doas', 'su', 'ssh'])

// What a plain `git commit` / `git push` may carry: options that never touch hooks.
// Short letters that take a value (`m`, `F`) end their cluster; `n` is in no set.
const HOOK_SAFE_OPTIONS = {
  commit: { long: new Set(['--amend', '--all', '--no-edit', '--quiet', '--signoff', '--allow-empty', '--verbose']),
    valued: /^--(?:message|file)=/, takesNext: new Set(['--message', '--file']), short: 'aqvs', takes: 'mF' },
  push: { long: new Set(['--set-upstream', '--tags', '--quiet', '--follow-tags', '--verbose', '--atomic', '--force-with-lease']),
    valued: /^--force-with-lease=/, takesNext: new Set(), short: 'uqvf', takes: '' },
}

// Commands whose quoted text, or heredoc body, is data or runs with this shell's
// environment: a publish written there may count. Under any other command it is an
// unknown program running git, and keeps the refusal (Codex review of 3.0.0, round
// 4: `bash -c "git commit -m x;"`; a heredoc fed to a container runs without it).
const HOOK_DATA_COMMANDS = new Set(['echo', 'printf', 'cat', 'git', 'node'])

// The short-cluster rule (ADR-066 round 3): in `-<letters>`, the first letter that
// takes a value takes the rest of the cluster as that value, or the next word when it
// ends the cluster. Its index in `arg`, or -1 when no letter of `takes` is there.
function valuedLetter(arg, takes) {
  for (let at = 1; at < arg.length; at += 1) if (takes.includes(arg[at])) return at
  return -1
}

// Whether a `git commit` / `git push` segment's arguments are all known to leave
// hooks alone; anything unlisted is not. A word hiding quoted code (a NUL) is not
// known — `git commit '-nm;x'` hands git `-n` (round 4).
function plainGitArguments(verb, args) {
  const safe = HOOK_SAFE_OPTIONS[verb]
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (!arg.startsWith('-')) {
      if (arg.includes('\0')) return false
      continue
    }
    if (safe.long.has(arg) || safe.valued.test(arg)) continue
    if (safe.takesNext.has(arg)) { i += 1; continue }
    if (!/^-[A-Za-z]/.test(arg)) return false
    const at = valuedLetter(arg, safe.takes)
    if (![...arg.slice(1, at < 0 ? arg.length : at)].every(letter => safe.short.includes(letter))) return false
    if (at === arg.length - 1) i += 1
  }
  return true
}

// One segment: -1 when it could turn the hook off or run git some other way, 1 for a
// plain publish, 0 for anything else. The one bare assignment of a fresh-directory
// variable (ADR-086 T1) is plain; every other `NAME=` segment is not.
function segmentVerdict(words, fresh = NO_FRESH_DIRECTORIES) {
  const [first] = words
  if (words.length === 1 && fresh.has(/^([A-Za-z_]\w*)=/.exec(first)?.[1])) return 0
  if (/^[A-Za-z_]\w*=/.test(first) || HOOK_UNSAFE_FIRST.has(first)) return -1
  if (first !== 'git') {
    // A wrapper that runs git: `bash -c 'git commit'`, `xargs git push`.
    return words.some(w => /\bgit\b/.test(w)) && words.some(w => /\b(?:commit|push)\b/.test(w)) ? -1 : 0
  }
  let at = 1
  // Git's own options before the verb: only the ones that leave hooks alone.
  while (at < words.length && words[at].startsWith('-')) {
    if (words[at] === '--no-pager' || words[at] === '-P') at += 1
    else if (words[at] === '-C' && at + 1 < words.length) at += 2
    else if (words[at] === '-c' && /^user\.\w+=/.test(words[at + 1] ?? '')) at += 2
    else return -1
  }
  const verb = words[at]
  if (verb === 'config') return -1
  // A verb with anything glued to it — `commit</dev/null` — is not a verb this reads.
  if (verb !== 'commit' && verb !== 'push') return words.some(w => /\b(?:commit|push)\b/.test(w)) ? -1 : 0
  return plainGitArguments(verb, words.slice(at + 1)) ? 1 : -1
}

// Judge every command of `text`, as `shellWords` splits it (ADR-067 T3), and the
// quoted code and heredoc bodies inside it. Returns the number of plain publishes,
// or -1 when something could turn the hook off. A word whose quoted span held an
// operator is code an interpreter may run: it stands in its command as a NUL, as the
// split before ADR-067 left it, and is judged on its own. A publish in quoted code
// or a heredoc body counts only under a data command; a bare quoted literal inside
// such code — `console.log('a; git push')`, where the literal opens its own command
// after `(` — counts under the command that encloses it. A heredoc whose command
// pipes its output on — `cat <<EOF | docker … sh` — may carry the body anywhere, so
// it counts for none.
function plainPublishes(text, depth, inherited = false, fresh = NO_FRESH_DIRECTORIES) {
  if (depth > 4) return -1
  const { commands, complete } = shellWords(text)
  if (!complete) return -1
  let found = 0
  const wordsOf = command => [...command.assignments, ...command.argv.map((word, k) => (command.code[k] ? '\0' : word))]
  const allowed = command => command !== null
    && (HOOK_DATA_COMMANDS.has(command.argv[0]) || (command.code[0] === true && command.assignments.length === 0 && inherited))
  const counted = (count, command) => {
    if (count < 0 || (count > 0 && !allowed(command))) return false
    found += count
    return true
  }
  for (const command of commands) {
    for (let k = 0; k < command.argv.length; k++) {
      if (command.code[k] && !counted(plainPublishes(command.argv[k], depth + 1, allowed(command)), command)) return -1
    }
    for (const doc of command.heredocs) {
      if (!counted(plainPublishes(doc.body, depth + 1), command.pipeTo === null ? command : null)) return -1
    }
    const words = wordsOf(command)
    if (words.length === 0) continue
    const verdict = segmentVerdict(words, fresh)
    if (verdict < 0) return -1
    found += verdict
  }
  return found
}

// ADR-086: a fresh-directory variable is a name the command assigns exactly once, as
// a bare `V=$(mktemp -d [template])` whose template is a plain literal, and names
// nowhere else as a word (`export V`, `read V`, `local V`, `for V`). A name git or
// this session reads from the environment never is one.
// A name git or this session reads from the environment, anywhere in a text:
// `printf -v GIT_CONFIG_COUNT %s 0` assigns one with no builtin listed (round 4).
const HOOK_ENVIRONMENT_NAMES = /\b(?:GIT_\w*|CLAUDE_\w*|PATH|HOME|XDG_CONFIG_HOME|env)\b/

const NO_FRESH_DIRECTORIES = new Set()

const FRESH_TEMPLATE = /^[\w./@%+:,][\w./@%+:,-]*$/

// ADR-093 (review of 3772a178): what a fresh or literal directory variable must also be.
// Every identifier a command may write BY NAME is "mentioned": the words of its arguments
// (`read S`, `printf -v S`, `declare -n r=S`, `S+=x` — which the lexer leaves as a word, not
// an assignment — and `read 'S[0]'`) and the values of the other assignments (a nameref
// target). A plain `$name…` operand only reads, so it is not. A mentioned name is not a
// variable the text assigns once and leaves alone.
const IDENTIFIER = /[A-Za-z_]\w*/g

const OPERAND_SHAPE = /^\$[A-Za-z_]\w*(?:\/[\w.:-]+)*$/

function mentionedNames(commands, except) {
  const names = new Set()
  commands.forEach((command, index) => {
    for (const word of command.argv) {
      if (!OPERAND_SHAPE.test(word)) for (const id of word.match(IDENTIFIER) ?? []) names.add(id)
    }
    if (index === except) return
    for (const assignment of command.assignments) {
      for (const id of assignment.slice(assignment.indexOf('=') + 1).match(IDENTIFIER) ?? []) names.add(id)
    }
  })
  return names
}

// How often each name is assigned; `S+=x` appended to `S` is a second assignment of `S`.
function assignmentCounts(commands) {
  const assigned = new Map()
  for (const command of commands) {
    for (const assignment of command.assignments) {
      const name = assignment.slice(0, assignment.indexOf('=')).replace(/\+$/, '')
      assigned.set(name, (assigned.get(name) ?? 0) + 1)
    }
  }
  return assigned
}

// The assignment provably ran in the shell that expands its uses: every command of the text
// is a plain foreground command joined by `;`, `&&` or a newline (no pipe, `||`, `&`,
// subshell, group or keyword — `(S=/tmp); cd $S` and `false && S=/tmp; cd $S` leave an
// inherited value), and the assignment follows no `&&`: it is the first command, or comes
// after `;` or a newline.
const FLAT_JOINERS = new Set([';', '&&', '\n', ''])

const SHELL_KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'fi', 'while', 'until', 'do', 'done', 'for', 'case', 'esac',
  'select', 'function', 'time', 'coproc', 'in', '!', '{', '}', '[[', '((', 'repeat', 'foreach', 'end', 'always'])

function runsInThisShell(commands, index) {
  if (!commands.every(command => FLAT_JOINERS.has(command.ended) && command.pipeTo === null && !SHELL_KEYWORDS.has(command.argv[0]))) return false
  return index === 0 || commands[index - 1].ended === ';' || commands[index - 1].ended === '\n'
}

function freshDirectoryVariables(commands, text = '') {
  if (namesShellSpecial(text)) return NO_FRESH_DIRECTORIES
  const assigned = assignmentCounts(commands)
  const fresh = new Set()
  commands.forEach((command, index) => {
    if (command.argv.length || command.assignments.length !== 1 || command.substitutions.length !== 1
      || command.heredocs.length || command.redirects) return
    const [assignment] = command.assignments
    const name = /^([A-Za-z_]\w*)=/.exec(assignment)?.[1]
    if (!name || assigned.get(name) !== 1 || mentionedNames(commands, index).has(name) || !runsInThisShell(commands, index)) return
    if (HOOK_ENVIRONMENT_NAMES.test(name)) return
    if (AUTO_UPDATED_NAMES.test(name)) return
    const [inner] = command.substitutions
    if (assignment !== `${name}=$(${inner})`) return
    const parsed = shellWords(inner)
    if (!parsed.complete || parsed.commands.length !== 1) return
    const [made] = parsed.commands
    if (made.assignments.length || made.dynamic.length || made.substitutions.length || made.heredocs.length || made.redirects) return
    const [program, flag, ...templates] = made.argv
    if (program !== 'mktemp' || flag !== '-d' || templates.length > 1 || !templates.every(word => FRESH_TEMPLATE.test(word))) return
    // The substitution is that ONE foreground command, word for word: an `&`, a `;`, a
    // pipe, a group or an arithmetic construct beside it is not (Codex re-review of a14a751).
    if (inner !== made.argv.join(' ')) return
    fresh.add(name)
  })
  return fresh
}

// ADR-093: a literal directory variable is a name the command assigns exactly once, as a
// bare `V=<value>` whose value is plain path text (no `$`, quote, glob, space, comma or
// leading `-`, no `.` or `..` segment), spelled unquoted in the raw text, named nowhere
// else as a word, and outside the names the hook and the shell read. `IFS` is the way to
// split a plain value into git arguments (measured under bash, 2026-10-09), so a text
// that names it, or any other shell-special name, has no literal variable at all. The
// armed arm only: the unarmed proof reads `freshDirectoryVariables` and never this.
const SHELL_SPECIAL_NAMES = /\b(?:IFS|CDPATH|PWD|OLDPWD|SHELLOPTS|BASHOPTS|PS4|PROMPT_COMMAND|BASH_\w+)\b/

// A variable the shell writes itself, without the text naming it: `_` after every command,
// `REPLY` and zsh's `reply` after an operandless `read`, `OPTARG` after `getopts`, `MAPFILE`
// after `mapfile`, and zsh's tied arrays. Judged by the candidate's NAME, never by a word in
// the text (a command may say `status`), and for both kinds of directory variable.
const AUTO_UPDATED_NAMES = /^(?:_|REPLY|reply|OPTARG|OPTIND|LINENO|RANDOM|SECONDS|PIPESTATUS|pipestatus|FUNCNAME|BASHPID|PPID|SHLVL|MAPFILE|path|cdpath|fpath|mailpath|manpath|module_path|psvar|watch|argv|status|signals|histchars)$/

// ADR-093 (review of c47dbbd6): the armed arm admits a directory variable only under a POSITIVE
// name grammar, one letter and up to two digits. The names a shell manages for itself are an open
// set — `DIRSTACK`, `HISTCMD`, `EPOCHSECONDS`, zsh's tied arrays — and a list of them was chased
// through three Codex rounds; no shell manages such a name, which the supplementary test executes
// in every shell the runner has (CLAUDE.md §16). `AUTO_UPDATED_NAMES` stays for the unarmed arm.
const SCRATCH_NAME = /^[A-Za-z]\d{0,2}$/

// A quote or a backslash inside a word is often gone by the time the shell sees it: `I''FS` and
// `I\FS` are `IFS`. Inside single quotes a backslash stays, so removing them is a conservative
// check, not shell behaviour: the special-name test reads the text as written and with them removed.
const namesShellSpecial = text => SHELL_SPECIAL_NAMES.test(text) || SHELL_SPECIAL_NAMES.test(text.replace(/['"\\]/g, ''))

// The check for a write into the repository's own configuration reads the text the variable's use
// stood in: a use that spells a `.git` or `hookspath` segment keeps the refusal.
const PROTECTED_SUFFIX = /\.git|hookspath/i

const LITERAL_VALUE = /^\/?[\w.][\w./:-]*$/

const LITERAL_SUFFIX = /^[\w.:-]+(?:\/[\w.:-]+)*$/

const hasDotSegment = value => value.split('/').some(part => part === '.' || part === '..')

function literalDirectoryVariables(commands, text) {
  // A heredoc body is text the raw-spelling count below cannot tell from code: a decoy `S=/tmp`
  // line there would stand for a quoted assignment.
  if (namesShellSpecial(text) || commands.some(command => command.heredocs.length)) return NO_FRESH_DIRECTORIES
  const assigned = assignmentCounts(commands)
  const literal = new Set()
  commands.forEach((command, index) => {
    if (command.argv.length || command.assignments.length !== 1 || command.substitutions.length || command.redirects) return
    const [assignment] = command.assignments
    const found = /^([A-Za-z_]\w*)=(.*)$/s.exec(assignment)
    if (!found) return
    const [, name, value] = found
    if (!SCRATCH_NAME.test(name)) return
    if (assigned.get(name) !== 1 || mentionedNames(commands, index).has(name)) return
    if (!runsInThisShell(commands, index)) return
    if (!LITERAL_VALUE.test(value) || hasDotSegment(value) || PROTECTED_SUFFIX.test(value)) return
    // The parser strips quotes and escapes, so the spelling is read in the raw text: a
    // quoted or escaped value is not the bare assignment this reads.
    const spelled = new RegExp(`(?<=^|[\\s;&|(])${assignment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s;&|)])`, 'g')
    if ((text.match(spelled)?.length ?? 0) !== 1) return
    literal.add(name)
  })
  return literal
}

// How many of `command`'s words are `operand` standing as a directory: the only
// operand of `cd`, the value of `git -C`, or the directory of `git init` (ADR-086). For a
// literal directory variable (ADR-093) the only operand of `mkdir` counts too, and the
// operand may carry a plain `/seg…` suffix; a fresh-directory variable keeps ADR-086's forms.
function directoryOperands(command, operand, literal = false) {
  const { argv } = command
  const placed = word => word === operand
    || (literal && typeof word === 'string' && word.startsWith(`${operand}/`)
      && LITERAL_SUFFIX.test(word.slice(operand.length + 1)) && !hasDotSegment(word.slice(operand.length + 1)))
  const expanded = k => placed(argv[k]) && command.dynamic.includes(k)
  if (argv[0] === 'cd') return argv.length === 2 && expanded(1) ? 1 : 0
  if (literal && argv[0] === 'mkdir') return argv.length === 2 && expanded(1) ? 1 : 0
  if (argv[0] !== 'git') return 0
  let found = 0
  let at = 1
  while (at < argv.length && argv[at].startsWith('-')) {
    if (argv[at] === '-C') { if (expanded(at + 1)) found += 1; at += 2 } else at += 1
  }
  if (argv[at] !== 'init') return found
  const rest = argv.slice(at + 1).map((word, k) => [word, at + 1 + k])
  const directories = rest.filter(([, k]) => expanded(k))
  const quiet = rest.every(([word, k]) => expanded(k) || word === '-q' || word === '--quiet')
  return found + (directories.length === 1 && quiet ? 1 : 0)
}

// The short letters of `git commit` that take a value: VERB_VALUED's measured set.
// `-Cm x` gives `m` to `-C`, so its `x` is a pathspec, not a message (ADR-090 T1).
const COMMIT_VALUED_LETTERS = 'mFCctU'

/**
 * maskedMessages is `text` with each message value of a `git commit` that the shell
 * and git both read as one literal word replaced by the plain word `msg` (ADR-090 T1),
 * so the downgrade rules that read raw text read no message as code. A value is the
 * word after `-m`, `--message`, `-F` or `--file`, the tail of `--message=` or
 * `--file=`, or a short cluster's value by `valuedLetter`, before any `--`, in a
 * command whose program is the literal `git` and whose verb is `commit`. It is masked
 * only when its word is not dynamic, its value part was written as one single- or
 * double-quoted span whose spelling occurs exactly once in the text, and the text read
 * again has `msg` in that same word. Anything unproven is left as it came (§16).
 */
function maskedMessages(text) {
  const { commands, complete } = shellWords(text)
  if (!complete) return text
  let masked = text
  commands.forEach(({ argv, dynamic }, n) => {
    if (argv[0] !== 'git' || dynamic.includes(0)) return
    const verb = gitVerbIndex(argv, 0)
    if (argv[verb] !== 'commit') return
    for (let k = verb + 1; k < argv.length && argv[k] !== '--'; k += 1) {
      const word = argv[k]
      let prefix = ''
      let at = k
      if (word === '--message' || word === '--file') at = k + 1
      else if (/^--(?:message|file)=/.test(word)) prefix = word.slice(0, word.indexOf('=') + 1)
      else if (/^-[A-Za-z]/.test(word)) {
        const letter = valuedLetter(word, COMMIT_VALUED_LETTERS)
        if (letter < 0) continue
        if (letter === word.length - 1) at = k + 1
        else prefix = word.slice(0, letter + 1)
        if (!'mF'.includes(word[letter])) { k = at; continue }
      } else continue
      k = at
      const plain = `${prefix}msg`
      if (at >= argv.length || dynamic.includes(at) || argv[at] === plain) continue
      const value = argv[at].slice(prefix.length)
      // The spelling the value was written in, rebuilt: double quotes only when no
      // character in it could have been an escape the lexer already removed.
      const spellings = [...(value.includes("'") ? [] : [`'${value}'`]), ...(/["\\]/.test(value) ? [] : [`"${value}"`])]
      for (const spelling of spellings) {
        const written = `${prefix}${spelling}`
        if (masked.split(written).length !== 2) continue
        // Every occurrence goes, so only the count above stops a second one being hidden;
        // and the one there was must be this word, not the same spelling elsewhere.
        const next = masked.split(written).join(plain)
        if (shellWords(next).commands[n]?.argv[at] === plain) { masked = next; break }
      }
    }
  })
  return masked
}

// Whether every `$name` in `plain` stands as a directory operand: the commands' own operand
// count and the text's operand matches both equal the number of references (ADR-086 T1).
// One definition for both kinds of directory variable, so they cannot disagree.
function usesAreOperands(plain, name, uses, operand) {
  const references = plain.match(new RegExp(`\\$\\{?${name}(?!\\w)`, 'g'))?.length ?? 0
  return uses === references && (plain.match(operand)?.length ?? 0) === references
}

// ADR-086 T1: `text` with each fresh-directory variable's assignment, and every use of
// it as a directory operand, made plain. When any `$V` stands anywhere else, or the
// text names a push, the text is returned as it came, and its `$` keeps the refusal.
// ADR-093: a literal directory variable's uses are made plain the same way (its
// assignment is plain text already), and the returned set holds both kinds of name.
function freshDirectoryText(text) {
  // ADR-090 T1: every rule reading this text, here and in leavesHookInPlace, reads each
  // quoted commit message masked.
  text = maskedMessages(text)
  if (!/[$`]/.test(text)) return { raw: text, fresh: NO_FRESH_DIRECTORIES }
  const { commands } = shellWords(text)
  const fresh = new Set([...freshDirectoryVariables(commands, text)].filter(name => SCRATCH_NAME.test(name)))
  const literal = literalDirectoryVariables(commands, text)
  const unchanged = { raw: text, fresh: NO_FRESH_DIRECTORIES }
  if ((fresh.size === 0 && literal.size === 0) || /(?<![\w.-])push(?![\w-])/.test(text)) return unchanged
  let plain = text
  for (const name of fresh) {
    const at = commands.findIndex(command => command.argv.length === 0 && command.assignments[0]?.startsWith(`${name}=`))
    const [assignment] = commands[at].assignments
    const [template = ''] = shellWords(commands[at].substitutions[0]).commands[0].argv.slice(2)
    if (plain.split(assignment).length !== 2) return unchanged
    const uses = commands.slice(at + 1).reduce((sum, command) => sum + directoryOperands(command, `$${name}`), 0)
    const operand = new RegExp(`(?<=^|[\\s;&|(])(?:"\\$${name}"|\\$${name})(?=$|[\\s;&|)])`, 'g')
    if (!usesAreOperands(plain, name, uses, operand)) return unchanged
    plain = plain.replace(assignment, () => `${name}=${template}`).replace(operand, () => 'fresh')
  }
  for (const name of literal) {
    const at = commands.findIndex(command => command.argv.length === 0 && command.assignments[0]?.startsWith(`${name}=`))
    const uses = commands.slice(at + 1).reduce((sum, command) => sum + directoryOperands(command, `$${name}`, true), 0)
    const operand = new RegExp(`(?<=^|[\\s;&|(])(?:"\\$${name}(?:/[\\w./:-]*)?"|\\$${name}(?:/[\\w./:-]*)?)(?=$|[\\s;&|)])`, 'g')
    if ((plain.match(operand) ?? []).some(use => PROTECTED_SUFFIX.test(use))) return unchanged
    if (!usesAreOperands(plain, name, uses, operand)) return unchanged
    plain = plain.replace(operand, () => 'fresh')
  }
  return { raw: plain, fresh: new Set([...fresh, ...literal]) }
}

/**
 * Whether a matched publish provably leaves git's hook in place (ADR-066 T3).
 *
 * Rule P hands a command to git only when this is true, so it fails CLOSED: an
 * unrecognised form keeps ADR-061's refusal (CLAUDE.md §16), which costs nothing,
 * because on an unchecked tree that refusal is what 2.111.0 did. So it is a
 * GRAMMAR of what is known to be plain, never a list of what is known to be
 * dangerous — three Codex rounds on 3.0.0 each found a new way past such a list:
 * quotes and escapes, then continuations and braces, then redirections, attached
 * values, `--work-tree`, `--exec-path`, `PATH=`, `source` and inline aliases.
 *
 * A program the command runs before git can still reconfigure git, the same as a
 * script file can; this judges only what the command's own text hands git.
 */
export function leavesHookInPlace(command) {
  // The shell joins a backslash-newline before anything else reads the line.
  const joined = String(command ?? '').replace(/\\\r?\n/g, '')
  // ADR-086 T1: a fresh-directory variable used as a directory is plain text; git's
  // own hook then judges the repository the commit lands in.
  const { raw, fresh } = freshDirectoryText(joined)
  // A `$` or a backtick can build any argument at run time.
  if (/[$`]/.test(raw)) return false
  // Outside quotes the shell also EXPANDS — braces, globs, a tilde — so what stands
  // there must be plain text, and a carriage return or a form feed is no separator.
  const unquoted = raw.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, ' ')
  if (/[^\w \t\n./:=@,%+\-;&|()<>\\]/.test(unquoted)) return false
  // Arithmetic outside quotes can assign any variable, even one named only in another
  // variable's value (`((X))` with X=`GIT_CONFIG_COUNT=0`), which the name check below
  // cannot see. Deferring to git's hook is sound only while the hook stays injected, so
  // the armed arm refuses it too (Codex re-review of a14a751, 2026-10-06).
  if (ARITHMETIC.test(unquoted)) return false
  // A write into the repository's own configuration, or a hooks path named at all.
  if (/\.git\/|hookspath/i.test(raw)) return false
  // A name git or this session reads from the environment, anywhere in the text:
  // `printf -v GIT_CONFIG_COUNT %s 0` assigns one with no builtin listed (round 4).
  if (HOOK_ENVIRONMENT_NAMES.test(raw)) return false
  return plainPublishes(raw, 0, false, fresh) > 0
}
