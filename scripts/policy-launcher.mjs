#!/usr/bin/env node
// ADR-131 launcher-protocol v2: same binary/trace, one differing shell launcher.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readerFingerprint } from '../plugin/scripts/corpus-probe.mjs'
import { nativeSourceIdentity } from './native-source.mjs'
import { sampleLoad } from '../plugin/scripts/load.mjs'
import { isMainModule } from '../plugin/scripts/main-module.mjs'
import { replay } from './policy-replay.mjs'

const plugin = fileURLToPath(new URL('../plugin/', import.meta.url))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function files(directory, prefix = '') {
  return readdirSync(path.join(directory, prefix), { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('.') || entry.name === '__pycache__' || entry.name.endsWith('.pyc')) return []
    const name = prefix ? prefix + '/' + entry.name : entry.name
    return entry.isDirectory() ? files(directory, name) : entry.isFile() ? [name] : []
  })
}
export function prepareLauncherComparison(root) {
  root = path.resolve(root)
  const locations = ['L0', 'L1'].map(name => path.join(root, 'launcher-' + name))
  assert.ok(locations.every(dir => !existsSync(dir)), 'keep the original snapshots; use a fresh experiment root for changed code')
  for (const dir of locations) cpSync(plugin, path.join(dir, 'plugin'), { recursive: true })
  copyFileSync(path.join(root, 'control-C', 'plugin', 'scripts', 'qh-hook.sh'), path.join(locations[0], 'plugin', 'scripts', 'qh-hook.sh'))
  const sets = locations.map(dir => new Map(files(path.join(dir, 'plugin')).map(name => [name, hash(readFileSync(path.join(dir, 'plugin', name)))])))
  const differences = [...new Set([...sets[0].keys(), ...sets[1].keys()])].filter(name => sets[0].get(name) !== sets[1].get(name))
  assert.deepEqual(differences, ['scripts/qh-hook.sh'])
  const identity = { protocol: 'ADR-131-launcher-v2', onlyDifference: differences,
    binarySha256: hash(readFileSync(path.join(root, 'candidate-D'))),
    nativeSources: nativeSourceIdentity(path.dirname(plugin)).sources,
    readers: locations.map(dir => readerFingerprint(path.join(dir, 'plugin')).sha256) }
  writeFileSync(path.join(root, 'launcher-inputs.json'), JSON.stringify(identity, null, 2) + '\n')
  return identity
}

export async function runLauncherPair(root, index) {
  root = path.resolve(root)
  assert.ok(Number.isInteger(index) && index >= 0 && index < 5)
  const identity = JSON.parse(readFileSync(path.join(root, 'launcher-inputs.json'), 'utf8'))
  assert.equal(hash(readFileSync(path.join(root, 'candidate-D'))), identity.binarySha256)
  const directory = mkdtempSync(path.join(root, 'launcher-pair-' + index + '-'))
  const deadline = Date.now() + 10 * 60_000, reports = []
  for (const corpus of ['governed', 'empty']) for (const label of (index % 2 ? ['L1', 'L0'] : ['L0', 'L1'])) {
    const start = sampleLoad()
    assert.ok(Date.now() < deadline && start.load !== null && start.cores !== null && start.load <= start.cores, 'machine is not known quiet or block deadline expired')
    const source = path.join(root, 'launcher-' + label, 'plugin')
    assert.equal(readerFingerprint(source).sha256, identity.readers[Number(label[1])], 'launcher snapshot changed')
    const report = await replay({ plugin: source, binary: path.join(root, 'candidate-D'), observe: false,
      directory: path.join(directory, corpus + '-' + label), governed: corpus === 'governed', label: 'D' })
    reports.push({ ...report, launcher: label })
    writeFileSync(path.join(directory, 'pair.json'), JSON.stringify({ ...identity, pair: index, reports }, null, 2) + '\n')
    process.stdout.write(JSON.stringify({ pair: index, corpus, launcher: label, wallMs: report.hookWallMs,
      userCpuMs: report.resources.userCpuMs, systemCpuMs: report.resources.systemCpuMs,
      characters: report.context.totals.observedModel.characters, load: report.load }) + '\n')
    assert.equal(report.load.contended, false, 'contended attempt retained; repeat the same pair in a fresh directory')
  }
  for (const corpus of ['governed', 'empty']) {
    const same = reports.filter(report => report.corpus === corpus)
    assert.equal(same[0].fixtureSha256, same[1].fixtureSha256)
    assert.deepEqual(same[0].context.totals.observedModel, same[1].context.totals.observedModel, 'utility changes do not alter delivered context')
  }
  return reports
}
if (isMainModule(import.meta.url)) {
  const [root, action] = process.argv.slice(2)
  if (!root || action !== '--prepare' && !/^[0-4]$/.test(action ?? '')) {
    process.stderr.write('usage: policy-launcher.mjs <private-experiment-root> <--prepare|pair 0..4>\n')
    process.exitCode = 2
  } else if (action === '--prepare') process.stdout.write(JSON.stringify(prepareLauncherComparison(root)) + '\n')
  else await runLauncherPair(root, Number(action))
}
