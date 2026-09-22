// A silence check is about an advisory. The pause line is a different sentence
// on the same channel: flushOutput appends it to systemMessage and stderr when
// the hook took at least 5 seconds. Windows run 35439248428 failed a scripted
// session because that line was the only thing PreToolUse said.
//
// hookSaid removes that one sentence and leaves everything else. The notice
// itself is tested in tests/lifecycle.test.mjs, which sets the threshold to 0.
import { SLOW_HOOK_NOTE } from '../plugin/scripts/lifecycle.mjs'

export function stripPauseLines(text) {
  return String(text ?? '')
    .split('\n')
    .filter(line => !SLOW_HOOK_NOTE.test(line.trim()))
    .join('\n')
    .trim()
}

// stdout is one JSON object. A systemMessage that is only the pause line is
// silence; any other key, or any other line, is still something the hook said.
export function hookSaid(stdout, stderr = '') {
  const raw = String(stdout ?? '').trim()
  let spoken = stripPauseLines(raw)
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed.systemMessage === 'string') {
        const rest = stripPauseLines(parsed.systemMessage)
        if (rest) parsed.systemMessage = rest
        else delete parsed.systemMessage
      }
      spoken = Object.keys(parsed).length === 0 ? '' : JSON.stringify(parsed)
    } catch {
      spoken = stripPauseLines(raw)
    }
  }
  const err = stripPauseLines(stderr)
  return { stdout: spoken, stderr: err, text: `${spoken}${err}`.trim() }
}
