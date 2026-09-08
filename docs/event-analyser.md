# Event analyser

A repository maintenance tool for finding where hook work is declared, which
events share functions, and where recorded invocations repeat or overlap.
It lives outside the shipped plugin. It runs only when explicitly invoked.

## Map the current checkout

Run from the repository root:

```bash
node --expose-internals scripts/event-analyser.mjs
node --expose-internals scripts/event-analyser.mjs --json
```

Redirect stdout to a file outside the checkout to save a report. Use
`--root DIR` to inspect another checkout with the same repository layout.
The analyser reads Git's tracked and unignored untracked file inventory.
It never executes hook commands during analysis.

| Report section | What it establishes |
| --- | --- |
| Hook registrations | Event, plugin/agent/skill scope, matcher, timeout, command target and declaration location |
| Dispatch conditions | Literal event branches and conditional local calls in `handleHook` |
| Shared function references | Functions with I/O-like call names appearing along several events' syntactic call paths |
| Wiring findings | Identical commands with provably overlapping simple matchers, unresolved commands, unlisted targets, and literal event branches without registrations |
| Git and CI | Local Git hook activation, lexical script references, workflow triggers and filters, job conditions, raw matrices and run declarations |
| Observed runtime | Recorded invocation counts, total/p95 elapsed time, overlap, failures, timeouts, incomplete runs and repeated identical inputs |

Handler IDs identify a declaration by file, event and ordinal. Reordering hook
declarations can change IDs, so analyse a trace against the checkout that recorded
it. A listed target means Git lists the path; a read failure remains incomplete
evidence. Declaration locations can identify the event group rather than the
individual command.

## Measure explicitly selected commands

Static wiring cannot establish what actually fired. The optional recorder writes
its own JSONL format; native Claude transcripts and debug logs are not supported.
There is no background collection and no automatic installation.

For a chosen handler, copy its ID from the report and supply the real command and
arguments after `--`. This **executes that command**, including its normal side
effects. For example, using an existing hook input file and a trace destination
outside the repository:

```bash
node scripts/event-analyser.mjs record \
  --trace ../hook-runs.jsonl \
  --id plugin/hooks/hooks.json:PreToolUse:0 \
  --timeout-ms 60000 \
  -- node plugin/scripts/lifecycle.mjs < ../hook-input.json

node --expose-internals scripts/event-analyser.mjs --trace ../hook-runs.jsonl
```

Manual invocations measure those probes, not an entire Claude session. Recording
live hook activity would require explicitly wrapping the selected local hook
command with this recorder and restoring that local configuration afterward.
Keep generated traces, hook inputs and reports out of Git.

The recorder forwards stdin bytes, buffers stdout/stderr until the command
finishes, then forwards output and a normal child exit code. It limits combined
output to 4 MiB. The default timeout is 10 seconds; explicit values range from
100 to 110000 milliseconds. Choose a diagnostic budget below the host's timeout
to leave time for cleanup. These bounds and buffering can affect the measurement;
this is a diagnostic wrapper, not transparent production instrumentation.

Trace records contain a generated invocation ID, handler ID, event/session/tool
identifiers, input SHA-256, timestamps, elapsed time and completion status. They
omit raw hook input, commands and child output. Session identifiers and hashes
are still local diagnostic data. A failed final trace write preserves child
output and returns partial status; an unmatched start remains unfinished.

## Read the evidence conservatively

- Identical declarations suggest overlap. Host deduplication and repeated firing
  require runtime evidence. Regex overlap beyond identical patterns and simple
  literal alternatives is not inferred.
  Cross-scope candidates identify the same command declared in different plugin,
  agent or skill scopes. Those scopes may never coexist; inspect activation before
  removing shared declarations.

- Repeated input means the same handler, session, event, tool-use ID and input hash
  appeared again. Legitimate retries can produce this. Copied observations with
  the same invocation ID are counted once.
- Missing observations mean **not observed**, never unused. Unfinished invocations
  are excluded from elapsed-time and concurrency calculations. Wall-clock changes
  can affect interval overlap; elapsed durations use a monotonic clock.
- The JavaScript scan follows top-level function declarations in locally resolved
  `.mjs` entrypoints. It does not propagate arguments into callees. A caller may
  disable work through an option even when the called function references that
  work. Shell internals, callbacks, closures, dynamic dispatch and cross-module
  calls are not expanded.
- YAML inspection supports the repository's block layout. Raw CI conditions,
  trigger filters and matrices remain declarations, not evaluated schedules or
  observed CI runs. Installed settings and other plugins are outside this scope.

The parser reuses Node's bundled Acorn through `--expose-internals`, like the
repository's existing spawn audit. An unavailable parser, unsupported input or
unreadable source is reported as incomplete. Inputs and individual source/trace
files have a 32 MiB limit.

Analysis exits 0 when the supported report completes, even with wiring findings,
and 2 for usage errors or incomplete evidence. Recording preserves normal child
exit codes and uses 2 for timeout, output-limit, recording or cleanup uncertainty.

## Development checks

```bash
node --test tests/event-analyser.test.mjs
bash scripts/selftest.sh
```

The tests change declarations and source between scans, exercise clean and broken
wiring, refuse escaping source paths, and run bounded real commands to verify
input/output preservation and timeout reporting.

## Optional live operation timings

The installed plugin can append timings from inside its existing branch reader,
shell runner and artifact batch. This adds no wrapper process. It is off by default.
Set both variables in the environment used to launch the session:

```powershell
$env:QUALITY_HARNESS_TRACE_FILE = Join-Path $env:TEMP 'qh-performance.jsonl'
$env:QUALITY_HARNESS_TRACE_UNTIL = [DateTimeOffset]::UtcNow.AddMinutes(5).ToUnixTimeMilliseconds().ToString()
```

Or, in Bash:

```bash
export QUALITY_HARNESS_TRACE_FILE="${TMPDIR:-/tmp}/qh-performance.jsonl"

export QUALITY_HARNESS_TRACE_UNTIL="$(node -p 'Date.now() + 5 * 60_000')"
```

Use an absolute `.jsonl` path on a local disk, outside every checkout and Git
metadata directory; its parent must already exist. Symlinks, multiply linked files,
and current gated artifacts (including files inside a gated directory) are refused.
Start the session from that environment, then analyze the file in this repository:

```bash
node --expose-internals scripts/event-analyser.mjs --trace /absolute/path/to/qh-performance.jsonl
```

The analyser lists these as `operation/…` and counts outcomes such as
`cache-hit`, `timeout`, `budget-exhausted` and `cleanup-unconfirmed`.
A completed shell means its process finished; its ordinary output still carries
the artifact verdict. A `processed` batch attempted every path and may contain
failed shell executions. The diagnostic record never grants permission to proceed.

Recording expires at the supplied Unix-millisecond deadline (at most 15 minutes
ahead) and stops appending at an 8 MiB soft limit. Concurrent writers can exceed
that limit by their in-flight records. Existing files are never cleared. Delete
or move the old capture before a new one, and unset the variables when finished.

Only invocation IDs, input hashes, wall-clock timings and execution outcomes are
written. Payloads, paths, prompts and child output are omitted. These operation
records carry no session/tool correlation, so they do not establish duplicate
hook delivery or provide complete session coverage. Nested batch/shell durations
overlap and must not be added as independent CPU cost.

A full, expired or unwritable target is silently skipped to preserve gate output.
A start without an end is unfinished evidence, never success. Missing records
do not prove that work did not run; this is optional diagnostic sampling.
