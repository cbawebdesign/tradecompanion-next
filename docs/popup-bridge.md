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

### Already using `data-sym`? Change nothing

Pages the report generator emits already look like this:

```html
<span class="tk" data-sym="DELL">DELL</span>
```

The script picks those up as-is, so **adding the script tag is the whole job** —
no regenerating reports. Legacy elements get the click behaviour only, not the
buttons, because that markup shows up on fifty-row tables where fifty pairs of
buttons would be noise. Want them anyway:

```html
<script>window.TC_EMBED = { controls: 'all' }</script>
```

The page's own click handler keeps running, which is harmless — its direct
`fetch` to `localhost` is the thing that doesn't work from inside a frame, and
that's the whole reason this exists. Leaving it alone also leaves its
"Sent DELL to chart" toast working.

> Note that toast fires whether or not anything happened: the request is
> `mode: "no-cors"` with an `Image()` fallback, and neither can report failure.
> That's why the popup looked like it was working.

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
window.parent.postMessage({ type: 'tc-chart',         symbol: 'AHTPI' }, '*')  // alias
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
  ahkEnabled:   true,
  addedTo:      'Main' }       // only on a tc-watchlist-add reply
```

`addedTo` names the list the symbol actually landed on. Don't infer it from
`onWatchlists` — a symbol on several lists gives no clue which one the click
hit. It is **absent** when there were no watchlists to add to, which is the one
case to report as a failure.

### Which watchlist does `+` use?

The one currently selected in TC, which with a few dozen lists is effectively
arbitrary from the page's point of view. Two ways to be explicit:

```html
<span data-tc-symbol="AHTPI" data-tc-watchlist="Movers">AHTPI</span>
```

or build a picker — every reply carries the full `watchlists` list.

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

## Why not `allow="local-network-access"` on the iframe

It was the other option suggested, and it does not work here.

Local Network Access delegation is only half of it: the local server must also
answer with `Access-Control-Allow-Private-Network`, and the AHK companion
doesn't send it. The permission's name is also still unsettled — MDN documents
`local-network` and `loopback-network`, Chrome-facing docs use
`local-network-access` — and Chrome's enterprise opt-out is being retired after
Chrome 152, so anything built on it has a shelf life.

It is also the wrong shape. Granting it on the popup's iframe would hand local
network access to **every** page the popup shows, including press releases and
SEC filings, to fix a problem that only TC's own pages have.

Letting TC make the call from the top frame — where it already works, because
that is how AHK fires from the timeline today — needs no browser permission, no
server header, and no trust in third-party frames.
