/** Derive UTC+N string from the browser's current local offset. */
export function getLocalUtcStr() {
  const offsetMin = -new Date().getTimezoneOffset() // positive = east of UTC
  const h = Math.round(offsetMin / 60)              // handle half-hour zones
  if (h === 0) return 'UTC+0'
  return h > 0 ? `UTC+${h}` : `UTC${h}`
}
