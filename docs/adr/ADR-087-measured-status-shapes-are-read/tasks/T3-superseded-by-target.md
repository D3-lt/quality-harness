# Task ADR-087-T3: a frontmatter `superseded_by` names the replacement

**Depends-on:** T1
**Covers:** F-5, F-6
**Estimated scope:** S (one input to `supersessionTarget` in lifecycle.mjs, its tests and campaign entries)
**Owner:** unassigned
**Produces:** a record's `supersededBy` read from frontmatter `superseded_by` when its Status names none
**Consumes:** `frontmatterBlock` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `superseded_by supplies a missing target`, `supersedes is not read`

## Goal

A graveyard record whose Status names no record takes its replacement from its frontmatter `superseded_by`, in the three spellings measured. A `supersedes` key never changes any record's kind or target.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | the record's `supersededBy` (`:2777-2779`): when the Status kind is graveyard and the Status names nothing, read `superseded_by` from `frontmatterBlock`, remove quotes and a `.md` suffix, and pass `superseded by <value>` to `supersessionTarget` (`:2828`), which is unchanged |
| `tests/corpus-shapes.test.mjs` | edit | this task's two tests |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write this task's two tests and record the red run (TDD red). Today a `status: superseded` record names no target, so `adr-state --json` lists none of the data rows under `danglingSupersession`.
2. [S2] In `supersededBy`, when `/^superseded\s+by\b/i` does not match, the kind is graveyard, and the frontmatter has a single-line `superseded_by:` value other than `null`, `~`, `[]` or empty: remove one enclosing quote pair, a trailing ` #` comment and a `.md` suffix, then read the target with `supersessionTarget`. A one-item inline list `[x]` is read as `x`. A list of more than one names no single replacement and is left unread.
3. [S3] `supersedes` is not read anywhere. The twin pins this.
4. [S4] Record one killed mutant per Rests-on name. One drops the `superseded_by` read, so the data rows leave `danglingSupersession`. The other reads `supersedes` as a reverse supersession of its targets, so the twin's governing record turns graveyard. Add both to `tests/mutations.json`. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/corpus-shapes.test.mjs 2>&1) \
  && for t in 'a frontmatter superseded_by names the replacement in the three measured spellings' 'supersedes is never read and superseded_by never moves a governing record'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$")" != 1 ]; then exit 1; fi; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a frontmatter superseded_by names the replacement in the three measured spellings` | `tests/corpus-shapes.test.mjs` | three `status: superseded` records whose `superseded_by` is `041-gone`, `042-gone.md` and `"0043"`, with no records 41 to 43 in the corpus, each appear in `adr-state --json` `danglingSupersession`. CLEAN twin: with `041-…`, `042-…` and `043-…` present, none does. A record whose `superseded_by` is `null` or `[]` is in neither list | F-5 | S1, S2 |
| `supersedes is never read and superseded_by never moves a governing record` | `tests/corpus-shapes.test.mjs` | `status: active` with `supersedes: [001-x]` leaves `001-x` (`status: active`) governing in adr-state and work-next. `status: active` with `superseded_by: 009-y` stays governing and adds no dangling entry | F-6, F-5 | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | adr-state's dangling check (`adr-state.mjs:101`) reads `supersededBy`; the tests read its JSON as a process |
| 3 — the caller can discover it | `adr-state` text and JSON name a dangling supersession, as today |
| 4 — it is used | public/swift-adrs's 29 and public/active-status-adr's 12 superseded records after release; nothing measures this yet |

## Mutation Log
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · superseded_by supplies a missing target: without the read a status: superseded record names no replacement, so none dangles · acceptance-sha256:ce83bb843082acb57be17f88086e56d471c601b6d78b0d83f6d09acbae31178a
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · supersedes is not read: a key reader that also takes supersedes names the record a superseded record replaced as its replacement · acceptance-sha256:ce83bb843082acb57be17f88086e56d471c601b6d78b0d83f6d09acbae31178a
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · without the read a status: superseded record names no replacement, so none dangles · acceptance-sha256:ce83bb843082acb57be17f88086e56d471c601b6d78b0d83f6d09acbae31178a · covers:superseded_by supplies a missing target
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a key reader that also takes supersedes names the replaced record as the replacement · acceptance-sha256:ce83bb843082acb57be17f88086e56d471c601b6d78b0d83f6d09acbae31178a · covers:supersedes is not read

## Invariants

- `supersessionTarget` is unchanged, and so is every Status-written target.
- A record's kind comes from its own Status alone.

## Risks

- A `superseded_by` naming a record by a slug with no leading number, which `supersessionTarget` reads as nothing. public/frontmatter-adr names its records without numbers. Its one superseded record then names no target, as today, and no new false dangling entry appears.

## Stop Condition

Stop and ask if `danglingSupersession` on this repository's own corpus changes after S2.

## Out of Scope

- The archive-catalog effect readers (`lifecycle.mjs:2251`, `adr-retire-check:636`), as ADR-087 Context explains.

