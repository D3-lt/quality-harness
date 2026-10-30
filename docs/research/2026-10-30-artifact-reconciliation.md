# Native artifact findings are reconciled against current evidence

The owner asked QH to offload models and to adapt useful ideas from Herdr. This bounded change applies current-state
revalidation and per-reconciliation identity reuse to the existing Go artifact importer. ADR-053, ADR-080 and ADR-005
supply the existing authority: false advisories are not findings, deferred results retain their evidence, and
an unobserved identity is unknown. No public command, ledger shape, hook registration or automatic project check is added.

## Failure reproduced

The former importer compared a finding with the last appended blob. In controlled native-import fixtures:

- A complete verdict for the current file could arrive before a late result for its old bytes. The late old result
  then became the last blob and its obsolete warning reached the action queue.
- A later row with unknown identity could hide the earlier current-content verdict in the same way.
- If the current file could not be identified, a different later blob could suppress a finding by treating that
  failed observation as proof that the current bytes differed.

The first run of `node --test tests/native-artifact-delivery.test.mjs` failed on assertions in six reordered/unknown-tail
subcases and the unreadable-current subcase. The fixtures change real files and call the native importer; their
pass-ledger rows simulate worker results. This is not a model behavior or external-corpus trial.

## Scope and implementation

Class: imports of deferred artifact verdicts. Enumeration:
`mrw read --grep 'importPassVerdicts\\(' core/hooks --max-lines 20` returned the production definition in artifact.go,
calls from artifactRule and startArtifactPass in that file, and handle in lifecycle.go; the new test file adds two
direct test calls. Those production callers keep the same importer.

The importer retains the existing later-different-verdict rule and additionally recognizes a known verdict for the
actual current bytes regardless of arrival order. An unknown current identity never establishes supersession.
Every verdict is still imported into history; only obsolete finding delivery is suppressed. Current failures,
unknown-identity findings, content returning to its former bytes, and once-only delivery keep their controls.

Current identities, including failed reads, are sampled at most once per path within one import. The cache is local
to that reconciliation, so a later import observes the file again. It is not a persistent cache or an atomic filesystem
snapshot.

## Observations

`go test ./hooks -run '^TestArtifactImport' -count=1 -v` passes the native arrival, uncertainty and read-budget tests.
The Node suite explicitly requires each named Go test to pass, so an empty test selection cannot supply its pass.

| Verdict rows | Paths | Identity callback calls within one reconciliation |
|--------------|-------|--------------------------------------------------|
| 51 | 1 | 1 |
| 765 | 15 | 15 |
| 2550 | 50 | 50 |

The read-budget matrix covers both real readable files and an injected unavailable-identity result. The latter measures
observation attempts, not successful filesystem reads. The native importer tests separately use a real non-regular
path to reproduce an unavailable identity.

All four entries in the artifact.go mutation catalogue were exercised: its existing scratch exclusion and the three
new guards for reordered results, unknown current identity and repeated identity reads. Each was noticed. The matching
native scratch-path campaign also noticed its sibling mutation. The previous locked tests were not changed.

## What this establishes

The replay suppresses obsolete queued warnings without asking a model to resolve their ordering, and places an
operation-count bound on file identification. It does not establish whole-session CPU, tokens, time or productivity
savings, installed uptake, Windows runtime behavior, or ADR-133 T2/T3 completion.

Herdr supplied the design ideas, not copied implementation: source-specific freshness, revalidation before notification,
and scaling checks over increasing cardinality. Its terminal lifecycle `done` remains separate from our implemented,
verified, integrated, delivered and effective claims.
