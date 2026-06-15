# Sectors & Themes — Implementation Plan

Tracks Justin's "Sectors & Themes" feature across the three TC layers
(backend Azure Functions, tc-admin dashboard, trade-companion-next web app).

_Created 2026-06-14._

## Goal
A clean, powerful macro view: see the hottest sectors/themes in ~real time
(pre/intraday/after-hours), with multi-timeframe performance, favoritable
theme tiles on the Alerts page, and click-through to component symbols — every
symbol flaggable / right-click-to-watchlist / AHK-able.

## Current state (verified 2026-06-14)
- **DB:** Cosmos `StockData` doc, keyed by ticker. Already has `sector` + `theme`
  (strings, **manually keyed by Justin — must be preserved**), plus country,
  marketCap, notes, etc. Whole collection is loaded into an in-memory cache on
  the backend (cheap to aggregate server-side).
- **Editing today:** tc-admin Stock Data Editor → `PUT /tcadmin/stockdata/{ticker}`
  (passes `IsManualOverride:true` for sector/theme).
- **Polygon** wired: prev closes, daily bars, ticker list. `sic_description`
  available (not yet fetched) → candidate source for `genSector`/`genTheme`.
- **Frontend reuse:** tab system (trivial add), flagged-list layout,
  `StockDataRibbon`, flag/right-click-to-watchlist/AHK/spacebar, keyboard nav,
  modal patterns — all reusable.

## The hard part: performance engine
- **Day %** = (last − prevClose)/prevClose — already have the data; works pre/post-market.
- **Open %** = (last − dayOpen)/dayOpen — backend has dayOpen in 1-sec aggregates;
  needs adding to the client quote feed.
- **Week/Month/3mo/6mo/YTD** — NOT stored anywhere. Needs a nightly snapshot job
  storing per-symbol reference closes; theme % = average of component %s.

## Phasing
- **Phase 0 — DB + Admin foundation** (unblocks everything; low risk)
  - Add `genSector`, `genTheme`, `theme2..theme4` to `StockData` (preserve `sector`/`theme`).
  - `SectorThemeConfig` store for per-group "viewable in TC" flag (default visible).
  - Backend read endpoints: list distinct sectors/themes (+counts +visible); symbols-by-group.
  - tc-admin: editor fields + "Sectors & Themes" management page (list instances,
    viewable toggle, drill to symbols, right-click edit).
  - Polygon `sic_description` backfill → `genSector`/`genTheme`.
- **Phase 1 — Themes tab + click-through popup** (core daily value; Day %/Open % only)
- **Phase 2 — Historical engine** (nightly snapshot → week/month/3mo/6mo/YTD)
- **Phase 3 — Favoriting + Alerts tiles** (`favoriteThemes` mirrors `flaggedSymbols`)
- **Phase 4 (Justin's "Phase 2")** — International heat map; econ/earnings calendars; emojis + tile wallpapers.

## Open decisions (do not block Phase 0)
1. Perf-data strategy: nightly snapshot (recommended) vs on-demand; timeframe anchoring (N trading days vs calendar).
2. `genSector`/`genTheme` source: Polygon `sic_description` (wired) vs Finviz taxonomy (more work).
3. Theme slots: `theme2..theme4` (5 labels total) vs `theme2..theme5`.

## Invariant for ALL TC work (Justin)
Anywhere a symbol is shown: must support (1) flag/unflag, (2) right-click → add to
watchlist, (3) AHK fire on click / spacebar.
