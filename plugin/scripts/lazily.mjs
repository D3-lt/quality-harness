// A read that happens when it is first asked for and at most once, however many times it is asked. The facts a judgement takes
// (BACKLOG section 375, stage C) are made of these: a decision that stops early reads no more than it needs, and one that asks
// twice is answered from the first read, so it cannot see two different worlds.
export function once(read) {
  let done = false
  let value
  return () => {
    if (!done) {
      value = read()
      done = true
    }
    return value
  }
}
