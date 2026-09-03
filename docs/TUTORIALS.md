# Tutorials

Two walkthroughs. Both are short, both use a throwaway repository, and **every
line of output below was produced by running the commands** — nothing here is
illustrative.

Copy the setup and you should see the same thing, modulo dates and commit hashes.

---

## Tutorial 1 — make a "done" you can check

**What you will see:** the tool run your check and write down what happened, into
a file you can read and commit.

### Set up a throwaway repository

```bash
mkdir /tmp/qh-tutorial && cd /tmp/qh-tutorial && git init -b main .

cat > duration.py <<'EOF'
def parse_seconds(text):
    """Turn '30s' into 30."""
    return int(text.rstrip("s"))
EOF

cat > test_duration.py <<'EOF'
import unittest
from duration import parse_seconds

class T(unittest.TestCase):
    def test_plain_seconds(self):
        self.assertEqual(parse_seconds("30s"), 30)
EOF

git add -A && git commit -qm init
```

### Write a task file

A task is a small markdown file whose most important section is `## Acceptance` —
a shell command that decides whether the work is done. Create
`docs/adr/ADR-001-parse-durations/tasks/T1-seconds.md`:

````markdown
# Task ADR-001-T1: Parse a plain seconds string

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`parse_seconds("30s")` returns the integer 30.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `duration.py` | edit | the function under test |
| `test_duration.py` | edit | the test that must be able to fail |

## Ordered Steps

1. [S1] Write the failing test first and confirm it is red. (TDD red.)
2. [S2] Implement `parse_seconds`. [proof: acceptance]

## Acceptance

```bash
python3 -m unittest -v test_duration 2>&1 | tee /tmp/t1.out && grep -q "OK" /tmp/t1.out
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `test_plain_seconds` | `test_duration.py` | a bare seconds suffix parses | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test above |
| 2 — something selects it | unittest discovery runs it |
| 3 — the caller can discover it | it is the module's only public function |
| 4 — it is used | imported by the test |

## Mutation Log

## Verification Log

## Invariants

- The test fails when `parse_seconds` stops parsing a plain seconds string.

## Risks

- None — one function, one case.

## Stop Condition

Stop if the suffix grammar turns out to need more than a strip.

## Out of Scope

- Minutes, hours and days (deferred: docs/BACKLOG.md §1)
````

`## Mutation Log` and `## Verification Log` are left **empty on purpose**. The tool
appends to them and refuses to create them — a task file's shape is yours, not the
tool's.

### Run it

```bash
adr-verify docs/adr/ADR-001-parse-durations/tasks/T1-seconds.md
```

```text
[adr-verify] WROTE this entry into docs/adr/ADR-001-parse-durations/tasks/T1-seconds.md's
## Verification Log — recording the run IS this tool's job, so the file is now modified;
commit it with the work it evidences.
- 2026-09-03 · 1d9381f* · exit 0 · `python3 -m unittest -v test_duration 2>&1 | tee /tmp/t1.out && grep -q "OK" /tmp/t1.out` · acceptance-sha256:b43e2374… · ms:75
```

**That line is the whole idea.** It is in your repository now, and it says:

| field | meaning |
|---|---|
| `2026-09-03` | when |
| `1d9381f*` | the commit — and `*` means the tree was **dirty**, so this evidence does not point at a commit that contained exactly what ran |
| `exit 0` | what the command actually returned |
| `` `python3 -m unittest …` `` | the command, as run |
| `acceptance-sha256:…` | a digest of the whole fence. **Change the command and every earlier entry stops matching**, because it no longer proves what it claimed |
| `ms:75` | how long it took — a number the file cannot produce, so a typed entry has to invent one |

Nothing here was written by a model. If it says `exit 0`, a process exited 0.

---

## Tutorial 2 — find a test that cannot fail

**What you will see:** the tool break your code on purpose and tell you whether
your test noticed. This is the part that catches the failure people never catch by
reading.

### The test is real — the mutant dies

```bash
git add -A && git commit -qm evidence

adr-verify docs/adr/ADR-001-parse-durations/tasks/T1-seconds.md \
  --mutant duration.py \
  --from 'int(text.rstrip("s"))' --to '0' \
  --why 'the test must notice the parser returning a constant'
```

```text
[adr-verify] MUTANT APPLIED to duration.py: this file is deliberately broken until the fence finishes.
[adr-verify] if this run is killed, restore it with `adr-verify --restore --cwd /tmp/qh-tutorial`,
             or `git checkout -- duration.py`.
- 2026-09-03 · aa79670* · mutant killed · exit 1 · `duration.py` · the test must notice the parser returning a constant · acceptance-sha256:b43e2374…
```

**`mutant killed`** — the parser was made to return `0`, and the test went red. The
test is load-bearing. The file is restored automatically, and the restore is
journalled to disk first so a `kill -9` mid-run does not leave your code broken.

### Now weaken the test — and watch the tool refuse to call it evidence

Replace the assertion with one that cannot fail:

```python
def test_plain_seconds(self):
    parse_seconds("30s")
    self.assertTrue(True)
```

The suite is still **green**. `python3 -m unittest` passes. Coverage still reports
the line as covered. Run the same mutation:

```text
[adr-verify] NOT evidence: the fence passed with the mechanism broken; it may not
materialize, compile, load, or assert on the changed path. Only `killed` counts
(adr-verify exits 1; the `exit 0` in the row above is the FENCE's code, which is
what a survivor means).
```

**That is the whole product in one message.** A green suite, a covered line, and a
test that proves nothing — and the only thing that noticed was a tool that broke
the code and looked.

Note what it did *not* say. It did not say your test is bad, or guess why. It
reported what it observed — the fence passed while the mechanism was broken — and
listed the reasons that could explain it. It exits non-zero and **it does not stop
you committing**.

---

## Where to go next

- **[ONBOARDING.md](ONBOARDING.md)** — the first week, what to expect, and what to
  skip while you are getting used to it.
- `work-next` — run it in your repository any time to be told which stage is
  waiting and why. It reads, judges nothing, and exits 0 whatever it finds.
- The [README](../README.md) has the measured numbers, including what this costs
  and the cases where it bought nothing.
