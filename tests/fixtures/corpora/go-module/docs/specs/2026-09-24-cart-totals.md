# Spec: Cart totals are integer cents

> **Date:** 2026-09-24 · **Status:** Ready-for-ADR
> **Owner:** cart maintainers · **Becomes:** ADR-001 (`ADR-001-cart-totals-are-integer-cents.md`)
> **Cross-references:** none

## Problem

Float totals drifted by a cent on large carts.

## Goal

Every cart total is an integer number of cents.

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | `Add` leaves its input unchanged | `internal/cart/cart_test.go::TestAdd` | @implemented | |
