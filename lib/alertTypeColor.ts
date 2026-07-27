// Message text color per alert type. Justin's spec (7/22): color the message
// text by type instead of a separate type column — light-orange Trade Exchange,
// orange Catalyst PRs, blue filings, purple press releases. Single source of
// truth so the timeline + both data-ribbon lists stay consistent.
export function alertTypeTextClass(type: string | undefined | null): string {
  switch ((type || '').toLowerCase()) {
    case 'trade_exchange': return 'text-orange-300'   // light orange
    case 'catalyst':       return 'text-orange-500'   // orange
    case 'filing':         return 'text-blue-400'
    case 'news':           return 'text-purple-400'   // press releases
    case 'tweet':          return 'text-sky-400'
    case 'tradingview':    return 'text-emerald-400'
    case 'scanner':        return 'text-cyan-400'
    case 'price':          return 'text-green-400'
    case 'rss':            return 'text-rose-400'
    case 'mail':           return 'text-teal-300'
    default:               return 'text-gray-200'
  }
}
