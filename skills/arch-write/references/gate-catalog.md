# Gate catalog — per-ecosystem mechanisms for architecture checks

The invariant is always the same: a rule row binds to a command whose exit code proves it.
Pick the cheapest mechanism the repo's toolchain already supports. A grep gate is a valid
check — crude beats prose.

## Python

- **Dependency direction:** import-linter (`.importlinter`, contracts: layers/forbidden/independence), run via pytest or `lint-imports`.
- **Concept parity:** pytest parity test asserting two representations agree (e.g. generated contract vs pydantic model fields).
- **Grep gate:** `pytest`-wrapped `subprocess.run(["grep", ...])` asserting zero hits, or a plain `! grep -rn <pattern> <dir>` in the Gate command.
- **Schema assertion:** pydantic `model_json_schema()` snapshot test.
- **Composition root:** import-linter forbidden contract: only `main`/`deps` may import adapter modules.

## Rust

- **Dependency direction:** crate boundaries + `pub(crate)` visibility (compiler-enforced — cite the module path as the check); `cargo deny` for external deps; unit test with `#[cfg(test)]` compile-fail via `trybuild` for API surface.
- **Concept parity:** unit test comparing serde-serialized forms; `insta` snapshot.
- **Grep gate:** `! grep -rn <pattern> src/` (e.g. "no direct DB access outside repository mod").
- **Composition root:** visibility — constructors `pub(crate)` in a `bootstrap`/`main` path.

## PHP / Laravel

- **Dependency direction:** deptrac (`deptrac.yaml` layers) or Pest arch tests (`arch()->expect('App\\Domain')->not->toUse('App\\Http')`).
- **Concept parity:** PHPUnit/Pest test asserting config/enum/table agreement.
- **Grep gate:** `! grep -rn <pattern> app/`.
- **Composition root:** service-provider-only construction — Pest arch `toOnlyBeUsedIn` on providers.

## TypeScript / React

- **Dependency direction:** dependency-cruiser (`.dependency-cruiser.cjs`) or eslint `import/no-restricted-paths` / eslint-plugin-boundaries.
- **Concept parity:** vitest test asserting generated API types vs runtime zod schema.
- **Grep gate:** `! grep -rn <pattern> src/`.
- **Composition root:** boundaries rule — only `app/` may import adapter modules.

## Ansible / infrastructure

- **Dependency direction:** role dependency graph — `ansible-lint` custom rule or grep on `include_role`/`import_role` targets.
- **Concept parity:** assert one source for a value — verify that a literal such as a port,
  version, or quorum size appears only in the repository-owned variables source and not in roles.
- **Grep gate:** primary mechanism here; wrap several in a `make arch-check` target as the Gate command.
- **Composition root:** inventory + group_vars own all environment facts; playbooks reference, never define.

## Gates that cannot fail (vacuous-pass modes — audit every check for these)

A gate that cannot fail is worse than no gate — it reads as coverage. Live modes seen in real
repos; `arch-lint` catches the statically detectable ones, the rest need the red proof:

1. **Markdown-escaped `\|` copied into a shell** — the pattern matches nothing, grep never hits,
   `!` passes forever. Antidote: commands live in script/test files; the doc cell cites the path.
2. **`! grep -r PAT missing-path`** — grep exits 2 on a missing path, `!` inverts it into a
   permanent pass. Antidote: `grep -rn PAT path; test $? -eq 1`, or wrap in a test that errors
   loudly when the path is absent.
3. **`pytest -k <selector>` matching zero tests** — can exit 0 depending on plugins/config.
   Antidote: cite explicit test paths, not `-k` selectors; or assert the collected count first.
4. **`npm --prefix missing-dir test`** and cousins — tool errors on setup, wrapper swallows it.
   Antidote: `test -d dir && …` so absence fails loudly.

**Red proof (mandatory for every new check):** run the check passing, then deliberately violate
the rule (or mutate the input), observe the check FAIL, revert. A check never seen red is
unverified — same TDD principle as task Acceptance. Record the red run in the authoring output.

## Any ecosystem

- **Owning-task/ADR existence:** `test -f <repository-owned-decision-path>`.
- **File-count / structure pinning:** `test $(ls <dir> | wc -l) -eq N` for "nothing else may live here".
- **Cross-repo non-derivation** (rule lives in the consuming repo): grep that the consumer reads the field instead of recomputing — `! grep -rn '<recompute-signature>' src/`.
