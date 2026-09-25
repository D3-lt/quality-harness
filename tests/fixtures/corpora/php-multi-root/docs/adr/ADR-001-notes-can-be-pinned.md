# ADR-001: Notes can be pinned

**Status:** Accepted
**Date:** 2026-08-12
**Owner:** notes team

## Context

People lose the notes they return to most.

## Existing Primitives Audit

Notes carry no flags today.

## Decision

A note carries an `is_pinned` boolean, accepted by the API, set from the admin form,
documented in `routes.json`, and exposed to the web client in `client.d.ts`.

## Alternatives Considered

- A separate favourites table — rejected, one flag is enough.

## Consequences

Four tasks, two chains: the API before the form, the route document before the client types.

## Wiring & Contract Changes

The notes API gains one optional boolean.

## Out of Scope

- Pinning order.
