# Task ADR-019-T1: Identify a home file by what proves it is ours, never by what is missing

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** `formerlyShipped()` (T1), `classifyHomeFile()` (T1)
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Add a positive identification of a file under the user's home — digest, forwarder mark or lineage
against a cached release of the same basename — so that absence from the current tree is a
precondition and never evidence.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/standalone-link.mjs` | edit | `formerlyShipped()` and `classifyHomeFile()` live beside `knownDigests()` and `sameLineage()`, which they reuse |
| `tests/standalone-link.test.mjs` | edit | the suite that owns this module's identification rules |
| `tests/mutations.json` | edit | registers `orphan: a file this plugin cannot prove it wrote is never named` — the label the ADR's `Enforced-by` names, and what SELECTS this rule as load-bearing rather than incidental |

<Nothing selects `classifyHomeFile()` at the end of this task: T2 is its only caller. The mutation
entry is what makes the rule itself reachable by the campaign, and the Reachability table below says
so at rung 2 rather than pretending a caller exists.>

## Ordered Steps

1. [S1] Write the failing tests first (TDD red): a synthetic home and a synthetic cache where a basename appears in an old release and not in the current tree, and one where a basename appears in neither. Both must fail before any implementation.
2. [S2] `formerlyShipped(name, homeDirectory)` — walk each cached release of THIS plugin (`plugins/cache/quality-harness/quality-harness/` only, never `cache/*/*/`), match on BASENAME rather than relative path, return `[{ version, relative, digest }]`, short-circuiting per release on first match. The namespace bound is load-bearing rather than tidy: route 3 below compares opening docstrings and a `%~dp0` shim pattern, neither of which is specific to this plugin, so widening the walk would let another vendor's same-named file satisfy it. Basename because ADR-008 moved the gates under `plugin/` on 2026-08-28 and the home `hooks/` directory has never shared a name with the plugin directory that fills it, so a fixed relative path answers "no" for a file that shipped for a year.
3. [S3] `classifyHomeFile({ file, name, shippedNow, homeDirectory })` returning `ours-shipped` when the plugin ships that basename today, else `ours-orphan` when the digest matches a `formerlyShipped` entry OR the file carries `FORWARDER_MARK` OR `sameLineage()` matches a formerly-shipped copy, else `unidentified`.
4. [S4] Assert the four real not-ours basenames measured on 2026-09-01 — `autoresearch-context.sh`, `cbm-code-discovery-gate`, `cbm-session-reminder`, `cbm-subagent-reminder` — classify as `unidentified` from a synthetic cache holding no such file. Then the case that actually exercises route 3: plant a file of one of those basenames INSIDE the synthetic cache, give the home file an opening docstring that `sameLineage` would accept, and assert it is still `unidentified` when the cache entry sits under another vendor's namespace. Without this second fixture the first proves only that a basename absent from the cache is unmatched, which route 3 was never at risk of. [proof: acceptance]
5. [S5] Register the mutation entry that replaces the positive test with the residual rule (`ours-orphan` whenever not shipped now) and confirm it is RED. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test tests/standalone-link.test.mjs 2>&1 | tee /tmp/adr019-t1.out \
  && ! grep -qE "^# fail [1-9]|no tests to run|tests 0" /tmp/adr019-t1.out \
  && grep -q "a file this plugin cannot prove it wrote is never named" tests/mutations.json
```

<Red before the work: the suite does not yet export `formerlyShipped`, so the import throws and the
run is non-zero. The `grep` on the catalogue is chained with `&&` so a passing suite alone cannot
carry the verdict — the mutation entry is half of what this task produces.>

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a file the plugin no longer ships is ours only when something proves it` | `tests/standalone-link.test.mjs` | digest, forwarder-mark and lineage routes each independently yield `ours-orphan` | — | S1, S2, S3 |
| `a file no release ever shipped is unidentified, not an orphan of ours` | `tests/standalone-link.test.mjs` | the four real not-ours basenames classify `unidentified` against a cache that lacks them | — | S4 |
| `another vendor's file is unidentified even when the basename is in some cache` | `tests/standalone-link.test.mjs` | route 3 cannot be satisfied from outside this plugin's cache namespace — the loose route, on the fixture that can actually reach it | — | S2, S4 |
| `a basename that moved between releases is still recognised` | `tests/standalone-link.test.mjs` | a file shipped at `hooks/x` in an old release and `scripts/x` in a newer one resolves from either | — | S2 |
| `a cache directory that is not a release contributes nothing` | `tests/standalone-link.test.mjs` | a junk directory alongside the releases yields no match and no throw | — | S2 |
| `a file the plugin ships today is never called an orphan` | `tests/standalone-link.test.mjs` | `ours-shipped` wins over every orphan route | — | S3 |

<Each of the three routes is asserted ALONE, with the other two made unavailable in the fixture. A
test that leaves all three live cannot tell which one answered, and a mutation on any single route
would then survive.>

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the five tests above |
| 2 — something selects it | nothing in product code yet — T2 is the only caller. `tests/mutations.json` selects the RULE for the campaign, and the mutation in S5 fails if the positive check is replaced by the residual one |
| 3 — the caller can discover it | n/a: no declared interface — both functions are module exports consumed by T2 and T3 in the same repository |
| 4 — it is used | nothing measures this yet; the Follow-up in the parent ADR counts `unidentified` rows once the report ships |

## Mutation Log

- 2026-09-01 · 700e185* · mutant killed · exit 1 · `plugin/scripts/standalone-link.mjs` · the residual rule that names another tool's live files as ours · acceptance-sha256:8c5d91b8aa9a4f381fb612c4467691e0b00327c7a620a8f7744f66001db28ab7

## Invariants

- `replaceable()` is not modified. It is why another tool's files were never at risk (ADR-001).
- Every cache read is bound to `plugins/cache/quality-harness/quality-harness/`. No route reads another vendor's cache.
- No function added here reads or writes anything outside the cache and the home paths it is given.
- Absence from the current tree never, on its own, produces `ours-orphan`.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Basename matching is too loose — a common name collides across tools | Med | High | A basename match alone is never sufficient, and the cache walk is bound to this plugin's namespace so the lineage route cannot reach another vendor's file. The regression is the second S4 fixture, which plants the collision rather than assuming it away |
| Walking every release's whole tree is slow | Med | Med | Per-basename with a first-match short-circuit per release; T2 measures the real figure |

## Stop Condition

Stop and return to the parent ADR if the digest, forwarder and lineage routes together cannot
identify any file that is actually an orphan on a real machine — that would mean the decision's
three routes are the wrong set, which is a decision change and not an implementation detail.

## Out of Scope

- Scanning any directory, which is T2's (deferred: this record's T2)
- Rendering anything to the user, which is T3's (deferred: this record's T3)
- Any code path that deletes or moves a file (permanent: boundary: the parent ADR's Decision)

## Verification Log
- 2026-09-01 · 700e185 · exit 0 · `set -o pipefail …` · acceptance-sha256:8c5d91b8aa9a4f381fb612c4467691e0b00327c7a620a8f7744f66001db28ab7
