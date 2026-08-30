# ADR-001: A decision split across two repositories

**Status:** Accepted
**Date:** 2026-08-30
**Owner:** unassigned
**Spec:** None — no spec stage
**Cross-references:** docs/findings/a-doc-that-lives-in-another-repo.md
**Governs:** `src/`
**Enforced-by:** None — this fixture asserts gate behaviour, not its own enforcement
**Served-path change:** None — fixture.

## Context

A corpus that is one half of a two-repo decision, written the way real consumer corpora are rather
than the way this repository writes its own. Every shape here was reported by a peer session
running these gates against a real corpus on 2026-08-30, and each one produced a verdict the gate
had not earned.

## Decision

Hold these shapes as a fixture so the gates are exercised against a corpus this repository would
never author.

## Consequences

A gate that regresses on any of them fails here rather than in someone else's checkout.

## Alternatives Considered

- Asking peers to re-run by hand each release. Rejected: it found six defects in an hour precisely
  because nobody had automated it, and it does not scale past goodwill.

## Follow-ups

- [ ] (none at authoring)
