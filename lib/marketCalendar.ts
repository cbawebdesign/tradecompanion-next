/**
 * The 4pm ET close of the trading day strictly BEFORE today.
 *
 * Used as the `since` param for /AlertsBySymbol so the data ribbon shows
 * the full current-session news flow (premarket + intraday + after-hours)
 * regardless of when the user opens TC.
 *
 * Justin's bug (5/19, 8:31 PM ET): "previous close" was implemented as
 * "most recent past 4pm ET", so opening TC after-hours on a weekday
 * filtered out everything from earlier that same session — a 13:45 VUZI
 * PR and morning INM filings disappeared. Trader expectation is to see
 * the whole session of news whether you check at 9am, 2pm, or 9pm.
 *
 * Algorithm: take yesterday in ET, walk back over weekends until we hit
 * a weekday, return that day at 4pm ET.
 *
 * Holidays not currently modeled. A Tuesday after a Monday holiday will
 * return Monday 4pm — slightly over-inclusive but acceptable (the goal
 * is to not LOSE events, never to be precise about the calendar).
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

  // Start from YESTERDAY in ET, walk back across weekends until we hit a
  // weekday. We deliberately never return today's 4pm even when it's already
  // past — the user still wants to see today's session news in the ribbon.
  for (let dayOffset = 1; dayOffset < 8; dayOffset++) {
    const { yyyymmdd, dow } = getETDateParts(now - dayOffset * 86400000)
    if (dow === 'Sat' || dow === 'Sun') continue
    return new Date(et4pmAsUtcMs(yyyymmdd)).toISOString()
  }
  // Fallback — shouldn't reach this on a planet with seven-day weeks.
  return new Date(now - 3 * 86400000).toISOString()
}
