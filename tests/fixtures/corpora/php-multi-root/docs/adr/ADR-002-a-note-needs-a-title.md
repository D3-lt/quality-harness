# ADR-002: A note needs a title

**Status:** Accepted
**Date:** 2026-08-12
**Owner:** notes team

## Context

Untitled notes cannot be found in the list, and the tag command accepted an empty tag.

## Existing Primitives Audit

Laravel's request validation already rejects a missing field.

## Decision

The API rejects a note with no title, and `notes:tag` refuses an empty tag.

## Alternatives Considered

- Defaulting the title to the first line — rejected, it hides the missing input.

## Consequences

One validation rule and one refusal.

## Wiring & Contract Changes

The notes API answers 422 for a missing title.

## Out of Scope

- Title length limits.
