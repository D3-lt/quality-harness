# Task ADR-076-T1: One worktree module, shipped, with an ownership contract any caller can keep

**Depends-on:** none
**Covers:** F-8
**Estimated scope:** M (a move, a CLI, an ownership record, one new test file)
**Owner:** unassigned
**Produces:** `build`, `remove`, `sweep`, `addOwned` and the `owner.json` contract in `plugin/scripts/worktree.mjs`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a worktree is built of the working-tree content`, `a leftover worktree is swept once its owners end`, `a recorded group keeps its tree`, `the CLI prints one JSON line`, `a setup failure removes the tree`

## Goal

`plugin/scripts/worktree.mjs` owns building, removing and sweeping a worktree of a checkout's working-tree content at `<git-common-dir>/qh-campaigns/<id>/tree`, as a module and as a CLI, with an ownership record any caller — a Node campaign, a Python gate — keeps before starting a process in the tree; `scripts/mutate.mjs` imports it instead of keeping its own copy (ADR-076 Decision, "One mechanism, shipped" and "Ownership").

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/worktree.mjs` | add | `build`, `remove`, `sweep`, `addOwned`, and the CLI `adr-verify` calls |
| `scripts/mutate.mjs` | edit | import the module; delete `campaignHome`, `sweepCampaigns`, `overlayTracked` and the build steps it moves; keep the child handshake, the selection hand-over and the cache |
| `tests/worktree.test.mjs` | add | the module and the CLI over a fixture repository |
| `tests/mutations.json` | edit | repoint ADR-075's entries to the moved code; add this task's |
| `docs/adr/ADR-076-a-recorded-mutant-runs-in-a-worktree.md` | edit | add `plugin/scripts/worktree.mjs` to **Governs:** once it exists |

## Ordered Steps

1. [S1] Write `tests/worktree.test.mjs` and see it fail: no module exists (TDD red). [proof: acceptance]
2. [S2] Move the build (stash or HEAD, `worktree add`, the untracked copy with a caller-given exclusion list, which the campaign fills with its lock, journal and cache, and the tracked-bytes overlay), `campaignHome`, `sweepCampaigns` and removal into `plugin/scripts/worktree.mjs`, each exported, with ADR-075's comments moved with them. Every setup step after `worktree add` removes the tree when it fails.
3. [S3] The ownership record: `build --owner <pid>` writes `<id>/owner.json` before `worktree add`; `addOwned(id, { group })` / `{ job }` (and `add-owned <id> --group N | --job ID` on the CLI) records a process before it starts. The sweep removes an `<id>` only when the owner and every recorded group or job has ended, and leaves an unreadable `owner.json` alone for a day.
4. [S4] The CLI: `build <root> --owner <pid> [--exclude <path>…]` prints one JSON line (`{ tree, id, builtMs, overlaid }` or `{ error }`) and exits 0 or 2; `add-owned`; `remove <id>`; `sweep <root>`. Then add `plugin/scripts/worktree.mjs` to ADR-076's **Governs:**, which cannot name a file before it exists.
5. [S5] Make `scripts/mutate.mjs` import them; `tests/mutate-isolation.test.mjs` stays green unchanged.
6. [S6] Repoint the ADR-075 catalogue entries whose code moved, and run every entry on both files, uncached and to completion (CLAUDE.md §18: a moved observable turns the old site's tests vacuous). [proof: mutation]
7. [S7] Record one killed mutant per Rests-on name with `adr-verify --mutant`. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/worktree.test.mjs tests/mutate-isolation.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE 'ok [0-9]+ - (a worktree holds the checkout.s working-tree content|a leftover worktree is swept once no owner lives|a recorded process group keeps its worktree from the sweep|the CLI builds and removes a worktree and says why it could not|a setup failure after worktree add removes the worktree|the campaign.s own files are never copied into its worktree)' "$T")" -eq 6
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a worktree holds the checkout's working-tree content` | `tests/worktree.test.mjs` | an uncommitted edit, an untracked file, a deletion and CRLF bytes under `eol=lf` are all in the tree | F-8 | S2 |
| `a leftover worktree is swept once no owner lives` | `tests/worktree.test.mjs` | a live owner keeps it; a dead one lets the sweep remove it and say so | F-8 | S3 |
| `a recorded process group keeps its worktree from the sweep` | `tests/worktree.test.mjs` | owner dead, recorded group alive: the sweep keeps the tree (POSIX); on Windows a live job pid keeps it | F-8 | S3 |
| `the CLI builds and removes a worktree and says why it could not` | `tests/worktree.test.mjs` | one JSON line; outside git, `{ error }` and exit 2 | F-8 | S4 |
| `a setup failure after worktree add removes the worktree` | `tests/worktree.test.mjs` | an injected overlay failure and an injected untracked-copy failure each leave no registered tree | — | S2 |
| `the campaign's own files are never copied into its worktree` | `tests/worktree.test.mjs` | the exclusion list reaches the untracked copy | — | S2, S5 |
| `a campaign leaves the working tree byte-identical and its mutants never appear there` | `tests/mutate-isolation.test.mjs` | the campaign still isolates through the moved code | — | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the module and its tests |
| 2 — something selects it | `scripts/mutate.mjs` imports it; T2 and T3 call it |
| 3 — the caller can discover it | the CLI's JSON line |
| 4 — it is used | every isolated campaign |

