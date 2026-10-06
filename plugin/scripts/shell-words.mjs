// ADR-067: the one reader of shell text that rule P decides by.
//
// It splits a command the way a POSIX shell does — quotes, escapes, operators,
// comments, redirections, heredocs, command substitutions, brace expansion — and
// returns the simple commands in order. It EXPANDS nothing it cannot know from the
// text: a word holding a `$`, a backtick or a glob is marked dynamic instead.
//
// The claim that this is how the shell splits a command is checked against bash and
// zsh in tests/shell-words.test.mjs, not argued here (CLAUDE.md §16).

const OPERATOR = new Set([';', '&', '|', '(', ')', '\n'])
const REDIRECT = new Set(['<', '>'])
const BLANK = new Set([' ', '\t'])
const GLOB = new Set(['*', '?', '['])
// A quoted span holding one of these is code an interpreter may run.
const CODE = /[;&|()\n]/

/**
 * `shellWords(text)` → `{ commands, complete }`. Each command is
 * `{ argv, assignments, dynamic, quoted, code, heredocs, substitutions, pipeTo }`:
 * `dynamic`, `quoted` and `code` are per-argv-word; `pipeTo` is the index of the
 * command this one's output is piped into, or null. `complete` is false when a
 * quote, a substitution or a heredoc never closes — the commands completed before
 * it are still returned.
 */
