// Runs a gate's own Python functions in-process, loaded from its file under plugin/bin, and returns
// the JSON the script printed. Shared by the tests that reach a gate's function below its CLI.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const bin = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'bin')

export function gate(script, ...args) {
  const run = spawnSync('python3', ['-c', [
    'import importlib.machinery, importlib.util, json, sys',
    'from pathlib import Path',
    'def load(name):',
    '    loader = importlib.machinery.SourceFileLoader(name.replace("-", "_"), str(Path(sys.argv[1]) / name))',
    '    spec = importlib.util.spec_from_loader(loader.name, loader)',
    '    module = importlib.util.module_from_spec(spec)',
    '    loader.exec_module(module)',
    '    return module',
    script,
  ].join('\n'), bin, ...args], { encoding: 'utf8', timeout: 60_000, windowsHide: true, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } })
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
  return JSON.parse(run.stdout)
}
