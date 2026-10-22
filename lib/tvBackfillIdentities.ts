/**
 * Which server-side identities hold webhook alerts this client should see on
 * startup.
 *
 * Justin ("Loose Ends"): "Can TC users get their webhook alerts since the
 * previous close on a restart or backfill? This doesn't seem to be working
 * except for Trading View alerts."
 *
 * Exactly right, and the reason is that the backfill and the live socket were
 * looking up two different people. A webhook alert is stored under the
 * user_id its key is registered against, and the live push goes to
 * Clients.User(that id) — which the client receives because negotiate binds
 * the connection to signalRUserId(config), i.e. the TC login username. The
 * backfill, written earlier, asked instead for `?userid=config.tradingViewId`.
 * Where those two strings happen to match, backfill works; where they differ,
 * or where tradingViewId is blank, it silently returns nothing.
 *
 * The bigger gap is the system webhook. It is stored under "__system__" and
 * pushed live with Clients.All, so every user sees it in real time — and no
 * user has ever had it come back after a restart, because nobody queries that
 * id. On 2026-10-22 there were 14 such alerts since the previous close that no
 * reload could recover.
 *
 * So the backfill now asks for every identity that can legitimately deliver to
 * this client, and merges the results.
 *
 * Deliberately NOT included: 'anonymous'. signalRUserId falls back to it for a
 * session that cannot be attributed to anyone, and it is a bucket, not a
 * person — backfilling it would hand one unauthenticated session another's
 * alerts.
 */

/** The user_id the system webhook endpoint stamps on its rows. */
export const SYSTEM_WEBHOOK_USER = '__system__'

export function tvBackfillIdentities(cfg: {
  userKey?: string
  tradingViewId?: string
}): string[] {
  const out: string[] = []
  const push = (value: string | undefined) => {
    const v = (value || '').trim()
    // Exact-match dedup rather than case-insensitive: Cosmos partition keys
    // are case-sensitive, so "Justin2" and "justin2" are genuinely different
    // partitions and both are worth asking for.
    if (!v || out.includes(v)) return
    out.push(v)
  }

  // Same derivation as signalRUserId, minus the 'anonymous' fallback.
  push((cfg.userKey || '').trim().toLowerCase())
  push(cfg.tradingViewId)
  push(SYSTEM_WEBHOOK_USER)

  return out
}
