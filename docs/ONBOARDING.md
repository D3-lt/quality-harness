# Onboarding

How to get value out of this in the first hour, the first week, and after that —
and what to ignore while you are getting used to it.

If you have not installed it yet, that is three lines in the
[README](../README.md). If you want to *see* it work before reading anything,
start with [TUTORIALS.md](TUTORIALS.md); it takes about ten minutes and uses a
throwaway repository.

---

## The one idea

Everything here follows from a single sentence:

> **Evidence is written by a tool, or it is not evidence.**

An agent saying "all tests pass" and an agent that ran the tests produce the same
message. So the plugin stops asking. When work claims to be finished, the tool
runs the check itself and writes the command, the exit code, the duration and the
commit into a file in your repository.

Everything else — the records, the gates, the mutation runs — exists to protect
that one line from being faked.

---

## Hour one: use two commands and ignore the rest

**Do not adopt the whole lifecycle on day one.** Most of it is for work you have
not started yet, and reading it all first is the most common way people bounce off.

### 1. Ask where you are

```bash
work-next
```

In a repository with nothing set up:

```text
0 record(s), 0 accepted, 0 task file(s), 0 spec(s).

Next: /spec-write
  because there is no spec corpus at all, or the work is not yet decided.
  Nothing downstream can be verified against requirements nobody wrote.
```

It reads, decides nothing, and exits 0 whatever it finds. Run it whenever you have
lost the thread.

### 2. Ask an agent to do real work

```text
/quality-harness:work
```

Once, in your main session, for anything substantive. It classifies the work and
routes it — a bug goes straight to execution, a durable decision goes through a
record first. You do not have to know which; that is its job.

**That is hour one.** If you stop here you already have the main benefit: a `done`
that is backed by a recorded run instead of a sentence.

---

## What you will notice first, and why

### It asks you to say how the work will be checked, before the work

This is the tax, and it is deliberate. A task carries an `## Acceptance` command —
a shell line that decides the question. Writing it first is uncomfortable exactly
when it matters most: if you cannot say what would prove the work done, that is
information about the work, not about the tooling.

### It writes to your files

`adr-verify` modifies the task file — that is the point, and it says so every time:

```text
[adr-verify] WROTE this entry into … recording the run IS this tool's job, so the
file is now modified; commit it with the work it evidences.
```

Commit those entries with the change they evidence. They are the record.

### It never blocks you

Every gate advises. `adr-lint` will tell you a record is missing a section and
still exit in a way that lets you carry on; the mutation check will tell you a test
proved nothing and not stop the commit.

This is a design rule, not an oversight. A tool that stops you without explaining
leaves you worse off than no tool. If something here ever blocks you without
saying what to do next, that is a bug worth reporting.

### It says "I could not look"

A check that could not run reports `UNRUN`, `PARTIAL` or `UNPROVEN` — never a
clean result. If you see one of those words, nothing was measured, and it is not
a pass.

---

## Week one: add the mutation check

Once you have a few recorded runs, add the second half:

```bash
adr-verify <task.md> --mutant <file> --from '<exact text>' --to '<replacement>' \
  --why 'what this proves'
```

It breaks the code on purpose, runs your fence, restores the file, and tells you
whether the test noticed. `mutant killed` is the good answer.

**Start with one mutation on the code you would be most upset to see silently
broken.** [Tutorial 2](TUTORIALS.md#tutorial-2--find-a-test-that-cannot-fail)
walks through a real one, including what it looks like when a test turns out to
prove nothing.

Do not run a full campaign on day one. On this repository the whole catalogue is
447 mutations and takes about forty minutes — that is a CI and release activity,
not something to sit and watch.

---

## What to leave alone at first

| Thing | Read it when |
|---|---|
| The ADR corpus, `adr-write`, supersession | you are making a decision you would regret reversing — a public contract, a schema, a trust boundary |
| Specs and `spec-write` | requirements are genuinely unresolved, not just unwritten |
| `arch-lint`, architecture docs | you have modules whose boundaries people argue about |
| `adr-debt`, `adr-retire` | your corpus is big enough to have forgotten things in it |
| Workflows, `consensus`, `review-ring` | never, unless a specific situation calls for it |

None of these are prerequisites. They are for problems you may not have.

---

## Common questions

**Does it work with my language?**
It has no opinions about your language, layout or test runner. The acceptance
command is whatever you type — `go test ./...`, `pytest -k`, `npm test`. That
also means it will not guess for you.

**Will it slow my agent down?**
It takes more turns — measured at 2.33× on an eight-case ablation. But turns are
not a bill: in one profiled real session **99.2% of input tokens were cache
reads**, which are billed far below fresh input, because a long session re-reads a
prompt it already paid for. The README has both numbers and the caveats on each.

**Can I use it without an AI agent?**
Yes. Every gate in `bin/` is a plain `python3` or `node` program with a meaningful
exit code. They run from a Makefile or a CI job with no model involved.

**What if I disagree with a gate?**
Say so in the record and carry on — nothing blocks. If a gate is wrong often
enough to be noise, that is a defect in the gate, and this project treats "a check
people learn to ignore" as worse than no check.

**Do I have to write ADRs for everything?**
No, and you should not. A one-line fix is a one-line fix. Records are for
decisions that are costly to reverse.

---

## When something goes wrong

**A gate is not found.** The plugin's `bin/` is added to your `PATH` while it is
enabled. Run `qh-root` to see where it is installed. Note that a bare gate name
can resolve to an *installed* version rather than a working copy, which matters
only if you are developing the plugin itself.

**A mutation run was interrupted and left a file broken.** It is journalled:

```bash
adr-verify --restore --cwd <repo>
```

or just `git checkout -- <file>`. The journal exists because the failure mode —
silently committing a deliberate defect — is bad enough to be worth a file on
disk.

**Evidence stopped matching.** Changing an `## Acceptance` command invalidates
every entry recorded under the old one. That refusal is correct: the old entries
measured a different command. Re-run on a clean tree; never hand-edit a log.

---

## Where the honest numbers are

The [README](../README.md) carries the measured comparison, including the two
cases where the plugin bought **nothing** — the model did the right thing without
it and the only difference was more turns. Re-derive any of it yourself:

```bash
node scripts/eval-compare.mjs    # with/without, the only measurement with a baseline
node scripts/corpus-metrics.mjs  # what this corpus records, descriptive, no control
```
