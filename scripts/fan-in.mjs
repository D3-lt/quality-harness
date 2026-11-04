#!/usr/bin/env node
// ADR-139 T2: a fan-in job passes only on every shard's own success.
// Usage: node scripts/fan-in.mjs --prefix <job name> --count <n> --artifact <name>
// Lists this run's jobs (the latest attempt of each) and artifacts through `gh api`, then requires exactly one job named
// `<prefix> <i>/<n>` for each i, concluded `success`, and one non-empty, unexpired artifact `<artifact>-<i>-of-<n>`.
// A `needs:` job is skipped when a need fails and a skipped job satisfies a required check, and a matrix's aggregate result
// has read `success` with a leg cancelled before it started: so this asks per shard, by name, and never reads the aggregate.
// Exit: 0 every shard passed; 1 one did not (each named); 2 could not look (bad arguments, gh absent or failing).
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export function fanIn({ jobs, artifacts, prefix, count, artifact }) {
  if (!Number.isInteger(count) || count < 1) throw new Error(`fan-in: a count of ${count} shards is not a fan-in`)
  const problems = []
  const expected = Array.from({ length: count }, (_, k) => `${prefix} ${k + 1}/${count}`)
  for (const name of expected) {
    const found = jobs.filter(job => job.name === name)
    if (found.length === 0) problems.push(`${name}: no such job in this run`)
    else if (found.length > 1) problems.push(`${name}: listed ${found.length} times`)
    else if (found[0].conclusion !== 'success') problems.push(`${name}: concluded ${found[0].conclusion ?? `nothing yet (${found[0].status})`}`)
  }
  const shardName = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\d+/\\d+$`)
  for (const job of jobs) if (shardName.test(job.name) && !expected.includes(job.name)) problems.push(`${job.name}: a shard this fan-in does not expect`)
  for (let i = 1; i <= count; i++) {
    const name = `${artifact}-${i}-of-${count}`
    const found = artifacts.filter(item => item.name === name)
    if (found.length !== 1) problems.push(`${name}: ${found.length === 0 ? 'no such artifact' : `${found.length} artifacts`}`)
    else if (found[0].expired) problems.push(`${name}: expired`)
    else if (!(found[0].size_in_bytes > 0)) problems.push(`${name}: empty`)
  }
  return problems
}

function list(endpoint, key) {
  const run = spawnSync('gh', ['api', '--paginate', endpoint, '--jq', `.${key}[]`], { encoding: 'utf8', timeout: 120_000, windowsHide: true })
  if (run.error || run.status !== 0) throw new Error(`gh api ${endpoint}: ${run.error?.message ?? run.stderr.trim()}`)
  return run.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line))
}

function main(argv, env) {
  const arg = name => (argv.indexOf(name) >= 0 ? argv[argv.indexOf(name) + 1] : undefined)
  const prefix = arg('--prefix'), artifact = arg('--artifact'), count = Number(arg('--count'))
  const repo = env.GITHUB_REPOSITORY, runId = env.GITHUB_RUN_ID
  if (!prefix || !artifact || !Number.isInteger(count) || count < 1 || !repo || !runId) {
    process.stderr.write('fan-in: could not look: usage: fan-in.mjs --prefix <job name> --count <n> --artifact <name>, with GITHUB_REPOSITORY and GITHUB_RUN_ID set\n')
    return 2
  }
  let jobs, artifacts
  try {
    jobs = list(`repos/${repo}/actions/runs/${runId}/jobs?filter=latest&per_page=100`, 'jobs')
    artifacts = list(`repos/${repo}/actions/runs/${runId}/artifacts?per_page=100`, 'artifacts')
  } catch (error) {
    process.stderr.write(`fan-in: could not look: ${error.message}\n`)
    return 2
  }
  const problems = fanIn({ jobs, artifacts, prefix, count, artifact })
  for (const problem of problems) process.stdout.write(`FAIL ${problem}\n`)
  if (problems.length === 0) process.stdout.write(`fan-in: all ${count} shards of "${prefix}" concluded success and left their artifacts\n`)
  return problems.length === 0 ? 0 : 1
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2), process.env)
