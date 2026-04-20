# Trade Companion Next — Session Notes (2026-03-08)

## Work Completed This Session

### 1. Arrow Left/Right Watchlist Tab Switching
- **File**: `components/Watchlist.tsx` (lines 238-251)
- Left arrow → previous watchlist tab, Right arrow → next watchlist tab
- No wrapping (stops at edges, matches legacy behavior)
- Skips when focus is in input/textarea/select (so alert price inputs still work)
- Also added `inInput` guard to existing Space, Delete, ArrowUp/Down handlers

### 2. Right-Click Context Menu on Watchlist Rows
- **File**: `components/Watchlist.tsx` (lines 279-298, 622-672)
- Three options: **Remove**, **Move to...** (submenu), **Copy to...** (submenu)
- Move = remove from current + add to target (preserves alert prices)
- Copy = add to target, keep in current
- Closes on click-away or Escape
- Shows symbol name as header, styled to match dark theme

### 3. Architecture Reference Document
- **File**: `architecture.html` (project root)
- Comprehensive 13-section single-page HTML document
- Mission control / aerospace aesthetic (IBM Plex Mono, dark navy, electric blue accents)
- Collapsible sections, printable, color-coded
- Sections: System Overview, Data Flow Diagrams (quote/alert/auth flows), Component Hierarchy, Hooks Reference, Zustand Store Map, SignalR Events, Networking/Proxy, Theme System, Keyboard Shortcuts, Electron, Pop-out Windows, Type Definitions, API Endpoints

---

## Parity Report — Updated Status

### Already Done (update parity-report.html)
| Feature | Status | Notes |
|---------|--------|-------|
| Arrow Left/Right switch watchlists | **DONE** | Implemented this session |
| Right-click watchlist row → context menu | **DONE** | Implemented this session |
| Move symbol between watchlists | **DONE** | Via context menu |
| Copy symbol to another watchlist | **DONE** | Via context menu |
| Market cap display | **Was already there** | StockDataRibbon.tsx:323, AdminPage.tsx:140, plus min/max filters in Settings |

### Still Missing — Frontend Only (can do now)
| # | Feature | Category | Effort | Notes |
|---|---------|----------|--------|-------|
| 1 | Tab key toggle alert view modes | Keyboard | Small | Legacy toggles between /1 and /2 alert pane modes |
| 2 | Notes per symbol (UI) | Watchlist | Small | Schema exists in WatchlistSymbol type, no UI yet |
| 3 | Replace symbol in-place | Watchlist | Small | Legacy can swap a symbol without remove+add |
| 4 | Text-to-speech announcements | Alerts | Medium | Legacy uses Windows SpeechSynth; web can use Web Speech API |
| 5 | Different sounds per alert type | Alerts | Medium | Currently same 800Hz beep for everything |
| 6 | PR keyword filtering (pos/neg) | Alerts | Medium | FilteredPR.cs logic = regex on headlines, pure frontend |
| 7 | Filing type exclusion | Alerts | Medium | ExcludeFilings config, filter in useFilingsPolling |

### Still Missing — Needs Backend Data (can't do frontend-only)
| # | Feature | Why | Backend Dependency |
|---|---------|-----|-------------------|
| 8 | $100M Dollar Volume alerts | Needs VWAP + TotalVol from L1 quotes | QuoteManager (IQ/LX Feed) |
| 9 | Afternoon Breakout (HOD) | Needs 1s/1m bar streaming + market cap | QuoteManager bar subscription |
| 10 | Catalyst Bar Tracking | Needs 1s bars for 45min post-catalyst + dollar vol accumulation | QuoteManager bar subscription |

**Note**: Items 8-10 were also broken in the legacy app because they depend on the legacy backend's QuoteManager which connects to LX/IQ data feeds. These are NOT Azure Function changes — they're features of the C# desktop backend (`AlertService`) that the web frontend can't replicate without that data stream.

---

## Key Clarification: Legacy PR/Catalyst Status

The legacy desktop app's PR/catalyst features are **also broken right now**:
- `FilteredPR.cs` polls `scanzzers.com/TC/headlines` → **DEAD** (domain down)
- `CatalystScan.cs` connects to `lxhub2.scanzzers.com/signalr` → **DEAD**
- `AlertService.cs` SignalR to `lxhub2.scanzzers.com` → **DEAD** (retrying every 5s silently)

The **only working PR delivery** right now is:
1. Azure Function's `CatalystScannerService` polling `stage.scanzzers.com/TC/headlines` → relays via `BroadcastNews` (when Jon's endpoints work)
2. **NEW** direct NewsHub connection in Next.js app (`stage.news.scanzzers.com/newshub`) — implemented in previous session

The Next.js app is actually **ahead** of the legacy app on PR delivery because of the direct NewsHub WebSocket connection.

---

## Files Modified This Session
- `components/Watchlist.tsx` — Arrow Left/Right, context menu (Remove/Move/Copy), input focus guards
- `architecture.html` — NEW: comprehensive architecture reference document

## Files Modified in Previous Session (still uncommitted)
- `types/index.ts` — Added `newsApiKey` to AppConfig
- `store/useStore.ts` — Added `newsApiKey: ''` to defaults
- `components/SettingsPage.tsx` — News Hub API Key input
- `hooks/useNewsHub.ts` — NEW: JWT-authenticated SignalR to news hub
- `app/providers.tsx` — Wired useNewsHub()
- `next.config.js` — Added `/scanzzers/` proxy rewrite
- `lib/proxyUrl.ts` — Added stage.scanzzers.com proxy mapping
- `components/LoginGate.tsx` — 503 retry logic (3 retries, 2s delay)
- `parity-report.html` — NEW: feature parity comparison dashboard
