/**
 * Most recent past 4pm ET (NY) timestamp, skipping weekends.
 *
 * Used as the `since` param for /AlertsBySymbol so the data ribbon shows
 * every PR/filing/TX/catalyst since the previous market close — not just
 * since midnight today. Justin's GEMI report (5/15): after-close earnings
 * + a 5/14 16:32 PR were hidden because the server defaulted to "midnight
 * ET today" when no since was provided.
 *
 * Holidays not currently filtered. Walking back one extra day on a Tuesday
 * after a Monday holiday will simply return Monday 4pm, which is fine —
 * the goal is "don't lose after-close events", not exact market calendar.
 */
export function prevMarketCloseISO(): string {
  const now = Date.now()

  function getETDateParts(ts: number) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    })
    const parts = Object.fromEntries(fmt.formatToParts(new Date(ts)).map((p) => [p.type, p.value]))
    return {
      yyyymmdd: `${parts.year}-${parts.month}-${parts.day}`,
      dow: parts.weekday,
    }
  }

  // Resolve 4pm ET on a given YYYY-MM-DD to its UTC ms. Picks the UTC hour
  // (20:00 in EDT, 21:00 in EST) that renders back as 16:00 in NY.
  function et4pmAsUtcMs(yyyymmdd: string): number {
    const candidates = [
      Date.parse(`${yyyymmdd}T20:00:00Z`),
      Date.parse(`${yyyymmdd}T21:00:00Z`),
    ]
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23',
    })
    for (const c of candidates) {
      if (fmt.format(new Date(c)) === '16') return c
    }
    return candidates[0]
  }

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const { yyyymmdd, dow } = getETDateParts(now - dayOffset * 86400000)
    if (dow === 'Sat' || dow === 'Sun') continue
    const closeUtc = et4pmAsUtcMs(yyyymmdd)
    if (closeUtc <= now) {
      return new Date(closeUtc).toISOString()
    }
  }
  // Fallback — shouldn't reach this on a planet with seven-day weeks.
  return new Date(now - 3 * 86400000).toISOString()
}
