// ADR-138 T1: whether two corpus-probe reports say the same thing. Repository tooling, not the plugin: only the release's
// outside run asks it (scripts/outside-run.mjs, scripts/release-evidence.mjs), and orphan-sweep refused it in the shipped
// tree, since nothing a user downloads reaches it (the landing of 78b3ab55, 2026-11-03).

// The fields a report holds about its RUN rather than about what the readers said. Measured 2026-11-03: two runs of one
// corpus differ in timings, load and slowest only; two versions or machines differ in probe too (version, digests, native
// identity, date, platform). Closed: a field the probe adds later is output until it is named here.
export const RUN_FIELDS = Object.freeze(['probe', 'timings', 'load', 'slowest'])

// A value with its object keys sorted, so key order is never output.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}

/**
 * Whether two reports say the same thing: every field but RUN_FIELDS equal, whole. corpus-probe's diffReports explains a
 * difference but compares a chosen subset (it skips corpusReport and reduces ready tasks to ids), so it is never this question.
 */
export function sameOutput(before, after) {
  const said = report => JSON.stringify(canonical(Object.fromEntries(Object.entries(report ?? {}).filter(([key]) => !RUN_FIELDS.includes(key)))))
  return said(before) === said(after)
}
