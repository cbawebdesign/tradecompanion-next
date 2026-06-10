# Trade Companion — Roadmap

The live web app (`trade-companion-next`, Vercel). This is the single source of
truth for what's done, in flight, and queued. Supersedes the older planning HTML
(`CUTOVER-PLAN.html`, `parity-report.html`, etc.), which are stale.

_Last updated: 2026-06-08_

---

## ✅ Shipped
- **Alert subscriptions survive "Pull from server" + sync device-to-device** (commit `2d85c2d`) — subscriptions now sync keyed by watchlist name and rebuild on restore, instead of orphaning when watchlist IDs regenerate.
- Direct Airtable API for RSS / YouTube / Substack (replaced the broken miniextensions feeds).
- **RSS backfill no longer drops items** — raised the initial-load cap (was 5) that truncated legit entries behind the since-previous-close date filter.
- **Watchlist order syncs reliably** — push the complete effective order (was only the partial reorder list) and restore watchlists into that order with IDs set inline.
- **ALL Settings-tab options sync** — every `AppConfig` field now rides a `webConfig` blob (except identity/infra/window-layout); the debounce watches the whole config so nothing is ever silently dropped.
- **Subscription changes flush on close** — modal close + tab-hide flush the pending sync instead of risking the 3s debounce.
- Flagged-list per-type subscriptions with audio + server sync.
- Startup backfill "Loading alerts…" placeholder.

---

## 🟠 P2 — Backfill accuracy
1. **Timeline "100 alerts" cap.** `AlertBar.tsx` display slice (100) + 500 store cap. Should show all relevant alerts since previous close — needs list virtualization to raise safely. _Web-only._
2. **Stale tweets in backfill.** `/api/tweets` filters by tweet-ID, not time — returns old tweets regardless of session. _Backend deploy._
3. **TradingView startup backfill.** Currently only seeds the dedup set; never populates the timeline, so pre-connection TV alerts are invisible. _Web (+ backend `maxItems` passthrough)._
4. **Catalyst/PR zero-backfill on some days.** Likely external source (Scanzzers/SEC) gaps + a prev-close calc mismatch between two helpers. _Investigate._

## 🟢 P3 — Data ribbon (must be 100% accurate)
5. **Over-dedup risk.** Per-symbol dedup is message-only (no type/timestamp), so two genuinely distinct alerts with the same normalized text collapse to one. Page-draining already verified OK (not capped at 100). _Web-only._

---

## 🔵 Backlog — needs code re-verification (from older notes, may be partly done)
- **AHK bridge** — local companion server on Justin's Windows box to launch AutoHotkey scripts on symbol click. Believed previously built; code not located.
- **Symbol alias table** — ES → ES1! (TradingView) / SPY (DAS), per-platform mapping.
- **Alert parity gaps** — FilteredPRs, TradeExchangeFiltered, SignalR real-time for Filings/TradeExchange.
- **Automated alert-comparison testing** — log alerts from legacy + web and diff them (manual testing is off the table).
