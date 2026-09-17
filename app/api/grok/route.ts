import { NextRequest, NextResponse } from 'next/server'

// Server-side proxy for xAI. The key lives in a Vercel env var and never
// reaches the browser — same pattern as app/api/pr/route.ts.
//
// Before this route existed, GrokStockButton called api.x.ai directly from
// the client with config.grokApiKey, which meant the key was readable in
// devtools by anyone with the app open. It also rode the webConfig blob into
// Cosmos (see WEBCONFIG_DENYLIST in useCosmosSync.ts) and down to every
// device that logged in.
const XAI_API_KEY = process.env.XAI_API_KEY || ''
const XAI_URL = 'https://api.x.ai/v1/chat/completions'
const MODEL = 'grok-3-mini'

const SYSTEM_PROMPT =
  'You are a stock research assistant for day traders. Be concise and factual. ' +
  'Always clearly flag if a stock is an ADR or China-based.'

function buildPrompt(symbol: string) {
  return `Give me a quick trader-focused analysis of ${symbol}:

1. **ADR Status**: Is this an ADR? If yes, what's the underlying country?
2. **Country/HQ**: Where is the company headquartered? (Flag China/Hong Kong stocks)
3. **Sector**: What sector/industry?
4. **Market Cap**: Approximate size (nano/micro/small/mid/large/mega cap)?
5. **Red Flags**: Any concerns (dilution risk, delisting risk, low float, etc)?
6. **What They Do**: One sentence on the business.

Be concise. Use bullet points.`
}

export async function POST(request: NextRequest) {
  if (!XAI_API_KEY) {
    return NextResponse.json(
      { error: 'Grok is not configured on the server (XAI_API_KEY is unset).' },
      { status: 503 }
    )
  }

  let symbol = ''
  try {
    const body = await request.json()
    symbol = String(body?.symbol || '').trim().toUpperCase()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Ticker shape only — this string goes into a prompt, so don't let arbitrary
  // text through. Covers plain tickers plus the suffixed forms TC already
  // handles (BRK.B, BCT.TSX, ES1!).
  if (!/^[A-Z0-9]{1,6}([.\-][A-Z0-9]{1,4})?!?$/.test(symbol)) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 })
  }

  try {
    const res = await fetch(XAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildPrompt(symbol) },
        ],
        temperature: 0.5,
        max_tokens: 800,
      }),
    })

    if (!res.ok) {
      // Never surface the upstream body — it can echo request details.
      console.error('Grok upstream error', res.status)
      return NextResponse.json({ error: `Grok error ${res.status}` }, { status: 502 })
    }

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) {
      return NextResponse.json({ error: 'No response from Grok' }, { status: 502 })
    }
    return NextResponse.json({ content })
  } catch {
    return NextResponse.json({ error: 'Failed to reach Grok' }, { status: 502 })
  }
}
