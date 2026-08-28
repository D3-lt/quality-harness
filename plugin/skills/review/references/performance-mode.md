# Performance Review Mode

Identify the biggest bottlenecks with measured evidence. Findings without measurements are
hypotheses and must be labeled as such.

## Evidence First — run, don't read

Prefer profiler data, traces, query plans, bundle analysis, or measured timings. Obtain them:

- SQL/N+1 (Postgres): `EXPLAIN (ANALYZE, BUFFERS) <query>;` — look for seq scans on large tables,
  row-estimate misses, nested loops over unbatched IDs.
- SQL (MySQL): `EXPLAIN FORMAT=JSON <query>;` + `SHOW STATUS LIKE 'Handler_read%';`
- Laravel: enable query log around the path (`DB::enableQueryLog()` / telescope if present); N+1
  shows as repeated identical-shape queries.
- Python: `python -m cProfile -s cumtime <entry>` or `pytest --durations=10` for slow tests;
  `py-spy top --pid <pid>` for live processes.
- Node/React build: `npx vite build --mode production` + `npx vite-bundle-visualizer` (or
  `source-map-explorer dist/assets/*.js`); flag any single chunk > ~250 kB gz.
- React runtime: React DevTools Profiler recording; unstable-reference rerenders show as children
  re-rendering with unchanged props.
- Rust: `cargo build --timings` for compile cost; `cargo bench`/criterion for hot paths;
  `samply record <bin>` for a flamegraph.
- HTTP waterfalls: browser DevTools Network tab or `curl -w '%{time_starttransfer} %{time_total}\n'`
  per endpoint in sequence.

No baseline → measure one before recommending anything. Do not recommend broad optimization work
without a baseline number to beat.

## Review Order

1. Request waterfalls and unnecessary blocking
2. Heavy rerenders or expensive client work
3. Large bundles or costly dependencies
4. N+1 queries, missing indexes, unbounded reads
5. Wrong caching or cache invalidation

## Rules

- Top few bottlenecks only, not an optimization backlog.
- State likely impact with the number behind it; prefer strong-payoff low-complexity fixes.

## Output

Top bottlenecks / Evidence (command + measurement) / Suggested fix / Expected impact / Unknowns
(measurements still needed). Unmeasured findings labeled "code-based hypothesis".
