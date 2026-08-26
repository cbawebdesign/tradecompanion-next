# Trade Companion — working in this repo

Real-time trading alerts and watchlist management. Next.js 14 (App Router),
React 18, TypeScript, Zustand, Tailwind. Deploys to Vercel on merge to
`master`. Also packaged as an Electron desktop app.

Cursor reads the detailed rules from `.cursor/rules/`. This file is the same
guidance for any other tool — and a decent orientation if you're reading it
yourself.

---

## The one thing to understand first

The people using this app are day traders watching it live during market
hours. The worst bug this codebase can produce is **an alert that never
appears** — no error, no red screen, nothing on the page that looks wrong. A
missed catalyst on an open position costs real money, and nobody finds out
until it's too late to matter.

That asymmetry drives every rule below. Code that makes *fewer* alerts show up
is guilty until proven innocent.

---

## Where things are

    app/page.tsx      tab shell — 1 Alerts, 2 Watchlist, 3 Scanner, 4 Themes, 5 Settings
    app/api/          server-side routes (keeps API keys off the client)
    app/pop/          pop-out windows, synced via BroadcastChannel
    components/       all UI, one file per surface
    hooks/            one hook per data source — alerts are born here
    lib/              pure helpers: dedup, filtering, colors, formatting
    store/useStore.ts the whole Zustand store, single file
    types/index.ts    Alert, AppConfig, Watchlist

Run it: `npm run dev`. Type-check everything: `npm run build` — worth doing
before opening a PR, since it catches most of what breaks here.

---

## Ask before touching these

Each has already caused a production incident:

- `hooks/useCosmosSync.ts` — sync/restore. Wiped every alert subscription on
  re-login once, orphaned watchlists another time
- `store/useStore.ts` → `addAlert` / `addAlerts` — cross-source dedup
- `lib/alertDedup.ts` — message normalisation and match keys
- `hooks/useSignalR.ts`, `hooks/useNewsHub.ts` — live alert ingestion
- `lib/marketCalendar.ts` and the per-source `since` windows — got this wrong
  before and hid a whole session of news
- anything touching `userKey`, auth or identity

For these: propose the change and explain it. Don't apply it.

**Never "simplify" a filter, a dedup check or a date comparison.** Those
conditions look over-complicated because each clause fixes a specific reported
bug. Deleting one reads as a tidy-up in review and silently drops alerts in
production.

---

## Conventions that bite if you miss them

**Every alert needs a `dedupKey`.** The same alert arrives via SignalR, REST
poll and the 60-second auditor. Follow the existing `source:id` shape —
`pr:{storyId}`, `filing:{cik}-{dcn}`, `tweet:{id}:{symbol}`. Never build one
from `Date.now()`; that defeats the whole mechanism.

**Alert colors are inline hex, not Tailwind classes.** Tailwind's content scan
covers `app/` and `components/` only, so class names written in `lib/` get
purged from the bundle. This actually shipped — every alert type lost its color
except filings. See `lib/alertTypeColor.ts`.

**Use the theme CSS variables**, never a literal color in a component. There
are five themes; a hardcoded hex looks correct in the default and breaks the
other four. `var(--bg-glass)`, `var(--text-primary)`, `var(--accent-primary)`
and friends are in `app/globals.css`, along with `.glass-panel` and the other
reusable classes.

**Anywhere a symbol appears** it must support flag/unflag, right-click → add to
watchlist, and AHK fire on click or spacebar. All three, every surface.

**Wrap outbound URLs in `proxyUrl()`.** Local dev CORS-fails against every
backend otherwise. A new origin needs adding to both `lib/proxyUrl.ts` and the
rewrites in `next.config.js`.

**It's a trading terminal, not a marketing page.** Rows are deliberately tight
(26px in the alert bar). Don't add padding or whitespace for readability —
density is the point.

---

## Making a change

Branch, PR, let CI run, check the Vercel preview URL, then merge. Don't merge
to `master` between 09:15 and 16:15 ET on a trading day — that deploys
straight into a live session. Previews are fine at any hour.

If something goes wrong in production: roll back in Vercel first, diagnose
second.
