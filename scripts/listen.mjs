// Live SignalR listener — connects to the production hub as an anonymous user
// and prints every frame it receives. Read-only: it subscribes and listens,
// never invokes anything that mutates.
//
//   node scripts/listen.mjs [seconds]
//
// Use it to answer "is the scanner actually broadcasting?" and "what shape are
// the frames?" without needing to log into the app.
import { HubConnectionBuilder } from '@microsoft/signalr'

const BASE = 'https://tradecompanion3.azurewebsites.net'
const SECONDS = Number(process.argv[2] || 60)

const et = () => new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
const counts = {}
const bump = (k) => { counts[k] = (counts[k] || 0) + 1 }

const r = await fetch(`${BASE}/api/negotiate?userId=anonymous`)
if (!r.ok) { console.error('negotiate failed', r.status); process.exit(1) }
const n = await r.json()
const url = n.url || n.Url
const token = n.accessToken || n.AccessToken
console.log('negotiate OK ->', String(url).split('?')[0])

const conn = new HubConnectionBuilder()
  .withUrl(url, { accessTokenFactory: () => token })
  .withAutomaticReconnect()
  .build()

// Every frame the app listens for.
const EVENTS = [
  'ScannerAlert', 'gainScanner', 'BroadcastNews', 'newFiling',
  'tradingViewAlertRaw', 'TradeExchangePost', 'catalyst', 'BroadcastQuotes',
]
for (const ev of EVENTS) {
  conn.on(ev, (data) => {
    bump(ev)
    if (ev === 'BroadcastQuotes') return // far too chatty to print
    const s = JSON.stringify(data)
    console.log(`[${et()}] ${ev}: ${s.length > 260 ? s.slice(0, 260) + '…' : s}`)
  })
}

await conn.start()
console.log(`connected. listening ${SECONDS}s — ET now ${et()}`)
console.log('scanner window is 04:00–20:00 ET\n')

await new Promise((res) => setTimeout(res, SECONDS * 1000))
await conn.stop()

console.log('\n--- frames received ---')
const keys = Object.keys(counts)
if (!keys.length) console.log('(none)')
else for (const k of keys.sort()) console.log(`${String(counts[k]).padStart(6)}  ${k}`)
