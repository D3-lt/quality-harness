# Task ADR-051-T2: Statusline count is proven paths

**Depends-on:** T1
**Covers:** F-3
**Estimated scope:** S (statusline count plus catalogue)
**Owner:** zy
**Produces:** none
**Consumes:** `provenMutationPaths` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `statusline proven count`, `marker-only stays unverified`

## Goal

The statusline `count` is proven paths only. Marker-only is `kind: unverified` with no numbered write (`QH ✗ unverified`), not `QH · nothing edited`.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/statusline.mjs` | edit | `reading()` uses `provenMutationPaths`; `count: proven.length`; `markerOnly` keeps unverified |
| `tests/statusline.test.mjs` | edit | marker-only `node --version` renders `QH ✗ unverified` |
| `tests/mutations.json` | edit | `count: proven.length` → `count: edited.length`; `markerOnly = false` |

## Ordered Steps

1. [S1] Confirm the failing test for `Covers:` IDs exists and is red. Implementation landed in `3ebc868`. [proof: acceptance]
2. [S2] `reading()` counts proven paths. Marker-only (`edited.length > 0 && proven.length === 0`) stays unverified. Do not silence the segment because the count would be 0. [proof: acceptance]
3. [S3] Catalogue a mutant that sets `count: edited.length`, and one that forces `markerOnly` false. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'a marker-only transcript is unverified, not a numbered write' tests/statusline.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a marker-only transcript is unverified, not a numbered write` | `tests/statusline.test.mjs` | `node --version` renders `QH ✗ unverified`, not `QH ✗ 1 unverified` and not nothing-edited | F-3 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | F-3 statusline test |
| 2 — something selects it | `reading()` calls `provenMutationPaths`; mutant uses `edited.length` for count |
| 3 — the caller can discover it | n/a: user-wired statusline; plugin cannot set `statusLine` |
| 4 — it is used | composed statusline segment (ADR-044) |

## Mutation Log
- 2026-09-12 · 3ebc868* · mutant killed · exit 1 · `plugin/scripts/statusline.mjs` · counts the unresolved marker as a numbered write · acceptance-sha256:d2fb8ceac5407cf0907472a19fa78de93c87e9cf77c587f63a7a6a3406660f93 · covers:statusline proven count
- 2026-09-12 · 3ebc868* · mutant killed · exit 1 · `plugin/scripts/statusline.mjs` · treats marker-only as nothing-edited instead of unverified · acceptance-sha256:d2fb8ceac5407cf0907472a19fa78de93c87e9cf77c587f63a7a6a3406660f93 · covers:marker-only stays unverified

## Invariants

- Marker-only is unverified, not nothing-edited.
- Proven-path count can still be `QH ✗ N unverified`.
- Kind `too-large` / `checked` unchanged.

## Risks

- Count 0 + kind nothing → `QH · nothing edited` for a version probe.
- Silence the segment when proven.length is 0.

## Stop Condition

Marker-only renders a numbered write or nothing-edited, or a proven write stops counting.

## Out of Scope

- Stop / PreToolUse copy (T1)
- ADR-044 compose-not-replace
- CI cache rendering

## Verification Log
- 2026-09-12 · 3ebc868* · exit 0 · `node --test --test-name-pattern 'a marker-only transcript is unverified, not a numbered write' tests/statusline.test.mjs` · acceptance-sha256:d2fb8ceac5407cf0907472a19fa78de93c87e9cf77c587f63a7a6a3406660f93 · ms:80
- 2026-09-12 · 3ebc868* · exit 0 · `node --test --test-name-pattern 'a marker-only transcript is unverified, not a numbered write' tests/statusline.test.mjs` · acceptance-sha256:d2fb8ceac5407cf0907472a19fa78de93c87e9cf77c587f63a7a6a3406660f93 · ms:85