## Mutation Log
- 2026-09-30 · 521520d* · mutant killed · exit 1 · `plugin/scripts/worktree.mjs` · the tracked-bytes overlay is skipped, so the tree holds HEAD or the stash rather than the checkout bytes · acceptance-sha256:a5918c58021a1232a3b7d842a7feb9d970330d07a3f511d8e4ec9caca8c532df · covers:a worktree is built of the working-tree content
- 2026-09-30 · 521520d* · mutant killed · exit 1 · `plugin/scripts/worktree.mjs` · the sweep keeps every tree, so a dead owner leaves its worktree behind · acceptance-sha256:a5918c58021a1232a3b7d842a7feb9d970330d07a3f511d8e4ec9caca8c532df · covers:a leftover worktree is swept once its owners end
- 2026-09-30 · 521520d* · mutant killed · exit 1 · `plugin/scripts/worktree.mjs` · recorded groups and pids are ignored, so a live group loses its tree to the sweep · acceptance-sha256:a5918c58021a1232a3b7d842a7feb9d970330d07a3f511d8e4ec9caca8c532df · covers:a recorded group keeps its tree
- 2026-09-30 · 521520d* · mutant killed · exit 1 · `plugin/scripts/worktree.mjs` · the CLI exits 0 on a failed build, so a caller reads could-not-build as built · acceptance-sha256:a5918c58021a1232a3b7d842a7feb9d970330d07a3f511d8e4ec9caca8c532df · covers:the CLI prints one JSON line
- 2026-09-30 · 521520d* · mutant killed · exit 1 · `plugin/scripts/worktree.mjs` · a setup failure after worktree add leaves the registered tree behind · acceptance-sha256:a5918c58021a1232a3b7d842a7feb9d970330d07a3f511d8e4ec9caca8c532df · covers:a setup failure removes the tree

## Invariants

- `scripts/mutate.mjs`'s behaviour and output are unchanged (ADR-075).
- Nothing under the OS temp root is used for a tree (ADR-075: `plugin/scripts/lifecycle.mjs:347`).
- The sweep never removes a tree while any process it knows of may still work in it.

## Risks

- The move leaves an ADR-075 catalogue entry vacuous. S6 runs them all, uncached.

## Stop Condition

Stop and ask if a moved function cannot be exported without changing what the campaign prints.

## Out of Scope

- The campaign's child handshake and selection hand-over (permanent: boundary: they stay in `scripts/mutate.mjs`)

