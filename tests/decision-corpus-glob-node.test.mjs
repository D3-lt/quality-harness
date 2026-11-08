// BACKLOG §442: globToRegExp (plugin/scripts/decision-corpus.mjs) turned each `*` into `[^/]*`, so a Governs declaration of ten
// `*a` and a `b` against a sixty-character path took C(60,10) = 75,394,027,566 regex steps, and the adr-context CLI, adr-state,
// work-next and corpus-probe hung on it (the Codex review of 8d872045..b27d665a). The core already matched globs in one pass
// (dcGlobMatch, TestDecisionCorpusGlobIsLinear); Node now does the same. The match runs in a child under a deadline, since the
// defect is a hang: the budget is a hang guard, generous on purpose (CLAUDE.md §7).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { pathMatchesDeclaration } from '../plugin/scripts/decision-corpus.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const module = pathToFileURL(path.join(repoRoot, 'plugin', 'scripts', 'decision-corpus.mjs')).href

test('a short glob with many stars is matched in one pass, not by retrying every split', () => {
  const probe = `import { pathMatchesDeclaration } from ${JSON.stringify(module)}
    process.stdout.write(JSON.stringify([
      pathMatchesDeclaration('a'.repeat(60), '*a'.repeat(10) + 'b'),
      pathMatchesDeclaration('a'.repeat(59) + 'b', '*a'.repeat(10) + 'b'),
    ]))`
  const ran = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(ran.status, 0, `the match did not finish within 30 s (signal ${ran.signal}): ${ran.stderr}`)
  assert.deepEqual(JSON.parse(ran.stdout), [false, true])
})

test('the one-pass match keeps what the regular expression matched', () => {
  const rows = [
    ['src/a.js', 'src/*.js', true], ['src/sub/a.js', 'src/*.js', false], ['src/sub/a.js', 'src/**/*.js', true],
    ['src/a.js', 'src/**/*.js', true], ['src/a.js', 'src/**', true], ['SRC/A.JS', 'src/*.js', true],
    ['src/ab.js', 'src/a?.js', true], ['src/a/.js', 'src/a?.js', false], ['src/a\nb', 'src/**', false],
    ['src/a\nb', 'src/*', true], ['docs/x.md', 'docs\\*.md', true], ['docs/x.md', './docs/*.md', true],
    ['docs/x.md', 'docs/*.txt', false], ['a.b', 'a?b', true], ['axb', 'a.b', false],
    // Case folds as a non-unicode `/i` does: U+017F and U+212A stay themselves, é and É fold together.
    ['xſ', '?S', false], ['xK', '?k', false], ['xk', '?K', false], ['xé', '?É', true],
  ]
  for (const [file, glob, expected] of rows) assert.equal(pathMatchesDeclaration(file, glob), expected, `${JSON.stringify(file)} against ${glob}`)
})
