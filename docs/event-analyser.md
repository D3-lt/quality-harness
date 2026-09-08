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