## Verification Log
- 2026-10-07 · 49bd0c3* · exit 1 · `out=$(node --test --test-reporter=tap tests/corpus-shapes.test.mjs 2>&1) \ …` · acceptance-sha256:ce83bb843082acb57be17f88086e56d471c601b6d78b0d83f6d09acbae31178a · ms:2643 · test-lock-sha256:f8e018c7df5baca04e90f4daf5ecc62de819778dc94f12d9399f6110b473418d · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvY29ycHVzLXNoYXBlcy50ZXN0Lm1qcwlhIE1BRFIgMiBidWxsZXQgc3RhdHVzIGlzIHJlYWQgYWJvdmUgdGhlIGZpcnN0IHNlY3Rpb24JZDRlZGIyODFkMDU0NTlkMzA3ZDIxNTIyNmM1YTdmZTY5MDY5MTI2Yjc2MzJjNGExYmEyY2IwMmI0Y2QxYmIyZQpib2R5CXRlc3RzL2NvcnB1cy1zaGFwZXMudGVzdC5tanMJYSBkaXJlY3RvcnkgbmFtZSBpcyBuZXZlciBhIHN0YXR1cwk5MmY4ZTkzNjg2YTZmYzEyMzlkNDM3MTEyODk5MmY3OGFiNGQzMDJkNTNiYzkzNmM4ZjQ5YWI5OTc4YjliZGM2CmJvZHkJdGVzdHMvY29ycHVzLXNoYXBlcy50ZXN0Lm1qcwlhIGZyb250bWF0dGVyIHN0YXR1cyBpcyByZWFkIGFzIGl0cyBjb3Jwb3JhIHdyaXRlIGl0CTRlNmJjYzVkY2VjNTQxNmM0MDJlYzBlZDU3Nzc3ZGZhNDAxZGM3MTM2MTZiYjNiZGI5MzMyYWFjZmM2ZTY2NjIKYm9keQl0ZXN0cy9jb3JwdXMtc2hhcGVzLnRlc3QubWpzCWEgZnJvbnRtYXR0ZXIgc3VwZXJzZWRlZF9ieSBuYW1lcyB0aGUgcmVwbGFjZW1lbnQgaW4gdGhlIHRocmVlIG1lYXN1cmVkIHNwZWxsaW5ncwljM2ZmODZlMTJjZDMxNDhjODJjNjkxMjdjNzg2NGQ0YTAwYTRmNmU5MWM4YzkwYjJjM2Y0ZTI1NDY1MGU5NGE4CmJvZHkJdGVzdHMvY29ycHVzLXNoYXBlcy50ZXN0Lm1qcwlhIHBsYWNlaG9sZGVyIG9yIGFuIHVubWFwcGVkIHN0YXR1cyBzdGF5cyB1bmRlY2lkZWQgYW5kIGlzIG5hbWVkCWRmMmQ2MWRiOTYxODllODhjZmJmNjUyNDRmNTEwZGYwNzJkOWUyZTE4YWE1MzY3YzkwNjNlNzlmZGUzYjJkOTcKYm9keQl0ZXN0cy9jb3JwdXMtc2hhcGVzLnRlc3QubWpzCWEgc3RhdHVzIGJ1bGxldCBpbnNpZGUgYSBzZWN0aW9uIGlzIG5vdCB0aGUgcmVjb3JkIHN0YXR1cwkxNzZkMWIzM2Q4MjI2OTc3YWI2NzBjMzY4YzdkMzg3ZTViNDQxOGIzMTFmNDUxODAzMThiY2U4ZmFhYzBjZDMxCmJvZHkJdGVzdHMvY29ycHVzLXNoYXBlcy50ZXN0Lm1qcwlzdXBlcnNlZGVzIGlzIG5ldmVyIHJlYWQgYW5kIHN1cGVyc2VkZWRfYnkgbmV2ZXIgbW92ZXMgYSBnb3Zlcm5pbmcgcmVjb3JkCTdmYzU0NDY5ZThhMTJjN2I2NzZhMDE3YmUyOTk5YzcwMTA3NmMwM2U0YjUxOGEwMTY3ZDRhMGZhMTBmYzkyZDQ
  ```
  ```
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/corpus-shapes.test.mjs 2>&1) \ …` · acceptance-sha256:ce83bb843082acb57be17f88086e56d471c601b6d78b0d83f6d09acbae31178a · ms:3116
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/corpus-shapes.test.mjs 2>&1) \ …` · acceptance-sha256:ce83bb843082acb57be17f88086e56d471c601b6d78b0d83f6d09acbae31178a · ms:2830
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/corpus-shapes.test.mjs 2>&1) \ …` · acceptance-sha256:ce83bb843082acb57be17f88086e56d471c601b6d78b0d83f6d09acbae31178a · ms:6743
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/corpus-shapes.test.mjs 2>&1) \ …` · acceptance-sha256:ce83bb843082acb57be17f88086e56d471c601b6d78b0d83f6d09acbae31178a · ms:4005
