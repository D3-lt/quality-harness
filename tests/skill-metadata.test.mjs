import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const skillsRoot = resolve(testDir, "../skills");

function frontmatterOf(path) {
  const text = readFileSync(path, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  assert.ok(match, `${path}: missing YAML frontmatter`);
  return match[1];
}

function scalar(frontmatter, key) {
  const lines = frontmatter.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (start === -1) return "";
  const inline = lines[start].slice(key.length + 1).trim();
  if (inline && ![">", ">-", "|", "|-"].includes(inline)) {
    return inline.replace(/^['"]|['"]$/g, "");
  }
  const continuation = [];
  for (const line of lines.slice(start + 1)) {
    if (line && !/^\s/.test(line)) break;
    if (line.trim()) continuation.push(line.trim());
  }
  return continuation.join(" ");
}

function skillPaths() {
  const paths = [];
  for (const entry of readdirSync(skillsRoot)) {
    const directory = join(skillsRoot, entry);
    if (!statSync(directory).isDirectory()) continue;
    const direct = join(directory, "SKILL.md");
    try {
      if (statSync(direct).isFile()) paths.push(direct);
    } catch {}
  }
  return paths.sort();
}

test("every bundled skill has discoverable routing metadata", () => {
  const paths = skillPaths();
  assert.equal(paths.length, 12, `unexpected bundled skill count: ${paths.length}`);
  for (const path of paths) {
    const frontmatter = frontmatterOf(path);
    const name = scalar(frontmatter, "name");
    const description = scalar(frontmatter, "description");
    const directoryName = dirname(path).split("/").at(-1);
    assert.equal(name, directoryName, `${path}: name must match its skill directory`);
    assert.ok(description.length >= 40, `${path}: description is too thin for discovery`);
    assert.match(
      description,
      /\b(use|when|ask|invoke|trigger)/i,
      `${path}: description must say when the skill should be selected`,
    );
  }
});

test("overlapping lifecycle skills state a negative routing boundary", () => {
  const routed = new Set([
    "adr-execute",
    "adr-retire",
    "adr-write",
    "arch-write",
    "codex-advise",
    "codex-review",
    "execution",
    "postmortem",
    "quality-policy",
    "review",
    "spec-write",
    "work",
  ]);
  for (const path of skillPaths()) {
    const frontmatter = frontmatterOf(path);
    const name = scalar(frontmatter, "name");
    if (!routed.has(name)) continue;
    assert.match(
      scalar(frontmatter, "description"),
      /\b(do not|never|instead|rather than)\b/i,
      `${path}: overlapping lifecycle skill needs a negative routing boundary`,
    );
  }
});

// The coordinator named every stage but never told anyone to enter one: the routing
// table is a mapping, and the only imperative verbs about invocation were prohibitions.
// A run therefore stopped after classifying and waited to be told the next stage by
// name, which is the one thing a coordinator must not need.
test("the coordinator drives its routed chain instead of naming stages", () => {
  // Collapse wrapping first: these are prose assertions, and a sentence that happens
  // to break across two lines is the same sentence.
  const body = readFileSync(join(skillsRoot, "work", "SKILL.md"), "utf8").replace(/\s+/g, " ");
  const required = [
    [/classification is the decision/i, "classification must be stated as a decision, not a proposal"],
    [/invoke the routed skill in the same turn/i, "routing must carry an imperative to enter the stage"],
    [/resume the routed chain/i, "a satisfied gate must resume the chain, not hand off"],
    [/brainstorm/i, "requirements discovery must be bounded to spec-write against ideation skills"],
  ];
  for (const [pattern, why] of required) {
    assert.match(body, pattern, `skills/work/SKILL.md: ${why}`);
  }
});
