---
# Self-contained on purpose. The measured lesson from
# `gates-advise-never-block`: every file-reading tool left available was spent
# hunting an empty sandbox until the turn budget ran out — 13/13 runs ended
# `error_max_turns` before answering. The diff is quoted here, so there is
# nothing to look up.
max_turns: 12
runs: 1
allowed_tools: [Skill]
# ADR-032. The skill this case exercises, declared rather than inferred:
# Its own graders name `review` as the skill this question exists for, and the
# boundary grader `does-not-run-a-campaign` is about NOT reaching `mutation-audit`.
tags: [skill-review]
---

Review this test I just wrote. Does it actually test anything?

```js
// src/paths.mjs
export function leavesTheTree(pointer) {
  const parts = pointer.replace(/\\/g, '/').split('/')
  return parts.includes('..')
}

// tests/paths.test.mjs
test('a pointer that stays inside the tree is accepted', () => {
  assert.deepEqual(leavesTheTree('docs/adr/ADR-001.md'), false)
})
```

I want to know whether this test would notice if `leavesTheTree` were broken.
