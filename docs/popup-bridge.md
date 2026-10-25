# Driving TC from a page inside the popup

A page shown in TC's popup can select a symbol, fire AutoHotkey, flag, and add
to a watchlist.

Justin (10/24): *"it would be absolutely amazing if auto hotkey could work when
clicking a symbol in a pop up window … and then add a flag / unflag button next
to the symbol along with a '+' to add the symbol to a watch list … I would then
just include whatever code is needed to the pages I make."*

## The easy way

```html
<script src="https://trade-companion-next.vercel.app/tc-embed.js"></script>
...
<span data-tc-symbol="AHTPI">AHTPI</span>
```

That renders a flag toggle and a `+` next to the ticker, makes the ticker
itself clickable, and keeps the flag showing TC's real state.

| attribute | effect |
|---|---|
| `data-tc-symbol="AHTPI"` | mark a ticker (falls back to the element's text) |
| `data-tc-watchlist="Movers"` | `+` adds to that list instead of the selected one |
| `data-tc-controls="off"` | clickable ticker, no buttons |

Page-wide, set **before** the script tag:

```html
<script>window.TC_EMBED = { controls: false, click: true }</script>
```

Building your own UI? The script also exposes:

```js
TradeCompanion.select('AHTPI')              // select + fire AHK
TradeCompanion.flag('AHTPI')                // toggle
TradeCompanion.flag('AHTPI', true)          // set outright (idempotent)
TradeCompanion.addToWatchlist('AHTPI')      // currently selected watchlist
TradeCompanion.addToWatchlist('AHTPI', 'Movers')
TradeCompanion.query('AHTPI')               // ask for current state
```

Outside TC's popup the script does nothing — no buttons, no listeners — so the
same page still works opened in a normal tab.

## The raw protocol

`tc-embed.js` is a convenience, not a dependency. Post these to `window.parent`:

```js
window.parent.postMessage({ type: 'tc-symbol-click',  symbol: 'AHTPI' }, '*')
window.parent.postMessage({ type: 'tc-flag',          symbol: 'AHTPI' }, '*')          // toggle
window.parent.postMessage({ type: 'tc-flag',          symbol: 'AHTPI', on: true }, '*')
window.parent.postMessage({ type: 'tc-watchlist-add', symbol: 'AHTPI' }, '*')
window.parent.postMessage({ type: 'tc-watchlist-add', symbol: 'AHTPI', watchlist: 'Movers' }, '*')
window.parent.postMessage({ type: 'tc-query',         symbol: 'AHTPI' }, '*')
window.parent.postMessage({ type: 'tc-open-url',      url: 'https://…' }, '*')
```

TC answers every one of them with the symbol's state, so a page can paint its
buttons without tracking anything itself:

```js
{ type: 'tc-state', symbol: 'AHTPI',
  flagged: true,
  onWatchlists: ['Main'],      // [] when on none
  watchlists:   ['Main', 'Movers'],
  ahkEnabled:   true }
```

There is no push: TC replies to what you send, it does not broadcast changes
made elsewhere in the app. Send `tc-query` if you need to re-sync.

## Why only your pages can do this

These verbs touch real data, so the popup accepts them only when **both** hold:

1. the message came from the popup's own frame (`event.source`), and
2. `event.origin` is a `tradecompanion.com` origin.

Both are set by the browser and cannot be forged from inside a frame.

This works because TC frames your subdomains **directly** rather than through
`/api/embed` — see `lib/embeddableUrl`, where `research.tradecompanion.com` is
deliberately kept off `PROXY_HOSTS`. A directly framed page keeps its real
origin. Anything proxied is sandboxed without `allow-same-origin`, reports its
origin as `"null"`, and fails check 2 by construction.

So a press release or an SEC filing shown in the same popup gets `tc-open-url`
and nothing else. **If a page of yours ever starts being proxied, its buttons
stop working** — that is the trade for the gate being this simple.

Symbols are validated before anything happens: upper-cased, `$` stripped, and
shaped like a ticker. Source tags the timeline refuses (`RSS`, `MAIL`, `YT`,
`SUB`, `NEWS`, `N/A`) are refused here too, from the same shared list, so a
stray row can't end up on a watchlist.
