# Task ADR-031-T1: Let every gate report the version of the tree it was loaded from

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (eleven gates and their tests)
**Owner:** unassigned
**Produces:** `<gate> <version> (<root>)` on stdout from `<gate> --version`, exit 0, read from the manifest beside that gate
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a gate reports the version of the tree it was loaded from, not of any other tree`, `a gate whose manifest cannot be read says so rather than guessing`

## Goal

`<gate> --version` answers, on all eleven gates, and the answer is about the file the caller actually
invoked.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-debt` | edit | the flag |
| `plugin/bin/adr-judge` | edit | the flag |
| `plugin/bin/adr-lint` | edit | the flag |
| `plugin/bin/adr-next` | edit | the flag |
| `plugin/bin/adr-retire-check` | edit | the flag |
| `plugin/bin/adr-verify` | edit | the flag |
| `plugin/bin/arch-lint` | edit | the flag |
| `plugin/bin/postmortem-verify` | edit | the flag |
| `plugin/bin/qh-mcp` | edit | the flag |
| `plugin/bin/qh-root` | edit | the flag |
| `plugin/bin/spec-verify` | edit | the flag |
| `tests/gates.test.mjs` | edit | both mechanisms, driven out of a tree whose manifest nothing else shares |
| `tests/mutations.json` | edit | two catalogue entries, or the checks are unproven (ADR-003) |

## Ordered Steps

