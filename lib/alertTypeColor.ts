// Alert display color. Returned as a HEX string applied via inline style —
// NOT a Tailwind class — because this lives in lib/ which Tailwind's content
// scan doesn't cover, so class names here would be purged from the CSS (that's
// the bug where only filings stayed colored). Inline hex also matches how the
// symbol is already colored (style={{ color: alert.color }}), so the message
// text follows the symbol's color as Justin asked.

// Type → hex (Justin's spec: light-orange Trade Exchange, orange Catalyst,
// blue Filings, purple Press Releases; sensible colors for the rest).
export function alertTypeColorHex(type: string | undefined | null): string {
  switch ((type || '').toLowerCase()) {
    case 'trade_exchange': return '#fdba74' // light orange
    case 'catalyst':       return '#f97316' // orange
    case 'filing':         return '#60a5fa' // light blue
    case 'news':           return '#2563eb' // darker blue (press releases — Justin: purple was hard to read)
    case 'tweet':          return '#38bdf8' // sky
    case 'tradingview':    return '#34d399' // emerald
    case 'scanner':        return '#22d3ee' // cyan
    case 'price':          return '#4ade80' // green
    case 'rss':            return '#fb7185' // rose
    case 'mail':           return '#5eead4' // teal
    default:               return '#e5e7eb' // light gray
  }
}

// The color to render an alert's symbol AND message in — the alert's own color
// when set (live alerts), otherwise the type color (DB/ribbon alerts have no
// per-alert color). Using the SAME value for symbol + message makes them match.
export function alertDisplayColor(alert: { color?: string | null; type?: string | null }): string {
  const c = (alert.color || '').trim()
  return c ? c : alertTypeColorHex(alert.type)
}