export function shellWords(text) {
  const src = String(text ?? '')
  const commands = []
  let complete = true
  let command = fresh()
  let word = null
  let pending = []
  let pipeNext = false
  let naming = false
  let i = 0

  function fresh() {
    return { argv: [], assignments: [], dynamic: [], quoted: [], code: [], heredocs: [], substitutions: [], pipeTo: null, ended: '', redirects: 0 }
  }
  const startWord = () => { word ??= { chars: [], dynamic: false, quoted: false, code: false } }
  const push = (c, q) => { startWord(); word.chars.push({ c, q }) }

  function endWord() {
    if (word === null) return
    const w = word
    word = null
    const leading = command.argv.length === 0
    const raw = w.chars.map(x => x.c).join('')
    // `function NAME` opens a definition, as `NAME()` does: neither word is a command,
    // and the body's commands are read as commands (ADR-090 T2).
    if (naming) { naming = false; return }
    if (leading && !w.quoted && raw === 'function' && command.assignments.length === 0) { naming = true; return }
    if (leading && isAssignment(w.chars)) {
      command.assignments.push(raw)
      return
    }
    // Shell syntax, not a program: a group's braces and a pipeline's `!`.
    if (leading && !w.quoted && (raw === '{' || raw === '}' || raw === '!')) return
    for (const expanded of braces(w.chars)) {
      const value = expanded.map(x => x.c).join('')
      const ranged = /\{[^{}]*\.\.[^{}]*\}/.test(value) && expanded.some(x => !x.q && x.c === '{')
      command.dynamic.push(w.dynamic || ranged || expanded.some(x => !x.q && GLOB.has(x.c)))
      command.quoted.push(w.quoted)
      command.code.push(w.code)
      command.argv.push(value)
    }
  }

  function endCommand(operator) {
    endWord()
    naming = false
    // A command of redirections alone still runs its substitutions: `<$(git push)`
    // pushes before the open fails (Codex review of 341c49c).
    const empty = command.argv.length === 0 && command.assignments.length === 0 && command.heredocs.length === 0
      && command.substitutions.length === 0
    if (!empty) {
      if (pipeNext) commands.at(-1).pipeTo = commands.length
      command.ended = operator
      commands.push(finish(command))
      pipeNext = operator === '|' || operator === '|&'
    } else if (!['|', '|&', '(', '\n'].includes(operator)) pipeNext = false
    command = fresh()
  }

  // Read a quoted span starting at the quote character at `src[i]`. Returns false
  // when it never closes.
  function quoted() {
    const q = src[i]
    startWord()
    word.quoted = true
    const from = i + 1
    for (let k = from; k < src.length; k++) {
      if (q === "'" && src[k] === "'") { spanned(src.slice(from, k)); for (const c of src.slice(from, k)) push(c, true); i = k; return true }
      if (q === '"') {
        if (src[k] === '\\' && k + 1 < src.length && '$`"\\\n'.includes(src[k + 1])) {
          if (src[k + 1] !== '\n') push(src[k + 1], true)
          k++
          continue
        }
        if (src[k] === '$' || src[k] === '`') {
          word.dynamic = true
          const end = substitution(k)
          if (end < 0) return false
          for (const c of src.slice(k, end)) push(c, true)
          k = end - 1
          continue
        }
        if (src[k] === '"') { spanned(src.slice(from, k)); i = k; return true }
        push(src[k], true)
      }
    }
    return false
  }
  const spanned = span => { if (CODE.test(span)) word.code = true }

  // `$…` or a backtick at `k`: record a command substitution, skip a parameter.
  // Returns the index just past it, or -1 when it never closes.
  function substitution(k) {
    if (src[k] === '`') {
      for (let e = k + 1; e < src.length; e++) {
        if (src[e] === '\\') { e++; continue }
        if (src[e] === '`') { command.substitutions.push(src.slice(k + 1, e)); return e + 1 }
      }
      return -1
    }
    const next = src[k + 1]
    if (next === '(') {
      const end = balanced(k + 1, '(', ')')
      if (end < 0) return -1
      // `$((…))` is arithmetic: its text is no command, but a `$(…)` inside it runs.
      if (src[k + 2] === '(') command.substitutions.push(...substitutionsIn(src.slice(k + 3, end - 1)))
      else command.substitutions.push(src.slice(k + 2, end))
      return end + 1
    }
    if (next === '{') {
      const end = balanced(k + 1, '{', '}')
      if (end < 0) return -1
      // `${x:-$(git push)}` runs the substitution when x is unset (Codex review of 341c49c).
      command.substitutions.push(...substitutionsIn(src.slice(k + 2, end)))
      return end + 1
    }
    // A name runs to its last word character; a special parameter (`$$`, `$1`, `$?`) is one
    // character, so `"$x$(git push)"` leaves its `$(` to be read (ADR-090 T2).
    if (/[A-Za-z_]/.test(src[k + 1] ?? '')) {
      let e = k + 2
      while (/\w/.test(src[e] ?? '')) e++
      return e
    }
    return /[\w@*#?$!-]/.test(src[k + 1] ?? '') ? k + 2 : k + 1
  }

  const balanced = (k, open, close) => closing(src, k, open, close)

  // After a newline: the bodies of the heredocs its line opened, in order.
  function readHeredocs() {
    for (const doc of pending) {
      const lines = []
      let closed = false
      while (i < src.length) {
        let end = src.indexOf('\n', i)
        if (end < 0) end = src.length
        let line = src.slice(i, end)
        i = end + 1
        if (doc.strip) line = line.replace(/^\t+/, '')
        if (line === doc.delimiter) { closed = true; break }
        lines.push(line)
      }
      if (!closed) complete = false
      const body = lines.map(l => `${l}\n`).join('')
      // POSIX expands an unquoted delimiter's body: its `$(…)` and backticks run, and a
      // quote there is a plain character (ADR-090 T2). A quoted delimiter's body is data.
      if (!doc.quoted) doc.owner.substitutions.push(...substitutionsIn(body, false))
      doc.owner.heredocs.push({ delimiter: doc.delimiter, quoted: doc.quoted, body })
    }
    pending = []
  }

  // A redirection at `src[i]`. Its target is not an argument; a heredoc's delimiter
  // is remembered for the next line.
  function redirection() {
    // A word of digits directly before the operator is a file descriptor.
    if (word && word.chars.every(x => !x.q && /\d/.test(x.c))) word = null
    else endWord()
    let op = src[i]
    while (i + 1 < src.length && '<>&|-'.includes(src[i + 1]) && op.length < 3) op += src[++i]
    i++
    // Counted, not kept: a redirection can fail on its own (`true < missing`), which
    // the constant-success check has to know (Codex review of the 626934a batch).
    command.redirects += 1
    const heredoc = op.startsWith('<<') && !op.startsWith('<<<')
    while (BLANK.has(src[i])) i++
    const target = readTarget()
    if (target === null) return false
    if (heredoc) {
      pending.push({ owner: command, delimiter: target.value, quoted: target.quoted, strip: op === '<<-' })
    } else if (op === '<<<') {
      // A here-string is the command's stdin, as a heredoc body is.
      command.heredocs.push({ delimiter: null, quoted: target.quoted, body: `${target.value}\n` })
    }
    return true
  }

  // The next word, for a redirection target: its value and whether it was quoted.
  function readTarget() {
    const saved = word
    word = null
    let quotedAny = false
    for (; i < src.length; i++) {
      const c = src[i]
      if (BLANK.has(c) || OPERATOR.has(c) || REDIRECT.has(c)) break
      if (c === "'" || c === '"') { quotedAny = true; if (!quoted()) return null; continue }
      if (c === '\\') {
        // A continued delimiter (`<<\` then `EOF`) is one word, as the shell joins it.
        if (src[i + 1] === '\n') { i++; continue }
        quotedAny = true
        push(src[++i] ?? '', true)
        continue
      }
      if (c === '$' || c === '`') { const end = substitution(i); if (end < 0) return null; startWord(); word.dynamic = true; for (const ch of src.slice(i, end)) push(ch, false); i = end - 1; continue }
      push(c, false)
    }
    i--
    const value = word ? word.chars.map(x => x.c).join('') : ''
    word = saved
    return { value, quoted: quotedAny }
  }

  // `$'…'` from its first character at `k`: bash's escapes decoded into the word.
  // Returns the index of the closing quote, or -1 when it never closes.
  function ansiC(k) {
    startWord()
    word.quoted = true
    const simple = { a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\', "'": "'", '"': '"', '?': '?' }
    for (let e = k; e < src.length; e++) {
      const c = src[e]
      if (c === "'") return e
      if (c !== '\\') { push(c, true); continue }
      const x = src[e + 1]
      if (x in simple) { push(simple[x], true); e++; continue }
      const hex = x === 'x' ? /^[0-9a-fA-F]{1,2}/ : x === 'u' ? /^[0-9a-fA-F]{1,4}/ : x === 'U' ? /^[0-9a-fA-F]{1,8}/ : null
      const digits = hex ? src.slice(e + 2).match(hex)?.[0] : src.slice(e + 1).match(/^[0-7]{1,3}/)?.[0]
      if (digits) {
        push(String.fromCodePoint(parseInt(digits, hex ? 16 : 8)), true)
        e += digits.length + (hex ? 1 : 0)
        continue
      }
      // An escape this does not know keeps its backslash, as bash does.
      push('\\', true)
    }
    return -1
  }

  for (; i < src.length; i++) {
    const c = src[i]
    if (c === '\\') {
      if (src[i + 1] === '\n') { i++; continue }
      if (i + 1 < src.length) { startWord(); word.quoted = true; push(src[++i], true) }
      continue
    }
    if (c === "'" || c === '"') {
      if (!quoted()) { complete = false; word = null; command = fresh(); break }
      continue
    }
    if (c === '$' && src[i + 1] === "'") {
      // ANSI-C quoting: the value is fixed by the text, so it is decoded, not dynamic —
      // `$'git' push` runs git (Codex review of 341c49c).
      const end = ansiC(i + 2)
      if (end < 0) { complete = false; word = null; command = fresh(); break }
      i = end
      continue
    }
    if (c === '$' || c === '`') {
      const end = substitution(i)
      if (end < 0) { complete = false; word = null; command = fresh(); break }
      startWord()
      word.dynamic = true
      for (const ch of src.slice(i, end)) push(ch, false)
      i = end - 1
      continue
    }
    if (c === '#' && word === null) {
      while (i + 1 < src.length && src[i + 1] !== '\n') i++
      continue
    }
    // An arithmetic command `((…))` runs no program, and its `<<` is a shift, not a
    // heredoc: read as one, it swallowed the next line's `git commit` into a body
    // (a fail-open, found by the gate on 2026-09-27).
    if (c === '(' && src[i + 1] === '(' && word === null && command.argv.length === 0 && command.assignments.length === 0) {
      const end = balanced(i, '(', ')')
      if (end < 0) { complete = false; command = fresh(); break }
      // ...but a `$(…)` inside it runs (Codex review of 341c49c).
      command.substitutions.push(...substitutionsIn(src.slice(i + 2, end - 1)))
      i = end
      continue
    }
    // Process substitution `<(…)` / `>(…)` runs its command and stands in the argv as a
    // path. It is code, so the armed grammar never reads the command as plain: split
    // wrongly, `git push 2> >(cat) --no-verify` lost the `--no-verify` it carries.
    if ((c === '<' || c === '>') && src[i + 1] === '(') {
      const end = balanced(i + 1, '(', ')')
      if (end < 0) { complete = false; word = null; command = fresh(); break }
      command.substitutions.push(src.slice(i + 2, end))
      startWord()
      word.dynamic = true
      word.code = true
      for (const ch of src.slice(i, end + 1)) push(ch, false)
      i = end
      continue
    }
    if (REDIRECT.has(c) || (c === '&' && src[i + 1] === '>')) {
      if (!redirection()) { complete = false; word = null; command = fresh(); break }
      continue
    }
    if (OPERATOR.has(c)) {
      let op = c
      if ((c === '&' || c === '|' || c === ';') && src[i + 1] === c) op += src[++i]
      else if (c === '|' && src[i + 1] === '&') op += src[++i]
      endCommand(op)
      if (c === '\n' && pending.length) { i++; readHeredocs(); i-- }
      continue
    }
    if (BLANK.has(c)) { endWord(); continue }
    push(c, false)
  }
  if (complete) {
    endCommand('')
    if (pending.length) { complete = false; readHeredocs() }
  }
  return { commands, complete }
}

// The command substitutions an expression runs. Inside `${…}`, `$((…))` and `((…))`
// the text around them is not a command — reading it as one took `<<` for a heredoc —
// but a `$(…)` or a backtick in it runs. In a heredoc body (`quotes` false) a single
// quote is a plain character, so it hides nothing.
function substitutionsIn(text, quotes = true) {
  const found = []
  for (let k = 0; k < text.length; k++) {
    const c = text[k]
    if (c === '\\') { k++; continue }
    if (quotes && c === "'") {
      const end = text.indexOf("'", k + 1)
      if (end < 0) break
      k = end
    } else if (c === '`') {
      let end = k + 1
      while (end < text.length && text[end] !== '`') end += text[end] === '\\' ? 2 : 1
      if (end >= text.length) break
      found.push(text.slice(k + 1, end))
      k = end
    } else if (c === '$' && (text[k + 1] === '(' || text[k + 1] === '{')) {
      const open = text[k + 1]
      const end = closing(text, k + 1, open, open === '(' ? ')' : '}')
      if (end < 0) break
      const inner = text.slice(k + 2, end)
      if (open === '(' && !inner.startsWith('(')) found.push(inner)
      else found.push(...substitutionsIn(open === '(' ? inner.slice(1, -1) : inner))
      k = end
    }
  }
  return found
}

// The index of the bracket closing the one at `k` in `text`, honouring quotes; -1 if none.
function closing(text, k, open, close) {
  let depth = 0
  for (let e = k; e < text.length; e++) {
    const c = text[e]
    if (c === '\\') { e++; continue }
    if (c === "'" || c === '"') {
      const q = c
      e++
      while (e < text.length && text[e] !== q) { if (q === '"' && text[e] === '\\') e++; e++ }
      if (e >= text.length) return -1
      continue
    }
    if (c === open) depth++
    else if (c === close && --depth === 0) return e
  }
  return -1
}

// `NAME=` with the name and the `=` unquoted.
function isAssignment(chars) {
  const eq = chars.findIndex(x => x.c === '=')
  if (eq < 1) return false
  const name = chars.slice(0, eq)
  return name.every(x => !x.q) && !chars[eq].q && /^[A-Za-z_]\w*$/.test(name.map(x => x.c).join(''))
}

function finish(command) {
  const dynamic = command.dynamic.flatMap((d, k) => (d ? [k] : []))
  return { ...command, dynamic }
}

// Brace expansion of one word, over its unquoted characters, as bash does it:
// `a{b,c}d` → `abd acd`, nested and left to right; `{a}` and a quoted brace stay.
function braces(chars) {
  for (let s = 0; s < chars.length; s++) {
    if (chars[s].q || chars[s].c !== '{') continue
    let depth = 0
    const commas = []
    let e = -1
    for (let k = s; k < chars.length; k++) {
      const x = chars[k]
      if (x.q) continue
      if (x.c === '{') depth++
      else if (x.c === '}' && --depth === 0) { e = k; break }
      else if (x.c === ',' && depth === 1) commas.push(k)
    }
    if (e < 0 || commas.length === 0) continue
    const cuts = [s, ...commas, e]
    const out = []
    for (let n = 0; n + 1 < cuts.length; n++) {
      out.push(...braces([...chars.slice(0, s), ...chars.slice(cuts[n] + 1, cuts[n + 1]), ...chars.slice(e + 1)]))
    }
    return out
  }
  return [chars]
}
