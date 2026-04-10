// AHK (AutoHotKey) companion client
// Calls a tiny local Node server running on Justin's Windows machine
// that launches AHK scripts with the symbol as argument.
//
// Legacy equivalent: ScriptsController.cs -> Process.Start(ahkScript, symbol)
// Web equivalent: fetch('http://localhost:9876/run?symbol=AAPL')

export async function fireAhk(symbol: string, ahkUrl: string): Promise<boolean> {
  if (!symbol || symbol === 'N/A' || symbol === 'RSS' || symbol === 'MAIL') return false

  try {
    const url = `${ahkUrl}/run?symbol=${encodeURIComponent(symbol)}`
    console.log(`AHK: firing for ${symbol}`)
    const response = await fetch(url, { mode: 'no-cors', signal: AbortSignal.timeout(3000) })
    console.log(`AHK: completed for ${symbol}`)
    return true
  } catch (err) {
    // Companion server not running — fall back to clipboard
    console.log(`AHK: companion not available, falling back to clipboard for ${symbol}`)
    try {
      await navigator.clipboard.writeText(symbol)
    } catch { /* clipboard may not be available */ }
    return false
  }
}
