/**
 * The message protocol a page shown in TC's popup can use to drive TC.
 *
 * Justin (10/24): "it would be absolutely amazing if auto hotkey could work
 * when clicking a symbol in a pop up window (when I code the URL to be able to
 * do so) and then add a flag / unflag button next to the symbol along with a
 * '+' to add the symbol to a watch list … I would then just include whatever
 * code is needed to the pages I make that appear in the pop up windows."
 *
 * So TC exposes the verbs and his pages call them. public/tc-embed.js is the
 * drop-in that renders the buttons and speaks this protocol, for pages that do
 * not want to implement it by hand.
 *
 * WHY THIS IS SAFE TO EXPOSE
 *
 * A popup frame can already post `tc-open-url`, which only ever opens a tab.
 * These verbs MUTATE state — a watchlist, a flag — so an arbitrary third-party
 * page framed in the popup (a press release, an SEC filing) must not be able to
 * reach them. Two independent checks, both applied by the caller in
 * ReportPopup:
 *
 *   1. the message must come from THIS popup's frame (event.source), and
 *   2. event.origin must be a tradecompanion.com origin.
 *
 * (2) works because his pages are framed DIRECTLY — see lib/embeddableUrl,
 * where research.tradecompanion.com is deliberately not proxied — so the frame
 * keeps its real origin and the browser reports it honestly. Pages served
 * through /api/embed are sandboxed WITHOUT allow-same-origin, so they report
 * origin "null" and fail the check by construction. That is the desired
 * outcome: TC's own pages get the verbs, everything else gets `tc-open-url`
 * and nothing more.
 *
 * Neither check can be spoofed from inside a frame: both are set by the
 * browser, not by the sender.
 */

/**
 * Rows whose "symbol" is a source tag rather than a ticker. Shared with
 * AlertBar so a flag or a watchlist add can never be made against one of
 * these — that is where the list came from.
 */
export const NON_SYMBOLS = new Set(['RSS', 'MAIL', 'YT', 'SUB', 'NEWS', 'N/A', ''])

export const isRealSymbol = (s: string | undefined | null): s is string =>
  !!s && !NON_SYMBOLS.has(s.toUpperCase())

/**
 * Accept a ticker from an embedded page, or reject it.
 *
 * Tighter than the timeline's parsing on purpose: these messages add rows to
 * watchlists, so the bound matters more than the recall. Upper-cased, `$`
 * cashtag stripped, and shaped like a ticker — which still admits BRK.B,
 * crypto pairs (BTCUSD) and futures (ES1!).
 */
export function normalizeBridgeSymbol(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const sym = raw.trim().replace(/^\$/, '').toUpperCase()
  if (!/^[A-Z][A-Z0-9.\-!]{0,9}$/.test(sym)) return null
  if (!isRealSymbol(sym)) return null
  return sym
}

export type BridgeRequest =
  /** Open a link in a real browser window. Already supported; unchanged. */
  | { type: 'tc-open-url'; url: string }
  /**
   * Behave as if the symbol had been clicked in TC: select it, fire AHK.
   *
   * `tc-chart` is accepted as an alias and normalised to this. Justin's bot
   * proposed that name to him verbatim — "window.parent.postMessage({type:
   * 'tc-chart', symbol:'ZS'}, '*')" — so a page written from that advice must
   * work without him having to notice TC calls it something else.
   */
  | { type: 'tc-symbol-click'; symbol: string }
  /** `on` omitted toggles; true/false sets it outright, so a button is idempotent. */
  | { type: 'tc-flag'; symbol: string; on?: boolean }
  /** `watchlist` names one; omitted means the one currently selected in TC. */
  | { type: 'tc-watchlist-add'; symbol: string; watchlist?: string }
  /** Ask for the current state, so a page can paint its buttons on load. */
  | { type: 'tc-query'; symbol: string }
  /**
   * Ask for the watchlist names alone, with no symbol in hand.
   *
   * tc-state has carried `watchlists` since the bridge shipped, but that
   * requires a symbol to ask about. A page building an "Add to…" menu has no
   * symbol at that moment, so this is the query his bot actually needed.
   */
  | { type: 'tc-watchlists' }

