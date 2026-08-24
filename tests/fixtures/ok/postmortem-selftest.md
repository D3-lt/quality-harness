---
date: 2026-07-30
category: silent-failure
severity: medium
files_changed:
  - fixtures/ok/postmortem-selftest.md
tags: [toolkit, gates, transfer]
---

# Packaged gates looked installed but never ran

## Symptom

After copying the plugin directory to a second machine, `/quality-harness:adr-write` produced ADRs that no gate
ever rejected. `adr-lint` appeared to "pass" every artifact, including placeholder ones.

## Context

Transfer was a plain file copy. The `bin/` scripts lost their executable bit, so every
invocation failed at the shell level and the calling skill treated the empty output as a pass.

## Root Cause

The gate was invoked without checking that the interpreter ever started:

```bash
out=$("$BIN/adr-lint" "$f" 2>&1); rc=$?
[ "$rc" -eq 0 ] && exit 0
```

`rc` is 126 for a non-executable file, but the surrounding skill prose only distinguished
"output present" from "no output" — a permission error produced no findings and read as clean.

## Investigation

1. Ran `adr-lint` by hand on a known-bad template — expected exit 1, got 126.
2. `ls -l quality-harness/bin` showed mode 644 on every script.
3. Confirmed the same artifact exited 1 on the source machine, isolating transfer as the cause.

## Fix

### Before

```bash
chmod -x quality-harness/bin/adr-lint
```

### After

```bash
chmod +x quality-harness/bin/*
bash quality-harness/scripts/selftest.sh   # asserts measured exit codes, fails loudly on 126/127
```

## Lesson

A gate that cannot run is indistinguishable from a gate that passes unless something
asserts the *expected* non-zero code. Ship the failure path as a test, not just the happy path.
