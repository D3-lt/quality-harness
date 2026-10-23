#!/usr/bin/env node
// orphan-sweep.mjs — which functions does the plugin DEFINE that nothing SHIPPED calls?
//
// BACKLOG §99. ADR-020 T1 shipped `implausibly_fast` defined, asserted three times
// and called from nothing (issue #6). Every gate said it shipped correctly: the
// Acceptance fence called the predicate directly and the mutation was killed by
// those direct assertions whether or not production invoked it. A mutant proves a
// test NOTICES a change; it never proves the subject is REACHED.
//
// ⚠ THE SCOPE IS THE WHOLE POINT, and getting it wrong makes this report clean
// over a corpus that contains the defect. The first version of this sweep counted
// uses across every tracked file and found NOTHING at dcb7df4 — because
// `implausibly_fast` appears three times in tests/ and twice in an ADR. Tests and
// records do not make a function reachable; that is the entire defect §99 names.
// So the corpus here is `plugin/**` plus README.md — what a user downloads — and
// nothing else.
//
// ⚠ BARE-IDENTIFIER SCAN, never `name(`. The first sweep in §99's own history
// matched `\bname\(` and reported `expandExistingGlob` as an orphan: it is called
// through the spread operator, `...expandExistingGlob(`, and a naive lookbehind
// read the `.` as property access. A check that reports an observation it did not
// make is CLAUDE.md §3's defect. Counting bare identifiers also means a name
// reached through a STRING — a dispatch table, a config key — counts as reached,
// which is correct and is why no exemption list is needed.
//
// THERE IS DELIBERATELY NO ALLOWLIST. §99 worried that a legitimately-uncalled
// function (`main`, a dispatch-table arm) would force an exemption mechanism, and
// that "a name added to silence a red run is indistinguishable from a name that
// belongs there". Measured 2026-09-02: with the scope above, HEAD reports 0 of 440
// with no exemptions at all — `main` appears 72 times in the shipped tree, and the
// `_go_*` helpers are called directly. So the answer to a future legitimate orphan
// is to delete it or make it reachable, never to add a line to a list that rots.
//
// Usage:
//   node scripts/orphan-sweep.mjs [<rev>]     # defaults to HEAD; any rev works
//
// Exit codes:
//   0  no orphans
//   1  at least one definition is unreachable from the shipped tree
//   2  could not look (git unavailable, rev unknown)
import { execFileSync, spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMainModule } from '../plugin/scripts/main-module.mjs'

