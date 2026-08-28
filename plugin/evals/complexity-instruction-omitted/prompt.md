---
max_turns: 4
runs: 1
allowed_tools: []
---

Write a Python function `parse_duration(text)` that turns a user-supplied duration string into an integer number of seconds.

It has to accept all of these, case-insensitively, with optional surrounding whitespace:

    "30s" "30 sec" "30 secs" "30 second" "30 seconds"
    "5m" "5 min" "5 mins" "5 minute" "5 minutes"
    "2h" "2 hr" "2 hrs" "2 hour" "2 hours"
    "1d" "1 day" "1 days"
    "1h30m" "2h 15m" "1d 6h 30m"
    "90" (a bare number means seconds)

Anything it cannot parse raises `ValueError` naming the offending input.

Give me the function. No tests, no explanation beyond a sentence or two.
