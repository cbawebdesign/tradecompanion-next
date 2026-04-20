# Session Notes — 2026-04-17

## Scope
Working from Justin's legacy-TC bug email (5 issues):
1. Filings appearing as Press Releases
2. Ambulance-chaser law firm PR spam
3. RSS Substack + YouTube feeds not working (MAIL works)
4. Startup backfill gaps (PRs, TradingView, RSS)
5. Unwanted alert refetch when mutating watchlist

## Shipped Today

### Phase 1a — Mutation backfill strip (legacy)
- `Services/Alerts/TradeExchange.cs` — `UpdateWatchlist()` no longer refetches `/api/TradeExchangeGet`
- `Services/Alerts/X.cs` — `Refresh_Elapsed` no longer resets `_sinceId=0` or fires `GetAlerts()` on symbol add/remove/flag
- Branch: `fix/pr-blacklist-and-mutation-backfill` on equitydynamics/Trade-Companion

### Phase 1b — Ambulance-chaser PR blacklist (legacy + web)
- New config key `ExcludePRPatterns` (legacy) / `excludePrPatterns` (web) — default hardcoded to the 25-firm pipe-separated string
- Legacy: `Util.DEFAULT_EXCLUDE_PR_PATTERNS` + `Util.BuildExcludePRRegex()`; applied in `PRs.cs` + `FilteredPR.cs`
- Web: `lib/excludePrPatterns.ts` with `buildExcludePrRegex()` + `isBlacklistedPr()`; applied in `useSignalR.ts` and `useNewsHub.ts` BroadcastNews handlers
- Smoke-tested legacy locally — confirmed `PRs: ExcludePRPatterns regex active=True source=default`

### Phase 3b — RSS startup flood fix (legacy)
- `Services/Alerts/RssFeed.cs` — persist seen GUIDs to `~/.config/LX/Alerts/rss_seen_{symbol}.json`, load on constructor
- Parse `<pubDate>` (RFC 822) per item and use as alert timestamp instead of `DateTime.Now` → no more 02:00:48 wall on boot
- Removed the buggy "clear at 500" cap
- Boot 1: 104 MAIL alerts fired with real pubDate timestamps (Apr-17 19:30, 18:30, etc). Boot 2: 0 new alerts.

### Phase 2b — YouTube / Substack / Articles streams (legacy)
- The old miniextensions "RSS" URL (`CZ6qq8FgAymdb3VSS24s`) is disabled by the provider (returns `{"error":true,"message":"This extension is disabled."}`)
- Swapped to Justin's working combined URL (`75x9iQ2umtAWCELXo5ur`, ~500 items) and split into three streams:
  - **YT** — red, filter `youtube.com|youtu.be`, 30-day age cap
  - **SUB** — orange, filter `substack.com`, 60-day age cap
  - **ART** — green, everything else, 30-day age cap
- `RssFeed` gained `linkFilter: Func<string,bool>?` and `maxAgeDays: int` params
- Verified: boot fires SUB=17, YT=8, ART=12 new alerts

### Phase 3a — PR + TradingView backfill diagnosis
- **PR backfill bug found on Jon's endpoint:** `/TC/headlines?since=...` returns exactly 1 item regardless of date value (server-side bug). Without the `since` param, the same endpoint returns ~100 recent items.
- **Fix in PRs.cs:** dropped the `since` query param; filter by `savetime_et` on the client. Matches the pattern `FilteredPR.cs` already uses.
- **TradingView:** endpoint (`/api/tv/alerts`) works correctly — it just returns `[]` for users with no registered webhooks. The "silent failure" was empty data, not broken code.
- **Added explicit logging** to TradingView.cs — logs URL, returned count, and a "no alerts to replay" message when empty.

