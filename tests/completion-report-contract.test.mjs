import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reference = path.posix.join('plugin', 'skills', 'work', 'references', 'completion-proof.md')
const producers = [
  ['work', 'Completion report'],
  ['execution', 'Return'],
  ['adr-execute', 'Completion Report'],
].map(([skill, heading]) => ({ file: path.posix.join('plugin', 'skills', skill, 'SKILL.md'), heading }))

function selectedLinks(source, heading) {
  const visible = source.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, '')
    .replace(/`[^`\r\n]*`/g, '')
  const section = visible.split(`\n## ${heading}\n`)[1]?.split('\n## ')[0] ?? ''
  return [...section.matchAll(/^Read and apply \[completion proof\]\(([^)\r\n]+)\)/gm)].map(match => match[1])
}

function findings(sources) {
  const result = []
  if (!sources.get(reference)?.trim()) result.push('shared completion reference is missing or empty')
  for (const { file, heading } of producers) {
    const links = selectedLinks(sources.get(file) ?? '', heading)
    if (links.length !== 1) {
      result.push(`${file}: completion section must select the reference once`)
      continue
    }
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), links[0].replaceAll('\\', '/')))
    if (target !== reference) result.push(`${file}: selected target is not the shared completion reference`)
  }
  return result
}

function actualSources() {
  const sources = new Map()
  for (const file of [reference, ...producers.map(producer => producer.file)]) {
    try { sources.set(file, readFileSync(path.join(repoRoot, file), 'utf8')) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  return sources
}

test('completion producers select the shared reference through their real completion sections', () => {
  const sources = actualSources()
  assert.deepEqual(findings(sources), [])
  for (const { file, heading } of producers) {
    const source = sources.get(file)
    const selector = source.split('\n').find(line => line.startsWith('Read and apply [completion proof]('))
    assert.ok(selector, file)
    const removed = source.replace(selector, '')
    for (const changed of [
      removed,
      source.replace(selectedLinks(source, heading)[0], 'missing.md'),
      `${selector}\n${removed}`,
      source.replace(selector, `\`\`\`markdown\n${selector}\n\`\`\``),
      source.replace(selector, `<!-- ${selector} -->`),
      source.replace(selector, `\`${selector}\``),
    ]) {
      const broken = new Map(sources).set(file, changed)
      assert.ok(findings(broken).some(finding => finding.startsWith(file + ':')), file)
    }
    const backslashes = new Map(sources).set(file, source.replace(selectedLinks(source, heading)[0], selectedLinks(source, heading)[0].replaceAll('/', '\\')))
    assert.deepEqual(findings(backslashes), [])
  }
  const missing = new Map(sources)
  missing.delete(reference)
  assert.deepEqual(findings(missing), ['shared completion reference is missing or empty'])
})

test('the release packager admits the selected shared completion reference', () => {
  const sources = actualSources()
  assert.ok(sources.get(reference)?.trim(), 'the shared reference must exist before packaging')
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'qh-completion-package-'))
  try {
    const files = Object.fromEntries([...sources].map(([file, text]) => [path.posix.relative('plugin', file), text]))
    files[path.posix.join('.claude-plugin', 'plugin.json')] = readFileSync(path.join(repoRoot, 'plugin', '.claude-plugin', 'plugin.json'), 'utf8')
    const code = `import io, json, pathlib, runpy, sys, tarfile, zipfile
bundle = runpy.run_path(sys.argv[1])["bundle"]
files = json.load(sys.stdin)
with tarfile.open("source.tar", "w") as archive:
    for name, text in files.items():
        content = text.encode("utf-8")
        member = tarfile.TarInfo(name)
        member.size = len(content)
        member.mode = 0o644
        archive.addfile(member, io.BytesIO(content))
pathlib.Path("assets").mkdir()
bundle("build", "source.tar", "assets", "plugin.zip")
reference = "skills/work/references/completion-proof.md"
with zipfile.ZipFile("plugin.zip") as archive:
    result = {"names": archive.namelist(), "reference": archive.read(reference).decode("utf-8")}
    with zipfile.ZipFile("broken.zip", "w") as broken:
        for member in archive.infolist():
            if member.filename != reference:
                broken.writestr(member, archive.read(member.filename))
try:
    bundle("verify", "source.tar", "assets", "broken.zip")
except ValueError:
    result["missingReferenceRejected"] = True
else:
    result["missingReferenceRejected"] = False
print(json.dumps(result))
`
    const run = spawnSync('python3', ['-c', code, path.join(repoRoot, 'scripts', 'plugin-bundle.py')], {
      cwd: fixture, input: JSON.stringify(files), encoding: 'utf8', timeout: 30_000, windowsHide: true,
    })
    assert.equal(run.status, 0, run.stderr || run.error?.message)
    const packed = JSON.parse(run.stdout)
    assert.ok(packed.names.includes(path.posix.relative('plugin', reference)))
    assert.equal(packed.reference, sources.get(reference))
    assert.equal(packed.missingReferenceRejected, true)
  } finally { remove(fixture) }
})
