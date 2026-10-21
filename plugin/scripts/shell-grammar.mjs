// ADR-120 T1 (Decision 1): the grammar a declared check is read through. shell-words.mjs lexes text into simple commands and
// now records where a `{ }` group, a `( )` subshell or a POSIX `NAME() { }` definition opens and closes; this module reads
// those records as lists, pipelines and compound commands, in the shape POSIX gives them:
//
//   list     := andor ( (';' | '&' | newline) andor )*
//   andor    := pipeline ( ('&&' | '||') pipeline )*
//   pipeline := '!'* stage ( ('|' | '|&') stage )*
//   stage    := a simple command | '{' list '}' | '(' list ')' | NAME '(' ')' '{' list '}'
//
// It is a structure and nothing more: what a command's exit status is lives in check-command.mjs, which walks this tree.
// The answer is null, never a guess, for text it does not read: the `function` keyword (bash and zsh only, a syntax error under
// dash, which /bin/sh is on Debian and Ubuntu), anything unclosed, a redirected group, a body that is not a group, a stray close.
//
// A node is `{ t, i, bang, name, kids, ops }` with every key present, so the Go twin (core/hooks/shellgrammar.go) is compared
// to it as JSON: `cmd` names its record by `i`; `pipe` holds its stages in `kids` and the count of its leading `!` in `bang`;
// `andor` holds its pipelines with the `&&`/`||` between them in `ops`; `list` holds its and-or lists with the `;` or `&`
// that follows each in `ops`; `group`, `sub` and `def` (named by `name`) hold their body, a `list`, in `kids[0]`.

const FAIL = Symbol('not a grammar this reads')
const node = (t, props) => ({ t, i: -1, bang: 0, name: '', kids: [], ops: [], ...props })

// The records as a flat run of events: a construct opening, a simple command, a construct closing. A definition's head record
// (`f` of `f()`) is not a command: the definition that follows it names it.
function flatten(commands) {
  const events = []
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i]
    for (const o of c.opens) events.push({ e: 'open', o })
    if (c.defines) {
      const o = commands[i + 1]?.opens[0]
      // A `!` before the head (`! f() { :; }`) negates the definition's status, which the tree cannot carry: not read.
      if (c.closes.length || c.bangs || !o || o.kind !== 'definition' || o.name !== c.defines) return null
      continue
    }
    events.push({ e: 'cmd', i })
    for (const close of c.closes) events.push({ e: 'close', close })
  }
  return events
}

/**
 * `parseShell(words)` → the tree of `shellWords(text)`'s result, or null when the text is not one this grammar reads.
 */
export function parseShell(words) {
  if (!words?.complete || !words.closed || !words.commands.length) return null
  const { commands } = words
  const events = flatten(commands)
  if (!events?.length) return null
  let pos = 0

  // The operator after the element just consumed. At the end of a list only a terminator may follow it (`&` backgrounds it);
  // anywhere else it is the operator that joins the next element.
  function after(el) {
    const raw = el.e === 'cmd' ? commands[el.i].terminator : el.close.joiner
    if (pos >= events.length || events[pos].e === 'close') {
      if (raw === '&') return '&'
      if ([';', '\n', ')', ''].includes(raw)) return 'end'
      throw FAIL
    }
    if (['&&', '||', '|', '|&', ';', '&'].includes(raw)) return raw
    if (raw === '\n') return ';'
    throw FAIL
  }

  function stage() {
    const el = events[pos]
    if (el?.e === 'cmd') {
      pos++
      return { node: node('cmd', { i: el.i }), bang: commands[el.i].bangs, sep: after(el) }
    }
    if (el?.e === 'open') {
      pos++
      const body = list()
      const close = events[pos]
      if (close?.e !== 'close' || close.close.kind !== el.o.kind) throw FAIL
      pos++
      const t = el.o.kind === 'subshell' ? 'sub' : el.o.kind === 'group' ? 'group' : 'def'
      return { node: node(t, { name: el.o.name, kids: [body] }), bang: el.o.bangs, sep: after(close) }
    }
    throw FAIL
  }

  function pipeline() {
    const first = stage()
    const kids = [first.node]
    let sep = first.sep
    while (sep === '|' || sep === '|&') {
      const next = stage()
      if (next.bang) throw FAIL
      kids.push(next.node)
      sep = next.sep
    }
    const bang = Math.min(first.bang, 2)
    if (kids.some(k => k.t === 'def') && (kids.length > 1 || bang)) throw FAIL
    return { node: node('pipe', { bang, kids }), sep }
  }

  function andor() {
    const first = pipeline()
    const kids = [first.node]
    const ops = []
    let sep = first.sep
    while (sep === '&&' || sep === '||') {
      ops.push(sep)
      const next = pipeline()
      kids.push(next.node)
      sep = next.sep
    }
    return { node: node('andor', { kids, ops }), sep }
  }

  function list() {
    const kids = []
    const ops = []
    for (;;) {
      const item = andor()
      kids.push(item.node)
      if (item.sep === '&') ops.push('&')
      else if (item.sep === ';' || item.sep === 'end') ops.push(';')
      else throw FAIL
      if (item.sep === 'end' || pos >= events.length || events[pos].e === 'close') break
    }
    return node('list', { kids, ops })
  }

  try {
    const tree = list()
    return pos === events.length ? tree : null
  } catch (error) {
    if (error === FAIL) return null
    throw error
  }
}
