# Queue jobs in Redis

* Status: accepted
* Deciders: the checkout team
* Date: 2026-10-06

## Context and Problem Statement

A slow mail server holds a web request open.

## Decision Outcome

Queue jobs in Redis and run a worker.