### Phase 3c-lite — User-editable PR blacklist
- Added `ExcludePRPatterns` field to the legacy `ConfigPage` (textarea, saves via existing config pipeline)
- Added `excludePrPatterns` field to web `SettingsPage` (same pattern, same placeholder)
- Empty string → default 25-firm list; any value overrides
- **Centralized admin dashboard (Azure Function + Cosmos + tc-admin UI) deferred** — editability shipped, centralization can come later

## Parked / Rethought

### Phase 2a — "Filings appearing as Press Releases"
Original hypothesis (Jon's news hub dual-routing filings as BroadcastNews) was wrong. Investigation:
- Pulled multi-day `/tc/headlines` samples → only wire-service PRs (GlobeNewswire), no filing items
- Grepped local PR logs (Mar 15–19) for filing-shaped headlines → **zero matches**
- Grepped Catalyst logs → found real examples: "FVRR Files its Annual Report on Form 20-F", "ICL Files 2025 Annual Report on Form 20-F", "ECDA Announces Intent to File Form 25". ID prefixes are `BIZWIRE_USPR` / `PR_NEWS_USPR` — these are **genuine wire-service PRs** that happen to be about filings.

**Conclusion:** The system is behaving correctly. Justin is seeing legitimate press releases that *announce* filings, not misrouted SEC filing metadata. His `ExcludeFilings` setting correctly blocks actual filing payloads on the `newFiling` channel; the PRs about filings are a separate thing.

**Next step (waiting on Justin):** Ask for the specific headline + symbol that triggered this complaint. If it's a wire PR like the examples above, explain it's expected behavior and offer an opt-in "suppress PRs mentioning filing forms" toggle. A regex heuristic without a concrete case risks false positives on legit catalysts like "FVRR Files 20-F".

### Phase 3c (full admin dashboard) — Deferred
4-repo change (Azure Function endpoint + Cosmos schema + tc-admin UI page + desktop/web boot-time fetch). Not worth the coordination cost until we have >1 client needing centralized control. Phase 3c-lite (editable in each app's Settings) gives Justin the editability he asked for.

### Phase 3d — Deferred (not urgent)
"Since previous close" explicit startup backfill for web. Current setup (per-source hooks' initial fetch + `useAlertAuditor` polling every 60s + dedupKey) already covers this in practice. Adding a third redundant backfill path without user-visible signal of a gap is premature.

## Deploy Status

| Repo | Branch | State | Deploy mechanism |
|---|---|---|---|
| equitydynamics/Trade-Companion | `fix/pr-blacklist-and-mutation-backfill` | Pushed, NOT merged | Justin pulls + builds |
| equitydynamics/Trade-Companion | `fix/rss-mail-startup-flood` | Pushed, NOT merged | Justin pulls + builds |
| cbawebdesign/tradecompanion-next | `fix/pr-blacklist` | Pushed, NOT merged to master | Vercel auto-deploys on merge |
| equitydynamics/TcIsolatedWorker | (no changes) | — | `func publish` when needed |

**Nothing merged yet — Justin tests legacy branches before we merge. Web branch ready to merge once we decide to ship (merging → Vercel auto-deploy).**

## Commands for Justin (Windows)
```
# Pull both legacy branches
cd path/to/Trade-Companion
git fetch
git checkout fix/pr-blacklist-and-mutation-backfill  # or fix/rss-mail-startup-flood
dotnet build TradeCompanion.sln
# run in VS / dotnet run from TradeCompanion/
```

Expected behavior on boot:
- Console prints `PRs: ExcludePRPatterns regex active=True source=default`
- MAIL feed only fires alerts for unseen emails (pubDate-correct timestamps)
- YT/SUB/ART streams populate with content since last 30/60/30 days
- Symbol add/remove/flag does NOT trigger a refetch flood
- `PRs POLL: Got ~100 headlines from API` (not 1)

## Still Pending
- Merge branches to main/master when Justin signs off
- Ping Justin for specific headline that triggered Phase 2a complaint
- (Later) Centralize PR blacklist in Cosmos if a second client needs it