## Verification Log
- 2026-09-30 · 521520d* · exit 1 · `set -o pipefail …` · acceptance-sha256:a5918c58021a1232a3b7d842a7feb9d970330d07a3f511d8e4ec9caca8c532df · ms:53437 · test-lock-sha256:14436a0bf30b1776434298fd22d8fbaf5c69aa0dc671a00565b05d4f63204981 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL211dGF0ZS1pc29sYXRpb24udGVzdC5tanMJYSBjYW1wYWlnbiBjaGlsZCBkb2VzIG5vdCBoYW5kIGl0cyBtYXJrZXIgdG8gdGhlIHRlc3RzIGl0IHJ1bnMJMzA5MGQxNzMzMGQ0MDVmMWI1YjhmZTk1NzdjYzQ0ZWFiY2UyZTk3ZGYzODM5Njk5ZDczZmJiYTJhMDM4NTM1ZApib2R5CXRlc3RzL211dGF0ZS1pc29sYXRpb24udGVzdC5tanMJYSBjYW1wYWlnbiBsZWF2ZXMgdGhlIHdvcmtpbmcgdHJlZSBieXRlLWlkZW50aWNhbCBhbmQgaXRzIG11dGFudHMgbmV2ZXIgYXBwZWFyIHRoZXJlCTc2N2I1ZjMzYWQ5YWFhODY1MzIxOTU2NGQxNzNlMGNlYWYzOGE5ZmMxYjczNjAyMzdhNmIxMGMzYjFiZGEwYzkKYm9keQl0ZXN0cy9tdXRhdGUtaXNvbGF0aW9uLnRlc3QubWpzCWEgY2FtcGFpZ24gc2F5cyBpdHMgbG9hZCBsaW5lIG9uY2UsIGluIHBsYWNlIGFuZCBpc29sYXRlZAk5OTE5NjdlMzQwZjk2ZmNmMjVhM2I1ODI3OGFlZTE5YTgyNGRlN2JhZjFmNzU1ODQxMWVmZTg5NzRlNjI0ZTllCmJvZHkJdGVzdHMvbXV0YXRlLWlzb2xhdGlvbi50ZXN0Lm1qcwlhIGNhbXBhaWduIHN0b3BwZWQgd2l0aCBTSUdURVJNIGVuZHMgd2l0aGluIGl0cyBncmFjZSwgbm90IGFmdGVyIGl0cyByZW1haW5pbmcgZW50cmllcwkwNTZiYWQ5NjRlM2QwMGE3OGQwZjRiY2FiMGQ3ODM5N2ZhODAyNDNmN2QxNjE3YWQyZmZhOWFiNWEzNDcxYzIzCmJvZHkJdGVzdHMvbXV0YXRlLWlzb2xhdGlvbi50ZXN0Lm1qcwlhIGNhbXBhaWduIHN0b3BwZWQgd2l0aCBTSUdURVJNIHJlbW92ZXMgaXRzIHdvcmt0cmVlCTQ1MmNlMDQ0NjEzMTU4N2RkNDdjYzMxODFmNTg1NzI1MThhOTc2NjViZTVhYmFlM2QxZGJkYTlmMDI2MTI4ODYKYm9keQl0ZXN0cy9tdXRhdGUtaXNvbGF0aW9uLnRlc3QubWpzCWEgY2FtcGFpZ24gdGhhdCBjYW5ub3QgaXNvbGF0ZSBzdG9wcyBhbmQgbmFtZXMgLS1pbi1wbGFjZSwgd3JpdGluZyBub3RoaW5nCWUxZjcxMmFhMDUwNWUwNWMzNzZmNjNkMzhlMWE5MDc1MzFmYjU1NDI2NDYyZjc0MjRiMWE0NjllZTQ5MDQzZWQKYm9keQl0ZXN0cy9tdXRhdGUtaXNvbGF0aW9uLnRlc3QubWpzCWEga2lsbGVkIGNhbXBhaWduJ3Mgd29ya3RyZWUgaXMgcmVtb3ZlZCBieSB0aGUgbmV4dCBydW4sIGFuZCBzYWlkCWNmYTIyYWY4NDU0ZDk3YzUzOWU1YmQ1M2MxZjU1ODZmNDExYWZmMDNmNTcxZDQ2Y2UzY2UxYmQ0OTM0MzJhZTkKYm9keQl0ZXN0cy9tdXRhdGUtaXNvbGF0aW9uLnRlc3QubWpzCWEgc2Vjb25kIGNhbXBhaWduIHdhaXRzIHdoaWxlIGFuIG9ycGhhbmVkIGNoaWxkIG9mIHRoZSBmaXJzdCBzdGlsbCBydW5zCTQ0ZGI2MDhjYjU0N2I2MGU1N2QxM2Y2NzdmMmJiYjE4NzJiNzU1OWJjMDJmMzVhMTM2NDczNjA3MTRhNjlhOGMKYm9keQl0ZXN0cy9tdXRhdGUtaXNvbGF0aW9uLnRlc3QubWpzCWEgdHJhY2tlZCBmaWxlIGRlbGV0ZWQgaW4gdGhlIGNoZWNrb3V0IGlzIGFic2VudCBmcm9tIHRoZSB3b3JrdHJlZSB0b28JMmQ4NjdmMmU4Mjg2ZjQzYmU3MjlkNmFmYmZmYTRkYzI0OWViMjNlYTI3NmUxMmU0ZmM3YjhjMjMzM2QzZDFjOApib2R5CXRlc3RzL211dGF0ZS1pc29sYXRpb24udGVzdC5tanMJYSB2ZXJkaWN0IGNhY2hlIHRoYXQgY2Fubm90IGJlIHJlYWQgaW50byB0aGUgd29ya3RyZWUgaXMgbmVpdGhlciByZXVzZWQgbm9yIHJldHVybmVkLCBhbmQgdGhlIHdvcmt0cmVlIGdvZXMJMzAwNmJhZDQ0ZTE0NDYzMWUzYjJiNjVmYjc5NmQ4NjZlZjIxNjMxNWM4Yjk5MDZhNWI0ZmI0NDU4ZjZkYzg2MApib2R5CXRlc3RzL211dGF0ZS1pc29sYXRpb24udGVzdC5tanMJYSB2ZXJkaWN0IGNhY2hlIHRoYXQgY2Fubm90IGJlIHdyaXR0ZW4gYmFjayBpcyBsZWZ0IGFzIGl0IHdhcywgYW5kIHNhaWQJZjJmNDg3YWQ1NjY1N2VhMzgwY2M1YjliNjhmZDQwYzNkODFkNDRkYmJlN2RhMTY4MDZjOWQ4ZmRkMWMxYTcwZQpib2R5CXRlc3RzL211dGF0ZS1pc29sYXRpb24udGVzdC5tanMJYW4gaW4tcGxhY2UgY2FtcGFpZ24gbmFtZXMgdGhlIHByb2Nlc3NlcyBydW5uaW5nIHRoaXMgY2hlY2tvdXQsIGFuZCBzYXlzIHdoZW4gaXQgY291bGQgbm90IGxvb2sJZjhiNTE4ZDBiNmY0OTIzMGM5NjgxZTU4ZWZiMjQ5NWIxYzIwOTc0NDdmYjdlMGM5YTYzMjZhN2RkNjRhMDZjZgpib2R5CXRlc3RzL211dGF0ZS1pc29sYXRpb24udGVzdC5tanMJYW4gaXNvbGF0ZWQgY2FtcGFpZ24gcmV1c2VzIGFuZCByZXR1cm5zIHRoZSBjaGVja291dCdzIHZlcmRpY3QgY2FjaGUJODliMzYxYmRhMGYwNzkyMTk2OWZlZDc3MDFmYzU4ZTA5OWM2ZDJhNDdmYTJjZmM1Mzk5Y2MyMjNlMDU5MDg4Mwpib2R5CXRlc3RzL211dGF0ZS1pc29sYXRpb24udGVzdC5tanMJYW4gaXNvbGF0ZWQgY2FtcGFpZ24gcnVucyBleGFjdGx5IHRoZSBlbnRyaWVzIGFuIGluLXBsYWNlIG9uZSBzZWxlY3RzCTk1ODBkYjJkODJjNGVkYjk2ZTI3M2M3ZWFiNDhmMGUxMzMxYzNjNWUxOTJjNzYxOTEyZDAxNjA0ZTk4ZDQ3NmIKYm9keQl0ZXN0cy9tdXRhdGUtaXNvbGF0aW9uLnRlc3QubWpzCWFuIGlzb2xhdGVkIGNhbXBhaWduIHJ1bnMgb3ZlciB0aGUgYnl0ZXMgaW4gdGhlIGNoZWNrb3V0LCBub3QgdGhlIG9uZXMgZ2l0IG5vcm1hbGlzZXMJMDJiNWEyZTFhNzljODRjYzJhODNhNTJjNzFlMjM1ODIyYTU0Zjc0OWZlZmNhNjYzNjdhYTZlYTRlMjhlNmM4ZQpib2R5CXRlc3RzL211dGF0ZS1pc29sYXRpb24udGVzdC5tanMJYW4gaXNvbGF0ZWQgY2FtcGFpZ24ncyB3cml0dGVuLWJhY2sgY2FjaGUgaXMgb25lIENJJ3MgbWVyZ2Ugam9iIGNhbiByZWFkCTZmYjM2YTlmZjRlZDYxZTFiMzljMDg3NDIyYmVkM2JiYjhiZDQ2MTJmNjU2Mzg0NDkyYzViZmQyNjg0OTQ3MTUKYm9keQl0ZXN0cy9tdXRhdGUtaXNvbGF0aW9uLnRlc3QubWpzCWFuIGlzb2xhdGVkIGNoaWxkIHdob3NlIHBhcmVudCBlbmRlZCBiZWZvcmUgcmVjb3JkaW5nIGl0IGRvZXMgbm90IHN0YXJ0CTYyOTNjOWRlMGRmYzk3ZmM2YzYyODY1MmM4ZTdhMDcwMjMyNTU1MTU5NzFkZmQyMmE5MjZmOTQ3ZWZmZTc2ZjkKYm9keQl0ZXN0cy9tdXRhdGUtaXNvbGF0aW9uLnRlc3QubWpzCWFuIGlzb2xhdGVkIHJ1biBhbmQgYW4gaW4tcGxhY2UgcnVuIG9mIHRoZSBzYW1lIGVudHJpZXMgZ2l2ZSB0aGUgc2FtZSB2ZXJkaWN0cwk4MTVhOWNlOTIyMTU4NTg0MjVjMWVkYWM0NGQzMzc3ZmIzM2NmNWE0YWI1YjdhNzVlYzdiYjQ3MjgwODA1MGU4CmJvZHkJdGVzdHMvbXV0YXRlLWlzb2xhdGlvbi50ZXN0Lm1qcwlhbiB1bmNvbW1pdHRlZCB0ZXN0IGVkaXQgYW5kIGFuIHVudHJhY2tlZCB0ZXN0IGFyZSBncmFkZWQgYXMgYW4gaW4tcGxhY2UgcnVuIGdyYWRlcyB0aGVtCTdhYWVkODI5ODkxYjAxZDY0NzRlNTlhNWFiOTFkMjU1YzdkYWVkMGVkMmQxZjVmNjk3Y2FjNTllZGZiMjQ4MjYKYm9keQl0ZXN0cy93b3JrdHJlZS50ZXN0Lm1qcwlhIGxlZnRvdmVyIHdvcmt0cmVlIGlzIHN3ZXB0IG9uY2Ugbm8gb3duZXIgbGl2ZXMJMDE4OWEyNWFjMmM5NDZjZDRhNjFkNTI2MTEyZWEwMjgxMGYwNjIzNTYyODRlMWY0Y2E3NGM2Y2MzZWM1NzllMQpib2R5CXRlc3RzL3dvcmt0cmVlLnRlc3QubWpzCWEgcmVjb3JkZWQgcHJvY2VzcyBncm91cCBrZWVwcyBpdHMgd29ya3RyZWUgZnJvbSB0aGUgc3dlZXAJYzQ4ZmIyZWY1Zjk3NWI3MTllZWY3ZDc5NTUzOWQxODA2N2RkZGMzMDg1NmMxOTUzNDYzY2VmOGZhMjMzMjg5OQpib2R5CXRlc3RzL3dvcmt0cmVlLnRlc3QubWpzCWEgc2V0dXAgZmFpbHVyZSBhZnRlciB3b3JrdHJlZSBhZGQgcmVtb3ZlcyB0aGUgd29ya3RyZWUJMzJjMWRhZTEwYTA4ZjgwYjJmODQyYmI3M2E4OGZkMjYxNmM4OGQ0NTZmOTg0MWJjNmI1ODc0MDVkNzhkYjg3Ygpib2R5CXRlc3RzL3dvcmt0cmVlLnRlc3QubWpzCWEgd29ya3RyZWUgaG9sZHMgdGhlIGNoZWNrb3V0J3Mgd29ya2luZy10cmVlIGNvbnRlbnQJYjFjZmQ3YmY3NGIzNWQ2MjkyMjU0OWY1ZmIyYzU3NjA2NzZjYWY5MGFhN2E4MWEwMzZhMTUyNmIzOGNiNjE1MApib2R5CXRlc3RzL3dvcmt0cmVlLnRlc3QubWpzCXRoZSBDTEkgYnVpbGRzIGFuZCByZW1vdmVzIGEgd29ya3RyZWUgYW5kIHNheXMgd2h5IGl0IGNvdWxkIG5vdAliNDQ1ZDFhMGVjYzMxZTgzZWJlNjRhNjc3NjUwMjNiZTdhODllOTIwZmM3ODU0ZTc2NjM2YjEzYjcwNDE1Y2UwCmJvZHkJdGVzdHMvd29ya3RyZWUudGVzdC5tanMJdGhlIGNhbXBhaWduJ3Mgb3duIGZpbGVzIGFyZSBuZXZlciBjb3BpZWQgaW50byBpdHMgd29ya3RyZWUJYjczMGE1NGQ0OWViZDA5ZDkzMDIzNDM0NjA0ZTRmYTQyZTRhMzI2ZWZlYjRiN2RiNzBmYTI5NmE4ZDdiMGVhNg
  ```
  --- last 10 line(s) of stdout (of 280 after folding 281 raw)
    ...
  1..25
  # tests 25
  # suites 0
  # pass 19
  # fail 6
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 53244.809084
  ```
- 2026-09-30 · 521520d* · exit 0 · `set -o pipefail …` · acceptance-sha256:a5918c58021a1232a3b7d842a7feb9d970330d07a3f511d8e4ec9caca8c532df · ms:48643
- 2026-09-30 · 521520d* · exit 0 · `set -o pipefail …` · acceptance-sha256:a5918c58021a1232a3b7d842a7feb9d970330d07a3f511d8e4ec9caca8c532df · ms:49716
- 2026-09-30 · 521520d* · exit 0 · `set -o pipefail …` · acceptance-sha256:a5918c58021a1232a3b7d842a7feb9d970330d07a3f511d8e4ec9caca8c532df · ms:51784
- 2026-09-30 · 521520d* · exit 0 · `set -o pipefail …` · acceptance-sha256:a5918c58021a1232a3b7d842a7feb9d970330d07a3f511d8e4ec9caca8c532df · ms:47249
- 2026-09-30 · 521520d* · exit 0 · `set -o pipefail …` · acceptance-sha256:a5918c58021a1232a3b7d842a7feb9d970330d07a3f511d8e4ec9caca8c532df · ms:47405
