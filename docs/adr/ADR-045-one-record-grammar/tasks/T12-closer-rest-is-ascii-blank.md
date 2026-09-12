# Task ADR-045-T12: A closer rest is only ASCII space and tab

**Depends-on:** T10, T11
**Covers:** F-13, UC13-S1, UC13-S2
**Estimated scope:** XS (one predicate in `_fence_closes`; `first_fence_line` trims the same bytes; one probe; one catalogue entry)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`_fence_closes` used `.strip()`, so NEL, NBSP and the other Unicode whitespace counted as "nothing after the marker" and closed a fence T11 says is still one line. `_RUNNABLE_INFO` already allowed only `[ \t]*` after a language label. The closer rest is that same class. ``` and ```\t still close; ```\x85 and ```\xa0 do not. Corpus digest-diff vs the `.strip()` closer over tracked `docs/adr/**/*.md` is 0.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | `_fence_closes` rest is `[ \t]*`; `first_fence_line` `strip(" \t")` |
| `tests/gates.test.mjs` | edit | NEL / NBSP do not close; bare / tab do; corpus digest-diff 0 |
| `tests/mutations.json` | edit | fullmatch put back to `.strip()` |
| `docs/specs/2026-09-11-one-record-grammar.md` | edit | F-13, UC-13, UC13-S1, UC13-S2 |

## Ordered Steps

1. [S1] Bind the failing test: ```\x85 does not close; ``` and ```\t do; digest-diff vs `.strip()` over tracked records is 0. [proof: acceptance]
2. [S2] The predicate; `first_fence_line` trims the same bytes. [proof: acceptance]
3. [S3] The catalogue entry; run it with `node scripts/mutate.mjs --case`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'a closer rest is only ASCII space and tab' tests/gates.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `record.py: a closer rest is only ASCII space and tab — NEL does not close a fence` | `tests/gates.test.mjs` | ```\x85 and ```\xa0 leave the fence open; ``` and ```\t close; `first_fence_line` keeps a NEL; corpus digest-diff vs `.strip()` is 0 | F-13, UC13-S1, UC13-S2 | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `_fence_closes` uses `re.fullmatch(r"[ \t]*", rest)` |
| 2 — something selects it | the section walk and `acceptance_fence` call it |
| 3 — the caller can discover it | every gate reads sections through `sections_of` |
| 4 — it is used | the probe's four closers and the corpus snapshot |

## Mutation Log

## Invariants

- Digests of every tracked record are unchanged (0 differences).
- A closer that is only spaces or tabs still closes.

## Risks

- `_HEADING`'s `\s*$` still trims a trailing NEL from a heading's name; that is not a closer.

## Stop Condition

A green run while ```\x85 closes a fence.

## Out of Scope

- `file_newline` rewriting mixed or lone-CR input (deferred: `docs/BACKLOG.md` §200 — not a one-function T11 change; corpus impact not shown to be 0)

## Notes

Found by the third Codex review of ADR-045 (LOW). T11 made the eight Unicode separators bytes of a line; this is the same class on the closer rest.

## Verification Log
