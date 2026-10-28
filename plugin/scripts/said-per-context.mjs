// The retained CLI readers use the same stable marker shape as the native lifecycle.
import { createHash } from 'node:crypto'

export function itemMarker(item, stableText) {
  const digest = createHash('sha256').update(String(stableText)).digest('hex').slice(0, 8)
  return `<qh:${item}@${digest}>`
}
