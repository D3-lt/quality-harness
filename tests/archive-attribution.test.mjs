// adr-retire-check's archive attribution, held to what the archive holds. A gpt-6.1-sol review of
// ADR-092's execution (2026-10-07) found a record's obligations given to a number its frontmatter's YAML
// comment named, where nothing checked them (finding 5), and every flat record's seal walking and
// re-reading the whole archive (finding 15). In a directory this file made (CLAUDE.md §9).
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { runPython } from '../scripts/python-interpreter.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const retireCheck = join(repoRoot, 'plugin', 'bin', 'adr-retire-check')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'qh-archive-attribution-'))
  temps.push(dir)
  for (const [path, text] of Object.entries(files)) {
    const at = join(dir, ...path.split('/'))
    mkdirSync(dirname(at), { recursive: true })
    writeFileSync(at, text)
  }
  return dir
}

// adr-retire-check's module asked one expression, with `module` and `Path` in scope.
const CALL = [
  'import importlib.machinery, importlib.util, json, sys',
  'from pathlib import Path',
  "loader = importlib.machinery.SourceFileLoader('adr_retire_check', sys.argv[1])",
  "module = importlib.util.module_from_spec(importlib.util.spec_from_loader('adr_retire_check', loader))",
  'loader.exec_module(module)',
  'print(json.dumps(eval(sys.stdin.buffer.read().decode("utf-8"), {"module": module, "Path": Path})))',
].join('\n')
function call(expression, cwd) {
  const r = runPython(['-c', CALL, retireCheck], { cwd, input: expression, encoding: 'utf8', timeout: 120_000 })
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout)
}
const gate = (cwd, readme) => runPython([retireCheck, readme], { cwd, encoding: 'utf8', timeout: 120_000 })
const ARCHIVE_HEAD = ['# Archive', '', '**Lifecycle:** Frozen historical ADR records', '**Active corpus:** ../adr', '',
  '## Retired Records', '', '| ADR | Title | Decision effect | Retired | Reason | Obligations | SHA-256 |',
  '|-----|-------|-----------------|---------|--------|-------------|---------|']
const row = (id, link, digest, obligations = 'none') => `| [${id}](${link}) | X | withdrawn | 2026-10-07 | superseded in practice | ${obligations} | ${digest} |`

test('a record\'s obligations are its own, whatever its frontmatter comment names, and none goes unchecked', () => {
  const record = '---\n# ADR-999: a YAML comment\nstatus: withdrawn\n---\n# ADR-040: real\n\n## Decision\n\nx\n\n## Follow-ups\n\n- [ ] an obligation nobody received\n'
  const dir = tree({ 'docs/adr/README.md': '# Decisions\n', 'docs/adr-archive/ADR-040-x.md': record })
  const archive = 'docs/adr-archive'
  const known = 'frozenset({"ADR-040"})'
  assert.deepStrictEqual(call(`dict(module.meaningful_obligations(Path("${archive}"), ${known}, module.adr_files(Path("${archive}"))))`, dir), { 'ADR-040': 1 })
  const digest = call(`module.decision_unit_digest(Path("${archive}"), "ADR-040", Path("${archive}/ADR-040-x.md"), ${known})`, dir)
  writeFileSync(join(dir, ...archive.split('/'), 'README.md'), [...ARCHIVE_HEAD, row('ADR-040', 'ADR-040-x.md', digest), ''].join('\n'))
  const owned = gate(dir, `${archive}/README.md`)
  assert.equal(owned.status, 1, owned.stdout + owned.stderr)
  assert.match(owned.stdout, /ADR-040: 1 obligation\(s\) need an active backlog receipt or disposition/)
  // An obligation attributed to a record the catalog does not list is checked too: it fails, named.
  writeFileSync(join(dir, ...archive.split('/'), 'notes.md'), 'ADR-777 notes\n\n## Follow-ups\n\n- [ ] a stray obligation\n')
  const stray = gate(dir, `${archive}/README.md`)
  assert.equal(stray.status, 1, stray.stdout + stray.stderr)
  assert.match(stray.stdout, /ADR-777: 1 archived obligation\(s\) belong to no record the archive catalog lists/)
})

test('a flat archive is attributed once per check, not once per record', () => {
  // Every flat record's seal walked the archive and read every file again: N records, N² reads.
  const reads = n => {
    const files = { 'docs/adr/README.md': '# Decisions\n' }
    for (let i = 1; i <= n; i++) {
      const id = `ADR-${String(i).padStart(3, '0')}`
      files[`archive/${id}-x.md`] = `# ${id}: X\n\n**Status:** Withdrawn\n\n## Decision\n\nx\n`
    }
    const dir = tree(files)
    return call(`(lambda counted, original: (setattr(module, "read_regular", lambda path: (counted.append(path), original(path))[1]),
      [module.decision_unit_digest(Path("archive"), f"ADR-{i:03d}", Path(f"archive/ADR-{i:03d}-x.md")) for i in range(1, ${n} + 1)],
      len(counted))[2])([], module.read_regular)`, dir)
  }
  const [eight, sixteen] = [reads(8), reads(16)]
  assert.ok(sixteen <= 2.5 * eight, `twice the records cost ${sixteen} reads against ${eight}`)
  assert.equal(eight, 8)
})
