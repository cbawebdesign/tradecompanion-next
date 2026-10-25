/**
 * Clock formatting for the timeline and the data ribbon.
 *
 * Justin ("Airtable DBs - Final"): "Instead of using AM or PM, can you change
 * it to military time? So instead of reading 11:30:00 AM just have it 11:30:00
 * or instead of 11:00 PM, just have the UI display 23:00. I think this will
 * help the spacing in the app and ideally be able to see more line items of
 * news for the available screen real estate."
 *
 * Saves three characters a row, which is the actual point — it buys back the
 * width the date prefix costs.
 *
 * THE LOCALE AND hourCycle ARE BOTH DELIBERATE. 'en-US' with hour12: false
 * renders midnight as "24:00:00" in V8, so a 00:xx alert would read as
 * tomorrow. hourCycle 'h23' pins the range to 00–23 regardless of what the
 * locale would otherwise choose, and en-GB agrees with it rather than fighting
 * it. Formatting is in the browser's own zone, which is ET on this desk and is
 * the basis every alert timestamp already uses.
 */

const TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
}

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  month: '2-digit',
  day: '2-digit',
  year: '2-digit',
}

/** 24-hour clock, e.g. "09:30:00", "23:00:00", "00:05:12". */
export function formatClock(date: Date | string | number): string {
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-GB', TIME_OPTS)
}

/**
 * Clock, prefixed with MM/DD/YY when the row is not from today.
 *
 * Justin wanted the day made explicit on the data-ribbon and drill-down panes
 * once they started showing more than one session; same-day rows stay
 * time-only so the common case keeps its width.
 */
export function formatClockWithDate(date: Date | string | number): string {
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const time = formatClock(d)
  if (d.toDateString() !== new Date().toDateString()) {
    return `${d.toLocaleDateString('en-US', DATE_OPTS)} ${time}`
  }
  return time
}
