# Task ADR-001-T1: add items, in a lower-case file name

**Depends-on:** none

## Goal

`Add` sums cents. Its name sorts before `T1-add.md` where paths compare without case (Windows), after it by code point.

## Acceptance

```bash
test -f go.mod
```