// ⚠ A BINDING IS A DEFINITION TOO, and the first cut counted only `def` and
// `function`. Measured 2026-09-27: it reported 0 of 726 at 826ec94 while that tree
// shipped four `const` bindings only tests read (an exported test oracle, two
// `__…ForTest` aliases, a recorded interpreter version) and a module-level regex in
// `plugin/lib/record.py` kept only as a mutant's restore target. `SHIPPED` matched no
// `.py` at all, so `plugin/lib/` was never read. Top-level only: a nested binding is
// its enclosing function's business.
const PY_DEF = /^(?:def\s+([a-z_][a-z0-9_]*)\s*\(|class\s+([A-Za-z_]\w*)|([A-Za-z_]\w*)\s*=(?!=))/gm
const JS_DEF = /^(?:export\s+)?(?:(?:async\s+)?function\*?\s+([A-Za-z_]\w*)|(?:const|let|var)\s+([A-Za-z_]\w*)\s*=)/gm
// What a user downloads: `.claude-plugin/marketplace.json` declares `"source":
// "./plugin"`, so this is the reachability universe (CLAUDE.md §1).
export const SHIPPED = f => (f.startsWith('plugin/') || f === 'README.md')
  && (/\.(mjs|js|py|sh|json|md|cmd)$/.test(f) || /^plugin\/bin\/[a-z-]+$/.test(f))

/**
 * Definitions in `files` whose bare identifier appears nowhere else in `uses`.
 *
 * Pure over in-memory {path: source} maps so the test can drive it on fixtures
 * and on real history without a checkout. A definition counts as reached at two
 * or more occurrences: one is its own `def`/`function` line. `uses` is the text
 * the occurrences are counted in; `main` passes it with every comment blanked.
 */
export function orphanDefinitions(files, uses = files) {
  const counted = new Map()
  for (const source of Object.values(uses)) {
    for (const m of source.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
      counted.set(m[0], (counted.get(m[0]) ?? 0) + 1)
    }
  }
  const found = []
  let defined = 0
  for (const [path, source] of Object.entries(files)) {
    const isPy = /^plugin\/bin\/[a-z-]+$/.test(path) || path.endsWith('.py')
    const isJs = path.endsWith('.mjs') || path.endsWith('.js')
    if (!isPy && !isJs) continue
    for (const m of source.matchAll(isPy ? PY_DEF : JS_DEF)) {
      const name = m[1] ?? m[2] ?? m[3]
      // A dunder is the interpreter's (`__all__`, `__version__`), not a definition.
      if (/^__\w+__$/.test(name)) continue
      defined += 1
      if ((counted.get(name) ?? 0) <= 1) found.push({ path, name })
    }
  }
  return { orphans: found, defined }
}

// ⚠ A COMMENT IS NOT A CALL (2026-10-23). `admitSync` shipped in lease.mjs called only by repository tooling, and this sweep
// counted it reached because its own doc comment named it; `DURATION_REQUIRED_FROM`, an orphan this file's own test names at
// 1a6693a, was hidden the same way by a comment in trajectory-metrics.mjs. Comments are blanked by real lexers: record.py's
// `js_reading` for JavaScript (a `/*` inside a regex literal is not a comment), Python's `tokenize`, and a scan of shell that
// tracks quotes and here-documents. Definitions and uses are both read from the blanked text, so a commented example is
// neither. A file a lexer could not read to its end is named, and the sweep could not look (the Codex review of
// v3.8.53..42a903a8: keeping its raw text let an unread comment count as a use, and the sweep reported clean).
const PLUGIN_LIB = join(dirname(dirname(fileURLToPath(import.meta.url))), 'plugin', 'lib')
const BLANK_COMMENTS = String.raw`
import io, json, re, sys, tokenize
sys.path.insert(0, sys.argv[1])
from record import js_reading

def blank(text, spans):
    chars = list(text)
    for start, end in spans:
        for i in range(start, end):
            if chars[i] != "\n":
                chars[i] = " "
    return "".join(chars)

def python_comments(text):
    starts = [0]
    for line in io.StringIO(text).readlines():
        starts.append(starts[-1] + len(line))
    spans = []
    for token in tokenize.generate_tokens(io.StringIO(text).readline):
        if token.type == tokenize.COMMENT:
            (row, col), (end_row, end_col) = token.start, token.end
            spans.append((starts[row - 1] + col, starts[end_row - 1] + end_col))
    return spans

HEREDOC = re.compile(r"<<(-?)[ \t]*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\2")
WORD_BREAK = " \t\n;|&()<>"

def shell_comments(text):
    """Comment spans, and whether the scan reached the end with no quote, parenthesis or here-document still open.

    A stack of contexts: shell code, a single or a double quote, a parenthesis (a subshell or a $( substitution), and a
    backquoted substitution. Inside double quotes a $( is shell code again until its ), and a backquote until the next one, so a
    comment there is a comment (the verification review of the fix round: a comment in "$(...)" counted as a use; the review of
    620c6160..13dfefe1: so did one in a backquoted substitution inside double quotes)."""
    tick = "\x60"
    spans, pending, stack, i, n = [], [], ["code"], 0, len(text)
    while i < n:
        c, mode = text[i], stack[-1]
        if mode == "'":
            if c == "'":
                stack.pop()
        elif mode == '"':
            if c == "\\":
                i += 1
            elif c == '"':
                stack.pop()
            elif c == tick:
                stack.append(tick)
            elif text.startswith("$(", i):
                stack.append("(")
                i += 2
                continue
        elif c == "\\":
            i += 1
        elif c == tick and mode == tick:
            stack.pop()
        elif c == tick:
            stack.append(tick)
        elif c in "'\"":
            stack.append(c)
        elif c == "(":
            stack.append("(")
        elif c == ")" and mode == "(":
            stack.pop()
        elif c == "#" and (i == 0 or text[i - 1] in WORD_BREAK):
            end = text.find("\n", i)
            end = n if end < 0 else end
            spans.append((i, end))
            i = end
            continue
        elif text.startswith("<<", i) and not text.startswith("<<<", i):
            found = HEREDOC.match(text, i)
            if found:
                pending.append((found.group(3), found.group(1) == "-"))
                i = found.end()
                continue
        if c == "\n" and pending and mode in ("code", "(", tick):
            i += 1
            while pending and i < n:
                end = text.find("\n", i)
                line = text[i:n if end < 0 else end]
                word, strip = pending[0]
                if (line.lstrip("\t") if strip else line) == word:
                    pending.pop(0)
                i = n if end < 0 else end + 1
            continue
        i += 1
    return spans, stack == ["code"] and not pending

out, incomplete = {}, {}
for path, text in json.load(sys.stdin).items():
    try:
        if path.endswith((".mjs", ".js")):
            _masked, kinds, complete = js_reading(text, path[path.rindex("."):])
            if not complete:
                incomplete[path] = "the JavaScript lexer stopped before the end"
            out[path] = "".join(" " if kind == 2 and ch != "\n" else ch for ch, kind in zip(text, kinds))
        elif path.endswith(".sh"):
            spans, complete = shell_comments(text)
            if not complete:
                incomplete[path] = "a quote or a here-document is still open at the end"
            out[path] = blank(text, spans)
        elif path.endswith(".py") or re.fullmatch(r"plugin/bin/[a-z-]+", path):
            out[path] = blank(text, python_comments(text))
        else:
            out[path] = text
    except Exception as error:
        incomplete[path] = f"{type(error).__name__}: {error}"
        out[path] = text
json.dump({"code": out, "incomplete": incomplete}, sys.stdout)
`

/**
 * `files` with every comment blanked, as `{ code, incomplete }` (`incomplete` names each file a lexer could not read to its
 * end, with why), or null when the lexers could not be asked.
 */
export function withoutComments(files, python = process.env.QUALITY_HARNESS_PYTHON || 'python3') {
  const run = spawnSync(python, ['-I', '-c', BLANK_COMMENTS, PLUGIN_LIB], {
    input: JSON.stringify(files), encoding: 'utf8', maxBuffer: 1 << 28, timeout: 300_000, windowsHide: true,
  })
  if (run.error || run.status !== 0) return null
  try {
    const answer = JSON.parse(run.stdout)
    return answer && typeof answer.code === 'object' && typeof answer.incomplete === 'object' ? answer : null
  } catch { return null }
}

/**
 * The sweep the CLI runs, over `files`: `{ orphans, defined, incomplete }` read from the blanked text, or null when the
 * lexers could not be asked. A non-empty `incomplete` means the sweep could not look at those files.
 */
export function sweep(files) {
  const blanked = withoutComments(files)
  if (blanked === null) return null
  return { ...orphanDefinitions(blanked.code), incomplete: Object.entries(blanked.incomplete) }
}

/** The shipped tree at `rev`, as {path: source}. Throws only when git cannot answer. */
function shippedTreeAt(rev) {
  const names = execFileSync('git', ['ls-tree', '-r', '--name-only', rev], {
    encoding: 'utf8', maxBuffer: 1 << 28, timeout: 60_000,
  }).split('\n').filter(Boolean).filter(SHIPPED)
  const files = {}
  const unreadable = []
  for (const path of names) {
    try {
      files[path] = execFileSync('git', ['show', `${rev}:${path}`], {
        encoding: 'utf8', maxBuffer: 1 << 28, timeout: 60_000,
      })
    } catch { unreadable.push(path) }
  }
  return { files, unreadable }
}

function main(argv) {
  const rev = argv[0] || 'HEAD'
  let files
  let unreadable
  try {
    ;({ files, unreadable } = shippedTreeAt(rev))
  } catch (error) {
    console.error(`orphan-sweep: could not read ${rev} — ${error.message.split('\n')[0]}`)
    return 2
  }
  // A listed file git cannot show is a file the sweep did not read: its definitions are unchecked and the calls it
  // makes are unseen, so a clean answer over the rest would be a claim about files nobody looked at (CLAUDE.md §3).
  if (unreadable.length) {
    console.error(`orphan-sweep: ${rev} lists files git could not show — could not read ${unreadable.length} listed file(s), first ${unreadable[0]} — could not look`)
    return 2
  }
  // An empty universe is not a clean one (CLAUDE.md §3). Without this the sweep
  // reports "0 orphans" for a rev whose paths it failed to match, at full coverage.
  if (Object.keys(files).length === 0) {
    console.error(`orphan-sweep: ${rev} has no shipped files matching the scope — could not look`)
    return 2
  }
  const swept = sweep(files)
  if (swept === null) {
    console.error(`orphan-sweep: the comment lexers (python3 with plugin/lib/record.py) could not be run over ${rev} — could not look`)
    return 2
  }
  if (swept.incomplete.length) {
    const [path, why] = swept.incomplete[0]
    console.error(`orphan-sweep: ${swept.incomplete.length} file(s) at ${rev} could not be read to their end, first ${path} (${why}) — could not look`)
    return 2
  }
  const { orphans, defined } = swept
  // Files with no definition in them are as empty a universe as no files: "0 of 0" is not a clean sweep.
  if (defined === 0) {
    console.error(`orphan-sweep: ${rev} has shipped files but none holds a definition this sweep can see (functions, Python classes, const/let/var bindings) — could not look`)
    return 2
  }
  for (const { path, name } of orphans) console.log(`  ${path}: ${name}`)
  console.log(`${rev}: ${orphans.length} orphan(s) of ${defined} definitions`)
  if (orphans.length) {
    console.log('A definition nothing shipped calls is either dead or unwired. Delete it, or wire it '
      + '— there is deliberately no allowlist (BACKLOG §99).')
  }
  return orphans.length ? 1 : 0
}

// Importable without side effects — tests/package.test.mjs::importing a script
// runs its CLI on nobody asserts this across every script here.
if (isMainModule(import.meta.url)) {
  process.exit(main(process.argv.slice(2)))
}
