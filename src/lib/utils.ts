export { cn } from "cn"

const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
const absoluteFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
]

/** "3 hours ago", "yesterday", "just now". */
export function formatRelativeTime(date: Date, now = Date.now()): string {
  const seconds = Math.round((date.getTime() - now) / 1000)
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit)
  }
  return "just now"
}

/** Local date and time, e.g. "Sep 26, 2026, 10:00 AM". */
export function formatDateTime(date: Date): string {
  return absoluteFormat.format(date)
}
