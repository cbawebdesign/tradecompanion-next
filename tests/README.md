# Tests

**Characterization tests.** These lock in what the code does *today* — bugs
included — so a change that alters behaviour fails here instead of silently on
someone's trading screen.

That framing matters. A failing test does **not** automatically mean the change
is wrong. It means behaviour moved, and you now have to decide whether that was
deliberate. In this codebase that is the whole point: the worst bug it produces
is an alert that never arrives, and nothing else can catch that.

Tests are labelled one of two ways:

- **plain** — this is correct, keep it working
- **`WRONG` / `KNOWN GAP` / `CURRENT BEHAVIOUR`** — this is what the code does
  now, we know it's not what we want, and the test exists so a fix is a
  deliberate act rather than an accident

## What's covered

| File | Covers |
|---|---|
| `alertDedup.test.ts` | Message normalisation, `[Source]`/`[+]` prefix stripping, price-suffix stripping, SEC form-code stripping, match keys |
| `marketCalendar.test.ts` | The "since previous close" helpers — **including where two of them disagree** |
| `excludePrPatterns.test.ts` | Ambulance-chaser blacklist, HTML-entity decoding, precedence, which alert types are exempt |
| `filteredPr.test.ts` | Justin's keyword syntax: `,`/`\|` = OR, `&` = AND, `!` = NOT, `*` = wildcard |
| `storeDedup.test.ts` | `addAlert`/`addAlerts`: dedupKey vs normalised-message matching, the TradingView exemption, the cleared floor, ordering and the 500 cap |
| `storeDelete.test.ts` | Timeline delete hides without erasing the ribbon's copy, and is remembered so the auditor cannot re-inject it |
| `reportSymbol.test.ts` | `SYMBOL: Title` parsing, and which symbols get price-alert boxes |
| `alertColors.test.ts` | The colour table is the single source of truth for alert colours |

## The finding worth reading

`marketCalendar.test.ts` pins a live bug. There are two implementations of
"previous close":

- `lib/marketCalendar.ts` → **yesterday** 4pm ET, always
- `hooks/useAirtablePolling.ts` → the **most recent past** 4pm ET

Before 4pm they agree. **After the close they return different days**, so the
Airtable feeds (RSS / YouTube / Substack) cut off twelve hours later than every
other source and drop items from earlier the same day. That is exactly the 5/19
bug that `prevMarketCloseISO` was written to fix, still live in the second copy.

Two more implementations exist inline in the Catalyst / Filings / TradeExchange
hooks (browser-local time, not ET) and in `useAlertAuditor` (ET midnight, not
previous close). Unifying all four is the follow-up these tests were written to
make safe.

## Running

```
npm test          # once
npm run test:watch
```

Runs in CI on every pull request.

## Not covered yet

React components. The store is now covered: `removeAlert`/`removedAlertKeys` in
`storeDelete.test.ts`, and the admission gate in `storeDedup.test.ts`.
