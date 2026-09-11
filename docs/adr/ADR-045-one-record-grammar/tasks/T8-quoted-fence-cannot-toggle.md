# Task ADR-045-T8: A quoted fence line cannot toggle the grammar, and an open fence is named

**Depends-on:** T6
**Covers:** F-9, UC9-S1, UC9-S2, UC9-S3
**Estimated scope:** S (two functions in the lib; one writer helper in adr-verify; one check in adr-lint; one note in adr-next; three regressions; six catalogue entries)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

adr-verify quotes a failed run's last lines inside an indented ``` fence. A bound test that itself printed one ``` line put THREE fence lines into the Verification Log: the section walk went out of phase, `## Mutation Log` became text, and the next `--human` entry landed under it with exit 0. Reproduced 2026-09-11 on a fence whose command prints `chr(96)*3`. Fixed at the writer, through the grammar: `record.fence_safe(line)` spells a line whose first non-blank characters are ``` or ~~~ with a backslash before the marker, and `excerpt_fence` — now the ONE place adr-verify writes a fence into a record (the failure tail and the mutant detail) — passes every quoted line through it. The walk also reports what it cannot resolve: `record.unterminated_fence(text)` names the line and opener of a fence still open at end of text; adr-verify refuses to run or write against such a task (exit 2), adr-lint blocks a task on it and advises an ADR, adr-next carries it as the task's `unproven` note. And the walk reads CommonMark's second marker: a `## ` line inside a ~~~ fence is text, the same as inside ```.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | `_scan` returns the open fence; `unterminated_fence`, `fence_safe`; the ~~~ marker |
| `plugin/bin/adr-verify` | edit | `excerpt_fence`; the open-fence refusal before anything runs or is written |
| `plugin/bin/adr-lint` | edit | `check_unterminated_fence`: blocking on a task, advice on an ADR |
| `plugin/bin/adr-next` | edit | `unreadable_note` on the task's `unproven` field (landed with T10's rewiring) |
| `tests/evidence-chain.test.mjs` | edit | the printed fence line escaped; next entry in the log; open fence refused/blocked/advised |
| `tests/gates.test.mjs` | edit | `unterminated_fence`, `fence_safe`, tilde fence on the module alone; two tests that had frozen the one-marker reading now assert the grammar |
| `tests/gate-regressions.py` | edit | the legacy tilde-heading parity assertion now asserts the grammar |
| `tests/adr-next.test.mjs` | edit | an open fence is READY with the note; a closed one carries none |
| `tests/mutations.json` | edit | writer without `fence_safe`; refusal removed; block demoted; name returns None; `fence_safe` returns its input; tilde dropped |

## Ordered Steps

1. [S1] Reproduce under `/tmp`: record a fence that prints ```; `--human` lands under `## Mutation Log`. Bind the failing tests. [proof: acceptance]
2. [S2] `fence_safe`, `unterminated_fence`, `excerpt_fence`, the three gates' reports; recompute sections and digests over every tracked record (222 files, 0 differences; 0 open fences). [proof: acceptance]
3. [S3] Add the catalogue entries; run each with `node scripts/mutate.mjs --case`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'cannot toggle the grammar' tests/evidence-chain.test.mjs && node --test --test-name-pattern 'an unclosed fence is named by line' tests/gates.test.mjs && node --test --test-name-pattern 'code fence never closes' tests/adr-next.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a run that prints a fence line is quoted so the excerpt cannot toggle the grammar; an unclosed fence is refused and blocked` | `tests/evidence-chain.test.mjs` | the excerpt line is `  \```; `--human` read back IN `Verification Log`; `Mutation Log` holds only its row; adr-lint clean of the finding; a hand-left open fence: adr-verify exit 2 naming the line and writing nothing, adr-lint blocking on the task, advising on an ADR with a ~~~ opener | F-9, UC9-S1, UC9-S2 | S1, S2 |
| `record.py: an unclosed fence is named by line, a tilde fence is a fence, and fence_safe spells a fence line so it cannot toggle` | `tests/gates.test.mjs` | closed → None; open → `[line, opener]`; headings after it are text; a ~~~-fenced `## ` is text; `fence_safe` on six lines; a fence of only safe lines closes where written | F-9, UC9-S3 | S2 |
| `a task whose code fence never closes is READY with a note saying its sections could not be read` | `tests/adr-next.test.mjs` | JSON `unproven` and the human `⚠` line name the open fence by line; a closed fence carries no note | F-9, UC9-S2 | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `unterminated_fence` and `fence_safe` are in `record.__all__` |
| 2 — something selects it | `excerpt_fence` is the only fence writer in adr-verify (`rg -n '"  \x60\x60\x60"' plugin/bin/adr-verify` → one site) |
| 3 — the caller can discover it | three CLIs name the open fence by line |
| 4 — it is used | a recorded run that printed ``` is followed by an entry in the right section |

## Mutation Log

## Invariants

- No tracked record's sections or digest change under the two-marker walk (recomputed old vs new: 0 differences).
- A tool-written excerpt never contains a line the grammar reads as a fence.
- An open fence is reported, never closed for the author.

## Risks

- An author who WANTS a `~~~` line as text inside a ``` fence: it is text — a ~~~ never closes a ```, and vice versa (T10's closer rule).
- The escaped excerpt line renders in Markdown as literal backticks, which is what it is.

## Stop Condition

A green run while a run that prints ``` can move the next entry out of the Verification Log, or while an open fence hides headings from a gate that says nothing.

## Out of Scope

- Repairing an open fence (permanent: boundary: a reader that guessed where it should have closed would be reading a record that does not exist; every gate reports it instead)
- Escaping fence lines in output that is NOT written into a record — adr-verify's stdout (permanent: boundary: the grammar is about records; stdout is not a record)

## Notes

Class: every writer of a fence into a record — `rg -n '\x60\x60\x60' plugin/bin/adr-verify | rg 'block \+='` found two (the failure tail at the recording path and the mutant detail); both now go through `excerpt_fence`. Every reader of a fence marker — one, `_FENCE` in record.py, since T10. Two tests (`tests/gates.test.mjs` "legacy tilde-heading parity" and `tests/gate-regressions.py` `legacy_tilde_heading`) had frozen the one-marker reading as compatibility; ADR-018, which they cited, decided nothing about tildes, and the corpus measurement shows no record's exit changes. Found by the second Codex review of ADR-045 (A).

## Verification Log
