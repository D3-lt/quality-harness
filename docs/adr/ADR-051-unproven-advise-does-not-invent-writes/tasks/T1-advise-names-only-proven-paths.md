# Task ADR-051-T1: Advise names only proven paths

**Depends-on:** none
**Covers:** F-1, F-2, F-4, F-5, UC1-S1, UC1-S2
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** `provenMutationPaths`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `provenMutationPaths filter`, `empty list is could-not-look`, `docsOnly over proven paths`

## Goal

Stop / PreToolUse Advise lists only proven repository paths. Empty or `<…>`-only `mutationPaths` is could-not-look, still Advise. Mixed proven+marker lists the proven path only. `docsOnly` is over proven paths. `record` still writes the stand-in.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `provenMutationPaths`; `missingEvidenceReason`; `docsOnly(...)` call; `sessionStateNote` |
| `tests/lifecycle.test.mjs` | edit | class test: probe / ps / sed / mixed / outside / deletion / docs-only skip |
| `tests/mutations.json` | edit | drop the stand-in skip; restore `The transcript contains file mutations.`; unwrap `docsOnly` |

## Ordered Steps

1. [S1] Confirm the failing tests for `Covers:` IDs exist and are red. Implementation landed in `3ebc868`; confirm the test names the class. [proof: acceptance]
2. [S2] Filter `mutationPaths` through `provenMutationPaths` in `missingEvidenceReason`, `docsOnly`, and `sessionStateNote`. Empty / marker-only → could-not-look. Do not silence Advise. Do not drop `record`'s marker. [proof: acceptance]
3. [S3] Catalogue a mutant that drops the stand-in / outside-cwd skip, one that restores `The transcript contains file mutations.`, and one that unwraps `docsOnly` to raw `mutationPaths`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'Stop does not invent writes from probes, markers, or paths outside the repo' tests/lifecycle.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `Stop does not invent writes from probes, markers, or paths outside the repo` | `tests/lifecycle.test.mjs` | proven paths only; empty/marker-only could-not-look; mixed omits marker; deletion sentinel omitted; docsOnly over proven still Advises marker-only and still skips markdown+probe | F-1, F-2, F-4, F-5, UC1-S1, UC1-S2 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | class test |
| 2 — something selects it | `missingEvidenceReason` / `docsOnly` / `sessionStateNote` call `provenMutationPaths`; mutant drops the `<` / outside-cwd skip |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | Stop / PreToolUse Advise is the served path |

## Mutation Log
- 2026-09-12 · 3ebc868* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · drops the stand-in skip so a marker is listed as a changed path · acceptance-sha256:f72cc5fd1e240c65ed9745bc177ebf47487063faef5a65068b0a68254edaa406 · covers:provenMutationPaths filter
- 2026-09-12 · 3ebc868* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · restores the empty-list fallback that claims file mutations · acceptance-sha256:f72cc5fd1e240c65ed9745bc177ebf47487063faef5a65068b0a68254edaa406 · covers:empty list is could-not-look
- 2026-09-12 · 3ebc868* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · unwraps docsOnly so a stand-in is treated as a non-document file · acceptance-sha256:f72cc5fd1e240c65ed9745bc177ebf47487063faef5a65068b0a68254edaa406 · covers:docsOnly over proven paths

## Invariants

- Catch nothing in `classifyCommand`; interpreter `--version` stays mutation.
- `record` still writes `<Bash mutation:` and `<Unresolved Bash deletion>`.
- Empty / marker-only still Advises.
- `sed -i` / native Write still names the proven file.
- `docsOnly` over proven paths; marker-only is not docs-only (still Advises).

## Risks

- Filter only `<Bash mutation:` so the deletion sentinel prints as a path.
- Empty-list fallback still says `The transcript contains file mutations.`
- Drop Advise to avoid the lie.
- `docsOnly` still over raw `mutationPaths`.

## Stop Condition

A listed member still invents a write, or Advise is silent on marker-only / unrecognised, or `sed -i` / native Write stops naming the file.

## Out of Scope

- Statusline count (T2)
- Making `node --version` `neither`
- Cost 1 writing subcommands
- Inferred-check copy

## Verification Log
- 2026-09-12 · 3ebc868* · exit 0 · `node --test --test-name-pattern 'Stop does not invent writes from probes, markers, or paths outside the repo' tests/lifecycle.test.mjs` · acceptance-sha256:f72cc5fd1e240c65ed9745bc177ebf47487063faef5a65068b0a68254edaa406 · ms:427
- 2026-09-12 · 3ebc868* · exit 0 · `node --test --test-name-pattern 'Stop does not invent writes from probes, markers, or paths outside the repo' tests/lifecycle.test.mjs` · acceptance-sha256:f72cc5fd1e240c65ed9745bc177ebf47487063faef5a65068b0a68254edaa406 · ms:417
- 2026-09-12 · 3ebc868* · exit 0 · `node --test --test-name-pattern 'Stop does not invent writes from probes, markers, or paths outside the repo' tests/lifecycle.test.mjs` · acceptance-sha256:f72cc5fd1e240c65ed9745bc177ebf47487063faef5a65068b0a68254edaa406 · ms:416