1. [S1] Establish the failing tests. **Recorded honestly: they were NOT written first.** The eleven gates were edited before the tests existed, which is this project's own ordering broken by the author, and rewording this step to read as though they had been is the one repair that is not available. Red was instead observed AFTER the fact, by reverting the gates and re-running: `git stash push -- plugin/bin` → `grep -c -- '--version' plugin/bin/adr-lint` returns `0` → both tests `✖`, `pass 0 / fail 2` → `git stash pop`. That is a real observation of the tests failing against code without the mechanism, and it is weaker than TDD for one reason worth naming: a test written after the code can be shaped by what the code already does, and no amount of red afterwards detects that. The mutations at S5 are what actually bind these assertions to the mechanism, which is why they carry the weight here rather than merely confirming it. Preceded by enumerating the absence with a command rather than from memory: `for f in plugin/bin/*; do case "$f" in *.cmd) continue;; esac; grep -c -- '--version' "$f"; done` → eleven files, `0` on every one. [proof: acceptance]
2. [S2] Insert one byte-identical `report_version()` block into all eleven gates, imports local so no gate's existing imports decide what the block is, and dispatch it as the first statement of `main()` — before each gate's own unknown-flag rejection, which would otherwise refuse `--version` as a typo. [proof: acceptance]
3. [S3] Assert it out of a THROWAWAY tree whose `plugin.json` says `0.0.0-fixture`, and assert the repository's real version does NOT appear — an assertion that the printed string equals the repository's version would pass for a baked constant and for a resolver call, which are the two answers this record rejects. [proof: acceptance]
4. [S4] Assert the unreadable case says `version unreadable`, names the path it tried, exits 0, and does not fall back to another tree's version. [proof: acceptance]
5. [S5] Add two catalogue mutations and confirm both come back RED. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test tests/gates.test.mjs 2>&1 | tee /tmp/adr031-t1.out \
  && ! grep -qE "no tests to run|^not ok|^# fail [1-9]" /tmp/adr031-t1.out \
  && python3 plugin/bin/adr-lint docs/adr/ADR-027-the-harness-ships-an-operating-surface.md
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every shipped gate answers --version with the version of the tree it was run from` | `tests/gates.test.mjs` | each gate resolves through its own `__file__`, and none leaks the repository's version | — | S1, S2, S3 |
| `a gate whose manifest cannot be read says so instead of guessing` | `tests/gates.test.mjs` | ADR-005 on this flag: could not read is reported, never guessed, never resolved elsewhere | — | S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `--version` appears in all eleven gates and each prints when given it |
| 2 — something selects it | the test spawns each gate with the flag, out of a tree it built |
| 3 — the caller can discover it | it is the conventional spelling; issue #9's adopter reached for it first and found nothing |
| 4 — it is used | an adopter's upgrade check is not observable from here, and a proxy would read like evidence. Issue #9 is the one recorded instance of the need |

## Mutation Log

- 2026-09-04 · d0f6c24* · mutant survived · exit 0 · `plugin/bin/adr-lint` · a gate must read the manifest beside ITSELF; resolving from the caller directory answers about a different tree and looks exactly like success · acceptance-sha256:6b1dd9ef46b81144afa270b5fb31353ee392ce9b6e3b352a263101e5edc27fc1 · covers:a gate reports the version of the tree it was loaded from, not of any other tree
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-09-04 · 310c52c · mutant killed · exit 1 · `plugin/bin/adr-lint` · a gate must read the manifest beside ITSELF; resolving from the caller directory answers about a different tree and looks exactly like success · acceptance-sha256:6b1dd9ef46b81144afa270b5fb31353ee392ce9b6e3b352a263101e5edc27fc1 · covers:a gate reports the version of the tree it was loaded from, not of any other tree
- 2026-09-04 · 310c52c* · mutant killed · exit 1 · `plugin/bin/adr-lint` · an unreadable manifest must be reported as unreadable; inventing a version is the ADR-005 defect this flag exists to avoid, and it resolves · acceptance-sha256:6b1dd9ef46b81144afa270b5fb31353ee392ce9b6e3b352a263101e5edc27fc1 · covers:a gate whose manifest cannot be read says so rather than guessing

## Verification Log

- 2026-09-04 · d0f6c24 · exit 0 · `set -o pipefail …` · acceptance-sha256:6b1dd9ef46b81144afa270b5fb31353ee392ce9b6e3b352a263101e5edc27fc1 · ms:18775 · steps:S1,S2,S3,S4
- 2026-09-04 · d0f6c24* · exit 0 · `set -o pipefail …` · acceptance-sha256:6b1dd9ef46b81144afa270b5fb31353ee392ce9b6e3b352a263101e5edc27fc1 · ms:18196 · steps:S5
- 2026-09-04 · 310c52c · exit 0 · `set -o pipefail …` · acceptance-sha256:6b1dd9ef46b81144afa270b5fb31353ee392ce9b6e3b352a263101e5edc27fc1 · ms:18124 · steps:S5
- 2026-09-04 · 310c52c* · exit 0 · `set -o pipefail …` · acceptance-sha256:6b1dd9ef46b81144afa270b5fb31353ee392ce9b6e3b352a263101e5edc27fc1 · ms:22386 · steps:S5

## Invariants

- Every file in `plugin/bin/` without a dot in its name answers `--version` and exits 0.
- The version is read from `<gate>/../.claude-plugin/plugin.json` at run time, never baked, never resolved through `qh-root`.
- An unreadable manifest is reported as unreadable, with the path, and no version is invented.
- No gate's existing behaviour changes: `--version` was rejected as an unknown option before this task, so no prior invocation is affected.

## Risks

- The block is duplicated eleven times, so the copies can drift. Deliberate (see the record's Alternatives, where the shared-module option was rejected on a line count), and the enumerating test drives every copy rather than a representative one.
- `--version` is dispatched before each gate's unknown-flag rejection. That is required — those rejections would otherwise refuse it — and it means the flag is terminal by construction: nothing after it runs.

## Stop Condition

Stop if any gate cannot resolve its own manifest from `__file__` — under a zipapp, a bundler, or an
install shape that rewrites the tree. The answer would then be about a different tree, which is the
defect this record exists to prevent, and a wrong version that resolves is worse than none.

## Out of Scope

- `--version` on the `.mjs` scripts under `plugin/scripts/` (deferred: docs/BACKLOG.md §113)
- Reporting anything beyond name, version and root (permanent: boundary: ADR-027's `qh-doctor` owns the fuller inventory, and duplicating it here is the enumeration ADR-027's own pre-registered failure watches for)