/** What TC sends back after any verb, and in answer to tc-query. */
export interface BridgeState {
  type: 'tc-state'
  symbol: string
  flagged: boolean
  /** Names of every watchlist the symbol is on — [] when it is on none. */
  onWatchlists: string[]
  /**
   * Every watchlist name, in the SAME ORDER as the app's own "Add to" menu —
   * his bot asked for that explicitly, and picking by position against a
   * different order is how a symbol lands on the wrong list. See
   * lib/watchlistOrder.
   */
  watchlists: string[]
  /** False when AHK is off or unconfigured, so a page can hide the affordance. */
  ahkEnabled: boolean
  /**
   * Set only on the reply to tc-watchlist-add: the list the symbol actually
   * landed on. Present even when it was already there, so a page can say
   * where without re-deriving it.
   *
   * Inferring this from onWatchlists does not work — a symbol on several
   * lists gives no clue which one this click targeted.
   *
   * Absent when there were no watchlists to add to, which is the one case a
   * page should report as a failure.
   */
  addedTo?: string
}

/**
 * Validate an inbound message. Returns null for anything unrecognised, which
 * is most of what arrives — React DevTools, Next.js HMR and any other script
 * on the page all postMessage to the same window.
 */
export function parseBridgeMessage(data: unknown): BridgeRequest | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const type = d.type

  if (type === 'tc-open-url') {
    // Only ever a web URL. Unchanged from the original handler: this one verb
    // is reachable from untrusted frames, so it stays as narrow as it was.
    return typeof d.url === 'string' && /^https?:\/\//i.test(d.url)
      ? { type: 'tc-open-url', url: d.url }
      : null
  }

  if (type === 'tc-watchlists') return { type: 'tc-watchlists' }

  // His bot's name for it. Normalised here so there is one verb downstream.
  const verb = type === 'tc-chart' ? 'tc-symbol-click' : type

  if (verb === 'tc-symbol-click' || verb === 'tc-query' || verb === 'tc-flag' || verb === 'tc-watchlist-add') {
    const symbol = normalizeBridgeSymbol(d.symbol)
    if (!symbol) return null

    if (verb === 'tc-flag') {
      return typeof d.on === 'boolean'
        ? { type: verb, symbol, on: d.on }
        : { type: verb, symbol }
    }
    if (verb === 'tc-watchlist-add') {
      // A name longer than any real watchlist is a sign of a confused caller,
      // not a watchlist; drop it and fall back to the selected one.
      const watchlist =
        typeof d.watchlist === 'string' && d.watchlist.trim() && d.watchlist.length <= 64
          ? d.watchlist.trim()
          : undefined
      return watchlist ? { type: verb, symbol, watchlist } : { type: verb, symbol }
    }
    return { type: verb, symbol }
  }

  return null
}

/** The answer to tc-watchlists. */
export interface BridgeWatchlists {
  type: 'tc-watchlists'
  lists: string[]
}

/** Verbs that change TC's state, and so require the trusted-origin checks. */
export function isMutatingBridgeRequest(req: BridgeRequest): boolean {
  return req.type === 'tc-flag' || req.type === 'tc-watchlist-add'
}

/**
 * Verbs only TC's own pages may send.
 *
 * tc-symbol-click and tc-query do not write to the store, but they are still
 * restricted: the first fires an HTTP request at the user's local AHK server
 * and moves the selected symbol under them, and the second discloses the
 * user's watchlist names to whatever is framed. Neither belongs to a random
 * press release.
 */
export function isPrivilegedBridgeRequest(req: BridgeRequest): boolean {
  return req.type !== 'tc-open-url'
}
